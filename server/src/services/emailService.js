import { z } from 'zod';
import { BrevoClient, BrevoError, BrevoTimeoutError } from '@getbrevo/brevo';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

import { templates } from './emailTemplates.js';
export { templates };


const recipient = z.string().email().max(254);
const oneLine = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();

function classify(err) {
  if (err instanceof BrevoTimeoutError) return 'TIMEOUT';
  const status = err instanceof BrevoError ? err.statusCode : undefined;
  if (status === 401 || status === 403) return 'PROVIDER_AUTH'; 
  if (status) return 'PROVIDER_REJECTED';
  return 'NETWORK_ERROR';
}

export function createEmailService({ client, config = {}, log = logger } = {}) {
  const cfg = {
    apiKey: env.BREVO_API_KEY, senderEmail: env.BREVO_SENDER_EMAIL, senderName: env.BREVO_SENDER_NAME,
    timeoutMs: env.BREVO_TIMEOUT_MS, isProd: env.isProd, devLogBody: env.EMAIL_DEV_LOG_BODY, ...config,
  };
  const configured = Boolean(cfg.apiKey && cfg.senderEmail);
  let brevo = client;
  const getClient = () => (brevo ??= new BrevoClient({ apiKey: cfg.apiKey, timeoutInSeconds: cfg.timeoutMs / 1000, maxRetries: 0, ...(cfg.fetch ? { fetch: cfg.fetch } : {}) }));

  async function sendEmail({ to, template, data }) {
    const build = templates[template];
    if (!build) throw new Error(`Unknown email template: ${template}`);
    const { subject, text, html } = build(data ?? {});
    const cleanSubject = oneLine(subject);

    if (!configured) {
      if (cfg.isProd) { log.error({ template }, 'Email not sent: Brevo is not configured'); return { accepted: false, reason: 'EMAIL_NOT_CONFIGURED' }; }
      log.info({ template, subject: cleanSubject, ...(cfg.devLogBody ? { to, body: text } : {}) }, 'DEV EMAIL (Brevo not configured; nothing was sent)');
      return { accepted: false, reason: 'EMAIL_NOT_CONFIGURED' };
    }
    if (!recipient.safeParse(to).success) { log.warn({ template }, 'Email not sent: invalid recipient address'); return { accepted: false, reason: 'INVALID_RECIPIENT' }; }

    for (let attempt = 1; ; attempt += 1) try {
      const res = await getClient().transactionalEmails.sendTransacEmail({
        sender: { email: cfg.senderEmail, name: cfg.senderName },
        to: [{ email: to }],
        subject: cleanSubject,
        htmlContent: html,
        textContent: text,
        tags: [template],
      }, { maxRetries: 0, timeoutInSeconds: cfg.timeoutMs / 1000 });
      const messageId = res?.messageId ?? res?.messageIds?.[0];
      log.info({ template, messageId }, 'Email accepted by Brevo (delivery not confirmed)');
      return { accepted: true, messageId };
    } catch (err) {
      const refused = err instanceof BrevoError && (err.statusCode === 429 || err.statusCode === 503);
      if (refused && attempt < 2) { await new Promise((r) => setTimeout(r, cfg.retryDelayMs ?? 700)); continue; }
      const reason = classify(err);
      const providerCode = typeof err?.body?.code === 'string' ? err.body.code.slice(0, 40) : undefined;
      log.error({ template, reason, status: err?.statusCode, providerCode }, 'Email send failed'); // never the error object: it can carry request/response details
      return { accepted: false, reason };
    }
  }
  return { sendEmail, configured };
}

const defaultService = createEmailService();
export const sendEmail = (args) => defaultService.sendEmail(args);

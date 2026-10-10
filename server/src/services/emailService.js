import { z } from 'zod';
import { BrevoClient, BrevoError, BrevoTimeoutError } from '@getbrevo/brevo';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// Provider-agnostic boundary. Callers use sendEmail({to, template, data}) only.
// Template text is unchanged from the SMTP era; Brevo needs an HTML part too, which is derived from this text (see textToHtml).
export const templates = {
  verifyEmail: ({ link }) => ({
    subject: 'Verify your Nessence account',
    text: `Welcome to Nessence.\n\nConfirm your email address to finish creating your account:\n${link}\n\nThis link expires in 24 hours. If you did not create an account you can ignore this message.`,
  }),
  orderConfirmation: ({ orderNumber, total, link }) => ({
    subject: `Your Nessence order ${orderNumber}`,
    text: `Thank you for your order.\n\nOrder ${orderNumber}\nTotal paid: ${total}\n\nTrack it here:\n${link}`,
  }),
  orderStatus: ({ orderNumber, phrase, link }) => ({
    subject: `Order ${orderNumber} ${phrase}`,
    text: `Your Nessence order ${orderNumber} ${phrase}.\n\nTrack it here:\n${link}`,
  }),
  newsletterConfirm: ({ link }) => ({ subject: 'Confirm your Nessence subscription', text: `Please confirm you would like to hear from Nessence about new arrivals and restocks:\n${link}\n\nIf you did not ask for this, ignore this email and you will not be subscribed.` }),
  newsletterWelcome: ({ link }) => ({ subject: 'You are on the list', text: `Thanks for subscribing to Nessence.\n\nYou can unsubscribe at any time:\n${link}` }),
  contactReceived: ({ name, subject }) => ({ subject: 'We have received your message', text: `Hi ${name},\n\nThanks for getting in touch about "${subject}". Our team usually replies within 2 working days.\n\nNessence Customer Care` }),
  supportReply: ({ name, subject, message }) => ({ subject: `Re: ${subject}`, text: `Hi ${name},\n\n${message}\n\nNessence Customer Care` }),
  resetPassword: ({ link }) => ({
    subject: 'Reset your Nessence password',
    text: `We received a request to reset your password.\n\nChoose a new password here:\n${link}\n\nThis link expires in 1 hour. If you did not request this, no action is needed.`,
  }),
};

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const URL_RE = /https?:\/\/(?:(?!&(?:quot|#39|lt|gt);)[^\s])+/g;

// Same words as the plain-text body. Everything (including user-controlled names, subjects and messages) is escaped FIRST;
// only absolute http(s) URLs are then turned into links. Blank line = paragraph, newline = <br>.
export function textToHtml(text) {
  const body = String(text).split(/\n{2,}/).map((para) => `<p style="margin:0 0 16px">${escapeHtml(para).replace(URL_RE, (u) => `<a href="${u}">${u}</a>`).replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html lang="en"><body style="margin:0;padding:24px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#181510">${body}</body></html>`;
}

const recipient = z.string().email().max(254);
const oneLine = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();

// Failure classes returned to callers. Nothing from the provider (message, body, headers) is passed through.
function classify(err) {
  if (err instanceof BrevoTimeoutError) return 'TIMEOUT';
  const status = err instanceof BrevoError ? err.statusCode : undefined;
  if (status === 401 || status === 403) return 'PROVIDER_AUTH'; // bad key, unverified sender or IP restriction: an operator problem
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'PROVIDER_UNAVAILABLE';
  if (status) return 'PROVIDER_REJECTED';
  return 'NETWORK_ERROR';
}

// `client` is injectable so tests can run against a mocked Brevo API.
export function createEmailService({ client, config = {}, log = logger } = {}) {
  const cfg = {
    apiKey: env.BREVO_API_KEY, senderEmail: env.BREVO_SENDER_EMAIL, senderName: env.BREVO_SENDER_NAME,
    timeoutMs: env.BREVO_TIMEOUT_MS, isProd: env.isProd, devLogBody: env.EMAIL_DEV_LOG_BODY, ...config,
  };
  const configured = Boolean(cfg.apiKey && cfg.senderEmail);
  let brevo = client;
  // maxRetries: 0 is deliberate. The SDK retries 408/429/5xx by default, and a retried send can deliver the same message twice.
  const getClient = () => (brevo ??= new BrevoClient({ apiKey: cfg.apiKey, timeoutInSeconds: cfg.timeoutMs / 1000, maxRetries: 0, ...(cfg.fetch ? { fetch: cfg.fetch } : {}) }));

  async function sendEmail({ to, template, data }) {
    const build = templates[template];
    if (!build) throw new Error(`Unknown email template: ${template}`);
    const { subject, text } = build(data);
    const cleanSubject = oneLine(subject);

    if (!configured) {
      if (cfg.isProd) { log.error({ template }, 'Email not sent: Brevo is not configured'); return { accepted: false, reason: 'EMAIL_NOT_CONFIGURED' }; }
      // Development only. Links and tokens are written to the log only when EMAIL_DEV_LOG_BODY=true.
      log.info({ template, subject: cleanSubject, ...(cfg.devLogBody ? { to, body: text } : {}) }, 'DEV EMAIL (Brevo not configured; nothing was sent)');
      return { accepted: false, reason: 'EMAIL_NOT_CONFIGURED' };
    }
    if (!recipient.safeParse(to).success) { log.warn({ template }, 'Email not sent: invalid recipient address'); return { accepted: false, reason: 'INVALID_RECIPIENT' }; }

    try {
      const res = await getClient().transactionalEmails.sendTransacEmail({
        sender: { email: cfg.senderEmail, name: cfg.senderName },
        to: [{ email: to }],
        subject: cleanSubject,
        htmlContent: textToHtml(text),
        textContent: text,
        tags: [template], // lets you find these messages in Brevo's logs without exposing recipient data here
      }, { maxRetries: 0, timeoutInSeconds: cfg.timeoutMs / 1000 });
      const messageId = res?.messageId ?? res?.messageIds?.[0];
      // "Accepted" means Brevo took the message. It says nothing about the inbox: check Brevo's logs/webhooks for delivery.
      log.info({ template, messageId }, 'Email accepted by Brevo (delivery not confirmed)');
      return { accepted: true, messageId };
    } catch (err) {
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

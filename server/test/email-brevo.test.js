import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:1/x', LOG_LEVEL: 'silent', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40) });
const { createEmailService, templates, textToHtml } = await import('../src/services/emailService.js');

const KEY = 'xkeysib-TESTKEY-1234';
const LINK = 'https://shop.nessence.test/reset-password?token=SECRETTOKEN123';
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

// Records every logger call so we can prove nothing sensitive is written.
const capture = () => { const lines = []; const mk = (lvl) => (...a) => lines.push([lvl, JSON.stringify(a)]); return { lines, error: mk('error'), warn: mk('warn'), info: mk('info') }; };
// A mocked Brevo HTTP API. The REAL SDK runs on top of it (URL building, auth header, JSON, error classes, retry and timeout logic).
function brevoApi(handler) {
  const calls = [];
  const fetch = async (url, init) => { const body = init?.body ? JSON.parse(init.body) : undefined; calls.push({ url: String(url), method: init?.method, headers: Object.fromEntries(new Headers(init?.headers)), body }); return handler(calls.length, init); };
  return { fetch, calls };
}
const service = (api, extra = {}, log = capture()) => ({ log, ...createEmailService({ config: { apiKey: KEY, senderEmail: 'no-reply@nessence.test', senderName: 'Nessence', timeoutMs: 2000, isProd: false, fetch: api.fetch, ...extra }, log }) });

test('sends one POST to Brevo\'s transactional endpoint with sender, recipient, subject, text and escaped HTML', async () => {
  const api = brevoApi(() => json(201, { messageId: '<abc@smtp.example>' }));
  const { sendEmail } = service(api);
  const r = await sendEmail({ to: 'ananya@example.com', template: 'resetPassword', data: { link: LINK } });
  assert.deepEqual(r, { accepted: true, messageId: '<abc@smtp.example>' });
  assert.equal(api.calls.length, 1);
  const c = api.calls[0];
  assert.equal(c.method, 'POST'); assert.equal(new URL(c.url).origin + new URL(c.url).pathname, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(c.headers['api-key'], KEY);
  assert.deepEqual(c.body.sender, { email: 'no-reply@nessence.test', name: 'Nessence' });
  assert.deepEqual(c.body.to, [{ email: 'ananya@example.com' }]);
  assert.equal(c.body.subject, 'Reset your Nessence password');
  assert.equal(c.body.textContent, templates.resetPassword({ link: LINK }).text); // text body is exactly the existing template
  assert.ok(c.body.htmlContent.includes(`<a href="${LINK}">`)); assert.deepEqual(c.body.tags, ['resetPassword']);
});

test('every existing template still renders the same subject and text', () => {
  assert.deepEqual(Object.keys(templates).sort(), ['contactReceived', 'newsletterConfirm', 'newsletterWelcome', 'orderConfirmation', 'orderStatus', 'resetPassword', 'supportReply', 'verifyEmail']);
  assert.equal(templates.orderConfirmation({ orderNumber: 'NS-2610-AB12CD', total: '₹9,400', link: 'L' }).subject, 'Your Nessence order NS-2610-AB12CD');
  assert.equal(templates.supportReply({ name: 'A', subject: 'Size', message: 'Hello' }).subject, 'Re: Size');
  assert.match(templates.verifyEmail({ link: 'L' }).text, /This link expires in 24 hours/);
  assert.match(templates.resetPassword({ link: 'L' }).text, /expires in 1 hour/);
});

test('user-controlled values are HTML-escaped; only http(s) URLs become links; subjects cannot carry newlines', async () => {
  const evil = '<img src=x onerror=alert(1)> & "q" javascript:alert(1)';
  const html = textToHtml(templates.supportReply({ name: evil, subject: 's', message: `${evil}\nsee https://ok.example/a?x=1&y=2` }).text);
  assert.ok(!html.includes('<img') && html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('href="javascript'));
  assert.ok(html.includes('<a href="https://ok.example/a?x=1&amp;y=2">'));
  const api = brevoApi(() => json(201, { messageId: 'm' }));
  await service(api).sendEmail({ to: 'a@b.test', template: 'supportReply', data: { name: 'A', subject: 'Line1\r\nBcc: x@evil.test', message: 'm' } });
  assert.ok(!/[\r\n]/.test(api.calls[0].body.subject));
});

test('provider rejection / auth / rate limit / outage are classified and returned, never thrown', async () => {
  for (const [status, reason] of [[400, 'PROVIDER_REJECTED'], [401, 'PROVIDER_AUTH'], [403, 'PROVIDER_AUTH'], [422, 'PROVIDER_REJECTED'], [429, 'RATE_LIMITED'], [500, 'PROVIDER_UNAVAILABLE'], [503, 'PROVIDER_UNAVAILABLE']]) {
    const api = brevoApi(() => json(status, { code: 'some_code', message: 'secret detail a@b.test' }));
    const r = await service(api).sendEmail({ to: 'a@b.test', template: 'verifyEmail', data: { link: LINK } });
    assert.deepEqual(r, { accepted: false, reason }, String(status));
  }
});

test('NO duplicate sends: a 5xx or 429 is attempted exactly once (SDK retries are disabled)', async () => {
  for (const status of [500, 502, 503, 504, 429, 408]) {
    const api = brevoApi(() => json(status, { code: 'x', message: 'y' }, status === 429 ? { 'retry-after': '1' } : {}));
    await service(api).sendEmail({ to: 'a@b.test', template: 'resetPassword', data: { link: LINK } });
    assert.equal(api.calls.length, 1, `status ${status} was retried`);
  }
});

test('network errors and timeouts are bounded and reported', async () => {
  const net = service(brevoApi(() => { throw new TypeError('fetch failed'); }));
  assert.deepEqual(await net.sendEmail({ to: 'a@b.test', template: 'verifyEmail', data: { link: LINK } }), { accepted: false, reason: 'NETWORK_ERROR' });
  const hang = brevoApi((_n, init) => new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
  const t0 = Date.now();
  const r = await service(hang, { timeoutMs: 80 }).sendEmail({ to: 'a@b.test', template: 'verifyEmail', data: { link: LINK } });
  assert.deepEqual(r, { accepted: false, reason: 'TIMEOUT' }); assert.ok(Date.now() - t0 < 1500); assert.equal(hang.calls.length, 1);
});

test('missing credentials: nothing is sent, the caller is told, dev logs omit links by default', async () => {
  const api = brevoApi(() => json(201, {}));
  const dev = service(api, { apiKey: undefined });
  assert.deepEqual(await dev.sendEmail({ to: 'a@b.test', template: 'resetPassword', data: { link: LINK } }), { accepted: false, reason: 'EMAIL_NOT_CONFIGURED' });
  assert.equal(api.calls.length, 0);
  const out = dev.log.lines.map((l) => l[1]).join(); assert.ok(!out.includes('SECRETTOKEN123') && !out.includes('a@b.test'));
  const opt = service(api, { apiKey: undefined, devLogBody: true });
  await opt.sendEmail({ to: 'a@b.test', template: 'resetPassword', data: { link: LINK } });
  assert.ok(opt.log.lines.map((l) => l[1]).join().includes('SECRETTOKEN123')); // explicit dev opt-in only
  const prod = service(api, { apiKey: undefined, isProd: true });
  assert.equal((await prod.sendEmail({ to: 'a@b.test', template: 'verifyEmail', data: { link: LINK } })).reason, 'EMAIL_NOT_CONFIGURED'); assert.equal(api.calls.length, 0);
});

test('an invalid recipient is refused locally without calling Brevo', async () => {
  const api = brevoApi(() => json(201, {}));
  for (const to of ['not-an-email', '', 'a@b.test\nbcc:x@y.test', undefined]) assert.equal((await service(api).sendEmail({ to, template: 'verifyEmail', data: { link: LINK } })).reason, 'INVALID_RECIPIENT');
  assert.equal(api.calls.length, 0);
});

test('logs and results never contain the API key, tokens/links, recipient, or provider error text', async () => {
  const ok = service(brevoApi(() => json(201, { messageId: 'mid-1' })));
  const bad = service(brevoApi(() => json(401, { code: 'unauthorized', message: `Key ${KEY} invalid for victim@example.com` })), {}, ok.log);
  await ok.sendEmail({ to: 'victim@example.com', template: 'resetPassword', data: { link: LINK } });
  const r = await bad.sendEmail({ to: 'victim@example.com', template: 'resetPassword', data: { link: LINK } });
  const everything = ok.log.lines.map((l) => l[1]).join('\n') + JSON.stringify(r);
  for (const s of [KEY, 'TESTKEY', 'SECRETTOKEN123', 'victim@example.com', 'invalid for']) assert.ok(!everything.includes(s), `leaked: ${s}`);
  assert.match(everything, /mid-1/); // the message id (for delivery lookups) is logged
});

test('"accepted" is reported as acceptance only; the result has no delivered/sent flag', async () => {
  const r = await service(brevoApi(() => json(201, { messageId: 'm' }))).sendEmail({ to: 'a@b.test', template: 'verifyEmail', data: { link: LINK } });
  assert.equal(r.accepted, true); assert.ok(!('sent' in r) && !('delivered' in r));
});

test('unknown template is a programming error and throws', async () => {
  await assert.rejects(service(brevoApi(() => json(201, {}))).sendEmail({ to: 'a@b.test', template: 'nope', data: {} }), /Unknown email template/);
});

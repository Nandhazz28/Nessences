import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:1/x', LOG_LEVEL: 'silent', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), CLIENT_URL: 'https://www.nessence.test' });
const { templates, formatDate } = await import('../src/services/emailTemplates.js');

const LINK = 'https://www.nessence.test/some/page?token=abc123';
const ORDER = { name: 'Asha Rao', orderNumber: 'NS-2610-AB12CD', placedAt: '2026-10-12T08:00:00Z', link: LINK,
  items: [{ name: 'Linen Shirt', color: 'Black', size: 'M', qty: 2, unitPrice: 200000, lineTotal: 400000 }, { name: 'Wool Scarf', color: 'Oat', size: 'One size', qty: 1, unitPrice: 150000, lineTotal: 150000 }],
  totals: { subtotal: 550000, discount: 55000, shipping: 0, tax: 24750, total: 519750 }, coupon: { code: 'WELCOME10' },
  delivery: { label: 'Standard delivery', eta: '4–6 business days' },
  shippingAddress: { fullName: 'Asha Rao', phone: '9876543210', line1: '12 MG Road', line2: 'Flat 4', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' } };
const SAMPLES = {
  verifyEmail: { name: 'Asha Rao', link: LINK }, welcome: { name: 'Asha Rao' }, resetPassword: { name: 'Asha Rao', link: LINK }, passwordChanged: { name: 'Asha Rao', changedAt: '2026-10-12T08:00:00Z' },
  orderConfirmation: ORDER, orderStatus: { name: 'Asha Rao', orderNumber: 'NS-2610-AB12CD', status: 'shipped', link: LINK },
  orderCancelled: { name: 'Asha Rao', orderNumber: 'NS-2610-AB12CD', refundPending: true, link: LINK }, refundIssued: { name: 'Asha Rao', orderNumber: 'NS-2610-AB12CD', amount: 519750, link: LINK },
  newsletterConfirm: { link: LINK }, newsletterWelcome: { link: LINK }, contactReceived: { name: 'Asha Rao', subject: 'Sizing' }, supportReply: { name: 'Asha Rao', subject: 'Sizing', message: 'Hello.\n\nSecond paragraph.' },
};

test('subjects follow the brand style and the specified examples', () => {
  assert.equal(templates.welcome(SAMPLES.welcome).subject, 'Welcome to Nessence');
  assert.equal(templates.orderConfirmation(ORDER).subject, 'Your Nessence Order Confirmation — #NS-2610-AB12CD');
  assert.equal(templates.resetPassword(SAMPLES.resetPassword).subject, 'Reset Your Nessence Password');
  assert.equal(templates.orderStatus(SAMPLES.orderStatus).subject, 'Your Nessence Order Is on Its Way');
  assert.equal(templates.orderStatus({ ...SAMPLES.orderStatus, status: 'delivered' }).subject, 'Your Nessence Order Has Been Delivered');
  assert.equal(templates.verifyEmail(SAMPLES.verifyEmail).subject, 'Verify Your Nessence Account');
  assert.equal(templates.passwordChanged(SAMPLES.passwordChanged).subject, 'Your Nessence Password Was Changed');
  assert.equal(templates.orderCancelled(SAMPLES.orderCancelled).subject, 'Your Nessence Order Has Been Cancelled — #NS-2610-AB12CD');
  assert.equal(templates.refundIssued(SAMPLES.refundIssued).subject, 'Your Nessence Refund Has Been Issued — #NS-2610-AB12CD');
});

test('every template: responsive HTML + readable text, no placeholders, no exclamation marks, no emoji, no leaked internals', () => {
  for (const [name, data] of Object.entries(SAMPLES)) {
    const { subject, html, text } = templates[name](data);
    assert.ok(subject && !/[\r\n]/.test(subject), `${name} subject`);
    assert.match(html, /^<!doctype html>/); assert.match(html, /<html lang="en">/); assert.match(html, /name="viewport"/); assert.match(html, /max-width:600px/); assert.match(html, /width="100%"/);
    assert.match(html, /role="presentation"/);
    for (const [kind, body] of [['html', html], ['text', text]]) {
      assert.ok(!/undefined|\bnull\b|NaN|\[object/.test(body), `${name} ${kind} contains a placeholder-like value`);
      assert.ok(!/\p{Extended_Pictographic}/u.test(body), `${name} ${kind} contains an emoji`);
      assert.ok(!/stack|MongoError|ObjectId|_id\b/.test(body), `${name} ${kind} leaks internals`);
    }
    assert.ok(!text.includes('!'), `${name}: no exclamation marks in the plain text`);
    assert.ok(text.length > 80 && !/<[a-z][\s\S]*>/i.test(text), `${name} text is real prose, not markup`);
    assert.ok(/Nessence/.test(text));
    if (data.link) { assert.ok(html.includes(`href="${LINK}"`) && text.includes(LINK), `${name} link in both parts`); }
  }
});

test('order confirmation carries the real order data in both parts', () => {
  const { html, text } = templates.orderConfirmation(ORDER);
  for (const body of [html, text]) {
    for (const needle of ['NS-2610-AB12CD', '12 October 2026', 'Linen Shirt', 'Black / M', 'Wool Scarf', '₹4,000', '₹1,500', '₹5,500', 'WELCOME10', '₹550', '₹5,197.50', '₹247.50']) {
      assert.ok(body.includes(needle), `missing ${needle}`);
    }
    assert.ok(body.includes('Free') && body.includes('Standard delivery') && body.includes('12 MG Road') && body.includes('Chennai') && body.includes('600001'));
  }
  assert.match(text, /Hello Asha,/); assert.match(text, /payment/i); assert.ok(html.includes(`href="${LINK}"`));
});

test('optional data missing: sensible fallbacks, nothing broken', () => {
  const bare = templates.orderConfirmation({ orderNumber: 'NS-1', items: [], totals: { subtotal: 0, total: 0 }, link: LINK });
  assert.match(bare.text, /^Thank you for your order/); assert.match(bare.text, /Hello,/); assert.ok(!/undefined|null/.test(bare.html + bare.text));
  assert.ok(!bare.text.includes('Delivering to') && !bare.text.includes('YOUR ITEMS'));
  assert.equal(formatDate(undefined), null); assert.equal(formatDate('garbage'), null);
  assert.ok(templates.passwordChanged({ link: undefined }).html.includes('/forgot-password'));
  assert.match(templates.welcome({}).text, /\/collections/);
});

test('shipping update shows tracking only when real tracking information exists', () => {
  assert.ok(!/Tracking number|Track your parcel|Carrier/.test(templates.orderStatus(SAMPLES.orderStatus).text));
  const t = templates.orderStatus({ ...SAMPLES.orderStatus, tracking: { carrier: 'Delhivery', number: 'DLV123456', url: 'https://track.example/DLV123456' } });
  assert.match(t.text, /Delhivery/); assert.match(t.text, /DLV123456/); assert.ok(t.html.includes('href="https://track.example/DLV123456"'));
  assert.ok(!/Tracking number/.test(templates.orderStatus({ ...SAMPLES.orderStatus, tracking: { url: 'javascript:alert(1)' } }).html), 'an unsafe tracking url is ignored');
});

test('cancellation wording matches what actually happens to the money', () => {
  assert.match(templates.orderCancelled({ ...SAMPLES.orderCancelled, refundPending: true }).text, /refunded to your original payment method/);
  const unpaid = templates.orderCancelled({ ...SAMPLES.orderCancelled, refundPending: false }).text;
  assert.match(unpaid, /not been charged/); assert.ok(!/refund/i.test(unpaid.replace(/Refund/g, '')) || !/will be refunded/.test(unpaid));
  assert.match(templates.refundIssued(SAMPLES.refundIssued).text, /₹5,197\.50/, 'a refund amount is exact, never rounded');
});

test('security wording: reset email states expiry and what to do if not requested; no password or token other than the link ever appears', () => {
  const { text } = templates.resetPassword({ link: LINK });
  assert.match(text, /1 hour/); assert.match(text, /did not ask to reset/i); assert.ok(!/password is|your password:/i.test(text));
  assert.match(templates.verifyEmail({ link: LINK }).text, /24 hours/);
  assert.match(templates.passwordChanged(SAMPLES.passwordChanged).text, /did not make this change/);
});

test('HTML-injection through names, product names, addresses and messages is neutralised', () => {
  const evil = '"><script>alert(1)</script><img src=x onerror=alert(2)>';
  const o = templates.orderConfirmation({ ...ORDER, name: evil, items: [{ ...ORDER.items[0], name: evil }], shippingAddress: { ...ORDER.shippingAddress, line1: evil }, coupon: { code: evil } });
  const r = templates.supportReply({ name: evil, subject: evil, message: evil });
  for (const { html } of [o, r]) { assert.ok(!html.includes('<script') && !html.includes('<img src=x'), 'markup must be escaped'); assert.ok(html.includes('&lt;script&gt;')); }
});

test('accessible colour contrast (WCAG AA 4.5:1) for the text/background pairs used', () => {
  const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [fg, bg, what] of [['#181510', '#ffffff', 'body on card'], ['#ffffff', '#181510', 'button label'], ['#5e594f', '#ffffff', 'muted text'], ['#6e2a2a', '#ffffff', 'links']]) assert.ok(ratio(fg, bg) >= 4.5, `${what}: ${ratio(fg, bg).toFixed(2)}`);
});

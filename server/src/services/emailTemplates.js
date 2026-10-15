import { env } from '../config/env.js';

const C = { paper: '#f7f5f0', ink: '#181510', oxblood: '#6e2a2a', sand: '#efeae0', stone: '#d9d4c7', muted: '#5e594f' };
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u ?? '')) ? String(u) : null);
const money = (paise) => { const p = Math.round(Number(paise) || 0); return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(p / 100); };
export const formatDate = (d) => {
  const date = d ? new Date(d) : null;
  return date && !Number.isNaN(+date) ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(date) : null;
};
const greeting = (name) => (name && String(name).trim() ? `Hello ${String(name).trim().split(/\s+/)[0]},` : 'Hello,');
const supportUrl = () => `${env.CLIENT_URL}/contact`;

function renderBlock(b) {
  if (b.p) return { html: `<p style="margin:0 0 16px;font:15px/1.6 ${SANS};color:${C.ink}">${esc(b.p).replace(/\n/g, '<br>')}</p>`, text: b.p };
  if (b.small) return { html: `<p style="margin:0 0 14px;font:13px/1.55 ${SANS};color:${C.muted}">${esc(b.small)}</p>`, text: b.small };
  if (b.h) return { html: `<h2 style="margin:24px 0 8px;font:600 12px/1.4 ${SANS};letter-spacing:.12em;text-transform:uppercase;color:${C.muted}">${esc(b.h)}</h2>`, text: b.h.toUpperCase() };
  if (b.kv) {
    const rows = b.kv.filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (!rows.length) return null;
    return {
      html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${rows.map(([k, v]) => `<tr><td style="padding:6px 0;font:13px/1.5 ${SANS};color:${C.muted};width:40%;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font:14px/1.5 ${SANS};color:${C.ink};vertical-align:top">${esc(v)}</td></tr>`).join('')}</table>`,
      text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
    };
  }
  if (b.lines) {
    const lines = b.lines.filter(Boolean);
    if (!lines.length) return null;
    return { html: `<p style="margin:0 0 20px;font:14px/1.6 ${SANS};color:${C.ink}">${lines.map(esc).join('<br>')}</p>`, text: lines.join('\n') };
  }
  if (b.items) {
    if (!b.items.length) return null;
    return {
      html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border-top:1px solid ${C.stone}">${b.items.map((i) => `<tr><td style="padding:12px 0;border-bottom:1px solid ${C.stone};font:14px/1.5 ${SANS};color:${C.ink}"><strong style="font-weight:600">${esc(i.name)}</strong><br><span style="color:${C.muted};font-size:13px">${esc([i.variant, `Qty ${i.qty}`].filter(Boolean).join(' · '))}</span></td><td align="right" style="padding:12px 0 12px 12px;border-bottom:1px solid ${C.stone};font:14px/1.5 ${SANS};color:${C.ink};white-space:nowrap;vertical-align:top">${esc(i.price)}</td></tr>`).join('')}</table>`,
      text: b.items.map((i) => `- ${i.name}${i.variant ? ` (${i.variant})` : ''} × ${i.qty} — ${i.price}`).join('\n'),
    };
  }
  if (b.totals) {
    return {
      html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${b.totals.map(([k, v, strong]) => `<tr><td style="padding:4px 0;font:${strong ? '600 ' : ''}14px/1.5 ${SANS};color:${strong ? C.ink : C.muted}${strong ? `;border-top:1px solid ${C.ink};padding-top:10px` : ''}">${esc(k)}</td><td align="right" style="padding:4px 0;font:${strong ? '600 ' : ''}14px/1.5 ${SANS};color:${C.ink}${strong ? `;border-top:1px solid ${C.ink};padding-top:10px` : ''}">${esc(v)}</td></tr>`).join('')}</table>`,
      text: b.totals.map(([k, v]) => `${k}: ${v}`).join('\n'),
    };
  }
  if (b.cta) {
    const url = safeUrl(b.cta.url);
    if (!url) return null;
    return {
      html: `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="background:${C.ink};border-radius:2px"><a href="${esc(url)}" style="display:inline-block;padding:14px 28px;font:600 14px/1 ${SANS};letter-spacing:.04em;color:#ffffff;text-decoration:none">${esc(b.cta.label)}</a></td></tr></table><p style="margin:0 0 20px;font:12px/1.5 ${SANS};color:${C.muted}">If the button does not work, copy this link into your browser:<br><a href="${esc(url)}" style="color:${C.oxblood};word-break:break-all">${esc(url)}</a></p>`,
      text: `${b.cta.label}:\n${url}`,
    };
  }
  return null;
}

export function render({ subject, preheader, heading, blocks }) {
  const parts = blocks.map(renderBlock).filter(Boolean);
  const help = safeUrl(supportUrl());
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.paper}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.paper}">${esc(preheader ?? '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${C.stone}">
<tr><td align="center" style="padding:28px 24px 20px;border-bottom:1px solid ${C.stone};font:400 22px/1 ${SERIF};letter-spacing:.32em;text-transform:uppercase;color:${C.ink}">Nessence</td></tr>
<tr><td style="padding:32px 28px 8px">
<h1 style="margin:0 0 20px;font:400 26px/1.25 ${SERIF};color:${C.ink}">${esc(heading)}</h1>
${parts.map((p) => p.html).join('\n')}
</td></tr>
<tr><td style="padding:8px 28px 28px;border-top:1px solid ${C.stone}"><p style="margin:16px 0 0;font:12px/1.6 ${SANS};color:${C.muted}">Need help? Visit our <a href="${esc(help)}" style="color:${C.oxblood}">contact page</a> and our Customer Care team will be glad to assist.<br>Nessence</p></td></tr>
</table></td></tr></table></body></html>`;
  const text = [heading, '', ...parts.map((p) => p.text + '\n'), `Need help? Contact Customer Care: ${supportUrl()}`, 'Nessence'].join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { subject, html, text };
}

const orderRef = (n) => `#${n}`;
const variantOf = (i) => [i.color, i.size].filter(Boolean).join(' / ');
const addressLines = (a) => (a ? [a.fullName, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', ') + (a.pincode ? ` ${a.pincode}` : ''), a.phone ? `Phone: ${a.phone}` : null] : []);

export const templates = {
  verifyEmail: ({ name, link }) => render({
    subject: 'Verify Your Nessence Account', preheader: 'One quick step to finish creating your account.', heading: 'Confirm your email address',
    blocks: [{ p: greeting(name) }, { p: 'Thank you for creating a Nessence account. Please confirm your email address to finish setting it up.' }, { cta: { label: 'Verify email address', url: link } },
      { small: 'This link expires in 24 hours. If you did not create a Nessence account, you can safely ignore this email.' }],
  }),

  welcome: ({ name, link }) => render({
    subject: 'Welcome to Nessence', preheader: 'Your account is ready.', heading: 'Welcome to Nessence',
    blocks: [{ p: greeting(name) }, { p: 'Thank you for joining Nessence. Your account is ready: you can browse our collections, save pieces to your wishlist and check out faster with your saved details.' },
      { cta: { label: 'Explore the collections', url: link ?? `${env.CLIENT_URL}/collections` } }, { small: 'If you ever need a hand with sizing, an order or a return, our Customer Care team is here to help.' }],
  }),

  resetPassword: ({ name, link }) => render({
    subject: 'Reset Your Nessence Password', preheader: 'Use the link below to choose a new password.', heading: 'Reset your password',
    blocks: [{ p: greeting(name) }, { p: 'We received a request to reset the password for your Nessence account. Choose a new password using the button below.' }, { cta: { label: 'Choose a new password', url: link } },
      { small: 'For your security, this link expires in 1 hour and can be used once.' }, { small: 'If you did not ask to reset your password, you can ignore this email. Your password will not change and no one can use this link without access to your inbox.' }],
  }),

  passwordChanged: ({ name, changedAt, link }) => render({
    subject: 'Your Nessence Password Was Changed', preheader: 'A security notice about your account.', heading: 'Your password was changed',
    blocks: [{ p: greeting(name) }, { p: `The password for your Nessence account was changed${formatDate(changedAt) ? ` on ${formatDate(changedAt)}` : ''}. For your security, you have been signed out on all devices.` },
      { p: 'If this was you, there is nothing more to do.' }, { p: 'If you did not make this change, please reset your password straight away and contact Customer Care.' }, { cta: { label: 'Reset your password', url: link ?? `${env.CLIENT_URL}/forgot-password` } }],
  }),

  orderConfirmation: (d) => {
    const t = d.totals ?? {};
    return render({
      subject: `Your Nessence Order Confirmation — ${orderRef(d.orderNumber)}`, preheader: `Order ${orderRef(d.orderNumber)} is confirmed and your payment has been received.`, heading: 'Thank you for your order',
      blocks: [{ p: greeting(d.name) }, { p: 'Your order is confirmed and we have received your payment. We will begin preparing it now and email you again when it is on its way.' },
        { kv: [['Order number', d.orderNumber], ['Date', formatDate(d.placedAt)], ['Delivery', [d.delivery?.label, d.delivery?.eta].filter(Boolean).join(' · ') || undefined]] },
        ...((d.items ?? []).length ? [{ h: 'Your items' }, { items: d.items.map((i) => ({ name: i.name, variant: variantOf(i), qty: i.qty, price: money(i.lineTotal) })) }] : []),
        { totals: [['Subtotal', money(t.subtotal)], ...(t.discount ? [[`Discount${d.coupon?.code ? ` (${d.coupon.code})` : ''}`, `− ${money(t.discount)}`]] : []), ['Shipping', t.shipping ? money(t.shipping) : 'Free'], ...(t.tax ? [['Tax', money(t.tax)]] : []), ['Total paid', money(t.total), true]] },
        ...(d.shippingAddress ? [{ h: 'Delivering to' }, { lines: addressLines(d.shippingAddress) }] : []),
        { cta: { label: 'View your order', url: d.link } }],
    });
  },

  orderStatus: ({ name, orderNumber, status, link, tracking }) => {
    const copy = status === 'delivered'
      ? { subject: 'Your Nessence Order Has Been Delivered', heading: 'Your order has been delivered', lead: `Order ${orderRef(orderNumber)} has been delivered. We hope you love it.`, tail: 'If anything is not quite right, you can start a return or contact Customer Care from your order page.' }
      : { subject: 'Your Nessence Order Is on Its Way', heading: 'Your order is on its way', lead: `Good news: order ${orderRef(orderNumber)} has left our hands and is on its way to you.`, tail: 'You can follow its progress from your order page at any time.' };
    const t = tracking && (tracking.number || safeUrl(tracking.url)) ? tracking : null;
    return render({
      subject: copy.subject, preheader: copy.lead, heading: copy.heading,
      blocks: [{ p: greeting(name) }, { p: copy.lead },
        ...(t ? [{ kv: [['Carrier', t.carrier], ['Tracking number', t.number]] }, ...(safeUrl(t.url) ? [{ cta: { label: 'Track your parcel', url: t.url } }] : [])] : []),
        { cta: { label: 'View your order', url: link } }, { small: copy.tail }],
    });
  },

  orderCancelled: ({ name, orderNumber, refundPending, link }) => render({
    subject: `Your Nessence Order Has Been Cancelled — ${orderRef(orderNumber)}`, preheader: `Order ${orderRef(orderNumber)} has been cancelled.`, heading: 'Your order has been cancelled',
    blocks: [{ p: greeting(name) }, { p: `Order ${orderRef(orderNumber)} has been cancelled.` },
      { p: refundPending ? 'Because you had already paid, your payment will be refunded to your original payment method. We will email you again as soon as the refund has been issued.' : 'You have not been charged for this order.' },
      { cta: { label: 'View your order', url: link } }, { small: 'If you did not expect this cancellation, please contact Customer Care.' }],
  }),

  refundIssued: ({ name, orderNumber, amount, link }) => render({
    subject: `Your Nessence Refund Has Been Issued — ${orderRef(orderNumber)}`, preheader: `A refund of ${money(amount)} is on its way.`, heading: 'Your refund has been issued',
    blocks: [{ p: greeting(name) }, { p: `We have issued a refund of ${money(amount)} for order ${orderRef(orderNumber)} to your original payment method.` },
      { p: 'Depending on your bank, it usually takes 5 to 7 business days to appear on your statement.' }, { cta: { label: 'View your order', url: link } }],
  }),

  newsletterConfirm: ({ link }) => render({
    subject: 'Confirm Your Nessence Subscription', preheader: 'Please confirm that you would like to hear from us.', heading: 'Confirm your subscription',
    blocks: [{ p: 'Please confirm that you would like to receive news of new arrivals and restocks from Nessence.' }, { cta: { label: 'Confirm subscription', url: link } }, { small: 'If you did not ask to subscribe, you can ignore this email and you will not be added.' }],
  }),

  newsletterWelcome: ({ link }) => render({
    subject: 'You Are Subscribed to Nessence', preheader: 'Thank you for subscribing.', heading: 'Thank you for subscribing',
    blocks: [{ p: 'You will now hear from us about new arrivals and restocks. We will keep it considered and infrequent.' }, { small: 'You can unsubscribe at any time.' }, { cta: { label: 'Unsubscribe', url: link } }],
  }),

  contactReceived: ({ name, subject }) => render({
    subject: 'We Have Received Your Message', preheader: 'Our Customer Care team will reply soon.', heading: 'We have received your message',
    blocks: [{ p: greeting(name) }, { p: `Thank you for getting in touch about “${subject}”. Our Customer Care team usually replies within 2 working days.` }, { small: 'There is no need to send your message again. If you have more to add, simply reply to our response.' }],
  }),

  supportReply: ({ name, subject, message }) => render({
    subject: `Re: ${subject}`, preheader: 'A reply from Nessence Customer Care.', heading: 'A reply from Customer Care',
    blocks: [{ p: greeting(name) }, ...String(message ?? '').split(/\n{2,}/).map((p) => ({ p: p.trim() })).filter((b) => b.p), { small: 'Nessence Customer Care' }],
  }),
};

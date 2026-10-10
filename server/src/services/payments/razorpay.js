import crypto from 'node:crypto';
import { env } from '../../config/env.js';

const API = 'https://api.razorpay.com/v1';
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
const safeEq = (a, b) => {
  const A = Buffer.from(String(a ?? '')); const B = Buffer.from(String(b ?? ''));
  return A.length === B.length && A.length > 0 && crypto.timingSafeEqual(A, B);
};

export class PaymentProviderError extends Error {}

export const razorpay = {
  name: 'razorpay',
  isConfigured: () => Boolean(env.PAYMENT_KEY && env.PAYMENT_SECRET),
  webhookConfigured: () => Boolean(env.PAYMENT_WEBHOOK_SECRET),
  publicConfig: () => ({ keyId: env.PAYMENT_KEY }),

  async createOrder({ amount, currency = 'INR', receipt, notes }) {
    let res;
    try {
      res = await fetch(`${API}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${env.PAYMENT_KEY}:${env.PAYMENT_SECRET}`).toString('base64')}` },
        body: JSON.stringify({ amount, currency, receipt, notes }),
        signal: AbortSignal.timeout(10000),
      });
    } catch { throw new PaymentProviderError('Payment provider unreachable'); }
    if (!res.ok) throw new PaymentProviderError(`Payment provider rejected the order (HTTP ${res.status})`);
    const j = await res.json();
    return { id: j.id, amount: j.amount, currency: j.currency };
  },

  // Refund (full or partial) against a captured payment. amount in paise.
  async refund({ paymentId, amount, notes }) {
    let res;
    try {
      res = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${env.PAYMENT_KEY}:${env.PAYMENT_SECRET}`).toString('base64')}` },
        body: JSON.stringify({ amount, speed: 'normal', notes }), signal: AbortSignal.timeout(15000),
      });
    } catch { throw new PaymentProviderError('Payment provider unreachable'); }
    if (!res.ok) { let d = ''; try { d = (await res.json())?.error?.description ?? ''; } catch { /* ignore */ } throw new PaymentProviderError(d || `Refund rejected (HTTP ${res.status})`); }
    const j = await res.json();
    return { id: j.id, status: j.status };
  },

  // Razorpay Checkout returns order_id, payment_id and signature = HMAC_SHA256(order_id|payment_id, key_secret)
  verifyCheckoutSignature: ({ orderId, paymentId, signature }) =>
    Boolean(env.PAYMENT_SECRET) && safeEq(hmac(env.PAYMENT_SECRET, `${orderId}|${paymentId}`), signature),

  // Webhook signature = HMAC_SHA256(raw request body, webhook secret)
  verifyWebhookSignature: (rawBody, signature) =>
    Boolean(env.PAYMENT_WEBHOOK_SECRET) && safeEq(hmac(env.PAYMENT_WEBHOOK_SECRET, rawBody), signature),
};

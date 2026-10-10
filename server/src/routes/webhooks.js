import express, { Router } from 'express';
import { getPaymentProvider } from '../services/payments/index.js';
import { handleGatewayEvent } from '../services/checkoutService.js';
import { logger } from '../config/logger.js';

// Mounted BEFORE express.json(): the signature is computed over the exact raw bytes.
export const webhooks = Router();
webhooks.post('/razorpay', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
  const provider = getPaymentProvider();
  const raw = req.body;
  const sig = req.get('x-razorpay-signature');
  if (!Buffer.isBuffer(raw) || !provider.verifyWebhookSignature(raw, sig)) {
    logger.warn({ ip: req.ip }, 'Rejected webhook: bad or missing signature');
    return res.status(400).json({ success: false, code: 'INVALID_SIGNATURE', message: 'Invalid signature' });
  }
  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ success: false, code: 'INVALID_JSON', message: 'Malformed body' }); }
  try {
    const outcome = await handleGatewayEvent(req.get('x-razorpay-event-id'), event);
    logger.info({ event: event.event, outcome }, 'webhook handled');
    res.status(200).json({ success: true });
  } catch (err) {
    logger.error({ err, event: event?.event }, 'webhook processing failed');
    res.status(500).json({ success: false, code: 'WEBHOOK_FAILED', message: 'Retry later' }); // gateway will retry
  }
});

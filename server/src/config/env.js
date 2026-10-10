import 'dotenv/config';
import { parseEnv } from './envSchema.js';

const parsed = parseEnv(process.env);
if (!parsed.ok) {
  console.error(`Invalid environment configuration:\n${parsed.errors.map((l) => `  - ${l}`).join('\n')}`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  emailConfigured: Boolean(parsed.data.BREVO_API_KEY && parsed.data.BREVO_SENDER_EMAIL),
  cloudinaryConfigured: parsed.data.STORAGE_PROVIDER === 'cloudinary',
  paymentConfigured: Boolean(parsed.data.PAYMENT_KEY && parsed.data.PAYMENT_SECRET),
};

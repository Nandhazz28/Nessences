import mongoose from 'mongoose';
import { connectDbWithRetry } from '../config/db.js';
import { StaffUser } from '../models/StaffUser.js';
import { hashPassword } from '../services/authService.js';

const email = String(process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD ?? '');
const name = String(process.env.ADMIN_NAME ?? 'Store Admin').trim().slice(0, 80) || 'Store Admin';

const fail = (msg) => { console.error(`admin:create: ${msg}`); process.exit(1); };
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('set ADMIN_EMAIL to a valid email address');
if (password.length < 12 || password.length > 128) fail('set ADMIN_PASSWORD to a temporary password of 12-128 characters');
if (password.toLowerCase().includes(email.split('@')[0])) fail('the temporary password must not contain the email name');

await connectDbWithRetry({ timeoutMs: 60_000 });
try {
  if (await StaffUser.exists({ email })) fail(`a staff account for ${email} already exists; nothing was changed`);
  await StaffUser.create({ name, email, role: 'super_admin', passwordHash: await hashPassword(password), mustChangePassword: true });
  console.log(`Created super_admin ${email}. They must choose a new password at first sign-in.`);
} finally { await mongoose.disconnect(); }

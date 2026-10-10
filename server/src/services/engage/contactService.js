import { ContactMessage } from '../../models/ContactMessage.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import { sendEmail } from '../emailService.js';

export async function submit(body, { user, ip }) {
  if (body.website) return { received: true }; // honeypot: bots fill the hidden field; humans never see it
  const { website, ...data } = body;
  const m = await ContactMessage.create({ ...data, user: user?._id, ip });
  sendEmail({ to: m.email, template: 'contactReceived', data: { name: m.name, subject: m.subject } }).catch(() => {});
  return { received: true, reference: String(m._id).slice(-8).toUpperCase() };
}
export async function adminList({ status, page, limit }) {
  const f = status ? { status } : {};
  const [rows, total, open] = await Promise.all([ContactMessage.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), ContactMessage.countDocuments(f), ContactMessage.countDocuments({ status: 'new' })]);
  return { items: rows.map((m) => ({ id: m._id, name: m.name, email: m.email, category: m.category, subject: m.subject, status: m.status, orderNumber: m.orderNumber, replies: m.replies.length, createdAt: m.createdAt })), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }, newCount: open };
}
export async function get(id) { const m = await ContactMessage.findById(id).lean(); if (!m) throw ApiError.notFound('MESSAGE_NOT_FOUND', 'Message not found'); const { ip, ...rest } = m; return { ...rest, id: m._id }; }
export async function setStatus(id, status) { const m = await ContactMessage.findByIdAndUpdate(id, { $set: { status } }, { new: true }); if (!m) throw ApiError.notFound('MESSAGE_NOT_FOUND', 'Message not found'); return m; }
export async function reply(id, staff, message) {
  if (!env.emailConfigured) throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'Email (Brevo) is not configured on this server, so replies cannot be sent. Set BREVO_API_KEY and BREVO_SENDER_EMAIL in the server environment.');
  const m = await ContactMessage.findById(id); if (!m) throw ApiError.notFound('MESSAGE_NOT_FOUND', 'Message not found');
  const r = await sendEmail({ to: m.email, template: 'supportReply', data: { name: m.name, subject: m.subject, message } });
  if (!r.accepted) throw new ApiError(502, 'EMAIL_FAILED', 'The email could not be sent. Nothing was recorded; please try again.');
  m.replies.push({ by: staff.name, message }); if (m.status === 'new') m.status = 'in_progress'; await m.save(); // recorded only after a real send
  return m;
}

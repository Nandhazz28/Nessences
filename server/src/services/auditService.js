import { AdminAuditLog } from '../models/AdminAuditLog.js';
import { logger } from '../config/logger.js';

export async function audit(req, { action, resource, resourceId, metadata, actor }) {
  const who = actor ?? req.staff;
  try {
    await AdminAuditLog.create({
      actor: who?._id, actorEmail: who?.email, action, resource,
      resourceId: resourceId ? String(resourceId) : undefined, metadata, ip: req.ip,
    });
  } catch (err) {
    logger.error({ err, action }, 'Failed to write audit log');
  }
  logger.info({ audit: true, action, resource, resourceId, actor: who?.email }, 'admin action');
}

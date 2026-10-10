import mongoose from 'mongoose';

const auditSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffUser', index: true },
  actorEmail: String,
  action: { type: String, required: true, index: true },
  resource: { type: String, required: true },
  resourceId: String,
  metadata: mongoose.Schema.Types.Mixed,
  ip: String,
}, { timestamps: { createdAt: true, updatedAt: false } });

auditSchema.index({ createdAt: -1 });

export const AdminAuditLog = mongoose.model('AdminAuditLog', auditSchema);

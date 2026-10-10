import mongoose from 'mongoose';

// Registry of every image this app put in object storage. It is written BEFORE the upload starts, so a crash between
// "Cloudinary accepted it" and "we recorded it" can never leave an asset the app has no record of.
//   pending        uploaded (or uploading) but not attached to any record yet
//   active         attached to at least one record
//   delete_pending released by a record; the Cloudinary delete has not (yet) succeeded
export const MEDIA_STATUSES = ['pending', 'active', 'delete_pending'];
export const MEDIA_PURPOSES = ['product', 'article'];

const mediaAssetSchema = new mongoose.Schema({
  publicId: { type: String, required: true, unique: true },
  url: String, // canonical secure_url; unset until the upload has completed
  purpose: { type: String, enum: MEDIA_PURPOSES, required: true },
  status: { type: String, enum: MEDIA_STATUSES, default: 'pending' },
  format: String, bytes: Number, width: Number, height: Number, version: Number,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffUser' },
  deleteAttempts: { type: Number, default: 0 },
  lastError: String, // short error code only, never a provider message
}, { timestamps: true });

mediaAssetSchema.index({ url: 1 });
mediaAssetSchema.index({ status: 1, updatedAt: 1 });

export const MediaAsset = mongoose.model('MediaAsset', mediaAssetSchema);

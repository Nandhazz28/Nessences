import mongoose from "mongoose";

export const MEDIA_STATUSES = ["pending", "active", "delete_pending"];
export const MEDIA_PURPOSES = ["product", "article"];

const mediaAssetSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, unique: true },
    url: String,
    purpose: { type: String, enum: MEDIA_PURPOSES, required: true },
    status: { type: String, enum: MEDIA_STATUSES, default: "pending" },
    format: String,
    bytes: Number,
    width: Number,
    height: Number,
    version: Number,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser" },
    deleteAttempts: { type: Number, default: 0 },
    lastError: String,
  },
  { timestamps: true },
);

mediaAssetSchema.index({ url: 1 });
mediaAssetSchema.index({ status: 1, updatedAt: 1 });

export const MediaAsset = mongoose.model("MediaAsset", mediaAssetSchema);

import mongoose from "mongoose";

export const CONTENT_KEYS = [
  "about",
  "shipping",
  "returns-policy",
  "refund-policy",
  "size-guide",
  "faq",
  "privacy",
  "terms",
  "cookie-policy",
  "careers",
];

const contentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    title: { type: String, required: true, maxlength: 140 },
    body: { type: String, default: "", maxlength: 30000 },
    data: mongoose.Schema.Types.Mixed,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser" },
  },
  { timestamps: true },
);

export const SiteContent = mongoose.model("SiteContent", contentSchema);

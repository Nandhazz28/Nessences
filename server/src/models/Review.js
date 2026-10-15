import mongoose from "mongoose";

export const REVIEW_STATUSES = ["pending", "approved", "flagged", "removed"];
const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: Number.isInteger,
    },
    title: { type: String, trim: true, maxlength: 80 },
    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 2000,
    },
    status: { type: String, enum: REVIEW_STATUSES, default: "pending" },
    moderationNote: String,
    reportCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

reviewSchema.index({ product: 1, user: 1 }, { unique: true });
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });

export const Review = mongoose.model("Review", reviewSchema);

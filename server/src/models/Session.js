import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    scope: { type: String, enum: ["customer", "staff"], required: true },
    family: { type: String, required: true, index: true },
    hash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    rotatedAt: Date,
    userAgent: String,
  },
  { timestamps: true },
);

export const Session = mongoose.model("Session", sessionSchema);

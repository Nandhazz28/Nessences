import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    provider: { type: String, required: true },
    type: String,
    status: {
      type: String,
      enum: ["processing", "done", "failed"],
      required: true,
    },
    lockedUntil: Date,
    attempts: { type: Number, default: 1 },
    outcome: String,
    lastError: String,
    doneAt: Date,
    expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true },
);

export const WebhookEvent = mongoose.model("WebhookEvent", schema);

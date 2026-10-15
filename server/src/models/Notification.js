import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["order", "return", "refund", "account"],
      required: true,
    },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, maxlength: 300 },
    link: String,
    readAt: Date,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      versionKey: false,
      transform: (_d, r) => {
        r.id = r._id;
        delete r._id;
        delete r.user;
        return r;
      },
    },
  },
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 180 },
);

export const Notification = mongoose.model("Notification", notificationSchema);

import mongoose from "mongoose";

const articleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    excerpt: { type: String, required: true, maxlength: 300 },
    coverImage: {
      url: String,
      alt: String,
      publicId: String,
      width: Number,
      height: Number,
      bytes: Number,
      format: String,
    },
    content: { type: String, required: true, maxlength: 30000 },
    author: { type: String, required: true, trim: true, maxlength: 80 },
    tags: [String],
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    publishedAt: Date,
    seo: { title: String, description: String },
  },
  { timestamps: true },
);

articleSchema.index({ status: 1, publishedAt: -1 });
articleSchema.index({ "coverImage.publicId": 1 }, { sparse: true });
articleSchema.pre("validate", function () {
  if (this.status === "published" && !this.publishedAt)
    this.publishedAt = new Date();
});
export const Article = mongoose.model("Article", articleSchema);

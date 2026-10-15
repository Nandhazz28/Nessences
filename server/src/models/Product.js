import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    alt: { type: String, required: true },
    color: String,
    order: { type: Number, default: 0 },
    publicId: String,
    width: Number,
    height: Number,
    bytes: Number,
    format: String,
  },
  { _id: true },
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, required: true, maxlength: 4000 },
    gender: { type: String, enum: ["men", "women"], required: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    collections: [{ type: mongoose.Schema.Types.ObjectId, ref: "Collection" }],
    tags: [String],
    price: {
      type: Number,
      required: true,
      min: 100,
      validate: Number.isInteger,
    },
    salePrice: {
      type: Number,
      default: null,
      validate: {
        validator: (v) => v == null || Number.isInteger(v),
        message: "salePrice must be integer paise",
      },
    },
    effectivePrice: { type: Number, index: true },
    materials: String,
    care: [String],
    details: [String],
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    featured: { type: Boolean, default: false },
    newArrivalUntil: Date,
    publishedAt: Date,
    seo: { title: String, description: String },
    facets: {
      colors: [String],
      sizes: [String],
      inStock: { type: Boolean, default: false },
    },
    colorOptions: [{ name: String, hex: String, _id: false }],
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

productSchema.pre("validate", function () {
  if (this.salePrice != null && this.salePrice >= this.price) {
    throw new Error("salePrice must be lower than price");
  }
  this.effectivePrice = this.salePrice ?? this.price;
  if (this.status === "published" && !this.publishedAt)
    this.publishedAt = new Date();
});

productSchema.index({ status: 1, gender: 1, category: 1, effectivePrice: 1 });
productSchema.index({ status: 1, publishedAt: -1 });
productSchema.index({ "images.publicId": 1 }, { sparse: true });
productSchema.index({ status: 1, featured: -1, publishedAt: -1 });
productSchema.index({ status: 1, collections: 1 });
productSchema.index(
  { name: "text", tags: "text", description: "text" },
  { weights: { name: 10, tags: 5, description: 1 } },
);

export const Product = mongoose.model("Product", productSchema);

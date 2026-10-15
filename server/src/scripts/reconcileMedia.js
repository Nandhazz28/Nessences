import mongoose from "mongoose";
import { connectDb } from "../config/db.js";
import { storage } from "../services/storage.js";
import { media } from "../services/mediaService.js";

if (!storage.supportsRegistry) {
  console.log("STORAGE_PROVIDER is not cloudinary: nothing to reconcile.");
  process.exit(0);
}
await connectDb();
console.log("media reconcile:", await media.reconcile({ limit: 500 }));
await mongoose.disconnect();

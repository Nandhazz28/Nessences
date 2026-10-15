import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDb } from "../config/db.js";
import { storage } from "../services/storage.js";
import { media } from "../services/mediaService.js";
import { LEGACY_UPLOAD_URL } from "../services/imageUrls.js";

const apply = process.argv.includes("--apply");
if (!storage.supportsRegistry) {
  console.error("Set STORAGE_PROVIDER=cloudinary (with credentials) first.");
  process.exit(1);
}
const root = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "uploads",
  "products",
);
const readFile = (url) => {
  const m = LEGACY_UPLOAD_URL.exec(url);
  if (!m) throw new Error("not a local upload");
  return fs.readFile(path.join(root, m[1]));
};

await connectDb();
console.log(await media.migrateLegacy({ apply, readFile }));
if (!apply) console.log("Dry run. Re-run with --apply to migrate.");
await mongoose.disconnect();

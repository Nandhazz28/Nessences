import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { LEGACY_UPLOAD_URL } from "../imageUrls.js";

const root = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "uploads",
  "products",
);

export const localProvider = {
  name: "local",
  async upload(buffer, { ext }) {
    await fs.mkdir(root, { recursive: true });
    const name = `${crypto.randomUUID()}.${ext}`;
    await fs.writeFile(path.join(root, name), buffer, { flag: "wx" });
    return { url: `/media/products/${name}`, bytes: buffer.length };
  },
  async removeLegacy(url) {
    const m = LEGACY_UPLOAD_URL.exec(url ?? "");
    if (m) await fs.rm(path.join(root, m[1]), { force: true });
  },
};

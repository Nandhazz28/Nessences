import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { connectDbWithRetry } from "../config/db.js";

const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../models",
);
for (const f of fs
  .readdirSync(dir)
  .filter((n) => n.endsWith(".js"))
  .sort())
  await import(pathToFileURL(path.join(dir, f)).href);

await connectDbWithRetry({ timeoutMs: 60_000 });
let failed = 0;
for (const name of mongoose.modelNames().sort()) {
  try {
    await mongoose.model(name).syncIndexes();
    console.log("indexes synced:", name);
  } catch (err) {
    failed += 1;
    console.error(`indexes FAILED for ${name}: ${err.message}`);
  }
}
await mongoose.disconnect();
console.log(
  failed
    ? `${failed} model(s) failed`
    : `all ${mongoose.modelNames().length} models synced`,
);
process.exit(failed ? 1 : 0);

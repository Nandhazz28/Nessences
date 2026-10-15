import crypto from "node:crypto";
import { ApiError } from "../../utils/ApiError.js";
import { logger } from "../../config/logger.js";

const SUBFOLDER = { product: "products", article: "journal" };
const UPLOAD_FORMATS = ["jpg", "png", "webp"];
const MAX_EDGE = 2400;

export function createCloudinaryProvider({
  client,
  folder,
  timeoutMs,
  log = logger,
}) {
  const root = `${folder}/`;
  const ownsPublicId = (id) =>
    typeof id === "string" &&
    id.startsWith(root) &&
    id.length < 200 &&
    /^[A-Za-z0-9_\/-]+$/.test(id) &&
    !id.includes("//") &&
    !id.includes("..");

  const toApiError = (op, err) => {
    const e = err?.error ?? err;
    const status = e?.http_code;
    const name = e?.name;
    log.error({ op, status, name }, "Cloudinary request failed");
    if (name === "TimeoutError" || status === 499)
      return new ApiError(
        504,
        "STORAGE_TIMEOUT",
        "Image storage timed out. Please try again.",
      );
    return new ApiError(
      502,
      "STORAGE_UNAVAILABLE",
      "Image storage is unavailable right now. Please try again.",
    );
  };

  return {
    name: "cloudinary",
    ownsPublicId,
    newPublicId: (purpose) =>
      `${root}${SUBFOLDER[purpose] ?? SUBFOLDER.product}/${crypto.randomUUID()}`,

    upload(buffer, { publicId }) {
      if (!ownsPublicId(publicId))
        throw new ApiError(
          500,
          "STORAGE_MISCONFIGURED",
          "Invalid storage path",
        );
      return new Promise((resolve, reject) => {
        const stream = client.uploader.upload_stream(
          {
            public_id: publicId,
            resource_type: "image",
            type: "upload",
            overwrite: false,
            unique_filename: false,
            allowed_formats: UPLOAD_FORMATS,
            timeout: timeoutMs,
            transformation: [
              { width: MAX_EDGE, height: MAX_EDGE, crop: "limit" },
            ],
          },
          (err, result) => {
            if (err || !result?.public_id)
              return reject(toApiError("upload", err ?? { http_code: 502 }));
            resolve({
              publicId: result.public_id,
              url: result.secure_url,
              bytes: result.bytes,
              width: result.width,
              height: result.height,
              format: result.format,
              version: result.version,
            });
          },
        );
        stream.on("error", (err) => reject(toApiError("upload", err)));
        stream.end(buffer);
      });
    },

    // Deletes by stored public_id only, and only inside our own folder. "not found" counts as success (idempotent).
    async destroy(publicId) {
      if (!ownsPublicId(publicId))
        throw new ApiError(
          500,
          "STORAGE_MISCONFIGURED",
          "Refusing to delete an asset outside the configured folder",
        );
      let res;
      try {
        res = await client.uploader.destroy(publicId, {
          resource_type: "image",
          type: "upload",
          invalidate: true,
          timeout: timeoutMs,
        });
      } catch (err) {
        throw toApiError("destroy", err);
      }
      if (res?.result === "ok" || res?.result === "not found")
        return { deleted: res.result === "ok" };
      log.error(
        { op: "destroy", result: res?.result },
        "Cloudinary destroy returned an unexpected result",
      );
      throw new ApiError(
        502,
        "STORAGE_UNAVAILABLE",
        "Image storage did not confirm the deletion",
      );
    },
  };
}

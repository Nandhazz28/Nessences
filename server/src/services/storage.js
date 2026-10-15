import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { createCloudinaryProvider } from "./storage/cloudinaryProvider.js";
import { localProvider } from "./storage/localProvider.js";

export function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { ext: "jpg", mime: "image/jpeg" };
  if (
    buf.length > 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return { ext: "png", mime: "image/png" };
  if (
    buf.length > 12 &&
    buf.subarray(0, 4).toString() === "RIFF" &&
    buf.subarray(8, 12).toString() === "WEBP"
  )
    return { ext: "webp", mime: "image/webp" };
  return null;
}

export function createStorage({
  provider = null,
  maxBytes = env.IMAGE_MAX_BYTES,
  local = localProvider,
} = {}) {
  const maxMb = Math.round((maxBytes / 1024 / 1024) * 10) / 10;
  const api = {
    name: provider ? "cloudinary" : "local",
    supportsRegistry: Boolean(provider),
    maxBytes,

    validate(buffer) {
      if (!Buffer.isBuffer(buffer) || buffer.length === 0)
        throw ApiError.badRequest("NO_FILE", "Choose an image to upload");
      if (buffer.length > maxBytes)
        throw new ApiError(
          413,
          "FILE_TOO_LARGE",
          `Images must be ${maxMb} MB or smaller`,
        );
      const type = sniffImage(buffer);
      if (!type)
        throw ApiError.badRequest(
          "INVALID_IMAGE",
          "Only JPEG, PNG or WebP images are accepted",
        );
      return type;
    },

    newPublicId: (purpose) => provider?.newPublicId(purpose) ?? null,

    async save(buffer, { purpose = "product", publicId } = {}) {
      const type = api.validate(buffer);
      if (!provider) {
        const r = await local.upload(buffer, { ext: type.ext });
        return { ...r, mime: type.mime };
      }
      const r = await provider.upload(buffer, {
        publicId: publicId ?? provider.newPublicId(purpose),
      });
      return { ...r, mime: type.mime };
    },

    destroy(publicId) {
      if (!provider)
        throw new ApiError(
          501,
          "STORAGE_NOT_CONFIGURED",
          "Remote asset deletion needs STORAGE_PROVIDER=cloudinary",
        );
      return provider.destroy(publicId);
    },
    removeLegacy: (url) => local.removeLegacy(url),

    async remove(ref) {
      if (ref && typeof ref === "object" && ref.publicId)
        return api.destroy(ref.publicId);
      return api.removeLegacy(typeof ref === "string" ? ref : ref?.url);
    },
  };
  return api;
}

function fromEnv() {
  if (env.STORAGE_PROVIDER !== "cloudinary") return createStorage();
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
    analytics: false,
  });
  return createStorage({
    provider: createCloudinaryProvider({
      client: cloudinary,
      folder: env.CLOUDINARY_FOLDER,
      timeoutMs: env.CLOUDINARY_TIMEOUT_MS,
    }),
  });
}
export const storage = fromEnv();

/**
 * Sanitization utilities for untrusted clipboard/dataTransfer data.
 */

// Maximum length for filenames from external sources
const MAX_FILENAME_LENGTH = 255;

// Allowed image MIME types for data: URLs
const ALLOWED_IMAGE_MIMES = /^data:image\/(png|jpeg|jpg|gif|webp|bmp|ico|avif)/i;

// SVG (image/svg+xml) is explicitly excluded from all file acceptance paths
// because SVGs can contain embedded scripts. While browsers sandbox SVGs in
// <img> tags, they could become an XSS vector if ever rendered in a less
// restrictive context (e.g., foreignObject, innerHTML).

/**
 * Allowed raster image MIME types for file input (drops/pastes).
 * This is an allowlist approach — only known-safe raster formats pass.
 */
const ALLOWED_FILE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/avif",
];

/**
 * Check whether a File object has an allowed image MIME type.
 * Uses an allowlist of safe raster formats; SVGs are explicitly excluded.
 */
export const isAllowedImageFile = (file) => {
  if (!file || typeof file.type !== "string") return false;
  return ALLOWED_FILE_MIMES.includes(file.type.toLowerCase());
};

/**
 * Check whether a URL is safe to use as an image source.
 * Accepts only blob: URLs (same-origin, valid UUID path) and data: URLs with image MIME types.
 */
export const isAllowedImageSrc = (src) => {
  if (!src || typeof src !== "string") return false;
  if (src.startsWith("blob:")) {
    // Validate blob URL structure: blob:<origin>/<uuid>
    // Only accept blobs created by the current origin to prevent external blob references.
    const blobContent = src.slice(5); // strip "blob:"
    const origin = globalThis.location?.origin;
    const protocol = globalThis.location?.protocol;
    // For file: protocol, the origin is opaque ("null") and blob URL formats vary
    // by browser (e.g. "blob:null/<uuid>" or "blob:<uuid>"). Just validate the UUID.
    if (protocol === "file:" || origin === "null") {
      const uuid = blobContent.replace(/^(null|file:\/\/\/?)?\/?/, "");
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
    }
    if (!origin || !blobContent.startsWith(origin + "/")) return false;
    const uuid = blobContent.slice(origin.length + 1);
    // RFC 4122 UUID format (hex with hyphens, 36 chars)
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  }
  if (src.startsWith("data:")) return ALLOWED_IMAGE_MIMES.test(src);
  return false;
};

/**
 * Sanitize a filename string from untrusted input.
 * Strips control characters and limits length.
 */
export const sanitizeFilename = (name) => {
  if (!name || typeof name !== "string") return "";
  // Remove control characters (U+0000–U+001F, U+007F–U+009F)
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
  return cleaned.slice(0, MAX_FILENAME_LENGTH);
};

/**
 * Validate that a string looks like a safe DOM element ID.
 * IDs in this app are generated internally (e.g. "toolbar-img-<uuid>" or "grid-img-<n>"),
 * so we reject anything that doesn't match a reasonable pattern.
 */
export const isValidElementId = (id) => {
  if (!id || typeof id !== "string") return false;
  // Allow alphanumeric, hyphens, underscores, and dots; max 128 chars
  return /^[\w.-]{1,128}$/.test(id);
};

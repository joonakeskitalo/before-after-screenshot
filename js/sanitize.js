/**
 * Sanitization utilities for untrusted clipboard/dataTransfer data.
 */

// Maximum length for filenames from external sources
const MAX_FILENAME_LENGTH = 255;

// Allowed image MIME types for data: URLs
const ALLOWED_IMAGE_MIMES = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml|bmp|ico|avif)/i;

/**
 * Check whether a URL is safe to use as an image source.
 * Accepts only blob: URLs and data: URLs with image MIME types.
 */
export const isAllowedImageSrc = (src) => {
  if (!src || typeof src !== "string") return false;
  if (src.startsWith("blob:")) return true;
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
  return /^[\w.\-]{1,128}$/.test(id);
};

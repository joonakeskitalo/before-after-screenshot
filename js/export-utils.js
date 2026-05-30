// Utility: scale an image blob by a factor, returns a new PNG blob
export const scaleBlob = async (blob, scale) => {
  const bitmap = await createImageBitmap(blob);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/png" });
};

// Utility: crop and scale in a single pass to avoid double decode/encode
export const cropAndScaleBlob = async (blob, maxHeight, scale) => {
  const bitmap = await createImageBitmap(blob);
  const srcW = bitmap.width;
  const srcH = Math.min(bitmap.height, maxHeight);
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);
  const canvas = new OffscreenCanvas(dstW, dstH);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, srcW, srcH, 0, 0, dstW, dstH);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/png" });
};

// Generate a timestamped filename for downloads
export const generateFilename = () => {
  const now = new Date();
  const ts = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    "_" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
  return `scr_${ts}.png`;
};

// Trigger a file download from a blob
export const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

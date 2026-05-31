/**
 * Shared color filter pixel-manipulation kernels.
 *
 * This is the single source of truth for all filter math used by:
 * - The main-thread canvas filter (applyFilterToCanvas in filter-preview.js)
 * - The Web Worker pool (inline worker in filter-preview.js)
 * - The synchronous export path (copyWithAllFilters in copy-export.js)
 *
 * When adding or modifying a filter, only this file needs to change.
 */

// Color matrix definitions matching the SVG filters
export const COLOR_MATRICES = {
  protanopia: [
    0.567, 0.433, 0, 0, 0,
    0.558, 0.442, 0, 0, 0,
    0, 0.242, 0.758, 0, 0,
    0, 0, 0, 1, 0,
  ],
  deuteranopia: [
    0.625, 0.375, 0, 0, 0,
    0.7, 0.3, 0, 0, 0,
    0, 0.3, 0.7, 0, 0,
    0, 0, 0, 1, 0,
  ],
  tritanopia: [
    0.95, 0.05, 0, 0, 0,
    0, 0.433, 0.567, 0, 0,
    0, 0.475, 0.525, 0, 0,
    0, 0, 0, 1, 0,
  ],
  achromatopsia: [
    0.299, 0.587, 0.114, 0, 0,
    0.299, 0.587, 0.114, 0, 0,
    0.299, 0.587, 0.114, 0, 0,
    0, 0, 0, 1, 0,
  ],
};

/** Midpoint of the 0–255 color range, used as the pivot for contrast scaling. */
const CHANNEL_MIDPOINT = 128;

/** Apply a linear contrast adjustment in place. */
const applyContrast = (d, factor) => {
  const intercept = CHANNEL_MIDPOINT * (1 - factor);
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = d[i]     * factor + intercept;
    d[i + 1] = d[i + 1] * factor + intercept;
    d[i + 2] = d[i + 2] * factor + intercept;
  }
};

/**
 * Apply a named filter to raw ImageData (mutates in place).
 * Returns the same ImageData reference for convenience.
 */
export const applyFilterToImageData = (imageData, filter) => {
  if (!filter || filter === "none") return imageData;
  if (imageData.width === 0 || imageData.height === 0) return imageData;

  const d = imageData.data;

  if (filter === "grayscale") {
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = gray;
    }
  } else if (filter === "low-contrast") {
    applyContrast(d, 0.85);
  } else if (filter === "high-contrast") {
    applyContrast(d, 1.5);
  } else if (COLOR_MATRICES[filter]) {
    const matrix = COLOR_MATRICES[filter];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      d[i] = matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4];
      d[i + 1] = matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9];
      d[i + 2] = matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14];
    }
  } else {
    console.warn(`[filter-kernels] Unrecognized filter: "${filter}". Returning unmodified imageData.`);
  }

  return imageData;
};

/**
 * Generate the source code for the Web Worker.
 * The worker reuses the same COLOR_MATRICES and applyFilterToImageData logic
 * by serializing the live function via .toString(), so there is only one
 * source of truth. The result is cached to avoid repeated string allocation.
 */
let _cachedWorkerSource;
export const generateWorkerSource = () => {
  if (!_cachedWorkerSource) {
    _cachedWorkerSource = `
const COLOR_MATRICES = ${JSON.stringify(COLOR_MATRICES)};

const CHANNEL_MIDPOINT = ${CHANNEL_MIDPOINT};

const applyContrast = ${applyContrast.toString()};

const applyFilterToImageData = ${applyFilterToImageData.toString()};

self.onmessage = async (e) => {
  const { type, imageBitmap, filter, id } = e.data;
  if (type === "apply") {
    try {
      const w = imageBitmap.width;
      const h = imageBitmap.height;
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imageBitmap, 0, 0);

      if (filter !== "none") {
        const imageData = ctx.getImageData(0, 0, w, h);
        applyFilterToImageData(imageData, filter);
        ctx.putImageData(imageData, 0, 0);
      }

      const blob = await canvas.convertToBlob({ type: "image/png" });
      self.postMessage({ type: "result", blob, id });
    } catch (err) {
      self.postMessage({ type: "error", error: err.message, id });
    } finally {
      imageBitmap.close();
    }
  }
};
`;
  }
  return _cachedWorkerSource;
};

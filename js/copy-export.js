import state from './state.js';
import { redrawAllCanvasesForExport } from './drawing.js';
import { FILTER_OPTIONS, FILTER_LABELS } from './color-filter.js';
import { domToBlob } from '../lib/modern-screenshot.mjs';
import {
  EXPORT_GAP, EXPORT_GAP_FULLSIZE, EXPORT_PADDING_STANDARD, EXPORT_PADDING_FULLSIZE,
  EXPORT_COLLAPSED_DROP_SIZE, EXPORT_BASE_FONT_SIZE, EXPORT_FONT_SCALE_FACTOR,
  GRID_SIZE_EXPORT_PADDING, COMPOSITE_IMAGE_GAP,
} from './constants.js';
import {
  waitForImagesDecode, prepareForExport, restoreAfterExport,
  finalizeLayoutForCapture, captureToBlob, exportNodeFilter,
  prepareOutputScaleExport, restoreOutputScaleExport,
} from './export-prepare.js';
import {
  scaleBlob, cropAndScaleBlob, generateFilename, triggerDownload,
} from './export-utils.js';
import { COLOR_MATRICES, applyFilterToCanvas, closeFilterPreview, previewAllFilters } from './filter-preview.js';

// Guard against concurrent exports
let isExporting = false;

const setElementWidths = (arr, size) => {
  const images = state.cardsEl.querySelectorAll("img");
  const drops = state.cardsEl.querySelectorAll("div.drop");

  const elements = [...arr, ...images, ...drops].filter(
    (el) => el.tagName !== "TEXTAREA",
  );

  elements.forEach((x) => {
    x.style.width = size;
    x.style.height = size;
  });
};

// --- Shared export-to-blob logic ---

/**
 * Core export function that prepares the DOM, captures a blob, and restores state.
 * Both copy and download are thin wrappers around this.
 */
const exportToBlob = async (useFullSize = false, resolutionScale = 1) => {
  const ctx = prepareForExport();
  try {
    const { effectiveCols, allImages, allDrops } = ctx;

    state.root.style.setProperty("--image-max-width", "unset");
    state.root.style.setProperty("--gap", `${EXPORT_GAP}px`);
    state.root.style.setProperty("--text-fontsize", `${EXPORT_BASE_FONT_SIZE}pt`);
    state.root.style.setProperty("--grid-zoom-cell-height", `0px`);

    allImages.forEach((img) => {
      if (img.src && img.style.display !== "none") {
        img.style.objectFit = "contain";
        img.style.height = "auto";
        img.style.maxHeight = "unset";
      }
    });

    allDrops.forEach((drop) => {
      drop.style.height = "auto";
    });

    if (useFullSize) {
      const baseFontSize = EXPORT_BASE_FONT_SIZE;
      const fontSize = Math.max(baseFontSize, Math.floor(baseFontSize * resolutionScale * EXPORT_FONT_SCALE_FACTOR));
      state.root.style.setProperty("--text-fontsize", `${fontSize}pt`);

      const gap = EXPORT_GAP_FULLSIZE * resolutionScale;
      state.root.style.setProperty("--gap", `${gap}px`);

      allDrops.forEach((drop) => {
        const img = drop.querySelector("img");
        if (!img || !img.src || img.style.display === "none") {
          drop.style.width = `${EXPORT_COLLAPSED_DROP_SIZE}px`;
          drop.style.height = `${EXPORT_COLLAPSED_DROP_SIZE}px`;
        }
      });

      allImages.forEach((img) => {
        if (img.src && img.style.display !== "none") {
          img.style.width =
            Math.floor(img.naturalWidth * resolutionScale) + "px";
          img.style.height = "auto";
        }
      });
    }

    const initialPadding = useFullSize ? EXPORT_PADDING_FULLSIZE : EXPORT_PADDING_STANDARD;
    const padding = Math.floor(initialPadding * resolutionScale);
    const captureHeight = finalizeLayoutForCapture(effectiveCols, padding);

    const exportScale = useFullSize ? resolutionScale : 1;
    const blob = await captureToBlob(captureHeight, exportScale);

    restoreAfterExport(ctx);
    return blob;
  } catch (error) {
    console.error(error);
    restoreAfterExport(ctx);
    return null;
  } finally {
    ctx.showAfterExport();
  }
};

/**
 * Core output-scale export: renders at full resolution then scales down.
 */
const exportToBlobWithOutputScale = async (outputScale) => {
  const ctx = prepareForExport();
  try {
    const { cappedMultiplier, filenameLabels, captureHeight } = prepareOutputScaleExport(ctx, outputScale);

    await redrawAllCanvasesForExport(cappedMultiplier);
    await waitForImagesDecode(state.cardsEl);

    let blob = await domToBlob(state.cardsEl, {
      height: captureHeight,
      filter: exportNodeFilter,
    });

    const scaledBlob = await cropAndScaleBlob(blob, captureHeight, outputScale);

    restoreOutputScaleExport(filenameLabels);
    restoreAfterExport(ctx);
    return scaledBlob;
  } catch (error) {
    console.error(error);
    restoreOutputScaleExport(state.cardsEl.querySelectorAll(".grid-cell-filename"));
    restoreAfterExport(ctx);
    return null;
  } finally {
    ctx.showAfterExport();
  }
};

// --- Copy wrappers ---

const copyAsImage = async (useFullSize = false, resolutionScale = 1) => {
  const blob = await exportToBlob(useFullSize, resolutionScale);
  if (blob) {
    navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  }
};

const copyAsImageWithOutputScale = async (outputScale) => {
  const blob = await exportToBlobWithOutputScale(outputScale);
  if (blob) {
    navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  }
};

// --- Download wrappers ---

const downloadAsImage = async (useFullSize = false, resolutionScale = 1) => {
  const blob = await exportToBlob(useFullSize, resolutionScale);
  if (blob) {
    triggerDownload(blob, generateFilename());
  }
};

const downloadAsImageWithOutputScale = async (outputScale) => {
  const blob = await exportToBlobWithOutputScale(outputScale);
  if (blob) {
    triggerDownload(blob, generateFilename());
  }
};

// --- Scale dispatchers ---

const copyWithScale = () => {
  if (isExporting) return;
  isExporting = true;

  const container = document.querySelector(".content-container");
  const savedScrollTop = container.scrollTop;
  const savedScrollLeft = container.scrollLeft;

  const select = document.getElementById("copy-scale");
  const value = select.value;
  let doExport;
  if (value.startsWith("output-")) {
    const outputScale = parseFloat(value.replace("output-", ""));
    doExport = copyAsImageWithOutputScale(outputScale);
  } else {
    const scale = parseFloat(value);
    doExport = copyAsImage(true, scale);
  }

  Promise.resolve(doExport).finally(() => {
    isExporting = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.scrollTop = savedScrollTop;
        container.scrollLeft = savedScrollLeft;
      });
    });
  });
};

const copySelectedRows = () => {
  if (isExporting) return;
  isExporting = true;

  const container = document.querySelector(".content-container");
  const savedScrollTop = container.scrollTop;
  const savedScrollLeft = container.scrollLeft;

  const hasSelection = state.selectedRows.size > 0 || state.selectedCells.size > 0 || state.focusedCellIndex >= 0;

  const allCells = hasSelection ? state.getCells() : [];
  const hiddenCells = [];

  if (hasSelection) {
    const selectedColCount = state.gridCols;

    if (state.selectedRows.size > 0) {
      allCells.forEach((cell) => {
        const row = parseInt(cell.dataset.row, 10);
        if (!state.selectedRows.has(row)) {
          cell.style.display = "none";
          hiddenCells.push(cell);
        }
      });
    } else if (state.selectedCells.size > 0) {
      const cellsArray = [...allCells];
      cellsArray.forEach((cell, index) => {
        if (!state.selectedCells.has(index)) {
          cell.style.display = "none";
          hiddenCells.push(cell);
        }
      });
    } else {
      const cellsArray = [...allCells];
      cellsArray.forEach((cell, index) => {
        if (index !== state.focusedCellIndex) {
          cell.style.display = "none";
          hiddenCells.push(cell);
        }
      });
    }

    state.gridEl.style.gridTemplateColumns = `repeat(${selectedColCount}, auto)`;
    state.gridEl.style.gridTemplateRows = "auto";
  }

  const select = document.getElementById("copy-scale");
  const value = select.value;

  let doExport;
  if (value.startsWith("output-")) {
    const outputScale = parseFloat(value.replace("output-", ""));
    doExport = copyAsImageWithOutputScale(outputScale);
  } else {
    const scale = parseFloat(value);
    doExport = copyAsImage(true, scale);
  }

  Promise.resolve(doExport).finally(() => {
    hiddenCells.forEach((cell) => {
      cell.style.display = "";
    });
    isExporting = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.scrollTop = savedScrollTop;
        container.scrollLeft = savedScrollLeft;
      });
    });
  });
};

const downloadWithScale = () => {
  if (isExporting) return;
  isExporting = true;

  const container = document.querySelector(".content-container");
  const savedScrollTop = container.scrollTop;
  const savedScrollLeft = container.scrollLeft;

  const select = document.getElementById("copy-scale");
  const value = select.value;

  const allCells = state.getCells();
  const hiddenCells = [];

  if (state.selectedRows.size > 0 || state.selectedCells.size > 0 || state.focusedCellIndex >= 0) {
    const selectedColCount = state.gridCols;

    if (state.selectedRows.size > 0) {
      allCells.forEach((cell) => {
        const row = parseInt(cell.dataset.row, 10);
        if (!state.selectedRows.has(row)) {
          cell.style.display = "none";
          hiddenCells.push(cell);
        }
      });
    } else if (state.selectedCells.size > 0) {
      const cellsArray = [...allCells];
      cellsArray.forEach((cell, index) => {
        if (!state.selectedCells.has(index)) {
          cell.style.display = "none";
          hiddenCells.push(cell);
        }
      });
    } else {
      const cellsArray = [...allCells];
      cellsArray.forEach((cell, index) => {
        if (index !== state.focusedCellIndex) {
          cell.style.display = "none";
          hiddenCells.push(cell);
        }
      });
    }

    state.gridEl.style.gridTemplateColumns = `repeat(${selectedColCount}, auto)`;
    state.gridEl.style.gridTemplateRows = "auto";
  }

  let doExport;
  if (value.startsWith("output-")) {
    const outputScale = parseFloat(value.replace("output-", ""));
    doExport = downloadAsImageWithOutputScale(outputScale);
  } else {
    const scale = parseFloat(value);
    doExport = downloadAsImage(true, scale);
  }

  Promise.resolve(doExport).finally(() => {
    hiddenCells.forEach((cell) => {
      cell.style.display = "";
    });
    isExporting = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.scrollTop = savedScrollTop;
        container.scrollLeft = savedScrollLeft;
      });
    });
  });
};

// --- Grid-size copy ---

const copyAsGridSize = async () => {
  const ctx = prepareForExport();
  try {
    const { effectiveCols, allImages, allDrops } = ctx;

    const imageSizes = [];
    allImages.forEach((img) => {
      if (img.src && img.style.display !== "none") {
        imageSizes.push({ img, width: img.clientWidth, height: img.clientHeight });
      }
    });

    imageSizes.forEach(({ img, width, height }) => {
      img.style.width = width + "px";
      img.style.height = height + "px";
      img.style.objectFit = "contain";
      img.style.maxHeight = "unset";
    });

    allDrops.forEach((drop) => {
      const img = drop.querySelector("img");
      if (!img || !img.src || img.style.display === "none") {
        drop.style.width = `${EXPORT_COLLAPSED_DROP_SIZE}px`;
        drop.style.height = `${EXPORT_COLLAPSED_DROP_SIZE}px`;
      }
    });

    const captureHeight = finalizeLayoutForCapture(effectiveCols, GRID_SIZE_EXPORT_PADDING);
    const blob = await captureToBlob(captureHeight, 1);

    navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);

    restoreAfterExport(ctx);
  } catch (error) {
    console.error(error);
    restoreAfterExport(ctx);
  } finally {
    ctx.showAfterExport();
  }
};

// --- UI helpers ---

const updateCopySelectedBtn = () => {
  const btn = document.getElementById("copy-btn");
  if (!btn) return;
  if (state.selectedRows.size > 0) {
    btn.textContent = `Copy (${state.selectedRows.size} rows)`;
  } else if (state.selectedCells.size > 0) {
    btn.textContent = `Copy (${state.selectedCells.size} cells)`;
  } else if (state.focusedCellIndex >= 0) {
    btn.textContent = `Copy (1 cell)`;
  } else {
    btn.textContent = "Copy";
  }
};

const attachDragTo = (img) => {
  if (!img) return;
  img.draggable = true;
  img.addEventListener("dragstart", (e) => {
    if (!img.id) {
      img.id = `drop-img-${Math.random().toString(36).slice(2)}`;
    }

    const cell = e.target.closest(".grid-cell");
    const textArea = cell ? cell.querySelector("textarea") : null;

    const canvas = cell ? cell.querySelector(".drawing-canvas") : null;
    const drawingData = canvas && state.canvasDataMap.get(canvas) ? state.canvasDataMap.get(canvas).paths : [];

    e.dataTransfer.setData("text/plain", img.src);
    e.dataTransfer.setData("id", img.id);
    e.dataTransfer.setData("note", textArea ? textArea.value : "");
    e.dataTransfer.setData("drawings", JSON.stringify(drawingData));
    e.dataTransfer.effectAllowed = "move";
  });
};

const clearOrCopyImage = async (event, img, drop, span) => {
  event.preventDefault();
  event.stopImmediatePropagation();

  if (event.metaKey) {
    img.src = "";
    img.style.display = "none";
    drop.style.border = "var(--border)";
    span.style.display = "block";
    const cell = drop.closest(".grid-cell");
    if (cell) state.updateFilenameLabel(cell);
  }
};

// --- Bulk download ---

const bulkDownloadImages = async () => {
  const images = [];

  const isImageSrc = (src) => src && (src.startsWith("data:") || src.startsWith("blob:"));

  const bottomToolbarInner = document.getElementById("bottom-toolbar-inner");
  if (bottomToolbarInner) {
    bottomToolbarInner.querySelectorAll(".bottom-toolbar-item img").forEach((img) => {
      if (isImageSrc(img.src)) {
        images.push({ src: img.src, name: img.alt || "" });
      }
    });
  }

  const allCells = state.getCells();

  if (state.selectedRows.size > 0) {
    allCells.forEach((cell) => {
      const row = parseInt(cell.dataset.row, 10);
      if (!state.selectedRows.has(row)) return;
      const img = cell.querySelector("img");
      if (img && isImageSrc(img.src) && img.style.display !== "none") {
        images.push({ src: img.src, name: img.alt || "" });
      }
    });
  } else if (state.selectedCells.size > 0) {
    allCells.forEach((cell, index) => {
      if (!state.selectedCells.has(index)) return;
      const img = cell.querySelector("img");
      if (img && isImageSrc(img.src) && img.style.display !== "none") {
        images.push({ src: img.src, name: img.alt || "" });
      }
    });
  } else {
    allCells.forEach((cell) => {
      const img = cell.querySelector("img");
      if (img && isImageSrc(img.src) && img.style.display !== "none") {
        images.push({ src: img.src, name: img.alt || "" });
      }
    });
  }

  if (images.length === 0) return;

  for (let index = 0; index < images.length; index++) {
    const image = images[index];
    let filename = image.name || `image-${index + 1}`;
    const ext = image.src.startsWith("data:image/png") ? ".png" :
                image.src.startsWith("data:image/jpeg") ? ".jpg" :
                image.src.startsWith("data:image/webp") ? ".webp" : ".png";
    filename = filename.replace(/\.[^.]+$/, "") + ext;

    const response = await fetch(image.src);
    const blob = await response.blob();
    triggerDownload(blob, filename);

    if (index < images.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
};

// --- Raw image copy ---

const copySelectedRawImages = async () => {
  if (isExporting) return;
  isExporting = true;
  try {
    const allCells = state.getCells();
    const indices = state.selectedCells.size > 0
      ? [...state.selectedCells].sort((a, b) => a - b)
      : state.selectedRows.size > 0
        ? allCells.reduce((acc, cell, i) => {
            if (state.selectedRows.has(parseInt(cell.dataset.row, 10))) acc.push(i);
            return acc;
          }, [])
        : state.focusedCellIndex >= 0
          ? [state.focusedCellIndex]
          : [];

    const images = [];
    for (const idx of indices) {
      const cell = allCells[idx];
      if (!cell) continue;
      const img = cell.querySelector("img");
      if (img && img.src && img.style.display !== "none") {
        images.push(img);
      }
    }

    if (images.length === 0) return;

    if (images.length === 1) {
      const response = await fetch(images[0].src);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return;
    }

    const bitmaps = await Promise.all(images.map((img) => createImageBitmap(img)));
    const gap = COMPOSITE_IMAGE_GAP;
    const totalWidth = bitmaps.reduce((sum, bm) => sum + bm.width, 0) + gap * (bitmaps.length - 1);
    const maxHeight = Math.max(...bitmaps.map((bm) => bm.height));

    const canvas = new OffscreenCanvas(totalWidth, maxHeight);
    const ctx = canvas.getContext("2d");
    let x = 0;
    for (const bm of bitmaps) {
      const y = Math.round((maxHeight - bm.height) / 2);
      ctx.drawImage(bm, x, y);
      x += bm.width + gap;
      bm.close();
    }

    const blob = await canvas.convertToBlob({ type: "image/png" });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } finally {
    isExporting = false;
  }
};

// --- Filter composite copy ---

const copyWithAllFilters = async () => {
  if (isExporting) return;
  isExporting = true;
  try {
    const allCells = state.getCells();

    const indices = state.selectedCells.size > 0
      ? [...state.selectedCells].sort((a, b) => a - b)
      : state.selectedRows.size > 0
        ? allCells.reduce((acc, cell, i) => {
            if (state.selectedRows.has(parseInt(cell.dataset.row, 10))) acc.push(i);
            return acc;
          }, [])
        : state.focusedCellIndex >= 0
          ? [state.focusedCellIndex]
          : allCells.map((_, i) => i);

    const sourceImages = [];
    for (const idx of indices) {
      const cell = allCells[idx];
      if (!cell) continue;
      const img = cell.querySelector("img");
      if (img && img.src && img.style.display !== "none") {
        sourceImages.push(img);
      }
    }

    if (sourceImages.length === 0) return;

    const filters = FILTER_OPTIONS;
    const gap = 4;

    const scaleSelect = document.getElementById("copy-scale");
    const scaleValue = scaleSelect.value;
    let imageScale;
    if (scaleValue.startsWith("output-")) {
      imageScale = parseFloat(scaleValue.replace("output-", ""));
    } else {
      imageScale = parseFloat(scaleValue);
    }

    const bitmaps = await Promise.all(sourceImages.map((img) => createImageBitmap(img)));

    const maxNatW = Math.round(Math.max(...bitmaps.map((bm) => bm.width)) * imageScale);
    const maxNatH = Math.round(Math.max(...bitmaps.map((bm) => bm.height)) * imageScale);

    const labelFontSize = Math.max(14, Math.round(maxNatW * 0.03));
    const labelHeight = labelFontSize + 12;

    const cellW = maxNatW;
    const cellH = maxNatH + labelHeight;

    const cols = filters.length;
    const rows = bitmaps.length;

    const totalW = cols * cellW + (cols - 1) * gap;
    const totalH = rows * cellH + (rows - 1) * gap;

    const canvas = new OffscreenCanvas(totalW, totalH);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, totalW, totalH);

    const applyMatrix = (imageData, matrix) => {
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
        d[i]     = Math.min(255, Math.max(0, matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4] * 255));
        d[i + 1] = Math.min(255, Math.max(0, matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9] * 255));
        d[i + 2] = Math.min(255, Math.max(0, matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14] * 255));
      }
    };

    const applyGrayscale = (imageData) => {
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = gray;
      }
    };

    const applyContrast = (imageData, factor) => {
      const d = imageData.data;
      const intercept = 128 * (1 - factor);
      for (let i = 0; i < d.length; i += 4) {
        d[i]     = Math.min(255, Math.max(0, d[i] * factor + intercept));
        d[i + 1] = Math.min(255, Math.max(0, d[i + 1] * factor + intercept));
        d[i + 2] = Math.min(255, Math.max(0, d[i + 2] * factor + intercept));
      }
    };

    for (let row = 0; row < rows; row++) {
      const bm = bitmaps[row];

      for (let col = 0; col < cols; col++) {
        const filter = filters[col];
        const x = col * (cellW + gap);
        const y = row * (cellH + gap);

        const scale = Math.min(cellW / bm.width, maxNatH / bm.height);
        const drawW = Math.round(bm.width * scale);
        const drawH = Math.round(bm.height * scale);
        const imgX = x + Math.round((cellW - drawW) / 2);
        const imgY = y + Math.round((maxNatH - drawH) / 2);

        if (filter === "none") {
          ctx.drawImage(bm, imgX, imgY, drawW, drawH);
        } else {
          const tmpCanvas = new OffscreenCanvas(drawW, drawH);
          const tmpCtx = tmpCanvas.getContext("2d");
          tmpCtx.drawImage(bm, 0, 0, drawW, drawH);
          const imageData = tmpCtx.getImageData(0, 0, drawW, drawH);

          if (filter === "grayscale") {
            applyGrayscale(imageData);
          } else if (filter === "low-contrast") {
            applyContrast(imageData, 0.85);
          } else if (filter === "high-contrast") {
            applyContrast(imageData, 1.5);
          } else if (COLOR_MATRICES[filter]) {
            applyMatrix(imageData, COLOR_MATRICES[filter]);
          }

          tmpCtx.putImageData(imageData, 0, 0);
          ctx.drawImage(tmpCanvas, imgX, imgY);
        }

        ctx.fillStyle = "#333333";
        ctx.font = `500 ${labelFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(FILTER_LABELS[filter] || filter, x + cellW / 2, y + maxNatH + 6);
      }
    }

    bitmaps.forEach((bm) => bm.close());

    const blob = await canvas.convertToBlob({ type: "image/png" });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } finally {
    isExporting = false;
  }
};

// Wire up copy buttons
document.getElementById("copy-btn").addEventListener("click", copySelectedRows);
document.getElementById("download-btn").addEventListener("click", downloadWithScale);
document.getElementById("bulk-download-btn").addEventListener("click", bulkDownloadImages);

export {
  setElementWidths,
  exportToBlob,
  exportToBlobWithOutputScale,
  copyAsImage,
  copyWithScale,
  copyAsImageWithOutputScale,
  downloadAsImage,
  downloadWithScale,
  downloadAsImageWithOutputScale,
  bulkDownloadImages,
  scaleBlob,
  copySelectedRows,
  copySelectedRawImages,
  copyAsGridSize,
  copyWithAllFilters,
  previewAllFilters,
  closeFilterPreview,
  updateCopySelectedBtn,
  attachDragTo,
  clearOrCopyImage,
};

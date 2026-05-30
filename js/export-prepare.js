import state from './state.js';
import { redrawAllCanvasesForExport, restoreAllCanvases } from './drawing.js';
import { applyGridZoom } from './zoom.js';
import { domToBlob } from '../lib/modern-screenshot.mjs';
import {
  EXPORT_COLLAPSED_DROP_SIZE,
  OUTPUT_SCALE_RENDER_MULTIPLIER, OUTPUT_SCALE_GAP_BASE, OUTPUT_SCALE_FONT_BASE,
  OUTPUT_SCALE_FILENAME_FONT, OUTPUT_SCALE_PADDING,
} from './constants.js';

// Ensure all visible images within a container are fully decoded before capture.
// modern-screenshot serializes the DOM to SVG foreignObject and renders it — if images
// haven't finished decoding (common with large data URLs), they appear blank.
export const waitForImagesDecode = async (container) => {
  const images = container.querySelectorAll("img");
  const promises = [];
  for (const img of images) {
    if (img.src && img.style.display !== "none" && img.naturalWidth > 0) {
      promises.push(img.decode().catch(() => {}));
    }
  }
  await Promise.all(promises);
};

// Hide the cards container during export to prevent the UI from flashing
// while styles are temporarily modified for capture.
export const hideForExport = () => {
  const container = document.querySelector(".content-container");
  const rect = container.getBoundingClientRect();

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    z-index: 1;
    pointer-events: none;
  `;
  overlay.style.background = getComputedStyle(state.cardsEl).backgroundColor;
  document.body.appendChild(overlay);

  return () => {
    overlay.remove();
  };
};

// Shared filter function for capture — avoids creating a new closure per export call.
export const exportNodeFilter = (node) => {
  const tag = node.tagName;
  if (tag === "SPAN") return false;
  if (tag === "IMG") return node.src.startsWith("data:") || node.src.startsWith("blob:");
  if (tag === "CANVAS") return node.style.display !== "none";
  const cl = node.classList;
  if (cl) {
    if (cl.contains("clear-drawing-btn") ||
        cl.contains("drawing-text-input") ||
        cl.contains("row-controls") ||
        cl.contains("row-select-cb")) return false;
    if (cl.contains("grid-cell-filename") && !state.showFilenames) return false;
  }
  return true;
};

export const cellHasVisibleContent = (cell) => {
  if (cell.style.display === "none") return false;
  const img = cell.querySelector("img");
  const hasImage = img && img.src && img.style.display !== "none";
  const textarea = cell.querySelector("textarea");
  const hasText = textarea && textarea.value.trim() !== "";
  return hasImage || hasText;
};

// Hide entire rows/columns that contain no visible images, returns a restore function
export const hideEmptyRowsForExport = () => {
  const allCells = state.getCells();
  const rows = state.gridRows;
  const cols = state.gridCols;
  const removedCells = [];

  const occupiedRows = new Set();
  const occupiedCols = new Set();

  for (const cell of allCells) {
    if (cellHasVisibleContent(cell)) {
      occupiedRows.add(parseInt(cell.dataset.row));
      occupiedCols.add(parseInt(cell.dataset.col));
    }
  }

  for (let row = 0; row < rows; row++) {
    if (occupiedRows.has(row)) continue;
    const rowCells = allCells.filter((cell) => parseInt(cell.dataset.row) === row);
    rowCells.forEach((cell) => {
      removedCells.push({ cell, nextSibling: cell.nextSibling });
      cell.remove();
    });
  }

  for (let col = 0; col < cols; col++) {
    if (occupiedCols.has(col)) continue;
    const colCells = allCells.filter(
      (cell) => parseInt(cell.dataset.col) === col && occupiedRows.has(parseInt(cell.dataset.row))
    );
    colCells.forEach((cell) => {
      if (cell.parentElement) {
        removedCells.push({ cell, nextSibling: cell.nextSibling });
        cell.remove();
      }
    });
  }

  const rowControls = state.gridEl.parentElement.querySelector(".row-controls");
  const rowControlsDisplay = rowControls ? rowControls.style.display : null;
  if (rowControls) {
    rowControls.style.display = "none";
  }

  const effectiveColCount = occupiedCols.size || 1;

  return {
    restore: () => {
      if (rowControls) {
        rowControls.style.display = rowControlsDisplay;
      }
      for (let i = removedCells.length - 1; i >= 0; i--) {
        const { cell, nextSibling } = removedCells[i];
        if (nextSibling && nextSibling.parentElement) {
          state.gridEl.insertBefore(cell, nextSibling);
        } else {
          state.gridEl.appendChild(cell);
        }
      }
    },
    effectiveCols: effectiveColCount,
  };
};

// Strip keyboard selection/focus classes before export and return a restore function
export const hideSelectionForExport = () => {
  const selected = state.getCells().filter(c => c.classList.contains("keyboard-selected"));
  const focused = state.getCells().filter(c => c.classList.contains("keyboard-focused"));
  selected.forEach((cell) => cell.classList.remove("keyboard-selected"));
  focused.forEach((cell) => cell.classList.remove("keyboard-focused"));
  return () => {
    selected.forEach((cell) => cell.classList.add("keyboard-selected"));
    focused.forEach((cell) => cell.classList.add("keyboard-focused"));
  };
};

// --- Shared export prepare/restore pair ---
export const prepareForExport = () => {
  const showAfterExport = hideForExport();
  const restoreSelection = hideSelectionForExport();
  const { restore: restoreEmptyRows, effectiveCols: contentCols } = hideEmptyRowsForExport();

  const currentTemplateCols = state.gridEl.style.gridTemplateColumns;
  const colMatch = currentTemplateCols && currentTemplateCols.match(/repeat\((\d+)/);
  const effectiveCols = colMatch ? Math.min(parseInt(colMatch[1]), contentCols) : contentCols;

  const allCells = state.getCells();
  allCells.forEach((cell) => {
    cell.style.overflow = "visible";
    cell.style.minHeight = "0";
  });

  const allImages = state.cardsEl.querySelectorAll("img");
  const allDrops = state.cardsEl.querySelectorAll(".drop");

  allDrops.forEach((drop) => {
    drop.style.overflow = "visible";
  });

  state.root.style.setProperty("--border", `unset`);
  state.gridEl.style.outline = "none";

  const prevZoom = state.gridZoom;

  return {
    showAfterExport,
    restoreSelection,
    restoreEmptyRows,
    effectiveCols,
    allCells,
    allImages,
    allDrops,
    prevZoom,
  };
};

export const restoreAfterExport = (ctx) => {
  const { allCells, allImages, allDrops, prevZoom, restoreEmptyRows, restoreSelection } = ctx;

  allCells.forEach((cell) => {
    cell.style.overflow = null;
    cell.style.minHeight = null;
  });

  allImages.forEach((img) => {
    img.style.objectFit = null;
    img.style.height = null;
    img.style.maxHeight = null;
    img.style.width = null;
  });

  allDrops.forEach((drop) => {
    drop.style.overflow = null;
    drop.style.height = null;
    drop.style.width = null;
  });

  state.cardsEl.style.padding = "16px";
  state.cardsEl.style.width = null;
  state.cardsEl.style.height = null;
  state.cardsEl.style.flex = null;
  state.cardsEl.style.minHeight = null;
  state.gridEl.style.outline = null;
  state.gridEl.style.width = null;
  state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;
  state.root.style.setProperty("--border", `1px dashed rgb(167, 165, 165)`);

  applyGridZoom(prevZoom);
  restoreAllCanvases();
  restoreEmptyRows();
  restoreSelection();
};

// Finalize the grid layout for capture: set grid template, padding, lock width,
// and return the measured capture height.
export const finalizeLayoutForCapture = (effectiveCols, padding) => {
  state.gridEl.style.gridTemplateRows = "auto";
  state.gridEl.style.gridTemplateColumns = `repeat(${effectiveCols}, auto)`;

  state.cardsEl.style.padding = `8px ${padding}px`;
  state.cardsEl.style.width = "fit-content";
  state.cardsEl.style.height = "auto";
  state.cardsEl.style.flex = "none";
  state.cardsEl.style.minHeight = "0";

  const gridRenderedWidth = state.gridEl.offsetWidth;
  state.gridEl.style.width = `${gridRenderedWidth}px`;

  return state.cardsEl.offsetHeight;
};

// Capture the cards element to a blob, cropped to the given height.
export const captureToBlob = async (captureHeight, exportScale) => {
  await redrawAllCanvasesForExport(exportScale);
  await waitForImagesDecode(state.cardsEl);

  let blob = await domToBlob(state.cardsEl, {
    height: captureHeight,
    filter: exportNodeFilter,
  });

  return cropBlobToHeight(blob, captureHeight);
};

// Utility: crop a blob to a maximum height (removes excess vertical space)
export const cropBlobToHeight = async (blob, maxHeight) => {
  const bitmap = await createImageBitmap(blob);
  if (bitmap.height <= maxHeight) {
    bitmap.close();
    return blob;
  }
  const canvas = new OffscreenCanvas(bitmap.width, maxHeight);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, bitmap.width, maxHeight, 0, 0, bitmap.width, maxHeight);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/png" });
};

// Shared logic for output-scale exports (render at higher res, then downscale).
export const prepareOutputScaleExport = (ctx, outputScale) => {
  const { effectiveCols, allImages, allDrops } = ctx;
  const baseMultiplier = OUTPUT_SCALE_RENDER_MULTIPLIER;

  const imageSizes = [];
  allImages.forEach((img) => {
    if (img.src && img.style.display !== "none") {
      imageSizes.push({ img, width: img.clientWidth, height: img.clientHeight });
    }
  });

  let cappedMultiplier = baseMultiplier;
  imageSizes.forEach(({ img, width, height }) => {
    const maxForThis = Math.min(img.naturalWidth / width, img.naturalHeight / height);
    cappedMultiplier = Math.min(cappedMultiplier, maxForThis);
  });
  cappedMultiplier = Math.max(1, cappedMultiplier);

  imageSizes.forEach(({ img, width, height }) => {
    img.style.width = Math.round(width * cappedMultiplier) + "px";
    img.style.height = Math.round(height * cappedMultiplier) + "px";
    img.style.objectFit = "contain";
    img.style.maxHeight = "unset";
  });

  const scale = state.gridZoom / 100;
  const gap = Math.round(OUTPUT_SCALE_GAP_BASE * scale * cappedMultiplier);
  state.root.style.setProperty("--gap", `${gap}px`);
  const fontSize = Math.round(OUTPUT_SCALE_FONT_BASE * scale * cappedMultiplier / outputScale);
  state.root.style.setProperty("--text-fontsize", `${fontSize}pt`);

  const filenameLabels = state.cardsEl.querySelectorAll(".grid-cell-filename");
  const filenameFontSize = Math.round(OUTPUT_SCALE_FILENAME_FONT * cappedMultiplier / outputScale);
  filenameLabels.forEach((label) => {
    label.style.fontSize = `${filenameFontSize}pt`;
  });

  allDrops.forEach((drop) => {
    const img = drop.querySelector("img");
    if (!img || !img.src || img.style.display === "none") {
      drop.style.width = `${EXPORT_COLLAPSED_DROP_SIZE}px`;
      drop.style.height = `${EXPORT_COLLAPSED_DROP_SIZE}px`;
    }
  });

  const padding = Math.round(OUTPUT_SCALE_PADDING * cappedMultiplier);
  const captureHeight = finalizeLayoutForCapture(effectiveCols, padding);

  return { cappedMultiplier, filenameLabels, captureHeight };
};

export const restoreOutputScaleExport = (filenameLabels) => {
  filenameLabels.forEach((label) => {
    label.style.fontSize = null;
  });
};

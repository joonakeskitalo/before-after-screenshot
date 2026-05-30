import state from './state.js';
import { redrawAllCanvasesForExport, restoreAllCanvases, initDrawingCanvas } from './drawing.js';
import { applyGridZoom } from './zoom.js';
import { FILTER_OPTIONS, FILTER_LABELS } from './color-filter.js';

// Ensure all visible images within a container are fully decoded before capture.
// dom-to-image serializes the DOM to SVG foreignObject and renders it — if images
// haven't finished decoding (common with large data URLs), they appear blank.
const waitForImagesDecode = async (container) => {
  const images = container.querySelectorAll("img");
  const promises = [];
  for (const img of images) {
    if (img.src && img.style.display !== "none" && img.naturalWidth > 0) {
      // decode() returns a promise that resolves once the image is ready to render
      promises.push(img.decode().catch(() => {}));
    }
  }
  await Promise.all(promises);
};

// Hide the cards container during export to prevent the UI from flashing
// while styles are temporarily modified for capture. We place a fixed overlay
// over the content area with the current background color so the user sees
// a static screen instead of the layout thrashing.
const hideForExport = () => {
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

// Shared filter function for dom-to-image — avoids creating a new closure per export call.
// Checks are ordered by frequency: text nodes (no nodeType check needed since dom-to-image
// only passes Element nodes), then tagName checks (cheapest), then classList checks.
const exportNodeFilter = (node) => {
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

// Hide entire rows/columns that contain no visible images, returns a restore function
const hideEmptyRowsForExport = () => {
  const allCells = [...state.gridEl.querySelectorAll(".grid-cell")];
  const rows = state.gridRows;
  const cols = state.gridCols;
  const removedCells = []; // { cell, nextSibling }

  // Determine which rows have visible content
  const occupiedRows = new Set();
  const occupiedCols = new Set();

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = allCells.find(
        (c) => parseInt(c.dataset.row) === row && parseInt(c.dataset.col) === col
      );
      if (cell && cellHasVisibleContent(cell)) {
        occupiedRows.add(row);
        occupiedCols.add(col);
      }
    }
  }

  // Remove cells in empty rows
  for (let row = 0; row < rows; row++) {
    if (occupiedRows.has(row)) continue;
    const rowCells = allCells.filter((cell) => parseInt(cell.dataset.row) === row);
    rowCells.forEach((cell) => {
      removedCells.push({ cell, nextSibling: cell.nextSibling });
      cell.remove();
    });
  }

  // Remove cells in empty columns (only from rows that are still present)
  for (let col = 0; col < cols; col++) {
    if (occupiedCols.has(col)) continue;
    const colCells = allCells.filter(
      (cell) => parseInt(cell.dataset.col) === col && occupiedRows.has(parseInt(cell.dataset.row))
    );
    colCells.forEach((cell) => {
      if (cell.parentElement) { // still in DOM (not already removed as part of empty row)
        removedCells.push({ cell, nextSibling: cell.nextSibling });
        cell.remove();
      }
    });
  }

  // Also hide the row-controls element so it doesn't force extra height
  // on the grid-wrapper (it's already filtered from dom-to-image output)
  const rowControls = state.gridEl.parentElement.querySelector(".row-controls");
  const rowControlsDisplay = rowControls ? rowControls.style.display : null;
  if (rowControls) {
    rowControls.style.display = "none";
  }

  // Return the effective column count for the grid template
  const effectiveColCount = occupiedCols.size || 1;

  return {
    restore: () => {
      // Restore row controls
      if (rowControls) {
        rowControls.style.display = rowControlsDisplay;
      }
      // Re-insert removed cells in reverse order to preserve positions
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

const cellHasVisibleContent = (cell) => {
  // Cell already hidden by copySelectedRows
  if (cell.style.display === "none") return false;
  const img = cell.querySelector("img");
  const hasImage = img && img.src && img.style.display !== "none";
  const textarea = cell.querySelector("textarea");
  const hasText = textarea && textarea.value.trim() !== "";
  return hasImage || hasText;
};

// Strip keyboard selection/focus classes before export and return a restore function
const hideSelectionForExport = () => {
  const selected = [...state.gridEl.querySelectorAll(".grid-cell.keyboard-selected")];
  const focused = [...state.gridEl.querySelectorAll(".grid-cell.keyboard-focused")];
  selected.forEach((cell) => cell.classList.remove("keyboard-selected"));
  focused.forEach((cell) => cell.classList.remove("keyboard-focused"));
  return () => {
    selected.forEach((cell) => cell.classList.add("keyboard-selected"));
    focused.forEach((cell) => cell.classList.add("keyboard-focused"));
  };
};

const copyAsImage = async (useFullSize = false, resolutionScale = 1) => {
  const showAfterExport = hideForExport();
  try {
    const restoreSelection = hideSelectionForExport();
    const { restore: restoreEmptyRows, effectiveCols: contentCols } = hideEmptyRowsForExport();
    state.root.style.setProperty("--image-max-width", "unset");

    // Determine the effective column count — if copySelectedRows already set a
    // reduced column count, preserve it; otherwise use the content-based count.
    const currentTemplateCols = state.gridEl.style.gridTemplateColumns;
    const colMatch = currentTemplateCols && currentTemplateCols.match(/repeat\((\d+)/);
    const effectiveCols = colMatch ? Math.min(parseInt(colMatch[1]), contentCols) : contentCols;

    // Remove overflow and size constraints so nothing gets clipped
    const allCells = state.gridEl.querySelectorAll(".grid-cell");
    allCells.forEach((cell) => {
      cell.style.overflow = "visible";
      cell.style.minHeight = "0";
    });

    // Let images size naturally for the capture
    const allImages = state.cardsEl.querySelectorAll("img");
    allImages.forEach((img) => {
      if (img.src && img.style.display !== "none") {
        img.style.objectFit = "contain";
        img.style.height = "auto";
        img.style.maxHeight = "unset";
      }
    });

    // Remove height constraint on drop zones
    const allDrops = state.cardsEl.querySelectorAll(".drop");
    allDrops.forEach((drop) => {
      drop.style.overflow = "visible";
      drop.style.height = "auto";
    });

    state.root.style.setProperty("--border", `unset`);
    state.gridEl.style.outline = "none";

    // Reset zoom for capture
    const prevZoom = state.gridZoom;
    state.root.style.setProperty("--image-max-width", "unset");
    state.root.style.setProperty("--gap", `96px`);
    state.root.style.setProperty("--text-fontsize", `15pt`);
    state.root.style.setProperty("--grid-zoom-cell-height", `0px`);

    if (useFullSize) {
      const baseFontSize = 15;
      const fontSize = Math.max(baseFontSize, Math.floor(baseFontSize * resolutionScale * 3));
      state.root.style.setProperty("--text-fontsize", `${fontSize}pt`);

      const gap = 192 * resolutionScale;
      state.root.style.setProperty("--gap", `${gap}px`);

      // Collapse empty drops
      allDrops.forEach((drop) => {
        const img = drop.querySelector("img");
        if (!img || !img.src || img.style.display === "none") {
          drop.style.width = "32px";
          drop.style.height = "32px";
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

    // Remove fixed grid row sizing so rows expand to fit content
    state.gridEl.style.gridTemplateRows = "auto";
    // Use auto-sized columns for capture so they don't overlap with fit-content
    state.gridEl.style.gridTemplateColumns = `repeat(${effectiveCols}, auto)`;

    const initialPadding = useFullSize ? 192 : 64;
    const padding = Math.floor(initialPadding * resolutionScale);

    state.cardsEl.style.padding = `8px ${padding}px`;
    state.cardsEl.style.width = "fit-content";
    state.cardsEl.style.height = "auto";
    state.cardsEl.style.flex = "none";
    state.cardsEl.style.minHeight = "0";

    // Force the grid width after layout settles so dom-to-image doesn't reflow columns
    const gridRenderedWidth = state.gridEl.offsetWidth;
    state.gridEl.style.width = `${gridRenderedWidth}px`;

    // Measure actual content height for cropping after capture
    const captureHeight = state.cardsEl.offsetHeight;

    // Hide drawing controls during export (not needed — controls are in toolbar now)

    // Redraw canvases at export scale so drawings match the scaled images
    const exportScale = useFullSize ? resolutionScale : 1;
    await redrawAllCanvasesForExport(exportScale);

    // Ensure all images are fully decoded before capture to prevent blank images
    await waitForImagesDecode(state.cardsEl);

    let blob = await domtoimage.toBlob(state.cardsEl, {
      height: captureHeight,
      filter: exportNodeFilter,
    });

    // Crop the blob to the actual content height if dom-to-image produced a taller image
    blob = await cropBlobToHeight(blob, captureHeight);

    navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);

    // Restore all styles

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

    // Restore zoom (also restores gridTemplateColumns, --image-max-width, --gap, etc.)
    applyGridZoom(prevZoom);

    // Restore drawing canvases to display size
    restoreAllCanvases();

    restoreEmptyRows();
    restoreSelection();
  } catch (error) {
    console.error(error);
  } finally {
    showAfterExport();
  }
};

const copyWithScale = () => {
  const select = document.getElementById("copy-scale");
  const value = select.value;
  if (value.startsWith("output-")) {
    const outputScale = parseFloat(value.replace("output-", ""));
    copyAsImageWithOutputScale(outputScale);
  } else {
    const scale = parseFloat(value);
    copyAsImage(true, scale);
  }
};

// Export at full native resolution, then scale the entire output image down
const copyAsImageWithOutputScale = async (outputScale) => {
  const showAfterExport = hideForExport();
  try {
    const restoreSelection = hideSelectionForExport();
    const { restore: restoreEmptyRows, effectiveCols: contentCols } = hideEmptyRowsForExport();
    const baseMultiplier = 2; // Render at 2x grid size for higher resolution

    // Determine the effective column count — if copySelectedRows already set a
    // reduced column count, preserve it; otherwise use the content-based count.
    const currentTemplateCols = state.gridEl.style.gridTemplateColumns;
    const colMatch = currentTemplateCols && currentTemplateCols.match(/repeat\((\d+)/);
    const effectiveCols = colMatch ? Math.min(parseInt(colMatch[1]), contentCols) : contentCols;

    // Capture current rendered sizes before modifying styles
    const allImages = state.cardsEl.querySelectorAll("img");
    const imageSizes = [];
    allImages.forEach((img) => {
      if (img.src && img.style.display !== "none") {
        imageSizes.push({ img, width: img.clientWidth, height: img.clientHeight });
      }
    });

    state.root.style.setProperty("--border", `unset`);
    state.gridEl.style.outline = "none";

    const allCells = state.gridEl.querySelectorAll(".grid-cell");
    allCells.forEach((cell) => {
      cell.style.overflow = "visible";
    });

    const allDrops = state.cardsEl.querySelectorAll(".drop");
    allDrops.forEach((drop) => {
      drop.style.overflow = "visible";
    });

    // Determine the max scale factor capped by the smallest image's natural size
    let cappedMultiplier = baseMultiplier;
    imageSizes.forEach(({ img, width, height }) => {
      const maxForThis = Math.min(img.naturalWidth / width, img.naturalHeight / height);
      cappedMultiplier = Math.min(cappedMultiplier, maxForThis);
    });
    cappedMultiplier = Math.max(1, cappedMultiplier);

    // Lock each image using the globally capped multiplier
    imageSizes.forEach(({ img, width, height }) => {
      img.style.width = Math.round(width * cappedMultiplier) + "px";
      img.style.height = Math.round(height * cappedMultiplier) + "px";
      img.style.objectFit = "contain";
      img.style.maxHeight = "unset";
    });

    // Scale gap and font to match the capped layout
    // Divide by outputScale so that after the final downscale, text remains crisp
    const scale = state.gridZoom / 100;
    const gap = Math.round(48 * scale * cappedMultiplier);
    state.root.style.setProperty("--gap", `${gap}px`);
    const fontSize = Math.round(16 * scale * cappedMultiplier / outputScale);
    state.root.style.setProperty("--text-fontsize", `${fontSize}pt`);

    // Scale filename labels so they remain legible after output downscale
    const filenameLabels = state.cardsEl.querySelectorAll(".grid-cell-filename");
    const filenameFontSize = Math.round(8 * cappedMultiplier / outputScale);
    filenameLabels.forEach((label) => {
      label.style.fontSize = `${filenameFontSize}pt`;
    });

    // Collapse empty drops
    allDrops.forEach((drop) => {
      const img = drop.querySelector("img");
      if (!img || !img.src || img.style.display === "none") {
        drop.style.width = "32px";
        drop.style.height = "32px";
      }
    });

    state.gridEl.style.gridTemplateRows = "auto";
    state.gridEl.style.gridTemplateColumns = `repeat(${effectiveCols}, auto)`;

    const padding = Math.round(32 * cappedMultiplier);
    state.cardsEl.style.padding = `8px ${padding}px`;
    state.cardsEl.style.width = "fit-content";
    state.cardsEl.style.height = "auto";
    state.cardsEl.style.flex = "none";
    state.cardsEl.style.minHeight = "0";

    // Force the grid width after layout settles so dom-to-image doesn't reflow columns
    const gridRenderedWidth = state.gridEl.offsetWidth;
    state.gridEl.style.width = `${gridRenderedWidth}px`;

    // Measure actual content height for cropping after capture
    const captureHeight = state.cardsEl.offsetHeight;

    await redrawAllCanvasesForExport(cappedMultiplier);

    // Ensure all images are fully decoded before capture to prevent blank images
    await waitForImagesDecode(state.cardsEl);

    let blob = await domtoimage.toBlob(state.cardsEl, {
      height: captureHeight,
      filter: exportNodeFilter,
    });

    // Crop to actual content height, then scale the output
    const scaledBlob = await cropAndScaleBlob(blob, captureHeight, outputScale);

    navigator.clipboard.write([
      new ClipboardItem({
        "image/png": scaledBlob,
      }),
    ]);

    // Restore all styles
    allCells.forEach((cell) => {
      cell.style.overflow = null;
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

    filenameLabels.forEach((label) => {
      label.style.fontSize = null;
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

    applyGridZoom(state.gridZoom);
    restoreAllCanvases();

    restoreEmptyRows();
    restoreSelection();
  } catch (error) {
    console.error(error);
  } finally {
    showAfterExport();
  }
};

// Utility: scale an image blob by a factor, returns a new PNG blob
const scaleBlob = async (blob, scale) => {
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

// Utility: crop a blob to a maximum height (removes excess vertical space)
const cropBlobToHeight = async (blob, maxHeight) => {
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

// Utility: crop and scale in a single pass to avoid double decode/encode
const cropAndScaleBlob = async (blob, maxHeight, scale) => {
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

const copySelectedRows = () => {
  if (state.selectedRows.size === 0 && state.selectedCells.size === 0) {
    // Nothing selected — fall back to copying all
    copyWithScale();
    return;
  }

  const allCells = state.gridEl.querySelectorAll(".grid-cell");
  const hiddenCells = [];

  // Determine which rows and columns are involved in the selection.
  // Always use the current grid column count as the max for the output layout.
  const selectedColCount = state.gridCols;

  if (state.selectedRows.size > 0) {
    allCells.forEach((cell) => {
      const row = parseInt(cell.dataset.row);
      if (!state.selectedRows.has(row)) {
        cell.style.display = "none";
        hiddenCells.push(cell);
      }
    });
  } else {
    const cellsArray = [...allCells];
    cellsArray.forEach((cell, index) => {
      if (!state.selectedCells.has(index)) {
        cell.style.display = "none";
        hiddenCells.push(cell);
      }
    });
  }

  // Set the grid template to match only the visible cells before export.
  // copyAsImage will override this during capture and then restore using
  // the real state.gridCols/state.gridRows, so the layout recovers correctly.
  state.gridEl.style.gridTemplateColumns = `repeat(${selectedColCount}, auto)`;
  state.gridEl.style.gridTemplateRows = "auto";

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
  });
};

const copyAsGridSize = async () => {
  const showAfterExport = hideForExport();
  try {
    const restoreSelection = hideSelectionForExport();
    const { restore: restoreEmptyRows, effectiveCols: contentCols } = hideEmptyRowsForExport();

    // Determine the effective column count — if copySelectedRows already set a
    // reduced column count, preserve it; otherwise use the content-based count.
    const currentTemplateCols = state.gridEl.style.gridTemplateColumns;
    const colMatch = currentTemplateCols && currentTemplateCols.match(/repeat\((\d+)/);
    const effectiveCols = colMatch ? Math.min(parseInt(colMatch[1]), contentCols) : contentCols;

    // Capture the current rendered sizes of images before modifying styles
    const allImages = state.cardsEl.querySelectorAll("img");
    const imageSizes = [];
    allImages.forEach((img) => {
      if (img.src && img.style.display !== "none") {
        imageSizes.push({ img, width: img.clientWidth, height: img.clientHeight });
      }
    });

    state.root.style.setProperty("--border", `unset`);
    state.gridEl.style.outline = "none";

    // Keep the current grid zoom settings — don't reset them
    // Just remove overflow clipping so the capture is clean
    const allCells = state.gridEl.querySelectorAll(".grid-cell");
    allCells.forEach((cell) => {
      cell.style.overflow = "visible";
    });

    const allDrops = state.cardsEl.querySelectorAll(".drop");
    allDrops.forEach((drop) => {
      drop.style.overflow = "visible";
    });

    // Lock each image to its current display size
    imageSizes.forEach(({ img, width, height }) => {
      img.style.width = width + "px";
      img.style.height = height + "px";
      img.style.objectFit = "contain";
      img.style.maxHeight = "unset";
    });

    // Collapse empty drops
    allDrops.forEach((drop) => {
      const img = drop.querySelector("img");
      if (!img || !img.src || img.style.display === "none") {
        drop.style.width = "32px";
        drop.style.height = "32px";
      }
    });

    // Use auto columns so the grid fits the locked image sizes
    state.gridEl.style.gridTemplateRows = "auto";
    state.gridEl.style.gridTemplateColumns = `repeat(${effectiveCols}, auto)`;

    state.cardsEl.style.padding = `8px 32px`;
    state.cardsEl.style.width = "fit-content";
    state.cardsEl.style.height = "auto";
    state.cardsEl.style.flex = "none";
    state.cardsEl.style.minHeight = "0";

    // Force the grid width after layout settles so dom-to-image doesn't reflow columns
    const gridRenderedWidth = state.gridEl.offsetWidth;
    state.gridEl.style.width = `${gridRenderedWidth}px`;

    // Measure actual content height for cropping after capture
    const captureHeight = state.cardsEl.offsetHeight;

    // Redraw canvases at 1:1 since we're keeping display size
    await redrawAllCanvasesForExport(1);

    // Ensure all images are fully decoded before capture to prevent blank images
    await waitForImagesDecode(state.cardsEl);

    let blob = await domtoimage.toBlob(state.cardsEl, {
      height: captureHeight,
      filter: exportNodeFilter,
    });

    // Crop to actual content height
    blob = await cropBlobToHeight(blob, captureHeight);

    navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);

    // Restore all styles
    allCells.forEach((cell) => {
      cell.style.overflow = null;
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

    // Restore zoom (restores gridTemplateColumns, --image-max-width, --gap, etc.)
    applyGridZoom(state.gridZoom);

    // Restore drawing canvases to display size
    restoreAllCanvases();

    restoreEmptyRows();
    restoreSelection();
  } catch (error) {
    console.error(error);
  } finally {
    showAfterExport();
  }
};

const updateCopySelectedBtn = () => {
  const btn = document.getElementById("copy-btn");
  if (!btn) return;
  if (state.selectedRows.size > 0) {
    btn.textContent = `Copy (${state.selectedRows.size} rows)`;
  } else if (state.selectedCells.size > 0) {
    btn.textContent = `Copy (${state.selectedCells.size} cells)`;
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

    // Serialize drawing paths from the source cell's canvas
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

  // if (event.shiftKey && event.metaKey) {
  //   setElementWidths(elementsToAdjustWidth, "unset");
  //   state.root.style.setProperty("--image-max-width", "unset");

  //   const blob = await domtoimage.toBlob(img);

  //   navigator.clipboard.write([
  //     new ClipboardItem({
  //       "image/png": blob,
  //     }),
  //   ]);

  //   state.root.style.setProperty("--image-max-width", "60dvh");
  //   setElementWidths(elementsToAdjustWidth, null);
  // }

  // if (event.metaKey && !event.shiftKey) {
  //   setElementWidths(elementsToAdjustWidth, "unset");
  //   state.root.style.setProperty("--image-max-width", "unset");

  //   const width = Math.floor(img.naturalWidth * 0.5) + "px";
  //   img.style.width = width;

  //   const blob = await domtoimage.toBlob(img);

  //   navigator.clipboard.write([
  //     new ClipboardItem({
  //       "image/png": blob,
  //     }),
  //   ]);

  //   img.style.width = null;
  //   state.root.style.setProperty("--image-max-width", "60dvh");
  //   setElementWidths(elementsToAdjustWidth, null);
  // } else if (!event.metaKey && event.shiftKey) {
  //   img.src = "";
  //   img.style.display = "none";
  //   drop.style.border = "var(--border)";
  //   span.style.display = "block";
  // }

  if (event.metaKey) {
    img.src = "";
    img.style.display = "none";
    drop.style.border = "var(--border)";
    span.style.display = "block";
    const cell = drop.closest(".grid-cell");
    if (cell) state.updateFilenameLabel(cell);
  }
};

// --- Download helpers ---

const generateFilename = () => {
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

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Download the composed grid image (same logic as copy, but saves to file)
const downloadAsImage = async (useFullSize = false, resolutionScale = 1) => {
  const showAfterExport = hideForExport();
  try {
    const restoreSelection = hideSelectionForExport();
    const { restore: restoreEmptyRows, effectiveCols: contentCols } = hideEmptyRowsForExport();
    state.root.style.setProperty("--image-max-width", "unset");

    const currentTemplateCols = state.gridEl.style.gridTemplateColumns;
    const colMatch = currentTemplateCols && currentTemplateCols.match(/repeat\((\d+)/);
    const effectiveCols = colMatch ? Math.min(parseInt(colMatch[1]), contentCols) : contentCols;

    const allCells = state.gridEl.querySelectorAll(".grid-cell");
    allCells.forEach((cell) => {
      cell.style.overflow = "visible";
      cell.style.minHeight = "0";
    });

    const allImages = state.cardsEl.querySelectorAll("img");
    allImages.forEach((img) => {
      if (img.src && img.style.display !== "none") {
        img.style.objectFit = "contain";
        img.style.height = "auto";
        img.style.maxHeight = "unset";
      }
    });

    const allDrops = state.cardsEl.querySelectorAll(".drop");
    allDrops.forEach((drop) => {
      drop.style.overflow = "visible";
      drop.style.height = "auto";
    });

    state.root.style.setProperty("--border", `unset`);
    state.gridEl.style.outline = "none";

    const prevZoom = state.gridZoom;
    state.root.style.setProperty("--image-max-width", "unset");
    state.root.style.setProperty("--gap", `96px`);
    state.root.style.setProperty("--text-fontsize", `15pt`);
    state.root.style.setProperty("--grid-zoom-cell-height", `0px`);

    if (useFullSize) {
      const baseFontSize = 15;
      const fontSize = Math.max(baseFontSize, Math.floor(baseFontSize * resolutionScale * 3));
      state.root.style.setProperty("--text-fontsize", `${fontSize}pt`);

      const gap = 192 * resolutionScale;
      state.root.style.setProperty("--gap", `${gap}px`);

      allDrops.forEach((drop) => {
        const img = drop.querySelector("img");
        if (!img || !img.src || img.style.display === "none") {
          drop.style.width = "32px";
          drop.style.height = "32px";
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

    state.gridEl.style.gridTemplateRows = "auto";
    state.gridEl.style.gridTemplateColumns = `repeat(${effectiveCols}, auto)`;

    const initialPadding = useFullSize ? 192 : 64;
    const padding = Math.floor(initialPadding * resolutionScale);

    state.cardsEl.style.padding = `8px ${padding}px`;
    state.cardsEl.style.width = "fit-content";
    state.cardsEl.style.height = "auto";
    state.cardsEl.style.flex = "none";
    state.cardsEl.style.minHeight = "0";

    const gridRenderedWidth = state.gridEl.offsetWidth;
    state.gridEl.style.width = `${gridRenderedWidth}px`;

    const captureHeight = state.cardsEl.offsetHeight;

    const exportScale = useFullSize ? resolutionScale : 1;
    await redrawAllCanvasesForExport(exportScale);

    // Ensure all images are fully decoded before capture to prevent blank images
    await waitForImagesDecode(state.cardsEl);

    let blob = await domtoimage.toBlob(state.cardsEl, {
      height: captureHeight,
      filter: exportNodeFilter,
    });

    blob = await cropBlobToHeight(blob, captureHeight);

    triggerDownload(blob, generateFilename());

    // Restore all styles
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
  } catch (error) {
    console.error(error);
  } finally {
    showAfterExport();
  }
};

const downloadWithScale = () => {
  const select = document.getElementById("copy-scale");
  const value = select.value;

  // Apply the same selection rules as copySelectedRows
  const allCells = state.gridEl.querySelectorAll(".grid-cell");
  const hiddenCells = [];

  if (state.selectedRows.size > 0 || state.selectedCells.size > 0) {
    const selectedColCount = state.gridCols;

    if (state.selectedRows.size > 0) {
      allCells.forEach((cell) => {
        const row = parseInt(cell.dataset.row);
        if (!state.selectedRows.has(row)) {
          cell.style.display = "none";
          hiddenCells.push(cell);
        }
      });
    } else {
      const cellsArray = [...allCells];
      cellsArray.forEach((cell, index) => {
        if (!state.selectedCells.has(index)) {
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
  });
};

const downloadAsImageWithOutputScale = async (outputScale) => {
  const showAfterExport = hideForExport();
  try {
    const restoreSelection = hideSelectionForExport();
    const { restore: restoreEmptyRows, effectiveCols: contentCols } = hideEmptyRowsForExport();
    const baseMultiplier = 2;

    const currentTemplateCols = state.gridEl.style.gridTemplateColumns;
    const colMatch = currentTemplateCols && currentTemplateCols.match(/repeat\((\d+)/);
    const effectiveCols = colMatch ? Math.min(parseInt(colMatch[1]), contentCols) : contentCols;

    const allImages = state.cardsEl.querySelectorAll("img");
    const imageSizes = [];
    allImages.forEach((img) => {
      if (img.src && img.style.display !== "none") {
        imageSizes.push({ img, width: img.clientWidth, height: img.clientHeight });
      }
    });

    state.root.style.setProperty("--border", `unset`);
    state.gridEl.style.outline = "none";

    const allCells = state.gridEl.querySelectorAll(".grid-cell");
    allCells.forEach((cell) => {
      cell.style.overflow = "visible";
    });

    const allDrops = state.cardsEl.querySelectorAll(".drop");
    allDrops.forEach((drop) => {
      drop.style.overflow = "visible";
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
    const gap = Math.round(48 * scale * cappedMultiplier);
    state.root.style.setProperty("--gap", `${gap}px`);
    const fontSize = Math.round(16 * scale * cappedMultiplier / outputScale);
    state.root.style.setProperty("--text-fontsize", `${fontSize}pt`);

    const filenameLabels = state.cardsEl.querySelectorAll(".grid-cell-filename");
    const filenameFontSize = Math.round(8 * cappedMultiplier / outputScale);
    filenameLabels.forEach((label) => {
      label.style.fontSize = `${filenameFontSize}pt`;
    });

    allDrops.forEach((drop) => {
      const img = drop.querySelector("img");
      if (!img || !img.src || img.style.display === "none") {
        drop.style.width = "32px";
        drop.style.height = "32px";
      }
    });

    state.gridEl.style.gridTemplateRows = "auto";
    state.gridEl.style.gridTemplateColumns = `repeat(${effectiveCols}, auto)`;

    const padding = Math.round(32 * cappedMultiplier);
    state.cardsEl.style.padding = `8px ${padding}px`;
    state.cardsEl.style.width = "fit-content";
    state.cardsEl.style.height = "auto";
    state.cardsEl.style.flex = "none";
    state.cardsEl.style.minHeight = "0";

    const gridRenderedWidth = state.gridEl.offsetWidth;
    state.gridEl.style.width = `${gridRenderedWidth}px`;

    const captureHeight = state.cardsEl.offsetHeight;

    await redrawAllCanvasesForExport(cappedMultiplier);

    // Ensure all images are fully decoded before capture to prevent blank images
    await waitForImagesDecode(state.cardsEl);

    let blob = await domtoimage.toBlob(state.cardsEl, {
      height: captureHeight,
      filter: exportNodeFilter,
    });

    const scaledBlob = await cropAndScaleBlob(blob, captureHeight, outputScale);

    triggerDownload(scaledBlob, generateFilename());

    // Restore all styles
    allCells.forEach((cell) => {
      cell.style.overflow = null;
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

    filenameLabels.forEach((label) => {
      label.style.fontSize = null;
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

    applyGridZoom(state.gridZoom);
    restoreAllCanvases();

    restoreEmptyRows();
    restoreSelection();
  } catch (error) {
    console.error(error);
  } finally {
    showAfterExport();
  }
};

// Bulk download all images from the staging area and grid cells
const bulkDownloadImages = () => {
  const images = [];

  // Collect from staging area (bottom toolbar)
  const bottomToolbarInner = document.getElementById("bottom-toolbar-inner");
  if (bottomToolbarInner) {
    bottomToolbarInner.querySelectorAll(".bottom-toolbar-item img").forEach((img) => {
      if (img.src && img.src.startsWith("data:")) {
        images.push({ src: img.src, name: img.alt || "" });
      }
    });
  }

  // Collect from grid cells, respecting selection
  const allCells = [...state.gridEl.querySelectorAll(".grid-cell")];

  if (state.selectedRows.size > 0) {
    // Only include images from selected rows
    allCells.forEach((cell) => {
      const row = parseInt(cell.dataset.row);
      if (!state.selectedRows.has(row)) return;
      const img = cell.querySelector("img");
      if (img && img.src && img.src.startsWith("data:") && img.style.display !== "none") {
        images.push({ src: img.src, name: img.alt || "" });
      }
    });
  } else if (state.selectedCells.size > 0) {
    // Only include images from selected cells
    allCells.forEach((cell, index) => {
      if (!state.selectedCells.has(index)) return;
      const img = cell.querySelector("img");
      if (img && img.src && img.src.startsWith("data:") && img.style.display !== "none") {
        images.push({ src: img.src, name: img.alt || "" });
      }
    });
  } else {
    // No selection — include all grid images
    allCells.forEach((cell) => {
      const img = cell.querySelector("img");
      if (img && img.src && img.src.startsWith("data:") && img.style.display !== "none") {
        images.push({ src: img.src, name: img.alt || "" });
      }
    });
  }

  if (images.length === 0) return;

  // Download each image with a small delay to avoid browser blocking
  images.forEach((image, index) => {
    const ext = image.src.startsWith("data:image/png") ? ".png" :
                image.src.startsWith("data:image/jpeg") ? ".jpg" :
                image.src.startsWith("data:image/webp") ? ".webp" : ".png";

    let filename = image.name || `image-${index + 1}`;
    // Strip existing extension if present, then add the correct one
    filename = filename.replace(/\.[^.]+$/, "") + ext;

    setTimeout(() => {
      const a = document.createElement("a");
      a.href = image.src;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, index * 100);
  });
};

// Wire up copy buttons (replacing inline onclick handlers)
document.getElementById("copy-btn").addEventListener("click", copySelectedRows);
document.getElementById("download-btn").addEventListener("click", downloadWithScale);
document.getElementById("bulk-download-btn").addEventListener("click", bulkDownloadImages);

// Copy the raw image(s) from selected grid cells to clipboard without any scaling/rendering.
// If multiple images are selected they are placed side-by-side at native resolution.
const copySelectedRawImages = async () => {
  const allCells = [...state.gridEl.querySelectorAll(".grid-cell")];
  const indices = state.selectedCells.size > 0
    ? [...state.selectedCells].sort((a, b) => a - b)
    : state.selectedRows.size > 0
      ? allCells.reduce((acc, cell, i) => {
          if (state.selectedRows.has(parseInt(cell.dataset.row))) acc.push(i);
          return acc;
        }, [])
      : [];

  // Collect visible images from the selected cells
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
    // Single image — fetch the raw blob directly from its src
    const response = await fetch(images[0].src);
    const blob = await response.blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return;
  }

  // Multiple images — composite side-by-side at native resolution
  const bitmaps = await Promise.all(images.map((img) => createImageBitmap(img)));
  const gap = 32;
  const totalWidth = bitmaps.reduce((sum, bm) => sum + bm.width, 0) + gap * (bitmaps.length - 1);
  const maxHeight = Math.max(...bitmaps.map((bm) => bm.height));

  const canvas = new OffscreenCanvas(totalWidth, maxHeight);
  const ctx = canvas.getContext("2d");
  let x = 0;
  for (const bm of bitmaps) {
    // Center vertically
    const y = Math.round((maxHeight - bm.height) / 2);
    ctx.drawImage(bm, x, y);
    x += bm.width + gap;
    bm.close();
  }

  const blob = await canvas.convertToBlob({ type: "image/png" });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
};

// Copy selected image(s) rendered with all color filters, each labeled below.
// Produces a grid: columns = filters, rows = selected images.
const copyWithAllFilters = async () => {
  const allCells = [...state.gridEl.querySelectorAll(".grid-cell")];

  // Determine which images to include
  const indices = state.selectedCells.size > 0
    ? [...state.selectedCells].sort((a, b) => a - b)
    : state.selectedRows.size > 0
      ? allCells.reduce((acc, cell, i) => {
          if (state.selectedRows.has(parseInt(cell.dataset.row))) acc.push(i);
          return acc;
        }, [])
      : state.focusedCellIndex >= 0
        ? [state.focusedCellIndex]
        : allCells.map((_, i) => i);

  // Collect visible images
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

  // Read the output scale from the copy-scale selector (same as other export functions)
  const scaleSelect = document.getElementById("copy-scale");
  const scaleValue = scaleSelect.value;
  let imageScale;
  if (scaleValue.startsWith("output-")) {
    imageScale = parseFloat(scaleValue.replace("output-", ""));
  } else {
    imageScale = parseFloat(scaleValue);
  }

  // Decode all source images to get their natural dimensions
  const bitmaps = await Promise.all(sourceImages.map((img) => createImageBitmap(img)));

  // Scale images by the selected output scale
  const maxNatW = Math.round(Math.max(...bitmaps.map((bm) => bm.width)) * imageScale);
  const maxNatH = Math.round(Math.max(...bitmaps.map((bm) => bm.height)) * imageScale);

  const labelFontSize = Math.max(14, Math.round(maxNatW * 0.03));
  const labelHeight = labelFontSize + 12;
  const padding = 0;

  const cellW = maxNatW;
  const cellH = maxNatH + labelHeight;

  const cols = filters.length;
  const rows = bitmaps.length;

  const totalW = padding * 2 + cols * cellW + (cols - 1) * gap;
  const totalH = padding * 2 + rows * cellH + (rows - 1) * gap;

  const canvas = new OffscreenCanvas(totalW, totalH);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalW, totalH);

  // Color matrix definitions matching the SVG filters
  const COLOR_MATRICES = {
    "protanopia": [
      0.567, 0.433, 0, 0, 0,
      0.558, 0.442, 0, 0, 0,
      0, 0.242, 0.758, 0, 0,
      0, 0, 0, 1, 0,
    ],
    "deuteranopia": [
      0.625, 0.375, 0, 0, 0,
      0.7, 0.3, 0, 0, 0,
      0, 0.3, 0.7, 0, 0,
      0, 0, 0, 1, 0,
    ],
    "tritanopia": [
      0.95, 0.05, 0, 0, 0,
      0, 0.433, 0.567, 0, 0,
      0, 0.475, 0.525, 0, 0,
      0, 0, 0, 1, 0,
    ],
    "achromatopsia": [
      0.299, 0.587, 0.114, 0, 0,
      0.299, 0.587, 0.114, 0, 0,
      0.299, 0.587, 0.114, 0, 0,
      0, 0, 0, 1, 0,
    ],
  };

  // Apply a color matrix to image data in-place
  const applyMatrix = (imageData, matrix) => {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      d[i]     = Math.min(255, Math.max(0, matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4] * 255));
      d[i + 1] = Math.min(255, Math.max(0, matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9] * 255));
      d[i + 2] = Math.min(255, Math.max(0, matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14] * 255));
    }
  };

  // Apply grayscale
  const applyGrayscale = (imageData) => {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = gray;
    }
  };

  // Apply contrast adjustment
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
      const x = padding + col * (cellW + gap);
      const y = padding + row * (cellH + gap);

      // Draw the image scaled to fit within cellW x maxNatH, centered
      const scale = Math.min(cellW / bm.width, maxNatH / bm.height);
      const drawW = Math.round(bm.width * scale);
      const drawH = Math.round(bm.height * scale);
      const imgX = x + Math.round((cellW - drawW) / 2);
      const imgY = y + Math.round((maxNatH - drawH) / 2);

      if (filter === "none") {
        ctx.drawImage(bm, imgX, imgY, drawW, drawH);
      } else {
        // Draw to a temp canvas, apply filter, then draw to main canvas
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

      // Draw label below the image
      ctx.fillStyle = "#333333";
      ctx.font = `500 ${labelFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(FILTER_LABELS[filter] || filter, x + cellW / 2, y + maxNatH + 6);
    }
  }

  // Clean up bitmaps
  bitmaps.forEach((bm) => bm.close());

  const blob = await canvas.convertToBlob({ type: "image/png" });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
};

document.getElementById("copy-all-filters-btn").addEventListener("click", copyWithAllFilters);

// --- Preview All Filters ---
// Opens an overlay showing all images with every filter applied, one row per image.

const COLOR_MATRICES_PREVIEW = {
  "protanopia": [
    0.567, 0.433, 0, 0, 0,
    0.558, 0.442, 0, 0, 0,
    0, 0.242, 0.758, 0, 0,
    0, 0, 0, 1, 0,
  ],
  "deuteranopia": [
    0.625, 0.375, 0, 0, 0,
    0.7, 0.3, 0, 0, 0,
    0, 0.3, 0.7, 0, 0,
    0, 0, 0, 1, 0,
  ],
  "tritanopia": [
    0.95, 0.05, 0, 0, 0,
    0, 0.433, 0.567, 0, 0,
    0, 0.475, 0.525, 0, 0,
    0, 0, 0, 1, 0,
  ],
  "achromatopsia": [
    0.299, 0.587, 0.114, 0, 0,
    0.299, 0.587, 0.114, 0, 0,
    0.299, 0.587, 0.114, 0, 0,
    0, 0, 0, 1, 0,
  ],
};

const applyFilterToCanvas = (sourceCanvas, filter) => {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = w;
  outCanvas.height = h;
  const ctx = outCanvas.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0);

  if (filter === "none") return outCanvas;

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  if (filter === "grayscale") {
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = gray;
    }
  } else if (filter === "low-contrast") {
    const factor = 0.85;
    const intercept = 128 * (1 - factor);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, d[i] * factor + intercept));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] * factor + intercept));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] * factor + intercept));
    }
  } else if (filter === "high-contrast") {
    const factor = 1.5;
    const intercept = 128 * (1 - factor);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, d[i] * factor + intercept));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] * factor + intercept));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] * factor + intercept));
    }
  } else if (COLOR_MATRICES_PREVIEW[filter]) {
    const matrix = COLOR_MATRICES_PREVIEW[filter];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      d[i] = Math.min(255, Math.max(0, matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4] * 255));
      d[i + 1] = Math.min(255, Math.max(0, matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9] * 255));
      d[i + 2] = Math.min(255, Math.max(0, matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14] * 255));
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return outCanvas;
};

// Track the active filter preview overlay for toggle and update behavior
let filterPreviewOverlay = null;
let filterPreviewGrid = null;
let filterPreviewBuildFn = null;

const closeFilterPreview = () => {
  if (filterPreviewOverlay) {
    filterPreviewOverlay.remove();
    filterPreviewOverlay = null;
    filterPreviewGrid = null;
    filterPreviewBuildFn = null;
    state.onFocusedCellChange = null;
  }
};

const previewAllFilters = () => {
  // Toggle: close if already open
  if (filterPreviewOverlay) {
    closeFilterPreview();
    return;
  }

  const allCells = [...state.gridEl.querySelectorAll(".grid-cell")];

  // Determine which images to include (selected, or focused via keyboard)
  const indices = state.selectedCells.size > 0
    ? [...state.selectedCells].sort((a, b) => a - b)
    : state.selectedRows.size > 0
      ? allCells.reduce((acc, cell, i) => {
          if (state.selectedRows.has(parseInt(cell.dataset.row))) acc.push(i);
          return acc;
        }, [])
      : state.focusedCellIndex >= 0
        ? [state.focusedCellIndex]
        : [];

  if (indices.length === 0) return;

  // Collect visible images from selected cells
  const sourceImages = [];
  for (const idx of indices) {
    const cell = allCells[idx];
    if (!cell) continue;
    const img = cell.querySelector("img");
    if (img && img.src && img.style.display !== "none") {
      sourceImages.push({ img, name: img.alt || "" });
    }
  }

  if (sourceImages.length === 0) return;

  // Helper: bake drawings onto a preview cell's image and return a data URL
  const bakePreviewCell = (cell) => {
    const container = cell.querySelector(".filter-preview-img-container");
    if (!container) return null;
    const img = container.querySelector("img");
    const canvas = container.querySelector(".drawing-canvas");
    if (!img || !img.src) return null;

    let dataUrl = img.src;
    const data = canvas ? state.canvasDataMap.get(canvas) : null;
    if (data && data.paths.length > 0) {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = img.naturalWidth;
      tempCanvas.height = img.naturalHeight;
      const ctx = tempCanvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const toX = (nx) => nx * tempCanvas.width;
      const toY = (ny) => ny * tempCanvas.height;

      for (const path of data.paths) {
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.lineWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (path.type === "text") {
          const fontSize = path.fontSize || 13;
          const lineHeight = fontSize * 1.3;
          ctx.font = `500 ${fontSize}px "Inter", system-ui, sans-serif`;
          ctx.textBaseline = "top";
          const x = toX(path.position.x);
          const y = toY(path.position.y);
          const lines = path.text.split("\n");
          const maxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
          const totalHeight = fontSize + (lines.length - 1) * lineHeight;
          const padding = 4;
          ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
          const radius = fontSize * 0.2;
          ctx.beginPath();
          ctx.roundRect(x - padding, y - padding, maxWidth + padding * 2, totalHeight + padding * 2, radius);
          ctx.fill();
          ctx.fillStyle = path.color;
          lines.forEach((line, i) => {
            ctx.fillText(line, x, y + i * lineHeight);
          });
        } else if (path.type === "arrow" || path.type === "line") {
          const fromX = toX(path.from.x);
          const fromY = toY(path.from.y);
          const toXv = toX(path.to.x);
          const toYv = toY(path.to.y);
          ctx.beginPath();
          ctx.moveTo(fromX, fromY);
          ctx.lineTo(toXv, toYv);
          ctx.stroke();
          if (path.type === "arrow") {
            const headLength = Math.max(10, path.lineWidth * 4);
            const angle = Math.atan2(toYv - fromY, toXv - fromX);
            ctx.beginPath();
            ctx.moveTo(toXv, toYv);
            ctx.lineTo(toXv - headLength * Math.cos(angle - Math.PI / 6), toYv - headLength * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(toXv, toYv);
            ctx.lineTo(toXv - headLength * Math.cos(angle + Math.PI / 6), toYv - headLength * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
          }
        } else if (path.type === "rect") {
          const rx = toX(Math.min(path.from.x, path.to.x));
          const ry = toY(Math.min(path.from.y, path.to.y));
          const rw = toX(Math.max(path.from.x, path.to.x)) - rx;
          const rh = toY(Math.max(path.from.y, path.to.y)) - ry;
          ctx.fillStyle = path.color;
          ctx.fillRect(rx, ry, rw, rh);
        } else if (path.type === "rectstroke") {
          const rx = toX(Math.min(path.from.x, path.to.x));
          const ry = toY(Math.min(path.from.y, path.to.y));
          const rw = toX(Math.max(path.from.x, path.to.x)) - rx;
          const rh = toY(Math.max(path.from.y, path.to.y)) - ry;
          ctx.strokeRect(rx, ry, rw, rh);
        } else if (path.type === "oval") {
          const rx = toX(Math.min(path.from.x, path.to.x));
          const ry = toY(Math.min(path.from.y, path.to.y));
          const rw = toX(Math.max(path.from.x, path.to.x)) - rx;
          const rh = toY(Math.max(path.from.y, path.to.y)) - ry;
          ctx.beginPath();
          ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (path.type === "ovalfill") {
          const rx = toX(Math.min(path.from.x, path.to.x));
          const ry = toY(Math.min(path.from.y, path.to.y));
          const rw = toX(Math.max(path.from.x, path.to.x)) - rx;
          const rh = toY(Math.max(path.from.y, path.to.y)) - ry;
          ctx.fillStyle = path.color;
          ctx.beginPath();
          ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (path.type === "dot") {
          const cx = toX(path.position.x);
          const cy = toY(path.position.y);
          const radius = path.lineWidth + 4;
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = path.color;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;
        } else if (path.type === "eraser") {
          if (path.points && path.points.length >= 2) {
            ctx.save();
            ctx.globalCompositeOperation = "destination-out";
            ctx.strokeStyle = "rgba(0,0,0,1)";
            ctx.lineWidth = path.lineWidth + 8;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(toX(path.points[0].x), toY(path.points[0].y));
            for (let i = 1; i < path.points.length; i++) {
              ctx.lineTo(toX(path.points[i].x), toY(path.points[i].y));
            }
            ctx.stroke();
            ctx.restore();
          }
        } else if (path.points && path.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(toX(path.points[0].x), toY(path.points[0].y));
          for (let i = 1; i < path.points.length; i++) {
            ctx.lineTo(toX(path.points[i].x), toY(path.points[i].y));
          }
          ctx.stroke();
        }
      }
      dataUrl = tempCanvas.toDataURL("image/png");
    }
    return dataUrl;
  };

  // Helper: get filename for a preview cell
  const getPreviewCellName = (cell) => {
    const container = cell.querySelector(".filter-preview-img-container");
    const img = container?.querySelector("img");
    const filterLabel = cell.querySelector(".filter-label");
    return (img?.alt || filterLabel?.textContent || "filtered") + ".png";
  };

  // Create overlay
  const overlay = document.createElement("div");
  overlay.className = "filter-preview-overlay";

  const panel = document.createElement("div");
  panel.className = "filter-preview-panel";

  // Header
  const header = document.createElement("div");
  header.className = "filter-preview-header";
  const title = document.createElement("h3");
  title.textContent = "Filter Preview";

  // Header buttons container
  const headerBtns = document.createElement("div");
  headerBtns.style.display = "flex";
  headerBtns.style.alignItems = "center";
  headerBtns.style.gap = "8px";

  // Copy all to staging button
  const copyToStagingBtn = document.createElement("button");
  copyToStagingBtn.className = "filter-preview-copy-btn";
  copyToStagingBtn.textContent = "Copy all to staging";
  copyToStagingBtn.title = "Copy all filtered preview images (with drawings) to the staging area";
  copyToStagingBtn.addEventListener("click", () => {
    const previewCells = overlay.querySelectorAll(".filter-preview-cell");
    for (const cell of previewCells) {
      const dataUrl = bakePreviewCell(cell);
      if (dataUrl) {
        state.addImageToToolbar(dataUrl, getPreviewCellName(cell));
      }
    }
  });

  // Copy with filters button — renders the entire preview grid as a single image to clipboard
  const copyWithFiltersBtn = document.createElement("button");
  copyWithFiltersBtn.className = "filter-preview-copy-btn";
  copyWithFiltersBtn.textContent = "Copy with filters";
  copyWithFiltersBtn.title = "Copy all preview images (with drawings) as a single grid image to clipboard";
  // Shared helper: render the preview grid into an OffscreenCanvas
  const renderPreviewGrid = async () => {
    const rows = overlay.querySelectorAll(".filter-preview-row");
    if (rows.length === 0) return null;

    const rowImages = [];
    for (const row of rows) {
      const cells = row.querySelectorAll(".filter-preview-cell");
      const imgs = [];
      for (const cell of cells) {
        const dataUrl = bakePreviewCell(cell);
        if (dataUrl) {
          const img = new Image();
          img.src = dataUrl;
          await img.decode();
          imgs.push(img);
        }
      }
      if (imgs.length > 0) rowImages.push(imgs);
    }

    if (rowImages.length === 0) return null;

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

    const maxNatW = Math.round(Math.max(...rowImages.flat().map((img) => img.naturalWidth)) * imageScale);
    const maxNatH = Math.round(Math.max(...rowImages.flat().map((img) => img.naturalHeight)) * imageScale);

    const labelFontSize = Math.max(14, Math.round(maxNatW * 0.03));
    const labelHeight = labelFontSize + 12;

    const cellW = maxNatW;
    const cellH = maxNatH + labelHeight;

    const cols = filters.length;
    const numRows = rowImages.length;

    const totalW = cols * cellW + (cols - 1) * gap;
    const totalH = numRows * cellH + (numRows - 1) * gap;

    const canvas = new OffscreenCanvas(totalW, totalH);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, totalW, totalH);

    for (let r = 0; r < numRows; r++) {
      const imgs = rowImages[r];
      for (let c = 0; c < imgs.length; c++) {
        const img = imgs[c];
        const x = c * (cellW + gap);
        const y = r * (cellH + gap);

        const scale = Math.min(cellW / img.naturalWidth, maxNatH / img.naturalHeight);
        const drawW = Math.round(img.naturalWidth * scale);
        const drawH = Math.round(img.naturalHeight * scale);
        const imgX = x + Math.round((cellW - drawW) / 2);
        const imgY = y + Math.round((maxNatH - drawH) / 2);

        ctx.drawImage(img, imgX, imgY, drawW, drawH);

        ctx.fillStyle = "#333333";
        ctx.font = `500 ${labelFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(FILTER_LABELS[filters[c]] || filters[c], x + cellW / 2, y + maxNatH + 6);
      }
    }

    return canvas;
  };

  copyWithFiltersBtn.addEventListener("click", async () => {
    const canvas = await renderPreviewGrid();
    if (!canvas) return;
    try {
      const blob = await canvas.convertToBlob({ type: "image/png" });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      copyWithFiltersBtn.textContent = "Copied ✓";
      setTimeout(() => { copyWithFiltersBtn.textContent = "Copy with filters"; }, 1500);
    } catch (err) {
      console.error("Failed to copy with filters:", err);
    }
  });

  // Stage merged grid image button
  const stageMergedBtn = document.createElement("button");
  stageMergedBtn.className = "filter-preview-copy-btn";
  stageMergedBtn.textContent = "Stage merged";
  stageMergedBtn.title = "Add the combined filter grid image (with drawings) to the staging area";
  stageMergedBtn.addEventListener("click", async () => {
    const canvas = await renderPreviewGrid();
    if (!canvas) return;
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const reader = new FileReader();
    reader.onloadend = () => {
      state.addImageToToolbar(reader.result, "filter-grid.png");
      stageMergedBtn.textContent = "Staged ✓";
      setTimeout(() => { stageMergedBtn.textContent = "Stage merged"; }, 1500);
    };
    reader.readAsDataURL(blob);
  });

  const closeBtn = document.createElement("button");
  closeBtn.className = "filter-preview-close";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => overlay.remove());

  header.appendChild(title);
  headerBtns.appendChild(copyToStagingBtn);
  headerBtns.appendChild(copyWithFiltersBtn);
  headerBtns.appendChild(stageMergedBtn);
  headerBtns.appendChild(closeBtn);
  header.appendChild(headerBtns);
  panel.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "filter-preview-body";

  const grid = document.createElement("div");
  grid.className = "filter-preview-grid";
  filterPreviewGrid = grid;

  const filters = FILTER_OPTIONS;

  // Helper: populate the grid element with filter previews for given images
  const buildGridContent = (targetGrid, images) => {
    targetGrid.innerHTML = "";
    for (const { img, name } of images) {
      const rowContainer = document.createElement("div");

      // Row label (filename)
      if (name) {
        const rowLabel = document.createElement("div");
        rowLabel.className = "filter-preview-row-label";
        rowLabel.textContent = name;
        rowLabel.title = name;
        rowContainer.appendChild(rowLabel);
      }

      const row = document.createElement("div");
      row.className = "filter-preview-row";

      // Draw source image to a canvas for pixel manipulation
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = img.naturalWidth;
      srcCanvas.height = img.naturalHeight;
      const srcCtx = srcCanvas.getContext("2d");
      srcCtx.drawImage(img, 0, 0);

      for (const filter of filters) {
        const cell = document.createElement("div");
        cell.className = "filter-preview-cell";

        const filteredCanvas = applyFilterToCanvas(srcCanvas, filter);
        const filteredImg = document.createElement("img");
        filteredImg.src = filteredCanvas.toDataURL("image/png");
        filteredImg.alt = `${name} - ${FILTER_LABELS[filter]}`;

        // Wrap image in a container that supports drawing
        const imgContainer = document.createElement("div");
        imgContainer.className = "filter-preview-img-container";
        imgContainer.appendChild(filteredImg);

        // Initialize drawing canvas on this container
        initDrawingCanvas(imgContainer);

        // Per-image action buttons
        const actions = document.createElement("div");
        actions.className = "filter-preview-cell-actions";

        const copyClipBtn = document.createElement("button");
        copyClipBtn.className = "filter-preview-action-btn";
        copyClipBtn.title = "Copy to clipboard";
        copyClipBtn.textContent = "📋";
        copyClipBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const dataUrl = bakePreviewCell(cell);
          if (!dataUrl) return;
          try {
            const resp = await fetch(dataUrl);
            const blob = await resp.blob();
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            copyClipBtn.textContent = "✓";
            setTimeout(() => { copyClipBtn.textContent = "📋"; }, 1200);
          } catch (err) {
            console.error("Failed to copy to clipboard:", err);
          }
        });

        const addStagingBtn = document.createElement("button");
        addStagingBtn.className = "filter-preview-action-btn";
        addStagingBtn.title = "Add to staging";
        addStagingBtn.textContent = "⬇";
        addStagingBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const dataUrl = bakePreviewCell(cell);
          if (!dataUrl) return;
          state.addImageToToolbar(dataUrl, getPreviewCellName(cell));
          addStagingBtn.textContent = "✓";
          setTimeout(() => { addStagingBtn.textContent = "⬇"; }, 1200);
        });

        actions.appendChild(copyClipBtn);
        actions.appendChild(addStagingBtn);

      const label = document.createElement("span");
      label.className = "filter-label";
      label.textContent = FILTER_LABELS[filter] || filter;

      cell.appendChild(imgContainer);
      cell.appendChild(actions);
      cell.appendChild(label);
      row.appendChild(cell);
    }

    rowContainer.appendChild(row);
    targetGrid.appendChild(rowContainer);
    }
  };
  filterPreviewBuildFn = buildGridContent;

  // Build initial content
  buildGridContent(grid, sourceImages);

  body.appendChild(grid);
  panel.appendChild(body);
  overlay.appendChild(panel);
  filterPreviewOverlay = overlay;

  // Close on overlay background click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeFilterPreview();
  });

  // Close on Escape
  const handleEsc = (e) => {
    if (e.key === "Escape") {
      closeFilterPreview();
      document.removeEventListener("keydown", handleEsc);
    }
  };
  document.addEventListener("keydown", handleEsc);

  document.body.appendChild(overlay);

  // Register focus change listener to update preview when navigating cells
  state.onFocusedCellChange = (newIndex) => {
    if (!filterPreviewOverlay || !filterPreviewGrid || !filterPreviewBuildFn) return;
    const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
    if (newIndex < 0 || newIndex >= cells.length) return;
    const cell = cells[newIndex];
    const img = cell.querySelector("img");
    if (!img || !img.src || img.style.display === "none") return;
    // Update the grid with the newly focused image
    filterPreviewBuildFn(filterPreviewGrid, [{ img, name: img.alt || "" }]);
    // If drawing mode is active, ensure newly created canvases get the active class
    if (state.drawingMode) {
      filterPreviewGrid.querySelectorAll(".drawing-canvas").forEach((c) => c.classList.add("active"));
    }
  };
};

document.getElementById("preview-all-filters-btn").addEventListener("click", previewAllFilters);

export {
  setElementWidths,
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

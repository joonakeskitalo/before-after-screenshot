import state from './state.js';
import { getObjectFitRect, redrawAllCanvasesForExport, restoreAllCanvases } from './drawing.js';
import { applyGridZoom } from './zoom.js';

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
  try {
    const restoreSelection = hideSelectionForExport();
    state.root.style.setProperty("--image-max-width", "unset");

    // Determine the effective column count — if copySelectedRows already set a
    // reduced column count, preserve it; otherwise use the full grid.
    const currentTemplateCols = state.gridEl.style.gridTemplateColumns;
    const colMatch = currentTemplateCols && currentTemplateCols.match(/repeat\((\d+)/);
    const effectiveCols = colMatch ? parseInt(colMatch[1]) : state.gridCols;

    // Remove overflow and size constraints so nothing gets clipped
    const allCells = state.gridEl.querySelectorAll(".grid-cell");
    allCells.forEach((cell) => {
      cell.style.overflow = "visible";
      cell.style.minHeight = "unset";
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
    state.root.style.setProperty("--grid-zoom-cell-height", `300px`);

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

    // Force the grid width after layout settles so dom-to-image doesn't reflow columns
    const gridRenderedWidth = state.gridEl.offsetWidth;
    state.gridEl.style.width = `${gridRenderedWidth}px`;

    // Hide drawing controls during export (not needed — controls are in toolbar now)

    // Redraw canvases at export scale so drawings match the scaled images
    const exportScale = useFullSize ? resolutionScale : 1;
    redrawAllCanvasesForExport(exportScale);

    const blob = await domtoimage.toBlob(state.cardsEl, {
      filter: (node) => {
        if (node.tagName === "IMG" && !node.src.startsWith("data:")) {
          return false;
        }
        if (node.tagName === "SPAN") return false;
        if (node.classList && node.classList.contains("clear-drawing-btn")) return false;
        if (node.classList && node.classList.contains("drawing-text-input")) return false;
        if (node.classList && node.classList.contains("row-controls")) return false;
        if (node.classList && node.classList.contains("row-select-cb")) return false;
        if (node.classList && node.classList.contains("grid-cell-filename") && !state.showFilenames) return false;
        if (node.tagName === "CANVAS" && node.style.display === "none") return false;
        return true;
      },
    });

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
    state.gridEl.style.outline = null;
    state.gridEl.style.width = null;
    state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;
    state.root.style.setProperty("--border", `1px dashed rgb(167, 165, 165)`);

    // Restore zoom (also restores gridTemplateColumns, --image-max-width, --gap, etc.)
    applyGridZoom(prevZoom);

    // Restore drawing canvases to display size
    restoreAllCanvases();

    restoreSelection();
  } catch (error) {
    console.error(error);
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
  try {
    const restoreSelection = hideSelectionForExport();
    const baseMultiplier = 2; // Render at 2x grid size for higher resolution

    // Determine the effective column count — if copySelectedRows already set a
    // reduced column count, preserve it; otherwise use the full grid.
    const currentTemplateCols = state.gridEl.style.gridTemplateColumns;
    const colMatch = currentTemplateCols && currentTemplateCols.match(/repeat\((\d+)/);
    const effectiveCols = colMatch ? parseInt(colMatch[1]) : state.gridCols;

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

    // Force the grid width after layout settles so dom-to-image doesn't reflow columns
    const gridRenderedWidth = state.gridEl.offsetWidth;
    state.gridEl.style.width = `${gridRenderedWidth}px`;

    redrawAllCanvasesForExport(cappedMultiplier);

    const blob = await domtoimage.toBlob(state.cardsEl, {
      filter: (node) => {
        if (node.tagName === "IMG" && !node.src.startsWith("data:")) return false;
        if (node.tagName === "SPAN") return false;
        if (node.classList && node.classList.contains("clear-drawing-btn")) return false;
        if (node.classList && node.classList.contains("drawing-text-input")) return false;
        if (node.classList && node.classList.contains("row-controls")) return false;
        if (node.classList && node.classList.contains("row-select-cb")) return false;
        if (node.classList && node.classList.contains("grid-cell-filename") && !state.showFilenames) return false;
        if (node.tagName === "CANVAS" && node.style.display === "none") return false;
        return true;
      },
    });

    // Scale the output blob down using a canvas
    const scaledBlob = await scaleBlob(blob, outputScale);

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
    state.gridEl.style.outline = null;
    state.gridEl.style.width = null;
    state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;
    state.root.style.setProperty("--border", `1px dashed rgb(167, 165, 165)`);

    applyGridZoom(state.gridZoom);
    restoreAllCanvases();

    restoreSelection();
  } catch (error) {
    console.error(error);
  }
};

// Utility: scale an image blob by a factor, returns a new PNG blob
const scaleBlob = (blob, scale) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => {
        URL.revokeObjectURL(img.src);
        resolve(b);
      }, "image/png");
    };
    img.src = URL.createObjectURL(blob);
  });
};

const copySelectedRows = () => {
  if (state.selectedRows.size === 0 && state.selectedCells.size === 0) {
    // Nothing selected — fall back to copying all
    copyWithScale();
    return;
  }

  const allCells = state.gridEl.querySelectorAll(".grid-cell");
  const hiddenCells = [];

  // Determine which rows and columns are involved in the selection
  let selectedColCount;

  if (state.selectedRows.size > 0) {
    selectedColCount = state.gridCols;

    allCells.forEach((cell) => {
      const row = parseInt(cell.dataset.row);
      if (!state.selectedRows.has(row)) {
        cell.style.display = "none";
        hiddenCells.push(cell);
      }
    });
  } else {
    const selectedColSet = new Set();
    state.selectedCells.forEach((idx) => {
      selectedColSet.add(idx % state.gridCols);
    });
    selectedColCount = selectedColSet.size;

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
  try {
    const restoreSelection = hideSelectionForExport();

    // Determine the effective column count — if copySelectedRows already set a
    // reduced column count, preserve it; otherwise use the full grid.
    const currentTemplateCols = state.gridEl.style.gridTemplateColumns;
    const colMatch = currentTemplateCols && currentTemplateCols.match(/repeat\((\d+)/);
    const effectiveCols = colMatch ? parseInt(colMatch[1]) : state.gridCols;

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

    // Force the grid width after layout settles so dom-to-image doesn't reflow columns
    const gridRenderedWidth = state.gridEl.offsetWidth;
    state.gridEl.style.width = `${gridRenderedWidth}px`;

    // Redraw canvases at 1:1 since we're keeping display size
    redrawAllCanvasesForExport(1);

    const blob = await domtoimage.toBlob(state.cardsEl, {
      filter: (node) => {
        if (node.tagName === "IMG" && !node.src.startsWith("data:")) {
          return false;
        }
        if (node.tagName === "SPAN") return false;
        if (node.classList && node.classList.contains("clear-drawing-btn")) return false;
        if (node.classList && node.classList.contains("drawing-text-input")) return false;
        if (node.classList && node.classList.contains("row-controls")) return false;
        if (node.classList && node.classList.contains("row-select-cb")) return false;
        if (node.classList && node.classList.contains("grid-cell-filename") && !state.showFilenames) return false;
        if (node.tagName === "CANVAS" && node.style.display === "none") return false;
        return true;
      },
    });

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
    state.gridEl.style.outline = null;
    state.gridEl.style.width = null;
    state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;
    state.root.style.setProperty("--border", `1px dashed rgb(167, 165, 165)`);

    // Restore zoom (restores gridTemplateColumns, --image-max-width, --gap, etc.)
    applyGridZoom(state.gridZoom);

    // Restore drawing canvases to display size
    restoreAllCanvases();

    restoreSelection();
  } catch (error) {
    console.error(error);
  }
};

const updateCopySelectedBtn = () => {
  const btn = document.getElementById("copy-selected-btn");
  if (!btn) return;
  if (state.selectedRows.size > 0) {
    btn.textContent = `Copy Selected (${state.selectedRows.size} rows)`;
    btn.disabled = false;
  } else if (state.selectedCells.size > 0) {
    btn.textContent = `Copy Selected (${state.selectedCells.size} cells)`;
    btn.disabled = false;
  } else {
    btn.textContent = "Copy Selected";
    btn.disabled = false;
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

// Wire up copy buttons (replacing inline onclick handlers)
document.getElementById("copy-btn").addEventListener("click", copyWithScale);
document.getElementById("copy-selected-btn").addEventListener("click", copySelectedRows);

export {
  setElementWidths,
  copyAsImage,
  copyWithScale,
  copyAsImageWithOutputScale,
  scaleBlob,
  copySelectedRows,
  copyAsGridSize,
  updateCopySelectedBtn,
  attachDragTo,
  clearOrCopyImage,
};

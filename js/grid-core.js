import state from './state.js';
import { initDrawingCanvas, redrawCanvas } from './drawing.js';
import { attachDragTo, updateCopySelectedBtn } from './grid-ui.js';
import { isAllowedImageSrc, isAllowedImageFile, sanitizeFilename, isValidElementId } from './sanitize.js';
import { GRID_MIN_COL_WIDTH, SWAP_ANIMATION_FALLBACK_MS, GRID_MAX_COLS, GRID_DEFAULT_COLS } from './constants.js';
import { pushUndo } from './undo.js';
import { handleCellClick } from './grid-selection.js';
import { handleCellDragStart } from './grid-drag.js';
import { unobserveDrop } from './shared-observers.js';
import {
  buildRowControls,
  swapRows,
  setRowDropTarget,
  clearRowDropTarget,
  clearRowHighlights,
  insertRowAt,
  insertColumnAt,
  deleteRowAt,
  deleteColumnAt,
} from './grid-row-controls.js';

// --- Utility helpers ---

// Convert an array of {row, col, ...} objects to a Map keyed by "row,col" for O(1) lookup.
const toDataMap = (dataArray) => {
  const map = new Map();
  for (const d of dataArray) {
    map.set(`${d.row},${d.col}`, d);
  }
  return map;
};

// Collect all blob URLs currently used in grid cells.
const collectBlobUrls = () => {
  const urls = new Set();
  state.getCells().forEach((cell) => {
    const img = cell.querySelector("img");
    if (img && img.src && img.src.startsWith("blob:")) {
      urls.add(img.src);
    }
  });
  return urls;
};

// Revoke blob URLs that are no longer present in the rebuilt grid.
const revokeOrphanedBlobUrls = (previousUrls) => {
  const currentUrls = collectBlobUrls();
  for (const url of previousUrls) {
    if (!currentUrls.has(url)) {
      URL.revokeObjectURL(url);
    }
  }
};

// --- Cell data get/set ---

const getCellData = (cell) => {
  const img = cell.querySelector("img");
  const textarea = cell.querySelector("textarea");
  const canvas = cell.querySelector(".drawing-canvas");
  const drawingPaths = canvas && state.canvasDataMap.get(canvas) ? [...state.canvasDataMap.get(canvas).paths] : [];
  return {
    imgSrc: img && img.src && img.style.display !== "none" ? img.src : null,
    imgAlt: img ? img.alt : "",
    text: textarea ? textarea.value : "",
    drawingPaths,
  };
};

const setCellData = (cell, data) => {
  const img = cell.querySelector("img");
  const drop = cell.querySelector(".drop");
  const span = cell.querySelector("span");
  const textarea = cell.querySelector("textarea");
  const canvas = cell.querySelector(".drawing-canvas");

  if (data.imgSrc) {
    img.src = data.imgSrc;
    img.alt = data.imgAlt;
    img.style.display = "block";
    drop.style.border = "unset";
    if (span) span.style.display = "none";
  } else {
    img.src = "";
    img.style.display = "none";
    img.alt = "";
    drop.style.border = "var(--border)";
    if (span) span.style.display = "block";
  }

  if (textarea) textarea.value = data.text || "";

  if (canvas) {
    const canvasData = state.canvasDataMap.get(canvas);
    if (canvasData) {
      canvasData.paths = data.drawingPaths || [];
      const dpr = window.devicePixelRatio || 1;
      redrawCanvas(canvas, dpr);
    }
  }
  updateFilenameLabel(cell);
};

// --- Swap cells with FLIP animation ---

const swapCells = (cellA, cellB) => {
  if (!cellA || !cellB || cellA === cellB) return;
  pushUndo();

  // FLIP animation: record initial positions
  const rectA = cellA.getBoundingClientRect();
  const rectB = cellB.getBoundingClientRect();

  // Swap data
  const dataA = getCellData(cellA);
  const dataB = getCellData(cellB);
  setCellData(cellA, dataB);
  setCellData(cellB, dataA);

  // FLIP: content that was in A is now in B, content that was in B is now in A.
  const dx = rectB.left - rectA.left;
  const dy = rectB.top - rectA.top;

  // cellA now holds what was in B → start it at B's old position relative to A
  cellA.style.transition = "none";
  cellB.style.transition = "none";
  cellA.style.transform = `translate(${dx}px, ${dy}px)`;
  cellB.style.transform = `translate(${-dx}px, ${-dy}px)`;

  // Force reflow so the browser registers the starting position
  cellA.offsetHeight;

  // Animate to identity
  cellA.classList.add("swap-animating");
  cellB.classList.add("swap-animating");
  cellA.style.transition = "";
  cellB.style.transition = "";
  cellA.style.transform = "";
  cellB.style.transform = "";

  const cleanup = () => {
    cellA.classList.remove("swap-animating");
    cellB.classList.remove("swap-animating");
    cellA.style.transform = "";
    cellB.style.transform = "";
  };

  cellA.addEventListener("transitionend", cleanup, { once: true });
  // Fallback in case transitionend doesn't fire
  setTimeout(cleanup, SWAP_ANIMATION_FALLBACK_MS);
};

const getAdjacentCell = (cell, direction) => {
  const cells = state.getCells();
  const index = cells.indexOf(cell);
  if (index === -1) return null;

  if (direction === "left" && index > 0) return cells[index - 1];
  if (direction === "right" && index < cells.length - 1) return cells[index + 1];
  if (direction === "up" && index - state.gridCols >= 0) return cells[index - state.gridCols];
  if (direction === "down" && index + state.gridCols < cells.length) return cells[index + state.gridCols];
  return null;
};

// --- Filename labels ---

// Update the filename label for a given cell based on its img.alt
const updateFilenameLabel = (cell) => {
  const label = cell.querySelector(".grid-cell-filename");
  if (!label) return;
  const img = cell.querySelector("img");
  const name = img && img.alt && img.style.display !== "none" ? img.alt : "";
  label.textContent = name;
  label.style.display = name && state.showFilenames ? "" : "none";
};

// Toggle filename visibility for all cells
const toggleFilenames = () => {
  state.showFilenames = !state.showFilenames;
  const btn = document.getElementById("filename-toggle-btn");
  if (btn) btn.classList.toggle("active", state.showFilenames);
  document.querySelectorAll(".grid-cell").forEach(updateFilenameLabel);
};

// --- setupCell ---

const setupCell = (cell) => {
  const drop = cell.querySelector(".drop");
  const img = cell.querySelector("img");
  const span = cell.querySelector("span");

  // Initialize drawing canvas for this cell
  initDrawingCanvas(drop);

  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    // Show row drop target indicator when dragging a row
    if (state.rowDragState) {
      const targetRow = parseInt(cell.dataset.row, 10);
      if (targetRow !== state.rowDragState.sourceRow) {
        setRowDropTarget(targetRow);
      }
    }
  });

  drop.addEventListener("dragleave", (e) => {
    // Clear row drop target if leaving the cell
    if (state.rowDragState && !cell.contains(e.relatedTarget)) {
      clearRowDropTarget();
    }
  });

  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    drop.style.border = "unset";

    // Handle row-drag drops onto grid cells
    if (state.rowDragState) {
      const sourceRow = state.rowDragState.sourceRow;
      const targetRow = parseInt(cell.dataset.row, 10);
      if (sourceRow !== targetRow) {
        swapRows(sourceRow, targetRow);
      }
      state.rowDragState = null;
      clearRowHighlights();
      clearRowDropTarget();
      return;
    }

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && isAllowedImageFile(droppedFile)) {
      img.style.display = "block";
      img.src = URL.createObjectURL(droppedFile);
      img.alt = droppedFile.name;
      span.style.display = "none";
      updateFilenameLabel(cell);
      return;
    }

    const src = e.dataTransfer.getData("text/plain");
    if (src && isAllowedImageSrc(src)) {
      // Check if dragged from toolbar — insert from toolbar
      const source = e.dataTransfer.getData("source");
      const draggedId = e.dataTransfer.getData("id");
      if (source === "toolbar" && draggedId && isValidElementId(draggedId)) {
        pushUndo();
        const draggedFilename = sanitizeFilename(e.dataTransfer.getData("filename") || "");
        img.style.display = "block";
        img.src = src;
        img.alt = draggedFilename;
        span.style.display = "none";
        state.removeToolbarItemById(draggedId);
        updateFilenameLabel(cell);
        return;
      }

      // Dragged from another grid cell — swap the two cells
      if (draggedId && isValidElementId(draggedId)) {
        const srcImg = document.getElementById(draggedId);
        if (srcImg && srcImg !== img) {
          const srcCell = srcImg.closest(".grid-cell");
          if (srcCell && srcCell !== cell) {
            swapCells(cell, srcCell);
            return;
          }
        }
      }

      // Fallback: just set the image (e.g. local drop)
      img.style.display = "block";
      img.src = src;
      img.alt = "";
      span.style.display = "none";
      updateFilenameLabel(cell);
    }
  });

  attachDragTo(img);

  // Click-based cell selection (plain click = select one, shift+click = multi-select)
  cell.addEventListener("click", (e) => handleCellClick(e, cell));

  // Mouse drag-to-move for multi-selected cells
  cell.addEventListener("mousedown", (e) => handleCellDragStart(e, cell));

  // Cell-level row-drag handlers (catches drags over textarea area too)
  cell.addEventListener("dragover", (e) => {
    if (!state.rowDragState) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const targetRow = parseInt(cell.dataset.row, 10);
    if (targetRow !== state.rowDragState.sourceRow) {
      setRowDropTarget(targetRow);
    }
  });

  cell.addEventListener("dragleave", (e) => {
    if (!state.rowDragState) return;
    if (!cell.contains(e.relatedTarget)) {
      clearRowDropTarget();
    }
  });

  cell.addEventListener("drop", (e) => {
    if (!state.rowDragState) return;
    e.preventDefault();
    const sourceRow = state.rowDragState.sourceRow;
    const targetRow = parseInt(cell.dataset.row, 10);
    if (sourceRow !== targetRow) {
      swapRows(sourceRow, targetRow);
    }
    state.rowDragState = null;
    clearRowHighlights();
    clearRowDropTarget();
  });
};

// --- createCell ---

const createCell = (row, col) => {
  const cell = document.createElement("div");
  cell.className = "grid-cell";
  cell.dataset.row = row;
  cell.dataset.col = col;

  const drop = document.createElement("div");
  drop.className = "drop";

  const span = document.createElement("span");
  span.innerText = "Drop here";
  drop.appendChild(span);

  const img = document.createElement("img");
  img.style.display = "none";
  drop.appendChild(img);

  const textarea = document.createElement("textarea");
  textarea.autocomplete = "off";
  textarea.autocorrect = "off";
  textarea.spellcheck = false;
  textarea.autocapitalize = "off";
  textarea.rows = 2;
  textarea.textContent = "";
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      textarea.blur();
    }
  });

  cell.appendChild(drop);

  const filenameLabel = document.createElement("div");
  filenameLabel.className = "grid-cell-filename";
  cell.appendChild(filenameLabel);

  cell.appendChild(textarea);

  setupCell(cell);

  return cell;
};

// --- buildGrid (incremental — reuses existing DOM cells to avoid flash) ---

const buildGrid = () => {
  // Clear keyboard focus (remove class from DOM before resetting index)
  const prevCells = state.getCells();
  if (state.focusedCellIndex >= 0 && state.focusedCellIndex < prevCells.length) {
    prevCells[state.focusedCellIndex].classList.remove("keyboard-focused");
  }
  state.focusedCellIndex = -1;

  const targetTotal = state.gridRows * state.gridCols;
  const existingCells = state.getCells();
  const currentTotal = existingCells.length;

  // Save data from all existing cells keyed by their current row,col
  const existingData = [];
  const previousBlobUrls = collectBlobUrls();
  existingCells.forEach((cell) => {
    const img = cell.querySelector("img");
    const textarea = cell.querySelector("textarea");
    const canvas = cell.querySelector(".drawing-canvas");
    const drawingPaths = canvas && state.canvasDataMap.get(canvas) ? [...state.canvasDataMap.get(canvas).paths] : [];
    existingData.push({
      row: parseInt(cell.dataset.row, 10),
      col: parseInt(cell.dataset.col, 10),
      imgSrc: img && img.src && img.style.display !== "none" ? img.src : null,
      imgAlt: img ? img.alt : "",
      text: textarea ? textarea.value : "",
      drawingPaths,
    });
  });

  const existingDataMap = toDataMap(existingData);

  // Remove excess cells from the end (with proper cleanup)
  if (currentTotal > targetTotal) {
    for (let i = currentTotal - 1; i >= targetTotal; i--) {
      const cell = existingCells[i];
      const canvas = cell.querySelector(".drawing-canvas");
      if (canvas) {
        const drop = canvas.parentElement;
        if (drop) unobserveDrop(drop);
        const mouseUpHandler = state.canvasMouseUpHandlers.get(canvas);
        if (mouseUpHandler) {
          document.removeEventListener("mouseup", mouseUpHandler);
          state.canvasMouseUpHandlers.delete(canvas);
        }
        state.canvasDataMap.delete(canvas);
      }
      cell.remove();
    }
  }

  // Add missing cells at the end
  if (currentTotal < targetTotal) {
    for (let i = currentTotal; i < targetTotal; i++) {
      const r = Math.floor(i / state.gridCols);
      const c = i % state.gridCols;
      const cell = createCell(r, c);
      state.gridEl.appendChild(cell);
    }
  }

  // Update grid template
  state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${Math.round(GRID_MIN_COL_WIDTH * state.gridZoom / 100)}px, 1fr))`;
  state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;

  // Invalidate cache and get the current set of cells
  state.invalidateCellsCache();
  const cells = state.getCells();
  const canvasesToRedraw = [];

  // Update each cell's position and restore data
  for (let i = 0; i < targetTotal; i++) {
    const r = Math.floor(i / state.gridCols);
    const c = i % state.gridCols;
    const cell = cells[i];
    cell.dataset.row = String(r);
    cell.dataset.col = String(c);

    // Look up data that belonged to this position
    const existing = existingDataMap.get(`${r},${c}`);

    const img = cell.querySelector("img");
    const drop = cell.querySelector(".drop");
    const span = cell.querySelector("span");
    const textarea = cell.querySelector("textarea");
    const canvas = cell.querySelector(".drawing-canvas");

    if (existing && existing.imgSrc) {
      img.src = existing.imgSrc;
      img.alt = existing.imgAlt;
      img.style.display = "block";
      drop.style.border = "unset";
      if (span) span.style.display = "none";
    } else {
      if (img.src && img.src.startsWith("blob:") && !existingDataMap.has(`${r},${c}`)) {
        // Only revoke if this blob is truly orphaned (not reused at another position)
      }
      img.src = "";
      img.alt = "";
      img.style.display = "none";
      drop.style.border = "var(--border)";
      if (span) span.style.display = "block";
    }

    textarea.value = existing && existing.text ? existing.text : "";

    // Restore drawing paths
    if (canvas) {
      const canvasData = state.canvasDataMap.get(canvas);
      if (canvasData) {
        if (existing && existing.drawingPaths && existing.drawingPaths.length > 0) {
          canvasData.paths = existing.drawingPaths;
          canvasesToRedraw.push(canvas);
        } else {
          canvasData.paths = [];
          canvasesToRedraw.push(canvas);
        }
      }
    }

    updateFilenameLabel(cell);
  }

  // Batch redraw all canvases
  if (canvasesToRedraw.length > 0) {
    const dpr = window.devicePixelRatio || 1;
    for (const canvas of canvasesToRedraw) {
      redrawCanvas(canvas, dpr);
    }
  }

  if (!state._undoingInProgress) {
    revokeOrphanedBlobUrls(previousBlobUrls);
  }
  buildRowControls();
};

// --- collectGridData / restoreCellData ---

const collectGridData = () => {
  const data = [];
  state.getCells().forEach((cell) => {
    const img = cell.querySelector("img");
    const textarea = cell.querySelector("textarea");
    const canvas = cell.querySelector(".drawing-canvas");
    const drawingPaths = canvas && state.canvasDataMap.get(canvas) ? [...state.canvasDataMap.get(canvas).paths] : [];
    data.push({
      row: parseInt(cell.dataset.row, 10),
      col: parseInt(cell.dataset.col, 10),
      imgSrc: img && img.src && img.style.display !== "none" ? img.src : null,
      imgAlt: img ? img.alt : "",
      text: textarea ? textarea.value : "",
      drawingPaths: drawingPaths,
    });
  });
  return data;
};

const restoreCellData = (cell, data) => {
  const img = cell.querySelector("img");
  const drop = cell.querySelector(".drop");
  const span = cell.querySelector("span");
  const textarea = cell.querySelector("textarea");

  if (data.imgSrc) {
    img.src = data.imgSrc;
    img.alt = data.imgAlt;
    img.style.display = "block";
    drop.style.border = "unset";
    span.style.display = "none";
  }
  if (data.text) {
    textarea.value = data.text;
  }
  if (data.drawingPaths && data.drawingPaths.length > 0) {
    const canvas = cell.querySelector(".drawing-canvas");
    if (canvas) {
      const canvasData = state.canvasDataMap.get(canvas);
      if (canvasData) {
        canvasData.paths = data.drawingPaths;
        const dpr = window.devicePixelRatio || 1;
        redrawCanvas(canvas, dpr);
      }
    }
  }
  updateFilenameLabel(cell);
};

// --- relayoutGrid (incremental — reuses existing DOM cells to avoid flash) ---

const relayoutGrid = () => {
  // Collect all cells that have content (image, text, or drawings)
  const allData = collectGridData();
  const filledCells = allData.filter(
    (d) => d.imgSrc || d.text || (d.drawingPaths && d.drawingPaths.length > 0)
  );

  // Grid is entirely empty — compact down to a single row
  if (filledCells.length === 0) {
    if (state.gridRows <= 1) return; // already minimal

    state.gridRows = 1;

    state.selectedRows.clear();
    state.selectedCells.clear();
    updateCopySelectedBtn();
    const prevCells = state.getCells();
    if (state.focusedCellIndex >= 0 && state.focusedCellIndex < prevCells.length) {
      prevCells[state.focusedCellIndex].classList.remove("keyboard-focused");
    }
    state.focusedCellIndex = -1;

    const targetTotal = state.gridRows * state.gridCols;
    // Remove excess cells from the end (with proper cleanup)
    for (let i = prevCells.length - 1; i >= targetTotal; i--) {
      const cell = prevCells[i];
      const canvas = cell.querySelector(".drawing-canvas");
      if (canvas) {
        const drop = canvas.parentElement;
        if (drop) unobserveDrop(drop);
        const mouseUpHandler = state.canvasMouseUpHandlers.get(canvas);
        if (mouseUpHandler) {
          document.removeEventListener("mouseup", mouseUpHandler);
          state.canvasMouseUpHandlers.delete(canvas);
        }
        state.canvasDataMap.delete(canvas);
      }
      cell.remove();
    }

    state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${Math.round(GRID_MIN_COL_WIDTH * state.gridZoom / 100)}px, 1fr))`;
    state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;
    state.invalidateCellsCache();
    buildRowControls();
    return;
  }

  // Reassign positions sequentially in row-major order
  const reindexed = filledCells.map((d, i) => ({
    ...d,
    row: Math.floor(i / state.gridCols),
    col: i % state.gridCols,
  }));

  // Remove empty trailing rows by calculating the actual rows needed
  const neededRows = Math.max(1, Math.ceil(filledCells.length / state.gridCols));
  state.gridRows = neededRows;

  // Clear selections since positions changed
  state.selectedRows.clear();
  state.selectedCells.clear();
  updateCopySelectedBtn();
  const prevRelayoutCells = state.getCells();
  if (state.focusedCellIndex >= 0 && state.focusedCellIndex < prevRelayoutCells.length) {
    prevRelayoutCells[state.focusedCellIndex].classList.remove("keyboard-focused");
  }
  state.focusedCellIndex = -1;

  const targetTotal = state.gridRows * state.gridCols;
  const existingCells = state.getCells();
  const currentTotal = existingCells.length;

  // Remove excess cells from the end (with proper cleanup)
  if (currentTotal > targetTotal) {
    for (let i = currentTotal - 1; i >= targetTotal; i--) {
      const cell = existingCells[i];
      const canvas = cell.querySelector(".drawing-canvas");
      if (canvas) {
        const drop = canvas.parentElement;
        if (drop) unobserveDrop(drop);
        const mouseUpHandler = state.canvasMouseUpHandlers.get(canvas);
        if (mouseUpHandler) {
          document.removeEventListener("mouseup", mouseUpHandler);
          state.canvasMouseUpHandlers.delete(canvas);
        }
        state.canvasDataMap.delete(canvas);
      }
      cell.remove();
    }
  }

  // Add missing cells at the end
  if (currentTotal < targetTotal) {
    for (let i = currentTotal; i < targetTotal; i++) {
      const r = Math.floor(i / state.gridCols);
      const c = i % state.gridCols;
      const cell = createCell(r, c);
      state.gridEl.appendChild(cell);
    }
  }

  // Update grid template
  state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${Math.round(GRID_MIN_COL_WIDTH * state.gridZoom / 100)}px, 1fr))`;
  state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;

  // Invalidate cache and get the current set of cells
  state.invalidateCellsCache();
  const cells = state.getCells();
  const reindexedMap = toDataMap(reindexed);
  const canvasesToRedraw = [];

  // Update each cell's position and restore compacted data
  for (let i = 0; i < targetTotal; i++) {
    const r = Math.floor(i / state.gridCols);
    const c = i % state.gridCols;
    const cell = cells[i];
    cell.dataset.row = String(r);
    cell.dataset.col = String(c);

    const existing = reindexedMap.get(`${r},${c}`);

    const img = cell.querySelector("img");
    const drop = cell.querySelector(".drop");
    const span = cell.querySelector("span");
    const textarea = cell.querySelector("textarea");
    const canvas = cell.querySelector(".drawing-canvas");

    if (existing && existing.imgSrc) {
      img.src = existing.imgSrc;
      img.alt = existing.imgAlt;
      img.style.display = "block";
      drop.style.border = "unset";
      if (span) span.style.display = "none";
    } else {
      img.src = "";
      img.alt = "";
      img.style.display = "none";
      drop.style.border = "var(--border)";
      if (span) span.style.display = "block";
    }

    textarea.value = existing && existing.text ? existing.text : "";

    // Restore drawing paths
    if (canvas) {
      const canvasData = state.canvasDataMap.get(canvas);
      if (canvasData) {
        if (existing && existing.drawingPaths && existing.drawingPaths.length > 0) {
          canvasData.paths = existing.drawingPaths;
          canvasesToRedraw.push(canvas);
        } else {
          canvasData.paths = [];
          canvasesToRedraw.push(canvas);
        }
      }
    }

    updateFilenameLabel(cell);
  }

  // Batch redraw all canvases
  if (canvasesToRedraw.length > 0) {
    const dpr = window.devicePixelRatio || 1;
    for (const canvas of canvasesToRedraw) {
      redrawCanvas(canvas, dpr);
    }
  }

  buildRowControls();
};

// --- updateGrid ---

const updateGrid = () => {
  const newCols = Math.min(parseInt(document.getElementById("grid-cols").value, 10) || GRID_DEFAULT_COLS, GRID_MAX_COLS);

  // Reflect clamped value back into the input
  document.getElementById("grid-cols").value = newCols;

  // Update column count in state — relayoutGrid will handle the full reflow
  // and calculate the needed rows to fit all existing content.
  state.gridCols = newCols;

  // Compact the grid: reflows all content into the new column count,
  // preserving all items and adjusting rows as needed.
  relayoutGrid();
};

// Wire up grid size input
document.getElementById("grid-cols").addEventListener("change", updateGrid);

export {
  setupCell,
  getCellData,
  setCellData,
  swapCells,
  getAdjacentCell,
  updateFilenameLabel,
  toggleFilenames,
  createCell,
  buildGrid,
  collectGridData,
  restoreCellData,
  relayoutGrid,
  updateGrid,
};

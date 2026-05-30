/**
 * Undo system for grid operations.
 *
 * Captures full grid snapshots (dimensions + cell data) before mutations.
 * Cmd+Z / Ctrl+Z restores the previous state.
 */

import state from './state.js';
import { showToast } from './toast.js';

const MAX_UNDO_STACK = 50;

/** @type {Array<{gridRows: number, gridCols: number, cells: Array, selectedRows: Array, focusedCellIndex: number}>} */
const undoStack = [];

/** When > 0, pushUndo calls are suppressed (used to batch compound operations). */
let suppressCount = 0;

/** Suppress undo pushes for the duration of a callback. */
const withoutUndo = (fn) => {
  suppressCount++;
  try {
    fn();
  } finally {
    suppressCount--;
  }
};

/** Collect current staging area items as serializable data. */
const _collectStagingItems = () => {
  const inner = document.getElementById("bottom-toolbar-inner");
  if (!inner) return [];
  const items = inner.querySelectorAll(".bottom-toolbar-item");
  return [...items].map((item) => {
    const img = item.querySelector("img");
    return {
      src: img ? img.src : "",
      alt: img ? img.alt : "",
    };
  });
};

/** Restore staging area to match a snapshot. */
const _restoreStagingItems = (items) => {
  const inner = document.getElementById("bottom-toolbar-inner");
  if (!inner) return;

  // Remove all current staging items
  const existing = inner.querySelectorAll(".bottom-toolbar-item");
  existing.forEach((el) => el.remove());

  // Re-add from snapshot using state.addImageToToolbar
  for (const item of items) {
    if (item.src) {
      state.addImageToToolbar(item.src, item.alt);
    }
  }
};

/**
 * Capture the current grid state and push it onto the undo stack.
 * Call this BEFORE performing any mutating grid operation.
 */
const pushUndo = () => {
  if (suppressCount > 0) return;

  const cells = state.getCells();
  const snapshot = {
    gridRows: state.gridRows,
    gridCols: state.gridCols,
    focusedCellIndex: state.focusedCellIndex,
    selectedRows: [...state.selectedRows],
    selectedCells: [...state.selectedCells],
    cells: cells.map((cell) => {
      const img = cell.querySelector("img");
      const textarea = cell.querySelector("textarea");
      const canvas = cell.querySelector(".drawing-canvas");
      const drawingPaths = canvas && state.canvasDataMap.get(canvas)
        ? state.canvasDataMap.get(canvas).paths.map((p) => ({
            ...p,
            ...(p.points ? { points: [...p.points] } : {}),
          }))
        : [];
      return {
        row: parseInt(cell.dataset.row, 10),
        col: parseInt(cell.dataset.col, 10),
        imgSrc: img && img.src && img.style.display !== "none" ? img.src : null,
        imgAlt: img ? img.alt : "",
        text: textarea ? textarea.value : "",
        drawingPaths,
      };
    }),
    // Snapshot staging area items
    stagingItems: _collectStagingItems(),
  };

  undoStack.push(snapshot);
  if (undoStack.length > MAX_UNDO_STACK) {
    undoStack.shift();
  }
};

/**
 * Pop the last snapshot and restore the grid to that state.
 * Returns true if undo was performed, false if stack was empty.
 */
const performUndo = () => {
  if (undoStack.length === 0) {
    showToast("Nothing to undo", "error");
    return false;
  }

  const snapshot = undoStack.pop();

  // Update grid dimensions
  state.gridRows = snapshot.gridRows;
  state.gridCols = snapshot.gridCols;
  document.getElementById("grid-rows").value = state.gridRows;
  document.getElementById("grid-cols").value = state.gridCols;

  // Suppress blob URL revocation during undo — the snapshot holds valid references
  state._undoingInProgress = true;
  _buildGrid();
  state._undoingInProgress = false;

  // Now restore cell data from the snapshot
  state.invalidateCellsCache();
  const cells = state.getCells();

  for (const cellData of snapshot.cells) {
    const idx = cellData.row * state.gridCols + cellData.col;
    if (idx >= 0 && idx < cells.length) {
      _setCellData(cells[idx], cellData);
    }
  }

  // Restore selection state
  state.selectedRows.clear();
  for (const r of snapshot.selectedRows) state.selectedRows.add(r);

  state.selectedCells.clear();
  for (const idx of snapshot.selectedCells) state.selectedCells.add(idx);

  state.focusedCellIndex = snapshot.focusedCellIndex;

  // Re-apply selection CSS
  cells.forEach((cell) => {
    cell.classList.remove("keyboard-selected", "keyboard-focused");
  });
  state.selectedCells.forEach((idx) => {
    if (idx >= 0 && idx < cells.length) {
      cells[idx].classList.add("keyboard-selected");
    }
  });
  if (state.focusedCellIndex >= 0 && state.focusedCellIndex < cells.length) {
    cells[state.focusedCellIndex].classList.add("keyboard-focused");
  }

  _buildRowControls();
  _restoreStagingItems(snapshot.stagingItems);
  showToast("Undo");
  return true;
};

/** Check if there are any undo entries available. */
const canUndo = () => undoStack.length > 0;

/** Clear the entire undo stack. */
const clearUndoStack = () => {
  undoStack.length = 0;
};

// --- Lazy dependency resolution (avoids circular imports) ---

let _buildGrid = null;
let _setCellData = null;
let _buildRowControls = null;

const initUndoDeps = ({ buildGrid, setCellData, buildRowControls }) => {
  _buildGrid = buildGrid;
  _setCellData = setCellData;
  _buildRowControls = buildRowControls;
};

export { pushUndo, performUndo, canUndo, clearUndoStack, withoutUndo, initUndoDeps };

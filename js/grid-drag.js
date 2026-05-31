import state from './state.js';
import { EDGE_EXPANSION_THRESHOLD, EDGE_EXPANSION_MAX_COLS, EDGE_EXPANSION_MAX_ROWS } from './constants.js';
import { pushUndo } from './undo.js';
import {
  setFocusedCellByIndex,
  clearCellSelection,
  addCellToSelectionByIndex,
} from './grid-selection.js';

// These are resolved lazily to avoid circular imports with grid-core.js / grid-row-controls.js
let _getCellData = null;
let _setCellData = null;
let _insertRowAt = null;
let _insertColumnAt = null;

/** Must be called once after all modules are loaded to wire up cross-module refs. */
const initDragDeps = ({ getCellData, setCellData, insertRowAt, insertColumnAt }) => {
  _getCellData = getCellData;
  _setCellData = setCellData;
  _insertRowAt = insertRowAt;
  _insertColumnAt = insertColumnAt;
};

// --- Mouse drag-to-move for selected cells ---

let cellDragState = null; // { startIndex, startX, startY, active }

const getCellIndexAtPoint = (x, y, cells = state.getCells()) => {
  if (cells.length === 0) return -1;

  // O(1) hit test using the browser's built-in spatial index
  const el = document.elementFromPoint(x, y);
  if (el) {
    const cell = el.closest(".grid-cell");
    if (cell) {
      const idx = cells.indexOf(cell);
      if (idx !== -1) return idx;
    }
  }

  // If cursor is within the grid but in a gap, estimate the nearest cell
  // from grid geometry instead of iterating all cells.
  const gridRect = state.gridEl.getBoundingClientRect();
  if (x >= gridRect.left && x <= gridRect.right && y >= gridRect.top && y <= gridRect.bottom) {
    const cols = state.gridCols;
    const rows = state.gridRows;

    // Compute approximate column and row from relative position
    const relX = x - gridRect.left;
    const relY = y - gridRect.top;
    const col = Math.min(cols - 1, Math.max(0, Math.floor((relX / gridRect.width) * cols)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((relY / gridRect.height) * rows)));
    const idx = row * cols + col;

    if (idx >= 0 && idx < cells.length) return idx;
  }
  return -1;
};

const clearCellDropTarget = (cells = state.getCells()) => {
  cells.forEach((cell) => {
    cell.classList.remove("cell-drop-target");
  });
};

const showCellDropTargets = (targetIndices, cells = state.getCells()) => {
  clearCellDropTarget(cells);
  for (const idx of targetIndices) {
    if (idx >= 0 && idx < cells.length) {
      cells[idx].classList.add("cell-drop-target");
    }
  }
};

const computeMoveTargets = (selectedIndices, fromIndex, toIndex, cells = state.getCells()) => {
  if (fromIndex === toIndex) return null;

  const offset = toIndex - fromIndex;

  const totalCells = cells.length;

  // Check that ALL selected cells can move with this offset
  for (const idx of selectedIndices) {
    const targetIdx = idx + offset;
    if (targetIdx < 0 || targetIdx >= totalCells) return null;
  }

  return selectedIndices.map((idx) => idx + offset);
};

const assertDragDepsInitialized = () => {
  if (!_getCellData || !_setCellData || !_insertRowAt || !_insertColumnAt) {
    throw new Error("grid-drag: initDragDeps() was never called");
  }
};

const performCellMove = (selectedIndices, targetIndices) => {
  assertDragDepsInitialized();
  pushUndo();
  const cells = state.getCells();
  const offset = targetIndices[0] - selectedIndices[0];

  const selectedSet = new Set(selectedIndices);
  const targetSet = new Set(targetIndices);

  // Collect data from selected cells and displaced cells
  const selectedData = selectedIndices.map((idx) => _getCellData(cells[idx]));
  const displacedIndices = targetIndices.filter((idx) => !selectedSet.has(idx));
  const displacedData = displacedIndices.map((idx) => _getCellData(cells[idx]));

  // Cells vacated by the selection that aren't being filled by the selection
  const vacatedIndices = selectedIndices.filter((idx) => !targetSet.has(idx));

  // Move selected data to target positions
  if (offset > 0) {
    for (let i = selectedIndices.length - 1; i >= 0; i--) {
      _setCellData(cells[targetIndices[i]], selectedData[i]);
    }
  } else {
    for (let i = 0; i < selectedIndices.length; i++) {
      _setCellData(cells[targetIndices[i]], selectedData[i]);
    }
  }

  // Place displaced data into vacated positions
  for (let i = 0; i < displacedIndices.length; i++) {
    _setCellData(cells[vacatedIndices[i]], displacedData[i]);
  }

  // Update selection to new positions
  clearCellSelection();
  for (const idx of targetIndices) {
    addCellToSelectionByIndex(idx);
  }

  // Move focus
  const newFocusIndex = state.focusedCellIndex + offset;
  setFocusedCellByIndex(newFocusIndex);
};

const handleCellDragStart = (e, cell) => {
  // Don't interfere with drawing mode
  if (state.drawingMode) return;
  // Only left mouse button
  if (e.button !== 0) return;
  // Don't interfere with textarea
  if (e.target.tagName === "TEXTAREA") return;
  // Don't interfere with modifier keys used for selection
  if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;

  const cells = state.getCells();
  const index = cells.indexOf(cell);
  if (index === -1) return;

  // Only start drag if clicking on an already-selected cell with multiple selections
  if (!state.selectedCells.has(index) || state.selectedCells.size < 2) return;

  cellDragState = {
    startIndex: index,
    startX: e.clientX,
    startY: e.clientY,
    active: false,
  };

  // Prevent default to stop text selection and native HTML5 drag during multi-cell drag
  e.preventDefault();
};

// Suppress native HTML5 dragstart on images when a multi-cell drag is pending/active.
// Without this, the browser's native drag steals mouse events and our mousemove/mouseup never fire.
document.addEventListener("dragstart", (e) => {
  if (cellDragState) {
    e.preventDefault();
  }
}, { capture: true });

// Detect which edge the cursor is beyond relative to the grid, for auto-expansion
const getEdgeExpansionDirection = (clientX, clientY) => {
  const gridRect = state.gridEl.getBoundingClientRect();
  const threshold = EDGE_EXPANSION_THRESHOLD; // px beyond edge to trigger expansion

  if (clientX > gridRect.right + threshold) return "right";
  if (clientX < gridRect.left - threshold) return "left";
  if (clientY > gridRect.bottom + threshold) return "down";
  if (clientY < gridRect.top - threshold) return "up";
  return null;
};

// Throttle edge expansion to avoid rapid repeated expansions
let lastEdgeExpansionTime = 0;
const EDGE_EXPANSION_COOLDOWN = 400; // ms

const expandGridForDrag = (direction) => {
  assertDragDepsInitialized();
  const now = Date.now();
  if (now - lastEdgeExpansionTime < EDGE_EXPANSION_COOLDOWN) return false;

  // Prevent infinite expansion — enforce maximum grid dimensions
  if ((direction === "left" || direction === "right") && state.gridCols >= EDGE_EXPANSION_MAX_COLS) return false;
  if ((direction === "up" || direction === "down") && state.gridRows >= EDGE_EXPANSION_MAX_ROWS) return false;

  lastEdgeExpansionTime = now;

  const selectedIndices = [...state.selectedCells].sort((a, b) => a - b);

  if (direction === "right") {
    // Only expand if any selected cell is in the last column
    const atRightEdge = selectedIndices.some((idx) => idx % state.gridCols === state.gridCols - 1);
    if (!atRightEdge) return false;
    const oldCols = state.gridCols;
    _insertColumnAt(state.gridCols);
    // After appending a column, indices shift because grid is row-major with more cols
    const newIndices = selectedIndices.map((idx) => {
      const row = Math.floor(idx / oldCols);
      const col = idx % oldCols;
      return row * state.gridCols + col;
    });
    const newStartIndex = (() => {
      const row = Math.floor(cellDragState.startIndex / oldCols);
      const col = cellDragState.startIndex % oldCols;
      return row * state.gridCols + col;
    })();
    clearCellSelection();
    for (const idx of newIndices) {
      addCellToSelectionByIndex(idx);
    }
    cellDragState.startIndex = newStartIndex;
    if (state.focusedCellIndex >= 0) {
      const row = Math.floor(state.focusedCellIndex / oldCols);
      const col = state.focusedCellIndex % oldCols;
      setFocusedCellByIndex(row * state.gridCols + col);
    }
    return true;
  } else if (direction === "left") {
    const atLeftEdge = selectedIndices.some((idx) => idx % state.gridCols === 0);
    if (!atLeftEdge) return false;
    _insertColumnAt(0);
    // After inserting column at 0, indices shift: each cell moves right by 1 per row
    const oldCols = state.gridCols - 1;
    const newIndices = selectedIndices.map((idx) => {
      const row = Math.floor(idx / oldCols);
      const col = idx % oldCols;
      return row * state.gridCols + (col + 1);
    });
    const newStartIndex = (() => {
      const row = Math.floor(cellDragState.startIndex / oldCols);
      const col = cellDragState.startIndex % oldCols;
      return row * state.gridCols + (col + 1);
    })();
    // Update selection
    clearCellSelection();
    for (const idx of newIndices) {
      addCellToSelectionByIndex(idx);
    }
    cellDragState.startIndex = newStartIndex;
    if (state.focusedCellIndex >= 0) {
      const row = Math.floor(state.focusedCellIndex / oldCols);
      const col = state.focusedCellIndex % oldCols;
      setFocusedCellByIndex(row * state.gridCols + (col + 1));
    }
    return true;
  } else if (direction === "down") {
    // Only expand if any selected cell is in the last row
    const totalCells = state.gridCols * state.gridRows;
    const atBottomEdge = selectedIndices.some((idx) => idx >= totalCells - state.gridCols);
    if (!atBottomEdge) return false;
    _insertRowAt(state.gridRows);
    // Indices don't change when appending at the bottom, but grid was rebuilt
    // so we need to re-apply selection CSS classes
    clearCellSelection();
    for (const idx of selectedIndices) {
      addCellToSelectionByIndex(idx);
    }
    return true;
  } else if (direction === "up") {
    const atTopEdge = selectedIndices.some((idx) => idx < state.gridCols);
    if (!atTopEdge) return false;
    _insertRowAt(0);
    // After inserting row at 0, all indices shift down by gridCols
    const newIndices = selectedIndices.map((idx) => idx + state.gridCols);
    const newStartIndex = cellDragState.startIndex + state.gridCols;
    clearCellSelection();
    for (const idx of newIndices) {
      addCellToSelectionByIndex(idx);
    }
    cellDragState.startIndex = newStartIndex;
    if (state.focusedCellIndex >= 0) {
      setFocusedCellByIndex(state.focusedCellIndex + state.gridCols);
    }
    return true;
  }
  return false;
};

let cellDragRafId = null;

const handleCellDragMove = (e) => {
  if (!cellDragState) return;

  const dx = e.clientX - cellDragState.startX;
  const dy = e.clientY - cellDragState.startY;

  // Require a minimum drag distance to activate
  if (!cellDragState.active && Math.sqrt(dx * dx + dy * dy) < 8) return;

  if (!cellDragState.active) {
    cellDragState.active = true;
    document.body.classList.add("cell-dragging");
  }

  // Throttle the expensive work (showCellDropTargets) to one update per frame
  if (cellDragRafId) cancelAnimationFrame(cellDragRafId);

  const clientX = e.clientX;
  const clientY = e.clientY;

  cellDragRafId = requestAnimationFrame(() => {
    cellDragRafId = null;
    if (!cellDragState) return;

    // Check if cursor is beyond grid edges — auto-expand
    const edgeDir = getEdgeExpansionDirection(clientX, clientY);
    if (edgeDir) {
      expandGridForDrag(edgeDir);
    }

    // Grab cells once for the entire operation
    const cells = state.getCells();

    const targetIndex = getCellIndexAtPoint(clientX, clientY, cells);
    if (targetIndex === -1) {
      clearCellDropTarget(cells);
      return;
    }

    const selectedIndices = [...state.selectedCells].sort((a, b) => a - b);
    const targets = computeMoveTargets(selectedIndices, cellDragState.startIndex, targetIndex, cells);

    if (targets) {
      showCellDropTargets(targets, cells);
    } else {
      clearCellDropTarget(cells);
    }
  });
};

const handleCellDragEnd = (e) => {
  if (!cellDragState) return;

  // Cancel any pending RAF from drag move
  if (cellDragRafId) {
    cancelAnimationFrame(cellDragRafId);
    cellDragRafId = null;
  }

  const wasDragActive = cellDragState.active;

  if (cellDragState.active) {
    const cells = state.getCells();
    const targetIndex = getCellIndexAtPoint(e.clientX, e.clientY, cells);
    if (targetIndex !== -1 && targetIndex !== cellDragState.startIndex) {
      const selectedIndices = [...state.selectedCells].sort((a, b) => a - b);
      const targets = computeMoveTargets(selectedIndices, cellDragState.startIndex, targetIndex, cells);
      if (targets) {
        performCellMove(selectedIndices, targets);
      }
    }
    clearCellDropTarget(cells);
    document.body.classList.remove("cell-dragging");
  }

  cellDragState = null;

  // Suppress the click event that follows mouseup after a drag
  if (wasDragActive) {
    const suppressClick = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    document.addEventListener("click", suppressClick, { capture: true, once: true });
  }
};

document.addEventListener("mousemove", handleCellDragMove);
document.addEventListener("mouseup", handleCellDragEnd);

export {
  initDragDeps,
  getCellIndexAtPoint,
  clearCellDropTarget,
  showCellDropTargets,
  computeMoveTargets,
  performCellMove,
  handleCellDragStart,
  getEdgeExpansionDirection,
  expandGridForDrag,
  handleCellDragMove,
  handleCellDragEnd,
};

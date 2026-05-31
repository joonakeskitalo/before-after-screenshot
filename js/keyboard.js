import state from './state.js';
import { applyGridZoom } from './zoom.js';
import { getAdjacentCell, getCellData, setCellData, insertRowAt, insertColumnAt, deleteRowAt, deleteColumnAt, updateFilenameLabel, pushUndo, performUndo } from './grid.js';
import { withoutUndo } from './undo.js';
import { lastActiveDrawingCanvas } from './drawing-tools.js';
import {
  updatePresetColorSelection, penModeBtn, arrowModeBtn, lineModeBtn,
  rectModeBtn, rectstrokeModeBtn, ovalModeBtn, ovalfillModeBtn,
  dotModeBtn, eraserModeBtn, objectEraserModeBtn, moveModeBtn,
  textModeBtn, drawColorInput,
} from './drawing.js';
import { toggleStagingArea } from './toolbar.js';
import { ZOOM_STEP, ZOOM_TOGGLE_LOW, ZOOM_TOGGLE_HIGH, SCROLL_AFTER_MOVE_DELAY_MS } from './constants.js';
import { updateCopySelectedBtn } from './grid-ui.js';
import { copySelectedRows, copySelectedRawImages, copyWithScale, previewAllFilters, copyWithAllFilters } from './copy-export.js';
import { cycleColorFilter } from './color-filter.js';

// --- Keyboard Navigation for Grid Cells ---

const setFocusedCell = (index) => {
  const cells = state.getCells();
  if (state.focusedCellIndex >= 0 && state.focusedCellIndex < cells.length) {
    cells[state.focusedCellIndex].classList.remove("keyboard-focused");
  }
  state.focusedCellIndex = index;
  if (state.focusedCellIndex >= 0 && state.focusedCellIndex < cells.length) {
    cells[state.focusedCellIndex].classList.add("keyboard-focused");
    cells[state.focusedCellIndex].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }
  updateCopySelectedBtn();
  if (state.onFocusedCellChange) {
    state.onFocusedCellChange(index);
  }
};

const clearFocusedCell = () => {
  const cells = state.getCells();
  if (state.focusedCellIndex >= 0 && state.focusedCellIndex < cells.length) {
    cells[state.focusedCellIndex].classList.remove("keyboard-focused");
  }
  state.focusedCellIndex = -1;
  updateCopySelectedBtn();
};

// --- Multi-selection ---

const clearSelection = () => {
  state.getCells().forEach((cell) => {
    cell.classList.remove("keyboard-selected");
  });
  state.selectedCells.clear();
  updateCopySelectedBtn();
};

const addCellToSelection = (index) => {
  const cells = state.getCells();
  if (index >= 0 && index < cells.length) {
    state.selectedCells.add(index);
    cells[index].classList.add("keyboard-selected");
    updateCopySelectedBtn();
  }
};

const removeCellFromSelection = (index) => {
  const cells = state.getCells();
  if (index >= 0 && index < cells.length) {
    state.selectedCells.delete(index);
    cells[index].classList.remove("keyboard-selected");
    updateCopySelectedBtn();
  }
};

const extendSelection = (direction) => {
  const cells = state.getCells();
  if (cells.length === 0) return;

  if (state.focusedCellIndex < 0) {
    setFocusedCell(0);
    addCellToSelection(0);
    return;
  }

  if (state.selectedCells.size === 0) {
    addCellToSelection(state.focusedCellIndex);
  }

  const current = cells[state.focusedCellIndex];
  const target = getAdjacentCell(current, direction);
  if (target) {
    const targetIndex = cells.indexOf(target);
    if (state.selectedCells.has(targetIndex)) {
      removeCellFromSelection(state.focusedCellIndex);
    } else {
      addCellToSelection(targetIndex);
    }
    setFocusedCell(targetIndex);
  }
};

const navigateGrid = (direction) => {
  const cells = state.getCells();
  if (cells.length === 0) return;

  if (state.focusedCellIndex < 0) {
    setFocusedCell(0);
    return;
  }

  const current = cells[state.focusedCellIndex];
  const target = getAdjacentCell(current, direction);
  if (target) {
    const targetIndex = cells.indexOf(target);
    setFocusedCell(targetIndex);
  }
};

const MOVE_MAX_RECURSION = 1;

const moveGridItem = (direction, _depth = 0) => {
  const cells = state.getCells();
  if (cells.length === 0 || state.focusedCellIndex < 0) return;
  if (_depth > MOVE_MAX_RECURSION) return;
  if (_depth === 0) pushUndo();

  const selectedIndices = state.selectedCells.size > 0
    ? [...state.selectedCells].sort((a, b) => a - b)
    : [state.focusedCellIndex];

  let offset = 0;
  if (direction === "left") offset = -1;
  else if (direction === "right") offset = 1;
  else if (direction === "up") offset = -state.gridCols;
  else if (direction === "down") offset = state.gridCols;

  let needsExpand = false;
  for (const idx of selectedIndices) {
    const targetIdx = idx + offset;
    if (direction === "right" && idx % state.gridCols === state.gridCols - 1) { needsExpand = true; break; }
    if (direction === "left" && idx % state.gridCols === 0) { needsExpand = true; break; }
    if (direction === "down" && targetIdx >= cells.length) { needsExpand = true; break; }
    if (direction === "up" && targetIdx < 0) { needsExpand = true; break; }
  }

  if (needsExpand) {
    if (direction === "right") {
      const oldCols = state.gridCols;
      withoutUndo(() => insertColumnAt(state.gridCols));
      const shiftedIndices = selectedIndices.map((idx) => {
        const row = Math.floor(idx / oldCols);
        const col = idx % oldCols;
        return row * state.gridCols + col;
      });
      const newFocusRow = Math.floor(state.focusedCellIndex / oldCols);
      const newFocusCol = state.focusedCellIndex % oldCols;
      const newFocusIndex = newFocusRow * state.gridCols + newFocusCol;
      clearSelection();
      for (const idx of shiftedIndices) addCellToSelection(idx);
      setFocusedCell(newFocusIndex);
      moveGridItem(direction, _depth + 1);
      return;
    } else if (direction === "left") {
      const oldCols = state.gridCols;
      withoutUndo(() => insertColumnAt(0));
      const shiftedIndices = selectedIndices.map((idx) => {
        const row = Math.floor(idx / oldCols);
        const col = idx % oldCols;
        return row * state.gridCols + (col + 1);
      });
      const newFocusRow = Math.floor(state.focusedCellIndex / oldCols);
      const newFocusCol = state.focusedCellIndex % oldCols;
      const newFocusIndex = newFocusRow * state.gridCols + (newFocusCol + 1);
      clearSelection();
      for (const idx of shiftedIndices) addCellToSelection(idx);
      setFocusedCell(newFocusIndex);
      moveGridItem(direction, _depth + 1);
      return;
    } else if (direction === "down") {
      withoutUndo(() => insertRowAt(state.gridRows));
      clearSelection();
      for (const idx of selectedIndices) addCellToSelection(idx);
      setFocusedCell(state.focusedCellIndex);
      moveGridItem(direction, _depth + 1);
      return;
    } else if (direction === "up") {
      withoutUndo(() => insertRowAt(0));
      const shiftedIndices = selectedIndices.map((idx) => idx + state.gridCols);
      const newFocusIndex = state.focusedCellIndex + state.gridCols;
      clearSelection();
      for (const idx of shiftedIndices) addCellToSelection(idx);
      setFocusedCell(newFocusIndex);
      moveGridItem(direction, _depth + 1);
      return;
    }
  }

  // Normal move (no expansion needed)
  for (const idx of selectedIndices) {
    const targetIdx = idx + offset;
    if (targetIdx < 0 || targetIdx >= cells.length) return;
    if (direction === "left" && idx % state.gridCols === 0) return;
    if (direction === "right" && idx % state.gridCols === state.gridCols - 1) return;
  }

  const targetIndices = selectedIndices.map((idx) => idx + offset);
  const selectedSet = new Set(selectedIndices);
  const targetSet = new Set(targetIndices);

  const selectedData = selectedIndices.map((idx) => getCellData(cells[idx]));
  const displacedIndices = targetIndices.filter((idx) => !selectedSet.has(idx));
  const displacedData = displacedIndices.map((idx) => getCellData(cells[idx]));
  const vacatedIndices = selectedIndices.filter((idx) => !targetSet.has(idx));

  if (offset > 0) {
    for (let i = selectedIndices.length - 1; i >= 0; i--) {
      setCellData(cells[targetIndices[i]], selectedData[i]);
    }
  } else {
    for (let i = 0; i < selectedIndices.length; i++) {
      setCellData(cells[targetIndices[i]], selectedData[i]);
    }
  }

  for (let i = 0; i < displacedIndices.length; i++) {
    setCellData(cells[vacatedIndices[i]], displacedData[i]);
  }

  clearSelection();
  for (const idx of targetIndices) addCellToSelection(idx);

  const newFocusIndex = state.focusedCellIndex + offset;
  setFocusedCell(newFocusIndex);

  setTimeout(() => {
    const cell = state.getCells()[newFocusIndex];
    if (cell) cell.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, SCROLL_AFTER_MOVE_DELAY_MS);
};

// --- Key-Action Maps ---

// Tool switching hotkeys
const toolActions = {
  'b': () => penModeBtn.click(),
  'a': () => arrowModeBtn.click(),
  'l': () => lineModeBtn.click(),
  'r': () => rectModeBtn.click(),
  'R': () => rectstrokeModeBtn.click(),
  'e': () => eraserModeBtn.click(),
  'E': () => objectEraserModeBtn.click(),
  'o': () => ovalModeBtn.click(),
  'O': () => ovalfillModeBtn.click(),
  't': () => textModeBtn.click(),
  'd': () => dotModeBtn.click(),
  'm': () => moveModeBtn.click(),
};

// Grid manipulation hotkeys
const gridActions = {
  '?': () => insertRowAt(state.gridRows),
  '_': () => { if (state.gridRows > 1) deleteRowAt(state.gridRows - 1); },
  '+': (e) => { insertColumnAt(state.gridCols); e.preventDefault(); },
  '-': (e) => { if (state.gridCols > 1) deleteColumnAt(state.gridCols - 1); e.preventDefault(); },
};

// Zoom hotkeys
const zoomActions = {
  '[': (e) => { applyGridZoom(state.gridZoom - ZOOM_STEP); e.preventDefault(); },
  ']': (e) => { applyGridZoom(state.gridZoom + ZOOM_STEP); e.preventDefault(); },
  'z': (e) => {
    if (!e.metaKey && !e.ctrlKey) {
      applyGridZoom(state.gridZoom === ZOOM_TOGGLE_HIGH ? ZOOM_TOGGLE_LOW : ZOOM_TOGGLE_HIGH);
    }
  },
};

// Export and filter hotkeys
const exportActions = {
  'f': () => previewAllFilters(),
  'v': (e) => { if (!e.metaKey && !e.ctrlKey) cycleColorFilter(); },
  'C': () => copyWithAllFilters(),
  'A': () => document.getElementById("insert-all-btn").click(),
};

// Misc hotkeys
const miscActions = {
  'h': () => toggleStagingArea(),
  's': () => {
    const cells = state.getCells();
    const indices = state.selectedCells.size > 0
      ? [...state.selectedCells]
      : (state.focusedCellIndex >= 0 ? [state.focusedCellIndex] : []);
    if (indices.length === 0) return;
    pushUndo();
    for (const idx of indices) {
      const cell = cells[idx];
      if (!cell) continue;
      const img = cell.querySelector("img");
      if (!img || !img.src || img.style.display === "none") continue;
      state.addImageToToolbar(img.src, img.alt || "");
      img.src = "";
      img.style.display = "none";
      const drop = cell.querySelector(".drop");
      const span = cell.querySelector("span");
      if (drop) drop.style.border = "var(--border)";
      if (span) span.style.display = "block";
      const textarea = cell.querySelector("textarea");
      if (textarea) textarea.value = "";
      const canvas = cell.querySelector(".drawing-canvas");
      if (canvas) {
        state.canvasDataMap.delete(canvas);
      }
      updateFilenameLabel(cell);
    }
  },
  'x': () => {
    const presetColors = Array.from(
      document.querySelectorAll(".toolbar-drawing-controls .preset-color-btn")
    ).map((btn) => btn.dataset.color);
    if (presetColors.length > 0) {
      const currentIndex = presetColors.indexOf(state.drawColor);
      const nextIndex = (currentIndex + 1) % presetColors.length;
      state.drawColor = presetColors[nextIndex];
      drawColorInput.value = state.drawColor;
      updatePresetColorSelection();
    }
  },
};

// Thickness hotkeys (Shift+1/2/3) — use physical key codes to be locale-independent
const thicknessActions = {
  'Digit1': () => {
    const btns = document.querySelectorAll(".thickness-presets .thickness-btn");
    if (btns[0]) btns[0].click();
  },
  'Digit2': () => {
    const btns = document.querySelectorAll(".thickness-presets .thickness-btn");
    if (btns[1]) btns[1].click();
  },
  'Digit3': () => {
    const btns = document.querySelectorAll(".thickness-presets .thickness-btn");
    if (btns[2]) btns[2].click();
  },
};

// Number keys: select preset color by index
const handleNumberKey = (key) => {
  const presetBtns = document.querySelectorAll(".toolbar-drawing-controls:not(.filter-preview-drawing-controls) .preset-color-btn");
  const index = parseInt(key, 10) - 1;
  if (index < presetBtns.length) {
    presetBtns[index].click();
  }
};

// --- Arrow Key Handling ---

const handleArrowKey = (e, direction) => {
  if (e.altKey) {
    // Alt+Arrow: insert empty row/column relative to focused cell
    const cells = state.getCells();
    const focusedCell = state.focusedCellIndex >= 0 ? cells[state.focusedCellIndex] : null;
    if (direction === "up" || direction === "down") {
      const row = focusedCell ? parseInt(focusedCell.dataset.row, 10) : 0;
      const insertIndex = direction === "up" ? row : row + 1;
      insertRowAt(insertIndex);
    } else {
      const col = focusedCell ? parseInt(focusedCell.dataset.col, 10) : 0;
      const insertIndex = direction === "left" ? col : col + 1;
      insertColumnAt(insertIndex);
    }
  } else if (e.metaKey) {
    // Cmd+Arrow: move/swap the focused cell's content
    moveGridItem(direction);
  } else if (e.shiftKey) {
    // Shift+Arrow: extend multi-selection
    extendSelection(direction);
  } else {
    // Arrow: navigate focus between cells (clears selection)
    clearSelection();
    navigateGrid(direction);
  }
  e.preventDefault();
};

// --- Backspace Handling ---

const handleBackspace = (e) => {
  if (state.selectedCells.size > 0) {
    if (e.shiftKey && state.focusedCellIndex >= 0) {
      e.preventDefault();
      const cells = state.getCells();
      const focusedCell = cells[state.focusedCellIndex];
      if (focusedCell) {
        const row = parseInt(focusedCell.dataset.row, 10);
        clearSelection();
        clearFocusedCell();
        deleteRowAt(row);
      }
      return;
    }
    if (e.altKey && state.focusedCellIndex >= 0) {
      e.preventDefault();
      const cells = state.getCells();
      const focusedCell = cells[state.focusedCellIndex];
      if (focusedCell) {
        const col = parseInt(focusedCell.dataset.col, 10);
        clearSelection();
        clearFocusedCell();
        deleteColumnAt(col);
      }
      return;
    }
    e.preventDefault();
    pushUndo();
    const cells = state.getCells();
    state.selectedCells.forEach((index) => {
      const cell = cells[index];
      if (!cell) return;
      const img = cell.querySelector("img");
      const drop = cell.querySelector(".drop");
      const span = cell.querySelector("span");
      const textarea = cell.querySelector("textarea");
      if (img) { img.src = ""; img.style.display = "none"; }
      if (drop) drop.style.border = "var(--border)";
      if (span) span.style.display = "block";
      if (textarea) textarea.value = "";
      updateFilenameLabel(cell);
    });
    return;
  }

  // No selection but focused cell
  if (state.focusedCellIndex >= 0) {
    if (e.shiftKey) {
      e.preventDefault();
      const cells = state.getCells();
      const focusedCell = cells[state.focusedCellIndex];
      if (focusedCell) {
        const row = parseInt(focusedCell.dataset.row, 10);
        clearFocusedCell();
        deleteRowAt(row);
      }
      return;
    }
    if (e.altKey) {
      e.preventDefault();
      const cells = state.getCells();
      const focusedCell = cells[state.focusedCellIndex];
      if (focusedCell) {
        const col = parseInt(focusedCell.dataset.col, 10);
        clearFocusedCell();
        deleteColumnAt(col);
      }
      return;
    }
  }
};

// --- Main Keydown Handler ---

document.addEventListener("keydown", (e) => {
  // Skip hotkeys when typing in an input, textarea, or contenteditable
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;

  // Arrow key navigation (works even in drawing mode)
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    const direction = e.key.replace("Arrow", "").toLowerCase();
    handleArrowKey(e, direction);
    return;
  }

  // Cmd+Z / Ctrl+Z: undo last grid operation (defer to drawing undo when in drawing mode)
  if (e.key === "z" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
    if (state.drawingMode && lastActiveDrawingCanvas) {
      // Let the drawing-tools handler handle it
      return;
    }
    e.preventDefault();
    performUndo();
    return;
  }

  // Cmd+A: select all cells in the grid
  if (e.key === "a" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
    e.preventDefault();
    const cells = state.getCells();
    if (cells.length === 0) return;
    clearSelection();
    for (let i = 0; i < cells.length; i++) {
      addCellToSelection(i);
    }
    setFocusedCell(cells.length - 1);
    return;
  }

  // Cmd+C: copy selected cells/rows, or copy entire grid
  if (e.key === "c" && e.metaKey && !e.shiftKey) {
    e.preventDefault();
    if (state.selectedCells.size > 0 || state.selectedRows.size > 0 || state.focusedCellIndex >= 0) {
      copySelectedRows();
    } else {
      copyWithScale();
    }
    return;
  }

  // Cmd+B: copy raw image(s) from selected grid cells
  if (e.key === "b" && e.metaKey && !e.shiftKey) {
    e.preventDefault();
    if (state.selectedCells.size > 0 || state.selectedRows.size > 0 || state.focusedCellIndex >= 0) {
      copySelectedRawImages();
    }
    return;
  }

  // Enter: focus the label textarea of the currently focused cell
  if (e.key === "Enter" && state.focusedCellIndex >= 0) {
    const cells = state.getCells();
    const cell = cells[state.focusedCellIndex];
    if (cell) {
      const textarea = cell.querySelector("textarea");
      if (textarea) { textarea.focus(); e.preventDefault(); }
    }
    return;
  }

  // Backspace: clear/delete content
  if (e.key === "Backspace") {
    handleBackspace(e);
    return;
  }

  // Escape: clear focus and selection
  if (e.key === "Escape") {
    clearSelection();
    clearFocusedCell();
    return;
  }

  // Thickness hotkeys: Shift + physical 1/2/3 (locale-independent)
  if (e.shiftKey && thicknessActions[e.code]) {
    thicknessActions[e.code](e);
    return;
  }

  // Skip remaining hotkeys when Shift is used as a drawing modifier,
  // except for tool switching (R, E, O, A)
  if (e.shiftKey && state.drawingMode && !["R", "E", "O", "A"].includes(e.key)) return;

  // Number keys: select preset color by index
  if (/^[1-9]$/.test(e.key)) {
    handleNumberKey(e.key);
    return;
  }

  // Look up the key in action maps (order: tools, grid, zoom, export, misc)
  const action =
    toolActions[e.key] ||
    gridActions[e.key] ||
    zoomActions[e.key] ||
    exportActions[e.key] ||
    miscActions[e.key];

  if (action) {
    action(e);
  }
});

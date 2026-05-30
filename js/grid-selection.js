import state from './state.js';
import { updateCopySelectedBtn } from './grid-ui.js';

// --- Click-based cell selection ---

const setFocusedCellByIndex = (index) => {
  const cells = state.getCells();
  if (state.focusedCellIndex >= 0 && state.focusedCellIndex < cells.length) {
    cells[state.focusedCellIndex].classList.remove("keyboard-focused");
  }
  state.focusedCellIndex = index;
  if (index >= 0 && index < cells.length) {
    cells[index].classList.add("keyboard-focused");
  }
};

const clearCellSelection = () => {
  state.getCells().forEach((cell) => {
    cell.classList.remove("keyboard-selected");
  });
  state.selectedCells.clear();
  updateCopySelectedBtn();
};

const addCellToSelectionByIndex = (index) => {
  const cells = state.getCells();
  if (index >= 0 && index < cells.length) {
    state.selectedCells.add(index);
    cells[index].classList.add("keyboard-selected");
    updateCopySelectedBtn();
  }
};

const removeCellFromSelectionByIndex = (index) => {
  const cells = state.getCells();
  if (index >= 0 && index < cells.length) {
    state.selectedCells.delete(index);
    cells[index].classList.remove("keyboard-selected");
    updateCopySelectedBtn();
  }
};

const handleCellClick = (e, cell) => {
  // Don't interfere with drawing mode
  if (state.drawingMode) return;
  // Don't interfere with ctrl/alt combos
  if (e.ctrlKey || e.altKey) return;
  // Don't interfere with textarea clicks
  if (e.target.tagName === "TEXTAREA") return;

  const cells = state.getCells();
  const index = cells.indexOf(cell);
  if (index === -1) return;

  if (e.shiftKey) {
    // Shift+click: select range from last focused cell to this one
    const anchor = state.focusedCellIndex >= 0 ? state.focusedCellIndex : 0;
    const from = Math.min(anchor, index);
    const to = Math.max(anchor, index);
    clearCellSelection();
    for (let i = from; i <= to; i++) {
      addCellToSelectionByIndex(i);
    }
    setFocusedCellByIndex(index);
  } else if (e.metaKey) {
    // Cmd+click: toggle individual cell in/out of selection
    if (state.selectedCells.has(index)) {
      removeCellFromSelectionByIndex(index);
      // Clear focus when deselecting
      setFocusedCellByIndex(-1);
    } else {
      addCellToSelectionByIndex(index);
      setFocusedCellByIndex(index);
    }
  } else {
    // Plain click: select only this cell
    clearCellSelection();
    addCellToSelectionByIndex(index);
    setFocusedCellByIndex(index);
  }
};

export {
  setFocusedCellByIndex,
  clearCellSelection,
  addCellToSelectionByIndex,
  removeCellFromSelectionByIndex,
  handleCellClick,
};

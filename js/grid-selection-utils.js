import state from './state.js';

/**
 * Returns an array of cell indices that should be visible based on the current
 * selection state. Priority order:
 *   1. selectedCells — explicit cell selection
 *   2. selectedRows — row-based selection (all cells in selected rows)
 *   3. focusedCellIndex — single focused cell
 *   4. all cells — no selection active, everything is visible
 */
export const getVisibleCellIndices = () => {
  const allCells = state.getCells();

  if (state.selectedCells.size > 0) {
    return [...state.selectedCells].sort((a, b) => a - b);
  }

  if (state.selectedRows.size > 0) {
    return allCells.reduce((acc, cell, i) => {
      if (state.selectedRows.has(parseInt(cell.dataset.row, 10))) acc.push(i);
      return acc;
    }, []);
  }

  if (state.focusedCellIndex >= 0) {
    return [state.focusedCellIndex];
  }

  return allCells.map((_, i) => i);
};

/**
 * Hides DOM cells that are NOT in the visible set by setting display:none.
 * Returns the list of hidden cells (for later restoration) and whether any
 * selection was active.
 *
 * Use this for export functions that need to physically hide cells in the DOM
 * before capturing a screenshot.
 */
export const hideNonVisibleCells = () => {
  const hasSelection = state.selectedRows.size > 0 || state.selectedCells.size > 0 || state.focusedCellIndex >= 0;
  const hiddenCells = [];

  if (!hasSelection) {
    return { hiddenCells, hasSelection };
  }

  const allCells = state.getCells();
  const visibleIndices = new Set(getVisibleCellIndices());

  allCells.forEach((cell, index) => {
    if (!visibleIndices.has(index)) {
      cell.style.display = "none";
      hiddenCells.push(cell);
    }
  });

  return { hiddenCells, hasSelection };
};

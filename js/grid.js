/**
 * grid.js — barrel module that re-exports the split grid modules.
 *
 * Existing consumers continue to import from './grid.js' unchanged.
 * Internally the logic lives in:
 *   grid-selection.js  — click handlers, selection state
 *   grid-drag.js       — cell drag-to-move, edge expansion
 *   grid-row-controls.js — row handles, add/delete buttons, row/col insert/delete
 *   grid-core.js       — buildGrid, createCell, updateGrid, cell data helpers
 */

// Import everything from the sub-modules
// grid-selection.js is loaded transitively via grid-drag.js
import { initDragDeps } from './grid-drag.js';

import {
  initRowControlsDeps,
  buildRowControls,
  insertRowAt,
  insertColumnAt,
  deleteRowAt,
  deleteColumnAt,
  moveRow,
  swapRows,
  highlightRow,
  clearRowHighlights,
  clearRowDropIndicators,
  setRowDropTarget,
  clearRowDropTarget,
} from './grid-row-controls.js';

import {
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
} from './grid-core.js';

// Wire up lazy cross-module dependencies to break circular import chains.
// grid-drag.js needs getCellData/setCellData (from grid-core) and insertRowAt/insertColumnAt (from grid-row-controls).
// grid-row-controls.js needs getCellData/setCellData/createCell/updateFilenameLabel (from grid-core).
initDragDeps({ getCellData, setCellData, insertRowAt, insertColumnAt });
initRowControlsDeps({ getCellData, setCellData, createCell, updateFilenameLabel });

// Re-export the full public API so existing imports from './grid.js' keep working.
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
  buildRowControls,
  insertRowAt,
  insertColumnAt,
  deleteRowAt,
  deleteColumnAt,
  moveRow,
  swapRows,
  collectGridData,
  restoreCellData,
  relayoutGrid,
  highlightRow,
  clearRowHighlights,
  clearRowDropIndicators,
  setRowDropTarget,
  clearRowDropTarget,
  updateGrid,
};

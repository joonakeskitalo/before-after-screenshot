import state from './state.js';
import { GRID_MIN_COL_WIDTH } from './constants.js';
import { updateCopySelectedBtn } from './grid-ui.js';

// These are resolved lazily to avoid circular imports with grid-core.js
let _getCellData = null;
let _setCellData = null;
let _createCell = null;
let _updateFilenameLabel = null;

/** Must be called once after all modules are loaded to wire up cross-module refs. */
const initRowControlsDeps = ({ getCellData, setCellData, createCell, updateFilenameLabel }) => {
  _getCellData = getCellData;
  _setCellData = setCellData;
  _createCell = createCell;
  _updateFilenameLabel = updateFilenameLabel;
};

// --- SVG Icon Factories (DOM-based to avoid innerHTML/XSS vectors) ---

const SVG_NS = "http://www.w3.org/2000/svg";

const createSvgElement = (tag, attrs) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
};

/** Six-dot drag handle icon */
const createDragIcon = () => {
  const svg = createSvgElement("svg", { width: "12", height: "12", viewBox: "0 0 12 12" });
  const positions = [[4,3],[8,3],[4,6],[8,6],[4,9],[8,9]];
  for (const [cx, cy] of positions) {
    svg.appendChild(createSvgElement("circle", { cx, cy, r: "1.2", fill: "currentColor" }));
  }
  return svg;
};

/** X / close icon */
const createDeleteIcon = () => {
  const svg = createSvgElement("svg", { width: "12", height: "12", viewBox: "0 0 12 12" });
  const lineAttrs = { stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round" };
  svg.appendChild(createSvgElement("line", { x1: "3", y1: "3", x2: "9", y2: "9", ...lineAttrs }));
  svg.appendChild(createSvgElement("line", { x1: "9", y1: "3", x2: "3", y2: "9", ...lineAttrs }));
  return svg;
};

/** Plus / add icon */
const createAddIcon = () => {
  const svg = createSvgElement("svg", { width: "12", height: "12", viewBox: "0 0 12 12" });
  const lineAttrs = { stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round" };
  svg.appendChild(createSvgElement("line", { x1: "6", y1: "2", x2: "6", y2: "10", ...lineAttrs }));
  svg.appendChild(createSvgElement("line", { x1: "2", y1: "6", x2: "10", y2: "6", ...lineAttrs }));
  return svg;
};

// --- Row highlight / drop target helpers ---

const highlightRow = (row, active) => {
  state.getCells().forEach((cell) => {
    if (parseInt(cell.dataset.row, 10) === row) {
      cell.classList.toggle("row-dragging", active);
    }
  });
};

const clearRowHighlights = () => {
  state.getCells().forEach((cell) => {
    cell.classList.remove("row-dragging");
  });
};

const clearRowDropIndicators = () => {
  document.querySelectorAll(".add-row-btn.drop-target").forEach((btn) => {
    btn.classList.remove("drop-target");
  });
};

const setRowDropTarget = (row) => {
  const cells = state.getCells();
  // Clear previous target
  cells.forEach((cell) => {
    cell.classList.remove("row-drop-target");
  });
  // Highlight all cells in the target row
  cells.forEach((cell) => {
    if (parseInt(cell.dataset.row, 10) === row) {
      cell.classList.add("row-drop-target");
    }
  });
};

const clearRowDropTarget = () => {
  state.getCells().forEach((cell) => {
    cell.classList.remove("row-drop-target");
  });
};

// --- Row swap / move ---

const swapRows = (rowA, rowB) => {
  if (rowA === rowB) return;

  const cols = state.gridCols;
  const cells = state.getCells();

  // Swap cell data between the two rows directly
  for (let c = 0; c < cols; c++) {
    const idxA = rowA * cols + c;
    const idxB = rowB * cols + c;
    const dataA = _getCellData(cells[idxA]);
    const dataB = _getCellData(cells[idxB]);
    _setCellData(cells[idxA], dataB);
    _setCellData(cells[idxB], dataA);
  }

  // Update state.selectedRows to reflect the swap
  const hadA = state.selectedRows.has(rowA);
  const hadB = state.selectedRows.has(rowB);
  if (hadA && !hadB) {
    state.selectedRows.delete(rowA);
    state.selectedRows.add(rowB);
  } else if (hadB && !hadA) {
    state.selectedRows.delete(rowB);
    state.selectedRows.add(rowA);
  }
  // If both or neither were selected, no change needed

  buildRowControls();
};

const moveRow = (sourceRow, targetIndex) => {
  // If dropping in the same position or adjacent (no-op)
  if (targetIndex === sourceRow || targetIndex === sourceRow + 1) return;

  const cols = state.gridCols;
  const cells = state.getCells();

  // Extract source row data
  const sourceData = [];
  for (let c = 0; c < cols; c++) {
    sourceData.push(_getCellData(cells[sourceRow * cols + c]));
  }

  // Determine the effective target after removal
  const effectiveTarget = targetIndex > sourceRow ? targetIndex - 1 : targetIndex;

  // Shift rows to fill the gap left by sourceRow
  if (effectiveTarget > sourceRow) {
    // Moving down: shift rows between sourceRow+1..effectiveTarget up by one
    for (let r = sourceRow; r < effectiveTarget; r++) {
      for (let c = 0; c < cols; c++) {
        _setCellData(cells[r * cols + c], _getCellData(cells[(r + 1) * cols + c]));
      }
    }
  } else {
    // Moving up: shift rows between effectiveTarget..sourceRow-1 down by one
    for (let r = sourceRow; r > effectiveTarget; r--) {
      for (let c = 0; c < cols; c++) {
        _setCellData(cells[r * cols + c], _getCellData(cells[(r - 1) * cols + c]));
      }
    }
  }

  // Place source row at effectiveTarget
  for (let c = 0; c < cols; c++) {
    _setCellData(cells[effectiveTarget * cols + c], sourceData[c]);
  }

  // Update state.selectedRows to reflect the move
  const newSelected = new Set();
  state.selectedRows.forEach((r) => {
    if (r === sourceRow) {
      newSelected.add(effectiveTarget);
    } else {
      let adjusted = r;
      if (r > sourceRow) adjusted--;
      if (adjusted >= effectiveTarget) adjusted++;
      newSelected.add(adjusted);
    }
  });
  state.selectedRows.clear();
  newSelected.forEach((r) => state.selectedRows.add(r));

  buildRowControls();
};

// --- Insert / Delete rows and columns ---

const insertRowAt = (insertIndex) => {
  const cols = state.gridCols;
  const oldRows = state.gridRows;

  // Clamp insertIndex to valid range to prevent accessing non-existent cells
  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > oldRows) insertIndex = oldRows;

  // Collect data for rows that need to shift (from insertIndex onward) BEFORE modifying DOM
  const shiftData = [];
  const cells = state.getCells();
  for (let r = oldRows - 1; r >= insertIndex; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const idx = r * cols + c;
      shiftData.push({ row: r, col: c, data: _getCellData(cells[idx]) });
    }
  }

  // Update state.selectedRows — shift indices at or after insertIndex
  const newSelected = new Set();
  state.selectedRows.forEach((r) => {
    newSelected.add(r >= insertIndex ? r + 1 : r);
  });
  state.selectedRows.clear();
  newSelected.forEach((r) => state.selectedRows.add(r));
  updateCopySelectedBtn();

  state.gridRows++;
  document.getElementById("grid-rows").value = state.gridRows;

  // Append new empty cells for the extra row at the end of the grid
  for (let c = 0; c < cols; c++) {
    const cell = _createCell(oldRows, c);
    state.gridEl.appendChild(cell);
  }

  // Update grid template
  state.gridEl.style.gridTemplateColumns = `repeat(${cols}, minmax(${Math.round(GRID_MIN_COL_WIDTH * state.gridZoom / 100)}px, 1fr))`;
  state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;

  // Invalidate cache since we added cells
  state.invalidateCellsCache();
  const updatedCells = state.getCells();

  // Shift data down: move each cell from row r to row r+1 (bottom-up to avoid overwriting)
  for (const { row, col, data } of shiftData) {
    const targetIdx = (row + 1) * cols + col;
    const targetCell = updatedCells[targetIdx];
    targetCell.dataset.row = String(row + 1);
    _setCellData(targetCell, data);
  }

  // Clear the newly inserted row
  for (let c = 0; c < cols; c++) {
    const idx = insertIndex * cols + c;
    const cell = updatedCells[idx];
    cell.dataset.row = String(insertIndex);
    _setCellData(cell, { imgSrc: null, imgAlt: "", text: "", drawingPaths: [] });
  }

  // Fix dataset.row for all cells (the appended cells and shifted cells may have stale values)
  for (let r = 0; r < state.gridRows; r++) {
    for (let c = 0; c < cols; c++) {
      updatedCells[r * cols + c].dataset.row = String(r);
      updatedCells[r * cols + c].dataset.col = String(c);
    }
  }

  buildRowControls();
};

const insertColumnAt = (insertIndex) => {
  const oldCols = state.gridCols;
  const rows = state.gridRows;

  // Clamp insertIndex
  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > oldCols) insertIndex = oldCols;

  state.gridCols++;
  document.getElementById("grid-cols").value = state.gridCols;

  // Update selectedCells — shift indices to account for the new column
  const newSelected = new Set();
  state.selectedCells.forEach((idx) => {
    const row = Math.floor(idx / oldCols);
    const col = idx % oldCols;
    const newCol = col >= insertIndex ? col + 1 : col;
    newSelected.add(row * state.gridCols + newCol);
  });
  state.selectedCells.clear();
  newSelected.forEach((idx) => state.selectedCells.add(idx));

  // Update focusedCellIndex
  if (state.focusedCellIndex >= 0) {
    const row = Math.floor(state.focusedCellIndex / oldCols);
    const col = state.focusedCellIndex % oldCols;
    const newCol = col >= insertIndex ? col + 1 : col;
    state.focusedCellIndex = row * state.gridCols + newCol;
  }

  // Insert new empty cells into the DOM at the correct positions (bottom-up to keep indices stable)
  const cells = state.getCells();
  for (let r = rows - 1; r >= 0; r--) {
    const newCell = _createCell(r, insertIndex);
    // The reference node is the cell that was at (r, insertIndex) in the old layout,
    // i.e. index r * oldCols + insertIndex. If insertIndex === oldCols, append after last cell in row.
    const refIdx = r * oldCols + insertIndex;
    if (insertIndex < oldCols && refIdx < cells.length) {
      state.gridEl.insertBefore(newCell, cells[refIdx]);
    } else {
      // Inserting at the end of the row — append after the last cell of this row
      const lastInRow = cells[r * oldCols + oldCols - 1];
      if (lastInRow && lastInRow.nextSibling) {
        state.gridEl.insertBefore(newCell, lastInRow.nextSibling);
      } else {
        state.gridEl.appendChild(newCell);
      }
    }
  }

  // Update grid template
  state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${Math.round(GRID_MIN_COL_WIDTH * state.gridZoom / 100)}px, 1fr))`;
  state.gridEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

  // Invalidate cache and fix dataset.row/col attributes
  state.invalidateCellsCache();
  const updatedCells = state.getCells();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < state.gridCols; c++) {
      updatedCells[r * state.gridCols + c].dataset.row = String(r);
      updatedCells[r * state.gridCols + c].dataset.col = String(c);
    }
  }

  // Re-apply selection CSS classes
  updatedCells.forEach((cell) => {
    cell.classList.remove("keyboard-selected", "keyboard-focused");
  });
  state.selectedCells.forEach((idx) => {
    if (idx >= 0 && idx < updatedCells.length) {
      updatedCells[idx].classList.add("keyboard-selected");
    }
  });
  if (state.focusedCellIndex >= 0 && state.focusedCellIndex < updatedCells.length) {
    updatedCells[state.focusedCellIndex].classList.add("keyboard-focused");
  }
  updateCopySelectedBtn();

  buildRowControls();
};

const deleteRowAt = (rowIndex) => {
  if (state.gridRows <= 1) return; // Don't delete the last row

  const cols = state.gridCols;
  const cells = state.getCells();

  // Revoke blob URLs for the deleted row
  for (let c = 0; c < cols; c++) {
    const idx = rowIndex * cols + c;
    const img = cells[idx].querySelector("img");
    if (img && img.src && img.src.startsWith("blob:")) {
      URL.revokeObjectURL(img.src);
    }
  }

  // Shift data up: move each cell from row r+1 to row r (top-down from deleted row)
  for (let r = rowIndex; r < state.gridRows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const targetIdx = r * cols + c;
      const sourceIdx = (r + 1) * cols + c;
      _setCellData(cells[targetIdx], _getCellData(cells[sourceIdx]));
    }
  }

  // Remove the last row's cells from DOM
  for (let c = cols - 1; c >= 0; c--) {
    const idx = (state.gridRows - 1) * cols + c;
    const cell = cells[idx];
    // Clean up canvas observer and data
    const canvas = cell.querySelector(".drawing-canvas");
    if (canvas) {
      const observer = state.canvasObservers.get(canvas);
      if (observer) {
        observer.disconnect();
        state.canvasObservers.delete(canvas);
      }
      const visObserver = state.canvasVisibilityObservers.get(canvas);
      if (visObserver) {
        visObserver.disconnect();
        state.canvasVisibilityObservers.delete(canvas);
      }
      const mouseUpHandler = state.canvasMouseUpHandlers.get(canvas);
      if (mouseUpHandler) {
        document.removeEventListener("mouseup", mouseUpHandler);
        state.canvasMouseUpHandlers.delete(canvas);
      }
      state.canvasDataMap.delete(canvas);
    }
    cell.remove();
  }

  // Update state.selectedRows — remove deleted row and shift indices
  const newSelectedRows = new Set();
  state.selectedRows.forEach((r) => {
    if (r < rowIndex) newSelectedRows.add(r);
    else if (r > rowIndex) newSelectedRows.add(r - 1);
    // r === rowIndex is removed
  });
  state.selectedRows.clear();
  newSelectedRows.forEach((r) => state.selectedRows.add(r));

  // Update state.selectedCells — remove cells in the deleted row and shift indices
  const newSelectedCells = new Set();
  state.selectedCells.forEach((idx) => {
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    if (row === rowIndex) return; // remove selection for deleted row
    const newRow = row > rowIndex ? row - 1 : row;
    newSelectedCells.add(newRow * cols + col);
  });
  state.selectedCells.clear();
  newSelectedCells.forEach((idx) => state.selectedCells.add(idx));

  // Update focusedCellIndex
  if (state.focusedCellIndex >= 0) {
    const focusedRow = Math.floor(state.focusedCellIndex / cols);
    const focusedCol = state.focusedCellIndex % cols;
    if (focusedRow === rowIndex) {
      state.focusedCellIndex = -1;
    } else if (focusedRow > rowIndex) {
      state.focusedCellIndex = (focusedRow - 1) * cols + focusedCol;
    }
  }

  updateCopySelectedBtn();

  state.gridRows--;
  document.getElementById("grid-rows").value = state.gridRows;

  // Update grid template
  state.gridEl.style.gridTemplateColumns = `repeat(${cols}, minmax(${Math.round(GRID_MIN_COL_WIDTH * state.gridZoom / 100)}px, 1fr))`;
  state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;

  // Invalidate cache and fix dataset.row attributes
  state.invalidateCellsCache();
  const updatedCells = state.getCells();
  for (let r = 0; r < state.gridRows; r++) {
    for (let c = 0; c < cols; c++) {
      updatedCells[r * cols + c].dataset.row = String(r);
    }
  }

  // Re-apply selection CSS classes after index shift
  updatedCells.forEach((cell) => {
    cell.classList.remove("keyboard-selected", "keyboard-focused");
  });
  state.selectedCells.forEach((idx) => {
    if (idx >= 0 && idx < updatedCells.length) {
      updatedCells[idx].classList.add("keyboard-selected");
    }
  });
  if (state.focusedCellIndex >= 0 && state.focusedCellIndex < updatedCells.length) {
    updatedCells[state.focusedCellIndex].classList.add("keyboard-focused");
  }

  buildRowControls();
};

const deleteColumnAt = (colIndex) => {
  if (state.gridCols <= 1) return; // Don't delete the last column

  const rows = state.gridRows;
  const oldCols = state.gridCols;
  const cells = state.getCells();

  // Revoke blob URLs and remove cells in the deleted column (bottom-up to keep indices stable)
  for (let r = rows - 1; r >= 0; r--) {
    const idx = r * oldCols + colIndex;
    const cell = cells[idx];
    // Revoke blob URL
    const img = cell.querySelector("img");
    if (img && img.src && img.src.startsWith("blob:")) {
      URL.revokeObjectURL(img.src);
    }
    // Clean up canvas observer and data
    const canvas = cell.querySelector(".drawing-canvas");
    if (canvas) {
      const observer = state.canvasObservers.get(canvas);
      if (observer) {
        observer.disconnect();
        state.canvasObservers.delete(canvas);
      }
      const visObserver = state.canvasVisibilityObservers.get(canvas);
      if (visObserver) {
        visObserver.disconnect();
        state.canvasVisibilityObservers.delete(canvas);
      }
      const mouseUpHandler = state.canvasMouseUpHandlers.get(canvas);
      if (mouseUpHandler) {
        document.removeEventListener("mouseup", mouseUpHandler);
        state.canvasMouseUpHandlers.delete(canvas);
      }
      state.canvasDataMap.delete(canvas);
    }
    cell.remove();
  }

  // Update selectedCells — remove cells in the deleted column and shift indices
  const newCols = oldCols - 1;
  const newSelected = new Set();
  state.selectedCells.forEach((idx) => {
    const row = Math.floor(idx / oldCols);
    const col = idx % oldCols;
    if (col === colIndex) return; // remove selection for deleted column
    const newCol = col > colIndex ? col - 1 : col;
    newSelected.add(row * newCols + newCol);
  });
  state.selectedCells.clear();
  newSelected.forEach((idx) => state.selectedCells.add(idx));

  // Update focusedCellIndex
  if (state.focusedCellIndex >= 0) {
    const row = Math.floor(state.focusedCellIndex / oldCols);
    const col = state.focusedCellIndex % oldCols;
    if (col === colIndex) {
      state.focusedCellIndex = -1;
    } else {
      const newCol = col > colIndex ? col - 1 : col;
      state.focusedCellIndex = row * newCols + newCol;
    }
  }

  state.gridCols--;
  document.getElementById("grid-cols").value = state.gridCols;

  // Update grid template
  state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${Math.round(GRID_MIN_COL_WIDTH * state.gridZoom / 100)}px, 1fr))`;
  state.gridEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

  // Invalidate cache and fix dataset.row/col attributes
  state.invalidateCellsCache();
  const updatedCells = state.getCells();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < state.gridCols; c++) {
      updatedCells[r * state.gridCols + c].dataset.row = String(r);
      updatedCells[r * state.gridCols + c].dataset.col = String(c);
    }
  }

  // Re-apply selection CSS classes
  updatedCells.forEach((cell) => {
    cell.classList.remove("keyboard-selected", "keyboard-focused");
  });
  state.selectedCells.forEach((idx) => {
    if (idx >= 0 && idx < updatedCells.length) {
      updatedCells[idx].classList.add("keyboard-selected");
    }
  });
  if (state.focusedCellIndex >= 0 && state.focusedCellIndex < updatedCells.length) {
    updatedCells[state.focusedCellIndex].classList.add("keyboard-focused");
  }
  updateCopySelectedBtn();

  buildRowControls();
};

// --- buildRowControls ---

const createAddRowButton = (insertIndex) => {
  const btn = document.createElement("button");
  btn.className = "add-row-btn";
  btn.dataset.insertIndex = insertIndex;
  btn.title = `Add row here`;
  btn.appendChild(createAddIcon());

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    insertRowAt(insertIndex);
  });

  // Allow dropping rows onto add-row buttons as drop targets
  btn.addEventListener("dragover", (e) => {
    if (!state.rowDragState) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    btn.classList.add("drop-target");
  });

  btn.addEventListener("dragleave", () => {
    btn.classList.remove("drop-target");
  });

  btn.addEventListener("drop", (e) => {
    e.preventDefault();
    btn.classList.remove("drop-target");
    if (!state.rowDragState) return;
    const sourceRow = state.rowDragState.sourceRow;
    const targetIndex = parseInt(btn.dataset.insertIndex, 10);
    moveRow(sourceRow, targetIndex);
    state.rowDragState = null;
  });

  return btn;
};

const buildRowControls = () => {
  // Invalidate the cached cell list since the grid DOM was just rebuilt
  state.invalidateCellsCache();

  // Remove existing row controls
  const existingControls = document.querySelector(".row-controls");
  if (existingControls) existingControls.remove();

  const controlsContainer = document.createElement("div");
  controlsContainer.className = "row-controls";

  // Build a grid with interleaved rows:
  // [add-btn-row] [handle-row] [add-btn-row] [handle-row] ... [add-btn-row]
  const rowTemplate = [];
  for (let r = 0; r < state.gridRows; r++) {
    rowTemplate.push("auto"); // add-btn slot
    rowTemplate.push("1fr"); // handle slot
  }
  rowTemplate.push("auto"); // final add-btn slot
  controlsContainer.style.gridTemplateRows = rowTemplate.join(" ");
  controlsContainer.style.gap = "0";

  for (let r = 0; r < state.gridRows; r++) {
    // Add-row button before this row
    const addBtn = createAddRowButton(r);
    addBtn.style.gridRow = `${r * 2 + 1}`;
    addBtn.style.height = r === 0 ? "0px" : "var(--gap)";
    addBtn.style.alignSelf = "center";
    controlsContainer.appendChild(addBtn);

    // Row drag handle
    const handle = document.createElement("div");
    handle.className = "row-drag-handle";
    handle.draggable = true;
    handle.dataset.row = r;
    handle.title = `Drag to reorder row ${r + 1}`;
    handle.appendChild(createDragIcon());

    handle.addEventListener("dragstart", (e) => {
      const row = parseInt(handle.dataset.row, 10);
      state.rowDragState = { sourceRow: row };
      e.dataTransfer.setData("row-drag", String(row));
      e.dataTransfer.effectAllowed = "move";
      handle.classList.add("dragging");
      highlightRow(row, true);
    });

    // Delete row button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-row-btn";
    deleteBtn.dataset.row = r;
    deleteBtn.title = `Delete row ${r + 1}`;
    deleteBtn.appendChild(createDeleteIcon());
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteRowAt(parseInt(deleteBtn.dataset.row, 10));
    });

    // Row selection checkbox
    const selectCb = document.createElement("input");
    selectCb.type = "checkbox";
    selectCb.className = "row-select-cb";
    selectCb.dataset.row = r;
    selectCb.title = `Select row ${r + 1} for export`;
    selectCb.checked = state.selectedRows.has(r);
    selectCb.addEventListener("change", (e) => {
      const rowIdx = parseInt(selectCb.dataset.row, 10);
      if (selectCb.checked) {
        state.selectedRows.add(rowIdx);
      } else {
        state.selectedRows.delete(rowIdx);
      }
      updateCopySelectedBtn();
    });

    // Wrapper to stack handle, checkbox, and delete button vertically
    const rowControlGroup = document.createElement("div");
    rowControlGroup.className = "row-control-group";
    rowControlGroup.style.gridRow = `${r * 2 + 2}`;
    rowControlGroup.appendChild(selectCb);
    rowControlGroup.appendChild(handle);
    rowControlGroup.appendChild(deleteBtn);
    controlsContainer.appendChild(rowControlGroup);

    handle.addEventListener("dragend", () => {
      handle.classList.remove("dragging");
      state.rowDragState = null;
      clearRowHighlights();
      clearRowDropIndicators();
      clearRowDropTarget();
    });

    handle.addEventListener("dragover", (e) => {
      if (!state.rowDragState) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const targetRow = parseInt(handle.dataset.row, 10);
      if (targetRow !== state.rowDragState.sourceRow) {
        setRowDropTarget(targetRow);
      }
    });

    handle.addEventListener("dragleave", () => {
      clearRowDropTarget();
    });

    handle.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!state.rowDragState) return;
      const sourceRow = state.rowDragState.sourceRow;
      const targetRow = parseInt(handle.dataset.row, 10);
      if (sourceRow !== targetRow) {
        swapRows(sourceRow, targetRow);
      }
      state.rowDragState = null;
      clearRowHighlights();
      clearRowDropTarget();
    });
  }

  // Final add-row button after the last row
  const addLastBtn = createAddRowButton(state.gridRows);
  addLastBtn.style.gridRow = `${state.gridRows * 2 + 1}`;
  addLastBtn.style.height = "0px";
  addLastBtn.style.alignSelf = "center";
  controlsContainer.appendChild(addLastBtn);

  // Insert controls container next to the grid
  state.gridEl.parentElement.insertBefore(controlsContainer, state.gridEl);
};

export {
  initRowControlsDeps,
  buildRowControls,
  createAddRowButton,
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
};

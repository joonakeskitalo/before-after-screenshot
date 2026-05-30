import state from './state.js';
import { applyGridZoom } from './zoom.js';
import { toggleFilenames, getAdjacentCell, getCellData, setCellData, insertRowAt, insertColumnAt, deleteRowAt, deleteColumnAt } from './grid.js';
import {
  updatePresetColorSelection, penModeBtn, arrowModeBtn, lineModeBtn,
  rectModeBtn, rectstrokeModeBtn, ovalModeBtn, ovalfillModeBtn,
  dotModeBtn, eraserModeBtn, objectEraserModeBtn, moveModeBtn,
  textModeBtn, drawColorInput,
} from './drawing.js';
import { toggleStagingArea } from './toolbar.js';
import { ZOOM_STEP, ZOOM_TOGGLE_LOW, ZOOM_TOGGLE_HIGH, SCROLL_AFTER_MOVE_DELAY_MS } from './constants.js';
import { updateCopySelectedBtn, copySelectedRows, copySelectedRawImages, copyWithScale, previewAllFilters, copyWithAllFilters } from './copy-export.js';
import { cycleColorFilter } from './color-filter.js';

// --- Keyboard Navigation for Grid Cells ---

const setFocusedCell = (index) => {
  const cells = state.getCells();
  // Remove previous focus
  if (state.focusedCellIndex >= 0 && state.focusedCellIndex < cells.length) {
    cells[state.focusedCellIndex].classList.remove("keyboard-focused");
  }
  state.focusedCellIndex = index;
  if (state.focusedCellIndex >= 0 && state.focusedCellIndex < cells.length) {
    cells[state.focusedCellIndex].classList.add("keyboard-focused");
    // Scroll the focused cell fully into view
    cells[state.focusedCellIndex].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }
  // Update copy button label to reflect focused cell
  updateCopySelectedBtn();
  // Notify listeners (e.g. filter preview)
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

  // If no cell is focused yet, start at the first cell
  if (state.focusedCellIndex < 0) {
    setFocusedCell(0);
    addCellToSelection(0);
    return;
  }

  // If selection is empty, add the currently focused cell first
  if (state.selectedCells.size === 0) {
    addCellToSelection(state.focusedCellIndex);
  }

  const current = cells[state.focusedCellIndex];
  const target = getAdjacentCell(current, direction);
  if (target) {
    const targetIndex = cells.indexOf(target);
    // Toggle: if already selected, deselect the current cell (shrink selection)
    // Otherwise, select the target cell (grow selection)
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

  // If no cell is focused, start at the first cell
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

const moveGridItem = (direction) => {
  const cells = state.getCells();
  if (cells.length === 0 || state.focusedCellIndex < 0) return;

  // Determine which cells to move: selection if active, otherwise just the focused cell
  const selectedIndices = state.selectedCells.size > 0
    ? [...state.selectedCells].sort((a, b) => a - b)
    : [state.focusedCellIndex];

  // Calculate the offset for each direction
  let offset = 0;
  if (direction === "left") offset = -1;
  else if (direction === "right") offset = 1;
  else if (direction === "up") offset = -state.gridCols;
  else if (direction === "down") offset = state.gridCols;

  // Check if any selected cell is at the edge and needs grid expansion
  let needsExpand = false;
  for (const idx of selectedIndices) {
    const targetIdx = idx + offset;
    if (direction === "right" && idx % state.gridCols === state.gridCols - 1) {
      needsExpand = true;
      break;
    }
    if (direction === "left" && idx % state.gridCols === 0) {
      needsExpand = true;
      break;
    }
    if (direction === "down" && targetIdx >= cells.length) {
      needsExpand = true;
      break;
    }
    if (direction === "up" && targetIdx < 0) {
      needsExpand = true;
      break;
    }
  }

  if (needsExpand) {
    // Expand the grid in the appropriate direction, then rebuild and re-run the move
    if (direction === "right") {
      const oldCols = state.gridCols;
      insertColumnAt(state.gridCols);
      // After appending a column, indices shift because grid is row-major with more cols
      const shiftedIndices = selectedIndices.map((idx) => {
        const row = Math.floor(idx / oldCols);
        const col = idx % oldCols;
        return row * state.gridCols + col;
      });
      const newFocusRow = Math.floor(state.focusedCellIndex / oldCols);
      const newFocusCol = state.focusedCellIndex % oldCols;
      const newFocusIndex = newFocusRow * state.gridCols + newFocusCol;

      clearSelection();
      for (const idx of shiftedIndices) {
        addCellToSelection(idx);
      }
      setFocusedCell(newFocusIndex);
      moveGridItem(direction);
      return;
    } else if (direction === "left") {
      const oldCols = state.gridCols;
      insertColumnAt(0);
      // After inserting a column at 0, all indices shift right by 1 per row.
      // state.gridCols is now oldCols + 1
      const shiftedIndices = selectedIndices.map((idx) => {
        const row = Math.floor(idx / oldCols);
        const col = idx % oldCols;
        return row * state.gridCols + (col + 1);
      });
      const newFocusRow = Math.floor(state.focusedCellIndex / oldCols);
      const newFocusCol = state.focusedCellIndex % oldCols;
      const newFocusIndex = newFocusRow * state.gridCols + (newFocusCol + 1);

      // Update selection and focus to shifted positions
      clearSelection();
      for (const idx of shiftedIndices) {
        addCellToSelection(idx);
      }
      setFocusedCell(newFocusIndex);
      // Now the cells are at the correct positions; re-run the move
      moveGridItem(direction);
      return;
    } else if (direction === "down") {
      insertRowAt(state.gridRows);
      // Indices don't change when appending rows at the bottom
      clearSelection();
      for (const idx of selectedIndices) {
        addCellToSelection(idx);
      }
      setFocusedCell(state.focusedCellIndex);
      moveGridItem(direction);
      return;
    } else if (direction === "up") {
      insertRowAt(0);
      // After inserting a row at 0, all indices shift down by gridCols.
      const shiftedIndices = selectedIndices.map((idx) => idx + state.gridCols);
      const newFocusIndex = state.focusedCellIndex + state.gridCols;

      // Update selection and focus to shifted positions
      clearSelection();
      for (const idx of shiftedIndices) {
        addCellToSelection(idx);
      }
      setFocusedCell(newFocusIndex);
      // Now the cells are at the correct positions; re-run the move
      moveGridItem(direction);
      return;
    }
  }

  // Normal move (no expansion needed)
  // Check bounds (shouldn't fail after expansion, but safety check)
  for (const idx of selectedIndices) {
    const targetIdx = idx + offset;
    if (targetIdx < 0 || targetIdx >= cells.length) return;
    if (direction === "left" && idx % state.gridCols === 0) return;
    if (direction === "right" && idx % state.gridCols === state.gridCols - 1) return;
  }

  // Compute target indices
  const targetIndices = selectedIndices.map((idx) => idx + offset);

  // Check that targets don't overlap with non-selected cells that are also targets
  // (i.e. all targets are either part of the selection or free to swap into)
  const selectedSet = new Set(selectedIndices);
  const targetSet = new Set(targetIndices);

  // Collect data from selected cells and from target cells that aren't in the selection
  const selectedData = selectedIndices.map((idx) => getCellData(cells[idx]));
  const displacedIndices = targetIndices.filter((idx) => !selectedSet.has(idx));
  const displacedData = displacedIndices.map((idx) => getCellData(cells[idx]));

  // The cells vacated by the selection that aren't being filled by the selection
  const vacatedIndices = selectedIndices.filter((idx) => !targetSet.has(idx));

  // Move selected data to target positions
  // Process in correct order to avoid overwriting: if moving forward, process back-to-front
  if (offset > 0) {
    for (let i = selectedIndices.length - 1; i >= 0; i--) {
      setCellData(cells[targetIndices[i]], selectedData[i]);
    }
  } else {
    for (let i = 0; i < selectedIndices.length; i++) {
      setCellData(cells[targetIndices[i]], selectedData[i]);
    }
  }

  // Place displaced data into vacated positions
  for (let i = 0; i < displacedIndices.length; i++) {
    setCellData(cells[vacatedIndices[i]], displacedData[i]);
  }

  // Update selection to new positions
  clearSelection();
  for (const idx of targetIndices) {
    addCellToSelection(idx);
  }

  // Move focus
  const newFocusIndex = state.focusedCellIndex + offset;
  setFocusedCell(newFocusIndex);

  // Re-scroll after animation settles
  setTimeout(() => {
    const cell = state.getCells()[newFocusIndex];
    if (cell) cell.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, SCROLL_AFTER_MOVE_DELAY_MS);
};

// --- Hotkeys ---
document.addEventListener("keydown", (e) => {
  // Skip hotkeys when typing in an input, textarea, or contenteditable
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;

  // Arrow key navigation for grid cells (works even in drawing mode)
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    const direction = e.key.replace("Arrow", "").toLowerCase(); // "up", "down", "left", "right"
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
    return;
  }

  // Cmd+C: copy selected cells/rows, or copy entire grid if nothing selected
  if (e.key === "c" && e.metaKey && !e.shiftKey) {
    e.preventDefault();
    if (state.selectedCells.size > 0 || state.selectedRows.size > 0 || state.focusedCellIndex >= 0) {
      copySelectedRows();
    } else {
      copyWithScale();
    }
    return;
  }

  // Cmd+B: copy raw image(s) from selected grid cells to clipboard
  if (e.key === "b" && e.metaKey && !e.shiftKey) {
    e.preventDefault();
    if (state.selectedCells.size > 0 || state.selectedRows.size > 0 || state.focusedCellIndex >= 0) {
      copySelectedRawImages();
    }
    return;
  }

  // Enter: focus the label (textarea) of the currently focused cell
  if (e.key === "Enter" && state.focusedCellIndex >= 0) {
    const cells = state.getCells();
    const cell = cells[state.focusedCellIndex];
    if (cell) {
      const textarea = cell.querySelector("textarea");
      if (textarea) {
        textarea.focus();
        e.preventDefault();
      }
    }
    return;
  }

  // Backspace: clear content of selected cells
  if (e.key === "Backspace" && state.selectedCells.size > 0) {
    // Shift+Backspace: delete the row of the focused cell
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
    // Alt+Backspace: delete the column of the focused cell
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
    const cells = state.getCells();
    state.selectedCells.forEach((index) => {
      const cell = cells[index];
      if (!cell) return;
      const img = cell.querySelector("img");
      const drop = cell.querySelector(".drop");
      const span = cell.querySelector("span");
      const textarea = cell.querySelector("textarea");
      if (img) {
        img.src = "";
        img.style.display = "none";
      }
      if (drop) drop.style.border = "var(--border)";
      if (span) span.style.display = "block";
      if (textarea) textarea.value = "";
      if (state.updateFilenameLabel) state.updateFilenameLabel(cell);
    });
    return;
  }

  // Shift+Backspace / Alt+Backspace without selection but with focused cell
  if (e.key === "Backspace" && state.focusedCellIndex >= 0) {
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

  // Skip hotkeys when Shift is used as a drawing modifier (e.g. constraining shapes)
  // Allow Shift+1/2/3 (!, ", #) through for thickness hotkeys
  // Allow Shift+R/E/O through for tool switching hotkeys
  if (e.shiftKey && state.drawingMode && e.key !== "Escape" && !["!", "\"", "#", "R", "E", "O", "A"].includes(e.key)) return;

  switch (e.key) {
    case "Escape":
      // Clear grid cell focus and selection
      clearSelection();
      clearFocusedCell();
      break;
    case "b":
      // Enable pen tool
      penModeBtn.click();
      break;
    case "a":
      // Enable arrow tool
      arrowModeBtn.click();
      break;
    case "l":
      // Enable line tool
      lineModeBtn.click();
      break;
    case "r":
      // Enable solid rectangle tool
      rectModeBtn.click();
      break;
    case "R":
      // Enable bordered rectangle tool
      rectstrokeModeBtn.click();
      break;
    case "e":
      // Enable eraser tool
      eraserModeBtn.click();
      break;
    case "E":
      // Enable object eraser tool
      objectEraserModeBtn.click();
      break;
    case "o":
      // Enable oval tool
      ovalModeBtn.click();
      break;
    case "O":
      // Enable solid oval tool
      ovalfillModeBtn.click();
      break;
    case "t":
      // Enable text tool
      textModeBtn.click();
      break;
    case "d":
      // Enable dot tool
      dotModeBtn.click();
      break;
    case "m":
      // Enable move tool
      moveModeBtn.click();
      break;
    case "?":
      insertRowAt(state.gridRows);
      break;
    case "_":
      // Shift - remove row
      if (state.gridRows > 1) {
        deleteRowAt(state.gridRows - 1);
      }
      break;
    case "+":
      // + add column
      insertColumnAt(state.gridCols);
      e.preventDefault();
      break;
    case "-":
      // - remove column
      if (state.gridCols > 1) {
        deleteColumnAt(state.gridCols - 1);
      }
      e.preventDefault();
      break;
    case "[":
      // Zoom out
      applyGridZoom(state.gridZoom - ZOOM_STEP);
      e.preventDefault();
      break;
    case "]":
      // Zoom in
      applyGridZoom(state.gridZoom + ZOOM_STEP);
      e.preventDefault();
      break;
    case "s": {
      // Move selected image(s) back to staging area
      const cells = state.getCells();
      const indices = state.selectedCells.size > 0
        ? [...state.selectedCells]
        : (state.focusedCellIndex >= 0 ? [state.focusedCellIndex] : []);
      let moved = false;
      for (const idx of indices) {
        const cell = cells[idx];
        if (!cell) continue;
        const img = cell.querySelector("img");
        if (!img || !img.src || img.style.display === "none") continue;
        // Add back to staging
        state.addImageToToolbar(img.src, img.alt || "");
        // Clear the cell
        img.src = "";
        img.style.display = "none";
        const drop = cell.querySelector(".drop");
        const span = cell.querySelector("span");
        if (drop) drop.style.border = "var(--border)";
        if (span) span.style.display = "block";
        const textarea = cell.querySelector("textarea");
        if (textarea) textarea.value = "";
        if (state.updateFilenameLabel) state.updateFilenameLabel(cell);
        moved = true;
      }
      break;
    }
    case "h":
      // Toggle staging area visibility
      toggleStagingArea();
      break;
    case "f":
      // Preview all color filters
      previewAllFilters();
      break;
    case "v":
      // Cycle color vision filter (skip if Cmd/Ctrl held — that's paste)
      if (!e.metaKey && !e.ctrlKey) {
        cycleColorFilter();
      }
      break;
    case "C":
      // Copy with all color filters applied
      copyWithAllFilters();
      break;
    case "A":
      // Shift+A: Insert all images from staging area
      document.getElementById("insert-all-btn").click();
      break;
    case "z":
      // Toggle zoom between 100% and 200% (skip if Cmd/Ctrl held — that's undo)
      if (!e.metaKey && !e.ctrlKey) {
        applyGridZoom(state.gridZoom === ZOOM_TOGGLE_HIGH ? ZOOM_TOGGLE_LOW : ZOOM_TOGGLE_HIGH);
      }
      break;
    case "x": {
      // Cycle through preset colors
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
      break;
    }
    case "!": {
      // Shift+1: Thin line thickness
      const thicknessBtns = document.querySelectorAll(".thickness-presets .thickness-btn");
      if (thicknessBtns[0]) thicknessBtns[0].click();
      break;
    }
    case "\"": {
      // Shift+2: Medium line thickness
      const thicknessBtns = document.querySelectorAll(".thickness-presets .thickness-btn");
      if (thicknessBtns[1]) thicknessBtns[1].click();
      break;
    }
    case "#": {
      // Shift+3: Thick line thickness
      const thicknessBtns = document.querySelectorAll(".thickness-presets .thickness-btn");
      if (thicknessBtns[2]) thicknessBtns[2].click();
      break;
    }
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
    case "6":
    case "7":
    case "8":
    case "9": {
      // Select preset color by number key
      const presetBtns = document.querySelectorAll(".toolbar-drawing-controls .preset-color-btn");
      const index = parseInt(e.key, 10) - 1;
      if (index < presetBtns.length) {
        presetBtns[index].click();
      }
      break;
    }
  }
});


import state from './state.js';
import { applyGridZoom } from './zoom.js';
import { buildGrid, toggleFilenames, getAdjacentCell, swapCells } from './grid.js';
import {
  updatePresetColorSelection, penModeBtn, arrowModeBtn, lineModeBtn,
  rectModeBtn, rectstrokeModeBtn, ovalModeBtn, ovalfillModeBtn,
  dotModeBtn, eraserModeBtn, objectEraserModeBtn, moveModeBtn,
  textModeBtn, drawColorInput,
} from './drawing.js';
import { toggleStagingArea } from './toolbar.js';

// --- Keyboard Navigation for Grid Cells ---

const setFocusedCell = (index) => {
  const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
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
};

const clearFocusedCell = () => {
  const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
  if (state.focusedCellIndex >= 0 && state.focusedCellIndex < cells.length) {
    cells[state.focusedCellIndex].classList.remove("keyboard-focused");
  }
  state.focusedCellIndex = -1;
};

const navigateGrid = (direction) => {
  const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
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
  const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
  if (cells.length === 0 || state.focusedCellIndex < 0) return;

  const current = cells[state.focusedCellIndex];
  const target = getAdjacentCell(current, direction);
  if (target) {
    swapCells(current, target);
    // Move focus to the target cell (where our content now lives)
    const targetIndex = cells.indexOf(target);
    setFocusedCell(targetIndex);
    // scrollIntoView in setFocusedCell may misfire during the FLIP animation
    // (the cell has a transform applied). Re-scroll once the animation settles.
    setTimeout(() => {
      const cell = state.gridEl.querySelectorAll(".grid-cell")[targetIndex];
      if (cell) cell.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }, 250);
  }
};

// --- Hotkeys ---
document.addEventListener("keydown", (e) => {
  // Skip hotkeys when typing in an input, textarea, or contenteditable
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;

  // Arrow key navigation for grid cells (works even in drawing mode)
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    const direction = e.key.replace("Arrow", "").toLowerCase(); // "up", "down", "left", "right"
    if (e.shiftKey) {
      // Shift+Arrow: move/swap the focused cell's content
      moveGridItem(direction);
    } else {
      // Arrow: navigate focus between cells
      navigateGrid(direction);
    }
    e.preventDefault();
    return;
  }

  // Enter: focus the label (textarea) of the currently focused cell
  if (e.key === "Enter" && state.focusedCellIndex >= 0) {
    const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
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

  // Skip hotkeys when Shift is used as a drawing modifier (e.g. constraining shapes)
  // Allow Shift+1/2/3 (!, ", #) through for thickness hotkeys
  // Allow Shift+R/E/O through for tool switching hotkeys
  if (e.shiftKey && state.drawingMode && e.key !== "Escape" && !["!", "\"", "#", "R", "E", "O", "A"].includes(e.key)) return;

  const gridColsInput = document.getElementById("grid-cols");
  const gridRowsInput = document.getElementById("grid-rows");

  switch (e.key) {
    case "Escape":
      // Clear grid cell focus
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
      state.gridRows++;
      gridRowsInput.value = state.gridRows;
      buildGrid();
      break;
    case "_":
      // Shift - remove row
      if (state.gridRows > 1) {
        state.gridRows--;
        gridRowsInput.value = state.gridRows;
        buildGrid();
      }
      break;
    case "+":
      // + add column
      state.gridCols++;
      gridColsInput.value = state.gridCols;
      buildGrid();
      e.preventDefault();
      break;
    case "-":
      // - remove column
      if (state.gridCols > 1) {
        state.gridCols--;
        gridColsInput.value = state.gridCols;
        buildGrid();
      }
      e.preventDefault();
      break;
    case "[":
      // Zoom out
      applyGridZoom(state.gridZoom - 10);
      e.preventDefault();
      break;
    case "]":
      // Zoom in
      applyGridZoom(state.gridZoom + 10);
      e.preventDefault();
      break;
    case "h":
      // Toggle staging area visibility
      toggleStagingArea();
      break;
    case "f":
      // Toggle filename labels
      toggleFilenames();
      break;
    case "A":
      // Shift+A: Insert all images from staging area
      document.getElementById("insert-all-btn").click();
      break;
    case "z":
      // Toggle zoom between 100% and 200%
      applyGridZoom(state.gridZoom === 200 ? 100 : 200);
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
      const index = parseInt(e.key) - 1;
      if (index < presetBtns.length) {
        presetBtns[index].click();
      }
      break;
    }
  }
});


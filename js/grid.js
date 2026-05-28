import state from './state.js';
import { initDrawingCanvas, redrawCanvas, getObjectFitRect } from './drawing.js';
import { attachDragTo, updateCopySelectedBtn } from './copy-export.js';
import { applyGridZoom } from './zoom.js';

// --- Mouse drag-to-move for selected cells ---

let cellDragState = null; // { startIndex, startX, startY, active }

const getCellIndexAtPoint = (x, y) => {
  const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
  // Direct hit test
  for (let i = 0; i < cells.length; i++) {
    const rect = cells[i].getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return i;
    }
  }
  // If cursor is within the grid but in a gap, find the nearest cell
  const gridRect = state.gridEl.getBoundingClientRect();
  if (x >= gridRect.left && x <= gridRect.right && y >= gridRect.top && y <= gridRect.bottom) {
    let closestIndex = -1;
    let closestDist = Infinity;
    for (let i = 0; i < cells.length; i++) {
      const rect = cells[i].getBoundingClientRect();
      const cx = (rect.left + rect.right) / 2;
      const cy = (rect.top + rect.bottom) / 2;
      const dist = (x - cx) ** 2 + (y - cy) ** 2;
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    }
    return closestIndex;
  }
  return -1;
};

const clearCellDropTarget = () => {
  state.gridEl.querySelectorAll(".grid-cell.cell-drop-target").forEach((cell) => {
    cell.classList.remove("cell-drop-target");
  });
};

const showCellDropTargets = (targetIndices) => {
  clearCellDropTarget();
  const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
  for (const idx of targetIndices) {
    if (idx >= 0 && idx < cells.length) {
      cells[idx].classList.add("cell-drop-target");
    }
  }
};

const computeMoveTargets = (selectedIndices, fromIndex, toIndex) => {
  if (fromIndex === toIndex) return null;

  const offset = toIndex - fromIndex;

  const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
  const totalCells = cells.length;

  // Check that ALL selected cells can move with this offset
  for (const idx of selectedIndices) {
    const targetIdx = idx + offset;
    if (targetIdx < 0 || targetIdx >= totalCells) return null;
  }

  return selectedIndices.map((idx) => idx + offset);
};

const performCellMove = (selectedIndices, targetIndices) => {
  const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
  const offset = targetIndices[0] - selectedIndices[0];

  const selectedSet = new Set(selectedIndices);
  const targetSet = new Set(targetIndices);

  // Collect data from selected cells and displaced cells
  const selectedData = selectedIndices.map((idx) => getCellData(cells[idx]));
  const displacedIndices = targetIndices.filter((idx) => !selectedSet.has(idx));
  const displacedData = displacedIndices.map((idx) => getCellData(cells[idx]));

  // Cells vacated by the selection that aren't being filled by the selection
  const vacatedIndices = selectedIndices.filter((idx) => !targetSet.has(idx));

  // Move selected data to target positions
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

  const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
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
  const threshold = 40; // px beyond edge to trigger expansion

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
  const now = Date.now();
  if (now - lastEdgeExpansionTime < EDGE_EXPANSION_COOLDOWN) return false;
  lastEdgeExpansionTime = now;

  const selectedIndices = [...state.selectedCells].sort((a, b) => a - b);

  if (direction === "right") {
    // Only expand if any selected cell is in the last column
    const atRightEdge = selectedIndices.some((idx) => idx % state.gridCols === state.gridCols - 1);
    if (!atRightEdge) return false;
    const oldCols = state.gridCols;
    insertColumnAt(state.gridCols);
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
    insertColumnAt(0);
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
    insertRowAt(state.gridRows);
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
    insertRowAt(0);
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

  // Check if cursor is beyond grid edges — auto-expand
  const edgeDir = getEdgeExpansionDirection(e.clientX, e.clientY);
  if (edgeDir) {
    expandGridForDrag(edgeDir);
  }

  const targetIndex = getCellIndexAtPoint(e.clientX, e.clientY);
  if (targetIndex === -1) {
    clearCellDropTarget();
    return;
  }

  const selectedIndices = [...state.selectedCells].sort((a, b) => a - b);
  const targets = computeMoveTargets(selectedIndices, cellDragState.startIndex, targetIndex);

  if (targets) {
    showCellDropTargets(targets);
  } else {
    clearCellDropTarget();
  }
};

const handleCellDragEnd = (e) => {
  if (!cellDragState) return;

  const wasDragActive = cellDragState.active;

  if (cellDragState.active) {
    const targetIndex = getCellIndexAtPoint(e.clientX, e.clientY);
    if (targetIndex !== -1 && targetIndex !== cellDragState.startIndex) {
      const selectedIndices = [...state.selectedCells].sort((a, b) => a - b);
      const targets = computeMoveTargets(selectedIndices, cellDragState.startIndex, targetIndex);
      if (targets) {
        performCellMove(selectedIndices, targets);
      }
    }
    clearCellDropTarget();
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

// --- Click-based cell selection ---

const setFocusedCellByIndex = (index) => {
  const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
  if (state.focusedCellIndex >= 0 && state.focusedCellIndex < cells.length) {
    cells[state.focusedCellIndex].classList.remove("keyboard-focused");
  }
  state.focusedCellIndex = index;
  if (index >= 0 && index < cells.length) {
    cells[index].classList.add("keyboard-focused");
  }
};

const clearCellSelection = () => {
  state.gridEl.querySelectorAll(".grid-cell.keyboard-selected").forEach((cell) => {
    cell.classList.remove("keyboard-selected");
  });
  state.selectedCells.clear();
  updateCopySelectedBtn();
};

const addCellToSelectionByIndex = (index) => {
  const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
  if (index >= 0 && index < cells.length) {
    state.selectedCells.add(index);
    cells[index].classList.add("keyboard-selected");
    updateCopySelectedBtn();
  }
};

const removeCellFromSelectionByIndex = (index) => {
  const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
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

  const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
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
      const targetRow = parseInt(cell.dataset.row);
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
      const targetRow = parseInt(cell.dataset.row);
      if (sourceRow !== targetRow) {
        swapRows(sourceRow, targetRow);
      }
      state.rowDragState = null;
      clearRowHighlights();
      clearRowDropTarget();
      return;
    }

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = function () {
        img.style.display = "flex";
        img.src = this.result;
        img.alt = droppedFile.name;
        span.style.display = "none";
        updateFilenameLabel(cell);
      };
      reader.readAsDataURL(droppedFile);
      return;
    }

    const src = e.dataTransfer.getData("text/plain");
    if (src) {
      // Check if dragged from toolbar — insert from toolbar
      const source = e.dataTransfer.getData("source");
      const draggedId = e.dataTransfer.getData("id");
      if (source === "toolbar" && draggedId) {
        const draggedFilename = e.dataTransfer.getData("filename") || "";
        img.style.display = "flex";
        img.src = src;
        img.alt = draggedFilename;
        span.style.display = "none";
        state.removeToolbarItemById(draggedId);
        updateFilenameLabel(cell);
        return;
      }

      // Dragged from another grid cell — swap the two cells
      if (draggedId) {
        const srcImg = document.getElementById(draggedId);
        if (srcImg && srcImg !== img) {
          const srcCell = srcImg.closest(".grid-cell");
          if (srcCell && srcCell !== cell) {
            swapCells(cell, srcCell);
            return;
          }
        }
      }

      // Fallback: just set the image (e.g. external drop)
      img.style.display = "flex";
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
    const targetRow = parseInt(cell.dataset.row);
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
    const targetRow = parseInt(cell.dataset.row);
    if (sourceRow !== targetRow) {
      swapRows(sourceRow, targetRow);
    }
    state.rowDragState = null;
    clearRowHighlights();
    clearRowDropTarget();
  });
};

// --- Swap Grid Items ---
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
    img.style.display = "flex";
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

const swapCells = (cellA, cellB) => {
  if (!cellA || !cellB || cellA === cellB) return;

  // FLIP animation: record initial positions
  const rectA = cellA.getBoundingClientRect();
  const rectB = cellB.getBoundingClientRect();

  // Swap data
  const dataA = getCellData(cellA);
  const dataB = getCellData(cellB);
  setCellData(cellA, dataB);
  setCellData(cellB, dataA);

  // FLIP: content that was in A is now in B, content that was in B is now in A.
  // To make it look like the content slid over, offset each cell to where its
  // new content originally was, then animate back to identity.
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
  setTimeout(cleanup, 250);
};

const getAdjacentCell = (cell, direction) => {
  const cells = [...state.gridEl.querySelectorAll(".grid-cell")];
  const index = cells.indexOf(cell);
  if (index === -1) return null;

  if (direction === "left" && index > 0) return cells[index - 1];
  if (direction === "right" && index < cells.length - 1) return cells[index + 1];
  if (direction === "up" && index - state.gridCols >= 0) return cells[index - state.gridCols];
  if (direction === "down" && index + state.gridCols < cells.length) return cells[index + state.gridCols];
  return null;
};

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

const buildGrid = () => {
  // Clear keyboard focus
  state.focusedCellIndex = -1;

  // Save existing cell data
  const existingData = [];
  const existingCells = state.gridEl.querySelectorAll(".grid-cell");
  existingCells.forEach((cell) => {
    const img = cell.querySelector("img");
    const textarea = cell.querySelector("textarea");
    const canvas = cell.querySelector(".drawing-canvas");
    const drawingPaths = canvas && state.canvasDataMap.get(canvas) ? state.canvasDataMap.get(canvas).paths : [];
    existingData.push({
      row: parseInt(cell.dataset.row),
      col: parseInt(cell.dataset.col),
      imgSrc: img && img.src && img.style.display !== "none" ? img.src : null,
      imgAlt: img ? img.alt : "",
      text: textarea ? textarea.value : "",
      drawingPaths: drawingPaths,
    });
  });

  state.gridEl.innerHTML = "";
  state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${Math.round(350 * state.gridZoom / 100)}px, 1fr))`;
  state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;

  for (let r = 0; r < state.gridRows; r++) {
    for (let c = 0; c < state.gridCols; c++) {
      const cell = createCell(r, c);
      state.gridEl.appendChild(cell);

      // Restore data if it existed at this position
      const existing = existingData.find((d) => d.row === r && d.col === c);
      if (existing) {
        const img = cell.querySelector("img");
        const drop = cell.querySelector(".drop");
        const span = cell.querySelector("span");
        const textarea = cell.querySelector("textarea");

        if (existing.imgSrc) {
          img.src = existing.imgSrc;
          img.alt = existing.imgAlt;
          img.style.display = "flex";
          drop.style.border = "unset";
          span.style.display = "none";
        }
        if (existing.text) {
          textarea.value = existing.text;
        }
        updateFilenameLabel(cell);
        // Restore drawing paths
        if (existing.drawingPaths && existing.drawingPaths.length > 0) {
          const canvas = cell.querySelector(".drawing-canvas");
          if (canvas) {
            const data = state.canvasDataMap.get(canvas);
            if (data) {
              data.paths = existing.drawingPaths;
              const dpr = window.devicePixelRatio || 1;
              redrawCanvas(canvas, dpr);
            }
          }
        }
      }
    }
  }

  // Build row controls (drag handles + add-row buttons)
  buildRowControls();
};

// --- Row Reordering & Insertion ---

state.rowDragState = null; // { sourceRow, placeholder }

const buildRowControls = () => {
  // Remove existing row controls
  const existingControls = document.querySelector(".row-controls");
  if (existingControls) existingControls.remove();

  const controlsContainer = document.createElement("div");
  controlsContainer.className = "row-controls";

  // Build a grid with interleaved rows:
  // [add-btn-row] [handle-row] [add-btn-row] [handle-row] ... [add-btn-row]
  // The handle rows use 1fr to match the main grid's row sizing.
  // The add-btn rows are auto-sized (small).
  // The gap between handle rows must equal var(--gap) minus the space taken by the add-btn row.
  // Simpler: no gap, use the template to control spacing.
  const rowTemplate = [];
  for (let r = 0; r < state.gridRows; r++) {
    rowTemplate.push("auto"); // add-btn slot
    rowTemplate.push("1fr"); // handle slot
  }
  rowTemplate.push("auto"); // final add-btn slot
  controlsContainer.style.gridTemplateRows = rowTemplate.join(" ");
  controlsContainer.style.gap = "0";

  // We need the handle rows to have the same gap between them as the main grid.
  // The main grid uses `gap: var(--gap)`. In our layout, between two handle rows
  // there's an add-btn row. We use row-gap on the handles via margins or we set
  // the add-btn row height to match the gap.
  // Actually, the cleanest approach: set the auto rows to have a fixed height
  // equal to the gap, so the spacing between 1fr rows matches the main grid.

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
    handle.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="4" cy="3" r="1.2" fill="currentColor"/><circle cx="8" cy="3" r="1.2" fill="currentColor"/><circle cx="4" cy="6" r="1.2" fill="currentColor"/><circle cx="8" cy="6" r="1.2" fill="currentColor"/><circle cx="4" cy="9" r="1.2" fill="currentColor"/><circle cx="8" cy="9" r="1.2" fill="currentColor"/></svg>`;

    handle.addEventListener("dragstart", (e) => {
      const row = parseInt(handle.dataset.row);
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
    deleteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12"><line x1="3" y1="3" x2="9" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="9" y1="3" x2="3" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteRowAt(parseInt(deleteBtn.dataset.row));
    });

    // Row selection checkbox
    const selectCb = document.createElement("input");
    selectCb.type = "checkbox";
    selectCb.className = "row-select-cb";
    selectCb.dataset.row = r;
    selectCb.title = `Select row ${r + 1} for export`;
    selectCb.checked = state.selectedRows.has(r);
    selectCb.addEventListener("change", (e) => {
      const rowIdx = parseInt(selectCb.dataset.row);
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
      const targetRow = parseInt(handle.dataset.row);
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
      const targetRow = parseInt(handle.dataset.row);
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

const createAddRowButton = (insertIndex) => {
  const btn = document.createElement("button");
  btn.className = "add-row-btn";
  btn.dataset.insertIndex = insertIndex;
  btn.title = `Add row here`;
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12"><line x1="6" y1="2" x2="6" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

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
    const targetIndex = parseInt(btn.dataset.insertIndex);
    moveRow(sourceRow, targetIndex);
    state.rowDragState = null;
  });

  return btn;
};

const insertRowAt = (insertIndex) => {
  // Collect all existing cell data
  const allData = collectGridData();

  // Shift rows at and after insertIndex down by 1
  const newData = allData.map((d) => ({
    ...d,
    row: d.row >= insertIndex ? d.row + 1 : d.row,
  }));

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

  // Rebuild grid with shifted data
  state.gridEl.innerHTML = "";
  state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${Math.round(350 * state.gridZoom / 100)}px, 1fr))`;
  state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;

  for (let r = 0; r < state.gridRows; r++) {
    for (let c = 0; c < state.gridCols; c++) {
      const cell = createCell(r, c);
      state.gridEl.appendChild(cell);

      const existing = newData.find((d) => d.row === r && d.col === c);
      if (existing) {
        restoreCellData(cell, existing);
      }
    }
  }

  buildRowControls();
};

const insertColumnAt = (insertIndex) => {
  // Collect all existing cell data
  const allData = collectGridData();

  // Shift columns at and after insertIndex right by 1
  const newData = allData.map((d) => ({
    ...d,
    col: d.col >= insertIndex ? d.col + 1 : d.col,
  }));

  state.gridCols++;
  document.getElementById("grid-cols").value = state.gridCols;

  // Rebuild grid with shifted data
  state.gridEl.innerHTML = "";
  state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${Math.round(350 * state.gridZoom / 100)}px, 1fr))`;
  state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;

  for (let r = 0; r < state.gridRows; r++) {
    for (let c = 0; c < state.gridCols; c++) {
      const cell = createCell(r, c);
      state.gridEl.appendChild(cell);

      const existing = newData.find((d) => d.row === r && d.col === c);
      if (existing) {
        restoreCellData(cell, existing);
      }
    }
  }

  buildRowControls();
};

const deleteRowAt = (rowIndex) => {
  if (state.gridRows <= 1) return; // Don't delete the last row

  const allData = collectGridData();

  // Remove data for the deleted row and shift rows above it down
  const newData = allData
    .filter((d) => d.row !== rowIndex)
    .map((d) => ({
      ...d,
      row: d.row > rowIndex ? d.row - 1 : d.row,
    }));

  // Update state.selectedRows — remove deleted row and shift indices
  const newSelected = new Set();
  state.selectedRows.forEach((r) => {
    if (r < rowIndex) newSelected.add(r);
    else if (r > rowIndex) newSelected.add(r - 1);
    // r === rowIndex is removed
  });
  state.selectedRows.clear();
  newSelected.forEach((r) => state.selectedRows.add(r));
  updateCopySelectedBtn();

  state.gridRows--;
  document.getElementById("grid-rows").value = state.gridRows;

  // Rebuild grid
  state.gridEl.innerHTML = "";
  state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${Math.round(350 * state.gridZoom / 100)}px, 1fr))`;
  state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;

  for (let r = 0; r < state.gridRows; r++) {
    for (let c = 0; c < state.gridCols; c++) {
      const cell = createCell(r, c);
      state.gridEl.appendChild(cell);

      const existing = newData.find((d) => d.row === r && d.col === c);
      if (existing) {
        restoreCellData(cell, existing);
      }
    }
  }

  buildRowControls();
};

const moveRow = (sourceRow, targetIndex) => {
  // If dropping in the same position or adjacent (no-op)
  if (targetIndex === sourceRow || targetIndex === sourceRow + 1) return;

  const allData = collectGridData();

  // Track whether the source row was selected
  const sourceWasSelected = state.selectedRows.has(sourceRow);

  // Extract source row data
  const sourceData = allData.filter((d) => d.row === sourceRow);
  const otherData = allData.filter((d) => d.row !== sourceRow);

  // Calculate new row indices
  // After removing source row, rows shift up if they were below it
  const reindexed = otherData.map((d) => ({
    ...d,
    row: d.row > sourceRow ? d.row - 1 : d.row,
  }));

  // Determine the effective insert position after removal
  const effectiveTarget = targetIndex > sourceRow ? targetIndex - 1 : targetIndex;

  // Shift rows at and after effectiveTarget down to make room
  const shifted = reindexed.map((d) => ({
    ...d,
    row: d.row >= effectiveTarget ? d.row + 1 : d.row,
  }));

  // Place source row at effectiveTarget
  const movedData = sourceData.map((d) => ({
    ...d,
    row: effectiveTarget,
  }));

  const finalData = [...shifted, ...movedData];

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

  // Rebuild grid
  state.gridEl.innerHTML = "";
  state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${Math.round(350 * state.gridZoom / 100)}px, 1fr))`;
  state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;

  for (let r = 0; r < state.gridRows; r++) {
    for (let c = 0; c < state.gridCols; c++) {
      const cell = createCell(r, c);
      state.gridEl.appendChild(cell);

      const existing = finalData.find((d) => d.row === r && d.col === c);
      if (existing) {
        restoreCellData(cell, existing);
      }
    }
  }

  buildRowControls();
};

const swapRows = (rowA, rowB) => {
  if (rowA === rowB) return;

  const allData = collectGridData();

  // Swap row indices
  const newData = allData.map((d) => {
    if (d.row === rowA) return { ...d, row: rowB };
    if (d.row === rowB) return { ...d, row: rowA };
    return d;
  });

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

  // Rebuild grid
  state.gridEl.innerHTML = "";
  state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${Math.round(350 * state.gridZoom / 100)}px, 1fr))`;
  state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;

  for (let r = 0; r < state.gridRows; r++) {
    for (let c = 0; c < state.gridCols; c++) {
      const cell = createCell(r, c);
      state.gridEl.appendChild(cell);

      const existing = newData.find((d) => d.row === r && d.col === c);
      if (existing) {
        restoreCellData(cell, existing);
      }
    }
  }

  buildRowControls();
};

const collectGridData = () => {
  const data = [];
  state.gridEl.querySelectorAll(".grid-cell").forEach((cell) => {
    const img = cell.querySelector("img");
    const textarea = cell.querySelector("textarea");
    const canvas = cell.querySelector(".drawing-canvas");
    const drawingPaths = canvas && state.canvasDataMap.get(canvas) ? state.canvasDataMap.get(canvas).paths : [];
    data.push({
      row: parseInt(cell.dataset.row),
      col: parseInt(cell.dataset.col),
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
    img.style.display = "flex";
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

const highlightRow = (row, active) => {
  state.gridEl.querySelectorAll(".grid-cell").forEach((cell) => {
    if (parseInt(cell.dataset.row) === row) {
      cell.classList.toggle("row-dragging", active);
    }
  });
};

const clearRowHighlights = () => {
  state.gridEl.querySelectorAll(".grid-cell.row-dragging").forEach((cell) => {
    cell.classList.remove("row-dragging");
  });
};

const clearRowDropIndicators = () => {
  document.querySelectorAll(".add-row-btn.drop-target").forEach((btn) => {
    btn.classList.remove("drop-target");
  });
};

const setRowDropTarget = (row) => {
  // Clear previous target
  state.gridEl.querySelectorAll(".grid-cell.row-drop-target").forEach((cell) => {
    cell.classList.remove("row-drop-target");
  });
  // Highlight all cells in the target row
  state.gridEl.querySelectorAll(".grid-cell").forEach((cell) => {
    if (parseInt(cell.dataset.row) === row) {
      cell.classList.add("row-drop-target");
    }
  });
};

const clearRowDropTarget = () => {
  state.gridEl.querySelectorAll(".grid-cell.row-drop-target").forEach((cell) => {
    cell.classList.remove("row-drop-target");
  });
};

const relayoutGrid = () => {
  // Collect all cells that have content (image, text, or drawings)
  const allData = collectGridData();
  const filledCells = allData.filter(
    (d) => d.imgSrc || d.text || (d.drawingPaths && d.drawingPaths.length > 0)
  );

  // Nothing to relayout
  if (filledCells.length === 0) return;

  // Reassign positions sequentially in row-major order
  const reindexed = filledCells.map((d, i) => ({
    ...d,
    row: Math.floor(i / state.gridCols),
    col: i % state.gridCols,
  }));

  // Remove empty trailing rows by calculating the actual rows needed
  const neededRows = Math.max(1, Math.ceil(filledCells.length / state.gridCols));
  state.gridRows = neededRows;
  document.getElementById("grid-rows").value = state.gridRows;

  // Clear selections since positions changed
  state.selectedRows.clear();
  updateCopySelectedBtn();
  state.focusedCellIndex = -1;

  // Rebuild grid with compacted data
  state.gridEl.innerHTML = "";
  state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${Math.round(350 * state.gridZoom / 100)}px, 1fr))`;
  state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;

  for (let r = 0; r < state.gridRows; r++) {
    for (let c = 0; c < state.gridCols; c++) {
      const cell = createCell(r, c);
      state.gridEl.appendChild(cell);

      const existing = reindexed.find((d) => d.row === r && d.col === c);
      if (existing) {
        restoreCellData(cell, existing);
      }
    }
  }

  buildRowControls();
};

// Wire up relayout button
document.getElementById("relayout-btn").addEventListener("click", relayoutGrid);

const updateGrid = () => {
  state.gridCols = parseInt(document.getElementById("grid-cols").value) || 3;
  state.gridRows = parseInt(document.getElementById("grid-rows").value) || 1;
  state.selectedRows.clear();
  updateCopySelectedBtn();
  buildGrid();
};

// Wire up grid size inputs (replacing inline onchange handlers)
document.getElementById("grid-cols").addEventListener("change", updateGrid);
document.getElementById("grid-rows").addEventListener("change", updateGrid);

// Register updateFilenameLabel on state so copy-export can use it without circular deps
state.updateFilenameLabel = updateFilenameLabel;

const deleteColumnAt = (colIndex) => {
  if (state.gridCols <= 1) return; // Don't delete the last column

  const allData = collectGridData();

  // Remove data for the deleted column and shift columns after it left
  const newData = allData
    .filter((d) => d.col !== colIndex)
    .map((d) => ({
      ...d,
      col: d.col > colIndex ? d.col - 1 : d.col,
    }));

  state.gridCols--;
  document.getElementById("grid-cols").value = state.gridCols;

  // Rebuild grid
  state.gridEl.innerHTML = "";
  state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${Math.round(350 * state.gridZoom / 100)}px, 1fr))`;
  state.gridEl.style.gridTemplateRows = `repeat(${state.gridRows}, 1fr)`;

  for (let r = 0; r < state.gridRows; r++) {
    for (let c = 0; c < state.gridCols; c++) {
      const cell = createCell(r, c);
      state.gridEl.appendChild(cell);

      const existing = newData.find((d) => d.row === r && d.col === c);
      if (existing) {
        restoreCellData(cell, existing);
      }
    }
  }

  buildRowControls();
};

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

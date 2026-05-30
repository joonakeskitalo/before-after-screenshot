import state from './state.js';

// --- UI helpers extracted from copy-export.js to break circular dependency ---
// grid.js and keyboard.js need these functions, but they don't depend on export logic.

/**
 * Updates the copy button label to reflect the current selection state.
 */
const updateCopySelectedBtn = () => {
  const btn = document.getElementById("copy-btn");
  if (!btn) return;
  if (state.selectedRows.size > 0) {
    btn.textContent = `Copy (${state.selectedRows.size} rows)`;
  } else if (state.selectedCells.size > 0) {
    btn.textContent = `Copy (${state.selectedCells.size} cells)`;
  } else if (state.focusedCellIndex >= 0) {
    btn.textContent = `Copy (1 cell)`;
  } else {
    btn.textContent = "Copy";
  }
};

/**
 * Makes an image element draggable for cell-to-cell drag-and-drop.
 */
const attachDragTo = (img) => {
  if (!img) return;
  img.draggable = true;
  img.addEventListener("dragstart", (e) => {
    if (!img.id) {
      img.id = `drop-img-${Math.random().toString(36).slice(2)}`;
    }

    const cell = e.target.closest(".grid-cell");
    const textArea = cell ? cell.querySelector("textarea") : null;

    const canvas = cell ? cell.querySelector(".drawing-canvas") : null;
    const drawingData = canvas && state.canvasDataMap.get(canvas) ? state.canvasDataMap.get(canvas).paths : [];

    e.dataTransfer.setData("text/plain", img.src);
    e.dataTransfer.setData("id", img.id);
    e.dataTransfer.setData("note", textArea ? textArea.value : "");
    e.dataTransfer.setData("drawings", JSON.stringify(drawingData));
    e.dataTransfer.effectAllowed = "move";
  });
};

export { updateCopySelectedBtn, attachDragTo };

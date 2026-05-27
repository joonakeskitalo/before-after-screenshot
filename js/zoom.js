import state from './state.js';
import { updateDrawingCursor } from './drawing.js';

// --- Grid Zoom ---

const gridZoomInput = document.getElementById("grid-zoom");
const gridZoomLabel = document.getElementById("grid-zoom-label");

const applyGridZoom = (zoom) => {
  state.gridZoom = Math.max(20, Math.min(300, zoom));
  gridZoomInput.value = state.gridZoom;
  gridZoomLabel.textContent = state.gridZoom + "%";

  const scale = state.gridZoom / 100;
  // Scale the grid column min-width, cell min-height, image max-height, and gap
  const minColWidth = Math.round(350 * scale);
  const minCellHeight = Math.round(300 * scale);
  const imageMaxHeight = Math.round(60 * scale);
  const gap = Math.round(48 * scale);

  state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${minColWidth}px, 1fr))`;
  state.root.style.setProperty("--grid-zoom-cell-height", `${minCellHeight}px`);
  state.root.style.setProperty("--image-max-width", `${imageMaxHeight}dvh`);
  state.root.style.setProperty("--gap", `${gap}px`);

  // Scale font size for cell textareas
  const fontSize = Math.round(15 * scale);
  state.root.style.setProperty("--text-fontsize", `${fontSize}pt`);

  // Update drawing cursor to reflect new zoom
  updateDrawingCursor();
};

gridZoomInput.addEventListener("input", (e) => {
  applyGridZoom(parseInt(e.target.value));
});

gridZoomInput.addEventListener("change", () => {
  gridZoomInput.blur();
});

const setColors = (e) => {
  const [background, text] = e.value.split(";");
  state.root.style.setProperty("--background-color", background);

  if (text) {
    state.root.style.setProperty("--text-color", text);
  } else {
    state.root.style.setProperty("--text-color", "#000000");
  }
};

// Wire up background color select (replacing inline onchange handler)
document.getElementById("bg-color-select").addEventListener("change", (e) => {
  setColors(e.target);
});

export { applyGridZoom, setColors };

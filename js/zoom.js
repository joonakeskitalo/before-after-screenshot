import state from './state.js';
import { updateDrawingCursor } from './drawing.js';
import {
  ZOOM_MIN, ZOOM_MAX,
  GRID_MIN_COL_WIDTH, GRID_MIN_CELL_HEIGHT, GRID_IMAGE_MAX_HEIGHT, GRID_GAP, GRID_BASE_FONT_SIZE,
} from './constants.js';

// --- Grid Zoom ---

const gridZoomInput = document.getElementById("grid-zoom");
const gridZoomLabel = document.getElementById("grid-zoom-label");

const applyGridZoom = (zoom) => {
  state.gridZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
  gridZoomInput.value = state.gridZoom;
  gridZoomLabel.textContent = state.gridZoom + "%";

  const scale = state.gridZoom / 100;
  // Scale the grid column min-width, cell min-height, image max-height, and gap
  const minColWidth = Math.round(GRID_MIN_COL_WIDTH * scale);
  const minCellHeight = Math.round(GRID_MIN_CELL_HEIGHT * scale);
  const imageMaxHeight = Math.round(GRID_IMAGE_MAX_HEIGHT * scale);
  const gap = Math.round(GRID_GAP * scale);

  state.gridEl.style.gridTemplateColumns = `repeat(${state.gridCols}, minmax(${minColWidth}px, 1fr))`;
  state.root.style.setProperty("--grid-zoom-cell-height", `${minCellHeight}px`);
  state.root.style.setProperty("--image-max-width", `${imageMaxHeight}dvh`);
  state.root.style.setProperty("--gap", `${gap}px`);

  // Scale font size for cell textareas
  const fontSize = Math.round(GRID_BASE_FONT_SIZE * scale);
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

import {
  DRAW_DEFAULT_FONT_SIZE, DRAW_DEFAULT_LINE_WIDTH, ZOOM_DEFAULT,
} from './constants.js';

// Shared mutable application state.
// All modules import this object and read/write properties directly.
const state = {
  root: document.documentElement,
  cardsEl: document.getElementById("cards"),
  gridEl: document.getElementById("grid"),
  content: document.querySelector(".content"),

  gridCols: 3,
  gridRows: 1,
  selectedRows: new Set(),
  selectedCells: new Set(),
  showFilenames: false,
  focusedCellIndex: -1,

  // Drawing
  drawingMode: false,
  drawColor: "#ff0000",
  drawLineWidth: DRAW_DEFAULT_LINE_WIDTH,
  drawTool: "freehand",
  drawFontSize: DRAW_DEFAULT_FONT_SIZE,

  // Zoom
  gridZoom: ZOOM_DEFAULT,

  // Color filter for accessibility checking
  colorFilter: "none",

  // Canvas data stores
  canvasDataMap: new WeakMap(),
  canvasObservers: new WeakMap(),

  // Row drag
  rowDragState: null,

  // Forward references (set by toolbar module)
  removeToolbarItemById: () => {},
  addImageToToolbar: () => {},

  // Callback invoked when focusedCellIndex changes (used by filter preview)
  onFocusedCellChange: null,

  // Cached array of grid cell elements — invalidated on grid rebuild
  _cellsCache: null,
};

// Returns a cached array of .grid-cell elements. Invalidated by grid rebuilds.
state.getCells = () => {
  if (!state._cellsCache) {
    state._cellsCache = [...state.gridEl.querySelectorAll(".grid-cell")];
  }
  return state._cellsCache;
};

// Call this whenever the grid DOM is rebuilt to invalidate the cache.
state.invalidateCellsCache = () => {
  state._cellsCache = null;
};

state.elementsToAdjustWidth = [state.cardsEl, state.content];

export default state;

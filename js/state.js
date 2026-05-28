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
  drawLineWidth: 2,
  drawTool: "freehand",
  drawFontSize: 13,

  // Zoom
  gridZoom: 100,

  // Canvas data stores
  canvasDataMap: new WeakMap(),
  canvasObservers: new WeakMap(),

  // Row drag
  rowDragState: null,

  // Forward references (set by toolbar module)
  removeToolbarItemById: () => {},
  addImageToToolbar: () => {},
};

state.elementsToAdjustWidth = [state.cardsEl, state.content];

export default state;

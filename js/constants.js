// Named constants replacing magic numbers throughout the codebase.
// Grouped by domain for discoverability.

// --- Grid Layout ---
export const GRID_MIN_COL_WIDTH = 350;        // px – base minimum column width before zoom scaling
export const GRID_MIN_CELL_HEIGHT = 300;      // px – base minimum cell height before zoom scaling
export const GRID_IMAGE_MAX_HEIGHT = 60;      // dvh – base image max-height before zoom scaling
export const GRID_GAP = 48;                   // px – base gap between grid cells before zoom scaling
export const GRID_BASE_FONT_SIZE = 15;        // pt – base font size for cell textareas

// --- Zoom ---
export const ZOOM_MIN = 20;                   // % – minimum allowed zoom level
export const ZOOM_MAX = 300;                  // % – maximum allowed zoom level
export const ZOOM_DEFAULT = 100;              // % – default zoom level
export const ZOOM_STEP = 10;                  // % – zoom increment/decrement per keyboard shortcut
export const ZOOM_TOGGLE_LOW = 100;           // % – low end of zoom toggle (z key)
export const ZOOM_TOGGLE_HIGH = 200;          // % – high end of zoom toggle (z key)

// --- Export ---
export const EXPORT_GAP = 96;                 // px – gap used during standard export
export const EXPORT_GAP_FULLSIZE = 192;       // px – gap used during full-size export
export const EXPORT_PADDING_STANDARD = 64;    // px – padding for standard export
export const EXPORT_PADDING_FULLSIZE = 192;   // px – padding for full-size export
export const EXPORT_COLLAPSED_DROP_SIZE = 32; // px – width/height of collapsed empty drops during export
export const EXPORT_BASE_FONT_SIZE = 15;      // pt – base font size for export text
export const EXPORT_FONT_SCALE_FACTOR = 3;    // multiplier for full-size export font scaling
export const OUTPUT_SCALE_RENDER_MULTIPLIER = 2; // render at 2x for output-scale exports
export const OUTPUT_SCALE_GAP_BASE = 48;      // px – base gap for output-scale exports
export const OUTPUT_SCALE_FONT_BASE = 16;     // pt – base font size for output-scale exports
export const OUTPUT_SCALE_FILENAME_FONT = 8;  // pt – base filename label font size for output-scale
export const OUTPUT_SCALE_PADDING = 32;       // px – base padding for output-scale exports
export const GRID_SIZE_EXPORT_PADDING = 32;   // px – padding for copy-as-grid-size export
export const COMPOSITE_IMAGE_GAP = 32;        // px – gap between images in side-by-side composite

// --- Toolbar ---
export const TOOLBAR_MIN_HEIGHT = 40;         // px – minimum height when resizing bottom toolbar
export const TOOLBAR_COMPACT_THRESHOLD = 100; // px – height below which toolbar gets compact class
export const TOOLBAR_PADDING_OFFSET = 24;     // px – padding subtracted from toolbar height for inner content
export const TOOLBAR_BODY_PADDING = 32;       // px – extra padding added to body/cards below toolbar

// --- Drawing ---
export const DRAW_DEFAULT_FONT_SIZE = 13;     // px – default font size for drawing text
export const DRAW_DEFAULT_LINE_WIDTH = 2;     // px – default stroke width
export const DRAW_HIT_TEST_THRESHOLD = 0.02;  // normalized – distance threshold for hit-testing paths
export const DRAW_TEXT_HIT_DIVISOR = 500;     // divisor to convert font size to normalized coordinates
export const DRAW_TEXT_LINE_HEIGHT = 1.3;     // multiplier – line height relative to font size
export const DRAW_TEXT_BG_PADDING = 4;        // px (before scaling) – padding around text background
export const DRAW_TEXT_BG_OPACITY = 0.05;     // opacity of text background fill
export const DRAW_TEXT_RADIUS_FACTOR = 0.2;   // multiplier – border radius relative to font size
export const DRAW_TEXT_WIDTH_FACTOR = 0.6;    // multiplier – estimated char width relative to font size
export const DRAW_ARROWHEAD_MIN_LENGTH = 10;  // px – minimum arrowhead length
export const DRAW_ARROWHEAD_SCALE = 4;        // multiplier – arrowhead length relative to line width
export const DRAW_DOT_RADIUS_EXTRA = 4;       // px – extra radius added to dot beyond line width
export const DRAW_DOT_OPACITY = 0.7;          // opacity for dot markers
export const DRAW_ERASER_EXTRA_WIDTH = 8;     // px – extra width added to eraser stroke
export const DRAW_MIN_DRAG_DISTANCE = 0.005;  // normalized – minimum drag to commit a shape

// --- Tool Names ---
export const TOOL_NAMES = Object.freeze({
  FREEHAND: "freehand",
  ARROW: "arrow",
  LINE: "line",
  RECT: "rect",
  RECTSTROKE: "rectstroke",
  OVAL: "oval",
  OVALFILL: "ovalfill",
  DOT: "dot",
  ERASER: "eraser",
  OBJECT_ERASER: "object-eraser",
  TEXT: "text",
  MOVE: "move",
});

// --- Grid Interaction ---
export const EDGE_EXPANSION_THRESHOLD = 40;   // px – distance beyond grid edge to trigger expansion
export const EDGE_EXPANSION_MAX_COLS = 10;    // maximum columns allowed via drag expansion
export const EDGE_EXPANSION_MAX_ROWS = 10;    // maximum rows allowed via drag expansion
export const SWAP_ANIMATION_FALLBACK_MS = 250; // ms – fallback timeout if transitionend doesn't fire
export const SCROLL_AFTER_MOVE_DELAY_MS = 250; // ms – delay before scrolling after cell move

import state from './state.js';
import { redrawCanvas } from './drawing-render.js';
import { TOOL_NAMES } from './constants.js';

// --- Drawing Tool State & Toolbar Wiring ---

// Generate a cursor that previews the current line width
export const updateDrawingCursor = () => {
  if (!state.drawingMode) return;
  // Don't override cursor for text or eraser tools
  if (state.drawTool === TOOL_NAMES.TEXT || state.drawTool === TOOL_NAMES.ERASER || state.drawTool === TOOL_NAMES.OBJECT_ERASER || state.drawTool === TOOL_NAMES.MOVE) return;

  const zoomScale = state.gridZoom / 100;
  const radius = state.drawTool === TOOL_NAMES.DOT
    ? (state.drawLineWidth + 4) * zoomScale
    : (state.drawLineWidth / 2) * zoomScale;
  const size = Math.max(Math.ceil(radius * 2 + 2), 8);
  const half = size / 2;
  const encodedColor = encodeURIComponent(state.drawColor);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><circle cx='${half}' cy='${half}' r='${radius}' fill='${encodedColor}'/><circle cx='${half}' cy='${half}' r='${half - 0.5}' fill='none' stroke='%23666' stroke-width='0.5'/></svg>`;
  const cursor = `url("data:image/svg+xml,${svg}") ${half} ${half}, crosshair`;
  document.body.style.setProperty("--drawing-cursor", cursor);
};

export const enableDrawingMode = () => {
  state.drawingMode = true;
  document.body.classList.add("drawing-mode");
  if (state.drawTool === TOOL_NAMES.TEXT) document.body.classList.add("text-tool");
  document.querySelectorAll(".drawing-canvas").forEach((c) => c.classList.add("active"));
  updateDrawingCursor();
};

export const disableDrawingMode = () => {
  state.drawingMode = false;
  document.body.classList.remove("drawing-mode");
  document.body.classList.remove("text-tool");
  document.body.classList.remove("eraser-tool");
  document.body.classList.remove("move-tool");
  document.querySelectorAll(".drawing-canvas").forEach((c) => c.classList.remove("active"));
  document.body.style.removeProperty("--drawing-cursor");
};

// Get tool button references
export const penModeBtn = document.getElementById("pen-mode-btn");
export const arrowModeBtn = document.getElementById("arrow-mode-btn");
export const lineModeBtn = document.getElementById("line-mode-btn");
export const rectModeBtn = document.getElementById("rect-mode-btn");
export const rectstrokeModeBtn = document.getElementById("rectstroke-mode-btn");
export const ovalModeBtn = document.getElementById("oval-mode-btn");
export const ovalfillModeBtn = document.getElementById("ovalfill-mode-btn");
export const dotModeBtn = document.getElementById("dot-mode-btn");
export const eraserModeBtn = document.getElementById("eraser-mode-btn");
export const objectEraserModeBtn = document.getElementById("object-eraser-mode-btn");
export const moveModeBtn = document.getElementById("move-mode-btn");
export const textModeBtn = document.getElementById("text-mode-btn");
export const drawFontSizeInput = document.getElementById("draw-font-size");
export const drawColorInput = document.getElementById("draw-color");

// All tool buttons for easy iteration
export const allToolButtons = [
  penModeBtn, arrowModeBtn, lineModeBtn, rectModeBtn, rectstrokeModeBtn,
  ovalModeBtn, ovalfillModeBtn, dotModeBtn, eraserModeBtn, objectEraserModeBtn,
  moveModeBtn, textModeBtn,
];

// Body classes that tools may add
const toolBodyClasses = ["text-tool", "eraser-tool", "move-tool"];

// Map of tool names to their corresponding body class (if any)
const toolBodyClassMap = {
  [TOOL_NAMES.ERASER]: "eraser-tool",
  [TOOL_NAMES.OBJECT_ERASER]: "eraser-tool",
  [TOOL_NAMES.MOVE]: "move-tool",
};

/**
 * Activate a drawing tool, deactivating all others.
 * If the tool is already active, it toggles off (disables drawing mode).
 */
const setActiveTool = (toolName, buttonEl) => {
  // Toggle off if already active
  if (state.drawTool === toolName && state.drawingMode) {
    disableDrawingMode();
    buttonEl.classList.remove("active");
    const bodyClass = toolBodyClassMap[toolName];
    if (bodyClass) document.body.classList.remove(bodyClass);
    return;
  }

  // Set the new tool
  state.drawTool = toolName;

  // Update button active states
  allToolButtons.forEach((btn) => btn.classList.remove("active"));
  buttonEl.classList.add("active");

  // Remove all tool body classes, then add the one for this tool (if any)
  toolBodyClasses.forEach((cls) => document.body.classList.remove(cls));
  const bodyClass = toolBodyClassMap[toolName];
  if (bodyClass) document.body.classList.add(bodyClass);

  enableDrawingMode();
};

// Determine if a hex color is "dark" (luminance < 0.4)
export const isColorDark = (hex) => {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 0.4;
};

export const updatePresetColorSelection = () => {
  document.querySelectorAll(".toolbar-drawing-controls .preset-color-btn").forEach((b) => {
    if (b.dataset.color === state.drawColor) {
      if (isColorDark(b.dataset.color)) {
        b.style.boxShadow = "0 0 0 2px #9d9d9dc3";
      } else {
        b.style.boxShadow = "0 0 0 2px #00000069";
      }
    } else {
      b.style.boxShadow = "none";
      b.style.borderColor = "#3333333a";
    }
  });
};

// --- Event Listeners & Toolbar Wiring ---

// Exit drawing mode with Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.drawingMode) {
    disableDrawingMode();
    allToolButtons.forEach((btn) => btn.classList.remove("active"));
  }
});

// Track the last-interacted drawing canvas for undo/redo targeting
export let lastActiveDrawingCanvas = null;
export const setLastActiveDrawingCanvas = (canvas) => { lastActiveDrawingCanvas = canvas; };

// Undo/Redo keyboard handler (Cmd+Z / Cmd+Shift+Z)
document.addEventListener("keydown", (e) => {
  if (!state.drawingMode) return;
  if (e.key === "z" && (e.metaKey || e.ctrlKey)) {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;

    e.preventDefault();
    if (!lastActiveDrawingCanvas) return;
    const data = state.canvasDataMap.get(lastActiveDrawingCanvas);
    if (!data) return;

    if (e.shiftKey) {
      // Redo
      if (data.redoStack.length === 0) return;
      data.paths.push(data.redoStack.pop());
    } else {
      // Undo
      if (data.paths.length === 0) return;
      data.redoStack.push(data.paths.pop());
    }
    const dpr = window.devicePixelRatio || 1;
    redrawCanvas(lastActiveDrawingCanvas, dpr);
  }
});

// Wire up toolbar drawing controls
drawColorInput.addEventListener("input", (e) => {
  state.drawColor = e.target.value;
  updatePresetColorSelection();
  updateDrawingCursor();
});

document.querySelectorAll(".thickness-presets .thickness-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    state.drawLineWidth = parseInt(btn.dataset.width, 10);
    document.querySelectorAll(".thickness-presets .thickness-btn").forEach((b) => {
      b.classList.remove("active");
    });
    btn.classList.add("active");
    updateDrawingCursor();
  });
});

document.querySelectorAll(".toolbar-drawing-controls .preset-color-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    state.drawColor = btn.dataset.color;
    drawColorInput.value = state.drawColor;
    updatePresetColorSelection();
    updateDrawingCursor();
  });
});

// Apply initial selection state
updatePresetColorSelection();

// Tool mode toggles
penModeBtn.addEventListener("click", (e) => { e.stopPropagation(); setActiveTool(TOOL_NAMES.FREEHAND, penModeBtn); });
arrowModeBtn.addEventListener("click", (e) => { e.stopPropagation(); setActiveTool(TOOL_NAMES.ARROW, arrowModeBtn); });
lineModeBtn.addEventListener("click", (e) => { e.stopPropagation(); setActiveTool(TOOL_NAMES.LINE, lineModeBtn); });
rectModeBtn.addEventListener("click", (e) => { e.stopPropagation(); setActiveTool(TOOL_NAMES.RECT, rectModeBtn); });
rectstrokeModeBtn.addEventListener("click", (e) => { e.stopPropagation(); setActiveTool(TOOL_NAMES.RECTSTROKE, rectstrokeModeBtn); });
ovalModeBtn.addEventListener("click", (e) => { e.stopPropagation(); setActiveTool(TOOL_NAMES.OVAL, ovalModeBtn); });
ovalfillModeBtn.addEventListener("click", (e) => { e.stopPropagation(); setActiveTool(TOOL_NAMES.OVALFILL, ovalfillModeBtn); });
dotModeBtn.addEventListener("click", (e) => { e.stopPropagation(); setActiveTool(TOOL_NAMES.DOT, dotModeBtn); });
eraserModeBtn.addEventListener("click", (e) => { e.stopPropagation(); setActiveTool(TOOL_NAMES.ERASER, eraserModeBtn); });
objectEraserModeBtn.addEventListener("click", (e) => { e.stopPropagation(); setActiveTool(TOOL_NAMES.OBJECT_ERASER, objectEraserModeBtn); });
moveModeBtn.addEventListener("click", (e) => { e.stopPropagation(); setActiveTool(TOOL_NAMES.MOVE, moveModeBtn); });
textModeBtn.addEventListener("click", (e) => { e.stopPropagation(); setActiveTool(TOOL_NAMES.TEXT, textModeBtn); });

drawFontSizeInput.addEventListener("input", (e) => {
  state.drawFontSize = parseInt(e.target.value, 10) || 13;
});

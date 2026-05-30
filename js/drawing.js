// Barrel module — re-exports from the split drawing modules for backward compatibility.
// The actual logic lives in:
//   drawing-render.js  — rendering, coordinate math, canvas redraw
//   drawing-tools.js   — cursor, tool state, toolbar wiring, event listeners
//   drawing-canvas.js  — canvas init, mouse handlers, hit testing, text input
//   drawing-export.js  — export preparation & restoration

export { getObjectFitRect, getCanvasContentMetrics, renderPaths, redrawCanvas, drawArrow } from './drawing-render.js';
export { updateDrawingCursor, enableDrawingMode, disableDrawingMode, isColorDark, updatePresetColorSelection, penModeBtn, arrowModeBtn, lineModeBtn, rectModeBtn, rectstrokeModeBtn, ovalModeBtn, ovalfillModeBtn, dotModeBtn, eraserModeBtn, objectEraserModeBtn, moveModeBtn, textModeBtn, drawFontSizeInput, drawColorInput } from './drawing-tools.js';
export { hitTestPath, distToSegment, offsetPath, showTextInput, initDrawingCanvas } from './drawing-canvas.js';
export { redrawAllCanvasesForExport, restoreAllCanvases } from './drawing-export.js';

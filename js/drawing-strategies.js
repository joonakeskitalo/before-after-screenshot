import state from './state.js';
import { renderPaths, renderPath, redrawCanvas } from './drawing-render.js';
import { hitTestPath, offsetPath } from './drawing-hit-test.js';
import { DRAW_ERASER_EXTRA_WIDTH, DRAW_MIN_DRAG_DISTANCE } from './constants.js';

// --- Tool Strategy Interface ---
// Each strategy implements:
//   onMouseDown(ctx)  → called on mousedown, return false to skip setting isDrawing=true
//   onMouseMove(ctx)  → called on mousemove while drawing
//   onMouseUp(ctx)    → called on mouseup to commit/finalize

// Shared helper: apply shift-constraint to a point relative to an origin
export const shiftConstrain = (x, y, origin, tool, cachedImg, cachedFitRect, cachedCanvasRect) => {
  if (!origin) return { x, y };
  const isShape = tool === 'rect' || tool === 'rectstroke' || tool === 'oval' || tool === 'ovalfill';
  if (isShape) {
    let contentWidth, contentHeight;
    if (cachedImg && cachedFitRect) {
      contentWidth = cachedFitRect.width;
      contentHeight = cachedFitRect.height;
    } else {
      contentWidth = cachedCanvasRect.width;
      contentHeight = cachedCanvasRect.height;
    }
    const dxPx = (x - origin.x) * contentWidth;
    const dyPx = (y - origin.y) * contentHeight;
    const maxSidePx = Math.max(Math.abs(dxPx), Math.abs(dyPx));
    return {
      x: origin.x + (maxSidePx * Math.sign(dxPx || 1)) / contentWidth,
      y: origin.y + (maxSidePx * Math.sign(dyPx || 1)) / contentHeight,
    };
  }
  // Line/arrow: constrain to horizontal or vertical
  const dx = Math.abs(x - origin.x);
  const dy = Math.abs(y - origin.y);
  if (dx >= dy) {
    return { x, y: origin.y };
  }
  return { x: origin.x, y };
};

// --- Text Tool ---
export const textStrategy = {
  onMouseDown({ drop, canvas, normX, normY, clientX, clientY, showTextInput }) {
    showTextInput(drop, canvas, normX, normY, clientX, clientY);
    return false; // no drag tracking needed
  },
  onMouseMove() {},
  onMouseUp() {},
};

// --- Dot Tool ---
export const dotStrategy = {
  onMouseDown({ canvas, normX, normY, commitPath }) {
    commitPath({
      type: 'dot',
      color: state.drawColor,
      lineWidth: state.drawLineWidth,
      position: { x: normX, y: normY },
    });
    const dpr = window.devicePixelRatio || 1;
    redrawCanvas(canvas, dpr);
    return false;
  },
  onMouseMove() {},
  onMouseUp() {},
};

// --- Object Eraser Tool ---
export const objectEraserStrategy = {
  onMouseDown({ canvas, normX, normY }) {
    const data = state.canvasDataMap.get(canvas);
    if (data && data.paths.length > 0) {
      for (let i = data.paths.length - 1; i >= 0; i--) {
        if (hitTestPath(data.paths[i], normX, normY)) {
          data.paths.splice(i, 1);
          data.redoStack.length = 0;
          const dpr = window.devicePixelRatio || 1;
          redrawCanvas(canvas, dpr);
          break;
        }
      }
    }
    return false;
  },
  onMouseMove() {},
  onMouseUp() {},
};

// --- Move Tool ---
export const moveStrategy = {
  _movingPath: null,
  _moveStartX: 0,
  _moveStartY: 0,

  onMouseDown({ canvas, normX, normY, getContentMetrics, clearPreview, previewCanvas }) {
    const data = state.canvasDataMap.get(canvas);
    if (!data || data.paths.length === 0) return false;

    for (let i = data.paths.length - 1; i >= 0; i--) {
      if (hitTestPath(data.paths[i], normX, normY)) {
        this._movingPath = data.paths[i];
        this._moveStartX = normX;
        this._moveStartY = normY;

        const dpr = window.devicePixelRatio || 1;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const { toCanvasX, toCanvasY } = getContentMetrics(dpr);
        const zoomScale = state.gridZoom / 100;
        const staticPaths = data.paths.filter((p) => p !== this._movingPath);
        renderPaths(ctx, staticPaths, toCanvasX, toCanvasY, zoomScale * dpr);

        clearPreview();
        const pCtx = previewCanvas.getContext('2d');
        renderPaths(pCtx, [this._movingPath], toCanvasX, toCanvasY, zoomScale * dpr);
        return true;
      }
    }
    return false;
  },

  onMouseMove({ normX, normY, clearPreview, previewCanvas, getContentMetrics, schedulePreviewRAF }) {
    if (!this._movingPath) return;
    const dx = normX - this._moveStartX;
    const dy = normY - this._moveStartY;
    offsetPath(this._movingPath, dx, dy);
    this._moveStartX = normX;
    this._moveStartY = normY;

    schedulePreviewRAF(() => {
      const dpr = window.devicePixelRatio || 1;
      clearPreview();
      const ctx = previewCanvas.getContext('2d');
      const { toCanvasX, toCanvasY } = getContentMetrics(dpr);
      const zoomScale = state.gridZoom / 100;
      renderPaths(ctx, [this._movingPath], toCanvasX, toCanvasY, zoomScale * dpr);
    });
  },

  onMouseUp({ canvas, clearPreview, clearCachedRects }) {
    this._movingPath = null;
    this._moveStartX = 0;
    this._moveStartY = 0;
    clearPreview();
    const dpr = window.devicePixelRatio || 1;
    redrawCanvas(canvas, dpr);
    clearCachedRects();
  },
};

// --- Shape Tool (arrow, line, rect, rectstroke, oval, ovalfill) ---
export const shapeStrategy = {
  _start: null,

  onMouseDown({ normX, normY }) {
    this._start = { x: normX, y: normY };
    return true;
  },

  onMouseMove({ normX, normY, shiftKey, clearPreview, previewCanvas, getContentMetrics, schedulePreviewRAF, cachedImg, cachedFitRect, cachedCanvasRect }) {
    if (!this._start) return;
    let x = normX, y = normY;
    if (shiftKey) {
      ({ x, y } = shiftConstrain(x, y, this._start, state.drawTool, cachedImg, cachedFitRect, cachedCanvasRect));
    }

    const previewTo = { x, y };
    schedulePreviewRAF(() => {
      const dpr = window.devicePixelRatio || 1;
      clearPreview();
      const ctx = previewCanvas.getContext('2d');
      const { toCanvasX, toCanvasY } = getContentMetrics(dpr);
      const zoomScale = state.gridZoom / 100;
      const previewPath = {
        type: state.drawTool,
        color: state.drawColor,
        lineWidth: state.drawLineWidth,
        from: this._start,
        to: previewTo,
      };
      ctx.strokeStyle = previewPath.color;
      ctx.lineWidth = previewPath.lineWidth * zoomScale * dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      renderPath(ctx, previewPath, toCanvasX, toCanvasY, zoomScale * dpr);
    });
  },

  onMouseUp({ clientX, clientY, shiftKey, clientToNormalized, commitPath, canvas, clearPreview, clearCachedRects, cachedImg, cachedFitRect, cachedCanvasRect }) {
    clearPreview();
    if (!this._start) { clearCachedRects(); return; }

    let { x, y } = clientToNormalized(clientX, clientY);
    if (shiftKey) {
      ({ x, y } = shiftConstrain(x, y, this._start, state.drawTool, cachedImg, cachedFitRect, cachedCanvasRect));
    }

    const dx = x - this._start.x;
    const dy = y - this._start.y;
    if (Math.sqrt(dx * dx + dy * dy) > DRAW_MIN_DRAG_DISTANCE) {
      commitPath({
        type: state.drawTool,
        color: state.drawColor,
        lineWidth: state.drawLineWidth,
        from: this._start,
        to: { x, y },
      });
    }
    this._start = null;
    const dpr = window.devicePixelRatio || 1;
    redrawCanvas(canvas, dpr);
    clearCachedRects();
  },
};

// --- Freehand / Eraser Tool ---
export const freehandStrategy = {
  _currentPath: null,

  onMouseDown({ normX, normY }) {
    this._currentPath = {
      type: state.drawTool === 'eraser' ? 'eraser' : 'freehand',
      color: state.drawColor,
      lineWidth: state.drawLineWidth,
      points: [{ x: normX, y: normY }],
    };
    return true;
  },

  onMouseMove({ normX, normY, shiftKey, canvas, getContentMetrics }) {
    if (!this._currentPath) return;
    let x = normX, y = normY;
    if (shiftKey) {
      const origin = this._currentPath.points[0];
      const dx = Math.abs(x - origin.x);
      const dy = Math.abs(y - origin.y);
      if (dx >= dy) { y = origin.y; } else { x = origin.x; }
    }

    this._currentPath.points.push({ x, y });

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const points = this._currentPath.points;
    if (points.length >= 2) {
      const from = points[points.length - 2];
      const to = points[points.length - 1];
      const { toCanvasX, toCanvasY } = getContentMetrics(dpr);

      if (this._currentPath.type === 'eraser') {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = (this._currentPath.lineWidth + DRAW_ERASER_EXTRA_WIDTH) * (state.gridZoom / 100) * dpr;
      } else {
        ctx.strokeStyle = this._currentPath.color;
        ctx.lineWidth = this._currentPath.lineWidth * (state.gridZoom / 100) * dpr;
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(toCanvasX(from.x), toCanvasY(from.y));
      ctx.lineTo(toCanvasX(to.x), toCanvasY(to.y));
      ctx.stroke();
      if (this._currentPath.type === 'eraser') {
        ctx.restore();
      }
    }
  },

  onMouseUp({ commitPath, clearCachedRects }) {
    if (this._currentPath && this._currentPath.points.length > 1) {
      commitPath(this._currentPath);
    }
    this._currentPath = null;
    clearCachedRects();
  },
};

// --- Strategy Resolver ---
const SHAPE_TOOLS = new Set(['arrow', 'line', 'rect', 'rectstroke', 'oval', 'ovalfill']);

export const getToolStrategy = (tool) => {
  if (tool === 'text') return textStrategy;
  if (tool === 'dot') return dotStrategy;
  if (tool === 'object-eraser') return objectEraserStrategy;
  if (tool === 'move') return moveStrategy;
  if (SHAPE_TOOLS.has(tool)) return shapeStrategy;
  // freehand and eraser
  return freehandStrategy;
};

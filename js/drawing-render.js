import state from './state.js';
import {
  DRAW_DEFAULT_FONT_SIZE, DRAW_TEXT_LINE_HEIGHT, DRAW_TEXT_BG_PADDING,
  DRAW_TEXT_BG_OPACITY, DRAW_TEXT_RADIUS_FACTOR,
  DRAW_ARROWHEAD_MIN_LENGTH, DRAW_ARROWHEAD_SCALE,
  DRAW_DOT_RADIUS_EXTRA, DRAW_DOT_OPACITY, DRAW_ERASER_EXTRA_WIDTH,
  TOOL_NAMES,
} from './constants.js';

// --- Rendering Logic ---

// Calculate the rendered content area of an img with object-fit: contain
// Returns { x, y, width, height } in CSS pixels relative to the img element's box
export const getObjectFitRect = (img) => {
  const elemWidth = img.clientWidth;
  const elemHeight = img.clientHeight;
  const natWidth = img.naturalWidth;
  const natHeight = img.naturalHeight;

  if (!natWidth || !natHeight || !elemWidth || !elemHeight) {
    return null;
  }

  const elemRatio = elemWidth / elemHeight;
  const natRatio = natWidth / natHeight;

  if (!isFinite(elemRatio) || !isFinite(natRatio)) {
    return null;
  }

  let renderWidth, renderHeight;
  if (natRatio > elemRatio) {
    // Image is wider than container — width fills, height is letterboxed
    renderWidth = elemWidth;
    renderHeight = elemWidth / natRatio;
  } else {
    // Image is taller than container — height fills, width is pillarboxed
    renderHeight = elemHeight;
    renderWidth = elemHeight * natRatio;
  }

  const x = (elemWidth - renderWidth) / 2;
  const y = (elemHeight - renderHeight) / 2;

  return { x, y, width: renderWidth, height: renderHeight };
};

// Compute the content offset, size, and coordinate mapping functions for a canvas.
// This is the single source of truth for the "get image rect → get fitRect → compute
// normalized coordinates" pattern used by redrawCanvas, mousemove, and shape previews.
export const getCanvasContentMetrics = (canvas, dpr, { img: cachedImg, imgRect: cachedImgRect, canvasRect: cachedCanvasRect, fitRect: cachedFitRect } = {}) => {
  if (canvas.width === 0 || canvas.height === 0) {
    const noop = () => 0;
    return { contentOffsetX: 0, contentOffsetY: 0, contentWidth: 0, contentHeight: 0, toCanvasX: noop, toCanvasY: noop };
  }
  let contentOffsetX = 0, contentOffsetY = 0, contentWidth = canvas.width / dpr, contentHeight = canvas.height / dpr;

  let img = cachedImg;
  let fitRect = cachedFitRect;
  let imgRect = cachedImgRect;
  let canvasRect = cachedCanvasRect;

  if (!img) {
    const drop = canvas.parentElement;
    img = drop ? drop.querySelector("img") : null;
  }
  if (img && img.src && img.style.display !== "none" && img.naturalWidth) {
    if (!fitRect) fitRect = getObjectFitRect(img);
    if (fitRect) {
      if (!imgRect) imgRect = img.getBoundingClientRect();
      if (!canvasRect) canvasRect = canvas.getBoundingClientRect();
      contentOffsetX = (imgRect.left - canvasRect.left) + fitRect.x;
      contentOffsetY = (imgRect.top - canvasRect.top) + fitRect.y;
      contentWidth = fitRect.width;
      contentHeight = fitRect.height;
    }
  }

  const toCanvasX = (ix) => (contentOffsetX + ix * contentWidth) * dpr;
  const toCanvasY = (iy) => (contentOffsetY + iy * contentHeight) * dpr;

  return { contentOffsetX, contentOffsetY, contentWidth, contentHeight, toCanvasX, toCanvasY };
};

// Draw an arrow from (x1,y1) to (x2,y2) with an arrowhead
export const drawArrow = (ctx, x1, y1, x2, y2, lineWidth) => {
  const headLength = Math.max(DRAW_ARROWHEAD_MIN_LENGTH, lineWidth * DRAW_ARROWHEAD_SCALE);
  const angle = Math.atan2(y2 - y1, x2 - x1);

  // Draw the line
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Draw the arrowhead
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle - Math.PI / 6),
    y2 - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle + Math.PI / 6),
    y2 - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
};

// Render a single drawing path onto a canvas context.
// Assumes strokeStyle, lineWidth, lineCap, lineJoin are already set on ctx.
export const renderPath = (ctx, path, toX, toY, scale) => {
  if (path.type === TOOL_NAMES.TEXT) {
    const fontSize = (path.fontSize || DRAW_DEFAULT_FONT_SIZE) * scale;
    const lineHeight = fontSize * DRAW_TEXT_LINE_HEIGHT;
    ctx.font = `500 ${fontSize}px "Inter", system-ui, sans-serif`;
    ctx.textBaseline = "top";
    const x = toX(path.position.x);
    const y = toY(path.position.y);
    const lines = path.text.split("\n");
    const maxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const totalHeight = fontSize + (lines.length - 1) * lineHeight;
    const padding = DRAW_TEXT_BG_PADDING * scale;
    ctx.fillStyle = `rgba(0, 0, 0, ${DRAW_TEXT_BG_OPACITY})`;
    const radius = fontSize * DRAW_TEXT_RADIUS_FACTOR;
    ctx.beginPath();
    ctx.roundRect(x - padding, y - padding, maxWidth + padding * 2, totalHeight + padding * 2, radius);
    ctx.fill();
    ctx.fillStyle = path.color;
    lines.forEach((line, i) => {
      ctx.fillText(line, x, y + i * lineHeight);
    });
  } else if (path.type === TOOL_NAMES.ARROW) {
    const fromX = toX(path.from.x);
    const fromY = toY(path.from.y);
    const tX = toX(path.to.x);
    const tY = toY(path.to.y);
    drawArrow(ctx, fromX, fromY, tX, tY, path.lineWidth * scale);
  } else if (path.type === TOOL_NAMES.LINE) {
    const fromX = toX(path.from.x);
    const fromY = toY(path.from.y);
    const tX = toX(path.to.x);
    const tY = toY(path.to.y);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(tX, tY);
    ctx.stroke();
  } else if (path.type === TOOL_NAMES.RECT) {
    const x = toX(Math.min(path.from.x, path.to.x));
    const y = toY(Math.min(path.from.y, path.to.y));
    const w = toX(Math.max(path.from.x, path.to.x)) - x;
    const h = toY(Math.max(path.from.y, path.to.y)) - y;
    ctx.fillStyle = path.color;
    ctx.fillRect(x, y, w, h);
  } else if (path.type === TOOL_NAMES.RECTSTROKE) {
    const x = toX(Math.min(path.from.x, path.to.x));
    const y = toY(Math.min(path.from.y, path.to.y));
    const w = toX(Math.max(path.from.x, path.to.x)) - x;
    const h = toY(Math.max(path.from.y, path.to.y)) - y;
    ctx.strokeRect(x, y, w, h);
  } else if (path.type === TOOL_NAMES.OVAL) {
    const x = toX(Math.min(path.from.x, path.to.x));
    const y = toY(Math.min(path.from.y, path.to.y));
    const w = toX(Math.max(path.from.x, path.to.x)) - x;
    const h = toY(Math.max(path.from.y, path.to.y)) - y;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (path.type === TOOL_NAMES.OVALFILL) {
    const x = toX(Math.min(path.from.x, path.to.x));
    const y = toY(Math.min(path.from.y, path.to.y));
    const w = toX(Math.max(path.from.x, path.to.x)) - x;
    const h = toY(Math.max(path.from.y, path.to.y)) - y;
    ctx.fillStyle = path.color;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (path.type === TOOL_NAMES.DOT) {
    const cx = toX(path.position.x);
    const cy = toY(path.position.y);
    const radius = (path.lineWidth + DRAW_DOT_RADIUS_EXTRA) * scale;
    ctx.globalAlpha = DRAW_DOT_OPACITY;
    ctx.fillStyle = path.color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  } else if (path.type === TOOL_NAMES.ERASER) {
    if (path.points.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = (path.lineWidth + DRAW_ERASER_EXTRA_WIDTH) * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(toX(path.points[0].x), toY(path.points[0].y));
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(toX(path.points[i].x), toY(path.points[i].y));
    }
    ctx.stroke();
    ctx.restore();
  } else if (path.type === TOOL_NAMES.FREEHAND) {
    if (path.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(toX(path.points[0].x), toY(path.points[0].y));
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(toX(path.points[i].x), toY(path.points[i].y));
    }
    ctx.stroke();
  }
};

// Render a list of drawing paths onto a canvas context.
// toX/toY map normalized (0-1) coordinates to canvas pixel coordinates.
// scale is the multiplier for line widths and font sizes (e.g. zoomScale * dpr).
// Paths are rendered in insertion order. Consecutive same-style paths share canvas
// state to minimize redundant state changes without reordering.
export const renderPaths = (ctx, paths, toX, toY, scale) => {
  if (!paths.length) return;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let currentColor = null;
  let currentLineWidth = null;

  for (const path of paths) {
    // Erasers manage their own state via save/restore inside renderPath
    if (path.type !== TOOL_NAMES.ERASER) {
      if (path.color !== currentColor || path.lineWidth !== currentLineWidth) {
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.lineWidth * scale;
        currentColor = path.color;
        currentLineWidth = path.lineWidth;
      }
    }
    renderPath(ctx, path, toX, toY, scale);
    // After an eraser, canvas state was restored — reset tracked values so the
    // next non-eraser path re-applies its style.
    if (path.type === TOOL_NAMES.ERASER) {
      currentColor = null;
      currentLineWidth = null;
    }
  }
};

// Redraw all stored paths on a canvas at current size.
// Coordinates are relative to the visible image content (0-1), so we map them
// to canvas space accounting for object-fit positioning.
export const redrawCanvas = (canvas, dpr) => {
  if (canvas.width === 0 || canvas.height === 0) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const data = state.canvasDataMap.get(canvas);
  if (!data) return;

  const zoomScale = state.gridZoom / 100;

  const { toCanvasX, toCanvasY } = getCanvasContentMetrics(canvas, dpr);
  renderPaths(ctx, data.paths, toCanvasX, toCanvasY, zoomScale * dpr);
};

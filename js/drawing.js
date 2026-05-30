import state from './state.js';

// --- Drawing Logic ---






// Generate a cursor that previews the current line width
const updateDrawingCursor = () => {
  if (!state.drawingMode) return;
  // Don't override cursor for text or eraser tools
  if (state.drawTool === "text" || state.drawTool === "eraser" || state.drawTool === "object-eraser" || state.drawTool === "move") return;

  const zoomScale = state.gridZoom / 100;
  // Match the actual rendered size on screen
  // Dot tool renders at radius = (lineWidth + 4) * zoomScale
  // Other tools render strokes at lineWidth * zoomScale
  const radius = state.drawTool === "dot"
    ? (state.drawLineWidth + 4) * zoomScale
    : (state.drawLineWidth / 2) * zoomScale;
  const size = Math.max(Math.ceil(radius * 2 + 2), 8); // +2 for outer ring, min 8px
  const half = size / 2;
  const encodedColor = encodeURIComponent(state.drawColor);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><circle cx='${half}' cy='${half}' r='${radius}' fill='${encodedColor}'/><circle cx='${half}' cy='${half}' r='${half - 0.5}' fill='none' stroke='%23666' stroke-width='0.5'/></svg>`;
  const cursor = `url("data:image/svg+xml,${svg}") ${half} ${half}, crosshair`;
  document.body.style.setProperty("--drawing-cursor", cursor);
};

const enableDrawingMode = () => {
  state.drawingMode = true;
  document.body.classList.add("drawing-mode");
  if (state.drawTool === "text") document.body.classList.add("text-tool");
  document.querySelectorAll(".drawing-canvas").forEach((c) => c.classList.add("active"));
  updateDrawingCursor();
};

const disableDrawingMode = () => {
  state.drawingMode = false;
  document.body.classList.remove("drawing-mode");
  document.body.classList.remove("text-tool");
  document.body.classList.remove("eraser-tool");
  document.body.classList.remove("move-tool");
  document.querySelectorAll(".drawing-canvas").forEach((c) => c.classList.remove("active"));
  document.body.style.removeProperty("--drawing-cursor");
};

// Get tool button references early so event listeners can use them
const penModeBtn = document.getElementById("pen-mode-btn");
const arrowModeBtn = document.getElementById("arrow-mode-btn");
const lineModeBtn = document.getElementById("line-mode-btn");
const rectModeBtn = document.getElementById("rect-mode-btn");
const rectstrokeModeBtn = document.getElementById("rectstroke-mode-btn");
const ovalModeBtn = document.getElementById("oval-mode-btn");
const ovalfillModeBtn = document.getElementById("ovalfill-mode-btn");
const dotModeBtn = document.getElementById("dot-mode-btn");
const eraserModeBtn = document.getElementById("eraser-mode-btn");
const objectEraserModeBtn = document.getElementById("object-eraser-mode-btn");
const moveModeBtn = document.getElementById("move-mode-btn");
const textModeBtn = document.getElementById("text-mode-btn");
const drawFontSizeInput = document.getElementById("draw-font-size");

// Exit drawing mode with Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.drawingMode) {
    disableDrawingMode();
    // Deactivate all tool buttons
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    objectEraserModeBtn.classList.remove("active");
    moveModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    document.body.classList.remove("text-tool");
  }
});



// Wire up toolbar drawing controls
const drawColorInput = document.getElementById("draw-color");

// Determine if a hex color is "dark" (luminance < 0.4)
const isColorDark = (hex) => {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 0.4;
};

const updatePresetColorSelection = () => {
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

drawColorInput.addEventListener("input", (e) => {
  state.drawColor = e.target.value;
  updatePresetColorSelection();
  updateDrawingCursor();
});

document.querySelectorAll(".thickness-presets .thickness-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    state.drawLineWidth = parseInt(btn.dataset.width);
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

// Pen mode toggle
penModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.drawTool === "freehand" && state.drawingMode) {
    disableDrawingMode();
    penModeBtn.classList.remove("active");
  } else {
    state.drawTool = "freehand";
    penModeBtn.classList.add("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    objectEraserModeBtn.classList.remove("active");
    moveModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    document.body.classList.remove("move-tool");
    enableDrawingMode();
  }
});

// Arrow mode toggle
arrowModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.drawTool === "arrow" && state.drawingMode) {
    disableDrawingMode();
    arrowModeBtn.classList.remove("active");
  } else {
    state.drawTool = "arrow";
    arrowModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    objectEraserModeBtn.classList.remove("active");
    moveModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    document.body.classList.remove("move-tool");
    enableDrawingMode();
  }
});

// Line mode toggle
lineModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.drawTool === "line" && state.drawingMode) {
    disableDrawingMode();
    lineModeBtn.classList.remove("active");
  } else {
    state.drawTool = "line";
    lineModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    objectEraserModeBtn.classList.remove("active");
    moveModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    document.body.classList.remove("move-tool");
    enableDrawingMode();
  }
});

// Solid rectangle mode toggle
rectModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.drawTool === "rect" && state.drawingMode) {
    disableDrawingMode();
    rectModeBtn.classList.remove("active");
  } else {
    state.drawTool = "rect";
    rectModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    objectEraserModeBtn.classList.remove("active");
    moveModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    document.body.classList.remove("move-tool");
    enableDrawingMode();
  }
});

// Bordered rectangle mode toggle
rectstrokeModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.drawTool === "rectstroke" && state.drawingMode) {
    disableDrawingMode();
    rectstrokeModeBtn.classList.remove("active");
  } else {
    state.drawTool = "rectstroke";
    rectstrokeModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    objectEraserModeBtn.classList.remove("active");
    moveModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    document.body.classList.remove("move-tool");
    enableDrawingMode();
  }
});

// Oval mode toggle
ovalModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.drawTool === "oval" && state.drawingMode) {
    disableDrawingMode();
    ovalModeBtn.classList.remove("active");
  } else {
    state.drawTool = "oval";
    ovalModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    objectEraserModeBtn.classList.remove("active");
    moveModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    document.body.classList.remove("move-tool");
    enableDrawingMode();
  }
});

// Solid oval mode toggle
ovalfillModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.drawTool === "ovalfill" && state.drawingMode) {
    disableDrawingMode();
    ovalfillModeBtn.classList.remove("active");
  } else {
    state.drawTool = "ovalfill";
    ovalfillModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    objectEraserModeBtn.classList.remove("active");
    moveModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    document.body.classList.remove("move-tool");
    enableDrawingMode();
  }
});

// Dot mode toggle
dotModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.drawTool === "dot" && state.drawingMode) {
    disableDrawingMode();
    dotModeBtn.classList.remove("active");
  } else {
    state.drawTool = "dot";
    dotModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    objectEraserModeBtn.classList.remove("active");
    moveModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    document.body.classList.remove("move-tool");
    enableDrawingMode();
  }
});

// Eraser mode toggle
eraserModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.drawTool === "eraser" && state.drawingMode) {
    disableDrawingMode();
    eraserModeBtn.classList.remove("active");
    objectEraserModeBtn.classList.remove("active");
    document.body.classList.remove("eraser-tool");
  } else {
    state.drawTool = "eraser";
    eraserModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    objectEraserModeBtn.classList.remove("active");
    moveModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    document.body.classList.remove("text-tool");
    document.body.classList.remove("move-tool");
    document.body.classList.add("eraser-tool");
    enableDrawingMode();
  }
});

// Object eraser mode toggle — removes whole shapes on click
objectEraserModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.drawTool === "object-eraser" && state.drawingMode) {
    disableDrawingMode();
    objectEraserModeBtn.classList.remove("active");
    document.body.classList.remove("eraser-tool");
  } else {
    state.drawTool = "object-eraser";
    objectEraserModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    moveModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    document.body.classList.remove("text-tool");
    document.body.classList.remove("move-tool");
    document.body.classList.add("eraser-tool");
    enableDrawingMode();
  }
});

// Move mode toggle
moveModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.drawTool === "move" && state.drawingMode) {
    disableDrawingMode();
    moveModeBtn.classList.remove("active");
    document.body.classList.remove("move-tool");
  } else {
    state.drawTool = "move";
    moveModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    objectEraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    document.body.classList.add("move-tool");
    enableDrawingMode();
  }
});

// Text mode toggle
textModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.drawTool === "text" && state.drawingMode) {
    disableDrawingMode();
    textModeBtn.classList.remove("active");
    document.body.classList.remove("text-tool");
  } else {
    state.drawTool = "text";
    textModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    objectEraserModeBtn.classList.remove("active");
    moveModeBtn.classList.remove("active");
    document.body.classList.remove("eraser-tool");
    document.body.classList.remove("move-tool");
    enableDrawingMode();
  }
});

drawFontSizeInput.addEventListener("input", (e) => {
  state.drawFontSize = parseInt(e.target.value) || 13;
});



// visible image content area), accounting for object-fit: contain.


// Store ResizeObservers so we can disconnect them during export


// Calculate the rendered content area of an img with object-fit: contain
// Returns { x, y, width, height } in CSS pixels relative to the img element's box
const getObjectFitRect = (img) => {
  const elemWidth = img.clientWidth;
  const elemHeight = img.clientHeight;
  const natWidth = img.naturalWidth;
  const natHeight = img.naturalHeight;

  if (!natWidth || !natHeight || !elemWidth || !elemHeight) {
    return { x: 0, y: 0, width: elemWidth, height: elemHeight };
  }

  const elemRatio = elemWidth / elemHeight;
  const natRatio = natWidth / natHeight;

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

// Redraw all stored paths on a canvas at current size.
// Coordinates are relative to the visible image content (0-1), so we map them
// to canvas space accounting for object-fit positioning.
const redrawCanvas = (canvas, dpr) => {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const data = state.canvasDataMap.get(canvas);
  if (!data) return;

  const drop = canvas.parentElement;
  const img = drop ? drop.querySelector("img") : null;

  // Calculate where the visible image content sits within the canvas
  let contentOffsetX = 0, contentOffsetY = 0, contentWidth = canvas.width / dpr, contentHeight = canvas.height / dpr;
  if (drop && img && img.src && img.style.display !== "none" && img.naturalWidth) {
    const fitRect = getObjectFitRect(img);
    // getObjectFitRect returns offsets relative to the img element's box.
    // The canvas covers the drop's content area (inside border), so we need
    // the img element's offset relative to the canvas to correctly position drawings.
    const canvasRect = canvas.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    const imgOffsetX = imgRect.left - canvasRect.left;
    const imgOffsetY = imgRect.top - canvasRect.top;
    contentOffsetX = imgOffsetX + fitRect.x;
    contentOffsetY = imgOffsetY + fitRect.y;
    contentWidth = fitRect.width;
    contentHeight = fitRect.height;
  }

  // Scale line widths proportionally to zoom so drawings maintain their
  // relative size to the image (same proportion as at 100% zoom)
  const zoomScale = state.gridZoom / 100;

  for (const path of data.paths) {
    ctx.strokeStyle = path.color;
    ctx.lineWidth = path.lineWidth * zoomScale * dpr;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const toCanvasX = (ix) => (contentOffsetX + ix * contentWidth) * dpr;
    const toCanvasY = (iy) => (contentOffsetY + iy * contentHeight) * dpr;

    if (path.type === "text") {
      // Draw text annotation (multiline support)
      const fontSize = (path.fontSize || 13) * zoomScale * dpr;
      const lineHeight = fontSize * 1.3;
      ctx.font = `500 ${fontSize}px "Inter", system-ui, sans-serif`;
      ctx.textBaseline = "top";
      const x = toCanvasX(path.position.x);
      const y = toCanvasY(path.position.y);
      const lines = path.text.split("\n");
      // Measure widest line for background
      const maxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const totalHeight = fontSize + (lines.length - 1) * lineHeight;
      const padding = 4 * zoomScale * dpr;
      // Draw semi-transparent background
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      const radius = fontSize * 0.2;
      ctx.beginPath();
      ctx.roundRect(x - padding, y - padding, maxWidth + padding * 2, totalHeight + padding * 2, radius);
      ctx.fill();
      // Draw each line
      ctx.fillStyle = path.color;
      lines.forEach((line, i) => {
        ctx.fillText(line, x, y + i * lineHeight);
      });
    } else if (path.type === "arrow") {
      // Draw arrow: line + arrowhead
      const fromX = toCanvasX(path.from.x);
      const fromY = toCanvasY(path.from.y);
      const toX = toCanvasX(path.to.x);
      const toY = toCanvasY(path.to.y);

      drawArrow(ctx, fromX, fromY, toX, toY, path.lineWidth * zoomScale * dpr);
    } else if (path.type === "line") {
      // Draw straight line (no arrowhead)
      const fromX = toCanvasX(path.from.x);
      const fromY = toCanvasY(path.from.y);
      const toX = toCanvasX(path.to.x);
      const toY = toCanvasY(path.to.y);
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
    } else if (path.type === "rect") {
      // Draw solid (filled) rectangle
      const x = toCanvasX(Math.min(path.from.x, path.to.x));
      const y = toCanvasY(Math.min(path.from.y, path.to.y));
      const w = toCanvasX(Math.max(path.from.x, path.to.x)) - x;
      const h = toCanvasY(Math.max(path.from.y, path.to.y)) - y;
      ctx.fillStyle = path.color;
      ctx.fillRect(x, y, w, h);
    } else if (path.type === "rectstroke") {
      // Draw bordered (stroked) rectangle
      const x = toCanvasX(Math.min(path.from.x, path.to.x));
      const y = toCanvasY(Math.min(path.from.y, path.to.y));
      const w = toCanvasX(Math.max(path.from.x, path.to.x)) - x;
      const h = toCanvasY(Math.max(path.from.y, path.to.y)) - y;
      ctx.strokeRect(x, y, w, h);
    } else if (path.type === "oval") {
      // Draw stroked oval
      const x = toCanvasX(Math.min(path.from.x, path.to.x));
      const y = toCanvasY(Math.min(path.from.y, path.to.y));
      const w = toCanvasX(Math.max(path.from.x, path.to.x)) - x;
      const h = toCanvasY(Math.max(path.from.y, path.to.y)) - y;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (path.type === "ovalfill") {
      // Draw filled oval
      const x = toCanvasX(Math.min(path.from.x, path.to.x));
      const y = toCanvasY(Math.min(path.from.y, path.to.y));
      const w = toCanvasX(Math.max(path.from.x, path.to.x)) - x;
      const h = toCanvasY(Math.max(path.from.y, path.to.y)) - y;
      ctx.fillStyle = path.color;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (path.type === "dot") {
      // Draw a small filled circle at the position with opacity
      const cx = toCanvasX(path.position.x);
      const cy = toCanvasY(path.position.y);
      const radius = (path.lineWidth + 4) * zoomScale * dpr;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = path.color;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    } else if (path.type === "eraser") {
      // Erase along the path using destination-out compositing
      if (path.points.length < 2) continue;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = (path.lineWidth + 10) * zoomScale * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(toCanvasX(path.points[0].x), toCanvasY(path.points[0].y));
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(toCanvasX(path.points[i].x), toCanvasY(path.points[i].y));
      }
      ctx.stroke();
      ctx.restore();
    } else {
      // Freehand path
      if (path.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(toCanvasX(path.points[0].x), toCanvasY(path.points[0].y));
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(toCanvasX(path.points[i].x), toCanvasY(path.points[i].y));
      }
      ctx.stroke();
    }
  }
};

// Draw an arrow from (x1,y1) to (x2,y2) with an arrowhead
const drawArrow = (ctx, x1, y1, x2, y2, lineWidth) => {
  const headLength = Math.max(10, lineWidth * 4);
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

// Show an inline text input overlay on the canvas for the text tool
const showTextInput = (drop, canvas, normX, normY, clientX, clientY) => {
  // Remove any existing text input
  const existing = drop.querySelector(".drawing-text-input");
  if (existing) existing.remove();

  const input = document.createElement("textarea");
  input.className = "drawing-text-input";
  input.setAttribute("wrap", "off");
  input.style.position = "absolute";
  input.style.zIndex = "30";
  input.style.background = "rgba(255,255,255,0.9)";
  input.style.border = `1px solid ${state.drawColor}`;
  input.style.borderRadius = "4px";
  input.style.padding = "2px 6px";
  input.style.fontSize = state.drawFontSize + "px";
  input.style.fontWeight = "500";
  input.style.fontFamily = "Inter, system-ui, sans-serif";
  input.style.color = state.drawColor;
  input.style.outline = "none";
  input.style.minWidth = "20px";
  input.style.width = "20px";
  input.style.resize = "none";
  input.style.overflow = "hidden";
  input.style.whiteSpace = "pre";
  input.style.lineHeight = "1.3";
  input.style.textAlign = "left";
  input.rows = 1;

  // Position relative to the drop container
  const dropRect = drop.getBoundingClientRect();
  input.style.left = (clientX - dropRect.left) + "px";
  input.style.top = (clientY - dropRect.top) + "px";

  // Hidden measuring span to auto-size the input
  const measurer = document.createElement("span");
  measurer.style.position = "absolute";
  measurer.style.visibility = "hidden";
  measurer.style.whiteSpace = "pre";
  measurer.style.fontSize = state.drawFontSize + "px";
  measurer.style.fontWeight = "500";
  measurer.style.fontFamily = "Inter, system-ui, sans-serif";
  measurer.style.padding = "2px 6px";
  drop.appendChild(measurer);

  const resizeInput = () => {
    const lines = input.value.split("\n");
    const longestLine = lines.reduce((a, b) => a.length > b.length ? a : b, " ");
    measurer.textContent = longestLine || " ";
    input.style.width = Math.max(20, measurer.offsetWidth + 4) + "px";
    input.style.height = (lines.length * state.drawFontSize * 1.3 + 12) + "px";
  };

  drop.appendChild(input);
  input.focus();

  input.addEventListener("input", resizeInput);

  let committed = false;
  const commitText = () => {
    if (committed || !input.parentNode) return;
    committed = true;
    const text = input.value.trim();
    if (text) {
      const data = state.canvasDataMap.get(canvas);
      if (data) {
        data.paths.push({
          type: "text",
          color: state.drawColor,
          fontSize: state.drawFontSize,
          position: { x: normX, y: normY },
          text: text,
        });
        const dpr = window.devicePixelRatio || 1;
        redrawCanvas(canvas, dpr);
      }
    }
    input.remove();
    measurer.remove();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitText();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (input.parentNode) {
        input.remove();
        measurer.remove();
      }
    }
    e.stopPropagation();
  });

  input.addEventListener("blur", () => {
    commitText();
  });

  // Prevent drawing mode from deactivating when clicking the input
  input.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });
};

// Hit-test a normalized point (x, y) against a path to determine if the click is "on" it.
// Returns true if the point is close enough to the path to count as a hit.
const hitTestPath = (path, x, y, threshold = 0.02) => {
  if (path.type === "text") {
    // Approximate text bounding box
    const fontSize = (path.fontSize || 13) / 500; // rough normalized size
    const lines = path.text.split("\n");
    const width = Math.max(0.05, lines.reduce((max, l) => Math.max(max, l.length * fontSize * 0.6), 0));
    const height = lines.length * fontSize * 1.3;
    return (
      x >= path.position.x - threshold &&
      x <= path.position.x + width + threshold &&
      y >= path.position.y - threshold &&
      y <= path.position.y + height + threshold
    );
  }

  if (path.type === "dot") {
    const dx = x - path.position.x;
    const dy = y - path.position.y;
    return Math.sqrt(dx * dx + dy * dy) < threshold * 2;
  }

  if (path.type === "arrow" || path.type === "line") {
    return distToSegment(x, y, path.from.x, path.from.y, path.to.x, path.to.y) < threshold;
  }

  if (path.type === "rect" || path.type === "rectstroke" || path.type === "oval" || path.type === "ovalfill") {
    const minX = Math.min(path.from.x, path.to.x);
    const maxX = Math.max(path.from.x, path.to.x);
    const minY = Math.min(path.from.y, path.to.y);
    const maxY = Math.max(path.from.y, path.to.y);

    if (path.type === "rect" || path.type === "ovalfill") {
      // Filled shapes — hit if inside
      return x >= minX - threshold && x <= maxX + threshold && y >= minY - threshold && y <= maxY + threshold;
    }
    // Stroked shapes — hit if near the border
    const inside = x >= minX - threshold && x <= maxX + threshold && y >= minY - threshold && y <= maxY + threshold;
    const deepInside = x >= minX + threshold && x <= maxX - threshold && y >= minY + threshold && y <= maxY - threshold;
    return inside && !deepInside;
  }

  if (path.type === "eraser" || !path.type || path.type === "freehand") {
    // Freehand or eraser — check distance to any segment
    if (!path.points || path.points.length < 2) {
      if (path.points && path.points.length === 1) {
        const dx = x - path.points[0].x;
        const dy = y - path.points[0].y;
        return Math.sqrt(dx * dx + dy * dy) < threshold;
      }
      return false;
    }
    for (let i = 1; i < path.points.length; i++) {
      if (distToSegment(x, y, path.points[i - 1].x, path.points[i - 1].y, path.points[i].x, path.points[i].y) < threshold) {
        return true;
      }
    }
    return false;
  }

  return false;
};

// Distance from point (px, py) to line segment (x1,y1)-(x2,y2)
const distToSegment = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
};

// Offset all coordinates of a path by (dx, dy) in normalized space
const offsetPath = (path, dx, dy) => {
  if (path.type === "text" || path.type === "dot") {
    path.position.x += dx;
    path.position.y += dy;
  } else if (path.type === "arrow" || path.type === "line" || path.type === "rect" || path.type === "rectstroke" || path.type === "oval" || path.type === "ovalfill") {
    path.from.x += dx;
    path.from.y += dy;
    path.to.x += dx;
    path.to.y += dy;
  } else if (path.points && path.points.length > 0) {
    // Freehand or eraser
    for (const pt of path.points) {
      pt.x += dx;
      pt.y += dy;
    }
  }
};

const initDrawingCanvas = (drop) => {
  const canvas = document.createElement("canvas");
  canvas.className = "drawing-canvas";
  drop.appendChild(canvas);

  // Preview canvas — sits on top of the main canvas for in-progress shape rendering.
  // This avoids redrawing all committed paths on every mousemove during shape tools.
  const previewCanvas = document.createElement("canvas");
  previewCanvas.className = "drawing-canvas";
  previewCanvas.style.pointerEvents = "none";
  drop.appendChild(previewCanvas);

  // Clear drawing button
  const clearBtn = document.createElement("button");
  clearBtn.className = "clear-drawing-btn";
  clearBtn.title = "Clear drawing";
  clearBtn.textContent = "✕";
  clearBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const data = state.canvasDataMap.get(canvas);
    if (data) data.paths = [];
    const dpr = window.devicePixelRatio || 1;
    redrawCanvas(canvas, dpr);
  });
  drop.appendChild(clearBtn);

  // Initialize data store
  state.canvasDataMap.set(canvas, { paths: [] });

  // Resize canvas to match drop zone
  const resizeCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    // Use clientWidth/clientHeight to get the inner size (excluding border)
    // which matches what position:absolute with top:0;left:0;width:100%;height:100% covers
    const w = drop.clientWidth;
    const h = drop.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    previewCanvas.width = w * dpr;
    previewCanvas.height = h * dpr;
    previewCanvas.style.width = w + "px";
    previewCanvas.style.height = h + "px";
    redrawCanvas(canvas, dpr);
  };

  // Use ResizeObserver to keep canvas sized correctly
  const observer = new ResizeObserver(resizeCanvas);
  observer.observe(drop);
  state.canvasObservers.set(canvas, observer);

  // Helper: clear the preview canvas
  const clearPreview = () => {
    const ctx = previewCanvas.getContext("2d");
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  };

  // Helper: compute content offset/size for coordinate mapping
  const getContentMetrics = (dpr) => {
    const img = drop.querySelector("img");
    let contentOffsetX = 0, contentOffsetY = 0, contentWidth = canvas.width / dpr, contentHeight = canvas.height / dpr;
    if (img && img.src && img.style.display !== "none" && img.naturalWidth) {
      const fitRect = getObjectFitRect(img);
      const canvasRect = canvas.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      contentOffsetX = (imgRect.left - canvasRect.left) + fitRect.x;
      contentOffsetY = (imgRect.top - canvasRect.top) + fitRect.y;
      contentWidth = fitRect.width;
      contentHeight = fitRect.height;
    }
    const toCanvasX = (ix) => (contentOffsetX + ix * contentWidth) * dpr;
    const toCanvasY = (iy) => (contentOffsetY + iy * contentHeight) * dpr;
    return { contentOffsetX, contentOffsetY, contentWidth, contentHeight, toCanvasX, toCanvasY };
  };

  // Drawing state
  let isDrawing = false;
  let currentPath = null;
  let arrowStart = null;
  // Move tool state
  let movingPath = null;
  let moveStartX = 0;
  let moveStartY = 0;

  canvas.addEventListener("mousedown", (e) => {
    if (!state.drawingMode) return;
    e.preventDefault();
    e.stopPropagation();

    // Store coordinates relative to the visible image content (accounting for object-fit)
    const img = drop.querySelector("img");
    let x, y;
    if (img && img.src && img.style.display !== "none" && img.naturalWidth) {
      const imgElemRect = img.getBoundingClientRect();
      const fitRect = getObjectFitRect(img);
      // The visible content's position in page coords
      const contentLeft = imgElemRect.left + fitRect.x;
      const contentTop = imgElemRect.top + fitRect.y;
      x = (e.clientX - contentLeft) / fitRect.width;
      y = (e.clientY - contentTop) / fitRect.height;
    } else {
      const rect = canvas.getBoundingClientRect();
      x = (e.clientX - rect.left) / rect.width;
      y = (e.clientY - rect.top) / rect.height;
    }

    if (state.drawTool === "text") {
      // Show an inline input to type text at the clicked position
      showTextInput(drop, canvas, x, y, e.clientX, e.clientY);
      return;
    }

    if (state.drawTool === "dot") {
      // Place a small dot immediately at the click position
      const data = state.canvasDataMap.get(canvas);
      if (data) {
        data.paths.push({
          type: "dot",
          color: state.drawColor,
          lineWidth: state.drawLineWidth,
          position: { x, y },
        });
        const dpr = window.devicePixelRatio || 1;
        redrawCanvas(canvas, dpr);
      }
      return;
    }

    if (state.drawTool === "object-eraser") {
      // Remove the topmost path that the click hits
      const data = state.canvasDataMap.get(canvas);
      if (data && data.paths.length > 0) {
        // Search from top (last) to bottom (first) so we remove the topmost hit
        for (let i = data.paths.length - 1; i >= 0; i--) {
          if (hitTestPath(data.paths[i], x, y)) {
            data.paths.splice(i, 1);
            const dpr = window.devicePixelRatio || 1;
            redrawCanvas(canvas, dpr);
            break;
          }
        }
      }
      return;
    }

    if (state.drawTool === "move") {
      // Find the topmost path under the cursor and start moving it
      const data = state.canvasDataMap.get(canvas);
      if (data && data.paths.length > 0) {
        for (let i = data.paths.length - 1; i >= 0; i--) {
          if (hitTestPath(data.paths[i], x, y)) {
            movingPath = data.paths[i];
            moveStartX = x;
            moveStartY = y;
            isDrawing = true;
            break;
          }
        }
      }
      return;
    }

    isDrawing = true;

    if (state.drawTool === "arrow" || state.drawTool === "line" || state.drawTool === "rect" || state.drawTool === "rectstroke" || state.drawTool === "oval" || state.drawTool === "ovalfill") {
      arrowStart = { x, y };
    } else {
      currentPath = {
        type: state.drawTool === "eraser" ? "eraser" : undefined,
        color: state.drawColor,
        lineWidth: state.drawLineWidth,
        points: [{ x, y }],
      };
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    e.stopPropagation();

    // Store coordinates relative to the visible image content
    const img = drop.querySelector("img");
    let x, y;
    if (img && img.src && img.style.display !== "none" && img.naturalWidth) {
      const imgElemRect = img.getBoundingClientRect();
      const fitRect = getObjectFitRect(img);
      const contentLeft = imgElemRect.left + fitRect.x;
      const contentTop = imgElemRect.top + fitRect.y;
      x = (e.clientX - contentLeft) / fitRect.width;
      y = (e.clientY - contentTop) / fitRect.height;
    } else {
      const rect = canvas.getBoundingClientRect();
      x = (e.clientX - rect.left) / rect.width;
      y = (e.clientY - rect.top) / rect.height;
    }

    // Shift-constrain behavior depends on tool:
    // - Rect/oval tools: force 1:1 aspect ratio (square/circle) in pixel space
    // - Line/arrow/freehand: snap to horizontal or vertical axis
    if (state.drawTool === "move" && movingPath) {
      // Move the selected path by the delta
      const dx = x - moveStartX;
      const dy = y - moveStartY;
      offsetPath(movingPath, dx, dy);
      moveStartX = x;
      moveStartY = y;
      const dpr = window.devicePixelRatio || 1;
      redrawCanvas(canvas, dpr);
      return;
    }
    if (e.shiftKey) {
      if ((state.drawTool === "rect" || state.drawTool === "rectstroke" || state.drawTool === "oval" || state.drawTool === "ovalfill") && arrowStart) {
        // Convert normalized deltas to pixel space to get a true square/circle
        let contentWidth, contentHeight;
        if (img && img.src && img.style.display !== "none" && img.naturalWidth) {
          const fitRect = getObjectFitRect(img);
          contentWidth = fitRect.width;
          contentHeight = fitRect.height;
        } else {
          const r = canvas.getBoundingClientRect();
          contentWidth = r.width;
          contentHeight = r.height;
        }
        const dxPx = (x - arrowStart.x) * contentWidth;
        const dyPx = (y - arrowStart.y) * contentHeight;
        const maxSidePx = Math.max(Math.abs(dxPx), Math.abs(dyPx));
        x = arrowStart.x + (maxSidePx * Math.sign(dxPx || 1)) / contentWidth;
        y = arrowStart.y + (maxSidePx * Math.sign(dyPx || 1)) / contentHeight;
      } else {
        const origin = arrowStart || (currentPath && currentPath.points[0]);
        if (origin) {
          const dx = Math.abs(x - origin.x);
          const dy = Math.abs(y - origin.y);
          if (dx >= dy) {
            y = origin.y; // constrain to horizontal
          } else {
            x = origin.x; // constrain to vertical
          }
        }
      }
    }

    if (state.drawTool === "arrow" && arrowStart) {
      // Preview the arrow on the preview canvas (no full redraw needed)
      const dpr = window.devicePixelRatio || 1;
      clearPreview();
      const ctx = previewCanvas.getContext("2d");
      const { toCanvasX, toCanvasY } = getContentMetrics(dpr);

      const zs = state.gridZoom / 100;
      ctx.strokeStyle = state.drawColor;
      ctx.lineWidth = state.drawLineWidth * zs * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      drawArrow(ctx, toCanvasX(arrowStart.x), toCanvasY(arrowStart.y), toCanvasX(x), toCanvasY(y), state.drawLineWidth * zs * dpr);
    } else if (state.drawTool === "line" && arrowStart) {
      // Preview straight line
      const dpr = window.devicePixelRatio || 1;
      clearPreview();
      const ctx = previewCanvas.getContext("2d");
      const { toCanvasX, toCanvasY } = getContentMetrics(dpr);

      ctx.strokeStyle = state.drawColor;
      ctx.lineWidth = state.drawLineWidth * (state.gridZoom / 100) * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(toCanvasX(arrowStart.x), toCanvasY(arrowStart.y));
      ctx.lineTo(toCanvasX(x), toCanvasY(y));
      ctx.stroke();
    } else if (state.drawTool === "rect" && arrowStart) {
      // Preview solid rectangle
      const dpr = window.devicePixelRatio || 1;
      clearPreview();
      const ctx = previewCanvas.getContext("2d");
      const { toCanvasX, toCanvasY } = getContentMetrics(dpr);

      const rx = toCanvasX(Math.min(arrowStart.x, x));
      const ry = toCanvasY(Math.min(arrowStart.y, y));
      const rw = toCanvasX(Math.max(arrowStart.x, x)) - rx;
      const rh = toCanvasY(Math.max(arrowStart.y, y)) - ry;
      ctx.fillStyle = state.drawColor;
      ctx.fillRect(rx, ry, rw, rh);
    } else if (state.drawTool === "rectstroke" && arrowStart) {
      // Preview bordered rectangle
      const dpr = window.devicePixelRatio || 1;
      clearPreview();
      const ctx = previewCanvas.getContext("2d");
      const { toCanvasX, toCanvasY } = getContentMetrics(dpr);

      const rx = toCanvasX(Math.min(arrowStart.x, x));
      const ry = toCanvasY(Math.min(arrowStart.y, y));
      const rw = toCanvasX(Math.max(arrowStart.x, x)) - rx;
      const rh = toCanvasY(Math.max(arrowStart.y, y)) - ry;
      ctx.strokeStyle = state.drawColor;
      ctx.lineWidth = state.drawLineWidth * (state.gridZoom / 100) * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeRect(rx, ry, rw, rh);
    } else if (state.drawTool === "oval" && arrowStart) {
      // Preview oval
      const dpr = window.devicePixelRatio || 1;
      clearPreview();
      const ctx = previewCanvas.getContext("2d");
      const { toCanvasX, toCanvasY } = getContentMetrics(dpr);

      const rx = toCanvasX(Math.min(arrowStart.x, x));
      const ry = toCanvasY(Math.min(arrowStart.y, y));
      const rw = toCanvasX(Math.max(arrowStart.x, x)) - rx;
      const rh = toCanvasY(Math.max(arrowStart.y, y)) - ry;
      ctx.strokeStyle = state.drawColor;
      ctx.lineWidth = state.drawLineWidth * (state.gridZoom / 100) * dpr;
      ctx.beginPath();
      ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (state.drawTool === "ovalfill" && arrowStart) {
      // Preview solid oval
      const dpr = window.devicePixelRatio || 1;
      clearPreview();
      const ctx = previewCanvas.getContext("2d");
      const { toCanvasX, toCanvasY } = getContentMetrics(dpr);

      const rx = toCanvasX(Math.min(arrowStart.x, x));
      const ry = toCanvasY(Math.min(arrowStart.y, y));
      const rw = toCanvasX(Math.max(arrowStart.x, x)) - rx;
      const rh = toCanvasY(Math.max(arrowStart.y, y)) - ry;
      ctx.fillStyle = state.drawColor;
      ctx.beginPath();
      ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (currentPath) {
      currentPath.points.push({ x, y });

      // Draw incrementally
      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const points = currentPath.points;
      if (points.length >= 2) {
        const from = points[points.length - 2];
        const to = points[points.length - 1];

        // Map image-content-relative coords to canvas pixel coords for live drawing
        let contentOffsetX = 0, contentOffsetY = 0, contentWidth = canvas.width / dpr, contentHeight = canvas.height / dpr;
        if (img && img.src && img.style.display !== "none" && img.naturalWidth) {
          const fitRect = getObjectFitRect(img);
          const canvasRect = canvas.getBoundingClientRect();
          const imgRect = img.getBoundingClientRect();
          contentOffsetX = (imgRect.left - canvasRect.left) + fitRect.x;
          contentOffsetY = (imgRect.top - canvasRect.top) + fitRect.y;
          contentWidth = fitRect.width;
          contentHeight = fitRect.height;
        }
        const toCanvasX = (ix) => (contentOffsetX + ix * contentWidth) * dpr;
        const toCanvasY = (iy) => (contentOffsetY + iy * contentHeight) * dpr;

        if (currentPath.type === "eraser") {
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.strokeStyle = "rgba(0,0,0,1)";
          ctx.lineWidth = (currentPath.lineWidth + 8) * (state.gridZoom / 100) * dpr;
        } else {
          ctx.strokeStyle = currentPath.color;
          ctx.lineWidth = currentPath.lineWidth * (state.gridZoom / 100) * dpr;
        }
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(toCanvasX(from.x), toCanvasY(from.y));
        ctx.lineTo(toCanvasX(to.x), toCanvasY(to.y));
        ctx.stroke();
        if (currentPath.type === "eraser") {
          ctx.restore();
        }
      }
    }
  });

  const endDraw = (e) => {
    if (!isDrawing) return;
    isDrawing = false;

    // Clear the preview canvas — the shape will be committed to the main canvas
    clearPreview();

    if (state.drawTool === "move" && movingPath) {
      // Move is complete — just reset state
      movingPath = null;
      moveStartX = 0;
      moveStartY = 0;
      return;
    }

    if ((state.drawTool === "arrow" || state.drawTool === "line" || state.drawTool === "rect" || state.drawTool === "rectstroke" || state.drawTool === "oval" || state.drawTool === "ovalfill") && arrowStart) {
      // Get final position
      const img = drop.querySelector("img");
      let x, y;
      if (img && img.src && img.style.display !== "none" && img.naturalWidth) {
        const imgElemRect = img.getBoundingClientRect();
        const fitRect = getObjectFitRect(img);
        const contentLeft = imgElemRect.left + fitRect.x;
        const contentTop = imgElemRect.top + fitRect.y;
        x = (e.clientX - contentLeft) / fitRect.width;
        y = (e.clientY - contentTop) / fitRect.height;
      } else {
        const rect = canvas.getBoundingClientRect();
        x = (e.clientX - rect.left) / rect.width;
        y = (e.clientY - rect.top) / rect.height;
      }

      // Shift-constrain on commit
      if (e.shiftKey && arrowStart) {
        if (state.drawTool === "rect" || state.drawTool === "rectstroke" || state.drawTool === "oval" || state.drawTool === "ovalfill") {
          // Convert normalized deltas to pixel space to get a true square/circle
          const img = drop.querySelector("img");
          let contentWidth, contentHeight;
          if (img && img.src && img.style.display !== "none" && img.naturalWidth) {
            const fitRect = getObjectFitRect(img);
            contentWidth = fitRect.width;
            contentHeight = fitRect.height;
          } else {
            const r = canvas.getBoundingClientRect();
            contentWidth = r.width;
            contentHeight = r.height;
          }
          const dxPx = (x - arrowStart.x) * contentWidth;
          const dyPx = (y - arrowStart.y) * contentHeight;
          const maxSidePx = Math.max(Math.abs(dxPx), Math.abs(dyPx));
          x = arrowStart.x + (maxSidePx * Math.sign(dxPx || 1)) / contentWidth;
          y = arrowStart.y + (maxSidePx * Math.sign(dyPx || 1)) / contentHeight;
        } else {
          const dx = Math.abs(x - arrowStart.x);
          const dy = Math.abs(y - arrowStart.y);
          if (dx >= dy) {
            y = arrowStart.y;
          } else {
            x = arrowStart.x;
          }
        }
      }

      // Only commit if the shape has some size
      const dx = x - arrowStart.x;
      const dy = y - arrowStart.y;
      if (Math.sqrt(dx * dx + dy * dy) > 0.005) {
        const data = state.canvasDataMap.get(canvas);
        if (data) {
          data.paths.push({
            type: state.drawTool,
            color: state.drawColor,
            lineWidth: state.drawLineWidth,
            from: arrowStart,
            to: { x, y },
          });
        }
      }
      arrowStart = null;
      // Redraw to finalize
      const dpr = window.devicePixelRatio || 1;
      redrawCanvas(canvas, dpr);
    } else {
      if (currentPath && currentPath.points.length > 1) {
        const data = state.canvasDataMap.get(canvas);
        if (data) data.paths.push(currentPath);
      }
      currentPath = null;
    }
  };

  canvas.addEventListener("mouseup", endDraw);
  canvas.addEventListener("mouseleave", endDraw);

  return canvas;
};

// Redraw all canvases at export scale — called before capture.
// Since drawing coords are stored relative to the image (0-1), we bake them
// directly onto the image for a pixel-perfect export.
const redrawAllCanvasesForExport = async (scale) => {
  // Disconnect all ResizeObservers so they don't interfere during export
  document.querySelectorAll(".drawing-canvas").forEach((canvas) => {
    const obs = state.canvasObservers.get(canvas);
    if (obs) obs.disconnect();
  });

  const canvases = document.querySelectorAll(".drawing-canvas");
  for (const canvas of canvases) {
    const drop = canvas.parentElement;
    const img = drop.querySelector("img");

    const data = state.canvasDataMap.get(canvas);
    if (!data || data.paths.length === 0) {
      // No drawings — just hide the canvas for export
      canvas.style.display = "none";
      continue;
    }

    if (!img || !img.src || img.style.display === "none") {
      // No image — keep canvas as-is with simple redraw
      const dropRect = drop.getBoundingClientRect();
      const dprNoImg = window.devicePixelRatio || 1;
      canvas.width = dropRect.width * dprNoImg;
      canvas.height = dropRect.height * dprNoImg;
      canvas.style.width = dropRect.width + "px";
      canvas.style.height = dropRect.height + "px";

      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const path of data.paths) {
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.lineWidth * dprNoImg;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (path.type === "text") {
          const fontSize = (path.fontSize || 16) * dprNoImg;
          const lineHeight = fontSize * 1.3;
          ctx.font = `500 ${fontSize}px "Inter", system-ui, sans-serif`;
          ctx.textBaseline = "top";
          const tx = path.position.x * canvas.width;
          const ty = path.position.y * canvas.height;
          const lines = path.text.split("\n");
          const maxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
          const totalHeight = fontSize + (lines.length - 1) * lineHeight;
          const padding = 4 * dprNoImg;
          ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
          const radius = fontSize * 0.2;
          ctx.beginPath();
          ctx.roundRect(tx - padding, ty - padding, maxWidth + padding * 2, totalHeight + padding * 2, radius);
          ctx.fill();
          ctx.fillStyle = path.color;
          lines.forEach((line, i) => {
            ctx.fillText(line, tx, ty + i * lineHeight);
          });
        } else if (path.type === "arrow") {
          const fromX = path.from.x * canvas.width;
          const fromY = path.from.y * canvas.height;
          const toX = path.to.x * canvas.width;
          const toY = path.to.y * canvas.height;
          drawArrow(ctx, fromX, fromY, toX, toY, path.lineWidth * dprNoImg);
        } else if (path.type === "line") {
          const fromX = path.from.x * canvas.width;
          const fromY = path.from.y * canvas.height;
          const toX = path.to.x * canvas.width;
          const toY = path.to.y * canvas.height;
          ctx.beginPath();
          ctx.moveTo(fromX, fromY);
          ctx.lineTo(toX, toY);
          ctx.stroke();
        } else if (path.type === "rect") {
          const rx = Math.min(path.from.x, path.to.x) * canvas.width;
          const ry = Math.min(path.from.y, path.to.y) * canvas.height;
          const rw = Math.abs(path.to.x - path.from.x) * canvas.width;
          const rh = Math.abs(path.to.y - path.from.y) * canvas.height;
          ctx.fillStyle = path.color;
          ctx.fillRect(rx, ry, rw, rh);
        } else if (path.type === "rectstroke") {
          const rx = Math.min(path.from.x, path.to.x) * canvas.width;
          const ry = Math.min(path.from.y, path.to.y) * canvas.height;
          const rw = Math.abs(path.to.x - path.from.x) * canvas.width;
          const rh = Math.abs(path.to.y - path.from.y) * canvas.height;
          ctx.strokeRect(rx, ry, rw, rh);
        } else if (path.type === "oval") {
          const rx = Math.min(path.from.x, path.to.x) * canvas.width;
          const ry = Math.min(path.from.y, path.to.y) * canvas.height;
          const rw = Math.abs(path.to.x - path.from.x) * canvas.width;
          const rh = Math.abs(path.to.y - path.from.y) * canvas.height;
          ctx.beginPath();
          ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (path.type === "ovalfill") {
          const rx = Math.min(path.from.x, path.to.x) * canvas.width;
          const ry = Math.min(path.from.y, path.to.y) * canvas.height;
          const rw = Math.abs(path.to.x - path.from.x) * canvas.width;
          const rh = Math.abs(path.to.y - path.from.y) * canvas.height;
          ctx.fillStyle = path.color;
          ctx.beginPath();
          ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (path.type === "dot") {
          const cx = path.position.x * canvas.width;
          const cy = path.position.y * canvas.height;
          const radius = (path.lineWidth + 4) * dprNoImg;
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = path.color;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;
        } else if (path.type === "eraser") {
          if (path.points.length < 2) continue;
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.strokeStyle = "rgba(0,0,0,1)";
          ctx.lineWidth = (path.lineWidth + 8) * dprNoImg;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(path.points[0].x * canvas.width, path.points[0].y * canvas.height);
          for (let i = 1; i < path.points.length; i++) {
            ctx.lineTo(path.points[i].x * canvas.width, path.points[i].y * canvas.height);
          }
          ctx.stroke();
          ctx.restore();
        } else {
          if (!path.points || path.points.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(path.points[0].x * canvas.width, path.points[0].y * canvas.height);
          for (let i = 1; i < path.points.length; i++) {
            ctx.lineTo(path.points[i].x * canvas.width, path.points[i].y * canvas.height);
          }
          ctx.stroke();
        }
      }
      continue;
    }

    // Bake drawing onto the image: create a temp canvas at the image's rendered size
    // multiplied by dpr so line thickness matches what the user sees on screen.
    // Use the actual visible content area (accounting for object-fit: contain)
    // so the baked image isn't stretched.
    const imgRect = img.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const fitRect = getObjectFitRect(img);

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = fitRect.width * dpr;
    tempCanvas.height = fitRect.height * dpr;
    const ctx = tempCanvas.getContext("2d");

    // Draw the original image at the content area size (not the element size)
    ctx.drawImage(img, 0, 0, fitRect.width * dpr, fitRect.height * dpr);

    // Draw annotations on a separate overlay canvas so eraser only removes
    // drawing strokes, not the underlying image pixels.
    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = tempCanvas.width;
    overlayCanvas.height = tempCanvas.height;
    const oCtx = overlayCanvas.getContext("2d");

    // Draw paths onto the overlay — coords are already image-relative (0-1)
    for (const path of data.paths) {
      oCtx.strokeStyle = path.color;
      oCtx.lineWidth = path.lineWidth * dpr;
      oCtx.lineCap = "round";
      oCtx.lineJoin = "round";

      if (path.type === "text") {
        const fontSize = (path.fontSize || 16) * dpr;
        const lineHeight = fontSize * 1.3;
        oCtx.font = `500 ${fontSize}px "Inter", system-ui, sans-serif`;
        oCtx.textBaseline = "top";
        const x = path.position.x * fitRect.width * dpr;
        const y = path.position.y * fitRect.height * dpr;
        const lines = path.text.split("\n");
        const maxWidth = Math.max(...lines.map((l) => oCtx.measureText(l).width));
        const totalHeight = fontSize + (lines.length - 1) * lineHeight;
        const padding = 4 * dpr;
        oCtx.fillStyle = "rgba(0, 0, 0, 0.05)";
        const radius = fontSize * 0.2;
        oCtx.beginPath();
        oCtx.roundRect(x - padding, y - padding, maxWidth + padding * 2, totalHeight + padding * 2, radius);
        oCtx.fill();
        oCtx.fillStyle = path.color;
        lines.forEach((line, i) => {
          oCtx.fillText(line, x, y + i * lineHeight);
        });
      } else if (path.type === "arrow") {
        const fromX = path.from.x * fitRect.width * dpr;
        const fromY = path.from.y * fitRect.height * dpr;
        const toX = path.to.x * fitRect.width * dpr;
        const toY = path.to.y * fitRect.height * dpr;
        drawArrow(oCtx, fromX, fromY, toX, toY, path.lineWidth * dpr);
      } else if (path.type === "line") {
        const fromX = path.from.x * fitRect.width * dpr;
        const fromY = path.from.y * fitRect.height * dpr;
        const toX = path.to.x * fitRect.width * dpr;
        const toY = path.to.y * fitRect.height * dpr;
        oCtx.beginPath();
        oCtx.moveTo(fromX, fromY);
        oCtx.lineTo(toX, toY);
        oCtx.stroke();
      } else if (path.type === "rect") {
        const rx = Math.min(path.from.x, path.to.x) * fitRect.width * dpr;
        const ry = Math.min(path.from.y, path.to.y) * fitRect.height * dpr;
        const rw = Math.abs(path.to.x - path.from.x) * fitRect.width * dpr;
        const rh = Math.abs(path.to.y - path.from.y) * fitRect.height * dpr;
        oCtx.fillStyle = path.color;
        oCtx.fillRect(rx, ry, rw, rh);
      } else if (path.type === "rectstroke") {
        const rx = Math.min(path.from.x, path.to.x) * fitRect.width * dpr;
        const ry = Math.min(path.from.y, path.to.y) * fitRect.height * dpr;
        const rw = Math.abs(path.to.x - path.from.x) * fitRect.width * dpr;
        const rh = Math.abs(path.to.y - path.from.y) * fitRect.height * dpr;
        oCtx.strokeRect(rx, ry, rw, rh);
      } else if (path.type === "oval") {
        const rx = Math.min(path.from.x, path.to.x) * fitRect.width * dpr;
        const ry = Math.min(path.from.y, path.to.y) * fitRect.height * dpr;
        const rw = Math.abs(path.to.x - path.from.x) * fitRect.width * dpr;
        const rh = Math.abs(path.to.y - path.from.y) * fitRect.height * dpr;
        oCtx.beginPath();
        oCtx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
        oCtx.stroke();
      } else if (path.type === "ovalfill") {
        const rx = Math.min(path.from.x, path.to.x) * fitRect.width * dpr;
        const ry = Math.min(path.from.y, path.to.y) * fitRect.height * dpr;
        const rw = Math.abs(path.to.x - path.from.x) * fitRect.width * dpr;
        const rh = Math.abs(path.to.y - path.from.y) * fitRect.height * dpr;
        oCtx.fillStyle = path.color;
        oCtx.beginPath();
        oCtx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
        oCtx.fill();
      } else if (path.type === "dot") {
        const cx = path.position.x * fitRect.width * dpr;
        const cy = path.position.y * fitRect.height * dpr;
        const radius = (path.lineWidth + 4) * dpr;
        oCtx.globalAlpha = 0.7;
        oCtx.fillStyle = path.color;
        oCtx.beginPath();
        oCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        oCtx.fill();
        oCtx.globalAlpha = 1.0;
      } else if (path.type === "eraser") {
        if (path.points.length < 2) continue;
        oCtx.save();
        oCtx.globalCompositeOperation = "destination-out";
        oCtx.strokeStyle = "rgba(0,0,0,1)";
        oCtx.lineWidth = (path.lineWidth + 8) * dpr;
        oCtx.lineCap = "round";
        oCtx.lineJoin = "round";
        oCtx.beginPath();
        oCtx.moveTo(path.points[0].x * fitRect.width * dpr, path.points[0].y * fitRect.height * dpr);
        for (let i = 1; i < path.points.length; i++) {
          oCtx.lineTo(path.points[i].x * fitRect.width * dpr, path.points[i].y * fitRect.height * dpr);
        }
        oCtx.stroke();
        oCtx.restore();
      } else {
        if (!path.points || path.points.length < 2) continue;
        oCtx.beginPath();
        oCtx.moveTo(path.points[0].x * fitRect.width * dpr, path.points[0].y * fitRect.height * dpr);
        for (let i = 1; i < path.points.length; i++) {
          oCtx.lineTo(path.points[i].x * fitRect.width * dpr, path.points[i].y * fitRect.height * dpr);
        }
        oCtx.stroke();
      }
    }

    // Composite the annotation overlay onto the image
    ctx.drawImage(overlayCanvas, 0, 0);

    // Store original src for restoration
    canvas.dataset.originalImgSrc = img.src;
    // Replace image with composited version and size the element to match
    // Use toBlob + object URL instead of synchronous toDataURL for better performance
    const blobUrl = await new Promise((resolve) => {
      tempCanvas.toBlob((b) => resolve(URL.createObjectURL(b)), "image/png");
    });
    canvas.dataset.blobUrl = blobUrl;
    img.style.width = fitRect.width + "px";
    img.style.height = fitRect.height + "px";
    img.style.objectFit = "fill";
    // Wait for the image to load the new blob URL before modern-screenshot captures it
    await new Promise((resolve) => {
      img.onload = resolve;
      img.src = blobUrl;
    });
    // Hide the canvas so modern-screenshot doesn't double-render the drawing
    canvas.style.display = "none";
  }
};

// Restore canvases to display size after export
const restoreAllCanvases = () => {
  const canvases = document.querySelectorAll(".drawing-canvas");
  canvases.forEach((canvas) => {
    const drop = canvas.parentElement;
    const img = drop.querySelector("img");

    // Restore original image src if we baked drawings onto it
    if (canvas.dataset.originalImgSrc) {
      if (img) img.src = canvas.dataset.originalImgSrc;
      delete canvas.dataset.originalImgSrc;
      // Revoke the blob URL we created during export
      if (canvas.dataset.blobUrl) {
        URL.revokeObjectURL(canvas.dataset.blobUrl);
        delete canvas.dataset.blobUrl;
      }
    }

    // Show canvas again
    canvas.style.display = "";

    // Resize to current display dimensions
    const dpr = window.devicePixelRatio || 1;
    const w = drop.clientWidth;
    const h = drop.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    redrawCanvas(canvas, dpr);

    // Reconnect ResizeObserver
    const obs = state.canvasObservers.get(canvas);
    if (obs) obs.observe(drop);
  });
};


export {
  updateDrawingCursor,
  enableDrawingMode,
  disableDrawingMode,
  isColorDark,
  updatePresetColorSelection,
  getObjectFitRect,
  redrawCanvas,
  drawArrow,
  showTextInput,
  hitTestPath,
  distToSegment,
  offsetPath,
  initDrawingCanvas,
  redrawAllCanvasesForExport,
  restoreAllCanvases,
  penModeBtn,
  arrowModeBtn,
  lineModeBtn,
  rectModeBtn,
  rectstrokeModeBtn,
  ovalModeBtn,
  ovalfillModeBtn,
  dotModeBtn,
  eraserModeBtn,
  objectEraserModeBtn,
  moveModeBtn,
  textModeBtn,
  drawFontSizeInput,
  drawColorInput,
};

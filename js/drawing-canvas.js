import state from './state.js';
import { getObjectFitRect, getCanvasContentMetrics, renderPaths, redrawCanvas, drawArrow } from './drawing-render.js';
import { setLastActiveDrawingCanvas } from './drawing-tools.js';

// --- Canvas Initialization, Input Handling & Hit Testing ---

// Hit-test a normalized point (x, y) against a path to determine if the click is "on" it.
// Returns true if the point is close enough to the path to count as a hit.
export const hitTestPath = (path, x, y, threshold = 0.02) => {
  if (path.type === "text") {
    const fontSize = (path.fontSize || 13) / 500;
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
      return x >= minX - threshold && x <= maxX + threshold && y >= minY - threshold && y <= maxY + threshold;
    }
    const inside = x >= minX - threshold && x <= maxX + threshold && y >= minY - threshold && y <= maxY + threshold;
    const deepInside = x >= minX + threshold && x <= maxX - threshold && y >= minY + threshold && y <= maxY - threshold;
    return inside && !deepInside;
  }

  if (path.type === "eraser" || !path.type || path.type === "freehand") {
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
export const distToSegment = (px, py, x1, y1, x2, y2) => {
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
export const offsetPath = (path, dx, dy) => {
  if (path.type === "text" || path.type === "dot") {
    path.position.x += dx;
    path.position.y += dy;
  } else if (path.type === "arrow" || path.type === "line" || path.type === "rect" || path.type === "rectstroke" || path.type === "oval" || path.type === "ovalfill") {
    path.from.x += dx;
    path.from.y += dy;
    path.to.x += dx;
    path.to.y += dy;
  } else if (path.points && path.points.length > 0) {
    for (const pt of path.points) {
      pt.x += dx;
      pt.y += dy;
    }
  }
};

// Show an inline text input overlay on the canvas for the text tool
export const showTextInput = (drop, canvas, normX, normY, clientX, clientY) => {
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

  const dropRect = drop.getBoundingClientRect();
  input.style.left = (clientX - dropRect.left) + "px";
  input.style.top = (clientY - dropRect.top) + "px";

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
        data.redoStack.length = 0;
      }
      const dpr = window.devicePixelRatio || 1;
      redrawCanvas(canvas, dpr);
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

  input.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });
};

// Initialize a drawing canvas for a drop zone
export const initDrawingCanvas = (drop) => {
  const canvas = document.createElement("canvas");
  canvas.className = "drawing-canvas";
  drop.appendChild(canvas);

  // Preview canvas for in-progress shape rendering
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
    if (data) {
      data.paths = [];
      data.redoStack.length = 0;
    }
    const dpr = window.devicePixelRatio || 1;
    redrawCanvas(canvas, dpr);
  });
  drop.appendChild(clearBtn);

  // Initialize data store
  state.canvasDataMap.set(canvas, { paths: [], redoStack: [] });

  // Resize canvas to match drop zone
  const resizeCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
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

  const observer = new ResizeObserver(resizeCanvas);
  observer.observe(drop);
  state.canvasObservers.set(canvas, observer);

  // Helper: clear the preview canvas
  const clearPreview = () => {
    const ctx = previewCanvas.getContext("2d");
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  };

  // Helper: compute content metrics using cached rects
  const getContentMetrics = (dpr) => {
    return getCanvasContentMetrics(canvas, dpr, {
      img: cachedImg,
      imgRect: cachedImgRect,
      canvasRect: cachedCanvasRect,
      fitRect: cachedFitRect,
    });
  };

  // Helper: commit a new path and clear the redo stack
  const commitPath = (path) => {
    const data = state.canvasDataMap.get(canvas);
    if (!data) return;
    data.paths.push(path);
    data.redoStack.length = 0;
  };

  // Drawing state
  let isDrawing = false;
  let currentPath = null;
  let arrowStart = null;
  // Move tool state
  let movingPath = null;
  let moveStartX = 0;
  let moveStartY = 0;

  // Cached bounding rects
  let cachedImgRect = null;
  let cachedCanvasRect = null;
  let cachedFitRect = null;
  let cachedImg = null;

  const cacheRects = () => {
    cachedImg = drop.querySelector("img");
    if (cachedImg && cachedImg.src && cachedImg.style.display !== "none" && cachedImg.naturalWidth) {
      cachedImgRect = cachedImg.getBoundingClientRect();
      cachedFitRect = getObjectFitRect(cachedImg);
    } else {
      cachedImg = null;
      cachedImgRect = null;
      cachedFitRect = null;
    }
    cachedCanvasRect = canvas.getBoundingClientRect();
  };

  const clearCachedRects = () => {
    cachedImg = null;
    cachedImgRect = null;
    cachedCanvasRect = null;
    cachedFitRect = null;
  };

  // Convert clientX/clientY to normalized image-content-relative coords
  const clientToNormalized = (clientX, clientY) => {
    if (cachedImg && cachedFitRect) {
      const contentLeft = cachedImgRect.left + cachedFitRect.x;
      const contentTop = cachedImgRect.top + cachedFitRect.y;
      return {
        x: (clientX - contentLeft) / cachedFitRect.width,
        y: (clientY - contentTop) / cachedFitRect.height,
      };
    }
    return {
      x: (clientX - cachedCanvasRect.left) / cachedCanvasRect.width,
      y: (clientY - cachedCanvasRect.top) / cachedCanvasRect.height,
    };
  };

  canvas.addEventListener("mousedown", (e) => {
    if (!state.drawingMode) return;
    e.preventDefault();
    e.stopPropagation();

    setLastActiveDrawingCanvas(canvas);
    cacheRects();

    const { x, y } = clientToNormalized(e.clientX, e.clientY);

    if (state.drawTool === "text") {
      showTextInput(drop, canvas, x, y, e.clientX, e.clientY);
      return;
    }

    if (state.drawTool === "dot") {
      commitPath({
        type: "dot",
        color: state.drawColor,
        lineWidth: state.drawLineWidth,
        position: { x, y },
      });
      const dpr = window.devicePixelRatio || 1;
      redrawCanvas(canvas, dpr);
      return;
    }

    if (state.drawTool === "object-eraser") {
      const data = state.canvasDataMap.get(canvas);
      if (data && data.paths.length > 0) {
        for (let i = data.paths.length - 1; i >= 0; i--) {
          if (hitTestPath(data.paths[i], x, y)) {
            data.paths.splice(i, 1);
            data.redoStack.length = 0;
            const dpr = window.devicePixelRatio || 1;
            redrawCanvas(canvas, dpr);
            break;
          }
        }
      }
      return;
    }

    if (state.drawTool === "move") {
      const data = state.canvasDataMap.get(canvas);
      if (data && data.paths.length > 0) {
        for (let i = data.paths.length - 1; i >= 0; i--) {
          if (hitTestPath(data.paths[i], x, y)) {
            movingPath = data.paths[i];
            moveStartX = x;
            moveStartY = y;
            isDrawing = true;

            const dpr = window.devicePixelRatio || 1;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const { toCanvasX, toCanvasY } = getContentMetrics(dpr);
            const zoomScale = state.gridZoom / 100;
            const staticPaths = data.paths.filter((p) => p !== movingPath);
            renderPaths(ctx, staticPaths, toCanvasX, toCanvasY, zoomScale * dpr);

            clearPreview();
            const pCtx = previewCanvas.getContext("2d");
            renderPaths(pCtx, [movingPath], toCanvasX, toCanvasY, zoomScale * dpr);
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

    let { x, y } = clientToNormalized(e.clientX, e.clientY);

    if (state.drawTool === "move" && movingPath) {
      const dx = x - moveStartX;
      const dy = y - moveStartY;
      offsetPath(movingPath, dx, dy);
      moveStartX = x;
      moveStartY = y;

      const dpr = window.devicePixelRatio || 1;
      clearPreview();
      const ctx = previewCanvas.getContext("2d");
      const { toCanvasX, toCanvasY } = getContentMetrics(dpr);
      const zoomScale = state.gridZoom / 100;
      renderPaths(ctx, [movingPath], toCanvasX, toCanvasY, zoomScale * dpr);
      return;
    }

    // Shift-constrain
    if (e.shiftKey) {
      if ((state.drawTool === "rect" || state.drawTool === "rectstroke" || state.drawTool === "oval" || state.drawTool === "ovalfill") && arrowStart) {
        let contentWidth, contentHeight;
        if (cachedImg && cachedFitRect) {
          contentWidth = cachedFitRect.width;
          contentHeight = cachedFitRect.height;
        } else {
          contentWidth = cachedCanvasRect.width;
          contentHeight = cachedCanvasRect.height;
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
            y = origin.y;
          } else {
            x = origin.x;
          }
        }
      }
    }

    if (state.drawTool === "arrow" && arrowStart) {
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

      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const points = currentPath.points;
      if (points.length >= 2) {
        const from = points[points.length - 2];
        const to = points[points.length - 1];
        const { toCanvasX, toCanvasY } = getContentMetrics(dpr);

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

    clearPreview();

    if (state.drawTool === "move" && movingPath) {
      movingPath = null;
      moveStartX = 0;
      moveStartY = 0;
      clearPreview();
      const dpr = window.devicePixelRatio || 1;
      redrawCanvas(canvas, dpr);
      clearCachedRects();
      return;
    }

    if ((state.drawTool === "arrow" || state.drawTool === "line" || state.drawTool === "rect" || state.drawTool === "rectstroke" || state.drawTool === "oval" || state.drawTool === "ovalfill") && arrowStart) {
      let { x, y } = clientToNormalized(e.clientX, e.clientY);

      // Shift-constrain on commit
      if (e.shiftKey && arrowStart) {
        if (state.drawTool === "rect" || state.drawTool === "rectstroke" || state.drawTool === "oval" || state.drawTool === "ovalfill") {
          let contentWidth, contentHeight;
          if (cachedImg && cachedFitRect) {
            contentWidth = cachedFitRect.width;
            contentHeight = cachedFitRect.height;
          } else {
            contentWidth = cachedCanvasRect.width;
            contentHeight = cachedCanvasRect.height;
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

      const dx = x - arrowStart.x;
      const dy = y - arrowStart.y;
      if (Math.sqrt(dx * dx + dy * dy) > 0.005) {
        commitPath({
          type: state.drawTool,
          color: state.drawColor,
          lineWidth: state.drawLineWidth,
          from: arrowStart,
          to: { x, y },
        });
      }
      arrowStart = null;
      const dpr = window.devicePixelRatio || 1;
      redrawCanvas(canvas, dpr);
    } else {
      if (currentPath && currentPath.points.length > 1) {
        commitPath(currentPath);
      }
      currentPath = null;
    }
    clearCachedRects();
  };

  canvas.addEventListener("mouseup", endDraw);
  canvas.addEventListener("mouseleave", endDraw);

  return canvas;
};

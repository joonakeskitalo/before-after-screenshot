import state from './state.js';
import { getObjectFitRect, getCanvasContentMetrics, redrawCanvas } from './drawing-render.js';
import { setLastActiveDrawingCanvas } from './drawing-tools.js';
import { getToolStrategy } from './drawing-strategies.js';
import { TOOL_NAMES } from './constants.js';

// Re-export hit-test utilities so the public API of this module is unchanged.
export { hitTestPath, distToSegment, offsetPath } from './drawing-hit-test.js';

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

  const cleanup = () => {
    input.removeEventListener("blur", onBlur);
    input.remove();
    measurer.remove();
  };

  const commitText = () => {
    if (!input.parentNode) return;
    const text = input.value.trim();
    if (text) {
      const data = state.canvasDataMap.get(canvas);
      if (data) {
        data.paths.push({
          type: TOOL_NAMES.TEXT,
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
    cleanup();
  };

  const onBlur = () => {
    commitText();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitText();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cleanup();
    }
    e.stopPropagation();
  });

  input.addEventListener("blur", onBlur);

  input.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });
};

// --- Canvas Initialization ---

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

  // --- Resize handling (debounced with rAF) ---
  let resizeRafId = null;
  const resizeCanvas = () => {
    if (resizeRafId) return;
    resizeRafId = requestAnimationFrame(() => {
      resizeRafId = null;
      const dpr = window.devicePixelRatio || 1;
      const w = drop.clientWidth;
      const h = drop.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      previewCanvas.width = w * dpr;
      previewCanvas.height = h * dpr;
      previewCanvas.style.width = w + "px";
      previewCanvas.style.height = h + "px";
      redrawCanvas(canvas, dpr);
    });
  };

  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(drop);
  state.canvasObservers.set(canvas, resizeObserver);

  const visibilityObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && (canvas.width === 0 || canvas.height === 0)) {
        resizeCanvas();
      }
    }
  });
  visibilityObserver.observe(drop);
  state.canvasVisibilityObservers.set(canvas, visibilityObserver);

  let dprMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  const handleDprChange = () => {
    resizeCanvas();
    dprMediaQuery.removeEventListener("change", handleDprChange);
    dprMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprMediaQuery.addEventListener("change", handleDprChange);
  };
  dprMediaQuery.addEventListener("change", handleDprChange);

  // --- Shared drawing infrastructure ---
  let isDrawing = false;
  let activeStrategy = null;
  let previewRAF = null;

  // Cached bounding rects (populated on mousedown, cleared on mouseup)
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

  const clearPreview = () => {
    const ctx = previewCanvas.getContext("2d");
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  };

  const getContentMetrics = (dpr) => {
    return getCanvasContentMetrics(canvas, dpr, {
      img: cachedImg,
      imgRect: cachedImgRect,
      canvasRect: cachedCanvasRect,
      fitRect: cachedFitRect,
    });
  };

  const commitPath = (path) => {
    const data = state.canvasDataMap.get(canvas);
    if (!data) return;
    data.paths.push(path);
    data.redoStack.length = 0;
  };

  // Schedule a rAF-throttled preview redraw
  const schedulePreviewRAF = (fn) => {
    if (!previewRAF) {
      previewRAF = requestAnimationFrame(() => {
        previewRAF = null;
        fn();
      });
    }
  };

  // Context object passed to strategies — provides access to shared infrastructure
  const makeContext = (e) => ({
    drop,
    canvas,
    previewCanvas,
    normX: 0,
    normY: 0,
    clientX: e.clientX,
    clientY: e.clientY,
    shiftKey: e.shiftKey,
    clientToNormalized,
    getContentMetrics,
    clearPreview,
    clearCachedRects,
    commitPath,
    schedulePreviewRAF,
    showTextInput,
    cachedImg,
    cachedFitRect,
    cachedCanvasRect,
  });

  // --- Event Handlers ---
  canvas.addEventListener("mousedown", (e) => {
    if (!state.drawingMode) return;
    e.preventDefault();
    e.stopPropagation();

    setLastActiveDrawingCanvas(canvas);
    cacheRects();

    const { x, y } = clientToNormalized(e.clientX, e.clientY);
    const strategy = getToolStrategy(state.drawTool);

    const ctx = makeContext(e);
    ctx.normX = x;
    ctx.normY = y;

    const shouldTrack = strategy.onMouseDown(ctx);
    if (shouldTrack) {
      isDrawing = true;
      activeStrategy = strategy;
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!isDrawing || !activeStrategy) return;
    e.preventDefault();
    e.stopPropagation();

    const { x, y } = clientToNormalized(e.clientX, e.clientY);
    const ctx = makeContext(e);
    ctx.normX = x;
    ctx.normY = y;

    activeStrategy.onMouseMove(ctx);
  });

  const endDraw = (e) => {
    if (!isDrawing || !activeStrategy) return;
    isDrawing = false;

    if (previewRAF) {
      cancelAnimationFrame(previewRAF);
      previewRAF = null;
    }

    const ctx = makeContext(e);
    const { x, y } = clientToNormalized(e.clientX, e.clientY);
    ctx.normX = x;
    ctx.normY = y;

    activeStrategy.onMouseUp(ctx);
    activeStrategy = null;
  };

  canvas.addEventListener("mouseup", endDraw);

  const docMouseUp = (e) => {
    if (!isDrawing) return;
    endDraw(e);
  };
  document.addEventListener("mouseup", docMouseUp);
  state.canvasMouseUpHandlers.set(canvas, docMouseUp);

  return canvas;
};

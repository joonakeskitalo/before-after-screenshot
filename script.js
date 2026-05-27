let root = document.documentElement;

const cardsEl = document.getElementById("cards");
const gridEl = document.getElementById("grid");
const content = document.querySelector(".content");

const elementsToAdjustWidth = [cardsEl, content];

let gridCols = 3;
let gridRows = 1;

const setElementWidths = (arr, size) => {
  const images = cardsEl.querySelectorAll("img");
  const drops = cardsEl.querySelectorAll("div.drop");

  const elements = [...arr, ...images, ...drops].filter(
    (el) => el.tagName !== "TEXTAREA",
  );

  elements.forEach((x) => {
    x.style.width = size;
    x.style.height = size;
  });
};

const copyAsImage = async (useFullSize = false, resolutionScale = 1) => {
  try {
    root.style.setProperty("--image-max-width", "unset");

    // Remove overflow and size constraints so nothing gets clipped
    const allCells = gridEl.querySelectorAll(".grid-cell");
    allCells.forEach((cell) => {
      cell.style.overflow = "visible";
      cell.style.minHeight = "unset";
    });

    // Let images size naturally for the capture
    const allImages = cardsEl.querySelectorAll("img");
    allImages.forEach((img) => {
      if (img.src && img.style.display !== "none") {
        img.style.objectFit = "contain";
        img.style.height = "auto";
        img.style.maxHeight = "unset";
      }
    });

    // Remove height constraint on drop zones
    const allDrops = cardsEl.querySelectorAll(".drop");
    allDrops.forEach((drop) => {
      drop.style.overflow = "visible";
      drop.style.height = "auto";
    });

    root.style.setProperty("--border", `unset`);
    gridEl.style.outline = "none";

    // Reset zoom for capture
    const prevZoom = gridZoom;
    root.style.setProperty("--image-max-width", "unset");
    root.style.setProperty("--gap", `96px`);
    root.style.setProperty("--text-fontsize", `15pt`);
    root.style.setProperty("--grid-zoom-cell-height", `300px`);

    if (useFullSize) {
      const baseFontSize = 15;
      const fontSize = Math.max(baseFontSize, Math.floor(baseFontSize * resolutionScale * 3));
      root.style.setProperty("--text-fontsize", `${fontSize}pt`);

      const gap = 192 * resolutionScale;
      root.style.setProperty("--gap", `${gap}px`);

      // Collapse empty drops
      allDrops.forEach((drop) => {
        const img = drop.querySelector("img");
        if (!img || !img.src || img.style.display === "none") {
          drop.style.width = "32px";
          drop.style.height = "32px";
        }
      });

      allImages.forEach((img) => {
        if (img.src && img.style.display !== "none") {
          img.style.width =
            Math.floor(img.naturalWidth * resolutionScale) + "px";
          img.style.height = "auto";
        }
      });
    }

    // Remove fixed grid row sizing so rows expand to fit content
    gridEl.style.gridTemplateRows = "auto";
    // Use auto-sized columns for capture so they don't overlap with fit-content
    gridEl.style.gridTemplateColumns = `repeat(${gridCols}, auto)`;

    const initialPadding = useFullSize ? 192 : 64;
    const padding = Math.floor(initialPadding * resolutionScale);

    cardsEl.style.padding = `8px ${padding}px`;
    cardsEl.style.width = "fit-content";

    // Hide drawing controls during export (not needed — controls are in toolbar now)

    // Redraw canvases at export scale so drawings match the scaled images
    const exportScale = useFullSize ? resolutionScale : 1;
    redrawAllCanvasesForExport(exportScale);

    const blob = await domtoimage.toBlob(cardsEl, {
      filter: (node) => {
        if (node.tagName === "IMG" && !node.src.startsWith("data:")) {
          return false;
        }
        if (node.tagName === "SPAN") return false;
        if (node.classList && node.classList.contains("clear-drawing-btn")) return false;
        if (node.classList && node.classList.contains("drawing-text-input")) return false;
        if (node.tagName === "CANVAS" && node.style.display === "none") return false;
        return true;
      },
    });

    navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);

    // Restore all styles

    allCells.forEach((cell) => {
      cell.style.overflow = null;
      cell.style.minHeight = null;
    });

    allImages.forEach((img) => {
      img.style.objectFit = null;
      img.style.height = null;
      img.style.maxHeight = null;
      img.style.width = null;
    });

    allDrops.forEach((drop) => {
      drop.style.overflow = null;
      drop.style.height = null;
      drop.style.width = null;
    });

    cardsEl.style.padding = "16px";
    cardsEl.style.width = null;
    gridEl.style.outline = null;
    gridEl.style.gridTemplateRows = `repeat(${gridRows}, 1fr)`;
    root.style.setProperty("--border", `1px dashed rgb(167, 165, 165)`);

    // Restore zoom (also restores gridTemplateColumns, --image-max-width, --gap, etc.)
    applyGridZoom(prevZoom);

    // Restore drawing canvases to display size
    restoreAllCanvases();
  } catch (error) {
    console.error(error);
  }
};

const copyWithScale = () => {
  const select = document.getElementById("copy-scale");
  const scale = parseFloat(select.value);
  if (scale >= 1) {
    copyAsImage(false);
  } else {
    copyAsImage(true, scale);
  }
};

const attachDragTo = (img) => {
  if (!img) return;
  img.draggable = true;
  img.addEventListener("dragstart", (e) => {
    if (!img.id) {
      img.id = `drop-img-${Math.random().toString(36).slice(2)}`;
    }

    const cell = e.target.closest(".grid-cell");
    const textArea = cell ? cell.querySelector("textarea") : null;

    // Serialize drawing paths from the source cell's canvas
    const canvas = cell ? cell.querySelector(".drawing-canvas") : null;
    const drawingData = canvas && canvasDataMap.get(canvas) ? canvasDataMap.get(canvas).paths : [];

    e.dataTransfer.setData("text/plain", img.src);
    e.dataTransfer.setData("id", img.id);
    e.dataTransfer.setData("note", textArea ? textArea.value : "");
    e.dataTransfer.setData("drawings", JSON.stringify(drawingData));
    e.dataTransfer.effectAllowed = "move";
  });
};

const clearOrCopyImage = async (event, img, drop, span) => {
  event.preventDefault();
  event.stopImmediatePropagation();

  // if (event.shiftKey && event.metaKey) {
  //   setElementWidths(elementsToAdjustWidth, "unset");
  //   root.style.setProperty("--image-max-width", "unset");

  //   const blob = await domtoimage.toBlob(img);

  //   navigator.clipboard.write([
  //     new ClipboardItem({
  //       "image/png": blob,
  //     }),
  //   ]);

  //   root.style.setProperty("--image-max-width", "60dvh");
  //   setElementWidths(elementsToAdjustWidth, null);
  // }

  // if (event.metaKey && !event.shiftKey) {
  //   setElementWidths(elementsToAdjustWidth, "unset");
  //   root.style.setProperty("--image-max-width", "unset");

  //   const width = Math.floor(img.naturalWidth * 0.5) + "px";
  //   img.style.width = width;

  //   const blob = await domtoimage.toBlob(img);

  //   navigator.clipboard.write([
  //     new ClipboardItem({
  //       "image/png": blob,
  //     }),
  //   ]);

  //   img.style.width = null;
  //   root.style.setProperty("--image-max-width", "60dvh");
  //   setElementWidths(elementsToAdjustWidth, null);
  // } else if (!event.metaKey && event.shiftKey) {
  //   img.src = "";
  //   img.style.display = "none";
  //   drop.style.border = "var(--border)";
  //   span.style.display = "block";
  // }

  if (event.metaKey) {
    img.src = "";
    img.style.display = "none";
    drop.style.border = "var(--border)";
    span.style.display = "block";
  }
};

// --- Drawing Logic ---
let drawingMode = false;
let drawColor = "#ff0000";
let drawLineWidth = 2;
let drawTool = "freehand"; // "freehand", "arrow", "line", "rect", "rectstroke", "oval", "ovalfill", "dot", "eraser", or "text"
let drawFontSize = 13;

const enableDrawingMode = () => {
  drawingMode = true;
  document.body.classList.add("drawing-mode");
  if (drawTool === "text") document.body.classList.add("text-tool");
  document.querySelectorAll(".drawing-canvas").forEach((c) => c.classList.add("active"));
};

const disableDrawingMode = () => {
  drawingMode = false;
  document.body.classList.remove("drawing-mode");
  document.body.classList.remove("text-tool");
  document.body.classList.remove("eraser-tool");
  document.querySelectorAll(".drawing-canvas").forEach((c) => c.classList.remove("active"));
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
const textModeBtn = document.getElementById("text-mode-btn");
const drawFontSizeInput = document.getElementById("draw-font-size");

// Exit drawing mode with Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && drawingMode) {
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
    textModeBtn.classList.remove("active");
    drawFontSizeInput.style.display = "none";
    document.body.classList.remove("text-tool");
  }
});



// Wire up toolbar drawing controls
const drawColorInput = document.getElementById("draw-color");

drawColorInput.addEventListener("input", (e) => {
  drawColor = e.target.value;
  document.querySelectorAll(".toolbar-controls .preset-color-btn").forEach((b) => {
    b.style.borderColor = b.dataset.color === drawColor ? "#333" : "transparent";
  });
});

document.querySelectorAll(".thickness-presets .thickness-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    drawLineWidth = parseInt(btn.dataset.width);
    document.querySelectorAll(".thickness-presets .thickness-btn").forEach((b) => {
      b.classList.remove("active");
    });
    btn.classList.add("active");
  });
});

document.querySelectorAll(".toolbar-controls .preset-color-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    drawColor = btn.dataset.color;
    drawColorInput.value = drawColor;
    document.querySelectorAll(".toolbar-controls .preset-color-btn").forEach((b) => {
      b.style.borderColor = b.dataset.color === drawColor ? "#333" : "transparent";
    });
  });
});

// Pen mode toggle
penModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (drawTool === "freehand" && drawingMode) {
    disableDrawingMode();
    penModeBtn.classList.remove("active");
  } else {
    drawTool = "freehand";
    penModeBtn.classList.add("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    drawFontSizeInput.style.display = "none";
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    enableDrawingMode();
  }
});

// Arrow mode toggle
arrowModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (drawTool === "arrow" && drawingMode) {
    disableDrawingMode();
    arrowModeBtn.classList.remove("active");
  } else {
    drawTool = "arrow";
    arrowModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    drawFontSizeInput.style.display = "none";
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    enableDrawingMode();
  }
});

// Line mode toggle
lineModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (drawTool === "line" && drawingMode) {
    disableDrawingMode();
    lineModeBtn.classList.remove("active");
  } else {
    drawTool = "line";
    lineModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    drawFontSizeInput.style.display = "none";
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    enableDrawingMode();
  }
});

// Solid rectangle mode toggle
rectModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (drawTool === "rect" && drawingMode) {
    disableDrawingMode();
    rectModeBtn.classList.remove("active");
  } else {
    drawTool = "rect";
    rectModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    drawFontSizeInput.style.display = "none";
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    enableDrawingMode();
  }
});

// Bordered rectangle mode toggle
rectstrokeModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (drawTool === "rectstroke" && drawingMode) {
    disableDrawingMode();
    rectstrokeModeBtn.classList.remove("active");
  } else {
    drawTool = "rectstroke";
    rectstrokeModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    drawFontSizeInput.style.display = "none";
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    enableDrawingMode();
  }
});

// Oval mode toggle
ovalModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (drawTool === "oval" && drawingMode) {
    disableDrawingMode();
    ovalModeBtn.classList.remove("active");
  } else {
    drawTool = "oval";
    ovalModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    drawFontSizeInput.style.display = "none";
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    enableDrawingMode();
  }
});

// Solid oval mode toggle
ovalfillModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (drawTool === "ovalfill" && drawingMode) {
    disableDrawingMode();
    ovalfillModeBtn.classList.remove("active");
  } else {
    drawTool = "ovalfill";
    ovalfillModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    drawFontSizeInput.style.display = "none";
    document.body.classList.remove("text-tool");
    document.body.classList.remove("eraser-tool");
    enableDrawingMode();
  }
});

// Dot mode toggle
dotModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (drawTool === "dot" && drawingMode) {
    disableDrawingMode();
    dotModeBtn.classList.remove("active");
  } else {
    drawTool = "dot";
    dotModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    eraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    drawFontSizeInput.style.display = "none";
    document.body.classList.remove("text-tool");
    enableDrawingMode();
  }
});

// Eraser mode toggle
eraserModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (drawTool === "eraser" && drawingMode) {
    disableDrawingMode();
    eraserModeBtn.classList.remove("active");
    document.body.classList.remove("eraser-tool");
  } else {
    drawTool = "eraser";
    eraserModeBtn.classList.add("active");
    penModeBtn.classList.remove("active");
    arrowModeBtn.classList.remove("active");
    lineModeBtn.classList.remove("active");
    rectModeBtn.classList.remove("active");
    rectstrokeModeBtn.classList.remove("active");
    ovalModeBtn.classList.remove("active");
    ovalfillModeBtn.classList.remove("active");
    dotModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    drawFontSizeInput.style.display = "none";
    document.body.classList.remove("text-tool");
    document.body.classList.add("eraser-tool");
    enableDrawingMode();
  }
});

// Text mode toggle
textModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (drawTool === "text" && drawingMode) {
    disableDrawingMode();
    textModeBtn.classList.remove("active");
    drawFontSizeInput.style.display = "none";
    document.body.classList.remove("text-tool");
  } else {
    drawTool = "text";
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
    drawFontSizeInput.style.display = "";
    document.body.classList.remove("eraser-tool");
    enableDrawingMode();
  }
});

drawFontSizeInput.addEventListener("input", (e) => {
  drawFontSize = parseInt(e.target.value) || 13;
});

// Each canvas stores its paths as normalized coordinates (0-1 range relative to the IMAGE)
// Each canvas stores its paths as normalized coordinates (0-1 range relative to the
// visible image content area), accounting for object-fit: contain.
const canvasDataMap = new WeakMap(); // canvas element -> { paths: [...] }

// Store ResizeObservers so we can disconnect them during export
const canvasObservers = new WeakMap(); // canvas element -> ResizeObserver

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
  const data = canvasDataMap.get(canvas);
  if (!data) return;

  const drop = canvas.parentElement;
  const img = drop ? drop.querySelector("img") : null;

  // Calculate where the visible image content sits within the canvas
  let contentOffsetX = 0, contentOffsetY = 0, contentWidth = canvas.width / dpr, contentHeight = canvas.height / dpr;
  if (drop && img && img.src && img.style.display !== "none" && img.naturalWidth) {
    const fitRect = getObjectFitRect(img);
    contentOffsetX = fitRect.x;
    contentOffsetY = fitRect.y;
    contentWidth = fitRect.width;
    contentHeight = fitRect.height;
  }

  for (const path of data.paths) {
    ctx.strokeStyle = path.color;
    ctx.lineWidth = path.lineWidth * dpr;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const toCanvasX = (ix) => (contentOffsetX + ix * contentWidth) * dpr;
    const toCanvasY = (iy) => (contentOffsetY + iy * contentHeight) * dpr;

    if (path.type === "text") {
      // Draw text annotation (multiline support)
      const fontSize = (path.fontSize || 13) * dpr;
      const lineHeight = fontSize * 1.3;
      ctx.font = `500 ${fontSize}px "Inter", system-ui, sans-serif`;
      ctx.textBaseline = "top";
      const x = toCanvasX(path.position.x);
      const y = toCanvasY(path.position.y);
      const lines = path.text.split("\n");
      // Measure widest line for background
      const maxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const totalHeight = fontSize + (lines.length - 1) * lineHeight;
      const padding = 4 * dpr;
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

      drawArrow(ctx, fromX, fromY, toX, toY, path.lineWidth * dpr);
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
      const radius = (path.lineWidth + 4) * dpr;
      ctx.globalAlpha = 0.8;
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
      ctx.lineWidth = (path.lineWidth + 10) * dpr;
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
  input.style.border = `1px solid ${drawColor}`;
  input.style.borderRadius = "4px";
  input.style.padding = "2px 6px";
  input.style.fontSize = drawFontSize + "px";
  input.style.fontWeight = "500";
  input.style.fontFamily = "Inter, system-ui, sans-serif";
  input.style.color = drawColor;
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
  measurer.style.fontSize = drawFontSize + "px";
  measurer.style.fontWeight = "500";
  measurer.style.fontFamily = "Inter, system-ui, sans-serif";
  measurer.style.padding = "2px 6px";
  drop.appendChild(measurer);

  const resizeInput = () => {
    const lines = input.value.split("\n");
    const longestLine = lines.reduce((a, b) => a.length > b.length ? a : b, " ");
    measurer.textContent = longestLine || " ";
    input.style.width = Math.max(20, measurer.offsetWidth + 4) + "px";
    input.style.height = (lines.length * drawFontSize * 1.3 + 12) + "px";
  };

  drop.appendChild(input);
  input.focus();

  input.addEventListener("input", resizeInput);

  const commitText = () => {
    const text = input.value.trim();
    if (text) {
      const data = canvasDataMap.get(canvas);
      if (data) {
        data.paths.push({
          type: "text",
          color: drawColor,
          fontSize: drawFontSize,
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
      input.remove();
      measurer.remove();
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

const initDrawingCanvas = (drop) => {
  const canvas = document.createElement("canvas");
  canvas.className = "drawing-canvas";
  drop.appendChild(canvas);

  // Clear drawing button
  const clearBtn = document.createElement("button");
  clearBtn.className = "clear-drawing-btn";
  clearBtn.title = "Clear drawing";
  clearBtn.textContent = "✕";
  clearBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const data = canvasDataMap.get(canvas);
    if (data) data.paths = [];
    const dpr = window.devicePixelRatio || 1;
    redrawCanvas(canvas, dpr);
  });
  drop.appendChild(clearBtn);

  // Initialize data store
  canvasDataMap.set(canvas, { paths: [] });

  // Resize canvas to match drop zone
  const resizeCanvas = () => {
    const rect = drop.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    redrawCanvas(canvas, dpr);
  };

  // Use ResizeObserver to keep canvas sized correctly
  const observer = new ResizeObserver(resizeCanvas);
  observer.observe(drop);
  canvasObservers.set(canvas, observer);

  // Drawing state
  let isDrawing = false;
  let currentPath = null;
  let arrowStart = null;

  canvas.addEventListener("mousedown", (e) => {
    if (!drawingMode) return;
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

    if (drawTool === "text") {
      // Show an inline input to type text at the clicked position
      showTextInput(drop, canvas, x, y, e.clientX, e.clientY);
      return;
    }

    if (drawTool === "dot") {
      // Place a small dot immediately at the click position
      const data = canvasDataMap.get(canvas);
      if (data) {
        data.paths.push({
          type: "dot",
          color: drawColor,
          lineWidth: drawLineWidth,
          position: { x, y },
        });
        const dpr = window.devicePixelRatio || 1;
        redrawCanvas(canvas, dpr);
      }
      return;
    }

    isDrawing = true;

    if (drawTool === "arrow" || drawTool === "line" || drawTool === "rect" || drawTool === "rectstroke" || drawTool === "oval" || drawTool === "ovalfill") {
      arrowStart = { x, y };
    } else {
      currentPath = {
        type: drawTool === "eraser" ? "eraser" : undefined,
        color: drawColor,
        lineWidth: drawLineWidth,
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

    if (drawTool === "arrow" && arrowStart) {
      // Preview the arrow by redrawing existing paths + the in-progress arrow
      const dpr = window.devicePixelRatio || 1;
      redrawCanvas(canvas, dpr);

      // Draw preview arrow
      const ctx = canvas.getContext("2d");
      let contentOffsetX = 0, contentOffsetY = 0, contentWidth = canvas.width / dpr, contentHeight = canvas.height / dpr;
      if (img && img.src && img.style.display !== "none" && img.naturalWidth) {
        const fitRect = getObjectFitRect(img);
        contentOffsetX = fitRect.x;
        contentOffsetY = fitRect.y;
        contentWidth = fitRect.width;
        contentHeight = fitRect.height;
      }
      const toCanvasX = (ix) => (contentOffsetX + ix * contentWidth) * dpr;
      const toCanvasY = (iy) => (contentOffsetY + iy * contentHeight) * dpr;

      ctx.strokeStyle = drawColor;
      ctx.lineWidth = drawLineWidth * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      drawArrow(ctx, toCanvasX(arrowStart.x), toCanvasY(arrowStart.y), toCanvasX(x), toCanvasY(y), drawLineWidth * dpr);
    } else if (drawTool === "line" && arrowStart) {
      // Preview straight line
      const dpr = window.devicePixelRatio || 1;
      redrawCanvas(canvas, dpr);

      const ctx = canvas.getContext("2d");
      let contentOffsetX = 0, contentOffsetY = 0, contentWidth = canvas.width / dpr, contentHeight = canvas.height / dpr;
      if (img && img.src && img.style.display !== "none" && img.naturalWidth) {
        const fitRect = getObjectFitRect(img);
        contentOffsetX = fitRect.x;
        contentOffsetY = fitRect.y;
        contentWidth = fitRect.width;
        contentHeight = fitRect.height;
      }
      const toCanvasX = (ix) => (contentOffsetX + ix * contentWidth) * dpr;
      const toCanvasY = (iy) => (contentOffsetY + iy * contentHeight) * dpr;

      ctx.strokeStyle = drawColor;
      ctx.lineWidth = drawLineWidth * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(toCanvasX(arrowStart.x), toCanvasY(arrowStart.y));
      ctx.lineTo(toCanvasX(x), toCanvasY(y));
      ctx.stroke();
    } else if (drawTool === "rect" && arrowStart) {
      // Preview solid rectangle
      const dpr = window.devicePixelRatio || 1;
      redrawCanvas(canvas, dpr);

      const ctx = canvas.getContext("2d");
      let contentOffsetX = 0, contentOffsetY = 0, contentWidth = canvas.width / dpr, contentHeight = canvas.height / dpr;
      if (img && img.src && img.style.display !== "none" && img.naturalWidth) {
        const fitRect = getObjectFitRect(img);
        contentOffsetX = fitRect.x;
        contentOffsetY = fitRect.y;
        contentWidth = fitRect.width;
        contentHeight = fitRect.height;
      }
      const toCanvasX = (ix) => (contentOffsetX + ix * contentWidth) * dpr;
      const toCanvasY = (iy) => (contentOffsetY + iy * contentHeight) * dpr;

      const rx = toCanvasX(Math.min(arrowStart.x, x));
      const ry = toCanvasY(Math.min(arrowStart.y, y));
      const rw = toCanvasX(Math.max(arrowStart.x, x)) - rx;
      const rh = toCanvasY(Math.max(arrowStart.y, y)) - ry;
      ctx.fillStyle = drawColor;
      ctx.fillRect(rx, ry, rw, rh);
    } else if (drawTool === "rectstroke" && arrowStart) {
      // Preview bordered rectangle
      const dpr = window.devicePixelRatio || 1;
      redrawCanvas(canvas, dpr);

      const ctx = canvas.getContext("2d");
      let contentOffsetX = 0, contentOffsetY = 0, contentWidth = canvas.width / dpr, contentHeight = canvas.height / dpr;
      if (img && img.src && img.style.display !== "none" && img.naturalWidth) {
        const fitRect = getObjectFitRect(img);
        contentOffsetX = fitRect.x;
        contentOffsetY = fitRect.y;
        contentWidth = fitRect.width;
        contentHeight = fitRect.height;
      }
      const toCanvasX = (ix) => (contentOffsetX + ix * contentWidth) * dpr;
      const toCanvasY = (iy) => (contentOffsetY + iy * contentHeight) * dpr;

      const rx = toCanvasX(Math.min(arrowStart.x, x));
      const ry = toCanvasY(Math.min(arrowStart.y, y));
      const rw = toCanvasX(Math.max(arrowStart.x, x)) - rx;
      const rh = toCanvasY(Math.max(arrowStart.y, y)) - ry;
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = drawLineWidth * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeRect(rx, ry, rw, rh);
    } else if (drawTool === "oval" && arrowStart) {
      // Preview oval
      const dpr = window.devicePixelRatio || 1;
      redrawCanvas(canvas, dpr);

      const ctx = canvas.getContext("2d");
      let contentOffsetX = 0, contentOffsetY = 0, contentWidth = canvas.width / dpr, contentHeight = canvas.height / dpr;
      if (img && img.src && img.style.display !== "none" && img.naturalWidth) {
        const fitRect = getObjectFitRect(img);
        contentOffsetX = fitRect.x;
        contentOffsetY = fitRect.y;
        contentWidth = fitRect.width;
        contentHeight = fitRect.height;
      }
      const toCanvasX = (ix) => (contentOffsetX + ix * contentWidth) * dpr;
      const toCanvasY = (iy) => (contentOffsetY + iy * contentHeight) * dpr;

      const rx = toCanvasX(Math.min(arrowStart.x, x));
      const ry = toCanvasY(Math.min(arrowStart.y, y));
      const rw = toCanvasX(Math.max(arrowStart.x, x)) - rx;
      const rh = toCanvasY(Math.max(arrowStart.y, y)) - ry;
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = drawLineWidth * dpr;
      ctx.beginPath();
      ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (drawTool === "ovalfill" && arrowStart) {
      // Preview solid oval
      const dpr = window.devicePixelRatio || 1;
      redrawCanvas(canvas, dpr);

      const ctx = canvas.getContext("2d");
      let contentOffsetX = 0, contentOffsetY = 0, contentWidth = canvas.width / dpr, contentHeight = canvas.height / dpr;
      if (img && img.src && img.style.display !== "none" && img.naturalWidth) {
        const fitRect = getObjectFitRect(img);
        contentOffsetX = fitRect.x;
        contentOffsetY = fitRect.y;
        contentWidth = fitRect.width;
        contentHeight = fitRect.height;
      }
      const toCanvasX = (ix) => (contentOffsetX + ix * contentWidth) * dpr;
      const toCanvasY = (iy) => (contentOffsetY + iy * contentHeight) * dpr;

      const rx = toCanvasX(Math.min(arrowStart.x, x));
      const ry = toCanvasY(Math.min(arrowStart.y, y));
      const rw = toCanvasX(Math.max(arrowStart.x, x)) - rx;
      const rh = toCanvasY(Math.max(arrowStart.y, y)) - ry;
      ctx.fillStyle = drawColor;
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
          contentOffsetX = fitRect.x;
          contentOffsetY = fitRect.y;
          contentWidth = fitRect.width;
          contentHeight = fitRect.height;
        }
        const toCanvasX = (ix) => (contentOffsetX + ix * contentWidth) * dpr;
        const toCanvasY = (iy) => (contentOffsetY + iy * contentHeight) * dpr;

        if (currentPath.type === "eraser") {
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.strokeStyle = "rgba(0,0,0,1)";
          ctx.lineWidth = (currentPath.lineWidth + 8) * dpr;
        } else {
          ctx.strokeStyle = currentPath.color;
          ctx.lineWidth = currentPath.lineWidth * dpr;
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

    if ((drawTool === "arrow" || drawTool === "line" || drawTool === "rect" || drawTool === "rectstroke" || drawTool === "oval" || drawTool === "ovalfill") && arrowStart) {
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

      // Only commit if the shape has some size
      const dx = x - arrowStart.x;
      const dy = y - arrowStart.y;
      if (Math.sqrt(dx * dx + dy * dy) > 0.005) {
        const data = canvasDataMap.get(canvas);
        if (data) {
          data.paths.push({
            type: drawTool,
            color: drawColor,
            lineWidth: drawLineWidth,
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
        const data = canvasDataMap.get(canvas);
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
const redrawAllCanvasesForExport = (scale) => {
  // Disconnect all ResizeObservers so they don't interfere during export
  document.querySelectorAll(".drawing-canvas").forEach((canvas) => {
    const obs = canvasObservers.get(canvas);
    if (obs) obs.disconnect();
  });

  const canvases = document.querySelectorAll(".drawing-canvas");
  canvases.forEach((canvas) => {
    const drop = canvas.parentElement;
    const img = drop.querySelector("img");

    const data = canvasDataMap.get(canvas);
    if (!data || data.paths.length === 0) {
      // No drawings — just hide the canvas for export
      canvas.style.display = "none";
      return;
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
          if (path.points.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(path.points[0].x * canvas.width, path.points[0].y * canvas.height);
          for (let i = 1; i < path.points.length; i++) {
            ctx.lineTo(path.points[i].x * canvas.width, path.points[i].y * canvas.height);
          }
          ctx.stroke();
        }
      }
      return;
    }

    // Bake drawing onto the image: create a temp canvas at the image's rendered size
    // multiplied by dpr so line thickness matches what the user sees on screen.
    const imgRect = img.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = imgRect.width * dpr;
    tempCanvas.height = imgRect.height * dpr;
    const ctx = tempCanvas.getContext("2d");

    // Draw the original image at full backing-store resolution
    ctx.drawImage(img, 0, 0, imgRect.width * dpr, imgRect.height * dpr);

    // Draw paths on top — coords are already image-relative (0-1)
    for (const path of data.paths) {
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.lineWidth * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (path.type === "text") {
        const fontSize = (path.fontSize || 16) * dpr;
        const lineHeight = fontSize * 1.3;
        ctx.font = `500 ${fontSize}px "Inter", system-ui, sans-serif`;
        ctx.textBaseline = "top";
        const x = path.position.x * imgRect.width * dpr;
        const y = path.position.y * imgRect.height * dpr;
        const lines = path.text.split("\n");
        const maxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const totalHeight = fontSize + (lines.length - 1) * lineHeight;
        const padding = 4 * dpr;
        ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
        const radius = fontSize * 0.2;
        ctx.beginPath();
        ctx.roundRect(x - padding, y - padding, maxWidth + padding * 2, totalHeight + padding * 2, radius);
        ctx.fill();
        ctx.fillStyle = path.color;
        lines.forEach((line, i) => {
          ctx.fillText(line, x, y + i * lineHeight);
        });
      } else if (path.type === "arrow") {
        const fromX = path.from.x * imgRect.width * dpr;
        const fromY = path.from.y * imgRect.height * dpr;
        const toX = path.to.x * imgRect.width * dpr;
        const toY = path.to.y * imgRect.height * dpr;
        drawArrow(ctx, fromX, fromY, toX, toY, path.lineWidth * dpr);
      } else if (path.type === "line") {
        const fromX = path.from.x * imgRect.width * dpr;
        const fromY = path.from.y * imgRect.height * dpr;
        const toX = path.to.x * imgRect.width * dpr;
        const toY = path.to.y * imgRect.height * dpr;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
      } else if (path.type === "rect") {
        const rx = Math.min(path.from.x, path.to.x) * imgRect.width * dpr;
        const ry = Math.min(path.from.y, path.to.y) * imgRect.height * dpr;
        const rw = Math.abs(path.to.x - path.from.x) * imgRect.width * dpr;
        const rh = Math.abs(path.to.y - path.from.y) * imgRect.height * dpr;
        ctx.fillStyle = path.color;
        ctx.fillRect(rx, ry, rw, rh);
      } else if (path.type === "rectstroke") {
        const rx = Math.min(path.from.x, path.to.x) * imgRect.width * dpr;
        const ry = Math.min(path.from.y, path.to.y) * imgRect.height * dpr;
        const rw = Math.abs(path.to.x - path.from.x) * imgRect.width * dpr;
        const rh = Math.abs(path.to.y - path.from.y) * imgRect.height * dpr;
        ctx.strokeRect(rx, ry, rw, rh);
      } else if (path.type === "oval") {
        const rx = Math.min(path.from.x, path.to.x) * imgRect.width * dpr;
        const ry = Math.min(path.from.y, path.to.y) * imgRect.height * dpr;
        const rw = Math.abs(path.to.x - path.from.x) * imgRect.width * dpr;
        const rh = Math.abs(path.to.y - path.from.y) * imgRect.height * dpr;
        ctx.beginPath();
        ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (path.type === "ovalfill") {
        const rx = Math.min(path.from.x, path.to.x) * imgRect.width * dpr;
        const ry = Math.min(path.from.y, path.to.y) * imgRect.height * dpr;
        const rw = Math.abs(path.to.x - path.from.x) * imgRect.width * dpr;
        const rh = Math.abs(path.to.y - path.from.y) * imgRect.height * dpr;
        ctx.fillStyle = path.color;
        ctx.beginPath();
        ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (path.type === "eraser") {
        if (path.points.length < 2) continue;
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.lineWidth = (path.lineWidth + 8) * dpr;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(path.points[0].x * imgRect.width * dpr, path.points[0].y * imgRect.height * dpr);
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x * imgRect.width * dpr, path.points[i].y * imgRect.height * dpr);
        }
        ctx.stroke();
        ctx.restore();
      } else {
        if (path.points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(path.points[0].x * imgRect.width * dpr, path.points[0].y * imgRect.height * dpr);
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x * imgRect.width * dpr, path.points[i].y * imgRect.height * dpr);
        }
        ctx.stroke();
      }
    }

    // Store original src for restoration
    canvas.dataset.originalImgSrc = img.src;
    // Replace image with composited version
    img.src = tempCanvas.toDataURL("image/png");
    // Hide the canvas so dom-to-image doesn't double-render the drawing
    canvas.style.display = "none";
  });
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
    }

    // Show canvas again
    canvas.style.display = "";

    // Resize to current display dimensions
    const rect = drop.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    redrawCanvas(canvas, dpr);

    // Reconnect ResizeObserver
    const obs = canvasObservers.get(canvas);
    if (obs) obs.observe(drop);
  });
};

const setupCell = (cell) => {
  const drop = cell.querySelector(".drop");
  const img = cell.querySelector("img");
  const span = cell.querySelector("span");

  // Initialize drawing canvas for this cell
  initDrawingCanvas(drop);

  img.addEventListener(
    "click",
    async (e) => await clearOrCopyImage(e, img, drop, span),
  );

  drop.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();

    if (e.metaKey) {
      // Clear the cell content
      img.src = "";
      img.style.display = "none";
      drop.style.border = "var(--border)";
      span.style.display = "block";
      const textarea = cell.querySelector("textarea");
      if (textarea) textarea.value = "";
    }
  });

  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });

  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    drop.style.border = "unset";

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = function () {
        img.style.display = "flex";
        img.src = this.result;
        img.alt = droppedFile.name;
        span.style.display = "none";
      };
      reader.readAsDataURL(droppedFile);
      return;
    }

    const src = e.dataTransfer.getData("text/plain");
    if (src) {
      // Check if dragged from toolbar — insert from toolbar
      const source = e.dataTransfer.getData("source");
      const draggedId = e.dataTransfer.getData("id");
      if (source === "toolbar" && draggedId) {
        img.style.display = "flex";
        img.src = src;
        img.alt = "";
        span.style.display = "none";
        removeToolbarItemById(draggedId);
        return;
      }

      // Dragged from another grid cell — swap the two cells
      if (draggedId) {
        const srcImg = document.getElementById(draggedId);
        if (srcImg && srcImg !== img) {
          const srcCell = srcImg.closest(".grid-cell");
          if (srcCell && srcCell !== cell) {
            swapCells(cell, srcCell);
            return;
          }
        }
      }

      // Fallback: just set the image (e.g. external drop)
      img.style.display = "flex";
      img.src = src;
      img.alt = "";
      span.style.display = "none";
    }
  });

  attachDragTo(img);
};

// --- Swap Grid Items ---
const getCellData = (cell) => {
  const img = cell.querySelector("img");
  const textarea = cell.querySelector("textarea");
  const canvas = cell.querySelector(".drawing-canvas");
  const drawingPaths = canvas && canvasDataMap.get(canvas) ? [...canvasDataMap.get(canvas).paths] : [];
  return {
    imgSrc: img && img.src && img.style.display !== "none" ? img.src : null,
    imgAlt: img ? img.alt : "",
    text: textarea ? textarea.value : "",
    drawingPaths,
  };
};

const setCellData = (cell, data) => {
  const img = cell.querySelector("img");
  const drop = cell.querySelector(".drop");
  const span = cell.querySelector("span");
  const textarea = cell.querySelector("textarea");
  const canvas = cell.querySelector(".drawing-canvas");

  if (data.imgSrc) {
    img.src = data.imgSrc;
    img.alt = data.imgAlt;
    img.style.display = "flex";
    drop.style.border = "unset";
    if (span) span.style.display = "none";
  } else {
    img.src = "";
    img.style.display = "none";
    img.alt = "";
    drop.style.border = "var(--border)";
    if (span) span.style.display = "block";
  }

  if (textarea) textarea.value = data.text || "";

  if (canvas) {
    const canvasData = canvasDataMap.get(canvas);
    if (canvasData) {
      canvasData.paths = data.drawingPaths || [];
      const dpr = window.devicePixelRatio || 1;
      redrawCanvas(canvas, dpr);
    }
  }
};

const swapCells = (cellA, cellB) => {
  if (!cellA || !cellB || cellA === cellB) return;

  // FLIP animation: record initial positions
  const rectA = cellA.getBoundingClientRect();
  const rectB = cellB.getBoundingClientRect();

  // Swap data
  const dataA = getCellData(cellA);
  const dataB = getCellData(cellB);
  setCellData(cellA, dataB);
  setCellData(cellB, dataA);

  // FLIP: content that was in A is now in B, content that was in B is now in A.
  // To make it look like the content slid over, offset each cell to where its
  // new content originally was, then animate back to identity.
  const dx = rectB.left - rectA.left;
  const dy = rectB.top - rectA.top;

  // cellA now holds what was in B → start it at B's old position relative to A
  cellA.style.transition = "none";
  cellB.style.transition = "none";
  cellA.style.transform = `translate(${dx}px, ${dy}px)`;
  cellB.style.transform = `translate(${-dx}px, ${-dy}px)`;

  // Force reflow so the browser registers the starting position
  cellA.offsetHeight;

  // Animate to identity
  cellA.classList.add("swap-animating");
  cellB.classList.add("swap-animating");
  cellA.style.transition = "";
  cellB.style.transition = "";
  cellA.style.transform = "";
  cellB.style.transform = "";

  const cleanup = () => {
    cellA.classList.remove("swap-animating");
    cellB.classList.remove("swap-animating");
    cellA.style.transform = "";
    cellB.style.transform = "";
  };

  cellA.addEventListener("transitionend", cleanup, { once: true });
  // Fallback in case transitionend doesn't fire
  setTimeout(cleanup, 400);
};

const getAdjacentCell = (cell, direction) => {
  const cells = [...gridEl.querySelectorAll(".grid-cell")];
  const index = cells.indexOf(cell);
  if (index === -1) return null;

  if (direction === "left" && index > 0) return cells[index - 1];
  if (direction === "right" && index < cells.length - 1) return cells[index + 1];
  return null;
};

const createCell = (row, col) => {
  const cell = document.createElement("div");
  cell.className = "grid-cell";
  cell.dataset.row = row;
  cell.dataset.col = col;

  const drop = document.createElement("div");
  drop.className = "drop";

  const span = document.createElement("span");
  span.innerText = "Drop here";
  drop.appendChild(span);

  const img = document.createElement("img");
  img.style.display = "none";
  drop.appendChild(img);

  const textarea = document.createElement("textarea");
  textarea.autocomplete = "off";
  textarea.autocorrect = "off";
  textarea.spellcheck = false;
  textarea.autocapitalize = "off";
  textarea.rows = 2;
  textarea.textContent = "";

  cell.appendChild(drop);
  cell.appendChild(textarea);

  setupCell(cell);

  return cell;
};

const buildGrid = () => {
  // Save existing cell data
  const existingData = [];
  const existingCells = gridEl.querySelectorAll(".grid-cell");
  existingCells.forEach((cell) => {
    const img = cell.querySelector("img");
    const textarea = cell.querySelector("textarea");
    const canvas = cell.querySelector(".drawing-canvas");
    const drawingPaths = canvas && canvasDataMap.get(canvas) ? canvasDataMap.get(canvas).paths : [];
    existingData.push({
      row: parseInt(cell.dataset.row),
      col: parseInt(cell.dataset.col),
      imgSrc: img && img.src && img.style.display !== "none" ? img.src : null,
      imgAlt: img ? img.alt : "",
      text: textarea ? textarea.value : "",
      drawingPaths: drawingPaths,
    });
  });

  gridEl.innerHTML = "";
  gridEl.style.gridTemplateColumns = `repeat(${gridCols}, minmax(${Math.round(350 * gridZoom / 100)}px, 1fr))`;
  gridEl.style.gridTemplateRows = `repeat(${gridRows}, 1fr)`;

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const cell = createCell(r, c);
      gridEl.appendChild(cell);

      // Restore data if it existed at this position
      const existing = existingData.find((d) => d.row === r && d.col === c);
      if (existing) {
        const img = cell.querySelector("img");
        const drop = cell.querySelector(".drop");
        const span = cell.querySelector("span");
        const textarea = cell.querySelector("textarea");

        if (existing.imgSrc) {
          img.src = existing.imgSrc;
          img.alt = existing.imgAlt;
          img.style.display = "flex";
          drop.style.border = "unset";
          span.style.display = "none";
        }
        if (existing.text) {
          textarea.value = existing.text;
        }
        // Restore drawing paths
        if (existing.drawingPaths && existing.drawingPaths.length > 0) {
          const canvas = cell.querySelector(".drawing-canvas");
          if (canvas) {
            const data = canvasDataMap.get(canvas);
            if (data) {
              data.paths = existing.drawingPaths;
              const dpr = window.devicePixelRatio || 1;
              redrawCanvas(canvas, dpr);
            }
          }
        }
      }
    }
  }
};

const updateGrid = () => {
  gridCols = parseInt(document.getElementById("grid-cols").value) || 3;
  gridRows = parseInt(document.getElementById("grid-rows").value) || 1;
  buildGrid();
};

// --- Grid Zoom ---
let gridZoom = 100;
const gridZoomInput = document.getElementById("grid-zoom");
const gridZoomLabel = document.getElementById("grid-zoom-label");

const applyGridZoom = (zoom) => {
  gridZoom = Math.max(20, Math.min(300, zoom));
  gridZoomInput.value = gridZoom;
  gridZoomLabel.textContent = gridZoom + "%";

  const scale = gridZoom / 100;
  // Scale the grid column min-width, cell min-height, image max-height, and gap
  const minColWidth = Math.round(350 * scale);
  const minCellHeight = Math.round(300 * scale);
  const imageMaxHeight = Math.round(60 * scale);
  const gap = Math.round(48 * scale);

  gridEl.style.gridTemplateColumns = `repeat(${gridCols}, minmax(${minColWidth}px, 1fr))`;
  root.style.setProperty("--grid-zoom-cell-height", `${minCellHeight}px`);
  root.style.setProperty("--image-max-width", `${imageMaxHeight}dvh`);
  root.style.setProperty("--gap", `${gap}px`);

  // Scale font size for cell textareas
  const fontSize = Math.round(15 * scale);
  root.style.setProperty("--text-fontsize", `${fontSize}pt`);
};

gridZoomInput.addEventListener("input", (e) => {
  applyGridZoom(parseInt(e.target.value));
});

const setColors = (e) => {
  const [background, text] = e.value.split(";");
  root.style.setProperty("--background-color", background);

  if (text) {
    root.style.setProperty("--text-color", text);
  } else {
    root.style.setProperty("--text-color", "#000000");
  }
};

// Paste images into the toolbar for staging
// (handled in the bottom toolbar section below)

// Drop new images onto the grid area
const dropNewImage = (e) => {
  e.preventDefault();

  // Don't handle drops on the bottom toolbar
  if (e.target.closest(".bottom-toolbar")) {
    return;
  }

  if (e.target.className === "drop" || e.target.tagName === "IMG") {
    return;
  }

  [...e.dataTransfer.files]
    .filter((x) => x.type.startsWith("image/"))
    .forEach((droppedFile) => {
      const reader = new FileReader();
      reader.onloadend = function () {
        addImageToToolbar(this.result, droppedFile.name);
      };
      reader.readAsDataURL(droppedFile);
    });
};

document.body.addEventListener("drop", dropNewImage);

document.body.addEventListener("dragover", function (event) {
  event.preventDefault();
});

// Forward declarations for toolbar functions (defined fully in toolbar section below)
let removeToolbarItemById = () => {};
let addImageToToolbar = () => {};

// Build initial grid
buildGrid();

// --- Bottom Toolbar Logic ---
const bottomToolbar = document.getElementById("bottom-toolbar");
const bottomToolbarInner = document.getElementById("bottom-toolbar-inner");
const bottomToolbarDrop = document.getElementById("bottom-toolbar-drop");

// --- Resize handle for bottom toolbar ---
const resizeHandle = document.getElementById("bottom-toolbar-resize-handle");
let isResizing = false;
let startY = 0;
let startHeight = 0;

resizeHandle.addEventListener("mousedown", (e) => {
  e.preventDefault();
  isResizing = true;
  startY = e.clientY;
  startHeight = bottomToolbar.offsetHeight;
  document.body.style.cursor = "ns-resize";
  document.body.style.userSelect = "none";
});

document.addEventListener("mousemove", (e) => {
  if (!isResizing) return;
  const delta = startY - e.clientY;
  const newHeight = Math.max(40, startHeight + delta);
  bottomToolbar.style.height = newHeight + "px";
  bottomToolbarInner.style.minHeight = (newHeight - 24) + "px";

  // Add compact class when toolbar is narrow
  if (newHeight < 100) {
    bottomToolbar.classList.add("compact");
  } else {
    bottomToolbar.classList.remove("compact");
  }

  // Resize toolbar images and drop zone to match
  const imgHeight = (newHeight - 24 - 24) + "px"; // account for padding
  bottomToolbarInner.querySelectorAll(".bottom-toolbar-item").forEach((item) => {
    item.style.height = imgHeight;
  });
  const dropZone = bottomToolbarInner.querySelector(".bottom-toolbar-drop");
  if (dropZone) dropZone.style.height = imgHeight;

  // Update body padding so content isn't hidden behind the toolbar
  document.body.style.paddingBottom = (newHeight + 32) + "px";
  cardsEl.style.paddingBottom = (newHeight + 32) + "px";
});

document.addEventListener("mouseup", () => {
  if (!isResizing) return;
  isResizing = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
});

const sortStagingArea = () => {
  const items = [...bottomToolbarInner.querySelectorAll(".bottom-toolbar-item")];
  if (items.length < 2) return;
  items.sort((a, b) => {
    const nameA = (a.querySelector("img")?.alt || "").toLowerCase();
    const nameB = (b.querySelector("img")?.alt || "").toLowerCase();
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: "base" });
  });
  items.forEach((item) => {
    bottomToolbarInner.insertBefore(item, bottomToolbarDrop);
  });
};

addImageToToolbar = (dataUrl, fileName = "") => {
  const item = document.createElement("div");
  item.className = "bottom-toolbar-item";
  item.draggable = true;
  const id = `toolbar-img-${Math.random().toString(36).slice(2)}`;
  item.dataset.id = id;

  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = fileName;
  img.draggable = false;

  const removeBtn = document.createElement("button");
  removeBtn.className = "toolbar-item-remove";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    item.remove();
  });

  item.appendChild(img);
  item.appendChild(removeBtn);

  const nameLabel = document.createElement("span");
  nameLabel.className = "toolbar-item-name";
  nameLabel.textContent = fileName || "";
  item.appendChild(nameLabel);

  item.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", dataUrl);
    e.dataTransfer.setData("id", id);
    e.dataTransfer.setData("source", "toolbar");
    e.dataTransfer.effectAllowed = "move";
  });

  // Shift+click to add image to the first empty grid cell
  item.addEventListener("click", (e) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();

    // Find the first empty grid cell
    const cells = gridEl.querySelectorAll(".grid-cell");
    for (const cell of cells) {
      const cellImg = cell.querySelector("img");
      if (!cellImg || !cellImg.src || cellImg.style.display === "none") {
        const drop = cell.querySelector(".drop");
        const span = cell.querySelector("span");
        cellImg.src = dataUrl;
        cellImg.alt = fileName;
        cellImg.style.display = "flex";
        drop.style.border = "unset";
        if (span) span.style.display = "none";
        // Remove from toolbar
        item.remove();
        // Scroll the added image into view
        cell.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
    }
  });

  // Append then sort the entire staging area
  bottomToolbarInner.insertBefore(item, bottomToolbarDrop);
  sortStagingArea();
};

removeToolbarItemById = (id) => {
  const item = bottomToolbarInner.querySelector(`[data-id="${id}"]`);
  if (item) item.remove();
};

// Handle drops onto the toolbar drop zone
bottomToolbarDrop.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});

bottomToolbarDrop.addEventListener("drop", (e) => {
  e.preventDefault();

  // Handle file drops
  const files = [...e.dataTransfer.files].filter((f) =>
    f.type.startsWith("image/"),
  );
  if (files.length) {
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = function () {
        addImageToToolbar(this.result, file.name);
      };
      reader.readAsDataURL(file);
    });
    return;
  }

  // Handle data URL drops (from grid cells back to toolbar)
  const src = e.dataTransfer.getData("text/plain");
  if (src && src.startsWith("data:")) {
    addImageToToolbar(src);
  }
});

// Also allow dropping files anywhere on the toolbar
bottomToolbar.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});

bottomToolbar.addEventListener("drop", (e) => {
  // Only handle if not already handled by the drop zone
  if (e.target === bottomToolbarDrop || bottomToolbarDrop.contains(e.target)) {
    return;
  }
  e.preventDefault();

  const files = [...e.dataTransfer.files].filter((f) =>
    f.type.startsWith("image/"),
  );
  if (files.length) {
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = function () {
        addImageToToolbar(this.result, file.name);
      };
      reader.readAsDataURL(file);
    });
  }
});

// Override paste to also add to toolbar when no grid cell is focused
const originalOnPaste = document.onpaste;
document.onpaste = function (event) {
  const items = (event.clipboardData || event.originalEvent.clipboardData).items;

  for (const index in items) {
    const item = items[index];
    if (item.kind === "file") {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = function (event) {
        addImageToToolbar(event.target.result, blob.name || "");
      };
      reader.readAsDataURL(blob);
    }
  }
};

// ctrl-key zoom for toolbar previews
let zoomOverlay = null;

const applyZoom = (item) => {
  if (!item || zoomOverlay) return;
  const img = item.querySelector("img");
  if (!img) return;

  const rect = item.getBoundingClientRect();

  zoomOverlay = document.createElement("div");
  zoomOverlay.className = "zoom-overlay";
  const clone = img.cloneNode(true);
  zoomOverlay.appendChild(clone);

  // Position above the item, centered horizontally
  const scale = 3;
  const width = rect.width * scale;
  const height = rect.height * scale;
  zoomOverlay.style.left = `${rect.left + rect.width / 2 - width / 2}px`;
  zoomOverlay.style.top = `${rect.top - height - 8}px`;
  zoomOverlay.style.width = `${width}px`;
  zoomOverlay.style.height = `${height}px`;

  document.body.appendChild(zoomOverlay);
  item.dataset.zoomed = "true";
};

const removeZoom = (item) => {
  if (zoomOverlay) {
    zoomOverlay.remove();
    zoomOverlay = null;
  }
  if (item) {
    delete item.dataset.zoomed;
  }
};

document.addEventListener("keydown", (e) => {
  if (e.key === "Control") {
    const hoveredToolbar = bottomToolbarInner.querySelector(".bottom-toolbar-item:hover");
    if (hoveredToolbar) {
      applyZoom(hoveredToolbar);
    }
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "Control") {
    const zoomed = bottomToolbarInner.querySelector('.bottom-toolbar-item[data-zoomed]');
    removeZoom(zoomed);
  }
});

bottomToolbarInner.addEventListener("mouseover", (e) => {
  const item = e.target.closest(".bottom-toolbar-item");
  if (item && e.ctrlKey) {
    const current = bottomToolbarInner.querySelector('.bottom-toolbar-item[data-zoomed]');
    if (current !== item) {
      removeZoom(current);
      applyZoom(item);
    }
  }
});

bottomToolbarInner.addEventListener("mouseout", (e) => {
  const item = e.target.closest(".bottom-toolbar-item");
  if (item && !item.contains(e.relatedTarget)) {
    removeZoom(item);
  }
});

// --- Ctrl+Hover Zoom for Card Images ---
let cardZoomOverlay = null;

const applyCardZoom = (dropEl) => {
  if (!dropEl || cardZoomOverlay) return;
  const img = dropEl.querySelector("img");
  if (!img || !img.src || img.style.display === "none") return;

  const rect = dropEl.getBoundingClientRect();

  cardZoomOverlay = document.createElement("div");
  cardZoomOverlay.className = "zoom-overlay card-zoom-overlay";
  const clone = img.cloneNode(true);
  clone.style.display = "flex";
  cardZoomOverlay.appendChild(clone);

  // Use natural image dimensions, capped to viewport
  const maxW = window.innerWidth * 0.8;
  const maxH = window.innerHeight * 0.8;
  let width = img.naturalWidth;
  let height = img.naturalHeight;

  if (width > maxW) {
    height = height * (maxW / width);
    width = maxW;
  }
  if (height > maxH) {
    width = width * (maxH / height);
    height = maxH;
  }

  // Center in viewport
  cardZoomOverlay.style.left = `${(window.innerWidth - width) / 2}px`;
  cardZoomOverlay.style.top = `${(window.innerHeight - height) / 2}px`;
  cardZoomOverlay.style.width = `${width}px`;
  cardZoomOverlay.style.height = `${height}px`;

  document.body.appendChild(cardZoomOverlay);
  dropEl.dataset.zoomed = "true";
};

const removeCardZoom = (dropEl) => {
  if (cardZoomOverlay) {
    cardZoomOverlay.remove();
    cardZoomOverlay = null;
  }
  if (dropEl) {
    delete dropEl.dataset.zoomed;
  }
};

gridEl.addEventListener("mouseover", (e) => {
  const drop = e.target.closest(".grid-cell .drop");
  if (drop && e.ctrlKey) {
    const current = gridEl.querySelector('.drop[data-zoomed]');
    if (current !== drop) {
      removeCardZoom(current);
      applyCardZoom(drop);
    }
  }
});

gridEl.addEventListener("mouseout", (e) => {
  const drop = e.target.closest(".grid-cell .drop");
  if (drop && !drop.contains(e.relatedTarget)) {
    removeCardZoom(drop);
  }
});

// Also handle ctrl press/release while hovering a card image
document.addEventListener("keydown", (e) => {
  if (e.key === "Control") {
    const hovered = document.querySelector(".grid-cell .drop:hover");
    if (hovered) {
      applyCardZoom(hovered);
    }
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "Control") {
    const zoomed = gridEl.querySelector('.drop[data-zoomed]');
    removeCardZoom(zoomed);
  }
});

// --- Toggle Staging Area ---
const stagingToggleBtn = document.getElementById("staging-toggle-btn");

const toggleStagingArea = () => {
  const isHidden = bottomToolbar.style.display === "none";
  if (isHidden) {
    bottomToolbar.style.display = "";
    document.body.style.paddingBottom = "";
    cardsEl.style.paddingBottom = "";
    stagingToggleBtn.classList.remove("active");
  } else {
    bottomToolbar.style.display = "none";
    document.body.style.paddingBottom = "32px";
    cardsEl.style.paddingBottom = "32px";
    stagingToggleBtn.classList.add("active");
  }
};

stagingToggleBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleStagingArea();
});

// --- Sort Staged Images by Name ---
const sortToolbarBtn = document.getElementById("sort-toolbar-btn");

sortToolbarBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  sortStagingArea();
});

// --- Insert All Staged Images ---
const insertAllBtn = document.getElementById("insert-all-btn");

insertAllBtn.addEventListener("click", (e) => {
  e.stopPropagation();

  // Gather all staged images from the toolbar
  const items = [...bottomToolbarInner.querySelectorAll(".bottom-toolbar-item")];
  if (items.length === 0) return;

  // Count how many empty cells are currently available
  const cells = [...gridEl.querySelectorAll(".grid-cell")];
  let emptyCells = cells.filter((cell) => {
    const img = cell.querySelector("img");
    return !img || !img.src || img.style.display === "none";
  });

  // If not enough empty cells, increase rows to fit all staged images
  const needed = items.length - emptyCells.length;
  if (needed > 0) {
    const extraRows = Math.ceil(needed / gridCols);
    gridRows += extraRows;
    document.getElementById("grid-rows").value = gridRows;
    buildGrid();
    // Re-query empty cells after rebuilding
    emptyCells = [...gridEl.querySelectorAll(".grid-cell")].filter((cell) => {
      const img = cell.querySelector("img");
      return !img || !img.src || img.style.display === "none";
    });
  }

  // Insert each staged image into the next empty cell
  items.forEach((item, i) => {
    if (i >= emptyCells.length) return;
    const cell = emptyCells[i];
    const cellImg = cell.querySelector("img");
    const drop = cell.querySelector(".drop");
    const span = cell.querySelector("span");
    const stagedImg = item.querySelector("img");

    cellImg.src = stagedImg.src;
    cellImg.alt = stagedImg.alt || "";
    cellImg.style.display = "flex";
    drop.style.border = "unset";
    if (span) span.style.display = "none";

    // Remove from staging
    item.remove();
  });
});

// --- Hotkeys ---
document.addEventListener("keydown", (e) => {
  // Skip hotkeys when typing in an input, textarea, or contenteditable
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;

  const gridColsInput = document.getElementById("grid-cols");
  const gridRowsInput = document.getElementById("grid-rows");

  switch (e.key) {
    case "b":
      // Enable pen tool
      penModeBtn.click();
      break;
    case "a":
      // Enable arrow tool
      arrowModeBtn.click();
      break;
    case "l":
      // Enable line tool
      lineModeBtn.click();
      break;
    case "r":
      // Enable solid rectangle tool
      rectModeBtn.click();
      break;
    case "R":
      rectstrokeModeBtn.click();
      break;
    case "e":
      // Enable bordered rectangle tool
      rectstrokeModeBtn.click();
      break;
    case "o":
      // Enable oval tool
      ovalModeBtn.click();
      break;
    case "O":
      // Enable solid oval tool
      ovalfillModeBtn.click();
      break;
    case "t":
      // Enable text tool
      textModeBtn.click();
      break;
    case "d":
      // Enable dot tool
      dotModeBtn.click();
      break;
    case "?":
      gridRows++;
      gridRowsInput.value = gridRows;
      buildGrid();
      break;
    case "_":
      // Shift - remove row
      if (gridRows > 1) {
        gridRows--;
        gridRowsInput.value = gridRows;
        buildGrid();
      }
      break;
    case "+":
      // + add column
      gridCols++;
      gridColsInput.value = gridCols;
      buildGrid();
      e.preventDefault();
      break;
    case "-":
      // - remove column
      if (gridCols > 1) {
        gridCols--;
        gridColsInput.value = gridCols;
        buildGrid();
      }
      e.preventDefault();
      break;
    case "[":
      // Zoom out
      applyGridZoom(gridZoom - 10);
      e.preventDefault();
      break;
    case "]":
      // Zoom in
      applyGridZoom(gridZoom + 10);
      e.preventDefault();
      break;
    case "h":
      // Toggle staging area visibility
      toggleStagingArea();
      break;
    case "z":
      // Toggle zoom between 100% and 200%
      applyGridZoom(gridZoom === 200 ? 100 : 200);
      break;
    case "x": {
      // Cycle through preset colors
      const presetColors = Array.from(
        document.querySelectorAll(".toolbar-controls .preset-color-btn")
      ).map((btn) => btn.dataset.color);
      if (presetColors.length > 0) {
        const currentIndex = presetColors.indexOf(drawColor);
        const nextIndex = (currentIndex + 1) % presetColors.length;
        drawColor = presetColors[nextIndex];
        drawColorInput.value = drawColor;
        document.querySelectorAll(".toolbar-controls .preset-color-btn").forEach((b) => {
          b.style.borderColor = b.dataset.color === drawColor ? "#333" : "transparent";
        });
      }
      break;
    }
  }
});

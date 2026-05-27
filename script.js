let root = document.documentElement;

const cardsEl = document.getElementById("cards");
const gridEl = document.getElementById("grid");
const content = document.querySelector(".content");

const elementsToAdjustWidth = [cardsEl, content];

let gridCols = 3;
let gridRows = 1;

// Track selected rows for selective export
const selectedRows = new Set();

// Track filename visibility
let showFilenames = true;

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
        if (node.classList && node.classList.contains("row-controls")) return false;
        if (node.classList && node.classList.contains("row-select-cb")) return false;
        if (node.classList && node.classList.contains("grid-cell-filename") && !showFilenames) return false;
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
  const value = select.value;
  if (value === "grid") {
    copyAsGridSize();
  } else {
    const scale = parseFloat(value);
    if (scale >= 1) {
      copyAsImage(false);
    } else {
      copyAsImage(true, scale);
    }
  }
};

const copySelectedRows = () => {
  if (selectedRows.size === 0) {
    // Nothing selected — fall back to copying all
    copyWithScale();
    return;
  }

  // Hide unselected rows, export, then restore
  const allCells = gridEl.querySelectorAll(".grid-cell");
  const hiddenCells = [];

  allCells.forEach((cell) => {
    const row = parseInt(cell.dataset.row);
    if (!selectedRows.has(row)) {
      cell.style.display = "none";
      hiddenCells.push(cell);
    }
  });

  // Temporarily adjust grid rows to only show selected count
  const originalRows = gridEl.style.gridTemplateRows;
  gridEl.style.gridTemplateRows = `repeat(${selectedRows.size}, 1fr)`;

  const select = document.getElementById("copy-scale");
  const scale = parseFloat(select.value);

  const doExport = scale >= 1 ? copyAsImage(false) : copyAsImage(true, scale);

  // copyAsImage is async — wait for it to finish then restore
  Promise.resolve(doExport).finally(() => {
    hiddenCells.forEach((cell) => {
      cell.style.display = "";
    });
    gridEl.style.gridTemplateRows = originalRows;
  });
};

const copyAsGridSize = async () => {
  try {
    // Capture the current rendered sizes of images before modifying styles
    const allImages = cardsEl.querySelectorAll("img");
    const imageSizes = [];
    allImages.forEach((img) => {
      if (img.src && img.style.display !== "none") {
        imageSizes.push({ img, width: img.clientWidth, height: img.clientHeight });
      }
    });

    root.style.setProperty("--border", `unset`);
    gridEl.style.outline = "none";

    // Keep the current grid zoom settings — don't reset them
    // Just remove overflow clipping so the capture is clean
    const allCells = gridEl.querySelectorAll(".grid-cell");
    allCells.forEach((cell) => {
      cell.style.overflow = "visible";
    });

    const allDrops = cardsEl.querySelectorAll(".drop");
    allDrops.forEach((drop) => {
      drop.style.overflow = "visible";
    });

    // Lock each image to its current display size
    imageSizes.forEach(({ img, width, height }) => {
      img.style.width = width + "px";
      img.style.height = height + "px";
      img.style.objectFit = "contain";
      img.style.maxHeight = "unset";
    });

    // Collapse empty drops
    allDrops.forEach((drop) => {
      const img = drop.querySelector("img");
      if (!img || !img.src || img.style.display === "none") {
        drop.style.width = "32px";
        drop.style.height = "32px";
      }
    });

    // Use auto columns so the grid fits the locked image sizes
    gridEl.style.gridTemplateRows = "auto";
    gridEl.style.gridTemplateColumns = `repeat(${gridCols}, auto)`;

    cardsEl.style.padding = `8px 32px`;
    cardsEl.style.width = "fit-content";

    // Redraw canvases at 1:1 since we're keeping display size
    redrawAllCanvasesForExport(1);

    const blob = await domtoimage.toBlob(cardsEl, {
      filter: (node) => {
        if (node.tagName === "IMG" && !node.src.startsWith("data:")) {
          return false;
        }
        if (node.tagName === "SPAN") return false;
        if (node.classList && node.classList.contains("clear-drawing-btn")) return false;
        if (node.classList && node.classList.contains("drawing-text-input")) return false;
        if (node.classList && node.classList.contains("row-controls")) return false;
        if (node.classList && node.classList.contains("row-select-cb")) return false;
        if (node.classList && node.classList.contains("grid-cell-filename") && !showFilenames) return false;
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

    // Restore zoom (restores gridTemplateColumns, --image-max-width, --gap, etc.)
    applyGridZoom(gridZoom);

    // Restore drawing canvases to display size
    restoreAllCanvases();
  } catch (error) {
    console.error(error);
  }
};

const updateCopySelectedBtn = () => {
  const btn = document.getElementById("copy-selected-btn");
  if (!btn) return;
  if (selectedRows.size > 0) {
    btn.textContent = `Copy Selected (${selectedRows.size})`;
    btn.disabled = false;
  } else {
    btn.textContent = "Copy Selected";
    btn.disabled = false;
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
    const cell = drop.closest(".grid-cell");
    if (cell) updateFilenameLabel(cell);
  }
};

// --- Drawing Logic ---
let drawingMode = false;
let drawColor = "#ff0000";
let drawLineWidth = 2;
let drawTool = "freehand"; // "freehand", "arrow", "line", "rect", "rectstroke", "oval", "ovalfill", "dot", "eraser", "object-eraser", or "text"
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
const objectEraserModeBtn = document.getElementById("object-eraser-mode-btn");
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
    objectEraserModeBtn.classList.remove("active");
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
  document.querySelectorAll(".toolbar-controls .preset-color-btn").forEach((b) => {
    if (b.dataset.color === drawColor) {
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
  drawColor = e.target.value;
  updatePresetColorSelection();
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
    updatePresetColorSelection();
  });
});

// Apply initial selection state
updatePresetColorSelection();

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
    objectEraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
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
    objectEraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
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
    objectEraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
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
    objectEraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
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
    objectEraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
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
    objectEraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
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
    objectEraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
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
    objectEraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
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
    objectEraserModeBtn.classList.remove("active");
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
    objectEraserModeBtn.classList.remove("active");
    textModeBtn.classList.remove("active");
    document.body.classList.remove("text-tool");
    document.body.classList.add("eraser-tool");
    enableDrawingMode();
  }
});

// Object eraser mode toggle — removes whole shapes on click
objectEraserModeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (drawTool === "object-eraser" && drawingMode) {
    disableDrawingMode();
    objectEraserModeBtn.classList.remove("active");
    document.body.classList.remove("eraser-tool");
  } else {
    drawTool = "object-eraser";
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
    textModeBtn.classList.remove("active");
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
    objectEraserModeBtn.classList.remove("active");
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

    if (drawTool === "object-eraser") {
      // Remove the topmost path that the click hits
      const data = canvasDataMap.get(canvas);
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

    // Shift-constrain behavior depends on tool:
    // - Rect/oval tools: force 1:1 aspect ratio (square/circle) in pixel space
    // - Line/arrow/freehand: snap to horizontal or vertical axis
    if (e.shiftKey) {
      if ((drawTool === "rect" || drawTool === "rectstroke" || drawTool === "oval" || drawTool === "ovalfill") && arrowStart) {
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

      // Shift-constrain on commit
      if (e.shiftKey && arrowStart) {
        if (drawTool === "rect" || drawTool === "rectstroke" || drawTool === "oval" || drawTool === "ovalfill") {
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
      updateFilenameLabel(cell);
    }
  });

  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    // Show row drop target indicator when dragging a row
    if (rowDragState) {
      const targetRow = parseInt(cell.dataset.row);
      if (targetRow !== rowDragState.sourceRow) {
        setRowDropTarget(targetRow);
      }
    }
  });

  drop.addEventListener("dragleave", (e) => {
    // Clear row drop target if leaving the cell
    if (rowDragState && !cell.contains(e.relatedTarget)) {
      clearRowDropTarget();
    }
  });

  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    drop.style.border = "unset";

    // Handle row-drag drops onto grid cells
    if (rowDragState) {
      const sourceRow = rowDragState.sourceRow;
      const targetRow = parseInt(cell.dataset.row);
      if (sourceRow !== targetRow) {
        swapRows(sourceRow, targetRow);
      }
      rowDragState = null;
      clearRowHighlights();
      clearRowDropTarget();
      return;
    }

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = function () {
        img.style.display = "flex";
        img.src = this.result;
        img.alt = droppedFile.name;
        span.style.display = "none";
        updateFilenameLabel(cell);
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
        const draggedFilename = e.dataTransfer.getData("filename") || "";
        img.style.display = "flex";
        img.src = src;
        img.alt = draggedFilename;
        span.style.display = "none";
        removeToolbarItemById(draggedId);
        updateFilenameLabel(cell);
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
      updateFilenameLabel(cell);
    }
  });

  attachDragTo(img);

  // Cell-level row-drag handlers (catches drags over textarea area too)
  cell.addEventListener("dragover", (e) => {
    if (!rowDragState) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const targetRow = parseInt(cell.dataset.row);
    if (targetRow !== rowDragState.sourceRow) {
      setRowDropTarget(targetRow);
    }
  });

  cell.addEventListener("dragleave", (e) => {
    if (!rowDragState) return;
    if (!cell.contains(e.relatedTarget)) {
      clearRowDropTarget();
    }
  });

  cell.addEventListener("drop", (e) => {
    if (!rowDragState) return;
    e.preventDefault();
    const sourceRow = rowDragState.sourceRow;
    const targetRow = parseInt(cell.dataset.row);
    if (sourceRow !== targetRow) {
      swapRows(sourceRow, targetRow);
    }
    rowDragState = null;
    clearRowHighlights();
    clearRowDropTarget();
  });
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
  updateFilenameLabel(cell);
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

// Update the filename label for a given cell based on its img.alt
const updateFilenameLabel = (cell) => {
  const label = cell.querySelector(".grid-cell-filename");
  if (!label) return;
  const img = cell.querySelector("img");
  const name = img && img.alt && img.style.display !== "none" ? img.alt : "";
  label.textContent = name;
  label.style.display = name && showFilenames ? "" : "none";
};

// Toggle filename visibility for all cells
const toggleFilenames = () => {
  showFilenames = !showFilenames;
  const btn = document.getElementById("filename-toggle-btn");
  if (btn) btn.classList.toggle("active", showFilenames);
  document.querySelectorAll(".grid-cell").forEach(updateFilenameLabel);
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

  const filenameLabel = document.createElement("div");
  filenameLabel.className = "grid-cell-filename";
  cell.appendChild(filenameLabel);

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
        updateFilenameLabel(cell);
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

  // Build row controls (drag handles + add-row buttons)
  buildRowControls();
};

// --- Row Reordering & Insertion ---

let rowDragState = null; // { sourceRow, placeholder }

const buildRowControls = () => {
  // Remove existing row controls
  const existingControls = document.querySelector(".row-controls");
  if (existingControls) existingControls.remove();

  const controlsContainer = document.createElement("div");
  controlsContainer.className = "row-controls";

  // Build a grid with interleaved rows:
  // [add-btn-row] [handle-row] [add-btn-row] [handle-row] ... [add-btn-row]
  // The handle rows use 1fr to match the main grid's row sizing.
  // The add-btn rows are auto-sized (small).
  // The gap between handle rows must equal var(--gap) minus the space taken by the add-btn row.
  // Simpler: no gap, use the template to control spacing.
  const rowTemplate = [];
  for (let r = 0; r < gridRows; r++) {
    rowTemplate.push("auto"); // add-btn slot
    rowTemplate.push("1fr"); // handle slot
  }
  rowTemplate.push("auto"); // final add-btn slot
  controlsContainer.style.gridTemplateRows = rowTemplate.join(" ");
  controlsContainer.style.gap = "0";

  // We need the handle rows to have the same gap between them as the main grid.
  // The main grid uses `gap: var(--gap)`. In our layout, between two handle rows
  // there's an add-btn row. We use row-gap on the handles via margins or we set
  // the add-btn row height to match the gap.
  // Actually, the cleanest approach: set the auto rows to have a fixed height
  // equal to the gap, so the spacing between 1fr rows matches the main grid.

  for (let r = 0; r < gridRows; r++) {
    // Add-row button before this row
    const addBtn = createAddRowButton(r);
    addBtn.style.gridRow = `${r * 2 + 1}`;
    addBtn.style.height = r === 0 ? "0px" : "var(--gap)";
    addBtn.style.alignSelf = "center";
    controlsContainer.appendChild(addBtn);

    // Row drag handle
    const handle = document.createElement("div");
    handle.className = "row-drag-handle";
    handle.draggable = true;
    handle.dataset.row = r;
    handle.title = `Drag to reorder row ${r + 1}`;
    handle.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="4" cy="3" r="1.2" fill="currentColor"/><circle cx="8" cy="3" r="1.2" fill="currentColor"/><circle cx="4" cy="6" r="1.2" fill="currentColor"/><circle cx="8" cy="6" r="1.2" fill="currentColor"/><circle cx="4" cy="9" r="1.2" fill="currentColor"/><circle cx="8" cy="9" r="1.2" fill="currentColor"/></svg>`;

    handle.addEventListener("dragstart", (e) => {
      const row = parseInt(handle.dataset.row);
      rowDragState = { sourceRow: row };
      e.dataTransfer.setData("row-drag", String(row));
      e.dataTransfer.effectAllowed = "move";
      handle.classList.add("dragging");
      highlightRow(row, true);
    });

    // Delete row button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-row-btn";
    deleteBtn.dataset.row = r;
    deleteBtn.title = `Delete row ${r + 1}`;
    deleteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12"><line x1="3" y1="3" x2="9" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="9" y1="3" x2="3" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteRowAt(parseInt(deleteBtn.dataset.row));
    });

    // Row selection checkbox
    const selectCb = document.createElement("input");
    selectCb.type = "checkbox";
    selectCb.className = "row-select-cb";
    selectCb.dataset.row = r;
    selectCb.title = `Select row ${r + 1} for export`;
    selectCb.checked = selectedRows.has(r);
    selectCb.addEventListener("change", (e) => {
      const rowIdx = parseInt(selectCb.dataset.row);
      if (selectCb.checked) {
        selectedRows.add(rowIdx);
      } else {
        selectedRows.delete(rowIdx);
      }
      updateCopySelectedBtn();
    });

    // Wrapper to stack handle, checkbox, and delete button vertically
    const rowControlGroup = document.createElement("div");
    rowControlGroup.className = "row-control-group";
    rowControlGroup.style.gridRow = `${r * 2 + 2}`;
    rowControlGroup.appendChild(selectCb);
    rowControlGroup.appendChild(handle);
    rowControlGroup.appendChild(deleteBtn);
    controlsContainer.appendChild(rowControlGroup);

    handle.addEventListener("dragend", () => {
      handle.classList.remove("dragging");
      rowDragState = null;
      clearRowHighlights();
      clearRowDropIndicators();
      clearRowDropTarget();
    });

    handle.addEventListener("dragover", (e) => {
      if (!rowDragState) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const targetRow = parseInt(handle.dataset.row);
      if (targetRow !== rowDragState.sourceRow) {
        setRowDropTarget(targetRow);
      }
    });

    handle.addEventListener("dragleave", () => {
      clearRowDropTarget();
    });

    handle.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!rowDragState) return;
      const sourceRow = rowDragState.sourceRow;
      const targetRow = parseInt(handle.dataset.row);
      if (sourceRow !== targetRow) {
        swapRows(sourceRow, targetRow);
      }
      rowDragState = null;
      clearRowHighlights();
      clearRowDropTarget();
    });
  }

  // Final add-row button after the last row
  const addLastBtn = createAddRowButton(gridRows);
  addLastBtn.style.gridRow = `${gridRows * 2 + 1}`;
  addLastBtn.style.height = "0px";
  addLastBtn.style.alignSelf = "center";
  controlsContainer.appendChild(addLastBtn);

  // Insert controls container next to the grid
  gridEl.parentElement.insertBefore(controlsContainer, gridEl);
};

const createAddRowButton = (insertIndex) => {
  const btn = document.createElement("button");
  btn.className = "add-row-btn";
  btn.dataset.insertIndex = insertIndex;
  btn.title = `Add row here`;
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12"><line x1="6" y1="2" x2="6" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    insertRowAt(insertIndex);
  });

  // Allow dropping rows onto add-row buttons as drop targets
  btn.addEventListener("dragover", (e) => {
    if (!rowDragState) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    btn.classList.add("drop-target");
  });

  btn.addEventListener("dragleave", () => {
    btn.classList.remove("drop-target");
  });

  btn.addEventListener("drop", (e) => {
    e.preventDefault();
    btn.classList.remove("drop-target");
    if (!rowDragState) return;
    const sourceRow = rowDragState.sourceRow;
    const targetIndex = parseInt(btn.dataset.insertIndex);
    moveRow(sourceRow, targetIndex);
    rowDragState = null;
  });

  return btn;
};

const insertRowAt = (insertIndex) => {
  // Collect all existing cell data
  const allData = collectGridData();

  // Shift rows at and after insertIndex down by 1
  const newData = allData.map((d) => ({
    ...d,
    row: d.row >= insertIndex ? d.row + 1 : d.row,
  }));

  // Update selectedRows — shift indices at or after insertIndex
  const newSelected = new Set();
  selectedRows.forEach((r) => {
    newSelected.add(r >= insertIndex ? r + 1 : r);
  });
  selectedRows.clear();
  newSelected.forEach((r) => selectedRows.add(r));
  updateCopySelectedBtn();

  gridRows++;
  document.getElementById("grid-rows").value = gridRows;

  // Rebuild grid with shifted data
  gridEl.innerHTML = "";
  gridEl.style.gridTemplateColumns = `repeat(${gridCols}, minmax(${Math.round(350 * gridZoom / 100)}px, 1fr))`;
  gridEl.style.gridTemplateRows = `repeat(${gridRows}, 1fr)`;

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const cell = createCell(r, c);
      gridEl.appendChild(cell);

      const existing = newData.find((d) => d.row === r && d.col === c);
      if (existing) {
        restoreCellData(cell, existing);
      }
    }
  }

  buildRowControls();
};

const deleteRowAt = (rowIndex) => {
  if (gridRows <= 1) return; // Don't delete the last row

  const allData = collectGridData();

  // Remove data for the deleted row and shift rows above it down
  const newData = allData
    .filter((d) => d.row !== rowIndex)
    .map((d) => ({
      ...d,
      row: d.row > rowIndex ? d.row - 1 : d.row,
    }));

  // Update selectedRows — remove deleted row and shift indices
  const newSelected = new Set();
  selectedRows.forEach((r) => {
    if (r < rowIndex) newSelected.add(r);
    else if (r > rowIndex) newSelected.add(r - 1);
    // r === rowIndex is removed
  });
  selectedRows.clear();
  newSelected.forEach((r) => selectedRows.add(r));
  updateCopySelectedBtn();

  gridRows--;
  document.getElementById("grid-rows").value = gridRows;

  // Rebuild grid
  gridEl.innerHTML = "";
  gridEl.style.gridTemplateColumns = `repeat(${gridCols}, minmax(${Math.round(350 * gridZoom / 100)}px, 1fr))`;
  gridEl.style.gridTemplateRows = `repeat(${gridRows}, 1fr)`;

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const cell = createCell(r, c);
      gridEl.appendChild(cell);

      const existing = newData.find((d) => d.row === r && d.col === c);
      if (existing) {
        restoreCellData(cell, existing);
      }
    }
  }

  buildRowControls();
};

const moveRow = (sourceRow, targetIndex) => {
  // If dropping in the same position or adjacent (no-op)
  if (targetIndex === sourceRow || targetIndex === sourceRow + 1) return;

  const allData = collectGridData();

  // Track whether the source row was selected
  const sourceWasSelected = selectedRows.has(sourceRow);

  // Extract source row data
  const sourceData = allData.filter((d) => d.row === sourceRow);
  const otherData = allData.filter((d) => d.row !== sourceRow);

  // Calculate new row indices
  // After removing source row, rows shift up if they were below it
  const reindexed = otherData.map((d) => ({
    ...d,
    row: d.row > sourceRow ? d.row - 1 : d.row,
  }));

  // Determine the effective insert position after removal
  const effectiveTarget = targetIndex > sourceRow ? targetIndex - 1 : targetIndex;

  // Shift rows at and after effectiveTarget down to make room
  const shifted = reindexed.map((d) => ({
    ...d,
    row: d.row >= effectiveTarget ? d.row + 1 : d.row,
  }));

  // Place source row at effectiveTarget
  const movedData = sourceData.map((d) => ({
    ...d,
    row: effectiveTarget,
  }));

  const finalData = [...shifted, ...movedData];

  // Update selectedRows to reflect the move
  const newSelected = new Set();
  selectedRows.forEach((r) => {
    if (r === sourceRow) {
      newSelected.add(effectiveTarget);
    } else {
      let adjusted = r;
      if (r > sourceRow) adjusted--;
      if (adjusted >= effectiveTarget) adjusted++;
      newSelected.add(adjusted);
    }
  });
  selectedRows.clear();
  newSelected.forEach((r) => selectedRows.add(r));

  // Rebuild grid
  gridEl.innerHTML = "";
  gridEl.style.gridTemplateColumns = `repeat(${gridCols}, minmax(${Math.round(350 * gridZoom / 100)}px, 1fr))`;
  gridEl.style.gridTemplateRows = `repeat(${gridRows}, 1fr)`;

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const cell = createCell(r, c);
      gridEl.appendChild(cell);

      const existing = finalData.find((d) => d.row === r && d.col === c);
      if (existing) {
        restoreCellData(cell, existing);
      }
    }
  }

  buildRowControls();
};

const swapRows = (rowA, rowB) => {
  if (rowA === rowB) return;

  const allData = collectGridData();

  // Swap row indices
  const newData = allData.map((d) => {
    if (d.row === rowA) return { ...d, row: rowB };
    if (d.row === rowB) return { ...d, row: rowA };
    return d;
  });

  // Update selectedRows to reflect the swap
  const hadA = selectedRows.has(rowA);
  const hadB = selectedRows.has(rowB);
  if (hadA && !hadB) {
    selectedRows.delete(rowA);
    selectedRows.add(rowB);
  } else if (hadB && !hadA) {
    selectedRows.delete(rowB);
    selectedRows.add(rowA);
  }
  // If both or neither were selected, no change needed

  // Rebuild grid
  gridEl.innerHTML = "";
  gridEl.style.gridTemplateColumns = `repeat(${gridCols}, minmax(${Math.round(350 * gridZoom / 100)}px, 1fr))`;
  gridEl.style.gridTemplateRows = `repeat(${gridRows}, 1fr)`;

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const cell = createCell(r, c);
      gridEl.appendChild(cell);

      const existing = newData.find((d) => d.row === r && d.col === c);
      if (existing) {
        restoreCellData(cell, existing);
      }
    }
  }

  buildRowControls();
};

const collectGridData = () => {
  const data = [];
  gridEl.querySelectorAll(".grid-cell").forEach((cell) => {
    const img = cell.querySelector("img");
    const textarea = cell.querySelector("textarea");
    const canvas = cell.querySelector(".drawing-canvas");
    const drawingPaths = canvas && canvasDataMap.get(canvas) ? canvasDataMap.get(canvas).paths : [];
    data.push({
      row: parseInt(cell.dataset.row),
      col: parseInt(cell.dataset.col),
      imgSrc: img && img.src && img.style.display !== "none" ? img.src : null,
      imgAlt: img ? img.alt : "",
      text: textarea ? textarea.value : "",
      drawingPaths: drawingPaths,
    });
  });
  return data;
};

const restoreCellData = (cell, data) => {
  const img = cell.querySelector("img");
  const drop = cell.querySelector(".drop");
  const span = cell.querySelector("span");
  const textarea = cell.querySelector("textarea");

  if (data.imgSrc) {
    img.src = data.imgSrc;
    img.alt = data.imgAlt;
    img.style.display = "flex";
    drop.style.border = "unset";
    span.style.display = "none";
  }
  if (data.text) {
    textarea.value = data.text;
  }
  if (data.drawingPaths && data.drawingPaths.length > 0) {
    const canvas = cell.querySelector(".drawing-canvas");
    if (canvas) {
      const canvasData = canvasDataMap.get(canvas);
      if (canvasData) {
        canvasData.paths = data.drawingPaths;
        const dpr = window.devicePixelRatio || 1;
        redrawCanvas(canvas, dpr);
      }
    }
  }
  updateFilenameLabel(cell);
};

const highlightRow = (row, active) => {
  gridEl.querySelectorAll(".grid-cell").forEach((cell) => {
    if (parseInt(cell.dataset.row) === row) {
      cell.classList.toggle("row-dragging", active);
    }
  });
};

const clearRowHighlights = () => {
  gridEl.querySelectorAll(".grid-cell.row-dragging").forEach((cell) => {
    cell.classList.remove("row-dragging");
  });
};

const clearRowDropIndicators = () => {
  document.querySelectorAll(".add-row-btn.drop-target").forEach((btn) => {
    btn.classList.remove("drop-target");
  });
};

const setRowDropTarget = (row) => {
  // Clear previous target
  gridEl.querySelectorAll(".grid-cell.row-drop-target").forEach((cell) => {
    cell.classList.remove("row-drop-target");
  });
  // Highlight all cells in the target row
  gridEl.querySelectorAll(".grid-cell").forEach((cell) => {
    if (parseInt(cell.dataset.row) === row) {
      cell.classList.add("row-drop-target");
    }
  });
};

const clearRowDropTarget = () => {
  gridEl.querySelectorAll(".grid-cell.row-drop-target").forEach((cell) => {
    cell.classList.remove("row-drop-target");
  });
};

const updateGrid = () => {
  gridCols = parseInt(document.getElementById("grid-cols").value) || 3;
  gridRows = parseInt(document.getElementById("grid-rows").value) || 1;
  selectedRows.clear();
  updateCopySelectedBtn();
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

gridZoomInput.addEventListener("change", () => {
  gridZoomInput.blur();
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
const bottomToolbarDropSpan = bottomToolbarDrop.querySelector("span");

const updateStagingInstruction = () => {
  const hasImages = bottomToolbarInner.querySelector(".bottom-toolbar-item") !== null;
  bottomToolbarDrop.style.display = hasImages ? "none" : "";
};

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
    updateStagingInstruction();
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
    e.dataTransfer.setData("filename", fileName || "");
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
        updateFilenameLabel(cell);
        // Remove from toolbar
        item.remove();
        updateStagingInstruction();
        // Scroll the added image into view
        cell.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
    }
  });

  // Append then sort the entire staging area
  bottomToolbarInner.insertBefore(item, bottomToolbarDrop);
  sortStagingArea();
  updateStagingInstruction();
};

removeToolbarItemById = (id) => {
  const item = bottomToolbarInner.querySelector(`[data-id="${id}"]`);
  if (item) item.remove();
  updateStagingInstruction();
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

// --- Toggle Filenames ---
const filenameToggleBtn = document.getElementById("filename-toggle-btn");
filenameToggleBtn.classList.add("active"); // starts active (filenames visible)

filenameToggleBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleFilenames();
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
    updateFilenameLabel(cell);

    // Remove from staging
    item.remove();
  });
  updateStagingInstruction();
});

// --- Hotkeys ---
document.addEventListener("keydown", (e) => {
  // Skip hotkeys when typing in an input, textarea, or contenteditable
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;

  // Skip hotkeys when Shift is used as a drawing modifier (e.g. constraining shapes)
  // Allow Shift+1/2/3 (!, ", #) through for thickness hotkeys
  // Allow Shift+R/E/O through for tool switching hotkeys
  if (e.shiftKey && drawingMode && e.key !== "Escape" && !["!", "\"", "#", "R", "E", "O", "A"].includes(e.key)) return;

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
      // Enable bordered rectangle tool
      rectstrokeModeBtn.click();
      break;
    case "e":
      // Enable eraser tool
      eraserModeBtn.click();
      break;
    case "E":
      // Enable object eraser tool
      objectEraserModeBtn.click();
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
    case "f":
      // Toggle filename labels
      toggleFilenames();
      break;
    case "A":
      // Shift+A: Insert all images from staging area
      insertAllBtn.click();
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
        updatePresetColorSelection();
      }
      break;
    }
    case "!": {
      // Shift+1: Thin line thickness
      const thicknessBtns = document.querySelectorAll(".thickness-presets .thickness-btn");
      if (thicknessBtns[0]) thicknessBtns[0].click();
      break;
    }
    case "\"": {
      // Shift+2: Medium line thickness
      const thicknessBtns = document.querySelectorAll(".thickness-presets .thickness-btn");
      if (thicknessBtns[1]) thicknessBtns[1].click();
      break;
    }
    case "#": {
      // Shift+3: Thick line thickness
      const thicknessBtns = document.querySelectorAll(".thickness-presets .thickness-btn");
      if (thicknessBtns[2]) thicknessBtns[2].click();
      break;
    }
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
    case "6":
    case "7":
    case "8":
    case "9": {
      // Select preset color by number key
      const presetBtns = document.querySelectorAll(".toolbar-controls .preset-color-btn");
      const index = parseInt(e.key) - 1;
      if (index < presetBtns.length) {
        presetBtns[index].click();
      }
      break;
    }
  }
});

// Sync content-container padding-top with toolbar height
(() => {
  const toolbar = document.querySelector('.toolbar');
  const container = document.querySelector('.content-container');
  if (!toolbar || !container) return;

  const sync = () => {
    container.style.paddingTop = toolbar.offsetHeight + 'px';
  };

  sync();
  new ResizeObserver(sync).observe(toolbar);
})();

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

    if (useFullSize) {
      const baseFontSize = 15;
      const fontSize = Math.max(baseFontSize, Math.floor(baseFontSize * resolutionScale * 3));
      root.style.setProperty("--text-fontsize", `${fontSize}pt`);

      const gap = 128 * resolutionScale;
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

    root.style.setProperty("--border", `unset`);
    gridEl.style.outline = "none";

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
        return true;
      },
    });

    navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);

    // Restore all styles
    if (useFullSize) {
      root.style.setProperty("--text-fontsize", `15pt`);
      root.style.setProperty("--gap", `48px`);
    }

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
    gridEl.style.gridTemplateColumns = `repeat(${gridCols}, minmax(250px, 1fr))`;
    root.style.setProperty("--border", `1px dashed rgb(167, 165, 165)`);
    root.style.setProperty("--image-max-width", "60dvh");

    // Restore drawing canvases to display size
    restoreAllCanvases();
  } catch (error) {
    console.error(error);
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

    e.dataTransfer.setData("text/plain", img.src);
    e.dataTransfer.setData("id", img.id);
    e.dataTransfer.setData("note", textArea ? textArea.value : "");
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
let drawLineWidth = 3;

const enableDrawingMode = () => {
  drawingMode = true;
  document.body.classList.add("drawing-mode");
  document.querySelectorAll(".drawing-canvas").forEach((c) => c.classList.add("active"));
};

const disableDrawingMode = () => {
  drawingMode = false;
  document.body.classList.remove("drawing-mode");
  document.querySelectorAll(".drawing-canvas").forEach((c) => c.classList.remove("active"));
};

// Toggle drawing mode with Shift key, exit with Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Shift" && !e.repeat && !e.target.matches("textarea, input")) {
    if (drawingMode) {
      disableDrawingMode();
    } else {
      enableDrawingMode();
    }
  }
  if (e.key === "Escape" && drawingMode) {
    disableDrawingMode();
  }
});

// Exit drawing mode when clicking outside a canvas
document.addEventListener("mousedown", (e) => {
  if (drawingMode && !e.target.closest(".drawing-canvas")) {
    disableDrawingMode();
  }
});

// Wire up toolbar drawing controls
const drawColorInput = document.getElementById("draw-color");
const drawWidthInput = document.getElementById("draw-width");

drawColorInput.addEventListener("input", (e) => {
  drawColor = e.target.value;
  document.querySelectorAll(".toolbar-controls .preset-color-btn").forEach((b) => {
    b.style.borderColor = b.dataset.color === drawColor ? "#333" : "transparent";
  });
});

drawWidthInput.addEventListener("input", (e) => {
  drawLineWidth = parseInt(e.target.value);
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

// Each canvas stores its paths as normalized coordinates (0-1 range relative to canvas size)
// so they can be redrawn at any scale during export.
const canvasDataMap = new WeakMap(); // canvas element -> { paths: [...] }

// Redraw all stored paths on a canvas at current size
const redrawCanvas = (canvas, dpr) => {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const data = canvasDataMap.get(canvas);
  if (!data) return;

  for (const path of data.paths) {
    if (path.points.length < 2) continue;
    ctx.strokeStyle = path.color;
    ctx.lineWidth = path.lineWidth * dpr;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(path.points[0].x * canvas.width, path.points[0].y * canvas.height);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x * canvas.width, path.points[i].y * canvas.height);
    }
    ctx.stroke();
  }
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

  // Drawing state
  let isDrawing = false;
  let currentPath = null;

  canvas.addEventListener("mousedown", (e) => {
    if (!drawingMode) return;
    e.preventDefault();
    e.stopPropagation();
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    currentPath = {
      color: drawColor,
      lineWidth: drawLineWidth,
      points: [{ x, y }],
    };
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!isDrawing || !currentPath) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    currentPath.points.push({ x, y });

    // Draw incrementally
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const points = currentPath.points;
    if (points.length >= 2) {
      const from = points[points.length - 2];
      const to = points[points.length - 1];
      ctx.strokeStyle = currentPath.color;
      ctx.lineWidth = currentPath.lineWidth * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(from.x * canvas.width, from.y * canvas.height);
      ctx.lineTo(to.x * canvas.width, to.y * canvas.height);
      ctx.stroke();
    }
  });

  const endDraw = (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentPath && currentPath.points.length > 1) {
      const data = canvasDataMap.get(canvas);
      if (data) data.paths.push(currentPath);
    }
    currentPath = null;
  };

  canvas.addEventListener("mouseup", endDraw);
  canvas.addEventListener("mouseleave", endDraw);

  return canvas;
};

// Redraw all canvases at export scale — called before capture
const redrawAllCanvasesForExport = (scale) => {
  const canvases = document.querySelectorAll(".drawing-canvas");
  canvases.forEach((canvas) => {
    const drop = canvas.parentElement;
    const rect = drop.getBoundingClientRect();
    // Resize canvas to match the current (possibly scaled) drop size
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";

    const data = canvasDataMap.get(canvas);
    if (!data) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const path of data.paths) {
      if (path.points.length < 2) continue;
      ctx.strokeStyle = path.color;
      // Scale line width proportionally
      ctx.lineWidth = path.lineWidth * scale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(path.points[0].x * canvas.width, path.points[0].y * canvas.height);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x * canvas.width, path.points[i].y * canvas.height);
      }
      ctx.stroke();
    }
  });
};

// Restore canvases to display size after export
const restoreAllCanvases = () => {
  const canvases = document.querySelectorAll(".drawing-canvas");
  canvases.forEach((canvas) => {
    const drop = canvas.parentElement;
    const rect = drop.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    redrawCanvas(canvas, dpr);
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

    console.log(`🟣960 🟣 script:462 e`, { e });
    
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
      img.style.display = "flex";
      img.src = src;
      img.alt = "";
      span.style.display = "none";

      // Check if dragged from toolbar — remove from toolbar
      const source = e.dataTransfer.getData("source");
      const draggedId = e.dataTransfer.getData("id");
      if (source === "toolbar" && draggedId) {
        removeToolbarItemById(draggedId);
        return;
      }

      if (draggedId === img.id) {
        return;
      }

      if (draggedId) {
        const srcImg = document.getElementById(draggedId);
        if (srcImg) {
          srcImg.removeAttribute("src");
          srcImg.style.display = "none";
          srcImg.alt = "";
          const parent = srcImg.closest(".drop");
          if (parent) {
            parent.style.border = "var(--border)";
            const parentSpan = parent.querySelector("span");
            if (parentSpan) parentSpan.style.display = "block";
          }
        }
      }

      // Transfer note text
      const noteText = e.dataTransfer.getData("note");
      if (noteText) {
        const destTextarea = cell.querySelector("textarea");
        if (destTextarea) destTextarea.value = noteText;

        // Clear source textarea
        const srcImgEl = e.dataTransfer.getData("id")
          ? document.getElementById(e.dataTransfer.getData("id"))
          : null;
        if (srcImgEl) {
          const srcCell = srcImgEl.closest(".grid-cell");
          if (srcCell) {
            const srcTextarea = srcCell.querySelector("textarea");
            if (srcTextarea) srcTextarea.value = "";
          }
        }
      }
    }
  });

  attachDragTo(img);
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
  gridEl.style.gridTemplateColumns = `repeat(${gridCols}, minmax(150px, 1fr))`;
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
  const newHeight = Math.max(100, startHeight + delta);
  bottomToolbar.style.height = newHeight + "px";
  bottomToolbarInner.style.minHeight = (newHeight - 24) + "px";

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

  item.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", dataUrl);
    e.dataTransfer.setData("id", id);
    e.dataTransfer.setData("source", "toolbar");
    e.dataTransfer.effectAllowed = "move";
  });

  // Insert before the drop zone
  bottomToolbarInner.insertBefore(item, bottomToolbarDrop);
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
        addImageToToolbar(event.target.result);
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

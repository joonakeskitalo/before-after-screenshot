import state from './state.js';
import { initDrawingCanvas } from './drawing.js';
import { enableDrawingMode, disableDrawingMode, updateDrawingCursor, updatePresetColorSelection, isColorDark } from './drawing-tools.js';
import { renderPaths } from './drawing-render.js';
import { FILTER_OPTIONS, FILTER_LABELS } from './color-filter.js';
import { showToast } from './toast.js';
import { COLOR_MATRICES, applyFilterToImageData, generateWorkerSource } from './filter-kernels.js';
import { imgToBlob } from './export-utils.js';
import { TOOL_NAMES } from './constants.js';

export { COLOR_MATRICES };

export const applyFilterToCanvas = (sourceCanvas, filter) => {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = w;
  outCanvas.height = h;
  const ctx = outCanvas.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0);

  if (filter === "none") return outCanvas;

  const imageData = ctx.getImageData(0, 0, w, h);
  applyFilterToImageData(imageData, filter);
  ctx.putImageData(imageData, 0, 0);
  return outCanvas;
};

// --- Worker pool for off-main-thread filter application ---
const WORKER_POOL_SIZE = navigator.hardwareConcurrency || 4;
const workerPool = [];
let workerRoundRobin = 0;
let workerIdCounter = 0;
let workerBlobUrl = null;

const getWorkerBlobUrl = () => {
  if (workerBlobUrl) return workerBlobUrl;
  const workerSource = generateWorkerSource();
  const blob = new Blob([workerSource], { type: "application/javascript" });
  workerBlobUrl = URL.createObjectURL(blob);
  return workerBlobUrl;
};

const initWorkerPool = () => {
  if (workerPool.length > 0) return;
  const url = getWorkerBlobUrl();
  for (let i = 0; i < WORKER_POOL_SIZE; i++) {
    const worker = new Worker(url);
    worker._pending = new Map();
    worker.onmessage = (e) => {
      const { id, type, blob, error } = e.data;
      const pending = worker._pending.get(id);
      if (!pending) return;
      worker._pending.delete(id);
      if (type === "result") {
        pending.resolve(blob);
      } else {
        pending.reject(new Error(error));
      }
    };
    workerPool.push(worker);
  }
};

const applyFilterViaWorker = (imageBitmap, filter) => {
  initWorkerPool();
  const id = workerIdCounter++;
  const worker = workerPool[workerRoundRobin % workerPool.length];
  workerRoundRobin++;
  return new Promise((resolve, reject) => {
    worker._pending.set(id, { resolve, reject });
    worker.postMessage({ type: "apply", imageBitmap, filter, id }, [imageBitmap]);
  });
};

// Track the active filter preview overlay for toggle and update behavior
let filterPreviewOverlay = null;
let filterPreviewGrid = null;
let filterPreviewBuildFn = null;
let filterPreviewEscHandler = null;

// Track blob URLs created for filter preview images so we can revoke them on cleanup
let filterPreviewBlobUrls = [];

const revokeFilterPreviewBlobs = () => {
  for (const url of filterPreviewBlobUrls) {
    URL.revokeObjectURL(url);
  }
  filterPreviewBlobUrls = [];
};

export const closeFilterPreview = () => {
  if (filterPreviewOverlay) {
    revokeFilterPreviewBlobs();
    filterPreviewOverlay.remove();
    filterPreviewOverlay = null;
    filterPreviewGrid = null;
    filterPreviewBuildFn = null;
    state.onFocusedCellChange = null;
    state.onDrawingToolChange = null;
  }
  if (filterPreviewEscHandler) {
    document.removeEventListener("keydown", filterPreviewEscHandler);
    filterPreviewEscHandler = null;
  }
};

// Async helper: bake drawings onto a preview cell's image and return a Blob.
const bakePreviewCellToBlob = async (cell) => {
  const container = cell.querySelector(".filter-preview-img-container");
  if (!container) return null;
  const img = container.querySelector("img");
  const canvas = container.querySelector(".drawing-canvas");
  if (!img || !img.src) return null;

  const data = canvas ? state.canvasDataMap.get(canvas) : null;
  if (!data || data.paths.length === 0) {
    return imgToBlob(img);
  }

  // Has drawings — composite onto a temp canvas and convert to blob
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = img.naturalWidth;
  tempCanvas.height = img.naturalHeight;
  const ctx = tempCanvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const toX = (nx) => nx * tempCanvas.width;
  const toY = (ny) => ny * tempCanvas.height;

  // scale = 1 because toX/toY already map to full-resolution pixel coords
  renderPaths(ctx, data.paths, toX, toY, 1);

  return new Promise((resolve) => {
    tempCanvas.toBlob((blob) => resolve(blob), "image/png");
  });
};

// Helper: get filename for a preview cell
const getPreviewCellName = (cell) => {
  const container = cell.querySelector(".filter-preview-img-container");
  const img = container?.querySelector("img");
  const filterLabel = cell.querySelector(".filter-label");
  return (img?.alt || filterLabel?.textContent || "filtered") + ".png";
};

// Shared helper: render the preview grid into an OffscreenCanvas
const renderPreviewGrid = async (overlay) => {
  const rows = overlay.querySelectorAll(".filter-preview-row");
  if (rows.length === 0) return null;

  const rowImages = [];
  for (const row of rows) {
    const cells = row.querySelectorAll(".filter-preview-cell");
    const imgs = [];
    for (const cell of cells) {
      const blob = await bakePreviewCellToBlob(cell);
      if (blob) {
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        await img.decode();
        imgs.push(img);
      }
    }
    if (imgs.length > 0) rowImages.push(imgs);
  }

  if (rowImages.length === 0) return null;

  const filters = FILTER_OPTIONS;
  const gap = 4;

  const scaleSelect = document.getElementById("copy-scale");
  const scaleValue = scaleSelect.value;
  let imageScale;
  if (scaleValue.startsWith("output-")) {
    imageScale = parseFloat(scaleValue.replace("output-", ""));
  } else {
    imageScale = parseFloat(scaleValue);
  }

  const maxNatW = Math.round(Math.max(...rowImages.flat().map((img) => img.naturalWidth)) * imageScale);
  const maxNatH = Math.round(Math.max(...rowImages.flat().map((img) => img.naturalHeight)) * imageScale);

  const labelFontSize = Math.max(14, Math.round(maxNatW * 0.03));
  const labelHeight = labelFontSize + 12;

  const cellW = maxNatW;
  const cellH = maxNatH + labelHeight;

  const cols = filters.length;
  const numRows = rowImages.length;

  const totalW = cols * cellW + (cols - 1) * gap;
  const totalH = numRows * cellH + (numRows - 1) * gap;

  const canvas = new OffscreenCanvas(totalW, totalH);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalW, totalH);

  for (let r = 0; r < numRows; r++) {
    const imgs = rowImages[r];
    for (let c = 0; c < imgs.length; c++) {
      const img = imgs[c];
      const x = c * (cellW + gap);
      const y = r * (cellH + gap);

      const scale = Math.min(cellW / img.naturalWidth, maxNatH / img.naturalHeight);
      const drawW = Math.round(img.naturalWidth * scale);
      const drawH = Math.round(img.naturalHeight * scale);
      const imgX = x + Math.round((cellW - drawW) / 2);
      const imgY = y + Math.round((maxNatH - drawH) / 2);

      ctx.drawImage(img, imgX, imgY, drawW, drawH);
      URL.revokeObjectURL(img.src);

      ctx.fillStyle = "#333333";
      ctx.font = `500 ${labelFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(FILTER_LABELS[filters[c]] || filters[c], x + cellW / 2, y + maxNatH + 6);
    }
  }

  return canvas;
};

// Clone an ImageBitmap by drawing it onto an OffscreenCanvas and creating a new bitmap.
// This avoids re-decoding the source image for each filter variant.
const cloneBitmap = (sourceBitmap) => {
  const canvas = new OffscreenCanvas(sourceBitmap.width, sourceBitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(sourceBitmap, 0, 0);
  return createImageBitmap(canvas);
};

// Helper: populate the grid element with filter previews for given images.
// Uses a Web Worker pool to offload pixel manipulation off the main thread.
const buildGridContent = async (targetGrid, images) => {
  revokeFilterPreviewBlobs();
  targetGrid.replaceChildren();

  const filters = FILTER_OPTIONS;

  for (const { img, name } of images) {
    const rowContainer = document.createElement("div");

    if (name) {
      const rowLabel = document.createElement("div");
      rowLabel.className = "filter-preview-row-label";
      rowLabel.textContent = name;
      rowLabel.title = name;
      rowContainer.appendChild(rowLabel);
    }

    const row = document.createElement("div");
    row.className = "filter-preview-row";

    // Decode the source image once, then clone for each filter
    const sourceBitmap = await createImageBitmap(img);
    const aspectRatio = sourceBitmap.width / sourceBitmap.height;
    const srcWidth = sourceBitmap.width;
    const srcHeight = sourceBitmap.height;
    const filterResults = await Promise.all(filters.map(async (filter) => {
      // Clone the already-decoded bitmap instead of re-decoding the source
      const bitmap = await cloneBitmap(sourceBitmap);
      const blob = await applyFilterViaWorker(bitmap, filter);
      const url = URL.createObjectURL(blob);
      filterPreviewBlobUrls.push(url);
      return { filter, blobUrl: url };
    }));
    // Release the source bitmap now that all clones have been made
    sourceBitmap.close();

    for (const { filter, blobUrl } of filterResults) {
      const cell = document.createElement("div");
      cell.className = "filter-preview-cell";

      const filteredImg = document.createElement("img");
      filteredImg.src = blobUrl;
      filteredImg.alt = `${name} - ${FILTER_LABELS[filter]}`;
      filteredImg.width = srcWidth;
      filteredImg.height = srcHeight;

      const imgContainer = document.createElement("div");
      imgContainer.className = "filter-preview-img-container";
      imgContainer.style.aspectRatio = `${aspectRatio}`;
      imgContainer.appendChild(filteredImg);

      initDrawingCanvas(imgContainer);

      const actions = document.createElement("div");
      actions.className = "filter-preview-cell-actions";

      const copyClipBtn = document.createElement("button");
      copyClipBtn.className = "filter-preview-action-btn";
      copyClipBtn.title = "Copy to clipboard";
      copyClipBtn.textContent = "📋";
      copyClipBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const blob = await bakePreviewCellToBlob(cell);
        if (!blob) return;
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          copyClipBtn.textContent = "✓";
          setTimeout(() => { copyClipBtn.textContent = "📋"; }, 1200);
        } catch (err) {
          console.error("Failed to copy to clipboard:", err);
          showToast("Failed to copy — check clipboard permissions", "error");
        }
      });

      const addStagingBtn = document.createElement("button");
      addStagingBtn.className = "filter-preview-action-btn";
      addStagingBtn.title = "Add to staging";
      addStagingBtn.textContent = "⬇";
      addStagingBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const blob = await bakePreviewCellToBlob(cell);
        if (!blob) return;
        state.addImageToToolbar(URL.createObjectURL(blob), getPreviewCellName(cell));
        addStagingBtn.textContent = "✓";
        setTimeout(() => { addStagingBtn.textContent = "⬇"; }, 1200);
      });

      actions.appendChild(copyClipBtn);
      actions.appendChild(addStagingBtn);

      const label = document.createElement("span");
      label.className = "filter-label";
      label.textContent = FILTER_LABELS[filter] || filter;

      cell.appendChild(imgContainer);
      cell.appendChild(actions);
      cell.appendChild(label);
      row.appendChild(cell);
    }

    rowContainer.appendChild(row);
    targetGrid.appendChild(rowContainer);
  }
};

// Build an inline drawing controls toolbar for the filter preview panel
const buildFilterPreviewDrawingControls = () => {
  const controls = document.createElement("div");
  controls.className = "filter-preview-drawing-controls toolbar-drawing-controls";

  // Color picker
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = state.drawColor;
  colorInput.title = "Draw color";
  colorInput.addEventListener("input", (e) => {
    state.drawColor = e.target.value;
    const mainColorInput = document.getElementById("draw-color");
    if (mainColorInput) mainColorInput.value = state.drawColor;
    updatePresetColorSelection();
    updateLocalPresetSelection(controls);
    updateDrawingCursor();
  });
  controls.appendChild(colorInput);

  // Preset color buttons
  const presetColors = [
    { color: "#ff0000", title: "Red" },
    { color: "#0066ff", title: "Blue" },
    { color: "#00b341", title: "Green" },
    { color: "#000000", title: "Black" },
    { color: "#353535", title: "Dark grey" },
    { color: "#dfdfdf", title: "Light grey" },
    { color: "#ffffff", title: "White" },
  ];
  for (const { color, title } of presetColors) {
    const btn = document.createElement("button");
    btn.className = "preset-color-btn";
    btn.dataset.color = color;
    btn.title = title;
    btn.style.cssText = `width:20px;height:20px;min-width:20px;padding:0;background-color:${color};border-radius:50%;border:2px solid #3333333a`;
    if (color === "#ffffff") btn.style.borderColor = "#33333369";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.drawColor = color;
      colorInput.value = color;
      const mainColorInput = document.getElementById("draw-color");
      if (mainColorInput) mainColorInput.value = color;
      updatePresetColorSelection();
      updateLocalPresetSelection(controls);
      updateDrawingCursor();
    });
    controls.appendChild(btn);
  }

  // Divider
  const div1 = document.createElement("div");
  div1.className = "toolbar-divider";
  controls.appendChild(div1);

  // Thickness presets
  const thicknessContainer = document.createElement("div");
  thicknessContainer.className = "thickness-presets";
  const thicknesses = [
    { width: 2, strokeWidth: "1.5", title: "Thin" },
    { width: 4, strokeWidth: "3", title: "Medium" },
    { width: 8, strokeWidth: "5.5", title: "Thick" },
  ];
  for (const { width, strokeWidth, title } of thicknesses) {
    const btn = document.createElement("button");
    btn.className = "thickness-btn" + (state.drawLineWidth === width ? " active" : "");
    btn.dataset.width = String(width);
    btn.title = title;
    btn.innerHTML = `<svg width="16" height="16"><line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round"/></svg>`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.drawLineWidth = width;
      thicknessContainer.querySelectorAll(".thickness-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      // Sync main toolbar thickness buttons
      document.querySelectorAll(".toolbar-drawing-controls:not(.filter-preview-drawing-controls) .thickness-btn").forEach((b) => {
        b.classList.toggle("active", parseInt(b.dataset.width, 10) === width);
      });
      updateDrawingCursor();
    });
    thicknessContainer.appendChild(btn);
  }
  controls.appendChild(thicknessContainer);

  // Divider
  const div2 = document.createElement("div");
  div2.className = "toolbar-divider";
  controls.appendChild(div2);

  // Tool buttons
  const tools = [
    { name: TOOL_NAMES.FREEHAND, label: "✎", title: "Pen tool" },
    { name: TOOL_NAMES.ARROW, label: "↗", title: "Arrow tool" },
    { name: TOOL_NAMES.LINE, label: "╱", title: "Line tool" },
    { name: TOOL_NAMES.RECT, label: "■", title: "Solid rectangle" },
    { name: TOOL_NAMES.RECTSTROKE, label: "□", title: "Bordered rectangle" },
    { name: TOOL_NAMES.OVAL, label: "○", title: "Oval tool" },
    { name: TOOL_NAMES.OVALFILL, label: "●", title: "Solid oval" },
    { name: TOOL_NAMES.DOT, label: "•", title: "Dot tool" },
    { name: TOOL_NAMES.ERASER, label: "⌫", title: "Eraser tool" },
    { name: TOOL_NAMES.OBJECT_ERASER, label: "⌦", title: "Object eraser" },
    { name: TOOL_NAMES.MOVE, label: "✥", title: "Move tool" },
  ];

  const toolButtons = [];
  for (const { name, label, title } of tools) {
    const btn = document.createElement("button");
    btn.className = "tool-mode-btn" + (state.drawingMode && state.drawTool === name ? " active" : "");
    btn.dataset.tool = name;
    btn.title = title;
    btn.textContent = label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Toggle off if already active
      if (state.drawTool === name && state.drawingMode) {
        disableDrawingMode();
        toolButtons.forEach((b) => b.classList.remove("active"));
        textBtn.classList.remove("active");
        return;
      }
      state.drawTool = name;
      toolButtons.forEach((b) => b.classList.remove("active"));
      textBtn.classList.remove("active");
      btn.classList.add("active");
      // Remove tool body classes and add appropriate one
      document.body.classList.remove("text-tool", "eraser-tool", "move-tool");
      if (name === TOOL_NAMES.ERASER || name === TOOL_NAMES.OBJECT_ERASER) document.body.classList.add("eraser-tool");
      if (name === TOOL_NAMES.MOVE) document.body.classList.add("move-tool");
      enableDrawingMode();
    });
    toolButtons.push(btn);
    controls.appendChild(btn);
  }

  // Divider
  const div3 = document.createElement("div");
  div3.className = "toolbar-divider";
  controls.appendChild(div3);

  // Text tool
  const textBtn = document.createElement("button");
  textBtn.className = "tool-mode-btn" + (state.drawingMode && state.drawTool === TOOL_NAMES.TEXT ? " active" : "");
  textBtn.dataset.tool = TOOL_NAMES.TEXT;
  textBtn.title = "Text tool";
  textBtn.textContent = "T";
  textBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.drawTool === TOOL_NAMES.TEXT && state.drawingMode) {
      disableDrawingMode();
      textBtn.classList.remove("active");
      toolButtons.forEach((b) => b.classList.remove("active"));
      return;
    }
    state.drawTool = TOOL_NAMES.TEXT;
    toolButtons.forEach((b) => b.classList.remove("active"));
    textBtn.classList.add("active");
    document.body.classList.remove("eraser-tool", "move-tool");
    document.body.classList.add("text-tool");
    enableDrawingMode();
  });
  controls.appendChild(textBtn);

  // Font size input
  const fontSizeInput = document.createElement("input");
  fontSizeInput.type = "number";
  fontSizeInput.min = "8";
  fontSizeInput.max = "72";
  fontSizeInput.value = state.drawFontSize;
  fontSizeInput.title = "Text size";
  fontSizeInput.style.cssText = "width:42px;height:28px;font-size:10pt;border-radius:6px;border:1px solid oklch(92.8% 0.006 264.531);text-align:center;";
  fontSizeInput.addEventListener("input", (e) => {
    state.drawFontSize = parseInt(e.target.value, 10) || 13;
    const mainFontSize = document.getElementById("draw-font-size");
    if (mainFontSize) mainFontSize.value = state.drawFontSize;
  });
  controls.appendChild(fontSizeInput);

  // Apply initial preset color selection
  updateLocalPresetSelection(controls);

  return controls;
};

// Update preset color button selection within a local controls container
const updateLocalPresetSelection = (container) => {
  container.querySelectorAll(".preset-color-btn").forEach((b) => {
    if (b.dataset.color === state.drawColor) {
      if (isColorDark(b.dataset.color)) {
        b.style.boxShadow = "0 0 0 2px #9d9d9dc3";
      } else {
        b.style.boxShadow = "0 0 0 2px #00000069";
      }
    } else {
      b.style.boxShadow = "none";
      b.style.borderColor = b.dataset.color === "#ffffff" ? "#33333369" : "#3333333a";
    }
  });
};

export const previewAllFilters = async () => {
  // Toggle: close if already open
  if (filterPreviewOverlay) {
    closeFilterPreview();
    return;
  }

  const allCells = state.getCells();

  const indices = state.selectedCells.size > 0
    ? [...state.selectedCells].sort((a, b) => a - b)
    : state.selectedRows.size > 0
      ? allCells.reduce((acc, cell, i) => {
          if (state.selectedRows.has(parseInt(cell.dataset.row, 10))) acc.push(i);
          return acc;
        }, [])
      : state.focusedCellIndex >= 0
        ? [state.focusedCellIndex]
        : [];

  if (indices.length === 0) return;

  const sourceImages = [];
  for (const idx of indices) {
    const cell = allCells[idx];
    if (!cell) continue;
    const img = cell.querySelector("img");
    if (img && img.src && img.style.display !== "none") {
      sourceImages.push({ img, name: img.alt || "" });
    }
  }

  if (sourceImages.length === 0) return;

  // Create overlay (hidden until content is ready to avoid flicker)
  const overlay = document.createElement("div");
  overlay.className = "filter-preview-overlay";
  overlay.style.opacity = "0";

  const panel = document.createElement("div");
  panel.className = "filter-preview-panel";

  // Header
  const header = document.createElement("div");
  header.className = "filter-preview-header";
  const title = document.createElement("h3");
  title.textContent = "Filter Preview";

  const headerBtns = document.createElement("div");
  headerBtns.style.display = "flex";
  headerBtns.style.alignItems = "center";
  headerBtns.style.gap = "8px";

  // Add all to staging button
  const copyToStagingBtn = document.createElement("button");
  copyToStagingBtn.className = "filter-preview-copy-btn";
  copyToStagingBtn.textContent = "Add all to staging";
  copyToStagingBtn.title = "Copy all filtered preview images (with drawings) to the staging area";
  copyToStagingBtn.addEventListener("click", async () => {
    const previewCells = overlay.querySelectorAll(".filter-preview-cell");
    for (const cell of previewCells) {
      const blob = await bakePreviewCellToBlob(cell);
      if (blob) {
        state.addImageToToolbar(URL.createObjectURL(blob), getPreviewCellName(cell));
      }
    }
  });

  // Copy with filters button
  const copyWithFiltersBtn = document.createElement("button");
  copyWithFiltersBtn.className = "filter-preview-copy-btn";
  copyWithFiltersBtn.textContent = "Copy with filters";
  copyWithFiltersBtn.title = "Copy all preview images (with drawings) as a single grid image to clipboard";
  copyWithFiltersBtn.addEventListener("click", async () => {
    const canvas = await renderPreviewGrid(overlay);
    if (!canvas) return;
    try {
      const blob = await canvas.convertToBlob({ type: "image/png" });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      copyWithFiltersBtn.textContent = "Copied ✓";
      setTimeout(() => { copyWithFiltersBtn.textContent = "Copy with filters"; }, 1500);
    } catch (err) {
      console.error("Failed to copy with filters:", err);
      showToast("Failed to copy — check clipboard permissions", "error");
    }
  });

  // Stage merged grid image button
  const stageMergedBtn = document.createElement("button");
  stageMergedBtn.className = "filter-preview-copy-btn";
  stageMergedBtn.textContent = "Add as merged to staging";
  stageMergedBtn.title = "Add the combined filter grid image (with drawings) to the staging area";
  stageMergedBtn.addEventListener("click", async () => {
    const canvas = await renderPreviewGrid(overlay);
    if (!canvas) return;
    const blob = await canvas.convertToBlob({ type: "image/png" });
    state.addImageToToolbar(URL.createObjectURL(blob), "filter-grid.png");
    stageMergedBtn.textContent = "Staged ✓";
    setTimeout(() => { stageMergedBtn.textContent = "Stage merged"; }, 1500);
  });

  const closeBtn = document.createElement("button");
  closeBtn.className = "filter-preview-close";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => closeFilterPreview());

  header.appendChild(title);
  headerBtns.appendChild(copyToStagingBtn);
  headerBtns.appendChild(stageMergedBtn);
  headerBtns.appendChild(copyWithFiltersBtn);
  headerBtns.appendChild(closeBtn);
  header.appendChild(headerBtns);
  panel.appendChild(header);

  // Drawing controls
  const drawingControls = buildFilterPreviewDrawingControls();
  panel.appendChild(drawingControls);

  // Body
  const body = document.createElement("div");
  body.className = "filter-preview-body";

  const grid = document.createElement("div");
  grid.className = "filter-preview-grid";
  filterPreviewGrid = grid;
  filterPreviewBuildFn = buildGridContent;

  // Build initial content
  await buildGridContent(grid, sourceImages);

  body.appendChild(grid);
  panel.appendChild(body);
  overlay.appendChild(panel);
  filterPreviewOverlay = overlay;

  // Close on overlay background click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeFilterPreview();
  });

  // Close on Escape
  const handleEsc = (e) => {
    if (e.key === "Escape") {
      closeFilterPreview();
    }
  };
  filterPreviewEscHandler = handleEsc;
  document.addEventListener("keydown", handleEsc);

  document.body.appendChild(overlay);

  // Wait for all preview images to decode, then reveal the overlay
  const previewImages = overlay.querySelectorAll(".filter-preview-img-container img");
  await Promise.all(Array.from(previewImages).map((img) => img.decode().catch(() => {})));
  overlay.style.opacity = "";

  // Register drawing tool change listener to sync filter preview controls
  state.onDrawingToolChange = () => {
    if (!filterPreviewOverlay) return;
    const controls = filterPreviewOverlay.querySelector(".filter-preview-drawing-controls");
    if (!controls) return;
    // Sync tool button active states
    controls.querySelectorAll(".tool-mode-btn").forEach((btn) => {
      const toolName = btn.dataset.tool;
      btn.classList.toggle("active", state.drawingMode && state.drawTool === toolName);
    });
    // Sync color and thickness
    const colorInput = controls.querySelector('input[type="color"]');
    if (colorInput) colorInput.value = state.drawColor;
    updateLocalPresetSelection(controls);
    controls.querySelectorAll(".thickness-btn").forEach((b) => {
      b.classList.toggle("active", parseInt(b.dataset.width, 10) === state.drawLineWidth);
    });
    const fontInput = controls.querySelector('input[type="number"]');
    if (fontInput) fontInput.value = state.drawFontSize;
  };

  // Register focus change listener to update preview when navigating cells
  let focusChangeGeneration = 0;
  state.onFocusedCellChange = async (newIndex) => {
    if (!filterPreviewOverlay || !filterPreviewGrid || !filterPreviewBuildFn) return;
    const cells = state.getCells();
    if (newIndex < 0 || newIndex >= cells.length) return;
    const cell = cells[newIndex];
    const img = cell.querySelector("img");
    if (!img || !img.src || img.style.display === "none") return;

    // Increment generation to discard stale updates from rapid navigation
    const gen = ++focusChangeGeneration;

    // Build new content into an off-screen container to avoid flashing
    const tempGrid = document.createElement("div");
    await filterPreviewBuildFn(tempGrid, [{ img, name: img.alt || "" }]);

    // Bail if a newer navigation happened or the preview was closed
    if (gen !== focusChangeGeneration) return;
    if (!filterPreviewOverlay || !filterPreviewGrid) return;

    // Wait for all images to fully decode before swapping
    const newImages = tempGrid.querySelectorAll("img");
    await Promise.all(Array.from(newImages).map((i) => i.decode().catch(() => {})));

    // Re-check after async decode
    if (gen !== focusChangeGeneration) return;
    if (!filterPreviewOverlay || !filterPreviewGrid) return;

    // Swap content atomically — images are already decoded so no flicker
    filterPreviewGrid.replaceChildren();
    while (tempGrid.firstChild) {
      filterPreviewGrid.appendChild(tempGrid.firstChild);
    }

    if (state.drawingMode) {
      filterPreviewGrid.querySelectorAll(".drawing-canvas").forEach((c) => c.classList.add("active"));
    }
  };
};

document.getElementById("preview-all-filters-btn").addEventListener("click", previewAllFilters);

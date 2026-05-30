import state from './state.js';
import { initDrawingCanvas } from './drawing.js';
import { FILTER_OPTIONS, FILTER_LABELS } from './color-filter.js';

// Color matrix definitions matching the SVG filters
const COLOR_MATRICES = {
  "protanopia": [
    0.567, 0.433, 0, 0, 0,
    0.558, 0.442, 0, 0, 0,
    0, 0.242, 0.758, 0, 0,
    0, 0, 0, 1, 0,
  ],
  "deuteranopia": [
    0.625, 0.375, 0, 0, 0,
    0.7, 0.3, 0, 0, 0,
    0, 0.3, 0.7, 0, 0,
    0, 0, 0, 1, 0,
  ],
  "tritanopia": [
    0.95, 0.05, 0, 0, 0,
    0, 0.433, 0.567, 0, 0,
    0, 0.475, 0.525, 0, 0,
    0, 0, 0, 1, 0,
  ],
  "achromatopsia": [
    0.299, 0.587, 0.114, 0, 0,
    0.299, 0.587, 0.114, 0, 0,
    0.299, 0.587, 0.114, 0, 0,
    0, 0, 0, 1, 0,
  ],
};

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
  const d = imageData.data;

  if (filter === "grayscale") {
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = gray;
    }
  } else if (filter === "low-contrast") {
    const factor = 0.85;
    const intercept = 128 * (1 - factor);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, d[i] * factor + intercept));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] * factor + intercept));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] * factor + intercept));
    }
  } else if (filter === "high-contrast") {
    const factor = 1.5;
    const intercept = 128 * (1 - factor);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, d[i] * factor + intercept));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] * factor + intercept));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] * factor + intercept));
    }
  } else if (COLOR_MATRICES[filter]) {
    const matrix = COLOR_MATRICES[filter];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      d[i] = Math.min(255, Math.max(0, matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4] * 255));
      d[i + 1] = Math.min(255, Math.max(0, matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9] * 255));
      d[i + 2] = Math.min(255, Math.max(0, matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14] * 255));
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return outCanvas;
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
    const resp = await fetch(img.src);
    return resp.blob();
  }

  // Has drawings — composite onto a temp canvas and convert to blob
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = img.naturalWidth;
  tempCanvas.height = img.naturalHeight;
  const ctx = tempCanvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const toX = (nx) => nx * tempCanvas.width;
  const toY = (ny) => ny * tempCanvas.height;

  for (const path of data.paths) {
    ctx.strokeStyle = path.color;
    ctx.lineWidth = path.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (path.type === "text") {
      const fontSize = path.fontSize || 13;
      const lineHeight = fontSize * 1.3;
      ctx.font = `500 ${fontSize}px "Inter", system-ui, sans-serif`;
      ctx.textBaseline = "top";
      const x = toX(path.position.x);
      const y = toY(path.position.y);
      const lines = path.text.split("\n");
      const maxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const totalHeight = fontSize + (lines.length - 1) * lineHeight;
      const padding = 4;
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      const radius = fontSize * 0.2;
      ctx.beginPath();
      ctx.roundRect(x - padding, y - padding, maxWidth + padding * 2, totalHeight + padding * 2, radius);
      ctx.fill();
      ctx.fillStyle = path.color;
      lines.forEach((line, i) => {
        ctx.fillText(line, x, y + i * lineHeight);
      });
    } else if (path.type === "arrow" || path.type === "line") {
      const fromX = toX(path.from.x);
      const fromY = toY(path.from.y);
      const toXv = toX(path.to.x);
      const toYv = toY(path.to.y);
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toXv, toYv);
      ctx.stroke();
      if (path.type === "arrow") {
        const headLength = Math.max(10, path.lineWidth * 4);
        const angle = Math.atan2(toYv - fromY, toXv - fromX);
        ctx.beginPath();
        ctx.moveTo(toXv, toYv);
        ctx.lineTo(toXv - headLength * Math.cos(angle - Math.PI / 6), toYv - headLength * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(toXv, toYv);
        ctx.lineTo(toXv - headLength * Math.cos(angle + Math.PI / 6), toYv - headLength * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
    } else if (path.type === "rect") {
      const rx = toX(Math.min(path.from.x, path.to.x));
      const ry = toY(Math.min(path.from.y, path.to.y));
      const rw = toX(Math.max(path.from.x, path.to.x)) - rx;
      const rh = toY(Math.max(path.from.y, path.to.y)) - ry;
      ctx.fillStyle = path.color;
      ctx.fillRect(rx, ry, rw, rh);
    } else if (path.type === "rectstroke") {
      const rx = toX(Math.min(path.from.x, path.to.x));
      const ry = toY(Math.min(path.from.y, path.to.y));
      const rw = toX(Math.max(path.from.x, path.to.x)) - rx;
      const rh = toY(Math.max(path.from.y, path.to.y)) - ry;
      ctx.strokeRect(rx, ry, rw, rh);
    } else if (path.type === "oval") {
      const rx = toX(Math.min(path.from.x, path.to.x));
      const ry = toY(Math.min(path.from.y, path.to.y));
      const rw = toX(Math.max(path.from.x, path.to.x)) - rx;
      const rh = toY(Math.max(path.from.y, path.to.y)) - ry;
      ctx.beginPath();
      ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (path.type === "ovalfill") {
      const rx = toX(Math.min(path.from.x, path.to.x));
      const ry = toY(Math.min(path.from.y, path.to.y));
      const rw = toX(Math.max(path.from.x, path.to.x)) - rx;
      const rh = toY(Math.max(path.from.y, path.to.y)) - ry;
      ctx.fillStyle = path.color;
      ctx.beginPath();
      ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (path.type === "dot") {
      const cx = toX(path.position.x);
      const cy = toY(path.position.y);
      const radius = path.lineWidth + 4;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = path.color;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    } else if (path.type === "eraser") {
      if (path.points && path.points.length >= 2) {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.lineWidth = path.lineWidth + 8;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(toX(path.points[0].x), toY(path.points[0].y));
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(toX(path.points[i].x), toY(path.points[i].y));
        }
        ctx.stroke();
        ctx.restore();
      }
    } else if (path.points && path.points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(toX(path.points[0].x), toY(path.points[0].y));
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(toX(path.points[i].x), toY(path.points[i].y));
      }
      ctx.stroke();
    }
  }

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

// Helper: populate the grid element with filter previews for given images
const buildGridContent = async (targetGrid, images) => {
  revokeFilterPreviewBlobs();
  targetGrid.innerHTML = "";

  const filters = FILTER_OPTIONS;

  // Helper: convert a canvas to a blob URL asynchronously
  const canvasToBlobUrl = (canvas) => {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        filterPreviewBlobUrls.push(url);
        resolve(url);
      }, "image/png");
    });
  };

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

    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = img.naturalWidth;
    srcCanvas.height = img.naturalHeight;
    const srcCtx = srcCanvas.getContext("2d");
    srcCtx.drawImage(img, 0, 0);

    const filterResults = await Promise.all(filters.map(async (filter) => {
      const filteredCanvas = applyFilterToCanvas(srcCanvas, filter);
      const blobUrl = await canvasToBlobUrl(filteredCanvas);
      return { filter, blobUrl };
    }));

    for (const { filter, blobUrl } of filterResults) {
      const cell = document.createElement("div");
      cell.className = "filter-preview-cell";

      const filteredImg = document.createElement("img");
      filteredImg.src = blobUrl;
      filteredImg.alt = `${name} - ${FILTER_LABELS[filter]}`;

      const imgContainer = document.createElement("div");
      imgContainer.className = "filter-preview-img-container";
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
          if (state.selectedRows.has(parseInt(cell.dataset.row))) acc.push(i);
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

  // Create overlay
  const overlay = document.createElement("div");
  overlay.className = "filter-preview-overlay";

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

  // Register focus change listener to update preview when navigating cells
  state.onFocusedCellChange = async (newIndex) => {
    if (!filterPreviewOverlay || !filterPreviewGrid || !filterPreviewBuildFn) return;
    const cells = state.getCells();
    if (newIndex < 0 || newIndex >= cells.length) return;
    const cell = cells[newIndex];
    const img = cell.querySelector("img");
    if (!img || !img.src || img.style.display === "none") return;
    await filterPreviewBuildFn(filterPreviewGrid, [{ img, name: img.alt || "" }]);
    if (state.drawingMode) {
      filterPreviewGrid.querySelectorAll(".drawing-canvas").forEach((c) => c.classList.add("active"));
    }
  };
};

document.getElementById("preview-all-filters-btn").addEventListener("click", previewAllFilters);

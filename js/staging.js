import state from './state.js';
import { updateFilenameLabel, buildGrid, toggleFilenames, insertRowAt, pushUndo } from './grid.js';
import { withoutUndo } from './undo.js';
import { isAllowedImageSrc, isAllowedImageFile } from './sanitize.js';
import {
  TOOLBAR_MIN_HEIGHT, TOOLBAR_COMPACT_THRESHOLD, TOOLBAR_PADDING_OFFSET, TOOLBAR_BODY_PADDING,
} from './constants.js';

// --- Bottom Toolbar (Staging Area) Logic ---
const bottomToolbar = document.getElementById("bottom-toolbar");
const bottomToolbarInner = document.getElementById("bottom-toolbar-inner");
const bottomToolbarDrop = document.getElementById("bottom-toolbar-drop");

// Track whether the user has manually resized the staging area
let stagingManuallyResized = false;

const updateStagingInstruction = () => {
  const hasImages = bottomToolbarInner.querySelector(".bottom-toolbar-item") !== null;
  bottomToolbarDrop.style.display = hasImages ? "none" : "";
  // Use smaller variant when no images are staged (unless user manually resized it bigger)
  if (!hasImages && !stagingManuallyResized) {
    bottomToolbar.classList.add("compact");
  } else if (hasImages) {
    bottomToolbar.classList.remove("compact");
    stagingManuallyResized = false;
  }
};

// Apply compact state on initial load (staging starts empty)
updateStagingInstruction();

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
  const newHeight = Math.max(TOOLBAR_MIN_HEIGHT, startHeight + delta);
  bottomToolbar.style.height = newHeight + "px";
  bottomToolbarInner.style.minHeight = (newHeight - TOOLBAR_PADDING_OFFSET) + "px";

  if (newHeight < TOOLBAR_COMPACT_THRESHOLD) {
    bottomToolbar.classList.add("compact");
  } else {
    bottomToolbar.classList.remove("compact");
  }

  // Resize toolbar images and drop zone to match
  const imgHeight = (newHeight - TOOLBAR_PADDING_OFFSET - TOOLBAR_PADDING_OFFSET) + "px";
  bottomToolbarInner.querySelectorAll(".bottom-toolbar-item").forEach((item) => {
    item.style.height = imgHeight;
  });
  const dropZone = bottomToolbarInner.querySelector(".bottom-toolbar-drop");
  if (dropZone) dropZone.style.height = imgHeight;

  // Update body padding so content isn't hidden behind the toolbar
  document.body.style.paddingBottom = (newHeight + TOOLBAR_BODY_PADDING) + "px";
  state.cardsEl.style.paddingBottom = (newHeight + TOOLBAR_BODY_PADDING) + "px";
});

document.addEventListener("mouseup", () => {
  if (!isResizing) return;
  isResizing = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  // Track if user resized to a non-compact height
  stagingManuallyResized = !bottomToolbar.classList.contains("compact");
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

state.addImageToToolbar = (srcUrl, fileName = "") => {
  if (!isAllowedImageSrc(srcUrl)) return;
  const item = document.createElement("div");
  item.className = "bottom-toolbar-item";
  item.draggable = true;
  const id = `toolbar-img-${Math.random().toString(36).slice(2)}`;
  item.dataset.id = id;

  const img = document.createElement("img");
  img.src = srcUrl;
  img.alt = fileName;
  img.draggable = false;

  const removeBtn = document.createElement("button");
  removeBtn.className = "toolbar-item-remove";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Revoke blob URL to free memory
    if (img.src && img.src.startsWith("blob:")) {
      URL.revokeObjectURL(img.src);
    }
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
    e.dataTransfer.setData("text/plain", img.src);
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
    const cells = state.getCells();
    for (const cell of cells) {
      const cellImg = cell.querySelector("img");
      if (!cellImg || !cellImg.src || cellImg.style.display === "none") {
        const drop = cell.querySelector(".drop");
        const span = cell.querySelector("span");
        cellImg.src = img.src;
        cellImg.alt = fileName;
        cellImg.style.display = "block";
        drop.style.border = "unset";
        if (span) span.style.display = "none";
        updateFilenameLabel(cell);
        // Remove from toolbar (don't revoke — the grid cell now owns the URL)
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

state.removeToolbarItemById = (id) => {
  const escaped = CSS.escape(id);
  const item = bottomToolbarInner.querySelector(`[data-id="${escaped}"]`);
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

  // Handle file drops (raster images only; SVGs excluded for security)
  const files = [...e.dataTransfer.files].filter(isAllowedImageFile);
  if (files.length) {
    files.forEach((file) => {
      state.addImageToToolbar(URL.createObjectURL(file), file.name);
    });
    return;
  }

  // Handle blob or data URL drops (from grid cells back to toolbar)
  const src = e.dataTransfer.getData("text/plain");
  if (src && isAllowedImageSrc(src)) {
    state.addImageToToolbar(src);
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

  const files = [...e.dataTransfer.files].filter(isAllowedImageFile);
  if (files.length) {
    files.forEach((file) => {
      state.addImageToToolbar(URL.createObjectURL(file), file.name);
    });
  }
});

// Handle paste: if a grid cell is focused, paste into it; otherwise add to toolbar
document.addEventListener("paste", function (event) {
  const items = (event.clipboardData || event.originalEvent.clipboardData).items;

  if (state.focusedCellIndex >= 0) {
    // Collect all image blobs from the clipboard (raster images only; SVGs excluded for security)
    const blobs = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const blob = item.getAsFile();
        if (blob && isAllowedImageFile(blob)) blobs.push(blob);
      }
    }
    // No image files — let the browser handle the paste normally (e.g. text into a textarea)
    if (blobs.length === 0) return;

    event.preventDefault();

    // Paste images starting at the focused cell, continuing to the right.
    // Skip cells that already have an image. If the row runs out, add a new row.
    let cellIndex = state.focusedCellIndex;
    for (const blob of blobs) {
      // Skip cells that already have an image
      while (true) {
        // Add a new row if we've run past the last cell
        if (cellIndex >= state.gridCols * state.gridRows) {
          insertRowAt(state.gridRows);
        }
        const cells = state.getCells();
        const cell = cells[cellIndex];
        const existingImg = cell && cell.querySelector("img");
        if (!existingImg || existingImg.style.display === "none" || !existingImg.src) {
          break; // Cell is empty, use it
        }
        cellIndex++;
      }

      const cells = state.getCells();
      const cell = cells[cellIndex];
      if (cell) {
        const img = cell.querySelector("img");
        const span = cell.querySelector("span");
        img.style.display = "block";
        img.src = URL.createObjectURL(blob);
        img.alt = blob.name || "";
        if (span) span.style.display = "none";
        updateFilenameLabel(cell);
      }
      cellIndex++;
    }
    return;
  }

  // No grid cell focused — add all pasted images to the toolbar staging area
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "file") {
      const blob = item.getAsFile();
      if (blob && isAllowedImageFile(blob)) {
        state.addImageToToolbar(URL.createObjectURL(blob), blob.name || "");
      }
    }
  }
});

// --- Toggle Staging Area ---
const stagingToggleBtn = document.getElementById("staging-toggle-btn");

const toggleStagingArea = () => {
  const isHidden = bottomToolbar.style.display === "none";
  if (isHidden) {
    bottomToolbar.style.display = "";
    document.body.style.paddingBottom = "";
    state.cardsEl.style.paddingBottom = "";
    stagingToggleBtn.classList.remove("active");
  } else {
    bottomToolbar.style.display = "none";
    document.body.style.paddingBottom = "32px";
    state.cardsEl.style.paddingBottom = "32px";
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

  pushUndo();

  // Count how many empty cells are currently available
  const cells = state.getCells();
  let emptyCells = cells.filter((cell) => {
    const img = cell.querySelector("img");
    return !img || !img.src || img.style.display === "none";
  });

  // If not enough empty cells, increase rows to fit all staged images
  const needed = items.length - emptyCells.length;
  if (needed > 0) {
    const extraRows = Math.ceil(needed / state.gridCols);
    for (let i = 0; i < extraRows; i++) {
      withoutUndo(() => insertRowAt(state.gridRows));
    }
    // Re-query empty cells after adding rows
    emptyCells = state.getCells().filter((cell) => {
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
    cellImg.style.display = "block";
    drop.style.border = "unset";
    if (span) span.style.display = "none";
    updateFilenameLabel(cell);

    // Remove from staging
    item.remove();
  });
  updateStagingInstruction();
});

// --- Clear Grid ---
const clearGridBtn = document.getElementById("clear-grid-btn");

clearGridBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  pushUndo();

  // Clear all cell content first
  const cells = state.getCells();
  cells.forEach((cell) => {
    const img = cell.querySelector("img");
    const drop = cell.querySelector(".drop");
    const span = cell.querySelector("span");
    const textarea = cell.querySelector("textarea");
    const canvas = cell.querySelector(".drawing-canvas");

    if (img) {
      // Revoke blob URL to free memory
      if (img.src && img.src.startsWith("blob:")) {
        URL.revokeObjectURL(img.src);
      }
      img.src = "";
      img.alt = "";
      img.style.display = "none";
    }
    if (drop) drop.style.border = "var(--border)";
    if (span) span.style.display = "block";
    if (textarea) textarea.value = "";
    if (canvas) {
      state.canvasDataMap.delete(canvas);
    }
    updateFilenameLabel(cell);
  });

  // Compact to a single row since all content is now empty
  state.gridRows = 1;
  document.getElementById("grid-rows").value = state.gridRows;
  state.selectedRows.clear();
  state.selectedCells.clear();
  state.focusedCellIndex = -1;

  buildGrid();
});

// --- Clear Staging Area ---
const clearStagingBtn = document.getElementById("clear-staging-btn");

clearStagingBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const stagedItems = bottomToolbarInner.querySelectorAll(".bottom-toolbar-item");
  stagedItems.forEach((item) => {
    const img = item.querySelector("img");
    if (img && img.src && img.src.startsWith("blob:")) {
      URL.revokeObjectURL(img.src);
    }
    item.remove();
  });
  updateStagingInstruction();
});

export { toggleStagingArea };

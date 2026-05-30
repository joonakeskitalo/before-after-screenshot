import state from './state.js';
import { updateFilenameLabel, buildGrid, toggleFilenames } from './grid.js';

// --- Bottom Toolbar Logic ---
const bottomToolbar = document.getElementById("bottom-toolbar");
const bottomToolbarInner = document.getElementById("bottom-toolbar-inner");
const bottomToolbarDrop = document.getElementById("bottom-toolbar-drop");
const bottomToolbarDropSpan = bottomToolbarDrop.querySelector("span");

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
  const newHeight = Math.max(40, startHeight + delta);
  bottomToolbar.style.height = newHeight + "px";
  bottomToolbarInner.style.minHeight = (newHeight - 24) + "px";

  // Add compact class when toolbar is narrow or has no images and hasn't been resized up
  const hasImages = bottomToolbarInner.querySelector(".bottom-toolbar-item") !== null;
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
  state.cardsEl.style.paddingBottom = (newHeight + 32) + "px";
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

state.addImageToToolbar = (dataUrl, fileName = "") => {
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
    const cells = state.getCells();
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

state.removeToolbarItemById = (id) => {
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
        state.addImageToToolbar(this.result, file.name);
      };
      reader.readAsDataURL(file);
    });
    return;
  }

  // Handle data URL drops (from grid cells back to toolbar)
  const src = e.dataTransfer.getData("text/plain");
  if (src && src.startsWith("data:")) {
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

  const files = [...e.dataTransfer.files].filter((f) =>
    f.type.startsWith("image/"),
  );
  if (files.length) {
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = function () {
        state.addImageToToolbar(this.result, file.name);
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
        state.addImageToToolbar(event.target.result, blob.name || "");
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

state.gridEl.addEventListener("mouseover", (e) => {
  const drop = e.target.closest(".grid-cell .drop");
  if (drop && e.ctrlKey) {
    const current = state.gridEl.querySelector('.drop[data-zoomed]');
    if (current !== drop) {
      removeCardZoom(current);
      applyCardZoom(drop);
    }
  }
});

state.gridEl.addEventListener("mouseout", (e) => {
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
    const zoomed = state.gridEl.querySelector('.drop[data-zoomed]');
    removeCardZoom(zoomed);
  }
});

// --- Toggle Filenames ---
const filenameToggleBtn = document.getElementById("filename-toggle-btn");
// starts inactive (filenames hidden by default)

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
    state.gridRows += extraRows;
    document.getElementById("grid-rows").value = state.gridRows;
    buildGrid();
    // Re-query empty cells after rebuilding
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
    cellImg.style.display = "flex";
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

  // Clear all cell content first
  const cells = state.getCells();
  cells.forEach((cell) => {
    const img = cell.querySelector("img");
    const drop = cell.querySelector(".drop");
    const span = cell.querySelector("span");
    const textarea = cell.querySelector("textarea");
    const canvas = cell.querySelector(".drawing-canvas");

    if (img) {
      img.src = "";
      img.alt = "";
      img.style.display = "none";
    }
    if (drop) drop.style.border = "var(--border)";
    if (span) span.style.display = "block";
    if (textarea) textarea.value = "";
    if (canvas) {
      const canvasData = state.canvasDataMap.get(canvas);
      if (canvasData) {
        canvasData.paths = [];
      }
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
  stagedItems.forEach((item) => item.remove());
  updateStagingInstruction();
});

export { toggleStagingArea };

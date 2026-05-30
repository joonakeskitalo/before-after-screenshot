import state from './state.js';

// --- Ctrl+Hover Zoom for Toolbar Previews ---
const bottomToolbarInner = document.getElementById("bottom-toolbar-inner");
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

  cardZoomOverlay = document.createElement("div");
  cardZoomOverlay.className = "zoom-overlay card-zoom-overlay";
  const clone = img.cloneNode(true);
  clone.style.display = "block";
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

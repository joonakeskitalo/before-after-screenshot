import state from './state.js';
import { redrawCanvas } from './drawing-render.js';

// --- Shared ResizeObserver ---
// A single ResizeObserver instance handles all drawing canvas containers,
// avoiding the overhead of one observer per grid cell.

const resizeRafIds = new WeakMap();

const sharedResizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const drop = entry.target;
    // Debounce per-element with rAF
    if (resizeRafIds.has(drop)) continue;
    resizeRafIds.set(drop, requestAnimationFrame(() => {
      resizeRafIds.delete(drop);
      const canvas = drop.querySelector('.drawing-canvas:not(.drawing-canvas-preview)');
      const previewCanvas = drop.querySelector('.drawing-canvas-preview');
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const w = drop.clientWidth;
      const h = drop.clientHeight;
      if (w === 0 || h === 0) return;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';

      if (previewCanvas) {
        previewCanvas.width = w * dpr;
        previewCanvas.height = h * dpr;
        previewCanvas.style.width = w + 'px';
        previewCanvas.style.height = h + 'px';
      }

      redrawCanvas(canvas, dpr);
    }));
  }
});

// --- Shared IntersectionObserver ---
// Handles visibility-based resize for canvases that become visible with 0 dimensions.

const sharedVisibilityObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const drop = entry.target;
    const canvas = drop.querySelector('.drawing-canvas:not(.drawing-canvas-preview)');
    if (!canvas) continue;
    if (canvas.width === 0 || canvas.height === 0) {
      resizeDropElement(drop);
    }
  }
});

// Manually trigger a resize for a specific drop element
function resizeDropElement(drop) {
  const canvas = drop.querySelector('.drawing-canvas:not(.drawing-canvas-preview)');
  const previewCanvas = drop.querySelector('.drawing-canvas-preview');
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const w = drop.clientWidth;
  const h = drop.clientHeight;
  if (w === 0 || h === 0) return;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  if (previewCanvas) {
    previewCanvas.width = w * dpr;
    previewCanvas.height = h * dpr;
    previewCanvas.style.width = w + 'px';
    previewCanvas.style.height = h + 'px';
  }

  redrawCanvas(canvas, dpr);
}

// --- DPR change handling ---
// A single listener that triggers a resize for all observed drops when DPR changes
// (e.g. moving the window between displays with different pixel densities).
let dprMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
const handleDprChange = () => {
  const drops = document.querySelectorAll('.drop');
  drops.forEach((drop) => {
    const canvas = drop.querySelector('.drawing-canvas:not(.drawing-canvas-preview)');
    if (canvas && state.canvasDataMap.has(canvas)) {
      resizeDropElement(drop);
    }
  });
  dprMediaQuery.removeEventListener('change', handleDprChange);
  dprMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  dprMediaQuery.addEventListener('change', handleDprChange);
};
dprMediaQuery.addEventListener('change', handleDprChange);

// --- Public API ---

export function observeDrop(drop) {
  sharedResizeObserver.observe(drop);
  sharedVisibilityObserver.observe(drop);
}

export function unobserveDrop(drop) {
  sharedResizeObserver.unobserve(drop);
  sharedVisibilityObserver.unobserve(drop);
  const rafId = resizeRafIds.get(drop);
  if (rafId) {
    cancelAnimationFrame(rafId);
    resizeRafIds.delete(drop);
  }
}

// Disconnect all observations (used during export to prevent interference)
export function disconnectAll() {
  sharedResizeObserver.disconnect();
  sharedVisibilityObserver.disconnect();
}

// Re-observe all currently active drops (used after export to restore)
export function reconnectAll() {
  const drops = document.querySelectorAll('.drop');
  drops.forEach((drop) => {
    const canvas = drop.querySelector('.drawing-canvas:not(.drawing-canvas-preview)');
    if (canvas && state.canvasDataMap.has(canvas)) {
      sharedResizeObserver.observe(drop);
      sharedVisibilityObserver.observe(drop);
    }
  });
}

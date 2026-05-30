import state from './state.js';
import { getObjectFitRect, renderPaths, redrawCanvas } from './drawing-render.js';

// --- Export Preparation & Restoration ---

// Redraw all canvases at export scale — called before capture.
// Since drawing coords are stored relative to the image (0-1), we bake them
// directly onto the image for a pixel-perfect export.
export const redrawAllCanvasesForExport = async (scale) => {
  // Disconnect all ResizeObservers so they don't interfere during export
  document.querySelectorAll(".drawing-canvas").forEach((canvas) => {
    const obs = state.canvasObservers.get(canvas);
    if (obs) obs.disconnect();
    const visObs = state.canvasVisibilityObservers.get(canvas);
    if (visObs) visObs.disconnect();
  });

  // Ensure all images are fully decoded before reading naturalWidth/naturalHeight.
  // getObjectFitRect returns null for images that haven't loaded yet, which would
  // cause their drawing annotations to be silently skipped during export.
  const allImages = document.querySelectorAll(".drop img");
  await Promise.all(
    Array.from(allImages)
      .filter((img) => img.src && img.style.display !== "none")
      .map((img) => img.decode().catch(() => {}))
  );

  const canvases = document.querySelectorAll(".drawing-canvas");
  for (const canvas of canvases) {
    const drop = canvas.parentElement;
    const img = drop.querySelector("img");

    const data = state.canvasDataMap.get(canvas);
    if (!data || data.paths.length === 0) {
      canvas.style.display = "none";
      continue;
    }

    if (!img || !img.src || img.style.display === "none") {
      const dropRect = drop.getBoundingClientRect();
      const dprNoImg = window.devicePixelRatio || 1;
      canvas.width = dropRect.width * dprNoImg;
      canvas.height = dropRect.height * dprNoImg;
      canvas.style.width = dropRect.width + "px";
      canvas.style.height = dropRect.height + "px";

      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const toX = (ix) => ix * canvas.width;
      const toY = (iy) => iy * canvas.height;
      renderPaths(ctx, data.paths, toX, toY, dprNoImg);
      continue;
    }

    const imgRect = img.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const fitRect = getObjectFitRect(img);

    if (!fitRect) continue;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = fitRect.width * dpr;
    tempCanvas.height = fitRect.height * dpr;
    const ctx = tempCanvas.getContext("2d");

    ctx.drawImage(img, 0, 0, fitRect.width * dpr, fitRect.height * dpr);

    // Draw annotations on a separate overlay canvas so eraser only removes
    // drawing strokes, not the underlying image pixels.
    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = tempCanvas.width;
    overlayCanvas.height = tempCanvas.height;
    const oCtx = overlayCanvas.getContext("2d");

    const toX = (ix) => ix * fitRect.width * dpr;
    const toY = (iy) => iy * fitRect.height * dpr;
    renderPaths(oCtx, data.paths, toX, toY, dpr);

    ctx.drawImage(overlayCanvas, 0, 0);

    // Store original src for restoration
    canvas.dataset.originalImgSrc = img.src;
    const blobUrl = await new Promise((resolve) => {
      tempCanvas.toBlob((b) => resolve(URL.createObjectURL(b)), "image/png");
    });
    canvas.dataset.blobUrl = blobUrl;
    img.style.width = fitRect.width + "px";
    img.style.height = fitRect.height + "px";
    img.style.objectFit = "fill";
    await new Promise((resolve) => {
      img.onload = resolve;
      img.src = blobUrl;
    });
    canvas.style.display = "none";
  }
};

// Restore canvases to display size after export
export const restoreAllCanvases = () => {
  const canvases = document.querySelectorAll(".drawing-canvas");
  canvases.forEach((canvas) => {
    const drop = canvas.parentElement;
    const img = drop.querySelector("img");

    if (canvas.dataset.originalImgSrc) {
      if (img) {
        img.src = canvas.dataset.originalImgSrc;
        img.style.width = null;
        img.style.height = null;
        img.style.objectFit = null;
      }
      delete canvas.dataset.originalImgSrc;
      if (canvas.dataset.blobUrl) {
        URL.revokeObjectURL(canvas.dataset.blobUrl);
        delete canvas.dataset.blobUrl;
      }
    }

    canvas.style.display = "";

    const dpr = window.devicePixelRatio || 1;
    const w = drop.clientWidth;
    const h = drop.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    redrawCanvas(canvas, dpr);

    const obs = state.canvasObservers.get(canvas);
    if (obs) obs.observe(drop);
    const visObs = state.canvasVisibilityObservers.get(canvas);
    if (visObs) visObs.observe(drop);
  });
};

import state from './state.js';

// --- Right-click drag to pan the grid ---

const gridWrapper = document.querySelector('.grid-wrapper');
const contentContainer = document.querySelector('.content-container');

let panActive = false;
let startX = 0;
let startY = 0;
let startScrollLeft = 0;
let startScrollTop = 0;

const onMouseDown = (e) => {
  // Only right mouse button (button === 2)
  if (e.button !== 2) return;

  // Don't pan during drawing mode
  if (state.drawingMode) return;

  e.preventDefault();

  panActive = true;
  state.isPanning = true;
  startX = e.clientX;
  startY = e.clientY;
  startScrollLeft = contentContainer.scrollLeft;
  startScrollTop = contentContainer.scrollTop;

  gridWrapper.style.cursor = 'grabbing';
  document.body.style.userSelect = 'none';

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

const onMouseMove = (e) => {
  if (!panActive) return;

  // Stop panning if right button is no longer held (buttons is a bitmask, bit 1 = right)
  if (!(e.buttons & 2)) {
    stopPan();
    return;
  }

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  contentContainer.scrollLeft = startScrollLeft - dx;
  contentContainer.scrollTop = startScrollTop - dy;
};

const onMouseUp = (e) => {
  if (!panActive) return;
  if (e.button !== 2) return;
  stopPan();
};

const stopPan = () => {
  panActive = false;
  state.isPanning = false;

  gridWrapper.style.cursor = '';
  document.body.style.userSelect = '';

  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
};

// Always suppress context menu on the grid wrapper
const onContextMenu = (e) => {
  e.preventDefault();
};

gridWrapper.addEventListener('mousedown', onMouseDown);
gridWrapper.addEventListener('contextmenu', onContextMenu);

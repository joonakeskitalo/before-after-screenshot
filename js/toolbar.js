// toolbar.js — thin orchestrator that re-exports from focused modules.
import { toggleFilenames } from './grid.js';
export { toggleStagingArea } from './staging.js';
import './zoom-overlay.js';

// --- Toggle Filenames ---
const filenameToggleBtn = document.getElementById("filename-toggle-btn");

filenameToggleBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleFilenames();
});

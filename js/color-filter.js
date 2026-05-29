import state from './state.js';

// --- Color Vision Filter ---

const colorFilterSelect = document.getElementById("color-filter-select");
const grid = state.gridEl;

const FILTER_OPTIONS = ["none", "grayscale", "protanopia", "deuteranopia", "tritanopia", "achromatopsia"];

const applyColorFilter = (filter) => {
  // Remove all filter classes
  FILTER_OPTIONS.forEach((f) => {
    if (f !== "none") {
      grid.classList.remove(`color-filter-${f}`);
    }
  });

  state.colorFilter = filter;
  colorFilterSelect.value = filter;

  if (filter !== "none") {
    grid.classList.add(`color-filter-${filter}`);
  }
};

const cycleColorFilter = () => {
  const currentIndex = FILTER_OPTIONS.indexOf(state.colorFilter);
  const nextIndex = (currentIndex + 1) % FILTER_OPTIONS.length;
  applyColorFilter(FILTER_OPTIONS[nextIndex]);
};

colorFilterSelect.addEventListener("change", (e) => {
  applyColorFilter(e.target.value);
});

export { applyColorFilter, cycleColorFilter };

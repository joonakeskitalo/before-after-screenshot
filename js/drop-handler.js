import state from './state.js';
import { buildGrid } from './grid.js';
import { isAllowedImageFile } from './sanitize.js';

const dropNewImage = (e) => {
  e.preventDefault();

  // Don't handle drops on the bottom toolbar
  if (e.target.closest(".bottom-toolbar")) {
    return;
  }

  if (e.target.className === "drop" || e.target.tagName === "IMG") {
    return;
  }

  [...e.dataTransfer.files]
    .filter(isAllowedImageFile)
    .forEach((droppedFile) => {
      state.addImageToToolbar(URL.createObjectURL(droppedFile), droppedFile.name);
    });
};

document.body.addEventListener("drop", dropNewImage);

document.body.addEventListener("dragover", function (event) {
  event.preventDefault();
});

// Build initial grid
buildGrid();

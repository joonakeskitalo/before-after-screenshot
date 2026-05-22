let root = document.documentElement;

const cardsEl = document.getElementById("cards");
const gridEl = document.getElementById("grid");
const content = document.querySelector(".content");

const elementsToAdjustWidth = [cardsEl, content];

let gridCols = 3;
let gridRows = 2;

const setElementWidths = (arr, size) => {
  const images = cardsEl.querySelectorAll("img");
  const drops = cardsEl.querySelectorAll("div.drop");

  const elements = [...arr, ...images, ...drops].filter(
    (el) => el.tagName !== "TEXTAREA",
  );

  elements.forEach((x) => {
    x.style.width = size;
    x.style.height = size;
  });
};

const copyAsImage = async (useFullSize = false, resolutionScale = 1) => {
  try {
    root.style.setProperty("--image-max-width", "unset");

    // Remove overflow and size constraints so nothing gets clipped
    const allCells = gridEl.querySelectorAll(".grid-cell");
    allCells.forEach((cell) => {
      cell.style.overflow = "visible";
      cell.style.minHeight = "unset";
    });

    // Let images size naturally for the capture
    const allImages = cardsEl.querySelectorAll("img");
    allImages.forEach((img) => {
      if (img.src && img.style.display !== "none") {
        img.style.objectFit = "contain";
        img.style.height = "auto";
        img.style.maxHeight = "unset";
      }
    });

    // Remove height constraint on drop zones
    const allDrops = cardsEl.querySelectorAll(".drop");
    allDrops.forEach((drop) => {
      drop.style.overflow = "visible";
      drop.style.height = "auto";
    });

    if (useFullSize) {
      const baseFontSize = 15;
      const fontSize = Math.max(baseFontSize, Math.floor(baseFontSize * resolutionScale * 3));
      root.style.setProperty("--text-fontsize", `${fontSize}pt`);

      const gap = 128 * resolutionScale;
      root.style.setProperty("--gap", `${gap}px`);

      // Collapse empty drops
      allDrops.forEach((drop) => {
        const img = drop.querySelector("img");
        if (!img || !img.src || img.style.display === "none") {
          drop.style.width = "32px";
          drop.style.height = "32px";
        }
      });

      allImages.forEach((img) => {
        if (img.src && img.style.display !== "none") {
          img.style.width =
            Math.floor(img.naturalWidth * resolutionScale) + "px";
          img.style.height = "auto";
        }
      });
    }

    root.style.setProperty("--border", `unset`);
    gridEl.style.outline = "none";

    // Remove fixed grid row sizing so rows expand to fit content
    gridEl.style.gridTemplateRows = "auto";

    const initialPadding = useFullSize ? 192 : 64;
    const padding = Math.floor(initialPadding * resolutionScale);

    cardsEl.style.padding = `8px ${padding}px`;
    cardsEl.style.width = "fit-content";

    const blob = await domtoimage.toBlob(cardsEl, {
      filter: (node) => {
        if (node.tagName === "IMG" && !node.src.startsWith("data:")) {
          return false;
        }
        if (node.tagName === "SPAN") return false;
        return true;
      },
    });

    navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);

    // Restore all styles
    if (useFullSize) {
      root.style.setProperty("--text-fontsize", `15pt`);
      root.style.setProperty("--gap", `48px`);
    }

    allCells.forEach((cell) => {
      cell.style.overflow = null;
      cell.style.minHeight = null;
    });

    allImages.forEach((img) => {
      img.style.objectFit = null;
      img.style.height = null;
      img.style.maxHeight = null;
      img.style.width = null;
    });

    allDrops.forEach((drop) => {
      drop.style.overflow = null;
      drop.style.height = null;
      drop.style.width = null;
    });

    cardsEl.style.padding = "16px";
    cardsEl.style.width = null;
    gridEl.style.outline = null;
    gridEl.style.gridTemplateRows = `repeat(${gridRows}, 1fr)`;
    root.style.setProperty("--border", `1px dashed rgb(167, 165, 165)`);
    root.style.setProperty("--image-max-width", "60dvh");
  } catch (error) {
    console.error(error);
  }
};

const attachDragTo = (img) => {
  if (!img) return;
  img.draggable = true;
  img.addEventListener("dragstart", (e) => {
    if (!img.id) {
      img.id = `drop-img-${Math.random().toString(36).slice(2)}`;
    }

    const cell = e.target.closest(".grid-cell");
    const textArea = cell ? cell.querySelector("textarea") : null;

    e.dataTransfer.setData("text/plain", img.src);
    e.dataTransfer.setData("id", img.id);
    e.dataTransfer.setData("note", textArea ? textArea.value : "");
    e.dataTransfer.effectAllowed = "move";
  });
};

const clearOrCopyImage = async (event, img, drop, span) => {
  event.preventDefault();
  event.stopImmediatePropagation();

  if (event.shiftKey && event.metaKey) {
    setElementWidths(elementsToAdjustWidth, "unset");
    root.style.setProperty("--image-max-width", "unset");

    const blob = await domtoimage.toBlob(img);

    navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);

    root.style.setProperty("--image-max-width", "60dvh");
    setElementWidths(elementsToAdjustWidth, null);
  }

  if (event.metaKey && !event.shiftKey) {
    setElementWidths(elementsToAdjustWidth, "unset");
    root.style.setProperty("--image-max-width", "unset");

    const width = Math.floor(img.naturalWidth * 0.5) + "px";
    img.style.width = width;

    const blob = await domtoimage.toBlob(img);

    navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);

    img.style.width = null;
    root.style.setProperty("--image-max-width", "60dvh");
    setElementWidths(elementsToAdjustWidth, null);
  } else if (!event.metaKey && event.shiftKey) {
    img.src = "";
    img.style.display = "none";
    drop.style.border = "var(--border)";
    span.style.display = "block";
  }
};

const setupCell = (cell) => {
  const drop = cell.querySelector(".drop");
  const img = cell.querySelector("img");
  const span = cell.querySelector("span");

  img.addEventListener(
    "click",
    async (e) => await clearOrCopyImage(e, img, drop, span),
  );

  drop.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.shiftKey) {
      // Clear the cell content
      img.src = "";
      img.style.display = "none";
      drop.style.border = "var(--border)";
      span.style.display = "block";
      const textarea = cell.querySelector("textarea");
      if (textarea) textarea.value = "";
    }
  });

  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });

  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    drop.style.border = "unset";

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = function () {
        img.style.display = "flex";
        img.src = this.result;
        img.alt = droppedFile.name;
        span.style.display = "none";
      };
      reader.readAsDataURL(droppedFile);
      return;
    }

    const src = e.dataTransfer.getData("text/plain");
    if (src) {
      img.style.display = "flex";
      img.src = src;
      img.alt = "";
      span.style.display = "none";

      // Check if dragged from toolbar — remove from toolbar
      const source = e.dataTransfer.getData("source");
      const draggedId = e.dataTransfer.getData("id");
      if (source === "toolbar" && draggedId) {
        removeToolbarItemById(draggedId);
        return;
      }

      if (draggedId === img.id) {
        return;
      }

      if (draggedId) {
        const srcImg = document.getElementById(draggedId);
        if (srcImg) {
          srcImg.removeAttribute("src");
          srcImg.style.display = "none";
          srcImg.alt = "";
          const parent = srcImg.closest(".drop");
          if (parent) {
            parent.style.border = "var(--border)";
            const parentSpan = parent.querySelector("span");
            if (parentSpan) parentSpan.style.display = "block";
          }
        }
      }

      // Transfer note text
      const noteText = e.dataTransfer.getData("note");
      if (noteText) {
        const destTextarea = cell.querySelector("textarea");
        if (destTextarea) destTextarea.value = noteText;

        // Clear source textarea
        const srcImgEl = e.dataTransfer.getData("id")
          ? document.getElementById(e.dataTransfer.getData("id"))
          : null;
        if (srcImgEl) {
          const srcCell = srcImgEl.closest(".grid-cell");
          if (srcCell) {
            const srcTextarea = srcCell.querySelector("textarea");
            if (srcTextarea) srcTextarea.value = "";
          }
        }
      }
    }
  });

  attachDragTo(img);
};

const createCell = (row, col) => {
  const cell = document.createElement("div");
  cell.className = "grid-cell";
  cell.dataset.row = row;
  cell.dataset.col = col;

  const drop = document.createElement("div");
  drop.className = "drop";

  const span = document.createElement("span");
  span.innerText = "Drop here";
  drop.appendChild(span);

  const img = document.createElement("img");
  img.style.display = "none";
  drop.appendChild(img);

  const textarea = document.createElement("textarea");
  textarea.autocomplete = "off";
  textarea.autocorrect = "off";
  textarea.spellcheck = false;
  textarea.autocapitalize = "off";
  textarea.rows = 2;
  textarea.textContent = "";

  cell.appendChild(drop);
  cell.appendChild(textarea);

  setupCell(cell);

  return cell;
};

const buildGrid = () => {
  // Save existing cell data
  const existingData = [];
  const existingCells = gridEl.querySelectorAll(".grid-cell");
  existingCells.forEach((cell) => {
    const img = cell.querySelector("img");
    const textarea = cell.querySelector("textarea");
    existingData.push({
      row: parseInt(cell.dataset.row),
      col: parseInt(cell.dataset.col),
      imgSrc: img && img.src && img.style.display !== "none" ? img.src : null,
      imgAlt: img ? img.alt : "",
      text: textarea ? textarea.value : "",
    });
  });

  gridEl.innerHTML = "";
  gridEl.style.gridTemplateColumns = `repeat(${gridCols}, 1fr)`;
  gridEl.style.gridTemplateRows = `repeat(${gridRows}, 1fr)`;

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const cell = createCell(r, c);
      gridEl.appendChild(cell);

      // Restore data if it existed at this position
      const existing = existingData.find((d) => d.row === r && d.col === c);
      if (existing) {
        const img = cell.querySelector("img");
        const drop = cell.querySelector(".drop");
        const span = cell.querySelector("span");
        const textarea = cell.querySelector("textarea");

        if (existing.imgSrc) {
          img.src = existing.imgSrc;
          img.alt = existing.imgAlt;
          img.style.display = "flex";
          drop.style.border = "unset";
          span.style.display = "none";
        }
        if (existing.text) {
          textarea.value = existing.text;
        }
      }
    }
  }
};

const updateGrid = () => {
  gridCols = parseInt(document.getElementById("grid-cols").value) || 3;
  gridRows = parseInt(document.getElementById("grid-rows").value) || 2;
  buildGrid();
};

const setColors = (e) => {
  const [background, text] = e.value.split(";");
  root.style.setProperty("--background-color", background);

  if (text) {
    root.style.setProperty("--text-color", text);
  } else {
    root.style.setProperty("--text-color", "#000000");
  }
};

// Paste images into the toolbar for staging
// (handled in the bottom toolbar section below)

// Drop new images onto the grid area
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
    .filter((x) => x.type.startsWith("image/"))
    .forEach((droppedFile) => {
      const reader = new FileReader();
      reader.onloadend = function () {
        addImageToToolbar(this.result, droppedFile.name);
      };
      reader.readAsDataURL(droppedFile);
    });
};

document.body.addEventListener("drop", dropNewImage);

document.body.addEventListener("dragover", function (event) {
  event.preventDefault();
});

// Forward declarations for toolbar functions (defined fully in toolbar section below)
let removeToolbarItemById = () => {};
let addImageToToolbar = () => {};

// Build initial grid
buildGrid();

// --- Bottom Toolbar Logic ---
const bottomToolbar = document.getElementById("bottom-toolbar");
const bottomToolbarInner = document.getElementById("bottom-toolbar-inner");
const bottomToolbarDrop = document.getElementById("bottom-toolbar-drop");

addImageToToolbar = (dataUrl, fileName = "") => {
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
  });

  item.appendChild(img);
  item.appendChild(removeBtn);

  item.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", dataUrl);
    e.dataTransfer.setData("id", id);
    e.dataTransfer.setData("source", "toolbar");
    e.dataTransfer.effectAllowed = "move";
  });

  // Insert before the drop zone
  bottomToolbarInner.insertBefore(item, bottomToolbarDrop);
};

removeToolbarItemById = (id) => {
  const item = bottomToolbarInner.querySelector(`[data-id="${id}"]`);
  if (item) item.remove();
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
        addImageToToolbar(this.result, file.name);
      };
      reader.readAsDataURL(file);
    });
    return;
  }

  // Handle data URL drops (from grid cells back to toolbar)
  const src = e.dataTransfer.getData("text/plain");
  if (src && src.startsWith("data:")) {
    addImageToToolbar(src);
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
        addImageToToolbar(this.result, file.name);
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
        addImageToToolbar(event.target.result);
      };
      reader.readAsDataURL(blob);
    }
  }
};

// Shift-key zoom for toolbar previews
document.addEventListener("keydown", (e) => {
  if (e.key === "Shift") {
    const hovered = bottomToolbarInner.querySelector(".bottom-toolbar-item:hover");
    if (hovered) hovered.classList.add("zoomed");
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "Shift") {
    bottomToolbarInner.querySelectorAll(".bottom-toolbar-item.zoomed").forEach((el) => {
      el.classList.remove("zoomed");
    });
  }
});

bottomToolbarInner.addEventListener("mouseover", (e) => {
  const item = e.target.closest(".bottom-toolbar-item");
  if (item && e.shiftKey) {
    item.classList.add("zoomed");
  }
});

bottomToolbarInner.addEventListener("mouseout", (e) => {
  const item = e.target.closest(".bottom-toolbar-item");
  if (item) {
    item.classList.remove("zoomed");
  }
});

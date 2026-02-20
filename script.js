let root = document.documentElement;

const cardsEl = document.getElementById("cards");
const cardRow = document.getElementById("card-row");
const content = document.querySelector(".content");

const elementsToAdjustWidth = [cardsEl, content];

const setElementWidths = (arr, size) => {
  const images = cardsEl.querySelectorAll("img");
  const drops = cardsEl.querySelectorAll("div.drop");

  const elementsWithoutTextareas = [...arr, ...images, ...drops].filter(
    (el) => el.tagName !== "TEXTAREA",
  );

  elementsWithoutTextareas.forEach((x) => {
    x.style.width = size;
    x.style.height = size;
  });
};

const copyAsImage = async (useFullSize = false, resolutionScale = 1) => {
  try {
    root.style.setProperty("--image-max-width", "unset");

    if (useFullSize) {
      setElementWidths(elementsToAdjustWidth, "unset");

      const fontScale = resolutionScale === 1 ? 0.4 : resolutionScale + 0.7;
      const fontSize = Math.floor(20 / fontScale);
      root.style.setProperty("--text-fontsize", `${fontSize}pt`);

      const gap = 128 * resolutionScale;
      root.style.setProperty("--gap", `${gap}px`);

      [
        ...document.querySelectorAll(".drop"),
        ...document.querySelectorAll(".card"),
      ]
        .filter((drop) => {
          const img = drop.querySelector("img");
          return !img || img.style.display === "none";
        })
        .forEach((drop) => {
          drop.style.width = "32px";
        });

      if (resolutionScale !== 1) {
        [...cardsEl.querySelectorAll("img")].forEach((img) => {
          img.style.width =
            Math.floor(img.naturalWidth * resolutionScale) + "px";
        });
      }
    }
    root.style.setProperty("--border", `unset`);
    cardRow.style.overflowX = "unset";

    cardRow.style.justifyContent = "center";

    const initialPadding = useFullSize ? 192 : 64;
    const padding = Math.floor(initialPadding * resolutionScale);

    cardsEl.style.padding = useFullSize
      ? `8px ${padding}px`
      : `8px ${padding}px`;

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

    cardRow.style.justifyContent = null;

    if (useFullSize) {
      setElementWidths(elementsToAdjustWidth, null);
      root.style.setProperty("--text-fontsize", `15pt`);
      root.style.setProperty("--gap", `48px`);
    }
    cardsEl.style.padding = "16px";
    cardRow.style.overflowX = "scroll";
    root.style.setProperty("--border", `1px dashed rgb(167, 165, 165)`);
    root.style.setProperty("--image-max-width", "60dvh");
  } catch (error) {
    console.error(error);
  }
};

const addEventListenersToCards = () => {
  const cards = document.querySelectorAll("#cards > div > .card");

  [...cards].forEach((card) => {
    const dropZone = card.querySelector(".drop");
    const inputElement = card.querySelector(".file-input");
    const img = card.querySelector("img");
    const span = card.querySelector("span");

    img.addEventListener(
      "click",
      async (e) => await clearOrCopyImage(e, img, dropZone, span, card),
    );
    dropZone.addEventListener("click", (e) => removeCard(card, e));

    inputElement.addEventListener("change", function (e) {
      const clickFile = this.files[0];
      if (clickFile) {
        img.style.display = "flex";
        dropZone.style.border = "unset";

        const reader = new FileReader();
        reader.readAsDataURL(clickFile);
        reader.onloadend = function () {
          img.src = this.result;
          img.alt = clickFile.name;
        };
      }
    });

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });

    dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropZone.style.border = "unset";

      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile && droppedFile.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = function () {
          img.style.display = "flex";
          img.src = this.result;
          img.alt = droppedFile.name;
          span.style.display = "none";

          const destCard = dropZone.closest(".card");
          if (destCard) {
            destCard.dataset.textContent = this.result;
          }
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

        if (e.dataTransfer.getData("id") === img.id) {
          return;
        }

        if (e.dataTransfer.getData("id")) {
          const srcImg = document.getElementById(e.dataTransfer.getData("id"));
          if (srcImg) {
            srcImg.removeAttribute("src");
            srcImg.style.display = "none";
            srcImg.alt = "";
            const parent = srcImg.closest(".drop");
            if (parent) {
              parent.style.border = "var(--border)";
              parent.style.width = "100%";
            }
          }
        } else {
          const all = document.querySelectorAll("img");
          for (const a of all) {
            if (a === img) continue;
            if (a.src === src) {
              a.removeAttribute("src");
              a.style.display = "none";
              a.alt = "";
              const parent = a.closest(".drop");
              if (parent) {
                parent.style.border = "var(--border)";
                parent.style.width = "100%";
              }
              break;
            }
          }
        }

        const srcCard = e.dataTransfer.getData("id")
          ? document
              .getElementById(e.dataTransfer.getData("id"))
              .closest(".card")
          : dropZone.closest(".card");
        const srcTextarea = srcCard.querySelector("textarea");
        if (srcTextarea) {
          srcTextarea.value = "";
        }

        const destCard = dropZone.closest(".card");
        if (destCard) {
          const destTextarea = destCard.querySelector("textarea");
          if (destTextarea) {
            destTextarea.value = e.dataTransfer.getData("note");
          }
        }
      }

      const destCard = dropZone.closest(".card");
      if (destCard) {
        destCard.dataset.textContent = src;
      }
    });
    img.draggable = true;
    img.addEventListener("dragstart", (e) => {
      if (!img.id) {
        img.id = `drop-img-${Math.random().toString(36).slice(2)}`;
      }

      const card = e.target.parentNode.parentNode;
      const textArea = card.querySelector("textarea");

      e.dataTransfer.setData("text/plain", img.src);
      e.dataTransfer.setData("id", img.id);
      e.dataTransfer.setData("note", textArea.value);
      e.dataTransfer.effectAllowed = "move";
    });

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
  });
};

const attachDragTo = (img) => {
  if (!img) return;
  img.draggable = true;
  img.addEventListener("dragstart", (e) => {
    if (!img.id) {
      img.id = `drop-img-${Math.random().toString(36).slice(2)}`;
    }

    const card = e.target.parentNode.parentNode;
    const textArea = card.querySelector("textarea");

    e.dataTransfer.setData("text/plain", img.src);
    e.dataTransfer.setData("id", img.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("note", textArea.value);
  });
};

const removeCard = (card, event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.shiftKey) {
    card.remove();
  }
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

const createCard = () => {
  const card = document.createElement("div");
  card.className = "card";

  const drop = document.createElement("div");
  drop.className = "drop";

  const span = document.createElement("span");
  span.innerText = "Drop image here…";
  drop.appendChild(span);

  const img = document.createElement("img");
  img.style.display = "none";
  attachDragTo(img);
  drop.appendChild(img);

  const input = document.createElement("input");
  input.type = "file";
  input.className = "file-input";
  input.hidden = true;

  const textarea = document.createElement("textarea");
  textarea.autocomplete = "off";
  textarea.autocorrect = "off";
  textarea.spellcheck = false;
  textarea.autocapitalize = "off";
  textarea.rows = 2;
  textarea.textContent = "";

  card.appendChild(drop);
  card.appendChild(input);
  card.appendChild(textarea);

  cardRow.appendChild(card);

  addEventListenersToCards();

  return {
    image: img,
    drop,
    span,
  };
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

document.onpaste = function (event) {
  const items = (event.clipboardData || event.originalEvent.clipboardData)
    .items;

  for (const index in items) {
    const item = items[index];

    if (item.kind === "file") {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = function (event) {
        const { image, drop, span } = createCard();
        image.src = event.target.result;
        image.style.display = "flex";
        drop.style.border = "unset";
        span.style.display = "none";
      };
      reader.readAsDataURL(blob);
    }
  }
};

const dropNewImage = (e) => {
  e.preventDefault();

  if (e.target.className === "drop" || e.target.tagName === "IMG") {
    return;
  }

  [...e.dataTransfer.files]
    .filter((x) => x.type.startsWith("image/"))
    .forEach((droppedFile) => {
      const reader = new FileReader();
      reader.onloadend = function () {
        const { image, drop, span } = createCard();

        image.style.display = "flex";
        image.src = this.result;
        image.alt = droppedFile.name;
        drop.style.border = "unset";
        span.style.display = "none";
      };
      reader.readAsDataURL(droppedFile);
      return;
    });
};

document.body.addEventListener("drop", dropNewImage);

document.body.addEventListener("dragover", function (event) {
  event.preventDefault();
});

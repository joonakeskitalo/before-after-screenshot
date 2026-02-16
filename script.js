let root = document.documentElement;

const cardsEl = document.getElementById("cards");
const cardRow = document.getElementById("card-row");
const content = document.querySelector(".content");

const left = document.querySelector("#left");
const leftDrop = left.querySelector(".drop");
const leftImage = left.querySelector("img");

const right = document.querySelector("#right");
const rightDrop = right.querySelector(".drop");
const rightImage = right.querySelector("img");

const elementsToAdjustWidth = [cardsEl, content];

const setElementWidths = (arr, size) => {
  const images = cardsEl.querySelectorAll("img");
  const cards = cardsEl.querySelectorAll("div.card");
  const drops = cardsEl.querySelectorAll("div.drop");

  const elementsWithoutTextareas = [
    ...arr,
    ...cards,
    ...images,
    ...drops,
  ].filter((el) => el.tagName !== "TEXTAREA");

  elementsWithoutTextareas.forEach((x) => {
    x.style.width = size;
    x.style.height = size;
  });
};

const minMax = (value, min, max) => {
  if (value < min) {
    return min;
  } else if (value > max) {
    return max;
  }
  return value;
};

const copyAsImage = async (useFullSize = false) => {
  try {
    if (useFullSize) {
      setElementWidths(elementsToAdjustWidth, "unset");
      const rect = cardsEl.getBoundingClientRect();
      const fontSize = minMax(Math.floor(rect.width / 70), 20, 48);
      root.style.setProperty("--text-fontsize", `${fontSize}pt`);

      const _gap = Math.floor(leftImage.getBoundingClientRect().width / 8);
      const gap = minMax(_gap, 32, 128);
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
    }
    root.style.setProperty("--border", `unset`);
    cardsEl.style.padding = "64px 128px 32px 128px";
    cardRow.style.overflowX = "unset";

    const blob = await domtoimage.toBlob(cardsEl, {
      filter: (node) => {
        if (node.tagName === "IMG" && !node.src.startsWith("data:")) {
          return false;
        }
        return true;
      },
    });
    navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);

    if (useFullSize) {
      setElementWidths(elementsToAdjustWidth, "100%");
      root.style.setProperty("--text-fontsize", `15pt`);
      root.style.setProperty("--gap", `32px`);
    }
    cardsEl.style.padding = "32px 32px 16px 32px";
    cardRow.style.overflowX = "scroll";
    root.style.setProperty("--border", `1px dashed rgb(167, 165, 165)`);

    [
      ...document.querySelectorAll(".drop"),
      ...document.querySelectorAll(".card"),
    ]
      .filter((drop) => {
        const img = drop.querySelector("img");
        return !img || img.style.display === "none";
      })
      .forEach((drop) => {
        drop.style.width = "100%";
      });
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

    img.addEventListener("click", (e) => clearImage(img, dropZone, e));
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

attachDragTo(leftImage);
attachDragTo(rightImage);

const removeCard = (card, event) => {
  if (event.shiftKey) {
    event.preventDefault();
    event.stopImmediatePropagation();
    card.remove();
  }
};

const clearImage = (img, drop, event) => {
  if (event.shiftKey) {
    event.preventDefault();
    event.stopImmediatePropagation();
    img.src = "";
    img.style.display = "none";
    drop.style.border = "var(--border)";
  }
};

const createCard = () => {
  const card = document.createElement("div");
  card.className = "card";

  const drop = document.createElement("div");
  drop.className = "drop";

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
  textarea.rows = 5;
  textarea.textContent = "";

  card.appendChild(drop);
  card.appendChild(input);
  card.appendChild(textarea);

  cardRow.appendChild(card);

  addEventListenersToCards();

  return {
    image: img,
    drop,
  };
};

addEventListenersToCards();
attachDragTo(leftImage);
attachDragTo(rightImage);

function debounce(func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
}

const changeBackgroundColor = debounce((e) => {
  root.style.setProperty("--background-color", e.value);
}, 100);

document.onpaste = function (event) {
  const items = (event.clipboardData || event.originalEvent.clipboardData)
    .items;

  for (const index in items) {
    const item = items[index];

    if (item.kind === "file") {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = function (event) {
        const left = document.querySelector("#left img");
        const right = document.querySelector("#right img");
        const leftImagePresent = left && left?.src.startsWith("data");
        const rightImagePresent = right && right?.src.startsWith("data");

        if ((left && !leftImagePresent) || (right && !rightImagePresent)) {
          if (!leftImagePresent) {
            leftImage.src = event.target.result;
            leftImage.style.display = "flex";
            leftDrop.style.border = "unset";
          } else if (!rightImagePresent) {
            rightImage.src = event.target.result;
            rightImage.style.display = "flex";
            rightDrop.style.border = "unset";
          }
        } else {
          const { image, drop } = createCard();
          image.src = event.target.result;
          image.style.display = "flex";
          drop.style.border = "unset";
        }
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
        const { image, drop } = createCard();

        image.style.display = "flex";
        image.src = this.result;
        image.alt = droppedFile.name;
        drop.style.border = "unset";
      };
      reader.readAsDataURL(droppedFile);
      return;
    });
};

document.body.addEventListener("drop", dropNewImage);

document.body.addEventListener("dragover", function (event) {
  event.preventDefault();
});

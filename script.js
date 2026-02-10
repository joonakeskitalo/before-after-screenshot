let root = document.documentElement;

const cardsEl = document.getElementById("cards");
const cardRow = document.getElementById("card-row");
const content = document.querySelector(".content");

let pasteLeftImage = false;

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
    dropZone.addEventListener("click", () => inputElement.click());
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      img.style.display = "flex";
      dropZone.style.border = "unset";
      let file = e.dataTransfer.files[0];

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = function () {
        e.preventDefault();
        img.src = this.result;
        img.alt = file.name;
      };
    });
  });
};

addEventListenersToCards();

const createCard = () => {
  const card = document.createElement("div");
  card.className = "card";

  const drop = document.createElement("div");
  drop.className = "drop";

  const img = document.createElement("img");
  img.style.display = "none";
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
        if (pasteLeftImage) {
          rightImage.src = event.target.result;
          rightImage.style.display = "flex";
          rightDrop.style.border = "unset";
        } else {
          leftImage.src = event.target.result;
          leftImage.style.display = "flex";
          leftDrop.style.border = "unset";
        }
        pasteLeftImage = !pasteLeftImage;
      };
      reader.readAsDataURL(blob);
    }
  }
};

cardsEl.addEventListener(
  "contextmenu",
  async (e) => {
    if (e.button === 2) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();

      if (e.target.tagName === "INPUT") {
        return;
      }

      const el = document.createElement("input");
      el.type = "text";
      el.className = "note";
      el.style = `top:${e.pageY}px;left:${e.pageX}px;z-index:3;position:absolute;`;

      el.oncontextmenu = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        el.remove();
      };

      const move = (ev) => {
        el.style.left = `${el.offsetLeft + ev.movementX}px`;
        el.style.top = `${el.offsetTop + ev.movementY}px`;
      };

      const dragStart = (ev) => el.setPointerCapture(ev.pointerId);
      const drag = (ev) => el.hasPointerCapture(ev.pointerId) && move(ev);
      const dragEnd = (ev) => el.releasePointerCapture(ev.pointerId);

      el.addEventListener("pointerdown", dragStart);
      el.addEventListener("pointermove", drag);
      el.addEventListener("pointerup", dragEnd);

      cardsEl.appendChild(el);
      el.focus();
    }
  },
  {
    passive: false,
  },
);

const cardsEl = document.getElementById("cards");
const downloadAsImage = async () => {
  try {
    const blob = await domtoimage.toBlob(cardsEl);
    navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);
  } catch (error) {
    console.error(error);
  }
};

const renderCards = () => {
  const cards = document.querySelectorAll("#cards > .card");

  [...cards].forEach((card) => {
    const dropZone = card.querySelector(".drop");
    const inputElement = card.querySelector(".file-input");
    const img = card.querySelector("img");

    inputElement.addEventListener("change", function (e) {
      const clickFile = this.files[0];
      if (clickFile) {
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

renderCards();

let pasteLeftImage = false;

const left = document.querySelector("#left");
const leftDrop = left.querySelector(".drop");
const leftImage = left.querySelector("img");

const right = document.querySelector("#right");
const rightDrop = right.querySelector(".drop");
const rightImage = right.querySelector("img");

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

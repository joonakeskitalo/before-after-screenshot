/**
 * Minimal toast notification for clipboard feedback.
 */

let toastEl = null;
let hideTimeout = null;

const ensureToastEl = () => {
  if (toastEl) return toastEl;
  toastEl = document.createElement("div");
  toastEl.className = "toast-notification";
  toastEl.setAttribute("role", "status");
  toastEl.setAttribute("aria-live", "polite");
  document.body.appendChild(toastEl);
  return toastEl;
};

const showToast = (message, type = "success") => {
  const el = ensureToastEl();
  el.textContent = message;
  el.dataset.type = type;
  el.classList.remove("visible");
  // Force reflow to restart animation
  void el.offsetWidth;
  el.classList.add("visible");

  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    el.classList.remove("visible");
  }, type === "error" ? 4000 : 2000);
};

export { showToast };

// Sync content-container padding-top with toolbar height
(() => {
  const toolbar = document.querySelector('.toolbar');
  const container = document.querySelector('.content-container');
  if (!toolbar || !container) return;

  let syncRafId = null;
  const sync = () => {
    if (syncRafId) return;
    syncRafId = requestAnimationFrame(() => {
      syncRafId = null;
      container.style.paddingTop = toolbar.offsetHeight + 'px';
      container.style.scrollPaddingTop = toolbar.offsetHeight + 'px';
    });
  };

  sync();
  new ResizeObserver(sync).observe(toolbar);
})();


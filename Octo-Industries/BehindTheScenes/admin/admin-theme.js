// Applied before styles load to avoid flashing the opposite theme.
(() => {
  let theme = 'dark';
  try { theme = localStorage.getItem('octo-admin.theme') === 'light' ? 'light' : 'dark'; } catch { /* Storage may be unavailable. */ }
  document.documentElement.dataset.theme = theme;
})();

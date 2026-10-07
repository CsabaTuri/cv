// Theme bootstrap: runs as a blocking, before-interactive script so the
// correct theme is applied before the first paint (no flash of the wrong
// theme). Keep in sync with THEME_STORAGE_KEY in src/lib/theme.ts.
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var dark = stored
      ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    // ignore storage errors (private mode etc.)
  }
})();

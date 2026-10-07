export type Theme = 'light' | 'dark';

/** localStorage key holding the visitor's explicit preference. */
export const THEME_STORAGE_KEY = 'theme';

/** Window event fired whenever the theme is (re)applied to <html>. */
export const THEME_EVENT = 'themechange';

/** Reads the explicit preference. `null` means "follow the system". */
export function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    // ignore storage errors (private mode etc.)
    return null;
  }
}

/** Resolves the active theme: explicit preference first, system otherwise. */
export function getResolvedTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Applies a theme to <html> without persisting it. */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Applies the persisted (or system) theme to <html>. */
export function syncTheme() {
  applyTheme(getResolvedTheme());
}

/** Persists an explicit preference and applies it. */
export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore storage errors (private mode etc.)
  }
  applyTheme(theme);
}

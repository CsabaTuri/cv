'use client';

import {useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {Moon, Sun} from './icons';
import {THEME_EVENT, setTheme} from '@/lib/theme';

/** Flips the theme based on the state of <html>, the single source of truth. */
function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  setTheme(isDark ? 'light' : 'dark');
}

export default function ThemeToggle() {
  const t = useTranslations('a11y');
  const [dark, setDark] = useState(false);

  // Mirror <html> instead of owning the theme, so the icon stays correct after
  // navigating (e.g. switching language) or a system theme change.
  useEffect(() => {
    const read = () =>
      setDark(document.documentElement.classList.contains('dark'));

    read();
    window.addEventListener(THEME_EVENT, read);
    return () => window.removeEventListener(THEME_EVENT, read);
  }, []);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={t('themeToggle')}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

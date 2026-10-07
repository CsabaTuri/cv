'use client';

import {useEffect, useLayoutEffect} from 'react';
import {usePathname} from 'next/navigation';
import {syncTheme} from '@/lib/theme';

// `useLayoutEffect` flushes right after React commits, before the browser
// paints, so re-applying the theme there cannot cause a visible flash.
// On the server it would warn, hence the `useEffect` fallback.
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Keeps the `dark` class on `<html>` alive across navigations.
 *
 * The theme is applied outside of React (see `themeScript` in `src/lib/theme.ts`),
 * but the root layout re-renders on navigation — for instance when the locale
 * segment changes — and React resets the `class` attribute of `<html>` to the
 * value it rendered. Without this component the visitor's theme (and its
 * `localStorage` value) would silently fall back to light as soon as they
 * switch language.
 */
export default function ThemeSync() {
  const pathname = usePathname();

  useIsomorphicLayoutEffect(() => {
    syncTheme();
  }, [pathname]);

  useEffect(() => {
    // The page may be restored from the back/forward cache.
    const onPageShow = () => syncTheme();
    // Follow the OS when the visitor has no explicit preference.
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    window.addEventListener('pageshow', onPageShow);
    media.addEventListener('change', onPageShow);

    return () => {
      window.removeEventListener('pageshow', onPageShow);
      media.removeEventListener('change', onPageShow);
    };
  }, []);

  return null;
}

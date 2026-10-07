import {defineRouting} from 'next-intl/routing';
import {hasLocale} from 'next-intl';

export const routing = defineRouting({
  // All supported locales.
  locales: ['hu', 'en'],

  // Hungarian is the default language.
  defaultLocale: 'hu',

  // The default locale is served without a prefix (""), the others keep it
  // ("/en/"). The app is statically exported (no middleware), so the
  // unprefixed default locale is handled by the optional catch-all route
  // `src/app/[[...locale]]`.
  localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];

/**
 * Locale of the `[[...locale]]` route segment.
 *
 * An empty segment list means the unprefixed root, which is served in the
 * default locale. Unknown or nested segments (e.g. `/foo/`, `/en/foo/`) fall
 * back to the default locale so rendering never breaks — `page.tsx` turns
 * those into a 404.
 */
export function resolveLocale(segments?: string[]): Locale {
  const first = segments?.[0];
  return hasLocale(routing.locales, first) ? first : routing.defaultLocale;
}

/** Pathname of a locale: the default locale has no prefix. */
export function localePath(locale: Locale): string {
  return locale === routing.defaultLocale ? '/' : `/${locale}/`;
}

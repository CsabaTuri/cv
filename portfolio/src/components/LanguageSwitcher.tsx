'use client';

import {useTransition} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {getPathname, usePathname} from '@/i18n/navigation';
import {routing} from '@/i18n/routing';

export default function LanguageSwitcher() {
  const t = useTranslations('a11y');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const other =
    routing.locales.find((item) => item !== locale) ?? routing.locales[0];

  function switchLocale() {
    // `Link`/`useRouter` from next-intl always add a locale prefix when the
    // locale is passed explicitly and rely on the middleware to redirect
    // superfluous prefixes away (e.g. "/hu/" → "/"). This app is statically
    // exported, so there is no middleware: build the target path with
    // `getPathname` and navigate with the plain Next.js router to keep the
    // default locale unprefixed.
    const target = getPathname({href: pathname, locale: other});

    startTransition(() => {
      router.replace(target);
    });
  }

  return (
    <button
      type="button"
      onClick={switchLocale}
      disabled={isPending}
      aria-label={t('langToggle')}
      className="inline-flex h-9 items-center rounded-full border border-gray-200 px-3 text-xs font-semibold uppercase tracking-wide text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-white"
    >
      {other.toUpperCase()}
    </button>
  );
}

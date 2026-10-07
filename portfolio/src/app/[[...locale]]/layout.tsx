import type {ReactNode} from 'react';
import type {Metadata, Viewport} from 'next';
import {Inter} from 'next/font/google';
import {NextIntlClientProvider} from 'next-intl';
import {getTranslations} from 'next-intl/server';
import Script from 'next/script';
import {localePath, resolveLocale, routing} from '@/i18n/routing';
import ThemeSync from '@/components/ThemeSync';
import '../globals.css';

/** `[[...locale]]`: no segment means the unprefixed default locale. */
type Params = {locale?: string[]};

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Cloudflare Web Analytics token (NEXT_PUBLIC_ = inlined into the client bundle at build time).
const CLOUDFLARE_TOKEN =
  process.env.NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN ?? '';

// Crisp Chat website ID (NEXT_PUBLIC_ = inlined into the client bundle at build time).
const CRISP_WEBSITE_ID = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID ?? '';

export function generateStaticParams() {
  // The root path serves the default locale without a prefix.
  const routes: {locale: string[]}[] = [{locale: []}];

  for (const locale of routing.locales) {
    // The default locale is only available without a prefix in the exported
    // site; the prefixed legacy URL (e.g. "/hu/") is redirected to "/" instead
    // (see nginx.conf and public/_redirects). During development we still
    // generate it so that `next dev` doesn't reject those URLs.
    if (locale === routing.defaultLocale && process.env.NODE_ENV !== 'development') {
      continue;
    }

    routes.push({locale: [locale]});
  }

  return routes;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const {locale: segments} = await params;
  const locale = resolveLocale(segments);
  const canonical = localePath(locale);
  const t = await getTranslations({
    locale,
    namespace: 'metadata',
  });

  return {
    metadataBase: new URL('https://turicsaba.hu'),
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical,
      languages: {
        hu: '/',
        en: '/en/',
        'x-default': '/',
      },
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: canonical,
      siteName: 'Túri Csaba',
      locale: locale === 'hu' ? 'hu_HU' : 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: t('title'),
      description: t('description'),
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    {media: '(prefers-color-scheme: light)', color: '#ffffff'},
    {media: '(prefers-color-scheme: dark)', color: '#030712'},
  ],
};

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<Params>;
}>) {
  const {locale: segments} = await params;

  // Unknown segments fall back to the default locale here; `page.tsx` renders
  // the 404 page for them (so that the translations are always available).
  const locale = resolveLocale(segments);

  return (
    <html
      lang={locale}
      className={inter.variable}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="font-sans">
        {/* Applies the stored / system theme before first paint to avoid FOUC. */}
        <link rel="preload" as="script" href="/theme-init.js" />
        <script async src="/theme-init.js" />
        {/* Re-applies it after navigations (React resets <html>'s class). */}
        <ThemeSync />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        {CLOUDFLARE_TOKEN && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={`{"token": "${CLOUDFLARE_TOKEN}"}`}
          />
        )}
        {CRISP_WEBSITE_ID && (
          <Script
            id="crisp-chat"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `window.$crisp = [];
window.CRISP_WEBSITE_ID = '${CRISP_WEBSITE_ID}';
(function () {
  var d = document;
  var s = d.createElement('script');
  s.src = 'https://client.crisp.chat/l.js';
  s.async = true;
  d.getElementsByTagName('head')[0].appendChild(s);
})();`,
            }}
          />
        )}
      </body>
    </html>
  );
}

import type {ReactNode} from 'react';
import type {Metadata, Viewport} from 'next';
import {Inter} from 'next/font/google';
import {ContentProvider} from '@/components/ContentProvider';
import PwaSetup from '@/components/PwaSetup';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Cloudflare Web Analytics token (NEXT_PUBLIC_ = inlined into the client bundle at build time).
const CLOUDFLARE_TOKEN =
  process.env.NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN ?? '';

// Placeholder for the pre-render / SEO baseline; the live values come from the
// database and are applied in ContentProvider.
const TITLE = 'Túri Csaba — DevOps és Rendszerüzemeltetési Szakember';
const DESCRIPTION =
  'Túri Csaba önéletrajza: DevOps és rendszerüzemeltetési szakember, automatizálásra, virtualizációra, konténerizációra és Linux infrastruktúrára fókuszálva.';

export const metadata: Metadata = {
  metadataBase: new URL('https://turicsaba.hu'),
  title: TITLE,
  description: DESCRIPTION,
  alternates: {canonical: '/'},
  // Installable app (PWA): manifest + the icon set the browsers ask for.
  manifest: '/manifest.webmanifest',
  applicationName: 'Túri Csaba',
  appleWebApp: {
    capable: true,
    title: 'Túri Csaba',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      {url: '/favicon.ico', sizes: 'any'},
      {url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192'},
      {url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512'},
    ],
    apple: [{url: '/apple-touch-icon.png', sizes: '180x180'}],
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    siteName: 'Túri Csaba',
    locale: 'hu_HU',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export default function RootLayout({children}: Readonly<{children: ReactNode}>) {
  return (
    <html lang="hu" className={inter.variable} data-scroll-behavior="smooth">
      <body className="font-sans">
        <ContentProvider>
          {children}
          {/* Service worker registration + the install offer. */}
          <PwaSetup />
        </ContentProvider>
        {CLOUDFLARE_TOKEN && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={`{"token": "${CLOUDFLARE_TOKEN}"}`}
          />
        )}
      </body>
    </html>
  );
}

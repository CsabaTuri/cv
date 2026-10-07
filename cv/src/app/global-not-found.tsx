'use client';

import './globals.css';
import Link from 'next/link';
import { ContentProvider, useText } from '@/components/ContentProvider';

/**
 * Standalone document rendered for URLs that match no route (e.g. `/nincs-ilyen`).
 * It is exported to `404.html`, which nginx serves for unknown paths, so it
 * renders its own document — the root layout is never applied here.
 */
function NotFoundContent() {
  const title = useText('notFound.title');
  const description = useText('notFound.description');
  const home = useText('notFound.home');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-indigo-600">404</p>

      <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mx-auto mt-4 max-w-xl text-base text-gray-600 sm:text-lg">{description}</p>
      <Link
        href="/"
        className="mt-8 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-transform hover:-translate-y-0.5"
      >
        {home}
      </Link>
    </main>
  );
}

export default function GlobalNotFound() {
  return (
    <html lang="hu">
      <body className="font-sans">
        <ContentProvider>
          <NotFoundContent />
        </ContentProvider>
      </body>
    </html>
  );
}

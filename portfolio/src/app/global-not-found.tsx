import en from '../../messages/en.json';
import hu from '../../messages/hu.json';
import './globals.css';

/**
 * Standalone document rendered for URLs that match no route (e.g. `/valami`).
 * It is exported to `404.html`, which is what nginx and Netlify serve for
 * unknown paths, so it renders its own document — the locale layout is never
 * applied here, hence the bilingual (Hungarian + English) content.
 */
export default function GlobalNotFound() {
  return (
    <html lang="hu">
      <body className="font-sans">
        {/* Same pre-paint theme bootstrap as the locale layout. This document
            is only ever server-rendered, so a plain blocking script is fine
            (and cannot be re-rendered on the client). */}
        <script src="/theme-init.js" />

        <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-400">
            {hu.notFound.code}
          </p>

          <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-5xl">
            {hu.notFound.title}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-gray-600 dark:text-gray-300 sm:text-lg">
            {hu.notFound.description}
          </p>
          <a
            href="/"
            className="mt-8 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-transform hover:-translate-y-0.5"
          >
            {hu.notFound.home}
          </a>

          <div className="mt-14 w-full max-w-xl border-t border-gray-200 pt-8 dark:border-gray-800">
            <h2 className="text-xl font-semibold">{en.notFound.title}</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {en.notFound.description}
            </p>
            <a
              href="/en/"
              className="mt-6 inline-flex rounded-full border border-gray-300 px-6 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:text-white"
            >
              {en.notFound.home}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}

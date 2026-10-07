/* eslint-env serviceworker */
// ---------------------------------------------------------------------------
// Service worker for the CV site.
//
// Two jobs:
//   * offline shell - the exported site is static, so the app shell and the
//     hashed Next.js assets are cached: a repeat visit works without a network,
//     and a navigation falls back to the cached shell. `/api/*` is never
//     cached: the chat and the admin panel always need live data.
//   * push notifications - the push payload is rendered by the browser through
//     this worker, and a click focuses the right page (or opens it).
//
// Bump CACHE_VERSION when the caching behaviour changes; old caches are
// dropped on activate.
// ---------------------------------------------------------------------------

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `cv-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `cv-assets-${CACHE_VERSION}`;

const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icon.png',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const ASSET_PATTERN = /\.(?:css|js|mjs|jpg|jpeg|gif|png|svg|ico|webp|avif|woff2?|ttf|eot)$/i;

// The exported HTML points at hashed `/_next/static/...` files whose names are
// not known here, so they are read out of the shell and cached on install:
// without them an offline load would show the shell with no styles or scripts.
async function warmUpShell() {
  const cache = await caches.open(SHELL_CACHE);
  const response = await fetch('/', {cache: 'reload'});
  if (!response.ok) return;
  await cache.put('/', response.clone());

  const html = await response.text();
  const urls = new Set([...html.matchAll(/(?:src|href)="(\/_next\/[^"]+)"/g)].map((match) => match[1]));
  if (!urls.size) return;

  const assets = await caches.open(ASSET_CACHE);
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const asset = await fetch(url, {cache: 'reload'});
        if (asset.ok) await assets.put(url, asset);
      } catch {
        // A missing asset only costs offline polish, never the online site.
      }
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(new Request(url, {cache: 'reload'}))));
      await warmUpShell();
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const {request} = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the API: the chat and the admin panel need live answers.
  if (url.pathname.startsWith('/api/')) return;

  // Pages: fresh when possible, the cached shell when not.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, response.clone());
          return response;
        } catch {
          return (await caches.match(request)) || (await caches.match('/')) || Response.error();
        }
      })()
    );
    return;
  }

  if (!ASSET_PATTERN.test(url.pathname)) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(ASSET_CACHE);
        cache.put(request, response.clone());
      }
      return response;
    })()
  );
});

// --- push -----------------------------------------------------------------

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {body: event.data ? event.data.text() : ''};
  }

  const title = payload.title || 'Értesítés';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icon.png',
      tag: payload.tag || 'cv-chat',
      renotify: true,
      requireInteraction: false,
      data: {url: payload.url || '/'},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
      const samePage = clients.find((client) => client.url.split('#')[0] === target);
      if (samePage) return samePage.focus();

      const other = clients[0];
      if (other) {
        await other.focus();
        if ('navigate' in other) return other.navigate(target);
      }

      return self.clients.openWindow(target);
    })()
  );
});

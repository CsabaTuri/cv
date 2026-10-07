// Serves the exported site the way nginx does in production, so the end-to-end
// tests run against the real build: the files from `cv/out`, everything under
// `/api/` proxied to the chat backend, and an unknown path answered with
// `404.html` - exactly the rules in cv/nginx.conf.
//
// Playwright starts this next to the backend (see playwright.config.ts).

import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { createServer, request as proxyRequest } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(fileURLToPath(new URL('../../cv/out', import.meta.url)));
const API_URL = new URL(process.env.E2E_API_URL ?? 'http://127.0.0.1:3100');
const PORT = Number(process.env.E2E_SITE_PORT ?? 3101);

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
};

/** The file behind a request path, or null when it does not exist. */
async function resolveFile(pathname) {
  const candidates = [];
  if (pathname.endsWith('/')) candidates.push(`${pathname}index.html`);
  candidates.push(pathname);

  for (const candidate of candidates) {
    const file = resolve(OUT_DIR, `.${decodeURIComponent(candidate)}`);
    if (!file.startsWith(OUT_DIR + sep)) continue; // never leave the export

    const info = await stat(file).catch(() => null);
    if (info?.isFile()) return file;
  }

  return null;
}

function send(res, status, file) {
  const headers = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' };

  // The worker itself must never be cached, and it is allowed to control the
  // whole origin - nginx sets both in production too.
  if (file.endsWith(`${sep}sw.js`)) {
    headers['cache-control'] = 'no-cache, no-store, must-revalidate';
    headers['service-worker-allowed'] = '/';
  }

  res.writeHead(status, headers);
  createReadStream(file).pipe(res);
}

async function serveSite(req, res) {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const file = await resolveFile(pathname);
  if (file) return send(res, 200, file);

  const notFound = await resolveFile('/404.html');
  if (notFound) return send(res, 404, notFound);

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

function proxy(req, res) {
  const target = new URL(req.url ?? '/', API_URL);
  const upstream = proxyRequest(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );

  upstream.on('error', () => {
    if (res.headersSent) return res.end();
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'the backend is not reachable' }));
  });

  req.pipe(upstream);
}

const server = createServer((req, res) => {
  if (req.url?.startsWith('/api/')) proxy(req, res);
  else void serveSite(req, res);
});

const SOURCE_DIR = resolve(OUT_DIR, '../src');

/** The newest modification time anywhere under a directory. */
async function newestMtime(dir) {
  const entries = await readdir(dir, { recursive: true }).catch(() => []);
  let newest = 0;

  for (const entry of entries) {
    const info = await stat(join(dir, entry)).catch(() => null);
    if (info?.isFile()) newest = Math.max(newest, info.mtimeMs);
  }

  return newest;
}

const exportIndex = resolve(OUT_DIR, 'index.html');
const index = await stat(exportIndex).catch(() => null);

if (!index) {
  console.error(
    `[e2e] no export in ${OUT_DIR}\n[e2e] build the site first:  npm --prefix cv run build`,
  );
  process.exit(1);
}

// Testing a build that predates the sources is the classic way to lose half an
// hour, so say it out loud: the tests would only fail on a missing element.
if ((await newestMtime(SOURCE_DIR)) > index.mtimeMs) {
  console.warn('[e2e] warning: the export is older than cv/src - run `npm --prefix cv run build`');
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[e2e] http://127.0.0.1:${PORT} serving ${OUT_DIR}, /api -> ${API_URL.origin}`);
});

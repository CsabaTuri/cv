// tests/helpers.mjs
//
// Shared helpers for the test suite: an ephemeral backend instance, a VAPID key
// pair and subscription fixtures. No dependencies: the tests only use
// `node:crypto`, `node:child_process` and the global `fetch`, so the suite runs
// wherever Node 20+ and a MySQL are available (CI uses a `mysql:8.4` service
// container, the same shape as the stack itself).

import { spawn } from 'node:child_process';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_DIR = path.resolve(HERE, '..');
export const BACKEND_DIR = path.join(REPO_DIR, 'chat-backend');

export const DEFAULT_DB = {
  DB_HOST: process.env.DB_HOST ?? '127.0.0.1',
  DB_PORT: process.env.DB_PORT ?? '3306',
  DB_NAME: process.env.DB_NAME ?? 'cv_chat_test',
  DB_USER: process.env.DB_USER ?? 'chat',
  DB_PASSWORD: process.env.DB_PASSWORD ?? 'chat',
};

export const DEFAULT_ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'ci-admin-token';

export function adminHeaders(token = DEFAULT_ADMIN_TOKEN) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export function jsonHeaders() {
  return { 'Content-Type': 'application/json' };
}

// A VAPID pair in the shape web-push expects, without importing web-push: an
// uncompressed P-256 point and the private scalar, both base64url.
export function vapidKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });

  const point = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(pub.x, 'base64url'),
    Buffer.from(pub.y, 'base64url'),
  ]);

  return {
    publicKey: point.toString('base64url'),
    privateKey: priv.d.toString('base64url'),
  };
}

// A subscription object shaped exactly like `PushSubscription.toJSON()`.
export function fakeSubscription(endpoint) {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });

  const point = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]);

  return {
    endpoint,
    keys: {
      p256dh: point.toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
}

export async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port, child, logs) {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`backend exited with ${child.exitCode}:\n${logs.join('')}`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`backend did not become healthy:\n${logs.join('')}`);
}

// Boots the real entry point (`node server.js`), the way the container does.
export async function startBackend({ env = {} } = {}) {
  const port = await freePort();
  const logs = [];

  const child = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      ...DEFAULT_DB,
      ADMIN_TOKEN: DEFAULT_ADMIN_TOKEN,
      PORT: String(port),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr.on('data', (chunk) => logs.push(String(chunk)));

  await waitForHealth(port, child, logs);

  return {
    url: `http://127.0.0.1:${port}`,
    logs,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 5000);
        child.on('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}

export async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`not JSON (${response.status}): ${text.slice(0, 200)}`);
  }
}

export function uniqueId() {
  return randomBytes(8).toString('hex');
}

export function uuid() {
  return randomUUID();
}

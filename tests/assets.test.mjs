// tests/assets.test.mjs
//
// Static guards for the things that are easy to break and hard to notice: the
// PWA manifest and icons, the service worker, the nginx rules that make the
// worker and the api work, and the compose invariants this stack got wrong at
// least once (a `latest` image tag, a profile that orphans a network, a gateway
// outside its subnet, a missing mandatory variable).

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { REPO_DIR } from './helpers.mjs';

const read = (...parts) => fs.readFileSync(path.join(REPO_DIR, ...parts), 'utf8');
const exists = (...parts) => fs.existsSync(path.join(REPO_DIR, ...parts));

const manifest = JSON.parse(read('cv', 'public', 'manifest.webmanifest'));
const sw = read('cv', 'public', 'sw.js');
const nginx = read('cv', 'nginx.conf');
const compose = read('docker-compose.yml');
const composeProd = read('docker-compose.prod.yml');
const composeDev = read('docker-compose.override.yml');
const envExample = read('.env.example');

function pngSize(file) {
  const buffer = fs.readFileSync(file);
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG', `${file} is a PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// Comments mention `${VAR:?}` as an example; only real directives count.
function stripComments(text) {
  return text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

function ipToInt(ip) {
  return ip.split('.').reduce((accumulator, part) => (accumulator << 8) + Number(part), 0) >>> 0;
}

function ipInCidr(ip, cidr) {
  const [range, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(range) & mask);
}

describe('PWA manifest', () => {
  it('carries what an installable app needs', () => {
    assert.ok(manifest.name.length > 3);
    assert.ok(manifest.short_name.length >= 1 && manifest.short_name.length <= 12);
    assert.equal(manifest.lang, 'hu');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.display, 'standalone');
    assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
    assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  });

  it('declares 192/512 icons and a maskable one', () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    assert.ok(sizes.includes('192x192'), 'has a 192px icon');
    assert.ok(sizes.includes('512x512'), 'has a 512px icon');
    assert.ok(
      manifest.icons.some((icon) => icon.purpose === 'maskable'),
      'has a maskable icon',
    );
  });

  it('points at icon files that exist with the declared size', () => {
    for (const icon of manifest.icons) {
      const file = path.join(REPO_DIR, 'cv', 'public', icon.src.replace(/^\//, ''));
      assert.ok(fs.existsSync(file), `${icon.src} exists`);

      const [width, height] = icon.sizes.split('x').map(Number);
      assert.deepEqual(pngSize(file), { width, height }, `${icon.src} is ${icon.sizes}`);
    }

    assert.deepEqual(pngSize(path.join(REPO_DIR, 'cv', 'public', 'apple-touch-icon.png')), {
      width: 180,
      height: 180,
    });
    assert.ok(exists('cv', 'public', 'favicon.ico'), 'a favicon is shipped');
  });

  it('is referenced by the layout, which also registers the worker', () => {
    const layout = read('cv', 'src', 'app', 'layout.tsx');
    assert.match(layout, /manifest: '\/manifest\.webmanifest'/);
    assert.match(layout, /appleWebApp/);
    assert.match(layout, /<PwaSetup \/>/);
  });
});

describe('service worker', () => {
  it('parses', () => {
    assert.doesNotThrow(() =>
      execFileSync(process.execPath, ['--check', path.join(REPO_DIR, 'cv', 'public', 'sw.js')]),
    );
  });

  it('handles offline shell and push', () => {
    for (const handler of ['install', 'activate', 'fetch', 'push', 'notificationclick']) {
      assert.match(sw, new RegExp(`addEventListener\\('${handler}'`), `${handler} is handled`);
    }
    assert.match(sw, /showNotification/);
    assert.match(sw, /skipWaiting/);
  });

  it('never caches the API', () => {
    assert.match(sw, /startsWith\('\/api\/'\)\)\s*return/, 'api requests bypass the cache');
  });
});

describe('nginx rules', () => {
  it('serves the worker uncached and the manifest with its own type', () => {
    assert.match(nginx, /location = \/sw\.js \{[\s\S]*?no-cache/, 'sw.js is never cached long');
    assert.match(nginx, /Service-Worker-Allowed/, 'the worker may control the root scope');
    assert.match(nginx, /location = \/manifest\.webmanifest \{[\s\S]*?application\/manifest\+json/);
  });

  it('allows the HTTP methods the API needs', () => {
    // DELETE unsubscribes from the notifications and used to be blocked here.
    assert.match(nginx, /GET\|HEAD\|POST\|PUT\|DELETE\|OPTIONS/);
  });
});

describe('compose invariants', () => {
  it('never tags an image with latest', () => {
    for (const [name, text] of Object.entries({ compose, composeProd, composeDev })) {
      assert.ok(!/:latest\b/.test(text), `${name} has no :latest tag`);
      assert.ok(!/:-latest\}/.test(text), `${name} has no latest default`);
    }
  });

  it('requires a concrete version per image', () => {
    for (const variable of ['IMAGE_TAG_CV', 'IMAGE_TAG_CHAT_BACKEND', 'IMAGE_TAG_DEPLOYER']) {
      assert.match(compose, new RegExp(`\\$\\{${variable}:\\?`), `${variable} fails fast`);
    }
  });

  it('keeps the deployer out of a compose profile', () => {
    // A profiled service is skipped by the other invocations, and the leftover
    // container then blocks removing the shared networks.
    assert.ok(!/^\s{2,}profiles:/m.test(compose), 'no service uses profiles');
  });

  it('puts the network gateway inside its subnet, outside the docker default pool', () => {
    const subnet = compose.match(/subnet:\s*([\d.]+)\/\d+/)?.[1];
    const gateway = compose.match(/gateway:\s*"([\d.]+)"/)?.[1];
    const bits = compose.match(/subnet:\s*[\d.]+\/(\d+)/)?.[1];

    assert.ok(subnet && gateway && bits, 'the app network is pinned');
    assert.ok(ipInCidr(gateway, `${subnet}/${bits}`), `${gateway} is inside ${subnet}/${bits}`);

    const secondOctet = Number(subnet.split('.')[1]);
    assert.ok(secondOctet < 17 || secondOctet > 31, 'the subnet avoids docker default pool');
  });

  it('passes the push keys to the backend and to the rebuild helper', () => {
    for (const variable of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
      const occurrences = compose.match(new RegExp(`${variable}: \\$\\{`, 'g')) ?? [];
      assert.ok(occurrences.length >= 2, `${variable} reaches chat-backend and the deployer`);
    }
  });
});

describe('environment template', () => {
  it('documents every mandatory variable', () => {
    const mandatory = new Set();
    for (const text of [compose, composeProd, composeDev]) {
      for (const match of stripComments(text).matchAll(/\$\{([A-Z0-9_]+):\?/g)) {
        mandatory.add(match[1]);
      }
    }

    assert.ok(mandatory.size >= 6, 'the stack has mandatory variables');

    for (const variable of mandatory) {
      assert.match(envExample, new RegExp(`^${variable}=`, 'm'), `${variable} is in .env.example`);
    }
  });

  it('does not document variables the stack no longer uses', () => {
    const declared = [...envExample.matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1]);
    const composeText = stripComments(`${compose}\n${composeProd}\n${composeDev}`);

    const stale = declared.filter(
      (variable) =>
        !composeText.includes(`\${${variable}`) && !composeText.includes(`${variable}:`),
    );
    assert.deepEqual(stale, [], 'every documented variable is used by the stack');
  });
});

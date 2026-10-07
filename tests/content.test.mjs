// tests/content.test.mjs
//
// Guards the site copy: the catalogue in `chat-backend/content.js` is the single
// source of defaults, every key the frontend asks for has to exist there (a typo
// means a permanent `…` on the page), and the hooks have to match the field type
// (plain text vs JSON).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { CONTENT_FIELDS, storedValue } from '../chat-backend/content.js';
import { REPO_DIR } from './helpers.mjs';

const fields = new Map(CONTENT_FIELDS.map((field) => [field.key, field]));

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(tsx|ts)$/.test(entry.name) ? [full] : [];
  });
}

// `useText('key')` / `useJsonList('key')` -> [{ key, hook, file }]
function usedKeys() {
  const sourceDir = path.join(REPO_DIR, 'cv', 'src');
  const used = [];

  for (const file of walk(sourceDir)) {
    const source = fs.readFileSync(file, 'utf8');
    const pattern = /use(Text|JsonList)\('([^']+)'\)/g;

    for (const match of source.matchAll(pattern)) {
      used.push({
        hook: match[1] === 'Text' ? 'useText' : 'useJsonList',
        key: match[2],
        file: path.relative(REPO_DIR, file),
      });
    }
  }

  return used;
}

describe('content catalogue', () => {
  it('has unique, well-formed keys', () => {
    const keys = CONTENT_FIELDS.map((field) => field.key);
    assert.equal(new Set(keys).size, keys.length, 'no duplicate keys');

    for (const field of CONTENT_FIELDS) {
      assert.match(field.key, /^[a-z][A-Za-z0-9]*\.[A-Za-z0-9]+$/, field.key);
      assert.ok(field.group && field.group.length > 1, `group of ${field.key}`);
      assert.ok(field.label && field.label.length > 1, `label of ${field.key}`);
      assert.ok(
        typeof field.value === 'string' ||
          Array.isArray(field.value) ||
          typeof field.value === 'object',
        `value of ${field.key}`,
      );
    }
  });

  it('serialises JSON fields as JSON and the rest as-is', () => {
    for (const field of CONTENT_FIELDS) {
      const stored = storedValue(field);
      assert.equal(typeof stored, 'string', field.key);

      if (field.json) {
        assert.doesNotThrow(() => JSON.parse(stored), `${field.key} is valid JSON`);
      } else {
        assert.equal(stored, field.value, field.key);
      }
    }
  });

  it('covers every key the frontend asks for, with the matching hook', () => {
    const used = usedKeys();
    assert.ok(used.length > 20, 'the frontend does use the catalogue');

    const missing = used.filter((item) => !fields.has(item.key));
    assert.deepEqual(
      missing.map((item) => `${item.file}: ${item.hook}('${item.key}')`),
      [],
      'every key used by the frontend exists in the catalogue',
    );

    const wrongHook = used.filter(
      (item) => Boolean(fields.get(item.key)?.json) !== (item.hook === 'useJsonList'),
    );
    assert.deepEqual(
      wrongHook.map((item) => `${item.file}: ${item.hook}('${item.key}')`),
      [],
      'JSON fields are read with useJsonList, plain fields with useText',
    );
  });

  it('contains the notification copy the backend sends', () => {
    const server = fs.readFileSync(path.join(REPO_DIR, 'chat-backend', 'server.js'), 'utf8');
    const block = server.match(/const PUSH_TEXT_KEYS = \[([\s\S]*?)\];/);
    assert.ok(block, 'PUSH_TEXT_KEYS is declared');

    const keys = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    assert.ok(keys.length >= 5, 'the notification texts are listed');

    for (const key of keys) {
      assert.ok(fields.has(key), `${key} is in the catalogue`);
    }
  });

  it('keeps the editable copy of the notifications and the PWA in the catalogue', () => {
    for (const key of [
      'notify.adminTitle',
      'notify.replyTitle',
      'notify.testTitle',
      'notify.enable',
      'notify.off',
      'pwa.install',
      'pwa.dismiss',
    ]) {
      assert.ok(fields.has(key), `${key} is editable`);
    }
  });
});

// tests/api.test.mjs
//
// Integration tests for the chat API against a real MySQL: the backend is
// started exactly as the container does (`node server.js`) and exercised over
// HTTP, so schema creation, auth, validation and the push bookkeeping are all
// covered by a single run.
//
//   node --test tests/
//
// Environment (defaults match the CI service container):
//   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, ADMIN_TOKEN

import assert from 'node:assert/strict';
import {after, before, describe, it} from 'node:test';
import {CONTENT_FIELDS} from '../chat-backend/content.js';
import {
  DEFAULT_ADMIN_TOKEN,
  adminHeaders,
  fakeSubscription,
  jsonHeaders,
  readJson,
  startBackend,
  uniqueId,
  uuid,
  vapidKeyPair,
} from './helpers.mjs';

const keys = vapidKeyPair();
const session = uuid();
const jsonField = CONTENT_FIELDS.find((field) => field.json);
const textField = CONTENT_FIELDS.find((field) => !field.json);

let backend;
let cursor = 0;

before(async () => {
  backend = await startBackend({
    env: {
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: 'mailto:ci@example.com',
    },
  });
});

after(async () => {
  await backend?.stop();
});

describe('health', () => {
  it('reports the database as reachable', async () => {
    const response = await fetch(`${backend.url}/api/health`);
    const body = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.database, true);
  });
});

describe('visitor chat', () => {
  it('stores a message and creates a conversation', async () => {
    const response = await fetch(`${backend.url}/api/chat`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({sessionId: session, message: 'Első üzenet'}),
    });
    const body = await readJson(response);

    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.sessionId, session);
    assert.equal(body.message.role, 'visitor');
    assert.equal(body.message.body, 'Első üzenet');
    assert.ok(body.message.id > 0);
  });

  it('generates a session id when none is given', async () => {
    const response = await fetch(`${backend.url}/api/chat`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({message: 'Session nélkül'}),
    });
    const body = await readJson(response);

    assert.equal(response.status, 201);
    assert.match(body.sessionId, /^[0-9a-f-]{36}$/);
    assert.notEqual(body.sessionId, session);
  });

  it('returns only the messages after the cursor', async () => {
    const first = await readJson(
      await fetch(`${backend.url}/api/chat/messages?sessionId=${session}&afterId=0`)
    );
    assert.equal(first.messages.length, 1);
    cursor = first.cursor;

    await fetch(`${backend.url}/api/chat`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({sessionId: session, message: 'Második üzenet'}),
    });

    const second = await readJson(
      await fetch(`${backend.url}/api/chat/messages?sessionId=${session}&afterId=${cursor}`)
    );
    assert.equal(second.messages.length, 1);
    assert.equal(second.messages[0].body, 'Második üzenet');
    assert.ok(second.cursor > cursor);
  });

  it('rejects an empty and an oversized message', async () => {
    const empty = await fetch(`${backend.url}/api/chat`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({sessionId: session, message: '   '}),
    });
    assert.equal(empty.status, 400);

    const long = await fetch(`${backend.url}/api/chat`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({sessionId: session, message: 'x'.repeat(4001)}),
    });
    assert.equal(long.status, 400);
  });

  it('rejects a missing session id', async () => {
    const response = await fetch(`${backend.url}/api/chat/messages`);
    assert.equal(response.status, 400);
  });
});

describe('admin API', () => {
  it('refuses requests without a valid token', async () => {
    assert.equal((await fetch(`${backend.url}/api/admin/conversations`)).status, 401);
    assert.equal(
      (
        await fetch(`${backend.url}/api/admin/conversations`, {
          headers: adminHeaders('wrong-token'),
        })
      ).status,
      401
    );
  });

  it('lists the conversation with its unread count', async () => {
    const body = await readJson(
      await fetch(`${backend.url}/api/admin/conversations`, {headers: adminHeaders()})
    );

    const conversation = body.conversations.find((item) => item.id === session);
    assert.ok(conversation, 'the visitor conversation is listed');
    assert.equal(conversation.messageCount, 2);
    assert.equal(conversation.unread, 2);
    assert.equal(conversation.lastMessage.role, 'visitor');
    assert.ok(conversation.number >= 1);
  });

  it('stores a reply and clears the unread count', async () => {
    const response = await fetch(`${backend.url}/api/admin/conversations/${session}/reply`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({message: 'Válasz a tesztből'}),
    });
    const body = await readJson(response);

    assert.equal(response.status, 201);
    assert.equal(body.message.role, 'admin');

    const list = await readJson(
      await fetch(`${backend.url}/api/admin/conversations`, {headers: adminHeaders()})
    );
    const conversation = list.conversations.find((item) => item.id === session);
    assert.equal(conversation.unread, 0);

    const thread = await readJson(
      await fetch(`${backend.url}/api/admin/conversations/${session}/messages`, {
        headers: adminHeaders(),
      })
    );
    assert.equal(thread.messages.at(-1).body, 'Válasz a tesztből');
  });

  it('answers 404 for an unknown conversation', async () => {
    const response = await fetch(
      `${backend.url}/api/admin/conversations/${uuid()}/reply`,
      {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({message: 'Sehova'}),
      }
    );
    assert.equal(response.status, 404);
  });
});

describe('site copy', () => {
  it('serves the catalogue publicly', async () => {
    const body = await readJson(await fetch(`${backend.url}/api/content`));

    assert.equal(body.ok, true);
    assert.ok(Object.keys(body.content).length > 40);
    assert.ok('site.name' in body.content);
  });

  it('saves a known field and rejects the rest', async () => {
    const saved = await readJson(
      await fetch(`${backend.url}/api/admin/content`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({values: {[textField.key]: 'Teszt érték'}}),
      })
    );
    assert.equal(saved.saved, 1);

    const updated = await readJson(await fetch(`${backend.url}/api/content`));
    assert.equal(updated.content[textField.key], 'Teszt érték');

    const unknown = await fetch(`${backend.url}/api/admin/content`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({values: {'nincs.ilyen': 'x'}}),
    });
    assert.equal(unknown.status, 400);

    const tooLong = await fetch(`${backend.url}/api/admin/content`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({values: {[textField.key]: 'x'.repeat(20001)}}),
    });
    assert.equal(tooLong.status, 413);
  });

  it('validates JSON fields', async () => {
    assert.ok(jsonField, 'the catalogue has at least one JSON field');

    const broken = await fetch(`${backend.url}/api/admin/content`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({values: {[jsonField.key]: '{not json'}}),
    });
    assert.equal(broken.status, 400);

    const valid = await fetch(`${backend.url}/api/admin/content`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({values: {[jsonField.key]: '[]'}}),
    });
    assert.equal(valid.status, 200);
  });
});

describe('push subscriptions', () => {
  const adminEndpoint = `https://push.invalid/ci-admin-${uniqueId()}`;
  const visitorEndpoint = `https://push.invalid/ci-visitor-${uniqueId()}`;

  it('exposes the VAPID public key', async () => {
    const body = await readJson(await fetch(`${backend.url}/api/push/public-key`));

    assert.equal(body.ok, true);
    assert.equal(body.enabled, true);
    assert.equal(body.key, keys.publicKey);
  });

  it('rejects invalid subscription requests', async () => {
    const cases = [
      {audience: 'nonsense', subscription: fakeSubscription(adminEndpoint), status: 400},
      {audience: 'visitor', subscription: fakeSubscription(visitorEndpoint), status: 400},
    ];

    for (const item of cases) {
      const response = await fetch(`${backend.url}/api/push/subscriptions`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(item),
      });
      assert.equal(response.status, item.status, JSON.stringify(item));
    }

    const badKeys = await fetch(`${backend.url}/api/push/subscriptions`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        audience: 'visitor',
        sessionId: session,
        subscription: {endpoint: visitorEndpoint, keys: {p256dh: '!!!', auth: '!!'}},
      }),
    });
    assert.equal(badKeys.status, 400);

    const insecureEndpoint = await fetch(`${backend.url}/api/push/subscriptions`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        audience: 'visitor',
        sessionId: session,
        subscription: fakeSubscription('http://push.invalid/insecure'),
      }),
    });
    assert.equal(insecureEndpoint.status, 400);

    const noToken = await fetch(`${backend.url}/api/push/subscriptions`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({audience: 'admin', subscription: fakeSubscription(adminEndpoint)}),
    });
    assert.equal(noToken.status, 401);
  });

  it('stores an admin and a visitor subscription without leaking endpoints', async () => {
    const admin = await fetch(`${backend.url}/api/push/subscriptions`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        audience: 'admin',
        subscription: fakeSubscription(adminEndpoint),
        userAgent: 'ci-test',
      }),
    });
    assert.equal(admin.status, 201);

    const visitor = await fetch(`${backend.url}/api/push/subscriptions`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        audience: 'visitor',
        sessionId: session,
        subscription: fakeSubscription(visitorEndpoint),
      }),
    });
    assert.equal(visitor.status, 201);

    const response = await fetch(`${backend.url}/api/admin/push/subscriptions`, {
      headers: adminHeaders(),
    });
    const body = await readJson(response);

    assert.equal(body.ok, true);
    assert.equal(body.enabled, true);
    assert.ok(body.visitorCount >= 1);

    const stored = body.subscriptions.find((item) =>
      item.endpointHint.startsWith(adminEndpoint.slice(0, 32))
    );
    assert.ok(stored, 'the admin subscription is listed');
    assert.equal(stored.userAgent, 'ci-test');
    // The full endpoint is a capability URL: it must never be returned.
    assert.ok(!JSON.stringify(body).includes(adminEndpoint));
  });

  it('keeps the audiences apart when unsubscribing', async () => {
    const visitorTry = await readJson(
      await fetch(`${backend.url}/api/push/subscriptions`, {
        method: 'DELETE',
        headers: jsonHeaders(),
        body: JSON.stringify({
          audience: 'visitor',
          sessionId: session,
          endpoint: adminEndpoint,
        }),
      })
    );
    assert.equal(visitorTry.removed, 0);

    const adminDelete = await readJson(
      await fetch(`${backend.url}/api/push/subscriptions`, {
        method: 'DELETE',
        headers: adminHeaders(),
        body: JSON.stringify({audience: 'admin', endpoint: adminEndpoint}),
      })
    );
    assert.equal(adminDelete.removed, 1);
  });

  it('never lets a failing push break the chat API', async () => {
    // A dead endpoint: DNS for `.invalid` never resolves, so the delivery fails
    // in the background - after the HTTP answer has been sent.
    const endpoint = `https://push.invalid/ci-dead-${uniqueId()}`;

    await fetch(`${backend.url}/api/push/subscriptions`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({audience: 'admin', subscription: fakeSubscription(endpoint)}),
    });

    const started = Date.now();
    const response = await fetch(`${backend.url}/api/chat`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({sessionId: session, message: 'Push nélkül is menjen'}),
    });
    const elapsed = Date.now() - started;

    assert.equal(response.status, 201);
    assert.ok(elapsed < 1500, `the answer must not wait for push (took ${elapsed} ms)`);

    const hint = endpoint.slice(0, 32);
    let stored = null;

    for (let attempt = 0; attempt < 20 && !stored?.lastErrorAt; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const body = await readJson(
        await fetch(`${backend.url}/api/admin/push/subscriptions`, {headers: adminHeaders()})
      );
      stored = body.subscriptions.find((item) => item.endpointHint.startsWith(hint));
    }

    assert.ok(stored, 'the subscription is still stored');
    assert.ok(stored.lastErrorAt, 'the failed delivery is recorded');
    assert.equal(stored.lastSuccessAt, null);
  });
});

describe('push switched off', () => {
  let plainBackend;

  before(async () => {
    plainBackend = await startBackend({env: {VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: ''}});
  });

  after(async () => {
    await plainBackend?.stop();
  });

  it('reports the feature as disabled', async () => {
    const body = await readJson(await fetch(`${plainBackend.url}/api/push/public-key`));
    assert.equal(body.enabled, false);
    assert.equal(body.key, null);
  });

  it('refuses to store subscriptions', async () => {
    const response = await fetch(`${plainBackend.url}/api/push/subscriptions`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        audience: 'visitor',
        sessionId: session,
        subscription: fakeSubscription(`https://push.invalid/off-${uniqueId()}`),
      }),
    });
    assert.equal(response.status, 503);
  });

  it('still serves the chat', async () => {
    const response = await fetch(`${plainBackend.url}/api/chat`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({sessionId: session, message: 'Push nélkül is megy'}),
    });
    assert.equal(response.status, 201);
  });
});

describe('admin token', () => {
  it('is compared in constant time, so a longer token is never accepted', async () => {
    const response = await fetch(`${backend.url}/api/admin/conversations`, {
      headers: adminHeaders(`${DEFAULT_ADMIN_TOKEN}x`),
    });
    assert.equal(response.status, 401);
  });
});

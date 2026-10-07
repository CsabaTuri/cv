// chat-backend/push.js
//
// Web Push for the chat: the admin is told about a new visitor message, the
// visitor about a reply, through the browser's push service - so the
// notification arrives even with the site closed.
//
// The subscriptions live in MySQL (`push_subscriptions`); the VAPID key pair
// comes from the environment. Without a key pair the whole feature stays
// disabled and the API answers 503 instead of half-working.

import webpush from 'web-push';

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const SUBJECT = process.env.VAPID_SUBJECT ?? '';

const ENABLED = Boolean(PUBLIC_KEY && PRIVATE_KEY && SUBJECT);

const MAX_ENDPOINT_LENGTH = 512;
const MAX_KEY_LENGTH = 128;
const MAX_BODY_LENGTH = 160;

if (ENABLED) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  } catch (error) {
    console.error('[push] invalid VAPID configuration:', error.message);
  }
} else {
  console.warn('[push] disabled: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT');
}

export function pushConfigured() {
  return ENABLED;
}

export function vapidPublicKey() {
  return ENABLED ? PUBLIC_KEY : null;
}

function isBase64Url(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_KEY_LENGTH &&
    /^[A-Za-z0-9_-]+={0,2}$/.test(value)
  );
}

// Accepts the shape `PushSubscription.toJSON()` produces.
export function readSubscription(input) {
  const subscription = input?.subscription ?? input;
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH) return null;
  if (!/^https:\/\//.test(endpoint)) return null;
  if (!isBase64Url(p256dh) || !isBase64Url(auth)) return null;

  return { endpoint, p256dh, auth };
}

export async function saveSubscription(
  pool,
  { audience, conversationId, subscription, userAgent },
) {
  await pool.query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, audience, conversation_id, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       p256dh = VALUES(p256dh),
       auth = VALUES(auth),
       conversation_id = VALUES(conversation_id),
       user_agent = VALUES(user_agent),
       last_error_at = NULL`,
    [
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth,
      audience,
      conversationId ?? null,
      (userAgent ?? '').slice(0, 255) || null,
    ],
  );
}

// Returns the number of removed rows. The visitor may only remove a
// subscription that belongs to their own conversation, the admin only their
// own audience.
export async function deleteSubscription(pool, { audience, conversationId, endpoint }) {
  const [result] = await pool.query(
    `DELETE FROM push_subscriptions
      WHERE audience = ? AND endpoint = ?
        AND (? IS NULL OR conversation_id = ?)`,
    [audience, endpoint, conversationId ?? null, conversationId ?? null],
  );
  return result.affectedRows;
}

export async function listSubscriptions(pool, audience) {
  const [rows] = await pool.query(
    `SELECT id, endpoint, user_agent, conversation_id, created_at, last_success_at, last_error_at
       FROM push_subscriptions WHERE audience = ? ORDER BY created_at DESC`,
    [audience],
  );

  return rows.map((row) => ({
    id: row.id,
    // The endpoint is a capability URL: never hand it out in full.
    endpointHint: `${String(row.endpoint).slice(0, 32)}…`,
    conversationId: row.conversation_id,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastSuccessAt: row.last_success_at,
    lastErrorAt: row.last_error_at,
  }));
}

function truncate(body) {
  const text = String(body ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > MAX_BODY_LENGTH ? `${text.slice(0, MAX_BODY_LENGTH - 1)}…` : text;
}

async function deliver(pool, rows, payload) {
  let sent = 0;
  let failed = 0;
  const body = JSON.stringify(payload);

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
          { TTL: 3600, urgency: 'high' },
        );
        sent += 1;
        await pool.query(
          'UPDATE push_subscriptions SET last_success_at = CURRENT_TIMESTAMP WHERE id = ?',
          [row.id],
        );
      } catch (error) {
        failed += 1;
        // 404/410 mean the browser dropped the subscription for good.
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await pool
            .query('DELETE FROM push_subscriptions WHERE id = ?', [row.id])
            .catch(() => undefined);
          return;
        }

        console.error(
          `[push] delivery failed (${error?.statusCode ?? 'no status'}):`,
          error?.message,
        );
        await pool
          .query('UPDATE push_subscriptions SET last_error_at = CURRENT_TIMESTAMP WHERE id = ?', [
            row.id,
          ])
          .catch(() => undefined);
      }
    }),
  );

  return { sent, failed };
}

async function subscriptionsFor(pool, audience, conversationId) {
  const [rows] = await pool.query(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions
      WHERE audience = ? AND (? IS NULL OR conversation_id = ?)`,
    [audience, conversationId ?? null, conversationId ?? null],
  );
  return rows;
}

// Fire-and-forget on purpose: a push problem must never fail the API call that
// triggered it.
export async function notifyAdmins(pool, { conversationId, message, texts }) {
  if (!ENABLED) return { sent: 0, failed: 0 };

  const rows = await subscriptionsFor(pool, 'admin', null);
  if (!rows.length) return { sent: 0, failed: 0 };

  return deliver(pool, rows, {
    title: texts.adminTitle,
    body: truncate(message),
    url: '/admin/',
    tag: `chat-${conversationId}`,
  });
}

export async function notifyVisitor(pool, { conversationId, message, texts }) {
  if (!ENABLED) return { sent: 0, failed: 0 };

  const rows = await subscriptionsFor(pool, 'visitor', conversationId);
  if (!rows.length) return { sent: 0, failed: 0 };

  return deliver(pool, rows, {
    title: texts.replyTitle,
    body: truncate(message) || texts.replyBody,
    url: '/',
    tag: `chat-${conversationId}`,
  });
}

export async function notifyAdminsTest(pool, { texts }) {
  if (!ENABLED) return { sent: 0, failed: 0 };

  const rows = await subscriptionsFor(pool, 'admin', null);
  if (!rows.length) return { sent: 0, failed: 0 };

  return deliver(pool, rows, {
    title: texts.testTitle,
    body: texts.testBody,
    url: '/admin/',
    tag: 'cv-chat-test',
  });
}

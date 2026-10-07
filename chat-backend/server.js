// chat-backend/server.js
//
// Chat API for the CV site: the visitor widget on the left, the admin inbox
// on the right, MySQL underneath. No external service, no AI.
//
// Visitor API:
//   POST /api/chat                     { sessionId?, message }
//     -> { ok, sessionId, message: { id, role, body, createdAt } }
//   GET  /api/chat/messages?sessionId=&afterId=
//     -> { ok, messages: [{ id, role, body, createdAt }], cursor }
//
// Site copy (public read, admin write):
//   GET  /api/content                 -> { ok, content: { key: value } }
//   GET  /api/admin/content           -> { ok, fields: [{ key, group, label,
//          multiline, json, value, updatedAt }] }
//   PUT  /api/admin/content           -> { values: { key: value } } -> { ok, saved }
//   Everything the site displays comes from here; the catalogue of keys and the
//   default copy lives in content.js and is seeded into `site_content`.
//
// Admin API (Authorization: Bearer <ADMIN_TOKEN>):
//   GET  /api/admin/conversations
//     -> { ok, conversations: [{ id, number, createdAt, lastMessageAt,
//          messageCount, unread, lastMessage: { role, body, createdAt } }] }
//     One entry per visitor session, newest activity first.
//   GET  /api/admin/conversations/:id/messages?afterId=
//     -> { ok, messages: [...], cursor }
//   POST /api/admin/conversations/:id/reply   { message }
//     -> { ok, message: { id, role, body, createdAt } }
//   GET  /api/admin/push/subscriptions
//     -> { ok, enabled, subscriptions, visitorCount }
//   POST /api/admin/push/test          -> sends a test notification to admins
//
// Push notifications (Web Push, works with the site closed):
//   GET    /api/push/public-key       -> { ok, enabled, key }
//   POST   /api/push/subscriptions    { audience, sessionId?, subscription }
//   DELETE /api/push/subscriptions    { audience, sessionId?, endpoint }
//   `audience: 'visitor'` needs a sessionId, `audience: 'admin'` needs the
//   admin token. A visitor is notified when an answer arrives, the admin when a
//   visitor writes.
//
// Environment:
//   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD   MySQL connection
//   ADMIN_TOKEN                                      guards /api/admin/*
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT  Web Push (optional)
//   PORT                                             default 3000

import { randomUUID, timingSafeEqual } from 'node:crypto';
import express from 'express';
import mysql from 'mysql2/promise';
import { CONTENT_FIELDS, storedValue } from './content.js';
import {
  deleteSubscription,
  listSubscriptions,
  notifyAdmins,
  notifyAdminsTest,
  notifyVisitor,
  pushConfigured,
  readSubscription,
  saveSubscription,
  vapidPublicKey,
} from './push.js';

const app = express();
app.use(express.json({ limit: '32kb' }));

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_ID_LENGTH = 64;

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? 'mysql',
  port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4',
  timezone: 'Z',
});

// Store and read every timestamp in UTC, independent of the server time zone.
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS conversations (
     id CHAR(36) NOT NULL PRIMARY KEY,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     last_message_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     visitor_ip VARCHAR(45) NULL,
     user_agent VARCHAR(255) NULL,
     INDEX idx_last_message (last_message_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS messages (
     id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
     conversation_id CHAR(36) NOT NULL,
     role ENUM('visitor','admin') NOT NULL,
     body TEXT NOT NULL,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_conversation (conversation_id, id),
     CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id)
       REFERENCES conversations(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
     id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
     endpoint VARCHAR(512) NOT NULL,
     p256dh VARCHAR(128) NOT NULL,
     auth VARCHAR(128) NOT NULL,
     audience ENUM('admin','visitor') NOT NULL,
     conversation_id CHAR(36) NULL,
     user_agent VARCHAR(255) NULL,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     last_success_at TIMESTAMP NULL,
     last_error_at TIMESTAMP NULL,
     UNIQUE KEY uniq_endpoint_audience (endpoint(255), audience),
     INDEX idx_audience_conversation (audience, conversation_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS site_content (
     \`key\` VARCHAR(64) NOT NULL PRIMARY KEY,
     value MEDIUMTEXT NOT NULL,
     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
       ON UPDATE CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

// Seeds the catalogue: existing rows are kept, so admin edits survive restarts.
async function seedContent() {
  for (const field of CONTENT_FIELDS) {
    await pool.query('INSERT IGNORE INTO site_content (`key`, value) VALUES (?, ?)', [
      field.key,
      storedValue(field),
    ]);
  }

  // Drop rows whose field no longer exists in the catalogue.
  await pool.query('DELETE FROM site_content WHERE `key` NOT IN (?)', [
    CONTENT_FIELDS.map((field) => field.key),
  ]);

  console.log(`[chat] content catalogue ready (${CONTENT_FIELDS.length} fields)`);
}

// MySQL may still be starting up when this container comes up.
async function initDatabase() {
  for (let attempt = 1; ; attempt += 1) {
    try {
      for (const statement of SCHEMA) await pool.query(statement);
      await seedContent();
      console.log('[chat] database ready');
      return;
    } catch (error) {
      if (attempt >= 30) throw error;
      console.warn(
        `[chat] database not ready (attempt ${attempt}): ${error.code ?? error.message}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

function toMessage(row) {
  return {
    id: Number(row.id),
    role: row.role,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function isUuidLike(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function readMessage(body) {
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return { error: 'Missing message' };
  if (message.length > MAX_MESSAGE_LENGTH) return { error: 'Message too long' };
  return { message };
}

function readAfterId(query) {
  const parsed = Number.parseInt(String(query?.afterId ?? '0'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

// Constant-time comparison of the `Authorization` header against the token.
function isAdmin(req) {
  if (!ADMIN_TOKEN) return false;

  const header = req.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : header;
  const a = Buffer.from(provided);
  const b = Buffer.from(ADMIN_TOKEN);

  return a.length === b.length && timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized' });
}

async function insertMessage(conversationId, role, body) {
  const [result] = await pool.query(
    'INSERT INTO messages (conversation_id, role, body) VALUES (?, ?, ?)',
    [conversationId, role, body],
  );
  await pool.query('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?', [
    conversationId,
  ]);

  const [rows] = await pool.query('SELECT * FROM messages WHERE id = ?', [result.insertId]);
  return toMessage(rows[0]);
}

// The copy of the notifications is editable on the admin page like every other
// text; these defaults are only used before the first seeding.
const PUSH_TEXT_DEFAULTS = {
  adminTitle: 'Új üzenet a chatban',
  replyTitle: 'Válasz érkezett',
  replyBody: 'Új üzenet a chatban.',
  testTitle: 'Teszt értesítés',
  testBody: 'Ha ezt látod, az értesítések működnek.',
};

const PUSH_TEXT_KEYS = [
  'notify.adminTitle',
  'notify.replyTitle',
  'notify.replyBody',
  'notify.testTitle',
  'notify.testBody',
];

async function pushTexts() {
  try {
    const [rows] = await pool.query('SELECT `key`, value FROM site_content WHERE `key` IN (?)', [
      PUSH_TEXT_KEYS,
    ]);
    const stored = Object.fromEntries(rows.map((row) => [row.key, String(row.value).trim()]));

    return {
      adminTitle: stored['notify.adminTitle'] || PUSH_TEXT_DEFAULTS.adminTitle,
      replyTitle: stored['notify.replyTitle'] || PUSH_TEXT_DEFAULTS.replyTitle,
      replyBody: stored['notify.replyBody'] || PUSH_TEXT_DEFAULTS.replyBody,
      testTitle: stored['notify.testTitle'] || PUSH_TEXT_DEFAULTS.testTitle,
      testBody: stored['notify.testBody'] || PUSH_TEXT_DEFAULTS.testBody,
    };
  } catch (error) {
    console.error('[push] could not read the notification texts:', error.message);
    return { ...PUSH_TEXT_DEFAULTS };
  }
}

function sendInBackground(work, label) {
  void work.catch((error) => console.error(`[push] ${label} failed:`, error?.message ?? error));
}

async function ensureConversation(sessionId, req) {
  const [rows] = await pool.query('SELECT id FROM conversations WHERE id = ?', [sessionId]);
  if (rows.length) return sessionId;

  const forwarded = req.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || req.socket.remoteAddress || null;
  const userAgent = (req.get('user-agent') ?? '').slice(0, 255) || null;

  await pool.query('INSERT INTO conversations (id, visitor_ip, user_agent) VALUES (?, ?, ?)', [
    sessionId,
    ip?.slice(0, 45) ?? null,
    userAgent,
  ]);

  return sessionId;
}

app.get(['/health', '/api/health'], async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ ok: true, database: true });
  } catch {
    return res.status(503).json({ ok: false, database: false });
  }
});

// --- Site copy -------------------------------------------------------------

app.get('/api/content', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT `key`, value FROM site_content');

    // Defaults from content.js, overwritten by whatever the admin saved.
    const content = {};
    for (const field of CONTENT_FIELDS) content[field.key] = storedValue(field);
    for (const row of rows) content[row.key] = row.value;

    return res.json({ ok: true, content });
  } catch (dbError) {
    console.error('[chat] failed to read the content:', dbError);
    return res.status(500).json({ ok: false, error: 'Could not read the content' });
  }
});

// --- Visitor API -----------------------------------------------------------

app.post('/api/chat', async (req, res) => {
  const { message, error } = readMessage(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  const requested = req.body?.sessionId;
  const sessionId = isUuidLike(requested) ? requested : randomUUID();

  try {
    await ensureConversation(sessionId, req);
    const stored = await insertMessage(sessionId, 'visitor', message);

    sendInBackground(
      pushTexts().then((texts) =>
        notifyAdmins(pool, { conversationId: sessionId, message, texts }),
      ),
      'admin notification',
    );

    return res.status(201).json({ ok: true, sessionId, message: stored });
  } catch (dbError) {
    console.error('[chat] failed to store message:', dbError);
    return res.status(500).json({ ok: false, error: 'Could not store message' });
  }
});

app.get('/api/chat/messages', async (req, res) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
  if (!isUuidLike(sessionId)) {
    return res.status(400).json({ ok: false, error: 'Missing sessionId' });
  }

  const afterId = readAfterId(req.query);

  try {
    const [rows] = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT 200',
      [sessionId, afterId],
    );
    const messages = rows.map(toMessage);
    return res.json({
      ok: true,
      messages,
      cursor: messages.length ? messages[messages.length - 1].id : afterId,
    });
  } catch (dbError) {
    console.error('[chat] failed to read messages:', dbError);
    return res.status(500).json({ ok: false, error: 'Could not read messages' });
  }
});

// --- Push notifications ----------------------------------------------------

app.get('/api/push/public-key', (_req, res) => {
  res.json({ ok: true, enabled: pushConfigured(), key: vapidPublicKey() });
});

// One endpoint for both sides: the audience decides which credential it needs.
function readAudience(req) {
  const audience = req.body?.audience;
  if (audience !== 'admin' && audience !== 'visitor') return { error: 'Unknown audience' };

  if (audience === 'admin') {
    if (!isAdmin(req)) return { unauthorized: true };
    return { audience, conversationId: null };
  }

  const sessionId = req.body?.sessionId;
  if (!isUuidLike(sessionId)) return { error: 'Missing sessionId' };
  return { audience, conversationId: sessionId };
}

app.post('/api/push/subscriptions', async (req, res) => {
  const { audience, conversationId, error, unauthorized } = readAudience(req);
  if (unauthorized) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (error) return res.status(400).json({ ok: false, error });
  if (!pushConfigured())
    return res.status(503).json({ ok: false, error: 'Push is not configured' });

  const subscription = readSubscription(req.body);
  if (!subscription) return res.status(400).json({ ok: false, error: 'Invalid subscription' });

  try {
    await saveSubscription(pool, {
      audience,
      conversationId,
      subscription,
      userAgent: req.body?.userAgent ?? req.get('user-agent'),
    });
    return res.status(201).json({ ok: true });
  } catch (dbError) {
    console.error('[push] failed to store the subscription:', dbError);
    return res.status(500).json({ ok: false, error: 'Could not store subscription' });
  }
});

app.delete('/api/push/subscriptions', async (req, res) => {
  const { audience, conversationId, error, unauthorized } = readAudience(req);
  if (unauthorized) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (error) return res.status(400).json({ ok: false, error });

  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  if (!endpoint) return res.status(400).json({ ok: false, error: 'Missing endpoint' });

  try {
    const removed = await deleteSubscription(pool, { audience, conversationId, endpoint });
    return res.json({ ok: true, removed });
  } catch (dbError) {
    console.error('[push] failed to remove the subscription:', dbError);
    return res.status(500).json({ ok: false, error: 'Could not remove subscription' });
  }
});

// --- Admin API -------------------------------------------------------------

app.get('/api/admin/conversations', requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id,
              c.created_at,
              (SELECT COUNT(*) FROM conversations c2
                WHERE c2.created_at <= c.created_at) AS visitor_number,
              c.last_message_at,
              c.visitor_ip,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
                 AND m.role = 'visitor'
                 AND m.id > COALESCE((SELECT MAX(a.id) FROM messages a
                                       WHERE a.conversation_id = c.id AND a.role = 'admin'), 0)
              ) AS unread,
              (SELECT m.body FROM messages m WHERE m.conversation_id = c.id
                 ORDER BY m.id DESC LIMIT 1) AS last_body,
              (SELECT m.role FROM messages m WHERE m.conversation_id = c.id
                 ORDER BY m.id DESC LIMIT 1) AS last_role,
              (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id
                 ORDER BY m.id DESC LIMIT 1) AS last_created_at
         FROM conversations c
        WHERE EXISTS (SELECT 1 FROM messages m0 WHERE m0.conversation_id = c.id)
        ORDER BY c.last_message_at DESC
        LIMIT 200`,
    );

    const conversations = rows.map((row) => ({
      id: row.id,
      number: Number(row.visitor_number),
      createdAt: new Date(row.created_at).toISOString(),
      lastMessageAt: new Date(row.last_message_at).toISOString(),
      visitorIp: row.visitor_ip,
      messageCount: Number(row.message_count),
      unread: Number(row.unread),
      lastMessage: row.last_body
        ? {
            role: row.last_role,
            body: row.last_body,
            createdAt: new Date(row.last_created_at).toISOString(),
          }
        : null,
    }));

    return res.json({ ok: true, conversations });
  } catch (dbError) {
    console.error('[chat] failed to list conversations:', dbError);
    return res.status(500).json({ ok: false, error: 'Could not list conversations' });
  }
});

app.get('/api/admin/conversations/:id/messages', requireAdmin, async (req, res) => {
  const afterId = readAfterId(req.query);

  try {
    const [rows] = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT 500',
      [req.params.id, afterId],
    );
    const messages = rows.map(toMessage);
    return res.json({
      ok: true,
      messages,
      cursor: messages.length ? messages[messages.length - 1].id : afterId,
    });
  } catch (dbError) {
    console.error('[chat] failed to read conversation:', dbError);
    return res.status(500).json({ ok: false, error: 'Could not read conversation' });
  }
});

app.post('/api/admin/conversations/:id/reply', requireAdmin, async (req, res) => {
  const { message, error } = readMessage(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  try {
    const [rows] = await pool.query('SELECT id FROM conversations WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Unknown conversation' });

    const stored = await insertMessage(req.params.id, 'admin', message);

    sendInBackground(
      pushTexts().then((texts) =>
        notifyVisitor(pool, { conversationId: req.params.id, message, texts }),
      ),
      'visitor notification',
    );

    return res.status(201).json({ ok: true, message: stored });
  } catch (dbError) {
    console.error('[chat] failed to store reply:', dbError);
    return res.status(500).json({ ok: false, error: 'Could not store reply' });
  }
});

app.get('/api/admin/content', requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT `key`, value, updated_at FROM site_content');
    const stored = new Map(rows.map((row) => [row.key, row]));

    const fields = CONTENT_FIELDS.map((field) => {
      const row = stored.get(field.key);
      return {
        key: field.key,
        group: field.group,
        label: field.label,
        multiline: Boolean(field.multiline),
        json: Boolean(field.json),
        value: row ? row.value : storedValue(field),
        updatedAt: row ? new Date(row.updated_at).toISOString() : null,
      };
    });

    return res.json({ ok: true, fields });
  } catch (dbError) {
    console.error('[chat] failed to read the content fields:', dbError);
    return res.status(500).json({ ok: false, error: 'Could not read the content' });
  }
});

app.put('/api/admin/content', requireAdmin, async (req, res) => {
  const values = req.body?.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return res.status(400).json({ ok: false, error: 'Missing values' });
  }

  const known = new Map(CONTENT_FIELDS.map((field) => [field.key, field]));
  const updates = [];

  for (const [key, raw] of Object.entries(values)) {
    const field = known.get(key);
    if (!field || typeof raw !== 'string') continue;

    if (raw.length > 20000) {
      return res.status(413).json({ ok: false, error: `Value too long: ${key}` });
    }

    if (field.json) {
      try {
        JSON.parse(raw);
      } catch {
        return res.status(400).json({ ok: false, error: `Invalid JSON in field: ${key}` });
      }
    }

    updates.push([key, raw]);
  }

  if (!updates.length) {
    return res.status(400).json({ ok: false, error: 'No valid fields' });
  }

  try {
    for (const [key, value] of updates) {
      await pool.query(
        'INSERT INTO site_content (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
        [key, value, value],
      );
    }

    return res.json({ ok: true, saved: updates.length });
  } catch (dbError) {
    console.error('[chat] failed to save the content:', dbError);
    return res.status(500).json({ ok: false, error: 'Could not save the content' });
  }
});

app.get('/api/admin/push/subscriptions', requireAdmin, async (_req, res) => {
  try {
    const [admins, visitors] = await Promise.all([
      listSubscriptions(pool, 'admin'),
      listSubscriptions(pool, 'visitor'),
    ]);
    return res.json({
      ok: true,
      enabled: pushConfigured(),
      subscriptions: admins,
      visitorCount: visitors.length,
    });
  } catch (dbError) {
    console.error('[push] failed to list the subscriptions:', dbError);
    return res.status(500).json({ ok: false, error: 'Could not list subscriptions' });
  }
});

app.post('/api/admin/push/test', requireAdmin, async (_req, res) => {
  if (!pushConfigured())
    return res.status(503).json({ ok: false, error: 'Push is not configured' });

  try {
    const result = await notifyAdminsTest(pool, { texts: await pushTexts() });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[push] test notification failed:', error);
    return res.status(500).json({ ok: false, error: 'Could not send the test notification' });
  }
});

const PORT = process.env.PORT || 3000;

await initDatabase();

const server = app.listen(PORT, () => {
  console.log(`Chat backend (MySQL) listening on port ${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}

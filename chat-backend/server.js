// chat-backend/server.js
//
// Custom (non-Crisp) portfolio chat -> n8n webhook proxy.
//
// The portfolio is a static export, so the browser cannot call the n8n webhook
// directly without shipping the credential to every visitor. This small
// service keeps the credential server-side and forwards the chat messages.
//
// API:
//   GET  /health  -> { ok: true }
//   POST /api/chat
//     body:    { sessionId?: string, message: string }
//     returns: { ok: true, reply: string | null } or { ok: false, error: string }
//
// Required environment variables (set in the repo root .env):
//   N8N_WEBHOOK_URL    full production URL of the n8n webhook
//   N8N_WEBHOOK_TOKEN  credential sent as `Authorization: Bearer <token>`
//
// Optional:
//   PORT               port to listen on (default 3000)

import express from 'express';

const app = express();
app.use(express.json({ limit: '32kb' }));

const MAX_MESSAGE_LENGTH = 2000;
const UPSTREAM_TIMEOUT_MS = 60_000;

// Text fields an n8n "Respond to Webhook" node commonly returns.
const REPLY_KEYS = ['reply', 'output', 'text', 'answer', 'message', 'content'];

// Pulls a plain-text answer out of whatever shape the n8n workflow returns.
function extractReply(payload) {
  if (typeof payload === 'string') return payload.trim() || null;
  if (Array.isArray(payload)) return extractReply(payload[0]);

  if (payload && typeof payload === 'object') {
    for (const key of REPLY_KEYS) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }

  return null;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/chat', async (req, res) => {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookToken = process.env.N8N_WEBHOOK_TOKEN;

  if (!webhookUrl || !webhookToken) {
    console.error(
      '[chat] N8N_WEBHOOK_URL or N8N_WEBHOOK_TOKEN is not configured',
    );
    return res
      .status(503)
      .json({ ok: false, error: 'Chat backend is not configured' });
  }

  const message =
    typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (!message) {
    return res.status(400).json({ ok: false, error: 'Missing message' });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(413).json({ ok: false, error: 'Message too long' });
  }

  const sessionId =
    typeof req.body?.sessionId === 'string' && req.body.sessionId
      ? req.body.sessionId
      : null;

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${webhookToken}`,
      },
      body: JSON.stringify({
        sessionId,
        message,
        source: 'portfolio-chat',
        sentAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const raw = await upstream.text();

    if (!upstream.ok) {
      console.error(`[chat] n8n responded with status ${upstream.status}`);
      return res.status(502).json({ ok: false, error: 'Upstream error' });
    }

    let reply = null;
    try {
      reply = extractReply(raw ? JSON.parse(raw) : null);
    } catch {
      // The workflow answered with a plain-text body.
      reply = extractReply(raw);
    }

    return res.json({ ok: true, reply });
  } catch (error) {
    console.error('[chat] n8n request failed:', error);
    return res
      .status(502)
      .json({ ok: false, error: 'Upstream request failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Custom chat -> n8n webhook proxy running on port ${PORT}`);
});

# chat-backend

[Magyar verzió](./README.hu.md) · **English**

Chat API for the CV site: the visitor widget on one side, the admin inbox on
the other, MySQL in between. No external service and no AI.

```
browser (widget)  --POST /api/chat-------------->  chat-backend  -->  MySQL
browser (widget)  --GET  /api/chat/messages----->  chat-backend  <--  MySQL
browser (/admin)  --GET  /api/admin/...-------->  chat-backend  <--  MySQL
```

The widget keeps its `sessionId` in `localStorage`, so a visitor sees their
conversation (including the replies) after a reload. It polls every 3 seconds
while the chat panel is open.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health`, `/api/health` | Status check, also verifies the database (`{ ok: true, database: true }`). |
| `POST` | `/api/chat` | Visitor message: `{ sessionId?, message }` → `{ ok, sessionId, message }`. Without `sessionId` a new one is generated. |
| `GET` | `/api/chat/messages?sessionId=&afterId=` | Messages after the given id: `{ ok, messages, cursor }`. |
| `GET` | `/api/admin/conversations` | Inbox list with unread counts and the last message. |
| `GET` | `/api/admin/conversations/:id/messages?afterId=` | Full thread of one conversation. |
| `POST` | `/api/admin/conversations/:id/reply` | `{ message }` → stored as an `admin` message. |
| `GET` | `/api/push/public-key` | `{ ok, enabled, key }` — the VAPID public key for the browser subscription. |
| `POST` | `/api/push/subscriptions` | `{ audience, sessionId?, subscription, userAgent? }` → `201`. `visitor` needs a `sessionId`, `admin` the admin token. |
| `DELETE` | `/api/push/subscriptions` | `{ audience, sessionId?, endpoint }` → `{ ok, removed }`. |
| `GET` | `/api/admin/push/subscriptions` | Admin subscriptions (endpoints truncated), plus the visitor count. |
| `POST` | `/api/admin/push/test` | `{ ok, sent, failed }` — test notification to the admin's browsers. |

Every `/api/admin/*` request needs `Authorization: Bearer <ADMIN_TOKEN>` (the
`/admin` page asks for the token once and stores it in `localStorage`).

The inbox lists **one row per visitor** (per session), numbered `#1`, `#2`, … in
the order of their first message, with the visitor IP, the last message, the
message count and an unread badge. Opening a row shows only that visitor's
thread, and a reply is delivered only to their widget.

## Site copy

Every visible text of the site is stored in `site_content` and served by:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/content` | `{ ok, content: { key: value } }` — public, read by the site. |
| `GET` | `/api/admin/content` | The catalogue with labels/groups and the stored values. |
| `PUT` | `/api/admin/content` | `{ values: { key: value } }` → upsert. JSON fields are validated. |

The keys and the default copy live in [`content.js`](./content.js) and are seeded
into `site_content` on startup (`INSERT IGNORE`, so admin edits are never
overwritten; rows removed from the catalogue are pruned). `**text**` in a value
renders as bold, `json: true` fields hold lists (e.g. the experience cards).

## Environment variables

| Name | Description |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL connection. |
| `ADMIN_TOKEN` | Guards `/api/admin/*`. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push key pair (optional: without it the notifications are off). |
| `PORT` | Listen port (default `3000`). |

## Push notifications

Web Push, so a notification arrives with the site closed. Subscriptions are kept
in `push_subscriptions` (endpoint, `p256dh`, `auth`, audience, conversation,
user-agent, delivery timestamps) and are sent with `web-push`:

* a **visitor** message notifies every `admin` subscription;
* an **admin** reply notifies the `visitor` subscriptions of that conversation.

The payload is `{ title, body, url, tag }`; the title comes from the site copy
(`notify.*` keys, editable on the admin page), the body is the truncated message.
Sending is fire-and-forget: a push problem never fails the API call. A `404`/`410`
from the push service means the browser dropped the subscription, so the row is
deleted; other errors only set `last_error_at`.

Without `VAPID_*` in the environment the feature stays off and the subscription
endpoints answer `503`.

## Database

`conversations` (id, timestamps, visitor ip/user-agent), `messages`
(id, conversation_id, `role` = `visitor`/`admin`, body, created_at),
`site_content` (key, value, updated_at) and `push_subscriptions` (endpoint,
keys, audience, conversation, user-agent, delivery timestamps). The tables are
created automatically on startup; all timestamps are handled in UTC.

## Local development

```bash
npm install
DB_HOST=127.0.0.1 DB_NAME=cv_chat DB_USER=chat DB_PASSWORD=... ADMIN_TOKEN=dev npm start
```

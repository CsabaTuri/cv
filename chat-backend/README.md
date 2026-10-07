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
| `PORT` | Listen port (default `3000`). |

## Database

`conversations` (id, timestamps, visitor ip/user-agent), `messages`
(id, conversation_id, `role` = `visitor`/`admin`, body, created_at) and
`site_content` (key, value, updated_at). The tables are created automatically on
startup; all timestamps are handled in UTC.

## Local development

```bash
npm install
DB_HOST=127.0.0.1 DB_NAME=cv_chat DB_USER=chat DB_PASSWORD=... ADMIN_TOKEN=dev npm start
```

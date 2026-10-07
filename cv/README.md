# CV — Túri Csaba

[Magyar verzió](./README.hu.md) · **English**

Modern, static (SSG) CV website built with Next.js (App Router),
TypeScript, Tailwind CSS and Framer Motion. The site itself is Hungarian.

The site is an installable PWA (manifest, icons, service worker with an offline
shell) and it can send/receive Web Push notifications - see
[../README.md](../README.md#installable-app-and-notifications).

Nothing is hardcoded in the components: **every text of the site comes from the
database** (`GET /api/content`, editable on the `/admin` page under *Szövegek*).
Until a value exists, a `…` placeholder is shown.

Instead of a third-party chat, the site ships its own widget that talks to the
`chat-backend` service (MySQL), plus an `/admin` page where the messages can be
answered.

## Pages

| Route | Description |
| --- | --- |
| `/` | The CV site with the chat widget (bottom right). |
| `/admin/` | Admin panel with three tabs: *Üzenetek* (conversation list, thread, reply box), *Szövegek* (the site copy editor) and *Build* (one-click rebuild — see [../README.md](../README.md#one-click-rebuild-admin-panel)). Asks for the `ADMIN_TOKEN` from `.env` (kept in `localStorage`). Not indexable. |

## Stack

This service is part of the repository-level stack — see
[../README.md](../README.md) for the services, hardening and operating
instructions (ports, backup, phpMyAdmin access).

## Local development

```bash
npm install
npm run dev
```

`npm run dev` has no `/api` proxy, so the widget cannot reach the backend.
Run the whole stack instead:

```bash
docker compose up -d --build
```

The site is served at http://localhost:3036, the admin inbox at
http://localhost:3036/admin/ and phpMyAdmin (the chat database) at
http://localhost:8081 — login with `MYSQL_USER` / `MYSQL_PASSWORD` from `.env`.

## Production build (static export)

```bash
npm run build   # outputs ./out
```

## Project structure

```
cv/
├── public/              # CV PDFs, robots.txt, sitemap.xml
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx   # root layout (metadata, fonts, analytics)
│   │   ├── page.tsx     # CV + chat widget
│   │   ├── global-not-found.tsx
│   │   └── admin/page.tsx
│   ├── components/      # UI components (incl. CustomChat, AdminChat)
│   └── data/            # language-neutral constants
├── next.config.mjs
├── tsconfig.json
├── postcss.config.mjs
├── nginx.conf           # static hosting + /api proxy to chat-backend
└── Dockerfile
```

## Environment variables (build time)

| Name | Description |
| --- | --- |
| `NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN` | Cloudflare Web Analytics token (optional). |

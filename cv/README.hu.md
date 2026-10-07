# Önéletrajz — Túri Csaba

[English version](./README.md) · **Magyar**

Modern, statikus (SSG) önéletrajz oldal Next.js-szel (App Router), TypeScript,
Tailwind CSS és Framer Motion felhasználásával. Az oldal magyar nyelvű.

A komponensekben **nincs beégetett szöveg**: az oldal minden szövege az
adatbázisból jön (`GET /api/content`, az `/admin` oldal *Szövegek* fülével
szerkeszthető). Amíg egy érték nem létezik, `…` helykitöltő látszik.

Harmadik féltől származó chat helyett saját widget van, ami a `chat-backend`
szolgáltatással (MySQL) beszél; a beérkező üzeneteket az `/admin` oldalon lehet
megválaszolni.

## Oldalak

| Útvonal | Leírás |
| --- | --- |
| `/` | Az önéletrajz oldal a chat widgettel (jobb alsó sarok). |
| `/admin/` | Admin panel két füllel: *Üzenetek* (beszélgetéslista, szál, válaszmező) és *Szövegek* (az oldal szövegeinek szerkesztője). A `.env`-beli `ADMIN_TOKEN`-t kéri (a `localStorage`-ban marad). Nem indexelhető. |

## Stack

Ez a szolgáltatás a repó szintű stack része — a szolgáltatásokhoz, hardeninghez
és üzemeltetéshez (portok, mentés, phpMyAdmin elérés) lásd a
[../README.hu.md](../README.hu.md) fájlt.

## Helyi fejlesztés

```bash
npm install
npm run dev
```

A `npm run dev` alatt nincs `/api` proxy, így a widget nem éri el a backendet.
Indítsd inkább a teljes stacket:

```bash
docker compose up -d --build
```

Az oldal a http://localhost:3036 címen érhető el, az admin inbox a
http://localhost:3036/admin/, a phpMyAdmin (a chat adatbázisa) pedig a
http://localhost:8081 címen — belépés a `.env`-beli `MYSQL_USER` /
`MYSQL_PASSWORD` párossal.

## Éles build (statikus export)

```bash
npm run build   # az eredmény a ./out könyvtárban
```

## Projekt szerkezet

```
cv/
├── public/              # CV PDF-ek, robots.txt, sitemap.xml
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx   # root layout (metadata, fontok, analytics)
│   │   ├── page.tsx     # önéletrajz + chat widget
│   │   ├── global-not-found.tsx
│   │   └── admin/page.tsx
│   ├── components/      # UI komponensek (köztük CustomChat, AdminChat)
│   └── data/            # nyelvfüggetlen konstansok
├── next.config.mjs
├── tsconfig.json
├── postcss.config.mjs
├── nginx.conf           # statikus kiszolgálás + /api proxy a chat-backend felé
└── Dockerfile
```

## Környezeti változók (build időben)

| Név | Leírás |
| --- | --- |
| `NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN` | Cloudflare Web Analytics token (opcionális). |

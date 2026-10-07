# Portfolio — Túri Csaba

Highly modern, static (SSG) portfolio website built with Next.js (App Router),
TypeScript, Tailwind CSS, Framer Motion and next-intl (EN + HU).

## Local development

```bash
npm install
npm run dev
```

## Production build (static export)

```bash
npm run build   # outputs ./out
```

## Run in Docker

```bash
docker compose up -d --build portfolio
```

The site is served at http://localhost:3036 (redirects `/` → `/en/`).

## Project structure

```
portfolio/
├── messages/            # en.json, hu.json — translations
├── public/
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   └── [locale]/    # locale-prefixed routes (SSG)
│   ├── components/      # UI components
│   ├── data/            # language-neutral constants
│   └── i18n/            # next-intl routing + request config
├── next.config.mjs
├── tsconfig.json
├── postcss.config.mjs
├── Dockerfile
└── nginx.conf
```

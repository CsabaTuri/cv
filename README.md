# CV + custom chat stack

[Magyar verzió](./README.hu.md) · **English**

A static CV site (Next.js SSG, served by nginx) with its own chat: a
visitor widget, an admin inbox and a small CMS for the site copy — no
third-party chat provider, no AI.

```
browser ──▶ cv (nginx-unprivileged, uid 101)
              ├── /                  static site
              ├── /admin/            inbox + site copy editor
              └── /api/*  ──▶ chat-backend (Node) ──▶ mysql (internal network)
                                                    └── phpmyadmin (loopback only)
```

## Services

| Service | Image | Published | Networks | Notes |
| --- | --- | --- | --- | --- |
| `cv` | `cv-web:latest` (nginx-unprivileged, uid 101) | `3036:8080` on `SITE_BIND` (default `0.0.0.0`) | `app` | Static site + `/api` reverse proxy. Read-only rootfs, all capabilities dropped. |
| `chat-backend` | `cv-chat-backend:latest` (Node 20, user `nodejs`) | `3112:3000` | `app`, `data` | Chat + admin API. Read-only rootfs, all capabilities dropped. |
| `mysql` | `mysql:8.4` | none | `data` (internal) | Messages, conversations, site copy. |
| `phpmyadmin` | `phpmyadmin:5-apache` | `8081:80` | `data`, `pma` | Database UI for the operator. |

`data` is `internal: true`: MySQL has no internet egress and cannot be reached
from the host or the LAN. `pma` carries nothing but phpMyAdmin's published port
(Docker cannot publish a port of a container attached only to internal
networks). The `app` subnet (`172.31.255.0/24`) is kept fixed on purpose — the
host routes it.

## Compose files

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | Base definition and hardening: used by both dev and prod. |
| `docker-compose.override.yml` | Development conveniences; **applied automatically** by `docker compose up -d`. |
| `docker-compose.prod.yml` | Production enforcement; applied explicitly with `-f`. Never combine with the dev overlay. |

```bash
# development (base + override)
docker compose up -d --build

# production (base + prod, no dev overlay)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The production overlay pins the admin API and phpMyAdmin to the host loopback
interface (a loosened `API_BIND`/`PHPMYADMIN_BIND` in `.env` cannot expose
them), tightens the log rotation and sets shutdown grace periods plus open-file
limits.

## Quick start

```bash
cp .env.example .env            # then fill in the required secrets
$EDITOR .env
chmod 600 .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose ps
curl -I http://127.0.0.1:3036/healthz
```

| URL | What |
| --- | --- |
| http://localhost:3036/ | the site |
| http://localhost:3036/admin/ | admin panel (*Üzenetek* / *Szövegek*) — asks for `ADMIN_TOKEN` |
| http://localhost:8081/ | phpMyAdmin (loopback only in production) |

For a LAN or remote phpMyAdmin, prefer a tunnel over publishing the port:

```bash
ssh -L 8081:127.0.0.1:8081 user@host    # then open http://localhost:8081
```

## Environment (`.env`)

See [`.env.example`](./.env.example) for the documented template.

| Name | Purpose |
| --- | --- |
| `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | Database and application credentials (required). |
| `ADMIN_TOKEN` | Guards the admin API and logs into `/admin` (required). |
| `TZ` | Time zone for MySQL/phpMyAdmin. |
| `SITE_BIND`, `API_BIND`, `PHPMYADMIN_BIND` | Host interfaces the ports are bound to. |
| `NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN` | Optional analytics token, baked in at build time. |

Compose fails fast when a required value is missing (`${VAR:?}`), so the stack
can never start with an empty password — see the error when running
`docker compose config` with an empty `ADMIN_TOKEN`.

## Security measures

* No default credentials anywhere; missing values abort the deploy.
* Database on an `internal` network, no published port, `--local-infile=OFF`.
* `no-new-privileges` everywhere; `cap_drop: [ALL]` for nginx and the Node
  backend; only the clearly unnecessary capabilities dropped for MySQL and
  phpMyAdmin (both must drop privileges / bind port 80 at startup).
* Read-only root filesystems with small `tmpfs` mounts (nginx, Node backend).
* Non-root runtime users (uid 101 / `nodejs`), `init: true` for signal handling.
* Admin API and database UI bound to the host loopback interface in production;
  only the site is public.
* nginx: server tokens off, security headers, API rate limiting (20 r/s per IP,
  burst 40 → 429), 16 kB API body limit, method allow-list (405), `X-Powered-By`
  hidden, request timeouts capped.
* CPU, memory and pid limits plus log rotation (10m × 3, compressed in prod).
* MySQL shuts down with a 60 s grace period (30 s in dev) so InnoDB can flush.

## Operations

```bash
docker compose ps                                  # status + health
docker compose logs -f chat-backend                # follow logs
docker compose up -d --build                       # dev: apply changes
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose pull && docker compose up -d        # update images
```

Backup / restore:

```bash
# backup
docker compose exec -T mysql sh -c \
  'exec mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip > "chat-$(date +%F).sql.gz"

# restore
gunzip -c chat-2026-10-07.sql.gz | docker compose exec -T mysql sh -c \
  'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
```

The chat data lives in the named volume `cv_mysql-data`; keep it when changing
compose files.

## Documentation

* [cv/README.md](./cv/README.md) — static CV site, pages, build.
* [chat-backend/README.md](./chat-backend/README.md) — API endpoints, schema.

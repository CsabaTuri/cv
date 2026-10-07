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
| `cv` | `cv-web:${IMAGE_TAG_CV}` (nginx-unprivileged, uid 101) | `3036:8080` on `SITE_BIND` (default `0.0.0.0`) | `app` | Static site + `/api` reverse proxy. Read-only rootfs, all capabilities dropped. |
| `chat-backend` | `cv-chat-backend:${IMAGE_TAG_CHAT_BACKEND}` (Node 20, user `nodejs`) | `3112:3000` | `app`, `data` | Chat + admin API. Read-only rootfs, all capabilities dropped. |
| `mysql` | `mysql:8.4` | none | `data` (internal) | Messages, conversations, site copy. Read-only rootfs, capabilities denied by default. |
| `phpmyadmin` | `phpmyadmin:5-apache` | `8081:80` | `data`, `pma` | Database UI for the operator. |
| `deployer` | `cv-deployer:${IMAGE_TAG_DEPLOYER}` (Node 20 + Docker CLI) | none | `app` | Opt-in rebuild helper (compose profile `deploy`). Holds the Docker socket; see [One-click rebuild](#one-click-rebuild-admin-panel). |

`data` is `internal: true`: MySQL has no internet egress and cannot be reached
from the host or the LAN. `pma` carries nothing but phpMyAdmin's published port
(Docker cannot publish a port of a container attached only to internal
networks). The `app` subnet (`172.33.255.0/24`) is kept fixed on purpose — the
host routes it.

The `deployer` helper only starts with the `deploy` profile and publishes
nothing: it is the single service with access to the Docker socket.

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

# production + the optional rebuild helper behind the admin panel's button
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile deploy up -d
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
| http://localhost:3036/admin/ | admin panel (*Üzenetek* / *Szövegek* / *Build*) — asks for `ADMIN_TOKEN` |
| http://localhost:8081/ | phpMyAdmin (loopback only in production) |

For a LAN or remote phpMyAdmin, prefer a tunnel over publishing the port:

```bash
ssh -L 8081:127.0.0.1:8081 user@host    # then open http://localhost:8081
```

## One-click rebuild (admin panel)

The *Build* tab rebuilds and restarts the two images built from this repository
(`cv`, `chat-backend`) with one button — handy when you edit the code from a
phone or another machine. Content changes do **not** need it: the site copy
lives in the database and is edited in the *Szövegek* tab without a rebuild.

The helper is opt-in, because it is the one container with access to the Docker
socket (root-equivalent on the host):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile deploy up -d
```

| | |
| --- | --- |
| Service | `deployer`, container `cv_deployer`, no published port |
| Command it runs | `docker compose up -d --build cv chat-backend` (hardcoded, never a shell) |
| Auth | `Authorization: Bearer $ADMIN_TOKEN` on every endpoint except `/health` |
| Switches | starts only with the `deploy` profile, acts only when `DEPLOY_ENABLED=true` |
| Concurrency | one build at a time (a second request gets `409`) |
| Output | the last 500 log lines in the *Build* tab, kept in the `deploy-state` volume |
| Timeout | `DEPLOY_TIMEOUT_MS`, 15 minutes by default |

The helper deliberately survives the rebuild it triggers, so the panel can still
stream the log and show the result; if it is not running, the panel says so and
prints the command above.

Two things to keep in mind:

* the triggered run does **not** read the repository `.env`. The helper gets
  every interpolated value through its own environment, so when you add a new
  variable to `.env` that the compose files use, add it to the `deployer`
  service as well.
* `DEPLOY_COMPOSE_FILES` decides which compose files the triggered rebuild uses
  (default `docker-compose.yml:docker-compose.prod.yml`; the dev overlay sets
  `docker-compose.yml:docker-compose.override.yml`).

## Environment (`.env`)

See [`.env.example`](./.env.example) for the documented template.

| Name | Purpose |
| --- | --- |
| `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | Database and application credentials (required). |
| `ADMIN_TOKEN` | Guards the admin API and logs into `/admin` (required). |
| `TZ` | Time zone for MySQL/phpMyAdmin and the backend. |
| `IMAGE_TAG_CV`, `IMAGE_TAG_CHAT_BACKEND`, `IMAGE_TAG_DEPLOYER` | **Required**: one concrete version per image, never `latest`; see *Rollback* below. |
| `SITE_BIND`, `API_BIND`, `PHPMYADMIN_BIND` | Host interfaces the ports are bound to. |
| `NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN` | Optional analytics token, baked in at build time. |
| `DEPLOY_ENABLED` | Allows the rebuild helper to act (`false` by default). |
| `DEPLOY_COMPOSE_FILES` | Compose files the triggered rebuild uses (colon separated). |
| `DEPLOY_SERVICES` | Services the button rebuilds (default `cv chat-backend`). |
| `DEPLOY_SOURCE_DIR` | Source tree the helper mounts (default: the stack directory). |

Compose fails fast when a required value is missing (`${VAR:?}`), so the stack
can neither start with an empty password nor without a version — see the error
when running `docker compose config` with an empty `ADMIN_TOKEN`, or with any of
the image tags left out.

## Security measures

* No default credentials anywhere; missing values abort the deploy.
* Database on an `internal` network, no published port, `--local-infile=OFF`,
  `--skip-name-resolve` and a slow query log (`--long-query-time=2`) kept at
  `/var/lib/mysql/slow.log`.
* Capability and AppArmor note: capabilities are denied by default rather than
  "all but a few", and no `apparmor=` profile is pinned — Docker applies its
  default profile where the host supports AppArmor, while an explicit pin would
  refuse to start on a host without it.
* `no-new-privileges` everywhere, and **every** service runs with
  `cap_drop: [ALL]` plus an explicit `cap_add` list of the few capabilities its
  entrypoint really needs (MySQL/phpMyAdmin drop privileges at startup; nginx
  needs to bind port 80).
* Read-only root filesystems with small `tmpfs` mounts everywhere they are
  possible: nginx, the Node backend, the deployer helper and MySQL (data on the
  volume, socket and temp files on tmpfs). phpMyAdmin is the documented
  exception: its entrypoint writes the session blowfish secret into
  `/etc/phpmyadmin` on every start.
* File descriptor limits per service; `stop_grace_period` for every long-running
  service (nginx drains on SIGQUIT, the API finishes in-flight requests and
  closes the pool), and `start_interval` so a cold start converges in seconds
  instead of waiting a full health interval.
* Non-root runtime users (uid 101 / `nodejs`), `init: true` for signal handling.
* Admin API and database UI bound to the host loopback interface in production;
  only the site is public.
* The rebuild helper is the only container with the Docker socket: opt-in
  profile, `DEPLOY_ENABLED` switch, one hardcoded command, `ADMIN_TOKEN` on
  every call, read-only source mount, no published port, all capabilities
  dropped and no way to read the repository `.env`.
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

Backup / restore (the password goes through `MYSQL_PWD`, so it never shows up
in the container's process list):

```bash
# backup (consistent snapshot, no table locks)
docker compose exec -T -e MYSQL_PWD="$MYSQL_PASSWORD" mysql sh -c \
  'exec mysqldump -u"$MYSQL_USER" --single-transaction --routines --events "$MYSQL_DATABASE"' \
  | gzip > "chat-$(date +%F).sql.gz"

# restore
gunzip -c chat-2026-10-07.sql.gz | docker compose exec -T -e MYSQL_PWD="$MYSQL_PASSWORD" mysql sh -c \
  'exec mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"'
```

The chat data lives in the named volume `cv_mysql-data`; keep it when changing
compose files.

Slow queries:

```bash
docker compose exec mysql cat /var/lib/mysql/slow.log
```

Rollback:

```bash
# release: bump the version of the image(s) you changed in .env, then rebuild
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile deploy up -d --build

# rollback: put the previous version back in .env, then start (no rebuild)
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile deploy up -d
```

Each image has its own version, which is why the site and the API can be
released independently. Both commands include `--profile deploy` on purpose: the
rebuild helper passes the tags on to the build it triggers, and it only picks up
new values when the helper itself is recreated. The second command only works
while the previous image is still on the host — do not prune it away. Rollback
of the *database* is a restore from a dump: the schema is created with
`CREATE TABLE IF NOT EXISTS`, so an older image against a newer schema needs a
restore as well.

## Documentation

* [cv/README.md](./cv/README.md) — static CV site, pages, build (English).
* [cv/README.hu.md](./cv/README.hu.md) — ugyanaz magyarul.
* [chat-backend/README.md](./chat-backend/README.md) — API endpoints, schema (English).
* [chat-backend/README.hu.md](./chat-backend/README.hu.md) — ugyanaz magyarul.

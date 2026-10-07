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
| `deployer` | `cv-deployer:${IMAGE_TAG_DEPLOYER}` (Node 20 + Docker CLI) | none | `app` | Rebuild helper for the admin panel, off unless `DEPLOY_ENABLED=true`. Holds the Docker socket; see [One-click rebuild](#one-click-rebuild-admin-panel). |

`data` is `internal: true`: MySQL has no internet egress and cannot be reached
from the host or the LAN. `pma` carries nothing but phpMyAdmin's published port
(Docker cannot publish a port of a container attached only to internal
networks). The `app` subnet (`172.33.255.0/24`) is kept fixed on purpose — the
host routes it.

The `deployer` helper publishes nothing: it is the single service with access to
the Docker socket, and it does nothing at all unless `DEPLOY_ENABLED=true`.

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

# production: every service, including the rebuild helper behind the button
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
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

The helper is part of the stack (it starts with everything else) and is switched
off by `DEPLOY_ENABLED=false`, because it is the one container with access to the
Docker socket (root-equivalent on the host). It is deliberately **not** behind a
compose profile: a profiled service is skipped by the other invocations, and the
leftover container then blocks the removal of the networks the rest of the stack
shares - which takes the site down.

| | |
| --- | --- |
| Service | `deployer`, container `cv_deployer`, no published port |
| Command it runs | `docker compose up -d --build cv chat-backend` (hardcoded, never a shell) |
| Auth | `Authorization: Bearer $ADMIN_TOKEN` on every endpoint except `/health` |
| Switch | acts only when `DEPLOY_ENABLED=true` (`false` serves status but refuses to build) |
| Concurrency | one build at a time (a second request gets `409`) |
| Output | the last 500 log lines in the *Build* tab, kept in the `deploy-state` volume |
| Timeout | `DEPLOY_TIMEOUT_MS`, 15 minutes by default |

The helper deliberately survives the rebuild it triggers, so the panel can still
stream the log and show the result; if the container is stopped, the panel says so
and prints the command that starts it.

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
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push key pair and contact. Empty keys simply disable the notifications. |
| `DEPLOY_ENABLED` | Allows the rebuild helper to act (`false` by default). |
| `DEPLOY_COMPOSE_FILES` | Compose files the triggered rebuild uses (colon separated). |
| `DEPLOY_SERVICES` | Services the button rebuilds (default `cv chat-backend`). |
| `DEPLOY_SOURCE_DIR` | Source tree the helper mounts (default: the stack directory). |

Compose fails fast when a required value is missing (`${VAR:?}`), so the stack
can neither start with an empty password nor without a version — see the error
when running `docker compose config` with an empty `ADMIN_TOKEN`, or with any of
the image tags left out.

## Installable app and notifications

The site is a PWA: it can be installed from the browser (manifest, icons,
service worker) and it opens offline, because the service worker caches the
exported shell and the hashed assets. `/api/*` is never cached, so the chat and
the admin panel always talk to the live backend.

Notifications are **Web Push**, so they arrive with the site (and the browser)
closed:

| Audience | Gets a notification when | Switch |
| --- | --- | --- |
| Visitor | an admin answers in their chat | the bell in the chat window |
| Admin | a visitor writes | the *Értesítések* button in the admin panel |

Both switches need a user click (browsers do not allow asking for the
notification permission any other way), and both are per browser.

The delivery is done by the `chat-backend` service with the VAPID key pair from
`.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Rotating the
pair invalidates every existing subscription, so each browser has to switch the
notifications on again. The texts of the notifications are editable on the admin
page under *Szövegek* → *Értesítések*.

Two things the browser decides, not us:

* Web Push and the service worker only work in a **secure context**: HTTPS, or
  `localhost`. Over `http://<LAN-IP>:3036` the site works, but notifications and
  offline mode stay unavailable (the panel says so instead of failing silently).
* On **iOS** the notifications require the site to be installed first
  (Share → *Add to Home Screen*), from iOS 16.4 on.

Endpoints (see [chat-backend/README.md](./chat-backend/README.md)):

```bash
GET    /api/push/public-key      # the VAPID public key + whether push is on
POST   /api/push/subscriptions   # { audience, sessionId?, subscription }
DELETE /api/push/subscriptions   # { audience, sessionId?, endpoint }
GET    /api/admin/push/subscriptions
POST   /api/admin/push/test      # test notification to the admin's browsers
```

## Tooling

The tooling lives in the repository root; the site keeps its own dependencies
under `cv/`.

```bash
npm ci                        # ESLint, Prettier, Playwright
npm ci --prefix cv            # the site
npm ci --prefix chat-backend  # the API

npm run lint                  # ESLint: services, tests, CI scripts, the site
npm run format                # Prettier; format:check is what CI runs
npm test                      # the unit and integration suite
npm run e2e                   # Playwright against the real stack
```

| Command | What it covers |
| --- | --- |
| `npm run lint` | one flat config ([`eslint.config.mjs`](./eslint.config.mjs)): Node globals for `chat-backend/`, `deployer/`, `tests/` and `.github/scripts/`, plus TypeScript, React hooks, `jsx-a11y` and the Next rules for `cv/src` |
| `npm run format` | Prettier over JS/TS/JSX/JSON/CSS. Markdown, the compose files, the workflows and `.env*` are left alone on purpose - they are wrapped by hand and reviewed line by line (see [`.prettierignore`](./.prettierignore)) |
| `npm test` | the 54 unit and integration tests in [`tests/`](./tests) |
| `npm run e2e` | 18 Playwright tests against the real export, the real API and a real database |

The end-to-end run needs the export first; Playwright then starts both servers
itself (the API from `chat-backend/`, and `cv/out` through
[`tests/e2e/server.mjs`](./tests/e2e/server.mjs), which mirrors the proxy and the
404 rules of `cv/nginx.conf`):

```bash
npm --prefix cv run build
npx playwright install --with-deps chromium   # once per machine
DB_PORT=3307 npm run e2e
```

## Tests and CI

Everything lives in [`tests/`](./tests) and needs nothing but Node 20+ and a
MySQL; a separate database (`cv_chat_test`) keeps them away from real data:

```bash
npm ci --prefix chat-backend
DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=cv_chat_test \
DB_USER=chat DB_PASSWORD=chat ADMIN_TOKEN=ci-admin-token \
  node --test tests/*.test.mjs
```

| File | Covers |
| --- | --- |
| `tests/api.test.mjs` | the API against a real MySQL: visitor flow, cursors, admin auth, replies, unread counts, the copy endpoints (validation, JSON fields, size limit), and push (validation, audience isolation, endpoints never leaked, a failing delivery that must not break the chat, and the disabled state) |
| `tests/content.test.mjs` | the copy catalogue: unique keys, JSON serialisation, and that every key the frontend asks for exists - with the matching hook |
| `tests/assets.test.mjs` | the PWA (manifest fields, icons on disk with the declared sizes, the worker's handlers), the nginx rules, and the compose invariants this stack got wrong before: no `latest`, no profile on the rebuild helper, the gateway inside its subnet, the VAPID keys reaching both services, `.env.example` in sync |

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs seven jobs on every
pull request and on pushes to `main`:

| Job | What it does |
| --- | --- |
| `lint` | ESLint and `prettier --check` over the whole repository |
| `site` | typecheck + static export, including the PWA files |
| `api` | the suite above against a `mysql:8.4` service, on Node 20 and 22 (54 tests each) |
| `e2e` | builds the export, installs Chromium and runs the Playwright suite against the same `mysql:8.4` service (18 tests) |
| `summary` | collects the reports of `api` and `e2e`, writes the whole suite into one summary (**72 tests** in a single table) and renders the Allure dashboard, published to GitHub Pages when it is available |
| `docker` | both overlays, the fail-fast guard without a `.env`, `docker compose build`, and `nginx -t` inside the built image |
| `publish` | only on `main`, and only once every job above is green: builds the three images through the compose files and pushes them to `ghcr.io` |

Every job has its own summary, so a single job's numbers are never the whole
story: `summary` is the one to look at first, and it is the reason the unit tests
are not counted twice (the two Node versions run the same 54).

### Images built on GitHub

The `publish` job builds the images anyway, so it keeps them: one immutable tag
per commit, pushed to the GitHub container registry.

```
ghcr.io/csabaturi/cv-web:sha-1a2b3c4
ghcr.io/csabaturi/cv-chat-backend:sha-1a2b3c4
ghcr.io/csabaturi/cv-deployer:sha-1a2b3c4
```

A host can then pull instead of building: set the same tag in its `.env` and

```bash
docker compose pull && docker compose up -d
```

The repository is private, and the packages are too, so *pulling* needs a login
on that host (a personal access token with `read:packages`):

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u CsabaTuri --password-stdin
```

A local build is unaffected: `docker compose build` produces exactly the same
image name (`ghcr.io/csabaturi/cv-web:${IMAGE_TAG_CV}`), it simply never leaves
the machine. The build button in the admin panel keeps working for the same
reason - building never needs the registry.

### Reading the results

The test step asks `node --test` for its JUnit report as well as its log, and
[`.github/scripts/test-summary.mjs`](./.github/scripts/test-summary.mjs) turns
that XML into markdown, which shows up in three places - none of them needs
extra tooling or a third-party action:

* **Run summary** - the report is written to `$GITHUB_STEP_SUMMARY`, so it is at
  the top of the job page: totals, a per-suite table and a collapsible block with
  the message of every failure. The `summary` job puts the same numbers for the
  whole suite (unit + end to end) on the run page as well.
* **Artifact** - `test-results-node-<version>` holds the JUnit XML and the
  markdown itself, kept for 14 days and downloadable from the run page.
* **Pull request comment** - on a pull request the same markdown is posted as a
  comment and updated in place on every push, instead of one comment per run.
  Each job keeps its own comment: both carry a hidden marker, so the unit and
  the end-to-end report never overwrite each other
  ([`.github/scripts/pr-comment.sh`](./.github/scripts/pr-comment.sh)). On a fork
  the token is read-only, so that step is allowed to fail there.

The same report locally, on top of the command above:

```bash
mkdir -p test-results
node --test --test-reporter=junit \
  --test-reporter-destination=test-results/junit.xml tests/*.test.mjs
node .github/scripts/test-summary.mjs test-results/junit.xml --title Local
```

`test-results/` is ignored by git.

### The Allure dashboard

The same results are also rendered by [Allure](https://allurereport.org), which
gives what a table cannot: the suite tree, a timeline, the trend across runs, and
the screenshot or trace of a failure attached to the test that produced it.

* **Artifact** - `allure-report`, kept for 14 days: unzip it and open `index.html`
  (a static page, no server needed).
* **Online** - the `summary` job publishes it to GitHub Pages, and the run page
  then links to it (`https://<owner>.github.io/cv/`). That needs Pages to be
  enabled for the repository (*Settings → Pages → Source: GitHub Actions*), and on
  a private repository only a plan that includes Pages provides it - if it is not
  available the job says so and the artifact is still there.

Locally, one command builds the report for both suites:

```bash
npm run allure:local     # e2e + unit + convert + generate
npm run allure:open      # serve it, then follow the printed URL
```

`npm run e2e` writes the Playwright Allure results itself; the unit suite goes
through `tests/allure-from-junit.mjs`, which turns the JUnit XML the suite already
produces into Allure results - so both land in one dashboard. The order inside
`allure:local` matters: Playwright empties `test-results/` at the start of a run.

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
* The rebuild helper is the only container with the Docker socket:
  `DEPLOY_ENABLED` switch (off means it cannot build anything), one hardcoded
  command, `ADMIN_TOKEN` on every call, read-only source mount, no published
  port, all capabilities dropped and no way to read the repository `.env`.
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
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# rollback: put the previous version back in .env, then start (no rebuild)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Each image has its own version, which is why the site and the API can be
released independently; the helper passes the tags on to the build it triggers,
so it sees new values as soon as it is itself recreated by the same command. The
second command only works while the previous image is still on the host — do not
prune it away. Rollback of the *database* is a restore from a dump: the schema
is created with `CREATE TABLE IF NOT EXISTS`, so an older image against a newer
schema needs a restore as well.

### Updating a host in one command

[`cv-update.sh`](./cv-update.sh) is for the machine that runs the stack: it
follows `main`, points the three `IMAGE_TAG_*` values at that commit, logs in to
the registry, pulls the images, restarts the stack - and then checks what it just
deployed.

```bash
export GHCR_TOKEN=...     # a token with read:packages (skip it if docker is already logged in)
./cv-update.sh            # or ./cv-update.sh --no-pull, for a host that builds its own images
```

It is the reason a stale frontend cannot hide: the script updates the working
tree (`git pull --ff-only`, and it refuses to continue on a dirty checkout), so the
compose files it deploys match the images it pulls. It finishes with a smoke check
of `/`, `/sw.js`, `/manifest.webmanifest` and `/api/health` - a 404 on `/sw.js`
means an old cv image is still serving, which is what leaves the offline shell and
the notifications off. The whole behaviour is covered by
[`tests/update-script.test.mjs`](./tests/update-script.test.mjs), which runs the
script in a sandbox repository with stubbed `docker` and `curl` binaries.

## Documentation

The test suite is described under [Tests and CI](#tests-and-ci).

* [chat-backend/README.md](./chat-backend/README.md) — the API, including the push endpoints.
* [cv/README.md](./cv/README.md) — static CV site, pages, build (English).
* [cv/README.hu.md](./cv/README.hu.md) — ugyanaz magyarul.
* [chat-backend/README.md](./chat-backend/README.md) — API endpoints, schema (English).
* [chat-backend/README.hu.md](./chat-backend/README.hu.md) — ugyanaz magyarul.

# Contributing

[Magyar verzió](./CONTRIBUTING.hu.md) · **English**

Thanks for taking a look. This is a demo project — a CV site with its own chat,
admin panel and CMS — maintained by one person in their spare time, so bug
reports, documentation fixes and small, focused pull requests are all welcome.

Being honest about the scope: reviews may take a few days, and a feature that
does not fit the project's goals (no AI, no third-party chat provider) will be
declined with an explanation rather than merged.

## Ways to help

* **Report a bug** — [open a bug report](https://github.com/CsabaTuri/cv/issues/new?template=bug_report.md).
* **Ask for a feature** — [open a feature request](https://github.com/CsabaTuri/cv/issues/new?template=feature_request.md).
* **Fix something** — a pull request with a test is the fastest path to a merge.
* **Improve the docs** — every document exists in English and Hungarian; a fix in
  either one is welcome, please keep the pair in sync.
* **Report a vulnerability** — **never** in a public issue; see
  [SECURITY.md](./SECURITY.md).

Before opening an issue, please search the existing ones: the answer may be there
already. Please do not paste secrets, tokens or other people's personal data into
an issue or a pull request.

## Getting set up

| | |
| --- | --- |
| Node | 20 or 22 — CI runs both |
| Docker | Engine plus Compose v2; the test database and the stack run in containers |
| Git | any recent version |

```bash
git clone https://github.com/CsabaTuri/cv.git
cd cv

# the three dependency trees: the tooling, the site, the API
npm ci
npm ci --prefix cv
npm ci --prefix chat-backend

# a throwaway MySQL on 127.0.0.1:3306; the tests need nothing else
npm run db:test:start

npm test        # 58 unit and integration tests
npm run e2e     # 18 Playwright tests
```

`npm run e2e` needs the exported site and a browser, once:

```bash
npm --prefix cv run build
npm run e2e:install
```

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs the same commands,
so a green run locally usually means a green run there. Stop the test database
with `npm run db:test:stop` when you are done.

## Running the whole stack

The tests do not need containers, but the site, the chat and the admin panel are
easier to look at through Compose:

```bash
cp .env.example .env
sed -i "s|^MYSQL_PASSWORD=$|MYSQL_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^MYSQL_ROOT_PASSWORD=$|MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^ADMIN_TOKEN=$|ADMIN_TOKEN=$(openssl rand -hex 24)|" .env

docker compose up -d --build
```

The site answers on <http://localhost:3036> (`/admin/` asks for the `ADMIN_TOKEN`
you just generated) and phpMyAdmin on <http://localhost:8081>. Compose refuses to
start with an empty `.env` on purpose, and the `IMAGE_TAG_*` values have to be
set — no service ever uses `latest`. See
[.devcontainer/README.md](./.devcontainer/README.md) for the same steps inside a
codespace.

## Project layout

| Path | What it is |
| --- | --- |
| `cv/` | The CV site: Next.js (App Router, static export), TypeScript, Tailwind |
| `chat-backend/` | The chat and admin API: Express, MySQL, Web Push |
| `deployer/` | The one-click rebuild helper behind the admin panel |
| `tests/` | The unit and integration suite, and the Playwright specs |
| `docker-compose*.yml` | The development and the production stack |
| `.github/workflows/ci.yml` | lint, site, api, e2e, docker, publish, summary |

The README files describe the architecture, the tests and the operations in more
detail.

## Commit messages

This repository uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(chat): remember the visitor's last conversation
fix(admin): reject an empty ADMIN_TOKEN at startup
docs: describe the Codespaces setup
test(e2e): cover the push permission prompt
chore: bump eslint to 9.40
```

The subject is English, imperative and under about 72 characters. The body
explains *why* the change is needed; the diff already shows *what* changed.

## Pull requests

1. Fork the repository and branch from `main`: `fix/…`, `feat/…` or `docs/…`.
2. Keep it focused — one thing per pull request is much easier to review.
3. Add or update a test when behaviour changes; a bug fix should come with a test
   that fails before it.
4. Run what CI runs before you push:

   ```bash
   npm run lint
   npm run format:check
   npm test
   npm run e2e
   ```

5. Fill in the pull request template. The seven CI jobs (lint, site, api, e2e,
   docker, publish, summary) have to be green. `publish` only runs on `main` in
   this repository, so a fork never pushes images anywhere.

Small pull requests that touch one thing get reviewed first. For a large
refactor, an issue before the code saves everyone time.

## Code style

* **ESLint and Prettier own the formatting.** `npm run lint` and
  `npm run format` fix almost everything; do not reformat unrelated code.
* TypeScript for the site and the API; no `any` without a comment explaining it.
* Keep the container hardening in `docker-compose.yml` (read-only rootfs, dropped
  capabilities, `internal` networks) — if a change needs one of them relaxed,
  explain why in the pull request.
* Never commit a secret. `.env` is gitignored; `.env.example` documents the keys
  with empty values and must stay that way.
* Comments explain *why*. The code says *what*.

## Language

* Code, comments, commit messages, issue titles and pull requests: **English**.
* Documentation: an English `X.md` and a Hungarian `X.hu.md` for every document.
  Keep the pair in sync — a change to one is a change to both.
* The site's own copy is Hungarian and lives in the database, editable in
  `/admin/`; it is not hardcoded in the components.

## License

By contributing you agree that your work is licensed under the
[MIT License](./LICENSE), the same as the rest of the project.

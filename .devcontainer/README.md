# Codespaces

[Magyar verzió](./README.hu.md) · **English**

The dev container behind the **Code → Codespaces → Create codespace on main**
button (or [the short link](https://codespaces.new/CsabaTuri/cv)).

## What is in it

| | |
| --- | --- |
| Base image | `mcr.microsoft.com/devcontainers/javascript-node:22` - the same Node the CI and the images use |
| Docker | `docker-in-docker`, so the whole stack runs *inside* the codespace |
| GitHub CLI | `gh`, logged in through the codespace token |
| Dependencies | `npm ci` in the root, `cv/` and `chat-backend/`, once when the codespace is created |
| Test database | a throwaway MySQL on `127.0.0.1:3306` (`cv_chat_test`), started on every start |
| Ports | 3036 (the site) and 8081 (phpMyAdmin), forwarded and labelled |
| Extensions | ESLint, Prettier, Playwright |

Nothing is mocked: the dev container runs the same commands the CI does, against
the same real MySQL.

## First things to run

```bash
npm test                # 58 unit and integration tests, no configuration needed
npm run e2e             # 18 Playwright tests
```

`npm run e2e` needs two things once (the CI does them on every run):

```bash
npm --prefix cv run build            # the exported site the tests serve
npx playwright install --with-deps chromium
```

Then `npm run e2e` drives the real export, the real API and the real database -
`tests/e2e/server.mjs` serves `cv/out` the way nginx does, and Playwright starts
the backend next to it.

## The whole stack

To see the site, the chat and the admin panel with containers instead of the test
runners, fill in the secrets Compose insists on and start it:

```bash
cp .env.example .env
sed -i "s|^MYSQL_PASSWORD=$|MYSQL_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^MYSQL_ROOT_PASSWORD=$|MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^ADMIN_TOKEN=$|ADMIN_TOKEN=$(openssl rand -hex 24)|" .env

docker compose up -d --build
```

The site then answers on the forwarded port 3036 (`/admin/` for the CMS, which
asks for the `ADMIN_TOKEN` you just generated) and phpMyAdmin on 8081. The build
of the first start takes a couple of minutes; after that the admin panel's *Build*
tab does the same thing with one click.

## What is deliberately not here

* no MySQL installed in the image - the throwaway test database runs in Docker
  (`npm run db:test:start`), and the stack brings its own;
* no preinstalled Playwright browser - one command installs it, and it is not
  needed to run the unit suite;
* no `gh` login with extra scopes: pushing to the registry is the CI's job in this
  repository (see the *publish* job), not the codespace's.

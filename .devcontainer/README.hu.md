# Codespaces

[English version](./README.md) · **Magyar**

A **Code → Codespaces → Create codespace on main** gomb (vagy [a rövid link](https://codespaces.new/CsabaTuri/cv))
mögötti dev konténer.

## Mi van benne

| | |
| --- | --- |
| Alap image | `mcr.microsoft.com/devcontainers/javascript-node:22` — ugyanaz a Node, amit a CI és az image-ek használnak |
| Docker | `docker-in-docker`, így a teljes stack a codespace-en *belül* fut |
| GitHub CLI | `gh`, a codespace tokenjével bejelentkezve |
| Függőségek | `npm ci` a gyökérben, a `cv/`-ben és a `chat-backend/`-ben, egyszer, a codespace létrehozásakor |
| Teszt adatbázis | egy eldobható MySQL a `127.0.0.1:3306`-on (`cv_chat_test`), minden indításnál elindul |
| Portok | 3036 (az oldal) és 8081 (phpMyAdmin), forwardolva és címkézve |
| Kiterjesztések | ESLint, Prettier, Playwright |

Semmi nincs mockolva: a dev konténer ugyanazokat a parancsokat futtatja, mint a
CI, ugyanazon a valódi MySQL-en.

## Elsőként futtatandó parancsok

```bash
npm test                # 58 unit és integrációs teszt, konfiguráció nélkül
npm run e2e             # 18 Playwright teszt
```

A `npm run e2e` kettő dolgot egyszer igényel (a CI minden futásnál megteszi):

```bash
npm --prefix cv run build            # az exportált oldal, amit a tesztek kiszolgálnak
npx playwright install --with-deps chromium
```

Utána a `npm run e2e` a valódi exportot, a valódi API-t és a valódi adatbázist
hajtja — a `tests/e2e/server.mjs` a `cv/out`-ot szolgálja ki úgy, ahogy az nginx
tenné, a Playwright pedig mellé indítja a backendet.

## A teljes stack

Ha az oldalt, a chatet és az admin panelt konténerekkel szeretnéd látni a
teszt-futtatók helyett, töltsd ki a titkokat, amiket a Compose megkövetel, és
indítsd el:

```bash
cp .env.example .env
sed -i "s|^MYSQL_PASSWORD=$|MYSQL_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^MYSQL_ROOT_PASSWORD=$|MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^ADMIN_TOKEN=$|ADMIN_TOKEN=$(openssl rand -hex 24)|" .env

docker compose up -d --build
```

Ezután az oldal a forwardolt 3036-os porton válaszol (`/admin/` a CMS-hez, ami az
éppen generált `ADMIN_TOKEN`-t kéri), a phpMyAdmin pedig a 8081-en. Az első
indítás buildje néhány percet vesz igénybe; utána az admin panel *Build* füle
ugyanezt teszi egy kattintással.

## Ami szándékosan nincs itt

* nincs az image-be telepített MySQL — az eldobható teszt adatbázis Dockerben fut
  (`npm run db:test:start`), a stack pedig hozza a sajátját;
* nincs előre telepített Playwright böngésző — egy paranccsal telepíthető, és a
  unit készlet futtatásához nem is kell;
* nincs extra scope-okkal bejelentkezett `gh`: a registrybe való push ebben a
  repóban a CI dolga (lásd a *publish* jobot), nem a codespace-é.

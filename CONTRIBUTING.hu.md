# Közreműködés

[English version](./CONTRIBUTING.md) · **Magyar**

Kösz, hogy benéztél. Ez egy bemutató projekt — önéletrajz oldal saját chattel,
admin panellel és CMS-sel —, amit egy ember tart karban a szabadidejében, így a
hibajelentések, a dokumentáció javításai és a kicsi, fókuszált pull requestek
egyaránt szívesen látottak.

Hogy őszinte legyek a keretekkel: a review néhány napot igénybe vehet, és egy
olyan funkciót, ami nem illik a projekt céljaihoz (nincs AI, nincs harmadik
féltől származó chat szolgáltatás), inkább elutasítok magyarázattal, mint
beolvasztok.

## Hogyan tudsz segíteni

* **Hibát jelentesz** — [nyiss egy hibajelentést](https://github.com/CsabaTuri/cv/issues/new?template=bug_report.md).
* **Funkciót kérsz** — [nyiss egy funkciókérést](https://github.com/CsabaTuri/cv/issues/new?template=feature_request.md).
* **Javítasz valamit** — a teszttel érkező pull request a leggyorsabb út a merge-ig.
* **A dokumentációt javítod** — minden dokumentum megvan angolul és magyarul; a
  javítás bármelyikben jöhet, de kérem tartsd szinkronban a párt.
* **Biztonsági rést jelentesz** — **soha** ne nyilvános issue-ban; lásd
  [SECURITY.hu.md](./SECURITY.hu.md).

Mielőtt issue-t nyitsz, keresd meg a meglévőket: lehet, hogy már ott a válasz.
Kérlek ne illessz titkot, tokent vagy mások személyes adatát se issue-ba, se pull
requestbe.

## Első lépések

| | |
| --- | --- |
| Node | 20 vagy 22 — a CI mindkettőn futtatja a teszteket |
| Docker | Engine és Compose v2; a teszt adatbázis és a stack konténerben fut |
| Git | bármelyik nem túl régi verzió |

```bash
git clone https://github.com/CsabaTuri/cv.git
cd cv

# a három függőségi fa: az eszközök, az oldal, az API
npm ci
npm ci --prefix cv
npm ci --prefix chat-backend

# eldobható MySQL a 127.0.0.1:3306-on; a tesztekhez más nem kell
npm run db:test:start

npm test        # 58 unit és integrációs teszt
npm run e2e     # 18 Playwright teszt
```

A `npm run e2e` egyszer igényli az exportált oldalt és egy böngészőt:

```bash
npm --prefix cv run build
npm run e2e:install
```

A [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) ugyanezeket a
parancsokat futtatja, szóval a helyben zöld futás általában ott is zöld lesz. A
teszt adatbázist a `npm run db:test:stop` állítja le.

## A teljes stack futtatása

A tesztekhez nem kell konténer, de az oldalt, a chatet és az admin panelt kényelmesebb
Compose-szal megnézni:

```bash
cp .env.example .env
sed -i "s|^MYSQL_PASSWORD=$|MYSQL_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^MYSQL_ROOT_PASSWORD=$|MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^ADMIN_TOKEN=$|ADMIN_TOKEN=$(openssl rand -hex 24)|" .env

docker compose up -d --build
```

Ezután az oldal a <http://localhost:3036>-on válaszol (`/admin/` az éppen generált
`ADMIN_TOKEN`-t kéri), a phpMyAdmin a <http://localhost:8081>-en. A Compose
szándékosan nem indul el üres `.env`-vel, és az `IMAGE_TAG_*` értékeket kötelező
kitölteni — egyik szolgáltatás sem használ `latest` taget. Ugyanezek a lépések
codespace-en belül: [.devcontainer/README.hu.md](./.devcontainer/README.hu.md).

## A projekt szerkezete

| Útvonal | Mi az |
| --- | --- |
| `cv/` | Az önéletrajz oldal: Next.js (App Router, statikus export), TypeScript, Tailwind |
| `chat-backend/` | A chat és admin API: Express, MySQL, Web Push |
| `deployer/` | Az admin panel gombja mögötti rebuild helper |
| `tests/` | A unit és integrációs készlet, valamint a Playwright specifikációk |
| `docker-compose*.yml` | A fejlesztői és az éles stack |
| `.github/workflows/ci.yml` | lint, site, api, e2e, docker, publish, summary |

Az architektúráról, a tesztekről és az üzemeltetésről a README-k írnak részletesen.

## Commit üzenetek

A repó [Conventional Commits](https://www.conventionalcommits.org/) formátumot
használ:

```
feat(chat): remember the visitor's last conversation
fix(admin): reject an empty ADMIN_TOKEN at startup
docs: describe the Codespaces setup
test(e2e): cover the push permission prompt
chore: bump eslint to 9.40
```

A tárgy angol, felszólító módú és kb. 72 karakter alatt van. A törzs azt
magyarázza, *miért* kell a változtatás; azt, hogy *mi* változott, a diff úgyis
mutatja.

## Pull requestek

1. Forkold a repót, és a `main`-ből ágazz: `fix/…`, `feat/…` vagy `docs/…`.
2. Maradj fókuszált — egy dolog egy pull requestben sokkal könnyebben
   review-zható.
3. Ha a viselkedés változik, írj vagy igazíts tesztet; egy hibajavításhoz olyan
   teszt illik, ami előtte elhasal.
4. Futtasd le, amit a CI is futtat, mielőtt pusholsz:

   ```bash
   npm run lint
   npm run format:check
   npm test
   npm run e2e
   ```

5. Töltsd ki a pull request sablont. A hét CI job (lint, site, api, e2e, docker,
   publish, summary) zöld kell legyen. A `publish` ebben a repóban csak a `main`-en
   fut, így egy fork soha nem tol fel image-eket sehova.

Azok a kicsi pull requestek mennek át először, amik egy dolgot érintenek. Egy nagy
refaktor előtt egy issue megspórolja mindenkinek az idejét.

## Kódstílus

* **A formázást az ESLint és a Prettier adja.** A `npm run lint` és a
  `npm run format` szinte mindent megjavít; ne formázd újra a nem érintett kódot.
* TypeScript az oldalon és az API-ban; `any` csak magyarázó kommenttel.
* A `docker-compose.yml` konténer-hardeningje (read-only rootfs, eldobott
  capability-k, `internal` hálózatok) maradjon meg — ha egy változtatáshoz
  lazítani kell rajtuk, indokold meg a pull requestben.
* Titkot soha ne commitolj. A `.env` gitignore-olt; a `.env.example` üres
  értékekkel dokumentálja a kulcsokat, és ez így marad.
* A kommentek azt magyarázzák, *miért*. Hogy *mi* történik, azt a kód mondja.

## Nyelv

* Kód, kommentek, commit üzenetek, issue címek és pull requestek: **angolul**.
* Dokumentáció: minden dokumentumhoz egy angol `X.md` és egy magyar `X.hu.md`
  tartozik. Tartsd szinkronban a párt — az egyik módosítása a másik módosítása is.
* Maga az oldal szövege magyar, és az adatbázisban él, az `/admin/`-ban
  szerkeszthető; nincs a komponensekbe égetve.

## Licenc

A közreműködéssel elfogadod, hogy a munkád az [MIT licenc](./LICENSE) alatt
jelenik meg, ahogy a projekt többi része is.

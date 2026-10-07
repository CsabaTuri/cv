# Önéletrajz + egyedi chat stack

[English version](./README.md) · **Magyar**

Statikus önéletrajz oldal (Next.js SSG, nginx szolgálja ki) saját chattel:
látogatói chat widget, admin beérkező (inbox) és egy kisebb CMS az oldal
szövegeihez — nincs harmadik féltől származó chat szolgáltatás és nincs AI.

```
böngésző ──▶ cv (nginx-unprivileged, uid 101)
              ├── /                  statikus oldal
              ├── /admin/            inbox + szövegszerkesztő
              └── /api/*  ──▶ chat-backend (Node) ──▶ mysql (belső hálózat)
                                                   └── phpmyadmin (csak loopback)
```

## Szolgáltatások

| Szolgáltatás | Image | Publikált port | Hálózatok | Megjegyzés |
| --- | --- | --- | --- | --- |
| `cv` | `cv-web:${IMAGE_TAG_CV}` (nginx-unprivileged, uid 101) | `3036:8080` a `SITE_BIND`-en (alap: `0.0.0.0`) | `app` | Statikus oldal + `/api` reverse proxy. Read-only rootfs, minden capability eldobva. |
| `chat-backend` | `cv-chat-backend:${IMAGE_TAG_CHAT_BACKEND}` (Node 20, `nodejs` user) | `3112:3000` | `app`, `data` | Chat + admin API. Read-only rootfs, minden capability eldobva. |
| `mysql` | `mysql:8.4` | nincs | `data` (internal) | Üzenetek, beszélgetések, oldal-szövegek. Read-only rootfs, deny-by-default capability-k. |
| `phpmyadmin` | `phpmyadmin:5-apache` | `8081:80` | `data`, `pma` | Adatbázis UI az üzemeltetőnek. |
| `deployer` | `cv-deployer:${IMAGE_TAG_DEPLOYER}` (Node 20 + Docker CLI) | nincs | `app` | Rebuild helper az admin panelhez, `DEPLOY_ENABLED=true` nélkül nem csinál semmit. Övé a Docker socket; lásd [Újrabuildelés](#újrabuildelés-egy-gombnyomásra-admin-panel). |

A `data` hálózat `internal: true`: a MySQL-nek nincs internet-egress-e, és a
hostról/LAN-ról sem érhető el. A `pma` hálózat csak a phpMyAdmin publikált
portját szolgálja (a Docker nem tud portot publikálni olyan konténeren, ami
csak internal hálózaton van). Az `app` alhálózata (`172.33.255.0/24`)
szándékosan fix — a host routolja.

A `deployer` helper semmit nem publikál: ez az egyetlen szolgáltatás, ami a
Docker sockethez hozzáfér, és `DEPLOY_ENABLED=true` nélkül semmit nem csinál.

## Compose fájlok

| Fájl | Szerep |
| --- | --- |
| `docker-compose.yml` | Alap definíció és hardening: fejlesztéshez és éleshez is. |
| `docker-compose.override.yml` | Fejlesztői kényelmi beállítások; a `docker compose up -d` **automatikusan** alkalmazza. |
| `docker-compose.prod.yml` | Éles „enforcement" réteg; `-f`-fel kell megadni. A dev overriddal **ne** kombináld. |

```bash
# fejlesztés (base + override)
docker compose up -d --build

# éles (base + prod, dev override nélkül)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# éles: minden szolgáltatás, köztük a gomb mögötti rebuild helper
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Az éles overlay az admin API-t és a phpMyAdmin-t a host loopback interfészére
kötözi (tehát egy lazább `API_BIND`/`PHPMYADMIN_BIND` a `.env`-ben sem teszi ki
őket), szigorúbb log rotációt, leállítási grace periodot és nofile limiteket ad.

## Gyors indítás

```bash
cp .env.example .env            # majd töltsd ki a kötelező titkokat
$EDITOR .env
chmod 600 .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose ps
curl -I http://127.0.0.1:3036/healthz
```

| URL | Mi |
| --- | --- |
| http://localhost:3036/ | a weboldal |
| http://localhost:3036/admin/ | admin panel (*Üzenetek* / *Szövegek* / *Build*) — `ADMIN_TOKEN` kell hozzá |
| http://localhost:8081/ | phpMyAdmin (élesben csak loopback) |

LAN-ról vagy távolról a phpMyAdminhoz inkább alagutat használj, ne portot nyiss:

```bash
ssh -L 8081:127.0.0.1:8081 user@host    # majd http://localhost:8081
```

## Újrabuildelés egy gombnyomásra (admin panel)

A *Build* fül egy gombnyomásra újraépíti és újraindítja a repositoryból épülő
két image-et (`cv`, `chat-backend`) — kényelmes, ha telefonról vagy másik
gépről nyúlsz a kódhoz. Tartalomhoz **nem** kell: az oldal szövegei az
adatbázisban élnek, és a *Szövegek* fülön build nélkül szerkeszthetők.

A helper a stack része (minden mással együtt indul), és a `DEPLOY_ENABLED=false`
kapcsolja ki, mert ez az egyetlen konténer, ami a Docker sockethez nyúl (ez a
hoston root-joggal egyenértékű). Szándékosan **nincs** compose profile mögött:
a profile-os szolgáltatást a többi hívás kihagyja, a visszamaradó konténer pedig
blokkolja azoknak a hálózatoknak a törlését, amiket a stack többi része használ
— ez pedig leviszi az oldalt.

| | |
| --- | --- |
| Szolgáltatás | `deployer`, konténer: `cv_deployer`, publikált port nélkül |
| Amit futtat | `docker compose up -d --build cv chat-backend` (fixen beégetve, shell nélkül) |
| Auth | `Authorization: Bearer $ADMIN_TOKEN` minden végponton, kivéve a `/health`-et |
| Kapcsoló | csak `DEPLOY_ENABLED=true` esetén cselekszik (`false` esetén státuszt ad, de nem buildel) |
| Párhuzamosság | egyszerre egy build fut (a második kérés `409`-et kap) |
| Kimenet | az utolsó 500 naplósor a *Build* fülön, a `deploy-state` volume-ban tárolva |
| Timeout | `DEPLOY_TIMEOUT_MS`, alapból 15 perc |

A helper szándékosan túléli az általa indított buildet, így a panel közben
folyamatosan tudja mutatni a naplót és a végét. Ha a konténer áll, a panel jelzi,
és kiírja az indító parancsot.

Két dolog, amit érdemes észben tartani:

* az indított build **nem** olvassa a repository `.env` fájlját (a helper nem is
  kaphatja meg: 0600, és a Docker socket mellett ez nem fér bele). Minden
  interpolált értéket a saját környezetéből kap, ezért ha új változót veszel fel
  a `.env`-be a compose fájlokhoz, a `deployer` szolgáltatásnál is add meg.
* a `DEPLOY_COMPOSE_FILES` dönti el, mely compose fájlokat használja az
  indított build (alap: `docker-compose.yml:docker-compose.prod.yml`; a dev
  overlay `docker-compose.yml:docker-compose.override.yml`-ra állítja).

## Környezeti változók (`.env`)

A dokumentált sablon: [`.env.example`](./.env.example).

| Név | Szerep |
| --- | --- |
| `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | Adatbázis és alkalmazás credentialek (kötelező). |
| `ADMIN_TOKEN` | Az admin API-t védi, és ezzel lépsz be a `/admin` oldalra (kötelező). |
| `TZ` | Időzóna a MySQL/phpMyAdmin és a backend számára. |
| `IMAGE_TAG_CV`, `IMAGE_TAG_CHAT_BACKEND`, `IMAGE_TAG_DEPLOYER` | **Kötelező**: image-enként egy konkrét verzió, soha nem `latest`; lásd *Visszaállás*. |
| `SITE_BIND`, `API_BIND`, `PHPMYADMIN_BIND` | Mely host interfészekre kötődjenek a portok. |
| `NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN` | Opcionális analytics token, build időben kerül a bundle-be. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push kulcspár és kapcsolat. Üres kulcsokkal az értesítések egyszerűen kikapcsoltak. |
| `DEPLOY_ENABLED` | Engedélyezi, hogy a rebuild helper cselekedjen (alap: `false`). |
| `DEPLOY_COMPOSE_FILES` | Mely compose fájlokat használja az indított build (képponttal elválasztva). |
| `DEPLOY_SERVICES` | Mely szolgáltatásokat építse újra a gomb (alap: `cv chat-backend`). |
| `DEPLOY_SOURCE_DIR` | A helper által mountolt forráskönyvtár (alap: a stack könyvtára). |

A compose **fail-fast**: hiányzó kötelező érték esetén (`${VAR:?}`) nem indul
el gyenge jelszóval, és verzió nélkül sem — próbáld ki üres `ADMIN_TOKEN`-nel,
vagy valamelyik image tag nélkül a `docker compose config` paranccsal.

## Telepíthető alkalmazás és értesítések

Az oldal PWA: böngészőből telepíthető (manifest, ikonok, service worker), és
offline is megnyílik, mert a service worker gyorsítótárazza az exportált héjat
és a hashelt asset-eket. Az `/api/*` viszont **soha** nem kerül cache-be, így a
chat és az admin panel mindig az élő backenddel beszél.

Az értesítések **Web Push** értesítések, tehát akkor is megérkeznek, ha az oldal
(és a böngésző) zárva van:

| Kinek | Mikor szól | Kapcsoló |
| --- | --- | --- |
| Látogató | az admin válaszol a chatjében | a csengő ikon a chat ablakban |
| Admin | látogató ír | az *Értesítések* gomb az admin panelen |

Mindkét kapcsoló kattintást igényel (a böngésző máshogy nem engedi elkérni az
értesítési engedélyt), és böngészőnként külön él.

A kézbesítést a `chat-backend` végzi a `.env`-ben lévő VAPID kulcspárral
(`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). A kulcspár cseréje
minden meglévő feliratkozást érvénytelenít, ezért minden böngészőben újra be kell
kapcsolni az értesítéseket. Az értesítések szövegei az admin oldalon a *Szövegek*
→ *Értesítések* csoportban szerkeszthetők.

Két dolgot a böngésző dönt el, nem mi:

* A Web Push és a service worker csak **biztonságos környezetben** működik:
  HTTPS-en vagy `localhost`-on. `http://<LAN-IP>:3036` alatt az oldal működik, de
  az értesítés és az offline mód nem elérhető (a panel ezt ki is írja, nem
  hallgat el hibát).
* **iOS-en** az értesítéshez előbb telepíteni kell az oldalt (Megosztás → *Főképernyőhöz adás*),
  iOS 16.4-től.

Végpontok (lásd [chat-backend/README.hu.md](./chat-backend/README.hu.md)):

```bash
GET    /api/push/public-key      # a VAPID publikus kulcs + hogy be van-e kapcsolva
POST   /api/push/subscriptions   # { audience, sessionId?, subscription }
DELETE /api/push/subscriptions   # { audience, sessionId?, endpoint }
GET    /api/admin/push/subscriptions
POST   /api/admin/push/test      # teszt értesítés az admin böngészőinek
```

## Eszközök

Az eszközök a repository gyökerében laknak; az oldal a saját függőségeit a
`cv/` alatt tartja.

```bash
npm ci                        # ESLint, Prettier, Playwright
npm ci --prefix cv            # az oldal
npm ci --prefix chat-backend  # az API

npm run lint                  # ESLint: szolgáltatások, tesztek, CI scriptek, oldal
npm run format                # Prettier; a CI a format:check-et futtatja
npm test                      # a unit és integrációs készlet
npm run e2e                   # Playwright a valódi stack ellen
```

| Parancs | Mit fog át |
| --- | --- |
| `npm run lint` | egy flat config ([`eslint.config.mjs`](./eslint.config.mjs)): Node globals a `chat-backend/`, `deployer/`, `tests/` és `.github/scripts/` alatt, plusz TypeScript, React hooks, `jsx-a11y` és a Next szabályok a `cv/src`-re |
| `npm run format` | Prettier JS/TS/JSX/JSON/CSS fájlokra. A markdown, a compose fájlok, a workflow-k és a `.env*` szándékosan kimaradnak - azokat kézzel tördelve, soronként átnézve írtuk (lásd [`.prettierignore`](./.prettierignore)) |
| `npm test` | az 54 unit és integrációs teszt a [`tests/`](./tests) alatt |
| `npm run e2e` | 18 Playwright teszt a valódi export, a valódi API és egy valódi adatbázis ellen |

Az end-to-end futáshoz előbb kell az export; a két szervert aztán a Playwright
indítja (az API-t a `chat-backend/`-ből, a `cv/out`-ot pedig a
[`tests/e2e/server.mjs`](./tests/e2e/server.mjs) szolgálja ki, ami az
`cv/nginx.conf` proxy- és 404-szabályait utánozza):

```bash
npm --prefix cv run build
npx playwright install --with-deps chromium   # gépenként egyszer
DB_PORT=3307 npm run e2e
```

## Tesztek és CI

Minden a [`tests/`](./tests) könyvtárban van, és csak Node 20+ meg egy MySQL
kell hozzá; külön adatbázist (`cv_chat_test`) használ, így nem nyúl a valódi
adatokhoz:

```bash
npm ci --prefix chat-backend
DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=cv_chat_test \
DB_USER=chat DB_PASSWORD=chat ADMIN_TOKEN=ci-admin-token \
  node --test tests/*.test.mjs
```

| Fájl | Mit fed le |
| --- | --- |
| `tests/api.test.mjs` | az API valódi MySQL ellen: látogatói folyam, cursorok, admin auth, válaszok, olvasatlan számláló, a szöveg-végpontok (validáció, JSON mezők, méretlimit), és a push (validáció, audience-szétválasztás, endpoint soha nem szivárog ki, hibás kézbesítés nem buktatja a chatet, kikapcsolt állapot) |
| `tests/content.test.mjs` | a szövegkatalógus: egyedi kulcsok, JSON szerializálás, és hogy a frontend minden kért kulcsa létezik - a megfelelő hookkal |
| `tests/assets.test.mjs` | a PWA (manifest mezők, ikonok a deklarált méretekkel, a worker handlerei), az nginx szabályok, és a compose invariánsok, amiket ez a stack már elrontott: nincs `latest`, nincs profile a rebuild helperen, a gateway a subnetjén belül, a VAPID kulcsok mindkét szolgáltatáshoz eljutnak, `.env.example` szinkronban |

A [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) hat jobot futtat
minden pull requestnél és a `main`-re való pushnál:

| Job | Mit csinál |
| --- | --- |
| `lint` | ESLint és `prettier --check` az egész repository-ra |
| `site` | typecheck + statikus export, benne a PWA fájlok |
| `api` | a fenti készlet `mysql:8.4` service ellen, Node 20-on és 22-n (egyszerre 54 teszt) |
| `e2e` | megépíti az exportot, telepíti a Chromiumot, és lefuttatja a Playwright készletet ugyanazon a `mysql:8.4` service-en (18 teszt) |
| `summary` | összegyűjti az `api` és `e2e` jelentéseit, és a teljes készletet egy összefoglalóba írja: **72 teszt** egy táblázatban a futás oldalán |
| `docker` | mindkét overlay, a fail-fast őr `.env` nélkül, `docker compose build`, és `nginx -t` a megépített image-ben |

Minden jobnak saját összefoglalója van, ezért egy job száma még nem a teljes kép:
a `summary` az, amit először érdemes megnézni — és ez az oka annak is, hogy a unit
tesztek nem számolódnak kétszer (a két Node verzió ugyanazt az 54-et futtatja).

### Az eredmények megjelenítése

A teszt lépés a napló mellett a `node --test` beépített JUnit riportját is
elkéri, a [`.github/scripts/test-summary.mjs`](./.github/scripts/test-summary.mjs)
pedig ebből markdown jelentést készít, ami három helyen jelenik meg - egyikhez
sem kell extra eszköz vagy külső action:

* **Futás összefoglaló** - a jelentés a `$GITHUB_STEP_SUMMARY`-ba kerül, így a
  job oldalának tetején látszik: összesítés, táblázat suite-onként, és minden
  hibánál egy lenyitható blokk az üzenettel. A `summary` job ugyanezeket a
  számokat a teljes készletre (unit + end-to-end) is kiírja a futás oldalára.
* **Artifact** - a `test-results-node-<verzió>` tartalmazza a JUnit XML-t és a
  markdown jelentést, 14 napig letölthető a futás oldaláról.
* **Pull request komment** - pull requestnél ugyanez a markdown megy kommentként,
  és minden pushnál ugyanaz a komment frissül, nem lesz belőle egy sorozat.
  Minden job a saját kommentjét tartja: mindkettő hordoz egy rejtett markert, így
  a unit és az end-to-end jelentés nem írja felül egymást
  ([`.github/scripts/pr-comment.sh`](./.github/scripts/pr-comment.sh)). Forknál a
  token csak olvasásra jó, ezért az a lépés ott elhasalhat.

Ugyanez a jelentés lokálisan, a fenti parancs után:

```bash
mkdir -p test-results
node --test --test-reporter=junit \
  --test-reporter-destination=test-results/junit.xml tests/*.test.mjs
node .github/scripts/test-summary.mjs test-results/junit.xml --title Local
```

A `test-results/` könyvtár git-ignore alatt van.

## Biztonsági intézkedések

* Nincs sehol default credential; hiányzó érték megállítja a deployt.
* Az adatbázis `internal` hálózaton, publikált port nélkül, `--local-infile=OFF`,
  `--skip-name-resolve`, és slow query log (`--long-query-time=2`) a
  `/var/lib/mysql/slow.log` fájlban.
* Capability és AppArmor megjegyzés: a capability-k deny-by-default módon vannak
  megadva (nem „mind, kivéve néhány"), és nincs beégetett `apparmor=` profil —
  a Docker ott alkalmazza a saját default profilját, ahol a host támogatja, egy
  explicit pin viszont el sem indulna AppArmor nélküli hoston.
* Mindenhol `no-new-privileges`, és **minden** szolgáltatás `cap_drop: [ALL]`-lal
  fut, plusz egy explicit `cap_add` listával arról, ami tényleg kell (a
  MySQL/phpMyAdmin rootból vált le induláskor, az nginxnek a 80-as port kell).
* Read-only rootfs kis `tmpfs` mountokkal mindenhol, ahol lehetséges: nginx,
  Node backend, a deployer helper és a MySQL (adat a volume-on, socket és temp
  fájlok tmpfs-en). A phpMyAdmin a dokumentált kivétel: az entrypointja minden
  indulásnál beírja a session blowfish secretet az `/etc/phpmyadmin` alá.
* Fájlleíró limit szolgáltatásonként; `stop_grace_period` minden hosszan futó
  szolgáltatásnál (az nginx SIGQUIT-ra kiüríti a kapcsolatokat, az API befejezi
  a futó kéréseket és lezárja a poolt), és `start_interval`, hogy a hideg
  indítás másodpercek alatt összeálljon.
* Nem-root futásidejű userek (uid 101 / `nodejs`), `init: true` a szignálkezeléshez.
* Élesben az admin API és az adatbázis UI a host loopbackjére kötve; csak a
  weboldal publikus.
* A rebuild helper az egyetlen konténer a Docker socket birtokában:
  `DEPLOY_ENABLED` kapcsoló (`false` esetén semmit nem tud buildelni), egyetlen
  beégetett parancs, minden híváson `ADMIN_TOKEN`, read-only forrás mount,
  publikált port nélkül, minden capability eldobva, és a repository `.env`-jét
  nem tudja kiolvasni.
* nginx: `server_tokens off`, biztonsági headerek, API rate limit (20 r/s per IP,
  burst 40 → 429), 16 kB API body limit, metódus allow-list (405), `X-Powered-By`
  elrejtve, timeoutok korlátozva.
* CPU/memória/pid limitek és log rotáció (10m × 3, élesben tömörítve).
* A MySQL 60 mp grace perioddal áll le (dev: 30 mp), hogy az InnoDB ki tudjon írni.

## Üzemeltetés

```bash
docker compose ps                                  # állapot + health
docker compose logs -f chat-backend                # log követése
docker compose up -d --build                       # dev: változások alkalmazása
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose pull && docker compose up -d        # image-ek frissítése
```

Mentés / visszaállítás (a jelszó `MYSQL_PWD`-n keresztül megy, így nem kerül a
konténer process listájába):

```bash
# mentés (konzisztens pillanatkép, tábla-zár nélkül)
docker compose exec -T -e MYSQL_PWD="$MYSQL_PASSWORD" mysql sh -c \
  'exec mysqldump -u"$MYSQL_USER" --single-transaction --routines --events "$MYSQL_DATABASE"' \
  | gzip > "chat-$(date +%F).sql.gz"

# visszaállítás
gunzip -c chat-2026-10-07.sql.gz | docker compose exec -T -e MYSQL_PWD="$MYSQL_PASSWORD" mysql sh -c \
  'exec mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"'
```

A chat adatai a `cv_mysql-data` named volume-ban vannak; compose fájlok
cseréjekor ezt tartsd meg.

Lassú lekérdezések:

```bash
docker compose exec mysql cat /var/lib/mysql/slow.log
```

Visszaállás (rollback):

```bash
# kiadás: emeld annak az image-nek a verzióját a .env-ben, amit módosítottál, majd build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# visszaállás: tedd vissza az előző verziót a .env-ben, majd indítás (build nélkül)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Minden image-nek saját verziója van, ezért az oldal és az API külön adható ki; a
helper továbbadja a tageket az általa indított buildnek, és az új értékeket
ugyanazzal a paranccsal veszi át, amint maga is újraépül. A második parancs csak
addig működik, amíg az előző image a hoston van — ne pruneld ki. Az *adatbázis*
visszaállítása dumpból történik: a séma `CREATE TABLE IF NOT EXISTS`-szel jön
létre, ezért egy régebbi image egy újabb séma ellen szintén restore-t igényel.

## Dokumentáció

A tesztkészlet leírása: [Tesztek és CI](#tesztek-és-ci).

* [chat-backend/README.hu.md](./chat-backend/README.hu.md) — az API, benne a push végpontok.
* [cv/README.md](./cv/README.md) — statikus önéletrajz oldal (angolul).
* [cv/README.hu.md](./cv/README.hu.md) — statikus önéletrajz oldal magyarul.
* [chat-backend/README.md](./chat-backend/README.md) — API végpontok, séma (angolul).
* [chat-backend/README.hu.md](./chat-backend/README.hu.md) — API végpontok, séma magyarul.

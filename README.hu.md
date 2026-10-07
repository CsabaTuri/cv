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
| `cv` | `cv-web:latest` (nginx-unprivileged, uid 101) | `3036:8080` a `SITE_BIND`-en (alap: `0.0.0.0`) | `app` | Statikus oldal + `/api` reverse proxy. Read-only rootfs, minden capability eldobva. |
| `chat-backend` | `cv-chat-backend:latest` (Node 20, `nodejs` user) | `3112:3000` | `app`, `data` | Chat + admin API. Read-only rootfs, minden capability eldobva. |
| `mysql` | `mysql:8.4` | nincs | `data` (internal) | Üzenetek, beszélgetések, oldal-szövegek. |
| `phpmyadmin` | `phpmyadmin:5-apache` | `8081:80` | `data`, `pma` | Adatbázis UI az üzemeltetőnek. |
| `deployer` | `cv-deployer:latest` (Node 20 + Docker CLI) | nincs | `app` | Opcionális rebuild helper (compose profile: `deploy`). Övé a Docker socket; lásd [Újrabuildelés](#újrabuildelés-egy-gombnyomásra-admin-panel). |

A `data` hálózat `internal: true`: a MySQL-nek nincs internet-egress-e, és a
hostról/LAN-ról sem érhető el. A `pma` hálózat csak a phpMyAdmin publikált
portját szolgálja (a Docker nem tud portot publikálni olyan konténeren, ami
csak internal hálózaton van). Az `app` alhálózata (`172.31.255.0/24`)
szándékosan fix — a host routolja.

A `deployer` helper csak a `deploy` profile-lal indul, és semmit nem publikál:
ez az egyetlen szolgáltatás, ami a Docker sockethez hozzáfér.

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

# éles + az opcionális rebuild helper, ami az admin panel gombja mögött van
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile deploy up -d
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

A helper opt-in, mert ez az egyetlen konténer, ami a Docker sockethez nyúl (ez
a hoston root-joggal egyenértékű):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile deploy up -d
```

| | |
| --- | --- |
| Szolgáltatás | `deployer`, konténer: `cv_deployer`, publikált port nélkül |
| Amit futtat | `docker compose up -d --build cv chat-backend` (fixen beégetve, shell nélkül) |
| Auth | `Authorization: Bearer $ADMIN_TOKEN` minden végponton, kivéve a `/health`-et |
| Kapcsolók | csak a `deploy` profile-lal indul, és csak `DEPLOY_ENABLED=true` esetén cselekszik |
| Párhuzamosság | egyszerre egy build fut (a második kérés `409`-et kap) |
| Kimenet | az utolsó 500 naplósor a *Build* fülön, a `deploy-state` volume-ban tárolva |
| Timeout | `DEPLOY_TIMEOUT_MS`, alapból 15 perc |

A helper szándékosan túléli az általa indított buildet, így a panel közben
folyamatosan tudja mutatni a naplót és a végét. Ha nem fut, a panel jelzi, és
kiírja a fenti parancsot.

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
| `TZ` | Időzóna a MySQL/phpMyAdmin számára. |
| `SITE_BIND`, `API_BIND`, `PHPMYADMIN_BIND` | Mely host interfészekre kötődjenek a portok. |
| `NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN` | Opcionális analytics token, build időben kerül a bundle-be. |
| `DEPLOY_ENABLED` | Engedélyezi, hogy a rebuild helper cselekedjen (alap: `false`). |
| `DEPLOY_COMPOSE_FILES` | Mely compose fájlokat használja az indított build (képponttal elválasztva). |
| `DEPLOY_SERVICES` | Mely szolgáltatásokat építse újra a gomb (alap: `cv chat-backend`). |
| `DEPLOY_SOURCE_DIR` | A helper által mountolt forráskönyvtár (alap: a stack könyvtára). |

A compose **fail-fast**: hiányzó kötelező érték esetén (`${VAR:?}`) nem indul
el gyenge jelszóval — próbáld ki üres `ADMIN_TOKEN`-nel a
`docker compose config` paranccsal.

## Biztonsági intézkedések

* Nincs sehol default credential; hiányzó érték megállítja a deployt.
* Az adatbázis `internal` hálózaton, publikált port nélkül, `--local-infile=OFF`.
* Mindenhol `no-new-privileges`; az nginx és a Node backend `cap_drop: [ALL]`;
  a MySQL/phpMyAdmin esetében csak a felesleges capability-k vannak eldobva
  (mindkettőnek rootból kell leváltania / a 80-as portra kötnie induláskor).
* Read-only rootfs kis `tmpfs` mountokkal (nginx, Node backend).
* Nem-root futásidejű userek (uid 101 / `nodejs`), `init: true` a szignálkezeléshez.
* Élesben az admin API és az adatbázis UI a host loopbackjére kötve; csak a
  weboldal publikus.
* A rebuild helper az egyetlen konténer a Docker socket birtokában: opt-in
  profile, `DEPLOY_ENABLED` kapcsoló, egyetlen beégetett parancs, minden híváson
  `ADMIN_TOKEN`, read-only forrás mount, publikált port nélkül, minden
  capability eldobva, és a repository `.env`-jét nem tudja kiolvasni.
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

Mentés / visszaállítás:

```bash
# mentés
docker compose exec -T mysql sh -c \
  'exec mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip > "chat-$(date +%F).sql.gz"

# visszaállítás
gunzip -c chat-2026-10-07.sql.gz | docker compose exec -T mysql sh -c \
  'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
```

A chat adatai a `cv_mysql-data` named volume-ban vannak; compose fájlok
cseréjekor ezt tartsd meg.

## Dokumentáció

* [cv/README.md](./cv/README.md) — statikus önéletrajz oldal (angolul).
* [cv/README.hu.md](./cv/README.hu.md) — statikus önéletrajz oldal magyarul.
* [chat-backend/README.md](./chat-backend/README.md) — API végpontok, séma (angolul).
* [chat-backend/README.hu.md](./chat-backend/README.hu.md) — API végpontok, séma magyarul.

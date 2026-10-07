# Biztonsági szabályzat

[English version](./SECURITY.md) · **Magyar**

## Támogatott verziók

Ez egy kiadások nélküli bemutató projekt. Csak a `main` ág legutóbbi commitja
karbantartott, minden régebbi nem. A CI által publikált image-ek commitonkénti,
változtathatatlan buildek (`ghcr.io/csabaturi/*:sha-<a commit 7 karaktere>`), így
egy kiadott image sosem kap utólag javítást — a javítás egy új commitban és egy új
tagben jelenik meg.

| Verzió | Támogatott |
| --- | --- |
| `main` (legutóbbi commit) | ✅ |
| Régebbi commitok, régebbi `sha-*` image-ek | ❌ |

## Hogyan jelents biztonsági rést

Kérlek privátban jelentsd emailben a **csabaek@gmail.com** címen, a tárgy elején
ezzel: `[security] cv:`. Írj bele annyit, amennyit tudsz az alábbiakból:

* mi a probléma, és melyik komponenst érinti (`cv/`, `chat-backend/`, `deployer/`,
  a Compose fájlok, a CI workflow);
* a reprodukálás lépései, vagy egy proof of concept, ha van;
* milyen hatással van szerinted — mit nyer vele egy támadó;
* mit próbáltál már ki, és hogyan szeretnéd, ha megemlítenének.

**Kérlek ne** nyiss nyilvános issue-t, discussiont vagy pull requestet egy
biztonsági résről, és ne illessz a jelentésbe mások személyes adatát vagy élő
titkot. Ha úgy gondolod, hogy titok került a repóba, azt is így jelentsd, ne
nyilvános issue-ban.

## Mire számíthatsz

| | |
| --- | --- |
| Első válasz | 72 órán belül, ahogy időm engedi |
| Értékelés | hogy reprodukálódik-e, milyen súlyos, és egy hozzávetőleges terv — jellemzően egy héten belül |
| Javítás | a `main`-en, és a commit vagy a pull request megemlíti a jelentésedet, ha kéred |
| Közzététel | összehangolva; lásd alább |

Ez egy szabadidős projekt, így nincs bug bounty és nincs garantált javítási
határidő. Az őszinte jelentésre akkor is őszinte válasz jön.

## Felelősségteljes közzététel

* Adj ésszerű időt — 30 nap jó kiindulás —, mielőtt nyilvánosan írsz a
  problémáról.
* Ne menj tovább, mint ami a bizonyításhoz kell: ne exfiltrálj adatot, ne építs
  be tartós hozzáférést, ne mozogj oldalra, és ne indíts szolgáltatásmegtagadást
  vagy automatizált szkennelést az éles oldal ellen.
* A bemutató telepítés bármikor visszaállítható vagy lekapcsolható; ne számíts
  arra, hogy megmarad benne, amit ott hagysz.
* Ne tesztelj olyan fiókok, beszélgetések vagy adatok ellen, amelyek nem a
  tieid.

## Hatókör

Hatókörön belül — a repóban lévő kód:

| Terület | Például mi érdekes |
| --- | --- |
| `chat-backend/` | Az admin hitelesítés, a chat végpontok, a push feliratkozások, az SQL kezelés |
| `cv/` | A statikus export, a service worker, a PWA manifest, a `/api` proxyzés |
| `deployer/` | Az admin panel mögötti rebuild végpont — övé a Docker socket, itt számítanak a jogosultsági határok |
| `docker-compose*.yml` | A konténer-hardening: capability-k, read-only fájlrendszerek, hálózati izoláció, publikált portok |
| `.github/workflows/ci.yml` | Titkok kezelése, mit futtathat egy pull request |

Hatókörön kívül:

* Maga a GitHub és a GitHub Actions mint platform — azokat a GitHubnak jelentsd.
* A felhasznált image-ek és függőségek (`mysql`, `phpmyadmin`,
  `nginx-unprivileged`, Node, npm csomagok) olyan sebezhetőségei, amelyeket az nem
  súlyosbít, ahogy ez a projekt használja őket; azokat felfelé jelentsd, de egy
  jelzés szívesen látott, ha a konfigurációnk számít.
* Olyan megállapítások, amelyekhez már feltört gép, rosszindulatú
  böngészőkiterjesztés vagy fizikai hozzáférés kell.
* Az `ADMIN_TOKEN` és az adatbázis jelszavak egy helyi `.env`-ben — azokat az
  üzemeltető generálja, és titoknak vannak szánva; a `.env` soha nincs
  commitolva.
* Hiányzó hardening, rate limiting vagy monitorozás a nyilvános demón, kivéve, ha
  az konkrét támadáshoz vezet. Ez egy demó — írd meg a jelentésben, és akkor is
  komolyan vesszük.
* Az, hogy a chat a látogatók számára hitelesítés nélküli: szándékosan nyitott, és
  az API-nak 32 kB-os kérésméret-korlátja van, de rate limitingje nincs. A spam és
  a visszaélés egy nyilvános demón ismert korlát, nem sebezhetőség.

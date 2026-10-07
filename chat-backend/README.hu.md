# chat-backend

[English version](./README.md) · **Magyar**

Chat API az önéletrajz oldalhoz: az egyik oldalon a látogatói widget, a másikon
az admin beérkező (inbox), középen a MySQL. Nincs külső szolgáltatás és nincs AI.

```
böngésző (widget)  --POST /api/chat-------------->  chat-backend  -->  MySQL
böngésző (widget)  --GET  /api/chat/messages----->  chat-backend  <--  MySQL
böngésző (/admin)  --GET  /api/admin/...--------->  chat-backend  <--  MySQL
```

A widget a `sessionId`-t a `localStorage`-ban tartja, így a látogató az
újratöltés után is látja a beszélgetését (a válaszokkal együtt). Amíg a chat
panel nyitva van, 3 másodpercenként polloz.

## Végpontok

| Metódus | Útvonal | Leírás |
| --- | --- | --- |
| `GET` | `/health`, `/api/health` | Állapotellenőrzés, az adatbázist is ellenőrzi (`{ ok: true, database: true }`). |
| `POST` | `/api/chat` | Látogatói üzenet: `{ sessionId?, message }` → `{ ok, sessionId, message }`. `sessionId` nélkül újat generál. |
| `GET` | `/api/chat/messages?sessionId=&afterId=` | A megadott id utáni üzenetek: `{ ok, messages, cursor }`. |
| `GET` | `/api/admin/conversations` | Inbox lista olvasatlan darabszámmal és az utolsó üzenettel. |
| `GET` | `/api/admin/conversations/:id/messages?afterId=` | Egy beszélgetés teljes szála. |
| `POST` | `/api/admin/conversations/:id/reply` | `{ message }` → `admin` üzenetként mentve. |

Minden `/api/admin/*` kéréshez kell `Authorization: Bearer <ADMIN_TOKEN>` (a
`/admin` oldal egyszer bekéri a tokent, és a `localStorage`-ban tárolja).

Az inbox **látogatónként egy sort** listáz (sessionenként), `#1`, `#2`, … 
sorszámmal az első üzenet időrendje szerint, a látogató IP-jével, az utolsó
üzenettel, az üzenetszámmal és egy olvasatlan jelvénnyel. Egy sor megnyitása
csak az adott látogató szálát mutatja, és a válasz is csak az ő widgetjébe
kerül.

## Oldal-szövegek

Az oldal minden látható szövege a `site_content` táblában van, és ezeket
szolgálja ki:

| Metódus | Útvonal | Leírás |
| --- | --- | --- |
| `GET` | `/api/content` | `{ ok, content: { key: value } }` — publikus, ezt olvassa az oldal. |
| `GET` | `/api/admin/content` | A katalógus címkékkel/csoportokkal és a tárolt értékekkel. |
| `PUT` | `/api/admin/content` | `{ values: { key: value } }` → upsert. A JSON mezők validálva vannak. |

A kulcsok és az alap szövegek a [`content.js`](./content.js) fájlban vannak, és
induláskor bekerülnek a `site_content` táblába (`INSERT IGNORE`, tehát az admin
szerkesztéseit soha nem írja felül; a katalógusból kikerült sorokat törli). A
`**szöveg**` félkövéren jelenik meg, a `json: true` mezők listákat tartalmaznak
(pl. a tapasztalat-kártyák).

## Környezeti változók

| Név | Leírás |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL kapcsolat. |
| `ADMIN_TOKEN` | Az `/api/admin/*` végpontokat védi. |
| `PORT` | Figyelt port (alapértelmezés: `3000`). |

## Adatbázis

`conversations` (id, időbélyegek, látogató ip/user-agent), `messages`
(id, conversation_id, `role` = `visitor`/`admin`, body, created_at) és
`site_content` (key, value, updated_at). A táblák induláskor automatikusan
létrejönnek; minden időbélyeg UTC-ben értendő.

## Helyi fejlesztés

```bash
npm install
DB_HOST=127.0.0.1 DB_NAME=cv_chat DB_USER=chat DB_PASSWORD=... ADMIN_TOKEN=dev npm start
```

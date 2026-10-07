// chat-backend/content.js
//
// The editable copy of the CV site. Every visible text of the site lives
// here as a *default*: the values are seeded into the `site_content` table on
// startup (existing rows are never overwritten), the site reads them through
// GET /api/content, and the admin page edits them.
//
// `json: true` fields hold a JSON value (lists, cards); everything else is a
// plain string. `**text**` marks a bold segment in the rendered output.

export const CONTENT_FIELDS = [
  // --- metadata ---------------------------------------------------------
  {
    key: 'metadata.title',
    group: 'Meta',
    label: 'Böngésző cím',
    value: 'Túri Csaba — DevOps és Rendszerüzemeltetési Szakember',
  },
  {
    key: 'metadata.description',
    group: 'Meta',
    label: 'Meta leírás',
    multiline: true,
    value:
      'Túri Csaba önéletrajza: DevOps és rendszerüzemeltetési szakember, automatizálásra, virtualizációra, konténerizációra és Linux infrastruktúrára fókuszálva.',
  },

  // --- general ----------------------------------------------------------
  {key: 'site.name', group: 'Általános', label: 'Név (logó, lábléc)', value: 'Túri Csaba'},
  {key: 'site.initials', group: 'Általános', label: 'Logó monogram', value: 'TC'},

  // --- menu -------------------------------------------------------------
  {key: 'nav.about', group: 'Menü', label: 'Rólam', value: 'Rólam'},
  {key: 'nav.skills', group: 'Menü', label: 'Kompetenciák', value: 'Kompetenciák'},
  {key: 'nav.experience', group: 'Menü', label: 'Tapasztalat', value: 'Tapasztalat'},
  {key: 'nav.contact', group: 'Menü', label: 'Kapcsolat', value: 'Kapcsolat'},
  {
    key: 'a11y.menu',
    group: 'Menü',
    label: 'Menü megnyitása (képernyőolvasó)',
    value: 'Menü megnyitása',
  },
  {
    key: 'a11y.closeMenu',
    group: 'Menü',
    label: 'Menü bezárása (képernyőolvasó)',
    value: 'Menü bezárása',
  },

  // --- hero -------------------------------------------------------------
  {key: 'hero.name', group: 'Főcím', label: 'Név / főcím', value: 'Túri Csaba vagyok'},
  {
    key: 'hero.roles',
    group: 'Főcím',
    label: 'Váltakozó szerepkörök (JSON lista)',
    json: true,
    value: [
      'Minőségbiztosítási & DevOps Szakember',
      'QA & Tesztautomatizálási Szakértő',
      'Webfejlesztő (PHP)',
    ],
  },
  {
    key: 'hero.subtitle',
    group: 'Főcím',
    label: 'Alcím',
    multiline: true,
    value:
      'Szoftverminőség, automatizálás és skálázható infrastruktúra a fejlesztéstől az üzemeltetésig.',
  },
  {key: 'hero.ctaPrimary', group: 'Főcím', label: 'Elsődleges gomb', value: 'Kapcsolatfelvétel'},
  {key: 'hero.ctaSecondary', group: 'Főcím', label: 'Másodlagos gomb', value: 'Kompetenciáim'},
  {key: 'hero.scroll', group: 'Főcím', label: 'Lejjebb görgetés felirat', value: 'Görgess lejjebb'},

  // --- about ------------------------------------------------------------
  {key: 'about.subtitle', group: 'Rólam', label: 'Felső cím', value: 'Szakmai összefoglaló'},
  {key: 'about.title', group: 'Rólam', label: 'Cím', value: 'Rólam'},
  {
    key: 'about.p1',
    group: 'Rólam',
    label: '1. bekezdés (**félkövér** jelölés használható)',
    multiline: true,
    value:
      'Több mint **8 év webes tesztelési** és **5+ év PHP fejlesztői** múlttal rendelkező technikai szakember vagyok, aki a szoftverminőség-biztosítást, a DevOps szemléletet és a rendszerarchitektúrát egyesíti.',
  },
  {
    key: 'about.p2',
    group: 'Rólam',
    label: '2. bekezdés (**félkövér** jelölés használható)',
    multiline: true,
    value:
      'Szakterületem a skálázható **CI/CD pipeline-ok**, **konténerizált (Docker, Minikube)** és **virtualizált (VMware, KVM)** infrastruktúrák kiépítése, valamint az automatizált E2E tesztelési keretrendszerek (Playwright, Robot Framework) tervezése. On-premise és felhős rendszerekben egyaránt a stabil, robusztus működésre és a folyamatok teljeskörű automatizálására törekszem.',
  },

  // --- skills -----------------------------------------------------------
  {
    key: 'skills.subtitle',
    group: 'Kompetenciák',
    label: 'Felső cím',
    value: 'Technológiák és eszközök, amelyekkel dolgozom',
  },
  {key: 'skills.title', group: 'Kompetenciák', label: 'Cím', value: 'Kiemelt Kompetenciák'},
  {key: 'skills.testing', group: 'Kompetenciák', label: 'Kategória: QA', value: 'Tesztautomatizálás & QA'},
  {key: 'skills.containers', group: 'Kompetenciák', label: 'Kategória: Konténer', value: 'Konténerizáció & DevOps'},
  {key: 'skills.virtualization', group: 'Kompetenciák', label: 'Kategória: Virtualizáció', value: 'Virtualizáció'},
  {key: 'skills.ai', group: 'Kompetenciák', label: 'Kategória: AI', value: 'AI & Workflow automatizálás'},
  {key: 'skills.os', group: 'Kompetenciák', label: 'Kategória: OS', value: 'Operációs Rendszerek'},
  {key: 'skills.programming', group: 'Kompetenciák', label: 'Kategória: Programozás', value: 'Programozás & Scripting'},
  {key: 'skills.databases', group: 'Kompetenciák', label: 'Kategória: Adatbázisok', value: 'Adatbázisok'},
  {key: 'skills.infrastructure', group: 'Kompetenciák', label: 'Kategória: Infrastruktúra', value: 'Infrastruktúra & Biztonság'},
  {key: 'skills.tools', group: 'Kompetenciák', label: 'Kategória: Eszközök', value: 'Eszközök & Rendszerek'},

  // --- experience -------------------------------------------------------
  {key: 'experience.subtitle', group: 'Tapasztalat', label: 'Felső cím', value: 'Amin dolgoztam'},
  {key: 'experience.title', group: 'Tapasztalat', label: 'Cím', value: 'Szakmai Tapasztalat & Projektek'},
  {
    key: 'experience.items',
    group: 'Tapasztalat',
    label: 'Kártyák (JSON lista: title, points[], tags[])',
    json: true,
    value: [
      {
        title: 'Tesztautomatizálás & QA',
        points: [
          'Több mint 8 év szoftvertesztelési tapasztalat.',
          'Tesztautomatizálás és automatizált tesztek készítése Katalon és Robot Framework segítségével.',
        ],
        tags: ['Katalon', 'Robot Framework', 'Tesztautomatizálás', 'QA'],
      },
      {
        title: 'Webfejlesztés',
        points: [
          'Több mint 5 év webfejlesztési tapasztalat.',
          'Fejlesztés PHP, HTML, CSS, JavaScript és MySQL technológiákkal.',
        ],
        tags: ['PHP', 'HTML', 'CSS', 'JavaScript', 'MySQL'],
      },
      {
        title: 'Infrastruktúra, Virtualizáció és Konténerizáció',
        points: [
          'Virtualizációs technológiák (VMware, KVM, QEMU) és konténer alapú rendszerek kezelése és karbantartása.',
          'Debian alapú szerverkörnyezetek üzemeltetése, automatizált backup és helyreállítási rutinok kialakítása.',
          'Különböző Linux disztribúciók (Debian, Arch, Ubuntu, CachyOS) adminisztrációja, hálózati hibaelhárítás.',
        ],
        tags: ['VMware', 'KVM', 'QEMU', 'Docker', 'Debian'],
      },
      {
        title: 'Automatizálás & CI/CD',
        points: [
          'Fejlesztési folyamatok integrációja és automatizálása Jenkins segítségével.',
          'Automatizált munkafolyamatok tervezése és implementálása.',
        ],
        tags: ['Jenkins', 'CI/CD', 'Automatizálás'],
      },
      {
        title: 'Szoftverfejlesztés & Rendszertervezés',
        points: [
          'Lokális-első szoftver infrastruktúra (szeged-tisza-ai-platform) docker-compose architektúrájának és monitoring végpontjainak kialakítása.',
          'Git repository-k optimalizálása, verziókezelési folyamatok racionalizálása.',
        ],
        tags: ['Docker Compose', 'Git', 'Monitoring'],
      },
    ],
  },

  // --- contact ----------------------------------------------------------
  {
    key: 'contact.subtitle',
    group: 'Kapcsolat',
    label: 'Felső cím',
    value: 'Építsünk együtt stabil és skálázható rendszert',
  },
  {key: 'contact.title', group: 'Kapcsolat', label: 'Cím', value: 'Kapcsolatfelvétel'},
  {key: 'contact.emailValue', group: 'Kapcsolat', label: 'E-mail cím', value: 'contact@turicsaba.hu'},

  // --- CV ---------------------------------------------------------------
  {key: 'cv.label', group: 'CV', label: 'Gomb felirat', value: 'CV letöltése'},

  // --- footer -----------------------------------------------------------
  {key: 'footer.rights', group: 'Lábléc', label: 'Jogok szövege', value: 'Minden jog fenntartva.'},

  // --- chat widget ------------------------------------------------------
  {key: 'chat.title', group: 'Chat', label: 'Ablak címe', value: 'Beszélgetés'},
  {
    key: 'chat.subtitle',
    group: 'Chat',
    label: 'Ablak alcíme',
    value: 'Írj üzenetet, a válasz itt jelenik meg.',
  },
  {key: 'chat.greeting', group: 'Chat', label: 'Köszöntés', value: 'Szia! Miben segíthetek?'},
  {key: 'chat.placeholder', group: 'Chat', label: 'Bemenet helykitöltő', value: 'Írd be az üzeneted…'},
  {key: 'chat.send', group: 'Chat', label: 'Küldés gomb', value: 'Küldés'},
  {key: 'chat.waiting', group: 'Chat', label: 'Várakozás szövege', value: 'Válaszra várok…'},
  {
    key: 'chat.error',
    group: 'Chat',
    label: 'Hibaüzenet',
    value: 'Nem sikerült elküldeni az üzenetet. Próbáld újra később.',
  },
  {key: 'chat.openLabel', group: 'Chat', label: 'Megnyitás (képernyőolvasó)', value: 'Chat megnyitása'},
  {key: 'chat.closeLabel', group: 'Chat', label: 'Bezárás (képernyőolvasó)', value: 'Chat bezárása'},

  // --- 404 --------------------------------------------------------------
  {key: 'notFound.title', group: '404 oldal', label: 'Cím', value: 'Az oldal nem található'},
  {
    key: 'notFound.description',
    group: '404 oldal',
    label: 'Leírás',
    multiline: true,
    value: 'A keresett oldal nem létezik, vagy elköltöztették.',
  },
  {key: 'notFound.home', group: '404 oldal', label: 'Vissza a főoldalra gomb', value: 'Vissza a főoldalra'},

  // --- notifications ----------------------------------------------------
  {
    key: 'notify.adminTitle',
    group: 'Értesítések',
    label: 'Admin értesítés címe (új látogató üzenet)',
    value: 'Új üzenet a chatban',
  },
  {
    key: 'notify.replyTitle',
    group: 'Értesítések',
    label: 'Látogatói értesítés címe (válasz érkezett)',
    value: 'Válasz érkezett',
  },
  {
    key: 'notify.replyBody',
    group: 'Értesítések',
    label: 'Látogatói értesítés szövege (ha a válasz üres)',
    value: 'Új üzenet a chatben.',
  },
  {
    key: 'notify.testTitle',
    group: 'Értesítések',
    label: 'Teszt értesítés címe (admin)',
    value: 'Teszt értesítés',
  },
  {
    key: 'notify.testBody',
    group: 'Értesítések',
    label: 'Teszt értesítés szövege (admin)',
    value: 'Ha ezt látod, az értesítések működnek.',
  },
  {
    key: 'notify.enable',
    group: 'Értesítések',
    label: 'Értesítés bekapcsolása gomb (chat ablak)',
    value: 'Szólj, ha válaszol',
  },
  {
    key: 'notify.on',
    group: 'Értesítések',
    label: 'Bekapcsolt értesítés jelzése',
    value: 'Értesítés bekapcsolva',
  },
  {
    key: 'notify.off',
    group: 'Értesítések',
    label: 'Értesítés kikapcsolása gomb',
    value: 'Értesítés kikapcsolása',
  },
  {
    key: 'notify.blocked',
    group: 'Értesítések',
    label: 'Értesítés: a böngésző blokkolja',
    value: 'A böngésző blokkolja az értesítéseket.',
  },
  {
    key: 'notify.unsupported',
    group: 'Értesítések',
    label: 'Értesítés: nem támogatott',
    value: 'Ez a böngésző nem támogatja az értesítéseket.',
  },
  {
    key: 'notify.insecure',
    group: 'Értesítések',
    label: 'Értesítés: csak HTTPS-en működik',
    value: 'Az értesítés csak HTTPS-en (vagy localhoston) működik.',
  },
  {
    key: 'notify.failed',
    group: 'Értesítések',
    label: 'Értesítés: hibaüzenet',
    value: 'Nem sikerült bekapcsolni az értesítést.',
  },

  // --- installable app (PWA) --------------------------------------------
  {key: 'pwa.install', group: 'Alkalmazás', label: 'Telepítés gomb', value: 'Telepítés'},
  {
    key: 'pwa.dismiss',
    group: 'Alkalmazás',
    label: 'Telepítési ajánlat bezárása (képernyőolvasó)',
    value: 'Ajánlat bezárása',
  },
];

/** The value as stored in MySQL: JSON fields are serialised. */
export function storedValue(field) {
  return typeof field.value === 'string' ? field.value : JSON.stringify(field.value);
}

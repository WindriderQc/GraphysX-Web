# NetX — le réseau de la maison en 3D (proposition, rien de construit)

> État : inventaire fait le 2026-10-26 (America/Toronto) contre l'inventaire réseau vivant
> d'AgentX Data et le code de la branche `claude/graphysx-center` du dépôt AgentX
> (`e1316c46`, worktree `~/codes/AgentX-worktrees/nestor-propose`). La copie
> `~/codes/AgentX-Ecosystem` est à `db71684b` (2026-09-20) et **ne contient pas** le travail
> réseau ; ne pas la lire pour ce sujet. Aucune ligne de GraphysX n'a changé.

DiskX a mis les disques en ville, Ecosystem a mis l'infrastructure en maison. Ce document
liste ce qu'AgentX sait faire côté réseau aujourd'hui, ce que l'inventaire vivant contient
vraiment, puis propose comment le poser en 3D selon le même patron (données pures → document
v2 par `api.create` → surface d'application → route lecture seule → smoke).

## 1. Ce qui existe côté AgentX

| Fonction | Où | Ce que ça donne |
| --- | --- | --- |
| **Collecteur natif** `network-agent.js` (net-1.1.0) | `integrations/data-collectors/` | Tourne sur un hôte qui voit vraiment le LAN. `nmap -sn` sur `192.168.2.0/24` toutes les 15 min (balayage), plus une **file de demandes à la demande** (TTL 2 min, 5 par poll) et un **battement de cœur** par collecteur (`network_scanners`, actif si vu depuis < 90 s). |
| **Magasin d'appareils** `network_devices` | `data/services/networkAgentService.js` | Par appareil : `ip`, `mac`, `vendor` (OUI), `hostname`, `status`, `firstSeen`, `lastSeen`, `scanSource` (quel point de vue l'a vu), `lastScanAt`, et les champs du propriétaire : `alias`, `notes`, `knownAt`, `hardware.type`, `location`. L'élagage (« passé hors ligne ») est **borné au même point de vue** : un collecteur ne déclare jamais hors ligne ce qu'un autre a vu. |
| **Sémantique temporelle** | `data/services/networkObservation.js` | Le drapeau `status: online` ne s'éteint jamais seul ; l'état réel est dérivé de l'âge de `lastSeen` : `online` (≤ 30 min = 2 × cadence), `recent` (≤ 24 h), `historical`, `never_confirmed`. Les fenêtres sont publiées dans `summary` avec leur source. |
| **Enrichissement** `nmap -O -sV --top-ports 100` | `data/services/networkScanner.js` | OS probable + ports ouverts → `hardware.os`, `openPorts[]`. Exige nmap **dans** le conteneur Data : `capability.nmap = false` en production, la Toolbox ne l'expose pas, **0 appareil enrichi**. |
| **Onglet Network de la Toolbox** | `core/surfaces/data-toolbox/public/network-tools.js` | Collecteurs (actifs puis silencieux), demander un scan et suivre la tâche, **éditer un appareil** (nom, drapeau « connu », type parmi 8, emplacement, notes ; bornes 80/80/500), recherche, filtres `all / unnamed / online / new 24 h / unacknowledged`, tri. |
| **Lecture Nestor** `network_devices` | `core/src/services/networkInventory.js`, `household/secretary-mcp.js` | Vue compacte (≤ 50 appareils, portée `online / unknown / all`) avec une **phrase de fraîcheur** en français (« Dernier scan il y a 7 min » / « Inventaire périmé … »). |
| **Veille des nouveaux appareils** | `core/src/services/networkDeviceWatch.js` + règle `network-new-device` | Opt-in (`NETWORK_DEVICE_WATCH_MS`). Un MAC jamais observé, sans alias ni `knownAt` → une alerte, une seule fois, portant une **devinette du modèle** (`ops_watch`, « Probably a Chromecast; suggested name: salon-tv. »). La devinette vit dans l'alerte, pas dans la fiche de l'appareil. |
| **Journal d'activité** | `data/services/activityEvents.js` | `network.device_first_seen` (regroupé au-delà de 25 par balayage), `collector.first_seen / silent / back`, `scan.queued / started / finished / expired`. |
| **Registre IoT (MQTT)** | `data/routes/iot.routes.js` | Appareils qui parlent sur le broker : profils, commandes GPIO et reboot, minuteries, historique et direct. **Aucune clé de jointure** (ni IP ni MAC) avec `network_devices` aujourd'hui. |
| **Carte Ecosystem** (GraphysX) | `src/ecosystem-data.ts` | 27 nœuds `eco-node:<id>` dessinés sans aucune adresse, par choix. Le crochet « les alertes viendront s'accrocher » est annoncé dans `ECOSYSTEM_VIEW.md`. |

Accès depuis GraphysX : le même gateway que DiskX, sans CORS, donc par une route de même
origine (`scripts/diskx-server.mjs` ne relaie aujourd'hui que `storage/*`). Les lectures
utiles sont `GET /api/data-toolbox/network/devices`, `/network/agents`, `/network/capability`.
Les deux écritures existantes (`PATCH /network/devices/:mac`, `POST /network/scan`) sont
déjà relayées par Core avec leurs bornes.

## 2. Ce que l'inventaire vivant contient (2026-10-26 12:25 America/Toronto)

| Mesure | Valeur |
| --- | --- |
| Appareils | 55 (31 `online`, 3 `recent`, 21 `historical`, 0 `never_confirmed`) ; `reportedOnline` dit 55 — le drapeau brut ment, d'où la classification |
| Collecteurs | 3 enregistrés, **1 actif** : `ugfrank` (linux, non privilégié, dernier balayage 12:18). `ugbrutal` muet depuis le 2026-09-10, `ugalien` depuis le 2026-06-25 |
| Points de vue | 48 vus par ugfrank, 6 seulement par ugbrutal, 1 seulement par ugalien (ces 7 ne peuvent plus être confirmés) |
| Fabricants | Espressif 8, Raspberry Pi 8, Google 4, Microsoft 4, Samsung 3, Sony 2, Asus 2, TP-Link 2, puis Amazon, Dell, Apple, Oculus, HP, Netgear, Intel… ; **13 sans fabricant** (MAC aléatoires de téléphones, très probablement) |
| Champs du propriétaire | **2 alias** (`octopi-ethernet`, `octopi-wifi`), 0 « connu », 0 emplacement, 2 noms d'hôte, 0 OS, 0 port |
| Types | 2, tous `3d-printer-controller` — qui **n'est pas** dans la liste des 8 types de la Toolbox (posé avant la borne) |
| Nouveaux | 8 apparus dans les 7 derniers jours ; premier appareil le 2026-06-21 |
| IoT | 2 appareils MQTT (`cluster-powerbar`, `ESP_15605`), sans IP ni MAC |

Lecture honnête : le jour un, la vue 3D montrera **53 caisses anonymes sur 55**. C'est la
valeur, pas un défaut : rien ne rend « 53 appareils sans nom » plus visible qu'un quartier de
caisses marquées « ? ». Mais ça décide de la v2 (nommer depuis la 3D).

## 3. Proposition : `?app=netx`

Même squelette que Ecosystem (1 400 lignes, une session) :

| Rôle | Fichier proposé |
| --- | --- |
| Modèle pur : normaliser les appareils, classer, grouper par fabricant/type/état, placer | `src/netx-data.ts` |
| Document v2 : routeur, anneaux, appareils, phares des collecteurs, balises | `src/netx-scene.ts` |
| Source : `/diskx-api/network/*` en LAN, capture **synthétique** hors LAN | `src/netx-source.ts`, `src/netx-fixture.json` |
| Surface : HUD, fiche au clic, filtres, étiquettes projetées, caméra, `play=` | `src/netx-app.ts`, `src/netx.css` |
| Route : étendre l'allowlist de `diskx-server.mjs` à `network/devices|agents|capability` (GET) | `scripts/diskx-server.mjs` |
| Tests Node + smoke ; `?app=netx` dans `main.ts` ; `<agentx-netx>` dans `embed/diskx.js` | `test/netx.test.mjs`, `scripts/smoke-netx.mjs` |

Chaque appareil est un `api.create` ordinaire dont les tags portent `netx-device:<mac>`
(ou `netx-device:ip:<ip>` sans MAC), `netx-state:online`, `netx-vendor:espressif`,
`netx-type:iot`, `netx-source:ugfrank`. Un agent lit « qui est en ligne » avec
`api.query({ tag: "netx-state:online" })`. Halo, étiquettes, caméra et fiche sont de la
présentation ; le document ne change pas pendant la visite (le smoke le compare).

### 3.1 La forme : le quartier autour du routeur (recommandé)

- **Le Deco X90 au centre**, repris de la maison Ecosystem (même primitives, même couleur).
- **Position d'un appareil = déterministe depuis l'IP** : angle = dernier octet / 256 × 2π.
  Un appareil garde sa place d'un balayage à l'autre, et les plages DHCP se lisent comme des
  arcs pleins ou vides. (La grille 16 × 16 des 256 adresses, façon ville DiskX, est
  l'alternative : plus lisible pour la densité, moins pour les relations. On peut la garder
  comme texture au sol.)
- **Rayon = état d'observation** : `online` sur l'anneau intérieur, `recent` au milieu,
  `historical` à l'extérieur, en estompé. Un appareil qui se tait **dérive vers l'extérieur**
  au fil des balayages ; c'est la sémantique temporelle de Data rendue spatiale.
- **Corps = type** quand il est connu (tour, dalle de téléphone, carte Pi sur
  `electronic-board`, palet IoT, imprimante, boîte média, équipement réseau), sinon **une
  caisse translucide « ? »** ; la teinte vient du fabricant, le halo de l'état. Un type
  inconnu de la liste (le `3d-printer-controller` vu en production) retombe sur `other`.
- **Vocabulaire déjà appris** : balise ambre pulsante = nouveau depuis 24 h (comme les points
  ouverts d'Ecosystem) ; cage pointillée = sans nom ni drapeau « connu » (« à confirmer ») ;
  plein = nommé ou connu.
- **Les collecteurs sont des phares** posés à leur IP : `ugfrank` balaie un faisceau au rythme
  de son `lastScanAt` ; `ugbrutal` et `ugalien` sont éteints, avec la date de leur dernier
  balayage sur l'étiquette. Les 7 appareils qu'eux seuls ont vus sont teintés de leur phare.
- **Les 13 sans fabricant et historiques** vont dans une **zone « passages »** regroupée, pas
  un bâtiment chacun pour toujours : ce sont presque sûrement des MAC aléatoires qui ne
  reviendront jamais sous ce nom.

### 3.2 Les fonctions, une à une

| Fonction AgentX | En 3D |
| --- | --- |
| Fraîcheur (`networkInventory`) | Bandeau du HUD, la phrase même de Nestor : « Dernier scan il y a 7 min » ; « Inventaire périmé » rend toute la scène grise. |
| Classification temporelle | Rayon de l'anneau + estompage ; les compteurs 31 / 3 / 21 dans le HUD, avec les fenêtres (30 min, 24 h) écrites, pas cachées. |
| Filtres Toolbox (`all / unnamed / online / new / unacknowledged`) | Les mêmes cinq jetons ; le reste de la scène s'assombrit. Recherche = même pelote (alias, hôte, IP, MAC sous ses trois graphies, fabricant, type, emplacement). |
| Fiche appareil | Au clic, comme Ecosystem : IP, MAC, fabricant, hôte, alias, état et âge, premier/dernier vu, point de vue, type, emplacement, notes. |
| Points de vue multiples | Phares et teinte des appareils vus par un seul collecteur ; `Scanner maintenant` en v2. |
| Nouveaux appareils (alerte + devinette) | Balise ambre. La devinette du modèle n'est **pas** dans la fiche Data aujourd'hui : soit Core la stocke sur l'appareil (changement AgentX, petit), soit la fiche dit « pas de devinette ». |
| Enrichissement (OS, ports) | Portes lumineuses sur le corps quand `openPorts` existe ; aujourd'hui 0, et le collecteur ne sait pas enrichir à la demande. Hors v1. |
| Nestor | `play=` comme Ecosystem : `overview, new, unknown, offline, vendors, collectors, device-<mac>` ; Nestor compose la liste depuis sa réponse `network_devices` ; `<agentx-netx>` publie le reçu de présentation (`state().presentation`) comme `<agentx-ecosystem>`. |
| Nommer, marquer connu, typer, situer | **v2.** Les écritures sont déjà relayées et bornées par Core ; il faudrait ouvrir la route GraphysX au `PATCH` et un petit formulaire sur la fiche. C'est là que la vue paye : on nomme ce qu'on voit, la cage pointillée tombe. |
| IoT MQTT (profils, GPIO, minuteries) | Hors v1 : aucune jointure IP/MAC entre `iot/devices` et `network_devices`. Les 8 Espressif resteraient des palets sans vie tant que Data n'écrit pas le MAC des appareils MQTT. |
| Carte Ecosystem | v3 : un `mac` ou `ip` optionnel et `adapted` sur l'`EcoNode`, et la maison s'allume avec le vivant ; les appareils sans nœud restent des visiteurs dans le quartier. C'est le crochet annoncé dans `ECOSYSTEM_VIEW.md`. |

### 3.3 Ce qui manque et qui n'est pas du GraphysX

1. La devinette du modèle n'est écrite nulle part sur l'appareil (Core).
2. L'enrichissement n'est pas un type de demande de la file du collecteur (Data + collecteur).
3. Pas de clé de jointure IoT ↔ réseau (Data).
4. Deux collecteurs sur trois sont muets ; la vue le montrera, elle ne le réparera pas.
5. Aucun historique au-delà de `firstSeen` / `lastSeen` : pas de rejouage dans le temps en v1.

### 3.4 Règles qui ne se discutent pas

- **Le site public ne publie jamais une vraie MAC ni une vraie IP.** La capture embarquée est
  synthétique (55 appareils inventés, mêmes proportions), comme la capture DiskX distribuée.
- Lecture seule en v1, écritures bornées par Core en v2 ; aucune commande réseau depuis la 3D.
- Un seul `requestAnimationFrame`, celui du monde ; l'embed suit l'exception documentée.
- Aucun nom de modèle, aucune capacité inventée : ce qui n'est pas dans Data n'est pas dessiné.

## 3.5 État de la construction (2026-10-26 America/Toronto)

La v1 lecture seule est construite dans la branche `claude/network-3d-view-a0bd9c` : modèle,
capture synthétique, source, scène, application, relais, câblage `?app=netx` et bouton
d'accueil, tests Node et smoke. Ce qui tourne et comment le vérifier est dans [NETX.md](NETX.md) ;
ce document reste la conception et la liste de ce qui attend côté AgentX (§ 3.3).

## 4. Vérification prévue

`node --test test/netx.test.mjs` : classification reprise à l'identique de Data (mêmes fenêtres,
mêmes quatre états), placement déterministe (deux balayages → mêmes positions), un type hors
liste → `other`, les sans-MAC adressés par IP, document v2 cohérent, aucune vraie adresse dans
la capture. `npm run smoke:netx` après `npm run build` : quartier depuis la capture, 55 entités
taguées, clic 3D sur une caisse → fiche, jeton `online` → 31 restent allumés, document inchangé
avant/après, retour au Center. Captures dans `output/verify/netx-*.png` ; les regarder.

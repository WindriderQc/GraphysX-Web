# L'île — l'île Clawblox avec le rendu GraphysX

`?app=island` affiche l'île « Is this machine playing? » reconstruite dans Clawblox (moteur
Rust/Rapier, protocole agent HTTP) avec le rendu de GraphysX : ciel, eau réfléchissante,
ombres, matériaux, interface. **Clawblox reste l'autorité** de la physique et de l'agent :
cette page ne simule rien, elle dessine l'état que Clawblox diffuse.

Depuis le 2026-10-29 (phase 3 du service de monde), la même page affiche aussi une île
**du service de monde GraphysX** (`world-service/`), en direct ou en reprise : seule l'adresse
`source=` change (section suivante).

## Ouvrir la vue

Sur devX, dans ce dépôt :

```bash
npx vite --host 0.0.0.0 --port 4231
```

puis, depuis un navigateur du réseau local :

| Ce qu'on veut voir | Adresse |
| --- | --- |
| Essai 1 (reprise, port 18090) | `http://192.168.2.117:4231/?app=island&source=http://192.168.2.117:18090` |
| Essai 2 (reprise, port 18091) | `http://192.168.2.117:4231/?app=island&source=http://192.168.2.117:18091` |
| Une île en direct (`clawblox run … --port 18086`) | `http://192.168.2.117:4231/?app=island&source=http://192.168.2.117:18086#spectator_token=<jeton>` |
| Sans serveur : courte capture réelle en boucle | `http://192.168.2.117:4231/?app=island` |

- `source=` est l'adresse d'un `clawblox run` (direct) ou d'un `clawblox replay` (reprise).
  La page le reconnaît seule : une reprise répond à `/replay/info`, un monde en direct non.
- Le jeton spectateur d'un monde en direct passe dans le **fragment** (`#spectator_token=…`),
  jamais dans la query string. `clawblox run` l'affiche au démarrage ; on peut le fixer avec
  `WORLD_SPECTATOR_TOKEN`.
- `embed=1` retire le bouton Quitter et compacte l'en-tête (pour l'onglet « Île » de Benchmark).

## Une île du service de monde GraphysX

Le service de monde (`world-service/`, docs/WORLD_SERVICE_DESIGN.md) parle le protocole agent
de Clawblox, mais diffuse ses spectateurs autrement : un flux SSE `GET /spectate` (document v2
au départ, poses 10 fois par seconde, ajouts et retraits d'objets, actions des agents). La page
le reconnaît seule : `GET /healthz` répond `{ok, tick}` **et** `GET /spectate` répond
`text/event-stream`. Un serveur Clawblox répond 404 à `/healthz` et garde son chemin d'avant.

Sur devX (exemple, ports libres au moment de l'essai) :

```bash
npm run build:world-service
npm run serve:world -- --host 0.0.0.0 --port 18140 --record --record-dir /tmp/ile/rec
node world-service/replay.mjs /tmp/ile/rec --host 0.0.0.0 --port 18141   # reprise de cet enregistrement
npx vite --host 0.0.0.0 --port 18143
```

| Ce qu'on veut voir | Adresse |
| --- | --- |
| L'île en direct, caméra sur Eko | `http://192.168.2.117:18143/?app=island&source=http://192.168.2.117:18140&agent=Eko` |
| La reprise de l'enregistrement | `http://192.168.2.117:18143/?app=island&source=http://192.168.2.117:18141&agent=Eko` |
| Comme l'onglet « Île » de Benchmark | ajouter `&embed=1` |

Le contrat de l'onglet « Île » (AgentX#1179,
`<vue>/?app=island&embed=1&source=<base>[#spectator_token=…]&agent=<nom>`) fonctionne tel quel :
il suffit que `source` désigne le service de monde ou sa reprise. Le service n'a pas de jeton
spectateur ; un `#spectator_token=` éventuel est ignoré.

Ce qui change par rapport à une île Clawblox :

- **Le document vient du serveur.** La page charge le document v2 reçu (`hello`) dans une
  portée transitoire (`graphysx-world`, étiquette `world-part`), sans `physics` et avec la
  physique locale **en pause** : rien ne simule ici. Elle garde l'apparence du document et ne
  complète que ce qu'il ne dit pas (ciel `clearblue`, éclairage, distances de brouillard).
- **Les poses** arrivent 10 fois par seconde ; la page les place avec `applyHostPoses` (sans
  révision ni annulation), interpolées environ 150 ms en arrière.
- **Les objets qui apparaissent ou disparaissent** (cubes d'ardoise de l'impact du rocher,
  blocs tombés hors de l'île, agent qui arrive) mettent la portée à jour.
- **`&agent=<nom>`** choisit l'agent suivi ; s'il y a plusieurs sessions de ce nom (un monde
  qui dure garde les anciennes), la plus récente. Sans nom : le premier arrivé.
- **Panneau** : chaque action de l'agent avec son résultat (`Pickup (14.2, 0.4, -2.1) →
  PickupSuccess`). Un déplacement ou un saut ne change pas `LastActionResult` (comme dans
  Clawblox) : la page ne lui accole donc pas un résultat ancien.
- **Reprise** : `world-service/replay.mjs` répond comme `clawblox replay` (`/replay/info`,
  lecture, pause, recherche, vitesse, saut des temps morts, lecture partagée par tous). Après
  chaque recherche, le serveur renvoie le document à ce tick : la page repart de là. Ouverte en
  `embed=1` au début d'une reprise en pause, la page la lance elle-même en sautant l'attente
  avant la première action, comme pour Clawblox. Le journal des actions vient de
  `/replay/actions`.
- Les murs de bordure de Mesa sont invisibles, comme dans Clawblox.

Captures du 2026-10-29 vers 11:15 America/Toronto (devX, Chromium sans écran, monde réel avec un
agent « Eko » piloté sans modèle par le smoke) :

| | |
| --- | --- |
| Direct : Eko a posé un bloc et lancé le rocher (cubes d'impact) | ![direct](island-view/world-live.jpg) |
| Ce que voit Eko (`GET /observe/image`, 1088×640) | ![vue d'Eko](island-view/world-eko-view.jpg) |
| Reprise en pause juste après l'impact | ![reprise](island-view/world-replay.jpg) |
| Téléphone (375 px), panneau replié | ![téléphone](island-view/world-phone.jpg) |

## Captures (2026-10-29, devX, Chromium sans écran)

| | |
| --- | --- |
| Reprise de l'essai 1 (panneau Messages retiré : journal réel de l'agent) | ![essai 1](island-view/replay-trial1.jpg) |
| Reprise de l'essai 2 (idem) | ![essai 2](island-view/replay-trial2.jpg) |
| Île en direct, sans agent | ![direct](island-view/live-no-agent.jpg) |
| Caméra qui suit Eko (capture de démonstration, messages synthétiques) | ![suivre](island-view/follow-carrying.jpg) |
| Téléphone (375 px), panneau replié | ![téléphone replié](island-view/phone-folded.jpg) |
| Téléphone (375 px), panneau ouvert | ![téléphone](island-view/phone.jpg) |
| 4K (3840 px, réduite ici à 1920) | ![4K](island-view/4k.jpg) |

## Ce que montre la page

- Chaque pièce visible de Clawblox devient une entité GraphysX ordinaire : océan → `water`
  (réfléchissante, prolongée jusqu'à l'horizon), sol → dalle d'herbe, mesa → grès coiffé
  d'herbe, objets → cubes de leur couleur, rocher → `icosahedron`, anneau → `torus` à plat,
  agent → avatar `agent` GraphysX debout sur la base du personnage Clawblox (5 unités).
  Les quatre murs invisibles ne sont pas dessinés.
- Toutes ces entités vivent dans une portée transitoire (`clawblox-island`) : elles utilisent
  le même moteur de rendu que les scènes de GraphysX mais n'entrent jamais dans le document
  ni dans l'historique. `api.query({ tag: "island-part" })` les liste.
- Les positions sont interpolées entre deux états reçus (100 ms de retard), dans la boucle
  d'image unique de l'hôte. Un saut de tick (recherche dans une reprise, remise à zéro du
  monde) vide le tampon.
- Les dalles de sol qui se chevauchent sont dessinées quelques centimètres plus bas, de la
  plus grande à la plus petite, pour éviter le scintillement des textures superposées. Rien
  de ce qui repose sur le sol ne bouge.
- Panneau **Messages** : en reprise lancée avec `--agent`, ce que l'agent dit et les outils
  qu'il appelle (résumé), jusqu'au tick affiché. En direct : les messages de clavardage du
  monde ; le journal de l'agent n'existe qu'en reprise.
- Une seule vue 3D plein écran, sans menu : pas de barre de navigation, pas de réglages
  d'affichage de l'hôte, pas d'outil de débogage.
- La caméra **suit l'agent par défaut** ; glisser tourne librement autour de lui. Un clic sur
  la carte de l'agent (« suivie » / « libre ») libère la caméra vers la vue d'ensemble, un
  second clic la remet sur lui.
- Un seul panneau repliable (pensées de l'agent), ouvert sur ordinateur, replié sur téléphone.
- Barre de lecture compacte (reprise seulement) : lecture/pause, position, vitesse ×1 à ×8.
- Téléphone (lisible dès 375 px) : le panneau devient une feuille en bas. Écran 4K : même mise en page,
  texte et contrôles ×1,6 (≥ 2400 px) ou ×2 (≥ 3400 px).

## Deux comportements de Clawblox à connaître

- Les contrôles de reprise (`/replay/play`, `/pause`, `/seek`, `/speed`) appartiennent au
  serveur de reprise : ils changent la lecture pour **tous** ceux qui la regardent.
- Chaque connexion WebSocket à une reprise fait avancer la lecture d'une image
  (`handle_replay_ws` appelle `advance_frame` par client). Deux spectateurs ouverts
  accélèrent donc la reprise. C'est vrai aussi de l'interface Clawblox d'origine.

## Pourquoi une application GraphysX plutôt qu'un rendu Clawblox

Clawblox charge un module de rendu Three.js par monde (`worlds/mesa-island/renderer`), et ce
même module sert à la **vision de l'agent** : `src/capture.rs` photographie la page spectateur
dans un Chromium sans écran (SwiftShader) pour `GET /observe/image`. Remplacer ce module
changerait ce que voit Eko d'un essai à l'autre et alourdirait ses captures. Un rendu à part
pour les seules reprises (`--world-dir` vers un autre dossier) ne servirait pas le direct.

L'application GraphysX, elle, réutilise directement l'eau, les ciels, l'éclairage, les ombres,
les profils de rendu, l'interface mobile et les entités transitoires du produit ; elle
fonctionne en direct comme en reprise, parce que `clawblox run` et `clawblox replay` servent
tous deux `/spectate/ws` avec un CORS ouvert ; et elle ne demande aucune modification de
Clawblox. À l'étape 3, seule la source change : la vue restera la même.

## Où vivent les choses

| Rôle | Fichier |
| --- | --- |
| Pur : flux Clawblox (état complet, deltas), correspondance pièce → entité, interpolation, messages | `src/island-feed.ts` |
| Pur : flux du service de monde GraphysX (hello, poses, ajouts/retraits, actions), interpolation, panneau | `src/island-world-feed.ts` |
| Surface : connexion, HUD, panneau, transport, caméra, boucle d'image | `src/island-app.ts`, `src/island.css` |
| Capture réelle en boucle (géométrie et pose de l'agent, ticks 60000-61200 de l'essai 1 ; messages synthétiques) | `src/island-fixture.json` |
| Tests Node et smoke navigateur | `test/island.test.mjs`, `scripts/smoke-island.mjs` |
| Idem pour le service de monde (direct, images, reprise contre un vrai monde) | `test/island-world-feed.test.mjs`, `test/world-replay.test.mjs`, `scripts/smoke-island-world.mjs` |

Le smoke accepte des serveurs réels pour produire des captures locales :
`ISLAND_SOURCES=http://localhost:18094,http://localhost:18086#spectator_token=… node scripts/smoke-island.mjs`
(avec `SMOKE_BASE=http://localhost:4231/` contre le serveur de dev). Ce n'est jamais une
étape de CI.

## Limites connues

- Pas de déploiement : la page publique est en HTTPS et ne peut pas ouvrir un `ws://` du
  réseau local. Une intégration HTTPS passera par un relais de même origine.
- L'avatar est l'avatar GraphysX, pas le modèle `player.glb` de Clawblox ; il n'a pas
  d'animation de marche.
- Pas de son, pas de bulles de dialogue au-dessus de l'agent.

# L'île — l'île Clawblox avec le rendu GraphysX

`?app=island` affiche l'île « Is this machine playing? » reconstruite dans Clawblox (moteur
Rust/Rapier, protocole agent HTTP) avec le rendu de GraphysX : ciel, eau réfléchissante,
ombres, matériaux, interface. **Clawblox reste l'autorité** de la physique et de l'agent :
cette page ne simule rien, elle dessine l'état que Clawblox diffuse. C'est l'étape 1 de 3
(1 : cette vue ; 2 : un service de monde GraphysX sans écran qui parle le protocole
Clawblox ; 3 : plus tard, l'île dans ce service).

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

## Captures (2026-10-29, devX, Chromium sans écran)

| | |
| --- | --- |
| Reprise de l'essai 1 (panneau Messages retiré : journal réel de l'agent) | ![essai 1](island-view/replay-trial1.jpg) |
| Reprise de l'essai 2 (idem) | ![essai 2](island-view/replay-trial2.jpg) |
| Île en direct, sans agent | ![direct](island-view/live-no-agent.jpg) |
| Suivre : Eko porte un bloc (capture de démonstration, messages synthétiques) | ![suivre](island-view/follow-carrying.jpg) |
| Téléphone (390 px), feuille ouverte | ![téléphone](island-view/phone.jpg) |
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
- Barre de lecture (reprise seulement) : lecture/pause, position, vitesse ×1 à ×8.
- **Suivre** garde l'agent au centre tout en laissant tourner la caméra ; **Vue d'ensemble**
  recadre l'île.
- Téléphone : le panneau devient une feuille repliée en bas. Écran 4K : même mise en page,
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
| Surface : connexion, HUD, panneau, transport, caméra, boucle d'image | `src/island-app.ts`, `src/island.css` |
| Capture réelle en boucle (géométrie et pose de l'agent, ticks 60000-61200 de l'essai 1 ; messages synthétiques) | `src/island-fixture.json` |
| Tests Node et smoke navigateur | `test/island.test.mjs`, `scripts/smoke-island.mjs` |

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

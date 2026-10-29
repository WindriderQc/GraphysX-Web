# Service de monde GraphysX : conception, phases 1 et 2

Rédigé le 2026-10-29 vers 02:30 America/Toronto ; mis à jour le 2026-10-29 vers
04:00 America/Toronto après les phases 1 et 2. Rien n'est déployé, le site
public n'est pas touché, le MCP GraphysX reste éteint et aucun modèle n'a été
appelé. L'hébergement sur UGFrank reste à décider.

## Décisions du propriétaire (2026-10-29)

- **Suivre la recommandation** : phases 1 et 2 sur devX, sans modèle, puis
  décider de l'hébergement avec un service qui marche. Fait (section suivante).
- **Vue image : oui.** Une image de la caméra 3D à la première personne, comme
  une capture d'écran. Elle arrive avec le spectateur (phase 3).
- **UGStation** est sous Linux Mint, compte `yb` (registre matériel corrigé
  dans agentx-home#277).
- **Corriger nos défauts** : le test sans modèle du kit lisait une clé qui
  n'existe pas et poussait le bloc avant de le saisir. Corrigé dans
  WindriderQc/AgentX#1177 (empilée sur #1175, où le test a déménagé) ; il passe
  maintenant sur Clawblox **et** sur GraphysX.

## État après les phases 1 et 2

| Pièce | Où | État |
|---|---|---|
| Profil sans tête : particules, eau, surfaces deviennent des textures inertes | `src/headless.ts` et trois appels | ✔ les 10 scènes de démarrage chargent et simulent dans Node |
| Collisions des modèles lues depuis le disque | `setAgentWorldAssetFetch` (`src/agent-world-assets.ts`) | ✔ la bille de « great slide » roule sur le modèle (sans : elle tombe à y = −60) |
| Points d'accès du moteur | `PhysicsEngine` : `setBodyMotion`, `setBodyCollision`, `writeKinematicTarget`, `overlapsBox`, `readContacts`, personnages, `saveState` / `stateId` / `restoreState` | ✔ testés seuls |
| Points d'accès du runtime | `hostBody` (et `@ground`), `hostRestoreClock`, `applyHostPoses` (sans révision ni événement) | ✔ |
| Service | `world-service/` (règles TypeScript sans E/S + serveur Node) ; `npm run build:world-service`, `npm run serve:world` | ✔ |
| Règles Mesa complètes | marche, saut, saisie, portage, pose, lancer, **impact du rocher** (cubes d'ardoise), vraies propriétés physiques de `main.lua` | ✔ |
| Avatars | chaque agent est une entité `agent` du document : un spectateur l'affiche sans code spécial | ✔ |
| Sauvegarde et reprise exactes | `GET /snapshot` (jeton opérateur), `--resume` / `WORLD_RESUME_PATH` ; même jeton `X-Session` après reprise ; refus d'un autre monde | ✔ identique au bit près après reprise en pleine marche, portage, pose et lancer |
| Flux spectateur | `/spectate` : `hello`, `frame` 10 Hz, `entities` (ajouts/retraits) ; 32 lecteurs max ; battement 25 s | ✔ |
| Enregistrement | NDJSON : document, images, changements, actions avec leur résultat | ✔ |
| Tests | `test/world-service.test.mjs` (16 tests, ~3,6 s, construit le paquet lui-même) | ✔ dans la suite `npm test` |

Vérifié sur devX, sans modèle :

- `clawblox run world-service` lance le service ; le test corrigé du kit y
  saisit et pose un bloc (`PickupSuccess`, `PlaceSuccess`, OK) ;
- `clawblox run world-service --resume <snapshot>` reprend la partie : le même
  jeton de session observe le bloc posé et `LastActionResult: PlaceSuccess` ;
- coût mesuré (`node world-service/bench.mjs`) : 0,15 ms par pas avec 1 agent,
  0,31 ms avec 8, 0,72 ms avec 16 (≈ 4 % d'un cœur) ; image spectateur 0,7 à
  1,4 Ko ; sauvegarde 85 à 116 Ko.

Une règle de vérification (`scripts/verify-impact.mjs`) limite désormais un
changement de `world-service/` aux tests Node, sans déploiement ; un changement
du runtime partagé garde la vérification complète.

## En bref (conception initiale)

- **Le runtime de scène de GraphysX tourne déjà dans Node, sans navigateur.**
  `AgentWorldRuntime` (le même code que l'onglet) se construit et simule une île
  sans aucune adaptation : 15 ms pour la construire, 21 ms pour simuler 3 s.
  Huit scènes de démarrage sur dix et la scène du village passent aussi ; les
  deux échecs viennent de textures dessinées sur un `canvas`.
- **Le prototype** (devenu `world-service/`) refait l'île Mesa de Clawblox en
  document `agent-world/v2`, la simule à pas fixe de 1/60 s et parle le
  protocole Clawblox (`/join`, `/observe`, `/input`, `/chat`, `/api.md`). Un
  contrôleur de personnage Rapier donne MoveTo, Jump, Stop, Pickup, Place,
  Throw et le portage, avec les mêmes règles et les mêmes messages
  `LastActionResult` que `mesa-island/main.lua`.
- **Les agents Eko n'ont rien à changer** : le test sans modèle du kit Eko
  (`work/island/smoke_island.py` d'agentx-home) tourne tel quel contre le
  prototype, et `clawblox run` lance le monde GraphysX comme monde externe.
- **Coût mesuré sur devX** (Ryzen 7 3700X) : 0,09 ms par pas avec 1 agent,
  0,53 ms avec 16 (≈ 3 % d'un cœur à 60 pas/s) ; 119 Mo de mémoire ; 7 à 14 Ko/s
  par spectateur. Pas de GPU.
- **Estimation** : 9 à 13 jours de session pour un service complet sur UGFrank,
  contre 3 à 5 jours pour l'option économique (Clawblox reste le monde,
  GraphysX ne fait que l'affichage). Le travail d'affichage sert dans les deux
  cas.

## Où chaque morceau vivrait

```
UGStation (agents)                 UGFrank (Docker, derrière Caddy)          UGAlien
┌──────────────────────┐           ┌──────────────────────────────────┐
│ run_eko.py           │  HTTP     │ graphysx-world (Node, 1 conteneur)│
│  Codex « Eko »  ─────┼──────────►│  boucle fixe 60 Hz                │
│  bac à sable bwrap   │ /join     │  AgentWorldRuntime + Rapier WASM  │
│  (relais réseau)     │ /observe  │  règles du monde (Mesa)           │
│        │             │ /input    │  /spectate (SSE)  /snapshot       │
│        └─────────────┼──┐        │  volume /data : enregistrements   │
└──────────────────────┘  │        └───────────────┬──────────────────┘
                          │                        │ SSE (poses 10 Hz)
                          │                        ▼
                          │        navigateurs : cuisine (UGSmall), téléphones,
                          │        onglet « Île » de Benchmark
                          │
                          └──────► Core /api/llm/v1 ──────────────────────► agentx-primary
```

Le monde ne parle jamais au modèle. Il reçoit des actions HTTP et renvoie des
observations ; ce que l'agent pense passe par Core, comme aujourd'hui.

## 1. Séparer la simulation de l'affichage

### Aujourd'hui

Dans l'onglet, l'unique boucle d'images appelle `runtime.update(dt)`, qui fait
avancer les comportements, puis `physicsWorld.step(dt, { fixedTimeStep: 1/60,
maxSubSteps: 4 })`, puis relit les positions des corps dynamiques dans les
objets Three.js. Le rendu WebGL vient après, ailleurs.

### Ce que le prototype a mesuré

Trois faits rendent la séparation simple :

1. **La physique est déjà derrière une interface neutre.**
   `src/physics/physics-engine.ts` ne connaît ni Three.js ni le navigateur ;
   `RapierPhysicsEngine` n'importe que Rapier.
2. **Le runtime utilise Three.js comme arbre de scène mathématique.** Les
   `Object3D`, `Vector3` et `Quaternion` fonctionnent dans Node ; seuls le
   moteur de rendu, les chargeurs d'images et les `canvas` ont besoin d'un
   navigateur.
3. **Construire et simuler dans Node marche déjà**, après un simple
   regroupement Vite en mode serveur (`vite build --ssr`) :

| Scène chargée dans Node | Résultat |
|---|---|
| île minimale (sol, bloc, rocher, agent) | construite en 15 ms ; 3 s simulées en 21 ms ; le bloc se pose à y = 0,374 (attendu 0,375) |
| monde de démonstration | ✔ 16 entités |
| `scenes/dominus-village.json` (53 modèles) | ✔ construit (voir la limite des modèles plus bas) |
| démarrages `ev3-robotics-lab`, `quarantine`, `prefab-plaza`, `glow-garden`, `signal-outpost`, `signal-trail`, `constraint-workshop`, `physics-sketchbook` | ✔ |
| démarrages `archive-great-slide`, `living-systems` | ✘ `document is not defined` (textures dessinées sur `canvas`) |

Depuis la phase 1, les deux derniers chargent aussi (test « loads and steps every
starter without a browser »).

### Ce qu'il reste à faire dans le runtime

- **Un profil « sans tête ».** Garder derrière un test unique les chemins qui
  exigent le navigateur : textures et `canvas` (`agent-world-assets.ts`,
  `agent-world-media.ts`), audio, pont `window.postMessage`. Sans tête, ils
  deviennent des objets vides ; la géométrie et la physique restent.
- **Les modèles 3D côté serveur.** Dans l'onglet, un modèle est téléchargé puis
  sa géométrie sert aussi de collision. Dans Node, l'adresse relative ne mène
  nulle part : le modèle se construit, mais sans collision. Le service doit lire
  les fichiers du catalogue d'assets sur disque (`GLTFLoader.parse` sur un
  tampon) et ignorer leurs textures.
- **Le pas fixe.** Le service appelle `runtime.update(1/60)` une fois par pas.
  Il ne faut pas utiliser `api.step()` en boucle : il note un événement
  `time.stepped` à chaque appel.
- **Quatre points d'accès** que le prototype atteignait par des transtypages,
  ajoutés en phase 1 sous ces noms (plus `readContacts`, `saveState` et
  `restoreState`) :

| Besoin | Point d'accès proposé |
|---|---|
| retrouver le corps d'une entité | `AgentWorldRuntime.hostBody(id)` (poignée en lecture) |
| porter un bloc (cinématique, sans collision) puis le rendre au solveur | `PhysicsEngine.setBodyMode(body, mode)` et `setCollision(body, on)` |
| personnages | `PhysicsEngine.createCharacter()` / `moveCharacter()` sur le contrôleur Rapier |
| « la place est-elle libre ? » (Place) | `PhysicsEngine.overlapBox()` |

### Le navigateur devient un spectateur

Le navigateur charge le même document v2 (reçu dans le message `hello` du
flux), met sa propre physique en pause (`api.pause(true)`), puis applique les
poses reçues en interpolant entre deux images. Il faut un dernier point
d'accès, `applyHostPoses(frame)`, qui place les objets **sans** créer de
révision ni d'entrée d'annulation. La règle « une seule boucle d'images »
reste vraie : l'interpolation se fait dans la boucle existante.

Comme le spectateur ne simule rien, il ne peut pas diverger du serveur. Le
serveur est la seule vérité.

## 2. La couche d'action des agents

### Personnage

Clawblox utilise le contrôleur de personnage de Rapier (en Rust). Rapier JS
offre le même (`world.createCharacterController`), avec les mêmes réglages :

| Réglage | Clawblox | Prototype |
|---|---|---|
| vitesse de marche | 16 | 16 |
| arrêt de MoveTo | à 0,5 à l'horizontale, abandon après 8 s | idem |
| saut | vitesse 50, gravité du personnage 30 × 20 | idem (≈ 2 unités de haut, mesuré) |
| marche automatique | 1,0 de haut, pente max 45°, collé au sol à 0,2 | idem |
| poussée des objets | masse de poussée 12 | idem |
| forme | capsule r 0,5, h 2, « hip height » 2 | capsule r 1, h 5 (la taille du `HumanoidRootPart`) |
| hauteur au repos sur le sol | y = 2,55 (mesuré) | y = 2,55 (mesuré) |

### Actions

Les règles viennent de `worlds/mesa-island/main.lua` et les messages sont
identiques :

| Action | Règle | Résultats possibles |
|---|---|---|
| `MoveTo {position}` | marche vers le point | (inchangé) ou `MoveToFailed:InvalidPosition` |
| `Jump {}` | saut mémorisé 0,2 s, repos 0,18 s | — |
| `Stop {}` | annule MoveTo | — |
| `Pickup {position}` | portée 6 ; bloc ramassable à 1,5 du point | `PickupSuccess`, `…:AlreadyHolding`, `…:OutOfRange`, `…:NoBlock`, `…:InvalidPosition` |
| porter | le bloc suit à +3,5 au-dessus du porteur, sans collision | — |
| `Place {position, rotation?}` | portée 7 ; refus si la place est occupée ; glisse en 0,3 s puis redevient libre | `PlaceSuccess`, `…:EmptyHands`, `…:OutOfRange`, `…:Occupied`, `…:InvalidRotation` |
| `Throw {direction, speed?}` | vitesse bornée à 10, +6 vers le haut, +35 % de la vitesse du porteur, 0,18 s sans collision | `ThrowSuccess`, `…:EmptyHands`, `…:InvalidDirection` |
| autre | — | `InvalidAction` |

Comme Clawblox, une action mal formée (MoveTo sans position finie, etc.) est
refusée avec une erreur 400 avant d'atteindre le monde, et `POST /input`
répond après le pas qui a appliqué l'action.

### Observation

Le prototype renvoie les mêmes clés que Clawblox : `tick`, `game_status`,
`player` (avec `LastActionResult` et la caméra `View*`), `other_players`,
`world.entities`, `events`. Les entités gardent les noms Clawblox
(`Block_1`, `Rock_1`, `Ring_1`, `LargeMesa`…), des identifiants numériques,
`rotation`, `aabb`, `obb`, `color`, `material`, `shape`, `anchored` et
`attributes`. Un test compare ces formes à une vraie observation de l'île
Clawblox, capturée le 2026-10-29 (`fixtures/mesa-island-observe.json`).

L'île utilise les unités Clawblox telles quelles (1 unité = 1 « stud ») : les
coordonnées, les invites et les mémoires d'Eko restent valables.

### Différences connues avec Clawblox

- Pas encore de vue image (`/observe/image` répond 501) : phase 3, décidée.
- `events` est toujours vide, comme sur l'île Clawblox (Mesa n'en émet pas).
  `MoveToFinished` n'existe pas côté agent.
- L'heure du clavardage compte le temps simulé depuis le 2000-01-01. Clawblox
  met l'heure réelle de l'hôte, ce que sa propre règle de sauvegarde déconseille.
- Mesa est un monde à un joueur avec un seul point d'apparition. Deux capsules
  superposées ne se séparent jamais et rendent le pas environ 20 fois plus
  lent (mesuré avec 4 et 8 agents) ; le prototype place donc les suivants sur un cercle de 4 unités.
- Surfaces : l'île reprend les propriétés de `main.lua` (blocs friction 0,9 et
  densité 0,7 ; rocher densité 8 ; anneau 0,35 ; terrain 1,4, ramené à 1 car
  GraphysX borne la friction à 1).
- Pose : comme Clawblox (mesuré), un bloc posé en contact exact est accepté,
  la moindre pénétration est refusée (`PlaceFailed:Occupied`).

### Un monde = un document + un module de règles

Mesa se décrit en deux parties, comme dans Clawblox (`main.lua` + `API.md`) :
le décor est un document v2 ordinaire, éditable et affichable par GraphysX ; les
règles (portée, portage, messages) sont un petit module TypeScript. Plus tard,
des règles simples pourraient passer par le bloc de règles existant de GraphysX
(`agent-rules/v1`), et un agent pourrait aussi construire avec les commandes v2
à révision gardée, côté serveur.

## 3. Flux vers les spectateurs, enregistrement et relecture

### Flux en direct

`GET /spectate` est un flux SSE :

- `hello` : le document v2, la table identifiant numérique → entité, la liste
  des personnages ;
- `frame`, 10 fois par seconde : `{tick, t, poses: [[id, x, y, z, qx, qy, qz, qw], …]}`
  pour tout ce qui bouge.

Mesuré : 0,74 Ko par image avec 1 agent, 1,4 Ko avec 16, soit 7 à 14 Ko/s par
spectateur. Le spectateur garde deux images d'avance et interpole (100 à 200 ms
de retard). Le JSON suffit à cette échelle ; un format binaire ou des
différences entre images ne servent qu'au-delà de centaines d'objets mobiles.

### Réutiliser `server/scene-store.mjs` ?

Son SSE transporte des **révisions de document** (`hello`, `op`, `resync`,
reprise par `Last-Event-ID`, 32 lecteurs par scène et 256 au total,
battement toutes les 25 s, `x-accel-buffering: no`). Les poses à 10 Hz ne sont
pas des révisions : les y mettre gonflerait l'historique et l'annulation.
Proposition :

- reprendre **le code** du relais (admission, battement, coupure des lecteurs
  lents) pour `/spectate` ;
- garder **le canal** des révisions pour les vraies modifications du décor (un
  agent qui construit) : elles passent par `scene-commands.mjs` et arrivent sur
  le même flux comme événements `op`.

### Enregistrement

Le prototype écrit `graphysx-recording.ndjson` : une ligne `hello`, une ligne
`frame` à 10 Hz et une ligne `action` (pas, agent, action, résultat) par
action. Ordre de grandeur estimé, non mesuré sur une vraie partie : une heure ≈
36 000 images × 1 Ko ≈ 35 Mo brut, beaucoup moins compressé. Relire, c'est
donner ce fichier au spectateur à la place du flux.

### Traces fantômes

Le format fantôme (`server/ghost-trace.mjs`) est `{elapsedMs, samples: [{tMs,
position}]}` : une seule entité, position seulement, un échantillon toutes les
150 ms, 6 000 au plus (15 min). Il convient pour **exporter le trajet d'un
agent** vers le lecteur fantôme existant, pas comme enregistrement principal.

### L'onglet « Île » et la relecture Clawblox

L'onglet « Île » relit les fichiers `.clawrec` avec `clawblox app`. Un monde
GraphysX n'en produit pas. Deux voies : l'onglet apprend à relire un
enregistrement GraphysX avec le spectateur GraphysX (recommandé, c'est le même
code que le direct), ou le service écrit du `.clawrec`, un format interne à
Clawblox et en Rust (coûteux, fragile). Les journaux Codex se recalent sur le
numéro de pas dans les deux cas.

## 4. Conteneur sur UGFrank derrière Caddy

- **Image** : Node sans navigateur (`node:22-slim` ou la version majeure du
  dépôt), plus le paquet regroupé par Vite (4,5 Mo, Rapier WASM compris).
  Taille estimée autour de 250 Mo. Pas de GPU.
- **Ressources** : mesuré sur devX, 0,09 à 0,53 ms par pas pour 1 à 16 agents.
  Le Xeon E5-1660 v4 d'UGFrank est plus ancien ; même à deux fois plus lent, on
  reste sous 7 % d'un cœur. Mémoire mesurée : 119 Mo. Limites proposées :
  `cpus: 1`, `memory: 512m`.
- **Un conteneur = une île en marche.** Plusieurs îles = plusieurs conteneurs
  (ou un petit superviseur plus tard).
- **Caddy** : une route vers le conteneur. Le SSE doit partir sans tampon
  (`flush_interval -1`). Le protocole Clawblox n'a pas d'authentification sur
  `/join` : garder les routes d'agents réservées au LAN, avec un jeton
  d'accès ajouté par le relais du bac à sable ; la route `/spectate` est en
  lecture seule ; `/snapshot` exige `X-Operator-Token`.
- **Persistance** : un volume `/data` pour les enregistrements, les états
  sauvegardés et les documents d'île. Pour une reprise exacte, Rapier sait
  sérialiser tout son état (`world.takeSnapshot()`, 
  `World.restoreSnapshot()`) ; le moteur doit alors accepter un monde Rapier
  restauré au lieu de le recréer depuis le document.
- **Santé** : `GET /healthz`.
- **Vue image (optionnelle)** : comme Clawblox, un Chromium sans écran avec
  WebGL logiciel, dans un conteneur à part, qui ouvre le spectateur GraphysX en
  caméra subjective. Environ 1 s par image d'après la doc Clawblox ; toujours
  sans GPU. L'invite d'Eko ne parle pas d'images, mais l'`API.md` de Mesa liste
  `/observe/image`.

## 5. Plan par phases

| Phase | Contenu | Effort |
|---|---|---|
| 0 (fait) | prototype : île Mesa, protocole, personnage, actions, flux, enregistrement, tests | — |
| 1 (fait) | points d'accès du runtime (profil sans tête, `hostBody`, mode/collision, personnage, chevauchement, `applyHostPoses`), modèles chargés depuis le disque, tests Node | 2 à 3 j |
| 2 (fait) | service : paquet serveur, règles Mesa complètes (impacts, `MoveToFinished`, `events`), sauvegarde et reprise exactes, tests de conformité contre une île Clawblox réelle | 3 à 4 j |
| 3 (suivante) | vue image décidée ; spectateur derrière le contrat de l’onglet « Île » (AgentX#1179 : `<viewer>/?app=island&embed=1&source=<base>&agent=<name>`), alimenté par `/spectate` dans GraphysX-Web (pause physique, poses, interpolation, captures d'écran vérifiées) ; relecture dans l'onglet « Île » | 3 à 4 j |
| 4 | conteneur, Caddy, jetons, volume sur UGFrank ; essai sans modèle ; puis un essai Eko mis dans la file de Core | 1 à 2 j, après accord |
| (dans la phase 3) | vue image (`/observe/image`), rendue par le spectateur dans un Chromium sans écran | ≈ 2 j |

Total : 9 à 13 jours de session plus la vue image ; il reste les phases 3 et 4.

### L'option économique : Clawblox reste le monde

GraphysX-Web devient seulement un spectateur des îles Clawblox : il traduit le
flux spectateur de Clawblox (`SpectatorObservation`) en entités v2 et les
affiche. 3 à 5 jours.

| | GraphysX devient le monde | Clawblox reste le monde |
|---|---|---|
| effort | 9 à 13 j | 3 à 5 j |
| agents Eko | inchangés (prouvé par le prototype) | inchangés |
| sauvegarde / reprise exactes | à faire (Rapier le permet) | déjà là |
| relecture et onglet « Île » | à adapter | déjà là |
| ce que les agents peuvent faire | tout le vocabulaire v2 : terrain, eau, modèles, règles, construire avec les commandes v2 | le moteur Lua de Clawblox |
| modèles de scène à entretenir | un seul (v2) | deux (Lua Clawblox + traduction v2) |
| GraphysX | un monde partagé, hébergé | un afficheur |

Le travail de spectateur (phase 3) sert dans les deux voies. Si le but est que
GraphysX soit le monde, le surcoût réel est d'environ une semaine, et le risque
principal (« le runtime ne tournera pas sans navigateur ») est levé. Ma
recommandation : faire les phases 1 et 2 sur devX, sans modèle, puis décider de
l'hébergement avec un service qui marche.

## Questions ouvertes pour le propriétaire

Réglées le 2026-10-29 : la vue image (oui) et le système d'UGStation (Linux
Mint). Restent :

1. **Placement** : accepter que le service de monde GraphysX tourne sur UGFrank
   en Docker, séparé du site public `graphysx.specialblend.ca` ?
2. **Spectateur** : une autre session construit un afficheur GraphysX pour le
   flux Clawblox. Faut-il qu'il lise aussi `/spectate` (même document v2 et mêmes
   poses), pour un seul spectateur des deux mondes ?
3. **Relecture** : l'onglet « Île » relit-il les parties GraphysX avec le
   spectateur GraphysX, ou garde-t-on les parties Clawblox à part ?
4. **Agents à distance** : `run_eko.py` démarre l'île sur la même machine. Avec
   l'île sur UGFrank, le kit doit se connecter à une île déjà en marche, et la
   liste réseau du bac à sable doit inclure l'adresse de l'île. D'accord pour
   ce changement du kit (dans AgentX, où il vit maintenant) ?
5. **Premier monde** : une copie fidèle de Mesa (comparaison directe avec les
   parties Clawblox) ou une île propre à GraphysX (terrain, eau, modèles) ?
6. **Plusieurs agents** : Mesa est prévu pour un joueur. Veut-on des îles
   GraphysX à plusieurs agents ?

## Annexe : reproduire (devX)

```bash
npm ci
npm run build:world-service
node --test test/world-service.test.mjs          # 16 tests, sans modèle
node world-service/bench.mjs 1 4 8 16            # coût par pas
npm run serve:world -- --port 18120              # île en direct
clawblox run world-service --port 18122          # lancée par Clawblox
```

Détails dans [`world-service/README.md`](../world-service/README.md).

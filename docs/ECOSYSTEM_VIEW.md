# La maison connectée — l'écosystème AgentX en 3D, visité par Nestor

`?app=ecosystem` ouvre l'écosystème AgentX tel que le décrivent les trois infographies du
25 octobre 2026 d'agentx-home (`assets/infographies/2026-10-25/`, elles-mêmes tirées de
`docs/ECOSYSTEM.md`) : les trois hôtes, la VM que l'un d'eux héberge, les huit groupes de
services sur UGFrank, les quatre Raspberry Pi en bordure du réseau, le réseau, les clients,
et le matériel en réserve sans rôle. Nestor fait la visite : une liste d'étapes, chacune une
image (machines soulignées, arcs avec un repère qui circule) et une narration.

Premier parcours : une visite en lecture seule. Rien ici n'est vivant : pas d'alertes, pas de
travaux, pas de goulots d'étranglement, pas d'état de santé. Les trois points ouverts en ambre
(piUSB, PI-T, BabyPi) viennent de la carte datée, pas d'une sonde. C'est volontaire : la carte
porte des identifiants stables (`eco-node:<id>`) sur lesquels les alertes et les files de
travaux viendront s'accrocher sans changer la forme de l'image.

## Où vivent les choses

| Rôle | Fichier |
| --- | --- |
| La carte (pur) : nœuds, statuts, liens, quatre flux de travail, points ouverts | `src/ecosystem-data.ts` |
| La maison en document v2 (pur) : placements, rails, balises ambre, cages pointillées | `src/ecosystem-scene.ts` |
| La visite (pur) : vocabulaire `play`, image et narration de chaque étape, lecteur | `src/ecosystem-tour.ts` |
| Surface : HUD, panneau Nestor, barre de lecture, arcs, étiquettes, caméra, clic | `src/ecosystem-app.ts`, `src/ecosystem.css` |
| Tests Node et smoke navigateur | `test/ecosystem.test.mjs`, `scripts/smoke-ecosystem.mjs` |
| Modèles externes : convertisseur GLB → mesh JSON et manifeste | `scripts/vendor-ecosystem-models.mjs`, `assets-src/ecosystem/README.md`, `public/assets/ecosystem/models.json` |

Chaque machine est un `box` ou un `cylinder` ordinaire créé par `api.create`, dont les tags
portent son identifiant (`eco-node:ugfrank`), sa sorte (`eco-kind:host`) et son statut
(`eco-status:attention`), comme les `diskx-path:` de la ville. Un agent lit « où est UGFrank »
avec `api.query({ tag: "eco-node" })`, l'éditeur ouvre la maison comme n'importe quelle scène.
La visite est de la présentation : contours, anneaux au sol, arcs, étiquettes HTML projetées
et mouvements de caméra ; le document de scène ne change pas (le smoke le compare avant et
après chaque étape).

## Le look : des machines, pas des cubes

Chaque machine est composée de primitives ordinaires sous une entité principale : UGFrank est
une tour HP avec façade, aérations, anneau hp, baie de disques, grille latérale et ses deux
voies d'inférence (écrans vivants) ; le NAS a ses quatre tiroirs et le miroir ZFS allumé ;
UGAlien est une tour ronde Aurora avec son bandeau, son emblème et ses deux RTX 3090 à
ventilateurs qui tournent ; UGBrutal est un bureau en bois avec moniteur (écran génératif),
clavier, souris et la tour dont la vitre laisse voir devX ; les Pi sont des cartes sur la
texture `electronic-board` avec SoC, ports et GPIO, plus ce que chacun porte (imprimante 3D,
caméra et enceinte, écran 7 pouces) ; les services sont des modules à couvercle lumineux
avec une icône chacun (noyau et anneau, deux têtes, pupitre, chevalet, disques, cadres,
maisonnette, barres). Plateaux en bois, murs bas, plantes ADN, lampes de zone ; balises
ambre pulsantes sur les points ouverts ; cages pointillées sur le prévu.

### Tes propres modèles (Blender, CC0)

Un `.glb` par machine dans `assets-src/ecosystem/<id>.glb` (règles d'export dans le README
du dossier), puis :

```bash
node scripts/vendor-ecosystem-models.mjs
```

Le script lit le GLB sans dépendance (hiérarchie, positions, UV, index, couleur de base et
texture embarquée), écrit `public/assets/ecosystem/models/<id>.json` au format
`graphysx-mesh-json` que l'entité `model` charge déjà, et met à jour
`public/assets/ecosystem/models.json`. La vue lit ce manifeste au montage : une machine
listée est dessinée avec son modèle, ajusté à la plus grande dimension de son emplacement ;
les autres gardent leurs primitives. Les tags, le halo de statut et la balise ambre restent.
Prouvé sur l'avion GLB du dépôt (1 770 triangles, texture PNG embarquée). Les sources `.glb`
restent hors git.

## Ce que la carte dit, et ne dit pas

- **Plein : installé / reçu. Pointillé : prévu / à confirmer. Ambre : un point ouvert.** devX est
  dessiné *dans* la vitre d'UGBrutal, jamais comme un serveur à part. piTFT existe ; son
  tableau de bord est une cage pointillée. UGAlien a exactement deux cartes GPU.
- Les liens sont une carte de relations, pas un plan de câblage : LAN et DNS depuis Deco X90,
  ZFS entre UGFrank et son NAS, files GPU vers UGAlien, clips du garage vers le NAS, audio
  Bluetooth du téléphone vers BabyPi, exporters vers Prometheus. BabyPi n'écrit rien sur piTFT.
- Les quatre flux sont ceux de l'infographie : parler avec Nestor (OpenClaw *ou* Hermes
  Nestor, au choix, pas en série), créer une image (imageX distinct de Hermes Nestor, action
  de l'utilisateur avant la file Core), mémoire et organisation (tâches dans Core, événements
  dans Google Calendar, pas de miroir), garage (clips 30 jours, musique lue sur le téléphone).
- Aucun nom de modèle, aucune adresse, aucune capacité inventée, aucun badge de santé.

## La visite

`play=` liste les étapes, séparées par des virgules ; une liste donnée se lit tout de suite,
sans liste la visite complète attend sur la vue d'ensemble. Un mot inconnu est refusé (bandeau
« Liste refusée », visite complète à la place), pas sauté.

```
overview,frank,services,alien,brutal,network,edge,spare,voice,image,memory,garage,watch,summary
node-<id>   — une machine et ce qui la relie (node-babypi, node-devx, …)
```

Nestor compose la liste selon la conversation (« montre-moi le garage » → `play=garage`,
« qu'est-ce qui cloche » → `play=watch`) ; la page la joue. Le visiteur peut lire, mettre en
pause, avancer (⏮ ⏭, flèches, espace), choisir une étape, ou cliquer une machine : elle
s'ouvre par-dessus l'étape courante, la visite se met en pause, `Échap` revient. L'étape
`watch` est la graine du futur tableau d'alertes : elle allume les points ouverts et les
remontées de métriques.

## Vérification

- `node --test test/ecosystem.test.mjs` : carte cohérente (références, comptes des
  infographies, devX hébergé, points ouverts nommés), une entité par nœud, aucun chevauchement
  au sol sauf devX dans UGBrutal, balises ambre et cages, deux GPU, vocabulaire `play` accepté
  et refusé, image et narration de chaque étape et de chaque machine, lecteur sur l'horloge.
- `npm run smoke:ecosystem` (après `npm run build`) : 25 nœuds tagués, visite par défaut en
  pause, sept étapes jouées avec les bons nœuds, arcs et narration, document inchangé,
  lecture qui avance sur l'horloge, vrai clic 3D sur UGAlien puis `Échap`, flèches, liste
  `play` honorée, mot inconnu refusé, barre de visite sur un téléphone, retour à la porte
  d'entrée. Inscrit dans `scripts/verify-manifest.mjs` (palier `apps`).
- Captures dans `output/verify/ecosystem-*.png` ; regarde-les.

## Suite

- Alertes, travaux et goulots vivants : une source (Prometheus / Core) qui pose des états sur
  les `eco-node:<id>` ; l'étape `watch` les montre, une couleur par sévérité, sans rien exécuter.
- Le lien depuis Nestor (Core relaie le module, comme `<diskx-city>`), et un `<agentx-house>`
  embarquable sur une page Core.
- Mettre à jour la carte quand `docs/ECOSYSTEM.md` change : c'est une transcription datée,
  pas une lecture automatique.

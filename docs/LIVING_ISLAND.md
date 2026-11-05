# L'île vivante (chantier D)

Rédigé le 2026-10-29 vers 19:30 America/Toronto, complété vers 22:30 (sélecteur de monde,
troncs solides) après les réponses de Yanik. Rien n'est déployé, aucun modèle n'a été
appelé, le MCP GraphysX reste éteint. Code : `world-service/living-island.ts`, lancé avec
`--world living-island` (ou `WORLD_ID=living-island`). L'île vivante ne change rien à Mesa :
mêmes corps, mêmes règles. Les deux îles partagent depuis le 2026-10-29 au soir le décor de
l'île Clawblox (section « Le décor »).

## Pourquoi

Sur l'île Mesa, Eko a 12 blocs, une roche et un anneau. L'hypothèse de Yanik : un jeu naît
d'un monde qui surprend. L'île vivante ajoute ce qui pousse, ce qui bouge seul et ce qui
pousse les objets, avec du code que GraphysX avait déjà, sans fonction de score.

## L'idée centrale : ce sont les agents qui sélectionnent

La Forêt vivante de GraphysX (`src/agent-world-dna.ts`, reprise des esquisses Nature of Code de
SBQC) fait pousser chaque arbre à partir d'une graine et d'un génome, sans hasard caché : la même
graine donne toujours le même arbre. Une génération fait dériver un peu les gènes. Il n'y a
**aucune fonction de fitness** : dans l'archive, c'est un humain qui appuyait sur « Génération
suivante ».

Sur l'île vivante, ce geste passe à l'agent :

```
        observe les arbres (gènes, couleur, lignée)
                     │
     goût de l'agent │  « celui-là me plaît »
                     ▼
  ┌──────────┐  GatherSeed  ┌──────────┐    Sow     ┌──────────────┐
  │ Tree_4   │─────────────►│  graine  │───────────►│ Tree_6       │
  │ gén. 1   │              │ (poche)  │            │ gènes de     │
  └────┬─────┘              └──────────┘            │ Tree_4, gén 1│
       │ NextGeneration                             └──────┬───────┘
       ▼                                                   │ 30 s pour pousser
  ┌──────────┐                                             ▼
  │ Tree_4   │   les gènes dérivent ; l'arbre        GatherSeed, Sow…
  │ gén. 2   │   se repose 30 s                      Tree_4 > Tree_6 > Tree_9
  └──────────┘
```

Une lignée ne continue que si un agent en garde une graine et la sème. Son goût devient la
seule pression de sélection. C'est de l'**auto-télie**, un des signes de jeu de l'article MIT
« Is this machine playing? » : le but vient de l'agent, pas du monde.

## Ce que le code existant donne

| Module | Ce qu'il fait | Sur l'île vivante |
|---|---|---|
| `agent-world-dna.ts` | arbres `dna-tree` déterministes ; génome de 10 gènes (tronc, ratio, angle, rotation, profondeur, ramification, teinte…) ; mutation cumulative par génération | **utilisé** : 5 fondateurs, un arbre par entité ; les gènes sont lus dans l'observation |
| `agent-world-flock.ts` | volée de Reynolds (séparation, alignement, cohésion) ; poussée par les champs de force | **utilisé** : 28 oiseaux ; ajout d'un point d'accès `hostAcceleration` (peur des agents et des blocs lancés) et `readMembers` / `writeMembers` (reprise exacte, vue) |
| `agent-world-force-field.ts` | attracteur, flux, traînée, tourbillon ; agit sur les corps, volées et particules | **utilisé** : un vent (flux) invisible et un « perchoir » (attracteur doux) au-dessus de chaque arbre |
| `agent-world-crowd.ts` | foule au sol, errants et poursuivants, conversion par contact | **pas encore** : son départ utilise `Math.random()`, ce qui casserait la reprise exacte |
| `agent-world-formula.ts` | champ de molécules réglé par une formule (A, B, C, M, X) | **pas encore** : une bonne « zone qui transforme » (voir plus bas) |
| `world-recipes.ts` | recettes d'études (`living-forest`, `forces-garden`, `flock-planet`) : graine et réglages | modèle pour des variantes d'île (saison, vent fort) |
| `ecosystem-scene.ts` | un monde composé de primitives, chaque objet retrouvable par étiquette | même principe : arbres, perchoirs et vent sont des entités v2 étiquetées `living` |

## Ce qui est construit

| Élément | Où | Règle |
|---|---|---|
| Forêt | 5 fondateurs `Tree_1` à `Tree_5` au nord-ouest du départ, chacun un génome différent (vert, orange, jaune, bleu, rose) ; jusqu'à 24 arbres | un arbre semé pousse en 3 tailles (0, 15, 30 s) puis est prêt |
| Troncs | un cylindre invisible et statique par arbre (rayon 0,35, haut comme le premier segment), reconstruit quand l'arbre grandit ou change de génération | on bute contre le tronc, on traverse branches et feuilles ; pas de semis là où quelqu'un se tient (`SowFailed:Occupied`) |
| `GatherSeed {position}` | racine d'un arbre prêt, à 6 unités | une graine dans la poche (`HeldSeed: "Tree_4@1"`) ; une nouvelle remplace l'ancienne |
| `Sow {position}` | sol libre à 7 unités, à 4 unités des autres arbres, hors des mesas | nouvel arbre avec les gènes exprimés du parent, nouvelle graine, génération 1 |
| `NextGeneration {position}` | arbre prêt à 6 unités | génération +1 (gènes qui dérivent), puis 30 s de repos |
| Volée `Flock_1` | 28 oiseaux au départ, de 1 à 64 ensuite, entre y = 12 et 18 | fuient un agent à moins de 14 unités et un bloc lancé (vitesse ≥ 5) à moins de 8 ; attirés par les arbres ; depuis le 2026-11-03, chaque oiseau a ses gènes, mange, pond et meurt seul (section « Les oiseaux vivants ») |
| Vent | boîte au sud-est (x 2 à 42, z −42 à −2) | pousse les corps en vol et les oiseaux ; pas Eko, ni un bloc posé (mesuré : immobile 20 s) ; **absent** de l'observation et de `/api.md` |

L'observation garde la forme Clawblox : chaque arbre est une entité `shape: "Tree"` avec ses
attributs (`Generation`, `Ready`, `ReadyIn`, `Parent`, `Lineage`, `SownBy`, `LeafColor`,
`Height`, `Branches`, les gènes) ; la volée donne `Members`, `Spread`, `MeanSpeed`, `Startled`.
`/api.md` décrit les trois actions sans proposer de but. Le flux `/spectate` ajoute `swarms`
(les 28 oiseaux, 10 fois par seconde) ; un arbre qui change est renvoyé sous le même
identifiant et la vue le reconstruit. La reprise (`/snapshot`, `--resume`) garde arbres, graines
et chaque oiseau au bit près.

Coût mesuré sur devX (Ryzen 7 3700X) : 0,20 ms par pas avec 1 agent (Mesa : 0,13), 0,27 ms
avec 8 ; image spectateur 1,2 Ko (Mesa : 0,7) ; sauvegarde 101 Ko (Mesa : 84).

## Les oiseaux vivants (2026-11-03, `living-rules/2`)

Demande de Yanik : une île vivante sans les agents, dans l'esprit des forêts et des volées de
*Nature of Code*. Les arbres restent sélectionnés par les agents ; les oiseaux, eux, vivent seuls.

```
     arbre adulte : des fruits, qui repoussent avec ses feuilles
              │  un oiseau affamé y vole et mange
              ▼
   oiseau bien nourri et adulte (60 s) ──pond──► oisillon : gènes du parent, un peu changés
              │
   faim (énergie à 0) ou vieillesse (6 à 10 min) ──► mort
              │
   moins de 8 oiseaux ──► un nouveau venu arrive toutes les 20 s (gènes à lui)
```

- **Gènes** (`BIRD_GENES`) : vitesse, envie de garder ses distances, de suivre les autres, de
  rester groupé, taille, appétit (la force avec laquelle la faim le tire vers un arbre), et la
  couleur. Les quatre premiers et la taille passent dans la volée comme traits par oiseau
  (`flock.members`, nouveau champ du vocabulaire : couleur, taille, vitesse et poids de Reynolds
  par membre). Une volée sans `members` se comporte exactement comme avant. Avec `members`, la
  couleur de base de la volée passe au blanc : Three.js multiplie la couleur de chaque oiseau par
  celle du matériau, et le gris foncé de l'île rendait tous les oiseaux noirs.
- **Le thermostat** : la nourriture d'un arbre est partagée. Trop d'oiseaux vident les arbres,
  la faim tue, la volée diminue, les fruits repoussent. Personne ne choisit qui vit.
- **Les agents comptent quand même** : un oiseau ne va pas manger près d'un agent (dans son
  rayon de peur de 14 unités), et un arbre semé ailleurs devient une nouvelle source de fruits.
- **Mesuré sur devX, une heure d'île sans agent** (`/tmp` jetable, aucun modèle) : la volée
  monte vers 40 à 55 oiseaux et y reste, 745 naissances et 719 morts, 25 générations. La
  sélection se voit : l'envie de rester groupé tombe de 1,1 à 0,46, la vitesse de 1,0 à 0,73,
  la taille de 1,0 à 0,88 (un petit oiseau lent dépense moins). Sans prédateur, se disperser
  paie : la belle volée serrée se défait. Des faucons à ADN seraient la suite logique.
- **Coût** : 0,21 ms par pas avec la volée vivante (0,15 avant). Enregistrement mesuré avec
  `scripts/measure-recording-rate.mjs` (30 minutes simulées, gzip sur disque) :

  | Réglage | sans oiseaux vivants | avec |
  |---|---|---|
  | par défaut | 8,6 Mio/h | 11,5 Mio/h (+34 %) |
  | allégé (`FRAME_HZ 5`, `SWARM_HZ 1`, `INSPECTION_SECONDS 30`) | 1,6 Mio/h | 2,6 Mio/h (+63 %) |

  L'écart vient surtout des lignes `entities` : chaque changement de population renvoie la
  volée avec les traits de tous ses oiseaux (428 lignes en 30 minutes). Le texte « Couleurs » de
  l'inspection change aussi souvent, ce qui la fait enregistrer plus souvent en réglage allégé.
  Les naissances et les morts sont regroupées une fois par seconde.
- **Reprise** : une île `living-rules/1` (celles en service le 2026-11-03, empreinte
  `67987abe225d84d6`) reprend sous `living-rules/2` ; ses oiseaux deviennent des fondateurs là
  où ils volaient, le reste continue tel quel. Toute autre empreinte reste refusée.
- **Reprise exacte des volées** : le moteur additionne maintenant les champs de force dans
  l'ordre de leur identifiant. Avant, une île reprise listait ses entités dans l'autre sens et
  une volée sous trois champs ou plus divergeait de quelques bits (mesuré : dès 24 s sur `main`),
  puis visiblement. Reste connu et hors de cette PR : un bloc posé au bord du vent dérive après
  une reprise (aussi sur `main`, vers 120 s).

## Les feuilles qui tombent

La chute des feuilles de la Forêt vivante (`seasonSeconds`) était coupée sur l'île : le serveur
garde ses arbres immobiles (aucun coût par pas) et la vue n'anime rien. Depuis le 2026-11-03, la
vue fait tomber les feuilles elle-même, réglée sur l'horloge de l'île (`showSeason` du
`dna-tree`, cycle de 180 s, `WORLD_LEAF_SEASON_SECONDS`) : tous les spectateurs, en direct ou
en relecture, voient le même automne. Les règles et l'observation ne changent pas ; seule l'image
change, y compris la vue à la première personne d'Eko.

Le cycle visuel décale maintenant les arbres selon leur graine et les feuilles selon leur
phase : bourgeon, feuillage adulte, couleur d'automne, chute jusqu'au sol, repos puis disparition
progressive. Une feuille revient sur sa branche seulement à taille nulle, puis repousse ; aucun
retour visible en bloc à la fin du cycle. Ce cycle est une adaptation de présentation ;
les leçons de la Forêt vivante gardent leur animation d'archive dans `update()`.
Au détachement, l'instance qui figurait un amas de feuillage se réduit progressivement à une
petite feuille, pour éviter de faire passer tout l'amas devant les yeux d'un agent.

Le renouvellement dure **180 secondes simulées**.
La pousse prend au plus 14 secondes. La durée de chute dépend de la hauteur et du `fallSpeed`
propre à chaque feuille : allonger le cycle ne fait pas flotter une feuille pendant toute une
saison. Au contact du sol, le mouvement cesse, la feuille s'aplatit parallèlement au terrain,
et sa hauteur suit son épaisseur. La litière reste visible plusieurs dizaines de secondes,
brunit et s'assombrit, puis rapetisse progressivement avant son renouvellement invisible.

Il s'agit d'un cycle visuel accéléré : les couleurs génétiques bleues ou roses restent un choix
de l'île. Les saisons, la météo, les organismes décomposeurs et les nutriments ne sont pas
simulés. La perte des pigments avant la chute suit le principe décrit par
[Harvard Forest](https://harvardforest.fas.harvard.edu/education-opportunities/classic-outreach-resources/autumn-foliage-color/leaf-science/leaf-process/) ;
la décomposition réelle dépend des organismes et des conditions du sol, et peut être bien plus
longue que cette animation ([Penn State Extension](https://extension.psu.edu/leaves-are-treasure-not-trash)).

Les feuilles restent dans le même maillage instancié (20 triangles par feuille), sans corps
physique, collision ni nouvelle entité. Les matrices et couleurs sont actualisées au plus à
30 Hz simulés ; une horloge arrêtée n'écrit rien. Les branches restent immobiles et les bornes
de sélection sont calculées une seule fois, assez larges pour toute la chute. Les tests CPU
`test/dna-leaves.test.mjs` vérifient deux cycles complets, les sauts de relecture, les retours
invisibles et les bornes réutilisées.

Mesure locale du 2026-11-04 sur `a28cead`, cycle de 180 s des deux côtés :
cinq fondateurs, 569 feuilles, Chromium/SwiftShader à
1024 × 640, trois séries, médianes ci-dessous. Le probe
`scripts/probe-living-leaves.mjs <révision-avant-correction>` compare les mêmes génomes avec
la révision passée en argument. Il attend une lecture de pixel après chaque dessin ; mesurer
seulement l'envoi des commandes graphiques sous-estime fortement ce rendu logiciel.

| Mesure isolée | Avant (`6a11c49`) | Après |
|---|---:|---:|
| Calcul des feuilles par image à 60 Hz | 0,121 ms | 0,054 ms |
| Mises à jour des matrices sur les trois séries | 10 800 | 5 400 |
| Recalculs des bornes sur les trois séries | 10 800 | 0 |
| Rendu animé de la scène de mesure | 35,99 ms | 34,67 ms |
| Appels de dessin, ombres déjà calculées | 11 | 11 |
| Triangles de la scène de mesure | 21 222 | 21 222 |

Sans dessiner les feuilles, cette scène prend 27,60 ms (6 appels, 9 842 triangles).
Le coût observé est donc principalement graphique : environ 7 ms de plus pour le feuillage
dans ce moteur **logiciel**, contre environ 0,05 ms pour son animation, et aucun corps physique.
La correction réduit le calcul d'environ 55 %. L'écart de rendu est faible et varie selon la série. Ces durées
concernent le petit décor du probe, avec ombres en cache et sans anticrénelage ; elles ne sont
ni les FPS de l'île complète ni une mesure des GPU des appareils de la maison.

Exécuter le probe sous la file de travaux lourds de l'instance et le verrou du moteur :
`node scripts/with-verify-lock.mjs -- node scripts/probe-living-leaves.mjs 6a11c49`.
Il produit les mesures JSON et quatre captures dans `output/living-leaves/`.

L'explorateur actualise les compteurs, les listes et les marqueurs d'oiseaux en place : une
naissance ou un décès ne remplace plus les boutons pendant un clic, ni les commandes de la
carte. Les parcours vérifient une population reçue du monde plutôt qu'un nombre de fondateurs
figé, et provoquent des naissances pour contrôler la stabilité des commandes.

Validation ciblée sur la base incluant l'avatar robot : 897 tests Node, vérification de types,
lint, construction, sondes physiques et parcours `island-explorer`, `island-workspace`,
`island-living` et `dna` réussis ; captures bureau, téléphone, 4K et vue d'Eko examinées.
Cela couvre aussi la relecture de l'enregistrement et ses chemins par instance.

## Captures (2026-10-29, devX, Chromium sans écran)

Le jardinier scripté vient de garder une graine de `Tree_4` (le plus touffu), de la semer
(`Tree_6`, le petit arbre bleu) et de faire avancer `Tree_4` d'une génération.

| | |
| --- | --- |
| Bureau, caméra sur le jardinier | ![suivi](living-island/follow-gardener.jpg) |
| Vue d'ensemble : la forêt et la volée (les oiseaux évitent l'agent suivi) | ![vue d'ensemble](living-island/overview.jpg) |
| Ce que voit le jardinier (`GET /observe/image`, 1088×640) | ![vue du jardinier](living-island/gardener-view.jpg) |
| Téléphone (375 px), panneau replié | ![téléphone](living-island/phone.jpg) |
| 4K (3840×2160, HUD à l'échelle 2 ; image réduite à 2560 px), `Tree_6` adulte | ![4K](living-island/4k.jpg) |

## Le décor

Remarque du 2026-10-29 au soir : dans la vue, le sol des îles du service sortait menthe et uni,
loin de l'île Clawblox vue dans la même page. La vue habille une île Clawblox (herbe texturée,
chapeau d'herbe sur chaque mesa, mer réfléchissante, `src/island-feed.ts`) ; une île du service
s'affiche depuis son propre document, qui n'avait que des boîtes de couleur.

Le document de Mesa (donc aussi celui de l'île vivante) porte maintenant le même habillage,
en **décor sans physique** : les dalles de sol gardent leurs corps mais sont cachées sous une
dalle d'herbe ; chaque mesa reçoit son chapeau d'herbe ; l'océan reste une dalle cachée sous une
surface d'eau ; les lampes sont celles de la vue (ambiante 0,55 bleutée, soleil 2,6 chaud).
Les corps, les règles et l'observation ne changent pas (même position de l'océan, mêmes noms,
mêmes couleurs annoncées). L'empreinte de Mesa change (`3bdeced47efb7c86`) : les sauvegardes
d'avant sont refusées ; aucune n'est en service. La vue à la première personne d'Eko voit le
même décor.

| | |
| --- | --- |
| Vue d'ensemble, avant et après | ![décor, vue d'ensemble](living-island/look-overview-before-after.jpg) |
| Téléphone (375 px), avant et après | ![décor, téléphone](living-island/look-phone-before-after.jpg) |

## Choisir le monde : un seul conteneur, un sélecteur

Décision de Yanik (2026-10-29) : tout dans le même conteneur, avec un sélecteur. Le service
démarre sur `WORLD_ID` (Mesa par défaut) et l'opérateur change d'île sans redémarrer :

```bash
curl -X POST -H "X-Operator-Token: $WORLD_OPERATOR_TOKEN" -H "content-type: application/json"   -d '{"world": "living-island"}' http://127.0.0.1:18120/world
```

- La route est réservée à l'opérateur (jeton), comme `/snapshot`. Les agents ne peuvent pas
  changer de monde.
- Elle refuse (409) tant qu'un agent est sur l'île, sauf avec `"force": true` : ses sessions
  se terminent avec l'ancienne île.
- Les spectateurs reçoivent le nouveau document (la vue `?app=island` suit sans recharger).
  `/healthz` dit le monde en cours (`{ok, tick, world}`) et `/api.md` suit le monde.
- Chaque changement ouvre un nouvel enregistrement à côté du premier
  (`<dossier>-1-living-island`, `<dossier>-2-mesa-island`…), pour qu'une reprise reste une
  seule ligne de temps.
- Pas encore fait : le bouton dans Benchmark ou la file de Core. Le runner d'AgentX choisira le
  monde avant de lancer une partie.

## Garanties conservées

- Rien de nouveau côté réseau : mêmes routes, mêmes jetons, `/snapshot` réservé à l'opérateur.
  Les actions vivantes passent par `POST /input` comme les autres.
- Aucune information cachée n'est donnée à l'agent : il voit ce qu'un joueur verrait (arbres,
  oiseaux), pas le vent ni les perchoirs.
- Aucun appel de modèle. La simulation reste déterministe (pas de `Math.random()`).

## Volées, foules et champs : la suite possible

- **Blocs lancés** : déjà fait, un bloc rapide disperse les oiseaux. On pourrait ajouter : un
  oiseau touché se pose, ou la volée suit un agent immobile longtemps.
- **Courants** : un tourbillon (`vortex`) au-dessus de l'océan qui ramène les blocs tombés.
- **Zones qui transforment** : un bloc laissé dans un anneau devient une graine, ou la teinte
  d'un arbre suit la formule d'un champ voisin (`formula-field`).
- **Foules** : de petits animaux qui errent et s'enfuient, une fois `agent-world-crowd.ts`
  rendu déterministe (graine au lieu de `Math.random()`).

## Ce qu'on mesurerait

Tout vient de l'enregistrement (`--record` : actions avec résultat, arbres semés, images) et
des fichiers de mémoire d'Eko.

| Question | Mesure |
|---|---|
| Joue-t-il avec la forêt ? | nombre de `GatherSeed`, `Sow`, `NextGeneration` par heure, sans demande ni récompense |
| A-t-il un goût stable ? | direction des gènes choisis au fil des générations, comparée à une marche au hasard (même nombre de choix, arbres tirés au sort) |
| Invente-t-il des règles ? | motifs dans les semis (ligne, cercle, couleurs groupées) ; règles écrites dans sa mémoire ou le clavardage (« je ne garde que les bleus ») puis suivies |
| Joue-t-il avec les oiseaux ? | approches répétées de la volée, lancers vers elle, montées sur le Peak |
| Découvre-t-il le vent ? | lancers répétés dans la zone, mention de la dérive dans sa mémoire |
| Revient-il ? | reprise des mêmes lignées d'une partie à l'autre ; aujourd'hui seule la mémoire passe, garder la forêt entre deux parties serait une décision à part |

## Essayer (devX, sans modèle)

```bash
npm run build:world-service
npm run serve:world -- --world living-island --port 18160 --record --record-dir /tmp/ile-vivante
node world-service/gardener.mjs --base http://127.0.0.1:18160 --taste warm --wait-sapling
npx vite --port 18163   # puis /?app=island&source=http://127.0.0.1:18160&agent=Jardinier
node --test test/living-island.test.mjs
node scripts/smoke-living-island.mjs   # après npm run build
```

Le jardinier (`world-service/gardener.mjs`) est un agent scripté : il choisit un arbre selon un
goût fixe (`bushy`, `tall` ou `warm`), en garde une graine, la sème, puis fait avancer le parent.

## Limites

- Seuls les troncs sont solides ; branches et feuilles se traversent.
- La vue 4K n'est pas dans le parcours automatique : en WebGL logiciel, toute page du service
  de monde met environ 48 s à afficher ses premières images en 3840×2160, avec ou sans la
  forêt (mesuré le 2026-10-29). La capture 4K de la PR a été faite à part.
- Pour qu'Eko joue ici, il manque le côté AgentX (voir la PR) : le runner doit se joindre à un
  monde déjà en marche, et le relais des vues doit laisser passer `/healthz` et `/spectate`.

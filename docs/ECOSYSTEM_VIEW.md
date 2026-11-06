# La maison connectée — l'écosystème AgentX en 3D, visité par Nestor

`?app=ecosystem` ouvre l'écosystème AgentX tel que le décrivent les trois infographies du
25 octobre 2026 d'agentx-home (`assets/infographies/2026-10-25/`, elles-mêmes tirées de
`docs/ECOSYSTEM.md`) : les trois hôtes, la VM que l'un d'eux héberge, les huit groupes de
services sur UGFrank, les quatre Raspberry Pi en bordure du réseau, le réseau, les clients,
et le matériel en réserve sans rôle. Nestor fait la visite : une liste d'étapes, chacune une
image (machines soulignées, arcs avec un repère qui circule) et une narration.

Le parcours autonome reste une visite en lecture seule sur cette composition datée. Les
états observés par Core sont optionnels dans l'élément embarqué, suivant le contrat ci-dessous.
Sans cette source, aucun état courant n'est inventé. Les quatre points ouverts en ambre
(disque système d'UGBrutal, piUSB, PI-T, BabyPi) viennent de la carte datée, pas d'une sonde. C'est volontaire : la carte
porte des identifiants stables (`eco-node:<id>`) sur lesquels les alertes et les files de
travaux viendront s'accrocher sans changer la forme de l'image.

## Où vivent les choses

| Rôle | Fichier |
| --- | --- |
| La carte (pur) : nœuds, statuts, liens, quatre flux de travail, points ouverts | `src/ecosystem-data.ts` |
| La maison en document v2 (pur) : placements, rails, balises ambre, cages pointillées | `src/ecosystem-scene.ts` |
| La visite (pur) : vocabulaire `play`, image et narration de chaque étape, lecteur | `src/ecosystem-tour.ts` |
| Surface : HUD, panneau Nestor, barre de lecture, arcs, étiquettes, caméra, clic | `src/ecosystem-app.ts`, `src/ecosystem.css` |
| Projection Core bornée et expiration sans réseau ; couche d'états sans modifier le monde | `src/ecosystem-live-state.ts`, `src/ecosystem-live-layer.ts` |
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
- Aucun nom de modèle, aucune adresse ni capacité inventée. Les états courants, lorsqu'ils
  sont fournis, précisent leur périmètre : endpoints d'inférence ou santé du service.

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

« Lire » fait défiler les étapes et leur texte. La visite reste silencieuse tant que le
visiteur n'active pas explicitement « Activer la voix » ; une fois activée, la voix guide
la progression et Pause annule la phrase en cours. Le [contrat de narration](DISKX_EMBED.md#spoken-ecosystem-tour)
décrit le transport Nestor fourni par l'hôte et la voix de l'appareil en mode autonome.
L'actualisation des états n'active ni ne relance cette narration. Le bandeau
précise que la carte est datée. Sur un écran étroit, le cadrage recule pour conserver le
champ horizontal et les étiquettes restent entièrement dans les bords de l'écran.

## Vérification

### Visite accompagnée dans Nestor

Le bundle LAN existant `embed/diskx.js` définit aussi `<agentx-ecosystem>`.
Cet adaptateur monte `mountEcosystemApp` et ses contrôles existants :
`tour.setScript`, `tour.goto`, `tour.pause` et `state()`. Il n'ajoute ni scène,
ni boucle de rendu, ni proxy. Core utilise son relais DiskX existant et la page
`/diskx?app=ecosystem` pour l'afficher auprès de la conversation.

`presentation-id` lie l'élément à la carte Nestor. `state().presentation` reste
absent avant le premier rendu. Après `subscribeAfterRender`, il indique l'instance,
la séquence, l'instant rendu, la révision du document, le hash des sources réelles
du bundle, la date de la carte, l'étape, les candidats en focus et le nœud
explicitement sélectionné. Les événements `ecosystem-ready`,
`ecosystem-scene-changed` et `ecosystem-node-selected` suivent ce rendu.
Une reconnexion change d'instance et efface le reçu précédent ; fermeture ou
échec libèrent l'application et son renderer. Core distingue cette observation
navigateur d'une lecture métier, refuse les observations périmées et demande une
précision lorsqu'aucun composant unique n'est sélectionné.

Ce mode conserve les géométries, couleurs, animations et étapes de la visite,
avec les finitions locales sans textures, ciel externe ni modèles optionnels à
télécharger. Le module reste autonome sous le plafond DiskX existant de 6 Mio.
La vue autonome `app=ecosystem` conserve ses ressources. Aucun réglage de
permissions, CORS ou nouvelle origine réseau n'est requis.

Les tests CPU de projection, cycle de vie et empreinte des sources se trouvent dans
`test/ecosystem.test.mjs`, `test/ecosystem-embed-lifecycle.test.mjs` et
`test/embed-source-version.test.mjs`. Les parcours composés Core de visite et
de non-régression Janitor utilisent ce même bundle. Une conversation simulée et
une interface locale composée ne constituent pas une réception du dialogue
Nestor natif : après accord séparé, publier le module compatible avant le raccord
Core, puis vérifier les versions effectivement servies et les deux tours réels.

### États courants fournis par Core

L'hôte peut appeler `element.setLiveState(value)` sur `<agentx-ecosystem>` monté. Il reçoit
un booléen d'acceptation. L'élément ne collecte rien, n'interroge aucun service et n'appelle
aucun modèle. Core possède la projection, le transport et la cadence. Le renderer ajoute
un halo par composant couvert et une liste visible d'états, avec boutons clavier/tactiles,
dernier relevé et expiration. Les rafraîchissements gardent scène, caméra, visite, sélection
et focus clavier. Aucune sélection n'est nécessaire pour afficher les changements.
Les heures affichées utilisent le fuseau local du navigateur et indiquent ce fuseau.
Les dates ISO UTC restent inchangées dans l'état canonique et consultables dans les titres.

Entrée bornée, sans adresses ni détails d'administration :

```ts
{
  contract: "agentx.ecosystem-live/v1",
  generatedAt: "2026-11-05T18:00:00.000Z",
  expiresAt: "2026-11-05T18:00:30.000Z",
  nodes: [{
    id: "ugalien", // ID de la carte, sans le préfixe eco-node:
    state: "online", // online | offline | degraded | busy | parked | unknown
    source: "inference_endpoints", // ou product_service
    observedAt: "2026-11-05T17:59:58.000Z", // ou null
    expiresAt: "2026-11-05T18:00:28.000Z", // ou null
    freshness: "current" // current | stale | unknown
  }],
  read: {
    contract: "agentx.presentation-read/v1",
    id: "view_<64 caractères hexadécimaux>",
    revision: "<mêmes 64 caractères hexadécimaux>",
    source: "core.ecosystem.live",
    observedAt: "2026-11-05T18:00:00.000Z", // identique à generatedAt
    expiresAt: "2026-11-05T18:00:30.000Z" // identique à expiresAt global
  }
}
```

Les dates sont UTC ISO, à la seconde ou milliseconde. Au plus 32 nœuds connus, sans
doublon ; dates invalides, champs supplémentaires et références incohérentes sont refusés.
Une réponse antérieure est refusée. À la même date, un contenu ou une révision différente
est refusé ; rejouer le même contenu est sans effet supplémentaire. Les empreintes servent
de références Core ; le renderer ne les présente pas comme une preuve cryptographique de
la mesure. `online` qualifie seulement la source nommée, pas la machine physique entière.

L'expiration de chaque relevé et de l'enveloppe est dérivée de l'horloge dans la boucle
de rendu partagée, même sans nouvelle réponse. Un ancien état sain perd sa couleur saine
et devient explicitement périmé. `setLiveState(null)` signale une source indisponible :
le dernier relevé reste daté et sa référence est conservée, avec des halos neutres. Sans
payload antérieur, aucune référence n'est inventée. Déconnexion et remontage repartent
sans reçu ni état vivant hérité.

Après le prochain rendu seulement, `state().presentation.live` contient
`{ status: "available" | "stale" | "unavailable", read: référence | null }`.
L'événement `ecosystem-live-state-changed` suit ce rendu lorsqu'une référence, la fraîcheur
ou la disponibilité change. L'acceptation de `setLiveState` n'est jamais un reçu d'affichage.
Sans activation de cette source, le champ `live` reste absent ; les anciens usages
statiques et famille conservent la carte datée.

Les tests Node `test/ecosystem-live-state.test.mjs` couvrent les six états, la péremption,
la panne, le refus des réponses désordonnées, le contrat et les mises à jour de la couche
visuelle sans remplacer ses objets ni boutons. Le cycle embarqué vérifie séparément
l'émission après rendu. Ils ne remplacent pas la réception visuelle composée dans Core.

### Contrôles de la visite autonome

- `node --test test/ecosystem.test.mjs` : carte cohérente (références, comptes des
  infographies, devX hébergé, points ouverts nommés), une entité par nœud, aucun chevauchement
  au sol sauf devX dans UGBrutal, balises ambre et cages, deux GPU, vocabulaire `play` accepté
  et refusé, image et narration de chaque étape et de chaque machine, lecteur sur l'horloge.
- `npm run smoke:ecosystem` (après `npm run build`) : 25 nœuds tagués, visite par défaut en
  pause, sept étapes jouées avec les bons nœuds, arcs et narration, document inchangé,
  lecture qui avance sur l'horloge, vrai clic 3D sur UGAlien puis `Échap`, flèches, liste
  `play` honorée, mot inconnu refusé, barre de visite sur un téléphone, retour à la porte
  d'entrée, étiquettes mobiles contenues dans l'écran et aucun asset manquant dans le build
  de production. Inscrit dans `scripts/verify-manifest.mjs` (palier `apps`).
- `node --test test/model-manifest-assets.test.mjs` : le manifeste vide est publié ; les
  modèles convertis et leurs textures sont inclus quand le manifeste les référence.
- Captures dans `output/verify/ecosystem-*.png` ; regarde-les.

## Suite

- Étendre les sources Core vérifiées et leur couverture ; conserver la distinction entre
  disponibilité, activité observée et réservation. Les composants non couverts restent
  sans télémétrie, et une couleur ne déclenche aucune action.
- Le lien depuis Nestor (Core relaie le module, comme `<diskx-city>`), et un `<agentx-house>`
  embarquable sur une page Core.
- Mettre à jour la carte quand `docs/ECOSYSTEM.md` change : c'est une transcription datée,
  pas une lecture automatique.

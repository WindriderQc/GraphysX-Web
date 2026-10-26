# DiskX — vos disques, en ville

> Mise à jour : [parcours Janitor et limites actuelles](DISKX_JANITOR.md). La capture
> distribuée est désormais synthétique. Les mesures privées ci-dessous sont historiques,
> pas une mesure actuelle. Le rechargement atomique remplace l’ancien cumul de pages.

`?app=diskx` ouvre une vue TreeSize en 3D des disques qu'AgentX Data a indexés : chaque
dossier est un bloc dont la **surface** est proportionnelle à ses octets et la **hauteur** à sa
part du niveau (échelle log). Un clic sur un quartier plonge dans ce dossier ; `Échap`,
`Retour arrière` ou **↑ Remonter** reviennent au parent. Les plus gros sous-dossiers d'un
quartier sont posés sur son toit, pour voir deux niveaux à la fois.

## Où vivent les choses

| Rôle | Fichier |
| --- | --- |
| Modèle pur : arbre, cumul, catégories, treemap « squarified », agrégats par type | `src/diskx-data.ts` |
| Composition du monde v2 (blocs, plaques, rails néon, lumières, émetteur) | `src/diskx-scene.ts` |
| Sources : AgentX Data via `/diskx-api/`, repli sur la capture | `src/diskx-source.ts`, `src/diskx-fixture.json` |
| Surface d'application : HUD, picking, étiquettes projetées, caméra | `src/diskx-app.ts`, `src/diskx.css` |
| Route lecture seule vers AgentX Data (dev et preview construite) | `scripts/diskx-server.mjs` |
| Tests Node (arbre, treemap, document) et smoke navigateur | `test/diskx-layout.test.mjs`, `scripts/smoke-diskx.mjs` |

La ville est un document v2 ordinaire créé par `api.create` : chaque quartier est un `box`
dont les tags portent le dossier (`diskx-path:/mnt/datalake/ISO`), comme les `portal-to:` du
showroom. Un agent lit « où sont les octets » avec `api.query({ tag: "diskx-district" })`,
l'éditeur ouvre la ville comme n'importe quelle scène, et une plongée est un `api.create` de
plus (le niveau précédent est un `api.undo()`). Le halo de survol, les étiquettes HTML et les
mouvements de caméra sont de la présentation et ne touchent pas au document.

## Données

AgentX Data (`/api/data-toolbox/storage/*` derrière le gateway `agentx.specialblend.icu`)
expose, par dossier qui contient directement des fichiers, le total d'octets, le nombre de
fichiers et le plus gros fichier (`storage/tree?root=&limit=`), plus `storage/summary` et
`storage/files?root=&sort=size`. Le collecteur `ugfrank-storage` scanne `/mnt/datalake` et
`/mnt/media` chaque nuit à 03:00 America/Toronto.

Ce que DiskX reconstruit côté navigateur, parce que l'API ne le donne pas :

- la hiérarchie et les parents qui ne contiennent que des dossiers (`reported: false`) ;
- les totaux récursifs, par cumul ascendant ;
- la catégorie d'un dossier (celle de son plus gros enfant en octets, ou de son plus gros fichier).

Limites connues : `storage/tree` plafonne à 2000 lignes par appel et ignore `depth`, donc
le premier niveau d'un disque de 25 000 dossiers est une borne inférieure (le HUD affiche
« ≥, page tronquée ») que chaque plongée affine en demandant `root=<dossier>`. Les disques
Windows et les autres hôtes ne sont pas dans l'index : c'est un agent de stockage à ajouter
côté AgentX Data, pas côté GraphysX.

## Espace libre et capacité

L'agent de stockage d'AgentX Data (`ugfrank-storage`, `storage-1.5.0`) mesure ses montages
par `statfs` et publie les **volumes** dans `storage/summary` (vérifié le 2026-10-25 : champ
`volumes`, aussi repris par `storage/agents`). Chaque entrée porte `id`, `label`, `host`,
`roots`, `capacityBytes`, `freeBytes`, `source: "measured"`, `method: "statfs"`,
`measuredAt`, le système de fichiers et une `note`. DiskX les lit dans la même réponse que
l'inventaire, sans route ni variable de plus : `DISKX_VOLUMES` et `/diskx-api/volumes` ont
été retirés le 2026-10-25. La note de l'agent compte : sur ZFS, `statfs` donne l'utilisé plus
le disponible du dataset, pas la taille du pool. Deux racines sur le même volume (`/mnt/media`
= `/Media/Media`, `/mnt/datalake` = `/Media/Media/Datalake`) partagent un seul libre.

La capture embarquée (`src/diskx-fixture.json`) déclare un volume fictif (`source: "declared"`,
valeurs non mesurées) pour que le site statique montre la tuile et la jauge.

Dans la ville, le libre est **une tuile translucide par volume, au niveau « Tous les
disques »**, à la même échelle octets → surface que les disques ; il n'est jamais dessiné
dans un dossier, parce qu'il appartient au volume et serait compté deux fois. Le HUD
affiche la jauge du volume (utilisé / capacité / libre) à tous les niveaux, ou « capacité
inconnue » quand l'agent n'a publié aucun volume pour ces racines. L'infobulle de la jauge
dit la méthode, la date, l'hôte et la note de l'agent.

## Branchement

Le gateway ne renvoie pas d'en-têtes CORS, donc le navigateur passe par la route
`/diskx-api/` de sa propre origine (`config`, `summary`, `tree`, `files`, GET seulement,
paramètres `root`, `limit`, `sort`).

```bash
DISKX_DATA_URL=https://agentx.specialblend.icu npm run dev
```

ou la même variable dans un `.env.local` ignoré par git. Sans elle (le site statique
public, un poste hors LAN), la ville s'ouvre sur la capture du 2026-10-23 et le badge
l'indique. `?source=fixture` force la capture ; `?root=/mnt/datalake/ISO` ouvre directement
un dossier.

## Vérification

- `node --test test/diskx-layout.test.mjs` : cumul et parents inférés, catégories, unités,
  treemap (aires exactes, pas de chevauchement, rangées le long du petit côté — l'assertion
  qui a attrapé la première version en tranches), repli de la longue traîne, document v2
  cohérent, bâtiments de toit posés sur leur quartier, tuile libre à l'échelle et jauge de
  volume. `node --test test/diskx-observation.test.mjs` : volumes lus dans `summary` tels que
  l'agent les publie, capacité inconnue quand il n'en publie pas, même lecture depuis une page Core.
- `npm run smoke:diskx` (après `npm run build`) : ville depuis la capture, quartiers en
  entités, vrai clic 3D sur la projection d'un toit, fil d'Ariane, fiche de survol, parité
  liste HUD / clic, `Échap`, retour au Center. Inscrit dans `scripts/verify-manifest.mjs`
  (palier `apps`).
- Captures locales dans `output/verify/diskx-*.png` ; regarde-les.

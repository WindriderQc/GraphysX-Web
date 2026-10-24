# DiskX — vos disques, en ville

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
  cohérent, bâtiments de toit posés sur leur quartier.
- `npm run smoke:diskx` (après `npm run build`) : ville depuis la capture, quartiers en
  entités, vrai clic 3D sur la projection d'un toit, fil d'Ariane, fiche de survol, parité
  liste HUD / clic, `Échap`, retour au Center. Inscrit dans `scripts/verify-manifest.mjs`
  (palier `apps`).
- Captures locales dans `output/verify/diskx-*.png` ; regarde-les.

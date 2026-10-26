# `<diskx-city>` : DiskX sur une page AgentX Core

Décision du propriétaire, 2026-10-25 (America/Toronto) : Core sert DiskX et le lit lui-même,
comme le masque de Nestor. GraphysX publie un module autonome ; Core le relaie depuis sa propre
origine (CSP `script-src 'self'`, sans CORS) et lui sert ses routes Data Toolbox existantes.

## Module

- `https://graphysx.specialblend.ca/embed/diskx.js`, construit à chaque `vite build`
  (`vite.diskx.config.ts`), comme `embed/llmx-face.js`.
- Un seul fichier ES d'environ 4 Mio (1,4 Mio compressé). La moitié est le moteur physique du
  runtime de monde. Le relais de Core doit accepter cette taille pour ce module précis.
- Il ne contient aucune donnée réelle et n'utilise jamais la capture fictive.
- La feuille de style de DiskX est injectée par le module. Les polices de marque sont absentes :
  la page retombe sur les polices système. L'éditeur n'est pas inclus.
- Pas de ciel en images dans l'élément : les étoiles sont dessinées en code, aucune requête vers `/assets/` de la
  page hôte. CSP : `'wasm-unsafe-eval'` (Manifold) suffit ; rien d'autre n'est demandé.

## Élément

```html
<script type="module" src="/assets/diskx/diskx.js"></script>
<diskx-city api-base="/api/data-toolbox" roots="/mnt/datalake,/mnt/media"
            janitor="latest" group="<sha256>" focus="/mnt/datalake/ISO"></diskx-city>
```

| Attribut | Règle |
| --- | --- |
| `api-base` | Chemin de même origine, `/api/data-toolbox` par défaut. Une URL absolue est refusée. |
| `roots` | Obligatoire. Dossiers absolus séparés par des virgules. |
| `janitor` | `latest` lit le dernier rapport au chargement. |
| `group` | SHA-256 (64 hex) d'un groupe vérifié à montrer dans la ville. |
| `focus` | Dossier d'ouverture, sous une racine. |
| `play` | Liste d'animations de la présentation Janitor (voir plus bas). Modifiable sur un élément monté : la nouvelle liste remplace l'ancienne et se joue. |
| `actions-href` | Chemin de même origine de la page où l'on décide et agit (Data Toolbox). Affiché comme lien, jamais appelé. |

La page hôte dimensionne l'élément (`diskx-city{position:fixed;inset:0}` par exemple). Le style
par défaut a une spécificité nulle et ne gagne jamais contre celui de la page.

## Lectures (GET seulement, même origine)

`storage/summary`, `storage/tree?root&limit`, `storage/files?root&limit&sort`,
`janitor/strategy/latest`, `janitor/strategy/latest/groups?offset&limit` et `?sha256=` pour un
groupe nommé. La capacité et le libre des volumes arrivent dans `storage/summary` (champ
`volumes`, mesuré par l'agent de stockage) : la tuile d'espace libre et la jauge apparaissent
sur une page Core sans route de plus, et restent absentes quand l'agent n'a rien publié.

## Présentation Janitor (`play`)

Avec `janitor="latest"`, l'élément joue une liste d'animations sur la ville. Vocabulaire, séparé
par des virgules, 24 étapes au plus ; un mot inconnu est refusé (`diskx-error` stage
`attributes` au montage, `play` sur un changement) :

| Étape | Ce que la ville montre |
| --- | --- |
| `overview` | La ville telle quelle. |
| `duplicates` | Le reste s'estompe ; une colonne monte par quartier : cyan = copies gardées par la règle, ambre = copies en trop, gris = groupe sans survivant nommé. |
| `pairs` | Un arc par paire (quartier des copies en trop → quartier de la copie gardée), épaisseur selon les octets, 24 au plus. Même quartier et hors niveau sont comptés, pas dessinés. |
| `target` | Le niveau recomposé sans les copies en trop (octets logiques). Les tuiles d'espace libre ne grandissent pas : l'espace physique libéré n'est pas mesuré. |
| `summary` | Estimation du rapport, couverture, plus gros groupes, mentions. |
| `tour-N` | Les N plus gros groupes (1 à 20), un par un, par le chemin `group`. |
| `group-<sha256>` | Un groupe vérifié, actuel → après la règle. |

Sans `play`, la liste par défaut `overview,duplicates,pairs,target,summary` attend sur la vue
d'ensemble ; avec `group` seul, la liste est `group-<sha256>` (comportement antérieur). Une
liste donnée par `play` se joue tout de suite. Le visiteur lit, met en pause, avance, saute à un
groupe, filtre (racine, taille, copies comptées), sélectionne un bloc (un clic sélectionne au
lieu de plonger) et le soulève, l'écarte ou le fait pulser. Tout est présentation : le document de
scène ne change pas et « Tout remettre » efface les gestes. L'élément expose aussi `play()`,
`pause()`, `next()` et `previous()`.

Le registre lit les groupes vérifiés par pages de 50, du plus gros au plus petit, 5 000 au plus,
et affiche sa couverture (sur le rapport du 2026-10-25 : 97,6 % des octets en double). Les
chiffres portent toujours sur les groupes lus. Sur mobile, la légende complète et le commentaire
de l’étape sont dans les détails repliables ; une mention courte reste visible. Mentions : rien n'est lancé,
approuvé, déplacé ni supprimé ; la règle de conservation n'est pas une autorisation ; octets
logiques, espace physique libéré non mesuré. Les décisions et les actions passent par Data.

## Événements

Ils remontent du DOM : `diskx-ready` {source, roots, totalFiles, totalSize},
`diskx-group-shown` {sha256, places, links, outside}, `diskx-error` {stage, message},
`diskx-scene-changed` {index, count, kind, label, playing, script},
`diskx-coverage` {groupsRead, groupsTotal, bytesCovered, bytesTotal, complete, capped, failed} et
`diskx-block-selected` {path, name, extraBytes, keepBytes, unresolvedBytes, groups}.
Ce sont des reçus de présentation : aucun ne prouve qu'un fichier a été déplacé ou supprimé.

## Mobile et première frame

DiskX et `<agentx-ecosystem>` réutilisent le même contrôle de détails repliables.
À 820 pixels et moins, les détails et options sont fermés au départ ; les
commandes de lecture restent en bas, les labels sont réduits et limités. Sur
bureau les détails restent ouverts. Le clavier peut ouvrir/fermer les détails
sans déclencher les raccourcis de la visite.

`diskx-first-frame` et `ecosystem-first-frame` remontent une fois par montage,
après le rendu par la boucle existante du moteur. Leur champ `at` utilise
`performance.timeOrigin + performance.now()`. DiskX attend le groupe demandé
si l'attribut `group` est présent, sinon la ville prête. Le reçu de DiskX porte
aussi `mountToFrameMs`. Un démontage retire l'observateur. Ces événements ne
signifient ni fin de chargement du document, ni réception sur un écran physique,
ni résultat Nestor. Core mesure séparément ces étapes avec son propre lecteur.

## Vérification

`npm run smoke:diskx-embed` après un build : page hôte façon Core, routes simulées, aucune
requête hors origine, reçus, dimension imposée par la page, refus des attributs invalides.
`npm run smoke:diskx-show` : chaque scène sur la démonstration sans changer le document, et sur
une page façon Core la liste par défaut, la lecture paginée, les scènes, la sélection et les
gestes, une visite, un `play` changé en direct, les refus, GET seulement.

## Report version and presentation lifecycle

The optional `report` attribute is the UTC generation date returned by Core. Summary, page and named-group reads must match that version; changed or missing group versions are refused before a presentation is shown. Equivalent ISO timestamps are compared as instants.

`diskx-report-read` carries `reportGeneratedAt` and `reportId` after a coherent report read. `diskx-group-shown` carries those fields with the selected SHA-256 and coverage. `diskx-ready` only attests the inventory mount. These events are presentation observations, never file execution receipts.

A mount failure immediately releases its host. Disconnect releases app and host even if app disposal fails, and reconnect removes the prior error state. Relation replacements validate all places and links before releasing the previous picture; one picture accepts at most 64 unique places and 256 links.

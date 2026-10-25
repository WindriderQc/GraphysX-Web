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

La page hôte dimensionne l'élément (`diskx-city{position:fixed;inset:0}` par exemple). Le style
par défaut a une spécificité nulle et ne gagne jamais contre celui de la page.

## Lectures (GET seulement, même origine)

`storage/summary`, `storage/tree?root&limit`, `storage/files?root&limit&sort`,
`janitor/strategy/latest`, `janitor/strategy/latest/groups?offset&limit` et `?sha256=` pour un
groupe nommé. Pas de capacité de volume : la tuile d'espace libre reste absente tant que Data ne
l'expose pas.

## Événements

Ils remontent du DOM : `diskx-ready` {source, roots, totalFiles, totalSize},
`diskx-group-shown` {sha256, places, links, outside}, `diskx-error` {stage, message}.
Ce sont des reçus de présentation : aucun ne prouve qu'un fichier a été déplacé ou supprimé.

## Vérification

`npm run smoke:diskx-embed` après un build : page hôte façon Core, routes simulées, aucune
requête hors origine, reçus, dimension imposée par la page, refus des attributs invalides.

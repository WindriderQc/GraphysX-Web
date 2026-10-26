# NetX — le réseau de la maison, en quartier

`?app=netx` ouvre l'inventaire réseau d'AgentX Data en 3D : le réseau au centre, chaque appareil
posé **à l'angle de son adresse** (le dernier octet autour du cercle) sur **l'anneau de son état
d'observation** — en ligne à l'intérieur, vu récemment au milieu, plus vu à l'extérieur. Un
appareil qui se tait dérive vers l'extérieur d'un balayage à l'autre ; les plages DHCP se lisent
comme des arcs pleins ou vides. Les collecteurs sont des phares entre le centre et l'anneau
intérieur : celui qui rapporte balaie un faisceau, les muets sont éteints. Les appareils sans
nom, sans fabricant et plus vus (des MAC aléatoires, presque sûrement) s'alignent en fantômes sur
l'arc « Passages », pas un bâtiment chacun pour toujours.

Lecture seule, v1. Rien ici ne nomme, ne scanne ni ne commande un appareil ; la conception et ce
qui attend côté AgentX sont dans [NETX_PROPOSAL.md](NETX_PROPOSAL.md).

## Où vivent les choses

| Rôle | Fichier |
| --- | --- |
| Modèle pur : états (la règle de Data reproduite), familles de fabricants, filtres de la Toolbox, placement déterministe, phrase de fraîcheur de Nestor | `src/netx-data.ts` |
| Composition du monde v2 : anneaux, hub, phares, corps par type, caisse translucide, cage pointillée, balise ambre | `src/netx-scene.ts` |
| Sources : AgentX Data via `/diskx-api/network/*`, repli sur la capture synthétique | `src/netx-source.ts`, `src/netx-fixture.json` |
| Surface : HUD (fraîcheur, compteurs, collecteurs, filtres, recherche, liste), fiche, étiquettes projetées, caméra, clic | `src/netx-app.ts`, `src/netx.css` |
| Relais lecture seule (trois GET de plus dans la route DiskX) | `scripts/diskx-server.mjs` |
| Tests Node et smoke navigateur | `test/netx.test.mjs`, `test/diskx-route.test.mjs`, `scripts/smoke-netx.mjs` |

Chaque appareil est un `box` ou un `cylinder` ordinaire créé par `api.create`, dont les tags
portent sa clé (`netx-device:<mac>`, ou `netx-device:ip:<adresse>` sans MAC), son état
(`netx-state:online`), son type (`netx-type:unknown`), sa famille, s'il est reconnu
(`netx-known:false`), le collecteur qui l'a vu (`netx-source:ugfrank`), `netx-new` et
`netx-transient`. Un agent lit « qui est en ligne » avec `api.query({ tag: "netx-state:online" })`.
Filtres, halos, étiquettes et caméra sont de la présentation : les appareils filtrés sont cachés
dans la scène, le document ne change pas (le smoke le compare avant et après).

## Ce que la vue dit, et ne dit pas

- **L'état vient de l'âge de `lastSeen`, jamais du drapeau brut.** Data publie 55 appareils
  `status: online` dont 21 ne sont plus vus depuis des jours ; la vue montre 31 / 3 / 21 avec les
  fenêtres écrites dans le HUD (30 min = deux balayages, 24 h). Quand Data livre déjà
  `observation.state`, il gagne ; la capture n'en a pas et la même règle tourne ici.
- **La forme vient du type enregistré, la couleur du fabricant.** Un type hors de la liste de la
  Toolbox (vu en production : `3d-printer-controller`) est gardé en texte, nommé dans la fiche
  et dessiné comme une caisse. Une famille de fabricant ne décide jamais de ce qu'est l'appareil.
- **Plein : nommé ou marqué connu. Pointillé : personne ne l'a reconnu. Ambre : apparu depuis
  24 h.** La même lecture que l'alerte « nouvel appareil » de Core et que la Toolbox.
- **La fraîcheur est la phrase de Nestor**, mot pour mot (`networkInventory.js`) : « Dernier scan
  il y a 7 min. », ou « Inventaire périmé : … » qui grise le bandeau.
- Aucune devinette du modèle (elle vit dans l'alerte, pas sur l'appareil), aucun port ni OS
  tant que Data n'en publie pas, aucune jointure avec les appareils MQTT.

## Données et branchement

Trois lectures du gateway (`/api/data-toolbox/network/devices`, `/agents`, `/capability`), sans
CORS, donc relayées par la route de même origine `/diskx-api/network/*` (GET seulement, aucun
paramètre). Les écritures de la Toolbox (`PATCH` d'un appareil, demande de scan) ne sont pas
relayées en v1.

```bash
DISKX_DATA_URL=https://agentx.specialblend.icu npm run dev
```

Sans la variable (site statique public, poste hors LAN), la vue s'ouvre sur la capture
synthétique et le bandeau le dit. **La capture ne contient aucune adresse réelle** : TEST-NET-1
(`192.0.2.0/24`) et des MAC administrées localement (`02:…`), dans les proportions de
l'inventaire lu le 2026-10-26 (55 appareils, 31 en ligne, 13 sans fabricant, 2 nommés, 3
collecteurs dont 1 actif). `?source=fixture` la force. Le test `netx.test.mjs` refuse toute
adresse `192.168.` dans la capture.

## Vérification

- `node --test test/netx.test.mjs` : classification identique à Data (quatre états, fenêtres,
  priorité à `observation.state`), clé MAC ou adresse, type hors liste gardé en texte,
  transitoires, familles, inventaire depuis les trois corps avec l'heure de référence de Data,
  les trois phrases de fraîcheur, filtres et recherche de la Toolbox, placement déterministe
  (angle = octet, rayon = état, pas radial stable à adresse partagée, arc des passages), capture
  synthétique sans adresse réelle, source vivante et repli, document v2 (une entité principale
  par appareil et par collecteur, ids uniques, tags, un seul faisceau, cages et balises comptées).
- `node --test test/diskx-route.test.mjs` : les trois GET relayés, scan et `PATCH` refusés.
- `npm run smoke:netx` (après `npm run build`) : quartier depuis la capture, 55 entités taguées
  sur leurs rayons, HUD, filtre « En ligne » → 31 visibles et document inchangé, recherche,
  vrai clic 3D sur `imprimante-wifi` et sélection par la liste, `Échap`, mobile, un seul appel
  au relais (`config`), retour au Center. Inscrit dans `scripts/verify-manifest.mjs` (palier
  `apps`). Captures dans `output/verify/netx-*.png` ; regarde-les.

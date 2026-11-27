# Suivi de la reprise des archives

Ce suivi est tenu dans **le produit actuel**. L’archive `GraphysX` reste en lecture seule.
Le [registre structuré](revival-status.json) relie chaque découverte à ses sources,
à son implémentation, aux limites connues et aux contrôles qui la vérifient.
Les commits et descriptions de PR conservent les résultats de validation et de publication.

## Retrouver l’ensemble du dossier

- [Audit des sources natives](legacy-revival-audit.json) et [bilan de reprise](REVIVAL_AND_UX.md) : projets C++/C#, doublons par empreinte, références aux médias et rapprochements connus. Cet inventaire reste daté ; il ne certifie pas une équivalence complète du produit.
- [CubZ](CUBZ_MENU.md), [boutons internes](CUBZ_BUTTONS.md) et [CubX/Atmel](CUBX_ATMEL.md) : modèles, pivots, animations, actions reconstruites et limites matérielles.
- [Impreza](IMPREZA_REVIVAL.md), [FlightX](FLIGHTX_REVIVAL.md) et [modes de vol](FLIGHTX_MODES.md) : modèles, comportements, pistes et différences avec les moteurs natifs.
- [Anciens aperçus](PREVIEWS.md) : registre technique complet, rapproché ci-dessous du contenu réellement accessible.

La réconciliation détaillée des 54 fiches historiques avec les destinations actuelles reste
une recherche ouverte dans le registre. Les deux nouveaux portages ne sont pas une déclaration
que toutes les archives ou tous les petits jeux sont terminés.

## États et preuves

- **Découvert** : un fichier ou comportement a été identifié, avec chemin et empreinte.
- **À examiner** : sa composition, ses liens ou son équivalent actuel restent à établir.
- **Porté** : le contenu utilise le moteur actuel et peut passer dans le Studio.
- **Adapté / reconstruit** : une partie actuelle est distinguée de ce qui provient de la source.
- **Non établi** : la recherche n’a pas encore prouvé un fichier, une liaison ou un comportement.
  Cela ne signifie pas « définitivement perdu ».
- **Validé / déployé** : uniquement avec les résultats du commit concerné. La CI, les parcours
  navigateur locaux, les fichiers publics et le matériel physique ont des réceptions distinctes.

Le recensement historique de juillet compte **54 scènes/écrans**. Ses anciens chiffres
« 7 restaurés / 47 partiels » ne mesurent pas l’achèvement du produit actuel.
Les **17 anciens aperçus non convertis** ne sont pas 17 scènes manquantes : le registre
les rapproche de leurs équivalents actuels et conserve les recherches encore ouvertes.

## Lot Playground et Dominus — 2026-11-26

| Expérience | Sources conservées | Portage actuel | Limites explicites |
| --- | --- | --- | --- |
| Three.js Playground | 12 fichiers de code identifiés par SHA-256 ; 9 fichiers de rendu inchangés | Avion GLB, trois planètes, trois sphères déformées, cube, ligne, terrain, réglages et animations dans un monde v2 éditable | Caméra/éclairage adaptés, terrain déterministe ; rotations X des planètes proposées comme option actuelle |
| Dominus | 65 modèles ; 28 placements du catalogue ObjectLibrary ; textures d’origine | Vue des placements et galerie distincte de tous les modèles, conservées ensemble dans le même document Studio | La galerie est une présentation actuelle ; les sources attestent d’un environnement WIP, pas d’un village terminé |

Les manifestes [Playground](../public/assets/ports/archive-playground.json) et
[Dominus](../public/assets/ports/archive-dominus.json) donnent les chemins, empreintes,
dimensions, nombres de sommets/triangles et liaisons aux modèles réellement publiés.
Les maillages ne sont pas remplacés par des volumes de substitution.

### Découvertes de ce lot

1. **Deux modèles étaient lisibles malgré leur ancien statut non décodé.** Le format
   DirectX binaire `xof 0303bin 0032` est maintenant converti hors ligne avec contrôles
   de taille, comptages, indices, matériaux et transformations. `port_crateshed.X` apporte
   274 sommets, 176 triangles et quatre matières ; `renzokscale.X` apporte 917 sommets,
   1 118 triangles et son vrai `RENZOKDO.JPG`. Les anciens rapports restent conservés
   comme instantanés ; le nouveau manifeste décrit la récupération actuelle.
2. **Trois anciens curseurs n’animaient rien.** Les mises à jour X des planètes étaient
   commentées. Leur nouveau comportement est une option explicitement actuelle.
3. **Un import ne prouve pas une composition.** `SceneSubject` était importé mais commenté
   dans `createSceneSubjects` ; il n’est pas ajouté comme un objet d’origine.
4. **Le pack et le monde sont deux preuves différentes.** Les 65 modèles Dominus existent,
   tandis que la composition retrouvée reste le sous-ensemble de 28 placements du catalogue.

### Reproduire la comparaison des sources

```powershell
node scripts/vendor-playground-dominus.mjs --archive=C:/Users/Yanik/codes/GraphysX --playground="E:/Media/Datalake/Codes/SBQC/public/Projects/3D Playground" --check
node --test test/archive-revivals.test.mjs
npm run verify -- --wait --checks=revival-playground,revival-dominus,revival-lifecycle
```

Sans `--check`, le convertisseur écrit uniquement dans ce checkout du produit et ses
fixtures de test. Il ne répare, n’extrait et ne remplace rien dans les archives.
Les deux binaires originaux utilisés par les tests sont conservés à l’identique dans
`test/fixtures/dominus/`, avec leurs empreintes dans le manifeste.

Le Studio garde les modèles, réglages, animations, objets masqués et ajouts de l’utilisateur.
Les visites changent de vue par les commandes v2 habituelles. Les fichiers enregistrent
la scène et ses comportements ; l’animation repart avec l’horloge du monde lors d’une
réouverture, plutôt que de prétendre conserver un curseur de lecture natif.

## Prochaines recherches

Le registre sépare les mondes XML et leurs chemins ambigus, les pistes/variantes de slides,
les effets de particules, les petits jeux historiques, les véhicules, le rendu natif et
les protocoles/matériels. Chaque nouveau lot doit actualiser ses lignes et ses preuves.
Une absence de résultat sur les noms de fichiers ne suffit pas à conclure à une perte.
Les anciennes versions des archives compressées restent une piste de recherche distincte.

Ce suivi n’autorise aucune suppression de l’archive historique.

# GraphysX — revue UI/UX et direction produit

Revue du 19 novembre 2026. Référence publique observée : `f3edbce`, run `44504456160`.
Cette revue prolonge le [registre de récupération](REVIVAL_AND_UX.md), qui reste la
référence pour les sources historiques. Les priorités ci-dessous décrivent le produit
observé, sans transformer l'ancien inventaire de 54 scènes en score de complétion actuel.

Le lot suivant, demandé après cette revue, apporte maintenant **Studio simple et Mes créations**.
Le [guide du parcours](STUDIO_AND_MY_CREATIONS.md) documente l’édition, les sauvegardes locales,
les brouillons, l’export de secours et le passage au mode complet. Les observations publiques
historiques ci-dessous gardent leur référence ; la qualification de ce nouveau lot est distincte.

## Ce que doit comprendre une première visite

GraphysX propose trois intentions principales : **vivre une expérience**, **créer une
variante**, **construire dans le Studio**. Les archives racontent l'origine des expériences ;
le laboratoire accueille les études. Une scène spectaculaire ne doit pas obliger à apprendre
l'éditeur avant de pouvoir l'explorer.

L'accueil possède déjà une découverte caméra, une évolution ADN, une création guidée et
un accès au Studio. La bonne suite consiste à rendre ces chemins compréhensibles et à
soigner leur continuité, puis à donner aux reprises historiques une entrée adaptée.

| Entrée | Intention et destination | Statut et limites |
| --- | --- | --- |
| Accueil | Observer les systèmes vivants, essayer une génération, choisir une activité | La promenade existante visite les vrais systèmes ; le geste manuel reprend la caméra |
| Créer une variante ADN | Choisir une mutation, observer ses effets physiques, enregistrer, ouvrir dans le Studio | Parcours spécialisé déjà livré ; conserver ce chemin court |
| Créer une scène | Construire avec un accompagnement initial | Évite d'exiger la connaissance de toute la palette du Studio |
| Créations | Découvrir des expériences sélectionnées et des scènes éditables | NACRE devient la mise en avant, avec une vraie image et une action explicite |
| Jouer | Lancer BallZ, Ballsy ou Cyber Race ; retrouver les anciens parcours via Archives | Clavier, tactile et simulations de manette ne valent pas réception avec les manettes réelles |
| Studio | Choisir, modifier, simuler et enregistrer simplement ; ouvrir le mode complet au besoin | Une seule World API et un document complet ; français des outils avancés encore à harmoniser |
| Mes créations | Retrouver, copier, exporter et rouvrir scènes locales et brouillons | Lieu de stockage explicite ; pas de synchronisation automatique ni de migration silencieuse |
| Ateliers / Créer et apprendre | ADN, Math Lab, KidX | Math Lab distingue nombres/calculs et formules ; KidX reste une expérience enfant dédiée |
| Ateliers / Explorer en 3D | NACRE, atelier VR, LLMx, île d'Eko | NACRE fonctionne sur écran et en VR ; les fonctions connectées et le casque ont leurs propres conditions |
| Ateliers / Données AgentX | DiskX, Ecosystem, NetX | Les écrans d'entrée fonctionnent hors connexion ; les données réelles demandent le service privé |
| Archives | CubZ, Impreza, FlightX, Maison/Cuisine, Arena, Common Room, Notes et autres reprises documentées | Géométrie retrouvée, moteur adapté et comportement nouveau sont distingués |
| Laboratoire | Prototypes, anciennes études et essais | Une étude ne devient pas automatiquement une création sélectionnée |

Les deux catalogues gardent **Créations / Archives / Laboratoire / Tout**. La recherche
s'applique à la collection choisie. Favoris et récents changent l'ordre, jamais la provenance.
Une carte indique désormais l'action réelle : explorer la station, prendre le volant,
choisir un vol, visiter les deux scènes ou ouvrir dans le Studio.

## Constats et corrections de cette livraison

| Constat reproduit | Effet pour l'utilisateur | Correction |
| --- | --- | --- |
| Une partie des commandes communes des galeries était en anglais | Rupture avec l'accueil français | Libellés communs, métadonnées de composition, recherche et favoris en français |
| Fermer Créations, Archives ou Jouer ramenait le focus sur Studio | Le clavier perdait le contexte d'entrée | Retour au bouton qui a ouvert la galerie ; confinement de Tab conservé |
| Aucun résultat de recherche : seule une remise à zéro générale des préférences était proposée | Risque de perdre ses favoris pour récupérer une liste vide | « Effacer la recherche » conserve les favoris, les récents et la collection ; remise à zéro renommée explicitement |
| Le compteur utilisait l'ensemble du catalogue comme dénominateur | Une collection paraissait cacher des résultats sans explication | Compteur limité à la collection active |
| Des cartes d'applications semblaient toutes offrir exploration et édition | On ignorait ce qui se passait au clic | Action propre à chaque destination et badge de collection sobre |
| NACRE avait un aperçu générique malgré son monde détaillé | Le catalogue ne montrait pas sa meilleure expérience spatiale | Image capturée dans le vrai rendu, une seule carte mise en avant, mention écran/mobile/VR |
| Ateliers présentait une liste de noms hétérogènes | Il fallait connaître les projets pour choisir | Trois groupes par intention, liens et boutons visuellement cohérents, cibles principales de 44 px |
| Maison/Cuisine ouvrait directement les commandes avancées | Les volumes étaient visibles, mais l'entrée exigeait de comprendre l'éditeur | Visiteur dédié, choix de composition et de lumière, points de vue, balade interruptible, accès Studio explicite |
| Le lien vers Core dans LLMx était bleu et peu lisible sur fond sombre | L'action permettant de poursuivre la conversation était difficile à identifier | Style lisible et cible de 44 px ; aucun changement de destination ou de profil |
| Le réglage d'affichage recouvrait les commandes de la nouvelle visite sur téléphone | Collision entre deux zones interactives | Placement propre à la visite ; panneau défilant dans les écrans bas |
| Sur un écran court, les explications répétées prenaient trop de place au-dessus des cartes | Le catalogue ne montrait qu'un fragment d'aperçu | En-tête compact aux petits formats ; réglage d'affichage extérieur masqué pendant le dialogue |
| Maison ou FlightX ouvert depuis Archives gardait l'adresse de l'accueil | Un rafraîchissement revenait à l'accueil ; les options de caméra pouvaient dépendre du point d'entrée | Ouverture par l'adresse dédiée, comme CubZ et Impreza ; tests d'entrée catalogue, choix et rafraîchissement |

Le retour du focus suit le [modèle de dialogue WAI-ARIA](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
La cible de confort retenue pour les nouvelles commandes tactiles principales est 44 px.
Le [critère WCAG 2.2 AA de taille minimale](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
utilise 24 px avec des exceptions d'espacement : cette revue ne déclare pas tous les anciens
contrôles inférieurs à 44 px non conformes, et ne constitue pas une certification d'accessibilité.

## Maison & Cuisine : retrouver, visiter, modifier

Ouvrir `/?app=maison` présente les **24 pièces de Maison** et les **76 pièces de Cuisine**,
avec trois points de vue pour chacune. Jour et soir sont des éclairages actuels. La balade
utilise la caméra et la boucle existantes du moteur. Pause, reprise, glissement manuel,
perte de focus et préférence de mouvement réduit ont des comportements explicites.

Les deux compositions Blender sont indépendantes : la visite n'invente pas un raccord
historique entre la maison et cette cuisine. Géométries, placements, noms et couleurs
diffuses des modèles viennent des exports. Les matériaux Phong restent des matériaux
Phong. Les valeurs d'émission par défaut sont adaptées pour donner du relief à la lumière,
sans remplacer les valeurs déjà écrites par l'auteur. Le sol de présentation, les lumières
et la promenade sont des ajouts actuels ; la photographie externe de Cuisine reste absente.

Changer de vue ou d'ambiance conserve les objets ajoutés, les noms et les matières des
modèles. Le Studio reçoit ce document entier. Save conserve une variante locale ; Export
produit un document transportable. La composition brute et l'étude de volumes restent
accessibles séparément via `/?app=maison&view=source`. La comparaison s'ouvre dans un autre
onglet afin de garder le travail en cours dans le visiteur.

Un chargement incomplet ne s'annonce pas prêt. Une erreur propose de réessayer en gardant
le document. Si une autre scène remplace le monde courant, le visiteur cesse d'intervenir
et propose le Studio, sans reconstruire la maison par-dessus cette scène.

## Parcours et correspondance avec le code

| Parcours ou responsabilité | Sources principales | Vérification reproductible |
| --- | --- | --- |
| Accueil, ouverture/fermeture des destinations, transfert Studio | `src/main.ts`, `src/showroom-welcome.ts`, `src/showroom-center.css` | `smoke-ux-navigation`, `showroom`, `revival`, `ballsy-entrypoints` |
| Cartes, collection, recherche, préférences, aperçus | `browse-shelf.ts`, `games-shelf.ts`, `shelf-personalization.ts`, `shelf-thumbnails.ts` | `ux-navigation`, `top20`, `games`, `previews` |
| Données natives et présentation Maison | `archive-worlds.ts`, `maison-visit.ts` | `test/maison-visit.test.mjs`, `archive-worlds` |
| Visite Maison, caméra et transfert du document | `maison-app.ts`, `maison.css` | `smoke-maison`, `revival` |
| Conversation LLMx | `llmx-conversation.ts`, `llmx.css`, transport et profils existants | Famille de smokes LLMx ; lien réel inspecté sur la livraison publique |
| Fidélité des sources et archive | `docs/REVIVAL_AND_UX.md`, registres propres à CubZ/Impreza/FlightX | Comparaisons de sources et hashes ; l'archive historique reste conservée |

Les présentations n'ajoutent ni une deuxième API de monde, ni une deuxième boucle de rendu.
L'interface effectue les changements de document par les transactions ordinaires de l'API.
La caméra de visite est une présentation ; elle ne modifie pas la simulation en pause.

## Couverture de la revue

La référence publique a été identifiée avant et après les captures. **46 états d'entrée et
de navigation** ont été capturés : 22 pour accueil/ateliers/catalogues/recherche/retour
clavier/jeux/maison/cuisine/Studio et 24 pour création, KidX, Math Lab, NACRE, LLMx, VR,
DiskX, Ecosystem, NetX et île, sur ordinateur et téléphone. Les reçus ne relèvent ni erreur
de navigateur ni débordement horizontal de page. Les écrans représentatifs ont été
inspectés visuellement ; le Studio possède un défilement interne volontaire de sa barre
mobile, distinct d'un débordement de page.

Les captures des applications connectées sont restées hors service réel : aucune requête
externe ou mutation de serveur n'a été exécutée pour cette revue d'entrée. Les parcours
ADN, CubZ, Impreza et les deux présentations FlightX avaient aussi été reçus sur cette même
révision publique dans la livraison précédente. Cela complète la référence ; ces preuves
ne qualifient pas à elles seules la nouvelle version.

Les nouvelles vérifications incluent les trois points de vue de chaque composition,
les deux éclairages, la balade réelle jusqu'à sa fin, pause/reprise et interruption,
390/320 px et paysage, le mouvement réduit, les erreurs de chargement récupérables,
le document étranger, les modifications conservées, la comparaison source, l'entrée depuis
Archives suivie d'un rafraîchissement conservant la composition ou le mode, et le parcours
Studio → Save → Export → rechargement. Les contrôles de catalogue couvrent recherche vide,
préférences, compteurs, actions, vraie image, Tab/Escape et retour du focus.

Commandes locales, à sérialiser sous le verrou de vérification du projet :

```powershell
npm run verify -- --wait --checks=maison,ux-navigation,archive-worlds,revival
npm run verify -- --wait
```

Les reçus de travail sont conservés dans `output/ux-revival/` : `baseline/receipt.json`,
`apps-baseline/receipt.json`, les études `maison-studies/`, les captures et sorties du client
de jeu. Le gate écrit dans `output/verify/`. Les résultats finaux de livraison, l'identité
publique et les contrôles après activation sont enregistrés dans
`output/ux-revival/delivery.json`. Ces fichiers de preuve sont locaux et ignorés par Git.

## Ce qui reste à améliorer, dans l'ordre

La reprise CubX/Atmel ajoute une autre composition source au même point d’entrée CubZ,
recherchable par « Atmel », avec trois vues et une copie modifiable dans le Studio.
Les 32 boutons internes CubZ restent une famille distincte, encore non retrouvée.
Le rechargement des scènes personnelles cadre désormais la géométrie visible après le
chargement des modèles, dans l’espace dégagé du Studio. Ce cadrage s’annule si une autre
scène ou un geste de caméra prend la main. Voir [CUBX_ATMEL.md](CUBX_ATMEL.md).

1. **Studio abordable par tâche : implémenté dans ce lot.** Sélection, transformations,
   couleur par pièce native, simulation, annulation et sauvegarde utilisent le même éditeur.
   Le cadrage évite les panneaux ; sur téléphone il replie l’inspecteur. Mode complet garde
   les outils avancés. Leur français et celui des réglages d’affichage restent à harmoniser.
2. **Reprise des créations : implémentée dans ce lot.** L’accueil, le Studio et le catalogue
   ouvrent la même bibliothèque locale. Scènes anciennes, variantes ADN, créations guidées
   et brouillons restent accessibles ; copie, export, conflit et erreur de stockage ont des
   réponses explicites. Le serveur optionnel garde sa destination distincte. La réception
   comprend une vraie fermeture/réouverture du navigateur, sans injection de storageState.
3. **Unifier les transitions entre expériences.** Généraliser progressivement les verbes
   vivre/modifier/revenir et le transfert du document à d'autres reprises qui ouvrent encore
   directement le Studio. Garder une seule carte par destination. Commencer par Common Room
   et les présentations visuelles dont la matière mérite une visite courte.
4. **Poursuivre la récupération par preuve.** Prioriser les modèles/ambiances et comportements
   réellement référencés par les projets C++/C#, puis livrer une interaction testable. Une
   donnée convertie ou un fichier portant le bon nom ne prouve pas une scène complète.
5. **Réception humaine et accessibilité approfondie.** Essai sur téléphone réel, clavier avec
   lecteur d'écran, contraste systématique, casque et manettes, audio/micro et backend privé.
   Les captures, transports simulés et contrôleurs synthétiques ne remplacent pas ces essais.

Après ce lot, la prochaine amélioration produit concerne **les transitions des autres
expériences et la poursuite de la récupération par preuve**. Les outils avancés, les essais
sur appareils réels et les reprises historiques restantes gardent leur travail de finition.

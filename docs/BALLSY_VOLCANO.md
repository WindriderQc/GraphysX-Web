> Version suivante : [pelle physique et terrain creusable](BALLSY_SHOVEL.md). Les contrôles de canaux décrits ci-dessous sont historiques.

# Ballsy — volcan et géant facultatif

> Guide actuel : [préparer une vraie partie](BALLSY_PLAYTEST.md). Le suivi ajoute les
> contrôles guidés, le placement devant le parent et une voie USB locale documentée.

Suite locale du socle `5498f04`, dans `/home/yb/codes/GraphysX-Web-ballsy-volcano-20261106`,
branche `codex/ballsy-volcano-giant`. Le volcan et la liaison à deux navigateurs sont
implémentés. Le parcours WebXR est testé en émulation Quest 2; la réception sur le casque
et les manettes physiques reste à faire. La [roadmap initiale](BALLSY_ROADMAP.md) conserve
les autres jeux et les critères de réception. Aucune publication, PR, fusion ou mise en
production n'est effectuée.

## Partie disponible

`/ballsy.html` ouvre le volcan. La piste neutre reste dans le sélecteur du lobby et à
`/ballsy.html?course=practice`. Deux balles concurrentes, une caméra commune, deux tours,
trois portes ordonnées par tour, fin individuelle et revanche réutilisent les règles et
la physique natives. Le casque est facultatif. Un troisième joueur peut être géant à la
souris sur le même écran ou dans une autre fenêtre connectée.

Le flux vaut une unité par seconde. En mode aide, une crue annoncée le porte à deux
pendant quatre secondes toutes les douze secondes, après les douze premières secondes.
Le modèle compte la lave entrée, drainée, retenue dans les canaux et débordée : le débit
réparti ne se duplique jamais. Ce sont des réservoirs simplifiés et des canaux prédéfinis.
Le creusement libre du terrain et une simulation générale des fluides restent ouverts.

Le géant choisit une grande rivière, deux petits cours ou un détournement vers le bassin.
La pelle rejoint le poste, puis le joueur maintient trois repères successifs pendant
0,8 seconde chacun. Un clic instantané, une répétition de commandes ou un seul maintien
ne suffit pas. Après une annonce de 1,2 seconde, le choix agit sept secondes. La pelle
dispose de quatre charges par manche; le déplacement coûte 0,8 seconde au même poste,
2,5 secondes pour changer de poste. Ces valeurs de prototype sont dans `VOLCANO_LIMITS`.

En mode aide, Lagon ou Corail est l'objectif choisi avant le départ. Les canaux changent
le monde commun et peuvent profiter aux deux concurrents. Les crues laissées sans gestion
créent des flaques; une dérivation préparée à temps évite les débordements. En mode défi,
le géant gêne la course avec le même budget. Chaque petit cours est moins large et moins
pénalisant que la grande rivière à débit total égal. Le ralentissement agit aussi en roue
libre et laisse la balle avancer. Une voie sèche extérieure demeure ouverte, même après
les débordements. La pause fige lave et préparation; la revanche remet les volumes et les
charges à zéro.

Les conséquences sont déterministes dans cet incrément. Aucun aléatoire ne se substitue
à la validation du choix et du timing. Chantier/grue, jungle/lianes, village, Technic,
construction, double coque/liquide interne et lanceur de peinture restent des sujets
distincts. Le moteur partagé, les autres applications et Cyber Race ne sont pas modifiés.

## Contrôles et liaison

- Coureurs : flèches/Espace et WASD ou ZQSD/Majuscule, ou deux manettes dont le navigateur
  rapporte le profil `standard`. Start gère départ/pause/reprise. Le logiciel est testé
  avec des manettes synthétiques; aucune marque physique n'est qualifiée ici.
- Géant à l'écran : choisir le canal, attendre la pelle, maintenir 1 puis 2 puis 3.
  Les touches numériques permettent également ce parcours.
- Sur la télé, « Inviter un géant » affiche un code de huit caractères quand le relais
  privé est lancé. Ouvrir `/ballsy-giant.html` sur la même adresse et saisir le code.
  Le géant connecté détient seul la pelle; la souris locale reprend après son départ.
- Sur Quest, le bouton explicite « Devenir le géant en VR » demande la session WebXR.
  La piste mesure environ 1,6 mètre sur une table virtuelle fixe. Les deux contrôleurs
  disposent d'un rayon : pointer un choix puis presser la gâchette; maintenir ensuite
  chacun des trois repères. Déplacer le rayon hors du repère relâche le geste.
- Le bouton 3D « Sortir VR » rend la pelle. La course continue sur la télé. Le refus de
  l'autorisation VR laisse le rôle utilisable à la souris. Aucun déplacement de tête
  imposé, pilotage par les mains ou mode de réalité mixte n'est revendiqué.

Le PC reste l'unique autorité pour la physique, les tours, le temps et les ressources.
Le second navigateur reçoit des positions et l'état du volcan environ dix fois par
seconde et interpole seulement leur présentation. Il ne simule pas une deuxième course.
Le relais accepte uniquement `route`, `dig` et `release`, vérifie les formes, les rôles,
la manche, les bornes et les volumes, limite les files et les requêtes, et déduplique les
identifiants. Aucun accès distant à l'API générale de scène n'est exposé.

Un maintien distant doit être renouvelé; après 450 ms sans nouvelle confirmation, le PC
relâche le geste. Une présence inactive expire après 2,5 secondes. Les actions anciennes,
en pause ou d'une autre manche sont refusées. Une reconnexion peut reprendre une préparation
déjà payée sans consommer une deuxième charge. Après perte du PC, la maquette se fige et
cesse d'envoyer des gestes. Les jetons privés restent en mémoire, hors URL et stockage
persistant. Le code visible sert à rejoindre une partie temporaire, avec un seul géant.

## Lancer la prévisualisation privée

Sur devX, après installation des dépendances et compilation :

```bash
cd /home/yb/codes/GraphysX-Web-ballsy-volcano-20261106
node scripts/with-verify-lock.mjs -- npm run build
npm run serve:ballsy -- --host 127.0.0.1 --port 4196
```

Le serveur écoute le loopback par défaut. Le tunnel Windows déjà utilisé conserve
`http://127.0.0.1:4196/ballsy.html` pour l'écran, et
`http://127.0.0.1:4196/ballsy-giant.html` pour un essai dans une deuxième fenêtre.
Le serveur Vite seul conserve la course locale mais ne fournit pas la liaison du géant.

En Wi-Fi, le Quest physique doit atteindre la **même adresse HTTPS privée**, avec un
certificat reconnu par son navigateur. En USB déjà autorisé, un transfert vers localhost
est également documenté dans le guide d'essai. Le loopback du PC seul n'est pas une
adresse accessible au casque. Le serveur
accepte un certificat et une clé fournis séparément :

```bash
npm run serve:ballsy -- --host <adresse-privee> --port 4196 --cert <certificat> --key <cle>
```

La tâche ne crée ni accès LAN/public, ni certificat de confiance, ni modification du
magasin de certificats, ni réglage du navigateur. La sonde TLS utilise un certificat
jetable uniquement dans son client de test, puis supprime ces fichiers. Ce test valide
le transport du serveur; il ne valide pas l'accès et la confiance du Quest réel.

## Preuves et reproduction

Les journaux sont dans `output/ballsy-volcano/`, dont le résumé textuel `regression.log`;
les captures et reçus JSON du runner sont dans `output/verify/`. Ils sont ouverts et inspectés, et ont
permis de corriger les coulées enfouies puis les commandes masquant l'avant de la maquette.

```bash
npm run typecheck
npm run lint
node --test test/ballsy-input.test.mjs test/ballsy-volcano.test.mjs test/ballsy-rooms.test.mjs test/ballsy-relay.test.mjs
npm run verify -- --no-build --checks=ballsy,ballsy-volcano,ballsy-giant,standalone,product-assets,asset-guard,cyber-race --wait
```

La sélection du runner est une régression ciblée, pas la vérification complète de toutes
les applications ni une autorisation de publier. L'entrée Vite et le build complet sont
vérifiés séparément. `iwer` est épinglé à `2.8.0` comme dépendance de développement pour
reproduire l'émulation; il n'est pas importé par le produit. Une installation propre par
`npm ci --ignore-scripts` a été vérifiée dans un dossier isolé.

Résultats du build final :

- TypeScript, lint complet et build produit : réussis. Les avertissements existants de
  taille des chunks et `inlineDynamicImports` sont conservés dans le journal du build.
- Suite Node : **945/945 réussis, sans skip**. Elle inclut les entrées, conservation,
  préparation, budget, crues, protocoles, rôles, déduplication, limites et transport HTTP.
  Le contrat d'impact étendu est aussi rejoué après la dernière correction de métadonnées.
- Runner ciblé : **10/10 contrôles réussis** — Node, heightfield et matériaux Rapier,
  Ballsy neutre, volcan et géant, standalone, Cyber Race, assets et garde d'assets.
- Volcan : **deux tours physiques par balle**, 3 854 frames déterministes, quatre
  dérivations préparées, aucun secours ni erreur console/page. À vitesse initiale égale,
  le contrôle en roue libre mesure 3,619 dans la lave contre 4,939 au sec après la même
  durée. Ce sont des vitesses de simulation, pas des mesures de performance du matériel.
- Géant : deux navigateurs, **deux vues stéréo IWER/Quest 2**, sélection par rayon et
  gâchette, trois maintiens distincts, budget débité une seule fois et projection des
  positions du PC. Sortie VR et reprise locale, redémarrage, perte brutale au milieu du
  geste, expiration, reconnexion et refus d'entrée VR avec reprise souris passent sans
  erreur console/page. `giant-report.json` et les captures du runner conservent la preuve.
- TLS : page HTTPS **200**, origine HTTPS acceptée **200**, mauvais schéma d'origine
  refusé **403**, certificat jetable supprimé, confiance système inchangée. Le reçu est
  `tls-report.json`; aucun casque physique ne participe à cette sonde.
- Client officiel `develop-web-game` : deux rafales, captures et états de jeu conservés
  dans `skill-final/`, sans erreur. Les captures écran, crue, stéréo et reprise sont
  ouvertes et inspectées.

## Prochain essai utile

Faire une courte session avec deux coureurs sur la télé et le parent au Quest : d'abord
recevoir l'adresse HTTPS privée et le certificat sur le casque, puis connecter les deux
manettes possédées, jouer une manche aide et une manche défi, sortir du casque au milieu
d'une préparation et relancer. Relever lisibilité depuis le canapé, geste compris sans
explication longue, confort, latence et temps de frame réels. [Meta indique que les moins
de dix ans ne peuvent pas utiliser les Quest 2/3](https://www.meta.com/quest/parent-info/);
les enfants peuvent jouer à l'écran.

Les performances du casque, son confort, les modèles Xbox/Nintendo en USB/Bluetooth,
le réseau réel et les règles de confiance HTTPS restent **non testés physiquement**.
Ces réceptions viennent avant un autre tableau ou l'extraction d'un système générique.

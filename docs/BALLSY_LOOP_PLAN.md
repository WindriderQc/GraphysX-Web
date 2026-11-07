# La Boucle du Volcan : audit et construction

## Audit avant modification

- `ballsy-input.ts` fournit une visée absolue à l'écran, une propulsion active et un frein séparé. Le joueur dirige réellement la bille. Ce n'est pas une piste gravitaire.
- La physique Rapier, le diamètre de 1,30 m, la force 28 et le plafond de 8 m/s sont conservés. Les anciennes bandes de boost invisibles ne s'appliquent pas à la boucle.
- L'ancien parcours était un rectangle plat, avec une grande dalle pleine et trois portes. Les captures non pausées confirment que ce défaut ne venait pas de l'overlay de pause.
- Le terrain creusable de 609 points, son collider synchronisé et la pelle physique existante sont préservés, dans la zone x=4..14, z=-7..7. La course ne nécessite jamais un géant.
- La vue géant, les poses de lame et l'autorité du PC restent en place. Aucun changement d'accès, de passerelle Quest ou de sécurité.

## Six sections dans le sens de la course

1. **Village départ** : large ligne devant le village, grille et damier. Départ vers la gauche.
2. **Corniche turquoise** : courbe ouverte au-dessus de l'eau, passage et dépassement possibles.
3. **Montée des fougères** : rampe continue, végétation basse à l'intérieur.
4. **Virage de la caldeira** : grand virage relevé, avec le volcan derrière les lignes de vue.
5. **Fourche des coulées** : arc extérieur facile ou pont intérieur en S, plus court et plus étroit. Les deux branches rejoignent la même progression ordonnée.
6. **Descente de basalte** : fusion évasée puis retour à la ligne, assez large pour se replacer.

## Géométrie livrée

La source partagée `src/ballsy-course.ts` décrit les positions, altitudes, largeurs, dévers et branches. Le mesh et les colliders de route et de rails utilisent les mêmes points.

- Route principale : 167,23 m, 420 segments ; largeur nominale 8,6 à 11,7 m.
- Bifurcation : 42,35 m par l'extérieur contre 31,81 m sur le pont, 120 segments.
- Pont : largeur minimale nominale 4,8 m, soit 3,7 diamètres de bille ; entrées et sorties évasées.
- Altitude de la route : environ 1,3 à 5,8 m ; caldeira relevée jusqu'à 24 % de dévers.
- Dalle épaisse de 0,62 m, murs latéraux continus, soutènements de basalte, piles de pont.
- Volcan décoratif centré vers (-3, -36), derrière le circuit.
- Caméra de jeu commune : position (0, 63, 47), cible (0, 0, -2). Pas de caméra de présentation substituée aux captures de course.

Les meshes sont soudés et quantifiés au dixième de millimètre. Des tests vérifient les plafonds du moteur : 4 096 sommets et 128 Kio par mesh, 32 768 sommets par scène.

## Règles et récupération

Deux tours, 32 portes ordonnées par tour, pas fixe de 1/60 s, arrivée dans le bon sens. Les deux branches représentent le même intervalle de progression. Un déplacement impossible, un demi-tour ou un raccourci à travers le décor ne donnent pas les portes manquantes.

Les commandes continues passent par `api.steerLive`, une entrée publique validée qui utilise le même intégrateur de direction et la même physique que `api.steer`, sans recopier le document dans l'historique à chaque échantillon de stick. Le chemin transactionnel existant reste inchangé. Des tests sur le vrai runtime Rapier comparent les deux chemins image par image et vérifient les frontières des entités transitoires, les données invalides et l'absence de modification de l'historique.

La lave et l'interpolation des billes du géant sont des projections visuelles de l'état autoritaire. Elles ne créent pas d'édition documentaire à chaque image. La terre creusée conserve son véritable changement de mesh et de collider via l'API à chaque révision.

Une sortie de piste de 0,8 s déclenche le retour à un point sûr déjà atteint. Le chrono ne revient pas en arrière et la récupération n'accorde ni vitesse ni progression. Une bille coincée malgré une commande active peut aussi être remise sur la piste ; l'arrêt volontaire et le frein ne déclenchent pas ce mécanisme.

## Ordre de travail et preuves

Audit et baseline, greybox physique, correction des défauts réels, courses continues, habillage, puis régressions et captures. Le mode `?greybox=1` reste disponible pour isoler la géométrie du décor.

Les premières courses avec des récupérations ont été rejetées, puis corrigées. La réception finale distingue les courses via entrées réelles, les probes artificielles de sécurité, les mesures de débit réel et les captures. Détails, résultats et limites dans `BALLSY_LOOP_TESTS.md`.

Le plaisir de jeu reste à confirmer par Yanik : aucune simulation automatique n'est présentée comme un playtest humain ni comme un test Quest.

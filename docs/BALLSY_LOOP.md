# Jouer à La Boucle du Volcan

Cette version locale remplace le rectangle par un circuit sur une île : montée, corniche, grand virage relevé, bifurcation et descente. La voie large et le pont en S sont deux trajets physiques distincts. Le terrain et la pelle restent utilisables, mais un géant n'est pas nécessaire pour courir.

## Démarrage sur UGBrutal

Dans `C:\Users\Yanik\codes\GraphysX-Web-ballsy-shovel`, ouvrir **Jouer-Boucle-du-Volcan.cmd**. Le lanceur sert uniquement le build de la boucle sur `http://127.0.0.1:4201/ballsy.html`. Garder sa fenêtre ouverte pendant la partie ; Ctrl+C arrête cette prévisualisation.

Cette adresse fonctionne sur UGBrutal seulement. Elle ne remplace pas l'ancienne prévisualisation ni la passerelle du casque. Aucun déploiement, push ou fusion n'est effectué par le lanceur.

Si le build doit être recréé, dans ce dossier :

    node scripts/with-verify-lock.mjs -- npm run build:ballsy-loop
    npm run serve:ballsy-loop

Le build isolé se trouve dans `output/volcano-loop/dist`. Le `dist` précédent est conservé.

## Commandes

- Lagon : flèches, Espace pour freiner.
- Corail : WASD ou ZQSD, Majuscule pour freiner.
- Manettes au profil standard : stick gauche, bouton du bas pour freiner. Appuyer sur un bouton pour les détecter. Le panneau « Tester les manettes » reste disponible.
- P : pause/reprise. F : plein écran. Entrée : démarrer/rejouer.
- Deux tours dans le sens des flèches. Prendre l'extérieur pour une trajectoire facile ou le pont intérieur pour gagner du temps en le négociant proprement.

Les numéros 1 et 2 suivent les billes. Elles ont aussi une et deux bandes claires pour les distinguer sans dépendre uniquement de leur couleur. L'arche devient transparente lorsqu'une bille passe dessous.

## Ce qui a été vérifié

Des commandes réellement envoyées au navigateur ont fait parcourir les deux tours à chaque pilote, l'un par la voie principale, l'autre par le pont, sans écriture de position pendant la course, sans saut ni sauvetage. Les contrôles de pause, reprise, revanche, redémarrage, plein écran, progression ordonnée et sens inverse sont couverts.

Les deux courses mesurées durent 93,80 s et 99,45 s au total. Ce ne sont pas des records humains ni une comparaison directe des branches : les trajectoires et contacts sur la partie commune diffèrent. Sur la seule bifurcation, les traces donnent environ 11,1 à 11,4 s par l'extérieur contre 6,0 à 6,2 s par le pont. Une erreur de direction suivie d'un freinage et d'une reprise coûte environ 5,6 s sur la portion comparée.

Les captures de jeu montrent la vraie caméra, à 1280×720 et 1920×1080. La vue du dessus annotée est explicitement une vue de repérage. La vidéo de 16 s montre des images réellement rendues et un pilotage via l'API Gamepad, sans HUD.

Le détail des mesures, régressions, essais rejetés et limites est dans `BALLSY_LOOP_TESTS.md`. Les preuves brutes locales sont dans `output/ballsy-loop/`.

La réception corrigée est dans `output/ballsy-loop/accepted/` ; les dernières captures générales et la vidéo isolée sont dans son sous-dossier `visuals/`. Le test actif de 10 s avec deux sticks continuellement variables mesure 73,26 FPS, p95 de 13,4 ms, sur Edge headless avec la RTX 5070 Ti d'UGBrutal. C'est une mesure locale, pas une garantie sur tout matériel. Les régressions piste découverte, panneau manettes et pelle distante desktop passent ; cette dernière a réellement excavé 2,86 m³.

## Limites importantes

Il s'agit de validation automatisée et d'inspection visuelle, pas d'un playtest humain. Le plaisir de conduite, la difficulté ressentie et l'équilibre à deux restent à confirmer en jouant. Aucune manette physique, session Quest ou expérience de confort VR n'est annoncée comme testée.

La qualification globale du dépôt n'est pas acquise : le palier intégral Node compte 922 tests réussis, 17 échecs et 36 annulations, liés aux chemins Windows de quatre suites hors modification. Les tests spécifiques au nouveau circuit et à la nouvelle commande continue passent. Ce travail local n'est donc pas présenté comme une release globale prête à publier.

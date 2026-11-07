# Ballsy : les ballons de slime du géant

Les ballons sont le premier jeu du géant : les prendre, les lancer sur la course, puis regarder l'éclaboussure. La pelle reste disponible comme outil secondaire. La course à deux fonctionne aussi sans géant.

## Ouvrir la version locale

Sur UGBrutal, dans `C:\Users\Yanik\codes\GraphysX-Web-ballsy-shovel`, ouvrir **Jouer-Ballsy-Slime.cmd**. Cette prévisualisation utilise le port 4202 et le build séparé `output/ballsy-slime/dist`. Elle ne remplace ni la boucle déjà livrée sur 4201, ni les anciens aperçus, ni la passerelle Quest.

Dans la course, choisir **Inviter un géant**, puis rejoindre depuis l'écran géant avec le code affiché. Le lanceur local écoute seulement sur UGBrutal. L'accès d'un casque externe exige un accès sécurisé adapté ; aucun accès ni certificat n'est modifié par cette livraison.

Pour recréer le build :

    $env:LOCALAPPDATA = 'C:\Users\Yanik\AppData\Local'
    node scripts/with-verify-lock.mjs -- npm run build:ballsy-slime
    npm run serve:ballsy-slime

## Le geste

- En VR, avec une manette en main, approcher d'un ballon visible, tenir la gâchette ou le bouton de prise, bouger le bras puis relâcher. La vitesse vient des positions récentes de la main. Il n'y a pas de visée automatique ni d'impulsion ajoutée.
- Sur ordinateur, saisir un ballon à la souris, le glisser puis relâcher. Ce mode est un équivalent souris explicite, pas une simulation de test matériel VR.
- Un relâchement immobile laisse tomber le ballon, sans lui inventer une vitesse.
- Perdre le suivi, masquer la page, changer d'outil, mettre en pause, recentrer la table ou quitter la session annule le geste tenu au lieu de provoquer un tir involontaire.

## Effet sur la course

Le PC de course décide de la trajectoire, de l'impact et du ralentissement. Un ballon peut toucher un coureur ou éclabousser la route. Le plafond de vitesse baisse de 25 % pendant 2 secondes, avec un freinage progressif de la vitesse horizontale. Le coureur garde sa direction et peut freiner. Une seconde d'immunité suit cet effet : les touches ne se cumulent pas et ne prolongent pas le même ralentissement. Le mouvement, les tours, les deux branches et les récupérations restent ceux de la Boucle du Volcan.

Un ballon par seconde évite le spam. Les ballons en vol et les éclaboussures ont une durée de vie courte et un nombre plafonné. La pause fige les effets déjà reçus et annule les ballons encore en vol ; une revanche remet les effets à zéro.

## État de validation

Le rapport `BALLSY_SLIME_TESTS.md` distingue les tests du modèle, les vrais événements souris et échanges réseau, le calcul du geste à partir de poses synthétiques et le matériel non testé. Aucun essai sur Quest physique ni intégration au nouveau socle VR général n'est annoncé sans preuve correspondante.

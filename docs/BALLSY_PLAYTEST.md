> Version suivante : [pelle physique et terrain creusable](BALLSY_SHOVEL.md). Les contrôles de canaux décrits ci-dessous sont historiques.

# Ballsy — préparer une vraie partie

Suite de `d32d979`, branche locale `codex/ballsy-playtest-readiness`, worktree
`/home/yb/codes/GraphysX-Web-ballsy-playtest-20261106`. La version volcan précédente et
son serveur `4196` sont conservés. Cette itération ajoute la vérification des manettes et
le placement de la maquette VR; elle ne publie rien et ne modifie aucun accès réseau.

## Jouer à l'écran dès maintenant

1. Sur le PC Windows, ouvrir <http://127.0.0.1:4198/ballsy.html>, puis « Plein écran »
   ou F. Le tunnel SSH local sert le nouveau worktree; le serveur écoute seulement le
   loopback de devX. L'ancienne adresse `4196` garde la version volcan précédente.
2. Connecter les deux manettes et appuyer sur un bouton de chacune pour que le navigateur
   les détecte. « Tester les manettes » affiche le modèle vu par le navigateur et les
   couleurs des deux joueurs. Faire un tour complet avec chaque stick gauche, le relâcher
   au centre, puis appuyer et relâcher le bouton du bas pour vérifier le frein.
3. Chacun obtient son propre état « Stick et frein vérifiés ». Un remplacement, une
   déconnexion ou un profil non standard annule la validation concernée. « Enregistrer le
   test » télécharge un petit JSON local : modèles, mapping, nombres d'axes/boutons et
   gestes observés. Il ne contient ni code de partie, ni jeton, ni identifiant de salle.
4. « Revenir au jeu », choisir aide ou défi, puis « C'est parti ». Le test reste facultatif;
   les deux claviers sont disponibles : flèches/Espace et WASD ou ZQSD/Majuscule.
   Les manettes standard pilotent au stick gauche, freinent au bouton du bas et utilisent
   Start pour départ/pause/reprise. Start ne lance pas une course pendant le test guidé.
5. Les deux balles restent concurrentes. Le troisième joueur peut tenir la pelle à la
   souris; quatre préparations par manche, trois maintiens successifs et une annonce
   précèdent chaque choix de canal. Les détails du débit sont dans
   [le reçu du volcan](BALLSY_VOLCANO.md).

Le reçu des manettes atteste les entrées vues par ce navigateur. Il ne remplace pas une
manche complète à deux sur la télé et ne qualifie pas toutes les manettes Xbox/Nintendo.
Noter USB ou Bluetooth, navigateur/version, lisibilité depuis le canapé et compréhension
du frein. Garder ce JSON si une association ou un bouton se comporte mal.

Si l'adresse locale cesse de répondre alors que le serveur devX est encore actif, rétablir
le tunnel dans un terminal Windows et garder ce terminal ouvert pendant l'essai :

```powershell
ssh -o ExitOnForwardFailure=yes -N -L 127.0.0.1:4198:127.0.0.1:4198 devX
```

L'option refuse de démarrer si ce port local est déjà occupé; elle ne remplace pas un
autre tunnel. Le serveur devX se lance avec la commande de reproduction en fin de guide.

## Essayer le géant dans une deuxième fenêtre

Sur la télé, cliquer « Inviter un géant ». Ouvrir
<http://127.0.0.1:4198/ballsy-giant.html>, saisir le code affiché, puis rejoindre. La souris
de cette fenêtre tient seule la pelle. « Rendre la pelle » rend le contrôle au premier
écran. Le PC demeure l'autorité pour les balles, les tours et les ressources.

Garder le serveur et le tunnel ouverts pendant la partie. Les salles sont temporaires;
après un redémarrage du relais ou une longue veille du PC, recharger la page de course
et créer une nouvelle invitation avant le prochain essai. Aucun état persistant de partie
n'est promis par ce prototype.

Le rôle Quest utilise la même page. « Devenir le géant en VR » reste une demande explicite
au navigateur. À la première pose suivie, le tableau se place à 1,5 m devant le parent et
0,78 m sous sa tête; il reste ensuite fixe lorsque le parent regarde ou change de place.
Il ne suit pas la tête et ne déplace jamais le joueur. A ou X sur un contrôleur Quest
Touch, ou le bouton 3D « Ramener la table », le replace devant le parent. Ce recentrage
ne dépense pas de lave, ne change pas la course et relâche un éventuel creusement en cours.

Pointer un canal avec un rayon, presser la gâchette, puis maintenir les trois repères dans
l'ordre. « Sortir VR » rend la pelle et restaure le cadrage écran. La course continue;
un refus VR laisse le rôle utilisable à la souris. Le confort, la posture choisie et la
lisibilité des boutons restent à recevoir dans le casque physique.

## Accès au Quest : choisir une voie réelle

L'inspection de cette tâche a confirmé le serveur local et le tunnel Windows. Aucun
listener HTTPS privé ni outil ADB dans les emplacements standards inspectés n'a été
trouvé. Les anciens essais Cyber Race utilisent sa page publique HTTPS; cette adresse
ne contient pas le relais de cette branche Ballsy. Aucun transfert USB n'est activé ici.
Une clé ADB préexistante est présente sur Windows; son contenu n'a été ni lu ni modifié.

### USB avec un poste développeur déjà autorisé

Meta documente `adb reverse` pour atteindre un serveur local depuis Quest Browser et
permet WebXR en HTTP sur `localhost` pour le développement. Cela donne une voie d'essai
sans listener LAN ni certificat à installer. Références officielles :
[débogage de Browser](https://developers.meta.com/vr/documentation/web/browser-remote-debugging/)
et [origines locales WebXR](https://developers.meta.com/vr/documentation/web/port-vr-xr/).

Conditions : un câble USB de données, le mode développeur déjà activé, Android Platform
Tools disponible, et ce poste déjà autorisé sur le casque. Si l'un de ces points manque,
la configuration ou la création de clés demande une action/autorisation distincte; cette
tâche ne la réalise pas. Le protocole ci-dessous est préparé, **non exécuté sur le casque**.

Sur Windows, avec le nouveau tunnel local actif et un seul casque explicitement choisi :

```powershell
adb devices
adb -s <numero-du-casque-autorise> reverse tcp:4198 tcp:4198
```

Vérifier que le casque choisi est en état `device`, puis ouvrir dans **Quest Browser** :

```text
http://localhost:4198/ballsy-giant.html
```

Chemin prévu : localhost du Quest → USB autorisé → loopback Windows `4198` → tunnel SSH
existant → loopback devX `4198`. Garder la page de course ouverte sur le PC. Saisir son
code dans le casque, rejoindre, puis entrer en VR. Le bouton VR doit être disponible;
si le navigateur indique une origine non sûre ou aucun casque, relever le message plutôt
que changer des options de sécurité.

Pour retirer uniquement ce transfert après l'essai :

```powershell
adb -s <numero-du-casque-autorise> reverse --remove tcp:4198
```

Ce protocole ne retire pas les transferts d'autres projets. La liaison du jeu entre
`127.0.0.1` côté PC et `localhost` côté géant est testée dans les navigateurs automatisés;
le câble, l'autorisation et le forwarding ADB physiques restent à vérifier.

### Wi-Fi avec HTTPS privé

Le casque doit atteindre le serveur Ballsy privé, et reconnaître son certificat. Le
serveur sait déjà recevoir `--cert` et `--key`; son transport TLS a été sondé dans l'étape
précédente. Avant de le mettre en écoute sur une interface réseau, confirmer le poste,
l'adresse et le certificat à utiliser. Aucun certificat, clé, règle de pare-feu, DNS,
accès public, réglage de confiance ou contournement de sécurité n'est créé ici.

## Session de réception de dix minutes

- Deux joueurs vérifient les manettes, finissent une manche écran et lancent une revanche.
- Le parent rejoint au Quest et effectue une grande coulée puis une dérivation pendant une
  crue. Vérifier le geste, le délai et la lecture du passage sec par les coureurs.
- Le parent se tourne, ramène la table avec A/X, puis sort de VR au milieu d'une préparation.
  La course doit continuer; la souris doit pouvoir reprendre la pelle.
- Rejoindre une deuxième fois, finir la manche et vérifier les résultats indépendants.
- Relever le matériel et les problèmes observés. Ne pas conclure sur les FPS, la latence
  du Wi-Fi ou le confort du casque à partir des temps de simulation des tests.

## Reproduction des validations logicielles

```bash
cd /home/yb/codes/GraphysX-Web-ballsy-playtest-20261106
npm run typecheck
npm run lint
node scripts/with-verify-lock.mjs -- npm run build
npm run verify -- --no-build --checks=ballsy-setup,ballsy-giant,ballsy-volcano,ballsy,standalone,product-assets,asset-guard,cyber-race --wait
npm run serve:ballsy -- --host 127.0.0.1 --port 4198
```

Les preuves sont dans `output/ballsy-playtest/` et `output/verify/`. L'émulation utilise
IWER 2.8.0, uniquement en développement. Résultats obtenus :

- TypeScript, lint complet et build produit réussissent; les avertissements existants du
  build sur les chunks et `inlineDynamicImports` restent dans le journal.
- **948/948 tests Node passent, sans skip**, dont trois nouveaux contrats de vérification
  des manettes. La vérification d'une manette n'est acquise ni en jouant normalement ni
  avec des axes invalides; elle ne se transmet pas à un appareil remplacé.
- **11/11 contrôles ciblés passent** : Node, deux sondes Rapier, préparation de partie,
  géant, volcan, course neutre, standalone, Cyber Race, assets et garde d'assets.
- Le test guidé couvre deux contrôleurs synthétiques aux indices 1/3, les quatre
  directions, le retour au centre, le frein pressé/relâché, le téléchargement JSON,
  remplacement/déconnexion/nonstandard, clavier de secours et trois tailles d'écran.
  Après la dernière retouche visuelle, ce parcours est rejoué avec la navigation Tab et
  Échap, sans déclencher la course par erreur.
- Le parcours WebXR rend deux vues et teste une tête décalée, tournée à 90° et abaissée
  à 1,15 m. A et le bouton 3D recentrent la maquette; maintenir A ne l'entraîne pas.
  Les positions, le temps et les ressources du PC restent identiques pendant ce test.
  La sortie rétablit la caméra écran; les gestes, la coupure, la reconnexion, le refus VR
  et la poursuite de la course passent aussi. Aucun test physique n'en est déduit.
- Le client officiel `develop-web-game` termine deux rafales pour le dialogue et deux
  pour la course, avec états JSON et captures inspectés, sans erreur.
- Les pages **4198 et 4196 répondent depuis Windows** : nouveau test et ancienne version
  restent accessibles séparément. Les services et tunnels sont strictement loopback.

Les reçus finaux et captures sont conservés dans les sorties citées. La sélection reste
une vérification ciblée, pas le gate complet de publication. Aucun push, PR, merge,
déploiement, nouvelle clé ADB/TLS ou changement de sécurité réseau n'est effectué.

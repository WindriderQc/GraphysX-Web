# Ballsy : socle VR commun

## Intégration durable, 7 novembre 2026

Le travail courant est dans `codex/permanent-vr-ballsy`. Le merge local `f00c01c`
réunit le prototype `4f55d3d` et le main distant `6d478d3` (Math Lab v4 inclus),
sans modifier les autres worktrees. La publication et la réception restent à
vérifier : les liens publics ne prouvent pas qu'un nouveau bundle est installé.

La course dispose d'une entrée dans Jeux; l'atelier VR conserve son entrée dans
Ateliers et sa route `?app=vr-lab`. Le relais utilise le service existant, voir
[hébergement durable](BALLSY_PUBLIC_RELAY.md). Le nouveau cadrage, les arrivées et
leur réception visuelle sont décrits dans [la QA dédiée](BALLSY_CAMERA_FINISH_QA.md).
Les anciens lanceurs restent des previews locales temporaires; les heures et les
SHA ci-dessous sont des reçus historiques, pas des promesses de disponibilité.
Les poses WebXR synthétiques ne remplacent toujours pas un essai physique Quest.

## Historique du prototype local

Prototype local dans `codex/ballsy-shared-vr`. Le merge `6c9461f` conserve les deux
histoires : Ballsy slime `3c87859778b996b0da091a2de2b585de0d1a273e` et le socle VR
`f10b7e4d0a560c3f2e09ab46424c8bfc3a42a43a`. Aucun push ni déploiement.

Le `main` distant consulté le 7 novembre 2026 via GitHub est
`2e91d30453b51dfd63d8d6d1bddc1d58c9420355`, six commits au-delà du cache local
`61f67b7`. Ces changements mathématiques, LLMx et modèles Cyber Race ne sont pas
absorbés dans ce prototype. Une future intégration à main doit les rapprocher et
revalider le résultat, sans écraser les autres worktrees.

## Lancement sur UGBrutal

Depuis ce worktree :

```powershell
npm run build:ballsy-shared-vr
npm run serve:ballsy-shared-vr
```

Ou, une fois le build présent, double-cliquer `Jouer-Ballsy-VR.cmd`. Le lanceur
ouvre la course dans le navigateur. Il écoute seulement `127.0.0.1:4215`, ne
remplace aucun service existant et s'arrête automatiquement après douze heures.
Un port occupé donne une erreur plutôt qu'un changement silencieux d'adresse.
Ctrl+C arrête uniquement ce serveur. Les salles sont en mémoire et disparaissent
à son arrêt : créer une nouvelle invitation après redémarrage.

- Course : <http://127.0.0.1:4215/ballsy.html>.
- Géant : <http://127.0.0.1:4215/ballsy-giant.html>.
- Le lab VR séparé sur 4317 reste indépendant et sert son propre build.

À la réception du 7 novembre 2026, ce serveur est lancé et les deux pages répondent
200. Le HTML reçu est identique au build testé. Cette instance s'arrête au plus tard
à **17:07:20 UTC** (12:07:20 sur UGBrutal), ou avant si le PC/processus s'arrête.
Le reçu local est `output/ballsy-shared-vr/preview-receipt.json`.

Dans la course, inviter un géant. Dans la deuxième page, saisir le code affiché
et rejoindre. Le PC de course garde l'autorité sur la physique, les impacts et
le ralentissement. Le prototype conserve la souris, les pilotes clavier/manettes
et le mode pelle explicite `?tool=shovel`.

## Entrées partagées

Le géant garde son renderer et son unique boucle d'animation. Il consomme
`VrSessionController` et `VrInputRig`, les mêmes modules que le lab, sans imposer
`PlatformHost`. Une caméra de tête distincte préserve le cadrage desktop.

Les modèles utilisent les factories officielles Three.js : mains translucides pilotées
par les articulations WebXR, Touch blanches à anneaux pour le profil Quest 2 et modèle
générique pour les autres appareils. Les articulations restent visibles si la surface
ne charge pas ou si le suivi est incomplet. Sur les Touch Quest 2, une main d’avatar tient
chaque manette : index, prise et pouce réagissent aux commandes et contacts disponibles.
Ces poses sont animées par la manette. Les mains libres utilisent leurs articulations
optiques WebXR. Modèles, profils et licence sont inclus
dans le build Ballsy; aucun CDN n'est nécessaire. Voir [le contrat du socle](VR_FOUNDATION.md).

Une manette saisit avec la gâchette ou le grip. Une main suivie saisit avec le
pinch natif. Le ballon doit être proche; le lancer dépend d'un historique de poses
récentes et suivies, pas d'une direction automatique. Les interruptions annulent
le geste plutôt que de fabriquer une vitesse. La conversion vers la maquette
respecte son échelle 0,045 et son orientation.

Meta IWSDK n'est pas ajouté. Son dépôt officiel décrit un alias Three vers
`super-three`; la compatibilité de ce checkout n'a pas été validée. Voir aussi
[le contrat du socle](VR_FOUNDATION.md).

## Accès Quest : ce qui manque encore

Une adresse `127.0.0.1` désigne l'appareil qui la consulte. Ces liens PC ne sont
donc pas directement accessibles dans Quest Browser. Le casque demande aussi un
contexte sécurisé et l'autorisation WebXR dans son propre navigateur.

L'ancien accès privé `https://192.168.2.12:4191/` est arrêté et son certificat est
expiré; il ne faut ni le réutiliser ni contourner l'avertissement. Le site public
GraphysX répond en HTTPS mais ne contient pas ce build.

Une route encore à choisir et vérifier avec le propriétaire est nécessaire :
Quest Link déjà opérationnel avec un navigateur PC compatible, USB avec un casque
déjà autorisé et un transfert localhost, ou hébergement HTTPS de confiance de
cette version. Aucun certificat, pare-feu, tunnel, permission, runtime casque ou
réglage de sécurité n'est modifié par ce prototype.

## Validation et reproduction

Toujours fixer `LOCALAPPDATA` au dossier Windows réel avant les commandes lourdes,
puis utiliser `scripts/with-verify-lock.mjs`. Ne pas lancer une seconde vérification
en parallèle dans un autre worktree.

```powershell
$env:LOCALAPPDATA = 'C:\Users\Yanik\AppData\Local'
$env:SMOKE_CHROMIUM = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$env:SMOKE_DIST_ROOT = 'output/ballsy-shared-vr/dist'
node scripts/with-verify-lock.mjs -- node node_modules/vite/bin/vite.js build --config vite.ballsy.config.ts --outDir output/ballsy-shared-vr/dist
node scripts/with-verify-lock.mjs -- node scripts/smoke-ballsy-shared-vr.mjs
node scripts/smoke-ballsy-vr-preview.mjs
```

Le smoke partagé utilise le vrai build, deux pages et le vrai relais HTTP. Seuls
la session XR, sa liaison au renderer et les poses natives sont synthétiques.
Ses images ne constituent pas une vue stéréo réelle. La réception casque physique
reste nécessaire pour entrée/sortie, permission, mains/manettes, changement de
source, saisie/lancer, stabilité de table, lisibilité, confort et cadence.

Résultats obtenus le 7 novembre 2026 :

- TypeScript, lint global et 122 tests ciblés Ballsy/VR : verts.
- Build isolé avec les trois assets XR locaux : vert.
- Test du lanceur : loopback, relais, profils/modèle, port occupé et arrêt automatique
  vérifiés sur un port éphémère. Aucun autre service n'a été arrêté.
- Parcours commun : 50 assertions vertes et zéro erreur navigateur dans Edge.
  Refus puis réessai, boutons animés, gâchette/grip simultanés, lâcher immobile,
  lancers par manette et pince, table tournée, impact résolu par l'hôte,
  ralentissement limité au coureur touché, interruptions, pause/rematch,
  sortie/réentrée, fallback local et retour à la pelle souris.

Le premier Chromium headless shell était trop lent sur cette machine (137 frames
géant en environ une minute) et le relais a expiré. Edge installé a été utilisé
sans augmenter les délais ni affaiblir les assertions. Les corrections du scénario
de test attendent désormais l'acquittement du lancer avant d'avancer l'horloge hôte,
une nouvelle frame suivie après un changement d'outil, et la déconnexion puis
l'écho du round courant lors de la reconnexion après VR. Sans cette dernière
synchronisation, un nouveau round annulait normalement une pelle commencée trop tôt.
Aucun correctif produit n'a été nécessaire pour ces problèmes de séquencement.

- Smoke slime historique : 28/28. Régressions loop, pelle desktop, setup et practice :
  vertes. Client develop-web-game original : vert. Captures et texte d'état inspectés.
- Sur le build produit frais, le même scénario partagé repasse 50/50; lab VR,
  Cyber Race et showroom passent aussi, sans erreur navigateur. Captures inspectées.
- Le nouveau scénario est enregistré dans le gate et le plan par fichiers modifiés,
  en exécution locale seulement. Son wrapper utilise explicitement le `dist/` du
  produit et son propre relais éphémère. Les 62 tests du système de vérification passent.
- Les sondes Rapier heightfield et parité des six matériaux passent.
- **Le gate global n'est pas vert** : 1 063 tests Node, 1 058 réussis, 4 échecs,
  1 ignoré, aucun annulé. La passe globale a ensuite validé TypeScript, lint et build
  mais n'a pas lancé ses parcours navigateur. Ceux indiqués ci-dessus ont été exécutés
  séparément. La répétition finale des tests Node retrouve les quatre mêmes échecs.

Les quatre échecs sont ceux déjà observés sur la branche VR : `EPERM` de `fsync`
du dossier dans `world-service/archive.mjs:41` pour `world-fork` et deux cas
`world-reliability`, puis un checkpoint absent (`sha256`) dans un autre cas.
Les garanties de durabilité et les assertions ne sont pas affaiblies. Ballsy utilise
son relais en mémoire, pas ce stockage, mais cela empêche de revendiquer une réception
globale du dépôt.

Reçus : `output/ballsy-shared-vr/qa-receipt.json`, `accepted/shared-vr-report.json`,
`main-regressions.json`, `full-gate.log`, `final-unit.log` et les deux logs Rapier.
Les images de main montrent des articulations en sphères, pas une peau réaliste.
Toutes les poses XR sont synthétiques; cadence Edge/PC ne signifie pas cadence Quest.

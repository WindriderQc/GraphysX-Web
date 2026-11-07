# Ballsy : réception des ballons de slime

## Résultat final

Réception locale du 7 novembre 2026 sur UGBrutal, branche
`codex/ballsy-physical-shovel`, base `10bede8f348dbdb9cfd1b0520abad5dfa65aa68a`
avec les modifications identifiées par le reçu de sources. Le build testé est
exclusivement `output/ballsy-slime/dist`, y compris le dernier décalage CSS des
badges TV. Aucun ancien dist, serveur 4199 ou passerelle Quest n'a été remplacé.

- Typecheck, lint ciblé et build isolé : réussis.
- Tests Ballsy : **85/85**. Tests avec le vrai Rapier : **4/4**.
- Smoke souris avec deux pages et vrai relais HTTP : **28/28**, aucune erreur
  console/page. Geste réel, trajectoire, impact, ralentissement, reprise, rejeu,
  limitation des rafales, anciennes manches, pause, reset et déconnexion couverts.
- Régressions boucle, pelle desktop, préparation des manettes, practice et client
  original du skill develop-web-game : toutes réussies.
- Le palier Node global courant est rouge sur les chemins Windows historiques
  décrits plus bas. Cette réception ciblée ne constitue pas le gate complet.

## Physique et interaction

Le relâchement réel transmet la vitesse mesurée, sans cible ni visée automatique.
Un relâchement immobile produit une vitesse nulle et une chute par gravité; une
perte de focus annule le ballon tenu. Le modèle applique un facteur transitoire
0,75 pendant deux secondes, puis revient à 1 sans impulsion de reprise. Les
caps documentaires restent à 8. Les effets ne s'empilent pas. Pause annule les
vols, fige les effets déjà appliqués et invalide l'ancienne manche réseau.

Sous commandes simultanées identiques `ArrowLeft` et `KeyA`, sur la ligne droite :

- touchée : **6,1534 m/s** en moyenne, témoin : **8,1128 m/s**;
- ratio **0,75848**, cohérent avec un ralentissement de 25 %;
- après expiration et accélération naturelle : **8,1436 et 8,0303 m/s**;
- facteurs observés 0,75/1 puis 1/1, caps documentaires 8/8;
- aucune écriture de corps/vitesse par le test et aucune récupération automatique.

Le smoke utilise `advanceTime` pour isoler les étapes de physique, mais les
événements souris et le transport HTTP sont réels. Les quatre tests Rapier
comparent des corps soumis au même amortissement natif et vérifient identité du
corps, Y/spin, absence d'historique, freinage, validation, pause et reset.

## Rendu et performances

Edge 156.0.4314.58, ANGLE Direct3D11, RTX 5070 Ti, 1280 × 720, DPR 1.
Mesures temps réel, sans `advanceTime` et sans autre tâche GPU concurrente :

- Hôte seul, course non pausée, voitures immobiles : **75,56 FPS**, p95 **13,5 ms**.
- Deux vues, pilotage actif sans slime : **73,25 FPS**, p95 **13,5 ms**,
  769 frames sur 10,51 s.
- Deux vues avec slime : **74,57 FPS**, p95 **13,5 ms**, 796 frames sur 10,68 s,
  dix lancers, cinq touches et 603 frames avec ralentissement actif.
- Deux mises à jour du document dans chaque fenêtre. Le profil chargé atteint
  trois splats et un projectile simultanés, pas le pire cas des pools complets.

L'écart positif de FPS est du bruit de mesure, pas un gain attribué au slime.
La référence précédente autour de 73 FPS n'avait pas exactement la même charge.
Le profil actif utilise des Gamepads simulés et des lancers synthétiques via le
vrai relais; il ne remplace pas la preuve du geste souris.

Les captures finales ont été inspectées : 1084/1084 points de bord de route sont
cadrés côté géant, les deux voitures et les stocks sont visibles hors des panneaux.
La voiture touchée reçoit seule l'enveloppe verte, qui disparaît à expiration.
Les badges TV décalés laissent voir le contact. La caméra XR n'a pas été reculée.

Vidéo : **7,97 s**, 1280 × 720, capture plafonnée à 30 FPS, 1 055 343 octets.
Elle montre un vrai glisser-relâcher souris en temps réel, une trajectoire et une
touche, sans `advanceTime` ni lancement synthétique. Frames décodées à 2,2 et 3 s
inspectées. C'est une démonstration souris, pas VR. Elle précède uniquement la
retouche CSS TV; le canvas géant filmé est inchangé depuis.

## Régressions

- Boucle : deux joueurs terminent deux tours en **93,7951 et 99,4517 s**,
  5961 frames pilotées, zéro saut de position et zéro récupération.
- Pelle desktop : **2,80988 m³** retirés; le smoke slime retire aussi **0,40849 m³**
  après sélection de l'outil secondaire.
- Setup : directions, centre, frein, deux manettes synthétiques, reçu local,
  layouts 390/960/1920 et repli clavier passent. Le sélecteur natif est testé sur
  `?tool=shovel`; la page par défaut est ensuite rechargée, le sélecteur masqué
  vérifié et toutes les assertions manettes/clavier exécutées sur l'entrée slime.
- Practice : **3056 frames** physiquement pilotées; freinage, déconnexion, règles,
  revanche et boucle temps réel passent.
- Client original `develop-web-game/scripts/web_game_playwright_client.js`
  exécuté sans modification : burst clavier, voiture réellement mobile, phase
  racing, deux joueurs/deux tours, capture et texte inspectés, aucune erreur.
  Son Chromium/SwiftShader installé ne sert pas de profil de performance GPU.

Tous les serveurs de régression servent explicitement le nouveau build. Loop et
shovel reçoivent `SMOKE_DIST_ROOT`; setup et practice reçoivent `SMOKE_BASE` du
serveur éphémère. Aucun ancien port par défaut n'est utilisé.

## Palier global et limites

Commande courante `node scripts/verify.mjs --no-build --checks=none` :
**1005 tests, 951 réussis, 17 échoués, 36 annulés, un ignoré**, durée Node 12,37 s.
Les échecs sont dans living-island, world-fork, world-reliability et world-service :
Vite reçoit des chemins Windows de type `../../../../C:/Users/Yanik/...` et renvoie
`UNRESOLVED_ENTRY`. Ces chemins Windows échouaient déjà sur la base de départ,
mais les chiffres ci-dessus viennent bien du code courant. Le palier
s'arrête après les unités. Les tests historiques et la persistance ne sont pas
modifiés; typecheck, lint et build ciblés sont des preuves séparées.

IWER est déclaré mais son package effectif manque et sa résolution échoue.
Aucune installation n'a été faite. Les dix tests synthétiques de gestes, inclus
dans les 85 tests Ballsy, couvrent notamment suivi perdu et transformations;
ils ne prouvent pas l'intégration WebXR. La branche XR du test pelle est adaptée
au troisième bouton d'outil, mais n'a pas été exécutée. Restent une réception sur
casque pour prise/relâchement, suivi perdu, confort, présence et cadence réseau.
Aucun playtest humain ni test Quest physique n'est revendiqué.

## Reçus et preuves

Chemins relatifs à `output/ballsy-slime/` :

- `final/slime-report.json` : 28 assertions et vitesses finales.
- `final/host-slime-impact-expanded.png` : impact TV après décalage des badges.
- `final/giant-balloon-ready.png`, `final/giant-slime-impact-expanded.png`.
- `video/ballsy-mouse-throw.webm`, `video/video-report.json`.
- `performance-final/performance-report.json`.
- `regressions/loop/loop-report.json`, `regressions/shovel/shovel-report.json`.
- `regression-setup/setup/setup-report.json`.
- `regression-practice/practice/ballsy-report.json`.
- `client/client-report.json`, `client/shot-0.png`, `client/state-0.json`.
- `validation/final-typecheck.log`, `validation/final-lint.log`,
  `validation/final-ballsy-unit.log`, `validation/final-live-slowdown.log`.
- `validation/badge-build.log` : dernier build après la retouche CSS TV.
- `validation/global-node-gate.log` : palier global courant non vert.
- `validation/final-source-build-receipt.json` : empreintes finales.

Les dossiers `first`, `accepted`, `performance` et le premier échec setup dans
`regressions/setup.log` restent des diagnostics, pas les preuves finales. Aucun
jeton de salle n'est conservé dans les rapports et preuves destinés au partage.

## Reproduction isolée

Fixer dans chaque processus, sans modification globale Windows :

```powershell
$env:LOCALAPPDATA='C:\Users\Yanik\AppData\Local'
$env:SMOKE_CHROMIUM='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$env:SMOKE_DIST_ROOT='output/ballsy-slime/dist'
node scripts/with-verify-lock.mjs -- node node_modules/typescript/bin/tsc --noEmit
node scripts/with-verify-lock.mjs -- node --test "test/ballsy-*.test.mjs"
node scripts/with-verify-lock.mjs -- node --test test/live-slowdown.test.mjs
node scripts/with-verify-lock.mjs -- node node_modules/vite/bin/vite.js build --config vite.ballsy.config.ts --outDir output/ballsy-slime/dist
$env:SMOKE_ARTIFACTS='output/ballsy-slime/final'
node scripts/with-verify-lock.mjs -- node scripts/smoke-ballsy-slime.mjs
$env:SMOKE_ARTIFACTS='output/ballsy-slime/performance-final'
node scripts/with-verify-lock.mjs -- node scripts/smoke-ballsy-slime-performance.mjs
$env:SMOKE_ARTIFACTS='output/ballsy-slime/regressions'
node scripts/with-verify-lock.mjs -- node scripts/smoke-ballsy-slime-regressions.mjs
$env:SMOKE_ARTIFACTS='output/ballsy-slime/client'
node scripts/with-verify-lock.mjs -- node scripts/smoke-ballsy-slime-client.mjs
# verify.mjs prend lui-même le verrou : ne pas l'imbriquer.
node scripts/verify.mjs --no-build --checks=none
```

Coordonner aussi le créneau avec les autres tâches GPU. Aucun push, aucune fusion
et aucun déploiement ne sont réalisés par cette réception.

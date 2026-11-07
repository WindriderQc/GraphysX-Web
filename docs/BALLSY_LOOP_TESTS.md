# Boucle du Volcan : réception locale

## Statut courant — 7 novembre 2026 (UTC)

**Réception ciblée verte sur le build optimisé.** Les preuves courantes sont dans `output/ballsy-loop/accepted/`. Les dossiers `final/` et `greybox/` restent des historiques avant correction, jamais les résultats de livraison.

La course est du **pilotage automatisé via vraies entrées**, pas un playtest humain. Le clavier passe par Playwright; sticks et boutons par la Gamepad API simulée. Aucun corps ni état de progression n'est modifié pendant les courses de validation.

Les trois régressions sont vertes : piste pratique, préparation des deux manettes et pelle du géant desktop. La pelle retire 2,8598 m³ via de vrais événements souris. Aucun casque physique et aucune session XR n'ont été validés dans cette réception.

## Exécution reproductible

```
$env:SMOKE_CHROMIUM='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$env:SMOKE_DIST_ROOT='output/volcano-loop/dist'
$env:SMOKE_ARTIFACTS='output/ballsy-loop/accepted'
node scripts/with-verify-lock.mjs -- node scripts/smoke-ballsy-loop.mjs --video
```

Le script démarre un serveur éphémère. `SMOKE_BASE` cible un serveur existant et prévaut sur `SMOKE_DIST_ROOT`; sans ces variables, le serveur sert `dist`. Options : `--greybox`, `--baseline`, `--video`, `--visual-only`, `--scenario-only`, `--diagnose`. Ne pas remplacer le build pendant l'exécution. Les commandes lourdes utilisent le verrou machine-global. Le build Ballsy isolé utilise `vite.ballsy.config.ts`, sans écraser le `dist` principal.

## Course et règles

- Deux joueurs, deux tours chacun : main 93,795 s, avec pont 99,452 s. Aucun saut détecté, aucune récupération automatique. La première arrivée laisse le second finir.
- Même politique de pilote : cible plafonnée à 3,5 m/s, frein réel si vitesse supérieure à la cible +1 m/s. Le paramètre de direction speedCap reste 8 m/s; gravité et contact peuvent modifier la vitesse physique effective.
- Comparaison locale des branches, interpolée sur les traces physiques à 1 Hz : main 11,38 / 11,08 s, pont 6,04 / 6,22 s. Gain d'environ 5 s par passage du pont. Les temps globaux ne doivent pas être utilisés comme comparaison isolée des branches.
- Contact physique, dépassement, séparation maximale 31,66 m; pas d'interpénétration majeure. Les 100 positions/rayons échantillonnés restent cadrés, sans obstacle opaque masquant les billes.
- Erreur volontaire séparée : direction gauche contre le rail, frein de 1,5 s, reprise contrôlée. Coût d'environ 5,59 s contre la même portion clean. Pas de placement artificiel ni de récupération automatique dans ce scénario.
- Chute artificielle et saut de circuit : probes distinctes, explicitement étiquetées. Récupération vérifiée sans crédit de porte ni retour en arrière du chrono. Elles ne constituent pas une preuve de pilotage.
- Marche arrière sans crédit illicite, pause/reprise, revanche, redémarrage et plein écran vérifiés.

## Preuves visuelles à utiliser

Dans `accepted/visuals/` :

- `loop-unpaused-1280.png` et `loop-unpaused-1920.png` : vraie phase racing, non pausée, caméra normale.
- `loop-top-down-1920.png` : vraie scène vue de dessus; six noms et flèches projetés depuis les sections/tangentes du circuit, sans parcours inventé.
- `loop-actual-racing.webm` : clip de 16 s réellement rendu, deux pads présents dès le lobby. Canvas seul, sans HUD; capture plafonnée à 30 images/s, distincte du débit réel du jeu.

Dans `accepted/` :

- `loop-cleanline-banked-turn.png`, `loop-cleanline-bridge-crossing.png`, `loop-cleanline-separated-racers.png` : captures pendant le pilotage, calcul interrompu entre lots, phase racing, caméra normale et UI. Aucun déplacement de corps pour cadrer.
- `loop-full-separation.png` : canvas réellement rendu pendant une grande séparation, sans HUD.
- `loop-intentional-shortcut-recovery.png` : reprise de contrôle après l'erreur contenue.
- `giant-desktop/desktop-direct-cut.png` : excavation souris après correction.

Les vues 1280/1920, le virage, le pont, la séparation et la vue de dessus ont été inspectés. Diamètres projetés au départ à 1080p : environ 20,4 et 20,9 px. Le portique devient effectivement translucide à proximité des billes. Le probe de visibilité gère les tableaux de matériaux, opacity et transparent.

## Performance après correction

Edge headless 156.0.4314.58, ANGLE NVIDIA GeForce RTX 5070 Ti / D3D11, DPR 1, buffers natifs. Une seule page/renderer du test pendant chaque mesure, aucun `advanceTime` dans ces mesures.

- Reprise visuelle isolée : 75,28 FPS à 1280×720 et 75,38 FPS à 1920×1080; p95 13,4 ms, 120 intervalles rAF.
- Pilotage actif pendant le clip isolé : 73,93 FPS, p95 13,4 ms. Le cap d'enregistrement vidéo de 30 images/s ne limite pas cette mesure rAF.
- Profil indépendant de 10 s, deux pads avec axes continuellement variables : 73,26 FPS, p95 13,4 ms; paused 74,97 FPS.
- `api.steerLive` : 31,8 ms pour 1 184 appels en 10 s; seulement deux transactions documentaires ponctuelles. Les durées API/runtime sont imbriquées, donc non additionnables.

Ce sont des mesures locales, pas une garantie sur un autre matériel. La première vidéo optimisée a chevauché l'intervalle du palier Node malgré l'usage des wrappers; elle est conservée dans le rapport brut, mais remplacée pour la réception visuelle/performance par la passe isolée `accepted/visuals/`.

## Diagnostic historique conservé

Avant correction : baseline rectangle environ 75 FPS; art 32–54 FPS. Profil racing 43,38 FPS contre paused 75,0, avec les mêmes 70 drawcalls et environ 45 166 triangles. Les 1 204 commandes steer coûtaient 7 522 ms sur 10 s, principalement à exporter tout le document pour l'historique. La projection du géant provoquait aussi des pauses interrompant les coups de pelle.

Corrections validées : API publique live de direction partageant les mêmes forces/Rapier sans historique documentaire à chaque frame, projection transitoire de lave et interpolation visuelle du géant. Les temps et trajectoires de course restent identiques; les FPS actifs et l'excavation desktop sont désormais validés. Les premiers échecs mesh/progression/pilote restent sous `greybox/`, les profils avant optimisation sous `final/`.

## Portée et limite du gate global

Cette réception ne valide pas une publication. Le palier Node global a exécuté 976 tests : 922 verts, 17 échecs, 36 annulés, 1 skip. Les hooks de bundles Windows échouent sur des chemins `../../../../C:/...` dans living-island, world-fork, world-reliability et world-service. Les cinq tests réels runtime/API live et les nouveaux tests Ballsy sont verts. Le full gate release n'est pas acquis; aucun build global écrasant `dist` ni publication n'a été effectué.

## Rapports de référence

- `accepted/summary.json` : synthèse, comparaison des branches, coût de l'erreur, mesures isolées, régressions, limite du gate et SHA-256 des entrées du bundle testé.
- `accepted/loop-report.json` : traces physiques détaillées et assertions.
- `accepted/visuals/loop-report.json` : reprise visuelle et vidéo isolées.
- `accepted/performance-profile-active.json` : coût API/runtime et débit sous entrées variables.
- `accepted/regressions.json` : trois suites, heures UTC et codes de sortie.
- `output/ballsy-loop/full-unit-gate.log` : limites Windows du palier global.

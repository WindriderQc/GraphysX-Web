# Ballsy : pelle physique et terrain creusable

Cette reprise remplace le choix de canaux et les trois maintiens par un terrain que la pelle déforme réellement. Branche locale `codex/ballsy-physical-shovel`, copie isolée sur UGBrutal : `C:/Users/Yanik/codes/GraphysX-Web-ballsy-shovel`.

## Jouer

Le lanceur `Jouer-Ballsy.cmd` démarre le serveur et ouvre le jeu. Garder sa fenêtre ouverte; Ctrl+C arrête cette prévisualisation. Il refuse de remplacer un port déjà occupé.

Après compilation, on peut aussi lancer dans cette copie :

```powershell
node scripts/serve-ballsy.mjs --host 127.0.0.1 --port 4199
```

PC : http://127.0.0.1:4199/ballsy.html. Les touches et le test des manettes restent disponibles. Les bandes turquoise donnent une impulsion si on les traverse dans le bon sens. Freiner coupe le turbo. La lave ralentit, la bande extérieure reste sèche.

À la souris, maintenir puis glisser directement dans la terre ambrée à droite du volcan. Une position immobile ne creuse pas. Les tranchées persistent jusqu'à la revanche. On peut aussi inviter un géant, ouvrir `ballsy-giant.html` sur le même relais et saisir le code.

En WebXR, une pelle de 55 cm est attachée à la pose de prise du contrôleur dominant. Maintenir la gâchette, enfoncer la lame dans la terre, tirer puis soulever. Ce sont les positions de la lame, et non un rayon ou un bouton de canal, qui sont transmises. A/X ramène la table. Les boutons VR ne servent plus qu'à recentrer et sortir. Perte du suivi, pause, sortie, déconnexion et relâchement annulent le geste.

Le nouveau lien loopback n'est pas accessible directement depuis le Quest. L'ancienne adresse privée reste une autre prévisualisation tant qu'elle n'est pas explicitement basculée. Aucun nouveau certificat, pare-feu, droit USB ou contournement d'alerte n'est nécessaire au code ni effectué ici.

## Ce qui change réellement

- Champ de 609 sommets modifiables : x=4..14, z=-7..7. Le reste de la piste n'est pas destructible dans cet incrément.
- Le mesh et son collider trimesh sont reconstruits quand le sol change. Creuser enlève de la hauteur; ce n'est pas une texture de trou.
- Lave conservée en volumes finis, entraînée par les élévations voisines. Creuser vers le bassin augmente le volume détourné et réduit celui qui atteint la piste.
- Surface de lave continue avec contours interpolés, croûte et cœur orange. Le seuil visible correspond au début du ralentissement.
- Le PC reste autoritaire. Le casque présente les instantanés et envoie seulement des positions de lame bornées. Le modèle refuse déplacement impossible, saut de suivi et spam.
- Circuit contrasté, bordures complètes, portes repérées, ligne d'arrivée et trois accélérateurs directionnels. Les deux coureurs finissent séparément.

Il s'agit d'un heightfield : pas de tunnels, de surplombs ni de terre que l'on transporte et redépose. Le manche suit un contrôleur; ce n'est pas du hand-tracking sans manette. La lave est une simulation simplifiée, pas un solveur de fluides général.

## Provenance et coexistence

La source originale `codex/ballsy-playtest-readiness` à `49e588e` était sur devX. L'accès SSH depuis UGBrutal a été bloqué avant modification. Les trois patches locaux enregistrés (socle, volcan, préparation d'essai) ont été appliqués sur la base locale `b2091a8`, dans un nouveau worktree. Le journal ancien `progress.md` n'a pas été réappliqué. Aucun reset/stash des autres sessions, push, fusion ou déploiement.

Les dépendances déjà installées dans la copie locale Cyber Race ont été copiées dans ce worktree après blocage de l'accès au registre npm. Une installation propre de la nouvelle branche n'est donc pas qualifiée. Le paquet IWER n'est pas installé ici : le test d'émulation est fourni mais son exécution reste à faire.

## Vérifier

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --max-warnings 0
node --test test/ballsy*.test.mjs
node scripts/with-verify-lock.mjs -- node node_modules/vite/bin/vite.js build
$env:SMOKE_CHROMIUM = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node scripts/with-verify-lock.mjs -- node scripts/smoke-ballsy-earth-race.mjs
$env:SMOKE_DESKTOP_ONLY = '1'
node scripts/with-verify-lock.mjs -- node scripts/smoke-ballsy-shovel.mjs
```

Le test de pelle héberge son propre relais loopback. Sans `SMOKE_DESKTOP_ONLY`, il nécessite IWER 2.8.0 et vérifie aussi les poses de prise et le mouvement physique émulé. Les anciens scripts de canaux sont historiques; la sélection de vérification utilise les nouveaux parcours.

Reçus : `output/ballsy-shovel/` et `output/ballsy-earth-race/`. Les tests ciblés, le build et les inspections visuelles sont distincts de la suite globale. Son premier passage Windows a 885 réussites, 17 échecs, 36 annulations et 1 skip : les échecs viennent des suites world-service qui utilisent URL.pathname comme chemin Windows. Cela ne constitue pas une validation globale verte.

Le casque physique, ses FPS, le confort, les haptics et les manettes physiques ne sont pas qualifiés. La réception utile suivante est une courte partie avec le parent au Quest, après accès à cette révision exacte, pour mesurer la portée de la pelle et le dosage de la terre.

### Reçus de cette reprise

TypeScript, lint complet et 51 tests ciblés (Ballsy + sélection des vérifications) réussis. Le build produit réussit avec ses avertissements habituels de taille de chunks. Le parcours souris à deux navigateurs a retiré 2,77 unités cubiques de terre et vérifié le relâchement, sans erreur navigateur. La réception Quest physique et l’émulation IWER ne sont pas exécutées ici.

Le parcours volcan final a terminé deux tours physiques pour chacun des deux joueurs en 3 205 frames de simulation (57,8 s et 59,5 s), sans téléportation, sauvetage, désynchronisation ou erreur navigateur. Boosts directionnels, frein, caméra fixe, excavation souris, chute sur collider abaissé, pause, conservation et revanche passent. Le test final des deux navigateurs retire 2,87 unités cubiques et vérifie le relâchement. Les captures finales sont inspectées.

Un défaut de mouvement a été corrigé : les modifications de vitesse reconstruisaient la balle à son ancienne position déclarée. Les mises à jour conservent maintenant la position, la rotation et les vitesses courantes, avec un test anti-téléportation durant toute la course.

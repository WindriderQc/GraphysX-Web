# Cyber Race 1992 — prompt de reprise (session fraîche)

> Colle ce document tel quel comme premier message d'une nouvelle session (Claude Code ou Codex).
> Rédigé le 2026-10-24 vers 16:00 America/Toronto, à la fin de la session qui a créé le jeu.

---

Tu reprends **Cyber Race 1992**, un jeu web que j'ai fait construire dans GraphysX-Web : la course
virtuelle à deux de *The Lawnmower Man* (1992, director's cut), étendue avec les autres scènes VR
du film, un mode Histoire, et installée dans ma ludothèque **GamX** (Playnite). Lis tout ce
document avant d'agir. Parle-moi en français, simplement ; commits, PR et docs du dépôt en anglais.

## 1. Où sont les choses

| Quoi | Où |
| --- | --- |
| Dépôt | `WindriderQc/GraphysX-Web` (GitHub). Le site public `https://graphysx.specialblend.ca` se déploie à chaque push sur `main`, mais seulement si le plan d'impact le demande. |
| Copie de travail du jeu | `C:\Users\Yanik\codes\GraphysX-Web-cyber-race` (worktree Git). La copie principale `C:\Users\Yanik\codes\GraphysX-Web` appartient à **d'autres sessions** : n'y touche pas. Pour un nouveau travail, crée une branche `claude/...` depuis `origin/main` dans ce worktree (ou un nouveau worktree). |
| Code du jeu | `cyber-race.html` (page, menu, HUD, styles) et `src/cyber-race/` |
| Doc du jeu | `docs/CYBER_RACE.md` (tableaux, contrôles, mode Histoire, GamX, relevé plan par plan du film) |
| Outils | `scripts/package-cyber-race.mjs` (HTML autonome + lanceur), `scripts/extract-cyber-race-film.mjs` (extraits du film, local), `scripts/install-cyber-race-gamx.mjs` + `scripts/gamx/Start-CyberRace.ps1` (canaux GamX) |
| Jeu installé (GamX) | `C:\Users\Yanik\Games\GamX\CyberRace1992\` : `Atelier\` (canal de développement), `film\` (extraits, partagés par jonction), `art\` (jaquette, fond, icône), `Start-CyberRace.ps1`, `_previous\` (ancienne install archivée, rien supprimé) |
| Playnite | portable, `C:\Users\Yanik\Games\GamX\Playnite\Playnite.DesktopApp.exe`. Entrée **« Cyber Race 1992 - GamX - Atelier »**, action « Jouer (Atelier) » : `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\Users\Yanik\Games\GamX\CyberRace1992\Start-CyberRace.ps1" -Channel Atelier` |
| Film (ma copie) | `E:\Downloads\The.Lawnmower.Man.1992.DC.1080p.BluRay.x265.AAC5.1-RBG\The.Lawnmower.Man.1992.DC.1080p.BluRay.x265.AAC5.1-RBG.mp4` |
| ffmpeg | `E:\Media\Datalake\Bureau\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe` (pas dans le PATH) |
| Convention GamX | `C:\Users\Yanik\codes\StarFoX-SNES\docs\PLAYNITE.md` et `ATELIER.md` : par jeu, un canal **Atelier** (dev, mis à jour après chaque build testé) et une **Édition validée** figée, qui ne change **que sur mon approbation explicite**. Profil/réglages séparés par canal, reçu avec empreinte, lanceur qui vérifie et attend. |

Historique Git : PR fusionnées [#34](https://github.com/WindriderQc/GraphysX-Web/pull/34) (page autonome),
[#36](https://github.com/WindriderQc/GraphysX-Web/pull/36) (cristaux fidèles, kaléidoscope, vague d'or,
Cyberjobe, extraits), [#39](https://github.com/WindriderQc/GraphysX-Web/pull/39) (mode Histoire, combat,
tableaux inspirés, records, bande-son). Toutes déployées « static, deploy=false » : le site n'a pas changé.
La branche `claude/cyber-race-gamx` ajoute les outils GamX et ce document (voir §7).

## 2. Règles à respecter

- Lis `CLAUDE.md` et `README.md` de GraphysX-Web. En bref : stage **par chemin explicite**, jamais
  `git add -A` ; un seul `npm run verify` à la fois sur la machine ; ne jamais affaiblir une
  assertion ; **regarder des captures** avant de livrer du visuel ; ne pas lancer `npm run build`
  nu pendant un gate.
- Le jeu est **une page autonome hors du build produit** (`vite.config.ts` ne construit que
  `index.html`). `scripts/verify-impact.mjs` a une règle « Cyber Race standalone page » (aucun
  smoke, `deploy: false`), verrouillée par `test/verify-impact.test.mjs`. **Tout nouveau fichier du
  jeu doit matcher cette règle** (sinon le plan devient « full » et déploie) : ajoute-le au motif
  et au test.
- **Jamais d'extrait, d'image ou de son du film dans Git ni sur le site.** Les extraits sont
  découpés de ma copie, en local, à côté du jeu installé. Tout le visuel du dépôt est procédural.
- Les règles d'`agentx-home` sur la file de travaux lourds ne s'appliquent pas ici : pas de modèle,
  pas de GPU partagé. Les tests navigateur et ffmpeg restent directs.
- Toute heure écrite porte son fuseau (America/Toronto).
- Ne modifie pas la base de Playnite à la main pendant qu'il tourne : passe par son interface
  (computer use : l'app s'appelle `Playnite.DesktopApp.exe` dans `request_access`, et il faut aussi
  « File Explorer » en clic pour lui donner le focus).

## 3. Architecture du code (`src/cyber-race/`)

| Fichier | Rôle |
| --- | --- |
| `main.ts` | Boucle (`renderer.setAnimationLoop`), états (menu / countdown / race / over), pilotes, physique latérale, vol sur la tranche (roll), collisions, IA, HUD écran, caméras en écran partagé, VR (WebXR + panneau dans le casque), menus et pause pilotables à la manette, finale (compte à rebours), mode Histoire, records/fantôme, musique, voix, crochets de test |
| `track.ts` | Tracé par secteurs (`SECTOR_INFO`, `PLANS` : film 3 / extended 7 / ultimate 9), repères à transport parallèle, `boundAt`, `tubeAt` |
| `world.ts` | Construction de chaque tableau et de ses obstacles, collisions (`collision(o, prevS, s, ox, oy, time, roll)`), animations, combat de Cyberjobe (`updateBoss`, projectiles), ciels |
| `models.ts` | Pilotes (bulle de verre, coque, ailes, réacteurs), mines, éclats, oursins, troncs, hexagones |
| `cyberjobe.ts` | Cyberjobe (corps doré à circuits, visage, yeux, bouche qui hurle) |
| `textures.ts` | Toutes les textures canvas (circuit, tunnel, rivets, damier, hexagones, tourbillon, couchant, dalles ornées, éclairs, grille dorée, points hexagonaux, peau/or de Cyberjobe, réseau, lave, ciel fournaise) |
| `input.ts` | Clavier coupé en deux, une manette Xbox par pilote, manettes Quest ; actions de menu (up/down/left/right/ok/back/pause/menu) avec répétition |
| `audio.ts` | Effets synthétisés (moteurs, chocs, anneaux, alarmes, explosion) |
| `music.ts` | Séquenceur synthé 1992 (un thème par tableau, urgence) + voix anglaises (speechSynthesis) |
| `film.ts` | Lecteur d'extraits optionnels (intro, attract, outro, story-N) |
| `records.ts` | Records par parcours (localStorage), fantôme échantillonné à 10 Hz, graine fixe par parcours |
| `story.ts` | 7 chapitres, objectifs, progression, évolution de Jobe |

Contenu jouable : tunnel → mines → cristaux (hublot, lames, fentes sur la tranche, barres, poutre,
damier) [film 00:40:17–00:41:25] ; terres hostiles [00:01:36] ; kaléidoscope [01:00:20] ; vague d'or
+ WARNING [01:14:15] ; réseau et fournaise **inspirés** [01:57:40, 01:35:20] ; vortex final avec
Cyberjobe qui vole devant et lance des hexagones, portes ACCESS DENIED, compte à rebours LCD
[02:04:58–02:10:20]. Le relevé plan par plan de la course (vérifié à 8 images/s) est dans
`docs/CYBER_RACE.md`.

## 4. Lancer, tester, empaqueter

```bash
cd /c/Users/Yanik/codes/GraphysX-Web-cyber-race
npm ci                      # si node_modules manque
PORT=4191 npx vite --host 127.0.0.1 --strictPort    # puis http://127.0.0.1:4191/cyber-race.html
npx tsc --noEmit
npx eslint src/cyber-race scripts/package-cyber-race.mjs scripts/extract-cyber-race-film.mjs scripts/install-cyber-race-gamx.mjs --max-warnings 0
node --test test/verify-impact.test.mjs
node scripts/install-cyber-race-gamx.mjs --gamx "C:/Users/Yanik/Games/GamX"     # rebuild + met à jour le canal Atelier
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Yanik\Games\GamX\CyberRace1992\Start-CyberRace.ps1" -Channel Atelier -CheckOnly
node scripts/extract-cyber-race-film.mjs --movie "<film>" --ffmpeg "<ffmpeg>" --out "C:/Users/Yanik/Games/GamX/CyberRace1992"   # extraits (déjà faits)
```

Crochets de test dans la page (`window.cyberRace`) : `start()`, `advance(secondes)` (pas fixes de
1/60 puis un rendu), `freeze(true)` (fige la boucle pour une capture exacte), `ui([...actions], source)`
(simule la manette), `settings`, `pilots` (`cpu`, `autopilot` = l'ordi pilote un humain, compté
humain pour les records), `world`, `finale`, `story.{open, chapter(id), start, progress}`.

Pièges vus pendant la session :
- Le panneau navigateur caché ralentit `requestAnimationFrame` (~2 i/s) : simule avec `advance`,
  pose avec `freeze` + `advance(0.01)`, attends ~1 s avant la capture.
- Découpe les longues simulations (≈ 20 s simulées par appel) : sinon l'outil JS dépasse 45 s.
- Chaque édition de `cyber-race.html` peut ouvrir le fichier local dans le panneau : renaviguer
  vers `http://127.0.0.1:4191/cyber-race.html` (nouvel onglet).
- `placeOnTrack` met le +x local à **gauche** de la ligne : pour un objet orienté avec la collision
  en (right, up), utilise `lateralHolder` ou inverse l'angle.
- Les longs scripts Node passés en heredoc bash peuvent casser : écris-les dans un fichier du
  scratchpad puis exécute-les.

## 5. Non vérifié à ce jour

- **VR** dans un vrai casque (pas de runtime Meta Quest Link installé sur ce PC).
- **Vraies manettes Xbox** (entrées simulées seulement).
- **Le son** (musique, effets, voix) : jamais écouté.
- Ressenti de difficulté humain (objectifs calibrés au pilote automatique).

## 6. La suite (dans cet ordre)

1. **Clore la branche `claude/cyber-race-gamx`** : vérifie qu'elle contient les outils GamX, la
   règle d'impact étendue et ce document ; ouvre la PR si ce n'est pas fait, fusionne après la CI
   verte **seulement si je le demande**.
2. **Mon essai dans Playnite** (« Cyber Race 1992 - GamX - Atelier », manettes Xbox) : recueille
   mes retours (contrôles, difficulté, son, lisibilité) et corrige dans l'Atelier. Après chaque
   build testé : `install-cyber-race-gamx.mjs`, `-CheckOnly`, puis une capture.
3. **Édition validée**, seulement quand je l'approuve explicitement : `install-cyber-race-gamx.mjs
   --gamx ... --promote`, puis ajoute dans Playnite « Cyber Race 1992 - GamX - Édition validée »
   (même lanceur, `-Channel Validee`, même art). Ne la remplace jamais sans mon accord.
4. **Publication web** (décision à me faire prendre, avec ses conséquences) : le jeu tourne dans
   n'importe quel navigateur. Pour l'offrir sur `https://graphysx.specialblend.ca/cyber-race.html` :
   ajouter la page aux entrées du build produit (`vite.config.ts`, multi-page), vérifier
   `scripts/product-assets.mjs`, passer la règle d'impact à `deploy: true` avec un smoke adapté,
   et la fusion sur `main` la mettra en ligne. **Sans aucun extrait du film.** Bonus : en HTTPS, le
   Quest peut jouer directement dans son navigateur, sans câble. À peser : le titre et le thème
   empruntés au film sur un site public. Le `.icu` (`agentx.specialblend.icu`) est l'entrée privée
   d'AgentX, pas un hébergement de jeu.
5. **VR** : tester sur le Quest (Link + Edge, ou le navigateur du Quest si publié en HTTPS) ;
   envisager une vue cockpit en option et une rotation par crans pour le confort.
6. **Son** : faire écouter, équilibrer musique, effets, voix ; ajouter un réglage de volume.
7. **Idées en réserve** : AgentX comme adversaire ou fantôme (sur le modèle de « Race AgentX » de
   BallZ) ; portage dans le moteur GraphysX (étagère Games, `api.steer`) ; leaderboards via le scene
   store ; d'autres tableaux inspirés ; Peter qui aide à la fin du chapitre 7 ; remappage des
   touches, inversion de l'axe vertical ; options d'accessibilité.

Avant de dire qu'une chose est faite : preuve (tests, capture regardée, reçu), et dis clairement
ce qui n'a pas été vérifié.

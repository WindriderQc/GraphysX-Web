# Ballsy — première piste, puis volcan

> Dernier suivi : [préparer une vraie partie](BALLSY_PLAYTEST.md), avec test guidé des
> manettes et recentrage de la maquette VR. Branche `codex/ballsy-playtest-readiness`.
> Le matériel réel et la liaison USB/HTTPS restent à recevoir.

> Suite du 6 novembre : [le volcan et le géant facultatif](BALLSY_VOLCANO.md) sont
> implémentés dans `codex/ballsy-volcano-giant`, à partir du socle local `5498f04`.
> Les étapes 3/4 passent les tests navigateur; l’étape 5 passe en émulation Quest 2.
> La réception matérielle de l’étape 2 et du Quest reste attendue. Le reçu ci-dessous
> conserve l’historique du premier socle.

État du 6 novembre 2026. Première réalisation locale réversible sur
`codex/ballsy-family-foundation`, dans
`/home/yb/codes/GraphysX-Web-ballsy-20261106` sur devX.
Base : `origin/main` à `3f97c4cae4631967b9283caeda7ccbbbd538926a`.
Ce document est un plan de travail et un reçu de validation, pas une promesse de livraison VR.

## Le résultat recherché

Plusieurs balles **font la course les unes contre les autres** sur la télé. Le jeu doit
rester agréable sans casque. Un parent peut porter le Quest et devenir un géant calme
autour de la piste miniature. Selon le mode, il aide une balle choisie ou crée des
perturbations que les coureurs peuvent lire et contrer.

Les dernières précisions orales de Yanik priment sur les formulations plus anciennes de
« coopération entre les balles ». L'aide désigne ici la relation géant–balle. Une action
du géant n'arrête jamais automatiquement la course. Temps, préparation, accès aux postes
et ressources créent ses choix. Les valeurs d'exemple ne sont pas des spécifications.

Le Quest n'est pas nécessaire pour les enfants à l'écran. Meta indique que les enfants
de moins de 10 ans ne peuvent pas utiliser les Quest 2 et 3.
[Information officielle Meta](https://www.meta.com/quest/parent-info/), consultée le 6 novembre.

## Ce que l'inspection a établi

| Source inspectée | Constat et conséquence |
| --- | --- |
| `C:\Users\Yanik\codes\AGENTS.md` | Le développement Linux se fait sur devX. Le placement GraphysX reste particulier; ne pas réactiver son MCP. Une nouvelle branche isolée sur devX évite de reprendre une copie Windows partagée. |
| `CLAUDE.md`, `README.md`, `HANDOFF.md`, `progress.md` | Préserver les autres worktrees, un seul verrou de rendu par machine, une boucle par host, scènes via l'API native, vérification visuelle obligatoire. Les vieux états de publication du handoff ne sont pas une référence de HEAD. |
| Git Windows et devX, branches et sessions connues | La copie Windows `main` était à `b2091a8`; devX `main` à `4a463c0`. L'amont vérifié était à `3f97c4c`. Fetch de l'amont, puis nouveau worktree; aucun ancien checkout n'a été déplacé ou nettoyé. Des branches LLMx/island et un travail Cyber Race distinct existent. |
| `src/ballz-level-scene.ts`, `src/ballz-play.ts`, `scripts/smoke-ballz.mjs` | BallZ est déjà jouable : sphères physiques, visée/propulsion, clavier, manette, plein écran et règles. La couche humaine existante pilote surtout une balle et une caméra de poursuite; ce n'est pas encore l'écran familial partagé. |
| Archive Windows `GraphysX` : README, inventaire `Archive/bckup/BallZ2015.bckup`, recherche Ballsy | Des sources historiques BallZ sont conservées, avec un ancien prototype. Le README de cette archive décrit une ancienne organisation; le produit actif et le moteur réutilisé ici restent GraphysX-Web/Rapier. Rien de l'archive n'est migré ni écrasé. |
| `src/agent-world-rules.ts` et le smoke multijoueur existant | Les sujets ont déjà leurs propres tours, portes et temps. Les collectibles peuvent être partagés : le premier incrément n'en utilise pas, pour garder une compétition indépendante. |
| Recherche `Ballsy` et inventaire `ball*` dans le produit | Le concept Ballsy ne possède pas d'application dédiée dans la base inspectée. Le socle concret à reprendre est BallZ, sans prétendre avoir retrouvé une implémentation des liquides ou du géant. |
| Skills et mémoire | Aucun `.agents/skills` applicable trouvé dans les emplacements du projet inspectés. Le skill du dépôt `skills/graphysx/SKILL.md` renvoie les changements de source au workflow du dépôt. `develop-web-game` est utilisé pour les entrées, l'avancement déterministe et les captures. La mémoire locale recommande les preuves visuelles et la synthèse en français; aucun état Ballsy exploitable n'y a été trouvé. |

Le carnet de conception est la [Page GraphysX/Quest](https://chatgpt.com/space/page_53e27f78614081918df0e82547771f44), lue ici.
L'[artefact Ballsy & BallZ](https://claude.ai/artifact/Tfrm6e6tvb3bSeZhBoDJFN#12b4b536-b719)
est conservé comme référence. Son accès web direct a échoué dans cette tâche; le rapport de
lecture de la tâche « Analyser le défi GraphysX » a été consulté. Les cartes, fuites,
énergie partagée et huit joueurs restent des propositions, pas du comportement validé.

## Incrément 1 : deux balles sur le même écran

Ouvrir `/ballsy.html` dans la prévisualisation de cette branche. C'est une entrée autonome
du produit qui réutilise `PlatformHost`, Rapier, `api.steer` et `api.rules`.
Aucun moteur parallèle, service, serveur multijoueur ou accès AgentX n'a été ajouté.
Le rendu partagé et Cyber Race ne sont pas modifiés.

- Deux sphères distinctes, Lagon et Corail, un circuit entièrement visible et deux tours.
- Trois portes ordonnées par tour avant l'arrivée; pas de victoire en coupant directement à la ligne.
- Clavier : J1 flèches + Espace pour freiner; J2 WASD/ZQSD + Majuscule pour freiner.
- Manettes : deux slots stables, uniquement si le navigateur rapporte `mapping: "standard"`.
  Stick gauche = direction absolue; bouton physique du bas = frein; Start = départ/pause/reprise.
  Une manette non standard est signalée et laisse le clavier utilisable. Aucun libellé de bouton
  Xbox/Nintendo n'est déduit du nom du périphérique.
- Départ avec décompte, pause commune, perte de focus/connexion signalée, fin individuelle,
  second joueur autorisé à finir, résultats et revanche sans recharger.
- Bouton plein écran ou F; Échap ou P met en pause. Le casque est absent de ce prototype.
- Secours automatique en cas de sortie du plateau, sans remettre les tours à zéro.

La piste neutre sert à éprouver le pilotage, la caméra et les règles. Elle ne fixe pas
le premier monde à « chantier ». La double coque et les liquides internes de Ballsy
restent à prototyper séparément; les deux sphères ne sont pas présentées comme une
simulation déjà fidèle de ce concept.

## Roadmap avec critères de sortie

| Étape | Travail concret | Preuve nécessaire pour passer à la suite |
| --- | --- | --- |
| **1 — Piste familiale, cette branche** | Deux concurrents, caméra commune, commandes séparées, départ et revanche. | Course complète dans le navigateur, portes attribuées au bon joueur, pause/reconnexion sans permutation. Puis essai à deux sur la télé réelle. |
| **2 — Recevoir le jeu sur le matériel** | Tester les manettes possédées et ajuster vitesse, frein, contraste et taille des balles. Comparer la caméra fixe à une variante uniquement si la piste ne se lit pas. Essayer le retour au launcher GamX/Playnite, sans l'installer ni modifier ses raccourcis avant choix du matériel. | Noter modèle, USB/Bluetooth, OS, navigateur/version, `mapping`, slots et boutons. Deux joueurs finissent et relancent une partie avec une explication courte, sans clavier d'adulte si les manettes fonctionnent. Mesurer les temps de frame sur ce PC; aucun chiffre FPS n'est promis à partir du headless. |
| **3 — Volcan à l'écran, un seul tableau** | Ajouter un modèle borné de débit et quelques canaux prédéfinis manipulables, puis un geste de creusement simplifié. Un seul grand cours concentre le débit; deux petits le répartissent. Le volume total est conservé. Le géant peut être essayé à la souris avant le Quest. | Le partage ne duplique pas la lave. Chaque petit cours ralentit moins que le gros à débit total égal. Les coureurs voient le danger arriver, peuvent choisir leur trajectoire et continuent à avancer. Pas de simulation complète des fluides nécessaire à cette preuve. |
| **4 — Choix du géant dans le volcan** | Préparation et trajet entre postes, budget d'actions, délai lisible et ressources limitées. Mode aide : détourner les crues pour éviter accumulation et débordement. Mode défi : répartir le flux pour gêner sans condamner un passage. | Essais qui montrent un vrai arbitrage de timing. Un coup raté ne bloque pas la course. Si un aléatoire est ajouté, seed reproductible en test et limites affichées; ni nombre d'actions ni nombre de postes ne deviennent un cadre global prématuré. |
| **5 — Géant Quest facultatif** | Deux vues du même état : PC autoritaire pour la course, Quest client de présentation et d'actions validées. D'abord poste fixe et contrôleurs; conserver un opérateur souris et la course autonome si le casque part. | Essai avec le parent au Quest : connexion et départ explicites, confort à l'échelle maquette, actions reçues une seule fois, budget non contournable, latence/perte/reconnexion, course qui continue sans casque. Mains libres et réalité mixte attendent une preuve distincte. |
| **6 — Deuxième tableau, seulement après réception** | Préciser chantier/grue ou jungle/lianes à partir des essais. Extraire alors les comportements réellement communs : poste, préparation, coût et effet temporaire, uniquement s'ils se répètent. | Un geste propre au monde et un plaisir différent. Les règles locales restent simples; pas de moteur générique à plugins ni de catalogue de mondes vide. |

Cette séquence avance par petites réalisations vérifiables plutôt que par dates garanties.
Ne pas viser huit balles avant de voir si deux restent lisibles depuis le canapé. Le mode
écran reste une exigence à chaque étape; le Quest ne devient pas une dépendance du départ.

### Les autres branches restent conservées

Village de briques, Technic et STL, construction, jardin, cache-cache, peinture et autres
jeux demeurent des concepts distincts. Le lanceur de peinture à assembler en trois pièces
avec un stock limité est un exemple de préparation, pas un système d'armes à construire
maintenant. Cyber Race demeure l'expérience personnelle séparée. Aucun fichier de ces
expériences n'est modifié par cette branche.

## Validé, testé et à vérifier

**Validé par l'inspection** : socle BallZ et règles multisujets existants, provenance de
HEAD, isolation de la branche, contrôleurs annoncés par leur mapping réel plutôt que leur marque.

**Tests exécutés** : voir le reçu ci-dessous après la validation navigateur. Une manette
synthétique vérifie le logiciel; elle ne qualifie pas un périphérique physique.

**À vérifier** : confort réel du pilotage, lecture des deux balles depuis le canapé,
FPS sur le PC télé, modèles Xbox/Nintendo en USB/Bluetooth, navigateur de console éventuel,
launcher, double coque/liquide, volcan, multiclient et Quest. Aucun de ces points n'est
couvert par une capture headless. L'accès HTTPS/WebXR et le transport PC–Quest doivent
être reçus avant d'annoncer un mode VR jouable.

Références techniques : [Gamepad API](https://w3c.github.io/gamepad/) pour le mapping et les
axes; [WebXR](https://immersive-web.github.io/webxr/) pour les sessions XR. Ces contrats ne
constituent pas un certificat de compatibilité de la télé ou des manettes de Yanik.

## Reproduire localement sur devX

```bash
cd /home/yb/codes/GraphysX-Web-ballsy-20261106
npm run typecheck
node --test test/ballsy-input.test.mjs
npx eslint src/ballsy-*.ts scripts/smoke-ballsy.mjs test/ballsy-input.test.mjs --max-warnings 0
node scripts/with-verify-lock.mjs -- npm run build
npm run preview -- --host 127.0.0.1 --port 4196 --strictPort
```

Dans un autre terminal devX, avec la prévisualisation active :

```bash
SMOKE_BASE=http://127.0.0.1:4196/ SMOKE_ARTIFACTS=output/ballsy \
  node scripts/with-verify-lock.mjs -- node scripts/smoke-ballsy.mjs
```

Depuis le PC Windows, un tunnel SSH permet l'essai sans publication :

```powershell
ssh -N -L 127.0.0.1:4196:127.0.0.1:4196 devX
```

Puis ouvrir `http://127.0.0.1:4196/ballsy.html`. Le serveur est une prévisualisation de
développement liée au loopback, pas un déploiement LAN/public. Garder le même onglet et
actualiser après une nouvelle compilation.

## Reçu de validation

Les traces détaillées et captures se trouvent dans `output/ballsy/` (ignoré par Git).
Résultats obtenus sur le build final de cette branche :

- TypeScript et lint complet du dépôt : réussis. Résultats dans `typecheck.log` et `lint.log`.
- Contrats ciblés entrées + plan d'impact : **25/25 réussis**. La suite complète exécutée
  par le runner compte **932/932 tests réussis**, sans skip, conservés dans `regression.log`;
  son résumé ne revendique pas une
  réception matérielle.
- Build produit complet : réussi. Les avertissements sur la taille des chunks et
  `inlineDynamicImports` sont conservés; aucun changement de dépendance n'est introduit.
- `smoke-ballsy` : réussi, **deux tours physiques par balle**, deux profils standard
  synthétiques aux indices 1 et 3, **3 056 frames déterministes**, aucun secours ni erreur
  console. Le premier termine à environ 42,7 s et le second à 50,9 s dans ce parcours de
  test. Ce sont des temps simulés de course, pas une mesure FPS.
- Le smoke vérifie aussi clavier indépendant, frein, départ, portes dans l'ordre,
  refus d'une arrivée anticipée, attribution par joueur, pause immobile, perte de focus,
  déconnexion avec clavier de secours, résultats, revanche, plein écran, cadrage de toute
  la piste et secours hors plateau. Une page neuve teste ensuite la boucle réelle de
  rendu, sans appeler `advanceTime`.
- Client officiel de `develop-web-game` : deux rafales terminées, fichiers
  `skill/shot-{0,1}.png` et `skill/state-{0,1}.json` inspectés, aucun fichier d'erreur produit.
- Régression officielle ciblée : **7/7 contrôles réussis** — contrats Node, raccord
  heightfield et matériaux Rapier, standalone, Cyber Race, assets produit et garde d'assets.
  Le smoke Ballsy indépendant est en plus de cette sélection.
- Captures de lobby, course réelle, résultats et télé 1920×1080 ouvertes et inspectées.
  Le cadrage et la lumière ont été corrigés après la première lecture visuelle. Le plein
  écran est testé en attendant son état effectif, sans délai arbitraire ni timeout allongé.
- Prévisualisation liée au loopback et tunnel local : `http://127.0.0.1:4196/ballsy.html`
  a répondu **HTTP 200 depuis le PC Windows**. Laisser ces processus actifs sert l'essai
  demandé; cela ne publie pas le produit.

Les smokes ont été lancés sous le verrou machine. Aucune assertion de comportement
produit n'a été affaiblie pour obtenir du vert. Le nouveau contrat d'impact inclut les
contrôles de base que le dépôt ajoute normalement à une page publiée.

L'entrée Vite supplémentaire est vérifiée par le build complet. Le plan de publication
reste conservateur pour les changements de configuration. Aucun passage complet de toutes
les applications WebGL n'est revendiqué pour ce prototype isolé. Une éventuelle publication
doit suivre le plan d'impact du dépôt, et nécessite une autorisation séparée.

## Prochain pas

Le suivi autorisé a réalisé le volcan et la liaison du géant : voir le
[reçu de la suite](BALLSY_VOLCANO.md). Le prochain critère reste une réception sur la
télé et les manettes possédées, puis le parent au Quest via HTTPS privé reconnu.
Ajuster les contrôles, la lisibilité et le timing à partir de cette partie avant un
autre monde. Aucune réception physique n’est déduite des tests automatisés.

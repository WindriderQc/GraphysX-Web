# LLMx — reprise après redémarrage et partage Codex / Claude

Date : 2026-09-13. État : plan terminé; implémentation non démarrée.

Objectif demandé par Yanik : terminer rapidement en partageant le travail entre Codex et son agent Claude après le redémarrage du PC.

## Point de reprise

- Plan complet : [LLMX_IMPLEMENTATION_PLAN.md](LLMX_IMPLEMENTATION_PLAN.md).
- Dossier de référence : `C:\Users\Yanik\codes\GraphysX-Web-llmx-plan`.
- Branche de planification : `codex/llmx-experience-plan`.
- Commit du plan initial : `d053ae7`.
- Code GraphysX utilisé pour l'analyse : `60aaa5b`.
- Dernière vérification de cette base : 315 tests réussis, 1 ignoré, 0 échec. Ces tests ne prouvent aucune fonctionnalité LLMx future.
- Aucun serveur, travail GPU ou processus de génération n'a été démarré pour préparer le plan et cette passation. Aucun travail Claude n'a été envoyé.

Les références de code et la disponibilité des services doivent être relues après le redémarrage. Aucun état gardé uniquement dans cette conversation n'est nécessaire pour comprendre le plan.

## Répartition proposée pour aller vite

| Responsable | Travail principal | Livrables |
| --- | --- | --- |
| **Claude** | Visage et ambiance | Asset original, rendu de cubes et expressions, Forge nocturne, éclairage/particules, chorégraphie visuelle, qualification visuelle |
| **Codex** | Conversation et intégration | Contrats communs, montage LLMx, schéma/sérialisation du visage, consommateur privé Household, audio, accueil « Hello », bibliothèque, raccord des commandes |
| **Codex, intégrateur initial** | Assemblage et parcours complet | Intégrations intermédiaires, tests de régression, résolution des incompatibilités et reçus de validation |
| **Yanik** | Arbitrages visuels et essai physique | Valider le caractère du visage et l'ambiance, puis la vraie conversation au micro et aux haut-parleurs |

Ce partage est un défaut de départ. Le modifier explicitement si Claude travaille déjà sur certains fichiers, puis mettre à jour cette passation. Les changements de propriétaire sont annoncés avant les modifications.

## Première étape après redémarrage : un accord court sur les interfaces

Codex vérifie les branches et travaux en cours, puis prépare la petite interface commune avant que les deux agents modifient les intégrations. On ne recommence pas toute l'étude.

Figer seulement :

1. La configuration sérialisable de la face : version, asset, palette, graine, densité et réglages bornés.
2. L'interface du renderer de face : objet 3D, mise à jour de présence, niveau de parole, progression d'assemblage, tick et destruction.
3. Le contrat du constructeur d'environnement : document GraphysX et ancres nommées de caméra, visage et zone de création.
4. Les signaux de conversation/lecture et la frontière entre état persistant et état temporaire.
5. Les propriétaires de fichiers et la base Git commune.

Un fichier proposé `src/llmx-contracts.ts` peut porter ces types. Il n'existe pas encore. Codex en est propriétaire; Claude signale les besoins de changement au lieu de le modifier en parallèle.

Le renderer reçoit des données de présentation normalisées. Il ne connaît ni URL de service, ni credential, ni logique de session. Son animation reste dans la boucle du host. Une simulation locale peut aider les essais visuels, mais doit être identifiée comme telle et ne constitue jamais une preuve de conversation connectée.

## Propriété initiale des fichiers

| Zone | Propriétaire proposé |
| --- | --- |
| Nouveaux fichiers de face, données artistiques, source de fabrication et tests purs associés | Claude |
| Nouveau constructeur de Forge et données de chorégraphie visuelle | Claude |
| `main.ts`, `platform-host.ts`, `agent-world-runtime.ts`, API/manifeste, validation serveur et éditeur | Codex |
| Contrats communs, application LLMx, bibliothèque, contexte spatial et adaptateur Conversation | Codex |
| AIOps / Household, AgentX, VoiX | Codex |
| Enregistrement des nouveaux assets et du nouveau starter dans les catalogues partagés | Codex, à partir des assets et des descripteurs livrés par Claude |
| Manifeste des vérifications et scripts d'acceptation intégrés | Codex; Claude fournit ses cas visuels et les attentes |

Les noms précis des nouveaux modules suivent le plan ou l'accord d'interface. Claude peut proposer un patch sur un fichier partagé; l'intégrateur l'applique. Cela évite deux réécritures concurrentes du runtime ou du montage des applications.

## Déroulement en parallèle

**Vague A — premier visage parlant.** Dès l'accord d'interface, Claude travaille sur P1/P2 (visage et Forge) pendant que Codex réalise P3/P4 (session, voix et accueil), ainsi que les raccords de schéma et de montage nécessaires.

Intégrer tôt un premier visage statique dans le vrai host, puis une première expression alimentée par les signaux réels. La finition artistique et les cas d'interruption peuvent ensuite progresser de part et d'autre. Ne pas attendre deux gros ensembles terminés avant le premier raccord.

**Vague B — monde persistant et création.** Codex termine la bibliothèque P5 puis le contexte/propositions P6. Claude affine la face parlante, les réactions aux créations, les profils réduits et le rendu tactile. Une modification d'interface passe par l'intégrateur avant adoption.

**Vague C — acceptance.** Intégration des tests, vérification visuelle et de performance, puis essai LAN et acoustique avec Yanik. Les contrôles WebGL lourds respectent le verrou global existant et passent un à la fois. Les tests purs peuvent être exécutés séparément.

Le chemin critique est le raccord **session → accueil → lecture réelle → visage**. Les visèmes avancés, nouveaux modèles 3D arbitraires et raffinements de télémétrie ne le bloquent pas. La V1 complète conserve les exigences de sauvegarde et de co-création du plan.

## Règles d'intégration

- Un worktree et une branche par agent; une même base choisie et documentée après inspection. Ne pas supposer que le checkout KidX actuel est automatiquement la meilleure base de livraison.
- Ne pas fusionner tout le travail vocal KidX sans comparaison. Réutiliser les changements nécessaires et préserver la frontière Family/personnel.
- Petits commits en anglais, avec fichiers touchés et tests exécutés. Réponses et échanges avec Yanik en français.
- À chaque livraison : commit(s), résultat visible, tests, limites et éventuelle dépendance d'interface. Les résultats simulés restent étiquetés.
- Un seul intégrateur touche les fichiers partagés. Pas de refonte transversale ou d'installation de dépendance supplémentaire sans besoin démontré.
- Demander à Yanik avant un essai sollicitant le homelab. Ne pas reconfigurer un GPU, un modèle ou les contextes `ax/` pour accélérer sans instruction appropriée.
- Conserver séparément les preuves de tests, d'intégration, de déploiement et d'acceptation acoustique.

## Message prêt à transmettre à Claude après redémarrage

Tu participes avec Codex à la réalisation de LLMx dans GraphysX. Lis d'abord `C:\Users\Yanik\codes\GraphysX-Web-llmx-plan\docs\LLMX_IMPLEMENTATION_PLAN.md` et cette passation. L'objectif est une Forge nocturne avec un visage original en cubes 3D, éclairage, brume et particules, dans laquelle notre agent ouvre la conversation par « Hello » lorsque scène et audio sont prêts.

Tu prends la partie visage et ambiance : asset original en volume, renderer groupé de cubes, régions et expressions, assemblage de bas en haut, constructeur d'environnement et chorégraphie visuelle. Codex prend les contrats communs, le runtime partagé, la conversation AgentX/Household/VoiX, l'accueil, la persistance et l'intégration.

Commence par vérifier ton worktree et convenir de la base et de l'interface avec Codex. Tu peux inspecter les assets et établir la silhouette pendant la fixation de l'interface. Travaille sur tes nouveaux modules et assets; propose les changements du runtime, de `main.ts`, des catalogues et des contrats à l'intégrateur. Aucun deuxième moteur ou loop de rendu. Aucune nouvelle dépendance de production par défaut.

Livre un premier visage statique intégrable tôt, puis ses expressions et l'ambiance par petits commits. Nous voulons vérifier rapidement une vraie face parlante dans le host avant la finition. Distingue les essais visuels simulés de la conversation réelle. Garde la face lisible et le texte/les contrôles utilisables sur un profil réduit. Code et commits en anglais, communication en français.

## Message de reprise pour Codex

Reprends LLMx à partir du plan et de `LLMX_RESTART_HANDOFF.md` dans le worktree `GraphysX-Web-llmx-plan`. Le PC vient de redémarrer. Vérifie l'état local et les éventuels changements de Claude, fixe la base et les interfaces minimales, puis démarre ta partie Conversation/Hello/intégration conformément au partage. Ne redemande pas les choix déjà décrits; sollicite Yanik seulement pour une information réellement manquante ou l'accès au homelab requis par ses instructions.

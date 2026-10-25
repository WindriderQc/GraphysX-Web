# DISKX / Janitor : premier parcours en lecture seule

## Ce qui change

Sans source : données entièrement synthétiques. Avec DISKX_DATA_URL : inventaire par GET.
Actualiser prépare une observation puis la remplace atomiquement, sans mélange fixture/live.
Un échec conserve la précédente et autorise un nouvel essai. Les résumés avant/après sont
comparés, mais ne prouvent pas un snapshot immuable : la cohérence reste explicitement non vérifiée.
Les racines sont déclarées par config (/mnt/datalake et /mnt/media dans l’adaptateur actuel).
Tree fournit des tailles DIRECTES ; le client cumule et infère les parents. Il filtre les
frontières de chemin pour exclure /foobar d’une lecture /foo. Pas de curseur tree disponible :
2 000 lignes maximum par périmètre, troncature conservatrice. Une plongée recharge aussi
le périmètre choisi. Dates de scan et origine restent visibles.

Rendu : 48 districts, 7 enfants de toit, 18 étiquettes ; longue traîne regroupée, liste par
lots de 40. Identifiants encodant chemin et rôle, indépendants du rang. Renommer change
l’identité graphique ; aucune identité physique n’est inventée.

Exporter les agrégats ne contient que noms génériques, tailles et nombres. Aucun chemin,
nom de fichier, tag ou identifiant source. Le raccourci Éditeur a été retiré de DISKX.
Attention : l’export natif générique de GraphysX reste complet, pas expurgé.
Les données originales ne sont pas purgées : historique/worktree initial conservés.

## Parcours Janitor

Lire le dernier rapport lit seulement la stratégie existante et les groupes vérifiés paginés.
Absence de rapport, erreur et démonstration sont distinctes. Aucun scan, run, génération,
approbation, suppression ou déplacement. Le schéma consommé est validé ; incompatibilité
ou changement de rapport pendant le parcours entraînent un message et une nouvelle lecture.
Les omissions sont visibles, aucune identité de run n’est fabriquée depuis le rapport compact.
Le raccord des runs n’est pas livré dans ce premier parcours.

Contrats source transmis et vérifiés par l’audit parent au commit AgentX
87fc29fd0565fb16b11b3dbdeb70ed4758f19ae5, sans preuve d’installation :
- core/surfaces/data-toolbox/index.js : GET /api/data-toolbox/janitor/strategy/latest
- core/surfaces/data-toolbox/janitor-review-relay.js : GET /janitor/strategy/latest/groups
- data/controllers/storageController.js : inventaire et preuves de duplication
Source : https://github.com/WindriderQc/AgentX/tree/87fc29fd0565fb16b11b3dbdeb70ed4758f19ae5

Les groupes exposent report.id, offset/nextOffset, preuve, fichiers, omissions et revue.
SHA-256 avec métadonnées courantes est distinct d’une similarité. candidateBytes ne vaut
pas économie ; provenSavingsBytes reste une estimation logique du rapport. Une règle de
survivant ne vaut pas autorisation, un run complete ne prouve aucun déplacement terminé.

## Doublons dans la ville (lot 2)

Chaque groupe lu porte un bouton « Montrer dans la ville ». DiskX plonge dans le dossier
commun aux copies (s'il en contient une directement, un niveau plus haut ; si l'index ne le
connaît pas, le premier parent connu ; copies sur deux disques : « Tous les disques »).
Les quartiers qui tiennent une copie sont entourés : cyan pour la copie gardée selon la règle
du rapport, ambre pour les copies en trop, gris si le rapport ne nomme aucun survivant (rien
n'est alors marqué en trop). Un arc relie chaque quartier ambre au quartier cyan ; une étiquette
indique « gardée » ou la taille logique que les copies en trop libéreraient. Les copies hors du
niveau affiché ou omises par la page sont annoncées, jamais placées ailleurs.

Le curseur actuel → cible fait voyager un repère sur chaque arc et éteint les quartiers ambre :
« après la règle ». Le document de scène ne change pas (le smoke le compare avant et après).
La démo synthétique contient deux groupes sur les dossiers de la capture fictive.

Règles pures et testées : `diskx-duplicates.ts`. Calque réutilisable : `presentation-links.ts`
(lieux par rôle source / cible / neutre, arcs, repères, budget de 64 lieux refusé au-delà).
Couleurs communes à toute la présentation : ambre = ce qui partirait, cyan = ce qui reste ou la
destination. La démo de déplacement fictif suit la même convention.

## Démonstration et primitives

Ouvrir ?app=diskx&source=fixture&janitor=demo. Choisir un statut fictif puis Voir actuel et cible.
Lire/Pause/Retour/Voir la cible/curseur ne changent ni fichiers ni document de scène.
Contour cyan = actuel ; ambre = cible proposée. Le cube mobile est un repère sans échelle
volumétrique. Réduction de mouvement : accès direct à la cible, pas d’animation automatique.
Les six statuts proposé/autorisé/en cours/terminé/échoué/inconnu restent marqués fictifs.

presentation-transition.ts : curseur borné et interpolation pure.
presentation-overlay.ts : contours, liaison et repère, sans état métier.
Cadrage frameView, annotations HTML et boucle subscribeFrame existants réutilisés.
Propositions/révisions/reçus LLMx restent inchangés. L’aperçu n’émet aucun reçu métier.

## Volumes et limites amont

Tuile libre unique par volume et jauge de 0ae87a2 préservées. DISKX_VOLUMES accepte valeurs
déclarées ou montage local mesuré par statfs. Une déclaration sans date n’obtient plus
artificiellement la date de lecture comme date de mesure. Données distribuées fictives.
Index logique != occupation ZFS ; racines partagées ne multiplient pas la capacité.
Hardlinks, symlinks, aliases, blocs alloués, compression, snapshots et rétention empêchent
de dériver l’économie physique de la somme des fichiers. Leur détection reste amont.
configuredCapacity Janitor est un budget HASHING, pas une capacité disque.

Extension minimale proposée (non implémentée) : volumeId/hôte/racines/aliases, capacité,
libre disponible, date et méthode de mesure à chaque observation ; snapshotId, couverture
et pagination stable ; résultats d’opération identifiés et mesures avant/après distinctes.
Tout changement AgentX exige son environnement autorisé. Aucun refus SSH n’est contourné.

## Math Teacher et qualification

Deux parcours existants : llmx-math.ts (unités natives 0..20, addition/soustraction/comptage)
et llmx-math-scene.ts (masque, comptage jusqu’à 100, additions jusqu’à 20).
Tests existants conservés et compatibilité des positions avec l’interpolation vérifiée
sur toutes les additions valides. Aucun modèle, microphone, enfant ou son.
Pas de refonte du professeur : ergonomie et captures restent à valider dans le navigateur.

Tests : node --test test/diskx*.test.mjs test/llmx-math*.test.mjs
Smoke nouveau : node scripts/smoke-diskx-janitor.mjs après build (GET simulés, réseau externe
bloqué, navigateur muet). Math : scripts/smoke-llmx-creation-math.mjs, fixtures existantes.
## Validation du 2026-10-25 (America/Toronto)

- `npm test` 628 pass, 1 skip existant ; `tsc`, `eslint --max-warnings 0` et build propres.
- Smokes PASS sur le build : `diskx`, `diskx-janitor` (bureau et mobile), `llmx-creation-math`,
  `llmx-face-embed`. Captures `output/playwright/diskx-janitor/` inspectées.
- Lecture réelle par le serveur de dev (`DISKX_DATA_URL` vers la passerelle AgentX) :
  `GET janitor/strategy/latest` et `janitor/strategy/latest/groups` répondent ; rapport
  `ready_for_review`, 48 848 groupes vérifiés, 0 action exécutable. Un POST sur le relais
  répond 405. Huit clics sur des chemins de groupes réels plongent dans le bon dossier.
- Défaut trouvé en direct et corrigé : la clé de scène copiait le chemin en hexadécimal et
  dépassait les 80 caractères d'un identifiant d'entité sur les dossiers profonds (plongée
  impossible). Elle est maintenant une empreinte de 16 caractères, testée sur un chemin long.
- Bundle construit : aucun nom de l'ancienne capture réelle.

Lot 2 (même jour) : huit vrais groupes montrés dans la ville, tous ancrés, aucune copie hors
vue ; un groupe aux deux copies dans le même quartier reste un seul quartier « gardée », sans arc.
Reste à faire : progression d'un run en direct, propositions de déplacement réelles (les
`workItems` d'organisation), le lien depuis Nestor, et l'ergonomie Maths avec un enfant. La publication du site reste une décision séparée.

Futur : activité réelle, replay durable, historique de snapshots, déplacements prouvés,
autorisation métier, quarantaine/restauration, similarité, liens physiques, gain récupéré.
Le top 20 n’est pas une liste de fonctionnalités livrées.

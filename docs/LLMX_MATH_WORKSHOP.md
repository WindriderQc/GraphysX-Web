# LLMx — atelier de mathématiques dans la Forge

> **Document historique — plan LLMx de septembre 2026.** Fusionné tel quel depuis `codex/llmx-experience-plan` le 2026-10-25; non mis à jour depuis le 2026-09-13. L'état courant de LLMx est décrit dans [LLMX_CURRENT_HANDOFF.md](LLMX_CURRENT_HANDOFF.md) et [LLMX_CREATION.md](LLMX_CREATION.md). Les worktrees et branches cités ci-dessous n'existent plus.

Date : 2026-09-13. Ajout demandé par Yanik au plan LLMx. Statut : réutilisation analysée et planifiée; aucun tuteur LLMx implémenté ici.

## Ce que nous avons encore

Le **Math Game** est toujours présent dans le code GraphysX inspecté, à la révision `f3219f6`. Il apparaît dans le navigateur de scènes sous ce nom. Son moteur est aussi utilisable indépendamment, depuis la palette Life de l'éditeur ou l'API partagée.

| Élément existant | Utilité pour LLMx | Source |
| --- | --- | --- |
| Entité `formula-field` | Champ de petits cubes groupés; changement de coefficients sans reconstruire le mesh | [agent-world-formula.ts](../src/agent-world-formula.ts) |
| Deux familles : `y = ax² + bx + c`, `y = mx + b` | Premières leçons sur pente, translation et parabole | Même module, avec `xOffset` appliqué avant évaluation |
| Scène `archive-math-lab` | Tableau, grille, axes, courbes et décor nocturne | [archive-math-lab.ts](../src/archive-math-lab.ts) |
| `api.formulas()`, `api.spawn()`, `api.update()`, `api.state()` | Découverte, manipulation et lecture du résultat par l'agent et l'humain | [agent-world-api.ts](../src/agent-world-api.ts), [agent-world-runtime.ts](../src/agent-world-runtime.ts) |
| Configuration sérialisée dans l'entité | Retrouver une expérience mathématique après sauvegarde | `serializeEntity()` dans le runtime |

Le champ par défaut contient 48 × 48 cubes, avec un maximum existant de 10 000. Ce plafond ne devient pas notre budget par défaut pour un atelier ajouté au visage et aux effets de la Forge. Commencer avec une coupe lisible, puis rendre l'épaisseur et les autres coupes optionnelles.

La vignette conservée est un aperçu historique de cette scène, pas une capture d'un futur cours LLMx : [Math Game](../public/assets/shelf-thumbnails/archive-math-lab.jpg).

## Expérience proposée

La Forge conserve son visage. À « explique-moi les paraboles », une table de démonstration apparaît dans la zone de création, à côté de lui. Le visage et le regard attirent l'attention vers l'objet expliqué; l'éclairage de fond se calme et la voix reste intelligible. Formule, axes et valeurs utilisent une présentation sobre et contrastée, même si le décor reste gothique industriel.

L'agent peut montrer un point, tracer une courbe, déplacer un curseur, superposer deux états et poser une question. La même expérience se commande à la voix, au texte et avec un contrôle direct. Les valeurs négatives dictées sont affichées avant application en cas d'ambiguïté de transcription.

Boucle pédagogique : **question courte → prédiction de l'apprenant → transformation visible → mesure → explication → nouvel essai**. Les réponses du LLM n'établissent jamais seules la vérité numérique. Ne pas introduire de score ni inférer la compréhension à partir d'un simple « oui ».

### Priorité confirmée : ambiance d'abord, puis mathématiques concrètes

Yanik précise que les premiers apprenants ont **4 et 7 ans**. L'atelier commencera donc par les quantités, le comptage, l'addition et la soustraction; droites et paraboles resteront des extensions pour plus tard. Adapter le niveau à l'essai de l'enfant plutôt que déduire sa compréhension de son âge.

- Départ simple : compter jusqu'à 5, associer chaque cube à un mot-nombre, comparer deux petits groupes et construire un groupe de même taille. Introduire ensuite de petites sommes et différences quand l'enfant est à l'aise.
- Étape suivante : nombres jusqu'à 20, regrouper par 5 ou 10, déplacer des unités, expliquer une addition ou une soustraction et représenter la même opération de plusieurs façons. Étendre les plages seulement après observation.
- « 2 + 3 » : deux cubes d'une couleur et trois d'une autre se rapprochent; on peut tous les compter et constater qu'il y en a cinq. « 5 − 2 » : déplacer deux cubes vers une zone retirée, en laissant trois dans le groupe actif. Le départ, l'action et le résultat restent visibles et réversibles.
- Pour une comparaison de quantités, conserver la taille des cubes et éviter que perspective, empilement ou couleur seule donnent un indice trompeur. Prévoir un cadrage de dessus ou frontal, des groupes assez espacés, de grosses cibles tactiles et un accompagnement oral sans lecture obligatoire.
- Le nombre et l'opération viennent d'un modèle déterministe; animations, équation éventuelle et réponse orale reprennent ce même état. Le LLM choisit une explication et une question, pas le résultat arithmétique. Des cubes cachés derrière d'autres ne doivent pas faire échouer un comptage.

Ces séances utilisent des primitives déjà présentes et la co-création de LLMx. Leurs données et leur conversation devront suivre la voie Family/persona adaptée aux enfants, séparée de la session personnelle de Yanik. Le décor et le visage pourront être adoucis et les mouvements réduits pour cet usage. Cela ne change pas le choix de Forge nocturne pour la première expérience personnelle.

**Ordre de réalisation demandé : finir d'abord l'ambiance, le visage et l'entrée en conversation.** La pédagogie reste planifiée; ne pas ouvrir ce chantier sur le chemin critique de la Forge.

### Extension ultérieure : voir une pente

1. Afficher `y = x` dans un repère mathématique gradué et marquer `(0, 0)` et `(1, 1)`.
2. Montrer le triangle de pente : déplacement horizontal 1, déplacement vertical 1, donc `m = 1`.
3. Demander ce qui se passera si `m` devient 2. Garder `b = 0` et les échelles des axes fixes.
4. Après application, montrer `y = 2x` et le point `(1, 2)`, avec l'ancienne courbe en référence.
5. Modifier ensuite seulement `b`, par exemple de 0 à 1, pour distinguer translation et pente.
6. Laisser l'apprenant essayer `m = 0` puis une pente négative. Expliquer à partir de l'état réellement appliqué.

### Extension ultérieure : sculpter une parabole

Partir de `y = x²`, faire varier seulement `a`, puis `c`, puis introduire `b`. Comparer `a = 1`, `a = 2` et `a = -1`, sans changer l'échelle entre deux états comparés. Montrer le sommet calculé et quelques substitutions numériques. Le cas `a = 0` devient une droite; il ne possède plus de sommet de parabole.

Avec le décalage existant, la formule exacte est `f(x + xOffset)`. Une valeur positive de `xOffset` déplace la courbe vers la gauche. Si `a ≠ 0`, l'abscisse du sommet est `-b / (2a) - xOffset`.

## Corrections nécessaires avant d'en faire un outil d'enseignement

### Séparer valeur mathématique et position affichée

Le rendu historique calcule `displayY = clamp(2.2 + 0.34 × f(x + xOffset), 0.1, 7.4)`. Ce choix garde les cubes dans le décor; il ne constitue pas un repère mathématique à échelle unité.

Exemples vérifiés contre le code : pour `f(x) = x²`, `f(2) = 4` mais la hauteur affichée vaut `3.56`; `f(5) = 25` est affiché à `7.4`. Un plateau visuel peut donc provenir de la coupure, pas de la fonction. Le zéro mathématique est affiché à `2.2`.

Conserver le comportement et la provenance du Math Game récupéré. Pour l'atelier, isoler une évaluation pure `mathValue`, puis une transformation de présentation explicite avec origine, échelles et domaine. Afficher les coordonnées mathématiques dans les étiquettes. Une valeur hors fenêtre est signalée ou la courbe est interrompue; elle n'est pas transformée en faux plateau. Une remise à l'échelle demandée doit rester visible et ne pas fausser une comparaison en cours.

Les calculs JS sont numériques : indiquer les approximations lorsque nécessaire et tester les comparaisons avec une tolérance adaptée. La résolution symbolique générale n'est pas requise pour les premières leçons.

### Garder tous les éléments d'une démonstration synchronisés

`buildArchiveMathLab()` échantillonne ses courbes à la construction avec `a = 1.5`, `b = -1`, `c = 0`. Modifier ensuite seulement `math-field` ne les recalcule pas. Le helper local `surfaceY()` ne connaît d'ailleurs que la parabole. Le domaine des courbes va de −6 à 6, alors que celui des cubes dépend de `perLane` et de `spacing`.

Dans l'atelier, une seule configuration appliquée doit produire le champ, la courbe principale, les guides, les points, les étiquettes et le tableau de valeurs. Tous utilisent le même domaine et la même transformation. Une ancienne courbe de comparaison doit être identifiée comme telle. Ne pas reprendre les courbes décoratives fixes comme preuve d'un état courant.

### Donner le bon sens aux dimensions et aux paramètres

- Les hauteurs du champ dépendent de `x` et sont répétées selon `z`. L'épaisseur expose la même fonction; elle ne prouve pas une dépendance non triviale à deux variables. Une coupe centrale est préférable pour la première lecture.
- Les coefficients et `xOffset` sont actuellement bornés entre −5 et 5. Une demande de 10 ne produit pas 10. Montrer les limites avant interaction et relire le résultat appliqué.
- `api.state().entities[].formula` contient **déjà** les coefficients résolus et les statistiques du champ. Le contexte LLMx doit les inclure; aucune nouvelle API générale n'est nécessaire pour les obtenir.
- `minHeight` et `maxHeight` désignent les hauteurs affichées des échantillons. Ce ne sont ni les extrema exacts de la fonction continue, ni une preuve de présence du sommet entre deux échantillons. Calculer les propriétés mathématiques séparément.

## Raccord minimal à LLMx

Le contexte spatial de P6 transporte les identifiants de la démonstration, sa révision, la famille de formule, les coefficients résolus, le domaine, l'échelle, les points montrés et les résultats numériques utiles. Un petit descripteur d'atelier référence ces entités et leur configuration; pas de second document parallèle contenant des positions susceptibles de diverger.

L'agent propose une opération sémantique bornée, par exemple changer `m` de 1 à 2 ou montrer le point à `x = 1`. L'application la traduit en commandes GraphysX validées avec la politique d'acceptation de P6. Les contrôles humains passent aussi par l'API partagée. Après le reçu, les résultats recalculés alimentent l'explication orale et l'affichage. L'agent n'annonce pas un changement rejeté ou obsolète comme accompli.

Une animation de transition est temporaire et ne crée pas une révision par image. L'annulation restaure ensemble paramètres, guides et objets associés. Une interruption de voix ne laisse pas de figure intermédiaire enregistrée. La sauvegarde garde l'expérience et les valeurs; l'historique privé de l'apprenant reste dans la session Conversation.

Pour la première version, utiliser les familles structurées existantes, les primitives, splines, panneaux et la boucle de rendu du host. Aucun texte fourni par le LLM ne devient du JavaScript exécuté. Aucune nouvelle dépendance de production n'est nécessaire pour droites et paraboles. Un parseur d'expressions, un rendu de notation plus riche ou un calculateur symbolique seront évalués lorsque les leçons en auront effectivement besoin.

## Livraison et répartition

L'atelier est un premier cas pédagogique de la co-création P6, après le premier visage qui parle. Il réutilise la même zone de démonstration, les mêmes commandes, les mêmes confirmations et la même sauvegarde. Il ne retarde pas le raccord initial « Hello ».

| Lot | Responsable proposé | Résultat attendu |
| --- | --- | --- |
| M1 — Valeurs et affichage | Codex; helper pur éventuellement confié à Qwen avec tests indépendants | Évaluation vérifiable, repère cohérent, fenêtre de tracé explicite |
| M2 — Table dans la Forge | Codex pour les entités et le montage; besoins visuels à convenir avec Claude après sa relance | Courbe lisible, axes, étiquettes, points et comparaison |
| M3 — Conversation pédagogique | Codex via Conversation/AgentX | L'agent explique l'état appliqué, questionne et suit l'apprenant |
| M4 — Jeux de cas et revue | Qwen local sous revue Codex | Exemples, contre-exemples et cas limites acceptés après vérification |

L'inspection de Claude reste suspendue à la demande de Yanik. Cette proposition n'est pas un mandat réceptionné par Claude. L'état du travail effectivement lancé est suivi dans Pipeline; ce document fixe le périmètre et les interfaces envisagées.

Extensions possibles après ces deux leçons : fractions en cubes, aires et volumes, vecteurs, trigonométrie, tangentes puis intégration visuelle. La liste exprime une direction, pas des capacités présentes du `formula-field`.

## Critères d'acceptation

- Les nombres affichés correspondent à la fonction et au point choisis; aucune hauteur décorative n'est présentée comme valeur mathématique.
- Changer `m`, `b`, `a`, `c` ou `xOffset` synchronise tous les éléments pertinents et conserve l'échelle pendant une comparaison.
- `a = 0`, pente nulle/négative, décalage positif, sommet entre échantillons, valeurs hors fenêtre et paramètres hors limites sont traités explicitement.
- La coupe en `z` conserve les mêmes hauteurs et son rôle est expliqué.
- Modification humaine, modification proposée par l'agent, conflit, annulation et reload convergent sur le même état.
- Les étiquettes et contrôles sont utilisables sur une petite fenêtre; le texte permet de suivre sans voix ni couleurs seules.
- Un essai rendu valide la figure, puis un essai de conversation réel valide l'explication et l'interruption. Les contrôles Node seuls ne prouvent aucun de ces parcours.

## Première participation locale réellement effectuée

Pipeline **0687** : relecture ciblée de ces deux modules par `qwen3.8:27b-mtp-q8_0`, via le contrat AgentX `external-consumer` 1.0.0. Le reçu confirme le modèle exact et l'hôte logique `primary`, avec le contexte routé existant de 262 144 tokens. Aucun changement de modèle, de configuration ou d'accès direct à Ollama.

Requête du 2026-09-13 à 19:02:35 UTC; réponse reçue en **45,136 secondes**, 9 729 tokens d'entrée et 1 535 de sortie selon AgentX. Ce délai inclut l'aller-retour du service; ce n'est pas une mesure isolée de génération GPU ni du temps total de développement.

La revue Codex retient la répétition selon `z`, les limites de coefficients et les courbes fixes. Elle rejette le soupçon de matrice/couleur partagée comme défaut actuel, corrige l'idée qu'il faudrait une nouvelle lecture de configuration (déjà présente dans le runtime) et précise que les extrema retournés sont des échantillons affichés. Qwen a omis la coupure et la transformation de hauteur; Codex les a analysées et vérifiées indépendamment. La section « lesson » de sa réponse était une liste de préparation, pas une leçon utilisable; le parcours ci-dessus a été rédigé par Codex.

C'est une contribution de relecture supervisée avec résultat partiellement retenu. Aucun outil de dépôt n'a été exécuté par Qwen, et un essai ne démontre pas encore un gain net de vitesse ni une autonomie de livraison.

Requête, source exacte, réponse brute et reçu sont conservés sur ce poste dans `C:\Users\Yanik\.codex\visualizations\2026\09\13\01a09bca-9310-7013-b443-b6b546d8b1f5\llmx-math-review`. Vérifications indépendantes réalisées : échelle/coupure/décalage, répétition des rangées en `z`, réutilisation du mesh après changement de coefficient et destruction des ressources. La suite existante de cette base a aussi passé : **303 réussites, 1 ignoré, 0 échec**. Aucun essai WebGL ni acoustique lancé pour cet ajout de plan.

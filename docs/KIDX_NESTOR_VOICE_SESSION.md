# KidX — Nestor vocal : exploration, architecture et implémentation

Date : 2026-09-11. Document de mission pour une nouvelle session de travail.

Statut : périmètre convenu avec Yanik, repérage du code effectué, intégration vocale
KidX à réaliser. Les observations ci-dessous concernent les sources locales ; elles
ne constituent pas une preuve de déploiement ou de fonctionnement sur ugKid.

## 1. Instruction à la session qui reçoit ce document

Explore l'existant, choisis et documente une architecture simple, puis implémente
l'aide vocale Nestor dans l'atelier LEGO de GraphysX-Web. Poursuis jusqu'aux tests,
à la documentation et à une expérience intégrée vérifiable. Une analyse ou une
maquette seule ne remplit pas cette mission.

L'expérience cible est la suivante : un enfant construit ou programme dans KidX,
dit **« Eille Nestor ! »**, pose une question, reçoit une réponse parlée liée à ce
qu'il regarde, et peut demander à Nestor de montrer ou de manipuler les supports
visuels existants. Il poursuit la conversation sans répéter l'appel à chaque phrase.

Réponds en français. Écris le code, les identifiants et les commits en anglais.
Commence par un état des lieux court, puis avance sans redemander les décisions
déjà prises ici. Les questions réellement nécessaires portent sur le matériel
inconnu, les ambiguïtés qui changent l'architecture et les opérations du homelab
qui ne sont pas encore autorisées. Continue les travaux indépendants de ces réponses.

Le mandat porte sur l'aide vocale. La caméra et l'analyse d'images constituent une
phase ultérieure. Ne les ajoute pas au chemin critique.

## 2. Décisions produit déjà prises

- **La voix vient en premier.** Construire une boucle complète d'aide, pas seulement
  un microphone ou de la lecture à voix haute.
- **Un seul Nestor**, avec la persona KidX canonique résolue par l'intégration
  familiale existante. Ne pas écrire une nouvelle copie de sa personnalité.
- **ugKid est le poste enfant cible**, un PC Linux Mint avec écran tactile. Le
  navigateur, le microphone et les haut-parleurs de ce poste forment l'expérience
  à qualifier. Le modèle peut être exécuté sur un autre hôte du LAN.
- **« Eille Nestor ! » appartient à la cible V1.** Un bouton « Parler à Nestor »
  sert de chemin accessible et de secours. Une livraison au bouton seulement est
  un jalon intermédiaire, pas une preuve que le réveil vocal est terminé.
- **Nestor partage le contexte réel de KidX** : écran, modèle, étape, notice,
  programme, mission et résultat de tentative quand ces données existent.
- **La parole accompagne des actions visibles** : montrer une pièce, tourner une
  vue, rejouer une démonstration, ouvrir une notice ou donner un indice pertinent.
- **Aide pédagogique courte** : une explication ou un indice à la fois, vocabulaire
  adapté sans infantiliser, place laissée à l'essai et à la découverte.
- **Local-first, LAN uniquement** pour l'intégration familiale. Aucune dépendance
  cloud/payante nouvelle n'est présumée nécessaire.
- La RTX 3080 Ti d'UGFrank **pourrait être dédiée aux images en phase 2**. Ce n'est
  ni une instruction de réaffectation maintenant, ni une condition de la V1 vocale.

Les âges des enfants, le microphone précis et la sortie audio d'ugKid restent à
confirmer. Ne pas inventer ces informations. Prévoir une adaptation simple du
langage sans imposer la création de comptes ou la reconnaissance des personnes.

## 3. Sources et état initial à revalider

### Dépôts de travail

| Dépôt | Racine canonique Windows | HEAD observé lors de la rédaction |
| --- | --- | --- |
| GraphysX-Web | `C:/Users/Yanik/codes/GraphysX-Web` | `eaea359` |
| AIOps | `C:/Users/Yanik/codes/aiOPs` | `741aa2b5` |
| AgentX Product | `C:/Users/Yanik/codes/AgentX-Ecosystem` | `4144b5d` |
| VoiX | `C:/Users/Yanik/codes/VoiX` | `632bbd8` |

Ces références sont des repères datés, pas des versions à rétablir. Relire les HEAD,
les modifications locales, les instructions applicables et les travaux concurrents
avant de modifier un dépôt. Utiliser le checkout AIOps canonique, pas son miroir OneDrive.

### Ordre de lecture

1. Dans GraphysX-Web : `CLAUDE.md`, `HANDOFF.md`, `PRODUCT_SPEC.md`, puis
   `docs/KIDX_WORKSHOP.md`, `docs/KIDX_NEXT.md` et `docs/LINUX_MINT_TOUCH.md`.
2. Dans AIOps : instructions applicables, `LEAD.md`, `RUNTIME.md` et
   `docs/SERVICE_CONTRACTS.md`. Les deux derniers font autorité sur les frontières
   de services. Examiner les tâches actives avant toute modification opérationnelle.
3. Dans AgentX-Ecosystem si une modification Product s'avère nécessaire :
   `AGENTS.md`, `README.md`, `docs/ARCHITECTURE.md` et `docs/TESTING.md`.
4. Dans VoiX : instructions applicables, `README.md`, `docs/shared-personas.md`,
   `docs/voix-v2-streaming-architecture.md` et les tests concernés.

Les audits anciens expliquent les décisions ; ils ne remplacent pas ces sources.
En particulier, `aiOPs/docs/ai-ops/kidx-nestor-architecture-review.md` est un audit
historique explicitement remplacé par `RUNTIME.md`. Il décrit aussi un ancien KidX :
ne pas confondre cette application avec l'atelier actuel de GraphysX-Web.

### Ce que le code actuel apporte déjà

| Surface | Observation locale | Conséquence pour cette mission |
| --- | --- | --- |
| Atelier KidX | Onze missions, notices PDF, constructions TRACK3R/SPIK3R, démonstrations et progression locale | Réutiliser ces supports et leurs états |
| Construction | Pièces animées, sélection, dessous, rotation, séparation, pause et ralenti | Brancher les intentions vocales sur les actions existantes |
| Nestor local | Analyse déterministe de demandes françaises dans `kidx-build-actions.ts` | Déjà utile, mais ne prouve pas une conversation avec un LLM |
| Guide de mission | Guide contextuel, surlignage de vrais boutons, tentatives et verdicts | En faire une source de contexte et d'indices fiables |
| Programmation | Programme simple de six blocs maximum, cinq types ; Laboratoire + avec langage plus riche | Décrire le mode réellement ouvert ; conserver les limites existantes |
| PDF | Identifiant, page, chargement et zoom exposés par le lecteur | Connaître la page ouverte ne signifie pas comprendre ses illustrations |
| Coopération | Rôles locaux et salles partagées révisées, état des salles en mémoire | Associer l'aide au bon écran et éviter de doubler une action sur deux postes |
| Household `/voice` | Capture dans le navigateur, STT/TTS privés, réponse et retour à l'écoute | Réutilisation à étudier ; la boucle KidX reste à intégrer |
| VoiX | Runtime natif documenté Windows/CUDA, voies Family/Dad, streaming et interruption selon la sortie | Ne pas présumer une installation native Linux déjà fonctionnelle |
| Session Family | Le README VoiX décrit la persona `kidx_nestor` et le scope `family` du consommateur Household | Vérifier cette résolution puis la réutiliser, sans créer un agent Nestor supplémentaire |
| Réveil VoiX | `app/wake.py` filtre un préfixe après transcription locale, avec fenêtre de suivi | Ce n'est pas un détecteur acoustique pré-STT installé sur ugKid |
| Interruption navigateur | Le contrat Household annonce `acousticInterruption: false` | La présence d'une interruption native ne prouve pas celle du poste enfant |

Les nombres et comportements doivent être vérifiés au début de la session. Certaines
pages de documentation peuvent être en retard sur les sources récentes.

### Carte de code pour démarrer

Chemins relatifs à la racine du dépôt indiqué ; vérifier leur existence avant usage.

| Dépôt | Fichiers à examiner | Rôle |
| --- | --- | --- |
| GraphysX-Web | `src/kidx-app.ts`, `src/kidx-app.css` | Navigation, cycle de vie et projection de l'état |
| GraphysX-Web | `src/kidx-build-actions.ts`, `src/kidx-build-playback.ts`, `src/kidx-builds.ts` | Demandes locales et démonstration d'assemblage |
| GraphysX-Web | `src/kidx-mission-guide.ts`, `src/ev3-mission-strip.ts`, `src/kidx-missions.ts` | Aide, tentatives, actions et objectifs |
| GraphysX-Web | `src/kidx-code.ts`, `src/kidx-code-lab.ts`, `src/ev3-program-library.ts` | Langages, exécution et programmes sauvegardés |
| GraphysX-Web | `src/kidx-pdf-reader.ts`, `src/kidx-library.ts`, `src/kidx-document-catalog.json` | Sources documentaires et lecture |
| GraphysX-Web | `src/kidx-team.ts`, `src/kidx-journey.ts`, `scripts/serve-kidx.mjs` | Coopération, progression et service local |
| AIOps | `adapters/household/voice-contract.js`, `adapters/household/index.js` | Contrats disponibles, routes et intégration privée |
| AIOps | `adapters/household/public/browser-conversation.js`, `conversation-page.js`, `voice-capture-worklet.js` | Les deux derniers fichiers sont dans le même dossier `public/` ; boucle navigateur et audio |
| AIOps | `adapters/household/persona-catalog.js`, `persona-spec.js`, `family.js`, `family-routes.js` | Fichiers du même dossier Household ; persona et contexte familial |
| AgentX Product | `core/src/services/personaCatalog.js`, `core/routes/nestor-consumer-v1.js`, `core/src/services/nestorConsumerContract.js` | Catalogue et contrat consommateur génériques |
| VoiX | `app/wake.py`, `app/config.py`, `app/engine/session.py`, `app/brain/nestor.py` | Réveil, orchestration audio et consommateur Nestor |
| VoiX | `scripts/family-voice-guided-session.py`, `family-voice-observer.py`, `family-voice-qualification.py` | Scripts du même dossier ; réutilisation des observations physiques à évaluer |

## 4. Résultat attendu pour les enfants

### Scénario de référence : construire avec de l'aide

1. L'enfant ouvre TRACK3R dans KidX et active l'aide vocale une fois si le navigateur
   requiert ce geste pour le micro ou la lecture audio.
2. Le poste indique clairement qu'il attend l'appel « Eille Nestor ».
3. L'enfant dit : « Eille Nestor, je comprends pas cette étape. »
4. Nestor utilise l'étape réellement ouverte, donne une explication courte et montre
   le support pertinent. Une étape seulement connue par sa géométrie ne doit pas
   devenir une instruction inventée sur l'insertion d'un connecteur.
5. L'enfant poursuit : « Montre le moteur », puis « tourne », sans nouvel appel.
6. L'affichage change par les commandes existantes et Nestor décrit le résultat réel.
7. « Répète » reformule ou rejoue la réponse sans répéter une mutation déjà exécutée.
8. « Attends » coupe la parole ; le comportement de l'écoute est visible et cohérent.
9. L'enfant construit. Nestor laisse le silence, puis revient en attente selon la
   règle de fin de conversation choisie.
10. L'enfant demande l'étape suivante. La progression existante est conservée et
    reste accessible au rechargement sur la même origine.

### Scénario de référence : comprendre un programme

1. L'enfant prépare une mission et fait une vraie tentative dans le simulateur.
2. « Eille Nestor, pourquoi ça marche pas ? »
3. Nestor lit les blocs, le mode, l'objectif et le verdict de cette tentative. Il ne
   confond pas une frame d'initialisation avec une tentative de l'enfant.
4. Il donne un indice ou propose un seul changement, puis laisse l'enfant essayer.
5. Sur demande explicite, il peut appliquer une modification bornée au programme
   ou lancer la simulation par les mêmes commandes que les contrôles visuels.
6. Il commente le nouveau résultat reçu de KidX. Aucune réussite n'est déduite de
   sa propre réponse ou de la seule présence d'un programme suggéré.

### Comportements de conversation

- Français naturel ; reconnaître les variantes plausibles de l'appel sans élargir
  arbitrairement le déclenchement à toutes les conversations de la pièce.
- Réponses courtes par défaut, développées à la demande. « Pourquoi ? », « autrement »,
  « plus doucement », « un indice » et « montre-moi » prolongent l'échange.
- Une incompréhension produit une clarification courte, sans action hasardeuse.
- Une question générale LEGO peut recevoir une réponse pédagogique. Une instruction
  d'assemblage précise doit s'appuyer sur une référence identifiable.
- L'écran et la voix disent la même chose. Le texte reste disponible si l'audio échoue.
- L'aide accompagne l'enfant et laisse du temps pour manipuler les pièces.

## 5. Exploration attendue avant le choix d'architecture

Faire un inventaire court : **présent et vérifié dans le code / réutilisable avec
adaptation / absent / à qualifier physiquement**. Utiliser deux recherches avant
de déclarer une capacité absente. Relever les contrats qui sont seulement des cibles
dans les fichiers, et ceux qui possèdent une route et un appelant exécutables.

Résoudre au minimum ces questions :

1. Quel parcours Household résout réellement la persona KidX et le contexte Family ?
   Quel contrat accepte le contexte de l'atelier sans activer les capacités privées ?
2. Peut-on réutiliser la boucle navigateur existante par une interface étroite, sans
   la recopier ni obliger GraphysX à embarquer les écrans Household ?
3. Qui capture le microphone d'ugKid et qui joue la réponse sur **ugKid** ? Un appel
   à une session native Windows ne doit pas écouter ou parler sur le mauvais poste.
4. Où se déroule la détection d'appel ? Quelles données quittent ugKid avant cet
   appel, même si elles restent sur le LAN ? Quelle charge génère cette solution ?
5. Comment interrompre une réponse avec les haut-parleurs ouverts sans que Nestor
   réponde à sa propre voix ? Quelles primitives existent réellement sur ce parcours ?
6. Comment récupérer un contexte structuré des écrans construction, mission,
   laboratoire et lecteur, puis le rafraîchir après une action ?
7. Quelle connaissance permet d'expliquer l'étape ? Identifier ce qui vient du guide
   local, du PDF interprété, d'une référence validée ou d'une connaissance générale.
8. Quelle origine locale sert KidX, et comment atteint-elle les services privés ?
   Vérifier contexte sécurisé, permissions micro, lecture audio et transport réel.
9. Qu'arrive-t-il si l'enfant change d'écran, de modèle ou de programme pendant que
   le STT, le modèle ou la synthèse travaille ?
10. Comment le contexte d'une salle à deux écrans reste-t-il cohérent sans attribuer
    les paroles ou les actions au mauvais participant ?

Le relevé matériel d'ugKid doit inclure les périphériques audio, le navigateur et
l'origine effective. Les anciennes mesures tactiles ne prouvent pas la qualité audio.

## 6. Architecture à choisir et à documenter

### Frontières à conserver

| Composant | Responsabilité visée |
| --- | --- |
| GraphysX / KidX | État de l'atelier, contrôles visibles, actions de scène, programmes et progression |
| AgentX Product | Capacités réutilisables d'inférence, routage et contrats génériques de persona/outils |
| AIOps / Household | Composition privée, politique familiale, liaison KidX et services du LAN |
| VoiX | Capacités de parole et contrats audio réutilisés ; localisation de la capture/lecture explicitée |
| ugKid | Entrée et sortie physiques de l'enfant, interface tactile et état du micro |

Conserver un seul propriétaire de session, un seul chemin d'action et un seul
propriétaire de chaque progression. Utiliser les API existantes pour traverser les
frontières ; aucun accès direct aux collections d'un autre service.

### Options à comparer brièvement

| Option | Intérêt | Point à prouver |
| --- | --- | --- |
| KidX dans le navigateur + services STT/TTS existants du LAN | Proche du parcours Household et de la cible actuelle | Réveil, interruption, contexte sécurisé et lecture sur le bon poste |
| Navigateur + petit satellite audio sur ugKid | Peut donner un contrôle local plus durable sur l'audio | Nécessité démontrée, support Linux, installation et cycle de vie simples |

Choisir le navigateur en premier si les exigences physiques peuvent être satisfaites.
Ajouter un satellite seulement si un blocage mesuré le justifie. Ne pas développer
deux architectures complètes ni porter tout VoiX sous Linux par défaut.

La détection acoustique personnalisée et le filtrage après STT sont deux techniques
différentes. Comparer leur coût, leur disponibilité et leurs erreurs. Vérifier les
sources officielles des bibliothèques envisagées, notamment pour le français. Un
modèle de réveil générique n'est pas une qualification du mot d'appel de la famille.

Le document d'architecture issu de la session doit fixer : flux audio aller/retour,
propriétaire de session, origine de déploiement local, liaison de contexte, dispatch
d'actions, annulation, reprise et comportement en cas de service indisponible.
Quelques décisions expliquées et un diagramme suffisent ; aucun nouveau framework
d'orchestration, système de plugins ou package partagé n'est requis par principe.

### Contexte de tour : contrat à adapter à l'existant

Ce schéma est indicatif, pas une nouvelle API imposée :

```ts
type KidxVoiceContext = {
  schemaVersion: 1;
  sessionId: string;
  contextRevision: number;
  capturedAt: string;
  locale: "fr-CA";
  screen: string;
  build?: { modelId: string; stage: number; selectedPartId?: string };
  document?: { documentId: string; page: number; loaded: boolean };
  mission?: { missionId: string; attemptId?: string; verdict?: string };
  program?: { mode: "simple" | "laboratory"; revision: number; blocks: unknown[] };
  availableActions: string[];
  knowledgeRefs: Array<{ sourceId: string; locator: string; status: string }>;
};
```

Conserver les types de blocs et schémas existants au lieu de reprendre `unknown[]`
dans l'implémentation finale. Définir les unités, bornes et conventions d'indexation :
dans le code actuel, le parseur convertit une étape prononcée en index à partir de
zéro, tandis que l'état public d'une construction expose une étape à partir de un.

Le contexte est une projection des autorités existantes, pas une seconde base de
données. Envoyer les données utiles au tour, avec des limites explicites de taille.
Marquer une donnée indisponible comme telle ; ne pas envoyer une ancienne valeur
comme si elle décrivait le nouvel écran.

### Actions vocales

Réutiliser les actions de KidX et la même API de scène. Une petite façade typée peut
être ajoutée si les handlers sont encore enfermés dans des closures d'interface.
Les contrôles tactiles, les commandes locales et les actions issues du modèle doivent
appeler cette même façade. Aucune chaîne JavaScript ou commande shell générée n'est exécutée.

Les capacités d'interface de KidX doivent être autorisées explicitement par leur
contrat applicatif. Si la voie Family existante désactive les outils généraux, ne
pas lever cette limite globalement pour permettre « montre le moteur » : intégrer
les seules actions KidX prévues, sans ouvrir les outils personnels ou d'exploitation.

| Famille | Exemples | Règle de résultat |
| --- | --- | --- |
| Parole | Répéter, ralentir la voix, interrompre | Ne rejoue pas les mutations du tour précédent |
| Vue | Tourner, dessous, zoom, vue éclatée | Décrit une modification réellement appliquée |
| Construction | Montrer une pièce, rejouer, ralentir l'animation, étape suivante | Vérifie modèle, étape et disponibilité de la pièce |
| Notice | Ouvrir, page suivante/précédente, page indiquée | Vérifie document chargé et bornes ; ne déduit pas la page depuis l'étape 3D |
| Mission | Expliquer l'objectif, donner un indice, montrer le bouton utile | S'appuie sur le guide et la vraie tentative |
| Programme | Expliquer, modifier sur demande, lancer/arrêter la simulation | Respecte le langage, les limites et les protections de sauvegarde existants |

Définir le sens des commandes ambiguës. « Tourne » dans la construction concerne la
vue ; ne pas le transformer en mouvement du robot. « Plus doucement » peut viser
la voix ou l'animation : utiliser le contexte et clarifier si nécessaire. Tester
les négations et les phrases contenant un mot de commande sans donner cet ordre.

Associer chaque action à un identifiant et à la révision de contexte pertinente.
Un résultat tardif, dupliqué ou lié à un écran quitté ne doit pas modifier le nouveau
travail. Après exécution, renvoyer le résultat au dialogue avant de dire « c'est fait ».

## 7. Voix, réveil et cycle de vie

Présenter des états compréhensibles : désactivé, en attente de l'appel, à l'écoute,
réflexion, réponse, pause et indisponible. Les états internes peuvent reprendre le
vocabulaire du runtime existant. Aucun écran de choix de modèle n'est nécessaire
dans le parcours enfant.

Exigences :

- Activation initiale explicite si requise par le navigateur ; aucun démarrage
  invisible du micro à la simple arrivée sur la page.
- Signal bref lors de l'appel reconnu, puis fenêtre de conversation renouvelée
  par les vrais tours. Sa durée est configurable et validée à l'usage.
- Audio de la réponse joué sur ugKid. Éviter toute lecture simultanée sur Windows.
- Bouton toujours accessible pour parler, interrompre et couper le micro.
- « Attends » / « arrête de parler » doivent interrompre la réponse sur le parcours
  cible. Si seule l'interruption tactile fonctionne, documenter le jalon partiel.
- Distinguer pause de la conversation et arrêt du simulateur ; une interruption
  de parole ne lance jamais une action matérielle.
- Fin de session, navigation hors KidX, perte de périphérique, annulation et réponses
  tardives libèrent correctement les ressources et empêchent toute reprise fantôme.
- Choisir explicitement le comportement lors d'un onglet masqué. Le navigateur
  Household actuel se met en pause ; ne pas annoncer une écoute de fond durable
  sans la réaliser et la tester sur ugKid.
- Refus de permission, silence, transcription vide ou erreur de service produisent
  un état utile. KidX reste utilisable avec ses contrôles et guides locaux.

Pour l'écho, tester avec les vrais haut-parleurs : Nestor ne doit pas se répondre
à lui-même. Une primitive d'annulation logicielle, un casque et un son injecté dans
un navigateur sont trois preuves différentes de la conversation dans une pièce.

## 8. Connaissances LEGO et continuité

Séparer explicitement :

1. **Faits observés dans KidX** : écran, étape, blocs, capteurs simulés et verdicts.
2. **Références documentaires** : notice, page, contenu effectivement interprété et
   correspondances validées.
3. **Explications générales** : moteurs, engrenages, sens de rotation et logique.
4. **Construction physique** : uniquement ce que l'enfant rapporte en V1.

Une géométrie LDraw ne prouve pas le chemin mécanique d'insertion. Une animation
d'approche n'est pas une validation des connecteurs. Une page PDF peut contenir
surtout des dessins ; extraire son texte seul ne suffit pas à l'expliquer.

Pour le premier montage, valider un petit ensemble d'explications utiles et leur
ancrage aux supports existants. Ne pas faire dépendre l'intégration vocale de
l'interprétation exhaustive des 138 notices. Pour les étapes non couvertes, Nestor
montre la référence disponible et exprime précisément ce qui lui manque.

Réutiliser les sauvegardes existantes. « On continue ? » s'appuie sur la progression
retrouvée, pas sur une mémoire inventée. Une persistance par navigateur ne doit pas
être présentée comme une synchronisation entre appareils. Une conversation peut
garder un résumé borné de son objectif, des essais et de la prochaine question,
sans recopier le modèle de stockage de l'atelier.

Le contexte Family existant peut contenir des faits approuvés : vérifier ce qui
est réellement disponible et approprié. La mémoire personnelle de Papa, les
opérations d'infrastructure et les voies privées restent hors du parcours KidX.
Le mot d'appel ne sélectionne ni une identité, ni des droits, ni une voie privée.

## 9. Installation locale et données

GraphysX-Web possède aussi un site public. L'intégration familiale de cette mission
reste locale : choisir une origine durable et un transport adaptés à ugKid sans
exposer les services du homelab. Préserver les usages autonomes de GraphysX quand
aucun backend vocal n'est configuré.

Réutiliser les protections et contrats de transport existants. Ne pas ajouter une
nouvelle plateforme d'authentification, des restrictions générales dans Product ou
des secrets embarqués dans le JavaScript. Un endpoint privé ne doit pas devenir
une dépendance obligatoire de la distribution publique.

Documenter exactement le parcours de l'audio : capture, éventuelle transmission sur
le LAN avant l'appel, STT, synthèse, lecture et destruction. Si un filtrage après STT
est choisi, expliquer que la parole ambiante est traitée avant de reconnaître l'appel.
Ne pas promettre « rien ne quitte le poste avant Eille Nestor » si ce n'est pas vrai.

Préserver le traitement éphémère de l'audio et les politiques familiales existantes.
Examiner aussi le journal texte réellement écrit : absence de WAV ne signifie pas
absence de transcription conservée. Aucun enregistrement d'enfant, jeu d'entraînement
vocal ou ingestion RAG automatique n'est demandé. Les preuves techniques doivent
éviter de publier le contenu des échanges familiaux.

## 10. Séquence d'implémentation

### A — Explorer et choisir

- Relever l'état des dépôts et l'autorité de chaque capacité.
- Examiner le parcours Family, le contrat vocal, le code KidX et la cible ugKid.
- Écrire les décisions d'architecture et une liste courte des changements par dépôt.
- Relever les inconnues matérielles. Continuer le code local lorsqu'elles n'empêchent
  pas la prochaine étape.

### B — Réaliser une première boucle complète au bouton

- Ouvrir une session KidX avec la persona canonique.
- Capter une question sur le poste enfant, transmettre le contexte utile, recevoir
  et jouer une réponse sur ce même poste, puis revenir à l'écoute.
- Relier une action concrète existante : montrer une pièce ou tourner le montage.
- Ajouter annulation, erreurs utiles et invalidation d'un contexte quitté dès ce jalon.
- Vérifier le parcours rendu dans un navigateur. Les doubles de test doivent être
  clairement identifiés ; ils ne prouvent pas que VoiX ou l'inférence ont répondu.

### C — Compléter le réveil et la conversation

- Intégrer « Eille Nestor », la fenêtre de suivi et le retour en attente.
- Implémenter ou adapter l'interruption parlée et le traitement de l'écho pour la
  topologie choisie, avec arrêt tactile immédiat toujours disponible.
- Vérifier silence, parole non adressée, lecture de Nestor et changements de périphérique.
- Réaliser les essais sur ugKid dès que l'accès et les conditions physiques sont disponibles.

### D — Étendre l'aide aux parcours de l'atelier

- Brancher la façade d'actions de construction et de lecture.
- Relier le guide de mission, les tentatives et les programmes simples/avancés.
- Ajouter les formulations de répétition, d'indice et d'explication alternative.
- Vérifier les sauvegardes et la cohérence lorsqu'un second écran participe.
- Éviter toute refonte sans rapport du moteur, du laboratoire ou du système de persona.

### E — Valider et livrer

- Passer les tests concernés, puis les vérifications requises des dépôts modifiés.
- Inspecter les captures rendues et réaliser la matrice physique ci-dessous.
- Mettre à jour les contrats, le guide d'utilisation et le handoff.
- Livrer les commits et preuves, avec état distinct du code, de la CI, de la version
  servie et de l'acceptation physique. Préparer la promotion sans la présumer autorisée.

## 11. Tests et critères d'acceptation

### Tests automatisés utiles

| Domaine | Cas à couvrir |
| --- | --- |
| Contexte | Construction, PDF, mission, laboratoire ; données absentes ; changement de contexte pendant un tour |
| Commandes | Bornes d'étape/page, pièce inconnue, ambiguïtés, négations, action indisponible |
| Exécution | Même effet par le bouton et la voix ; résultat reçu avant confirmation parlée |
| Annulation | Tour annulé à STT, inférence, TTS et lecture ; aucune action ou parole tardive |
| Répétition | Répéter une réponse ne relance ni simulation ni changement d'étape |
| Conversation | Appel, suivi, expiration, sommeil/pause, reprise explicite |
| Audio | Silence et transcription vide ; permission refusée ; sortie indisponible ; absence de double lecture |
| Isolation | Persona KidX stable ; aucun passage vers mémoire personnelle ou opérations de Papa |
| Progression | Rechargement, stockage indisponible, brouillon conservé et action sur révision devenue ancienne |
| Deux écrans | Auteur/écran identifiés ; événement reçu une fois ; aucune double capture par défaut |
| Régressions | Guides locaux, missions, lecteur, programmes et contrôles tactiles restent utilisables sans voix |

Adapter ces cas aux tests existants plutôt que créer une suite qui recopie simplement
l'implémentation. Ne jamais affaiblir une assertion ou allonger un délai pour masquer un défaut.

### Commandes de vérification

Dans GraphysX-Web, le runner présent est **Node `--test`**, même si d'autres dépôts
utilisent Jest. Ne pas convertir son infrastructure de test pour cette mission.

```powershell
npm test
npm run typecheck
npm run lint
```

Les smokes concernés existent dans `package.json` : `smoke:kidx-guidance`,
`smoke:kidx-workshop`, `smoke:kidx-interactive`, `smoke:kidx-missions`,
`smoke:kidx-challenges` et `smoke:ev3-lab`. Choisir ceux touchés par chaque incrément,
puis intégrer la nouvelle couverture vocale au mécanisme de vérification existant.

Exécuter une seule validation complète finale lorsque le changement fonctionnel est
prêt :

```powershell
npm run verify -- --wait
```

Respecter le verrou global décrit dans `CLAUDE.md`. Aucun build parallèle dans
`dist/` pendant une validation. Conserver les logs entiers ; ne pas masquer le code
de sortie derrière un pipeline `head`/`tail`. Itérer avec des tests ciblés.

Pour Household, consulter ses scripts et tests actuels. Pour Product, suivre
`docs/TESTING.md`, les préparations requises et les suites Jest concernées. Pour
VoiX, employer l'environnement Python et les tests prescrits par sa documentation,
notamment réveil, session, Family et transcription. Ne pas exécuter des tests contre
le Mongo de production pour remplacer un environnement de test.

### Parcours rendus

Vérifier le poste cible et les formats pertinents : bureau, 800 × 480 et portrait
390 × 844 ; inclure 320 px si les contrôles vocaux modifient cette largeur supportée.
Ouvrir les panneaux, vérifier les contrôles accessibles, le focus, le défilement,
l'état du micro et les erreurs. Inspecter les captures, pas seulement les assertions DOM.

### Matrice physique sur ugKid

| Essai | Résultat attendu / mesure |
| --- | --- |
| Activation | Le vrai micro enfant est utilisé et son état est compréhensible |
| Dix appels adressés en ambiance calme | Compter les appels reconnus/manqués et les corrections nécessaires |
| Dix appels avec bruit réaliste de LEGO | Mesurer la dégradation et la distance au micro |
| Parole ambiante non adressée | Compter les faux départs sur une durée documentée |
| Réponse sur haut-parleurs | Réponse audible sur ugKid, pas d'auto-réponse ni de double sortie |
| Interruption parlée | Tester pendant plusieurs portions de réponse ; mesurer le délai d'arrêt réel |
| Conversation de trois tours | Un seul appel initial, contexte conservé et réponses utiles |
| Changement d'étape pendant l'attente | Pas d'action ni d'explication périmée appliquée au nouvel écran |
| Micro coupé / page quittée | Capture et lecture arrêtées, aucune reprise spontanée |
| Backend indisponible | Message utile, fin de l'attente et atelier toujours utilisable |
| Reprise du montage | Progression retrouvée sur la même origine et correctement annoncée |
| Aide réelle | L'enfant peut continuer une étape ou améliorer un essai grâce à l'aide |

Ces volumes sont un protocole initial proposé, pas des taux de réussite déjà obtenus.
Un adulte peut préparer les essais ; la qualification pour enfants nécessite aussi
une vraie utilisation adaptée aux enfants avec Yanik. Conserver les résultats agrégés
sans constituer par défaut une collection de voix d'enfants.

Mesurer séparément démarrage à froid et tours chauds : fin de parole vers premier
son réellement audible, STT, attente/inférence, TTS, action visible et annulation.
Les événements `first_token` ou `tts_first_chunk` ne mesurent pas l'arrivée du son
à l'oreille. Présenter médiane, valeurs lentes, nombre d'essais et conditions.
Fixer un objectif de latence réaliste après le premier essai de référence ; ne pas
présenter un chiffre commercial ou un ancien test d'une autre topologie comme acquis.

## 12. Autorisations et conduite du travail

- La session qui reçoit ce mandat doit avancer sur l'exploration, l'architecture,
  l'implémentation locale, les tests locaux et la documentation nécessaires.
- Yanik a explicitement demandé : **« Si une commande a besoin du homelab en ligne
  (GPU, Mongo, Ollama), demande avant plutôt que de simuler un résultat. »** Appliquer
  cette règle aux vérifications distantes nécessaires, sauf si cette autorisation
  est déjà fournie dans la session. Regrouper la demande autour d'un essai concret.
- L'absence d'accès physique ne bloque pas l'écriture et les tests locaux. Elle
  empêche de déclarer la qualification matérielle terminée.
- Respecter les tâches et mutex actifs, les modifications concurrentes et les
  worktrees occupés. Ne pas réinitialiser ou nettoyer le travail d'une autre session.
- Stage explicite par fichier ; un changement cohérent par commit, message anglais.
  Si plusieurs dépôts changent, documenter leurs dépendances et l'ordre d'intégration.
- Ne pas fusionner ou publier automatiquement. GraphysX-Web déploie sur un push à
  `main` : préparer des commits et une livraison révisable sans déclencher cette action
  par inadvertance. Une autorisation donnée ultérieurement reste valable dans son périmètre.
- Aucune modification des Modelfiles `ax/`, de leurs `num_ctx`, des pins résidents ou
  de l'affectation des GPU n'est implicitement demandée par cette mission.
- Ne pas ajouter de nouvelle barrière administrative : utiliser les règles et
  mécanismes existants, avec les permissions déjà accordées.

## 13. Livrables de la session d'implémentation

1. **Exploration concise** : capacités réellement réutilisées, manques et inconnues.
2. **Architecture retenue** : diagramme, responsabilités, contrats, choix du réveil
   et raison d'un éventuel satellite Linux.
3. **Code intégré** : voix, contexte, actions visuelles, annulation et états utiles.
4. **Tests et preuves** : suites, logs, captures et résultats physiques avec versions.
5. **Guide d'utilisation ugKid** : activation, appel, commandes, pause, coupure du
   micro, reprise et diagnostic simple des erreurs.
6. **Guide opérateur court** : services nécessaires, origine locale, configuration,
   démarrage/arrêt, emplacement des logs et retour à l'état précédent.
7. **Handoff à jour** : différences entre source, CI, déploiement local/public et
   acceptation physique, avec la prochaine action exacte pour toute partie restante.

Tenir `HANDOFF.md` et `docs/KIDX_WORKSHOP.md` à jour ; ajouter l'historique utile dans
`progress.md`. Modifier les docs des autres dépôts seulement lorsque leurs contrats
ou leur exploitation changent. Ne pas recopier ce document comme une nouvelle
architecture permanente sans le réécrire autour de l'implémentation finale.

## 14. Définition de terminé

- [ ] L'enfant peut appeler Nestor sur ugKid et poursuivre plusieurs tours.
- [ ] Nestor utilise la persona KidX canonique et le contexte actuel de l'atelier.
- [ ] Ses réponses parlées et ses actions visuelles restent cohérentes.
- [ ] Les commandes utiles de construction, notice et mission sont intégrées.
- [ ] Les indices de programmation reposent sur les blocs et résultats réellement observés.
- [ ] Répétition, interruption, pause, retour en attente et arrêt fonctionnent.
- [ ] Les erreurs et services indisponibles laissent KidX utilisable.
- [ ] Aucune réponse tardive ne modifie le travail suivant ou une session terminée.
- [ ] Les tests requis et les parcours visuels concernés passent.
- [ ] La matrice physique sur ugKid a été réalisée et les résultats sont consignés.
- [ ] Les limites des références LEGO et de l'observation sans caméra sont honnêtes.
- [ ] La documentation permet à Yanik de relancer et utiliser l'expérience.
- [ ] Commits, intégration et éventuel déploiement ont des états distincts et vérifiables.

Si une case essentielle reste ouverte, livrer ce qui est prêt avec un statut partiel
et une reprise concrète. Ne pas remplacer le réveil vocal demandé par le bouton dans
la définition finale de réussite, ni une conversation physique par un test synthétique.

## 15. Phase 2 conservée comme perspective

Une fois l'aide vocale utile et qualifiée : webcam vers le tapis, **« Regarde Nestor ! »**,
captures liées à l'étape et, ensuite, accompagnement visuel proactif discret. UGFrank
et sa RTX 3080 Ti pourront être évalués pour cette tâche, éventuellement en dédiant le GPU.

La V1 peut prévoir un contexte extensible et l'annulation des observations périmées.
Elle ne doit pas installer de webcam, télécharger de modèle vision, réserver de GPU,
créer un service de surveillance ou retarder l'aide vocale pour préparer cette phase.

## 16. Message court pour lancer la session

> Lis `C:/Users/Yanik/codes/GraphysX-Web/docs/KIDX_NESTOR_VOICE_SESSION.md` et prends-le
> comme mandat. Explore les sources actuelles de GraphysX-Web, AIOps, AgentX Product
> et VoiX ; documente une architecture simple puis implémente Nestor vocal dans KidX
> en réutilisant les capacités existantes. La cible est ugKid : « Eille Nestor »,
> conversation en français, contexte LEGO réel et actions visuelles utiles. Avance
> jusqu'aux tests et à la documentation, en séparant clairement les preuves locales,
> les essais physiques et le déploiement. La vision reste en phase 2. Respecte les
> autorisations homelab et les travaux concurrents ; ne t'arrête pas à un plan.

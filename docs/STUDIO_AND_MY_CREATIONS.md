# Studio simple et Mes créations

Depuis l’accueil, **Studio** ouvre les commandes essentielles. Les visites Maison,
CubZ, Impreza et FlightX transmettent leur document actuel au même éditeur.
Les variantes ADN et les créations guidées ouvrent aussi le Studio simple après sauvegarde.

1. Choisir un objet dans la vue 3D ou dans **Objets**.
2. Modifier son nom, sa position, sa rotation, sa taille ou sa couleur. Sur un modèle,
   choisir la pièce à colorer : les noms des maillages historiques restent affichés et les
   matières transparentes sont signalées. Les autres propriétés de la matière sont conservées.
3. Utiliser **Cadrer l’objet** pour le voir dans la partie libre de l’écran. Sur téléphone,
   le panneau se replie ; **Modifier** permet d’y revenir.
4. **Simuler**, **Mettre en pause**, **Un pas**, **Annuler** et **Rétablir** utilisent la
   simulation et l’historique existants.
   Une scène conservée retrouve sa pause précédente en quittant le Studio. Un accueil
   reconstruit après une autre scène repart en animation.
5. **Enregistrer** ou `Ctrl/Cmd+S` donne un nom à la scène. Le même nom met à jour la scène
   ouverte ; un nom différent conserve une copie. Un nom déjà pris ou une sauvegarde modifiée
   dans une autre fenêtre demande un autre nom.
6. Retrouver ses scènes dans **Mes créations**, depuis le Studio, l’accueil ou le catalogue
   des mondes. Rechercher, **Modifier dans le Studio**, **Créer une copie** ou **Exporter**.

## Où se trouve le travail

**Dans ce navigateur · sur cet appareil** signifie le stockage local de cette adresse web.
Il n’y a aucune synchronisation automatique entre appareils, navigateurs ou adresses.
Effacer les données du navigateur retire ces sauvegardes. **Exporter** produit un fichier
JSON transportable ; **Fichier → Importer un fichier** le rouvre dans le Studio.
Les liens `localScene` retrouvent un nom dans ce navigateur, pas un document partagé en ligne.

Les scènes nommées du Studio, de l’atelier ADN et de la création guidée utilisent
désormais **IndexedDB**. Plusieurs poses CubZ complètes peuvent y cohabiter sans remplir
le petit quota de `localStorage`. Les maillages natifs, objets masqués, panneaux et
propriétés du document v2 restent inclus ; aucune réduction ni reconstruction n’est faite
pour économiser de la place. La liste lit un catalogue léger, puis charge le document
complet seulement pour l’ouverture, la copie ou l’export.

**Enregistrée** apparaît après la fin de la transaction qui conserve ensemble le document
et son catalogue, avec l’indication de durabilité `strict`. Un succès intermédiaire d’écriture
ne suffit pas : une transaction annulée garde la version précédente et le travail ouvert.
Les modifications faites pendant une écriture restent signalées comme non enregistrées.
Ce protocole suit le [contrat de transaction IndexedDB](https://www.w3.org/TR/IndexedDB-3/#transaction-concept).
Le quota disque du navigateur existe toujours ; l’export reste la copie indépendante à garder.

Les anciens enregistrements du Studio, les variantes ADN et les créations guidées figurent
dans la même liste, sans déplacement ni suppression. Mettre à jour un ancien enregistrement
crée sa version actuelle dans IndexedDB et garde ses octets d’origine dans `localStorage`.
Si une ancienne fenêtre modifie ensuite cette source, **autre version** permet de la retrouver
et de l’exporter ou d’en créer une copie. Elle ne remplace pas la version actuelle.
Les noms déjà utilisés et les révisions périmées sont refusés dans la même transaction que
l’écriture ; deux fenêtres ne peuvent pas écraser leurs changements silencieusement.
Les raccourcis de reprise ADN et création guidée retrouvent la dernière version, y compris
les modifications faites dans le Studio.

**Brouillons** retrouve les deux générations d’autosauvegarde
du Studio. Reprendre un brouillon ouvre une copie de travail ; l’enregistrement nommé suit
la règle existante de consommation du brouillon récupéré, uniquement si ses données n’ont pas changé.
Une entrée illisible reste exportable. En cas de stockage bloqué ou plein, conserver la scène
ouverte et exporter un fichier ; un échec n’est pas présenté comme un enregistrement réussi.
Les brouillons gardent leur format synchrone actuel et son quota ; **Enregistrer** peut
conserver une grosse scène dans IndexedDB même si l’autosauvegarde n’a plus de place.
Un stockage historique bloqué n’empêche pas les nouvelles sauvegardes si IndexedDB est accessible.

L’API publique synchrone `api.save(name)` / `api.load(name)` garde son contrat historique
dans `localStorage`. L’interface utilise le dépôt asynchrone `scene-library.ts`, puis
`api.exportDocument()` / `api.load(definition)` sur la même World API. Les outils synchrones
ne deviennent pas implicitement asynchrones et ne constituent pas un accès aux nouveaux
enregistrements IndexedDB par leur nom. L’ouverture par **Mes créations**, les liens du Studio
et l’import JSON restent les points d’entrée de ces documents.

Si un serveur de scènes optionnel est disponible, la bibliothèque propose une destination
distincte pour son panneau existant. Elle ne déplace ni n’envoie les scènes locales.
Une scène serveur attachée doit être fermée explicitement avant d’ouvrir une scène locale.
Les sessions partagées conservent leur autorité : l’ouverture locale ne remplace pas leur monde.

## Mode complet et conservation

**Mode complet** retrouve les bibliothèques, matières avancées, comportements, ADN,
physique et outils de niveaux. **Mode simple** revient aux commandes essentielles.
Le choix effectué avec ces boutons est mémorisé ; un lien indiquant explicitement `studio`
garde sa destination. Les anciennes routes techniques `?host=editor` et `?host=standalone`
continuent d’ouvrir le mode complet ; `?host=editor&studio=simple` ouvre le mode simple.
Les liens de comparaison Maison/FlightX `view=source` gardent aussi le mode complet par défaut.

Les deux présentations utilisent `PlatformEditor`, le même gizmo et la même World API v2.
Les objets masqués et les couches d’archive restent dans le document complet sauvegardé,
même quand la liste simplifiée ne les montre pas. Les groupes vides et objets transitoires
ne surchargent pas cette liste. Aucun projet historique C++/C# ni asset source n’est réécrit.

## Vérification

Les contrats Node couvrent la découverte des anciens formats, les copies, le document
complet, les conflits et les erreurs de stockage. Les parcours navigateur enregistrés sont :

```powershell
npm run verify -- --wait --checks=studio-simple,my-creations,cubz-storage,scene-library-safety,cubz-studio-framing,dna-creation,first-creation,editor-drafts,top20
npm run verify -- --wait
```

`studio-simple` vérifie les actions réelles à 1440, 390, 320 et 844 px, le cadrage dégagé,
le passage au mode complet, l’import/export et les matières natives Maison.
Il garde aussi le mode complet des deux liens de comparaison source.
`studio-return` vérifie les vrais boutons de retour et l’horloge réelle, sans avance de temps simulée.
`my-creations` vérifie notamment le conflit entre onglets, le stockage plein/bloqué,
les brouillons, l’export de secours et une fermeture/réouverture réelle de Chromium
sur un profil temporaire propre au test. Les régressions avancées restent vérifiées après
un passage explicite par **Mode complet**.
`cubz-storage` sauvegarde huit variantes natives complètes dans un seul profil, conserve
deux anciennes poses et leurs brouillons/pointeurs, copie et met à jour des scènes, exporte
et réimporte le JSON exact, provoque une annulation après le succès d’une requête et une
erreur de quota, puis ferme réellement Chromium et rouvre chaque scène. Les cartes et
actions sont aussi vérifiées à 390 et 320 px.
`scene-library-safety` retarde de vraies ouvertures IndexedDB : une fenêtre fermée ou un
monde remplacé garde son autorité, les modifications pendant l’écriture restent à garder,
et une confirmation tardive ne renomme pas le monde suivant. Une ancienne fenêtre peut
retrouver, exporter, rouvrir et copier sa version sans remplacer la sauvegarde actuelle.
Deux fenêtres créant simultanément le même nom n’obtiennent qu’un seul enregistrement ;
l’autre garde son document. Le focus reste dans le dialogue pendant l’attente et après
un échec : Échap et Ctrl/Cmd+S ne traversent pas vers le Studio derrière.
Un remplacement externe du document retire immédiatement son ancien nom de sauvegarde,
même si le nouveau monde réutilise le même identifiant. Annuler/rétablir une modification
ordinaire conserve au contraire le fichier en cours.

Le gate et ses captures ne constituent pas une réception sur téléphone physique ou avec
lecteur d’écran. Les services privés et le matériel VR ont leur réception séparée.

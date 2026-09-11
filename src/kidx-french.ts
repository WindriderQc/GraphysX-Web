const COPY: Record<string, string> = {
  "Forward": "Avancer", "Fwd": "Avancer", "Left": "Gauche", "Right": "Droite", "Stop": "Stop",
  "Go": "Avancer", "Run": "Lancer", "Undo": "Retirer", "Drive": "Piloter", "Build": "Programmer",
  "Try again": "Réessayer", "Drive mode": "Pilotage libre", "Build mode": "Programmer", "Run program": "Lancer le programme",
  "Undo block": "Retirer le dernier bloc", "Your program": "Ton programme", "Tap blocks below to build": "Choisis tes blocs ci-dessous",
  "✕ Leave the lab": "← Atelier", "Your programs": "Tes programmes", "Programs": "Programmes", "Close": "Fermer",
  "Saved only in this browser. Open a program to build or run it again.": "Enregistrés dans ce navigateur. Ouvre un programme pour le modifier ou le relancer.",
  "Program name": "Nom du programme", "Save program": "Enregistrer", "Save a copy": "Enregistrer une copie",
  "Update saved program": "Mettre à jour", "Unsaved edits": "Modifié", "Saved": "Enregistré", "Not saved": "Non enregistré",
  "Save or open a program": "Enregistrer ou ouvrir un programme", "Saved programs": "Programmes enregistrés",
  "No saved programs yet.": "Aucun programme enregistré pour le moment.", "Delete": "Supprimer", "Delete?": "Supprimer ?",
  "Replace my blocks": "Remplacer mes blocs", "Keep my blocks": "Garder mes blocs", "Open program": "Ouvrir le programme",
  "Cancel": "Annuler", "Add some blocks first.": "Ajoute d’abord quelques blocs.",
  "Open anyway": "Remplacer mes blocs", "Keep current blocks": "Garder mes blocs",
  "That program was removed. Reopen the library to refresh the list.": "Ce programme a été supprimé. Rouvre la bibliothèque pour actualiser la liste.",
  "Your program is ready. Tap Run to test it.": "Ton programme est prêt. Appuie sur Lancer pour l’essayer.",
  "Three Forward blocks ready. Tap Run to test them.": "Trois blocs Avancer sont prêts. Appuie sur Lancer.",
  "Program cleared. Start with Forward.": "Programme vidé. Commence par Avancer.",
  "Program ready. Tap Run to try it again.": "Programme prêt. Appuie sur Lancer pour réessayer.",
  "Program opened. Add blocks or tap Run to try it.": "Programme ouvert. Ajoute des blocs ou appuie sur Lancer.",
  "Build a program: tap Forward three times, then Run.": "Ajoute trois blocs Avancer, puis appuie sur Lancer.",
  "Blue is straight ahead. Hold Go to reach it!": "Maintiens Avancer et dirige le robot vers le bleu !",
  "Drive it yourself: hold Go, and use Left or Right to steer.": "Maintiens Avancer et utilise Gauche ou Droite pour diriger le robot.",
  "This lab has no drive base loaded.": "Aucun robot de déplacement n’est chargé.",
  "This lab has no First Drive mission loaded.": "Aucune mission de déplacement n’est chargée.",
  "Program stopped before blue. Add another Forward block and run it again.": "Le robot s’est arrêté avant l’arrivée. Ajoute un bloc Avancer ou ajuste les virages, puis réessaie.",
  "Program finished after red. Undo the turn or add one back toward the middle.": "Le robot a traversé le rouge. Ajuste le virage et réessaie.",
  "Time's up. Good try — tap Try again and aim for blue.": "Temps écoulé. Appuie sur Réessayer et vise le bleu.",
  "That was a red zone. Steer back toward blue — you've still got this!": "Zone rouge ! Reviens vers le bleu, tu peux encore y arriver.",
  "Red again. Ease toward the middle, then aim for blue.": "Encore du rouge. Reviens vers le parcours, puis vise le bleu.",
  "Saved programs are unavailable in this browser. Your current blocks are still here.": "Les programmes enregistrés sont indisponibles. Tes blocs actuels sont toujours là.",
  "Saved programs could not be read. The stored data has been left untouched.": "Impossible de lire les programmes enregistrés. Les données ont été conservées.",
  "Could not save changes in this browser. Your current blocks and previous saved programs are still here.": "Impossible d’enregistrer ici. Tes blocs et tes anciens programmes sont conservés.",
  "Choose a name from 1 to 40 characters.": "Choisis un nom de 1 à 40 caractères.",
  "Build a program with one to six supported blocks before saving.": "Ajoute de un à six blocs avant d’enregistrer.",
  "That name is already saved or has changed. Open it again, or choose a new name.": "Ce nom existe déjà ou a changé. Ouvre le programme ou choisis un autre nom.",
  "That saved program was removed. Choose a new name to save a copy.": "Ce programme a été supprimé. Choisis un nouveau nom pour garder une copie.",
  "That saved program changed. Reopen the library before deleting it.": "Ce programme a changé. Rouvre la bibliothèque avant de le supprimer.",
};

export function kidxFrench(text: string): string {
  if (COPY[text]) return COPY[text];
  const patterns: [RegExp, (...matches: string[]) => string][] = [
    [/^Add (Forward|Left|Right|Stop) block$/, (_, name) => `Ajouter un bloc ${COPY[name]}`],
    [/^Running block (\d+) of (\d+): (.+)\.$/, (_, index, total, name) => `Bloc ${index} sur ${total} : ${COPY[name] ?? name}.`],
    [/^(.+) added\. Add more blocks, then tap Run\.$/, (_, name) => `${COPY[name] ?? name} ajouté. Ajoute des blocs, puis appuie sur Lancer.`],
    [/^(.+) added as block (\d+)\.$/, (_, name, index) => `${COPY[name] ?? name} ajouté en position ${index}.`],
    [/^Last block removed\. (\d+) left\.$/, (_, count) => `Dernier bloc retiré. Il en reste ${count}.`],
    [/^You did it! Blue target reached in ([\d.]+) seconds\.$/, (_, seconds) => `Réussi ! Zone bleue atteinte en ${seconds.replace(".", ",")} secondes.`],
    [/^Red zone on block (\d+)\..+$/, (_, index) => `Zone rouge au bloc ${index}. Observe le trajet, puis corrige ton programme.`],
    [/^Open “(.+)”\? Your current unsaved blocks will be replaced\.$/, (_, name) => `Ouvrir « ${name} » ? Tes blocs actuels seront remplacés.`],
    [/^Open (.+)$/, (_, name) => `Ouvrir ${name}`], [/^Confirm delete (.+)$/, (_, name) => `Confirmer la suppression de ${name}`],
    [/^Delete (.+)$/, (_, name) => `Supprimer ${name}`], [/^Saved “(.+)” in this browser\.$/, (_, name) => `« ${name} » enregistré dans ce navigateur.`],
    [/^Deleted “(.+)”\. Current blocks are still here\.$/, (_, name) => `« ${name} » supprimé. Tes blocs actuels sont conservés.`],
  ];
  for (const [pattern, replace] of patterns) {
    const match = pattern.exec(text);
    if (match) return replace(...match);
  }
  return text;
}

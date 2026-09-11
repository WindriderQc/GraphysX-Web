import type { KidxMission } from "./kidx-missions";

export const KIDX_MISSION_LANDMARKS: Record<string, [string, string]> = {
  "first-drive": ["Le bleu est l’arrivée. Les bandes rouges sont à éviter. Un bloc est un ordre : le robot les lit de gauche à droite.", "Regarde les roues : trois petits déplacements peuvent former un seul trajet."],
  "right-turn": ["La droite est celle du robot, même si tu regardes la scène de face. Tourne d’abord, puis avance vers le bleu.", "Un bloc Droite change la direction; les blocs Avancer conservent cette direction."],
  "left-turn": ["La gauche est celle du robot. Repère son avant, tourne, puis avance vers la zone bleue.", "Compare ce trajet avec le virage à droite : le robot part de l’autre côté."],
  delivery: ["Le jaune est un passage obligatoire. Rejoins-le avant de tourner vers l’arrivée bleue.", "L’ordre des blocs compte : avancer puis tourner donne un autre trajet que tourner puis avancer."],
  "return-home": ["Le bleu est près du départ, mais il faut d’abord passer au jaune. Deux virages du même côté préparent le retour.", "Prévois les blocs de l’aller, du demi-tour et du retour : tu as six places."],
  "reverse-parking": ["La place bleue est derrière le robot. Reculer fait tourner les roues à l’envers sans changer son orientation.", "Observe son avant : il reste du même côté pendant la marche arrière."],
  "cargo-push": ["C’est la caisse jaune qui doit atteindre le bleu. Garde-la devant le robot pour la pousser.", "Dans Blocs avancés, B et C sont les deux moteurs. Compare leur puissance et la durée du déplacement."],
  "sensor-retreat": ["Passe au jaune, puis approche du mur. Le capteur mesure la distance devant le robot en centimètres.", "Dans l’exemple, une distance inférieure à 5 cm déclenche la marche arrière."],
  "ramp-crossing": ["Le robot doit monter la pente, passer au jaune et atteindre le plateau bleu. Il lui faut assez de puissance.", "Essaie l’exemple, puis change la puissance des deux moteurs pour comparer."],
  "color-detect": ["Passe au jaune avant de détecter la bande bleue. Le capteur de couleur reconnaît le bleu avec le nombre 2.", "Le programme attend le bleu, marque une pause et fait reculer le robot au garage."],
  "touch-and-back": ["Approche du mur. Le contact vaut 0 quand le pare-chocs est libre et 1 lorsqu’il touche l’obstacle.", "Le bloc Si vérifie le contact : s’il vaut 1, le robot recule. Regarde la branche choisie."],
};

type GuideSnapshot = {
  mode: "program" | "drive"; phase: string; attempt: "program" | "laboratory" | "drive" | null; running: boolean;
  blocks: readonly string[]; labOpen: boolean; labPrepared: boolean; paused?: boolean; error: string | null;
};
const names: Record<string, string> = { forward: "Avancer", backward: "Reculer", left: "Gauche", right: "Droite", stop: "Stop" };
type GuideStep = { key: string; step: number; title: string; text: string; target: string | null };

/** Guidance follows the child's actual controls and the scene's verdict, never a simulated success. */
export function kidxMissionGuideStep(mission: Pick<KidxMission, "id" | "suggested" | "code">, state: GuideSnapshot): GuideStep {
  if (state.phase === "complete") return { key: "complete", step: 3, title: "Défi réussi !", text: state.attempt === "drive"
    ? "Tu peux revenir à l’Atelier pour choisir un autre défi, ou appuyer sur Réessayer pour améliorer ton trajet."
    : state.attempt === "laboratory"
    ? "Tu peux enregistrer ton programme dans Blocs avancés, avec Enregistrer, ou revenir à l’Atelier pour choisir un autre défi."
    : "Tu peux enregistrer ton programme dans Programmes, ou revenir à l’Atelier pour choisir un autre défi.", target: ".gx-ev3-exit" };
  if (state.phase === "expired") return { key: "expired", step: 3, title: "On essaie autrement ?", text: "Appuie sur Réessayer. Change un seul réglage ou un seul bloc, puis compare le trajet.", target: "[data-ev3-retry]" };
  if (state.running && state.paused) return { key: "paused", step: 3, title: "Programme en pause", text: "Dans Blocs avancés, Reprendre continue le programme. Un bloc permet de regarder chaque action séparément.", target: state.labOpen ? "[data-code-resume]" : "[data-kidx-lab]" };
  if (state.running) return { key: "running", step: 3, title: "Observe ton robot", text: "Regarde son trajet et le bloc actif. Arrêter le robot coupe le mouvement immédiatement et garde tes blocs.", target: "[data-kidx-stop]" };
  if (state.mode === "drive" && !state.labOpen) return { key: "drive", step: 1, title: "À toi de piloter", text: "Maintiens Avancer ou Reculer; relâche pour couper la commande. Gauche et Droite dirigent le robot. Programmer permet de préparer des ordres.", target: mission.id === "reverse-parking" ? "[data-ev3='backward']" : "[data-ev3='go']" };
  if (state.error) return { key: "error", step: 3, title: "Vérifie le capteur", text: `${state.error} Ouvre Blocs avancés pour ajuster ton programme.`, target: state.labOpen ? "[data-code-editor]" : "[data-kidx-lab]" };
  if (state.labOpen && !state.labPrepared) return { key: "example", step: 1, title: "Choisis l’exemple", text: "Appuie sur Exemple de la mission. Lis les blocs dans l’ordre et prévois ce que fera le robot.", target: "[data-code-example]" };
  if (state.attempt) return { key: "review", step: 3, title: "Compare avec ton idée", text: "Le robot s’est arrêté. Regarde ce qui manque pour atteindre le bleu, ajuste un bloc ou sa durée, puis relance.", target: state.labOpen ? "[data-code-run]" : state.attempt === "laboratory" ? "[data-kidx-lab]" : "[data-ev3-run]" };
  if (mission.code || state.labOpen) {
    if (!state.labOpen) return { key: "lab", step: 1, title: "Découvre le programme", text: "Ouvre Blocs avancés, puis choisis Exemple de la mission. Il prépare les moteurs et les capteurs de ce défi.", target: "[data-kidx-lab]" };
    return { key: "lab-ready", step: 2, title: "Teste ton idée", text: "Lancer joue le programme. Un bloc permet d’avancer pas à pas et de regarder les capteurs entre deux actions.", target: "[data-code-run]" };
  }
  const prefix = state.blocks.every((block, index) => block === mission.suggested[index]);
  if (prefix && state.blocks.length < mission.suggested.length) {
    const next = mission.suggested[state.blocks.length];
    return { key: `block-${state.blocks.length}`, step: 1, title: `Prépare tes ordres · ${state.blocks.length}/${mission.suggested.length}`,
      text: `${state.blocks.length === 0 ? "Un bloc = un ordre. " : ""}Appuie sur ${names[next]} en bas : ce sera l’ordre ${state.blocks.length + 1}. Le robot attend que tu appuies sur Lancer.`, target: `[data-ev3-block='${next}']` };
  }
  return { key: prefix ? "ready" : "explore", step: 2, title: prefix ? "Ton programme est prêt" : "Tu as une autre idée !",
    text: prefix ? "Appuie sur Lancer. Le robot exécutera tes blocs de gauche à droite. Regarde s’il rejoint le bleu." : "Tu peux tester ton programme avec Lancer. Retirer enlève le dernier bloc si tu veux le modifier.", target: "[data-ev3-run]" };
}

export function mountKidxMissionGuide(root: HTMLElement, host: HTMLElement, toolbar: HTMLElement, mission: KidxMission, read: () => GuideSnapshot) {
  const landmarks = KIDX_MISSION_LANDMARKS[mission.id] ?? [mission.objective, mission.hint];
  const button = document.createElement("button"); button.type = "button"; button.className = "kx-lab-toggle kx-guide-toggle";
  button.textContent = "? Comment jouer"; button.dataset.kidxGuide = ""; button.setAttribute("aria-controls", "kidx-mission-guide"); toolbar.append(button);
  const panel = document.createElement("section"); panel.id = "kidx-mission-guide"; panel.className = "kx-mission-guide";
  panel.setAttribute("aria-label", "Guide de la mission avec Nestor");
  panel.innerHTML = `<div class="kx-guide-heading"><span data-guide-step></span><button type="button" data-guide-close aria-label="Réduire le guide">×</button></div><p id="kidx-guide-instruction" data-guide-instruction></p><details><summary>Repères du défi</summary><p data-guide-landmarks></p><p data-guide-observe></p><p>Stop ajoute un ordre d’arrêt à ton programme. Arrêter le robot agit tout de suite, sans effacer tes blocs.</p><p class="kx-guide-camera">Glisse sur la scène pour regarder le robot sous un autre angle.</p></details>`;
  panel.querySelector("[data-guide-landmarks]")!.textContent = landmarks[0];
  panel.querySelector("[data-guide-observe]")!.textContent = landmarks[1];
  host.querySelector(".gx-ev3-nestor")!.after(panel);
  const labHint = document.createElement("p"); labHint.className = "kx-guide-lab-hint"; labHint.dataset.guideLabHint = ""; labHint.hidden = true;
  root.querySelector(".kx-code-tools")!.before(labHint);
  let expanded = true, wasRunning = false;
  let current: GuideStep | null = null, target: HTMLElement | null = null, targetSelector: string | null = null;
  const clearTarget = () => { target?.removeAttribute("data-kidx-guide-target"); target = null; };
  const update = () => {
    const snapshot = read();
    if (snapshot.running && !wasRunning) expanded = false;
    wasRunning = snapshot.running;
    const next = kidxMissionGuideStep(mission, snapshot);
    if (next.key !== current?.key || next.text !== current?.text) {
      current = next;
      panel.querySelector("[data-guide-step]")!.textContent = `${next.step}/3 · ${next.title}`;
      panel.querySelector("[data-guide-instruction]")!.textContent = next.text;
      labHint.textContent = next.text;
      panel.dataset.guideStage = next.key;
    }
    const visible = expanded && !snapshot.labOpen;
    if (panel.hidden === visible) panel.hidden = !visible;
    const labVisible = expanded && snapshot.labOpen;
    if (labHint.hidden === labVisible) labHint.hidden = !labVisible;
    if (button.getAttribute("aria-expanded") !== String(visible)) button.setAttribute("aria-expanded", String(visible));
    if (host.dataset.guideOpen !== String(visible)) host.dataset.guideOpen = String(visible);
    const selector = expanded ? next.target : null;
    if (selector !== targetSelector || (target && !target.isConnected) || (selector && !target)) {
      clearTarget(); targetSelector = selector; target = selector ? root.querySelector<HTMLElement>(selector) : null;
    }
    if (target && !target.matches(":disabled")) { if (target.dataset.kidxGuideTarget !== "true") target.dataset.kidxGuideTarget = "true"; }
    else target?.removeAttribute("data-kidx-guide-target");
  };
  button.addEventListener("click", () => { expanded = !expanded; update(); });
  panel.querySelector("[data-guide-close]")!.addEventListener("click", () => { expanded = false; update(); button.focus(); });
  const clicked = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    update();
  };
  root.addEventListener("click", clicked);
  update();
  return { update, state: () => ({ expanded: !panel.hidden || !labHint.hidden, enabled: expanded, stage: current?.key, step: current?.step, target: expanded ? current?.target : null }),
    dispose() { clearTarget(); root.removeEventListener("click", clicked); panel.remove(); labHint.remove(); button.remove(); delete host.dataset.guideOpen; } };
}

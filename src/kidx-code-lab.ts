import type { KidxReadings, KidxInstruction, KidxCondition } from "./kidx-code";
import { createKidxCodeRunner, readKidxCode, saveKidxCode } from "./kidx-code";
import type { AgentWorldSteerInput } from "./agent-world-runtime";

type Options = {
  readings: () => KidxReadings;
  apply: (input: AgentWorldSteerInput) => void;
  beforeRun: () => boolean;
  afterStop: () => void;
  report: (message: string) => void;
  sound: (enabled: boolean) => Promise<void>;
  speed: (power: number) => void;
  pauseWorld: (paused: boolean) => void;
  example?: KidxInstruction[];
};
const motors = (): KidxInstruction => ({ kind: "motors", left: 100, right: 100, seconds: .9 });
const condition = (): KidxCondition => ({ sensor: "distance", operator: "lt", value: 5 });

/** Progressive disclosure keeps the first six-block program accessible beside the richer language. */
export function mountKidxCodeLab(root: HTMLElement, options: Options) {
  let code: KidxInstruction[] = [motors()], open = false, lastPath: string | null = null;
  let wasRunning = false, sound = false;
  let prepared = false;
  let worldPaused = false;
  let renderedRunning: boolean | null = null;
  const button = document.createElement("button"); button.type = "button"; button.className = "kx-lab-toggle";
  button.innerHTML = `<span>Blocs avancés</span><span class="kx-tool-detail" id="kidx-lab-description">Moteurs · capteurs · boucles</span>`;
  button.dataset.kidxLab = ""; button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "Blocs avancés"); button.setAttribute("aria-describedby", "kidx-lab-description");
  button.setAttribute("aria-controls", "kidx-code-lab");
  const panel = document.createElement("section"); panel.className = "kx-code-lab"; panel.hidden = true;
  panel.id = "kidx-code-lab"; panel.setAttribute("aria-label", "Blocs avancés EV3");
  panel.innerHTML = `<header><div><small>PROGRAMMATION EV3</small><h2>Blocs avancés</h2></div><button data-lab-close aria-label="Fermer les blocs avancés">✕</button></header>
    <p class="kx-code-intro">Règle chaque moteur, réagis aux capteurs et répète des actions avec une boucle. Pour les premiers trajets, les blocs en bas de la scène suffisent.</p>
    <div class="kx-lcd" data-lab-sensors aria-label="Écran des capteurs simulés"></div>
    <details><summary>Pilotage et son</summary><label>Puissance en pilotage <input data-lab-power type="range" min="20" max="100" value="100"> <output data-lab-power-value>100 %</output></label><button data-lab-sound aria-pressed="false">Activer le son des moteurs</button><p>Les capteurs mesurent cette scène simulée. Couleurs : 0 = tapis, 1 = noir, 2 = bleu, 3 = vert, 4 = jaune, 5 = rouge, 6 = blanc.</p></details>
    <div class="kx-code-tools"><button data-code-example>Utiliser l’exemple</button><button data-code-save>Enregistrer</button><button data-code-load>Ouvrir mon programme</button></div>
    <div data-code-editor></div><p class="kx-code-status" data-code-status role="status"></p>
    <footer><button data-code-run aria-label="Démarrer le programme">▶ Démarrer</button><button data-code-step title="Le robot suit un seul bloc, puis attend.">Exécuter un bloc</button><button data-code-pause>Pause</button><button data-code-resume>Continuer</button><button data-code-stop disabled title="Arrêt immédiat. Les blocs sont conservés.">■ Arrêter ce programme</button></footer>`;
  root.append(panel);
  panel.addEventListener("change", event => { if (event.target instanceof Element && event.target.closest("[data-code-editor]")) prepared = true; });
  const message = panel.querySelector<HTMLElement>("[data-code-status]")!;
  const report = (text: string) => { message.textContent = text; options.report(text); };
  const runner = createKidxCodeRunner(options.apply, options.readings, report);
  const editor = panel.querySelector<HTMLElement>("[data-code-editor]")!;
  const show = (value: boolean) => {
    open = value; panel.hidden = !value; button.setAttribute("aria-expanded", String(value));
    if (value) panel.querySelector<HTMLButtonElement>("[data-lab-close]")!.focus(); else button.focus();
  };
  button.addEventListener("click", () => show(!open));
  panel.querySelector("[data-lab-close]")!.addEventListener("click", () => show(false));
  panel.addEventListener("keydown", event => { if (event.key === "Escape") { event.stopPropagation(); show(false); } });
  const makeButton = (text: string, action: () => void) => { const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.addEventListener("click", () => { prepared = true; action(); }); return b; };
  const numeric = (parent: HTMLElement, label: string, value: number, min: number, max: number, change: (v: number) => void, step = .1) => {
    const wrapper = document.createElement("label"); wrapper.textContent = label;
    const input = document.createElement("input"); input.type = "number"; input.value = String(value); input.min = String(min); input.max = String(max); input.step = String(step); input.setAttribute("aria-label", label);
    input.addEventListener("change", () => { const n = Number(input.value); if (Number.isFinite(n)) { const next = Math.max(min, Math.min(max, step === 1 ? Math.round(n) : n)); change(next); input.value = String(next); } else input.value = String(value); });
    wrapper.append(input); parent.append(wrapper);
  };
  const select = (parent: HTMLElement, label: string, values: Array<[string, string]>, value: string, change: (value: string) => void) => {
    const wrapper = document.createElement("label"); wrapper.textContent = label; const control = document.createElement("select"); control.setAttribute("aria-label", label);
    values.forEach(([id, text]) => control.add(new Option(text, id))); control.value = value;
    control.addEventListener("change", () => change(control.value)); wrapper.append(control); parent.append(wrapper);
  };
  const renderCondition = (parent: HTMLElement, c: KidxCondition) => {
    select(parent, "Capteur", [["distance", "Distance (cm)"], ["touch", "Contact (0/1)"], ["color", "Couleur (0–6)"], ["angle", "Angle (°)"]], c.sensor, value => { c.sensor = value as KidxCondition["sensor"]; });
    select(parent, "Comparaison", [["lt", "plus petit que"], ["gt", "plus grand que"], ["eq", "égal à"]], c.operator, value => { c.operator = value as KidxCondition["operator"]; });
    numeric(parent, "Valeur", c.value, -360, 1000, value => { c.value = value; });
  };
  const render = () => {
    renderedRunning = null;
    editor.replaceChildren();
    const list = (nodes: KidxInstruction[], parent: HTMLElement, prefix = "", depth = 0) => {
      for (const [index, node] of nodes.entries()) {
        const row = document.createElement("article"); row.className = `kx-code-block kx-code-${node.kind}`; row.dataset.codePath = `${prefix}${index}`;
        const header = document.createElement("div"); header.className = "kx-code-block-head";
        const title = document.createElement("strong"); title.textContent = `${index + 1}. ${{ motors: "Moteurs B + C", wait: "Attendre", until: "Rouler jusqu’à…", repeat: "Répéter", if: "Si… alors" }[node.kind]}`;
        const up = makeButton("↑", () => { if (index) { [nodes[index - 1], nodes[index]] = [nodes[index], nodes[index - 1]]; render(); } }); up.setAttribute("aria-label", "Monter le bloc"); up.disabled = index === 0;
        const remove = makeButton("✕", () => { nodes.splice(index, 1); render(); }); remove.setAttribute("aria-label", "Enlever ce bloc"); header.append(title, up, remove); row.append(header);
        const fields = document.createElement("div"); fields.className = "kx-code-fields"; row.append(fields);
        if (node.kind === "motors" || node.kind === "until") {
          numeric(fields, "B · gauche (%)", node.left, -100, 100, value => { node.left = value; }, 1);
          numeric(fields, "C · droite (%)", node.right, -100, 100, value => { node.right = value; }, 1);
        }
        if (node.kind === "motors" || node.kind === "wait" || node.kind === "until") numeric(fields, node.kind === "until" ? "Délai maximum (s)" : "Durée (s)", node.seconds, .05, 30, value => { node.seconds = value; });
        if (node.kind === "if" || node.kind === "until") renderCondition(fields, node.condition);
        if (node.kind === "repeat") { numeric(fields, "Fois", node.count, 1, 20, value => { node.count = value; }, 1); list(node.body, row, `${prefix}${index}.body.`, depth + 1); }
        if (node.kind === "if") { list(node.body, row, `${prefix}${index}.body.`, depth + 1); const otherwise = document.createElement("p"); otherwise.textContent = "Sinon"; row.append(otherwise); list(node.otherwise, row, `${prefix}${index}.otherwise.`, depth + 1); }
        parent.append(row);
      }
      const add = document.createElement("div"); add.className = "kx-code-add";
      const choice = document.createElement("select"); choice.setAttribute("aria-label", "Bloc à ajouter");
      for (const [id, title] of [["motors", "Moteurs"], ["wait", "Attendre"], ["until", "Rouler jusqu’à…"], ...(depth < 4 ? [["repeat", "Répéter"], ["if", "Si… alors"]] : [])]) choice.add(new Option(title, id));
      const addButton = makeButton("+ Ajouter le bloc", () => {
        if (nodes.length >= 32 || editor.querySelectorAll(".kx-code-block").length >= 64) { report("Le programme peut contenir 64 blocs, avec 32 blocs par liste."); return; }
        const kind = choice.value;
        nodes.push(kind === "repeat" ? { kind, count: 2, body: [motors()] } : kind === "if" ? { kind, condition: condition(), body: [motors()], otherwise: [] } : kind === "until" ? { kind, left: 50, right: 50, seconds: 10, condition: condition() } : kind === "wait" ? { kind, seconds: 1 } : motors()); render();
      });
      add.append(choice, addButton); parent.append(add);
    };
    list(code, editor);
  };
  const stopped = () => { if (wasRunning) { wasRunning = false; options.afterStop(); } };
  const begin = (step = false) => {
    if (runner.state().running) { runner.resume(step); worldPaused = false; options.pauseWorld(false); return; }
    if (!code.length) { report("Ajoute au moins un bloc."); return; }
    if (!options.beforeRun()) return;
    if (!runner.start(code, step)) { report("Vérifie les valeurs et le nombre de blocs."); options.afterStop(); return; }
    prepared = true; wasRunning = true; if (!step) show(false);
  };
  panel.querySelector("[data-code-run]")!.addEventListener("click", () => begin());
  panel.querySelector("[data-code-step]")!.addEventListener("click", () => begin(true));
  panel.querySelector("[data-code-pause]")!.addEventListener("click", () => { runner.pause(); if (runner.state().running) { worldPaused = true; options.pauseWorld(true); } });
  panel.querySelector("[data-code-resume]")!.addEventListener("click", () => { runner.resume(); if (runner.state().running) { worldPaused = false; options.pauseWorld(false); } });
  panel.querySelector("[data-code-stop]")!.addEventListener("click", () => { runner.stop(); stopped(); report("Robot arrêté. Ton programme est conservé."); });
  panel.querySelector("[data-code-save]")!.addEventListener("click", () => { try { report(saveKidxCode(localStorage, code) ?? "Programme enregistré dans ce navigateur."); } catch { report("Enregistrement indisponible. Ton programme reste ouvert."); } });
  panel.querySelector("[data-code-load]")!.addEventListener("click", () => { try { const saved = readKidxCode(localStorage); if (saved) { code = saved; prepared = true; render(); report("Programme ouvert."); } else report("Aucun programme enregistré."); } catch { report("La sauvegarde n’a pas pu être lue. Le programme ouvert reste intact."); } });
  panel.querySelector("[data-code-example]")!.addEventListener("click", () => { code = structuredClone(options.example ?? [{ kind: "repeat", count: 3, body: [motors()] }]); prepared = true; render(); report("Exemple prêt. Observe les blocs, puis appuie sur Démarrer."); });
  panel.querySelector<HTMLInputElement>("[data-lab-power]")!.addEventListener("input", event => { const value = Number((event.target as HTMLInputElement).value); options.speed(value / 100); panel.querySelector("[data-lab-power-value]")!.textContent = `${value} %`; });
  panel.querySelector("[data-lab-sound]")!.addEventListener("click", async () => { try { await options.sound(!sound); sound = !sound; const b = panel.querySelector("[data-lab-sound]")!; b.textContent = sound ? "Couper le son" : "Activer le son des moteurs"; b.setAttribute("aria-pressed", String(sound)); } catch { report("Le son n’a pas pu démarrer dans ce navigateur."); } });
  render();
  return {
    button,
    activity: () => ({ open, prepared, ...runner.state() }),
    stop() { runner.stop(); stopped(); },
    advance(delta: number) {
      runner.advance(delta); if (!runner.state().running) stopped();
      const state = runner.state();
      if (state.running && state.paused !== worldPaused) { worldPaused = state.paused; options.pauseWorld(worldPaused); }
      if (renderedRunning !== state.running) {
        renderedRunning = state.running;
        panel.querySelector<HTMLButtonElement>("[data-code-stop]")!.disabled = !state.running;
        editor.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input,button,select").forEach(control => { control.disabled = state.running || (control.getAttribute("aria-label") === "Monter le bloc" && control.parentElement?.parentElement?.dataset.codePath?.split(".").at(-1) === "0"); });
        for (const selector of ["[data-code-example]", "[data-code-load]"]) panel.querySelector<HTMLButtonElement>(selector)!.disabled = state.running;
      }
      if (state.activePath !== lastPath) {
        lastPath = state.activePath;
        editor.querySelectorAll<HTMLElement>("[data-code-path]").forEach(element => { element.dataset.active = String(element.dataset.codePath === lastPath); });
        if (lastPath) options.report(`Nestor · Programme en cours : bloc ${lastPath.split(".").map(v => /^\d+$/.test(v) ? Number(v) + 1 : v === "body" ? "alors" : "sinon").join(" → ")}.`);
      }
      if (open) {
        const s = options.readings();
        panel.querySelector("[data-lab-sensors]")!.textContent = `EV3 · CAPTEURS SIMULÉS\nDistance  ${s.distance.toFixed(1)} cm     Contact ${s.touch ? "PRESSÉ" : "libre"}\nCouleur   ${s.color}                  Angle ${s.angle.toFixed(1)}°\n${state.running ? state.paused ? "PAUSE" : "MOTEURS EN MARCHE" : "PRÊT"}`;
      }
    },
    state: () => ({ ...runner.state(), open, code: structuredClone(code), sensors: options.readings() }),
    dispose() { runner.stop(); panel.remove(); button.remove(); },
  };
}

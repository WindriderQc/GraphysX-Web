import type { GraphysXAgentWorldApi, AgentWorldVector3, AgentWorldCommand } from "./agent-world-runtime";
import { mountEv3MissionStrip, type Ev3MissionStrip } from "./ev3-mission-strip";
import { availableKidxDocuments, findKidxDocuments, KIDX_DOCUMENTS, readKidxProgress, type KidxDocument } from "./kidx-library";
import { KIDX_BUILDS, kidxBuildEntities, kidxPartLabel, type KidxBuild } from "./kidx-builds";
import { KIDX_LESSON_SOURCE, KIDX_MISSIONS, kidxBuildScene, kidxMissionScene, type KidxMission } from "./kidx-missions";
import "./kidx-app.css";
import { createKidxBuildPlayback } from "./kidx-build-playback";
import { parseKidxBuildRequest, smoothKidx } from "./kidx-build-actions";
import { markKidxJourney, readKidxJourney } from "./kidx-journey";
import { mountKidxMechanismDemo } from "./kidx-mechanism-demo";
import { createKidxTeam } from "./kidx-team";

export type KidxApplication = { dispose: () => void; state: () => unknown; advanceTime: (milliseconds: number) => unknown };
type Options = {
  subscribeFrame: (listener: (deltaSeconds: number) => void) => () => void;
  frameView: (position: AgentWorldVector3, target: AgentWorldVector3, seconds?: number) => void;
};

/** Child-facing navigation. Scene changes and construction visibility use the ordinary world API. */
export function mountKidxApp(root: HTMLElement, api: GraphysXAgentWorldApi, onExit: () => void, options: Options): KidxApplication {
  let screen = "mission";
  let strip: Ev3MissionStrip | null = null;
  let content: HTMLElement | null = null;
  let disposeDetail: (() => void) | null = null;
  let detailState: (() => unknown) | null = null;
  let advanceDetail: ((seconds: number) => void) | null = null;
  let activeMission = KIDX_MISSIONS[0];
  let activeBuild: KidxBuild | null = null;
  let buildStep = 0;
  let exploded = false;
  let angle = 35;
  let generation = 0;
  let disposed = false;
  const available = availableKidxDocuments();
  let reframe = () => {};
  const button = (label: string, action: () => void, data?: string): HTMLButtonElement => {
    const element = document.createElement("button"); element.type = "button"; element.textContent = label;
    if (data) element.setAttribute(data, "");
    element.addEventListener("click", action); return element;
  };
  const clear = () => {
    generation++;
    strip?.dispose(); strip = null;
    disposeDetail?.(); disposeDetail = null; detailState = null;
    advanceDetail = null;
    content?.remove(); content = null;
    api.pause(true); reframe = () => {};
  };
  const startMission = (mission: KidxMission) => {
    clear(); screen = "mission"; activeMission = mission;
    const receipt = api.load(kidxMissionScene(mission));
    if (!receipt.ok) throw new Error(receipt.error ?? "Unable to load KidX mission");
    reframe = () => {
      const aspect = root.clientWidth / Math.max(1, root.clientHeight);
      const distance = Math.max(1, .95 / aspect);
      const targetY = root.clientHeight <= 520 ? 2 : 1.1;
      const x = mission.id === "first-drive" ? 0 : mission.finish[0] * .28;
      const z = mission.id === "first-drive" ? 14.25 : 14.5;
      options.frameView([x + 5 * distance, targetY + 9.2 * distance, z + 14.25 * distance], [x, targetY, z], 0);
    };
    reframe();
    strip = mountEv3MissionStrip(root, api, () => showHome("missions"), { subscribeFrame: options.subscribeFrame, mission, french: true,
      onComplete: () => { try { markKidxJourney(localStorage, "missions", mission.id); } catch { /* optional achievement */ } } });
  };
  const openReader = async (item: KidxDocument, returnToBuild: KidxBuild | null = null) => {
    clear(); screen = "reader";
    api.clear("kidx-reader", "KidX · Notices LEGO");
    const token = generation;
    const [reader, local] = await Promise.all([import("./kidx-pdf-reader"), available]);
    if (disposed || token !== generation) return;
    const mounted = reader.mountKidxPdfReader(root, item, local.has(item.id), () => returnToBuild ? showBuild(returnToBuild, buildStep) : showHome("library"), returnToBuild ? "← Construction 3D" : "← Notices LEGO");
    disposeDetail = mounted.dispose; detailState = mounted.state;
  };
  const showBuild = (build: KidxBuild, initialStep?: number) => {
    clear(); screen = "build"; activeBuild = build;
    let storedStep = 0;
    try { storedStep = Number(localStorage.getItem(`graphysx:kidx:build:${build.id}:v1`) ?? 0); } catch { /* optional persistence */ }
    buildStep = Math.max(0, Math.min(build.steps.length - 1, Number.isFinite(initialStep ?? storedStep) ? Math.floor(initialStep ?? storedStep) : 0));
    exploded = false; angle = 35;
    let zoom = buildStep < 6 ? (root.clientWidth <= 600 ? 1.35 : 2) : 1;
    let underside = false;
    const entities = kidxBuildEntities(build, buildStep);
    const receipt = api.load(kidxBuildScene(entities.slice(0, buildStep + 1)));
    if (!receipt.ok) throw new Error(receipt.error ?? "Unable to load build");
    const spawned = new Set(entities.slice(0, buildStep + 1).map((item) => item.id));
    const ui = document.createElement("section"); ui.className = "kx-build-ui"; content = ui;
    ui.innerHTML = `<header class="kx-build-bar"><button data-build-back>← Atelier</button><h1></h1><button data-build-pdf>Notice LEGO</button></header>
      <aside class="kx-build-side"><small class="kx-eyebrow">CONSTRUCTION 3D</small><h2 data-build-title></h2><div class="kx-build-progress"><i></i></div>
      <p>Ajoute les pièces mises en lumière. Tourne le modèle pour voir où les pièces s’emboîtent.</p><ul data-build-pieces></ul>
      <div class="kx-card-row"><button data-build-zoom-in aria-label="Rapprocher le modèle">Rapprocher</button><button data-build-zoom-out aria-label="Éloigner le modèle">Éloigner</button></div>
      <button data-build-explode title="Écarte les groupes de pièces pour voir comment ils s’emboîtent.">Écarter les pièces</button><button data-build-complete>Voir le modèle complet</button>
      <details><summary>À propos de ce guide</summary>Assemblages issus du modèle LDraw de Philippe Hurbain. Leur ordre peut différer des pages LEGO. Vérifie les petits raccords dans la notice originale. Les câbles sont regroupés et les autocollants ne sont pas tous représentés.<br><a target="_blank" rel="noopener noreferrer" data-build-credits>Crédits des pièces et sources</a></details></aside>
      <div class="kx-build-status" role="status"></div><footer class="kx-build-footer"><button data-build-prev aria-label="Étape précédente">← Étape précédente</button><label>Étape <input data-build-number type="number" min="1" aria-label="Numéro d’étape"> <span></span></label><button data-build-next aria-label="Étape suivante">Étape suivante →</button><button data-build-rotate aria-label="Tourner le modèle de 45 degrés">↻ Tourner le modèle</button></footer>`;
    ui.querySelector("h1")!.textContent = build.label;
    ui.querySelector<HTMLAnchorElement>("[data-build-credits]")!.href = `/assets/kidx/builds/${build.id}/credits.json`;
    const number = ui.querySelector<HTMLInputElement>("[data-build-number]")!;
    number.max = String(build.steps.length);
    ui.querySelector(".kx-build-footer span")!.textContent = `/ ${build.steps.length}`;
    const title = ui.querySelector<HTMLElement>("[data-build-title]")!;
    const progress = ui.querySelector<HTMLElement>(".kx-build-progress i")!;
    const previous = ui.querySelector<HTMLButtonElement>("[data-build-prev]")!;
    const next = ui.querySelector<HTMLButtonElement>("[data-build-next]")!;
    const explode = ui.querySelector<HTMLButtonElement>("[data-build-explode]")!;
    const status = ui.querySelector<HTMLElement>(".kx-build-status")!;
    reframe = () => {
      const portrait = root.clientWidth <= 600;
      const radius = (portrait ? 11 : 7) / zoom;
      const radians = angle * Math.PI / 180;
      const target: AgentWorldVector3 = [portrait ? 0 : 1.3, portrait ? -1.6 : build.height * .45, 0];
      options.frameView([target[0] + radius * Math.sin(radians), target[1] + radius * (underside ? -.8 : .8), radius * Math.cos(radians)], target, .35);
    };
    const demo = document.createElement("section"); demo.className = "kx-demo-controls";
    demo.innerHTML = `<button data-build-replay>▶ Nestor, montre-moi</button><div class="kx-card-row"><button data-build-pause>Pause</button><button data-build-resume>Continuer</button></div>
      <label>Vitesse <select data-build-speed aria-label="Vitesse de la démonstration"><option value=".25">Très lente</option><option value=".5">Lente</option><option value="1" selected>Normale</option><option value="2">Rapide</option></select></label>
      <label>Revoir une pièce <select data-build-piece aria-label="Pièce à montrer"></select></label><p data-build-demo-status role="status">Une courte démonstration avec les vraies pièces du modèle.</p>
      <details><summary>Demander à Nestor</summary><form data-build-request><label>Ta demande<input aria-label="Demande à Nestor" placeholder="Montre dessous, étape 8, moteur…" maxlength="120"></label><button>Demander à Nestor</button></form><p>Essaie : « Tourne le modèle », « Montre dessous », « Étape 8 » ou « Écarte les pièces ».</p></details>
      <details data-build-team><summary>Construire ensemble</summary><label>Constructeur 1<input data-team-one maxlength="24" value="Constructeur 1"></label><label>Constructeur 2<input data-team-two maxlength="24" value="Constructeur 2"></label><button data-team-toggle>Construire à deux</button><p data-team-status role="status"></p><button data-team-ready hidden>Pièces prêtes →</button><details><summary>Partager avec un autre écran</summary><button data-team-create>Créer un code duo</button><label>Code de l’autre écran<input data-team-code maxlength="8" autocomplete="off" spellcheck="false"></label><button data-team-join>Rejoindre le duo</button><button data-team-leave>Arrêter le partage</button><p data-team-session role="status">Ouvre le même modèle depuis le serveur KidX sur les deux écrans.</p></details></details>`;
    ui.querySelector(".kx-build-side p")!.after(demo);
    const demoStatus = demo.querySelector<HTMLElement>("[data-build-demo-status]")!;
    const playback = createKidxBuildPlayback(api, build, text => { demoStatus.textContent = text; });
    const pieceSelect = demo.querySelector<HTMLSelectElement>("[data-build-piece]")!;
    const speedSelect = demo.querySelector<HTMLSelectElement>("[data-build-speed]")!;
    let transitions: Array<{ id: string; from: AgentWorldVector3; to: AgentWorldVector3 }> = [];
    let transitionTime = 0;
    let duo = false, prepared = false;
    const teamNames = [demo.querySelector<HTMLInputElement>("[data-team-one]")!, demo.querySelector<HTMLInputElement>("[data-team-two]")!];
    const teamKey = `graphysx:kidx:team:${build.id}:v1`;
    try {
      const saved = JSON.parse(localStorage.getItem(teamKey) ?? "null");
      if (saved?.version === 1 && Array.isArray(saved.names) && saved.names.length === 2 && saved.names.every((n: unknown) => typeof n === "string" && n.length <= 24)) {
        teamNames.forEach((input, i) => { input.value = saved.names[i]; }); duo = saved.active === true;
        prepared = saved.step === buildStep && saved.prepared === true;
      }
    } catch { /* optional browser-local teamwork */ }
    const team = () => {
      const prepareName = teamNames[buildStep % 2].value.trim() || `Constructeur ${buildStep % 2 + 1}`;
      const assembleName = teamNames[(buildStep + 1) % 2].value.trim() || `Constructeur ${(buildStep + 1) % 2 + 1}`;
      demo.querySelector("[data-team-toggle]")!.textContent = duo ? "Construire seul" : "Construire à deux";
      demo.querySelector<HTMLButtonElement>("[data-team-ready]")!.hidden = !duo;
      demo.querySelector("[data-team-ready]")!.textContent = prepared ? "Étape terminée →" : "Pièces prêtes →";
      demo.querySelector("[data-team-status]")!.textContent = duo ? prepared ? `${assembleName}, assemble ! ${prepareName} peut te montrer la démonstration.` : `${prepareName}, prépare les pièces. ${assembleName} assemblera. Les rôles changent à chaque étape.` : "À deux sur cet écran : une personne prépare, l’autre assemble.";
      try { localStorage.setItem(teamKey, JSON.stringify({ version: 1, active: duo, names: teamNames.map(n => n.value), step: buildStep, prepared })); }
      catch { demo.querySelector("[data-team-status]")!.textContent += " Reprise non enregistrée."; }
    };
    let receivingTeam = false;
    const sharedTeam = createKidxTeam(build.id, state => {
      receivingTeam = true;
      try {
        duo = true;
        if (state.step !== buildStep) go(state.step, false);
        prepared = state.prepared;
        teamNames.forEach((input, i) => { input.value = state.names[i]; });
        demo.querySelector<HTMLInputElement>("[data-team-code]")!.value = state.code;
        team();
      } finally { receivingTeam = false; }
    }, text => { demo.querySelector("[data-team-session]")!.textContent = text; });
    const teamDraft = () => ({ model: build.id, step: buildStep, prepared, names: teamNames.map((n, i) => n.value.trim() || `Constructeur ${i + 1}`) });
    const publishTeam = () => { if (!receivingTeam) sharedTeam.publish(teamDraft()); };
    const pending = new Set<string>();
    let loadFailed = false;
    const highlight = (id: string, active: boolean): AgentWorldCommand => ({ op: "update", id,
      patch: { modelMaterialOverrides: active ? Object.fromEntries((api.state()?.entities.find((item) => item.id === id)?.materialSlots ?? [])
        .map((slot) => [slot.id, { emissive: "#63a947", emissiveIntensity: .22 }])) : null } });
    const readyStatus = () => {
      if (playback.state().active) return;
      status.textContent = loadFailed ? "Une pièce n’a pas pu être chargée. Reviens à l’atelier pour réessayer."
        : buildStep === build.steps.length - 1 ? "Le modèle est assemblé ! Tu peux revoir chaque étape." : "Les pièces de l’étape actuelle sont légèrement éclairées en vert.";
    };
    let frameTime = 0;
    const advanceBuild = (delta: number) => {
      playback.advance(delta);
      if (transitions.length) {
        transitionTime += Math.min(.1, delta);
        const t = smoothKidx(transitionTime / .65);
        api.transaction(transitions.map(({ id, from, to }) => ({ op: "update", id, patch: { transform: { position: from.map((v, i) => v + (to[i] - v) * t) as AgentWorldVector3 } } })));
        if (t === 1) transitions = [];
      }
      if (!pending.size || (frameTime += delta) < .2) return;
      frameTime = 0;
      const states = api.state()?.entities ?? [];
      for (const id of pending) {
        const state = states.find((item) => item.id === id);
        if (state?.asset?.status === "ready") {
          pending.delete(id);
          if (id === entities[buildStep].id) {
            const result = api.transaction([highlight(id, true)]);
            if (!result.ok) { status.textContent = "Le surlignage n’a pas pu être appliqué."; return; }
          }
        } else if (state?.asset?.status === "error") {
          pending.delete(id); loadFailed = true; readyStatus(); return;
        }
      }
      if (!pending.size) readyStatus();
    };
    let deterministicBuild = false;
    const unsubscribe = options.subscribeFrame(delta => { sharedTeam.advance(); if (!deterministicBuild) advanceBuild(delta); });
    advanceDetail = delta => { deterministicBuild = true; advanceBuild(delta); };
    disposeDetail = () => { unsubscribe(); sharedTeam.dispose(); playback.stop(); };
    detailState = () => ({ demonstration: playback.state(), duo: { active: duo, prepared, names: teamNames.map(n => n.value), session: sharedTeam.state() }, underside });
    const update = () => {
      const commands: AgentWorldCommand[] = [];
      for (const [index, entity] of entities.entries()) {
        if (index <= buildStep && !spawned.has(entity.id)) {
          commands.push({ op: "spawn", entity }); spawned.add(entity.id);
        }
        if (spawned.has(entity.id)) {
          commands.push({ op: "update", id: entity.id!, patch: { visible: index <= buildStep,
            transform: { position: exploded ? [(index % 3 - 1) * .7, index * .09, (index % 2 ? .6 : -.6)] : [0, 0, 0] } } });
          commands.push(highlight(entity.id!, index === buildStep));
        }
      }
      const result = api.transaction(commands);
      if (!result.ok) { status.textContent = "Cette étape n’a pas pu être affichée. Reviens à l’atelier pour réessayer."; return; }
      pending.clear();
      for (const item of api.state()?.entities ?? []) if (item.tags.includes("kidx-build") && item.asset?.status === "loading") pending.add(item.id);
      number.value = String(buildStep + 1); title.textContent = `Étape ${buildStep + 1} sur ${build.steps.length}`;
      progress.style.width = `${(buildStep + 1) / build.steps.length * 100}%`;
      previous.disabled = buildStep === 0; next.disabled = buildStep === build.steps.length - 1;
      explode.textContent = exploded ? "Rassembler les pièces" : "Écarter les pièces"; explode.setAttribute("aria-pressed", String(exploded));
      explode.title = exploded ? "Remets les groupes de pièces à leur place." : "Écarte les groupes de pièces pour voir comment ils s’emboîtent.";
      const inventory = new Map<string, { count: number; label: string; file: string; color: string }>();
      const colors: Record<string, string> = { "0": "noir", "1": "bleu", "4": "rouge", "7": "gris", "14": "jaune", "15": "blanc", "71": "gris clair", "72": "gris foncé" };
      for (const piece of build.steps[buildStep].pieces) {
        const key = `${piece.file}:${piece.color}`;
        const current = inventory.get(key);
        if (current) current.count++;
        else inventory.set(key, { count: 1, label: kidxPartLabel(piece.label), file: piece.file, color: colors[piece.color] ?? "" });
      }
      const list = ui.querySelector("[data-build-pieces]")!; list.replaceChildren();
      pieceSelect.replaceChildren();
      build.steps[buildStep].pieces.forEach((piece, i) => pieceSelect.add(new Option(`${i + 1} · ${kidxPartLabel(piece.label)}`, String(i))));
      for (const item of inventory.values()) {
        const row = document.createElement("li"); row.textContent = `${item.count} × ${item.label}`;
        const code = document.createElement("small"); code.textContent = item.file.replace(/^31313 - /, "").replace(/\.dat$|\.ldr$/g, "") + (item.color ? ` · ${item.color}` : "");
        row.append(code); list.append(row);
      }
      if (pending.size) status.textContent = "Chargement des pièces 3D…"; else readyStatus();
      try { localStorage.setItem(`graphysx:kidx:build:${build.id}:v1`, String(buildStep)); }
      catch { status.textContent += " Reprise non enregistrée dans ce navigateur."; }
      team();
    };
    const go = (value: number, animate = true) => {
      if (!Number.isFinite(value)) return;
      playback.stop(); transitions = []; prepared = false; exploded = false;
      buildStep = Math.max(0, Math.min(build.steps.length - 1, Math.floor(value))); update();
      publishTeam();
      if (animate) playback.start(buildStep);
    };
    previous.addEventListener("click", () => go(buildStep - 1)); next.addEventListener("click", () => go(buildStep + 1));
    number.addEventListener("change", () => go(Number(number.value) - 1));
    const setExploded = (value: boolean) => {
      playback.stop();
      const before = new Map(api.query({ tag: "kidx-build" }).map(e => [e.id, e.position]));
      exploded = value; update(); transitionTime = 0;
      transitions = api.query({ tag: "kidx-build" }).filter(e => e.visible).map(e => ({ id: e.id, from: before.get(e.id) ?? [0, 0, 0], to: e.position }));
      for (const item of transitions) api.update(item.id, { transform: { position: item.from } });
    };
    explode.addEventListener("click", () => setExploded(!exploded));
    ui.querySelector("[data-build-complete]")!.addEventListener("click", () => { zoom = 1; go(build.steps.length - 1, false); reframe(); });
    ui.querySelector("[data-build-rotate]")!.addEventListener("click", () => { angle += 45; reframe(); });
    ui.querySelector("[data-build-zoom-in]")!.addEventListener("click", () => { zoom = Math.min(3.2, zoom + .2); reframe(); });
    ui.querySelector("[data-build-zoom-out]")!.addEventListener("click", () => { zoom = Math.max(.6, zoom - .2); reframe(); });
    const replay = (piece = 0) => { if (exploded) { exploded = false; update(); } transitions = []; playback.start(buildStep, piece); };
    demo.querySelector("[data-build-replay]")!.addEventListener("click", () => replay());
    demo.querySelector("[data-build-pause]")!.addEventListener("click", () => playback.pause());
    demo.querySelector("[data-build-resume]")!.addEventListener("click", () => playback.resume());
    speedSelect.addEventListener("change", () => playback.speed(Number(speedSelect.value)));
    pieceSelect.addEventListener("change", () => replay(Number(pieceSelect.value)));
    demo.querySelector("[data-build-request]")!.addEventListener("submit", event => {
      event.preventDefault(); const input = demo.querySelector<HTMLInputElement>("[aria-label='Demande à Nestor']")!;
      const request = parseKidxBuildRequest(input.value);
      if (request.action === "step") go(request.value!);
      else if (request.action === "next") go(buildStep + 1);
      else if (request.action === "previous") go(buildStep - 1);
      else if (request.action === "underside" || request.action === "above") { underside = request.action === "underside"; reframe(); }
      else if (request.action === "rotate") { angle += 45; reframe(); }
      else if (request.action === "explode" || request.action === "assemble") setExploded(request.action === "explode");
      else if (request.action === "pause") playback.pause();
      else if (request.action === "resume") playback.resume();
      else if (request.action === "slow") { speedSelect.value = ".5"; playback.speed(.5); replay(); }
      else if (request.action === "replay") replay();
      else {
        const search = request.search ?? "";
        const found = build.steps[buildStep].pieces.findIndex(p => `${kidxPartLabel(p.label)} ${p.label} ${p.file}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(search));
        if (!search || found < 0) { demoStatus.textContent = "Je ne trouve pas cette pièce dans l’étape actuelle. Choisis-la dans la liste, ou demande une étape, dessous ou demande d’écarter les pièces."; return; }
        pieceSelect.value = String(found); replay(found);
        const center = build.steps[buildStep].pieces[found].center;
        const distance = root.clientWidth <= 600 ? 1.8 : 1;
        options.frameView([center[0] + 1.6 * distance, center[1] + 1.8 * distance, center[2] + 2.5 * distance], [center[0] + (root.clientWidth > 600 ? .4 : 0), center[1], center[2]], .45);
      }
      if (!["piece", "replay", "slow", "step", "next", "previous"].includes(request.action)) demoStatus.textContent = `Nestor : ${input.value.trim()}. C’est fait.`;
    });
    demo.querySelector("[data-team-toggle]")!.addEventListener("click", () => { duo = !duo; prepared = false; if (!duo) sharedTeam.leave(); team(); publishTeam(); });
    teamNames.forEach(input => input.addEventListener("change", () => { team(); publishTeam(); }));
    demo.querySelector("[data-team-ready]")!.addEventListener("click", () => { if (prepared) { if (buildStep < build.steps.length - 1) go(buildStep + 1); else demoStatus.textContent = "Bravo à vous deux, le modèle est assemblé !"; } else { prepared = true; team(); publishTeam(); } });
    demo.querySelector("[data-team-create]")!.addEventListener("click", () => { duo = true; team(); void sharedTeam.create(teamDraft()); });
    demo.querySelector("[data-team-join]")!.addEventListener("click", () => { void sharedTeam.join(demo.querySelector<HTMLInputElement>("[data-team-code]")!.value); });
    demo.querySelector("[data-team-leave]")!.addEventListener("click", () => sharedTeam.leave());
    const adventure = document.createElement("details"); adventure.className = "kx-build-adventure";
    adventure.innerHTML = `<summary>Construire → Programmer → Tester</summary><p>Les défis utilisent la base roulante EV3 de l’atelier pour expérimenter les mécanismes de ce modèle.</p>`;
    for (const mission of KIDX_MISSIONS.filter(item => item.build === build.id)) adventure.append(button(mission.title + " →", () => startMission(mission)));
    adventure.append(button("J’ai terminé la construction ✓", () => { try { const saved = markKidxJourney(localStorage, "builds", build.id); demoStatus.textContent = saved ? "Construction terminée et enregistrée. Bravo ! Essaie maintenant un défi." : "Bravo ! La progression n’a pas pu être enregistrée."; } catch { demoStatus.textContent = "Bravo ! La progression n’a pas pu être enregistrée."; } }));
    ui.querySelector(".kx-build-side")!.append(adventure);
    ui.querySelector("[data-build-back]")!.addEventListener("click", () => showHome("builds"));
    ui.querySelector("[data-build-pdf]")!.addEventListener("click", () => {
      const original = KIDX_DOCUMENTS.find((item) => item.id === build.documentId);
      if (original) void openReader(original, build);
    });
    root.append(ui); reframe(); update();
    ui.querySelector<HTMLButtonElement>("[data-build-next]")!.focus();
  };
  const showHome = (tab: "missions" | "builds" | "library" = "missions") => {
    clear(); screen = tab;
    api.clear("kidx-workshop", "KidX · Atelier");
    const panel = document.createElement("section"); panel.className = "kx-shell"; content = panel;
    panel.innerHTML = `<header class="kx-head"><div class="kx-brand"><b>K</b><div>KidX<small>MINDSTORMS · EV3</small></div></div></header><nav class="kx-tabs" aria-label="Activités KidX"></nav><div class="kx-hero"><div><span class="kx-eyebrow">L’ATELIER DES PETITS INGÉNIEURS</span><h1></h1><p></p></div></div><div class="kx-content"></div>`;
    panel.querySelector(".kx-head")!.append(button("Quitter KidX", onExit));
    const tabs = panel.querySelector("nav")!;
    for (const [id, label] of [["missions", "Missions"], ["builds", "Construire en 3D"], ["library", "Notices LEGO"]] as const) {
      const element = button(label, () => showHome(id), `data-kidx-${id}`);
      element.setAttribute("aria-selected", String(id === tab)); tabs.append(element);
    }
    const titles = { missions: ["Un robot. Des idées. À toi de jouer.", "Prévois son trajet, assemble les blocs et regarde ton programme prendre vie."],
      builds: ["Construis ton robot, étape par étape.", "Tourne le modèle, observe les nouvelles pièces et avance à ton rythme. La notice LEGO reste à portée de main."],
      library: ["Toutes tes notices, dans l’atelier.", "Choisis un modèle ou un programme. KidX garde la dernière page lue pour reprendre facilement."] };
    panel.querySelector("h1")!.textContent = titles[tab][0]; panel.querySelector(".kx-hero p")!.textContent = titles[tab][1];
    const body = panel.querySelector<HTMLElement>(".kx-content")!;
    const grid = document.createElement("div"); grid.className = "kx-grid";
    let journey = { missions: {} as Record<string, number>, builds: {} as Record<string, number> };
    try { journey = readKidxJourney(localStorage); } catch { /* unreadable progress never blocks the workshop */ }
    const card = (title: string, subtitle: string, eyebrow: string, cover?: string) => {
      const article = document.createElement("article"); article.className = "kx-card";
      if (cover) { const image = document.createElement("img"); image.src = cover; image.alt = title; image.loading = "lazy"; article.append(image); }
      const inner = document.createElement("div"); inner.className = "kx-card-body";
      const small = document.createElement("small"); small.textContent = eyebrow;
      const heading = document.createElement("h2"); heading.textContent = title;
      const description = document.createElement("p"); description.textContent = subtitle;
      inner.append(small, heading, description); article.append(inner); grid.append(article);
      return { article, inner };
    };
    if (tab === "missions") {
      KIDX_MISSIONS.forEach((mission, index) => {
        const { article, inner } = card(mission.title, mission.objective, `${journey.missions[mission.id] ? "✓ RÉUSSIE · " : ""}MISSION ${String(index + 1).padStart(2, "0")} · ${mission.skill}`);
        const glyph = document.createElement("div"); glyph.className = "kx-glyph"; glyph.textContent = mission.glyph; article.prepend(glyph);
        const play = button("Programmer le robot →", () => startMission(mission)); play.dataset.kidxMission = mission.id; inner.append(play);
        if (mission.build) { const build = KIDX_BUILDS.find(b => b.id === mission.build)!; const link = button(`Construire ${build.label}`, () => showBuild(build)); link.className = "kx-secondary"; inner.append(link); }
      });
      const source = document.createElement("p"); source.className = "kx-source";
      source.append("Exercices KidX inspirés des déplacements et virages de Robot Trainer. ");
      const link = document.createElement("a"); link.href = KIDX_LESSON_SOURCE; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Voir l’activité LEGO originale ↗"; source.append(link);
      body.append(source, grid);
      const { inner } = card("Les engrenages en mouvement", "Observe deux vraies pièces LEGO : 8 et 24 dents. Ralentis, change le sens du moteur et compte les tours.", "COMPRENDRE EN 3D · 12 SECONDES");
      inner.append(button("▶ Montre-moi les engrenages", showMechanism, "data-kidx-mechanism"));
    } else if (tab === "builds") {
      for (const build of KIDX_BUILDS) {
        const original = KIDX_DOCUMENTS.find((item) => item.id === build.documentId)!;
        const { inner } = card(build.label, build.subtitle, `${journey.builds[build.id] ? "✓ CONSTRUIT · " : ""}${build.steps.length} ÉTAPES EN 3D · KIT 31313`, original.coverUrl);
        const open = button("Construire en 3D →", () => showBuild(build)); open.dataset.kidxBuild = build.id; inner.append(open);
      }
      const { inner } = card("Les autres modèles", "Tu peux construire ces modèles avec leur notice LEGO. Leur guide en 3D n’est pas encore disponible.", `${KIDX_DOCUMENTS.filter((item) => item.kind === "build").length} NOTICES DE CONSTRUCTION`);
      inner.append(button("Parcourir les notices", () => showHome("library")));
      body.append(grid);
    } else {
      const filters = document.createElement("div"); filters.className = "kx-filters";
      const search = document.createElement("input"); search.type = "search"; search.placeholder = "Chercher un robot, un mécanisme…"; search.setAttribute("aria-label", "Chercher une notice");
      const family = document.createElement("select"); family.setAttribute("aria-label", "Famille de modèles");
      const kind = document.createElement("select"); kind.setAttribute("aria-label", "Type de notice");
      for (const value of ["", ...new Set(KIDX_DOCUMENTS.map((item) => item.family))]) family.add(new Option(value || "Toutes les familles", value));
      for (const [value, label] of [["", "Tous les documents"], ["build", "Constructions"], ["program", "Programmes"], ["reference", "Références"]]) kind.add(new Option(label, value));
      filters.append(search, family, kind);
      const count = document.createElement("p"); count.className = "kx-count"; count.setAttribute("role", "status");
      let progress: Record<string, number> = {}; try { progress = readKidxProgress(localStorage); } catch { /* optional */ }
      const render = () => {
        grid.replaceChildren(); const documents = findKidxDocuments(search.value, family.value, kind.value);
        count.textContent = `${documents.length} document${documents.length > 1 ? "s" : ""}`;
        for (const item of documents) {
          const { inner } = card(item.title, `${item.pages} pages${progress[item.id] ? ` · Reprendre à la page ${progress[item.id]}` : ""}`,
            `${item.family} · ${item.kind === "program" ? "PROGRAMME" : item.kind === "build" ? "CONSTRUCTION" : "RÉFÉRENCE"}`, item.coverUrl);
          const open = button(progress[item.id] ? "Reprendre la notice →" : "Ouvrir la notice →", () => { void openReader(item); });
          open.dataset.kidxDocument = item.id; inner.append(open);
        }
        if (!documents.length) { const empty = document.createElement("p"); empty.className = "kx-empty"; empty.textContent = "Aucune notice trouvée. Essaie un autre mot ou une autre famille."; grid.append(empty); }
      };
      search.addEventListener("input", render); family.addEventListener("change", render); kind.addEventListener("change", render);
      body.append(filters, count, grid); render();
    }
    root.append(panel); panel.querySelector<HTMLButtonElement>(`[data-kidx-${tab}]`)!.focus();
  };
  const showMechanism = () => {
    clear(); screen = "mechanism";
    const demo = mountKidxMechanismDemo(root, api, options.frameView, () => showHome("missions"));
    reframe = demo.reframe;
    let deterministic = false;
    const unsubscribe = options.subscribeFrame(delta => { if (!deterministic) demo.advance(delta); });
    advanceDetail = delta => { deterministic = true; demo.advance(delta); };
    detailState = demo.state;
    disposeDetail = () => { unsubscribe(); demo.dispose(); };
  };
  const resize = () => reframe(); window.addEventListener("resize", resize);
  const route = new URLSearchParams(location.search);
  const requestedBuild = KIDX_BUILDS.find(build => build.id === route.get("model"));
  if (route.get("view") === "build" && requestedBuild) showBuild(requestedBuild);
  else if (route.get("view") === "atelier") showHome("missions");
  else startMission(activeMission);
  const state = () => strip ? { ...strip.state(), screen, missionId: activeMission.id } : {
    screen, build: screen === "build" && activeBuild ? { id: activeBuild.id, step: buildStep + 1, steps: activeBuild.steps.length, exploded, angle } : null,
    reader: screen === "reader" ? detailState?.() ?? null : null,
    construction: screen === "build" ? detailState?.() ?? null : null,
    mechanism: screen === "mechanism" ? detailState?.() ?? null : null,
  };
  return { state, advanceTime: (milliseconds) => {
    if (strip) return strip.advanceTime(milliseconds);
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError("Invalid elapsed time");
    for (let i = 0; i < Math.ceil(milliseconds / (1000 / 60)); i++) advanceDetail?.(1 / 60);
    return state();
  },
    dispose: () => { disposed = true; clear(); window.removeEventListener("resize", resize); } };
}

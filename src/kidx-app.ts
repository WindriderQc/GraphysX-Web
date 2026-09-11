import type { GraphysXAgentWorldApi, AgentWorldVector3, AgentWorldCommand } from "./agent-world-runtime";
import { mountEv3MissionStrip, type Ev3MissionStrip } from "./ev3-mission-strip";
import { availableKidxDocuments, findKidxDocuments, KIDX_DOCUMENTS, readKidxProgress, type KidxDocument } from "./kidx-library";
import { KIDX_BUILDS, kidxBuildEntities, kidxPartLabel, type KidxBuild } from "./kidx-builds";
import { KIDX_LESSON_SOURCE, KIDX_MISSIONS, kidxBuildScene, kidxMissionScene, type KidxMission } from "./kidx-missions";
import "./kidx-app.css";

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
    strip = mountEv3MissionStrip(root, api, () => showHome("missions"), { subscribeFrame: options.subscribeFrame, mission, french: true });
  };
  const openReader = async (item: KidxDocument, returnToBuild: KidxBuild | null = null) => {
    clear(); screen = "reader";
    api.clear("kidx-reader", "KidX · Notices LEGO");
    const token = generation;
    const [reader, local] = await Promise.all([import("./kidx-pdf-reader"), available]);
    if (disposed || token !== generation) return;
    const mounted = reader.mountKidxPdfReader(root, item, local.has(item.id), () => returnToBuild ? showBuild(returnToBuild, buildStep) : showHome("library"));
    disposeDetail = mounted.dispose; detailState = mounted.state;
  };
  const showBuild = (build: KidxBuild, initialStep?: number) => {
    clear(); screen = "build"; activeBuild = build;
    let storedStep = 0;
    try { storedStep = Number(localStorage.getItem(`graphysx:kidx:build:${build.id}:v1`) ?? 0); } catch { /* optional persistence */ }
    buildStep = Math.max(0, Math.min(build.steps.length - 1, Number.isFinite(initialStep ?? storedStep) ? Math.floor(initialStep ?? storedStep) : 0));
    exploded = false; angle = 35;
    let zoom = buildStep < 6 ? 1.35 : 1;
    const entities = kidxBuildEntities(build, buildStep);
    const receipt = api.load(kidxBuildScene(entities.slice(0, buildStep + 1)));
    if (!receipt.ok) throw new Error(receipt.error ?? "Unable to load build");
    const spawned = new Set(entities.slice(0, buildStep + 1).map((item) => item.id));
    const ui = document.createElement("section"); ui.className = "kx-build-ui"; content = ui;
    ui.innerHTML = `<header class="kx-build-bar"><button data-build-back>← Atelier</button><h1></h1><button data-build-pdf>Notice LEGO</button></header>
      <aside class="kx-build-side"><small class="kx-eyebrow">CONSTRUCTION 3D</small><h2 data-build-title></h2><div class="kx-build-progress"><i></i></div>
      <p>Ajoute les pièces mises en lumière. Tourne le modèle pour regarder les points de connexion.</p><ul data-build-pieces></ul>
      <div class="kx-card-row"><button data-build-zoom-in aria-label="Rapprocher le modèle">Zoom +</button><button data-build-zoom-out aria-label="Éloigner le modèle">Zoom −</button></div>
      <button data-build-explode>Vue éclatée</button><button data-build-complete>Voir le modèle complet</button>
      <details><summary>À propos de ce guide</summary>Assemblages issus du modèle LDraw de Philippe Hurbain. Leur ordre peut différer des pages LEGO. Vérifie les petits raccords dans la notice originale. Les câbles sont regroupés et les autocollants ne sont pas tous représentés.<br><a target="_blank" rel="noopener noreferrer" data-build-credits>Crédits des pièces et sources</a></details></aside>
      <div class="kx-build-status" role="status"></div><footer class="kx-build-footer"><button data-build-prev>← Retour</button><label>Étape <input data-build-number type="number" min="1" aria-label="Numéro d’étape"> <span></span></label><button data-build-next>Suivant →</button><button data-build-rotate aria-label="Tourner le modèle de 45 degrés">↻ Tourner</button></footer>`;
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
      options.frameView([target[0] + radius * Math.sin(radians), target[1] + radius * .8, radius * Math.cos(radians)], target, 0);
    };
    const pending = new Set<string>();
    let loadFailed = false;
    const highlight = (id: string, active: boolean): AgentWorldCommand => ({ op: "update", id,
      patch: { modelMaterialOverrides: active ? Object.fromEntries((api.state()?.entities.find((item) => item.id === id)?.materialSlots ?? [])
        .map((slot) => [slot.id, { emissive: "#63a947", emissiveIntensity: .22 }])) : null } });
    const readyStatus = () => {
      status.textContent = loadFailed ? "Une pièce n’a pas pu être chargée. Reviens à l’atelier pour réessayer."
        : buildStep === build.steps.length - 1 ? "Le modèle est assemblé ! Tu peux revoir chaque étape." : "Les pièces de l’étape actuelle sont légèrement éclairées en vert.";
    };
    let frameTime = 0;
    disposeDetail = options.subscribeFrame((delta) => {
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
    });
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
      number.value = String(buildStep + 1); title.textContent = `Assemblage ${buildStep + 1} sur ${build.steps.length}`;
      progress.style.width = `${(buildStep + 1) / build.steps.length * 100}%`;
      previous.disabled = buildStep === 0; next.disabled = buildStep === build.steps.length - 1;
      explode.textContent = exploded ? "Rassembler" : "Vue éclatée"; explode.setAttribute("aria-pressed", String(exploded));
      const inventory = new Map<string, { count: number; label: string; file: string; color: string }>();
      const colors: Record<string, string> = { "0": "noir", "1": "bleu", "4": "rouge", "7": "gris", "14": "jaune", "15": "blanc", "71": "gris clair", "72": "gris foncé" };
      for (const piece of build.steps[buildStep].pieces) {
        const key = `${piece.file}:${piece.color}`;
        const current = inventory.get(key);
        if (current) current.count++;
        else inventory.set(key, { count: 1, label: kidxPartLabel(piece.label), file: piece.file, color: colors[piece.color] ?? "" });
      }
      const list = ui.querySelector("[data-build-pieces]")!; list.replaceChildren();
      for (const item of inventory.values()) {
        const row = document.createElement("li"); row.textContent = `${item.count} × ${item.label}`;
        const code = document.createElement("small"); code.textContent = item.file.replace(/^31313 - /, "").replace(/\.dat$|\.ldr$/g, "") + (item.color ? ` · ${item.color}` : "");
        row.append(code); list.append(row);
      }
      if (pending.size) status.textContent = "Chargement des pièces 3D…"; else readyStatus();
      try { localStorage.setItem(`graphysx:kidx:build:${build.id}:v1`, String(buildStep)); }
      catch { status.textContent += " Reprise non enregistrée dans ce navigateur."; }
    };
    const go = (value: number) => { if (!Number.isFinite(value)) { update(); return; } buildStep = Math.max(0, Math.min(build.steps.length - 1, Math.floor(value))); update(); };
    previous.addEventListener("click", () => go(buildStep - 1)); next.addEventListener("click", () => go(buildStep + 1));
    number.addEventListener("change", () => go(Number(number.value) - 1));
    explode.addEventListener("click", () => { exploded = !exploded; update(); });
    ui.querySelector("[data-build-complete]")!.addEventListener("click", () => { zoom = 1; go(build.steps.length - 1); reframe(); });
    ui.querySelector("[data-build-rotate]")!.addEventListener("click", () => { angle += 45; reframe(); });
    ui.querySelector("[data-build-zoom-in]")!.addEventListener("click", () => { zoom = Math.min(2.2, zoom + .2); reframe(); });
    ui.querySelector("[data-build-zoom-out]")!.addEventListener("click", () => { zoom = Math.max(.6, zoom - .2); reframe(); });
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
    panel.querySelector(".kx-head")!.append(button("Quitter le lab", onExit));
    const tabs = panel.querySelector("nav")!;
    for (const [id, label] of [["missions", "Missions"], ["builds", "Construire en 3D"], ["library", "Notices LEGO"]] as const) {
      const element = button(label, () => showHome(id), `data-kidx-${id}`);
      element.setAttribute("aria-selected", String(id === tab)); tabs.append(element);
    }
    const titles = { missions: ["Un robot. Des idées. À toi de jouer.", "Prévois son trajet, assemble les blocs et regarde ton programme prendre vie."],
      builds: ["Construis-le, un assemblage à la fois.", "Tourne le modèle, observe les nouvelles pièces et avance à ton rythme. La notice LEGO reste à portée de main."],
      library: ["Toutes tes notices, dans l’atelier.", "Choisis un modèle ou un programme. KidX garde la dernière page lue pour reprendre facilement."] };
    panel.querySelector("h1")!.textContent = titles[tab][0]; panel.querySelector(".kx-hero p")!.textContent = titles[tab][1];
    const body = panel.querySelector<HTMLElement>(".kx-content")!;
    const grid = document.createElement("div"); grid.className = "kx-grid";
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
        const { article, inner } = card(mission.title, mission.objective, `MISSION ${String(index + 1).padStart(2, "0")} · ${mission.skill}`);
        const glyph = document.createElement("div"); glyph.className = "kx-glyph"; glyph.textContent = mission.glyph; article.prepend(glyph);
        const play = button("Programmer le robot →", () => startMission(mission)); play.dataset.kidxMission = mission.id; inner.append(play);
      });
      const source = document.createElement("p"); source.className = "kx-source";
      source.append("Exercices KidX inspirés des déplacements et virages de Robot Trainer. ");
      const link = document.createElement("a"); link.href = KIDX_LESSON_SOURCE; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Voir l’activité LEGO originale ↗"; source.append(link);
      body.append(source, grid);
    } else if (tab === "builds") {
      for (const build of KIDX_BUILDS) {
        const original = KIDX_DOCUMENTS.find((item) => item.id === build.documentId)!;
        const { inner } = card(build.label, build.subtitle, `${build.steps.length} ASSEMBLAGES 3D · KIT 31313`, original.coverUrl);
        const open = button("Construire en 3D →", () => showBuild(build)); open.dataset.kidxBuild = build.id; inner.append(open);
      }
      const { inner } = card("Les autres modèles", "Chaque PDF est déjà lisible page par page. Les autres assemblages 3D restent à décrire et à vérifier.", `${KIDX_DOCUMENTS.filter((item) => item.kind === "build").length} NOTICES DE CONSTRUCTION`);
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
  const resize = () => reframe(); window.addEventListener("resize", resize);
  if (new URLSearchParams(location.search).get("view") === "atelier") showHome("missions");
  else startMission(activeMission);
  const state = () => strip ? { ...strip.state(), screen, missionId: activeMission.id } : {
    screen, build: screen === "build" && activeBuild ? { id: activeBuild.id, step: buildStep + 1, steps: activeBuild.steps.length, exploded, angle } : null,
    reader: detailState?.() ?? null,
  };
  return { state, advanceTime: (milliseconds) => strip ? strip.advanceTime(milliseconds) : state(),
    dispose: () => { disposed = true; clear(); window.removeEventListener("resize", resize); } };
}

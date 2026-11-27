import { Box3, Line, Mesh, Raycaster, Vector2, Vector3 } from "three";
import type { PlatformHost } from "./platform-host";
import type { AgentWorldCommand, AgentWorldVector3 } from "./agent-world-runtime";
import { buildPlayground, playgroundSpin, playgroundTerrainCommands, PLAYGROUND_SOURCE_URL, PLAYGROUND_WORLD_ID, type PlaygroundSource } from "./archive-playground-scene";
import { buildDominus, dominusViewCommands, DOMINUS_SOURCE_URL, DOMINUS_WORLD_ID, type DominusSource, type DominusView } from "./archive-dominus-scene";
import "./archive-revival.css";

export type ArchiveRevivalId = "playground" | "dominus";
export type ArchiveRevivalApplication = { state: () => unknown; advanceTime: (milliseconds: number) => unknown; dispose: () => void };
type Phase = "loading" | "visit" | "foreign" | "error";
const tuple = (v: Vector3) => v.toArray() as AgentWorldVector3;
const titles = { playground: "Three.js Playground", dominus: "Dominus" };

/** Both visits author ordinary worlds. The app owns controls and camera, never scene objects. */
export function mountArchiveRevival(root: HTMLElement, host: PlatformHost, id: ArchiveRevivalId, onHome: () => void, onStudio: () => void): ArchiveRevivalApplication {
  const { api } = host, worldId = id === "playground" ? PLAYGROUND_WORLD_ID : DOMINUS_WORLD_ID;
  const previous = { title: document.title, language: document.documentElement.lang, orbit: host.orbitEnabled, fov: host.camera.fov };
  let disposed = false, creating = false, loaded = false, ready = false, phase: Phase = "loading", notice = "", prepared = false, sampledAt = performance.now();
  let source: PlaygroundSource | DominusSource | null = null, view: DominusView = new URLSearchParams(location.search).get("view") === "models" ? "models" : "source";
  let modelIds: string[] = [], frames = 0, fps = 0, pointerHit: number[] | null = null, parametersDirty = true;
  const controller = new AbortController(), compact = matchMedia("(max-width: 740px)"), reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const raycaster = new Raycaster(), pointer = new Vector2();
  document.title = titles[id] + " · GraphysX"; document.documentElement.lang = "fr"; document.body.classList.add("gx-revival-active");
  host.setOrbitEnabled(true); host.cancelCameraMove(); if (id === "playground") { host.camera.fov = 55; host.camera.updateProjectionMatrix(); }
  const surface = document.createElement("div"); surface.className = "gx-revival";
  surface.innerHTML = `<header class="gx-revival-header"><button type="button" data-revival-home>← Accueil</button><span>Archives / ${titles[id]}</span><button type="button" data-revival-studio>Ouvrir dans le Studio ↗</button></header>
    <section class="gx-revival-card" aria-labelledby="gx-revival-title"><p class="gx-revival-eyebrow">SCÈNE ET MODÈLES D’ORIGINE</p><h1 id="gx-revival-title">${titles[id]}</h1>
    <p class="gx-revival-lead">${id === "playground" ? "L’avion, les planètes et les sphères animées. Explore, ajuste, puis garde ta version dans le Studio." : "Les placements retrouvés et les 65 modèles du pack : bâtiments, végétation et personnages."}</p>
    <div class="gx-revival-actions"><button type="button" data-revival-pause>Pause</button><button type="button" data-revival-step>Un pas</button><button type="button" data-revival-frame>Tout cadrer</button></div>
    <div data-revival-specific></div>
    <p class="gx-revival-status" data-revival-status role="status">Chargement des modèles d’origine…</p>
    <details data-revival-provenance><summary>Origine et reprise</summary><div data-revival-evidence></div></details>
    <div class="gx-revival-meter"><span data-revival-fps>—</span> images/s <progress data-revival-fps-progress max="100" value="0" aria-label="Images par seconde"></progress><span data-revival-pointer></span></div></section>`;
  root.append(surface);
  const element = <T extends HTMLElement>(selector: string) => surface.querySelector<T>(selector)!;
  const card = element<HTMLElement>(".gx-revival-card"), specific = element<HTMLElement>("[data-revival-specific]"), status = element<HTMLElement>("[data-revival-status]");
  const pauseButton = element<HTMLButtonElement>("[data-revival-pause]"), stepButton = element<HTMLButtonElement>("[data-revival-step]");
  const owned = (): boolean => loaded && phase !== "foreign" && host.world.getClock().worldId === worldId;
  const apply = (commands: AgentWorldCommand[]): boolean => { if (!owned()) return false; const result = api.transaction(commands); notice = result.ok ? "" : result.error ?? "Modification refusée. Ta scène est conservée."; return result.ok; };

  const sceneBounds = (ids: string[]): Box3 => {
    const bounds = new Box3();
    for (const entityId of ids) {
      const object = host.world.getEntityObject(entityId); if (!object) continue; object.updateWorldMatrix(true, true);
      object.traverseVisible(child => {
        if (!(child instanceof Mesh) && !(child instanceof Line)) return;
        child.geometry.computeBoundingBox(); if (child.geometry.boundingBox) bounds.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
      });
    }
    return bounds;
  };
  const frame = (ids?: string[]): void => {
    if (!ready || !owned()) return;
    const entities = api.query(), byId = new Map(entities.map(e => [e.id, e]));
    const candidates = ids ?? entities.filter(e => ["model", "mesh", "spline", "box", "plane"].includes(e.type)).map(e => e.id);
    const visible = candidates.filter(candidate => {
      let entity = byId.get(candidate);
      while (entity) { if (!entity.visible) return false; entity = entity.parentId ? byId.get(entity.parentId) : undefined; }
      return byId.has(candidate);
    }), bounds = sceneBounds(visible);
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3());
    const direction = new Vector3(id === "playground" ? .7 : 1, id === "playground" ? .6 : .8, 1).normalize();
    const right = new Vector3(direction.z, 0, -direction.x).normalize(), up = new Vector3().crossVectors(direction, right).normalize();
    const rect = card.getBoundingClientRect(), top = element<HTMLElement>(".gx-revival-header").getBoundingClientRect().bottom + 14;
    const safe = compact.matches ? { left: 16, top, width: innerWidth - 32, height: Math.max(100, rect.top - top - 14) }
      : { left: rect.right + 20, top, width: Math.max(160, innerWidth - rect.right - 44), height: innerHeight - top - 28 };
    const half = size.multiplyScalar(.5), extent = (axis: Vector3) => Math.abs(axis.x) * half.x + Math.abs(axis.y) * half.y + Math.abs(axis.z) * half.z;
    const tangent = Math.tan(host.camera.fov * Math.PI / 360), aspect = host.camera.aspect;
    const distance = Math.max(8, extent(right) / (tangent * aspect * safe.width / innerWidth), extent(up) / (tangent * safe.height / innerHeight)) * 1.12 + extent(direction);
    const ndcX = (safe.left + safe.width / 2) / innerWidth * 2 - 1, ndcY = 1 - (safe.top + safe.height / 2) / innerHeight * 2;
    const target = center.clone().addScaledVector(right, -ndcX * distance * tangent * aspect).addScaledVector(up, -ndcY * distance * tangent);
    host.frameView(tuple(target.clone().addScaledVector(direction, distance)), tuple(target), 0);
  };

  const inputs = new Map<string, HTMLInputElement>();
  const parameter = (name: string, value: number): void => {
    if (!owned() || !Number.isFinite(value)) return;
    const [kind, axis] = name.split(".");
    if (kind === "camera") { const position = host.camera.position.clone(); position[axis as "x" | "y" | "z"] = value; host.frameView(tuple(position), tuple(host.orbitTarget), 0); return; }
    const targetId = kind === "cube" ? "playground-cube" : kind === "plane" ? "playground-terrain" : `playground-${kind}`;
    if (axis === "speedX" || axis === "speedY") {
      const target = api.query({ ids: [targetId] })[0]; if (!target) return;
      const spinId = kind === "cube" ? `source-cube-${axis === "speedX" ? "x" : "y"}` : axis === "speedX" ? "adapted-planet-x" : "source-planet-y";
      const commands: AgentWorldCommand[] = [];
      if (target.behaviors.some(b => b.id === spinId)) commands.push({ op: "detach-behavior", id: targetId, behaviorId: spinId });
      commands.push({ op: "attach-behavior", id: targetId, behavior: playgroundSpin(spinId, axis === "speedX" ? "x" : "y", value) });
      apply(commands);
    } else if (kind === "plane" && (axis === "width" || axis === "height")) {
      const document = api.exportDocument(); if (!document) return;
      const tags = document.entities.find(e => e.id === targetId)?.tags ?? [];
      const readSize = (key: string) => Number(tags.find(t => t.startsWith(`playground-${key}:`))?.split(":")[1] ?? 10);
      apply(playgroundTerrainCommands(document, axis === "width" ? value : readSize("width"), axis === "height" ? value : readSize("height")));
    } else if (kind === "plane") {
      const target = api.query({ ids: [targetId] })[0]; if (!target) return;
      const position = [...target.position] as AgentWorldVector3; position[["x", "y", "z"].indexOf(axis)] = value;
      apply([{ op: "update", id: targetId, patch: { transform: { position } } }]);
    }
    render();
  };

  if (id === "playground") {
    specific.innerHTML = `<div class="gx-revival-actions"><button type="button" data-playground-focus="airplane">Voir l’avion</button><button type="button" data-playground-focus="morph">Voir les sphères</button></div><details data-playground-controls><summary>Ajuster l’expérience</summary><div data-playground-inputs></div><p class="gx-revival-help">Les trois rotations X des planètes sont une option actuelle : leur calcul était commenté dans la source.</p></details>`;
    const controls = element<HTMLElement>("[data-playground-inputs]");
    const definitions: [string, string, number, number, number][] = [
      ...["x", "y", "z"].map(axis => [`camera.${axis}`, `Caméra ${axis.toUpperCase()}`, -1000, 1000, 0] as [string, string, number, number, number]),
      ["cube.speedX", "Cube · rotation X", 1, 3600, 2000], ["cube.speedY", "Cube · rotation Y", 1, 3600, 1000],
      ["plane.width", "Terrain · largeur", 1, 100, 10], ["plane.height", "Terrain · profondeur", 1, 100, 10],
      ...["x", "y", "z"].map(axis => [`plane.${axis}`, `Terrain · position ${axis.toUpperCase()}`, -100, 100, 0] as [string, string, number, number, number]),
      ...["earth", "mars", "moon"].flatMap((planet, i) => [[`${planet}.speedX`, `${["Earth", "Mars", "Moon"][i]} · rotation X (option)`, 1, 3600, 2000], [`${planet}.speedY`, `${["Earth", "Mars", "Moon"][i]} · rotation Y`, 1, 3600, 1000]] as [string, string, number, number, number][]),
    ];
    for (const [name, label, min, max, value] of definitions) {
      const row = document.createElement("label"), caption = document.createElement("span"), output = document.createElement("output"), input = document.createElement("input");
      caption.textContent = label; output.textContent = String(value); input.type = "range"; input.min = String(min); input.max = String(max); input.step = "1"; input.value = String(value); input.dataset.playgroundParam = name;
      input.addEventListener("input", () => { output.textContent = input.value; parameter(name, Number(input.value)); }); row.append(caption, output, input); controls.append(row); inputs.set(name, input);
    }
    specific.querySelectorAll<HTMLButtonElement>("[data-playground-focus]").forEach(button => button.addEventListener("click", () => {
      const ids = button.dataset.playgroundFocus === "airplane" ? ["playground-airplane"] : [0, 1, 2].map(i => `playground-morph-${i}`); api.select(ids); frame(ids);
    }));
  } else {
    specific.innerHTML = `<div class="gx-revival-views" role="group" aria-label="Composition Dominus"><button type="button" data-dominus-view="source">Placements d’origine</button><button type="button" data-dominus-view="models">Les 65 modèles</button></div><p class="gx-revival-help" data-dominus-context></p><label class="gx-revival-model-picker">Choisir un modèle<select data-dominus-model aria-label="Modèle Dominus"></select></label><button type="button" data-dominus-focus>Cadrer le modèle</button>`;
    specific.querySelectorAll<HTMLButtonElement>("[data-dominus-view]").forEach(button => button.addEventListener("click", () => {
      const next = button.dataset.dominusView as DominusView;
      if (apply(dominusViewCommands(next))) { view = next; const url = new URL(location.href); url.searchParams.set("view", view); history.replaceState(null, "", url); populateModels(); render(); frame(); }
    }));
    element<HTMLButtonElement>("[data-dominus-focus]").addEventListener("click", () => {
      const selected = element<HTMLSelectElement>("[data-dominus-model]").value; if (!selected || !owned()) return;
      const target = `dominus-${view === "source" ? "source" : "gallery"}-${selected}-model`; api.select([target]); frame([target]);
    });
  }

  const populateModels = (): void => {
    if (id !== "dominus" || !source) return;
    const data = source as DominusSource, select = element<HTMLSelectElement>("[data-dominus-model]"), previousValue = select.value;
    select.replaceChildren(); const models = view === "source" ? data.models.filter(m => data.portPlacements.some(p => p.name.toLowerCase() === m.id)) : data.models;
    for (const model of models) { const option = document.createElement("option"); option.value = model.id; option.textContent = model.name + (model.recovery === "decoded-binary-x" ? " · récupéré du binaire" : ""); select.append(option); }
    if (models.some(m => m.id === previousValue)) select.value = previousValue;
    element<HTMLElement>("[data-dominus-context]").textContent = view === "source" ? "Les 28 placements conservés d’ObjectLibrary. Ce travail était un projet d’environnement en cours." : "Tous les modèles d’origine, disposés ici pour les inspecter et les modifier.";
  };

  const render = (): void => {
    if (disposed) return;
    if (loaded && host.world.getClock().worldId !== worldId) phase = "foreign";
    if (owned()) {
      const models = api.query({ ids: modelIds }); ready = models.every(e => e.asset?.status === "ready");
      const error = models.find(e => e.asset?.status === "error"); if (error) { phase = "error"; notice = "Un modèle n’a pas pu être chargé. Ouvre le Studio pour conserver la scène."; }
      else if (ready) phase = "visit";
    }
    const disabled = !owned() || !ready, paused = host.world.getClock().paused;
    surface.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(".gx-revival-actions button, [data-revival-specific] button, input, select").forEach(button => { button.disabled = disabled; });
    pauseButton.textContent = paused ? "Animer" : "Pause"; stepButton.disabled = disabled || !paused;
    status.textContent = phase === "foreign" ? "Une autre scène est ouverte. Le Studio la conservera." : notice || (ready ? id === "playground" ? "9 fichiers d’origine · animations sur la même horloge que le Studio" : "65 modèles décodés · 28 placements d’origine · 2 modèles binaires retrouvés" : "Chargement des modèles d’origine…");
    status.classList.toggle("gx-revival-error", phase === "error");
    if (id === "dominus") {
      if (owned()) {
        const roots = api.query({ ids: ["dominus-source", "dominus-models"] });
        const sourceVisible = roots.find(e => e.id === "dominus-source")?.visible, modelsVisible = roots.find(e => e.id === "dominus-models")?.visible;
        const inferred = sourceVisible && !modelsVisible ? "source" : modelsVisible && !sourceVisible ? "models" : view;
        if (inferred !== view) { view = inferred; populateModels(); }
      }
      specific.querySelectorAll<HTMLButtonElement>("[data-dominus-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.dominusView === view)));
    }
    if (id === "playground" && owned()) {
      for (const axis of ["x", "y", "z"] as const) { const input = inputs.get(`camera.${axis}`)!; if (document.activeElement !== input) { input.value = String(host.camera.position[axis]); input.previousElementSibling!.textContent = String(Math.round(host.camera.position[axis])); } }
      if (parametersDirty) {
        // Query states expose behavior identities, while the document owns their settings.
        // Read it only after edits, never as part of the per-frame animation path.
        const targets = api.exportDocument()?.entities ?? [];
        for (const [name, input] of inputs) {
          if (document.activeElement === input || name.startsWith("camera.")) continue;
          const [kind, axis] = name.split("."), target = targets.find(e => e.id === (kind === "plane" ? "playground-terrain" : `playground-${kind}`));
          if (!target) continue;
          let value: number;
          if (axis === "speedX" || axis === "speedY") {
            const spin = target.behaviors?.find(b => b.type === "spin" && b.axis === (axis === "speedX" ? "x" : "y"));
            value = spin?.type === "spin" && spin.speedDegrees ? 1000 * 180 / Math.PI / spin.speedDegrees : axis === "speedX" ? 2000 : 1000;
          } else if (axis === "width" || axis === "height") value = Number(target.tags?.find(t => t.startsWith(`playground-${axis}:`))?.split(":")[1] ?? 10);
          else value = target.transform?.position?.[["x", "y", "z"].indexOf(axis)] ?? 0;
          input.value = String(value); input.previousElementSibling!.textContent = String(Math.round(value * 10) / 10);
        }
        parametersDirty = false;
      }
    }
    const meter = element<HTMLElement>("[data-revival-fps]"); meter.textContent = String(fps); meter.style.color = fps < 35 ? "red" : fps <= 41 ? "deepskyblue" : "black";
    element<HTMLProgressElement>("[data-revival-fps-progress]").value = fps;
    element<HTMLElement>("[data-revival-pointer]").textContent = pointerHit ? `· terrain ${pointerHit.map(n => n.toFixed(1)).join(", ")}` : "";
  };

  element<HTMLButtonElement>("[data-revival-home]").addEventListener("click", onHome);
  element<HTMLButtonElement>("[data-revival-studio]").addEventListener("click", () => { if (owned()) api.pause(true); onStudio(); });
  pauseButton.addEventListener("click", () => { if (owned()) api.pause(!host.world.getClock().paused); render(); });
  stepButton.addEventListener("click", () => { if (owned() && host.world.getClock().paused) api.step(1 / 60); render(); });
  element<HTMLButtonElement>("[data-revival-frame]").addEventListener("click", () => frame());
  surface.querySelectorAll("details").forEach(details => details.addEventListener("toggle", () => { if (ready) frame(); }));
  const resize = () => { if (ready && owned()) frame(); };
  const preference = () => { if (reduced.matches && owned()) { api.pause(true); render(); } };
  const hit = (event: PointerEvent): void => {
    if (id !== "playground" || !ready || !owned()) return;
    const terrain = host.world.getEntityObject("playground-terrain"); if (!terrain) return;
    pointer.set(event.clientX / innerWidth * 2 - 1, 1 - event.clientY / innerHeight * 2); raycaster.setFromCamera(pointer, host.camera);
    const intersection = raycaster.intersectObject(terrain, true).find(result => result.object.visible); pointerHit = intersection ? intersection.point.toArray() : null;
  };
  window.addEventListener("resize", resize); reduced.addEventListener("change", preference); host.renderer.domElement.addEventListener("pointermove", hit);
  const unsubscribeEvents = host.world.subscribeEvents(event => {
    parametersDirty = true;
    if (event.type === "world.loaded" && !creating && event.data.reason === "replace") { phase = "foreign"; ready = false; host.cancelCameraMove(); render(); }
  });
  const unsubscribeFrame = host.subscribeFrame(() => {
    if (disposed) return; frames++; const now = performance.now(), elapsed = now - sampledAt;
    if (elapsed < 200) return;
    fps = Math.round(frames * 1000 / elapsed); frames = 0; sampledAt = now;
    render(); if (ready && owned() && !prepared) { prepared = true; frame(); }
  });
  void fetch(id === "playground" ? PLAYGROUND_SOURCE_URL : DOMINUS_SOURCE_URL, { signal: controller.signal }).then(async response => {
    if (!response.ok) throw new Error(`Source HTTP ${response.status}`); return await response.json() as PlaygroundSource | DominusSource;
  }).then(data => {
    if (disposed || phase === "foreign") return; source = data;
    const definition = id === "playground" ? buildPlayground(data as PlaygroundSource) : buildDominus(data as DominusSource, view);
    creating = true; let result; try { result = api.create(definition); } finally { creating = false; }
    if (!result.ok) throw new Error(result.error ?? "Impossible d’ouvrir la scène d’origine");
    loaded = true; modelIds = definition.entities.filter(e => e.type === "model").map(e => e.id!);
    host.applyEnvironment(); api.pause(reduced.matches); populateModels();
    const evidence = element<HTMLElement>("[data-revival-evidence]");
    for (const [label, rows] of [["Conservé", data.evidence.faithful], ["Adapté au moteur actuel", data.evidence.adapted], ["Limite de la source", data.evidence.unestablished]] as const) {
      const title = document.createElement("strong"), list = document.createElement("ul"); title.textContent = label;
      for (const text of rows) { const item = document.createElement("li"); item.textContent = text; list.append(item); } evidence.append(title, list);
    }
    render();
  }).catch((error: unknown) => { if (!disposed && phase !== "foreign") { phase = "error"; notice = error instanceof Error ? error.message : String(error); render(); } });

  const state = () => ({ id, phase, ready: owned() && ready, framed: prepared, view: id === "dominus" ? view : "source", notice, fps, pointerHit,
    camera: { position: host.camera.position.toArray(), target: host.orbitTarget.toArray() }, models: api.query({ ids: modelIds }).map(e => ({ id: e.id, status: e.asset?.status })),
    source: source?.evidence ?? null, parameterCount: inputs.size });
  render();
  return { state, advanceTime: milliseconds => { if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError("advanceTime requires non-negative milliseconds"); if (owned() && !host.world.getClock().paused) api.step(Math.min(milliseconds, 60000) / 1000); render(); return state(); },
    dispose: () => { if (disposed) return; disposed = true; controller.abort(); unsubscribeEvents(); unsubscribeFrame(); window.removeEventListener("resize", resize); reduced.removeEventListener("change", preference); host.renderer.domElement.removeEventListener("pointermove", hit); host.cancelCameraMove(); host.setOrbitEnabled(previous.orbit); host.camera.fov = previous.fov; host.camera.updateProjectionMatrix(); document.title = previous.title; document.documentElement.lang = previous.language; document.body.classList.remove("gx-revival-active"); surface.remove(); },
  };
}

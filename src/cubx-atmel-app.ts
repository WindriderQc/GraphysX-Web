import { Raycaster, Vector2, Vector3 } from "three";
import type { PlatformHost } from "./platform-host";
import type { AgentWorldCommand } from "./agent-world-runtime";
import { ATMEL_CLOCKS, ATMEL_MACHINE, atmelClock, atmelSequence, atmelState, atmelStudioPose, buildCubxAtmel, loadCubxAtmelSource, resetAtmel, updateAtmelClock, type AtmelClockId } from "./cubx-atmel-scene";
import "./cubz-menu.css";
import "./cubx-atmel.css";

const localTime = () => { const now = new Date(); return [now.getHours(), now.getMinutes()].map(value => String(value).padStart(2, "0")).join(":"); };
export async function mountCubxAtmel(root: HTMLElement, host: PlatformHost, onExit: () => void, onStudio: () => void, canNavigate: () => boolean = () => true) {
  const surface = document.createElement("main"); surface.className = "gx-cubz gx-atmel";
  surface.setAttribute("aria-label", "CubX · accueil Atmel retrouvé");
  surface.innerHTML = '<div class="gx-cubz-loading" role="status">Ouverture de la scène d’accueil Atmel…</div>'; root.append(surface);
  const initialWorld = host.api.state();
  const data = await loadCubxAtmelSource().catch(error => { surface.remove(); throw error; });
  if (!canNavigate() || host.api.state()?.world.id !== initialWorld?.world.id || host.api.state()?.revision !== initialWorld?.revision) { surface.remove(); throw new DOMException("The world changed while loading the archive", "AbortError"); }
  const { api } = host, created = api.create(buildCubxAtmel(data, localTime()));
  if (!created.ok) { surface.remove(); throw new Error(created.error ?? "Cannot open the native Atmel scene"); }
  api.pause(true); host.applyEnvironment();
  const previousTitle = document.title, previousLanguage = document.documentElement.lang;
  document.title = "CubX · l’accueil Atmel retrouvé · GraphysX"; document.documentElement.lang = "fr";
  let snapshot = api.exportDocument()!, revision = api.state()?.revision, disposed = false, notice = "", lastPhase = "", view: "menu" | "overview" | "panel" = "menu";
  const compact = matchMedia("(max-width: 740px)"), reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const route = (app: string, sourceView?: string) => { const url = new URL(import.meta.env.BASE_URL, location.href); url.searchParams.set("app", app); if (sourceView) url.searchParams.set("view", sourceView); const store = new URLSearchParams(location.search).get("store"); if (store) url.searchParams.set("store", store); return url.pathname + url.search; };
  surface.innerHTML = `
    <header class="gx-cubz-header"><button type="button" data-atmel-exit>← Accueil</button><span>GraphysX <i>/</i> Archives <i>/</i> CubX Atmel</span><button type="button" data-atmel-frame>Recentrer</button></header>
    <div class="gx-cubz-caption" aria-hidden="true"><span>UN ACCUEIL RETROUVÉ</span><b>Les pièces. Les gestes. Le monde autour.</b></div>
    <section class="gx-cubz-card" aria-labelledby="gx-atmel-title">
      <div class="gx-cubz-kicker">CUBX ATMEL <span>LA SCÈNE COMPOSÉE</span></div><h1 id="gx-atmel-title">L’accueil<br>reprend vie.</h1>
      <p class="gx-cubz-intro">Le menu animé, sa Terre et ses afficheurs d’origine. Ouvre un des huit cubes ou explore la scène autour.</p>
      <nav class="gx-atmel-views" aria-label="Explorer l’accueil Atmel"><button type="button" data-atmel-view="menu" aria-pressed="true">Les huit cubes</button><button type="button" data-atmel-view="overview" aria-pressed="false">L’accueil complet</button><button type="button" data-atmel-view="panel" aria-pressed="false">Le panneau Atmel</button></nav>
      <fieldset class="gx-cubz-choices"><legend>Quel cube veux-tu ouvrir ?</legend><div>${Array.from({ length: 8 }, (_, i) => `<button type="button" data-atmel-choice="${i + 1}" aria-label="Ouvrir le cube ${i + 1}" aria-pressed="false"><small>CUBE</small><b>0${i + 1}</b></button>`).join("")}</div></fieldset>
      <div class="gx-cubz-status"><span data-atmel-status role="status"></span><div class="gx-cubz-progress" aria-hidden="true"><i></i></div></div>
      <section class="gx-cubz-inside" data-atmel-inside hidden aria-labelledby="gx-atmel-open"><h2 id="gx-atmel-open">Le menu est ouvert.</h2><p>Ces destinations actuelles prolongent la reprise.</p><div><button type="button" data-atmel-panel>Régler les afficheurs</button><a data-atmel-destination href="${route("impreza")}">Retrouver l’Impreza ↗</a><a data-atmel-destination href="${route("flightx")}">Voler dans FlightX ↗</a><button type="button" data-atmel-studio>Modifier dans le Studio ↗</button></div></section>
      <div class="gx-cubz-controls"><button type="button" data-atmel-close disabled>Refermer</button><button type="button" data-atmel-pause disabled>Pause</button><button type="button" data-atmel-skip disabled>Aller au résultat</button></div>
      <div class="gx-cubz-secondary"><button type="button" data-atmel-saver>Rotation d’attente</button><button type="button" data-atmel-reset>Revenir aux huit cubes</button></div>
      <section class="gx-atmel-panel" data-atmel-clock-panel hidden aria-labelledby="gx-atmel-clocks"><h2 id="gx-atmel-clocks">Les afficheurs d’origine.</h2><p>Les chiffres et le panneau sont retrouvés. Ces réglages modifient l’aperçu local.</p><div>${ATMEL_CLOCKS.filter(id => id !== "main").map(id => `<label>${{ "light-on": "Lumière · démarrage", "light-off": "Lumière · arrêt", "fan-on": "Ventilateur · démarrage", "fan-off": "Ventilateur · arrêt" }[id]}<input type="time" data-atmel-time="${id}" value="11:11" step="60"></label>`).join("")}</div><div class="gx-atmel-indicators"><button type="button" data-atmel-indicator="light">Lumière · aperçu</button><button type="button" data-atmel-indicator="fan">Ventilateur · aperçu</button></div><p>Aucune commande n’est envoyée à une carte physique. Le lettrage température est retrouvé ; aucune sonde n’est raccordée.</p></section>
      <button type="button" class="gx-cubz-studio" data-atmel-studio>Emporter cette scène dans le Studio ↗</button>
      <button type="button" class="gx-atmel-clock-refresh" data-atmel-clock-refresh>Capturer l’heure locale dans l’horloge 3D</button>
      <p class="gx-cubz-note" data-atmel-note role="status"></p>
      <details class="gx-cubz-source"><summary>Les sources et les adaptations</summary><p><b>Retrouvé :</b> l’assemblage fermé, les huit volumes de sélection, les sept rotations Get, l’ouverture, le terrain et les modèles de l’accueil, le panneau Atmel et les chiffres 3D. Les autres études Rot et l’ouverture isolée restent conservées dans les données sources.</p><p><b>Corrigé :</b> le premier cube est déjà devant ; les autres utilisent Get2 à Get8. Les quaternions passifs sont convertis au même endroit que ceux de CubZ. Fermer inverse les mêmes pistes. L’attente fait tourner l’ensemble solidaire.</p><p><b>Adapté :</b> éclairage, matériaux PBR, caméra et navigation. L’horloge 3D capture l’heure à l’ouverture ou sur demande ; ses chiffres sont modifiables et se conservent dans la scène. Le terrain est rééchantillonné et l’envoi matériel des anciens contrôles n’est pas raccordé.</p><p>Les huit volumes de sélection de cette famille sont distincts des 32 boutons internes CubZ encore non retrouvés. Les destinations affichées ici sont actuelles.</p><a href="${route("cubx")}" data-atmel-destination>Revoir le menu mécanique CubZ →</a></details>
      <p class="gx-cubz-help">Les cubes se choisissent aussi dans la vue 3D.<br>Glisse pour explorer · molette pour zoomer.</p>
    </section>`;
  const find = <T extends HTMLElement = HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const observe = (clock = api.state()) => { const next = clock?.revision; if (next !== revision) { const current = api.exportDocument(); if (current) snapshot = current; revision = next; } };
  const state = (clock = api.state()) => atmelState(clock ? snapshot : null, clock?.elapsedSeconds ?? 0);
  const frame = (arrival = false) => {
    const camera = view === "panel" ? { position: [-24, 14, compact.matches ? 145 : 85] as [number, number, number], target: [-24, 12, 0] as [number, number, number] } : view === "overview"
      ? { position: [-42, compact.matches ? 70 : 55, compact.matches ? 180 : 100] as [number, number, number], target: [0, 15, 0] as [number, number, number] }
      : { position: [-6, 20, 9] as [number, number, number], target: [-12, 15, 0] as [number, number, number] };
    // Frame the subject in the exposed canvas, keeping authored geometry clear of the card.
    const width = innerWidth, height = innerHeight, card = find(".gx-cubz-card").getBoundingClientRect();
    const stacked = card.left < width * .15 && card.top > height * .3;
    const top = stacked ? find(".gx-cubz-caption").getBoundingClientRect().bottom + 16 : 85;
    const focusX = stacked ? width / 2 : (24 + card.left - 20) / 2, focusY = (top + (stacked ? card.top - 16 : height - 100)) / 2;
    const position = new Vector3(...camera.position), target = new Vector3(...camera.target), forward = target.clone().sub(position).normalize();
    const right = forward.clone().cross(new Vector3(0, 1, 0)).normalize(), up = right.clone().cross(forward);
    const unit = 2 * position.distanceTo(target) * Math.tan(host.camera.fov * Math.PI / 360) / height;
    const shift = right.multiplyScalar((width / 2 - focusX) * unit).add(up.multiplyScalar((focusY - height / 2) * unit));
    camera.position = position.add(shift).toArray(); camera.target = target.add(shift).toArray();
    if (arrival && !reduced.matches) host.framePath([{ position: [-16, 25, 16], target: [-12, 15, 0] }, camera], 1.4);
    else host.frameView(camera.position, camera.target, 0);
  };
  const refresh = () => {
    const clock = api.state(); observe(clock); const current = state(clock), unavailable = current.phase === "unavailable", paused = clock?.paused ?? true;
    const busy = ["aligning", "rotating", "opening", "closing", "returning"].includes(current.phase);
    surface.dataset.phase = current.phase; surface.dataset.view = view;
    const phaseLabel: Partial<Record<typeof current.phase, string>> = { aligning: "mise en place", rotating: "rotation", opening: "ouverture", opened: "menu ouvert", closing: "fermeture", returning: "retour" };
    const text = unavailable ? "La scène a changé. Continue dans le Studio." : current.phase === "idle" ? "Choisis un cube, ou explore l’accueil complet." : current.phase === "saver" ? "Rotation d’attente · toutes les pièces restent solidaires." : `Cube ${current.choice} · ${phaseLabel[current.phase]}${busy && paused ? " · en pause" : ""}.`;
    if (find("[data-atmel-status]").textContent !== text) find("[data-atmel-status]").textContent = text;
    find(".gx-cubz-progress i").style.width = `${current.progress * 100}%`;
    surface.querySelectorAll<HTMLButtonElement>("[data-atmel-choice]").forEach(button => { button.disabled = unavailable || view === "panel" || !["idle", "saver"].includes(current.phase); button.setAttribute("aria-pressed", String(Number(button.dataset.atmelChoice) === current.choice)); });
    surface.querySelectorAll<HTMLButtonElement>("[data-atmel-view]").forEach(button => { button.disabled = unavailable; button.setAttribute("aria-pressed", String(button.dataset.atmelView === view)); });
    find("[data-atmel-inside]").hidden = current.phase !== "opened" || view === "panel";
    find("[data-atmel-clock-panel]").hidden = view !== "panel" || unavailable;
    find<HTMLButtonElement>("[data-atmel-close]").disabled = current.phase !== "opened";
    find<HTMLButtonElement>("[data-atmel-pause]").disabled = !busy && current.phase !== "saver";
    find("[data-atmel-pause]").textContent = paused ? "Reprendre" : "Pause";
    find<HTMLButtonElement>("[data-atmel-skip]").disabled = !busy;
    find<HTMLButtonElement>("[data-atmel-saver]").disabled = unavailable || !["idle", "saver"].includes(current.phase);
    find<HTMLButtonElement>("[data-atmel-reset]").disabled = unavailable;
    find<HTMLButtonElement>("[data-atmel-clock-refresh]").disabled = unavailable;
    for (const button of surface.querySelectorAll<HTMLButtonElement>("[data-atmel-indicator]")) {
      const indicator = clock?.entities.find(entity => entity.id === `atmel-${button.dataset.atmelIndicator}-indicator`);
      const active = indicator?.materialSlots?.some(slot => slot.color === "#63d3a2") ?? false;
      button.disabled = unavailable || indicator?.asset?.status !== "ready";
      button.setAttribute("aria-pressed", String(active));
      button.textContent = `${button.dataset.atmelIndicator === "light" ? "Lumière" : "Ventilateur"} · ${active ? "actif" : "inactif"}`;
    }
    for (const input of surface.querySelectorAll<HTMLInputElement>("[data-atmel-time]")) if (document.activeElement !== input) input.value = atmelClock(snapshot, input.dataset.atmelTime as AtmelClockId);
    if (find("[data-atmel-note]").textContent !== notice) find("[data-atmel-note]").textContent = notice;
    if (current.phase === "opened" && lastPhase !== "opened" && view !== "panel") find("[data-atmel-inside]").scrollIntoView({ block: "nearest" });
    lastPhase = current.phase;
  };
  const apply = (commands: AgentWorldCommand[]) => { const result = api.transaction(commands); notice = result.ok ? "" : "La commande n’a pas pu s’appliquer. La scène est conservée."; observe(); refresh(); return result.ok; };
  const setView = (next: typeof view) => {
    observe(); if (state().phase === "unavailable") return;
    if (apply([{ op: "update", id: "atmel-main", patch: { visible: next !== "panel" } }, { op: "update", id: "atmel-controls", patch: { visible: next === "panel" } }])) { view = next; refresh(); frame(); if (next === "panel") find("[data-atmel-clock-panel]").scrollIntoView({ block: "nearest" }); }
  };
  const play = (mode: "open" | "return" | "saver", choice: number) => {
    observe(); if (state().phase === "unavailable") return;
    if (view !== "menu") setView("menu");
    const rotation = api.query({ ids: [ATMEL_MACHINE] })[0]?.rotationDegrees;
    if (apply(atmelSequence(data, snapshot, mode, choice, api.state()?.elapsedSeconds ?? 0, rotation))) api.pause(false);
    refresh();
  };
  const studio = () => {
    api.pause(true); observe(); const current = api.exportDocument(); if (!current) { onStudio(); return; }
    if (atmelState(current, api.state()?.elapsedSeconds ?? 0).phase !== "unavailable") {
      const copy = api.create(atmelStudioPose(current, api.state()?.elapsedSeconds ?? 0));
      if (!copy.ok) { notice = "La copie n’a pas pu s’ouvrir. La scène est conservée."; refresh(); return; }
    }
    api.pause(true); onStudio();
  };
  const captureClock = () => { observe(); if (state().phase !== "unavailable") apply(updateAtmelClock(data, snapshot, "main", localTime())); };
  const toggleIndicator = (channel: string) => {
    observe(); if (state().phase === "unavailable" || !["light", "fan"].includes(channel)) return;
    const id = `atmel-${channel}-indicator`, current = api.query({ ids: [id] })[0];
    if (current?.materialSlots?.length) {
      const color = current.materialSlots.some(slot => slot.color === "#63d3a2") ? "#ffdf55" : "#63d3a2";
      apply([{ op: "update", id, patch: { modelMaterialOverrides: Object.fromEntries(current.materialSlots.map(slot => [slot.id, { color }])) } }]);
    }
  };
  surface.querySelectorAll<HTMLButtonElement>("[data-atmel-choice]").forEach(button => button.addEventListener("click", () => { if (["idle", "saver"].includes(state().phase)) play("open", Number(button.dataset.atmelChoice)); }));
  surface.querySelectorAll<HTMLButtonElement>("[data-atmel-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.atmelView as typeof view)));
  surface.querySelectorAll<HTMLButtonElement>("[data-atmel-studio]").forEach(button => button.addEventListener("click", studio));
  surface.querySelectorAll<HTMLButtonElement>("[data-atmel-indicator]").forEach(button => button.addEventListener("click", () => toggleIndicator(button.dataset.atmelIndicator!)));
  surface.querySelectorAll<HTMLAnchorElement>("[data-atmel-destination]").forEach(link => link.addEventListener("click", event => { observe(); if (state().phase === "unavailable" && !event.ctrlKey && !event.metaKey) { event.preventDefault(); notice = "Conserve cette scène dans le Studio avant de changer d’expérience."; refresh(); } }));
  surface.querySelectorAll<HTMLInputElement>("[data-atmel-time]").forEach(input => input.addEventListener("change", () => { observe(); if (input.validity.valid && input.value && state().phase !== "unavailable") apply(updateAtmelClock(data, snapshot, input.dataset.atmelTime as AtmelClockId, input.value)); }));
  find("[data-atmel-panel]").addEventListener("click", () => setView("panel"));
  find("[data-atmel-clock-refresh]").addEventListener("click", captureClock);
  find("[data-atmel-exit]").addEventListener("click", () => { observe(); if (state().phase === "unavailable") studio(); else onExit(); });
  find("[data-atmel-frame]").addEventListener("click", () => frame());
  find("[data-atmel-close]").addEventListener("click", () => { const current = state(); if (current.phase === "opened") play("return", current.choice!); });
  find("[data-atmel-saver]").addEventListener("click", () => { if (["idle", "saver"].includes(state().phase)) play("saver", 1); });
  find("[data-atmel-pause]").addEventListener("click", () => { api.pause(!api.state()?.paused); refresh(); });
  find("[data-atmel-reset]").addEventListener("click", () => { observe(); if (state().phase === "unavailable") return; api.pause(true); if (apply(resetAtmel(snapshot))) { api.select([]); setView("menu"); } });
  find("[data-atmel-skip]").addEventListener("click", () => {
    const program = snapshot.entities.find(e => e.id === ATMEL_MACHINE)?.behaviors?.find(b => b.id?.startsWith("atmel-program-"));
    if (program?.type !== "keyframes" || !["aligning", "rotating", "opening", "closing", "returning"].includes(state().phase)) return;
    api.pause(true); api.step(Math.max(0, (program.startSeconds ?? 0) + program.durationSeconds - (api.state()?.elapsedSeconds ?? 0)) + 1 / 60); refresh();
  });
  const raycaster = new Raycaster(), pointer = new Vector2(), canvas = host.renderer.domElement;
  let down: { id: number; x: number; y: number } | null = null;
  const pointerDown = (event: PointerEvent) => { if (event.button === 0) down = { id: event.pointerId, x: event.clientX, y: event.clientY }; };
  const pointerCancel = () => { down = null; };
  const pointerUp = (event: PointerEvent) => {
    const start = down; down = null;
    if (!start || start.id !== event.pointerId || event.button !== 0 || Math.hypot(start.x - event.clientX, start.y - event.clientY) > 7) return;
    observe(); const current = state(); if (current.phase === "unavailable") return;
    const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, host.camera);
    if (view !== "panel" && ["idle", "saver"].includes(current.phase)) {
      // These are the native hidden selection volumes, not visible proxy boxes.
      // Explicitly intersect only the owned eight while their closed rig is active.
      const choices = Array.from({ length: 8 }, (_, i) => ({ choice: i + 1, object: host.world.getEntityObject(`atmel-click-${i + 1}`) })).filter(item => item.object);
      const hits = choices.flatMap(item => raycaster.intersectObject(item.object!, true).map(hit => ({ choice: item.choice, distance: hit.distance }))).sort((a, b) => a.distance - b.distance);
      if (hits[0]) { play("open", hits[0].choice); return; }
    }
    const portals = (view === "panel" ? ["atmel-light-indicator", "atmel-fan-indicator"] : ["atmel-system", "atmel-tools", "atmel-earth", "atmel-sun", "atmel-arrow"]).flatMap(id => { const object = host.world.getEntityObject(id); return object ? raycaster.intersectObject(object, true).map(hit => ({ id, distance: hit.distance })) : []; }).sort((a, b) => a.distance - b.distance);
    const id = portals[0]?.id;
    if (id === "atmel-arrow") setView("overview");
    else if (id === "atmel-earth") { api.select([id]); notice = "La Terre et sa grille utilisent les modèles et textures d’origine."; refresh(); }
    else if (id === "atmel-system") { api.select([id]); notice = "SYSTEM · les informations locales et les réglages restent modifiables dans le Studio."; refresh(); }
    else if (id === "atmel-tools") location.assign(route("impreza"));
    else if (id === "atmel-sun") location.assign(route("flightx"));
    else if (id === "atmel-light-indicator") toggleIndicator("light");
    else if (id === "atmel-fan-indicator") toggleIndicator("fan");
  };
  const reframe = () => frame(); compact.addEventListener("change", reframe); reduced.addEventListener("change", reframe); window.addEventListener("resize", reframe);
  canvas.addEventListener("pointerdown", pointerDown); canvas.addEventListener("pointerup", pointerUp); canvas.addEventListener("pointercancel", pointerCancel); window.addEventListener("blur", pointerCancel);
  const unsubscribe = host.subscribeFrame(() => { if (!disposed) refresh(); }); frame(true); refresh();
  return {
    state: () => { const clock = api.state(); observe(clock); const models = clock?.entities.filter(e => e.type === "model") ?? []; return { application: "cubx-atmel", ready: models.length > 0 && models.every(e => e.asset?.status === "ready"), ...state(clock), view, paused: clock?.paused, clocks: Object.fromEntries(ATMEL_CLOCKS.map(key => [key, atmelClock(snapshot, key)])), sourceChoices: 8, notice }; },
    advanceTime(milliseconds: number) { if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 60_000 || api.state()?.paused) return; let remaining = milliseconds / 1000; while (remaining > 1e-8 && !api.state()?.paused) { const step = Math.min(1 / 60, remaining); api.step(step); remaining -= step; } refresh(); },
    dispose() { disposed = true; unsubscribe(); host.cancelCameraMove(); compact.removeEventListener("change", reframe); reduced.removeEventListener("change", reframe); window.removeEventListener("resize", reframe); canvas.removeEventListener("pointerdown", pointerDown); canvas.removeEventListener("pointerup", pointerUp); canvas.removeEventListener("pointercancel", pointerCancel); window.removeEventListener("blur", pointerCancel); surface.remove(); document.title = previousTitle; document.documentElement.lang = previousLanguage; },
  };
}

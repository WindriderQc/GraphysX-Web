import { Vector3 } from "three";
import type { AgentWorldDefinition } from "./agent-world-runtime";
import type { PlatformHost } from "./platform-host";
import { buildFlightxCourse, buildFlightxPreview, FLIGHTX_MODES, FLIGHTX_PLAYER, isFlightxMode, type FlightxMode } from "./flightx-courses";
import { readFlightxBest, saveFlightxBest } from "./flightx-records";
import "./flightx.css";

export type FlightxApplication = { state: () => unknown; advanceTime: (milliseconds: number) => unknown; dispose: () => void };
type Action = "forward" | "back" | "up" | "down" | "left" | "right";
type Phase = "menu" | "loading" | "flight" | "complete" | "expired" | "foreign" | "error";

/** Four modern training forms over recovered assets; the scene API owns motion and results. */
export function mountFlightx(root: HTMLElement, host: PlatformHost, onExit: () => void, onStudio: () => void): FlightxApplication {
  const { api } = host, compact = matchMedia("(max-width: 740px)"), reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const oldTitle = document.title, oldLanguage = document.documentElement.lang, oldOrbit = host.orbitEnabled;
  const oldClass = document.body.classList.contains("gx-flightx-active");
  document.body.classList.add("gx-flightx-active"); document.title = "FlightX · À toi de voler · GraphysX"; document.documentElement.lang = "fr";
  const surface = document.createElement("main"); surface.className = "gx-flightx"; surface.setAttribute("aria-label", "FlightX · À toi de voler");
  surface.innerHTML = `
    <header class="gx-flightx-header"><button type="button" data-flightx-exit>← Accueil</button><span>GraphysX <i>/</i> Archives <i>/</i> FlightX</span><button type="button" data-flightx-studio>Ouvrir dans le Studio ↗</button></header>
    <section class="gx-flightx-menu" aria-labelledby="gx-flightx-title">
      <p class="gx-flightx-kicker">UN AVION RETROUVÉ <span>QUATRE FAÇONS DE VOLER</span></p>
      <h1 id="gx-flightx-title">Le ciel est à toi.</h1>
      <p class="gx-flightx-intro">Le biplan d’origine. Des parcours nouveaux. Choisis ton prochain vol.</p>
      <fieldset class="gx-flightx-modes"><legend>Quel vol te tente ?</legend></fieldset>
      <p class="gx-flightx-goal" data-flightx-goal></p>
      <button class="gx-flightx-primary" type="button" data-flightx-start disabled>Chargement de l’avion…</button>
      <p class="gx-flightx-menu-status" role="status" data-flightx-status></p>
      <details class="gx-flightx-details"><summary>Commandes et histoire</summary>
        <p>W ou Espace : avancer · S : reculer · ↑ / ↓ : monter / descendre · ← / → : incliner · P / Échap : pause · R : recommencer.</p>
        <p><b>Retrouvés :</b> l’avion TVM, ses six textures et le pipe d’origine. <b>Actuels :</b> ces parcours, leurs règles, l’éclairage, la caméra et les commandes simplifiées. Les passages utilisent un repère au centre de l’avion ; aucune collision ou aérodynamique native n’est reproduite.</p>
        <p>Le Studio conserve le document courant et reprend son départ enregistré. Dans cette visite, tu peux changer de parcours puis retrouver ses objets modifiés. Ouvre le Studio pour les enregistrer.</p>
        <a data-flightx-source target="_blank" rel="noopener">Comparer la composition C++ dans un autre onglet ↗</a>
      </details>
    </section>
    <section class="gx-flightx-hud" aria-label="Ton vol" hidden>
      <div><small data-flightx-mode-title></small><b data-flightx-progress aria-live="polite"></b><span data-flightx-time></span></div>
      <p data-flightx-next></p><div class="gx-flightx-flight-actions"><button type="button" data-flightx-pause>Pause</button><button type="button" data-flightx-restart>Au départ</button><button type="button" data-flightx-menu>Autre vol</button></div>
      <p class="gx-flightx-key-hint">W / Espace + ↑ pour ton premier looping · P : pause</p>
      <p data-flightx-flight-status role="status"></p>
    </section>
    <section class="gx-flightx-result" aria-labelledby="gx-flightx-result-title" hidden>
      <small>TON VOL</small><h2 id="gx-flightx-result-title"></h2><b data-flightx-finish-time></b><p data-flightx-record></p>
      <button class="gx-flightx-primary" type="button" data-flightx-replay>Rejouer →</button><button type="button" data-flightx-other>Choisir un autre vol</button>
    </section>
    <div class="gx-flightx-touch" aria-label="Commandes de vol" hidden>
      <div class="gx-flightx-direction"><button type="button" data-flightx-input="up" aria-label="Monter">↑</button><button type="button" data-flightx-input="left" aria-label="Incliner à gauche">←</button><button type="button" data-flightx-input="down" aria-label="Descendre">↓</button><button type="button" data-flightx-input="right" aria-label="Incliner à droite">→</button></div>
      <div class="gx-flightx-throttle"><button type="button" data-flightx-input="forward">Avancer</button><button type="button" data-flightx-input="back">Reculer</button></div>
    </div>`;
  root.append(surface);
  const find = <T extends HTMLElement = HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const modeButtons = new Map<FlightxMode, HTMLButtonElement>();
  for (const [index, mode] of FLIGHTX_MODES.entries()) {
    const button = document.createElement("button"); button.type = "button"; button.dataset.flightxMode = mode.id;
    const number = document.createElement("small"), title = document.createElement("b"), description = document.createElement("span");
    number.textContent = "0" + (index + 1); title.textContent = mode.title; description.textContent = mode.description;
    button.append(number, title, description); find(".gx-flightx-modes").append(button); modeButtons.set(mode.id, button);
  }
  const sourceUrl = new URL(location.href); sourceUrl.searchParams.set("app", "flightx"); sourceUrl.searchParams.set("view", "source"); sourceUrl.searchParams.delete("mode");
  find<HTMLAnchorElement>("[data-flightx-source]").href = sourceUrl.pathname + sourceUrl.search;
  const requested = new URLSearchParams(location.search).get("mode");
  let selected: FlightxMode = isFlightxMode(requested) ? requested : "free", active: FlightxMode | null = null;
  let phase: Phase = "menu", expectedWorld = "", ready = false, pendingStart = false, disposed = false, lastView = "", lastTime = "", notice = "", recordNotice = "";
  let assetsReadyFrame: number | null = null;
  let best = readFlightxBest().best;
  const documents = new Map<FlightxMode, AgentWorldDefinition>(), held = new Map<string, Action>();
  const clock = () => host.world.getClock(), owned = () => clock().worldId === expectedWorld;
  const player = () => api.query({ ids: [FLIGHTX_PLAYER] })[0];
  const controls = { roll: 0, pitch: 0, thrust: 0, airbrake: false };
  const send = () => {
    const values = [...held.values()];
    Object.assign(controls, { roll: Number(values.includes("left")) - Number(values.includes("right")), pitch: Number(values.includes("down")) - Number(values.includes("up")), thrust: Number(values.includes("forward")) - Number(values.includes("back")), airbrake: false });
    if (owned() && ready && player()) api.pilotLive(FLIGHTX_PLAYER, controls);
  };
  const release = () => { held.clear(); send(); };
  const cameraPosition = new Vector3(), cameraTarget = new Vector3(), position = new Vector3(), behind = new Vector3(), ahead = new Vector3();
  const frame = () => {
    const item = player(); if (!item) return;
    const [x, y, z] = item.position;
    host.frameView(compact.matches ? [x + 7, y + 5, z - 11] : [x + 6, y + 4, z - 10], compact.matches ? [x + .2, y - 2.5, z + .6] : [x + 3.6, y, z], 0);
    cameraPosition.copy(host.camera.position); cameraTarget.copy(host.orbitTarget);
  };
  const follow = (seconds: number, immediate = false) => {
    const object = host.world.getEntityObject(FLIGHTX_PLAYER); if (!object) return;
    object.getWorldPosition(position);
    behind.set(8, 6, 18); ahead.set(0, 0, compact.matches ? 0 : -4);
    if (!reduced.matches) { behind.applyQuaternion(object.quaternion); ahead.applyQuaternion(object.quaternion); }
    const blend = immediate || reduced.matches ? 1 : 1 - Math.exp(-5 * Math.max(0, seconds));
    cameraPosition.lerp(behind.add(position), blend); cameraTarget.lerp(ahead.add(position), blend);
    host.frameView(cameraPosition.toArray(), cameraTarget.toArray(), 0);
  };
  const remember = () => { const document = owned() ? api.exportDocument() : null; if (active && document) documents.set(active, document); };
  const create = (definition: AgentWorldDefinition, start: boolean) => {
    release(); ready = false; assetsReadyFrame = null; pendingStart = start; notice = ""; recordNotice = ""; phase = start ? "loading" : "menu";
    const result = api.create(definition); if (!result.ok) throw new Error(result.error ?? "Could not open FlightX");
    expectedWorld = definition.id ?? ""; api.pause(true); host.applyEnvironment(); host.setOrbitEnabled(oldOrbit); frame();
  };
  const launch = (restart = false) => {
    if (!owned() || !ready) return;
    const run = api.rules.status();
    if (!restart && active === selected && (active === "free" || run?.phase === "running")) {
      release(); phase = "flight"; notice = ""; host.setOrbitEnabled(false); api.pause(false); refresh(); return;
    }
    remember();
    const document = documents.get(selected) ?? buildFlightxCourse(selected, api.exportDocument() ?? undefined);
    active = selected; create(document, true);
    const url = new URL(location.href); url.searchParams.set("mode", selected); history.replaceState(null, "", url.pathname + url.search);
    refresh();
  };
  const menu = () => { release(); api.pause(true); remember(); phase = "menu"; host.setOrbitEnabled(oldOrbit); frame(); refresh(); };
  const pause = () => { if (phase !== "flight") return; release(); api.pause(!clock().paused); refresh(); };
  const secondsText = (value: number) => value.toFixed(1).replace(".", ",") + " s";
  const refresh = () => {
    if (disposed) return;
    if (!owned()) {
      if (phase !== "foreign") { release(); phase = "foreign"; ready = false; pendingStart = false; notice = "La scène a changé. Ouvre le Studio pour la conserver."; host.setOrbitEnabled(oldOrbit); }
    } else {
      const models = api.query({ type: "model" });
      if (!ready && phase !== "error") {
        if (models.some(model => model.asset?.status === "error")) { phase = "error"; pendingStart = false; notice = "Un modèle n’a pas pu se charger. Ouvre le Studio ou recharge la page."; }
        const assetsReady = !!player() && models.length > 0 && models.every(model => model.asset?.status === "ready");
        const render = host.renderer.info.render;
        if (assetsReady && assetsReadyFrame === null) assetsReadyFrame = render.frame;
        ready = assetsReady && assetsReadyFrame !== null && render.frame >= assetsReadyFrame + 2 && render.calls > 0 && !host.renderer.getContext().isContextLost();
        if (ready && pendingStart) { pendingStart = false; if (api.rules.get()) api.rules.reset(); phase = "flight"; host.setOrbitEnabled(false); api.pause(false); }
      }
    }
    const run = api.rules.status(), item = player();
    if (owned() && phase === "flight" && run && (run.phase === "complete" || run.phase === "expired")) {
      release(); api.pause(true); if (compact.matches) frame(); else follow(0, true); phase = run.phase;
      if (run.phase === "complete" && active && !run.desynced) {
        const record = saveFlightxBest(active, run.elapsedSeconds, best); best = record.best;
        recordNotice = !record.stored ? "Ton temps reste disponible pour cette session ; le navigateur n’a pas pu le sauvegarder." : record.improved ? "Nouveau meilleur temps local !" : "Meilleur temps local : " + secondsText(best[active]!);
      } else recordNotice = run.phase === "expired" ? "Prends ton temps pour apprendre le looping. Tu peux recommencer autant que tu veux." : "Le parcours est terminé ; cet essai n’est pas enregistré comme record.";
    }
    if (owned() && phase === "flight" && item && !clock().paused && (Math.abs(item.position[0]) > 1200 || Math.abs(item.position[2]) > 1200 || item.position[1] < 1 || item.position[1] > 500)) {
      release(); api.pause(true); notice = "Tu as quitté la zone de vol. Reviens au départ pour continuer.";
    }
    const mode = FLIGHTX_MODES.find(value => value.id === selected)!;
    const view = JSON.stringify([phase, selected, active, ready, clock().paused, notice, run?.lap, run?.checkpointIndex, run?.phase, best[selected], recordNotice]);
    if (lastView !== view) {
      lastView = view; surface.dataset.phase = phase;
      modeButtons.forEach((button, id) => { button.setAttribute("aria-pressed", String(id === selected)); button.disabled = phase === "foreign"; });
      const start = find<HTMLButtonElement>("[data-flightx-start]"); start.disabled = !ready || phase === "foreign" || phase === "error";
      start.textContent = !ready ? "Chargement de l’avion…" : active === selected && (active === "free" || run?.phase === "running") ? "Reprendre le vol →" : active === selected ? "Rejouer →" : "Décoller →";
      find("[data-flightx-goal]").textContent = mode.goal + (best[selected] ? " Record local : " + secondsText(best[selected]!) : "");
      find("[data-flightx-status]").textContent = notice || (ready ? "Prêt à décoller. Le Studio garde tous les objets de ce document." : "Chargement des modèles d’origine…");
      find<HTMLButtonElement>("[data-flightx-studio]").disabled = !ready && phase !== "foreign" && phase !== "error";
      const playing = phase === "flight", result = phase === "complete" || phase === "expired";
      find(".gx-flightx-menu").hidden = playing || result;
      find(".gx-flightx-hud").hidden = !playing; find(".gx-flightx-touch").hidden = !playing; find(".gx-flightx-result").hidden = !result;
      find("[data-flightx-mode-title]").textContent = FLIGHTX_MODES.find(value => value.id === active)?.title ?? mode.title;
      find("[data-flightx-progress]").textContent = active === "free" ? "Vol libre" : (active === "laps" ? "Tour " + Math.min((run?.lap ?? 0) + 1, 3) + " / 3 · " : "") + "Portes " + (run?.phase === "complete" ? (run?.checkpointCount ?? 0) + 1 : run?.checkpointIndex ?? 0) + " / " + ((run?.checkpointCount ?? 0) + 1);
      find("[data-flightx-pause]").textContent = clock().paused ? "Reprendre" : "Pause";
      find("[data-flightx-flight-status]").textContent = notice || (clock().paused ? "En pause. Reprends quand tu veux." : "");
      find(".gx-flightx-key-hint").hidden = active !== "time" && active !== "laps";
      surface.querySelectorAll<HTMLButtonElement>("[data-flightx-input]").forEach(button => { button.disabled = !playing || clock().paused; });
      find("#gx-flightx-result-title").textContent = phase === "expired" ? "Le chrono s’est écoulé." : active === "laps" ? "Trois tours, bravo !" : active === "gates" ? "Trois portes franchies !" : "Looping bouclé !";
      find("[data-flightx-finish-time]").textContent = secondsText(run?.elapsedSeconds ?? 0); find("[data-flightx-record]").textContent = recordNotice;
    }
    const time = active === "free" ? "Altitude " + Math.round(item?.position[1] ?? 0) + " m" : active === "time" ? secondsText(Math.max(0, 35 - (run?.elapsedSeconds ?? 0))) + " restantes" : secondsText(run?.elapsedSeconds ?? 0);
    if (time !== lastTime) { lastTime = time; find("[data-flightx-time]").textContent = time; }
    const gateId = run?.nextCheckpointId ?? api.rules.get()?.finish?.triggerId;
    const gate = gateId ? api.query({ ids: [gateId] })[0] : null;
    find("[data-flightx-next]").textContent = gate && item ? "Prochaine porte · " + Math.round(Math.hypot(...gate.position.map((value, index) => value - item.position[index]))) + " m" : "Explore librement · aucun adversaire.";
  };
  modeButtons.forEach((button, id) => button.addEventListener("click", () => { if (phase !== "foreign") { selected = id; refresh(); } }));
  find("[data-flightx-start]").addEventListener("click", () => launch());
  find("[data-flightx-replay]").addEventListener("click", () => launch(true));
  find("[data-flightx-restart]").addEventListener("click", () => launch(true));
  find("[data-flightx-pause]").addEventListener("click", pause); find("[data-flightx-menu]").addEventListener("click", menu); find("[data-flightx-other]").addEventListener("click", menu);
  find("[data-flightx-exit]").addEventListener("click", () => { release(); api.pause(true); onExit(); });
  find("[data-flightx-studio]").addEventListener("click", () => {
    if (!owned()) { release(); api.pause(true); onStudio(); return; }
    if (!ready && phase !== "error") return;
    const document = api.exportDocument(); if (!document) return;
    release(); api.pause(true);
    const result = api.create(document); if (!result.ok) { notice = "Le document n’a pas pu s’ouvrir dans le Studio."; refresh(); return; }
    api.pause(true); frame(); api.select(["flight-plane-model"]); onStudio();
  });
  const keyAction = (code: string): Action | undefined => ({ KeyW: "forward", Space: "forward", KeyS: "back", ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" } as Record<string, Action>)[code];
  const keyDown = (event: KeyboardEvent) => {
    if (phase !== "flight" || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && (event.target.matches("input,textarea,select") || event.target.isContentEditable))) return;
    if (event.code === "Space" && event.target instanceof HTMLButtonElement) return;
    if (!event.repeat && ["KeyP", "Escape"].includes(event.code)) { event.preventDefault(); pause(); return; }
    if (!event.repeat && event.code === "KeyR") { event.preventDefault(); launch(true); return; }
    const action = keyAction(event.code); if (action) { event.preventDefault(); if (!clock().paused) { held.set("key:" + event.code, action); send(); } }
  };
  const keyUp = (event: KeyboardEvent) => { if (held.delete("key:" + event.code)) { event.preventDefault(); send(); } };
  const pointerRelease = (event: PointerEvent) => { if (held.delete("pointer:" + event.pointerId)) send(); };
  surface.querySelectorAll<HTMLButtonElement>("[data-flightx-input]").forEach(button => {
    button.addEventListener("pointerdown", event => {
      if (phase !== "flight" || clock().paused || event.button !== 0) return;
      event.preventDefault(); button.setPointerCapture(event.pointerId); held.set("pointer:" + event.pointerId, button.dataset.flightxInput as Action); send();
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(event, pointerRelease as EventListener);
    button.addEventListener("click", event => {
      if (event.detail !== 0 || phase !== "flight" || clock().paused) return;
      held.set("accessible-tap", button.dataset.flightxInput as Action); send(); api.step(.15); held.delete("accessible-tap"); send(); refresh();
    });
  });
  const loseFocus = () => { release(); if (phase === "flight") api.pause(true); refresh(); };
  const visibility = () => { if (document.hidden) loseFocus(); };
  const resize = () => { if (phase === "menu" || phase === "complete" || phase === "expired") frame(); else if (phase === "flight") follow(0, true); };
  window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp); window.addEventListener("blur", loseFocus); document.addEventListener("visibilitychange", visibility); compact.addEventListener("change", resize);
  const unsubscribe = host.subscribeFrame(delta => { if (disposed) return; refresh(); if (phase === "flight" && owned()) follow(delta); });
  create(buildFlightxPreview(), false); refresh();
  const state = () => ({ id: "flightx", phase, selectedMode: selected, activeMode: active, ready, paused: clock().paused, controls: { ...controls },
    player: player()?.position, rules: api.rules.status(), best: { ...best }, notice, recordNotice,
    provenance: { assets: "original TVM/BMP", courses: "modern training layouts", controls: "simplified kinematic flight", collision: "passage probe only" } });
  return {
    state,
    advanceTime: milliseconds => {
      let seconds = Math.min(60000, Math.max(0, milliseconds)) / 1000;
      while (seconds > 0 && phase === "flight" && !clock().paused) { const slice = Math.min(.25, seconds); api.step(slice); refresh(); if (phase === "flight") follow(slice); seconds -= slice; }
      return state();
    },
    dispose: () => {
      if (disposed) return; release(); disposed = true; unsubscribe(); window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", loseFocus);
      document.removeEventListener("visibilitychange", visibility); compact.removeEventListener("change", resize);
      host.setOrbitEnabled(oldOrbit); document.title = oldTitle; document.documentElement.lang = oldLanguage; document.body.classList.toggle("gx-flightx-active", oldClass); surface.remove();
    },
  };
}

import { Vector3 } from "three";
import type { PlatformHost } from "./platform-host";
import { buildImprezaWorld, IMPREZA_PLAYER } from "./impreza-scene";
import { loadImprezaSource, type ImprezaWorldId } from "./impreza-source";
import "./impreza.css";

export type ImprezaApplication = { state: () => unknown; advanceTime: (milliseconds: number) => unknown; dispose: () => void };
export async function mountImpreza(root: HTMLElement, host: PlatformHost, onExit: () => void, onStudio: () => void): Promise<ImprezaApplication> {
  const surface = document.createElement("main"); surface.className = "gx-impreza"; surface.setAttribute("aria-label", "Impreza · les mondes retrouvés");
  surface.innerHTML = '<p class="gx-impreza-loading" role="status">Ouverture des modèles TVM…</p>'; root.append(surface);
  const source = await loadImprezaSource().catch(error => { surface.remove(); throw error; });
  const { api } = host, previousTitle = document.title, previousLanguage = document.documentElement.lang, previousControls = host.orbitEnabled;
  const clock = () => host.world.getClock();
  document.title = "Impreza · les mondes retrouvés · GraphysX"; document.documentElement.lang = "fr";
  const previousBodyClass = document.body.classList.contains("gx-impreza-active"); document.body.classList.add("gx-impreza-active");
  let world: ImprezaWorldId = new URLSearchParams(location.search).get("world") === "racinx" ? "racinx" : "atmel";
  let mode: "inspect" | "drive" = "inspect", disposed = false, ready = false, pendingDrive = false, notice = "", modelReady = 0, modelTotal = 0;
  let sourceDrop = false, lastUi = "";
  const held = new Map<string, string>(), controls = { thrust: 0, turn: 0, brake: 0 };
  const compact = matchMedia("(max-width: 740px)"), position = new Vector3(), look = new Vector3(), desired = new Vector3(), direction = new Vector3();
  surface.innerHTML = `
    <header class="gx-impreza-header"><button type="button" data-impreza-exit>← Accueil</button><span>GraphysX <i>/</i> Archives <i>/</i> Impreza</span><button type="button" data-impreza-studio>Ouvrir dans le Studio ↗</button></header>
    <section class="gx-impreza-card" aria-labelledby="gx-impreza-title">
      <div class="gx-impreza-kicker">ARCHIVES / TVM <span>LA REPRISE JOUABLE</span></div>
      <h1 id="gx-impreza-title">Une Impreza. <br>Deux époques.</h1>
      <p class="gx-impreza-intro">La carrosserie et ses quatre roues d’origine. Choisis un monde, puis prends le volant.</p>
      <fieldset class="gx-impreza-worlds"><legend>Quel chapitre explorer ?</legend>
        <button type="button" data-impreza-world="atmel" aria-pressed="false"><small>01 / ATMEL</small><b>Le premier terrain</b><span>Sol plat · quatre voitures</span></button>
        <button type="button" data-impreza-world="racinx" aria-pressed="false"><small>02 / RACINX</small><b>Le relief retrouvé</b><span>RecTrack5 · cent anneaux</span></button>
      </fieldset>
      <p class="gx-impreza-source-caption" data-impreza-caption></p>
      <button class="gx-impreza-primary" type="button" data-impreza-drive disabled>Prendre le volant →</button>
      <div class="gx-impreza-secondary"><button type="button" data-impreza-frame>Voir la voiture</button><button type="button" data-impreza-overview>Explorer le terrain</button></div>
      <p class="gx-impreza-status" role="status" data-impreza-status></p>
      <details class="gx-impreza-provenance"><summary>Retrouvé, adapté, encore absent</summary>
        <p><b>Retrouvé :</b> chassis.TVM, wheel_l.TVM, wheel_r.TVM et leurs textures. Les deux terrains, les quatre placements de roues et les 100 anneaux de RacinX proviennent du C++.</p>
        <p><b>Adapté :</b> conduite Rapier, suspension, éclairage et caméra. La propulsion arrière et la direction avant suivent le code source; leur réponse physique n’est pas certifiée identique. Tous les objets sont remontés de 400 m ensemble. Le départ courant évite la longue chute native; une commande permet de la rejouer.</p>
        <p>Dans Atmel, le témoin 0 est décalé de 6 m pour éviter son chevauchement natif avec le joueur. Les trois témoins sont sans IA. Dans RacinX, les adversaires étaient commentés. Beaucoup d’anneaux dépassent le terrain : ce tracé n’est pas une course terminée.</p>
        <p><b>Encore absent :</b> réseau natif, son moteur et équivalence TV3D/Newton. L’eau native à y=85 se retrouve 485 m au-dessus du terrain : elle reste masquée et éditable dans le Studio. L’ovale moderne et les voitures sans liaison source restent des expériences distinctes.</p>
        <button type="button" data-impreza-drop>Rejouer la chute du C++</button>
        <p>Le Studio conserve tes modifications et reprend le départ enregistré, avec les pièces et leurs attaches. La conduite en cours ne devient pas une pose figée. L’archive locale reste intacte.</p>
      </details>
      <p class="gx-impreza-help">Glisse pour regarder · molette pour zoomer</p>
    </section>
    <section class="gx-impreza-dashboard" aria-label="Conduite" hidden><div><small>IMPREZA STi</small><b><span data-impreza-speed>0</span> <em>km/h</em></b><span data-impreza-contact>4 roues au sol</span></div><p>↑ / Z / W : accélérer · ↓ / S : reculer<br>← / Q / A et → / D : tourner · Espace : frein<br>R : départ · P / Échap : pause</p><div class="gx-impreza-drive-actions"><button type="button" data-impreza-pause>Pause</button><button type="button" data-impreza-reset aria-label="Revenir au départ">Au départ</button><button type="button" data-impreza-inspect>Regarder le modèle</button></div><p role="status" data-impreza-drive-status></p></section>
    <div class="gx-impreza-touch" aria-label="Commandes tactiles" hidden><div><button type="button" data-impreza-input="left" aria-label="Tourner à gauche">←</button><button type="button" data-impreza-input="right" aria-label="Tourner à droite">→</button></div><div><button type="button" data-impreza-input="brake">Frein</button><button type="button" data-impreza-input="reverse" aria-label="Reculer">↓</button><button type="button" data-impreza-input="forward" aria-label="Accélérer">↑</button></div></div>`;
  const find = <T extends HTMLElement = HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const player = () => api.query({ ids: [IMPREZA_PLAYER] })[0];
  const send = () => {
    controls.thrust = Number([...held.values()].includes("forward")) - Number([...held.values()].includes("reverse"));
    controls.turn = Number([...held.values()].includes("right")) - Number([...held.values()].includes("left"));
    controls.brake = Number([...held.values()].includes("brake"));
    if (ready) api.steerLive(IMPREZA_PLAYER, controls);
  };
  const release = () => { held.clear(); send(); };
  const frame = () => {
    const car = player(); if (!car) return;
    const [x, y, z] = car.position;
    host.frameView(compact.matches ? [x + 6, y + 4.2, z + 8] : [x + 7, y + 3.6, z + 8], compact.matches ? [x, y - 1.9, z] : [x - 1.5, y + .5, z], 0);
  };
  const inspect = () => { release(); mode = "inspect"; api.pause(true); host.setOrbitEnabled(previousControls); frame(); refresh(); };
  const startDrive = () => {
    if (!ready) return;
    release(); mode = "drive"; notice = sourceDrop ? "Chute historique : l’impact peut retourner la voiture. Reviens au départ pour repartir." : ""; api.pause(false); host.setOrbitEnabled(false);
    position.copy(host.camera.position); look.copy(host.orbitTarget); refresh();
  };
  const rebuild = (nextWorld = world, drop = false, drive = false) => {
    release(); world = nextWorld; sourceDrop = drop; mode = "inspect"; ready = false; modelReady = 0; pendingDrive = drive; notice = "";
    const result = api.create(buildImprezaWorld(source, world, drop));
    if (!result.ok) throw new Error(result.error ?? "Could not compose Impreza world");
    api.pause(true); host.applyEnvironment(); host.setOrbitEnabled(previousControls);
    modelTotal = api.query({ type: "model" }).length; frame(); refresh();
    const url = new URL(location.href); url.searchParams.set("world", world); history.replaceState(null, "", url.pathname + url.search);
  };
  const refresh = () => {
    if (disposed) return;
    const car = player(), paused = clock().paused;
    const changedWorld = clock().worldId !== `archive-impreza-${world}`;
    if (changedWorld) { held.clear(); Object.assign(controls, { thrust: 0, turn: 0, brake: 0 }); ready = false; pendingDrive = false; mode = "inspect"; host.setOrbitEnabled(previousControls); notice = "La scène a changé. Continue dans le Studio pour la conserver."; }
    if (!ready && !changedWorld) {
      const models = api.query({ type: "model" }); modelReady = models.filter(e => e.asset?.status === "ready").length;
      const failed = models.some(e => e.asset?.status === "error");
      ready = !failed && modelReady === modelTotal && car?.physics?.collider.effective === "convex-hull";
      if (failed) { pendingDrive = false; notice = "Une pièce n’a pas pu être chargée. Rechoisis ce chapitre pour réessayer."; }
      if (ready && pendingDrive) { pendingDrive = false; startDrive(); return; }
    }
    const ui = JSON.stringify([world, mode, ready, paused, notice, modelReady]);
    if (ui !== lastUi) {
      lastUi = ui; surface.dataset.mode = mode; surface.dataset.ready = String(ready);
      surface.querySelectorAll<HTMLButtonElement>("[data-impreza-world]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.imprezaWorld === world)));
      find<HTMLButtonElement>("[data-impreza-drive]").disabled = !ready;
      find<HTMLButtonElement>("[data-impreza-studio]").disabled = !ready && !changedWorld;
      find<HTMLButtonElement>("[data-impreza-drop]").disabled = !ready;
      find("[data-impreza-caption]").textContent = world === "atmel" ? "CarScene / AtmelCubx · le terrain de 512 × 512 m était entièrement plat." : "CarScene / RacinX · le relief RecTrack5 et le tracé diagonal des anneaux.";
      find("[data-impreza-status]").textContent = notice || (ready ? "Les pièces d’origine sont chargées. À toi de conduire." : `Chargement des pièces : ${modelReady} / ${modelTotal}…`);
      find(".gx-impreza-dashboard").hidden = mode !== "drive"; find(".gx-impreza-touch").hidden = mode !== "drive";
      find("[data-impreza-pause]").textContent = paused ? "Reprendre" : "Pause";
      find("[data-impreza-drive-status]").textContent = notice || (paused ? "En pause. Reprends quand tu veux." : "Exploration libre · aucun chronomètre ni adversaire actif.");
    }
    find("[data-impreza-speed]").textContent = Math.round(Math.abs(car?.steering?.vehicle?.speed ?? 0) * 3.6).toString();
    find("[data-impreza-contact]").textContent = `${car?.steering?.vehicle?.wheels.filter(w => w.contact).length ?? 0} roues au sol`;
  };
  const pause = () => { release(); api.pause(!clock().paused); refresh(); };
  find("[data-impreza-drive]").addEventListener("click", startDrive);
  find("[data-impreza-pause]").addEventListener("click", pause);
  find("[data-impreza-inspect]").addEventListener("click", inspect);
  find("[data-impreza-frame]").addEventListener("click", frame);
  find("[data-impreza-reset]").addEventListener("click", () => rebuild(world, false, true));
  find("[data-impreza-drop]").addEventListener("click", () => rebuild(world, true, true));
  find("[data-impreza-overview]").addEventListener("click", () => { release(); api.pause(true); host.frameView([180, 170, 180], [world === "racinx" ? 70 : 0, 0, world === "racinx" ? -70 : 0], 0); });
  find("[data-impreza-exit]").addEventListener("click", () => { release(); api.pause(true); onExit(); });
  find("[data-impreza-studio]").addEventListener("click", () => {
    if (clock().worldId !== `archive-impreza-${world}`) { release(); api.pause(true); onStudio(); return; }
    if (!ready) return;
    const authored = api.exportDocument(); if (!authored) return;
    release(); api.pause(true);
    const created = api.create(authored);
    if (!created.ok) { notice = "La copie n’a pas pu s’ouvrir dans le Studio."; refresh(); return; }
    api.pause(true); frame(); api.select([IMPREZA_PLAYER]); onStudio();
  });
  surface.querySelectorAll<HTMLButtonElement>("[data-impreza-world]").forEach(button => button.addEventListener("click", () => rebuild(button.dataset.imprezaWorld as ImprezaWorldId)));
  const keyAction = (code: string) => ({ ArrowUp: "forward", KeyW: "forward", KeyZ: "forward", ArrowDown: "reverse", KeyS: "reverse", ArrowLeft: "left", KeyA: "left", KeyQ: "left", ArrowRight: "right", KeyD: "right", Space: "brake" })[code];
  const keyDown = (event: KeyboardEvent) => {
    if (mode !== "drive" || event.ctrlKey || event.altKey || event.metaKey || (event.target instanceof HTMLElement && (event.target.matches("input,textarea,select") || event.target.isContentEditable))) return;
    if (event.code === "Space" && event.target instanceof HTMLButtonElement) return;
    const action = keyAction(event.code);
    if (action) { event.preventDefault(); if (!clock().paused) { held.set(`key:${event.code}`, action); send(); } }
    if (!event.repeat && ["KeyP", "Escape"].includes(event.code)) { event.preventDefault(); pause(); }
    if (!event.repeat && event.code === "KeyR") { event.preventDefault(); rebuild(world, false, true); }
  };
  const keyUp = (event: KeyboardEvent) => { if (held.delete(`key:${event.code}`)) { event.preventDefault(); send(); } };
  const pointerRelease = (event: PointerEvent) => { if (held.delete(`pointer:${event.pointerId}`)) send(); };
  surface.querySelectorAll<HTMLButtonElement>("[data-impreza-input]").forEach(button => {
    button.addEventListener("pointerdown", event => {
      if (mode !== "drive" || clock().paused || event.button !== 0) return;
      event.preventDefault(); button.setPointerCapture(event.pointerId); held.set(`pointer:${event.pointerId}`, button.dataset.imprezaInput!); send();
    });
    button.addEventListener("pointerup", pointerRelease); button.addEventListener("pointercancel", pointerRelease); button.addEventListener("lostpointercapture", pointerRelease);
    button.addEventListener("click", event => {
      if (event.detail !== 0 || clock().paused) return;
      // Keyboard/assistive activation is a short, deterministic tap, never a latched pedal.
      held.set("accessible-tap", button.dataset.imprezaInput!); send(); api.step(.15); held.delete("accessible-tap"); send(); refresh();
    });
  });
  const loseFocus = () => { release(); if (mode === "drive") api.pause(true); refresh(); };
  const visibility = () => { if (document.hidden) loseFocus(); };
  window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp); window.addEventListener("blur", loseFocus); document.addEventListener("visibilitychange", visibility);
  const resize = () => { if (mode === "inspect") frame(); }; compact.addEventListener("change", resize);
  const unsubscribe = host.subscribeFrame(delta => {
    if (disposed) return;
    const car = player();
    if (mode === "drive" && car) {
      const [x, y, z] = car.position;
      if ((Math.abs(x) > 253 || Math.abs(z) > 253 || y < -30) && !clock().paused) { release(); api.pause(true); notice = "Bord du terrain retrouvé. Reviens au départ pour continuer."; }
      const object = host.world.getEntityObject(IMPREZA_PLAYER);
      if (object) {
        direction.set(0, 0, 1).applyQuaternion(object.quaternion); direction.y = 0; direction.normalize();
        desired.set(x + direction.x * (compact.matches ? 10 : 11), y + (compact.matches ? 6.5 : 4.8), z + direction.z * (compact.matches ? 10 : 11));
        const blend = 1 - Math.exp(-5 * Math.min(delta, .05)); position.lerp(desired, blend);
        look.lerp(compact.matches ? desired.set(x, y - 2.5, z) : desired.set(x - direction.x * 3, y + .65, z - direction.z * 3), blend);
        host.frameView(position.toArray(), look.toArray(), 0);
      }
    }
    refresh();
  });
  rebuild();
  const state = () => ({ id: "impreza", world, mode, ready, sourceDrop, paused: clock().paused, controls: { ...controls }, loadedModels: modelReady, models: modelTotal,
    player: player()?.position, vehicle: player()?.steering?.vehicle, sourceRings: source.worlds[world].rings?.length ?? 0, sourceOpponents: source.worlds[world].opponents.length,
    adapters: ["Rapier handling", "all roots translated +400Y", "settled default spawn", "Atmel opponent0 separated", "source water hidden", "no historic race or AI"], notice });
  return {
    state,
    advanceTime: milliseconds => { api.step(Math.max(0, milliseconds) / 1000); refresh(); return state(); },
    dispose: () => {
      if (disposed) return;
      release(); disposed = true; unsubscribe(); window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", loseFocus); document.removeEventListener("visibilitychange", visibility); compact.removeEventListener("change", resize);
      host.setOrbitEnabled(previousControls); document.title = previousTitle; document.documentElement.lang = previousLanguage; surface.remove();
      document.body.classList.toggle("gx-impreza-active", previousBodyClass);
    },
  };
}

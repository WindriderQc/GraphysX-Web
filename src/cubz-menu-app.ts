import { Raycaster, Vector2, type Object3D } from "three";
import type { PlatformHost } from "./platform-host";
import { buildCubzMenu, cubzColorCommands, cubzMenuState, cubzResetCommands, cubzSequenceCommands, cubzStudioPose, loadCubzSource, type CubzAction } from "./cubz-menu-scene";
import { CUBZ_MENUS, cubzButtonNumber, cubzDestination } from "./cubz-menu-buttons";
import "./cubz-menu.css";

export type CubzMenuApplication = { state: () => unknown; advanceTime: (milliseconds: number) => unknown; dispose: () => void };
export async function mountCubzMenu(root: HTMLElement, host: PlatformHost, onExit: () => void, onStudio: () => void): Promise<CubzMenuApplication> {
  const surface = document.createElement("main");
  surface.className = "gx-cubz";
  surface.setAttribute("aria-label", "CubZ · menu mécanique retrouvé");
  surface.innerHTML = '<div class="gx-cubz-loading" role="status">Ouverture des acteurs d’archive…</div>';
  root.append(surface);
  const data = await loadCubzSource().catch(error => { surface.remove(); throw error; });
  const { api } = host;
  const created = api.create(buildCubzMenu(data));
  if (!created.ok) { surface.remove(); throw new Error(created.error ?? "Could not create CubZ menu"); }
  api.pause(true); host.applyEnvironment();
  const previousTitle = document.title, previousLanguage = document.documentElement.lang;
  document.title = "CubZ · le menu retrouvé · GraphysX"; document.documentElement.lang = "fr";
  let documentSnapshot = api.exportDocument()!;
  let revision = api.state()?.revision;
  let diagnostic = false;
  let notice = "";
  let lastStatus = "";
  let lastPhase = "";
  let lastMenu = -1;
  let lastAction: { button: number; action: CubzAction } | null = null;
  let disposed = false;
  const compact = matchMedia("(max-width: 740px)"), reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const atmelLocation = new URL(import.meta.env.BASE_URL, location.href);
  atmelLocation.searchParams.set("app", "cubx"); atmelLocation.searchParams.set("view", "atmel");
  const explicitStore = new URLSearchParams(location.search).get("store");
  if (explicitStore) atmelLocation.searchParams.set("store", explicitStore);
  surface.innerHTML = `
    <header class="gx-cubz-header"><button type="button" data-cubz-exit>← Accueil</button><span>GraphysX <i>/</i> Archives <i>/</i> CubZ</span><button type="button" data-cubz-frame>Recentrer</button></header>
    <div class="gx-cubz-caption" aria-hidden="true"><span>GÉOMÉTRIE RETROUVÉE</span><b>44 pièces. Un seul mouvement.</b></div>
    <section class="gx-cubz-card" aria-labelledby="gx-cubz-title">
      <div class="gx-cubz-kicker">CUBX / CUBZ <span>LE MENU MÉCANIQUE</span></div>
      <h1 id="gx-cubz-title">Un menu<br>qui s’ouvre.</h1>
      <p class="gx-cubz-intro">Choisis un des huit blocs. Il pivote, s’ouvre et révèle son menu.</p>
      <a class="gx-cubz-atmel-link" href="${atmelLocation.pathname + atmelLocation.search}">Explorer aussi l’accueil Atmel : Terre, panneau et afficheurs →</a>
      <fieldset class="gx-cubz-choices"><legend>Huit blocs · quatre boutons chacun</legend><div>${CUBZ_MENUS.map((menu, index) => `<button type="button" data-cubz-choice="${index}" aria-label="Ouvrir le bloc ${index + 1} : ${menu.label}" aria-pressed="false"><b>0${index + 1}</b><small>${menu.short}</small></button>`).join("")}</div></fieldset>
      <div class="gx-cubz-status"><span data-cubz-status role="status">Choisis un bloc dans la vue ou ci-dessus.</span><div class="gx-cubz-progress" aria-hidden="true"><i></i></div></div>
      <section class="gx-cubz-inside" data-cubz-inside hidden aria-labelledby="gx-cubz-menu-title"><h2 id="gx-cubz-menu-title">Le menu est ouvert.</h2><p>Deux touches sur chaque panneau latéral, une flèche de retour sur le panneau du haut. Fonctions actuelles, modèles reconstruits.</p><div data-cubz-actions></div></section>
      <div class="gx-cubz-controls"><button type="button" data-cubz-close disabled>Refermer le menu</button><button type="button" data-cubz-pause disabled>Pause</button><button type="button" data-cubz-skip disabled title="Terminer le mouvement immédiatement">Aller au résultat</button></div>
      <div class="gx-cubz-secondary"><button type="button" data-cubz-saver>Animation d’attente</button><button type="button" data-cubz-reset>Revenir aux huit blocs</button></div>
      <button type="button" class="gx-cubz-studio" data-cubz-studio>Emporter cette pose dans le Studio ↗</button>
      <p class="gx-cubz-note" role="status" data-cubz-note></p>
      <details class="gx-cubz-source"><summary>Retrouvé et reconstruit : les preuves</summary><p><b>Retrouvé :</b> les trois acteurs TVA complets, leurs 44 maillages chacun, les pivots et pistes ; la numérotation des 32 boutons, leurs huit groupes et la sortie commune du C++.</p><p><b>Reconstruit :</b> les 32 touches biseautées, leurs numéros et le bouton de retour dans la vue. Les thèmes et destinations sont actuels. La sortie referme les pétales puis inverse la rotation choisie.</p><p><b>Non retrouvé dans les fichiers inspectés :</b> Btn1.tvm à Btn32.tvm et BtnExit.tvm. Le champ Action existe dans le gestionnaire, mais son affectation aux boutons internes n’est pas établie dans les sources retrouvées. Les huit CubXBtn sont des boutons extérieurs d’une autre variante.</p><p><b>Adapté :</b> matériaux, caméra, commandes tactiles et attente solidaire. Les cylindres restent avec les cubes ; aucun maillage natif ni pivot n’est modifié. Les fichiers d’archive restent intacts.</p></details>
      <p class="gx-cubz-help">Glisse pour tourner autour · molette pour zoomer<br>La flèche du panneau supérieur referme le cube.</p>
    </section>`;
  const find = <T extends HTMLElement = HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const state = (clock = api.state()) => cubzMenuState(documentSnapshot, clock?.elapsedSeconds ?? 0);
  const observeDocument = (clock = api.state()) => {
    const next = clock?.revision;
    if (next !== revision) { documentSnapshot = api.exportDocument()!; revision = next; }
  };
  const frame = (arrival = false) => {
    const position: [number, number, number] = compact.matches ? [13, 13, 24] : [12, 9, 16];
    const target: [number, number, number] = compact.matches ? [0, -1.1, 0] : [2.3, 3.4, 0];
    if (arrival && !reduced.matches) host.framePath([{ position: [15, 11, 19], target: [0, 3.3, 0] }, { position, target }], 1.8);
    else host.frameView(position, target, 0);
  };
  const refresh = () => {
    const clock = api.state(); observeDocument(clock);
    const current = state(clock), paused = clock?.paused ?? true;
    const busy = ["rotating", "opening", "closing", "returning"].includes(current.phase);
    const unavailable = current.phase === "unavailable";
    const status = current.phase === "idle" ? "Choisis un bloc dans la vue ou ci-dessus." : current.phase === "screensaver" ? "Rotation d’attente · structure solidaire, boucle de 25 s." : current.phase === "unavailable" ? "La scène a été modifiée. Continue dans le Studio." :
      `Bloc ${current.choice! + 1} · ${{ rotating: "rotation", opening: "ouverture", opened: "menu ouvert", closing: "fermeture", returning: "retour" }[current.phase]}${busy && paused ? " · en pause" : ""}.`;
    if (status !== lastStatus) { find("[data-cubz-status]").textContent = status; lastStatus = status; }
    find(".gx-cubz-progress i").style.width = `${current.progress * 100}%`;
    surface.dataset.phase = current.phase;
    surface.querySelectorAll<HTMLButtonElement>("[data-cubz-choice]").forEach(button => {
      button.disabled = current.phase !== "idle";
      button.setAttribute("aria-pressed", String(Number(button.dataset.cubzChoice) === current.choice));
    });
    find("[data-cubz-inside]").hidden = current.phase !== "opened";
    const menuTitle = current.choice === null ? "Le menu est ouvert." : `${CUBZ_MENUS[current.choice].label} · bloc ${current.choice + 1}`;
    if (find("#gx-cubz-menu-title").textContent !== menuTitle) find("#gx-cubz-menu-title").textContent = menuTitle;
    if (current.phase === "opened" && current.choice !== null && current.choice !== lastMenu) {
      lastMenu = current.choice;
      find("[data-cubz-actions]").innerHTML = CUBZ_MENUS[current.choice].buttons.map((button, slot) =>
        `<button type="button" data-cubz-action="${button.action}" data-cubz-button="${cubzButtonNumber(current.choice!, slot)}"><span>${slot + 1} <small>BTN ${String(cubzButtonNumber(current.choice!, slot)).padStart(2, "0")}</small></span><b>${button.label}</b></button>`).join("");
    }
    find<HTMLButtonElement>("[data-cubz-close]").disabled = current.phase !== "opened";
    find("[data-cubz-close]").hidden = current.phase !== "opened";
    find<HTMLButtonElement>("[data-cubz-pause]").disabled = !busy && current.phase !== "screensaver";
    find("[data-cubz-pause]").hidden = !busy && current.phase !== "screensaver";
    find("[data-cubz-pause]").textContent = paused ? "Reprendre" : "Pause";
    find<HTMLButtonElement>("[data-cubz-skip]").disabled = !busy;
    find("[data-cubz-skip]").hidden = !busy;
    find<HTMLButtonElement>("[data-cubz-reset]").disabled = unavailable;
    find<HTMLButtonElement>("[data-cubz-saver]").disabled = current.phase !== "idle";
    const studioLabel = unavailable ? "Continuer dans le Studio ↗" : "Emporter cette pose dans le Studio ↗";
    if (find("[data-cubz-studio]").textContent !== studioLabel) find("[data-cubz-studio]").textContent = studioLabel;
    if (find("[data-cubz-note]").textContent !== notice) find("[data-cubz-note]").textContent = notice;
    if (current.phase !== lastPhase) {
      lastPhase = current.phase;
      if (current.phase === "opened" || current.phase === "idle") api.pause(true);
      if (current.phase === "opened") find("[data-cubz-inside]").scrollIntoView({ block: "start" });
      if (current.phase === "idle") find(".gx-cubz-card").scrollTop = 0;
    }
  };
  const apply = (commands: Parameters<typeof api.transaction>[0]) => {
    const result = api.transaction(commands);
    notice = result.ok ? "" : "Cette commande n’a pas pu être appliquée. La scène est conservée.";
    observeDocument(); refresh(); return result.ok;
  };
  const play = (mode: "open" | "return" | "saver", choice: number) => {
    observeDocument();
    if (state().phase === "unavailable") return;
    if (apply(cubzSequenceCommands(data, documentSnapshot, mode, choice, api.state()?.elapsedSeconds ?? 0))) api.pause(false);
    refresh();
  };
  const studio = () => {
    api.pause(true); observeDocument();
    const current = api.exportDocument();
    if (!current) return;
    const elapsed = api.state()?.elapsedSeconds ?? 0;
    if (cubzMenuState(current, elapsed).phase !== "unavailable") {
      const result = api.create(cubzStudioPose(current, elapsed));
      if (!result.ok) { notice = "La copie n’a pas pu s’ouvrir. La scène est conservée."; refresh(); return; }
    }
    api.pause(true); onStudio();
  };
  const action = (id: CubzAction | "close") => {
    observeDocument();
    const current = state();
    if (current.phase !== "opened" || current.choice === null) return;
    if (id === "close") { play("return", current.choice); return; }
    const menu = CUBZ_MENUS[current.choice], slot = menu.buttons.findIndex(button => button.action === id);
    if (slot < 0) return;
    lastAction = { button: cubzButtonNumber(current.choice, slot), action: id };
    const destination = cubzDestination(id, new URL(import.meta.env.BASE_URL, location.href).href, explicitStore);
    if (destination) { location.assign(destination.href); return; }
    if (id === "studio") { studio(); return; }
    if (id === "frame") frame();
    if (id === "front") host.frameView([1.9, 5.6, 15], [1.9, 4.2, 0], 0);
    if (id === "back") host.frameView([1.9, 7, -16], [1.9, 3.4, 0], 0);
    if (id === "top") host.frameView([2, 20, 3], [1.9, 3.4, 0], 0);
    if (id === "inspect") {
      api.select(["cubz-open-rig"]);
      notice = "L’acteur ouvert est sélectionné. Ses 44 maillages restent accessibles dans le Studio.";
    }
    if (id === "colors") { diagnostic = !diagnostic; apply(cubzColorCommands(documentSnapshot, diagnostic)); }
    if (id === "cores" || id === "cylinders" || id === "petals") {
      const actor = data.actors.open;
      const ids = actor.meshes.filter(mesh => {
        const name = actor.nodes[mesh.nodeId].name;
        return id === "cores" ? /^Box0[1-8]$/.test(name) : id === "cylinders" ? /^Cylindre/.test(name) : name === "";
      }).map(mesh => `cubz-open-m${mesh.nodeId}`);
      api.select(ids); notice = `${ids.length} pièces sélectionnées. Emporte cette pose dans le Studio pour les modifier.`;
    }
    if (id === "provenance") { find<HTMLDetailsElement>(".gx-cubz-source").open = true; find(".gx-cubz-source").scrollIntoView({ block: "start" }); }
    if (id === "export") {
      const pose = cubzStudioPose(documentSnapshot, api.state()?.elapsedSeconds ?? 0);
      const url = URL.createObjectURL(new Blob([JSON.stringify(pose, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "cubz-pose.graphysx.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0); notice = "Pose exportée : maillages, boutons et modifications sont conservés dans le JSON.";
    }
    refresh();
  };
  surface.querySelectorAll<HTMLButtonElement>("[data-cubz-choice]").forEach(button => button.addEventListener("click", () => { if (state().phase === "idle") play("open", Number(button.dataset.cubzChoice)); }));
  find("[data-cubz-actions]").addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-cubz-action]");
    if (button) action(button.dataset.cubzAction as CubzAction);
  });
  find("[data-cubz-exit]").addEventListener("click", onExit);
  find("[data-cubz-studio]").addEventListener("click", studio);
  find<HTMLAnchorElement>(".gx-cubz-atmel-link").addEventListener("click", event => {
    observeDocument();
    if (state().phase === "unavailable" && !event.ctrlKey && !event.metaKey) { event.preventDefault(); notice = "Conserve cette scène dans le Studio avant de changer d’expérience."; refresh(); }
  });
  find("[data-cubz-close]").addEventListener("click", () => { const current = state(); if (current.phase === "opened") play("return", current.choice!); });
  find("[data-cubz-saver]").addEventListener("click", () => { if (state().phase === "idle") play("saver", 0); });
  find("[data-cubz-reset]").addEventListener("click", () => { api.pause(true); observeDocument(); apply(cubzResetCommands(documentSnapshot)); api.select([]); frame(); });
  find("[data-cubz-pause]").addEventListener("click", () => { api.pause(!api.state()?.paused); refresh(); });
  find("[data-cubz-skip]").addEventListener("click", () => {
    const current = state();
    if (!["rotating", "opening", "closing", "returning"].includes(current.phase)) return;
    // Land after the terminal key on the fixed-step clock. An exact summed duration
    // can end one floating-point ulp before it, leaving a paused visibility switch pending.
    const duration = (current.choice === 0 ? 0 : 28 / 30) + 50 / 30;
    api.pause(true); api.step((1 - current.progress) * duration + 1 / 60); refresh();
  });
  const reframe = () => { frame(); if (state().phase === "opened") find("[data-cubz-inside]").scrollIntoView({ block: "start" }); };
  find("[data-cubz-frame]").addEventListener("click", reframe);
  compact.addEventListener("change", reframe); reduced.addEventListener("change", reframe);

  // Raycaster does not filter invisible ancestors. Test the whole ancestry so hidden
  // actor copies and inactive menus cannot consume a click meant for the visible rig.
  const raycaster = new Raycaster(), pointer = new Vector2();
  const canvas = host.renderer.domElement;
  let down: { x: number; y: number; id: number } | null = null;
  const pick = (event: PointerEvent): string[] | null => {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, host.camera);
    for (const hit of raycaster.intersectObject(host.world.group, true)) {
      let visible = true;
      for (let object: Object3D | null = hit.object; object; object = object.parent) if (!object.visible) { visible = false; break; }
      if (!visible) continue;
      const id = host.world.findEntityId(hit.object);
      const entity = id ? documentSnapshot.entities.find(entity => entity.id === id) : undefined;
      if (entity?.tags?.some(tag => tag.startsWith("cubz-choice-") || tag.startsWith("cubz-action-"))) return entity.tags;
      // An untagged visible mesh occludes buttons behind it, as in the actual menu.
      if (hit.object.type === "Mesh") return null;
    }
    return null;
  };
  const pointerDown = (event: PointerEvent) => {
    // A second finger belongs to camera navigation, even if the first stays still.
    if (!event.isPrimary || event.button !== 0) { down = null; return; }
    down = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };
  const pointerCancel = () => { down = null; };
  const pointerUp = (event: PointerEvent) => {
    const start = down; down = null;
    if (!start || event.button !== 0 || start.id !== event.pointerId || Math.hypot(start.x - event.clientX, start.y - event.clientY) > 7) return;
    const tags = pick(event), current = state();
    const choice = tags?.find(tag => tag.startsWith("cubz-choice-"));
    const selectedAction = tags?.find(tag => tag.startsWith("cubz-action-"));
    if (choice && current.phase === "idle") play("open", Number(choice.slice(12)));
    else if (selectedAction && current.phase === "opened") action(selectedAction.slice(12) as CubzAction | "close");
  };
  canvas.addEventListener("pointerdown", pointerDown); canvas.addEventListener("pointerup", pointerUp); canvas.addEventListener("pointercancel", pointerCancel);
  window.addEventListener("blur", pointerCancel);
  const unsubscribe = host.subscribeFrame(() => { if (!disposed) refresh(); });
  frame(true); refresh();
  return {
    state: () => ({ application: "cubx", ...state(), paused: api.state()?.paused, sourceMeshesPerActor: 44, diagnostic, notice, lastAction,
      buttons: state().phase === "opened" ? CUBZ_MENUS[state().choice!].buttons.map((button, slot) => ({ number: cubzButtonNumber(state().choice!, slot), slot: slot + 1, ...button })) : [],
      reconstructedButtons: 32, sharedExit: state().phase === "opened" }),
    advanceTime(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 60_000 || api.state()?.paused) return;
      let remaining = milliseconds / 1000;
      while (remaining > 1e-8 && !api.state()?.paused) { const seconds = Math.min(1 / 60, remaining); api.step(seconds); remaining -= seconds; refresh(); }
    },
    dispose() {
      disposed = true; unsubscribe(); host.cancelCameraMove();
      compact.removeEventListener("change", reframe); reduced.removeEventListener("change", reframe);
      canvas.removeEventListener("pointerdown", pointerDown); canvas.removeEventListener("pointerup", pointerUp); canvas.removeEventListener("pointercancel", pointerCancel);
      window.removeEventListener("blur", pointerCancel);
      surface.remove(); document.title = previousTitle; document.documentElement.lang = previousLanguage;
    },
  };
}

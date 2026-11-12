import { buildArchiveWorld, ARCHIVE_WORLD_LABELS, MAISON_VIEWS, maisonSourceView, type ArchiveWorldId, type MaisonView } from "./archive-worlds";
import type { PlatformHost } from "./platform-host";
import { playCubzTrack } from "./archive-world-motion";
import type { CubzRotationSelection } from "./cubz-tva-animation";
import { Vector3 } from "three";

/** Views and source interactions use normal scene commands; the panel owns no world state. */
export function mountArchiveWorkbench(container: HTMLElement, host: PlatformHost, id: ArchiveWorldId): () => void {
  const worldId = host.api.state()?.world.id;
  const panel = document.createElement("details");
  panel.className = "gx-archive-workbench";
  panel.open = innerWidth > 760;
  const summary = document.createElement("summary"); summary.textContent = `${ARCHIVE_WORLD_LABELS[id]} · vues et provenance`;
  const controls = document.createElement("div"); controls.className = "gx-archive-controls";
  const note = document.createElement("p"); note.className = "gx-archive-evidence"; note.setAttribute("role", "status");
  const cleanups: (() => void)[] = [];
  const button = (label: string, action: () => void, key: string): HTMLButtonElement => {
    const element = document.createElement("button"); element.type = "button"; element.textContent = label; element.dataset.archiveAction = key;
    element.addEventListener("click", action); controls.append(element); return element;
  };
  const view = (): MaisonView => MAISON_VIEWS.find((candidate) => host.api.query({ ids: [`maison-${candidate}`] })[0]?.visible) ?? "house";
  const sourceCamera = (): void => {
    if (id === "maison") { const camera = maisonSourceView(view()); host.frameView(camera.position, camera.target, 0); }
    if (id === "arena") host.frameView([0, 1, -10], [0, 1, 0], 0);
    if (id === "common-room") host.frameView([0, 11, 8], [0, 10, -8], 0);
    if (id === "notes") host.frameView([3, 2, 4], [0.9, -0.5, -0.6], 0);
    if (id === "cubz") host.frameView(host.camera.aspect < 0.8 ? [20, 18, 33] : [12, 10, 17], [0, 3.5, 0], 0);
    if (id === "flightx") host.frameView([-16, 23, 15], [host.camera.aspect < 0.8 ? 0 : 7, 16, 0], 0);
  };
  if (id === "maison") for (const choice of MAISON_VIEWS) button(choice === "house" ? "Maison" : choice === "kitchen" ? "Cuisine" : "Étude de volumes", () => {
    const result = host.api.transaction(MAISON_VIEWS.map((candidate) => ({ op: "update" as const, id: `maison-${candidate}`, patch: { visible: candidate === choice } })));
    if (result.ok) sourceCamera(); else note.textContent = result.error ?? "Impossible de changer de vue.";
  }, choice);
  button(["common-room", "notes", "cubz", "flightx"].includes(id) ? "Vue de visite" : "Caméra source", sourceCamera, "source-camera");
  button("Vue d’ensemble", () => {
    if (id === "maison") {
      if (view() === "kitchen") host.frameView([8, 7, 3], [2, 1, -4], 0);
      else if (view() === "massing") host.frameView([0, 24, 34], [0, 3, 0], 0);
      else host.frameView([17, 12, 22], [-2.8, 2, -0.7], 0);
    } else if (id === "arena") host.frameView([35, 32, 35], [1.4, 0.7, -1.65], 0);
    else if (id === "common-room") host.frameView([0, 21, 10], [0, 8, -8], 0);
    else sourceCamera();
  }, "overview");
  if (id === "notes") {
    button("Ajouter une plaque", () => {
      const add = host.api.query({ tag: "note-add" }).find((entity) => entity.visible && entity.interactions.length);
      if (add) host.api.interact(add.id, "add-note");
    }, "add-note");
    button("Recommencer le bloc", () => {
      const result = host.api.create(buildArchiveWorld("notes"));
      if (!result.ok) note.textContent = result.error ?? "Impossible de recommencer.";
    }, "reset-notes");
  }
  if (id === "cubz") {
    const label = document.createElement("label"); label.textContent = "Piste de rotation ";
    const select = document.createElement("select"); select.setAttribute("aria-label", "Piste de rotation CubZ");
    for (let index = 1; index <= 7; index++) { const option = document.createElement("option"); option.value = String(index); option.textContent = String(index); select.append(option); }
    label.append(select); controls.append(label);
    const play = (kind: "rotation" | "open", reverse = false): void => {
      try { playCubzTrack(host.api, kind, Number(select.value) as CubzRotationSelection, reverse); }
      catch (error) { note.textContent = String(error); }
    };
    button("Tourner", () => play("rotation"), "rotate");
    button("Retour de rotation", () => play("rotation", true), "unrotate");
    button("Ouvrir les faces", () => play("open"), "open-panels");
    button("Fermer les faces", () => play("open", true), "close-panels");
  }
  if (id === "flightx") {
    const held = new Set<string>();
    const pilot = (): void => {
      host.api.pilotLive("flight-plane", { roll: Number(held.has("ArrowLeft")) - Number(held.has("ArrowRight")),
        pitch: Number(held.has("ArrowUp")) - Number(held.has("ArrowDown")), thrust: Number(held.has("KeyW")) - Number(held.has("KeyS")), airbrake: held.has("Space") });
    };
    const clear = (): void => { held.clear(); pilot(); };
    const validKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyW", "KeyS", "Space", "KeyR"]);
    const key = (event: KeyboardEvent): void => {
      if (!validKeys.has(event.code)) return;
      const target = event.target as HTMLElement | null;
      if (event.type === "keydown" && (target?.closest("input,textarea,select,[contenteditable=true]") || event.ctrlKey || event.altKey || event.metaKey)) return;
      // A focused control keeps its native Space/arrow interaction; the viewport owns flight keys.
      if (event.type === "keydown" && target?.closest("button,summary") && !event.code.startsWith("Key")) return;
      event.preventDefault();
      if (event.code === "KeyR") { if (event.type === "keydown" && !event.repeat) host.api.pilotLive("flight-plane", { reset: true }); return; }
      if (event.type === "keydown") held.add(event.code); else held.delete(event.code);
      pilot();
    };
    const visibility = (): void => { if (document.hidden) clear(); };
    window.addEventListener("keydown", key); window.addEventListener("keyup", key); window.addEventListener("blur", clear); document.addEventListener("visibilitychange", visibility);
    cleanups.push(() => { clear(); window.removeEventListener("keydown", key); window.removeEventListener("keyup", key); window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", visibility); });
    for (const [text, code] of [["W · avancer", "KeyW"], ["S · reculer", "KeyS"], ["←", "ArrowLeft"], ["→", "ArrowRight"], ["↑", "ArrowUp"], ["↓", "ArrowDown"]]) {
      const control = button(text, () => {}, code); control.style.touchAction = "none";
      control.setAttribute("aria-label", `Maintenir ${text}`);
      control.addEventListener("pointerdown", event => { event.preventDefault(); control.setPointerCapture(event.pointerId); held.add(code); pilot(); });
      const release = (): void => { held.delete(code); pilot(); };
      control.addEventListener("pointerup", release); control.addEventListener("pointercancel", release); control.addEventListener("lostpointercapture", release);
      control.addEventListener("keydown", event => { if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); held.add(code); pilot(); } });
      control.addEventListener("keyup", event => { if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); release(); } });
      control.addEventListener("blur", release);
    }
    button("R · redresser", () => host.api.pilotLive("flight-plane", { reset: true }), "reset-attitude");
    button("Retour au départ", () => { clear(); host.api.update("flight-plane", { transform: { position: [0, 16, 0], rotationDegrees: [0, 0, 0] } }); }, "reset-flight");
    let following = false;
    const follow = button("Suivre l’avion", () => { following = !following; follow.setAttribute("aria-pressed", String(following)); }, "follow");
    const position = new Vector3(), behind = new Vector3(), ahead = new Vector3();
    cleanups.push(host.subscribeFrame(() => {
      if (!following) return;
      const plane = host.world.getEntityObject("flight-plane"); if (!plane) return;
      plane.getWorldPosition(position);
      behind.set(-18, 7, 9).applyQuaternion(plane.quaternion).add(position);
      ahead.set(host.camera.aspect < 0.8 ? 0 : 6, 0, 0).applyQuaternion(plane.quaternion).add(position);
      host.frameView(behind.toArray(), ahead.toArray(), 0);
    }));
  }
  let disposed = false;
  const refresh = (): void => {
    if (host.api.state()?.world.id !== worldId) { dispose(); return; }
    if (id === "maison") {
      const selected = view();
      for (const element of controls.querySelectorAll<HTMLButtonElement>("button")) if (MAISON_VIEWS.includes(element.dataset.archiveAction as MaisonView)) element.setAttribute("aria-pressed", String(element.dataset.archiveAction === selected));
      note.textContent = selected === "kitchen" ? "76 maillages sources. Photo externe absente ; éclairage adapté."
        : selected === "house" ? "24 maillages sources. La maison et la cuisine gardent leurs propres compositions et caméras."
          : "Étude de volumes adaptée conservée pour comparaison. Les deux vues sources restent disponibles.";
    } else if (id === "arena") note.textContent = "Géométrie OBJ et atlas d’origine. Éclairage adapté ; aucun jeu n’est inventé pour cette scène sans scripts.";
    else if (id === "common-room") note.textContent = "Coque exacte de room.tvm et diffuse/normal DDS d’origine. Caméra et éclairage de visite adaptés : aucune composition de scène ne les impose.";
    else if (id === "cubz") note.textContent = "Clés et plages TVA d’origine à 30 images/s. À gauche : rotation de l’ensemble. À droite : étude d’ouverture. Géométrie et pivots adaptés ; menu acteur complet encore incomplet. Retour = même plage lue à l’envers.";
    else if (id === "flightx") note.textContent = "W/S : déplacement local X ; flèches : rotations Z et X ; R : orientation initiale. Espace renforce la rotation basse, comme la source. Vitesse, décor, avion StockRoom et repères adaptés ; pas de simulation aérodynamique ni de course native prétendue.";
    else {
      const total = host.api.query({ tag: "note-plate" }).filter((entity) => entity.visible).length;
      note.textContent = `${total} / 50 plaques · composition spatiale retrouvée. Aucun éditeur de texte ni sauvegarde native n’est prétendu restauré.`;
      const add = controls.querySelector<HTMLButtonElement>('[data-archive-action="add-note"]'); if (add) add.disabled = total >= 50;
    }
  };
  const style = document.createElement("style");
  style.textContent = `.gx-archive-workbench{position:fixed;z-index:35;top:78px;left:260px;width:min(620px,calc(100vw - 590px));box-sizing:border-box;padding:9px 12px;border:1px solid #9dc6cf66;border-radius:12px;background:#0b1e2ded;color:#e0ebef;font:12px/1.45 var(--gx-font)}.gx-archive-workbench summary{cursor:pointer;min-height:28px;font-weight:700}.gx-archive-controls{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}.gx-archive-controls button{min-height:38px;border:1px solid #8ebbbf66;border-radius:7px;padding:6px 10px;background:#183746;color:#e0f5f1;font:inherit;cursor:pointer}.gx-archive-controls button[aria-pressed=true]{background:#b0e9d7;color:#143233}.gx-archive-controls button:disabled{opacity:.4}.gx-archive-controls button:focus-visible{outline:2px solid white}.gx-archive-evidence{margin:8px 0 0;color:#b8cbd0}@media(max-width:900px){.gx-archive-workbench{left:12px;right:12px;top:76px;width:auto;max-height:32dvh;overflow:auto}}`;
  const dispose = (): void => { if (disposed) return; disposed = true; unsubscribe(); cleanups.forEach(cleanup => cleanup()); panel.remove(); style.remove(); };
  const unsubscribe = host.world.subscribeEvents(refresh);
  panel.append(summary, controls, note); container.append(style, panel); refresh(); sourceCamera();
  return dispose;
}

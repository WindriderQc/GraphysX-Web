/**
 * The connected house — `?app=ecosystem`.
 *
 * The AgentX ecosystem laid out as one plateau (`ecosystem-scene.ts`), visited by Nestor
 * (`ecosystem-tour.ts`): a list of stops the page plays, each one a picture (outlined nodes,
 * arcs with a travelling bead) and a narration. The visitor can play, pause, step, pick a stop,
 * or click any machine to hear about it. A host page passes the list as `?play=`, the way the
 * DiskX city takes a Janitor animation list.
 *
 * Every machine is an ordinary entity created through `host.api.create`; the tour is
 * presentation only (outlines, arcs, labels, camera) and never edits the document. One frame
 * loop, through `subscribeFrame`.
 */
import { Box3, BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Raycaster, RingGeometry, SphereGeometry, TubeGeometry, Vector2, Vector3 } from "three";
import "./ecosystem.css";
import { ecoIssues, ecoNode, ECOSYSTEM_SNAPSHOT_DATE, ECOSYSTEM_SOURCE, type EcoNode } from "./ecosystem-data";
import { composeEcosystemWorld, ECO_COLOURS, ECO_HALF, ECO_NODE_TAG, ecoNodeIdOf, KIND_COLOUR, STATUS_COLOUR, type EcoModel } from "./ecosystem-scene";
import { createTourPlayer, DEFAULT_TOUR, parseTour, tourPicture, tourStepLabel, tourText, type TourPicture, type TourStep } from "./ecosystem-tour";
import { relationArc } from "./presentation-links";
import type { PlatformHost } from "./platform-host";
import { motionIsReduced } from "./platform-theme";

export type EcosystemApplication = {
  dispose: () => void;
  state: () => unknown;
  advanceTime: (milliseconds: number) => unknown;
  tour: { play(): void; pause(): void; next(): void; previous(): void; goto(index: number): void; setScript(text: string, autoplay: boolean): void };
};
export type EcosystemEvent = "ready" | "scene-changed" | "node-selected" | "models" | "error";
export type EcosystemMountOptions = {
  play?: string | null;
  onEvent?: (type: EcosystemEvent, detail: Record<string, unknown>) => void;
};

/** Written by scripts/vendor-ecosystem-models.mjs; absent on a checkout without vendored models. */
const ECO_MODELS_MANIFEST = "/assets/ecosystem/models.json";
const OVERVIEW_DIRECTION = new Vector3(0.4, 0.74, 0.6).normalize();
const FLOW_TAG_BUDGET = 8;
const TYPE_SPEED = 48; // characters per second of narration

type Block = { id: string; node: EcoNode; entityId: string; center: Vector3; size: Vector3; top: Vector3 };

export function mountEcosystemApp(root: HTMLElement, host: PlatformHost, onExit: () => void, options: EcosystemMountOptions = {}): EcosystemApplication {
  const params = new URLSearchParams(window.location.search);
  const reduced = motionIsReduced();
  const emit = (type: EcosystemEvent, detail: Record<string, unknown>): void => { try { options.onEvent?.(type, detail); } catch { /* a listener never breaks the house */ } };
  let disposed = false;

  // ---- surface ----------------------------------------------------------------------------
  const surface = document.createElement("section");
  surface.className = "gx-eco";
  surface.setAttribute("aria-label", "La maison connectée");
  surface.innerHTML = `
    <div class="gx-eco-vignette"></div>
    <div class="gx-eco-labels" aria-hidden="true"></div>
    <header class="gx-eco-header">
      <div>
        <span class="gx-eco-eyebrow">AgentX · Écosystème · ${ECOSYSTEM_SNAPSHOT_DATE}</span>
        <h1>La maison <em>connectée</em></h1>
        <p class="gx-eco-sub"></p>
      </div>
      <div class="gx-eco-actions"><button type="button" data-action="exit">Quitter</button></div>
    </header>
    <p class="gx-eco-notice" role="status" data-notice></p>
    <aside class="gx-eco-nestor" aria-label="Nestor">
      <div class="gx-eco-nestor-head"><span class="gx-eco-nestor-mark" aria-hidden="true">N</span><div><span class="gx-eco-nestor-name">Nestor</span><h2 data-title></h2></div></div>
      <p class="gx-eco-narration" data-narration aria-live="polite"></p>
      <ul class="gx-eco-legend"><li data-status="installed">Plein : installé / reçu</li><li data-status="planned">Pointillé : prévu / à confirmer</li><li data-status="attention">Ambre : point ouvert</li></ul>
    </aside>
    <section class="gx-eco-tour" aria-label="Visite guidée">
      <ol class="gx-eco-steps" data-steps aria-label="Étapes de la visite"></ol>
      <div class="gx-eco-controls">
        <button type="button" data-action="previous" aria-label="Étape précédente">⏮</button>
        <button type="button" data-action="toggle" aria-label="Lire">▶ Lire</button>
        <button type="button" data-action="next" aria-label="Étape suivante">⏭</button>
        <progress data-progress max="1" value="0" aria-label="Avancement de l'étape"></progress>
        <span class="gx-eco-count" data-count></span>
        <span class="gx-eco-tip"><kbd>clic</kbd> une machine · <kbd>←</kbd><kbd>→</kbd> étapes · <kbd>espace</kbd> lire · <kbd>Échap</kbd> vue d'ensemble</span>
      </div>
    </section>
    <div class="gx-eco-card" data-card data-empty="true"><h3></h3><p></p></div>`;
  const element = <T extends HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const button = (action: string): HTMLButtonElement => element<HTMLButtonElement>(`[data-action="${action}"]`);
  const labelsLayer = element<HTMLDivElement>(".gx-eco-labels");
  element(".gx-eco-sub").textContent = `${ECOSYSTEM_SOURCE} · installé ≠ entièrement qualifié`;
  root.append(surface);

  // ---- the house --------------------------------------------------------------------------
  // Composed at once from primitives; recomposed with the vendored models once the manifest
  // (written by scripts/vendor-ecosystem-models.mjs) has been read, if it lists any.
  let blocks: Block[] = [];
  let models: Record<string, EcoModel> = {};
  function buildHouse(): void {
    const world = composeEcosystemWorld({ motes: !reduced, models });
    const created = host.api.create(world);
    if (!created.ok) throw new Error(created.error);
    host.api.pause(false);
    host.applyEnvironment();
    blocks = host.api.query({ tag: ECO_NODE_TAG }).map((entity) => {
      const id = ecoNodeIdOf(entity.tags);
      const node = id ? ecoNode(id) : null;
      if (!id || !node) return null;
      const object = host.world.getEntityObject(entity.id);
      const bounds = object ? new Box3().setFromObject(object) : null;
      const center = bounds ? bounds.getCenter(new Vector3()) : new Vector3(...entity.position);
      const size = bounds ? bounds.getSize(new Vector3()) : new Vector3(entity.geometry.width, entity.geometry.height, entity.geometry.depth);
      return { id, node, entityId: entity.id, center, size, top: new Vector3(center.x, center.y + size.y / 2, center.z) };
    }).filter((block): block is Block => block !== null);
  }
  buildHouse();
  const blockOf = (id: string): Block | null => blocks.find((block) => block.id === id) ?? null;
  void fetch(ECO_MODELS_MANIFEST).then(async (response) => {
    if (!response.ok) return;
    const manifest = await response.json() as { models?: Record<string, { url?: unknown; size?: unknown }> };
    const next: Record<string, EcoModel> = {};
    for (const [id, entry] of Object.entries(manifest.models ?? {})) {
      if (!ecoNode(id) || typeof entry?.url !== "string" || !Array.isArray(entry.size) || entry.size.length !== 3 || !entry.size.every((n) => typeof n === "number" && n > 0)) continue;
      next[id] = { url: entry.url, size: entry.size as [number, number, number] };
    }
    if (disposed || !Object.keys(next).length) return;
    models = next;
    buildHouse();
    if (picture) drawPicture(picture);
    emit("models", { nodes: Object.keys(next) });
  }).catch(() => { /* no manifest: the primitives stand */ });

  // ---- picture layer: outlines, rings, arcs ------------------------------------------------
  const layer = new Group();
  layer.name = "ecosystem-tour";
  host.scene.add(layer);
  const unitEdges = new EdgesGeometry(new BoxGeometry(1, 1, 1));
  const ringGeometry = new RingGeometry(0.72, 1, 48);
  ringGeometry.rotateX(-Math.PI / 2);
  const beadGeometry = new SphereGeometry(0.22, 12, 8);
  let outlines: { lines: LineSegments; ring: Mesh; material: LineBasicMaterial; ringMaterial: MeshBasicMaterial; phase: number }[] = [];
  let arcs: { tube: TubeGeometry; mesh: Mesh; bead: Mesh; curve: ReturnType<typeof relationArc>; phase: number; material: MeshBasicMaterial; beadMaterial: MeshBasicMaterial }[] = [];
  let flowTags: { element: HTMLDivElement; at: Vector3 }[] = [];
  let time = 0;
  function clearPicture(): void {
    for (const item of outlines) { item.material.dispose(); item.ringMaterial.dispose(); }
    for (const item of arcs) { item.tube.dispose(); item.material.dispose(); item.beadMaterial.dispose(); }
    for (const tag of flowTags) tag.element.remove();
    outlines = []; arcs = []; flowTags = [];
    layer.clear();
  }
  function drawPicture(picture: TourPicture): void {
    clearPicture();
    const amber = new Set(picture.amber);
    for (const id of new Set([...picture.focus, ...picture.amber])) {
      const block = blockOf(id);
      if (!block) continue;
      const colour = amber.has(id) ? ECO_COLOURS.amber : picture.focus.includes(id) ? ECO_COLOURS.cyan : ECO_COLOURS.ivory;
      const material = new LineBasicMaterial({ color: colour, transparent: true, opacity: 0.95, depthTest: false });
      const lines = new LineSegments(unitEdges, material);
      lines.position.copy(block.center);
      lines.scale.set(block.size.x + 0.3, block.size.y + 0.3, block.size.z + 0.3);
      lines.renderOrder = 1000;
      const ringMaterial = new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.55, depthWrite: false });
      const ring = new Mesh(ringGeometry, ringMaterial);
      ring.position.set(block.center.x, 0.09, block.center.z);
      const radius = Math.hypot(block.size.x, block.size.z) * 0.62;
      ring.scale.set(radius, 1, radius);
      ring.renderOrder = 998;
      layer.add(lines, ring);
      outlines.push({ lines, ring, material, ringMaterial, phase: outlines.length * 0.6 });
    }
    const flowColour = picture.amber.length && !picture.focus.length ? ECO_COLOURS.amber : ECO_COLOURS.cyan;
    picture.flow.forEach((flow, index) => {
      const from = blockOf(flow.from), to = blockOf(flow.to);
      if (!from || !to) return;
      const curve = relationArc(from.top.clone().add(new Vector3(0, 0.3, 0)), to.top.clone().add(new Vector3(0, 0.3, 0)));
      const tube = new TubeGeometry(curve, 40, 0.07, 6, false);
      const material = new MeshBasicMaterial({ color: flowColour, transparent: true, opacity: 0.55, depthWrite: false });
      const mesh = new Mesh(tube, material);
      mesh.renderOrder = 5;
      const beadMaterial = new MeshBasicMaterial({ color: "#ffffff" });
      const bead = new Mesh(beadGeometry, beadMaterial);
      bead.renderOrder = 6;
      layer.add(mesh, bead);
      arcs.push({ tube, mesh, bead, curve, phase: index * 0.21, material, beadMaterial });
      if (flow.label && flowTags.length < FLOW_TAG_BUDGET) {
        const tag = document.createElement("div");
        tag.className = "gx-eco-flowtag";
        tag.dataset.role = flowColour === ECO_COLOURS.amber ? "amber" : "flow";
        tag.textContent = flow.label;
        labelsLayer.append(tag);
        flowTags.push({ element: tag, at: curve.getPoint(0.5) });
      }
    });
    layer.visible = true;
  }

  // ---- camera -----------------------------------------------------------------------------
  function overviewCamera(seconds: number): void {
    const position = OVERVIEW_DIRECTION.clone().multiplyScalar(ECO_HALF * 2.25).add(new Vector3(0, 0.6, 1));
    host.frameView([position.x, position.y, position.z], [0, 0.6, 1], seconds);
  }
  function frameNodes(ids: readonly string[], seconds: number): void {
    const found = ids.map(blockOf).filter((block): block is Block => block !== null);
    if (!found.length) { overviewCamera(seconds); return; }
    const box = new Box3();
    for (const block of found) box.expandByPoint(block.center.clone().sub(block.size.clone().multiplyScalar(0.5))).expandByPoint(block.center.clone().add(block.size.clone().multiplyScalar(0.5)));
    const center = box.getCenter(new Vector3());
    const extent = box.getSize(new Vector3());
    const span = Math.max(9, extent.x, extent.z);
    const at = OVERVIEW_DIRECTION.clone().multiplyScalar(span * 1.35 + extent.y * 1.2 + 6).add(new Vector3(center.x, 0, center.z));
    host.frameView([at.x, at.y, at.z], [center.x, Math.min(extent.y * 0.4, 3), center.z], seconds);
  }

  // ---- the tour ---------------------------------------------------------------------------
  const requested = options.play ?? params.get("play");
  let notice = "";
  let steps: TourStep[];
  try { steps = parseTour(requested || DEFAULT_TOUR); }
  catch (error) {
    steps = parseTour(DEFAULT_TOUR);
    notice = `Liste refusée (${error instanceof Error ? error.message : String(error)}) : visite complète à la place.`;
    emit("error", { stage: "play", message: error instanceof Error ? error.message : String(error) });
  }
  const player = createTourPlayer(steps);
  /** A machine the visitor clicked: shown over the current stop until Escape or the next stop. */
  let adhoc: TourStep | null = null;
  let picture: TourPicture | null = null;
  let narrationFull = "";
  let narrationShown = 0;
  const currentStep = (): TourStep | null => adhoc ?? player.state().step;

  function renderSteps(): void {
    const list = element<HTMLOListElement>("[data-steps]");
    const state = player.state();
    list.replaceChildren(...player.steps().map((step, at) => {
      const li = document.createElement("li");
      const chip = document.createElement("button");
      chip.type = "button"; chip.textContent = tourStepLabel(step);
      if (at === state.index && !adhoc) chip.setAttribute("aria-current", "step");
      chip.addEventListener("click", () => { adhoc = null; player.goto(at); enter(); });
      li.append(chip);
      return li;
    }));
    const toggle = button("toggle");
    toggle.textContent = state.playing ? "⏸ Pause" : "▶ Lire";
    toggle.setAttribute("aria-label", state.playing ? "Pause" : "Lire");
    element("[data-count]").textContent = `${state.index + 1} / ${state.count}`;
  }
  function enter(seconds = reduced ? 0 : 1.1): void {
    const step = currentStep();
    if (!step) return;
    picture = tourPicture(step);
    drawPicture(picture);
    element("[data-title]").textContent = picture.title;
    narrationFull = picture.narration;
    narrationShown = reduced ? narrationFull.length : 0;
    element("[data-narration]").textContent = reduced ? narrationFull : "";
    if (picture.wide) overviewCamera(seconds); else frameNodes([...picture.focus, ...picture.amber], seconds);
    renderSteps();
    element("[data-notice]").textContent = notice;
    const state = player.state();
    emit("scene-changed", { index: state.index, count: state.count, kind: step.kind, label: tourStepLabel(step), playing: state.playing, script: tourText(player.steps()), adhoc: adhoc !== null });
  }
  function openNode(id: string): void {
    if (!ecoNode(id)) return;
    player.pause();
    adhoc = { kind: "node", id };
    enter(reduced ? 0 : 0.8);
    const node = ecoNode(id)!;
    emit("node-selected", { id, name: node.name, kind: node.kind, status: node.status, attention: node.attention ?? null });
  }
  function closeAdhoc(): void {
    if (adhoc) { adhoc = null; enter(); return; }
    player.pause();
    player.goto(0);
    enter();
  }
  button("previous").addEventListener("click", () => { adhoc = null; if (player.previous()) enter(); else enter(0); });
  button("next").addEventListener("click", () => { adhoc = null; if (player.next()) enter(); else enter(0); });
  button("toggle").addEventListener("click", () => {
    if (player.state().playing) player.pause();
    else { adhoc = null; const before = player.state().index; player.play(); if (player.state().index !== before) { enter(); return; } }
    renderSteps();
  });
  button("exit").addEventListener("click", onExit);

  // ---- hover and pick -----------------------------------------------------------------------
  const halo = new LineSegments(unitEdges, new LineBasicMaterial({ color: ECO_COLOURS.cyan, transparent: true, opacity: 0.95, depthTest: false }));
  halo.visible = false; halo.renderOrder = 999; halo.name = "eco-hover-halo";
  host.scene.add(halo);
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const pointer = { x: 0, y: 0, dirty: false, inside: false };
  let hovered: Block | null = null;
  const dom = host.renderer.domElement;
  const pick = (clientX: number, clientY: number): Block | null => {
    const rect = dom.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, host.camera);
    for (const hit of raycaster.intersectObjects(host.world.group.children, true)) {
      const entityId = host.world.findEntityId(hit.object);
      if (!entityId) continue;
      const entity = host.api.query({ ids: [entityId] })[0];
      const id = ecoNodeIdOf(entity?.tags);
      if (!id) return null;
      // devX sits inside UGBrutal's glass: the inner box wins when the ray reaches it first.
      return blockOf(id);
    }
    return null;
  };
  function setHovered(block: Block | null): void {
    if (block === hovered) return;
    hovered = block;
    const card = element<HTMLElement>("[data-card]");
    card.dataset.empty = String(!block);
    if (!block) { halo.visible = false; return; }
    halo.position.copy(block.center);
    halo.scale.set(block.size.x + 0.12, block.size.y + 0.12, block.size.z + 0.12);
    (halo.material as LineBasicMaterial).color.set(STATUS_COLOUR[block.node.status]);
    halo.visible = true;
    card.style.setProperty("--c", block.node.status === "installed" ? KIND_COLOUR[block.node.kind] : STATUS_COLOUR[block.node.status]);
    card.querySelector("h3")!.textContent = `${block.node.name} · ${block.node.subtitle}`;
    const lines = [...(block.node.specs ?? []), ...(block.node.roles ?? []).slice(0, 3)];
    card.querySelector("p")!.textContent = [lines.join(" · "), block.node.attention ? `⚠ ${block.node.attention}` : "", block.node.planned ? `◌ ${block.node.planned}` : ""].filter(Boolean).join("\n");
  }
  let down: { x: number; y: number } | null = null;
  const onPointerDown = (event: PointerEvent): void => { down = { x: event.clientX, y: event.clientY }; };
  const onPointerMove = (event: PointerEvent): void => { pointer.x = event.clientX; pointer.y = event.clientY; pointer.dirty = true; pointer.inside = true; };
  const onPointerLeave = (): void => { pointer.inside = false; pointer.dirty = true; };
  const onPointerUp = (event: PointerEvent): void => {
    const start = down; down = null;
    if (!start || host.mode === "editor" || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const block = pick(event.clientX, event.clientY);
    if (block) openNode(block.id);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || host.mode === "editor") return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.tagName === "BUTTON")) return;
    if (event.key === "Escape") { event.preventDefault(); closeAdhoc(); }
    else if (event.key === "ArrowRight") { event.preventDefault(); button("next").click(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); button("previous").click(); }
    else if (event.key === " ") { event.preventDefault(); button("toggle").click(); }
  };
  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointermove", onPointerMove);
  dom.addEventListener("pointerleave", onPointerLeave);
  dom.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", onKey);

  // ---- labels -------------------------------------------------------------------------------
  // Projected HTML, then decluttered: a lit label (the stop's focus, the hover) is stacked up
  // when it would cover another lit one; an unlit label that would cover anything is hidden.
  const projected = new Vector3();
  const labelPool: HTMLDivElement[] = [];
  type Placed = { element: HTMLElement; x: number; y: number; width: number; height: number; priority: number; anchor: "bottom" | "centre" };
  const CHAR = 6.8;
  const overlaps = (a: Placed, b: Placed): boolean => Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2;
  function updateLabels(): void {
    const rect = dom.getBoundingClientRect();
    while (labelPool.length < blocks.length) {
      const label = document.createElement("div");
      label.className = "gx-eco-label";
      label.innerHTML = "<span></span><small></small>";
      labelsLayer.append(label);
      labelPool.push(label);
    }
    const focus = new Set(picture ? [...picture.focus, ...picture.amber] : []);
    const cameraDistance = host.camera.position.length();
    const far = cameraDistance / (ECO_HALF * 3.4);
    const candidates: Placed[] = [];
    blocks.forEach((block, index) => {
      const label = labelPool[index];
      projected.copy(block.top).setY(block.top.y + 0.3).project(host.camera);
      const lit = focus.has(block.id) || hovered === block;
      const visible = projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
      const small = block.node.kind === "service" || block.node.kind === "client" || block.node.kind === "spare" || block.node.kind === "external";
      const fade = lit ? 1 : small ? Math.max(0, Math.min(0.85, 1.4 - far * 1.6)) : Math.max(0.4, Math.min(0.95, 1.5 - far));
      if (!visible || fade <= 0.05) { label.style.opacity = "0"; label.style.transform = "translate(-9999px,-9999px)"; return; }
      label.style.setProperty("--c", block.node.status === "installed" ? KIND_COLOUR[block.node.kind] : STATUS_COLOUR[block.node.status]);
      label.dataset.lit = String(lit);
      label.dataset.status = block.node.status;
      label.style.opacity = String(fade);
      const nameNode = label.firstElementChild as HTMLElement, subNode = label.lastElementChild as HTMLElement;
      if (nameNode.textContent !== block.node.name) nameNode.textContent = block.node.name;
      const sub = block.node.attention ? `⚠ ${block.node.attention}` : block.node.subtitle;
      if (subNode.textContent !== sub) subNode.textContent = sub;
      const width = 18 + Math.min(220, Math.max(block.node.name.length, sub.length) * CHAR);
      candidates.push({ element: label, x: (projected.x + 1) / 2 * rect.width, y: (1 - projected.y) / 2 * rect.height - 8 - 16, width, height: 34,
        priority: hovered === block ? 4 : lit ? 3 : small ? 1 : 2, anchor: "bottom" });
    });
    for (const tag of flowTags) {
      projected.copy(tag.at).project(host.camera);
      const visible = projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
      if (!visible) { tag.element.style.opacity = "0"; continue; }
      tag.element.style.opacity = "1";
      candidates.push({ element: tag.element, x: (projected.x + 1) / 2 * rect.width, y: (1 - projected.y) / 2 * rect.height, width: 14 + (tag.element.textContent?.length ?? 0) * CHAR, height: 22, priority: 3, anchor: "centre" });
    }
    candidates.sort((a, b) => b.priority - a.priority || a.y - b.y);
    const placed: Placed[] = [];
    for (const candidate of candidates) {
      let tries = candidate.priority >= 3 ? 4 : 0;
      while (placed.some((other) => overlaps(candidate, other)) && tries > 0) { candidate.y -= candidate.height + 4; tries -= 1; }
      if (placed.some((other) => overlaps(candidate, other))) { candidate.element.style.opacity = "0"; candidate.element.style.transform = "translate(-9999px,-9999px)"; continue; }
      placed.push(candidate);
      candidate.element.style.transform = candidate.anchor === "bottom"
        ? `translate(${candidate.x.toFixed(1)}px, ${(candidate.y + 16).toFixed(1)}px) translate(-50%, -100%)`
        : `translate(${candidate.x.toFixed(1)}px, ${candidate.y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  // ---- frame ---------------------------------------------------------------------------------
  let editing = false;
  const frame = (delta: number): void => {
    if (disposed) return;
    time += delta;
    const nowEditing = host.mode === "editor";
    if (nowEditing !== editing) {
      editing = nowEditing;
      for (const node of surface.children) if (node instanceof HTMLElement && !node.classList.contains("gx-eco-vignette")) node.hidden = editing;
      layer.visible = !editing;
      if (editing) setHovered(null);
    }
    if (player.tick(delta)) { adhoc = null; enter(); }
    const state = player.state();
    element<HTMLProgressElement>("[data-progress]").value = state.seconds ? Math.min(1, state.elapsed / state.seconds) : 0;
    if (narrationShown < narrationFull.length) {
      narrationShown = Math.min(narrationFull.length, narrationShown + delta * TYPE_SPEED);
      element("[data-narration]").textContent = narrationFull.slice(0, Math.floor(narrationShown));
    }
    const pulse = reduced ? 1 : 0.75 + 0.25 * Math.sin(time * 2.4);
    for (const item of outlines) { item.ringMaterial.opacity = 0.25 + 0.35 * (reduced ? 1 : 0.5 + 0.5 * Math.sin(time * 2.4 + item.phase)); item.material.opacity = 0.7 + 0.3 * pulse; }
    for (const item of arcs) item.bead.position.copy(item.curve.getPoint(reduced ? 0.5 : (time * 0.28 + item.phase) % 1));
    if (pointer.dirty && !editing) {
      pointer.dirty = false;
      setHovered(pointer.inside ? pick(pointer.x, pointer.y) : null);
    }
    if (!editing) updateLabels();
  };
  const unsubscribe = host.subscribeFrame(frame);

  overviewCamera(0);
  if (requested) player.play();
  enter(0);
  const first = picture as TourPicture | null;
  if (!reduced && (!first || first.wide)) {
    // Entry: a rise from the edge of the plateau to the overview, so the house reveals itself.
    const start = OVERVIEW_DIRECTION.clone().multiplyScalar(ECO_HALF * 1.6).setY(2.4);
    host.frameView([start.x, start.y, start.z], [0, 1.5, 0], 0);
    overviewCamera(1.8);
  }
  emit("ready", { nodes: blocks.length, issues: ecoIssues().length, script: tourText(player.steps()), snapshot: ECOSYSTEM_SNAPSHOT_DATE });

  const state = (): unknown => {
    const rect = dom.getBoundingClientRect();
    const tour = player.state();
    const step = currentStep();
    return {
      application: "ecosystem",
      snapshot: ECOSYSTEM_SNAPSHOT_DATE,
      tour: { index: tour.index, count: tour.count, playing: tour.playing, kind: step?.kind ?? null, label: step ? tourStepLabel(step) : null, script: tourText(player.steps()), adhoc: adhoc ? tourText([adhoc]) : null, title: picture?.title ?? null },
      narration: element("[data-narration]").textContent ?? "",
      narrationComplete: narrationShown >= narrationFull.length,
      focus: picture?.focus ?? [], amber: picture?.amber ?? [], arcs: arcs.length,
      hovered: hovered?.id ?? null,
      notice,
      models: Object.keys(models),
      nodes: blocks.map((block) => {
        const point = block.top.clone().project(host.camera);
        const onScreen = point.z < 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;
        return { id: block.id, name: block.node.name, kind: block.node.kind, status: block.node.status, entityId: block.entityId,
          screen: onScreen ? [Math.round(rect.left + (point.x + 1) / 2 * rect.width), Math.round(rect.top + (1 - point.y) / 2 * rect.height)] : null };
      }),
    };
  };

  return {
    state,
    advanceTime: (milliseconds: number) => { frame(Math.max(0, milliseconds) / 1000); return state(); },
    tour: {
      play: () => { adhoc = null; player.play(); enter(); },
      pause: () => { player.pause(); renderSteps(); },
      next: () => { adhoc = null; if (player.next()) enter(); },
      previous: () => { adhoc = null; if (player.previous()) enter(); },
      goto: (index) => { adhoc = null; player.goto(index); enter(); },
      setScript: (text, autoplay) => { player.replace(parseTour(text)); adhoc = null; notice = ""; if (autoplay) player.play(); else player.pause(); enter(); },
    },
    dispose: () => {
      disposed = true;
      unsubscribe();
      clearPicture();
      layer.removeFromParent();
      unitEdges.dispose(); ringGeometry.dispose(); beadGeometry.dispose();
      host.scene.remove(halo);
      (halo.material as LineBasicMaterial).dispose();
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerleave", onPointerLeave);
      dom.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKey);
      surface.remove();
    },
  };
}

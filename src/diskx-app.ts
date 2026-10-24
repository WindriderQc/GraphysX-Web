/**
 * DiskX — a TreeSize you walk through.
 *
 * The application surface for `?app=diskx`: the disks AgentX Data has indexed, laid out as a
 * neon city one folder level at a time. Every block is an ordinary entity (`diskx-scene.ts`),
 * created through `host.api.create` like any Browse row; clicking a district replaces the
 * world with that folder's city, and "remonter" rebuilds the parent's. The HUD is a projection
 * of the same tree: its folder list and the 3D blocks are two handles on one `DiskxNode`, so a
 * keyboard user and a pointer user make the same dive.
 *
 * What is *not* scene state lives here as presentation only: the hover outline, the floating
 * labels (HTML projected through the camera each frame) and the camera moves. All of it runs
 * from the host's one frame loop through `subscribeFrame`; there is no second rAF.
 */

import { Box3, BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments, Raycaster, Vector2, Vector3 } from "three";
import "./diskx.css";
import {
  buildDiskxTree,
  categoryShares,
  DISKX_PALETTE,
  DISKX_REST_PATH,
  formatBytes,
  formatCount,
  layoutDiskxCity,
  pathCrumbs,
  type DiskxCategory,
  type DiskxCityLayout,
  type DiskxDirectoryRow,
  type DiskxFileRow,
  type DiskxNode,
  type DiskxTree,
} from "./diskx-data";
import { composeDiskxWorld, DISKX_DISTRICT_TAG, diskxPathOf } from "./diskx-scene";
import { createFixtureSource, DISKX_FIXTURE, resolveDiskxSource, type DiskxSource, type DiskxSummary } from "./diskx-source";
import type { PlatformHost } from "./platform-host";
import { motionIsReduced } from "./platform-theme";

export type DiskxApplication = {
  dispose: () => void;
  state: () => unknown;
  advanceTime: (milliseconds: number) => unknown;
};

/** Virtual level above the scanned roots: one district per disk. */
export const DISKX_ALL_PATH = "diskx://all";

const CITY_SIZE = 40;
const LABEL_BUDGET = 18;
const OVERVIEW_DIRECTION = new Vector3(0.44, 0.52, 0.74).normalize();

export function mountDiskxApp(root: HTMLElement, host: PlatformHost, onExit: () => void): DiskxApplication {
  const params = new URLSearchParams(window.location.search);
  const reduced = motionIsReduced();
  const forceFixture = params.get("source") === "fixture";

  // ---- data -----------------------------------------------------------------------------
  const rows = new Map<string, DiskxDirectoryRow>();
  for (const row of DISKX_FIXTURE.directories) rows.set(row.path, row);
  let source: DiskxSource = createFixtureSource();
  let summary: DiskxSummary | null = null;
  let tree: DiskxTree = buildDiskxTree(source.roots, [...rows.values()]);
  let all = makeAllNode(tree);
  const fetched = new Set<string>();
  const truncated = new Set<string>();
  let loading = 0;
  let notice = "";
  let focus: DiskxNode = resolveInitialFocus(params.get("root"));
  const history: string[] = [];
  let layout: DiskxCityLayout | null = null;
  let listMode: { kind: "top" } | { kind: "rest"; nodes: DiskxNode[] } = { kind: "top" };
  let files: DiskxFileRow[] = [];
  let filesFor: string | null = null;
  let disposed = false;

  function makeAllNode(current: DiskxTree): DiskxNode {
    const node: DiskxNode = {
      path: DISKX_ALL_PATH, name: "Tous les disques", depth: -1, ownSize: 0, ownFiles: 0,
      totalSize: current.roots.reduce((sum, r) => sum + r.totalSize, 0),
      totalFiles: current.roots.reduce((sum, r) => sum + r.totalFiles, 0),
      largestFile: null, category: current.roots[0]?.category ?? "other", children: [...current.roots], reported: false,
    };
    return node;
  }
  function nodeAt(path: string | null): DiskxNode | null {
    if (!path) return null;
    if (path === DISKX_ALL_PATH) return all;
    return tree.byPath.get(path) ?? null;
  }
  function resolveInitialFocus(requested: string | null): DiskxNode {
    return nodeAt(requested) ?? all;
  }
  function parentOf(node: DiskxNode): DiskxNode | null {
    if (node.path === DISKX_ALL_PATH) return null;
    if (node.depth === 0) return all;
    return tree.byPath.get(node.path.slice(0, node.path.lastIndexOf("/"))) ?? all;
  }
  function crumbsOf(node: DiskxNode): DiskxNode[] {
    return node.path === DISKX_ALL_PATH ? [all] : [all, ...pathCrumbs(tree, node)];
  }
  function rebuildTree(): void {
    const keep = focus.path;
    tree = buildDiskxTree(source.roots, [...rows.values()]);
    all = makeAllNode(tree);
    focus = nodeAt(keep) ?? all;
  }

  // ---- surface ----------------------------------------------------------------------------
  const surface = document.createElement("section");
  surface.className = "gx-diskx";
  surface.setAttribute("aria-label", "DiskX");
  surface.innerHTML = `
    <div class="gx-diskx-vignette"></div><div class="gx-diskx-scan"></div>
    <div class="gx-diskx-labels" aria-hidden="true"></div>
    <header class="gx-diskx-header">
      <div>
        <span class="gx-diskx-eyebrow">DiskX</span>
        <h1>Vos disques, <em>en ville</em></h1>
        <p class="gx-diskx-sub" data-sub></p>
        <nav class="gx-diskx-crumbs" aria-label="Chemin" data-crumbs></nav>
      </div>
      <div class="gx-diskx-actions">
        <div class="row"><button type="button" data-action="up">↑ Remonter</button><button type="button" data-action="editor">Éditeur</button><button type="button" data-action="exit">Quitter DiskX</button></div>
        <span class="gx-diskx-source" data-source data-kind="fixture" role="status" aria-live="polite"></span>
      </div>
    </header>
    <p class="gx-diskx-notice" role="status" data-notice></p>
    <aside class="gx-diskx-panel" aria-label="Détails du dossier">
      <h2>Ce niveau</h2>
      <div class="gx-diskx-totals" data-totals></div>
      <h2>Par type</h2>
      <ul class="gx-diskx-legend" data-legend></ul>
      <h2 data-list-title>Dossiers</h2>
      <ul class="gx-diskx-list" data-list></ul>
      <div data-files-section hidden><h2 style="margin-top:14px">Plus gros fichiers</h2><ul class="gx-diskx-list" data-files></ul></div>
    </aside>
    <div class="gx-diskx-card" data-card data-empty="true"><h3>Survole un quartier</h3><p>Chaque bloc est un dossier. Sa surface, ce sont ses octets; sa hauteur, sa part du niveau.</p></div>
    <p class="gx-diskx-tip"><kbd>clic</kbd> plonger · <kbd>Échap</kbd> remonter · <kbd>glisser</kbd> orbiter · <kbd>molette</kbd> zoomer</p>`;
  const element = <T extends HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const button = (action: string): HTMLButtonElement => element<HTMLButtonElement>(`[data-action="${action}"]`);
  const labelsLayer = element<HTMLDivElement>(".gx-diskx-labels");
  root.append(surface);

  // ---- presentation: hover outline ----------------------------------------------------------
  const halo = new LineSegments(new EdgesGeometry(new BoxGeometry(1, 1, 1)), new LineBasicMaterial({ color: "#4ff2ff", transparent: true, opacity: 0.95, depthTest: false }));
  halo.visible = false;
  halo.renderOrder = 999;
  halo.name = "diskx-hover-halo";
  host.scene.add(halo);
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const pointer = { x: 0, y: 0, dirty: false, inside: false };
  let hovered: DiskxNode | null = null;
  let hoveredEntityId: string | null = null;

  // ---- city ---------------------------------------------------------------------------------
  type Block = { node: DiskxNode; entityId: string; category: DiskxCategory; top: Vector3; halfWidth: number; halfDepth: number };
  let blocks: Block[] = [];
  const labelPool: HTMLDivElement[] = [];

  function buildCity(): void {
    layout = layoutDiskxCity(focus, { size: CITY_SIZE });
    const world = composeDiskxWorld(layout, { motes: !reduced });
    const result = host.api.create(world);
    if (!result.ok) throw new Error(result.error);
    host.api.pause(false);
    host.applyEnvironment();
    blocks = host.api.query({ tag: DISKX_DISTRICT_TAG }).map((entity) => {
      const path = diskxPathOf(entity.tags);
      const node = path === DISKX_REST_PATH
        ? layout!.blocks.find((block) => block.node.path === DISKX_REST_PATH)!.node
        : nodeAt(path);
      const top = new Vector3(entity.position[0], entity.position[1] + entity.geometry.height / 2, entity.position[2]);
      return node ? { node, entityId: entity.id, category: node.category, top, halfWidth: entity.geometry.width / 2, halfDepth: entity.geometry.depth / 2 } : null;
    }).filter((block): block is Block => block !== null);
    blocks.sort((a, b) => b.node.totalSize - a.node.totalSize);
    listMode = { kind: "top" };
    hovered = null;
    hoveredEntityId = null;
    halo.visible = false;
    files = [];
    filesFor = null;
    render();
    void loadFiles(focus);
  }

  function overviewCamera(seconds: number): void {
    const distance = CITY_SIZE * 1.55;
    const position = OVERVIEW_DIRECTION.clone().multiplyScalar(distance).add(new Vector3(0, 0.6, 0));
    host.frameView([position.x, position.y, position.z], [0, 0.6, 0], seconds);
  }

  // Dive choreography, run by the frame loop: plunge toward the block, swap the city at the
  // bottom of the plunge, rise over the new level. Reduced motion skips straight to the swap.
  let pending: { at: number; elapsed: number; run: () => void } | null = null;
  function dive(node: DiskxNode, from?: Block): void {
    if (node.path === DISKX_REST_PATH) {
      listMode = { kind: "rest", nodes: node.children };
      render();
      return;
    }
    if (node.children.length === 0 && node.totalSize === node.ownSize) {
      notice = `${node.name} ne contient que des fichiers (${formatCount(node.ownFiles)}).`;
      void loadFiles(node, true);
      render();
      return;
    }
    const swap = (): void => {
      history.push(focus.path);
      focus = node;
      notice = "";
      buildCity();
      overviewCamera(reduced ? 0 : 0.9);
      void refine(node);
    };
    if (reduced || !from) {
      swap();
      return;
    }
    const target = from.top.clone();
    const size = Math.max(3, (layout?.blocks.find((block) => block.node === from.node)?.rect.width ?? 4));
    const direction = host.camera.position.clone().sub(target).normalize();
    if (direction.y < 0.3) direction.y = 0.3;
    direction.normalize();
    const position = target.clone().addScaledVector(direction, Math.max(9, size * 1.6));
    host.frameView([position.x, position.y, position.z], [target.x, target.y, target.z], 0.5);
    pending = { at: 0.5, elapsed: 0, run: swap };
  }
  function up(): void {
    if (host.mode === "editor") return;
    if (listMode.kind === "rest") {
      listMode = { kind: "top" };
      render();
      return;
    }
    const parent = parentOf(focus);
    if (!parent) return;
    history.pop();
    focus = parent;
    notice = "";
    buildCity();
    overviewCamera(reduced ? 0 : 0.9);
  }
  function goTo(node: DiskxNode): void {
    if (node === focus) return;
    history.push(focus.path);
    focus = node;
    notice = "";
    buildCity();
    overviewCamera(reduced ? 0 : 0.9);
    void refine(node);
  }

  // ---- live data --------------------------------------------------------------------------
  function setLoading(delta: number): void {
    loading = Math.max(0, loading + delta);
    renderSource();
  }
  async function refine(node: DiskxNode): Promise<void> {
    if (source.kind !== "live" || node.path === DISKX_ALL_PATH || fetched.has(node.path)) return;
    fetched.add(node.path);
    setLoading(1);
    try {
      const page = await source.tree(node.path);
      if (disposed) return;
      for (const row of page.rows) rows.set(row.path, row);
      if (page.truncated) truncated.add(node.path); else truncated.delete(node.path);
      rebuildTree();
      if (focus.path === node.path) {
        buildCity();
      } else render();
    } catch (error) {
      notice = `AgentX Data n’a pas répondu pour ${node.name}: ${error instanceof Error ? error.message : String(error)}`;
      render();
    } finally {
      setLoading(-1);
    }
  }
  async function loadFiles(node: DiskxNode, show = false): Promise<void> {
    if (node.path === DISKX_ALL_PATH || node.path === DISKX_REST_PATH) return;
    const path = node.path;
    try {
      const list = await source.files(path, 8);
      if (disposed || (focus.path !== path && !show)) return;
      files = list;
      filesFor = path;
      render();
    } catch {
      // Files are a garnish; the city stands without them.
    }
  }
  void resolveDiskxSource({ forceFixture }).then(async (resolved) => {
    if (disposed) return;
    source = resolved;
    renderSource();
    setLoading(1);
    try {
      summary = await source.summary();
      if (source.kind === "live") {
        for (const diskRoot of source.roots) {
          fetched.add(diskRoot);
          const page = await source.tree(diskRoot);
          if (disposed) return;
          for (const row of page.rows) rows.set(row.path, row);
          if (page.truncated) truncated.add(diskRoot);
        }
        rebuildTree();
        buildCity();
        if (focus.path !== DISKX_ALL_PATH) await refine(focus);
      } else render();
    } catch (error) {
      if (disposed) return;
      notice = `AgentX Data injoignable, capture affichée: ${error instanceof Error ? error.message : String(error)}`;
      source = createFixtureSource();
      summary = await source.summary();
      render();
    } finally {
      if (!disposed) setLoading(-1);
    }
  });

  // ---- HUD rendering ------------------------------------------------------------------------
  function renderSource(): void {
    const badge = element<HTMLSpanElement>("[data-source]");
    badge.dataset.kind = source.kind;
    badge.dataset.loading = String(loading > 0);
    const when = summary?.lastScanAt ? new Date(summary.lastScanAt).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : null;
    badge.textContent = source.kind === "live"
      ? `${loading ? "Lecture… " : ""}AgentX Data en direct${when ? ` · scan ${when}` : ""}`
      : `Capture AgentX Data${when ? ` · ${when}` : ""}${loading ? " · connexion…" : ""}`;
    badge.title = summary?.origin ?? "";
  }
  function render(): void {
    const crumbs = crumbsOf(focus);
    element("[data-sub]").textContent = focus.path === DISKX_ALL_PATH
      ? `${formatCount(all.children.length)} disques indexés par AgentX Data`
      : focus.path;
    const nav = element<HTMLElement>("[data-crumbs]");
    nav.replaceChildren(...crumbs.flatMap((node, index) => {
      const crumb = document.createElement("button");
      crumb.type = "button";
      crumb.textContent = node.name;
      crumb.title = node.path;
      if (node === focus) crumb.setAttribute("aria-current", "true");
      else crumb.addEventListener("click", () => goTo(node));
      if (index === 0) return [crumb];
      const sep = document.createElement("span");
      sep.className = "gx-diskx-sep";
      sep.textContent = "▸";
      return [sep, crumb];
    }));
    button("up").disabled = !parentOf(focus) && listMode.kind !== "rest";
    element("[data-notice]").textContent = notice;

    const totals = element("[data-totals]");
    const approx = focus.path === DISKX_ALL_PATH ? [...truncated].length > 0 : truncated.has(focus.path) || [...truncated].some((path) => focus.path.startsWith(`${path}/`));
    totals.innerHTML = [
      [formatBytes(focus.totalSize), approx ? "octets (≥, page tronquée)" : "octets"],
      [formatCount(focus.totalFiles), "fichiers"],
      [formatCount(focus.children.length), "sous-dossiers"],
      [focus.ownFiles ? formatBytes(focus.ownSize) : "—", "fichiers ici"],
    ].map(([value, caption]) => `<div><strong>${value}</strong><span>${caption}</span></div>`).join("");

    const legend = element("[data-legend]");
    legend.replaceChildren(...categoryShares(focus).slice(0, 6).map((entry) => {
      const li = document.createElement("li");
      const { color, label } = DISKX_PALETTE[entry.category];
      li.style.setProperty("--c", color);
      li.style.setProperty("--w", `${Math.max(2, Math.round(entry.share * 100))}%`);
      li.innerHTML = `<i></i><span>${label}</span><span>${Math.round(entry.share * 100)} %</span><b></b>`;
      return li;
    }));

    const title = element("[data-list-title]");
    const list = element("[data-list]");
    const listed = listMode.kind === "rest" ? listMode.nodes : blocks.map((block) => block.node);
    title.textContent = listMode.kind === "rest" ? `${listed.length} autres dossiers` : "Dossiers";
    list.replaceChildren(...listed.slice(0, 40).map((node) => {
      const li = document.createElement("li");
      li.className = "folder";
      const { color } = DISKX_PALETTE[node.category];
      li.style.setProperty("--c", color);
      const entry = document.createElement("button");
      entry.type = "button";
      entry.dataset.path = node.path;
      entry.dataset.hover = String(hovered === node);
      entry.innerHTML = `<i></i><span class="name"></span><span class="size">${formatBytes(node.totalSize)}</span>`;
      entry.querySelector(".name")!.textContent = node.path === DISKX_REST_PATH ? node.name : `${node.name}/`;
      entry.title = node.path;
      entry.addEventListener("click", () => dive(node, blocks.find((block) => block.node === node)));
      entry.addEventListener("pointerenter", () => setHovered(node, blocks.find((block) => block.node === node)?.entityId ?? null));
      entry.addEventListener("pointerleave", () => setHovered(null, null));
      li.append(entry);
      return li;
    }));

    const filesSection = element<HTMLElement>("[data-files-section]");
    filesSection.hidden = files.length === 0 || filesFor !== focus.path;
    element("[data-files]").replaceChildren(...files.map((file) => {
      const li = document.createElement("li");
      const category = DISKX_PALETTE[categoryOfFile(file)].color;
      li.style.setProperty("--c", category);
      li.innerHTML = `<button type="button" disabled><i></i><span class="name"></span><span class="size">${formatBytes(file.size)}</span></button>`;
      li.querySelector(".name")!.textContent = file.path.slice(file.path.lastIndexOf("/") + 1);
      li.querySelector("button")!.title = file.path;
      return li;
    }));
    renderCard();
    renderSource();
  }
  function categoryOfFile(file: DiskxFileRow): DiskxCategory {
    const known = file.category as DiskxCategory | undefined;
    return known && known in DISKX_PALETTE ? known : "other";
  }
  function renderCard(): void {
    const card = element<HTMLElement>("[data-card]");
    const node = hovered;
    card.dataset.empty = String(!node);
    if (!node) {
      card.style.setProperty("--c", "#4ff2ff");
      card.innerHTML = `<h3>${focus.name}</h3><p>Chaque bloc est un dossier. Sa <b>surface</b>, ce sont ses octets; sa <b>hauteur</b>, sa part du niveau. Les petits blocs sur les toits sont les plus gros sous-dossiers.</p>`;
      return;
    }
    const { color, label } = DISKX_PALETTE[node.category];
    card.style.setProperty("--c", color);
    const largest = node.largestFile ? node.largestFile.slice(node.largestFile.lastIndexOf("/") + 1) : null;
    card.innerHTML = `<h3></h3><p><b>${formatBytes(node.totalSize)}</b> · ${formatCount(node.totalFiles)} fichiers · ${formatCount(node.children.length)} sous-dossiers · ${label}</p>${largest ? `<p class="path">Plus gros: </p>` : ""}<p class="path"></p>`;
    card.querySelector("h3")!.textContent = node.path === DISKX_REST_PATH ? node.name : `${node.name}/`;
    const paths = card.querySelectorAll<HTMLElement>(".path");
    if (largest) paths[0].append(document.createTextNode(largest));
    paths[paths.length - 1].textContent = node.path === DISKX_REST_PATH ? "Clique pour les lister" : node.path;
  }
  function setHovered(node: DiskxNode | null, entityId: string | null): void {
    if (node === hovered && entityId === hoveredEntityId) return;
    hovered = node;
    hoveredEntityId = entityId;
    for (const entry of surface.querySelectorAll<HTMLButtonElement>("[data-list] button")) {
      entry.dataset.hover = String(node !== null && entry.dataset.path === node.path);
    }
    if (entityId) {
      const object = host.world.getEntityObject(entityId);
      if (object) {
        const bounds = new Box3().setFromObject(object);
        const size = bounds.getSize(new Vector3());
        halo.position.copy(bounds.getCenter(new Vector3()));
        halo.scale.set(size.x + 0.12, size.y + 0.12, size.z + 0.12);
        (halo.material as LineBasicMaterial).color.set(DISKX_PALETTE[node?.category ?? "other"].color);
        halo.visible = true;
      }
    } else halo.visible = false;
    renderCard();
  }

  // ---- labels ---------------------------------------------------------------------------------
  const projected = new Vector3();
  const corner = new Vector3();
  /** Screen width of a block's roof, so a label is only drawn where there is a block to name. */
  const screenSpan = (block: Block, rect: DOMRect): number => {
    corner.copy(block.top).setX(block.top.x - block.halfWidth).project(host.camera);
    const left = corner.x;
    corner.copy(block.top).setX(block.top.x + block.halfWidth).project(host.camera);
    const width = Math.abs(corner.x - left) / 2 * rect.width;
    corner.copy(block.top).setZ(block.top.z - block.halfDepth).project(host.camera);
    const near = corner.y;
    corner.copy(block.top).setZ(block.top.z + block.halfDepth).project(host.camera);
    const depth = Math.abs(corner.y - near) / 2 * rect.height;
    return Math.max(width, depth);
  };
  const LABEL_MIN_SPAN = 54;
  function updateLabels(): void {
    const rect = host.renderer.domElement.getBoundingClientRect();
    const shown = blocks.slice(0, LABEL_BUDGET);
    if (hovered && !shown.some((block) => block.node === hovered)) {
      const extra = blocks.find((block) => block.node === hovered);
      if (extra) shown.push(extra);
    }
    while (labelPool.length < shown.length) {
      const label = document.createElement("div");
      label.className = "gx-diskx-label";
      label.innerHTML = "<span></span><small></small>";
      labelsLayer.append(label);
      labelPool.push(label);
    }
    const cameraDistance = host.camera.position.length();
    labelPool.forEach((label, index) => {
      const block = shown[index];
      if (!block) { label.style.opacity = "0"; label.style.transform = "translate(-9999px,-9999px)"; return; }
      projected.copy(block.top).setY(block.top.y + 0.25).project(host.camera);
      const isHover = hovered === block.node;
      const visible = projected.z < 1 && projected.x > -1.05 && projected.x < 1.05 && projected.y > -1.05 && projected.y < 1.05
        && (isHover || screenSpan(block, rect) >= LABEL_MIN_SPAN);
      if (!visible) { label.style.opacity = "0"; label.style.transform = "translate(-9999px,-9999px)"; return; }
      const x = (projected.x + 1) / 2 * rect.width;
      const y = (1 - projected.y) / 2 * rect.height;
      const rank = index / Math.max(1, LABEL_BUDGET);
      // Far views keep only the big names; the closer you get, the more streets are named.
      const fade = Math.max(0, Math.min(1, 1.6 - rank - cameraDistance / (CITY_SIZE * 2.6)));
      label.style.opacity = String(isHover ? 1 : Math.max(0.35, fade));
      label.style.transform = `translate(${x.toFixed(1)}px, ${(y - 10).toFixed(1)}px) translate(-50%, -100%)`;
      label.style.setProperty("--c", DISKX_PALETTE[block.category].color);
      label.dataset.hover = String(isHover);
      const nameNode = label.firstElementChild as HTMLElement;
      const sizeNode = label.lastElementChild as HTMLElement;
      const name = block.node.name;
      if (nameNode.textContent !== name) nameNode.textContent = name;
      const size = formatBytes(block.node.totalSize);
      if (sizeNode.textContent !== size) sizeNode.textContent = size;
    });
  }

  // ---- entry ---------------------------------------------------------------------------------------
  // The host abandons any camera move the moment the visitor grabs the canvas (OrbitControls
  // "start"), which is right for a click on a block but strands a visitor who touches the
  // canvas during the rise from street level: they stay nose-to-wall with no city in sight.
  // So any grab or wheel during the entry snaps straight to the overview instead.
  let entryRemaining = 0;
  const settleEntry = (): void => {
    if (entryRemaining <= 0) return;
    entryRemaining = 0;
    overviewCamera(0);
  };

  // ---- pointer ---------------------------------------------------------------------------------
  let down: { x: number; y: number } | null = null;
  const dom = host.renderer.domElement;
  const pick = (clientX: number, clientY: number): Block | null => {
    const rect = dom.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, host.camera);
    for (const hit of raycaster.intersectObjects(host.world.group.children, true)) {
      const entityId = host.world.findEntityId(hit.object);
      if (!entityId) continue;
      const entity = host.api.query({ ids: [entityId] })[0];
      const path = diskxPathOf(entity?.tags);
      if (!path) return null;
      // A cap or rim belongs to its district; a roof building belongs to the district under it.
      const district = blocks.find((block) => block.entityId === entityId)
        ?? blocks.find((block) => block.entityId === entity?.parentId)
        ?? blocks.find((block) => path.startsWith(`${block.node.path}/`));
      return district ?? null;
    }
    return null;
  };
  const onPointerDown = (event: PointerEvent): void => { down = { x: event.clientX, y: event.clientY }; };
  const onPointerMove = (event: PointerEvent): void => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.dirty = true;
    pointer.inside = true;
  };
  const onPointerLeave = (): void => { pointer.inside = false; pointer.dirty = true; };
  const onPointerUp = (event: PointerEvent): void => {
    const start = down;
    down = null;
    if (!start || host.mode === "editor" || pending) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const block = pick(event.clientX, event.clientY);
    if (block) dive(block.node, block);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || host.mode === "editor") return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
    if (event.key === "Escape" || event.key === "Backspace") { event.preventDefault(); up(); }
  };
  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointerdown", settleEntry);
  dom.addEventListener("wheel", settleEntry, { passive: true });
  dom.addEventListener("pointermove", onPointerMove);
  dom.addEventListener("pointerleave", onPointerLeave);
  dom.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", onKey);
  button("up").addEventListener("click", up);
  button("exit").addEventListener("click", onExit);
  button("editor").addEventListener("click", () => { void host.enterEditor(); });

  // ---- frame -----------------------------------------------------------------------------------
  let editing = false;
  const frame = (delta: number): void => {
    if (disposed) return;
    if (entryRemaining > 0) entryRemaining = Math.max(0, entryRemaining - delta);
    const nowEditing = host.mode === "editor";
    if (nowEditing !== editing) {
      editing = nowEditing;
      surface.classList.toggle("editing", editing);
      for (const node of surface.children) {
        if (!(node instanceof HTMLElement) || node.classList.contains("gx-diskx-vignette") || node.classList.contains("gx-diskx-scan")) continue;
        node.hidden = editing;
      }
      if (editing) setHovered(null, null);
    }
    if (pending) {
      pending.elapsed += delta;
      if (pending.elapsed >= pending.at) {
        const run = pending.run;
        pending = null;
        run();
      }
    }
    if (pointer.dirty && !editing && !pending) {
      pointer.dirty = false;
      const block = pointer.inside ? pick(pointer.x, pointer.y) : null;
      setHovered(block?.node ?? null, block?.entityId ?? null);
    }
    if (!editing) updateLabels();
  };
  const unsubscribe = host.subscribeFrame(frame);

  buildCity();
  overviewCamera(0);
  if (!reduced) {
    // Entry: a rise from street level to the overview, so the skyline reveals itself. Short
    // enough that nobody waits on it; interrupted by any grab (see `settleEntry`).
    const ENTRY_SECONDS = 1.6;
    const start = OVERVIEW_DIRECTION.clone().multiplyScalar(CITY_SIZE * 0.9).setY(2.2);
    host.frameView([start.x, start.y, start.z], [0, 1.5, 0], 0);
    overviewCamera(ENTRY_SECONDS);
    entryRemaining = ENTRY_SECONDS;
  }

  const state = (): unknown => {
    const rect = dom.getBoundingClientRect();
    return {
      application: "diskx",
      source: source.kind,
      loading: loading > 0,
      focus: { path: focus.path, name: focus.name, totalSize: focus.totalSize, totalFiles: focus.totalFiles, children: focus.children.length },
      crumbs: crumbsOf(focus).map((node) => node.path),
      hovered: hovered?.path ?? null,
      listMode: listMode.kind,
      truncated: [...truncated],
      pendingDive: pending !== null,
      entering: entryRemaining > 0,
      districts: blocks.map((block) => {
        const point = block.top.clone().project(host.camera);
        const onScreen = point.z < 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;
        return {
          path: block.node.path, name: block.node.name, entityId: block.entityId, category: block.category,
          totalSize: block.node.totalSize, totalFiles: block.node.totalFiles,
          screen: onScreen ? [Math.round(rect.left + (point.x + 1) / 2 * rect.width), Math.round(rect.top + (1 - point.y) / 2 * rect.height)] : null,
        };
      }),
      summary,
    };
  };

  return {
    state,
    advanceTime: (milliseconds: number) => { frame(Math.max(0, milliseconds) / 1000); return state(); },
    dispose: () => {
      disposed = true;
      unsubscribe();
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointerdown", settleEntry);
      dom.removeEventListener("wheel", settleEntry);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerleave", onPointerLeave);
      dom.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKey);
      host.scene.remove(halo);
      halo.geometry.dispose();
      (halo.material as LineBasicMaterial).dispose();
      surface.remove();
    },
  };
}

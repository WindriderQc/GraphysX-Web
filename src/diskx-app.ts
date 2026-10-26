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
import { foldPresentationPanel } from "./presentation-mobile";
import {
  buildDiskxTree,
  categoryShares,
  DISKX_FREE_PATH_PREFIX,
  DISKX_PALETTE,
  DISKX_REST_PATH,
  formatBytes,
  formatCount,
  layoutDiskxCity,
  pathCrumbs,
  volumeForPath,
  volumeOccupancy,
  type DiskxCategory,
  type DiskxCityLayout,
  type DiskxDirectoryRow,
  type DiskxFileRow,
  type DiskxNode,
  type DiskxTree,
  type DiskxVolume,
} from "./diskx-data";
import { composeDiskxWorld, DISKX_DISTRICT_TAG, diskxPathOf, FREE_COLOUR } from "./diskx-scene";
import { createFixtureSource, createLiveSource, DISKX_FIXTURE, RELAY_ENDPOINTS, resolveDiskxSource, type DiskxEndpoints, type DiskxSource, type DiskxSummary } from "./diskx-source";
import { replaceScope, redactedInventory } from "./diskx-snapshot";
import { readJanitorSummary, readJanitorGroups, type JanitorGroupPage } from './diskx-janitor-source';
import { requireJanitorVersion } from './diskx-report-version';
import { createPresentationOverlay } from './presentation-overlay';
import { createRelationOverlay, type RelationPlace } from './presentation-links';
import { createStarfield } from './presentation-starfield';
import { anchorDuplicates, duplicateLinks, planDuplicateView, DUPLICATE_ALL_SCOPE, type DuplicateView } from './diskx-duplicates';
import { JANITOR_DEMO, JANITOR_DEMO_GROUPS, JANITOR_DEMO_SUMMARY, JANITOR_STATUS_LABELS, janitorAvailability } from './diskx-janitor';
import { createDiskxShow, relayGroupPages, type ShowEvent } from './diskx-show';
import { DEFAULT_SHOW_SCRIPT } from './diskx-show-script';
import type { PlatformHost } from "./platform-host";
import { motionIsReduced } from "./platform-theme";

export type DiskxApplication = {
  dispose: () => void;
  state: () => unknown;
  advanceTime: (milliseconds: number) => unknown;
  /** The Janitor show's controls, for a host page steering the animation list. */
  show: { play(): void; pause(): void; next(): void; previous(): void; goto(index: number): void; setScript(text: string, autoplay: boolean): void };
};

/** Virtual level above the scanned roots: one district per disk. */
export const DISKX_ALL_PATH = "diskx://all";

const CITY_SIZE = 40;
const LABEL_BUDGET = 18;
const OVERVIEW_DIRECTION = new Vector3(0.44, 0.52, 0.74).normalize();

/**
 * How a host page mounts DiskX. The GraphysX app passes nothing and reads its own query string;
 * the `<diskx-city>` embed (an AgentX Core page) passes Core's routes, the roots, and what to
 * open on. Events are presentation receipts: "group-shown" never means a file was touched.
 */
export type DiskxMountOptions = {
  live?: { endpoints: DiskxEndpoints; roots: string[]; origin: string };
  focus?: string | null;
  janitor?: "latest" | null;
  group?: string | null;
  report?: string | null;
  embedded?: boolean;
  /** Animation list of the Janitor show (`diskx-show-script.ts`); a given list plays at once. */
  play?: string | null;
  /** Same-origin page where the owner decides and acts on files (Data Toolbox). Linked, never called. */
  actionsHref?: string | null;
  onEvent?: (type: DiskxEventType, detail: Record<string, unknown>) => void;
};

type DiskxEventType = "ready" | "report-read" | "group-shown" | "error" | ShowEvent;

export function mountDiskxApp(root: HTMLElement, host: PlatformHost, onExit: () => void, options: DiskxMountOptions = {}): DiskxApplication {
  const params = options.live ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const reduced = motionIsReduced();
  const forceFixture = !options.live && params.get("source") === "fixture";
  const janitorDemo = forceFixture && params.get('janitor') === 'demo';
  const endpoints = options.live?.endpoints ?? RELAY_ENDPOINTS;
  const emit = (type: DiskxEventType, detail: Record<string, unknown>): void => {
    try { options.onEvent?.(type, detail); } catch { /* a host listener never breaks the city */ }
  };
  let announcedReady = false;
  let candidateIndex = 0;
  const presentation = createPresentationOverlay();
  host.scene.add(presentation.group);
  const relations = createRelationOverlay();
  host.scene.add(relations.group);
  // Embedded on a Core page: no skybox files there, so the night sky is drawn in code.
  const starfield = options.embedded ? createStarfield(CITY_SIZE * 7) : null;
  if (starfield) host.scene.add(starfield);
  let groupView: DuplicateView | null = null;
  let groupOutside = 0;
  let groupFrame = false;
  /** HTML tags over the outlined districts: "gardée" on the kept one, the logical bytes on extras. */
  let groupTags: { element: HTMLDivElement; at: Vector3 }[] = [];
  function setGroupTags(tags: { text: string; role: string; at: Vector3 }[]): void {
    for (const tag of groupTags) tag.element.remove();
    groupTags = tags.map((tag) => {
      const element = document.createElement('div');
      element.className = 'gx-diskx-tag';
      element.dataset.role = tag.role;
      element.textContent = tag.text;
      labelsLayer.append(element);
      return { element, at: tag.at };
    });
  }
  const tagPoint = new Vector3();
  function updateGroupTags(): void {
    if (!groupTags.length) return;
    const rect = host.renderer.domElement.getBoundingClientRect();
    for (const tag of groupTags) {
      tagPoint.copy(tag.at).project(host.camera);
      const visible = relations.group.visible && tagPoint.z < 1 && Math.abs(tagPoint.x) < 1.05 && Math.abs(tagPoint.y) < 1.05;
      tag.element.style.opacity = visible ? '1' : '0';
      tag.element.style.transform = `translate(${((tagPoint.x + 1) / 2 * rect.width).toFixed(1)}px, ${((1 - tagPoint.y) / 2 * rect.height + 14).toFixed(1)}px) translate(-50%, 0)`;
    }
  }

  // ---- data -----------------------------------------------------------------------------
  const rows = new Map<string, DiskxDirectoryRow>();
  // Embedded on a Core page there is no demo city to show first: it starts empty and live.
  if (!options.live) for (const row of DISKX_FIXTURE.directories) rows.set(row.path, row);
  let source: DiskxSource = options.live
    ? createLiveSource(globalThis.fetch.bind(globalThis), [...options.live.roots], options.live.origin, options.live.endpoints)
    : createFixtureSource();
  let summary: DiskxSummary | null = null;
  let tree: DiskxTree = buildDiskxTree(source.roots, [...rows.values()]);
  let all = makeAllNode(tree);
  const fetched = new Set<string>();
  const truncated = new Set<string>();
  let observationId = "synthetic-v1";
  let observedAt = new Date().toISOString();
  let refreshing = false;
  let loading = 0;
  let listLimit = 40;
  let notice = "";
  let focus: DiskxNode = resolveInitialFocus(options.focus ?? params.get("root"));
  const history: string[] = [];
  let layout: DiskxCityLayout | null = null;
  let listMode: { kind: "top" } | { kind: "rest"; nodes: DiskxNode[] } = { kind: "top" };
  let files: DiskxFileRow[] = [];
  let filesFor: string | null = null;
  let volumes: DiskxVolume[] = [];
  let disposed = false;
  void source.volumes().then((known) => { if (!disposed && source.kind === "fixture") { volumes = known; buildCity(); } });

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
        <div class="row"><button type="button" data-action="up">↑ Remonter</button><button type="button" data-action="refresh">Actualiser</button><button type="button" data-action="export">Exporter les agrégats</button><button type="button" data-action="exit">Quitter DiskX</button></div>
        <span class="gx-diskx-source" data-source data-kind="fixture" role="status" aria-live="polite"></span>
      </div>
    </header>
    <p class="gx-diskx-notice" role="status" data-notice></p>
    <aside class="gx-diskx-panel" aria-label="Détails du dossier">
      <section class="gx-diskx-janitor" aria-label="Rapport Janitor">
        <h2>Data Janitor</h2>
        <p data-janitor-availability></p>
        <button type="button" data-action="janitor-read">Lire le dernier rapport</button><p data-janitor-focus role="status" aria-live="polite"></p>
        <div class="gx-diskx-preview" data-preview hidden>
          <p data-group-view></p>
          <div class="gx-diskx-preview-controls">
            <button type="button" data-action="preview-play">Lire</button>
            <button type="button" data-action="preview-pause">Pause</button>
            <button type="button" data-action="preview-reset">Retour à l’actuel</button>
            <button type="button" data-action="preview-target">Voir la cible</button>
          </div>
          <label>Transition <input type="range" data-preview-progress aria-label="Progression de l’aperçu" min="0" max="100" value="0"></label>
          <output data-preview-status aria-live="polite">Aperçu non ouvert</output>
          <p class="gx-diskx-legend-line">Ambre : ce qui partirait. Cyan : ce qui reste, ou la destination. Les repères mobiles n'ont pas l'échelle des fichiers.</p>
          <p class="gx-diskx-warning">Aperçu graphique uniquement. Aucun fichier déplacé ni supprimé ; aucune autorisation accordée.</p>
        </div>
        <div data-janitor-live></div><button type="button" data-action="janitor-next" hidden>Groupes suivants</button>
        <a href="?app=diskx&source=fixture&janitor=demo" data-janitor-demo-link>Ouvrir la démonstration synthétique</a>
        <div data-janitor-demo hidden>
          <label>État fictif <select data-janitor-candidate aria-label="État du candidat"></select></label>
          <p data-janitor-proof></p>
          <button type="button" data-action="candidate">Voir actuel et cible</button>
        </div>
      </section>
      <h2>Ce niveau</h2>
      <div class="gx-diskx-totals" data-totals></div>
      <div class="gx-diskx-volumes" data-volumes></div>
      <h2>Par type</h2>
      <ul class="gx-diskx-legend" data-legend></ul>
      <h2 data-list-title>Dossiers</h2>
      <ul class="gx-diskx-list" data-list></ul><button type="button" data-action="more">Afficher 40 dossiers de plus</button>
      <div data-files-section hidden><h2 style="margin-top:14px">Plus gros fichiers</h2><ul class="gx-diskx-list" data-files></ul></div>
    </aside>
    <div class="gx-diskx-card" data-card data-empty="true"><h3>Survole un quartier</h3><p>Chaque bloc est un dossier. Sa surface, ce sont ses octets; sa hauteur, sa part du niveau.</p></div>
    <p class="gx-diskx-tip"><kbd>clic</kbd> plonger · <kbd>Échap</kbd> remonter · <kbd>glisser</kbd> orbiter · <kbd>molette</kbd> zoomer</p>`;
  const element = <T extends HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const button = (action: string): HTMLButtonElement => element<HTMLButtonElement>(`[data-action="${action}"]`);
  const labelsLayer = element<HTMLDivElement>(".gx-diskx-labels");
  root.append(surface);
  foldPresentationPanel(element(".gx-diskx-panel"), "Rapport et détails");
  foldPresentationPanel(element(".gx-diskx-actions"), "Options");
  if (window.matchMedia("(max-width: 820px)").matches)
    element(".gx-diskx-actions .gx-presentation-detail-body").prepend(element("[data-crumbs]"));
  const show = createDiskxShow({
    surface, labelsLayer, canvas: host.renderer.domElement, camera: host.camera, scene: host.scene, reduced, citySize: CITY_SIZE,
    roots: () => source.roots,
    level: () => (layout ? { focus, blocks: layout.blocks } : null),
    setWorldVisible: (visible) => { host.world.group.visible = visible; },
    goToPath: (path) => { const node = nodeAt(path); if (node) goTo(node); },
    dive: (node) => dive(node, blocks.find((block) => block.node === node)),
    overviewCamera, clearGroup, emit,
    frame: (box, seconds) => {
      const span = Math.max(8, box.maxX - box.minX, box.maxZ - box.minZ);
      const center = new Vector3((box.minX + box.maxX) / 2, 0, (box.minZ + box.maxZ) / 2);
      const at = OVERVIEW_DIRECTION.clone().multiplyScalar(span * 1.45 + box.maxY).add(center);
      host.frameView([at.x, at.y, at.z], [center.x, Math.min(box.maxY * 0.35, 3), center.z], seconds);
    },
    openGroup: async (sha256, known) => {
      const group = known ?? await readNamedGroup(sha256);
      if (!group || disposed) return false;
      showGroup(group);
      if (relations.group.visible) { if (reduced) relations.seek(1); else relations.clock.play(); }
      return true;
    },
  }, options.actionsHref ?? null);

  element('[data-janitor-availability]').textContent = janitorDemo
    ? 'Démonstration synthétique · contrat de présentation provisoire · aucun run réel'
    : janitorAvailability().reason;
  element('[data-janitor-demo]').hidden = !janitorDemo;
  element('[data-janitor-demo-link]').hidden = janitorDemo || Boolean(options.embedded);
  button('exit').hidden = Boolean(options.embedded);
  const candidateSelect = element<HTMLSelectElement>('[data-janitor-candidate]');
  for (const candidate of JANITOR_DEMO.candidates) {
    const option = document.createElement('option'); option.value = candidate.id;
    option.textContent = JANITOR_STATUS_LABELS[candidate.status]; candidateSelect.append(option);
  }
  function candidateProof(): void {
    const candidate = JANITOR_DEMO.candidates[candidateIndex];
    element('[data-janitor-proof]').textContent = `${JANITOR_STATUS_LABELS[candidate.status]} (fictif) · ${JANITOR_DEMO.runId} / ${candidate.operationId}. ${candidate.evidence} Taille logique : ${formatBytes(candidate.logicalBytes)}. Espace récupérable : inconnu (liens, snapshots et blocs non vérifiés).`;
  }
  candidateSelect.addEventListener('change', () => { candidateIndex = candidateSelect.selectedIndex; presentation.hide(); candidateProof(); });
  candidateProof();
  let janitorPage: JanitorGroupPage | null = null;
  let janitorReading = false;
  let janitorState: 'not-loaded' | 'reading' | 'absent' | 'ready' | 'error' = 'not-loaded';
  async function loadJanitor(next = false): Promise<void> {
    if (janitorReading) return;
    janitorReading = true; janitorState = 'reading';
    const panel = element('[data-janitor-live]');
    button('janitor-read').disabled = true; button('janitor-next').disabled = true;
    try {
      const summary = janitorDemo ? JANITOR_DEMO_SUMMARY : await readJanitorSummary(fetch, endpoints.janitorStrategy);
      if (disposed) return;
      if (!summary.available) {
        janitorState = 'absent'; panel.textContent = 'Aucun rapport Janitor disponible. Aucun rapport généré ici.'; janitorPage = null;
        emit('error', { stage: 'report', message: 'Aucun rapport Janitor disponible.' }); return;
      }
      if (options.report) requireJanitorVersion(summary.generatedAt, options.report);
      const page = janitorDemo ? JANITOR_DEMO_GROUPS : await readJanitorGroups(next ? janitorPage?.nextOffset ?? 0 : 0, fetch, endpoints.janitorGroups);
      if (disposed) return;
      if (next && janitorPage && page.report.id !== janitorPage.report.id) throw new Error('Le rapport a changé. Relire depuis la première page.');
      requireJanitorVersion(page.report.generatedAt, summary.generatedAt);
      janitorPage = page; janitorState = 'ready';
      if (!next) startShow(summary, page);
      emit('report-read', { reportGeneratedAt: page.report.generatedAt, reportId: page.report.id });
      element('[data-janitor-availability]').textContent = janitorDemo
        ? 'Démonstration synthétique · rapport fictif · aucun run réel'
        : 'Dernier rapport lu par GET. Lecture seule : rien n’est lancé, approuvé ni modifié ici.';
      panel.replaceChildren();
      const heading = document.createElement('p');
      heading.textContent = `Rapport ${page.report.id} · ${page.report.generatedAt ?? 'date inconnue'} · état du rapport : ${page.report.status}. ${summary.verifiedGroups} groupes vérifiés ; ${summary.candidateGroups} groupes candidats. Estimation logique du rapport : ${formatBytes(summary.provenSavingsBytes)}. Candidats : ${formatBytes(summary.candidateBytes)} (pas des économies). Espace physique récupérable inconnu. Autorisation et exécution non vérifiées.`;
      panel.append(heading);
      for (const group of page.groups) {
        const detail = document.createElement('details'), title = document.createElement('summary');
        title.textContent = `${group.count} copies · ${formatBytes(group.size)} · SHA-256 ${group.sha256.slice(0, 12)}`;
        detail.append(title);
        const evidence = document.createElement('p');
        evidence.textContent = `Preuve : ${JSON.stringify(group.proof)}. Revue : ${JSON.stringify(group.review)}. ${group.filesOmitted} fichiers omis. Chemin conservé selon politique : ${group.policySurvivorPath ?? 'non fourni'}. La politique ne vaut pas autorisation.`;
        detail.append(evidence);
        const show = document.createElement('button');
        show.type = 'button'; show.dataset.action = 'group-show'; show.className = 'gx-diskx-group-show';
        show.textContent = 'Montrer dans la ville';
        show.addEventListener('click', () => showGroup(group));
        detail.append(show);
        for (const file of group.files) {
          const link = document.createElement('button'); link.type = 'button'; link.textContent = file.path;
          link.addEventListener('click', () => {
            let path = file.path.slice(0, file.path.lastIndexOf('/'));
            while (path && !nodeAt(path)) path = path.slice(0, path.lastIndexOf('/'));
            const node = nodeAt(path);
            // Its own status line: the inventory reload that follows a dive rewrites the notice.
            element('[data-janitor-focus]').textContent = node
              ? `Dossier indexé du candidat : ${file.path}. Aucun fichier modifié.`
              : 'Ce candidat est hors du périmètre de cet inventaire.';
            if (node) goTo(node);
          });
          detail.append(link);
        }
        panel.append(detail);
      }
      const coverage = document.createElement('p'); coverage.textContent = `Page à partir de ${page.offset}, ${page.groups.length} groupes affichés sur ${page.total}. ${page.scanBoundReached ? 'Limite de parcours atteinte : couverture partielle.' : ''}`; panel.append(coverage);
    } catch (error) {
      if (!disposed) {
        janitorState = 'error'; panel.textContent = `Lecture Janitor indisponible : ${error instanceof Error ? error.message : String(error)}. Réessayer avec Lire le dernier rapport.`; janitorPage = null;
        emit('error', { stage: 'report', message: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      janitorReading = false;
      if (!disposed) { button('janitor-read').disabled = false; button('janitor-next').disabled = false; button('janitor-next').hidden = janitorPage?.nextOffset == null; }
    }
  }
  button('janitor-read').addEventListener('click', () => { void loadJanitor(); });
  button('janitor-next').addEventListener('click', () => { void loadJanitor(true); });

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

  function freeNodeFor(path: string): DiskxNode | null {
    return layout?.blocks.find((block) => block.kind === "free" && block.node.path === path)?.node ?? null;
  }
  function buildCity(): void {
    presentation.hide();
    // Free space is laid out once, beside the disks, at the level where the disks are the
    // districts. Inside a disk the HUD still shows the volume's gauge; the plaza does not.
    layout = layoutDiskxCity(focus, { size: CITY_SIZE, freeVolumes: focus.path === DISKX_ALL_PATH ? volumes : [] });
    const world = composeDiskxWorld(layout, { motes: !reduced, sky: !options.embedded });
    const result = host.api.create(world);
    if (!result.ok) throw new Error(result.error);
    host.api.pause(false);
    host.applyEnvironment();
    blocks = host.api.query({ tag: DISKX_DISTRICT_TAG }).map((entity) => {
      const path = diskxPathOf(entity.tags);
      const node = path === DISKX_REST_PATH
        ? layout!.blocks.find((block) => block.node.path === DISKX_REST_PATH)!.node
        : path?.startsWith(DISKX_FREE_PATH_PREFIX) ? freeNodeFor(path) : nodeAt(path);
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
    if (groupView) {
      if (focus.path === groupView.scope) anchorGroup(groupFrame);
      else clearGroup();
      groupFrame = false;
    }
    show.onLevel();
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
    if (node.path.startsWith(DISKX_FREE_PATH_PREFIX)) {
      const volume = volumes.find((entry) => node.path === `${DISKX_FREE_PATH_PREFIX}${entry.id}`);
      notice = volume
        ? `${formatBytes(volume.freeBytes)} libres sur ${volume.label} (${volume.source === "measured" ? "mesuré" : "déclaré"}${volume.measuredAt ? ` le ${new Date(volume.measuredAt).toLocaleDateString("fr-CA")}` : ""}).`
        : "Espace libre.";
      render();
      return;
    }
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
    if (source.kind !== "live" || refreshing || node.path === DISKX_ALL_PATH || fetched.has(node.path)) return;
    // Legacy API has no immutable snapshot/cursor. Reload the whole observation together,
    // including this narrower scope, instead of merging responses from unrelated scans.
    await refresh(node.path);
  }
  async function loadFiles(node: DiskxNode, show = false): Promise<void> {
    if (node.path === DISKX_ALL_PATH || node.path === DISKX_REST_PATH) return;
    const path = node.path;
    const requestedObservation = observationId;
    try {
      const list = await source.files(path, 8);
      if (requestedObservation !== observationId) return;
      if (disposed || (focus.path !== path && !show)) return;
      files = list;
      filesFor = path;
      render();
    } catch {
      // Files are a garnish; the city stands without them.
    }
  }
  async function refresh(scope?: string): Promise<void> {
    if (refreshing) return;
    refreshing = true; setLoading(1);
    try {
      const resolved = options.live ? source : await resolveDiskxSource({ forceFixture, requireLive: source.kind === 'live' });
      const before = await resolved.summary();
      let nextRows: DiskxDirectoryRow[] = [];
      const limited = new Set<string>();
      const scopes = [...resolved.roots];
      if (scope && resolved.roots.some(root => scope.startsWith(`${root}/`))) scopes.push(scope);
      for (const root of scopes) {
        const page = await resolved.tree(root);
        nextRows = replaceScope(nextRows, root, page.rows);
        if (page.truncated) limited.add(root);
      }
      const after = await resolved.summary();
      if (before.lastScanAt !== after.lastScanAt || before.totalFiles !== after.totalFiles || before.totalSize !== after.totalSize)
        throw new Error("L'inventaire a changé pendant la lecture. Réessayer.");
      const nextVolumes = await resolved.volumes().catch(() => []);
      if (disposed) return;
      source = resolved; summary = after;
      rows.clear(); for (const row of nextRows) rows.set(row.path, row);
      fetched.clear(); for (const root of scopes) fetched.add(root);
      truncated.clear(); for (const root of limited) truncated.add(root);
      volumes = nextVolumes;
      observedAt = new Date().toISOString(); observationId = `${source.kind}:${observedAt}`;
      notice = source.kind === "live" ? "Lecture d’un index : cohérence non garantie par l’API, aucun suivi temps réel. Maximum 2 000 lignes par périmètre, sans pagination." : "Démonstration synthétique : aucun fichier réel, aucun travail Janitor exécuté.";
      rebuildTree(); buildCity();
      if (!announcedReady) {
        announcedReady = true;
        emit("ready", { source: source.kind, roots: [...source.roots], totalFiles: after.totalFiles, totalSize: after.totalSize });
        void openRequested();
      }
    } catch (error) {
      if (!disposed) {
        notice = `Lecture échouée : ${error instanceof Error ? error.message : String(error)}. Observation précédente conservée ; Actualiser pour réessayer.`; render();
        emit("error", { stage: "inventory", message: error instanceof Error ? error.message : String(error) });
      }
    } finally { refreshing = false; if (!disposed) setLoading(-1); }
  }
  /** What the host asked to open on: the latest report, its animation list, a named group. */
  async function openRequested(): Promise<void> {
    if (options.janitor || options.group || options.play || params.get('play')) await loadJanitor();
  }
  function startShow(summary: { generatedAt: string; verifiedGroups: number; provenSavingsBytes: number }, page: JanitorGroupPage): void {
    const requested = options.play ?? params.get('play');
    const script = requested || (options.group ? `group-${options.group}` : DEFAULT_SHOW_SCRIPT);
    try {
      show.start({ reportId: page.report.id, generatedAt: page.report.generatedAt, groupsTotal: summary.verifiedGroups, savingsBytes: summary.provenSavingsBytes,
        script, autoplay: Boolean(requested),
        readPage: janitorDemo ? async () => JANITOR_DEMO_GROUPS : relayGroupPages(endpoints.janitorGroups) });
    } catch (error) {
      emit('error', { stage: 'play', message: error instanceof Error ? error.message : String(error) });
    }
  }
  /** One group of the latest report by its SHA-256, checked against the report on screen. */
  async function readNamedGroup(sha256: string): Promise<Parameters<typeof planDuplicateView>[0] | null> {
    if (!janitorPage) return null;
    try {
      const page = janitorDemo ? JANITOR_DEMO_GROUPS : await readJanitorGroups(0, fetch, endpoints.janitorGroups, sha256);
      if (disposed) return null;
      if (page.report.id !== janitorPage.report.id) throw new Error('Le rapport a changé avant la lecture du groupe. Relire le rapport.');
      requireJanitorVersion(page.report.generatedAt, janitorPage.report.generatedAt);
      const group = page.groups.find((candidate) => candidate.sha256 === sha256);
      if (group) return group;
      element('[data-janitor-focus]').textContent = 'Ce groupe n’est pas dans le dernier rapport.'; emit("error", { stage: "group", message: "group not in the latest report" });
    } catch (error) {
      if (disposed) return null;
      element('[data-janitor-focus]').textContent = `Groupe illisible : ${error instanceof Error ? error.message : String(error)}.`;
      emit("error", { stage: "group", message: error instanceof Error ? error.message : String(error) });
    }
    return null;
  }
  void refresh();

  // ---- HUD rendering ------------------------------------------------------------------------
  function renderSource(): void {
    const badge = element<HTMLSpanElement>("[data-source]");
    badge.dataset.kind = source.kind;
    badge.dataset.loading = String(loading > 0);
    const when = summary?.lastScanAt ? new Date(summary.lastScanAt).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : null;
    badge.textContent = source.kind === "live"
      ? `${loading ? "Lecture… " : ""}Index AgentX · cohérence non vérifiée${when ? ` · scan ${when}` : ""}`
      : `Démonstration synthétique${when ? ` · ${when}` : ""}${loading ? " · connexion…" : ""}`;
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

    const gauges = element("[data-volumes]");
    const shownVolumes = focus.path === DISKX_ALL_PATH ? volumes : [volumeForPath(volumes, focus.path)].filter((volume): volume is DiskxVolume => volume !== null);
    gauges.replaceChildren(...shownVolumes.map((volume) => {
      const occupancy = volumeOccupancy(volume, tree);
      const gauge = document.createElement("div");
      gauge.className = "gx-diskx-gauge";
      gauge.style.setProperty("--used", `${Math.round(occupancy.usedShare * 100)}%`);
      gauge.innerHTML = `<div class="head"><span class="name"></span><span class="free"><b>${formatBytes(occupancy.free)}</b> libres</span></div><div class="bar"><i></i></div><div class="foot"><span>${formatBytes(occupancy.used)} utilisés sur ${formatBytes(occupancy.capacity)}</span><span>${Math.round(occupancy.usedShare * 100)} %</span></div>`;
      gauge.querySelector(".name")!.textContent = volume.label;
      gauge.title = `${volume.source === "measured" ? "Mesuré" : "Déclaré"}${volume.measuredAt ? ` le ${new Date(volume.measuredAt).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" })}` : ""}${volume.note ? ` · ${volume.note}` : ""}`;
      return gauge;
    }));
    if (!shownVolumes.length) {
      const unknown = document.createElement("p");
      unknown.className = "gx-diskx-unknown";
      unknown.textContent = source.kind === "live"
        ? "Capacité inconnue : AgentX Data n’indexe que les fichiers. Déclare DISKX_VOLUMES ou mesure sur l’hôte."
        : "Capacité inconnue pour ce niveau.";
      gauges.append(unknown);
    }

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
    button("more").hidden = (listMode.kind === "rest" ? listMode.nodes.length : blocks.length) <= listLimit;
    const listed = listMode.kind === "rest" ? listMode.nodes : blocks.map((block) => block.node);
    title.textContent = listMode.kind === "rest" ? `${listed.length} autres dossiers` : "Dossiers";
    list.replaceChildren(...listed.slice(0, listLimit).map((node) => {
      const li = document.createElement("li");
      li.className = "folder";
      const isFree = node.path.startsWith(DISKX_FREE_PATH_PREFIX);
      const { color } = isFree ? { color: FREE_COLOUR } : DISKX_PALETTE[node.category];
      li.style.setProperty("--c", color);
      if (isFree) li.classList.add("free");
      const entry = document.createElement("button");
      entry.type = "button";
      entry.dataset.path = node.path;
      entry.dataset.hover = String(hovered === node);
      entry.innerHTML = `<i></i><span class="name"></span><span class="size">${formatBytes(node.totalSize)}</span>`;
      entry.querySelector(".name")!.textContent = node.path === DISKX_REST_PATH || isFree ? node.name : `${node.name}/`;
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
    if (node.path.startsWith(DISKX_FREE_PATH_PREFIX)) {
      const volume = volumes.find((entry) => node.path === `${DISKX_FREE_PATH_PREFIX}${entry.id}`);
      card.style.setProperty("--c", FREE_COLOUR);
      card.innerHTML = `<h3></h3><p><b>${formatBytes(node.totalSize)}</b> libres${volume ? ` sur ${formatBytes(volume.capacityBytes)}` : ""}</p><p class="path"></p>`;
      card.querySelector("h3")!.textContent = node.name;
      card.querySelector(".path")!.textContent = volume
        ? `${volume.source === "measured" ? "Mesuré" : "Déclaré"}${volume.measuredAt ? ` le ${new Date(volume.measuredAt).toLocaleDateString("fr-CA")}` : ""} · partagé par ${volume.roots.map((root) => root.slice(root.lastIndexOf("/") + 1)).join(", ")}`
        : "";
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
        (halo.material as LineBasicMaterial).color.set(node?.path.startsWith(DISKX_FREE_PATH_PREFIX) ? FREE_COLOUR : DISKX_PALETTE[node?.category ?? "other"].color);
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
    const shown = blocks.slice(0, rect.width <= 820 ? 6 : LABEL_BUDGET);
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
      label.style.setProperty("--c", block.node.path.startsWith(DISKX_FREE_PATH_PREFIX) ? FREE_COLOUR : DISKX_PALETTE[block.category].color);
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
    if (show.click(event.clientX, event.clientY)) return;
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
  function showCandidate(): boolean {
    if (!janitorDemo || source.kind !== 'fixture') return false;
    clearGroup();
    const parent = nodeAt('/mnt/media');
    if (!parent) return false;
    goTo(parent);
    const candidate = JANITOR_DEMO.candidates[candidateIndex];
    const a = blocks.find(block => block.node.path === candidate.source);
    const b = blocks.find(block => block.node.path === candidate.target);
    if (!a || !b) { notice = 'Candidat hors du périmètre visible.'; render(); return false; }
    presentation.set([a.top.x, a.top.y + 1, a.top.z], [b.top.x, b.top.y + 1, b.top.z],
      [a.halfWidth * 2, 0.4, a.halfDepth * 2], [b.halfWidth * 2, 0.4, b.halfDepth * 2]);
    const center = a.top.clone().add(b.top).multiplyScalar(0.5);
    host.frameView([center.x + 20, 32, center.z + 30], [center.x, center.y, center.z], reduced ? 0 : 0.5);
    element('[data-preview-status]').textContent = 'Actuel — aperçu uniquement';
    element('[data-preview]').hidden = false;
    element('[data-group-view]').textContent = 'Démonstration : un déplacement fictif entre deux dossiers.';
    return true;
  }

  // ---- Janitor duplicate group in the city ---------------------------------------------------
  function clearGroup(): void {
    groupView = null; groupOutside = 0;
    relations.hide();
    setGroupTags([]);
    if (!presentation.group.visible) element('[data-preview]').hidden = true;
  }
  function showGroup(group: Parameters<typeof planDuplicateView>[0]): void {
    presentation.hide();
    const view = planDuplicateView(group, source.roots, (path) => nodeAt(path) !== null);
    const target = view.scope === DUPLICATE_ALL_SCOPE ? all : nodeAt(view.scope) ?? all;
    view.scope = target.path;
    groupView = view;
    if (focus !== target) { groupFrame = true; goTo(target); } // buildCity anchors it once the level stands
    else anchorGroup(true);
  }
  /** Outline the districts holding the group's copies, arc extras to the kept copy, frame them. */
  function anchorGroup(frameCamera: boolean): void {
    const view = groupView;
    if (!view) return;
    const districts = blocks.filter((block) => block.node.path !== DISKX_REST_PATH && !block.node.path.startsWith(DISKX_FREE_PATH_PREFIX));
    const { anchors, outside } = anchorDuplicates(view, districts.map((block) => block.node.path));
    groupOutside = outside.length;
    const places: RelationPlace[] = anchors.map((anchor) => {
      const block = districts.find((candidate) => candidate.node.path === anchor.district)!;
      return {
        id: anchor.district,
        center: [block.top.x, block.top.y + 0.35, block.top.z],
        size: [block.halfWidth * 2, 0.7, block.halfDepth * 2],
        role: anchor.role === 'keep' ? 'target' : anchor.role === 'extra' ? 'source' : 'neutral',
      };
    });
    relations.set(places, duplicateLinks(anchors));
    emit('group-shown', { sha256: view.sha256, places: places.length, links: relations.state().links, outside: outside.length,
      reportGeneratedAt: janitorPage?.report.generatedAt ?? null, reportId: janitorPage?.report.id ?? null });
    setGroupTags(anchors.map((anchor, index) => ({
      role: anchor.role,
      at: new Vector3(places[index].center[0], places[index].center[1], places[index].center[2]),
      text: anchor.role === 'keep'
        ? (anchor.freedBytes ? `gardée · −${formatBytes(anchor.freedBytes)}` : 'gardée')
        : anchor.role === 'extra' ? `−${formatBytes(anchor.freedBytes)}` : `${anchor.copies.length} copie${anchor.copies.length > 1 ? 's' : ''}`,
    })));
    element('[data-preview]').hidden = false;
    const kept = view.keepPath ? `Copie gardée selon la règle du rapport : ${view.keepPath}.` : 'Le rapport ne nomme pas de copie à garder : aucune copie n’est marquée en trop.';
    const extras = view.copies.filter((copy) => copy.role === 'extra').length;
    const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;
    const notes = [
      kept,
      extras ? `${plural(extras, 'copie')} en trop, ${formatBytes(view.freedBytes)} libérables en taille logique (l’espace physique n’est pas mesuré).` : '',
      outside.length ? `${plural(outside.length, 'copie')} hors de ce niveau de la ville.` : '',
      view.omitted ? `${plural(view.omitted, 'copie')} non listée(s) par le rapport sur cette page.` : '',
      'La règle ne vaut pas autorisation.',
    ].filter(Boolean);
    element('[data-group-view]').textContent = notes.join(' ');
    if (frameCamera && places.length) {
      const min = new Vector3(Infinity, 0, Infinity), max = new Vector3(-Infinity, 0, -Infinity);
      for (const place of places) {
        min.x = Math.min(min.x, place.center[0] - place.size[0] / 2); max.x = Math.max(max.x, place.center[0] + place.size[0] / 2);
        min.z = Math.min(min.z, place.center[2] - place.size[2] / 2); max.z = Math.max(max.z, place.center[2] + place.size[2] / 2);
        max.y = Math.max(max.y, place.center[1]);
      }
      const center = min.clone().add(max).multiplyScalar(0.5);
      const span = Math.max(8, max.x - min.x, max.z - min.z);
      host.frameView([center.x + span * 0.7, max.y + span * 0.9, center.z + span * 1.1], [center.x, max.y * 0.5, center.z], reduced ? 0 : 0.6);
    }
  }
  /** The picture the shared preview controls drive: a duplicate group first, else the demo move. */
  function activeClock(): { seek: (value: number) => void; clock: { play(): void; pause(): void } } | null {
    if (relations.group.visible) return relations;
    if (presentation.group.visible || showCandidate()) return { seek: (value: number) => presentation.clock.seek(value), clock: presentation.clock };
    return null;
  }
  button('candidate').addEventListener('click', showCandidate);
  button('preview-play').addEventListener('click', () => {
    const active = activeClock();
    if (!active) return;
    if (reduced) active.seek(1); else active.clock.play();
  });
  button('preview-pause').addEventListener('click', () => activeClock()?.clock.pause());
  button('preview-reset').addEventListener('click', () => activeClock()?.seek(0));
  button('preview-target').addEventListener('click', () => activeClock()?.seek(1));
  element<HTMLInputElement>('[data-preview-progress]').addEventListener('input', event => {
    activeClock()?.seek(Number((event.target as HTMLInputElement).value) / 100);
  });
  button("refresh").addEventListener("click", () => { void refresh(focus.path); });
  button("more").addEventListener("click", () => { listLimit += 40; render(); });
  button("export").addEventListener("click", () => {
    const payload = redactedInventory({ id: observationId, observedAt, roots: source.roots, rows: [...rows.values()], incomplete: [...truncated], consistency: source.kind === 'fixture' ? 'synthetic' : 'unversioned' });
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'diskx-aggregates.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // ---- frame -----------------------------------------------------------------------------------
  let editing = false;
  const frame = (delta: number): void => {
    if (disposed) return;
    if (presentation.group.visible || relations.group.visible) {
      if (relations.group.visible) relations.tick(delta); else presentation.tick(delta);
      const preview = relations.group.visible ? relations.clock.state() : presentation.clock.state();
      element<HTMLInputElement>('[data-preview-progress]').value = String(Math.round(preview.progress * 100));
      element('[data-preview-status]').textContent = `${preview.progress === 1 ? (relations.group.visible ? 'Après la règle' : 'Cible proposée') : preview.progress === 0 ? 'Actuel' : 'Comparaison'} · ${Math.round(preview.progress * 100)} % · ${preview.playing ? 'lecture' : 'pause'} · aucun fichier modifié`;
    }
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
      show.hover(pointer.x, pointer.y, pointer.inside);
      const block = pointer.inside && !show.capturesPointer() ? pick(pointer.x, pointer.y) : null;
      setHovered(block?.node ?? null, block?.entityId ?? null);
    }
    show.frame(delta);
    if (!editing) { updateLabels(); updateGroupTags(); }
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
      observationId, observedAt, consistency: source.kind === "fixture" ? "synthetic" : "unversioned",
      loading: loading > 0,
      focus: { path: focus.path, name: focus.name, totalSize: focus.totalSize, totalFiles: focus.totalFiles, children: focus.children.length },
      crumbs: crumbsOf(focus).map((node) => node.path),
      hovered: hovered?.path ?? null,
      listMode: listMode.kind,
      truncated: [...truncated],
      volumes: volumes.map((volume) => ({ id: volume.id, label: volume.label, capacityBytes: volume.capacityBytes, freeBytes: volume.freeBytes, source: volume.source })),
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
      show: show.state(),
      janitor: { availability: janitorState, reportId: janitorPage?.report.id ?? null, synthetic: janitorDemo, candidate: janitorDemo ? JANITOR_DEMO.candidates[candidateIndex] : null, preview: relations.group.visible ? relations.clock.state() : presentation.clock.state(), visible: presentation.group.visible || relations.group.visible,
        group: groupView ? { sha256: groupView.sha256.slice(0, 12), scope: groupView.scope, keep: groupView.keepPath !== null, copies: groupView.copies.length, outside: groupOutside, places: relations.state().places, links: relations.state().links, freedBytes: groupView.freedBytes } : null },
    };
  };

  return {
    state,
    advanceTime: (milliseconds: number) => { frame(Math.max(0, milliseconds) / 1000); return state(); },
    show: { play: () => show.play(), pause: () => show.pause(), next: () => show.next(), previous: () => show.previous(),
      goto: (index) => show.goto(index), setScript: (text, autoplay) => show.setScript(text, autoplay) },
    dispose: () => {
      disposed = true;
      show.dispose();
      presentation.dispose();
      relations.dispose();
      if (starfield) { starfield.removeFromParent(); starfield.geometry.dispose(); (starfield.material as { dispose(): void }).dispose(); }
      setGroupTags([]);
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

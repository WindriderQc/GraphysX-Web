/**
 * The Janitor show: an animation list played over the DiskX city.
 *
 *   overview → duplicates (everything else fades) → pairs (extra copies linked to the kept one)
 *   → target (the level laid out again without the extra copies) → summary, plus group steps
 *   and tours of the largest groups.
 *
 * A host page (AgentX Core, steered by Nestor) passes the list as `play`; the visitor can play,
 * pause, step, jump to a group, filter, select a block and lift, push aside or pulse it.
 * All of it is presentation: the scene document is never edited, nothing is sent but GETs of
 * the report, and acting on files happens in Data, never here.
 */
import { Raycaster, Vector2, Vector3, type Camera } from "three";
import { DISKX_REST_PATH, formatBytes, formatCount, type DiskxBlock, type DiskxNode } from "./diskx-data";
import { readJanitorGroups, type JanitorGroup } from "./diskx-janitor-source";
import { requireJanitorVersion } from "./diskx-report-version";
import { createLedger, DEFAULT_LEDGER_FILTER, LEDGER_ALL, type LedgerFilter } from "./diskx-show-ledger";
import { blockExtraBytes, duplicateLooks, tallyOf, targetLooks, worldLook, type ShowBlock } from "./diskx-show-looks";
import { createShowLayer } from "./diskx-show-layer";
import { createShowHud } from "./diskx-show-hud";
import { createShowPlayer, parseShowScript, showScriptText, showStepLabel, type ShowStep } from "./diskx-show-script";

/** Groups read for the ledger, largest first. On the 2026-10 report 5 000 groups held 97.6 % of the bytes. */
export const SHOW_GROUP_CAP = 5000;
const PAGE = 50;
const PAIR_BUDGET = 24;
const TAG_BUDGET = 6;

export type ShowEvent = "scene-changed" | "coverage" | "block-selected";
export type DiskxShowAdapter = {
  surface: HTMLElement;
  labelsLayer: HTMLElement;
  canvas: HTMLCanvasElement;
  camera: Camera;
  scene: { add(object: import("three").Object3D): void };
  reduced: boolean;
  citySize: number;
  roots: () => readonly string[];
  /** The level on screen and its laid-out blocks. */
  level: () => { focus: DiskxNode; blocks: readonly DiskxBlock[] } | null;
  setWorldVisible: (visible: boolean) => void;
  goToPath: (path: string) => void;
  dive: (node: DiskxNode) => void;
  overviewCamera: (seconds: number) => void;
  /** Frame a ground box (world units) from the overview direction. */
  frame: (box: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number }, seconds: number) => void;
  /** Show one group the existing way (dive, outline, arcs) and play its current → after-rule clock. */
  openGroup: (sha256: string, group: JanitorGroup | null) => Promise<boolean>;
  clearGroup: () => void;
  emit: (type: ShowEvent, detail: Record<string, unknown>) => void;
};
export type ShowStart = {
  reportId: string; generatedAt: string | null; groupsTotal: number; savingsBytes: number;
  script: string; autoplay: boolean;
  /** Read pages of verified groups; the demo passes its synthetic page. */
  readPage: (offset: number, limit: number) => Promise<{ report: { id: string; generatedAt: string | null }; groups: JanitorGroup[]; nextOffset: number | null }>;
};
type Mode = "off" | "world" | "layer" | "group";

export function createDiskxShow(adapter: DiskxShowAdapter, actionsHref: string | null) {
  const hud = createShowHud(adapter.surface, actionsHref);
  hud.bar.hidden = true;
  const layer = createShowLayer();
  adapter.scene.add(layer.group);
  const ledger = createLedger();
  const player = createShowPlayer(parseShowScript("overview"));
  let start: ShowStart | null = null;
  let mode: Mode = "off";
  let filter: LedgerFilter = { ...DEFAULT_LEDGER_FILTER };
  let blocks: ShowBlock[] = [];
  let selected: string | null = null;
  let loading = false;
  let loadError: string | null = null;
  let returnPath: string | null = null;
  let swapToWorld = false;
  let disposed = false;
  let generation = 0;
  /** Ledger reads, counted apart from scene entries so a scene change never cancels a read. */
  let loadRun = 0;
  let tags: { element: HTMLDivElement; id: string }[] = [];
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const point = new Vector3();

  // ---- ledger -----------------------------------------------------------------------------
  async function loadLedger(run: number): Promise<void> {
    if (!start) return;
    loading = true; loadError = null; renderMeta();
    let offset: number | null = 0, pages = 0;
    try {
      while (offset !== null && ledger.size() < SHOW_GROUP_CAP) {
        const page = await start.readPage(offset, PAGE);
        if (disposed || run !== loadRun) return;
        if (page.report.id !== start.reportId) throw new Error("le rapport a changé pendant la lecture");
        requireJanitorVersion(page.report.generatedAt, start.generatedAt ?? "");
        offset = page.nextOffset;
        ledger.add(page.report.id, page.groups, offset === null);
        pages += 1;
        if (pages === 1 || pages === 5 || pages % 25 === 0) refreshScene();
        if (pages === 1 && current()?.kind === "tour") void enter();
      }
    } catch (error) {
      if (disposed || run !== loadRun) return;
      loadError = error instanceof Error ? error.message : String(error);
    }
    loading = false;
    refreshScene();
    adapter.emit("coverage", { ...ledger.coverage(), capped: !ledger.coverage().complete && !loadError, failed: loadError });
  }

  // ---- blocks of the level ----------------------------------------------------------------
  function readBlocks(): ShowBlock[] {
    const level = adapter.level();
    if (!level) return [];
    return level.blocks.filter((block) => block.level === 0 && (block.kind === "folder" || block.kind === "rest"))
      .map((block) => ({ id: block.node.path, node: block.node, rect: block.rect, height: block.height, kind: block.kind as "folder" | "rest" }));
  }
  /** The host rebuilt the city (dive, climb, refresh): mirror it, keep the scene going. */
  function onLevel(): void {
    if (mode === "off") return;
    blocks = readBlocks();
    layer.setBlocks(blocks.map((block) => ({ id: block.id, start: worldLook(block) })));
    if (selected && !blocks.some((block) => block.id === selected)) select(null);
    if (mode === "layer") { applyLooks(false); frameLayer(); }
  }
  function frameLayer(): void {
    const box = layer.bounds();
    if (box) adapter.frame(box, adapter.reduced ? 0 : 0.9);
  }

  // ---- scenes -----------------------------------------------------------------------------
  const view = () => ledger.view(filter);
  const current = (): ShowStep | null => player.state().step;
  function takeOver(): void {
    swapToWorld = false;
    if (mode !== "layer") {
      blocks = readBlocks();
      layer.setBlocks(blocks.map((block) => ({ id: block.id, start: worldLook(block) })));
    }
    mode = "layer";
    layer.group.visible = true;
    adapter.setWorldVisible(false);
    adapter.surface.dataset.show = "layer";
  }
  function giveBack(): void {
    mode = "world";
    adapter.surface.dataset.show = "world";
    layer.setArcs([]);
    setTags([]);
    if (layer.group.visible) {
      layer.setLooks(new Map(blocks.map((block) => [block.id, worldLook(block)])), adapter.reduced);
      swapToWorld = true;
    } else adapter.setWorldVisible(true);
  }
  function applyLooks(snap: boolean): void {
    const step = current();
    if (!step || mode !== "layer") return;
    const ledgerView = view();
    const level = adapter.level();
    const looks = step.kind === "target" || step.kind === "summary"
      ? targetLooks(level!.focus, blocks, ledgerView, adapter.citySize)
      : duplicateLooks(blocks, ledgerView);
    layer.setLooks(looks, snap || adapter.reduced);
    applyFilterDim();
    if (step.kind === "pairs") { showPairs(looks); }
    else {
      layer.setArcs([]);
      const ranked = blocks.map((block) => ({ block, extra: blockExtraBytes(block, ledgerView), tally: tallyOf(block, ledgerView) }))
        .filter((entry) => entry.extra > 0 || entry.tally.keepBytes > 0)
        .sort((a, b) => b.extra - a.extra || b.tally.keepBytes - a.tally.keepBytes)
        .slice(0, TAG_BUDGET);
      setTags(ranked.map(({ block, extra, tally }) => ({ id: block.id, role: extra > 0 ? "extra" : "keep",
        text: `${block.node.path === DISKX_REST_PATH ? "autres" : block.node.name} · ${extra > 0 ? `−${formatBytes(extra)}` : `gardée ${formatBytes(tally.keepBytes)}`}` })));
    }
    hud.caption(captionFor(step));
    renderSummary();
  }
  function showPairs(looks: ReturnType<typeof duplicateLooks>): void {
    const { pairs } = view().pairs(blocks.map((block) => block.id), PAIR_BUDGET);
    const top = (id: string): [number, number, number] => {
      const look = looks.get(id)!;
      return [look.x, Math.max(0.4, look.keepHeight + look.unresolvedHeight + look.extraHeight) + 0.2, look.z];
    };
    const largest = Math.max(1, ...pairs.map((pair) => pair.bytes));
    layer.setArcs(pairs.map((pair) => ({ from: top(pair.from), to: top(pair.to), weight: pair.bytes / largest })));
    const name = (id: string): string => blocks.find((block) => block.id === id)?.node.name ?? id;
    setTags(pairs.slice(0, TAG_BUDGET).map((pair) => ({ id: pair.from, role: "extra", text: `${name(pair.from)} → ${name(pair.to)} · ${formatBytes(pair.bytes)}` })));
  }
  function captionFor(step: ShowStep): string {
    const level = adapter.level();
    const where = level ? (level.focus.path.startsWith("diskx://") ? "tous les disques" : level.focus.name) : "ce niveau";
    const tally = level ? view().under(level.focus.path.startsWith("diskx://") ? LEDGER_ALL : level.focus.path) : null;
    const read = `${formatCount(ledger.size())} groupes lus`;
    switch (step.kind) {
      case "overview": return `Vue d’ensemble : ${where}, ${level ? formatBytes(level.focus.totalSize) : "?"} indexés. Chaque bloc est un dossier.`;
      case "duplicates": return tally ? `Doublons seulement (${where}) : ${formatBytes(tally.extraBytes)} de copies en trop (ambre), ${formatBytes(tally.keepBytes)} de copies gardées par la règle (cyan)${tally.unresolvedBytes ? `, ${formatBytes(tally.unresolvedBytes)} sans survivant nommé (gris)` : ""}. Le reste s’estompe. ${read}.` : "";
      case "pairs": {
        const result = view().pairs(blocks.map((block) => block.id), PAIR_BUDGET);
        return `Copies reliées (${where}) : chaque arc va des copies en trop vers le quartier de la copie gardée. ${result.pairs.length} liaisons montrées sur ${result.total}; ${formatBytes(result.inside)} restent dans un même quartier, ${formatBytes(result.outside)} hors de ce niveau.`;
      }
      case "target": case "summary": {
        const freed = level ? view().extraUnder(level.focus.path.startsWith("diskx://") ? LEDGER_ALL : level.focus.path) : 0;
        return freed > 0
          ? `Vers la cible (${where}) : le niveau sans les copies en trop, −${formatBytes(freed)} en taille logique. L’espace physique libéré n’est pas mesuré.`
          : `Vers la cible (${where}) : aucune copie en trop sous ce niveau parmi les groupes lus; il reste tel quel.`;
      }
      case "tour": return showStepLabel(step);
      case "group": return `${showStepLabel(step)} : la copie gardée par la règle en cyan, les copies en trop en ambre.`;
    }
  }
  function renderSummary(): void {
    const step = current();
    if (step?.kind !== "summary" || !start) { hud.renderSummary(null, openAdhoc); return; }
    const coverage = ledger.coverage();
    hud.renderSummary({
      figures: [
        [formatBytes(start.savingsBytes), "estimation logique du rapport"],
        [formatCount(start.groupsTotal), "groupes vérifiés (SHA-256)"],
        [formatBytes(coverage.bytesCovered), `couverts par les ${formatCount(coverage.groupsRead)} plus gros groupes lus`],
        ["0", "action lancée par cette présentation"],
      ],
      groups: view().top(10),
    }, openAdhoc);
  }
  async function enter(): Promise<void> {
    const step = current();
    const run = ++generation;
    hud.renderSteps(player.steps(), player.state().index, player.state().playing, (index) => { player.goto(index); void enter(); });
    if (!step) return;
    adapter.emit("scene-changed", { index: player.state().index, count: player.state().count, kind: step.kind,
      label: showStepLabel(step), playing: player.state().playing, script: showScriptText(player.steps()) });
    hud.caption(captionFor(step));
    if (step.kind === "tour") {
      // The largest groups come with the first page; the tour waits for it (see loadLedger).
      if (!ledger.size() && loading) { hud.caption("Lecture des plus gros groupes du rapport…"); return; }
      const groups = view().top(step.count);
      player.expand(player.state().index, groups.length ? groups.map((group) => ({ kind: "group" as const, sha256: group.sha256 })) : [{ kind: "summary" as const }]);
      void enter();
      return;
    }
    if (step.kind === "group") {
      if (mode !== "group" && returnPath === null) returnPath = adapter.level()?.focus.path ?? null;
      leaveLayer();
      mode = "group";
      adapter.surface.dataset.show = "group";
      await adapter.openGroup(step.sha256, null);
      return;
    }
    adapter.clearGroup();
    if (returnPath !== null) { const back = returnPath; returnPath = null; mode = mode === "group" ? "world" : mode; adapter.goToPath(back); }
    if (run !== generation) return;
    if (step.kind === "overview") { giveBack(); hud.caption(captionFor(step)); renderSummary(); adapter.overviewCamera(adapter.reduced ? 0 : 0.9); return; }
    const entering = mode !== "layer";
    takeOver();
    applyLooks(false);
    if (entering) frameLayer();
  }
  function leaveLayer(): void {
    layer.setArcs([]);
    setTags([]);
    layer.group.visible = false;
    swapToWorld = false;
    adapter.setWorldVisible(true);
    hud.renderSummary(null, openAdhoc);
  }
  function refreshScene(): void {
    if (disposed) return;
    renderMeta();
    hud.jumpOptions(view().top(20));
    if (mode === "layer") applyLooks(false);
    else { const step = current(); if (step) hud.caption(captionFor(step)); }
  }
  function renderMeta(): void {
    hud.coverage(ledger.size() ? ledger.coverage() : null, loading, loadError);
  }

  /** A group picked from a list, outside the animation list: pause and show it. */
  function openAdhoc(sha256: string): void {
    player.pause();
    if (returnPath === null && mode !== "group") returnPath = adapter.level()?.focus.path ?? null;
    leaveLayer();
    mode = "group";
    adapter.surface.dataset.show = "group";
    const group = ledger.get(sha256);
    hud.caption(`Groupe ${sha256.slice(0, 8)} : la copie gardée par la règle en cyan, les copies en trop en ambre.`);
    hud.renderSteps(player.steps(), player.state().index, false, (index) => { player.goto(index); void enter(); });
    void adapter.openGroup(sha256, group ? { sha256, proof: null, size: group.size, count: group.paths.length + group.omitted,
      provenSavingsBytes: group.size * (group.paths.length - 1), files: group.paths.map((path) => ({ path })), filesOmitted: group.omitted,
      policySurvivorPath: group.keep, review: null } : null);
  }

  // ---- filters, selection, gestures ---------------------------------------------------------
  function applyFilterDim(): void {
    const roots = filter.roots;
    const dimmed = roots ? new Set(blocks.filter((block) => block.node.path === DISKX_REST_PATH || roots.some((root) => block.id === root || block.id.startsWith(`${root}/`) || root.startsWith(`${block.id}/`))).map((block) => block.id)) : null;
    layer.focusOn(dimmed);
  }
  function setFilter(next: Partial<LedgerFilter>): void {
    filter = { ...filter, ...next };
    refreshScene();
    if (selected) select(selected);
  }
  function select(id: string | null): void {
    if (selected && selected !== id) layer.gesture(selected, { selected: false });
    selected = id;
    const block = blocks.find((candidate) => candidate.id === id);
    if (!block) { selected = null; hud.renderSelection(null, openAdhoc); return; }
    layer.gesture(block.id, { selected: true });
    const ledgerView = view();
    const tally = tallyOf(block, ledgerView);
    const extra = blockExtraBytes(block, ledgerView);
    const gesture = layer.gestureOf(block.id)!;
    const isRest = block.node.path === DISKX_REST_PATH;
    hud.renderSelection({
      name: isRest ? block.node.name : `${block.node.name}/`,
      path: isRest ? "" : block.node.path,
      rows: [
        ["Indexé", formatBytes(block.node.totalSize)],
        ["Copies en trop", formatBytes(tally.extraBytes)],
        ["Copies gardées", formatBytes(tally.keepBytes)],
        ...(tally.unresolvedBytes ? [["Sans survivant", formatBytes(tally.unresolvedBytes)] as [string, string]] : []),
        ["Groupes lus", formatCount(tally.groups)],
        ["Après la règle", extra > 0 ? `−${formatBytes(extra)} (logique)` : "inchangé"],
      ],
      groups: isRest ? [] : ledgerView.groupsUnder(block.id, 5),
      gestures: { lift: gesture.lift > 0, push: gesture.push > 0, pulse: gesture.pulse },
      canDive: !isRest && block.node.children.length > 0,
    }, openAdhoc);
    adapter.emit("block-selected", { path: block.node.path, name: block.node.name, extraBytes: tally.extraBytes, keepBytes: tally.keepBytes,
      unresolvedBytes: tally.unresolvedBytes, groups: tally.groups });
  }
  const toggleGesture = (name: "lift" | "push" | "pulse"): void => {
    if (!selected) return;
    const gesture = layer.gestureOf(selected);
    if (!gesture) return;
    layer.gesture(selected, name === "pulse" ? { pulse: !gesture.pulse } : { [name]: gesture[name] > 0 ? 0 : 1 });
    select(selected);
  };
  hud.selButton("lift").addEventListener("click", () => toggleGesture("lift"));
  hud.selButton("push").addEventListener("click", () => toggleGesture("push"));
  hud.selButton("pulse").addEventListener("click", () => toggleGesture("pulse"));
  hud.selButton("close").addEventListener("click", () => select(null));
  hud.selButton("dive").addEventListener("click", () => { const block = blocks.find((candidate) => candidate.id === selected); if (block) { select(null); adapter.dive(block.node); } });
  hud.button("previous").addEventListener("click", () => { if (player.previous()) void enter(); });
  hud.button("next").addEventListener("click", () => { if (player.next()) void enter(); });
  hud.button("toggle").addEventListener("click", () => {
    if (player.state().playing) player.pause(); else { const wasEnd = player.state().index; player.play(); if (player.state().index !== wasEnd) { void enter(); return; } }
    hud.renderSteps(player.steps(), player.state().index, player.state().playing, (index) => { player.goto(index); void enter(); });
  });
  hud.button("reset").addEventListener("click", () => { layer.resetGestures(); select(null); setFilter({ ...DEFAULT_LEDGER_FILTER });
    hud.rootSelect.value = ""; hud.minSelect.value = "0"; hud.roleSelect.value = "all"; });
  hud.button("filters").addEventListener("click", () => {
    hud.filters.hidden = !hud.filters.hidden;
    hud.button("filters").setAttribute("aria-expanded", String(!hud.filters.hidden));
  });
  hud.rootSelect.addEventListener("change", () => setFilter({ roots: hud.rootSelect.value ? [hud.rootSelect.value] : null }));
  hud.minSelect.addEventListener("change", () => setFilter({ minSize: Number(hud.minSelect.value) || 0 }));
  hud.roleSelect.addEventListener("change", () => setFilter({ role: hud.roleSelect.value as LedgerFilter["role"] }));
  hud.jump.addEventListener("change", () => { if (hud.jump.value) openAdhoc(hud.jump.value); });

  // ---- pointer ------------------------------------------------------------------------------
  function pick(clientX: number, clientY: number): ShowBlock | null {
    const rect = adapter.canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, adapter.camera);
    for (const hit of raycaster.intersectObjects(layer.pickables(), false)) {
      if (!hit.object.visible) continue;
      const id = layer.idOf(hit.object);
      const block = blocks.find((candidate) => candidate.id === id);
      if (block) return block;
    }
    return null;
  }

  // ---- tags ---------------------------------------------------------------------------------
  function setTags(next: { id: string; role: string; text: string }[]): void {
    for (const tag of tags) tag.element.remove();
    tags = next.map((tag) => {
      const element = document.createElement("div");
      element.className = "gx-diskx-tag gx-show-tag";
      element.dataset.role = tag.role;
      element.textContent = tag.text;
      adapter.labelsLayer.append(element);
      return { element, id: tag.id };
    });
  }
  function updateTags(): void {
    if (!tags.length) return;
    const rect = adapter.canvas.getBoundingClientRect();
    for (const tag of tags) {
      const top = layer.topOf(tag.id);
      if (!top) { tag.element.style.opacity = "0"; continue; }
      point.set(top[0], top[1] + 0.4, top[2]).project(adapter.camera);
      const visible = layer.group.visible && point.z < 1 && Math.abs(point.x) < 1.05 && Math.abs(point.y) < 1.05;
      tag.element.style.opacity = visible ? "1" : "0";
      tag.element.style.transform = `translate(${((point.x + 1) / 2 * rect.width).toFixed(1)}px, ${((1 - point.y) / 2 * rect.height).toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  return {
    /** Start (or restart) on a report. The animation list is parsed before anything changes. */
    start(next: ShowStart): void {
      const steps = parseShowScript(next.script);
      start = next;
      loadRun += 1;
      ledger.reset(next.reportId, { groups: next.groupsTotal, bytes: next.savingsBytes });
      player.replace(steps);
      hud.setRoots(adapter.roots());
      hud.bar.hidden = false;
      if (mode === "off") mode = "world";
      adapter.surface.dataset.show = "world";
      if (next.autoplay) player.play();
      void loadLedger(loadRun);
      void enter();
    },
    /** Replace the animation list while the report stays (a host attribute changed). */
    setScript(text: string, autoplay: boolean): void {
      const steps = parseShowScript(text);
      player.replace(steps);
      if (autoplay) player.play(); else player.pause();
      void enter();
    },
    play(): void { player.play(); void enter(); },
    pause(): void { player.pause(); hud.renderSteps(player.steps(), player.state().index, false, (index) => { player.goto(index); void enter(); }); },
    next(): void { if (player.next()) void enter(); },
    previous(): void { if (player.previous()) void enter(); },
    goto(index: number): void { player.goto(index); void enter(); },
    onLevel,
    /** While the show draws the city, a click selects a block instead of diving. */
    capturesPointer: (): boolean => mode === "layer",
    click(clientX: number, clientY: number): boolean {
      if (mode !== "layer") return false;
      select(pick(clientX, clientY)?.id ?? null);
      return true;
    },
    hover(clientX: number, clientY: number, inside: boolean): void {
      const block = mode === "layer" && inside ? pick(clientX, clientY) : null;
      if (!block) { hud.showTip(null); return; }
      const tally = tallyOf(block, view());
      const rect = adapter.surface.getBoundingClientRect();
      hud.showTip(`${block.node.path === DISKX_REST_PATH ? block.node.name : block.node.name + "/"} · ${formatBytes(block.node.totalSize)} · en trop ${formatBytes(tally.extraBytes)} · gardées ${formatBytes(tally.keepBytes)}`,
        clientX - rect.left, clientY - rect.top);
    },
    frame(delta: number): void {
      if (mode === "off" || disposed) return;
      if (player.tick(delta)) void enter();
      const state = player.state();
      hud.progress.value = state.seconds ? Math.min(1, state.elapsed / state.seconds) : 0;
      if (layer.group.visible) layer.tick(delta, adapter.reduced);
      if (swapToWorld && !layer.settling()) { swapToWorld = false; layer.group.visible = false; adapter.setWorldVisible(true); }
      updateTags();
    },
    state: () => ({
      active: mode !== "off", mode, script: showScriptText(player.steps()), ...player.state(),
      step: player.state().step ? showStepLabel(player.state().step!) : null, kind: player.state().step?.kind ?? null,
      coverage: ledger.coverage(), loading, failed: loadError, filter, selected,
      pairs: layer.arcCount(), layerVisible: layer.group.visible,
    }),
    dispose(): void {
      disposed = true;
      setTags([]);
      layer.dispose();
      hud.dispose();
    },
  };
}
export type DiskxShow = ReturnType<typeof createDiskxShow>;

/** Pages of verified groups through the Core relay, `limit` at most 50 there. */
export const relayGroupPages = (route: string) => (offset: number, limit: number) => readJanitorGroups(offset, fetch, route, null, limit);

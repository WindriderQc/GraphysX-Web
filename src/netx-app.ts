/**
 * NetX — the home network as a neighbourhood around the router — `?app=netx`.
 *
 * The AgentX Data inventory (`netx-source.ts`) composed as one plateau (`netx-scene.ts`): the
 * hub in the middle, devices on the ring of their observation state, lighthouses for the
 * collectors. The HUD says what Data says — the freshness sentence in Nestor's words, the
 * counts with their windows, the collectors and their last sweep — and offers the Toolbox's five
 * filters and its search. Hovering shows a device's card, clicking frames it; `Échap` returns to
 * the overview. Read-only: nothing here names, scans or commands a device.
 *
 * Every device is an ordinary entity created through `host.api.create`; filters, halos, labels
 * and the camera are presentation and never edit the document. One frame loop, through
 * `subscribeFrame`.
 */
import { Box3, BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments, Raycaster, Vector2, Vector3 } from "three";
import "./netx.css";
import { foldPresentationPanel } from "./presentation-mobile";
import { ageLabel, buildInventory, describeDevice, matchesSearch, NETX_FILTERS, NETX_RING, passesFilter, type NetxCollector, type NetxDevice, type NetxFilter, type NetxInventory } from "./netx-data";
import { composeNetxWorld, FAMILY_COLOUR, NETX_COLLECTOR_TAG, NETX_COLOURS, NETX_DEVICE_TAG, NETX_HALF, NETX_HUB_ID, netxCollectorIdOf, netxDeviceKeyOf, PASSAGES_LABEL, STATE_COLOUR, STATE_LABEL } from "./netx-scene";
import { createFixtureSource, resolveNetxSource, type NetxSource } from "./netx-source";
import type { PlatformHost } from "./platform-host";
import { motionIsReduced } from "./platform-theme";
import { NETX_PASSAGES_ARC, NETX_PASSAGES_RADIUS } from "./netx-data";

export type NetxApplication = {
  dispose: () => void;
  state: () => unknown;
  advanceTime: (milliseconds: number) => unknown;
  select: (key: string | null) => void;
  setFilter: (filter: NetxFilter) => void;
  setSearch: (text: string) => void;
  reload: () => Promise<void>;
};
export type NetxEvent = "ready" | "device-selected" | "filter-changed" | "error";
export type NetxMountOptions = {
  /** A prepared source; else the page resolves live-or-fixture itself (`?source=fixture` forces the capture). */
  source?: NetxSource;
  /** Self-contained LAN embed: no external sky or textures. */
  embedded?: boolean;
  onEvent?: (type: NetxEvent, detail: Record<string, unknown>) => void;
};

const OVERVIEW_DIRECTION = new Vector3(0.35, 0.78, 0.52).normalize();
const LIST_BUDGET = 80;

type Block = {
  kind: "device" | "collector" | "hub";
  key: string;
  entityId: string;
  center: Vector3;
  size: Vector3;
  top: Vector3;
  device?: NetxDevice;
  collector?: NetxCollector;
  /** Entity ids to hide when a filter excludes the device: the principal and its parts. */
  members: string[];
};

export function mountNetxApp(root: HTMLElement, host: PlatformHost, onExit: () => void, options: NetxMountOptions = {}): NetxApplication {
  const params = new URLSearchParams(window.location.search);
  const reduced = motionIsReduced();
  const emit = (type: NetxEvent, detail: Record<string, unknown>): void => { try { options.onEvent?.(type, detail); } catch { /* a listener never breaks the neighbourhood */ } };
  let disposed = false;

  // ---- surface ----------------------------------------------------------------------------
  const surface = document.createElement("section");
  surface.className = "gx-netx";
  surface.setAttribute("aria-label", "Le réseau de la maison");
  surface.innerHTML = `
    <div class="gx-netx-vignette"></div>
    <div class="gx-netx-labels" aria-hidden="true"></div>
    <header class="gx-netx-header">
      <div>
        <span class="gx-netx-eyebrow" data-eyebrow>AgentX · Réseau</span>
        <h1>Le réseau <em>de la maison</em></h1>
        <p class="gx-netx-sub" data-freshness>Chargement de l'inventaire…</p>
      </div>
      <div class="gx-netx-actions"><button type="button" data-action="reload" title="Relire l'inventaire">Relire</button><button type="button" data-action="exit">Quitter</button></div>
    </header>
    <p class="gx-netx-notice" role="status" data-notice></p>
    <aside class="gx-netx-hud" aria-label="Inventaire">
      <div class="gx-netx-counts" data-counts></div>
      <p class="gx-netx-windows" data-windows></p>
      <h2>Collecteurs</h2>
      <ul class="gx-netx-collectors" data-collectors></ul>
      <h2>Filtres</h2>
      <div class="gx-netx-filters" data-filters role="group" aria-label="Filtres"></div>
      <input class="gx-netx-search" data-search type="search" placeholder="Nom, adresse, MAC, fabricant…" aria-label="Rechercher un appareil" autocomplete="off" spellcheck="false">
      <ol class="gx-netx-list" data-list aria-label="Appareils affichés"></ol>
      <ul class="gx-netx-legend">
        <li data-ring="online">Anneau intérieur : en ligne</li><li data-ring="recent">Milieu : vu récemment</li><li data-ring="historical">Extérieur : plus vu</li>
        <li data-ring="new">Ambre : nouveau depuis 24 h</li><li data-ring="cage">Pointillé : non reconnu</li><li data-ring="crate">Caisse translucide : type inconnu</li>
      </ul>
    </aside>
    <div class="gx-netx-card" data-card data-empty="true"><h3></h3><p></p></div>
    <p class="gx-netx-tip"><kbd>survol</kbd> fiche · <kbd>clic</kbd> cadrer · <kbd>Échap</kbd> vue d'ensemble</p>`;
  const element = <T extends HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const button = (action: string): HTMLButtonElement => element<HTMLButtonElement>(`[data-action="${action}"]`);
  const labelsLayer = element<HTMLDivElement>(".gx-netx-labels");
  root.append(surface);
  foldPresentationPanel(element(".gx-netx-hud"), "Inventaire · Filtres");

  // ---- state --------------------------------------------------------------------------------
  let source: NetxSource | null = options.source ?? null;
  let inventory: NetxInventory | null = null;
  let blocks: Block[] = [];
  let filter: NetxFilter = "all";
  let search = "";
  let notice = "";
  let selected: Block | null = null;
  let hovered: Block | null = null;
  let loading = false;
  const blockOf = (key: string): Block | null => blocks.find((block) => block.key === key) ?? null;
  const deviceBlocks = (): Block[] => blocks.filter((block) => block.kind === "device");
  const shown = (device: NetxDevice): boolean => passesFilter(device, filter) && matchesSearch(device, search);

  // ---- the neighbourhood --------------------------------------------------------------------
  function measure(entityId: string): { center: Vector3; size: Vector3 } {
    const object = host.world.getEntityObject(entityId);
    const bounds = object ? new Box3().setFromObject(object) : null;
    const entity = host.api.query({ ids: [entityId] })[0];
    const center = bounds && !bounds.isEmpty() ? bounds.getCenter(new Vector3()) : new Vector3(...(entity?.position ?? [0, 0, 0]));
    const size = bounds && !bounds.isEmpty() ? bounds.getSize(new Vector3()) : new Vector3(1, 1, 1);
    return { center, size };
  }
  function build(): void {
    if (!inventory) return;
    const world = composeNetxWorld(inventory, { motes: !reduced, ...(options.embedded ? { sky: false } : {}) });
    if (options.embedded) for (const entity of world.entities) {
      if (entity.material?.texture) { entity.material = { ...entity.material }; delete entity.material.texture; }
    }
    const created = host.api.create(world);
    if (!created.ok) throw new Error(created.error);
    host.api.pause(false);
    host.applyEnvironment();
    const next: Block[] = [];
    for (const entity of host.api.query({ tag: NETX_DEVICE_TAG })) {
      const key = netxDeviceKeyOf(entity.tags);
      const device = key ? inventory.devices.find((entry) => entry.key === key) : undefined;
      if (!key || !device) continue;
      const { center, size } = measure(entity.id);
      const members = host.api.query({ tag: `netx-device:${key}` }).map((member) => member.id);
      next.push({ kind: "device", key, entityId: entity.id, center, size, top: new Vector3(center.x, center.y + size.y / 2, center.z), device, members });
    }
    for (const entity of host.api.query({ tag: NETX_COLLECTOR_TAG })) {
      const id = netxCollectorIdOf(entity.tags);
      const collector = id ? inventory.collectors.find((entry) => entry.id === id) : undefined;
      if (!id || !collector) continue;
      const { center, size } = measure(entity.id);
      next.push({ kind: "collector", key: `collector:${id}`, entityId: entity.id, center, size, top: new Vector3(center.x, center.y + size.y / 2, center.z), collector, members: [entity.id] });
    }
    const hub = host.api.query({ ids: [NETX_HUB_ID] })[0];
    if (hub) {
      const { center, size } = measure(hub.id);
      next.push({ kind: "hub", key: "hub", entityId: hub.id, center, size, top: new Vector3(center.x, center.y + size.y / 2 + 1.2, center.z), members: [hub.id] });
    }
    blocks = next;
    applyFilter();
  }
  /** Presentation only: excluded devices are hidden in the scene; the document is untouched. */
  function applyFilter(): void {
    for (const block of deviceBlocks()) {
      const visible = shown(block.device!);
      for (const id of block.members) { const object = host.world.getEntityObject(id); if (object) object.visible = visible; }
    }
    if (selected && selected.kind === "device" && !shown(selected.device!)) setSelected(null, false);
    renderHud();
  }

  async function load(): Promise<void> {
    if (loading) return;
    loading = true;
    element("[data-freshness]").textContent = "Chargement de l'inventaire…";
    try {
      if (!source) source = await resolveNetxSource({ forceFixture: params.get("source") === "fixture" });
      let bodies;
      try { bodies = await source.load(); }
      catch (error) {
        // A configured relay that cannot reach Data right now: say so and show the capture.
        if (source.kind === "fixture") throw error;
        notice = `AgentX Data injoignable (${error instanceof Error ? error.message : String(error)}) : capture synthétique à la place.`;
        emit("error", { stage: "load", message: error instanceof Error ? error.message : String(error) });
        source = createFixtureSource();
        bodies = await source.load();
      }
      inventory = buildInventory(bodies);
      if (disposed) return;
      build();
      element("[data-eyebrow]").textContent = `AgentX · Réseau · ${source.origin}`;
      if (source.kind === "fixture" && !notice) notice = `${source.origin} : aucune adresse réelle, proportions de l'inventaire du 2026-10-26.`;
      renderHud();
      overviewCamera(0);
      emit("ready", { source: source.kind, devices: inventory.devices.length, collectors: inventory.collectors.length, referenceTime: inventory.referenceTime, stale: inventory.freshness.stale });
    } catch (error) {
      notice = `Inventaire illisible : ${error instanceof Error ? error.message : String(error)}`;
      emit("error", { stage: "inventory", message: error instanceof Error ? error.message : String(error) });
      renderHud();
    } finally {
      loading = false;
    }
  }

  // ---- HUD ------------------------------------------------------------------------------------
  function renderHud(): void {
    element("[data-notice]").textContent = notice;
    element<HTMLElement>("[data-notice]").dataset.tone = inventory?.freshness.stale ? "amber" : "";
    if (!inventory) return;
    const fresh = element("[data-freshness]");
    fresh.textContent = inventory.freshness.text;
    fresh.dataset.stale = String(inventory.freshness.stale);
    const counts = element("[data-counts]");
    counts.replaceChildren(...(["online", "recent", "historical", "never_confirmed"] as const).map((state) => {
      const tile = document.createElement("div");
      tile.className = "gx-netx-tile";
      tile.dataset.state = state;
      tile.style.setProperty("--c", STATE_COLOUR[state]);
      tile.innerHTML = `<strong>${inventory!.counts[state]}</strong><span>${STATE_LABEL[state]}</span>`;
      return tile;
    }));
    element("[data-windows]").textContent = `${inventory.counts.total} appareils · fenêtres : en ligne ≤ ${ageLabel(inventory.rules.onlineTtlMs)}, récent ≤ ${ageLabel(inventory.rules.recentTtlMs)} · ${inventory.counts.unnamed} sans nom · ${inventory.counts.new} nouveaux`;
    element("[data-collectors]").replaceChildren(...inventory.collectors.map((collector) => {
      const li = document.createElement("li");
      li.dataset.active = String(collector.active);
      const when = collector.lastScanAt ? `dernier balayage il y a ${ageLabel(new Date(inventory!.referenceTime).getTime() - new Date(collector.lastScanAt).getTime())}` : "aucun balayage";
      li.innerHTML = `<span class="gx-netx-dot"></span><b></b><small></small>`;
      li.querySelector("b")!.textContent = collector.hostname ?? collector.id;
      li.querySelector("small")!.textContent = `${collector.active ? "actif" : "silencieux"} · ${when}${collector.privileged === false ? " · sans privilèges" : ""}`;
      li.addEventListener("click", () => { const block = blockOf(`collector:${collector.id}`); if (block) setSelected(block, true); });
      return li;
    }));
    if (!inventory.collectors.length) element("[data-collectors]").innerHTML = "<li data-active=\"false\"><span class=\"gx-netx-dot\"></span><b>Aucun collecteur enregistré</b></li>";
    element("[data-filters]").replaceChildren(...NETX_FILTERS.map(({ id, label }) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.dataset.filter = id;
      const count = inventory!.devices.filter((device) => passesFilter(device, id)).length;
      chip.textContent = `${label} · ${count}`;
      if (id === filter) chip.setAttribute("aria-pressed", "true");
      chip.addEventListener("click", () => setFilter(id));
      return chip;
    }));
    const rows = deviceBlocks().filter((block) => shown(block.device!));
    const list = element<HTMLOListElement>("[data-list]");
    list.replaceChildren(...rows.slice(0, LIST_BUDGET).map((block) => {
      const device = block.device!;
      const li = document.createElement("li");
      const row = document.createElement("button");
      row.type = "button";
      row.dataset.key = device.key;
      row.style.setProperty("--c", STATE_COLOUR[device.state]);
      if (selected === block) row.setAttribute("aria-current", "true");
      row.innerHTML = `<span class="gx-netx-dot"></span><b></b><small></small>`;
      row.querySelector("b")!.textContent = device.name;
      row.querySelector("small")!.textContent = [device.ip !== device.name ? device.ip : null, device.vendor ?? "fabricant inconnu", device.isNew ? "nouveau" : null].filter(Boolean).join(" · ");
      row.addEventListener("click", () => setSelected(block, true));
      li.append(row);
      return li;
    }));
    list.dataset.more = rows.length > LIST_BUDGET ? `… et ${rows.length - LIST_BUDGET} de plus` : "";
    list.setAttribute("aria-label", `${rows.length} appareil${rows.length > 1 ? "s" : ""} affiché${rows.length > 1 ? "s" : ""}`);
  }
  function setFilter(next: NetxFilter): void {
    if (!NETX_FILTERS.some((entry) => entry.id === next)) return;
    filter = next;
    applyFilter();
    emit("filter-changed", { filter, search, shown: deviceBlocks().filter((block) => shown(block.device!)).length });
  }
  function setSearch(next: string): void {
    search = next;
    const input = element<HTMLInputElement>("[data-search]");
    if (input.value !== next) input.value = next;
    applyFilter();
    emit("filter-changed", { filter, search, shown: deviceBlocks().filter((block) => shown(block.device!)).length });
  }
  element<HTMLInputElement>("[data-search]").addEventListener("input", (event) => setSearch((event.target as HTMLInputElement).value));

  // ---- camera -----------------------------------------------------------------------------
  function overviewCamera(seconds: number): void {
    const position = OVERVIEW_DIRECTION.clone().multiplyScalar(NETX_HALF * 1.62 * Math.max(1, 1 / host.camera.aspect)).add(new Vector3(0, 0.5, 1));
    host.frameView([position.x, position.y, position.z], [0, 0.5, 1], seconds);
  }
  function frameBlock(block: Block, seconds: number): void {
    const span = Math.max(block.size.x, block.size.z, 1.2);
    const at = OVERVIEW_DIRECTION.clone().multiplyScalar((span * 3.2 + block.size.y * 1.4 + 4.5) * Math.max(1, 1 / host.camera.aspect)).add(new Vector3(block.center.x, 0, block.center.z));
    host.frameView([at.x, at.y, at.z], [block.center.x, Math.min(block.size.y * 0.5, 2), block.center.z], seconds);
  }

  // ---- card, hover, selection -----------------------------------------------------------------
  function cardFor(block: Block): { colour: string; title: string; body: string } {
    if (block.kind === "device") {
      const device = block.device!;
      // describeDevice already names a recorded type (in or out of the Toolbox list); only its absence needs a line.
      const typeLine = device.type || device.typeRaw ? "" : "type inconnu : à nommer dans la Toolbox";
      return {
        colour: device.known ? FAMILY_COLOUR[device.family] : STATE_COLOUR[device.state],
        title: `${device.name}${device.ip && device.ip !== device.name ? ` · ${device.ip}` : ""}`,
        body: [describeDevice(device), typeLine, device.hostname && device.hostname !== device.name ? `hôte : ${device.hostname}` : "", device.notes ? `notes : ${device.notes}` : "",
          device.firstSeen ? `première fois : ${device.firstSeen.slice(0, 10)}` : "", device.os ? `OS probable : ${device.os}` : "", device.openPorts.length ? `ports ouverts : ${device.openPorts.map((port) => `${port.port}/${port.protocol} ${port.service}`).join(", ")}` : ""].filter(Boolean).join("\n"),
      };
    }
    if (block.kind === "collector") {
      const collector = block.collector!;
      return {
        colour: collector.active ? NETX_COLOURS.cyan : NETX_COLOURS.slate,
        title: `${collector.hostname ?? collector.id} · collecteur ${collector.active ? "actif" : "silencieux"}`,
        body: [collector.ip ? `adresse : ${collector.ip}` : "", collector.cidr ? `balaye ${collector.cidr}` : "", collector.platform ? `plateforme : ${collector.platform}` : "", collector.version ? `agent ${collector.version}` : "",
          collector.privileged === null ? "" : collector.privileged ? "nmap privilégié" : "nmap sans privilèges", collector.lastScanAt ? `dernier balayage : ${collector.lastScanAt.replace("T", " ").slice(0, 16)} UTC` : "aucun balayage enregistré",
          collector.lastSeen ? `dernier signe de vie : ${collector.lastSeen.replace("T", " ").slice(0, 16)} UTC` : ""].filter(Boolean).join("\n"),
      };
    }
    return { colour: NETX_COLOURS.cyan, title: host.api.query({ ids: [NETX_HUB_ID] })[0]?.label ?? "Réseau", body: inventory ? `${inventory.counts.total} appareils dans l'inventaire · ${inventory.activeCollectors} collecteur${inventory.activeCollectors > 1 ? "s" : ""} actif${inventory.activeCollectors > 1 ? "s" : ""}\n${inventory.dataCanScan === false ? "Data ne scanne pas lui-même : les collecteurs natifs le font." : inventory.dataCanScan ? "Data peut scanner lui-même." : ""}` : "" };
  }
  function renderCard(block: Block | null): void {
    const card = element<HTMLElement>("[data-card]");
    card.dataset.empty = String(!block);
    if (!block) return;
    const { colour, title, body } = cardFor(block);
    card.style.setProperty("--c", colour);
    card.dataset.pinned = String(selected === block);
    card.querySelector("h3")!.textContent = title;
    card.querySelector("p")!.textContent = body;
  }
  const unitEdges = new EdgesGeometry(new BoxGeometry(1, 1, 1));
  const halo = new LineSegments(unitEdges, new LineBasicMaterial({ color: NETX_COLOURS.cyan, transparent: true, opacity: 0.95, depthTest: false }));
  halo.visible = false; halo.renderOrder = 999; halo.name = "netx-hover-halo";
  const ring = new LineSegments(unitEdges, new LineBasicMaterial({ color: NETX_COLOURS.amber, transparent: true, opacity: 0.9, depthTest: false }));
  ring.visible = false; ring.renderOrder = 998; ring.name = "netx-selected-halo";
  host.scene.add(halo, ring);
  function fit(lines: LineSegments, block: Block, pad: number): void {
    lines.position.copy(block.center);
    lines.scale.set(block.size.x + pad, block.size.y + pad, block.size.z + pad);
  }
  function setHovered(block: Block | null): void {
    if (block === hovered) return;
    hovered = block;
    if (!block) { halo.visible = false; renderCard(selected); return; }
    fit(halo, block, 0.12);
    (halo.material as LineBasicMaterial).color.set(block.kind === "device" ? STATE_COLOUR[block.device!.state] : NETX_COLOURS.cyan);
    halo.visible = true;
    renderCard(block);
  }
  function setSelected(block: Block | null, frame: boolean): void {
    selected = block;
    if (!block) { ring.visible = false; renderCard(hovered); renderHud(); if (frame) overviewCamera(reduced ? 0 : 1); return; }
    fit(ring, block, 0.3);
    ring.visible = true;
    renderCard(block);
    renderHud();
    if (frame) frameBlock(block, reduced ? 0 : 0.9);
    if (block.kind === "device") emit("device-selected", { key: block.key, name: block.device!.name, state: block.device!.state, known: block.device!.known });
  }
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const pointer = { x: 0, y: 0, dirty: false, inside: false };
  const dom = host.renderer.domElement;
  const pick = (clientX: number, clientY: number): Block | null => {
    const rect = dom.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, host.camera);
    for (const hit of raycaster.intersectObjects(host.world.group.children, true)) {
      if (!hit.object.visible) continue;
      const entityId = host.world.findEntityId(hit.object);
      if (!entityId) continue;
      const entity = host.api.query({ ids: [entityId] })[0];
      const key = netxDeviceKeyOf(entity?.tags);
      if (key) return blockOf(key);
      const collector = netxCollectorIdOf(entity?.tags);
      if (collector) return blockOf(`collector:${collector}`);
      if (entity?.tags?.includes("netx-hub")) return blockOf("hub");
      return null;
    }
    return null;
  };
  let down: { x: number; y: number } | null = null;
  const onPointerDown = (event: PointerEvent): void => { down = { x: event.clientX, y: event.clientY }; };
  const onPointerMove = (event: PointerEvent): void => { pointer.x = event.clientX; pointer.y = event.clientY; pointer.dirty = true; pointer.inside = true; };
  const onPointerLeave = (): void => { pointer.inside = false; pointer.dirty = true; };
  const onPointerUp = (event: PointerEvent): void => {
    const start = down; down = null;
    if (!start || host.mode === "editor" || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const block = pick(event.clientX, event.clientY);
    if (block) setSelected(block, true);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || host.mode === "editor") return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.tagName === "BUTTON" || target.tagName === "SUMMARY" || target.tagName === "A")) {
      if (event.key === "Escape" && target.tagName === "INPUT") { (target as HTMLInputElement).blur(); setSearch(""); }
      return;
    }
    if (event.key === "Escape") { event.preventDefault(); setSelected(null, true); }
  };
  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointermove", onPointerMove);
  dom.addEventListener("pointerleave", onPointerLeave);
  dom.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", onKey);
  button("exit").addEventListener("click", onExit);
  button("reload").addEventListener("click", () => { void load(); });

  // ---- labels -------------------------------------------------------------------------------
  // Projected HTML, decluttered: named devices, collectors, the hub and the ring names are always
  // candidates; an anonymous device gets its label only when the camera is close or it is lit.
  const projected = new Vector3();
  const labelPool: HTMLDivElement[] = [];
  type Placed = { element: HTMLElement; x: number; y: number; width: number; height: number; priority: number };
  const overlaps = (a: Placed, b: Placed): boolean => Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2;
  const ringTags = (["online", "recent", "historical"] as const).map((state) => {
    const tag = document.createElement("div");
    tag.className = "gx-netx-ringtag";
    tag.style.setProperty("--c", STATE_COLOUR[state]);
    tag.textContent = STATE_LABEL[state];
    labelsLayer.append(tag);
    const angle = Math.PI * 0.72;
    return { element: tag, at: new Vector3(Math.cos(angle) * NETX_RING[state], 0.3, Math.sin(angle) * NETX_RING[state]) };
  });
  {
    const tag = document.createElement("div");
    tag.className = "gx-netx-ringtag";
    tag.style.setProperty("--c", NETX_COLOURS.slate);
    tag.textContent = PASSAGES_LABEL;
    labelsLayer.append(tag);
    const angle = (NETX_PASSAGES_ARC[0] + NETX_PASSAGES_ARC[1]) / 2;
    ringTags.push({ element: tag, at: new Vector3(Math.cos(angle) * (NETX_PASSAGES_RADIUS + 1.6), 0.3, Math.sin(angle) * (NETX_PASSAGES_RADIUS + 1.6)) });
  }
  function labelTextOf(block: Block): [string, string] {
    if (block.kind === "device") {
      const device = block.device!;
      return [device.name, device.name === device.ip ? (device.vendor ?? "fabricant inconnu") : device.ip];
    }
    if (block.kind === "collector") return [block.collector!.hostname ?? block.collector!.id, block.collector!.active ? "collecteur actif" : `silencieux · ${block.collector!.lastScanAt?.slice(0, 10) ?? "jamais"}`];
    return ["Réseau", inventory?.collectors.find((collector) => collector.cidr)?.cidr ?? "LAN"];
  }
  function updateLabels(): void {
    const rect = dom.getBoundingClientRect();
    while (labelPool.length < blocks.length) {
      const label = document.createElement("div");
      label.className = "gx-netx-label";
      label.innerHTML = "<span></span><small></small>";
      labelsLayer.append(label);
      labelPool.push(label);
    }
    const cameraDistance = host.camera.position.length();
    const far = cameraDistance / (NETX_HALF * 3.2);
    const candidates: Placed[] = [];
    blocks.forEach((block, index) => {
      const label = labelPool[index];
      const device = block.device;
      const hidden = device ? !shown(device) : false;
      const lit = hovered === block || selected === block;
      const named = block.kind !== "device" || Boolean(device?.alias || device?.hostname);
      projected.copy(block.top).setY(block.top.y + 0.35).project(host.camera);
      const visible = !hidden && projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
      const fade = lit ? 1 : named ? Math.max(0.55, Math.min(0.95, 1.5 - far)) : device?.transient ? 0 : Math.max(0, Math.min(0.8, 1.15 - far * 1.6));
      if (!visible || fade <= 0.05) { label.style.opacity = "0"; label.style.transform = "translate(-9999px,-9999px)"; return; }
      const colour = device ? (device.known ? FAMILY_COLOUR[device.family] : STATE_COLOUR[device.state]) : block.kind === "collector" ? (block.collector!.active ? NETX_COLOURS.cyan : NETX_COLOURS.slate) : NETX_COLOURS.cyan;
      label.style.setProperty("--c", colour);
      label.dataset.lit = String(lit);
      label.dataset.known = String(device ? device.known : true);
      label.style.opacity = String(fade);
      const [name, sub] = labelTextOf(block);
      const nameNode = label.firstElementChild as HTMLElement, subNode = label.lastElementChild as HTMLElement;
      if (nameNode.textContent !== name) nameNode.textContent = name;
      if (subNode.textContent !== sub) subNode.textContent = sub;
      candidates.push({ element: label, x: (projected.x + 1) / 2 * rect.width, y: (1 - projected.y) / 2 * rect.height - 24, width: label.offsetWidth, height: 34, priority: lit ? 4 : named ? 3 : 1 });
    });
    for (const tag of ringTags) {
      projected.copy(tag.at).project(host.camera);
      const visible = projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
      if (!visible) { tag.element.style.opacity = "0"; continue; }
      tag.element.style.opacity = "1";
      candidates.push({ element: tag.element, x: (projected.x + 1) / 2 * rect.width, y: (1 - projected.y) / 2 * rect.height, width: tag.element.offsetWidth, height: 22, priority: 2 });
    }
    candidates.sort((a, b) => b.priority - a.priority || a.y - b.y);
    const placed: Placed[] = [];
    const budget = rect.width <= 820 ? 7 : 40;
    const margin = 8;
    for (const candidate of candidates) {
      if (placed.length >= budget) { candidate.element.style.opacity = "0"; continue; }
      candidate.x = Math.max(margin + candidate.width / 2, Math.min(rect.width - margin - candidate.width / 2, candidate.x));
      candidate.y = Math.max(margin + candidate.height / 2, Math.min(rect.height - margin - candidate.height / 2, candidate.y));
      let tries = candidate.priority >= 3 ? 4 : 0;
      while (placed.some((other) => overlaps(candidate, other)) && tries > 0 && candidate.y - candidate.height - 4 >= margin + candidate.height / 2) { candidate.y -= candidate.height + 4; tries -= 1; }
      if (placed.some((other) => overlaps(candidate, other))) { candidate.element.style.opacity = "0"; candidate.element.style.transform = "translate(-9999px,-9999px)"; continue; }
      placed.push(candidate);
      candidate.element.style.transform = `translate(${candidate.x.toFixed(1)}px, ${(candidate.y + 16).toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  // ---- frame ---------------------------------------------------------------------------------
  let editing = false;
  let time = 0;
  const frame = (delta: number): void => {
    if (disposed) return;
    time += delta;
    const nowEditing = host.mode === "editor";
    if (nowEditing !== editing) {
      editing = nowEditing;
      for (const node of surface.children) if (node instanceof HTMLElement && !node.classList.contains("gx-netx-vignette")) node.hidden = editing;
      halo.visible = ring.visible = false;
      if (editing) setHovered(null);
    }
    (ring.material as LineBasicMaterial).opacity = reduced ? 0.9 : 0.6 + 0.3 * Math.sin(time * 2.4);
    if (pointer.dirty && !editing) {
      pointer.dirty = false;
      setHovered(pointer.inside ? pick(pointer.x, pointer.y) : null);
    }
    if (!editing) updateLabels();
  };
  const unsubscribe = host.subscribeFrame(frame);

  overviewCamera(0);
  if (!reduced) {
    // Entry: a rise from the edge of the plateau to the overview, so the neighbourhood reveals itself.
    const start = OVERVIEW_DIRECTION.clone().multiplyScalar(NETX_HALF * 1.5).setY(2.2);
    host.frameView([start.x, start.y, start.z], [0, 1.2, 0], 0);
    overviewCamera(1.8);
  }
  void load();

  const state = (): unknown => {
    const rect = dom.getBoundingClientRect();
    const shownBlocks = deviceBlocks().filter((block) => shown(block.device!));
    return {
      application: "netx",
      source: source?.kind ?? null, origin: source?.origin ?? null,
      loading,
      referenceTime: inventory?.referenceTime ?? null,
      freshness: inventory?.freshness ?? null,
      counts: inventory?.counts ?? null,
      rules: inventory?.rules ?? null,
      dataCanScan: inventory?.dataCanScan ?? null,
      filter, search, shown: shownBlocks.length,
      selected: selected?.key ?? null, hovered: hovered?.key ?? null,
      notice,
      card: element("[data-card]").dataset.empty === "true" ? null : element("[data-card] h3").textContent,
      collectors: inventory?.collectors.map((collector) => ({ id: collector.id, active: collector.active, lastScanAt: collector.lastScanAt })) ?? [],
      devices: deviceBlocks().map((block) => {
        // The body's centre, so a smoke can aim a real click at the device rather than at its label.
        const point = block.center.clone().project(host.camera);
        const onScreen = point.z < 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;
        return { key: block.key, name: block.device!.name, ip: block.device!.ip, state: block.device!.state, known: block.device!.known, isNew: block.device!.isNew, transient: block.device!.transient, entityId: block.entityId, shown: shown(block.device!),
          screen: onScreen ? [Math.round(rect.left + (point.x + 1) / 2 * rect.width), Math.round(rect.top + (1 - point.y) / 2 * rect.height)] : null };
      }),
    };
  };

  return {
    state,
    advanceTime: (milliseconds: number) => { frame(Math.max(0, milliseconds) / 1000); return state(); },
    select: (key) => setSelected(key ? blockOf(key) : null, true),
    setFilter, setSearch,
    reload: load,
    dispose: () => {
      disposed = true;
      unsubscribe();
      host.scene.remove(halo, ring);
      (halo.material as LineBasicMaterial).dispose(); (ring.material as LineBasicMaterial).dispose();
      unitEdges.dispose();
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerleave", onPointerLeave);
      dom.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKey);
      surface.remove();
    },
  };
}

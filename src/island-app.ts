/**
 * L'île — the Clawblox island in GraphysX's look — `?app=island`.
 *
 * Clawblox stays the physics and agent authority; this page only renders its spectator stream.
 * `source=http://host:port` names a `clawblox run` (live) or `clawblox replay` server: both
 * serve `/spectate/ws` with open CORS, and a replay also answers `/replay/info` (transport) and
 * `/replay/agent` (the agent's words, when it was started with `--agent`). Without a source,
 * or with `source=fixture`, a short real capture of the island plays in a loop.
 *
 * Every part is an ordinary GraphysX entity in one transient scope (`clawblox-island`), so it
 * uses the same materials, water, sky, shadows and disposal as authored scenes but never
 * enters the authored history. Transforms are written to the scene graph through the host's
 * single frame loop (`subscribeFrame`), interpolated between server ticks.
 *
 * Live worlds behind a spectator token take it in the fragment (`#spectator_token=…`), never
 * the query string.
 *
 * `source=` may also name a GraphysX world service (`world-service/`) or its replay server
 * (`world-service/replay.mjs`). The page tells them apart by `GET /healthz` (`{ok, tick}`) plus
 * `GET /spectate` answering `text/event-stream`, and then reads that SSE stream instead
 * (`island-world-feed.ts`): the hello document becomes one transient scope with local physics
 * paused, and frames are applied with `applyHostPoses`, interpolated about 150 ms behind.
 * `capture=1` turns the page into the image sidecar's camera (`world-service/image-sidecar.mjs`).
 */
import { DirectionalLight, MathUtils, Quaternion, Vector3 } from "three";
import "./island.css";
import {
  agentPossessive, applyClawMessage, composeIsland, describeAgent, formatClock, islandBounds, islandMessages, islandMessagesAt,
  islandStructureKey, IslandPoseBuffer, ISLAND_SCOPE, parseIslandSource,
  type ClawObservation, type IslandMessage, type IslandPlacement,
} from "./island-feed";
import {
  applyWorldEntities, isEventStream, isWorldServiceHealth, lastWorldAction, parseWorldEvent, pickWorldAgent, worldActionMessages,
  worldAgentPlayer, worldAgents, worldBounds, worldEntityKinds, worldHostPoses, worldHostSwarms, WorldPoseBuffer, worldSceneFromHello, worldShellDocument,
  worldStructureKey, worldTransientDefinitions, WORLD_SCOPE,
  type WorldAction, type WorldAgent, type WorldScene,
} from "./island-world-feed";
import { findFlockSystem } from "./agent-world-flock";
import type { PlatformHost } from "./platform-host";
import { foldPresentationPanel } from "./presentation-mobile";
import { motionIsReduced } from "./platform-theme";

export type IslandApplication = {
  dispose: () => void;
  state: () => unknown;
  advanceTime: (milliseconds: number) => unknown;
};

export type IslandMountOptions = {
  /** Embedded in another page (the Benchmark "Île" tab): no exit button, compact header. */
  embedded?: boolean;
};

type ReplayInfo = { current_tick: number; total_ticks: number; first_tick?: number; tick_rate: number; speed: number; paused: boolean };
type Mode = "fixture" | "live" | "replay" | "unknown";
/** Which stream feeds the page: a Clawblox server, or a GraphysX world service / replay. */
type Feed = "clawblox" | "graphysx" | null;
type ProbeResult = "graphysx" | "other" | "unreachable";
/** The image sidecar's request: the agent's eye, its forward and the vertical field of view. */
type CaptureAim = { position: [number, number, number]; forward: [number, number, number]; verticalFovDeg: number; entityId: string | null; tick: number };

const WORLD_ID = "clawblox-island";
const SUN_ID = "island-sun";
const RECONNECT_MS = 2500;
const INFO_POLL_MS = 1000;
const FIXTURE_FRAME_MS = 250;
const SPEEDS = [1, 2, 4, 8];
/** A busy machine can be slow to answer; a probe that times out falls back to Clawblox and retries. */
const PROBE_MS = 6000;
const WORLD_ACTION_LIMIT = 2000;
const CAPTURE_CATCH_UP_MS = 1500;
/** Frames rendered after aiming: the first draws with the new camera, the second lets budgeted passes (shadows) catch up. */
const CAPTURE_SETTLE_FRAMES = 2;

/** The island's look. A world-service document keeps its own settings and borrows only the rest. */
const ISLAND_ENVIRONMENT: Record<string, unknown> = {
  background: "#9fc9e8",
  sky: "clearblue",
  lighting: { source: "sky", intensity: 1.05, yawDegrees: 35, backgroundIntensity: 1, backgroundBlur: 0 },
  // The island spans ~130 units inside an ocean drawn to the horizon; the host's showroom fog would swallow it.
  envelope: { fogNear: 160, fogFar: 1500, cameraFar: 2600 },
  post: { bloom: { strength: 0.22, radius: 0.4, threshold: 0.9 } },
  ground: { visible: false },
  physics: { gravity: [0, -9.81, 0] },
};

function islandWorld(): Record<string, unknown> {
  return {
    schema: "graphysx.agent-world/v2",
    id: WORLD_ID,
    label: "L'île · Clawblox",
    environment: structuredClone(ISLAND_ENVIRONMENT),
    entities: [
      { id: "island-ambient", label: "Lumière ambiante", type: "ambient-light", intensity: 0.55, material: { color: "#dfeeff" }, tags: ["lighting", "island"] },
      { id: SUN_ID, label: "Soleil", type: "directional-light", intensity: 2.6, transform: { position: [60, 90, 40] }, material: { color: "#fff1d8" }, tags: ["lighting", "island"], castShadow: true },
    ],
  };
}

export function mountIslandApp(root: HTMLElement, host: PlatformHost, onExit: () => void, options: IslandMountOptions = {}): IslandApplication {
  const params = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const embedded = options.embedded ?? params.get("embed") === "1";
  const sourceParam = params.get("source");
  const source = sourceParam && sourceParam !== "fixture" ? parseIslandSource(sourceParam) : null;
  const spectatorToken = fragment.get("spectator_token") ?? params.get("spectator_token");
  const capture = params.get("capture") === "1" && !!source;
  // The run's agent name, so the title and card hold steady before the agent first joins.
  let agentName: string | null = (params.get("agent") ?? "").trim().slice(0, 40) || null;
  const reduced = motionIsReduced();
  let disposed = false;
  let mode: Mode = source ? "unknown" : "fixture";
  let feed: Feed = source ? null : "clawblox";
  // Only a refused source is worth a banner; a missing one is the demonstration, said in the status line.
  let notice = sourceParam && sourceParam !== "fixture" && !source
    ? "Source refusée : il faut une adresse http(s), par exemple ?source=http://devx:18090. Capture de démonstration affichée."
    : "";

  // ---- surface ----------------------------------------------------------------------------
  const surface = document.createElement("section");
  surface.className = "gx-island";
  surface.dataset.embedded = String(embedded);
  surface.setAttribute("aria-label", "L'île Clawblox");
  surface.innerHTML = `
    <header class="gx-island-header">
      <div>
        <span class="gx-island-eyebrow">AgentX · Île · Clawblox</span>
        <h1>L'île <em data-agent-title></em></h1>
        <p class="gx-island-sub"><span class="gx-island-dot" data-dot></span><span data-status>Connexion…</span></p>
      </div>
      <div class="gx-island-actions">
        <button type="button" data-action="exit">Quitter</button>
      </div>
    </header>
    <p class="gx-island-notice" role="status" data-notice></p>
    <aside class="gx-island-panel" aria-label="Agent et messages">
      <button type="button" class="gx-island-agent" data-action="follow" aria-pressed="true" title="La caméra suit l'agent ; glisser pour tourner autour. Cliquer pour la libérer.">
        <span class="gx-island-mark" aria-hidden="true" data-agent-mark>E</span>
        <span><span class="gx-island-agent-name" data-agent-name>—</span><span class="gx-island-agent-state" data-agent-state></span></span>
        <span class="gx-island-follow" data-follow-label>suivie</span>
      </button>
      <p class="gx-island-action" data-agent-action></p>
      <h2>Messages</h2>
      <ol class="gx-island-messages" data-messages aria-live="polite"></ol>
    </aside>
    <section class="gx-island-transport" aria-label="Lecture de la reprise" data-transport hidden>
      <button type="button" data-action="toggle" aria-label="Pause">⏸</button>
      <input type="range" min="0" max="1" step="1" value="0" data-seek aria-label="Position dans la reprise">
      <span class="gx-island-clock" data-clock>0:00 / 0:00</span>
      <span class="gx-island-shared" title="Ces contrôles appartiennent au serveur de reprise : ils changent la lecture pour tous ceux qui la regardent.">lecture partagée</span>
      <label class="gx-island-speed">×<select data-speed aria-label="Vitesse">${SPEEDS.map((s) => `<option value="${s}">${s}</option>`).join("")}</select></label>
    </section>`;
  const element = <T extends HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const button = (action: string): HTMLButtonElement => element<HTMLButtonElement>(`[data-action="${action}"]`);
  if (embedded) button("exit").hidden = true;
  root.append(surface);
  foldPresentationPanel(element(".gx-island-panel"), "Eko · Messages");
  // The sidecar's camera page draws the world only: no header, panel or transport.
  if (capture) surface.style.display = "none";


  // ---- the world --------------------------------------------------------------------------
  const created = host.api.create(islandWorld() as never);
  if (!created.ok) throw new Error(created.error);
  host.api.pause(false);
  host.applyEnvironment();
  // The host's shadow box (±38) is sized for showroom scenes; the island needs ±75.
  const widenShadows = (id: string): void => {
    host.world.getEntityObject(id)?.traverse((child) => {
      if (!(child instanceof DirectionalLight)) return;
      const camera = child.shadow.camera;
      camera.left = -75; camera.right = 75; camera.top = 75; camera.bottom = -75; camera.far = 400;
      camera.updateProjectionMatrix();
      child.shadow.bias = -0.0004;
      child.shadow.normalBias = 0.04;
    });
  };
  widenShadows(SUN_ID);

  let state: ClawObservation | null = null;
  let structureKey = "";
  let placements: IslandPlacement[] = [];
  let reconcileError: string | null = null;
  let framedOnce = false;
  // The camera follows the agent by default; dragging still orbits around it.
  let follow = !capture;
  let followFramed = false;
  let lastFollow: Vector3 | null = null;
  let frames = 0;
  let snapshots = 0;
  let resets = 0;
  const poses = new IslandPoseBuffer(reduced ? 0 : 110);
  // ---- GraphysX world-service state (feed === "graphysx") ----
  let world: WorldScene | null = null;
  let worldKey = "";
  let worldEnvironmentKey = "";
  let worldAgent: WorldAgent | null = null;
  let worldActions: WorldAction[] = [];
  let worldFrames = 0;
  // The camera page draws the newest frame; viewers draw ~150 ms behind to interpolate.
  const worldPoses = new WorldPoseBuffer(capture || reduced ? 0 : 150);
  let captureAim: CaptureAim | null = null;
  const frameWaiters: { frame: number; resolve: () => void }[] = [];
  const tmpQuat = new Quaternion();
  const fixQuat = new Quaternion();
  const tmpOffset = new Vector3();

  const rebuild = (next: ClawObservation): void => {
    const composed = composeIsland(next);
    const result = host.world.reconcileTransientEntities(ISLAND_SCOPE, composed.definitions as never);
    if (!result.ok) {
      reconcileError = result.error ?? "reconcile failed";
      placements = [];
      return;
    }
    reconcileError = null;
    placements = composed.placements;
  };

  const place = (placement: IslandPlacement, p: [number, number, number], q: [number, number, number, number]): void => {
    const object = host.world.getEntityObject(placement.entityId);
    if (!object) return;
    tmpQuat.set(q[0], q[1], q[2], q[3]);
    tmpOffset.set(...placement.localOffset).applyQuaternion(tmpQuat);
    object.position.set(p[0] + tmpOffset.x, p[1] + tmpOffset.y, p[2] + tmpOffset.z);
    if (placement.localFix) tmpQuat.multiply(fixQuat.set(...placement.localFix));
    object.quaternion.copy(tmpQuat);
    object.updateMatrixWorld(true);
  };

  const placeAll = (now: number, movingOnly: boolean): void => {
    for (const placement of placements) {
      if (movingOnly && !placement.moving) continue;
      const pose = poses.sample(placement.clawId, now);
      if (pose) place(placement, pose.p, pose.q);
    }
  };

  const agentPlacement = (): IslandPlacement | null => placements.find((p) => p.kind === "agent") ?? null;
  const agentObjectPosition = (): Vector3 | null => {
    const entityId = feed === "graphysx" ? worldAgent?.entityId : agentPlacement()?.entityId;
    const object = entityId ? host.world.getEntityObject(entityId) : null;
    return object ? object.position.clone() : null;
  };

  const frameOverview = (seconds: number): void => {
    if (capture) return;
    const bounds = feed === "graphysx" ? (world ? worldBounds(world) : null) : state ? islandBounds(state) : null;
    if (!bounds) return;
    const { center, radius } = bounds;
    const narrow = (root.clientWidth || window.innerWidth) < (root.clientHeight || window.innerHeight);
    const distance = radius * (narrow ? 2.6 : 1.55);
    host.frameView([center[0] + distance * 0.62, center[1] + distance * 0.72, center[2] + distance * 0.78], [center[0], 0, center[2]], reduced ? 0 : seconds);
  };

  const accept = (next: ClawObservation): void => {
    state = next;
    snapshots += 1;
    const now = performance.now();
    if (poses.push(next, now)) resets += 1;
    const key = islandStructureKey(next);
    if (key !== structureKey) {
      structureKey = key;
      rebuild(next);
      placeAll(now, false);
    }
    if (!framedOnce && placements.length) { framedOnce = true; frameOverview(reduced ? 0 : 1.4); }
    updateAgentCard();
  };

  // ---- HUD --------------------------------------------------------------------------------
  let messages: IslandMessage[] = [];
  const chat: IslandMessage[] = [];
  let shownMessageKey: string | null = null;
  let replay: ReplayInfo | null = null;
  let connected = false;

  const setStatus = (text: string, tone: "ok" | "wait" | "bad"): void => {
    element("[data-status]").textContent = text;
    element("[data-dot]").dataset.tone = tone;
  };
  const setNotice = (text: string): void => {
    notice = text;
    const node = element("[data-notice]");
    node.textContent = text;
    node.hidden = !text;
  };
  setNotice(notice);

  const currentTick = (): number => replay?.current_tick ?? (feed === "graphysx" ? worldPoses.latestTick ?? world?.tick : state?.tick) ?? 0;
  // A replay shows actions up to its clock; a live world's actions have all happened already
  // (one can arrive just before the frame of its tick).
  const shownTick = (): number => (feed === "graphysx" && mode !== "replay" ? Number.POSITIVE_INFINITY : currentTick());
  const worldPlayer = () => worldAgentPlayer(
    worldAgent,
    lastWorldAction(worldActions, worldAgent?.name ?? null, shownTick()),
    worldAgent?.numericId != null ? worldPoses.velocity(worldAgent.numericId) : null,
  );

  const updateAgentCard = (): void => {
    const player = feed === "graphysx" ? worldPlayer() : state?.players[0];
    if (player?.name) agentName = player.name;
    const agent = describeAgent(player);
    const shownName = player ? agent.name : agentName ?? agent.name;
    element("[data-agent-name]").textContent = shownName;
    element("[data-agent-title]").textContent = agentPossessive(agentName) ?? "";
    element("[data-agent-mark]").textContent = player || agentName ? (shownName[0] ?? "?").toUpperCase() : "·";
    // Before the agent joins (a replay's opening, a world still starting) it is waiting, not gone.
    element("[data-agent-state]").textContent = player ? agent.state : agentName ? "pas encore arrivé" : agent.state;
    element("[data-agent-action]").textContent = agent.action ? `Dernière action : ${agent.action}` : "";
  };

  const renderMessages = (): void => {
    const visible = [...islandMessagesAt(messages, shownTick(), 30), ...chat.slice(-10)];
    const key = visible.map((m) => m.id).join(",");
    if (key === shownMessageKey) return;
    shownMessageKey = key;
    const list = element<HTMLOListElement>("[data-messages]");
    list.replaceChildren(...visible.map((message) => {
      const item = document.createElement("li");
      item.dataset.role = message.role;
      item.textContent = message.text;
      return item;
    }));
    if (!visible.length) {
      const empty = document.createElement("li");
      empty.dataset.role = "empty";
      empty.textContent = feed === "graphysx"
        ? "Aucune action pour l'instant."
        : mode === "live" ? "Aucun message de clavardage. Le journal de l'agent n'est lu qu'en reprise." : "Aucun message pour l'instant.";
      list.append(empty);
    }
    list.scrollTop = list.scrollHeight;
  };

  const renderTransport = (): void => {
    const transport = element("[data-transport]");
    transport.hidden = mode !== "replay" || !replay;
    if (!replay || transport.hidden) return;
    const first = replay.first_tick ?? 0;
    const seek = element<HTMLInputElement>("[data-seek]");
    seek.min = String(first);
    seek.max = String(replay.total_ticks);
    if (!seekDragging) seek.value = String(replay.current_tick);
    element("[data-clock]").textContent = `${formatClock(replay.current_tick - first, replay.tick_rate)} / ${formatClock(replay.total_ticks - first, replay.tick_rate)}`;
    const toggle = button("toggle");
    toggle.textContent = replay.paused ? "▶" : "⏸";
    toggle.setAttribute("aria-label", replay.paused ? "Lire" : "Pause");
    const speed = element<HTMLSelectElement>("[data-speed]");
    if (document.activeElement !== speed) speed.value = String(SPEEDS.includes(replay.speed) ? replay.speed : 4);
  };

  // ---- transport (replay only; these are the replay server's own shared controls) -----------
  let seekDragging = false;
  // Clawblox takes these as query parameters (`/replay/seek?tick=`, `/replay/speed?value=`).
  const post = async (path: string): Promise<void> => {
    if (!source) return;
    try {
      await fetch(`${source.http}${path}`, { method: "POST" });
    } catch { /* the next info poll says what happened */ }
    void pollInfo();
  };
  button("toggle").addEventListener("click", () => { void post(replay?.paused ? "/replay/play" : "/replay/pause"); });
  const seek = element<HTMLInputElement>("[data-seek]");
  seek.addEventListener("input", () => { seekDragging = true; });
  seek.addEventListener("change", () => { seekDragging = false; void post(`/replay/seek?tick=${Math.round(Number(seek.value))}`); });
  element<HTMLSelectElement>("[data-speed]").addEventListener("change", (event) => {
    void post(`/replay/speed?value=${Number((event.target as HTMLSelectElement).value)}`);
  });

  const setFollow = (on: boolean): void => {
    follow = on;
    followFramed = false;
    lastFollow = null;
    button("follow").setAttribute("aria-pressed", String(on));
    element("[data-follow-label]").textContent = on ? "suivie" : "libre";
    if (!on) frameOverview(reduced ? 0 : 1.2);
  };
  button("follow").addEventListener("click", () => setFollow(!follow));
  button("exit").addEventListener("click", () => onExit());

  // ---- feeds ------------------------------------------------------------------------------
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let infoTimer: number | null = null;
  let fixtureTimer: number | null = null;

  let autoStarted = false;
  const pollInfo = async (): Promise<void> => {
    if (!source || disposed) return;
    try {
      const response = await fetch(`${source.http}/replay/info`, { cache: "no-store" });
      const info = response.ok ? await response.json() as ReplayInfo | null : null;
      if (info && typeof info.total_ticks === "number") {
        const wasReplay = mode === "replay";
        mode = "replay";
        replay = info;
        if (!wasReplay) void (feed === "graphysx" ? loadWorldActions() : loadAgentLog());
        // An embedded view of a freshly opened replay session (paused at its first tick) starts
        // itself, skipping the idle stretches before the agent acts. Once per page, and never
        // when the shared replay is already somewhere else.
        if (!wasReplay && embedded && !autoStarted && info.paused && info.current_tick <= (info.first_tick ?? 0) + 1) {
          autoStarted = true;
          void post("/replay/skip-idle?enabled=true").then(() => post("/replay/play"));
        }
      } else if (feed !== "graphysx") {
        mode = "live";
        replay = null;
      }
    } catch {
      // Status says it through the socket state; keep the last known transport.
    }
    renderTransport();
    renderMessages();
    updateStatus();
  };

  const loadAgentLog = async (): Promise<void> => {
    if (!source) return;
    try {
      const response = await fetch(`${source.http}/replay/agent`, { cache: "no-store" });
      if (!response.ok) return;
      const timeline = await response.json() as { enabled?: boolean };
      messages = islandMessages(timeline);
      if (timeline.enabled === false && !messages.length) setNotice("Cette reprise a été lancée sans --agent : pas de journal de l'agent.");
      shownMessageKey = null;
      renderMessages();
    } catch { /* messages stay empty; the world still renders */ }
  };

  const updateStatus = (): void => {
    if (mode === "fixture") { setStatus("Capture de démonstration · boucle", "ok"); return; }
    if (!connected) { setStatus(feed === "graphysx" ? "Connexion au monde GraphysX…" : "Connexion au serveur Clawblox…", "wait"); return; }
    if (mode === "replay" && replay) {
      setStatus(`Reprise · ×${replay.speed}${replay.paused ? " · en pause" : ""}`, "ok");
      return;
    }
    if (feed === "graphysx") { setStatus(mode === "live" ? "En direct · monde GraphysX" : "Connecté", "ok"); return; }
    setStatus(mode === "live" ? `En direct · ${state?.game_status ?? "…"}` : "Connecté", "ok");
  };

  const connect = (): void => {
    if (!source || disposed) return;
    const url = new URL(`${source.ws}/spectate/ws`);
    if (spectatorToken) url.searchParams.set("spectator_token", spectatorToken);
    const ws = new WebSocket(url);
    socket = ws;
    let opened = false;
    ws.addEventListener("open", () => { opened = true; connected = true; updateStatus(); });
    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let raw: unknown;
      try { raw = JSON.parse(event.data); } catch { return; }
      const result = applyClawMessage(state, raw);
      if (result.kind === "full" || result.kind === "delta") accept(result.state);
      else if (result.kind === "chat") {
        chat.push({ id: `chat:${result.chat.id}`, tick: state?.tick ?? 0, role: "agent", text: `${result.chat.agentName} : ${result.chat.content}` });
        if (chat.length > 50) chat.shift();
        renderMessages();
      } else if (result.kind === "error") setNotice(result.message);
    });
    ws.addEventListener("close", () => {
      if (socket !== ws) return;
      connected = false;
      socket = null;
      state = null; // the next connection starts from a full observation
      updateStatus();
      if (disposed) return;
      // A world service that was not up at the first look is recognised when it comes up.
      if (!opened) {
        reconnectTimer = window.setTimeout(() => {
          void probeWorldService().then((kind) => {
            if (disposed || socket) return;
            if (kind === "graphysx") startWorld();
            else connect();
          });
        }, RECONNECT_MS);
        return;
      }
      reconnectTimer = window.setTimeout(connect, RECONNECT_MS);
    });
    ws.addEventListener("error", () => { setNotice(`Serveur Clawblox injoignable : ${source.http}`); });
  };

  // ---- the GraphysX world-service feed --------------------------------------------------------
  let events: EventSource | null = null;

  /** `/healthz` answering `{ok, tick}` and `/spectate` answering an event stream: a world service. */
  const probeWorldService = async (): Promise<ProbeResult> => {
    if (!source) return "other";
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), PROBE_MS);
    try {
      const health = await fetch(`${source.http}/healthz`, { cache: "no-store", signal: controller.signal });
      if (!health.ok || !isWorldServiceHealth(await health.json().catch(() => null))) return "other";
      const stream = await fetch(`${source.http}/spectate`, { cache: "no-store", signal: controller.signal });
      return stream.ok && isEventStream(stream.headers.get("content-type")) ? "graphysx" : "other";
    } catch {
      return "unreachable";
    } finally {
      window.clearTimeout(timer);
      controller.abort(); // closes the probe's stream
    }
  };

  const refreshWorldMessages = (): void => {
    messages = worldActionMessages(worldActions, world ? worldAgents(world).length > 1 : false);
    shownMessageKey = null;
    renderMessages();
    updateAgentCard();
  };

  const loadWorldActions = async (): Promise<void> => {
    if (!source) return;
    try {
      const response = await fetch(`${source.http}/replay/actions`, { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json() as { actions?: unknown[] };
      worldActions = [];
      for (const raw of body.actions ?? []) {
        const parsed = parseWorldEvent("action", JSON.stringify(raw));
        if (parsed.kind === "action") worldActions.push(parsed.action);
      }
      refreshWorldMessages();
    } catch { /* the world still renders without its action log */ }
  };

  const applyWorldPoses = (now: number): void => {
    if (!world) return;
    host.world.applyHostPoses(worldHostPoses(worldPoses, world.ids, now));
    // A flock's members fly where the server says (living island); the local flock is paused.
    for (const swarm of worldHostSwarms(worldPoses, world.ids, now)) {
      const object = host.world.getEntityObject(swarm.id);
      if (object) findFlockSystem(object)?.writeMembers(swarm);
    }
  };

  /** Load the scene's look once, then (re)build its entities as one transient scope. */
  const applyWorldStructure = (force: boolean): void => {
    if (!world) return;
    const environmentKey = JSON.stringify(world.environment);
    if (environmentKey !== worldEnvironmentKey) {
      worldEnvironmentKey = environmentKey;
      const { background: _background, ...look } = ISLAND_ENVIRONMENT;
      void _background;
      const created = host.api.create(worldShellDocument(world, look) as never);
      if (!created.ok) { reconcileError = created.error ?? "create failed"; return; }
      // The server is the only truth: nothing simulates here.
      host.api.pause(true);
      host.applyEnvironment();
      force = true;
    }
    const key = worldStructureKey(world);
    if (!force && key === worldKey) return;
    worldKey = key;
    const result = host.world.reconcileTransientEntities(WORLD_SCOPE, worldTransientDefinitions(world) as never);
    reconcileError = result.ok ? null : result.error ?? "reconcile failed";
    for (const entity of world.entities) if (entity.type === "directional-light") widenShadows(entity.id);
    worldAgent = pickWorldAgent(worldAgents(world), agentName);
    applyWorldPoses(performance.now());
  };

  const onWorldEvent = (name: string, data: string): void => {
    const result = parseWorldEvent(name, data);
    if (result.kind === "hello") {
      world = worldSceneFromHello(result.hello);
      worldPoses.clear();
      // A replay server's hello says so; pollInfo then switches to replay (transport, action
      // log, embedded auto-start) exactly as for a Clawblox replay.
      if (result.hello.replay) {
        if (infoTimer === null) {
          void pollInfo();
          infoTimer = window.setInterval(() => { void pollInfo(); }, INFO_POLL_MS);
        }
      } else mode = "live";
      applyWorldStructure(true);
      snapshots += 1;
      updateAgentCard();
      updateStatus();
    } else if (result.kind === "frame") {
      if (!world) return;
      if (worldPoses.push(result.frame, performance.now())) resets += 1;
      world.tick = result.frame.tick;
      worldFrames += 1;
      snapshots += 1;
      if (worldFrames === 1) applyWorldPoses(performance.now());
      if (!framedOnce && world.entities.length) { framedOnce = true; frameOverview(reduced ? 0 : 1.4); }
      updateAgentCard();
      if (mode === "replay") renderMessages();
    } else if (result.kind === "entities") {
      if (!world) return;
      world = applyWorldEntities(world, result.change);
      applyWorldStructure(false);
    } else if (result.kind === "action") {
      // A replay's whole action log comes from /replay/actions; the stream repeats it.
      if (mode === "replay") return;
      worldActions.push(result.action);
      if (worldActions.length > WORLD_ACTION_LIMIT) worldActions.splice(0, worldActions.length - WORLD_ACTION_LIMIT);
      refreshWorldMessages();
    } else if (result.kind === "error") setNotice(result.message);
  };

  const connectWorld = (): void => {
    if (!source || disposed) return;
    const stream = new EventSource(`${source.http}/spectate`);
    events = stream;
    stream.addEventListener("open", () => { connected = true; updateStatus(); });
    for (const name of ["hello", "frame", "entities", "action"]) {
      stream.addEventListener(name, (event) => { if (events === stream) onWorldEvent(name, String((event as MessageEvent).data)); });
    }
    stream.addEventListener("error", () => {
      if (events !== stream) return;
      connected = false;
      updateStatus();
      // EventSource retries a dropped stream by itself (and the server re-sends hello);
      // a refused one (capacity, 4xx) is closed and retried here.
      if (stream.readyState === EventSource.CLOSED) {
        events = null;
        if (!disposed) reconnectTimer = window.setTimeout(connectWorld, RECONNECT_MS);
      }
    });
  };

  const startWorld = (): void => {
    feed = "graphysx";
    // Coming from the Clawblox path (the world was not up, or the first probe timed out):
    // its replay poller and transport state do not apply to a world service.
    if (infoTimer !== null) { window.clearInterval(infoTimer); infoTimer = null; }
    mode = "unknown";
    replay = null;
    renderTransport();
    surface.setAttribute("aria-label", "L'île GraphysX");
    element(".gx-island-eyebrow").textContent = "AgentX · Île · GraphysX";
    setNotice("");
    // The Clawblox island parts (none yet) give way to the world's own scene on its first hello.
    host.world.clearTransientEntities(ISLAND_SCOPE);
    placements = [];
    structureKey = "";
    updateStatus();
    connectWorld();
  };

  const startClawblox = (): void => {
    feed = "clawblox";
    setStatus("Connexion au serveur Clawblox…", "wait");
    void pollInfo();
    infoTimer = window.setInterval(() => { void pollInfo(); }, INFO_POLL_MS);
    connect();
  };

  // ---- the image sidecar's camera (capture=1) ---------------------------------------------------
  const nextFrames = (count: number): Promise<void> => new Promise((resolve) => frameWaiters.push({ frame: frames + count, resolve }));
  const aimCapture = (aim: CaptureAim): void => {
    if (world) {
      for (const agent of worldAgents(world)) {
        const object = host.world.getEntityObject(agent.entityId);
        if (object) object.visible = agent.entityId !== aim.entityId;
      }
    }
    const [x, y, z] = aim.position;
    const [fx, , fz] = aim.forward;
    const length = Math.hypot(fx, fz) || 1;
    host.frameView([x, y, z], [x + (fx / length) * 10, y, z + (fz / length) * 10], 0);
    const fov = MathUtils.clamp(aim.verticalFovDeg, 1, 179);
    if (host.camera.fov !== fov) { host.camera.fov = fov; host.camera.updateProjectionMatrix(); }
  };
  type CaptureHook = {
    ready: () => boolean;
    aim: (aim: CaptureAim) => Promise<{ tick: number | null; waitedMs: number }>;
    release: () => void;
  };
  const captureWindow = window as unknown as { __graphysxIslandCapture?: CaptureHook };
  if (capture) {
    captureWindow.__graphysxIslandCapture = {
      ready: () => feed === "graphysx" && !!world && worldPoses.size > 0 && reconcileError === null,
      // Draw again: the stream kept the poses current while the frame loop was suspended.
      aim: async (aim) => {
        const started = performance.now();
        host.setFramesSuspended(false);
        // The request names the world tick it was asked at; draw a frame at least that recent
        // (frames come every 6 ticks), or the newest one after a short wait.
        // Frames arrive over the stream whatever the renderer does, so wait on a timer, not on renders.
        while ((worldPoses.latestTick ?? -1) < aim.tick - 6 && performance.now() - started < CAPTURE_CATCH_UP_MS) {
          await new Promise((resolve) => window.setTimeout(resolve, 20));
        }
        captureAim = aim;
        await nextFrames(CAPTURE_SETTLE_FRAMES);
        return { tick: worldPoses.latestTick, waitedMs: Math.round(performance.now() - started) };
      },
      // Between captures the camera page draws nothing (software WebGL would keep cores busy).
      release: () => host.setFramesSuspended(true),
    };
  }

  const startFixture = async (): Promise<void> => {
    const { default: fixture } = await import("./island-fixture.json");
    if (disposed) return;
    const data = fixture as unknown as { tickRate: number; full: unknown; deltas: unknown[]; agent: unknown };
    messages = islandMessages(data.agent);
    let index = -1;
    const step = (): void => {
      if (disposed) return;
      const raw = index < 0 ? data.full : data.deltas[index];
      const result = applyClawMessage(index < 0 ? null : state, raw);
      if (result.kind === "full" || result.kind === "delta") accept(result.state);
      index = index + 1 >= data.deltas.length ? -1 : index + 1;
      renderMessages();
    };
    step();
    fixtureTimer = window.setInterval(step, FIXTURE_FRAME_MS);
    updateStatus();
  };

  if (source) {
    setStatus("Connexion…", "wait");
    // A Clawblox server answers /healthz with 404 (or not at all): its paths start as before.
    void probeWorldService().then((kind) => {
      if (disposed) return;
      if (kind === "graphysx") startWorld();
      else startClawblox();
    });
  } else {
    void startFixture();
  }

  // ---- the one frame loop -----------------------------------------------------------------
  let editing = false;
  const frame = (): void => {
    if (disposed) return;
    frames += 1;
    const nowEditing = host.mode === "editor";
    if (nowEditing !== editing) {
      editing = nowEditing;
      for (const node of surface.children) if (node instanceof HTMLElement) node.hidden = editing || (node.hasAttribute("data-transport") && mode !== "replay");
      if (!editing) setNotice(notice);
    }
    for (let i = frameWaiters.length - 1; i >= 0; i -= 1) {
      if (frames >= frameWaiters[i].frame) { frameWaiters[i].resolve(); frameWaiters.splice(i, 1); }
    }
    if (feed === "graphysx") {
      if (!world) return;
      applyWorldPoses(performance.now());
      if (captureAim) { aimCapture(captureAim); return; }
    } else {
      if (!placements.length) return;
      placeAll(performance.now(), true);
    }
    if (follow) {
      const at = agentObjectPosition();
      // Ease onto the agent once (after the opening overview), then carry the camera with it.
      if (at && !followFramed && !host.focusing) {
        followFramed = true;
        host.focusOn(at.clone().setY(at.y + 2.5), 7, reduced ? 0 : 1.1, 40);
        // The ease lands on where the agent was; whatever it walks meanwhile is caught up after.
        lastFollow = at;
      }
      if (at && lastFollow && followFramed && !host.focusing) {
        const delta = at.clone().sub(lastFollow);
        if (delta.lengthSq() > 1e-8) {
          const target = host.orbitTarget.add(delta);
          const position = host.camera.position.clone().add(delta);
          host.frameView([position.x, position.y, position.z], [target.x, target.y, target.z], 0);
        }
        lastFollow = at;
      }
    }
  };
  const unsubscribe = host.subscribeFrame(frame);

  const snapshotState = (): unknown => {
    const agentAt = agentObjectPosition();
    const pivot = host.orbitTarget;
    const eye = host.camera.position;
    const round2 = (n: number): number => Math.round(n * 100) / 100;
    const graphysx = feed === "graphysx";
    return {
      application: "island",
      mode,
      feed,
      capture,
      source: source?.http ?? "fixture",
      connected: mode === "fixture" ? true : connected,
      embedded,
      notice,
      tick: graphysx ? worldPoses.latestTick ?? world?.tick ?? null : state?.tick ?? null,
      gameStatus: graphysx ? (world ? "active" : null) : state?.game_status ?? null,
      snapshots,
      resets,
      frames,
      parts: graphysx ? world?.entities.length ?? 0 : placements.length,
      moving: graphysx ? worldPoses.ids().length : placements.filter((p) => p.moving).length,
      kinds: graphysx
        ? (world ? worldEntityKinds(world) : {})
        : placements.reduce<Record<string, number>>((counts, p) => { counts[p.kind] = (counts[p.kind] ?? 0) + 1; return counts; }, {}),
      world: graphysx && world ? {
        label: world.label,
        agents: worldAgents(world).map((agent) => agent.name),
        followed: worldAgent?.name ?? null,
        frames: worldFrames,
        actions: worldActions.length,
      } : null,
      reconcileError,
      autoStarted,
      agent: { ...describeAgent(graphysx ? worldPlayer() : state?.players[0]), title: agentPossessive(agentName), position: agentAt ? [agentAt.x, agentAt.y, agentAt.z].map((n) => Math.round(n * 100) / 100) : null },
      follow,
      camera: {
        azimuth: round2(Math.atan2(eye.x - pivot.x, eye.z - pivot.z)),
        distanceToAgent: agentAt ? round2(eye.distanceTo(agentAt)) : null,
        pivotToAgent: agentAt ? round2(Math.hypot(pivot.x - agentAt.x, pivot.z - agentAt.z)) : null,
      },
      replay,
      messages: element("[data-messages]").children.length,
      messageLog: messages.length,
    };
  };

  return {
    state: snapshotState,
    advanceTime: (milliseconds: number) => { frame(); void milliseconds; return snapshotState(); },
    dispose: () => {
      disposed = true;
      unsubscribe();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (infoTimer !== null) window.clearInterval(infoTimer);
      if (fixtureTimer !== null) window.clearInterval(fixtureTimer);
      const ws = socket;
      socket = null;
      ws?.close();
      events?.close();
      events = null;
      if (capture) {
        delete captureWindow.__graphysxIslandCapture;
        host.setFramesSuspended(false);
      }
      for (const waiter of frameWaiters.splice(0)) waiter.resolve();
      host.world.clearTransientEntities(ISLAND_SCOPE);
      host.world.clearTransientEntities(WORLD_SCOPE);
      surface.remove();
    },
  };
}

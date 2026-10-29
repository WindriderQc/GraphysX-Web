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
 */
import { DirectionalLight, Quaternion, Vector3 } from "three";
import "./island.css";
import {
  applyClawMessage, composeIsland, describeAgent, formatClock, islandBounds, islandMessages, islandMessagesAt,
  islandStructureKey, IslandPoseBuffer, ISLAND_SCOPE, parseIslandSource,
  type ClawObservation, type IslandMessage, type IslandPlacement,
} from "./island-feed";
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

const WORLD_ID = "clawblox-island";
const SUN_ID = "island-sun";
const RECONNECT_MS = 2500;
const INFO_POLL_MS = 1000;
const FIXTURE_FRAME_MS = 250;
const SPEEDS = [1, 2, 4, 8];

function islandWorld(): Record<string, unknown> {
  return {
    schema: "graphysx.agent-world/v2",
    id: WORLD_ID,
    label: "L'île · Clawblox",
    environment: {
      background: "#9fc9e8",
      sky: "clearblue",
      lighting: { source: "sky", intensity: 1.05, yawDegrees: 35, backgroundIntensity: 1, backgroundBlur: 0 },
      // The island spans ~130 units inside an ocean drawn to the horizon; the host's showroom fog would swallow it.
      envelope: { fogNear: 160, fogFar: 1500, cameraFar: 2600 },
      post: { bloom: { strength: 0.22, radius: 0.4, threshold: 0.9 } },
      ground: { visible: false },
      physics: { gravity: [0, -9.81, 0] },
    },
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
  const reduced = motionIsReduced();
  let disposed = false;
  let mode: Mode = source ? "unknown" : "fixture";
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
        <h1>L'île <em data-agent-title>d'Eko</em></h1>
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
      <label class="gx-island-speed">×<select data-speed aria-label="Vitesse">${SPEEDS.map((s) => `<option value="${s}">${s}</option>`).join("")}</select></label>
    </section>`;
  const element = <T extends HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const button = (action: string): HTMLButtonElement => element<HTMLButtonElement>(`[data-action="${action}"]`);
  if (embedded) button("exit").hidden = true;
  root.append(surface);
  foldPresentationPanel(element(".gx-island-panel"), "Eko · Messages");


  // ---- the world --------------------------------------------------------------------------
  const created = host.api.create(islandWorld() as never);
  if (!created.ok) throw new Error(created.error);
  host.api.pause(false);
  host.applyEnvironment();
  // The host's shadow box (±38) is sized for showroom scenes; the island needs ±75.
  const sunObject = host.world.getEntityObject(SUN_ID);
  sunObject?.traverse((child) => {
    if (!(child instanceof DirectionalLight)) return;
    const camera = child.shadow.camera;
    camera.left = -75; camera.right = 75; camera.top = 75; camera.bottom = -75; camera.far = 400;
    camera.updateProjectionMatrix();
    child.shadow.bias = -0.0004;
    child.shadow.normalBias = 0.04;
  });

  let state: ClawObservation | null = null;
  let structureKey = "";
  let placements: IslandPlacement[] = [];
  let reconcileError: string | null = null;
  let framedOnce = false;
  // The camera follows the agent by default; dragging still orbits around it.
  let follow = true;
  let followFramed = false;
  let lastFollow: Vector3 | null = null;
  let frames = 0;
  let snapshots = 0;
  let resets = 0;
  const poses = new IslandPoseBuffer(reduced ? 0 : 110);
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
    const placement = agentPlacement();
    const object = placement ? host.world.getEntityObject(placement.entityId) : null;
    return object ? object.position.clone() : null;
  };

  const frameOverview = (seconds: number): void => {
    if (!state) return;
    const { center, radius } = islandBounds(state);
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

  const updateAgentCard = (): void => {
    const player = state?.players[0];
    const agent = describeAgent(player);
    element("[data-agent-name]").textContent = agent.name;
    element("[data-agent-title]").textContent = player?.name ? `d'${player.name}` : "Clawblox";
    element("[data-agent-mark]").textContent = player ? (agent.name[0] ?? "?").toUpperCase() : "·";
    element("[data-agent-state]").textContent = agent.state;
    element("[data-agent-action]").textContent = agent.action ? `Dernière action : ${agent.action}` : "";
  };

  const renderMessages = (): void => {
    const tick = replay?.current_tick ?? state?.tick ?? 0;
    const visible = [...islandMessagesAt(messages, tick, 30), ...chat.slice(-10)];
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
      empty.textContent = mode === "live" ? "Aucun message de clavardage. Le journal de l'agent n'est lu qu'en reprise." : "Aucun message pour l'instant.";
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

  const pollInfo = async (): Promise<void> => {
    if (!source || disposed) return;
    try {
      const response = await fetch(`${source.http}/replay/info`, { cache: "no-store" });
      const info = response.ok ? await response.json() as ReplayInfo | null : null;
      if (info && typeof info.total_ticks === "number") {
        const wasReplay = mode === "replay";
        mode = "replay";
        replay = info;
        if (!wasReplay) void loadAgentLog();
      } else {
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
    if (!connected) { setStatus("Connexion au serveur Clawblox…", "wait"); return; }
    if (mode === "replay" && replay) {
      setStatus(`Reprise · ×${replay.speed}${replay.paused ? " · en pause" : ""}`, "ok");
      return;
    }
    setStatus(mode === "live" ? `En direct · ${state?.game_status ?? "…"}` : "Connecté", "ok");
  };

  const connect = (): void => {
    if (!source || disposed) return;
    const url = new URL(`${source.ws}/spectate/ws`);
    if (spectatorToken) url.searchParams.set("spectator_token", spectatorToken);
    const ws = new WebSocket(url);
    socket = ws;
    ws.addEventListener("open", () => { connected = true; updateStatus(); });
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
      if (!disposed) reconnectTimer = window.setTimeout(connect, RECONNECT_MS);
    });
    ws.addEventListener("error", () => { setNotice(`Serveur Clawblox injoignable : ${source.http}`); });
  };

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
    setStatus("Connexion au serveur Clawblox…", "wait");
    void pollInfo();
    infoTimer = window.setInterval(() => { void pollInfo(); }, INFO_POLL_MS);
    connect();
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
    if (!placements.length) return;
    placeAll(performance.now(), true);
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
    return {
      application: "island",
      mode,
      source: source?.http ?? "fixture",
      connected: mode === "fixture" ? true : connected,
      embedded,
      notice,
      tick: state?.tick ?? null,
      gameStatus: state?.game_status ?? null,
      snapshots,
      resets,
      frames,
      parts: placements.length,
      moving: placements.filter((p) => p.moving).length,
      kinds: placements.reduce<Record<string, number>>((counts, p) => { counts[p.kind] = (counts[p.kind] ?? 0) + 1; return counts; }, {}),
      reconcileError,
      agent: { ...describeAgent(state?.players[0]), position: agentAt ? [agentAt.x, agentAt.y, agentAt.z].map((n) => Math.round(n * 100) / 100) : null },
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
      host.world.clearTransientEntities(ISLAND_SCOPE);
      surface.remove();
    },
  };
}

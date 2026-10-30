/**
 * A GraphysX world-service island as viewer state — the pure half of `?app=island` for
 * `source=<world-service base>`, parallel to `island-feed.ts` (the Clawblox half).
 *
 * The world service (`world-service/` in this repository, or its read-only replay server)
 * owns the simulation. Its `GET /spectate` SSE stream sends:
 *
 * - `hello`: `{format, tickHz, tick, document, ids}` — the current agent-world/v2 document and
 *   numeric id → entity id (a replay sends a fresh hello after every seek);
 * - `frame` at 10 Hz: `{tick, t, poses: [[id, x, y, z, qx, qy, qz, qw], …]}` for moving things,
 *   plus, on the living island, `swarms: [[id, x, y, z, x, y, z, …]]`: every member of a flock in
 *   flock-local space (the flock entity itself stays put);
 * - `entities`: `{tick, added?: [{entity, numericId}], removed?: [numericId]}` (an entity re-added
 *   under its id replaces the old definition: a tree that changed generation or grew);
 * - `action`: `{tick, agent, input, result}` — every agent action with its LastActionResult.
 *
 * This module parses that stream, keeps the scene's entity list, turns it into transient
 * entity definitions (no `physics`: the viewer never simulates) and buffers frames so moving
 * things are drawn between server frames. No DOM and no three.js, so Node tests run it as is.
 */
import { slerpQuat, type ClawPlayer, type ClawQuat, type ClawVec3, type IslandMessage } from "./island-feed";

export const WORLD_STREAM_FORMAT = "graphysx-world-stream/v1";
/** Transient scope holding every entity of a world-service island in the viewer. */
export const WORLD_SCOPE = "graphysx-world";
export const WORLD_TAG = "world-part";

export type WorldEntityDefinition = Record<string, unknown> & { id: string; type?: string; label?: string };

export type WorldDocument = {
  schema?: string;
  id?: string;
  label?: string;
  environment?: Record<string, unknown>;
  entities: WorldEntityDefinition[];
};

/** `replay` is set by the replay server (world-service/replay.mjs), never by a live world. */
export type WorldHello = { format: string; tickHz: number; tick: number; document: WorldDocument; ids: Record<string, string>; replay: boolean };
export type WorldFrame = { tick: number; t: number; poses: number[][]; swarms?: number[][] };
export type WorldEntitiesChange = { tick: number; added?: { entity: WorldEntityDefinition; numericId: number }[]; removed?: number[] };
export type WorldAction = { tick: number; agent: string; input: { type: string; data?: Record<string, unknown> | null }; result: string };

export type WorldEventResult =
  | { kind: "hello"; hello: WorldHello }
  | { kind: "frame"; frame: WorldFrame }
  | { kind: "entities"; change: WorldEntitiesChange }
  | { kind: "action"; action: WorldAction }
  | { kind: "error"; message: string }
  | { kind: "ignored" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const isEntity = (value: unknown): value is WorldEntityDefinition =>
  isRecord(value) && typeof value.id === "string" && value.id.length > 0;

/** Parse one SSE message (`event:` name and `data:` text). Malformed payloads never throw. */
export function parseWorldEvent(event: string, data: string): WorldEventResult {
  let raw: unknown;
  try { raw = JSON.parse(data); } catch { return event === "hello" || event === "frame" ? { kind: "error", message: `Malformed ${event} event` } : { kind: "ignored" }; }
  if (!isRecord(raw)) return { kind: "ignored" };
  switch (event) {
    case "hello": {
      if (raw.format !== WORLD_STREAM_FORMAT) return { kind: "error", message: `Unknown world stream format: ${String(raw.format)}` };
      const document = raw.document;
      if (!isRecord(document) || !Array.isArray(document.entities)) return { kind: "error", message: "hello without a document" };
      const ids: Record<string, string> = {};
      if (isRecord(raw.ids)) for (const [key, value] of Object.entries(raw.ids)) if (typeof value === "string") ids[key] = value;
      return {
        kind: "hello",
        hello: {
          format: WORLD_STREAM_FORMAT,
          tickHz: finite(raw.tickHz) && raw.tickHz > 0 ? raw.tickHz : 60,
          tick: finite(raw.tick) ? raw.tick : 0,
          document: { ...(document as Omit<WorldDocument, "entities">), entities: (document.entities as unknown[]).filter(isEntity) },
          ids,
          replay: raw.replay === true,
        },
      };
    }
    case "frame": {
      if (!finite(raw.tick) || !Array.isArray(raw.poses)) return { kind: "error", message: "Malformed frame event" };
      const poses = (raw.poses as unknown[]).filter((pose): pose is number[] => Array.isArray(pose) && pose.length >= 8 && pose.slice(0, 8).every(finite));
      const frame: WorldFrame = { tick: raw.tick, t: finite(raw.t) ? raw.t : 0, poses };
      if (Array.isArray(raw.swarms)) {
        frame.swarms = (raw.swarms as unknown[]).filter((swarm): swarm is number[] =>
          Array.isArray(swarm) && swarm.length >= 4 && (swarm.length - 1) % 3 === 0 && swarm.every(finite));
      }
      return { kind: "frame", frame };
    }
    case "entities": {
      if (!finite(raw.tick)) return { kind: "ignored" };
      const added = Array.isArray(raw.added)
        ? (raw.added as unknown[]).filter((entry): entry is { entity: WorldEntityDefinition; numericId: number } => isRecord(entry) && isEntity(entry.entity) && finite(entry.numericId))
        : [];
      const removed = Array.isArray(raw.removed) ? (raw.removed as unknown[]).filter(finite) : [];
      return { kind: "entities", change: { tick: raw.tick, added, removed } };
    }
    case "action": {
      if (!finite(raw.tick) || typeof raw.agent !== "string" || !isRecord(raw.input) || typeof raw.input.type !== "string") return { kind: "ignored" };
      return {
        kind: "action",
        action: {
          tick: raw.tick, agent: raw.agent,
          input: { type: raw.input.type, data: isRecord(raw.input.data) ? raw.input.data : null },
          result: typeof raw.result === "string" ? raw.result : "",
        },
      };
    }
    default:
      return { kind: "ignored" };
  }
}

// ---- the scene ----------------------------------------------------------------------------

export type WorldScene = {
  tick: number;
  tickHz: number;
  label: string;
  environment: Record<string, unknown>;
  /** Document order; additions go last. */
  entities: WorldEntityDefinition[];
  /** numeric id → entity id. */
  ids: Map<number, string>;
};

export function worldSceneFromHello(hello: WorldHello): WorldScene {
  const ids = new Map<number, string>();
  for (const [key, value] of Object.entries(hello.ids)) {
    const numeric = Number(key);
    if (Number.isInteger(numeric)) ids.set(numeric, value);
  }
  return {
    tick: hello.tick,
    tickHz: hello.tickHz,
    label: typeof hello.document.label === "string" ? hello.document.label : "Monde GraphysX",
    environment: isRecord(hello.document.environment) ? hello.document.environment : {},
    entities: hello.document.entities.map((entity) => ({ ...entity })),
    ids,
  };
}

/** Additions and removals (rock-impact cubes, culled blocks, agents joining). Never mutates. */
export function applyWorldEntities(scene: WorldScene, change: WorldEntitiesChange): WorldScene {
  const ids = new Map(scene.ids);
  const gone = new Set<string>();
  for (const numeric of change.removed ?? []) {
    const id = ids.get(numeric);
    if (id) gone.add(id);
    ids.delete(numeric);
  }
  // A removed parent takes its children with it, as in the runtime.
  let grew = true;
  while (grew) {
    grew = false;
    for (const entity of scene.entities) {
      if (!gone.has(entity.id) && typeof entity.parentId === "string" && gone.has(entity.parentId)) { gone.add(entity.id); grew = true; }
    }
  }
  const entities = scene.entities.filter((entity) => !gone.has(entity.id));
  for (const { entity, numericId } of change.added ?? []) {
    const index = entities.findIndex((existing) => existing.id === entity.id);
    if (index >= 0) entities.splice(index, 1);
    entities.push({ ...entity });
    ids.set(numericId, entity.id);
  }
  return { ...scene, tick: Math.max(scene.tick, change.tick), entities, ids };
}

/**
 * Changes here mean reconciling the transient scope again; poses alone never do. The whole
 * definition counts, so an entity re-sent with a new definition (a tree's next generation) is
 * rebuilt. Structure events are rare (joins, impact cubes, sowing), so the cost is small.
 */
export function worldStructureKey(scene: WorldScene): string {
  return scene.entities.map((entity) => JSON.stringify(entity)).join("|");
}

/**
 * The authored part the viewer creates: the world's look (environment), no entities. `defaults`
 * fill only what the document leaves unsaid (sky, lighting, fog distances): presentation, never
 * simulation, so the server's own settings always win. An exported document writes unset
 * sections as `null`; those count as unsaid.
 */
export function worldShellDocument(scene: WorldScene, defaults: Record<string, unknown> = {}): WorldDocument & { schema: string; id: string } {
  const environment: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(scene.environment)) if (value !== null && value !== undefined) environment[key] = value;
  return { schema: "graphysx.agent-world/v2", id: "graphysx-world-view", label: scene.label, environment, entities: [] };
}

/**
 * Every entity as a transient definition: `ephemeral`, tagged, and without `physics` or joints
 * (the viewer only draws where the server says things are).
 */
export function worldTransientDefinitions(scene: WorldScene): WorldEntityDefinition[] {
  const present = new Set(scene.entities.map((entity) => entity.id));
  return scene.entities.map((entity) => {
    const { physics: _physics, ephemeral: _ephemeral, ...rest } = entity;
    void _physics; void _ephemeral;
    const tags = Array.isArray(entity.tags) ? entity.tags.filter((tag): tag is string => typeof tag === "string") : [];
    const definition: WorldEntityDefinition = { ...rest, ephemeral: true, tags: [...tags, WORLD_TAG] };
    // A child whose parent is gone would be refused by the runtime; it stands on its own.
    if (typeof definition.parentId === "string" && !present.has(definition.parentId)) delete definition.parentId;
    return definition;
  });
}

export function worldEntityKinds(scene: WorldScene): Record<string, number> {
  return scene.entities.reduce<Record<string, number>>((counts, entity) => {
    const kind = String(entity.type ?? "entity");
    counts[kind] = (counts[kind] ?? 0) + 1;
    return counts;
  }, {});
}

// ---- agents -------------------------------------------------------------------------------

export type WorldAgent = { entityId: string; numericId: number | null; name: string };

export function worldAgents(scene: WorldScene): WorldAgent[] {
  const numeric = new Map<string, number>();
  for (const [key, id] of scene.ids) numeric.set(id, key);
  return scene.entities
    .filter((entity) => entity.type === "agent")
    .map((entity) => ({ entityId: entity.id, numericId: numeric.get(entity.id) ?? null, name: typeof entity.label === "string" && entity.label ? entity.label : entity.id }));
}

/**
 * `&agent=<name>` picks that agent (case-insensitive; the newest session of that name, since a
 * long-lived world keeps earlier ones); otherwise the first one to join.
 */
export function pickWorldAgent(agents: readonly WorldAgent[], name: string | null | undefined): WorldAgent | null {
  const wanted = (name ?? "").trim().toLowerCase();
  if (wanted) {
    const matches = agents.filter((agent) => agent.name.toLowerCase() === wanted);
    if (matches.length) return matches[matches.length - 1];
  }
  return agents[0] ?? null;
}

// ---- motion between frames ----------------------------------------------------------------

export type WorldPose = { p: ClawVec3; q: ClawQuat };
type FrameSnapshot = { at: number; tick: number; t: number; poses: Map<number, WorldPose>; swarms: Map<number, number[]> };

/** One flock's members (flock-local, flat x, y, z), with velocities when two frames bracket them. */
export type WorldSwarm = { positions: number[]; velocities: number[] | null };

/**
 * A short arrival-time buffer, drawn about `delayMs` behind the newest frame so two frames
 * usually bracket the instant shown (10 Hz frames, 150 ms by default). A backwards or very large
 * tick jump clears it; a replay seek also sends a fresh hello, which clears it too.
 */
export class WorldPoseBuffer {
  private snapshots: FrameSnapshot[] = [];
  constructor(private readonly delayMs = 150, private readonly maxSnapshots = 8) {}

  push(frame: WorldFrame, at: number, jumpTicks = 600): boolean {
    const last = this.snapshots[this.snapshots.length - 1];
    let reset = false;
    if (last && (frame.tick < last.tick || frame.tick - last.tick > jumpTicks)) { this.snapshots = []; reset = true; }
    const poses = new Map<number, WorldPose>();
    for (const [id, x, y, z, qx, qy, qz, qw] of frame.poses) poses.set(id, { p: [x, y, z], q: [qx, qy, qz, qw] });
    const swarms = new Map<number, number[]>();
    for (const [id, ...members] of frame.swarms ?? []) swarms.set(id, members);
    this.snapshots.push({ at, tick: frame.tick, t: frame.t, poses, swarms });
    if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
    return reset;
  }

  clear(): void { this.snapshots = []; }

  get size(): number { return this.snapshots.length; }

  get latestTick(): number | null { return this.snapshots[this.snapshots.length - 1]?.tick ?? null; }

  /** Numeric ids in the newest frame. */
  ids(): number[] { return [...(this.snapshots[this.snapshots.length - 1]?.poses.keys() ?? [])]; }

  /** The pose at `now - delay`, or the newest known pose when the buffer cannot bracket it. */
  sample(id: number, now: number): WorldPose | null {
    const list = this.snapshots;
    if (!list.length) return null;
    const at = now - this.delayMs;
    let i = list.length - 1;
    while (i > 0 && list[i - 1].at > at) i -= 1;
    const b = list[i];
    const a = i > 0 ? list[i - 1] : null;
    const pb = b.poses.get(id);
    if (!pb) return null;
    if (!a || at >= b.at) return pb;
    const pa = a.poses.get(id);
    if (!pa) return pb;
    const span = b.at - a.at;
    const t = span > 0 ? Math.min(1, Math.max(0, (at - a.at) / span)) : 1;
    return {
      p: [pa.p[0] + (pb.p[0] - pa.p[0]) * t, pa.p[1] + (pb.p[1] - pa.p[1]) * t, pa.p[2] + (pb.p[2] - pa.p[2]) * t],
      q: slerpQuat(pa.q, pb.q, t),
    };
  }

  /** Flock numeric ids in the newest frame. */
  swarmIds(): number[] { return [...(this.snapshots[this.snapshots.length - 1]?.swarms.keys() ?? [])]; }

  /**
   * A flock's members at `now - delay`, interpolated like poses, with each member's velocity
   * over the bracketing frames (it orients the bodies). A member count change between frames
   * shows the newest frame as is.
   */
  sampleSwarm(id: number, now: number): WorldSwarm | null {
    const list = this.snapshots;
    if (!list.length) return null;
    const at = now - this.delayMs;
    let i = list.length - 1;
    while (i > 0 && list[i - 1].at > at) i -= 1;
    const b = list[i];
    const a = i > 0 ? list[i - 1] : null;
    const mb = b.swarms.get(id);
    if (!mb) return null;
    const ma = a?.swarms.get(id);
    if (!a || !ma || ma.length !== mb.length) return { positions: [...mb], velocities: null };
    const dt = b.t - a.t;
    const velocities = dt > 0 ? mb.map((value, index) => (value - ma[index]) / dt) : null;
    if (at >= b.at) return { positions: [...mb], velocities };
    const span = b.at - a.at;
    const t = span > 0 ? Math.min(1, Math.max(0, (at - a.at) / span)) : 1;
    return { positions: mb.map((value, index) => ma[index] + (value - ma[index]) * t), velocities };
  }

  /** Velocity of one id over its last two frames, in units per simulated second. */
  velocity(id: number): ClawVec3 | null {
    const list = this.snapshots;
    if (list.length < 2) return null;
    const a = list[list.length - 2];
    const b = list[list.length - 1];
    const pa = a.poses.get(id);
    const pb = b.poses.get(id);
    const dt = b.t - a.t;
    if (!pa || !pb || !(dt > 0)) return null;
    return [(pb.p[0] - pa.p[0]) / dt, (pb.p[1] - pa.p[1]) / dt, (pb.p[2] - pa.p[2]) / dt];
  }
}

/** Host poses (`AgentWorldRuntime.applyHostPoses`) for every id the buffer knows. */
export function worldHostPoses(buffer: WorldPoseBuffer, ids: ReadonlyMap<number, string>, now: number): { id: string; position: ClawVec3; quaternion: ClawQuat }[] {
  const out: { id: string; position: ClawVec3; quaternion: ClawQuat }[] = [];
  for (const numeric of buffer.ids()) {
    const id = ids.get(numeric);
    if (!id) continue;
    const pose = buffer.sample(numeric, now);
    if (pose) out.push({ id, position: pose.p, quaternion: pose.q });
  }
  return out;
}

/** Flock members for every flock the buffer knows: entity id, positions and velocities. */
export function worldHostSwarms(buffer: WorldPoseBuffer, ids: ReadonlyMap<number, string>, now: number): ({ id: string } & WorldSwarm)[] {
  const out: ({ id: string } & WorldSwarm)[] = [];
  for (const numeric of buffer.swarmIds()) {
    const id = ids.get(numeric);
    const swarm = id ? buffer.sampleSwarm(numeric, now) : null;
    if (id && swarm) out.push({ id, ...swarm });
  }
  return out;
}

// ---- the agent card and the panel ---------------------------------------------------------

/** Clawblox humanoid state names, so `describeAgent` says it in French. */
export function worldAgentState(velocity: ClawVec3 | null): string {
  if (!velocity) return "Idle";
  const [vx, vy, vz] = velocity;
  if (vy > 2) return "Jumping";
  if (vy < -2) return "Freefall";
  return Math.hypot(vx, vz) > 1 ? "Running" : "Idle";
}

/** The followed agent as a Clawblox-shaped player record for the shared agent card. */
export function worldAgentPlayer(agent: WorldAgent | null, lastAction: WorldAction | null, velocity: ClawVec3 | null): ClawPlayer | undefined {
  if (!agent) return undefined;
  return {
    id: agent.entityId,
    name: agent.name,
    humanoid_state: worldAgentState(velocity),
    attributes: lastAction ? { LastActionResult: lastAction.result } : {},
  };
}

const coordinate = (value: unknown): string | null => {
  if (!Array.isArray(value) || value.length < 3 || !value.slice(0, 3).every(finite)) return null;
  return `(${value.slice(0, 3).map((n) => Math.round(Number(n) * 10) / 10).join(", ")})`;
};

/**
 * "Pickup (14.2, 0.4, -2.1) → PickupSuccess": one action and its LastActionResult. Moves and
 * jumps leave LastActionResult as it was (as in Clawblox), so a result is shown only when this
 * action wrote it: it names the action (`PickupFailed:…`) or refuses it (`InvalidAction`).
 */
export function describeWorldAction(action: WorldAction): string {
  const data = action.input.data ?? {};
  const where = coordinate(data.position) ?? coordinate(data.direction);
  const speed = finite(data.speed) ? ` à ${Math.round(data.speed * 10) / 10}` : "";
  const what = `${action.input.type}${where ? ` ${where}` : ""}${speed}`;
  const own = action.result && (action.result.toLowerCase().startsWith(action.input.type.toLowerCase()) || action.result === "InvalidAction");
  return own ? `${what} → ${action.result}` : what;
}

/** Actions as panel lines (role `tool`), sorted by tick, for `islandMessagesAt`. */
export function worldActionMessages(actions: readonly WorldAction[], showAgent = false, maxChars = 200): IslandMessage[] {
  return actions
    .map((action, index) => {
      const text = `${showAgent ? `${action.agent} · ` : ""}${describeWorldAction(action)}`;
      return { id: `action:${action.tick}:${index}`, tick: action.tick, role: "tool" as const, text: text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text };
    })
    .sort((a, b) => a.tick - b.tick);
}

/** The last action of one agent at or before `tick`. */
export function lastWorldAction(actions: readonly WorldAction[], agent: string | null, tick = Number.POSITIVE_INFINITY): WorldAction | null {
  for (let i = actions.length - 1; i >= 0; i -= 1) {
    const action = actions[i];
    if (action.tick > tick) continue;
    if (!agent || action.agent === agent) return action;
  }
  return null;
}

// ---- detecting the source -----------------------------------------------------------------

/** `GET /healthz` of a world service (or its replay server): `{ok: true, tick: number}`. */
export function isWorldServiceHealth(body: unknown): boolean {
  return isRecord(body) && body.ok === true && finite(body.tick);
}

export function isEventStream(contentType: string | null | undefined): boolean {
  return typeof contentType === "string" && /^text\/event-stream\b/i.test(contentType.trim());
}

/**
 * Footprint of the visible land for the opening overview: centre and half-extent. Land is a
 * visible static body, or decor tagged `land` (a world that hides its physics slabs and draws
 * grass slabs over them, like the service's islands).
 */
export function worldBounds(scene: WorldScene): { center: ClawVec3; radius: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, top = 0;
  const vec = (value: unknown, fallback: number): ClawVec3 =>
    Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(finite) ? [value[0], value[1], value[2]] as ClawVec3 : [fallback, fallback, fallback];
  for (const entity of scene.entities) {
    const physics = isRecord(entity.physics) ? entity.physics : null;
    const land = Array.isArray(entity.tags) && entity.tags.includes("land");
    // Invisible blockers (Mesa's boundary walls) are not land.
    if (entity.visible === false || !(land || physics?.mode === "static")) continue;
    const transform = isRecord(entity.transform) ? entity.transform : {};
    const geometry = isRecord(entity.geometry) ? entity.geometry : {};
    const [x, y, z] = vec(transform.position, 0);
    const scale = vec(transform.scale, 1);
    const w = (finite(geometry.width) ? geometry.width : 1) * scale[0];
    const h = (finite(geometry.height) ? geometry.height : 1) * scale[1];
    const d = (finite(geometry.depth) ? geometry.depth : 1) * scale[2];
    minX = Math.min(minX, x - w / 2); maxX = Math.max(maxX, x + w / 2);
    minZ = Math.min(minZ, z - d / 2); maxZ = Math.max(maxZ, z + d / 2);
    top = Math.max(top, y + h / 2);
  }
  if (!Number.isFinite(minX)) return { center: [0, 0, 0], radius: 40 };
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  return { center: [round((minX + maxX) / 2), round(top), round((minZ + maxZ) / 2)], radius: round(Math.max(maxX - minX, maxZ - minZ) / 2) };
}

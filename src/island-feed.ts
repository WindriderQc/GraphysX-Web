/**
 * The Clawblox island as GraphysX scene vocabulary — the pure half of `?app=island`.
 *
 * Clawblox (a Rust/Rapier world server) stays the physics and agent authority. Its spectator
 * WebSocket (`/spectate/ws`, served by both `clawblox run` and `clawblox replay`) sends one full
 * observation and then either `spectator_delta` frames (live) or more full observations
 * (replay). This module materialises that stream, maps each Clawblox part to an ordinary
 * GraphysX entity definition, and keeps a short snapshot buffer so moving parts are drawn
 * between server ticks. No DOM and no three.js here, so Node tests run it as is.
 *
 * Nothing here simulates: GraphysX physics never touches these entities (they carry no
 * `physics` block), and the world semantics stay Clawblox's.
 */

export type ClawVec3 = [number, number, number];
export type ClawMatrix3 = [ClawVec3, ClawVec3, ClawVec3];
export type ClawQuat = [number, number, number, number];

export type ClawRender = {
  kind?: string;
  role?: string;
  primitive?: string;
  material?: string;
  color?: number[];
  static?: boolean;
  visible?: boolean;
  transparency?: number;
};

export type ClawEntity = {
  id: number;
  type?: string;
  name?: string | null;
  position: ClawVec3;
  rotation?: ClawMatrix3 | null;
  size?: ClawVec3 | null;
  shape?: string | null;
  model_url?: string | null;
  attributes?: Record<string, unknown> | null;
  render?: ClawRender;
};

export type ClawPlayer = {
  id: string;
  name?: string;
  position?: ClawVec3;
  root_part_id?: number;
  health?: number;
  humanoid_state?: string;
  attributes?: Record<string, unknown> | null;
};

export type ClawObservation = {
  instance_id?: string;
  tick: number;
  server_time_ms?: number;
  game_status?: string;
  players: ClawPlayer[];
  entities: ClawEntity[];
  recent_events?: unknown[];
};

type ClawEntityChange = { id: number; add?: ClawEntity; rm?: boolean; p?: ClawVec3; r?: ClawMatrix3 };

export type ClawChat = { id: string; agentName: string; content: string };

export type ClawMessageResult =
  | { kind: "full" | "delta"; state: ClawObservation }
  | { kind: "chat"; chat: ClawChat }
  | { kind: "error"; message: string }
  | { kind: "ignored" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isVec3 = (value: unknown): value is ClawVec3 =>
  Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every((n) => typeof n === "number" && Number.isFinite(n));

/**
 * Apply one WebSocket message to the materialised view. A delta before any full state is
 * refused (the server always sends a full observation first; a lost one means reconnect).
 */
export function applyClawMessage(current: ClawObservation | null, raw: unknown): ClawMessageResult {
  if (!isRecord(raw)) return { kind: "ignored" };
  const type = typeof raw.type === "string" ? raw.type : null;
  if (type === "chat_message") {
    return { kind: "chat", chat: { id: String(raw.id ?? ""), agentName: String(raw.agent_name ?? "?"), content: String(raw.content ?? "") } };
  }
  if (type === "replay_error") return { kind: "error", message: String(raw.message ?? "replay error") };
  if (type === "spectator_delta") {
    if (!current) return { kind: "error", message: "Delta received before the first full observation" };
    return { kind: "delta", state: applyDelta(current, raw) };
  }
  if (type !== null) return { kind: "ignored" };
  if (!Array.isArray(raw.entities) || typeof raw.tick !== "number") return { kind: "ignored" };
  return {
    kind: "full",
    state: {
      instance_id: typeof raw.instance_id === "string" ? raw.instance_id : undefined,
      tick: raw.tick,
      server_time_ms: typeof raw.server_time_ms === "number" ? raw.server_time_ms : undefined,
      game_status: typeof raw.game_status === "string" ? raw.game_status : undefined,
      players: Array.isArray(raw.players) ? (raw.players as ClawPlayer[]) : [],
      entities: (raw.entities as unknown[]).filter((e): e is ClawEntity => isRecord(e) && typeof e.id === "number" && isVec3(e.position)),
      recent_events: Array.isArray(raw.recent_events) ? raw.recent_events : [],
    },
  };
}

/** `docs/replication-rendering-performance.md` in Clawblox: add / rm / transform-only. */
function applyDelta(current: ClawObservation, delta: Record<string, unknown>): ClawObservation {
  const byId = new Map<number, ClawEntity>();
  for (const entity of current.entities) byId.set(entity.id, entity);
  for (const change of Array.isArray(delta.entities) ? (delta.entities as ClawEntityChange[]) : []) {
    if (!isRecord(change) || typeof change.id !== "number") continue;
    if (change.rm) { byId.delete(change.id); continue; }
    if (isRecord(change.add)) { byId.delete(change.id); byId.set(change.id, change.add as ClawEntity); continue; }
    const previous = byId.get(change.id);
    if (!previous) continue;
    byId.set(change.id, {
      ...previous,
      ...(isVec3(change.p) ? { position: change.p } : {}),
      ...(Array.isArray(change.r) ? { rotation: change.r } : {}),
    });
  }
  return {
    ...current,
    tick: typeof delta.tick === "number" ? delta.tick : current.tick,
    server_time_ms: typeof delta.server_time_ms === "number" ? delta.server_time_ms : current.server_time_ms,
    game_status: typeof delta.game_status === "string" ? delta.game_status : current.game_status,
    players: Array.isArray(delta.players) ? (delta.players as ClawPlayer[]) : current.players,
    entities: [...byId.values()],
    recent_events: Array.isArray(delta.recent_events) ? delta.recent_events : current.recent_events,
  };
}

// ---- rotation ---------------------------------------------------------------------------

/** Row-major 3×3 (Clawblox / `applyEntityTransform`) to an x,y,z,w quaternion. */
export function matrixToQuat(m: ClawMatrix3 | null | undefined): ClawQuat {
  if (!Array.isArray(m) || m.length < 3) return [0, 0, 0, 1];
  const [[m11, m12, m13], [m21, m22, m23], [m31, m32, m33]] = m;
  const trace = m11 + m22 + m33;
  let x: number, y: number, z: number, w: number;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s; x = (m32 - m23) * s; y = (m13 - m31) * s; z = (m21 - m12) * s;
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    w = (m32 - m23) / s; x = 0.25 * s; y = (m12 + m21) / s; z = (m13 + m31) / s;
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    w = (m13 - m31) / s; x = (m12 + m21) / s; y = 0.25 * s; z = (m23 + m32) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    w = (m21 - m12) / s; x = (m13 + m31) / s; y = (m23 + m32) / s; z = 0.25 * s;
  }
  const length = Math.hypot(x, y, z, w) || 1;
  return [x / length, y / length, z / length, w / length];
}

export function slerpQuat(a: ClawQuat, b: ClawQuat, t: number): ClawQuat {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (cos > 0.9995) {
    const out: ClawQuat = [a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t];
    const length = Math.hypot(...out) || 1;
    return [out[0] / length, out[1] / length, out[2] / length, out[3] / length];
  }
  const theta = Math.acos(cos);
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

// ---- the look: Clawblox part → GraphysX entity ------------------------------------------

export const ISLAND_SCOPE = "clawblox-island";
export const ISLAND_TAG = "island-part";

/** Placement rule for a mapped part: how its Clawblox transform lands on the GraphysX object. */
export type IslandPlacement = {
  /** GraphysX entity id that carries the Clawblox transform. */
  entityId: string;
  clawId: number;
  /** Added to the Clawblox centre, in the part's local frame (agents stand on their base). */
  localOffset: ClawVec3;
  /** Right-multiplied local fix (a torus lies in XY in three.js; a Clawblox ring lies flat). */
  localFix: ClawQuat | null;
  moving: boolean;
  kind: "water" | "ground" | "mesa" | "rock" | "pickup" | "ring" | "agent" | "part";
};

type EntityDefinition = Record<string, unknown> & { id: string; type: string };

/** How far the drawn ocean extends past the Clawblox slab, so no skybox ground shows. */
export const WATER_HORIZON = 6;

/** Vertical step between overlapping ground slabs (see composeIsland). */
export const GROUND_STEP = 0.04;

const TORUS_FLAT: ClawQuat = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];

const hex = (color: number[] | undefined, fallback: string): string => {
  if (!Array.isArray(color) || color.length < 3) return fallback;
  return `#${color.slice(0, 3).map((c) => Math.round(Math.min(1, Math.max(0, Number(c) || 0)) * 255).toString(16).padStart(2, "0")).join("")}`;
};

const round = (n: number): number => Math.round(n * 1000) / 1000;

/** True when the part is shown at all (Clawblox's invisible boundary walls are not). */
export function islandPartVisible(entity: ClawEntity): boolean {
  const render = entity.render ?? {};
  if (render.visible === false) return false;
  if (typeof render.transparency === "number" && render.transparency >= 0.999) return false;
  return true;
}

function roleOf(entity: ClawEntity, playerRoots: ReadonlySet<number>): IslandPlacement["kind"] {
  if (playerRoots.has(entity.id) || (typeof entity.model_url === "string" && /player/i.test(entity.model_url))) return "agent";
  switch (entity.render?.role) {
    case "Ocean": return "water";
    case "Ground": return "ground";
    case "Mesa": return "mesa";
    case "Rock": return "rock";
    case "PickupObject": return "pickup";
    case "Ring": return "ring";
    default: return entity.render?.primitive === "ring" || entity.shape === "Ring" ? "ring" : "part";
  }
}

export type IslandPlayerLook = { name: string };

/**
 * Map one visible part. Returns the entity definitions (a principal and, for land, a grass
 * cap child) plus the placement that applies the live transform to the principal.
 */
export function islandEntityPlan(
  entity: ClawEntity,
  playerRoots: ReadonlySet<number>,
  players: ReadonlyMap<number, IslandPlayerLook> = new Map(),
): { definitions: EntityDefinition[]; placement: IslandPlacement } | null {
  if (!islandPartVisible(entity)) return null;
  const kind = roleOf(entity, playerRoots);
  const size: ClawVec3 = isVec3(entity.size) ? entity.size : [1, 1, 1];
  const [w, h, d] = size;
  const id = `island-e${entity.id}`;
  const color = entity.render?.color;
  const opacity = typeof entity.render?.transparency === "number" && entity.render.transparency > 0
    ? round(1 - entity.render.transparency) : 1;
  const tags = [ISLAND_TAG, `island-claw:${entity.id}`, `island-kind:${kind}`];
  const moving = entity.render?.static === false || kind === "agent";
  const base = (definition: Record<string, unknown> & { type: string }): EntityDefinition =>
    ({ id, ephemeral: true, tags, ...definition }) as unknown as EntityDefinition;
  const placement = (overrides: Partial<IslandPlacement> = {}): IslandPlacement =>
    ({ entityId: id, clawId: entity.id, localOffset: [0, 0, 0], localFix: null, moving, kind, ...overrides });

  if (kind === "water") {
    // The Clawblox ocean is a thin glass slab; the water surface sits on its top face.
    return {
      definitions: [base({
        type: "water", label: "Océan",
        // Calm, lightly distorted ripples: seen from above, strong distortion turns the sky
        // reflection into blotches across a wide ocean.
        // The surface runs on to the horizon (the Clawblox slab is 600 units; its edge is
        // not a gameplay boundary, the invisible walls at the shore are).
        water: { size: round(Math.max(w, d) * WATER_HORIZON), color: "#0e4f63", sunColor: "#fff3d6", rippleScale: 4, distortionScale: 0.9, flowSpeed: 0.45, tintStrength: 0.75, tintDistance: 180, reflection: true, reflectionResolution: 512 },
      })],
      placement: placement({ localOffset: [0, round(h / 2), 0], moving: false }),
    };
  }
  if (kind === "ground") {
    // One grass-textured slab; only its top and the strip above the waterline are ever seen.
    return {
      definitions: [base({
        type: "box", label: "Sol de l'île",
        geometry: { width: w, height: h, depth: d },
        material: { color: "#a9dc8c", roughness: 0.92, metalness: 0, texture: { id: "grass-sample", repeat: [round(Math.max(1, w / 6)), round(Math.max(1, d / 6))] } },
        castShadow: false, receiveShadow: true,
      })],
      placement: placement({ moving: false }),
    };
  }
  if (kind === "mesa") {
    const cap = Math.min(0.35, h * 0.2);
    return {
      definitions: [
        base({
          type: "box", label: "Mesa",
          geometry: { width: w, height: h, depth: d },
          material: { color: hex(color, "#c8a064"), roughness: 0.9, metalness: 0 },
          castShadow: true, receiveShadow: true,
        }),
        {
          id: `${id}-grass`, parentId: id, ephemeral: true, type: "box", label: "Herbe",
          tags: [ISLAND_TAG, `island-claw:${entity.id}`, "island-kind:grass"],
          transform: { position: [0, round(h / 2 - cap / 2 + 0.02), 0] },
          geometry: { width: round(w + 0.04), height: round(cap), depth: round(d + 0.04) },
          material: { color: "#9fd38c", roughness: 0.9, metalness: 0, texture: { id: "grass-sample", repeat: [round(Math.max(1, w / 6)), round(Math.max(1, d / 6))] } },
          castShadow: false, receiveShadow: true,
        },
      ],
      placement: placement({ moving: false }),
    };
  }
  if (kind === "rock") {
    return {
      definitions: [base({
        type: "icosahedron", label: "Rocher",
        geometry: { radius: round(Math.max(w, h, d) / 2) },
        transform: { scale: [1, round(Math.max(0.4, h / Math.max(w, d))), 1] },
        material: { color: hex(color, "#34312c"), roughness: 0.96, metalness: 0.02 },
        castShadow: true, receiveShadow: true,
      })],
      placement: placement(),
    };
  }
  if (kind === "ring") {
    const outer = Math.min(w, d) / 2;
    const tube = Math.max(Math.min(h / 2, outer * 0.45), 0.05);
    return {
      definitions: [base({
        type: "torus", label: "Anneau",
        geometry: { radius: round(Math.max(outer - tube, 0.05)), tube: round(tube), radialSegments: 40 },
        material: { color: hex(color, "#e8c04a"), roughness: 0.35, metalness: 0.55, emissive: hex(color, "#e8c04a"), emissiveIntensity: 0.12 },
        castShadow: true, receiveShadow: true,
      })],
      placement: placement({ localFix: TORUS_FLAT }),
    };
  }
  if (kind === "agent") {
    const look = players.get(entity.id);
    return {
      definitions: [base({
        type: "agent", label: look?.name ?? "Agent",
        geometry: { height: round(h), radius: round(Math.max(0.35, Math.min(w, d) * 0.32)), radialSegments: 24 },
        material: { color: hex(color, "#e6734d"), emissive: "#5a1d0c", emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.2 },
        agent: { role: "Clawblox agent", status: "live", perceptionRadius: 8, capabilities: ["observe", "move", "carry"] },
        castShadow: true, receiveShadow: false,
      })],
      placement: placement({ localOffset: [0, round(-h / 2), 0], moving: true }),
    };
  }
  // Pickup cubes and anything else: the part's own primitive, in its own colour.
  const primitive = entity.render?.primitive ?? "block";
  const geometry = primitive === "sphere" || primitive === "ball"
    ? { type: "sphere", geometry: { radius: round(w / 2), radialSegments: 24 } }
    : primitive === "cylinder"
      ? { type: "cylinder", geometry: { radius: round(w / 2), height: h, radialSegments: 24 } }
      : { type: "box", geometry: { width: w, height: h, depth: d } };
  return {
    definitions: [base({
      ...geometry, label: kind === "pickup" ? "Objet" : "Pièce",
      material: { color: hex(color, "#c0c0c0"), roughness: kind === "pickup" ? 0.78 : 0.6, metalness: 0.04, opacity },
      castShadow: true, receiveShadow: true,
    })],
    placement: placement(),
  };
}

/** Changes here mean rebuilding the transient scope; transforms alone never do. */
export function islandStructureKey(state: ClawObservation): string {
  const roots = playerRootIds(state);
  const parts: string[] = [];
  for (const entity of state.entities) {
    if (!islandPartVisible(entity)) continue;
    const r = entity.render ?? {};
    parts.push(`${entity.id}|${roleOf(entity, roots)}|${r.primitive ?? ""}|${(entity.size ?? []).join(",")}|${(r.color ?? []).map((c) => Math.round(Number(c) * 255)).join(",")}|${r.transparency ?? 0}`);
  }
  for (const player of state.players) parts.push(`p|${player.root_part_id ?? ""}|${player.name ?? ""}`);
  return parts.join(";");
}

export function playerRootIds(state: ClawObservation): Set<number> {
  const ids = new Set<number>();
  for (const player of state.players) if (typeof player.root_part_id === "number") ids.add(player.root_part_id);
  return ids;
}

export function composeIsland(state: ClawObservation): { definitions: EntityDefinition[]; placements: IslandPlacement[] } {
  const roots = playerRootIds(state);
  const looks = new Map<number, IslandPlayerLook>();
  for (const player of state.players) if (typeof player.root_part_id === "number") looks.set(player.root_part_id, { name: player.name ?? "Agent" });
  const definitions: EntityDefinition[] = [];
  const placements: IslandPlacement[] = [];
  // Overlapping ground slabs share one top plane and their textures z-fight. Drawing each
  // smaller slab a few centimetres lower lets the largest one own the overlap; nothing that
  // stands on the ground is moved.
  const groundRank = new Map<number, number>();
  state.entities
    .filter((entity) => entity.render?.role === "Ground" && islandPartVisible(entity))
    .map((entity) => ({ id: entity.id, area: (entity.size?.[0] ?? 0) * (entity.size?.[2] ?? 0) }))
    .sort((a, b) => b.area - a.area || a.id - b.id)
    .forEach((entry, rank) => groundRank.set(entry.id, rank));
  for (const entity of state.entities) {
    const plan = islandEntityPlan(entity, roots, looks);
    if (!plan) continue;
    const rank = groundRank.get(entity.id) ?? 0;
    if (plan.placement.kind === "ground" && rank > 0) plan.placement.localOffset = [0, round(-GROUND_STEP * rank), 0];
    // Seed the document with the current centre so `api.query` answers "where is it" sensibly;
    // the live transform is written to the scene graph every frame from then on.
    const [principal] = plan.definitions;
    const offset = plan.placement.localOffset;
    const transform = (principal.transform ?? {}) as Record<string, unknown>;
    principal.transform = { ...transform, position: entity.position.map((n, i) => round(n + offset[i])) };
    definitions.push(...plan.definitions);
    placements.push(plan.placement);
  }
  return { definitions, placements };
}

/** Island footprint (visible land only) for framing: centre and half-extent. */
export function islandBounds(state: ClawObservation): { center: ClawVec3; radius: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, top = 0;
  for (const entity of state.entities) {
    const role = entity.render?.role;
    if (role !== "Ground" && role !== "Mesa") continue;
    if (!islandPartVisible(entity)) continue;
    const [x, y, z] = entity.position;
    const [w, h, d] = isVec3(entity.size) ? entity.size : [1, 1, 1];
    minX = Math.min(minX, x - w / 2); maxX = Math.max(maxX, x + w / 2);
    minZ = Math.min(minZ, z - d / 2); maxZ = Math.max(maxZ, z + d / 2);
    top = Math.max(top, y + h / 2);
  }
  if (!Number.isFinite(minX)) return { center: [0, 0, 0], radius: 40 };
  return { center: [round((minX + maxX) / 2), round(top), round((minZ + maxZ) / 2)], radius: round(Math.max(maxX - minX, maxZ - minZ) / 2) };
}

// ---- motion between ticks ---------------------------------------------------------------

type Pose = { p: ClawVec3; q: ClawQuat };
type Snapshot = { at: number; tick: number; poses: Map<number, Pose> };

/**
 * A short arrival-time buffer. Replays stream ~30 full states a second at 1–8× speed and live
 * worlds stream deltas, so arrival time (not server time) is the clock that keeps motion smooth
 * in both. A backwards or very large tick jump (a replay seek, a world reset) clears it.
 */
export class IslandPoseBuffer {
  private snapshots: Snapshot[] = [];
  constructor(private readonly delayMs = 110, private readonly maxSnapshots = 8) {}

  push(state: ClawObservation, at: number, jumpTicks = 600): boolean {
    const last = this.snapshots[this.snapshots.length - 1];
    let reset = false;
    if (last && (state.tick < last.tick || state.tick - last.tick > jumpTicks)) { this.snapshots = []; reset = true; }
    const poses = new Map<number, Pose>();
    for (const entity of state.entities) poses.set(entity.id, { p: entity.position, q: matrixToQuat(entity.rotation) });
    this.snapshots.push({ at, tick: state.tick, poses });
    if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
    return reset;
  }

  clear(): void { this.snapshots = []; }

  /** The pose at `now - delay`, or the newest known pose when the buffer cannot bracket it. */
  sample(id: number, now: number): Pose | null {
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
}

// ---- the agent's words (replay `--agent` logs) -------------------------------------------

export type IslandMessage = { id: string; tick: number; role: "agent" | "tool" | "user"; text: string };

type TimelineBlock = { type?: string; text?: string; name?: string; summary?: string };
type TimelineMessage = { id?: string; role?: string; tick?: number; blocks?: TimelineBlock[] };

/**
 * Flatten `GET /replay/agent` into readable lines: what the agent said, which tool it called
 * (by its short summary), and the operator's plain prompts. Harness context blocks
 * (`<environment_context>` and the like) are not conversation and are dropped.
 */
export function islandMessages(timeline: unknown, maxChars = 280): IslandMessage[] {
  if (!isRecord(timeline) || !Array.isArray(timeline.messages)) return [];
  const out: IslandMessage[] = [];
  for (const message of timeline.messages as TimelineMessage[]) {
    if (!isRecord(message)) continue;
    const tick = typeof message.tick === "number" ? message.tick : 0;
    const blocks = Array.isArray(message.blocks) ? message.blocks : [];
    blocks.forEach((block, index) => {
      if (!isRecord(block)) return;
      const id = `${message.id ?? out.length}:${index}`;
      const clip = (text: string): string => (text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text);
      if (block.type === "text" && typeof block.text === "string") {
        const text = block.text.trim();
        if (!text || text.startsWith("<")) return;
        out.push({ id, tick, role: message.role === "assistant" ? "agent" : "user", text: clip(text) });
      } else if (block.type === "tool_use" && message.role === "assistant") {
        const label = typeof block.summary === "string" && block.summary ? block.summary : String(block.name ?? "outil");
        out.push({ id, tick, role: "tool", text: clip(`${block.name ?? "outil"} · ${label}`) });
      }
    });
  }
  return out.sort((a, b) => a.tick - b.tick);
}

/** The visible window: messages up to `tick`, the newest `limit`. */
export function islandMessagesAt(messages: readonly IslandMessage[], tick: number, limit = 40): IslandMessage[] {
  let end = messages.length;
  while (end > 0 && messages[end - 1].tick > tick) end -= 1;
  return messages.slice(Math.max(0, end - limit), end);
}

export function formatClock(ticks: number, tickRate: number): string {
  const seconds = Math.max(0, Math.floor(ticks / Math.max(1, tickRate)));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** `source=` must be an http(s) origin (plus optional base path); anything else is refused. */
export function parseIslandSource(value: string | null): { http: string; ws: string } | null {
  if (!value) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const base = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  return { http: base, ws: base.replace(/^http/, "ws") };
}

/** What the agent is doing, in French, from its player record. */
export function describeAgent(player: ClawPlayer | undefined): { name: string; state: string; action: string | null } {
  if (!player) return { name: "Aucun agent", state: "absent", action: null };
  const states: Record<string, string> = {
    Running: "se déplace", Idle: "immobile", Jumping: "saute", Freefall: "en chute", Landed: "atterrit",
    Swimming: "nage", Climbing: "grimpe", Seated: "assis", Dead: "hors jeu", Physics: "porté par la physique",
  };
  const raw = player.humanoid_state ?? "";
  const action = player.attributes && typeof player.attributes.LastActionResult === "string" ? player.attributes.LastActionResult : null;
  return { name: player.name ?? "Agent", state: states[raw] ?? (raw || "inconnu"), action };
}

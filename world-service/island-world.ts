// Headless GraphysX island: the browser scene runtime stepped at a fixed tick, plus a
// Clawblox-compatible character and action layer (Mesa island rules).
//
// Nothing here renders and nothing here touches Node APIs: the HTTP server (server.mjs) owns
// I/O. Rules reach physics only through the public seams of PhysicsEngine and
// AgentWorldRuntime.

import { Euler, Quaternion, Vector3 } from "three";
import { AGENT_WORLD_HOST_GROUND_ID, AgentWorldRuntime, type AgentWorldDefinition, type AgentWorldHostPose } from "../src/agent-world-runtime";
import type {
  PhysicsBodyHandle,
  PhysicsCharacterHandle,
  PhysicsCharacterMove,
  PhysicsEngine,
  PhysicsStateHandle,
  PhysicsTransform,
} from "../src/physics/physics-engine";
import { RapierPhysicsEngine } from "../src/physics/rapier-physics-engine";
import {
  PLAYER_SPAWN,
  ROCK_ID,
  blockEntity,
  blockMeta,
  buildMesaIsland,
  type MesaEntityMeta,
  type Vec3,
} from "./mesa-island";

export const TICK_HZ = 60;
const DT = 1 / TICK_HZ;
export const SNAPSHOT_FORMAT = "graphysx-world-snapshot/v1";
/** Bump when a rule change would make an older snapshot replay differently. */
const RULES_VERSION = "mesa-rules/1";

// Clawblox constants (src/game/constants.rs, worlds/mesa-island/main.lua).
const WALK_SPEED = 16;
const JUMP_POWER = 50;
const CHARACTER_GRAVITY = 30 * 20; // world gravity x CHARACTER_GRAVITY_MULTIPLIER
const TERMINAL_FALL_SPEED = 120;
const MOVE_TO_EPSILON_XZ = 0.5;
const MOVE_TO_TIMEOUT = 8;
const JUMP_BUFFER = 0.2;
const JUMP_COOLDOWN = 0.18;
// The Clawblox HumanoidRootPart is a 2 x 5 x 2 part; a capsule of that size rests at the same
// height (y = 2.55 on Mesa ground, measured on both worlds).
const CHARACTER = { radius: 1, halfHeight: 1.5, autostepHeight: 1, autostepMinWidth: 0.01, maxSlopeClimbRadians: Math.PI / 4, snapToGround: 0.2, pushMass: 12 };
const OUT_OF_BOUNDS_Y = -200;
const PICKUP_RANGE = 6;
const PICKUP_SEARCH = 1.5;
const PLACE_RANGE = 7;
const PLACE_DURATION = 0.3;
const HOLD_OFFSET: Vec3 = [0, 3.5, 0];
const THROW_SPAWN_OFFSET_Y = 2.5;
const THROW_FORWARD_OFFSET = 1.75;
const THROW_DEFAULT_SPEED = 16;
const THROW_UPWARD_SPEED = 6;
const THROW_CARRY_FACTOR = 0.35;
const THROW_GRACE = 0.18;
const MAX_THROW_SPEED = 10;
const ROCK_IMPACT_ARM_DELAY = 1;
const ROCK_IMPACT_COOLDOWN = 0.35;
const ROCK_MIN_IMPACT_SPEED = 6;
const ROCK_MIN_IMPACT_ENERGY = 3000;
const ROCK_ENERGY_PER_CUBE = 3000;
const ROCK_MAX_IMPACT_CUBES = 8;
const PICKUP_IMPACT_GRACE = 0.25;
const PLACE_IMPACT_GRACE = 0.15;
const VIEW_EYE_HEIGHT = 2;
const VIEW_FOV = 105;
/** Chat timestamps count simulation time from a fixed epoch: never the host clock. */
const SIM_EPOCH_MS = Date.UTC(2000, 0, 1);

export type ActionInput = { type: string; data?: Record<string, unknown> | null };
export class InputError extends Error {}

interface Character {
  id: string;
  name: string;
  session: string;
  numericId: number;
  entityId: string;
  handle: PhysicsCharacterHandle;
  target: Vec3 | null;
  moveElapsed: number;
  verticalVelocity: number;
  jumpRequested: boolean;
  jumpBuffer: number;
  jumpCooldown: number;
  grounded: boolean;
  forward: Vec3;
  velocity: Vec3;
  lastActionResult: string;
  held: string | null;
}

type SavedCharacter = Omit<Character, "handle"> & { position: Vec3; stateId: number };

interface Placing { id: string; from: Vec3; fromRotation: [number, number, number, number]; to: Vec3; toRotation: [number, number, number, number]; elapsed: number }
interface RockState { ignoreUntil: number; lastImpactAt: number; touching: string[]; speedBefore: number }
interface ChatMessage { id: string; agent_id: string; agent_name: string; message_type: "text"; content: string; created_at: string; delivery_mode: "global" }

export interface ActionRecord { tick: number; agent: string; input: ActionInput; result: string }
export interface EntityChange { added?: { entity: AgentWorldDefinition["entities"][number]; numericId: number }[]; removed?: number[] }

/** Clawblox GET /snapshot body. Everything needed to continue bit for bit; no history. */
export interface WorldSnapshot {
  format: typeof SNAPSHOT_FORMAT;
  /** Simulation seconds (Clawblox records `format` and `time` in its run manifest). */
  time: number;
  tick: number;
  world: { id: string; contentHash: string; rules: string };
  document: AgentWorldDefinition;
  meta: [string, MesaEntityMeta][];
  numericIds: [string, number][];
  nextNumericId: number;
  impactCounter: number;
  bodyStateIds: [string, number][];
  characters: SavedCharacter[];
  placing: Placing[];
  ghosts: [string, number][];
  rocks: [string, RockState][];
  chat: ChatMessage[];
  physics: { format: string; accumulator: number; bytes: string };
}

const scratchTransform = (): PhysicsTransform => ({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });

function finiteVector(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const [x, y, z] = value.slice(0, 3).map(Number);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : null;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const v3 = (source: { x: number; y: number; z: number }): Vec3 => [source.x, source.y, source.z];
const xyz = ([x, y, z]: Vec3) => ({ x, y, z });
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** FNV-1a over the island's authored document and rules: a restore refuses another world. */
function contentHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ code, 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Clawblox-style built-in validation: malformed core actions never reach the world. */
export function validateInput(input: unknown): ActionInput {
  if (!input || typeof input !== "object" || typeof (input as ActionInput).type !== "string") {
    throw new InputError("Body must be {\"type\": string, \"data\"?: object}");
  }
  const action = input as ActionInput;
  const data = action.data ?? {};
  if (["MoveTo", "Pickup", "Place"].includes(action.type) && !finiteVector(data.position)) {
    throw new InputError(`${action.type} requires data.position as a finite [x, y, z]`);
  }
  if (action.type === "Throw") {
    if (!finiteVector(data.direction)) throw new InputError("Throw requires data.direction as a finite [x, y, z]");
    if (data.speed !== undefined && !Number.isFinite(Number(data.speed))) throw new InputError("Throw data.speed must be finite");
  }
  return action;
}

const BASE = buildMesaIsland();
const BASE_HASH = contentHash(JSON.stringify(BASE.document) + RULES_VERSION);

export class IslandWorld {
  readonly engine: PhysicsEngine;
  readonly runtime: AgentWorldRuntime;
  tick = 0;
  readonly actions: ActionRecord[] = [];
  private readonly meta: Map<string, MesaEntityMeta>;
  private readonly numericIds = new Map<string, number>();
  private nextNumericId = 8;
  private impactCounter = 0;
  private readonly characters = new Map<string, Character>(); // by session, join order
  private placing: Placing[] = [];
  private readonly ghosts = new Map<string, number>();
  private readonly rocks = new Map<string, RockState>();
  private readonly pending: { session: string; input: ActionInput; resolve: () => void }[] = [];
  private chat: ChatMessage[] = [];
  private changes: EntityChange[] = [];
  private readonly transform = scratchTransform();
  private readonly velocity = { x: 0, y: 0, z: 0 };
  private readonly move: PhysicsCharacterMove = { movement: { x: 0, y: 0, z: 0 }, grounded: false };
  private readonly contacts: PhysicsStateHandle[] = [];

  /** A fresh island, or the exact continuation of a snapshot. */
  constructor(snapshot?: WorldSnapshot) {
    this.engine = new RapierPhysicsEngine({ gravity: { x: 0, y: -30, z: 0 }, allowSleep: true });
    if (!snapshot) {
      this.meta = new Map(BASE.meta);
      this.runtime = new AgentWorldRuntime(structuredClone(BASE.document), this.engine);
      for (const id of this.meta.keys()) this.numericIds.set(id, this.nextNumericId++);
      this.rocks.set(ROCK_ID, { ignoreUntil: ROCK_IMPACT_ARM_DELAY, lastImpactAt: Number.NEGATIVE_INFINITY, touching: [], speedBefore: 0 });
      return;
    }
    if (snapshot.format !== SNAPSHOT_FORMAT) throw new Error(`Unsupported snapshot format: ${String(snapshot.format)}`);
    if (snapshot.world?.contentHash !== BASE_HASH) throw new Error("This snapshot belongs to another world or rules version");
    this.meta = new Map(snapshot.meta);
    this.runtime = new AgentWorldRuntime(snapshot.document, this.engine);
    this.runtime.hostRestoreClock(snapshot.time);
    this.tick = snapshot.tick;
    for (const [id, numeric] of snapshot.numericIds) this.numericIds.set(id, numeric);
    this.nextNumericId = snapshot.nextNumericId;
    this.impactCounter = snapshot.impactCounter;
    const bindings: [PhysicsStateHandle, number][] = [];
    for (const [id, stateId] of snapshot.bodyStateIds) {
      const body = this.runtime.hostBody(id);
      if (!body) throw new Error(`Snapshot body ${id} is missing from the restored scene`);
      bindings.push([body, stateId]);
    }
    for (const saved of snapshot.characters) {
      const handle = this.engine.createCharacter({ ...CHARACTER, position: xyz(saved.position) });
      const { position: _position, stateId, ...rest } = saved;
      void _position;
      this.characters.set(saved.session, { ...rest, handle });
      bindings.push([handle, stateId]);
    }
    this.engine.restoreState({ ...snapshot.physics, bytes: fromBase64(snapshot.physics.bytes) }, bindings);
    this.placing = snapshot.placing;
    for (const [id, left] of snapshot.ghosts) this.ghosts.set(id, left);
    for (const [id, state] of snapshot.rocks) this.rocks.set(id, { ...state, lastImpactAt: state.lastImpactAt ?? Number.NEGATIVE_INFINITY });
    this.chat = snapshot.chat;
  }

  get simSeconds(): number {
    return this.tick * DT;
  }

  // ---- sessions -------------------------------------------------------------------------

  join(name: string): { session: string; agent_id: string } {
    const numericId = this.nextNumericId++;
    const position = this.spawnPoint(this.characters.size);
    const entityId = `agent-${numericId}`;
    const label = name.slice(0, 64) || "Agent";
    // The avatar is an ordinary `agent` entity: viewers render it from the same document.
    const spawned = this.runtime.spawn({ id: entityId, label, type: "agent", transform: { position } });
    if (!spawned.ok) throw new Error(`Could not add the agent avatar: ${JSON.stringify(spawned)}`);
    const character: Character = {
      id: crypto.randomUUID(), name: label, session: crypto.randomUUID(), numericId, entityId,
      handle: this.engine.createCharacter({ ...CHARACTER, position: xyz(position) }),
      target: null, moveElapsed: 0, verticalVelocity: 0, jumpRequested: false, jumpBuffer: 0, jumpCooldown: 0,
      grounded: false, forward: [0, 0, -1], velocity: [0, 0, 0], lastActionResult: "Ready", held: null,
    };
    this.characters.set(character.session, character);
    this.numericIds.set(entityId, numericId);
    this.changes.push({ added: [{ entity: { id: entityId, label, type: "agent", transform: { position } }, numericId }] });
    return { session: character.session, agent_id: character.id };
  }

  /**
   * Mesa is a one-player world (max_players = 1) with one spawn point. Overlapping capsules
   * never separate and make each tick about 20x slower (measured), so later joiners spawn on
   * 4-stud rings around it.
   */
  private spawnPoint(index: number): Vec3 {
    if (index === 0) return [...PLAYER_SPAWN];
    const angle = index * 2.39996; // golden angle
    const radius = 4 * Math.ceil(index / 6);
    return [PLAYER_SPAWN[0] + Math.cos(angle) * radius, PLAYER_SPAWN[1], PLAYER_SPAWN[2] + Math.sin(angle) * radius];
  }

  hasSession(session: string | undefined): boolean {
    return !!session && this.characters.has(session);
  }

  // ---- input ----------------------------------------------------------------------------

  /** Queue an action; resolves after the tick that applied it (Clawblox POST /input). */
  enqueue(session: string, input: ActionInput): Promise<void> {
    return new Promise((resolve) => this.pending.push({ session, input, resolve }));
  }

  /** Apply one action now (the tick loop, and deterministic tests). */
  apply(session: string, input: ActionInput): string {
    const character = this.characters.get(session);
    if (!character) throw new InputError("Unknown session");
    const data = input.data ?? {};
    switch (input.type) {
      case "MoveTo": {
        const target = finiteVector(data.position);
        if (!target) character.lastActionResult = "MoveToFailed:InvalidPosition";
        else { character.target = target; character.moveElapsed = 0; }
        break;
      }
      case "Stop": character.target = null; break;
      case "Jump": character.jumpRequested = true; character.jumpBuffer = JUMP_BUFFER; break;
      case "Pickup": this.pickup(character, data); break;
      case "Place": this.place(character, data); break;
      case "Throw": this.throwHeld(character, data); break;
      default: character.lastActionResult = "InvalidAction";
    }
    this.actions.push({ tick: this.tick, agent: character.name, input, result: character.lastActionResult });
    return character.lastActionResult;
  }

  private position(character: Character): Vec3 {
    this.engine.readCharacterPosition(character.handle, this.velocity);
    return v3(this.velocity);
  }

  private body(id: string): PhysicsBodyHandle | null {
    return this.runtime.hostBody(id);
  }

  private pose(body: PhysicsBodyHandle): { position: Vec3; rotation: [number, number, number, number] } {
    this.engine.readTransform(body, this.transform);
    const { position: p, rotation: r } = this.transform;
    return { position: [p.x, p.y, p.z], rotation: [r.x, r.y, r.z, r.w] };
  }

  private isBusy(id: string): boolean {
    for (const character of this.characters.values()) if (character.held === id) return true;
    return this.placing.some((entry) => entry.id === id);
  }

  private graceRock(id: string, seconds: number): void {
    const rock = this.rocks.get(id);
    if (rock) rock.ignoreUntil = this.simSeconds + seconds;
  }

  private pickup(character: Character, data: Record<string, unknown>): void {
    if (character.held) { character.lastActionResult = "PickupFailed:AlreadyHolding"; return; }
    if (data.position === undefined) { character.lastActionResult = "PickupFailed:MissingPosition"; return; }
    const target = finiteVector(data.position);
    if (!target) { character.lastActionResult = "PickupFailed:InvalidPosition"; return; }
    if (distance(this.position(character), target) > PICKUP_RANGE) { character.lastActionResult = "PickupFailed:OutOfRange"; return; }
    let best: string | null = null;
    let bestDistance = PICKUP_SEARCH;
    for (const [id, info] of this.meta) {
      if (!info.attributes?.IsPickupObject || this.isBusy(id)) continue;
      const body = this.body(id);
      if (!body) continue;
      const gap = distance(target, this.pose(body).position);
      if (gap <= bestDistance) { best = id; bestDistance = gap; }
    }
    if (!best) { character.lastActionResult = "PickupFailed:NoBlock"; return; }
    const body = this.body(best)!;
    this.engine.setBodyMotion(body, "kinematic");
    this.engine.setBodyCollision(body, false);
    this.ghosts.delete(best);
    this.graceRock(best, PICKUP_IMPACT_GRACE);
    character.held = best;
    character.lastActionResult = "PickupSuccess";
  }

  private place(character: Character, data: Record<string, unknown>): void {
    const id = character.held;
    if (!id) { character.lastActionResult = "PlaceFailed:EmptyHands"; return; }
    if (data.position === undefined) { character.lastActionResult = "PlaceFailed:MissingPosition"; return; }
    const target = finiteVector(data.position);
    if (!target) { character.lastActionResult = "PlaceFailed:InvalidPosition"; return; }
    if (distance(this.position(character), target) > PLACE_RANGE) { character.lastActionResult = "PlaceFailed:OutOfRange"; return; }
    const body = this.body(id)!;
    const current = this.pose(body);
    let rotation = current.rotation;
    if (data.rotation !== undefined) {
      const r = data.rotation as Record<string, unknown> | null;
      const [pitch, yaw, roll] = [r?.pitch ?? 0, r?.yaw ?? 0, r?.roll ?? 0].map(Number);
      if (!r || typeof r !== "object" || ![pitch, yaw, roll].every(Number.isFinite)) {
        character.lastActionResult = "PlaceFailed:InvalidRotation";
        return;
      }
      const toRad = Math.PI / 180;
      // CFrame.fromOrientation(pitch, yaw, roll) applies Y, then X, then Z.
      const q = new Quaternion().setFromEuler(new Euler(pitch * toRad, yaw * toRad, roll * toRad, "YXZ"));
      rotation = [q.x, q.y, q.z, q.w];
    }
    // Clawblox (measured): a block placed flush on a surface is free, any overlap is not.
    // The 0.1 mm margin only absorbs float noise at an exact contact.
    const half = this.meta.get(id)!.size.map((value) => value / 2 - 1e-4) as Vec3;
    const [qx, qy, qz, qw] = rotation;
    if (this.engine.overlapsBox(xyz(target), xyz(half), { x: qx, y: qy, z: qz, w: qw }, [body])) {
      character.lastActionResult = "PlaceFailed:Occupied";
      return;
    }
    character.held = null;
    this.placing.push({ id, from: current.position, fromRotation: current.rotation, to: target, toRotation: rotation, elapsed: 0 });
    character.lastActionResult = "PlaceSuccess";
  }

  private throwHeld(character: Character, data: Record<string, unknown>): void {
    const id = character.held;
    if (!id) { character.lastActionResult = "ThrowFailed:EmptyHands"; return; }
    if (data.direction === undefined) { character.lastActionResult = "ThrowFailed:MissingDirection"; return; }
    const raw = finiteVector(data.direction);
    const length = raw ? Math.hypot(...raw) : 0;
    if (!raw || length <= 0.001) { character.lastActionResult = "ThrowFailed:InvalidDirection"; return; }
    const direction = raw.map((value) => value / length) as Vec3;
    const requested = data.speed === undefined ? THROW_DEFAULT_SPEED : Number(data.speed);
    const speed = Math.min(MAX_THROW_SPEED, Math.max(0, Number.isFinite(requested) ? requested : THROW_DEFAULT_SPEED));
    const body = this.body(id)!;
    const origin = this.position(character);
    character.held = null;
    this.engine.setBodyMotion(body, "dynamic");
    this.engine.setBodyCollision(body, false);
    this.ghosts.set(id, THROW_GRACE);
    this.graceRock(id, THROW_GRACE);
    const rotation = this.pose(body).rotation;
    this.engine.writeTransform(body, {
      position: { x: origin[0] + direction[0] * THROW_FORWARD_OFFSET, y: origin[1] + THROW_SPAWN_OFFSET_Y + direction[1] * THROW_FORWARD_OFFSET, z: origin[2] + direction[2] * THROW_FORWARD_OFFSET },
      rotation: { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] },
    });
    this.engine.writeLinearVelocity(body, {
      x: direction[0] * speed + character.velocity[0] * THROW_CARRY_FACTOR,
      y: direction[1] * speed + THROW_UPWARD_SPEED + character.velocity[1] * THROW_CARRY_FACTOR,
      z: direction[2] * speed + character.velocity[2] * THROW_CARRY_FACTOR,
    });
    this.engine.writeAngularVelocity(body, { x: 0, y: 8, z: 0 });
    character.lastActionResult = "ThrowSuccess";
  }

  // ---- simulation -----------------------------------------------------------------------

  /** One fixed 1/60 s tick: inputs, characters, carried/placing blocks, the runtime, rules. */
  step(): void {
    const applied = this.pending.splice(0);
    for (const entry of applied) if (this.characters.has(entry.session)) this.apply(entry.session, entry.input);
    for (const character of this.characters.values()) this.moveCharacter(character);
    for (const character of this.characters.values()) {
      if (!character.held) continue;
      const body = this.body(character.held);
      if (!body) continue;
      const p = this.position(character);
      const { rotation } = this.pose(body);
      this.engine.writeKinematicTarget(body, {
        position: { x: p[0] + HOLD_OFFSET[0], y: p[1] + HOLD_OFFSET[1], z: p[2] + HOLD_OFFSET[2] },
        rotation: { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] },
      });
    }
    this.advancePlacing();
    for (const [id, left] of [...this.ghosts]) {
      const body = this.body(id);
      if (!body) { this.ghosts.delete(id); continue; }
      if (left - DT > 0) { this.ghosts.set(id, left - DT); continue; }
      this.ghosts.delete(id);
      this.engine.setBodyCollision(body, true);
    }
    for (const [id, rock] of this.rocks) {
      const body = this.body(id);
      if (!body) continue;
      this.engine.readLinearVelocity(body, this.velocity);
      rock.speedBefore = Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z);
    }
    this.runtime.update(DT);
    this.tick += 1;
    this.syncAvatars();
    this.checkRockImpacts();
    this.cullOutOfBounds();
    for (const entry of applied) entry.resolve();
  }

  /** Run whole ticks synchronously: deterministic tests and fast-forward. */
  advance(seconds: number): void {
    const ticks = Math.round(seconds * TICK_HZ);
    for (let index = 0; index < ticks; index += 1) this.step();
  }

  private advancePlacing(): void {
    const still: Placing[] = [];
    for (const entry of this.placing) {
      const body = this.body(entry.id);
      if (!body) continue;
      entry.elapsed += DT;
      const alpha = Math.min(entry.elapsed / PLACE_DURATION, 1);
      const eased = 1 - (1 - alpha) * (1 - alpha);
      const from = new Vector3(...entry.from);
      const at = from.lerp(new Vector3(...entry.to), eased);
      const q = new Quaternion(...entry.fromRotation).slerp(new Quaternion(...entry.toRotation), eased);
      if (alpha < 1) {
        this.engine.writeKinematicTarget(body, { position: at, rotation: q });
        still.push(entry);
        continue;
      }
      // Land exactly on target, then hand the block back to the solver.
      const [qx, qy, qz, qw] = entry.toRotation;
      this.engine.writeTransform(body, { position: xyz(entry.to), rotation: { x: qx, y: qy, z: qz, w: qw } }, false);
      this.engine.setBodyMotion(body, "dynamic");
      this.engine.setBodyCollision(body, true);
      this.engine.writeLinearVelocity(body, { x: 0, y: 0, z: 0 });
      this.engine.writeAngularVelocity(body, { x: 0, y: 0, z: 0 });
      this.graceRock(entry.id, PLACE_IMPACT_GRACE);
    }
    this.placing = still;
  }

  private moveCharacter(character: Character): void {
    character.jumpCooldown = Math.max(0, character.jumpCooldown - DT);
    if (character.jumpRequested) {
      character.jumpBuffer -= DT;
      if (character.jumpBuffer <= 0) character.jumpRequested = false;
    }
    const position = this.position(character);
    let dx = 0;
    let dz = 0;
    if (character.target) {
      const tx = character.target[0] - position[0];
      const tz = character.target[2] - position[2];
      const gap = Math.hypot(tx, tz);
      character.moveElapsed += DT;
      if (gap <= MOVE_TO_EPSILON_XZ || character.moveElapsed >= MOVE_TO_TIMEOUT) {
        character.target = null;
      } else {
        const stride = Math.min(WALK_SPEED * DT, gap);
        dx = (tx / gap) * stride;
        dz = (tz / gap) * stride;
        character.forward = [tx / gap, 0, tz / gap];
      }
    }
    if (character.jumpRequested && character.grounded && character.jumpCooldown <= 0) {
      character.verticalVelocity = JUMP_POWER;
      character.jumpRequested = false;
      character.jumpCooldown = JUMP_COOLDOWN;
    }
    character.verticalVelocity = Math.max(character.verticalVelocity - CHARACTER_GRAVITY * DT, -TERMINAL_FALL_SPEED);
    this.engine.moveCharacter(character.handle, { x: dx, y: character.verticalVelocity * DT, z: dz }, this.move);
    character.grounded = this.move.grounded;
    if (character.grounded && character.verticalVelocity < 0) character.verticalVelocity = 0;
    const m = this.move.movement;
    character.velocity = [m.x / DT, m.y / DT, m.z / DT];
  }

  /** Keep each avatar entity on its character, so the document and viewers agree. */
  private syncAvatars(): void {
    const poses: AgentWorldHostPose[] = [];
    for (const character of this.characters.values()) {
      const yaw = Math.atan2(-character.forward[0], -character.forward[2]);
      poses.push({ id: character.entityId, position: this.position(character), quaternion: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)] });
    }
    this.runtime.applyHostPoses(poses);
  }

  /** Mesa's rock: a hard enough landing (speed >= 6, energy >= 3000) bursts into slate cubes. */
  private checkRockImpacts(): void {
    for (const [id, rock] of this.rocks) {
      const body = this.body(id);
      if (!body) continue;
      this.engine.readContacts(body, this.contacts);
      const touching = this.contacts.map((handle) => this.handleKey(handle)).filter((key): key is string => key !== null).sort();
      const fresh = touching.some((key) => !rock.touching.includes(key));
      rock.touching = touching;
      const now = this.simSeconds;
      if (!fresh || now < rock.ignoreUntil || now - rock.lastImpactAt < ROCK_IMPACT_COOLDOWN) continue;
      if (rock.speedBefore < ROCK_MIN_IMPACT_SPEED) continue;
      const energy = 0.5 * this.meta.get(id)!.mass * rock.speedBefore ** 2;
      if (energy < ROCK_MIN_IMPACT_ENERGY) continue;
      rock.lastImpactAt = now;
      const count = Math.min(ROCK_MAX_IMPACT_CUBES, Math.max(1, Math.floor(energy / ROCK_ENERGY_PER_CUBE)));
      this.spawnImpactCubes(this.pose(body).position, count);
    }
  }

  private handleKey(handle: PhysicsStateHandle): string | null {
    for (const id of this.meta.keys()) if (this.body(id) === handle) return id;
    for (const character of this.characters.values()) if (character.handle === handle) return `player:${character.id}`;
    return null;
  }

  private spawnImpactCubes(origin: Vec3, count: number): void {
    const added: NonNullable<EntityChange["added"]> = [];
    for (let i = 1; i <= count; i += 1) {
      this.impactCounter += 1;
      const angle = (i / count) * Math.PI * 2;
      const radius = 1.1 + 0.35 * ((i - 1) % 3);
      const name = `ImpactBlock_${this.impactCounter}`;
      const id = name.toLowerCase();
      const position: Vec3 = [origin[0] + Math.cos(angle) * radius, origin[1] + 0.9 + 0.15 * ((i - 1) % 2), origin[2] + Math.sin(angle) * radius];
      const entity = blockEntity(id, name, position,
        [Math.cos(angle) * (2.5 + i * 0.2), 4.5 + i * 0.25, Math.sin(angle) * (2.5 + i * 0.2)],
        [0, 6 + i, 0]);
      const spawned = this.runtime.spawn(entity);
      if (!spawned.ok) continue;
      const numericId = this.nextNumericId++;
      this.meta.set(id, blockMeta(name));
      this.numericIds.set(id, numericId);
      added.push({ entity, numericId });
    }
    if (added.length) this.changes.push({ added });
  }

  private cullOutOfBounds(): void {
    for (const character of this.characters.values()) {
      if (this.position(character)[1] < OUT_OF_BOUNDS_Y) {
        this.engine.writeCharacterPosition(character.handle, xyz(PLAYER_SPAWN));
        character.verticalVelocity = 0;
        character.target = null;
      }
    }
    const removed: number[] = [];
    for (const id of [...this.meta.keys()]) {
      const body = this.body(id);
      if (!body || this.meta.get(id)!.static || this.pose(body).position[1] >= OUT_OF_BOUNDS_Y) continue;
      for (const character of this.characters.values()) {
        if (character.held === id) { character.held = null; character.lastActionResult = "ResetAfterFall"; }
      }
      this.placing = this.placing.filter((entry) => entry.id !== id);
      this.ghosts.delete(id);
      this.rocks.delete(id);
      this.runtime.remove(id);
      this.meta.delete(id);
      removed.push(this.numericIds.get(id)!);
    }
    if (removed.length) this.changes.push({ removed });
  }

  // ---- chat -----------------------------------------------------------------------------

  postChat(session: string, content: string): { id: string; created_at: string } {
    const character = this.characters.get(session);
    if (!character) throw new InputError("Unknown session");
    const message: ChatMessage = {
      id: `local_${this.chat.length + 1}`, agent_id: character.id, agent_name: character.name, message_type: "text",
      content: content.slice(0, 2000), created_at: new Date(SIM_EPOCH_MS + this.simSeconds * 1000).toISOString(), delivery_mode: "global",
    };
    this.chat.push(message);
    return { id: message.id, created_at: message.created_at };
  }

  chatMessages(after: string | null, limit: number): { messages: ChatMessage[] } {
    const since = after ? Date.parse(after) : Number.NEGATIVE_INFINITY;
    const count = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 20, 100));
    return { messages: this.chat.filter((message) => Date.parse(message.created_at) > since).slice(-count) };
  }

  // ---- observation ----------------------------------------------------------------------

  private entityObservation(id: string, info: MesaEntityMeta): Record<string, unknown> {
    const body = this.body(id);
    let position: Vec3;
    let quaternion: Quaternion;
    if (body) {
      const pose = this.pose(body);
      position = pose.position;
      quaternion = new Quaternion(...pose.rotation);
    } else {
      const state = this.runtime.query({ ids: [id] })[0];
      position = state.position;
      quaternion = new Quaternion().setFromEuler(new Euler(...(state.rotationDegrees.map((d) => (d * Math.PI) / 180) as Vec3)));
    }
    const rotation = rotationRows(quaternion);
    const half = info.size.map((value) => value / 2) as Vec3;
    const corners: Vec3[] = [];
    for (const sz of [-1, 1]) for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
      const local = [sx * half[0], sy * half[1], sz * half[2]];
      corners.push([0, 1, 2].map((row) => round(position[row] + rotation[row][0] * local[0] + rotation[row][1] * local[1] + rotation[row][2] * local[2])) as Vec3);
    }
    const min = [0, 1, 2].map((axis) => Math.min(...corners.map((corner) => corner[axis]))) as Vec3;
    const max = [0, 1, 2].map((axis) => Math.max(...corners.map((corner) => corner[axis]))) as Vec3;
    const anchored = !body || !!info.static || this.placing.some((entry) => entry.id === id);
    return {
      id: this.numericIds.get(id), name: info.name, entity_type: "part",
      position: position.map((value) => round(value)), size: info.size,
      rotation: rotation.map((row) => row.map((value) => round(value, 4))),
      aabb: { min, max }, obb: { center: position.map((value) => round(value)), half_extents: half.map((value) => round(value)), corners },
      color: info.color, material: info.material, shape: info.shape,
      ...(info.transparency !== undefined ? { transparency: info.transparency } : {}),
      anchored, ...(info.attributes ? { attributes: info.attributes } : {}),
    };
  }

  private playerAttributes(character: Character): Record<string, unknown> {
    const p = this.position(character);
    return {
      LastActionResult: character.lastActionResult,
      ViewOriginX: round(p[0], 3), ViewOriginY: round(p[1] + VIEW_EYE_HEIGHT, 3), ViewOriginZ: round(p[2], 3),
      ViewForwardX: round(character.forward[0], 3), ViewForwardY: 0, ViewForwardZ: round(character.forward[2], 3),
      ViewFovDeg: VIEW_FOV,
    };
  }

  /** First-person camera of a session: what GET /observe/image renders. */
  camera(session: string): { position: Vec3; forward: Vec3; fovDeg: number } {
    const character = this.characters.get(session);
    if (!character) throw new InputError("Unknown session");
    const p = this.position(character);
    return { position: [p[0], p[1] + VIEW_EYE_HEIGHT, p[2]], forward: character.forward, fovDeg: VIEW_FOV };
  }

  observe(session: string): Record<string, unknown> {
    const character = this.characters.get(session);
    if (!character) throw new InputError("Unknown session");
    const position = this.position(character);
    const others = [...this.characters.values()].filter((other) => other !== character).map((other) => {
      const p = this.position(other);
      return { id: other.id, name: other.name, position: p.map((value) => round(value)), distance: round(distance(p, position)), health: 100, attributes: this.playerAttributes(other) };
    });
    const entities: Record<string, unknown>[] = [];
    for (const [id, info] of this.meta) entities.push(this.entityObservation(id, info));
    for (const other of this.characters.values()) {
      entities.push({
        id: other.numericId, name: "HumanoidRootPart", entity_type: "part", position: this.position(other).map((value) => round(value)), size: [2, 5, 2],
        color: [0.9, 0.45, 0.3], material: "Plastic", shape: "Cylinder", anchored: false,
        attributes: { ModelUrl: "/assets/player.glb", ModelYawOffsetDeg: 180 },
      });
    }
    return {
      tick: this.tick,
      game_status: "active",
      player: { id: character.id, position: position.map((value) => round(value)), health: 100, attributes: this.playerAttributes(character) },
      other_players: others,
      world: { entities },
      events: [],
    };
  }

  // ---- spectators -----------------------------------------------------------------------

  /** Compact pose frame: [numericId, x, y, z, qx, qy, qz, qw] for every moving thing. */
  poseFrame(): { tick: number; t: number; poses: number[][] } {
    const poses: number[][] = [];
    for (const [id, info] of this.meta) {
      if (info.decorative || info.static) continue;
      const body = this.body(id);
      if (!body) continue;
      const { position: p, rotation: q } = this.pose(body);
      poses.push([this.numericIds.get(id)!, round(p[0], 3), round(p[1], 3), round(p[2], 3), round(q[0], 4), round(q[1], 4), round(q[2], 4), round(q[3], 4)]);
    }
    for (const character of this.characters.values()) {
      const p = this.position(character);
      const yaw = Math.atan2(-character.forward[0], -character.forward[2]);
      poses.push([character.numericId, round(p[0], 3), round(p[1], 3), round(p[2], 3), 0, round(Math.sin(yaw / 2), 4), 0, round(Math.cos(yaw / 2), 4)]);
    }
    return { tick: this.tick, t: round(this.simSeconds, 3), poses };
  }

  /** What a viewer needs once: the current v2 document and numeric id -> entity id. */
  sceneHello(): Record<string, unknown> {
    return {
      format: "graphysx-world-stream/v1",
      tickHz: TICK_HZ,
      tick: this.tick,
      document: this.runtime.exportDefinition(),
      ids: Object.fromEntries([...this.numericIds].map(([id, numeric]) => [numeric, id])),
    };
  }

  /** Entities added or removed since the last call (impact cubes, culls, joins). */
  drainChanges(): EntityChange[] {
    const out = this.changes;
    this.changes = [];
    return out;
  }

  /** Operator-only state (Clawblox GET /snapshot). Take it between ticks. */
  snapshot(): WorldSnapshot {
    const physics = this.engine.saveState();
    const bodyStateIds: [string, number][] = [];
    for (const id of [AGENT_WORLD_HOST_GROUND_ID, ...this.runtime.query({}).map((entity) => entity.id)]) {
      const body = this.body(id);
      if (body) bodyStateIds.push([id, this.engine.stateId(body)]);
    }
    return {
      format: SNAPSHOT_FORMAT,
      time: this.simSeconds,
      tick: this.tick,
      world: { id: BASE.document.id, contentHash: BASE_HASH, rules: RULES_VERSION },
      document: this.runtime.exportDefinition(),
      meta: [...this.meta],
      numericIds: [...this.numericIds],
      nextNumericId: this.nextNumericId,
      impactCounter: this.impactCounter,
      bodyStateIds,
      characters: [...this.characters.values()].map((character) => {
        const { handle, ...rest } = character;
        return { ...structuredClone(rest), position: this.position(character), stateId: this.engine.stateId(handle) };
      }),
      placing: structuredClone(this.placing),
      ghosts: [...this.ghosts],
      rocks: [...this.rocks].map(([id, rock]) => [id, { ...rock, touching: [...rock.touching] }]),
      chat: structuredClone(this.chat),
      physics: { format: physics.format, accumulator: physics.accumulator, bytes: toBase64(physics.bytes) },
    };
  }
}

/** Row-major 3x3 rotation, matching Clawblox's `rotation` field. */
function rotationRows(q: Quaternion): number[][] {
  const { x, y, z, w } = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

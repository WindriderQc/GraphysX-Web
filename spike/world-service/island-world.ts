// Headless GraphysX island: the browser scene runtime stepped at a fixed tick, plus a
// Clawblox-compatible character and action layer (Mesa island semantics).
//
// Nothing here renders. AgentWorldRuntime keeps its Three.js scene graph as plain math
// objects; Rapier steps inside `runtime.update(1 / 60)` exactly as it does in a tab.

import { randomUUID } from "node:crypto";
import { Euler, Quaternion, Vector3 } from "three";
import type { Collider, KinematicCharacterController, RigidBody } from "@dimforge/rapier3d-compat";
import { AgentWorldRuntime } from "../../src/agent-world-runtime";
import { RapierPhysicsEngine } from "../../src/physics/rapier-physics-engine";
import { buildMesaIsland, type MesaEntityMeta, type Vec3 } from "./mesa-island";
import { RAPIER, collidersOf, rapierWorld, rigidBodyOf, setCarried, setGhost } from "./runtime-access";

export const TICK_HZ = 60;
const DT = 1 / TICK_HZ;

// Clawblox constants (src/game/constants.rs, worlds/mesa-island/main.lua).
const WALK_SPEED = 16;
const JUMP_POWER = 50;
const CHARACTER_GRAVITY = 30 * 20; // world gravity x CHARACTER_GRAVITY_MULTIPLIER
const TERMINAL_FALL_SPEED = 120; // spike value; Clawblox has its own constant to align
const MOVE_TO_EPSILON_XZ = 0.5;
const MOVE_TO_TIMEOUT = 8;
const JUMP_BUFFER = 0.2;
const JUMP_COOLDOWN = 0.18;
const AUTOSTEP_HEIGHT = 1;
const AUTOSTEP_MIN_WIDTH = 0.01;
const SNAP_TO_GROUND = 0.2;
const MAX_SLOPE = (45 * Math.PI) / 180;
const CHARACTER_PUSH_MASS = 12; // Clawblox CHARACTER_PUSH_MASS
// The Clawblox HumanoidRootPart is a 2 x 5 x 2 part; the spike uses a capsule of that size.
const CHARACTER_RADIUS = 1;
const CHARACTER_HALF_HEIGHT = 1.5;
const PLAYER_SPAWN: Vec3 = [0, 5, 0];
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
  body: RigidBody;
  collider: Collider;
  controller: KinematicCharacterController;
  target: Vector3 | null;
  moveElapsed: number;
  verticalVelocity: number;
  jumpRequested: boolean;
  jumpBuffer: number;
  jumpCooldown: number;
  grounded: boolean;
  forward: Vector3;
  velocity: Vector3;
  lastActionResult: string;
  held: string | null;
}

interface Placing { id: string; from: Vector3; fromRotation: Quaternion; to: Vector3; toRotation: Quaternion; elapsed: number }
interface ChatMessage { id: string; agent_id: string; agent_name: string; message_type: "text"; content: string; created_at: string; delivery_mode: "global" }

export interface ActionRecord { tick: number; agent: string; input: ActionInput; result: string }

const scratch = { quaternion: new Quaternion(), vector: new Vector3() };

function finiteVector(value: unknown): Vector3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const [x, y, z] = value.slice(0, 3).map(Number);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? new Vector3(x, y, z) : null;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function tuple(vector: { x: number; y: number; z: number }, digits = 2): Vec3 {
  return [round(vector.x, digits), round(vector.y, digits), round(vector.z, digits)];
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

export class IslandWorld {
  readonly engine: RapierPhysicsEngine;
  readonly runtime: AgentWorldRuntime;
  readonly meta: Map<string, MesaEntityMeta>;
  readonly document: ReturnType<typeof buildMesaIsland>["document"];
  tick = 0;
  private readonly numericIds = new Map<string, number>();
  private nextNumericId = 8;
  private readonly characters = new Map<string, Character>(); // by session
  private readonly placing: Placing[] = [];
  private readonly ghosts = new Map<string, number>(); // thrown block id -> seconds left
  private readonly pending: { session: string; input: ActionInput; resolve: () => void }[] = [];
  private readonly chat: ChatMessage[] = [];
  readonly actions: ActionRecord[] = [];

  constructor() {
    const island = buildMesaIsland();
    this.document = island.document;
    this.meta = island.meta;
    this.engine = new RapierPhysicsEngine({ gravity: { x: 0, y: -30, z: 0 }, allowSleep: true });
    this.runtime = new AgentWorldRuntime(island.document, this.engine);
    for (const id of this.meta.keys()) this.numericIds.set(id, this.nextNumericId++);
  }

  get simSeconds(): number {
    return this.tick * DT;
  }

  // ---- sessions -------------------------------------------------------------------------

  join(name: string): { session: string; agent_id: string } {
    const world = rapierWorld(this.engine);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...this.spawnPoint(this.characters.size)),
    );
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS), body);
    const controller = world.createCharacterController(0.05);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setMaxSlopeClimbAngle(MAX_SLOPE);
    controller.enableAutostep(AUTOSTEP_HEIGHT, AUTOSTEP_MIN_WIDTH, true);
    controller.enableSnapToGround(SNAP_TO_GROUND);
    controller.setApplyImpulsesToDynamicBodies(true);
    controller.setCharacterMass(CHARACTER_PUSH_MASS);
    const character: Character = {
      id: randomUUID(), name: name.slice(0, 64) || "Agent", session: randomUUID(), numericId: this.nextNumericId++,
      body, collider, controller, target: null, moveElapsed: 0, verticalVelocity: 0,
      jumpRequested: false, jumpBuffer: 0, jumpCooldown: 0, grounded: false,
      forward: new Vector3(0, 0, -1), velocity: new Vector3(), lastActionResult: "Ready", held: null,
    };
    this.characters.set(character.session, character);
    return { session: character.session, agent_id: character.id };
  }

  /**
   * Mesa is a one-player world (max_players = 1) with a single spawn point. Overlapping
   * capsules never separate under a character controller, so later joiners spawn on a
   * 4-stud ring around it.
   */
  private spawnPoint(index: number): Vec3 {
    if (index === 0) return PLAYER_SPAWN;
    const angle = index * 2.39996; // golden angle: no two joiners share a spot
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

  /** Apply one action immediately (used by the tick loop and deterministic tests). */
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

  private position(character: Character): Vector3 {
    const t = character.body.translation();
    return new Vector3(t.x, t.y, t.z);
  }

  private bodyOf(id: string): RigidBody | null {
    return rigidBodyOf(this.runtime, this.engine, id);
  }

  private isBusy(id: string): boolean {
    for (const character of this.characters.values()) if (character.held === id) return true;
    return this.placing.some((entry) => entry.id === id);
  }

  private pickup(character: Character, data: Record<string, unknown>): void {
    if (character.held) { character.lastActionResult = "PickupFailed:AlreadyHolding"; return; }
    if (data.position === undefined) { character.lastActionResult = "PickupFailed:MissingPosition"; return; }
    const target = finiteVector(data.position);
    if (!target) { character.lastActionResult = "PickupFailed:InvalidPosition"; return; }
    if (this.position(character).distanceTo(target) > PICKUP_RANGE) { character.lastActionResult = "PickupFailed:OutOfRange"; return; }
    let best: string | null = null;
    let bestDistance = PICKUP_SEARCH;
    for (const [id, info] of this.meta) {
      if (!info.attributes?.IsPickupObject || this.isBusy(id)) continue;
      const body = this.bodyOf(id);
      if (!body) continue;
      const t = body.translation();
      const distance = target.distanceTo(scratch.vector.set(t.x, t.y, t.z));
      if (distance <= bestDistance) { best = id; bestDistance = distance; }
    }
    if (!best) { character.lastActionResult = "PickupFailed:NoBlock"; return; }
    setCarried(this.bodyOf(best)!, true);
    character.held = best;
    character.lastActionResult = "PickupSuccess";
  }

  private place(character: Character, data: Record<string, unknown>): void {
    const id = character.held;
    if (!id) { character.lastActionResult = "PlaceFailed:EmptyHands"; return; }
    if (data.position === undefined) { character.lastActionResult = "PlaceFailed:MissingPosition"; return; }
    const target = finiteVector(data.position);
    if (!target) { character.lastActionResult = "PlaceFailed:InvalidPosition"; return; }
    if (this.position(character).distanceTo(target) > PLACE_RANGE) { character.lastActionResult = "PlaceFailed:OutOfRange"; return; }
    const body = this.bodyOf(id)!;
    const current = body.rotation();
    let rotation = new Quaternion(current.x, current.y, current.z, current.w);
    if (data.rotation !== undefined) {
      const r = data.rotation as Record<string, unknown> | null;
      const [pitch, yaw, roll] = [r?.pitch ?? 0, r?.yaw ?? 0, r?.roll ?? 0].map(Number);
      if (!r || typeof r !== "object" || ![pitch, yaw, roll].every(Number.isFinite)) {
        character.lastActionResult = "PlaceFailed:InvalidRotation";
        return;
      }
      const toRad = Math.PI / 180;
      // CFrame.fromOrientation(pitch, yaw, roll) applies Y, then X, then Z.
      rotation = new Quaternion().setFromEuler(new Euler(pitch * toRad, yaw * toRad, roll * toRad, "YXZ"));
    }
    if (this.occupied(id, target, rotation)) { character.lastActionResult = "PlaceFailed:Occupied"; return; }
    const t = body.translation();
    character.held = null;
    this.placing.push({ id, from: new Vector3(t.x, t.y, t.z), fromRotation: new Quaternion(current.x, current.y, current.z, current.w), to: target, toRotation: rotation, elapsed: 0 });
    character.lastActionResult = "PlaceSuccess";
  }

  private occupied(id: string, position: Vector3, rotation: Quaternion): boolean {
    const size = this.meta.get(id)!.size;
    // A hair smaller than the block so resting flush on a surface is not an overlap.
    const shape = new RAPIER.Cuboid(size[0] / 2 - 0.01, size[1] / 2 - 0.01, size[2] / 2 - 0.01);
    const own = new Set(collidersOf(this.bodyOf(id)!).map((collider) => collider.handle));
    let hit = false;
    rapierWorld(this.engine).intersectionsWithShape(position, rotation, shape, (collider) => {
      if (own.has(collider.handle)) return true;
      hit = true;
      return false;
    });
    return hit;
  }

  private throwHeld(character: Character, data: Record<string, unknown>): void {
    const id = character.held;
    if (!id) { character.lastActionResult = "ThrowFailed:EmptyHands"; return; }
    if (data.direction === undefined) { character.lastActionResult = "ThrowFailed:MissingDirection"; return; }
    const direction = finiteVector(data.direction);
    if (!direction || direction.length() <= 0.001) { character.lastActionResult = "ThrowFailed:InvalidDirection"; return; }
    direction.normalize();
    const requested = data.speed === undefined ? THROW_DEFAULT_SPEED : Number(data.speed);
    const speed = Math.min(MAX_THROW_SPEED, Math.max(0, Number.isFinite(requested) ? requested : THROW_DEFAULT_SPEED));
    const body = this.bodyOf(id)!;
    character.held = null;
    setCarried(body, false);
    setGhost(body, true);
    this.ghosts.set(id, THROW_GRACE);
    const origin = this.position(character).add(new Vector3(0, THROW_SPAWN_OFFSET_Y, 0)).addScaledVector(direction, THROW_FORWARD_OFFSET);
    body.setTranslation(origin, true);
    const velocity = direction.clone().multiplyScalar(speed).add(new Vector3(0, THROW_UPWARD_SPEED, 0)).addScaledVector(character.velocity, THROW_CARRY_FACTOR);
    body.setLinvel(velocity, true);
    body.setAngvel({ x: 0, y: 8, z: 0 }, true);
    character.lastActionResult = "ThrowSuccess";
  }

  // ---- simulation -----------------------------------------------------------------------

  /** One fixed 1/60 s tick: inputs, characters, carried/placing blocks, then the runtime. */
  step(): void {
    const applied = this.pending.splice(0);
    for (const entry of applied) {
      if (this.characters.has(entry.session)) this.apply(entry.session, entry.input);
    }
    for (const character of this.characters.values()) this.moveCharacter(character);
    for (const character of this.characters.values()) {
      if (!character.held) continue;
      const body = this.bodyOf(character.held);
      if (body) body.setNextKinematicTranslation(this.position(character).add(new Vector3(...HOLD_OFFSET)));
    }
    for (let index = this.placing.length - 1; index >= 0; index -= 1) {
      const entry = this.placing[index];
      entry.elapsed += DT;
      const alpha = Math.min(entry.elapsed / PLACE_DURATION, 1);
      const eased = 1 - (1 - alpha) * (1 - alpha);
      const body = this.bodyOf(entry.id);
      if (!body) { this.placing.splice(index, 1); continue; }
      body.setNextKinematicTranslation(entry.from.clone().lerp(entry.to, eased));
      body.setNextKinematicRotation(entry.fromRotation.clone().slerp(entry.toRotation, eased));
      if (alpha >= 1) {
        // Land exactly on target, then hand the block back to the solver.
        body.setTranslation(entry.to, false);
        body.setRotation(entry.toRotation, false);
        setCarried(body, false);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.placing.splice(index, 1);
      }
    }
    for (const [id, left] of this.ghosts) {
      const remaining = left - DT;
      if (remaining > 0) { this.ghosts.set(id, remaining); continue; }
      this.ghosts.delete(id);
      const body = this.bodyOf(id);
      if (body) setGhost(body, false);
    }
    this.runtime.update(DT);
    this.tick += 1;
    this.cullOutOfBounds();
    // Queued POST /input calls answer with the observation of the tick that applied them.
    for (const entry of applied) entry.resolve();
  }

  /** Run whole ticks synchronously: deterministic tests and fast-forward. */
  advance(seconds: number): void {
    const ticks = Math.round(seconds * TICK_HZ);
    for (let index = 0; index < ticks; index += 1) this.step();
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
      const tx = character.target.x - position.x;
      const tz = character.target.z - position.z;
      const distance = Math.hypot(tx, tz);
      character.moveElapsed += DT;
      if (distance <= MOVE_TO_EPSILON_XZ || character.moveElapsed >= MOVE_TO_TIMEOUT) {
        character.target = null;
      } else {
        const stride = Math.min(WALK_SPEED * DT, distance);
        dx = (tx / distance) * stride;
        dz = (tz / distance) * stride;
        character.forward.set(tx / distance, 0, tz / distance);
      }
    }
    if (character.jumpRequested && character.grounded && character.jumpCooldown <= 0) {
      character.verticalVelocity = JUMP_POWER;
      character.jumpRequested = false;
      character.jumpCooldown = JUMP_COOLDOWN;
    }
    character.verticalVelocity = Math.max(character.verticalVelocity - CHARACTER_GRAVITY * DT, -TERMINAL_FALL_SPEED);
    character.controller.computeColliderMovement(
      character.collider,
      { x: dx, y: character.verticalVelocity * DT, z: dz },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    );
    const movement = character.controller.computedMovement();
    character.grounded = character.controller.computedGrounded();
    if (character.grounded && character.verticalVelocity < 0) character.verticalVelocity = 0;
    character.velocity.set(movement.x / DT, movement.y / DT, movement.z / DT);
    character.body.setNextKinematicTranslation({ x: position.x + movement.x, y: position.y + movement.y, z: position.z + movement.z });
  }

  private cullOutOfBounds(): void {
    for (const character of this.characters.values()) {
      if (character.body.translation().y < OUT_OF_BOUNDS_Y) {
        character.body.setTranslation({ x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], z: PLAYER_SPAWN[2] }, true);
        character.verticalVelocity = 0;
        character.target = null;
      }
    }
    for (const id of [...this.meta.keys()]) {
      const body = this.bodyOf(id);
      if (body && body.translation().y < OUT_OF_BOUNDS_Y) {
        for (const character of this.characters.values()) {
          if (character.held === id) { character.held = null; character.lastActionResult = "ResetAfterFall"; }
        }
        this.runtime.remove(id);
        this.meta.delete(id);
      }
    }
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
    return { messages: this.chat.filter((message) => Date.parse(message.created_at) > since).slice(-Math.max(1, Math.min(limit, 100))) };
  }

  // ---- observation ----------------------------------------------------------------------

  private entityObservation(id: string): Record<string, unknown> | null {
    const info = this.meta.get(id);
    if (!info) return null;
    const body = this.bodyOf(id);
    const state = body ? null : this.runtime.query({ ids: [id] })[0];
    const p = body ? body.translation() : { x: state!.position[0], y: state!.position[1], z: state!.position[2] };
    const r = body ? body.rotation() : scratch.quaternion.setFromEuler(new Euler(...state!.rotationDegrees.map((d) => (d * Math.PI) / 180) as Vec3));
    scratch.quaternion.set(r.x, r.y, r.z, r.w);
    const rotation = rotationRows(scratch.quaternion);
    const half = info.size.map((value) => value / 2) as Vec3;
    const corners: Vec3[] = [];
    for (const sz of [-1, 1]) for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
      const local = [sx * half[0], sy * half[1], sz * half[2]];
      corners.push([0, 1, 2].map((row) => round(p[(["x", "y", "z"] as const)[row]] + rotation[row][0] * local[0] + rotation[row][1] * local[1] + rotation[row][2] * local[2])) as Vec3);
    }
    const min = [0, 1, 2].map((axis) => Math.min(...corners.map((corner) => corner[axis]))) as Vec3;
    const max = [0, 1, 2].map((axis) => Math.max(...corners.map((corner) => corner[axis]))) as Vec3;
    const anchored = !body || body.isFixed() || this.placing.some((entry) => entry.id === id);
    return {
      id: this.numericIds.get(id), name: info.name, entity_type: "part",
      position: tuple(p), size: info.size, rotation: rotation.map((row) => row.map((value) => round(value, 4))),
      aabb: { min, max }, obb: { center: tuple(p), half_extents: half.map((value) => round(value)), corners },
      color: info.color, material: info.material, shape: info.shape,
      ...(info.transparency !== undefined ? { transparency: info.transparency } : {}),
      anchored, ...(info.attributes ? { attributes: info.attributes } : {}),
    };
  }

  private characterEntity(character: Character): Record<string, unknown> {
    const p = this.position(character);
    return {
      id: character.numericId, name: "HumanoidRootPart", entity_type: "part", position: tuple(p), size: [2, 5, 2],
      color: [0.9, 0.45, 0.3], material: "Plastic", shape: "Cylinder", anchored: false,
      attributes: { ModelUrl: "/assets/player.glb", ModelYawOffsetDeg: 180 },
    };
  }

  private playerAttributes(character: Character): Record<string, unknown> {
    const p = this.position(character);
    return {
      LastActionResult: character.lastActionResult,
      ViewOriginX: round(p.x, 3), ViewOriginY: round(p.y + VIEW_EYE_HEIGHT, 3), ViewOriginZ: round(p.z, 3),
      ViewForwardX: round(character.forward.x, 3), ViewForwardY: 0, ViewForwardZ: round(character.forward.z, 3),
      ViewFovDeg: VIEW_FOV,
    };
  }

  observe(session: string): Record<string, unknown> {
    const character = this.characters.get(session);
    if (!character) throw new InputError("Unknown session");
    const position = this.position(character);
    const others = [...this.characters.values()].filter((other) => other !== character).map((other) => {
      const p = this.position(other);
      return { id: other.id, name: other.name, position: tuple(p), distance: round(p.distanceTo(position)), health: 100, attributes: this.playerAttributes(other) };
    });
    const entities = [...this.meta.keys()].map((id) => this.entityObservation(id)).filter((entity) => entity !== null);
    for (const other of this.characters.values()) entities.push(this.characterEntity(other));
    return {
      tick: this.tick,
      game_status: "active",
      player: { id: character.id, position: tuple(position), health: 100, attributes: this.playerAttributes(character) },
      other_players: others,
      world: { entities },
      events: [],
    };
  }

  // ---- spectators -----------------------------------------------------------------------

  /** Compact pose frame for viewers: [numericId, x, y, z, qx, qy, qz, qw] per moving thing. */
  poseFrame(): { tick: number; t: number; poses: number[][] } {
    const poses: number[][] = [];
    for (const [id, info] of this.meta) {
      if (info.decorative) continue;
      const body = this.bodyOf(id);
      if (!body || body.isFixed()) continue;
      const t = body.translation();
      const q = body.rotation();
      poses.push([this.numericIds.get(id)!, round(t.x, 3), round(t.y, 3), round(t.z, 3), round(q.x, 4), round(q.y, 4), round(q.z, 4), round(q.w, 4)]);
    }
    for (const character of this.characters.values()) {
      const t = character.body.translation();
      const yaw = Math.atan2(-character.forward.x, -character.forward.z);
      poses.push([character.numericId, round(t.x, 3), round(t.y, 3), round(t.z, 3), 0, round(Math.sin(yaw / 2), 4), 0, round(Math.cos(yaw / 2), 4)]);
    }
    return { tick: this.tick, t: round(this.simSeconds, 3), poses };
  }

  /** Static description a viewer needs once: the v2 document plus id/name mapping. */
  sceneHello(): Record<string, unknown> {
    return {
      format: "graphysx-world-stream/v0",
      tickHz: TICK_HZ,
      document: this.document,
      ids: Object.fromEntries([...this.numericIds].map(([id, numeric]) => [numeric, id])),
      characters: [...this.characters.values()].map((character) => ({ numericId: character.numericId, name: character.name })),
    };
  }

  /** Operator-only state document (Clawblox GET /snapshot). Restore is a later phase. */
  snapshot(): Record<string, unknown> {
    return {
      format: "graphysx-world-snapshot/v0",
      time: round(this.simSeconds, 4),
      tick: this.tick,
      world: { id: this.document.id, entities: this.meta.size },
      characters: [...this.characters.values()].map((character) => ({
        id: character.id, name: character.name, session: character.session, position: tuple(this.position(character), 4),
        held: character.held, lastActionResult: character.lastActionResult,
      })),
      bodies: this.poseFrame().poses,
      // Rapier can serialise the whole solver state (contacts, warm-start caches); exact
      // restore would rebuild the engine from this blob instead of from the document.
      rapierStateBytes: rapierWorld(this.engine).takeSnapshot().byteLength,
      chat: this.chat,
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

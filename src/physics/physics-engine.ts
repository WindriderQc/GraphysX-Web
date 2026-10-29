/**
 * Engine-neutral rigid-body vocabulary used at the AgentWorld/runtime boundary.
 *
 * These types are deliberately structural: Three.js vectors and quaternions satisfy the
 * writable value interfaces without this module importing Three, while an adapter remains
 * free to use its engine's native math types internally. Engine objects never cross this
 * boundary; callers retain only opaque {@link PhysicsBodyHandle}s.
 */

export interface PhysicsVector3 {
  x: number;
  y: number;
  z: number;
}

export interface PhysicsQuaternion extends PhysicsVector3 {
  w: number;
}

export interface PhysicsTransform {
  position: PhysicsVector3;
  rotation: PhysicsQuaternion;
}

export interface PhysicsAabb {
  min: PhysicsVector3;
  max: PhysicsVector3;
}

export type PhysicsBodyMode = "dynamic" | "static" | "kinematic" | "trigger";
export type PhysicsSleepState = "awake" | "sleepy" | "sleeping";

/** A named surface. Adapters must give one id one stable coefficient pair. */
export interface PhysicsMaterialDefinition {
  id: string;
  friction: number;
  restitution: number;
}

interface PhysicsShapePlacement {
  /** Shape-local translation in the body's frame. */
  offset?: PhysicsVector3;
  /** Shape-local rotation in the body's frame. */
  rotation?: PhysicsQuaternion;
}

export type PhysicsShapeDefinition = PhysicsShapePlacement & (
  | { kind: "sphere"; radius: number }
  | { kind: "box"; halfExtents: PhysicsVector3 }
  /** Canonical cylinder/cone axis is local +Y. A zero top radius describes a cone. */
  | { kind: "cylinder"; radiusTop: number; radiusBottom: number; height: number; segments?: number }
  /** Infinite plane whose canonical normal is local +Y. */
  | { kind: "plane" }
  /** Convex hull built from flat xyz triples in the body's local frame. */
  | { kind: "convex"; vertices: readonly number[] }
  /** Indexed triangle mesh built from flat xyz triples in the body's local frame. */
  | { kind: "trimesh"; vertices: readonly number[]; indices: readonly number[] }
  /**
   * Y-up regular grid. `heights[z][x]` starts at local (0, height, 0), then advances
   * by `elementSize` along +X/+Z. Use `offset` to centre the grid around a body.
   */
  | { kind: "heightfield"; heights: readonly (readonly number[])[]; elementSize: number }
);

export interface PhysicsBodyDefinition {
  mode: PhysicsBodyMode;
  /** Used only by dynamic bodies; adapters force all other modes to zero mass. */
  mass?: number;
  transform: PhysicsTransform;
  shapes: readonly PhysicsShapeDefinition[];
  material?: PhysicsMaterialDefinition;
  linearVelocity?: PhysicsVector3;
  angularVelocity?: PhysicsVector3;
  linearDamping?: number;
  angularDamping?: number;
  allowSleep?: boolean;
}

export interface PhysicsStepOptions {
  fixedTimeStep?: number;
  maxSubSteps?: number;
}

export type PhysicsJointDefinition =
  | {
      kind: "fixed";
      anchorOnFirst: PhysicsVector3;
      anchorOnSecond: PhysicsVector3;
      frameOnFirst: PhysicsQuaternion;
      frameOnSecond: PhysicsQuaternion;
    }
  | {
      kind: "revolute";
      anchorOnFirst: PhysicsVector3;
      anchorOnSecond: PhysicsVector3;
      axis: PhysicsVector3;
    }
  | {
      kind: "rope";
      anchorOnFirst: PhysicsVector3;
      anchorOnSecond: PhysicsVector3;
      length: number;
    };

declare const physicsBodyHandleBrand: unique symbol;

/** Identity-only token. Its backing rigid body is private to the active adapter. */
export type PhysicsBodyHandle = Readonly<{ [physicsBodyHandleBrand]: true }>;

declare const physicsJointHandleBrand: unique symbol;

/** Identity-only token for a constraint owned by one physics adapter. */
export type PhysicsJointHandle = Readonly<{ [physicsJointHandleBrand]: true }>;

declare const physicsCharacterHandleBrand: unique symbol;

/** Identity-only token for a walking character owned by one physics adapter. */
export type PhysicsCharacterHandle = Readonly<{ [physicsCharacterHandleBrand]: true }>;

/**
 * A walking capsule moved by a character controller: kinematic, blocked by solid colliders,
 * able to climb small steps and to shove dynamic bodies out of its path. Sensors (triggers,
 * bodies whose collision is off) never block it.
 */
export interface PhysicsCharacterDefinition {
  position: PhysicsVector3;
  radius: number;
  /** Half of the straight segment; the capsule is `2 * (halfHeight + radius)` tall. */
  halfHeight: number;
  /** Gap kept between the capsule and obstacles. Default 0.05. */
  offset?: number;
  /** Climbs ledges up to this height. Omit to disable. */
  autostepHeight?: number;
  autostepMinWidth?: number;
  /** Steepest walkable slope, radians. Default 45 degrees. */
  maxSlopeClimbRadians?: number;
  /** Sticks to the ground across drops up to this distance. Omit to disable. */
  snapToGround?: number;
  /** Mass used when shoving dynamic bodies; 0 (default) never pushes. */
  pushMass?: number;
}

/** Result of one {@link PhysicsEngine.moveCharacter} call. */
export interface PhysicsCharacterMove {
  /** The translation applied at the next step, after collisions. */
  movement: PhysicsVector3;
  grounded: boolean;
}

export type PhysicsStateHandle = PhysicsBodyHandle | PhysicsCharacterHandle | PhysicsJointHandle;

/** Complete solver state (contacts and warm-start caches included). Opaque to callers. */
export interface PhysicsEngineState {
  format: string;
  bytes: Uint8Array;
  accumulator: number;
}

/**
 * Minimal world/body seam needed by AgentWorld today.
 *
 * Read methods write into caller-owned values so the frame loop can reuse Three.js objects
 * or small scratch records. A handle belongs to exactly one engine instance; using a removed,
 * foreign, or post-disposal handle is an error.
 */
export interface PhysicsEngine {
  createBody(definition: PhysicsBodyDefinition): PhysicsBodyHandle;
  removeBody(body: PhysicsBodyHandle): void;
  createJoint(first: PhysicsBodyHandle, second: PhysicsBodyHandle, definition: PhysicsJointDefinition): PhysicsJointHandle;
  removeJoint(joint: PhysicsJointHandle): void;

  step(deltaSeconds: number, options?: PhysicsStepOptions): void;
  setGravity(gravity: PhysicsVector3): void;
  readGravity(out: PhysicsVector3): void;

  writeTransform(body: PhysicsBodyHandle, transform: PhysicsTransform, wake?: boolean): void;
  readTransform(body: PhysicsBodyHandle, out: PhysicsTransform): void;
  writeLinearVelocity(body: PhysicsBodyHandle, velocity: PhysicsVector3, wake?: boolean): void;
  readLinearVelocity(body: PhysicsBodyHandle, out: PhysicsVector3): void;
  writeAngularVelocity(body: PhysicsBodyHandle, velocity: PhysicsVector3, wake?: boolean): void;
  readAngularVelocity(body: PhysicsBodyHandle, out: PhysicsVector3): void;

  /** Force and optional application point are expressed in world coordinates. */
  applyForce(body: PhysicsBodyHandle, force: PhysicsVector3, worldPoint?: PhysicsVector3): void;
  /** Impulse and optional application point are expressed in world coordinates. */
  applyImpulse(body: PhysicsBodyHandle, impulse: PhysicsVector3, worldPoint?: PhysicsVector3): void;

  readAabb(body: PhysicsBodyHandle, out: PhysicsAabb): void;

  // Host seams: a server that runs game rules on top of the scene (the world service) carries
  // bodies, walks characters, asks whether a spot is free and saves the exact solver state.

  /**
   * Hand a dynamic body to the host (`kinematic`) or give it back to the solver. A body given
   * back keeps the velocity it was moved with; zero it to set the body down.
   */
  setBodyMotion(body: PhysicsBodyHandle, motion: "dynamic" | "kinematic"): void;
  /** With collision off a body still moves and is still reported, but touches nothing. */
  setBodyCollision(body: PhysicsBodyHandle, enabled: boolean): void;
  /** Kinematic bodies only: the pose reached at the next step, swept by the solver. */
  writeKinematicTarget(body: PhysicsBodyHandle, transform: PhysicsTransform): void;
  /** True when a solid collider, other than those of `exclude`, overlaps the box. */
  overlapsBox(
    center: PhysicsVector3,
    halfExtents: PhysicsVector3,
    rotation: PhysicsQuaternion,
    exclude?: readonly PhysicsStateHandle[],
  ): boolean;

  /** Bodies and characters touching this body after the last step (solid contacts only). */
  readContacts(body: PhysicsBodyHandle, out: PhysicsStateHandle[]): void;

  createCharacter(definition: PhysicsCharacterDefinition): PhysicsCharacterHandle;
  removeCharacter(character: PhysicsCharacterHandle): void;
  /** Resolve a desired translation against the world; it takes effect at the next step. */
  moveCharacter(character: PhysicsCharacterHandle, desired: PhysicsVector3, out: PhysicsCharacterMove): void;
  readCharacterPosition(character: PhysicsCharacterHandle, out: PhysicsVector3): void;
  /** Teleport (respawn). */
  writeCharacterPosition(character: PhysicsCharacterHandle, position: PhysicsVector3): void;

  /** Serialise the whole solver. Pair with {@link stateId} to remember what each handle was. */
  saveState(): PhysicsEngineState;
  /** The id a handle has inside the state {@link saveState} produces. */
  stateId(handle: PhysicsStateHandle): number;
  /**
   * Replace the simulated world with a saved one. Every live handle must be bound to the id it
   * had when saved; saved bodies, characters and joints left unbound are removed. Stepping
   * afterwards continues the saved simulation bit for bit.
   */
  restoreState(state: PhysicsEngineState, bindings: Iterable<readonly [PhysicsStateHandle, number]>): void;
  readSleepState(body: PhysicsBodyHandle): PhysicsSleepState;
  wakeBody(body: PhysicsBodyHandle): void;
  sleepBody(body: PhysicsBodyHandle): void;

  dispose(): void;
}

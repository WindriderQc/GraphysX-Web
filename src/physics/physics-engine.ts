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

declare const physicsBodyHandleBrand: unique symbol;

/** Identity-only token. Its backing rigid body is private to the active adapter. */
export type PhysicsBodyHandle = Readonly<{ [physicsBodyHandleBrand]: true }>;

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
  readSleepState(body: PhysicsBodyHandle): PhysicsSleepState;
  wakeBody(body: PhysicsBodyHandle): void;
  sleepBody(body: PhysicsBodyHandle): void;

  dispose(): void;
}

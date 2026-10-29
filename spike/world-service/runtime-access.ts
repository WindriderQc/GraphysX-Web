// SPIKE ONLY: reaches into private runtime and adapter fields.
//
// The world service needs four things the public seams do not offer yet. Each function here
// names the seam the design proposes, so the real implementation replaces casts with API:
//
//   bodyOf(id)                -> AgentWorldRuntime.hostBody(id)            (read-only handle)
//   setCarried(handle, on)    -> PhysicsEngine.setBodyMode + setCollision  (carry/throw)
//   characters                -> PhysicsEngine.createCharacter/moveCharacter (Rapier KCC)
//   overlaps(box)             -> PhysicsEngine.overlapBox                  (Place: Occupied)

import type { Collider, RigidBody, World } from "@dimforge/rapier3d-compat";
import RAPIER from "../../src/physics/rapier-runtime";
import type { AgentWorldRuntime } from "../../src/agent-world-runtime";
import type { PhysicsBodyHandle } from "../../src/physics/physics-engine";
import type { RapierPhysicsEngine } from "../../src/physics/rapier-physics-engine";

type RuntimeInternals = { entities: Map<string, { body: PhysicsBodyHandle | null }> };
type EngineInternals = {
  world: World;
  bodies: Map<PhysicsBodyHandle, { body: RigidBody; colliders: { collider: Collider }[] }>;
};

export { RAPIER };

export function rapierWorld(engine: RapierPhysicsEngine): World {
  return (engine as unknown as EngineInternals).world;
}

export function rigidBodyOf(runtime: AgentWorldRuntime, engine: RapierPhysicsEngine, id: string): RigidBody | null {
  const handle = (runtime as unknown as RuntimeInternals).entities.get(id)?.body;
  if (!handle) return null;
  return (engine as unknown as EngineInternals).bodies.get(handle)?.body ?? null;
}

export function collidersOf(body: RigidBody): Collider[] {
  const out: Collider[] = [];
  for (let index = 0; index < body.numColliders(); index += 1) out.push(body.collider(index));
  return out;
}

/**
 * Carried / placing blocks become kinematic sensors (Clawblox: Anchored + CanCollide=false).
 * The runtime still reads their transform back each step because their v2 mode stays
 * `dynamic`, so viewers see the block ride above the carrier with no extra plumbing.
 */
export function setCarried(body: RigidBody, carried: boolean): void {
  body.setBodyType(carried ? RAPIER.RigidBodyType.KinematicPositionBased : RAPIER.RigidBodyType.Dynamic, true);
  for (const collider of collidersOf(body)) collider.setSensor(carried);
  if (!carried) body.wakeUp();
}

/** Sensor-only collisions while a thrown block clears its thrower (Clawblox grace period). */
export function setGhost(body: RigidBody, ghost: boolean): void {
  for (const collider of collidersOf(body)) collider.setSensor(ghost);
}

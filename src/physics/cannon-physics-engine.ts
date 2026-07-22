import {
  Body,
  Box,
  ContactMaterial,
  Cylinder,
  Heightfield,
  Material,
  Plane,
  Quaternion,
  SAPBroadphase,
  Sphere,
  Vec3,
  World,
  type Shape,
} from "cannon-es";
import type {
  PhysicsAabb,
  PhysicsBodyDefinition,
  PhysicsBodyHandle,
  PhysicsEngine,
  PhysicsMaterialDefinition,
  PhysicsQuaternion,
  PhysicsShapeDefinition,
  PhysicsSleepState,
  PhysicsStepOptions,
  PhysicsTransform,
  PhysicsVector3,
} from "./physics-engine";

export interface CannonPhysicsEngineOptions {
  gravity?: PhysicsVector3;
  allowSleep?: boolean;
  defaultMaterial?: PhysicsMaterialDefinition;
}

const FALLBACK_MATERIAL: PhysicsMaterialDefinition = {
  id: "default",
  friction: 0.18,
  restitution: 0.28,
};

type CannonMaterialRecord = {
  definition: PhysicsMaterialDefinition;
  material: Material;
};

/**
 * cannon-es implementation of the engine-neutral AgentWorld physics seam.
 *
 * Surface pairs use GraphysX's geometric-mean combination rule. Materials are shared by id
 * and every newly seen material is paired with all existing materials, including itself.
 */
export class CannonPhysicsEngine implements PhysicsEngine {
  private readonly world: World;
  private readonly bodies = new Map<PhysicsBodyHandle, Body>();
  private readonly materials = new Map<string, CannonMaterialRecord>();
  private readonly defaultMaterial: PhysicsMaterialDefinition;
  private disposed = false;

  private readonly scratchForce = new Vec3();
  private readonly scratchPoint = new Vec3();

  constructor(options: CannonPhysicsEngineOptions = {}) {
    const gravity = options.gravity ?? { x: 0, y: -9.81, z: 0 };
    this.world = new World({
      gravity: new Vec3(gravity.x, gravity.y, gravity.z),
      allowSleep: options.allowSleep ?? true,
    });
    this.world.broadphase = new SAPBroadphase(this.world);
    this.defaultMaterial = normalizeMaterial(options.defaultMaterial ?? FALLBACK_MATERIAL);
    this.ensureMaterial(this.defaultMaterial);
    this.world.defaultContactMaterial.friction = this.defaultMaterial.friction;
    this.world.defaultContactMaterial.restitution = this.defaultMaterial.restitution;
  }

  createBody(definition: PhysicsBodyDefinition): PhysicsBodyHandle {
    this.assertLive();
    if (definition.shapes.length === 0) throw new Error("A physics body requires at least one shape");
    if (definition.shapes.some((shape) => shape.kind === "heightfield") && definition.mode !== "static") {
      throw new Error("Heightfield bodies must be static");
    }

    // An omitted surface intentionally stays native-undefined so Cannon uses the world's
    // default contact material. AgentWorld uses that distinction for its environment plane;
    // authored `default` bodies still carry the explicit named material and its pair table.
    const material = definition.material ? this.ensureMaterial(definition.material) : undefined;
    const dynamic = definition.mode === "dynamic";
    const trigger = definition.mode === "trigger";
    const body = new Body({
      mass: dynamic ? positive(definition.mass ?? 1, "Body mass") : 0,
      material,
      type: bodyType(definition.mode),
      isTrigger: trigger,
      allowSleep: trigger ? false : definition.allowSleep ?? true,
      linearDamping: coefficient(definition.linearDamping ?? (dynamic ? 0.08 : 0), "Linear damping"),
      angularDamping: coefficient(definition.angularDamping ?? (dynamic ? 0.08 : 0), "Angular damping"),
    });

    copyVectorToCannon(definition.transform.position, body.position);
    copyQuaternionToCannon(definition.transform.rotation, body.quaternion);
    if (definition.linearVelocity) copyVectorToCannon(definition.linearVelocity, body.velocity);
    if (definition.angularVelocity) copyVectorToCannon(definition.angularVelocity, body.angularVelocity);

    for (const source of definition.shapes) {
      const { shape, canonicalRotation } = createShape(source);
      const offset = source.offset ? toCannonVector(source.offset) : undefined;
      const rotation = combineShapeRotation(source.rotation, canonicalRotation);
      body.addShape(shape, offset, rotation);
    }
    body.updateMassProperties();
    body.updateAABB();

    const handle = Object.freeze({}) as PhysicsBodyHandle;
    this.bodies.set(handle, body);
    this.world.addBody(body);
    return handle;
  }

  removeBody(handle: PhysicsBodyHandle): void {
    this.assertLive();
    const body = this.bodyFor(handle);
    this.world.removeBody(body);
    this.bodies.delete(handle);
  }

  step(deltaSeconds: number, options: PhysicsStepOptions = {}): void {
    this.assertLive();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error("Physics delta must be a finite non-negative number");
    if (deltaSeconds === 0) return;
    const fixedTimeStep = positive(options.fixedTimeStep ?? 1 / 60, "Fixed time step");
    const maxSubSteps = Math.max(1, Math.floor(positive(options.maxSubSteps ?? 4, "Maximum substeps")));
    this.world.step(fixedTimeStep, deltaSeconds, maxSubSteps);
  }

  setGravity(gravity: PhysicsVector3): void {
    this.assertLive();
    copyVectorToCannon(gravity, this.world.gravity);
  }

  readGravity(out: PhysicsVector3): void {
    this.assertLive();
    copyVectorFromCannon(this.world.gravity, out);
  }

  writeTransform(handle: PhysicsBodyHandle, transform: PhysicsTransform, wake = true): void {
    const body = this.bodyFor(handle);
    copyVectorToCannon(transform.position, body.position);
    copyQuaternionToCannon(transform.rotation, body.quaternion);
    body.aabbNeedsUpdate = true;
    if (wake) body.wakeUp();
  }

  readTransform(handle: PhysicsBodyHandle, out: PhysicsTransform): void {
    const body = this.bodyFor(handle);
    copyVectorFromCannon(body.position, out.position);
    copyQuaternionFromCannon(body.quaternion, out.rotation);
  }

  writeLinearVelocity(handle: PhysicsBodyHandle, velocity: PhysicsVector3, wake = true): void {
    const body = this.bodyFor(handle);
    copyVectorToCannon(velocity, body.velocity);
    if (wake) body.wakeUp();
  }

  readLinearVelocity(handle: PhysicsBodyHandle, out: PhysicsVector3): void {
    copyVectorFromCannon(this.bodyFor(handle).velocity, out);
  }

  writeAngularVelocity(handle: PhysicsBodyHandle, velocity: PhysicsVector3, wake = true): void {
    const body = this.bodyFor(handle);
    copyVectorToCannon(velocity, body.angularVelocity);
    if (wake) body.wakeUp();
  }

  readAngularVelocity(handle: PhysicsBodyHandle, out: PhysicsVector3): void {
    copyVectorFromCannon(this.bodyFor(handle).angularVelocity, out);
  }

  applyForce(handle: PhysicsBodyHandle, force: PhysicsVector3, worldPoint?: PhysicsVector3): void {
    const body = this.bodyFor(handle);
    copyVectorToCannon(force, this.scratchForce);
    this.relativePoint(body, worldPoint);
    body.applyForce(this.scratchForce, this.scratchPoint);
    if (body.sleepState === Body.SLEEPING) body.wakeUp();
  }

  applyImpulse(handle: PhysicsBodyHandle, impulse: PhysicsVector3, worldPoint?: PhysicsVector3): void {
    const body = this.bodyFor(handle);
    copyVectorToCannon(impulse, this.scratchForce);
    this.relativePoint(body, worldPoint);
    body.applyImpulse(this.scratchForce, this.scratchPoint);
    if (body.sleepState === Body.SLEEPING) body.wakeUp();
  }

  readAabb(handle: PhysicsBodyHandle, out: PhysicsAabb): void {
    const body = this.bodyFor(handle);
    body.updateAABB();
    copyVectorFromCannon(body.aabb.lowerBound, out.min);
    copyVectorFromCannon(body.aabb.upperBound, out.max);
  }

  readSleepState(handle: PhysicsBodyHandle): PhysicsSleepState {
    const state = this.bodyFor(handle).sleepState;
    if (state === Body.SLEEPING) return "sleeping";
    if (state === Body.SLEEPY) return "sleepy";
    return "awake";
  }

  wakeBody(handle: PhysicsBodyHandle): void {
    this.bodyFor(handle).wakeUp();
  }

  sleepBody(handle: PhysicsBodyHandle): void {
    this.bodyFor(handle).sleep();
  }

  dispose(): void {
    if (this.disposed) return;
    for (const body of this.bodies.values()) this.world.removeBody(body);
    this.bodies.clear();
    this.materials.clear();
    this.disposed = true;
  }

  private bodyFor(handle: PhysicsBodyHandle): Body {
    this.assertLive();
    const body = this.bodies.get(handle);
    if (!body) throw new Error("Unknown or removed physics body handle");
    return body;
  }

  private assertLive(): void {
    if (this.disposed) throw new Error("Physics engine has been disposed");
  }

  private relativePoint(body: Body, worldPoint?: PhysicsVector3): void {
    if (!worldPoint) {
      this.scratchPoint.set(0, 0, 0);
      return;
    }
    this.scratchPoint.set(
      worldPoint.x - body.position.x,
      worldPoint.y - body.position.y,
      worldPoint.z - body.position.z,
    );
  }

  private ensureMaterial(source: PhysicsMaterialDefinition): Material {
    const definition = normalizeMaterial(source);
    const existing = this.materials.get(definition.id);
    if (existing) {
      if (existing.definition.friction !== definition.friction || existing.definition.restitution !== definition.restitution) {
        throw new Error(`Physics material ${definition.id} was redefined with different coefficients`);
      }
      return existing.material;
    }

    // Leave the native material coefficients unset: cannon otherwise multiplies them and
    // silently overrides the explicit ContactMaterial pair registered below.
    const material = new Material(`graphysx-${definition.id}`);
    const peers = [...this.materials.values()];
    const record = { definition, material };
    this.materials.set(definition.id, record);
    for (const peer of [...peers, record]) {
      this.world.addContactMaterial(new ContactMaterial(material, peer.material, {
        friction: Math.sqrt(definition.friction * peer.definition.friction),
        restitution: Math.sqrt(definition.restitution * peer.definition.restitution),
      }));
    }
    return material;
  }
}

function createShape(source: PhysicsShapeDefinition): { shape: Shape; canonicalRotation?: Quaternion } {
  if (source.kind === "sphere") return { shape: new Sphere(positive(source.radius, "Sphere radius")) };
  if (source.kind === "box") {
    return {
      shape: new Box(new Vec3(
        positive(source.halfExtents.x, "Box half extent X"),
        positive(source.halfExtents.y, "Box half extent Y"),
        positive(source.halfExtents.z, "Box half extent Z"),
      )),
    };
  }
  if (source.kind === "cylinder") {
    const radiusTop = nonNegative(source.radiusTop, "Cylinder top radius");
    const radiusBottom = nonNegative(source.radiusBottom, "Cylinder bottom radius");
    if (radiusTop === 0 && radiusBottom === 0) throw new Error("A cylinder needs a non-zero radius");
    return {
      shape: new Cylinder(Math.max(0.001, radiusTop), Math.max(0.001, radiusBottom), positive(source.height, "Cylinder height"), Math.max(3, Math.floor(source.segments ?? 12))),
      canonicalRotation: new Quaternion().setFromEuler(-Math.PI / 2, 0, 0),
    };
  }
  if (source.kind === "plane") {
    return {
      shape: new Plane(),
      canonicalRotation: new Quaternion().setFromEuler(-Math.PI / 2, 0, 0),
    };
  }

  const rows = source.heights.length;
  const columns = source.heights[0]?.length ?? 0;
  if (rows < 2 || columns < 2 || source.heights.some((row) => row.length !== columns)) {
    throw new Error("A heightfield must be a rectangular grid of at least 2 x 2 samples");
  }
  const heights = source.heights.map((row) => row.map((height) => finite(height, "Heightfield sample")));
  return {
    shape: new Heightfield(heights, { elementSize: positive(source.elementSize, "Heightfield element size") }),
    // cannon's height is native +Z. This maps native x/y to canonical z/x and native z to +Y,
    // preserving the same quad diagonal as Three PlaneGeometry after its X rotation.
    canonicalRotation: new Quaternion().setFromEuler(-Math.PI / 2, 0, -Math.PI / 2),
  };
}

function combineShapeRotation(source: PhysicsQuaternion | undefined, canonical: Quaternion | undefined): Quaternion | undefined {
  if (!source && !canonical) return undefined;
  const authored = source ? toCannonQuaternion(source) : new Quaternion();
  return canonical ? authored.mult(canonical, new Quaternion()) : authored;
}

function bodyType(mode: PhysicsBodyDefinition["mode"]): 1 | 2 | 4 {
  if (mode === "dynamic") return Body.DYNAMIC;
  if (mode === "static") return Body.STATIC;
  return Body.KINEMATIC;
}

function normalizeMaterial(source: PhysicsMaterialDefinition): PhysicsMaterialDefinition {
  const id = source.id.trim();
  if (!id) throw new Error("Physics material id cannot be empty");
  return {
    id,
    friction: coefficient(source.friction, `Physics material ${id} friction`),
    restitution: coefficient(source.restitution, `Physics material ${id} restitution`),
  };
}

function coefficient(value: number, label: string): number {
  const checked = finite(value, label);
  if (checked < 0 || checked > 1) throw new Error(`${label} must be between 0 and 1`);
  return checked;
}

function positive(value: number, label: string): number {
  const checked = finite(value, label);
  if (checked <= 0) throw new Error(`${label} must be greater than zero`);
  return checked;
}

function nonNegative(value: number, label: string): number {
  const checked = finite(value, label);
  if (checked < 0) throw new Error(`${label} cannot be negative`);
  return checked;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function toCannonVector(source: PhysicsVector3): Vec3 {
  return new Vec3(source.x, source.y, source.z);
}

function toCannonQuaternion(source: PhysicsQuaternion): Quaternion {
  return new Quaternion(source.x, source.y, source.z, source.w).normalize();
}

function copyVectorToCannon(source: PhysicsVector3, target: Vec3): void {
  target.set(source.x, source.y, source.z);
}

function copyVectorFromCannon(source: Vec3, target: PhysicsVector3): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
}

function copyQuaternionToCannon(source: PhysicsQuaternion, target: Quaternion): void {
  target.set(source.x, source.y, source.z, source.w).normalize();
}

function copyQuaternionFromCannon(source: Quaternion, target: PhysicsQuaternion): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
  target.w = source.w;
}

import type {
  Collider,
  ColliderDesc,
  RigidBody,
  RigidBodyDesc,
  World,
} from "@dimforge/rapier3d-compat";
import RAPIER from "./rapier-runtime";
import {
  createRapierConvexHullColliderDesc,
  createRapierTrimeshColliderDesc,
} from "./rapier-mesh-primitives";
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

export interface RapierPhysicsEngineOptions {
  gravity?: PhysicsVector3;
  allowSleep?: boolean;
  defaultMaterial?: PhysicsMaterialDefinition;
}

const FALLBACK_MATERIAL: PhysicsMaterialDefinition = {
  id: "default",
  friction: 0.18,
  restitution: 0.28,
};

const IDENTITY_ROTATION: PhysicsQuaternion = { x: 0, y: 0, z: 0, w: 1 };
const MAX_AABB = Number.MAX_VALUE;
const PLANE_AXIS_EPSILON = 1e-10;

type FiniteShapeBounds = {
  kind: "finite";
  center: PhysicsVector3;
  halfExtents: PhysicsVector3;
};

type PlaneShapeBounds = { kind: "plane" };
type ShapeBounds = FiniteShapeBounds | PlaneShapeBounds;

type RapierColliderRecord = {
  collider: Collider;
  bounds: ShapeBounds;
};

type RapierBodyRecord = {
  body: RigidBody;
  colliders: RapierColliderRecord[];
};

type PreparedShape = {
  descriptor: ColliderDesc;
  bounds: ShapeBounds;
  massWeight: number;
};

/**
 * Rapier implementation of the engine-neutral AgentWorld physics seam.
 *
 * Construction is asynchronous because the compat build initializes a WASM module. Callers
 * receive an instance only after that module is ready; no partially initialized world escapes.
 * Collider coefficients are the square roots of authored coefficients and every collider uses
 * Rapier's Multiply rule, yielding GraphysX's geometric mean for each contacting surface pair.
 */
export class RapierPhysicsEngine implements PhysicsEngine {
  private readonly world: World;
  private readonly bodies = new Map<PhysicsBodyHandle, RapierBodyRecord>();
  private readonly forcedBodies = new Set<RigidBody>();
  private readonly materials = new Map<string, PhysicsMaterialDefinition>();
  private readonly defaultMaterial: PhysicsMaterialDefinition;
  private readonly allowSleep: boolean;
  private accumulator = 0;
  private disposed = false;

  constructor(options: RapierPhysicsEngineOptions = {}) {
    const gravity = options.gravity ?? { x: 0, y: -9.81, z: 0 };
    assertVector(gravity, "Gravity");
    this.world = new RAPIER.World(toRapierVector(gravity));
    this.allowSleep = options.allowSleep ?? true;
    this.defaultMaterial = normalizeMaterial(options.defaultMaterial ?? FALLBACK_MATERIAL);
    this.materials.set(this.defaultMaterial.id, this.defaultMaterial);
  }

  static async create(options: RapierPhysicsEngineOptions = {}): Promise<RapierPhysicsEngine> {
    return new RapierPhysicsEngine(options);
  }

  createBody(definition: PhysicsBodyDefinition): PhysicsBodyHandle {
    this.assertLive();
    if (definition.shapes.length === 0) throw new Error("A physics body requires at least one shape");
    if (definition.shapes.some((shape) => shape.kind === "heightfield") && definition.mode !== "static") {
      throw new Error("Heightfield bodies must be static");
    }
    if (definition.shapes.some((shape) => shape.kind === "trimesh") && definition.mode !== "static") {
      throw new Error("Trimesh bodies must be static; use a convex collider for moving geometry");
    }

    const material = definition.material
      ? this.ensureMaterial(definition.material)
      : this.defaultMaterial;
    const transform = normalizeTransform(definition.transform);
    const dynamic = definition.mode === "dynamic";
    const trigger = definition.mode === "trigger";
    const mass = dynamic ? positive(definition.mass ?? 1, "Body mass") : 0;
    const preparedShapes = definition.shapes.map(prepareShape);
    const massWeightTotal = preparedShapes.reduce((total, shape) => total + shape.massWeight, 0);

    const bodyDescriptor = createBodyDescriptor(definition)
      .setTranslation(transform.position.x, transform.position.y, transform.position.z)
      .setRotation(transform.rotation)
      .setLinearDamping(coefficient(definition.linearDamping ?? (dynamic ? 0.08 : 0), "Linear damping"))
      .setAngularDamping(coefficient(definition.angularDamping ?? (dynamic ? 0.08 : 0), "Angular damping"))
      .setCanSleep(trigger ? false : this.allowSleep && (definition.allowSleep ?? true));

    if (definition.linearVelocity) {
      assertVector(definition.linearVelocity, "Linear velocity");
      bodyDescriptor.setLinvel(
        definition.linearVelocity.x,
        definition.linearVelocity.y,
        definition.linearVelocity.z,
      );
    }
    if (definition.angularVelocity) {
      assertVector(definition.angularVelocity, "Angular velocity");
      bodyDescriptor.setAngvel(toRapierVector(definition.angularVelocity));
    }

    const body = this.world.createRigidBody(bodyDescriptor);
    const colliders: RapierColliderRecord[] = [];
    try {
      for (const prepared of preparedShapes) {
        const descriptor = prepared.descriptor
          .setSensor(trigger)
          .setFriction(Math.sqrt(material.friction))
          .setRestitution(Math.sqrt(material.restitution))
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
          .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply);

        if (dynamic) {
          // Assign the requested total mass across compound shapes by approximate volume.
          // Rapier then derives each collider's inertia and includes shape offsets correctly.
          const weight = massWeightTotal > 0 ? prepared.massWeight / massWeightTotal : 1 / preparedShapes.length;
          descriptor.setMass(mass * weight);
        } else {
          descriptor.setDensity(0);
        }

        colliders.push({
          collider: this.world.createCollider(descriptor, body),
          bounds: prepared.bounds,
        });
      }
    } catch (error) {
      this.world.removeRigidBody(body);
      throw error;
    }

    const handle = Object.freeze({}) as PhysicsBodyHandle;
    this.bodies.set(handle, { body, colliders });
    return handle;
  }

  removeBody(handle: PhysicsBodyHandle): void {
    this.assertLive();
    const record = this.recordFor(handle);
    this.forcedBodies.delete(record.body);
    this.world.removeRigidBody(record.body);
    this.bodies.delete(handle);
  }

  step(deltaSeconds: number, options: PhysicsStepOptions = {}): void {
    this.assertLive();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error("Physics delta must be a finite non-negative number");
    }
    if (deltaSeconds === 0) return;

    const fixedTimeStep = positive(options.fixedTimeStep ?? 1 / 60, "Fixed time step");
    const maxSubSteps = Math.max(1, Math.floor(positive(options.maxSubSteps ?? 4, "Maximum substeps")));
    this.world.timestep = fixedTimeStep;
    this.accumulator += deltaSeconds;

    let substeps = 0;
    while (this.accumulator >= fixedTimeStep && substeps < maxSubSteps) {
      this.world.step();
      // Rapier user forces/torques persist until reset, while the engine contract models
      // applyForce as a one-step input. Reset after every internal step so catch-up frames do
      // not apply one frame's force two to four times or accumulate it forever.
      for (const body of this.forcedBodies) {
        body.resetForces(false);
        body.resetTorques(false);
      }
      this.forcedBodies.clear();
      this.accumulator -= fixedTimeStep;
      substeps += 1;
    }

    // Cannon drops excess whole timesteps when the substep budget is exhausted. Matching that
    // behavior prevents a slow frame from creating an ever-growing physics backlog.
    this.accumulator %= fixedTimeStep;
  }

  setGravity(gravity: PhysicsVector3): void {
    this.assertLive();
    assertVector(gravity, "Gravity");
    this.world.gravity.x = gravity.x;
    this.world.gravity.y = gravity.y;
    this.world.gravity.z = gravity.z;
  }

  readGravity(out: PhysicsVector3): void {
    this.assertLive();
    copyVector(this.world.gravity, out);
  }

  writeTransform(handle: PhysicsBodyHandle, transform: PhysicsTransform, wake = true): void {
    const body = this.recordFor(handle).body;
    const normalized = normalizeTransform(transform);
    body.setTranslation(toRapierVector(normalized.position), wake);
    body.setRotation(normalized.rotation, wake);
  }

  readTransform(handle: PhysicsBodyHandle, out: PhysicsTransform): void {
    const body = this.recordFor(handle).body;
    copyVector(body.translation(), out.position);
    copyQuaternion(body.rotation(), out.rotation);
  }

  writeLinearVelocity(handle: PhysicsBodyHandle, velocity: PhysicsVector3, wake = true): void {
    assertVector(velocity, "Linear velocity");
    this.recordFor(handle).body.setLinvel(toRapierVector(velocity), wake);
  }

  readLinearVelocity(handle: PhysicsBodyHandle, out: PhysicsVector3): void {
    copyVector(this.recordFor(handle).body.linvel(), out);
  }

  writeAngularVelocity(handle: PhysicsBodyHandle, velocity: PhysicsVector3, wake = true): void {
    assertVector(velocity, "Angular velocity");
    this.recordFor(handle).body.setAngvel(toRapierVector(velocity), wake);
  }

  readAngularVelocity(handle: PhysicsBodyHandle, out: PhysicsVector3): void {
    copyVector(this.recordFor(handle).body.angvel(), out);
  }

  applyForce(handle: PhysicsBodyHandle, force: PhysicsVector3, worldPoint?: PhysicsVector3): void {
    assertVector(force, "Force");
    const body = this.recordFor(handle).body;
    if (worldPoint) {
      assertVector(worldPoint, "Force application point");
      body.addForceAtPoint(toRapierVector(force), toRapierVector(worldPoint), true);
    } else {
      body.addForce(toRapierVector(force), true);
    }
    this.forcedBodies.add(body);
  }

  applyImpulse(handle: PhysicsBodyHandle, impulse: PhysicsVector3, worldPoint?: PhysicsVector3): void {
    assertVector(impulse, "Impulse");
    const body = this.recordFor(handle).body;
    if (worldPoint) {
      assertVector(worldPoint, "Impulse application point");
      body.applyImpulseAtPoint(toRapierVector(impulse), toRapierVector(worldPoint), true);
    } else {
      body.applyImpulse(toRapierVector(impulse), true);
    }
  }

  readAabb(handle: PhysicsBodyHandle, out: PhysicsAabb): void {
    const record = this.recordFor(handle);
    this.world.propagateModifiedBodyPositionsToColliders();
    out.min.x = MAX_AABB;
    out.min.y = MAX_AABB;
    out.min.z = MAX_AABB;
    out.max.x = -MAX_AABB;
    out.max.y = -MAX_AABB;
    out.max.z = -MAX_AABB;

    for (const item of record.colliders) {
      if (item.bounds.kind === "plane") {
        unionPlaneAabb(item.collider, out);
      } else {
        unionFiniteAabb(item.collider, item.bounds, out);
      }
    }
  }

  readSleepState(handle: PhysicsBodyHandle): PhysicsSleepState {
    return this.recordFor(handle).body.isSleeping() ? "sleeping" : "awake";
  }

  wakeBody(handle: PhysicsBodyHandle): void {
    this.recordFor(handle).body.wakeUp();
  }

  sleepBody(handle: PhysicsBodyHandle): void {
    this.recordFor(handle).body.sleep();
  }

  dispose(): void {
    if (this.disposed) return;
    this.bodies.clear();
    this.forcedBodies.clear();
    this.materials.clear();
    this.world.free();
    this.accumulator = 0;
    this.disposed = true;
  }

  private recordFor(handle: PhysicsBodyHandle): RapierBodyRecord {
    this.assertLive();
    const record = this.bodies.get(handle);
    if (!record) throw new Error("Unknown or removed physics body handle");
    return record;
  }

  private assertLive(): void {
    if (this.disposed) throw new Error("Physics engine has been disposed");
  }

  private ensureMaterial(source: PhysicsMaterialDefinition): PhysicsMaterialDefinition {
    const definition = normalizeMaterial(source);
    const existing = this.materials.get(definition.id);
    if (existing) {
      if (existing.friction !== definition.friction || existing.restitution !== definition.restitution) {
        throw new Error(`Physics material ${definition.id} was redefined with different coefficients`);
      }
      return existing;
    }
    this.materials.set(definition.id, definition);
    return definition;
  }
}

function createBodyDescriptor(definition: PhysicsBodyDefinition): RigidBodyDesc {
  if (definition.mode === "dynamic") return RAPIER.RigidBodyDesc.dynamic();
  if (definition.mode === "static") return RAPIER.RigidBodyDesc.fixed();
  return RAPIER.RigidBodyDesc.kinematicPositionBased();
}

function prepareShape(source: PhysicsShapeDefinition): PreparedShape {
  const placement = preparePlacement(source);
  if (source.kind === "sphere") {
    const radius = positive(source.radius, "Sphere radius");
    return placedShape(
      RAPIER.ColliderDesc.ball(radius),
      placement.offset,
      placement.rotation,
      { kind: "finite", center: { x: 0, y: 0, z: 0 }, halfExtents: { x: radius, y: radius, z: radius } },
      (4 / 3) * Math.PI * radius ** 3,
    );
  }

  if (source.kind === "box") {
    const x = positive(source.halfExtents.x, "Box half extent X");
    const y = positive(source.halfExtents.y, "Box half extent Y");
    const z = positive(source.halfExtents.z, "Box half extent Z");
    return placedShape(
      RAPIER.ColliderDesc.cuboid(x, y, z),
      placement.offset,
      placement.rotation,
      { kind: "finite", center: { x: 0, y: 0, z: 0 }, halfExtents: { x, y, z } },
      8 * x * y * z,
    );
  }

  if (source.kind === "cylinder") {
    const radiusTop = nonNegative(source.radiusTop, "Cylinder top radius");
    const radiusBottom = nonNegative(source.radiusBottom, "Cylinder bottom radius");
    if (radiusTop === 0 && radiusBottom === 0) throw new Error("A cylinder needs a non-zero radius");
    const height = positive(source.height, "Cylinder height");
    const segments = Math.max(3, Math.floor(positive(source.segments ?? 12, "Cylinder segments")));
    const maxRadius = Math.max(radiusTop, radiusBottom);
    let descriptor: ColliderDesc;

    if (radiusTop === radiusBottom) {
      descriptor = RAPIER.ColliderDesc.cylinder(height / 2, radiusTop);
    } else {
      const vertices = frustumVertices(radiusTop, radiusBottom, height, segments);
      const hull = RAPIER.ColliderDesc.convexHull(vertices);
      if (!hull) throw new Error("Rapier could not construct a convex cylinder/frustum collider");
      descriptor = hull;
    }

    return placedShape(
      descriptor,
      placement.offset,
      placement.rotation,
      { kind: "finite", center: { x: 0, y: 0, z: 0 }, halfExtents: { x: maxRadius, y: height / 2, z: maxRadius } },
      Math.PI * height * (radiusTop ** 2 + radiusTop * radiusBottom + radiusBottom ** 2) / 3,
    );
  }

  if (source.kind === "plane") {
    return placedShape(
      new RAPIER.ColliderDesc(new RAPIER.HalfSpace({ x: 0, y: 1, z: 0 })),
      placement.offset,
      placement.rotation,
      { kind: "plane" },
      1,
    );
  }

  if (source.kind === "convex") {
    const descriptor = createRapierConvexHullColliderDesc(source.vertices);
    const bounds = meshBounds(source.vertices);
    return placedShape(
      descriptor,
      placement.offset,
      placement.rotation,
      bounds,
      Math.max(0.001, bounds.halfExtents.x * bounds.halfExtents.y * bounds.halfExtents.z * 8),
    );
  }

  if (source.kind === "trimesh") {
    return placedShape(
      createRapierTrimeshColliderDesc(source.vertices, source.indices),
      placement.offset,
      placement.rotation,
      meshBounds(source.vertices),
      1,
    );
  }

  const rows = source.heights.length;
  const columns = source.heights[0]?.length ?? 0;
  if (rows < 2 || columns < 2 || source.heights.some((row) => row.length !== columns)) {
    throw new Error("A heightfield must be a rectangular grid of at least 2 x 2 samples");
  }
  const elementSize = positive(source.elementSize, "Heightfield element size");
  const heights = new Float32Array(rows * columns);
  let minimumHeight = MAX_AABB;
  let maximumHeight = -MAX_AABB;
  for (let x = 0; x < columns; x += 1) {
    for (let z = 0; z < rows; z += 1) {
      const height = finite(source.heights[z][x], "Heightfield sample");
      heights[x * rows + z] = height;
      minimumHeight = Math.min(minimumHeight, height);
      maximumHeight = Math.max(maximumHeight, height);
    }
  }

  const width = (columns - 1) * elementSize;
  const depth = (rows - 1) * elementSize;
  const centerOffset = rotateVector({ x: width / 2, y: 0, z: depth / 2 }, placement.rotation);
  const nativeOffset = {
    x: placement.offset.x + centerOffset.x,
    y: placement.offset.y + centerOffset.y,
    z: placement.offset.z + centerOffset.z,
  };
  return placedShape(
    RAPIER.ColliderDesc.heightfield(
      rows - 1,
      columns - 1,
      heights,
      { x: width, y: 1, z: depth },
      RAPIER.HeightFieldFlags.FIX_INTERNAL_EDGES,
    ),
    nativeOffset,
    placement.rotation,
    {
      kind: "finite",
      center: { x: 0, y: (minimumHeight + maximumHeight) / 2, z: 0 },
      halfExtents: { x: width / 2, y: (maximumHeight - minimumHeight) / 2, z: depth / 2 },
    },
    1,
  );
}

function meshBounds(vertices: ArrayLike<number>): Extract<ShapeBounds, { kind: "finite" }> {
  if (vertices.length < 9 || vertices.length % 3 !== 0) {
    throw new Error("Mesh collider vertices must contain at least three complete xyz triples");
  }
  let minX = MAX_AABB;
  let minY = MAX_AABB;
  let minZ = MAX_AABB;
  let maxX = -MAX_AABB;
  let maxY = -MAX_AABB;
  let maxZ = -MAX_AABB;
  for (let index = 0; index < vertices.length; index += 3) {
    const x = finite(vertices[index], `Mesh vertex ${index / 3} x`);
    const y = finite(vertices[index + 1], `Mesh vertex ${index / 3} y`);
    const z = finite(vertices[index + 2], `Mesh vertex ${index / 3} z`);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return {
    kind: "finite",
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
    halfExtents: {
      x: Math.max(0.001, (maxX - minX) / 2),
      y: Math.max(0.001, (maxY - minY) / 2),
      z: Math.max(0.001, (maxZ - minZ) / 2),
    },
  };
}

function placedShape(
  descriptor: ColliderDesc,
  offset: PhysicsVector3,
  rotation: PhysicsQuaternion,
  bounds: ShapeBounds,
  massWeight: number,
): PreparedShape {
  descriptor.setTranslation(offset.x, offset.y, offset.z);
  descriptor.setRotation(rotation);
  return { descriptor, bounds, massWeight };
}

function preparePlacement(source: PhysicsShapeDefinition): { offset: PhysicsVector3; rotation: PhysicsQuaternion } {
  const offset = source.offset ?? { x: 0, y: 0, z: 0 };
  assertVector(offset, "Shape offset");
  return {
    offset: { x: offset.x, y: offset.y, z: offset.z },
    rotation: normalizeQuaternion(source.rotation ?? IDENTITY_ROTATION, "Shape rotation"),
  };
}

function frustumVertices(radiusTop: number, radiusBottom: number, height: number, segments: number): Float32Array {
  const vertices = new Float32Array(segments * 2 * 3);
  for (let index = 0; index < segments; index += 1) {
    const angle = index * Math.PI * 2 / segments;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const bottom = index * 6;
    vertices[bottom] = cosine * radiusBottom;
    vertices[bottom + 1] = -height / 2;
    vertices[bottom + 2] = sine * radiusBottom;
    vertices[bottom + 3] = cosine * radiusTop;
    vertices[bottom + 4] = height / 2;
    vertices[bottom + 5] = sine * radiusTop;
  }
  return vertices;
}

function unionFiniteAabb(collider: Collider, bounds: FiniteShapeBounds, out: PhysicsAabb): void {
  const translation = collider.translation();
  const rotation = collider.rotation();
  const centerOffset = rotateVector(bounds.center, rotation);
  const center = {
    x: translation.x + centerOffset.x,
    y: translation.y + centerOffset.y,
    z: translation.z + centerOffset.z,
  };
  const matrix = quaternionAbsoluteMatrix(rotation);
  const extent = {
    x: matrix[0] * bounds.halfExtents.x + matrix[1] * bounds.halfExtents.y + matrix[2] * bounds.halfExtents.z,
    y: matrix[3] * bounds.halfExtents.x + matrix[4] * bounds.halfExtents.y + matrix[5] * bounds.halfExtents.z,
    z: matrix[6] * bounds.halfExtents.x + matrix[7] * bounds.halfExtents.y + matrix[8] * bounds.halfExtents.z,
  };
  unionRange(out, center.x - extent.x, center.y - extent.y, center.z - extent.z, center.x + extent.x, center.y + extent.y, center.z + extent.z);
}

function unionPlaneAabb(collider: Collider, out: PhysicsAabb): void {
  const position = collider.translation();
  const normal = rotateVector({ x: 0, y: 1, z: 0 }, collider.rotation());
  let minX = -MAX_AABB;
  let minY = -MAX_AABB;
  let minZ = -MAX_AABB;
  let maxX = MAX_AABB;
  let maxY = MAX_AABB;
  let maxZ = MAX_AABB;

  if (Math.abs(normal.x - 1) <= PLANE_AXIS_EPSILON) maxX = position.x;
  else if (Math.abs(normal.x + 1) <= PLANE_AXIS_EPSILON) minX = position.x;
  if (Math.abs(normal.y - 1) <= PLANE_AXIS_EPSILON) maxY = position.y;
  else if (Math.abs(normal.y + 1) <= PLANE_AXIS_EPSILON) minY = position.y;
  if (Math.abs(normal.z - 1) <= PLANE_AXIS_EPSILON) maxZ = position.z;
  else if (Math.abs(normal.z + 1) <= PLANE_AXIS_EPSILON) minZ = position.z;

  unionRange(out, minX, minY, minZ, maxX, maxY, maxZ);
}

function unionRange(
  out: PhysicsAabb,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): void {
  out.min.x = Math.min(out.min.x, minX);
  out.min.y = Math.min(out.min.y, minY);
  out.min.z = Math.min(out.min.z, minZ);
  out.max.x = Math.max(out.max.x, maxX);
  out.max.y = Math.max(out.max.y, maxY);
  out.max.z = Math.max(out.max.z, maxZ);
}

function quaternionAbsoluteMatrix(source: PhysicsQuaternion): readonly number[] {
  const q = normalizeQuaternion(source, "Collider rotation");
  const xx = q.x * q.x;
  const yy = q.y * q.y;
  const zz = q.z * q.z;
  const xy = q.x * q.y;
  const xz = q.x * q.z;
  const yz = q.y * q.z;
  const wx = q.w * q.x;
  const wy = q.w * q.y;
  const wz = q.w * q.z;
  return [
    Math.abs(1 - 2 * (yy + zz)), Math.abs(2 * (xy - wz)), Math.abs(2 * (xz + wy)),
    Math.abs(2 * (xy + wz)), Math.abs(1 - 2 * (xx + zz)), Math.abs(2 * (yz - wx)),
    Math.abs(2 * (xz - wy)), Math.abs(2 * (yz + wx)), Math.abs(1 - 2 * (xx + yy)),
  ];
}

function rotateVector(source: PhysicsVector3, rotation: PhysicsQuaternion): PhysicsVector3 {
  const q = normalizeQuaternion(rotation, "Rotation");
  const tx = 2 * (q.y * source.z - q.z * source.y);
  const ty = 2 * (q.z * source.x - q.x * source.z);
  const tz = 2 * (q.x * source.y - q.y * source.x);
  return {
    x: source.x + q.w * tx + (q.y * tz - q.z * ty),
    y: source.y + q.w * ty + (q.z * tx - q.x * tz),
    z: source.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

function normalizeTransform(source: PhysicsTransform): PhysicsTransform {
  assertVector(source.position, "Body position");
  return {
    position: { x: source.position.x, y: source.position.y, z: source.position.z },
    rotation: normalizeQuaternion(source.rotation, "Body rotation"),
  };
}

function normalizeQuaternion(source: PhysicsQuaternion, label: string): PhysicsQuaternion {
  assertQuaternion(source, label);
  const length = Math.hypot(source.x, source.y, source.z, source.w);
  if (length === 0) throw new Error(`${label} cannot be zero`);
  return { x: source.x / length, y: source.y / length, z: source.z / length, w: source.w / length };
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

function assertVector(source: PhysicsVector3, label: string): void {
  finite(source.x, `${label} X`);
  finite(source.y, `${label} Y`);
  finite(source.z, `${label} Z`);
}

function assertQuaternion(source: PhysicsQuaternion, label: string): void {
  assertVector(source, label);
  finite(source.w, `${label} W`);
}

function toRapierVector(source: PhysicsVector3): { x: number; y: number; z: number } {
  return { x: source.x, y: source.y, z: source.z };
}

function copyVector(source: PhysicsVector3, target: PhysicsVector3): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
}

function copyQuaternion(source: PhysicsQuaternion, target: PhysicsQuaternion): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
  target.w = source.w;
}

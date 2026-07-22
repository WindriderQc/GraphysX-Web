import type RAPIER_TYPES from "@dimforge/rapier3d-compat";
import { Mesh, Quaternion, Vector3 } from "three";
import RAPIER from "../physics/rapier-runtime";
import {
  castRapierSegmentClosest,
  createRapierRaceVehicleController,
  createRapierRevoluteJointData,
  createRapierSphericalJointData,
  createRapierTrimeshColliderDesc,
  hasRapierSupportContact,
  type RapierRaceVehicleDefinition,
  type RapierSegmentCastOptions,
  type RapierSegmentHit
} from "../physics/rapier-race-primitives";

const FIXED_TIME_STEP = 1 / 60;
const MAX_SUB_STEPS = 4;
const DEFAULT_FRICTION = 0.18;
const DEFAULT_RESTITUTION = 0.28;
const IDENTITY_ROTATION: RAPIER_TYPES.Rotation = { x: 0, y: 0, z: 0, w: 1 };

export type PhysicsBodyMode = "dynamic" | "fixed" | "kinematic";

export interface PhysicsBodyOptions {
  colliderOffset?: Vector3;
  rotation?: Quaternion;
  linearDamping?: number;
  angularDamping?: number;
  allowSleep?: boolean;
  collisionEnabled?: boolean;
  /** Keep the body's centre of mass at its origin even when the collider is offset. */
  massAtBodyOrigin?: boolean;
}

/** Race-only Rapier body. Engine objects stay grouped so teardown cannot orphan colliders. */
export class PhysicsBody {
  constructor(
    readonly rigidBody: RAPIER_TYPES.RigidBody,
    readonly colliders: readonly RAPIER_TYPES.Collider[]
  ) {}

  get id(): number {
    return this.rigidBody.handle;
  }
}

export type PhysicsConstraint = RAPIER_TYPES.ImpulseJoint;
export type PhysicsVehicle = RAPIER_TYPES.DynamicRayCastVehicleController;

export class PhysicsWorld {
  readonly world: RAPIER_TYPES.World;
  private readonly bodies = new Set<PhysicsBody>();
  private readonly vehicles = new Map<PhysicsVehicle, PhysicsBody>();
  private readonly forcedBodies = new Set<PhysicsBody>();
  private accumulator = 0;
  private disposed = false;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -18, z: 0 });
  }

  addGround(): PhysicsBody {
    // RaceScene does not currently call this. A broad fixed slab preserves its historical
    // horizontal-plane behavior without introducing special-case infinite-shape queries.
    return this.addStaticBox(new Vector3(0, -0.5, 0), new Vector3(1_000, 0.5, 1_000));
  }

  addStaticBox(position: Vector3, halfExtents: Vector3, options: PhysicsBodyOptions = {}): PhysicsBody {
    return this.createBody(
      "fixed",
      position,
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z),
      0,
      options
    );
  }

  addKinematicBox(position: Vector3, halfExtents: Vector3, options: PhysicsBodyOptions = {}): PhysicsBody {
    return this.createBody(
      "kinematic",
      position,
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z),
      0,
      options
    );
  }

  addStaticTrimesh(position: Vector3, vertices: readonly number[], indices: readonly number[]): PhysicsBody {
    return this.createBody("fixed", position, createRapierTrimeshColliderDesc(vertices, indices), 0);
  }

  addKinematicTrimesh(position: Vector3, vertices: readonly number[], indices: readonly number[]): PhysicsBody {
    return this.createBody("kinematic", position, createRapierTrimeshColliderDesc(vertices, indices), 0);
  }

  addDynamicBox(
    position: Vector3,
    halfExtents: Vector3,
    mass: number,
    options: PhysicsBodyOptions = {}
  ): PhysicsBody {
    const originInertia = options.massAtBodyOrigin
      ? new Vector3(
          mass / 3 * (halfExtents.y ** 2 + halfExtents.z ** 2),
          mass / 3 * (halfExtents.x ** 2 + halfExtents.z ** 2),
          mass / 3 * (halfExtents.x ** 2 + halfExtents.y ** 2)
        )
      : undefined;
    return this.createBody(
      "dynamic",
      position,
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z),
      mass,
      { linearDamping: 0.08, angularDamping: 0.08, ...options },
      originInertia
    );
  }

  addDynamicSphere(
    position: Vector3,
    radius: number,
    mass: number,
    options: PhysicsBodyOptions = {}
  ): PhysicsBody {
    const originInertia = options.massAtBodyOrigin
      ? new Vector3(2 / 5 * mass * radius ** 2, 2 / 5 * mass * radius ** 2, 2 / 5 * mass * radius ** 2)
      : undefined;
    return this.createBody("dynamic", position, RAPIER.ColliderDesc.ball(radius), mass, {
      linearDamping: 0.58,
      angularDamping: 0.35,
      ...options
    }, originInertia);
  }

  removeBody(body: PhysicsBody): void {
    this.assertLive();
    if (!this.bodies.delete(body)) return;
    for (const [vehicle, chassis] of this.vehicles) {
      if (chassis === body) this.removeVehicle(vehicle);
    }
    this.forcedBodies.delete(body);
    if (body.rigidBody.isValid()) this.world.removeRigidBody(body.rigidBody);
  }

  addSphericalConstraint(
    first: PhysicsBody,
    second: PhysicsBody,
    anchorOnFirst: Vector3,
    anchorOnSecond: Vector3,
    wakeUp = true
  ): PhysicsConstraint {
    this.assertOwned(first);
    this.assertOwned(second);
    return this.world.createImpulseJoint(
      createRapierSphericalJointData(anchorOnFirst, anchorOnSecond),
      first.rigidBody,
      second.rigidBody,
      wakeUp
    );
  }

  addRevoluteConstraint(
    first: PhysicsBody,
    second: PhysicsBody,
    anchorOnFirst: Vector3,
    anchorOnSecond: Vector3,
    axis: Vector3,
    wakeUp = true
  ): PhysicsConstraint {
    this.assertOwned(first);
    this.assertOwned(second);
    return this.world.createImpulseJoint(
      createRapierRevoluteJointData(anchorOnFirst, anchorOnSecond, axis),
      first.rigidBody,
      second.rigidBody,
      wakeUp
    );
  }

  removeConstraint(constraint: PhysicsConstraint): void {
    this.assertLive();
    if (constraint.isValid()) this.world.removeImpulseJoint(constraint, true);
  }

  createVehicle(chassis: PhysicsBody, definition: RapierRaceVehicleDefinition): PhysicsVehicle {
    this.assertOwned(chassis);
    const controller = createRapierRaceVehicleController(this.world, chassis.rigidBody, definition);
    this.vehicles.set(controller, chassis);
    return controller;
  }

  removeVehicle(vehicle: PhysicsVehicle): void {
    this.assertLive();
    if (!this.vehicles.delete(vehicle)) return;
    this.world.removeVehicleController(vehicle);
  }

  step(deltaSeconds: number): void {
    this.assertLive();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.accumulator += deltaSeconds;
    let subSteps = 0;
    while (this.accumulator + Number.EPSILON >= FIXED_TIME_STEP && subSteps < MAX_SUB_STEPS) {
      for (const vehicle of this.vehicles.keys()) {
        vehicle.updateVehicle(FIXED_TIME_STEP, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
      }
      this.world.timestep = FIXED_TIME_STEP;
      this.world.step();
      // Rapier user forces persist. RaceScene applies them as one-step inputs, matching the
      // old gameplay contract, so clear them after every internal step (not once per frame).
      for (const body of this.forcedBodies) {
        if (!body.rigidBody.isValid()) continue;
        body.rigidBody.resetForces(false);
        body.rigidBody.resetTorques(false);
      }
      this.forcedBodies.clear();
      this.accumulator -= FIXED_TIME_STEP;
      subSteps += 1;
    }
    // Drop only excess whole steps after a hitch while retaining the fractional phase.
    this.accumulator %= FIXED_TIME_STEP;
  }

  setGravity(gravity: Vector3): void {
    this.assertLive();
    this.world.gravity = { x: gravity.x, y: gravity.y, z: gravity.z };
  }

  setBodyMode(body: PhysicsBody, mode: PhysicsBodyMode, collisionEnabled = true): void {
    this.assertOwned(body);
    const type = mode === "dynamic"
      ? RAPIER.RigidBodyType.Dynamic
      : mode === "kinematic"
        ? RAPIER.RigidBodyType.KinematicPositionBased
        : RAPIER.RigidBodyType.Fixed;
    body.rigidBody.setBodyType(type, true);
    for (const collider of body.colliders) collider.setEnabled(collisionEnabled);
  }

  setSphereRadius(body: PhysicsBody, radius: number): void {
    this.assertOwned(body);
    if (!Number.isFinite(radius) || radius <= 0) throw new Error(`Sphere radius must be positive; received ${radius}`);
    const collider = body.colliders[0];
    if (!collider || collider.shape.type !== RAPIER.ShapeType.Ball) {
      throw new Error("setSphereRadius requires a body whose first collider is a sphere");
    }
    collider.setShape(new RAPIER.Ball(radius));
    // Changing a collider shape does not refresh Rapier's cached mass/inertia tensor.
    body.rigidBody.recomputeMassPropertiesFromColliders();
    body.rigidBody.wakeUp();
  }

  writeTransform(body: PhysicsBody, position: Vector3, rotation: Quaternion, wakeUp = true): void {
    this.assertOwned(body);
    body.rigidBody.setTranslation(position, wakeUp);
    body.rigidBody.setRotation(rotation, wakeUp);
  }

  moveKinematicBody(body: PhysicsBody, position: Vector3, rotation: Quaternion): void {
    this.assertOwned(body);
    body.rigidBody.setNextKinematicTranslation(position);
    body.rigidBody.setNextKinematicRotation(rotation);
  }

  readPosition(body: PhysicsBody, out: Vector3): Vector3 {
    this.assertOwned(body);
    const value = body.rigidBody.translation();
    return out.set(value.x, value.y, value.z);
  }

  readRotation(body: PhysicsBody, out: Quaternion): Quaternion {
    this.assertOwned(body);
    const value = body.rigidBody.rotation();
    return out.set(value.x, value.y, value.z, value.w);
  }

  writeLinearVelocity(body: PhysicsBody, velocity: Vector3, wakeUp = true): void {
    this.assertOwned(body);
    body.rigidBody.setLinvel(velocity, wakeUp);
  }

  readLinearVelocity(body: PhysicsBody, out: Vector3): Vector3 {
    this.assertOwned(body);
    const value = body.rigidBody.linvel();
    return out.set(value.x, value.y, value.z);
  }

  writeAngularVelocity(body: PhysicsBody, velocity: Vector3, wakeUp = true): void {
    this.assertOwned(body);
    body.rigidBody.setAngvel(velocity, wakeUp);
  }

  readAngularVelocity(body: PhysicsBody, out: Vector3): Vector3 {
    this.assertOwned(body);
    const value = body.rigidBody.angvel();
    return out.set(value.x, value.y, value.z);
  }

  setDamping(body: PhysicsBody, linear: number, angular: number): void {
    this.assertOwned(body);
    body.rigidBody.setLinearDamping(linear);
    body.rigidBody.setAngularDamping(angular);
  }

  applyForce(body: PhysicsBody, force: Vector3, worldPoint?: Vector3): void {
    this.assertOwned(body);
    if (worldPoint) body.rigidBody.addForceAtPoint(force, worldPoint, true);
    else body.rigidBody.addForce(force, true);
    this.forcedBodies.add(body);
  }

  applyTorque(body: PhysicsBody, torque: Vector3): void {
    this.assertOwned(body);
    body.rigidBody.addTorque(torque, true);
    this.forcedBodies.add(body);
  }

  wakeBody(body: PhysicsBody): void {
    this.assertOwned(body);
    body.rigidBody.wakeUp();
  }

  isBodySleeping(body: PhysicsBody): boolean {
    this.assertOwned(body);
    return body.rigidBody.isSleeping();
  }

  isBodyGrounded(body: PhysicsBody, minimumUpNormal = 0.35): boolean {
    this.assertOwned(body);
    return hasRapierSupportContact(this.world, body.rigidBody, minimumUpNormal);
  }

  castSegmentClosest(
    start: Vector3,
    end: Vector3,
    options: Omit<RapierSegmentCastOptions, "excludeBody"> & { excludeBody?: PhysicsBody } = {}
  ): RapierSegmentHit | null {
    if (options.excludeBody) this.assertOwned(options.excludeBody);
    const { excludeBody, ...queryOptions } = options;
    return castRapierSegmentClosest(this.world, start, end, {
      ...queryOptions,
      excludeBody: excludeBody?.rigidBody
    });
  }

  dispose(): void {
    if (this.disposed) return;
    for (const vehicle of this.vehicles.keys()) this.world.removeVehicleController(vehicle);
    this.vehicles.clear();
    this.forcedBodies.clear();
    this.bodies.clear();
    this.world.free();
    this.disposed = true;
  }

  private createBody(
    mode: PhysicsBodyMode,
    position: Vector3,
    colliderDescriptor: RAPIER_TYPES.ColliderDesc,
    mass: number,
    options: PhysicsBodyOptions = {},
    originInertia?: Vector3
  ): PhysicsBody {
    this.assertLive();
    const bodyDescriptor = mode === "dynamic"
      ? RAPIER.RigidBodyDesc.dynamic()
      : mode === "kinematic"
        ? RAPIER.RigidBodyDesc.kinematicPositionBased()
        : RAPIER.RigidBodyDesc.fixed();
    bodyDescriptor
      .setTranslation(position.x, position.y, position.z)
      .setRotation(options.rotation ?? IDENTITY_ROTATION)
      .setLinearDamping(options.linearDamping ?? 0)
      .setAngularDamping(options.angularDamping ?? 0)
      .setCanSleep(options.allowSleep ?? true);
    if (mode === "dynamic" && originInertia) {
      bodyDescriptor.setAdditionalMassProperties(
        mass,
        { x: 0, y: 0, z: 0 },
        originInertia,
        IDENTITY_ROTATION
      );
    }

    colliderDescriptor
      .setFriction(Math.sqrt(DEFAULT_FRICTION))
      .setRestitution(Math.sqrt(DEFAULT_RESTITUTION))
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      .setEnabled(options.collisionEnabled ?? true);
    if (options.colliderOffset) {
      colliderDescriptor.setTranslation(
        options.colliderOffset.x,
        options.colliderOffset.y,
        options.colliderOffset.z
      );
    }
    if (mode === "dynamic") {
      if (originInertia) colliderDescriptor.setDensity(0);
      else colliderDescriptor.setMass(mass);
    }

    const rigidBody = this.world.createRigidBody(bodyDescriptor);
    const collider = this.world.createCollider(colliderDescriptor, rigidBody);
    if (originInertia) rigidBody.recomputeMassPropertiesFromColliders();
    const body = new PhysicsBody(rigidBody, [collider]);
    this.bodies.add(body);
    return body;
  }

  private assertOwned(body: PhysicsBody): void {
    this.assertLive();
    if (!this.bodies.has(body) || !body.rigidBody.isValid()) {
      throw new Error("Physics body is removed or belongs to another RaceScene world");
    }
  }

  private assertLive(): void {
    if (this.disposed) throw new Error("RaceScene physics world has been disposed");
  }
}

export function syncBodyToMesh(body: PhysicsBody, mesh: Mesh): void {
  const position = body.rigidBody.translation();
  const rotation = body.rigidBody.rotation();
  mesh.position.set(position.x, position.y, position.z);
  mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
}

export function setBodyTransform(body: PhysicsBody, position: Vector3): void {
  body.rigidBody.setTranslation(position, true);
  body.rigidBody.setRotation(IDENTITY_ROTATION, true);
  body.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

import type RAPIER_TYPES from "@dimforge/rapier3d-compat";
import RAPIER from "./rapier-runtime";

/**
 * Rapier-specific building blocks for the legacy RaceScene migration.
 *
 * AgentWorld intentionally exposes opaque engine-neutral handles. RaceScene has a wider physics
 * surface (triangle meshes, joints, contact normals, scene queries, and a ray-cast vehicle), so
 * these helpers live on the Rapier side of that boundary instead of expanding the shared adapter
 * with race-only concepts.
 */

export interface RaceVector3 {
  x: number;
  y: number;
  z: number;
}

export interface RapierMeshColliderData {
  vertices: Float32Array;
  indices: Uint32Array;
}

export interface RapierSegmentCastOptions {
  solid?: boolean;
  skipBackfaces?: boolean;
  filterFlags?: RAPIER_TYPES.QueryFilterFlags;
  filterGroups?: RAPIER_TYPES.InteractionGroups;
  excludeCollider?: RAPIER_TYPES.Collider;
  excludeBody?: RAPIER_TYPES.RigidBody;
  filterPredicate?: (collider: RAPIER_TYPES.Collider) => boolean;
}

export interface RapierSegmentHit {
  collider: RAPIER_TYPES.Collider;
  body: RAPIER_TYPES.RigidBody | null;
  point: RaceVector3;
  normal: RaceVector3;
  distance: number;
  featureId: number | undefined;
}

export interface RapierRaceWheelDefinition {
  connection: RaceVector3;
  radius: number;
  suspensionDirection?: RaceVector3;
  axle?: RaceVector3;
  suspensionRestLength?: number;
  suspensionTravel?: number;
  suspensionStiffness?: number;
  suspensionCompression?: number;
  suspensionRelaxation?: number;
  suspensionMaxForce?: number;
  frictionSlip?: number;
  sideFrictionStiffness?: number;
}

export interface RapierRaceVehicleDefinition {
  upAxis?: 0 | 1 | 2;
  forwardAxis?: 0 | 1 | 2;
  wheels: readonly RapierRaceWheelDefinition[];
}

export interface RapierWheelSample {
  hardPoint: RaceVector3 | null;
  contactPoint: RaceVector3 | null;
  contactNormal: RaceVector3 | null;
  suspensionLength: number | null;
  steering: number | null;
  rotation: number | null;
  inContact: boolean;
}

/** Convert archive mesh arrays once at collider construction time, with useful data errors. */
export function createRapierMeshColliderData(
  vertices: readonly number[],
  indices: readonly number[]
): RapierMeshColliderData {
  if (vertices.length === 0 || vertices.length % 3 !== 0) {
    throw new Error(`Rapier mesh vertices must contain complete xyz triples; received ${vertices.length} values`);
  }
  if (indices.length === 0 || indices.length % 3 !== 0) {
    throw new Error(`Rapier mesh indices must contain complete triangles; received ${indices.length} values`);
  }

  const vertexCount = vertices.length / 3;
  const typedVertices = new Float32Array(vertices.length);
  for (let index = 0; index < vertices.length; index += 1) {
    const value = vertices[index];
    if (!Number.isFinite(value)) {
      throw new Error(`Rapier mesh vertex ${index} is not finite`);
    }
    typedVertices[index] = value;
  }

  const typedIndices = new Uint32Array(indices.length);
  for (let index = 0; index < indices.length; index += 1) {
    const value = indices[index];
    if (!Number.isInteger(value) || value < 0 || value >= vertexCount) {
      throw new Error(`Rapier mesh index ${index} (${String(value)}) is outside 0..${vertexCount - 1}`);
    }
    typedIndices[index] = value;
  }

  return { vertices: typedVertices, indices: typedIndices };
}

/**
 * Build a fixed/kinematic race collider from a decoded archive triangle mesh.
 *
 * RaceScene currently uses every trimesh as a non-dynamic environment collider. Internal-edge
 * correction is enabled because the player sphere and ray-cast vehicle cross dense triangle seams.
 */
export function createRapierTrimeshColliderDesc(
  vertices: readonly number[],
  indices: readonly number[],
  flags: RAPIER.TriMeshFlags =
    RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES |
    RAPIER.TriMeshFlags.MERGE_DUPLICATE_VERTICES |
    RAPIER.TriMeshFlags.DELETE_DEGENERATE_TRIANGLES
): RAPIER.ColliderDesc {
  const data = createRapierMeshColliderData(vertices, indices);
  return RAPIER.ColliderDesc.trimesh(data.vertices, data.indices, flags);
}

/** Convex hulls are the supported Rapier fallback for any future moving mesh collider. */
export function createRapierConvexHullColliderDesc(vertices: readonly number[]): RAPIER.ColliderDesc {
  if (vertices.length === 0 || vertices.length % 3 !== 0) {
    throw new Error(`Rapier convex-hull vertices must contain complete xyz triples; received ${vertices.length} values`);
  }
  const points = new Float32Array(vertices);
  const desc = RAPIER.ColliderDesc.convexHull(points);
  if (!desc) {
    throw new Error("Rapier could not construct a convex hull from the supplied vertices");
  }
  return desc;
}

/**
 * Cast a finite segment and return the nearest accepted hit.
 *
 * Using `intersectionsWithRay` instead of `castRayAndGetNormal` preserves Cannon's
 * `skipBackfaces` camera behavior while still allowing body/collider exclusion in one query.
 */
export function castRapierSegmentClosest(
  world: RAPIER.World,
  start: RaceVector3,
  end: RaceVector3,
  options: RapierSegmentCastOptions = {}
): RapierSegmentHit | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= Number.EPSILON) return null;

  const direction = { x: dx / distance, y: dy / distance, z: dz / distance };
  const ray = new RAPIER.Ray(start, direction);
  let closest: RAPIER.RayColliderIntersection | null = null;

  world.intersectionsWithRay(
    ray,
    distance,
    options.solid ?? true,
    (intersection) => {
      const backface =
        direction.x * intersection.normal.x +
          direction.y * intersection.normal.y +
          direction.z * intersection.normal.z >=
        0;
      if ((!options.skipBackfaces || !backface) && (!closest || intersection.timeOfImpact < closest.timeOfImpact)) {
        closest = intersection;
      }
      return true;
    },
    options.filterFlags,
    options.filterGroups,
    options.excludeCollider,
    options.excludeBody,
    options.filterPredicate
  );

  if (!closest) return null;
  const hit = closest as RAPIER.RayColliderIntersection;
  const point = ray.pointAt(hit.timeOfImpact);
  return {
    collider: hit.collider,
    body: hit.collider.parent(),
    point: { x: point.x, y: point.y, z: point.z },
    normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
    distance: hit.timeOfImpact,
    featureId: hit.featureId
  };
}

/** Contact-normal equivalent of RaceScene's current `world.contacts` grounded test. */
export function hasRapierSupportContact(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  minimumUpNormal = 0.35
): boolean {
  for (let colliderIndex = 0; colliderIndex < body.numColliders(); colliderIndex += 1) {
    const bodyCollider = body.collider(colliderIndex);
    let supported = false;
    world.contactPairsWith(bodyCollider, (otherCollider) => {
      if (supported) return;
      world.contactPair(bodyCollider, otherCollider, (manifold, flipped) => {
        if (supported || manifold.numContacts() === 0) return;
        const normal = manifold.normal();
        // Rapier exposes the stored manifold orientation plus `flipped`. Normalize it so this
        // is always the surface normal pointing into the queried body.
        const supportNormalY = flipped ? normal.y : -normal.y;
        supported = supportNormalY > minimumUpNormal;
      });
    });
    if (supported) return true;
  }
  return false;
}

/** Configure Rapier's wheel-less ray-cast vehicle controller from archive wheel offsets. */
export function createRapierRaceVehicleController(
  world: RAPIER_TYPES.World,
  chassis: RAPIER_TYPES.RigidBody,
  definition: RapierRaceVehicleDefinition
): RAPIER_TYPES.DynamicRayCastVehicleController {
  const controller = world.createVehicleController(chassis);
  controller.indexUpAxis = definition.upAxis ?? 1;
  controller.setIndexForwardAxis = definition.forwardAxis ?? 2;

  for (const wheel of definition.wheels) {
    const wheelIndex = controller.numWheels();
    controller.addWheel(
      wheel.connection,
      wheel.suspensionDirection ?? { x: 0, y: -1, z: 0 },
      wheel.axle ?? { x: 1, y: 0, z: 0 },
      wheel.suspensionRestLength ?? 0.22,
      wheel.radius
    );
    controller.setWheelMaxSuspensionTravel(wheelIndex, wheel.suspensionTravel ?? 0.24);
    controller.setWheelSuspensionStiffness(wheelIndex, wheel.suspensionStiffness ?? 28);
    controller.setWheelSuspensionCompression(wheelIndex, wheel.suspensionCompression ?? 4.4);
    controller.setWheelSuspensionRelaxation(wheelIndex, wheel.suspensionRelaxation ?? 5.2);
    controller.setWheelMaxSuspensionForce(wheelIndex, wheel.suspensionMaxForce ?? 6_000);
    controller.setWheelFrictionSlip(wheelIndex, wheel.frictionSlip ?? 1.8);
    controller.setWheelSideFrictionStiffness(wheelIndex, wheel.sideFrictionStiffness ?? 1);
  }

  return controller;
}

/** Read the controller state needed to place a visual wheel; no wheel rigid-body is created. */
export function readRapierWheelSample(
  controller: RAPIER_TYPES.DynamicRayCastVehicleController,
  wheelIndex: number
): RapierWheelSample {
  return {
    hardPoint: copyVector(controller.wheelHardPoint(wheelIndex)),
    contactPoint: copyVector(controller.wheelContactPoint(wheelIndex)),
    contactNormal: copyVector(controller.wheelContactNormal(wheelIndex)),
    suspensionLength: controller.wheelSuspensionLength(wheelIndex),
    steering: controller.wheelSteering(wheelIndex),
    rotation: controller.wheelRotation(wheelIndex),
    inContact: controller.wheelIsInContact(wheelIndex)
  };
}

/** Exact-distance chain replacement: coincident local anchors preserve the authored link spacing. */
export function createRapierSphericalJointData(
  anchorOnFirst: RaceVector3,
  anchorOnSecond: RaceVector3
): RAPIER_TYPES.JointData {
  return RAPIER.JointData.spherical(anchorOnFirst, anchorOnSecond);
}

/** Aligned Cannon hinge replacement used by the physics-lab seesaw. */
export function createRapierRevoluteJointData(
  anchorOnFirst: RaceVector3,
  anchorOnSecond: RaceVector3,
  axis: RaceVector3
): RAPIER_TYPES.JointData {
  return RAPIER.JointData.revolute(anchorOnFirst, anchorOnSecond, axis);
}

function copyVector(value: RAPIER_TYPES.Vector | null): RaceVector3 | null {
  return value ? { x: value.x, y: value.y, z: value.z } : null;
}

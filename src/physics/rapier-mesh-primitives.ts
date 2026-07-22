import type RAPIER_TYPES from "@dimforge/rapier3d-compat";
import RAPIER from "./rapier-runtime";

export interface RapierMeshColliderData {
  vertices: Float32Array;
  indices: Uint32Array;
}

export const MAX_RAPIER_MESH_VERTICES = 100_000;
export const MAX_RAPIER_MESH_TRIANGLES = 100_000;
export const MAX_RAPIER_CONVEX_HULL_VERTICES = 8_192;

/** Convert authored mesh arrays once at collider construction time, with useful data errors. */
export function createRapierMeshColliderData(
  vertices: readonly number[],
  indices: readonly number[],
): RapierMeshColliderData {
  if (vertices.length === 0 || vertices.length % 3 !== 0) {
    throw new Error(`Rapier mesh vertices must contain complete xyz triples; received ${vertices.length} values`);
  }
  if (indices.length === 0 || indices.length % 3 !== 0) {
    throw new Error(`Rapier mesh indices must contain complete triangles; received ${indices.length} values`);
  }

  const vertexCount = vertices.length / 3;
  const triangleCount = indices.length / 3;
  if (vertexCount > MAX_RAPIER_MESH_VERTICES || triangleCount > MAX_RAPIER_MESH_TRIANGLES) {
    throw new Error(
      `Rapier meshes support at most ${MAX_RAPIER_MESH_VERTICES} vertices and ` +
      `${MAX_RAPIER_MESH_TRIANGLES} triangles; received ${vertexCount} vertices and ${triangleCount} triangles`,
    );
  }
  const typedVertices = new Float32Array(vertices.length);
  for (let index = 0; index < vertices.length; index += 1) {
    const value = vertices[index];
    if (!Number.isFinite(value)) throw new Error(`Rapier mesh vertex ${index} is not finite`);
    typedVertices[index] = value;
    if (!Number.isFinite(typedVertices[index])) {
      throw new Error(`Rapier mesh vertex ${index} is outside the finite Float32 coordinate range`);
    }
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

export function createRapierTrimeshColliderDesc(
  vertices: readonly number[],
  indices: readonly number[],
  flags: RAPIER_TYPES.TriMeshFlags =
    RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES |
    RAPIER.TriMeshFlags.MERGE_DUPLICATE_VERTICES |
    RAPIER.TriMeshFlags.DELETE_DEGENERATE_TRIANGLES,
): RAPIER_TYPES.ColliderDesc {
  const data = createRapierMeshColliderData(vertices, indices);
  return RAPIER.ColliderDesc.trimesh(data.vertices, data.indices, flags);
}

export function createRapierConvexHullColliderDesc(vertices: readonly number[]): RAPIER_TYPES.ColliderDesc {
  if (vertices.length < 12 || vertices.length % 3 !== 0) {
    throw new Error(`Rapier convex-hull vertices need at least four complete xyz triples; received ${vertices.length} values`);
  }
  if (vertices.length / 3 > MAX_RAPIER_CONVEX_HULL_VERTICES) {
    throw new Error(`Rapier convex hulls support at most ${MAX_RAPIER_CONVEX_HULL_VERTICES} input vertices`);
  }
  const points = new Float32Array(vertices);
  for (let index = 0; index < points.length; index += 1) {
    if (!Number.isFinite(points[index])) throw new Error(`Rapier convex-hull vertex ${index} is not finite`);
  }
  const descriptor = RAPIER.ColliderDesc.convexHull(points);
  if (!descriptor) throw new Error("Rapier could not construct a convex hull from the supplied vertices");
  return descriptor;
}

// Portable authored buffers. Shared by the document boundary and browser before allocation.
export const MESH_FIELDS = Object.freeze(["positions", "indices", "normals", "uvs", "groups", "materials"]);
export const MESH_GROUP_FIELDS = Object.freeze(["start", "count", "materialIndex"]);
export const PIXEL_FIELDS = Object.freeze(["width", "height", "rgba"]);
export const MESH_LIMITS = Object.freeze({ vertices: 4096, triangles: 8192, materials: 8, groups: 128, bytes: 128 * 1024, coordinate: 10_000, sceneVertices: 32768, sceneTriangles: 65536 });
export const PIXEL_LIMITS = Object.freeze({ dimension: 64, channel: 255 });

function record(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!fields.includes(key)) throw new Error(`Unsupported ${label}.${key}`);
}
function array(value, label, min, max, stride, bound) {
  if (!Array.isArray(value) || value.length < min || value.length > max || value.length % stride !== 0) throw new Error(`${label} has an invalid length (stride ${stride}, maximum ${max})`);
  for (const number of value) if (!Number.isFinite(number) || Math.abs(number) > bound) throw new Error(`${label} must contain finite bounded numbers`);
}

export function assertInlinePixels(value, label = "texture.pixels") {
  record(value, PIXEL_FIELDS, label);
  for (const key of ["width", "height"]) if (!Number.isInteger(value[key]) || value[key] < 1 || value[key] > PIXEL_LIMITS.dimension) throw new Error(`${label}.${key} must be an integer from 1 to ${PIXEL_LIMITS.dimension}`);
  array(value.rgba, `${label}.rgba`, value.width * value.height * 4, value.width * value.height * 4, 4, PIXEL_LIMITS.channel);
  for (const channel of value.rgba) if (!Number.isInteger(channel) || channel < 0) throw new Error(`${label}.rgba must contain unsigned bytes`);
}

export function assertInlineMesh(value, label = "mesh") {
  record(value, MESH_FIELDS, label);
  array(value.positions, `${label}.positions`, 9, MESH_LIMITS.vertices * 3, 3, MESH_LIMITS.coordinate);
  const vertices = value.positions.length / 3;
  array(value.indices, `${label}.indices`, 3, MESH_LIMITS.triangles * 3, 3, vertices - 1);
  for (const index of value.indices) if (!Number.isInteger(index) || index < 0) throw new Error(`${label}.indices must be unsigned integer vertex indices`);
  if (value.normals !== undefined) {
    array(value.normals, `${label}.normals`, vertices * 3, vertices * 3, 3, 1);
    for (let i = 0; i < value.normals.length; i += 3) if (Math.hypot(...value.normals.slice(i, i + 3)) < 0.0001) throw new Error(`${label}.normals must be nonzero`);
  }
  if (value.uvs !== undefined) array(value.uvs, `${label}.uvs`, vertices * 2, vertices * 2, 2, 128);
  for (let i = 0; i < value.indices.length; i += 3) {
    const [a, b, c] = value.indices.slice(i, i + 3).map(index => index * 3);
    const p = value.positions;
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    if (Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]) === 0) throw new Error(`${label} contains a degenerate triangle at ${i / 3}`);
  }
  const materials = value.materials?.length ?? 1;
  if (value.materials !== undefined && (!Array.isArray(value.materials) || materials < 1 || materials > MESH_LIMITS.materials)) throw new Error(`${label}.materials supports 1 to ${MESH_LIMITS.materials} materials`);
  if (value.groups !== undefined) {
    if (!Array.isArray(value.groups) || !value.groups.length || value.groups.length > MESH_LIMITS.groups) throw new Error(`${label}.groups is too large or empty`);
    let end = 0;
    for (const group of value.groups) {
      record(group, MESH_GROUP_FIELDS, `${label}.group`);
      if (group.start !== end || !Number.isInteger(group.count) || group.count <= 0 || group.count % 3 || !Number.isInteger(group.materialIndex) || group.materialIndex < 0 || group.materialIndex >= materials) throw new Error(`${label}.groups must partition triangles in order with valid material indices`);
      end += group.count;
    }
    if (end !== value.indices.length) throw new Error(`${label}.groups must cover every triangle exactly once`);
  } else if (materials > 1) throw new Error(`${label}.materials requires triangle groups`);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MESH_LIMITS.bytes) throw new Error(`${label} exceeds ${MESH_LIMITS.bytes} bytes`);
}

export function assertMeshSceneBudget(entities) {
  let vertices = 0, triangles = 0;
  for (const entity of entities) if (entity.type === "mesh" && entity.mesh) {
    vertices += entity.mesh.positions.length / 3;
    triangles += entity.mesh.indices.length / 3;
  }
  if (vertices > MESH_LIMITS.sceneVertices || triangles > MESH_LIMITS.sceneTriangles) throw new Error("Inline meshes exceed the scene geometry budget");
}

export function assertMeshTextureCoordinates(mesh, material) {
  const textured = [material, ...(mesh.materials ?? [])].some(entry => entry?.texture || entry?.normalTexture || entry?.shader?.specularTexture);
  if (textured && !mesh.uvs) throw new Error("Textured inline meshes require one UV pair per vertex");
}

/** Preserve CAD normals while removing degenerate faces and repairing cancelled normals.
 * LDraw smoothing can cancel opposing face normals. Normalizing that zero vector in PBR
 * creates NaNs which spread through bloom as a black rectangle, without a WebGL error.
 */
export function serializeKidxGeometry(geometry) {
  const positions = Array.from(geometry.attributes.position.array, (v) => +v.toFixed(5));
  const normals = Array.from(geometry.attributes.normal.array, (v) => +v.toFixed(4));
  const source = geometry.index.array;
  const indices = [];
  for (let i = 0; i < source.length; i += 3) {
    const [a, b, c] = [source[i], source[i + 1], source[i + 2]].map((v) => v * 3);
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const face = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(...face);
    if (length < 1e-12) continue;
    for (const offset of [a, b, c]) {
      if (Math.hypot(...normals.slice(offset, offset + 3)) < .5) {
        for (let axis = 0; axis < 3; axis++) normals[offset + axis] = +(face[axis] / length).toFixed(4);
      }
    }
    indices.push(source[i], source[i + 1], source[i + 2]);
  }
  return { positions, normals, indices };
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const sourceSha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function meshBounds(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  positions.forEach((value, index) => { min[index % 3] = Math.min(min[index % 3], value); max[index % 3] = Math.max(max[index % 3], value); });
  return { min, max, size: min.map((value, index) => max[index] - value) };
}

/** Counted TV3D mesh layout; do not scan arbitrary vertex bytes for chunk-like strings. */
export function decodeImprezaTvm(bytes, source) {
  assert.ok(bytes.length >= 16, "Truncated TVM header");
  assert.equal(bytes.toString("latin1", 0, 3), "!Dd", "Unsupported TVM magic");
  assert.equal(bytes.readUInt32LE(12), 16, "Unsupported TVM chunk start");
  const chunks = []; let offset = 16, ended = false;
  while (offset + 8 <= bytes.length) {
    const tag = bytes.toString("latin1", offset, offset + 4), size = bytes.readUInt32LE(offset + 4), start = offset + 8;
    assert.ok(start + size <= bytes.length, "Truncated TVM chunk");
    chunks.push({ tag, size, start }); offset = start + size;
    if (tag === "MEND") { assert.equal(size, 0); ended = true; break; }
  }
  assert.ok(ended, "Missing TVM end");
  const one = tag => { const matches = chunks.filter(chunk => chunk.tag === tag); assert.equal(matches.length, 1, `Expected one ${tag}`); return matches[0]; };
  const stats = one("MSTA"); assert.equal(stats.size, 28);
  const triangleCount = bytes.readUInt32LE(stats.start), materialCount = bytes.readUInt32LE(stats.start + 4), vertexCount = bytes.readUInt32LE(stats.start + 8), stride = bytes.readUInt32LE(stats.start + 24);
  assert.equal(stride, 32, "Unsupported TVM vertex stride");
  assert.ok(vertexCount > 0 && triangleCount > 0 && materialCount > 0);
  const vertices = one("MVER"), triangles = one("MI16"), attributes = one("MATT"), groupChunk = one("MGRO");
  assert.equal(vertices.size, vertexCount * stride, "TVM vertex count mismatch");
  assert.equal(triangles.size, triangleCount * 6, "TVM triangle count mismatch");
  assert.equal(attributes.size, triangleCount * 4, "TVM face-material count mismatch");
  assert.equal(groupChunk.size, materialCount * 16, "TVM material-group count mismatch");
  const positions = [], normals = [], uvs = [];
  for (let index = 0; index < vertexCount; index++) {
    const at = vertices.start + index * stride;
    const values = Array.from({ length: 8 }, (_, field) => bytes.readFloatLE(at + field * 4));
    assert.ok(values.every(Number.isFinite), "Non-finite TVM vertex float");
    positions.push(...values.slice(0, 3)); normals.push(...values.slice(3, 6)); uvs.push(...values.slice(6));
  }
  const indices = Array.from({ length: triangleCount * 3 }, (_, index) => bytes.readUInt16LE(triangles.start + index * 2));
  assert.ok(indices.every(index => index < vertexCount), "TVM index outside vertices");
  const faceMaterials = Array.from({ length: triangleCount }, (_, index) => bytes.readUInt32LE(attributes.start + index * 4));
  assert.ok(faceMaterials.every(index => index < materialCount), "TVM material outside groups");
  const groups = Array.from({ length: materialCount }, (_, materialIndex) => {
    const at = groupChunk.start + materialIndex * 16;
    const vertices = bytes.readUInt32LE(at), firstVertex = bytes.readUInt32LE(at + 4), faces = bytes.readUInt32LE(at + 8), firstFace = bytes.readUInt32LE(at + 12);
    assert.ok(firstVertex + vertices <= vertexCount && firstFace + faces <= triangleCount, "TVM group outside mesh");
    assert.ok(faceMaterials.slice(firstFace, firstFace + faces).every(value => value === materialIndex), "TVM group and per-face materials disagree");
    assert.ok(indices.slice(firstFace * 3, (firstFace + faces) * 3).every(value => value >= firstVertex && value < firstVertex + vertices), "TVM face references another material group's vertices");
    return { materialIndex, firstVertex, vertexCount: vertices, firstFace, triangleCount: faces };
  });
  assert.equal(groups.reduce((sum, group) => sum + group.triangleCount, 0), triangleCount, "TVM groups do not cover every face");
  const materialRecords = chunks.filter(chunk => /^MGR[34]$/.test(chunk.tag));
  assert.equal(materialRecords.length, 1, "Unsupported TVM material record version");
  assert.equal(materialRecords[0].size, materialCount * (materialRecords[0].tag === "MGR3" ? 136 : 172));
  return { source, sha256: sourceSha256(bytes), bytes: bytes.length, vertexCount, triangleCount, materialCount,
    positions, normals, uvs, indices, faceMaterials, groups, bounds: meshBounds(positions),
    materialRecordVersion: materialRecords[0].tag, materialRecordSha256: sourceSha256(bytes.subarray(materialRecords[0].start, materialRecords[0].start + materialRecords[0].size)),
    trailerBytes: bytes.length - offset, trailerSha256: sourceSha256(bytes.subarray(offset)) };
}

/** Explicit native left-handed -> Web right-handed boundary, preserving source normals/UVs. */
export function webTvmMesh(source) {
  const positions = source.positions.map((value, index) => index % 3 === 2 ? -value : value);
  const normals = source.normals.map((value, index) => index % 3 === 2 ? -value : value);
  const indices = [...source.indices]; let rewoundTriangles = 0;
  for (let at = 0; at < indices.length; at += 3) {
    const [a, b, c] = indices.slice(at, at + 3).map(index => positions.slice(index * 3, index * 3 + 3));
    const u = b.map((value, axis) => value - a[axis]), v = c.map((value, axis) => value - a[axis]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const normal = indices.slice(at, at + 3).reduce((sum, index) => sum.map((value, axis) => value + normals[index * 3 + axis]), [0, 0, 0]);
    if (cross.reduce((sum, value, axis) => sum + value * normal[axis], 0) < 0) { [indices[at + 1], indices[at + 2]] = [indices[at + 2], indices[at + 1]]; rewoundTriangles++; }
  }
  return { positions, normals, uvs: [...source.uvs], indices,
    groups: source.groups.map(group => ({ start: group.firstFace * 3, count: group.triangleCount * 3, materialIndex: group.materialIndex })), rewoundTriangles };
}

/** The archived BMP understates its file size; pixel bounds, not that stale field, are authoritative. */
export function decodeImprezaBmp(bytes) {
  assert.ok(bytes.length >= 54 && bytes.toString("ascii", 0, 2) === "BM", "Invalid BMP header");
  const offset = bytes.readUInt32LE(10), width = bytes.readInt32LE(18), signedHeight = bytes.readInt32LE(22), height = Math.abs(signedHeight), bpp = bytes.readUInt16LE(28);
  assert.ok(width > 0 && height > 0 && width <= 4096 && height <= 4096);
  assert.equal(bytes.readUInt32LE(30), 0, "Compressed BMP unsupported"); assert.ok(bpp === 8 || bpp === 24, "Unsupported BMP depth");
  const stride = Math.ceil(width * bpp / 32) * 4;
  assert.ok(offset + stride * height <= bytes.length, "Truncated BMP pixels");
  const palette = 14 + bytes.readUInt32LE(14), rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const row = signedHeight > 0 ? height - 1 - y : y;
    const at = bpp === 24 ? offset + row * stride + x * 3 : palette + bytes[offset + row * stride + x] * 4;
    assert.ok(at + 2 < offset || bpp === 24, "BMP palette outside header");
    rgba.set([bytes[at + 2], bytes[at + 1], bytes[at], 255], (y * width + x) * 4);
  }
  return { width, height, bpp, rgba, declaredFileSize: bytes.readUInt32LE(2), actualFileSize: bytes.length };
}

/** Decode the archive's single-surface DXT1 heightmap without a runtime image readback. */
export function decodeImprezaDxt1(bytes) {
  assert.ok(bytes.length >= 128 && bytes.toString("ascii", 0, 4) === "DDS ", "Invalid DDS header");
  assert.equal(bytes.readUInt32LE(4), 124); assert.equal(bytes.toString("ascii", 84, 88), "DXT1", "Unsupported DDS compression");
  const height = bytes.readUInt32LE(12), width = bytes.readUInt32LE(16);
  assert.ok(width > 0 && height > 0 && width <= 4096 && height <= 4096);
  const columns = Math.ceil(width / 4), rows = Math.ceil(height / 4);
  assert.ok(bytes.length >= 128 + columns * rows * 8, "Truncated DXT1 blocks");
  const rgb = word => [((word >> 11) & 31) * 255 / 31, ((word >> 5) & 63) * 255 / 63, (word & 31) * 255 / 31].map(Math.round);
  const rgba = new Uint8Array(width * height * 4);
  for (let by = 0; by < rows; by++) for (let bx = 0; bx < columns; bx++) {
    const at = 128 + (by * columns + bx) * 8, c0 = bytes.readUInt16LE(at), c1 = bytes.readUInt16LE(at + 2), codes = bytes.readUInt32LE(at + 4);
    const a = rgb(c0), b = rgb(c1), colors = [a, b, a.map((value, index) => Math.round(c0 > c1 ? (2 * value + b[index]) / 3 : (value + b[index]) / 2)), a.map((value, index) => c0 > c1 ? Math.round((value + 2 * b[index]) / 3) : 0)];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if (bx * 4 + x >= width || by * 4 + y >= height) continue;
      const code = codes >>> (2 * (y * 4 + x)) & 3;
      rgba.set([...colors[code], c0 <= c1 && code === 3 ? 0 : 255], ((by * 4 + y) * width + bx * 4 + x) * 4);
    }
  }
  return { width, height, rgba };
}

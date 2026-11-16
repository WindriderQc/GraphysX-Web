import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const sourceHash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const nameAt = (bytes, offset) => bytes.toString("latin1", offset, offset + 256).split("\0", 1)[0];

/** The counted TV3D layouts already established by the archive's actor audit. */
export function decodeCubzActor(bytes, source) {
  assert.ok(bytes.length >= 16, "Truncated TVA header");
  assert.equal(bytes.readUInt32LE(12), 16, "Unsupported TVA chunk start");
  const chunks = [];
  let offset = 16;
  while (offset + 8 <= bytes.length) {
    const tag = bytes.toString("latin1", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4), start = offset + 8, end = start + size;
    assert.match(tag, /^[A-Z0-9! ]{4}$/, "Invalid TVA chunk tag");
    assert.ok(end <= bytes.length, "TVA chunk overruns file");
    chunks.push({ tag, offset, start, end, size }); offset = end;
    if (tag === "AEND") break;
  }
  assert.equal(chunks.at(-1)?.tag, "AEND", "Missing TVA end marker");
  const chunk = (tag) => {
    const found = chunks.filter((entry) => entry.tag === tag);
    assert.equal(found.length, 1, "Expected one " + tag); return found[0];
  };
  const floats = (at, count) => {
    const values = Array.from({ length: count }, (_, index) => bytes.readFloatLE(at + index * 4));
    assert.ok(values.every(Number.isFinite), "Non-finite source float"); return values;
  };
  const header = chunk("ASTA"); assert.equal(header.size, 48);
  const words = Array.from({ length: 12 }, (_, index) => bytes.readUInt32LE(header.start + index * 4));
  const hierarchy = chunk("MHI2"); assert.equal(hierarchy.size, words[8] * 464);
  const nodes = Array.from({ length: words[8] }, (_, id) => {
    const at = hierarchy.start + id * 464;
    const parent = bytes.readInt32LE(at);
    assert.ok(parent >= -1 && parent < id, "Hierarchy parent must precede its child");
    return {
      id, parent, firstChild: bytes.readInt32LE(at + 4), nextSibling: bytes.readInt32LE(at + 8),
      name: nameAt(bytes, at + 12), meshDataIndex: bytes.readInt32LE(at + 268),
      worldMatrix: floats(at + 272, 16), localMatrix: floats(at + 336, 16),
    };
  });
  const meshes = chunks.filter((entry) => entry.tag === "MAMD").map((entry, index) => {
    const at = entry.start;
    assert.ok(entry.size >= 124, "Truncated MAMD header");
    assert.equal(bytes.readUInt32LE(at + 68), 32, "Unsupported MAMD vertex stride");
    const vertexCount = bytes.readUInt32LE(at + 72), triangleCount = bytes.readUInt32LE(at + 76);
    assert.equal(bytes.readUInt32LE(at + 80), index, "MAMD order differs from hierarchy");
    assert.equal(entry.size, 124 + vertexCount * 32 + triangleCount * 22, "MAMD counted size mismatch");
    const node = nodes.find((candidate) => candidate.meshDataIndex === index);
    assert.ok(node, "MAMD has no hierarchy owner");
    assert.equal(nodes.filter((candidate) => candidate.meshDataIndex === index).length, 1);
    const positions = [], normals = [], uvs = [];
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      const start = at + 124 + vertex * 32;
      positions.push(...floats(start, 3)); normals.push(...floats(start + 12, 3)); uvs.push(...floats(start + 24, 2));
    }
    const indexStart = at + 124 + vertexCount * 32;
    const indices = Array.from({ length: triangleCount * 3 }, (_, face) => bytes.readUInt16LE(indexStart + face * 2));
    assert.ok(indices.every((value) => value < vertexCount), "MAMD index outside vertices");
    const materials = Array.from({ length: triangleCount }, (_, face) => bytes.readUInt32LE(indexStart + triangleCount * 6 + face * 4));
    return { nodeId: node.id, vertexCount, triangleCount, positions, normals, uvs, indices, materials,
      payloadSha256: sourceHash(bytes.subarray(at + 124, entry.end)) };
  });
  assert.equal(meshes.length, words[3]);
  assert.equal(meshes.reduce((sum, mesh) => sum + mesh.vertexCount, 0), words[1]);
  assert.equal(meshes.reduce((sum, mesh) => sum + mesh.triangleCount, 0), words[2]);
  const rangeChunk = chunk("MANS"); assert.equal(rangeChunk.size, words[4] * 280);
  const ranges = Array.from({ length: words[4] }, (_, id) => {
    const at = rangeChunk.start + id * 280;
    const start = bytes.readFloatLE(at + 260), end = bytes.readFloatLE(at + 264), fps = bytes.readFloatLE(at + 268);
    assert.ok(Number.isFinite(start) && Number.isFinite(end) && end >= start && fps > 0 && Number.isFinite(fps), "Invalid source range");
    return { id, name: nameAt(bytes, at), start, end, fps };
  });
  const tracks = chunks.filter((entry) => entry.tag === "MANI").map((entry) => {
    assert.ok(entry.size >= 24);
    const nodeId = bytes.readInt32LE(entry.start), counts = [8, 12, 16].map((at) => bytes.readUInt32LE(entry.start + at));
    assert.ok(nodeId >= 0 && nodeId < nodes.length, "MANI node outside hierarchy");
    assert.equal(entry.size, 24 + counts[0] * 16 + counts[1] * 20 + counts[2] * 16, "MANI counted size mismatch");
    let at = entry.start + 24;
    const channels = counts.map((count, channel) => {
      const width = channel === 1 ? 5 : 4;
      const keys = Array.from({ length: count }, (_, index) => floats(at + index * width * 4, width));
      at += count * width * 4;
      for (let index = 1; index < keys.length; index++) assert.ok(keys[index][0] >= keys[index - 1][0], "Unordered source keys");
      return keys;
    });
    // Constant channels are represented by their exact first value. No changing
    // key is simplified or rounded; interpolation gives the identical result.
    const compact = (keys) => keys.length && keys.every((key) => key.slice(1).every((value, index) => value === keys[0][index + 1])) ? [keys[0]] : keys;
    return { nodeId, sourceKeyCounts: counts, positions: compact(channels[0]), rotations: compact(channels[1]), scales: compact(channels[2]) };
  });
  assert.equal(new Set(tracks.map((track) => track.nodeId)).size, tracks.length, "Duplicate node tracks");
  return { source, sha256: sourceHash(bytes), bytes: bytes.length, nodes, meshes, ranges, tracks,
    trailerSha256: sourceHash(bytes.subarray(offset)) };
}

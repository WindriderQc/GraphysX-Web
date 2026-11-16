import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decodeCubzActor, sourceHash } from "../scripts/cubz-source.mjs";
import { productAssetManifest } from "../scripts/product-assets.mjs";

function fixture() {
  const chunk = (tag, body) => { const header = Buffer.alloc(8); header.write(tag); header.writeUInt32LE(body.length, 4); return Buffer.concat([header, body]); };
  const header = Buffer.alloc(16); header.writeUInt32LE(16, 12);
  const stats = Buffer.alloc(48); [0, 3, 1, 1, 1, 0, 0, 0, 1].forEach((word, index) => stats.writeUInt32LE(word, index * 4));
  const hierarchy = Buffer.alloc(464); hierarchy.writeInt32LE(-1); hierarchy.writeInt32LE(-1, 4); hierarchy.writeInt32LE(-1, 8); hierarchy.write("Box01", 12);
  for (const start of [272, 336]) for (const index of [0, 5, 10, 15]) hierarchy.writeFloatLE(1, start + index * 4);
  const mesh = Buffer.alloc(124 + 3 * 32 + 22); mesh.writeUInt32LE(32, 68); mesh.writeUInt32LE(3, 72); mesh.writeUInt32LE(1, 76);
  [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((vertex, index) => { vertex.forEach((v, axis) => mesh.writeFloatLE(v, 124 + index * 32 + axis * 4)); mesh.writeFloatLE(1, 124 + index * 32 + 20); });
  [0, 1, 2].forEach((v, index) => mesh.writeUInt16LE(v, 220 + index * 2));
  const range = Buffer.alloc(280); range.write("fixture"); range.writeFloatLE(30, 264); range.writeFloatLE(30, 268);
  const channels = [[[0, 0, 0, 0], [30, 1, 2, 3]], [[0, 0, 0, 0, 1], [30, 0, 1, 0, 0]], [[0, 1, 1, 1], [30, 1, 1, 1]]];
  const track = Buffer.alloc(24 + 2 * 16 + 2 * 20 + 2 * 16); [8, 12, 16].forEach(at => track.writeUInt32LE(2, at));
  let at = 24; for (const keys of channels) for (const key of keys) for (const value of key) { track.writeFloatLE(value, at); at += 4; }
  return Buffer.concat([header, chunk("ASTA", stats), chunk("MHI2", hierarchy), chunk("MAMD", mesh), chunk("MANS", range), chunk("MANI", track), chunk("AEND", Buffer.alloc(0))]);
}

test("CubZ counted TVA decoder preserves local mesh data, hierarchy, ranges and all changing keys", () => {
  const bytes = fixture(), actor = decodeCubzActor(bytes, "synthetic.tva");
  assert.equal(actor.sha256, sourceHash(bytes)); assert.equal(actor.meshes[0].triangleCount, 1);
  assert.deepEqual(actor.meshes[0].indices, [0, 1, 2]); assert.equal(actor.nodes[0].name, "Box01");
  assert.deepEqual(actor.tracks[0].positions, [[0, 0, 0, 0], [30, 1, 2, 3]]);
  assert.deepEqual(actor.tracks[0].scales, [[0, 1, 1, 1]], "only exactly constant channels compact");
  assert.deepEqual(actor.tracks[0].sourceKeyCounts, [2, 2, 2]); assert.equal(actor.ranges[0].fps, 30);
});

test("CubZ decoder rejects truncated chunks, wrong counts, invalid hierarchy, indices and nonfinite keys", () => {
  const body = (bytes, tag) => bytes.indexOf(Buffer.from(tag)) + 8;
  const mutations = [
    bytes => bytes.writeUInt32LE(0xffffffff, bytes.indexOf(Buffer.from("MAMD")) + 4),
    bytes => bytes.writeUInt32LE(4, body(bytes, "ASTA") + 4),
    bytes => bytes.writeInt32LE(0, body(bytes, "MHI2")),
    bytes => bytes.writeUInt16LE(3, body(bytes, "MAMD") + 220),
    bytes => bytes.writeFloatLE(NaN, body(bytes, "MANI") + 28),
    bytes => bytes.writeFloatLE(Infinity, body(bytes, "MANS") + 264),
    bytes => bytes.writeUInt32LE(31, body(bytes, "MAMD") + 68),
  ];
  for (const mutate of mutations) { const bytes = fixture(); mutate(bytes); assert.throws(() => decodeCubzActor(bytes, "broken.tva")); }
  assert.throws(() => decodeCubzActor(fixture().subarray(0, -8), "no-end.tva"), /Missing TVA end/);
});

test("the pinned complete CubZ rigs are a claimed lazy product asset", async () => {
  const source = JSON.parse(readFileSync(new URL("../public/assets/ports/archive-cubz-menu.json", import.meta.url)));
  assert.equal(source.schema, "graphysx.cubz-menu-source/v1");
  const expected = { rotation: "8adba22a2103a6edac9b173474b1a4599db04b21c7df4418412ea35903ae7b4b", open: "ccb1ed3bb77919509e2b501663fb34bfd7e64c34e95f01e003e6d553160ca27b", screensaver: "2aecb7774e672b125cab7c0a175b1e3bc01d69fb4914cb4e2ee8f074e83de18f" };
  for (const [id, hash] of Object.entries(expected)) {
    assert.equal(source.actors[id].sha256, hash); assert.equal(source.actors[id].meshes.length, 44);
    assert.equal(source.actors[id].meshes.reduce((sum, mesh) => sum + mesh.vertexCount, 0), 2968);
    assert.equal(source.actors[id].meshes.reduce((sum, mesh) => sum + mesh.triangleCount, 0), 3136);
    for (const mesh of source.actors[id].meshes) {
      assert.equal(new Set(mesh.indices).size, mesh.vertexCount, `${id}/${mesh.nodeId}: all exported vertices are referenced`);
      for (let at = 0; at < mesh.indices.length; at += 3) {
        const [a, b, c] = mesh.indices.slice(at, at + 3).map(index => mesh.positions.slice(index * 3, index * 3 + 3));
        const u = b.map((value, axis) => value - a[axis]), v = c.map((value, axis) => value - a[axis]);
        assert.ok(Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) > 1e-6,
          `${id}/${mesh.nodeId}/${at / 3}: decoded indices form a real source triangle`);
      }
    }
  }
  assert.ok(source.missing.some(value => value.includes("Btn32")));
  assert.ok((await productAssetManifest()).files.includes("/assets/ports/archive-cubz-menu.json"));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { deriveWeights } from "../src/llmx-face-pose.ts";

const asset = JSON.parse(readFileSync(new URL("../src/llmx-face-forge.json", import.meta.url), "utf8"));

for (const level of ["high", "balanced", "mobile"]) {
  test(`${level}: every cube carries a unit normal that points out of the head and follows the surface`, () => {
    const w = deriveWeights(asset, level);
    const midY = (w.bounds[1] + w.bounds[4]) / 2;
    let outward = 0;
    let frontFacing = 0;
    let front = 0;
    let sideFacing = 0;
    let sides = 0;
    for (let i = 0; i < w.count; i += 1) {
      const nx = w.normal[i * 3];
      const ny = w.normal[i * 3 + 1];
      const nz = w.normal[i * 3 + 2];
      assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-3, `cube ${i} has a unit normal`);
      const x = w.rest[i * 3];
      const y = w.rest[i * 3 + 1];
      const z = w.rest[i * 3 + 2];
      if (nx * x + ny * (y - midY) * 0.6 + nz * (z + 0.15) > 0) outward += 1;
      // The middle of the forehead faces the visitor; the temples face sideways.
      if (Math.abs(x) < 0.08 && y > w.anchors.brow.y + 0.05 && y < w.anchors.brow.y + 0.3 && z > w.anchors.brow.z - 0.05) {
        front += 1;
        if (nz > 0.6) frontFacing += 1;
      }
      if (Math.abs(x) > 0.45 && Math.abs(y - w.anchors.eye.y) < 0.15 && z > 0.05 && z < 0.3) {
        sides += 1;
        if (Math.abs(nx) > 0.6 && Math.sign(nx) === Math.sign(x)) sideFacing += 1;
      }
    }
    assert.ok(outward / w.count > 0.97, `${(100 * outward / w.count).toFixed(1)}% of normals point away from the head's centre`);
    assert.ok(front > 0 && frontFacing / front > 0.7, `${frontFacing}/${front} forehead cubes face forward`);
    assert.ok(sides > 0 && sideFacing / sides > 0.7, `${sideFacing}/${sides} temple cubes face sideways`);
  });
}

test("neighbouring cubes carry nearly the same normal: the field is smooth, not a staircase", () => {
  const w = deriveWeights(asset, "high");
  const cube = w.level.cube;
  const key = (x, y, z) => `${Math.round(x / cube)}|${Math.round(y / cube)}|${Math.round(z / cube)}`;
  const index = new Map();
  for (let i = 0; i < w.count; i += 1) index.set(key(w.rest[i * 3], w.rest[i * 3 + 1], w.rest[i * 3 + 2]), i);
  let pairs = 0;
  let sharp = 0;
  for (let i = 0; i < w.count; i += 1) {
    for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const j = index.get(key(w.rest[i * 3] + dx * cube, w.rest[i * 3 + 1] + dy * cube, w.rest[i * 3 + 2] + dz * cube));
      if (j === undefined) continue;
      pairs += 1;
      const dot = w.normal[i * 3] * w.normal[j * 3] + w.normal[i * 3 + 1] * w.normal[j * 3 + 1] + w.normal[i * 3 + 2] * w.normal[j * 3 + 2];
      if (dot < Math.cos(Math.PI / 6)) sharp += 1;
    }
  }
  assert.ok(pairs > 10000);
  assert.ok(sharp / pairs < 0.03, `${(100 * sharp / pairs).toFixed(2)}% of adjacent pairs turn more than 30 degrees`);
});

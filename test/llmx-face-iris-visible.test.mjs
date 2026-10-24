import assert from "node:assert/strict";
import { test } from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { AgentWorldVoxelFace, resolveAgentWorldFace } = await importBrowserModule(new URL("../src/agent-world-face.ts", import.meta.url));
const { Matrix4, Vector3, Quaternion } = await import("three");

/**
 * How much of each iris a viewer straight in front of the mask actually sees, on the assembled
 * rig with every opaque mesh in place — shell, lids, cavity and liner.
 *
 * The sculpt-level test (llmx-face-eyes-open) proves the lids leave the iris open; it cannot see
 * meshes the rig adds. The liner was one: from 2026-09-14 its coarse copies of the lids stood in
 * front of the eyes and hid two thirds of each iris, and every pose test stayed green.
 */
function boxes(mesh) {
  const m = new Matrix4();
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  const half = mesh.geometry.parameters.width / 2;
  const out = [];
  for (let k = 0; k < mesh.count; k += 1) {
    mesh.getMatrixAt(k, m);
    m.decompose(p, q, s);
    out.push({ x: p.x, y: p.y, z: p.z, h: half * s.x });
  }
  return out;
}

export function irisVisibility(face) {
  const meshes = Object.fromEntries(face.object.children.filter((c) => c.isInstancedMesh).map((c) => [c.name, c]));
  const iris = boxes(meshes.VoxelFaceIris);
  const occluders = ["VoxelFaceAnimated", "VoxelFaceStatic", "VoxelFaceLiner", "VoxelFaceMaw"]
    .filter((name) => meshes[name] && meshes[name].visible)
    .flatMap((name) => boxes(meshes[name]));
  // The frontmost iris cube of each column the viewer looks down (+z toward the viewer).
  const cell = iris[0]?.h * 2 || 1;
  const front = new Map();
  for (const c of iris) {
    const key = `${Math.round(c.x / cell)}|${Math.round(c.y / cell)}`;
    const prev = front.get(key);
    if (!prev || c.z > prev.z) front.set(key, c);
  }
  let visible = 0;
  for (const c of front.values()) {
    // Hidden when an opaque cube overlaps the column and its front face stands before the iris's.
    const hidden = occluders.some((o) => Math.abs(o.x - c.x) < o.h && Math.abs(o.y - c.y) < o.h && o.z + o.h > c.z + c.h + 1e-4);
    if (!hidden) visible += 1;
  }
  return { columns: front.size, visible, fraction: front.size ? visible / front.size : 0 };
}

for (const level of ["high", "balanced", "mobile"]) {
  test(`${level}: with the lids open, a viewer in front sees most of each iris on the assembled rig`, () => {
    const face = new AgentWorldVoxelFace(resolveAgentWorldFace({ level }));
    try {
      face.snapDrivers({ build: 1, blink: 0, gazeX: 0, gazeY: 0, attention: 0.25, think: 0, warmth: 0, speak: 0 });
      face.update(0);
      const seen = irisVisibility(face);
      if (process.env.IRIS_PROBE) console.log(level, JSON.stringify(seen));
      assert.ok(seen.columns > 0);
      assert.ok(seen.fraction >= 0.8, `${level}: ${seen.visible}/${seen.columns} iris columns visible`);
    } finally {
      face.dispose();
    }
  });
}

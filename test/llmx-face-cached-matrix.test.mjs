import assert from "node:assert/strict";
import { test } from "node:test";
import { Matrix4, Quaternion, Vector3 } from "three";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { AgentWorldVoxelFace, resolveAgentWorldFace } = await importBrowserModule(new URL("../src/agent-world-face.ts", import.meta.url));

// Previous Matrix4.compose path, retained as an independent numerical oracle.
function originalWriteMesh(mesh, list) {
  if (!mesh) return;
  const p = new Vector3(), q = new Quaternion(), scale = new Vector3(), matrix = new Matrix4();
  for (let j = 0; j < list.length; j++) {
    const i = list[j];
    p.fromArray(this.position, i * 3);
    q.fromArray(this.jitter, i * 4);
    scale.setScalar(this.scale[i]);
    matrix.compose(p, q, scale);
    mesh.setMatrixAt(j, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
for (const level of ["high", "balanced", "mobile"]) {
  test(`${level}: cached rotation preserves every rendered matrix and colour`, () => {
    const config = resolveAgentWorldFace({ level, autoBlink: true });
    const actual = new AgentWorldVoxelFace(config);
    const expected = new AgentWorldVoxelFace(config);
    expected.writeMesh = originalWriteMesh;
    try {
      for (const drivers of [
        { build: 0 }, { build: 1 }, { speak: 1, speakTone: 0.8 },
        { blink: 1, gazeX: -1, gazeY: 1, warmth: 1 },
        { blink: 0, speak: 0, gazeX: 1, gazeY: -1, think: 1 },
        { build: 0.3 }, { build: 1, attention: 1 },
      ]) {
        actual.setDrivers(drivers); expected.setDrivers(drivers);
        for (let frame = 0; frame < 30; frame++) {
          actual.update(1 / 60); expected.update(1 / 60);
          for (let i = 0; i < actual.object.children.length; i++) {
            const a = actual.object.children[i], b = expected.object.children[i];
            assert.deepEqual(a.instanceMatrix.array, b.instanceMatrix.array, `${a.name}: matrix`);
            assert.deepEqual(a.instanceColor?.array, b.instanceColor?.array, `${a.name}: colour`);
          }
        }
      }
      actual.setQualityCeiling("mobile"); expected.setQualityCeiling("mobile");
      actual.snapDrivers({ build: 1, speak: 0.5 }); expected.snapDrivers({ build: 1, speak: 0.5 });
      actual.object.children.forEach((a, i) => assert.deepEqual(a.instanceMatrix.array, expected.object.children[i].instanceMatrix.array));
    } finally { actual.dispose(); expected.dispose(); }
  });
}

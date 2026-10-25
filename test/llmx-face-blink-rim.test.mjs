import assert from "node:assert/strict";
import { test } from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { AgentWorldVoxelFace, resolveAgentWorldFace } = await importBrowserModule(new URL("../src/agent-world-face.ts", import.meta.url));
const { applyForgeFinish, FORGE_FINISH } = await importBrowserModule(new URL("../src/llmx-face-finish.ts", import.meta.url));
const { Matrix4, Vector3, Quaternion, MeshStandardMaterial } = await import("three");

/**
 * A closed lid must face the viewer.
 *
 * The finish lights every surface turned away from the camera with a copper Fresnel rim. The
 * lid's smooth normals were estimated where the lid is parked, folded under the brow, and they
 * turn with the lid: closed, most of the front of the lid faced away, and every blink drew
 * orange goggles in the sockets (measured 2026-10-25: 8046 warm pixels across the closed eyes
 * at the dense level, 78 open). This reads the normal each lid cube is shaded with — the same
 * blend the vertex shader makes — on the assembled rig, after the instance rotation.
 */
function shadedLidNormals(face, drivers) {
  face.snapDrivers({ build: 1, gazeX: 0, gazeY: 0, think: 0, warmth: 0, speak: 0, attention: 0, ...drivers });
  face.update(0);
  const mesh = face.object.children.find((c) => c.name === "VoxelFaceAnimated");
  const closure = mesh.material.userData.gxForgeFinishUniforms.gxLidClosure?.value ?? 0;
  const smooth = mesh.geometry.getAttribute("gxNormal");
  const lid = mesh.geometry.getAttribute("gxLidNormal");
  // The lid's instance slots: lid cubes, in the shell's ascending cube order.
  const lidSlots = new Set(Array.from(face.lidCubes, (i) => face.metalAnimated.indexOf(i)));
  const { eye } = face.weights.anchors;
  const m = new Matrix4();
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  const n = new Vector3();
  const facing = [];
  for (const slot of lidSlots) {
    const lx = lid ? lid.getX(slot) : 0, ly = lid ? lid.getY(slot) : 0, lz = lid ? lid.getZ(slot) : 0;
    mesh.getMatrixAt(slot, m);
    m.decompose(p, q, s);
    // Only the cubes a viewer in front can see: the front of the lid, before the eyeball.
    if (p.z < eye.z + eye.radius * 0.5) continue;
    n.set(smooth.getX(slot), smooth.getY(slot), smooth.getZ(slot)).lerp(new Vector3(lx, ly, lz), closure).normalize().applyQuaternion(q);
    facing.push(n.z);
  }
  facing.sort((a, b) => a - b);
  return { closure, count: facing.length, p10: facing[Math.floor(facing.length * 0.1)], median: facing[Math.floor(facing.length / 2)] };
}

for (const level of ["high", "balanced", "mobile"]) {
  test(`${level}: a closed lid is shaded facing the viewer, so the copper rim stays off it`, () => {
    const face = new AgentWorldVoxelFace(resolveAgentWorldFace({ level }));
    try {
      const closed = shadedLidNormals(face, { blink: 1 });
      assert.ok(closed.count > 20, `${level}: ${closed.count} front lid cubes`);
      // Rim weight is (1 − facing)^2.6: 0.16 of the strength at facing 0.5, all of it at 0. The lid
      // is a sphere, so its top and bottom rows lean away by their own curvature; the estimated
      // normals it shipped with gave a median of −0.06 at the dense level.
      assert.ok(closed.median > 0.55, `${level}: median facing ${closed.median.toFixed(2)}`);
      assert.ok(closed.p10 > 0.3, `${level}: tenth-percentile facing ${closed.p10.toFixed(2)}`);
      assert.equal(closed.closure, 1, "a full blink closes the lid normals fully");
      const half = shadedLidNormals(face, { blink: 0.5 });
      assert.ok(half.median > 0.4, `${level}: half-closed median facing ${half.median.toFixed(2)}`);
    } finally {
      face.dispose();
    }
  });

  test(`${level}: an open lid keeps the shading it was tuned with`, () => {
    const face = new AgentWorldVoxelFace(resolveAgentWorldFace({ level }));
    try {
      assert.equal(shadedLidNormals(face, { blink: 0 }).closure, 0);
      assert.equal(shadedLidNormals(face, { blink: 0, attention: 1 }).closure, 0, "a raised lid is not closing");
    } finally {
      face.dispose();
    }
  });
}

test("the finish blends lid normals in the vertex shader only when asked to", () => {
  const fake = () => ({
    uniforms: {},
    vertexShader: "void main() {\n#include <beginnormal_vertex>\n}",
    fragmentShader: "void main() {\n#include <opaque_fragment>\n}",
  });
  const lids = new MeshStandardMaterial();
  applyForgeFinish(lids, FORGE_FINISH, { smoothNormals: true, lidNormals: true });
  const a = fake();
  lids.onBeforeCompile(a);
  assert.match(a.vertexShader, /attribute vec3 gxLidNormal;/);
  assert.match(a.vertexShader, /mix\( gxNormal, gxLidNormal, gxLidClosure/);
  assert.ok("gxLidClosure" in a.uniforms);

  const plain = new MeshStandardMaterial();
  applyForgeFinish(plain, FORGE_FINISH, { smoothNormals: true });
  const b = fake();
  plain.onBeforeCompile(b);
  assert.doesNotMatch(b.vertexShader, /gxLidNormal/);
  assert.notEqual(lids.customProgramCacheKey(), plain.customProgramCacheKey(), "the two never share a program");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { AgentWorldVoxelFace, resolveAgentWorldFace } = await importBrowserModule(new URL("../src/agent-world-face.ts", import.meta.url));

test("static face instance uploads stop after assembly, including after a replay", () => {
  const face = new AgentWorldVoxelFace(resolveAgentWorldFace({ level: "mobile", autoBlink: false }));
  try {
    const mesh = face.object.children.find(child => child.name.includes("Static"));
    assert.ok(mesh, "static instances are inspectable");
    for (let replay = 0; replay < 2; replay += 1) {
      face.snapDrivers({ build: 0 });
      face.setDrivers({ build: 1 });
      for (let step = 0; step < 180; step += 1) face.update(1 / 60);
      assert.equal(face.describe().build, 1);
      const version = mesh.instanceMatrix.version;
      for (let step = 0; step < 60; step += 1) face.update(1 / 60);
      assert.equal(mesh.instanceMatrix.version, version, "settled static buffers must not be uploaded again");
    }
  } finally { face.dispose(); }
});

test("skip applies the complete face immediately and changing detail retains its pose", () => {
  const face = new AgentWorldVoxelFace(resolveAgentWorldFace({ level: "high" }));
  try {
    face.snapDrivers({ build: 1, blink: 0 });
    assert.equal(face.describe().build, 1);
    face.setQualityCeiling("mobile");
    face.setQualityCeiling("balanced");
    assert.equal(face.describe().build, 1);
    assert.equal(face.describe().level, "high");
    assert.equal(face.describe().renderedLevel, "balanced");
    assert.equal(face.object.children.length, 6);
    // The liner: a static copy of the shell a few cubes inside it, in the shell's own metal, so
    // any seam an expression opens shows more mask rather than the inside of the head.
    const liner = face.object.children.find(child => child.name === "VoxelFaceLiner");
    const shell = face.object.children.find(child => child.name === "VoxelFaceStatic");
    assert.ok(liner, "a static liner sits behind the shell after a detail change");
    assert.equal(liner.castShadow, false);
    assert.equal(liner.material.color.getHexString(), resolveAgentWorldFace({ level: "high" }).metalColor.slice(1), "the liner is the shell's own grey");
    assert.equal(liner.material.roughness, shell.material.roughness);
    assert.equal(liner.material.metalness, shell.material.metalness);
    assert.ok(liner.count > 0 && liner.count < face.describe().cubes, "the liner copies the shell, not the eyes or the mouth cavity");
    const linerVersion = liner.instanceMatrix.version;
    face.setDrivers({ think: 1, attention: 1 });
    for (let step = 0; step < 30; step += 1) face.update(1 / 60);
    assert.equal(liner.instanceMatrix.version, linerVersion, "the liner never follows an expression");
    const cavity = face.object.children.find(child => child.name === "VoxelFaceMaw");
    assert.ok(cavity, "a dedicated cavity remains matte after a detail change");
    assert.equal(cavity.material.metalness, 0);
    assert.equal(cavity.castShadow, false);
  } finally { face.dispose(); }
  assert.equal(face.object.children.length, 0);
  assert.doesNotThrow(() => face.dispose());
});

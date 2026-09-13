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
    assert.equal(face.object.children.length, 5);
    const cavity = face.object.children.find(child => child.name === "VoxelFaceMaw");
    assert.ok(cavity, "a dedicated cavity remains matte after a detail change");
    assert.equal(cavity.material.metalness, 0);
    assert.equal(cavity.castShadow, false);
  } finally { face.dispose(); }
  assert.equal(face.object.children.length, 0);
  assert.doesNotThrow(() => face.dispose());
});

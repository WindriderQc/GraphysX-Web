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
    face.update(1 / 60);
    const linerVersion = liner.instanceMatrix.version;
    face.setDrivers({ think: 1, attention: 1 });
    for (let step = 0; step < 30; step += 1) face.update(1 / 60);
    assert.equal(liner.instanceMatrix.version, linerVersion, "the liner never follows an expression");
    // And it is not there before the face is: the entry must show cubes arriving on nothing.
    face.snapDrivers({ build: 0 });
    face.update(1 / 60);
    assert.equal(liner.visible, false, "the liner hides while the mask assembles");
    face.snapDrivers({ build: 1 });
    face.update(1 / 60);
    assert.equal(liner.visible, true, "the liner shows once the mask is whole");
    const cavity = face.object.children.find(child => child.name === "VoxelFaceMaw");
    assert.ok(cavity, "a dedicated cavity remains matte after a detail change");
    assert.equal(cavity.material.metalness, 0);
    assert.equal(cavity.castShadow, false);
  } finally { face.dispose(); }
  assert.equal(face.object.children.length, 0);
  assert.doesNotThrow(() => face.dispose());
});

test("a face at rest is alive: fixations jump, the head sways within a degree or two, and speech calms it", () => {
  const face = new AgentWorldVoxelFace(resolveAgentWorldFace({ level: "mobile" }));
  try {
    face.snapDrivers({ build: 1, blink: 0, gazeX: 0, gazeY: 0 });
    const rest = face.object;
    const gaze = new Set();
    let maxYaw = 0;
    let maxPitch = 0;
    for (let step = 0; step < 60 * 12; step += 1) {
      face.update(1 / 60);
      gaze.add(Number(face.describe().build) && Math.round(rest.rotation.y * 1e4));
      maxYaw = Math.max(maxYaw, Math.abs(rest.rotation.y));
      maxPitch = Math.max(maxPitch, Math.abs(rest.rotation.x));
    }
    assert.ok(gaze.size > 20, "the head and eyes keep changing over twelve seconds with nothing driving them");
    assert.ok(maxYaw < 0.06 && maxPitch < 0.06, `idle sway stays under ~3 degrees (yaw ${maxYaw.toFixed(3)}, pitch ${maxPitch.toFixed(3)})`);

    // Busy: the sway shrinks while speaking, so it never fights the mouth.
    const idleYaw = maxYaw;
    face.snapDrivers({ speak: 1 });
    let busyYaw = 0;
    for (let step = 0; step < 60 * 12; step += 1) {
      face.setDrivers({ speak: 1 });
      face.update(1 / 60);
      busyYaw = Math.max(busyYaw, Math.abs(rest.rotation.y - 0));
    }
    assert.ok(busyYaw <= idleYaw + 1e-6, `sway while speaking (${busyYaw.toFixed(3)}) is not larger than at rest (${idleYaw.toFixed(3)})`);
  } finally { face.dispose(); }
});

test("one blink in five is a double blink, and none of them is a step", () => {
  const face = new AgentWorldVoxelFace(resolveAgentWorldFace({ level: "mobile" }));
  try {
    face.snapDrivers({ build: 1, blink: 0 });
    let blinks = 0;
    let quickFollowUps = 0;
    let wasClosed = false;
    let lastOpenedAt = -10;
    let time = 0;
    let previous = 0;
    for (let step = 0; step < 60 * 240; step += 1) {
      face.update(1 / 60);
      time += 1 / 60;
      const closed = face.describe().build === 1 && face["current"].blink > 0.5;
      const value = face["current"].blink;
      assert.ok(Math.abs(value - previous) < 0.6, "lids move, they do not teleport");
      previous = value;
      if (closed && !wasClosed) { blinks += 1; if (time - lastOpenedAt < 0.6) quickFollowUps += 1; }
      if (!closed && wasClosed) lastOpenedAt = time;
      wasClosed = closed;
    }
    assert.ok(blinks >= 30, `expected regular blinks over four minutes, got ${blinks}`);
    assert.ok(quickFollowUps >= 2 && quickFollowUps < blinks / 2, `double blinks: ${quickFollowUps} of ${blinks}`);
  } finally { face.dispose(); }
});

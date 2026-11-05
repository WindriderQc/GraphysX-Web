import { test } from "node:test";
import assert from "node:assert/strict";
import { Box3, Group, Vector3 } from "three";
import { importBrowserModule } from "./support/import-browser-module.mjs";

// The default agent avatar: a block robot (owner's pick, 2026-11-04).
const robotModule = await importBrowserModule(new URL("../src/agent-world-robot.ts", import.meta.url));

const partsOf = (object, name) => {
  const found = [];
  object.traverse((child) => { if (child.userData.graphysxRobotPart === name) found.push(child); });
  return found;
};

test("the robot stands on its feet, faces -Z and fits its agent's height", () => {
  const rig = new robotModule.AgentRobotRig({ height: 1.8, radius: 0.45 });
  const bounds = new Box3().setFromObject(rig.object);
  assert.ok(Math.abs(bounds.min.y) < 1e-6, `feet at the origin, got ${bounds.min.y}`);
  assert.ok(bounds.max.y > 1.6 && bounds.max.y < 2.2, `height near 1.8 with its antenna, got ${bounds.max.y}`);
  const eyes = partsOf(rig.object, "eye");
  assert.equal(eyes.length, 2);
  for (const eye of eyes) {
    const position = eye.getWorldPosition(new Vector3());
    assert.ok(position.z < 0, "the eyes look forward, toward -Z like the old direction cone");
  }
  assert.equal(partsOf(rig.object, "leg").length, 2);
  assert.equal(partsOf(rig.object, "arm").length, 2);
});

test("material roles: tinted body, glowing accents, locked fixed parts", () => {
  const object = robotModule.createAgentRobot({ height: 1, radius: 0.5 });
  let tinted = 0;
  let accents = 0;
  let locked = 0;
  object.traverse((child) => {
    if (!child.isMesh) return;
    if (child.userData.graphysxAgentAccent) accents += 1;
    else if (child.userData.graphysxMaterialLocked) locked += 1;
    else tinted += 1;
  });
  assert.equal(accents, 3, "two eyes and the chest light take the agent's colour as glow");
  assert.ok(tinted >= 4, "head, body and arms take the agent's colour");
  assert.ok(locked >= 4, "visor, legs and antenna keep their own material");
});

test("legs swing only while the agent walks; eyes blink on their own", () => {
  const agent = new Group();
  const rig = new robotModule.AgentRobotRig({ height: 1.8, radius: 0.45 });
  agent.add(rig.object);
  const [left] = partsOf(rig.object, "leg");
  for (let i = 0; i < 60; i += 1) rig.update(1 / 60);
  assert.ok(Math.abs(left.rotation.x) < 0.02, `standing still keeps the legs straight, got ${left.rotation.x}`);
  let largest = 0;
  for (let i = 0; i < 60; i += 1) {
    agent.position.x += 2 / 60;
    rig.update(1 / 60);
    largest = Math.max(largest, Math.abs(left.rotation.x));
  }
  assert.ok(largest > 0.3, `walking swings the legs, got ${largest}`);
  agent.position.x += 500;
  rig.update(1 / 60);
  let after = 0;
  for (let i = 0; i < 60; i += 1) { rig.update(1 / 60); after = Math.abs(left.rotation.x); }
  assert.ok(after < 0.05, "a teleport is not a sprint: the legs settle");
  const eyes = partsOf(rig.object, "eye");
  let blinked = false;
  for (let i = 0; i < 300; i += 1) { rig.update(1 / 60); if (eyes[0].scale.y < 0.5) blinked = true; }
  assert.ok(blinked, "the eyes blink within five seconds");
  rig.update(0);
});

test("findAgentRobot reaches the rig through the agent's visual", () => {
  const agent = new Group();
  const visual = robotModule.createAgentRobot({ height: 1, radius: 0.5 });
  agent.add(visual);
  agent.userData.graphysxAgentVisual = visual;
  assert.ok(robotModule.findAgentRobot(agent) instanceof robotModule.AgentRobotRig);
  assert.equal(robotModule.findAgentRobot(new Group()), null);
});

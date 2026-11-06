import assert from "node:assert/strict";
import { test } from "node:test";
import { Quaternion, Vector3 } from "three";
import { RaceInput } from "../src/cyber-race/input.ts";

function raceInput(t) {
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  return new RaceInput();
}

function touch(handedness, { trigger = 0, grip = 0, primary = 0, secondary = 0 } = {}) {
  return {
    handedness,
    gamepad: {
      axes: [0, 0, 0, 0],
      buttons: [trigger, grip, 0, 0, primary, secondary].map((value) => ({ value, pressed: value > 0.5 })),
    },
  };
}

test("Quest grips bank by hand and pressure with one controller or reversed source order", (t) => {
  const input = raceInput(t);
  const left = touch("left", { grip: 0.4 });
  const right = touch("right", { grip: 0.8 });
  input.setXrSources([left]);
  assert.equal(input.pilot(0).roll, -0.4);
  input.setXrSources([right]);
  assert.equal(input.pilot(0).roll, 0.8);
  input.setXrSources([right, left]);
  assert.equal(input.pilot(0).roll, 0.4);
  assert.equal(input.pilot(1).roll, 0);
  input.setXrSources([touch("left", { grip: 1 }), touch("right", { grip: 1 })]);
  assert.equal(input.pilot(0).roll, 0);
  assert.equal(input.pilot(0).throttle, 0);
  assert.equal(input.pilot(0).fire, false);
  input.poll(1 / 60);
  assert.deepEqual(input.takeEvents(), []);
});

test("the Quest left trigger brakes and the right trigger applies progressive turbo", (t) => {
  const input = raceInput(t);
  const left = touch("left", { trigger: 0.4 });
  const right = touch("right", { trigger: 0.8 });
  input.setXrSources([left]);
  assert.equal(input.pilot(0).throttle, -0.4);
  input.setXrSources([right]);
  assert.equal(input.pilot(0).throttle, 0.8);
  input.setXrSources([right, left]);
  assert.equal(input.pilot(0).throttle, 0.4);
  assert.equal(input.pilot(1).throttle, 0);
  assert.equal(input.pilot(0).roll, 0);
  input.setXrSources([touch("left", { trigger: 1 }), touch("right", { trigger: 1 })]);
  assert.equal(input.pilot(0).throttle, 0);
  input.poll(1 / 60);
  assert.deepEqual(input.takeEvents(), []);
});

test("right A only fires and right B cannot pause while left X and Y operate the menu", (t) => {
  const input = raceInput(t);
  input.setXrSources([touch("right", { primary: 1, secondary: 1 })]);
  assert.equal(input.pilot(0).fire, true);
  input.poll(1 / 60);
  assert.deepEqual(input.takeEvents(), []);

  input.setXrSources([touch("left", { primary: 1, secondary: 1 })]);
  assert.equal(input.pilot(0).fire, false);
  input.poll(1 / 60);
  assert.deepEqual(input.takeEvents(), [
    { action: "ok", source: "xr" },
    { action: "back", source: "xr" },
  ]);
  input.poll(1 / 60);
  assert.deepEqual(input.takeEvents(), []);
});

test("Quest haptics reach either connected hand alongside the flight controls", (t) => {
  const input = raceInput(t);
  const pulses = [];
  const left = touch("left", { grip: 0.6 });
  const right = touch("right", { trigger: 1 });
  for (const { handedness, gamepad } of [left, right]) {
    gamepad.hapticActuators = [{
      pulse: async (strength, duration) => { pulses.push({ handedness, strength, duration }); },
    }];
  }
  input.setXrSources([right, { handedness: "none", gamepad: null }, left]);
  input.rumble(0, 0.3, 0.7, 90);
  assert.deepEqual(pulses, [
    { handedness: "right", strength: 0.7, duration: 90 },
    { handedness: "left", strength: 0.7, duration: 90 },
  ]);
  assert.equal(input.pilot(0).roll, -0.6);
  assert.equal(input.pilot(0).throttle, 1);
});

const axisX = new Vector3(1, 0, 0);
const axisY = new Vector3(0, 1, 0);
const axisZ = new Vector3(0, 0, 1);
const turn = (axis, degrees) => new Quaternion().setFromAxisAngle(axis, degrees * Math.PI / 180);

function trackedTouch(handedness) {
  return { ...touch(handedness, { grip: 1 }), targetRayMode: "tracked-pointer", targetRaySpace: {} };
}

function wristTracking(input) {
  const poses = new Map();
  const referenceSpace = {};
  const frame = { getPose(space, reference) {
    assert.equal(reference, referenceSpace);
    const orientation = poses.get(space);
    return orientation ? { transform: { orientation } } : null;
  } };
  return { poses, sample: (...sources) => input.setXrSources(sources, { frame, referenceSpace }) };
}

test("wrist bank tracks signed roll around the calibrated pointing axis", (t) => {
  const input = raceInput(t);
  const right = trackedTouch("right");
  const { poses, sample } = wristTracking(input);
  const rest = turn(axisY, 36).multiply(turn(axisX, -24));
  const pose = (rotation) => {
    poses.set(right.targetRaySpace, rest.clone().multiply(rotation));
    sample(right);
    return input.pilot(0).roll;
  };

  assert.equal(pose(new Quaternion()), 0, "holding a grip sets the neutral angle");
  assert.equal(pose(turn(axisX, 50)), 0, "pitch is ignored");
  assert.equal(pose(turn(axisY, 55)), 0, "yaw is ignored");
  assert.equal(pose(turn(axisZ, 5)), 0, "small wrist motion is inside the dead zone");
  assert.ok(Math.abs(pose(turn(axisX, 40).multiply(turn(axisZ, -24))) - 0.5) < 1e-6);
  assert.equal(pose(turn(axisZ, 60)), -1, "left bank reaches knife-edge");
});

test("wrist bank releases to neutral and recalibrates after losing tracking or changing hands", (t) => {
  const input = raceInput(t);
  const right = trackedTouch("right");
  const left = trackedTouch("left");
  const { poses, sample } = wristTracking(input);
  poses.set(right.targetRaySpace, new Quaternion());
  poses.set(left.targetRaySpace, turn(axisZ, 20));
  sample(right);
  poses.set(right.targetRaySpace, turn(axisZ, -60));
  sample(left, right);
  assert.equal(input.pilot(0).roll, 1, "a second grip does not take over while the first is held");
  right.gamepad.buttons[1].pressed = false;
  sample(left, right);
  assert.equal(input.pilot(0).roll, 0, "the new hand gets its own neutral angle");
  poses.set(left.targetRaySpace, turn(axisZ, 80));
  sample(left);
  assert.equal(input.pilot(0).roll, -1);
  poses.delete(left.targetRaySpace);
  sample(left);
  assert.equal(input.pilot(0).roll, 0, "tracking loss releases the bank");
  poses.set(left.targetRaySpace, turn(axisZ, 80));
  sample(left);
  assert.equal(input.pilot(0).roll, 0, "tracking recovery sets a fresh neutral angle");
  left.gamepad.buttons[1].pressed = false;
  sample(left);
  assert.equal(input.pilot(0).roll, 0);
  left.gamepad.buttons[1].pressed = true;
  input.setXrSources([left]);
  assert.equal(input.pilot(0).roll, -1, "the regular grip mode still works");
});

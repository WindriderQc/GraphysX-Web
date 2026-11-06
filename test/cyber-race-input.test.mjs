import assert from "node:assert/strict";
import { test } from "node:test";
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

test("Quest triggers bank by handedness and pressure even with one controller or reversed source order", (t) => {
  const input = raceInput(t);
  const left = touch("left", { trigger: 0.4 });
  const right = touch("right", { trigger: 0.8 });
  input.setXrSources([left]);
  assert.equal(input.pilot(0).roll, -0.4);
  input.setXrSources([right]);
  assert.equal(input.pilot(0).roll, 0.8);
  input.setXrSources([right, left]);
  assert.equal(input.pilot(0).roll, 0.4);
  assert.equal(input.pilot(1).roll, 0);
  input.setXrSources([touch("left", { trigger: 1 }), touch("right", { trigger: 1 })]);
  assert.equal(input.pilot(0).roll, 0);
  assert.equal(input.pilot(0).boost, false);
  assert.equal(input.pilot(0).fire, false);
  input.poll(1 / 60);
  assert.deepEqual(input.takeEvents(), []);
});

test("either Quest grip boosts and the face buttons fire, confirm and pause", (t) => {
  const input = raceInput(t);
  for (const handedness of ["left", "right"]) {
    input.setXrSources([touch(handedness, { grip: 1, primary: 1, secondary: 1 })]);
    assert.equal(input.pilot(0).boost, true);
    assert.equal(input.pilot(0).fire, true);
    assert.equal(input.pilot(0).roll, 0);
    input.poll(1 / 60);
    assert.deepEqual(input.takeEvents(), [
      { action: "ok", source: "xr" },
      { action: "back", source: "xr" },
    ]);
    input.setXrSources([]);
    assert.equal(input.pilot(0).boost, false);
    assert.equal(input.pilot(0).fire, false);
  }
});

test("Quest haptics reach either connected hand alongside the flight controls", (t) => {
  const input = raceInput(t);
  const pulses = [];
  const left = touch("left", { trigger: 0.6 });
  const right = touch("right", { grip: 1 });
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
  assert.equal(input.pilot(0).boost, true);
});

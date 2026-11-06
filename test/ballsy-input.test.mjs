import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { assignBallsyPads, readBallsyDrive, ballsyButton } = await importBrowserModule(new URL("../src/ballsy-input.ts", import.meta.url));
const pad = (index, extra = {}) => ({ index, connected: true, mapping: "standard", id: `pad-${index}`, axes: [0, 0], buttons: [], ...extra });

test("two players keep their slots through sparse Gamepad arrays, a new arrival and unplugging", () => {
  const slots = assignBallsyPads([null, null], [null, pad(1), null, pad(3)]);
  assert.deepEqual(slots, [1, 3]);
  assert.deepEqual(assignBallsyPads(slots, [pad(0), null, null, pad(3)]), [1, 3]);
  assert.deepEqual(slots, [1, 3], "assignment does not mutate the caller's state");
});

test("an unqualified mapping or disconnected pad never occupies a player slot or drives a ball", () => {
  const unqualified = pad(0, { mapping: "", axes: [1, 1], buttons: [{ pressed: true, value: 1 }] });
  assert.deepEqual(assignBallsyPads([null, null], [unqualified, pad(1, { connected: false }), pad(2)]), [2, null]);
  assert.deepEqual(readBallsyDrive(0, new Set(), unqualified), { thrust: 0, turn: 0 });
  assert.equal(ballsyButton(unqualified, 0), false);
});

test("keyboard controls are independent and accept the French and English second-player layouts", () => {
  const keys = new Set(["ArrowRight", "KeyZ"]);
  assert.equal(readBallsyDrive(0, keys).headingDegrees, 90);
  assert.equal(readBallsyDrive(1, keys).headingDegrees, 0);
  assert.equal(readBallsyDrive(0, new Set(["KeyD"])).thrust, 0);
  assert.equal(readBallsyDrive(1, new Set(["ArrowUp"])).thrust, 0);
  assert.equal(readBallsyDrive(1, new Set(["KeyW"])).headingDegrees, 0);
  assert.equal(readBallsyDrive(1, new Set(["KeyQ"])).headingDegrees, 270);
});

test("radial deadzone rejects drift and malformed axes while diagonal input never boosts thrust", () => {
  assert.equal(readBallsyDrive(0, new Set(), pad(0, { axes: [0.1, -0.1] })).thrust, 0);
  assert.equal(readBallsyDrive(0, new Set(), pad(0, { axes: [NaN, Infinity] })).thrust, 0);
  const diagonal = readBallsyDrive(0, new Set(), pad(0, { axes: [1, -1] }));
  assert.equal(diagonal.thrust, 1);
  assert.equal(diagonal.headingDegrees, 45);
});

test("braking overrides movement and keyboard remains usable after a controller disconnect", () => {
  assert.deepEqual(readBallsyDrive(0, new Set(["ArrowUp", "Space"])), { thrust: -1, turn: 0 });
  assert.deepEqual(readBallsyDrive(1, new Set(["KeyW", "ShiftLeft"])), { thrust: -1, turn: 0 });
  const heldBrake = pad(0, { axes: [1, 0], buttons: [{ pressed: true, value: 1 }] });
  assert.equal(readBallsyDrive(0, new Set(), heldBrake).thrust, -1);
  assert.equal(readBallsyDrive(0, new Set(["ArrowLeft"]), pad(0, { connected: false })).headingDegrees, 270);
  assert.equal(readBallsyDrive(0, new Set(["ArrowUp"]), pad(0, { axes: [1, 0] })).headingDegrees, 0);
});

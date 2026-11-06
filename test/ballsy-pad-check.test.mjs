import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { createBallsyPadCheck, updateBallsyPadCheck, ballsyPadReady } = await importBrowserModule(new URL("../src/ballsy-pad-check.ts", import.meta.url));
const pad = { index: 3, id: "controller", mapping: "standard", connected: true, axes: [0, 0], buttons: [{ pressed: false, value: 0 }] };
const sample = (state, axes, brake = false, active = true) => updateBallsyPadCheck(state, { ...pad, axes, buttons: [{ pressed: brake, value: Number(brake) }] }, active);

test("a pad receipt requires four directions, centring and a complete brake press/release", () => {
  let state = createBallsyPadCheck();
  state = sample(state, [0, 0], true);
  assert.equal(state.braked, false, "an initial button press alone is not a completed check");
  for (const axes of [[-1, 0], [1, 0], [0, -1], [0, 1]]) state = sample(state, axes);
  assert.equal(state.directions, 15);
  assert.equal(state.centred, false);
  state = sample(state, [0, 0]);
  assert.equal(state.centred, true);
  state = sample(state, [0, 0], true);
  assert.equal(ballsyPadReady(state), false);
  state = sample(state, [0, 0]);
  assert.equal(ballsyPadReady(state), true);
  assert.deepEqual(createBallsyPadCheck().directions, 0);
});

test("ordinary racing cannot silently complete the guided check, nor can drift or invalid axes", () => {
  let state = createBallsyPadCheck();
  for (const axes of [[-1, 0], [1, 0], [0, -1], [0, 1]]) state = sample(state, axes, false, false);
  assert.equal(state.directions, 0);
  for (const axes of [[0.1, 0.1], [NaN, 1], [1, Infinity]]) state = sample(state, axes);
  assert.equal(state.directions, 0);
  assert.equal(ballsyPadReady(state), false);
});

test("a different device at the same index and a disconnected or nonstandard device cannot inherit verification", () => {
  let state = createBallsyPadCheck();
  for (const axes of [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]]) state = sample(state, axes);
  state = sample(sample(state, [0, 0], true), [0, 0]);
  assert.equal(ballsyPadReady(state), true);
  for (const replacement of [{ ...pad, id: "another pad" }, { ...pad, connected: false }, { ...pad, mapping: "" }, null]) {
    const next = updateBallsyPadCheck(state, replacement, false);
    assert.equal(ballsyPadReady(next), false);
  }
  assert.equal(ballsyPadReady(state), true, "sampling never mutates a previous receipt");
});

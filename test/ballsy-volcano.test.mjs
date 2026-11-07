import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { createVolcano, advanceVolcano, commandVolcano, volcanoMassError, volcanoSlowAt, volcanoWidth, VOLCANO_LIMITS } = await importBrowserModule(new URL("../src/ballsy-volcano.ts", import.meta.url));

function prepare(state, route) {
  assert.equal(commandVolcano(state, { type: "route", route }).ok, true);
  advanceVolcano(state, 3);
  for (let point = 0; point < 3; point++) {
    assert.equal(commandVolcano(state, { type: "dig", point }).ok, true);
    advanceVolcano(state, 0.81);
    commandVolcano(state, { type: "release" });
  }
  assert.equal(state.pending.phase, "warning");
  advanceVolcano(state, 1.25);
  assert.equal(state.route, route);
}

test("one source is divided, never copied; all incoming lava is stored or drained", () => {
  for (const mode of ["challenge", "help"]) {
    const state = createVolcano(mode);
    for (let i = 0; i < 1800; i++) {
      advanceVolcano(state, 1 / 30);
      assert.ok(Math.abs(state.streams[0].flow + state.streams[1].flow + state.diverted - state.source) < 1e-9);
      assert.ok(Math.abs(volcanoMassError(state)) < 1e-8);
      assert.ok(state.source <= VOLCANO_LIMITS.maxSource);
      assert.ok(state.streams.every((stream) => stream.stored >= 0 && stream.lake >= 0));
    }
  }
});

test("three real holds and travel precede an announced intervention; click spam cannot skip preparation", () => {
  const state = createVolcano();
  commandVolcano(state, { type: "route", route: "concentrate" });
  assert.equal(state.charges, 3);
  assert.equal(commandVolcano(state, { type: "dig", point: 0 }).ok, false);
  assert.equal(commandVolcano(state, { type: "route", route: "divert" }).ok, false);
  advanceVolcano(state, 0.9);
  assert.equal(commandVolcano(state, { type: "dig", point: 2 }).ok, false);
  for (let i = 0; i < 10; i++) { commandVolcano(state, { type: "dig", point: 0 }); commandVolcano(state, { type: "release" }); }
  assert.equal(state.pending.strokes, 0);
  for (let point = 0; point < 3; point++) {
    commandVolcano(state, { type: "dig", point }); advanceVolcano(state, 0.8);
  }
  assert.equal(state.route, "split");
  assert.equal(state.pending.phase, "warning");
  advanceVolcano(state, 1.19);
  assert.equal(state.route, "split");
  advanceVolcano(state, 0.06);
  assert.equal(state.route, "concentrate");
  assert.equal(state.interventions, 1);
  advanceVolcano(state, 7.1);
  assert.equal(state.route, "split", "the diversion/concentration is temporary");
});

test("legacy route commands retain compatibility accounting; race effects use only the physical field", () => {
  const split = createVolcano();
  const single = createVolcano();
  prepare(single, "concentrate");
  assert.ok(volcanoWidth(single.streams[0].flow) > volcanoWidth(split.streams[0].flow));
  const physicalBefore = volcanoSlowAt(single, [13, 0.7, -3]);
  single.streams[0].flow = 999;
  assert.deepEqual(volcanoSlowAt(single, [13, 0.7, -3]), physicalBefore, "legacy stream fields cannot create phantom lava");
  assert.equal(volcanoSlowAt(split, [13, 0.7, 3]).intensity, 0, "a fresh dry height field does not slow a racer");
  assert.equal(single.streams[1].flow, 0);
});

test("help-mode floods form lakes; a prepared diversion avoids the same flood", () => {
  const unmanaged = createVolcano("help"), protectedState = createVolcano("help");
  advanceVolcano(unmanaged, 15.8);
  advanceVolcano(protectedState, 6);
  prepare(protectedState, "divert");
  // Finish the comparison at 15.8s, while the prepared diversion still covers the flood.
  advanceVolcano(protectedState, 15.8 - protectedState.time);
  assert.ok(unmanaged.streams.some((stream) => stream.lake > 0.5));
  assert.ok(protectedState.streams.every((stream) => stream.lake === 0));
  assert.ok(Math.abs(volcanoMassError(unmanaged)) < 1e-8);
  assert.ok(Math.abs(volcanoMassError(protectedState)) < 1e-8);
});

test("the giant has four actions and cannot seal the dry outer lane, even after long overflowing floods", () => {
  const state = createVolcano("help");
  for (let i = 0; i < 4; i++) prepare(state, i % 2 ? "divert" : "concentrate");
  assert.equal(state.charges, 0);
  assert.equal(commandVolcano(state, { type: "route", route: "split" }).ok, false);
  advanceVolcano(state, 60);
  assert.equal(volcanoSlowAt(state, [15.3, 0.7, -3]).intensity, 0);
  assert.ok(volcanoSlowAt(state, [13, 0.7, -3]).speedCap >= VOLCANO_LIMITS.minimumSpeed);
  assert.ok(Math.abs(volcanoMassError(state)) < 1e-8);
});

test("invalid commands and time steps cannot mutate resources or advance the model", () => {
  const state = createVolcano();
  const before = structuredClone(state);
  for (const command of [{ type: "route", route: "anything" }, { type: "route", route: "split", force: true }, { type: "dig", point: -1 }, { type: "dig", point: NaN }, null]) assert.equal(commandVolcano(state, command).ok, false);
  for (const time of [-1, Infinity, NaN, 61]) assert.throws(() => advanceVolcano(state, time), RangeError);
  advanceVolcano(state, 0);
  assert.deepEqual(state, before);
});

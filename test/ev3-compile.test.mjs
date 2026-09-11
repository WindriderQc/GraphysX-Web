import { test } from "node:test";
import assert from "node:assert/strict";
import { compileEv3InputSequence } from "../tools/ev3-compile.mjs";

test("USB compilation preserves First Drive's timed steering and neutral Stop", () => {
  assert.deepEqual(compileEv3InputSequence(["left", "forward", "right", "stop"]), {
    schema: "kidx.ev3-input-sequence/v1",
    steps: [
      { durationMs: 550, input: { thrust: 0, turn: -1 } },
      { durationMs: 900, input: { thrust: 1, turn: 0 } },
      { durationMs: 550, input: { thrust: 0, turn: 1 } },
      { durationMs: 450, input: { thrust: 0, turn: 0 } },
    ],
  });
});

test("USB compilation rejects invalid programs before the runner can truncate them", () => {
  for (const blocks of [null, [], ["jump"], ["constructor"], ["__proto__"], Array(2), Array(7).fill("forward")]) {
    assert.throws(() => compileEv3InputSequence(blocks), /one to six/);
  }
  assert.equal(compileEv3InputSequence(Array(6).fill("forward")).steps.length, 6);
});

test("compiled snapshots cannot change subsequent simulation inputs", () => {
  const first = compileEv3InputSequence(["forward"]);
  first.steps[0].input.thrust = -1;
  first.steps[0].durationMs = 30000;
  assert.deepEqual(compileEv3InputSequence(["forward"]).steps,
    [{ durationMs: 900, input: { thrust: 1, turn: 0 } }]);
});

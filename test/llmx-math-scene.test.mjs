import assert from "node:assert/strict";
import test from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { MATH_PITCH, mathCubeAt, mathFocusAt, mathLabelAt, mathTimeline, readMathScene } =
  await importBrowserModule(new URL("../src/llmx-math-scene.ts", import.meta.url));

test("only v1 pictures are accepted, and they are refused rather than clamped", () => {
  assert.deepEqual(readMathScene({ schema: "agentx.math-scene.v1", kind: "count", to: 100 }), { kind: "count", to: 100 });
  assert.deepEqual(readMathScene({ kind: "add", a: 12, b: 8, extra: true }), { kind: "add", a: 12, b: 8 });
  for (const bad of [null, "3+4", { kind: "count", to: 101 }, { kind: "count", to: 0 }, { kind: "count", to: 2.5 },
    { kind: "add", a: 15, b: 6 }, { kind: "add", a: -1, b: 3 }, { kind: "add", a: 0, b: 0 }, { kind: "sub", a: 5, b: 2 },
    { schema: "agentx.math-scene.v2", kind: "count", to: 3 }]) {
    assert.equal(readMathScene(bad), null, JSON.stringify(bad));
  }
});

test("counting lays out rods of ten, names each cube while few, and finishes a hundred briskly", () => {
  const hundred = mathTimeline({ kind: "count", to: 100 });
  assert.equal(hundred.cubes.length, 100);
  const rows = new Set(hundred.cubes.map(cube => cube.end[1].toFixed(3)));
  assert.equal(rows.size, 10, "ten rods of ten");
  assert.ok(hundred.duration <= 10, `a hundred takes ${hundred.duration}s`);
  assert.equal(mathLabelAt(hundred, hundred.duration), "100");
  assert.deepEqual(hundred.labels.map(label => label.text).slice(0, 3), ["10", "20", "30"], "past twenty, the tens carry the count");
  const seven = mathTimeline({ kind: "count", to: 7 });
  assert.deepEqual(seven.labels.map(label => label.text), ["1", "2", "3", "4", "5", "6", "7"]);
  const [first, sixth] = [seven.cubes[0], seven.cubes[5]];
  assert.ok(sixth.end[0] - seven.cubes[4].end[0] > MATH_PITCH, "a gap after five, as on a ten-frame");
  assert.equal(mathCubeAt(first, -0.01).visible, false);
  assert.equal(mathCubeAt(first, 1).visible, true);
});

test("an addition shows both numbers apart, then regroups the second to complete the ten", () => {
  const timeline = mathTimeline({ kind: "add", a: 8, b: 5 });
  assert.equal(timeline.cubes.length, 13);
  const a = timeline.cubes.filter(cube => cube.group === "a"), b = timeline.cubes.filter(cube => cube.group === "b");
  assert.equal(a.length, 8);
  assert.equal(b.length, 5);
  assert.ok(b.every(cube => cube.start[1] < a[0].start[1] - MATH_PITCH), "the second number starts below, one row apart");
  const regrouped = timeline.cubes.map(cube => cube.end[1].toFixed(3));
  assert.equal(regrouped.filter(y => y === regrouped[0]).length, 10, "one full rod of ten after regrouping");
  assert.equal(regrouped.length - 10, 3, "and three more");
  assert.equal(mathLabelAt(timeline, 0), "8");
  assert.equal(mathLabelAt(timeline, timeline.duration), "8 + 5 = 13");
  // Nestor's answer starts with the picture; the regroup must land while he explains it.
  assert.ok(b[0].moveAt >= 3.5 && b[0].moveAt <= 4.5, `regroup at ${b[0].moveAt}s`);
  assert.ok(timeline.duration <= 5, `8 + 5 complete in ${timeline.duration}s`);
  const end = mathCubeAt(b[0], timeline.duration + 1);
  assert.deepEqual(end.position.map(v => +v.toFixed(6)), b[0].end.map(v => +v.toFixed(6)));
});

test("the mask looks at the newest cube, then at the group being moved", () => {
  const timeline = mathTimeline({ kind: "add", a: 2, b: 1 });
  assert.deepEqual(mathFocusAt(timeline, 0.01), timeline.cubes[0].start);
  const moving = timeline.cubes[2];
  assert.deepEqual(mathFocusAt(timeline, moving.moveAt + 0.2), moving.end);
  assert.equal(mathFocusAt(timeline, timeline.duration + 5), null, "still pictures release the gaze");
});

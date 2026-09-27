import assert from "node:assert/strict";
import test from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { stageView, STAGE_LABEL_ROOM } = await importBrowserModule(new URL("../src/llmx-stage-frame.ts", import.meta.url));
const { mathTimeline } = await importBrowserModule(new URL("../src/llmx-math-scene.ts", import.meta.url));

// Whatever the element's shape, the whole picture and its label stay inside the view.
function fits(bounds, aspect, view, fov = 35) {
  const vertical = Math.tan((fov * Math.PI) / 360) * view.distance, horizontal = vertical * aspect;
  return bounds.min[0] >= view.x - horizontal && bounds.max[0] <= view.x + horizontal
    && bounds.min[1] >= view.y - vertical && bounds.max[1] + STAGE_LABEL_ROOM <= view.y + vertical;
}

test("a counting or addition picture fits wide, square and tall elements", () => {
  for (const scene of [{ kind: "count", to: 100 }, { kind: "count", to: 3 }, { kind: "add", a: 8, b: 5 }]) {
    const { bounds } = mathTimeline(scene);
    for (const aspect of [2.4, 1, 0.45]) assert.ok(fits(bounds, aspect, stageView(bounds, aspect, 35)), `${JSON.stringify(scene)} at ${aspect}`);
  }
});

test("a narrower element moves the camera back, and an empty stage still has a view", () => {
  const { bounds } = mathTimeline({ kind: "count", to: 100 });
  assert.ok(stageView(bounds, 0.5, 35).distance > stageView(bounds, 2, 35).distance);
  const empty = stageView(null, Number.NaN, 35);
  assert.ok(Number.isFinite(empty.distance) && empty.distance > 0);
});

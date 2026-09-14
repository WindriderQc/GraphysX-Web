import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clampDrivers, deriveWeights, NEUTRAL_DRIVERS, poseInto } from "../src/llmx-face-pose.ts";

const asset = JSON.parse(readFileSync(new URL("../src/llmx-face-forge.json", import.meta.url), "utf8"));

function lipRows(levelName, drivers) {
  const w = deriveWeights(asset, levelName);
  const lip = asset.regions.indexOf("lip");
  const pos = new Float32Array(w.count * 3);
  const scale = new Float32Array(w.count);
  poseInto(w, clampDrivers({ ...NEUTRAL_DRIVERS, ...drivers }), pos, scale);
  const half = w.anchors.mouth.halfWidth;
  let corner = 0, cornerN = 0, centre = 0, centreN = 0;
  for (let i = 0; i < w.count; i += 1) {
    if (w.region[i] !== lip) continue;
    const x = Math.abs(w.rest[i * 3]);
    if (w.rest[i * 3 + 2] < w.anchors.mouth.z - 0.05) continue;
    if (x > half * 0.7) { corner += pos[i * 3 + 1]; cornerN += 1; }
    else if (x < half * 0.2) { centre += pos[i * 3 + 1]; centreN += 1; }
  }
  return { corner: corner / cornerN, centre: centre / centreN, cube: w.level.cube };
}

// Owner: "on pourrait le retravailler un peu pour lui donner plus d'émotion, un sourire ?"
for (const levelName of ["high", "mobile"]) {
  test(`${levelName}: warmth lifts the corners of the mouth, not its middle`, () => {
    const rest = lipRows(levelName, {});
    const smile = lipRows(levelName, { warmth: 1 });
    // In metres, not cubes: the same smile is the same size at every density.
    const cornerRise = smile.corner - rest.corner;
    const centreMove = Math.abs(smile.centre - rest.centre);
    assert.ok(cornerRise >= 0.04, `${levelName}: the corners rise ${(cornerRise * 100).toFixed(1)} cm; a smile needs at least 4`);
    assert.ok(centreMove < 0.03, `${levelName}: the middle of the mouth moved ${(centreMove * 100).toFixed(1)} cm; it should stay put`);
    // Severity goes the other way, gently.
    const severe = lipRows(levelName, { warmth: -1 });
    assert.ok(severe.corner < rest.corner, "negative warmth drops the corners");
    assert.ok(rest.corner - severe.corner < smile.corner - rest.corner, "a frown is smaller than a smile");
  });
}

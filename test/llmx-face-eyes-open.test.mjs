import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { AgentWorldVoxelFace } = await importBrowserModule(new URL("../src/agent-world-face.ts", import.meta.url));
const { resolveAgentWorldFace } = await importBrowserModule(new URL("../src/llmx-face-pose.ts", import.meta.url));
const asset = JSON.parse(readFileSync(new URL("../src/llmx-face-forge.json", import.meta.url), "utf8"));

// The eye must show when the lids are open, at every density. At the mobile level the
// sculptor's shell band once let both lids reach across the opening: 0 of 14 iris cubes were
// visible, so every device capped to mobile (KidX on modest hardware, the Household dock on a
// small screen) showed a mask whose eyes never opened. The dense levels show ~60%; the upper
// lid rightly caps the top of the iris.
const METAL = new Set(["lid", "lowerlid", "socket", "brow", "cheek", "cranium"].map(name => asset.regions.indexOf(name)));

function visibleIrisFraction(level) {
  const face = new AgentWorldVoxelFace(resolveAgentWorldFace({ level, autoBlink: false }));
  face.snapDrivers({ build: 1, blink: 0, think: 0, attention: 0.25 });
  const { weights, position } = face;
  const half = weights.level.cube * 0.5;
  const iris = [...face.irisCubes];
  const covered = k => {
    for (let i = 0; i < weights.count; i += 1) {
      if (METAL.has(weights.region[i]) && Math.abs(position[i * 3] - position[k * 3]) < half
        && Math.abs(position[i * 3 + 1] - position[k * 3 + 1]) < half && position[i * 3 + 2] > position[k * 3 + 2]) return true;
    }
    return false;
  };
  const fraction = iris.filter(k => !covered(k)).length / iris.length;
  face.dispose();
  return { fraction, iris: iris.length };
}

for (const level of ["high", "balanced", "mobile"]) {
  test(`open lids leave most of the iris visible at the ${level} level`, () => {
    const { fraction, iris } = visibleIrisFraction(level);
    assert.ok(iris > 0, "the level has an iris");
    assert.ok(fraction >= 0.5, `only ${Math.round(fraction * 100)}% of the iris is visible with the lids open`);
  });
}

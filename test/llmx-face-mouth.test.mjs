import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { deriveWeights } from "../src/llmx-face-pose.ts";
import { classifyMouth, emberLevel, glowWeight, MOUTH_ROLE, mouthDepth, toothReveal, wallTone } from "../src/llmx-face-mouth.ts";

const asset = JSON.parse(readFileSync(new URL("../src/llmx-face-forge.json", import.meta.url), "utf8"));

function interiorOf(level) {
  const w = deriveWeights(asset, level);
  const maw = asset.regions.indexOf("maw");
  const throat = asset.regions.indexOf("throat");
  const cubes = [];
  for (let i = 0; i < w.count; i += 1) if (w.region[i] === maw || w.region[i] === throat) cubes.push(i);
  const positions = new Float32Array(cubes.length * 3);
  const back = cubes.map((i) => w.region[i] === maw);
  cubes.forEach((i, k) => { positions.set(w.rest.subarray(i * 3, i * 3 + 3), k * 3); });
  return { w, interior: classifyMouth(positions, back, w.anchors.mouth, w.level.cube), positions };
}

test("the mouth has two rows of teeth, with gaps between teeth where the grid is fine enough", () => {
  const { interior } = interiorOf("high");
  const roles = [...interior.role];
  const upper = roles.filter((r) => r === MOUTH_ROLE.upperTooth).length;
  const lower = roles.filter((r) => r === MOUTH_ROLE.lowerTooth).length;
  const back = roles.filter((r) => r === MOUTH_ROLE.back).length;
  assert.ok(upper > 10 && lower > 10, `teeth: ${upper} upper, ${lower} lower`);
  assert.ok(back > 100, `the far wall is classified (${back})`);
  const gaps = [...interior.gap].filter(Boolean).length;
  assert.ok(gaps > 0 && gaps < (upper + lower) / 2, `some, not most, tooth cubes are gaps (${gaps})`);
  const mobile = interiorOf("mobile").interior;
  assert.equal([...mobile.gap].filter(Boolean).length, 0, "at 7 cm a tooth gap would be noise");
});

test("the walls darken from the lips to the back", () => {
  const front = wallTone(0);
  const back = wallTone(1);
  for (let c = 0; c < 3; c += 1) assert.ok(front[c] > back[c] * 4);
  assert.equal(mouthDepth(0.44), 0);
  assert.equal(mouthDepth(0.16), 1);
});

test("only the far wall and the deep throat glow; teeth never do", () => {
  assert.equal(glowWeight(MOUTH_ROLE.back, 1), 1);
  assert.equal(glowWeight(MOUTH_ROLE.upperTooth, 1), 0);
  assert.equal(glowWeight(MOUTH_ROLE.wall, 0.2), 0, "the front of the tunnel stays dark");
  assert.ok(glowWeight(MOUTH_ROLE.wall, 0.95) > 0.5, "the deep throat carries the ember");
});

test("a closed, idle mouth shows neither teeth nor light; speech and thought light it", () => {
  assert.equal(toothReveal(0), 0);
  assert.equal(toothReveal(1), 1);
  assert.equal(emberLevel(0, 0, 3), 0);
  assert.ok(emberLevel(0.66, 0, 3) > 0.3 && emberLevel(1, 0, 3) > emberLevel(0.4, 0, 3) * 2, "speaking: the ember follows the opening");
  const breaths = [0, 1, 2, 3, 4].map((t) => emberLevel(0, 1, t));
  assert.ok(Math.min(...breaths) > 0 && Math.max(...breaths) - Math.min(...breaths) > 0.15, "thinking: a slow breath, never out");
});

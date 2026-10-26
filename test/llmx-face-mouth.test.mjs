import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { deriveWeights } from "../src/llmx-face-pose.ts";
import { advanceToothReveal, classifyMouth, emberLevel, glowWeight, MOUTH_LOOK, MOUTH_ROLE, mouthDepth, wallTone } from "../src/llmx-face-mouth.ts";

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

test("the two lower mouth corners stay walls instead of flashing with the teeth", () => {
  const { interior, positions } = interiorOf("high");
  for (const side of [-1, 1]) {
    const corner = [...interior.role.keys()].find(k =>
      Math.abs(positions[k * 3] - side * 0.216) < 1e-5
      && Math.abs(positions[k * 3 + 1] + 0.576) < 1e-5
      && Math.abs(positions[k * 3 + 2] - 0.436) < 1e-5);
    assert.notEqual(corner, undefined, "sample the actual corner cube in the shipped sculpt");
    assert.equal(interior.role[corner], MOUTH_ROLE.wall, `corner ${side} must not follow tooth reveal`);
  }
});

for (const level of ["high", "balanced", "mobile"]) {
  test(`${level}: teeth face the aperture, without extra rows behind them`, () => {
    const { w, interior, positions } = interiorOf(level);
    let teeth = 0;
    for (let k = 0; k < interior.role.length; k += 1) {
      if (![MOUTH_ROLE.upperTooth, MOUTH_ROLE.lowerTooth].includes(interior.role[k])) continue;
      teeth += 1;
      const x = positions[k * 3], y = positions[k * 3 + 1], z = positions[k * 3 + 2];
      const blocked = [...interior.role.keys()].some(j =>
        Math.abs(positions[j * 3] - x) < 1e-5
        && (positions[j * 3 + 1] - w.anchors.mouth.y) * (y - w.anchors.mouth.y) > 0
        && Math.abs(positions[j * 3 + 1] - w.anchors.mouth.y) < Math.abs(y - w.anchors.mouth.y) - 1e-5
        && Math.abs(positions[j * 3 + 2] - z) < 1e-5);
      assert.equal(blocked, false, `tooth at ${x},${y},${z} is behind another cavity cube`);
    }
    assert.ok(teeth > 0, "the regression must still inspect real teeth");
  });
}

test("only the far wall and the deep throat glow; teeth never do", () => {
  assert.equal(glowWeight(MOUTH_ROLE.back, 1), 1);
  assert.equal(glowWeight(MOUTH_ROLE.upperTooth, 1), 0);
  assert.equal(glowWeight(MOUTH_ROLE.wall, 0.2), 0, "the front of the tunnel stays dark");
  assert.ok(glowWeight(MOUTH_ROLE.wall, 0.95) > 0.5, "the deep throat carries the ember");
});

test("teeth stay steady through quiet syllables and short pauses, then fade after silence", () => {
  const state = { value: 0, quietSeconds: 0 };
  const step = (speak, frames) => {
    for (let frame = 0; frame < frames; frame += 1) advanceToothReveal(state, speak, 1 / 60);
  };
  step(0, 60);
  assert.equal(state.value, 0, "idle never reveals teeth by itself");
  step(0.3, 6);
  assert.equal(state.value, 1, "one smooth onset reveals the teeth");
  for (const speak of [1, 0.005, 0, 0.04, 0.8, 0, 0.003]) {
    step(speak, 8);
    assert.equal(state.value, 1, `no flash during a syllable or short pause at speak=${speak}`);
  }
  step(0, Math.floor(MOUTH_LOOK.toothHold * 60));
  assert.equal(state.value, 1, "the short-pause hold does not dim the teeth");
  step(0, 2);
  assert.ok(state.value > 0 && state.value < 1, "the final fade is gradual");
  step(0, Math.ceil(MOUTH_LOOK.toothRelease * 60));
  assert.equal(state.value, 0, "sustained silence leaves no pale line");
});

test("a closed, idle mouth has no light; speech and thought light it", () => {
  assert.equal(emberLevel(0, 0, 3), 0);
  assert.ok(emberLevel(0.66, 0, 3) > 0.3 && emberLevel(1, 0, 3) > emberLevel(0.4, 0, 3) * 2, "speaking: the ember follows the opening");
  const breaths = [0, 1, 2, 3, 4].map((t) => emberLevel(0, 1, t));
  assert.ok(Math.min(...breaths) > 0 && Math.max(...breaths) - Math.min(...breaths) > 0.15, "thinking: a slow breath, never out");
});

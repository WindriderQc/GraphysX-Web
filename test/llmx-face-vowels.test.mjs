import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { clampDrivers, deriveWeights, NEUTRAL_DRIVERS, poseInto } from "../src/llmx-face-pose.ts";

const asset = JSON.parse(readFileSync(new URL("../src/llmx-face-forge.json", import.meta.url), "utf8"));
const weights = deriveWeights(asset, "high");
const lip = asset.regions.indexOf("lip");
const { mouth } = weights.anchors;
const cube = weights.level.cube;

function pose(drivers) {
  const position = new Float32Array(weights.count * 3);
  const scale = new Float32Array(weights.count);
  poseInto(weights, clampDrivers({ ...NEUTRAL_DRIVERS, build: 1, ...drivers }), position, scale);
  return { position, scale };
}

/** Front lip cubes: the outer rim the viewer sees. */
const frontLips = [];
for (let i = 0; i < weights.count; i += 1) {
  if (weights.region[i] === lip && weights.rest[i * 3 + 2] > mouth.z) frontLips.push(i);
}

/** Width of the mouth's opening: the widest posed lip cube near the mouth line. */
function cornerX(p) {
  let max = 0;
  for (const i of frontLips) {
    if (Math.abs(weights.rest[i * 3 + 1] - mouth.y) > 0.05) continue;
    max = Math.max(max, Math.abs(p.position[i * 3]));
  }
  return max;
}

/** Height of the opening at the middle: lowest upper-lip cube to highest lower-lip cube. */
function middleHeight(p) {
  let upper = Infinity;
  let lower = -Infinity;
  for (const i of frontLips) {
    if (Math.abs(weights.rest[i * 3]) > cube * 1.5) continue;
    const y = p.position[i * 3 + 1];
    if (weights.rest[i * 3 + 1] >= mouth.y) upper = Math.min(upper, y - p.scale[i] * cube / 2);
    else lower = Math.max(lower, y + p.scale[i] * cube / 2);
  }
  return upper - lower;
}

test("an 'o' is narrower and taller than an 'i', and both differ visibly from neutral", () => {
  const round = pose({ speak: 0.8, speakTone: 0 });
  const neutral = pose({ speak: 0.8, speakTone: 0.5 });
  const spread = pose({ speak: 0.8, speakTone: 1 });
  assert.ok(cornerX(spread) - cornerX(round) > 0.06, `corners: o ${cornerX(round).toFixed(3)}, i ${cornerX(spread).toFixed(3)} m`);
  assert.ok(middleHeight(round) > middleHeight(spread) * 1.4, `height: o ${middleHeight(round).toFixed(3)}, i ${middleHeight(spread).toFixed(3)} m`);
  assert.ok(cornerX(round) < cornerX(neutral) && cornerX(neutral) < cornerX(spread));
});

test("a bright vowel spreads the lips without splitting them down the middle", () => {
  const key = (x, y, z) => `${Math.round(x / cube)}|${Math.round(y / cube)}|${Math.round(z / cube)}`;
  const byCell = new Map(frontLips.map((i) => [key(weights.rest[i * 3], weights.rest[i * 3 + 1], weights.rest[i * 3 + 2]), i]));
  for (const speakTone of [0.75, 1]) {
    const p = pose({ speak: 1, speakTone });
    // Each front lip cube near the axis and its direct neighbour toward +x: they must still touch.
    let worst = 0;
    let pairs = 0;
    for (const i of frontLips) {
      const x = weights.rest[i * 3];
      if (Math.abs(x) > cube * 1.6) continue;
      const j = byCell.get(key(x + cube, weights.rest[i * 3 + 1], weights.rest[i * 3 + 2]));
      if (j === undefined) continue;
      pairs += 1;
      const gap = (p.position[j * 3] - p.position[i * 3]) - (p.scale[i] + p.scale[j]) * cube / 2;
      worst = Math.max(worst, gap / cube);
    }
    assert.ok(pairs > 4, `found the centre-line neighbours (${pairs})`);
    assert.ok(worst < 0.2, `tone ${speakTone}: the lips part by ${worst.toFixed(2)} cubes at the centre line`);
  }
});

test("silence never shapes the mouth: tone has no effect while the mouth is closed", () => {
  const a = pose({ speak: 0, speakTone: 0 });
  const b = pose({ speak: 0, speakTone: 1 });
  for (const i of frontLips) assert.equal(a.position[i * 3], b.position[i * 3]);
});

/**
 * Worst gap between rest-adjacent shell cubes around the mouth, in cubes, ignoring the aperture
 * itself (upper and lower lip parting is the point). Same measure as the brow's seam test, over
 * all 26 neighbours because the corners move sideways.
 */
function mouthSeam(level, drivers) {
  const w = deriveWeights(asset, level);
  const c = w.level.cube;
  const names = asset.regions;
  const skip = new Set(["eye", "iris", "pupil", "maw", "throat"].map((n) => names.indexOf(n)));
  const lipIndex = names.indexOf("lip");
  const key = (x, y, z) => `${Math.round(x / c)}|${Math.round(y / c)}|${Math.round(z / c)}`;
  const index = new Map();
  for (let i = 0; i < w.count; i += 1) index.set(key(w.rest[i * 3], w.rest[i * 3 + 1], w.rest[i * 3 + 2]), i);
  const position = new Float32Array(w.count * 3);
  const scale = new Float32Array(w.count);
  poseInto(w, clampDrivers({ ...NEUTRAL_DRIVERS, build: 1, ...drivers }), position, scale);
  const my = w.anchors.mouth.y;
  let worst = 0;
  for (let i = 0; i < w.count; i += 1) {
    if (skip.has(w.region[i])) continue;
    const x = w.rest[i * 3], y = w.rest[i * 3 + 1], z = w.rest[i * 3 + 2];
    if (y < -0.8 || y > -0.3) continue;
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
      if (!dx && !dy && !dz) continue;
      const j = index.get(key(x + dx * c, y + dy * c, z + dz * c));
      if (j === undefined || j < i || skip.has(w.region[j])) continue;
      const across = w.region[i] === lipIndex && w.region[j] === lipIndex && Math.sign(y - my) !== Math.sign(w.rest[j * 3 + 1] - my);
      if (across) continue;
      let open = -Infinity;
      for (let a = 0; a < 3; a += 1) open = Math.max(open, Math.abs(position[j * 3 + a] - position[i * 3 + a]) - (scale[i] + scale[j]) * c / 2);
      worst = Math.max(worst, open / c);
    }
  }
  return worst;
}

for (const level of ["high", "mobile"]) {
  test(`${level}: every vowel keeps the mouth's shell closed around the aperture`, () => {
    const neutral = mouthSeam(level, { speak: 1, speakTone: 0.5 });
    for (const speakTone of [0, 0.25, 0.75, 1]) {
      const worst = mouthSeam(level, { speak: 1, speakTone });
      assert.ok(worst <= Math.max(0.4, neutral + 0.15), `${level} tone ${speakTone}: worst seam ${worst.toFixed(2)} cubes (neutral ${neutral.toFixed(2)})`);
    }
  });
}

// The face is the one part of LLMx a human judges by looking at it, which is exactly why its
// maths needs tests that do not: a screenshot shows you the pose you rendered, not the pose you
// would have got from a hostile driver, a stale asset, or the mobile level of detail.
//
// These tests are written against the two things that can silently go wrong without anyone
// noticing on screen — a movement escaping its bound, and a level of detail quietly becoming a
// different face.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

import {
  FACE_FORMAT,
  FaceAssetError,
  NEUTRAL_DRIVERS,
  POSE_LIMITS,
  SUPPORTED_FACE_VERSION,
  assertSupportedFace,
  buildScale,
  clampDrivers,
  deriveWeights,
  eyeTransform,
  hash01,
  poseInto,
} from "../src/llmx-face-pose.ts";

const asset = JSON.parse(readFileSync(new URL("../src/llmx-face-forge.json", import.meta.url), "utf8"));

const buffers = (weights) => ({
  position: new Float32Array(weights.count * 3),
  scale: new Float32Array(weights.count),
});

/** Pose with everything at rest, so any movement in the result is the thing under test. */
const AT_REST = { ...NEUTRAL_DRIVERS, attention: 0, breath: 0 };

describe("face asset acceptance", () => {
  it("accepts the shipped mask", () => {
    assert.equal(asset.format, FACE_FORMAT);
    assert.equal(asset.version, SUPPORTED_FACE_VERSION);
    assert.doesNotThrow(() => assertSupportedFace(asset));
  });

  it("refuses a future version instead of animating it wrongly", () => {
    assert.throws(() => assertSupportedFace({ ...asset, version: SUPPORTED_FACE_VERSION + 1 }), FaceAssetError);
  });

  it("refuses a foreign format", () => {
    assert.throws(() => assertSupportedFace({ ...asset, format: "something.else" }), FaceAssetError);
  });

  it("refuses an unknown level of detail by name", () => {
    assert.throws(() => deriveWeights(asset, "ultra"), FaceAssetError);
  });

  it("records its own provenance as original work", () => {
    assert.equal(asset.provenance.origin, "original");
    assert.match(asset.provenance.note, /signed distance fields/i);
  });
});

describe("derived weights", () => {
  const weights = deriveWeights(asset, "high");

  it("unpacks every cube the asset declares", () => {
    assert.equal(weights.count, asset.levels.find((l) => l.name === "high").count);
    assert.equal(weights.rest.length, weights.count * 3);
    assert.ok(weights.animatedCount > 0 && weights.animatedCount < weights.count);
  });

  it("tags every cube with a region the asset names", () => {
    for (let i = 0; i < weights.count; i += 1) {
      assert.ok(asset.regions[weights.region[i]] !== undefined, `cube ${i} has no region`);
    }
  });

  it("puts animated cubes first, so the rig can slice instead of filter", () => {
    const animatedRegions = new Set(["brow", "socket", "eye", "lid", "cheek", "nose", "jaw", "lip"]);
    for (let i = 0; i < weights.animatedCount; i += 1) {
      assert.ok(animatedRegions.has(asset.regions[weights.region[i]]), `cube ${i} is static but placed in the animated slice`);
    }
    for (let i = weights.animatedCount; i < weights.count; i += 1) {
      assert.ok(!animatedRegions.has(asset.regions[weights.region[i]]), `cube ${i} is animated but placed in the static slice`);
    }
  });

  it("does not let the jaw weight leak above the hinge", () => {
    for (let i = 0; i < weights.count; i += 1) {
      if (weights.rest[i * 3 + 1] > weights.anchors.jawHinge.y) {
        assert.equal(weights.jaw[i], 0, `cube ${i} sits above the hinge but carries jaw weight`);
      }
    }
  });

  it("keeps every weight inside 0..1", () => {
    for (const name of ["jaw", "lip", "brow", "cheek", "rise"]) {
      for (let i = 0; i < weights.count; i += 1) {
        const value = weights[name][i];
        assert.ok(value >= 0 && value <= 1, `${name}[${i}] = ${value}`);
      }
    }
  });
});

describe("driver bounds", () => {
  it("clamps an over-driven input rather than trusting it", () => {
    const clamped = clampDrivers({ speak: 99, blink: -4, gazeX: 12, warmth: -9 });
    assert.equal(clamped.speak, 1);
    assert.equal(clamped.blink, 0);
    assert.equal(clamped.gazeX, 1);
    assert.equal(clamped.warmth, -1);
  });

  it("treats a non-finite driver as its minimum, not as NaN geometry", () => {
    const clamped = clampDrivers({ speak: Number.NaN, gazeY: Number.POSITIVE_INFINITY, breath: Number.NaN });
    assert.equal(clamped.speak, 0);
    assert.equal(clamped.gazeY, -1);
    assert.equal(clamped.breath, 0);
  });
});

describe("posing", () => {
  const weights = deriveWeights(asset, "high");

  it("leaves the mask at its rest pose when nothing is driving it", () => {
    const out = buffers(weights);
    poseInto(weights, AT_REST, out.position, out.scale);
    for (let i = 0; i < weights.count * 3; i += 1) {
      assert.ok(Math.abs(out.position[i] - weights.rest[i]) < 1e-6, `component ${i} moved at rest`);
    }
  });

  // The thing that has to be true for a mask to look like it is talking is that the *lips
  // separate*. Testing the chin instead is how the hinge shipped rotating the wrong way: the
  // chin was moving, so a chin assertion would have passed while the mouth clamped shut.
  const lipGap = (position) => {
    const lipRegion = asset.regions.indexOf("lip");
    let upper = 0;
    let upperCount = 0;
    let lower = 0;
    let lowerCount = 0;
    for (let i = 0; i < weights.count; i += 1) {
      if (weights.region[i] !== lipRegion) continue;
      const y = position[i * 3 + 1];
      if (weights.rest[i * 3 + 1] >= weights.anchors.mouth.y) {
        upper += y;
        upperCount += 1;
      } else {
        lower += y;
        lowerCount += 1;
      }
    }
    assert.ok(upperCount > 0 && lowerCount > 0, "the mask has no upper or no lower lip");
    return upper / upperCount - lower / lowerCount;
  };

  it("separates the lips when speech drives it", () => {
    const out = buffers(weights);
    poseInto(weights, { ...AT_REST, speak: 1 }, out.position, out.scale);
    const opened = lipGap(out.position);
    const closed = lipGap(weights.rest);
    assert.ok(opened > closed + 0.04, `mouth barely opened: ${closed.toFixed(3)}m to ${opened.toFixed(3)}m`);
  });

  it("opens progressively, so a quiet passage is not a shout", () => {
    const out = buffers(weights);
    let previous = -Infinity;
    for (const speak of [0, 0.25, 0.5, 0.75, 1]) {
      poseInto(weights, { ...AT_REST, speak }, out.position, out.scale);
      const gap = lipGap(out.position);
      assert.ok(gap > previous, `mouth did not widen from speak ${speak}`);
      previous = gap;
    }
  });

  it("swings the chin down and back, the way a hinge behind it must", () => {
    const out = buffers(weights);
    poseInto(weights, { ...AT_REST, speak: 1 }, out.position, out.scale);
    let chin = 0;
    for (let i = 1; i < weights.count; i += 1) {
      if (weights.rest[i * 3 + 1] < weights.rest[chin * 3 + 1]) chin = i;
    }
    assert.ok(out.position[chin * 3 + 1] < weights.rest[chin * 3 + 1], "chin rose instead of dropping");
    assert.ok(out.position[chin * 3 + 2] < weights.rest[chin * 3 + 2], "chin advanced instead of retracting");
  });

  it("never moves a cube further than the authored limits allow", () => {
    const out = buffers(weights);
    // Every driver at once, at its extreme: the worst case a caller can ask for.
    poseInto(
      weights,
      { build: 1, speak: 1, speakTone: 1, blink: 1, gazeX: 1, gazeY: 1, attention: 1, think: 1, warmth: 1, breath: 1.2 },
      out.position,
      out.scale,
    );
    // The jaw is a rotation, so its reach is the hinge-to-chin radius times the angle, plus the
    // additive contributions. A cube leaving this envelope means the mask has dislocated.
    const span = Math.abs(weights.anchors.chin.y - weights.anchors.jawHinge.y) + 0.4;
    const ceiling = span * POSE_LIMITS.jawRadians + POSE_LIMITS.lipSpread + POSE_LIMITS.browLift
      + POSE_LIMITS.browThinkWave + POSE_LIMITS.cheekLift + POSE_LIMITS.breathAmplitude;
    for (let i = 0; i < weights.count; i += 1) {
      const travel = Math.hypot(
        out.position[i * 3] - weights.rest[i * 3],
        out.position[i * 3 + 1] - weights.rest[i * 3 + 1],
        out.position[i * 3 + 2] - weights.rest[i * 3 + 2],
      );
      assert.ok(travel <= ceiling, `cube ${i} travelled ${travel.toFixed(4)}m, ceiling ${ceiling.toFixed(4)}m`);
    }
  });

  it("stays symmetric when the drivers are symmetric", () => {
    const out = buffers(weights);
    poseInto(weights, { ...AT_REST, speak: 0.8, warmth: 1, attention: 1 }, out.position, out.scale);

    // Index cubes by their mirrored rest position and check the pair moved as a mirror image.
    const key = (x, y, z) => `${Math.round(x * 1000)}|${Math.round(y * 1000)}|${Math.round(z * 1000)}`;
    const byKey = new Map();
    for (let i = 0; i < weights.count; i += 1) {
      byKey.set(key(weights.rest[i * 3], weights.rest[i * 3 + 1], weights.rest[i * 3 + 2]), i);
    }
    let pairs = 0;
    for (let i = 0; i < weights.count; i += 1) {
      const mirror = byKey.get(key(-weights.rest[i * 3], weights.rest[i * 3 + 1], weights.rest[i * 3 + 2]));
      if (mirror === undefined || mirror === i) continue;
      pairs += 1;
      assert.ok(
        Math.abs(out.position[i * 3] + out.position[mirror * 3]) < 1e-5,
        `cube ${i} and its mirror ${mirror} are not symmetric in x`,
      );
      assert.ok(
        Math.abs(out.position[i * 3 + 1] - out.position[mirror * 3 + 1]) < 1e-5,
        `cube ${i} and its mirror ${mirror} disagree in y`,
      );
    }
    assert.ok(pairs > 100, `expected a symmetric mask, only found ${pairs} mirrored cubes`);
  });

  it("honours the limit, so the rig can pose only the animated slice", () => {
    const out = buffers(weights);
    out.position.fill(-999);
    const written = poseInto(weights, { ...AT_REST, speak: 1 }, out.position, out.scale, weights.animatedCount);
    assert.equal(written, weights.animatedCount);
    assert.equal(out.position[weights.animatedCount * 3], -999, "wrote past the requested limit");
  });
});

describe("assembly", () => {
  it("is absent at the start and whole at the end", () => {
    for (const rise of [0, 0.5, 1]) {
      assert.equal(buildScale(rise, 0, 7), 0);
      assert.equal(buildScale(rise, 1, 7), 1);
    }
  });

  it("builds bottom-up: a low cube arrives before a high one", () => {
    // Midway through the build the chin must be present and the crown must not.
    assert.ok(buildScale(0.05, 0.45, 3) > 0.9, "the chin should be placed by mid-build");
    assert.equal(buildScale(0.98, 0.45, 3), 0, "the crown should not exist yet at mid-build");
  });

  it("assembles the same way every time", () => {
    const once = Array.from({ length: 64 }, (_, i) => buildScale(i / 64, 0.5, i));
    const twice = Array.from({ length: 64 }, (_, i) => buildScale(i / 64, 0.5, i));
    assert.deepEqual(once, twice);
    assert.ok(hash01(11) !== hash01(12), "the per-cube offset must actually vary");
    for (let i = 0; i < 500; i += 1) {
      const h = hash01(i);
      assert.ok(h >= 0 && h < 1, `hash01(${i}) = ${h}`);
    }
  });
});

describe("eyes", () => {
  const { anchors } = deriveWeights(asset, "high");

  it("keeps gaze inside its authored cone", () => {
    const hard = eyeTransform(anchors, { gazeX: 9, gazeY: -9 });
    assert.equal(hard.yaw, POSE_LIMITS.gazeRadians);
    assert.equal(hard.pitch, -POSE_LIMITS.gazeRadians * 0.6);
  });

  it("closes fully on a blink and dims while closed", () => {
    const open = eyeTransform(anchors, { blink: 0, attention: 1 });
    const shut = eyeTransform(anchors, { blink: 1, attention: 1 });
    assert.ok(shut.lidRadians > open.lidRadians);
    assert.ok(shut.glow < open.glow, "a shut eye must not glow brighter than an open one");
    assert.ok(shut.glow >= 0);
  });
});

describe("level of detail", () => {
  it("is the same face at every density", () => {
    const levels = asset.levels.map((level) => deriveWeights(asset, level.name));
    const [reference] = levels;
    for (const weights of levels.slice(1)) {
      for (let axis = 0; axis < 6; axis += 1) {
        const drift = Math.abs(weights.bounds[axis] - reference.bounds[axis]);
        // One cube of tolerance: a coarser grid samples the same surface at coarser centres.
        assert.ok(
          drift <= weights.level.cube * 1.5,
          `${weights.level.name} bound ${axis} drifted ${drift.toFixed(3)}m from high`,
        );
      }
    }
  });

  it("keeps a mouth, eyes and a brow at the lowest density", () => {
    const mobile = asset.levels.find((level) => level.name === "mobile");
    for (const region of ["eye", "lid", "lip", "brow", "jaw"]) {
      assert.ok((mobile.regionCounts[region] ?? 0) > 10, `mobile lost ${region}: ${mobile.regionCounts[region] ?? 0} cubes`);
    }
  });
});

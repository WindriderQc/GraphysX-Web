import assert from "node:assert/strict";
import { test } from "node:test";
import { createLlmXEntrance } from "../src/llmx-entrance.ts";
import { llmxFacePresentation } from "../src/llmx-presentation.ts";

const timing = { cameraSeconds: 8, assemblyDelaySeconds: 2, assemblySeconds: 4 };

test("LLMx waits for assets and for both visual tracks, not for a frame count", () => {
  const entrance = createLlmXEntrance(timing);
  assert.equal(entrance.advance(20).phase, "loading");
  assert.equal(entrance.assetsReady().phase, "entering");
  assert.equal(entrance.advance(2).assembly, 0);
  assert.equal(entrance.advance(2).assembly, 0.5);
  assert.equal(entrance.assetsReady().elapsedSeconds, 4);
  assert.deepEqual(entrance.advance(2), { phase: "entering", elapsedSeconds: 6, assembly: 1, cameraProgress: 0.75 });
  assert.equal(entrance.advance(2).phase, "ready");
  assert.equal(entrance.advance(100).elapsedSeconds, 8);
});

test("LLMx skip and reduced motion still wait for actual assets", () => {
  for (const reduced of [false, true]) {
    const entrance = createLlmXEntrance(timing, reduced);
    if (!reduced) entrance.skip();
    assert.equal(entrance.state().phase, "loading");
    assert.equal(entrance.assetsReady().phase, "ready");
    assert.equal(entrance.state().assembly, 1);
  }
  const entrance = createLlmXEntrance(timing);
  entrance.assetsReady(); entrance.advance(1);
  assert.equal(entrance.skip().phase, "ready");
});

test("LLMx exit prevents a late asset callback from reviving the entrance", () => {
  const entrance = createLlmXEntrance(timing);
  entrance.dispose();
  entrance.assetsReady(); entrance.skip(); entrance.advance(20); entrance.dispose();
  assert.deepEqual(entrance.state(), { phase: "disposed", elapsedSeconds: 0, assembly: 0, cameraProgress: 0 });
});

test("LLMx handles zero-duration tracks and snapshots the authored timing", () => {
  const mutable = { cameraSeconds: 0, assemblyDelaySeconds: 2, assemblySeconds: 0 };
  const entrance = createLlmXEntrance(mutable);
  mutable.assemblyDelaySeconds = 100;
  assert.equal(entrance.assetsReady().cameraProgress, 1);
  assert.equal(entrance.advance(1).assembly, 0);
  assert.equal(entrance.advance(1).phase, "ready");
  assert.equal(entrance.state().assembly, 1);
  assert.equal(createLlmXEntrance({ cameraSeconds: 0, assemblyDelaySeconds: 0, assemblySeconds: 0 }).assetsReady().phase, "ready");
});

test("LLMx rejects invalid timing and time without changing the visual state", () => {
  for (const value of [-1, NaN, Infinity]) {
    assert.throws(() => createLlmXEntrance({ ...timing, cameraSeconds: value }), RangeError);
    const entrance = createLlmXEntrance(timing); entrance.assetsReady();
    assert.throws(() => entrance.advance(value), RangeError);
    assert.equal(entrance.state().elapsedSeconds, 0);
  }
});

test("LLMx mouth follows playing speech even after generation ends, and closes during buffering", () => {
  const speech = { playing: true, amplitude: 0.7, brightness: 0.8 };
  assert.equal(llmxFacePresentation({ assembly: 1, phase: "idle", speech }).speak, 0.7);
  const buffered = llmxFacePresentation({ assembly: 1, phase: "generating", speech: { ...speech, playing: false } });
  assert.equal(buffered.speak, 0);
  assert.equal(buffered.think, 1);
  const concurrent = llmxFacePresentation({ assembly: 1, phase: "generating", speech });
  assert.equal(concurrent.speak, 0.7);
  assert.equal(concurrent.think, 0);
});

test("LLMx silent playback and untrusted numeric samples cannot open or explode the face", () => {
  const silent = llmxFacePresentation({ assembly: 1, phase: "idle", speech: { playing: true, amplitude: 0, brightness: 0.5 } });
  assert.equal(silent.speak, 0);
  const corrupt = llmxFacePresentation({ assembly: NaN, phase: "interrupted", speech: { playing: true, amplitude: Infinity, brightness: NaN } });
  assert.equal(corrupt.build, 0);
  assert.equal(corrupt.speak, 0);
  assert.equal(corrupt.speakTone, 0.5);
  assert.equal(corrupt.think, 0);
});

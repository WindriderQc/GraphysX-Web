import test from "node:test";
import assert from "node:assert/strict";
import { RenderDiagnostics } from "../src/render-diagnostics.ts";
import { sampleMainRenderFrames } from "../scripts/render-budget-sampler.mjs";

function fixture() {
  const listeners = new Set(), diagnostics = new RenderDiagnostics();
  const renderer = { info: { autoReset: true, render: { calls: 0, triangles: 0 } } };
  let disposals = 0;
  return {
    host: { renderer, diagnostics, subscribeAfterRender: listener => {
      listeners.add(listener); return () => { if (listeners.delete(listener)) disposals++; };
    } },
    listeners,
    get disposals() { return disposals; },
    draw(calls, triangles) {
      // Match PlatformHost: reset per frame, record the complete main draw, then allow insets.
      renderer.info.render = { calls, triangles };
      diagnostics.record("desktop", 16, 3, { calls, triangles, geometries: 1, textures: 1 });
      renderer.info.render = { calls: 1, triangles: 2 }; // An independent inset may reset raw info.
      for (const listener of listeners) listener();
    },
  };
}

test("render budget sums all 24 complete frames despite per-frame resets, auxiliary cadence and inset counters", async () => {
  const f = fixture(), pending = sampleMainRenderFrames({ sampleFrames: 24, timeoutMs: 1000 }, f.host);
  for (let frame = 0; frame < 24; frame++) f.draw(frame % 2 ? 200 : 100, frame % 2 ? 4000 : 2000);
  const result = await pending;
  assert.equal(result.frames, 24); assert.equal(result.timedOut, false);
  assert.deepEqual(result.totals, { calls: 3600, triangles: 72000 });
  assert.equal(result.callsPerFrame, 150); assert.equal(result.trianglesPerFrame, 3000);
  assert.equal(f.host.renderer.info.autoReset, true); assert.deepEqual(f.host.renderer.info.render, { calls: 1, triangles: 2 });
  assert.equal(f.listeners.size, 0); assert.equal(f.disposals, 1);
  f.draw(9999, 999999); assert.equal(result.totals.calls, 3600, "Sampling stops exactly at its frame limit");
});

test("render budget timeout retains only completed frames and releases its subscription", async () => {
  const f = fixture(), pending = sampleMainRenderFrames({ sampleFrames: 24, timeoutMs: 20 }, f.host);
  f.draw(100, 2000); f.draw(200, 4000);
  const result = await pending;
  assert.equal(result.timedOut, true); assert.equal(result.frames, 2);
  assert.deepEqual(result.totals, { calls: 300, triangles: 6000 }); assert.equal(result.callsPerFrame, 150);
  assert.equal(f.listeners.size, 0); assert.equal(f.disposals, 1);
});

test("invalid render counts reject sampling and release its subscription", async () => {
  const f = fixture(), pending = sampleMainRenderFrames({ sampleFrames: 24, timeoutMs: 1000 }, f.host);
  f.draw(NaN, 4000);
  await assert.rejects(pending, /Invalid main-frame render counts/);
  assert.equal(f.listeners.size, 0); assert.equal(f.disposals, 1);
});

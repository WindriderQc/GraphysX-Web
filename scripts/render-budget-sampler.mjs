/** Serializable by Playwright; observe complete main frames without changing renderer counters. */
export function sampleMainRenderFrames({ sampleFrames = 24, timeoutMs }, host = globalThis.__GRAPHYSX_HOST__) {
  if (!Number.isSafeInteger(sampleFrames) || sampleFrames <= 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("A positive frame count and timeout are required");
  }
  if (!host?.subscribeAfterRender || !host.diagnostics?.snapshot) throw new Error("Main-frame diagnostics are required");
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    let frames = 0, finished = false, unsubscribe = () => {};
    const totals = { calls: 0, triangles: 0 };
    const finish = (timedOut, error) => {
      if (finished) return;
      finished = true; clearTimeout(timer); unsubscribe();
      if (error) { reject(error); return; }
      resolve({
        frames, timedOut, elapsedMs: Number((performance.now() - startedAt).toFixed(1)), totals: { ...totals },
        callsPerFrame: frames ? Number((totals.calls / frames).toFixed(2)) : null,
        trianglesPerFrame: frames ? Number((totals.triangles / frames).toFixed(1)) : null,
        measurement: "Sum of completed main-frame diagnostics, before independent inset renders",
      });
    };
    const timer = setTimeout(() => finish(true), timeoutMs);
    try {
      unsubscribe = host.subscribeAfterRender(() => {
        try {
          // The host resets renderer.info every main frame and records these counts before insets.
          const { calls, triangles } = host.diagnostics.snapshot();
          if (![calls, triangles].every(value => Number.isFinite(value) && value >= 0)) throw new Error("Invalid main-frame render counts");
          totals.calls += calls; totals.triangles += triangles; frames++;
          if (frames === sampleFrames) finish(false);
        } catch (error) { finish(false, error); }
      });
      if (finished) unsubscribe();
    } catch (error) { finish(false, error); }
  });
}

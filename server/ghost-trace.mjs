// Ghost trace validation — the server's authority on what a shared recording may contain.
//
// The client already validates traces on both its write and read paths
// (`src/level-ghosts.ts`). These bounds mirror those exactly, and the results smoke asserts
// the two agree by reading the numbers out of both files: a cap that drifts between client
// and server is a cap that does not exist.
//
// One rule here is deliberately STRICTER than the client. The client never checks that
// sample times ascend, because its playback binary-searches and simply produces nonsense on
// an unsorted trace — a latent gap, harmless while the only writer is the recorder that
// produced it in order. A trace arriving over HTTP has no such guarantee, and a shared ghost
// is by definition something someone else recorded.

/** Matches SAMPLE_INTERVAL_MS / MAX_SAMPLES in src/level-ghosts.ts. 15 minutes at 150ms. */
export const GHOST_MAX_SAMPLES = 6000;
export const GHOST_SAMPLE_INTERVAL_MS = 150;
/** ~400KB of JSON at the sample cap; this bounds the request before parsing it. */
export const GHOST_MAX_BYTES = 768 * 1024;
/** A run longer than this is not a lap time, it is a stuck tab. */
export const GHOST_MAX_DURATION_MS = 6 * 60 * 60 * 1000;

export class GhostError extends Error {
  constructor(message) {
    super(message);
    this.name = "GhostError";
    this.status = 422;
    this.code = "ghost-rejected";
  }
}

function assertSample(sample, index) {
  if (!sample || typeof sample !== "object") throw new GhostError(`Ghost sample ${index} must be an object`);
  if (!Number.isFinite(sample.tMs) || sample.tMs < 0) throw new GhostError(`Ghost sample ${index} needs a finite, non-negative tMs`);
  if (!Array.isArray(sample.position) || sample.position.length !== 3) {
    throw new GhostError(`Ghost sample ${index} needs a three-component position`);
  }
  for (const component of sample.position) {
    if (!Number.isFinite(component)) throw new GhostError(`Ghost sample ${index} has a non-finite position component`);
  }
}

/**
 * Validates and normalises a trace. Returns `{ elapsedMs, samples }` — the same shape
 * `src/level-ghosts.ts` persists, so a downloaded ghost plays back through the existing
 * interpolator with no conversion.
 */
export function validateGhostTrace(trace, { elapsedMs } = {}) {
  if (!trace || typeof trace !== "object") throw new GhostError("A ghost trace object is required");
  if (!Array.isArray(trace.samples)) throw new GhostError("Ghost samples must be an array");
  if (trace.samples.length < 2) throw new GhostError("A ghost trace needs at least two samples");
  if (trace.samples.length > GHOST_MAX_SAMPLES) {
    throw new GhostError(`A ghost trace may hold at most ${GHOST_MAX_SAMPLES} samples`);
  }
  const duration = Number(trace.elapsedMs);
  if (!Number.isFinite(duration) || duration <= 0) throw new GhostError("A ghost trace needs a positive elapsedMs");
  if (duration > GHOST_MAX_DURATION_MS) throw new GhostError("Ghost trace duration is implausible");

  let previous = -1;
  trace.samples.forEach((sample, index) => {
    assertSample(sample, index);
    // Strictly ascending: equal timestamps make the playback interpolation's span-clamp
    // meaningless, and descending ones make its binary search return the wrong segment.
    if (sample.tMs <= previous) throw new GhostError(`Ghost sample ${index} does not advance in time`);
    previous = sample.tMs;
  });

  const last = trace.samples[trace.samples.length - 1].tMs;
  // The recording must describe the run it claims to be. A trace whose samples stop long
  // before the finish is either truncated or belongs to a different run; either way it is
  // not evidence of this time. One sample interval of slack covers the final forced sample.
  if (last > duration + GHOST_SAMPLE_INTERVAL_MS) {
    throw new GhostError("Ghost samples run past the trace duration");
  }
  if (elapsedMs !== undefined && Math.abs(duration - elapsedMs) > GHOST_SAMPLE_INTERVAL_MS) {
    throw new GhostError(`Ghost duration ${duration}ms does not match the submitted time ${elapsedMs}ms`);
  }

  return {
    elapsedMs: Math.round(duration),
    samples: trace.samples.map((sample) => ({ tMs: Math.round(sample.tMs), position: sample.position.map(Number) })),
  };
}

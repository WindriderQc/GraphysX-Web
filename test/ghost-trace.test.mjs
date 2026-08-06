import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GHOST_MAX_DURATION_MS,
  GHOST_MAX_SAMPLES,
  GHOST_SAMPLE_INTERVAL_MS,
  validateGhostTrace,
} from "../server/ghost-trace.mjs";

const sample = (tMs, x = 0) => ({ tMs, position: [x, 0, 0] });
const trace = (elapsedMs, samples) => ({ elapsedMs, samples });
const rejects = (value, options, why) =>
  assert.throws(() => validateGhostTrace(value, options), (error) => error.status === 422 && error.code === "ghost-rejected", why);

describe("validateGhostTrace", () => {
  it("accepts and normalises a well-formed trace", () => {
    const result = validateGhostTrace(trace(600.4, [sample(0), sample(150.6, 1), sample(600.2, 2)]));
    assert.equal(result.elapsedMs, 600);
    assert.deepEqual(result.samples.map((entry) => entry.tMs), [0, 151, 600]);
    assert.deepEqual(result.samples[1].position, [1, 0, 0]);
  });

  it("rejects a trace that is not an object, or has no samples array", () => {
    rejects(null, {}, "null accepted");
    rejects({ elapsedMs: 100 }, {}, "missing samples accepted");
    rejects(trace(100, "not-an-array"), {}, "string samples accepted");
  });

  it("needs at least two samples to interpolate between", () => {
    rejects(trace(100, []), {});
    rejects(trace(100, [sample(0)]), {});
  });

  it("refuses more samples than the client can produce", () => {
    const samples = Array.from({ length: GHOST_MAX_SAMPLES + 1 }, (_, index) => sample(index));
    rejects(trace(GHOST_MAX_SAMPLES + 1, samples), {});
  });

  it("needs a positive, plausible duration", () => {
    rejects(trace(0, [sample(0), sample(1)]), {});
    rejects(trace(-5, [sample(0), sample(1)]), {});
    rejects(trace(Number.NaN, [sample(0), sample(1)]), {});
    rejects(trace(GHOST_MAX_DURATION_MS + 1, [sample(0), sample(1)]), {});
  });

  it("requires a finite three-component position on every sample", () => {
    rejects(trace(100, [sample(0), { tMs: 50, position: [0, 0] }]), {});
    rejects(trace(100, [sample(0), { tMs: 50, position: [0, Number.NaN, 0] }]), {});
    rejects(trace(100, [sample(0), { tMs: 50, position: [0, Number.POSITIVE_INFINITY, 0] }]), {});
    rejects(trace(100, [sample(0), { tMs: 50 }]), {});
    rejects(trace(100, [sample(0), null]), {});
  });

  it("requires strictly ascending sample times", () => {
    // Deliberately stricter than the client, which never checks: its playback binary-searches
    // and simply produces nonsense on an unsorted trace. That is a latent gap while the only
    // writer is the recorder that produced it in order, and a shared ghost is by definition
    // something someone else recorded.
    rejects(trace(300, [sample(0), sample(200), sample(100)]), {}, "descending accepted");
    rejects(trace(300, [sample(0), sample(100), sample(100)]), {}, "equal timestamps accepted");
  });

  it("refuses a recording whose samples run past the time it claims", () => {
    rejects(trace(1000, [sample(0), sample(1000 + GHOST_SAMPLE_INTERVAL_MS + 1)]), {});
    // One sample interval of slack covers the final forced sample.
    assert.ok(validateGhostTrace(trace(1000, [sample(0), sample(1000 + GHOST_SAMPLE_INTERVAL_MS)])));
  });

  it("refuses a recording that does not match the time it was submitted with", () => {
    // The trace is meant to be evidence of *this* run. A duration that disagrees with the
    // submitted time means it is truncated or belongs to a different run; either way it is
    // not evidence of the time it is attached to.
    rejects(trace(1000, [sample(0), sample(900)]), { elapsedMs: 5000 });
    assert.ok(validateGhostTrace(trace(1000, [sample(0), sample(900)]), { elapsedMs: 1000 }));
    assert.ok(validateGhostTrace(trace(1000, [sample(0), sample(900)]), { elapsedMs: 1000 + GHOST_SAMPLE_INTERVAL_MS }));
  });

  it("returns a copy, so a caller cannot mutate the submitted trace into the store", () => {
    const submitted = trace(500, [sample(0), sample(400, 7)]);
    const result = validateGhostTrace(submitted);
    result.samples[1].position[0] = 99;
    assert.equal(submitted.samples[1].position[0], 7);
  });
});

// The gate is allowed to retry a smoke that died in transport, and not one that failed an
// assertion. This classifier is what draws that line, and a classifier that silently stops
// matching degrades to the unconditional retry it replaced — quietly, and in the direction
// that launders a real regression into a green gate. So it gets a test.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HARNESS_FAILURE_SIGNATURES,
  createFailureClassifier,
  resolveVerifyRetryBudget,
} from "../scripts/verify-guard.mjs";

const classify = (...chunks) => {
  const classifier = createFailureClassifier();
  for (const chunk of chunks) classifier.inspect(chunk);
  return classifier.signatures;
};

describe("harness failure classification", () => {
  it("matches every signature it claims to", () => {
    for (const signature of HARNESS_FAILURE_SIGNATURES) {
      assert.deepEqual(classify(`smoke output\n${signature} happened\n`), [signature]);
    }
  });

  it("recognises the two transport failures this project actually recorded", () => {
    // A static server using chunked encoding with no Content-Length, reset on the largest
    // chunk; and servers not setting keepAliveTimeout, so undici reused sockets Node had
    // already closed after 5s. Both are in HANDOFF.md.
    assert.ok(classify("page.goto: net::ERR_CONNECTION_RESET at http://127.0.0.1:4188/").length > 0);
    assert.ok(classify("TypeError: fetch failed\n  at async node:internal").length > 0);
  });

  it("recognises a fetch failure from inside the browser, not only from Node", () => {
    // Node's undici says "fetch failed"; a browser says "Failed to fetch". Listing only the
    // first was a real gap, and the gate found it on the first run this classifier shipped in:
    // live-sessions-browser died in transport before any assertion, was called an assertion
    // failure, and was reported as a product failure without ever being retried.
    assert.deepEqual(
      classify("FAIL  smoke threw — page.evaluate: LiveSessionError: Live session server unreachable at http://127.0.0.1:3736: Failed to fetch"),
      ["Failed to fetch"],
    );
  });

  it("stays silent on an ordinary assertion failure", () => {
    const output = [
      "PASS  the ball comes to rest on the slope",
      "FAIL  the finish gate fires — expected 3 laps, got 2",
      "",
      "FAIL  smoke-great-slide: 41/42 checks passed",
      "  - the finish gate fires: expected 3 laps, got 2",
    ].join("\n");
    assert.deepEqual(classify(output), [], "an assertion failure must never be retried");
  });

  it("is not fooled by prose that merely discusses the failures", () => {
    // Smoke output narrates its own checks, and a check *named* after a transport concern
    // must not make every failure of that smoke retryable.
    assert.deepEqual(classify("PASS  a dropped connection is reported to the caller"), []);
    assert.deepEqual(classify("FAIL  reconnects after the socket closes"), []);
  });

  it("sees a signature split across two chunks", () => {
    // Stream chunk boundaries fall wherever the OS puts them. Without the carry-over this
    // silently misses, and the miss looks exactly like a clean assertion failure.
    assert.deepEqual(classify("...net::ERR", "_CONNECTION_RESET..."), ["net::ERR_", "ERR_CONNECTION_"]);
    assert.deepEqual(classify("fet", "ch failed"), ["fetch failed"]);
  });

  it("sees a signature that arrived thousands of lines before the end", () => {
    // The reason this is incremental rather than a buffered tail: a transport failure can
    // happen early and be followed by the rest of a long smoke.
    const noise = Array.from({ length: 5000 }, (_, index) => `PASS  check ${index}`).join("\n");
    assert.deepEqual(classify(`ECONNRESET\n${noise}`), ["ECONNRESET"]);
  });

  it("reports each distinct signature once, however often it appears", () => {
    assert.deepEqual(classify("ECONNRESET ECONNRESET ECONNRESET"), ["ECONNRESET"]);
  });

  it("collects several distinct signatures from one run", () => {
    const found = classify("EADDRINUSE early\n", "later: socket hang up\n");
    assert.deepEqual(found.sort(), ["EADDRINUSE", "socket hang up"]);
  });

  it("starts clean for each smoke", () => {
    const classifier = createFailureClassifier();
    classifier.inspect("ECONNRESET");
    assert.deepEqual(createFailureClassifier().signatures, [], "state leaked between smokes");
  });
});

describe("verify retry budget", () => {
  it("keeps the historical local default", () => {
    assert.equal(resolveVerifyRetryBudget(undefined, { ci: false }), 3);
  });

  it("allows no retried passes by default in CI", () => {
    assert.equal(resolveVerifyRetryBudget(undefined, { ci: true }), 0);
  });

  it("honours an explicit override in either environment", () => {
    assert.equal(resolveVerifyRetryBudget("2", { ci: false }), 2);
    assert.equal(resolveVerifyRetryBudget("2", { ci: true }), 2);
    assert.equal(resolveVerifyRetryBudget("0", { ci: false }), 0);
  });

  it("rejects invalid, negative, fractional, and unsafe values clearly", () => {
    for (const value of ["", "nope", "-1", "1.5", "9007199254740992"]) {
      assert.throws(
        () => resolveVerifyRetryBudget(value, { ci: false }),
        /VERIFY_MAX_RETRIES must be .*non-negative integer/,
      );
    }
  });
});

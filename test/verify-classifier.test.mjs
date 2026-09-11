// The gate is allowed to retry a smoke that died in transport, and not one that failed an
// assertion. This classifier is what draws that line, and a classifier that silently stops
// matching degrades to the unconditional retry it replaced — quietly, and in the direction
// that launders a real regression into a green gate. So it gets a test.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { VERIFY_SMOKES, resolveVerifyOptions } from "../scripts/verify-manifest.mjs";
import {
  DEADLINE_WARN_FRACTION,
  HARNESS_FAILURE_SIGNATURES,
  createFailureClassifier,
  describeDeadlineUsage,
  formatDuration,
  resolveVerifyRetryBudget,
} from "../scripts/verify-guard.mjs";

const classify = (...chunks) => {
  const classifier = createFailureClassifier();
  for (const chunk of chunks) classifier.inspect(chunk);
  return classifier.signatures;
};

describe("verify coverage selection", () => {
  it("keeps every release check by default", () => {
    const options = resolveVerifyOptions([], {});
    assert.deepEqual(options.smokes, VERIFY_SMOKES);
    assert.equal(options.fullRelease, true);
  });

  it("selects whole tiers in manifest order without duplicating checks", () => {
    const options = resolveVerifyOptions(["--tier=core, apps,core"], {});
    assert.deepEqual(options.smokes, VERIFY_SMOKES.filter((smoke) => ["core", "apps"].includes(smoke.tier)));
    assert.equal(options.fullRelease, false);
    assert.ok(options.smokes.length > 0);
    const allTiers = [...new Set(VERIFY_SMOKES.map((smoke) => smoke.tier))].join(",");
    assert.equal(resolveVerifyOptions([`--tier=${allTiers}`], {}).fullRelease, true);
  });

  it("refuses empty, misspelled and partly invalid tiers instead of dropping coverage", () => {
    for (const tier of ["", " ", "cor", "core,unknown", "core,", ",apps", "core,,apps"]) {
      assert.throws(() => resolveVerifyOptions([`--tier=${tier}`], {}), /--tier must name/);
    }
  });

  it("refuses unknown options, positional arguments and missing values", () => {
    for (const args of [["--tiers=core"], ["--no-buid"], ["core"], ["--tier"], ["--base"], ["--base", "--no-build"]]) {
      assert.throws(() => resolveVerifyOptions(args, {}));
    }
  });

  it("keeps external and existing-build checks explicitly partial", () => {
    assert.equal(resolveVerifyOptions(["--no-build"], {}).fullRelease, false);
    const url = "https://example.invalid/release/";
    const external = resolveVerifyOptions(["--base", url], {});
    assert.equal(external.externalBase, url);
    assert.equal(external.fullRelease, false);
    assert.equal(resolveVerifyOptions([], { SMOKE_BASE: url }).fullRelease, false);
    assert.equal(resolveVerifyOptions(["--base", url], { SMOKE_BASE: "http://localhost:4173" }).externalBase, url);
    for (const base of ["", "localhost:4173", "file:///tmp/dist", "not-a-url"]) {
      assert.throws(() => resolveVerifyOptions(["--base", base], {}), /absolute HTTP\(S\) URL/);
    }
    assert.throws(() => resolveVerifyOptions([], { SMOKE_BASE: "invalid" }), /absolute HTTP\(S\) URL/);
  });

  it("preserves lock options and offers help without starting work", () => {
    const options = resolveVerifyOptions(["--wait", "--force-lock", "-h"], {});
    assert.equal(options.wait, true);
    assert.equal(options.forceLock, true);
    assert.equal(options.help, true);
  });

  it("rejects invalid CLI coverage before acquiring the lock or starting tests", () => {
    for (const args of [["--tier=cor"], ["--tier="], ["--tiers=core"], ["--base"]]) {
      const result = spawnSync(process.execPath, ["scripts/verify.mjs", ...args], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: { ...process.env, SMOKE_BASE: "" },
        encoding: "utf8",
        timeout: 5_000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /verify:.*(?:--tier|--base|Unknown option)/);
      assert.doesNotMatch(result.stdout + result.stderr, /=== unit tests ===|All \d+ checks passed|Another verify/);
    }
  });
});

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

  it("retries a navigation timeout but never an assertion timeout", () => {
    // Both are Playwright TimeoutError. The difference is which call timed out, and that is the
    // whole distinction: `page.goto` never reached the app, so nothing was proved and a retry
    // costs nothing. `waitForSelector` means the page loaded and the product did not do what it
    // promised — retrying that is exactly how a real regression is laundered into a green gate.
    assert.deepEqual(
      classify('"fatal": "TimeoutError: page.goto: Timeout 45000ms exceeded. - navigating to http://127.0.0.1:21806/"'),
      ["page.goto: Timeout"],
    );
    assert.deepEqual(
      classify("TimeoutError: page.waitForSelector: Timeout 45000ms exceeded waiting for .gx-welcome"),
      [],
      "an assertion timeout must never be retried",
    );
    assert.deepEqual(classify("TimeoutError: page.waitForFunction: Timeout 30000ms exceeded"), []);
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

describe("deadline headroom reporting", () => {
  // The measurement that motivated this: on a clean runner, live-sessions-browser took
  // 1,397,000 ms against a 1,800,000 ms deadline. Nothing reported that until it went red and
  // blocked production for a day, and the four commits that followed adjusted the number by
  // guesswork because nobody had the figure in front of them.
  const LIVE_BROWSER_MS = 1_397_000;
  const LIVE_BROWSER_DEADLINE_MS = 30 * 60 * 1000;

  it("formats a duration the way a person reads a gate summary", () => {
    assert.equal(formatDuration(0), "0s");
    assert.equal(formatDuration(4_400), "4s");
    assert.equal(formatDuration(59_000), "59s");
    assert.equal(formatDuration(60_000), "1m00s");
    assert.equal(formatDuration(LIVE_BROWSER_MS), "23m17s");
    assert.equal(formatDuration(LIVE_BROWSER_DEADLINE_MS), "30m00s");
  });

  it("returns a readable, non-lying description for a missing measurement", () => {
    assert.equal(describeDeadlineUsage(undefined, 1000), null);
    assert.equal(describeDeadlineUsage(-1, 1000), null);
    assert.equal(formatDuration(Number.NaN), "?");
  });

  it("reports cost even when a check has no deadline to be near", () => {
    const noDeadline = describeDeadlineUsage(5_000, undefined);
    assert.equal(noDeadline.fraction, null);
    assert.equal(noDeadline.warn, false, "a check with no deadline can never be close to one");
    assert.equal(noDeadline.text, "5s");
  });

  it("warns on the exact run that blocked production", () => {
    const spent = describeDeadlineUsage(LIVE_BROWSER_MS, LIVE_BROWSER_DEADLINE_MS);
    assert.equal(spent.text, "23m17s of 30m00s (78%)");
    assert.equal(spent.warn, true, "78% of the deadline must be visible before it becomes 101%");
  });

  it("stays quiet for a check with real headroom", () => {
    // `editor`, the next largest smoke, at 421s against the standard 10-minute deadline.
    const spent = describeDeadlineUsage(421_000, 10 * 60 * 1000);
    assert.equal(spent.warn, false);
    assert.equal(spent.text, "7m01s of 10m00s (70%)");
  });

  it("treats the threshold as inclusive, so the boundary case is reported", () => {
    assert.equal(describeDeadlineUsage(750, 1000, { warnAtFraction: 0.75 }).warn, true);
    assert.equal(describeDeadlineUsage(749, 1000, { warnAtFraction: 0.75 }).warn, false);
  });

  it("reports a check that ran past its deadline rather than clamping it", () => {
    // The 20-minute deadline this smoke was killed on. A clamp to 100% would hide how far
    // over it actually went, which is exactly the number needed to resize it.
    const spent = describeDeadlineUsage(LIVE_BROWSER_MS, 20 * 60 * 1000);
    assert.ok(spent.fraction > 1);
    assert.equal(spent.text, "23m17s of 20m00s (116%)");
    assert.equal(spent.warn, true);
  });

  it("ships a threshold that leaves room to act", () => {
    assert.ok(DEADLINE_WARN_FRACTION > 0 && DEADLINE_WARN_FRACTION < 1);
    assert.ok(DEADLINE_WARN_FRACTION <= 0.8, "a threshold above 80% warns too late to be useful");
  });
});

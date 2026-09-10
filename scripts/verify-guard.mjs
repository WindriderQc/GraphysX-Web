/**
 * Two guards for `npm run verify`, learned from a session that lost an afternoon to them.
 *
 * **Single instance.** A verify run software-rasterises WebGL — Playwright launches
 * Chromium with `--use-angle=swiftshader-webgl`, so every 3D smoke renders on the CPU.
 * Measured: one run took ~70% of a 16-core machine (113 CPU-seconds in a 10-second
 * window). Two runs do not take twice as long, they take turns badly and starve
 * everything else on the box, including the browser someone is using to look at the
 * product. They are also the likeliest explanation for a smoke that fails only when
 * another run is in flight. So a second run refuses to start rather than quietly halving
 * everyone's cores.
 *
 * **A deadline.** `runSmoke` used to await `child.on("close")` with nothing bounding it,
 * so a smoke that hung hung *forever*: two verify parents were found alive 9.5 and 7.7
 * hours after launch, each holding a Chromium tree. A run that cannot finish should fail
 * loudly and let go, not squat on the machine until someone notices.
 *
 * Both are deliberately advisory-but-noisy rather than silent: the failure mode being
 * fixed is one where nothing told anybody anything.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The lock lives at a MACHINE-GLOBAL path, not under the repo's `output/`. The per-checkout
 * location it replaced could only ever see runs from the same checkout — a gate in a git
 * worktree has its own `output/`, so two worktree sessions' verifies sailed straight past
 * each other's locks. Measured cost of that gap: six local runs in one day, five losing a
 * random smoke to transport errors while three agent sessions shared the box. What the lock
 * protects is the MACHINE (one verify software-rasterises WebGL on ~70% of its cores), so
 * the lock must be scoped to the machine.
 */
export function machineVerifyLockPath() {
  const base = process.env.LOCALAPPDATA || tmpdir();
  return join(base, "graphysx", "verify.lock");
}

function isAlive(pid) {
  try {
    // Signal 0 tests for existence without delivering anything.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists and belongs to someone else — still alive for our purposes.
    return error.code === "EPERM";
  }
}

/**
 * Kill a child *and its descendants*. Killing the node child alone is not enough on any
 * platform here: the Chromium tree it spawned is what actually holds the cores, and it
 * outlives its parent happily.
 */
export function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    try {
      // /T whole tree, /F force. Detached so we do not wait on it.
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", detached: true }).unref();
    } catch {
      // Already gone is the outcome we wanted anyway.
    }
    return;
  }

  try {
    // POSIX children are spawned as process-group leaders by verify.mjs.
    process.kill(-pid, "SIGKILL");
  } catch {
    // Fall back to the direct child if a caller supplied a non-group-leader pid. This does
    // not replace group termination, but it prevents the deadline itself becoming inert.
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone is the outcome we wanted anyway.
    }
  }
}

/**
 * Take the verify lock, or throw explaining who holds it.
 *
 * Exclusive creation prevents simultaneous claims. Only a dead owner is reclaimed;
 * a live gate can legitimately take longer than an hour on a software renderer.
 */
export async function acquireVerifyLock(lockPath, { force = false, wait = false } = {}) {
  const readHolder = async () => {
    try {
      return JSON.parse(await readFile(lockPath, "utf8"));
    } catch (error) {
      return error.code === "ENOENT" ? undefined : null;
    }
  };
  const isDead = (held) => Number.isSafeInteger(held?.pid) && held.pid > 0 && !isAlive(held.pid);
  const owner = { pid: process.pid, started: Date.now(), token: randomUUID() };
  const waitStarted = Date.now();
  let waiting = false;
  await mkdir(join(lockPath, ".."), { recursive: true });
  for (;;) {
    try {
      await writeFile(lockPath, JSON.stringify(owner), { encoding: "utf8", flag: "wx" });
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const held = await readHolder();
    if (held === undefined) continue; // The previous owner released during our read.
    if (force || isDead(held)) {
      // Serialize stale cleanup as well: two reapers must not unlink a fresh claim
      // published between their reads. A malformed/initializing owner is never evicted.
      const recoveryPath = `${lockPath}.reclaim`;
      let recovering = false;
      try {
        await writeFile(recoveryPath, JSON.stringify(owner), { encoding: "utf8", flag: "wx" });
        recovering = true;
        const latest = await readHolder();
        if (force || isDead(latest)) await rm(lockPath, { force: true });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      } finally {
        if (recovering) await rm(recoveryPath, { force: true });
      }
      if (recovering) continue;
    }
    const detail = held?.pid ? `pid ${held.pid}` : "owner record initializing or unreadable";
    if (!wait || Date.now() - waitStarted > 45 * 60 * 1000) {
      const error = new Error(
        `verify lock is held (${detail}).\n` +
        "  Queue with npm run verify -- --wait; confirm the owner is dead before --force-lock.\n" +
        `  Lock: ${lockPath}`,
      );
      error.code = "EVERIFYLOCKED";
      throw error;
    }
    if (!waiting) console.log(`verify: waiting for the running gate (${detail}) to finish...`);
    waiting = true;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 15_000));
  }
  if (waiting) console.log("verify: lock freed, starting.");
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    if ((await readHolder())?.token === owner.token) await rm(lockPath, { force: true });
  };
}

/**
 * Wrap a spawned child with a deadline. Resolves `{ timedOut: true }` instead of hanging.
 * The caller still owns the child's own close/error handling; this only adds the bound.
 */
export function withDeadline(child, ms, label) {
  let timer = null;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.error(`\n${label}: exceeded ${Math.round(ms / 1000)}s deadline — killing process tree.`);
      killTree(child.pid);
      resolve({ label, code: 1, timedOut: true });
    }, ms);
    timer.unref?.();
  });
  const clear = () => { if (timer) clearTimeout(timer); };
  return { timedOut, clear };
}

/**
 * Failure signatures that mean the harness broke, not the product.
 *
 * These are the two transport bugs recorded in HANDOFF.md and the family they belong to: a
 * static server resetting on its largest chunk, and undici reusing sockets Node had already
 * closed. A smoke that dies this way proved nothing and is worth one more attempt. A smoke
 * whose *assertion* failed proved something, and retrying it is how a real regression gets
 * laundered into a green gate.
 */
export const HARNESS_FAILURE_SIGNATURES = [
  "net::ERR_",
  "ERR_CONNECTION_",
  // Node's undici says "fetch failed". A browser says "Failed to fetch" — different words,
  // different order, same event. Listing only the first was a real gap, found by the gate on
  // its first run: `live-sessions-browser` died with "Live session server unreachable …
  // Failed to fetch" before a single assertion ran, was classified as an assertion failure,
  // and so was reported as a product failure without ever being retried.
  "fetch failed",
  "Failed to fetch",
  // Navigation only, and deliberately not any timeout. `page.goto` timing out means the
  // harness never reached the app it was going to make assertions about — the loopback
  // static server this run started itself did not answer. Observed three times in one local
  // run against servers that CI had served fine minutes earlier.
  //
  // An assertion timeout (`waitForSelector`, `waitForFunction`) is the opposite: the page
  // loaded and the product did not do what it promised. Those must stay non-retryable, which
  // is why this matches the navigation call by name rather than the word "Timeout".
  "page.goto: Timeout",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EADDRINUSE",
  "socket hang up",
  "REQFAIL",
  "Target page, context or browser has been closed",
];

/**
 * Watches a stream for those signatures as it passes through.
 *
 * Incremental rather than a buffered tail: a transport failure can happen early and be
 * followed by thousands of lines, which a fixed-size tail would have thrown away — and a
 * classifier that silently misses its signal degrades to the unconditional retry this
 * replaced. The carry-over keeps a signature that straddles two chunks visible.
 */
export function createFailureClassifier() {
  const longest = Math.max(...HARNESS_FAILURE_SIGNATURES.map((entry) => entry.length));
  let carry = "";
  const matched = new Set();
  return {
    inspect(text) {
      const window = carry + text;
      for (const signature of HARNESS_FAILURE_SIGNATURES) {
        if (window.includes(signature)) matched.add(signature);
      }
      carry = window.slice(-longest);
    },
    get signatures() {
      return [...matched];
    },
  };
}

/**
 * Resolve how many transport-retried smokes a verify run may still call green.
 *
 * CI is deliberately strict: a retry can help the suite finish and preserve its
 * diagnostics, but the resulting run must fail so a flaky deploy is never promoted.
 * Local runs retain the historical allowance unless the caller opts into another
 * explicit non-negative integer budget.
 */
export function resolveVerifyRetryBudget(rawValue, { ci = false } = {}) {
  if (rawValue === undefined) return ci ? 0 : 3;

  const text = typeof rawValue === "string" ? rawValue : String(rawValue);
  if (!/^\d+$/.test(text)) {
    throw new TypeError(
      `VERIFY_MAX_RETRIES must be a non-negative integer; received ${JSON.stringify(rawValue)}.`,
    );
  }

  const budget = Number(text);
  if (!Number.isSafeInteger(budget)) {
    throw new TypeError(
      `VERIFY_MAX_RETRIES must be a safe non-negative integer; received ${JSON.stringify(rawValue)}.`,
    );
  }
  return budget;
}

/**
 * How close a check ran to its deadline.
 *
 * This exists because a whole day of production downtime was invisible until it was red.
 * `live-sessions-browser` grew from 94 assertions to about 127; on a clean runner it now takes
 * 23m17s against a 30-minute deadline — 78% — and consumes 31% of the entire 75-minute gate.
 * Nothing reported that. The first anyone knew was a killed process tree, and the four commits
 * that followed raised the number by guesswork because nobody had the measurement.
 *
 * Deliberately a warning and never a failure. A deadline catches a wedged smoke; it is not a
 * performance budget, and turning "slower than I expected" into a red gate would block
 * production on a busy runner. The point is that the next person sees the headroom shrinking
 * while there is still time to act.
 */
export const DEADLINE_WARN_FRACTION = Number(process.env.VERIFY_DEADLINE_WARN_FRACTION || 0.75);

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "?";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
}

export function describeDeadlineUsage(elapsedMs, deadlineMs, { warnAtFraction = DEADLINE_WARN_FRACTION } = {}) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  // A check with no deadline still reports its cost; it just has no fraction to be near.
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    return { elapsedMs, deadlineMs: null, fraction: null, warn: false, text: formatDuration(elapsedMs) };
  }
  const fraction = elapsedMs / deadlineMs;
  return {
    elapsedMs,
    deadlineMs,
    fraction,
    warn: fraction >= warnAtFraction,
    text: `${formatDuration(elapsedMs)} of ${formatDuration(deadlineMs)} (${Math.round(fraction * 100)}%)`,
  };
}

/**
 * Kill tracked children when this process is asked to stop. Without this, Ctrl-C on a
 * verify run leaves the Chromium tree behind — which is how orphans accumulate.
 */
export function installSignalCleanup(getChildren, release) {
  let cleaning = false;
  const cleanup = async (signal) => {
    if (cleaning) return;
    cleaning = true;
    console.error(`\nverify: ${signal} — killing ${getChildren().length} child process tree(s).`);
    for (const child of getChildren()) killTree(child.pid);
    if (release) await release();
    process.exit(1);
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => void cleanup(signal));
  }
}

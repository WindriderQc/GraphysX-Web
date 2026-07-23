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
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A run older than this is assumed dead even if its pid was recycled onto something else. */
const STALE_AFTER_MS = 60 * 60 * 1000;

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
  try {
    if (process.platform === "win32") {
      // /T whole tree, /F force. Detached so we do not wait on it.
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", detached: true }).unref();
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // Already gone is the outcome we wanted anyway.
  }
}

/**
 * Take the verify lock, or throw explaining who holds it.
 *
 * A lock whose owner is dead, or which is older than STALE_AFTER_MS, is taken over rather
 * than respected — a crashed run must not wedge the gate for everyone who comes after.
 */
export async function acquireVerifyLock(lockPath, { force = false, wait = false } = {}) {
  const readHolder = async () => {
    try {
      return JSON.parse(await readFile(lockPath, "utf8"));
    } catch {
      return null; // absent or unreadable — treat as free
    }
  };
  const isLive = (held) =>
    Boolean(held?.pid && isAlive(held.pid) && Date.now() - (held.started ?? 0) < STALE_AFTER_MS);

  if (!force) {
    let held = await readHolder();
    if (isLive(held) && wait) {
      // `--wait` queues instead of failing. Agents retry a refused gate anyway; polling here
      // turns that retry storm into an orderly queue, and the machine only ever runs one.
      const waitStarted = Date.now();
      const WAIT_CAP_MS = 45 * 60 * 1000;
      console.log(`verify: waiting for the running gate (pid ${held.pid}) to finish...`);
      while (isLive(held)) {
        if (Date.now() - waitStarted > WAIT_CAP_MS) {
          const error = new Error("verify: waited 45 minutes for the lock; giving up. Investigate the holder.");
          error.code = "EVERIFYLOCKED";
          throw error;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 15_000));
        held = await readHolder();
      }
      console.log("verify: lock freed, starting.");
    } else if (isLive(held)) {
      const mins = Math.round((Date.now() - (held.started ?? 0)) / 60000);
      const error = new Error(
        `verify is already running (pid ${held.pid}, started ${mins} min ago).\n` +
          `  Concurrent runs software-rasterise WebGL and will starve the machine.\n` +
          `  Queue behind it with: npm run verify -- --wait\n` +
          `  Or if you are sure it is dead: npm run verify -- --force-lock`,
      );
      error.code = "EVERIFYLOCKED";
      throw error;
    } else if (held?.pid) {
      console.warn(`verify: taking over a stale lock (pid ${held.pid}, ${Math.round((Date.now() - (held.started ?? 0)) / 60000)} min old)`);
    }
  }

  await mkdir(join(lockPath, ".."), { recursive: true }).catch(() => undefined);
  await writeFile(lockPath, JSON.stringify({ pid: process.pid, started: Date.now() }), "utf8");
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await rm(lockPath, { force: true });
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

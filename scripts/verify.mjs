import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.mjs";
import {
  DEADLINE_WARN_FRACTION,
  acquireVerifyLock,
  createFailureClassifier,
  describeDeadlineUsage,
  installSignalCleanup,
  machineVerifyLockPath,
  resolveVerifyRetryBudget,
  withDeadline,
} from "./verify-guard.mjs";

// One command that proves a release is shippable: typecheck, build, then drive the
// built output in a real headless browser through every product route.
//
//   npm run verify              full gate (typecheck + build + smokes)
//   npm run verify -- --no-build   reuse the existing dist/
//   npm run verify -- --base https://graphysx.specialblend.ca/   smoke a live deploy
//
// This is the same gate CI runs before production deploys, so a green local run means
// a green pipeline.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACTS = path.join(ROOT, "output", "verify");
// Default to an ephemeral port. A fixed port makes back-to-back runs race the previous
// run's socket sitting in TIME_WAIT, which surfaced as EADDRINUSE or as a smoke failing to
// reach the server — flakiness that looks like a product bug but is purely the harness
// colliding with itself. Set VERIFY_PORT to pin it when you need a stable URL.
const PORT = Number(process.env.VERIFY_PORT || 0);
// Machine-global, NOT under this checkout's output/: a gate in a git worktree has its own
// output/ and could never see this one's lock. The lock protects the machine's cores, so it
// is scoped to the machine. See machineVerifyLockPath in verify-guard.mjs for the history.
const LOCK_PATH = machineVerifyLockPath();
// Generous enough that a slow-but-working run is never killed, tight enough that a wedged
// one is noticed the same day. The whole suite normally finishes well inside these.
// The deadline exists to catch wedged smokes (two verify parents were once found alive
// 9.5 hours after launch), not to enforce performance. It must clear the slowest smoke on
// the slowest hardware: the editor smoke takes ~80-120s locally but took 346s on the LAST
// GREEN CI run (4-core swiftshader ubuntu runner) — a 5-minute deadline failed CI on a
// smoke that was making steady progress, and the zero-output kill was misread as a hang.
const SMOKE_DEADLINE_MS = Number(process.env.VERIFY_SMOKE_TIMEOUT_MS || 10 * 60 * 1000);
// The live browser contract deliberately exercises two full WebGL clients, an external
// AgentX stream, several frozen-response races, reconnect backoff and terminal recovery.
// The current 131-check contract passed locally in 9m15s. Clean Linux runners were still
// advancing at both 15 and 20 minutes; the slower run reached check 108 at 19m43s, projecting
// a roughly 24-minute finish. Thirty minutes keeps the process sharply bounded while leaving
// measured headroom for the remaining authority and terminal-recovery checks on shared hosts.
const LIVE_BROWSER_DEADLINE_MS = Number(process.env.VERIFY_LIVE_BROWSER_TIMEOUT_MS || 30 * 60 * 1000);
const BUILD_DEADLINE_MS = Number(process.env.VERIFY_BUILD_TIMEOUT_MS || 10 * 60 * 1000);

const argv = process.argv.slice(2);
const noBuild = argv.includes("--no-build");
const baseArgIndex = argv.indexOf("--base");
const externalBase = baseArgIndex >= 0 ? argv[baseArgIndex + 1] : process.env.SMOKE_BASE;
// `--tier=core` (or `core,apps`) runs a slice of the gate. Absent means the whole thing, so a
// release keeps full coverage and only the development loop gets shorter.
const tierArg = argv.find((a) => a.startsWith("--tier="));
const TIERS = tierArg ? new Set(tierArg.slice("--tier=".length).split(",").map((s) => s.trim()).filter(Boolean)) : null;

const SMOKES = [
  { name: "showroom", tier: "core", script: "scripts/smoke-showroom.mjs", covers: "default route: welcome showroom, gated editor, auto-orbit" },
  { name: "editor", tier: "core", script: "scripts/smoke-editor.mjs", covers: "editor: library palette, model + texture + behaviour, bloom authoring, exit path" },
  { name: "top20", tier: "deep", script: "scripts/smoke-top20.mjs", covers: "top-20 release: redo, draft recovery, import/copy/slots/palette, shelf personalization, accessible display, touch/gamepad/pause/fullscreen" },
  { name: "standalone", tier: "core", script: "scripts/smoke-standalone.mjs", covers: "?host=standalone: agent API, tool bridge, human editor" },
  { name: "levels", tier: "core", script: "scripts/smoke-levels.mjs", covers: "levels workbench: paint, fill, ASCII round trip, undo, create" },
  { name: "scene-store", tier: "deep", script: "scripts/smoke-scene-store.mjs", covers: "?scene=: stored scene loads, outside agent edits land in the tab" },
  { name: "scene-command-validation", tier: "core", script: "scripts/smoke-scene-command-validation.mjs", covers: "untrusted scene commands: strict ids/types/configs/references, runtime-parity merges, atomic rejection, cumulative budgets" },
  { name: "triggers", tier: "core", script: "scripts/smoke-triggers.mjs", covers: "trigger volumes: enter/exit events, interactions fire, no collision response" },
  { name: "roundtrip", tier: "core", script: "scripts/smoke-roundtrip.mjs", covers: "write-only-state sweep: every settable v2 property set then read back through state/export/reload/object" },
  { name: "rules", tier: "core", script: "scripts/smoke-rules.mjs", covers: "rules layer: ordered checkpoints, laps, sim-time clock, document round-trip, dropped -> resync" },
  { name: "ballz", tier: "apps", script: "scripts/smoke-ballz.mjs", covers: "levels.play(): grid materialises, ball rests, walls stop it, gate + ring fire" },
  { name: "games", tier: "apps", script: "scripts/smoke-games.mjs", covers: "front door: showroom -> Games shelf -> playing a level -> back" },
  { name: "archive-cup", tier: "apps", script: "scripts/smoke-archive-cup.mjs", covers: "nine-round campaign: persistent unlocks, medal totals, personal ghost, return to standings" },
  { name: "overlay", tier: "apps", script: "scripts/smoke-overlay.mjs", covers: "2D overlay layer: off by default, one shared loop, draws over 3D, round-trips" },
  { name: "surfaces", tier: "apps", script: "scripts/smoke-surfaces.mjs", covers: "generative surfaces: off by default, one shared loop (surfaceRedraws tracks frames), scene data round-trip, retune + remove" },
  { name: "archive-levels", tier: "apps", script: "scripts/smoke-archive-levels.mjs", covers: "recovered BallZ arenas: census fidelity, containment, reachable, completable" },
  { name: "spiral", tier: "apps", script: "scripts/smoke-spiral.mjs", covers: "Skybox Spiral port: composes, ball rests, movers move, markerless light, completable, round-trips" },
  { name: "world1", tier: "apps", script: "scripts/smoke-world1.mjs", covers: "World 1 mesh port: six meshes ready, physics-only descent through both holes, elevator moves, completable" },
  { name: "vehicles", tier: "apps", script: "scripts/smoke-vehicles.mjs", covers: "Archive Garage: recovered meshes register, ship in dist, and resolve" },
  { name: "playgrounds", tier: "apps", script: "scripts/smoke-playgrounds.mjs", covers: "Nature Lab playgrounds: preset fidelity, fields do work, mass-independent attraction" },
  { name: "milkyway", tier: "apps", script: "scripts/smoke-milkyway.mjs", covers: "Voie Lactee: recovered radii and rates, retrograde Moon, textures fetch 200" },
  { name: "buildings", tier: "apps", script: "scripts/smoke-buildings.mjs", covers: "Maison massing model: archive transforms exact, recovered lamps, storey toggle" },
  { name: "media", tier: "apps", script: "scripts/smoke-media.mjs", covers: "media library: datalake browse/import, in-browser OBJ conversion, editor Media tab + dialog" },
  { name: "physics", tier: "apps", script: "scripts/smoke-physics.mjs", covers: "physics migration baseline: contacts, fixed-step schedules, sleep/wake, teardown/reload" },
  { name: "joints", tier: "apps", script: "scripts/smoke-joints.mjs", covers: "scene-authored fixed/revolute/rope joints: motion, bridge parity, patch, undo, export/reload" },
  { name: "ev3-lab", tier: "apps", script: "scripts/smoke-ev3-lab.mjs", covers: "EV3 Robotics Mission Lab: seven construction families, seven mission zones, driveable base, gripper and launch interactions, round-trip" },
  { name: "ballz18-sky", tier: "apps", script: "scripts/smoke-ballz18-sky.mjs", covers: "exact authored 2048px BallZ18 sky: release manifest, six SHA-256 hashes, decode, orientation, scene application" },
  { name: "scenenet-xml", tier: "apps", script: "scripts/smoke-scenenet-xml.mjs", covers: "SceneNET v1.0/v1.1/v1.2/split-enum import-export-import, deterministic XML, structured loss warnings, ambiguity rejection, editor download" },
  { name: "mesh-colliders", tier: "apps", script: "scripts/smoke-mesh-colliders.mjs", covers: "scene-native model colliders: Great Slide trimesh, dynamic convex hull, rejection, bridge + round-trip" },
  { name: "great-slide", tier: "apps", script: "scripts/smoke-great-slide.mjs", covers: "Great Slide gravity run: Games launch, exact collider gate, subject controls, checkpoints, results, replay + return" },
  { name: "map1", tier: "apps", script: "scripts/smoke-map1.mjs", covers: "Map 1 gravity descent: Games launch, exact recovered collider, halfway gate, results, replay + return" },
  { name: "level1-2011", tier: "apps", script: "scripts/smoke-level1-2011.mjs", covers: "Level1 2011 at 1:1: largest mesh under scene envelope, exact trimesh, two gates in order, results, replay + return" },
  { name: "suzanne-machinery", tier: "apps", script: "scripts/smoke-suzanne-machinery.mjs", covers: "Suzanne machinery: eight vendored meshes, moving convex colliders, exact 12-point route, completable" },
  { name: "suzanne1", tier: "apps", script: "scripts/smoke-suzanne1.mjs", covers: "Suzanne 1 ASCII arena: archive census, dynamic walls, piston moves, completable over 3 laps, round-trips" },
  { name: "suzanne2", tier: "apps", script: "scripts/smoke-suzanne2.mjs", covers: "Suzanne 2 ASCII/XML arena: archive census, vendored meshes, moving piston, any 2 of 15 rings, round-trip" },
  { name: "day-night", tier: "apps", script: "scripts/smoke-day-night.mjs", covers: "scene-native archive atmosphere: source curves, authored sky/HDRI endpoints, deterministic pause/step, round-trip" },
  { name: "meshlight", tier: "apps", script: "scripts/smoke-meshlight.mjs", covers: "meshlight.shade: vendored HLSL, compiled parallax/Lyon translation, exact Room 2 maps, live patch + round-trip" },
  { name: "ppl", tier: "apps", script: "scripts/smoke-ppl.mjs", covers: "ppl.shade: exact HLSL + ball normal, compiled parallax/Lambert translation, active ring binding, live patch + round-trip" },
  { name: "level3", tier: "apps", script: "scripts/smoke-level3.mjs", covers: "Archive Level 3 v2: exact ASCII catwalk census, Alien02 catch floor, NightSky, LINE gates, three laps, round-trip" },
  { name: "product-assets", tier: "core", script: "scripts/audit-product-assets.mjs", covers: "release completeness: every /assets URL a product-reachable module names ships in the production manifest, with a reasoned allowlist" },
  { name: "results-browser", tier: "deep", script: "scripts/smoke-results-browser.mjs", covers: "results through the product: no request at all without a store, token-gated submission, leaderboard read + rendered panel with legible text and trust label, rival ghost download and playback" },
  { name: "asset-guard", tier: "core", script: "scripts/smoke-asset-guard.mjs", covers: "asset-guard fixtures: a missing asset fails, a registered asset passes, base paths/globs/templates/externals are classified, type-only vs runtime edges" },
  { name: "previews", tier: "core", script: "scripts/audit-previews.mjs", covers: "preview registry: every workshop harness is registered, and every mountable one uses the shared renderer and the shared frame loop" },
  { name: "store-auth", tier: "deep", script: "scripts/smoke-store-auth.mjs", covers: "store auth: token gate on writes + datalake, CORS allowlist, tokenless compat mode" },
  { name: "live-sessions", tier: "deep", script: "scripts/smoke-live-sessions.mjs", covers: "live sessions: owner + remote editor + agent on one scene, incremental attributed ops, roles, duplicates, conflicts, reconnect/resume/resync, teardown" },
  { name: "live-sessions-browser", tier: "deep", script: "scripts/smoke-live-sessions-browser.mjs", localOnly: true, deadlineMs: LIVE_BROWSER_DEADLINE_MS, covers: "live sessions through the product: observer boundary, scene-native AgentX presence, Nestor accepted-operation reaction, reconnect and cleanup" },
  { name: "live-sessions-security", tier: "deep", script: "scripts/smoke-live-sessions-security.mjs", covers: "live session security: fail-closed without a store token, cross-session + forged credentials, expired/revoked invites, origin rejection, one-shot stream tickets, payload/rate caps, concurrent burst consistency, token-leak audit" },
  { name: "live-undo", tier: "deep", script: "scripts/smoke-live-undo.mjs", covers: "collaborative undo: inverse operations appended not rewound, refusal when a later actor touched the same entities, own-operation-only, parent/child restore, non-invertible refusal, viewer denial" },
  { name: "results", tier: "deep", script: "scripts/smoke-results.mjs", covers: "results: persistent bests, compatibility-separated leaderboards with client-attested trust labels, deterministic ordering and bounds, shared ghost round-trip, and refusal of desynced/incomplete/implausible/oversized/unsorted submissions" },
  { name: "dna", tier: "apps", script: "scripts/smoke-dna.mjs", covers: "DNA forest: deterministic genome drift, preset fidelity, node-level (no browser)" },
];

// Every child is tracked so a signal can take its whole tree down with it. An untracked
// child is an orphaned Chromium waiting to happen.
const children = new Set();

function spawnTracked(command, args, options, label, deadlineMs, { classify = false } = {}) {
  // Output is piped only when it has to be classified, and is written straight through, so
  // the live view of a running smoke is unchanged.
  const child = spawn(command, args, classify ? { ...options, stdio: ["ignore", "pipe", "pipe"] } : options);
  children.add(child);
  const classifier = classify ? createFailureClassifier() : null;
  if (classifier) {
    for (const [stream, sink] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      stream?.setEncoding("utf8");
      stream?.on("data", (chunk) => {
        classifier.inspect(chunk);
        sink.write(chunk);
      });
    }
  }
  const { timedOut, clear } = withDeadline(child, deadlineMs, label);
  const startedAt = Date.now();
  const finished = new Promise((resolve) => {
    child.on("close", (code) => resolve({ label, code: code ?? 1 }));
    child.on("error", (err) => {
      console.error(`${label}: ${err.message}`);
      resolve({ label, code: 1 });
    });
  });
  // Whichever lands first wins: a real exit, or the deadline killing the tree.
  return Promise.race([finished, timedOut])
    .then((result) => ({
      ...result,
      signatures: classifier?.signatures ?? [],
      // Carried so the summary can report headroom rather than only pass/fail. A check that
      // is quietly approaching its deadline is the shape of the next red gate.
      elapsedMs: Date.now() - startedAt,
      deadlineMs,
    }))
    .finally(() => {
      clear();
      children.delete(child);
    });
}

function run(command, args, label) {
  return spawnTracked(
    command,
    args,
    {
      cwd: ROOT,
      shell: process.platform === "win32",
      stdio: "inherit",
      env: { ...process.env },
      // On POSIX, killTree targets the child's process group so Chromium descendants cannot
      // survive a deadline. A detached child becomes that group's leader; we still retain
      // and await the ChildProcess handle because it is not unref'ed.
      detached: process.platform !== "win32",
    },
    label,
    BUILD_DEADLINE_MS,
  );
}

function runSmoke(smoke, base) {
  return spawnTracked(
    process.execPath,
    [smoke.script],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, SMOKE_BASE: base, SMOKE_ARTIFACTS: ARTIFACTS },
      detached: process.platform !== "win32",
    },
    smoke.name,
    smoke.deadlineMs ?? SMOKE_DEADLINE_MS,
    { classify: true },
  );
}

/**
 * Retries are a cost, not a free pass, so the gate counts them and eventually says no.
 *
 * The retry itself is right — the transport failures it covers are real and documented — but
 * it used to fire on *any* failure and report the eventual pass as a plain `PASS`. A check
 * that fails half the time then passes the gate three runs in four, invisibly, which is the
 * same outcome as weakening its assertion. Above this floor the flakiness is the result.
 */
const MAX_RETRIES = resolveVerifyRetryBudget(process.env.VERIFY_MAX_RETRIES, {
  ci: Boolean(process.env.CI),
});

const results = [];
let server = null;

// Refuse to run alongside another verify. Held for the whole run and released in `finally`,
// including on a signal.
let releaseLock;
try {
  // The lock lives beside the artifacts, so its directory has to exist before the artifacts
  // step that would otherwise create it.
  await mkdir(path.dirname(LOCK_PATH), { recursive: true });
  releaseLock = await acquireVerifyLock(LOCK_PATH, { force: argv.includes("--force-lock"), wait: argv.includes("--wait") });
} catch (error) {
  if (error.code === "EVERIFYLOCKED") {
    console.error(`\n${error.message}`);
    process.exit(1);
  }
  throw error;
}
installSignalCleanup(() => [...children], releaseLock);

try {
  await rm(ARTIFACTS, { recursive: true, force: true });
  await mkdir(ARTIFACTS, { recursive: true });

  // First, and unconditionally: sub-second, node-only, no server, no browser, no lock
  // contention. If a pure function's contract broke there is no reason to spend forty
  // minutes of software-rasterised WebGL finding out.
  console.log("\n=== unit tests ===");
  // The glob, not the bare directory: `node --test test/` resolves the path as a module on
  // Node 24 and dies with MODULE_NOT_FOUND before running anything. Node expands this
  // pattern itself, so it behaves the same whether or not a shell is in the way.
  // `node`, not `process.execPath`: `run` uses a shell on Windows and the interpreter's own
  // path contains a space, which the shell then splits into a command that does not exist.
  // The neighbouring probes below already invoke it this way.
  results.push(await run("node", ["--test", "test/*.test.mjs"], "unit"));

  if (!externalBase && !noBuild) {
    console.log("\n=== typecheck ===");
    results.push(await run("npx", ["tsc", "--noEmit"], "typecheck"));

    // `--max-warnings 0` so an unused disable directive cannot quietly accumulate; that is
    // how the config found a directive for a rule nothing had ever enabled.
    console.log("\n=== lint ===");
    results.push(await run("npx", ["eslint", ".", "--max-warnings", "0"], "lint"));

    console.log("\n=== build ===");
    results.push(await run("npx", ["vite", "build"], "build"));
  }

  // Pin the migration's reason for existing into the release gate. This is node-only and
  // deterministic, so it does not need the static server or contend with browser smokes.
  if (!externalBase && !results.some((result) => result.code !== 0)) {
    console.log("\n=== rapier heightfield seam ===");
    results.push(await run("node", ["scripts/probe-rapier-heightfield.mjs"], "rapier-heightfield"));
  }

  if (!externalBase && !results.some((result) => result.code !== 0)) {
    console.log("\n=== rapier material parity ===");
    results.push(await run("node", ["scripts/probe-rapier-material-parity.mjs"], "rapier-materials"));
  }

  // Only smoke if we have something to smoke.
  const buildFailed = results.some((r) => r.code !== 0);
  if (buildFailed) {
    console.error("\nSkipping smokes — typecheck/build failed.");
  } else {
    console.log(`\n=== smokes against ${externalBase ?? "isolated local servers"} ===`);
    for (const smoke of SMOKES.filter((s) => !TIERS || TIERS.has(s.tier ?? "apps"))) {
      if (externalBase && smoke.localOnly) {
        console.log(`\n--- ${smoke.name}: skipped against an external page (requires its isolated loopback store) ---`);
        continue;
      }
      console.log(`\n--- ${smoke.name}: ${smoke.covers} ---`);
      let result;
      let retried = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        let base = externalBase;
        if (!base) {
          // A fresh ephemeral server per smoke prevents stale keep-alive sockets from one
          // Chromium process being inherited as transport flakiness by the next process.
          server = await startStaticServer({ root: path.join(ROOT, "dist"), port: PORT });
          base = server.url;
        }
        try {
          result = await runSmoke(smoke, base);
        } finally {
          if (server) {
            await server.close();
            server = null;
          }
        }
        if (result.code === 0 || attempt === 2) break;
        // A deadline kill is not a transport failure. It already spent the full deadline
        // proving something is wedged, and spending it again teaches nothing.
        if (result.timedOut) {
          console.warn(`\n${smoke.name}: failed on its deadline — not retried.`);
          break;
        }
        if (result.signatures.length === 0) {
          // Not "failed an assertion" — the gate cannot know that. All it knows is that no
          // transport signature matched, and saying more than that sent me looking for a
          // product bug in a smoke whose harness had simply never reached an assertion.
          console.warn(`\n${smoke.name}: failed with no known transport signature — not retried. Diagnose it.`);
          break;
        }
        retried = result.signatures.join(", ");
        console.warn(`\n${smoke.name}: transport failure (${retried}); retrying once on a fresh server.`);
      }
      results.push({ ...result, retried: result.code === 0 ? retried : null });
    }
  }
} finally {
  if (server) await server.close();
  await releaseLock();
}

const failed = results.filter((r) => r.code !== 0);
const retried = results.filter((r) => r.retried);
const usage = new Map(results.map((r) => [r, describeDeadlineUsage(r.elapsedMs, r.deadlineMs)]));
const widest = Math.max(...results.map((r) => r.label.length));
console.log("\n=== verify summary ===");
for (const r of results) {
  // A retried pass is not the same result as a first-attempt pass, and the summary is the
  // thing people actually read. Say so on the line itself — and say what it cost.
  const suffix = r.retried ? ` (retried: ${r.retried})` : "";
  const spent = usage.get(r);
  const timing = spent ? `  ${spent.warn ? "!" : " "}${spent.text}` : "";
  console.log(`${r.code === 0 ? "PASS" : "FAIL"}  ${r.label.padEnd(widest)}${timing}${suffix}`);
}

// Reported before the pass/fail verdict below, because it is the one line that matters on a
// run that is about to stop being green.
const tight = results.filter((r) => usage.get(r)?.warn);
if (tight.length) {
  console.warn(
    `\nHeadroom warning — ${tight.length} check(s) used ${Math.round(DEADLINE_WARN_FRACTION * 100)}% or more of the deadline:\n` +
    tight.map((r) => `  ${r.label}: ${usage.get(r).text}`).join("\n") +
    "\n  This is a warning, never a failure: a deadline catches a wedged smoke, it is not a\n" +
    "  performance budget. But a check this close is the next red gate. Split it, or raise its\n" +
    "  deadline deliberately with the measurement in hand — not after it has blocked a deploy.",
  );
}
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed: ${failed.map((f) => f.label).join(", ")}`);
  process.exit(1);
}
if (retried.length > MAX_RETRIES) {
  console.error(
    `\nEvery check passed, but ${retried.length} needed a retry (limit ${MAX_RETRIES}): ` +
    `${retried.map((r) => r.label).join(", ")}.\n` +
    "  That much transport flakiness is a result, not noise — this run does not count as green.\n" +
    "  Usually: another verify, a build, or several sessions sharing this machine. See CLAUDE.md.\n" +
    "  Raise the floor deliberately with VERIFY_MAX_RETRIES if you know why.",
  );
  process.exit(1);
}
if (retried.length) {
  console.log(`\nNote: ${retried.length} check(s) passed only after a transport retry: ${retried.map((r) => r.label).join(", ")}`);
}
console.log(`\nAll ${results.length} checks passed. Screenshots: ${ARTIFACTS}`);

import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.mjs";
import { acquireVerifyLock, installSignalCleanup, withDeadline } from "./verify-guard.mjs";

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
const LOCK_PATH = path.join(ROOT, "output", ".verify.lock");
// Generous enough that a slow-but-working run is never killed, tight enough that a wedged
// one is noticed the same day. The whole suite normally finishes well inside these.
// The deadline exists to catch wedged smokes (two verify parents were once found alive
// 9.5 hours after launch), not to enforce performance. It must clear the slowest smoke on
// the slowest hardware: the editor smoke takes ~80-120s locally but took 346s on the LAST
// GREEN CI run (4-core swiftshader ubuntu runner) — a 5-minute deadline failed CI on a
// smoke that was making steady progress, and the zero-output kill was misread as a hang.
const SMOKE_DEADLINE_MS = Number(process.env.VERIFY_SMOKE_TIMEOUT_MS || 10 * 60 * 1000);
const BUILD_DEADLINE_MS = Number(process.env.VERIFY_BUILD_TIMEOUT_MS || 10 * 60 * 1000);

const argv = process.argv.slice(2);
const noBuild = argv.includes("--no-build");
const baseArgIndex = argv.indexOf("--base");
const externalBase = baseArgIndex >= 0 ? argv[baseArgIndex + 1] : process.env.SMOKE_BASE;

const SMOKES = [
  { name: "showroom", script: "scripts/smoke-showroom.mjs", covers: "default route: welcome showroom, gated editor, auto-orbit" },
  { name: "editor", script: "scripts/smoke-editor.mjs", covers: "editor: library palette, model + texture + behaviour, exit path" },
  { name: "standalone", script: "scripts/smoke-standalone.mjs", covers: "?host=standalone: agent API, tool bridge, human editor" },
  { name: "levels", script: "scripts/smoke-levels.mjs", covers: "levels workbench: paint, fill, ASCII round trip, undo, create" },
  { name: "foundation", script: "scripts/smoke-foundation.mjs", covers: "?host=legacy: archive player still boots" },
  { name: "scene-store", script: "scripts/smoke-scene-store.mjs", covers: "?scene=: stored scene loads, outside agent edits land in the tab" },
  { name: "triggers", script: "scripts/smoke-triggers.mjs", covers: "trigger volumes: enter/exit events, interactions fire, no collision response" },
  { name: "roundtrip", script: "scripts/smoke-roundtrip.mjs", covers: "write-only-state sweep: every settable v2 property set then read back through state/export/reload/object" },
  { name: "rules", script: "scripts/smoke-rules.mjs", covers: "rules layer: ordered checkpoints, laps, sim-time clock, document round-trip, dropped -> resync" },
  { name: "ballz", script: "scripts/smoke-ballz.mjs", covers: "levels.play(): grid materialises, ball rests, walls stop it, gate + ring fire" },
  { name: "games", script: "scripts/smoke-games.mjs", covers: "front door: showroom -> Games shelf -> playing a level -> back" },
  { name: "overlay", script: "scripts/smoke-overlay.mjs", covers: "2D overlay layer: off by default, one shared loop, draws over 3D, round-trips" },
  { name: "archive-levels", script: "scripts/smoke-archive-levels.mjs", covers: "recovered BallZ arenas: census fidelity, containment, reachable, completable" },
  { name: "spiral", script: "scripts/smoke-spiral.mjs", covers: "Skybox Spiral port: composes, ball rests, movers move, markerless light, completable, round-trips" },
  { name: "world1", script: "scripts/smoke-world1.mjs", covers: "World 1 mesh port: six meshes ready, physics-only descent through both holes, elevator moves, completable" },
  { name: "vehicles", script: "scripts/smoke-vehicles.mjs", covers: "Archive Garage: recovered meshes register, ship in dist, and resolve" },
  { name: "playgrounds", script: "scripts/smoke-playgrounds.mjs", covers: "Nature Lab playgrounds: preset fidelity, fields do work, mass-independent attraction" },
  { name: "milkyway", script: "scripts/smoke-milkyway.mjs", covers: "Voie Lactee: recovered radii and rates, retrograde Moon, textures fetch 200" },
  { name: "buildings", script: "scripts/smoke-buildings.mjs", covers: "Maison massing model: archive transforms exact, recovered lamps, storey toggle" },
  { name: "media", script: "scripts/smoke-media.mjs", covers: "media library: datalake browse/import, in-browser OBJ conversion, editor Media tab + dialog" },
  { name: "physics", script: "scripts/smoke-physics.mjs", covers: "contact materials live: preset pairs differentiate (bouncy vs dead column), deterministic pause/step drive" },
  { name: "store-auth", script: "scripts/smoke-store-auth.mjs", covers: "store auth: token gate on writes + datalake, CORS allowlist, tokenless compat mode" },
  { name: "dna", script: "scripts/smoke-dna.mjs", covers: "DNA forest: deterministic genome drift, preset fidelity, node-level (no browser)" },
];

// Every child is tracked so a signal can take its whole tree down with it. An untracked
// child is an orphaned Chromium waiting to happen.
const children = new Set();

function spawnTracked(command, args, options, label, deadlineMs) {
  const child = spawn(command, args, options);
  children.add(child);
  const { timedOut, clear } = withDeadline(child, deadlineMs, label);
  const finished = new Promise((resolve) => {
    child.on("close", (code) => resolve({ label, code: code ?? 1 }));
    child.on("error", (err) => {
      console.error(`${label}: ${err.message}`);
      resolve({ label, code: 1 });
    });
  });
  // Whichever lands first wins: a real exit, or the deadline killing the tree.
  return Promise.race([finished, timedOut]).finally(() => {
    clear();
    children.delete(child);
  });
}

function run(command, args, label) {
  return spawnTracked(
    command,
    args,
    { cwd: ROOT, shell: process.platform === "win32", stdio: "inherit", env: { ...process.env } },
    label,
    BUILD_DEADLINE_MS,
  );
}

function runSmoke(smoke, base) {
  return spawnTracked(
    process.execPath,
    [smoke.script],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, SMOKE_BASE: base, SMOKE_ARTIFACTS: ARTIFACTS } },
    smoke.name,
    SMOKE_DEADLINE_MS,
  );
}

const results = [];
let server = null;

// Refuse to run alongside another verify. Held for the whole run and released in `finally`,
// including on a signal.
let releaseLock;
try {
  // The lock lives beside the artifacts, so its directory has to exist before the artifacts
  // step that would otherwise create it.
  await mkdir(path.dirname(LOCK_PATH), { recursive: true });
  releaseLock = await acquireVerifyLock(LOCK_PATH, { force: argv.includes("--force-lock") });
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

  if (!externalBase && !noBuild) {
    console.log("\n=== typecheck ===");
    results.push(await run("npx", ["tsc", "--noEmit"], "typecheck"));

    console.log("\n=== build ===");
    results.push(await run("npx", ["vite", "build"], "build"));
  }

  // Only smoke if we have something to smoke.
  const buildFailed = results.some((r) => r.code !== 0);
  if (buildFailed) {
    console.error("\nSkipping smokes — typecheck/build failed.");
  } else {
    let base = externalBase;
    if (!base) {
      server = await startStaticServer({ root: path.join(ROOT, "dist"), port: PORT });
      base = server.url;
    }
    console.log(`\n=== smokes against ${base} ===`);
    for (const smoke of SMOKES) {
      console.log(`\n--- ${smoke.name}: ${smoke.covers} ---`);
      results.push(await runSmoke(smoke, base));
    }
  }
} finally {
  if (server) await server.close();
  await releaseLock();
}

const failed = results.filter((r) => r.code !== 0);
console.log("\n=== verify summary ===");
for (const r of results) console.log(`${r.code === 0 ? "PASS" : "FAIL"}  ${r.label}`);
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed: ${failed.map((f) => f.label).join(", ")}`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed. Screenshots: ${ARTIFACTS}`);


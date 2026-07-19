/**
 * Radial drop sweep: does a dynamic sphere dropped on the showroom terrain come to REST,
 * at the height the *visual* mesh says it should, everywhere across the flattened pad?
 *
 * This is the bug the terrain graduation exists to fix, in two instalments. Before the
 * graduation, the showroom hid the flat ground plane and drew terrain as host decoration
 * with no collider, so a sphere spawned at y=8 fell to y=-12.59 and kept going. "The entity
 * exists" was never the question. After it, one drop resting proved nothing either: the pad
 * was level under the middle of the disc and quietly ramping near its rim, so where you
 * happened to aim decided whether the answer was "rests" or "rolls into the lake".
 *
 * So this probe sweeps. It drops a sphere at many radii and many bearings, and reports for
 * each one the rest height, the drift from the drop point, and the terrain height the mesh
 * predicts there. A single passing drop is not evidence; the whole disc behaving is.
 *
 *   npm run probe:terrain                                   (serves ./dist itself)
 *   SMOKE_BASE=http://127.0.0.1:4188/ npm run probe:terrain  (against a running server)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The showroom pad is flattenRadius 12 blending out over 12 more. Sample well inside it,
// across its rim, and out onto the landform, so the report distinguishes "rests", "rests
// but drifted" and "behaves like a hillside".
const RADII = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9.5, 10, 10.5, 11, 11.5, 12, 13, 14, 16, 18];
const BEARINGS_DEGREES = [0, 37, 90, 143, 180, 217, 270, 323];
const DROP_HEIGHT = 6;
// 15 s of simulated time. A spurious impulse from the collider shows up as a slow, steady
// roll rather than a jump, so a short settle can hide it: at the 0.25 m/s these kicks impart,
// 7 s of drift is inside a grid cell and 15 s is not.
const SETTLE_STEPS = 900;
// A ball that ends within this of where it was dropped counts as having stayed put. Well
// under one grid cell (1.5625 units on the showroom field), so a drift of a whole cell
// cannot hide inside the tolerance.
const DRIFT_TOLERANCE = 0.35;
const HEIGHT_TOLERANCE = 0.15;
// "At rest" has to mean stopped, not merely low. A ball still rolling at 0.05 m/s after 15 s
// is being pushed by something, and that something is the bug.
const SPEED_TOLERANCE = 0.05;

const external = process.env.SMOKE_BASE;
let server = null;
let browser = null;
let exitCode = 0;

try {
  let base = external;
  if (!base) {
    server = await startStaticServer({ root: path.join(ROOT, "dist"), port: Number(process.env.PROBE_PORT || 0) });
    base = server.url;
  }
  console.log(`=== terrain rest sweep against ${base} ===`);

  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: 20000 });
  await page.waitForTimeout(800);

  const result = await page.evaluate(
    async ({ radii, bearings, dropHeight, settleSteps }) => {
      const api = window.__GRAPHYSX__;
      const showroomTerrain = api.state().entities.find((e) => e.type === "terrain");
      if (!showroomTerrain) return { terrain: null, samples: [] };

      // Rebuild the scene as *just* the showroom's terrain. The furnished showroom has a
      // plinth, a kinetic block stack, braziers and trees standing on the middle of the
      // pad, and a ball dropped from 6 m onto those lands on a prop and reports a rest
      // height of 1.9 — which says nothing at all about the ground. Isolating the terrain
      // is what makes the sweep a measurement of the collider rather than of the furniture.
      const cfg = { ...showroomTerrain.terrain };
      delete cfg.minimumHeight;
      delete cfg.maximumHeight;
      delete cfg.colliderVertices;
      const created = api.create({
        schema: "graphysx.agent-world/v2",
        id: "terrain-rest-probe",
        label: "Terrain rest probe",
        entities: [
          {
            id: "probe-terrain",
            type: "terrain",
            label: "Probe Terrain",
            terrain: cfg,
            transform: { position: [0, 0, 0] },
          },
        ],
      });
      if (!created.ok) return { terrain: null, samples: [], createError: created.error };

      const terrain = api.state().entities.find((e) => e.type === "terrain");
      const padRadius = cfg.flattenRadius ?? 0;
      const padHeight = cfg.flattenHeight ?? 0;
      const samples = [];

      for (const radius of radii) {
        for (const bearing of bearings) {
          // r=0 is one point, not one per bearing.
          if (radius === 0 && bearing !== bearings[0]) continue;
          const theta = (bearing * Math.PI) / 180;
          const x = radius * Math.cos(theta);
          const z = radius * Math.sin(theta);
          const id = "probe-drop";
          // `remove` throws on an unknown id, and the first pass has nothing to clear.
          if (api.state().entities.some((e) => e.id === id)) api.remove(id);
          // Inside the pad the ground height is known exactly — that is what a flattened
          // pad means. Outside it we do not assert a height, only that the ball is still
          // on the world.
          const expected = radius <= padRadius ? padHeight : null;
          const spawn = api.spawn({
            id,
            type: "sphere",
            geometry: { radius: 0.5 },
            transform: { position: [x, dropHeight, z] },
            physics: { mode: "dynamic", mass: 1, material: "ball", restitution: 0.3 },
            ephemeral: true,
          });
          if (!spawn.ok) {
            samples.push({ radius, bearing, error: spawn.error ?? "spawn failed" });
            continue;
          }
          // Step deterministically rather than waiting on wall-clock frames, so the probe
          // measures physics and not headless frame rate.
          for (let i = 0; i < settleSteps; i += 1) api.step(1 / 60);
          const entity = api.state().entities.find((e) => e.id === id);
          const p = entity?.position ?? null;
          const v = entity?.physics?.linearVelocity ?? null;
          samples.push({
            radius,
            bearing,
            dropAt: [Number(x.toFixed(3)), Number(z.toFixed(3))],
            restY: p ? Number(p[1].toFixed(3)) : null,
            speed: v ? Number(Math.hypot(v[0], v[1], v[2]).toFixed(4)) : null,
            finalRadius: p ? Number(Math.hypot(p[0], p[2]).toFixed(3)) : null,
            drift: p ? Number(Math.hypot(p[0] - x, p[2] - z).toFixed(3)) : null,
            expectedGround: expected == null ? null : Number(expected.toFixed(3)),
          });
          if (api.state().entities.some((e) => e.id === id)) api.remove(id);
        }
      }

      return {
        terrain: terrain ? { id: terrain.id, terrain: terrain.terrain } : null,
        samples,
      };
    },
    { radii: RADII, bearings: BEARINGS_DEGREES, dropHeight: DROP_HEIGHT, settleSteps: SETTLE_STEPS },
  );

  if (!result.terrain) throw new Error(`No terrain to probe${result.createError ? `: ${result.createError}` : ""}`);
  const cfg = result.terrain.terrain;
  const padRadius = cfg.flattenRadius ?? 0;
  console.log(
    `terrain ${result.terrain.id}: size ${cfg.size} segments ${cfg.segments} ` +
      `cell ${(cfg.size / cfg.segments).toFixed(4)} flattenRadius ${padRadius} ` +
      `flattenFalloff ${cfg.flattenFalloff} flattenHeight ${cfg.flattenHeight}`,
  );

  // Group by radius so the shape of the failure — if any — is visible as a ring, not a list.
  console.log("\nradius  n   restY(min..max)      drift(max)  speed(max)  finalRadius(min..max)   verdict");
  let failures = 0;
  for (const radius of RADII) {
    const group = result.samples.filter((s) => s.radius === radius && !s.error);
    if (!group.length) continue;
    const restYs = group.map((s) => s.restY);
    const drifts = group.map((s) => s.drift);
    const finals = group.map((s) => s.finalRadius);
    const insidePad = radius <= padRadius;
    const maxDrift = Math.max(...drifts);
    const maxSpeed = Math.max(...group.map((s) => s.speed ?? 0));
    const worstHeight = Math.max(...group.map((s) => Math.abs(s.restY - ((s.expectedGround ?? 0) + 0.5))));

    let verdict;
    if (insidePad) {
      // Inside the pad the contract is strict: rest on the pad, at the pad's height,
      // where you were dropped.
      const ok = maxDrift <= DRIFT_TOLERANCE && worstHeight <= HEIGHT_TOLERANCE && maxSpeed <= SPEED_TOLERANCE;
      verdict = ok ? "rests on pad" : "FAIL: left the drop point / wrong height / still moving";
      if (!ok) failures += 1;
    } else {
      // Outside it, terrain is allowed to be terrain — the only wrong answer is falling
      // through it.
      const throughFloor = Math.min(...restYs) < -30;
      verdict = throughFloor ? "FAIL: fell through" : maxDrift > DRIFT_TOLERANCE ? "rolls (slope)" : "rests on slope";
      if (throughFloor) failures += 1;
    }

    console.log(
      `${String(radius).padStart(6)}  ${String(group.length).padStart(2)}  ` +
        `${Math.min(...restYs).toFixed(3).padStart(8)}..${Math.max(...restYs).toFixed(3).padEnd(8)} ` +
        `${maxDrift.toFixed(3).padStart(9)}  ${maxSpeed.toFixed(3).padStart(9)}  ` +
        `${Math.min(...finals).toFixed(2).padStart(7)}..${Math.max(...finals).toFixed(2).padEnd(7)}  ${verdict}`,
    );
  }

  const errored = result.samples.filter((s) => s.error);
  if (errored.length) {
    console.log(`\n${errored.length} sample(s) failed to spawn:`);
    for (const s of errored.slice(0, 5)) console.log(`  r=${s.radius} bearing=${s.bearing}: ${s.error}`);
    failures += 1;
  }

  console.log(`\npageErrors: ${pageErrors.length ? JSON.stringify(pageErrors) : "none"}`);
  if (pageErrors.length) failures += 1;

  if (failures) {
    console.log(`\nRESULT: ${failures} radius band(s) failed.`);
    exitCode = 1;
  } else {
    console.log("\nRESULT: the whole disc rests, and the landform outside it behaves like terrain.");
  }
} catch (error) {
  console.error(`probe failed: ${error?.stack ?? error}`);
  exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}

process.exit(exitCode);

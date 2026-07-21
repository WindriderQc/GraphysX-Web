import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Skybox Spiral — the first §14.5 course port, composed as pure v2 vocabulary.
//
// Asserted the way the arenas smoke asserts: behaviour, not census alone. The ball rests on
// the recovered slab, the movers genuinely move (a kinematic that never moved would pass any
// structural check), the accent light carries no marker sphere, and the course is completed
// for real through the rules layer — every ring, then the halfway gate, then the finish,
// with the finish proven not to count early.

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const out = {};

const browser = await launchSmokeBrowser();
const page = await browser.newPage();
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX__ && !!window.__GRAPHYSX_ARCHIVE__, { timeout: SMOKE_TIMEOUT });

  out.run = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const host = window.__GRAPHYSX_HOST__;

    const created = window.__GRAPHYSX_ARCHIVE__.composeSkyboxSpiral();
    if (!created.ok) return { composeError: created.error };

    const state = () => api.state();
    const entityCount = state().entities.length;
    const rings = api.query({ tag: "collectible" });
    const status0 = api.rules.status();

    // --- the ball settles on the recovered slab -------------------------------------
    api.pause(true);
    for (let i = 0; i < 120; i++) api.step(1 / 60);
    const ball = () => api.query({ ids: ["spiral-ball"] })[0];
    const restY = ball().position[1];

    // --- movers genuinely move --------------------------------------------------------
    const moverBefore = api.query({ ids: ["airplane-sweep"] })[0].position;
    const rotatorBefore = api.query({ ids: ["sky-rotator"] })[0].rotationDegrees[1];
    for (let i = 0; i < 90; i++) api.step(1 / 60);
    const moverAfter = api.query({ ids: ["airplane-sweep"] })[0].position;
    const rotatorAfter = api.query({ ids: ["sky-rotator"] })[0].rotationDegrees[1];
    const moverMoved = Math.hypot(
      moverAfter[0] - moverBefore[0],
      moverAfter[2] - moverBefore[2],
    );

    // --- the accent light has no lightbulb -------------------------------------------
    const accent = api.query({ ids: ["spiral-accent"] })[0];
    let markerVisible = null;
    host.world.group.traverse((o) => {
      if (o.userData && o.userData.agentLightMarker && markerVisible === null) markerVisible = o.visible;
    });

    // --- scenery must not collect ----------------------------------------------------
    // Triggers respond to ANY mover, so a mover whose AABB sweeps a ring's box genuinely
    // collects it — the rotator at its legacy height toggled rings 7, 8 and 12 every
    // rotation. After 210 steps of movers moving, the only collected ring must be ring 1:
    // the authored spawn sits inside its box, so the resting ball crossed it at settle.
    const hiddenAfterSettle = api.query({ tag: "collectible" }).filter((r) => r.visible === false).length;

    // --- finishing early must not count ----------------------------------------------
    // Park OUTSIDE every trigger volume between crossings. Parking at the spawn re-enters
    // ring 1's box (0.5 units away) on every pull-back, and toggle-visibility genuinely
    // toggles — the rules layer dedupes collection, but visibility flips back on. A rolling
    // ball crosses each ring once; the harness must too.
    const PARK = [0, 0.6, 24.5];
    const teleport = (position) => {
      api.update("spiral-ball", { transform: { position } });
      api.step(1 / 60);
      api.update("spiral-ball", { transform: { position: PARK } });
      api.step(1 / 60);
    };
    teleport([0, 0.6, 21]);
    const earlyPhase = api.rules.status().phase;

    // --- complete it for real: rings, then halfway, then finish -----------------------
    // Skip rings already collected (ring 1, crossed at settle): a rolling ball crosses each
    // ring once, and a second crossing genuinely toggles it back into existence.
    for (const ring of rings) {
      if (api.query({ ids: [ring.id] })[0].visible === false) continue;
      teleport([ring.position[0], ring.position[1], ring.position[2]]);
    }
    const afterRings = api.rules.status();
    // Probe the halfway gate near its west end: the gate spans x -9.2..3.8, and probing at
    // the authored centre [-2.7, ...] grazes ring 10's box half a unit behind the gate.
    teleport([-8, 0.6, -22]);
    const afterHalf = api.rules.status();
    teleport([0, 0.6, 21]);
    const finalStatus = api.rules.status();
    const hiddenRings = api.query({ tag: "collectible" }).filter((r) => r.visible === false).length;

    // --- the document round-trips with its rules --------------------------------------
    const doc = api.exportDocument();
    const reloaded = api.load(doc);
    const statusAfterReload = api.rules.status();

    api.pause(false);
    return {
      entityCount,
      ringCount: rings.length,
      armed: { collectibles: status0.collectibleCount, checkpoints: status0.checkpointCount, phase: status0.phase },
      restY,
      moverMoved,
      rotatorTurned: Math.abs(rotatorAfter - rotatorBefore),
      accentMarkerState: accent?.marker ?? null,
      markerVisible,
      earlyPhase,
      hiddenAfterSettle,
      collectedAfterRings: afterRings.collected.length,
      checkpointAfterHalf: afterHalf.checkpointIndex,
      finalPhase: finalStatus.phase,
      elapsed: finalStatus.elapsedSeconds,
      hiddenRings,
      docCarriesRules: Boolean(doc.rules),
      reloadOk: reloaded.ok,
      reloadEntityCount: state().entities.length,
      rulesSurviveReload: typeof statusAfterReload.phase === "string",
    };
  });

  await page.screenshot({ path: path.join(ART, "spiral.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
} finally {
  await browser.close();
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));

const r = out.run ?? {};
const ok =
  !out.fatal &&
  r.entityCount === 44 &&
  r.ringCount === 16 &&
  r.armed?.collectibles === 16 &&
  r.armed?.checkpoints === 1 &&
  r.armed?.phase === "running" &&
  typeof r.restY === "number" && Math.abs(r.restY - 0.54) < 0.08 &&
  r.moverMoved > 0.5 &&
  r.rotatorTurned > 10 &&
  r.accentMarkerState === false &&
  r.markerVisible === false &&
  r.earlyPhase === "running" &&
  r.hiddenAfterSettle === 1 &&
  r.collectedAfterRings === 16 &&
  r.checkpointAfterHalf === 1 &&
  r.finalPhase === "complete" &&
  r.hiddenRings === 16 &&
  r.docCarriesRules === true &&
  r.reloadOk === true &&
  r.reloadEntityCount === 44 &&
  r.rulesSurviveReload === true &&
  pageErrors.length === 0;
process.exit(ok ? 0 : 1);

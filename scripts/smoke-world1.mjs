import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// World 1 — the first true mesh-world port. The assertion that matters most is the pure
// physics one: the ball is spawned in the column above the upper hole, and WITHOUT any
// teleport it must fall through BOTH hole gates (the ordered checkpoints) and come to
// rest on something below — proving the mesh assembly, the derived slab field, the kept-
// clear openings and the rules block all agree about where the world actually is.

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

  out.compose = await page.evaluate(async () => {
    const created = await window.__GRAPHYSX_ARCHIVE__.composeArchiveWorld1();
    return created.ok ? { ok: true, provenance: Boolean(created.provenance) } : { ok: false, error: created.error };
  });

  // Meshes fetch asynchronously; wait for all six to be ready before judging anything.
  await page
    .waitForFunction(() => {
      const models = window.__GRAPHYSX__.query({ tag: "archive-mesh" });
      return models.length === 6 && models.every((m) => m.asset?.status === "ready");
    }, null, { timeout: SMOKE_TIMEOUT })
    .catch(() => {});

  out.run = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const host = window.__GRAPHYSX_HOST__;

    const models = api.query({ tag: "archive-mesh" });
    const status0 = api.rules.status();
    const entityCount = api.state().entities.length;

    // --- the descent, on physics alone ------------------------------------------------
    api.pause(true);
    const ballY = () => api.query({ ids: ["world1-ball"] })[0].position[1];
    const startY = ballY();
    let checkpointsAt = [];
    for (let i = 0; i < 600; i++) {
      api.step(1 / 60);
      const idx = api.rules.status().checkpointIndex;
      if (idx > checkpointsAt.length) checkpointsAt.push({ step: i, y: Math.round(ballY() * 100) / 100 });
    }
    const descent = {
      startY,
      endY: Math.round(ballY() * 100) / 100,
      checkpointIndex: api.rules.status().checkpointIndex,
      checkpointsAt,
      // Rest = the slab field caught it somewhere real, not the catch floor at -29.2.
      restedAbove: ballY() > -20,
      velocity: Math.abs(api.query({ ids: ["world1-ball"] })[0].physics.linearVelocity[1]),
    };

    // --- the elevator genuinely moves --------------------------------------------------
    const elevatorBefore = api.query({ ids: ["world1-elevator-body"] })[0].position[1];
    for (let i = 0; i < 150; i++) api.step(1 / 60);
    const elevatorAfter = api.query({ ids: ["world1-elevator-body"] })[0].position[1];

    // --- bloom + markerless light are live scene data ----------------------------------
    const post = api.state().environment.post;
    const envelope = api.state().environment.envelope;

    // --- finish (teleport is fine here: the descent proved the world) ------------------
    const finish = api.query({ ids: ["world1-finish-gate"] })[0];
    api.update("world1-ball", { transform: { position: finish.position } });
    api.step(1 / 60);
    const finalStatus = api.rules.status();

    // --- document round-trip ------------------------------------------------------------
    const doc = api.exportDocument();
    const reloaded = api.load(doc);
    api.pause(false);

    return {
      entityCount,
      modelsReady: models.length === 6 && models.every((m) => m.asset?.status === "ready"),
      armed: { checkpoints: status0.checkpointCount, collectibles: status0.collectibleCount, phase: status0.phase },
      descent,
      elevatorMoved: Math.abs(elevatorAfter - elevatorBefore),
      bloom: post?.bloom?.strength ?? null,
      envelopeFar: envelope?.cameraFar ?? null,
      finalPhase: finalStatus.phase,
      docCarriesRules: Boolean(doc.rules),
      reloadOk: reloaded.ok,
      reloadEntityCount: api.state().entities.length,
    };
  });

  await page.screenshot({ path: path.join(ART, "world1.png"), fullPage: false });
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
  out.compose?.ok === true &&
  r.modelsReady === true &&
  r.armed?.checkpoints === 2 &&
  r.armed?.collectibles === 0 &&
  r.armed?.phase === "running" &&
  r.descent?.checkpointIndex === 2 &&
  r.descent?.restedAbove === true &&
  typeof r.descent?.velocity === "number" && r.descent.velocity < 0.5 &&
  r.elevatorMoved > 0.4 &&
  r.bloom === 0.55 &&
  r.envelopeFar === 420 &&
  r.finalPhase === "complete" &&
  r.docCarriesRules === true &&
  r.reloadOk === true &&
  r.reloadEntityCount === r.entityCount &&
  pageErrors.length === 0;
process.exit(ok ? 0 : 1);

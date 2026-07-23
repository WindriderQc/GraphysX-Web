import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

// Level1 2011's bounded front-door proof, and the envelope capability's stress case: the
// largest recovered mesh (1135 units) composed at 1:1, discovered on the Games shelf, exact
// trimesh collider awaited, both authored gates crossed in order under real gravity with a
// deterministic step budget, results panel, replay, and the showroom return.
//
// Same shape as smoke-map1.mjs with two deliberate differences: the run budget is ~160
// simulated seconds because this canyon is an order of magnitude longer than Map 1's descent,
// and the material assertion checks only `standard === true` — the specific roughness values
// belong to the PBR-finish pass, which this composition does not author.

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const badResponses = [];
const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("response", (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });

const out = {};
try {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => Boolean(window.__GRAPHYSX_HOST__), null, { timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-welcome .gx-go-games", { timeout: SMOKE_TIMEOUT });
  await page.click(".gx-welcome .gx-go-games");
  await page.waitForSelector('.gx-shelf-row[data-course-id="archive-level1-2011"]', { timeout: SMOKE_TIMEOUT });

  out.shelf = await page.evaluate(() => {
    const row = document.querySelector('.gx-shelf-row[data-course-id="archive-level1-2011"]');
    return {
      listed: Boolean(row),
      label: row?.querySelector(".gx-shelf-name")?.textContent ?? "",
      meta: row?.querySelector(".gx-shelf-meta")?.textContent ?? "",
    };
  });

  await page.click('.gx-shelf-row[data-course-id="archive-level1-2011"]');
  await page.waitForFunction(() => {
    const terrain = window.__GRAPHYSX__.query({ ids: ["level1-terrain"] })[0];
    return window.__GRAPHYSX_HOST__.mode === "play"
      && terrain?.asset?.status === "ready"
      && terrain.physics?.collider?.effective === "trimesh"
      && window.__GRAPHYSX__.state()?.paused === false;
  }, null, { timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-bz-hud", { timeout: SMOKE_TIMEOUT });

  out.loaded = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const terrain = api.query({ ids: ["level1-terrain"] })[0];
    const run = api.rules.status();
    const exported = api.export();
    const document_ = api.exportDocument();
    const projection = JSON.parse(window.render_game_to_text());
    let material = null;
    window.__GRAPHYSX_HOST__.world.getEntityObject("level1-terrain")?.traverse((object) => {
      if (!material && object.isMesh) material = Array.isArray(object.material) ? object.material[0] : object.material;
    });
    const environment = api.state()?.environment ?? null;
    return {
      mode: window.__GRAPHYSX_HOST__.mode,
      paused: api.state()?.paused,
      worldId: api.state()?.world.id,
      terrain: terrain?.physics?.collider ?? null,
      material: material ? { type: material.type, lit: material.isMeshBasicMaterial !== true } : null,
      // The whole reason this world ships last: assert the scene's envelope actually took —
      // a 1900 camera far against the host default of 260.
      envelope: environment?.envelope ?? null,
      rules: run ? {
        phase: run.phase,
        checkpointCount: run.checkpointCount,
        checkpointIndex: run.checkpointIndex,
        nextCheckpointId: run.nextCheckpointId,
      } : null,
      exportWorldId: exported?.id ?? null,
      exportTerrainCollider: exported?.entities.find((entity) => entity.id === "level1-terrain")?.physics?.collider ?? null,
      exportRules: document_?.rules ?? null,
      projectedWorld: projection.world?.id ?? null,
      projectedPlayer: projection.players?.[0]?.id ?? null,
    };
  });
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.focusing === false, null, { timeout: SMOKE_TIMEOUT });
  await page.screenshot({ path: path.join(ART, "level1-2011-gameplay.png") });

  // Deterministic inspection, then the real browser binding: ArrowUp maps to push-north, and a
  // more-negative Z velocity proves composed play resolved rules.subjectId on this course too.
  await page.evaluate(() => {
    window.__GRAPHYSX__.pause(true);
    window.__GRAPHYSX__.rules.reset();
  });
  const beforeInput = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["level1-ball"] })[0]);
  await page.keyboard.press("ArrowUp");
  const afterInput = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["level1-ball"] })[0]);
  out.input = {
    beforeVelocityZ: beforeInput?.physics?.linearVelocity?.[2] ?? null,
    afterVelocityZ: afterInput?.physics?.linearVelocity?.[2] ?? null,
  };

  // The long descent under real gravity over the exact collider. A periodic downhill nudge
  // keeps the adapted run committed without teleporting across either gate; the fixed step
  // budget (~160 simulated seconds) makes a wedged collider or an unreachable gate a failure
  // rather than a hang.
  out.run = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const subjectId = "level1-ball";
    const trace = [];
    let finite = true;
    let checkpointSeen = false;
    const maxSteps = 60 * 160;
    for (let step = 0; step < maxSteps; step += 1) {
      if (step > 0 && step % 180 === 0) api.interact(subjectId, "push-north");
      api.step(1 / 60);
      const ball = api.query({ ids: [subjectId] })[0];
      const status = api.rules.status();
      const sampleFinite = Boolean(ball?.position?.every(Number.isFinite) && ball.physics?.linearVelocity?.every(Number.isFinite));
      finite &&= sampleFinite;
      if ((status?.checkpointIndex ?? 0) >= 1) checkpointSeen = true;
      if (step % 300 === 0 || status?.phase === "complete" || !sampleFinite) {
        trace.push({
          step,
          position: ball?.position ?? null,
          velocity: ball?.physics?.linearVelocity ?? null,
          phase: status?.phase ?? null,
          checkpointIndex: status?.checkpointIndex ?? null,
          nextCheckpointId: status?.nextCheckpointId ?? null,
          finite: sampleFinite,
        });
      }
      if (status?.phase === "complete" || !sampleFinite) break;
    }
    const final = api.rules.status();
    return {
      trace,
      finite,
      checkpointSeen,
      final: final ? {
        phase: final.phase,
        checkpointIndex: final.checkpointIndex,
        nextCheckpointId: final.nextCheckpointId,
      } : null,
    };
  });

  await page.waitForSelector(".gx-bz-win", { timeout: SMOKE_TIMEOUT });
  out.results = await page.evaluate(() => ({
    title: document.querySelector(".gx-bz-win-title")?.textContent ?? "",
    scoreCells: document.querySelectorAll(".gx-bz-win-stat").length,
    replay: Boolean(document.querySelector(".gx-bz-win-again")),
    back: Boolean(document.querySelector(".gx-bz-win-actions .gx-bz-win-btn:not(.gx-bz-win-again)")),
  }));
  await page.screenshot({ path: path.join(ART, "level1-2011-complete.png") });

  await page.click(".gx-bz-win-again");
  await page.waitForFunction(() => {
    const api = window.__GRAPHYSX__;
    const terrain = api.query({ ids: ["level1-terrain"] })[0];
    return api.rules.status()?.phase === "running"
      && api.state()?.paused === false
      && terrain?.asset?.status === "ready"
      && terrain.physics?.collider?.effective === "trimesh"
      && terrain.physics.collider.vertexCount === 828
      && terrain.physics.collider.triangleCount === 1648
      && Boolean(document.querySelector(".gx-bz-hud"));
  }, null, { timeout: SMOKE_TIMEOUT });
  out.replay = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const ball = api.query({ ids: ["level1-ball"] })[0];
    const terrain = api.query({ ids: ["level1-terrain"] })[0];
    return {
      phase: api.rules.status()?.phase,
      collider: terrain?.physics?.collider ?? null,
      ballFinite: Boolean(ball?.position?.every(Number.isFinite) && ball.physics?.linearVelocity?.every(Number.isFinite)),
      winGone: !document.querySelector(".gx-bz-win"),
      hudShown: Boolean(document.querySelector(".gx-bz-hud")),
    };
  });

  await page.click(".gx-bz-exit");
  await page.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });
  out.returned = await page.evaluate(() => ({
    mode: window.__GRAPHYSX_HOST__.mode,
    showroomEntities: window.__GRAPHYSX__.query({ tag: "showroom" }).length,
    hudGone: !document.querySelector(".gx-bz-hud"),
  }));
} catch (error) {
  out.fatal = String(error);
}

out.badResponses = badResponses;
out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
const report = JSON.stringify(out, null, 2);
writeFileSync(path.join(ART, "level1-2011-results.json"), report);
console.log(report);
await browser.close();

const ok =
  out.shelf?.listed === true &&
  /Level1 2011/i.test(out.shelf?.label ?? "") &&
  out.loaded?.mode === "play" &&
  out.loaded?.paused === false &&
  out.loaded?.worldId === "graphysx-archive-level1-2011" &&
  out.loaded?.exportWorldId === "graphysx-archive-level1-2011" &&
  out.loaded?.projectedWorld === "graphysx-archive-level1-2011" &&
  out.loaded?.projectedPlayer === "level1-ball" &&
  out.loaded?.exportTerrainCollider === "trimesh" &&
  out.loaded?.terrain?.effective === "trimesh" &&
  out.loaded?.terrain?.vertexCount === 828 &&
  out.loaded?.terrain?.triangleCount === 1648 &&
  // A lit material of a known type — which specific class is the PBR-finish pass's business,
  // asserted in its own coverage; this smoke cares that the mesh is really lit and shaded.
  out.loaded?.material?.lit === true &&
  typeof out.loaded?.material?.type === "string" &&
  out.loaded?.envelope?.cameraFar === 1900 &&
  out.loaded?.envelope?.fogFar === 1350 &&
  out.loaded?.rules?.phase === "running" &&
  out.loaded?.rules?.checkpointCount === 2 &&
  out.loaded?.rules?.checkpointIndex === 0 &&
  out.loaded?.rules?.nextCheckpointId === "level1-checkpoint-rim" &&
  out.loaded?.exportRules?.subjectId === "level1-ball" &&
  out.loaded?.exportRules?.checkpoints?.[0]?.triggerId === "level1-checkpoint-rim" &&
  out.loaded?.exportRules?.checkpoints?.[1]?.triggerId === "level1-checkpoint-deep" &&
  out.loaded?.exportRules?.finish?.triggerId === "level1-finish" &&
  Number.isFinite(out.input?.beforeVelocityZ) &&
  out.input.afterVelocityZ < out.input.beforeVelocityZ - 1 &&
  out.run?.trace?.length > 1 &&
  out.run?.checkpointSeen === true &&
  out.run?.final?.phase === "complete" &&
  out.run?.final?.checkpointIndex === 2 &&
  out.run?.final?.nextCheckpointId === null &&
  out.run?.finite === true &&
  /Level1 2011.*Complete/i.test(out.results?.title ?? "") &&
  out.results?.scoreCells >= 2 &&
  out.results?.replay === true &&
  out.results?.back === true &&
  out.replay?.phase === "running" &&
  out.replay?.collider?.effective === "trimesh" &&
  out.replay?.collider?.vertexCount === 828 &&
  out.replay?.collider?.triangleCount === 1648 &&
  out.replay?.ballFinite === true &&
  out.replay?.winGone === true &&
  out.replay?.hudShown === true &&
  out.returned?.mode === "scene" &&
  out.returned?.showroomEntities > 0 &&
  out.returned?.hudGone === true &&
  badResponses.length === 0 && consoleErrors.length === 0 && pageErrors.length === 0;

process.exitCode = out.fatal || !ok ? 1 : 0;

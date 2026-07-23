import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

// Map 1's bounded front-door proof: discover the composed course, wait for its exact recovered
// collider, prove the shared play layer targets its rules subject, cross the authored checkpoint
// and finish in order, then verify replay and the showroom return.

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
  await page.waitForSelector('.gx-shelf-row[data-course-id="archive-map1"]', { timeout: SMOKE_TIMEOUT });

  out.shelf = await page.evaluate(() => {
    const row = document.querySelector('.gx-shelf-row[data-course-id="archive-map1"]');
    return {
      listed: Boolean(row),
      label: row?.querySelector(".gx-shelf-name")?.textContent ?? "",
      meta: row?.querySelector(".gx-shelf-meta")?.textContent ?? "",
    };
  });

  await page.click('.gx-shelf-row[data-course-id="archive-map1"]');
  await page.waitForFunction(() => {
    const terrain = window.__GRAPHYSX__.query({ ids: ["map1-terrain"] })[0];
    return window.__GRAPHYSX_HOST__.mode === "play"
      && terrain?.asset?.status === "ready"
      && terrain.physics?.collider?.effective === "trimesh"
      && window.__GRAPHYSX__.state()?.paused === false;
  }, null, { timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-bz-hud", { timeout: SMOKE_TIMEOUT });

  out.loaded = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const terrain = api.query({ ids: ["map1-terrain"] })[0];
    const run = api.rules.status();
    const exported = api.export();
    const document_ = api.exportDocument();
    const projection = JSON.parse(window.render_game_to_text());
    return {
      mode: window.__GRAPHYSX_HOST__.mode,
      paused: api.state()?.paused,
      worldId: api.state()?.world.id,
      hudCourse: document.querySelector(".gx-bz-course")?.textContent ?? "",
      terrain: terrain?.physics?.collider ?? null,
      rules: run ? {
        phase: run.phase,
        checkpointCount: run.checkpointCount,
        checkpointIndex: run.checkpointIndex,
        nextCheckpointId: run.nextCheckpointId,
      } : null,
      exportWorldId: exported?.id ?? null,
      exportTerrainCollider: exported?.entities.find((entity) => entity.id === "map1-terrain")?.physics?.collider ?? null,
      exportRules: document_?.rules ?? null,
      projectedWorld: projection.world?.id ?? null,
      projectedPlayer: projection.players?.[0]?.id ?? null,
    };
  });
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.focusing === false, null, { timeout: SMOKE_TIMEOUT });
  out.frame = await page.evaluate(() => ({
    camera: window.__GRAPHYSX_HOST__.camera.position.toArray().map((value) => Number(value.toFixed(2))),
    target: window.__GRAPHYSX_HOST__.orbitTarget.toArray().map((value) => Number(value.toFixed(2))),
  }));
  await page.screenshot({ path: path.join(ART, "map1-gameplay.png") });

  // Pause for deterministic inspection, then use the real browser binding. ArrowUp maps to
  // push-north; a more-negative Z velocity proves composed play resolved rules.subjectId.
  await page.evaluate(() => {
    window.__GRAPHYSX__.pause(true);
    window.__GRAPHYSX__.rules.reset();
  });
  const beforeInput = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["map1-ball"] })[0]);
  await page.keyboard.press("ArrowUp");
  const afterInput = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["map1-ball"] })[0]);
  out.input = {
    beforeVelocityZ: beforeInput?.physics?.linearVelocity?.[2] ?? null,
    afterVelocityZ: afterInput?.physics?.linearVelocity?.[2] ?? null,
  };

  // Let the ball descend over the exact collider under real gravity. A small north impulse every
  // three simulated seconds keeps the adapted run moving down-course without teleporting across
  // either rule volume. The fixed-step bound makes a wedged collider or unreachable gate fail.
  out.run = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const subjectId = "map1-ball";
    const trace = [];
    let finite = true;
    let checkpointSeen = false;
    const maxSteps = 60 * 75;
    for (let step = 0; step < maxSteps; step += 1) {
      if (step > 0 && step % 180 === 0) api.interact(subjectId, "push-north");
      api.step(1 / 60);
      const ball = api.query({ ids: [subjectId] })[0];
      const status = api.rules.status();
      const sampleFinite = Boolean(ball?.position?.every(Number.isFinite) && ball.physics?.linearVelocity?.every(Number.isFinite));
      finite &&= sampleFinite;
      if ((status?.checkpointIndex ?? 0) >= 1) checkpointSeen = true;
      if (step % 60 === 0 || status?.phase === "complete" || !sampleFinite) {
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
  await page.screenshot({ path: path.join(ART, "map1-complete.png") });

  await page.click(".gx-bz-win-again");
  await page.waitForFunction(() => {
    const api = window.__GRAPHYSX__;
    const terrain = api.query({ ids: ["map1-terrain"] })[0];
    return api.rules.status()?.phase === "running"
      && api.state()?.paused === false
      && terrain?.asset?.status === "ready"
      && terrain.physics?.collider?.effective === "trimesh"
      && terrain.physics.collider.vertexCount === 699
      && terrain.physics.collider.triangleCount === 1456
      && Boolean(document.querySelector(".gx-bz-hud"));
  }, null, { timeout: SMOKE_TIMEOUT });
  out.replay = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const ball = api.query({ ids: ["map1-ball"] })[0];
    const terrain = api.query({ ids: ["map1-terrain"] })[0];
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
writeFileSync(path.join(ART, "map1-results.json"), report);
console.log(report);
await browser.close();

const ok =
  out.shelf?.listed === true &&
  /Map 1/i.test(out.shelf?.label ?? "") &&
  out.loaded?.mode === "play" &&
  out.loaded?.paused === false &&
  out.loaded?.worldId === "graphysx-archive-map1" &&
  out.loaded?.exportWorldId === "graphysx-archive-map1" &&
  out.loaded?.projectedWorld === "graphysx-archive-map1" &&
  out.loaded?.projectedPlayer === "map1-ball" &&
  out.loaded?.exportTerrainCollider === "trimesh" &&
  out.loaded?.terrain?.effective === "trimesh" &&
  out.loaded?.terrain?.vertexCount === 699 &&
  out.loaded?.terrain?.triangleCount === 1456 &&
  out.loaded?.rules?.phase === "running" &&
  out.loaded?.rules?.checkpointCount === 1 &&
  out.loaded?.rules?.checkpointIndex === 0 &&
  out.loaded?.rules?.nextCheckpointId === "map1-checkpoint-halfway" &&
  out.loaded?.exportRules?.subjectId === "map1-ball" &&
  out.loaded?.exportRules?.checkpoints?.[0]?.triggerId === "map1-checkpoint-halfway" &&
  out.loaded?.exportRules?.finish?.triggerId === "map1-finish" &&
  Number.isFinite(out.input?.beforeVelocityZ) &&
  out.input.afterVelocityZ < out.input.beforeVelocityZ - 1 &&
  out.run?.trace?.length > 1 &&
  out.run?.checkpointSeen === true &&
  out.run?.final?.phase === "complete" &&
  out.run?.final?.checkpointIndex === 1 &&
  out.run?.final?.nextCheckpointId === null &&
  out.run?.finite === true &&
  /Map 1.*Complete/i.test(out.results?.title ?? "") &&
  out.results?.scoreCells >= 2 &&
  out.results?.replay === true &&
  out.results?.back === true &&
  out.replay?.phase === "running" &&
  out.replay?.collider?.effective === "trimesh" &&
  out.replay?.collider?.vertexCount === 699 &&
  out.replay?.collider?.triangleCount === 1456 &&
  out.replay?.ballFinite === true &&
  out.replay?.winGone === true &&
  out.replay?.hudShown === true &&
  out.returned?.mode === "scene" &&
  out.returned?.showroomEntities > 0 &&
  out.returned?.hudGone === true &&
  badResponses.length === 0 && consoleErrors.length === 0 && pageErrors.length === 0;

process.exitCode = out.fatal || !ok ? 1 : 0;

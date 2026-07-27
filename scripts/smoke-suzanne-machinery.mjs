import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

// Player-visible proof for the stale "needs GLB conversion" ledger entry: launch through the
// Games shelf, resolve all eight exact vendored models, confirm the moving convex colliders move
// with their rendered entities, traverse the recovered twelve-point route, and finish cleanly.

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
  await page.click(".gx-welcome .gx-go-games");
  await page.waitForSelector('.gx-shelf-row[data-course-id="archive-suzanne-machinery"]', { timeout: SMOKE_TIMEOUT });
  out.shelf = await page.evaluate(() => {
    const row = document.querySelector('.gx-shelf-row[data-course-id="archive-suzanne-machinery"]');
    return {
      listed: Boolean(row),
      label: row?.querySelector(".gx-shelf-name")?.textContent ?? "",
      meta: row?.querySelector(".gx-shelf-meta")?.textContent ?? "",
    };
  });

  await page.click('.gx-shelf-row[data-course-id="archive-suzanne-machinery"]');
  await page.waitForFunction(() => {
    const api = window.__GRAPHYSX__;
    const models = api.query({ tag: "archive-mesh" });
    const ballModels = api.query({ ids: ["suzanne-machinery-ball:shell", "suzanne-machinery-ball:aim"] });
    return window.__GRAPHYSX_HOST__.mode === "play"
      && models.length === 8
      && models.every((entity) => entity.asset?.status === "ready")
      && ballModels.every((entity) => entity.asset?.status === "ready")
      && api.state()?.paused === false;
  }, null, { timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-bz-hud", { timeout: SMOKE_TIMEOUT });

  out.loaded = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const models = api.query({ tag: "archive-mesh" });
    const movers = api.query({ tag: "moving-obstacle" });
    return {
      worldId: api.state()?.world.id,
      mode: window.__GRAPHYSX_HOST__.mode,
      modelCount: models.length,
      assets: models.map((entity) => entity.asset?.id).sort(),
      moverCount: movers.length,
      movers: movers.map((entity) => ({
        id: entity.id,
        collider: entity.physics?.collider?.effective,
        vertices: entity.physics?.collider?.vertexCount,
        triangles: entity.physics?.collider?.triangleCount,
      })),
      levelCollider: api.query({ ids: ["suzanne-machinery-level"] })[0]?.physics?.collider ?? null,
      route: api.rules.get(),
      run: api.rules.status(),
      classicBall: api.query({ ids: ["suzanne-machinery-ball"] })[0]?.tags ?? [],
      catalogCount: api.assets().filter((asset) => asset.category === "archive-machinery").length,
    };
  });

  // Freeze the deterministic simulation, then prove all three collision-bearing source movers
  // advance under ordinary scene behaviours. Kinematic bodies are written from these same
  // transforms by updateSimulation before the Rapier step.
  out.motion = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.pause(true);
    const ids = ["suzanne-machinery-piston", "suzanne-machinery-door-gate", "suzanne-machinery-rotator-cube"];
    const before = Object.fromEntries(ids.map((id) => {
      const entity = api.query({ ids: [id] })[0];
      return [id, { position: entity.position, rotationDegrees: entity.rotationDegrees }];
    }));
    api.step(0.5);
    const after = Object.fromEntries(ids.map((id) => {
      const entity = api.query({ ids: [id] })[0];
      return [id, { position: entity.position, rotationDegrees: entity.rotationDegrees }];
    }));
    return { before, after };
  });
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.focusing === false, null, { timeout: SMOKE_TIMEOUT });
  // Visual QA uses a stable whole-arena overview. Gameplay resumes the ordinary chase camera;
  // this camera-only staging does not alter the scene document or any assertion above.
  await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    host.chaseTargetId = null;
    host.camera.position.set(8.5, 7.2, 10.5);
    host.camera.lookAt(0, 0.65, 0);
    host.orbitTarget.set(0, 0.65, 0);
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(ART, "suzanne-machinery-gameplay.png") });

  // Traverse each trigger in source order. Parking between visits gives trigger.exit a step,
  // so this exercises the same rule stream as a physical lap without making CI steer a spline.
  out.run = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const points = [
      [-3, 0.72, -1.5], [-2.5399, 0.72, 1.3593], [-2.3986, 0.72, 2.7174],
      [-2.6173, 0.72, 3.2994], [-2.0089, 0.72, 3.5568], [0.4474, 0.72, 3.4028],
      [2.5719, 0.72, 2.9493], [3.0717, 0.72, 2.1331], [2.9707, 0.72, 0.8238],
      [2.6525, 0.72, -0.7013], [2.3459, 0.72, -2.3412], [-0.6319, 0.72, -2.9781],
    ];
    const statuses = [];
    api.rules.reset();
    for (const position of points) {
      api.update("suzanne-machinery-ball", { transform: { position: [8, 4, 8] }, physics: { linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0] } });
      api.step(1 / 30);
      api.update("suzanne-machinery-ball", { transform: { position }, physics: { linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0] } });
      api.step(1 / 30);
      const status = api.rules.status();
      statuses.push({ phase: status?.phase, checkpointIndex: status?.checkpointIndex });
    }
    const ball = api.query({ ids: ["suzanne-machinery-ball"] })[0];
    return { statuses, final: api.rules.status(), ballFinite: ball.position.every(Number.isFinite) };
  });
  await page.waitForSelector(".gx-bz-win", { timeout: SMOKE_TIMEOUT });
  await page.screenshot({ path: path.join(ART, "suzanne-machinery-complete.png") });
} catch (error) {
  out.fatal = String(error);
}

out.badResponses = badResponses;
out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
writeFileSync(path.join(ART, "suzanne-machinery-results.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();

const moved = (id, field, axis) => {
  const before = out.motion?.before?.[id]?.[field]?.[axis];
  const after = out.motion?.after?.[id]?.[field]?.[axis];
  return Number.isFinite(before) && Number.isFinite(after) && Math.abs(after - before) > 0.001;
};
const ok =
  out.shelf?.listed === true &&
  /Suzanne Machinery/i.test(out.shelf?.label ?? "") &&
  out.loaded?.worldId === "graphysx-archive-suzanne-machinery" &&
  out.loaded?.mode === "play" &&
  out.loaded?.modelCount === 8 &&
  out.loaded?.catalogCount === 8 &&
  out.loaded?.moverCount === 3 &&
  out.loaded?.movers?.every((mover) => mover.collider === "convex-hull" && mover.vertices > 0) &&
  out.loaded?.levelCollider?.effective === "trimesh" &&
  out.loaded?.levelCollider?.vertexCount === 8208 &&
  out.loaded?.levelCollider?.triangleCount === 4116 &&
  out.loaded?.route?.checkpoints?.length === 11 &&
  out.loaded?.route?.finish?.triggerId === "suzanne-machinery-finish" &&
  out.loaded?.run?.checkpointCount === 11 &&
  out.loaded?.classicBall?.includes("ball-preset:classic") &&
  moved("suzanne-machinery-piston", "position", 0) &&
  moved("suzanne-machinery-door-gate", "position", 1) &&
  moved("suzanne-machinery-rotator-cube", "rotationDegrees", 1) &&
  out.run?.statuses?.length === 12 &&
  out.run?.final?.phase === "complete" &&
  out.run?.final?.checkpointIndex === 11 &&
  out.run?.ballFinite === true &&
  badResponses.length === 0 && consoleErrors.length === 0 && pageErrors.length === 0;

process.exitCode = out.fatal || !ok ? 1 : 0;

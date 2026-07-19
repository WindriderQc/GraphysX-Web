import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const EXE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const out = {};
try {
  // Default route = the clean host booting the welcome showroom.
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: 20000 });
  await page.waitForSelector(".gx-welcome", { timeout: 15000 });
  await page.waitForTimeout(700);

  out.welcomePresent = (await page.$(".gx-welcome")) !== null;
  out.editorHiddenInitially = await page.evaluate(() => {
    const t = document.querySelector(".gx-ed-toolbar");
    return !t || getComputedStyle(t).display === "none";
  });
  out.entityCount = await page.evaluate(() => window.__GRAPHYSX__.state().entities.length);

  const probeCam = () => page.evaluate(() => {
    const h = window.__GRAPHYSX_HOST__;
    const p = h.camera.position;
    return { x: p.x, z: p.z, frame: h.frameCount };
  });
  const a = await probeCam();
  await page.waitForTimeout(1500);
  const b = await probeCam();
  out.framesAdvanced = b.frame - a.frame;
  out.camMoved = Math.hypot(b.x - a.x, b.z - a.z);
  // Any camera drift with no user input proves auto-orbit is active (headless fps is low,
  // so this is intentionally movement-based, not distance-thresholded).
  out.autoOrbiting = out.framesAdvanced > 0 && out.camMoved > 0.004;

  await page.screenshot({ path: path.join(ART, "showroom.png"), fullPage: false });

  // Interactive physics: clicking a kinetic body fires its apply-impulse interaction, and
  // clicking the ground drops a dynamic sphere. Both go through the ordinary agent API.
  const entityPos = (id) => page.evaluate((entityId) => {
    const e = window.__GRAPHYSX__.state().entities.find((x) => x.id === entityId);
    return e ? e.position ?? e.transform?.position ?? null : null;
  }, id);
  const screenOf = (id) => page.evaluate((entityId) => {
    const host = window.__GRAPHYSX_HOST__;
    const obj = host.world.getEntityObject(entityId);
    if (!obj) return null;
    const v = obj.getWorldPosition(new (obj.position.constructor)());
    v.project(host.camera);
    const rect = host.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((-v.y + 1) / 2) * rect.height };
  }, id);

  const blockBefore = await entityPos("showroom-block-5");
  const blockAt = await screenOf("showroom-block-5");
  if (blockAt) await page.mouse.click(blockAt.x, blockAt.y);
  // Wait for the body to actually move rather than guessing a duration. Headless software
  // GL runs the frame loop at a few fps, so a fixed timeout races the physics step — this
  // is a wait on the condition being asserted, not a weaker assertion.
  await page
    .waitForFunction(
      (a) => {
        const e = window.__GRAPHYSX__.state().entities.find((x) => x.id === a.id);
        const p = e && (e.position ?? e.transform?.position);
        return !!p && Math.hypot(p[0] - a.b[0], p[1] - a.b[1], p[2] - a.b[2]) > 0.15;
      },
      { id: "showroom-block-5", b: blockBefore },
      { timeout: 20000 },
    )
    .catch(() => {});
  const blockAfter = await entityPos("showroom-block-5");
  out.impulseMoved = blockBefore && blockAfter
    ? Number(Math.hypot(blockAfter[0] - blockBefore[0], blockAfter[1] - blockBefore[1], blockAfter[2] - blockBefore[2]).toFixed(3))
    : 0;

  const countBefore = await page.evaluate(() => window.__GRAPHYSX__.state().entities.length);
  await page.mouse.click(300, 630);
  await page
    .waitForFunction(
      () => window.__GRAPHYSX__.state().entities.some((e) => e.id.startsWith("showroom-drop-")),
      null,
      { timeout: 20000 },
    )
    .catch(() => {});
  out.ballDropped = await page.evaluate(() =>
    window.__GRAPHYSX__.state().entities.some((e) => e.id.startsWith("showroom-drop-")));
  out.spawnedOne = (await page.evaluate(() => window.__GRAPHYSX__.state().entities.length)) === countBefore + 1;

  // The ground is a `terrain` entity in the scene, not host decoration, and it carries a
  // static heightfield collider.
  out.terrain = await page.evaluate(() => {
    const t = window.__GRAPHYSX__.state().entities.find((e) => e.type === "terrain");
    if (!t) return null;
    return {
      id: t.id,
      hasCollider: !!t.physics && t.physics.mode === "static",
      heightmap: t.terrain.heightmap,
      minimumHeight: t.terrain.minimumHeight,
      maximumHeight: t.terrain.maximumHeight,
      colliderVertices: t.terrain.colliderVertices,
    };
  });

  // Water is a scene entity too, and its reflection is an entity flag rather than a host
  // setting — so the cost is something a scene author can see and turn off.
  out.water = await page.evaluate(() => {
    const w = window.__GRAPHYSX__.state().entities.find((e) => e.type === "water");
    return w ? { id: w.id, reflection: w.water.reflection, resolution: w.water.reflectionResolution } : null;
  });

  // THE regression guard. Terrain used to be sine-displaced host decoration with NO
  // collider: the flat ground plane was hidden and nothing replaced its physics, so a ball
  // dropped in the showroom fell to y=-12 and kept going, forever. The old assertion only
  // checked that the entity existed, which is exactly why that shipped. Assert instead that
  // the ball STOPS — settles at a height on the terrain and stays there.
  out.ballRest = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const id = api.state().entities.map((e) => e.id).filter((i) => i.startsWith("showroom-drop-")).pop();
    if (!id) return null;
    const read = () => api.state().entities.find((e) => e.id === id) ?? null;
    const spawnY = read().position[1];
    // Settle deterministically through the public `step()` rather than waiting on frames:
    // headless software GL runs the loop at a few fps, so wall-clock waiting would measure
    // frame rate instead of physics. This is the same integrator the render loop drives.
    for (let i = 0; i < 24; i += 1) api.step(0.5);
    const settledY = read().position[1];
    for (let i = 0; i < 8; i += 1) api.step(0.5);
    const entity = read();
    return {
      spawnY: Number(spawnY.toFixed(3)),
      settledY: Number(settledY.toFixed(3)),
      finalY: Number(entity.position[1].toFixed(3)),
      driftAfterSettle: Number(Math.abs(entity.position[1] - settledY).toFixed(3)),
      velocityY: entity.physics ? entity.physics.linearVelocity[1] : null,
    };
  });

  await page.click(".gx-welcome button");
  // The editor module is loaded on demand, so wait for it to mount rather than guessing.
  await page.waitForSelector(".gx-ed-toolbar", { timeout: 15000 });
  await page.waitForTimeout(200);
  out.editorVisibleAfterEnter = await page.evaluate(() => {
    const t = document.querySelector(".gx-ed-toolbar");
    return !!t && getComputedStyle(t).display !== "none";
  });
  out.welcomeGone = (await page.$(".gx-welcome")) === null;
  await page.screenshot({ path: path.join(ART, "showroom-editor.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
}

// The ball must come to REST on the terrain, not merely exist:
//  - it fell (it was dropped from above and ended lower),
//  - it is no longer moving vertically,
//  - it stopped moving and stayed stopped over a further 4 simulated seconds, and
//  - it is resting within the terrain's own height range rather than somewhere below it.
// Without a collider all four of these fail hard: the old behaviour was y ≈ -1000, vy ≈ -90.
const rest = out.ballRest;
const terrain = out.terrain;
const ballCameToRest =
  !!rest &&
  !!terrain &&
  rest.finalY < rest.spawnY &&
  Math.abs(rest.velocityY) < 1 &&
  rest.driftAfterSettle < 1 &&
  rest.finalY > terrain.minimumHeight - 1 &&
  rest.finalY < terrain.maximumHeight + 3;

out.ballCameToRest = ballCameToRest;
out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  out.welcomePresent &&
  out.editorHiddenInitially &&
  out.entityCount > 15 &&
  out.autoOrbiting &&
  out.impulseMoved > 0.15 &&
  out.ballDropped &&
  out.spawnedOne &&
  ballCameToRest &&
  !!terrain &&
  terrain.hasCollider &&
  terrain.colliderVertices > 1000 &&
  !!out.water &&
  out.editorVisibleAfterEnter &&
  out.welcomeGone;

process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);

import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

const EXE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];

const browser = await launchSmokeBrowser();
const page = await browser.newPage();
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const out = {};
try {
  // Default route = the clean host booting the welcome showroom.
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });
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
      { timeout: SMOKE_TIMEOUT },
    )
    .catch(() => {});
  const blockAfter = await entityPos("showroom-block-5");
  out.impulseMoved = blockBefore && blockAfter
    ? Number(Math.hypot(blockAfter[0] - blockBefore[0], blockAfter[1] - blockBefore[1], blockAfter[2] - blockBefore[2]).toFixed(3))
    : 0;

  // Where to click for bare ground. This used to be the hardcoded pixel (300, 630), which
  // silently stopped being ground the moment the showroom was recomposed — a foreground tree
  // moved under it, and the click focused the camera instead of dropping a ball. Project a
  // known-clear *world* point on the terrain's level stage instead, so the test follows the
  // scene rather than a screenshot of it.
  const groundAt = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__;
    // Well inside the terrain's 12-unit level stage, clear of the plinth and the braziers,
    // so the dropped ball lands on flat ground rather than near the rim of the blend.
    const v = new host.camera.position.constructor(0, 0, 6.5);
    v.project(host.camera);
    const rect = host.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((-v.y + 1) / 2) * rect.height };
  });
  out.groundAt = { x: Math.round(groundAt.x), y: Math.round(groundAt.y) };
  const countBefore = await page.evaluate(() => window.__GRAPHYSX__.state().entities.length);
  await page.mouse.click(groundAt.x, groundAt.y);
  await page
    .waitForFunction(
      () => window.__GRAPHYSX__.state().entities.some((e) => e.id.startsWith("showroom-drop-")),
      null,
      { timeout: SMOKE_TIMEOUT },
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
    for (let i = 0; i < 40; i += 1) api.step(0.5);
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

  // Flocking is the graduated Nature-of-Code system (PRODUCT_SPEC §3 pillar 3). Assert it is
  // a real *simulation*, not a prop: the entity exists, it has members, and those members
  // MOVE. Movement is measured through `api.step()` rather than by waiting on frames —
  // headless software GL runs the loop at a few fps, so wall-clock waiting would measure the
  // frame rate instead of the simulation.
  out.flocks = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const before = api.state().entities.filter((e) => e.type === "flock");
    const leads = new Map(before.map((e) => [e.id, e.flock.leadPosition]));
    for (let i = 0; i < 20; i += 1) api.step(0.05);
    return api.state().entities
      .filter((e) => e.type === "flock")
      .map((e) => {
        const was = leads.get(e.id);
        const now = e.flock.leadPosition;
        return {
          id: e.id,
          bounds: e.flock.bounds,
          preset: e.flock.preset,
          memberCount: e.flock.memberCount,
          averageSpeed: e.flock.averageSpeed,
          leadMoved: Number(Math.hypot(now[0] - was[0], now[1] - was[1], now[2] - was[2]).toFixed(4)),
        };
      });
  });

  // PRODUCT_SPEC §5: "Clicking focuses the camera (the recovered CubX behavior)." Clicking a
  // piece of non-interactive scenery must ease the orbit pivot onto it. A CubX corner cube is
  // the subject because it is unambiguously scenery — no interaction, not terrain — and
  // reliably on screen. The id moved when the placeholder cubes became the recovered
  // `cubx-assembly` prefab; `:cube-8` is the +++ corner the old `-cube-7` was.
  const targetBefore = await page.evaluate(() => window.__GRAPHYSX_HOST__.orbitTarget.toArray());
  const cubeAt = await screenOf("showroom-cubx-frame:cube-8");
  if (cubeAt) await page.mouse.click(cubeAt.x, cubeAt.y);
  await page
    .waitForFunction(
      (before) => {
        const host = window.__GRAPHYSX_HOST__;
        const t = host.orbitTarget.toArray();
        return !host.focusing && Math.hypot(t[0] - before[0], t[1] - before[1], t[2] - before[2]) > 0.75;
      },
      targetBefore,
      { timeout: SMOKE_TIMEOUT },
    )
    .catch(() => {});
  const targetAfter = await page.evaluate(() => window.__GRAPHYSX_HOST__.orbitTarget.toArray());
  out.focus = {
    before: targetBefore.map((n) => Number(n.toFixed(3))),
    after: targetAfter.map((n) => Number(n.toFixed(3))),
    targetMoved: Number(
      Math.hypot(
        targetAfter[0] - targetBefore[0],
        targetAfter[1] - targetBefore[1],
        targetAfter[2] - targetBefore[2],
      ).toFixed(3),
    ),
    // The idle orbit must resume around the NEW subject once the move lands, or focusing
    // would quietly kill the screensaver.
    orbitRearmed: await page.evaluate(() => window.__GRAPHYSX_HOST__.autoRotating),
  };

  // A flock has to survive being written out and read back, or it is a runtime toy rather
  // than scene vocabulary. Round-trip the *document* (the persistable form, ephemeral spawns
  // dropped) and assert the flock comes back with its population intact and still flying.
  out.flockRoundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const document = api.exportDocument();
    const exported = document.entities.filter((e) => e.type === "flock");
    const loaded = api.load(document);
    if (!loaded.ok) return { ok: false, error: loaded.error };
    const after = api.state().entities.filter((e) => e.type === "flock");
    const leads = new Map(after.map((e) => [e.id, e.flock.leadPosition]));
    for (let i = 0; i < 20; i += 1) api.step(0.05);
    const moved = api.state().entities
      .filter((e) => e.type === "flock")
      .map((e) => {
        const was = leads.get(e.id);
        const now = e.flock.leadPosition;
        return Math.hypot(now[0] - was[0], now[1] - was[1], now[2] - was[2]);
      });
    return {
      ok: true,
      exportedCount: exported.length,
      // The `flock` field must be in the serialised document, not just in live state.
      exportedCarriesConfig: exported.every((e) => !!e.flock && typeof e.flock.count === "number"),
      reloadedCount: after.length,
      reloadedMembers: after.map((e) => e.flock.memberCount),
      stillMoving: moved.every((d) => d > 0.05),
    };
  });

  await page.click(".gx-welcome button");
  // The editor module is loaded on demand, so wait for it to mount rather than guessing.
  await page.waitForSelector(".gx-ed-toolbar", { timeout: SMOKE_TIMEOUT });
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

// Flocking must be present, populated, MOVING, and persistable. Any one of those failing
// turns the graduated system back into decoration, which is the exact claim PRODUCT_SPEC
// §8.1 records as unearned.
const flocks = out.flocks ?? [];
const roundTrip = out.flockRoundTrip;
const flockingIsLive =
  flocks.length >= 2 &&
  flocks.every((f) => f.memberCount > 20 && f.leadMoved > 0.05 && f.averageSpeed > 0.05) &&
  // Both bounds modes are exercised: the recovered sphere constraint and the box volume.
  new Set(flocks.map((f) => f.bounds)).size === 2 &&
  !!roundTrip &&
  roundTrip.ok === true &&
  roundTrip.exportedCount === flocks.length &&
  roundTrip.exportedCarriesConfig === true &&
  roundTrip.reloadedCount === flocks.length &&
  roundTrip.reloadedMembers.every((n) => n > 20) &&
  roundTrip.stillMoving === true;
out.flockingIsLive = flockingIsLive;

// Click-to-focus: the orbit pivot measurably moved onto the clicked subject, and the idle
// orbit came back afterwards so the showroom keeps showing itself off.
const focusWorks = !!out.focus && out.focus.targetMoved > 0.75 && out.focus.orbitRearmed === true;
out.focusWorks = focusWorks;

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
  flockingIsLive &&
  focusWorks &&
  out.editorVisibleAfterEnter &&
  out.welcomeGone;

process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);



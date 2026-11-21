import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { namedSave, sceneDocument, canonicalScene } from "./studio-smoke-helpers.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4209/";
const artifacts = process.env.SMOKE_ARTIFACTS || path.resolve("output/playwright/cubx-atmel");
await mkdir(artifacts, { recursive: true });
const sourceBytes = await readFile(new URL("../public/assets/ports/archive-cubx-atmel.json", import.meta.url), "utf8");
const source = JSON.parse(sourceBytes), browser = await launchSmokeBrowser(), receipts = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
const draw = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const clickPaused = (page, selector) => page.locator(selector).evaluate(button => { button.click(); window.__GRAPHYSX__.pause(true); });
const step = async (page, seconds) => { await page.evaluate(seconds => window.__GRAPHYSX__.step(seconds), seconds); await draw(page); };
const capture = (page, name) => page.screenshot({ path: path.join(artifacts, name + ".png") });
function errorsFor(page) {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  return errors;
}
async function open(page, query = "?app=cubx&view=atmel") {
  await page.goto(new URL(query, base).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text?.() || "{}").application?.ready);
  assert.equal((await state(page)).application, "cubx-atmel");
}
const rigSnapshot = page => page.evaluate(() => {
  const world = window.__GRAPHYSX_HOST__.world, visible = object => { for (; object; object = object.parent) if (!object.visible) return false; return true; };
  return window.__GRAPHYSX__.query({ tag: "atmel-source-mesh" }).filter(e => visible(world.getEntityObject(e.id))).map(e => e.id);
});
const openMatrices = page => page.evaluate(() => window.__GRAPHYSX__.query({ tag: "atmel-actor-open" }).map(entity => {
  const object = window.__GRAPHYSX_HOST__.world.getEntityObject(entity.id); object.updateWorldMatrix(true, false);
  return [entity.id, object.matrixWorld.toArray()];
}));
async function assertStudioFramed(page) {
  await page.waitForFunction(() => window.__GRAPHYSX__.state()?.entities.filter(e => e.type === "model").every(e => e.asset?.status === "ready"));
  await draw(page);
  const bounds = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__, points = [], root = host.world.getEntityObject("atmel-controls");
    root.updateWorldMatrix(true, true);
    root.traverseVisible(object => {
      if (!object.isMesh) return; object.geometry.computeBoundingBox(); const box = object.geometry.boundingBox;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) { const p = object.localToWorld(object.position.clone().set(x, y, z)).project(host.camera); points.push([(p.x + 1) * innerWidth / 2, (1 - p.y) * innerHeight / 2]); }
    });
    const get = selector => document.querySelector(selector).getBoundingClientRect();
    return { minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])), minY: Math.min(...points.map(p => p[1])), maxY: Math.max(...points.map(p => p[1])), left: get(".gx-studio-objects").right, right: get(".gx-studio-inspector").left, top: Math.max(get(".gx-studio-header").bottom, get(".gx-studio-tools").bottom), height: innerHeight };
  });
  assert.ok([bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].every(Number.isFinite), "the native Studio composition is actually rendered");
  assert.ok(bounds.minX > bounds.left + 8 && bounds.maxX < bounds.right - 8 && bounds.minY > bounds.top + 8 && bounds.maxY < bounds.height - 8, "Studio fits the loaded native composition within its own clear viewport: " + JSON.stringify(bounds));
  return bounds;
}
async function frameBounds(page, ids) {
  return page.evaluate(ids => {
    const host = window.__GRAPHYSX_HOST__, rect = host.renderer.domElement.getBoundingClientRect(), points = [];
    const visible = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    for (const id of ids) host.world.getEntityObject(id)?.traverse(o => {
      if (!o.isMesh || !visible(o)) return;
      o.geometry.computeBoundingBox(); const box = o.geometry.boundingBox;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = o.localToWorld(o.position.clone().set(x, y, z)).project(host.camera);
        points.push([(p.x + 1) * rect.width / 2, (1 - p.y) * rect.height / 2]);
      }
    });
    const card = document.querySelector(".gx-cubz-card").getBoundingClientRect(), header = document.querySelector(".gx-cubz-header").getBoundingClientRect();
    return { minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])), minY: Math.min(...points.map(p => p[1])), maxY: Math.max(...points.map(p => p[1])), card: { left: card.left, top: card.top }, headerBottom: header.bottom, width: innerWidth, height: innerHeight };
  }, ids);
}
function assertUnobscured(bounds, label) {
  assert.ok([bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].every(Number.isFinite), `${label}: native geometry is actually rendered`);
  assert.ok(bounds.minX >= 5 && bounds.maxX <= bounds.width - 5, `${label}: subject stays within canvas width`);
  assert.ok(bounds.minY >= bounds.headerBottom + 8, `${label}: subject clears the header`);
  if (bounds.card.left < bounds.width * .15) assert.ok(bounds.maxY <= bounds.card.top - 8, `${label}: subject clears the bottom card`);
  else assert.ok(bounds.maxX <= bounds.card.left - 8 && bounds.maxY <= bounds.height - 70, `${label}: subject clears the side card and caption`);
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  const page = applySmokeTimeout(await context.newPage()), errors = errorsFor(page);
  // Reach the restored family from the existing archive destination, without duplicating its gallery card.
  await page.goto(new URL("?intro=0", base).href, { waitUntil: "domcontentloaded" });
  await page.locator(".gx-go-archive").click(); await page.locator(".gx-shelf-search").fill("Atmel");
  await page.locator('[data-scene-id="archive-cubz-menu"]').click();
  await page.locator(".gx-cubz-atmel-link").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text?.() || "{}").application?.ready);
  assert.equal((await state(page)).application, "cubx-atmel"); assert.equal((await state(page)).phase, "idle");
  assert.equal(await page.locator("[data-atmel-choice]").count(), 8);
  const doc = await sceneDocument(page);
  assert.equal(doc.entities.filter(e => e.tags?.includes("atmel-source-mesh")).length, 184);
  assert.equal(doc.entities.filter(e => e.tags?.includes("atmel-native-digit")).length, 20);
  assert.equal(doc.entities.filter(e => e.tags?.includes("atmel-source-click")).length, 8);
  assert.equal((await rigSnapshot(page)).length, 0, "the idle rig is the original static TVM");
  for (let choice = 1; choice <= 8; choice++) {
    await clickPaused(page, `[data-atmel-choice="${choice}"]`);
    assert.equal((await state(page)).choice, choice);
    assert.equal((await state(page)).phase, choice === 1 ? "opening" : "rotating");
    assert.equal((await rigSnapshot(page)).length, 23, "exactly one complete actor replaces the closed TVM");
    await step(page, 1.2); assert.equal((await rigSnapshot(page)).length, 23);
    await page.locator("[data-atmel-skip]").click(); await draw(page);
    assert.equal((await state(page)).phase, "opened"); assert.equal((await rigSnapshot(page)).length, 23);
    assert.equal(await page.locator("[data-atmel-inside]").isVisible(), true);
    if ([1, 8].includes(choice)) await capture(page, `native-cube-${choice}-opened`);
    const beforeClose = await openMatrices(page);
    await clickPaused(page, "[data-atmel-close]"); assert.equal((await state(page)).phase, "closing");
    const afterClose = new Map(await openMatrices(page));
    assert.ok(beforeClose.every(([id, matrix]) => matrix.every((value, i) => Math.abs(value - afterClose.get(id)[i]) < 1e-5)), "pausing at the reverse clip's first key cannot snap the petals closed");
    await step(page, 20); assert.equal((await state(page)).phase, "idle"); assert.equal((await rigSnapshot(page)).length, 0);
  }
  await clickPaused(page, "[data-atmel-saver]"); await step(page, 1.7);
  const waitingRotation = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["atmel-machine"] })[0].rotationDegrees);
  await clickPaused(page, '[data-atmel-choice="8"]'); assert.equal((await state(page)).phase, "aligning");
  const alignedRotation = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["atmel-machine"] })[0].rotationDegrees);
  assert.ok(Math.hypot(...alignedRotation.map((v, i) => v - waitingRotation[i])) < 1e-5, "waiting must not snap when a cube is selected");
  await step(page, 20); assert.equal((await state(page)).phase, "opened");
  await page.locator("[data-atmel-reset]").click();
  // Real pointer hit on the native hidden front selection volume.
  const click = await page.evaluate(() => { const host = window.__GRAPHYSX_HOST__, object = host.world.getEntityObject("atmel-click-1"), p = object.localToWorld(object.position.clone().set(25, 25, 25)).project(host.camera); return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 }; });
  await page.mouse.click(click.x, click.y); await page.evaluate(() => window.__GRAPHYSX__.pause(true));
  assert.equal((await state(page)).choice, 1, "the original outer click mesh is usable through the shared canvas");
  await page.locator("[data-atmel-reset]").click();
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 320, height: 740 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await page.locator('[data-atmel-view="menu"]').click(); await page.locator("[data-atmel-frame]").click(); await draw(page);
    const name = viewport.width + "x" + viewport.height, bounds = await frameBounds(page, ["atmel-machine"]);
    assertUnobscured(bounds, name); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await capture(page, `native-menu-${name}`);
    await clickPaused(page, '[data-atmel-choice="8"]'); await page.locator("[data-atmel-skip]").click(); await draw(page);
    assert.equal((await state(page)).phase, "opened"); assertUnobscured(await frameBounds(page, ["atmel-machine"]), "opened " + name);
    await capture(page, `native-opened-${name}`);
    await clickPaused(page, "[data-atmel-close]"); await page.locator("[data-atmel-skip]").click(); await draw(page);
    assert.equal((await state(page)).phase, "idle");
    await page.locator('[data-atmel-view="panel"]').click(); await draw(page);
    const panelBounds = await frameBounds(page, ["atmel-controls"]); assertUnobscured(panelBounds, "panel " + name);
    assert.equal(await page.locator("[data-atmel-clock-panel]").isVisible(), true);
    await capture(page, `native-panel-${name}`); receipts.push({ viewport, bounds, panelBounds });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator('[data-atmel-view="overview"]').click(); await capture(page, "native-constellation");
  await page.locator('[data-atmel-view="panel"]').click();
  const time = page.locator('[data-atmel-time="light-on"]'); await time.fill("06:45"); await time.press("Tab"); await draw(page);
  assert.equal((await state(page)).clocks["light-on"], "06:45");
  assert.equal(await page.evaluate(() => window.__GRAPHYSX__.undo().ok), true); await draw(page); assert.equal((await state(page)).clocks["light-on"], "11:11");
  assert.equal(await page.evaluate(() => window.__GRAPHYSX__.redo().ok), true); await draw(page); assert.equal((await state(page)).clocks["light-on"], "06:45");
  await page.locator('[data-atmel-indicator="light"]').click();
  const indicators = await page.evaluate(() => window.__GRAPHYSX__.query({ tag: "atmel-local-indicator" }));
  assert.ok(indicators.find(e => e.id === "atmel-light-indicator").materialSlots.every(slot => slot.color === "#63d3a2" && slot.hasSourceMap && slot.sourceMapName.endsWith("/gold_01.jpg")));
  assert.ok(indicators.find(e => e.id === "atmel-fan-indicator").materialSlots.every(slot => slot.color === "#ffdf55"));
  assert.equal(await page.locator('[data-atmel-indicator="light"]').getAttribute("aria-pressed"), "true");
  await capture(page, "native-local-controls");
  await page.locator("[data-atmel-studio]").last().click(); await page.locator(".gx-studio-simple:not([hidden])").waitFor();
  await assertStudioFramed(page);
  const pose = await sceneDocument(page); assert.equal(pose.entities.length, doc.entities.length);
  assert.equal(pose.entities.some(e => e.behaviors?.some(b => b.id?.startsWith("atmel-program-"))), false);
  assert.equal(pose.entities.find(e => e.id === "atmel-time-light-on-0").tags.includes("atmel-digit-0"), true);
  await namedSave(page, "Atmel recovered variant"); const saved = await sceneDocument(page);
  await page.reload(); await page.waitForFunction(() => JSON.parse(window.render_game_to_text?.() || "{}").studio?.savedName === "Atmel recovered variant");
  await assertStudioFramed(page);
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(saved));
  await capture(page, "native-studio-saved-reloaded"); assert.deepEqual(errors, []);
  // Native bounds can arrive after the editor. A later document or camera gesture owns
  // the viewport and must cancel that pending fit before the old model response resolves.
  for (const intervention of ["world", "pointer"]) {
    const delayed = applySmokeTimeout(await context.newPage()), delayedErrors = errorsFor(delayed);
    let releaseModel; const requested = delayed.waitForRequest(request => request.url().endsWith("/archive-cubx-atmel-domotics.json"));
    await delayed.route("**/archive-cubx-atmel-domotics.json", route => new Promise(resolve => {
      releaseModel = async () => { await route.continue(); resolve(); };
    }));
    await delayed.goto(page.url(), { waitUntil: "domcontentloaded" }); await requested;
    await delayed.locator(".gx-studio-simple:not([hidden])").waitFor(); await draw(delayed);
    if (intervention === "world") {
      const created = await delayed.evaluate(() => window.__GRAPHYSX__.create({ schema: "graphysx.agent-world/v2", id: "later-framing-owner", label: "Later framing owner", entities: [{ id: "kept-frame-owner", type: "box" }] }));
      assert.equal(created.ok, true, created.error);
    }
    else { await delayed.mouse.move(700, 450); await delayed.mouse.down(); await delayed.mouse.up(); }
    await delayed.evaluate(() => window.__GRAPHYSX_HOST__.frameView([17, 18, 19], [1, 2, 3], 0));
    const heldDocument = await sceneDocument(delayed); await releaseModel(); await delayed.unroute("**/archive-cubx-atmel-domotics.json");
    await delayed.waitForFunction(() => window.__GRAPHYSX__.state()?.entities.filter(e => e.type === "model").every(e => e.asset?.status !== "loading")); await draw(delayed);
    assert.deepEqual(canonicalScene(await sceneDocument(delayed)), canonicalScene(heldDocument));
    assert.ok((await delayed.evaluate(() => window.__GRAPHYSX_HOST__.camera.position.toArray())).every((value, i) => Math.abs(value - [17, 18, 19][i]) < 1e-6), `late native bounds cannot override ${intervention} ownership`);
    assert.deepEqual(delayedErrors, []); await delayed.close();
  }
  // A world arriving during source fetch owns the host, even if it deliberately reuses the same ID.
  const race = applySmokeTimeout(await context.newPage()), raceErrors = errorsFor(race);
  let release, requested; const waiting = new Promise(resolve => { requested = resolve; });
  await race.route("**/assets/ports/archive-cubx-atmel.json", async route => { requested(); await new Promise(resolve => { release = resolve; }); await route.fulfill({ contentType: "application/json", body: sourceBytes }); });
  await race.goto(new URL("?app=cubx&view=atmel", base).href, { waitUntil: "domcontentloaded" }); await waiting;
  const foreign = { schema: "graphysx.agent-world/v2", id: "archive-cubx-atmel", label: "Owner world during loading", entities: [{ id: "owner-kept", type: "box", material: { color: "#ea923f" } }] };
  assert.equal(await race.evaluate(doc => window.__GRAPHYSX__.create(doc).ok, foreign), true); const held = await sceneDocument(race); release();
  await race.locator(".gx-atmel").waitFor({ state: "detached" }); assert.deepEqual(canonicalScene(await sceneDocument(race)), canonicalScene(held)); assert.deepEqual(raceErrors, []); await race.close();
  // Once loaded, all reset/navigation controls fence a replacement rather than overwrite it.
  await open(page);
  await page.evaluate(() => window.__GRAPHYSX_HOST__.framePath([{ position: [-6, 20, 9], target: [-12, 15, 0] }], 60));
  const replacement = await page.evaluate(doc => ({ ok: window.__GRAPHYSX__.create(doc).ok, focusing: window.__GRAPHYSX_HOST__.focusing }), { ...foreign, id: "owner-foreign-world" });
  assert.equal(replacement.ok, true); assert.equal(replacement.focusing, false, "replacement immediately cancels the old view's camera move"); await draw(page);
  const kept = await sceneDocument(page); assert.equal((await state(page)).phase, "unavailable");
  assert.equal(await page.locator("[data-atmel-reset]").isDisabled(), true);
  assert.equal(await page.locator("[data-atmel-frame]").isDisabled(), true);
  await page.evaluate(() => window.__GRAPHYSX_HOST__.frameView([17, 18, 19], [0, 0, 0], 0));
  await page.setViewportSize({ width: 1030, height: 770 }); await draw(page);
  assert.ok((await page.evaluate(() => window.__GRAPHYSX_HOST__.camera.position.toArray())).every((value, i) => Math.abs(value - [17, 18, 19][i]) < 1e-6), "old resize/media listeners cannot reframe the foreign world");
  await page.evaluate(() => window.__GRAPHYSX_HOST__.framePath([{ position: [21, 22, 23], target: [0, 0, 0] }], .2));
  await page.setViewportSize({ width: 1440, height: 960 }); await page.waitForFunction(() => !window.__GRAPHYSX_HOST__.focusing); await draw(page);
  assert.ok((await page.evaluate(() => window.__GRAPHYSX_HOST__.camera.position.toArray())).every((value, i) => Math.abs(value - [21, 22, 23][i]) < 1e-6), "new owner's camera path survives a later resize");
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(kept));
  await page.locator("[data-atmel-studio]").last().click(); await page.locator(".gx-studio-simple:not([hidden])").waitFor();
  assert.deepEqual(canonicalScene(await sceneDocument(page)), canonicalScene(kept)); assert.deepEqual(errors, []);
  await writeFile(path.join(artifacts, "cubx-atmel-result.json"), JSON.stringify({ nativeActors: Object.keys(source.actors), sourceChoices: 8, cycles: 8, savedEntities: saved.entities.length, sourcePins: source.sourcePins.length, receipts, errors }, null, 2));
  console.log("CubX Atmel: eight native cycles, original picking, waiting alignment, four protected layouts, editable glyphs/undo, Studio save/reload and foreign-world document/camera fences passed.");
  await context.close();
} finally { await browser.close(); }

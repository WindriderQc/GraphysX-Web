import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4209/";
const artifacts = process.env.SMOKE_ARTIFACTS || path.resolve("output/playwright/cubz-menu");
await mkdir(artifacts, { recursive: true });
const browser = await launchSmokeBrowser();
const receipts = [];
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
const draw = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const clickPaused = (page, selector) => page.locator(selector).evaluate(button => { button.click(); window.__GRAPHYSX__.pause(true); });
const advance = async (page, seconds) => { await page.evaluate(seconds => window.__GRAPHYSX__.step(seconds), seconds); await draw(page); };
const snapshot = page => page.evaluate(() => {
  const api = window.__GRAPHYSX__, world = window.__GRAPHYSX_HOST__.world;
  const visible = object => { for (; object; object = object.parent) if (!object.visible) return false; return true; };
  return { revision: api.state().revision, elapsed: api.state().elapsedSeconds,
    meshes: api.query({ tag: "cubz-source-mesh" }).filter(entity => visible(world.getEntityObject(entity.id))).map(entity => entity.id),
    selected: api.state().selectedIds };
});
const errorsFor = page => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.push(`${request.failure()?.errorText} ${request.url()}`); });
  return errors;
};
const capture = (page, name) => page.screenshot({ path: path.join(artifacts, `${name}.png`) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  const page = applySmokeTimeout(await context.newPage()), errors = errorsFor(page);
  await page.goto(new URL("?intro=0", base).href, { waitUntil: "domcontentloaded" });
  await page.click(".gx-go-archive");
  assert.equal(await page.locator('[data-scene-id="archive-cubz-menu"]').isVisible(), true);
  assert.equal(await page.locator('[data-scene-id="archive-cubz-tracks"]').isVisible(), false, "old replacement-geometry study is outside Archives");
  await page.click('[data-collection="lab"]');
  assert.equal(await page.locator('[data-scene-id="archive-cubz-tracks"]').isVisible(), true);
  await page.click('[data-collection="archive"]');
  await page.click('[data-scene-id="archive-cubz-menu"]');
  await page.locator('[data-cubz-choice="0"]').waitFor();
  assert.equal((await read(page)).phase, "idle");
  assert.equal((await snapshot(page)).meshes.length, 44);
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).discovery.cameraMoving), false, "reduced motion skips arrival");
  await capture(page, "cubz-desktop-closed");
  for (let choice = 0; choice < 8; choice++) {
    await clickPaused(page, `[data-cubz-choice="${choice}"]`);
    const initial = await read(page), authored = await snapshot(page);
    assert.equal(initial.phase, choice === 0 ? "opening" : "rotating");
    await advance(page, 3);
    const opened = await read(page), openSnapshot = await snapshot(page);
    assert.equal(opened.phase, "opened"); assert.equal(opened.choice, choice);
    assert.equal(openSnapshot.meshes.length, 44); assert.ok(openSnapshot.meshes.every(id => id.startsWith("cubz-open-")));
    assert.equal(openSnapshot.revision, authored.revision, "simulation never rewrites authored source data");
    if (choice === 7) await capture(page, "cubz-desktop-open");
    await clickPaused(page, "[data-cubz-close]");
    assert.equal((await read(page)).phase, "closing");
    await advance(page, 3);
    assert.equal((await read(page)).phase, "idle");
    assert.ok((await snapshot(page)).meshes.every(id => id.startsWith("cubz-rotation-")));
  }
  console.log("PASS CubZ: all eight coupled source-actor cycles, direct first choice and same-range reverse.");
  await clickPaused(page, '[data-cubz-choice="1"]');
  const pauseControl = await page.locator("[data-cubz-pause]").evaluate(button => {
    button.click(); const resumed = !window.__GRAPHYSX__.state().paused;
    button.click(); return { resumed, paused: window.__GRAPHYSX__.state().paused };
  });
  assert.deepEqual(pauseControl, { resumed: true, paused: true });
  const frozenTime = (await snapshot(page)).elapsed;
  await page.evaluate(() => window.advanceTime(1000));
  assert.equal((await snapshot(page)).elapsed, frozenTime, "deterministic player hook respects pause");
  await page.click("[data-cubz-skip]");
  assert.equal((await read(page)).phase, "opened");
  await clickPaused(page, "[data-cubz-close]"); await page.click("[data-cubz-skip]");
  assert.equal((await read(page)).phase, "idle");

  // A hidden foreground mesh must not steal the actual canvas click. No private
  // player state is modified: the fixture enters through ordinary authored API data.
  const point = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__, api = window.__GRAPHYSX__;
    const object = host.world.getEntityObject("cubz-rotation-m2");
    object.geometry.computeBoundingBox();
    const center = object.localToWorld(object.geometry.boundingBox.getCenter(object.position.clone()));
    const foreground = center.clone().lerp(host.camera.position, .45);
    api.spawn({ id: "test-hidden-foreground", type: "group", visible: false, transform: { position: foreground.toArray() } });
    api.spawn({ id: "test-hidden-child", type: "box", parentId: "test-hidden-foreground", geometry: { width: 2, height: 2, depth: 2 }, tags: ["cubz-choice-7"] });
    center.project(host.camera); const rect = host.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (center.x + 1) * rect.width / 2, y: rect.top + (1 - center.y) * rect.height / 2 };
  });
  await draw(page);
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 30, point.y + 12); await page.mouse.up();
  assert.equal((await read(page)).phase, "idle", "dragging the camera does not choose a block");
  await page.click("[data-cubz-frame]"); await draw(page);
  // Reproject after the drag/reframe rather than reusing the old camera coordinates.
  const click = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__, object = host.world.getEntityObject("cubz-rotation-m2");
    const center = object.localToWorld(object.geometry.boundingBox.getCenter(object.position.clone())).project(host.camera), rect = host.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (center.x + 1) * rect.width / 2, y: rect.top + (1 - center.y) * rect.height / 2 };
  });
  await page.mouse.click(click.x, click.y);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application?.phase === "opened");
  assert.equal((await read(page)).choice, 0, "visible source corner wins over hidden foreground choice seven");
  const actionPoint = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__, object = host.world.getEntityObject("cubz-action-0-colors");
    const center = object.getWorldPosition(object.position.clone()).project(host.camera), rect = host.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (center.x + 1) * rect.width / 2, y: rect.top + (1 - center.y) * rect.height / 2 };
  });
  await page.mouse.click(actionPoint.x, actionPoint.y);
  assert.equal((await read(page)).diagnostic, true);
  await page.click('[data-cubz-action="inspect"]');
  assert.deepEqual((await snapshot(page)).selected, ["cubz-open-rig"], "one selected actor includes all 44 source meshes");
  await capture(page, "cubz-diagnostic");
  await page.click("[data-cubz-reset]");
  await clickPaused(page, "[data-cubz-saver]");
  await advance(page, 12.5);
  assert.equal((await read(page)).phase, "screensaver");
  assert.ok((await snapshot(page)).meshes.every(id => id.startsWith("cubz-screensaver-")));
  await capture(page, "cubz-source-screensaver");
  await page.click("[data-cubz-reset]");

  // Save a deliberately unfinished pose in Studio, then prove the exact same world
  // transforms survive editable copy, normal UI save, JSON export and local reload.
  await page.locator('[data-cubz-choice="7"]').focus(); await page.keyboard.press("Enter");
  await page.evaluate(() => { window.__GRAPHYSX__.pause(true); window.__GRAPHYSX__.step(1.6); }); await draw(page);
  assert.equal((await read(page)).phase, "opening", "Studio receives an unfinished source pose");
  const sourcePose = await page.evaluate(() => {
    const world = window.__GRAPHYSX_HOST__.world;
    return window.__GRAPHYSX__.query({ tag: "cubz-source-mesh" }).map(entity => { const object = world.getEntityObject(entity.id); object.updateWorldMatrix(true, false); return [entity.id, object.matrixWorld.toArray()]; });
  });
  await page.click("[data-cubz-studio]");
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.mode === "editor");
  await page.waitForSelector(".gx-ed-toolbar"); await draw(page);
  assert.equal(await page.locator(".gx-cubz").count(), 0);
  const pose = await page.evaluate(() => window.__GRAPHYSX__.exportDocument());
  assert.equal(pose.id, "archive-cubz-menu-pose");
  assert.equal(pose.entities.some(entity => entity.id === "test-hidden-child"), true);
  assert.equal(pose.entities.some(entity => entity.behaviors?.some(behavior => behavior.id?.startsWith("cubz-"))), false);
  const differences = await page.evaluate(sourcePose => {
    const world = window.__GRAPHYSX_HOST__.world;
    return sourcePose.map(([id, values]) => { const object = world.getEntityObject(id); object.updateWorldMatrix(true, false); return Math.max(...values.map((value, i) => Math.abs(value - object.matrixWorld.elements[i]))); });
  }, sourcePose);
  assert.ok(Math.max(...differences) < 1e-5, "Studio copy freezes the actual local TRS pose without a jump");

  const markerPoint = await page.evaluate(() => {
    const api = window.__GRAPHYSX__, host = window.__GRAPHYSX_HOST__;
    const position = host.camera.position.clone().set(0, 3, 5);
    const foreground = position.clone().lerp(host.camera.position, .4);
    api.spawn({ id: "test-visible-marker", type: "box", transform: { position: position.toArray() }, material: { color: "#d4795d" } });
    api.spawn({ id: "test-editor-hidden-parent", type: "group", visible: false, transform: { position: foreground.toArray() } });
    api.spawn({ id: "test-editor-hidden-child", type: "box", parentId: "test-editor-hidden-parent", geometry: { width: 2, height: 2, depth: 2 } });
    position.project(host.camera); const rect = host.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (position.x + 1) * rect.width / 2, y: rect.top + (1 - position.y) * rect.height / 2 };
  });
  await draw(page); await page.mouse.click(markerPoint.x, markerPoint.y);
  assert.deepEqual((await snapshot(page)).selected, ["test-visible-marker"], "Studio picking ignores hidden ancestors too");
  await capture(page, "cubz-studio-pose");
  page.once("dialog", dialog => dialog.accept("CubZ smoke pose"));
  await page.locator(".gx-ed-toolbar").getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("graphysx.agent-world.v2.CubZ smoke pose")));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("graphysx.agent-world.v2.CubZ smoke pose")));
  assert.equal(saved.entities.filter(entity => entity.tags?.includes("cubz-source-mesh")).length, 132);
  const downloadEvent = page.waitForEvent("download"); await page.locator(".gx-ed-toolbar").getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadEvent; await download.saveAs(path.join(artifacts, "cubz-studio-pose.json"));
  await page.goto(new URL("?host=editor&paused=1&localScene=CubZ%20smoke%20pose", base).href);
  await page.waitForFunction(() => window.__GRAPHYSX__?.state()?.world.id === "archive-cubz-menu-pose");
  assert.equal(await page.evaluate(() => window.__GRAPHYSX__.query({ tag: "cubz-source-mesh" }).length), 132);
  assert.deepEqual(errors, [], "desktop: no browser, shader, HTTP or transport errors");
  receipts.push({ device: "desktop", choices: 8, studioMaxMatrixError: Math.max(...differences), errors });
  await context.close();
  console.log("PASS CubZ: canvas pick/drag, hidden actors, diagnostics, native waiting actor, keyboard, exact Studio pose, save/export/reload.");

  for (const [device, width, height] of [["phone", 390, 844], ["small-phone", 320, 740]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = applySmokeTimeout(await context.newPage()), errors = errorsFor(page);
    await page.goto(new URL("?app=cubx&intro=0", base).href, { waitUntil: "domcontentloaded" });
    await page.locator('[data-cubz-choice="0"]').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator(".gx-cubz-choices").evaluate(fieldset => {
      const card = fieldset.closest(".gx-cubz-card").getBoundingClientRect();
      return [...fieldset.querySelectorAll("button")].every(button => {
        const bounds = button.getBoundingClientRect();
        return bounds.width >= 44 && bounds.height >= 44 && bounds.left >= card.left && bounds.right <= card.right;
      });
    }), true, "all eight tiles fit inside the compact card without horizontal scrolling");
    const choice = page.locator('[data-cubz-choice="6"]'); await choice.scrollIntoViewIfNeeded();
    const bounds = await choice.boundingBox(); assert.ok(bounds.height >= 44 && bounds.width >= 44);
    await capture(page, `cubz-${device}-closed`);
    await choice.tap();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application?.phase === "opened");
    assert.equal((await read(page)).choice, 6);
    await page.locator('[data-cubz-action="colors"]').tap();
    assert.equal((await read(page)).diagnostic, true);
    await capture(page, `cubz-${device}-open`);
    await page.locator("[data-cubz-close]").tap();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application?.phase === "idle");
    assert.equal(await page.locator('[data-cubz-choice="0"]').isVisible(), true);
    await page.locator("[data-cubz-studio]").tap();
    await page.waitForFunction(() => window.__GRAPHYSX_HOST__.mode === "editor");
    assert.equal(await page.locator(".gx-cubz").count(), 0);
    assert.deepEqual(errors, [], device + ": no browser, shader, HTTP or transport errors");
    receipts.push({ device, touch: true, width, height, errors });
    await context.close(); console.log("PASS CubZ: " + device + " touch choice/open/diagnostic/return/Studio, usable 44px controls and reduced motion.");
  }
  await writeFile(path.join(artifacts, "cubz-menu-receipt.json"), JSON.stringify(receipts, null, 2));
} finally { await browser.close(); }

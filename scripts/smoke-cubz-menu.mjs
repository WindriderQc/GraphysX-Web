import { enterCompleteStudio } from "./studio-smoke-helpers.mjs";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startSceneStore } from "../server/scene-store.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4209/";
const artifacts = process.env.SMOKE_ARTIFACTS || path.resolve("output/playwright/cubz-menu");
await mkdir(artifacts, { recursive: true });
const browser = await launchSmokeBrowser();
const receipts = [];
const source = JSON.parse(await readFile(new URL("../public/assets/ports/archive-cubz-menu.json", import.meta.url), "utf8"));
const mechanicalNodes = Object.fromEntries(["rotation", "open", "screensaver"].map(id => [id, source.actors[id].nodes.filter(node => /^Box0[1-8]$|^Cylindre\d+$/.test(node.name)).map(node => ({ id: node.id, cylinder: node.name.startsWith("Cylindre") }))]));
const mechanicalPose = (page, actor) => page.evaluate(({ actor, nodes }) => {
  const world = window.__GRAPHYSX_HOST__.world;
  const points = nodes.flatMap(node => {
    const object = world.getEntityObject(`cubz-${actor}-n${node.id}`);
    return [0, node.cylinder ? 50 : 22.5].map(y => object.localToWorld(object.position.clone().set(0, y, 0)).toArray());
  });
  const pivotObject = actor === "rotation" ? world.getEntityObject("cubz-rotation-n1") : actor === "screensaver" ? world.getEntityObject("cubz-screensaver-pivot") : null;
  const pivot = pivotObject?.getWorldPosition(pivotObject.position.clone()).toArray() ?? null;
  return { points, pivot };
}, { actor, nodes: mechanicalNodes[actor] });
const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
const mechanicalErrors = { maximumRigidDistanceError: 0, maximumCentralPivotError: 0, maximumOpeningFixedPointError: 0 };
const assertRigid = (reference, current) => {
  for (let i = 0; i < reference.points.length; i++) for (let j = 0; j < i; j++) mechanicalErrors.maximumRigidDistanceError = Math.max(mechanicalErrors.maximumRigidDistanceError,
    Math.abs(distance(reference.points[i], reference.points[j]) - distance(current.points[i], current.points[j])));
  mechanicalErrors.maximumCentralPivotError = Math.max(mechanicalErrors.maximumCentralPivotError, distance(reference.pivot, current.pivot));
  assert.ok(mechanicalErrors.maximumRigidDistanceError < 1e-5, "real renderer keeps every cylinder endpoint attached to the rigid assembly");
  assert.ok(mechanicalErrors.maximumCentralPivotError < 1e-5, "real renderer rotates around the fixed central pivot");
};
const assertOpeningFixed = (reference, current) => {
  mechanicalErrors.maximumOpeningFixedPointError = Math.max(mechanicalErrors.maximumOpeningFixedPointError, ...reference.points.map((point, index) => distance(point, current.points[index])));
  assert.ok(mechanicalErrors.maximumOpeningFixedPointError < 1e-5, "only petals move during opening; cylinders and block cores stay fixed");
};
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
  await page.locator('[data-scene-id="archive-cubz-menu"]').waitFor();
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
  await page.locator("[data-cubz-studio]").hover();
  await page.locator("[data-cubz-studio]").evaluate(async button => {
    getComputedStyle(button).backgroundColor;
    await Promise.all(button.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  const studioContrast = await page.locator("[data-cubz-studio]").evaluate(button => {
    const style = getComputedStyle(button);
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255);
      const linear = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    };
    const foreground = luminance(style.color), background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
  });
  assert.ok(studioContrast >= 4.5, "hovered Studio action retains readable text contrast");
  await capture(page, "cubz-studio-hover"); await page.mouse.move(700, 80);
  await capture(page, "cubz-desktop-closed");
  const rigidReference = await mechanicalPose(page, "rotation"), openingReference = await mechanicalPose(page, "open");
  for (let choice = 0; choice < 8; choice++) {
    await clickPaused(page, `[data-cubz-choice="${choice}"]`);
    const initial = await read(page), authored = await snapshot(page);
    assert.equal(initial.phase, choice === 0 ? "opening" : "rotating");
    if (choice > 0) {
      await advance(page, 14 / 30); assertRigid(rigidReference, await mechanicalPose(page, "rotation"));
      if (choice === 1) await capture(page, "cubz-rigid-half-turn");
      await advance(page, 14 / 30); assertRigid(rigidReference, await mechanicalPose(page, "rotation"));
    }
    await advance(page, 25 / 30); assertOpeningFixed(openingReference, await mechanicalPose(page, "open"));
    if (choice === 0) await capture(page, "cubz-flower-half-open");
    await advance(page, 3);
    const opened = await read(page), openSnapshot = await snapshot(page);
    assert.equal(opened.phase, "opened"); assert.equal(opened.choice, choice);
    assert.equal(openSnapshot.meshes.length, 44); assert.ok(openSnapshot.meshes.every(id => id.startsWith("cubz-open-")));
    assert.equal(openSnapshot.revision, authored.revision, "simulation never rewrites authored source data");
    assertOpeningFixed(openingReference, await mechanicalPose(page, "open"));
    if (choice === 7) await capture(page, "cubz-desktop-open");
    await clickPaused(page, "[data-cubz-close]");
    assert.equal((await read(page)).phase, "closing");
    await advance(page, 3);
    assert.equal((await read(page)).phase, "idle");
    assert.ok((await snapshot(page)).meshes.every(id => id.startsWith("cubz-rotation-")));
  }
  console.log("PASS CubZ: all eight cycles, rigid cylinder endpoints, fixed central pivot, fixed block cores during petal opening and same-range reverse.");
  await page.setViewportSize({ width: 1280, height: 720 });
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
  assert.equal(await page.locator("[data-cubz-inside]").evaluate(section => {
    const card = section.closest(".gx-cubz-card").getBoundingClientRect();
    return [...section.querySelectorAll("button")].every(button => {
      const bounds = button.getBoundingClientRect();
      return bounds.top >= card.top && bounds.bottom <= card.bottom && bounds.left >= card.left && bounds.right <= card.right;
    });
  }), true, "all four opened actions are visible on a short desktop without manual scrolling");
  await capture(page, "cubz-short-desktop-menu");
  await clickPaused(page, "[data-cubz-close]"); await page.click("[data-cubz-skip]");
  assert.equal((await read(page)).phase, "idle");
  await page.setViewportSize({ width: 1440, height: 960 }); await draw(page);

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
  const waitingReference = await mechanicalPose(page, "screensaver");
  await clickPaused(page, "[data-cubz-saver]");
  for (const seconds of [3.25, 9, 13]) { await advance(page, seconds); assertRigid(waitingReference, await mechanicalPose(page, "screensaver")); }
  await advance(page, 12.5);
  assertRigid(waitingReference, await mechanicalPose(page, "screensaver"));
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
  await page.click("[data-cubz-studio]"); await enterCompleteStudio(page);
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
  await page.click(".gx-ed-exit");
  await page.waitForFunction(() => document.querySelector(".gx-welcome--center") || document.querySelector(".gx-cubz [data-cubz-choice]"));
  assert.equal(await page.locator(".gx-welcome--center").isVisible(), true, "Studio Home returns to the welcome, not the captured CubZ startup route");
  assert.equal(await page.locator(".gx-cubz").count(), 0);
  await page.goto(new URL("?host=editor&paused=1&localScene=CubZ%20smoke%20pose", base).href);
  await page.waitForFunction(() => window.__GRAPHYSX__?.state()?.world.id === "archive-cubz-menu-pose");
  assert.equal(await page.evaluate(() => window.__GRAPHYSX__.query({ tag: "cubz-source-mesh" }).length), 132);
  await page.goto(new URL("?app=cubx&intro=0", base).href);
  await page.locator('[data-cubz-choice="0"]').waitFor();
  await page.evaluate(() => {
    window.__GRAPHYSX__.create({ schema: "graphysx.agent-world/v2", id: "kept-user-scene", label: "Kept user scene", entities: [
      { id: "kept-user-box", type: "box", transform: { position: [4, 3, 0], rotationDegrees: [400, 10, 0] } },
    ] });
    window.__GRAPHYSX__.pause(true);
  });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application?.phase === "unavailable");
  const foreign = await page.evaluate(() => window.__GRAPHYSX__.exportDocument());
  await page.click("[data-cubz-studio]"); await enterCompleteStudio(page); await page.waitForSelector(".gx-ed-toolbar");
  assert.deepEqual(await page.evaluate(() => window.__GRAPHYSX__.exportDocument()), foreign, "replacing the scene keeps its identity and authored fields when entering Studio");
  assert.deepEqual(errors, [], "desktop: no browser, shader, HTTP or transport errors");
  receipts.push({ device: "desktop", choices: 8, mechanics: mechanicalErrors, studioMaxMatrixError: Math.max(...differences), studioHoverContrast: studioContrast, errors });
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
    const pinchPoint = await page.evaluate(() => {
      const host = window.__GRAPHYSX_HOST__, object = host.world.getEntityObject("cubz-rotation-m2");
      object.geometry.computeBoundingBox();
      const point = object.localToWorld(object.geometry.boundingBox.getCenter(object.position.clone())).project(host.camera);
      const rect = host.renderer.domElement.getBoundingClientRect();
      return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2, distance: host.camera.position.distanceTo(host.orbitTarget) };
    });
    const beforePinch = (await snapshot(page)).revision;
    const touch = await context.newCDPSession(page);
    const first = { id: 0, x: pinchPoint.x, y: pinchPoint.y };
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first, { id: 1, x: pinchPoint.x + 35, y: pinchPoint.y }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [first, { id: 1, x: pinchPoint.x + 60, y: pinchPoint.y }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach(); await draw(page);
    const pinchedDistance = await page.evaluate(() => window.__GRAPHYSX_HOST__.camera.position.distanceTo(window.__GRAPHYSX_HOST__.orbitTarget));
    assert.ok(Math.abs(pinchedDistance - pinchPoint.distance) > .05, "two-finger input actually zooms the shared camera");
    assert.equal((await read(page)).phase, "idle", "a two-finger camera gesture cannot select the stationary finger's block");
    assert.equal((await snapshot(page)).revision, beforePinch, "camera pinch authors no scene changes");
    await page.locator("[data-cubz-frame]").tap();
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
  if (["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname)) {
    const temporaryBase = path.resolve(tmpdir());
    const directory = await mkdtemp(path.join(temporaryBase, "graphysx-cubz-store-"));
    let store, context;
    try {
      store = await startSceneStore({ host: "127.0.0.1", port: 0, dir: directory, token: "" });
      context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
      const page = applySmokeTimeout(await context.newPage()), errors = errorsFor(page);
      const url = new URL("?app=cubx&intro=0", base); url.searchParams.set("store", store.url);
      await page.goto(url.href);
      await page.locator('[data-cubz-choice="0"]').waitFor();
      await page.waitForFunction(() => Boolean(window.__GRAPHYSX_SCENE_BROWSER__));
      assert.equal(await page.evaluate(() => window.__GRAPHYSX_SCENE_BROWSER__.element.hidden), true, "store chrome is ceded to the menu");
      await page.click("[data-cubz-studio]"); await enterCompleteStudio(page); await page.waitForSelector(".gx-ed-toolbar");
      assert.equal(await page.evaluate(() => window.__GRAPHYSX_SCENE_BROWSER__.element.hidden), false, "Studio restores an already-mounted store browser");
      assert.equal(new URL(page.url()).searchParams.get("store"), store.url, "explicit store address survives the Studio route");
      await capture(page, "cubz-studio-with-store");
      assert.deepEqual(errors, []); receipts.push({ device: "local-store-handoff", scope: "isolated loopback fixture, no homelab or production writes", errors });
      console.log("PASS CubZ: same-page Studio restores optional store chrome and keeps the explicit backend.");
    } finally {
      await context?.close(); await store?.close();
      const resolved = path.resolve(directory);
      assert.equal(path.dirname(resolved), temporaryBase); assert.ok(path.basename(resolved).startsWith("graphysx-cubz-store-"));
      await rm(resolved, { recursive: true, force: true });
    }
  }
  await writeFile(path.join(artifacts, "cubz-menu-receipt.json"), JSON.stringify(receipts, null, 2));
} finally { await browser.close(); }

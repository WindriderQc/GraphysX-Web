import { enterCompleteStudio } from "./studio-smoke-helpers.mjs";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchSmokeBrowser, applySmokeTimeout } from "./smoke-harness.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4210/";
const artifacts = path.resolve(process.env.SMOKE_ARTIFACTS || "output/playwright/flightx-modes");
await mkdir(artifacts, { recursive: true });
const browser = await launchSmokeBrowser(), receipts = [];
let activePage, activeErrors;
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
const waitPhase = (page, phase) => page.waitForFunction(phase => {
  const value = JSON.parse(window.render_game_to_text?.() ?? "{}").application;
  return value?.id === "flightx" && value.ready && value.phase === phase;
}, phase);
const position = page => page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["flight-plane"] })[0].position);
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const capture = (page, name) => page.screenshot({ path: path.join(artifacts, "flightx-modes-" + name + ".png") });
const errorsFor = page => {
  const errors = [];
  activePage = page; activeErrors = errors;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(response.status() + " " + response.url()); });
  page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.push(request.failure()?.errorText + " " + request.url()); });
  return errors;
};
const canonical = doc => ({ ...doc, entities: [...doc.entities].sort((a, b) => a.id.localeCompare(b.id)) });
const visiblePlane = async page => {
  const result = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__, model = host.world.getEntityObject("flight-plane-model");
    let mesh; model?.traverse(child => { if (child.isMesh && child.geometry?.attributes.position) mesh = child; });
    mesh.updateWorldMatrix(true, false); mesh.geometry.computeBoundingBox();
    const center = mesh.geometry.boundingBox.getCenter(mesh.position.clone()).applyMatrix4(mesh.matrixWorld).project(host.camera);
    const rect = host.renderer.domElement.getBoundingClientRect(), x = rect.left + (center.x + 1) * rect.width / 2, y = rect.top + (1 - center.y) * rect.height / 2;
    return { x, y, ndc: center.toArray(), width: innerWidth, height: innerHeight, hit: document.elementFromPoint(x, y)?.tagName, vertices: mesh.geometry.attributes.position.count };
  });
  assert.equal(result.vertices, 10261); assert.ok(result.ndc.every(value => value > -1 && value < 1));
  assert.equal(result.hit, "CANVAS", "The actual airplane must remain visible outside opaque menu/HUD controls");
  assert.ok(result.x > 8 && result.x < result.width - 8 && result.y > 64 && result.y < result.height - 20);
  return result;
};
const choose = async (page, mode) => {
  const current = await state(page);
  if (current.phase === "flight") await page.click("[data-flightx-menu]");
  else if (current.phase === "complete" || current.phase === "expired") await page.click("[data-flightx-other]");
  await page.click('[data-flightx-mode="' + mode + '"]');
  await page.click("[data-flightx-start]"); await waitPhase(page, "flight");
};
const flyLoop = async (page, ms) => {
  await page.locator("#app canvas").first().click({ position: { x: 600, y: 450 } });
  await page.keyboard.down("w"); await page.keyboard.down("ArrowUp"); await advance(page, ms);
  await page.keyboard.up("ArrowUp"); await page.keyboard.up("w");
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "no-preference", acceptDownloads: true });
  const page = applySmokeTimeout(await context.newPage()), errors = errorsFor(page);
  await page.goto(new URL("?intro=0", base).href); await page.locator(".gx-welcome--center").waitFor();
  await page.click(".gx-go-archive"); await page.click('[data-scene-id="archive-flightx"]'); await waitPhase(page, "menu");
  assert.equal(new URL(page.url()).searchParams.get("app"), "flightx");
  await choose(page, "time"); assert.equal(new URL(page.url()).searchParams.get("mode"), "time");
  await page.click("[data-flightx-menu]"); await waitPhase(page, "menu");
  await page.reload(); await waitPhase(page, "menu"); assert.equal((await state(page)).selectedMode, "time");
  assert.equal(await page.locator("[data-flightx-mode]").count(), 4);
  await visiblePlane(page); await capture(page, "menu-desktop");
  await choose(page, "gates");
  await page.locator("#app canvas").first().click({ position: { x: 650, y: 420 } });
  await page.keyboard.down("w");
  await page.waitForFunction(() => window.__GRAPHYSX__.query({ ids: ["flight-plane"] })[0].position[2] < -3);
  await page.keyboard.up("w");
  await visiblePlane(page);
  const released = await position(page); await advance(page, 300); assert.deepEqual(await position(page), released);
  await page.keyboard.press("p"); const paused = await state(page);
  await advance(page, 3000); assert.equal((await state(page)).rules.elapsedSeconds, paused.rules.elapsedSeconds);
  await page.click("[data-flightx-pause]");
  await page.keyboard.down("w"); await advance(page, 7000); await page.keyboard.up("w"); await waitPhase(page, "complete");
  const gates = await state(page); assert.equal(gates.rules.lap, 1); assert.equal(gates.rules.desynced, false); assert.ok(gates.best.gates > 0);
  await capture(page, "gates-complete");
  await page.click("[data-flightx-replay]"); await waitPhase(page, "flight");
  assert.equal((await state(page)).rules.lap, 0); assert.deepEqual(await position(page), [0, 16, 0]);
  await page.keyboard.down("w"); await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await page.keyboard.up("w");
  assert.equal((await state(page)).paused, true); assert.equal((await state(page)).controls.thrust, 0);
  const blurred = await position(page); await advance(page, 1000); assert.deepEqual(await position(page), blurred);
  await choose(page, "time"); await flyLoop(page, 11000); await waitPhase(page, "complete");
  const timed = await state(page); assert.ok(timed.rules.elapsedSeconds < 35); assert.equal(timed.rules.lap, 1);
  await capture(page, "loop-complete");
  await choose(page, "laps"); await flyLoop(page, 32000); await waitPhase(page, "complete");
  const laps = await state(page); assert.equal(laps.rules.lap, 3); assert.equal(laps.rules.desynced, false); assert.ok(laps.best.laps > 20);
  await capture(page, "three-laps");
  await choose(page, "time"); await advance(page, 36000); await waitPhase(page, "expired");
  assert.equal((await state(page)).rules.outcome, "timeout"); assert.equal((await state(page)).best.time, timed.best.time);
  await capture(page, "timeout");
  await choose(page, "free"); assert.equal((await state(page)).rules, null); await flyLoop(page, 1500);
  await page.keyboard.press("p");
  const authored = await page.evaluate(() => {
    const api = window.__GRAPHYSX__, slot = api.query({ ids: ["flight-plane-model"] })[0].materialSlots[0];
    const update = api.update("flight-plane-model", { label: "My FlightX course variant", modelMaterialOverrides: { [slot.id]: { roughness: .77 } } });
    if (!update.ok) throw new Error(update.error);
    const add = api.spawn({ id: "my-course-addition", type: "box", visible: false, material: { color: "#ff8844" } });
    if (!add.ok) throw new Error(add.error);
    return api.exportDocument();
  });
  await choose(page, "gates"); await choose(page, "free");
  assert.deepEqual(canonical(await page.evaluate(() => window.__GRAPHYSX__.exportDocument())), canonical(authored), "Changing forms during this visit retains the complete edited document");
  await page.click("[data-flightx-studio]"); await enterCompleteStudio(page); await page.locator(".gx-ed-toolbar").waitFor();
  await page.waitForFunction(() => window.__GRAPHYSX__?.query({ ids: ["flight-plane-model"] })[0]?.materialSlots?.length === 48);
  assert.deepEqual(canonical(await page.evaluate(() => window.__GRAPHYSX__.exportDocument())), canonical(authored));
  assert.equal(await page.locator(".gx-flightx").count(), 0);
  page.once("dialog", dialog => dialog.accept("FlightX playable variant"));
  await page.locator(".gx-ed-toolbar").getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("graphysx.agent-world.v2.FlightX playable variant")));
  const downloadEvent = page.waitForEvent("download"); await page.locator(".gx-ed-toolbar").getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadEvent; await download.saveAs(path.join(artifacts, "flightx-playable-variant.json"));
  const exported = JSON.parse(await readFile(path.join(artifacts, "flightx-playable-variant.json"), "utf8")); assert.deepEqual(canonical(exported), canonical(authored));
  await page.click(".gx-ed-exit"); await page.locator(".gx-welcome--center").waitFor();
  await page.goto(new URL("?host=editor&paused=1&localScene=FlightX%20playable%20variant", base).href);
  await page.waitForFunction(() => window.__GRAPHYSX__?.query({ ids: ["my-course-addition"] }).length === 1);
  assert.deepEqual(canonical(await page.evaluate(() => window.__GRAPHYSX__.exportDocument())), canonical(authored));
  await page.goto(new URL("?app=flightx&mode=gates&intro=0", base).href); await waitPhase(page, "menu");
  assert.equal((await state(page)).best.gates, gates.best.gates);
  assert.deepEqual(errors, []); receipts.push({ device: "desktop", catalogueEntryRefresh: true, modes: 4, realKeyboard: true, pauseBlurReset: true, orderedGates: gates.rules, timedLoop: timed.rules, threeLaps: laps.rules, saveExportReload: true, errors });
  await context.close();
  console.log("PASS FlightX modes: all four forms, real controls, shared ordered rules/timer/laps, records and edited Studio/save/export/reload.");

  for (const width of [390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
    const page = applySmokeTimeout(await context.newPage()), errors = errorsFor(page);
    await page.goto(new URL("?app=flightx&intro=0", base).href); await waitPhase(page, "menu");
    const menuProjection = await visiblePlane(page); await capture(page, "menu-mobile-" + width);
    await choose(page, "free"); await visiblePlane(page);
    const forward = await page.locator('[data-flightx-input="forward"]').boundingBox(), up = await page.locator('[data-flightx-input="up"]').boundingBox();
    assert.ok([forward, up].every(rect => rect && rect.width >= 44 && rect.height >= 44));
    const cdp = await context.newCDPSession(page);
    const fingers = [forward, up].map((rect, id) => ({ id: id + 1, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, radiusX: 2, radiusY: 2, force: 1 }));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers }); await advance(page, 1200);
    const moving = await position(page); assert.ok(moving[1] > 17 && moving[2] < -10);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert.deepEqual((await state(page)).controls, { roll: 0, pitch: 0, thrust: 0, airbrake: false });
    const stopped = await position(page); await advance(page, 300); assert.deepEqual(await position(page), stopped);
    await capture(page, "touch-mobile-" + width);
    await choose(page, "laps");
    const f = await page.locator('[data-flightx-input="forward"]').boundingBox(), p = await page.locator('[data-flightx-input="up"]').boundingBox();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [f, p].map((rect, id) => ({ id: id + 1, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, radiusX: 2, radiusY: 2, force: 1 })) });
    await advance(page, 32000); await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await waitPhase(page, "complete");
    assert.equal((await state(page)).rules.lap, 3); await capture(page, "laps-mobile-" + width);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const selector of ["[data-flightx-replay]", "[data-flightx-other]", "[data-flightx-studio]"]) {
      const rect = await page.locator(selector).boundingBox(); assert.ok(rect && rect.height >= 44 && rect.width >= 44);
    }
    assert.deepEqual(errors, []); receipts.push({ device: "touch", width, menuProjection, simultaneousTouch: true, released: true, threeLaps: true, errors }); await context.close();
    console.log("PASS FlightX modes " + width + "px: visible native airplane, four choices, simultaneous touch, release and complete three-lap run.");
  }
  {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith("graphysx.flightx.best.")) throw new DOMException("Quota", "QuotaExceededError"); return original.call(this, key, value); };
  });
  const page = applySmokeTimeout(await context.newPage()), errors = errorsFor(page);
  await page.goto(new URL("?app=flightx&intro=0", base).href); await waitPhase(page, "menu"); await visiblePlane(page);
  await choose(page, "gates"); await page.keyboard.down("w"); await advance(page, 7000); await page.keyboard.up("w"); await waitPhase(page, "complete");
  assert.match((await state(page)).recordNotice, /session/); assert.equal(await page.evaluate(() => localStorage.getItem("graphysx.flightx.best.v1")), null);
  assert.deepEqual(errors, []); receipts.push({ device: "desktop-storage-refusal", completed: true, falseSavedClaim: false, errors }); await context.close();
  }
  await writeFile(path.join(artifacts, "flightx-modes-receipt.json"), JSON.stringify(receipts, null, 2));
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: path.join(artifacts, "flightx-modes-failure.png") });
    const diagnostic = await activePage.evaluate(() => {
      const host = window.__GRAPHYSX_HOST__, lights = [];
      host.scene.traverse(object => { if (object.isLight) lights.push({ type: object.type, color: object.color.toArray(), intensity: object.intensity, visible: object.visible }); });
      return { application: JSON.parse(window.render_game_to_text()).application, definition: host.api.exportDocument(), lights,
        renderer: host.renderer.info.render, camera: host.camera.position.toArray(), background: host.scene.background?.getHexString?.(),
        canvases: [...document.querySelectorAll("canvas")].map(canvas => ({ width: canvas.width, height: canvas.height, display: getComputedStyle(canvas).display })) };
    });
    await writeFile(path.join(artifacts, "flightx-modes-failure.json"), JSON.stringify({ message: String(error), errors: activeErrors, ...diagnostic }, null, 2));
  }
  throw error;
} finally { await browser.close(); }

import assert from "node:assert/strict";
import { mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startSceneStore } from "../server/scene-store.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4209/";
const artifacts = process.env.SMOKE_ARTIFACTS || path.resolve("output/playwright/impreza");
await mkdir(artifacts, { recursive: true });
const local = ["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname);
const temporaryBase = path.resolve(tmpdir());
const directory = local ? await mkdtemp(path.join(temporaryBase, "graphysx-impreza-store-")) : null;
let store, browser;
const receipts = [];
const diagnostics = []; let phase = "startup";
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
const draw = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const ready = page => page.waitForFunction(() => { const app = JSON.parse(window.render_game_to_text?.() || "{}").application; return app?.id === "impreza" && app.ready; }, undefined, { timeout: 120000 });
const capture = (page, name) => page.screenshot({ path: path.join(artifacts, `${name}.png`) });
const url = (query = "?app=impreza&intro=0") => { const destination = new URL(query, base); if (store) destination.searchParams.set("store", store.url); return destination.href; };
const errorsFor = page => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() !== "error") return;
    errors.push(message.text()); const detail = { phase, url: page.url(), location: message.location(), message: message.text() }; diagnostics.push(detail); console.error(JSON.stringify(detail));
  });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.push(`${request.failure()?.errorText} ${request.url()}`); });
  return errors;
};
const driveKeys = async (page, keys, seconds) => {
  await page.evaluate(() => window.__GRAPHYSX__.pause(false));
  for (const key of keys) await page.keyboard.down(key);
  await page.evaluate(seconds => { window.__GRAPHYSX__.pause(true); window.__GRAPHYSX__.step(seconds); }, seconds);
  for (const key of [...keys].reverse()) await page.keyboard.up(key);
  await draw(page);
};
const wheelAlignment = page => page.evaluate(() => {
  const host = window.__GRAPHYSX_HOST__, api = host.api, car = host.world.getEntityObject("impreza-player");
  const rig = api.exportDocument().entities.find(e => e.id === "impreza-player").steering.vehicle;
  const readout = api.query({ ids: ["impreza-player"] })[0].steering.vehicle;
  const errors = rig.wheels.map((wheel, i) => {
    const expected = car.position.clone().set(...wheel.connection); expected.y -= readout.wheels[i].suspensionLength;
    expected.applyQuaternion(car.quaternion).add(car.position);
    return expected.distanceTo(host.world.getEntityObject(wheel.entityId).position);
  });
  return Math.max(...errors);
});
try {
  if (directory) store = await startSceneStore({ host: "127.0.0.1", port: 0, dir: directory, token: "" });
  browser = await launchSmokeBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  const page = applySmokeTimeout(await context.newPage()), errors = errorsFor(page);
  await page.goto(url("?intro=0"), { waitUntil: "domcontentloaded" });
  phase = "archive-entry";
  await page.click(".gx-go-archive"); await page.click('[data-scene-id="archive-impreza-worlds"]'); await ready(page);
  assert.equal((await read(page)).world, "atmel");
  assert.equal((await read(page)).sourceOpponents, 3); assert.equal((await read(page)).models, 20);
  assert.equal(await page.evaluate(() => window.__GRAPHYSX_HOST__.focusing), false, "Reduced motion has no entry ride");
  const parts = await page.evaluate(() => {
    const api = window.__GRAPHYSX__, car = api.query({ ids: ["impreza-player"] })[0], object = window.__GRAPHYSX_HOST__.world.getEntityObject(car.id);
    object.updateWorldMatrix(true, true); const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], point = object.position.clone();
    object.traverse(mesh => {
      const attribute = mesh.geometry?.attributes.position; if (!attribute) return;
      for (let i = 0; i < attribute.count; i++) {
        point.fromBufferAttribute(attribute, i); mesh.localToWorld(point); object.worldToLocal(point);
        point.toArray().forEach((n, axis) => { min[axis] = Math.min(min[axis], n); max[axis] = Math.max(max[axis], n); });
      }
    });
    return { wheels: api.query({ tag: "impreza-wheel" }).length, slots: car.materialSlots.length, collider: car.physics.collider.effective,
      shapeVertices: car.physics.collider.vertexCount, dimensions: max.map((n, axis) => n - min[axis]) };
  });
  assert.equal(parts.wheels, 16); assert.equal(parts.slots, 3); assert.equal(parts.collider, "convex-hull"); assert.equal(parts.shapeVertices, 1883);
  assert.ok(Math.abs(parts.dimensions[2] - 4.659383) < 1e-5, "Renderer keeps the native TVM length instead of generic asset fitting");
  await capture(page, "impreza-atmel-desktop");
  phase = "keyboard-drive";
  // The source Atmel witnesses occupy the lane straight ahead. Use an explicit editable
  // clear-lane fixture to qualify unobstructed controls, without removing those witnesses.
  await page.evaluate(() => window.__GRAPHYSX__.update("impreza-player", { transform: { position: [20, .9, 0] } }));
  await page.click("[data-impreza-drive]");
  await page.evaluate(() => { window.__GRAPHYSX__.pause(true); window.__GRAPHYSX__.step(2); });
  const start = await read(page); await driveKeys(page, ["ArrowUp"], 3); const forward = await read(page);
  await capture(page, "impreza-drive-probe");
  assert.ok(forward.player[2] < start.player[2] - 10, JSON.stringify({ message: "Real keyboard throttle moves the recovered chassis forward", start, forward }));
  assert.ok(forward.vehicle.speed > 5, JSON.stringify(forward)); assert.equal(forward.vehicle.wheels.filter(w => w.contact).length, 4);
  const straightError = await wheelAlignment(page); assert.ok(straightError < 1e-8);
  await driveKeys(page, ["ArrowUp", "ArrowRight"], .65); const turn = await read(page);
  assert.ok(turn.player[0] > forward.player[0] + .2, "Front steering turns the actual car right");
  const turnedError = await wheelAlignment(page); assert.ok(turnedError < 1e-8);
  assert.ok(await page.evaluate(() => { const q = window.__GRAPHYSX_HOST__.world.getEntityObject("impreza-player").quaternion; return 1 - 2 * (q.x * q.x + q.z * q.z); }) > .8, "Digital steering remains upright at speed");
  await driveKeys(page, ["Space"], 2);
  assert.ok(Math.abs((await read(page)).vehicle.speed) < Math.abs(turn.vehicle.speed) * .5, "Rear handbrake slows the vehicle");
  await page.waitForTimeout(500); await capture(page, "impreza-driving-desktop");
  console.log("PASS Impreza: native hull, clear-lane keyboard drive/turn/brake and attached wheels.");
  await page.evaluate(() => window.__GRAPHYSX__.pause(false)); await page.keyboard.down("ArrowUp");
  await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await page.keyboard.up("ArrowUp");
  assert.equal((await read(page)).controls.thrust, 0); assert.equal((await read(page)).paused, true);
  await page.click("[data-impreza-reset]"); await ready(page); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application.mode === "drive");
  assert.equal((await read(page)).controls.thrust, 0);
  await page.click("[data-impreza-inspect]"); await page.click('[data-impreza-world="racinx"]'); await ready(page);
  phase = "racinx-layout";
  const later = await read(page); assert.equal(later.sourceRings, 100); assert.equal(later.sourceOpponents, 0); assert.equal(later.models, 105);
  const recovered = await page.evaluate(() => {
    const api = window.__GRAPHYSX__, doc = api.exportDocument();
    return { heights: doc.entities.find(e => e.type === "terrain").terrain.heights.length, lastRing: api.query({ ids: ["impreza-ring-99"] })[0].position,
      water: api.query({ ids: ["impreza-source-water"] })[0], sky: doc.environment.sky, far: window.__GRAPHYSX_HOST__.camera.far };
  });
  assert.equal(recovered.heights, 512 * 512); assert.deepEqual(recovered.lastRing, [990, 3, -990]);
  assert.equal(recovered.water.visible, false); assert.equal(recovered.water.position[1], 485); assert.equal(recovered.sky, "winter"); assert.equal(recovered.far, 2500);
  await capture(page, "impreza-racinx-desktop"); await page.click("[data-impreza-overview]"); await capture(page, "impreza-racinx-layout");
  await page.locator(".gx-impreza-provenance summary").click(); await page.click("[data-impreza-drop]"); await ready(page);
  phase = "source-drop";
  await page.evaluate(() => window.__GRAPHYSX__.pause(true));
  assert.ok((await read(page)).player[1] > 45, "Native +50.2m drop stays available separately from the settled start");
  await page.evaluate(() => window.__GRAPHYSX__.step(5));
  assert.ok((await read(page)).player.every(Number.isFinite)); assert.ok((await read(page)).player[1] > -2 && (await read(page)).player[1] < 5, "The historic drop collides with the terrain; a 50m impact is allowed to roll the car");
  assert.ok(await wheelAlignment(page) < 1e-8, "Wheels remain attached through the source-height impact");
  console.log("PASS Impreza: source generations, all rings/height samples, hidden native water and source-height impact.");
  await page.click("[data-impreza-studio]"); await page.locator(".gx-ed-toolbar").waitFor();
  phase = "studio-copy";
  assert.equal(new URL(page.url()).searchParams.get("app"), null);
  if (store) assert.equal(new URL(page.url()).searchParams.get("store"), store.url);
  await page.waitForFunction(() => window.__GRAPHYSX__.query({ ids: ["impreza-player"] })[0]?.asset?.status === "ready");
  assert.equal(await page.evaluate(() => window.__GRAPHYSX__.state().world.id), "archive-impreza-racinx");
  assert.equal(await page.evaluate(() => window.__GRAPHYSX__.state().paused), true);
  assert.deepEqual(await page.evaluate(() => window.__GRAPHYSX__.state().selectedIds), ["impreza-player"]);
  await page.waitForFunction(() => document.querySelector(".gx-ed-inspector")?.textContent.includes("impreza-player"));
  await capture(page, "impreza-studio");
  page.once("dialog", dialog => dialog.accept("Impreza restored world"));
  await page.locator(".gx-ed-toolbar").getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("graphysx.agent-world.v2.Impreza restored world")));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("graphysx.agent-world.v2.Impreza restored world")));
  const savedRig = saved.entities.find(e => e.id === "impreza-player").steering;
  assert.equal(savedRig.vehicle.wheels.length, 4);
  for (const field of ["thrust", "turn", "brake"]) assert.equal(Object.hasOwn(savedRig, field), false);
  const downloadEvent = page.waitForEvent("download"); await page.locator(".gx-ed-toolbar").getByRole("button", { name: "Export", exact: true }).click();
  await (await downloadEvent).saveAs(path.join(artifacts, "impreza-studio-world.json"));
  await page.click(".gx-ed-exit"); await page.locator(".gx-welcome--center").waitFor();
  phase = "studio-home";
  assert.equal(await page.locator(".gx-impreza").count(), 0);
  await page.goto(url("?host=editor&paused=1&localScene=Impreza%20restored%20world"));
  phase = "saved-reload";
  await page.waitForFunction(() => window.__GRAPHYSX__?.state()?.world.id === "archive-impreza-racinx");
  assert.equal(await page.evaluate(() => window.__GRAPHYSX__.query({ tag: "impreza-source-ring" }).length), 100);
  await page.goto(url()); await ready(page);
  phase = "changed-world-preservation";
  console.log("PASS Impreza: Studio copy, local Save, JSON Export, Home and saved reload.");
  await page.evaluate(() => { window.__GRAPHYSX__.create({ schema: "graphysx.agent-world/v2", id: "kept-custom-world", label: "Kept", entities: [{ id: "kept-box", type: "box" }] }); window.__GRAPHYSX__.pause(true); });
  await draw(page); await page.click("[data-impreza-studio]"); await page.locator(".gx-ed-toolbar").waitFor();
  assert.equal(await page.evaluate(() => window.__GRAPHYSX__.state().world.id), "kept-custom-world", "Studio preserves a world replaced through the canonical API");
  receipts.push({ device: "desktop", parts, straightError, turnedError, forwardMetres: start.player[2] - forward.player[2], sourceRings: later.sourceRings, studioSaveExportReload: true, errors });
  await context.close(); console.log("PASS Impreza desktop: native parts, two worlds, physical controls, wheel alignment, source drop, Studio/save/export/reload and changed-world preservation.");

  for (const [width, height] of [[390, 844], [320, 740]]) {
    phase = `touch-${width}`;
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = applySmokeTimeout(await context.newPage()), errors = errorsFor(page);
    await page.goto(url()); await ready(page); await capture(page, `impreza-mobile-${width}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator("[data-impreza-drive]").scrollIntoViewIfNeeded(); await page.locator("[data-impreza-drive]").tap();
    const cdp = await context.newCDPSession(page);
    const forwardButton = await page.locator('[data-impreza-input="forward"]').boundingBox();
    const leftButton = await page.locator('[data-impreza-input="left"]').boundingBox();
    const controls = await page.locator(".gx-impreza-touch button").evaluateAll(buttons => buttons.map(button => { const r = button.getBoundingClientRect(); return { width: r.width, height: r.height, x: r.x, right: r.right, y: r.y, bottom: r.bottom }; }));
    for (const button of controls) assert.ok(button.width >= 44 && button.height >= 44 && button.x >= 0 && button.right <= width && button.y >= 0 && button.bottom <= height, JSON.stringify(button));
    const touch = (id, box) => ({ id, x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 2, radiusY: 2, force: 1 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(1, forwardButton)] });
    assert.equal((await read(page)).controls.thrust, 1);
    await page.evaluate(() => { window.__GRAPHYSX__.pause(true); window.__GRAPHYSX__.step(1.5); window.__GRAPHYSX__.pause(false); });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(1, forwardButton), touch(2, leftButton)] });
    assert.equal((await read(page)).controls.turn, -1);
    await page.evaluate(() => { window.__GRAPHYSX__.pause(true); window.__GRAPHYSX__.step(.3); });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert.deepEqual((await read(page)).controls, { thrust: 0, turn: 0, brake: 0 });
    assert.ok((await read(page)).player[2] < -2);
    assert.ok(await wheelAlignment(page) < 1e-8); await page.waitForTimeout(600); await capture(page, `impreza-touch-${width}`);
    await page.locator("[data-impreza-inspect]").tap();
    await page.locator('[data-impreza-world="racinx"]').scrollIntoViewIfNeeded(); await page.locator('[data-impreza-world="racinx"]').tap(); await ready(page);
    assert.equal((await read(page)).sourceRings, 100);
    await page.locator("[data-impreza-studio]").tap(); await page.locator(".gx-ed-toolbar").waitFor();
    assert.equal(await page.evaluate(() => window.__GRAPHYSX_HOST__.orbitEnabled), true);
    receipts.push({ device: "touch", width, height, controls, simultaneousTouch: true, errors });
    await context.close(); console.log(`PASS Impreza ${width}px: 44px controls, simultaneous touch, release, world switch and Studio.`);
  }
  await writeFile(path.join(artifacts, "impreza-receipt.json"), JSON.stringify(receipts, null, 2));
  assert.deepEqual(receipts.flatMap(receipt => receipt.errors), []);
} finally {
  await writeFile(path.join(artifacts, "impreza-diagnostics.json"), JSON.stringify({ phase, diagnostics }, null, 2));
  await browser?.close(); await store?.close();
  if (directory) { const target = path.resolve(directory); assert.equal(path.dirname(target), temporaryBase); assert.ok(path.basename(target).startsWith("graphysx-impreza-store-")); await rm(target, { recursive: true, force: true }); }
}

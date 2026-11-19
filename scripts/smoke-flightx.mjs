import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4209/";
const artifacts = path.resolve(process.env.SMOKE_ARTIFACTS || "output/playwright/flightx");
await mkdir(artifacts, { recursive: true });
const browser = await launchSmokeBrowser(), receipts = [];
const ready = async page => {
  await page.locator('[data-archive-action="native-pose"]').waitFor({ state: "attached" });
  await page.waitForFunction(() => {
    const host = window.__GRAPHYSX_HOST__;
    let vertices = 0;
    host?.world.getEntityObject("flight-plane-model")?.traverse(child => { if (child.isMesh && child.geometry?.attributes.position) vertices += child.geometry.attributes.position.count; });
    return vertices === 10261 && host?.api.query({ ids: ["flight-plane-model"] })[0]?.materialSlots?.length === 48
      && host.api.query({ ids: ["flight-source-pipe"] })[0]?.materialSlots?.length === 3;
  });
};
const errorsFor = page => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(response.status() + " " + response.url()); });
  page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.push(request.failure()?.errorText + " " + request.url()); });
  return errors;
};
const draw = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const capture = (page, name) => page.screenshot({ path: path.join(artifacts, name + ".png") });
const position = page => page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["flight-plane"] })[0].position);
const showControls = async page => {
  const panel = page.locator(".gx-archive-workbench");
  if (!await panel.evaluate(element => element.open)) await panel.locator("summary").click();
};
const projectedModel = (page, id) => page.evaluate(id => {
  const host = window.__GRAPHYSX_HOST__, model = host.world.getEntityObject(id);
  let mesh; model.traverse(child => { if (child.isMesh && child.geometry?.attributes.position) mesh = child; });
  mesh.updateWorldMatrix(true, false); mesh.geometry.computeBoundingBox();
  const worldPoint = mesh.geometry.boundingBox.getCenter(model.position.clone()).applyMatrix4(mesh.matrixWorld), distance = worldPoint.distanceTo(host.camera.position);
  const point = worldPoint.project(host.camera), rect = host.renderer.domElement.getBoundingClientRect();
  const x = rect.left + (point.x + 1) * rect.width / 2, y = rect.top + (1 - point.y) * rect.height / 2;
  return { x, y, ndc: point.toArray(), distance, fogNear: host.scene.fog.near,
    hit: document.elementFromPoint(x, y)?.tagName, panel: document.querySelector(".gx-ed-mobile-nav").dataset.panel };
}, id);
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  const page = applySmokeTimeout(await context.newPage()), errors = errorsFor(page);
  await page.goto(new URL("?app=flightx&view=source&intro=0", base).href); await ready(page);
  await page.evaluate(() => window.__GRAPHYSX__.pause(true));
  const loaded = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__, api = host.api;
    const inspect = id => {
      const object = host.world.getEntityObject(id); let mesh;
      object.traverse(child => { if (child.isMesh && child.geometry?.attributes.position) mesh = child; });
      mesh.updateWorldMatrix(true, false); mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], point = object.position.clone();
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        point.set(x, y, z).applyMatrix4(mesh.matrixWorld);
        point.toArray().forEach((n, axis) => { min[axis] = Math.min(min[axis], n); max[axis] = Math.max(max[axis], n); });
      }
      return { vertices: mesh.geometry.attributes.position.count, indices: mesh.geometry.index.count, groups: mesh.geometry.groups.length, min, max,
        maps: mesh.material.filter(m => m.map).map(m => ({ width: m.map.image.width, height: m.map.image.height, flipY: m.map.flipY })),
        glass: mesh.material.filter(m => m.transparent).map(m => m.opacity) };
    };
    return { plane: inspect("flight-plane-model"), pipe: inspect("flight-source-pipe"), selected: api.state().selected };
  });
  assert.deepEqual([loaded.plane.vertices, loaded.plane.indices, loaded.plane.groups], [10261, 33504, 48]);
  assert.deepEqual([loaded.pipe.vertices, loaded.pipe.indices, loaded.pipe.groups], [1432, 6480, 3]);
  assert.equal(loaded.plane.maps.length, 13); assert.ok(loaded.plane.maps.every(m => m.width > 0 && m.height > 0 && m.flipY === false));
  assert.deepEqual(loaded.plane.glass, [.25]);
  for (const [actual, expected] of [[loaded.plane.min, [-2.56836273, 14.83085396, -1.77089142]], [loaded.plane.max, [2.92812958, 16.48275520, 3.07155548]]]) {
    assert.ok(actual.every((n, i) => Math.abs(n - expected[i]) < 1e-5), "Rendered airplane keeps its native orientation, scale and origin");
  }
  for (const [actual, expected] of [[loaded.pipe.min, [36.49501648, 6.03348885, -3.60748558]], [loaded.pipe.max, [55.85432739, 25.39176636, .1157545]]]) {
    assert.ok(actual.every((n, i) => Math.abs(n - expected[i]) < 1e-5), "Rendered pipe preserves the native offset, scale and world lift");
  }
  await capture(page, "flightx-native-model");
  const custom = await page.evaluate(() => {
    const api = window.__GRAPHYSX__, slot = api.query({ ids: ["flight-plane-model"] })[0].materialSlots[0];
    const edited = api.update("flight-plane-model", { label: "My FlightX variant", modelMaterialOverrides: { [slot.id]: { roughness: .72 } } });
    if (!edited.ok) throw new Error(edited.error);
    const added = api.spawn({ id: "flightx-authored-marker", type: "box", visible: false, material: { color: "#edbc77" } });
    if (!added.ok) throw new Error(added.error);
    return api.exportDocument();
  });
  await page.click('[data-archive-action="native-pose"]'); await ready(page); await draw(page); await capture(page, "flightx-native-scene");
  assert.equal(await page.evaluate(() => window.__GRAPHYSX__.query({ tag: "adapted-inspection-marker" }).every(e => e.visible === false)), true);
  assert.deepEqual(await page.evaluate(() => window.__GRAPHYSX__.exportDocument().entities.find(e => e.id === "flight-plane-model").modelMaterialOverrides),
    custom.entities.find(e => e.id === "flight-plane-model").modelMaterialOverrides);
  const native = await page.evaluate(() => window.__GRAPHYSX__.exportDocument());
  await page.click('[data-archive-action="native-pose-2011"]'); await ready(page); await draw(page); await capture(page, "flightx-native-2011");
  assert.deepEqual(await page.evaluate(() => window.__GRAPHYSX__.exportDocument().entities.find(e => e.id === "flight-plane-model").transform.scale), [.001, .001, .001]);
  await page.evaluate(() => window.__GRAPHYSX__.undo()); await ready(page);
  const canonical = document => ({ ...document, entities: [...document.entities].sort((a, b) => a.id.localeCompare(b.id)) });
  await page.evaluate(() => window.__GRAPHYSX__.undo()); assert.deepEqual(canonical(await page.evaluate(() => window.__GRAPHYSX__.exportDocument())), canonical(custom));
  await page.evaluate(() => window.__GRAPHYSX__.redo()); assert.deepEqual(canonical(await page.evaluate(() => window.__GRAPHYSX__.exportDocument())), canonical(native));
  await page.click('[data-archive-action="flight-pose"]');
  await page.evaluate(() => window.__GRAPHYSX__.pause(true)); const before = await position(page);
  const authoredBefore = await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument()));
  await page.locator("canvas").first().click({ position: { x: 850, y: 500 } });
  await page.keyboard.down("w"); await page.evaluate(() => window.__GRAPHYSX__.step(1)); await page.keyboard.up("w");
  assert.ok(Math.abs((await position(page))[2] - before[2] + 18) < 1e-5, "Forward motion follows the native airplane nose");
  await page.keyboard.down("ArrowLeft"); await page.keyboard.down("ArrowDown"); await page.keyboard.down("Space");
  await page.evaluate(() => window.__GRAPHYSX__.step(.4));
  await page.keyboard.up("Space"); await page.keyboard.up("ArrowDown"); await page.keyboard.up("ArrowLeft");
  assert.ok(await page.evaluate(() => Math.abs(window.__GRAPHYSX_HOST__.world.getEntityObject("flight-plane").quaternion.w) < .999));
  const turnedPosition = await position(page); await page.keyboard.press("r");
  assert.deepEqual(await position(page), turnedPosition);
  assert.ok(await page.evaluate(() => Math.abs(window.__GRAPHYSX_HOST__.world.getEntityObject("flight-plane").quaternion.w) > .99999));
  assert.equal(await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument())), authoredBefore, "Held flight keys never persist as authored edits");
  await page.keyboard.down("w"); await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await page.keyboard.up("w");
  const released = await position(page); await page.evaluate(() => window.__GRAPHYSX__.step(.5)); assert.deepEqual(await position(page), released);
  await page.click('[data-archive-action="reset-flight"]'); assert.deepEqual(await position(page), [0, 16, 0]);
  await draw(page); await capture(page, "flightx-pilot");
  page.once("dialog", dialog => dialog.accept("FlightX native variant"));
  await page.locator(".gx-ed-toolbar").getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("graphysx.agent-world.v2.FlightX native variant")));
  const downloadEvent = page.waitForEvent("download"); await page.locator(".gx-ed-toolbar").getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadEvent; await download.saveAs(path.join(artifacts, "flightx-variant.json"));
  const exported = JSON.parse(await readFile(path.join(artifacts, "flightx-variant.json"), "utf8"));
  assert.equal(exported.entities.find(e => e.id === "flight-plane-model").label, "My FlightX variant");
  await page.click(".gx-ed-exit"); await page.locator(".gx-welcome--center").waitFor();
  assert.equal(await page.locator(".gx-archive-workbench").count(), 0);
  await page.goto(new URL("?host=editor&paused=1&localScene=FlightX%20native%20variant", base).href);
  await page.waitForFunction(() => window.__GRAPHYSX__?.query({ ids: ["flight-plane-model"] })[0]?.materialSlots?.length === 48);
  const reloaded = await page.evaluate(() => window.__GRAPHYSX__.exportDocument());
  assert.deepEqual(canonical(reloaded), canonical(exported)); assert.equal(await page.locator(".gx-archive-workbench").count(), 0);
  assert.deepEqual(errors, []); receipts.push({ device: "desktop", loaded, sourcePoseUndo: true, authoredEditsRetained: true, controls: true, saveExportReload: true, errors });
  console.log("PASS FlightX: original geometry/maps/canopy, native pipe bounds, undoable source pose, real controls and edited Save/Export/reload.");
  await context.close();
  for (const [width, height] of [[390, 844], [320, 740]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
    const page = applySmokeTimeout(await context.newPage()), errors = errorsFor(page);
    await page.goto(new URL("?app=flightx&view=source&intro=0", base).href); await ready(page);
    await page.locator('.gx-ed-mobile-nav[data-panel="viewport"]').waitFor();
    await page.locator(".gx-ed-mobile-nav").getByRole("button", { name: "Inspect", exact: true }).tap();
    await page.locator('.gx-ed-mobile-nav[data-panel="inspector"]').waitFor();
    await showControls(page);
    await page.locator('[data-archive-action="flight-pose"]').scrollIntoViewIfNeeded(); await page.locator('[data-archive-action="flight-pose"]').tap();
    await page.locator('.gx-ed-mobile-nav[data-panel="viewport"]').waitFor();
    await page.evaluate(() => window.__GRAPHYSX__.pause(true));
    const forward = page.locator('[data-archive-action="KeyW"]'), turn = page.locator('[data-archive-action="ArrowLeft"]');
    await forward.scrollIntoViewIfNeeded(); const a = await forward.boundingBox(), b = await turn.boundingBox();
    assert.ok(a.height >= 44 && b.height >= 44 && a.width >= 44 && b.width >= 44);
    const cdp = await context.newCDPSession(page), touch = (id, box) => ({ id, x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(1, a), touch(2, b)] });
    await page.evaluate(() => window.__GRAPHYSX__.step(.3));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const moved = await position(page); assert.ok(moved[2] < -4.5);
    await page.evaluate(() => window.__GRAPHYSX__.step(.5)); assert.deepEqual(await position(page), moved, "Both touch controls release without stuck flight");
    await page.locator('[data-archive-action="native-pose"]').scrollIntoViewIfNeeded(); await page.locator('[data-archive-action="native-pose"]').tap(); await ready(page);
    await page.locator(".gx-archive-workbench summary").tap(); await draw(page);
    const overview = [];
    for (const id of ["flight-plane-model", "flight-source-pipe"]) {
      const projected = await projectedModel(page, id); overview.push({ id, ...projected });
      assert.ok(projected.ndc.every(n => n >= -1 && n <= 1), "Both native objects must be inside the actual camera frustum");
      assert.ok(projected.distance < projected.fogNear, "Source overview cannot disappear into the showroom distance fog");
      assert.equal(projected.hit, "CANVAS");
    }
    await capture(page, "flightx-native-mobile-" + width);
    await showControls(page);
    await page.locator('[data-archive-action="native-pose-2011"]').scrollIntoViewIfNeeded(); await page.locator('[data-archive-action="native-pose-2011"]').tap(); await ready(page);
    await page.locator(".gx-archive-workbench summary").tap(); await draw(page);
    const visible = await projectedModel(page, "flight-plane-model");
    assert.equal(visible.panel, "viewport"); assert.equal(visible.hit, "CANVAS", "The actual airplane must be visible through unobstructed 3D canvas, not covered by the inspector");
    assert.ok(visible.x > 8 && visible.x < width - 8 && visible.y > 130 && visible.y < height - 72);
    assert.ok(visible.ndc[2] > -1 && visible.ndc[2] < 1 && visible.distance < visible.fogNear);
    await capture(page, "flightx-2011-mobile-" + width);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []); receipts.push({ device: "touch", width, simultaneousTouch: true, sourcePose: true, unobstructedPlane: visible, overview, errors }); await context.close();
    console.log("PASS FlightX " + width + "px: native model, simultaneous touch, release and source composition.");
  }
  await writeFile(path.join(artifacts, "flightx-receipt.json"), JSON.stringify(receipts, null, 2));
} finally { await browser.close(); }

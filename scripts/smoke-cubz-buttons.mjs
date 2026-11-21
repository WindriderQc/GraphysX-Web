import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4209/";
const artifacts = process.env.SMOKE_ARTIFACTS || path.resolve("output/playwright/cubz-buttons");
await mkdir(artifacts, { recursive: true });
const browser = await launchSmokeBrowser(), receipts = [], errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce", acceptDownloads: true });
const page = applySmokeTimeout(await context.newPage());
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
const draw = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function open(choice) {
  await page.goto(new URL("?app=cubx&intro=0", base).href, { waitUntil: "domcontentloaded" });
  await page.locator('[data-cubz-choice="0"]').waitFor();
  await page.locator(`[data-cubz-choice="${choice}"]`).evaluate(button => { button.click(); window.__GRAPHYSX__.pause(true); });
  await page.evaluate(() => window.__GRAPHYSX__.step(3)); await draw();
  assert.equal((await read()).phase, "opened");
  const visible = await page.evaluate(() => {
    const api = window.__GRAPHYSX__, world = window.__GRAPHYSX_HOST__.world;
    const visible = object => { for (; object; object = object.parent) if (!object.visible) return false; return true; };
    return { keys: api.query({ tag: "reconstructed-button-model" }).filter(entity => entity.type === "mesh" && visible(world.getEntityObject(entity.id))).length,
      exit: visible(world.getEntityObject("cubz-exit")) };
  });
  assert.deepEqual(visible, { keys: 4, exit: true });
}
async function clickMesh(id) {
  const point = await page.evaluate(id => {
    const host = window.__GRAPHYSX_HOST__, object = host.world.getEntityObject(id);
    object.geometry.computeBoundingBox();
    const centre = object.localToWorld(object.geometry.boundingBox.getCenter(object.position.clone())).project(host.camera);
    const rect = host.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (centre.x + 1) * rect.width / 2, y: rect.top + (1 - centre.y) * rect.height / 2 };
  }, id);
  const overlay = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point);
  assert.equal(overlay, "CANVAS", `key ${id} must be visible outside the control card`);
  await page.mouse.click(point.x, point.y);
}
const destinations = new Map([
  ["atmel", "[data-atmel-choice]"], ["maison", ".gx-maison"], ["impreza", ".gx-impreza"], ["flightx", ".gx-flightx"],
  ["dna", ".gx-dna"], ["creation", ".gx-creation"], ["make-ten", ".gx-ten"], ["ev3-lab", ".kx-shell"],
  ["llmx", ".gx-llmx"], ["diskx", ".gx-diskx"], ["ecosystem", ".gx-eco"], ["netx", ".gx-netx"], ["library", ".gx-personal"],
]);
try {
  // Exercise each numbered button through the real rendered key. Browser controls use
  // this same dispatcher; the established menu smoke separately covers keyboard/touch.
  for (let choice = 0; choice < 8; choice++) {
    await open(choice);
    const buttons = (await read()).buttons;
    assert.equal(buttons.length, 4);
    await page.screenshot({ path: path.join(artifacts, `cubz-buttons-menu-${choice + 1}.png`) });
    for (let slot = 0; slot < 4; slot++) {
      if (slot) await open(choice);
      const { number, action } = buttons[slot];
      assert.equal(number, choice * 4 + slot + 1);
      assert.equal(await page.locator(`[data-cubz-button="${number}"]`).textContent().then(text => text.includes(buttons[slot].label)), true);
      const download = action === "export" ? page.waitForEvent("download") : null;
      await clickMesh(`cubz-action-${choice}-${action}`);
      if (destinations.has(action)) {
        // Await the actual target application, not just an intercepted request or URL.
        await page.waitForURL(url => action === "library" ? url.searchParams.get("library") === "local" : url.searchParams.get("app") === (action === "atmel" ? "cubx" : action));
        if (action === "ev3-lab") assert.equal(new URL(page.url()).searchParams.get("view"), "atelier");
        await page.locator(destinations.get(action)).first().waitFor();
        assert.equal(await page.locator(".gx-cubz:not(.gx-atmel)").count(), 0);
        receipts.push({ number, action, url: page.url(), destinationVisible: true });
      } else if (action === "studio") {
        await page.waitForFunction(() => window.__GRAPHYSX_HOST__?.mode === "editor");
        assert.equal(await page.locator(".gx-cubz").count(), 0);
        assert.equal(await page.evaluate(() => window.__GRAPHYSX__.exportDocument().entities.filter(entity => entity.tags?.includes("reconstructed-button-model")).length), 33);
        receipts.push({ number, action, editable: true });
      } else {
        const state = await read(); assert.deepEqual(state.lastAction, { button: number, action });
        if (action === "colors") assert.equal(state.diagnostic, true);
        if (action === "inspect") assert.deepEqual(await page.evaluate(() => window.__GRAPHYSX__.state().selectedIds), ["cubz-open-rig"]);
        if (["cores", "cylinders", "petals"].includes(action)) assert.equal(await page.evaluate(() => window.__GRAPHYSX__.state().selectedIds.length), { cores: 8, cylinders: 12, petals: 24 }[action]);
        if (action === "provenance") assert.equal(await page.locator(".gx-cubz-source").evaluate(details => details.open), true);
        if (["front", "back", "top", "frame"].includes(action)) {
          const direction = await page.evaluate(() => {
            const host = window.__GRAPHYSX_HOST__; return host.camera.position.clone().sub(host.orbitTarget).toArray();
          });
          assert.ok(direction.every(Number.isFinite));
          if (action === "front") assert.ok(direction[2] > 0 && Math.abs(direction[0]) < .01, "front view looks along the front axis");
          if (action === "back") assert.ok(direction[2] < 0, "back view crosses behind the rig");
          if (action === "top") assert.ok(direction[1] > Math.abs(direction[2]) * 2, "top view looks down onto the rig");
          await page.screenshot({ path: path.join(artifacts, `cubz-buttons-camera-${action}.png`) });
        }
        if (download) {
          const result = await download, pose = JSON.parse(await readFile(await result.path(), "utf8"));
          assert.equal(pose.schema, "graphysx.agent-world/v2");
          assert.equal(pose.entities.filter(entity => entity.tags?.includes("reconstructed-button-model")).length, 33);
          assert.equal(pose.entities.find(entity => entity.id === "cubz-exit").visible, true);
          assert.ok(pose.entities.every(entity => !entity.behaviors?.some(behavior => behavior.id === "cubz-visibility")));
          await writeFile(path.join(artifacts, "cubz-buttons-exported-pose.json"), JSON.stringify(pose));
        }
        receipts.push({ number, action, executed: true });
      }
    }
    await open(choice);
    await clickMesh("cubz-exit-face");
    await page.evaluate(() => { window.__GRAPHYSX__.pause(true); window.__GRAPHYSX__.step(3); }); await draw();
    assert.equal((await read()).phase, "idle"); assert.equal((await read()).sharedExit, false);
    assert.equal(await page.evaluate(() => window.__GRAPHYSX_HOST__.world.getEntityObject("cubz-exit").visible), false);
    console.log(`PASS CubZ menu ${choice + 1}: four real 3D keys and shared return.`);
  }
  assert.equal(new Set(receipts.map(receipt => receipt.number)).size, 32);
  assert.deepEqual(errors, []);
  await writeFile(path.join(artifacts, "cubz-buttons-receipt.json"), JSON.stringify({ base, receipts, errors }, null, 2));
  console.log("PASS CubZ: all 32 reconstructed keys, live destinations, editable copy/export and eight shared-exit cycles.");
} finally { await context.close(); await browser.close(); }

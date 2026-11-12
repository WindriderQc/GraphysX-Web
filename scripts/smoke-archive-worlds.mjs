import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4196/";
const artifacts = process.env.SMOKE_ARTIFACTS || path.resolve("output/playwright/archive-worlds");
mkdirSync(artifacts, { recursive: true });
const browser = await launchSmokeBrowser();
const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 1440, height: 900 } }));
const errors = [], failed = [], responses = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") failed.push({ url: request.url(), error: request.failure()?.errorText }); });
page.on("response", response => { if (response.status() >= 400) responses.push({ url: response.url(), status: response.status() }); });
const check = (name, value) => { assert.ok(value, name); console.log(`ok ${name}`); };
const open = async (id, worldId) => {
  if (await page.locator(".gx-ed-exit").isVisible()) await page.click(".gx-ed-exit");
  await page.click(".gx-go-archive");
  await page.click(`[data-scene-id="${id}"]`);
  await page.waitForFunction(id => window.__GRAPHYSX__.state().world.id === id, worldId);
  await page.waitForSelector(".gx-archive-workbench");
};
const meshes = async id => page.evaluate(id => {
  let count = 0; window.__GRAPHYSX_HOST__.world.getEntityObject(id)?.traverse(child => { if (child.isMesh) count++; }); return count;
}, id);
const capture = async name => page.screenshot({ path: path.join(artifacts, `${name}.png`) });
try {
  await page.goto(new URL("?intro=0", base).href, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".gx-welcome--center");
  await open("archive-maison", "archive-maison-explorer");
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.world.getEntityObject("maison-source-model")?.children.length > 0);
  check("complete 24-part Maison loads", await meshes("maison-source-model") === 24);
  await page.evaluate(() => window.__GRAPHYSX__.spawn({ id: "kept-user-box", type: "box", transform: { position: [40, 0, 0] } }));
  await capture("maison-complete");
  await page.click('[data-archive-action="kitchen"]');
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.world.getEntityObject("cuisine-model")?.children.length > 0);
  check("Cuisine remains complete and changing views preserves user edits", await meshes("cuisine-model") === 76 && await page.evaluate(() =>
    window.__GRAPHYSX__.query({ ids: ["kept-user-box"] }).length === 1 && window.__GRAPHYSX__.query({ ids: ["maison-kitchen"] })[0].visible));

  await open("archive-unity-arena", "archive-unity-arena");
  await page.waitForFunction(() => {
    let loaded = false;
    window.__GRAPHYSX_HOST__.world.getEntityObject("arena-source-model")?.traverse(child => { if (child.isMesh) loaded ||= Boolean(child.material.map?.image?.width); });
    return loaded;
  });
  check("Unity Arena loads its painted source atlas", await meshes("arena-source-model") === 1);
  await page.click('[data-archive-action="overview"]'); await capture("unity-arena");

  await open("archive-common-room", "archive-common-room");
  await page.waitForFunction(() => {
    const object = window.__GRAPHYSX_HOST__.world.getEntityObject("common-room-shell");
    const material = Array.isArray(object?.material) ? object.material[0] : object?.material;
    return material?.map?.image?.width && material.normalMap?.image?.width;
  });
  check("Common Room renders all source triangles and both DDS maps", await page.evaluate(() => {
    const object = window.__GRAPHYSX_HOST__.world.getEntityObject("common-room-shell");
    return object.geometry.getAttribute("position").count === 180 && object.geometry.index.count === 750;
  }));
  await capture("common-room");

  await open("archive-notes", "archive-notes");
  for (let i = 0; i < 3; i++) await page.click('[data-archive-action="add-note"]');
  check("native notes reveal three real plates", await page.evaluate(() => window.__GRAPHYSX__.query({ tag: "note-plate" }).filter(entity => entity.visible).length === 3));
  await page.evaluate(() => window.__GRAPHYSX__.undo());
  check("notes interaction supports ordinary undo", await page.evaluate(() => window.__GRAPHYSX__.query({ tag: "note-plate" }).filter(entity => entity.visible).length === 2));
  await page.click('[data-archive-action="add-note"]');
  await capture("notes-plates");

  await open("archive-cubz-tracks", "archive-cubz-tracks");
  await page.selectOption('[aria-label="Piste de rotation CubZ"]', "7");
  await page.click('[data-archive-action="rotate"]');
  await page.click('[data-archive-action="open-panels"]');
  await page.evaluate(() => { window.__GRAPHYSX__.pause(true); window.__GRAPHYSX__.step(2); });
  const opened = await page.evaluate(() => window.__GRAPHYSX_HOST__.world.getEntityObject("cubz-Right08").quaternion.toArray());
  check("CubZ plays source panel tracks on real 3D hierarchy", Math.abs(opened[1]) > .7);
  await capture("cubz-open");
  await page.click('[data-archive-action="close-panels"]');
  await page.evaluate(() => window.__GRAPHYSX__.step(2));
  check("CubZ reverse closes the same source range", await page.evaluate(() => Math.abs(window.__GRAPHYSX_HOST__.world.getEntityObject("cubz-Right08").quaternion.w - 1) < 1e-5));

  await open("archive-flightx", "archive-flightx");
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.world.getEntityObject("flight-plane-model")?.children.length > 0);
  await page.evaluate(() => window.__GRAPHYSX__.pause(true));
  const before = await page.evaluate(() => ({ revision: window.__GRAPHYSX__.state().revision, doc: JSON.stringify(window.__GRAPHYSX__.exportDocument()), x: window.__GRAPHYSX__.query({ ids: ["flight-plane"] })[0].position[0] }));
  await page.locator("canvas").first().click({ position: { x: 900, y: 600 } });
  await page.keyboard.down("w");
  await page.evaluate(() => window.__GRAPHYSX__.step(1));
  await page.keyboard.up("w");
  const after = await page.evaluate(() => ({ revision: window.__GRAPHYSX__.state().revision, doc: JSON.stringify(window.__GRAPHYSX__.exportDocument()), x: window.__GRAPHYSX__.query({ ids: ["flight-plane"] })[0].position[0] }));
  check("FlightX keyboard moves the actual plane without document churn", Math.abs(after.x - before.x - 18) < 1e-4 && after.revision === before.revision && after.doc === before.doc);
  await page.evaluate(() => window.__GRAPHYSX__.step(.5));
  check("FlightX release stops movement", await page.evaluate(x => Math.abs(window.__GRAPHYSX__.query({ ids: ["flight-plane"] })[0].position[0] - x) < 1e-5, after.x));
  await page.keyboard.down("w"); await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await page.keyboard.up("w");
  await page.evaluate(() => window.__GRAPHYSX__.step(.5));
  check("FlightX blur clears held controls", await page.evaluate(x => Math.abs(window.__GRAPHYSX__.query({ ids: ["flight-plane"] })[0].position[0] - x) < 1e-5, after.x));
  await page.click('[data-archive-action="follow"]');
  await capture("flightx-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".gx-archive-workbench summary").click();
  // The already open desktop details is now collapsed; open it to inspect the mobile controls.
  if (!(await page.locator(".gx-archive-workbench").evaluate(element => element.open))) await page.locator(".gx-archive-workbench summary").click();
  const bounds = await page.locator(".gx-archive-workbench").boundingBox();
  check("mobile source controls fit the viewport", bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const touchControl = page.locator('[data-archive-action="KeyW"]');
  await touchControl.scrollIntoViewIfNeeded();
  await touchControl.hover(); await page.mouse.down();
  await page.evaluate(() => window.__GRAPHYSX__.step(.5));
  await page.mouse.up();
  check("mobile hold control pilots through the same API", await page.evaluate(x => window.__GRAPHYSX__.query({ ids: ["flight-plane"] })[0].position[0] > x + 8.9, after.x));
  await capture("flightx-mobile");
  check("mobile chase camera keeps the plane centered", await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__, plane = host.world.getEntityObject("flight-plane");
    const screen = plane.getWorldPosition(host.camera.position.clone()).project(host.camera);
    return Math.abs(screen.x) < .3 && Math.abs(screen.y) < .5;
  }));
  await page.click(".gx-ed-exit");
  check("leaving an archive world disposes its controls", await page.locator(".gx-archive-workbench").count() === 0);
  check("no browser or asset failures", errors.length === 0 && failed.length === 0 && responses.length === 0);
  console.log("Archive worlds smoke passed");
} finally {
  writeFileSync(path.join(artifacts, "archive-worlds-diagnostics.json"), JSON.stringify({ errors, failed, responses }, null, 2));
  await browser.close();
}

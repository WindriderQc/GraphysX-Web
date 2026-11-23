import { enterCompleteStudio, waitForStoredScene } from "./studio-smoke-helpers.mjs";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchSmokeBrowser, applySmokeTimeout } from "./smoke-harness.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4210/";
const output = path.resolve(process.env.SMOKE_ARTIFACTS || "output/playwright/maison");
await mkdir(output, { recursive: true });
const browser = await launchSmokeBrowser(), receipts = [];
let activePage, activeErrors;
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
const phase = (page, value) => page.waitForFunction(value => JSON.parse(window.render_game_to_text?.() || "{}").application?.phase === value, value);
const ready = async page => { await phase(page, "visit"); assert.equal((await state(page)).ready, true); };
const capture = (page, name) => page.screenshot({ path: path.join(output, "maison-" + name + ".png") });
const canonical = document => ({ ...document, entities: [...document.entities].sort((a, b) => a.id.localeCompare(b.id)) });
const errorsFor = page => {
  const errors = []; activePage = page; activeErrors = errors;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(response.status() + " " + response.url()); });
  page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.push(request.failure()?.errorText + " " + request.url()); });
  return errors;
};
const layout = page => page.evaluate(() => {
  const card = document.querySelector(".gx-maison-card").getBoundingClientRect();
  const header = [...document.querySelectorAll(".gx-maison-header button")].map(element => {
    const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, hit: element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
  });
  return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth,
    card: { x: card.x, y: card.y, right: card.right, bottom: card.bottom }, header };
});
const assertLayout = async page => {
  const value = await layout(page); assert.equal(value.overflow, 0);
  assert.ok(value.card.x >= 0 && value.card.right <= value.width && value.card.y >= 60 && value.card.bottom <= value.height);
  assert.ok(value.header.every(button => button.height >= 44 && button.width >= 44 && button.hit));
  for (const selector of ["[data-maison-view=kitchen]", "[data-maison-light=night]", "[data-maison-tour]", "[data-maison-next]", ".gx-maison-sources summary"]) {
    const button = page.locator(selector); await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox(); assert.ok(box.height >= 44 && box.width >= 44);
    assert.equal(await button.evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), true, selector + " must be reachable");
  }
  await page.locator(".gx-maison-card").evaluate(element => { element.scrollTop = 0; });
  return value;
};
const houseVisible = async page => {
  const value = await page.evaluate(() => {
    const host = window.__GRAPHYSX_HOST__, model = host.world.getEntityObject("maison-source-model");
    const min = host.camera.position.clone().set(Infinity, Infinity, Infinity), max = min.clone().set(-Infinity, -Infinity, -Infinity);
    model.updateWorldMatrix(true, true);
    model.traverse(mesh => {
      if (!mesh.isMesh) return; mesh.geometry.computeBoundingBox(); const b = mesh.geometry.boundingBox;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        const point = min.clone().set(x, y, z).applyMatrix4(mesh.matrixWorld); min.min(point); max.max(point);
      }
    });
    const center = min.clone().add(max).multiplyScalar(.5).project(host.camera);
    const x = (center.x + 1) * innerWidth / 2, y = (1 - center.y) * innerHeight / 2;
    return { ndc: center.toArray(), x, y, hit: document.elementFromPoint(x, y)?.tagName };
  });
  assert.ok(value.ndc.every(number => number > -1 && number < 1));
  assert.equal(value.hit, "CANVAS", "House must be drawn outside opaque visit controls"); return value;
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "no-preference", acceptDownloads: true });
  const page = applySmokeTimeout(await context.newPage()), errors = errorsFor(page);
  await page.goto(new URL("?intro=0", base).href); await page.locator(".gx-welcome--center").waitFor();
  await page.click(".gx-go-archive"); await page.click('[data-scene-id="archive-maison"]'); await ready(page);
  assert.equal(new URL(page.url()).searchParams.get("app"), "maison");
  await page.click("[data-maison-next]"); await page.waitForFunction(() => !window.__GRAPHYSX_HOST__.focusing);
  assert.equal(await page.evaluate(() => window.__GRAPHYSX_HOST__.autoRotating), false, "Gallery entry must use the visit camera policy");
  await page.click("[data-maison-view=kitchen]");
  assert.equal(new URL(page.url()).searchParams.get("view"), "kitchen");
  await page.reload(); await ready(page); assert.equal((await state(page)).view, "kitchen");
  await page.click("[data-maison-view=house]");
  const native = await page.evaluate(() => ["maison-source-model", "cuisine-model"].map(id => {
    const api = window.__GRAPHYSX__, object = window.__GRAPHYSX_HOST__.world.getEntityObject(id), model = api.query({ ids: [id] })[0];
    let meshes = 0, triangles = 0; object.traverse(child => { if (child.isMesh) { meshes++; triangles += (child.geometry.index?.count ?? child.geometry.attributes.position.count) / 3; } });
    return { id, meshes, triangles, slots: model.materialSlots.length, materials: model.materialSlots.map(slot => ({ type: slot.materialType, emission: slot.emissiveIntensity })) };
  }));
  assert.deepEqual(native.map(model => [model.meshes, model.slots]), [[24, 24], [76, 76]]);
  for (const model of native) { assert.ok(model.triangles > 100); assert.ok(model.materials.every(material => material.type === "phong" && material.emission === 0)); }
  await assertLayout(page); await houseVisible(page); await capture(page, "house-day-desktop");
  const initial = await page.evaluate(() => window.__GRAPHYSX__.exportDocument());
  await page.click("[data-maison-tour]"); await phase(page, "tour");
  await page.waitForFunction(before => JSON.parse(window.render_game_to_text()).application.camera.position.some((number, index) => Math.abs(number - before[index]) > .1), (await state(page)).camera.position);
  await page.click("[data-maison-pause]"); await phase(page, "paused");
  const paused = (await state(page)).camera.position; await page.waitForTimeout(350); assert.deepEqual((await state(page)).camera.position, paused);
  await page.click("[data-maison-pause]"); await phase(page, "tour"); await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await phase(page, "paused");
  await page.click("[data-maison-tour]"); await phase(page, "visit");
  await page.click("[data-maison-tour]"); await phase(page, "tour");
  await page.mouse.move(1100, 250); await page.mouse.down(); await page.mouse.move(1140, 270); await page.mouse.up(); await phase(page, "visit");
  assert.match((await state(page)).notice, /caméra/);
  await page.click("[data-maison-recenter]"); await page.click("[data-maison-tour]"); await phase(page, "tour"); await phase(page, "visit");
  assert.match((await state(page)).notice, /terminée/);
  assert.deepEqual(canonical(await page.evaluate(() => window.__GRAPHYSX__.exportDocument())), canonical(initial), "The complete guided ride authors no objects or materials");
  for (let index = 0; index < 3; index++) {
    if (index) { await page.click("[data-maison-next]"); await page.waitForFunction(() => !window.__GRAPHYSX_HOST__.focusing); }
    const projected = await houseVisible(page);
    if (index === 2) {
      const brightness = await page.evaluate(({ x, y }) => new Promise(resolve => {
        const host = window.__GRAPHYSX_HOST__, off = host.subscribeAfterRender(() => {
          off(); const canvas = document.createElement("canvas"); canvas.width = innerWidth; canvas.height = innerHeight;
          const context = canvas.getContext("2d"); context.drawImage(host.renderer.domElement, 0, 0, innerWidth, innerHeight);
          const pixels = context.getImageData(Math.round(x) - 2, Math.round(y) - 2, 5, 5).data;
          let sum = 0; for (let offset = 0; offset < pixels.length; offset += 4) sum += (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
          resolve(sum / 25);
        });
      }), projected);
      assert.ok(brightness > 45, "The actual rear face must remain readable after emission normalization, brightness=" + brightness);
    }
    await capture(page, "house-stop-" + index);
  }
  await page.click("[data-maison-light=night]"); await capture(page, "house-night-desktop");
  await page.click("[data-maison-view=kitchen]");
  for (let index = 0; index < 3; index++) {
    if (index) { await page.click("[data-maison-next]"); await page.waitForFunction(() => !window.__GRAPHYSX_HOST__.focusing); }
    // OrbitControls recomposes spherical coordinates: compare at 12 decimal places,
    // well beyond the six decimals of the source position, not its incidental float bits.
    assert.equal(Number((await state(page)).camera.position[0].toFixed(12)), -3.002289); await capture(page, "kitchen-stop-" + index);
  }
  const authored = await page.evaluate(() => {
    const api = window.__GRAPHYSX__, model = api.query({ ids: ["cuisine-model"] })[0], slot = model.materialSlots[0];
    const result = api.update(model.id, { label: "My kitchen variant", modelMaterialOverrides: { ...model.modelMaterialOverrides, [slot.id]: { color: "#d8b078", emissive: "#123456", emissiveIntensity: .15 } } });
    if (!result.ok) throw new Error(result.error);
    const added = api.spawn({ id: "my-house-addition", type: "box", visible: false, label: "My kept addition" }); if (!added.ok) throw new Error(added.error);
    return api.exportDocument();
  });
  await page.click("[data-maison-view=house]"); await page.click("[data-maison-view=kitchen]");
  await page.click("[data-maison-light=day]"); await page.click("[data-maison-light=night]");
  assert.deepEqual(canonical(await page.evaluate(() => window.__GRAPHYSX__.exportDocument())), canonical(authored));
  await page.locator(".gx-maison-sources summary").click();
  const popupEvent = page.waitForEvent("popup"); await page.locator("[data-maison-source]").click(); const source = applySmokeTimeout(await popupEvent);
  await source.waitForFunction(() => window.__GRAPHYSX__?.state().world.id === "archive-maison-explorer");
  assert.equal(await source.locator(".gx-archive-workbench").isVisible(), true); await source.close();
  assert.deepEqual(canonical(await page.evaluate(() => window.__GRAPHYSX__.exportDocument())), canonical(authored));
  await page.click("[data-maison-studio]"); await enterCompleteStudio(page); await page.locator(".gx-ed-toolbar").waitFor();
  assert.equal(await page.locator(".gx-maison").count(), 0);
  assert.deepEqual(canonical(await page.evaluate(() => window.__GRAPHYSX__.exportDocument())), canonical(authored));
  page.once("dialog", dialog => dialog.accept("Maison visit variant"));
  await page.locator(".gx-ed-toolbar").getByRole("button", { name: "Save", exact: true }).click();
  await waitForStoredScene(page, "Maison visit variant");
  const downloaded = page.waitForEvent("download"); await page.locator(".gx-ed-toolbar").getByRole("button", { name: "Export", exact: true }).click();
  const file = path.join(output, "maison-variant.json"); await (await downloaded).saveAs(file);
  assert.deepEqual(canonical(JSON.parse(await readFile(file, "utf8"))), canonical(authored));
  await page.goto(new URL("?host=editor&paused=1&localScene=Maison%20visit%20variant", base).href);
  await page.waitForFunction(() => window.__GRAPHYSX__?.query({ ids: ["my-house-addition"] }).length === 1);
  assert.deepEqual(canonical(await page.evaluate(() => window.__GRAPHYSX__.exportDocument())), canonical(authored));
  assert.deepEqual(errors, []); receipts.push({ device: "desktop", native, catalogueEntryRefresh: true, guidePauseBlurManualCompletion: true, sourceComparison: true, saveExportReload: true, errors });
  await context.close(); console.log("PASS Maison: native geometry, all views, real tour/pause/manual/blur/completion, retained edits and Studio/save/export/reload.");

  for (const [width, height] of [[390, 844], [320, 640], [844, 390]]) {
    const page = applySmokeTimeout(await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" })), errors = errorsFor(page);
    await page.goto(new URL("?app=maison&intro=0", base).href); await ready(page);
    const bounds = await assertLayout(page), projected = await houseVisible(page);
    await capture(page, "house-" + width);
    await page.click("[data-maison-tour]"); assert.equal((await state(page)).point, 1); assert.equal((await state(page)).camera.moving, false);
    await page.click("[data-maison-recenter]");
    await page.click("[data-maison-light=night]"); await capture(page, "house-night-" + width);
    await page.click("[data-maison-view=kitchen]"); await capture(page, "kitchen-night-" + width);
    await page.click("[data-maison-light=day]"); await capture(page, "kitchen-day-" + width);
    await assertLayout(page); assert.deepEqual(errors, []);
    receipts.push({ device: width + "x" + height, bounds, projected, reducedMotion: true, errors }); await page.close();
  }
  {
    const page = applySmokeTimeout(await browser.newPage({ reducedMotion: "reduce" })), errors = errorsFor(page);
    await page.goto(new URL("?app=maison&intro=0", base).href); await ready(page);
    const replacement = await page.evaluate(() => {
      const result = window.__GRAPHYSX__.create({ schema: "graphysx.agent-world/v2", id: "my-foreign-world", label: "My separate scene", entities: [{ id: "keep-foreign-box", type: "box" }] });
      return { ok: result.ok, error: result.error };
    });
    assert.equal(replacement.ok, true, replacement.error);
    await phase(page, "foreign"); assert.equal(await page.locator("[data-maison-view=house]").isDisabled(), true);
    await page.click("[data-maison-studio]"); await enterCompleteStudio(page); await page.locator(".gx-ed-toolbar").waitFor();
    assert.equal(await page.evaluate(() => window.__GRAPHYSX__.state().world.id), "my-foreign-world");
    assert.deepEqual(errors, []); receipts.push({ device: "foreign-world", preserved: true, errors }); await page.close();
  }
  {
    const page = applySmokeTimeout(await browser.newPage({ reducedMotion: "reduce" })), pageErrors = [], failures = []; let refuse = true;
    activePage = page; activeErrors = pageErrors; page.on("pageerror", error => pageErrors.push(error.message));
    await page.route("**/assets/ports/archive-maison.json*", route => {
      if (refuse) { failures.push(route.request().url()); return route.fulfill({ status: 503, contentType: "application/json", body: "{}" }); }
      return route.continue();
    });
    await page.goto(new URL("?app=maison&intro=0", base).href); await phase(page, "error");
    assert.ok(failures.length); assert.equal(await page.locator("[data-maison-retry]").isVisible(), true);
    await page.evaluate(() => window.__GRAPHYSX__.spawn({ id: "keep-after-failure", type: "box", visible: false }));
    refuse = false; await page.click("[data-maison-retry]"); await ready(page);
    assert.equal(await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["keep-after-failure"] }).length), 1);
    assert.deepEqual(pageErrors, []); receipts.push({ device: "recoverable-503", intentionalFailures: failures.length, retryPreservesEdits: true, pageErrors }); await page.close();
  }
  await writeFile(path.join(output, "maison-receipt.json"), JSON.stringify(receipts, null, 2));
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await capture(activePage, "failure");
    await writeFile(path.join(output, "maison-failure.json"), JSON.stringify({ message: String(error), errors: activeErrors,
      state: await activePage.evaluate(() => JSON.parse(window.render_game_to_text?.() || "{}")), layout: await layout(activePage).catch(() => null) }, null, 2));
  }
  throw error;
} finally { await browser.close(); }

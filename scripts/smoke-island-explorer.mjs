import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";
import { startWorldServer } from "../world-service/server.mjs";

// An isolated real world, no model or installed service. Run under the native
// verify lock and the instance heavy-work queue when used on a shared host.
const artifacts = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(artifacts, { recursive: true });
const scratch = mkdtempSync(path.join(tmpdir(), "island-explorer-"));
let server, world, browser;
const errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
try {
  await build({ configFile: path.resolve("vite.world-service.config.ts"), root: path.resolve("."), build: { outDir: path.join(scratch, "bundle"), emptyOutDir: true }, logLevel: "silent" });
  const module = await import(pathToFileURL(path.join(scratch, "bundle/world.js")).href);
  world = await startWorldServer({ module, world: "living-island", port: 0, operatorToken: "test-operator", recordDir: path.join(scratch, "recording") });
  const native = world.world;
  const { session } = native.join("Eko");
  const walk = target => {
    native.apply(session, { type: "MoveTo", data: { position: target } });
    for (let tick = 0; tick < 480; tick++) {
      native.step();
      const p = native.observe(session).player.position;
      if (Math.hypot(p[0] - target[0], p[2] - target[2]) < 0.6) return;
    }
    throw new Error("scripted gardener could not reach its target");
  };
  walk([-8, 2.55, 12.5]);
  assert.equal(native.apply(session, { type: "GatherSeed", data: { position: [-8, 0, 15] } }), "GatherSeedSuccess");
  walk([-2, 2.55, 10]);
  assert.equal(native.apply(session, { type: "Sow", data: { position: [-2, 0, 12] } }), "SowSuccess");
  server = await startStaticServer({ root: path.resolve("dist"), port: 0 });
  browser = await launchSmokeBrowser();
  const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }));
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${server.url}/?app=island&source=${encodeURIComponent(world.url)}&agent=Eko&dashboard=${encodeURIComponent("https://dashboard.example/benchmark/island")}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application?.explorer?.counts?.trees === 6);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application.camera.focusing === false);
  assert.equal((await state(page)).world.label, "Living island");
  assert.equal(await page.locator('[data-ix-world]').textContent(), "Île vivante");
  assert.equal((await state(page)).explorer.counts.birds, 29);
  const before = await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.export()));
  await page.screenshot({ path: path.join(artifacts, "island-explorer-overview.png") });

  await page.locator('[data-ix-category="trees"]').first().click();
  await page.locator('[data-ix-select="tree_6"]').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application.explorer.selected === "tree_6");
  assert.match(await page.locator('[data-ix-content]').textContent(), /Tree_2/);
  assert.equal(await page.locator('[data-ix-content] h4', { hasText: "Gènes exprimés" }).count(), 1);
  await page.screenshot({ path: path.join(artifacts, "island-explorer-tree-lineage.png") });
  await page.locator('[data-ix-select="tree_2"]').first().click();
  assert.equal((await state(page)).explorer.selected, "tree_2");
  await page.locator('[data-ix-home]').click();
  await page.locator('[data-ix-category="birds"]').click();
  await page.locator('[data-ix-select="flock_1"]').click();
  assert.equal(await page.locator('[data-ix-select^="flock_1:bird:"]').count(), 28);
  await page.locator('[data-ix-select="flock_1:bird:0"]').click();
  assert.match(await page.locator('[data-ix-content]').textContent(), /Numéro dans la volée/);

  await page.locator('[data-ix-home]').click();
  await page.locator('[data-ix-category="objects"]').click();
  await page.locator('[data-ix-select="rock_1"]').click();
  await page.locator('[data-ix-focus]').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application.camera.focusing === false);
  await page.locator('[data-ix-category="objects"]').click();
  assert.equal((await state(page)).explorer.selected, null);
  await page.mouse.click(720, 450);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application.explorer.selected === "rock_1");
  assert.equal(await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.export())), before, "exploration never changes the authored document");

  // Source changes must clear the prior world's selection and living categories.
  const changed = await fetch(`${world.url}/world`, { method: "POST", headers: { "content-type": "application/json", "x-operator-token": "test-operator" }, body: JSON.stringify({ world: "mesa-island", force: true }) });
  assert.equal(changed.status, 200);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application.explorer.counts.trees === 0);
  assert.equal((await state(page)).explorer.selected, null);
  assert.equal(await page.locator('[data-ix-world]').textContent(), "Île Mesa");
  await page.locator('[data-ix-category="trees"]').click();
  assert.match(await page.locator('[data-ix-content]').textContent(), /Aucun élément/);
  await page.close();

  // Phone: the explorer is a dismissible sheet, leaving the camera usable.
  const phone = applySmokeTimeout(await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }));
  phone.on("pageerror", e => errors.push(String(e)));
  await phone.goto(`${server.url}/?app=island&source=${encodeURIComponent(world.url)}&embed=1`, { waitUntil: "domcontentloaded" });
  await phone.waitForFunction(() => JSON.parse(window.render_game_to_text()).application?.explorer?.items > 0);
  await phone.waitForFunction(() => JSON.parse(window.render_game_to_text()).application.camera.focusing === false);
  assert.equal((await state(phone)).explorer.open, false);
  await phone.getByRole("button", { name: "Explorer l’île" }).click();
  assert.equal(await phone.locator('.gx-island-explorer').isVisible(), true);
  assert.equal(await phone.locator('.gx-island-panel').isVisible(), false);
  await phone.locator('[data-ix-category="terrain"]').click();
  assert.ok(await phone.locator('[data-ix-content]').evaluate(node => node.scrollTop < 2), "new category starts at its heading");
  await phone.screenshot({ path: path.join(artifacts, "island-explorer-phone.png") });
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await phone.getByRole("button", { name: "Fermer l’explorateur" }).click();
  assert.equal(await phone.locator('.gx-island-panel').isVisible(), true);
  await phone.close();
  assert.deepEqual(errors, []);
  writeFileSync(path.join(artifacts, "island-explorer-result.json"), JSON.stringify({ passed: true, screenshots: 3, errors, coverage: ["all categories", "tree lineage and expressed genes", "individual birds", "real 3D click", "authored document unchanged", "world switch and empty category", "mobile sheet and overflow"] }, null, 2));
  console.log("ok: island explorer — categories, lineage, birds, 3D selection, world change, desktop and phone; no document mutation");
} finally {
  await browser?.close();
  await world?.close();
  await server?.close();
  rmSync(scratch, { recursive: true, force: true });
}

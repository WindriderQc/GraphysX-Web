import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

// DiskX against its recorded AgentX Data capture: the city must stand, be made of ordinary
// entities, and answer a real 3D click the same way its HUD list does. No LAN, no AgentX.
const artifacts = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(artifacts, { recursive: true });
const server = process.env.SMOKE_BASE ? null : await startStaticServer({ root: path.resolve("dist"), port: 0 });
const base = process.env.SMOKE_BASE || server.url;
const browser = await launchSmokeBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  applySmokeTimeout(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}?app=diskx&source=fixture`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Vos disques/, exact: false }).waitFor();
  await page.waitForFunction(() => {
    const text = JSON.parse(window.render_game_to_text());
    return text.application?.application === "diskx" && text.application.source === "fixture" && text.application.districts.length >= 3;
  });

  const initial = await page.evaluate(() => {
    const text = JSON.parse(window.render_game_to_text());
    const api = window.__GRAPHYSX__;
    const state = api.state();
    return {
      app: text.application,
      world: state.world,
      entityCount: state.entities.length,
      districtEntities: api.query({ tag: "diskx-district" }).map((entity) => ({ id: entity.id, type: entity.type, tags: entity.tags })),
      bloom: api.state().environment?.post?.bloom ?? null,
    };
  });
  assert.equal(initial.app.focus.path, "diskx://all");
  assert.deepEqual(initial.app.crumbs, ["diskx://all"]);
  assert.equal(initial.app.districts.filter((district) => !district.path.startsWith("diskx://free/")).length, 2, "one district per scanned disk");
  assert.ok(initial.world.id === "diskx-city", `world is the DiskX city, got ${initial.world.id}`);
  assert.ok(initial.entityCount > 20, "lights, kerbs, districts, caps, rims and roof buildings");
  assert.ok(initial.districtEntities.every((entity) => entity.type === "box" && entity.tags.some((tag) => tag.startsWith("diskx-path:/mnt/") || tag.startsWith("diskx-path:diskx://free/"))), "districts are plain boxes carrying their folder (or volume) path in tags");
  assert.ok(initial.bloom && initial.bloom.strength > 0, "the city declares bloom through the ordinary environment block");
  // Free space: the fixture carries the pool measured on UGFrank, drawn once beside the disks.
  const freeTiles = await page.evaluate(() => window.__GRAPHYSX__.query({ tag: "diskx-free" }).map((entity) => ({ id: entity.id, label: entity.label, opacity: entity.material.opacity })));
  assert.equal(freeTiles.length, 1, "one free tile for the one volume");
  assert.ok(freeTiles[0].opacity < 1 && /libre/.test(freeTiles[0].label), `free tile is translucent and says libre: ${JSON.stringify(freeTiles[0])}`);
  const gauge = await page.locator(".gx-diskx-gauge .free").textContent();
  assert.match(gauge, /To libres$/, `the volume gauge shows free terabytes, got ${gauge}`);
  assert.equal(initial.app.volumes.length, 1);
  console.log(`ok: ${initial.entityCount} entities, districts ${initial.app.districts.map((d) => d.name).join(", ")}`);
  await page.screenshot({ path: path.join(artifacts, "diskx-all-disks.png") });

  // Real 3D click on the largest district: the pointer lands on the projected roof centre.
  const target = initial.app.districts.find((district) => district.path === "/mnt/media") ?? initial.app.districts[0];
  assert.ok(target.screen, "the target district projects on screen");
  await page.mouse.move(target.screen[0], target.screen[1]);
  await page.waitForFunction((expected) => JSON.parse(window.render_game_to_text()).application.hovered === expected, target.path);
  const hoverCard = await page.locator(".gx-diskx-card h3").textContent();
  assert.equal(hoverCard, `${target.name}/`, "hover card names the folder under the pointer");
  await page.mouse.click(target.screen[0], target.screen[1]);
  await page.waitForFunction((expected) => {
    const app = JSON.parse(window.render_game_to_text()).application;
    return app.focus.path === expected && !app.pendingDive && app.districts.length > 0;
  }, target.path);
  const dived = await page.evaluate(() => {
    const app = JSON.parse(window.render_game_to_text()).application;
    const api = window.__GRAPHYSX__;
    return { app, label: api.state().world.label, districtCount: api.query({ tag: "diskx-district" }).length, crumbText: document.querySelector("[data-crumbs]")?.textContent ?? "" };
  });
  assert.deepEqual(dived.app.crumbs, ["diskx://all", target.path]);
  assert.ok(dived.label.endsWith(target.name), `world label follows the focus: ${dived.label}`);
  assert.equal(dived.districtCount, dived.app.districts.length);
  assert.ok(dived.crumbText.includes(target.name), "breadcrumb shows the dive");
  assert.ok(dived.app.districts.every((district) => district.path.startsWith(`${target.path}/`) || district.path === "diskx://rest"), "every district is a child of the focus");
  console.log(`ok: dived into ${target.path} with ${dived.app.districts.length} districts`);
  await page.screenshot({ path: path.join(artifacts, "diskx-dived.png") });

  // HUD parity: the folder list makes the same dive a click does.
  const second = dived.app.districts.find((district) => district.path !== "diskx://rest" && district.totalFiles > 0 && district.path.split("/").length > 3);
  if (second) {
    await page.locator(`[data-list] button[data-path="${second.path}"]`).click();
    await page.waitForFunction((expected) => {
      const app = JSON.parse(window.render_game_to_text()).application;
      return app.focus.path === expected && !app.pendingDive;
    }, second.path);
    console.log(`ok: list dive into ${second.path}`);
    await page.keyboard.press("Escape");
    await page.waitForFunction((expected) => JSON.parse(window.render_game_to_text()).application.focus.path === expected, target.path);
    console.log("ok: Escape climbs one level");
  }

  await page.getByRole("button", { name: "↑ Remonter", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).application.focus.path === "diskx://all");
  const totals = await page.locator("[data-totals] strong").first().textContent();
  assert.match(totals, /To$/, `the top level is measured in terabytes, got ${totals}`);
  console.log("ok: back at the top level, totals in To");

  // Leaving clears the query string, which reloads the page; the predicate must not throw while
  // the new document is still booting and has no render_game_to_text yet.
  await page.getByRole("button", { name: "Quitter DiskX", exact: true }).click();
  await page.waitForFunction(() => !window.location.search && typeof window.render_game_to_text === "function"
    && JSON.parse(window.render_game_to_text()).application === null);
  console.log("ok: Center return");

  assert.deepEqual(errors, [], `console/page errors: ${errors.join("\n")}`);
  console.log("diskx: PASS");
} finally {
  await browser.close();
  await server?.close();
}

import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

// NetX, the home network as a neighbourhood: the synthetic capture stands as tagged entities on
// their rings, the HUD says Data's freshness and counts, the Toolbox filters and search hide
// devices without touching the document, a real 3D click frames a device, Escape returns.
// No LAN, no AgentX: the static build has no relay, so the capture is what opens.
const artifacts = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(artifacts, { recursive: true });
const server = process.env.SMOKE_BASE ? null : await startStaticServer({ root: path.resolve("dist"), port: 0 });
const base = process.env.SMOKE_BASE || server.url;
const browser = await launchSmokeBrowser();
const app = () => (typeof window.render_game_to_text === "function" ? JSON.parse(window.render_game_to_text()).application : null);
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  applySmokeTimeout(page);
  const errors = [];
  const failedAssets = [];
  const relayCalls = [];
  page.on("response", (response) => { if (response.status() >= 400 && new URL(response.url()).pathname.startsWith("/assets/")) failedAssets.push(`${response.status()} ${response.url()}`); });
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/diskx-api/")) relayCalls.push(new URL(request.url()).pathname); });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", (route) => (new URL(route.request().url()).origin !== new URL(base).origin ? route.abort() : route.continue()));
  await page.goto(`${base}?app=netx`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: /Le réseau/ }).waitFor();
  await page.waitForFunction(`(${app})()?.application === "netx" && (${app})().source === "fixture" && (${app})().devices.length === 55 && (${app})().loading === false`);

  const initial = await page.evaluate(() => {
    const text = JSON.parse(window.render_game_to_text());
    const api = window.__GRAPHYSX__;
    const principals = api.query({ tag: "netx-device" });
    return { app: text.application, world: api.state().world, entityCount: api.state().entities.length,
      devices: principals.map((entity) => ({ id: entity.id, type: entity.type, tags: entity.tags, position: entity.position })),
      online: api.query({ tag: "netx-state:online" }).filter((entity) => entity.tags.includes("netx-device")).length,
      collectors: api.query({ tag: "netx-collector" }).map((entity) => entity.tags.find((tag) => tag.startsWith("netx-collector:"))),
      beams: api.state().entities.filter((entity) => entity.id.endsWith("-beam")).length,
      bloom: api.state().environment?.post?.bloom ?? null };
  });
  assert.equal(initial.world.id, "agentx-netx");
  assert.equal(initial.devices.length, 55, "one principal entity per device of the capture");
  assert.equal(initial.online, 31, "31 devices on the online ring, as the capture");
  assert.ok(initial.entityCount > 200, "lights, rings, hub, lighthouses, bodies, parts, halos, cages");
  assert.ok(initial.devices.every((entity) => entity.tags.some((tag) => tag.startsWith("netx-device:")) && ["box", "cylinder"].includes(entity.type)), "devices carry their key and are plain primitives");
  assert.deepEqual(initial.collectors.sort(), ["netx-collector:ugalien", "netx-collector:ugbrutal", "netx-collector:ugfrank"]);
  assert.equal(initial.beams, 1, "only the live collector sweeps a beam");
  assert.ok(initial.bloom && initial.bloom.strength > 0);
  assert.ok(initial.devices.every((entity) => !/192\.168\./.test(JSON.stringify(entity))), "no real address in the document");
  // Devices on the online ring stand at that radius (the stacked second MAC steps outward).
  const onlineRadii = initial.devices.filter((entity) => entity.tags.includes("netx-state:online")).map((entity) => Math.hypot(entity.position[0], entity.position[2]));
  assert.ok(onlineRadii.every((radius) => radius >= 7.99 && radius <= 8.01 + 1.35 * 3), `online devices sit on the inner ring: ${onlineRadii.map((r) => r.toFixed(2)).join(",")}`);
  // The HUD says what Data says.
  assert.equal(initial.app.freshness.text, "Dernier scan il y a 7 min.");
  assert.deepEqual([initial.app.counts.online, initial.app.counts.recent, initial.app.counts.historical, initial.app.counts.never_confirmed, initial.app.counts.total], [31, 3, 21, 0, 55]);
  assert.match(initial.app.notice, /aucune adresse réelle/);
  assert.deepEqual(initial.app.collectors.map((collector) => collector.active), [true, false, false]);
  assert.equal(await page.locator(".gx-netx-tile[data-state=online] strong").textContent(), "31");
  assert.match(await page.locator("[data-freshness]").textContent(), /Dernier scan il y a 7 min/);
  assert.equal(await page.locator("[data-collectors] li").count(), 3);
  assert.equal(await page.locator("[data-list] li").count(), 55, "the HUD list shows every device when nothing filters");
  assert.deepEqual(relayCalls, ["/diskx-api/config"], "the static build asks the relay once and gets no relay");
  await page.screenshot({ path: path.join(artifacts, "netx-overview.png") });
  console.log(`ok: ${initial.entityCount} entities, ${initial.devices.length} devices, ${initial.online} online`);

  // Filters and search are presentation: devices hide, the list follows, the document never changes.
  const before = await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument()));
  await page.locator('[data-filters] button[data-filter="online"]').click();
  await page.waitForFunction(`(${app})().filter === "online" && (${app})().shown === 31`);
  const filtered = await page.evaluate(() => {
    const text = JSON.parse(window.render_game_to_text()).application;
    const hidden = text.devices.filter((device) => !device.shown);
    const api = window.__GRAPHYSX__;
    return { listRows: document.querySelectorAll("[data-list] li").length, hidden: hidden.length, hiddenStates: [...new Set(hidden.map((device) => device.state))].sort(),
      // state() mirrors the live scene (hidden objects read hidden); the document is what exportDocument says.
      documentHidden: api.exportDocument().entities.filter((entity) => entity.tags?.includes("netx-device") && entity.visible === false).length,
      sceneHidden: api.state().entities.filter((entity) => entity.tags?.includes("netx-device") && entity.visible === false).length };
  });
  assert.deepEqual([filtered.listRows, filtered.hidden, filtered.hiddenStates], [31, 24, ["historical", "recent"]]);
  assert.equal(filtered.sceneHidden, 24, "the scene hides the 24 excluded devices");
  assert.equal(filtered.documentHidden, 0, "hiding is presentation: the document still says every device is visible");
  assert.equal(await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument())), before, "a filter never edits the scene document");
  await page.screenshot({ path: path.join(artifacts, "netx-filter-online.png") });
  await page.locator('[data-filters] button[data-filter="unacknowledged"]').click();
  await page.waitForFunction(`(${app})().shown === 53`);
  await page.locator('[data-filters] button[data-filter="all"]').click();
  await page.waitForFunction(`(${app})().shown === 55`);
  await page.locator("[data-search]").fill("imprimante");
  await page.waitForFunction(`(${app})().search === "imprimante" && (${app})().shown === 2`);
  assert.deepEqual((await page.locator("[data-list] li b").allTextContents()).sort(), ["imprimante-fil", "imprimante-wifi"]);
  await page.locator("[data-search]").fill("");
  await page.waitForFunction(`(${app})().shown === 55`);
  console.log("ok: filters and search hide devices, list follows, document unchanged");

  // A real 3D click from the overview: the hub is the big target at the centre.
  await page.mouse.move(720, 450);
  await page.mouse.move(721, 451);
  const hubState = await page.evaluate(`(${app})()`);
  assert.equal(hubState.hovered, "hub", "the ray from the centre of the overview hits the hub");
  await page.mouse.click(721, 451);
  await page.waitForFunction(`(${app})().selected === "hub"`);
  assert.match(await page.locator(".gx-netx-card h3").textContent(), /Réseau · 192\.0\.2\.0\/24/);
  await page.keyboard.press("Escape");
  await page.waitForFunction(`(${app})().selected === null`);

  // The list frames a named device; a real 3D hover and click on the framed body pick the same device.
  await page.locator("[data-list] button", { hasText: "imprimante-wifi" }).click();
  await page.waitForFunction(`(${app})().selected !== null && (${app})().card && (${app})().card.includes("imprimante-wifi")`);
  await page.evaluate(() => window.advanceTime?.(1200));
  const state = await page.evaluate(`(${app})()`);
  const target = state.devices.find((device) => device.name === "imprimante-wifi");
  assert.ok(target?.screen, "imprimante-wifi projects on screen once framed");
  await page.mouse.move(target.screen[0], target.screen[1]);
  await page.waitForFunction(`(${app})().hovered === ${JSON.stringify(target.key)}`);
  assert.match(await page.locator(".gx-netx-card h3").textContent(), /imprimante-wifi/);
  await page.mouse.click(target.screen[0], target.screen[1]);
  await page.waitForFunction(`(${app})().selected === ${JSON.stringify(target.key)}`);
  assert.match(await page.locator(".gx-netx-card p").textContent(), /type « 3d-printer-controller » \(hors liste/, "the out-of-list type is named, not invented");
  assert.equal(await page.locator("[data-list] button[aria-current=true] b").textContent(), "imprimante-wifi", "the HUD list marks the selection");
  await page.screenshot({ path: path.join(artifacts, "netx-click-device.png") });
  await page.keyboard.press("Escape");
  await page.waitForFunction(`(${app})().selected === null`);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument())), before, "selecting never edits the document");
  console.log("ok: 3D click on the hub from the overview, list frames imprimante-wifi, 3D pick agrees, Escape returns");

  // Mobile: the HUD and the labels fit the phone.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  applySmokeTimeout(mobile);
  mobile.on("pageerror", (error) => errors.push(String(error)));
  await mobile.goto(`${base}?app=netx&source=fixture`, { waitUntil: "domcontentloaded" });
  await mobile.waitForFunction(`(${app})()?.application === "netx" && (${app})().devices.length === 55 && (${app})().loading === false`);
  const hud = await mobile.locator(".gx-netx-hud").boundingBox();
  assert.ok(hud && hud.x >= 0 && hud.x + hud.width <= 390 && hud.y + hud.height <= 844, `HUD fits the phone: ${JSON.stringify(hud)}`);
  await mobile.evaluate(() => window.advanceTime?.(500));
  const labels = await mobile.locator(".gx-netx-label, .gx-netx-ringtag").evaluateAll((elements) => elements
    .filter((element) => Number(getComputedStyle(element).opacity) > 0.1)
    .map((element) => { const rect = element.getBoundingClientRect(); return { text: element.textContent, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; }));
  assert.ok(labels.length > 0, "projected labels are visible on mobile");
  for (const label of labels) assert.ok(label.left >= 0 && label.right <= 390 && label.top >= 0 && label.bottom <= 844, `the whole mobile label fits: ${JSON.stringify(label)}`);
  await mobile.screenshot({ path: path.join(artifacts, "netx-mobile.png") });
  await mobile.close();

  // Quit returns to the front door.
  await page.locator('[data-action="exit"]').click();
  await page.waitForFunction(() => new URLSearchParams(window.location.search).get("app") === null);
  assert.deepEqual(errors, [], `no page errors: ${errors.join("\n")}`);
  assert.deepEqual(failedAssets, [], "the production build serves every requested asset");
  assert.ok(relayCalls.every((call) => call === "/diskx-api/config"), `the page never asks the relay for anything but its config: ${relayCalls.join(",")}`);
  console.log("netx smoke: PASS");
} finally {
  await browser.close();
  await server?.close();
}

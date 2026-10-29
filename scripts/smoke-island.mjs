import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

// L'île: the Clawblox island rendered in GraphysX's look. Without a Clawblox server the page
// plays its short real capture (fixture): 32 parts in one transient scope, the agent carrying a
// block, nothing in the authored document, the camera following the agent with free orbit, one
// collapsible panel, phone (375 px) and 4K layouts.
//
// ISLAND_SOURCES=http://host:18090,http://host:18086#spectator_token=… additionally opens each running Clawblox
// replay or live server and captures it (local evidence only; never part of CI).
const artifacts = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(artifacts, { recursive: true });
const server = process.env.SMOKE_BASE ? null : await startStaticServer({ root: path.resolve("dist"), port: 0 });
const base = process.env.SMOKE_BASE || server.url;
const sources = (process.env.ISLAND_SOURCES || "").split(",").map((s) => s.trim()).filter(Boolean);
const browser = await launchSmokeBrowser();
const app = () => (typeof window.render_game_to_text === "function" ? JSON.parse(window.render_game_to_text()).application : null);
const appState = (page) => page.evaluate(`(${app})()`);

async function open(viewport, query, options = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: options.reducedMotion ?? "no-preference" });
  applySmokeTimeout(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error" && !/WebSocket|ERR_CONNECTION/.test(message.text())) errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400 && new URL(response.url()).pathname.startsWith("/assets/")) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`${base}?app=island${query}${options.fragment ? `#${options.fragment}` : ""}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: /L.île/ }).waitFor();
  return { page, errors };
}

try {
  // ---- desktop, fixture --------------------------------------------------------------------
  const { page, errors } = await open({ width: 1440, height: 900 }, "");
  await page.waitForFunction(`(${app})()?.application === "island" && (${app})().parts === 32 && (${app})().snapshots > 3`);
  const first = await appState(page);
  assert.equal(first.mode, "fixture");
  assert.deepEqual(first.kinds, { water: 1, ground: 5, mesa: 11, pickup: 12, ring: 1, rock: 1, agent: 1 }, "every visible Clawblox part is drawn once; the four invisible walls are not");
  assert.equal(first.reconcileError, null);
  assert.equal(first.agent.name, "Eko");
  assert.equal(first.notice, "");
  const scene = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    return {
      parts: api.query({ tag: "island-part" }).length,
      authored: api.exportDocument().entities?.map((e) => e.id) ?? [],
      water: api.query({ type: "water" }).length,
      sky: api.state().environment?.sky ?? null,
    };
  });
  assert.equal(scene.parts, 43, "32 principals plus a grass cap on each of the 11 mesas");
  assert.deepEqual(scene.authored.sort(), ["island-ambient", "island-sun"], "Clawblox parts are transport state, never authored document");
  assert.equal(scene.water, 1);
  assert.equal(scene.sky, "clearblue");
  // The capture moves the agent across the island; positions sampled over time must differ.
  const seen = new Set();
  for (let i = 0; i < 12; i += 1) {
    const s = await appState(page);
    if (s.agent.position) seen.add(s.agent.position.join(","));
    await page.waitForTimeout(250);
  }
  assert.ok(seen.size >= 3, `the agent is drawn moving between ticks (${seen.size} poses)`);
  const messages = await page.locator(".gx-island-messages li").allTextContents();
  assert.ok(messages.some((text) => /Fixture line/.test(text)), "the agent's lines appear in the Messages panel");
  assert.ok(messages.some((text) => /exec_command/.test(text)), "tool calls are shown by their summary");
  assert.equal(await page.locator("[data-transport]").isHidden(), true, "no replay transport without a replay server");
  // Lean by default: no host display menu, no notice, one exit, and the camera on the agent.
  assert.equal(await page.locator(".gx-display-settings").isVisible().catch(() => false), false, "no host display menu over the island");
  assert.equal(await page.locator("[data-notice]").isVisible(), false, "the demonstration is said in the status line, not a banner");
  assert.equal(await page.locator(".gx-island-header button:visible").count(), 1, "only Quitter in the header");
  const follow = page.locator('[data-action="follow"]');
  assert.equal(await follow.getAttribute("aria-pressed"), "true", "the camera follows the agent by default");
  await page.waitForFunction(`(${app})()?.camera?.distanceToAgent < 60 && (${app})().camera.pivotToAgent < 3`);
  const near = await page.evaluate(() => JSON.parse(window.render_game_to_text()).application.camera);
  assert.ok(near.distanceToAgent < 60, `the camera came to the agent (${near.distanceToAgent})`);
  // Free orbit on drag while following: the view direction turns, the agent stays near the pivot.
  const box = await page.locator("canvas").first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const turned = await page.evaluate(() => JSON.parse(window.render_game_to_text()).application.camera);
  assert.ok(Math.abs(turned.azimuth - near.azimuth) > 0.15, `a drag orbits (${near.azimuth} -> ${turned.azimuth})`);
  assert.ok(turned.pivotToAgent < 3, `the pivot stays on the agent while following (${turned.pivotToAgent})`);
  assert.equal(await follow.getAttribute("aria-pressed"), "true");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${artifacts}/island-fixture-desktop.png` });
  // The panel folds on desktop too.
  await page.locator(".gx-island-panel summary").click();
  assert.equal(await page.locator(".gx-island-panel details").evaluate((d) => d.open), false);
  await page.locator(".gx-island-panel summary").click();
  await follow.click();
  assert.equal(await follow.getAttribute("aria-pressed"), "false", "a click frees the camera");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${artifacts}/island-fixture-overview.png` });
  assert.deepEqual(errors, []);
  await page.close();

  // ---- phone: folded bottom sheet, no horizontal scroll --------------------------------------
  const phone = await open({ width: 375, height: 812 }, "");
  await phone.page.waitForFunction(`(${app})()?.parts === 32`);
  const phoneLayout = await phone.page.evaluate(() => {
    const panel = document.querySelector(".gx-island-panel").getBoundingClientRect();
    const header = document.querySelector(".gx-island-header").getBoundingClientRect();
    return { open: document.querySelector(".gx-island-panel details").open, panelBottom: panel.bottom, panelWidth: panel.width,
      headerRight: header.right, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, innerHeight: window.innerHeight };
  });
  assert.equal(phoneLayout.open, false, "the panel starts folded on a phone");
  assert.ok(phoneLayout.scrollWidth <= phoneLayout.innerWidth, "no horizontal page scroll");
  assert.ok(phoneLayout.panelBottom <= phoneLayout.innerHeight && phoneLayout.panelWidth <= phoneLayout.innerWidth - 20);
  await phone.page.waitForFunction(`(${app})()?.camera?.pivotToAgent < 1.5 && (${app})().camera.distanceToAgent < 60`);
  await phone.page.screenshot({ path: `${artifacts}/island-fixture-phone.png` });
  await phone.page.locator(".gx-island-panel summary").click();
  await phone.page.waitForTimeout(300);
  await phone.page.screenshot({ path: `${artifacts}/island-fixture-phone-open.png` });
  assert.deepEqual(phone.errors, []);
  await phone.page.close();

  // ---- 4K kitchen screen: same layout, larger type -------------------------------------------
  const big = await open({ width: 3840, height: 2160 }, "");
  await big.page.waitForFunction(`(${app})()?.parts === 32`);
  const scale = await big.page.evaluate(() => getComputedStyle(document.querySelector(".gx-island")).getPropertyValue("--il-scale").trim());
  assert.equal(scale, "2", "4K doubles the HUD scale");
  await big.page.waitForTimeout(2000);
  await big.page.screenshot({ path: `${artifacts}/island-fixture-4k.png` });
  assert.deepEqual(big.errors, []);
  await big.page.close();

  // ---- embedded (Benchmark Île tab) ---------------------------------------------------------
  const embed = await open({ width: 960, height: 540 }, "&embed=1");
  await embed.page.waitForFunction(`(${app})()?.parts === 32`);
  assert.equal((await appState(embed.page)).embedded, true);
  assert.equal(await embed.page.getByRole("button", { name: "Quitter" }).isHidden(), true, "an embedded view has no exit");
  await embed.page.close();

  // ---- optional: real Clawblox servers ------------------------------------------------------
  for (const [index, source] of sources.entries()) {
    // A live world behind a spectator token: `http://host:18086#spectator_token=…`.
    const [origin, fragment] = source.split("#");
    const real = await open({ width: 1440, height: 900 }, `&source=${encodeURIComponent(origin)}`, { fragment });
    await real.page.waitForFunction(`(${app})()?.connected === true && (${app})().parts > 0 && ["live", "replay"].includes((${app})().mode)`);
    await real.page.waitForTimeout(4000);
    const s = await appState(real.page);
    console.log(`source ${source}: mode=${s.mode} parts=${s.parts} tick=${s.tick} messages=${s.messages}/${s.messageLog} agent=${JSON.stringify(s.agent)}`);
    if (s.mode === "replay") assert.equal(await real.page.locator("[data-transport]").isVisible(), true);
    await real.page.screenshot({ path: `${artifacts}/island-source-${index}-${s.mode}.png` });
    assert.deepEqual(real.errors, []);
    await real.page.close();
  }
  console.log("smoke-island: ok");
} finally {
  await browser.close();
  await server?.close();
}

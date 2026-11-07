import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4198/";
const art = process.env.SMOKE_ARTIFACTS || "output/ballsy-playtest";
mkdirSync(art, { recursive: true });
const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
applySmokeTimeout(page);
const errors = [], report = {};
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const state = () => page.evaluate(() => window.__BALLSY__.state());
const step = (ms = 0) => page.evaluate((n) => window.advanceTime(n), ms);
async function sample(slot, axes, brake = false) {
  await page.evaluate(({ slot, axes, brake }) => {
    const pad = window.setupPads[slot]; pad.axes = axes; pad.buttons[0] = { pressed: brake, value: Number(brake) };
  }, { slot, axes, brake });
  return step();
}
try {
  await page.addInitScript(() => {
    window.setupPads = [1, 3].map((index) => ({ index, id: `Synthetic standard controller ${index}`, connected: true, mapping: "standard", axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }));
    Object.defineProperty(navigator, "getGamepads", { value: () => [null, window.setupPads[0], null, window.setupPads[1]] });
  });
  await page.goto(new URL("ballsy.html?tool=shovel", base).href, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__BALLSY__);
  await step();
  // Native select keyboard behavior must work instead of being swallowed by racing keys.
  const mode = page.locator("[data-mode]");
  await mode.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  assert.equal((await state()).volcano.mode, "help");
  report.legacyKeyboardMode = "Native select keyboard changes the explicit shovel route to help";
  // The slime entry intentionally hides legacy lava choices. All controller preparation
  // and keyboard fallback assertions below exercise the current default entry.
  await page.goto(new URL("ballsy.html", base).href, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__BALLSY__); await step();
  assert.equal(await page.locator("[data-mode]").isHidden(), true);
  assert.equal((await state()).volcano.mode, "challenge");
  await page.getByRole("button", { name: "Tester les manettes", exact: true }).click();
  assert.equal((await state()).checkingPads, true);
  assert.deepEqual((await state()).slots, [1, 3]);
  assert.ok((await state()).padChecks.every((p) => !p.ready));
  for (let slot = 0; slot < 2; slot++) {
    for (const axes of [[-1, 0], [1, 0], [0, -1], [0, 1]]) await sample(slot, axes);
    assert.equal((await state()).padChecks[slot].centred, false);
    await sample(slot, [0, 0]);
    assert.match(await page.locator(`[data-pad-instruction="${slot}"]`).textContent(), /bouton du bas/);
    await sample(slot, [0, 0], true);
    assert.equal((await state()).padChecks[slot].ready, false);
    assert.equal(await page.locator(`[data-brake="${slot}"]`).getAttribute("data-pressed"), "true");
    await sample(slot, [0, 0]);
    assert.equal((await state()).padChecks[slot].ready, true);
    if (slot === 0) assert.equal((await state()).padChecks[1].ready, false, "one controller cannot qualify the other player");
  }
  // Start is a racing control, not an accidental way out of the preparation dialog.
  await page.evaluate(() => { window.setupPads[0].buttons[9] = { pressed: true, value: 1 }; }); await step();
  assert.equal((await state()).phase, "lobby");
  await page.evaluate(() => { window.setupPads[0].buttons[9] = { pressed: false, value: 0 }; }); await step();
  report.checked = await state();
  await page.screenshot({ path: path.join(art, "pad-check-ready.png") });
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Enregistrer le test", exact: true }).click();
  const receiptPath = path.join(art, "pad-check-receipt.json");
  await (await downloaded).saveAs(receiptPath);
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  assert.equal(receipt.schema, "ballsy-pad-check/v1");
  assert.ok(receipt.players.every((p) => p.ready));
  assert.deepEqual(receipt.players.map((p) => p.device.index), [1, 3]);
  assert.deepEqual(Object.keys(receipt).sort(), ["schema", "observedAt", "evidence", "browser", "secureContext", "players"].sort());
  assert.ok(!JSON.stringify(receipt).includes("Token") && !JSON.stringify(receipt).includes("roomId"));
  report.receipt = receipt;
  await page.getByRole("button", { name: "Revenir au jeu ↗", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), "save-pad-check");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), "close-pad-check");
  await page.evaluate(() => { window.setupPads[0].id = "Replacement controller in the same slot"; }); await step();
  assert.equal((await state()).padChecks[0].ready, false);
  assert.equal((await state()).padChecks[1].ready, true);
  await page.evaluate(() => { window.setupPads[0].connected = false; window.setupPads[1].mapping = ""; }); await step();
  assert.ok((await state()).padChecks.every((p) => !p.ready));
  assert.match(await page.locator("[data-pad-check-notice]").textContent(), /sans profil standard/);
  assert.deepEqual((await state()).slots, [1, 3]);
  report.layouts = [];
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 960, height: 540 }, { width: 390, height: 620 }]) {
    await page.setViewportSize(viewport);
    const box = await page.locator("[data-pad-test]").boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole("button", { name: "Revenir au jeu ↗", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(art, `pad-check-${viewport.width}.png`) });
    report.layouts.push({ viewport, box });
  }
  await page.keyboard.press("Escape");
  assert.equal((await state()).checkingPads, false);
  assert.equal((await state()).phase, "lobby");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: /C'est parti/ }).click(); await step(3100);
  const before = await state();
  await page.keyboard.down("ArrowRight"); await page.keyboard.down("KeyD"); await step(500);
  await page.keyboard.up("ArrowRight"); await page.keyboard.up("KeyD");
  report.keyboardFallback = await state();
  assert.equal(report.keyboardFallback.phase, "racing");
  assert.ok(report.keyboardFallback.players.every((p, i) => p.position[0] > before.players[i].position[0] + 0.3));
  await page.screenshot({ path: path.join(art, "pad-check-keyboard-race.png") });
  assert.deepEqual(errors, []);
  report.errors = errors;
  writeFileSync(path.join(art, "setup-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, verifiedPlayers: receipt.players.length, download: "local JSON without room credentials", keyboardFallback: true, errors }));
} finally { await browser.close(); }

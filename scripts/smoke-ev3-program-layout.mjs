import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";
import { createEv3ProgramStore, EV3_PROGRAM_NAME_MAX_LENGTH, EV3_PROGRAM_STORAGE_KEY } from "../src/ev3-first-program.ts";

// Persistence and replay have their own browser journey. Prepare the same saved
// records through the production serializer so this smoke can focus on layout
// and keyboard behavior without repeating the full storage workflow first.
let fixtureRaw = null;
let fixtureTime = 0;
const fixtureStore = createEv3ProgramStore(() => ({
  getItem: () => fixtureRaw,
  setItem: (_key, value) => { fixtureRaw = value; },
}), () => ++fixtureTime);
const longName = "My very long program name for First Drive".slice(0, EV3_PROGRAM_NAME_MAX_LENGTH);
for (const [name, blocks] of [
  ["Left turn", ["left"]],
  ["Blue target", ["forward", "forward", "forward"]],
  [longName, ["forward", "forward", "forward"]],
]) assert.equal(fixtureStore.save(name, blocks).ok, true);

export async function runProgramLayout({
  viewports,
  initialViewport = { width: 800, height: 480 },
  precedingViewport,
}) {
  const ART = process.env.SMOKE_ARTIFACTS || "output/verify";
  mkdirSync(ART, { recursive: true });
  let server;
  let browser;
  const errors = [];
  try {
    if (!process.env.SMOKE_BASE) server = await startStaticServer({ root: path.resolve("dist"), port: Number(process.env.SMOKE_PORT || 4573) });
    const base = process.env.SMOKE_BASE ?? server.url;
    browser = await launchSmokeBrowser();
    const page = await browser.newPage({ viewport: initialViewport });
    applySmokeTimeout(page);
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: EV3_PROGRAM_STORAGE_KEY, raw: fixtureRaw });
    await page.goto(base.replace(/\/$/, "") + "/?app=ev3-lab", { waitUntil: "domcontentloaded" });
    await page.locator("[data-ev3-programs]").waitFor();
    await page.evaluate(() => window.advanceTime(0));
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
    const programs = () => page.locator("[data-ev3-programs]").click();
    const name = page.getByLabel("Nom du programme", { exact: true });
    await programs();
    await page.getByRole("button", { name: "Ouvrir " + longName, exact: true }).click();
    await page.locator("[data-ev3-run]").click();
    const success = await page.evaluate(() => window.advanceTime(3000));
    assert.equal(success.mission.phase, "complete");
    assert.equal((await state()).program.library.savedName, longName);
    // Retain the desktop-to-landscape resize exercised by the original combined
    // journey even when compact viewports run in their own browser process.
    if (precedingViewport) {
      await page.setViewportSize(precedingViewport);
      await page.screenshot({ path: path.join(ART, "ev3-program-desktop-transition.png") });
    }
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await programs();
      const geometry = await page.locator("dialog").evaluate((element) => {
        const r = element.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, client: element.clientWidth, scroll: element.scrollWidth };
      });
      assert.ok(geometry.left >= 0 && geometry.right <= width && geometry.top >= 0 && geometry.bottom <= height);
      assert.ok(geometry.scroll <= geometry.client, JSON.stringify(geometry));
      const buttons = page.locator("dialog button:visible");
      for (let index = 0; index < await buttons.count(); index += 1) {
        const target = buttons.nth(index);
        await target.scrollIntoViewIfNeeded();
        assert.equal(await target.evaluate((element) => {
          const r = element.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return r.height >= (element.hasAttribute("data-program-close") ? 48 : 72)
            && (element === hit || element.contains(hit));
        }), true);
      }
      await name.focus();
      for (let index = 0; index < 14; index += 1) {
        await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog"))), true);
      }
      await page.locator("[data-program-close]").focus();
      await page.keyboard.press("Shift+Tab");
      assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog"))), true);
      await name.focus();
      await page.locator("dialog").evaluate((element) => { element.scrollTop = 0; });
      await page.waitForTimeout(1100);
      await page.screenshot({ path: path.join(ART, `ev3-program-library-${width}x${height}.png`) });
      await page.keyboard.press("Escape");
      assert.equal((await state()).program.library.open, false);
      assert.equal(await page.locator("[data-ev3-programs]").evaluate((element) => element === document.activeElement), true);
      await page.screenshot({ path: path.join(ART, `ev3-program-saved-${width}x${height}.png`) });
    }
    console.log("  ok  library touch targets, focus trap, Escape and focus restoration at every selected viewport size");
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
  }
  console.log("KidX program layout smoke passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runProgramLayout({ viewports: [[1280, 720]] });
}

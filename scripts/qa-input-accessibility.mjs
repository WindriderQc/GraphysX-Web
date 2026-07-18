import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const url = process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4176/";
const outputDir = path.resolve("output/playwright/r9-input-accessibility");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true
});
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => errors.push({ type: "page", text: String(error) }));

const assertions = [];
const assert = (condition, message) => {
  assertions.push({ pass: Boolean(condition), message });
  if (!condition) throw new Error(message);
};
const debug = (name, argument) =>
  page.evaluate(({ name, argument }) => window.__GRAPHYSX_DEBUG__[name](argument), { name, argument });

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__ && window.render_game_to_text);
  assert(await debug("selectRace", "green-grid-run"), "Classic Level 1 is selectable for touch QA");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.snapshot().loadState.ready);
  assert(await debug("startRace"), "Classic Level 1 starts for touch QA");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.state() === "gameplay");

  const controls = page.locator(".game-controls:not([hidden])");
  assert(await controls.isVisible(), "The touch control dock is visible during mobile gameplay");
  assert((await controls.locator("[data-virtual-key]").count()) === 8, "The mobile dock exposes direction, thrust, jump/brake, and camera actions");
  const before = await debug("snapshot");
  await debug("setVirtualInput", { code: "ArrowUp", down: true });
  await page.waitForTimeout(650);
  assert((await debug("inputState")).touch, "Virtual touch input reports active while held");
  await debug("setVirtualInput", { code: "ArrowUp", down: false });
  const after = await debug("snapshot");
  const distance = Math.hypot(
    after.playerPosition.x - before.playerPosition.x,
    after.playerPosition.z - before.playerPosition.z
  );
  assert(distance > 0.35, "Held touch direction produces live BallZ travel");
  assert(!(await debug("inputState")).touch, "Touch input releases cleanly");
  await page.screenshot({ path: path.join(outputDir, "01-mobile-ballz-controls.png"), fullPage: true });

  const beforePause = await debug("snapshot");
  assert(await debug("pauseRace", true), "Visible/mobile pause freezes the active race");
  const pausedAt = await debug("snapshot");
  await page.waitForTimeout(450);
  const duringPause = await debug("snapshot");
  assert(duringPause.racePaused, "Paused state is explicit in the gameplay snapshot");
  assert(
    pausedAt.elapsedMs >= beforePause.elapsedMs &&
      Math.abs(duringPause.elapsedMs - pausedAt.elapsedMs) < 0.01 &&
      Math.hypot(
        duringPause.playerPosition.x - pausedAt.playerPosition.x,
        duringPause.playerPosition.z - pausedAt.playerPosition.z
      ) < 0.01,
    "Pause freezes elapsed time and player simulation"
  );
  assert(await page.locator(".game-pause-banner:not([hidden])").isVisible(), "Pause has a visible resume/exit explanation");
  await page.screenshot({ path: path.join(outputDir, "02-mobile-paused.png"), fullPage: true });
  assert(await debug("pauseRace", false), "The same control resumes the race");

  await page.evaluate(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    buttons[7] = { pressed: true, touched: true, value: 0.8 };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [{ connected: true, id: "GraphysX QA Pad", axes: [0.55, -0.7, 0, 0], buttons }]
    });
  });
  await page.waitForTimeout(20);
  const gamepad = await debug("inputState");
  assert(gamepad.gamepad.connected && gamepad.gamepad.id === "GraphysX QA Pad", "A connected standard gamepad is detected");
  assert(gamepad.gamepad.forward > 0.5 && gamepad.gamepad.turn > 0.35, "Gamepad deadzone mapping preserves analog forward/turn axes");
  assert(errors.length === 0, "Touch/gamepad input QA produces no browser or page errors");
} finally {
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify({ url, assertions, errors }, null, 2));
  await context.close();
  await browser.close();
}

console.log(JSON.stringify({ assertions: assertions.length, errors: errors.length, outputDir }, null, 2));

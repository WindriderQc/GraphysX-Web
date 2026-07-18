import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const url = process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4192/";
const outputDir = path.resolve("output/playwright/r9-camera-collision");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => errors.push({ type: "page", text: String(error) }));

const assertions = [];
const states = {};
const assert = (condition, message) => {
  assertions.push({ pass: Boolean(condition), message });
  if (!condition) throw new Error(message);
};
const debug = (name, ...args) => page.evaluate(({ name, args }) => window.__GRAPHYSX_DEBUG__[name](...args), { name, args });

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__ && window.render_game_to_text && window.advanceTime);
  assert(await debug("selectRace", "zombie-hunt"), "ZombieKiller arena is selectable");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.snapshot().loadState.ready);
  assert(await debug("startRace"), "ZombieKiller arena starts for camera QA");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.state() === "gameplay");

  const blocked = await debug("setRaceCamera", 0, 0.12, 14);
  await page.evaluate(() => window.advanceTime(50));
  const blockedState = await debug("snapshot");
  assert(blocked.cameraCollision.active, "Low chase ray detects the authored boundary wall");
  assert(blocked.cameraCollision.hitBodyId !== null, "Collision telemetry identifies the blocking physics body");
  assert(
    blocked.cameraCollision.resolvedDistance < blocked.cameraCollision.desiredDistance,
    "Blocked camera resolves before the wall"
  );
  assert(
    blockedState.cameraCollision.resolvedDistance >= 3,
    "A close wall resolves to a readable elevated/shoulder distance instead of an extreme BallZ close-up"
  );
  await page.screenshot({ path: path.join(outputDir, "01-boundary-wall-resolved.png"), fullPage: true });

  const clear = await debug("setRaceCamera", 0, 1.2, 14);
  await page.evaluate(() => window.advanceTime(50));
  assert(!clear.cameraCollision.active, "High chase ray clears the same boundary wall");
  assert(
    Math.abs(clear.cameraCollision.resolvedDistance - clear.cameraCollision.desiredDistance) < 0.001,
    "Unblocked camera retains its requested chase distance"
  );
  await page.screenshot({ path: path.join(outputDir, "02-high-angle-unblocked.png"), fullPage: true });

  assert(await debug("selectRace", "piste-ovale"), "Piste Ovale is selectable for banked-track camera QA");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.snapshot().loadState.ready);
  assert(await debug("startRace"), "Piste Ovale starts after its vehicle assets load");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.state() === "gameplay");
  // Let the four physical wheels settle onto the banked mesh before applying
  // the exact archived 3000-unit rear-wheel torque.
  await page.evaluate(() => window.advanceTime(1800));
  const pisteStart = await debug("snapshot");
  await debug("setVirtualInput", { code: "KeyW", down: true });
  await page.evaluate(() => window.advanceTime(2000));
  await debug("setVirtualInput", { code: "KeyW", down: false });
  const pisteMoved = await debug("snapshot");
  states.piste = { start: pisteStart, moved: pisteMoved };
  assert(
    Math.hypot(
      pisteMoved.playerPosition.x - pisteStart.playerPosition.x,
      pisteMoved.playerPosition.z - pisteStart.playerPosition.z
    ) > 1,
    "Impreza moves on the banked Piste during the camera regression probe"
  );
  assert(!pisteMoved.cameraCollision.active, "Driveable banked track is not misclassified as a chase-camera wall");
  assert(
    Math.abs(pisteMoved.cameraCollision.resolvedDistance - pisteMoved.cameraCollision.desiredDistance) < 0.001,
    "Vehicle chase camera retains its readable requested distance instead of entering the track underside"
  );
  await page.screenshot({ path: path.join(outputDir, "03-piste-banked-track-visible.png"), fullPage: true });
  assert(errors.length === 0, "Camera collision flow produces no browser errors");
} finally {
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify({ url, assertions, states, errors }, null, 2));
  await browser.close();
}

console.log(JSON.stringify({ assertions: assertions.length, errors: errors.length, outputDir }, null, 2));

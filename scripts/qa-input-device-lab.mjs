import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const url = process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4196/";
const outputDir = path.resolve("output/playwright/input-device-lab");
fs.mkdirSync(outputDir, { recursive: true });
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
const assertions = [];
page.on("console", (message) => { if (message.type() === "error") errors.push({ type: "console", text: message.text() }); });
page.on("pageerror", (error) => errors.push({ type: "page", text: String(error) }));
const assert = (condition, message) => {
  assertions.push({ pass: Boolean(condition), message });
  if (!condition) throw new Error(message);
};
const debug = (name, ...args) => page.evaluate(({ name, args }) => window.__GRAPHYSX_DEBUG__[name](...args), { name, args });

try {
  assert(sha256(path.resolve("public/assets/device-lab/Circle-Thick-Purple-300x300.png")) === "EFE45E8EA41054500BC54280BEDE07030814984FFD8EFFC4829AF66758B95767", "Controller ring is byte-identical to the BallZ18 source");
  assert(sha256(path.resolve("public/assets/device-lab/CenterTarget.png")) === "D4C8C4F4D70775A8D770AE943F03B10E53730F1A57F454AB1EC54FA55034C175", "Controller pointer is byte-identical to the BallZ18 source");
  assert(sha256(path.resolve("public/assets/device-lab/OpenedIcon.bmp")) === "A7864A792CECB01DB9D3FED3161BAF93AECA7D2BA99427B5528A7C13367DA88A", "Opened I/O icon is byte-identical to AtmelCubx");
  assert(sha256(path.resolve("public/assets/device-lab/ClosedIc.bmp")) === "F37EC3A25C52B81179332E2F650C34F0E33C25595EBB3C658465E2CA58FE7289", "Closed I/O icon preserves the archive's actual ClosedIc filename");

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__ && window.render_game_to_text);
  assert(await debug("openInputDeviceLab"), "Input & Device Lab is player-facing and opens from the canonical archive flow");
  let state = await debug("inputDeviceLabState");
  assert(state.transport === "simulation" && state.baud === 9600 && state.armed === false, "Lab always opens simulation-first at 9600 baud and disarmed");
  assert(state.io.length === 8 && state.schedules.length === 4, "AtmelCubx exposes eight I/O channels and four schedules");
  assert(state.meArm.middle === 90 && state.meArm.left === 90 && state.meArm.right === 90 && state.meArm.claw === 25, "MeArm preserves the source defaults");
  const monitor = await debug("inputDeviceMonitorState");
  assert(monitor.horizontal === 0 && monitor.vertical === 0 && Object.keys(monitor.buttons).length === 4, "BallZ18 monitor exposes two axes and four source-mapped buttons");
  const ringSize = await page.locator(".device-stick-ring").evaluate((element) => [getComputedStyle(element).width, getComputedStyle(element).height]);
  const pointerSize = await page.locator(".device-stick-pointer").evaluate((element) => [getComputedStyle(element).width, getComputedStyle(element).height]);
  assert(ringSize.join("x") === "145pxx145px" && pointerSize.join("x") === "25pxx25px", "Controller monitor preserves the 145px ring and 25px pointer composition");
  await page.screenshot({ path: path.join(outputDir, "00-simulation-dashboard.png"), fullPage: true });

  await debug("identifyDevice");
  state = await debug("inputDeviceLabState");
  assert(state.log.some((entry) => entry.direction === "TX" && entry.hex === "10 80 00 00"), "PhysX identify emits the exact four-byte request");
  assert(state.log.some((entry) => entry.direction === "RX" && entry.text === "HELLO FROM ARDUINO-Ok"), "PhysX identify returns the archived handshake");

  assert(await debug("setDeviceProfile", "scene3d"), "Scene3D compatibility profile is selectable");
  await debug("identifyDevice");
  state = await debug("inputDeviceLabState");
  assert(state.log.some((entry) => entry.direction === "TX" && entry.hex === "10 80 00 00 04"), "Scene3D profile preserves the fifth 0x04 byte");

  assert((await debug("sendDeviceRobot", 8)) === false, "Movement is blocked while actuators are disarmed");
  assert(await debug("setDeviceArmed", true), "Actuator simulation requires an explicit ARM gesture");
  assert(await debug("setDeviceProfile", "physx-robot"), "PhysX Robot profile can be restored");
  assert(await debug("sendDeviceRobot", 8), "Armed robot accepts source command 8");
  assert(await debug("setDevicePin", true), "Source pin 8 can be toggled in simulation");
  state = await debug("inputDeviceLabState");
  assert(state.log.some((entry) => entry.direction === "TX" && entry.hex === "10 08 00 00"), "Robot Up uses exact command 8 frame");
  assert(state.log.some((entry) => entry.direction === "TX" && entry.hex === "10 7F 08 01"), "Set Pin uses exact command 127 / pin 8 / value 1 frame");

  assert((await debug("sweepDeviceSonar")) === 182, "Radar keeps all 182 forward/reverse sweep points");
  state = await debug("inputDeviceLabState");
  assert(state.radar[0].angle === 0 && state.radar[90].angle === 180 && state.radar[91].angle === 180 && state.radar[181].angle === 0, "Radar preserves both inclusive source passes");
  assert(await debug("toggleDeviceIo", 7), "AtmelCubx IO 7 toggles open");
  assert(await debug("toggleDeviceSchedule", 2), "AtmelCubx Fan On schedule toggles enabled");
  state = await debug("inputDeviceLabState");
  assert(state.log.some((entry) => entry.direction === "TX" && entry.hex === "44 07"), "Atmel IO ON preserves D plus raw channel byte");
  assert((await debug("setDeviceServo", { id: "right", value: 999 })) === 180, "MeArm servo commands clamp safely to 180 degrees");
  assert(state.log.length <= 20, "Protocol log stays bounded");

  await page.locator('[data-device-action="sweep"]').click();
  await page.screenshot({ path: path.join(outputDir, "01-radar-io-mearm.png"), fullPage: true });
  const rendered = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert(rendered.mode === "input-device-lab" && rendered.inputDevice.transport === "simulation", "render_game_to_text exposes the isolated device-lab state");
  assert(rendered.player === undefined && rendered.race === undefined, "Device lab does not leak BallZ player or race state");
  assert(errors.length === 0, "Input & Device Lab produces no console or page errors");
} finally {
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify({ url, assertions, errors }, null, 2));
  await browser.close();
}

console.log(`Input & Device Lab QA passed ${assertions.length}/${assertions.length} assertions with ${errors.length} errors.`);

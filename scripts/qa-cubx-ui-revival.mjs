import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4173";
const outputDir = path.resolve("output/playwright/cubx-ui-revival");
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const browserProblems = [];
page.on("console", (message) => {
  if (message.type() === "error") browserProblems.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => browserProblems.push(`pageerror: ${error.message}`));

const report = { url: baseUrl, assertions: [], states: {}, browserProblems };
const assert = (condition, message) => {
  report.assertions.push({ pass: Boolean(condition), message });
  if (!condition) throw new Error(message);
};
const debug = async (method, ...args) => {
  await page.waitForFunction(() => Boolean(window.__GRAPHYSX_DEBUG__));
  return page.evaluate(
    ({ method, args }) => window.__GRAPHYSX_DEBUG__[method](...args),
    { method, args },
  );
};
const textState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = async (milliseconds) => {
  await page.evaluate((elapsed) => window.advanceTime(elapsed), milliseconds);
  await page.waitForTimeout(80);
};
const screenshot = (name) => page.screenshot({ path: path.join(outputDir, `${name}.png`) });

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__GRAPHYSX_DEBUG__ && window.render_game_to_text && window.advanceTime));

  assert(await debug("openCubXMenu"), "CubX menu opens through the player-facing archive mode");
  await advance(3200);
  let current = await textState();
  report.states.idle = current;
  assert(current.cubx.sourceAnimation.decoded, "Live CubZ menu identifies decoded CubeRot/CubeOpen TVA playback");
  assert(current.cubx.sourceAnimation.rotationClips.length === 7, "All seven recovered CubZ selection ranges are available");
  assert(current.cubx.sourceAnimation.openClip.startFrame === 0 && current.cubx.sourceAnimation.openClip.endFrame === 50, "CubZ open uses the decoded 0-50 source range");
  assert(JSON.stringify(current.cubx.sourceAnimation.choreography.idleSpinDegreesPerSecond) === JSON.stringify([20, 20, 20]), "Idle rotation uses the recovered 20/20/20 degrees-per-second constant");
  assert(current.cubx.sourceAnimation.choreography.cameraFly.complete, "Recovered CubX camera fly reaches its clamped source target");
  assert(JSON.stringify(current.cubx.sourceAnimation.choreography.cameraFly.sourceTarget) === JSON.stringify([-75, 725, -350]), "Camera fly reports the recovered (-75,725,-350) clamp");
  assert(JSON.stringify(current.cubx.satellites.menuRules) === JSON.stringify({ maxButtons: 48, maxLevels: 16, allMenu: 666, allMenuExceptMain: 777 }), "Recovered MenuManager limits and wildcard tags are live");
  assert(current.cubx.satellites.items.length === 6 && current.cubx.satellites.items.every((item) => item.visible), "The level-0 System/Tools/Earth/Grid shell plus always-visible Arrow/Sun is live");
  assert(current.cubx.satellites.visualAdapter.recoveredArrowGeometryReady, "Arrow uses decoded Fleche.tvm geometry");
  const sourcePositions = Object.fromEntries(current.cubx.satellites.items.map((item) => [item.id, item.sourcePosition]));
  assert(JSON.stringify(sourcePositions.system) === JSON.stringify([-800, 300, -250]), "System preserves its recovered source coordinate");
  assert(JSON.stringify(sourcePositions.tools) === JSON.stringify([-1100, 300, -500]), "Tools preserves its recovered source coordinate");
  assert(JSON.stringify(sourcePositions.earth) === JSON.stringify([800, 500, 350]), "Earth preserves its recovered source coordinate");
  assert(JSON.stringify(sourcePositions.arrow) === JSON.stringify([1000, 600, 300]), "Arrow preserves its recovered source coordinate");
  assert(JSON.stringify(sourcePositions.sun) === JSON.stringify([0, 500, 0]), "Sun preserves its recovered source coordinate");

  assert(await debug("openCubX", 0), "Cube 1 follows the source's direct open path");
  await advance(760);
  current = await textState();
  report.states.openMidpoint = current;
  assert(current.cubx.phase === "opening", "CubX remains in the open phase at the diagnostic midpoint");
  assert(current.cubx.sourceAnimation.activeSample.cursor.sourceFrame > 15 && current.cubx.sourceAnimation.activeSample.cursor.sourceFrame < 35, "Open progress samples continuously inside the decoded 0-50 range");
  await screenshot("00-cubx-open-source-midpoint");

  await advance(1050);
  current = await textState();
  assert(current.cubx.phase === "open" && current.cubx.sourceAnimation.activeSample.cursor.sourceFrame === 50, "CubZ reaches decoded frame 50 at the fully open pose");
  assert(await debug("closeCubX"), "CubX close starts from the decoded open endpoint");
  await advance(760);
  current = await textState();
  report.states.closeMidpoint = current;
  assert(current.cubx.phase === "closing", "CubX remains in the close phase at the diagnostic midpoint");
  assert(current.cubx.sourceAnimation.activeSample.cursor.sourceFrame > 15 && current.cubx.sourceAnimation.activeSample.cursor.sourceFrame < 35, "Close samples the same CubZ source interval in reverse");
  await screenshot("01-cubx-close-source-midpoint");
  await advance(1050);
  assert((await textState()).cubx.phase === "idle", "CubX returns to its idle bind layout after reverse playback");

  assert(await debug("openCubX", 4), "BallZ cube starts its recovered snap/open chain");
  await advance(5000);
  current = await textState();
  assert(current.cubx.phase === "open" && current.cubx.selectedCube === 4, "BallZ cube reaches its dedicated selector screen");
  assert(JSON.stringify(current.cubx.ballSelector.options) === JSON.stringify(["fire", "classic2015", "revival"]), "Ball selector exposes Fire, Classic, and Revival in source-facing order");
  assert(current.cubx.ballSelector.recoveredMeshesReady, "BallFire and BallShell recovered meshes are loaded");

  for (const preset of ["fire", "classic2015", "revival"]) {
    await page.locator(`[data-ball-preset="${preset}"]`).click();
    await page.waitForTimeout(80);
    current = await textState();
    assert(current.cubx.ballSelector.selected === preset && current.ballPreset === preset, `${preset} selector updates both CubX and live race state`);
    report.states[`ball-${preset}`] = current;
    await screenshot(`ball-${preset}`);
  }

  assert(await debug("openCubXMenu"), "CubX menu can be reopened for satellite interaction QA");
  await advance(3200);
  assert(await debug("activateCubXSatellite", "system"), "System satellite accepts its evidence-bounded inspect action");
  current = await textState();
  assert(current.cubx.satellites.selected === "system" && current.preview === "cubx-lab", "System stays in CubX because its recovered explosion destination is unavailable");
  assert(await debug("activateCubXSatellite", "earth"), "Earth satellite accepts its recovered no-op inspect action");
  current = await textState();
  assert(current.cubx.satellites.selected === "earth" && current.preview === "cubx-lab", "Earth remains inspect-only because the recovered click handler is empty");
  assert(await debug("activateCubXSatellite", "tools"), "Tools satellite activates its recovered Car Scene destination");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.state() === "car-selector");
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text());
    return state.selector?.loadStatus === "ready";
  }, { timeout: 20000 });
  await advance(3500);
  current = await textState();
  assert(current.preview === "car-selector", "Tools opens the recovered Impreza Car Scene");
  assert(current.selector.loadStatus === "ready" && current.selector.terrain.ready, "Tools destination finishes loading the recovered terrain and car catalog");
  assert(current.selector.car.currentPosition[1] < 100, "Recovered Impreza begins its archived gravity drop after Tools opens Car Scene");
  report.states.toolsDestination = current;
  await screenshot("02-tools-opens-car-scene");

  assert(await debug("openCubXMenu"), "CubX menu can be reopened for Arrow semantics");
  await advance(3200);
  assert(await debug("openCubX", 0), "CubZ opens before testing the ALLMENU Arrow");
  await advance(1800);
  assert((await textState()).cubx.phase === "open", "CubZ reaches open state before Arrow activation");
  assert(await debug("activateCubXSatellite", "arrow"), "Arrow remains actionable while CubZ is open");
  current = await textState();
  assert(current.cubx.satellites.activeMenuLevel === 0 && current.cubx.phase === "closing", "ALLMENU Arrow restores menu level 0 and begins closing CubZ");
  await advance(1800);
  assert((await textState()).cubx.phase === "idle", "Arrow returns the CubZ shell to idle level 0");

  // Return to a fresh idle CubX scene so the only strong red target on the
  // right side of the WebGL canvas is the recovered SUN / FLIGHTX control.
  assert(await debug("openCubXMenu"), "CubX menu can be reopened before the sun raycast check");
  await advance(3200);
  const canvas = page.locator("canvas").first();
  const sunCanvasPng = await canvas.screenshot({ path: path.join(outputDir, "03-cubx-sun-before-click.png") });
  const redTarget = await page.evaluate(async (base64Png) => {
    const snapshot = new Image();
    snapshot.src = `data:image/png;base64,${base64Png}`;
    await snapshot.decode();
    const probe = document.createElement("canvas");
    probe.width = snapshot.naturalWidth;
    probe.height = snapshot.naturalHeight;
    const context = probe.getContext("2d", { willReadFrequently: true });
    context.drawImage(snapshot, 0, 0);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    for (let y = 0; y < probe.height; y += 1) {
      for (let x = Math.floor(probe.width * 0.55); x < probe.width; x += 1) {
        const offset = (y * probe.width + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        if (red > 120 && red > green * 1.6 && red > blue * 1.5) {
          count += 1;
          sumX += x;
          sumY += y;
        }
      }
    }
    return { count, x: sumX / count, y: sumY / count, width: probe.width, height: probe.height };
  }, sunCanvasPng.toString("base64"));
  report.states.sunPixelTarget = redTarget;
  assert(redTarget.count > 500 && Number.isFinite(redTarget.x) && Number.isFinite(redTarget.y), "Rendered SUN control is discoverable as the strong red WebGL target");
  const canvasBox = await canvas.boundingBox();
  assert(Boolean(canvasBox), "CubX WebGL canvas has a clickable layout box");
  await page.mouse.click(
    canvasBox.x + (redTarget.x / redTarget.width) * canvasBox.width,
    canvasBox.y + (redTarget.y / redTarget.height) * canvasBox.height,
  );
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.state() === "gameplay", { timeout: 20000 });
  await page.waitForTimeout(300);
  current = await textState();
  report.states.sunLaunch = current;
  assert(current.mode === "gameplay" && current.race === "FlightX — Pipe Loop", "Clicking the rendered 3D sun launches the flightx-pipe race");
  assert(browserProblems.length === 0, "CubX UI revival has no browser console or page errors");
  await screenshot("04-flightx-pipe-from-sun");
} finally {
  report.states.final = await textState().catch(() => null);
  await fs.writeFile(path.join(outputDir, "results.json"), JSON.stringify(report, null, 2));
  await browser.close();
}

console.log(JSON.stringify({ assertions: report.assertions.length, browserProblems: browserProblems.length, outputDir }, null, 2));

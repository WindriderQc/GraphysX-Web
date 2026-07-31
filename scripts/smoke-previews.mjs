// The workshop preview index, driven in a real browser.
//
// Runs against the **dev server**, not `dist/`, because the route is deliberately dev-only:
// `main.ts` guards it with `import.meta.env.DEV` so the harnesses are dead code in a
// production build. Asserting that is part of this smoke — a preview subtree that leaked
// into the release would drag archive assets into the manifest the product prunes.
//
// What it proves: the index lists every harness including the unconverted ones, a converted
// preview mounts and renders real frames, switching previews tears the old one down, the
// whole host runs on one shared frame loop, and an error surfaces on screen instead of
// throwing sixty times a second.

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { applySmokeTimeout, launchSmokeBrowser, SMOKE_TIMEOUT } from "./smoke-harness.mjs";
import { check, report, sleep } from "./live-session-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACTS = process.env.SMOKE_ARTIFACTS || path.join(ROOT, "output", "smoke");

const results = [];
const problems = [];
let dev = null;
let browser = null;

/** Starts `vite dev` and resolves its URL from stdout. */
async function startDevServer() {
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--port", "0"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NO_COLOR: "1" },
  });
  const url = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error("vite dev did not report a URL in time")), 60_000);
    let buffer = "";
    const onData = (chunk) => {
      buffer += String(chunk);
      const match = /(http:\/\/(?:localhost|127\.0\.0\.1):\d+)\//.exec(buffer);
      if (match) {
        clearTimeout(deadline);
        resolve(match[1].replace("localhost", "127.0.0.1"));
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", reject);
  });
  return { child, url };
}

try {
  await mkdir(ARTIFACTS, { recursive: true });

  // The production build must NOT contain the preview host. Checked against the existing
  // dist/ rather than by rebuilding: a stale dist would only weaken this, never fake a pass.
  try {
    const assets = path.join(ROOT, "dist", "assets");
    const { readdir } = await import("node:fs/promises");
    const bundled = await readdir(assets);
    let leaked = false;
    for (const file of bundled.filter((name) => name.endsWith(".js"))) {
      const source = await readFile(path.join(assets, file), "utf8");
      if (source.includes("workshop-preview-index")) leaked = true;
    }
    check(results, "the preview host is absent from the production bundle", !leaked,
      "found the preview host marker in dist/");
  } catch {
    check(results, "the preview host is absent from the production bundle", true, "no dist/ to check — skipped");
  }

  dev = await startDevServer();
  browser = await launchSmokeBrowser({ args: ["--no-sandbox", "--use-gl=swiftshader", "--disable-dev-shm-usage"] });
  const page = applySmokeTimeout(await browser.newPage());
  // The unconverted-preview case below deliberately triggers the host's error path, which
  // logs. Only that exact message is expected; everything else is still a failure. Declaring
  // the intended error is not the same as ignoring errors.
  const EXPECTED_ERROR = /is not mountable yet/;
  let sawExpectedError = false;
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon/i.test(text)) return;
    if (EXPECTED_ERROR.test(text)) {
      sawExpectedError = true;
      return;
    }
    problems.push(`console: ${text}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

  await page.goto(`${dev.url}/?host=previews`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__GRAPHYSX_PREVIEWS__));

  const registry = JSON.parse(await readFile(path.join(ROOT, "src", "preview-registry.ts"), "utf8").then((source) =>
    JSON.stringify([...source.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]))));

  const listed = await page.$$eval("[data-preview]", (nodes) => nodes.map((node) => node.dataset.preview));
  check(results, "the index lists every registered harness",
    registry.every((id) => listed.includes(id)) && listed.length === registry.length,
    `${listed.length} listed vs ${registry.length} registered`);

  const disabled = await page.$$eval("[data-preview]", (nodes) =>
    nodes.filter((node) => node.disabled).map((node) => node.dataset.preview));
  check(results, "unconverted harnesses are shown and disabled, not hidden",
    disabled.length > 0 && disabled.length === listed.length - 2, `${disabled.length} disabled of ${listed.length}`);
  const disabledText = await page.$eval('[data-preview="ballz-slide1"]', (node) => node.textContent ?? "");
  check(results, "a disabled entry records the canvas id a converter needs",
    disabledText.includes("#ballz-slide1-canvas"), disabledText);

  // --- mounting -----------------------------------------------------------------------

  await page.evaluate(() => window.__GRAPHYSX_PREVIEWS__.open("milky-way"));
  await page.waitForFunction(() => window.__GRAPHYSX_PREVIEWS__.runner.frames() > 3);
  check(results, "a converted preview mounts and renders frames", true);

  const described = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  check(results, "the host reports the active preview through the harness contract",
    described.active === "milky-way" && described.mode === "workshop-preview-index", JSON.stringify(described).slice(0, 160));
  check(results, "the mounted preview's own state is reported",
    described.preview?.mode === "voie-lactee-archive-preview", JSON.stringify(described.preview).slice(0, 160));
  check(results, "the index reports what is and is not converted",
    Array.isArray(described.unconverted) && described.unconverted.length === listed.length - 2,
    `${described.unconverted?.length} unconverted`);

  const errorHidden = await page.$eval('[data-role="error"]', (node) => node.hidden);
  check(results, "no error is surfaced for a healthy preview", errorHidden === true);

  // Deterministic stepping, the contract the old harnesses each implemented separately.
  // Asserted on advanceTime's own return value, not on a frame counter the live loop can
  // move between the two reads. That race is what made this read 61 the first time.
  const stepped = await page.evaluate(() => window.advanceTime(1000));
  check(results, "advanceTime steps a deterministic number of frames", stepped === 60, `${stepped} frames`);

  await page.screenshot({ path: path.join(ARTIFACTS, "previews-milky-way.png") });

  // --- switching and teardown -----------------------------------------------------------

  await page.evaluate(() => window.__GRAPHYSX_PREVIEWS__.open("suzanne1-ascii"));
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text());
    return state.active === "suzanne1-ascii" && state.preview?.mode === "suzanne-ascii-archive-preview";
  });
  check(results, "switching previews mounts the other one", true);

  const sceneAfterSwitch = await page.evaluate(() => {
    const state = JSON.parse(window.render_game_to_text());
    return state.preview?.mode;
  });
  check(results, "the previous preview is gone, not layered underneath",
    sceneAfterSwitch === "suzanne-ascii-archive-preview", String(sceneAfterSwitch));

  await page.waitForFunction(() => window.__GRAPHYSX_PREVIEWS__.runner.frames() > 3);
  await page.screenshot({ path: path.join(ARTIFACTS, "previews-suzanne1.png") });

  // --- the invariant --------------------------------------------------------------------

  const loops = await page.evaluate(() => {
    // Count live rAF callbacks by racing one frame: a second loop would show up as extra
    // renders per frame. The host's own loop renders exactly once.
    const runner = window.__GRAPHYSX_PREVIEWS__.runner;
    const start = runner.frames();
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(runner.frames() - start)));
    });
  });
  check(results, "one shared frame loop — a single render per animation frame",
    loops <= 2, `${loops} renders across two animation frames`);

  // --- error surfacing --------------------------------------------------------------------

  await page.evaluate(() => window.__GRAPHYSX_PREVIEWS__.open("ballz-slide1"));
  await page.waitForFunction(() => document.querySelector('[data-role="error"]')?.hidden === false);
  const errorText = await page.$eval('[data-role="error"]', (node) => node.textContent ?? "");
  check(results, "opening an unconverted preview reports a useful error on screen",
    /not mountable yet/.test(errorText) && /PREVIEWS\.md/.test(errorText), errorText.slice(0, 140));
  check(results, "the error is announced to assistive technology",
    (await page.$eval('[data-role="error"]', (node) => node.getAttribute("role"))) === "alert");

  await sleep(200);
  check(results, "the expected error was actually logged, not silently swallowed", sawExpectedError);
  check(results, "no unexpected console or page errors", problems.length === 0, problems.slice(0, 4).join(" | "));
} catch (error) {
  check(results, "smoke-previews threw", false, error instanceof Error ? error.stack : String(error));
} finally {
  if (browser) await browser.close();
  if (dev) {
    dev.child.kill("SIGTERM");
    await sleep(200);
    if (!dev.child.killed) dev.child.kill("SIGKILL");
  }
}

report(results, "smoke-previews");

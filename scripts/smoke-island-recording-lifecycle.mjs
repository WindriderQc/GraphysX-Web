// Disposable synthetic worlds only. Run through verify / its machine-wide lock.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { build } from "vite";
import { startStaticServer } from "./static-server.mjs";
import { launchSmokeBrowser, applySmokeTimeout } from "./smoke-harness.mjs";
import { startWorldServer } from "../world-service/server.mjs";
import { SegmentedArchive } from "../world-service/segments.mjs";

const scratch = await mkdtemp(join(tmpdir(), "island-recording-journey-"));
const output = process.env.SMOKE_ARTIFACTS || "output/verify";
await mkdir(output, { recursive: true });
let world, server, browser;
const errors = [];
try {
  await build({ configFile: resolve("vite.world-service.config.ts"), root: resolve("."),
    build: { outDir: join(scratch, "bundle"), emptyOutDir: true }, logLevel: "silent" });
  const module = await import(pathToFileURL(join(scratch, "bundle", "world.js")).href);
  const recordDir = join(scratch, "recordings");
  world = await startWorldServer({ module, apiMarkdown: "Synthetic API", recordDir,
    recordingLimits: { maxBytes: 256 * 1024, bufferBytes: 1, idleMs: 800, cleanupEveryMs: 100 } });
  const health = await (await fetch(`${world.url}/healthz`)).json();
  assert.equal(health.ok, false); assert.equal(health.live.available, true); assert.match(health.recording.error, /quota/);
  const id = randomUUID();
  const archive = new SegmentedArchive(recordDir);
  const hello = tick => ({ kind: "hello", ...world.world.sceneHello(), tick, instanceId: id, recordingId: id });
  for (const tick of [10, 100]) {
    await archive.start(id); archive.write(hello(tick));
    archive.write({ kind: "frame", ...world.world.poseFrame(), tick: tick + 3600 });
    await archive.close();
  }
  server = await startStaticServer({ root: resolve("dist"), port: 0 });
  browser = await launchSmokeBrowser();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  applySmokeTimeout(page); page.on("pageerror", error => errors.push(String(error)));
  const url = source => `${server.url}/?app=island&embed=1&source=${encodeURIComponent(source)}`;
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
  await page.goto(url(world.url));
  await page.waitForFunction(() => typeof window.render_game_to_text === "function" && JSON.parse(window.render_game_to_text()).application?.feed === "graphysx");
  await page.getByText(/Direct disponible · enregistrement suspendu/).waitFor();
  assert.ok((await state()).parts > 0, "real scene while recording is paused, without Clawblox fallback");
  await page.screenshot({ path: join(output, "island-degraded-live-390.png") });
  await page.goto(url(`${world.url}/recordings/${id}`));
  await page.waitForFunction(() => typeof window.render_game_to_text === "function" && JSON.parse(window.render_game_to_text()).application?.mode === "replay");
  const select = page.getByRole("combobox", { name: "Segment de l’archive" });
  await select.waitFor({ state: "visible" });
  assert.equal(await select.locator("option").count(), 2);
  await select.selectOption("1");
  await page.waitForURL(/parts%2F1/);
  await page.waitForFunction(() => typeof window.render_game_to_text === "function" && JSON.parse(window.render_game_to_text()).application?.replay?.first_tick === 100);
  await page.locator('[data-action="toggle"]').click();
  await page.waitForFunction(() => typeof window.render_game_to_text === "function" && JSON.parse(window.render_game_to_text()).application?.replay?.paused === true);
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 1024 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow");
    await page.screenshot({ path: join(output, `island-segment-replay-${width}.png`) });
  }
  await page.close();
  const deadline = Date.now() + 5000;
  let readers;
  do {
    readers = (await (await fetch(`${world.url}/healthz`)).json()).replay;
    if (!readers.openReaders) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.equal(readers.openReaders, 0); assert.equal(readers.residentBytes, 0);
  assert.deepEqual(errors, []);
  console.log("ok: quota-degraded live scene, exact archive segments, pause, mobile/tablet, reader release");
} finally {
  await browser?.close(); await world?.close(); await server?.close();
  await rm(scratch, { recursive: true, force: true });
}

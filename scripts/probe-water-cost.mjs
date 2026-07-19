/**
 * Measure what the water reflection costs, and prove it is actually rendering.
 *
 * A planar reflection re-renders the scene from the mirrored camera every frame, so it is a
 * real second scene pass. This counts frames over a fixed wall-clock interval with
 * `water.reflection` on and off — toggled through the ordinary public API, which is the
 * point: the cost is a scene-authoring decision, not a host setting.
 *
 * Also screenshots both states so the reflection can be confirmed visually rather than
 * assumed from a frame counter.
 *
 *   SMOKE_BASE=http://127.0.0.1:4199/ node scripts/probe-water-cost.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/verify");
const SAMPLE_MS = Number(process.env.SAMPLE_MS || 6000);
const ROUNDS = Number(process.env.ROUNDS || 3);
mkdirSync(ART, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: 20000 });
await page.waitForTimeout(1500);

const setWater = (patch) =>
  page.evaluate((p) => window.__GRAPHYSX__.update("showroom-water", { water: p }).ok, patch);

async function measure() {
  // Settle after the rebuild before counting.
  await page.waitForTimeout(1200);
  const start = await page.evaluate(() => window.__GRAPHYSX_HOST__.frameCount);
  await page.waitForTimeout(SAMPLE_MS);
  const end = await page.evaluate(() => window.__GRAPHYSX_HOST__.frameCount);
  return (end - start) / (SAMPLE_MS / 1000);
}

// Sweep the render-target size as well as on/off. A single on/off pair cannot distinguish
// "the reflection is cheap" from "the harness cannot resolve the difference"; if the cost
// is real it must show up as a monotone trend against resolution.
const CASES = [
  { label: "off", patch: { reflection: false } },
  { label: "on@128", patch: { reflection: true, reflectionResolution: 128 } },
  { label: "on@256", patch: { reflection: true, reflectionResolution: 256 } },
  { label: "on@512", patch: { reflection: true, reflectionResolution: 512 } },
  { label: "on@1024", patch: { reflection: true, reflectionResolution: 1024 } },
];

const samples = Object.fromEntries(CASES.map((c) => [c.label, []]));
for (let round = 0; round < ROUNDS; round += 1) {
  // Reverse the order on odd rounds so a warming or thermal trend cannot be mistaken for
  // the effect being measured.
  const order = round % 2 === 0 ? CASES : [...CASES].reverse();
  for (const testCase of order) {
    await setWater(testCase.patch);
    samples[testCase.label].push(await measure());
  }
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const onFps = mean(samples["on@256"]);
const offFps = mean(samples.off);

await setWater({ reflection: true, reflectionResolution: 256 });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(ART, "water-reflection-on.png") });
await setWater({ reflection: false });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(ART, "water-reflection-off.png") });
await setWater({ reflection: true, reflectionResolution: 256 });

console.log(
  JSON.stringify(
    {
      sampleMs: SAMPLE_MS,
      rounds: ROUNDS,
      framesPerSample: Object.fromEntries(
        CASES.map((c) => [c.label, samples[c.label].map((v) => Number((v * (SAMPLE_MS / 1000)).toFixed(0)))]),
      ),
      meanFps: Object.fromEntries(CASES.map((c) => [c.label, Number(mean(samples[c.label]).toFixed(2))])),
      meanMsPerFrame: Object.fromEntries(
        CASES.map((c) => [c.label, Number((1000 / mean(samples[c.label])).toFixed(1))]),
      ),
      // The headline comparison the scene actually ships with.
      shipping: {
        offFps: Number(offFps.toFixed(2)),
        on256Fps: Number(onFps.toFixed(2)),
        extraMsPerFrame: Number((1000 / onFps - 1000 / offFps).toFixed(1)),
        costPercent: Number((((offFps - onFps) / offFps) * 100).toFixed(1)),
      },
    },
    null,
    2,
  ),
);
await browser.close();

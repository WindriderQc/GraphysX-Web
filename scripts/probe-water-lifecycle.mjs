/**
 * Regression probe for the planar-water render-target lifecycle.
 *
 * Rebuilds the showroom water through the public scene API and asserts that returning to the
 * non-reflecting path returns WebGL texture memory to the same baseline after every cycle.
 *
 *   SMOKE_BASE=http://127.0.0.1:5173/ node scripts/probe-water-lifecycle.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:5173/";
const CYCLES = Number(process.env.WATER_LIFECYCLE_CYCLES || 6);
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__ && !!window.__GRAPHYSX__, { timeout: 20000 });
  await page.waitForTimeout(1800);

  const settle = async () => {
    await page.waitForTimeout(180);
  };
  const setWater = async (water) => {
    const result = await page.evaluate((patch) => window.__GRAPHYSX__.update("showroom-water", { water: patch }), water);
    if (!result.ok) throw new Error(`Water update failed: ${result.error || "unknown error"}`);
    await settle();
  };
  const textureCount = () => page.evaluate(() => window.__GRAPHYSX_HOST__.renderer.info.memory.textures);

  await setWater({ reflection: false });
  const baseline = await textureCount();
  const cycles = [];

  for (let index = 0; index < CYCLES; index += 1) {
    const resolution = 128 << (index % 3);
    await setWater({ reflection: true, reflectionResolution: resolution });
    const reflecting = await textureCount();
    await setWater({ reflection: false });
    const released = await textureCount();
    cycles.push({ index: index + 1, resolution, reflecting, released });
    if (released !== baseline) {
      throw new Error(
        `Water reflection texture leaked in cycle ${index + 1}: baseline=${baseline}, released=${released}`,
      );
    }
  }

  // Leave the disposable path exercised once more before the page is torn down.
  await setWater({ reflection: true, reflectionResolution: 256 });
  const finalReflecting = await textureCount();
  await setWater({ reflection: false });
  const finalReleased = await textureCount();
  if (finalReleased !== baseline) {
    throw new Error(`Final water release did not return to baseline: baseline=${baseline}, released=${finalReleased}`);
  }

  console.log(JSON.stringify({ ok: true, baseline, cycles, finalReflecting, finalReleased }, null, 2));
} finally {
  await browser.close();
}

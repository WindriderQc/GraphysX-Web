import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser, useLightRender } from "./smoke-harness.mjs";
import { enterCompleteStudio } from "./studio-smoke-helpers.mjs";

const base = process.env.SMOKE_BASE || "http://127.0.0.1:4210/";
const output = path.resolve(process.env.SMOKE_ARTIFACTS || "output/playwright/studio-return");
await mkdir(output, { recursive: true });
const browser = await launchSmokeBrowser();
const clock = page => page.evaluate(() => window.__GRAPHYSX_HOST__.world.getClock());
try {
  // This journey judges behaviour and the real clock, not lighting or image quality.
  const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" }));
  await useLightRender(page, { resolution: .5 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(new URL("?intro=0", base).href); await page.locator(".gx-welcome--center").waitFor();
  const initial = await clock(page); assert.equal(initial.paused, false);
  await page.click(".gx-go-editor"); await page.locator(".gx-studio-simple:not([hidden])").waitFor();
  assert.equal((await clock(page)).paused, true);
  await page.click("[data-studio-action=exit]"); await page.locator(".gx-welcome--center").waitFor();
  const resumed = await clock(page); assert.equal(resumed.worldId, initial.worldId); assert.equal(resumed.paused, false);
  await page.waitForFunction(time => window.__GRAPHYSX_HOST__.world.getClock().elapsedSeconds > time, resumed.elapsedSeconds);
  // Preserve an intentionally paused world, including when exiting Complete mode.
  await page.evaluate(() => window.__GRAPHYSX__.pause(true));
  await page.click(".gx-go-editor"); await enterCompleteStudio(page);
  await page.click(".gx-ed-exit"); await page.locator(".gx-welcome--center").waitFor();
  const intentional = await clock(page); assert.equal(intentional.paused, true);
  await page.evaluate(() => window.__GRAPHYSX__.pause(false));
  await page.click(".gx-go-browse"); await page.click('.gx-browse [data-collection="lab"]');
  await page.click('.gx-browse [data-starter-id="physics-sketchbook"]');
  await page.locator(".gx-studio-simple:not([hidden])").waitFor(); assert.equal((await clock(page)).paused, true);
  await page.click("[data-studio-action=exit]"); await page.locator(".gx-welcome--center").waitFor();
  const afterCatalogue = await clock(page); assert.equal(afterCatalogue.worldId, initial.worldId); assert.equal(afterCatalogue.paused, false);
  await page.waitForFunction(time => window.__GRAPHYSX_HOST__.world.getClock().elapsedSeconds > time, afterCatalogue.elapsedSeconds);
  // A different document loaded while editing owns its pause state.
  await page.click(".gx-go-editor"); await page.locator(".gx-studio-simple:not([hidden])").waitFor();
  const foreign = await page.evaluate(() => {
    const result = window.__GRAPHYSX__.load({ schema: "graphysx.agent-world/v2", id: "foreign-return-clock", label: "Preserved foreign scene", entities: [] });
    window.__GRAPHYSX__.pause(true); return result.ok;
  }); assert.equal(foreign, true);
  await page.click("[data-studio-action=exit]"); await page.locator(".gx-welcome").waitFor();
  const afterForeign = await clock(page); assert.equal(afterForeign.worldId, "foreign-return-clock"); assert.equal(afterForeign.paused, true);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "studio-return.json"), JSON.stringify({ initial, resumed, intentional, afterCatalogue, afterForeign, errors, scope: "Actual Home/Simple/Complete/catalogue buttons and real advancing clock; intentional/foreign pause retained; light renderer, no visual acceptance" }, null, 2));
  console.log("PASS Studio return: Home resumes its real clock, intentional pause survives both modes, catalogue return is alive and a foreign document is preserved.");
} finally { await browser.close(); }

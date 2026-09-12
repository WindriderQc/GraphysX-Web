import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";
export async function runKidxMissions({ missionIds } = {}) {
  const ART = process.env.SMOKE_ARTIFACTS || "output/verify";
  mkdirSync(ART, { recursive: true });
  const solutions = {
    "first-drive": ["forward", "forward", "forward"],
    "right-turn": ["right", "forward", "forward", "forward"],
    "left-turn": ["left", "forward", "forward", "forward"],
    delivery: ["forward", "forward", "right", "forward", "forward"],
    "return-home": ["forward", "forward", "left", "left", "forward", "forward"],
  };

  let browser, server;
  const errors = [];
  try {
    if (!process.env.SMOKE_BASE) server = await startStaticServer({ root: path.resolve("dist"), port: Number(process.env.SMOKE_PORT || 4588) });
    const base = (process.env.SMOKE_BASE ?? server.url).replace(/\/$/, "");
    browser = await launchSmokeBrowser();
    const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true }));
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
    const capture = (name) => page.screenshot({ path: path.join(ART, `kidx-${name}.png`) });
    const home = async () => { await page.locator(".gx-ev3-exit").click(); };
    await page.goto(`${base}/?app=ev3-lab&view=atelier`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-kidx-mission='first-drive']").waitFor();
    await capture("missions");
    for (const id of missionIds ?? Object.keys(solutions)) {
      const blocks = solutions[id];
      assert.ok(blocks, `Unknown mission: ${id}`);
      console.log(`  running ${id}`);
      await page.locator(`[data-kidx-mission='${id}']`).click();
      await page.evaluate(() => window.advanceTime(0));
      assert.equal((await state()).mission.phase, "running", `${id} must not win at spawn`);
      assert.equal((await state()).guidance.expanded, true, `${id} arrival guidance`);
      assert.equal((await state()).guidance.target, `[data-ev3-block='${blocks[0]}']`);
      for (const block of blocks) await page.locator(`[data-ev3-block='${block}']`).click();
      await page.locator("[data-ev3-run]").click();
      let result;
      for (let burst = 0; burst < 13; burst++) {
        result = await page.evaluate(() => window.advanceTime(500));
        if (result.mission.phase === "complete") break;
      }
      assert.equal(result.mission.phase, "complete", JSON.stringify({ id, result }));
      if (id === "delivery" || id === "return-home") {
        const run = await page.evaluate(() => window.__GRAPHYSX__.rules.status());
        assert.equal(run.checkpointIndex, 1, JSON.stringify(run));
      }
      await capture(`mission-${id}`);
      await home("missions");
    }
    console.log("  ok  selected French missions finish through real block controls and physics, including mandatory checkpoints");
    assert.deepEqual(errors, []);
    console.log("KidX missions smoke passed; no console or page errors.");
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runKidxMissions();
}

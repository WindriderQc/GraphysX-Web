import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:5173";
const outputDir = path.resolve("output/playwright/skybox-orientation");
const skyboxIds = ["clearblue", "skyx", "clearnight", "lostvalley", "winter"];
const headings = [0, 45, 90, 135, 180, 225, 270, 315];

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const consoleProblems = [];
const ignoredDriverWarnings = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") {
    const entry = `${message.type()}: ${message.text()}`;
    if (message.text().includes("GPU stall due to ReadPixels")) {
      ignoredDriverWarnings.push(entry);
    } else {
      consoleProblems.push(entry);
    }
  }
});
page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message}`));

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__GRAPHYSX_DEBUG__));
  await page.evaluate(() => window.__GRAPHYSX_DEBUG__.openSkyboxSelector());
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.skyboxSelectorState()?.loadStatus === "ready");

  for (const skyboxId of skyboxIds) {
    await page.evaluate((id) => {
      window.__GRAPHYSX_DEBUG__.resetSkyboxSelector();
      window.__GRAPHYSX_DEBUG__.selectSkybox(id);
      window.advanceTime(1000);
    }, skyboxId);
    await page.waitForFunction(
      (id) => {
        const state = window.__GRAPHYSX_DEBUG__.skyboxSelectorState();
        return state?.phase === "panorama" && state.activeId === id;
      },
      skyboxId
    );

    for (let index = 0; index < headings.length; index += 1) {
      if (index > 0) {
        await page.evaluate(() => window.advanceTime(7500));
      }
      await page.locator("canvas").screenshot({
        path: path.join(outputDir, `${skyboxId}-${String(headings[index]).padStart(3, "0")}.png`)
      });
    }
  }

  const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  await fs.writeFile(
    path.join(outputDir, "report.json"),
    JSON.stringify({ url, skyboxIds, headings, state, consoleProblems, ignoredDriverWarnings }, null, 2)
  );
  if (consoleProblems.length > 0) {
    throw new Error(`Skybox QA captured browser problems:\n${consoleProblems.join("\n")}`);
  }
} finally {
  await browser.close();
}

console.log(`Skybox QA captured ${skyboxIds.length * headings.length} panorama views in ${outputDir}`);

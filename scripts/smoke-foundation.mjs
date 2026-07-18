import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Point SMOKE_CHROMIUM at a Chromium binary if Playwright's own browser isn't installed;
// otherwise leave unset and Playwright uses its managed build.
const EXE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const out = {};
try {
  // The legacy race-scene player now lives behind ?host=legacy (default is the clean host).
  await page.goto(BASE + "?host=legacy", { waitUntil: "domcontentloaded", timeout: 30000 });

  // Home: platform framing present, archive groups gone.
  await page.waitForSelector('.destination-card[data-mode-id="world-api-lab"]', { timeout: 20000 });
  out.title = (await page.textContent(".panel h1, .panel .title, h1").catch(() => "")) || "";
  out.version = (await page.textContent(".version-badge").catch(() => "")) || "";
  out.homeCardCount = await page.$$eval(".destination-card", (els) => els.length);
  out.homeModeIds = await page.$$eval(".destination-card", (els) => els.map((e) => e.getAttribute("data-mode-id") || e.getAttribute("data-world-family")));
  out.mentionsBallZ = (await page.textContent(".home-destinations").catch(() => "")).toLowerCase().includes("ballz");
  await page.screenshot({ path: path.join(ART, "legacy-home.png"), fullPage: false });

  // Open the Scene Editor (world-api-lab) via the generic data-mode-id dispatch.
  await page.click('.destination-card[data-mode-id="world-api-lab"]');
  await page.waitForTimeout(2500);
  out.editorState = await page.evaluate(() => {
    const w = window;
    let state = null;
    try { state = w.__GRAPHYSX__ && typeof w.__GRAPHYSX__.state === "function" ? w.__GRAPHYSX__.state() : null; } catch (e) { state = { error: String(e) }; }
    return {
      hasGlobal: typeof w.__GRAPHYSX__ === "object" && w.__GRAPHYSX__ !== null,
      hasBridge: typeof w.__GRAPHYSX_AGENT_BRIDGE__ === "object" && w.__GRAPHYSX_AGENT_BRIDGE__ !== null,
      revision: state && state.revision,
      entityCount: state && Array.isArray(state.entities) ? state.entities.length : null,
    };
  });
  await page.screenshot({ path: path.join(ART, "legacy-editor.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

// The legacy route must still boot to the platform home (one destination card, no archive
// framing) with the agent runtime live — otherwise this smoke passes on a blank page.
const ok =
  out.homeCardCount === 1 &&
  !out.mentionsBallZ &&
  !!out.editorState &&
  out.editorState.hasGlobal &&
  out.editorState.hasBridge;
process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);

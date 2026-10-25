import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Cyber Race 1992 as a visitor meets it on the site: the Games & Playgrounds row opens the
// standalone page, the film-style menu takes pad input, a short film run is flown to GAME OVER
// (the computer pilots both sides through the page's test hook), the page never asks the site
// for film clips, and Quit returns to the GraphysX front door.

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const filmRequests = [];
const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("request", (r) => { if (/\/film\//.test(r.url())) filmRequests.push(r.url()); });

const out = {};
try {
  // ---- the shelf row ----
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-welcome .gx-go-games", { timeout: SMOKE_TIMEOUT });
  await page.click(".gx-welcome .gx-go-games");
  await page.waitForSelector('.gx-shelf-row[data-course-id="cyber-race-1992"]', { timeout: SMOKE_TIMEOUT });
  out.row = await page.evaluate(() => {
    const row = document.querySelector('.gx-shelf-row[data-course-id="cyber-race-1992"]');
    return { label: row?.querySelector(".gx-shelf-name")?.textContent ?? null, thumb: !!row?.querySelector(".gx-shelf-thumb") };
  });
  await Promise.all([
    page.waitForURL(/\/cyber-race\.html$/, { timeout: SMOKE_TIMEOUT }),
    page.click('.gx-shelf-row[data-course-id="cyber-race-1992"]'),
  ]);
  await page.waitForFunction(() => !!window.cyberRace, null, { timeout: SMOKE_TIMEOUT });

  // ---- the film-style menu ----
  out.menu = await page.evaluate(() => ({
    visible: !document.getElementById("menu").classList.contains("hidden"),
    icons: document.querySelectorAll("#menu-grid .ico").length,
    caption: document.getElementById("menu-caption").textContent,
  }));
  await page.screenshot({ path: path.join(ART, "cyber-race-menu.png") });

  // Pad: Start launches a race from the menu. A short film run, computer on both sides.
  out.race = await page.evaluate(() => {
    const c = window.cyberRace;
    Object.assign(c.settings, { plan: 0, course: 0, level: 1, mode: 0 });
    c.ui(["pause"]);
    const started = c.phase;
    c.pilots[0].autopilot = true;
    c.pilots[1].cpu = true;
    c.advance(10);
    return { started, phase: c.phase, sectors: c.world.track.sectors.map((s) => s.kind), progressed: c.pilots[0].s > 300 };
  });
  await page.evaluate(() => { window.cyberRace.freeze(true); window.cyberRace.advance(0.01); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ART, "cyber-race-flying.png") });
  out.end = await page.evaluate(() => {
    const c = window.cyberRace;
    c.freeze(false);
    for (let i = 0; i < 12 && c.phase !== "over"; i += 1) c.advance(5);
    return {
      phase: c.phase,
      finished: c.pilots.map((p) => p.finished),
      resultsShown: !document.getElementById("gameover").classList.contains("hidden"),
    };
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(ART, "cyber-race-gameover.png") });

  // ---- Quit returns to the front door ----
  await page.evaluate(() => window.cyberRace.ui(["back"]));
  await page.waitForFunction(() => window.cyberRace.phase === "menu", null, { timeout: SMOKE_TIMEOUT });
  await Promise.all([
    page.waitForURL((url) => !/cyber-race\.html/.test(url.href), { timeout: SMOKE_TIMEOUT }),
    page.click('#menu-grid .ico[data-action="quit"]'),
  ]);
  await page.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });
  out.returned = true;
} catch (error) {
  out.fatal = String(error?.stack ?? error);
} finally {
  await browser.close();
}

out.filmRequests = filmRequests;
out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));

const ok =
  out.row?.label === "Cyber Race 1992" &&
  out.menu?.visible === true &&
  out.menu?.icons >= 20 &&
  out.race?.started === "countdown" &&
  out.race?.phase === "race" &&
  out.race?.progressed === true &&
  out.race?.sectors?.join(",") === "tunnel,mines,shards" &&
  out.end?.phase === "over" &&
  out.end?.resultsShown === true &&
  out.end?.finished?.every(Boolean) &&
  out.returned === true &&
  filmRequests.length === 0;

process.exit(out.fatal || pageErrors.length || consoleErrors.length || !ok ? 1 : 0);

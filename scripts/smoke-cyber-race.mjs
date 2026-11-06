import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Cyber Race 1992 as a visitor meets it on the site: the Games & Playgrounds row opens the
// standalone page, the film-style menu takes pad input, a short film run is flown to GAME OVER
// (the computer pilots both sides through the page's test hook), the page never asks the site
// for film clips, and Quit returns to the GraphysX front door. The Quest menu uses an explicit
// immersive request and stays in the menu if the headset or browser refuses it.

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
    // The card describes the focused button (the start ball on arrival).
    detail: document.getElementById("d-title").textContent,
  }));
  await page.screenshot({ path: path.join(ART, "cyber-race-menu.png") });

  // Pad: Start launches a race from the menu. A short film run, computer on both sides.
  out.race = await page.evaluate(() => {
    const c = window.cyberRace;
    Object.assign(c.settings, { plan: 0, course: 0, level: 1, mode: 0, sound: false });
    c.ui(["pause"]);
    const started = c.phase;
    // Up/down defaults to the flight-stick style: holding W (stick forward) makes Jobe dive.
    c.advance(4);
    const before = c.pilots[0].oy;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", key: "w" }));
    c.advance(0.3);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", key: "w" }));
    const forwardDives = c.pilots[0].oy < before - 0.5;
    c.pilots[0].autopilot = true;
    c.pilots[1].cpu = true;
    c.advance(10);
    const split = !document.getElementById("divider").classList.contains("hidden");
    return { started, forwardDives, split, phase: c.phase, sectors: c.world.track.sectors.map((s) => s.kind), progressed: c.pilots[0].s > 300 };
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

  // ---- Notre version: nine 40-second boards and the 90-second finale, light combat, computer on both sides ----
  await page.evaluate(() => window.cyberRace.ui(["back"]));
  await page.waitForFunction(() => window.cyberRace.phase === "menu", null, { timeout: SMOKE_TIMEOUT });
  out.remaster = await page.evaluate(() => {
    const c = window.cyberRace;
    Object.assign(c.settings, { plan: 3, course: 0, level: 1, mode: 1, sound: false });
    c.start();
    c.pilots[0].autopilot = true;
    c.advance(14);
    // Magnetic field: break one linked mine ahead and let its chain run through the cluster.
    const w = c.world;
    const linked = w.obstacles.filter((o) => o.kind === "mine" && o.chain && w.track.sectorAt(o.s).kind === "mines");
    const seed = linked.find((o) => o.chain.length >= 2 && !o.destroyed && o.s > c.pilots[0].s + 200);
    const group = new Set(seed ? [seed] : []);
    for (const stack = [...group]; stack.length; ) for (const n of stack.pop().chain) if (!group.has(n)) { group.add(n); stack.push(n); }
    if (seed) { w.breakObstacle(seed); w.startChain(seed, 0); }
    c.advance(2);
    return {
      magnetic: { linked: linked.length, group: group.size, chained: [...group].every((o) => o.destroyed), drained: w.blasts.length === 0 },
      // Every ring can be taken (none inside an obstacle or out of reach of a gate).
      unreachableRings: w.rings.filter((r) => !w.ringReachable(r.s, r.ox, r.oy)).length,
      sectors: c.world.track.sectors.map((s) => s.kind),
      lengths: c.world.track.sectors.map((s) => s.end - s.start),
      phased: c.world.track.sectors.every((s) => (s.info.phases || []).length >= 2),
      boosts: c.world.boosts.length,
      progressed: c.pilots[0].s > 600,
    };
  });
  await page.evaluate(() => { window.cyberRace.freeze(true); window.cyberRace.advance(0.01); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ART, "cyber-race-hypertube.png") });
  out.remasterEnd = await page.evaluate(() => {
    const c = window.cyberRace;
    c.freeze(false);
    for (let i = 0; i < 120 && c.phase !== "over"; i += 1) c.advance(5);
    return { phase: c.phase, finished: c.pilots.map((p) => p.finished) };
  });

  // ---- Quit returns to the front door ----
  await page.evaluate(() => window.cyberRace.ui(["back"]));
  await page.waitForFunction(() => window.cyberRace.phase === "menu", null, { timeout: SMOKE_TIMEOUT });
  await Promise.all([
    page.waitForURL((url) => !/cyber-race\.html/.test(url.href), { timeout: SMOKE_TIMEOUT }),
    page.click('#menu-grid .ico[data-action="quit"]'),
  ]);
  await page.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });
  out.returned = true;

  const quest = applySmokeTimeout(await browser.newPage({
    viewport: { width: 390, height: 620 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (Linux; Android 12; Quest 2) OculusBrowser/34.0",
  }));
  quest.on("pageerror", (error) => pageErrors.push(String(error)));
  quest.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await quest.addInitScript(() => {
    const calls = [];
    window.__XR_REQUESTS__ = calls;
    const xr = new EventTarget();
    xr.isSessionSupported = async () => false;
    xr.requestSession = async (mode) => {
      calls.push({ mode, userGesture: navigator.userActivation.isActive });
      throw new DOMException("Test refusal", calls.length === 1 ? "NotAllowedError" : "NotSupportedError");
    };
    Object.defineProperty(navigator, "xr", { value: xr });
  });
  await quest.goto(new URL("cyber-race.html", BASE).href, { waitUntil: "domcontentloaded" });
  await quest.waitForFunction(() => Boolean(window.cyberRace));
  const vr = quest.getByRole("button", { name: "Jouer en VR", exact: true });
  const vrStatus = quest.locator("#vr-status");
  await vrStatus.filter({ hasText: /indisponible ici/ }).waitFor();
  out.quest = await vr.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {
      visible: rect.height >= 48 && rect.left >= 0 && rect.right <= innerWidth && rect.y >= 0 &&
        rect.bottom <= innerHeight && button.contains(hit),
      splitOptionHidden: document.querySelector('[data-group="mode"][data-value="0"]').getClientRects().length === 0,
    };
  });
  await quest.screenshot({ path: path.join(ART, "cyber-race-quest-menu.png") });
  await vr.press("Enter");
  await vrStatus.filter({ hasText: /Accès VR refusé/ }).waitFor();
  out.quest.focusRetained = await vr.evaluate((button) => document.activeElement === button);
  await quest.locator('[data-action="start"]').click();
  await vrStatus.filter({ hasText: /indisponible ici/ }).waitFor();
  Object.assign(out.quest, await quest.evaluate(() => ({
    requests: window.__XR_REQUESTS__,
    phase: window.cyberRace.phase,
    splitHidden: document.getElementById("divider").classList.contains("hidden"),
  })));
  await quest.close();
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
  out.menu?.detail === "LANCER LA COURSE" &&
  out.race?.forwardDives === true &&
  out.race?.split === true &&
  out.race?.started === "countdown" &&
  out.race?.phase === "race" &&
  out.race?.progressed === true &&
  out.race?.sectors?.join(",") === "tunnel,mines,shards" &&
  out.end?.phase === "over" &&
  out.end?.resultsShown === true &&
  out.end?.finished?.every(Boolean) &&
  out.remaster?.sectors?.join(",") === "hypertube,mines,shards,thorns,kaleido,wave,network,furnace,vortex" &&
  // Course 0 (COURT) runs 0.6 x the NORMAL lengths: boards of 2300-3000 m, a 5500 m finale.
  out.remaster?.lengths?.slice(0, -1).every((m) => m >= 1300 && m <= 2200) &&
  out.remaster?.lengths?.at(-1) >= 3000 &&
  out.remaster?.phased === true &&
  out.remaster?.magnetic?.linked >= 20 &&
  out.remaster?.magnetic?.group >= 3 &&
  out.remaster?.magnetic?.chained === true &&
  out.remaster?.magnetic?.drained === true &&
  out.remaster?.unreachableRings === 0 &&
  out.remaster?.boosts > 0 &&
  out.remaster?.progressed === true &&
  out.remasterEnd?.phase === "over" &&
  out.remasterEnd?.finished?.every(Boolean) &&
  out.returned === true &&
  out.quest?.visible === true &&
  out.quest?.splitOptionHidden === true &&
  out.quest?.focusRetained === true &&
  out.quest?.phase === "menu" &&
  out.quest?.splitHidden === true &&
  out.quest?.requests?.length === 2 &&
  out.quest.requests.every(({ mode, userGesture }) => mode === "immersive-vr" && userGesture) &&
  filmRequests.length === 0;

process.exit(out.fatal || pageErrors.length || consoleErrors.length || !ok ? 1 : 0);

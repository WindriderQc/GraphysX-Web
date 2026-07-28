import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
applySmokeTimeout(page);
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(String(error)));

const out = {};
try {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });
  await page.evaluate(() => {
    localStorage.removeItem("graphysx-level-records-v1");
    localStorage.removeItem("graphysx-level-ghosts-v1");
  });
  await page.click(".gx-welcome .gx-go-games");
  await page.waitForSelector('.gx-shelf-cup[data-game-id="archive-cup"]', { timeout: SMOKE_TIMEOUT });
  await page.click('.gx-shelf-cup[data-game-id="archive-cup"]');
  await page.waitForSelector(".gx-cup", { timeout: SMOKE_TIMEOUT });

  out.fresh = await page.evaluate(() => ({
    rounds: document.querySelectorAll(".gx-cup-round").length,
    enabled: [...document.querySelectorAll(".gx-cup-round")].filter((row) => !row.disabled).map((row) => row.dataset.courseId),
    continueText: document.querySelector(".gx-cup-continue")?.textContent ?? null,
    textState: JSON.parse(window.render_game_to_text()).archiveCup,
  }));

  // Seed two honest clears plus a prior Level 1 trace. Reloading exercises the same persistent
  // data path a returning player uses rather than mutating campaign DOM state in place.
  await page.evaluate(() => {
    localStorage.setItem("graphysx-level-records-v1", JSON.stringify({
      "archive-ballz-level1": { bestMs: 29_000, medal: "gold", completedAt: "2026-07-28T00:00:00.000Z" },
      "archive-ballz-level2": { bestMs: 150_000, medal: "silver", completedAt: "2026-07-28T00:00:01.000Z" },
    }));
    localStorage.setItem("graphysx-level-ghosts-v1", JSON.stringify({
      "archive-ballz-level1": {
        elapsedMs: 2_000,
        samples: [
          { tMs: 0, position: [-13, 1.2, 10] },
          { tMs: 2_000, position: [-10, 1.2, 10] },
        ],
      },
    }));
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });
  await page.click(".gx-welcome .gx-go-games");
  await page.click('.gx-shelf-cup[data-game-id="archive-cup"]');
  await page.waitForSelector(".gx-cup", { timeout: SMOKE_TIMEOUT });

  out.returning = await page.evaluate(() => ({
    enabled: [...document.querySelectorAll(".gx-cup-round")].filter((row) => !row.disabled).map((row) => row.dataset.courseId),
    firstResult: document.querySelector('.gx-cup-round[data-course-id="archive-ballz-level1"] .gx-cup-result')?.textContent ?? null,
    secondResult: document.querySelector('.gx-cup-round[data-course-id="archive-ballz-level2"] .gx-cup-result')?.textContent ?? null,
    tallies: [...document.querySelectorAll(".gx-cup-tally strong")].map((item) => item.textContent),
    continueText: document.querySelector(".gx-cup-continue")?.textContent ?? null,
  }));
  await page.screenshot({ path: path.join(ART, "archive-cup-standings.png") });

  await page.click('.gx-cup-round[data-course-id="archive-ballz-level1"]');
  await page.waitForSelector(".gx-bz-hud", { timeout: SMOKE_TIMEOUT });
  // Pausing is the documented programmatic-countdown escape hatch. It lets the play view
  // start its poll without waiting through presentation, then the saved trace materialises.
  await page.evaluate(() => window.__GRAPHYSX__.pause(true));
  await page.waitForFunction(() => window.__GRAPHYSX__.query({ tag: "personal-ghost" }).length === 1, null, { timeout: SMOKE_TIMEOUT });
  out.playing = await page.evaluate(() => {
    const ghost = window.__GRAPHYSX__.query({ tag: "personal-ghost" })[0];
    const text = JSON.parse(window.render_game_to_text());
    return {
      mode: window.__GRAPHYSX_HOST__.mode,
      ghost: ghost ? { id: ghost.id, ephemeral: ghost.ephemeral, physics: ghost.physics, position: ghost.position } : null,
      textCup: text.archiveCup,
      textGhost: text.personalGhost,
    };
  });
  await page.screenshot({ path: path.join(ART, "archive-cup-personal-ghost.png") });

  await page.click(".gx-bz-exit");
  await page.waitForSelector(".gx-cup", { timeout: SMOKE_TIMEOUT });
  out.returned = await page.evaluate(() => ({
    cupVisible: Boolean(document.querySelector(".gx-cup")),
    welcomeAbsent: !document.querySelector(".gx-welcome"),
    mode: window.__GRAPHYSX_HOST__.mode,
    state: JSON.parse(window.render_game_to_text()).archiveCup,
  }));
} catch (error) {
  out.fatal = String(error);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  out.fresh?.rounds === 9
  && JSON.stringify(out.fresh?.enabled) === JSON.stringify(["archive-ballz-level1"])
  && out.fresh?.continueText === "Start the Cup"
  && out.fresh?.textState?.completed === 0
  && JSON.stringify(out.returning?.enabled) === JSON.stringify(["archive-ballz-level1", "archive-ballz-level2", "archive-level3-v2"])
  && /GOLD/.test(out.returning?.firstResult ?? "")
  && /SILVER/.test(out.returning?.secondResult ?? "")
  && JSON.stringify(out.returning?.tallies) === JSON.stringify(["2/9", "175"])
  && out.returning?.continueText === "Continue · Round 3"
  && out.playing?.mode === "play"
  && out.playing?.ghost?.id === "personal-best-ghost"
  && out.playing?.ghost?.ephemeral === true
  && out.playing?.ghost?.physics === null
  && out.playing?.textCup?.playingCourseId === "archive-ballz-level1"
  && out.playing?.textGhost?.available === true
  && out.playing?.textGhost?.visible === true
  && out.returned?.cupVisible === true
  && out.returned?.welcomeAbsent === true
  && out.returned?.mode === "scene"
  && out.returned?.state?.visible === true;

process.exit(out.fatal || pageErrors.length || consoleErrors.length || !ok ? 1 : 0);

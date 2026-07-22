import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

// Great Slide's proof-to-play loop through the real front door. This covers the seams the
// collider smoke deliberately does not: Games discovery, paused exact-asset activation,
// rules-subject keyboard control, ordered gates, results, replay, and the showroom return.

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const badResponses = [];
const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("response", (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });

const out = {};
try {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => Boolean(window.__GRAPHYSX_HOST__), null, { timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-welcome .gx-go-games", { timeout: SMOKE_TIMEOUT });
  await page.click(".gx-welcome .gx-go-games");
  await page.waitForSelector('.gx-shelf-row[data-course-id="archive-great-slide"]', { timeout: SMOKE_TIMEOUT });

  out.shelf = await page.evaluate(() => {
    const row = document.querySelector('.gx-shelf-row[data-course-id="archive-great-slide"]');
    const thumb = row?.querySelector("img.gx-shelf-thumb");
    return {
      listed: Boolean(row),
      label: row?.querySelector(".gx-shelf-name")?.textContent ?? "",
      meta: row?.querySelector(".gx-shelf-meta")?.textContent ?? "",
      thumbnailLoaded: Boolean(thumb?.complete && thumb.naturalWidth > 0),
    };
  });

  await page.click('.gx-shelf-row[data-course-id="archive-great-slide"]');
  await page.waitForFunction(() => {
    const terrain = window.__GRAPHYSX__.query({ ids: ["great-slide-terrain"] })[0];
    return window.__GRAPHYSX_HOST__.mode === "play"
      && terrain?.asset?.status === "ready"
      && terrain.physics?.collider?.effective === "trimesh"
      && window.__GRAPHYSX__.state()?.paused === false;
  }, null, { timeout: SMOKE_TIMEOUT });
  await page.waitForSelector(".gx-bz-hud", { timeout: SMOKE_TIMEOUT });

  out.loaded = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const terrain = api.query({ ids: ["great-slide-terrain"] })[0];
    const run = api.rules.status();
    return {
      mode: window.__GRAPHYSX_HOST__.mode,
      paused: api.state()?.paused,
      hudCourse: document.querySelector(".gx-bz-course")?.textContent ?? "",
      terrain: terrain?.physics?.collider ?? null,
      rules: run ? {
        phase: run.phase,
        checkpointCount: run.checkpointCount,
        collectibleCount: run.collectibleCount,
        nextCheckpointId: run.nextCheckpointId,
      } : null,
      exportRules: api.export()?.rules ?? null,
    };
  });
  out.hooks = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const elapsedBefore = api.rules.status()?.elapsedSeconds ?? null;
    const zero = window.advanceTime(0);
    const elapsedAfter = api.rules.status()?.elapsedSeconds ?? null;
    const projection = JSON.parse(window.render_game_to_text());
    return {
      zeroValue: zero?.value ?? null,
      zeroWasNoop: elapsedBefore === elapsedAfter,
      projectedWorld: projection.world?.id ?? null,
      projectedPlayer: projection.players?.[0]?.id ?? null,
    };
  });

  // Put the course under deterministic control, then drive its real keyboard binding. The
  // immediate negative-x velocity proves the play layer targeted rules.subjectId rather than
  // the old hard-coded grid ball.
  await page.evaluate(() => {
    window.__GRAPHYSX__.pause(true);
    window.__GRAPHYSX__.rules.reset();
  });
  const before = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["great-slide-ball"] })[0]);
  await page.keyboard.press("ArrowLeft");
  const afterInput = await page.evaluate(() => window.__GRAPHYSX__.query({ ids: ["great-slide-ball"] })[0]);
  out.input = {
    beforeVelocityX: before?.physics?.linearVelocity?.[0] ?? null,
    afterVelocityX: afterInput?.physics?.linearVelocity?.[0] ?? null,
  };

  const trace = [];
  for (let index = 0; index < 24; index += 1) {
    const sample = await page.evaluate(() => {
      const api = window.__GRAPHYSX__;
      api.step(0.5);
      const ball = api.query({ ids: ["great-slide-ball"] })[0];
      const run = api.rules.status();
      return {
        position: ball?.position ?? null,
        finite: Boolean(ball?.position?.every(Number.isFinite) && ball.physics?.linearVelocity?.every(Number.isFinite)),
        phase: run?.phase ?? null,
        checkpointIndex: run?.checkpointIndex ?? null,
      };
    });
    trace.push(sample);
    if (index === 13) await page.screenshot({ path: path.join(ART, "great-slide-gameplay.png") });
    if (sample.phase === "complete") break;
  }
  out.run = { trace, final: trace.at(-1) ?? null };

  await page.waitForSelector(".gx-bz-win", { timeout: SMOKE_TIMEOUT });
  out.results = await page.evaluate(() => ({
    title: document.querySelector(".gx-bz-win-title")?.textContent ?? "",
    scoreCells: document.querySelectorAll(".gx-bz-win-stat").length,
    replay: Boolean(document.querySelector(".gx-bz-win-again")),
    back: Boolean(document.querySelector(".gx-bz-win-actions .gx-bz-win-btn:not(.gx-bz-win-again)")),
  }));
  await page.screenshot({ path: path.join(ART, "great-slide-gravity-run.png") });

  await page.click(".gx-bz-win-again");
  await page.waitForFunction(() => {
    const api = window.__GRAPHYSX__;
    const terrain = api.query({ ids: ["great-slide-terrain"] })[0];
    return api.rules.status()?.phase === "running"
      && api.state()?.paused === false
      && terrain?.physics?.collider?.effective === "trimesh"
      && Boolean(document.querySelector(".gx-bz-hud"));
  }, null, { timeout: SMOKE_TIMEOUT });
  out.replay = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const ball = api.query({ ids: ["great-slide-ball"] })[0];
    return {
      phase: api.rules.status()?.phase,
      position: ball?.position,
      velocity: ball?.physics?.linearVelocity,
      winGone: !document.querySelector(".gx-bz-win"),
      hudShown: Boolean(document.querySelector(".gx-bz-hud")),
    };
  });

  await page.click(".gx-bz-exit");
  await page.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });
  out.returned = await page.evaluate(() => ({
    mode: window.__GRAPHYSX_HOST__.mode,
    showroomEntities: window.__GRAPHYSX__.query({ tag: "showroom" }).length,
    hudGone: !document.querySelector(".gx-bz-hud"),
  }));
  // Release the happy-path WebGL context before opening the isolated failure case. SwiftShader
  // can emit spurious shader validation errors when two full product canvases render at once.
  await page.close();

  // An exact asset can fail after loadStarter has already replaced the world. The launcher must
  // roll that partial game back while keeping the shelf open and actionable.
  const failureContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const failurePage = await failureContext.newPage();
  applySmokeTimeout(failurePage);
  await failurePage.route("**/assets/ports/archive-slide-large.json", (route) => route.abort("failed"));
  await failurePage.goto(BASE, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await failurePage.waitForSelector(".gx-welcome .gx-go-games", { timeout: SMOKE_TIMEOUT });
  await failurePage.click(".gx-welcome .gx-go-games");
  // The intentional asset abort can make Chromium report a pending navigation on a remote
  // origin even though the button does not navigate. We assert the resulting app state below;
  // do not let Playwright's unrelated post-click navigation wait mask that evidence.
  await failurePage.click('.gx-shelf-row[data-course-id="archive-great-slide"]', { noWaitAfter: true });
  await failurePage.waitForSelector('.gx-shelf-row[data-course-id="archive-great-slide"].gx-shelf-row--error', { timeout: SMOKE_TIMEOUT });
  out.failedLaunch = await failurePage.evaluate(() => ({
    mode: window.__GRAPHYSX_HOST__.mode,
    paused: window.__GRAPHYSX__.state()?.paused,
    shelfShown: Boolean(document.querySelector(".gx-shelf")),
    welcomeHidden: !document.querySelector(".gx-welcome"),
    showroomEntities: window.__GRAPHYSX__.query({ tag: "showroom" }).length,
    slideEntities: window.__GRAPHYSX__.query({ ids: ["great-slide-terrain", "great-slide-ball"] }).length,
    hudGone: !document.querySelector(".gx-bz-hud"),
    error: document.querySelector('.gx-shelf-row[data-course-id="archive-great-slide"] .gx-shelf-meta')?.textContent ?? "",
  }));
  await failurePage.click(".gx-shelf-close");
  await failurePage.waitForSelector(".gx-welcome", { timeout: SMOKE_TIMEOUT });
  out.failedLaunch.closeRestoredWelcome = true;
  await failureContext.close();
} catch (error) {
  out.fatal = String(error);
}

out.badResponses = badResponses;
out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
const report = JSON.stringify(out, null, 2);
writeFileSync(path.join(ART, "great-slide-results.json"), report);
console.log(report);
await browser.close();

const final = out.run?.final;
const ok =
  out.shelf?.listed === true &&
  out.shelf?.thumbnailLoaded === true &&
  /Gravity Run/.test(out.shelf?.label ?? "") &&
  /exact recovered mesh/.test(out.shelf?.meta ?? "") &&
  out.loaded?.mode === "play" &&
  out.loaded?.paused === false &&
  /Great Slide/.test(out.loaded?.hudCourse ?? "") &&
  out.loaded?.terrain?.effective === "trimesh" &&
  out.loaded?.terrain?.vertexCount === 100 &&
  out.loaded?.terrain?.triangleCount === 92 &&
  out.loaded?.rules?.phase === "running" &&
  out.loaded?.rules?.checkpointCount === 2 &&
  out.loaded?.rules?.collectibleCount === 0 &&
  out.loaded?.exportRules?.subjectId === "great-slide-ball" &&
  out.loaded?.exportRules?.finish?.triggerId === "great-slide-finish" &&
  out.hooks?.zeroValue === 0 &&
  out.hooks?.zeroWasNoop === true &&
  out.hooks?.projectedWorld === "graphysx-archive-great-slide" &&
  out.hooks?.projectedPlayer === "great-slide-ball" &&
  Number.isFinite(out.input?.beforeVelocityX) &&
  out.input.afterVelocityX < out.input.beforeVelocityX - 1 &&
  final?.phase === "complete" &&
  final?.checkpointIndex === 2 &&
  final?.finite === true &&
  final?.position?.[0] < -21 &&
  final?.position?.[1] > -6 &&
  /Great Slide: Gravity Run Complete/.test(out.results?.title ?? "") &&
  out.results?.scoreCells >= 2 &&
  out.results?.replay === true &&
  out.results?.back === true &&
  out.replay?.phase === "running" &&
  out.replay?.winGone === true &&
  out.replay?.hudShown === true &&
  Math.abs((out.replay?.position?.[0] ?? 0) - 20) < 0.5 &&
  out.returned?.mode === "scene" &&
  out.returned?.showroomEntities > 0 &&
  out.returned?.hudGone === true &&
  out.failedLaunch?.mode === "scene" &&
  out.failedLaunch?.paused === false &&
  out.failedLaunch?.shelfShown === true &&
  out.failedLaunch?.welcomeHidden === true &&
  out.failedLaunch?.showroomEntities > 0 &&
  out.failedLaunch?.slideEntities === 0 &&
  out.failedLaunch?.hudGone === true &&
  out.failedLaunch?.error.length > 0 &&
  out.failedLaunch?.closeRestoredWelcome === true &&
  badResponses.length === 0 && consoleErrors.length === 0 && pageErrors.length === 0;

process.exitCode = out.fatal || !ok ? 1 : 0;

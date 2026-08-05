// Results, leaderboards and ghosts, through the product.
//
// The protocol smoke proves the server. This proves a player can feel it: finish a course,
// have the time land on a board, see the board on the win panel, and race someone else's
// ghost.
//
// The assertion that matters most is the last one — **with no store configured, nothing here
// makes a network request at all**. `smoke-archive-cup` runs exactly that way and asserts zero
// console errors, and so does every visitor to the static production deploy. A guard that only
// catches the error is not enough: Chromium logs a failed request itself, before application
// code can see it.

import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSceneStore } from "../server/scene-store.mjs";
import { startStaticServer } from "./static-server.mjs";
import { applySmokeTimeout, launchSmokeBrowser, SMOKE_TIMEOUT } from "./smoke-harness.mjs";
import { check, report, sleep } from "./live-session-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACTS = process.env.SMOKE_ARTIFACTS || path.join(ROOT, "output", "smoke");
const TOKEN = "results-browser-token";
const COURSE = "archive-ballz-level1";
const VERSIONED_GRID = "smoke-results-grid";

const results = [];
const problems = [];
let store = null;
let statics = null;
let browser = null;
let dir = null;

function watch(page, label) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (/favicon/i.test(message.text())) return;
    problems.push(`${label} console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`${label} pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (/ERR_ABORTED/.test(failure)) return;
    problems.push(`${label} requestfailed: ${request.url()} ${failure}`);
  });
}

const trace = (elapsedMs, samples = 10) => ({
  elapsedMs,
  samples: Array.from({ length: samples }, (_, index) => ({
    tMs: Math.round((index * elapsedMs) / (samples - 1)),
    position: [index * 0.4, 1.2, -index * 0.2],
  })),
});

const seed = (base, body) => fetch(`${base}/results`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify(body),
});

try {
  await mkdir(ARTIFACTS, { recursive: true });
  dir = await mkdtemp(path.join(tmpdir(), "graphysx-results-browser-"));
  store = await startSceneStore({ port: 0, dir, token: TOKEN, origins: null, datalakeDir: null });
  statics = await startStaticServer({ root: path.join(ROOT, "dist"), port: 0 });
  const pageBase = statics.url.replace(/\/+$/, "");
  const courseVersion = `code:${COURSE}`;

  // Two rivals already on the board, one of them with a shareable ghost.
  await seed(store.url, {
    recordId: COURSE, actorId: "rival-fast", label: "Fast Rival", courseVersion, rulesVersion: "v1",
    elapsedMs: 21_000, medal: "gold", outcome: "complete", ghost: trace(21_000),
  });
  await seed(store.url, {
    recordId: COURSE, actorId: "rival-slow", label: "Slow Rival", courseVersion, rulesVersion: "v1",
    elapsedMs: 88_000, medal: "bronze", outcome: "complete",
  });

  browser = await launchSmokeBrowser({ args: ["--no-sandbox", "--use-gl=swiftshader", "--disable-dev-shm-usage"] });

  const open = async (label, query) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = applySmokeTimeout(await context.newPage());
    watch(page, label);
    await page.goto(`${pageBase}/${query}`, { waitUntil: "domcontentloaded" });
    const deadline = Date.now() + SMOKE_TIMEOUT;
    while (!(await page.evaluate(() => Boolean(window.__GRAPHYSX__)))) {
      if (Date.now() > deadline) throw new Error(`${label}: the runtime never came up`);
      await sleep(250);
    }
    return { context, page };
  };

  // --- 1. the storeless case, first, because it is the one that regresses -------------------

  const bare = await open("storeless", "?intro=0");
  await sleep(2500);
  const bareRequests = await bare.page.evaluate(() =>
    // `/results/` or `/results?` — an API call. NOT `/assets/results-client-<hash>.js`, which
    // the previous `\b` boundary happily matched and reported as a request the page never made.
    performance.getEntriesByType("resource")
      .filter((entry) => /\/results(\/|\?|$)/.test(new URL(entry.name).pathname + new URL(entry.name).search)).length);
  check(results, "with no store configured, the page makes no results request at all",
    bareRequests === 0, `${bareRequests} request(s)`);
  const bareGlobals = await bare.page.evaluate(() => ({
    client: typeof window.__GRAPHYSX_RESULTS__,
    ui: typeof window.__GRAPHYSX_RESULTS_UI__,
  }));
  check(results, "the results client is not even loaded without a store",
    bareGlobals.client === "undefined" && bareGlobals.ui === "undefined", JSON.stringify(bareGlobals));
  await bare.context.close();

  // --- 2. with a store: submit, board, ghost --------------------------------------------------

  // `#storeToken=` is how the product hands a browser a write credential: consumed once and
  // kept in sessionStorage. Without it a visitor reads boards but cannot post — which the
  // tokenless assertions below cover.
  const player = await open("player",
    `?store=${encodeURIComponent(store.url)}&actor=ada&intro=0#storeToken=${encodeURIComponent(TOKEN)}`);
  const deadline = Date.now() + SMOKE_TIMEOUT;
  while (!(await player.page.evaluate(() => Boolean(window.__GRAPHYSX_SCENE_BROWSER__)))) {
    if (Date.now() > deadline) throw new Error("the store never answered in the page");
    await sleep(250);
  }
  await sleep(1200); // the results client is configured on the same dynamic-import tick

  const deadlineGlobals = Date.now() + SMOKE_TIMEOUT;
  while (!(await player.page.evaluate(() => Boolean(window.__GRAPHYSX_RESULTS__)))) {
    if (Date.now() > deadlineGlobals) throw new Error("the results client never configured against the store");
    await sleep(200);
  }
  const configured = await player.page.evaluate(() => ({
    configured: window.__GRAPHYSX_RESULTS__.resultsConfigured(),
    actorId: window.__GRAPHYSX_RESULTS__.resultsActorId(),
  }));
  check(results, "with a store, the client configures itself and adopts ?actor=",
    configured.configured === true && configured.actorId === "ada", JSON.stringify(configured));
  check(results, "a token-bearing browser may record a time",
    await player.page.evaluate(() => window.__GRAPHYSX_RESULTS__.resultsCanSubmit()) === true);

  // Drive the public client directly: this smoke is about the results path, and playing a
  // full course to a win under software WebGL is the archive-cup smoke's job, not this one.
  const submitted = await player.page.evaluate(async (args) => {
    const receipt = await window.__GRAPHYSX_RESULTS__.submitResult({
      recordId: args.recordId,
      actorId: "ada",
      label: "Ada",
      courseVersion: args.courseVersion,
      rulesVersion: "v1",
      elapsedMs: 45_000,
      medal: "silver",
      outcome: "complete",
    });
    return receipt;
  }, { recordId: COURSE, courseVersion });
  check(results, "a finished run submits from the browser",
    submitted?.ok === true && submitted.isNewBest === true, JSON.stringify(submitted));
  check(results, "the receipt the browser gets is labelled client-attested",
    submitted?.trust === "client-attested", String(submitted?.trust));
  check(results, "the browser's time is ranked against the seeded rivals",
    submitted?.rank === 2, `rank ${submitted?.rank}`);

  const board = await player.page.evaluate(
    (args) => window.__GRAPHYSX_RESULTS__.fetchLeaderboard(args.recordId, args.courseVersion, "v1", 8),
    { recordId: COURSE, courseVersion });
  check(results, "the browser reads a leaderboard",
    board?.entries?.length === 3, `${board?.entries?.length} entries`);
  check(results, "the board is ordered fastest first",
    board.entries.map((entry) => entry.actorId).join(",") === "rival-fast,ada,rival-slow",
    board.entries.map((entry) => entry.actorId).join(","));
  check(results, "the board carries its trust label to the browser",
    board.trust === "client-attested" && /not replayed or verified/.test(board.trustNote ?? ""), board.trust);

  // --- 3. the rendered panel ----------------------------------------------------------------

  const rendered = await player.page.evaluate((args) => {
    const element = window.__GRAPHYSX_RESULTS_UI__.buildLeaderboardPanel(args.board, { actorId: "ada", onRaceGhost: () => {} });
    if (!element) return null;
    element.id = "smoke-leaderboard";
    document.body.append(element);
    return {
      rows: [...element.querySelectorAll(".gx-lb-row")].map((row) => ({
        actor: row.dataset.actor,
        you: row.dataset.you,
        label: row.getAttribute("aria-label"),
        race: Boolean(row.querySelector(".gx-lb-race")),
      })),
      trust: element.querySelector(".gx-lb-trust")?.textContent ?? "",
    };
  }, { board });

  check(results, "the panel renders one row per entry", rendered?.rows.length === 3, JSON.stringify(rendered?.rows?.length));

  // Assertions above read aria-labels, which this panel builds from the data — so they stay
  // green while the visible text is empty or invisible. That is exactly what happened: the
  // names and times rendered black on a dark panel. Read the painted pixels' colour instead.
  const legible = await player.page.evaluate(() => {
    const luminance = (colour) => {
      const [r, g, b] = colour.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const channel = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const read = (selector) => {
      const node = document.querySelector(`#smoke-leaderboard ${selector}`);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        text: node.textContent ?? "",
        luminance: luminance(getComputedStyle(node).color),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    return { who: read(".gx-lb-who"), time: read(".gx-lb-time") };
  });
  check(results, "the player name is actually rendered, not just in the aria-label",
    legible.who?.text === "Fast Rival" && legible.who.width > 0 && legible.who.height > 0, JSON.stringify(legible.who));
  check(results, "the time is actually rendered", legible.time?.text === "0:21.000" && legible.time.width > 0, JSON.stringify(legible.time));
  check(results, "the panel paints legible light text rather than inheriting black onto a dark panel",
    legible.who.luminance > 0.5 && legible.time.luminance > 0.5,
    `luminance who=${legible.who?.luminance?.toFixed(2)} time=${legible.time?.luminance?.toFixed(2)}`);
  check(results, "the local player's row is marked",
    rendered.rows.find((row) => row.actor === "ada")?.you === "true", JSON.stringify(rendered.rows));
  check(results, "rows carry accessible labels with rank, name and time",
    /1\. Fast Rival, 0:21\.000/.test(rendered.rows[0].label ?? ""), rendered.rows[0].label);
  check(results, "the panel states the trust level in the UI, not just the payload",
    /validated, not verified/i.test(rendered.trust), rendered.trust);
  check(results, "a rival with a ghost offers a race button",
    rendered.rows.find((row) => row.actor === "rival-fast")?.race === true, JSON.stringify(rendered.rows));
  check(results, "a rival without a ghost does not",
    rendered.rows.find((row) => row.actor === "rival-slow")?.race === false, JSON.stringify(rendered.rows));
  check(results, "the player is not offered a race against themselves",
    rendered.rows.find((row) => row.actor === "ada")?.race === false, JSON.stringify(rendered.rows));

  // --- 4. ghost download and playback shape ---------------------------------------------------

  const ghost = await player.page.evaluate(
    (args) => window.__GRAPHYSX_RESULTS__.fetchGhost(args.recordId, "rival-fast", args.courseVersion, "v1"),
    { recordId: COURSE, courseVersion });
  check(results, "a rival's ghost downloads", ghost?.samples?.length === 10, `${ghost?.samples?.length} samples`);
  check(results, "the downloaded ghost is in the shape the player already plays back",
    ghost.samples.every((sample) => Number.isFinite(sample.tMs) && sample.position.length === 3)
    && ghost.elapsedMs === 21_000,
    JSON.stringify(ghost).slice(0, 120));

  const playable = await player.page.evaluate((args) => {
    const createPersonalGhostSession = window.__GRAPHYSX_RESULTS_UI__.createGhostSession;
    const api = window.__GRAPHYSX__;
    const subject = api.query({ tag: "player" })[0] ?? api.query()[0];
    if (!subject) return { error: "no subject entity" };
    const session = createPersonalGhostSession(api, subject.id, "smoke-course", {
      challenger: args.ghost, challengerLabel: "Fast Rival",
    });
    session.tick(10_500);
    const spawned = api.query({ tag: "personal-ghost" });
    const state = window.__GRAPHYSX_HOST__ ? null : null;
    const position = spawned[0]?.position ?? null;
    const finishSession = createPersonalGhostSession(api, subject.id, "smoke-finish-dedupe");
    finishSession.tick(500);
    finishSession.tick(1_000);
    finishSession.finish(1_000, true);
    const finishTimes = finishSession.recording()?.samples.map((sample) => sample.tMs) ?? null;
    finishSession.dispose();
    session.dispose();
    const afterDispose = api.query({ tag: "personal-ghost" }).length;
    return { spawnedCount: spawned.length, position, afterDispose, state, finishTimes };
  }, { ghost });

  check(results, "racing a rival's ghost spawns exactly one ghost entity",
    playable?.spawnedCount === 1, JSON.stringify(playable));
  check(results, "the ghost is positioned by interpolating the rival's trace",
    Array.isArray(playable.position) && playable.position.every(Number.isFinite)
    && Math.abs(playable.position[0] - 1.8) < 0.6,
    JSON.stringify(playable.position));
  check(results, "disposing the session removes the ghost", playable.afterDispose === 0, String(playable.afterDispose));
  check(results, "a finish sampled on the same poll keeps strictly increasing ghost times",
    JSON.stringify(playable.finishTimes) === JSON.stringify([500, 1_000]),
    JSON.stringify(playable.finishTimes));

  await player.page.screenshot({ path: path.join(ARTIFACTS, "results-leaderboard.png") });

  // --- 5. editable grid revision through the real play/finish path ---------------------------

  const grid = await player.page.evaluate((id) => {
    const api = window.__GRAPHYSX__;
    const created = api.levels.create({
      id,
      label: "Results revision grid",
      width: 3,
      height: 1,
      tiles: ["start", "wall", "finish"],
      race: { laps: 1, requireRings: false, requireHalfway: false },
    });
    if (!created.ok) return { error: created.error };

    // Creation is revision 0; changing a real cell makes the materialized course revision 1.
    const edited = api.levels.patch(
      id,
      [{ x: 1, y: 0, tile: "floor" }],
      { expectedRevision: created.revision },
    );
    if (!edited.ok) return { error: edited.error };

    const played = api.levels.play(id);
    return {
      revision: edited.revision,
      played: played.ok,
      error: played.ok ? null : played.error,
    };
  }, VERSIONED_GRID);
  check(results, "an editable grid is patched to revision 1 and played through the product",
    grid.revision === 1 && grid.played === true, JSON.stringify(grid));

  await player.page.waitForFunction((id) =>
    window.__GRAPHYSX__.state()?.world.id === `ballz-level-${id}`
    && window.__GRAPHYSX__.rules.status()?.phase === "running"
    && Boolean(document.querySelector(".gx-bz-hud")),
  VERSIONED_GRID);

  // Pausing cancels the presentation countdown on its next 800 ms tick. Waiting for that tick
  // prevents its later GO reset from racing this deterministic finish.
  await player.page.evaluate(() => window.__GRAPHYSX__.pause(true));
  await sleep(900);
  // Let the ordinary 200 ms play-layer poll observe two increasing simulation times. That
  // produces a structurally valid personal ghost; finishing in one synchronous evaluate
  // would give the store a one-sample trace and correctly reject the entire result.
  await player.page.evaluate(() => window.__GRAPHYSX__.step(0.5));
  await sleep(250);
  await player.page.evaluate(() => window.__GRAPHYSX__.step(0.5));
  await sleep(250);
  await player.page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const gate = api.query({ ids: ["ballz-finish-gate"] })[0];
    if (!gate) throw new Error("the versioned grid has no finish gate");
    const moved = api.update("ballz-ball", { transform: { position: [...gate.position] } });
    if (!moved.ok) throw new Error(moved.error ?? "could not move the ball to the finish");
    for (let index = 0; index < 30; index += 1) api.step(1 / 60);
  });
  await player.page.waitForFunction(() => window.__GRAPHYSX__.rules.status()?.phase === "complete");

  const readGridBoard = async (version) => {
    const query = new URLSearchParams({ courseVersion: version, rulesVersion: "v1" });
    const response = await fetch(`${store.url}/results/${VERSIONED_GRID}/leaderboard?${query}`);
    return response.json();
  };
  const levelVersion = `level:${VERSIONED_GRID}@1`;
  let revisionBoard = { entries: [] };
  let codeBoard = { entries: [] };
  const gridBoardDeadline = Date.now() + SMOKE_TIMEOUT;
  // The product submits from the 200 ms play-layer poll and intentionally does not await it.
  // Poll the authority rather than coupling this version check to the panel's paint timing.
  while (Date.now() < gridBoardDeadline) {
    [revisionBoard, codeBoard] = await Promise.all([
      readGridBoard(levelVersion),
      readGridBoard(`code:${VERSIONED_GRID}`),
    ]);
    if (revisionBoard.entries.some((entry) => entry.actorId === "ada")) break;
    await sleep(200);
  }
  check(results, "the editable grid records Ada on its revision-1 board",
    revisionBoard.courseVersion === levelVersion
    && revisionBoard.entries.some((entry) => entry.actorId === "ada"),
    JSON.stringify(revisionBoard));
  check(results, "the editable grid does not fall back to the code-version board",
    codeBoard.total === 0 && codeBoard.entries.length === 0,
    JSON.stringify(codeBoard));

  check(results, "no console errors, page errors or failed requests in any browser",
    problems.length === 0, problems.slice(0, 4).join(" | "));

  await player.context.close();
} catch (error) {
  check(results, "smoke-results-browser threw", false, error instanceof Error ? error.stack : String(error));
} finally {
  if (browser) await browser.close();
  if (statics) await statics.close();
  if (store) await store.close();
  if (dir) await rm(dir, { recursive: true, force: true });
}

report(results, "smoke-results-browser");

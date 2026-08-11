// Records a driving line for `src/agent-coach.ts`, and prints it ready to paste.
//
// A dev tool, not a gate check. It is checked in because it is the ONLY supported way to add a
// coached course: the shipped programs are recordings, and hand-writing one would be the coach
// guessing at a driving line it has never taken.
//
// How it works, and why the two halves differ. Here the pilot is *closed-loop*: it reads the
// ball's position every tick and re-aims at the next waypoint, which is how a route gets found
// at all. What it prints is only the inputs it issued, replayed blind at play time — a coach
// that could read positions while driving would be a driving aid, and the "baseline" it
// produced would be a time no player could match.
//
//   SMOKE_BASE=http://127.0.0.1:4188/ node scripts/record-coach-line.mjs --level starter-level
//
// Point SMOKE_BASE at a dev server or a built page; either serves the same API. Then check the
// recording by replaying it — `runCoachProgram` twice and `coachRunsAgree` — before pasting it.

import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { planCoachRoute } from "../src/coach-route.ts";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const argv = process.argv.slice(2);
const levelId = argv[argv.indexOf("--level") + 1] ?? "starter-level";
if (!levelId || levelId.startsWith("--")) {
  console.error("usage: node scripts/record-coach-line.mjs --level <levelId>");
  process.exit(2);
}
// Generous by default: an 11x11 grid finishes in 12s, but a course is allowed to be long, and
// a recorder that gave up early would print a line that does not finish.
const maxMs = Number(argv.includes("--max-ms") ? argv[argv.indexOf("--max-ms") + 1] : 45_000);
// Two heuristics that help a pilot get AROUND a maze and hurt the thing that makes a recording
// shippable. Measured on the starter course: with them the closed-loop drive is faster (10.77s
// against 11.37s) and the resulting inputs DO NOT finish the course when replayed blind. Off by
// default, because a line that does not replay is not a baseline.
//
//   --maze  advance on the rules layer's verdict, and aim through a target being chased.
const maze = argv.includes("--maze");

const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
let result = null;
try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__GRAPHYSX__, null, { timeout: SMOKE_TIMEOUT });
  // Arm the course FIRST, then plan. The lap count has to come from the armed run rather than
  // the level definition: `archive-ballz-level1` declares `laps: 1` and its run reports 3,
  // because the archive race records override it. Planning from the definition produced a
  // one-lap route that drove twenty rings and a gate perfectly and then never finished.
  //
  // The grid is read from the page and the route is planned HERE, in Node, against the same
  // module the unit tests cover. Planning inside `page.evaluate` would mean either shipping a
  // second copy of the router or importing raw TypeScript the built page does not serve.
  const level = await page.evaluate(async (id) => {
    const api = window.__GRAPHYSX__;
    const found = api.levels.get(id);
    if (!found) return null;
    api.levels.play(id);
    // `levels.play` is asynchronous — the run is unarmed when it returns and reads
    // `phase: "running"` about 800ms later.
    for (let wait = 0; wait < 80 && !api.rules.status(); wait += 1) await new Promise((resolve) => setTimeout(resolve, 100));
    const run = api.rules.status();
    return {
      width: found.width, height: found.height, cellSize: found.cellSize, tiles: found.tiles,
      label: found.label, laps: run?.laps ?? found.race?.laps ?? 1, armed: !!run,
    };
  }, levelId);
  if (!level) {
    console.error(`Could not record a line: no level "${levelId}"`);
    process.exit(1);
  }
  if (!level.armed) {
    console.error("Could not record a line: the run never armed");
    process.exit(1);
  }
  const route = planCoachRoute(level, { laps: level.laps });
  console.error(`${level.label} · ${level.width}x${level.height} · ${level.laps} lap${level.laps === 1 ? "" : "s"}`);
  if (route.unreachable.length > 0) {
    // Not fatal on its own — a course can be completable with an unroutable decoration — but
    // it is never a detail, because an uncollectable ring makes the course uncompletable.
    console.error(`No walkable route to: ${route.unreachable.join(", ")}`);
  }
  if (route.waypoints.length === 0) {
    console.error("Could not record a line: the level has nothing to drive to");
    process.exit(1);
  }

  result = await page.evaluate(async ({ levelId, maxMs, ordered, label, maze }) => {
    const api = window.__GRAPHYSX__;
    const TICK = 1000 / 60;

    // Re-play the course before driving, even though the planning pass already armed it.
    //
    // This is not belt and braces. Planning happens across a round-trip, and the frame loop
    // keeps running: by the time the driving pass starts, the ball has been sitting in a live
    // simulation for a second or two. A recording made from *that* state is not a recording of
    // what `runCoachProgram` will replay, which starts from a course just loaded. Measured:
    // recording without this reported 11.32s and its own replay took 13.50s.
    api.levels.play(levelId);
    for (let wait = 0; wait < 80 && !api.rules.status(); wait += 1) await new Promise((resolve) => setTimeout(resolve, 100));
    if (!api.rules.status()) return { error: "the run never armed" };

    const rules = api.rules.get();
    const subjectId = rules?.subjectId ?? rules?.spawn?.entityId ?? null;
    if (!subjectId) return { error: "the level declares no subject to drive" };
    const positionOf = () => api.query({ ids: [subjectId] })[0]?.position ?? null;

    // Degrees clockwise from -z: 0 = -z, 90 = +x, 180 = +z, 270 = -x.
    const headingTo = (from, to) => ((Math.atan2(to[0] - from[0], -(to[1] - from[2])) * 180) / Math.PI + 360) % 360;

    const actions = [];
    const visited = [];
    const skipped = [];
    let target = 0;
    let targetSince = 0;
    let targetMark = { lap: api.rules.status()?.lap ?? 0, checkpoint: api.rules.status()?.checkpointIndex ?? 0 };
    let lastHeading = null;
    let tMs = 0;
    while (tMs < maxMs && target < ordered.length) {
      const position = positionOf();
      if (!position) return { error: "the subject vanished mid-run" };
      const goal = ordered[target];
      const reach = Math.hypot(goal.at[0] - position[0], goal.at[1] - position[2]);
      // A ring is collected when the ring says so. Proximity was a proxy for that, and a bad
      // one: the trigger is a hoop with a shape, and a ball can be inside 0.65 units of the
      // centre without having gone through it. Asking the rules layer removes the proxy.
      const run = api.rules.status();
      const collected = maze && goal.kind === "ring" && (run?.collected ?? []).includes(`ballz-${goal.name}`);
      // Gates the same way. A finish gate is a wide box you cross, not a point you arrive at,
      // so "the lap counter moved" is the event; insisting the ball centre come within a metre
      // of the tile centre missed a crossing that had already happened.
      const gated = maze && ((goal.kind === "half" && (run?.checkpointIndex ?? 0) > targetMark.checkpoint)
        || (goal.kind === "finish" && (run?.lap ?? 0) > targetMark.lap));
      if (collected || gated || reach <= goal.radius) {
        visited.push({ name: goal.name, atMs: Math.round(tMs) });
        target += 1;
        targetSince = tMs;
        targetMark = { lap: run?.lap ?? 0, checkpoint: run?.checkpointIndex ?? 0 };
        continue;
      }
      // A corner the ball overshot would otherwise be chased until the clock ran out. Corners
      // are hints about which way the corridor goes, so give up on one and aim at the next.
      // Objectives are never skipped: a ring you did not pass through is a course you did not
      // finish, and the run must report that rather than drive on pretending otherwise.
      if (goal.kind === "turn" && tMs - targetSince > 4000) {
        skipped.push({ name: goal.name, atMs: Math.round(tMs) });
        target += 1;
        targetSince = tMs;
        continue;
      }
      // Aim THROUGH a target the ball has been chasing, not at it. Pure pursuit at full thrust
      // orbits a target inside its own turning circle: measured on `archive-ballz-level1`, the
      // ball took 20 seconds to reach a ring one cell away, circling it the whole time. Aiming
      // at a point past the target turns the circle into a pass.
      const chasing = maze && tMs - targetSince > 1500;
      const aim = chasing
        ? (() => {
          const dx = goal.at[0] - position[0];
          const dz = goal.at[1] - position[2];
          const span = Math.hypot(dx, dz) || 1;
          const lead = goal.radius * 3;
          return [goal.at[0] + (dx / span) * lead, goal.at[1] + (dz / span) * lead];
        })()
        : goal.at;
      // Re-aim only when the heading has actually moved. Restating the same heading sixty
      // times a second would record the loop rather than the driving.
      const heading = Math.round(headingTo(position, aim));
      if (lastHeading === null || Math.abs(heading - lastHeading) >= 2) {
        // Full thrust throughout, which is measured rather than intuitive: on `starter-level`,
        // thrust scaled by cos(heading error) drove it in 19.8s and cutting thrust when
        // travelling away from the target took 16.5s, against 11.4s for never lifting off.
        api.steer(subjectId, { headingDegrees: heading, thrust: 1 });
        actions.push([Math.round(tMs), heading]);
        lastHeading = heading;
      }
      api.step(TICK / 1000);
      tMs += TICK;
      if (api.rules.status()?.outcome === "complete") break;
    }

    return {
      levelId,
      // The author's own name for the course, so a pasted program does not arrive labelled
      // with an id the panel would then show to a player.
      label,
      subjectId,
      completed: api.rules.status()?.outcome === "complete",
      elapsedMs: Math.round(tMs),
      objectives: ordered.filter((goal) => goal.kind !== "turn").length,
      reachedObjectives: visited.filter((goal) => !goal.name.startsWith("turn-")).length,
      turnsSkipped: skipped.length,
      waypoints: ordered.map((goal) => goal.name),
      visited,
      actions,
    };
  }, { levelId, maxMs, ordered: route.waypoints, label: level.label ?? levelId, maze });
} finally {
  await browser.close();
}

if (!result || result.error) {
  console.error(`Could not record a line: ${result?.error ?? "no result"}`);
  process.exit(1);
}

console.error(`subject ${result.subjectId} · ${result.waypoints.length} waypoints, ${result.objectives} of them objectives`);
// The last waypoint usually reads as unreached: the rules layer calls the course complete the
// moment the finish trigger fires, which is a little before the ball is inside the radius this
// loop tests. `completed` is the rules layer's verdict and is the one that decides anything.
if (argv.includes("--verbose")) console.error(`visited: ${result.visited.map((v) => `${v.name}@${(v.atMs/1000).toFixed(1)}s`).join(", ")}`);
console.error(`reached ${result.reachedObjectives}/${result.objectives} objectives · ${result.turnsSkipped} corners overshot · ${result.completed ? "FINISHED" : "DID NOT FINISH"} in ${(result.elapsedMs / 1000).toFixed(2)}s · ${result.actions.length} inputs`);
if (!result.completed) {
  // Printing it anyway would invite pasting a line that does not finish, and the panel would
  // then be honest about a baseline nobody wanted.
  console.error("Not printing a program: only a line that finishes the course is worth shipping.");
  console.error("Try listing the waypoints by hand if the greedy ring order drives badly.");
  process.exit(1);
}

const rows = [];
for (let index = 0; index < result.actions.length; index += 6) {
  rows.push(`  ${result.actions.slice(index, index + 6).map(([at, heading]) => `[${at}, ${heading}]`).join(", ")},`);
}
// stdout is the paste-able artifact and stderr is the commentary, so `> line.txt` gives a clean
// table without the narration in it.
console.log(`const ${result.levelId.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}_LINE: ReadonlyArray<readonly [number, number]> = [`);
console.log(rows.join("\n"));
console.log("];");
console.log("");
console.log("registerCoachProgram({");
console.log(`  recordId: ${JSON.stringify(result.levelId)},`);
console.log(`  label: ${JSON.stringify(result.label)},`);
console.log(`  maxMs: ${Math.ceil((result.elapsedMs * 1.4) / 1000) * 1000},`);
console.log(`  actions: ${result.levelId.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}_LINE.map(([atMs, headingDegrees]) => ({ atMs, steer: { headingDegrees, thrust: 1 } })),`);
console.log("});");

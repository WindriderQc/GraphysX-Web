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
import { cellCentre, findPath, pathCorners, planCoachRoute, smoothPath } from "../src/coach-route.ts";

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

  // Drive in resumable chunks so the router can be consulted mid-run.
  //
  // The reason is measured. Instrumenting the leg that failed on `archive-ballz-level1` found the
  // ball **stationary against a wall for 133 seconds** — median speed 0.00 over 892 samples, 888
  // of them with a wall in an adjacent cell, 26 units from the finish. The old pilot skipped a
  // corner it could not reach, then aimed straight at the next objective *through the walls* and
  // pushed into one at full thrust until the clock ran out. Skipping a corner is what turned a
  // route into a straight line at a wall.
  //
  // So a corner that times out, or a ball that has stopped moving, now asks for a new route from
  // where the ball actually is. That has to happen in Node, because the router lives there and a
  // second copy in the page is exactly the drift this project has paid for before — hence chunks
  // rather than one long `evaluate`.
  //
  // The simulation is PAUSED for the whole drive and advanced only by `api.step`, so the frame
  // loop cannot move the ball while a chunk boundary is in flight. Without that, wall-clock spent
  // in a round-trip would land in the recording as time the inputs do not account for — the same
  // failure that made an 11.32s recording replay in 13.50s.
  let waypoints = route.waypoints;
  let state = { tMs: 0, target: 0, targetSince: 0, targetMark: { lap: 0, checkpoint: 0 }, lastHeading: null, stillSince: 0 };
  const actions = [];
  const visited = [];
  const replans = [];
  let outcome = null;

  const drive = async (current, plan) => page.evaluate(async ({ levelId, maxMs, ordered, maze, state }) => {
    const api = window.__GRAPHYSX__;
    const TICK = 1000 / 60;

    if (state.tMs === 0) {
      // Re-play the course before the first chunk. Planning happened across a round-trip and the
      // frame loop kept running, so the ball has been sitting in a live simulation; a recording
      // made from that state is not a recording of what `runCoachProgram` replays.
      api.levels.play(levelId);
      for (let wait = 0; wait < 80 && !api.rules.status(); wait += 1) await new Promise((resolve) => setTimeout(resolve, 100));
      if (!api.rules.status()) return { reason: "never-armed" };
      api.pause(true);
    }

    const rules = api.rules.get();
    const subjectId = rules?.subjectId ?? rules?.spawn?.entityId ?? null;
    if (!subjectId) return { reason: "no-subject" };
    const positionOf = () => api.query({ ids: [subjectId] })[0]?.position ?? null;
    const headingTo = (from, to) => ((Math.atan2(to[0] - from[0], -(to[1] - from[2])) * 180) / Math.PI + 360) % 360;

    let { tMs, target, targetSince, targetMark, lastHeading, stillSince } = state;
    const actions = [];
    const visited = [];

    while (tMs < maxMs && target < ordered.length) {
      const position = positionOf();
      if (!position) return { reason: "subject-vanished" };
      const goal = ordered[target];
      const reach = Math.hypot(goal.at[0] - position[0], goal.at[1] - position[2]);
      const run = api.rules.status();
      // A ring is collected when the ring says so, and a gate is crossed when the counter moves.
      // Proximity was a proxy for both and a bad one: the trigger has a shape, and a finish gate
      // is a wide box you cross rather than a point you arrive at.
      const collected = maze && goal.kind === "ring" && (run?.collected ?? []).includes("ballz-" + goal.name);
      const gated = maze && ((goal.kind === "half" && (run?.checkpointIndex ?? 0) > targetMark.checkpoint)
        || (goal.kind === "finish" && (run?.lap ?? 0) > targetMark.lap));
      if (collected || gated || reach <= goal.radius) {
        visited.push({ name: goal.name, atMs: Math.round(tMs) });
        target += 1;
        targetSince = tMs;
        stillSince = tMs;
        targetMark = { lap: run?.lap ?? 0, checkpoint: run?.checkpointIndex ?? 0 };
        continue;
      }

      // Two ways to be lost, and both now ask for a route instead of pressing on.
      const stalled = maze && tMs - stillSince > 1500;
      // Objectives get a longer leash than corners, and both now re-plan rather than skip.
      // Measured: with the guard on corners only, the pilot completed laps 1 and 2 and then
      // circled the lap-3 finish for 170 seconds — moving, so never stalled, and not a corner,
      // so never overdue. Nothing was watching it. Re-planning to the *same* objective is the
      // point: fresh corners change the approach angle, which is what a circling ball needs.
      const overdue = maze && tMs - targetSince > (goal.kind === "turn" ? 4000 : 8000);
      if (stalled || overdue) {
        return {
          reason: "replan",
          why: stalled ? "not-moving" : "corner-overdue",
          at: [position[0], position[2]],
          state: { tMs, target, targetSince: tMs, targetMark, lastHeading, stillSince: tMs },
          actions,
          visited,
        };
      }

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
      const heading = Math.round(headingTo(position, aim));
      if (lastHeading === null || Math.abs(heading - lastHeading) >= 2) {
        // Full thrust throughout, which is measured rather than intuitive: thrust scaled by
        // cos(heading error) drove the starter course in 19.8s and cutting thrust when travelling
        // away from the target took 16.5s, against 11.4s for never lifting off. Easing into
        // corners was tried too, and made the recording irreproducible.
        api.steer(subjectId, { headingDegrees: heading, thrust: 1 });
        actions.push([Math.round(tMs), heading]);
        lastHeading = heading;
      }
      api.step(TICK / 1000);
      const moved = positionOf();
      if (moved && Math.hypot(moved[0] - position[0], moved[2] - position[2]) * 60 > 0.4) stillSince = tMs;
      tMs += TICK;
      if (api.rules.status()?.outcome === "complete") break;
    }

    const final = api.rules.status();
    api.pause(false);
    return {
      reason: final?.outcome === "complete" ? "complete" : tMs >= maxMs ? "out-of-time" : "route-exhausted",
      subjectId,
      completed: final?.outcome === "complete",
      state: { tMs, target, targetSince, targetMark, lastHeading, stillSince },
      actions,
      visited,
    };
  }, { levelId, maxMs, ordered: plan, maze, state: current });

  // Bounded: a course needing more rescues than this is not one a recording should be wrung out
  // of, and saying so is better than looping.
  for (let chunk = 0; chunk < 40; chunk += 1) {
    outcome = await drive(state, waypoints);
    if (outcome.reason === "never-armed" || outcome.reason === "no-subject" || outcome.reason === "subject-vanished") break;
    actions.push(...(outcome.actions ?? []));
    visited.push(...(outcome.visited ?? []));
    state = outcome.state ?? state;
    if (outcome.reason !== "replan") break;

    // Re-route from where the ball actually is to the objective it is trying to reach, and put
    // the corners of that route in front of it. Intermediate corners from the old plan are
    // dropped: they described a way there from somewhere the ball no longer is.
    const objectiveIndex = waypoints.findIndex((point, index) => index >= state.target && point.kind !== "turn");
    if (objectiveIndex === -1) break;
    const objective = waypoints[objectiveIndex];
    const originX = -((level.width - 1) * level.cellSize) / 2;
    const originZ = -((level.height - 1) * level.cellSize) / 2;
    const from = {
      x: Math.round((outcome.at[0] - originX) / level.cellSize),
      y: Math.round((outcome.at[1] - originZ) / level.cellSize),
    };
    const rescue = findPath(level, from, objective.cell);
    replans.push({ atMs: Math.round(state.tMs), why: outcome.why, from, to: objective.cell, routed: Boolean(rescue) });
    if (!rescue) break;
    const corners = smoothPath(level, pathCorners(rescue)).slice(1, -1).map((cell) => ({
      kind: "turn",
      name: "turn-" + cell.x + "-" + cell.y + "@" + Math.round(state.tMs),
      cell,
      at: cellCentre(level, cell),
      radius: level.cellSize * 0.42,
    }));
    waypoints = [...waypoints.slice(0, state.target), ...corners, ...waypoints.slice(objectiveIndex)];
    state = { ...state, targetSince: state.tMs, stillSince: state.tMs, lastHeading: null };
  }

  result = outcome && !outcome.subjectId
    ? { error: outcome.reason ?? "the drive produced no result" }
    : {
      levelId,
      label: level.label ?? levelId,
      subjectId: outcome.subjectId,
      completed: Boolean(outcome.completed),
      elapsedMs: Math.round(state.tMs),
      objectives: waypoints.filter((goal) => goal.kind !== "turn").length,
      reachedObjectives: visited.filter((goal) => !goal.name.startsWith("turn-")).length,
      turnsSkipped: 0,
      replans,
      waypoints: waypoints.map((goal) => goal.name),
      visited,
      actions,
    };

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
if (argv.includes("--verbose")) console.error("replans: " + JSON.stringify(result.replans));
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

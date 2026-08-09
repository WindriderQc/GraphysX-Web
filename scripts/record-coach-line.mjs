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

const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
let result = null;
try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__GRAPHYSX__, null, { timeout: SMOKE_TIMEOUT });
  result = await page.evaluate(async ({ levelId, maxMs }) => {
    const api = window.__GRAPHYSX__;
    const TICK = 1000 / 60;

    const level = api.levels.get(levelId);
    if (!level) return { error: `no level "${levelId}"` };
    const { width, height, cellSize, tiles } = level;
    // The same origin the scene builder uses, so a waypoint is the centre of the cell the
    // author drew rather than an approximation of where the ring ended up.
    const originX = -((width - 1) * cellSize) / 2;
    const originZ = -((height - 1) * cellSize) / 2;
    const centres = (tile) => {
      const found = [];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (tiles[y * width + x] === tile) found.push({ name: `${tile}-${x}-${y}`, at: [originX + x * cellSize, originZ + y * cellSize] });
        }
      }
      return found;
    };

    const start = centres("start")[0];
    if (!start) return { error: "the level has no start tile" };
    // Rings first and in nearest-first order from the spawn, because the rules layer will not
    // open the finish until every collectible is in. Order is a heuristic, not a solve: a
    // course where the greedy order drives badly wants its waypoints listed by hand.
    const rings = centres("ring");
    const ordered = [];
    let from = start.at;
    const remaining = [...rings];
    while (remaining.length > 0) {
      let best = 0;
      for (let index = 1; index < remaining.length; index += 1) {
        const near = Math.hypot(remaining[index].at[0] - from[0], remaining[index].at[1] - from[1]);
        if (near < Math.hypot(remaining[best].at[0] - from[0], remaining[best].at[1] - from[1])) best = index;
      }
      const next = remaining.splice(best, 1)[0];
      ordered.push({ ...next, radius: cellSize * 0.27 });
      from = next.at;
    }
    for (const half of centres("half")) ordered.push({ ...half, radius: cellSize * 0.46 });
    for (const finish of centres("finish")) ordered.push({ ...finish, radius: cellSize * 0.54 });
    if (ordered.length === 0) return { error: "the level has nothing to drive to" };

    api.levels.play(levelId);
    // `levels.play` is asynchronous — the run is unarmed when it returns and reads
    // `phase: "running"` about 800ms later. Driving early produces a full-length failure that
    // is not about the driving at all.
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
    let target = 0;
    let lastHeading = null;
    let tMs = 0;
    while (tMs < maxMs && target < ordered.length) {
      const position = positionOf();
      if (!position) return { error: "the subject vanished mid-run" };
      const goal = ordered[target];
      if (Math.hypot(goal.at[0] - position[0], goal.at[1] - position[2]) <= goal.radius) {
        visited.push({ name: goal.name, atMs: Math.round(tMs) });
        target += 1;
        continue;
      }
      // Re-aim only when the heading has actually moved. Restating the same heading sixty
      // times a second would record the loop rather than the driving.
      const heading = Math.round(headingTo(position, goal.at));
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
      label: level.label ?? levelId,
      subjectId,
      completed: api.rules.status()?.outcome === "complete",
      elapsedMs: Math.round(tMs),
      waypoints: ordered.map((goal) => goal.name),
      visited,
      actions,
    };
  }, { levelId, maxMs });
} finally {
  await browser.close();
}

if (!result || result.error) {
  console.error(`Could not record a line: ${result?.error ?? "no result"}`);
  process.exit(1);
}

console.error(`subject ${result.subjectId} · waypoints ${result.waypoints.join(" → ")}`);
// The last waypoint usually reads as unreached: the rules layer calls the course complete the
// moment the finish trigger fires, which is a little before the ball is inside the radius this
// loop tests. `completed` is the rules layer's verdict and is the one that decides anything.
console.error(`reached ${result.visited.length}/${result.waypoints.length} waypoints · ${result.completed ? "FINISHED" : "DID NOT FINISH"} in ${(result.elapsedMs / 1000).toFixed(2)}s · ${result.actions.length} inputs`);
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

// An agent plays BallZ — rung 1 of the AgentX arc (see BALLZ_AGENTX_MULTIPLAYER_PLAN).
//
// This is a POLICY over the discoverable tool bridge, not a script with backstage access:
// every read is `query`/`rules.status` and every actuation is `steer`, through
// `window.__GRAPHYSX_AGENT_BRIDGE__.call(...)` — the same surface the stdio adapter and the
// postMessage transport expose to external agents. Nothing here touches `__GRAPHYSX__`
// directly, so anything this driver can do, an agent on another machine can do verbatim.
//
// The game loop is DETERMINISTIC: `pause(true)` then alternating `steer` decisions with
// fixed `step(1/60)` slices. The runtime integrates thrust inside the simulation step
// (`ballz-finished-r1`), so a decision every DECISION_STEPS steps at 60 steps/sim-second is
// an agent thinking at ~6 Hz while physics runs full rate — and the whole run replays to
// the step. Wall-clock never enters the loop; a slow model or a slow box changes nothing.
//
// The policy is the honest baseline: nearest uncollected ring, then the due checkpoint,
// then the finish, laps until the run completes. Naive greedy pursuit pins itself against
// Level 1's central diamond (measured: 10/20 rings, then 400 simulated seconds of pushing
// on a wall), so the agent PATHFINDS — and the data it pathfinds over is itself
// discoverable through the bridge: `levels.get` returns the authored grid, the same tiles
// the materialiser built the walls from. BFS over walkable cells, steer at the first
// line-of-sight waypoint, aim at the exact target once adjacent. A stuck detector still
// kicks out on a rotated heading as the backstop. Its lap time is the number a
// model-driven policy (AgentX/Ollama) gets to beat.
//
// Usage:
//   node tools/ballz-agent-driver.mjs                       # plays archive-ballz-level1
//   node tools/ballz-agent-driver.mjs --level <id>          # any library level
//   node tools/ballz-agent-driver.mjs --url http://...      # a running host (default :4188)
//   node tools/ballz-agent-driver.mjs --shots output/agent  # screenshot directory
//   node tools/ballz-agent-driver.mjs --realtime            # unpaused, decisions on a timer
//
// Exit 0 with a JSON report on stdout when the run completes; exit 1 on timeout/failure.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const URL_BASE = option("--url") ?? process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4188/";
const LEVEL_ID = option("--level") ?? "archive-ballz-level1";
const SHOTS = option("--shots") ?? "output/agent-play";
const REALTIME = args.includes("--realtime");
const EXECUTABLE = process.env.SMOKE_CHROMIUM || undefined;

/** Simulation-second budget before the run is declared failed. Three laps of a 20x20. */
const SIM_BUDGET_SECONDS = 420;
/** Steps between decisions: 10 steps = one decision per sixth of a simulated second. */
const DECISION_STEPS = 10;
/** No net movement over this many decisions ⇒ kick out on a rotated heading. */
const STUCK_DECISIONS = 18;
const STUCK_DISTANCE = 0.35;

mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: EXECUTABLE,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader"],
});

let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${URL_BASE}?host=standalone`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__GRAPHYSX_AGENT_BRIDGE__, null, { timeout: 60_000 });

  // Everything below speaks ONLY through the bridge.
  const call = (method, ...callArgs) =>
    page.evaluate(
      ({ method, callArgs }) => window.__GRAPHYSX_AGENT_BRIDGE__.call(method, ...callArgs),
      { method, callArgs },
    );

  const played = await call("levels.play", LEVEL_ID);
  if (!played?.ok) throw new Error(`levels.play failed: ${played?.error ?? "unknown"}`);
  const rules = await call("rules.get");
  const subjectId = rules?.subjectId;
  if (!subjectId) throw new Error("Level carries no rules subject to drive");
  const subject = (await call("query", { ids: [subjectId] }))?.[0];
  if (!subject?.steering) throw new Error(`Subject ${subjectId} has no steering block`);

  if (!REALTIME) await call("pause", true);
  // Let the spawn settle onto the floor before the first decision.
  if (!REALTIME) await call("step", 1);
  await page.screenshot({ path: path.join(SHOTS, "agent-start.png") });

  // The map the agent navigates by, read through the SAME bridge: the authored grid the
  // materialiser built the arena from. Walls block; hazards deflect and fire tiles launch,
  // so the pathfinder treats both as blocked rather than learning that the hard way.
  const levelData = await call("levels.get", LEVEL_ID);
  const grid = levelData?.tiles
    ? {
        width: levelData.width,
        height: levelData.height,
        cellSize: levelData.cellSize,
        blocked: levelData.tiles.map((tile) => tile === "wall" || tile === "hazard" || tile === "fire"),
      }
    : null;

  // One in-page decision+step slice per round-trip. The policy could live out here calling
  // the bridge per read, but batching DECISION_STEPS of stepping with one decision per
  // evaluate keeps the wall-clock cost on a software-GL box tolerable without changing the
  // model: the decision inputs and outputs still cross the bridge surface only.
  const runDecisionSlice = (state) =>
    page.evaluate(async ({ subjectId, DECISION_STEPS, REALTIME, state, grid }) => {
      const bridge = window.__GRAPHYSX_AGENT_BRIDGE__;
      const call = (method, ...a) => bridge.call(method, ...a);

      const run = await call("rules.status");
      if (!run || run.phase === "complete") {
        return { done: true, phase: run?.phase ?? null, run };
      }

      const ball = (await call("query", { ids: [subjectId] }))?.[0];
      if (!ball) return { done: true, phase: "lost-subject", run };
      const [bx, , bz] = ball.position;

      // --- grid navigation helpers (agent-side smarts over discoverable level data) ------
      const toCell = (wx, wz) => {
        if (!grid) return null;
        const originX = -((grid.width - 1) * grid.cellSize) / 2;
        const originZ = -((grid.height - 1) * grid.cellSize) / 2;
        const cx = Math.round((wx - originX) / grid.cellSize);
        const cy = Math.round((wz - originZ) / grid.cellSize);
        if (cx < 0 || cy < 0 || cx >= grid.width || cy >= grid.height) return null;
        return { cx, cy };
      };
      const toWorld = (cx, cy) => [
        -((grid.width - 1) * grid.cellSize) / 2 + cx * grid.cellSize,
        -((grid.height - 1) * grid.cellSize) / 2 + cy * grid.cellSize,
      ];
      const open = (cx, cy) => cx >= 0 && cy >= 0 && cx < grid.width && cy < grid.height && !grid.blocked[cy * grid.width + cx];
      /** BFS shortest path between cells; 4-connected so the path never cuts a wall corner. */
      const findPath = (from, to) => {
        if (!grid || !from || !to) return null;
        const key = (c) => c.cy * grid.width + c.cx;
        const previous = new Map([[key(from), null]]);
        const queue = [from];
        while (queue.length > 0) {
          const cell = queue.shift();
          if (cell.cx === to.cx && cell.cy === to.cy) {
            const path = [];
            let cursor = cell;
            while (cursor) {
              path.push(cursor);
              cursor = previous.get(key(cursor));
            }
            return path.reverse();
          }
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const next = { cx: cell.cx + dx, cy: cell.cy + dy };
            if (!open(next.cx, next.cy) || previous.has(key(next))) continue;
            previous.set(key(next), cell);
            queue.push(next);
          }
        }
        return null;
      };
      /** The farthest path cell reachable in a straight line — smooths the staircase BFS walk. */
      const lineOfSight = (fromWorld, toCellIndex, path) => {
        let best = 1;
        for (let i = 1; i < Math.min(path.length, toCellIndex + 6); i += 1) {
          const [wx, wz] = toWorld(path[i].cx, path[i].cy);
          const steps = Math.ceil(Math.hypot(wx - fromWorld[0], wz - fromWorld[1]) / (grid.cellSize * 0.4));
          let clear = true;
          for (let s = 1; s <= steps; s += 1) {
            const px = fromWorld[0] + ((wx - fromWorld[0]) * s) / steps;
            const pz = fromWorld[1] + ((wz - fromWorld[1]) * s) / steps;
            const cell = toCell(px, pz);
            if (!cell || !open(cell.cx, cell.cy)) { clear = false; break; }
          }
          if (!clear) break;
          best = i;
        }
        return best;
      };

      // Target selection: uncollected rings first, then the due checkpoint, then the finish.
      let target = null;
      let targetKind = null;
      const ringsLeft = run.collectibleIds.filter((id) => !run.collected.includes(id));
      if (ringsLeft.length > 0) {
        const rings = await call("query", { tag: "collectible" });
        let best = Infinity;
        for (const ring of rings) {
          if (!ringsLeft.includes(ring.id)) continue;
          const d = (ring.position[0] - bx) ** 2 + (ring.position[2] - bz) ** 2;
          if (d < best) { best = d; target = ring.position; targetKind = ring.id; }
        }
      } else if (run.nextCheckpointId) {
        const gate = (await call("query", { ids: [run.nextCheckpointId] }))?.[0];
        if (gate) { target = gate.position; targetKind = run.nextCheckpointId; }
      }
      if (!target) {
        const rulesNow = await call("rules.get");
        const finishId = rulesNow?.finish?.triggerId;
        const gate = finishId ? (await call("query", { ids: [finishId] }))?.[0] : null;
        if (gate) { target = gate.position; targetKind = finishId; }
      }
      if (!target) return { done: true, phase: "no-target", run };

      // Navigate BY THE GRID when a wall is in the way; aim at the exact target otherwise.
      const distance = Math.hypot(target[0] - bx, target[2] - bz);
      let aimX = target[0];
      let aimZ = target[2];
      if (grid) {
        const from = toCell(bx, bz);
        const to = toCell(target[0], target[2]);
        const path = findPath(from, to);
        if (path && path.length > 2) {
          const waypointIndex = lineOfSight([bx, bz], path.length - 1, path);
          // Only detour when the direct line is actually blocked — the last line-of-sight
          // cell being the goal means the straight shot is clean.
          if (waypointIndex < path.length - 1) {
            const [wx, wz] = toWorld(path[waypointIndex].cx, path[waypointIndex].cy);
            aimX = wx;
            aimZ = wz;
          }
        }
      }
      const dx = aimX - bx;
      const dz = aimZ - bz;
      let heading = (Math.atan2(dx, -dz) * 180) / Math.PI;

      // Stuck? Kick out on a rotated heading — greedy pursuit pressed against a wall stays
      // pressed forever without this.
      let kicked = false;
      if (state.stuckFor >= state.STUCK_DECISIONS) {
        heading += 100 + (state.decisions % 3) * 55;
        await call("steer", subjectId, { headingDegrees: heading, kick: 0.8, thrust: 1 });
        kicked = true;
      } else {
        // Brake into close targets so the ball rolls THROUGH a ring instead of orbiting it.
        const speed = Math.hypot(ball.physics.linearVelocity[0], ball.physics.linearVelocity[2]);
        const thrust = distance < 1.6 && speed > 4 ? -0.4 : 1;
        await call("steer", subjectId, { headingDegrees: heading, thrust });
      }

      if (!REALTIME) await call("step", DECISION_STEPS / 60);
      return {
        aim: [Number(aimX.toFixed(1)), Number(aimZ.toFixed(1))],
        done: false,
        kicked,
        distance: Number(distance.toFixed(2)),
        targetKind,
        position: [Number(bx.toFixed(2)), Number(bz.toFixed(2))],
        elapsed: run.elapsedSeconds,
        lap: run.lap,
        collected: run.collected.length,
        collectibleCount: run.collectibleCount,
      };
    }, { subjectId, DECISION_STEPS, REALTIME, state, grid });

  const report = {
    level: LEVEL_ID,
    subjectId,
    deterministic: !REALTIME,
    decisions: 0,
    kicks: 0,
    laps: [],
  };
  const state = { stuckFor: 0, decisions: 0, STUCK_DECISIONS };
  let lastPosition = null;
  let lastLap = 0;
  let midShotTaken = false;
  let outcome = null;

  for (;;) {
    const slice = await runDecisionSlice(state);
    if (slice.done) { outcome = slice; break; }
    report.decisions += 1;
    state.decisions = report.decisions;
    if (slice.kicked) { report.kicks += 1; state.stuckFor = 0; }
    if (lastPosition) {
      const moved = Math.hypot(slice.position[0] - lastPosition[0], slice.position[1] - lastPosition[1]);
      state.stuckFor = moved < STUCK_DISTANCE ? state.stuckFor + 1 : 0;
    }
    lastPosition = slice.position;
    if (slice.lap > lastLap) {
      report.laps.push({ lap: slice.lap, atSimSeconds: slice.elapsed });
      lastLap = slice.lap;
      process.stderr.write(`lap ${slice.lap} banked at ${slice.elapsed.toFixed(1)}s\n`);
    }
    if (!midShotTaken && slice.collected > 0) {
      midShotTaken = true;
      await page.screenshot({ path: path.join(SHOTS, "agent-mid.png") });
    }
    if (report.decisions % 60 === 0) {
      process.stderr.write(
        `t=${slice.elapsed.toFixed(1)}s rings ${slice.collected}/${slice.collectibleCount} lap ${slice.lap} → ${slice.targetKind} (${slice.distance}u)\n`,
      );
    }
    if (slice.elapsed > SIM_BUDGET_SECONDS) { outcome = { done: true, phase: "budget-exceeded", run: null }; break; }
    if (REALTIME) await page.waitForTimeout(DECISION_STEPS * (1000 / 60));
  }

  const finalRun = outcome.run ?? (await call("rules.status"));
  report.phase = outcome.phase ?? finalRun?.phase ?? null;
  report.elapsedSimSeconds = finalRun?.elapsedSeconds ?? null;
  report.collected = finalRun?.collected?.length ?? null;
  report.desynced = finalRun?.desynced ?? null;
  await page.screenshot({ path: path.join(SHOTS, "agent-finish.png") });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.phase !== "complete") exitCode = 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  exitCode = 1;
} finally {
  await browser.close();
}
process.exit(exitCode);

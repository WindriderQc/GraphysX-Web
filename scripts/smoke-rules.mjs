import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// The rules layer: what a crossing means.
//
// Driven, not asserted-on. Every claim below is made by moving a subject through volumes and
// reading `api.rules.status()` back — never by reaching into the evaluator. The subject is a
// *kinematic* body teleported cell to cell rather than a dynamic ball pushed by impulses,
// because the question here is "does crossing gate 2 before gate 1 count", and answering it
// with a rolling ball would be a test of friction.
//
// The three things worth failing over, in order of how quietly they would break:
//   1. An out-of-order or skipped gate must not bank a lap. A course you can win by driving
//      straight at the finish is not a course.
//   2. The clock is simulation time. Paused means paused.
//   3. `dropped` must surface. A run that silently loses a lap is the failure this whole
//      layer exists to not have.

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const out = {};

const browser = await launchSmokeBrowser();
const page = await browser.newPage();
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX__, { timeout: SMOKE_TIMEOUT });

  out.course = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;

    const gate = (id, x, extra = {}) => ({
      id,
      type: "box",
      transform: { position: [x, 1, 0] },
      geometry: { width: 2, height: 3, depth: 6 },
      material: { color: "#37b6d3", opacity: 0.4 },
      physics: { mode: "trigger" },
      ...extra,
    });

    const created = api.create({
      schema: "graphysx.agent-world/v2",
      id: "rules-course",
      label: "Rules Course",
      environment: { background: "#0b1015", ground: { visible: false }, physics: { gravity: [0, 0, 0] } },
      entities: [
        { id: "sun", type: "directional-light", intensity: 1.2, transform: { position: [4, 8, 4] } },
        // Kinematic: it participates in trigger overlap exactly as a dynamic body does, but it
        // goes precisely where it is put.
        {
          id: "runner",
          type: "sphere",
          transform: { position: [-50, 1, 0] },
          geometry: { radius: 0.5 },
          physics: { mode: "kinematic" },
        },
        gate("cp-1", 10),
        gate("cp-2", 20),
        gate("finish", 30),
        // Pickups hide themselves on entry, which is what makes them recoverable after a
        // stream gap — the fact "this was taken" lives in the scene, not in the history.
        gate("ring-a", 5, {
          tags: ["pickup"],
          interactions: [{ id: "take-a", type: "toggle-visibility", targetIds: ["ring-a"] }],
        }),
        gate("ring-b", 15, {
          tags: ["pickup"],
          interactions: [{ id: "take-b", type: "toggle-visibility", targetIds: ["ring-b"] }],
        }),
      ],
      rules: {
        schema: "graphysx.agent-rules/v1",
        subjectId: "runner",
        spawn: { entityId: "runner", position: [-50, 1, 0] },
        checkpoints: [{ triggerId: "cp-1" }, { triggerId: "cp-2" }],
        collectibles: { tag: "pickup", requiredToFinish: true },
        finish: { triggerId: "finish" },
        laps: 2,
      },
    });
    if (!created.ok) return { fatal: created.error };

    api.pause(true);

    // Teleport in, settle a frame so the overlap is seen, then park far away so the volume
    // reports an exit and can be entered again on the next lap.
    const cross = (x) => {
      api.update("runner", { transform: { position: [x, 1, 0] } });
      api.step(1 / 60);
      api.update("runner", { transform: { position: [-50, 1, 0] } });
      api.step(1 / 60);
    };
    const snap = () => {
      const run = api.rules.status();
      return { phase: run.phase, lap: run.lap, gate: run.checkpointIndex, took: run.collected.length, desynced: run.desynced };
    };

    const armed = snap();

    // 1. The finish, reached with nothing done, must not bank a lap.
    cross(30);
    const finishTooEarly = snap();

    // 2. Gate 2 before gate 1 must not advance the sequence.
    cross(20);
    const outOfOrder = snap();

    // 3. In order now, plus both pickups.
    cross(5);
    cross(10);
    cross(15);
    cross(20);
    const lapReady = snap();

    // 4. Finish with the lap's requirements met banks lap 1 of 2 and re-arms the gates.
    cross(30);
    const lapOne = snap();

    // 5. Second lap. The pickups are already taken and stay taken — the rings are hidden and
    //    there is nothing left in the world to cross.
    cross(10);
    cross(20);
    cross(30);
    const finished = snap();

    return {
      fatal: null,
      armed,
      finishTooEarly,
      outOfOrder,
      lapReady,
      lapOne,
      finished,
      ringsHidden: api.query({ ids: ["ring-a", "ring-b"] }).every((entity) => entity.visible === false),
    };
  });

  // The clock is simulation time, and the block is scene data. Both are separate claims from
  // the sequencing above, so they get their own evaluate rather than riding along.
  out.clockAndDocument = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;

    // The course above finished, so first prove a *result* does not keep ticking.
    const wonAt = api.rules.status().elapsedSeconds;
    api.step(1);
    const frozen = api.rules.status().elapsedSeconds === wonAt;

    // Then re-arm to get a running clock to measure — exercising `rules.reset()` on the way.
    const reset = api.rules.reset();
    const before = api.rules.status().elapsedSeconds;
    // Paused and not stepped: real time passes, simulation time does not.
    const start = performance.now();
    while (performance.now() - start < 120) { /* spin */ }
    const afterWallClock = api.rules.status().elapsedSeconds;
    api.step(1);
    const afterStep = api.rules.status().elapsedSeconds;

    const document_ = api.exportDocument();
    const reloaded = api.load(document_);
    const afterReload = api.rules.get();

    return {
      resetOk: reset.ok,
      resetClearedLaps: reset.value?.lap === 0 && reset.value?.phase === "running",
      // Re-arming a played course must not demand pickups that are already gone from the
      // world — that would be a reset button that produces an unwinnable run.
      resetKeptTakenPickups: reset.value?.collected?.length === 2,
      wallClockIgnored: afterWallClock === before,
      stepAdvanced: afterStep > before + 0.9,
      // A finished run's clock is a result, not a stopwatch: it must stop.
      finishedClockFrozen: frozen,
      documentCarriesRules: document_?.rules?.schema === "graphysx.agent-rules/v1",
      documentCheckpoints: document_?.rules?.checkpoints?.map((c) => c.triggerId) ?? [],
      reloadOk: reloaded.ok,
      survivesReload: afterReload?.finish?.triggerId === "finish" && afterReload?.laps === 2,
      // A run is session state: reloading the course re-arms it rather than restoring a
      // half-finished attempt.
      reArmed: api.rules.status()?.lap === 0,
      // A block naming a gate that does not exist is the easiest way to author an unwinnable
      // course, and it must fail loudly at set time rather than silently never completing.
      rejectsUnknownGate: api.rules.set({
        schema: "graphysx.agent-rules/v1",
        checkpoints: [{ triggerId: "no-such-gate" }],
        finish: { triggerId: "finish" },
      }).ok === false,
    };
  });

  // The `dropped` path, forced rather than simulated.
  //
  // The runtime's evaluator polls its own 512-entry ring once per tick, so overflowing it
  // means producing more than 512 events *between* two ticks. Paused, `api.spawn` does that
  // without the simulation advancing: 600 spawns, then one step, and the cursor the run was
  // holding has aged out.
  out.drop = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    api.pause(true);

    // Put the pickups back in the world before re-arming. The course was reloaded from a
    // document exported *after* it was won, so both rings are hidden — and an armed run
    // correctly counts an absent pickup as already taken. Restoring them is what gives this
    // test an uncollected ring to collect.
    api.update("ring-a", { visible: true });
    api.update("ring-b", { visible: true });
    api.rules.reset();

    // Take one pickup first, so the resync has something real to recover.
    api.update("runner", { transform: { position: [5, 1, 0] } });
    api.step(1 / 60);
    api.update("runner", { transform: { position: [-50, 1, 0] } });
    api.step(1 / 60);
    const beforeDrop = api.rules.status();

    for (let index = 0; index < 600; index += 1) {
      api.spawn({ id: `flood-${index}`, type: "box", visible: false });
    }
    // Nothing has advanced the run yet — the flood happened between ticks.
    api.step(1 / 60);
    const afterDrop = api.rules.status();

    return {
      tookOneBefore: beforeDrop.collected.length === 1,
      collectedBefore: beforeDrop.collected.length,
      desyncedFlagged: afterDrop.desynced === true,
      resyncs: afterDrop.resyncs,
      // The recoverable half: the pickup is still counted after the rebuild, because the ring
      // hid itself and the scene still says so.
      collectedSurvived: afterDrop.collected.length >= beforeDrop.collected.length,
      // Sticky: further clean pages must not launder the flag back to trustworthy.
      staysDesynced: (() => {
        api.step(1 / 60);
        return api.rules.status().desynced === true;
      })(),
    };
  });

  await page.screenshot({ path: path.join(ART, "rules.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const c = out.course ?? {};
const d = out.clockAndDocument ?? {};
const p = out.drop ?? {};

const ok =
  !c.fatal &&
  // Armed clean.
  c.armed?.phase === "running" && c.armed?.lap === 0 &&
  // Cutting the course does nothing.
  c.finishTooEarly?.lap === 0 &&
  c.outOfOrder?.gate === 0 &&
  // Doing it properly arms the lap...
  c.lapReady?.gate === 2 && c.lapReady?.took === 2 &&
  // ...and the finish banks it, re-arming the gates for lap 2.
  c.lapOne?.lap === 1 && c.lapOne?.gate === 0 && c.lapOne?.phase === "running" &&
  // Two laps means two laps.
  c.finished?.lap === 2 && c.finished?.phase === "complete" &&
  c.finished?.desynced === false &&
  c.ringsHidden === true &&
  // Simulation time, not wall clock.
  d.wallClockIgnored === true && d.stepAdvanced === true && d.finishedClockFrozen === true &&
  d.resetOk === true && d.resetClearedLaps === true && d.resetKeptTakenPickups === true &&
  // Scene data: it round-trips, and it validates.
  d.documentCarriesRules === true &&
  d.documentCheckpoints?.join(",") === "cp-1,cp-2" &&
  d.reloadOk === true && d.survivesReload === true && d.reArmed === true &&
  d.rejectsUnknownGate === true &&
  // The gap is noticed, recovered where recoverable, and admitted permanently.
  p.tookOneBefore === true &&
  p.desyncedFlagged === true && p.resyncs >= 1 &&
  p.collectedSurvived === true && p.staysDesynced === true;

process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);

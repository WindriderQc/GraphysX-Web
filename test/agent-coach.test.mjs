// The coach's claim is that the same program produces the same run *within a tolerance* — the
// stronger, bit-identical version was measured against real physics and is false (see the
// module header for the numbers). That rests entirely on *when* each input fires being decided
// by the schedule rather than by whatever the frame loop was doing, so the schedule is where
// the claim is provable, and where it can quietly break. A dropped or double-fired input is a
// different run wearing the same name.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COACH_AGREEMENT_TOLERANCE,
  COACH_SAMPLE_INTERVAL_MS,
  COACH_TICK_MS,
  coachProgramFor,
  coachRunsAgree,
  coachedCourseIds,
  describeCoachRun,
  planCoachTicks,
  registerCoachProgram,
  scheduledActionCount,
} from "../src/agent-coach.ts";

const program = (actions, maxMs = 1000) => ({
  recordId: "test-course",
  label: "Test course",
  subjectId: "ball",
  actions,
  maxMs,
});

describe("the schedule", () => {
  it("covers the whole program at the tick size", () => {
    const ticks = planCoachTicks(program([], 1000), 100);
    assert.equal(ticks.length, 11, "0ms through 1000ms inclusive");
    assert.equal(ticks[0].tMs, 0);
    assert.equal(ticks.at(-1).tMs, 1000);
  });

  it("fires an action on the first tick at or after its time", () => {
    // Not the nearest tick, and not the one before: an input asked for at 250ms must never be
    // applied at 200ms, because the ball is somewhere else then.
    const ticks = planCoachTicks(program([{ atMs: 250, steer: { kick: 1 } }], 1000), 100);
    const firing = ticks.filter((tick) => tick.steer.length > 0);
    assert.equal(firing.length, 1);
    assert.equal(firing[0].tMs, 300);
  });

  it("fires an action landing exactly on a tick at that tick", () => {
    const ticks = planCoachTicks(program([{ atMs: 300, steer: { kick: 1 } }], 1000), 100);
    assert.equal(ticks.find((tick) => tick.steer.length > 0).tMs, 300);
  });

  it("fires every action exactly once", () => {
    const actions = [
      { atMs: 0, steer: { headingDegrees: 90 } },
      { atMs: 120, steer: { thrust: 1 } },
      { atMs: 500, steer: { kick: 1 } },
      { atMs: 999, steer: { jump: 1 } },
    ];
    const ticks = planCoachTicks(program(actions, 1000), COACH_TICK_MS);
    assert.equal(scheduledActionCount(ticks), actions.length);
  });

  it("keeps actions in time order however they were written", () => {
    const ticks = planCoachTicks(program([
      { atMs: 500, steer: { kick: 1 } },
      { atMs: 100, steer: { thrust: 1 } },
    ], 1000), 100);
    const fired = ticks.flatMap((tick) => tick.steer);
    assert.deepEqual(fired, [{ thrust: 1 }, { kick: 1 }]);
  });

  it("issues several inputs due in the same tick, in order", () => {
    const ticks = planCoachTicks(program([
      { atMs: 10, steer: { headingDegrees: 45 } },
      { atMs: 20, steer: { kick: 1 } },
    ], 1000), 100);
    const tick = ticks.find((entry) => entry.steer.length > 0);
    assert.equal(tick.tMs, 100);
    assert.deepEqual(tick.steer, [{ headingDegrees: 45 }, { kick: 1 }]);
  });

  it("drops actions past the bound rather than cramming them into the last tick", () => {
    // A program asking for more time than it is given has a bug; compressing the tail would
    // hide that behind a run that merely looks wrong.
    const ticks = planCoachTicks(program([
      { atMs: 500, steer: { kick: 1 } },
      { atMs: 5000, steer: { jump: 1 } },
    ], 1000), 100);
    assert.equal(scheduledActionCount(ticks), 1);
  });

  it("ignores nonsense times instead of firing them at zero", () => {
    const ticks = planCoachTicks(program([
      { atMs: -100, steer: { kick: 1 } },
      { atMs: Number.NaN, steer: { jump: 1 } },
      { atMs: 200, steer: { thrust: 1 } },
    ], 1000), 100);
    assert.equal(scheduledActionCount(ticks), 1);
    assert.deepEqual(ticks.find((tick) => tick.steer.length > 0).steer, [{ thrust: 1 }]);
  });

  it("is identical across repeated planning — the determinism the run inherits", () => {
    const source = program([
      { atMs: 0, steer: { headingDegrees: 12 } },
      { atMs: 333, steer: { kick: 0.8 } },
      { atMs: 777, steer: { jump: 1 } },
    ], 2000);
    assert.deepEqual(planCoachTicks(source), planCoachTicks(source));
  });
});

describe("sampling", () => {
  it("samples on the same cadence a recorded ghost uses", () => {
    // Matching level-ghosts.ts means a coach trace plays back through the existing
    // interpolator with no conversion.
    const ticks = planCoachTicks(program([], 1000), COACH_TICK_MS);
    const sampled = ticks.filter((tick) => tick.sample).map((tick) => tick.tMs);
    assert.equal(sampled[0], 0);
    for (let index = 1; index < sampled.length; index += 1) {
      const gap = sampled[index] - sampled[index - 1];
      assert.ok(gap >= COACH_SAMPLE_INTERVAL_MS - COACH_TICK_MS, `gap ${gap} too small`);
      assert.ok(gap <= COACH_SAMPLE_INTERVAL_MS + COACH_TICK_MS, `gap ${gap} too large`);
    }
  });

  it("stays within the ghost trace sample cap for a long run", () => {
    // level-ghosts and the server both refuse a trace over 6000 samples.
    const ticks = planCoachTicks(program([], 6 * 60 * 1000), COACH_TICK_MS);
    assert.ok(ticks.filter((tick) => tick.sample).length <= 6000);
  });
});

describe("courses without a baseline", () => {
  it("returns null rather than inventing a program", () => {
    // A coach that guessed a driving line would be offering advice it has no basis for.
    assert.equal(coachProgramFor("a-course-nobody-has-driven"), null);
    assert.equal(coachProgramFor(null), null);
    assert.equal(coachProgramFor(undefined), null);
    assert.equal(coachProgramFor(""), null);
  });

  it("lists exactly the courses that do have one", () => {
    const before = coachedCourseIds();
    registerCoachProgram(program([], 500));
    assert.ok(coachedCourseIds().includes("test-course"));
    assert.equal(coachProgramFor("test-course")?.subjectId, "ball");
    assert.equal(coachedCourseIds().length, before.length + 1);
  });
});

describe("the starter course baseline", () => {
  // Whether it finishes is a browser question and is checked there. What is checkable here is
  // that the shipped recording is still a well-formed program — the ways a careless edit to a
  // 255-entry table breaks it silently.
  const starter = coachProgramFor("starter-level");

  it("is registered", () => {
    assert.ok(starter, "the starter course must ship a baseline");
    assert.ok(coachedCourseIds().includes("starter-level"));
  });

  it("names no subject, so it drives whatever the course declares the player is", () => {
    // A hardcoded id would make the program about one course's entity naming rather than
    // about a driving line.
    assert.equal(starter.subjectId, undefined);
  });

  it("keeps every input inside the bound it ships with", () => {
    // An action past maxMs is dropped by the schedule, so it would silently stop driving.
    for (const action of starter.actions) {
      assert.ok(action.atMs >= 0 && action.atMs <= starter.maxMs, `action at ${action.atMs}ms is outside 0..${starter.maxMs}`);
    }
    assert.equal(scheduledActionCount(planCoachTicks(starter)), starter.actions.length);
  });

  it("is in time order and drives at full thrust throughout", () => {
    // Braking was measured and is worse; a stray fractional thrust would be someone
    // re-litigating that by accident.
    let previous = -1;
    for (const action of starter.actions) {
      assert.ok(action.atMs >= previous, `action at ${action.atMs}ms goes backwards`);
      previous = action.atMs;
      assert.equal(action.steer.thrust, 1);
      assert.ok(action.steer.headingDegrees >= 0 && action.steer.headingDegrees <= 360);
    }
  });

  it("leaves headroom over the measured time rather than ending on the bound", () => {
    // Measured 11.35s. A maxMs sitting on that would turn any small regression into a run cut
    // short, which reads as "did not finish" for the wrong reason.
    assert.ok(starter.maxMs >= 11350 * 1.25, "the bound must not sit on the measured time");
    assert.ok(starter.actions.at(-1).atMs < 11350 * 1.1, "the recording should end near its measured finish");
  });
});

describe("what the panel says", () => {
  const run = (over) => ({ recordId: "c", completed: true, elapsedMs: 12340, trace: { elapsedMs: 12340, samples: [] }, ending: "finished", ...over });

  it("says there is no baseline when there is none", () => {
    assert.match(describeCoachRun(null), /No AgentX baseline/);
  });

  it("never calls an unfinished run a baseline time", () => {
    // The whole point of the honest-state requirement: a demonstration that did not finish
    // the course is not a time to beat, and must not be shown as one.
    const text = describeCoachRun(run({ completed: false, ending: "ran-out-of-time" }));
    assert.match(text, /did not finish/);
    assert.ok(!text.includes("baseline"), "an unfinished run must not be called a baseline");
  });

  it("reports a finished run as a baseline with its time", () => {
    assert.equal(describeCoachRun(run()), "AgentX baseline · 12.34s");
  });

  it("says so when the subject was missing", () => {
    assert.match(describeCoachRun(run({ ending: "no-subject", completed: false })), /could not find the ball/);
  });
});

describe("two runs being the same run", () => {
  // The measured reality this encodes: back-to-back runs match exactly on step count and
  // elapsed time, and drift ~1.4mm in position. Bit-identical was measured and is false.
  const sample = (tMs, x) => ({ tMs, position: [x, 0, 0] });
  const run = (positions, over = {}) => ({
    recordId: "c",
    completed: false,
    elapsedMs: 3000,
    ending: "ran-out-of-time",
    trace: { elapsedMs: 3000, samples: positions.map((x, i) => sample(i * 150, x)) },
    ...over,
  });

  it("accepts solver-scale drift", () => {
    const agreement = coachRunsAgree(run([0, 1, 2]), run([0, 1.0014, 2]));
    assert.equal(agreement.agree, true);
    assert.ok(agreement.maxDrift < 0.01);
    assert.equal(agreement.reason, null);
  });

  it("accepts an exactly identical pair", () => {
    const agreement = coachRunsAgree(run([0, 1, 2]), run([0, 1, 2]));
    assert.equal(agreement.agree, true);
    assert.equal(agreement.maxDrift, 0);
  });

  it("rejects drift that means the driving changed", () => {
    // The smallest real fault available — a dropped kick — moves the ball units, not
    // millimetres, which is exactly the gap the tolerance sits in.
    const agreement = coachRunsAgree(run([0, 1, 2]), run([0, 4, 2]));
    assert.equal(agreement.agree, false);
    assert.match(agreement.reason, /drifted 3\.000 units at 150ms/);
  });

  it("reports a structural difference before a numeric one", () => {
    // A run with a different number of samples has diverged in kind, not degree, and saying
    // "drifted 0.4 units" about it would describe the wrong problem.
    assert.match(coachRunsAgree(run([0, 1, 2]), run([0, 1])).reason, /sample counts differed: 3 vs 2/);
    assert.match(coachRunsAgree(run([0]), run([0], { elapsedMs: 3100 })).reason, /elapsed differed/);
    assert.match(coachRunsAgree(run([0]), run([0], { completed: true })).reason, /one run finished/);
    assert.match(
      coachRunsAgree(run([0]), run([0], { ending: "no-subject" })).reason,
      /runs ended differently/,
    );
  });

  it("catches samples taken at different times", () => {
    const a = run([0, 1]);
    const b = run([0, 1]);
    b.trace.samples[1].tMs = 300;
    assert.match(coachRunsAgree(a, b).reason, /taken at 150ms and 300ms/);
  });

  it("ships a tolerance well clear of the measured noise and well under a real fault", () => {
    assert.ok(COACH_AGREEMENT_TOLERANCE > 0.0014 * 5, "must not sit near the measured drift");
    assert.ok(COACH_AGREEMENT_TOLERANCE < 1, "a whole unit of drift is a different run");
  });
});

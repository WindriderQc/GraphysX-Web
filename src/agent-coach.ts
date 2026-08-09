// An agent driving a course, deterministically, through the same controls a person uses.
//
// The claim this module makes about determinism is deliberately narrow, because the wider one
// turned out to be false.
//
// What is shipped is the *program* — inputs at times — never a recorded time. Rapier is
// deterministic for a given build and platform and not across them, so a baseline number
// shipped as data would quietly stop being true on someone else's machine. The run is computed
// where it is shown.
//
// The stronger claim — same program, bit-identical run — was measured and does not hold. Two
// back-to-back runs of the same program on the same page start from the same position, stay
// exactly equal for 2250 ms, and then part company by **1.4 millimetres** over three seconds.
// The step count and elapsed time match exactly; only the positions drift, at the scale of the
// solver's last bits. The likely cause is the rest of the scene: emitters and flocks advance
// with their own randomness, and the contact ordering they produce is not identical run to run.
//
// So the honest property, and the one `coachRunsAgree` checks, is *reproducible within a
// tolerance*. That is not a weaker test in any way that matters: a genuine regression — an
// input that stopped firing, a schedule off by a tick — moves the ball metres, not millimetres.

//
// The inputs are ordinary `api.steer` calls, the same ones a keyboard produces. There is no
// private driving path: an agent that could move a ball in a way a player cannot would be a
// demonstration of something the player does not have.
//
// The schedule below is pure so it can be tested without a renderer or a physics engine. The
// runner that consumes it needs both, and lives at the bottom.

import type { AgentWorldSteerInput, GraphysXAgentWorldApi } from "./agent-world-runtime";
import type { GhostTrace } from "./level-ghosts";

/**
 * How far two runs of the same program may drift apart and still be the same run.
 *
 * 5 cm, against a measured 1.4 mm. Wide enough that solver noise never reports a false
 * regression, narrow enough that anything which actually changed the driving is caught: the
 * smallest real fault available — dropping a single `kick` — moves the ball several units.
 */
export const COACH_AGREEMENT_TOLERANCE = 0.05;

/** One scripted input, at a time measured from the start of the run. */
export type CoachAction = { atMs: number; steer: AgentWorldSteerInput };

export type CoachProgram = {
  /** The course this drives, matching the results `recordId`. */
  recordId: string;
  label: string;
  /**
   * The entity the inputs steer. Optional, and normally omitted: the rules layer already
   * names the subject, and a program that hardcoded an id would be about one course's entity
   * naming rather than about a driving line.
   */
  subjectId?: string;
  actions: CoachAction[];
  /** Hard bound. A program that has not finished by here is reported as not finishing. */
  maxMs: number;
};

/** What actually happened. `completed` is the rules layer's answer, never an assumption. */
export type CoachRun = {
  recordId: string;
  completed: boolean;
  elapsedMs: number;
  trace: GhostTrace;
  /** Why it stopped, so the panel can say something true rather than something encouraging. */
  ending: "finished" | "ran-out-of-time" | "no-subject" | "not-armed";
};

/** Matches `SAMPLE_INTERVAL_MS` in level-ghosts.ts so a coach trace plays back like any other. */
export const COACH_SAMPLE_INTERVAL_MS = 150;
/** The fixed step the runner advances by. 60 Hz, matching the runtime's own sub-stepping. */
export const COACH_TICK_MS = 1000 / 60;

export type CoachTick = { tMs: number; steer: AgentWorldSteerInput[]; sample: boolean };

/**
 * The exact schedule of ticks, inputs and samples for one program.
 *
 * Pure, and the reason the determinism claim is checkable at all: given a program and a tick
 * size, *when* each input fires is decided here rather than by whatever the frame loop happened
 * to be doing. An action is issued on the first tick at or after its time, so a program is not
 * silently reinterpreted by a change in tick size.
 *
 * Actions scheduled beyond `maxMs` are dropped rather than crammed into the last tick — a
 * program that asks for more time than it is given has a bug in it, and quietly compressing
 * the tail would hide it behind a run that merely looks wrong.
 */
export function planCoachTicks(program: CoachProgram, tickMs: number = COACH_TICK_MS): CoachTick[] {
  const ticks: CoachTick[] = [];
  const pending = [...program.actions]
    .filter((action) => Number.isFinite(action.atMs) && action.atMs >= 0 && action.atMs <= program.maxMs)
    .sort((left, right) => left.atMs - right.atMs);
  let cursor = 0;
  let nextSampleAt = 0;

  for (let tMs = 0; tMs <= program.maxMs + 1e-9; tMs += tickMs) {
    const steer: AgentWorldSteerInput[] = [];
    while (cursor < pending.length && pending[cursor].atMs <= tMs + 1e-9) {
      steer.push(pending[cursor].steer);
      cursor += 1;
    }
    const sample = tMs + 1e-9 >= nextSampleAt;
    if (sample) nextSampleAt += COACH_SAMPLE_INTERVAL_MS;
    ticks.push({ tMs, steer, sample });
  }
  return ticks;
}

/** Every action fires exactly once across the schedule — the property a dropped input breaks. */
export function scheduledActionCount(ticks: CoachTick[]): number {
  return ticks.reduce((total, tick) => total + tick.steer.length, 0);
}

/**
 * The curated programs, by course.
 *
 * Deliberately a small explicit map rather than a generator. There is no honest way to
 * synthesise a driving line for an arbitrary course, and a coach that guessed would be
 * offering advice it has no basis for.
 */
const PROGRAMS: Record<string, CoachProgram> = {};

// Nothing registered yet, and the map is empty on purpose rather than by omission. What a
// completing program needs was measured on `starter-level` and is written down here so the
// next attempt starts from facts instead of rediscovering them:
//
//   - Heading is degrees clockwise from -z:  0 = -z,  90 = +x,  180 = +z,  270 = -x.
//   - Ball spawns at [0, 0.78, 10.4]; the half gate is at [0, 0.806, -10.4] and the finish at
//     [0, 0.806, 13], so the out-and-back leg is a straight line along x = 0.
//   - Steering: force 30, speed cap 7.02, kickImpulse 9.36, turn rate 240 deg/s.
//   - `levels.play` is ASYNCHRONOUS. The run is unarmed when it returns and reads
//     `phase: "running"` about 800ms later; drive before that and every run is a full-length
//     "did not finish" regardless of the driving.
//   - Completion is not just the gates. `starter-level` declares `collectibleTarget: 2`
//     (`ballz-ring-2-7`, `ballz-ring-8-4`), so a straight out-and-back passes both gates and
//     still does not finish. A driving line has to route through both rings.
//
// The last one is why there is no program here yet: the harness is proven, the route is not.

/** The program for a course, or null. Null is the answer the UI must be able to say out loud. */
export function coachProgramFor(recordId: string | null | undefined): CoachProgram | null {
  if (!recordId) return null;
  return PROGRAMS[recordId] ?? null;
}

export function registerCoachProgram(program: CoachProgram): void {
  PROGRAMS[program.recordId] = program;
}

/** Courses that have a baseline, so a shelf can mark them without probing each one. */
export function coachedCourseIds(): string[] {
  return Object.keys(PROGRAMS).sort();
}

/**
 * Drives the program against a live runtime and returns what happened.
 *
 * Steps the world explicitly rather than riding the frame loop: a run that advanced by
 * whatever wall-clock the browser handed it would produce a different time on every machine,
 * which is the opposite of the point. `api.step` sub-steps at a fixed 60 Hz, so the same
 * program lands the same inputs on the same simulation ticks.
 *
 * The course must already be composed AND its run armed. `api.levels.play` is asynchronous —
 * measured: the run is still unarmed immediately after it returns and is `phase: "running"`
 * about 800ms later — so a caller waits for `api.rules.status()` before driving. Running
 * early is refused with `not-armed` rather than driving a course whose clock is not going,
 * which produced a full-length run reported as unfinished no matter how well it drove.
 */
export function resolveCoachSubject(api: GraphysXAgentWorldApi, program: CoachProgram): string | null {
  if (program.subjectId) return program.subjectId;
  // The same derivation the human play layer uses (`ballz-play.ts`), so the agent drives
  // whatever the course itself declares the player is.
  const rules = api.rules.get();
  return rules?.subjectId ?? rules?.spawn?.entityId ?? null;
}

export function runCoachProgram(
  api: GraphysXAgentWorldApi,
  program: CoachProgram,
  options: { tickMs?: number } = {},
): CoachRun {
  const tickMs = options.tickMs ?? COACH_TICK_MS;
  const samples: GhostTrace["samples"] = [];
  const subjectId = resolveCoachSubject(api, program);
  const positionOf = (): [number, number, number] | null => {
    if (!subjectId) return null;
    // `state.position` is the live world position; the definition's `transform.position` is
    // where it was authored, which stops being the answer the moment physics touches it.
    const position = api.query({ ids: [subjectId] })[0]?.position ?? null;
    return position ? [position[0], position[1], position[2]] : null;
  };

  if (!api.rules.status()) {
    return {
      recordId: program.recordId,
      completed: false,
      elapsedMs: 0,
      trace: { elapsedMs: 0, samples: [] },
      ending: "not-armed",
    };
  }

  if (!subjectId || !positionOf()) {
    return {
      recordId: program.recordId,
      completed: false,
      elapsedMs: 0,
      trace: { elapsedMs: 0, samples: [] },
      ending: "no-subject",
    };
  }

  let elapsedMs = 0;
  let completed = false;
  for (const tick of planCoachTicks(program, tickMs)) {
    for (const steer of tick.steer) api.steer(subjectId, steer);
    api.step(tickMs / 1000);
    elapsedMs = tick.tMs + tickMs;
    if (tick.sample) {
      const position = positionOf();
      if (position) samples.push({ tMs: Math.round(tick.tMs), position });
    }
    // The rules layer decides whether the course is finished. Reading the subject's position
    // and guessing would be inventing a result the game does not agree with.
    if (api.rules.status()?.outcome === "complete") {
      completed = true;
      break;
    }
  }

  const last = positionOf();
  if (last) samples.push({ tMs: Math.round(elapsedMs), position: last });
  return {
    recordId: program.recordId,
    completed,
    elapsedMs: Math.round(elapsedMs),
    trace: { elapsedMs: Math.round(elapsedMs), samples },
    ending: completed ? "finished" : "ran-out-of-time",
  };
}

export type CoachAgreement = {
  agree: boolean;
  /** Why not, when they do not — a sentence, so a failure explains itself. */
  reason: string | null;
  maxDrift: number;
  driftAtMs: number | null;
};

/**
 * Whether two runs of the same program are the same run.
 *
 * Compares the schedule-derived facts exactly — sample count, elapsed time, completion — and
 * the positions within a tolerance, because that is the shape of the property that actually
 * holds (see the header). A mismatch in the exact fields is reported before the drift, since
 * a run with a different number of samples has diverged structurally rather than numerically.
 */
export function coachRunsAgree(
  first: CoachRun,
  second: CoachRun,
  tolerance: number = COACH_AGREEMENT_TOLERANCE,
): CoachAgreement {
  const no = (reason: string): CoachAgreement => ({ agree: false, reason, maxDrift: Infinity, driftAtMs: null });
  if (first.completed !== second.completed) return no(`one run finished the course and the other did not`);
  if (first.ending !== second.ending) return no(`runs ended differently: ${first.ending} vs ${second.ending}`);
  if (first.elapsedMs !== second.elapsedMs) return no(`elapsed differed: ${first.elapsedMs}ms vs ${second.elapsedMs}ms`);
  if (first.trace.samples.length !== second.trace.samples.length) {
    return no(`sample counts differed: ${first.trace.samples.length} vs ${second.trace.samples.length}`);
  }

  let maxDrift = 0;
  let driftAtMs: number | null = null;
  for (let index = 0; index < first.trace.samples.length; index += 1) {
    const left = first.trace.samples[index];
    const right = second.trace.samples[index];
    if (left.tMs !== right.tMs) return no(`sample ${index} was taken at ${left.tMs}ms and ${right.tMs}ms`);
    const drift = Math.hypot(
      left.position[0] - right.position[0],
      left.position[1] - right.position[1],
      left.position[2] - right.position[2],
    );
    if (drift > maxDrift) {
      maxDrift = drift;
      driftAtMs = left.tMs;
    }
  }
  return maxDrift <= tolerance
    ? { agree: true, reason: null, maxDrift, driftAtMs }
    : { agree: false, reason: `drifted ${maxDrift.toFixed(3)} units at ${driftAtMs}ms`, maxDrift, driftAtMs };
}

/** What the panel says. Never claims a time for a run that did not finish the course. */
export function describeCoachRun(run: CoachRun | null): string {
  if (!run) return "No AgentX baseline for this course yet.";
  if (run.ending === "no-subject") return "AgentX could not find the ball to drive.";
  if (run.ending === "not-armed") return "The course is still loading.";
  if (!run.completed) {
    return `AgentX demonstration · ${(run.elapsedMs / 1000).toFixed(1)}s, did not finish the course.`;
  }
  return `AgentX baseline · ${(run.elapsedMs / 1000).toFixed(2)}s`;
}

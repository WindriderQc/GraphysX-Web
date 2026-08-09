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

/**
 * The starter course, driven.
 *
 * This is a recording, not a hand-written line, and the distinction is the design. Finding a
 * route was done closed-loop — a pilot that could read the ball's position and re-aim at the
 * next waypoint sixty times a second (`scripts/record-coach-line.mjs`). What ships is the list of
 * inputs that pilot issued, replayed blind. A coach that read positions while it drove would
 * be a driving aid, and its "baseline" would be something no player could match.
 *
 * The facts the route had to satisfy, all measured rather than assumed:
 *
 *   - Heading is degrees clockwise from -z:  0 = -z,  90 = +x,  180 = +z,  270 = -x.
 *   - The grid is 11x11 at cellSize 2.6, origin -13, so a cell centre is `-13 + index * 2.6`.
 *     Start (5,9) = [0, 10.4]; half gate (5,1) = [0, -10.4]; finish (5,10) = [0, 13].
 *   - Completion is NOT just the gates. `starter-level` declares `collectibleTarget: 2`, and
 *     the rings sit at (2,7) = [-7.8, 5.2] and (8,4) = [7.8, -2.6], nowhere near the x = 0
 *     line between the gates. A straight out-and-back clears both gates and never finishes,
 *     which is what every earlier probe was actually reporting.
 *   - Full thrust throughout beats braking, which is the opposite of the intuition. Thrust
 *     scaled by cos(heading error) drove it in 19.8s; cutting thrust when travelling away from
 *     the target, 16.5s; never lifting off, 11.4s. Bleeding speed costs more than a wide line.
 *   - `levels.play` is ASYNCHRONOUS: the run is unarmed when it returns and reads
 *     `phase: "running"` about 800ms later, so the runner refuses to drive early rather than
 *     reporting a full-length failure that was never about the driving.
 *
 * Replayed open-loop it finishes in 11.35s, twice, agreeing to 2mm. `maxMs` is 16000 — half
 * again the measured time, so a real regression shows up as a run that did not finish rather
 * than as a run the bound cut short.
 */
const STARTER_LINE: ReadonlyArray<readonly [number, number]> = [
  [0, 304], [1300, 302], [1467, 300], [1483, 62], [1583, 64], [1683, 66],
  [1783, 68], [1883, 70], [1983, 72], [2083, 74], [2183, 76], [2283, 78],
  [2367, 80], [2450, 82], [2533, 84], [2600, 86], [2667, 88], [2733, 90],
  [2800, 92], [2850, 94], [2900, 96], [2950, 98], [3000, 100], [3050, 102],
  [3100, 104], [3133, 106], [3183, 108], [3217, 110], [3250, 112], [3283, 114],
  [3317, 116], [3350, 118], [3383, 121], [3417, 123], [3450, 126], [3483, 128],
  [3500, 130], [3533, 133], [3567, 136], [3600, 139], [3633, 142], [3650, 144],
  [3667, 146], [3700, 149], [3717, 151], [3733, 153], [3750, 155], [3767, 157],
  [3783, 159], [3800, 161], [3817, 164], [3833, 166], [3850, 168], [3867, 170],
  [3883, 172], [3900, 174], [3917, 177], [3933, 179], [3950, 181], [3967, 183],
  [3983, 186], [4000, 188], [4017, 190], [4033, 192], [4050, 194], [4067, 196],
  [4083, 198], [4100, 201], [4117, 203], [4133, 205], [4167, 208], [4183, 210],
  [4350, 208], [4500, 206], [4600, 204], [4667, 202], [4733, 200], [4767, 198],
  [4817, 196], [4850, 194], [4867, 192], [4900, 189], [4933, 185], [4950, 183],
  [4967, 181], [4983, 179], [5000, 177], [5017, 175], [5033, 172], [5050, 168],
  [5067, 164], [5083, 159], [5100, 153], [5117, 314], [5150, 316], [5200, 318],
  [5267, 320], [5333, 322], [5383, 324], [5450, 326], [5517, 328], [5583, 330],
  [5650, 332], [5717, 334], [5767, 336], [5833, 338], [5900, 340], [5950, 342],
  [6000, 344], [6050, 346], [6100, 348], [6150, 350], [6200, 352], [6250, 354],
  [6283, 356], [6317, 358], [6350, 360], [6367, 1], [6400, 3], [6433, 5],
  [6467, 7], [6500, 9], [6517, 11], [6550, 13], [6567, 15], [6600, 18],
  [6633, 21], [6667, 24], [6683, 26], [6700, 28], [6717, 30], [6733, 32],
  [6750, 34], [6767, 36], [6783, 38], [6800, 40], [6817, 43], [6833, 45],
  [6850, 47], [6867, 50], [6883, 53], [6900, 55], [6917, 58], [6933, 61],
  [6950, 63], [6967, 66], [6983, 69], [7000, 72], [7017, 75], [7033, 77],
  [7050, 80], [7067, 83], [7083, 86], [7100, 89], [7117, 91], [7133, 94],
  [7150, 96], [7167, 99], [7183, 101], [7233, 99], [7300, 97], [7367, 95],
  [7417, 93], [7483, 91], [7517, 89], [7567, 87], [7600, 85], [7633, 83],
  [7667, 80], [7700, 77], [7733, 74], [7750, 72], [7767, 69], [7783, 67],
  [7800, 64], [7817, 61], [7833, 57], [7850, 52], [7867, 47], [7883, 42],
  [7900, 35], [7917, 179], [8000, 181], [8100, 183], [8200, 185], [8300, 187],
  [8400, 189], [8483, 191], [8583, 193], [8667, 195], [8750, 197], [8833, 199],
  [8917, 201], [8983, 203], [9067, 205], [9133, 207], [9183, 209], [9250, 211],
  [9300, 213], [9367, 215], [9417, 217], [9467, 219], [9517, 221], [9550, 223],
  [9600, 225], [9650, 227], [9683, 229], [9717, 231], [9750, 233], [9800, 235],
  [9833, 237], [9867, 240], [9900, 242], [9933, 244], [9967, 246], [9983, 248],
  [10017, 250], [10050, 253], [10083, 255], [10100, 257], [10250, 255], [10350, 253],
  [10417, 251], [10500, 249], [10567, 247], [10617, 245], [10667, 243], [10717, 241],
  [10750, 239], [10800, 237], [10833, 235], [10850, 233], [10883, 231], [10917, 229],
  [10933, 227], [10967, 225], [11000, 222], [11033, 220], [11067, 217], [11100, 214],
  [11117, 212], [11133, 210], [11150, 208], [11167, 206], [11183, 204], [11200, 201],
  [11217, 198], [11233, 195], [11250, 192], [11267, 188], [11283, 184], [11300, 179],
  [11317, 175], [11333, 169], [11350, 164],
];

registerCoachProgram({
  recordId: "starter-level",
  label: "Starter Level",
  maxMs: 16000,
  // Thrust is 1 on every input: see the note above about braking measuring worse.
  actions: STARTER_LINE.map(([atMs, headingDegrees]) => ({ atMs, steer: { headingDegrees, thrust: 1 } })),
});

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

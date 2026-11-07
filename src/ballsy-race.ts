import { COURSE_MAIN, COURSE_SHORTCUT, COURSE_LENGTH, COURSE_FORK } from "./ballsy-course";

export const VOLCANO_RACE_STEP = 1 / 60;
export const VOLCANO_RACE_GATES = 32;
export const VOLCANO_RECOVERY_SECONDS = 0.8;
type Branch = "main" | "shortcut";
type Position = [number, number, number];
export type VolcanoRun = {
  phase: "running" | "complete";
  lap: number;
  checkpointIndex: number;
  elapsedSeconds: number;
  progress: number;
  nextGate: number;
  branch: Branch;
  previous: Position;
  safe: { position: Position; progress: number; branch: Branch; headingDegrees: number };
  offTrackSeconds: number;
  wrongWay: boolean;
  rescues: number;
  pinnedSeconds: number;
  pinnedOrigin: Position;
};
type Projection = { x: number; y: number; z: number; t: number; width: number; tx: number; tz: number; distance: number; branch: Branch };

const JUNCTIONS = [COURSE_FORK.start, COURSE_FORK.end].map((t) =>
  COURSE_MAIN.reduce((best, p) => Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best));

const wrapDelta = (a: number, b: number): number => ((a - b + 1.5) % 1 + 1) % 1 - 0.5;

/** Project onto a physical segment, never a nearest checkpoint. Branch membership is
 * retained except where the two authored routes actually meet. */
function project(position: readonly number[], run?: VolcanoRun, onlyBranch?: Branch): Projection {
  let best: Projection | undefined;
  const local = run ? ((run.progress % 1) + 1) % 1 : 0;
  const junction = Math.abs(local - COURSE_FORK.start) < 0.025 || Math.abs(local - COURSE_FORK.end) < 0.025;
  for (const branch of ["main", "shortcut"] as const) {
    if (onlyBranch && branch !== onlyBranch) continue;
    if (run && !junction && branch !== run.branch) continue;
    const samples = branch === "main" ? COURSE_MAIN : COURSE_SHORTCUT;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      const dx = b.x - a.x, dz = b.z - a.z;
      const fraction = Math.max(0, Math.min(1, ((position[0] - a.x) * dx + (position[2] - a.z) * dz) / (dx * dx + dz * dz || 1)));
      const x = a.x + dx * fraction, z = a.z + dz * fraction;
      const t = a.t + (b.t - a.t) * fraction;
      // Disambiguates nearby hairpins and crossings without awarding a jump.
      if (run && Math.abs(wrapDelta(t, local)) > 0.075) continue;
      const distance = Math.hypot(position[0] - x, position[2] - z);
      if (!best || distance < best.distance) best = { x, z, y: a.y + (b.y - a.y) * fraction,
        t, width: a.width + (b.width - a.width) * fraction,
        tx: dx / (Math.hypot(dx, dz) || 1), tz: dz / (Math.hypot(dx, dz) || 1), distance, branch };
    }
  }
  return best!;
}

export function createVolcanoRun(spawn: readonly number[]): VolcanoRun {
  const point = project(spawn);
  const progress = point.t > 0.5 ? point.t - 1 : Math.min(0, point.t);
  const position: Position = [spawn[0], spawn[1], spawn[2]];
  return { phase: "running", lap: 0, checkpointIndex: 0, elapsedSeconds: 0, progress, nextGate: 1,
    branch: "main", previous: [...position], safe: { position, progress, branch: "main", headingDegrees: 270 },
    offTrackSeconds: 0, wrongWay: false, rescues: 0, pinnedSeconds: 0, pinnedOrigin: [...position] };
}

/** Returns a recovery pose only. The caller applies it through the ordinary physics API.
 * Clock never rewinds; recovery never advances progress or grants missing gates. */
export function advanceVolcanoRun(run: VolcanoRun, position: readonly number[], seconds: number, input: { tryingToMove: boolean } = { tryingToMove: false }): VolcanoRun["safe"] | null {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 0.1) throw new RangeError("Race step expects 0..0.1 seconds");
  if (run.phase === "complete" || seconds === 0) return null;
  const previousTime = run.elapsedSeconds;
  run.elapsedSeconds += seconds;
  const point = project(position, run);
  const travel = Math.hypot(position[0] - run.previous[0], position[2] - run.previous[2]);
  const delta = point ? wrapDelta(point.t, run.progress) : 0;
  const physicalContinuity = travel <= Math.max(0.6, 22 * seconds);
  // A wide fork has overlapping pavement: its two centre lines need not project
  // an off-centre ball to the same t. This is a coordinate change, not a teleport.
  // Require continuous physical motion inside BOTH roads and the actual junction.
  const oldBranchPoint = point && point.branch !== run.branch ? project(position, run, run.branch) : null;
  const physicalJunction = !!point && !!oldBranchPoint && run.offTrackSeconds === 0 && travel > 0.001 &&
    point.distance < point.width / 2 && oldBranchPoint.distance < oldBranchPoint.width / 2 &&
    JUNCTIONS.some((p) => Math.hypot(position[0] - p.x, position[2] - p.z) < p.width / 2) &&
    Math.abs(delta) <= Math.max(point.width, oldBranchPoint.width) / COURSE_LENGTH;
  const plausible = physicalContinuity && (Math.abs(delta) <= Math.max(0.008, travel / COURSE_LENGTH * 3) || physicalJunction);
  // Jumps are legal above the roadway; falls below it and excursions are not.
  const onTrack = !!point && point.distance <= point.width / 2 + 0.55 && position[1] >= point.y - 0.8 && position[1] < point.y + 5;
  if (plausible && onTrack) {
    const before = run.progress;
    const after = before + delta;
    run.progress = after;
    run.branch = point.branch;
    run.wrongWay = delta < -0.00015;
    run.offTrackSeconds = 0;
    // A gate can only be crossed from its preceding interval, in forward order.
    while (run.nextGate <= VOLCANO_RACE_GATES * 2 && before < run.nextGate / VOLCANO_RACE_GATES && after >= run.nextGate / VOLCANO_RACE_GATES) run.nextGate++;
    const crossedLine = Math.floor(after) > Math.floor(before) && delta > 0;
    if (crossedLine && after >= 1 && run.nextGate > VOLCANO_RACE_GATES * Math.floor(after)) run.lap = Math.min(2, Math.floor(after));
    run.checkpointIndex = Math.min(VOLCANO_RACE_GATES - 1, Math.max(0, run.nextGate - 1 - run.lap * VOLCANO_RACE_GATES));
    if (run.nextGate > VOLCANO_RACE_GATES * 2 && crossedLine && after >= 2) {
      run.phase = "complete";
      run.progress = 2;
      run.elapsedSeconds = previousTime + seconds * (2 - before) / delta;
    }
    // Latest grounded, well-inside pose: no automatic thrust, speed gift or teleport forward.
    if ((run.safe.progress > after || (point.distance < point.width / 2 - 0.45 && position[1] < point.y + 1.15)) && after <= run.nextGate / VOLCANO_RACE_GATES) {
      run.safe = { position: [point.x, point.y + 0.72, point.z], progress: after, branch: point.branch,
        headingDegrees: (Math.atan2(point.tx, -point.tz) * 180 / Math.PI + 360) % 360 };
    }
  } else {
    run.offTrackSeconds += seconds;
  }
  // An invalid jump does not become a new trusted origin on the next frame.
  if (physicalContinuity) run.previous = [position[0], position[1], position[2]];
  if (!input.tryingToMove || Math.hypot(position[0] - run.pinnedOrigin[0], position[2] - run.pinnedOrigin[2]) > 0.45) {
    run.pinnedSeconds = 0;
    run.pinnedOrigin = [position[0], position[1], position[2]];
  } else run.pinnedSeconds += seconds;
  if (run.offTrackSeconds + 1e-9 < VOLCANO_RECOVERY_SECONDS && run.pinnedSeconds + 1e-9 < 1) return null;
  run.rescues++;
  run.offTrackSeconds = 0;
  run.progress = Math.min(run.progress, run.safe.progress);
  run.branch = run.safe.branch;
  run.previous = [...run.safe.position];
  run.wrongWay = false;
  run.pinnedSeconds = 0;
  run.pinnedOrigin = [...run.safe.position];
  return structuredClone(run.safe);
}

export function volcanoStandings(players: readonly { id: string; name: string }[], runs: readonly VolcanoRun[]) {
  return players.map((player, slot) => ({ subjectId: player.id, label: player.name, run: runs[slot] }))
    .sort((a, b) => {
      if (a.run.phase === "complete" && b.run.phase === "complete") return a.run.elapsedSeconds - b.run.elapsedSeconds;
      if (a.run.phase === "complete") return -1;
      if (b.run.phase === "complete") return 1;
      return b.run.progress - a.run.progress;
    });
}

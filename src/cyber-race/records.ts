/**
 * Best runs per course (plan, length, difficulty), kept in this browser's storage, with the
 * winning flight recorded ten times a second so it can be replayed as a ghost.
 */

/** One sample of a flight: race time, distance, lateral offsets and roll. */
export type GhostSample = [number, number, number, number, number];

export interface RunRecord {
  name: string;
  time: number;
  score: number;
  date: string;
  ghost: GhostSample[];
}

const PREFIX = "graphysx.cyberRace.record";
export const GHOST_RATE = 10;

export function recordKey(plan: number, course: number, level: number): string {
  return `${PREFIX}.${plan}.${course}.${level}`;
}

/** Fixed track per course so a record can be learned and beaten. */
export function courseSeed(plan: number, course: number): number {
  return 1992 * 7919 + plan * 104729 + course * 1299709;
}

function valid(value: unknown): value is RunRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<RunRecord>;
  return (
    typeof r.name === "string" &&
    typeof r.time === "number" &&
    Number.isFinite(r.time) &&
    typeof r.score === "number" &&
    Array.isArray(r.ghost) &&
    r.ghost.every((g) => Array.isArray(g) && g.length === 5 && g.every((n) => typeof n === "number" && Number.isFinite(n)))
  );
}

export function loadRecord(key: string): RunRecord | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return valid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Saves the run; returns false if storage refused it (private mode, quota). */
export function saveRecord(key: string, record: RunRecord): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

const round = (v: number, digits: number): number => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

/** Collects a pilot's flight at a fixed rate. */
export class GhostRecorder {
  readonly samples: GhostSample[] = [];
  private next = 0;

  reset(): void {
    this.samples.length = 0;
    this.next = 0;
  }

  sample(time: number, s: number, ox: number, oy: number, roll: number): void {
    if (time < this.next) return;
    this.next = time + 1 / GHOST_RATE;
    this.samples.push([round(time, 2), round(s, 1), round(ox, 2), round(oy, 2), round(roll, 2)]);
  }
}

/** Interpolated pose of a recorded flight at `time`, or null once it is over. */
export function ghostAt(
  ghost: GhostSample[],
  time: number,
  cursor: { index: number }
): { s: number; ox: number; oy: number; roll: number } | null {
  if (ghost.length < 2 || time > ghost[ghost.length - 1][0]) return null;
  let i = Math.min(cursor.index, ghost.length - 2);
  if (ghost[i][0] > time) i = 0;
  while (i < ghost.length - 2 && ghost[i + 1][0] < time) i += 1;
  cursor.index = i;
  const a = ghost[i];
  const b = ghost[i + 1];
  const k = b[0] > a[0] ? Math.min(1, Math.max(0, (time - a[0]) / (b[0] - a[0]))) : 0;
  return {
    s: a[1] + (b[1] - a[1]) * k,
    ox: a[2] + (b[2] - a[2]) * k,
    oy: a[3] + (b[3] - a[3]) * k,
    roll: a[4] + (b[4] - a[4]) * k
  };
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m > 0 ? `${m}:${s.toFixed(2).padStart(5, "0")}` : `${s.toFixed(2)} s`;
}

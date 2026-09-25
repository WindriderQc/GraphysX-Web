/**
 * `agentx.math-scene.v1`: a counting or addition picture the host asks the docked mask to show.
 *
 * Pure: validation and the timeline (which cube appears where and when, which label reads what),
 * no three.js, so `node --test` reaches all of it. The host computes the arithmetic; this module
 * only lays it out, and refuses anything outside the v1 bounds (count to 100, sums to 20).
 *
 * Layout: rods of ten, the way a child is taught to count past ten. Counting fills rows of ten
 * top to bottom. An addition shows the first number, then the second one row group below, then
 * slides the second group up to complete the ten: 8 + 5 reads as one full rod and 3 more.
 */
export type MathScene =
  | Readonly<{ kind: "count"; to: number }>
  | Readonly<{ kind: "add"; a: number; b: number }>;

export const MATH_LIMITS = Object.freeze({ countMax: 100, sumMax: 20 });

export type MathCube = Readonly<{
  /** Which operand the cube belongs to: `a` (and every counting cube) or `b`. */
  group: "a" | "b";
  start: readonly [number, number, number];
  end: readonly [number, number, number];
  appearAt: number;
  /** When it starts sliding from `start` to `end`; equal positions never move. */
  moveAt: number;
}>;

export type MathTimeline = Readonly<{
  scene: MathScene;
  cubes: readonly MathCube[];
  /** Label text from `at` seconds on; the last one whose `at` has passed is shown. */
  labels: readonly Readonly<{ at: number; text: string }>[];
  /** Seconds until the picture is complete and still. */
  duration: number;
  /** Extent of every position the cubes occupy, stage-local, for framing. */
  bounds: Readonly<{ min: readonly [number, number]; max: readonly [number, number] }>;
}>;

export const MATH_PITCH = 0.2;
export const MATH_CUBE = 0.16;
const MOVE_SECONDS = 0.6;

const integer = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;

/** Accept a host message defensively. Anything outside v1 is refused, never clamped: a clamped
 * picture would show a different number than the one Nestor says. */
export function readMathScene(value: unknown): MathScene | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (source.schema !== undefined && source.schema !== "agentx.math-scene.v1") return null;
  if (source.kind === "count") {
    const to = integer(source.to, 1, MATH_LIMITS.countMax);
    return to === null ? null : { kind: "count", to };
  }
  if (source.kind === "add") {
    const a = integer(source.a, 0, MATH_LIMITS.sumMax), b = integer(source.b, 0, MATH_LIMITS.sumMax);
    if (a === null || b === null || a + b > MATH_LIMITS.sumMax || a + b === 0) return null;
    return { kind: "add", a, b };
  }
  return null;
}

/** Extra space between the fifth and sixth cube of a rod, as on a ten-frame: 5 and 5. */
export const MATH_HALF_GAP = 0.08;

/** Row-major slot in rods of ten, centred on x; row 0 is the top. */
function slot(index: number, rowOffset = 0): [number, number, number] {
  const column = index % 10, row = Math.floor(index / 10) + rowOffset;
  return [(column - 4.5) * MATH_PITCH + (column < 5 ? -1 : 1) * MATH_HALF_GAP / 2, -row * MATH_PITCH, 0];
}

function boundsOf(points: readonly (readonly [number, number, number])[]) {
  const half = MATH_CUBE / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x - half); maxX = Math.max(maxX, x + half);
    minY = Math.min(minY, y - half); maxY = Math.max(maxY, y + half);
  }
  return { min: [minX, minY] as const, max: [maxX, maxY] as const };
}

/** A small number reads one cube at a time; a hundred must still finish in a child's patience. */
function stepSeconds(total: number): number {
  return Math.max(0.09, Math.min(0.45, 9 / total));
}

export function mathTimeline(scene: MathScene): MathTimeline {
  if (scene.kind === "count") {
    const step = stepSeconds(scene.to);
    const cubes: MathCube[] = [];
    const labels: { at: number; text: string }[] = [];
    for (let i = 0; i < scene.to; i += 1) {
      const position = slot(i);
      cubes.push({ group: "a", start: position, end: position, appearAt: i * step, moveAt: i * step });
      // Every cube is named while there are few; past twenty, the tens carry the count.
      if (scene.to <= 20 || (i + 1) % 10 === 0 || i + 1 === scene.to) labels.push({ at: i * step, text: String(i + 1) });
    }
    return { scene, cubes, labels, duration: scene.to * step, bounds: boundsOf(cubes.map(cube => cube.end)) };
  }
  const { a, b } = scene;
  const step = stepSeconds(a + b);
  const cubes: MathCube[] = [];
  // The second number waits one empty row below the first, so the two groups read apart.
  const firstRows = Math.max(1, Math.ceil(a / 10));
  const bStart = a * step + 0.5;
  const regroupAt = bStart + b * step + 0.7;
  for (let i = 0; i < a; i += 1) {
    const position = slot(i);
    cubes.push({ group: "a", start: position, end: position, appearAt: i * step, moveAt: regroupAt });
  }
  for (let j = 0; j < b; j += 1) {
    cubes.push({ group: "b", start: slot(j, firstRows + 1), end: slot(a + j), appearAt: bStart + j * step, moveAt: regroupAt });
  }
  const labels = [
    ...(a > 0 ? [{ at: 0, text: String(a) }] : []),
    { at: bStart, text: `${a} + ${b}` },
    { at: regroupAt + MOVE_SECONDS, text: `${a} + ${b} = ${a + b}` },
  ];
  const points = cubes.flatMap(cube => [cube.start, cube.end]);
  return { scene, cubes, labels, duration: regroupAt + MOVE_SECONDS, bounds: boundsOf(points) };
}

export type MathCubeState = Readonly<{ visible: boolean; position: [number, number, number]; scale: number }>;

/** Where one cube is at `t`: it pops in over 0.18 s, then slides with an ease when regrouped. */
export function mathCubeAt(cube: MathCube, t: number): MathCubeState {
  if (t < cube.appearAt) return { visible: false, position: [...cube.start], scale: 0 };
  const pop = Math.min(1, (t - cube.appearAt) / 0.18);
  const scale = pop < 1 ? 1.25 * pop - 0.25 * pop * pop * pop : 1;
  const k = Math.max(0, Math.min(1, (t - cube.moveAt) / MOVE_SECONDS));
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const position: [number, number, number] = [
    cube.start[0] + (cube.end[0] - cube.start[0]) * e,
    cube.start[1] + (cube.end[1] - cube.start[1]) * e,
    // A small hop while sliding, so the regroup reads as cubes being moved, not teleported.
    Math.sin(Math.PI * e) * (cube.start[1] === cube.end[1] && cube.start[0] === cube.end[0] ? 0 : 0.18),
  ];
  return { visible: true, position, scale };
}

export function mathLabelAt(timeline: MathTimeline, t: number): string {
  let text = "";
  for (const label of timeline.labels) if (t >= label.at) text = label.text;
  return text;
}

/** The cube the mask should look at: the newest one, or the moving group while regrouping. */
export function mathFocusAt(timeline: MathTimeline, t: number): readonly [number, number, number] | null {
  let focus: readonly [number, number, number] | null = null;
  for (const cube of timeline.cubes) {
    if (t >= cube.appearAt && t - cube.appearAt < 1.2) focus = cube.start;
    if (cube.group === "b" && t >= cube.moveAt && t - cube.moveAt < MOVE_SECONDS + 0.4) focus = cube.end;
  }
  return focus;
}

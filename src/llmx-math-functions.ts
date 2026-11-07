/**
 * `agentx.math-scene.v2`, kind `functions`: one to four functions y = f(x) the host asks
 * `<llmx-stage>` to draw in the recovered Math Game style (molecule field, three axes, grid,
 * backdrop board), overlaid so they can be compared, with live parameters.
 *
 * `agentx.math-scene.v3` (phase 3) is v2 plus derivative curves, tangents and shaded areas, and
 * functions that use one another (g(x) = f(x) + 1, f'(2x)). Derivatives, slopes and areas are
 * computed here from the validated formulas, never taken from the host.
 *
 * `agentx.math-scene.v4` is v3 plus parametric curves c(t) = (x(t), y(t)) beside the functions
 * (`curves`, `t`; curves alone may leave `x` null to be framed around them), and a new kind,
 * `surfaces`: one or two surfaces z = f(x, y) over an x, y window, drawn as lit surfaces.
 *
 * Pure: validation, sampling and layout, no three.js, so `node --test` reaches all of it.
 * Every height comes from the formula through the shared grammar (`math-expression.ts`), never
 * from numbers the host or a model wrote. Anything outside the contract is refused whole,
 * never clamped: a clamped picture would show a different function than the one explained.
 *
 * v2 also carries the v1 cube kinds (`count`, `add`) unchanged; see {@link readStageScene}.
 */
import {
  MATH_EXPRESSION_LIMITS,
  MATH_RESERVED_NAMES,
  deriveMath,
  evaluateMath,
  expandMathCalls,
  fitMathRange,
  fitMathY,
  formatMath,
  formatMathNumber,
  integrateMath,
  mathWeight,
  parseMathExpression,
  parseMathFunctions,
  sampleMath,
  type MathNode,
} from "./math-expression";
import { readMathScene, type MathScene } from "./llmx-math-scene";

export const MATH_SCENE_V1 = "agentx.math-scene.v1";
export const MATH_SCENE_V2 = "agentx.math-scene.v2";
export const MATH_SCENE_V3 = "agentx.math-scene.v3";
export const MATH_SCENE_V4 = "agentx.math-scene.v4";
/** Functions and curves together, four at most; one or two surfaces. */
export const MATH_FUNCTION_LIMITS = Object.freeze({ functions: 4, label: 48, surfaces: MATH_EXPRESSION_LIMITS.surfaces });

/** Function colours in order, the same ones the host's legend uses unless it names its own. */
export const MATH_FUNCTION_PALETTE = Object.freeze(["#ffe86b", "#60d6e8", "#ff7a6b", "#9dff8a"]);

export type MathParameter = Readonly<{ name: string; value: number; min: number; max: number }>;
/** `tree` is the formula with any other function it uses already substituted (v3). */
export type MathFunction = Readonly<{ name: string; label: string; expression: string; color: string; tree: MathNode }>;
/** A tangent point or area bound: a declared parameter's name (it follows the slider) or a number. */
export type MathPoint = string | number;
export type MathDerivative = Readonly<{ of: string; fn: number; label: string; expression: string; tree: MathNode }>;
export type MathTangent = Readonly<{ of: string; fn: number; at: MathPoint; slope: MathNode }>;
export type MathArea = Readonly<{ of: string; fn: number; from: MathPoint; to: MathPoint }>;
/** A parametric curve (v4): its two coordinates in t, with the scene's functions already substituted. */
export type MathCurve = Readonly<{ name: string; label: string; color: string; x: string; y: string; xTree: MathNode; yTree: MathNode }>;
export type MathFunctionsScene = Readonly<{
  kind: "functions";
  schema: typeof MATH_SCENE_V2 | typeof MATH_SCENE_V3 | typeof MATH_SCENE_V4;
  functions: readonly MathFunction[];
  parameters: readonly MathParameter[];
  /** null only for curves alone (v4): the window is then framed around them. */
  x: readonly [number, number] | null;
  y: readonly [number, number] | null;
  derivatives: readonly MathDerivative[];
  tangents: readonly MathTangent[];
  areas: readonly MathArea[];
  curves: readonly MathCurve[];
  t: readonly [number, number] | null;
}>;
/** A surface z = f(x, y) (v4). */
export type MathSurface = Readonly<{ name: string; label: string; expression: string; color: string; tree: MathNode }>;
export type MathSurfacesScene = Readonly<{
  kind: "surfaces";
  schema: typeof MATH_SCENE_V4;
  surfaces: readonly MathSurface[];
  parameters: readonly MathParameter[];
  x: readonly [number, number];
  y: readonly [number, number];
  z: readonly [number, number] | null;
}>;
export type MathPlotScene = MathFunctionsScene | MathSurfacesScene;

export type StageScene =
  | Readonly<{ ok: true; type: "cubes"; scene: MathScene }>
  | Readonly<{ ok: true; type: "functions"; scene: MathFunctionsScene }>
  | Readonly<{ ok: true; type: "surfaces"; scene: MathSurfacesScene }>
  | Readonly<{ ok: false; reason: string; message: string }>;

const refuse = (reason: string, message: string): StageScene => ({ ok: false, reason, message });
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MATH_EXPRESSION_LIMITS.magnitude;
const LETTER = /^[a-z]$/;
const COLOR = /^#[0-9a-f]{6}$/i;

function readWindow(value: unknown): readonly [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2 || !finite(value[0]) || !finite(value[1])) return null;
  return value[1] - value[0] >= 1e-6 ? [value[0], value[1]] : null;
}

type Read<T> = { ok: true; value: T } | Readonly<{ ok: false; reason: string; message: string }>;

function readParameters(raw: unknown): Read<MathParameter[]> {
  const rawParameters = raw ?? [];
  if (!Array.isArray(rawParameters) || rawParameters.length > MATH_EXPRESSION_LIMITS.parameters) {
    return { ok: false, reason: "parameters", message: `At most ${MATH_EXPRESSION_LIMITS.parameters} parameters` };
  }
  const parameters: MathParameter[] = [];
  for (const row of rawParameters) {
    if (!isRecord(row) || typeof row.name !== "string" || !LETTER.test(row.name) || MATH_RESERVED_NAMES.includes(row.name)) {
      return { ok: false, reason: "parameters", message: "A parameter is one letter other than x, y, t or e" };
    }
    if (parameters.some(other => other.name === row.name)) return { ok: false, reason: "parameters", message: `Parameter ${row.name} is declared twice` };
    if (!finite(row.value) || !finite(row.min) || !finite(row.max) || !(row.min < row.max) || row.value < row.min || row.value > row.max) {
      return { ok: false, reason: "parameters", message: `Parameter ${row.name} needs a finite value inside [min, max]` };
    }
    parameters.push({ name: row.name, value: row.value, min: row.min, max: row.max });
  }
  return { ok: true, value: parameters };
}

/** A row's optional label and colour: a short line of text and #rrggbb, or the reason they are refused. */
function readLook(row: Record<string, unknown>): string | null {
  if (row.label !== undefined && (typeof row.label !== "string" || !row.label.trim() || row.label.length > MATH_FUNCTION_LIMITS.label
    || /[\u0000-\u001f\u007f]/.test(row.label))) return "A label is a short line of text";
  if (row.color !== undefined && (typeof row.color !== "string" || !COLOR.test(row.color))) return "A colour is #rrggbb";
  return null;
}

/** v4 surfaces: one or two z = f(x, y) over a declared x, y window; z declared or fitted. */
function readSurfaces(value: Record<string, unknown>): StageScene {
  const read = readParameters(value.parameters);
  if (!read.ok) return read;
  const parameters = read.value;
  if (parameters.some(row => row.name === "z")) return refuse("parameters", "z is the height in a surface scene");
  const raw = value.surfaces;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MATH_FUNCTION_LIMITS.surfaces) {
    return refuse("surfaces", `Draw one or ${MATH_FUNCTION_LIMITS.surfaces} surfaces`);
  }
  const names = ["x", "y", ...parameters.map(row => row.name)];
  const surfaces: MathSurface[] = [];
  for (const [index, row] of raw.entries()) {
    if (!isRecord(row) || typeof row.name !== "string" || !LETTER.test(row.name) || ["x", "y", "t", "e"].includes(row.name)) {
      return refuse("surfaces", "A surface is named by one letter other than x, y, t or e");
    }
    if (surfaces.some(other => other.name === row.name) || parameters.some(other => other.name === row.name)) {
      return refuse("surfaces", `The name ${row.name} is used twice`);
    }
    const look = readLook(row);
    if (look) return refuse("surfaces", look);
    const parsed = parseMathExpression(row.expression, names);
    if (!parsed.ok) return refuse("formula", `${row.name}: ${parsed.error.message}`);
    surfaces.push({
      name: row.name,
      label: typeof row.label === "string" ? row.label.trim() : row.name === "z" ? "z" : `${row.name}(x, y)`,
      expression: String(row.expression ?? "").trim(),
      color: typeof row.color === "string" ? row.color.toLowerCase() : MATH_FUNCTION_PALETTE[index],
      tree: parsed.tree,
    });
  }
  const x = readWindow(value.x), y = readWindow(value.y);
  if (!x || !y) return refuse("window", "The x and y windows are [min, max] with min below max");
  const z = value.z === undefined || value.z === null ? null : readWindow(value.z);
  if (value.z !== undefined && value.z !== null && !z) return refuse("window", "The z window is [min, max] with min below max");
  return { ok: true, type: "surfaces", scene: { kind: "surfaces", schema: MATH_SCENE_V4, surfaces, parameters, x, y, z } };
}

/**
 * Accept a host message defensively: v1 (cubes), or v2/v3/v4 with the cube kinds or `functions`,
 * or v4 `surfaces`. Refusals carry a short reason the host can record (`schema`, `functions`,
 * `formula`, `parameters`, `window`, `out-of-bounds`, in v3 `derivatives`, `tangents`, `areas`,
 * and in v4 `curves`, `surfaces`).
 */
export function readStageScene(value: unknown): StageScene {
  if (!isRecord(value)) return refuse("schema", "The scene must be an object");
  const schema = value.schema;
  if (schema !== undefined && schema !== MATH_SCENE_V1 && schema !== MATH_SCENE_V2 && schema !== MATH_SCENE_V3 && schema !== MATH_SCENE_V4) {
    return refuse("schema", "Unknown scene schema");
  }
  if (value.kind === "count" || value.kind === "add") {
    const scene = readMathScene({ ...value, schema: undefined });
    return scene ? { ok: true, type: "cubes", scene } : refuse("out-of-bounds", "The cube picture is outside its bounds");
  }
  const v4 = schema === MATH_SCENE_V4, v3 = schema === MATH_SCENE_V3 || v4;
  if (value.kind === "surfaces") return v4 ? readSurfaces(value) : refuse("schema", "Surfaces need agentx.math-scene.v4");
  if (value.kind !== "functions" || (schema !== MATH_SCENE_V2 && !v3)) return refuse("schema", "Functions need agentx.math-scene.v2 or later");
  if (!v3 && (value.derivatives !== undefined || value.tangents !== undefined || value.areas !== undefined)) {
    return refuse("schema", "Derivatives, tangents and areas need agentx.math-scene.v3");
  }
  if (!v4 && (value.curves !== undefined || value.t !== undefined)) return refuse("schema", "Parametric curves need agentx.math-scene.v4");

  const readParams = readParameters(value.parameters);
  if (!readParams.ok) return readParams;
  const parameters = readParams.value;

  const rawFunctions = value.functions ?? (v4 ? [] : undefined), rawCurves = value.curves ?? [];
  if (!Array.isArray(rawFunctions) || !Array.isArray(rawCurves) || rawFunctions.length + rawCurves.length < 1
    || rawFunctions.length + rawCurves.length > MATH_FUNCTION_LIMITS.functions) {
    return refuse("functions", v4 ? `Draw one to ${MATH_FUNCTION_LIMITS.functions} functions and curves` : `Draw one to ${MATH_FUNCTION_LIMITS.functions} functions`);
  }
  const names = ["x", ...parameters.map(row => row.name)];
  const rows: { name: string; label: string; expression: string; color: string }[] = [];
  for (const [index, row] of rawFunctions.entries()) {
    if (!isRecord(row) || typeof row.name !== "string" || !LETTER.test(row.name) || ["x", "t", "e"].includes(row.name)) {
      return refuse("functions", "A function is named by one letter other than x, t or e");
    }
    if (rows.some(other => other.name === row.name) || parameters.some(other => other.name === row.name)) {
      return refuse("functions", `The name ${row.name} is used twice`);
    }
    const look = readLook(row);
    if (look) return refuse("functions", look);
    if (!v3) {
      // v2 functions stand alone: a name that is another function is unknown there.
      const parsed = parseMathExpression(row.expression, names);
      if (!parsed.ok) return refuse("formula", `${row.name}: ${parsed.error.message}`);
    }
    rows.push({
      name: row.name,
      label: typeof row.label === "string" ? row.label.trim() : row.name === "y" ? "y" : `${row.name}(x)`,
      expression: String(row.expression ?? "").trim(),
      color: typeof row.color === "string" ? row.color.toLowerCase() : MATH_FUNCTION_PALETTE[index],
    });
  }
  const read = rows.length ? parseMathFunctions(rows.map(row => ({ name: row.name, source: row.expression })), names)
    : { ok: true as const, functions: [] };
  if (!read.ok) return refuse("formula", `${read.name}: ${read.error.message}`);
  const functions: MathFunction[] = rows.map((row, index) => ({ ...row, tree: read.functions[index].expanded }));

  // v4 curves: two coordinates in t, which may use the scene's functions; colours follow the functions'.
  const curveNames = ["t", ...parameters.map(row => row.name)], callable = rows.filter(row => row.name !== "y").map(row => row.name);
  const curves: MathCurve[] = [];
  for (const [index, row] of rawCurves.entries()) {
    if (!isRecord(row) || typeof row.name !== "string" || !LETTER.test(row.name) || ["x", "y", "t", "e"].includes(row.name)) {
      return refuse("curves", "A curve is named by one letter other than x, y, t or e");
    }
    if (rows.some(other => other.name === row.name) || curves.some(other => other.name === row.name)
      || parameters.some(other => other.name === row.name)) return refuse("curves", `The name ${row.name} is used twice`);
    const look = readLook(row);
    if (look) return refuse("curves", look);
    const trees: MathNode[] = [];
    for (const axis of ["x", "y"] as const) {
      const parsed = parseMathExpression(row[axis], curveNames, callable);
      if (!parsed.ok) return refuse("formula", `${row.name}(t), ${axis}: ${parsed.error.message}`);
      const expanded = expandMathCalls(parsed.tree, read.functions);
      if (!expanded.ok) return refuse("formula", `${row.name}(t): ${expanded.error.message}`);
      trees.push(expanded.tree);
    }
    curves.push({
      name: row.name,
      label: typeof row.label === "string" ? row.label.trim() : `${row.name}(t)`,
      color: typeof row.color === "string" ? row.color.toLowerCase() : MATH_FUNCTION_PALETTE[functions.length + index],
      x: String(row.x ?? "").trim(), y: String(row.y ?? "").trim(), xTree: trees[0], yTree: trees[1],
    });
  }
  const t = curves.length ? readWindow(value.t) : null;
  if (curves.length && !t) return refuse("window", "The t range is [min, max] with min below max");
  if (!curves.length && value.t !== undefined) return refuse("window", "A t range goes with curves");

  // Curves alone may leave x to be framed around them; functions always have their window.
  const x = value.x === null && v4 && !functions.length ? null : readWindow(value.x);
  if (!x && (functions.length || value.x !== null || !v4)) return refuse("window", "The x window is [min, max] with min below max");
  const y = value.y === undefined || value.y === null ? null : readWindow(value.y);
  if (value.y !== undefined && value.y !== null && !y) return refuse("window", "The y window is [min, max] with min below max");

  // v3: derivatives, tangents and areas name a function; their points stay inside the x window.
  const fnIndex = (name: unknown): number => (typeof name === "string" ? functions.findIndex(fn => fn.name === name) : -1);
  const slopes = new Map<number, MathNode>();
  const slopeOf = (fn: number): MathNode | null => {
    if (!slopes.has(fn)) {
      const tree = deriveMath(functions[fn].tree);
      if (mathWeight(tree) > MATH_EXPRESSION_LIMITS.derivative) return null;
      slopes.set(fn, tree);
    }
    return slopes.get(fn)!;
  };
  const point = (raw: unknown): MathPoint | null => {
    if (!x) return null;
    const parameter = typeof raw === "string" ? parameters.find(row => row.name === raw) : null;
    const [low, high] = parameter ? [parameter.min, parameter.max] : finite(raw) ? [raw, raw] : [NaN, NaN];
    if (!(low >= x[0] && high <= x[1])) return null;
    return parameter ? parameter.name : raw as number;
  };

  const rawDerivatives = value.derivatives ?? [];
  if (!Array.isArray(rawDerivatives) || rawDerivatives.length > functions.length) return refuse("derivatives", "One derivative per function at most");
  const derivatives: MathDerivative[] = [];
  for (const name of rawDerivatives) {
    const fn = fnIndex(name);
    if (fn < 0 || derivatives.some(row => row.fn === fn)) return refuse("derivatives", "A derivative names a function of the scene, once");
    const tree = slopeOf(fn);
    if (!tree) return refuse("formula", `${name}: the derivative is too large to draw`);
    derivatives.push({ of: name, fn, label: name === "y" ? "y'" : `${name}'(x)`, expression: formatMath(tree), tree });
  }
  const rawTangents = value.tangents ?? [];
  if (!Array.isArray(rawTangents) || rawTangents.length > MATH_EXPRESSION_LIMITS.tangents) {
    return refuse("tangents", `At most ${MATH_EXPRESSION_LIMITS.tangents} tangents`);
  }
  const tangents: MathTangent[] = [];
  for (const row of rawTangents) {
    const fn = isRecord(row) ? fnIndex(row.of) : -1;
    const at = fn >= 0 ? point((row as Record<string, unknown>).at) : null;
    if (fn < 0 || at === null) return refuse("tangents", "A tangent names a function and a point inside the x window");
    if (tangents.some(other => other.fn === fn && other.at === at)) return refuse("tangents", "The same tangent is asked twice");
    const slope = slopeOf(fn);
    if (!slope) return refuse("formula", `${functions[fn].name}: the derivative is too large to draw`);
    tangents.push({ of: functions[fn].name, fn, at, slope });
  }
  const rawAreas = value.areas ?? [];
  if (!Array.isArray(rawAreas) || rawAreas.length > MATH_EXPRESSION_LIMITS.areas) return refuse("areas", `At most ${MATH_EXPRESSION_LIMITS.areas} areas`);
  const areas: MathArea[] = [];
  for (const row of rawAreas) {
    const fn = isRecord(row) ? fnIndex(row.of) : -1;
    const from = fn >= 0 ? point((row as Record<string, unknown>).from) : null;
    const to = fn >= 0 ? point((row as Record<string, unknown>).to) : null;
    if (fn < 0 || from === null || to === null) return refuse("areas", "An area names a function and two bounds inside the x window");
    areas.push({ of: functions[fn].name, fn, from, to });
  }
  return { ok: true, type: "functions", scene: { kind: "functions", schema: v4 ? MATH_SCENE_V4 : v3 ? MATH_SCENE_V3 : MATH_SCENE_V2, functions,
    parameters, x, y, derivatives, tangents, areas, curves, t } };
}

/**
 * New parameter values for a scene already shown: every name must be declared and every value
 * inside its range, or nothing changes (null).
 */
export function readParameterValues(scene: MathPlotScene, value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const next: Record<string, number> = Object.fromEntries(scene.parameters.map(row => [row.name, row.value]));
  for (const [name, raw] of Object.entries(value)) {
    const row = scene.parameters.find(candidate => candidate.name === name);
    if (!row || !finite(raw) || raw < row.min || raw > row.max) return null;
    next[name] = raw;
  }
  return next;
}

// ---------------------------------------------------------------------------------------------
// Layout: the board in stage units. The front plane (z = depth / 2) carries the axes and one
// bright curve per function, for precise reading; behind it the molecule field extrudes every
// function along z, its lanes interleaved so overlaid functions stay visible where they cross.

export const MATH_BOARD = Object.freeze({ width: 4, height: 2.4, depth: 0.9 });
/** Molecules per lane along x, lanes along z shared by all functions. */
export const MATH_FIELD = Object.freeze({ columns: 72, lanes: 12 });
const CURVE_SAMPLES = MATH_EXPRESSION_LIMITS.samples;

/**
 * `fn` indexes what the molecule rides: the functions, then the curves (v4), or the surfaces.
 * `start` (0 to 1) is when it rises during the build; by default its column across the board.
 */
export type MathMolecule = Readonly<{ fn: number; lane: number; position: readonly [number, number, number] | null; start?: number }>;
export type MathPolyline = readonly (readonly [number, number])[];
export type MathTick = Readonly<{ value: number; text: string; at: number }>;
export type MathLayout = Readonly<{
  /** The math windows actually drawn: y is declared, or fitted to every curve together. */
  x: readonly [number, number];
  y: readonly [number, number];
  /** Stage-local front-plane polylines per function, broken where undefined or off the board. */
  curves: readonly (readonly MathPolyline[])[];
  molecules: readonly MathMolecule[];
  xTicks: readonly MathTick[];
  yTicks: readonly MathTick[];
  /** Stage-local positions of the axes through zero, or along the board edge when zero is not in view. */
  axisX: number;
  axisY: number;
  /** Where each function's name label goes: the end of its last visible stretch, or null. */
  labelAt: readonly (readonly [number, number] | null)[];
  /** The same for each derivative curve (v3). */
  derivativeCurves: readonly (readonly MathPolyline[])[];
  derivativeLabelAt: readonly (readonly [number, number] | null)[];
  tangents: readonly MathTangentLayout[];
  areas: readonly MathAreaLayout[];
  /** Front-plane polylines per parametric curve (v4), and where each name goes. */
  curveLines: readonly (readonly MathPolyline[])[];
  curveLabelAt: readonly (readonly [number, number] | null)[];
}>;
/** A tangent with the current values: math point and slope (null where undefined), and where it is drawn. */
export type MathTangentLayout = Readonly<{
  fn: number; x: number; y: number | null; slope: number | null;
  point: readonly [number, number] | null;
  segment: readonly [readonly [number, number], readonly [number, number]] | null;
}>;
/** An area with the current values: bounds, signed value (null where undefined) and the shaded columns [x, curve, axis]. */
export type MathAreaLayout = Readonly<{
  fn: number; from: number; to: number; value: number | null;
  bands: readonly (readonly (readonly [number, number, number])[])[];
}>;
/** Columns per shaded area. */
export const MATH_AREA_COLUMNS = 160;

export function mathScope(scene: MathPlotScene, values: Readonly<Record<string, number>> = {}): Record<string, number> {
  return Object.fromEntries(scene.parameters.map(row => [row.name, Number.isFinite(values[row.name]) ? values[row.name] : row.value]));
}

function niceStep(span: number): number {
  const raw = span / 6, power = Math.pow(10, Math.floor(Math.log10(raw))), unit = raw / power;
  return (unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10) * power;
}

/** Round tick values across a window, about six of them (the host's 2D card uses the same rule). */
export function mathTicks(low: number, high: number): number[] {
  const size = niceStep(high - low), first = Math.ceil(low / size) * size, values: number[] = [];
  for (let value = first; value <= high + size * 1e-9 && values.length < 30; value += size) values.push(Math.abs(value) < size * 1e-9 ? 0 : value);
  return values;
}

const tickText = (value: number): string => Number(value.toPrecision(4)).toString().replace("-", "−");

/** Clip the segment a→b to the vertical window [low, high]; null when it lies wholly outside. */
function clipSegment(a: readonly [number, number], b: readonly [number, number], low: number, high: number):
  [[number, number], [number, number]] | null {
  let [ax, ay] = a, [bx, by] = b;
  for (const edge of [low, high]) {
    const inside = (y: number) => (edge === low ? y >= low : y <= high);
    const aIn = inside(ay), bIn = inside(by);
    if (!aIn && !bIn) return null;
    if (aIn !== bIn) {
      const k = (edge - ay) / (by - ay), cx = ax + (bx - ax) * k;
      if (aIn) { bx = cx; by = edge; } else { ax = cx; ay = edge; }
    }
  }
  return [[ax, ay], [bx, by]];
}

/** Clip the segment a→b to the box; null when it lies wholly outside (Liang–Barsky). */
function clipBox(a: readonly [number, number], b: readonly [number, number], box: readonly [number, number, number, number]):
  [[number, number], [number, number], boolean] | null {
  const [x0, x1, y0, y1] = box, dx = b[0] - a[0], dy = b[1] - a[1];
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  // The third value says the segment leaves the box before b.
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy], t1 < 1];
}

/** Points of a parametric curve over its t range: [x, y], or null where undefined. */
export function sampleMathCurve(curve: MathCurve, t: readonly [number, number], scope: Readonly<Record<string, number>>,
  count: number = CURVE_SAMPLES): ([number, number] | null)[] {
  const values: Record<string, number> = { ...scope }, points: ([number, number] | null)[] = [];
  for (let i = 0; i <= count; i += 1) {
    values.t = t[0] + (t[1] - t[0]) * i / count;
    const x = evaluateMath(curve.xTree, values), y = evaluateMath(curve.yTree, values);
    points.push(Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 1e12 && Math.abs(y) < 1e12 ? [x, y] : null);
  }
  return points;
}

/** Widen one window so a unit is as long across as up the board (`aspect` = width / height): a circle stays round. */
export function mathEqualUnits(x: readonly [number, number], y: readonly [number, number], aspect: number):
  [[number, number], [number, number]] {
  const xs = x[1] - x[0], ys = y[1] - y[0];
  if (xs / ys < aspect) {
    const half = ys * aspect / 2, centre = (x[0] + x[1]) / 2;
    return [[centre - half, centre + half], [y[0], y[1]]];
  }
  const half = xs / aspect / 2, centre = (y[0] + y[1]) / 2;
  return [[x[0], x[1]], [centre - half, centre + half]];
}

/**
 * The windows drawn for a functions scene with the current values, as AgentX's `windowsOf`:
 * with functions, x as declared and y fitted to every curve (fitMathY); curves alone are
 * framed around themselves (fitMathRange). Curves alone with neither window declared get equal
 * units on the board, so a circle is drawn round.
 */
export function mathWindows(scene: MathFunctionsScene, values: Readonly<Record<string, number>> = {}):
  { x: [number, number]; y: [number, number] } {
  const scope = mathScope(scene, values);
  const points = scene.curves.flatMap(curve => sampleMathCurve(curve, scene.t!, scope)).filter((p): p is [number, number] => p !== null);
  if (!scene.functions.length) {
    const x = scene.x ? [scene.x[0], scene.x[1]] as [number, number] : fitMathRange(points.map(p => p[0]));
    const y = scene.y ? [scene.y[0], scene.y[1]] as [number, number] : fitMathRange(points.map(p => p[1]));
    if (scene.x || scene.y) return { x, y };
    const [ex, ey] = mathEqualUnits(x, y, MATH_BOARD.width / MATH_BOARD.height);
    return { x: ex, y: ey };
  }
  const x = scene.x!;
  const samples = [...scene.functions.map(fn => fn.tree), ...scene.derivatives.map(row => row.tree)]
    .flatMap(tree => sampleMath(tree, x, scope, CURVE_SAMPLES));
  const inside = points.filter(([px]) => px >= x[0] && px <= x[1]);
  return { x: [x[0], x[1]], y: fitMathY([...samples, ...inside], scene.y) };
}

export function mathLayout(scene: MathFunctionsScene, values: Readonly<Record<string, number>> = {}): MathLayout {
  const scope = mathScope(scene, values);
  const windows = mathWindows(scene, values);
  const samples = scene.functions.map(fn => sampleMath(fn.tree, windows.x, scope, CURVE_SAMPLES));
  const derivativeSamples = scene.derivatives.map(row => sampleMath(row.tree, windows.x, scope, CURVE_SAMPLES));
  const curvePoints = scene.curves.map(curve => sampleMathCurve(curve, scene.t!, scope));
  const [x0, x1] = windows.x;
  // The window fits every curve drawn, derivatives included, as the host's 2D card does.
  const [y0, y1] = windows.y;
  const { width: W, height: H, depth: D } = MATH_BOARD;
  const px = (x: number) => (x - x0) / (x1 - x0) * W - W / 2;
  const py = (y: number) => (y - y0) / (y1 - y0) * H - H / 2;
  const span = y1 - y0;

  const polylines = (points: readonly (readonly [number, number | null])[]): MathPolyline[] => {
    const lines: [number, number][][] = [];
    let current: [number, number][] | null = null, previous: readonly [number, number] | null = null;
    for (const [x, y] of points) {
      if (y === null) { previous = null; current = null; continue; }
      const point: readonly [number, number] = [x, y];
      // Break across an asymptote, as the 2D card does: never draw the vertical jump.
      if (previous && Math.abs(y - previous[1]) <= span * 2) {
        const clipped = clipSegment(previous, point, y0, y1);
        if (clipped) {
          const [a, b] = clipped;
          const start: [number, number] = [px(a[0]), py(a[1])], end: [number, number] = [px(b[0]), py(b[1])];
          const last = current?.[current.length - 1];
          if (!current || !last || Math.hypot(last[0] - start[0], last[1] - start[1]) > 1e-9) { current = [start]; lines.push(current); }
          current.push(end);
          // Leaving the window ends this stretch.
          if (b[1] !== y) current = null;
        } else current = null;
      } else current = null;
      previous = point;
    }
    return lines.filter(line => line.length > 1);
  };
  const curves = samples.map(polylines);
  const derivativeCurves = derivativeSamples.map(polylines);

  // Parametric curves may run any way, so they are clipped to the whole board and broken at a jump.
  const box = [x0, x1, y0, y1] as const;
  const curveLines = curvePoints.map(points => {
    const lines: [number, number][][] = [];
    let current: [number, number][] | null = null, previous: readonly [number, number] | null = null;
    for (const point of points) {
      if (!point) { previous = null; current = null; continue; }
      if (previous && Math.abs(point[0] - previous[0]) <= x1 - x0 && Math.abs(point[1] - previous[1]) <= y1 - y0) {
        const clipped = clipBox(previous, point, box);
        if (clipped) {
          const [a, b, leaves] = clipped;
          const start: [number, number] = [px(a[0]), py(a[1])], end: [number, number] = [px(b[0]), py(b[1])];
          const last = current?.[current.length - 1];
          if (!current || !last || Math.hypot(last[0] - start[0], last[1] - start[1]) > 1e-9) { current = [start]; lines.push(current); }
          current.push(end);
          if (leaves) current = null;
        } else current = null;
      } else current = null;
      previous = point;
    }
    return lines.filter(line => line.length > 1);
  });

  // The molecule lanes ride the functions, then the curves, in turn.
  const { columns, lanes } = MATH_FIELD;
  const count = scene.functions.length + scene.curves.length;
  const molecules: MathMolecule[] = [];
  for (let lane = 0; lane < lanes; lane += 1) {
    const fn = lane % count, curve = scene.curves[fn - scene.functions.length];
    const z = (lane - (lanes - 1) / 2) * (D / lanes);
    for (let column = 0; column <= columns; column += 1) {
      let x: number, y: number;
      if (curve) {
        const t = scene.t!, at = { ...scope, t: t[0] + (t[1] - t[0]) * column / columns };
        x = evaluateMath(curve.xTree, at); y = evaluateMath(curve.yTree, at);
      } else {
        x = x0 + (x1 - x0) * column / columns;
        y = evaluateMath(scene.functions[fn].tree, { ...scope, x });
      }
      const visible = Number.isFinite(x) && Number.isFinite(y) && x >= x0 && x <= x1 && y >= y0 && y <= y1;
      molecules.push({ fn, lane, position: visible ? [px(x), py(y), z] : null });
    }
  }

  // A tangent: the point on the curve and the line through it, across the window.
  const at = (value: MathPoint): number => (typeof value === "string" ? scope[value] : value);
  const tangents: MathTangentLayout[] = scene.tangents.map(row => {
    const x = at(row.at);
    const y = evaluateMath(scene.functions[row.fn].tree, { ...scope, x }), slope = evaluateMath(row.slope, { ...scope, x });
    if (!Number.isFinite(y) || !Number.isFinite(slope) || Math.abs(y) >= 1e12 || Math.abs(slope) >= 1e12) {
      return { fn: row.fn, x, y: null, slope: null, point: null, segment: null };
    }
    const clipped = clipSegment([x0, y + slope * (x0 - x)], [x1, y + slope * (x1 - x)], y0, y1);
    return {
      fn: row.fn, x, y, slope,
      point: y >= y0 && y <= y1 ? [px(x), py(y)] : null,
      segment: clipped ? [[px(clipped[0][0]), py(clipped[0][1])], [px(clipped[1][0]), py(clipped[1][1])]] : null,
    };
  });

  // An area: columns from the curve to the axis between the bounds, shown within the window.
  const inside = (y: number): number => Math.min(y1, Math.max(y0, y));
  const areas: MathAreaLayout[] = scene.areas.map(row => {
    const from = at(row.from), to = at(row.to), low = Math.min(from, to), high = Math.max(from, to);
    const tree = scene.functions[row.fn].tree, bands: (readonly [number, number, number])[][] = [];
    let band: (readonly [number, number, number])[] | null = null;
    for (let i = 0; i <= MATH_AREA_COLUMNS && high > low; i += 1) {
      const x = low + (high - low) * i / MATH_AREA_COLUMNS, y = evaluateMath(tree, { ...scope, x });
      if (!Number.isFinite(y)) { band = null; continue; }
      if (!band) { band = []; bands.push(band); }
      band.push([px(x), py(inside(y)), py(inside(0))]);
    }
    return { fn: row.fn, from, to, value: integrateMath(tree, scope, from, to), bands: bands.filter(rows => rows.length > 1) };
  });

  const xTicks = mathTicks(x0, x1).map(value => ({ value, text: tickText(value), at: px(value) }));
  const yTicks = mathTicks(y0, y1).map(value => ({ value, text: tickText(value), at: py(value) }));
  const ends = [...curves, ...derivativeCurves, ...curveLines].map(lines => {
    const last = lines[lines.length - 1];
    return last ? last[last.length - 1] : null;
  });
  const labels = spreadLabels(ends);
  const derivativeEnd = curves.length + derivativeCurves.length;
  return {
    x: [x0, x1], y: [y0, y1], curves, molecules, xTicks, yTicks,
    axisX: x0 <= 0 && x1 >= 0 ? px(0) : -W / 2,
    axisY: y0 <= 0 && y1 >= 0 ? py(0) : -H / 2,
    labelAt: labels.slice(0, curves.length),
    derivativeCurves,
    derivativeLabelAt: labels.slice(curves.length, derivativeEnd),
    tangents,
    areas,
    curveLines,
    curveLabelAt: labels.slice(derivativeEnd),
  };
}

/** Vertical room one function name needs; names ending close together are stacked upward. */
export const MATH_LABEL_GAP = 0.17;

function spreadLabels(points: readonly (readonly [number, number] | null)[]): ([number, number] | null)[] {
  const result = points.map(point => (point ? [point[0], point[1]] as [number, number] : null));
  const order = result.map((point, index) => ({ point, index })).filter(row => row.point)
    .sort((a, b) => a.point![1] - b.point![1] || a.index - b.index);
  for (let i = 1; i < order.length; i += 1) {
    const current = order[i].point!;
    for (let j = 0; j < i; j += 1) {
      const other = order[j].point!;
      if (Math.abs(current[0] - other[0]) < 0.8 && current[1] - other[1] < MATH_LABEL_GAP) current[1] = other[1] + MATH_LABEL_GAP;
    }
  }
  return result;
}

const pointText = (value: MathPoint): string => (typeof value === "string" ? value : formatMathNumber(value));

/** One readable line for receipts and accessibility: "f(x) = a*sin(b*x), a = 1, x in [-6.283, 6.283]". */
export function describeMathScene(scene: MathPlotScene, values: Readonly<Record<string, number>> = {}): string {
  const scope = mathScope(scene, values);
  const range = (axis: string, window: readonly [number, number]): string =>
    `${axis} in [${formatMathNumber(window[0])}, ${formatMathNumber(window[1])}]`;
  const params = scene.parameters.map(row => `${row.name} = ${formatMathNumber(scope[row.name])}`).join(", ");
  if (scene.kind === "surfaces") {
    const rows = scene.surfaces.map(row => `${row.label} = ${row.expression}`).join("; ");
    return [rows, params, range("x", scene.x), range("y", scene.y)].filter(Boolean).join(", ");
  }
  const fns = [
    ...scene.functions.map(fn => `${fn.label} = ${fn.expression}`),
    ...scene.curves.map(row => `${row.label} = (${row.x}, ${row.y})`),
    ...scene.derivatives.map(row => `${row.label} = ${row.expression}`),
    ...scene.tangents.map(row => `tangent ${row.of} at ${pointText(row.at)}`),
    ...scene.areas.map(row => `area ${row.of} from ${pointText(row.from)} to ${pointText(row.to)}`),
  ].join("; ");
  return [fns, params, scene.t ? range("t", scene.t) : "", scene.x ? range("x", scene.x) : ""].filter(Boolean).join(", ");
}

// ---------------------------------------------------------------------------------------------
// Surfaces (v4): a box in stage units, x across, y going away from the viewer, z up. The surface is
// a grid of points computed from the formula; a coarser molecule field rides it, as on the board.

/** The longest ground side, the height, and the shortest ground side when x and y spans differ. */
export const MATH_SURFACE_BOX = Object.freeze({ side: 3.2, height: 1.9, least: 1.2 });
/** Molecules per side of each surface. */
export const MATH_SURFACE_MOLECULES = 20;

export type MathSurfaceBox = Readonly<{ width: number; height: number; depth: number }>;
export type MathSurfaceLayout = Readonly<{
  /** The windows drawn: x and y as declared, z declared or fitted to the heights. */
  x: readonly [number, number];
  y: readonly [number, number];
  z: readonly [number, number];
  box: MathSurfaceBox;
  /** Grid points per surface, row by row ((n + 1)² of them), in stage units; null where undefined or outside z. */
  grids: readonly (readonly (readonly [number, number, number] | null)[])[];
  /** Points per side of each grid, minus one. */
  grid: number;
  molecules: readonly MathMolecule[];
  xTicks: readonly MathTick[];
  yTicks: readonly MathTick[];
  zTicks: readonly MathTick[];
  /** Where the axes cross: zero when it is in view, the box's near corner otherwise. */
  origin: readonly [number, number, number];
}>;

/** The windows drawn for a surfaces scene with the current values, as AgentX's `windowsOf`. */
export function mathSurfaceWindows(scene: MathSurfacesScene, values: Readonly<Record<string, number>> = {}):
  { x: [number, number]; y: [number, number]; z: [number, number] } {
  const scope = mathScope(scene, values), n = MATH_EXPRESSION_LIMITS.grid, heights: (number | null)[] = [];
  for (const row of scene.surfaces) {
    for (let j = 0; j <= n; j += 1) for (let i = 0; i <= n; i += 1) {
      const x = scene.x[0] + (scene.x[1] - scene.x[0]) * i / n, y = scene.y[0] + (scene.y[1] - scene.y[0]) * j / n;
      const z = evaluateMath(row.tree, { ...scope, x, y });
      heights.push(Number.isFinite(z) && Math.abs(z) < 1e12 ? z : null);
    }
  }
  return { x: [scene.x[0], scene.x[1]], y: [scene.y[0], scene.y[1]], z: scene.z ? [scene.z[0], scene.z[1]] : fitMathRange(heights) };
}

export function mathSurfaceLayout(scene: MathSurfacesScene, values: Readonly<Record<string, number>> = {}): MathSurfaceLayout {
  const scope = mathScope(scene, values), windows = mathSurfaceWindows(scene, values);
  const [x0, x1] = windows.x, [y0, y1] = windows.y, [z0, z1] = windows.z;
  // The ground keeps equal units in x and y, within reason.
  const { side, height: Hb, least } = MATH_SURFACE_BOX, ratio = (y1 - y0) / (x1 - x0);
  const Wb = ratio <= 1 ? side : Math.max(least, side / ratio), Db = ratio <= 1 ? Math.max(least, side * ratio) : side;
  const sx = (x: number) => (x - x0) / (x1 - x0) * Wb - Wb / 2;
  const sz = (y: number) => Db / 2 - (y - y0) / (y1 - y0) * Db;
  const sy = (z: number) => (z - z0) / (z1 - z0) * Hb - Hb / 2;
  const at = (fn: number, x: number, y: number): [number, number, number] | null => {
    const z = evaluateMath(scene.surfaces[fn].tree, { ...scope, x, y });
    return Number.isFinite(z) && z >= z0 && z <= z1 ? [sx(x), sy(z), sz(y)] : null;
  };
  const n = MATH_EXPRESSION_LIMITS.grid;
  const grids = scene.surfaces.map((_, fn) => {
    const points: ([number, number, number] | null)[] = [];
    for (let j = 0; j <= n; j += 1) for (let i = 0; i <= n; i += 1) points.push(at(fn, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * j / n));
    return points;
  });
  const m = MATH_SURFACE_MOLECULES, molecules: MathMolecule[] = [];
  scene.surfaces.forEach((_, fn) => {
    for (let j = 0; j <= m - 1; j += 1) for (let i = 0; i <= m - 1; i += 1) {
      // Cell centres, so molecules sit between the grid lines; they rise from the left as on the board.
      const x = x0 + (x1 - x0) * (i + 0.5) / m, y = y0 + (y1 - y0) * (j + 0.5) / m;
      molecules.push({ fn, lane: j, position: at(fn, x, y), start: i / m });
    }
  });
  const ticks = (low: number, high: number, place: (value: number) => number): MathTick[] =>
    mathTicks(low, high).map(value => ({ value, text: tickText(value), at: place(value) }));
  const zero = (low: number, high: number) => (low <= 0 && high >= 0 ? 0 : low);
  return {
    x: windows.x, y: windows.y, z: windows.z, box: { width: Wb, height: Hb, depth: Db }, grids, grid: n, molecules,
    xTicks: ticks(x0, x1, sx), yTicks: ticks(y0, y1, sz), zTicks: ticks(z0, z1, sy),
    origin: [sx(zero(x0, x1)), sy(zero(z0, z1)), sz(zero(y0, y1))],
  };
}

// ---------------------------------------------------------------------------------------------
// Framing: the camera orbits the board's centre; this finds the distance at which every corner
// of the board (plus room for labels) fits the element at any aspect.

export type MathOrbit = Readonly<{ yaw: number; pitch: number }>;
export const MATH_ORBIT_DEFAULT: MathOrbit = Object.freeze({ yaw: -0.38, pitch: 0.26 });
/** Surfaces open seen from higher up, so their shape reads at once. */
export const MATH_SURFACE_ORBIT: MathOrbit = Object.freeze({ yaw: -0.62, pitch: 0.52 });
export const MATH_ORBIT_LIMITS = Object.freeze({ yaw: [-1.2, 1.2] as const, pitch: [-0.15, 1.05] as const });

export function clampOrbit(orbit: MathOrbit): MathOrbit {
  const { yaw, pitch } = MATH_ORBIT_LIMITS;
  return { yaw: Math.min(yaw[1], Math.max(yaw[0], orbit.yaw)), pitch: Math.min(pitch[1], Math.max(pitch[0], orbit.pitch)) };
}

/** Camera position on the orbit at `distance`, looking at the origin. */
export function orbitPosition(orbit: MathOrbit, distance: number): [number, number, number] {
  return [
    distance * Math.cos(orbit.pitch) * Math.sin(orbit.yaw),
    distance * Math.sin(orbit.pitch),
    distance * Math.cos(orbit.pitch) * Math.cos(orbit.yaw),
  ];
}

/** Room around the board for tick numbers and function names, in stage units. */
const FRAME_ROOM = Object.freeze({ left: 0.42, right: 0.5, bottom: 0.34, top: 0.16 });

/** The corners to keep in view, in stage units: the board with room for its labels, or a surface box. */
export type MathFrame = Readonly<{ xs: readonly number[]; ys: readonly number[]; zs: readonly number[] }>;
export const MATH_BOARD_FRAME: MathFrame = Object.freeze({
  xs: [-MATH_BOARD.width / 2 - FRAME_ROOM.left, MATH_BOARD.width / 2 + FRAME_ROOM.right],
  ys: [-MATH_BOARD.height / 2 - FRAME_ROOM.bottom, MATH_BOARD.height / 2 + FRAME_ROOM.top],
  zs: [-MATH_BOARD.depth / 2 - 0.2, MATH_BOARD.depth / 2 + 0.1],
});
/** A surface box with room for its tick numbers and axis letters. */
export function mathSurfaceFrame(box: MathSurfaceBox): MathFrame {
  return { xs: [-box.width / 2 - 0.5, box.width / 2 + 0.5], ys: [-box.height / 2 - 0.25, box.height / 2 + 0.25],
    zs: [-box.depth / 2 - 0.35, box.depth / 2 + 0.35] };
}

export function mathFitDistance(orbit: MathOrbit, aspect: number, fovDegrees: number, margin = 1.06, frame: MathFrame = MATH_BOARD_FRAME): number {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const tanV = Math.tan((fovDegrees * Math.PI) / 360), tanH = tanV * ratio;
  const { xs, ys, zs } = frame;
  // Camera basis for this orbit: forward points from the camera to the origin.
  const cy = Math.cos(orbit.yaw), sy = Math.sin(orbit.yaw), cp = Math.cos(orbit.pitch), sp = Math.sin(orbit.pitch);
  const right = [cy, 0, -sy], up = [-sp * sy, cp, -sp * cy], back = [cp * sy, sp, cp * cy];
  let distance = 0;
  for (const x of xs) for (const y of ys) for (const z of zs) {
    const rx = x * right[0] + y * right[1] + z * right[2];
    const ry = x * up[0] + y * up[1] + z * up[2];
    const rz = x * back[0] + y * back[1] + z * back[2];
    // A corner at depth rz toward the camera needs the camera at least this far back.
    distance = Math.max(distance, rz + Math.abs(rx) * margin / tanH, rz + Math.abs(ry) * margin / tanV);
  }
  return distance;
}

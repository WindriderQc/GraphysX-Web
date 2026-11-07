/**
 * `agentx.math-scene.v2`, kind `functions`: one to four functions y = f(x) the host asks
 * `<llmx-stage>` to draw in the recovered Math Game style (molecule field, three axes, grid,
 * backdrop board), overlaid so they can be compared, with live parameters.
 *
 * `agentx.math-scene.v3` (phase 3) is v2 plus derivative curves, tangents and shaded areas, and
 * functions that use one another (g(x) = f(x) + 1, f'(2x)). Derivatives, slopes and areas are
 * computed here from the validated formulas, never taken from the host.
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
export const MATH_FUNCTION_LIMITS = Object.freeze({ functions: 4, label: 48 });

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
export type MathFunctionsScene = Readonly<{
  kind: "functions";
  schema: typeof MATH_SCENE_V2 | typeof MATH_SCENE_V3;
  functions: readonly MathFunction[];
  parameters: readonly MathParameter[];
  x: readonly [number, number];
  y: readonly [number, number] | null;
  derivatives: readonly MathDerivative[];
  tangents: readonly MathTangent[];
  areas: readonly MathArea[];
}>;

export type StageScene =
  | Readonly<{ ok: true; type: "cubes"; scene: MathScene }>
  | Readonly<{ ok: true; type: "functions"; scene: MathFunctionsScene }>
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

/**
 * Accept a host message defensively: v1 (cubes), or v2/v3 with the cube kinds or `functions`.
 * Refusals carry a short reason the host can record (`schema`, `functions`, `formula`,
 * `parameters`, `window`, `out-of-bounds`, and in v3 `derivatives`, `tangents`, `areas`).
 */
export function readStageScene(value: unknown): StageScene {
  if (!isRecord(value)) return refuse("schema", "The scene must be an object");
  const schema = value.schema;
  if (schema !== undefined && schema !== MATH_SCENE_V1 && schema !== MATH_SCENE_V2 && schema !== MATH_SCENE_V3) {
    return refuse("schema", "Unknown scene schema");
  }
  if (value.kind === "count" || value.kind === "add") {
    const scene = readMathScene({ ...value, schema: undefined });
    return scene ? { ok: true, type: "cubes", scene } : refuse("out-of-bounds", "The cube picture is outside its bounds");
  }
  const v3 = schema === MATH_SCENE_V3;
  if (value.kind !== "functions" || (schema !== MATH_SCENE_V2 && !v3)) return refuse("schema", "Functions need agentx.math-scene.v2 or v3");
  if (!v3 && (value.derivatives !== undefined || value.tangents !== undefined || value.areas !== undefined)) {
    return refuse("schema", "Derivatives, tangents and areas need agentx.math-scene.v3");
  }

  const rawParameters = value.parameters ?? [];
  if (!Array.isArray(rawParameters) || rawParameters.length > MATH_EXPRESSION_LIMITS.parameters) {
    return refuse("parameters", `At most ${MATH_EXPRESSION_LIMITS.parameters} parameters`);
  }
  const parameters: MathParameter[] = [];
  for (const row of rawParameters) {
    if (!isRecord(row) || typeof row.name !== "string" || !LETTER.test(row.name) || MATH_RESERVED_NAMES.includes(row.name)) {
      return refuse("parameters", "A parameter is one letter other than x, y, t or e");
    }
    if (parameters.some(other => other.name === row.name)) return refuse("parameters", `Parameter ${row.name} is declared twice`);
    if (!finite(row.value) || !finite(row.min) || !finite(row.max) || !(row.min < row.max) || row.value < row.min || row.value > row.max) {
      return refuse("parameters", `Parameter ${row.name} needs a finite value inside [min, max]`);
    }
    parameters.push({ name: row.name, value: row.value, min: row.min, max: row.max });
  }

  const rawFunctions = value.functions;
  if (!Array.isArray(rawFunctions) || rawFunctions.length < 1 || rawFunctions.length > MATH_FUNCTION_LIMITS.functions) {
    return refuse("functions", `Draw one to ${MATH_FUNCTION_LIMITS.functions} functions`);
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
    if (row.label !== undefined && (typeof row.label !== "string" || !row.label.trim() || row.label.length > MATH_FUNCTION_LIMITS.label
      || /[\u0000-\u001f\u007f]/.test(row.label))) return refuse("functions", "A label is a short line of text");
    if (row.color !== undefined && (typeof row.color !== "string" || !COLOR.test(row.color))) return refuse("functions", "A colour is #rrggbb");
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
  const read = parseMathFunctions(rows.map(row => ({ name: row.name, source: row.expression })), names);
  if (!read.ok) return refuse("formula", `${read.name}: ${read.error.message}`);
  const functions: MathFunction[] = rows.map((row, index) => ({ ...row, tree: read.functions[index].expanded }));

  const x = readWindow(value.x);
  if (!x) return refuse("window", "The x window is [min, max] with min below max");
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
  return { ok: true, type: "functions", scene: { kind: "functions", schema: v3 ? MATH_SCENE_V3 : MATH_SCENE_V2, functions, parameters, x, y,
    derivatives, tangents, areas } };
}

/**
 * New parameter values for a scene already shown: every name must be declared and every value
 * inside its range, or nothing changes (null).
 */
export function readParameterValues(scene: MathFunctionsScene, value: unknown): Record<string, number> | null {
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

export type MathMolecule = Readonly<{ fn: number; lane: number; position: readonly [number, number, number] | null }>;
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

export function mathScope(scene: MathFunctionsScene, values: Readonly<Record<string, number>> = {}): Record<string, number> {
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

export function mathLayout(scene: MathFunctionsScene, values: Readonly<Record<string, number>> = {}): MathLayout {
  const scope = mathScope(scene, values);
  const samples = scene.functions.map(fn => sampleMath(fn.tree, scene.x, scope, CURVE_SAMPLES));
  const derivativeSamples = scene.derivatives.map(row => sampleMath(row.tree, scene.x, scope, CURVE_SAMPLES));
  const [x0, x1] = scene.x;
  // The window fits every curve drawn, derivatives included, as the host's 2D card does.
  const [y0, y1] = fitMathY([...samples, ...derivativeSamples].flat(), scene.y);
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

  const { columns, lanes } = MATH_FIELD;
  const count = scene.functions.length;
  const molecules: MathMolecule[] = [];
  for (let lane = 0; lane < lanes; lane += 1) {
    const fn = lane % count;
    const z = (lane - (lanes - 1) / 2) * (D / lanes);
    for (let column = 0; column <= columns; column += 1) {
      const x = x0 + (x1 - x0) * column / columns;
      const y = evaluateMath(scene.functions[fn].tree, { ...scope, x });
      const visible = Number.isFinite(y) && y >= y0 && y <= y1;
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
  const ends = [...curves, ...derivativeCurves].map(lines => {
    const last = lines[lines.length - 1];
    return last ? last[last.length - 1] : null;
  });
  const labels = spreadLabels(ends);
  return {
    x: [x0, x1], y: [y0, y1], curves, molecules, xTicks, yTicks,
    axisX: x0 <= 0 && x1 >= 0 ? px(0) : -W / 2,
    axisY: y0 <= 0 && y1 >= 0 ? py(0) : -H / 2,
    labelAt: labels.slice(0, curves.length),
    derivativeCurves,
    derivativeLabelAt: labels.slice(curves.length),
    tangents,
    areas,
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
export function describeMathScene(scene: MathFunctionsScene, values: Readonly<Record<string, number>> = {}): string {
  const scope = mathScope(scene, values);
  const fns = [
    ...scene.functions.map(fn => `${fn.label} = ${fn.expression}`),
    ...scene.derivatives.map(row => `${row.label} = ${row.expression}`),
    ...scene.tangents.map(row => `tangent ${row.of} at ${pointText(row.at)}`),
    ...scene.areas.map(row => `area ${row.of} from ${pointText(row.from)} to ${pointText(row.to)}`),
  ].join("; ");
  const params = scene.parameters.map(row => `${row.name} = ${formatMathNumber(scope[row.name])}`).join(", ");
  return [fns, params, `x in [${formatMathNumber(scene.x[0])}, ${formatMathNumber(scene.x[1])}]`].filter(Boolean).join(", ");
}

// ---------------------------------------------------------------------------------------------
// Framing: the camera orbits the board's centre; this finds the distance at which every corner
// of the board (plus room for labels) fits the element at any aspect.

export type MathOrbit = Readonly<{ yaw: number; pitch: number }>;
export const MATH_ORBIT_DEFAULT: MathOrbit = Object.freeze({ yaw: -0.38, pitch: 0.26 });
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

export function mathFitDistance(orbit: MathOrbit, aspect: number, fovDegrees: number, margin = 1.06): number {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const tanV = Math.tan((fovDegrees * Math.PI) / 360), tanH = tanV * ratio;
  const { width: W, height: H, depth: D } = MATH_BOARD;
  const xs = [-W / 2 - FRAME_ROOM.left, W / 2 + FRAME_ROOM.right], ys = [-H / 2 - FRAME_ROOM.bottom, H / 2 + FRAME_ROOM.top];
  const zs = [-D / 2 - 0.2, D / 2 + 0.1];
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

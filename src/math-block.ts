/**
 * The Math Lab's block text, the lines Nestor writes inside `<show kind="math">` in AgentX:
 *
 *   y = a*sin(b*x)        or f(x) = …, g(x) = …: one to four functions, compared on the same axes;
 *                         g(x) = f(x) + 1 or f'(2x) uses another function of the block
 *   a = 1 in [-3, 3]      a parameter, its value and slider range
 *   x in [-2*pi, 2*pi]    optional horizontal window (default [-10, 10])
 *   y in [-4, 4]          optional vertical window (default: fitted to the curve)
 *   f'(x)                 draw the derivative of f, computed from its formula
 *   tangent f at p        the tangent to f at x = p (a parameter or a number inside the window)
 *   area f from a to b    the area under f between two bounds (parameters or numbers)
 *   c(t) = (cos(t), sin(t))  a parametric curve beside the functions (four functions and curves at most);
 *                         t in [0, 2*pi] is its parameter's range (the default)
 * or a surface block, with nothing else but parameters and windows:
 *   z = x^2 - y^2         or f(x, y) = …: one or two surfaces
 *   x in [-5, 5]          y in [-5, 5]: the ground window (default [-5, 5] each)
 *   z in [-10, 10]        optional height window (default: fitted to the surface)
 *
 * A port of `parsePlot` and `plotText` in AgentX's `core/public/js/math-expression.js`, built on
 * the grammar already ported in `math-expression.ts` (never a second grammar). Its answers are
 * pinned by `test/fixtures/math-block-vectors.json`, generated from AgentX's own parser by
 * `scripts/math-block-vectors.mjs`. Like AgentX, anything out of range is refused, never clamped.
 *
 * `mathBlockScene` is the scene AgentX's math card hands to `<llmx-stage>` (its `sceneOf`), so a
 * block typed on this site draws the same picture as one Nestor writes. Pure: no three.js, no DOM.
 */
import {
  MATH_EXPRESSION_LIMITS,
  deriveMath,
  evaluateMath,
  expandMathCalls,
  formatMath,
  formatMathNumber,
  mathWeight,
  normalizeMath,
  parseMathExpression,
  parseMathFunctions,
  type MathFailure,
  type MathFunctionTrees,
  type MathNode,
} from "./math-expression";

export const MATH_BLOCK_SCHEMA = "agentx.math-plot.v4";
export const MATH_BLOCK_LIMITS = Object.freeze({ body: 1200, functions: 4 });
/** The colours AgentX's card and `<llmx-stage>` give functions, then curves, in order. */
export const MATH_BLOCK_COLORS = Object.freeze(["#ffe86b", "#60d6e8", "#ff7a6b", "#9dff8a"]);

const RESERVED = new Set(["x", "y", "t", "e"]);
// A function is "y" or named by one letter: f(x), g(x)… never x, t or the constant e.
const FUNCTION_LINE = /^(?:(y)|([a-z])\s*\(\s*x\s*\))\s*=\s*(.+)$/i;
// f'(x) or y' alone: draw the derivative, computed from the formula.
const DERIVATIVE_LINE = /^([a-z])\s*'\s*(?:\(\s*x\s*\))?\s*(=.*)?$/i;
// tangent f at p, tangent to f at x = 1, tangente à f en p
const TANGENT_LINE = /^tangente?\s+(?:to\s+|à\s+)?(?:([a-z])(?:\s*\(\s*x\s*\))?\s+)?(?:at|en)\s+(?:x\s*=\s*)?(.+)$/i;
// area f from a to b, area under f from 0 to 2, aire sous f de a à b
const AREA_LINE = /^(?:area|aire)\s+(?:(?:under|of|sous|de)\s+)?(?:([a-z])(?:\s*\(\s*x\s*\))?\s+)?(?:from|de)\s+(.+?)\s+(?:to|à)\s+(.+)$/i;
// c(t) = (cos(t), sin(t)): a parametric curve, its two coordinates in t.
const CURVE_LINE = /^([a-z])\s*\(\s*t\s*\)\s*=\s*\((.+)\)$/i;
// z = x^2 - y^2 or f(x, y) = …: a surface over the x, y window.
const SURFACE_LINE = /^(?:(z)|([a-z])\s*\(\s*x\s*,\s*y\s*\))\s*=\s*(.+)$/i;
const RANGE = /^\[\s*([^,\]]+?)\s*[,;]\s*([^\]]+?)\s*\]$|^([^.\s][^\s]*?)\s*\.\.\s*(\S+)$/;
const DEFAULT_X: readonly [number, number] = Object.freeze([-10, 10]) as readonly [number, number];
const DEFAULT_T: readonly [number, number] = Object.freeze([0, 2 * Math.PI]) as readonly [number, number];
const DEFAULT_SURFACE: readonly [number, number] = Object.freeze([-5, 5]) as readonly [number, number];

export type MathBlockPoint = string | number;
export type MathBlockParameter = { name: string; value: number; min: number; max: number };
export type MathBlockFunctionsPlot = {
  schema: typeof MATH_BLOCK_SCHEMA; kind: "functions"; variable: "x";
  functions: { name: string; label: string; expression: string }[];
  parameters: MathBlockParameter[];
  x?: [number, number]; y?: [number, number];
  derivatives?: string[];
  tangents?: { of: string; at: MathBlockPoint }[];
  areas?: { of: string; from: MathBlockPoint; to: MathBlockPoint }[];
  curves?: { name: string; label: string; x: string; y: string }[];
  t?: [number, number];
};
export type MathBlockSurfacesPlot = {
  schema: typeof MATH_BLOCK_SCHEMA; kind: "surfaces";
  surfaces: { name: string; label: string; expression: string }[];
  parameters: MathBlockParameter[];
  x: [number, number]; y: [number, number]; z?: [number, number];
};
export type MathBlockPlot = MathBlockFunctionsPlot | MathBlockSurfacesPlot;
export type MathBlock = {
  ok: true; plot: MathBlockPlot; trees: MathNode[]; slopes: Record<string, MathNode>;
  curveTrees: { x: MathNode; y: MathNode }[]; references: boolean; text: string;
};

const failure = (code: string, message: string): MathFailure => ({ ok: false, error: { code, message } });
type Value<T> = { ok: true; value: T } | MathFailure;

const usesFunctions = (tree: MathNode): boolean => tree.op === "apply" || ("args" in tree && (tree.args as MathNode[]).some(usesFunctions));
const label = (name: string): string => (name === "y" ? "y" : `${name}(x)`);
const surfaceLabel = (name: string): string => (name === "z" ? "z" : `${name}(x, y)`);
export const mathDerivativeLabel = (name: string): string => (name === "y" ? "y'" : `${name}'(x)`);
const pointText = (value: MathBlockPoint): string => (typeof value === "string" ? value : formatMathNumber(value));

// "cos(t), sin(t)" → its two formulas, split at the one comma outside parentheses; null otherwise.
function splitPair(text: string): [string, string] | null {
  let depth = 0;
  const cuts: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") depth -= 1;
    else if (text[i] === "," && depth === 0) cuts.push(i);
    if (depth < 0) return null;
  }
  return cuts.length === 1 && depth === 0 ? [text.slice(0, cuts[0]).trim(), text.slice(cuts[0] + 1).trim()] : null;
}

// A bound or value may itself be a constant formula: -2*pi, pi/2, sqrt(2).
function constant(source: string, what: string): Value<number> {
  const parsed = parseMathExpression(source, []);
  if (!parsed.ok) return failure("number", `${what}: ${parsed.error.message}`);
  const value = evaluateMath(parsed.tree);
  if (!Number.isFinite(value) || Math.abs(value) > MATH_EXPRESSION_LIMITS.magnitude) return failure("number", `${what} must be a finite number`);
  return { ok: true, value };
}

function range(source: string, what: string): Value<[number, number]> {
  const match = RANGE.exec(String(source).trim());
  if (!match) return failure("range", `${what}: write the range as [min, max]`);
  const low = constant(match[1] ?? match[3], what), high = constant(match[2] ?? match[4], what);
  if (!low.ok) return low;
  if (!high.ok) return high;
  if (!(low.value < high.value)) return failure("range", `${what}: the minimum must be below the maximum`);
  return { ok: true, value: [low.value, high.value] };
}

/** A block's text read as AgentX reads it: the plot to draw, or the refusal of the whole block. */
export function parseMathBlock(body: unknown): MathBlock | MathFailure {
  const text = String(body ?? "");
  if (text.length > MATH_BLOCK_LIMITS.body) return failure("too_long", "The math block is too long");
  const lines = text.split("\n").map(line => line.trim().replace(/^`+|`+$/g, "").replace(/^[-*•]\s+/, "").replace(/[.;]\s*$/, "").trim())
    .filter(line => line && !/^```/.test(line));
  const windows: Partial<Record<"x" | "y" | "z" | "t", [number, number]>> = {};
  const parameters: MathBlockParameter[] = [], sources: { name: string; source: string }[] = [], derivativeLines: string[] = [];
  const tangentLines: { of: string | null; at: string }[] = [], areaLines: { of: string | null; from: string; to: string }[] = [];
  const curveLines: { name: string; x: string; y: string }[] = [], surfaceLines: { name: string; source: string }[] = [];
  const taken = (name: string): boolean => sources.some(row => row.name === name) || curveLines.some(row => row.name === name)
    || surfaceLines.some(row => row.name === name);
  const tooMany = (): MathFailure => (curveLines.length ? failure("functions", `At most ${MATH_BLOCK_LIMITS.functions} functions and curves per block`)
    : failure("functions", `At most ${MATH_BLOCK_LIMITS.functions} functions per block`));
  for (const line of lines) {
    let match: RegExpExecArray | null;
    if ((match = /^([xyzt])\s*(?:in\b|∈)\s*(.+)$/i.exec(line))) {
      const axis = match[1].toLowerCase() as "x" | "y" | "z" | "t";
      const window = range(match[2], `${axis} window`);
      if (!window.ok) return window;
      if (window.value[1] - window.value[0] < 1e-6) return failure("range", "The window is too narrow");
      windows[axis] = window.value;
    } else if ((match = CURVE_LINE.exec(normalizeMath(line)))) {
      const name = match[1].toLowerCase();
      if (["x", "y", "t", "e"].includes(name)) return failure("reserved", `"${name}" cannot name a curve; use c(t), d(t)…`);
      if (taken(name)) return failure("duplicate", `The name ${name} is used twice`);
      const pair = splitPair(match[2]);
      if (!pair) return failure("curve", `Write the curve as ${name}(t) = (x(t), y(t)): two formulas in t, separated by a comma, between parentheses`);
      curveLines.push({ name, x: pair[0], y: pair[1] });
      if (sources.length + curveLines.length > MATH_BLOCK_LIMITS.functions) return tooMany();
    } else if ((match = DERIVATIVE_LINE.exec(normalizeMath(line)))) {
      const name = match[1].toLowerCase();
      if (match[2]) return failure("derivative", `Write ${mathDerivativeLabel(name)} alone: Core computes the derivative from ${label(name)}`);
      derivativeLines.push(name);
    } else if ((match = TANGENT_LINE.exec(line))) {
      tangentLines.push({ of: match[1]?.toLowerCase() || null, at: match[2] });
      if (tangentLines.length > MATH_EXPRESSION_LIMITS.tangents) return failure("tangents", `At most ${MATH_EXPRESSION_LIMITS.tangents} tangents per block`);
    } else if ((match = AREA_LINE.exec(line))) {
      areaLines.push({ of: match[1]?.toLowerCase() || null, from: match[2], to: match[3] });
      if (areaLines.length > MATH_EXPRESSION_LIMITS.areas) return failure("areas", `At most ${MATH_EXPRESSION_LIMITS.areas} areas per block`);
    } else if ((match = FUNCTION_LINE.exec(line))) {
      const name = (match[1] || match[2]).toLowerCase();
      if (["x", "t", "e"].includes(name)) return failure("reserved", `"${name}" cannot name a function; use f(x), g(x)…`);
      if (sources.some(row => row.name === name)) return failure("duplicate", `Function ${name} is declared twice`);
      if (taken(name)) return failure("duplicate", `The name ${name} is used twice`);
      sources.push({ name, source: match[3] });
      if (sources.length + curveLines.length > MATH_BLOCK_LIMITS.functions) return tooMany();
    } else if ((match = /^([a-z])\s*=\s*(.+?)\s*(?:in|∈)?\s*(\[[^\]]*\]|\S+\s*\.\.\s*\S+)$/i.exec(line))) {
      const name = match[1].toLowerCase();
      if (RESERVED.has(name)) return failure("reserved", `"${name}" is reserved and cannot be a parameter`);
      if (parameters.some(row => row.name === name)) return failure("duplicate", `Parameter "${name}" is declared twice`);
      const value = constant(match[2], `Parameter ${name}`);
      if (!value.ok) return value;
      const bounds = range(match[3], `Parameter ${name}`);
      if (!bounds.ok) return bounds;
      if (value.value < bounds.value[0] || value.value > bounds.value[1]) return failure("range", `Parameter ${name} must lie inside its range`);
      parameters.push({ name, value: value.value, min: bounds.value[0], max: bounds.value[1] });
      if (parameters.length > MATH_EXPRESSION_LIMITS.parameters) return failure("parameters", `At most ${MATH_EXPRESSION_LIMITS.parameters} parameters`);
    } else if ((match = SURFACE_LINE.exec(line))) {
      const name = (match[1] || match[2]).toLowerCase();
      if (["x", "y", "t", "e"].includes(name)) return failure("reserved", `"${name}" cannot name a surface; use z = … or f(x, y) = …`);
      if (taken(name)) return failure("duplicate", `The name ${name} is used twice`);
      surfaceLines.push({ name, source: match[3] });
      if (surfaceLines.length > MATH_EXPRESSION_LIMITS.surfaces) return failure("surfaces", `At most ${MATH_EXPRESSION_LIMITS.surfaces} surfaces per block`);
    } else if ((match = /^([a-z])\s*=/i.exec(line))) {
      return failure("range", `Parameter ${match[1].toLowerCase()} needs a slider range, for example: ${match[1].toLowerCase()} = 1 in [-5, 5]`);
    } else return failure("line", `Unrecognised line "${line.slice(0, 60)}". Use y = …, a = 1 in [-5, 5], x in [-10, 10]`);
  }
  if (surfaceLines.length) {
    return surfaceBlock(surfaceLines, parameters, windows,
      Boolean(sources.length || curveLines.length || derivativeLines.length || tangentLines.length || areaLines.length));
  }
  if (windows.z) return failure("line", 'A "z in […]" window goes with a surface z = f(x, y)');
  if (windows.t && !curveLines.length) return failure("line", 'A "t in […]" range goes with a curve c(t) = (x(t), y(t))');
  if (!sources.length && !curveLines.length) return failure("no_function", "Write the function as y = …");
  const clash = [...sources, ...curveLines].find(row => parameters.some(parameter => parameter.name === row.name));
  if (clash) return failure("duplicate", `"${clash.name}" names both a function and a parameter`);
  const names = ["x", ...parameters.map(row => row.name)];
  const read = sources.length ? parseMathFunctions(sources, names) : { ok: true as const, functions: [] as MathFunctionTrees[] };
  if (!read.ok) {
    if (read.error.code === "unknown_name" && read.error.message.startsWith('Unknown name "y"') && sources.some(row => row.name === "y")) {
      return failure("unknown_name", "To use a function in another one, name it f(x), g(x)…; y cannot be called");
    }
    return sources.length > 1 ? failure(read.error.code, `${label(read.name)}: ${read.error.message}`) : failure(read.error.code, read.error.message);
  }
  const functions = read.functions.map(row => ({ name: row.name, label: label(row.name), expression: formatMath(row.tree) }));
  const trees = read.functions.map(row => row.expanded);
  // Curves: both coordinates in t and the parameters, and they may use the block's functions.
  const curveNames = ["t", ...parameters.map(row => row.name)], callable = sources.filter(row => row.name !== "y").map(row => row.name);
  const curves: { name: string; label: string; x: string; y: string }[] = [], curveTrees: { x: MathNode; y: MathNode }[] = [];
  for (const row of curveLines) {
    const pair: { tree: MathNode; expanded: MathNode }[] = [];
    for (const [axis, source] of [["x", row.x], ["y", row.y]] as const) {
      const parsed = parseMathExpression(source, curveNames, callable);
      if (!parsed.ok) {
        const message = parsed.error.code === "unknown_name" && /^Unknown name "x"/.test(parsed.error.message)
          ? "A curve is written in t: c(t) = (cos(t), sin(t))" : parsed.error.message;
        return failure(parsed.error.code, `${row.name}(t), ${axis}: ${message}`);
      }
      const expanded = expandMathCalls(parsed.tree, read.functions);
      if (!expanded.ok) return failure(expanded.error.code, `${row.name}(t): ${expanded.error.message}`);
      pair.push({ tree: parsed.tree, expanded: expanded.tree });
    }
    curves.push({ name: row.name, label: `${row.name}(t)`, x: formatMath(pair[0].tree), y: formatMath(pair[1].tree) });
    curveTrees.push({ x: pair[0].expanded, y: pair[1].expanded });
  }
  // With functions, x keeps its default window; curves alone are framed around themselves.
  const xWindow = windows.x || null, yWindow = windows.y || null;
  const x: [number, number] | null = xWindow || (sources.length ? [DEFAULT_X[0], DEFAULT_X[1]] : null);

  // Derivatives, tangents and areas name a function of the block; their points lie in the window.
  const which = (name: string | null, what: string): Value<string> => {
    if (name && curveLines.some(row => row.name === name)) return failure("line", `${what}: works on functions of x, not on the curve ${name}(t)`);
    if (name) return sources.some(row => row.name === name) ? { ok: true, value: name } : failure("unknown_name", `${what}: no function named ${name} in this block`);
    return sources.length === 1 ? { ok: true, value: sources[0].name } : failure("line", `${what}: name the function, for example: ${what.toLowerCase()} f …`);
  };
  const point = (source: string, what: string): Value<MathBlockPoint> => {
    const name = String(source).trim().toLowerCase();
    const parameter = /^[a-z]$/.test(name) ? parameters.find(row => row.name === name) : null;
    const value: Value<MathBlockPoint> = parameter ? { ok: true, value: name } : constant(source, what);
    if (!value.ok) return value;
    // As in AgentX: without functions there is no x window and these lines were refused above.
    const [low, high] = parameter ? [parameter.min, parameter.max] : [value.value as number, value.value as number];
    if (!x || low < x[0] || high > x[1]) {
      const [x0, x1] = x ?? [NaN, NaN];
      return failure("range", parameter ? `${what}: ${name} must stay inside the x window [${formatMathNumber(x0)}, ${formatMathNumber(x1)}]; give it a range inside it`
        : `${what} must lie inside the x window [${formatMathNumber(x0)}, ${formatMathNumber(x1)}]`);
    }
    return value;
  };
  const derivatives: string[] = [];
  for (const name of derivativeLines) {
    const target = which(name, "Derivative");
    if (!target.ok) return target;
    if (derivatives.includes(target.value)) return failure("duplicate", `The derivative of ${label(target.value)} is asked twice`);
    derivatives.push(target.value);
  }
  const tangents: { of: string; at: MathBlockPoint }[] = [];
  for (const row of tangentLines) {
    const target = which(row.of, "Tangent");
    if (!target.ok) return target;
    const at = point(row.at, "Tangent point");
    if (!at.ok) return at;
    if (tangents.some(other => other.of === target.value && other.at === at.value)) return failure("duplicate", "The same tangent is asked twice");
    tangents.push({ of: target.value, at: at.value });
  }
  const areas: { of: string; from: MathBlockPoint; to: MathBlockPoint }[] = [];
  for (const row of areaLines) {
    const target = which(row.of, "Area");
    if (!target.ok) return target;
    const from = point(row.from, "Area start"), to = point(row.to, "Area end");
    if (!from.ok) return from;
    if (!to.ok) return to;
    areas.push({ of: target.value, from: from.value, to: to.value });
  }
  const slopes: Record<string, MathNode> = {};
  for (const name of new Set([...derivatives, ...tangents.map(row => row.of)])) {
    const tree = deriveMath(trees[functions.findIndex(fn => fn.name === name)]);
    if (mathWeight(tree) > MATH_EXPRESSION_LIMITS.derivative) return failure("too_complex", `The derivative of ${label(name)} is too large to draw`);
    slopes[name] = tree;
  }
  const plot: MathBlockFunctionsPlot = { schema: MATH_BLOCK_SCHEMA, kind: "functions", variable: "x", functions, parameters,
    ...(x ? { x } : {}), ...(yWindow ? { y: yWindow } : {}),
    ...(derivatives.length ? { derivatives } : {}), ...(tangents.length ? { tangents } : {}), ...(areas.length ? { areas } : {}),
    ...(curves.length ? { curves, t: windows.t || [DEFAULT_T[0], DEFAULT_T[1]] } : {}) };
  return { ok: true, plot, trees, slopes, curveTrees, references: read.functions.some(row => usesFunctions(row.tree)), text: mathBlockText(plot) };
}

// A surface block: surfaces z = f(x, y) over the ground window, and parameters; nothing else.
function surfaceBlock(rows: { name: string; source: string }[], parameters: MathBlockParameter[],
  windows: Partial<Record<"x" | "y" | "z" | "t", [number, number]>>, mixed: boolean): MathBlock | MathFailure {
  if (mixed) return failure("surface", "A surface block holds only surfaces z = f(x, y), parameters and the x, y, z windows; draw curves in another block");
  if (windows.t) return failure("line", 'A "t in […]" range goes with a curve c(t) = (x(t), y(t))');
  const clash = rows.find(row => parameters.some(parameter => parameter.name === row.name));
  if (clash) return failure("duplicate", `"${clash.name}" names both a surface and a parameter`);
  if (parameters.some(row => row.name === "z")) return failure("reserved", '"z" is the height in a surface block and cannot be a parameter');
  const names = ["x", "y", ...parameters.map(row => row.name)];
  const surfaces: { name: string; label: string; expression: string }[] = [], trees: MathNode[] = [];
  for (const row of rows) {
    const parsed = parseMathExpression(row.source, names);
    if (!parsed.ok) return failure(parsed.error.code, rows.length > 1 ? `${surfaceLabel(row.name)}: ${parsed.error.message}` : parsed.error.message);
    surfaces.push({ name: row.name, label: surfaceLabel(row.name), expression: formatMath(parsed.tree) });
    trees.push(parsed.tree);
  }
  const ground = windows.x || DEFAULT_SURFACE, side = windows.y || DEFAULT_SURFACE;
  const plot: MathBlockSurfacesPlot = { schema: MATH_BLOCK_SCHEMA, kind: "surfaces", surfaces, parameters,
    x: [ground[0], ground[1]], y: [side[0], side[1]], ...(windows.z ? { z: windows.z } : {}) };
  return { ok: true, plot, trees, slopes: {}, curveTrees: [], references: false, text: mathBlockText(plot) };
}

/** The canonical body for a plot, with `values` replacing the parameters' current values. */
export function mathBlockText(plot: MathBlockPlot, values: Readonly<Record<string, number>> = {}): string {
  const window = (axis: string, value: readonly [number, number]): string => `${axis} in [${formatMathNumber(value[0])}, ${formatMathNumber(value[1])}]`;
  const lines = plot.kind === "surfaces" ? plot.surfaces.map(row => `${row.label} = ${row.expression}`)
    : [...plot.functions.map(fn => `${fn.label} = ${fn.expression}`), ...(plot.curves || []).map(row => `${row.label} = (${row.x}, ${row.y})`)];
  if (plot.kind === "functions") {
    for (const name of plot.derivatives || []) lines.push(mathDerivativeLabel(name));
    for (const row of plot.tangents || []) lines.push(`tangent ${row.of} at ${pointText(row.at)}`);
    for (const row of plot.areas || []) lines.push(`area ${row.of} from ${pointText(row.from)} to ${pointText(row.to)}`);
  }
  for (const row of plot.parameters) {
    const value = Number.isFinite(values[row.name]) ? values[row.name] : row.value;
    lines.push(`${row.name} = ${formatMathNumber(value)} in [${formatMathNumber(row.min)}, ${formatMathNumber(row.max)}]`);
  }
  if (plot.kind === "functions" && plot.t) lines.push(window("t", plot.t));
  if (plot.x) lines.push(window("x", plot.x));
  if (plot.y) lines.push(window("y", plot.y));
  if (plot.kind === "surfaces" && plot.z) lines.push(window("z", plot.z));
  return lines.join("\n");
}

/**
 * The oldest `<llmx-stage>` contract that draws a block, as AgentX's card picks it: v4 for
 * surfaces and parametric curves, v3 for derivatives, tangents, areas and functions using one
 * another, v2 for plain functions.
 */
export function mathBlockSchema(block: MathBlock): "agentx.math-scene.v2" | "agentx.math-scene.v3" | "agentx.math-scene.v4" {
  const { plot } = block;
  if (plot.kind === "surfaces" || plot.curves?.length) return "agentx.math-scene.v4";
  return block.references || plot.derivatives?.length || plot.tangents?.length || plot.areas?.length ? "agentx.math-scene.v3" : "agentx.math-scene.v2";
}

/**
 * The scene `<llmx-stage>` draws for a block with `values` on its sliders: formulas, names and
 * windows only (the stage computes every point itself), with the same colours as AgentX's card.
 */
export function mathBlockScene(block: MathBlock, values: Readonly<Record<string, number>> = {}): Record<string, unknown> {
  const { plot } = block, schema = mathBlockSchema(block);
  const parameters = plot.parameters.map(row => ({ ...row, value: Number.isFinite(values[row.name]) ? values[row.name] : row.value }));
  if (plot.kind === "surfaces") {
    return { schema, kind: "surfaces", parameters, x: [...plot.x], y: [...plot.y], ...(plot.z ? { z: [...plot.z] } : {}),
      surfaces: plot.surfaces.map((row, index) => ({ name: row.name, label: row.label, expression: row.expression, color: MATH_BLOCK_COLORS[index] })) };
  }
  const curves = plot.curves || [], offset = plot.functions.length;
  return { schema, kind: "functions", x: plot.x ? [...plot.x] : null, ...(plot.y ? { y: [...plot.y] } : {}),
    functions: plot.functions.map((fn, index) => ({ name: fn.name, label: fn.label, expression: fn.expression, color: MATH_BLOCK_COLORS[index] })),
    parameters,
    ...(schema !== "agentx.math-scene.v2" ? { derivatives: [...(plot.derivatives || [])], tangents: (plot.tangents || []).map(row => ({ ...row })),
      areas: (plot.areas || []).map(row => ({ ...row })) } : {}),
    ...(curves.length ? { curves: curves.map((row, index) => ({ name: row.name, label: row.label, x: row.x, y: row.y, color: MATH_BLOCK_COLORS[offset + index] })),
      t: [...plot.t!] } : {}) };
}

/** A round slider step (1, 2 or 5 times a power of ten) giving at least 100 positions, as AgentX's card. */
export function mathSliderStep(span: number): number {
  const raw = span / 100, power = Math.pow(10, Math.floor(Math.log10(raw))), unit = raw / power;
  return Number(((unit >= 5 ? 5 : unit >= 2 ? 2 : 1) * power).toPrecision(6));
}

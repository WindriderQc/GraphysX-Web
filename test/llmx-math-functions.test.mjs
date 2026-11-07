import assert from "node:assert/strict";
import test from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const {
  MATH_BOARD, MATH_FIELD, MATH_FUNCTION_PALETTE, MATH_LABEL_GAP, MATH_ORBIT_DEFAULT, MATH_SURFACE_MOLECULES, MATH_SURFACE_ORBIT, clampOrbit,
  describeMathScene, mathFitDistance, mathSurfaceFrame, mathSurfaceLayout,
  mathLayout, orbitPosition, readParameterValues, readStageScene,
} = await importBrowserModule(new URL("../src/llmx-math-functions.ts", import.meta.url));

const V2 = "agentx.math-scene.v2";
const compare = {
  schema: V2, kind: "functions",
  functions: [{ name: "f", expression: "x^2" }, { name: "g", expression: "a*x + 1", label: "droite", color: "#FF8800" }],
  parameters: [{ name: "a", value: 2, min: -3, max: 3 }],
  x: [-3, 3],
};

test("v1 cubes keep working, under v1 or v2", () => {
  const v1 = readStageScene({ schema: "agentx.math-scene.v1", kind: "add", a: 8, b: 5 });
  assert.deepEqual(v1, { ok: true, type: "cubes", scene: { kind: "add", a: 8, b: 5 } });
  assert.deepEqual(readStageScene({ kind: "count", to: 7 }), { ok: true, type: "cubes", scene: { kind: "count", to: 7 } });
  assert.equal(readStageScene({ schema: V2, kind: "count", to: 12 }).type, "cubes");
  assert.equal(readStageScene({ schema: V2, kind: "count", to: 101 }).reason, "out-of-bounds", "refused, not clamped");
});

test("a comparison of two functions is accepted with labels, colours and parameters", () => {
  const read = readStageScene(compare);
  assert.equal(read.ok, true, read.message);
  const [f, g] = read.scene.functions;
  assert.deepEqual([f.name, f.label, f.color], ["f", "f(x)", MATH_FUNCTION_PALETTE[0]]);
  assert.deepEqual([g.name, g.label, g.color], ["g", "droite", "#ff8800"]);
  assert.deepEqual(read.scene.parameters, [{ name: "a", value: 2, min: -3, max: 3 }]);
  assert.equal(read.scene.y, null);
  assert.equal(readStageScene({ ...compare, functions: [{ name: "y", expression: "sin(x)" }] }).scene.functions[0].label, "y");
});

test("anything outside the contract is refused whole, never clamped", () => {
  const bad = {
    "v1 schema for functions": { ...compare, schema: "agentx.math-scene.v1" },
    "unknown schema": { ...compare, schema: "agentx.math-scene.v5" },
    "no functions": { ...compare, functions: [] },
    "five functions": { ...compare, functions: "fghkp".split("").map(name => ({ name, expression: "x" })) },
    "formula outside the grammar": { ...compare, functions: [{ name: "f", expression: "window.alert(x)" }] },
    "undeclared parameter": { ...compare, functions: [{ name: "f", expression: "b*x" }] },
    "function named x": { ...compare, functions: [{ name: "x", expression: "x" }] },
    "two-letter name": { ...compare, functions: [{ name: "fg", expression: "x" }] },
    "duplicate function": { ...compare, functions: [{ name: "f", expression: "x" }, { name: "f", expression: "x^2" }] },
    "function named like a parameter": { ...compare, functions: [{ name: "a", expression: "x" }] },
    "bad colour": { ...compare, functions: [{ name: "f", expression: "x", color: "red" }] },
    "long label": { ...compare, functions: [{ name: "f", expression: "x", label: "l".repeat(49) }] },
    "control character in label": { ...compare, functions: [{ name: "f", expression: "x", label: "a\nb" }] },
    "value outside range": { ...compare, parameters: [{ name: "a", value: 4, min: -3, max: 3 }] },
    "reversed range": { ...compare, parameters: [{ name: "a", value: 0, min: 3, max: -3 }] },
    "reserved parameter": { ...compare, parameters: [{ name: "t", value: 0, min: -1, max: 1 }] },
    "duplicate parameter": { ...compare, parameters: [{ name: "a", value: 0, min: -1, max: 1 }, { name: "a", value: 0, min: -1, max: 1 }] },
    "seven parameters": { ...compare, parameters: "abcdfgh".split("").map(name => ({ name, value: 0, min: -1, max: 1 })) },
    "infinite window": { ...compare, x: [-Infinity, 3] },
    "huge window": { ...compare, x: [-1e7, 3] },
    "empty window": { ...compare, x: [2, 2] },
    "bad y window": { ...compare, y: [1, 0] },
    "string window": { ...compare, x: "[-3, 3]" },
  };
  for (const [label, value] of Object.entries(bad)) assert.equal(readStageScene(value).ok, false, label);
  assert.equal(readStageScene(null).ok, false);
  assert.equal(readStageScene([compare]).ok, false);
});

test("live parameter values must be declared and inside their range", () => {
  const { scene } = readStageScene(compare);
  assert.deepEqual(readParameterValues(scene, { a: -1.5 }), { a: -1.5 });
  assert.deepEqual(readParameterValues(scene, {}), { a: 2 });
  for (const value of [{ a: 3.01 }, { b: 1 }, { a: Number.NaN }, { a: "1" }, null, [1]]) assert.equal(readParameterValues(scene, value), null, JSON.stringify(value));
});

test("the layout computes every height from the formula and keeps the y window shared by all curves", () => {
  const { scene } = readStageScene({ ...compare, y: [-2, 10] });
  const layout = mathLayout(scene, { a: 2 });
  assert.deepEqual(layout.y, [-2, 10]);
  const { width: W, height: H, depth: D } = MATH_BOARD;
  // x = 3 maps to the board's right edge; f(3) = 9 sits at 11/12 of its height.
  const fRight = layout.molecules.filter(m => m.fn === 0 && m.position).at(-1).position;
  assert.ok(Math.abs(fRight[0] - W / 2) < 1e-9);
  assert.ok(Math.abs(fRight[1] - (-H / 2 + H * 11 / 12)) < 1e-9);
  // Lanes alternate between the functions so both stay visible where they cross.
  assert.equal(layout.molecules.length, (MATH_FIELD.columns + 1) * MATH_FIELD.lanes);
  assert.deepEqual([...new Set(layout.molecules.filter(m => m.lane < 4).map(m => m.fn))], [0, 1]);
  for (const m of layout.molecules) if (m.position) assert.ok(Math.abs(m.position[2]) <= D / 2);
  // Moving a parameter moves only the function that uses it.
  const moved = mathLayout(scene, { a: -1 });
  assert.deepEqual(moved.curves[0], layout.curves[0]);
  assert.notDeepEqual(moved.curves[1], layout.curves[1]);
  assert.match(describeMathScene(scene, { a: -1 }), /^f\(x\) = x\^2; droite = a\*x \+ 1, a = -1, x in \[-3, 3\]$/);
});

test("curves break at asymptotes and stop at the window, never drawing a wrong point", () => {
  const { scene } = readStageScene({ schema: V2, kind: "functions", functions: [{ name: "f", expression: "1/x" }], x: [-2, 2], y: [-4, 4] });
  const layout = mathLayout(scene);
  const { width: W, height: H } = MATH_BOARD;
  assert.ok(layout.curves[0].length >= 2, "two branches");
  for (const line of layout.curves[0]) for (const [x, y] of line) {
    assert.ok(y >= -H / 2 - 1e-9 && y <= H / 2 + 1e-9, "inside the board");
    assert.ok(x >= -W / 2 - 1e-9 && x <= W / 2 + 1e-9);
  }
  // No segment crosses the asymptote at x = 0.
  for (const line of layout.curves[0]) assert.ok(line.every(p => p[0] < 0) || line.every(p => p[0] > 0));
  // A molecule is hidden where f is outside the window, never pinned to its edge.
  const near = layout.molecules.filter(m => m.position && Math.abs(m.position[0]) < 0.1);
  assert.equal(near.length, 0);
  const { scene: root } = readStageScene({ schema: V2, kind: "functions", functions: [{ name: "f", expression: "sqrt(x)" }], x: [-4, 4] });
  assert.ok(mathLayout(root).molecules.filter(m => m.position).every(m => m.position[0] >= -1e-9), "undefined stays empty");
});

test("function names ending at the same point are stacked, not drawn over each other", () => {
  const { scene } = readStageScene({ schema: V2, kind: "functions", x: [-Math.PI, Math.PI],
    functions: [{ name: "f", expression: "sin(x)" }, { name: "g", expression: "sin(2x)" }, { name: "h", expression: "sin(3x)" }] });
  const ys = mathLayout(scene).labelAt.map(point => point[1]).sort((a, b) => a - b);
  assert.ok(ys[1] - ys[0] >= MATH_LABEL_GAP - 1e-9 && ys[2] - ys[1] >= MATH_LABEL_GAP - 1e-9, JSON.stringify(ys));
});

test("ticks and axes follow the windows", () => {
  const { scene } = readStageScene({ schema: V2, kind: "functions", functions: [{ name: "f", expression: "x + 20" }], x: [1, 5], y: [10, 30] });
  const layout = mathLayout(scene);
  assert.equal(layout.axisX, -MATH_BOARD.width / 2, "zero out of view: the y axis sits on the edge");
  assert.equal(layout.axisY, -MATH_BOARD.height / 2);
  assert.deepEqual(layout.xTicks.map(t => t.text), ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"]);
  assert.ok(layout.yTicks.length >= 4 && layout.yTicks.length <= 12);
});

test("the camera fits the whole board at any aspect and orbit, and the orbit is bounded", () => {
  const near = mathFitDistance(MATH_ORBIT_DEFAULT, 16 / 9, 35), tall = mathFitDistance(MATH_ORBIT_DEFAULT, 0.75, 35);
  assert.ok(near > 3 && near < 12, String(near));
  assert.ok(tall > near, "a narrow element stands the camera further back");
  const tan = Math.tan(35 * Math.PI / 360);
  for (const orbit of [MATH_ORBIT_DEFAULT, { yaw: 1.2, pitch: 1 }, { yaw: -1.2, pitch: -0.15 }]) {
    const distance = mathFitDistance(orbit, 1.3, 35), [cx, cy, cz] = orbitPosition(orbit, distance);
    // The board's front corners project inside the view.
    const forward = [-cx / distance, -cy / distance, -cz / distance];
    const right = [Math.cos(orbit.yaw), 0, -Math.sin(orbit.yaw)];
    const up = [forward[1] * right[2] - forward[2] * right[1], forward[2] * right[0] - forward[0] * right[2], forward[0] * right[1] - forward[1] * right[0]];
    for (const corner of [[-2, -1.2, 0.45], [2, 1.2, 0.45], [2, -1.2, -0.45], [-2, 1.2, -0.45]]) {
      const v = corner.map((c, i) => c - [cx, cy, cz][i]);
      const depth = v[0] * forward[0] + v[1] * forward[1] + v[2] * forward[2];
      const sx = (v[0] * right[0] + v[2] * right[2]) / depth, sy = Math.abs(v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / depth;
      assert.ok(Math.abs(sx) <= tan * 1.3 + 1e-9 && sy <= tan + 1e-9, `${JSON.stringify(orbit)} ${corner}`);
    }
  }
  assert.deepEqual(clampOrbit({ yaw: 5, pitch: -5 }), { yaw: 1.2, pitch: -0.15 });
});

// Phase 3 (agentx.math-scene.v3): derivatives, tangents, areas and functions using functions.
const V3 = "agentx.math-scene.v3";
const calculus = {
  schema: V3, kind: "functions",
  functions: [{ name: "f", expression: "x^2" }, { name: "g", expression: "f(x - 1) + 1" }],
  parameters: [{ name: "p", value: 1, min: -2, max: 2 }, { name: "b", value: 2, min: 0, max: 3 }],
  x: [-3, 3], y: [-4, 10],
  derivatives: ["f"],
  tangents: [{ of: "f", at: "p" }],
  areas: [{ of: "f", from: 0, to: "b" }],
};
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} vs ${expected}`);

test("v3 draws derivatives, tangents and areas computed from the formulas; v2 keeps refusing them", () => {
  const read = readStageScene(calculus);
  assert.equal(read.ok, true, read.message);
  const { scene } = read;
  assert.equal(scene.schema, V3);
  assert.deepEqual(scene.derivatives.map(row => [row.of, row.label, row.expression]), [["f", "f'(x)", "2 * x"]]);
  assert.deepEqual(scene.tangents.map(row => [row.of, row.at]), [["f", "p"]]);
  assert.deepEqual(scene.areas.map(row => [row.of, row.from, row.to]), [["f", 0, "b"]]);
  assert.equal(scene.functions[1].expression, "f(x - 1) + 1", "the host's text is kept for display");
  for (const extra of [{ derivatives: ["f"] }, { tangents: [{ of: "f", at: 1 }] }, { areas: [{ of: "f", from: 0, to: 1 }] }]) {
    assert.equal(readStageScene({ ...compare, ...extra }).reason, "schema", JSON.stringify(extra));
  }
  assert.equal(readStageScene({ ...compare, functions: [{ name: "f", expression: "x" }, { name: "g", expression: "f(x) + 1" }] }).reason, "formula",
    "v2 functions stand alone");
  assert.equal(readStageScene({ ...compare, schema: V2 }).scene.schema, V2);
});

test("v3 refuses whole what it cannot draw exactly", () => {
  const plain = { derivatives: [], tangents: [], areas: [] };
  const bad = {
    "derivative of an unknown function": [{ derivatives: ["h"] }, "derivatives"],
    "derivative asked twice": [{ derivatives: ["f", "f"] }, "derivatives"],
    "derivatives not a list": [{ derivatives: "f" }, "derivatives"],
    "tangent outside the window": [{ tangents: [{ of: "f", at: 4 }] }, "tangents"],
    "tangent slider wider than the window": [{ parameters: [{ name: "p", value: 0, min: -5, max: 5 }, calculus.parameters[1]] }, "tangents"],
    "tangent at an undeclared name": [{ tangents: [{ of: "f", at: "q" }] }, "tangents"],
    "tangent at a text number": [{ tangents: [{ of: "f", at: "1" }] }, "tangents"],
    "tangent asked twice": [{ tangents: [{ of: "f", at: "p" }, { of: "f", at: "p" }] }, "tangents"],
    "five tangents": [{ tangents: [-2, -1, 0, 1, 2].map(at => ({ of: "f", at })) }, "tangents"],
    "area of an unknown function": [{ areas: [{ of: "h", from: 0, to: 1 }] }, "areas"],
    "area bound outside the window": [{ areas: [{ of: "f", from: 0, to: 7 }] }, "areas"],
    "area bound missing": [{ areas: [{ of: "f", from: 0 }] }, "areas"],
    "functions in a circle": [{ functions: [{ name: "f", expression: "g(x)" }, { name: "g", expression: "f(x) + 1" }] }, "formula"],
    "a function using itself": [{ ...plain, functions: [{ name: "f", expression: "f(x - 1)" }] }, "formula"],
    "y cannot be called": [{ ...plain, functions: [{ name: "y", expression: "x" }, { name: "g", expression: "y(x)" }] }, "formula"],
  };
  for (const [label, [change, reason]] of Object.entries(bad)) assert.equal(readStageScene({ ...calculus, ...change }).reason, reason, label);
});

test("the tangent touches the curve at the slider's point with the derivative's slope, and follows the slider", () => {
  const { scene } = readStageScene(calculus);
  const { width: W, height: H } = MATH_BOARD;
  const px = x => (x + 3) / 6 * W - W / 2, py = y => (y + 4) / 14 * H - H / 2;
  const layout = mathLayout(scene);
  const [tangent] = layout.tangents;
  assert.deepEqual([tangent.x, tangent.y, tangent.slope], [1, 1, 2]);
  near(tangent.point[0], px(1), "point x");
  near(tangent.point[1], py(1), "point y");
  // y = 2x - 1 across the window, clipped to [-4, 10]: from (-1.5, -4) to (3, 5).
  near(tangent.segment[0][0], px(-1.5), "segment start x");
  near(tangent.segment[0][1], py(-4), "segment start y");
  near(tangent.segment[1][0], px(3), "segment end x");
  near(tangent.segment[1][1], py(5), "segment end y");
  const moved = mathLayout(scene, { p: -2, b: 2 }).tangents[0];
  assert.deepEqual([moved.x, moved.y, moved.slope], [-2, 4, -4]);
  // The derivative curve is 2x: below the window until x = -2, where it enters at the bottom edge.
  const first = layout.derivativeCurves[0][0][0];
  near(first[0], px(-2), "f' enters the window at x = -2");
  near(first[1], py(-4), "f' enters at the bottom edge");
  assert.ok(layout.derivativeLabelAt[0], "f'(x) is labelled");
  assert.match(describeMathScene(scene), /f'\(x\) = 2 \* x; tangent f at p; area f from 0 to b/);
});

test("the area is the signed integral of the formula between the bounds, shaded down to the axis", () => {
  const { scene } = readStageScene(calculus);
  const { height: H } = MATH_BOARD;
  const py = y => (y + 4) / 14 * H - H / 2;
  const [area] = mathLayout(scene).areas;
  assert.deepEqual([area.from, area.to], [0, 2]);
  near(area.value, 8 / 3, "x^2 from 0 to 2");
  assert.equal(area.bands.length, 1);
  for (const [, top, bottom] of area.bands[0]) { near(bottom, py(0), "down to the axis"); assert.ok(top >= bottom - 1e-12); }
  near(mathLayout(scene, { p: 1, b: 0 }).areas[0].value, 0, "empty when the bounds meet");
  const plain = { derivatives: [], tangents: [] };
  const signed = readStageScene({ ...calculus, ...plain, functions: [{ name: "f", expression: "-x" }], areas: [{ of: "f", from: 0, to: 2 }] });
  near(mathLayout(signed.scene).areas[0].value, -2, "negative under the axis");
  const hole = readStageScene({ ...calculus, derivatives: [], functions: [{ name: "f", expression: "1/x" }], tangents: [{ of: "f", at: 0 }],
    areas: [{ of: "f", from: -1, to: 1 }] });
  const holed = mathLayout(hole.scene);
  assert.equal(holed.areas[0].value, null, "undefined across x = 0: no number");
  assert.equal(holed.areas[0].bands.length, 2, "shaded on each side of the hole");
  assert.deepEqual([holed.tangents[0].y, holed.tangents[0].slope, holed.tangents[0].segment], [null, null, null], "no tangent where undefined");
});

test("a function using another is drawn from the substituted formula", () => {
  const { scene } = readStageScene(calculus);
  const layout = mathLayout(scene);
  // g(x) = (x - 1)^2 + 1 is lowest at x = 1, where it is 1.
  const g = layout.molecules.filter(m => m.fn === 1 && m.lane === 1 && m.position);
  const lowest = g.reduce((best, m) => (m.position[1] < best.position[1] ? m : best));
  const { width: W, height: H } = MATH_BOARD;
  near(lowest.position[0], (1 + 3) / 6 * W - W / 2, "vertex x");
  near(lowest.position[1], (1 + 4) / 14 * H - H / 2, "vertex y");
  const derived = readStageScene({ ...calculus, functions: [{ name: "f", expression: "x^3" }, { name: "g", expression: "f'(x)" }],
    derivatives: [], tangents: [], areas: [] });
  assert.equal(derived.ok, true, derived.message);
  // g = f' = 3x^2: at x = 1 it is 3.
  assert.equal(mathLayout(derived.scene).areas.length, 0);
  assert.equal(mathLayout({ ...derived.scene, tangents: [{ of: "g", fn: 1, at: 1, slope: derived.scene.functions[1].tree }] }).tangents[0].y, 3);
});

// ---------------------------------------------------------------------------------------------
// v4: parametric curves beside the functions, and surfaces z = f(x, y).
const V4 = "agentx.math-scene.v4";
const circle = {
  schema: V4, kind: "functions", functions: [],
  curves: [{ name: "c", x: "r*cos(t)", y: "r*sin(t)" }],
  parameters: [{ name: "r", value: 2, min: 0.5, max: 3 }],
  x: null, t: [0, 2 * Math.PI],
};
const saddle = {
  schema: V4, kind: "surfaces",
  surfaces: [{ name: "z", expression: "x^2 - y^2" }],
  parameters: [], x: [-2, 2], y: [-2, 2],
};

test("v4 draws a parametric curve from its formulas, framed round when nothing fixes the window", () => {
  const read = readStageScene(circle);
  assert.equal(read.ok, true, read.message);
  assert.deepEqual([read.scene.curves[0].label, read.scene.curves[0].color, read.scene.x], ["c(t)", MATH_FUNCTION_PALETTE[0], null]);
  const layout = mathLayout(read.scene);
  // Equal units on the board: the window's width over its height is the board's.
  near((layout.x[1] - layout.x[0]) / (layout.y[1] - layout.y[0]), MATH_BOARD.width / MATH_BOARD.height, "a circle stays round");
  assert.ok(layout.y[0] < -2 && layout.y[1] > 2, "the whole circle is in view");
  const { width: W, height: H } = MATH_BOARD;
  const back = (p) => [(p[0] + W / 2) / W * (layout.x[1] - layout.x[0]) + layout.x[0], (p[1] + H / 2) / H * (layout.y[1] - layout.y[0]) + layout.y[0]];
  for (const line of layout.curveLines[0]) for (const point of line) near(Math.hypot(...back(point)), 2, "every drawn point is on the circle");
  assert.ok(layout.curveLabelAt[0], "c(t) is labelled");
  assert.ok(layout.molecules.some(m => m.position), "molecules ride the curve");
  const grown = mathLayout(read.scene, { r: 3 });
  assert.ok(grown.y[1] > 3, "the frame follows the slider");
  assert.match(describeMathScene(read.scene), /^c\(t\) = \(r\*cos\(t\), r\*sin\(t\)\), r = 2, t in \[0, 6\.283185307\]$/);
});

test("a curve may use the scene's functions and share their window", () => {
  const read = readStageScene({ ...circle, functions: [{ name: "f", expression: "x^2" }], curves: [{ name: "c", x: "t", y: "f(t) + 1" }],
    parameters: [], x: [-3, 3], t: [-2, 2] });
  assert.equal(read.ok, true, read.message);
  assert.equal(read.scene.curves[0].color, MATH_FUNCTION_PALETTE[1], "colours follow the functions'");
  const layout = mathLayout(read.scene);
  assert.ok(layout.y[1] >= 5, "y fits the curve too");
  const { width: W, height: H } = MATH_BOARD;
  const top = layout.curveLines[0].flat().reduce((a, b) => (b[1] > a[1] ? b : a));
  near((top[1] + H / 2) / H * (layout.y[1] - layout.y[0]) + layout.y[0], 5, "c(2) = (2, f(2) + 1) = (2, 5)");
  near(Math.abs((top[0] + W / 2) / W * 6 - 3), 2, "at x = ±2");
});

test("v4 curves refuse whole what they cannot draw exactly; older schemas refuse curves", () => {
  const bad = {
    "curves under v3": [{ schema: "agentx.math-scene.v3" }, "schema"],
    "curve in x": [{ curves: [{ name: "c", x: "cos(x)", y: "t" }] }, "formula"],
    "curve named t": [{ curves: [{ name: "t", x: "t", y: "t" }] }, "curves"],
    "curve named like a parameter": [{ curves: [{ name: "r", x: "t", y: "t" }] }, "curves"],
    "missing t range": [{ t: undefined }, "window"],
    "empty t range": [{ t: [1, 1] }, "window"],
    "missing x without null": [{ x: undefined }, "window"],
    "five curves": [{ curves: "cdghk".split("").map(name => ({ name, x: "t", y: "t" })) }, "functions"],
    "unknown function": [{ curves: [{ name: "c", x: "t", y: "g(t)" }] }, "formula"],
  };
  for (const [label, [change, reason]] of Object.entries(bad)) assert.equal(readStageScene({ ...circle, ...change }).reason, reason, label);
  assert.equal(readStageScene({ ...circle, functions: [{ name: "f", expression: "x" }] }).reason, "window", "functions need their x window");
  assert.equal(readStageScene({ ...compare, schema: V4, t: [0, 1] }).reason, "window", "a t range goes with curves");
});

test("v4 surfaces are drawn on a grid computed from the formula, in a box with equal ground units", () => {
  const read = readStageScene(saddle);
  assert.equal(read.ok, true, read.message);
  assert.deepEqual([read.type, read.scene.surfaces[0].label, read.scene.z], ["surfaces", "z", null]);
  const layout = mathSurfaceLayout(read.scene);
  assert.equal(layout.box.width, layout.box.depth, "a square window gets a square floor");
  assert.ok(layout.z[0] < -4 && layout.z[1] > 4, "z fits the heights, peaks included");
  const n = layout.grid, row = n + 1, grid = layout.grids[0];
  assert.equal(grid.length, row * row);
  const { width: W, height: Hb, depth: D } = layout.box;
  // Grid point (i, j) is at x = -2 + 4i/n, y = -2 + 4j/n; its height reads back to x² - y².
  for (const [i, j] of [[0, 0], [n, 0], [n / 2, n / 2], [n / 4, 3 * n / 4]]) {
    const point = grid[j * row + i], x = -2 + 4 * i / n, y = -2 + 4 * j / n;
    near(point[0], (x + 2) / 4 * W - W / 2, `x at ${i},${j}`);
    near(point[2], D / 2 - (y + 2) / 4 * D, `y goes away from the viewer at ${i},${j}`);
    near((point[1] + Hb / 2) / Hb * (layout.z[1] - layout.z[0]) + layout.z[0], x * x - y * y, `height at ${i},${j}`);
  }
  assert.equal(layout.molecules.length, MATH_SURFACE_MOLECULES ** 2);
  assert.deepEqual(layout.origin, [0, (0 - layout.z[0]) / (layout.z[1] - layout.z[0]) * Hb - Hb / 2, 0], "axes through zero");
  assert.match(describeMathScene(read.scene), /^z = x\^2 - y\^2, x in \[-2, 2\], y in \[-2, 2\]$/);
});

test("a fixed z window leaves holes rather than flattening the surface, and a wide window keeps equal units", () => {
  const read = readStageScene({ ...saddle, z: [-1, 1] });
  const grid = mathSurfaceLayout(read.scene).grids[0], row = mathSurfaceLayout(read.scene).grid + 1;
  assert.notEqual(grid[0], null, "z(-2, -2) = 0 is inside the window and drawn");
  assert.equal(grid[Math.floor(row / 2) * row], null, "z(-2, 0) = 4 is above the window: a hole, not a plateau");
  const wide = mathSurfaceLayout(readStageScene({ ...saddle, x: [-4, 4] }).scene);
  near(wide.box.depth / wide.box.width, 0.5, "y spans half of x");
  const root = mathSurfaceLayout(readStageScene({ ...saddle, surfaces: [{ name: "f", expression: "sqrt(x)" }] }).scene);
  assert.ok(root.grids[0].some(p => p === null) && root.grids[0].some(p => p), "undefined for x < 0: holes there only");
});

test("v4 surfaces refuse whole what they cannot draw exactly; older schemas refuse surfaces", () => {
  const bad = {
    "surfaces under v3": [{ schema: "agentx.math-scene.v3" }, "schema"],
    "three surfaces": [{ surfaces: "fgh".split("").map(name => ({ name, expression: "x" })) }, "surfaces"],
    "no surface": [{ surfaces: [] }, "surfaces"],
    "surface named y": [{ surfaces: [{ name: "y", expression: "x" }] }, "surfaces"],
    "surface using t": [{ surfaces: [{ name: "z", expression: "t*x" }] }, "formula"],
    "surface using another": [{ surfaces: [{ name: "f", expression: "x" }, { name: "g", expression: "f(x) + 1" }] }, "formula"],
    "parameter named z": [{ parameters: [{ name: "z", value: 0, min: -1, max: 1 }] }, "parameters"],
    "missing y window": [{ y: undefined }, "window"],
    "bad z window": [{ z: [2, 1] }, "window"],
  };
  for (const [label, [change, reason]] of Object.entries(bad)) assert.equal(readStageScene({ ...saddle, ...change }).reason, reason, label);
});

test("the camera frames a surface box from its higher opening view", () => {
  const { scene } = readStageScene(saddle);
  const frame = mathSurfaceFrame(mathSurfaceLayout(scene).box);
  for (const aspect of [0.6, 1, 1.8]) {
    const distance = mathFitDistance(MATH_SURFACE_ORBIT, aspect, 35, 1.06, frame);
    assert.ok(distance > 0 && Number.isFinite(distance), `aspect ${aspect}`);
  }
  assert.ok(mathFitDistance(MATH_SURFACE_ORBIT, 0.6, 35, 1.06, frame) > mathFitDistance(MATH_SURFACE_ORBIT, 1.8, 35, 1.06, frame),
    "a narrow element needs the camera further back");
  assert.ok(MATH_SURFACE_ORBIT.pitch > MATH_ORBIT_DEFAULT.pitch);
});

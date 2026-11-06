import assert from "node:assert/strict";
import test from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const {
  MATH_BOARD, MATH_FIELD, MATH_FUNCTION_PALETTE, MATH_LABEL_GAP, MATH_ORBIT_DEFAULT, clampOrbit, describeMathScene, mathFitDistance,
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
    "unknown schema": { ...compare, schema: "agentx.math-scene.v3" },
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

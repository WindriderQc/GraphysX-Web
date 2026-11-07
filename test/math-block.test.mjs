import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

// The Math Lab page reads a block as AgentX's Super Dad and Famille do (#1270). The vector file is
// generated from AgentX's own parsePlot by scripts/math-block-vectors.mjs.
const vectors = JSON.parse(readFileSync(new URL("./fixtures/math-block-vectors.json", import.meta.url), "utf8"));
const { MATH_BLOCK_COLORS, mathBlockSchema, mathBlockScene, mathBlockText, mathSliderStep, parseMathBlock } =
  await importBrowserModule(new URL("../src/math-block.ts", import.meta.url));
const { formatMath } = await importBrowserModule(new URL("../src/math-expression.ts", import.meta.url));
const { MATH_FUNCTION_PALETTE, readStageScene } = await importBrowserModule(new URL("../src/llmx-math-functions.ts", import.meta.url));
const { MATH_LAB_EXAMPLES } = await importBrowserModule(new URL("../src/math-lab-examples.ts", import.meta.url));

const accepted = vectors.blocks.filter(row => !row.error);

test("the block vectors are AgentX's, accepted and refused", () => {
  assert.equal(vectors.schema, "agentx.math-block-vectors.v1");
  assert.ok(vectors.blocks.length >= 90);
  assert.ok(accepted.length >= 25 && vectors.blocks.length - accepted.length >= 50);
});

test("every block is accepted or refused exactly as AgentX does, with the same plot, text and formulas", () => {
  for (const row of vectors.blocks) {
    const label = JSON.stringify(row.body.slice(0, 60));
    const parsed = parseMathBlock(row.body);
    if (row.error) {
      assert.equal(parsed.ok, false, `${label} must be refused`);
      assert.deepEqual(parsed.error, row.error, `${label} refusal`);
      continue;
    }
    assert.equal(parsed.ok, true, `${label}: ${parsed.error?.message}`);
    assert.deepEqual(parsed.plot, row.plot, `${label} plot`);
    assert.equal(parsed.text, row.text, `${label} canonical text`);
    assert.equal(parsed.references, row.references, `${label} references`);
    assert.deepEqual(parsed.trees.map(tree => formatMath(tree)), row.trees, `${label} drawn formulas`);
    assert.deepEqual(Object.fromEntries(Object.entries(parsed.slopes).map(([name, tree]) => [name, formatMath(tree)])), row.slopes, `${label} slopes`);
    assert.deepEqual(parsed.curveTrees.map(pair => [formatMath(pair.x), formatMath(pair.y)]), row.curveTrees, `${label} curves`);
  }
});

test("the canonical text is itself a block that reads back the same, with slider values written in", () => {
  for (const row of accepted) {
    const again = parseMathBlock(row.text);
    assert.equal(again.ok, true, row.text);
    assert.equal(again.text, row.text);
  }
  const wave = parseMathBlock("y = a*sin(b*x)\na = 1 in [-3, 3]\nb = 2 in [0.5, 4]");
  assert.equal(mathBlockText(wave.plot, { a: -2.5 }), "y = a * sin(b * x)\na = -2.5 in [-3, 3]\nb = 2 in [0.5, 4]\nx in [-10, 10]");
});

test("every accepted block becomes a scene <llmx-stage> applies, at the oldest contract that draws it", () => {
  assert.deepEqual([...MATH_BLOCK_COLORS], [...MATH_FUNCTION_PALETTE], "the page, AgentX's card and the stage share one palette");
  for (const row of accepted) {
    const block = parseMathBlock(row.body);
    const scene = mathBlockScene(block);
    const read = readStageScene(scene);
    assert.equal(read.ok, true, `${row.body}: ${read.reason ?? read.message ?? JSON.stringify(read)}`);
    assert.equal(scene.schema, mathBlockSchema(block));
    const plain = block.plot.kind === "functions" && !block.references && !block.plot.derivatives && !block.plot.tangents && !block.plot.areas && !block.plot.curves;
    if (plain) assert.equal(scene.schema, "agentx.math-scene.v2", row.body);
  }
  const calculus = parseMathBlock("f(x) = x^3 - 3x\nf'(x)\ntangent f at p\np = 1 in [-2, 2]\nx in [-2.5, 2.5]");
  assert.deepEqual(mathBlockScene(calculus, { p: -1.5 }), {
    schema: "agentx.math-scene.v3", kind: "functions", x: [-2.5, 2.5],
    functions: [{ name: "f", label: "f(x)", expression: "x^3 - 3 * x", color: "#ffe86b" }],
    parameters: [{ name: "p", value: -1.5, min: -2, max: 2 }],
    derivatives: ["f"], tangents: [{ of: "f", at: "p" }], areas: [],
  });
  const circle = mathBlockScene(parseMathBlock("c(t) = (r cos(t), r sin(t))\nr = 2 in [0.5, 3]"));
  assert.equal(circle.x, null, "curves alone are framed around themselves");
  assert.equal(circle.curves[0].color, "#ffe86b");
});

test("the starter examples go from a line to surfaces, through v2, v3 and v4", () => {
  const schemas = MATH_LAB_EXAMPLES.map(example => {
    const block = parseMathBlock(example.body);
    assert.equal(block.ok, true, `${example.id}: ${block.error?.message}`);
    assert.ok(vectors.blocks.some(row => row.body === example.body && !row.error), `${example.id} is in AgentX's vectors`);
    return mathBlockSchema(block);
  });
  assert.equal(schemas[0], "agentx.math-scene.v2");
  assert.equal(schemas.at(-1), "agentx.math-scene.v4");
  for (const schema of ["agentx.math-scene.v2", "agentx.math-scene.v3", "agentx.math-scene.v4"]) assert.ok(schemas.includes(schema), schema);
  assert.deepEqual([...schemas].sort(), schemas, "simple to advanced");
  for (const id of ["line", "parabola", "compare", "tangent", "area", "circle", "hill"]) assert.ok(MATH_LAB_EXAMPLES.some(example => example.id === id), id);
});

test("a slider gets a round step and at least a hundred positions", () => {
  assert.equal(mathSliderStep(6), 0.05);
  assert.equal(mathSliderStep(3.5), 0.02);
  assert.equal(mathSliderStep(40), 0.2);
  assert.equal(mathSliderStep(2 * Math.PI), 0.05);
  for (const span of [0.3, 1, 7, 12.5, 1000]) assert.ok(span / mathSliderStep(span) >= 100, String(span));
});

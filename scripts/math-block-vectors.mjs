// Regenerates test/fixtures/math-block-vectors.json from AgentX's own block parser, so the Math
// Lab page reads a block exactly as Super Dad and Famille do (AgentX #1270).
//
//   node scripts/math-block-vectors.mjs /path/to/AgentX/core/public/js/math-expression.js
//
// Every body below is run through AgentX's `parsePlot`; the fixture keeps its answer: the refusal
// (code and message) or the plot, its canonical text and the formulas it draws. The page's starter
// examples are included, so they are always blocks AgentX accepts too.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importBrowserModule } from "../test/support/import-browser-module.mjs";

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/math-block-vectors.mjs <AgentX core/public/js/math-expression.js>");
  process.exit(1);
}
const math = createRequire(import.meta.url)(path.resolve(source));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { MATH_LAB_EXAMPLES } = await importBrowserModule(new URL("../src/math-lab-examples.ts", import.meta.url));

const five = "f(x) = x\ng(x) = x\nh(x) = x\nk(x) = x\nm(x) = x";
const bodies = [
  ...MATH_LAB_EXAMPLES.map(example => example.body),
  // Blocks from AgentX's core/surfaces/household/test/math-lab.test.js.
  "y = a*sin(b*x)\na = 1 in [-3, 3]\nb = 2 in [0.5, 4]\nx in [-2*pi, 2*pi]",
  "f(x) = x^2\ng(x) = a x + 1\na = 2 in [-3, 3]\nx in [-3, 3]",
  "f(x) = x^3 - 3x\nf'(x)\ntangent f at p\narea f from 0 to b\np = 1 in [-2, 2]\nb = 1.5 in [0, 2]\nx in [-2.5, 2.5]",
  "c(t) = (r cos(t), r sin(t))\nr = 2 in [0.5, 3]",
  "z = x^2 - y^2\nx in [-2, 2]\ny in [-2, 2]",
  "z = x^2 - y^2\nx in [-2, 2]\ny in [-2, 2]\nz in [-1, 1]",
  "```\nf(x) = x^2 - 4\n- y in [-5, 5].\n```",
  "y = sin(x)\ny'\ntangente en pi/2\naire sous y de 0 à pi\nx in [-4, 4]",
  "y = 1/x\ntangent at 0\narea from -1 to 1\nx in [-2, 2]",
  "f(x) = x^2\ng(x) = f(x - 1) + 1\nh(x) = f'(2x)\nx in [-3, 3]",
  "y = sqrt(x)\nx in [-4, 4]",
  "y = tan(x)\nx in [-3, 3]",
  "f(x) = x^2\nc(t) = (t, f(t) + 1)\nt in [-2, 2]\nx in [-3, 3]",
  "f(x, y) = a*sin(x)*cos(y)\ng(x, y) = 0\na = 1 in [0, 2]",
  "z = sqrt(x)",
  // Refusals.
  "y = a*x", "a = 1 in [0, 2]", "y = x\ny = 2x", "y = x*e\ne = 1 in [0, 3]", "y = a*x\na = 1 in [0, 2]\na = 2 in [0, 3]",
  "y = a*x\na = 9 in [0, 5]", "y = a*x\na = 1", "y = x\nx in [3, 1]", "y = x\nLa parabole est jolie", "y = x\nx in [0, 1e9]",
  "f(x) = x\nf = 1 in [0, 2]", "e(x) = x", "t(x) = x", "f(x) = x\nf(x) = 2x", "f(x) = x\ng(x) = q", five,
  "f(x) = x^2\nf'(x) = 2x", "f(x) = x^2\ng'(x)", "f(x) = x^2\nf'(x)\nf'(x)", "f(x) = x\ng(x) = x\ntangent at 1",
  "f(x) = x\ntangent f at 12", "f(x) = x\ntangent f at p\np = 0 in [-20, 20]", "f(x) = x\ntangent f at q",
  "f(x) = x\ntangent f at 1\ntangent f at 1", "f(x) = x\narea f from 0 to 11", "f(x) = x\narea h from 0 to 1",
  `f(x) = x\n${[-2, -1, 0, 1, 2].map(at => `tangent f at ${at}`).join("\n")}`,
  `f(x) = x\n${[1, 2, 3, 4, 5].map(to => `area f from 0 to ${to}`).join("\n")}`,
  "f(x) = g(x)\ng(x) = f(x)", "f(x) = f(x - 1)", "y = x\ng(x) = y + 1", "f(x) = x\ng(x) = f * 2",
  "f(x) = x*x*x*x*x*x*x*x\ng(x) = f(f(x))\nh(x) = g(g(x))\nk(x) = h(h(x))", "f(x) = x\ng(x) = h(x)",
  "c(t) = (cos(x), sin(t))", "c(t) = (cos(t))", "f(x) = x\nc(t) = (t, t)\ntangent c at 1", "y = x\nt in [0, 1]",
  "f(x) = x\ng(x) = x\nh(x) = x\nc(t) = (t, t)\nd(t) = (t, t)", "c(t) = (t, g(t))", "t(t) = (t, t)",
  "z = x + y\nf(x) = x", "z = x + y\nc(t) = (t, t)", "f(x, y) = x\ng(x, y) = y\nh(x, y) = x*y", "z = t*x",
  "f(x, y) = x\ng(x, y) = f(x, y)", "z = a*x\nz = 1 in [0, 2]", "f(x, y) = z*x\nz = 1 in [0, 2]", "y = x\nz in [0, 1]", "z = x\nt in [0, 1]",
  // What people type on the page: spellings, ranges written with .., odd lines.
  "y = 2x² − 1\nx ∈ [-3, 3]", "y = a x\na = 1 in -2..2", "y = a x\na = 0.5 ∈ [0, 1]", "y = x\nx in [-pi, pi]\ny in [-2, 2]",
  "y = x\ny in [2, 2]", "y = x\nx in [0, 0.0000001]", "y = alert(x)", "y = x;\n* a = 1 in [0, 2]", "", "   \n\n",
  "y = x\n".repeat(200), "y = a + b + c + d + f + g + h\na = 1 in [0, 2]\nb = 1 in [0, 2]\nc = 1 in [0, 2]\nd = 1 in [0, 2]\nf = 1 in [0, 2]\ng = 1 in [0, 2]\nh = 1 in [0, 2]",
  "c(t) = (t, t)\nx in [-1, 1]", "c(t) = (cos(t), sin(2t))\nd(t) = (2cos(t), 2sin(t))\nt in [0, 2pi]\ny in [-3, 3]",
  "f(x) = x^2\nf'\ntangent at 1", "y = x^2\ntangent to y at x = 1", "f(x) = x^2\naire de f de -1 à 1", "f(x) = x^2\nx in [-2, 2]\ntangent f at a\na = 1 in [-3, 3]",
  "z = sin(x) cos(y)\nz in [-2, 2]\nx in [-pi, pi]\ny in [-pi, pi]", "f(x, y) = x y\nz in [3, 1]",
];

const formatted = tree => math.format(tree);
const expressions = bodies.map(body => {
  const parsed = math.parsePlot(body);
  if (!parsed.ok) return { body, error: parsed.error };
  return {
    body, plot: parsed.plot, text: parsed.text, references: parsed.references,
    trees: parsed.trees.map(formatted),
    slopes: Object.fromEntries(Object.entries(parsed.slopes).map(([name, tree]) => [name, formatted(tree)])),
    curveTrees: parsed.curveTrees.map(row => [formatted(row.x), formatted(row.y)]),
  };
});
const vectors = {
  schema: "agentx.math-block-vectors.v1",
  note: "Generated from AgentX core/public/js/math-expression.js (parsePlot) by scripts/math-block-vectors.mjs. GraphysX-Web's src/math-block.ts must answer every body the same way.",
  blocks: expressions,
};
const target = path.join(root, "test/fixtures/math-block-vectors.json");
writeFileSync(target, `${JSON.stringify(vectors, null, 1)}\n`);
console.log(`${expressions.length} blocks (${expressions.filter(row => row.error).length} refused) -> ${path.relative(root, target)}`);

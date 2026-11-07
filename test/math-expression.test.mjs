import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

// Grammar parity with AgentX (#1270): the vector file is a copy of AgentX's
// core/public/js/math-expression.vectors.json, whose answers come from AgentX's own grammar.
const vectors = JSON.parse(readFileSync(new URL("./fixtures/math-expression-vectors.json", import.meta.url), "utf8"));
const { deriveMath, evaluateMath, fitMathY, formatMath, integrateMath, parseMathExpression, parseMathFunctions, sampleMath } =
  await importBrowserModule(new URL("../src/math-expression.ts", import.meta.url));

const close = (actual, expected, label) => {
  // Non-finite answers are written as text: "NaN", "Infinity", "-Infinity".
  if (typeof expected === "string") return assert.equal(String(actual), expected, label);
  const tolerance = 1e-12 * Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
};

test("the shared vectors are the AgentX grammar's", () => {
  assert.equal(vectors.schema, "agentx.math-expression-vectors.v1");
  assert.ok(vectors.expressions.length >= 50);
  assert.ok(vectors.expressions.some(row => row.error) && vectors.expressions.some(row => !row.error));
});

test("every vector is accepted or refused exactly as AgentX does, with the same canonical text and values", () => {
  for (const row of vectors.expressions) {
    const label = JSON.stringify(row.source.slice(0, 40));
    const parsed = parseMathExpression(row.source, row.names);
    if (row.error) {
      assert.equal(parsed.ok, false, `${label} must be refused`);
      assert.equal(parsed.error.code, row.error, `${label} refusal code`);
      continue;
    }
    assert.equal(parsed.ok, true, `${label}: ${parsed.error?.message}`);
    assert.equal(formatMath(parsed.tree), row.format, `${label} canonical text`);
    // The canonical text reads back to the same tree.
    assert.equal(formatMath(parseMathExpression(row.format, row.names).tree), row.format, `${label} round trip`);
    for (const { scope, value } of row.evaluations) close(evaluateMath(parsed.tree, scope), value, `${label} at ${JSON.stringify(scope)}`);
  }
});

test("every derivative is written and valued exactly as AgentX derives it", () => {
  const derived = vectors.expressions.filter(row => row.derivative);
  assert.ok(derived.length >= 40, "the vectors cover the derivative rules");
  for (const row of derived) {
    const label = JSON.stringify(row.source.slice(0, 40));
    const derivative = deriveMath(parseMathExpression(row.source, row.names).tree);
    assert.equal(formatMath(derivative), row.derivative, `${label} derivative text`);
    // The derivative's text is itself a formula of the grammar, read back to the same text.
    assert.equal(formatMath(parseMathExpression(row.derivative, row.names).tree), row.derivative, `${label} derivative round trip`);
    for (const { scope, value } of row.derivativeEvaluations) close(evaluateMath(derivative, scope), value, `${label} slope at ${JSON.stringify(scope)}`);
  }
});

test("functions that use other functions expand, or are refused, exactly as AgentX does", () => {
  assert.ok(vectors.systems.some(row => row.error === "cycle") && vectors.systems.some(row => !row.error));
  for (const row of vectors.systems) {
    const label = row.functions.map(fn => `${fn.name}=${fn.source}`).join("; ");
    const read = parseMathFunctions(row.functions, row.names);
    if (row.error) {
      assert.equal(read.ok, false, `${label} must be refused`);
      assert.deepEqual([read.error.code, read.name], [row.error, row.failing], `${label} refusal`);
      continue;
    }
    assert.equal(read.ok, true, `${label}: ${read.error?.message}`);
    assert.deepEqual(read.functions.map(fn => formatMath(fn.tree)), row.formats, `${label} canonical text`);
    for (const { scope, values } of row.evaluations) {
      read.functions.forEach((fn, index) => close(evaluateMath(fn.expanded, scope), values[index], `${label} ${fn.name} at ${JSON.stringify(scope)}`));
    }
  }
});

test("the signed area follows Simpson's rule on the formula and refuses an undefined stretch", () => {
  const square = parseMathExpression("x^2", ["x"]).tree;
  close(integrateMath(square, {}, 0, 2), 8 / 3, "x^2 from 0 to 2");
  close(integrateMath(square, {}, 2, 0), -8 / 3, "reversed bounds");
  assert.equal(integrateMath(parseMathExpression("1/x", ["x"]).tree, {}, -1, 1), null, "1/x across 0");
  assert.ok(Math.abs(integrateMath(parseMathExpression("sin(x)", ["x"]).tree, {}, 0, Math.PI) - 2) < 1e-10);
});

test("the vertical window is fitted exactly as the 2D card fits it", () => {
  for (const row of vectors.fits) {
    const parsed = parseMathExpression(row.expression, ["x", ...row.parameters.map(p => p.name)]);
    const scope = Object.fromEntries(row.parameters.map(p => [p.name, p.value]));
    const fitted = fitMathY(sampleMath(parsed.tree, row.x, scope, row.samples), row.declared);
    fitted.forEach((value, index) => close(value, row.fitted[index], `${row.expression} y[${index}]`));
  }
});

test("nothing outside the grammar runs: no globals, no property access, no eval", () => {
  for (const source of ["constructor", "this", "globalThis", "__proto__", "x.constructor", "Function(x)", "eval(x)", "alert(1)", "x;x", "`x`", "x[0]"]) {
    assert.equal(parseMathExpression(source, ["x"]).ok, false, source);
  }
  const parsed = parseMathExpression("toString", ["t", "o", "s", "r", "i", "n", "g"]);
  assert.equal(parsed.ok, true, "letters are only ever single-letter names");
  assert.ok(Number.isNaN(evaluateMath(parsed.tree, {})), "an unset name is NaN, never an inherited property");
});

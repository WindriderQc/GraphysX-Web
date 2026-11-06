import assert from "node:assert/strict";
import test from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

// formula-field draws any Math Lab formula (AgentX #1270, phase 2), refusing what the grammar refuses.
const { AgentWorldFormulaField, evaluateFormulaHeight, resolveAgentWorldFormula } =
  await importBrowserModule(new URL("../src/agent-world-formula.ts", import.meta.url));

test("the recovered formulas are unchanged, pinned to the board as in the archive", () => {
  const bowl = resolveAgentWorldFormula({ preset: "parabola-bowl" });
  assert.equal(bowl.kind, "parabola");
  assert.equal(bowl.expression, null);
  assert.equal(evaluateFormulaHeight(bowl, 0), 2.2);
  assert.equal(evaluateFormulaHeight(resolveAgentWorldFormula({ kind: "slope", m: 5, b: 5 }), 4), 7.4, "verbatim display clamp");
});

test("an expression uses x and the A/B/C/M controls, in canonical form", () => {
  const wave = resolveAgentWorldFormula({ expression: "a sin(b x) + c", a: 2, b: 1, c: 0 });
  assert.equal(wave.kind, "expression", "implied by the expression");
  assert.equal(wave.expression, "a * sin(b * x) + c");
  assert.ok(Math.abs(evaluateFormulaHeight(wave, Math.PI / 2) - (2.2 + 2 * 0.34)) < 1e-12);
  const shifted = resolveAgentWorldFormula({ kind: "expression", expression: "x^2", xOffset: 1 });
  assert.ok(Math.abs(evaluateFormulaHeight(shifted, 1) - (2.2 + 4 * 0.34)) < 1e-12);
});

test("undefined or off-board values are hidden, never pinned", () => {
  const root = resolveAgentWorldFormula({ expression: "sqrt(x)" });
  assert.ok(Number.isNaN(evaluateFormulaHeight(root, -1)));
  const steep = resolveAgentWorldFormula({ expression: "100x" });
  assert.ok(Number.isNaN(evaluateFormulaHeight(steep, 1)));
  const field = new AgentWorldFormulaField(resolveAgentWorldFormula({ expression: "sqrt(x)", lanes: 2, perLane: 9 }));
  const described = field.describe();
  assert.equal(described.expression, "sqrt(x)");
  assert.ok(described.minHeight >= 2.2);
  field.dispose();
  const empty = new AgentWorldFormulaField(resolveAgentWorldFormula({ expression: "sqrt(-1 - x^2)", lanes: 1, perLane: 4 }));
  assert.equal(empty.describe().minHeight, null);
  empty.dispose();
});

test("a formula outside the grammar is refused, not guessed", () => {
  for (const formula of [{ expression: "window.alert(x)" }, { expression: "q*x" }, { kind: "expression" },
    { kind: "expression", expression: "" }, { kind: "parabola", expression: "x" }, { expression: "sin x" }]) {
    assert.throws(() => resolveAgentWorldFormula(formula), /formula/, JSON.stringify(formula));
  }
});

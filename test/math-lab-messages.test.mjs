import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

// The Math Lab page says each refusal in plain French beside the reader's exact (AgentX) message.
const vectors = JSON.parse(readFileSync(new URL("./fixtures/math-block-vectors.json", import.meta.url), "utf8"));
const { MATH_LAB_REFUSAL_CODES, mathLabRefusal, prettyMath } = await importBrowserModule(new URL("../src/math-lab-messages.ts", import.meta.url));

test("every refusal AgentX's reader gives has a plain French sentence", () => {
  const refused = vectors.blocks.filter(row => row.error);
  for (const row of refused) {
    assert.ok(MATH_LAB_REFUSAL_CODES.includes(row.error.code), `code ${row.error.code} has a sentence`);
    const said = mathLabRefusal(row.error);
    assert.notEqual(said, "Je ne peux pas dessiner ce bloc.", `${row.error.message} gets a specific sentence`);
    assert.doesNotMatch(said, /\b(?:must|Write|Unknown|block)\b/, `${said} is French`);
  }
});

test("the sentence names what is at fault and shows what to write", () => {
  assert.equal(mathLabRefusal({ code: "unknown_name", message: 'Unknown name "q". Declare a parameter on its own line, for example: q = 1 in [-5, 5]' }),
    "Je ne connais pas « q ». Ajoute une ligne pour en faire un paramètre, par exemple : q = 1 in [-5, 5].");
  assert.equal(mathLabRefusal({ code: "unknown_name", message: 'g(x): Unknown name "h". Declare a function h(x) = … or a parameter h = 1 in [-5, 5] on its own line' }),
    "g(x) : Je ne connais pas « h ». Écris sa fonction, par exemple h(x) = 2x, ou fais-en un paramètre : h = 1 in [-5, 5].");
  assert.equal(mathLabRefusal({ code: "line", message: 'Unrecognised line "La parabole est jolie". Use y = …, a = 1 in [-5, 5], x in [-10, 10]' }),
    "Je ne comprends pas la ligne « La parabole est jolie ». Exemples : y = 2x + 1, a = 1 in [-5, 5], x in [-10, 10].");
  assert.equal(mathLabRefusal({ code: "range", message: "Parameter a needs a slider range, for example: a = 1 in [-5, 5]" }),
    "Le paramètre a a besoin d'un intervalle pour son curseur, par exemple : a = 1 in [-5, 5].");
  assert.equal(mathLabRefusal({ code: "character", message: 'Unsupported character "$"' }), "Le caractère « $ » n'est pas permis dans une formule.");
  assert.equal(mathLabRefusal({ code: "empty", message: "The formula is empty" }), "La formule est vide.");
});

test("formulas read on screen with superscripts and a centred dot", () => {
  assert.equal(prettyMath("x^3 - 3 * x"), "x³ − 3 · x");
  assert.equal(prettyMath("a * x^2 + b * x + c"), "a · x² + b · x + c");
  assert.equal(prettyMath("x^(-1) + 2^10"), "x^(-1) + 2¹⁰", "only plain integer powers become superscripts");
  assert.equal(prettyMath("x^1.5"), "x^1.5");
});

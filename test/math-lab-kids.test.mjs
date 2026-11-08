import assert from "node:assert/strict";
import test from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

// The Math Lab's cube level: v1 pictures chosen with buttons, refused whole outside v1's bounds.
const kids = await importBrowserModule(new URL("../src/math-lab-kids.ts", import.meta.url));
const { readMathScene, MATH_LIMITS } = await importBrowserModule(new URL("../src/llmx-math-scene.ts", import.meta.url));
const { readStageScene } = await importBrowserModule(new URL("../src/llmx-math-functions.ts", import.meta.url));

test("every offered picture is a v1 scene the stage accepts", () => {
  const offered = [kids.KIDS_FIRST, ...Object.values(kids.KIDS_START),
    ...kids.KIDS_COUNT_PICKS.map(to => ({ kind: "count", to })),
    ...kids.KIDS_ADD_PICKS.map(([a, b]) => ({ kind: "add", a, b }))];
  for (const scene of offered) {
    const value = kids.kidsSceneValue(scene);
    assert.equal(value.schema, "agentx.math-scene.v1");
    assert.deepEqual(readMathScene(value), scene, `${JSON.stringify(scene)} is inside v1`);
    const read = readStageScene(value);
    assert.ok(read.ok && read.type === "cubes", `${JSON.stringify(scene)} draws as cubes`);
  }
  assert.ok(kids.KIDS_COUNT_PICKS.includes(MATH_LIMITS.countMax), "the biggest number is offered");
  assert.ok(kids.KIDS_ADD_PICKS.some(([a, b]) => a + b === MATH_LIMITS.sumMax), "the biggest sum is offered");
  assert.ok(kids.KIDS_ADD_PICKS.some(([a, b]) => a < 10 && a + b > 10), "a sum that crosses ten (regrouping) is offered");
});

test("a press inside the bounds moves by exactly its step", () => {
  assert.deepEqual(kids.kidsStep({ kind: "count", to: 13 }, "to", 10), { ok: true, scene: { kind: "count", to: 23 } });
  assert.deepEqual(kids.kidsStep({ kind: "count", to: 13 }, "to", -1), { ok: true, scene: { kind: "count", to: 12 } });
  assert.deepEqual(kids.kidsStep({ kind: "add", a: 8, b: 5 }, "b", 1), { ok: true, scene: { kind: "add", a: 8, b: 6 } });
  assert.deepEqual(kids.kidsStep({ kind: "add", a: 8, b: 5 }, "a", -1), { ok: true, scene: { kind: "add", a: 7, b: 5 } });
});

test("a press that would leave the bounds is refused, never clamped", () => {
  const refused = (scene, part, delta) => {
    const read = kids.kidsStep(scene, part, delta);
    assert.equal(read.ok, false, `${JSON.stringify(scene)} ${part}${delta > 0 ? "+" : ""}${delta} is refused`);
    return read.say;
  };
  assert.match(refused({ kind: "count", to: 95 }, "to", 10), /de 1 à 100/, "95 + 10 does not become 100");
  assert.match(refused({ kind: "count", to: 100 }, "to", 1), /de 1 à 100/);
  assert.match(refused({ kind: "count", to: 5 }, "to", -10), /de 1 à 100/, "5 - 10 does not become 1");
  assert.match(refused({ kind: "count", to: 1 }, "to", -1), /de 1 à 100/);
  assert.match(refused({ kind: "add", a: 12, b: 8 }, "a", 1), /jusqu'à 20/);
  assert.match(refused({ kind: "add", a: 0, b: 1 }, "b", -1), /au moins un cube/);
  assert.match(refused({ kind: "add", a: 0, b: 3 }, "a", -1), /nombres entiers/);
});

test("a limit reached is explained beside the disabled button", () => {
  assert.equal(kids.kidsLimitNote({ kind: "count", to: 100 }), "100, c'est le plus grand nombre ici.");
  assert.match(kids.kidsLimitNote({ kind: "add", a: 10, b: 10 }), /^20 en tout, c'est le maximum/);
  assert.equal(kids.kidsLimitNote({ kind: "count", to: 13 }), "");
});

test("the address keeps the picture in plain words and refuses what v1 refuses", () => {
  assert.equal(kids.kidsHash({ kind: "count", to: 13 }), "#compter=13");
  assert.equal(kids.kidsHash({ kind: "add", a: 8, b: 5 }), "#additionner=8+5");
  assert.deepEqual(kids.kidsFromHash("#compter=13"), { ok: true, scene: { kind: "count", to: 13 } });
  assert.deepEqual(kids.kidsFromHash("#additionner=8+5"), { ok: true, scene: { kind: "add", a: 8, b: 5 } });
  assert.deepEqual(kids.kidsFromHash("#additionner=8%2B5"), { ok: true, scene: { kind: "add", a: 8, b: 5 } });
  assert.equal(kids.kidsFromHash("#bloc=y%20%3D%20x"), null, "a formula address is not a cube picture");
  assert.equal(kids.kidsFromHash(""), null);
  for (const [hash, pattern] of [["#compter=150", /de 1 à 100/], ["#compter=0", /de 1 à 100/], ["#compter=2.5", /entiers/],
    ["#compter=abc", /entiers/], ["#additionner=15+9", /jusqu'à 20/], ["#additionner=0+0", /au moins un cube/], ["#additionner=8-5", /entiers/]]) {
    const read = kids.kidsFromHash(hash);
    assert.equal(read.ok, false, `${hash} is refused`);
    assert.match(read.say, pattern, hash);
  }
});

test("the answer and the reveal time come from the scene", () => {
  assert.equal(kids.kidsAnswer({ kind: "add", a: 8, b: 5 }), 13);
  assert.equal(kids.kidsAnswer({ kind: "count", to: 47 }), 47);
  const duration = kids.kidsDuration({ kind: "add", a: 8, b: 5 });
  assert.ok(duration > 3 && duration < 8, `8 + 5 regroups in a few seconds (${duration})`);
});

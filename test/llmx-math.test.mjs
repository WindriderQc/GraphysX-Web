import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LLMX_MATH_ROOT_ID, LLMX_MATH_TAG, LlmXMathError, advanceLlmXMath, buildLlmXMath,
  recoverLlmXMath, reconcileLlmXMathCommands, validateLlmXMathConfig,
} from "../src/llmx-math.ts";
import { applyCommands, validateStoredSceneDefinition } from "../server/scene-commands.mjs";

const zone = { center: [4.6, 0.18, 3.4], radius: 2.6 };
const config = (operation, left, right = 0, step = 0) => ({ operation, left, right, step });
const units = lesson => lesson.entities.filter(entity => entity.tags?.includes("llmx-math-unit"));
const inZone = (lesson, name) => units(lesson).filter(entity => entity.tags.includes(`llmx-math:zone:${name}`));
const emptyWorld = () => ({ schema: "graphysx.agent-world/v2", id: "math-test", label: "Math test", entities: [
  // A copied tag grants no ownership over an unrelated entity.
  { id: "llmx-created-sculpture", type: "box", label: "Independent creation", transform: { position: [8, 1, 0] }, tags: [LLMX_MATH_TAG] },
] });

test("arithmetic rejects invalid values, impossible steps, negative subtraction and sums above 20", () => {
  for (const value of [-1, 21, 0.5, NaN, Infinity, "2", undefined, null]) {
    assert.throws(() => buildLlmXMath(config("add", value, 0), zone), LlmXMathError);
    assert.throws(() => buildLlmXMath({ ...config("add", 0), right: value }, zone), LlmXMathError);
    assert.throws(() => buildLlmXMath({ ...config("count", 3), step: value }, zone), LlmXMathError);
  }
  for (const input of [config("multiply", 2, 3), config("add", 12, 9), config("subtract", 2, 3),
    config("count", 3, 1), config("count", 3, 0, 4), config("subtract", 5, 2, 3)]) {
    assert.throws(() => validateLlmXMathConfig(input), LlmXMathError);
  }
  assert.throws(() => buildLlmXMath(config("count", 3), { center: [0, NaN, 0], radius: 2 }), LlmXMathError);
  assert.throws(() => buildLlmXMath(config("count", 3), { center: [0, 0, 0], radius: 0 }), LlmXMathError);
  assert.throws(() => advanceLlmXMath(config("count", 3), 2), LlmXMathError);
});

test("all additions and subtractions in 0..20 derive their answer and visible quantities from the same model", () => {
  for (let left = 0; left <= 20; left += 1) {
    const counted = buildLlmXMath(config("count", left, 0, left), zone);
    assert.equal(counted.result, left);
    assert.equal(inZone(counted, "left").length, 0);
    assert.equal(inZone(counted, "right").length, left);
    for (let right = 0; right <= 20; right += 1) {
      for (const operation of ["add", "subtract"]) {
        if (operation === "add" ? left + right > 20 : right > left) continue;
        const lesson = buildLlmXMath(config(operation, left, right, right), zone);
        const result = operation === "add" ? left + right : left - right;
        assert.equal(lesson.result, result);
        assert.equal(lesson.complete, true);
        assert.equal(inZone(lesson, "left").length, result);
        assert.equal(inZone(lesson, "right").length, operation === "add" ? 0 : right);
        assert.equal(units(lesson).length, operation === "add" ? left + right : left);
        assert.ok(lesson.labels.equation.endsWith(`=${result}`));
        assert.match(lesson.labels.initial, new RegExp(String(left)));
        assert.match(lesson.labels.action, new RegExp(String(right)));
        assert.match(lesson.labels.result, new RegExp(String(result)));
      }
    }
  }
});

test("every forward step moves exactly one equal cube, without stacking, hiding or creating units", () => {
  for (const initial of [config("count", 20), config("add", 0, 20), config("add", 8, 12), config("subtract", 20, 20), config("subtract", 5, 2)]) {
    let previous = buildLlmXMath(initial, zone);
    for (let step = 1; step <= previous.stepCount; step += 1) {
      const current = buildLlmXMath(advanceLlmXMath(previous.config), zone);
      const before = new Map(units(previous).map(entity => [entity.id, entity]));
      const currentUnits = units(current);
      assert.equal(currentUnits.length, before.size);
      let moved = 0;
      for (const unit of currentUnits) {
        assert.ok(before.has(unit.id), "a step must preserve cube identity");
        if (JSON.stringify(unit.transform.position) !== JSON.stringify(before.get(unit.id).transform.position)) moved += 1;
        assert.deepEqual(unit.transform.scale, [0.22, 0.22, 0.22]);
        assert.equal(unit.transform.position[1], 0.13, "all units belong to the same visible layer");
        assert.equal(unit.visible, true);
        assert.equal(unit.parentId, LLMX_MATH_ROOT_ID);
      }
      assert.equal(moved, 1, "one explicit user step moves one cube");
      for (let i = 0; i < currentUnits.length; i += 1) for (let j = i + 1; j < currentUnits.length; j += 1) {
        const a = currentUnits[i].transform.position;
        const b = currentUnits[j].transform.position;
        assert.ok(Math.abs(a[0] - b[0]) > 0.22 || Math.abs(a[2] - b[2]) > 0.22, "two counting cubes overlap");
      }
      assert.equal(inZone(current, "left").length, current.quantities.left);
      assert.equal(inZone(current, "right").length, current.quantities.right);
      assert.deepEqual(advanceLlmXMath(current.config, -1), previous.config);
      previous = current;
    }
    assert.deepEqual(advanceLlmXMath(previous.config), previous.config, "completion stays bounded");
    assert.deepEqual(advanceLlmXMath(initial, -1), initial, "the first step stays bounded");
  }
});

test("zero is an empty visible quantity with a marker and no placeholder counting cube", () => {
  for (const operation of ["count", "add", "subtract"]) {
    const lesson = buildLlmXMath(config(operation, 0), zone);
    assert.equal(lesson.result, 0);
    assert.equal(lesson.complete, true);
    assert.equal(units(lesson).length, 0);
    assert.ok(lesson.entities.some(entity => entity.tags?.includes("llmx-math-marker")));
    assert.deepEqual(recoverLlmXMath({ entities: lesson.entities }).config, lesson.config);
  }
});

test("native commands validate, preserve unrelated objects, round-trip every step and need no animation behavior", () => {
  for (const operation of ["count", "add", "subtract"]) {
    let world = emptyWorld();
    const start = operation === "count" ? config(operation, 5) : config(operation, 5, 2);
    const original = structuredClone(world.entities[0]);
    const first = buildLlmXMath(start, zone);
    assert.deepEqual(first, buildLlmXMath(start, structuredClone(zone)), "building is deterministic");
    world = applyCommands(world, first.commands).definition;
    validateStoredSceneDefinition(world);
    for (let step = 0; step <= first.stepCount; step += 1) {
      const next = buildLlmXMath({ ...start, step }, zone);
      const commands = reconcileLlmXMathCommands(world, next);
      assert.ok(commands.every(command => ["spawn", "update", "remove"].includes(command.op)));
      assert.ok(commands.every(command => (command.id ?? command.entity.id).startsWith("llmx-created-math")));
      assert.equal(commands.filter(command => command.op === "spawn" && command.entity.tags?.includes("llmx-math-unit")).length, 0);
      if (commands.length) world = applyCommands(world, commands).definition;
      validateStoredSceneDefinition(world);
      const recovered = recoverLlmXMath(JSON.parse(JSON.stringify(world)));
      assert.deepEqual(recovered.config, next.config);
      assert.equal(recovered.result, next.result);
      assert.deepEqual(recovered.quantities, next.quantities);
      assert.deepEqual(reconcileLlmXMathCommands(world, recovered), [], "an unchanged lesson produces no history noise");
      assert.deepEqual(world.entities.find(entity => entity.id === original.id), original);
      assert.ok(next.entities.every(entity => !entity.behaviors && !entity.ephemeral && !entity.physics));
    }
  }
});

test("changing operation replaces only the workshop entities in an ordinary transaction", () => {
  const first = buildLlmXMath(config("add", 8, 12, 7), zone);
  const second = buildLlmXMath(config("subtract", 5, 2, 1), zone);
  const before = applyCommands(emptyWorld(), first.commands).definition;
  const after = applyCommands(before, reconcileLlmXMathCommands(before, second)).definition;
  assert.deepEqual(recoverLlmXMath(after).config, second.config);
  assert.equal(after.entities.length, second.entities.length + 1);
  assert.deepEqual(recoverLlmXMath(before).config, first.config, "the previous authored state remains an undo checkpoint");
});

test("recovery reads placement from the authored root and accepts the flattened runtime state", () => {
  const lesson = buildLlmXMath(config("add", 2, 3, 1), zone);
  const world = { entities: structuredClone(lesson.entities) };
  world.entities[0].transform.position = [9, 1, -4];
  world.entities[0].transform.scale = [2, 2, 2];
  const recovered = recoverLlmXMath(world);
  assert.deepEqual(recovered.buildZone, { center: [9, 1, -4], radius: 5.2 });
  // The real runtime reports child positions in WORLD space, rounded to three decimals;
  // scales and rotations remain local. Do not fake state() by flattening local positions.
  const rootTransform = world.entities[0].transform;
  const flattened = { entities: world.entities.map(({ transform, ...entity }) => ({
    ...entity, ...transform, parentId: entity.parentId ?? null,
    position: transform.position.map((value, axis) => Number((entity.parentId ? rootTransform.position[axis] + value * rootTransform.scale[axis] : value).toFixed(3))),
  })) };
  assert.deepEqual(recoverLlmXMath(flattened).config, lesson.config);
  assert.deepEqual(recoverLlmXMath(flattened).buildZone, recovered.buildZone);
  assert.deepEqual(reconcileLlmXMathCommands(flattened, recovered), []);
  assert.equal(recoverLlmXMath(emptyWorld()), null);
  assert.equal(recoverLlmXMath(null), null);
});

test("recovery refuses corrupt quantities and altered visible cubes rather than inventing a correct scene", () => {
  const lesson = buildLlmXMath(config("subtract", 5, 2, 1), zone);
  const changes = [
    world => world.entities.shift(),
    world => world.entities[0].tags.push("llmx-math:left:9"),
    world => world.entities[0].tags.splice(world.entities[0].tags.indexOf("llmx-math:left:5"), 1),
    world => { world.entities[0].transform.scale = [1, 2, 1]; },
    world => { world.entities[0].transform.rotationDegrees = [0, 45, 0]; },
    world => world.entities.splice(world.entities.findIndex(entity => entity.tags?.includes("llmx-math-unit")), 1),
    world => { units(world)[0].visible = false; },
    world => { units(world)[0].material.opacity = 0; },
    world => { units(world)[0].geometry = { width: 2 }; },
    world => { units(world)[0].transform.position[1] += 1; },
    world => { units(world)[0].transform.scale[0] *= 2; },
    world => { units(world)[0].tags.push("llmx-math:zone:elsewhere"); },
    world => { units(world)[0].tags.push("llmx-math:zone:elsewhere"); units(world)[0].tags = units(world)[0].tags.filter(tag => tag !== "llmx-math:zone:left"); },
    world => world.entities.push(structuredClone(units(world)[0])),
    world => world.entities.push({ id: 'foreign-cube', type: 'box', parentId: LLMX_MATH_ROOT_ID }),
    world => world.entities.push({ id: 'foreign-cube', type: 'box', parentId: units(world)[0].id }),
    world => { world.entities.find(entity => entity.tags?.includes("llmx-math-marker")).visible = false; },
    world => { world.entities.find(entity => entity.tags?.includes("llmx-math-marker")).transform.scale[0] *= 2; },
  ];
  for (const change of changes) {
    const world = { entities: structuredClone(lesson.entities) };
    change(world);
    assert.throws(() => recoverLlmXMath(world), LlmXMathError);
  }
  assert.throws(() => reconcileLlmXMathCommands({ entities: [{ id: LLMX_MATH_ROOT_ID, type: "group", tags: ["unrelated"] }] }, lesson), LlmXMathError);
  assert.ok(lesson.entities.every(entity => entity.tags.includes(LLMX_MATH_TAG)));
});

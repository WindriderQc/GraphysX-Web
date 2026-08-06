import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeInverseCommands, touchedEntityIds } from "../server/live-sessions.mjs";

const world = (...entities) => ({ schema: "graphysx.agent-world/v2", id: "w", label: "W", entities });
const box = (id, extra = {}) => ({ id, type: "box", label: id, ...extra });

describe("touchedEntityIds", () => {
  it("reports the id a spawn actually received, not the one it asked for", () => {
    assert.deepEqual(touchedEntityIds([{ op: "spawn", entity: box("wanted") }], [{ id: "granted" }]), ["granted"]);
  });

  it("reports every id a remove cascaded to", () => {
    const touched = touchedEntityIds([{ op: "remove", id: "parent" }], [{ ids: ["parent", "child", "grandchild"] }]);
    assert.deepEqual(touched.sort(), ["child", "grandchild", "parent"]);
  });

  it("names the environment so two environment edits collide", () => {
    // The environment is one shared slot with no entity id. Without a name for it, two
    // members restyling the sky would not be seen as touching the same thing, and an undo
    // would silently revert the other one's work — the exact outcome undo must never produce.
    assert.deepEqual(touchedEntityIds([{ op: "set-environment", environment: {} }], [{}]), ["@environment"]);
  });
});

describe("computeInverseCommands", () => {
  it("inverts a spawn with the granted id", () => {
    const inverse = computeInverseCommands(world(), [{ op: "spawn", entity: box("a") }], [{ id: "a" }]);
    assert.deepEqual(inverse, [{ op: "remove", id: "a" }]);
  });

  it("restores a removed subtree parent-first so the child can reference it", () => {
    // The document's own order is the constraint: respawning `child` before `parent` would
    // fail its parent reference. Sorting by original index is what guarantees it.
    const before = world(box("parent"), box("child", { parentId: "parent" }));
    const inverse = computeInverseCommands(
      before,
      [{ op: "remove", id: "parent" }],
      [{ ids: ["child", "parent"] }],
    );
    assert.equal(inverse.length, 2);
    assert.equal(inverse[0].entity.id, "parent");
    assert.equal(inverse[1].entity.id, "child");
  });

  it("restores removed entities by value, not by reference", () => {
    const before = world(box("a", { tags: ["keep"] }));
    const inverse = computeInverseCommands(before, [{ op: "remove", id: "a" }], [{ ids: ["a"] }]);
    inverse[0].entity.tags.push("mutated");
    assert.deepEqual(before.entities[0].tags, ["keep"], "the pre-state was aliased into the inverse");
  });

  it("inverts an update to the values the entity actually held", () => {
    const before = world(box("a", { label: "old", visible: true }));
    const inverse = computeInverseCommands(
      before,
      [{ op: "update", id: "a", patch: { label: "new", visible: false } }],
      [{ id: "a" }],
    );
    assert.deepEqual(inverse, [{ op: "update", id: "a", patch: { label: "old", visible: true } }]);
  });

  it("refuses an update that introduced a field, rather than guessing", () => {
    // Merge semantics have no command that removes a key. Inverting this approximately would
    // leave the document subtly different from where it started while reporting success.
    const before = world(box("a"));
    const inverse = computeInverseCommands(
      before,
      [{ op: "update", id: "a", patch: { tags: ["new-field"] } }],
      [{ id: "a" }],
    );
    assert.equal(inverse, null);
  });

  it("refuses when the entity an update names was not in the pre-state", () => {
    assert.equal(
      computeInverseCommands(world(), [{ op: "update", id: "ghost", patch: { label: "x" } }], [{ id: "ghost" }]),
      null,
    );
  });

  it("refuses when a spawn produced no id", () => {
    assert.equal(computeInverseCommands(world(), [{ op: "spawn", entity: box("a") }], [{}]), null);
  });

  it("refuses any command it cannot invert exactly", () => {
    for (const command of [
      { op: "attach-behavior", id: "a", behavior: { type: "spin" } },
      { op: "interact", id: "a" },
      { op: "steer", id: "a" },
    ]) {
      assert.equal(computeInverseCommands(world(box("a")), [command], [{}]), null, `${command.op} claimed to invert`);
    }
  });

  it("restores the whole environment slot, including an absent one", () => {
    const before = { ...world(), environment: { ground: { size: 40 } } };
    assert.deepEqual(
      computeInverseCommands(before, [{ op: "set-environment", environment: { ground: { size: 10 } } }], [{}]),
      [{ op: "set-environment", environment: { ground: { size: 40 } } }],
    );
    assert.deepEqual(
      computeInverseCommands(world(), [{ op: "set-environment", environment: {} }], [{}]),
      [{ op: "set-environment", environment: {} }],
    );
  });

  it("reverses a multi-command transaction so later work is undone first", () => {
    // Undoing "remove A, then spawn B" must despawn B before restoring A. Applying the
    // inverses in submission order would try to restore A while B still occupies the graph.
    const before = world(box("a"));
    const inverse = computeInverseCommands(
      before,
      [{ op: "remove", id: "a" }, { op: "spawn", entity: box("b") }],
      [{ ids: ["a"] }, { id: "b" }],
    );
    assert.deepEqual(inverse.map((command) => command.op), ["remove", "spawn"]);
    assert.equal(inverse[0].id, "b");
    assert.equal(inverse[1].entity.id, "a");
  });

  it("refuses the whole transaction when any single command is not invertible", () => {
    const before = world(box("a"));
    assert.equal(
      computeInverseCommands(
        before,
        [{ op: "spawn", entity: box("b") }, { op: "update", id: "a", patch: { tags: ["new"] } }],
        [{ id: "b" }, { id: "a" }],
      ),
      null,
      "a partially invertible transaction must not produce a partial inverse",
    );
  });
});

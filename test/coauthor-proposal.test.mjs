// The proposal is what a person reads before deciding whether an agent may change their
// scene. If it describes the commands inaccurately — wrong count, a missed entity, a stale
// revision reported as current — the human consents to something other than what happens.
// That makes this summary a correctness surface, not presentation, so it gets a test.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  commandEntityId,
  createProposal,
  describeCommand,
  includedCommands,
  isProposalEmpty,
  isProposalStale,
  summarizeProposal,
  toggleCommandInclusion,
} from "../src/coauthor-proposal.ts";

const actor = { id: "nestor", label: "Nestor", kind: "agent" };
const propose = (commands, expectedRevision = 12) =>
  createProposal({ actor, intent: "assemble a signal beacon", expectedRevision, commands });

describe("which entity a command touches", () => {
  it("reads the id from every command shape that has one", () => {
    assert.equal(commandEntityId({ op: "spawn", entity: { id: "beacon", type: "box" } }), "beacon");
    assert.equal(commandEntityId({ op: "update", id: "core", patch: {} }), "core");
    assert.equal(commandEntityId({ op: "remove", id: "old" }), "old");
    assert.equal(commandEntityId({ op: "interact", id: "console" }), "console");
    assert.equal(commandEntityId({ op: "steer", id: "ball", input: {} }), "ball");
    assert.equal(commandEntityId({ op: "attach-behavior", id: "ring", behavior: { type: "spin" } }), "ring");
    assert.equal(commandEntityId({ op: "detach-behavior", id: "ring", behaviorId: "b1" }), "ring");
    assert.equal(commandEntityId({ op: "spawn-prefab", prefabId: "beacon", options: { idPrefix: "sig" } }), "sig");
    assert.equal(commandEntityId({ op: "add-joint", joint: { id: "j1", bodyA: "a", bodyB: "b" } }), "j1");
    assert.equal(commandEntityId({ op: "update-joint", id: "j1", patch: {} }), "j1");
    assert.equal(commandEntityId({ op: "remove-joint", id: "j1" }), "j1");
  });

  it("returns null for commands that act on the world rather than an entity", () => {
    // These still appear in the preview — a change to the sky is exactly the sort of thing
    // someone wants to see coming — they just contribute no row to the touched list.
    assert.equal(commandEntityId({ op: "set-environment", environment: {} }), null);
    assert.equal(commandEntityId({ op: "select", ids: ["a", "b"] }), null);
  });
});

describe("proposal composition", () => {
  it("counts every command, including the ones that touch no entity", () => {
    const proposal = propose([
      { op: "spawn", entity: { id: "beacon", type: "box", label: "Signal beacon" } },
      { op: "set-environment", environment: {} },
    ]);
    assert.equal(proposal.commandCount, 2, "the count is of changes, not of entities");
    assert.equal(proposal.touches.length, 1);
  });

  it("lists entities in first-touch order, not sorted", () => {
    // The preview describes what is about to happen; the order it happens in is part of that.
    // Sorting would turn it into an inventory, which is a weaker and different claim.
    const proposal = propose([
      { op: "update", id: "zebra", patch: { visible: true } },
      { op: "spawn", entity: { id: "alpha", type: "box" } },
      { op: "remove", id: "middle" },
    ]);
    assert.deepEqual(proposal.touches.map((t) => t.id), ["zebra", "alpha", "middle"]);
  });

  it("reports each entity once, attributed to the first thing done to it", () => {
    const proposal = propose([
      { op: "spawn", entity: { id: "core", type: "sphere" } },
      { op: "update", id: "core", patch: { visible: true } },
      { op: "attach-behavior", id: "core", behavior: { type: "spin" } },
    ]);
    assert.deepEqual(proposal.touches, [{ id: "core", op: "spawn" }]);
    assert.equal(proposal.commandCount, 3, "three changes to one entity is still three changes");
  });

  it("carries the exact command list through, so accepting needs no translation", () => {
    const commands = [{ op: "remove", id: "old" }];
    const proposal = propose(commands);
    assert.deepEqual(proposal.commands, commands);
    assert.equal(proposal.expectedRevision, 12);
    assert.equal(proposal.actor.id, "nestor");
    assert.equal(proposal.intent, "assemble a signal beacon");
  });

  it("gives a proposal composed against a different revision a different identity", () => {
    // Two proposals with the same intent are not the same proposal if the world moved between
    // them; an id that ignored the revision would let a stale card be mistaken for a fresh one.
    assert.notEqual(propose([], 12).id, propose([], 13).id);
  });

  it("handles an empty command list without inventing a change", () => {
    const proposal = propose([]);
    assert.equal(proposal.commandCount, 0);
    assert.deepEqual(proposal.touches, []);
    assert.deepEqual(proposal.lines, []);
  });
});

describe("staleness", () => {
  it("is stale exactly when the world has moved", () => {
    const proposal = propose([{ op: "remove", id: "old" }], 12);
    assert.equal(isProposalStale(proposal, 12), false);
    assert.equal(isProposalStale(proposal, 13), true);
    // Backwards too: an undo moves the revision the other way and the proposal is just as void.
    assert.equal(isProposalStale(proposal, 11), true);
  });
});

describe("what a person actually reads", () => {
  it("describes each command in a sentence rather than dumping JSON", () => {
    assert.equal(
      describeCommand({ op: "spawn", entity: { id: "beacon", type: "box", label: "Signal beacon" } }),
      "Create Signal beacon (box)",
    );
    assert.equal(describeCommand({ op: "remove", id: "crate" }), "Delete crate");
    assert.equal(
      describeCommand({ op: "attach-behavior", id: "ring", behavior: { type: "spin" } }),
      "Give ring a spin behaviour",
    );
    assert.equal(describeCommand({ op: "set-environment", environment: {} }), "Change the environment");
  });

  it("falls back to the id when an entity has no label", () => {
    assert.equal(describeCommand({ op: "spawn", entity: { id: "beacon", type: "box" } }), "Create beacon (box)");
  });

  it("names the fields an update would change, and truncates a long list honestly", () => {
    assert.equal(
      describeCommand({ op: "update", id: "core", patch: { visible: true, transform: {} } }),
      "Change core: visible, transform",
    );
    assert.equal(
      describeCommand({ op: "update", id: "core", patch: { a: 1, b: 2, c: 3, d: 4, e: 5 } }),
      "Change core: a, b, c +2 more",
      "a truncated list must say how much it hid",
    );
  });

  it("gets singular and plural right, because the header is read every time", () => {
    assert.equal(summarizeProposal(propose([{ op: "remove", id: "a" }])), "1 change · 1 entity · from revision 12");
    assert.equal(
      summarizeProposal(propose([{ op: "remove", id: "a" }, { op: "remove", id: "b" }])),
      "2 changes · 2 entities · from revision 12",
    );
    assert.equal(describeCommand({ op: "select", ids: ["a"] }), "Select 1 entity");
    assert.equal(describeCommand({ op: "select", ids: ["a", "b"] }), "Select 2 entities");
  });

  it("omits the entity clause when nothing entity-shaped is touched", () => {
    assert.equal(
      summarizeProposal(propose([{ op: "set-environment", environment: {} }])),
      "1 change · from revision 12",
    );
  });
});

describe("narrowing a proposal", () => {
  const beacon = [
    { op: "spawn", entity: { id: "beacon", type: "box", label: "Beacon" } },
    { op: "update", id: "beacon", patch: { visible: true } },
    { op: "update", id: "showroom-nestor", patch: { agent: {} } },
  ];

  it("starts as the whole thing the agent asked for", () => {
    const proposal = propose(beacon);
    assert.deepEqual(proposal.excluded, []);
    assert.equal(includedCommands(proposal).length, 3);
    assert.equal(isProposalEmpty(proposal), false);
  });

  it("removes only the chosen command when nothing depends on it", () => {
    const narrowed = toggleCommandInclusion(propose(beacon), 2);
    assert.deepEqual(narrowed.excluded, [2]);
    assert.deepEqual(includedCommands(narrowed).map((c) => c.op), ["spawn", "update"]);
  });

  it("takes dependents out with the command that creates them", () => {
    // api.commit is atomic, so keeping "update beacon" without "spawn beacon" would fail
    // whole rather than corrupt anything — but failing whole after someone carefully
    // unchecked one line is a bad answer to hand them.
    const narrowed = toggleCommandInclusion(propose(beacon), 0);
    assert.deepEqual(narrowed.excluded, [0, 1]);
    assert.deepEqual(includedCommands(narrowed).map((c) => c.id), ["showroom-nestor"]);
  });

  it("brings the creator back when a dependent is re-included", () => {
    // The cascade has to work both ways, or the person can assemble a selection that cannot
    // commit — exactly what offering this control is supposed to prevent.
    const narrowed = toggleCommandInclusion(propose(beacon), 0);
    const restored = toggleCommandInclusion(narrowed, 1);
    assert.deepEqual(restored.excluded, [], "re-including the update must restore its spawn");
  });

  it("treats prefab children as dependents of the prefab", () => {
    const proposal = propose([
      { op: "spawn-prefab", prefabId: "signal-beacon", options: { idPrefix: "sig" } },
      { op: "update", id: "sig:ring", patch: { visible: true } },
      { op: "update", id: "other", patch: { visible: true } },
    ]);
    assert.deepEqual(toggleCommandInclusion(proposal, 0).excluded, [0, 1]);
  });

  it("treats both joint bodies as dependencies", () => {
    const proposal = propose([
      { op: "spawn", entity: { id: "anchor", type: "box" } },
      { op: "add-joint", joint: { id: "j1", bodyA: "anchor", bodyB: "weight" } },
    ]);
    assert.deepEqual(toggleCommandInclusion(proposal, 0).excluded, [0, 1]);
  });

  it("is its own inverse for an independent command", () => {
    const proposal = propose(beacon);
    const off = toggleCommandInclusion(proposal, 2);
    const on = toggleCommandInclusion(off, 2);
    assert.deepEqual(on.excluded, []);
  });

  it("never mutates the proposal it was given", () => {
    const proposal = propose(beacon);
    toggleCommandInclusion(proposal, 0);
    assert.deepEqual(proposal.excluded, [], "the original selection was modified in place");
  });

  it("ignores an index that is not a command", () => {
    const proposal = propose(beacon);
    assert.equal(toggleCommandInclusion(proposal, -1), proposal);
    assert.equal(toggleCommandInclusion(proposal, 99), proposal);
  });

  it("knows when nothing is left to apply", () => {
    let proposal = propose(beacon);
    for (const index of [0, 2]) proposal = toggleCommandInclusion(proposal, index);
    assert.equal(isProposalEmpty(proposal), true);
    assert.deepEqual(includedCommands(proposal), []);
  });

  it("summarises what would be sent, not what was composed", () => {
    const proposal = propose(beacon);
    assert.equal(summarizeProposal(proposal), "3 changes · 2 entities · from revision 12");
    const narrowed = toggleCommandInclusion(proposal, 2);
    assert.equal(
      summarizeProposal(narrowed),
      "2 changes · 1 entity · 1 removed · from revision 12",
      "a narrowed proposal must not read like a smaller one that arrived that way",
    );
  });
});

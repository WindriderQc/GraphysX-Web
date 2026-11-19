// Collaborative undo.
//
// The property under test is not "undo works". It is **undo never destroys someone else's
// work, and says so instead**. Every refusal below is a case where a snapshot-stack undo
// would have silently reverted a colleague, which is the outcome this design exists to make
// impossible.
//
// Undo here appends the inverse as a new operation rather than rewinding shared history, so
// every other client applies it through the ordinary path and the revision only ever moves
// forward.

import { mkdtemp, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { startSceneStore } from "../server/scene-store.mjs";
import { check, createActor, report, requestText, seedDefinition, spawnCommand, waitForStore } from "./live-session-harness.mjs";

const TOKEN = "live-undo-smoke-token";
const SCENE = "undo-fixture";
const results = [];
let store = null;
let dir = null;

try {
  dir = await mkdtemp(path.join(tmpdir(), "graphysx-undo-"));
  store = await startSceneStore({ port: 0, dir, token: TOKEN, origins: null, datalakeDir: null });
  const base = store.url;
  await waitForStore(base);

  await requestText(`${base}/scenes/${SCENE}`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ definition: seedDefinition(SCENE), actor: "smoke" }),
  });

  const founder = createActor(base, { storeToken: TOKEN });
  const created = await founder.call("POST", "/sessions", { sceneName: SCENE, owner: { id: "ada", label: "Ada" } });
  const sessionId = created.body.session.sessionId;
  const owner = createActor(base, { credential: created.body.credential });

  const invite = await owner.call("POST", `/sessions/${sessionId}/invites`, { role: "editor", ttlSeconds: 600, maxUses: 4 });
  const bobJoin = await createActor(base).call("POST", `/sessions/${sessionId}/join`, {
    code: invite.body.code, actor: { id: "bob", label: "Bob", kind: "human" },
  });
  const bob = createActor(base, { credential: bobJoin.body.credential });

  const snapshot = async () => (await owner.call("GET", `/sessions/${sessionId}/snapshot`)).body;
  const ids = async () => (await snapshot()).definition.entities.map((entity) => entity.id).sort();
  const submit = (actor, opId, commands, intent) =>
    actor.call("POST", `/sessions/${sessionId}/ops`, { opId, commands, ...(intent ? { intent } : {}) });
  const undo = (actor, opId) => actor.call("POST", `/sessions/${sessionId}/ops/${opId}/undo`, {});

  // --- 1. spawn / undo ---------------------------------------------------------------------

  const before = await snapshot();
  const spawned = await submit(owner, "op-spawn", [spawnCommand("ada-crate")], "ada adds a crate");
  check(results, "an operation applies", spawned.status === 201, `status ${spawned.status}`);
  check(results, "the entity is there", (await ids()).includes("ada-crate"));

  const undone = await undo(owner, "op-spawn");
  check(results, "an actor can undo their own spawn", undone.status === 201, `status ${undone.status} ${JSON.stringify(undone.body).slice(0, 160)}`);
  check(results, "the entity is gone again", !(await ids()).includes("ada-crate"));
  check(results, "the document is back to exactly where it started",
    JSON.stringify((await snapshot()).definition) === JSON.stringify(before.definition), "document differs after undo");

  const afterUndo = await snapshot();
  check(results, "undo moved the revision FORWARD, it did not rewind",
    afterUndo.revision > spawned.body.revision, `${spawned.body.revision} -> ${afterUndo.revision}`);
  check(results, "the undo is attributed and named as an undo",
    undone.body.undoOf === "op-spawn", JSON.stringify(undone.body));

  const repeat = await undo(owner, "op-spawn");
  check(results, "undoing twice is refused rather than applied twice",
    repeat.status === 409 && repeat.body.code === "undo-already-done", `status ${repeat.status}`);

  // --- 2. the case this design exists for ---------------------------------------------------
  //
  // Ada changes an entity, Bob changes the same entity afterwards. A snapshot-stack undo
  // would revert Bob. This must refuse and name him.

  await submit(owner, "op-shared-spawn", [spawnCommand("shared-crate")]);
  await submit(owner, "op-ada-edit", [{ op: "update", id: "shared-crate", patch: { label: "Ada's label" } }]);
  await submit(bob, "op-bob-edit", [{ op: "update", id: "shared-crate", patch: { label: "Bob's label" } }]);

  const unsafe = await undo(owner, "op-ada-edit");
  check(results, "undo is refused when a later actor touched the same entity",
    unsafe.status === 409 && unsafe.body.code === "undo-unsafe", `status ${unsafe.status} ${JSON.stringify(unsafe.body).slice(0, 200)}`);
  check(results, "the refusal names who is in the way",
    unsafe.body.blockedBy?.actorId === "bob", JSON.stringify(unsafe.body.blockedBy));
  const survived = await snapshot();
  check(results, "the later actor's work is untouched by the refused undo",
    survived.definition.entities.find((entity) => entity.id === "shared-crate")?.label === "Bob's label",
    survived.definition.entities.find((entity) => entity.id === "shared-crate")?.label);

  // Bob can still undo his own, because nothing came after it.
  const bobUndo = await undo(bob, "op-bob-edit");
  check(results, "the most recent actor can undo their own edit", bobUndo.status === 201, `status ${bobUndo.status}`);
  const restored = await snapshot();
  check(results, "undoing an update restores the previous value exactly",
    restored.definition.entities.find((entity) => entity.id === "shared-crate")?.label === "Ada's label",
    restored.definition.entities.find((entity) => entity.id === "shared-crate")?.label);

  // --- 3. you may only undo your own ---------------------------------------------------------

  const notYours = await undo(bob, "op-shared-spawn");
  check(results, "an actor cannot undo someone else's operation",
    notYours.status === 403 && notYours.body.code === "undo-not-yours", `status ${notYours.status}`);
  check(results, "the refusal says whose it is", /Ada/.test(notYours.body.error ?? ""), notYours.body?.error);

  // --- 4. removal and its descendants ----------------------------------------------------------

  await submit(owner, "op-parent", [{ op: "spawn", entity: { id: "parent-crate", type: "box", label: "Parent" } }]);
  await submit(owner, "op-child", [{ op: "spawn", entity: { id: "child-crate", type: "box", label: "Child", parentId: "parent-crate" } }]);
  const beforeRemove = await snapshot();
  const removed = await submit(owner, "op-remove-parent", [{ op: "remove", id: "parent-crate" }]);
  check(results, "removing a parent takes the child with it",
    !(await ids()).includes("child-crate") && !(await ids()).includes("parent-crate"), (await ids()).join(","));

  const undoRemove = await undo(owner, "op-remove-parent");
  check(results, "undoing a removal restores every entity it deleted",
    undoRemove.status === 201 && (await ids()).includes("parent-crate") && (await ids()).includes("child-crate"),
    `status ${undoRemove.status} ${(await ids()).join(",")}`);
  const afterRestore = await snapshot();
  check(results, "the restored child still points at its parent",
    afterRestore.definition.entities.find((entity) => entity.id === "child-crate")?.parentId === "parent-crate",
    JSON.stringify(afterRestore.definition.entities.find((entity) => entity.id === "child-crate")));
  check(results, "the removal undo restores the document exactly",
    JSON.stringify(afterRestore.definition.entities.map((e) => e.id).sort())
      === JSON.stringify(beforeRemove.definition.entities.map((e) => e.id).sort()),
    "entity set differs");
  void removed;

  // --- 5. what cannot be inverted is refused, not approximated -------------------------------

  await submit(owner, "op-plain", [{ op: "spawn", entity: { id: "plain-crate", type: "box", label: "Plain" } }]);
  // `visible` is a valid patch field but absent before this patch, and no command removes a
  // key — so the inverse cannot restore the original exactly and the server must say so.
  const introduces = await submit(owner, "op-introduce", [{ op: "update", id: "plain-crate", patch: { visible: false } }]);
  check(results, "an operation that introduces a field applies normally", introduces.status === 201, `status ${introduces.status}`);
  const cannot = await undo(owner, "op-introduce");
  check(results, "an operation that cannot be inverted exactly is refused, not approximated",
    cannot.status === 422 && cannot.body.code === "undo-not-invertible", `status ${cannot.status} ${JSON.stringify(cannot.body).slice(0, 160)}`);

  // --- 6. environment --------------------------------------------------------------------------

  const envBefore = (await snapshot()).definition.environment;
  await submit(owner, "op-env", [{ op: "set-environment", environment: { ground: { size: 999 } } }]);
  const envUndo = await undo(owner, "op-env");
  check(results, "an environment change can be undone", envUndo.status === 201, `status ${envUndo.status}`);
  check(results, "the previous environment is restored exactly",
    JSON.stringify((await snapshot()).definition.environment) === JSON.stringify(envBefore),
    JSON.stringify((await snapshot()).definition.environment));

  // --- 7. undo is a normal operation to everyone else -------------------------------------------

  await bob.connect(sessionId);
  await submit(owner, "op-watched", [spawnCommand("watched-crate")]);
  await bob.waitFor((r) => r.ops.some((op) => op.opId === "op-watched"), { label: "bob sees the spawn" });
  const watchedUndo = await undo(owner, "op-watched");
  await bob.waitFor((r) => r.ops.some((op) => op.opId === watchedUndo.body.opId), { label: "bob sees the undo" });
  const relayed = bob.received.ops.find((op) => op.opId === watchedUndo.body.opId);
  check(results, "an undo reaches other members as an ordinary attributed operation",
    relayed?.actorId === "ada" && Array.isArray(relayed.commands), JSON.stringify(relayed?.intent));
  check(results, "the relayed undo says what it undid", /undid:/.test(relayed?.intent ?? ""), relayed?.intent);
  await bob.disconnect();

  // --- 8. a viewer cannot undo -------------------------------------------------------------------

  const viewerInvite = await owner.call("POST", `/sessions/${sessionId}/invites`, { role: "viewer", ttlSeconds: 600 });
  const viewerJoin = await createActor(base).call("POST", `/sessions/${sessionId}/join`, {
    code: viewerInvite.body.code, actor: { id: "cleo", label: "Cleo", kind: "human" },
  });
  const viewerUndo = await undo(createActor(base, { credential: viewerJoin.body.credential }), "op-parent");
  check(results, "a viewer cannot undo anything", viewerUndo.status === 403, `status ${viewerUndo.status}`);

  const unknown = await undo(owner, "op-never-existed");
  check(results, "undoing an unknown operation is a clean refusal",
    unknown.status === 410 && unknown.body.code === "undo-expired", `status ${unknown.status}`);

  // These fixtures isolate revisions and exercise the durable scene through HTTP.
  const fixture = async (name, entities, environment = {}) => {
    const route = `/scenes/${name}`;
    const seeded = await founder.call("PUT", route, {
      definition: { ...seedDefinition(name), entities, environment },
    });
    assert.equal(seeded.status, 201, seeded.body.error);
    const opened = await founder.call("POST", "/sessions", { sceneName: name, owner: { id: "ada", label: "Ada" } });
    assert.equal(opened.status, 201, opened.body.error);
    const session = `/sessions/${opened.body.session.sessionId}`;
    const ada = createActor(base, { credential: opened.body.credential });
    const invitation = await ada.call("POST", `${session}/invites`, { role: "editor", ttlSeconds: 600 });
    const joined = await createActor(base).call("POST", `${session}/join`, {
      code: invitation.body.code, actor: { id: "bob", label: "Bob" },
    });
    assert.equal(joined.status, 201, joined.body.error);
    const editor = createActor(base, { credential: joined.body.credential });
    return {
      submit: (opId, commands, actor = ada) => actor.call("POST", `${session}/ops`, { opId, commands }),
      undo: id => ada.call("POST", `${session}/ops/${id}/undo`, {}),
      read: async () => (await founder.call("GET", route)).body,
      external: commands => founder.call("POST", `${route}/changes`, { commands, actor: "outside" }),
      editor,
    };
  };
  const box = (id, values = {}) => ({ id, type: "box", label: id, ...values });
  const update = (id, patch) => ({ op: "update", id, patch });
  const remove = id => ({ op: "remove", id });
  async function expectUnchangedAfterRefusal(world, id, status, code) {
    const before = await world.read();
    const refusal = await world.undo(id);
    assert.equal(refusal.status, status, JSON.stringify(refusal.body));
    assert.equal(refusal.body.code, code);
    assert.deepEqual(await world.read(), before, "an undo refusal must preserve both revision and document");
  }

  const externalWorld = await fixture("undo-external-cut", [box("crate")]);
  assert.equal((await externalWorld.submit("rename", [update("crate", { label: "Ada" })])).status, 201);
  assert.equal((await externalWorld.external([update("crate", { label: "Outside" })])).status, 200);
  await expectUnchangedAfterRefusal(externalWorld, "rename", 409, "undo-unsafe");
  assert.equal((await externalWorld.submit("after-cut", [update("crate", { label: "Ada again" })])).status, 201);
  assert.equal((await externalWorld.undo("after-cut")).status, 201);
  assert.equal((await externalWorld.read()).definition.entities[0].label, "Outside");
  check(results, "an external revision bars older undo and preserves the new baseline", true);

  const childWorld = await fixture("undo-later-descendants", []);
  assert.equal((await childWorld.submit("parent", [spawnCommand("parent")])).status, 201);
  assert.equal((await childWorld.submit("bob-child", [
    { op: "spawn", entity: box("middle", { parentId: "parent" }) },
    { op: "spawn", entity: box("child", { parentId: "middle" }) },
  ], childWorld.editor)).status, 201);
  await expectUnchangedAfterRefusal(childWorld, "parent", 409, "undo-unsafe");
  assert.equal((await childWorld.submit("independent", [spawnCommand("separate")])).status, 201);
  assert.equal((await childWorld.submit("bob-independent", [spawnCommand("other")], childWorld.editor)).status, 201);
  assert.equal((await childWorld.undo("independent")).status, 201);
  assert.ok((await childWorld.read()).definition.entities.some(entity => entity.id === "other"));
  check(results, "undo refuses to cascade into later descendants and allows independent work", true);

  const nestedWorld = await fixture("undo-new-nested-field", [box("crate", { material: { color: "#123456" } })]);
  assert.equal((await nestedWorld.submit("paint", [update("crate", { material: { roughness: 0.25 } })])).status, 201);
  await expectUnchangedAfterRefusal(nestedWorld, "paint", 422, "undo-not-invertible");
  check(results, "an undo that cannot remove a nested material key is refused atomically", true);

  const environmentWorld = await fixture("undo-new-environment-field", []);
  assert.equal((await environmentWorld.submit("light", [
    { op: "set-environment", environment: { background: "#123456" } },
  ])).status, 201);
  await expectUnchangedAfterRefusal(environmentWorld, "light", 422, "undo-not-invertible");
  check(results, "an undo that cannot remove the new environment key is refused atomically", true);

  const mesh = { positions: Array(4096 * 3).fill(0), indices: [0, 1, 2] };
  mesh.positions[3] = 1;
  mesh.positions[7] = 1;
  const meshes = Array.from({ length: 8 }, (_, i) => ({ id: `mesh-${i}`, type: "mesh", mesh }));
  meshes[7].parentId = "parent";
  const meshWorld = await fixture("commit-cascade-mesh", [...meshes.slice(0, 7), box("parent"), meshes[7]]);
  const meshBefore = await meshWorld.read();
  const batch = [
    remove("parent"),
    { op: "spawn", entity: { id: "new-mesh", type: "mesh" }, meshBuild: { kind: "extrude", profile: [[0, 0], [1, 0], [0, 1]], depth: 1 } },
  ];
  const committed = await meshWorld.submit("mesh-replacement", batch);
  assert.equal(committed.status, 201, JSON.stringify(committed.body));
  const meshAfter = await meshWorld.read();
  assert.equal(meshAfter.revision, meshBefore.revision + 1);
  assert.deepEqual(meshAfter.definition.entities.map(entity => entity.id), [...meshes.slice(0, 7).map(entity => entity.id), "new-mesh"]);
  const replayed = await meshWorld.submit("mesh-replacement", batch);
  assert.equal(replayed.status, 200, JSON.stringify(replayed.body));
  assert.deepEqual(replayed.body, { ...committed.body, duplicate: true });
  assert.deepEqual(await meshWorld.read(), meshAfter);
  assert.equal((await meshWorld.undo("mesh-replacement")).status, 201);
  assert.deepEqual((await meshWorld.read()).definition, meshBefore.definition);
  check(results, "mesh replacement at capacity commits once, replays its receipt and undoes exactly", true);

  const jointWorld = await fixture("undo-cascaded-joint", [
    box("base", { physics: { mode: "static" } }),
    box("body", { physics: { mode: "dynamic", mass: 1 } }),
  ]);
  assert.equal((await jointWorld.submit("add-joint", [
    { op: "add-joint", joint: { id: "hinge", type: "fixed", bodyA: "body", bodyB: "base" } },
  ])).status, 201);
  const jointBefore = await jointWorld.read();
  assert.equal((await jointWorld.submit("remove-body", [remove("body")])).status, 201);
  assert.deepEqual((await jointWorld.read()).definition.joints, []);
  assert.equal((await jointWorld.undo("remove-body")).status, 201);
  assert.deepEqual((await jointWorld.read()).definition, jointBefore.definition);
  check(results, "undo of body removal restores its original joint and the exact document", true);
} catch (error) {
  check(results, "smoke-live-undo threw", false, error instanceof Error ? error.stack : String(error));
} finally {
  if (store) await store.close();
  if (dir) await rm(dir, { recursive: true, force: true });
}

report(results, "smoke-live-undo");

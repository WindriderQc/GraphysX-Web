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
} catch (error) {
  check(results, "smoke-live-undo threw", false, error instanceof Error ? error.stack : String(error));
} finally {
  if (store) await store.close();
  if (dir) await rm(dir, { recursive: true, force: true });
}

report(results, "smoke-live-undo");

// Live Sessions: three actors, one scene, one revision line.
//
// Owner (human) + remote editor (human) + agent, all against a real store over real HTTP
// and real SSE. What this has to prove is not that the endpoints respond — it is that the
// three of them stay *in agreement*: same revision, same document, same order of events,
// and that every way they can fall out of agreement (a duplicate, a stale base revision, a
// dropped connection, an evicted history) has a defined, tested outcome rather than a
// silent divergence.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startSceneStore } from "../server/scene-store.mjs";
import { check, createActor, report, seedDefinition, sleep, spawnCommand } from "./live-session-harness.mjs";

const TOKEN = "live-session-smoke-token";
const SCENE = "live-fixture";
const results = [];
let store = null;
let dir = null;

const fail = (message, error) => {
  check(results, message, false, error instanceof Error ? error.message : String(error));
};

try {
  dir = await mkdtemp(path.join(tmpdir(), "graphysx-live-"));
  store = await startSceneStore({ port: 0, dir, token: TOKEN, origins: null, datalakeDir: null });
  const base = store.url;

  // Seed the scene the session will be scoped to.
  const seeded = await fetch(`${base}/scenes/${SCENE}`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ definition: seedDefinition(), actor: "smoke" }),
  });
  check(results, "fixture scene seeded", seeded.status === 201, `status ${seeded.status}`);

  const health = await (await fetch(`${base}/health`)).json();
  check(results, "health reports live sessions enabled", health.sessions?.enabled === true, JSON.stringify(health.sessions));

  // --- 1. session lifecycle ------------------------------------------------------------

  const founder = createActor(base, { storeToken: TOKEN });
  const created = await founder.call("POST", "/sessions", {
    sceneName: SCENE,
    label: "Smoke session",
    owner: { id: "owner-ada", label: "Ada" },
  });
  check(results, "owner creates a session", created.status === 201, `status ${created.status} ${created.text.slice(0, 200)}`);
  const sessionId = created.body?.session?.sessionId;
  const ownerCredential = created.body?.credential;
  check(results, "session issues an owner credential once", typeof ownerCredential === "string" && ownerCredential.includes("."), "no credential");
  check(results, "session view carries no secret", !JSON.stringify(created.body.session).includes(ownerCredential.split(".")[1]), "secret leaked into session view");

  const owner = createActor(base, { credential: ownerCredential });

  // A session cannot be created without the store token — owner authority is not a claim
  // the client gets to make about itself.
  const anonCreate = await createActor(base).call("POST", "/sessions", { sceneName: SCENE, owner: { id: "mallory" } });
  check(results, "session creation without the store token -> 401", anonCreate.status === 401, `status ${anonCreate.status}`);

  // --- 2. invitations ------------------------------------------------------------------

  const editorInvite = await owner.call("POST", `/sessions/${sessionId}/invites`, { role: "editor", ttlSeconds: 300 });
  check(results, "owner mints an editor invitation", editorInvite.status === 201, `status ${editorInvite.status} ${editorInvite.text.slice(0, 200)}`);
  check(results, "invitation view carries no secret", !JSON.stringify(editorInvite.body.invite).includes(editorInvite.body.code.split(".")[1]), "invite secret leaked");

  const viewerInvite = await owner.call("POST", `/sessions/${sessionId}/invites`, { role: "viewer", ttlSeconds: 300 });
  const agentInvite = await owner.call("POST", `/sessions/${sessionId}/invites`, {
    role: "agent",
    ttlSeconds: 300,
    capabilities: ["transaction", "spawn"],
  });
  check(results, "agent invitation requires explicit capabilities", agentInvite.status === 201, agentInvite.text.slice(0, 200));
  const unscopedAgent = await owner.call("POST", `/sessions/${sessionId}/invites`, { role: "agent", ttlSeconds: 300 });
  check(results, "agent invitation without capabilities -> 400", unscopedAgent.status === 400, `status ${unscopedAgent.status}`);
  const ownerInvite = await owner.call("POST", `/sessions/${sessionId}/invites`, { role: "owner", ttlSeconds: 300 });
  check(results, "an invitation cannot grant ownership", ownerInvite.status === 400, `status ${ownerInvite.status}`);

  // An editor may not mint invitations — checked after they join, below.

  const joinAs = async (code, actor) => {
    const joined = await createActor(base).call("POST", `/sessions/${sessionId}/join`, { code, actor });
    return joined;
  };

  const editorJoin = await joinAs(editorInvite.body.code, { id: "editor-bob", label: "Bob", kind: "human" });
  check(results, "valid invitation joins as editor", editorJoin.status === 201 && editorJoin.body.member.role === "editor", `status ${editorJoin.status}`);
  const editor = createActor(base, { credential: editorJoin.body.credential });

  const viewerJoin = await joinAs(viewerInvite.body.code, { id: "viewer-cleo", label: "Cleo", kind: "human" });
  const viewer = createActor(base, { credential: viewerJoin.body.credential });
  check(results, "valid invitation joins as viewer", viewerJoin.status === 201 && viewerJoin.body.member.role === "viewer", `status ${viewerJoin.status}`);

  const agentJoin = await joinAs(agentInvite.body.code, { id: "agent-x", label: "AgentX", kind: "agent" });
  const agent = createActor(base, { credential: agentJoin.body.credential });
  check(results, "agent invitation joins as agent", agentJoin.status === 201 && agentJoin.body.member.role === "agent", `status ${agentJoin.status}`);

  const spentReuse = await joinAs(editorInvite.body.code, { id: "editor-dup", kind: "human" });
  check(results, "a single-use invitation cannot be redeemed twice", spentReuse.status === 403, `status ${spentReuse.status}`);

  const editorInvites = await editor.call("POST", `/sessions/${sessionId}/invites`, { role: "editor" });
  check(results, "an editor may not mint invitations", editorInvites.status === 403, `status ${editorInvites.status}`);

  // --- 3. streams and presence ---------------------------------------------------------

  const ownerHello = await owner.connect(sessionId);
  const editorHello = await editor.connect(sessionId);
  const agentHello = await agent.connect(sessionId);
  check(results, "each actor's stream opens with a hello", Boolean(ownerHello && editorHello && agentHello), "missing hello");
  check(results, "hello reports the member's own role", ownerHello.role === "owner" && editorHello.role === "editor" && agentHello.role === "agent", "role mismatch");

  await owner.waitFor((r) => r.presence.at(-1)?.members?.length >= 4, { label: "four members present" });
  const roster = owner.received.presence.at(-1).members;
  check(results, "every actor sees the others in presence", roster.length === 4, `roster ${roster.length}`);
  check(results, "presence roster carries no credential material",
    !JSON.stringify(roster).includes(ownerCredential.split(".")[1]), "credential in roster");

  const revisionBeforePresence = (await owner.call("GET", `/sessions/${sessionId}/snapshot`)).body.revision;
  const presencePost = await editor.call("POST", `/sessions/${sessionId}/presence`, {
    cursor: { x: 2, y: 1, z: -3 },
    selection: ["anchor"],
    tool: "translate",
    color: "#44ddaa",
  });
  check(results, "an editor may publish presence", presencePost.status === 200, `status ${presencePost.status}`);
  await owner.waitFor((r) => r.presence.at(-1)?.members?.some((m) => m.actorId === "editor-bob" && m.presence?.selection?.[0] === "anchor"),
    { label: "remote selection visible" });
  check(results, "remote selection appears to the owner", true);

  const revisionAfterPresence = (await owner.call("GET", `/sessions/${sessionId}/snapshot`)).body.revision;
  check(results, "presence does not increment the scene revision", revisionBeforePresence === revisionAfterPresence,
    `${revisionBeforePresence} -> ${revisionAfterPresence}`);

  const badCursor = await editor.call("POST", `/sessions/${sessionId}/presence`, { cursor: { x: 1, y: Number.NaN, z: 0 } });
  check(results, "a non-finite presence cursor is rejected", badCursor.status === 400, `status ${badCursor.status}`);

  // --- 4. live collaboration -----------------------------------------------------------

  const snapshot = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "a member can take a snapshot", snapshot.status === 200 && snapshot.body.definition.schema === "graphysx.agent-world/v2", `status ${snapshot.status}`);
  let revision = snapshot.body.revision;

  const ownerOp = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-owner-1",
    baseRevision: revision,
    path: "transaction",
    commands: [spawnCommand("owner-crate")],
    intent: "owner adds a crate",
  });
  check(results, "owner submits an operation", ownerOp.status === 201, `status ${ownerOp.status} ${ownerOp.text.slice(0, 200)}`);
  revision = ownerOp.body.revision;

  await editor.waitFor((r) => r.ops.some((op) => op.opId === "op-owner-1"), { label: "editor receives owner op" });
  await agent.waitFor((r) => r.ops.some((op) => op.opId === "op-owner-1"), { label: "agent receives owner op" });
  const seenByEditor = editor.received.ops.find((op) => op.opId === "op-owner-1");
  check(results, "the owner's operation reaches the editor without a reload", Boolean(seenByEditor));
  check(results, "the relayed operation carries commands, not a whole document",
    Array.isArray(seenByEditor.commands) && seenByEditor.commands.length === 1 && !("definition" in seenByEditor),
    "expected an incremental command list");
  check(results, "the relayed operation is actor-attributed",
    seenByEditor.actorId === "owner-ada" && seenByEditor.actorKind === "human" && seenByEditor.role === "owner",
    JSON.stringify({ actorId: seenByEditor.actorId, kind: seenByEditor.actorKind }));

  const editorOp = await editor.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-editor-1",
    baseRevision: revision,
    commands: [{ op: "update", id: "owner-crate", patch: { label: "Bob renamed it" } }],
  });
  check(results, "editor mutates what the owner made", editorOp.status === 201, `status ${editorOp.status} ${editorOp.text.slice(0, 200)}`);
  revision = editorOp.body.revision;
  await owner.waitFor((r) => r.ops.some((op) => op.opId === "op-editor-1"), { label: "owner receives editor op" });
  check(results, "the editor's change reaches the owner without a reload", true);

  const agentOp = await agent.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-agent-1",
    baseRevision: revision,
    path: "spawn",
    commands: [spawnCommand("agent-crate")],
  });
  check(results, "agent mutates within its scoped capability", agentOp.status === 201, `status ${agentOp.status} ${agentOp.text.slice(0, 200)}`);
  revision = agentOp.body.revision;
  await owner.waitFor((r) => r.ops.some((op) => op.opId === "op-agent-1"), { label: "owner receives agent op" });
  await editor.waitFor((r) => r.ops.some((op) => op.opId === "op-agent-1"), { label: "editor receives agent op" });
  check(results, "the agent's mutation reaches both humans", true);
  check(results, "the agent's operation is attributed as an agent",
    owner.received.ops.find((op) => op.opId === "op-agent-1")?.actorKind === "agent", "wrong actor kind");

  const outOfScope = await agent.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-agent-scope",
    commands: [{ op: "remove", id: "agent-crate" }],
    path: "remove",
  });
  check(results, "an agent cannot call a tool it is not scoped to", outOfScope.status === 403, `status ${outOfScope.status}`);

  const viewerOp = await viewer.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-viewer-1",
    commands: [spawnCommand("viewer-crate")],
  });
  check(results, "a viewer cannot mutate", viewerOp.status === 403, `status ${viewerOp.status}`);

  const arbitraryPath = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-path-walk",
    path: "constructor.prototype",
    commands: [spawnCommand("nope")],
  });
  check(results, "an arbitrary tool path is rejected", arbitraryPath.status === 400, `status ${arbitraryPath.status}`);

  // All three agree, and the store agrees with all three.
  const finalOwner = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  const finalEditor = await editor.call("GET", `/sessions/${sessionId}/snapshot`);
  const finalAgent = await agent.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "all three actors read the same revision",
    finalOwner.body.revision === finalEditor.body.revision && finalEditor.body.revision === finalAgent.body.revision,
    `${finalOwner.body.revision}/${finalEditor.body.revision}/${finalAgent.body.revision}`);
  check(results, "all three actors read the identical document",
    JSON.stringify(finalOwner.body.definition) === JSON.stringify(finalEditor.body.definition) &&
    JSON.stringify(finalEditor.body.definition) === JSON.stringify(finalAgent.body.definition),
    "documents diverged");
  const storeRecord = await (await fetch(`${base}/scenes/${SCENE}`)).json();
  check(results, "the session's document is the stored document",
    JSON.stringify(storeRecord.definition) === JSON.stringify(finalOwner.body.definition), "session and store diverged");
  check(results, "the store records the operating actor, not the session",
    storeRecord.actor === "agent-x", `actor ${storeRecord.actor}`);

  // --- 5. duplicates and conflicts -----------------------------------------------------

  const entitiesBefore = finalOwner.body.definition.entities.length;
  const duplicate = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-owner-1",
    baseRevision: 999,
    commands: [spawnCommand("owner-crate")],
  });
  check(results, "a duplicated operation id returns its original receipt", duplicate.status === 200 && duplicate.body.duplicate === true, `status ${duplicate.status}`);
  check(results, "a duplicated operation id does not apply twice",
    duplicate.body.revision === ownerOp.body.revision, `${duplicate.body.revision} vs ${ownerOp.body.revision}`);
  const afterDuplicate = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "the document is unchanged by the duplicate",
    afterDuplicate.body.definition.entities.length === entitiesBefore, "entity count moved");

  const stale = await editor.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-stale-1",
    baseRevision: 1,
    commands: [spawnCommand("stale-crate")],
  });
  check(results, "a stale base revision is a structured 409", stale.status === 409 && stale.body.code === "revision-conflict", `status ${stale.status} ${stale.text.slice(0, 160)}`);
  check(results, "the conflict names the current revision and a resync path",
    stale.body.revision === afterDuplicate.body.revision && typeof stale.body.resync === "string",
    JSON.stringify({ revision: stale.body.revision, resync: stale.body.resync }));
  const afterConflict = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "a rejected operation does not touch the document",
    JSON.stringify(afterConflict.body.definition) === JSON.stringify(afterDuplicate.body.definition), "document changed on conflict");

  const invalidOp = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-invalid-1",
    commands: [{ op: "update", id: "does-not-exist", patch: { label: "ghost" } }],
  });
  check(results, "an operation against a missing entity is rejected, not applied",
    invalidOp.status === 422 && invalidOp.body.code === "operation-rejected", `status ${invalidOp.status}`);

  const ephemeralOp = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-ephemeral-1",
    commands: [{ op: "spawn", entity: { id: "thrown-ball", type: "sphere", ephemeral: true } }],
  });
  check(results, "session-only entities cannot be written into the document", ephemeralOp.status === 422, `status ${ephemeralOp.status}`);

  // --- 6. reconnect, resume and resync -------------------------------------------------

  const seqBeforeDrop = editor.lastSeq;
  await editor.disconnect();
  await sleep(50);
  const whileAway = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-while-away",
    commands: [spawnCommand("missed-crate")],
  });
  check(results, "the owner keeps working while the editor is disconnected", whileAway.status === 201, `status ${whileAway.status}`);

  const resumeHello = await editor.connect(sessionId, { since: seqBeforeDrop });
  check(results, "a reconnecting client reports a resume", resumeHello.resumed === true && resumeHello.mustResync === false, JSON.stringify(resumeHello));
  await editor.waitFor((r) => r.ops.some((op) => op.opId === "op-while-away"), { label: "editor replays the missed op" });
  check(results, "a reconnecting client receives the operations it missed", true);
  check(results, "a reconnecting client is handed a fresh presence snapshot",
    editor.received.presence.at(-1)?.members?.length >= 4, "no presence on resume");

  // History it can no longer be told about honestly: ask from a sequence the ring cannot
  // prove, and the server must say so rather than imply continuity.
  await editor.disconnect();
  const staleResume = await editor.connect(sessionId, { since: 1 });
  const oldestRetained = editor.received.hello;
  check(results, "resuming from within the retained window still resumes", oldestRetained.resumed === true, JSON.stringify(oldestRetained));
  await editor.disconnect();
  const impossibleResume = await editor.connect(sessionId, { since: 10_000 });
  check(results, "resuming from a sequence ahead of the server demands a resync",
    impossibleResume.mustResync === true, JSON.stringify(impossibleResume));
  void staleResume;

  const resyncOwner = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  const resyncEditor = await editor.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "an explicit resync returns every client to identical state",
    JSON.stringify(resyncOwner.body.definition) === JSON.stringify(resyncEditor.body.definition) &&
    resyncOwner.body.revision === resyncEditor.body.revision, "resync diverged");

  // --- 7. membership management and teardown -------------------------------------------

  const removeViewer = await owner.call("DELETE", `/sessions/${sessionId}/members/${viewerJoin.body.member.memberId}`);
  check(results, "an owner can remove a member", removeViewer.status === 200, `status ${removeViewer.status}`);
  const revokedRead = await viewer.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "a removed member's credential stops working", revokedRead.status === 401, `status ${revokedRead.status}`);

  const editorRemovesOwner = await editor.call("DELETE", `/sessions/${sessionId}/members/${created.body.member.memberId}`);
  check(results, "a non-owner cannot remove members", editorRemovesOwner.status === 403, `status ${editorRemovesOwner.status}`);

  await editor.disconnect();
  await agent.disconnect();
  await sleep(80);
  const afterLeave = await owner.call("GET", `/sessions/${sessionId}`);
  const stillOnline = afterLeave.body.session.members.filter((member) => member.online).map((member) => member.actorId);
  check(results, "a disconnected member is reported offline, not stuck online",
    stillOnline.length === 1 && stillOnline[0] === "owner-ada", `online: ${stillOnline.join(", ") || "none"}`);

  await owner.disconnect();
  const deleted = await owner.call("DELETE", `/sessions/${sessionId}`);
  check(results, "an owner can close the session", deleted.status === 200, `status ${deleted.status}`);
  const afterClose = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "a closed session is gone", afterClose.status === 404, `status ${afterClose.status}`);

  const survivingScene = await (await fetch(`${base}/scenes/${SCENE}`)).json();
  check(results, "closing a session leaves the authored scene intact",
    survivingScene.definition.entities.some((entity) => entity.id === "owner-crate"), "scene lost work");
  check(results, "no session state leaked into the portable document",
    !JSON.stringify(survivingScene.definition).includes("presence") &&
    !JSON.stringify(survivingScene.definition).includes(sessionId),
    "session state reached the document");
} catch (error) {
  fail("smoke-live-sessions threw", error);
} finally {
  if (store) await store.close();
  if (dir) await rm(dir, { recursive: true, force: true });
}

report(results, "smoke-live-sessions");

// Live Sessions: three actors, one scene, one revision line.
//
// Owner (human) + remote editor (human) + agent, all against a real store over real HTTP
// and real SSE. What this has to prove is not that the endpoints respond — it is that the
// three of them stay *in agreement*: same revision, same document, same order of events,
// and that every way they can fall out of agreement (a duplicate, a stale base revision, a
// dropped connection, an evicted history) has a defined, tested outcome rather than a
// silent divergence.

import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { createLiveSessions } from "../server/live-sessions.mjs";
import { startSceneStore } from "../server/scene-store.mjs";
import { check, createActor, report, requestText, seedDefinition, sleep, spawnCommand, waitForStore } from "./live-session-harness.mjs";

const TOKEN = "live-session-smoke-token";
const SCENE = "live-fixture";
const results = [];
let store = null;
let dir = null;

const fail = (message, error) => {
  check(results, message, false, error instanceof Error ? error.message : String(error));
};

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

/** Calls the session engine without a socket so a controlled store can expose exact races. */
const callEngine = async (engine, method, route, body, headers = {}) => {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  request.method = method;
  request.url = route;
  request.headers = { "content-type": "application/json", ...headers };
  let status = 0;
  let text = "";
  const response = {
    headersSent: false,
    writeHead(nextStatus) {
      status = nextStatus;
      this.headersSent = true;
    },
    write(chunk) {
      text += String(chunk ?? "");
      return true;
    },
    end(chunk) {
      text += String(chunk ?? "");
    },
  };
  const url = new URL(route, "http://session.test");
  try {
    await engine.handle(request, response, url, url.pathname, {});
  } catch (error) {
    status = Number.isInteger(error?.status) ? error.status : 500;
    text = JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      ...(error?.code ? { code: error.code } : {}),
      ...(error?.revision !== undefined ? { revision: error.revision } : {}),
      ...(error?.resync ? { resync: error.resync } : {}),
    });
  }
  return { status, body: text ? JSON.parse(text) : null, text };
};

/** Opens one deterministic in-memory SSE stream so member online state is real authority. */
const openEngineStream = async (engine, sessionId, headers) => {
  const ticket = await callEngine(engine, "POST", `/sessions/${sessionId}/stream-ticket`, {}, headers);
  if (ticket.status !== 201) throw new Error(`stream ticket failed: ${ticket.status} ${ticket.text}`);
  const route = `/sessions/${sessionId}/stream?ticket=${encodeURIComponent(ticket.body.ticket)}`;
  const request = Object.assign(new EventEmitter(), { method: "GET", url: route, headers: {} });
  let status = 0;
  let frames = "";
  const response = Object.assign(new EventEmitter(), {
    headersSent: false,
    writeHead(nextStatus) {
      status = nextStatus;
      this.headersSent = true;
    },
    write(chunk) {
      frames += String(chunk ?? "");
      return true;
    },
    end(chunk) {
      frames += String(chunk ?? "");
    },
  });
  const url = new URL(route, "http://session.test");
  await engine.handle(request, response, url, url.pathname, {});
  if (status !== 200) throw new Error(`stream open failed: ${status}`);
  return {
    close: () => response.emit("close"),
    frames: () => frames,
  };
};

/** Parsed retained frames from the deterministic in-memory SSE response. */
const engineEvents = (stream, eventName) => stream.frames().split("\n\n").flatMap((frame) => {
  const lines = frame.split("\n");
  const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
  const data = lines.filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6)).join("\n");
  return event === eventName && data ? [JSON.parse(data)] : [];
});

/**
 * Deterministic regression for the old-definition/new-sequence snapshot race. The op's
 * store write is held while a snapshot request arrives. A correct engine keeps the
 * snapshot behind that operation on the session chain; the old implementation entered a
 * second store.get immediately, captured revision R, then returned it with seq for R+1.
 */
const proveAtomicSnapshotCut = async () => {
  let record = {
    name: "atomic-fixture",
    revision: 1,
    definition: seedDefinition("atomic-fixture"),
  };
  const putEntered = deferred();
  const releasePut = deferred();
  const snapshotGetEntered = deferred();
  const releaseSnapshotGet = deferred();
  let holdNextGet = false;
  const controlledStore = {
    async get() {
      const captured = structuredClone(record);
      if (holdNextGet) {
        holdNextGet = false;
        snapshotGetEntered.resolve();
        await releaseSnapshotGet.promise;
      }
      return captured;
    },
    async put(name, definition, expectedRevision) {
      putEntered.resolve();
      await releasePut.promise;
      if (expectedRevision !== record.revision) {
        throw Object.assign(new Error("controlled revision conflict"), { status: 409 });
      }
      record = { name, revision: record.revision + 1, definition: structuredClone(definition) };
      return { name, revision: record.revision };
    },
  };
  const engine = createLiveSessions({
    store: controlledStore,
    guard: { enabled: true, authorized: () => true, originAllowed: () => true },
  });
  const created = await callEngine(engine, "POST", "/sessions", {
    sceneName: "atomic-fixture",
    owner: { id: "atomic-owner", label: "Atomic owner" },
  });
  const sessionId = created.body.session.sessionId;
  const headers = { "x-graphysx-session": created.body.credential };

  const operationPromise = callEngine(engine, "POST", `/sessions/${sessionId}/ops`, {
    opId: "op-atomic-cut",
    baseRevision: 1,
    path: "transaction",
    commands: [spawnCommand("atomic-crate")],
    intent: "prove one recovery cut",
  }, headers);
  await putEntered.promise;
  holdNextGet = true;
  const snapshotPromise = callEngine(engine, "GET", `/sessions/${sessionId}/snapshot`, undefined, headers);
  const snapshotReadBeforeCommit = await Promise.race([
    snapshotGetEntered.promise.then(() => true),
    sleep(75).then(() => false),
  ]);
  check(results, "a snapshot waits behind an in-flight accepted operation",
    snapshotReadBeforeCommit === false, "snapshot store read interleaved with operation write");

  releasePut.resolve();
  const accepted = await operationPromise;
  await snapshotGetEntered.promise;
  releaseSnapshotGet.resolve();
  const snapshot = await snapshotPromise;
  check(results, "snapshot definition, revision and sequence form one atomic recovery cut",
    snapshot.status === 200
      && snapshot.body.revision === accepted.body.revision
      && snapshot.body.seq === accepted.body.seq
      && snapshot.body.definition.entities.some((entity) => entity.id === "atomic-crate"),
    JSON.stringify({ snapshotRevision: snapshot.body?.revision, snapshotSeq: snapshot.body?.seq, receipt: accepted.body }));
};

/** A member cannot turn short-lived stream tickets into an unbounded allocation. */
const proveTicketBounds = async () => {
  let clock = 1_000;
  const record = { name: "ticket-fixture", revision: 1, definition: seedDefinition("ticket-fixture") };
  const engine = createLiveSessions({
    store: { get: async () => structuredClone(record) },
    guard: { enabled: true, authorized: () => true, originAllowed: () => true },
    now: () => clock,
  });
  const created = await callEngine(engine, "POST", "/sessions", {
    sceneName: "ticket-fixture",
    owner: { id: "ticket-owner", label: "Ticket owner" },
  });
  const sessionId = created.body.session.sessionId;
  const headers = { "x-graphysx-session": created.body.credential };
  const mint = () => callEngine(engine, "POST", `/sessions/${sessionId}/stream-ticket`, {}, headers);

  const firstBurst = await Promise.all(Array.from({ length: 8 }, mint));
  const rateLimited = await mint();
  check(results, "stream-ticket minting has a separate per-member rate bound",
    firstBurst.every((response) => response.status === 201)
      && rateLimited.status === 429
      && rateLimited.body.code === "stream-ticket-rate-limit",
    JSON.stringify({ accepted: firstBurst.filter((response) => response.status === 201).length, last: rateLimited.body }));

  // Refill the member bucket without allowing the 30-second tickets to expire, until the
  // independent per-session outstanding-ticket ceiling is reached.
  for (let batch = 0; batch < 3; batch += 1) {
    clock += 4_000;
    const responses = await Promise.all(Array.from({ length: 8 }, mint));
    if (!responses.every((response) => response.status === 201)) {
      throw new Error(`ticket fixture refill batch ${batch + 1} failed`);
    }
  }
  clock += 4_000;
  const sessionLimited = await mint();
  check(results, "outstanding stream tickets have a hard per-session ceiling",
    sessionLimited.status === 429 && sessionLimited.body.code === "stream-ticket-limit",
    JSON.stringify(sessionLimited.body));

  // The normal request sweep removes expired tickets, so the ceiling recovers rather than
  // becoming a permanent denial after one burst.
  clock = 31_001;
  const afterExpiry = await mint();
  check(results, "expired stream tickets release their bounded allocation",
    afterExpiry.status === 201, `status ${afterExpiry.status} ${afterExpiry.text}`);
};

/** Closing waits for older accepted work and leaves no later task able to mutate. */
const proveSerializedClose = async () => {
  let record = { name: "close-fixture", revision: 1, definition: seedDefinition("close-fixture") };
  const putEntered = deferred();
  const releasePut = deferred();
  const controlledStore = {
    async get() { return structuredClone(record); },
    async put(name, definition, expectedRevision) {
      putEntered.resolve();
      await releasePut.promise;
      if (expectedRevision !== record.revision) throw Object.assign(new Error("controlled conflict"), { status: 409 });
      record = { name, revision: record.revision + 1, definition: structuredClone(definition) };
      return { name, revision: record.revision };
    },
  };
  const engine = createLiveSessions({
    store: controlledStore,
    guard: { enabled: true, authorized: () => true, originAllowed: () => true },
  });
  const created = await callEngine(engine, "POST", "/sessions", {
    sceneName: "close-fixture",
    owner: { id: "close-owner", label: "Close owner" },
  });
  const sessionId = created.body.session.sessionId;
  const headers = { "x-graphysx-session": created.body.credential };
  const operation = callEngine(engine, "POST", `/sessions/${sessionId}/ops`, {
    opId: "op-before-close",
    baseRevision: 1,
    commands: [spawnCommand("accepted-before-close")],
  }, headers);
  await putEntered.promise;
  const closing = callEngine(engine, "DELETE", `/sessions/${sessionId}`, undefined, headers);
  const closedBeforeCommit = await Promise.race([closing.then(() => true), sleep(75).then(() => false)]);
  check(results, "session close waits behind an in-flight operation", !closedBeforeCommit,
    "close resolved before the older store write");
  releasePut.resolve();
  const [accepted, closedResponse] = await Promise.all([operation, closing]);
  check(results, "serialized close preserves the final accepted document and removes authority",
    accepted.status === 201 && closedResponse.status === 200
      && record.definition.entities.some((entity) => entity.id === "accepted-before-close")
      && engine.view(sessionId) === null,
    JSON.stringify({ accepted: accepted.status, closed: closedResponse.status, revision: record.revision }));
};

/** Typed mission state shares session authority while leaving the authored document alone. */
const proveMissionProtocol = async () => {
  let clock = 10_000;
  let record = { name: "mission-fixture", revision: 1, definition: seedDefinition("mission-fixture") };
  const controlledStore = {
    async get() { return structuredClone(record); },
    async put(name, definition, expectedRevision, attribution = {}) {
      if (expectedRevision !== record.revision) throw Object.assign(new Error("controlled conflict"), { status: 409 });
      record = {
        name,
        revision: record.revision + 1,
        definition: structuredClone(definition),
        actor: attribution.actor ?? null,
        intent: attribution.intent ?? null,
      };
      return { name, revision: record.revision };
    },
  };
  const engine = createLiveSessions({
    store: controlledStore,
    guard: { enabled: true, authorized: () => true, originAllowed: () => true },
    now: () => clock,
  });
  const created = await callEngine(engine, "POST", "/sessions", {
    sceneName: "mission-fixture",
    owner: { id: "mission-owner", label: "Mission owner" },
  });
  const sessionId = created.body.session.sessionId;
  const ownerHeaders = { "x-graphysx-session": created.body.credential };

  const join = async (role, capabilities, actor) => {
    const invitation = await callEngine(engine, "POST", `/sessions/${sessionId}/invites`, {
      role,
      ...(capabilities ? { capabilities } : {}),
    }, ownerHeaders);
    const joined = await callEngine(engine, "POST", `/sessions/${sessionId}/join`, {
      code: invitation.body.code,
      actor,
    });
    return {
      ...joined.body,
      headers: { "x-graphysx-session": joined.body.credential },
    };
  };

  const explorer = await join("agent", ["spawn", "transaction", "mission:explore", "mission:build", "mission:validate"], {
    id: "mission-explorer", label: "Scout", kind: "agent",
  });
  const validator = await join("agent", ["mission:validate"], {
    id: "mission-validator", label: "Verifier", kind: "agent",
  });
  const relief = await join("agent", ["spawn", "mission:explore", "mission:build"], {
    id: "mission-relief", label: "Relief", kind: "agent",
  });
  const viewer = await join("viewer", null, { id: "mission-viewer", label: "Observer", kind: "human" });
  const startBody = {
    eventId: "me-start-1",
    missionId: "mission-1",
    templateId: "agentx-center-artifact-v1",
    assignments: [
      { stageId: "analyze", memberId: explorer.member.memberId },
      { stageId: "build", memberId: explorer.member.memberId },
      { stageId: "validate", memberId: validator.member.memberId },
    ],
  };
  const inheritedTemplate = await callEngine(engine, "POST", `/sessions/${sessionId}/missions`, {
    ...startBody, eventId: "me-start-inherited-template", missionId: "mission-inherited", templateId: "toString",
  }, ownerHeaders);
  check(results, "inherited object properties are not accepted as mission templates",
    inheritedTemplate.status === 400 && inheritedTemplate.body.code === "mission-template-unknown",
    JSON.stringify(inheritedTemplate.body));

  const documentBeforeMission = JSON.stringify(record.definition);
  const start = await callEngine(engine, "POST", `/sessions/${sessionId}/missions`, startBody, ownerHeaders);
  check(results, "owner starts one bounded briefing mission",
    start.status === 201 && start.body.mission.status === "briefing" && start.body.mission.stages.length === 3,
    JSON.stringify(start.body));

  const duplicateStart = await callEngine(engine, "POST", `/sessions/${sessionId}/missions`, startBody, ownerHeaders);
  const conflictingStart = await callEngine(engine, "POST", `/sessions/${sessionId}/missions`, {
    ...startBody, missionId: "mission-collision",
  }, ownerHeaders);
  check(results, "mission event ids are member/body-bound and idempotent",
    duplicateStart.status === 200 && duplicateStart.body.duplicate === true
      && duplicateStart.body.seq === start.body.seq
      && conflictingStart.status === 409 && conflictingStart.body.code === "mission-event-id-conflict",
    JSON.stringify({ duplicate: duplicateStart.body, conflict: conflictingStart.body }));

  const viewerStarts = await callEngine(engine, "POST", `/sessions/${sessionId}/missions`, {
    ...startBody, eventId: "me-viewer-start", missionId: "viewer-mission",
  }, viewer.headers);
  const viewerReads = await callEngine(engine, "GET", `/sessions/${sessionId}/missions`, undefined, viewer.headers);
  check(results, "viewers may inspect but not direct mission state",
    viewerStarts.status === 403 && viewerReads.status === 200 && viewerReads.body.missions.length === 1,
    JSON.stringify({ write: viewerStarts.status, read: viewerReads.status }));

  const reservedEventId = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-system-123", action: "activate",
  }, ownerHeaders);
  check(results, "client mission event ids cannot collide with the server lifecycle namespace",
    reservedEventId.status === 400 && reservedEventId.body.code === "mission-event-id-reserved",
    JSON.stringify(reservedEventId.body));

  const offlineActivate = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-activate-offline", action: "activate",
  }, ownerHeaders);
  const explorerStream = await openEngineStream(engine, sessionId, explorer.headers);
  let validatorStream = await openEngineStream(engine, sessionId, validator.headers);
  const reliefStream = await openEngineStream(engine, sessionId, relief.headers);
  const singleActorAssignment = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-assign-single-actor", action: "assign", stageId: "validate", memberId: explorer.member.memberId,
  }, ownerHeaders);
  const singleActorActivate = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-activate-single-actor", action: "activate",
  }, ownerHeaders);
  const restoreValidator = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-restore-validator", action: "assign", stageId: "validate", memberId: validator.member.memberId,
  }, ownerHeaders);
  const activate = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-activate-1", action: "activate",
  }, ownerHeaders);
  check(results, "activation requires online assignments spanning two distinct AgentX actors",
    offlineActivate.status === 409 && offlineActivate.body.code === "mission-assignee-offline"
      && singleActorAssignment.status === 201
      && singleActorActivate.status === 409 && singleActorActivate.body.code === "mission-participants-required"
      && restoreValidator.status === 201 && activate.status === 201,
    JSON.stringify({ offline: offlineActivate.body, single: singleActorActivate.body, activate: activate.status }));

  const unassignedProgress = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-wrong-agent", action: "progress", stageId: "analyze", state: "working", progress: 0.1,
  }, validator.headers);
  check(results, "only the assigned capable AgentX member may advance the ordered stage",
    unassignedProgress.status === 403 && unassignedProgress.body.code === "mission-stage-not-assigned",
    JSON.stringify(unassignedProgress.body));

  validatorStream.close();
  const futureDisconnectSnapshot = await callEngine(engine, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerHeaders);
  const missionAfterFutureDisconnect = futureDisconnectSnapshot.body.missions[0];
  check(results, "a future-stage disconnect is retained without stopping the live current stage",
    missionAfterFutureDisconnect.status === "active"
      && missionAfterFutureDisconnect.stages.find((stage) => stage.stageId === "validate").status === "interrupted",
    JSON.stringify(missionAfterFutureDisconnect));

  const earlyBuildOperation = await callEngine(engine, "POST", `/sessions/${sessionId}/ops`, {
    opId: "op-build-too-early",
    baseRevision: 1,
    path: "spawn",
    commands: [spawnCommand("early-build-artifact")],
    intent: "This receipt predates the Build stage",
  }, explorer.headers);

  const analyze = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-analyze-complete",
    action: "progress",
    stageId: "analyze",
    state: "completed",
    evidence: { evidenceId: "evidence-analyze", kind: "observation", summary: "The anchor needs a visible calibration partner." },
  }, explorer.headers);
  check(results, "an assigned explorer completes analysis with bounded attributed evidence",
    analyze.status === 201 && analyze.body.state === "active"
      && analyze.body.evidence.actorId === "mission-explorer"
      && analyze.body.evidence.revision === 2,
    JSON.stringify(analyze.body));

  const earlyBuild = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-build-early",
    action: "progress",
    stageId: "build",
    state: "completed",
    evidence: { evidenceId: "evidence-build-early", kind: "operation", opId: "op-build-too-early" },
  }, explorer.headers);
  check(results, "Build rejects an operation accepted before the stage became available",
    earlyBuildOperation.status === 201 && earlyBuild.status === 409
      && earlyBuild.body.code === "mission-operation-too-early",
    JSON.stringify({ operation: earlyBuildOperation.body, evidence: earlyBuild.body }));

  const fakeBuild = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-build-fake",
    action: "progress",
    stageId: "build",
    state: "completed",
    evidence: { evidenceId: "evidence-build-fake", kind: "operation", opId: "op-not-accepted" },
  }, explorer.headers);
  check(results, "a client completion claim cannot replace an accepted operation receipt",
    fakeBuild.status === 410 && fakeBuild.body.code === "mission-operation-receipt-missing",
    JSON.stringify(fakeBuild.body));

  const wrongMemberOperation = await callEngine(engine, "POST", `/sessions/${sessionId}/ops`, {
    opId: "op-wrong-member-build",
    baseRevision: 2,
    path: "spawn",
    commands: [spawnCommand("wrong-member-artifact")],
  }, relief.headers);
  const wrongMemberBuild = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-build-wrong-member", action: "progress", stageId: "build", state: "completed",
    evidence: { evidenceId: "evidence-build-wrong-member", kind: "operation", opId: "op-wrong-member-build" },
  }, explorer.headers);
  check(results, "Build rejects another member's otherwise-valid operation receipt",
    wrongMemberOperation.status === 201 && wrongMemberBuild.status === 403
      && wrongMemberBuild.body.code === "mission-operation-not-yours",
    JSON.stringify(wrongMemberBuild.body));

  const undoneOperation = await callEngine(engine, "POST", `/sessions/${sessionId}/ops`, {
    opId: "op-undone-build",
    baseRevision: 3,
    path: "spawn",
    commands: [spawnCommand("undone-build-artifact")],
  }, explorer.headers);
  const undoReceipt = await callEngine(engine, "POST",
    `/sessions/${sessionId}/ops/op-undone-build/undo`, {}, explorer.headers);
  const undoneBuild = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-build-undone", action: "progress", stageId: "build", state: "completed",
    evidence: { evidenceId: "evidence-build-undone", kind: "operation", opId: "op-undone-build" },
  }, explorer.headers);
  check(results, "Build rejects an operation receipt whose authoritative change was undone",
    undoneOperation.status === 201 && undoReceipt.status === 201 && undoneBuild.status === 409
      && undoneBuild.body.code === "mission-operation-undone",
    JSON.stringify({ undo: undoReceipt.body, evidence: undoneBuild.body }));

  const buildOperation = await callEngine(engine, "POST", `/sessions/${sessionId}/ops`, {
    opId: "op-mission-artifact",
    baseRevision: 5,
    path: "spawn",
    commands: [spawnCommand("mission-artifact")],
    intent: "Scout fabricates the calibration artifact",
  }, explorer.headers);
  const build = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-build-complete",
    action: "progress",
    stageId: "build",
    state: "completed",
    evidence: { evidenceId: "evidence-build", kind: "operation", opId: "op-mission-artifact" },
  }, explorer.headers);
  check(results, "build evidence is copied from the stable server operation receipt",
    buildOperation.status === 201 && build.status === 201
      && build.body.evidence.operation.opId === buildOperation.body.opId
      && build.body.evidence.operation.seq === buildOperation.body.seq
      && build.body.evidence.operation.revision === buildOperation.body.revision
      && build.body.evidence.operation.intent === "Scout fabricates the calibration artifact"
      && build.body.evidence.operation.touched.includes("mission-artifact")
      && build.body.evidence.operation.outputs.some((output) =>
        output.op === "spawn" && output.id === "mission-artifact")
      && build.body.state === "blocked",
    JSON.stringify({ operation: buildOperation.body, evidence: build.body.evidence }));

  const offlineResume = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-resume-validator-offline", action: "resume",
  }, ownerHeaders);
  validatorStream = await openEngineStream(engine, sessionId, validator.headers);
  const resumed = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-resume-validator-online", action: "resume",
  }, ownerHeaders);
  check(results, "a blocked mission cannot resume until every remaining assignee is live again",
    offlineResume.status === 409 && offlineResume.body.code === "mission-assignee-offline"
      && resumed.status === 201 && resumed.body.state === "active",
    JSON.stringify({ offline: offlineResume.body, resumed: resumed.body }));

  const failedValidation = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-validation-failed-outcome",
    action: "progress",
    stageId: "validate",
    state: "completed",
    evidence: { evidenceId: "evidence-validation-failed", kind: "validation", outcome: "failed", summary: "The artifact is not valid yet.", inspectedRevision: 6 },
  }, validator.headers);
  const staleValidation = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-validation-stale",
    action: "progress",
    stageId: "validate",
    state: "completed",
    evidence: { evidenceId: "evidence-validation-stale", kind: "validation", outcome: "passed", summary: "stale", inspectedRevision: 5 },
  }, validator.headers);
  // The scene store deliberately still supports direct whole-document and /changes writes.
  // Advance that authority without touching the live-session cache: validation must refuse
  // the stale split cut and make the validator resync before it can claim completion.
  record = {
    ...record,
    revision: record.revision + 1,
    definition: {
      ...structuredClone(record.definition),
      entities: [...record.definition.entities, spawnCommand("out-of-band-artifact").entity],
    },
    actor: "store-writer",
    intent: "out-of-band authoritative change",
  };
  const outOfBandValidation = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-validation-out-of-band",
    action: "progress",
    stageId: "validate",
    state: "completed",
    evidence: { evidenceId: "evidence-validation-out-of-band", kind: "validation", outcome: "passed", summary: "cached cut", inspectedRevision: 6 },
  }, validator.headers);
  const externalResyncEvents = [explorerStream, validatorStream, reliefStream]
    .map((stream) => engineEvents(stream, "resync"));
  const externalResyncSeq = externalResyncEvents[0]?.[0]?.seq ?? null;
  check(results, "out-of-band authority emits one retained document-resync barrier to every live peer",
    externalResyncEvents.every((events) => events.length === 1
      && events[0].reason === "external-revision" && events[0].revision === 7
      && events[0].seq === externalResyncSeq && !("definition" in events[0])),
    JSON.stringify(externalResyncEvents));
  check(results, "validation refuses an out-of-band store revision until the session resyncs",
    outOfBandValidation.status === 409
      && outOfBandValidation.body.code === "mission-revision-conflict"
      && outOfBandValidation.body.revision === 7
      && outOfBandValidation.body.resync === `/sessions/${sessionId}/snapshot`,
    JSON.stringify(outOfBandValidation.body));
  const validationResync = await callEngine(engine, "GET", `/sessions/${sessionId}/snapshot`, undefined, validator.headers);
  const validation = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-1/events`, {
    eventId: "me-validation-complete",
    action: "progress",
    stageId: "validate",
    state: "completed",
    evidence: { evidenceId: "evidence-validation", kind: "validation", outcome: "passed", summary: "The artifact is present at the authoritative revision.", inspectedRevision: 7 },
  }, validator.headers);
  check(results, "validation refuses failed and stale claims before accepting current passed evidence",
    failedValidation.status === 422 && failedValidation.body.code === "mission-validation-failed"
      && staleValidation.status === 409 && staleValidation.body.code === "mission-revision-conflict"
      && validationResync.status === 200 && validationResync.body.revision === 7
      && validationResync.body.seq === externalResyncSeq
      && validation.status === 201 && validation.body.state === "completed"
      && validation.body.seq === externalResyncSeq + 1,
    JSON.stringify({ failed: failedValidation.body, stale: staleValidation.body, accepted: validation.body }));

  const completedSnapshot = await callEngine(engine, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerHeaders);
  check(results, "mission snapshot, sequence and scene revision form one recovery cut",
    completedSnapshot.status === 200 && completedSnapshot.body.missions.length === 1
      && completedSnapshot.body.missions[0].status === "completed"
      && completedSnapshot.body.missions[0].updatedSeq === validation.body.seq
      && completedSnapshot.body.seq === validation.body.seq
      && completedSnapshot.body.revision === 7
      && completedSnapshot.body.definition.entities.some((entity) => entity.id === "mission-artifact")
      && completedSnapshot.body.definition.entities.some((entity) => entity.id === "out-of-band-artifact"),
    JSON.stringify({ seq: completedSnapshot.body.seq, revision: completedSnapshot.body.revision }));
  check(results, "mission-only events never enter or revision the authored document",
    record.revision === 7 && JSON.stringify(record.definition) !== documentBeforeMission
      && !JSON.stringify(record.definition).includes("mission-1")
      && !JSON.stringify(record.definition).includes("evidence-build"),
    JSON.stringify({ revision: record.revision, ids: record.definition.entities.map((entity) => entity.id) }));

  const postResyncOperation = await callEngine(engine, "POST", `/sessions/${sessionId}/ops`, {
    opId: "op-after-external-resync",
    baseRevision: completedSnapshot.body.revision,
    commands: [spawnCommand("post-resync-authored")],
    intent: "author only after the external cut is embodied",
  }, ownerHeaders);
  const postResyncSnapshot = await callEngine(engine, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerHeaders);
  check(results, "the next authored operation extends the external cut instead of skipping its document",
    postResyncOperation.status === 201 && postResyncOperation.body.baseRevision === 7
      && postResyncOperation.body.seq === externalResyncSeq + 2
      && postResyncSnapshot.body.revision === 8
      && ["out-of-band-artifact", "post-resync-authored"].every((id) =>
        postResyncSnapshot.body.definition.entities.some((entity) => entity.id === id)),
    JSON.stringify({ operation: postResyncOperation.body, revision: postResyncSnapshot.body.revision }));

  const secondStart = await callEngine(engine, "POST", `/sessions/${sessionId}/missions`, {
    ...startBody, eventId: "me-start-2", missionId: "mission-2",
  }, ownerHeaders);
  await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-2/events`, {
    eventId: "me-activate-2", action: "activate",
  }, ownerHeaders);
  const workingBody = {
    eventId: "me-working-0", action: "progress", stageId: "analyze", state: "working", progress: 0.1,
  };
  const firstWorking = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-2/events`, workingBody, explorer.headers);
  let throttled = null;
  for (let index = 1; index < 30; index += 1) {
    const response = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-2/events`, {
      ...workingBody, eventId: `me-working-${index}`,
    }, explorer.headers);
    if (response.status === 429) { throttled = response; break; }
  }
  const duplicateAfterThrottle = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-2/events`, workingBody, explorer.headers);
  check(results, "mission events have a separate deterministic member rate bound with free exact retries",
    secondStart.status === 201 && firstWorking.status === 201
      && throttled?.body.code === "mission-event-rate-limit"
      && duplicateAfterThrottle.status === 200 && duplicateAfterThrottle.body.duplicate === true,
    JSON.stringify({ throttled: throttled?.body, duplicate: duplicateAfterThrottle.body }));

  const revoked = await callEngine(engine, "DELETE",
    `/sessions/${sessionId}/members/${explorer.member.memberId}`, undefined, ownerHeaders);
  const afterRevocation = await callEngine(engine, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerHeaders);
  const interrupted = afterRevocation.body.missions.find((mission) => mission.missionId === "mission-2");
  const revokedProgress = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-2/events`, {
    eventId: "me-after-revocation", action: "progress", stageId: "analyze", state: "working", progress: 0.2,
  }, explorer.headers);
  check(results, "revocation interrupts every incomplete assignment and removes mission authority",
    revoked.status === 200 && interrupted.status === "blocked"
      && interrupted.stages[0].status === "interrupted"
      && interrupted.stages[1].status === "interrupted"
      && revokedProgress.status === 401,
    JSON.stringify({ revoked: revoked.status, mission: interrupted, progress: revokedProgress.status }));

  const deadResume = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-2/events`, {
    eventId: "me-resume-dead", action: "resume",
  }, ownerHeaders);
  const reassignAnalyze = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-2/events`, {
    eventId: "me-reassign-analyze", action: "assign", stageId: "analyze", memberId: relief.member.memberId,
  }, ownerHeaders);
  const reassignBuild = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-2/events`, {
    eventId: "me-reassign-build", action: "assign", stageId: "build", memberId: relief.member.memberId,
  }, ownerHeaders);
  const resumeAfterReassignment = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-2/events`, {
    eventId: "me-resume-reassigned", action: "resume",
  }, ownerHeaders);
  check(results, "resume re-resolves dead assignments and succeeds only after online reassignment",
    deadResume.status === 404 && deadResume.body.code === "mission-member-unavailable"
      && reassignAnalyze.status === 201 && reassignBuild.status === 201
      && resumeAfterReassignment.status === 201 && resumeAfterReassignment.body.state === "active",
    JSON.stringify({ dead: deadResume.body, analyze: reassignAnalyze.status, build: reassignBuild.status }));

  const cancelled = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-2/events`, {
    eventId: "me-cancel-2", action: "cancel",
  }, ownerHeaders);
  const cancelledSnapshot = await callEngine(engine, "GET", `/sessions/${sessionId}/snapshot`, undefined, ownerHeaders);
  const cancelledMission = cancelledSnapshot.body.missions.find((mission) => mission.missionId === "mission-2");
  check(results, "cancellation makes every unfinished stage terminal in the authoritative cut",
    cancelled.status === 201 && cancelled.body.state === "cancelled"
      && cancelledMission.status === "cancelled"
      && cancelledMission.stages.every((stage) => stage.status === "cancelled")
      && cancelledSnapshot.body.seq === cancelled.body.seq,
    JSON.stringify(cancelledMission));

  // Keep the in-memory handles referenced through the end of the fixture; closeAll performs
  // the same idempotent subscriber cleanup used by the real server.
  void explorerStream;
  void validatorStream;
  void reliefStream;
  await engine.closeAll();
};

/** An AgentX member cannot consume the owner's terminal mission-control capacity. */
const proveMissionCapacity = async () => {
  let clock = 50_000;
  let record = { name: "mission-capacity", revision: 1, definition: seedDefinition("mission-capacity") };
  const store = {
    async get() { return structuredClone(record); },
    async put(name, definition, expectedRevision) {
      if (expectedRevision !== record.revision) throw Object.assign(new Error("capacity conflict"), { status: 409 });
      record = { name, revision: record.revision + 1, definition: structuredClone(definition) };
      return { name, revision: record.revision };
    },
  };
  const engine = createLiveSessions({
    store, guard: { enabled: true, authorized: () => true, originAllowed: () => true }, now: () => clock,
  });
  const created = await callEngine(engine, "POST", "/sessions", {
    sceneName: "mission-capacity", owner: { id: "capacity-owner", label: "Capacity owner" },
  });
  const sessionId = created.body.session.sessionId;
  const ownerHeaders = { "x-graphysx-session": created.body.credential };
  const joinAgent = async (actorId) => {
    const invitation = await callEngine(engine, "POST", `/sessions/${sessionId}/invites`, {
      role: "agent", capabilities: ["mission:explore", "mission:build", "mission:validate"],
    }, ownerHeaders);
    const joined = await callEngine(engine, "POST", `/sessions/${sessionId}/join`, {
      code: invitation.body.code, actor: { id: actorId, label: actorId, kind: "agent" },
    });
    return { ...joined.body, headers: { "x-graphysx-session": joined.body.credential } };
  };
  const agents = await Promise.all(["capacity-a", "capacity-b", "capacity-c"].map(joinAgent));
  const streams = await Promise.all(agents.map((agent) => openEngineStream(engine, sessionId, agent.headers)));
  const started = await callEngine(engine, "POST", `/sessions/${sessionId}/missions`, {
    eventId: "me-capacity-start", missionId: "mission-capacity", templateId: "agentx-center-artifact-v1",
    assignments: [
      { stageId: "analyze", memberId: agents[0].member.memberId },
      { stageId: "build", memberId: agents[0].member.memberId },
      { stageId: "validate", memberId: agents[1].member.memberId },
    ],
  }, ownerHeaders);
  const activated = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-capacity/events`, {
    eventId: "me-capacity-activate", action: "activate",
  }, ownerHeaders);
  const fillMember = async (agent, prefix, limit = 80) => {
    const accepted = [];
    let refused = null;
    for (let index = 0; index < limit; index += 1) {
      clock += 250;
      const body = { eventId: `me-${prefix}-${index}`, action: "progress", stageId: "analyze", state: "working", progress: 0.1 };
      const response = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-capacity/events`, body, agent.headers);
      if (response.status === 201) accepted.push({ body, response });
      else { refused = response; break; }
    }
    return { accepted, refused };
  };
  const first = await fillMember(agents[0], "capacity-a");
  const duplicateFirst = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-capacity/events`,
    first.accepted.at(-1).body, agents[0].headers);
  check(results, "one AgentX member has a hard accepted-event cap with free exact retries",
    started.status === 201 && activated.status === 201 && first.accepted.length === 64
      && first.refused?.status === 429 && first.refused.body.code === "mission-member-event-limit"
      && duplicateFirst.status === 200 && duplicateFirst.body.duplicate === true,
    JSON.stringify({ accepted: first.accepted.length, refused: first.refused?.body, duplicate: duplicateFirst.status }));

  clock += 1_000;
  await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-capacity/events`, {
    eventId: "me-capacity-assign-b", action: "assign", stageId: "analyze", memberId: agents[1].member.memberId,
  }, ownerHeaders);
  const second = await fillMember(agents[1], "capacity-b");
  clock += 1_000;
  await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-capacity/events`, {
    eventId: "me-capacity-assign-c", action: "assign", stageId: "analyze", memberId: agents[2].member.memberId,
  }, ownerHeaders);
  const third = await fillMember(agents[2], "capacity-c");
  const duplicateThird = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-capacity/events`,
    third.accepted.at(-1).body, agents[2].headers);
  clock += 1_000;
  const cancelled = await callEngine(engine, "POST", `/sessions/${sessionId}/missions/mission-capacity/events`, {
    eventId: "me-capacity-owner-cancel", action: "cancel",
  }, ownerHeaders);
  check(results, "non-owner saturation preserves a reserved owner terminal-control budget",
    second.accepted.length === 64 && third.accepted.length === 44
      && third.refused?.status === 429 && third.refused.body.code === "mission-event-owner-reserve"
      && duplicateThird.status === 200 && duplicateThird.body.duplicate === true
      && cancelled.status === 201 && cancelled.body.state === "cancelled",
    JSON.stringify({ second: second.accepted.length, third: third.accepted.length, refused: third.refused?.body, cancelled: cancelled.body }));
  for (const stream of streams) stream.close();
  await engine.closeAll();
};

try {
  await proveAtomicSnapshotCut();
  await proveMissionProtocol();
  await proveMissionCapacity();
  await proveTicketBounds();
  await proveSerializedClose();
  dir = await mkdtemp(path.join(tmpdir(), "graphysx-live-"));
  store = await startSceneStore({ port: 0, dir, token: TOKEN, origins: null, datalakeDir: null });
  const base = store.url;
  await waitForStore(base);

  // Seed the scene the session will be scoped to.
  const seeded = await requestText(`${base}/scenes/${SCENE}`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ definition: seedDefinition(), actor: "smoke" }),
  });
  check(results, "fixture scene seeded", seeded.status === 201, `status ${seeded.status}`);

  const health = JSON.parse((await requestText(`${base}/health`)).text);
  check(results, "health reports live sessions enabled", health.sessions?.enabled === true, JSON.stringify(health.sessions));

  // A retained event after only non-retained presence gaps remains honestly replayable.
  // This is the exact case the old oldest-sequence check misclassified as mustResync.
  const gapFounder = createActor(base, { storeToken: TOKEN });
  const gapCreated = await gapFounder.call("POST", "/sessions", {
    sceneName: SCENE, owner: { id: "gap-owner", label: "Gap owner" },
  });
  const gapSessionId = gapCreated.body.session.sessionId;
  const gapOwner = createActor(base, { credential: gapCreated.body.credential });
  await gapOwner.connect(gapSessionId);
  const beforePresenceGap = gapOwner.lastSeq;
  await gapOwner.disconnect();
  const gapMission = await gapOwner.call("POST", `/sessions/${gapSessionId}/missions`, {
    eventId: "me-gap-start",
    missionId: "mission-gap",
    templateId: "agentx-center-artifact-v1",
    assignments: [],
  });
  const gapHello = await gapOwner.connect(gapSessionId, { since: beforePresenceGap });
  await gapOwner.waitFor((received) => received.missions.some((event) => event.eventId === "me-gap-start"), {
    label: "mission replay after presence-only gap",
  });
  check(results, "presence-only sequence gaps do not force an unnecessary resync",
    gapMission.status === 201 && gapHello.resumed === true && gapHello.mustResync === false,
    JSON.stringify(gapHello));
  check(results, "a retained mission event replays across the presence-only gap exactly once",
    gapOwner.received.missions.filter((event) => event.eventId === "me-gap-start").length === 1,
    JSON.stringify(gapOwner.received.missions));

  await gapOwner.call("POST", `/sessions/${gapSessionId}/missions/mission-gap/events`, {
    eventId: "me-gap-cancel", action: "cancel",
  });
  const disconnectInvite = await gapOwner.call("POST", `/sessions/${gapSessionId}/invites`, {
    role: "agent",
    capabilities: ["mission:explore", "mission:build", "mission:validate"],
  });
  const disconnectJoin = await createActor(base).call("POST", `/sessions/${gapSessionId}/join`, {
    code: disconnectInvite.body.code,
    actor: { id: "disconnect-agent", label: "Disconnect agent", kind: "agent" },
  });
  const disconnectMemberId = disconnectJoin.body.member.memberId;
  const supportInvite = await gapOwner.call("POST", `/sessions/${gapSessionId}/invites`, {
    role: "agent",
    capabilities: ["mission:validate"],
  });
  const supportJoin = await createActor(base).call("POST", `/sessions/${gapSessionId}/join`, {
    code: supportInvite.body.code,
    actor: { id: "disconnect-support", label: "Disconnect support", kind: "agent" },
  });
  const disconnectAgent = createActor(base, { credential: disconnectJoin.body.credential });
  const supportAgent = createActor(base, { credential: supportJoin.body.credential });
  await disconnectAgent.connect(gapSessionId);
  await supportAgent.connect(gapSessionId);
  await gapOwner.call("POST", `/sessions/${gapSessionId}/missions`, {
    eventId: "me-disconnect-start",
    missionId: "mission-disconnect",
    templateId: "agentx-center-artifact-v1",
    assignments: [
      { stageId: "analyze", memberId: disconnectMemberId },
      { stageId: "build", memberId: disconnectMemberId },
      { stageId: "validate", memberId: supportJoin.body.member.memberId },
    ],
  });
  const disconnectActivation = await gapOwner.call(
    "POST", `/sessions/${gapSessionId}/missions/mission-disconnect/events`,
    { eventId: "me-disconnect-activate", action: "activate" },
  );
  if (disconnectActivation.status !== 201) {
    throw new Error(`disconnect mission activation failed: ${JSON.stringify(disconnectActivation.body)}`);
  }
  await disconnectAgent.disconnect();
  await gapOwner.waitFor((received) => received.missions.some((event) =>
    event.missionId === "mission-disconnect" && event.action === "interrupt" && event.reason === "disconnected"), {
    label: "server-authored mission interruption after disconnect",
  });
  const disconnectEvent = gapOwner.received.missions.findLast((event) =>
    event.missionId === "mission-disconnect" && event.action === "interrupt");
  check(results, "an assigned AgentX disconnect becomes one retained interrupted mission state",
    disconnectEvent?.mission.status === "blocked"
      && disconnectEvent.mission.stages[0].status === "interrupted"
      && disconnectEvent.reason === "disconnected",
    JSON.stringify(disconnectEvent));

  await gapOwner.call("DELETE", `/sessions/${gapSessionId}`);
  await gapOwner.disconnect();

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
  const inheritedRoleInvite = await owner.call("POST", `/sessions/${sessionId}/invites`, { role: "toString", ttlSeconds: 300 });
  check(results, "inherited object properties are not accepted as invitation roles",
    inheritedRoleInvite.status === 400, `status ${inheritedRoleInvite.status}`);

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
  check(results, "a member can take a snapshot with its atomic authority view",
    snapshot.status === 200 && snapshot.body.definition.schema === "graphysx.agent-world/v2"
      && snapshot.body.you.actorId === "owner-ada" && snapshot.body.you.role === "owner",
    `status ${snapshot.status}`);
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

  const beforePathSpoof = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  const pathSpoof = await agent.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-agent-path-spoof",
    path: "spawn",
    commands: [{ op: "remove", id: "agent-crate" }],
  });
  const afterPathSpoof = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "an agent cannot smuggle another command through an allowed path",
    pathSpoof.status === 403 && pathSpoof.body.code === "operation-path-mismatch",
    `status ${pathSpoof.status} ${pathSpoof.text.slice(0, 160)}`);
  check(results, "a path-capability spoof leaves the authoritative document inert",
    JSON.stringify(afterPathSpoof.body.definition) === JSON.stringify(beforePathSpoof.body.definition)
      && afterPathSpoof.body.revision === beforePathSpoof.body.revision,
    `${beforePathSpoof.body.revision} -> ${afterPathSpoof.body.revision}`);

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
  const storeRecord = JSON.parse((await requestText(`${base}/scenes/${SCENE}`)).text);
  check(results, "the session's document is the stored document",
    JSON.stringify(storeRecord.definition) === JSON.stringify(finalOwner.body.definition), "session and store diverged");
  check(results, "the store records the operating actor, not the session",
    storeRecord.actor === "agent-x", `actor ${storeRecord.actor}`);

  // --- 5. duplicates and conflicts -----------------------------------------------------

  const entitiesBefore = finalOwner.body.definition.entities.length;
  const duplicate = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-owner-1",
    baseRevision: ownerOp.body.baseRevision,
    path: "transaction",
    commands: [spawnCommand("owner-crate")],
    intent: "owner adds a crate",
  });
  check(results, "a duplicated operation id returns its original receipt", duplicate.status === 200 && duplicate.body.duplicate === true, `status ${duplicate.status}`);
  check(results, "a duplicated operation id does not apply twice",
    duplicate.body.revision === ownerOp.body.revision, `${duplicate.body.revision} vs ${ownerOp.body.revision}`);
  const afterDuplicate = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "the document is unchanged by the duplicate",
    afterDuplicate.body.definition.entities.length === entitiesBefore, "entity count moved");

  const crossMemberCollision = await editor.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-owner-1",
    baseRevision: ownerOp.body.baseRevision,
    path: "transaction",
    commands: [spawnCommand("owner-crate")],
    intent: "owner adds a crate",
  });
  check(results, "an operation id cannot be replayed by a different member",
    crossMemberCollision.status === 409 && crossMemberCollision.body.code === "op-id-conflict",
    `status ${crossMemberCollision.status} ${crossMemberCollision.text.slice(0, 160)}`);

  const changedDuplicate = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-owner-1",
    baseRevision: ownerOp.body.baseRevision,
    path: "transaction",
    commands: [spawnCommand("different-crate")],
    intent: "a different request",
  });
  check(results, "an operation id cannot be reused for a different request",
    changedDuplicate.status === 409 && changedDuplicate.body.code === "op-id-conflict",
    `status ${changedDuplicate.status} ${changedDuplicate.text.slice(0, 160)}`);
  const afterCollisions = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "operation-id collisions cannot mutate the document",
    JSON.stringify(afterCollisions.body.definition) === JSON.stringify(afterDuplicate.body.definition),
    "document changed after an op-id collision");

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

  const beforeStableIdRefusals = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  const missingEntityId = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-missing-live-entity-id",
    commands: [{ op: "spawn", entity: { type: "box", label: "must stay inert" } }],
  });
  const missingBehaviorId = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-missing-live-behavior-id",
    commands: [{ op: "spawn", entity: {
      id: "missing-behavior-id-crate",
      type: "box",
      behaviors: [{ type: "spin", axis: "y", speedDegrees: 10 }],
    } }],
  });
  const missingInteractionId = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-missing-live-interaction-id",
    commands: [{ op: "update", id: "owner-crate", patch: {
      interactions: [{ type: "toggle-visibility", targetIds: ["owner-crate"] }],
    } }],
  });
  const afterStableIdRefusals = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "live generated-id commands are refused with one structured code",
    [missingEntityId, missingBehaviorId, missingInteractionId].every((response) =>
      response.status === 422 && response.body.code === "live-spawn-id-required"),
    JSON.stringify([missingEntityId, missingBehaviorId, missingInteractionId].map((response) => ({
      status: response.status, code: response.body?.code,
    }))));
  check(results, "stable-id refusals leave revision and authoritative document inert",
    afterStableIdRefusals.body.revision === beforeStableIdRefusals.body.revision
      && JSON.stringify(afterStableIdRefusals.body.definition) === JSON.stringify(beforeStableIdRefusals.body.definition),
    `${beforeStableIdRefusals.body.revision} -> ${afterStableIdRefusals.body.revision}`);

  const beforeHostileCommands = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  const hostileCommands = [
    [{ op: "spawn", entity: { id: "poison-type", type: "not-a-real-type" } }],
    [{ op: "spawn", entity: { id: "poison-parent", type: "box", parentId: "missing-parent" } }],
    [{ op: "update", id: "owner-crate", patch: { behaviors: [] } }],
    [{ op: "set-environment", environment: { ground: { size: "enormous" } } }],
  ];
  const hostileResponses = [];
  for (let index = 0; index < hostileCommands.length; index += 1) {
    hostileResponses.push(await owner.call("POST", `/sessions/${sessionId}/ops`, {
      opId: `op-hostile-command-${index}`,
      commands: hostileCommands[index],
    }));
  }
  const afterHostileCommands = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "valid members cannot persist runtime-poisoning commands",
    hostileResponses.every((response) => response.status === 422 && response.body.code === "operation-rejected"),
    JSON.stringify(hostileResponses.map((response) => ({ status: response.status, code: response.body?.code }))));
  check(results, "runtime-poisoning refusals leave revision and document byte-identical",
    afterHostileCommands.body.revision === beforeHostileCommands.body.revision
      && JSON.stringify(afterHostileCommands.body.definition) === JSON.stringify(beforeHostileCommands.body.definition),
    `${beforeHostileCommands.body.revision} -> ${afterHostileCommands.body.revision}`);

  const soundSpawn = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-sound-spawn",
    baseRevision: afterStableIdRefusals.body.revision,
    commands: [{ op: "spawn", entity: {
      id: "partial-sound", type: "sound", label: "Partial sound",
      sound: { source: "coin", volume: 0.7, loop: false, autoplay: false, positional: true, refDistance: 13 },
    } }],
  });
  const soundPatch = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-sound-partial",
    baseRevision: soundSpawn.body?.revision,
    commands: [{ op: "update", id: "partial-sound", patch: { sound: { volume: 0.25 } } }],
  });
  const soundSnapshot = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  const retainedSound = soundSnapshot.body.definition.entities.find((entity) => entity.id === "partial-sound")?.sound;
  check(results, "a partial sound update merges instead of erasing its live configuration",
    soundSpawn.status === 201 && soundPatch.status === 201
      && retainedSound?.source === "coin" && retainedSound.volume === 0.25
      && retainedSound.loop === false && retainedSound.autoplay === false
      && retainedSound.positional === true && retainedSound.refDistance === 13,
    JSON.stringify(retainedSound));

  const beforeEnvironmentPatch = soundSnapshot.body.definition.environment;
  const environmentPatch = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-environment-partial",
    baseRevision: soundSnapshot.body.revision,
    path: "set-environment",
    commands: [{ op: "set-environment", environment: { background: "#123456" } }],
  });
  const environmentSnapshot = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "set-environment is a top-level patch and preserves omitted blocks",
    environmentPatch.status === 201
      && environmentSnapshot.body.definition.environment.background === "#123456"
      && JSON.stringify(environmentSnapshot.body.definition.environment.ground)
        === JSON.stringify(beforeEnvironmentPatch.ground),
    JSON.stringify(environmentSnapshot.body.definition.environment));

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

  const maxLengthOpId = `o${"x".repeat(79)}`;
  const beforeBoundaryUndo = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  const boundaryOperation = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: maxLengthOpId,
    baseRevision: beforeBoundaryUndo.body.revision,
    commands: [spawnCommand("boundary-undo-crate")],
    intent: "exercise maximum operation id undo",
  });
  const boundaryUndo = await owner.call(
    "POST", `/sessions/${sessionId}/ops/${encodeURIComponent(maxLengthOpId)}/undo`, {},
  );
  const afterBoundaryUndo = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "a maximum-length operation id has a bounded deterministic undo id",
    boundaryOperation.status === 201
      && boundaryUndo.status === 201
      && typeof boundaryUndo.body.opId === "string"
      && boundaryUndo.body.opId.startsWith("undo-")
      && boundaryUndo.body.opId.length <= 80,
    JSON.stringify({ operation: boundaryOperation.status, undo: boundaryUndo.body?.opId }));
  check(results, "the bounded-id undo is embodied in the authoritative snapshot",
    afterBoundaryUndo.body.revision === boundaryUndo.body.revision
      && afterBoundaryUndo.body.definition.entities.every((entity) => entity.id !== "boundary-undo-crate"),
    JSON.stringify({ snapshot: afterBoundaryUndo.body.revision, undo: boundaryUndo.body?.revision }));

  // --- 7. membership management and teardown -------------------------------------------

  await viewer.connect(sessionId);
  const removeViewer = await owner.call("DELETE", `/sessions/${sessionId}/members/${viewerJoin.body.member.memberId}`);
  check(results, "an owner can remove a member", removeViewer.status === 200, `status ${removeViewer.status}`);
  await viewer.waitFor((received) => Boolean(received.revoked), { label: "revoked terminal frame" });
  const revokedTerminal = viewer.received.revoked;
  check(results, "member removal terminates the member's existing stream with final authority",
    revokedTerminal.memberId === viewerJoin.body.member.memberId
      && revokedTerminal.reason === "revoked"
      && Number.isInteger(revokedTerminal.revision)
      && Number.isInteger(revokedTerminal.seq)
      && revokedTerminal.definition?.schema === "graphysx.agent-world/v2",
    JSON.stringify({ memberId: revokedTerminal.memberId, revision: revokedTerminal.revision, seq: revokedTerminal.seq }));

  const revokedOpCount = viewer.received.ops.length;
  const afterRevocationOperation = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-after-viewer-revocation",
    baseRevision: revokedTerminal.revision,
    commands: [spawnCommand("after-viewer-revocation")],
  });
  await sleep(100);
  check(results, "a revoked open stream receives no later operation",
    afterRevocationOperation.status === 201 && viewer.received.ops.length === revokedOpCount,
    `${revokedOpCount} -> ${viewer.received.ops.length}`);
  const revokedRead = await viewer.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "a removed member's credential stops working", revokedRead.status === 401, `status ${revokedRead.status}`);
  const revokedPost = await viewer.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-revoked-credential",
    commands: [spawnCommand("revoked-credential-crate")],
  });
  const revokedTicket = await viewer.call("POST", `/sessions/${sessionId}/stream-ticket`, {});
  check(results, "a removed credential cannot reconnect or submit",
    revokedPost.status === 401 && revokedTicket.status === 401,
    JSON.stringify({ post: revokedPost.status, ticket: revokedTicket.status }));

  const editorRemovesOwner = await editor.call("DELETE", `/sessions/${sessionId}/members/${created.body.member.memberId}`);
  check(results, "a non-owner cannot remove members", editorRemovesOwner.status === 403, `status ${editorRemovesOwner.status}`);

  await editor.disconnect();
  await agent.disconnect();
  await sleep(80);
  const afterLeave = await owner.call("GET", `/sessions/${sessionId}`);
  const stillOnline = afterLeave.body.session.members.filter((member) => member.online).map((member) => member.actorId);
  check(results, "a disconnected member is reported offline, not stuck online",
    stillOnline.length === 1 && stillOnline[0] === "owner-ada", `online: ${stillOnline.join(", ") || "none"}`);

  const deleted = await owner.call("DELETE", `/sessions/${sessionId}`);
  check(results, "an owner can close the session", deleted.status === 200, `status ${deleted.status}`);
  await owner.waitFor((received) => Boolean(received.closed), { label: "closed terminal frame" });
  check(results, "session close emits its final authoritative document before detaching streams",
    owner.received.closed.revision === afterRevocationOperation.body.revision
      && owner.received.closed.definition?.entities?.some((entity) => entity.id === "after-viewer-revocation"),
    JSON.stringify({ revision: owner.received.closed.revision, seq: owner.received.closed.seq }));
  await owner.disconnect();
  const afterClose = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "a closed session is gone", afterClose.status === 404, `status ${afterClose.status}`);

  const survivingScene = JSON.parse((await requestText(`${base}/scenes/${SCENE}`)).text);
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

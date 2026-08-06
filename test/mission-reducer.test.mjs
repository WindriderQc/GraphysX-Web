import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyMissionEvent,
  createMission,
  interruptMissionForMember,
  normalizeMissionEvent,
  normalizeMissionStart,
} from "../server/live-missions.mjs";

const TEMPLATE = "agentx-center-artifact-v1";

const owner = { id: "m-owner", actorId: "ada", label: "Ada", kind: "human", role: "owner", capabilities: new Set(), revokedAt: null, streams: 1 };
const agent = (suffix, capabilities, extra = {}) => ({
  id: `m-${suffix}`,
  actorId: `agentx-${suffix}`,
  label: `AgentX ${suffix}`,
  kind: "agent",
  role: "agent",
  capabilities: new Set(capabilities),
  revokedAt: null,
  streams: 1,
  ...extra,
});

const explorer = agent("explore", ["mission:explore"]);
const builder = agent("build", ["mission:build", "mission:validate"]);

const memberMap = (...members) => new Map(members.map((member) => [member.id, member]));
const members = () => memberMap(owner, explorer, builder);

const context = (seq, revision = 4) => ({ sessionId: "gxs-test", at: "2026-08-06T00:00:00.000Z", seq, revision });

function started(overrides = {}) {
  const normalized = normalizeMissionStart({
    eventId: "me-start",
    missionId: "mission-1",
    templateId: TEMPLATE,
    assignments: [
      { stageId: "analyze", memberId: explorer.id },
      { stageId: "build", memberId: builder.id },
      { stageId: "validate", memberId: builder.id },
    ],
    ...overrides,
  });
  return createMission({ normalized, member: owner, members: members(), ...context(1) });
}

const apply = (mission, body, member, seq, memberList = members(), operationEvent = null) =>
  applyMissionEvent({
    mission,
    normalized: normalizeMissionEvent(body),
    member,
    members: memberList,
    operationEvent,
    ...context(seq),
  });

const throwsWithCode = (fn, code) =>
  assert.throws(fn, (error) => error.code === code, `expected ${code}, got a different failure`);

describe("mission normalisation", () => {
  it("reserves the system event id prefix for the server", () => {
    // `interruptMissionForMember` emits `me-system-<seq>`. A client allowed to mint those
    // could forge a lifecycle transition it is not authorised to cause.
    throwsWithCode(() => normalizeMissionStart({ eventId: "me-system-1", missionId: "m", templateId: TEMPLATE }),
      "mission-event-id-reserved");
  });

  it("rejects an unknown template and an unknown action", () => {
    throwsWithCode(() => normalizeMissionStart({ eventId: "me-1", missionId: "m", templateId: "made-up" }),
      "mission-template-unknown");
    assert.throws(() => normalizeMissionEvent({ eventId: "me-1", action: "teleport" }));
  });

  it("refuses to assign one stage twice, and refuses unknown keys", () => {
    assert.throws(() => normalizeMissionStart({
      eventId: "me-1", missionId: "m", templateId: TEMPLATE,
      assignments: [{ stageId: "build", memberId: "m-a" }, { stageId: "build", memberId: "m-b" }],
    }));
    assert.throws(() => normalizeMissionStart({
      eventId: "me-1", missionId: "m", templateId: TEMPLATE, surprise: true,
    }));
  });
});

describe("createMission", () => {
  it("starts in briefing with the template's ordered stages", () => {
    const { mission, event } = started();
    assert.equal(mission.status, "briefing");
    assert.deepEqual(mission.stages.map((stage) => stage.stageId), ["analyze", "build", "validate"]);
    assert.deepEqual(mission.stages.map((stage) => stage.order), [1, 2, 3]);
    assert.equal(event.action, "start");
    assert.equal(mission.stages[0].assignment.actorId, explorer.actorId);
  });

  it("will only assign a stage to an agent that holds its capability", () => {
    throwsWithCode(() => createMission({
      normalized: normalizeMissionStart({
        eventId: "me-1", missionId: "m", templateId: TEMPLATE,
        assignments: [{ stageId: "build", memberId: explorer.id }],
      }),
      member: owner, members: members(), ...context(1),
    }), "mission-capability-required");
  });

  it("will not assign a stage to a human, however privileged", () => {
    throwsWithCode(() => createMission({
      normalized: normalizeMissionStart({
        eventId: "me-1", missionId: "m", templateId: TEMPLATE,
        assignments: [{ stageId: "build", memberId: owner.id }],
      }),
      member: owner, members: members(), ...context(1),
    }), "mission-assignee-not-agent");
  });

  it("will not resolve a revoked member out of a snapshot", () => {
    const revoked = agent("build", ["mission:build"], { revokedAt: 1 });
    throwsWithCode(() => createMission({
      normalized: normalizeMissionStart({
        eventId: "me-1", missionId: "m", templateId: TEMPLATE,
        assignments: [{ stageId: "build", memberId: revoked.id }],
      }),
      member: owner, members: memberMap(owner, revoked), ...context(1),
    }), "mission-member-unavailable");
  });
});

describe("mission direction", () => {
  it("only the owner may direct a mission", () => {
    const { mission } = started();
    throwsWithCode(() => apply(mission, { eventId: "me-a", action: "activate" }, builder, 2), "mission-owner-required");
  });

  it("activation needs every stage assigned, online, and at least two distinct actors", () => {
    const solo = agent("solo", ["mission:explore", "mission:build", "mission:validate"]);
    const { mission } = createMission({
      normalized: normalizeMissionStart({
        eventId: "me-1", missionId: "m", templateId: TEMPLATE,
        assignments: [
          { stageId: "analyze", memberId: solo.id },
          { stageId: "build", memberId: solo.id },
          { stageId: "validate", memberId: solo.id },
        ],
      }),
      member: owner, members: memberMap(owner, solo), ...context(1),
    });
    throwsWithCode(() => apply(mission, { eventId: "me-a", action: "activate" }, owner, 2, memberMap(owner, solo)),
      "mission-participants-required");
  });

  it("refuses to activate while an assigned agent is offline", () => {
    const offline = { ...builder, streams: 0 };
    const { mission } = started();
    throwsWithCode(
      () => apply(mission, { eventId: "me-a", action: "activate" }, owner, 2, memberMap(owner, explorer, offline)),
      "mission-assignee-offline",
    );
  });

  it("activates, and only from briefing", () => {
    const { mission } = started();
    const active = apply(mission, { eventId: "me-a", action: "activate" }, owner, 2).mission;
    assert.equal(active.status, "active");
    throwsWithCode(() => apply(active, { eventId: "me-b", action: "activate" }, owner, 3), "mission-state-conflict");
  });

  it("pause and resume are state-guarded", () => {
    const { mission } = started();
    const active = apply(mission, { eventId: "me-a", action: "activate" }, owner, 2).mission;
    const paused = apply(active, { eventId: "me-b", action: "pause" }, owner, 3).mission;
    assert.equal(paused.status, "paused");
    throwsWithCode(() => apply(paused, { eventId: "me-c", action: "pause" }, owner, 4), "mission-state-conflict");
    assert.equal(apply(paused, { eventId: "me-d", action: "resume" }, owner, 4).mission.status, "active");
  });

  it("cancelling is terminal and takes the unfinished stages with it", () => {
    const { mission } = started();
    const cancelled = apply(mission, { eventId: "me-a", action: "cancel" }, owner, 2).mission;
    assert.equal(cancelled.status, "cancelled");
    assert.ok(cancelled.stages.every((stage) => stage.status === "cancelled"));
    throwsWithCode(() => apply(cancelled, { eventId: "me-b", action: "resume" }, owner, 3), "mission-terminal");
  });
});

describe("mission progress", () => {
  const activate = () => {
    const { mission } = started();
    return apply(mission, { eventId: "me-activate", action: "activate" }, owner, 2).mission;
  };

  const observation = (eventId, state = "completed") => ({
    eventId,
    action: "progress",
    stageId: "analyze",
    state,
    evidence: { evidenceId: `ev-${eventId}`, kind: "observation", summary: "the signal is periodic" },
  });

  it("only the agent assigned to the stage may publish progress on it", () => {
    const active = activate();
    // An agent assigned to a *different* stage, and the owner, fail the same assignment check.
    // The owner never reaches the reducer in practice — `missionProgress` is false for the
    // owner role, so live-sessions.mjs refuses it at the capability gate first — but the
    // reducer does not rely on that, which is what this asserts.
    throwsWithCode(() => apply(active, observation("me-p"), builder, 3), "mission-stage-not-assigned");
    throwsWithCode(() => apply(active, observation("me-p"), owner, 3), "mission-stage-not-assigned");
  });

  it("an agent that lost the stage's capability cannot publish progress with it", () => {
    const active = activate();
    const declawed = { ...explorer, capabilities: new Set() };
    throwsWithCode(
      () => apply(active, observation("me-p"), declawed, 3, memberMap(owner, declawed, builder)),
      "mission-capability-required",
    );
  });

  it("stages advance only in order", () => {
    const active = activate();
    throwsWithCode(() => apply(active, {
      eventId: "me-p", action: "progress", stageId: "build", state: "working",
      evidence: { evidenceId: "ev-1", kind: "observation", summary: "skipping ahead" },
    }, builder, 3), "mission-stage-locked");
  });

  it("completing a stage requires that stage's own kind of evidence", () => {
    const active = activate();
    throwsWithCode(() => apply(active, {
      eventId: "me-p", action: "progress", stageId: "analyze", state: "completed",
    }, explorer, 3), "mission-evidence-required");
    // The right shape for a different stage is still the wrong shape for this one.
    throwsWithCode(() => apply(active, {
      eventId: "me-p", action: "progress", stageId: "analyze", state: "completed",
      evidence: { evidenceId: "ev-1", kind: "validation", outcome: "passed", summary: "ok", inspectedRevision: 4 },
    }, explorer, 3), "mission-evidence-required");
  });

  it("progress may not move backwards", () => {
    const active = activate();
    const advanced = apply(active, {
      eventId: "me-1", action: "progress", stageId: "analyze", state: "working", progress: 0.8,
      evidence: { evidenceId: "ev-1", kind: "observation", summary: "most of the way" },
    }, explorer, 3).mission;
    throwsWithCode(() => apply(advanced, {
      eventId: "me-2", action: "progress", stageId: "analyze", state: "working", progress: 0.2,
      evidence: { evidenceId: "ev-2", kind: "observation", summary: "backwards" },
    }, explorer, 4), "mission-progress-regression");
  });

  it("completing analyze hands the mission to the next stage", () => {
    const active = activate();
    const next = apply(active, observation("me-1"), explorer, 3).mission;
    assert.equal(next.stages[0].status, "completed");
    assert.equal(next.stages[0].progress, 1);
    assert.equal(next.status, "active");
    assert.equal(next.stages[1].status, "assigned");
  });

  it("blocks the mission when the next stage's agent has gone", () => {
    const active = activate();
    const offlineBuilder = { ...builder, streams: 0 };
    const next = apply(active, observation("me-1"), explorer, 3, memberMap(owner, explorer, offlineBuilder)).mission;
    assert.equal(next.stages[1].status, "interrupted");
    assert.equal(next.status, "blocked");
  });

  it("rejects an evidence id that has already been used in this mission", () => {
    const active = activate();
    const once = apply(active, {
      eventId: "me-1", action: "progress", stageId: "analyze", state: "working",
      evidence: { evidenceId: "ev-dup", kind: "observation", summary: "first" },
    }, explorer, 3).mission;
    throwsWithCode(() => apply(once, {
      eventId: "me-2", action: "progress", stageId: "analyze", state: "working",
      evidence: { evidenceId: "ev-dup", kind: "observation", summary: "second" },
    }, explorer, 4), "mission-evidence-id-conflict");
  });

  describe("operation evidence", () => {
    const toBuild = () => apply(activate(), observation("me-1"), explorer, 3).mission;
    const operationEvent = (overrides = {}) => ({
      opId: "op-1", seq: 4, revision: 5, baseRevision: 4, path: "spawn",
      intent: "spawned the artifact", memberId: builder.id, touched: ["artifact"],
      outputs: [{ op: "spawn", id: "artifact" }], undone: false, ...overrides,
    });
    const claim = (eventId) => ({
      eventId, action: "progress", stageId: "build", state: "completed",
      evidence: { evidenceId: `ev-${eventId}`, kind: "operation", opId: "op-1" },
    });

    it("takes the summary from the server's own record, never the caller's claim", () => {
      const mission = toBuild();
      const applied = apply(mission, claim("me-2"), builder, 5, members(), operationEvent());
      const evidence = applied.mission.stages[1].evidence.at(-1);
      assert.equal(evidence.summary, "spawned the artifact");
      assert.deepEqual(evidence.operation.touched, ["artifact"]);
    });

    it("refuses a receipt that is gone", () => {
      throwsWithCode(() => apply(toBuild(), claim("me-2"), builder, 5, members(), null),
        "mission-operation-receipt-missing");
    });

    it("refuses another member's receipt", () => {
      throwsWithCode(() => apply(toBuild(), claim("me-2"), builder, 5, members(), operationEvent({ memberId: explorer.id })),
        "mission-operation-not-yours");
    });

    it("refuses a receipt from before the stage became available", () => {
      // A briefing-era edit must not be able to complete Build after the fact.
      throwsWithCode(() => apply(toBuild(), claim("me-2"), builder, 5, members(), operationEvent({ seq: 2 })),
        "mission-operation-too-early");
    });

    it("refuses an undone operation as proof of anything", () => {
      throwsWithCode(() => apply(toBuild(), claim("me-2"), builder, 5, members(), operationEvent({ undone: true })),
        "mission-operation-undone");
    });
  });

  it("a failed validation cannot complete the validation stage", () => {
    const build = apply(activate(), observation("me-1"), explorer, 3).mission;
    const operationEvent = {
      opId: "op-1", seq: 4, revision: 5, baseRevision: 4, path: "spawn", intent: "built",
      memberId: builder.id, touched: [], outputs: [], undone: false,
    };
    const validate = apply(build, {
      eventId: "me-2", action: "progress", stageId: "build", state: "completed",
      evidence: { evidenceId: "ev-2", kind: "operation", opId: "op-1" },
    }, builder, 5, members(), operationEvent).mission;
    throwsWithCode(() => apply(validate, {
      eventId: "me-3", action: "progress", stageId: "validate", state: "completed",
      evidence: { evidenceId: "ev-3", kind: "validation", outcome: "failed", summary: "it does not work", inspectedRevision: 4 },
    }, builder, 6), "mission-validation-failed");
  });

  it("validation evidence must name the revision it actually inspected", () => {
    const build = apply(activate(), observation("me-1"), explorer, 3).mission;
    throwsWithCode(() => apply(build, {
      eventId: "me-2", action: "progress", stageId: "build", state: "blocked",
      evidence: { evidenceId: "ev-2", kind: "validation", outcome: "passed", summary: "stale", inspectedRevision: 1 },
    }, builder, 5), "mission-revision-conflict");
  });
});

describe("interruptMissionForMember", () => {
  const activate = () => {
    const { mission } = started();
    return apply(mission, { eventId: "me-activate", action: "activate" }, owner, 2).mission;
  };

  it("marks the departed member's unfinished stages interrupted and blocks the mission", () => {
    const interrupted = interruptMissionForMember({
      mission: activate(), member: explorer, reason: "disconnected", ...context(3),
    });
    assert.equal(interrupted.mission.stages[0].status, "interrupted");
    assert.equal(interrupted.mission.status, "blocked");
    assert.equal(interrupted.event.action, "interrupt");
    assert.equal(interrupted.event.reason, "disconnected");
    assert.equal(interrupted.event.actorKind, "system", "a lifecycle event is not attributed to a member");
    assert.ok(interrupted.event.eventId.startsWith("me-system-"));
  });

  it("does not block the mission for a member who owns no current stage", () => {
    const interrupted = interruptMissionForMember({
      mission: activate(), member: builder, reason: "disconnected", ...context(3),
    });
    assert.equal(interrupted.mission.status, "active", "a later stage's agent leaving is not a block yet");
    assert.equal(interrupted.mission.stages[1].status, "interrupted");
  });

  it("returns null when the member owns nothing unfinished", () => {
    const stranger = agent("stranger", ["mission:build"]);
    assert.equal(interruptMissionForMember({ mission: activate(), member: stranger, reason: "revoked", ...context(3) }), null);
    // A briefing mission has nothing to interrupt either.
    assert.equal(interruptMissionForMember({ mission: started().mission, member: explorer, reason: "revoked", ...context(3) }), null);
  });
});

describe("reducer purity", () => {
  it("never mutates the mission it was given", () => {
    const { mission } = started();
    const before = JSON.stringify({ ...mission, evidenceIds: [...mission.evidenceIds] });
    apply(mission, { eventId: "me-a", action: "activate" }, owner, 2);
    assert.equal(JSON.stringify({ ...mission, evidenceIds: [...mission.evidenceIds] }), before);
  });

  it("does not alias stage evidence between the old value and the new one", () => {
    const active = apply(started().mission, { eventId: "me-a", action: "activate" }, owner, 2).mission;
    const next = apply(active, {
      eventId: "me-1", action: "progress", stageId: "analyze", state: "working",
      evidence: { evidenceId: "ev-1", kind: "observation", summary: "noted" },
    }, explorer, 3).mission;
    assert.equal(active.stages[0].evidence.length, 0);
    assert.equal(next.stages[0].evidence.length, 1);
  });
});

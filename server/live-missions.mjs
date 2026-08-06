// Server-authoritative mission state for Live Sessions.
//
// Missions are coordination state, not scene documents. This module is deliberately pure:
// it validates one bounded command and returns the next bounded mission value. The live-session
// engine owns authentication, idempotency, the shared session sequence, replay, and broadcast.
// Nothing here can call the scene store or manufacture an AgentWorld command.

import { httpError } from "./http-util.mjs";

export const LIVE_MISSION_SCHEMA = "graphysx.live-mission/v1";
export const LIVE_MISSION_EVENT_SCHEMA = "graphysx.live-mission-event/v1";

export const MISSION_CAPABILITIES = new Set([
  "mission:explore",
  "mission:build",
  "mission:validate",
]);

export const MISSION_LIMITS = Object.freeze({
  bodyBytes: 16 * 1024,
  missionsPerSession: 4,
  clientEventsPerSession: 192,
  clientEventsPerMember: 64,
  ownerEventReserve: 16,
  stagesPerMission: 8,
  evidencePerStage: 8,
  summaryChars: 240,
  touchedIdsPerEvidence: 32,
  operationOutputsPerEvidence: 64,
  outputIdsPerEvidence: 32,
});

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;
const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);
const OWNER_ACTIONS = new Set(["activate", "assign", "pause", "resume", "cancel"]);
const PROGRESS_STATES = new Set(["working", "blocked", "completed", "failed"]);

const TEMPLATE = Object.freeze({
  templateId: "agentx-center-artifact-v1",
  title: "Signal Forge Calibration",
  stages: Object.freeze([
    Object.freeze({
      stageId: "analyze",
      title: "Explore the signal",
      kind: "explore",
      station: "explore",
      capability: "mission:explore",
      completionEvidence: "observation",
    }),
    Object.freeze({
      stageId: "build",
      title: "Build the scene artifact",
      kind: "build",
      station: "build",
      capability: "mission:build",
      completionEvidence: "operation",
    }),
    Object.freeze({
      stageId: "validate",
      title: "Validate the result",
      kind: "validate",
      station: "play",
      capability: "mission:validate",
      completionEvidence: "validation",
    }),
  ]),
});

export const MISSION_TEMPLATES = Object.freeze({ [TEMPLATE.templateId]: TEMPLATE });

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function requireRecord(value, label) {
  if (!isRecord(value)) throw httpError(`${label} must be an object`, 400);
  return value;
}

function requireKeys(value, allowed, label) {
  requireRecord(value, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw httpError(`Unsupported ${label}.${key}`, 400);
  }
}

function requireId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw httpError(`Invalid ${label}: ${String(value)}`, 400);
  }
  return value;
}

function requireClientEventId(value) {
  const eventId = requireId(value, "mission event id");
  if (eventId.startsWith("me-system-")) {
    throw httpError("Mission event ids beginning with 'me-system-' are reserved", 400, {
      code: "mission-event-id-reserved",
    });
  }
  return eventId;
}

function requireText(value, label, { optional = false } = {}) {
  if ((value === undefined || value === null) && optional) return null;
  if (typeof value !== "string" || !value.trim()) throw httpError(`${label} must be a non-empty string`, 400);
  const text = value.trim();
  if (text.length > MISSION_LIMITS.summaryChars) {
    throw httpError(`${label} must be ${MISSION_LIMITS.summaryChars} characters or fewer`, 400);
  }
  return text;
}

function requireProgress(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw httpError("progress must be a finite number between 0 and 1", 400);
  }
  return Number(value);
}

function memberForAssignment(members, memberId, capability) {
  const member = members.get(memberId);
  if (!member || member.revokedAt) throw httpError("The assigned mission member is not available", 404, {
    code: "mission-member-unavailable",
  });
  if (member.role !== "agent" || member.kind !== "agent") {
    throw httpError("Mission stages may only be assigned to AgentX members", 403, {
      code: "mission-assignee-not-agent",
    });
  }
  if (!member.capabilities.has(capability)) {
    throw httpError(`The assigned agent lacks '${capability}'`, 403, {
      code: "mission-capability-required",
    });
  }
  return member;
}

function liveMemberForStage(members, stage) {
  if (!stage.assignment) return null;
  const member = members.get(stage.assignment.memberId);
  if (!member || member.revokedAt || member.role !== "agent" || member.kind !== "agent") return null;
  return member.capabilities.has(stage.capability) ? member : null;
}

const assignmentView = (member) => member ? {
  memberId: member.id,
  actorId: member.actorId,
  actorLabel: member.label,
} : null;

function requireLiveAssignments(mission, members, { incompleteOnly = false, minimumActors = 0 } = {}) {
  const stages = incompleteOnly
    ? mission.stages.filter((stage) => stage.status !== "completed")
    : mission.stages;
  if (stages.some((stage) => !stage.assignment)) {
    throw httpError("Every relevant mission stage needs an eligible AgentX assignment", 409, {
      code: "mission-assignment-required",
    });
  }
  // Resolve retained public assignment views back through live authority. A memberId in a
  // snapshot is never enough to revive a revoked member or a capability that no longer exists.
  const participants = stages.map((stage) =>
    memberForAssignment(members, stage.assignment.memberId, stage.capability));
  const offline = participants.filter((participant) => participant.streams <= 0);
  if (offline.length > 0) {
    throw httpError("Every relevant assigned AgentX member must be online", 409, {
      code: "mission-assignee-offline",
      actorIds: [...new Set(offline.map((participant) => participant.actorId))],
    });
  }
  if (minimumActors > 0 && new Set(participants.map((participant) => participant.actorId)).size < minimumActors) {
    throw httpError(`Mission activation requires at least ${minimumActors} distinct AgentX actors`, 409, {
      code: "mission-participants-required",
    });
  }
  return participants;
}

export function normalizeMissionStart(body) {
  requireKeys(body, new Set(["eventId", "missionId", "templateId", "assignments"]), "mission start");
  const eventId = requireClientEventId(body.eventId);
  const missionId = requireId(body.missionId, "mission id");
  const templateId = requireId(body.templateId, "mission template id");
  if (!Object.hasOwn(MISSION_TEMPLATES, templateId)) {
    throw httpError(`Unknown mission template: ${templateId}`, 400, { code: "mission-template-unknown" });
  }
  const rawAssignments = body.assignments ?? [];
  if (!Array.isArray(rawAssignments) || rawAssignments.length > MISSION_LIMITS.stagesPerMission) {
    throw httpError(`assignments must contain at most ${MISSION_LIMITS.stagesPerMission} entries`, 400);
  }
  const stageIds = new Set();
  const assignments = rawAssignments.map((entry, index) => {
    requireKeys(entry, new Set(["stageId", "memberId"]), `assignments[${index}]`);
    const stageId = requireId(entry.stageId, `assignments[${index}].stageId`);
    const memberId = requireId(entry.memberId, `assignments[${index}].memberId`);
    if (stageIds.has(stageId)) throw httpError(`Mission stage is assigned more than once: ${stageId}`, 400);
    stageIds.add(stageId);
    return { stageId, memberId };
  });
  return { eventId, missionId, templateId, assignments };
}

function normalizeEvidence(value) {
  if (value === undefined || value === null) return null;
  requireRecord(value, "mission evidence");
  const kind = value.kind;
  if (kind === "observation") {
    requireKeys(value, new Set(["evidenceId", "kind", "summary"]), "mission evidence");
    return {
      evidenceId: requireId(value.evidenceId, "mission evidence id"),
      kind,
      summary: requireText(value.summary, "mission evidence summary"),
    };
  }
  if (kind === "operation") {
    requireKeys(value, new Set(["evidenceId", "kind", "opId"]), "mission evidence");
    return {
      evidenceId: requireId(value.evidenceId, "mission evidence id"),
      kind,
      opId: requireId(value.opId, "mission evidence operation id"),
    };
  }
  if (kind === "validation") {
    requireKeys(value, new Set(["evidenceId", "kind", "outcome", "summary", "inspectedRevision"]), "mission evidence");
    if (!new Set(["passed", "failed"]).has(value.outcome)) {
      throw httpError("mission validation outcome must be passed or failed", 400);
    }
    if (!Number.isInteger(value.inspectedRevision) || value.inspectedRevision < 0) {
      throw httpError("mission validation inspectedRevision must be a non-negative integer", 400);
    }
    return {
      evidenceId: requireId(value.evidenceId, "mission evidence id"),
      kind,
      outcome: value.outcome,
      summary: requireText(value.summary, "mission evidence summary"),
      inspectedRevision: value.inspectedRevision,
    };
  }
  throw httpError(`Unsupported mission evidence kind: ${String(kind)}`, 400);
}

export function normalizeMissionEvent(body) {
  requireKeys(body, new Set([
    "eventId", "action", "stageId", "memberId", "state", "progress", "evidence",
  ]), "mission event");
  const eventId = requireClientEventId(body.eventId);
  const action = body.action;
  if (!OWNER_ACTIONS.has(action) && action !== "progress") {
    throw httpError(`Unsupported mission action: ${String(action)}`, 400);
  }
  if (action === "assign") {
    return {
      eventId,
      action,
      stageId: requireId(body.stageId, "mission stage id"),
      memberId: requireId(body.memberId, "mission member id"),
    };
  }
  if (action === "progress") {
    if (!PROGRESS_STATES.has(body.state)) {
      throw httpError(`Unsupported mission progress state: ${String(body.state)}`, 400);
    }
    return {
      eventId,
      action,
      stageId: requireId(body.stageId, "mission stage id"),
      state: body.state,
      progress: requireProgress(body.progress, body.state === "completed" ? 1 : null),
      evidence: normalizeEvidence(body.evidence),
    };
  }
  return { eventId, action };
}

function stageById(mission, stageId) {
  const stage = mission.stages.find((entry) => entry.stageId === stageId);
  if (!stage) throw httpError(`Unknown mission stage: ${stageId}`, 404, { code: "mission-stage-unknown" });
  return stage;
}

function firstIncompleteStage(mission) {
  return mission.stages.find((stage) => stage.status !== "completed") ?? null;
}

function assertNonTerminal(mission) {
  if (TERMINAL_STATES.has(mission.status)) {
    throw httpError(`Mission '${mission.missionId}' is already ${mission.status}`, 410, {
      code: "mission-terminal",
    });
  }
}

function assertOwner(member) {
  if (member.role !== "owner") {
    throw httpError("Only the session owner may direct this mission", 403, {
      code: "mission-owner-required",
    });
  }
}

function actorFields(member) {
  return {
    memberId: member.id,
    actorId: member.actorId,
    actorKind: member.kind,
    actorLabel: member.label,
    role: member.role,
  };
}

function cloneEvidence(evidence) {
  if (!evidence) return null;
  return {
    ...evidence,
    ...(evidence.operation ? {
      operation: {
        ...evidence.operation,
        touched: [...evidence.operation.touched],
        outputs: evidence.operation.outputs.map((output) => ({
          ...output,
          ...(output.ids ? { ids: [...output.ids] } : {}),
        })),
      },
    } : {}),
  };
}

function boundedOperationOutputs(outputs) {
  if (!Array.isArray(outputs)) return [];
  return outputs.slice(0, MISSION_LIMITS.operationOutputsPerEvidence).map((output) => ({
    ...(typeof output?.op === "string" ? { op: output.op } : {}),
    ...(typeof output?.id === "string" ? { id: output.id } : {}),
    ...(Array.isArray(output?.ids) ? {
      ids: output.ids
        .filter((id) => typeof id === "string")
        .slice(0, MISSION_LIMITS.outputIdsPerEvidence),
    } : {}),
  }));
}

export function missionView(mission) {
  return {
    schema: LIVE_MISSION_SCHEMA,
    missionId: mission.missionId,
    templateId: mission.templateId,
    title: mission.title,
    status: mission.status,
    createdAt: mission.createdAt,
    createdSeq: mission.createdSeq,
    createdBy: { ...mission.createdBy },
    updatedAt: mission.updatedAt,
    updatedSeq: mission.updatedSeq,
    revision: mission.revision,
    stages: mission.stages.map((stage) => {
      const evidence = stage.evidence.map(cloneEvidence);
      return {
        stageId: stage.stageId,
        title: stage.title,
        order: stage.order,
        kind: stage.kind,
        station: stage.station,
        capability: stage.capability,
        status: stage.status,
        progress: stage.progress,
        assignment: stage.assignment ? { ...stage.assignment } : null,
        evidence,
        latestEvidence: evidence.at(-1) ?? null,
        updatedAt: stage.updatedAt,
        updatedSeq: stage.updatedSeq,
      };
    }),
  };
}

function eventView({ sessionId, eventId, action, mission, member, at, seq, revision, stageId = null, systemReason = null }) {
  return {
    schema: LIVE_MISSION_EVENT_SCHEMA,
    event: "mission",
    eventId,
    action,
    sessionId,
    missionId: mission.missionId,
    seq,
    revision,
    at,
    ...(member ? actorFields(member) : {
      memberId: null,
      actorId: "graphysx-session",
      actorKind: "system",
      actorLabel: "Live session",
      role: null,
    }),
    ...(stageId ? { stageId } : {}),
    ...(systemReason ? { reason: systemReason } : {}),
    // A bounded replacement value makes replay deterministic without duplicating the mission
    // reducer in every client. Always serialize a fresh view: retained events must not mutate
    // when the in-memory mission advances later.
    mission: missionView(mission),
  };
}

export function createMission({ normalized, member, members, sessionId, at, seq, revision }) {
  const template = MISSION_TEMPLATES[normalized.templateId];
  if (template.stages.length > MISSION_LIMITS.stagesPerMission) {
    throw httpError("The mission template exceeds the server stage bound", 500);
  }
  const requested = new Map(normalized.assignments.map((entry) => [entry.stageId, entry.memberId]));
  for (const stageId of requested.keys()) {
    if (!template.stages.some((stage) => stage.stageId === stageId)) {
      throw httpError(`Unknown mission stage: ${stageId}`, 400, { code: "mission-stage-unknown" });
    }
  }
  const stages = template.stages.map((stage, index) => {
    const assignedMemberId = requested.get(stage.stageId) ?? null;
    const assigned = assignedMemberId ? memberForAssignment(members, assignedMemberId, stage.capability) : null;
    return {
      ...stage,
      order: index + 1,
      status: assigned ? "assigned" : "pending",
      progress: 0,
      assignment: assignmentView(assigned),
      evidence: [],
      // An operation can prove this stage only after the stage became current or was
      // reassigned. This prevents a briefing/analyse-era receipt from completing Build.
      evidenceAfterSeq: seq,
      updatedAt: at,
      updatedSeq: seq,
    };
  });
  const mission = {
    missionId: normalized.missionId,
    templateId: template.templateId,
    title: template.title,
    status: "briefing",
    createdAt: at,
    createdSeq: seq,
    createdBy: assignmentView(member),
    updatedAt: at,
    updatedSeq: seq,
    revision,
    evidenceIds: new Set(),
    stages,
  };
  return {
    mission,
    event: eventView({
      sessionId,
      eventId: normalized.eventId,
      action: "start",
      mission,
      member,
      at,
      seq,
      revision,
    }),
  };
}

function canonicalEvidence({ evidence, mission, stage, member, operationEvent, at, seq, revision, sessionId }) {
  if (!evidence) return null;
  if (mission.evidenceIds.has(evidence.evidenceId)) {
    throw httpError(`Mission evidence id is already in use: ${evidence.evidenceId}`, 409, {
      code: "mission-evidence-id-conflict",
    });
  }
  const base = {
    evidenceId: evidence.evidenceId,
    kind: evidence.kind,
    memberId: member.id,
    actorId: member.actorId,
    actorLabel: member.label,
    at,
    seq,
    revision,
  };
  if (evidence.kind === "observation") return { ...base, summary: evidence.summary };
  if (evidence.kind === "validation") {
    if (evidence.inspectedRevision !== revision) {
      throw httpError(
        `Mission validation inspected revision ${evidence.inspectedRevision}, current ${revision}`,
        409,
        {
          code: "mission-revision-conflict",
          revision,
          resync: `/sessions/${sessionId}/snapshot`,
        },
      );
    }
    return {
      ...base,
      outcome: evidence.outcome,
      summary: evidence.summary,
      inspectedRevision: evidence.inspectedRevision,
    };
  }
  if (!operationEvent) {
    throw httpError(`Accepted operation receipt is no longer available: ${evidence.opId}`, 410, {
      code: "mission-operation-receipt-missing",
    });
  }
  if (operationEvent.memberId !== member.id) {
    throw httpError("Mission operation evidence belongs to another member", 403, {
      code: "mission-operation-not-yours",
    });
  }
  if (operationEvent.seq <= mission.createdSeq) {
    throw httpError("Mission operation evidence must be accepted after the mission started", 409, {
      code: "mission-operation-too-old",
    });
  }
  if (operationEvent.seq <= stage.evidenceAfterSeq) {
    throw httpError("Mission operation evidence must be accepted after this stage became available", 409, {
      code: "mission-operation-too-early",
      evidenceAfterSeq: stage.evidenceAfterSeq,
    });
  }
  if (operationEvent.undone) {
    throw httpError("An undone operation cannot prove mission progress", 409, {
      code: "mission-operation-undone",
    });
  }
  return {
    ...base,
    summary: operationEvent.intent,
    operation: {
      opId: operationEvent.opId,
      seq: operationEvent.seq,
      revision: operationEvent.revision,
      baseRevision: operationEvent.baseRevision,
      path: operationEvent.path,
      intent: operationEvent.intent,
      touched: [...(operationEvent.touched ?? [])].slice(0, MISSION_LIMITS.touchedIdsPerEvidence),
      outputs: boundedOperationOutputs(operationEvent.outputs),
    },
  };
}

export function applyMissionEvent({
  mission,
  normalized,
  member,
  members,
  operationEvent = null,
  sessionId,
  at,
  seq,
  revision,
}) {
  assertNonTerminal(mission);
  const next = {
    ...mission,
    stages: mission.stages.map((stage) => ({
      ...stage,
      assignment: stage.assignment ? { ...stage.assignment } : null,
      evidence: stage.evidence.map(cloneEvidence),
    })),
    evidenceIds: new Set(mission.evidenceIds),
  };
  let stageId = null;

  if (normalized.action !== "progress") assertOwner(member);

  if (normalized.action === "activate") {
    if (next.status !== "briefing") {
      throw httpError("Only a briefing mission can be activated", 409, { code: "mission-state-conflict" });
    }
    if (next.stages.some((stage) => !stage.assignment)) {
      throw httpError("Every mission stage needs an eligible AgentX assignment before activation", 409, {
        code: "mission-assignment-required",
      });
    }
    requireLiveAssignments(next, members, { minimumActors: 2 });
    const current = firstIncompleteStage(next);
    if (current) {
      current.evidenceAfterSeq = seq;
      current.updatedAt = at;
      current.updatedSeq = seq;
    }
    next.status = "active";
  } else if (normalized.action === "assign") {
    const stage = stageById(next, normalized.stageId);
    if (stage.status === "completed") {
      throw httpError("A completed mission stage cannot be reassigned", 409, { code: "mission-stage-complete" });
    }
    const assigned = memberForAssignment(members, normalized.memberId, stage.capability);
    if (next.status !== "briefing" && assigned.streams <= 0) {
      throw httpError("A running mission stage may only be assigned to an online AgentX member", 409, {
        code: "mission-assignee-offline",
        actorIds: [assigned.actorId],
      });
    }
    stage.assignment = assignmentView(assigned);
    stage.status = "assigned";
    stage.evidenceAfterSeq = seq;
    stage.updatedAt = at;
    stage.updatedSeq = seq;
    stageId = stage.stageId;
  } else if (normalized.action === "pause") {
    if (!new Set(["active", "blocked"]).has(next.status)) {
      throw httpError("Only an active or blocked mission can be paused", 409, { code: "mission-state-conflict" });
    }
    next.status = "paused";
  } else if (normalized.action === "resume") {
    if (!new Set(["paused", "blocked"]).has(next.status)) {
      throw httpError("Only a paused or blocked mission can be resumed", 409, { code: "mission-state-conflict" });
    }
    const current = firstIncompleteStage(next);
    if (current && !current.assignment) {
      throw httpError("The current mission stage needs an eligible AgentX assignment", 409, {
        code: "mission-assignment-required",
      });
    }
    requireLiveAssignments(next, members, { incompleteOnly: true });
    if (current && new Set(["blocked", "interrupted", "failed"]).has(current.status)) current.status = "assigned";
    next.status = "active";
  } else if (normalized.action === "cancel") {
    next.status = "cancelled";
    for (const stage of next.stages) {
      if (stage.status === "completed") continue;
      stage.status = "cancelled";
      stage.updatedAt = at;
      stage.updatedSeq = seq;
    }
  } else if (normalized.action === "progress") {
    if (next.status !== "active") {
      throw httpError(`Mission progress is refused while the mission is ${next.status}`, 409, {
        code: "mission-not-active",
      });
    }
    const stage = stageById(next, normalized.stageId);
    const current = firstIncompleteStage(next);
    if (!current || current.stageId !== stage.stageId) {
      throw httpError("Mission stages must advance in their defined order", 409, {
        code: "mission-stage-locked",
      });
    }
    if (!stage.assignment || stage.assignment.memberId !== member.id) {
      throw httpError("Only the AgentX member assigned to this stage may publish progress", 403, {
        code: "mission-stage-not-assigned",
      });
    }
    if (member.role !== "agent" || member.kind !== "agent" || !member.capabilities.has(stage.capability)) {
      throw httpError(`This agent lacks '${stage.capability}'`, 403, {
        code: "mission-capability-required",
      });
    }
    const evidence = canonicalEvidence({
      evidence: normalized.evidence,
      mission: next,
      stage,
      member,
      operationEvent,
      at,
      seq,
      revision,
      sessionId,
    });
    if (normalized.state === "completed") {
      if (!evidence || evidence.kind !== stage.completionEvidence) {
        throw httpError(`Completing '${stage.stageId}' requires ${stage.completionEvidence} evidence`, 422, {
          code: "mission-evidence-required",
        });
      }
      if (evidence.kind === "validation" && evidence.outcome !== "passed") {
        throw httpError("A failed validation cannot complete the validation stage", 422, {
          code: "mission-validation-failed",
        });
      }
    }
    if (new Set(["blocked", "failed"]).has(normalized.state) && !evidence) {
      throw httpError(`${normalized.state} mission progress requires meaningful evidence`, 422, {
        code: "mission-evidence-required",
      });
    }
    const proposedProgress = normalized.progress ?? stage.progress;
    if (proposedProgress < stage.progress) {
      throw httpError("Mission progress may not move backwards", 409, { code: "mission-progress-regression" });
    }
    stage.progress = normalized.state === "completed" ? 1 : proposedProgress;
    stage.status = normalized.state;
    stage.updatedAt = at;
    stage.updatedSeq = seq;
    if (evidence) {
      next.evidenceIds.add(evidence.evidenceId);
      stage.evidence.push(evidence);
      while (stage.evidence.length > MISSION_LIMITS.evidencePerStage) stage.evidence.shift();
    }
    stageId = stage.stageId;
    if (normalized.state === "blocked") next.status = "blocked";
    else if (normalized.state === "failed") next.status = "failed";
    else if (next.stages.every((entry) => entry.status === "completed")) next.status = "completed";
    else if (normalized.state === "completed") {
      const following = firstIncompleteStage(next);
      following.evidenceAfterSeq = seq;
      following.updatedAt = at;
      following.updatedSeq = seq;
      const nextAssignee = liveMemberForStage(members, following);
      if (!nextAssignee || nextAssignee.streams <= 0) {
        following.status = "interrupted";
        next.status = "blocked";
      } else {
        if (following.status === "interrupted") following.status = "assigned";
        next.status = "active";
      }
    } else next.status = "active";
  }

  next.updatedAt = at;
  next.updatedSeq = seq;
  next.revision = revision;
  return {
    mission: next,
    event: eventView({
      sessionId,
      eventId: normalized.eventId,
      action: normalized.action,
      mission: next,
      member,
      at,
      seq,
      revision,
      stageId,
    }),
  };
}

/** A server lifecycle transition. Returns null when this member owns no unfinished assignment. */
export function interruptMissionForMember({ mission, member, reason, sessionId, at, seq, revision }) {
  if (!new Set(["active", "blocked"]).has(mission.status)) return null;
  const current = firstIncompleteStage(mission);
  const affected = mission.stages.filter((stage) =>
    stage.status !== "completed"
    && stage.status !== "interrupted"
    && stage.assignment?.memberId === member.id);
  if (affected.length === 0) return null;
  const blocksCurrent = affected.some((stage) => stage.stageId === current?.stageId);
  const next = {
    ...mission,
    status: blocksCurrent ? "blocked" : mission.status,
    updatedAt: at,
    updatedSeq: seq,
    revision,
    evidenceIds: new Set(mission.evidenceIds),
    stages: mission.stages.map((stage) => ({
      ...stage,
      assignment: stage.assignment ? { ...stage.assignment } : null,
      evidence: stage.evidence.map(cloneEvidence),
    })),
  };
  for (const affectedStage of affected) {
    const stage = stageById(next, affectedStage.stageId);
    stage.status = "interrupted";
    stage.updatedAt = at;
    stage.updatedSeq = seq;
  }
  const stage = affected[0];
  const eventId = `me-system-${seq}`;
  return {
    mission: next,
    event: eventView({
      sessionId,
      eventId,
      action: "interrupt",
      mission: next,
      member: null,
      at,
      seq,
      revision,
      stageId: stage.stageId,
      systemReason: reason,
    }),
  };
}

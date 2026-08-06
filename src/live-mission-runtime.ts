// Runtime-only AgentX mission projection.
//
// The server owns mission progress. This module only projects accepted mission snapshots and
// evidence into bounded transient entities; it never authors scene commands or infers success.

import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
} from "three";
import type {
  AgentWorldEntityDefinition,
  AgentWorldEntityType,
  AgentWorldRuntime,
  AgentWorldVector3,
} from "./agent-world-runtime";
import type {
  LiveMissionEvent,
  LiveMissionEvidence,
  LiveMissionStage,
  LiveMissionView,
  LiveSessionConnection,
  LiveSessionMemberView,
  LiveSessionOperation,
} from "./live-session-client";
import {
  AGENTX_STATIONS,
  type AgentXMissionStation,
  type LiveAgentMissionAssignment,
  type LiveAgentPresenceController,
  type LiveAgentWorkState,
} from "./live-agent-presence";
import { NESTOR_STAGE_ID } from "./showroom-nestor";

const BOARD_SCOPE = "live-mission-board";
const ARTIFACT_SCOPE = "live-mission-artifacts";
const COMPLETION_SCOPE = "live-mission-completion";
const COMPLETION_MS = 1_800;
const MAX_OPERATIONS = 32;
const BOARD_WORLD_POSITION: AgentWorldVector3 = [1, 3.25, -0.3];
const TERMINAL_MISSION_STATES = new Set<LiveMissionView["status"]>(["completed", "failed", "cancelled"]);

type MissionQualityProfile = "high" | "balanced" | "mobile";
type ArtifactPrimitive = Extract<AgentWorldEntityType, "box" | "sphere" | "icosahedron" | "cylinder" | "cone" | "torus">;

export type LiveMissionDirectorMode =
  | "neutral"
  | "briefing"
  | "directing"
  | "paused"
  | "blocked"
  | "completed"
  | "failed";

export type LiveMissionDirectorState = {
  mode: LiveMissionDirectorMode;
  action: LiveMissionEvent["action"] | null;
  message: string;
  actorId: string | null;
  actorLabel: string | null;
  stageId: string | null;
  stageStatus: LiveMissionStage["status"] | null;
  missionStatus: LiveMissionView["status"] | null;
  evidenceId: string | null;
  intent: string | null;
  reason: string | null;
  seq: number;
  revision: number;
};

export type LiveMissionArtifactView = {
  artifactId: string;
  cardId: string;
  evidenceId: string;
  missionId: string;
  stageId: string;
  station: AgentXMissionStation;
  kind: LiveMissionEvidence["kind"];
  summary: string;
  actorId: string;
  actorLabel: string;
  seq: number;
  revision: number;
  opId: string | null;
  operationPath: string | null;
  operationIntent: string | null;
  targetIds: string[];
};

export type LiveMissionRuntimeState = {
  sessionId: string | null;
  connection: LiveSessionConnection;
  mission: LiveMissionView | null;
  director: LiveMissionDirectorState;
  boardVisible: boolean;
  completionVisible: boolean;
  artifacts: LiveMissionArtifactView[];
  error: string | null;
};

export interface LiveMissionRuntimeController {
  setSession(sessionId: string | null): void;
  setConnection(connection: LiveSessionConnection): void;
  syncMembers(members: LiveSessionMemberView[]): void;
  syncMissions(missions: LiveMissionView[]): void;
  syncMission(mission: LiveMissionView | null): void;
  recordEvent(event: LiveMissionEvent): void;
  recordOperation(operation: LiveSessionOperation): void;
  focusMission(missionId: string): boolean;
  inspectEvidence(evidenceId: string): boolean;
  focusStage(stageId: string): boolean;
  state(): LiveMissionRuntimeState;
  dispose(): void;
}

export function createLiveMissionRuntime(options: {
  runtime: AgentWorldRuntime;
  presence: LiveAgentPresenceController;
  focusEntity?: (entityId: string) => boolean | void;
  qualityProfile?: MissionQualityProfile | (() => MissionQualityProfile);
  subscribeFrame?: (listener: (deltaSeconds: number) => void) => () => void;
  onState?: (state: LiveMissionRuntimeState) => void;
}): LiveMissionRuntimeController {
  const { runtime, presence, focusEntity, onState } = options;
  const readQualityProfile = (): MissionQualityProfile => typeof options.qualityProfile === "function"
    ? options.qualityProfile()
    : options.qualityProfile ?? "balanced";
  let qualityProfile = readQualityProfile();
  let reducedMotion = motionIsReduced();
  let sessionId: string | null = null;
  let connection: LiveSessionConnection = "offline";
  let members: LiveSessionMemberView[] = [];
  let missions: LiveMissionView[] = [];
  let mission: LiveMissionView | null = null;
  let director = neutralDirector();
  let boardVisible = false;
  let completionVisible = false;
  let artifacts: LiveMissionArtifactView[] = [];
  let lastError: string | null = null;
  let boardSignature = "";
  let artifactSignature = "";
  let completionToken = 0;
  let completionTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const operations = new Map<string, LiveSessionOperation>();

  const snapshot = (): LiveMissionRuntimeState => ({
    sessionId,
    connection,
    mission: mission ? structuredClone(mission) : null,
    director: { ...director },
    boardVisible,
    completionVisible,
    artifacts: artifacts.map((artifact) => ({ ...artifact, targetIds: [...artifact.targetIds] })),
    error: lastError,
  });

  const notify = (): void => onState?.(snapshot());

  const clearCompletionTimer = (): void => {
    if (completionTimer) clearTimeout(completionTimer);
    completionTimer = null;
    completionToken += 1;
  };

  const clearBoard = (): void => {
    runtime.clearTransientEntities(BOARD_SCOPE);
    boardSignature = "";
    boardVisible = false;
  };

  const clearArtifacts = (): void => {
    runtime.clearTransientEntities(ARTIFACT_SCOPE);
    artifactSignature = "";
    artifacts = [];
  };

  const clearCompletion = (): void => {
    clearCompletionTimer();
    runtime.clearTransientEntities(COMPLETION_SCOPE);
    completionVisible = false;
  };

  const clearProjection = (clearMission: boolean): void => {
    clearBoard();
    clearArtifacts();
    clearCompletion();
    presence.syncMissionAssignments([]);
    if (clearMission) mission = null;
    director = neutralDirector();
    lastError = null;
  };

  const syncAssignments = (value: LiveMissionView | null): void => {
    if (!value || value.status === "completed" || value.status === "cancelled") {
      presence.syncMissionAssignments([]);
      return;
    }
    const onlineByMember = freshestMembers(members);
    const candidates = new Map<string, { priority: number; assignment: LiveAgentMissionAssignment }>();
    for (const stage of [...value.stages].sort((left, right) => left.order - right.order)) {
      if (!stage.assignment) continue;
      const online = onlineByMember.get(stage.assignment.memberId)?.online === true;
      const workState = online ? workStateForStage(stage) : "disconnected";
      const priority = assignmentPriority(stage, online) * 100 + stage.order;
      const next: LiveAgentMissionAssignment = {
        actorId: stage.assignment.actorId,
        // Briefed participants gather around Nestor before accepted activation moves
        // them to the station associated with their assigned mission intent.
        station: value.status === "briefing" ? "briefing" : stage.station,
        state: workState,
        stageId: stage.stageId,
      };
      const previous = candidates.get(next.actorId);
      if (!previous || priority < previous.priority
        || (priority === previous.priority && (next.stageId ?? "").localeCompare(previous.assignment.stageId ?? "") < 0)) {
        candidates.set(next.actorId, { priority, assignment: next });
      }
    }
    presence.syncMissionAssignments(
      [...candidates.values()]
        .map(({ assignment }) => assignment)
        .sort((left, right) => left.actorId.localeCompare(right.actorId)),
    );
  };

  const projectBoard = (value: LiveMissionView): boolean => {
    const inCenter = runtime.query({ ids: [NESTOR_STAGE_ID] }).length === 1;
    const signature = JSON.stringify({ value, inCenter, reduced: motionIsReduced(), qualityProfile });
    const ids = boardIds(value.missionId);
    if (signature === boardSignature && runtime.query({ ids: [ids.root, ids.card] }).length === 2) {
      boardVisible = true;
      return true;
    }
    const result = runtime.reconcileTransientEntities(BOARD_SCOPE, boardDefinitions(value, inCenter));
    if (!result.ok) {
      lastError = result.error ?? "Could not project the AgentX mission board";
      return false;
    }
    boardSignature = signature;
    boardVisible = true;
    attachCanvasCard(runtime, ids.card, cardSize(qualityProfile, "board"), (context, width, height) => {
      drawMissionBoard(context, width, height, value);
    });
    return true;
  };

  const projectArtifacts = (value: LiveMissionView): boolean => {
    const nextArtifacts = evidenceArtifacts(runtime, value, qualityProfile, operations);
    const signature = JSON.stringify({
      missionId: value.missionId,
      reduced: motionIsReduced(),
      artifacts: nextArtifacts.map((entry) => entry.view),
    });
    const expectedIds = nextArtifacts.flatMap((entry) => entry.definitions.map((definition) => definition.id ?? ""));
    if (signature === artifactSignature && runtime.query({ ids: expectedIds }).length === expectedIds.length) {
      artifacts = nextArtifacts.map((entry) => entry.view);
      return true;
    }
    const result = runtime.reconcileTransientEntities(
      ARTIFACT_SCOPE,
      nextArtifacts.flatMap((entry) => entry.definitions),
    );
    if (!result.ok) {
      lastError = result.error ?? "Could not project accepted mission evidence";
      return false;
    }
    artifactSignature = signature;
    artifacts = nextArtifacts.map((entry) => entry.view);
    for (const entry of nextArtifacts) {
      attachCanvasCard(runtime, entry.view.cardId, cardSize(qualityProfile, "artifact"), (context, width, height) => {
        drawArtifactCard(context, width, height, entry.view);
      });
    }
    return true;
  };

  const projectMission = (
    value: LiveMissionView,
    event: LiveMissionEvent | null = null,
    preserveDirector = false,
  ): void => {
    const previousDirector = director;
    mission = structuredClone(value);
    syncAssignments(mission);
    director = preserveDirector ? previousDirector : directorForMission(mission, event);

    if (mission.status === "cancelled") {
      clearBoard();
      clearArtifacts();
      clearCompletion();
      presence.syncMissionAssignments([]);
      director = neutralDirector();
      lastError = null;
      notify();
      return;
    }

    if (mission.status === "completed") {
      clearBoard();
      clearArtifacts();
      presence.syncMissionAssignments([]);
      if (event) showCompletion(mission, event);
      else if (!completionVisible) director = neutralDirector();
      notify();
      return;
    }

    clearCompletion();
    lastError = null;
    const boardOk = projectBoard(mission);
    const artifactsOk = projectArtifacts(mission);
    if (boardOk && artifactsOk) lastError = null;
    notify();
  };

  const showCompletion = (value: LiveMissionView, event: LiveMissionEvent): void => {
    clearCompletion();
    const definitions = completionDefinitions(
      value,
      runtime.query({ ids: [NESTOR_STAGE_ID] }).length === 1,
    );
    const result = runtime.reconcileTransientEntities(COMPLETION_SCOPE, definitions);
    if (!result.ok) {
      lastError = result.error ?? "Could not project mission completion";
      completionVisible = false;
      return;
    }
    completionVisible = definitions.length > 0;
    const stage = event.stageId
      ? value.stages.find((entry) => entry.stageId === event.stageId) ?? null
      : null;
    const evidence = stage?.latestEvidence ?? latestEvidence(value);
    const evidenceSummary = evidence?.summary ?? evidence?.operation?.intent ?? "authoritative evidence accepted";
    const outcome = evidence?.outcome ? ` · ${evidence.outcome}` : "";
    director = {
      mode: "completed",
      action: event.action,
      message: `${event.actorLabel}: ${stage?.title ?? "Mission"} — ${evidenceSummary}${outcome} (${stage?.status ?? value.status}). ${value.title} completed at server sequence ${value.updatedSeq}`,
      actorId: event.actorId,
      actorLabel: event.actorLabel,
      stageId: event.stageId ?? null,
      stageStatus: stage?.status ?? null,
      missionStatus: value.status,
      evidenceId: evidence?.evidenceId ?? null,
      intent: evidence?.operation?.intent ?? evidence?.summary ?? null,
      reason: null,
      seq: event.seq,
      revision: event.revision,
    };
    const token = ++completionToken;
    completionTimer = setTimeout(() => {
      if (disposed || token !== completionToken) return;
      runtime.clearTransientEntities(COMPLETION_SCOPE);
      completionVisible = false;
      completionTimer = null;
      director = neutralDirector();
      notify();
    }, COMPLETION_MS);
  };

  const syncMissionList = (nextMissions: LiveMissionView[]): void => {
    missions = nextMissions.map((value) => structuredClone(value));
    if (!sessionId || connection !== "live") {
      notify();
      return;
    }
    const next = chooseMission(missions);
    if (!next) {
      clearProjection(true);
      notify();
      return;
    }
    // onMission is delivered before onMissions for the same accepted event. Preserve
    // its exact actor/action/intent narration when the replacement snapshot follows.
    if (mission?.missionId === next.missionId
      && mission.updatedSeq === next.updatedSeq
      && mission.revision === next.revision) {
      const projectionMissing = !boardVisible
        && next.status !== "completed"
        && next.status !== "cancelled";
      if (projectionMissing) {
        // A disconnect clears runtime projections but keeps the authoritative cut. Rebuild
        // from that cut on reconnect even when no mission event was missed.
        projectMission(next);
      } else {
        mission = structuredClone(next);
        syncAssignments(mission);
        notify();
      }
      return;
    }
    projectMission(next);
  };

  const unsubscribe = runtime.subscribeEvents((event) => {
    if (event.type !== "world.loaded" || !sessionId || connection !== "live" || disposed) return;
    queueMicrotask(() => {
      if (!mission || !sessionId || connection !== "live" || disposed) return;
      boardSignature = "";
      artifactSignature = "";
      completionVisible = false;
      projectMission(mission, null, true);
    });
  });

  const unsubscribeFrame = options.subscribeFrame?.(() => {
    if (disposed) return;
    const nextQualityProfile = readQualityProfile();
    const nextReducedMotion = motionIsReduced();
    if (nextQualityProfile === qualityProfile && nextReducedMotion === reducedMotion) return;
    qualityProfile = nextQualityProfile;
    const motionChanged = nextReducedMotion !== reducedMotion;
    reducedMotion = nextReducedMotion;
    if (!mission || !sessionId || connection !== "live") return;
    if (mission.status === "completed" || mission.status === "cancelled") {
      // A changed motion preference must stop any in-flight flourish immediately.
      if (motionChanged && completionVisible) {
        clearCompletion();
        director = neutralDirector();
        notify();
      }
      return;
    }
    boardSignature = "";
    artifactSignature = "";
    projectMission(mission, null, true);
  }) ?? (() => undefined);

  return {
    setSession(nextSessionId) {
      if (disposed || nextSessionId === sessionId) return;
      clearProjection(true);
      missions = [];
      members = [];
      operations.clear();
      sessionId = nextSessionId;
      if (!nextSessionId) connection = "offline";
      notify();
    },

    setConnection(nextConnection) {
      if (disposed || nextConnection === connection) return;
      connection = nextConnection;
      if (connection !== "live") {
        clearBoard();
        clearArtifacts();
        clearCompletion();
        presence.syncMissionAssignments([]);
        director = neutralDirector();
      }
      notify();
    },

    syncMembers(nextMembers) {
      if (disposed) return;
      members = nextMembers.map(cloneMember);
      if (mission && sessionId && connection === "live") syncAssignments(mission);
      notify();
    },

    syncMissions(nextMissions) {
      if (disposed) return;
      syncMissionList(nextMissions);
    },

    syncMission(nextMission) {
      if (disposed) return;
      syncMissionList(nextMission ? [nextMission] : []);
    },

    recordEvent(event) {
      if (disposed || !sessionId || event.sessionId !== sessionId) return;
      const nextMission = structuredClone(event.mission);
      const index = missions.findIndex((entry) => entry.missionId === nextMission.missionId);
      if (index < 0) missions.push(nextMission);
      else missions[index] = nextMission;
      // Retained events arrive before the terminal presence cut during catch-up. Cache
      // them while non-live, but never recreate transient world state or narration from
      // a stream whose continuity has not yet been proven. The terminal live status
      // reprojects exactly once from the authoritative mission list.
      if (connection !== "live") {
        notify();
        return;
      }
      projectMission(nextMission, event);
    },

    recordOperation(operation) {
      if (disposed || !sessionId || operation.sessionId !== sessionId) return;
      operations.delete(operation.opId);
      operations.set(operation.opId, structuredClone(operation));
      while (operations.size > MAX_OPERATIONS) {
        const oldest = operations.keys().next().value as string | undefined;
        if (!oldest) break;
        operations.delete(oldest);
      }
    },

    focusMission(missionId) {
      if (disposed || !boardVisible || mission?.missionId !== missionId) return false;
      return callFocus(focusEntity, boardIds(missionId).root);
    },

    inspectEvidence(evidenceId) {
      if (disposed) return false;
      const artifact = artifacts.find((entry) => entry.evidenceId === evidenceId);
      return artifact ? callFocus(focusEntity, artifact.artifactId) : false;
    },

    focusStage(stageId) {
      if (disposed || !mission) return false;
      const stage = mission.stages.find((entry) => entry.stageId === stageId);
      return stage ? callFocus(focusEntity, AGENTX_STATIONS[stage.station].entityId) : false;
    },

    state: snapshot,

    dispose() {
      if (disposed) return;
      clearProjection(true);
      disposed = true;
      unsubscribe();
      unsubscribeFrame();
      missions = [];
      members = [];
      operations.clear();
      sessionId = null;
      connection = "offline";
    },
  };
}

function boardIds(missionId: string): { root: string; card: string } {
  const key = stableKey(missionId);
  return {
    root: `live-mission:${key}:board`,
    card: `live-mission:${key}:board-card`,
  };
}

function boardDefinitions(value: LiveMissionView, inCenter: boolean): AgentWorldEntityDefinition[] {
  const ids = boardIds(value.missionId);
  const statusColor = colorForMissionStatus(value.status);
  const rootPosition: AgentWorldVector3 = inCenter ? [-4.25, 3.25, -1.1] : BOARD_WORLD_POSITION;
  const definitions: AgentWorldEntityDefinition[] = [
    {
      id: ids.root,
      ...(inCenter ? { parentId: NESTOR_STAGE_ID } : {}),
      type: "group",
      label: `${value.title} mission board`,
      transform: { position: rootPosition },
      ephemeral: true,
      tags: ["live-mission", "mission-board", `mission:${value.missionId}`],
    },
    {
      id: ids.card,
      parentId: ids.root,
      type: "plane",
      label: `${value.title} live mission status`,
      geometry: { width: 4.42, depth: 2.74 },
      transform: { position: [0, 0, 0.071], rotationDegrees: [90, 0, 0] },
      material: {
        color: "#ffffff",
        emissive: statusColor,
        emissiveIntensity: 0.16,
        roughness: 0.46,
        metalness: 0.08,
        opacity: 1,
      },
      castShadow: false,
      receiveShadow: false,
      ephemeral: true,
      tags: ["live-mission", "mission-board-card", `mission:${value.missionId}`],
    },
    {
      id: `${ids.root}:director-ring`,
      ...(inCenter ? { parentId: NESTOR_STAGE_ID } : {}),
      type: "torus",
      label: `Nestor directing ${value.title} · ${value.status}`,
      geometry: { radius: 1.02, tube: 0.045, radialSegments: 42 },
      transform: { position: inCenter ? [0, 4.15, 0.05] : [5.25, 4.15, 0.85], rotationDegrees: [90, 0, 0] },
      material: { color: statusColor, emissive: statusColor, emissiveIntensity: 1.55, roughness: 0.15, metalness: 0.6, opacity: 0.86 },
      behaviors: motionIsReduced() || value.status === "paused"
        ? []
        : [{ id: `live-mission-director-pulse-${stableKey(value.missionId)}`, type: "pulse", minimumScale: 0.96, maximumScale: 1.07, frequencyHz: 0.58 }],
      castShadow: false,
      receiveShadow: false,
      ephemeral: true,
      tags: ["live-mission", "nestor-mission-director", `mission:${value.missionId}`],
    },
  ];
  for (const stage of value.stages) {
    const target = AGENTX_STATIONS[stage.station];
    const color = colorForStageStatus(stage.status);
    definitions.push({
      id: `live-mission:${stableKey(value.missionId)}:station:${stableKey(stage.stageId)}`,
      type: "torus",
      label: `${stage.title} · ${stage.status}`,
      geometry: { radius: 0.72, tube: 0.055, radialSegments: 40 },
      transform: {
        position: [target.facingPosition[0], 1.32, target.facingPosition[2]],
        rotationDegrees: [90, 0, 0],
      },
      material: { color, emissive: color, emissiveIntensity: 1.3, roughness: 0.18, metalness: 0.62, opacity: 0.88 },
      behaviors: motionIsReduced() || !new Set(["working", "blocked", "interrupted"]).has(stage.status)
        ? []
        : [{
          id: `live-mission-stage-pulse-${stableKey(stage.stageId)}`,
          type: "pulse",
          minimumScale: 0.94,
          maximumScale: 1.08,
          frequencyHz: stage.status === "working" ? 0.7 : 1.05,
        }],
      castShadow: false,
      receiveShadow: false,
      ephemeral: true,
      tags: ["live-mission", "mission-stage-signal", `mission-stage:${stage.stageId}`, `mission-status:${stage.status}`],
    });
  }
  return definitions;
}

function evidenceArtifacts(
  runtime: AgentWorldRuntime,
  mission: LiveMissionView,
  qualityProfile: MissionQualityProfile,
  operations: Map<string, LiveSessionOperation>,
): Array<{ view: LiveMissionArtifactView; definitions: AgentWorldEntityDefinition[] }> {
  const limit = qualityProfile === "mobile" ? 2 : 4;
  const entries = mission.stages.flatMap((stage) => stage.evidence.map((evidence) => ({ stage, evidence })));
  entries.sort((left, right) => left.evidence.seq - right.evidence.seq
    || left.evidence.revision - right.evidence.revision
    || left.evidence.evidenceId.localeCompare(right.evidence.evidenceId));
  const bounded = entries.slice(-limit);
  const stationCounts = new Map<AgentXMissionStation, number>();
  return bounded.map(({ stage, evidence }) => {
    const stationIndex = stationCounts.get(stage.station) ?? 0;
    stationCounts.set(stage.station, stationIndex + 1);
    return evidenceArtifact(runtime, mission, stage, evidence, stationIndex, operations);
  });
}

function evidenceArtifact(
  runtime: AgentWorldRuntime,
  mission: LiveMissionView,
  stage: LiveMissionStage,
  evidence: LiveMissionEvidence,
  stationIndex: number,
  operations: Map<string, LiveSessionOperation>,
): { view: LiveMissionArtifactView; definitions: AgentWorldEntityDefinition[] } {
  const missionKey = stableKey(mission.missionId);
  const evidenceKey = stableKey(evidence.evidenceId);
  const artifactId = `live-mission:${missionKey}:artifact:${evidenceKey}`;
  const cardId = `${artifactId}:card`;
  const target = AGENTX_STATIONS[stage.station];
  const operation = evidence.operation ?? null;
  const acceptedOperation = operation?.opId ? operations.get(operation.opId) : undefined;
  const targetIds = [...new Set(operation?.touched ?? [])].slice(0, 16);
  const targetState = targetIds.length ? runtime.query({ ids: [targetIds[0]] })[0] : null;
  const primitive = artifactPrimitive(targetState?.type, operation?.path ?? acceptedOperation?.path ?? "");
  const lateral = (stationIndex % 3 - 1) * 1.18;
  const row = Math.floor(stationIndex / 3);
  const stand = target.standPosition;
  const position: AgentWorldVector3 = [
    Number((stand[0] + lateral).toFixed(3)),
    0.18,
    Number((stand[2] + 1.18 + row * 1.2).toFixed(3)),
  ];
  const color = colorForEvidence(evidence.kind);
  const view: LiveMissionArtifactView = {
    artifactId,
    cardId,
    evidenceId: evidence.evidenceId,
    missionId: mission.missionId,
    stageId: stage.stageId,
    station: stage.station,
    kind: evidence.kind,
    summary: evidence.summary,
    actorId: evidence.actorId,
    actorLabel: evidence.actorLabel,
    seq: evidence.seq,
    revision: evidence.revision,
    opId: operation?.opId ?? null,
    operationPath: operation?.path ?? acceptedOperation?.path ?? null,
    operationIntent: operation?.intent ?? acceptedOperation?.intent ?? null,
    targetIds,
  };
  const miniatureId = `${artifactId}:miniature`;
  const definitions: AgentWorldEntityDefinition[] = [
    {
      id: artifactId,
      type: "group",
      label: `${evidence.kind} evidence · ${evidence.summary}`,
      transform: { position },
      ephemeral: true,
      tags: [
        "live-mission",
        "mission-artifact",
        `mission:${mission.missionId}`,
        `mission-stage:${stage.stageId}`,
        `evidence:${evidence.evidenceId}`,
        ...(operation?.opId ? [`live-op:${operation.opId}`] : []),
      ],
    },
    {
      id: miniatureId,
      parentId: artifactId,
      type: primitive,
      label: `${evidence.kind} evidence miniature`,
      geometry: primitiveGeometry(primitive),
      transform: { position: [0, 0.72, 0], rotationDegrees: [0, stableHash(evidence.evidenceId) % 360, 0], scale: [0.72, 0.72, 0.72] },
      material: { color, emissive: color, emissiveIntensity: 1.05, roughness: 0.22, metalness: 0.56, opacity: 0.94 },
      behaviors: motionIsReduced() ? [] : [{
        id: `live-mission-artifact-spin-${evidenceKey}`,
        type: "spin",
        axis: "y",
        speedDegrees: 16,
      }],
      castShadow: false,
      receiveShadow: false,
      ephemeral: true,
      tags: ["live-mission", "mission-artifact-miniature", `evidence:${evidence.evidenceId}`],
    },
    {
      id: cardId,
      parentId: artifactId,
      type: "plane",
      label: `${evidence.actorLabel} evidence card`,
      geometry: { width: 1.82, depth: 0.88 },
      transform: { position: [0, 1.55, 0.58], rotationDegrees: [90, 0, 0] },
      material: { color: "#ffffff", emissive: color, emissiveIntensity: 0.12, roughness: 0.48, metalness: 0.04 },
      castShadow: false,
      receiveShadow: false,
      ephemeral: true,
      tags: ["live-mission", "mission-artifact-card", `evidence:${evidence.evidenceId}`],
    },
  ];
  const artifactWorld: AgentWorldVector3 = [position[0], position[1] + 0.8, position[2]];
  const connectorPoints: AgentWorldVector3[] = [
    BOARD_WORLD_POSITION,
    [target.standPosition[0], 1.25, target.standPosition[2]],
    artifactWorld,
  ];
  if (targetState) connectorPoints.push(targetState.position);
  definitions.push({
    id: `${artifactId}:connector`,
    type: "spline",
    label: `${evidence.evidenceId} evidence link`,
    path: { points: connectorPoints, tension: 0.4 },
    material: { color, opacity: 0.46 },
    castShadow: false,
    receiveShadow: false,
    ephemeral: true,
    tags: ["live-mission", "mission-evidence-link", `evidence:${evidence.evidenceId}`],
  });
  return { view, definitions };
}

function completionDefinitions(value: LiveMissionView, inCenter: boolean): AgentWorldEntityDefinition[] {
  const color = "#76f0ae";
  const reduced = motionIsReduced();
  const definitions: AgentWorldEntityDefinition[] = [
    {
      id: "live-mission:completion:ring",
      ...(inCenter ? { parentId: NESTOR_STAGE_ID } : {}),
      type: "torus",
      label: `${value.title} completed`,
      geometry: { radius: 2.35, tube: 0.075, radialSegments: 56 },
      transform: {
        position: inCenter ? [0, 4.65, -0.1] : [BOARD_WORLD_POSITION[0], 4.65, BOARD_WORLD_POSITION[2]],
        rotationDegrees: [12, 0, 0],
      },
      material: { color, emissive: color, emissiveIntensity: 2.1, roughness: 0.12, metalness: 0.58, opacity: 0.9 },
      behaviors: reduced ? [] : [{
        id: "live-mission-completion-pulse",
        type: "pulse",
        minimumScale: 0.94,
        maximumScale: 1.1,
        frequencyHz: 0.72,
      }],
      castShadow: false,
      receiveShadow: false,
      ephemeral: true,
      tags: ["live-mission", "mission-completion", `mission:${value.missionId}`],
    },
    {
      id: "live-mission:completion:light",
      ...(inCenter ? { parentId: NESTOR_STAGE_ID } : {}),
      type: "point-light",
      label: "Mission completion light",
      transform: { position: inCenter ? [0, 3.6, 0.8] : [BOARD_WORLD_POSITION[0], 3.6, BOARD_WORLD_POSITION[2]] },
      intensity: 4.8,
      distance: 8,
      marker: false,
      material: { color, emissive: color, emissiveIntensity: 1.4 },
      castShadow: false,
      receiveShadow: false,
      ephemeral: true,
      tags: ["live-mission", "mission-completion", `mission:${value.missionId}`],
    },
  ];
  if (!reduced) {
    definitions.push({
      id: "live-mission:completion:emitter",
      ...(inCenter ? { parentId: NESTOR_STAGE_ID } : {}),
      type: "emitter",
      label: "Mission completion signal",
      transform: { position: inCenter ? [0, 3.5, -0.15] : [BOARD_WORLD_POSITION[0], 3.5, BOARD_WORLD_POSITION[2]] },
      emitter: { preset: "energy-orb", color, sizeScale: 1.8, speed: 1.1, spread: 1.1, maxParticles: 18, rate: 24 },
      castShadow: false,
      receiveShadow: false,
      ephemeral: true,
      tags: ["live-mission", "mission-completion", `mission:${value.missionId}`],
    });
  }
  return definitions;
}

function attachCanvasCard(
  runtime: AgentWorldRuntime,
  entityId: string,
  size: { width: number; height: number },
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void,
): boolean {
  if (typeof document === "undefined") return false;
  const object = runtime.getEntityObject(entityId);
  if (!object) return false;
  const meshes: Mesh[] = [];
  object.traverse((child) => {
    if (child instanceof Mesh) meshes.push(child);
  });
  const target = meshes[0];
  if (!target) return false;
  const material = Array.isArray(target.material)
    ? target.material.find((entry): entry is MeshStandardMaterial => entry instanceof MeshStandardMaterial) ?? null
    : target.material instanceof MeshStandardMaterial ? target.material : null;
  if (!material) return false;
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return false;
  draw(context, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  material.map = texture;
  material.color.set("#ffffff");
  material.needsUpdate = true;
  return true;
}

function drawMissionBoard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  mission: LiveMissionView,
): void {
  context.fillStyle = "#07111d";
  context.fillRect(0, 0, width, height);
  const accent = colorForMissionStatus(mission.status);
  context.fillStyle = accent;
  context.fillRect(0, 0, Math.max(8, Math.round(width * 0.018)), height);
  const margin = Math.round(width * 0.055);
  context.fillStyle = "#8eefff";
  context.font = `700 ${Math.round(height * 0.055)}px system-ui, sans-serif`;
  context.fillText("AGENTX MISSION", margin, Math.round(height * 0.1));
  context.fillStyle = "#f0fbff";
  context.font = `700 ${Math.round(height * 0.075)}px system-ui, sans-serif`;
  drawClippedText(context, mission.title, margin, Math.round(height * 0.2), width - margin * 2);
  context.fillStyle = accent;
  context.font = `700 ${Math.round(height * 0.043)}px system-ui, sans-serif`;
  context.fillText(`${mission.status.toUpperCase()}  ·  SEQ ${mission.updatedSeq}  ·  REV ${mission.revision}`, margin, Math.round(height * 0.28));

  const rowTop = height * 0.34;
  const rowHeight = height * 0.19;
  for (const [index, stage] of [...mission.stages].sort((left, right) => left.order - right.order).entries()) {
    const top = Math.round(rowTop + index * rowHeight);
    context.fillStyle = index % 2 ? "#0b1928" : "#0e1e2f";
    context.fillRect(margin, top, width - margin * 2, Math.round(rowHeight * 0.82));
    context.fillStyle = colorForStageStatus(stage.status);
    context.fillRect(margin, top, Math.max(5, Math.round(width * 0.009)), Math.round(rowHeight * 0.82));
    context.fillStyle = "#e8f8ff";
    context.font = `700 ${Math.round(height * 0.043)}px system-ui, sans-serif`;
    drawClippedText(context, `${stage.order}. ${stage.title}`, margin + width * 0.025, top + rowHeight * 0.27, width * 0.5);
    context.textAlign = "right";
    context.fillStyle = "#9fb5c8";
    context.font = `600 ${Math.round(height * 0.034)}px system-ui, sans-serif`;
    context.fillText(`${stage.status.toUpperCase()}  ${Math.round(stage.progress * 100)}%`, width - margin - width * 0.02, top + rowHeight * 0.27);
    context.textAlign = "left";
    context.fillStyle = "#9fb5c8";
    context.font = `500 ${Math.round(height * 0.032)}px system-ui, sans-serif`;
    const detail = stage.latestEvidence?.summary ?? stage.assignment?.actorLabel ?? "Awaiting assignment";
    drawClippedText(context, detail, margin + width * 0.025, top + rowHeight * 0.61, width - margin * 2.4);
  }
}

function drawArtifactCard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  artifact: LiveMissionArtifactView,
): void {
  context.fillStyle = "#08131f";
  context.fillRect(0, 0, width, height);
  const accent = colorForEvidence(artifact.kind);
  context.fillStyle = accent;
  context.fillRect(0, 0, width, Math.max(7, Math.round(height * 0.08)));
  const margin = Math.round(width * 0.055);
  context.fillStyle = "#eafaff";
  context.font = `700 ${Math.round(height * 0.13)}px system-ui, sans-serif`;
  drawClippedText(context, `${artifact.kind.toUpperCase()} · ${artifact.actorLabel}`, margin, Math.round(height * 0.28), width - margin * 2);
  context.fillStyle = "#adc2d0";
  context.font = `500 ${Math.round(height * 0.105)}px system-ui, sans-serif`;
  drawWrappedText(context, artifact.summary, margin, Math.round(height * 0.47), width - margin * 2, Math.round(height * 0.13), 2);
  context.fillStyle = accent;
  context.font = `700 ${Math.round(height * 0.09)}px ui-monospace, monospace`;
  drawClippedText(
    context,
    artifact.operationPath
      ? `${artifact.operationPath} · ${artifact.operationIntent ?? artifact.opId ?? "accepted operation"}`
      : `${artifact.kind} evidence`,
    margin,
    Math.round(height * 0.79),
    width - margin * 2,
  );
  context.fillStyle = "#819bad";
  context.font = `700 ${Math.round(height * 0.075)}px ui-monospace, monospace`;
  drawClippedText(context, `SEQ ${artifact.seq} · REV ${artifact.revision}`, margin, Math.round(height * 0.92), width - margin * 2);
}

function drawClippedText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
): void {
  if (context.measureText(value).width <= maxWidth) {
    context.fillText(value, x, y);
    return;
  }
  let text = value;
  while (text.length > 1 && context.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
  context.fillText(`${text}…`, x, y);
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = value.trim().split(/\s+/);
  let line = "";
  let lineIndex = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      context.fillText(line, x, y + lineIndex * lineHeight);
      lineIndex += 1;
      if (lineIndex >= maxLines) return;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line && lineIndex < maxLines) drawClippedText(context, line, x, y + lineIndex * lineHeight, maxWidth);
}

function cardSize(profile: MissionQualityProfile, kind: "board" | "artifact"): { width: number; height: number } {
  if (kind === "artifact") {
    if (profile === "mobile") return { width: 256, height: 128 };
    if (profile === "high") return { width: 448, height: 224 };
    return { width: 352, height: 176 };
  }
  if (profile === "mobile") return { width: 384, height: 256 };
  if (profile === "high") return { width: 768, height: 512 };
  return { width: 576, height: 384 };
}

function chooseMission(missions: LiveMissionView[]): LiveMissionView | null {
  const ordered = [...missions].sort((left, right) => left.updatedSeq - right.updatedSeq
    || left.missionId.localeCompare(right.missionId));
  return ordered.filter((entry) => !TERMINAL_MISSION_STATES.has(entry.status)).at(-1)
    ?? ordered.at(-1)
    ?? null;
}

function directorForMission(mission: LiveMissionView, event: LiveMissionEvent | null): LiveMissionDirectorState {
  const orderedStages = [...mission.stages].sort((left, right) => left.order - right.order
    || left.stageId.localeCompare(right.stageId));
  const currentStage = orderedStages.find((entry) => entry.status !== "completed" && entry.status !== "cancelled")
    ?? orderedStages.at(-1)
    ?? null;
  const stage = event?.stageId
    ? mission.stages.find((entry) => entry.stageId === event.stageId) ?? currentStage
    : currentStage;
  // Never let earlier-stage evidence masquerade as evidence for the current stage.
  const evidence = stage?.latestEvidence ?? (stage ? null : latestEvidence(mission));
  const mode: LiveMissionDirectorMode = mission.status === "briefing" ? "briefing"
    : mission.status === "paused" ? "paused"
      : mission.status === "blocked" ? "blocked"
        : mission.status === "failed" ? "failed"
          : mission.status === "completed" ? "completed"
            : "directing";
  const reason = event?.reason?.trim() || null;
  const interrupted = event?.action === "interrupt" && stage;
  const exactProgressActor = event?.action === "progress";
  const actorId = exactProgressActor
    ? event?.actorId ?? evidence?.actorId ?? stage?.assignment?.actorId ?? null
    : stage?.assignment?.actorId ?? evidence?.actorId ?? event?.actorId ?? null;
  const actorLabel = exactProgressActor
    ? event?.actorLabel ?? evidence?.actorLabel ?? stage?.assignment?.actorLabel ?? null
    : stage?.assignment?.actorLabel ?? evidence?.actorLabel ?? event?.actorLabel ?? null;
  const intent = evidence?.operation?.intent ?? evidence?.summary ?? null;
  const message = interrupted
    ? `${actorLabel ?? "Assigned AgentX actor"} was interrupted on ${stage.title}${reason ? `: ${reason}` : ""}`
    : event?.action === "progress" && stage
      ? `${actorLabel ?? "AgentX actor"}: ${stage.title} — ${intent ?? stage.status} (${stage.status})`
      : event?.action === "assign" && stage
        ? `${actorLabel ?? "AgentX actor"} is assigned to ${stage.title}`
        : event?.action === "pause" && stage
          ? `${mission.title} paused at ${stage.title}`
          : (event?.action === "activate" || event?.action === "resume") && stage
            ? `${actorLabel ?? "AgentX actor"} is working on ${stage.title} (${stage.status})`
            : event?.action === "start"
              ? `${mission.title} is briefed to its assigned AgentX team`
              : evidence?.summary
                ?? (stage ? `${actorLabel ?? "AgentX actor"} · ${stage.title} is ${stage.status}` : `${mission.title} is ${mission.status}`);
  return {
    mode,
    action: event?.action ?? null,
    message,
    actorId,
    actorLabel,
    stageId: stage?.stageId ?? null,
    stageStatus: stage?.status ?? null,
    missionStatus: mission.status,
    evidenceId: evidence?.evidenceId ?? null,
    intent,
    reason,
    seq: event?.seq ?? mission.updatedSeq,
    revision: event?.revision ?? mission.revision,
  };
}
function latestEvidence(mission: LiveMissionView): LiveMissionEvidence | null {
  return mission.stages.flatMap((stage) => stage.evidence)
    .sort((left, right) => left.seq - right.seq || left.evidenceId.localeCompare(right.evidenceId))
    .at(-1) ?? null;
}

function neutralDirector(): LiveMissionDirectorState {
  return {
    mode: "neutral",
    action: null,
    message: "Awaiting an accepted mission event",
    actorId: null,
    actorLabel: null,
    stageId: null,
    stageStatus: null,
    missionStatus: null,
    evidenceId: null,
    intent: null,
    reason: null,
    seq: 0,
    revision: 0,
  };
}

function workStateForStage(stage: LiveMissionStage): LiveAgentWorkState {
  if (stage.status === "working") return "working";
  if (new Set(["blocked", "interrupted", "failed"]).has(stage.status)) return "blocked";
  if (stage.status === "completed") return "completed";
  return "online";
}

function assignmentPriority(stage: LiveMissionStage, online: boolean): number {
  if (!online) return 0;
  if (stage.status === "working") return 1;
  if (stage.status === "blocked" || stage.status === "interrupted") return 2;
  if (stage.status === "assigned" || stage.status === "pending") return 3;
  if (stage.status === "failed") return 4;
  if (stage.status === "completed") return 5;
  return 6;
}

function freshestMembers(members: LiveSessionMemberView[]): Map<string, LiveSessionMemberView> {
  const byActor = new Map<string, LiveSessionMemberView>();
  for (const member of members) {
    const previous = byActor.get(member.actorId);
    if (!previous || (member.online && !previous.online)
      || (member.online === previous.online && member.joinedAt.localeCompare(previous.joinedAt) > 0)
      || (member.online === previous.online && member.joinedAt === previous.joinedAt
        && member.memberId.localeCompare(previous.memberId) > 0)) {
      byActor.set(member.actorId, member);
    }
  }
  return new Map([...byActor.values()].map((member) => [member.memberId, member]));
}

function cloneMember(member: LiveSessionMemberView): LiveSessionMemberView {
  return {
    ...member,
    capabilities: member.capabilities ? [...member.capabilities] : null,
    presence: member.presence ? {
      ...member.presence,
      cursor: member.presence.cursor ? { ...member.presence.cursor } : null,
      selection: [...member.presence.selection],
    } : null,
  };
}

function artifactPrimitive(type: AgentWorldEntityType | undefined, path: string): ArtifactPrimitive {
  if (type && new Set<AgentWorldEntityType>(["box", "sphere", "icosahedron", "cylinder", "cone", "torus"]).has(type)) {
    return type as ArtifactPrimitive;
  }
  if (/spawn|create|prefab/i.test(path)) return "box";
  if (/update|transform|material/i.test(path)) return "torus";
  if (/remove|clear/i.test(path)) return "icosahedron";
  return "icosahedron";
}

function primitiveGeometry(type: ArtifactPrimitive): AgentWorldEntityDefinition["geometry"] {
  if (type === "box") return { width: 0.82, height: 0.82, depth: 0.82 };
  if (type === "cylinder" || type === "cone") return { radius: 0.52, height: 0.9, radialSegments: 18 };
  if (type === "torus") return { radius: 0.5, tube: 0.15, radialSegments: 28 };
  return { radius: 0.58, radialSegments: 18 };
}

function colorForMissionStatus(status: LiveMissionView["status"]): string {
  if (status === "completed") return "#76f0ae";
  if (status === "blocked" || status === "failed") return "#ffc47a";
  if (status === "paused") return "#9aaed0";
  return "#6fe9ff";
}

function colorForStageStatus(status: LiveMissionStage["status"]): string {
  if (status === "completed") return "#76f0ae";
  if (status === "blocked" || status === "interrupted" || status === "failed") return "#ffc47a";
  if (status === "working") return "#6fe9ff";
  return "#8097ad";
}

function colorForEvidence(kind: LiveMissionEvidence["kind"]): string {
  if (kind === "operation") return "#83f1b8";
  if (kind === "validation") return "#d6a8ff";
  return "#6fe9ff";
}

function motionIsReduced(): boolean {
  const preference = typeof document === "undefined" ? undefined : document.documentElement.dataset.gxMotion;
  if (preference === "reduce") return true;
  if (preference === "full") return false;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function callFocus(focus: ((entityId: string) => boolean | void) | undefined, entityId: string): boolean {
  if (!focus) return false;
  return focus(entityId) !== false;
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableKey(value: string): string {
  // Runtime entity ids are capped at 80 characters; nested artifact ids need headroom.
  const readable = value.toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").slice(0, 10) || "value";
  return `${readable}-${stableHash(value).toString(36)}`;
}

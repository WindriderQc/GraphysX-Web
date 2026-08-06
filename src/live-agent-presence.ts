// Scene-native projection of live-session agent membership.
//
// Membership, mission assignment, and accepted-operation events are transport state, not
// authored scene changes. The controller therefore owns only transient runtime scopes and
// advances movement through the host's single render-loop subscription.

import { Vector3 } from "three";
import type {
  AgentWorldEntityDefinition,
  AgentWorldEntityPatch,
  AgentWorldRuntime,
  AgentWorldVector3,
} from "./agent-world-runtime";
import type {
  LiveSessionConnection,
  LiveSessionMemberView,
  LiveSessionOperation,
} from "./live-session-client";
import { NESTOR_AGENT_ID, NESTOR_STAGE_ID } from "./showroom-nestor";

const AVATAR_SCOPE = "live-agent-presence";
const REACTION_SCOPE = "live-nestor-activity";
const REACTION_MS = 7_000;

const CENTER_SLOTS: readonly AgentWorldVector3[] = [
  [-3.35, 0.36, 1.3],
  [-4.15, 0.36, -0.45],
  [-2.95, 0.36, -2.25],
  [2.95, 0.36, -2.25],
  [4.15, 0.36, -0.45],
  [3.35, 0.36, 1.3],
  [-5.1, 0.36, 1.85],
  [5.1, 0.36, 1.85],
];

const WORLD_SLOTS: readonly AgentWorldVector3[] = [
  [-3.6, 0.36, 2.8],
  [-1.2, 0.36, 3.5],
  [1.2, 0.36, 3.5],
  [3.6, 0.36, 2.8],
  [-4.5, 0.36, 0.4],
  [4.5, 0.36, 0.4],
  [-2.8, 0.36, -2.6],
  [2.8, 0.36, -2.6],
];

const AGENT_COLORS = [
  "#6fe9ff",
  "#83f1b8",
  "#d6a8ff",
  "#ffc47a",
  "#ff8fb5",
  "#8eb7ff",
] as const;

export type AgentXMissionStation = "briefing" | "build" | "play" | "explore";
export type LiveAgentWorkState = "online" | "working" | "blocked" | "completed" | "disconnected";

export type AgentXStationTarget = Readonly<{
  entityId: string;
  standPosition: AgentWorldVector3;
  facingPosition: AgentWorldVector3;
}>;

/** Stable authored anchors used by both mission artifacts and agent choreography. */
export const AGENTX_STATIONS: Readonly<Record<AgentXMissionStation, AgentXStationTarget>> = Object.freeze({
  briefing: Object.freeze({
    entityId: NESTOR_STAGE_ID,
    standPosition: [3.75, 0.36, 1.05] as AgentWorldVector3,
    facingPosition: [5.25, 2.25, 0.8] as AgentWorldVector3,
  }),
  build: Object.freeze({
    entityId: "showroom-nestor-console-build",
    standPosition: [2.8, 0.36, 4.15] as AgentWorldVector3,
    facingPosition: [2.8, 1.15, 2.8] as AgentWorldVector3,
  }),
  play: Object.freeze({
    entityId: "showroom-nestor-console-play",
    standPosition: [8.2, 0.36, 3.85] as AgentWorldVector3,
    facingPosition: [8.2, 1.15, 2.4] as AgentWorldVector3,
  }),
  explore: Object.freeze({
    entityId: "showroom-nestor-console-explore",
    standPosition: [8.4, 0.36, -0.05] as AgentWorldVector3,
    facingPosition: [8.4, 1.15, -1.5] as AgentWorldVector3,
  }),
});

export type LiveAgentMissionAssignment = {
  actorId: string;
  station: AgentXMissionStation;
  state: LiveAgentWorkState;
  stageId?: string | null;
};

export type LiveAgentPresenceAvatar = {
  actorId: string;
  label: string;
  avatarId: string;
  color: string;
  role: LiveSessionMemberView["role"];
  position: AgentWorldVector3;
  station: AgentXMissionStation | null;
  stageId: string | null;
  workState: LiveAgentWorkState;
};

export type LiveAgentActivity = {
  kind: "joined" | "operation";
  actorId: string;
  actorLabel: string;
  actorKind: LiveSessionMemberView["kind"];
  intent: string;
  revision: number | null;
  at: string;
};

export type LiveAgentPresenceState = {
  sessionId: string | null;
  connection: LiveSessionConnection;
  centerReady: boolean;
  agents: LiveAgentPresenceAvatar[];
  activity: LiveAgentActivity | null;
  signalVisible: boolean;
  error: string | null;
};

export interface LiveAgentPresenceController {
  setSession: (sessionId: string | null) => void;
  setConnection: (connection: LiveSessionConnection) => void;
  syncMembers: (members: LiveSessionMemberView[]) => void;
  syncMissionAssignments: (assignments: LiveAgentMissionAssignment[]) => void;
  recordOperation: (operation: LiveSessionOperation) => void;
  state: () => LiveAgentPresenceState;
  dispose: () => void;
}

type AvatarMotion = {
  avatarId: string;
  from: Vector3;
  to: Vector3;
  elapsed: number;
  duration: number;
};

export function createLiveAgentPresenceController(options: {
  runtime: AgentWorldRuntime;
  subscribeFrame?: (listener: (deltaSeconds: number) => void) => () => void;
  onState?: (state: LiveAgentPresenceState) => void;
}): LiveAgentPresenceController {
  const { runtime, onState } = options;
  let sessionId: string | null = null;
  let connection: LiveSessionConnection = "offline";
  let cachedMembers: LiveSessionMemberView[] = [];
  let avatars: LiveAgentPresenceAvatar[] = [];
  let activity: LiveAgentActivity | null = null;
  let signalVisible = false;
  let lastError: string | null = null;
  let disposed = false;
  let avatarSignature = "";
  let reactionToken = 0;
  let reactionTimer: ReturnType<typeof setTimeout> | null = null;
  const onlineActors = new Set<string>();
  const slots = new Map<string, number>();
  const lastAgentRevision = new Map<string, number>();
  const missionAssignments = new Map<string, LiveAgentMissionAssignment>();
  const motions = new Map<string, AvatarMotion>();
  let reducedMotion = motionIsReduced();

  const centerReady = (): boolean =>
    runtime.query({ ids: [NESTOR_STAGE_ID, NESTOR_AGENT_ID] }).length === 2;

  const snapshot = (): LiveAgentPresenceState => {
    const worldPositions = new Map(
      runtime.query({ ids: avatars.map((avatar) => avatar.avatarId) })
        .map((entity) => [entity.id, entity.position] as const),
    );
    return {
      sessionId,
      connection,
      centerReady: centerReady(),
      agents: avatars.map((avatar) => ({
        ...avatar,
        position: [...(worldPositions.get(avatar.avatarId) ?? avatar.position)] as AgentWorldVector3,
      })),
      activity: activity ? { ...activity } : null,
      signalVisible,
      error: lastError,
    };
  };

  const notify = (): void => onState?.(snapshot());

  const clearReactionTimer = (): void => {
    if (reactionTimer) clearTimeout(reactionTimer);
    reactionTimer = null;
  };

  const clearAll = (): void => {
    clearReactionTimer();
    reactionToken += 1;
    motions.clear();
    runtime.clearTransientEntities(AVATAR_SCOPE);
    runtime.clearTransientEntities(REACTION_SCOPE);
    cachedMembers = [];
    avatars = [];
    onlineActors.clear();
    slots.clear();
    lastAgentRevision.clear();
    missionAssignments.clear();
    activity = null;
    signalVisible = false;
    lastError = null;
    avatarSignature = "";
  };

  const hideDisconnectedPresence = (): void => {
    clearReactionTimer();
    reactionToken += 1;
    motions.clear();
    runtime.clearTransientEntities(AVATAR_SCOPE);
    runtime.clearTransientEntities(REACTION_SCOPE);
    avatars = [];
    activity = null;
    signalVisible = false;
    avatarSignature = "";
  };

  const allocateSlot = (actorId: string): number => {
    const existing = slots.get(actorId);
    if (existing !== undefined) return existing;
    const occupied = new Set(slots.values());
    const start = stableHash(actorId) % CENTER_SLOTS.length;
    for (let offset = 0; offset < CENTER_SLOTS.length; offset += 1) {
      const candidate = (start + offset) % CENTER_SLOTS.length;
      if (!occupied.has(candidate)) {
        slots.set(actorId, candidate);
        return candidate;
      }
    }
    let overflow = CENTER_SLOTS.length;
    while (occupied.has(overflow)) overflow += 1;
    slots.set(actorId, overflow);
    return overflow;
  };

  const slotPosition = (slot: number, inCenter: boolean): AgentWorldVector3 => {
    const fixed = (inCenter ? CENTER_SLOTS : WORLD_SLOTS)[slot];
    if (fixed) return [...fixed] as AgentWorldVector3;
    const overflow = slot - CENTER_SLOTS.length;
    const angle = (overflow * 137.508) * Math.PI / 180;
    const radius = 6.2 + Math.floor(overflow / 8) * 1.5;
    return [
      Number((Math.cos(angle) * radius).toFixed(3)),
      0.36,
      Number((Math.sin(angle) * radius).toFixed(3)),
    ];
  };

  const stationPose = (
    assignment: LiveAgentMissionAssignment,
    stationIndex: number,
    stationCount: number,
  ): { position: AgentWorldVector3; rotationDegrees: AgentWorldVector3 } => {
    const target = AGENTX_STATIONS[assignment.station];
    const stand = target.standPosition;
    const face = target.facingPosition;
    const dx = face[0] - stand[0];
    const dz = face[2] - stand[2];
    const length = Math.hypot(dx, dz) || 1;
    const lateral = (stationIndex - (stationCount - 1) / 2) * 0.88;
    const position: AgentWorldVector3 = [
      Number((stand[0] + (dz / length) * lateral).toFixed(3)),
      stand[1],
      Number((stand[2] - (dx / length) * lateral).toFixed(3)),
    ];
    const yaw = Math.atan2(face[0] - position[0], face[2] - position[2]) * 180 / Math.PI;
    return { position, rotationDegrees: [0, Number(yaw.toFixed(3)), 0] };
  };

  const avatarDefinition = (
    member: LiveSessionMemberView,
    inCenter: boolean,
    stationIndex: number,
    stationCount: number,
  ): { definition: AgentWorldEntityDefinition; avatar: LiveAgentPresenceAvatar } => {
    const color = validPresenceColor(member.presence?.color) ?? colorForActor(member.actorId);
    const slot = allocateSlot(member.actorId);
    const cursor = member.presence?.cursor;
    const assignment = missionAssignments.get(member.actorId) ?? null;
    const station = assignment ? stationPose(assignment, stationIndex, stationCount) : null;
    // Explicit shared cursor state always wins. Mission choreography is only the fallback.
    const position: AgentWorldVector3 = cursor
      ? [cursor.x, cursor.y, cursor.z]
      : station?.position ?? slotPosition(slot, inCenter);
    const rotationDegrees: AgentWorldVector3 = cursor
      ? [0, 180, 0]
      : station?.rotationDegrees ?? [0, 180, 0];
    const avatarId = avatarIdFor(member.actorId);
    const acceptedRevision = lastAgentRevision.get(member.actorId);
    const capabilities = member.capabilities?.length ? [...member.capabilities] : [member.role];
    const workState = assignment?.state ?? "online";
    const visual = statusVisual(workState, color, acceptedRevision !== undefined);
    const reducedMotion = motionIsReduced();
    const behaviors: AgentWorldEntityDefinition["behaviors"] = reducedMotion ? [] : [{
      id: `presence-hover-${stableHash(member.actorId).toString(36)}`,
      type: "bob",
      axis: "y",
      amplitude: workState === "working" ? 0.09 : 0.055,
      frequencyHz: workState === "working" ? 0.48 : 0.3,
      phaseDegrees: stableHash(member.actorId) % 360,
    }];
    return {
      definition: {
        id: avatarId,
        ...(inCenter && !cursor && !assignment ? { parentId: NESTOR_STAGE_ID } : {}),
        type: "agent",
        label: `${member.label} · live AgentX · ${visual.label}`,
        geometry: { radius: 0.55, height: 2.55, radialSegments: 18 },
        transform: { position, rotationDegrees, scale: [0.9, 0.9, 0.9] },
        material: {
          color,
          emissive: visual.emissive,
          emissiveIntensity: visual.intensity,
          roughness: 0.2,
          metalness: 0.52,
          opacity: visual.opacity,
        },
        agent: {
          role: `Live ${member.role} collaborator`,
          status: assignment
            ? `${workState} at ${assignment.station}${assignment.stageId ? ` · ${assignment.stageId}` : ""}`
            : acceptedRevision === undefined ? "online" : `online · accepted revision ${acceptedRevision}`,
          perceptionRadius: 6,
          capabilities,
        },
        behaviors,
        castShadow: false,
        receiveShadow: false,
        ephemeral: true,
        tags: [
          "live-presence",
          "live-agent",
          `live-actor:${member.actorId}`,
          `live-status:${workState}`,
          ...(assignment ? [`live-station:${assignment.station}`] : []),
        ],
      },
      avatar: {
        actorId: member.actorId,
        label: member.label,
        avatarId,
        color,
        role: member.role,
        position,
        station: assignment?.station ?? null,
        stageId: assignment?.stageId ?? null,
        workState,
      },
    };
  };

  const setAvatarWorldPosition = (avatarId: string, worldPosition: Vector3): boolean => {
    const object = runtime.getEntityObject(avatarId);
    if (!object) return false;
    if (object.parent) {
      object.parent.updateWorldMatrix(true, false);
      object.position.copy(object.parent.worldToLocal(worldPosition.clone()));
    } else {
      object.position.copy(worldPosition);
    }
    object.updateMatrixWorld(true);
    return true;
  };

  const advanceMotions = (deltaSeconds: number): void => {
    if (disposed) return;
    const nextReducedMotion = motionIsReduced();
    if (nextReducedMotion !== reducedMotion) {
      for (const motion of motions.values()) setAvatarWorldPosition(motion.avatarId, motion.to);
      motions.clear();
      reducedMotion = nextReducedMotion;
      if (activity && signalVisible) {
        const result = runtime.reconcileTransientEntities(REACTION_SCOPE, reactionDefinitions(activity));
        signalVisible = result.ok && centerReady();
        if (!result.ok) lastError = result.error ?? "Could not adapt Nestor live activity";
      }
      avatarSignature = "";
      reconcileAvatars(false, true, true);
      return;
    }
    if (motions.size === 0 || reducedMotion) return;
    for (const [avatarId, motion] of motions) {
      motion.elapsed = Math.min(motion.duration, motion.elapsed + Math.max(0, deltaSeconds));
      const linear = motion.elapsed / motion.duration;
      const eased = linear * linear * (3 - 2 * linear);
      const position = motion.from.clone().lerp(motion.to, eased);
      if (!setAvatarWorldPosition(avatarId, position) || linear >= 1) motions.delete(avatarId);
    }
  };

  const reconcileAvatars = (announceJoins: boolean, force = false, rebuild = false): void => {
    if (!sessionId || connection !== "live" || disposed) return;
    const members = freshestOnlineAgents(cachedMembers);
    slots.clear();
    for (const member of members) allocateSlot(member.actorId);

    const stationGroups = new Map<AgentXMissionStation, string[]>();
    for (const member of members) {
      const assignment = missionAssignments.get(member.actorId);
      if (!assignment) continue;
      const group = stationGroups.get(assignment.station) ?? [];
      group.push(member.actorId);
      stationGroups.set(assignment.station, group);
    }
    for (const group of stationGroups.values()) group.sort((left, right) => left.localeCompare(right));

    const inCenter = centerReady();
    const nextSignature = JSON.stringify({
      inCenter,
      reducedMotion: motionIsReduced(),
      members: members.map((member) => ({
        actorId: member.actorId,
        memberId: member.memberId,
        label: member.label,
        role: member.role,
        capabilities: member.capabilities,
        cursor: member.presence?.cursor ?? null,
        color: member.presence?.color ?? null,
        acceptedRevision: lastAgentRevision.get(member.actorId) ?? null,
        assignment: missionAssignments.get(member.actorId) ?? null,
      })),
    });
    if (!force && nextSignature === avatarSignature) {
      notify();
      return;
    }

    const nextActors = new Set(members.map((member) => member.actorId));
    const joined = members.filter((member) => !onlineActors.has(member.actorId));
    const built = members.map((member) => {
      const assignment = missionAssignments.get(member.actorId);
      const group = assignment ? stationGroups.get(assignment.station) ?? [] : [];
      return avatarDefinition(member, inCenter, Math.max(0, group.indexOf(member.actorId)), Math.max(1, group.length));
    });
    const expectedIds = built.map(({ avatar }) => avatar.avatarId);
    const previousPositions = new Map(
      runtime.query({ ids: expectedIds }).map((entity) => [entity.id, entity.position] as const),
    );
    const activeIds = new Set(previousPositions.keys());
    const canPatch = !rebuild
      && expectedIds.length === avatars.length
      && expectedIds.every((id) => activeIds.has(id) && avatars.some((avatar) => avatar.avatarId === id));
    let updateOk = canPatch;
    let updateError: string | null = null;
    if (canPatch) {
      for (const { definition, avatar } of built) {
        const patch: AgentWorldEntityPatch = {
          label: definition.label,
          parentId: definition.parentId ?? null,
          ...(definition.transform ? { transform: definition.transform } : {}),
          ...(definition.material ? { material: definition.material } : {}),
          ...(definition.agent ? { agent: definition.agent } : {}),
          visible: definition.visible ?? true,
          castShadow: definition.castShadow ?? false,
          receiveShadow: definition.receiveShadow ?? false,
          ephemeral: true,
          tags: definition.tags ?? [],
        };
        const updated = runtime.updateTransientEntity(AVATAR_SCOPE, avatar.avatarId, patch);
        if (!updated.ok) {
          updateOk = false;
          updateError = updated.error ?? "Could not patch a live AgentX avatar";
          break;
        }
      }
    }
    if (!updateOk) {
      const result = runtime.reconcileTransientEntities(AVATAR_SCOPE, built.map(({ definition }) => definition));
      updateOk = result.ok;
      updateError = result.ok ? null : result.error ?? updateError ?? "Could not reconcile live AgentX avatars";
    }
    if (!updateOk) {
      lastError = updateError;
      notify();
      return;
    }

    lastError = null;
    avatarSignature = nextSignature;
    const finalPositions = new Map(
      runtime.query({ ids: expectedIds }).map((entity) => [entity.id, entity.position] as const),
    );
    motions.clear();
    if (!motionIsReduced()) {
      for (const { avatar } of built) {
        const fromValue = previousPositions.get(avatar.avatarId);
        const toValue = finalPositions.get(avatar.avatarId);
        if (!fromValue || !toValue) continue;
        const from = new Vector3(...fromValue);
        const to = new Vector3(...toValue);
        const distance = from.distanceTo(to);
        if (distance < 0.02) continue;
        motions.set(avatar.avatarId, {
          avatarId: avatar.avatarId,
          from,
          to,
          elapsed: 0,
          duration: Math.min(1.2, Math.max(0.5, 0.42 + distance / 8)),
        });
        setAvatarWorldPosition(avatar.avatarId, from);
      }
    }
    avatars = built.map(({ avatar }) => ({
      ...avatar,
      position: [...(finalPositions.get(avatar.avatarId) ?? avatar.position)] as AgentWorldVector3,
    }));

    onlineActors.clear();
    for (const actorId of nextActors) onlineActors.add(actorId);
    if (activity && !nextActors.has(activity.actorId)) {
      clearReactionTimer();
      reactionToken += 1;
      runtime.clearTransientEntities(REACTION_SCOPE);
      activity = null;
      signalVisible = false;
    }
    if (announceJoins && joined.length > 0) {
      const member = joined[joined.length - 1];
      showActivity({
        kind: "joined",
        actorId: member.actorId,
        actorLabel: member.label,
        actorKind: member.kind,
        intent: `${member.label} joined the AgentX Center`,
        revision: null,
        at: member.lastSeenAt ?? new Date().toISOString(),
      });
      return;
    }
    notify();
  };

  const reactionDefinitions = (value: LiveAgentActivity): AgentWorldEntityDefinition[] => {
    if (!centerReady()) return [];
    const color = colorForActor(value.actorId);
    const reducedMotion = motionIsReduced();
    const definitions: AgentWorldEntityDefinition[] = [
      {
        id: "live-nestor:signal-ring",
        parentId: NESTOR_STAGE_ID,
        type: "torus",
        label: `${value.actorLabel} accepted signal`,
        geometry: { radius: 2.08, tube: 0.09, radialSegments: 64 },
        transform: { position: [0, 4.55, -0.08], rotationDegrees: [12, 0, 0] },
        material: { color, emissive: color, emissiveIntensity: 2.5, roughness: 0.08, metalness: 0.56, opacity: 0.88 },
        behaviors: reducedMotion ? [] : [
          { id: "live-signal-spin", type: "spin", axis: "y", speedDegrees: 52 },
          { id: "live-signal-pulse", type: "pulse", minimumScale: 0.9, maximumScale: 1.18, frequencyHz: 1.25 },
        ],
        castShadow: false,
        receiveShadow: false,
        ephemeral: true,
        tags: ["live-presence", "nestor-live-activity", `live-actor:${value.actorId}`],
      },
      {
        id: "live-nestor:signal-light",
        parentId: NESTOR_STAGE_ID,
        type: "point-light",
        label: "Nestor live activity light",
        transform: { position: [0, 3.55, 1.15] },
        intensity: 6.2,
        distance: 9,
        marker: false,
        material: { color, emissive: color, emissiveIntensity: 1.8 },
        castShadow: false,
        receiveShadow: false,
        ephemeral: true,
        tags: ["live-presence", "nestor-live-activity", `live-actor:${value.actorId}`],
      },
    ];
    if (!reducedMotion) {
      definitions.splice(1, 0, {
        id: "live-nestor:signal-aura",
        parentId: NESTOR_STAGE_ID,
        type: "emitter",
        label: "Nestor accepted-operation aura",
        transform: { position: [0, 3.65, -0.2] },
        emitter: {
          preset: "energy-orb",
          sizeScale: 2.4,
          speed: 1.8,
          spread: 1.35,
          maxParticles: 28,
          rate: 38,
          color,
        },
        castShadow: false,
        receiveShadow: false,
        ephemeral: true,
        tags: ["live-presence", "nestor-live-activity", `live-actor:${value.actorId}`],
      });
    }
    return definitions;
  };

  function showActivity(value: LiveAgentActivity): void {
    if (!sessionId || connection !== "live" || disposed) return;
    const result = runtime.reconcileTransientEntities(REACTION_SCOPE, reactionDefinitions(value));
    if (!result.ok) {
      lastError = result.error ?? "Could not show Nestor's live reaction";
      notify();
      return;
    }
    activity = { ...value };
    reactionToken += 1;
    const token = reactionToken;
    clearReactionTimer();
    signalVisible = centerReady();
    lastError = null;
    notify();
    reactionTimer = setTimeout(() => {
      if (disposed || token !== reactionToken) return;
      runtime.clearTransientEntities(REACTION_SCOPE);
      signalVisible = false;
      reactionTimer = null;
      notify();
    }, REACTION_MS);
  }

  const unsubscribeFrame = options.subscribeFrame?.(advanceMotions) ?? (() => undefined);

  const unsubscribe = runtime.subscribeEvents((event) => {
    if (event.type !== "world.loaded" || !sessionId || connection !== "live" || disposed) return;
    queueMicrotask(() => {
      if (!sessionId || connection !== "live" || disposed) return;
      motions.clear();
      avatars = [];
      avatarSignature = "";
      reconcileAvatars(false, true);
      if (activity && signalVisible) {
        signalVisible = false;
        const result = runtime.reconcileTransientEntities(REACTION_SCOPE, reactionDefinitions(activity));
        signalVisible = result.ok && centerReady();
        notify();
      }
    });
  });

  return {
    setSession(nextSessionId) {
      if (disposed || nextSessionId === sessionId) return;
      clearAll();
      sessionId = nextSessionId;
      if (!nextSessionId) connection = "offline";
      notify();
    },

    setConnection(nextConnection) {
      if (disposed || nextConnection === connection) return;
      connection = nextConnection;
      if (connection !== "live") hideDisconnectedPresence();
      notify();
    },

    syncMembers(members) {
      if (disposed) return;
      cachedMembers = members.map(cloneMember);
      if (!sessionId || connection !== "live") {
        motions.clear();
        runtime.clearTransientEntities(AVATAR_SCOPE);
        avatars = [];
        notify();
        return;
      }
      reconcileAvatars(true);
    },

    syncMissionAssignments(assignments) {
      if (disposed) return;
      missionAssignments.clear();
      const ordered = assignments
        .map((assignment) => ({ ...assignment, stageId: assignment.stageId ?? null }))
        .sort((left, right) => left.actorId.localeCompare(right.actorId)
          || (left.stageId ?? "").localeCompare(right.stageId ?? ""));
      for (const assignment of ordered) {
        if (!missionAssignments.has(assignment.actorId)) missionAssignments.set(assignment.actorId, assignment);
      }
      if (!sessionId || connection !== "live") {
        notify();
        return;
      }
      reconcileAvatars(false, true);
    },

    recordOperation(operation) {
      if (disposed || !sessionId || operation.sessionId !== sessionId) return;
      if (operation.actorKind === "agent") lastAgentRevision.set(operation.actorId, operation.revision);
      reconcileAvatars(false);
      if (operation.actorKind !== "agent") return;
      showActivity({
        kind: "operation",
        actorId: operation.actorId,
        actorLabel: operation.actorLabel,
        actorKind: operation.actorKind,
        intent: operation.intent?.trim() || `${operation.actorLabel} changed the scene`,
        revision: operation.revision,
        at: operation.at,
      });
    },

    state: snapshot,

    dispose() {
      if (disposed) return;
      clearAll();
      sessionId = null;
      connection = "offline";
      disposed = true;
      unsubscribeFrame();
      unsubscribe();
    },
  };
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

function freshestOnlineAgents(members: LiveSessionMemberView[]): LiveSessionMemberView[] {
  const byActor = new Map<string, LiveSessionMemberView>();
  for (const member of members) {
    if (member.kind !== "agent") continue;
    const current = byActor.get(member.actorId);
    if (!current || isFresherMember(member, current)) byActor.set(member.actorId, member);
  }
  return [...byActor.values()]
    .filter((member) => member.online)
    .sort((left, right) => left.actorId.localeCompare(right.actorId));
}

function isFresherMember(candidate: LiveSessionMemberView, current: LiveSessionMemberView): boolean {
  if (candidate.online !== current.online) return candidate.online;
  const joinedDifference = timestamp(candidate.joinedAt) - timestamp(current.joinedAt);
  if (joinedDifference !== 0) return joinedDifference > 0;
  const seenDifference = timestamp(candidate.lastSeenAt) - timestamp(current.lastSeenAt);
  if (seenDifference !== 0) return seenDifference > 0;
  return candidate.memberId.localeCompare(current.memberId) > 0;
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function motionIsReduced(): boolean {
  const preference = typeof document === "undefined" ? undefined : document.documentElement.dataset.gxMotion;
  if (preference === "reduce") return true;
  if (preference === "full") return false;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function statusVisual(
  state: LiveAgentWorkState,
  actorColor: string,
  hasAcceptedRevision: boolean,
): { label: string; emissive: string; intensity: number; opacity: number } {
  switch (state) {
    case "working":
      return { label: "working", emissive: actorColor, intensity: 1.55, opacity: 0.96 };
    case "blocked":
      return { label: "blocked", emissive: "#ff9e58", intensity: 1.48, opacity: 0.96 };
    case "completed":
      return { label: "completed", emissive: "#68efaa", intensity: 1.2, opacity: 0.88 };
    case "disconnected":
      return { label: "disconnected", emissive: "#5f6f82", intensity: 0.16, opacity: 0.5 };
    default:
      return { label: "online", emissive: actorColor, intensity: hasAcceptedRevision ? 1.12 : 0.66, opacity: 0.9 };
  }
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function avatarIdFor(actorId: string): string {
  const readable = actorId.toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").slice(0, 38) || "agent";
  return `live-agent:${readable}:${stableHash(actorId).toString(36)}`;
}

function colorForActor(actorId: string): string {
  return AGENT_COLORS[stableHash(actorId) % AGENT_COLORS.length];
}

function validPresenceColor(value: string | null | undefined): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

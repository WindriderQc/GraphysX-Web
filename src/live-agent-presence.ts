// Scene-native projection of live-session agent membership.
//
// Membership and accepted-operation events are transport state, not authored scene changes.
// The controller therefore reconciles host-owned transient entities directly on the runtime:
// they use the same resolver, renderer, behaviors, disposal, and single frame loop as every
// other entity, while staying out of revisions, undo/redo, commits, and portable scene JSON.

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

export type LiveAgentPresenceAvatar = {
  actorId: string;
  label: string;
  avatarId: string;
  color: string;
  role: LiveSessionMemberView["role"];
  position: AgentWorldVector3;
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
  recordOperation: (operation: LiveSessionOperation) => void;
  state: () => LiveAgentPresenceState;
  dispose: () => void;
}

export function createLiveAgentPresenceController(options: {
  runtime: AgentWorldRuntime;
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

  const centerReady = (): boolean =>
    runtime.query({ ids: [NESTOR_STAGE_ID, NESTOR_AGENT_ID] }).length === 2;

  const snapshot = (): LiveAgentPresenceState => ({
    sessionId,
    connection,
    centerReady: centerReady(),
    agents: avatars.map((avatar) => ({ ...avatar, position: [...avatar.position] as AgentWorldVector3 })),
    activity: activity ? { ...activity } : null,
    signalVisible,
    error: lastError,
  });

  const notify = (): void => onState?.(snapshot());

  const clearReactionTimer = (): void => {
    if (reactionTimer) clearTimeout(reactionTimer);
    reactionTimer = null;
  };

  const clearAll = (): void => {
    clearReactionTimer();
    reactionToken += 1;
    runtime.clearTransientEntities(AVATAR_SCOPE);
    runtime.clearTransientEntities(REACTION_SCOPE);
    cachedMembers = [];
    avatars = [];
    onlineActors.clear();
    slots.clear();
    lastAgentRevision.clear();
    activity = null;
    signalVisible = false;
    lastError = null;
    avatarSignature = "";
  };

  const hideDisconnectedPresence = (): void => {
    clearReactionTimer();
    reactionToken += 1;
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
    // More than eight simultaneous agents form a second, deterministic outer ring.
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

  const avatarDefinition = (
    member: LiveSessionMemberView,
    inCenter: boolean,
  ): { definition: AgentWorldEntityDefinition; avatar: LiveAgentPresenceAvatar } => {
    const color = validPresenceColor(member.presence?.color) ?? colorForActor(member.actorId);
    const slot = allocateSlot(member.actorId);
    const cursor = member.presence?.cursor;
    const followsCursor = Boolean(cursor);
    const position: AgentWorldVector3 = cursor
      ? [cursor.x, cursor.y, cursor.z]
      : slotPosition(slot, inCenter);
    const avatarId = avatarIdFor(member.actorId);
    const acceptedRevision = lastAgentRevision.get(member.actorId);
    const capabilities = member.capabilities?.length
      ? [...member.capabilities]
      : [member.role];
    return {
      definition: {
        id: avatarId,
        ...(inCenter && !followsCursor ? { parentId: NESTOR_STAGE_ID } : {}),
        type: "agent",
        label: `${member.label} · live AgentX`,
        geometry: { radius: 0.55, height: 2.55, radialSegments: 18 },
        transform: { position, rotationDegrees: [0, 180, 0], scale: [0.9, 0.9, 0.9] },
        material: {
          color,
          emissive: color,
          emissiveIntensity: acceptedRevision === undefined ? 0.66 : 1.18,
          roughness: 0.2,
          metalness: 0.52,
          opacity: 0.9,
        },
        agent: {
          role: `Live ${member.role} collaborator`,
          status: acceptedRevision === undefined ? "online" : `accepted revision ${acceptedRevision}`,
          perceptionRadius: 6,
          capabilities,
        },
        behaviors: [{
          id: `presence-hover-${stableHash(member.actorId).toString(36)}`,
          type: "bob",
          axis: "y",
          amplitude: 0.07,
          frequencyHz: 0.36,
          phaseDegrees: stableHash(member.actorId) % 360,
        }],
        castShadow: false,
        receiveShadow: false,
        ephemeral: true,
        tags: ["live-presence", "live-agent", `live-actor:${member.actorId}`],
      },
      avatar: {
        actorId: member.actorId,
        label: member.label,
        avatarId,
        color,
        role: member.role,
        position,
      },
    };
  };

  const reconcileAvatars = (announceJoins: boolean, force = false): void => {
    if (!sessionId || connection !== "live" || disposed) return;
    const byActor = new Map<string, LiveSessionMemberView>();
    for (const member of cachedMembers) {
      if (member.kind !== "agent" || !member.online || byActor.has(member.actorId)) continue;
      byActor.set(member.actorId, member);
    }
    const members = [...byActor.values()].sort((left, right) => left.actorId.localeCompare(right.actorId));
    const inCenter = centerReady();
    const nextSignature = JSON.stringify({
      inCenter,
      members: members.map((member) => ({
        actorId: member.actorId,
        label: member.label,
        role: member.role,
        capabilities: member.capabilities,
        cursor: member.presence?.cursor ?? null,
        color: member.presence?.color ?? null,
        acceptedRevision: lastAgentRevision.get(member.actorId) ?? null,
      })),
    });
    if (!force && nextSignature === avatarSignature) {
      notify();
      return;
    }
    const nextActors = new Set(members.map((member) => member.actorId));
    for (const actorId of [...slots.keys()]) if (!nextActors.has(actorId)) slots.delete(actorId);
    const joined = members.filter((member) => !onlineActors.has(member.actorId));
    const built = members.map((member) => avatarDefinition(member, inCenter));
    const expectedIds = built.map(({ avatar }) => avatar.avatarId);
    const activeIds = new Set(runtime.query({ ids: expectedIds }).map((entity) => entity.id));
    const canPatch = expectedIds.length === avatars.length
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
      // Reconciliation restores the prior scope on failure. Keep the matching controller
      // projection instead of claiming that a still-visible avatar disappeared.
      lastError = updateError;
      notify();
      return;
    } else {
      lastError = null;
      avatarSignature = nextSignature;
      const worldPositions = new Map(
        runtime.query({ ids: built.map(({ avatar }) => avatar.avatarId) })
          .map((entity) => [entity.id, entity.position] as const),
      );
      avatars = built.map(({ avatar }) => ({
        ...avatar,
        position: [...(worldPositions.get(avatar.avatarId) ?? avatar.position)] as AgentWorldVector3,
      }));
    }
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
    return [
      {
        id: "live-nestor:signal-ring",
        parentId: NESTOR_STAGE_ID,
        type: "torus",
        label: `${value.actorLabel} accepted signal`,
        geometry: { radius: 2.08, tube: 0.09, radialSegments: 64 },
        transform: { position: [0, 4.55, -0.08], rotationDegrees: [12, 0, 0] },
        material: { color, emissive: color, emissiveIntensity: 2.5, roughness: 0.08, metalness: 0.56, opacity: 0.88 },
        behaviors: [
          { id: "live-signal-spin", type: "spin", axis: "y", speedDegrees: 52 },
          { id: "live-signal-pulse", type: "pulse", minimumScale: 0.9, maximumScale: 1.18, frequencyHz: 1.25 },
        ],
        castShadow: false,
        receiveShadow: false,
        ephemeral: true,
        tags: ["live-presence", "nestor-live-activity", `live-actor:${value.actorId}`],
      },
      {
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
  };

  function showActivity(value: LiveAgentActivity): void {
    if (!sessionId || connection !== "live" || disposed) return;
    const result = runtime.reconcileTransientEntities(REACTION_SCOPE, reactionDefinitions(value));
    if (!result.ok) {
      // The runtime restored the prior reaction scope, so preserve its matching state/timer.
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

  const unsubscribe = runtime.subscribeEvents((event) => {
    if (event.type !== "world.loaded" || !sessionId || connection !== "live" || disposed) return;
    // `world.loaded` intentionally clears host-owned scope bookkeeping. Re-project the
    // current membership after the incoming document and its rules have settled.
    queueMicrotask(() => {
      if (!sessionId || connection !== "live" || disposed) return;
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
      // A fresh server presence snapshot follows every `hello`; do not repaint stale cached
      // membership during the gap between those two SSE frames.
      notify();
    },

    syncMembers(members) {
      if (disposed) return;
      cachedMembers = members.map((member) => ({
        ...member,
        capabilities: member.capabilities ? [...member.capabilities] : null,
        presence: member.presence ? {
          ...member.presence,
          cursor: member.presence.cursor ? { ...member.presence.cursor } : null,
          selection: [...member.presence.selection],
        } : null,
      }));
      if (!sessionId || connection !== "live") {
        runtime.clearTransientEntities(AVATAR_SCOPE);
        avatars = [];
        notify();
        return;
      }
      reconcileAvatars(true);
    },

    recordOperation(operation) {
      if (disposed || !sessionId || operation.sessionId !== sessionId) return;
      if (operation.actorKind === "agent") lastAgentRevision.set(operation.actorId, operation.revision);
      // Include center topology in the signature: unrelated human edits are a no-op, while
      // removing/restoring Nestor still reparents the live avatars correctly.
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
      unsubscribe();
    },
  };
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

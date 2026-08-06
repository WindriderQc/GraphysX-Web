// Browser client for Live Sessions (server/live-sessions.mjs).
//
// The rule this file exists to honour: a remote actor's change reaches this tab as a
// *command list*, and it is applied through `api.commit` — the same validated, attributed,
// receipt-producing transaction path a local human edit takes. There is no private apply
// path for remote work. The only whole-document transfer is the initial snapshot and an
// explicit resync, which is what a snapshot is for.
//
// Two things deliberately do NOT go through the scene document:
//   - presence (cursor, selection, active tool) — ephemeral, never revisioned, never stored
//   - session membership — it describes who is here, not what the scene is
//
// See docs/LIVE_SESSIONS.md for the protocol and the threat model.

import type { AgentWorldCommand, AgentWorldDefinition, GraphysXAgentWorldApi } from "./agent-world-runtime";
import type {
  LiveMissionEvent,
  LiveMissionProgressRequest,
  LiveMissionReceipt,
  LiveMissionStartRequest,
  LiveMissionView,
} from "./live-mission-types";
export * from "./live-mission-types";

export const LIVE_SESSION_SCHEMA = "graphysx.live-session/v1";
export const LIVE_OP_SCHEMA = "graphysx.live-op/v1";

export type LiveSessionRole = "owner" | "editor" | "viewer" | "agent";

export type LiveSessionMemberView = {
  memberId: string;
  actorId: string;
  label: string;
  kind: "human" | "agent" | "system";
  role: LiveSessionRole;
  capabilities: string[] | null;
  joinedAt: string;
  online: boolean;
  lastSeenAt: string | null;
  presence: {
    cursor: { x: number; y: number; z: number } | null;
    selection: string[];
    tool: string | null;
    color: string | null;
  } | null;
};

export type LiveSessionView = {
  schema: typeof LIVE_SESSION_SCHEMA;
  sessionId: string;
  sceneName: string;
  label: string;
  ownerActorId: string;
  status: "open" | "expired";
  createdAt: string;
  expiresAt: string;
  revision: number;
  seq: number;
  members: LiveSessionMemberView[];
  missions: LiveMissionView[];
};

/** One accepted mutation, as every other member sees it. */
export type LiveSessionOperation = {
  schema: typeof LIVE_OP_SCHEMA;
  event: "op";
  seq: number;
  sessionId: string;
  opId: string;
  actorId: string;
  actorKind: "human" | "agent" | "system";
  actorLabel: string;
  memberId: string;
  role: LiveSessionRole;
  path: string;
  commands: AgentWorldCommand[];
  outputs: unknown[];
  intent: string;
  baseRevision: number;
  revision: number;
  at: string;
};

/** Connection state, for the health indicator. Ordered by how alarming it is. */
export type LiveSessionConnection = "offline" | "connecting" | "reconnecting" | "live";

export type LiveSessionStatus = {
  connection: LiveSessionConnection;
  sessionId: string | null;
  role: LiveSessionRole | null;
  actorId: string | null;
  /** Store revision this tab has applied up to. */
  revision: number;
  /** Last session event sequence received; what a reconnect resumes from. */
  seq: number;
  /** Round-trip milliseconds of the last operation or presence post, null before the first. */
  latencyMs: number | null;
  /** True once a resync has happened, so the UI can say so rather than imply continuity. */
  resynced: boolean;
  members: LiveSessionMemberView[];
  missions: LiveMissionView[];
  error: string | null;
};

export class LiveSessionError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly revision: number | null;
  /** Present on an `undo-unsafe` refusal: whose later work is in the way. */
  readonly blockedBy: { actorId: string; revision: number; opId: string } | null;

  constructor(
    message: string,
    status: number,
    code: string | null = null,
    revision: number | null = null,
    blockedBy: { actorId: string; revision: number; opId: string } | null = null,
  ) {
    super(message);
    this.name = "LiveSessionError";
    this.status = status;
    this.code = code;
    this.revision = revision;
    this.blockedBy = blockedBy;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

export type LiveSessionEvents = {
  onStatus?: (status: LiveSessionStatus) => void;
  /** An accepted mutation, after it has been applied to this tab's runtime. */
  onOperation?: (operation: LiveSessionOperation) => void;
  onMembers?: (members: LiveSessionMemberView[]) => void;
  /** Full authoritative replacements from snapshots and ordered mission events. */
  onMissions?: (missions: LiveMissionView[]) => void;
  /** One accepted transition in the shared live-session sequence. */
  onMission?: (event: LiveMissionEvent) => void;
  onResync?: (revision: number) => void;
  onError?: (error: Error) => void;
};

type ClientOptions = {
  baseUrl: string;
  api: GraphysXAgentWorldApi;
  events?: LiveSessionEvents;
  /** Injectable for tests; defaults to the real thing. */
  fetchImpl?: typeof fetch;
};

const RECONNECT_STEPS_MS = [500, 1000, 2000, 4000, 8000, 15000];

/**
 * Strips session secrets from the address bar.
 *
 * An invitation arrives as `#session=<id>&invite=<code>`. Once exchanged it is worthless,
 * but the browser keeps the URL in history, hands it to any page the user navigates to as a
 * referrer, and shows it in a screen share. `replaceState` removes it without a navigation.
 */
export function consumeInviteFromLocation(location: Location, history: History): { sessionId: string; code: string } | null {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const sessionId = params.get("session");
  const code = params.get("invite");
  if (!sessionId || !code) return null;
  params.delete("session");
  params.delete("invite");
  const rest = params.toString();
  history.replaceState(null, "", `${location.pathname}${location.search}${rest ? `#${rest}` : ""}`);
  return { sessionId, code };
}

export function createLiveSessionClient({ baseUrl, api, events = {}, fetchImpl = fetch }: ClientOptions) {
  const root = baseUrl.replace(/\/+$/, "");
  let credential: string | null = null;
  let sessionId: string | null = null;
  let sceneName: string | null = null;
  let role: LiveSessionRole | null = null;
  let actorId: string | null = null;
  let actorLabel: string | null = null;
  let actorKind: LiveSessionMemberView["kind"] | null = null;
  let memberId: string | null = null;
  let seq = 0;
  let revision = 0;
  let latencyMs: number | null = null;
  let resynced = false;
  let connection: LiveSessionConnection = "offline";
  let members: LiveSessionMemberView[] = [];
  let missions: LiveMissionView[] = [];
  let lastError: string | null = null;
  let source: EventSource | null = null;
  const retiredStreams = new Set<EventSource>();
  // Invalidates callbacks (and ticket requests) retained by a stream we deliberately
  // detached. `EventSource.close()` stops future network delivery, but a message already
  // queued on the browser task queue can otherwise still run after a snapshot load starts.
  let streamEpoch = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectStep = 0;
  let closed = false;
  let resyncFlight: { authority: number; sessionId: string; promise: Promise<number> } | null = null;
  // Every join/attach owns a generation. Leave or a newer claim revokes all fetches,
  // snapshots and stream callbacks retained by the previous authority.
  let authorityEpoch = 0;

  /**
   * Operation ids this tab submitted. A member's own operation comes back over the stream
   * like anyone else's; applying it again would double it. The server's idempotency covers
   * a *resubmission*; this covers the echo.
   */
  const ownOperations = new Set<string>();
  /**
   * Runtime load generation in which an optimistic own operation was applied. A resync
   * replaces the whole authored document, so an accepted own operation newer than that
   * snapshot must be applied from its replay even though it is normally an echo we skip.
   */
  const ownOperationLoadEpoch = new Map<string, number>();
  let runtimeLoadEpoch = 0;
  let latestSnapshotSeq = 0;
  /** Operation callbacks are a product event, not a transport event: receipt and SSE echo
   *  may arrive in either order, but consumers must observe an accepted operation once. */
  const announcedOperations = new Set<string>();
  /** Mission events share the server replay window and use explicit idempotency ids. */
  const announcedMissionEvents = new Set<string>();
  const missionEventWaiters = new Map<string, Set<(observed: boolean) => void>>();
  /** Authoritative own-operation echoes retained long enough to recover a receipt that a
   *  proxy lost after the server committed. */
  const ownOperationEchoes = new Map<string, LiveSessionOperation>();
  const ownEchoWaiters = new Map<string, Set<(operation: LiveSessionOperation | null) => void>>();
  /** Operations known to be embodied by this runtime, plus receipt/SSE ordering waiters. */
  const embodiedOperations = new Map<string, number>();
  const embodimentWaiters = new Map<string, Set<(embodied: boolean) => void>>();
  /** This actor's most recent accepted operation id — what `undo` reverses. */
  const ownOperationCandidates = new Map<string, number>();
  const undoneOwnOperations = new Set<string>();
  let lastOwnOpId: string | null = null;

  const refreshLastOwnOperation = (): void => {
    let latest: { opId: string; seq: number } | null = null;
    for (const [opId, operationSeq] of ownOperationCandidates) {
      if (undoneOwnOperations.has(opId)) continue;
      if (!latest || operationSeq > latest.seq) latest = { opId, seq: operationSeq };
    }
    lastOwnOpId = latest?.opId ?? null;
  };

  const rememberOwnOperationCandidate = (opId: string, operationSeq: number): void => {
    if (undoneOwnOperations.has(opId)) return;
    const previous = ownOperationCandidates.get(opId) ?? -1;
    ownOperationCandidates.delete(opId);
    ownOperationCandidates.set(opId, Math.max(previous, operationSeq));
    if (ownOperationCandidates.size > 512) {
      const oldest = ownOperationCandidates.keys().next().value as string | undefined;
      if (oldest) ownOperationCandidates.delete(oldest);
    }
    refreshLastOwnOperation();
  };

  const tombstoneOwnOperation = (opId: string): void => {
    ownOperationCandidates.delete(opId);
    undoneOwnOperations.add(opId);
    if (undoneOwnOperations.size > 512) {
      const oldest = undoneOwnOperations.values().next().value as string | undefined;
      if (oldest) undoneOwnOperations.delete(oldest);
    }
    refreshLastOwnOperation();
  };

  const cloneMissions = (): LiveMissionView[] => structuredClone(missions);

  const status = (): LiveSessionStatus => ({
    connection, sessionId, role, actorId, revision, seq, latencyMs, resynced,
    members: members.map((member) => ({ ...member })),
    missions: cloneMissions(),
    error: lastError,
  });

  const announce = (): void => events.onStatus?.(status());

  const rememberBoundedOperation = (set: Set<string>, opId: string): void => {
    set.add(opId);
    if (set.size <= 512) return;
    const oldest = set.values().next().value as string | undefined;
    if (oldest) set.delete(oldest);
  };

  const announceOperation = (operation: LiveSessionOperation): void => {
    if (announcedOperations.has(operation.opId)) return;
    // The server retains a bounded event window. Match that shape locally so a day-long
    // session cannot turn exactly-once bookkeeping into an unbounded browser allocation.
    rememberBoundedOperation(announcedOperations, operation.opId);
    events.onOperation?.(operation);
  };

  const installMissionEvent = (event: LiveMissionEvent): void => {
    if (announcedMissionEvents.has(event.eventId)) return;
    rememberBoundedOperation(announcedMissionEvents, event.eventId);
    const waiters = missionEventWaiters.get(event.eventId);
    missionEventWaiters.delete(event.eventId);
    for (const resolve of waiters ?? []) resolve(true);
    const next = structuredClone(event.mission);
    const index = missions.findIndex((mission) => mission.missionId === next.missionId);
    if (index < 0) missions = [...missions, next];
    else missions = missions.map((mission, missionIndex) => missionIndex === index ? next : mission);
    seq = Math.max(seq, event.seq);
    // Mission state is ordered beside the document but never embodies a document cut.
    // Only an op frame or snapshot may advance the scene revision this runtime owns.
    events.onMission?.(structuredClone(event));
    events.onMissions?.(cloneMissions());
    announce();
  };

  const waitForMissionEvent = (eventId: string, timeoutMs = 3_000): Promise<boolean> => {
    if (announcedMissionEvents.has(eventId)) return Promise.resolve(true);
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const waiter = (observed: boolean): void => {
        clearTimeout(timer);
        resolve(observed);
      };
      const waiters = missionEventWaiters.get(eventId) ?? new Set();
      waiters.add(waiter);
      missionEventWaiters.set(eventId, waiters);
      timer = setTimeout(() => {
        const active = missionEventWaiters.get(eventId);
        active?.delete(waiter);
        if (active?.size === 0) missionEventWaiters.delete(eventId);
        resolve(false);
      }, timeoutMs);
    });
  };

  const clearMissionWaiters = (): void => {
    const waiters = [...missionEventWaiters.values()].flatMap((group) => [...group]);
    missionEventWaiters.clear();
    for (const resolve of waiters) resolve(false);
  };

  const rememberOwnOperationEcho = (operation: LiveSessionOperation): void => {
    ownOperationEchoes.delete(operation.opId);
    ownOperationEchoes.set(operation.opId, operation);
    if (ownOperationEchoes.size > 512) {
      const oldest = ownOperationEchoes.keys().next().value as string | undefined;
      if (oldest) ownOperationEchoes.delete(oldest);
    }
    const waiters = ownEchoWaiters.get(operation.opId);
    if (!waiters) return;
    ownEchoWaiters.delete(operation.opId);
    for (const resolve of waiters) resolve(operation);
  };

  const waitForOwnOperationEcho = (opId: string, timeoutMs = 3_000): Promise<LiveSessionOperation | null> => {
    const observed = ownOperationEchoes.get(opId);
    if (observed) return Promise.resolve(observed);
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const waiter = (operation: LiveSessionOperation | null): void => {
        clearTimeout(timer);
        resolve(operation);
      };
      const waiters = ownEchoWaiters.get(opId) ?? new Set();
      waiters.add(waiter);
      ownEchoWaiters.set(opId, waiters);
      timer = setTimeout(() => {
        const active = ownEchoWaiters.get(opId);
        active?.delete(waiter);
        if (active?.size === 0) ownEchoWaiters.delete(opId);
        resolve(null);
      }, timeoutMs);
    });
  };

  const clearOwnEchoWaiters = (): void => {
    const waiters = [...ownEchoWaiters.values()].flatMap((group) => [...group]);
    ownEchoWaiters.clear();
    for (const resolve of waiters) resolve(null);
  };

  const rememberEmbodiedOperation = (opId: string): void => {
    embodiedOperations.delete(opId);
    embodiedOperations.set(opId, runtimeLoadEpoch);
    if (embodiedOperations.size > 512) {
      const oldest = embodiedOperations.keys().next().value as string | undefined;
      if (oldest) embodiedOperations.delete(oldest);
    }
    const waiters = embodimentWaiters.get(opId);
    if (!waiters) return;
    embodimentWaiters.delete(opId);
    for (const resolve of waiters) resolve(true);
  };

  const waitForEmbodiedOperation = (opId: string, timeoutMs = 3_000): Promise<boolean> => {
    if (embodiedOperations.get(opId) === runtimeLoadEpoch) return Promise.resolve(true);
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const waiter = (embodied: boolean): void => {
        clearTimeout(timer);
        resolve(embodied);
      };
      const waiters = embodimentWaiters.get(opId) ?? new Set();
      waiters.add(waiter);
      embodimentWaiters.set(opId, waiters);
      timer = setTimeout(() => {
        const active = embodimentWaiters.get(opId);
        active?.delete(waiter);
        if (active?.size === 0) embodimentWaiters.delete(opId);
        resolve(false);
      }, timeoutMs);
    });
  };

  const clearEmbodimentWaiters = (): void => {
    const waiters = [...embodimentWaiters.values()].flatMap((group) => [...group]);
    embodimentWaiters.clear();
    for (const resolve of waiters) resolve(false);
  };

  const setConnection = (next: LiveSessionConnection, error: string | null = null): void => {
    if (connection === next && lastError === error) return;
    connection = next;
    lastError = error;
    announce();
  };

  const hasAuthority = (epoch: number, targetSessionId: string): boolean =>
    !closed && authorityEpoch === epoch && sessionId === targetSessionId;

  const closeRetiredStreams = (): void => {
    const pending = [...retiredStreams];
    retiredStreams.clear();
    for (const retired of pending) retired.close();
  };

  const retireActiveStream = (): void => {
    streamEpoch += 1;
    if (source) retiredStreams.add(source);
    source = null;
  };

  const detachStream = (): void => {
    retireActiveStream();
    closeRetiredStreams();
  };

  type LiveSessionTerminal = {
    schema?: string;
    event?: "closed" | "revoked";
    sessionId?: string;
    memberId?: string;
    reason?: string;
    seq?: number;
    revision?: number;
    definition?: AgentWorldDefinition;
    missions?: LiveMissionView[];
  };

  /**
   * Reconcile one final server cut before revoking this closure's authority.
   *
   * A local submit is optimistic. If closing/removal wins its race with the POST, simply
   * switching the badge to offline would strand that rejected mutation in the runtime. The
   * terminal frame therefore carries the final document; load it while this stream still
   * owns authority, then make every in-flight request from that authority fail its guard.
   */
  const terminateFromServer = (payload: LiveSessionTerminal, message: string): void => {
    const terminalIsForThisAuthority = payload.sessionId === undefined || payload.sessionId === sessionId;
    if (!terminalIsForThisAuthority) return;
    if (payload.definition
      && Number.isInteger(payload.revision) && (payload.revision ?? -1) >= 0
      && Number.isInteger(payload.seq) && (payload.seq ?? -1) >= 0) {
      const result = api.load(payload.definition);
      if (result.ok) {
        runtimeLoadEpoch += 1;
        revision = payload.revision as number;
        seq = payload.seq as number;
        latestSnapshotSeq = seq;
        if (Array.isArray(payload.missions)) {
          missions = structuredClone(payload.missions);
          events.onMissions?.(cloneMissions());
        }
        events.onResync?.(revision);
      } else {
        // Preserve the last proven runtime when an invalid terminal payload is received.
        // Replacing it approximately would be worse than visibly reporting the protocol bug.
        events.onError?.(new LiveSessionError(
          `Could not load the session's final scene: ${result.error}`,
          422,
          "terminal-snapshot-rejected",
        ));
      }
    }

    authorityEpoch += 1;
    closed = true;
    resyncFlight = null;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    detachStream();
    credential = null;
    sessionId = null;
    sceneName = null;
    role = null;
    actorId = null;
    actorLabel = null;
    actorKind = null;
    memberId = null;
    members = [];
    missions = [];
    resynced = false;
    lastOwnOpId = null;
    ownOperationCandidates.clear();
    undoneOwnOperations.clear();
    ownOperations.clear();
    ownOperationLoadEpoch.clear();
    announcedOperations.clear();
    announcedMissionEvents.clear();
    ownOperationEchoes.clear();
    embodiedOperations.clear();
    clearOwnEchoWaiters();
    clearEmbodimentWaiters();
    clearMissionWaiters();
    reconnectStep = 0;
    connection = "offline";
    lastError = message;
    events.onMembers?.([]);
    events.onMissions?.([]);
    announce();
  };

  /** Recover final authority when the terminal SSE frame was lost with the stream. */
  const recoverRetiredAuthority = async (
    authority: number,
    targetSessionId: string,
    baseline: AgentWorldDefinition | null,
    baselineRevision: number,
    expectedStreamEpoch?: number,
  ): Promise<boolean> => {
    const targetSceneName = sceneName;
    if (!hasAuthority(authority, targetSessionId)) return true;
    if (expectedStreamEpoch !== undefined && streamEpoch !== expectedStreamEpoch) return true;
    if (targetSceneName) {
      try {
        const response = await fetchImpl(`${root}/scenes/${encodeURIComponent(targetSceneName)}`, {
          method: "GET",
          cache: "no-store",
          headers: { "content-type": "application/json" },
        });
        const record = await response.json().catch(() => null) as
          | { definition?: AgentWorldDefinition; revision?: number | string }
          | null;
        assertAuthority(authority, targetSessionId);
        if (expectedStreamEpoch !== undefined && streamEpoch !== expectedStreamEpoch) return true;
        const recordRevision = Number(record?.revision);
        if (response.ok && record?.definition && Number.isInteger(recordRevision) && recordRevision >= 0) {
          terminateFromServer({
            sessionId: targetSessionId,
            definition: record.definition,
            revision: recordRevision,
            seq,
          }, "This live-session authority is no longer available");
          return true;
        }
      } catch {
        // The exact pre-optimistic document below remains a proven rollback point.
      }
    }
    if (hasAuthority(authority, targetSessionId) && baseline) {
      if (expectedStreamEpoch !== undefined && streamEpoch !== expectedStreamEpoch) return true;
      terminateFromServer({
        sessionId: targetSessionId,
        definition: baseline,
        revision: baselineRevision,
        seq,
      }, "This live-session authority is no longer available");
      return true;
    }
    return false;
  };

  const assertAuthority = (epoch: number, targetSessionId: string): void => {
    if (!hasAuthority(epoch, targetSessionId)) {
      throw new LiveSessionError(
        "Live-session authority changed while a request was in flight",
        409,
        "session-authority-revoked",
      );
    }
  };

  /** Claim authority synchronously, before join/attach performs its first network await. */
  const beginAuthority = (
    targetSessionId: string,
    nextCredential: string | null,
  ): { authority: number; finishStreamHandoff: () => void } => {
    authorityEpoch += 1;
    const claimedAuthority = authorityEpoch;
    closed = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    // Invalidate the old stream synchronously so none of its callbacks can cross the
    // authority barrier. Keep its transport alive until the first request and snapshot
    // for the new authority finish: closing EventSource immediately before fetch can
    // strand that fetch behind the browser's connection teardown on Windows.
    retireActiveStream();
    const finishStreamHandoff = (): void => {
      // A superseded request cannot tear down the transport retained by its successor.
      // The newest authority closes every retired stream once its snapshot is settled.
      if (!hasAuthority(claimedAuthority, targetSessionId)) return;
      closeRetiredStreams();
    };
    credential = nextCredential;
    sessionId = targetSessionId;
    sceneName = null;
    role = null;
    actorId = null;
    actorLabel = null;
    actorKind = null;
    memberId = null;
    seq = 0;
    revision = 0;
    latencyMs = null;
    resynced = false;
    members = [];
    missions = [];
    lastError = null;
    reconnectStep = 0;
    lastOwnOpId = null;
    ownOperationCandidates.clear();
    undoneOwnOperations.clear();
    ownOperations.clear();
    ownOperationLoadEpoch.clear();
    runtimeLoadEpoch = 0;
    latestSnapshotSeq = 0;
    announcedOperations.clear();
    announcedMissionEvents.clear();
    ownOperationEchoes.clear();
    embodiedOperations.clear();
    clearOwnEchoWaiters();
    clearEmbodimentWaiters();
    clearMissionWaiters();
    connection = "connecting";
    // This announcement is the authority barrier used by the product shell: local canvas,
    // Editor, Games, Browse and SceneBrowser are disabled before the request can yield.
    announce();
    return { authority: claimedAuthority, finishStreamHandoff };
  };

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const requestAuthority = authorityEpoch;
    const requestSessionId = sessionId;
    const headers: Record<string, string> = { "content-type": "application/json" };
    // `x-graphysx-session`, never a query parameter: a credential in a URL survives in
    // history, referrers and access logs. The one exception is the stream, which uses a
    // single-use 30-second ticket precisely because EventSource cannot set a header.
    if (credential) headers["x-graphysx-session"] = credential;
    const startedAt = performance.now();
    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        method,
        cache: "no-store",
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      throw new LiveSessionError(
        `Live session server unreachable at ${root}: ${error instanceof Error ? error.message : String(error)}`,
        0,
      );
    }
    if (!closed && authorityEpoch === requestAuthority && sessionId === requestSessionId) {
      latencyMs = Math.round(performance.now() - startedAt);
    }
    const payload = (await response.json().catch(() => null)) as
      | (T & { error?: string; code?: string; revision?: number; blockedBy?: { actorId: string; revision: number; opId: string } })
      | null;
    if (!response.ok) {
      throw new LiveSessionError(
        payload?.error ?? `Live session server responded ${response.status}`,
        response.status,
        payload?.code ?? null,
        typeof payload?.revision === "number" ? payload.revision : null,
        payload?.blockedBy ?? null,
      );
    }
    return payload as T;
  }

  const submitMissionRequest = async (
    targetMissionId: string,
    body: Record<string, unknown>,
  ): Promise<LiveMissionReceipt> => {
    const targetSessionId = sessionId;
    if (!targetSessionId || role === null) throw new LiveSessionError("Not in a session", 400);
    if (connection !== "live") throw new LiveSessionError("The live session is still synchronizing", 409, "session-not-ready");
    const eventId = typeof body.eventId === "string" ? body.eventId : "";
    if (!eventId) throw new LiveSessionError("Mission events require an explicit eventId", 400, "mission-event-id-required");
    const authority = authorityEpoch;
    const request = () => {
      assertAuthority(authority, targetSessionId);
      return call<LiveMissionReceipt>(
        "POST",
        targetMissionId
          ? "/sessions/" + encodeURIComponent(targetSessionId) + "/missions/" + encodeURIComponent(targetMissionId) + "/events"
          : "/sessions/" + encodeURIComponent(targetSessionId) + "/missions",
        body,
      );
    };
    let receipt: LiveMissionReceipt;
    try {
      receipt = await request();
    } catch (firstError) {
      const ambiguous = !(firstError instanceof LiveSessionError) || firstError.status === 0 || firstError.status >= 500;
      if (!ambiguous) throw firstError;
      receipt = await request();
    }
    assertAuthority(authority, targetSessionId);
    if (!receipt || receipt.eventId !== eventId || !Number.isInteger(receipt.seq) || receipt.seq < 0) {
      throw new LiveSessionError("The mission response was unreadable", 0, "mission-receipt-unreadable");
    }
    // The HTTP response is not an ordering channel. Wait for the shared SSE sequence before
    // advancing local mission state; otherwise an earlier scene op could be skipped on replay.
    const observed = await waitForMissionEvent(eventId);
    assertAuthority(authority, targetSessionId);
    if (!observed) {
      await resync();
      assertAuthority(authority, targetSessionId);
      if (latestSnapshotSeq < receipt.seq) {
        await resync();
        assertAuthority(authority, targetSessionId);
      }
    }
    if (!announcedMissionEvents.has(eventId) && latestSnapshotSeq < receipt.seq) {
      throw new LiveSessionError("The accepted mission event could not be recovered", 409, "mission-event-not-embodied");
    }
    return receipt;
  };

  /**
   * Applies a remote operation through the public commit path.
   *
   * `expectedRevision` is deliberately not passed: this tab's runtime revision counts local
   * ephemeral work (a thrown ball, a selection) that the store never sees, so it drifts from
   * the shared revision by design. The server already decided this operation was in order;
   * re-litigating that against a number that means something different here would reject
   * valid work. The shared revision is tracked separately, in `revision`.
   */
  function applyRemote(operation: LiveSessionOperation): boolean {
    const result = api.commit({
      actor: { id: operation.actorId, label: operation.actorLabel, kind: operation.actorKind },
      intent: operation.intent || `${operation.actorLabel} changed the scene`,
      commands: operation.commands,
    });
    if (!result.ok) {
      // A remote operation the server accepted but this runtime refused means the two have
      // genuinely diverged. Say so and resync rather than carry on with a scene that no
      // longer matches what everyone else is looking at.
      events.onError?.(new LiveSessionError(`Could not apply ${operation.actorLabel}'s change: ${result.error}`, 409, "apply-failed"));
      void resync();
      return false;
    }
    return true;
  }

  function ingest(event: LiveSessionOperation): void {
    if (ownOperations.has(event.opId)) {
      // Usually this is only an echo: the optimistic commit already changed the runtime.
      // A whole-document resync is the exception. If its snapshot predates this accepted
      // operation, the load erased the optimistic commit and the replay is now the one
      // authoritative path that must apply it.
      const survivedSnapshotLoad = ownOperationLoadEpoch.get(event.opId) === runtimeLoadEpoch;
      if (!survivedSnapshotLoad && event.seq > latestSnapshotSeq) {
        if (!applyRemote(event)) return;
      }
      ownOperationLoadEpoch.set(event.opId, runtimeLoadEpoch);
      seq = Math.max(seq, event.seq);
      revision = Math.max(revision, event.revision);
      rememberOwnOperationCandidate(event.opId, event.seq);
      rememberOwnOperationEcho(event);
      rememberEmbodiedOperation(event.opId);
      announceOperation(event);
      announce();
      return;
    }
    if (!applyRemote(event)) return;
    seq = Math.max(seq, event.seq);
    revision = Math.max(revision, event.revision);
    rememberEmbodiedOperation(event.opId);
    announceOperation(event);
    announce();
  }

  function openStream(): void {
    if (closed || !sessionId || !credential) return;
    const targetSessionId = sessionId;
    const authority = authorityEpoch;
    const attempt = ++streamEpoch;
    setConnection(seq > 0 ? "reconnecting" : "connecting");
    void (async () => {
      try {
        const ticket = await call<{ ticket: string }>("POST", `/sessions/${targetSessionId}/stream-ticket`, {});
        if (!hasAuthority(authority, targetSessionId) || streamEpoch !== attempt) return;
        const url = `${root}/sessions/${targetSessionId}/stream?ticket=${encodeURIComponent(ticket.ticket)}&since=${seq}`;
        const stream = new EventSource(url);
        source = stream;
        let helloTarget: { seq: number; revision: number } | null = null;
        const isCurrentStream = (): boolean =>
          hasAuthority(authority, targetSessionId) && streamEpoch === attempt && source === stream;

        stream.addEventListener("hello", (message) => {
          if (!isCurrentStream()) return;
          const hello = JSON.parse((message as MessageEvent).data) as {
            revision: number; seq: number; role: LiveSessionRole; mustResync: boolean;
          };
          role = hello.role;
          if (hello.mustResync) {
            // The server cannot prove what we missed. A snapshot is the only honest answer.
            void resync().catch((error) => {
              if (hasAuthority(authority, targetSessionId))
                events.onError?.(error instanceof Error ? error : new Error(String(error)));
            });
          } else {
            // The server writes missed retained events immediately after hello, followed by
            // one fresh presence snapshot. Until that terminal presence frame arrives the
            // runtime may still be behind hello.revision, so "live" and the newer revision
            // would both be premature and could author a follow-up against stale state.
            helloTarget = { seq: hello.seq, revision: hello.revision };
            announce();
          }
        });

        stream.addEventListener("op", (message) => {
          if (!isCurrentStream()) return;
          ingest(JSON.parse((message as MessageEvent).data) as LiveSessionOperation);
        });

        stream.addEventListener("resync", () => {
          if (!isCurrentStream()) return;
          // Do not advance seq/revision from the marker. Detaching is synchronous, so
          // queued frames from this old document are ignored until an atomic cut loads.
          void resync().catch((error) => {
            if (hasAuthority(authority, targetSessionId))
              events.onError?.(error instanceof Error ? error : new Error(String(error)));
          });
        });

        stream.addEventListener("mission", (message) => {
          if (!isCurrentStream()) return;
          installMissionEvent(JSON.parse((message as MessageEvent).data) as LiveMissionEvent);
        });

        stream.addEventListener("presence", (message) => {
          if (!isCurrentStream()) return;
          const payload = JSON.parse((message as MessageEvent).data) as { seq: number; members: LiveSessionMemberView[] };
          seq = Math.max(seq, payload.seq);
          members = payload.members;
          if (helloTarget && payload.seq > helloTarget.seq) {
            revision = Math.max(revision, helloTarget.revision);
            helloTarget = null;
            reconnectStep = 0;
            // Status first: presence consumers (including live AgentX projection) gate on
            // `connection === live` and must not discard this terminal catch-up roster.
            setConnection("live");
            events.onMembers?.(members);
          } else {
            events.onMembers?.(members);
            announce();
          }
        });

        stream.addEventListener("member", (message) => {
          if (!isCurrentStream()) return;
          const payload = JSON.parse((message as MessageEvent).data) as {
            seq: number;
            change: "joined" | "removed";
            member: LiveSessionMemberView;
          };
          seq = Math.max(seq, payload.seq);
          if (payload.change === "removed") {
            // Removal wins even if the member view was serialized while its SSE response was
            // still closing and therefore still says `online: true`.
            members = members.filter((member) => member.memberId !== payload.member.memberId);
          } else {
            const index = members.findIndex((member) => member.memberId === payload.member.memberId);
            if (index < 0) members = [...members, payload.member];
            else members = members.map((member, memberIndex) => memberIndex === index ? payload.member : member);
          }
          events.onMembers?.(members);
          announce();
        });

        stream.addEventListener("closed", (message) => {
          if (!isCurrentStream()) return;
          const payload = JSON.parse((message as MessageEvent).data) as LiveSessionTerminal;
          terminateFromServer(payload, "The session was closed");
        });

        stream.addEventListener("revoked", (message) => {
          if (!isCurrentStream()) return;
          const payload = JSON.parse((message as MessageEvent).data) as LiveSessionTerminal;
          // A stream ticket is bound to exactly one member, but keep the identity check loud
          // so a malformed frame cannot detach somebody else's authority.
          if (payload.memberId && memberId && payload.memberId !== memberId) return;
          terminateFromServer(payload, "Your access to this session was revoked");
        });

        stream.onerror = () => {
          if (!isCurrentStream()) return;
          stream.close();
          source = null;
          if (closed) return;
          scheduleReconnect();
        };
      } catch (error) {
        if (!hasAuthority(authority, targetSessionId) || streamEpoch !== attempt) return;
        events.onError?.(error instanceof Error ? error : new Error(String(error)));
        if (error instanceof LiveSessionError && [401, 403, 404, 410].includes(error.status)) {
          const recovered = await recoverRetiredAuthority(
            authority,
            targetSessionId,
            null,
            revision,
            attempt,
          );
          if (recovered || !hasAuthority(authority, targetSessionId) || streamEpoch !== attempt) return;
        }
        scheduleReconnect(error instanceof Error ? error.message : String(error));
      }
    })();
  }

  function scheduleReconnect(reason: string | null = null): void {
    if (closed || reconnectTimer) return;
    // Backoff, capped: a store that is down for a minute should not be hit sixty times.
    const wait = RECONNECT_STEPS_MS[Math.min(reconnectStep, RECONNECT_STEPS_MS.length - 1)];
    reconnectStep += 1;
    setConnection("reconnecting", reason);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openStream();
    }, wait);
  }

  /**
   * Whole-document recovery. Used on join, and whenever continuity cannot be proved.
   *
   * A connected resync invalidates the old stream's callbacks immediately, retains its
   * transport through the atomic snapshot request, then lets only the current authority close
   * it and reconnect from the snapshot's exact sequence. That turns operations racing the
   * fetch/load into one of two honest outcomes: they are already represented by the snapshot,
   * or their retained SSE events replay after it. In particular, no event can be applied to the
   * old runtime, overwritten by `api.load`, and still advance `seq` enough to suppress replay.
   */
  function resyncWithStreamPolicy(
    resumeStream: boolean,
    captureSnapshot?: (snapshot: {
      revision: number;
      seq: number;
      definition: AgentWorldDefinition;
      session: LiveSessionView;
      you: LiveSessionMemberView;
    }) => void,
  ): Promise<number> {
    const targetSessionId = sessionId;
    if (!targetSessionId) return Promise.reject(new LiveSessionError("Not in a session", 400));
    const authority = authorityEpoch;
    const existing = resyncFlight;
    if (existing && existing.authority === authority && existing.sessionId === targetSessionId) {
      return existing.promise;
    }

    if (resumeStream) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      setConnection("reconnecting");
      // Invalidate delivery now, but keep the established transport through the snapshot
      // request. Closing EventSource immediately before fetch can strand that fetch behind
      // the browser's connection teardown on Windows.
      retireActiveStream();
    }

    let loaded = false;
    let failureReason = "Snapshot resync failed";
    const flight = { authority, sessionId: targetSessionId, promise: Promise.resolve(0) };
    flight.promise = (async () => {
      const snapshot = await call<{
        revision: number;
        seq: number;
        definition: AgentWorldDefinition;
        session: LiveSessionView;
        you: LiveSessionMemberView;
      }>("GET", `/sessions/${targetSessionId}/snapshot`);
      assertAuthority(authority, targetSessionId);
      captureSnapshot?.(snapshot);
      assertAuthority(authority, targetSessionId);
      const result = api.load(snapshot.definition);
      assertAuthority(authority, targetSessionId);
      if (!result.ok) {
        // Surfaced on the status, not only thrown: a join that dies here used to leave the
        // panel reading "offline" with no error at all, which is the least useful thing a
        // connection indicator can do.
        setConnection("offline", `Could not load the session scene: ${result.error}`);
        throw new LiveSessionError(`Could not load the session scene: ${result.error}`, 422, "snapshot-rejected");
      }
      runtimeLoadEpoch += 1;
      latestSnapshotSeq = snapshot.seq;
      revision = snapshot.revision;
      // The stream was invalidated before the request. This is the exact recovery cut,
      // not a maximum with events applied to the document that `api.load` just replaced.
      seq = snapshot.seq;
      members = snapshot.session.members;
      missions = structuredClone(snapshot.session.missions ?? []);
      sceneName = snapshot.session.sceneName;
      resynced = true;
      // After a resync this tab's notion of "my last operation" may predate history the server
      // still holds but this client can no longer reason about; the undo route decides.
      refreshLastOwnOperation();
      events.onResync?.(revision);
      events.onMembers?.(members);
      events.onMissions?.(cloneMissions());
      announce();
      loaded = true;
      return revision;
    })().catch((error) => {
      failureReason = error instanceof Error ? error.message : String(error);
      throw error;
    }).finally(() => {
      if (resyncFlight === flight) resyncFlight = null;
      if (resumeStream && hasAuthority(authority, targetSessionId)) {
        closeRetiredStreams();
        if (loaded) openStream();
        // Keep the last known runtime and resume from its last honest sequence. If the
        // server cannot bridge that gap it will answer mustResync again, now behind the
        // ordinary reconnect backoff instead of leaving the client silently streamless.
        else scheduleReconnect(failureReason);
      }
    });
    resyncFlight = flight;
    return flight.promise;
  }

  /** Public/manual recovery always gates and resumes the connected stream. */
  const resync = (): Promise<number> => resyncWithStreamPolicy(true);

  return {
    get status(): LiveSessionStatus {
      return status();
    },

    /** Exchanges an invitation for a scoped credential, then joins and syncs. */
    async join(targetSessionId: string, code: string, actor: { id: string; label?: string; kind?: "human" | "agent" }) {
      const { authority, finishStreamHandoff } = beginAuthority(targetSessionId, null);
      let joined: { credential: string; member: LiveSessionMemberView; session: LiveSessionView };
      try {
        joined = await call<{ credential: string; member: LiveSessionMemberView; session: LiveSessionView }>(
          "POST", `/sessions/${targetSessionId}/join`, { code, actor },
        );
        assertAuthority(authority, targetSessionId);
      } catch (error) {
        finishStreamHandoff();
        if (!hasAuthority(authority, targetSessionId)) assertAuthority(authority, targetSessionId);
        if (hasAuthority(authority, targetSessionId)) {
          setConnection("offline", error instanceof Error ? error.message : String(error));
        }
        throw error;
      }
      // The invitation is spent from here on; only the scoped credential survives, and it
      // lives in this closure rather than in storage the rest of the page can read.
      credential = joined.credential;
      sceneName = joined.session.sceneName;
      role = joined.member.role;
      actorId = joined.member.actorId;
      actorLabel = joined.member.label;
      actorKind = joined.member.kind;
      memberId = joined.member.memberId;
      members = joined.session.members;
      missions = structuredClone(joined.session.missions ?? []);
      resynced = false;
      try {
        await resyncWithStreamPolicy(false);
        assertAuthority(authority, targetSessionId);
      } catch (error) {
        // The credential is good but the scene would not load. Report it as the connection
        // failure it is rather than leaving the caller with a half-joined client.
        finishStreamHandoff();
        if (!hasAuthority(authority, targetSessionId)) assertAuthority(authority, targetSessionId);
        if (hasAuthority(authority, targetSessionId)) {
          setConnection("offline", error instanceof Error ? error.message : String(error));
        }
        throw error;
      }
      // The initial sync is a join, not a recovery — `resynced` marks "we lost continuity
      // and had to reload", and saying that on the way in would be a lie.
      resynced = false;
      finishStreamHandoff();
      openStream();
      return joined.member;
    },

    /** Resumes an already-credentialled session (owner, or a restored client). */
    async attach(targetSessionId: string, memberCredential: string) {
      const { authority, finishStreamHandoff } = beginAuthority(targetSessionId, memberCredential);
      const captured = { member: null as LiveSessionMemberView | null };
      try {
        // The authenticated snapshot is already the atomic document/session cut. It also
        // carries this credential's member view, so attach needs one read rather than a
        // separate session view followed by the snapshot that supersedes it.
        await resyncWithStreamPolicy(false, (snapshot) => {
          captured.member = snapshot.you ?? null;
        });
        assertAuthority(authority, targetSessionId);
        const attachedMember = captured.member;
        if (!attachedMember) {
          throw new LiveSessionError(
            "The live-session snapshot omitted this member's authority",
            422,
            "snapshot-member-missing",
          );
        }
        role = attachedMember.role;
        actorId = attachedMember.actorId;
        actorLabel = attachedMember.label;
        actorKind = attachedMember.kind;
        memberId = attachedMember.memberId;
        resynced = false;
        finishStreamHandoff();
        openStream();
        return attachedMember;
      } catch (error) {
        finishStreamHandoff();
        if (!hasAuthority(authority, targetSessionId)) assertAuthority(authority, targetSessionId);
        if (hasAuthority(authority, targetSessionId)) {
          setConnection("offline", error instanceof Error ? error.message : String(error));
        }
        throw error;
      }
    },

    /**
     * Submits an incremental change. Applies locally first so the author sees no lag, then
     * sends; a rejection rolls the local runtime back to the server's truth via resync
     * rather than leaving this tab holding a change nobody else has.
     */
    async submit(commands: AgentWorldCommand[], options: { intent?: string; path?: string; opId?: string } = {}) {
      const targetSessionId = sessionId;
      if (!targetSessionId) throw new LiveSessionError("Not in a session", 400);
      const authority = authorityEpoch;
      if (role === "viewer") throw new LiveSessionError("Viewers cannot change the scene", 403, "role-forbidden");
      if (connection !== "live") {
        throw new LiveSessionError("The live session is still synchronizing", 409, "session-not-ready");
      }
      const hasStableId = (value: unknown): value is string =>
        typeof value === "string" && Boolean(value.trim());
      const missingGeneratedId = commands.some((command) => {
        if (command.op === "spawn") {
          return !hasStableId(command.entity.id)
            || (command.entity.behaviors ?? []).some((behavior) => !hasStableId(behavior.id))
            || (command.entity.interactions ?? []).some((interaction) => !hasStableId(interaction.id));
        }
        if (command.op === "update" && Array.isArray(command.patch.interactions)) {
          return command.patch.interactions.some((interaction) => !hasStableId(interaction.id));
        }
        return false;
      });
      if (missingGeneratedId) {
        throw new LiveSessionError(
          "Live-session spawns, behaviors, and interactions require explicit stable ids",
          422,
          "live-spawn-id-required",
        );
      }
      const opId = options.opId ?? `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const baseRevision = revision;
      const localActorId = actorId ?? "local";
      const localActorLabel = actorLabel ?? localActorId;
      const localActorKind = actorKind ?? (role === "agent" ? "agent" : "human");
      if (ownOperations.has(opId)) {
        throw new LiveSessionError("This operation id was already used by this client", 409, "op-id-reused");
      }
      // Keep locally-applied ids for the same bounded window as accepted events. Removing an
      // id on its first echo lets an SSE replay fall through to `applyRemote` and double-apply.
      rememberBoundedOperation(ownOperations, opId);
      for (const rememberedId of ownOperationLoadEpoch.keys()) {
        if (!ownOperations.has(rememberedId)) ownOperationLoadEpoch.delete(rememberedId);
      }
      const optimisticBaseline = api.exportDocument();
      const local = api.commit({
        actor: { id: localActorId, label: localActorLabel, kind: localActorKind },
        intent: options.intent ?? "live edit",
        commands,
      });
      if (!local.ok) {
        ownOperations.delete(opId);
        ownOperationLoadEpoch.delete(opId);
        throw new LiveSessionError(local.error ?? "The change was rejected locally", 422, "local-rejected");
      }
      ownOperationLoadEpoch.set(opId, runtimeLoadEpoch);
      try {
        type OperationReceipt = {
          seq: number;
          revision: number;
          baseRevision?: number;
          outputs?: unknown[];
          intent?: string;
          duplicate?: boolean;
        };
        const request = async (): Promise<OperationReceipt> => {
          // `call` reads the current closure credential. Bind every retry to the authority
          // that authored this optimistic commit so a leave/rejoin cannot submit the old
          // commands as a newly attached member of the same session.
          assertAuthority(authority, targetSessionId);
          const receipt = await call<OperationReceipt | null>("POST", `/sessions/${targetSessionId}/ops`, {
            opId,
            baseRevision,
            path: options.path ?? "transaction",
            commands,
            intent: options.intent,
          });
          if (!receipt || !Number.isInteger(receipt.seq) || !Number.isInteger(receipt.revision)) {
            // A proxy can lose/corrupt an accepted response while the operation and SSE echo
            // are already durable. Treat an unreadable 2xx receipt like a transport failure so
            // the same idempotency key recovers the authoritative receipt below.
            throw new LiveSessionError("The operation response was unreadable", 0, "operation-receipt-unreadable");
          }
          return receipt;
        };
        let receipt: OperationReceipt;
        try {
          receipt = await request();
        } catch (firstError) {
          const ambiguous = !(firstError instanceof LiveSessionError)
            || firstError.status === 0
            || firstError.status >= 500;
          if (!ambiguous) throw firstError;
          // The first request may have committed before its response disappeared. Retrying
          // the same op id is a read of that accepted receipt when it did, and one safe submit
          // when it did not; the server's idempotency gate runs before revision validation.
          try {
            receipt = await request();
          } catch (secondError) {
            const secondAmbiguous = !(secondError instanceof LiveSessionError)
              || secondError.status === 0
              || secondError.status >= 500;
            // Exact duplicate receipts are resolved before the server's mutation rate bucket,
            // so a 429 is a definite rejection here. Only another ambiguous transport/server
            // failure can still coexist with an accepted first request and an echo in flight.
            const echoMayProveAcceptance = secondAmbiguous;
            if (!echoMayProveAcceptance) throw secondError;
            // Do not let resync advance past an echo that is already in flight. If both HTTP
            // responses disappeared, the canonical SSE event is itself an authoritative
            // receipt and carries every field consumers need.
            const echo = await waitForOwnOperationEcho(opId);
            if (!echo) throw secondError;
            receipt = {
              seq: echo.seq,
              revision: echo.revision,
              baseRevision: echo.baseRevision,
              outputs: echo.outputs,
              intent: echo.intent,
              duplicate: true,
            };
          }
        }
        assertAuthority(authority, targetSessionId);
        const acceptedOperation: LiveSessionOperation = {
          schema: LIVE_OP_SCHEMA,
          event: "op",
          seq: receipt.seq,
          sessionId: targetSessionId,
          opId,
          actorId: localActorId,
          actorKind: localActorKind,
          actorLabel: localActorLabel,
          memberId: memberId ?? "local",
          role: role ?? "editor",
          path: options.path ?? "transaction",
          commands,
          outputs: receipt.outputs ?? [],
          intent: receipt.intent ?? options.intent ?? "live edit",
          baseRevision: receipt.baseRevision ?? baseRevision,
          revision: receipt.revision,
          at: new Date().toISOString(),
        };
        // If a concurrent resync loaded a snapshot older than this receipt, that load
        // erased the optimistic commit. Do not apply this receipt directly: a remote event
        // may sit between the snapshot and this operation, and applying the latter first
        // would invert server order. Wait for its ordered SSE embodiment, with one atomic
        // resync fallback when the stream cannot deliver it.
        const survivedSnapshotLoad = ownOperationLoadEpoch.get(opId) === runtimeLoadEpoch;
        if (!survivedSnapshotLoad && receipt.seq > latestSnapshotSeq) {
          await waitForEmbodiedOperation(opId);
          assertAuthority(authority, targetSessionId);
          const isEmbodied = (): boolean =>
            embodiedOperations.get(opId) === runtimeLoadEpoch || latestSnapshotSeq >= receipt.seq;
          if (!isEmbodied()) {
            // This may coalesce with the older resync that erased the optimistic commit.
            await resync();
            assertAuthority(authority, targetSessionId);
          }
          if (!isEmbodied()) {
            // The coalesced cut can legitimately predate the accepted receipt. Take one
            // fresh cut after it; server snapshot serialization guarantees this one covers
            // the accepted operation even if its SSE frame was lost.
            await resync();
            assertAuthority(authority, targetSessionId);
          }
          if (!isEmbodied()) {
            throw new LiveSessionError(
              "The accepted operation could not be embodied after replay and resync",
              409,
              "operation-not-embodied",
            );
          }
          if (latestSnapshotSeq >= receipt.seq) {
            ownOperationLoadEpoch.set(opId, runtimeLoadEpoch);
            rememberEmbodiedOperation(opId);
            announceOperation(acceptedOperation);
          }
        } else {
          // Either the optimistic commit survived, or the atomic snapshot already contains
          // this operation. In both cases the current runtime embodies it exactly once.
          ownOperationLoadEpoch.set(opId, runtimeLoadEpoch);
        }
        // Receipt and stream are independent transports. A newer remote event may land while
        // this request is retrying, so a late own receipt must never move shared time backward.
        revision = Math.max(revision, receipt.revision);
        rememberOwnOperationCandidate(opId, receipt.seq);
        seq = Math.max(seq, receipt.seq);
        rememberEmbodiedOperation(opId);
        announceOperation(acceptedOperation);
        announce();
        return receipt;
      } catch (error) {
        // Optimistic application is only honest if the rollback is real. The server is the
        // authority on what happened; take its version rather than keep a private one.
        if (hasAuthority(authority, targetSessionId)) {
          // A 4xx response proves the server refused the operation. A lost response, network
          // failure, or upstream 5xx does not prove that: the server may already have committed
          // and emitted the SSE echo. Retaining that id lets the late echo be observed once
          // without applying the optimistic mutation a second time after resync.
          if (error instanceof LiveSessionError && error.status >= 400 && error.status < 500) {
            ownOperations.delete(opId);
            ownOperationLoadEpoch.delete(opId);
          }
          let resyncFailure: unknown = null;
          try {
            await resync();
          } catch (nextError) {
            resyncFailure = nextError;
          }
          const retiresAuthority = (candidate: unknown): boolean =>
            candidate instanceof LiveSessionError && [401, 403, 404, 410].includes(candidate.status);
          if (hasAuthority(authority, targetSessionId)
            && (retiresAuthority(error) || retiresAuthority(resyncFailure))) {
            // The failed resync schedules the ordinary reconnect fallback in its `finally`.
            // This submit path owns a stronger terminal recovery, so cancel that bounded
            // timer before it can issue a redundant ticket request against retired authority.
            if (reconnectTimer) {
              clearTimeout(reconnectTimer);
              reconnectTimer = null;
            }
            const recovered = await recoverRetiredAuthority(
              authority,
              targetSessionId,
              optimisticBaseline,
              baseRevision,
            );
            if (!recovered && hasAuthority(authority, targetSessionId)) {
              scheduleReconnect(error instanceof Error ? error.message : String(error));
            }
          }
        }
        throw error;
      }
    },

    /** Starts the curated server-owned mission template. Owner authority is enforced again server-side. */
    async startMission(request: LiveMissionStartRequest): Promise<LiveMissionReceipt> {
      if (role !== "owner") throw new LiveSessionError("Only the owner can start a mission", 403, "mission-owner-required");
      return submitMissionRequest("", request as unknown as Record<string, unknown>);
    },

    async controlMission(
      missionId: string,
      action: "activate" | "pause" | "resume" | "cancel",
      eventId: string,
    ): Promise<LiveMissionReceipt> {
      if (role !== "owner") throw new LiveSessionError("Only the owner can direct a mission", 403, "mission-owner-required");
      return submitMissionRequest(missionId, { action, eventId });
    },

    async assignMissionStage(
      missionId: string,
      stageId: string,
      memberIdToAssign: string,
      eventId: string,
    ): Promise<LiveMissionReceipt> {
      if (role !== "owner") throw new LiveSessionError("Only the owner can assign mission work", 403, "mission-owner-required");
      return submitMissionRequest(missionId, { action: "assign", eventId, stageId, memberId: memberIdToAssign });
    },

    async publishMissionProgress(
      missionId: string,
      progress: LiveMissionProgressRequest,
    ): Promise<LiveMissionReceipt> {
      if (role !== "agent") throw new LiveSessionError("Only an assigned AgentX member can publish mission progress", 403, "mission-agent-required");
      return submitMissionRequest(missionId, { action: "progress", ...progress });
    },

    /** Publishes ephemeral presence. Never revisioned, never persisted. */
    async publishPresence(presence: {
      cursor?: { x: number; y: number; z: number } | null;
      selection?: string[];
      tool?: string | null;
      color?: string | null;
    }) {
      const targetSessionId = sessionId;
      if (!targetSessionId || role === null) return null;
      const authority = authorityEpoch;
      const receipt = await call<{ ok: boolean; seq: number }>("POST", `/sessions/${targetSessionId}/presence`, presence);
      assertAuthority(authority, targetSessionId);
      return receipt;
    },

    /**
     * Undo.
     *
     * Outside a live session this is the runtime's ordinary local undo, untouched.
     *
     * Inside one it is a different act, because the runtime's undo stack is global and
     * snapshot-based: popping it reverts whatever transaction was last applied *by anyone*.
     * So a live undo asks the server to apply the inverse of this actor's own last operation
     * as a new compensating operation. Shared history moves forward, every other client
     * applies it through the ordinary path, and if someone has since touched the same
     * entities the server refuses and names them rather than clobbering their work.
     */
    async undo(opId?: string): Promise<{ ok: boolean; reason?: string; blockedBy?: string }> {
      if (!sessionId) {
        const result = api.undo();
        return result.ok ? { ok: true } : { ok: false, reason: result.error };
      }
      if (connection !== "live") {
        return { ok: false, reason: "The live session is still synchronizing." };
      }
      const targetSessionId = sessionId;
      const authority = authorityEpoch;
      const target = opId ?? lastOwnOpId;
      if (!target) return { ok: false, reason: "There is nothing of yours to undo in this session." };
      try {
        const receipt = await call<{ opId: string; revision: number; seq: number }>(
          "POST", `/sessions/${targetSessionId}/ops/${encodeURIComponent(target)}/undo`, {},
        );
        assertAuthority(authority, targetSessionId);
        // Undo is not optimistic: its inverse is embodied only when the SSE operation is
        // applied. Receipt-first must therefore wait for that event. If the event was lost
        // with a stream, an atomic snapshot is the fallback that proves the inverse is in
        // the runtime before this promise resolves and before another submit can use it.
        const inverseOpId = receipt.opId;
        if (typeof inverseOpId !== "string" || !inverseOpId) {
          throw new LiveSessionError("The undo response did not identify its inverse operation", 0, "undo-receipt-unreadable");
        }
        await waitForEmbodiedOperation(inverseOpId);
        assertAuthority(authority, targetSessionId);
        const inverseIsEmbodied = (): boolean =>
          embodiedOperations.get(inverseOpId) === runtimeLoadEpoch || latestSnapshotSeq >= receipt.seq;
        if (!inverseIsEmbodied()) {
          await resync();
          assertAuthority(authority, targetSessionId);
        }
        if (!inverseIsEmbodied()) {
          await resync();
          assertAuthority(authority, targetSessionId);
        }
        if (!inverseIsEmbodied()) {
          throw new LiveSessionError("The undo was accepted but its inverse could not be embodied", 409, "undo-not-embodied");
        }
        // The inverse arrives over the stream like any other operation and is applied there;
        // clearing this stops a second press from trying to undo the undo.
        tombstoneOwnOperation(target);
        announce();
        return { ok: true };
      } catch (error) {
        if (error instanceof LiveSessionError) {
          const blockedBy = (error as LiveSessionError & { blockedBy?: { actorId?: string } }).blockedBy?.actorId;
          return { ok: false, reason: error.message, ...(blockedBy ? { blockedBy } : {}) };
        }
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    },

    resync,

    async leave() {
      authorityEpoch += 1;
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      detachStream();
      credential = null;
      sessionId = null;
      sceneName = null;
      role = null;
      actorId = null;
      actorLabel = null;
      actorKind = null;
      memberId = null;
      members = [];
      missions = [];
      resynced = false;
      lastOwnOpId = null;
      ownOperationCandidates.clear();
      undoneOwnOperations.clear();
      ownOperations.clear();
      ownOperationLoadEpoch.clear();
      runtimeLoadEpoch = 0;
      latestSnapshotSeq = 0;
      announcedOperations.clear();
      announcedMissionEvents.clear();
      ownOperationEchoes.clear();
      embodiedOperations.clear();
      clearOwnEchoWaiters();
      clearEmbodimentWaiters();
      clearMissionWaiters();
      connection = "offline";
      lastError = null;
      events.onMissions?.([]);
      // setConnection intentionally coalesces identical values. Leave also changes sessionId,
      // so it must announce even when a pending join was already labelled offline/connecting.
      announce();
    },
  };
}

export type LiveSessionClient = ReturnType<typeof createLiveSessionClient>;

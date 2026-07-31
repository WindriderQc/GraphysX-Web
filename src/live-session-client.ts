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

export const LIVE_SESSION_SCHEMA = "graphysx.live-session/v1";

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
};

/** One accepted mutation, as every other member sees it. */
export type LiveSessionOperation = {
  schema: string;
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
  /** An accepted remote mutation, after it has been applied to this tab's runtime. */
  onOperation?: (operation: LiveSessionOperation) => void;
  onMembers?: (members: LiveSessionMemberView[]) => void;
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
  let role: LiveSessionRole | null = null;
  let actorId: string | null = null;
  let seq = 0;
  let revision = 0;
  let latencyMs: number | null = null;
  let resynced = false;
  let connection: LiveSessionConnection = "offline";
  let members: LiveSessionMemberView[] = [];
  let lastError: string | null = null;
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectStep = 0;
  let closed = false;

  /**
   * Operation ids this tab submitted. A member's own operation comes back over the stream
   * like anyone else's; applying it again would double it. The server's idempotency covers
   * a *resubmission*; this covers the echo.
   */
  const ownOperations = new Set<string>();
  /** This actor's most recent accepted operation id — what `undo` reverses. */
  let lastOwnOpId: string | null = null;

  const status = (): LiveSessionStatus => ({
    connection, sessionId, role, actorId, revision, seq, latencyMs, resynced,
    members: members.map((member) => ({ ...member })),
    error: lastError,
  });

  const announce = (): void => events.onStatus?.(status());

  const setConnection = (next: LiveSessionConnection, error: string | null = null): void => {
    if (connection === next && lastError === error) return;
    connection = next;
    lastError = error;
    announce();
  };

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
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
    latencyMs = Math.round(performance.now() - startedAt);
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
    if (typeof event.seq === "number") seq = Math.max(seq, event.seq);
    if (ownOperations.has(event.opId)) {
      // Our own echo: already applied locally when it was submitted.
      revision = Math.max(revision, event.revision);
      announce();
      return;
    }
    if (!applyRemote(event)) return;
    revision = Math.max(revision, event.revision);
    events.onOperation?.(event);
    announce();
  }

  function openStream(): void {
    if (closed || !sessionId || !credential) return;
    setConnection(seq > 0 ? "reconnecting" : "connecting");
    void (async () => {
      try {
        const ticket = await call<{ ticket: string }>("POST", `/sessions/${sessionId}/stream-ticket`, {});
        if (closed) return;
        const url = `${root}/sessions/${sessionId}/stream?ticket=${encodeURIComponent(ticket.ticket)}&since=${seq}`;
        const stream = new EventSource(url);
        source = stream;

        stream.addEventListener("hello", (message) => {
          const hello = JSON.parse((message as MessageEvent).data) as {
            revision: number; seq: number; role: LiveSessionRole; mustResync: boolean;
          };
          role = hello.role;
          reconnectStep = 0;
          setConnection("live");
          if (hello.mustResync) {
            // The server cannot prove what we missed. A snapshot is the only honest answer.
            void resync();
          } else {
            revision = Math.max(revision, hello.revision);
            announce();
          }
        });

        stream.addEventListener("op", (message) => {
          ingest(JSON.parse((message as MessageEvent).data) as LiveSessionOperation);
        });

        stream.addEventListener("presence", (message) => {
          const payload = JSON.parse((message as MessageEvent).data) as { seq: number; members: LiveSessionMemberView[] };
          seq = Math.max(seq, payload.seq);
          members = payload.members;
          events.onMembers?.(members);
          announce();
        });

        stream.addEventListener("member", (message) => {
          const payload = JSON.parse((message as MessageEvent).data) as { seq: number };
          seq = Math.max(seq, payload.seq);
          announce();
        });

        stream.addEventListener("closed", () => {
          closed = true;
          stream.close();
          source = null;
          setConnection("offline", "The session was closed");
        });

        stream.onerror = () => {
          stream.close();
          source = null;
          if (closed) return;
          scheduleReconnect();
        };
      } catch (error) {
        if (closed) return;
        events.onError?.(error instanceof Error ? error : new Error(String(error)));
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

  /** Whole-document recovery. Used on join, and whenever continuity cannot be proved. */
  async function resync(): Promise<number> {
    if (!sessionId) throw new LiveSessionError("Not in a session", 400);
    const snapshot = await call<{ revision: number; seq: number; definition: AgentWorldDefinition; session: LiveSessionView }>(
      "GET", `/sessions/${sessionId}/snapshot`,
    );
    const result = api.load(snapshot.definition);
    if (!result.ok) {
      // Surfaced on the status, not only thrown: a join that dies here used to leave the
      // panel reading "offline" with no error at all, which is the least useful thing a
      // connection indicator can do.
      setConnection("offline", `Could not load the session scene: ${result.error}`);
      throw new LiveSessionError(`Could not load the session scene: ${result.error}`, 422, "snapshot-rejected");
    }
    revision = snapshot.revision;
    seq = Math.max(seq, snapshot.seq);
    members = snapshot.session.members;
    resynced = true;
    // After a resync this tab's notion of "my last operation" may predate history the server
    // still holds but this client can no longer reason about; the undo route decides.
    lastOwnOpId = null;
    events.onResync?.(revision);
    events.onMembers?.(members);
    announce();
    return revision;
  }

  return {
    get status(): LiveSessionStatus {
      return status();
    },

    /** Exchanges an invitation for a scoped credential, then joins and syncs. */
    async join(targetSessionId: string, code: string, actor: { id: string; label?: string; kind?: "human" | "agent" }) {
      closed = false;
      sessionId = targetSessionId;
      const joined = await call<{ credential: string; member: LiveSessionMemberView; session: LiveSessionView }>(
        "POST", `/sessions/${targetSessionId}/join`, { code, actor },
      );
      // The invitation is spent from here on; only the scoped credential survives, and it
      // lives in this closure rather than in storage the rest of the page can read.
      credential = joined.credential;
      role = joined.member.role;
      actorId = joined.member.actorId;
      members = joined.session.members;
      resynced = false;
      try {
        await resync();
      } catch (error) {
        // The credential is good but the scene would not load. Report it as the connection
        // failure it is rather than leaving the caller with a half-joined client.
        setConnection("offline", error instanceof Error ? error.message : String(error));
        throw error;
      }
      // The initial sync is a join, not a recovery — `resynced` marks "we lost continuity
      // and had to reload", and saying that on the way in would be a lie.
      resynced = false;
      openStream();
      return joined.member;
    },

    /** Resumes an already-credentialled session (owner, or a restored client). */
    async attach(targetSessionId: string, memberCredential: string) {
      closed = false;
      sessionId = targetSessionId;
      credential = memberCredential;
      const view = await call<{ session: LiveSessionView; you: LiveSessionMemberView }>("GET", `/sessions/${targetSessionId}`);
      role = view.you.role;
      actorId = view.you.actorId;
      members = view.session.members;
      await resync();
      resynced = false;
      openStream();
      return view.you;
    },

    /**
     * Submits an incremental change. Applies locally first so the author sees no lag, then
     * sends; a rejection rolls the local runtime back to the server's truth via resync
     * rather than leaving this tab holding a change nobody else has.
     */
    async submit(commands: AgentWorldCommand[], options: { intent?: string; path?: string; opId?: string } = {}) {
      if (!sessionId) throw new LiveSessionError("Not in a session", 400);
      if (role === "viewer") throw new LiveSessionError("Viewers cannot change the scene", 403, "role-forbidden");
      const opId = options.opId ?? `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      ownOperations.add(opId);
      const local = api.commit({
        actor: { id: actorId ?? "local", label: actorId ?? "local", kind: "human" },
        intent: options.intent ?? "live edit",
        commands,
      });
      if (!local.ok) {
        ownOperations.delete(opId);
        throw new LiveSessionError(local.error ?? "The change was rejected locally", 422, "local-rejected");
      }
      try {
        const receipt = await call<{ seq: number; revision: number; duplicate?: boolean }>(
          "POST", `/sessions/${sessionId}/ops`,
          { opId, baseRevision: revision, path: options.path ?? "transaction", commands, intent: options.intent },
        );
        revision = receipt.revision;
        seq = Math.max(seq, receipt.seq);
        lastOwnOpId = opId;
        announce();
        return receipt;
      } catch (error) {
        // Optimistic application is only honest if the rollback is real. The server is the
        // authority on what happened; take its version rather than keep a private one.
        ownOperations.delete(opId);
        await resync().catch(() => undefined);
        throw error;
      }
    },

    /** Publishes ephemeral presence. Never revisioned, never persisted. */
    async publishPresence(presence: {
      cursor?: { x: number; y: number; z: number } | null;
      selection?: string[];
      tool?: string | null;
      color?: string | null;
    }) {
      if (!sessionId || role === null) return null;
      return call<{ ok: boolean; seq: number }>("POST", `/sessions/${sessionId}/presence`, presence);
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
      const target = opId ?? lastOwnOpId;
      if (!target) return { ok: false, reason: "There is nothing of yours to undo in this session." };
      try {
        const receipt = await call<{ revision: number; seq: number }>(
          "POST", `/sessions/${sessionId}/ops/${encodeURIComponent(target)}/undo`, {},
        );
        revision = receipt.revision;
        seq = Math.max(seq, receipt.seq);
        // The inverse arrives over the stream like any other operation and is applied there;
        // clearing this stops a second press from trying to undo the undo.
        lastOwnOpId = null;
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
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      source?.close();
      source = null;
      credential = null;
      sessionId = null;
      role = null;
      members = [];
      setConnection("offline");
    },
  };
}

export type LiveSessionClient = ReturnType<typeof createLiveSessionClient>;

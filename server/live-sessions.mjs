// Live Sessions — authenticated, scene-scoped collaboration on top of the scene store.
//
// What this adds over the store's existing relay: identity. The store's token is one shared
// secret that says "allowed to write", not "who"; `actor` on a change is self-reported and
// unverifiable. That is fine for a LAN authoring tool and not fine for two humans and an
// agent sharing a scene, where "who did this" and "may this actor do this" are the whole
// point.
//
// Shape of the thing:
//
//   - A *session* is scoped to one stored scene, owned by whoever created it, and expires.
//   - A *member* is an actor inside one session, holding a credential that is worthless in
//     any other session, and carrying a role that the server (not the UI) enforces.
//   - An *invitation* is a short-lived, revocable, role-scoped code that is exchanged once
//     for a member credential. It is deliberately a different secret with a different
//     lifetime, so a link pasted into a chat cannot become a permanent key.
//   - An *operation* is an incremental, idempotent, revision-based change. It applies
//     through `applyCommands` — the same validated document path `PUT /scenes` and the
//     store's own `/changes` route use. There is no private mutation path for any actor.
//   - *Presence* (cursor, selection, active tool) is ephemeral, lives only in memory, and
//     never touches the scene revision. It is not part of the portable document.
//
// Transport is HTTP + SSE, reusing the decision already recorded in scene-store.mjs: the
// traffic is deltas down and operations up over ordinary POST, needs no nginx upgrade
// block, and EventSource's Last-Event-ID is already the resume-from-a-sequence shape the
// runtime's own event stream uses. See docs/LIVE_SESSIONS.md for the tradeoff in full.
//
// Fail-closed: every route here refuses to operate unless the store is running with a
// GRAPHYSX_STORE_TOKEN. The store's tokenless compatibility mode is a deliberate LAN
// convenience for *authoring*; inheriting it here would mean anyone who can reach the port
// can mint an owner session. See `enabled` below.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { applyCommands, describeCommands } from "./scene-commands.mjs";
import { httpError, readJsonBody, sendJson } from "./http-util.mjs";
import {
  LIVE_MISSION_EVENT_SCHEMA,
  LIVE_MISSION_SCHEMA,
  MISSION_CAPABILITIES,
  MISSION_LIMITS,
  applyMissionEvent,
  createMission,
  interruptMissionForMember,
  missionView,
  normalizeMissionEvent,
  normalizeMissionStart,
} from "./live-missions.mjs";

export const LIVE_SESSION_SCHEMA = "graphysx.live-session/v1";
export const LIVE_OP_SCHEMA = "graphysx.live-op/v1";
export const LIVE_PRESENCE_SCHEMA = "graphysx.live-presence/v1";

// --- caps ------------------------------------------------------------------------------
// Every one of these is a bound on something an untrusted client controls. They are
// deliberately small: this is a collaboration tool for a handful of people in one scene,
// not a platform, and a small bound that can be raised is safer than a large one nobody
// revisits.
const LIMITS = {
  sessions: 64,
  membersPerSession: 16,
  invitesPerSession: 32,
  /** Replayable operation events retained per session. Beyond this, a client must resync. */
  opLog: 512,
  /** Operation bodies. A document command list is small; a 256KB one is already suspect. */
  opBodyBytes: 256 * 1024,
  presenceBodyBytes: 8 * 1024,
  joinBodyBytes: 8 * 1024,
  commandsPerOp: 64,
  selectionIds: 32,
  sessionTtlMs: 24 * 60 * 60 * 1000,
  defaultSessionTtlMs: 6 * 60 * 60 * 1000,
  inviteTtlMs: 24 * 60 * 60 * 1000,
  defaultInviteTtlMs: 15 * 60 * 1000,
  inviteMaxUses: 16,
  /** A stream ticket is a one-shot, near-instant handoff. It is not a credential. */
  streamTicketMs: 30 * 1000,
  /** Outstanding one-shot tickets. Consumed/expired tickets leave this map immediately. */
  ticketsPerSession: 32,
  presenceTtlMs: 45 * 1000,
  labelChars: 80,
  intentChars: 240,
  subscribersPerSession: 32,
  missionBodyBytes: MISSION_LIMITS.bodyBytes,
  missionsPerSession: MISSION_LIMITS.missionsPerSession,
  missionEventsPerSession: MISSION_LIMITS.clientEventsPerSession,
  missionEventsPerMember: MISSION_LIMITS.clientEventsPerMember,
  missionOwnerEventReserve: MISSION_LIMITS.ownerEventReserve,
};

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;
const ACTOR_KINDS = new Set(["human", "agent", "system"]);

/**
 * Roles, enforced server-side. The UI hides what a role cannot do; this table is what
 * actually stops it. `agent` is deliberately identical to `editor` in shape and narrower in
 * practice: an agent member also carries an explicit capability list (see `capabilities`),
 * and an agent with no capabilities can read and be present but cannot mutate.
 */
const ROLES = {
  owner: { read: true, mutate: true, present: true, invite: true, manage: true, missionManage: true, missionProgress: false },
  editor: { read: true, mutate: true, present: true, invite: false, manage: false, missionManage: false, missionProgress: false },
  viewer: { read: true, mutate: false, present: true, invite: false, manage: false, missionManage: false, missionProgress: false },
  agent: { read: true, mutate: true, present: true, invite: false, manage: false, missionManage: false, missionProgress: true },
};

/**
 * Operation paths a session member may submit. This is an allowlist, not a namespace walk:
 * a remote actor naming an arbitrary dotted path is how "call any function on the API"
 * bugs happen. Every entry maps to document commands `applyCommands` already validates.
 */
const OP_PATHS = new Set(["transaction", "spawn", "update", "remove", "set-environment"]);
const AGENT_CAPABILITIES = new Set([...OP_PATHS, ...MISSION_CAPABILITIES]);

const digest = (value) => createHash("sha256").update(String(value)).digest();

/** Stable JSON for binding an idempotency key to one semantic request body. */
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

const operationFingerprint = (value) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

/** Constant-time compare of two secrets via their digests (equal length by construction). */
function secretMatches(presented, expectedDigest) {
  if (typeof presented !== "string" || !presented) return false;
  return timingSafeEqual(digest(presented), expectedDigest);
}

/** 32 bytes from the CSPRNG. Not a uuid: uuids are identifiers, these are keys. */
const newSecret = () => randomBytes(32).toString("base64url");
const newId = (prefix) => `${prefix}-${randomBytes(9).toString("base64url")}`;

/**
 * Credentials are `<id>.<secret>`: the id selects the record so verification is one
 * constant-time compare against one digest rather than a scan over every member (which
 * would leak timing proportional to position, and cost O(members) per request).
 */
function splitCredential(value) {
  if (typeof value !== "string") return null;
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  return { id: value.slice(0, dot), secret: value.slice(dot + 1) };
}

function assertId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw httpError(`Invalid ${label}: ${String(value)}`, 400);
  return value;
}

function assertLabel(value, label, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw httpError(`${label} must be a string`, 400);
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.length > LIMITS.labelChars) throw httpError(`${label} must be ${LIMITS.labelChars} characters or fewer`, 400);
  return trimmed;
}

function assertTtl(value, fallbackMs, maxMs, label) {
  if (value === undefined || value === null) return fallbackMs;
  if (!Number.isFinite(value) || value <= 0) throw httpError(`${label} must be a positive number of seconds`, 400);
  const ms = Math.floor(value * 1000);
  if (ms > maxMs) throw httpError(`${label} must be ${Math.floor(maxMs / 1000)} seconds or fewer`, 400);
  return ms;
}

/** A finite 3-vector or null. Rejects NaN/Infinity, which otherwise poison every consumer. */
function assertVector(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") throw httpError(`${label} must be an object or null`, 400);
  const out = {};
  for (const axis of ["x", "y", "z"]) {
    const component = value[axis];
    if (!Number.isFinite(component)) throw httpError(`${label}.${axis} must be a finite number`, 400);
    out[axis] = Number(component);
  }
  return out;
}

/**
 * Token-bucket limiter. Per member, per class of request: a burst of edits while dragging
 * is normal, a sustained thousand-per-second is not.
 */
function createBucket(capacity, refillPerSecond, now) {
  let tokens = capacity;
  let last = now();
  return (cost = 1) => {
    const at = now();
    tokens = Math.min(capacity, tokens + ((at - last) / 1000) * refillPerSecond);
    last = at;
    if (tokens < cost) return false;
    tokens -= cost;
    return true;
  };
}

/**
 * The session engine. `now` is injectable so expiry and rate limits are testable without
 * sleeping through them — an expiry test that sleeps is a flaky test.
 */
export function createLiveSessions({ store, guard, now = () => Date.now() } = {}) {
  /** sessionId → session */
  const sessions = new Map();

  const enabled = Boolean(guard?.enabled);

  function sweep() {
    const at = now();
    for (const [id, session] of sessions) {
      if (session.expiresAt <= at) {
        // Stop new admissions synchronously, then retire behind work already admitted to the
        // session chain. Fire-and-observe is intentional: `sweep` is used from synchronous
        // authentication helpers, while the terminal stream is completed asynchronously.
        session.closing = true;
        sessions.delete(id);
        void retireSession(session, "expired").catch(() => closeSession(session, "expired"));
        continue;
      }
      for (const [inviteId, invite] of session.invites) {
        if (invite.expiresAt <= at || invite.revokedAt) session.invites.delete(inviteId);
      }
      for (const [ticketId, ticket] of session.tickets) {
        if (ticket.expiresAt <= at) session.tickets.delete(ticketId);
      }
    }
  }

  function endSubscriber(session, subscriber, event, payload) {
    // Remove it before writing the terminal frame. A synchronous operation broadcast that
    // follows this call must never be able to reach a revoked/closed stream, even if Node's
    // close notification is delivered on a later turn.
    subscriber.cleanup?.({ broadcast: false });
    try {
      subscriber.response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
      subscriber.response.end();
    } catch {
      // The stream is already gone; cleanup above is intentionally idempotent.
    }
  }

  function closeSession(session, reason, authoritative = null) {
    session.closing = true;
    session.closed = true;
    const documentCut = authoritative ?? (session.authoritative ? {
      revision: session.authoritative.revision,
      seq: session.seq,
      definition: session.authoritative.definition,
    } : null);
    const finalCut = documentCut ? { ...documentCut, missions: missionViews(session) } : null;
    const payload = {
      schema: LIVE_SESSION_SCHEMA,
      event: "closed",
      sessionId: session.id,
      reason,
      seq: session.seq,
      revision: session.revision,
      ...(finalCut ?? {}),
    };
    for (const subscriber of [...session.subscribers.values()]) {
      try {
        endSubscriber(session, subscriber, "closed", payload);
      } catch {
        // The stream is already gone; nothing to clean up beyond dropping the reference.
      }
    }
    session.subscribers.clear();
  }

  /** Finish a session only after every task admitted before `closing` has settled. */
  function retireSession(session, reason) {
    return queueSessionTask(session, async () => {
      if (session.closed) return;
      try {
        const record = await store.get(session.sceneName);
        if (!record) {
          closeSession(session, reason);
          return;
        }
        session.revision = record.revision;
        session.authoritative = {
          definition: structuredClone(record.definition),
          revision: record.revision,
        };
        closeSession(session, reason, {
          revision: record.revision,
          seq: session.seq,
          definition: record.definition,
        });
      } catch (error) {
        // Fail closed and carry the last proven cut. A store outage may turn the DELETE into
        // a 500, but it must never leave an already-revoked stream alive and receiving ops.
        closeSession(session, reason);
        throw error;
      }
    }, { allowClosed: true });
  }

  // --- broadcast -------------------------------------------------------------------
  //
  // One monotonic `seq` covers every session event. Operations are retained in a bounded
  // ring so a reconnecting client can be handed exactly what it missed; presence is NOT
  // retained, because presence is a full snapshot every time and replaying stale cursors is
  // worse than sending the current ones. A resuming client therefore gets its missed ops
  // plus one fresh presence snapshot, which is why a presence gap is not a resync trigger.

  function nextSeq(session) {
    session.seq += 1;
    return session.seq;
  }

  function push(session, event, { retain = false } = {}) {
    if (retain) {
      session.log.push(event);
      while (session.log.length > LIMITS.opLog) {
        const dropped = session.log.shift();
        if (dropped?.opId) session.applied.delete(dropped.opId);
        // Presence consumes sequence numbers but is intentionally not retained. A resume is
        // impossible only when a retained event was actually dropped, not merely because a
        // non-retained presence sequence sits between two retained events.
        if (Number.isInteger(dropped?.seq)) session.replayFloorSeq = Math.max(session.replayFloorSeq, dropped.seq);
      }
    }
    const frame = `id: ${event.seq}\nevent: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const subscriber of session.subscribers.values()) {
      const subscribedMember = session.members.get(subscriber.memberId);
      if (!subscribedMember || subscribedMember.revokedAt) continue;
      try {
        subscriber.response.write(frame);
      } catch {
        // Cleanup is driven by the request's close handler, never from the write path.
      }
    }
  }

  /**
   * Installs a store cut that did not originate as a live-session operation.
   * The retained marker is the ordering barrier; the queued snapshot carries the document.
   */
  function adoptExternalRecord(session, record) {
    // A delayed notifier for R must not roll a session back after another writer reached R+1.
    if (record.revision < session.revision) return null;
    const previousRevision = session.revision;
    session.revision = record.revision;
    session.authoritative = {
      definition: structuredClone(record.definition),
      revision: record.revision,
    };
    if (record.revision === previousRevision) return null;
    const event = {
      schema: LIVE_SESSION_SCHEMA,
      event: "resync",
      reason: "external-revision",
      seq: nextSeq(session),
      sessionId: session.id,
      revision: record.revision,
      at: new Date(now()).toISOString(),
    };
    push(session, event, { retain: true });
    return event;
  }

  /** Missed retained events, or null when the gap cannot be bridged honestly. */
  function catchUp(session, sinceSeq) {
    if (!Number.isFinite(sinceSeq) || sinceSeq <= 0) return [];
    // A client claiming a sequence the server never issued is not "up to date" — it is
    // desynchronised, most likely against a different session or a restarted server. It
    // gets a resync, not an empty catch-up that would leave it silently wrong forever.
    if (sinceSeq > session.seq) return null;
    if (sinceSeq < session.replayFloorSeq) return null;
    return session.log.filter((entry) => entry.seq > sinceSeq);
  }

  // --- views ------------------------------------------------------------------------
  //
  // Everything a client sees goes through these. No credential, digest, ticket or invite
  // secret has a path into a response body, an SSE frame or a log line.

  function memberView(session, member) {
    const presence = member.presence && member.presence.expiresAt > now() ? member.presence : null;
    return {
      memberId: member.id,
      actorId: member.actorId,
      label: member.label,
      kind: member.kind,
      role: member.role,
      capabilities: member.role === "agent" ? [...member.capabilities] : null,
      joinedAt: new Date(member.joinedAt).toISOString(),
      online: !member.revokedAt && member.streams > 0,
      lastSeenAt: member.lastSeenAt ? new Date(member.lastSeenAt).toISOString() : null,
      presence: presence
        ? { cursor: presence.cursor, selection: [...presence.selection], tool: presence.tool, color: presence.color }
        : null,
    };
  }

  function missionViews(session) {
    return [...session.missions.values()].map((mission) => missionView(mission));
  }

  function sessionView(session) {
    return {
      schema: LIVE_SESSION_SCHEMA,
      sessionId: session.id,
      sceneName: session.sceneName,
      label: session.label,
      ownerActorId: session.ownerActorId,
      status: session.expiresAt <= now() ? "expired" : session.closing || session.closed ? "closed" : "open",
      createdAt: new Date(session.createdAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      revision: session.revision,
      seq: session.seq,
      members: [...session.members.values()].map((member) => memberView(session, member)),
      missions: missionViews(session),
    };
  }

  function presenceEvent(session) {
    return {
      schema: LIVE_PRESENCE_SCHEMA,
      event: "presence",
      seq: nextSeq(session),
      sessionId: session.id,
      at: new Date(now()).toISOString(),
      members: [...session.members.values()].map((member) => memberView(session, member)),
    };
  }

  // --- authentication ----------------------------------------------------------------

  function requireSession(sessionId) {
    sweep();
    const session = sessions.get(sessionId);
    if (!session || session.closing || session.closed) throw httpError(`Unknown session: ${sessionId}`, 404);
    return session;
  }

  /**
   * Resolves `x-graphysx-session` to a member. Every failure is the same 401 with the same
   * message: distinguishing "no such member" from "wrong secret" hands an attacker a
   * membership oracle for free.
   */
  function requireMember(session, request) {
    const header = request.headers["x-graphysx-session"];
    const parts = splitCredential(typeof header === "string" ? header.trim() : null);
    const denied = () => httpError("A valid session credential is required", 401);
    if (!parts) throw denied();
    const member = session.members.get(parts.id);
    if (!member) {
      // Burn comparable time on a decoy so a missing member and a wrong secret cost the
      // same. Cheap, and it closes the obvious enumeration channel.
      secretMatches(parts.secret, session.decoyDigest);
      throw denied();
    }
    if (!secretMatches(parts.secret, member.secretDigest)) throw denied();
    if (member.revokedAt) throw httpError("This session membership has been revoked", 403);
    member.lastSeenAt = now();
    return member;
  }

  function requireCapability(member, capability) {
    if (!ROLES[member.role]?.[capability]) {
      throw httpError(`Role '${member.role}' may not ${capability} in this session`, 403);
    }
  }

  function requireOwnerToken(request) {
    if (!guard.authorized(request)) {
      throw httpError("Creating a live session requires the store token (Authorization: Bearer <GRAPHYSX_STORE_TOKEN>)", 401);
    }
  }

  /**
   * Origins are *rejected*, not merely un-CORS-ed. Omitting the allow-origin header stops a
   * browser and does nothing to a script; a session endpoint should refuse both.
   */
  function requireAllowedOrigin(request) {
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !origin) return; // non-browser client; token is the gate
    if (!guard.originAllowed(origin)) throw httpError("Origin is not allowed for live sessions", 403);
  }

  // --- lifecycle ---------------------------------------------------------------------

  async function createSession({ sceneName, label, ttlSeconds, owner }) {
    sweep();
    if (sessions.size >= LIMITS.sessions) throw httpError("Too many live sessions are open", 429);
    const name = assertId(sceneName, "scene name");
    const record = await store.get(name);
    if (!record) throw httpError(`Unknown scene: ${name}`, 404);

    const ownerActorId = assertId(owner?.id, "owner actor id");
    const ttl = assertTtl(ttlSeconds, LIMITS.defaultSessionTtlMs, LIMITS.sessionTtlMs, "ttlSeconds");
    const at = now();
    const session = {
      id: newId("gxs"),
      sceneName: name,
      label: assertLabel(label, "label", `${name} live session`),
      ownerActorId,
      createdAt: at,
      expiresAt: at + ttl,
      revision: record.revision,
      seq: 0,
      members: new Map(),
      invites: new Map(),
      tickets: new Map(),
      /** Response → member-bound stream record. Binding is what makes revocation terminal. */
      subscribers: new Map(),
      log: [],
      /** Highest retained-event sequence evicted from the replay ring. */
      replayFloorSeq: 0,
      /** opId → originating member, canonical request fingerprint, receipt and canonical event. */
      applied: new Map(),
      /** Mission state is session-authoritative and shares this session's sequence/replay. */
      missions: new Map(),
      /** Client event id → member/fingerprint/original receipt; bounded for the session lifetime. */
      missionApplied: new Map(),
      /** Accepted client mission events per member; bounded by members × the member cap. */
      missionAcceptedByMember: new Map(),
      /** Last store-proven document, used only if a terminal store read itself fails. */
      authoritative: { definition: structuredClone(record.definition), revision: record.revision },
      closing: false,
      closed: false,
      /**
       * Operations apply one at a time per session.
       *
       * Without this, two members submitting inside the same tick both read revision R and
       * both write expecting R; the store's per-scene write chain rejects the loser with a
       * 409 it did nothing to deserve. The session is the natural serialisation point, so
       * arrival order decides and a conflict means what it should: *this client* was
       * working from a stale revision, not that two clients were merely fast.
       */
      chain: Promise.resolve(),
      /** Compared against when a member id does not exist, to equalise timing. */
      decoyDigest: digest(newSecret()),
    };

    const { member, credential } = addMember(session, {
      actorId: ownerActorId,
      label: assertLabel(owner?.label, "owner label", ownerActorId),
      kind: "human",
      role: "owner",
      capabilities: [],
    });
    sessions.set(session.id, session);
    return { session, member, credential };
  }

  function addMember(session, { actorId, label, kind, role, capabilities }) {
    if (session.members.size >= LIMITS.membersPerSession) throw httpError("This session is full", 429);
    const secret = newSecret();
    const member = {
      id: newId("m"),
      actorId,
      label,
      kind,
      role,
      capabilities: new Set(capabilities ?? []),
      secretDigest: digest(secret),
      joinedAt: now(),
      lastSeenAt: now(),
      revokedAt: null,
      streams: 0,
      presence: null,
      ops: createBucket(40, 10, now),
      presenceHits: createBucket(30, 8, now),
      // Separate from mutation tokens: a reconnect storm must not consume authoring budget,
      // and a ticket-minting attack must not be able to allocate without bound.
      ticketHits: createBucket(8, 2, now),
      // Mission coordination has its own budget; scene authoring and reconnects cannot starve it.
      missionHits: createBucket(24, 4, now),
    };
    session.members.set(member.id, member);
    return { member, credential: `${member.id}.${secret}` };
  }

  function createInvite(session, { role, ttlSeconds, maxUses, capabilities, label }) {
    sweep();
    if (session.invites.size >= LIMITS.invitesPerSession) throw httpError("Too many open invitations", 429);
    if (!Object.hasOwn(ROLES, role) || role === "owner") throw httpError(`Invitations may grant editor, viewer or agent — not '${String(role)}'`, 400);
    const uses = maxUses === undefined ? 1 : maxUses;
    if (!Number.isInteger(uses) || uses < 1 || uses > LIMITS.inviteMaxUses) {
      throw httpError(`maxUses must be an integer between 1 and ${LIMITS.inviteMaxUses}`, 400);
    }
    let scoped = [];
    if (role === "agent") {
      if (!Array.isArray(capabilities)) throw httpError("An agent invitation requires an explicit capabilities array", 400);
      scoped = [...new Set(capabilities.map((entry) => {
        if (!AGENT_CAPABILITIES.has(entry)) throw httpError(`Unsupported agent capability: ${String(entry)}`, 400);
        return entry;
      }))];
    } else if (capabilities !== undefined) {
      throw httpError("capabilities may only be scoped on an agent invitation", 400);
    }
    const secret = newSecret();
    const invite = {
      id: newId("i"),
      secretDigest: digest(secret),
      role,
      capabilities: scoped,
      label: assertLabel(label, "invite label", null),
      createdAt: now(),
      expiresAt: now() + assertTtl(ttlSeconds, LIMITS.defaultInviteTtlMs, LIMITS.inviteTtlMs, "ttlSeconds"),
      maxUses: uses,
      uses: 0,
      revokedAt: null,
    };
    session.invites.set(invite.id, invite);
    return { invite, code: `${invite.id}.${secret}` };
  }

  function inviteView(invite) {
    return {
      inviteId: invite.id,
      role: invite.role,
      capabilities: invite.role === "agent" ? [...invite.capabilities] : null,
      label: invite.label,
      expiresAt: new Date(invite.expiresAt).toISOString(),
      maxUses: invite.maxUses,
      uses: invite.uses,
      revoked: Boolean(invite.revokedAt),
    };
  }

  function redeemInvite(session, { code, actor }) {
    sweep();
    const parts = splitCredential(typeof code === "string" ? code.trim() : null);
    // One message for every failure mode: expired, revoked, spent, wrong, absent. A client
    // that can tell them apart can probe for which invitations exist.
    const denied = () => httpError("This invitation is not valid", 403);
    if (!parts) throw denied();
    const invite = session.invites.get(parts.id);
    if (!invite) {
      secretMatches(parts.secret, session.decoyDigest);
      throw denied();
    }
    if (!secretMatches(parts.secret, invite.secretDigest)) throw denied();
    if (invite.revokedAt || invite.expiresAt <= now() || invite.uses >= invite.maxUses) throw denied();

    const actorId = assertId(actor?.id, "actor id");
    const kind = actor?.kind ?? (invite.role === "agent" ? "agent" : "human");
    if (!ACTOR_KINDS.has(kind)) throw httpError(`Unsupported actor kind: ${String(kind)}`, 400);
    if (invite.role === "agent" && kind !== "agent") throw httpError("An agent invitation must be redeemed by an agent actor", 400);

    invite.uses += 1;
    if (invite.uses >= invite.maxUses) session.invites.delete(invite.id);

    const joined = addMember(session, {
      actorId,
      label: assertLabel(actor?.label, "actor label", actorId),
      kind,
      role: invite.role,
      capabilities: invite.capabilities,
    });
    push(session, {
      schema: LIVE_SESSION_SCHEMA,
      event: "member",
      seq: nextSeq(session),
      sessionId: session.id,
      change: "joined",
      member: memberView(session, joined.member),
      at: new Date(now()).toISOString(),
    }, { retain: true });
    return joined;
  }


// --- inverse operations ------------------------------------------------------------------
//
// Collaborative undo, done as a *compensating operation* rather than a rewind.
//
// The runtime's own undo is a snapshot stack: it pops whatever transaction was last applied,
// by anyone. In a shared session that silently deletes a colleague's work, which is the one
// outcome the product may never produce. So undoing here never rewinds shared history — it
// computes the inverse of one operation and submits it as a NEW operation, attributed to the
// same actor, which every other client applies like any other change.
//
// The inverse is computed at apply time, from the document as it was *before* the operation,
// and stored on the log entry. Recomputing it later is impossible: the pre-state is gone.

/** Entity ids an operation touched, for the safety check below. */
function touchedEntityIds(commands, outputs) {
  const ids = new Set();
  commands.forEach((command, index) => {
    if (command.op === "spawn") {
      const id = outputs[index]?.id;
      if (id) ids.add(id);
    } else if (command.op === "update") {
      ids.add(command.id);
    } else if (command.op === "remove") {
      for (const id of outputs[index]?.ids ?? [command.id]) ids.add(id);
    } else if (command.op === "set-environment") {
      // The environment is a single shared slot; name it so two environment edits conflict.
      ids.add("@environment");
    }
  });
  return [...ids];
}

/**
 * The commands that undo `commands`, or null when the operation cannot be inverted exactly.
 *
 * Null is a real answer, not a failure to try. An `update` that introduced a field absent
 * before it cannot be inverted through the merge semantics `applyCommands` uses — there is no
 * command that removes a key — and guessing would leave the document subtly different from
 * where it started while reporting success.
 */
function computeInverseCommands(preDefinition, commands, outputs) {
  const byId = new Map((preDefinition.entities ?? []).map((entity) => [entity.id, entity]));
  const order = new Map((preDefinition.entities ?? []).map((entity, index) => [entity.id, index]));
  const inverseGroups = [];

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const output = outputs[index];

    if (command.op === "spawn") {
      const id = output?.id;
      if (!id) return null;
      inverseGroups.push([{ op: "remove", id }]);
      continue;
    }

    if (command.op === "remove") {
      // Removing takes descendants with it, so the inverse restores every id the command
      // actually deleted — in the document's original order, so a parent is respawned
      // before the child that references it.
      const ids = [...(output?.ids ?? [command.id])].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
      const restores = [];
      for (const id of ids) {
        const entity = byId.get(id);
        if (!entity) return null;
        restores.push({ op: "spawn", entity: structuredClone(entity) });
      }
      inverseGroups.push(restores);
      continue;
    }

    if (command.op === "update") {
      const entity = byId.get(command.id);
      if (!entity) return null;
      const patch = command.patch ?? {};
      const restore = {};
      for (const key of Object.keys(patch)) {
        if (!(key in entity)) return null; // introduced a field; no command removes one
        restore[key] = structuredClone(entity[key]);
      }
      inverseGroups.push([{ op: "update", id: command.id, patch: restore }]);
      continue;
    }

    if (command.op === "set-environment") {
      inverseGroups.push([{ op: "set-environment", environment: structuredClone(preDefinition.environment ?? {}) }]);
      continue;
    }

    return null;
  }

  // Applied in reverse: undoing "remove A then spawn B" must despawn B before restoring A.
  return inverseGroups.reverse().flat();
}

  // --- operations ---------------------------------------------------------------------

  /**
   * Serialises every task that must observe the authored document and the session's
   * operation clock as one cut. A rejection never poisons the next task.
   *
   * Snapshots belong on this chain too: reading the store outside it can capture revision
   * R, yield while an operation commits R+1 and increments `session.seq`, then return the
   * definition from R labelled with the sequence after R+1. A client reconnecting from
   * that sequence would never be offered the operation it is missing.
   */
  function queueSessionTask(session, task, { allowClosed = false } = {}) {
    // Admission is captured when the task is appended, not when it eventually runs. A close
    // flips `closing` synchronously: older admitted operations finish before its terminal
    // snapshot, while anything attempting to append afterwards is rejected.
    const admitted = allowClosed || (!session.closing && !session.closed);
    const run = () => {
      if (!admitted) {
        throw httpError("This live session is closed", 410, { code: "session-closed" });
      }
      return task();
    };
    const next = session.chain.then(run, run);
    session.chain = next.then(() => undefined, () => undefined);
    return next;
  }

  /**
   * Applies one incremental operation.
   *
   * The order here is the whole conflict story: idempotency first (a retried operation must
   * return its original receipt, not a second application), then base-revision check
   * against the *store's* current revision, then validation, then the store write. The
   * store's own `expectedRevision` is passed through as well, so two operations racing
   * inside the same millisecond are still serialised by the store's per-scene write chain
   * rather than by this check alone.
   */
  async function submitOperation(session, member, body) {
    requireCapability(member, "mutate");

    const opId = assertId(body?.opId, "opId");
    const path = body?.path ?? "transaction";
    if (!OP_PATHS.has(path)) throw httpError(`Unsupported operation path: ${String(path)}`, 400);
    if (member.role === "agent" && !member.capabilities.has(path)) {
      throw httpError(`This agent is not scoped to '${path}'`, 403);
    }

    const commands = Array.isArray(body?.commands) ? body.commands : null;
    if (!commands || commands.length === 0) throw httpError("An operation requires at least one command", 400);
    if (commands.length > LIMITS.commandsPerOp) throw httpError(`An operation may carry at most ${LIMITS.commandsPerOp} commands`, 400);
    if (path !== "transaction" && commands.some((command) => command?.op !== path)) {
      throw httpError(`Operation path '${path}' may only carry '${path}' commands`, member.role === "agent" ? 403 : 400, {
        code: "operation-path-mismatch",
      });
    }
    const hasStableId = (value) => typeof value === "string" && Boolean(value.trim());
    const missingGeneratedId = commands.some((command) => {
      if (command?.op === "spawn") {
        return !hasStableId(command.entity?.id)
          || (command.entity?.behaviors ?? []).some((behavior) => !hasStableId(behavior?.id))
          || (command.entity?.interactions ?? []).some((interaction) => !hasStableId(interaction?.id));
      }
      if (command?.op === "update" && Array.isArray(command.patch?.interactions)) {
        return command.patch.interactions.some((interaction) => !hasStableId(interaction?.id));
      }
      return false;
    });
    if (missingGeneratedId) {
      throw httpError("Live-session spawns, behaviors, and interactions require explicit stable ids", 422, {
        code: "live-spawn-id-required",
      });
    }

    const baseRevision = body?.baseRevision;
    if (baseRevision !== undefined && baseRevision !== null
      && (!Number.isInteger(baseRevision) || baseRevision < 0)) {
      throw httpError("baseRevision must be a non-negative integer", 400);
    }
    const requestFingerprint = operationFingerprint({
      baseRevision: baseRevision ?? null,
      path,
      commands,
      intent: body?.intent ?? null,
    });
    const previous = session.applied.get(opId);
    if (previous) {
      if (previous.memberId !== member.id || previous.requestFingerprint !== requestFingerprint) {
        throw httpError("Operation id is already bound to a different member or request", 409, {
          code: "op-id-conflict",
        });
      }
      return { ...previous.receipt, duplicate: true };
    }
    // Exact idempotent reads above are free: retrying an accepted operation must keep
    // returning its receipt even after the member's write bucket is empty.
    if (!member.ops()) throw httpError("Operation rate limit exceeded for this member", 429);

    const record = await store.get(session.sceneName);
    if (!record) throw httpError(`The scene backing this session is gone: ${session.sceneName}`, 410);
    adoptExternalRecord(session, record);

    if (baseRevision !== undefined && baseRevision !== null) {
      if (baseRevision !== record.revision) {
        throw httpError(`Revision conflict: expected ${baseRevision}, current ${record.revision}`, 409, {
          code: "revision-conflict",
          revision: record.revision,
          resync: `/sessions/${session.id}/snapshot`,
        });
      }
    }

    let next;
    try {
      next = applyCommands(record.definition, commands);
    } catch (error) {
      // 422, deliberately not the validator's own 400. The envelope was well-formed and
      // authorised; the *content* was refused — a missing entity, a duplicate id, a
      // session-only entity in a document. A client can act on that distinction: a 400
      // means the request was built wrong and retrying is pointless, a 422 means resync
      // and reconsider. `code` carries it for clients that branch on more than status.
      throw httpError(error?.message ?? "Operation rejected", 422, { code: "operation-rejected" });
    }

    const intent = assertLabel(body?.intent, "intent", describeCommands(commands, next.outputs))?.slice(0, LIMITS.intentChars);
    const written = await store.put(session.sceneName, next.definition, record.revision, {
      actor: member.actorId,
      intent,
    });
    session.revision = written.revision;

    const event = {
      schema: LIVE_OP_SCHEMA,
      event: "op",
      seq: nextSeq(session),
      sessionId: session.id,
      opId,
      actorId: member.actorId,
      actorKind: member.kind,
      actorLabel: member.label,
      memberId: member.id,
      role: member.role,
      path,
      commands,
      outputs: next.outputs,
      intent,
      baseRevision: record.revision,
      revision: written.revision,
      at: new Date(now()).toISOString(),
    };
    // Computed here or never: after this write the pre-state is gone.
    event.inverse = computeInverseCommands(record.definition, commands, next.outputs);
    event.touched = touchedEntityIds(commands, next.outputs);
    event.undone = false;
    session.authoritative = {
      definition: structuredClone(next.definition),
      revision: written.revision,
    };
    push(session, event, { retain: true });
    const receipt = { ok: true, opId, seq: event.seq, revision: written.revision, baseRevision: record.revision, outputs: next.outputs, intent };
    // Mission operation evidence resolves this canonical server event. A client may submit
    // only the opId; actor, intent, revision and touched ids are copied from here, never from
    // a caller-provided completion claim.
    session.applied.set(opId, { memberId: member.id, requestFingerprint, receipt, event });
    return receipt;
  }

  /**
   * Undoes one of the caller's own operations by applying its inverse as a new operation.
   *
   * Refuses, explicitly and with a reason, when it cannot be done safely:
   *
   *   - not your operation — undoing someone else's work is a different act, and it is not
   *     what Ctrl-Z means to the person pressing it
   *   - already undone — idempotent, so a double-click does not double-apply the inverse
   *   - not invertible — see computeInverseCommands; some updates cannot be exactly reversed
   *   - a later operation touched the same entities — this is the case the whole design
   *     exists for. Applying the inverse now would overwrite work done after it, so the
   *     answer is a refusal naming who is in the way, not a silent clobber.
   */
  async function undoOperation(session, member, opId) {
    requireCapability(member, "mutate");
    if (!member.ops()) throw httpError("Operation rate limit exceeded for this member", 429);

    const entry = session.log.find((event) => event.event === "op" && event.opId === opId);
    if (!entry) {
      throw httpError("That operation is no longer in this session's history and cannot be undone", 410, {
        code: "undo-expired",
      });
    }
    if (entry.memberId !== member.id) {
      throw httpError(`That operation belongs to ${entry.actorLabel}, not you`, 403, { code: "undo-not-yours" });
    }
    if (entry.undone) {
      throw httpError("That operation has already been undone", 409, { code: "undo-already-done" });
    }
    if (!entry.inverse) {
      throw httpError("That change cannot be reversed exactly, so it will not be reversed approximately", 422, {
        code: "undo-not-invertible",
      });
    }

    const touched = new Set(entry.touched ?? []);
    const blocker = session.log.find((event) =>
      event.event === "op" && event.seq > entry.seq && !event.undone &&
      (event.touched ?? []).some((id) => touched.has(id)));
    if (blocker) {
      throw httpError(
        `Cannot safely undo: ${blocker.actorLabel} changed the same thing afterwards (revision ${blocker.revision}). `
        + "Undoing would revert their work.",
        409,
        { code: "undo-unsafe", blockedBy: { actorId: blocker.actorId, revision: blocker.revision, opId: blocker.opId } },
      );
    }

    // Source operation ids may already occupy the full 80-character public id budget.
    // Hash into a deterministic bounded id rather than prefixing past the validator cap.
    const undoOpId = `undo-${createHash("sha256")
      .update(`${session.id}\0${opId}`)
      .digest("hex")
      .slice(0, 40)}`;
    const receipt = await submitOperation(session, member, {
      opId: undoOpId,
      path: "transaction",
      commands: entry.inverse,
      intent: `undid: ${entry.intent}`.slice(0, LIMITS.intentChars),
    });
    entry.undone = true;
    return { ...receipt, undoOf: opId };
  }

  function missionReceipt(event) {
    const stage = event.stageId
      ? event.mission.stages.find((entry) => entry.stageId === event.stageId)
      : null;
    return {
      ok: true,
      schema: LIVE_MISSION_EVENT_SCHEMA,
      eventId: event.eventId,
      missionId: event.missionId,
      action: event.action,
      seq: event.seq,
      revision: event.revision,
      state: event.mission.status,
      ...(event.stageId ? { stageId: event.stageId } : {}),
      ...(stage?.latestEvidence ? { evidence: stage.latestEvidence } : {}),
      mission: event.mission,
    };
  }

  function duplicateMissionReceipt(session, member, eventId, requestFingerprint) {
    const previous = session.missionApplied.get(eventId);
    if (!previous) return null;
    if (previous.memberId !== member.id || previous.requestFingerprint !== requestFingerprint) {
      throw httpError("Mission event id is already bound to a different member or request", 409, {
        code: "mission-event-id-conflict",
      });
    }
    return { ...previous.receipt, duplicate: true };
  }

  function requireMissionEventCapacity(session, member) {
    const acceptedByMember = session.missionAcceptedByMember.get(member.id) ?? 0;
    if (member.role !== "owner" && acceptedByMember >= LIMITS.missionEventsPerMember) {
      throw httpError("This member has reached its mission event limit", 429, {
        code: "mission-member-event-limit",
      });
    }
    const nonOwnerCeiling = LIMITS.missionEventsPerSession - LIMITS.missionOwnerEventReserve;
    if (member.role !== "owner" && session.missionApplied.size >= nonOwnerCeiling) {
      throw httpError("The remaining mission event capacity is reserved for owner controls", 429, {
        code: "mission-event-owner-reserve",
      });
    }
    if (session.missionApplied.size >= LIMITS.missionEventsPerSession) {
      throw httpError("This session has reached its mission event limit", 429, {
        code: "mission-event-limit",
      });
    }
  }

  function admitMissionEvent(session, member, eventId, requestFingerprint, receipt) {
    session.missionApplied.set(eventId, { memberId: member.id, requestFingerprint, receipt });
    session.missionAcceptedByMember.set(
      member.id,
      (session.missionAcceptedByMember.get(member.id) ?? 0) + 1,
    );
  }

  function submitMissionStart(session, member, body) {
    const normalized = normalizeMissionStart(body);
    const requestFingerprint = operationFingerprint({ kind: "mission-start", ...normalized });
    const duplicate = duplicateMissionReceipt(session, member, normalized.eventId, requestFingerprint);
    if (duplicate) return duplicate;
    requireCapability(member, "missionManage");
    if (!member.missionHits()) {
      throw httpError("Mission event rate limit exceeded for this member", 429, {
        code: "mission-event-rate-limit",
      });
    }
    requireMissionEventCapacity(session, member);
    if (session.missions.has(normalized.missionId)) {
      throw httpError(`Mission id is already in use: ${normalized.missionId}`, 409, {
        code: "mission-id-conflict",
      });
    }
    if (session.missions.size >= LIMITS.missionsPerSession) {
      throw httpError("This session has reached its mission limit", 429, { code: "mission-limit" });
    }
    const active = [...session.missions.values()].find((mission) =>
      !["completed", "failed", "cancelled"].includes(mission.status));
    if (active) {
      throw httpError(`Mission '${active.missionId}' is already in progress`, 409, {
        code: "mission-active-conflict",
      });
    }
    const seq = session.seq + 1;
    const at = new Date(now()).toISOString();
    const created = createMission({
      normalized,
      member,
      members: session.members,
      sessionId: session.id,
      at,
      seq,
      revision: session.revision,
    });
    nextSeq(session);
    session.missions.set(created.mission.missionId, created.mission);
    const receipt = missionReceipt(created.event);
    admitMissionEvent(session, member, normalized.eventId, requestFingerprint, receipt);
    push(session, created.event, { retain: true });
    return receipt;
  }

  async function submitMissionEvent(session, member, missionId, body) {
    const normalized = normalizeMissionEvent(body);
    const requestFingerprint = operationFingerprint({ kind: "mission-event", missionId, ...normalized });
    const duplicate = duplicateMissionReceipt(session, member, normalized.eventId, requestFingerprint);
    if (duplicate) return duplicate;
    if (normalized.action === "progress") requireCapability(member, "missionProgress");
    else requireCapability(member, "missionManage");
    if (!member.missionHits()) {
      throw httpError("Mission event rate limit exceeded for this member", 429, {
        code: "mission-event-rate-limit",
      });
    }
    requireMissionEventCapacity(session, member);
    const mission = session.missions.get(missionId);
    if (!mission) throw httpError(`Unknown mission: ${missionId}`, 404, { code: "mission-unknown" });
    if (normalized.evidence?.kind === "validation") {
      // Validation is a claim about the scene that exists now, not merely the last scene
      // revision a live-session operation happened to cache. Whole-document writes and the
      // store's ordinary /changes route remain supported alongside live sessions, so they can
      // advance the backing record without touching `session.revision`. Refuse that split cut
      // until the caller takes the queued snapshot; otherwise a validator could complete a
      // mission against a document the live session has never loaded.
      const record = await store.get(session.sceneName);
      if (!record) throw httpError(`The scene backing this session is gone: ${session.sceneName}`, 410);
      if (record.revision !== session.revision) {
        const previousRevision = session.revision;
        adoptExternalRecord(session, record);
        throw httpError(
          `Mission validation requires a resync: session revision ${previousRevision}, current ${record.revision}`,
          409,
          {
            code: "mission-revision-conflict",
            revision: record.revision,
            resync: `/sessions/${session.id}/snapshot`,
          },
        );
      }
    }
    const operationEvent = normalized.evidence?.kind === "operation"
      ? session.applied.get(normalized.evidence.opId)?.event ?? null
      : null;
    const seq = session.seq + 1;
    const at = new Date(now()).toISOString();
    const applied = applyMissionEvent({
      mission,
      normalized,
      member,
      members: session.members,
      operationEvent,
      sessionId: session.id,
      at,
      seq,
      revision: session.revision,
    });
    nextSeq(session);
    session.missions.set(missionId, applied.mission);
    const receipt = missionReceipt(applied.event);
    admitMissionEvent(session, member, normalized.eventId, requestFingerprint, receipt);
    push(session, applied.event, { retain: true });
    return receipt;
  }

  /** Marks this member's unfinished assigned stages interrupted in one retained event. */
  function interruptMemberMissions(session, member, reason) {
    for (const [missionId, mission] of session.missions) {
      const seq = session.seq + 1;
      const interrupted = interruptMissionForMember({
        mission,
        member,
        reason,
        sessionId: session.id,
        at: new Date(now()).toISOString(),
        seq,
        revision: session.revision,
      });
      if (!interrupted) continue;
      nextSeq(session);
      session.missions.set(missionId, interrupted.mission);
      push(session, interrupted.event, { retain: true });
    }
  }

  function submitPresence(session, member, body) {
    requireCapability(member, "present");
    if (!member.presenceHits()) throw httpError("Presence rate limit exceeded for this member", 429);
    const selection = body?.selection ?? [];
    if (!Array.isArray(selection)) throw httpError("presence selection must be an array", 400);
    if (selection.length > LIMITS.selectionIds) throw httpError(`presence selection may hold at most ${LIMITS.selectionIds} ids`, 400);
    const tool = assertLabel(body?.tool, "tool", null);
    const color = body?.color === undefined || body?.color === null ? null : String(body.color).slice(0, 32);
    if (color !== null && !/^#[0-9a-fA-F]{3,8}$/.test(color)) throw httpError("presence color must be a hex colour", 400);

    member.presence = {
      cursor: assertVector(body?.cursor, "presence cursor"),
      selection: selection.map((id) => assertId(id, "presence selection id")),
      tool,
      color,
      expiresAt: now() + LIMITS.presenceTtlMs,
    };
    // Presence never touches session.revision, never reaches the store, and never enters
    // the retained log. It is a view of who is looking at what, not a change to the scene.
    push(session, presenceEvent(session));
    return { ok: true, seq: session.seq };
  }

  // --- HTTP -----------------------------------------------------------------------------

  /** Returns true when it handled the request. */
  async function handle(request, response, url, path, cors) {
    if (!path.startsWith("/sessions")) return false;

    if (!enabled) {
      // The single most important line in this file. Without a store token the store is in
      // its open LAN mode; a session layer that inherited that would let anyone mint an
      // owner credential. Sessions are off, loudly, rather than quietly insecure.
      sendJson(response, 503, {
        error: "Live sessions are disabled: the scene store is running without GRAPHYSX_STORE_TOKEN",
        code: "sessions-disabled",
      }, cors);
      return true;
    }

    requireAllowedOrigin(request);
    sweep();

    const method = request.method;
    const rootMatch = path === "/sessions";
    const idMatch = /^\/sessions\/([^/]+)$/.exec(path);
    const inviteRoot = /^\/sessions\/([^/]+)\/invites$/.exec(path);
    const inviteOne = /^\/sessions\/([^/]+)\/invites\/([^/]+)$/.exec(path);
    const joinMatch = /^\/sessions\/([^/]+)\/join$/.exec(path);
    const snapshotMatch = /^\/sessions\/([^/]+)\/snapshot$/.exec(path);
    const missionRoot = /^\/sessions\/([^/]+)\/missions$/.exec(path);
    const missionEventMatch = /^\/sessions\/([^/]+)\/missions\/([^/]+)\/events$/.exec(path);
    const opsMatch = /^\/sessions\/([^/]+)\/ops$/.exec(path);
    const presenceMatch = /^\/sessions\/([^/]+)\/presence$/.exec(path);
    const ticketMatch = /^\/sessions\/([^/]+)\/stream-ticket$/.exec(path);
    const streamMatch = /^\/sessions\/([^/]+)\/stream$/.exec(path);
    const memberMatch = /^\/sessions\/([^/]+)\/members\/([^/]+)$/.exec(path);

    // POST /sessions — owner authority is the store token; the session's own credentials
    // do not exist yet, so there is nothing else it could be.
    if (rootMatch && method === "POST") {
      requireOwnerToken(request);
      const body = await readJsonBody(request, LIMITS.joinBodyBytes);
      const created = await createSession(body);
      sendJson(response, 201, {
        session: sessionView(created.session),
        member: memberView(created.session, created.member),
        // Shown once. The server keeps only a digest and cannot re-issue it.
        credential: created.credential,
        stream: `/sessions/${created.session.id}/stream`,
      }, cors);
      return true;
    }

    if (idMatch && method === "GET") {
      const session = requireSession(idMatch[1]);
      const member = requireMember(session, request);
      requireCapability(member, "read");
      sendJson(response, 200, { session: sessionView(session), you: memberView(session, member) }, cors);
      return true;
    }

    if (idMatch && method === "DELETE") {
      const session = requireSession(idMatch[1]);
      const member = requireMember(session, request);
      requireCapability(member, "manage");
      // Closing participates in the same document/sequence chain as operations and
      // snapshots. The terminal frame carries that exact final cut so a browser can replace
      // any optimistic write whose request loses this race before dropping its authority.
      session.closing = true;
      sessions.delete(session.id);
      await retireSession(session, "closed");
      sendJson(response, 200, { ok: true, sessionId: session.id, closed: true }, cors);
      return true;
    }

    if (inviteRoot && method === "POST") {
      const session = requireSession(inviteRoot[1]);
      const member = requireMember(session, request);
      requireCapability(member, "invite");
      const body = await readJsonBody(request, LIMITS.joinBodyBytes);
      if (session.closing || session.closed || sessions.get(session.id) !== session || member.revokedAt) {
        throw httpError("This live session is closed", 410, { code: "session-closed" });
      }
      const { invite, code } = createInvite(session, body);
      sendJson(response, 201, {
        invite: inviteView(invite),
        // The code is the whole secret and is returned exactly once. It belongs in a share
        // sheet, not in a URL the browser will keep in history — see the client's exchange.
        code,
        joinPath: `/sessions/${session.id}/join`,
      }, cors);
      return true;
    }

    if (inviteRoot && method === "GET") {
      const session = requireSession(inviteRoot[1]);
      const member = requireMember(session, request);
      requireCapability(member, "invite");
      sendJson(response, 200, { invites: [...session.invites.values()].map(inviteView) }, cors);
      return true;
    }

    if (inviteOne && method === "DELETE") {
      const session = requireSession(inviteOne[1]);
      const member = requireMember(session, request);
      requireCapability(member, "invite");
      const invite = session.invites.get(inviteOne[2]);
      if (!invite) throw httpError("Unknown invitation", 404);
      invite.revokedAt = now();
      session.invites.delete(invite.id);
      sendJson(response, 200, { ok: true, inviteId: invite.id, revoked: true }, cors);
      return true;
    }

    if (memberMatch && method === "DELETE") {
      const session = requireSession(memberMatch[1]);
      const member = requireMember(session, request);
      requireCapability(member, "manage");
      const target = session.members.get(memberMatch[2]);
      if (!target) throw httpError("Unknown member", 404);
      if (target.role === "owner") throw httpError("The session owner cannot be removed", 400);
      if (target.revokedAt) throw httpError("Unknown member", 404);
      // Authentication after this line fails immediately. Tasks already appended to the
      // session chain retain their admission and finish before the removal's final cut.
      target.revokedAt = now();
      await queueSessionTask(session, async () => {
        if (session.members.get(target.id) !== target) {
          throw httpError("Unknown member", 404);
        }
        let record = null;
        let readFailure = null;
        try {
          record = await store.get(session.sceneName);
          if (!record) readFailure = httpError(`The scene backing this session is gone: ${session.sceneName}`, 410);
          else {
            adoptExternalRecord(session, record);
          }
        } catch (error) {
          readFailure = error;
        }
        // Revocation is also an authoritative mission lifecycle event. It shares the same
        // chain and sequence as the member removal, so no later progress can overtake it.
        interruptMemberMissions(session, target, "revoked");
        session.members.delete(target.id);
        for (const [ticketId, ticket] of session.tickets) {
          if (ticket.memberId === target.id) session.tickets.delete(ticketId);
        }
        push(session, {
          schema: LIVE_SESSION_SCHEMA,
          event: "member",
          seq: nextSeq(session),
          sessionId: session.id,
          change: "removed",
          member: memberView(session, target),
          at: new Date(now()).toISOString(),
        }, { retain: true });
        const terminal = {
          schema: LIVE_SESSION_SCHEMA,
          event: "revoked",
          sessionId: session.id,
          memberId: target.id,
          reason: "revoked",
          seq: session.seq,
          revision: record?.revision ?? session.authoritative.revision,
          definition: record?.definition ?? session.authoritative.definition,
          missions: missionViews(session),
        };
        for (const subscriber of [...session.subscribers.values()]) {
          if (subscriber.memberId === target.id) endSubscriber(session, subscriber, "revoked", terminal);
        }
        if (readFailure) throw readFailure;
      });
      sendJson(response, 200, { ok: true, memberId: target.id, removed: true }, cors);
      return true;
    }

    // POST /sessions/:id/join — the only unauthenticated session route, and the only one
    // that accepts an invitation code. It exchanges that code for a scoped credential.
    if (joinMatch && method === "POST") {
      const session = requireSession(joinMatch[1]);
      const body = await readJsonBody(request, LIMITS.joinBodyBytes);
      if (session.closing || session.closed || sessions.get(session.id) !== session) {
        throw httpError("This live session is closed", 410, { code: "session-closed" });
      }
      const joined = redeemInvite(session, body);
      const record = await store.get(session.sceneName);
      sendJson(response, 201, {
        session: sessionView(session),
        member: memberView(session, joined.member),
        credential: joined.credential,
        revision: record?.revision ?? session.revision,
        stream: `/sessions/${session.id}/stream`,
      }, cors);
      return true;
    }

    if (snapshotMatch && method === "GET") {
      const session = requireSession(snapshotMatch[1]);
      const member = requireMember(session, request);
      requireCapability(member, "read");
      // Construct the entire payload while holding the same chain as operation apply. Do
      // not read here and inspect `session.seq` later: those two values are one recovery
      // checkpoint and must never describe different instants.
      const snapshot = await queueSessionTask(session, async () => {
        const record = await store.get(session.sceneName);
        if (!record) throw httpError(`The scene backing this session is gone: ${session.sceneName}`, 410);
        adoptExternalRecord(session, record);
        return {
          session: sessionView(session),
          revision: record.revision,
          seq: session.seq,
          definition: record.definition,
          missions: missionViews(session),
        };
      });
      sendJson(response, 200, snapshot, cors);
      return true;
    }

    if (missionRoot && method === "GET") {
      const session = requireSession(missionRoot[1]);
      const member = requireMember(session, request);
      requireCapability(member, "read");
      const cut = await queueSessionTask(session, () => ({
        schema: LIVE_MISSION_SCHEMA,
        sessionId: session.id,
        seq: session.seq,
        revision: session.revision,
        missions: missionViews(session),
      }));
      sendJson(response, 200, cut, cors);
      return true;
    }

    if (missionRoot && method === "POST") {
      const session = requireSession(missionRoot[1]);
      const member = requireMember(session, request);
      // Reserve admission before the bounded body read, exactly like scene operations.
      const bodyPromise = readJsonBody(request, LIMITS.missionBodyBytes);
      const receipt = await queueSessionTask(session, async () =>
        submitMissionStart(session, member, await bodyPromise));
      sendJson(response, receipt.duplicate ? 200 : 201, receipt, cors);
      return true;
    }

    if (missionEventMatch && method === "POST") {
      const session = requireSession(missionEventMatch[1]);
      const member = requireMember(session, request);
      const missionId = decodeURIComponent(missionEventMatch[2]);
      assertId(missionId, "mission id");
      const bodyPromise = readJsonBody(request, LIMITS.missionBodyBytes);
      const receipt = await queueSessionTask(session, async () =>
        submitMissionEvent(session, member, missionId, await bodyPromise));
      sendJson(response, receipt.duplicate ? 200 : 201, receipt, cors);
      return true;
    }

    if (opsMatch && method === "POST") {
      const session = requireSession(opsMatch[1]);
      const member = requireMember(session, request);
      // Reserve this operation's place synchronously. That makes "already admitted" exact:
      // a close/removal arriving while the bounded body is still being read queues behind it,
      // while every later request fails admission before it can append work.
      const bodyPromise = readJsonBody(request, LIMITS.opBodyBytes);
      const receipt = await queueSessionTask(session, async () =>
        submitOperation(session, member, await bodyPromise));
      sendJson(response, receipt.duplicate ? 200 : 201, receipt, cors);
      return true;
    }

    const undoMatch = /^\/sessions\/([^/]+)\/ops\/([^/]+)\/undo$/.exec(path);
    if (undoMatch && method === "POST") {
      const session = requireSession(undoMatch[1]);
      const member = requireMember(session, request);
      // Queued on the same chain as ordinary operations: an undo is an operation, and it
      // must not interleave with one being applied concurrently.
      const receipt = await queueSessionTask(session, () => undoOperation(session, member, decodeURIComponent(undoMatch[2])));
      sendJson(response, 201, receipt, cors);
      return true;
    }

    if (presenceMatch && method === "POST") {
      const session = requireSession(presenceMatch[1]);
      const member = requireMember(session, request);
      const body = await readJsonBody(request, LIMITS.presenceBodyBytes);
      if (session.closing || session.closed || sessions.get(session.id) !== session
        || session.members.get(member.id) !== member || member.revokedAt) {
        throw httpError("This session membership has been revoked", 403, { code: "membership-revoked" });
      }
      sendJson(response, 200, submitPresence(session, member, body), cors);
      return true;
    }

    // EventSource cannot set headers, so the stream needs its credential in the URL. A
    // long-lived member credential in a query string ends up in history, referrers and
    // access logs; a single-use 30-second ticket does not. This is the reason this route
    // exists at all.
    if (ticketMatch && method === "POST") {
      const session = requireSession(ticketMatch[1]);
      const member = requireMember(session, request);
      requireCapability(member, "read");
      if (!member.ticketHits()) {
        throw httpError("Stream ticket rate limit exceeded for this member", 429, { code: "stream-ticket-rate-limit" });
      }
      if (session.tickets.size >= LIMITS.ticketsPerSession) {
        throw httpError("Too many outstanding stream tickets for this session", 429, { code: "stream-ticket-limit" });
      }
      const secret = newSecret();
      const ticket = { id: newId("t"), memberId: member.id, secretDigest: digest(secret), expiresAt: now() + LIMITS.streamTicketMs };
      session.tickets.set(ticket.id, ticket);
      sendJson(response, 201, {
        ticket: `${ticket.id}.${secret}`,
        expiresAt: new Date(ticket.expiresAt).toISOString(),
        stream: `/sessions/${session.id}/stream`,
      }, cors);
      return true;
    }

    if (streamMatch && method === "GET") {
      const session = requireSession(streamMatch[1]);
      const parts = splitCredential(url.searchParams.get("ticket"));
      if (!parts) throw httpError("A stream ticket is required", 401);
      const ticket = session.tickets.get(parts.id);
      if (!ticket) {
        secretMatches(parts.secret, session.decoyDigest);
        throw httpError("A stream ticket is required", 401);
      }
      // One shot: consumed whether or not the secret matches, so a guessed id cannot be
      // retried against the same record.
      session.tickets.delete(ticket.id);
      if (!secretMatches(parts.secret, ticket.secretDigest) || ticket.expiresAt <= now()) {
        throw httpError("A stream ticket is required", 401);
      }
      const member = session.members.get(ticket.memberId);
      if (!member || member.revokedAt) throw httpError("A valid session credential is required", 401);
      if (session.subscribers.size >= LIMITS.subscribersPerSession) throw httpError("Too many open streams for this session", 429);

      const sinceParam = Number(request.headers["last-event-id"] ?? url.searchParams.get("since") ?? 0);
      const missed = catchUp(session, sinceParam);

      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        ...cors,
      });
      response.write(`event: hello\ndata: ${JSON.stringify({
        schema: LIVE_SESSION_SCHEMA,
        sessionId: session.id,
        memberId: member.id,
        role: member.role,
        seq: session.seq,
        revision: session.revision,
        resumed: sinceParam > 0 && missed !== null,
        // The honest signal: history this client needed is gone, so it must take a fresh
        // snapshot rather than be told a partial story.
        mustResync: missed === null,
      })}\n\n`);
      for (const event of missed ?? []) {
        response.write(`id: ${event.seq}\nevent: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`);
      }

      member.streams += 1;
      const subscriber = { response, memberId: member.id, cleanup: null };
      session.subscribers.set(response, subscriber);
      // A fresh presence snapshot on every connect: presence is not replayed from the log,
      // so this is how a resuming client learns who is here now.
      push(session, presenceEvent(session));

      const heartbeat = setInterval(() => {
        try {
          response.write(": ping\n\n");
        } catch {
          // Cleanup runs from the close handler.
        }
      }, 20_000);
      // Unref'd: an open stream must never be the reason this process refuses to exit. A
      // verify run was once found alive for 9.5 hours behind exactly this shape of handle.
      heartbeat.unref?.();

      let cleaned = false;
      const cleanup = ({ broadcast = true } = {}) => {
        if (cleaned) return;
        cleaned = true;
        clearInterval(heartbeat);
        if (!session.subscribers.delete(response)) return;
        member.streams = Math.max(0, member.streams - 1);
        member.lastSeenAt = now();
        if (broadcast && sessions.has(session.id) && !session.closed) {
          push(session, presenceEvent(session));
          if (member.streams === 0 && !member.revokedAt) {
            // Re-check inside the chain: a fast reconnect that arrives before this task runs
            // keeps its assignment, while a genuine disconnect becomes a retained mission
            // interruption rather than a client-local guess.
            void queueSessionTask(session, () => {
              if (sessions.get(session.id) !== session || session.members.get(member.id) !== member
                || member.revokedAt || member.streams !== 0) return;
              interruptMemberMissions(session, member, "disconnected");
            }).catch(() => undefined);
          }
        }
      };
      subscriber.cleanup = cleanup;
      request.on("close", cleanup);
      response.on("close", cleanup);
      return true;
    }

    throw httpError(`Unsupported live session route: ${method} ${path}`, 404);
  }

  return {
    schema: LIVE_SESSION_SCHEMA,
    missionSchema: LIVE_MISSION_SCHEMA,
    missionEventSchema: LIVE_MISSION_EVENT_SCHEMA,
    enabled,
    limits: LIMITS,
    roles: ROLES,
    opPaths: [...OP_PATHS],
    missionCapabilities: [...MISSION_CAPABILITIES],
    handle,
    /** Notify matching sessions immediately after an authenticated non-session store write. */
    publishExternalCut: async (sceneName, record) => {
      const matching = [...sessions.values()].filter((session) =>
        session.sceneName === sceneName && !session.closing && !session.closed);
      const adopted = await Promise.all(matching.map(async (session) => {
        try {
          return await queueSessionTask(session, () => Boolean(adoptExternalRecord(session, record)));
        } catch {
          // The write is durable. Closing sessions have a full terminal cut; open
          // sessions retain mismatch detection on op, validation, and snapshot.
          return false;
        }
      }));
      return adopted.filter(Boolean).length;
    },
    /** Test and diagnostic surface. Never returns a secret. */
    count: () => sessions.size,
    view: (sessionId) => {
      const session = sessions.get(sessionId);
      return session ? sessionView(session) : null;
    },
    closeAll: async () => {
      const retiring = [...sessions.values()];
      // Block admission for every session before awaiting any one chain.
      for (const session of retiring) session.closing = true;
      sessions.clear();
      await Promise.all(retiring.map((session) =>
        retireSession(session, "shutdown").catch(() => closeSession(session, "shutdown"))));
    },
  };
}

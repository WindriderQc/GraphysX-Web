# Live Sessions

Authenticated, scene-scoped collaboration: two humans and an agent in one live GraphysX
scene, sharing one revision line.

- Server: `server/live-sessions.mjs`, mounted at `/sessions/*` by `server/scene-store.mjs`
- Browser client: `src/live-session-client.ts`
- Editor UI: `src/live-session-panel.ts`
- Proofs: `scripts/smoke-live-sessions.mjs` (protocol),
  `scripts/smoke-live-sessions-security.mjs` (hostile input),
  `scripts/smoke-live-sessions-browser.mjs` (product)

## What a session is

| Concept | Lifetime | Where it lives |
|---|---|---|
| Session | Created by an owner, expires (default 6h, max 24h) | Server memory |
| Member | Joined via an invitation, revocable | Server memory |
| Invitation | Short-lived (default 15m, max 24h), revocable, use-capped | Server memory |
| Operation | Permanent — it *is* a scene write | Scene store, on disk |
| Mission | Session-scoped coordination; never a scene write | Server memory |
| Presence | ~45s TTL, never persisted | Server memory |
| Stream ticket | 30s, single use | Server memory |

Sessions are deliberately not durable. A session is a conversation about a scene; the scene
is the artifact. Restarting the store ends every session and loses nothing that was
authored — every accepted operation is already a stored scene revision.

## Transport: HTTP + SSE, not WebSockets

Kept from the store's existing relay, and the reasoning still holds:

- The traffic is **deltas down, operations up**. Operations go over ordinary `POST`, which
  gives request/response semantics, status codes and idempotency for free. Only the fan-out
  needs a persistent connection, and that is the half SSE already provides.
- No nginx `Upgrade`/`Connection` block, no proxy timeout tuning, no second protocol to
  secure. The production deploy fronts this with the same static nginx config it has today.
- `Last-Event-ID` is already a resume-from-a-sequence-number, which is the exact shape the
  runtime's own event stream (`api.events(since)`) uses.

The cost, stated honestly: one extra HTTP round trip per operation compared to a socket, and
a per-client connection that holds a response open. At the scale this is bounded to (32
streams per session, 16 members) that is not a problem. If sub-50ms cursor streaming for
dozens of simultaneous participants ever becomes a requirement, WebSockets become the right
answer and this document is the reason to revisit. The older public scene relay is bounded
separately at 32 streams per scene and 256 per process; excess readers receive a finite `429`
before the server owns an SSE response, socket, or heartbeat.

**EventSource cannot set headers.** That is why `POST /sessions/:id/stream-ticket` exists: a
member credential is exchanged for a single-use 30-second ticket, and only the ticket goes
in the stream URL. A long-lived credential in a query string survives in history, referrer
headers, screen shares and access logs.

## The operation envelope

```
POST /sessions/:id/ops        x-graphysx-session: <memberId>.<secret>
{
  "opId": "op-...",            // idempotency key, client-generated
  "baseRevision": 7,           // optional; omitted means "apply after whatever is current"
  "path": "transaction",       // allowlisted: transaction | spawn | update | remove | set-environment
  "commands": [ ... ],         // AgentWorldCommand subset, validated by scene-commands.mjs
  "intent": "added a crate"
}
→ 201 { ok, opId, seq, revision, baseRevision, outputs, intent }
→ 200 { ..., duplicate: true }             // same member + same request; original receipt
→ 409 { error, code: "op-id-conflict" }    // opId belongs to another member/request
→ 409 { error, code: "revision-conflict", revision, resync: "/sessions/:id/snapshot" }
→ 422 { error, code: "operation-rejected" }  // well-formed, authorised, semantically refused
```

Broadcast to every other member as `event: op` with the same fields plus `actorId`,
`actorKind`, `actorLabel`, `memberId` and `role`.

`path` is an **allowlist, not a namespace walk**. A remote actor naming an arbitrary dotted
path is how "call any function on the API" bugs happen.

## AgentX mission coordination

Missions are typed, bounded session state. They coordinate AgentX actors around a scene but
never enter the portable scene document or increment its revision. They use the same session
authority, serial chain, monotonic `seq`, retained SSE log, snapshot, replay, and resync path
as operations; there is no second ordering system. Every `event: mission` carries a bounded
full replacement of that mission.

The server currently owns one fixed template, `agentx-center-artifact-v1`
(**Signal Forge Calibration**):

| Stage | Station | Required agent capability | Completion evidence |
|---|---|---|---|
| `analyze` | Explore | `mission:explore` | `observation` |
| `build` | Build | `mission:build` | accepted `operation` receipt |
| `validate` | Play | `mission:validate` | current-revision passed `validation` |

The routes are:

~~~text
GET  /sessions/:id/missions
POST /sessions/:id/missions
     { eventId, missionId, templateId, assignments: [{ stageId, memberId }] }
POST /sessions/:id/missions/:missionId/events
     owner: { eventId, action: activate | pause | resume | cancel }
     owner: { eventId, action: assign, stageId, memberId }
     agent: { eventId, action: progress, stageId, state, progress?, evidence? }
~~~

Activation is a server gate, not a UI convention: every stage must resolve to a currently
online, capability-eligible AgentX member, and the assignments must span at least two distinct
AgentX `actorId` values. Resume re-resolves every unfinished assignment, so a retained
`memberId` cannot revive a disconnected or revoked authority. Reassigning a running mission
also requires an online eligible agent. Client event ids beginning with `me-system-` are
reserved for disconnect/revocation lifecycle events.

Stages advance in template order. In an active or blocked mission, a disconnect or revocation
marks every unfinished stage assigned to that member `interrupted`. Losing the current
assignee blocks immediately; a future interruption is retained while the current stage
continues, then blocks safely at the
stage handoff unless the assignee has returned. Cancelling changes every unfinished stage to
`cancelled`, making the snapshot terminal and self-consistent.

Evidence is authoritative and bounded (8 records per stage, 240-character summaries). An
`operation` claim supplies only an `opId`; the server copies attribution, revision, intent,
path, touched ids, and bounded command outputs from its retained accepted operation event. The
operation must belong to the assigned member, remain not-undone, and have been accepted after
the Build stage became available or was reassigned. Validation must inspect the current scene
revision and report `passed` before it can complete its stage.

Per session, mission state is capped at 4 missions and 192 accepted client mission events;
each member may contribute at most 64, and the final 16 global slots are reserved for owner
direction so non-owner saturation cannot strand a mission. Exact member/body-bound retries are
answered from their original receipt before any cap and consume no second slot. Mission request
bodies are capped at 16 KiB and mission events use a separate per-member token bucket. These
bounds apply before broadcast and snapshot serialization.

The runtime reserves the prefixes `live-agent:`, `live-mission:`, and `live-nestor:`
for host-owned transient projections. The shared authored-namespace policy rejects those
prefixes in entity ids and every entity reference (parent, steering, look-at, spline,
interaction, joint, and rule subjects) on local commits, live operations, and whole-document
writes. Checks use the runtime's trimmed id value, and prefab roots are also checked as the
generated `${idPrefix.trim()}:child` namespace, so whitespace or generated descendants cannot
claim a host prefix indirectly. A refusal leaves revision, history, and the authoritative
document byte-identical.

## Conflicts, duplicates, ordering

Optimistic concurrency with explicit revisions. Not a CRDT — a CRDT would be a large amount
of machinery to avoid a conflict dialog that, at this scale, is both rare and more honest
than an automatic merge nobody asked for. Revisit if evidence shows otherwise.

1. **Idempotency is bound, not global.** A repeated `opId` returns the original receipt only
   for the same member and the same canonical request. Reuse by another member, or with a
   different revision/path/command/intent envelope, is a structured `op-id-conflict` 409.
   Honest network retries are safe; caller-controlled ids cannot impersonate another result.
2. **Serialised per session.** Operations queue on a per-session chain. Two members
   submitting in the same tick both succeed, in arrival order. Without this they would both
   read revision R and the loser would get a 409 it did nothing to deserve.
3. **`baseRevision` means what it says.** A client that supplies one and is stale gets a
   structured 409 naming the current revision and the resync path — never a silent overwrite
   of another actor's work.
4. **Rejection is inert.** A refused operation never touches the document. Proven by
   asserting the document is byte-identical after each rejection class.

## Reconnect and resync

The client reconnects with capped backoff (0.5s → 15s) and resumes from its last `seq`. The
server retains at most 512 ordered durable events and 4 MiB, whichever binds first. Operations,
missions, membership, and external-document resync barriers share that one replay line:

| Case | Answer |
|---|---|
| `since` inside the retained window | replay the missed events, `resumed: true` |
| `since` older than the ring | `mustResync: true` — client takes a snapshot |
| `since` **ahead** of the server | `mustResync: true` |

That last row is not a formality. A client claiming a sequence the server never issued is
desynchronised — against a different session, or a restarted server. Answering "you are up
to date" would leave it silently wrong forever. This was a real defect, caught by
`smoke-live-sessions.mjs`.

Snapshots are queued on the same per-session chain as operations. Their definition, revision,
sequence, session view, and credential-scoped `you` member therefore describe one atomic cut.
Attach consumes that single response rather than fetching a transient session view and then a
second snapshot. During an already-connected resync the client
invalidates its current stream, loads that cut, and reconnects from the snapshot sequence;
operations on either side are represented in the snapshot or replayed after it, never skipped
because an event was applied just before the whole document was replaced.

An authenticated scene write outside the session operation route is adopted on that same serial
chain. The server retains a document-resync barrier (without duplicating the document in every
frame), updates its authoritative cut, and refuses stale validation until clients load the queued
snapshot and reconnect from its sequence. The browser invalidates old stream callbacks before
loading but retains that transport through the snapshot request; only the newest authority closes
the retired stream, exactly once, before reconnecting. It does not report `live` until the terminal
presence cut proves replay continuity; a revision mismatch falls back to another snapshot instead
of allowing an operation against an unembodied document.

Replay/undo bodies and idempotency receipts have separate bounded horizons. The heavy event ring
may evict an operation at 512 events or 4 MiB, expiring replay, mission evidence, and undo that
need its canonical event. A separate 512-entry lightweight receipt map still returns the original
receipt for an exact retry and keeps the op id bound against another member or request body.

Presence is **not** replayed. It is a full snapshot every time, so a resuming client gets one
fresh presence event on connect rather than a queue of stale cursors. A presence gap is
therefore never a resync trigger.

## Roles

| | read | mutate | presence | invite | manage |
|---|---|---|---|---|---|
| owner | ✓ | ✓ | ✓ | ✓ | ✓ |
| editor | ✓ | ✓ | ✓ | | |
| viewer | ✓ | | ✓ | | |
| agent | ✓ | scoped | ✓ | | |

Enforced server-side in `ROLES`. The UI hides what a role cannot do; this table is what
stops it. The owner alone can start and direct missions; agents alone can report assigned
mission progress. An **agent** additionally carries an explicit capability list naming the
operation paths and mission stages it may use — an agent invitation without one is refused at
creation, and an agent with an empty list can read and be present but cannot mutate or advance
a mission.

Only an owner may invite, remove members or close a session, and **an invitation cannot grant
ownership**.

## Collaborative undo

The runtime's undo stack is global and snapshot-based: `undo()` pops whatever transaction was
last applied, by anyone. In a live session that would silently revert a colleague's work.

So a live undo is not a rewind. `POST /sessions/:id/ops/:opId/undo` computes the **inverse**
of that operation and applies it as a **new** operation, attributed to the same actor. Shared
history only ever moves forward, and every other client applies the inverse through the
ordinary path like any other change.

The inverse is computed at apply time, from the document as it was *before* the operation, and
stored on the log entry — recomputing it later is impossible because the pre-state is gone.

| Command | Inverse |
|---|---|
| `spawn` | `remove` the spawned id |
| `remove` | `spawn` every entity it deleted (descendants included), in original document order so a parent precedes its child |
| `update` | `update` with the pre-values of exactly the keys the patch touched |
| `set-environment` | `set-environment` with the previous environment |

Refusals, each with a `code`:

| Case | Code | Status |
|---|---|---|
| Not your operation | `undo-not-yours` | 403 |
| Already undone | `undo-already-done` | 409 |
| **A later operation touched the same entities** | `undo-unsafe` | 409 |
| Cannot be inverted exactly | `undo-not-invertible` | 422 |
| Older than the retained log | `undo-expired` | 410 |

`undo-unsafe` is the case the design exists for. It carries `blockedBy` naming the actor,
revision and operation in the way, so the UI can say *who* rather than "something went wrong".

`undo-not-invertible` is a real answer, not a failure to try: an `update` that introduces a
field absent before it cannot be reversed through the merge semantics `applyCommands` uses —
no command removes a key — and approximating would leave the document subtly different while
reporting success.

Outside a live session, `LiveSessionClient.undo()` is the runtime's ordinary local undo,
untouched.

## Threat model

Trusted: the operator who sets `GRAPHYSX_STORE_TOKEN`, and the machine the store runs on.
Everything else — every member, every payload, every origin — is untrusted input.

### Fail closed

Live sessions **refuse to run** when the store has no `GRAPHYSX_STORE_TOKEN`. The store's
tokenless mode is a deliberate LAN convenience for authoring; inheriting it here would let
anyone who can reach the port mint an owner credential. Session routes answer `503` with
`code: "sessions-disabled"`, and `/health` reports `sessions.enabled: false`.

### Credentials

- 32 bytes from `randomBytes`, base64url. Format `<id>.<secret>` so verification is one
  constant-time compare against one digest, not a scan over every member.
- Only the **sha256 digest** is stored. The server cannot re-issue a credential it has given
  out, and a memory dump does not yield working keys.
- `timingSafeEqual` on digests, never string comparison.
- Every authentication failure returns **one identical message**. Distinguishing "no such
  member" from "wrong secret" is a membership oracle. A missing member is compared against a
  decoy digest so the two cost the same.

### Boundaries enforced

| Threat | Control | Proven by |
|---|---|---|
| Unauthenticated mutation | member credential required on every route | security smoke |
| Store token used as a session key | session routes ignore it entirely | security smoke |
| Credential reuse across sessions | credentials resolve only within their session | security smoke |
| Stolen/leaked invite link | expiry + revocation + use cap + single exchange | security smoke |
| Long-lived secret in a URL | one-shot 30s stream ticket | security smoke |
| Hostile origin | `403`, not merely a withheld CORS header | security smoke |
| Oversized payload | 256KB ops, 16KB missions, 8KB presence, 64 commands, 32 selection ids | security smoke |
| Request flooding | separate per-member token buckets on ops, missions, tickets, and presence | security smoke |
| Path traversal / arbitrary tool call | operation `path` allowlist; id regex on every name | both smokes |
| Non-finite coordinates | finite check on every presence vector | protocol smoke |
| Credential leaking into logs/UI/disk | audited across console, bodies, activity, scene files | security smoke |
| Unbounded memory | count + byte caps on sessions, receipts, replay logs, scene relay names/bytes, missions, tickets, and subscribers | unit + security smokes |
| Stalled SSE reader | projected-buffer check and hard response/socket destruction before the next frame can cross the retained budget | unit + security smokes |
| Connection leak wedging shutdown | unref'd heartbeats, cleanup on close, `closeAll()` on shutdown | teardown assertions |

### Known limitations — stated, not hidden

1. **Sessions are in-memory.** A store restart ends every session. Authored work survives;
   membership does not. Multiple store processes on one directory do not share sessions.
2. **Rate limits are per member, not per IP.** Someone holding a valid credential is bounded;
   an unauthenticated flood of `/join` attempts is bounded only by the invite check itself.
   A reverse proxy is the right place for IP-level limiting and this does not replace it.
3. **`actorId` is chosen by whoever redeems the invitation.** The credential proves
   membership, not human identity. Attribution is "this member did it", which is exactly as
   strong as the invitation distribution. There is no account system behind it.
4. **The scene store's read routes remain open.** A session scopes *writes* and presence.
   Anyone who can reach the store can still read a stored scene, as before.
5. **No end-to-end encryption.** Transport security is whatever fronts the store — TLS at
   nginx in production, nothing on a bare LAN port.
6. **Undo evidence is bounded.** Once the originating retained event expires, its exact
   inverse and touched-id proof are gone, so the server returns `undo-expired` rather than
   reconstructing an approximation.

## Running it

```bash
GRAPHYSX_STORE_TOKEN=<secret> GRAPHYSX_STORE_ORIGIN=https://your-origin npm run serve:scenes
```

Create a session and an invitation:

```bash
curl -XPOST $STORE/sessions -H "authorization: Bearer $TOKEN" \
  -d '{"sceneName":"my-scene","owner":{"id":"ada","label":"Ada"}}'
# → { session, credential, ... }   the credential is shown once

curl -XPOST $STORE/sessions/$ID/invites -H "x-graphysx-session: $CRED" \
  -d '{"role":"editor","ttlSeconds":900}'
# → { invite, code }
```

Share `https://<app>/?store=<storeUrl>#session=<id>&invite=<code>`. The client exchanges the
code, then removes it from the address bar with `replaceState`.

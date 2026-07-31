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
answer and this document is the reason to revisit.

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
→ 200 { ..., duplicate: true }             // same opId already applied; original receipt
→ 409 { error, code: "revision-conflict", revision, resync: "/sessions/:id/snapshot" }
→ 422 { error, code: "operation-rejected" }  // well-formed, authorised, semantically refused
```

Broadcast to every other member as `event: op` with the same fields plus `actorId`,
`actorKind`, `actorLabel`, `memberId` and `role`.

`path` is an **allowlist, not a namespace walk**. A remote actor naming an arbitrary dotted
path is how "call any function on the API" bugs happen.

## Conflicts, duplicates, ordering

Optimistic concurrency with explicit revisions. Not a CRDT — a CRDT would be a large amount
of machinery to avoid a conflict dialog that, at this scale, is both rare and more honest
than an automatic merge nobody asked for. Revisit if evidence shows otherwise.

1. **Idempotency first.** A repeated `opId` returns the original receipt. Network retries
   are safe; the operation applies exactly once.
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
server retains 512 operation events per session and answers three ways:

| Case | Answer |
|---|---|
| `since` inside the retained window | replay the missed events, `resumed: true` |
| `since` older than the ring | `mustResync: true` — client takes a snapshot |
| `since` **ahead** of the server | `mustResync: true` |

That last row is not a formality. A client claiming a sequence the server never issued is
desynchronised — against a different session, or a restarted server. Answering "you are up
to date" would leave it silently wrong forever. This was a real defect, caught by
`smoke-live-sessions.mjs`.

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
stops it. An **agent** additionally carries an explicit capability list naming the operation
paths it may call — an agent invitation without one is refused at creation, and an agent with
an empty list can read and be present but not mutate.

Only an owner may invite, remove members or close a session, and **an invitation cannot grant
ownership**.

## Collaborative undo

The runtime's undo stack is global and snapshot-based: `undo()` pops whatever transaction was
last applied, by anyone. In a live session that would silently revert a colleague's work.

So `LiveSessionClient.undo()` permits an undo only while the shared revision has not advanced
past this actor's own last operation. Otherwise it refuses with an explicit reason rather than
doing something destructive and plausible-looking. Outside a live session it is untouched
local undo.

This is a boundary, not full actor-aware undo. Genuine per-actor undo needs inverse operations
in the runtime, which the runtime does not have (it snapshots). That is honest remaining work,
not a solved problem.

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
| Oversized payload | 256KB ops, 8KB presence, 64 commands, 32 selection ids | security smoke |
| Request flooding | per-member token buckets on ops and presence | security smoke |
| Path traversal / arbitrary tool call | operation `path` allowlist; id regex on every name | both smokes |
| Non-finite coordinates | finite check on every presence vector | protocol smoke |
| Credential leaking into logs/UI/disk | audited across console, bodies, activity, scene files | security smoke |
| Unbounded memory | caps on sessions, members, invites, log, subscribers | caps table above |
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
6. **Undo is bounded, not actor-aware** (see above).

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

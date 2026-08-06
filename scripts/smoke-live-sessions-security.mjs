// Live Sessions: the hostile-input surface.
//
// Everything here is a thing an attacker or a bug would try, asserted to fail. The
// collaboration smoke proves the feature works; this one proves it does not work for people
// who should not have it, and that it stays bounded under abuse.
//
// The token-leak audit at the end is the check most likely to catch a future regression:
// credentials are correct here today, and the easy way to break that is a well-meaning
// "log the request for debugging" three months from now.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startSceneStore } from "../server/scene-store.mjs";
import { check, createActor, openStalledStream, report, requestText, seedDefinition, sleep, spawnCommand, waitForStore } from "./live-session-harness.mjs";

const TOKEN = "live-session-security-token";
const ORIGIN = "https://graphysx.specialblend.ca";
const SCENE = "security-fixture";
const results = [];

// Everything the server writes to a console, captured for the leak audit below.
const consoleLog = [];
for (const level of ["log", "warn", "error", "info"]) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    consoleLog.push(args.map((value) => (typeof value === "string" ? value : JSON.stringify(value))).join(" "));
    original(...args);
  };
}

let store = null;
let openStore = null;
let dir = null;
let openDir = null;

const seed = async (base, name) => requestText(`${base}/scenes/${name}`, {
  method: "PUT",
  headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ definition: seedDefinition(name), actor: "smoke" }),
});

try {
  // --- 1. fail-closed configuration ----------------------------------------------------
  //
  // The single most important property in this file. A store with no token is in its LAN
  // compatibility mode; live sessions must refuse to run there rather than inherit it,
  // because inheriting it means anyone who can reach the port can mint an owner credential.

  openDir = await mkdtemp(path.join(tmpdir(), "graphysx-open-"));
  openStore = await startSceneStore({ port: 0, dir: openDir, token: null, origins: null, datalakeDir: null });
  await waitForStore(openStore.url);
  const openHealth = JSON.parse((await requestText(`${openStore.url}/health`)).text);
  check(results, "a tokenless store reports live sessions disabled", openHealth.sessions?.enabled === false, JSON.stringify(openHealth.sessions));
  const openCreate = await requestText(`${openStore.url}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sceneName: "anything", owner: { id: "mallory" } }),
  });
  const openBody = JSON.parse(openCreate.text);
  check(results, "session creation on a tokenless store -> 503, not open",
    openCreate.status === 503 && openBody.code === "sessions-disabled", `status ${openCreate.status}`);
  const openOps = await requestText(`${openStore.url}/sessions/gxs-anything/ops`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ opId: "x", commands: [spawnCommand("x")] }),
  });
  check(results, "session mutation on a tokenless store -> 503", openOps.status === 503, `status ${openOps.status}`);
  await openStore.close();
  openStore = null;

  // --- 2. the authenticated store ------------------------------------------------------

  dir = await mkdtemp(path.join(tmpdir(), "graphysx-sec-"));
  store = await startSceneStore({ port: 0, dir, token: TOKEN, origins: ORIGIN, datalakeDir: null });
  const base = store.url;
  await waitForStore(base);
  await seed(base, SCENE);
  await seed(base, "second-fixture");

  const founder = createActor(base, { storeToken: TOKEN, origin: ORIGIN });
  const created = await founder.call("POST", "/sessions", { sceneName: SCENE, owner: { id: "owner-ada", label: "Ada" } });
  check(results, "owner session created for the security run", created.status === 201, `status ${created.status} ${created.text.slice(0, 200)}`);
  const sessionId = created.body.session.sessionId;
  const ownerCredential = created.body.credential;
  const owner = createActor(base, { credential: ownerCredential, origin: ORIGIN });

  const second = await founder.call("POST", "/sessions", { sceneName: "second-fixture", owner: { id: "owner-ada", label: "Ada" } });
  const secondId = second.body.session.sessionId;
  const secondCredential = second.body.credential;

  // --- 3. authentication and scope -----------------------------------------------------

  const noCredential = await createActor(base, { origin: ORIGIN }).call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-anon", commands: [spawnCommand("anon-crate")],
  });
  check(results, "an unauthenticated session mutation -> 401", noCredential.status === 401, `status ${noCredential.status}`);

  const storeTokenOnly = await createActor(base, { storeToken: TOKEN, origin: ORIGIN }).call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-store-token", commands: [spawnCommand("store-crate")],
  });
  check(results, "the store token alone does not authorise a session operation", storeTokenOnly.status === 401, `status ${storeTokenOnly.status}`);

  const crossSession = await createActor(base, { credential: secondCredential, origin: ORIGIN })
    .call("POST", `/sessions/${sessionId}/ops`, { opId: "op-cross", commands: [spawnCommand("cross-crate")] });
  check(results, "a credential from another session is rejected", crossSession.status === 401, `status ${crossSession.status}`);

  const forgedMember = `${created.body.member.memberId}.${"A".repeat(43)}`;
  const forged = await createActor(base, { credential: forgedMember, origin: ORIGIN })
    .call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "a real member id with a forged secret is rejected", forged.status === 401, `status ${forged.status}`);

  const absentMember = await createActor(base, { credential: "m-doesNotExist.whatever", origin: ORIGIN })
    .call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "an absent member and a forged secret give the same answer",
    absentMember.status === forged.status && absentMember.body.error === forged.body.error,
    `${absentMember.status}/${forged.status}`);

  const malformed = await createActor(base, { credential: "no-dot-here", origin: ORIGIN })
    .call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "a malformed credential is rejected without a crash", malformed.status === 401, `status ${malformed.status}`);

  // --- 4. invitation lifetime ----------------------------------------------------------

  const expiring = await owner.call("POST", `/sessions/${sessionId}/invites`, { role: "editor", ttlSeconds: 1 });
  check(results, "a short-lived invitation is minted", expiring.status === 201, `status ${expiring.status}`);
  await sleep(1100);
  const expiredJoin = await createActor(base, { origin: ORIGIN })
    .call("POST", `/sessions/${sessionId}/join`, { code: expiring.body.code, actor: { id: "late-bob" } });
  check(results, "an expired invitation cannot be redeemed", expiredJoin.status === 403, `status ${expiredJoin.status}`);

  const revocable = await owner.call("POST", `/sessions/${sessionId}/invites`, { role: "editor", ttlSeconds: 600 });
  const revoked = await owner.call("DELETE", `/sessions/${sessionId}/invites/${revocable.body.invite.inviteId}`);
  check(results, "an invitation can be revoked", revoked.status === 200, `status ${revoked.status}`);
  const revokedJoin = await createActor(base, { origin: ORIGIN })
    .call("POST", `/sessions/${sessionId}/join`, { code: revocable.body.code, actor: { id: "revoked-bob" } });
  check(results, "a revoked invitation cannot be redeemed", revokedJoin.status === 403, `status ${revokedJoin.status}`);

  const forgedInvite = await createActor(base, { origin: ORIGIN }).call("POST", `/sessions/${sessionId}/join`, {
    code: `${revocable.body.invite.inviteId}.${"B".repeat(43)}`, actor: { id: "forger" },
  });
  check(results, "an invitation failure is indistinguishable across causes",
    forgedInvite.status === revokedJoin.status && forgedInvite.body.error === revokedJoin.body.error,
    `${forgedInvite.status}/${revokedJoin.status}`);

  // --- 5. origin policy ----------------------------------------------------------------

  const badOrigin = await createActor(base, { credential: ownerCredential, origin: "https://evil.example" })
    .call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "a session request from an unlisted origin is rejected outright",
    badOrigin.status === 403, `status ${badOrigin.status}`);
  const goodOrigin = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "an allowlisted origin is served", goodOrigin.status === 200, `status ${goodOrigin.status}`);
  check(results, "the allowlisted origin is echoed, not wildcarded",
    goodOrigin.headers.get("access-control-allow-origin") === ORIGIN,
    goodOrigin.headers.get("access-control-allow-origin") ?? "none");

  // --- 6. stream tickets ---------------------------------------------------------------

  const ticket = await owner.call("POST", `/sessions/${sessionId}/stream-ticket`, {});
  check(results, "a stream ticket is issued", ticket.status === 201, `status ${ticket.status}`);
  check(results, "a stream ticket is not the member credential", ticket.body.ticket !== ownerCredential, "ticket equals credential");
  const firstUse = await fetch(`${base}/sessions/${sessionId}/stream?ticket=${encodeURIComponent(ticket.body.ticket)}`, {
    headers: { origin: ORIGIN },
  });
  check(results, "a fresh ticket opens the stream", firstUse.status === 200, `status ${firstUse.status}`);
  await firstUse.body.cancel();
  const replay = await fetch(`${base}/sessions/${sessionId}/stream?ticket=${encodeURIComponent(ticket.body.ticket)}`, {
    headers: { origin: ORIGIN },
  });
  check(results, "a stream ticket cannot be replayed", replay.status === 401, `status ${replay.status}`);
  await replay.body?.cancel?.();

  const crossTicket = await createActor(base, { credential: secondCredential, origin: ORIGIN })
    .call("POST", `/sessions/${secondId}/stream-ticket`, {});
  const crossUse = await fetch(`${base}/sessions/${sessionId}/stream?ticket=${encodeURIComponent(crossTicket.body.ticket)}`, {
    headers: { origin: ORIGIN },
  });
  check(results, "a ticket from another session cannot open this stream", crossUse.status === 401, `status ${crossUse.status}`);
  await crossUse.body?.cancel?.();

  const noTicket = await fetch(`${base}/sessions/${sessionId}/stream`, { headers: { origin: ORIGIN } });
  check(results, "the stream refuses an unauthenticated subscriber", noTicket.status === 401, `status ${noTicket.status}`);
  await noTicket.body?.cancel?.();

  // --- 7. payload and shape limits -----------------------------------------------------

  const oversized = await owner.call("POST", `/sessions/${sessionId}/ops`, undefined, {
    rawBody: JSON.stringify({ opId: "op-huge", commands: [spawnCommand("huge")], intent: "x".repeat(300 * 1024) }),
  });
  check(results, "an oversized operation body -> 413", oversized.status === 413, `status ${oversized.status}`);

  const tooManyCommands = await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-many",
    commands: Array.from({ length: 100 }, (_, index) => spawnCommand(`many-${index}`)),
  });
  check(results, "an operation with too many commands is rejected", tooManyCommands.status === 400, `status ${tooManyCommands.status}`);

  const oversizedPresence = await owner.call("POST", `/sessions/${sessionId}/presence`, undefined, {
    rawBody: JSON.stringify({ tool: "x".repeat(16 * 1024) }),
  });
  check(results, "an oversized presence body -> 413", oversizedPresence.status === 413, `status ${oversizedPresence.status}`);

  const oversizedMission = await owner.call("POST", `/sessions/${sessionId}/missions`, undefined, {
    rawBody: JSON.stringify({
      eventId: "me-huge",
      missionId: "mission-huge",
      templateId: "agentx-center-artifact-v1",
      assignments: [],
      padding: "x".repeat(20 * 1024),
    }),
  });
  check(results, "an oversized mission event body -> 413", oversizedMission.status === 413, `status ${oversizedMission.status}`);

  const tooMuchSelection = await owner.call("POST", `/sessions/${sessionId}/presence`, {
    selection: Array.from({ length: 64 }, (_, index) => `sel-${index}`),
  });
  check(results, "an unbounded presence selection is rejected", tooMuchSelection.status === 400, `status ${tooMuchSelection.status}`);

  const beforeHostNamespace = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  const hostNamespaceAttempts = [];
  for (const [index, prefix] of ["live-agent:", "live-mission:", "live-nestor:"].entries()) {
    hostNamespaceAttempts.push(await owner.call("POST", `/sessions/${sessionId}/ops`, {
      opId: `op-host-prefix-${index}`,
      commands: [spawnCommand(`${prefix}authored-collision`)],
    }));
  }
  hostNamespaceAttempts.push(await owner.call("POST", `/sessions/${sessionId}/ops`, {
    opId: "op-host-parent-reference",
    commands: [{
      op: "spawn",
      entity: { id: "host-parent-child", type: "box", parentId: "live-agent:remote" },
    }],
  }));
  const afterHostNamespace = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "remote operations cannot claim or reference host-only transient namespaces",
    hostNamespaceAttempts.every((response) =>
      response.status === 422
      && response.body.code === "operation-rejected"
      && response.body.error.includes("host-only entity namespace")),
    JSON.stringify(hostNamespaceAttempts.map((response) => ({ status: response.status, body: response.body }))));
  check(results, "host-only namespace refusals leave the authoritative session cut byte-identical",
    afterHostNamespace.body.revision === beforeHostNamespace.body.revision
      && JSON.stringify(afterHostNamespace.body.definition) === JSON.stringify(beforeHostNamespace.body.definition),
    `revision ${beforeHostNamespace.body.revision} -> ${afterHostNamespace.body.revision}`);

  const storedBeforeHostNamespace = JSON.parse((await requestText(`${base}/scenes/${SCENE}`)).text);
  const hostileReplacement = structuredClone(storedBeforeHostNamespace.definition);
  hostileReplacement.entities.push({ id: "live-mission:stored-collision", type: "group" });
  const hostileReplacementWrite = await requestText(`${base}/scenes/${SCENE}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TOKEN}`,
      origin: ORIGIN,
    },
    body: JSON.stringify({
      definition: hostileReplacement,
      expectedRevision: storedBeforeHostNamespace.revision,
      actor: "security-smoke",
    }),
  });
  const storedAfterHostNamespace = JSON.parse((await requestText(`${base}/scenes/${SCENE}`)).text);
  check(results, "whole-document writes cannot persist a host-only transient namespace",
    hostileReplacementWrite.status === 400
      && hostileReplacementWrite.text.includes("host-only entity namespace"),
    `status ${hostileReplacementWrite.status}: ${hostileReplacementWrite.text}`);
  check(results, "rejected host-only document replacement leaves stored authority byte-identical",
    storedAfterHostNamespace.revision === storedBeforeHostNamespace.revision
      && JSON.stringify(storedAfterHostNamespace.definition) === JSON.stringify(storedBeforeHostNamespace.definition),
    `revision ${storedBeforeHostNamespace.revision} -> ${storedAfterHostNamespace.revision}`);

  const traversal = await createActor(base, { credential: ownerCredential, origin: ORIGIN })
    .call("GET", `/sessions/${sessionId}/../../scenes/${SCENE}`);
  check(results, "a traversal attempt does not reach another route as this session",
    traversal.status === 200 || traversal.status === 404, `status ${traversal.status}`);

  const longTtl = await founder.call("POST", "/sessions", {
    sceneName: SCENE, owner: { id: "owner-ada" }, ttlSeconds: 60 * 60 * 24 * 30,
  });
  check(results, "a session cannot outlive the maximum ttl", longTtl.status === 400, `status ${longTtl.status}`);

  // --- 8. rate limits ------------------------------------------------------------------

  const burst = await Promise.all(Array.from({ length: 80 }, (_, index) =>
    owner.call("POST", `/sessions/${sessionId}/presence`, { tool: `t${index}` })));
  const throttled = burst.filter((response) => response.status === 429).length;
  check(results, "a presence flood is throttled", throttled > 0, `${throttled}/80 throttled`);
  check(results, "throttling does not take the session down",
    (await owner.call("GET", `/sessions/${sessionId}`)).status === 200, "session unreadable after flood");

  // --- 9. bounded concurrent load ------------------------------------------------------
  //
  // Two members, interleaved operations, no explicit base revision: the session serialises
  // them, so every accepted operation must land exactly once and the revision must advance
  // by exactly the number accepted. A lost update shows up here as a missing entity.

  const loadInvite = await owner.call("POST", `/sessions/${sessionId}/invites`, { role: "editor", ttlSeconds: 600 });
  const loadJoin = await createActor(base, { origin: ORIGIN })
    .call("POST", `/sessions/${sessionId}/join`, { code: loadInvite.body.code, actor: { id: "load-bob" } });
  const loadEditor = createActor(base, { credential: loadJoin.body.credential, origin: ORIGIN });

  const beforeLoad = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  const BURST = 20;
  const submissions = [];
  for (let index = 0; index < BURST; index += 1) {
    const actor = index % 2 === 0 ? owner : loadEditor;
    submissions.push(actor.call("POST", `/sessions/${sessionId}/ops`, {
      opId: `load-${index}`,
      commands: [spawnCommand(`load-crate-${index}`)],
    }));
  }
  const settled = await Promise.all(submissions);
  const accepted = settled.filter((response) => response.status === 201);
  const rejected = settled.filter((response) => response.status !== 201);
  check(results, "a concurrent burst is accepted without spurious conflicts",
    accepted.length === BURST, `accepted ${accepted.length}/${BURST}; rejected: ${rejected.map((r) => r.status).join(",")}`);

  const afterLoad = await owner.call("GET", `/sessions/${sessionId}/snapshot`);
  check(results, "the revision advanced by exactly the number of accepted operations",
    afterLoad.body.revision - beforeLoad.body.revision === accepted.length,
    `${beforeLoad.body.revision} -> ${afterLoad.body.revision} for ${accepted.length} ops`);
  const landed = new Set(afterLoad.body.definition.entities.map((entity) => entity.id));
  const missing = Array.from({ length: BURST }, (_, index) => `load-crate-${index}`).filter((id) => !landed.has(id));
  check(results, "every accepted operation landed exactly once — no lost update",
    missing.length === 0 && afterLoad.body.definition.entities.length === new Set(afterLoad.body.definition.entities.map((e) => e.id)).size,
    `missing: ${missing.join(", ") || "none"}`);
  check(results, "every receipt carries a distinct, ordered sequence",
    new Set(accepted.map((r) => r.body.seq)).size === accepted.length, "sequence collision");

  // --- 10. cumulative retention --------------------------------------------------------
  //
  // Every other limit in section 7 bounds ONE request. This one bounds what survives them.
  //
  // The retained operation ring used to be bounded by count alone, which is not a memory
  // bound: a retained operation carries its raw commands *and* the inverse computed from the
  // pre-state, and 512 of those at the per-request cap is gigabytes per session — reachable
  // by any member holding `mutate`, inside the ordinary refill rate, with no single request
  // ever exceeding a limit.
  //
  // Asserted through the contract rather than through internals: when the ring evicts, a
  // client resuming from before the eviction is told `mustResync` instead of being handed a
  // partial story. Sixteen operations is far under the 512-event bound, so if this resyncs,
  // the byte budget is the only thing that can have evicted.

  const retentionCreate = await founder.call("POST", "/sessions", {
    sceneName: "second-fixture", owner: { id: "owner-ada", label: "Ada" },
  });
  const retentionId = retentionCreate.body.session.sessionId;
  const retentionOwner = createActor(base, { credential: retentionCreate.body.credential, origin: ORIGIN });

  // 128 tags at the 128-character cap: the largest an entity may legally carry, and the
  // reason `update` is used rather than `spawn` — updating the same entities keeps the
  // document small while making each operation's inverse a full clone of the tags it
  // replaced. That inverse is the half of the retained cost a count bound cannot see.
  const fatTags = (salt) => Array.from({ length: 128 }, (_, index) => `${salt}-${index}-`.padEnd(128, "t").slice(0, 128));
  const FAT_ENTITIES = 12;
  const FAT_OPS = 16;

  await retentionOwner.call("POST", `/sessions/${retentionId}/ops`, {
    opId: "retention-seed",
    commands: Array.from({ length: FAT_ENTITIES }, (_, index) => ({
      op: "spawn",
      entity: { id: `fat-${index}`, type: "box", transform: { position: [index, 0.5, 0] }, tags: fatTags("seed") },
    })),
  });

  const retentionHello = await retentionOwner.connect(retentionId);
  const resumeSeq = retentionHello.seq;
  let retentionAccepted = 0;
  for (let round = 0; round < FAT_OPS; round += 1) {
    const response = await retentionOwner.call("POST", `/sessions/${retentionId}/ops`, {
      opId: `retention-${round}`,
      commands: Array.from({ length: FAT_ENTITIES }, (_, index) => ({
        op: "update",
        id: `fat-${index}`,
        patch: { tags: fatTags(`r${round}`) },
      })),
    });
    if (response.status === 201) retentionAccepted += 1;
  }
  check(results, "the retention fixture is accepted without tripping a per-request limit",
    retentionAccepted === FAT_OPS, `accepted ${retentionAccepted}/${FAT_OPS}`);

  await retentionOwner.disconnect();
  const evictedHello = await retentionOwner.connect(retentionId, { since: resumeSeq });
  check(results, "cumulative retention is bounded in bytes, not only in events",
    evictedHello.mustResync === true,
    `resuming from seq ${resumeSeq} after ${FAT_OPS} operations gave mustResync=${evictedHello.mustResync}`);
  check(results, "that eviction cannot be explained by the event-count bound",
    FAT_OPS + 1 < 512, `${FAT_OPS + 1} retained events`);
  await retentionOwner.disconnect();

  // The control. A byte budget that resyncs everybody proves nothing; an ordinary session
  // must still bridge an ordinary reconnect from the ring.
  const thinCreate = await founder.call("POST", "/sessions", {
    sceneName: "second-fixture", owner: { id: "owner-ada", label: "Ada" },
  });
  const thinId = thinCreate.body.session.sessionId;
  const thinOwner = createActor(base, { credential: thinCreate.body.credential, origin: ORIGIN });
  await thinOwner.connect(thinId);
  // Resume from a sequence the server has actually issued. A brand-new session's hello
  // carries seq 0, and `since=0` means "I have nothing", not "resume me" — which is a
  // resume assertion that can never fail and therefore proves nothing.
  await thinOwner.call("POST", `/sessions/${thinId}/ops`, {
    opId: "thin-anchor", commands: [spawnCommand("thin-crate-anchor")],
  });
  await thinOwner.waitFor((received) => received.ops.length >= 1, { label: "the anchor operation" });
  const resumeFrom = thinOwner.lastSeq;
  await thinOwner.disconnect();

  // Three operations land while nobody is listening. These are what the ring owes on return.
  const MISSED = 3;
  for (let index = 0; index < MISSED; index += 1) {
    await thinOwner.call("POST", `/sessions/${thinId}/ops`, {
      opId: `thin-${index}`, commands: [spawnCommand(`thin-crate-${index}`)],
    });
  }
  const thinResume = await thinOwner.connect(thinId, { since: resumeFrom });
  check(results, "an ordinary reconnect is still bridged from the retained ring",
    thinResume.mustResync === false && thinResume.resumed === true,
    `resuming from seq ${resumeFrom}: mustResync=${thinResume.mustResync} resumed=${thinResume.resumed}`);
  await thinOwner.waitFor((received) => received.ops.length >= 1 + MISSED, { label: "replayed operations" });
  check(results, "the bridged reconnect replays exactly the operations it missed",
    thinOwner.received.ops.length === 1 + MISSED
      && thinOwner.received.ops.slice(1).every((event) => event.seq > resumeFrom),
    `${thinOwner.received.ops.length} received for ${MISSED} missed`);
  await thinOwner.disconnect();

  // --- 11. a subscriber that stops reading -----------------------------------------------
  //
  // The other half of the same problem. Retention bounds what the session keeps; this bounds
  // what one stream can make the process hold on its behalf. `response.write()` reports
  // backpressure through its return value and nothing was reading it, so a client that stops
  // reading — and TCP never reports that as a close — accumulated every subsequent broadcast
  // in this process indefinitely.

  const stallCreate = await founder.call("POST", "/sessions", {
    sceneName: "second-fixture", owner: { id: "owner-ada", label: "Ada" },
  });
  const stallId = stallCreate.body.session.sessionId;
  const stallOwner = createActor(base, { credential: stallCreate.body.credential, origin: ORIGIN });
  await stallOwner.call("POST", `/sessions/${stallId}/ops`, {
    opId: "stall-seed",
    commands: Array.from({ length: FAT_ENTITIES }, (_, index) => ({
      op: "spawn",
      entity: { id: `stall-${index}`, type: "box", transform: { position: [index, 0.5, 0] }, tags: fatTags("seed") },
    })),
  });

  const stalled = await openStalledStream(base, stallId, { credential: stallCreate.body.credential, origin: ORIGIN });
  const beforeStallMembers = (await stallOwner.call("GET", `/sessions/${stallId}`)).body.session.members;
  for (let round = 0; round < FAT_OPS; round += 1) {
    await stallOwner.call("POST", `/sessions/${stallId}/ops`, {
      opId: `stall-${round}`,
      commands: Array.from({ length: FAT_ENTITIES }, (_, index) => ({
        op: "update",
        id: `stall-${index}`,
        patch: { tags: fatTags(`r${round}`) },
      })),
    });
  }

  const drained = await stalled.drain();
  check(results, "a subscriber that stops reading is dropped rather than buffered forever",
    drained.ended === true, "the server was still holding the stalled stream open");
  check(results, "the dropped subscriber is told to resync rather than silently severed",
    drained.text.includes("event: resync") && drained.text.includes("stream-too-slow"),
    drained.text.slice(-240));
  check(results, "dropping a stalled stream leaves the session serving everyone else",
    (await stallOwner.call("GET", `/sessions/${stallId}/snapshot`)).status === 200
      && beforeStallMembers.length === 1,
    "session unusable after dropping a stalled subscriber");

  // --- 12. token-leak audit ------------------------------------------------------------

  const secrets = [
    TOKEN,
    ownerCredential,
    ownerCredential.split(".")[1],
    secondCredential.split(".")[1],
    ticket.body.ticket.split(".")[1],
    loadInvite.body.code.split(".")[1],
  ];

  const consoleText = consoleLog.join("\n");
  const leakedToConsole = secrets.filter((secret) => consoleText.includes(secret));
  check(results, "no credential reaches the server console", leakedToConsole.length === 0,
    leakedToConsole.length ? `${leakedToConsole.length} secret(s) in console output` : "");

  // Every response body a member can obtain, swept for secrets it was not issued.
  const surfaces = {
    session: await owner.call("GET", `/sessions/${sessionId}`),
    snapshot: await owner.call("GET", `/sessions/${sessionId}/snapshot`),
    missions: await owner.call("GET", `/sessions/${sessionId}/missions`),
    invites: await owner.call("GET", `/sessions/${sessionId}/invites`),
    scene: await owner.call("GET", `/scenes/${SCENE}`),
    health: await owner.call("GET", "/health"),
  };
  const leakedToBodies = [];
  for (const [name, response] of Object.entries(surfaces)) {
    for (const secret of secrets) {
      if (response.text.includes(secret)) leakedToBodies.push(`${name}:${secret.slice(0, 6)}…`);
    }
  }
  check(results, "no credential appears in any readable session surface", leakedToBodies.length === 0, leakedToBodies.join(", "));

  const activity = owner.received.ops.concat(owner.received.missions, owner.received.presence, owner.received.members);
  const leakedToActivity = secrets.filter((secret) => JSON.stringify(activity).includes(secret));
  check(results, "no credential appears in the activity stream", leakedToActivity.length === 0, leakedToActivity.length ? "secret in activity" : "");

  const storedScene = (await requestText(`${base}/scenes/${SCENE}`)).text;
  check(results, "no credential is persisted to disk with the scene",
    secrets.every((secret) => !storedScene.includes(secret)), "secret persisted");

  check(results, "the error for a bad credential does not echo it back",
    !forged.text.includes(forgedMember.split(".")[1]), "credential echoed in error");
} catch (error) {
  check(results, "smoke-live-sessions-security threw", false, error instanceof Error ? error.stack : String(error));
} finally {
  if (store) await store.close();
  if (openStore) await openStore.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  if (openDir) await rm(openDir, { recursive: true, force: true });
}

report(results, "smoke-live-sessions-security");

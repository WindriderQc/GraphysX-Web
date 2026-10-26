// The Center's end of the bridge to a host page, tested from the hostile side: which framing
// pages get an answer at all, what a pushed proposal must carry before it becomes a card, that
// every push ends in a receipt the host can relay to Core truthfully, and that the decision a
// person takes on a pushed card reaches the host under the push id — and only the host.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

// The bridge value-imports its siblings (the protocol, the provider reader), which Node does not
// resolve from a bare `.ts` import; the support loader transpiles the real module graph.
const {
  CENTER_BRIDGE_SCHEMA,
  createHostBridge,
  isAllowedHostOrigin,
  isLoopbackOrigin,
  parseHostOriginAllowList,
  readPushedProposal,
} = await importBrowserModule(new URL("../src/coauthor-host-bridge.ts", import.meta.url));

const SELF = "https://graphysx.example";
const CORE = "https://agentx.example";
const STATE = { revision: 7, scene: { id: "showroom", label: "Showroom", entities: [{ id: "plinth", type: "box", label: "Plinth" }] } };
const ACTOR = { id: "nestor", label: "Nestor · Core", kind: "agent" };
const PUSH = { id: "push-1", actor: ACTOR, intent: "Add a lamp.", commands: [{ op: "spawn", entity: { id: "lamp", type: "point-light" } }], expectedRevision: 7 };
const msg = (type, rest = {}) => ({ schema: CENTER_BRIDGE_SCHEMA, type, ...rest });

function harness(overrides = {}) {
  const posted = [];
  const pushes = [];
  const parent = { tag: "parent" };
  const bridge = createHostBridge({
    selfOrigin: SELF,
    allowedOrigins: [CORE],
    hostSource: parent,
    post: (message, origin) => posted.push({ message, origin }),
    readState: () => STATE,
    onPush: (proposal) => { pushes.push(proposal); return { status: "shown", proposalId: `proposal-${pushes.length}`, stale: false }; },
    timeoutMs: 50,
    ...overrides,
  });
  const from = (origin, data, source = parent) => bridge.receive({ origin, source, data });
  return { bridge, posted, pushes, parent, from };
}

describe("which origins may host the Center", () => {
  it("allows same-origin and the build-time list, and loopback only where loopback means development", () => {
    const list = [CORE];
    assert.equal(isAllowedHostOrigin(SELF, SELF, list), true);
    assert.equal(isAllowedHostOrigin(CORE, SELF, list), true);
    // The public Center is not on loopback: a page on the visitor's own machine is nobody's host.
    assert.equal(isAllowedHostOrigin("http://127.0.0.1:3399", SELF, list), false);
    assert.equal(isAllowedHostOrigin("http://localhost:5173", SELF, list), false);
    // A Center served from loopback (a worktree build, the smoke) is development: loopback hosts answer.
    assert.equal(isAllowedHostOrigin("http://127.0.0.1:3399", "http://127.0.0.1:4199", list), true);
    assert.equal(isAllowedHostOrigin("http://localhost:5173", "http://127.0.0.1:4199", list), true);
    // So is the dev server on any origin, when it says so.
    assert.equal(isAllowedHostOrigin("http://127.0.0.1:3399", SELF, list, true), true);
    assert.equal(isAllowedHostOrigin("http://127.0.0.1:3399", "http://127.0.0.1:4199", list, false), false);
    assert.equal(isLoopbackOrigin("http://localhost:4173"), true);
    assert.equal(isLoopbackOrigin(SELF), false);
    assert.equal(isAllowedHostOrigin("https://evil.example", SELF, list), false);
    assert.equal(isAllowedHostOrigin("https://agentx.example.evil.example", SELF, list), false);
    assert.equal(isAllowedHostOrigin("null", SELF, list), false, "an opaque origin (sandboxed frame, file:) is nobody");
    assert.equal(isAllowedHostOrigin("", SELF, list), false);
    assert.equal(isAllowedHostOrigin("javascript:alert(1)", SELF, list), false);
    assert.equal(isAllowedHostOrigin(`${CORE}/path`, SELF, list), false, "an origin with a path did not come from event.origin");
  });

  it("parses the allow-list strictly: bare http(s) origins only, deduplicated", () => {
    assert.deepEqual(parseHostOriginAllowList(`${CORE}, http://lan.example:3080  ${CORE}/`), [CORE, "http://lan.example:3080"]);
    assert.deepEqual(parseHostOriginAllowList(`${CORE}/graphysx ftp://x.example https://u:p@h.example https://h.example?x=1`), []);
    assert.deepEqual(parseHostOriginAllowList(undefined), []);
    assert.deepEqual(parseHostOriginAllowList(""), []);
  });
});

describe("a pushed proposal", () => {
  it("is accepted with its actor, intent, commands and revision", () => {
    const result = readPushedProposal(PUSH);
    assert.equal(result.ok, true);
    assert.deepEqual(result.proposal, { ...PUSH, actor: ACTOR });
  });

  it("is refused without an id, an agent actor or an integer revision", () => {
    for (const [bad, pattern] of [
      [{ ...PUSH, id: undefined }, /no usable id/],
      [{ ...PUSH, id: "../x" }, /no usable id/],
      [{ ...PUSH, actor: undefined }, /which agent/],
      [{ ...PUSH, actor: { ...ACTOR, kind: "human" } }, /which agent/],
      [{ ...PUSH, actor: { ...ACTOR, label: "x".repeat(41) } }, /which agent/],
      [{ ...PUSH, actor: { ...ACTOR, id: "Nestor Core" } }, /which agent/],
      [{ ...PUSH, expectedRevision: "7" }, /which revision/],
      [{ ...PUSH, expectedRevision: -1 }, /which revision/],
      ["not an object", /not an object/],
    ]) {
      const result = readPushedProposal(bad);
      assert.equal(result.ok, false);
      assert.match(result.reason, pattern);
    }
  });

  it("is read with the same rules as a provider reply: shape, limits, reserved namespaces", () => {
    assert.match(readPushedProposal({ ...PUSH, commands: [] }).reason, /no changes/);
    assert.match(readPushedProposal({ ...PUSH, commands: [{ op: "eval" }] }).reason, /unknown operation/);
    assert.match(readPushedProposal({ ...PUSH, commands: [{ op: "spawn", entity: { id: "live-agent:mallory", type: "agent" } }] }).reason, /reserved id namespace/);
    assert.match(readPushedProposal({ ...PUSH, intent: "" }).reason, /did not say/);
  });
});

describe("the bridge", () => {
  it("answers nothing until an allowed host says hello, then answers only that host", () => {
    const { bridge, posted, from } = harness();
    assert.equal(bridge.hostOrigin(), null);
    assert.equal(from("https://evil.example", msg("hello")), false);
    assert.equal(from(CORE, msg("push", { proposal: PUSH })), false, "a push before hello is ignored");
    assert.deepEqual(posted, [], "a stranger learns nothing, not even that the Center is here");

    assert.equal(from(CORE, msg("hello")), true);
    assert.equal(bridge.hostOrigin(), CORE);
    assert.deepEqual(posted, [{ message: msg("ready", { state: STATE }), origin: CORE }]);

    // A second allowed origin does not take over, and the parent is the only source.
    assert.equal(from("http://127.0.0.1:3399", msg("hello")), false, "loopback: not development here, and not the first host either");
    assert.equal(from(CORE, msg("hello"), { tag: "popup" }), false);
    assert.equal(bridge.hostOrigin(), CORE);
    assert.equal(from(CORE, { type: "hello" }), false, "no schema tag, not ours");
  });

  it("answers a loopback host only when told loopback is development", () => {
    const closed = harness();
    assert.equal(closed.from("http://127.0.0.1:3399", msg("hello")), false);
    assert.deepEqual(closed.posted, []);
    const dev = harness({ allowLoopback: true });
    assert.equal(dev.from("http://127.0.0.1:3399", msg("hello")), true);
    assert.equal(dev.bridge.hostOrigin(), "http://127.0.0.1:3399");
    const local = harness({ selfOrigin: "http://127.0.0.1:4199" });
    assert.equal(local.from("http://localhost:3399", msg("hello")), true, "a Center on loopback is development");
  });

  it("keeps the first host once chosen", () => {
    const { bridge, from } = harness();
    from(CORE, msg("hello"));
    assert.equal(from(CORE, msg("hello"), { tag: "popup" }), false);
    assert.equal(bridge.hostOrigin(), CORE);
    assert.equal(from(CORE, { type: "hello" }), false, "no schema tag, not ours");
  });

  it("is a provider: a request goes up, the reply comes down and is read like any provider reply", async () => {
    const { bridge, posted, from } = harness();
    const early = await bridge.provider.propose({ request: "a lamp", revision: 7, scene: STATE.scene });
    assert.equal(early.ok, false);
    assert.match(early.reason, /No AgentX host page/);

    from(CORE, msg("hello"));
    const pending = bridge.provider.propose({ request: "a lamp", revision: 7, scene: STATE.scene });
    const sent = posted.at(-1);
    assert.equal(sent.origin, CORE);
    assert.equal(sent.message.type, "propose-request");
    assert.deepEqual(sent.message.request, { request: "a lamp", revision: 7, scene: STATE.scene });
    // A reply to an id nobody asked for is ignored; the right id resolves the request.
    assert.equal(from(CORE, msg("propose-reply", { id: "request-99", reply: { intent: "x", commands: PUSH.commands } })), true);
    from(CORE, msg("propose-reply", { id: sent.message.id, reply: { intent: "Add a lamp.", commands: PUSH.commands } }));
    const result = await pending;
    assert.equal(result.ok, true);
    assert.equal(result.proposal.intent, "Add a lamp.");

    const refused = bridge.provider.propose({ request: "a dragon", revision: 7, scene: STATE.scene });
    from(CORE, msg("propose-reply", { id: posted.at(-1).message.id, reply: { ok: false, reason: "No dragons." } }));
    assert.deepEqual(await refused, { ok: false, reason: "No dragons." });

    const forged = bridge.provider.propose({ request: "forge", revision: 7, scene: STATE.scene });
    from(CORE, msg("propose-reply", { id: posted.at(-1).message.id, reply: { intent: "x", commands: [{ op: "spawn", entity: { id: "live-agent:m", type: "agent" } }] } }));
    assert.match((await forged).reason, /reserved id namespace/);

    const slow = await bridge.provider.propose({ request: "slow", revision: 7, scene: STATE.scene });
    assert.deepEqual(slow, { ok: false, reason: "The host page did not answer in time." });
  });

  it("hands a valid push to the Center and sends a receipt for every push, valid or not", () => {
    const { posted, pushes, from } = harness();
    from(CORE, msg("hello"));
    assert.equal(from(CORE, msg("push", { proposal: PUSH })), true);
    assert.deepEqual(pushes, [{ ...PUSH, actor: ACTOR }]);
    assert.deepEqual(posted.at(-1), { message: msg("push-receipt", { id: "push-1", status: "shown", proposalId: "proposal-1", stale: false }), origin: CORE });

    from(CORE, msg("push", { proposal: { ...PUSH, id: "push-2", commands: [{ op: "spawn", entity: { id: "live-agent:m", type: "agent" } }] } }));
    assert.equal(pushes.length, 1, "a forged push never reaches the Center");
    assert.equal(posted.at(-1).message.status, "refused");
    assert.equal(posted.at(-1).message.id, "push-2");
    assert.match(posted.at(-1).message.reason, /reserved id namespace/);

    from(CORE, msg("push", { proposal: "garbage" }));
    assert.equal(posted.at(-1).message.id, "unknown");
    assert.equal(posted.at(-1).message.status, "refused");
  });

  it("relays the Center's own refusal — a card already waiting — as the receipt", () => {
    const { posted, from } = harness({ onPush: () => ({ status: "refused", reason: "A proposal is already waiting for a decision." }) });
    from(CORE, msg("hello"));
    from(CORE, msg("push", { proposal: PUSH }));
    assert.deepEqual(posted.at(-1).message, msg("push-receipt", { id: "push-1", status: "refused", reason: "A proposal is already waiting for a decision." }));
  });

  it("reports what a person decided about a pushed proposal, to the host only, as it was decided", () => {
    const { bridge, posted, from } = harness();
    bridge.reportOutcome({ pushId: "push-1", status: "accepted", proposalId: "Add a lamp.@7", revision: 8, commitId: "commit-0001" });
    assert.deepEqual(posted, [], "no host yet: nobody to tell");
    from(CORE, msg("hello"));
    from(CORE, msg("push", { proposal: PUSH }));
    bridge.reportOutcome({ pushId: "push-1", status: "accepted", proposalId: "Add a lamp.@7", revision: 8, commitId: "commit-0001" });
    assert.deepEqual(posted.at(-1), {
      message: msg("push-outcome", { id: "push-1", status: "accepted", proposalId: "Add a lamp.@7", revision: 8, commitId: "commit-0001" }),
      origin: CORE,
    });
    bridge.reportOutcome({ pushId: "push-2", status: "discarded", proposalId: "Add a lamp.@8", revision: 8 });
    assert.deepEqual(posted.at(-1).message, msg("push-outcome", { id: "push-2", status: "discarded", proposalId: "Add a lamp.@8", revision: 8 }), "no commitId, no reason: nothing happened");
    bridge.reportOutcome({ pushId: "push-3", status: "stale", proposalId: "Add a lamp.@7", revision: 9 });
    assert.deepEqual(posted.at(-1).message, msg("push-outcome", { id: "push-3", status: "stale", proposalId: "Add a lamp.@7", revision: 9 }));
    bridge.reportOutcome({ pushId: "push-4", status: "rejected", proposalId: "Add a lamp.@9", revision: 9, reason: "The scene rejected the change." });
    assert.deepEqual(posted.at(-1).message, msg("push-outcome", { id: "push-4", status: "rejected", proposalId: "Add a lamp.@9", revision: 9, reason: "The scene rejected the change." }));
    assert.ok(posted.every((entry) => entry.origin === CORE), "outcomes go to the host origin and nowhere else");
    bridge.dispose();
    const count = posted.length;
    bridge.reportOutcome({ pushId: "push-5", status: "discarded", proposalId: "x@9", revision: 9 });
    assert.equal(posted.length, count, "nothing after dispose");
  });

  it("announces the scene to the host once there is one, and nothing before", () => {
    const { bridge, posted, from } = harness();
    bridge.announce();
    assert.deepEqual(posted, []);
    from(CORE, msg("hello"));
    bridge.announce();
    assert.deepEqual(posted.at(-1), { message: msg("state", { state: STATE }), origin: CORE });
    bridge.dispose();
    bridge.announce();
    assert.equal(posted.length, 2, "nothing after dispose");
  });
});

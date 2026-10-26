// A provider is a remote party that returns commands to mutate the user's scene, so its reply
// is hostile input until proven otherwise. These tests are written from that side: not "does a
// good reply work" but "what does a bad one get away with".
//
// The containment that matters most is structural rather than tested here — a provider's output
// becomes a proposal, and a proposal cannot commit itself. What is tested here is everything
// that has to hold *before* a human is shown a card and asked to agree to it.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROVIDER_LIMITS,
  createHttpProposalProvider,
  describeProposalSource,
  isAllowedSessionProviderUrl,
  proposalProvider,
  readProviderRefusal,
  readProviderReply,
  setProposalProvider,
  summarizeSceneForProvider,
  validateProviderCommands,
  validateProviderIntent,
} from "../src/coauthor-provider.ts";

const spawn = (id) => ({ op: "spawn", entity: { id, type: "box" } });

describe("commands from a provider", () => {
  it("accepts an ordinary list", () => {
    const result = validateProviderCommands([spawn("lamp"), { op: "update", id: "lamp", patch: {} }]);
    assert.equal(result.ok, true);
    assert.equal(result.commands.length, 2);
  });

  it("refuses anything that is not a list", () => {
    for (const raw of [null, undefined, {}, "spawn a box", 7]) {
      assert.equal(validateProviderCommands(raw).ok, false);
    }
  });

  it("refuses an empty list rather than proposing nothing", () => {
    // An empty proposal renders as a card offering no changes, which is a worse answer than
    // saying the reply contained none.
    const result = validateProviderCommands([]);
    assert.equal(result.ok, false);
    assert.match(result.reason, /no changes/);
  });

  it("refuses an operation the runtime does not have", () => {
    // `eval` is the shape of the thing this is really guarding against: an op invented by the
    // far end and handled by nothing, or handled by something it should not reach.
    const result = validateProviderCommands([{ op: "eval", code: "fetch('//evil')" }]);
    assert.equal(result.ok, false);
    assert.match(result.reason, /unknown operation/);
  });

  it("names which change was bad, not just that one was", () => {
    const result = validateProviderCommands([spawn("a"), spawn("b"), { op: "nope" }]);
    assert.match(result.reason, /Change 3/);
  });

  it("refuses a list too long to review", () => {
    const many = Array.from({ length: PROVIDER_LIMITS.commands + 1 }, (_, index) => spawn(`box-${index}`));
    const result = validateProviderCommands(many);
    assert.equal(result.ok, false);
    assert.match(result.reason, /reviewed at once/);
  });

  it("accepts exactly the limit", () => {
    const many = Array.from({ length: PROVIDER_LIMITS.commands }, (_, index) => spawn(`box-${index}`));
    assert.equal(validateProviderCommands(many).ok, true);
  });
});

describe("forged host namespaces", () => {
  // The browser shell owns `live-agent:`, `live-mission:` and `live-nestor:` for transient
  // projections. A provider that could claim one could forge a live-session participant or a
  // mission board, and it would look authentic because it would BE an ordinary entity.
  it("refuses a forged id at the top level", () => {
    const result = validateProviderCommands([{ op: "remove", id: "live-agent:alice:x1" }]);
    assert.equal(result.ok, false);
    assert.match(result.reason, /live-agent:/);
  });

  it("refuses one buried inside a spawned entity", () => {
    const result = validateProviderCommands([{ op: "spawn", entity: { id: "live-mission:board", type: "box" } }]);
    assert.equal(result.ok, false);
    assert.match(result.reason, /live-mission:/);
  });

  it("refuses one hidden deep in a nested field", () => {
    // Not a top-level id and not an obvious field — the walk has to actually walk.
    const result = validateProviderCommands([{
      op: "spawn",
      entity: {
        id: "ordinary",
        type: "box",
        interactions: [{ id: "poke", type: "toggle-visibility", targetIds: ["live-nestor:ghost"] }],
      },
    }]);
    assert.equal(result.ok, false);
    assert.match(result.reason, /live-nestor:/);
  });

  it("refuses one inside an array of ids", () => {
    const result = validateProviderCommands([{ op: "select", ids: ["crate", "live-agent:bob:z9"] }]);
    assert.equal(result.ok, false);
  });

  it("leaves ordinary ids that merely look similar alone", () => {
    // `live-agent-crate` is not in the `live-agent:` namespace, and refusing it would make a
    // legitimate name unusable.
    assert.equal(validateProviderCommands([spawn("live-agent-crate")]).ok, true);
    assert.equal(validateProviderCommands([spawn("my-live-agent:thing")]).ok, true);
  });
});

describe("the stated intent", () => {
  it("is what the card gets titled with, so it must be a readable string", () => {
    for (const raw of [null, undefined, 42, {}, "", "   "]) {
      assert.equal(validateProviderIntent(raw).ok, false);
    }
  });

  it("collapses whitespace rather than rendering it", () => {
    const result = validateProviderIntent("  Add   a\n\tlamp  ");
    assert.equal(result.ok, true);
    assert.equal(result.intent, "Add a lamp");
  });

  it("refuses one too long for a card", () => {
    const result = validateProviderIntent("x".repeat(PROVIDER_LIMITS.intentChars + 1));
    assert.equal(result.ok, false);
    assert.match(result.reason, /the most a card can show/);
  });
});

describe("reading a whole reply", () => {
  it("returns a proposal for a well-formed reply", () => {
    const result = readProviderReply({ intent: "Add a lamp", commands: [spawn("lamp")] });
    assert.equal(result.ok, true);
    assert.equal(result.proposal.intent, "Add a lamp");
    assert.equal(result.proposal.commands.length, 1);
  });

  it("refuses before the commands when the intent is missing", () => {
    // Order matters for the message: "it did not say what it was trying to do" is more useful
    // than a complaint about the third command.
    const result = readProviderReply({ commands: [{ op: "nope" }] });
    assert.equal(result.ok, false);
    assert.match(result.reason, /what it was trying to do/);
  });

  it("refuses a reply that is not an object at all", () => {
    for (const raw of [null, "ok", [], 3]) assert.equal(readProviderReply(raw).ok, false);
  });

  it("never throws, whatever it is handed", () => {
    // Every failure is something to show a person in the panel; an exception here would become
    // an unhandled rejection somewhere far from the cause.
    const nasty = { intent: "x", commands: [{ op: "spawn", entity: { id: "a", type: "box" } }] };
    nasty.commands[0].entity.self = nasty; // a cycle
    assert.doesNotThrow(() => readProviderReply(nasty));
  });
});

describe("what the scene summary sends", () => {
  const entities = Array.from({ length: 100 }, (_, index) => ({
    id: `e${index}`, type: "box", label: `Box ${index}`, position: [index, 0, 0], material: { color: "#fff" },
  }));

  it("sends ids, types and labels — never the document", () => {
    // A provider does not need the geometry of every entity to add a lamp, and the whole
    // document is the user's scene going to a third party on every request.
    const [first] = summarizeSceneForProvider(entities);
    assert.deepEqual(Object.keys(first).sort(), ["id", "label", "type"]);
  });

  it("is bounded", () => {
    assert.equal(summarizeSceneForProvider(entities).length, 60);
    assert.equal(summarizeSceneForProvider(entities, 5).length, 5);
  });
});

describe("having a provider at all", () => {
  it("has none by default, and says so as a fact rather than an apology", () => {
    setProposalProvider(null);
    assert.equal(proposalProvider(), null);
    const text = describeProposalSource(null);
    assert.match(text, /composes proposals locally/);
    assert.ok(!/error|unavailable|failed/i.test(text), "no provider is the supported default, not a fault");
  });

  it("names the provider and still promises the gate when one is set", () => {
    const provider = { id: "test", label: "Test Model", propose: async () => ({ ok: false, reason: "no" }) };
    setProposalProvider(provider);
    assert.equal(proposalProvider()?.id, "test");
    const text = describeProposalSource();
    assert.match(text, /Test Model/);
    // The promise that makes a remote composer safe to offer at all.
    assert.match(text, /until you accept/);
    setProposalProvider(null);
  });
});

describe("an explicit refusal", () => {
  it("is read when the far end says ok: false with a reason", () => {
    const result = readProviderRefusal({ ok: false, reason: "That asks for a dragon;\n the world has  no such type." });
    assert.deepEqual(result, { ok: false, reason: "That asks for a dragon; the world has no such type." });
  });

  it("is not read from anything else", () => {
    for (const raw of [null, "no", { ok: true }, { intent: "x", commands: [] }, { ok: false, reason: 7, message: 8 }].slice(0, 4)) {
      assert.equal(readProviderRefusal(raw), null);
    }
  });

  it("still names the refusal when the far end forgot to say why", () => {
    assert.match(readProviderRefusal({ ok: false }).reason, /without saying why/);
    assert.match(readProviderRefusal({ ok: false, reason: "   " }).reason, /without saying why/);
    // Core's error envelope says `message`; that is a reason too.
    assert.equal(readProviderRefusal({ ok: false, message: "Model busy." }).reason, "Model busy.");
  });

  it("bounds the sentence to what a card can show", () => {
    const result = readProviderRefusal({ ok: false, reason: "x".repeat(2_000) });
    assert.ok(result.reason.length <= 300);
    assert.ok(result.reason.endsWith("…"));
  });

  it("wins over the command list in a whole reply", () => {
    // A reply that both refuses and lists commands is refusing; the commands are not offered.
    const result = readProviderReply({ ok: false, reason: "No.", intent: "x", commands: [spawn("a")] });
    assert.deepEqual(result, { ok: false, reason: "No." });
  });
});

describe("the HTTP provider", () => {
  const ok = (body) => async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
  const url = "/propose";

  it("shows Core's own sentence when it refuses in a 200", async () => {
    const provider = createHttpProposalProvider({ url, fetchImpl: ok({ ok: false, reason: "That asks for a dragon; the world has no such type." }) });
    const result = await provider.propose({ request: "add a dragon", revision: 3, scene: { id: "s", label: "S", entities: [] } });
    assert.equal(result.ok, false);
    assert.match(result.reason, /dragon/);
    assert.doesNotMatch(result.reason, /answered/);
  });

  it("prefers an explicit reason to a bare status, and keeps the status without one", async () => {
    const refused = createHttpProposalProvider({ url, fetchImpl: async () => ({ ok: false, status: 503, text: async () => JSON.stringify({ ok: false, reason: "No proposal provider is configured on this server." }) }) });
    const withReason = await refused.propose({ request: "x", revision: 0, scene: { id: "s", label: "S", entities: [] } });
    assert.match(withReason.reason, /No proposal provider/);
    const bare = createHttpProposalProvider({ url, fetchImpl: async () => ({ ok: false, status: 422, text: async () => "Unprocessable" }) });
    const withoutReason = await bare.propose({ request: "x", revision: 0, scene: { id: "s", label: "S", entities: [] } });
    assert.equal(withoutReason.reason, "The provider answered 422.");
    // A non-OK JSON body that is not a refusal still reads as the status, not as a proposal.
    const odd = createHttpProposalProvider({ url, fetchImpl: async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ intent: "x", commands: [spawn("a")] }) }) });
    assert.equal((await odd.propose({ request: "x", revision: 0, scene: { id: "s", label: "S", entities: [] } })).reason, "The provider answered 500.");
  });

  it("returns a proposal for a well-formed reply", async () => {
    const provider = createHttpProposalProvider({ url, fetchImpl: ok({ intent: "Add a lamp", commands: [spawn("lamp")] }) });
    const result = await provider.propose({ request: "add a lamp", revision: 3, scene: { id: "s", label: "S", entities: [] } });
    assert.equal(result.ok, true);
    assert.equal(result.proposal.intent, "Add a lamp");
  });

  it("posts the request as JSON and nothing else", async () => {
    // What leaves the browser is exactly the bounded request. A provider integration that
    // quietly sent more would be sending the user's scene somewhere they did not agree to.
    let seen = null;
    const provider = createHttpProposalProvider({
      url,
      fetchImpl: async (target, init) => {
        seen = { target, method: init.method, body: JSON.parse(init.body), headers: init.headers };
        return { ok: true, status: 200, text: async () => JSON.stringify({ intent: "x", commands: [spawn("a")] }) };
      },
    });
    const request = { request: "add a lamp", revision: 3, scene: { id: "s", label: "S", entities: [{ id: "a", type: "box", label: "A" }] } };
    await provider.propose(request);
    assert.equal(seen.target, url);
    assert.equal(seen.method, "POST");
    assert.deepEqual(seen.body, request);
    assert.deepEqual(Object.keys(seen.headers), ["content-type"], "no credentials are attached in the browser");
  });

  it("reports an HTTP error as a sentence, not a status code", async () => {
    const provider = createHttpProposalProvider({ url, fetchImpl: async () => ({ ok: false, status: 503, text: async () => "" }) });
    const result = await provider.propose({ request: "x", revision: 0, scene: { id: "s", label: "S", entities: [] } });
    assert.equal(result.ok, false);
    assert.match(result.reason, /answered 503/);
  });

  it("refuses a reply that is not JSON", async () => {
    const provider = createHttpProposalProvider({ url, fetchImpl: async () => ({ ok: true, status: 200, text: async () => "<html>nope" }) });
    const result = await provider.propose({ request: "x", revision: 0, scene: { id: "s", label: "S", entities: [] } });
    assert.equal(result.ok, false);
    assert.match(result.reason, /not valid JSON/);
  });

  it("refuses a reply too large to read", async () => {
    const huge = "x".repeat(PROVIDER_LIMITS.replyBytes + 1);
    const provider = createHttpProposalProvider({ url, fetchImpl: async () => ({ ok: true, status: 200, text: async () => huge }) });
    const result = await provider.propose({ request: "x", revision: 0, scene: { id: "s", label: "S", entities: [] } });
    assert.equal(result.ok, false);
    assert.match(result.reason, /too large/);
  });

  it("still refuses forged namespaces that arrive over the wire", async () => {
    // The validation is not a client-side nicety applied to trusted data — it is the whole
    // reason a remote composer can be offered at all.
    const provider = createHttpProposalProvider({
      url,
      fetchImpl: ok({ intent: "Impersonate a teammate", commands: [{ op: "spawn", entity: { id: "live-agent:mallory:1", type: "box" } }] }),
    });
    const result = await provider.propose({ request: "x", revision: 0, scene: { id: "s", label: "S", entities: [] } });
    assert.equal(result.ok, false);
    assert.match(result.reason, /live-agent:/);
  });

  it("gives up rather than leaving the panel composing forever", async () => {
    const provider = createHttpProposalProvider({
      url,
      timeoutMs: 20,
      fetchImpl: (_target, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    });
    const result = await provider.propose({ request: "x", revision: 0, scene: { id: "s", label: "S", entities: [] } });
    assert.equal(result.ok, false);
    assert.match(result.reason, /did not answer in time/);
  });

  it("reports an unreachable endpoint without throwing", async () => {
    const provider = createHttpProposalProvider({ url, fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
    const result = await provider.propose({ request: "x", revision: 0, scene: { id: "s", label: "S", entities: [] } });
    assert.equal(result.ok, false);
    assert.match(result.reason, /could not be reached/);
  });
});

describe("a provider URL from the query string", () => {
  // `?propose=<url>` is attacker-supplied — a crafted link is a link someone can be sent. The
  // human gate stands behind it, but that is no reason to make the request at all.
  const origin = "https://graphysx.specialblend.ca";

  it("allows same-origin, which is the shape production uses", () => {
    assert.equal(isAllowedSessionProviderUrl("/propose", origin), true);
    assert.equal(isAllowedSessionProviderUrl(`${origin}/propose`, origin), true);
  });

  it("allows loopback, which is what makes the seam testable in development", () => {
    assert.equal(isAllowedSessionProviderUrl("http://localhost:4193/propose", origin), true);
    assert.equal(isAllowedSessionProviderUrl("http://127.0.0.1:8080/propose", origin), true);
  });

  it("refuses another origin, which is the exfiltration link", () => {
    // This is the whole point: the visitor's scene summary must not leave for a host named in
    // a URL somebody sent them.
    assert.equal(isAllowedSessionProviderUrl("https://evil.example/collect", origin), false);
    assert.equal(isAllowedSessionProviderUrl("//evil.example/collect", origin), false);
  });

  it("refuses a lookalike host", () => {
    assert.equal(isAllowedSessionProviderUrl("https://localhost.evil.example/x", origin), false);
    assert.equal(isAllowedSessionProviderUrl("https://127.0.0.1.evil.example/x", origin), false);
  });

  it("refuses schemes that are not HTTP at all", () => {
    for (const candidate of ["javascript:alert(1)", "data:text/plain,x", "file:///etc/passwd"]) {
      assert.equal(isAllowedSessionProviderUrl(candidate, origin), false);
    }
  });

  it("refuses nonsense rather than throwing on it", () => {
    assert.equal(isAllowedSessionProviderUrl("", origin), false);
    assert.equal(isAllowedSessionProviderUrl("http://", origin), false);
  });
});

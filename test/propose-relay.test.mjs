// The dev relay forwards one route to one configured Core URL and nothing else. These tests
// are about what it refuses: a relay that forwarded any body anywhere would be the generic
// proxy the ecosystem seams forbid.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import { createProposalRelayRoute, isProposalRequest, resolveProposeTarget } from "../scripts/propose-relay.mjs";

const request = { request: "add a lake", revision: 3, scene: { id: "s", label: "S", entities: [{ id: "a", type: "box", label: "A" }] } };

function fakeReq({ method = "POST", url = "/propose", body } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.destroy = () => {};
  queueMicrotask(() => {
    if (body !== undefined) req.emit("data", Buffer.from(typeof body === "string" ? body : JSON.stringify(body)));
    req.emit("end");
  });
  return req;
}

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: null, done: null };
  res.finished = new Promise((resolve) => { res.done = resolve; });
  res.setHeader = (name, value) => { res.headers[name] = value; };
  res.end = (body) => { res.body = JSON.parse(body); res.done(); };
  return res;
}

async function relay(route, options) {
  const res = fakeRes();
  const handled = route(fakeReq(options), res);
  if (handled) await res.finished;
  return { handled, res };
}

describe("the proposal relay", () => {
  it("ignores every other path and refuses every other method", async () => {
    const route = createProposalRelayRoute({ targetUrl: "http://127.0.0.1:9/api/graphysx/propose", fetchImpl: () => assert.fail("no fetch") });
    assert.equal(route({ url: "/propose-not", method: "POST" }, fakeRes()), false);
    assert.equal(route({ url: "/", method: "POST" }, fakeRes()), false);
    const { res } = await relay(route, { method: "GET" });
    assert.equal(res.statusCode, 405);
  });

  it("says, as a sentence, when no provider is configured", async () => {
    const route = createProposalRelayRoute({ targetUrl: undefined, fetchImpl: () => assert.fail("no fetch") });
    const { handled, res } = await relay(route, { body: request });
    assert.equal(handled, true);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.ok, false);
    assert.match(res.body.reason, /GRAPHYSX_PROPOSE_URL/);
  });

  it("forwards only a proposal request, verbatim, to the configured URL", async () => {
    let seen = null;
    const route = createProposalRelayRoute({
      targetUrl: "http://127.0.0.1:9/api/graphysx/propose",
      fetchImpl: async (url, init) => {
        seen = { url, method: init.method, body: JSON.parse(init.body) };
        return { status: 200, text: async () => JSON.stringify({ intent: "Add a lake", commands: [{ op: "spawn", entity: { id: "lake", type: "water" } }] }) };
      },
    });
    const { res } = await relay(route, { body: request });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(seen, { url: "http://127.0.0.1:9/api/graphysx/propose", method: "POST", body: request });
    assert.equal(res.body.intent, "Add a lake");
    assert.equal(res.headers["cache-control"], "no-store");
  });

  it("refuses a body that is not a proposal request before any fetch", async () => {
    const route = createProposalRelayRoute({ targetUrl: "http://127.0.0.1:9/x", fetchImpl: () => assert.fail("no fetch") });
    for (const body of ["not json", { request: "x" }, { ...request, extra: 1 }, { ...request, request: "x".repeat(2_001) }, { ...request, revision: -1 },
      { ...request, scene: { ...request.scene, entities: [{ id: "a", type: "box", label: "A", material: {} }] } }]) {
      const { res } = await relay(route, { body });
      assert.equal(res.statusCode, 400, JSON.stringify(body).slice(0, 60));
    }
    assert.equal(isProposalRequest(request), true);
    assert.equal(isProposalRequest({ ...request, scene: { ...request.scene, entities: Array.from({ length: 61 }, () => ({ id: "a", type: "b", label: "c" })) } }), false);
  });

  it("passes the provider's status and explicit refusal through, and bounds the reply", async () => {
    let upstream = () => ({ status: 200, text: async () => JSON.stringify({ ok: false, reason: "That asks for a dragon; the world has no such type." }) });
    const route = createProposalRelayRoute({ targetUrl: "http://127.0.0.1:9/x", fetchImpl: async () => upstream() });
    let { res } = await relay(route, { body: request });
    assert.equal(res.statusCode, 200);
    assert.match(res.body.reason, /dragon/);

    upstream = () => ({ status: 422, text: async () => "<html>nope</html>" });
    ({ res } = await relay(route, { body: request }));
    assert.equal(res.statusCode, 502);
    assert.match(res.body.reason, /422/);

    upstream = () => ({ status: 200, text: async () => `{"intent":"${"x".repeat(300 * 1024)}","commands":[]}` });
    ({ res } = await relay(route, { body: request }));
    assert.equal(res.statusCode, 502);
    assert.match(res.body.reason, /too large/);

    upstream = () => { throw Object.assign(new Error("down"), { name: "TypeError" }); };
    ({ res } = await relay(route, { body: request }));
    assert.equal(res.statusCode, 504);
    assert.match(res.body.reason, /could not be reached/);
  });

  it("accepts only an http(s) target without credentials", () => {
    assert.equal(resolveProposeTarget(""), null);
    assert.equal(resolveProposeTarget(undefined), null);
    assert.equal(resolveProposeTarget(" https://agentx.example/api/graphysx/propose "), "https://agentx.example/api/graphysx/propose");
    assert.throws(() => resolveProposeTarget("https://u:p@agentx.example/x"), /credentials/);
    assert.throws(() => resolveProposeTarget("file:///etc/passwd"), /http/);
  });
});

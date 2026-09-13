import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createLlmXRoute } from "../scripts/llmx-server.mjs";

const consumer = "/api/consumers/nestor/v1/llmx";
const sessionId = "session-1234567890";

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function relay(t, options) {
  const route = createLlmXRoute(options);
  return serve(t, (req, res) => {
    if (!route(req, res)) { res.writeHead(404); res.end("outside LLMx"); }
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function deadline(promise, description) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${description}`)), 3000);
    })]);
  } finally { clearTimeout(timer); }
}

test("Household configuration accepts only an HTTP origin without credentials or a path", () => {
  for (const householdUrl of ["file:///private", "ftp://127.0.0.1", "http://user:secret@127.0.0.1",
    "http://127.0.0.1/private", "http://127.0.0.1/?token=secret", "http://127.0.0.1/#private"]) {
    assert.throws(() => createLlmXRoute({ householdUrl }), /must be a Household origin/);
  }
});

test("unconfigured LLMx stays disabled and leaves other application routes alone", async (t) => {
  let calls = 0;
  const base = await relay(t, { householdUrl: "", fetchImpl: async () => { calls++; throw new Error("unexpected upstream call"); } });
  const config = await fetch(`${base}/llmx-api/config`);
  assert.equal(config.status, 200);
  assert.equal(config.headers.get("cache-control"), "no-store");
  assert.equal((await config.json()).enabled, false);
  for (const path of ["/llmx-api/sessions", "/llmx-api/assets/browser-conversation.js"]) {
    const response = await fetch(base + path, { method: "POST" });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).enabled, false);
  }
  for (const path of ["/", "/api/private", "/assets/household/private.js"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), "outside LLMx");
  }
  assert.equal(calls, 0);
});

test("fixed conversation and voice routes forward their method and exact body without browser credentials", async (t) => {
  const upstream = await serve(t, (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": "private=secret", "X-Private": "secret" });
      res.end(JSON.stringify({ path: req.url, method: req.method, headers: req.headers,
        body: Buffer.concat(chunks).toString("base64") }));
    });
  });
  const base = await relay(t, { householdUrl: upstream });
  const cases = [
    ["GET", "/family/sessions/recent", `${consumer}/family/sessions/recent`],
    ["POST", "/family/sessions", `${consumer}/family/sessions`],
    ["GET", `/family/sessions/${sessionId}/history`, `${consumer}/family/sessions/${sessionId}/history`],
    ["POST", `/family/sessions/${sessionId}/opening`, `${consumer}/family/sessions/${sessionId}/opening`],
    ["POST", `/family/sessions/${sessionId}/turns/text`, `${consumer}/family/sessions/${sessionId}/turns/text`],
    ["POST", `/family/sessions/${sessionId}/interrupt`, `${consumer}/family/sessions/${sessionId}/interrupt`],
    ["POST", `/family/sessions/${sessionId}/scene-receipts`, `${consumer}/family/sessions/${sessionId}/scene-receipts`],
    ["POST", `/sessions/${sessionId}/scene-receipts`, `${consumer}/sessions/${sessionId}/scene-receipts`],
    ["GET", "/sessions/recent", `${consumer}/sessions/recent`],
    ["POST", "/sessions", `${consumer}/sessions`],
    ["GET", `/sessions/${sessionId}/history`, `${consumer}/sessions/${sessionId}/history`],
    ["POST", `/sessions/${sessionId}/turns/text`, `${consumer}/sessions/${sessionId}/turns/text`],
    ["POST", `/sessions/${sessionId}/opening`, `${consumer}/sessions/${sessionId}/opening`],
    ["POST", `/sessions/${sessionId}/interrupt`, `${consumer}/sessions/${sessionId}/interrupt`],
    ["GET", "/voices", "/api/voix/catalog"],
    ["POST", "/transcribe", "/api/voix/transcribe"],
    ["POST", "/synthesize/stream", "/api/voix/synthesize/stream"],
  ];
  for (const [method, path, target] of cases) {
    const body = method === "POST" ? path === "/transcribe" ? Buffer.from([0, 255, 1, 128, 13, 10])
      : Buffer.from('{"text":"Bonjour, été !","turnId":"turn-123"}') : undefined;
    const contentType = path === "/transcribe" ? "audio/webm;codecs=opus" : "application/json";
    const response = await fetch(`${base}/llmx-api${path}?target=https://example.invalid/private`, { method, body,
      headers: { "Content-Type": contentType, Authorization: "Bearer browser-secret", Cookie: "personal=secret" } });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("x-private"), null);
    const observed = await response.json();
    assert.equal(observed.path, target, path);
    assert.equal(observed.method, method, path);
    assert.equal(observed.body, body?.toString("base64") ?? "", path);
    assert.equal(observed.headers.authorization, undefined);
    assert.equal(observed.headers.cookie, undefined);
    if (body) assert.equal(observed.headers["content-type"], contentType);
  }
});

test("shared audio assets use their exact upstream destinations through both public aliases", async (t) => {
  const upstream = await serve(t, (req, res) => {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(`// ${req.url}\nconst sample = "été";`);
  });
  const base = await relay(t, { householdUrl: upstream });
  for (const prefix of ["/llmx-api/assets", "/assets/household"]) {
    for (const asset of ["browser-conversation.js", "speech-language.js", "voice-capture-worklet.js", "voice-audio.js"]) {
      const target = asset === "voice-audio.js" ? "/api/voix/player.js" : `/assets/household/${asset}`;
      const response = await fetch(`${base}${prefix}/${asset}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "text/javascript; charset=utf-8");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(await response.text(), `// ${target}\nconst sample = "été";`);
    }
  }
});

test("unknown actions, session path escapes and unsupported methods never reach Household", async (t) => {
  let calls = 0;
  const upstream = await serve(t, (_req, res) => { calls++; res.end("unexpected"); });
  const base = await relay(t, { householdUrl: upstream });
  for (const [method, path] of [
    ["POST", "/llmx-api/config"], ["GET", "/llmx-api/sessions"],
    ["DELETE", `/llmx-api/sessions/${sessionId}/history`],
    ["POST", `/llmx-api/sessions/${sessionId}/history`],
    ["GET", `/llmx-api/sessions/${sessionId}/opening`],
    ["POST", `/llmx-api/sessions/${sessionId}/arbitrary`],
    ["GET", "/llmx-api/sessions/private%2fadmin/history"],
    ["GET", `/llmx-api/sessions/${"a".repeat(81)}/history`],
    ["GET", "/llmx-api/assets/private.js"],
    ["POST", "/llmx-api/assets/browser-conversation.js"],
    ["POST", "/assets/household/voice-audio.js"],
    ["GET", "/llmx-api/http://example.invalid/private"],
  ]) {
    const response = await fetch(base + path, { method });
    assert.equal(response.status, 404, `${method} ${path}`);
    await response.text();
  }
  assert.equal(calls, 0);
});

test("config unwraps the Household envelope and disables LLMx when the upstream route is unavailable", async (t) => {
  const config = { schemaVersion: 1, openingVersion: 1,
    capabilities: { openingTurn: true, interrupt: true, sceneContext: true } };
  let status = 200, payload = { ok: true, data: config };
  const upstream = await serve(t, (req, res) => {
    assert.equal(req.url, `${consumer}/config`);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  });
  const base = await relay(t, { householdUrl: upstream });
  for (const value of [{ ok: true, data: config }, config]) {
    payload = value;
    const response = await fetch(`${base}/llmx-api/config`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ...config, enabled: true });
  }
  for (const unavailableStatus of [404, 503]) {
    status = unavailableStatus;
    payload = { message: "upstream private detail" };
    const response = await fetch(`${base}/llmx-api/config`);
    assert.equal(response.status, 200);
    const unavailable = await response.json();
    assert.equal(unavailable.enabled, false);
    assert.ok(unavailable.message);
    assert.equal(JSON.stringify(unavailable).includes("upstream private detail"), false);
  }
});

test("invalid or explicitly disabled config never enables a conversation", async (t) => {
  const valid = { schemaVersion: 1, openingVersion: 1, capabilities: { openingTurn: true, interrupt: true } };
  let payload;
  const upstream = await serve(t, (_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  });
  const base = await relay(t, { householdUrl: upstream });
  for (const invalid of [null, [], "invalid", {}, { ok: false }, { data: "invalid" },
    { ...valid, schemaVersion: 2 }, { ...valid, openingVersion: 2 },
    { ...valid, capabilities: [] }, { ...valid, capabilities: { openingTurn: true } },
    { ...valid, capabilities: { openingTurn: true, interrupt: false } },
    { ...valid, enabled: false }, { data: { ...valid, enabled: false } }]) {
    payload = invalid;
    const response = await fetch(`${base}/llmx-api/config`);
    assert.equal(response.status, 200, JSON.stringify(invalid));
    assert.equal((await response.json()).enabled, false, JSON.stringify(invalid));
  }
});

test("upstream HTTP errors pass through while transport failures and redirects produce a local error", async (t) => {
  let mode = "http-error", redirectedCalls = 0;
  const upstream = await serve(t, (req, res) => {
    if (req.url === "/private") { redirectedCalls++; res.end("secret"); return; }
    if (mode === "disconnect") { req.socket.destroy(); return; }
    if (mode === "redirect") { res.writeHead(302, { Location: "/private" }); res.end(); return; }
    res.writeHead(409, { "Content-Type": "application/json", "Set-Cookie": "private=secret" });
    res.end('{"ok":false,"message":"Turn already active"}');
  });
  const base = await relay(t, { householdUrl: upstream });
  const conflict = await fetch(`${base}/llmx-api/sessions`, { method: "POST", body: "{}" });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.headers.get("set-cookie"), null);
  assert.deepEqual(await conflict.json(), { ok: false, message: "Turn already active" });
  for (const failure of ["disconnect", "redirect"]) {
    mode = failure;
    const response = await fetch(`${base}/llmx-api/voices`);
    assert.equal(response.status, 503, failure);
    assert.match((await response.json()).message, /Forge reste disponible/);
  }
  assert.equal(redirectedCalls, 0);
});

test("malformed JSON configuration cannot advertise an enabled conversation", async (t) => {
  const upstream = await serve(t, (_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"data":');
  });
  const base = await relay(t, { householdUrl: upstream });
  const response = await fetch(`${base}/llmx-api/config`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).enabled, false);
});

test("PCM NDJSON arrives before upstream completion, byte for byte with voice metadata", async (t) => {
  const first = '{"type":"format","encoding":"pcm_s16le","sampleRate":24000}\n';
  const rest = '{"type":"audio","pcm":"AP8BgA=="}\n{"type":"done"}\n';
  const finish = deferred();
  let ended = false;
  t.after(() => finish.resolve());
  const upstream = await serve(t, (req, res) => {
    req.resume();
    res.writeHead(200, { "Content-Type": "application/x-ndjson", "X-Voix-Provider": "local",
      "X-Voix-Voice": "voice-a", "X-Voix-Language": "fr-CA", "X-Private": "secret" });
    res.write(first);
    void finish.promise.then(() => { ended = true; res.end(rest); });
  });
  const base = await relay(t, { householdUrl: upstream });
  const response = await deadline(fetch(`${base}/llmx-api/synthesize/stream`, { method: "POST", body: '{"text":"Bonjour"}' }), "stream headers");
  assert.equal(response.headers.get("content-type"), "application/x-ndjson");
  assert.equal(response.headers.get("x-accel-buffering"), "no");
  assert.equal(response.headers.get("x-voix-provider"), "local");
  assert.equal(response.headers.get("x-voix-voice"), "voice-a");
  assert.equal(response.headers.get("x-voix-language"), "fr-CA");
  assert.equal(response.headers.get("x-private"), null);
  const reader = response.body.getReader();
  const head = await deadline(reader.read(), "first PCM frame while upstream is still open");
  assert.equal(head.done, false);
  assert.equal(Buffer.from(head.value).toString(), first);
  assert.equal(ended, false);
  finish.resolve();
  const chunks = [head.value];
  while (true) {
    const chunk = await deadline(reader.read(), "remaining PCM frames");
    if (chunk.done) break;
    chunks.push(chunk.value);
  }
  assert.equal(Buffer.concat(chunks).toString(), first + rest);
});

for (const phase of ["before response headers", "during PCM streaming"]) {
  test(`a downstream disconnect aborts the upstream request ${phase}`, async (t) => {
    const started = deferred(), closed = deferred();
    const upstream = await serve(t, (req, res) => {
      req.resume();
      res.once("close", () => closed.resolve());
      if (phase === "during PCM streaming") {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write('{"type":"audio","pcm":"AAAA"}\n');
      }
      started.resolve();
    });
    let upstreamSignal;
    const base = await relay(t, { householdUrl: upstream, fetchImpl: (url, options) => {
      upstreamSignal = options.signal;
      return fetch(url, options);
    } });
    const received = deferred();
    const request = http.request(`${base}/llmx-api/synthesize/stream`, { method: "POST" }, (response) => {
      response.once("data", () => received.resolve());
      response.on("error", () => {});
    });
    request.on("error", () => {});
    t.after(() => request.destroy());
    request.end('{"text":"Bonjour"}');
    await deadline(started.promise, "upstream dispatch");
    assert.equal(upstreamSignal.aborted, false);
    if (phase === "during PCM streaming") await deadline(received.promise, "downstream PCM frame");
    request.destroy();
    await deadline(closed.promise, "upstream connection cancellation");
    assert.equal(upstreamSignal.aborted, true);
  });
}

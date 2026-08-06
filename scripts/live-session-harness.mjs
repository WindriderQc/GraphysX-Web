import { Agent as HttpAgent, request as requestHttp } from "node:http";
import { Agent as HttpsAgent, request as requestHttps } from "node:https";

// Shared test client for the live-session smokes: an HTTP client plus a real SSE reader.
//
// Node-level rather than browser-level on purpose. The protocol — credentials, roles,
// revisions, sequence resume, idempotency — is server behaviour, and proving it through a
// headless browser would add a WebGL runtime, a build step and two minutes per assertion to
// something that is fundamentally three HTTP clients talking to one server. The browser
// smoke proves the *product* path; this proves the *protocol*.

// Native keep-alive agents retire closed sockets correctly and avoid exhausting Windows'
// loopback ephemeral ports during the long real-browser lifecycle. Twelve sockets preserve
// real request concurrency while forcing larger smoke bursts to queue on proven connections;
// keeping maxFreeSockets equal to maxSockets prevents the pool from churning the other 36.
// SSE borrows one of these proven sockets and removes it from the pool for its retained
// lifetime. Long browser smokes prewarm eight, leaving capacity for their static origin.
const requestAgentOptions = {
  keepAlive: true,
  keepAliveMsecs: 1_000,
  maxSockets: 12,
  maxTotalSockets: 12,
  maxFreeSockets: 12,
  scheduling: "lifo",
};
const requestHttpAgent = new HttpAgent(requestAgentOptions);
const requestHttpsAgent = new HttpsAgent(requestAgentOptions);

export function check(results, name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  return Boolean(ok);
}

export function report(results, label) {
  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${failed.length ? "FAIL" : "PASS"}  ${label}: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    for (const entry of failed) console.log(`  - ${entry.name}${entry.detail ? `: ${entry.detail}` : ""}`);
    process.exitCode = 1;
  }
  return failed.length === 0;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isClientMissionEventId = (value) =>
  typeof value === "string"
  && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(value)
  && !value.startsWith("me-system-");

/** Native Node HTTP request with a bounded keep-alive pool; never touches Undici. */
export function requestText(url, {
  method = "GET",
  headers = {},
  body,
  timeoutMs = 12_000,
} = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    let settled = false;
    let deadline = null;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      callback(value);
    };
    const fail = (error) => finish(reject, error instanceof Error ? error : new Error(String(error)));
    const request = (target.protocol === "https:" ? requestHttps : requestHttp)(target, {
      method,
      headers,
      agent: target.protocol === "https:" ? requestHttpsAgent : requestHttpAgent,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.once("aborted", () => fail(new Error(`Response aborted for ${method} ${target.pathname}`)));
      response.once("error", fail);
      response.on("end", () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) value.forEach((entry) => responseHeaders.append(name, entry));
          else if (value !== undefined) responseHeaders.set(name, value);
        }
        const status = response.statusCode ?? 0;
        finish(resolve, {
          status,
          ok: status >= 200 && status < 300,
          headers: responseHeaders,
          text: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    request.once("error", fail);
    deadline = setTimeout(() => {
      const error = new Error(`Request timed out after ${timeoutMs} ms for ${method} ${target.pathname}`);
      request.destroy(error);
      fail(error);
    }, timeoutMs);
    request.end(body);
  });
}

/** A real streaming response on its own socket; abort and replay are test behavior here. */
function openEventStream(url, { headers = {}, timeoutMs = 12_000, borrowRequestSocket = false } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    let settled = false;
    let deadline = null;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      callback(value);
    };
    const fail = (error) => finish(reject, error instanceof Error ? error : new Error(String(error)));
    const request = (target.protocol === "https:" ? requestHttps : requestHttp)(target, {
      method: "GET",
      headers,
      agent: borrowRequestSocket
        ? target.protocol === "https:" ? requestHttpsAgent : requestHttpAgent
        : false,
    }, (response) => finish(resolve, { request, response }));
    if (borrowRequestSocket) {
      // Node's documented long-lived request pattern: reuse the ticket POST's proven
      // connection, then remove the retained SSE socket from the finite-request pool.
      request.once("socket", (socket) => socket.emit("agentRemove"));
    }
    request.once("error", fail);
    deadline = setTimeout(() => {
      const error = new Error("Stream timed out after " + timeoutMs + " ms for " + target.pathname);
      request.destroy(error);
      fail(error);
    }, timeoutMs);
    request.end();
  });
}

/**
 * Windows can briefly refuse a newly assigned loopback port after a long browser run even
 * though `listen()` has completed. Prove the store is reachable before a smoke starts making
 * assertions so transport churn is not mistaken for a product/auth failure.
 */
export async function waitForStore(baseUrl, { timeoutMs = 12_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastError = null;
  while (Date.now() <= deadline) {
    try {
      const response = await requestText(`${baseUrl}/health`, { timeoutMs: Math.min(2_000, timeoutMs) });
      if (response.status === 200) return;
      lastError = new Error(`Store readiness returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    attempt += 1;
    await sleep(Math.min(1_000, 50 * 2 ** attempt));
  }
  throw lastError ?? new Error(`Store readiness failed for ${baseUrl}`);
}

/** One actor's view of a session: its credential, its stream, and what it has received. */
export function createActor(baseUrl, { credential = null, storeToken = null, origin = null } = {}) {
  let stream = null;
  const received = { ops: [], missions: [], resync: [], presence: [], members: [], hello: null, closed: null, revoked: null };
  let lastSeq = 0;

  const headers = (extra = {}) => {
    // These actors share the bounded native pool above. Node removes retired sockets from
    // that pool, while reusing healthy loopback sockets avoids long-smoke port exhaustion.
    const out = { "content-type": "application/json", ...extra };
    if (credential) out["x-graphysx-session"] = credential;
    if (storeToken) out.authorization = `Bearer ${storeToken}`;
    if (origin) out.origin = origin;
    return out;
  };

  const call = async (method, path, body, { rawBody = null, extraHeaders = {} } = {}) => {
    // Mission writes carry the same member/body-bound idempotency contract as scene ops.
    // Retry only when the validated key is the one this call will actually serialize.
    const retryableMissionEvent = method === "POST"
      && rawBody === null
      && isClientMissionEventId(body?.eventId)
      && (/^\/sessions\/[^/]+\/missions$/.test(path)
        || /^\/sessions\/[^/]+\/missions\/[^/]+\/events$/.test(path));
    const retryableTransport = method === "GET"
      || /\/stream-ticket$/.test(path)
      || (/\/ops$/.test(path) && typeof body?.opId === "string")
      || retryableMissionEvent;
    let response;
    let lastError = null;
    for (let attempt = 0; attempt < (retryableTransport ? 3 : 1); attempt += 1) {
      try {
        response = await requestText(`${baseUrl}${path}`, {
          method,
          headers: headers(extraHeaders),
          body: rawBody !== null ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
        });
        break;
      } catch (error) {
        lastError = error;
        if (!retryableTransport || attempt === 2) break;
        await sleep(100 * (attempt + 1));
      }
    }
    if (!response) {
      throw new Error(`Live-session harness ${method} ${path} transport failed: ${lastError?.message ?? "unknown transport error"}`, { cause: lastError });
    }
    const text = response.text;
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { error: text };
    }
    return { status: response.status, body: payload, headers: response.headers, text };
  };

  return {
    get credential() {
      return credential;
    },
    setCredential(value) {
      credential = value;
    },
    get lastSeq() {
      return lastSeq;
    },
    received,
    call,

    /**
     * Opens the SSE stream. Exchanges a member credential for a one-shot ticket first,
     * because EventSource cannot set headers and a long-lived secret does not belong in a
     * URL. `since` resumes from a sequence the caller already has.
     */
    async connect(sessionId, { since = 0 } = {}) {
      // Cleared before connecting so the wait below cannot be satisfied by the *previous*
      // connection's hello — which is exactly what a reconnect assertion would then be
      // reading, and it would pass while proving nothing.
      received.hello = null;
      const ticketResponse = await call("POST", `/sessions/${sessionId}/stream-ticket`, {});
      if (ticketResponse.status !== 201) throw new Error(`stream-ticket failed: ${ticketResponse.status} ${ticketResponse.text}`);
      const ticket = ticketResponse.body.ticket;
      // Let the Agent publish the completed ticket response as free before the SSE
      // borrows that exact proven connection and detaches it for its retained lifetime.
      await new Promise((resolve) => setImmediate(resolve));
      const opened = await openEventStream(
        `${baseUrl}/sessions/${sessionId}/stream?ticket=${encodeURIComponent(ticket)}&since=${since}`,
        { headers: { connection: "close", ...(origin ? { origin } : {}) }, borrowRequestSocket: true },
      );
      const status = opened.response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        const chunks = [];
        for await (const chunk of opened.response) chunks.push(Buffer.from(chunk));
        opened.request.destroy();
        throw new Error(`stream failed: ${status} ${Buffer.concat(chunks).toString("utf8")}`);
      }
      const streamDecoder = new TextDecoder();
      let buffer = "";
      const pump = (async () => {
        try {
          for await (const value of opened.response) {
            buffer += streamDecoder.decode(value, { stream: true });
            let split;
            while ((split = buffer.indexOf("\n\n")) !== -1) {
              const frame = buffer.slice(0, split);
              buffer = buffer.slice(split + 2);
              if (frame.startsWith(":")) continue; // heartbeat
              let event = "message";
              let data = "";
              for (const line of frame.split("\n")) {
                if (line.startsWith("event: ")) event = line.slice(7);
                else if (line.startsWith("data: ")) data += line.slice(6);
              }
              if (!data) continue;
              const parsed = JSON.parse(data);
              if (typeof parsed.seq === "number") lastSeq = Math.max(lastSeq, parsed.seq);
              if (event === "hello") received.hello = parsed;
              else if (event === "op") received.ops.push(parsed);
              else if (event === "mission") received.missions.push(parsed);
              else if (event === "resync") received.resync.push(parsed);
              else if (event === "presence") received.presence.push(parsed);
              else if (event === "member") received.members.push(parsed);
              else if (event === "closed") received.closed = parsed;
              else if (event === "revoked") received.revoked = parsed;
            }
          }
        } catch {
          // An aborted or severed stream is a normal end for this reader.
        }
      })();
      stream = {
        close: () => {
          opened.response.destroy();
          opened.request.destroy();
          return pump;
        },
      };
      // `fetch` resolves as soon as headers arrive; the hello frame is still in flight and
      // the pump is what parses it. Returning here without waiting handed callers a null
      // hello and turned every resume assertion into a null dereference.
      const deadline = Date.now() + 4000;
      while (!received.hello) {
        if (Date.now() > deadline) throw new Error("timed out waiting for the session hello frame");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return received.hello;
    },

    async disconnect() {
      if (!stream) return;
      const pump = stream.close();
      stream = null;
      await pump;
    },

    /** Waits until `predicate` holds over the received log, or fails loudly on timeout. */
    async waitFor(predicate, { timeoutMs = 4000, label = "condition" } = {}) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (predicate(received)) return true;
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
        await sleep(20);
      }
    },
  };
}

/**
 * Opens a session stream and then deliberately stops reading it.
 *
 * This is the one client behaviour `createActor` cannot express: its pump consumes the
 * socket continuously, which is exactly what keeps the server's send buffer empty. Here the
 * response is paused the instant its headers arrive and never iterated, so TCP's window
 * closes and the server's `ServerResponse.writableLength` grows with every broadcast — the
 * shape of a suspended laptop or a throttled background tab, which TCP never reports as a
 * close.
 *
 * `waitForClose()` never resumes the response: the test proves the server releases a
 * nonreader rather than making the client cooperate with its own cleanup.
 */
export async function openStalledStream(baseUrl, sessionId, { credential, origin = null, since = 0 } = {}) {
  const headers = { "content-type": "application/json", "x-graphysx-session": credential, ...(origin ? { origin } : {}) };
  let ticketResponse = null;
  let ticketError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      ticketResponse = await requestText(`${baseUrl}/sessions/${sessionId}/stream-ticket`, { method: "POST", headers, body: "{}" });
      break;
    } catch (error) {
      ticketError = error;
      if (attempt < 2) await sleep(100 * (attempt + 1));
    }
  }
  if (!ticketResponse) throw ticketError ?? new Error("stream-ticket transport failed");
  if (ticketResponse.status !== 201) throw new Error(`stream-ticket failed: ${ticketResponse.status} ${ticketResponse.text}`);
  const ticket = JSON.parse(ticketResponse.text).ticket;
  // Publish the completed ticket response as free, then borrow that proven connection and
  // detach it from the finite-request pool for the deliberately retained stream.
  await new Promise((resolve) => setImmediate(resolve));
  const opened = await openEventStream(
    `${baseUrl}/sessions/${sessionId}/stream?ticket=${encodeURIComponent(ticket)}&since=${since}`,
    { headers: { connection: "close", ...(origin ? { origin } : {}) }, borrowRequestSocket: true },
  );
  // Before any `data` listener or async iteration exists, so nothing has been consumed.
  opened.response.pause();
  const socket = opened.response.socket;
  const closed = new Promise((resolve) => {
    opened.response.once("aborted", () => resolve(true));
    opened.response.once("close", () => resolve(true));
    opened.response.once("error", () => resolve(true));
    socket?.once("close", () => resolve(true));
  });
  return {
    response: opened.response,
    socket,
    async waitForClose({ timeoutMs = 6_000 } = {}) {
      if (opened.response.destroyed || socket?.destroyed) return true;
      return Promise.race([closed, sleep(timeoutMs).then(() => false)]);
    },
    close() {
      opened.response.destroy();
      opened.request.destroy();
    },
  };
}

/**
 * The smallest valid `graphysx.agent-world/v2` document.
 *
 * Transform vectors are `[x, y, z]` tuples, not `{x, y, z}` objects. The store's document
 * layer does not look inside a transform, so an object-shaped position round-trips through
 * the server happily and is then rejected by the browser runtime with "position must
 * contain three finite numbers" — which is how this fixture was wrong for an afternoon
 * while every node-level assertion stayed green. Presence cursors ARE `{x, y, z}`: they are
 * session state with their own schema and never enter the document.
 */
export function seedDefinition(id = "live-session-fixture") {
  return {
    schema: "graphysx.agent-world/v2",
    id,
    label: "Live session fixture",
    environment: { ground: { size: 40 } },
    entities: [{ id: "anchor", type: "box", label: "Anchor", transform: { position: [0, 0.5, 0] } }],
  };
}

export const spawnCommand = (id) => ({
  op: "spawn",
  entity: { id, type: "box", label: id, transform: { position: [1, 0.5, 1] } },
});

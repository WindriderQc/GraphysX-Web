// Shared test client for the live-session smokes: an HTTP client plus a real SSE reader.
//
// Node-level rather than browser-level on purpose. The protocol — credentials, roles,
// revisions, sequence resume, idempotency — is server behaviour, and proving it through a
// headless browser would add a WebGL runtime, a build step and two minutes per assertion to
// something that is fundamentally three HTTP clients talking to one server. The browser
// smoke proves the *product* path; this proves the *protocol*.

const decoder = new TextDecoder();

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

/** One actor's view of a session: its credential, its stream, and what it has received. */
export function createActor(baseUrl, { credential = null, storeToken = null, origin = null } = {}) {
  let stream = null;
  const received = { ops: [], presence: [], members: [], hello: null, closed: null };
  let lastSeq = 0;

  const headers = (extra = {}) => {
    const out = { "content-type": "application/json", ...extra };
    if (credential) out["x-graphysx-session"] = credential;
    if (storeToken) out.authorization = `Bearer ${storeToken}`;
    if (origin) out.origin = origin;
    return out;
  };

  const call = async (method, path, body, { rawBody = null, extraHeaders = {} } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      cache: "no-store",
      headers: headers(extraHeaders),
      ...(rawBody !== null ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
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
      const controller = new AbortController();
      const response = await fetch(
        `${baseUrl}/sessions/${sessionId}/stream?ticket=${encodeURIComponent(ticket)}&since=${since}`,
        { headers: origin ? { origin } : {}, signal: controller.signal },
      );
      if (!response.ok) {
        controller.abort();
        throw new Error(`stream failed: ${response.status} ${await response.text()}`);
      }
      const reader = response.body.getReader();
      let buffer = "";
      const pump = (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
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
              else if (event === "presence") received.presence.push(parsed);
              else if (event === "member") received.members.push(parsed);
              else if (event === "closed") received.closed = parsed;
            }
          }
        } catch {
          // An aborted or severed stream is a normal end for this reader.
        }
      })();
      stream = {
        close: () => {
          controller.abort();
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

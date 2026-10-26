/**
 * `/propose` on the page's own origin, relayed to one AgentX Core proposal route.
 *
 * The browser never holds a key and never talks to Core directly: Core refuses state-changing
 * requests a browser marks as cross-site, and the roadmap forbids a key in the bundle. So, as
 * `diskx-server.mjs` does for the Data Toolbox reads, the dev server and the built preview
 * forward exactly one route — `POST /propose` — to the URL in `GRAPHYSX_PROPOSE_URL`
 * (`https://agentx.example/api/graphysx/propose`). Nothing else is reachable through it: one
 * method, one path, a JSON body bounded to what a `ProposalRequest` can be, a JSON reply bounded
 * to what the page will read. Without the variable the route answers that no provider is
 * configured and the page composes locally, which is the product's default.
 *
 * This is the development transport. The production delivery is documented in
 * `docs/NESTOR_PROPOSALS.md`; the public static deploy has no server and gets no relay.
 */

export const PROPOSE_PATH = "/propose";
/** Generous for a sentence plus a 60-entity summary of ids, types and labels. */
export const MAX_REQUEST_BYTES = 64 * 1024;
/** `PROVIDER_LIMITS.replyBytes` in src/coauthor-provider.ts. */
export const MAX_REPLY_BYTES = 256 * 1024;

export function resolveProposeTarget(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const url = new URL(text);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("GRAPHYSX_PROPOSE_URL must be an http(s) URL without credentials");
  }
  return url.href;
}

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Structural check of the body the page sends, so a stranger cannot use the relay as a generic POST. */
export function isProposalRequest(body) {
  if (!isRecord(body) || Object.keys(body).some((key) => !["request", "revision", "scene"].includes(key))) return false;
  if (typeof body.request !== "string" || body.request.length === 0 || body.request.length > 2_000) return false;
  if (!Number.isInteger(body.revision) || body.revision < 0) return false;
  const scene = body.scene;
  if (!isRecord(scene) || typeof scene.id !== "string" || typeof scene.label !== "string" || !Array.isArray(scene.entities)) return false;
  if (scene.entities.length > 60) return false;
  return scene.entities.every((entity) => isRecord(entity)
    && typeof entity.id === "string" && typeof entity.type === "string" && typeof entity.label === "string"
    && Object.keys(entity).length === 3);
}

function answer(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
  return true;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createProposalRelayRoute({ targetUrl = process.env.GRAPHYSX_PROPOSE_URL, fetchImpl = fetch, timeoutMs = 90_000 } = {}) {
  const target = resolveProposeTarget(targetUrl);
  return (req, res) => {
    if ((req.url ?? "").split("?")[0] !== PROPOSE_PATH) return false;
    if (req.method !== "POST") return answer(res, 405, { ok: false, reason: "The proposal route only accepts POST." });
    if (!target) return answer(res, 503, { ok: false, reason: "No proposal provider is configured on this server (GRAPHYSX_PROPOSE_URL is unset)." });
    void (async () => {
      let parsed;
      try {
        parsed = JSON.parse(await readBody(req, MAX_REQUEST_BYTES));
      } catch {
        return answer(res, 400, { ok: false, reason: "The request was not a JSON proposal request." });
      }
      if (!isProposalRequest(parsed)) return answer(res, 400, { ok: false, reason: "The request was not a proposal request." });
      try {
        const upstream = await fetchImpl(target, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(parsed),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await upstream.text();
        if (text.length > MAX_REPLY_BYTES) return answer(res, 502, { ok: false, reason: "The provider's reply was too large to relay." });
        let reply;
        try { reply = JSON.parse(text); } catch { return answer(res, 502, { ok: false, reason: `The provider answered ${upstream.status} without JSON.` }); }
        return answer(res, upstream.status, reply);
      } catch (error) {
        const timedOut = error instanceof Error && error.name === "TimeoutError";
        return answer(res, 504, { ok: false, reason: timedOut ? "The provider did not answer in time." : "The provider could not be reached." });
      }
    })();
    return true;
  };
}

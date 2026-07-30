// The three things every route in this server tree needs: shape a JSON response, read a
// size-capped JSON body, and throw an error the router's catch can turn into a status.
//
// This module exists because there were two copies of `send` and two of `readJsonBody`
// (scene-store.mjs and asset-store.mjs) and the CORS allow-headers list was written out
// twice. Adding one header meant editing both, and forgetting one produced a preflight
// failure that only reproduces cross-origin — the kind of bug that costs an afternoon.
// One definition, imported.

/** Methods the store answers. `DELETE` is real now that sessions and invites are revocable. */
export const CORS_ALLOW_METHODS = "GET, PUT, POST, DELETE, OPTIONS";

/**
 * Headers a browser client may send. `x-graphysx-session` carries a live-session member
 * credential; it is separate from `x-graphysx-token` (the store's shared write secret) on
 * purpose — they authorise different things and have different lifetimes.
 */
export const CORS_ALLOW_HEADERS = "authorization, x-graphysx-token, x-graphysx-session, content-type";

/** An Error the router turns into `{ error: message }` with this status. */
export function httpError(message, status = 400, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

export function sendJson(response, status, payload, cors = { "access-control-allow-origin": "*" }) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...cors,
    "access-control-allow-methods": CORS_ALLOW_METHODS,
    "access-control-allow-headers": CORS_ALLOW_HEADERS,
  });
  response.end(body);
}

/**
 * Reads a JSON body, refusing anything over `limitBytes`.
 *
 * Overflow stops *reading* and throws, so the router can answer 413. It deliberately does
 * not destroy the request: severing the socket takes the response with it, and the client
 * sees a bare "fetch failed" instead of the status that would tell it what it did wrong.
 * Abandoning the read applies backpressure, which is the part that matters — the process
 * never buffers more than the limit plus one chunk.
 */
export async function readJsonBody(request, limitBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limitBytes) throw httpError("Request body too large", 413);
    chunks.push(chunk);
  }
  if (size === 0) throw httpError("A JSON body is required", 400);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError("Request body must be valid JSON", 400);
  }
}

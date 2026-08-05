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
    // Most JSON overflow is bounded-drained before its 413, but other routes may reject early
    // and an upload can cross a hard drain boundary. Never reuse a socket that might still
    // carry rejected request bytes: they could be parsed as the next request, surfacing as a
    // bare "fetch failed" later. Closing after the response is harmless for a drained body and
    // required for an early rejection.
    ...(status === 413 ? { connection: "close" } : {}),
    ...cors,
    "access-control-allow-methods": CORS_ALLOW_METHODS,
    "access-control-allow-headers": CORS_ALLOW_HEADERS,
  });
  response.end(body);
}

const MAX_OVERFLOW_DRAIN_BYTES = 2 * 1024 * 1024;
const OVERFLOW_DRAIN_TIMEOUT_MS = 5_000;

/**
 * Reads a JSON body, refusing anything over `limitBytes`.
 *
 * On overflow, buffered chunks are released and a small, time-bounded discard window lets a
 * well-behaved client finish uploading before the router answers 413. Throwing directly from
 * a request's async iterator aborts the socket on Node 24, which turns that useful response
 * into an opaque ECONNRESET. Slow or abusive clients still lose the connection after five
 * seconds or two additional MiB, and the process never buffers beyond the configured limit.
 */
export async function readJsonBody(request, limitBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  let overflow = false;
  let overflowTimer;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (!overflow && size <= limitBytes) {
        chunks.push(chunk);
        continue;
      }
      if (!overflow) {
        overflow = true;
        chunks.length = 0;
        overflowTimer = setTimeout(() => {
          request.destroy(httpError("Request body too large", 413));
        }, OVERFLOW_DRAIN_TIMEOUT_MS);
        overflowTimer.unref?.();
      }
      if (size > limitBytes + MAX_OVERFLOW_DRAIN_BYTES) {
        const error = httpError("Request body too large", 413);
        request.destroy(error);
        throw error;
      }
    }
  } finally {
    if (overflowTimer) clearTimeout(overflowTimer);
  }
  if (overflow) throw httpError("Request body too large", 413);
  if (size === 0) throw httpError("A JSON body is required", 400);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError("Request body must be valid JSON", 400);
  }
}

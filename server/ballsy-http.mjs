import { isIP } from "node:net";
import { createBallsyRooms } from "./ballsy-rooms.mjs";

export const BALLSY_HTTP_LIMITS = Object.freeze({
  bodyBytes: 14_000, hostBodyBytes: 48 * 1024, bodyMs: 5000,
  addresses: 128, requestsPerSecond: 240, totalPerSecond: 1000,
  admissionsPerMinute: 10, totalAdmissionsPerMinute: 120,
  concurrent: 64, concurrentPerAddress: 16,
});
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const loopback = (address) => address === "::1" || /^(?:::ffff:)?127\.\d+\.\d+\.\d+$/.test(address ?? "");

/** Trust only this application's existing loopback nginx hop, never a browser's proxy headers. */
export function ballsyRequestContext(request, { trustedLoopbackProxy = false } = {}) {
  let protocol = request.socket.encrypted ? "https" : "http";
  let address = request.socket.remoteAddress ?? "unknown";
  if (trustedLoopbackProxy && loopback(address) && request.headers["x-forwarded-proto"] !== undefined) {
    const forwardedProtocol = request.headers["x-forwarded-proto"];
    const realAddress = request.headers["x-real-ip"];
    if (!["http", "https"].includes(forwardedProtocol) || typeof realAddress !== "string" || !isIP(realAddress)) {
      fail(403, "Relais d'origine invalide.");
    }
    protocol = forwardedProtocol;
    address = realAddress;
  }
  const host = request.headers.host;
  if (typeof host !== "string" || !host || /[\s/@?#\\]/.test(host)) fail(403, "Origine invalide.");
  let origin;
  try { origin = new URL(`${protocol}://${host}`).origin; }
  catch { fail(403, "Origine invalide."); }
  if (request.headers.origin && request.headers.origin !== origin) fail(403, "Origine refusée.");
  // X-Forwarded-Host and X-Forwarded-For are intentionally ignored. nginx already overwrites
  // Host, X-Forwarded-Proto and X-Real-IP; trusting a supplied forwarding chain is unnecessary.
  return { origin, address };
}

function readBody(request, limit, timeoutMs) {
  return new Promise((resolve, reject) => {
    let chunks = [], size = 0, settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chunks = [];
      request.removeListener("data", data);
      request.removeListener("end", end);
      request.removeListener("aborted", aborted);
      request.removeListener("error", broken);
      if (error) {
        // The route returns Connection: close for rejected bodies. Discard remaining bytes
        // until that response closes the socket, without retaining them in memory.
        request.once("error", () => {});
        request.resume();
        reject(error);
      } else resolve(value);
    };
    const broken = (error) => finish(error);
    const aborted = () => finish(Object.assign(new Error("Requête interrompue."), { status: 400 }));
    const data = (chunk) => {
      size += chunk.length;
      if (size > limit) finish(Object.assign(new Error("Requête trop grande."), { status: 413 }));
      else chunks.push(chunk);
    };
    const end = () => {
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { finish(Object.assign(new Error("JSON invalide."), { status: 400 })); }
    };
    const timer = setTimeout(() => finish(Object.assign(new Error("Requête incomplète."), { status: 408 })), timeoutMs);
    timer.unref?.();
    request.on("data", data);
    request.once("end", end);
    request.once("aborted", aborted);
    request.once("error", broken);
  });
}

/**
 * Bounded, ephemeral game relay. It never receives a store, store guard or store credential.
 * Same handler in the private preview and behind nginx's existing /store/ prefix.
 */
export function createBallsyRoute({ trustedLoopbackProxy = false, now = Date.now, bodyTimeoutMs = BALLSY_HTTP_LIMITS.bodyMs } = {}) {
  const rooms = createBallsyRooms({ now });
  const clients = new Map();
  const L = BALLSY_HTTP_LIMITS;
  const deadline = Number.isFinite(bodyTimeoutMs) ? Math.max(1, Math.min(L.bodyMs, bodyTimeoutMs)) : L.bodyMs;
  let inFlight = 0;
  let second = { at: now(), count: 0 }, minute = { at: now(), count: 0 };
  const claim = (address, admission) => {
    const at = now();
    for (const [key, entry] of clients) if (!entry.active && at - entry.seen >= 60_000) clients.delete(key);
    let client = clients.get(address);
    if (!client) {
      if (clients.size >= L.addresses) fail(429, "Relais occupé. Réessayez plus tard.");
      client = { seen: at, active: 0, second: { at, count: 0 }, minute: { at, count: 0 } };
      clients.set(address, client);
    }
    client.seen = at;
    if (at - second.at >= 1000) second = { at, count: 0 };
    if (at - minute.at >= 60_000) minute = { at, count: 0 };
    if (at - client.second.at >= 1000) client.second = { at, count: 0 };
    if (at - client.minute.at >= 60_000) client.minute = { at, count: 0 };
    if (++second.count > L.totalPerSecond || ++client.second.count > L.requestsPerSecond
      || inFlight >= L.concurrent || client.active >= L.concurrentPerAddress) fail(429, "Relais occupé. Réessayez plus tard.");
    if (admission && (++minute.count > L.totalAdmissionsPerMinute || ++client.minute.count > L.admissionsPerMinute)) {
      fail(429, "Réessayez dans une minute.");
    }
    inFlight++; client.active++;
    return () => { inFlight--; client.active--; };
  };
  return (request, response) => {
    if (!request.url?.startsWith("/api/ballsy/")) return false;
    response.setHeader("X-Ballsy-Relay", "1");
    response.setHeader("Referrer-Policy", "no-referrer");
    const send = (status, data) => {
      if (response.destroyed) return;
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
        ...(status >= 400 ? { connection: "close" } : {}) });
      response.end(JSON.stringify(data));
    };
    void (async () => {
      let release;
      try {
        const { origin, address } = ballsyRequestContext(request, { trustedLoopbackProxy });
        const route = new URL(request.url, origin).pathname;
        const method = request.method;
        const admission = method === "POST" && (route === "/api/ballsy/create" || route === "/api/ballsy/join");
        release = claim(address, admission);
        const auth = /^Bearer ([a-f0-9]{48})$/.exec(request.headers.authorization ?? "")?.[1];
        if (method === "GET" && route === "/api/ballsy/status") { send(200, { schema: "ballsy-room/v1" }); return; }
        if (admission) {
          const packet = await readBody(request, L.bodyBytes, deadline);
          send(200, route.endsWith("create") ? rooms.create() : rooms.join(packet?.code)); return;
        }
        const match = /^\/api\/ballsy\/([a-f0-9-]{36})\/(host|view|command|leave|close)$/.exec(route);
        if (!match) { send(404, { error: "Route absente." }); return; }
        const [, id, action] = match;
        if (method === "GET" && action === "view") { send(200, rooms.read(id, auth)); return; }
        if (method !== "POST" || action === "view") { send(405, { error: "Méthode refusée." }); return; }
        const packet = await readBody(request, action === "host" ? L.hostBodyBytes : L.bodyBytes, deadline);
        if (action === "host") send(200, rooms.publish(id, auth, packet));
        else if (action === "command") send(200, rooms.command(id, auth, packet));
        else if (action === "leave") send(200, rooms.leave(id, auth));
        else if (action === "close") send(200, rooms.close(id, auth));
      } catch (error) {
        const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
        send(status, { error: status < 500 ? error.message : "Relais indisponible." });
      } finally { release?.(); }
    })();
    return true;
  };
}

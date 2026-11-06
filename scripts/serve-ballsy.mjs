import { readFile } from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { startStaticServer } from "./static-server.mjs";
import { createBallsyRooms } from "../server/ballsy-rooms.mjs";

function body(req) {
  const limit = /^\/api\/ballsy\/[A-Za-z0-9-]+\/host$/.test(req.url ?? "") ? 48 * 1024 : 14_000;
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [], rejected = false;
    const timer = setTimeout(() => { rejected = true; reject(Object.assign(new Error("Requête incomplète."), { status: 408 })); }, 5000);
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) { rejected = true; chunks = []; clearTimeout(timer); reject(Object.assign(new Error("Requête trop grande."), { status: 413 })); }
      else if (!rejected) chunks.push(chunk);
    });
    req.once("end", () => { clearTimeout(timer); if (!rejected) { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(Object.assign(new Error("JSON invalide."), { status: 400 })); } } });
    req.once("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

export async function startBallsyServer({ root = fileURLToPath(new URL("../dist", import.meta.url)), host = "127.0.0.1", port = 4196, cert, key } = {}) {
  const rooms = createBallsyRooms();
  const attempts = new Map();
  const routeRequest = (req, res) => {
    res.setHeader("X-Ballsy-Relay", "1");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "xr-spatial-tracking=(self)");
    if (!req.url?.startsWith("/api/ballsy/")) return false;
    const send = (status, data) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(data)); };
    void (async () => {
      try {
        const expected = `${req.socket.encrypted ? "https" : "http"}://${req.headers.host}`;
        if (req.headers.origin && req.headers.origin !== expected) { send(403, { error: "Origine refusée." }); return; }
        const route = new URL(req.url, expected).pathname;
        const auth = /^Bearer ([a-f0-9]{48})$/.exec(req.headers.authorization ?? "")?.[1];
        const method = req.method;
        if (method === "GET" && route === "/api/ballsy/status") { send(200, { schema: "ballsy-room/v1" }); return; }
        if (method === "POST" && (route === "/api/ballsy/create" || route === "/api/ballsy/join")) {
          const ip = req.socket.remoteAddress, now = Date.now();
          for (const [key, entry] of attempts) if (now - entry.at > 60_000) attempts.delete(key);
          const limit = attempts.get(ip) ?? { at: now, count: 0 };
          if (++limit.count > 10 || attempts.size >= 128 && !attempts.has(ip)) { send(429, { error: "Réessayez dans une minute." }); return; }
          attempts.set(ip, limit);
          const packet = await body(req);
          send(200, route.endsWith("create") ? rooms.create() : rooms.join(packet.code)); return;
        }
        const match = /^\/api\/ballsy\/([a-f0-9-]{36})\/(host|view|command|leave|close)$/.exec(route);
        if (!match) { send(404, { error: "Route absente." }); return; }
        const [, id, action] = match;
        if (method === "GET" && action === "view") { send(200, rooms.read(id, auth)); return; }
        if (method !== "POST") { send(405, { error: "Méthode refusée." }); return; }
        const packet = await body(req);
        if (action === "host") send(200, rooms.publish(id, auth, packet));
        else if (action === "command") send(200, rooms.command(id, auth, packet));
        else if (action === "leave") send(200, rooms.leave(id, auth));
        else if (action === "close") send(200, rooms.close(id, auth));
        else send(405, { error: "Méthode refusée." });
      } catch (error) { send(error.status ?? 500, { error: error.status ? error.message : "Relais indisponible." }); }
    })();
    return true;
  };
  if (!!cert !== !!key) throw new Error("Provide both --cert and --key for HTTPS.");
  const app = await startStaticServer({ root: path.resolve(root), host: cert ? "127.0.0.1" : host, port: cert ? 0 : port, routeRequest });
  if (!cert) return app;
  // Reuse the proven static handler; only the listener/transport changes for private TLS.
  const handler = app.server.listeners("request")[0];
  await app.close();
  const server = https.createServer({ cert: await readFile(cert), key: await readFile(key) }, handler);
  server.keepAliveTimeout = 72_000;
  server.headersTimeout = 75_000;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  return { server, port: server.address().port, url: `https://${host}:${server.address().port}/`, close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { host: { type: "string", default: "127.0.0.1" }, port: { type: "string", default: "4196" }, cert: { type: "string" }, key: { type: "string" } } });
  const app = await startBallsyServer({ ...values, port: Number(values.port) });
  console.log(`Ballsy private preview: ${values.cert ? "https" : "http"}://${values.host}:${app.port}/ballsy.html`);
  const stop = async () => { await app.close(); process.exit(0); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}

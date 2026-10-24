/**
 * DiskX data route: the dev server's and the built preview's bridge to AgentX Data.
 *
 * The gateway at agentx.specialblend.icu answers `/api/data-toolbox/storage/*` without CORS
 * headers (measured 2026-10-23), so a browser page on another origin cannot call it directly.
 * This route forwards a fixed, read-only subset of that API under `/diskx-api/` on the page's
 * own origin, the way `llmx-server.mjs` fronts the Household conversation. Nothing else is
 * reachable through it: three GET endpoints, three whitelisted query parameters, no body.
 *
 * Without `DISKX_DATA_URL` the route answers `enabled: false` and the app shows its recorded
 * fixture — the public static deploy has no server at all, and must still open to a city.
 */
import { statfs } from "node:fs/promises";

/**
 * Parse `DISKX_VOLUMES`: a JSON array of `{ id, label?, roots, capacity?, free?, path?, note? }`.
 * `capacity`/`free` are declared bytes (a number, or "7.27 TiB" / "4.6 TB" style strings);
 * `path` names a local mount to measure with statfs instead, which is the right thing on the
 * host that actually mounts the volume. AgentX Data indexes files and has no capacity at all.
 */
export function parseDiskxVolumes(raw) {
  if (!raw) return [];
  let parsed;
  try { parsed = JSON.parse(raw); } catch (error) { throw new Error(`DISKX_VOLUMES is not JSON: ${error.message}`); }
  if (!Array.isArray(parsed)) throw new Error("DISKX_VOLUMES must be a JSON array");
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string") throw new Error(`DISKX_VOLUMES[${index}] needs an id`);
    const roots = Array.isArray(entry.roots) ? entry.roots.filter((root) => typeof root === "string") : [];
    if (!roots.length) throw new Error(`DISKX_VOLUMES[${index}] needs roots`);
    return {
      id: entry.id, label: typeof entry.label === "string" ? entry.label : entry.id, roots,
      capacity: entry.capacity === undefined ? null : parseBytes(entry.capacity, `DISKX_VOLUMES[${index}].capacity`),
      free: entry.free === undefined ? null : parseBytes(entry.free, `DISKX_VOLUMES[${index}].free`),
      path: typeof entry.path === "string" ? entry.path : null,
      note: typeof entry.note === "string" ? entry.note : null,
    };
  });
}

const UNITS = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, pb: 1e15, kib: 2 ** 10, mib: 2 ** 20, gib: 2 ** 30, tib: 2 ** 40, pib: 2 ** 50 };
export function parseBytes(value, what = "value") {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  const match = typeof value === "string" && /^\s*([\d.]+)\s*([kmgtp]?i?b)?\s*$/i.exec(value);
  if (!match) throw new Error(`${what} must be bytes or a size like "4.6 TB" / "7.27 TiB"`);
  const unit = (match[2] || "b").toLowerCase();
  return Math.round(Number(match[1]) * UNITS[unit]);
}

export async function resolveDiskxVolumes(declared, statfsImpl = statfs, now = () => new Date().toISOString()) {
  const volumes = [];
  for (const volume of declared) {
    let capacityBytes = volume.capacity;
    let freeBytes = volume.free;
    let source = "declared";
    if (volume.path) {
      try {
        const stats = await statfsImpl(volume.path);
        capacityBytes = stats.blocks * stats.bsize;
        freeBytes = stats.bavail * stats.bsize;
        source = "measured";
      } catch (error) {
        if (capacityBytes === null) { console.warn(`[diskx] cannot measure ${volume.path}: ${error.message}`); continue; }
      }
    }
    if (capacityBytes === null || freeBytes === null) continue;
    volumes.push({ id: volume.id, label: volume.label, roots: volume.roots, capacityBytes, freeBytes, source, measuredAt: now(), note: volume.note });
  }
  return volumes;
}

export function createDiskxRoute({ dataUrl = process.env.DISKX_DATA_URL, volumesSpec = process.env.DISKX_VOLUMES, fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const declaredVolumes = parseDiskxVolumes(volumesSpec);
  const origin = dataUrl ? new URL(dataUrl) : null;
  if (origin && (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash)) {
    throw new Error("DISKX_DATA_URL must be an http(s) origin, optionally with the storage API base path");
  }
  // Accept either the gateway origin or the full storage base; normalise to the storage base.
  const base = origin
    ? new URL(origin.pathname.replace(/\/+$/, "") === "" ? "/api/data-toolbox/storage/" : `${origin.pathname.replace(/\/+$/, "")}/`, origin)
    : null;
  const endpoints = new Map([
    ["summary", { target: "summary", params: [] }],
    ["tree", { target: "tree", params: ["root", "limit"] }],
    ["files", { target: "files", params: ["root", "limit", "sort"] }],
  ]);
  const json = (res, status, data) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(data));
  };
  return (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/diskx-api/")) return false;
    const name = url.pathname.slice("/diskx-api/".length);
    if (req.method !== "GET") { json(res, 405, { message: "Lecture seule." }); return true; }
    if (name === "config") {
      json(res, 200, { enabled: Boolean(base), source: base ? base.host : null, volumes: declaredVolumes.length });
      return true;
    }
    if (name === "volumes") {
      void resolveDiskxVolumes(declaredVolumes).then(
        (volumes) => json(res, 200, { volumes }),
        (error) => json(res, 500, { message: `Volumes: ${error?.message ?? error}` }),
      );
      return true;
    }
    const endpoint = endpoints.get(name);
    if (!endpoint) { json(res, 404, { message: "Point d’accès DiskX inconnu." }); return true; }
    if (!base) { json(res, 503, { enabled: false, message: "AgentX Data n’est pas configuré sur ce serveur." }); return true; }
    const target = new URL(endpoint.target, base);
    for (const key of endpoint.params) {
      const value = url.searchParams.get(key);
      if (value === null) continue;
      if (key === "limit" && !/^\d{1,5}$/.test(value)) { json(res, 400, { message: "limit invalide." }); return true; }
      if (key === "sort" && !/^[a-z_-]{1,24}$/i.test(value)) { json(res, 400, { message: "sort invalide." }); return true; }
      if (key === "root" && (value.length > 1024 || value.includes("\0"))) { json(res, 400, { message: "root invalide." }); return true; }
      target.searchParams.set(key, value);
    }
    void (async () => {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      res.once("close", () => { if (!res.writableEnded) abort.abort(); });
      try {
        const response = await fetchImpl(target, { signal: abort.signal, redirect: "error", headers: { accept: "application/json" } });
        const text = await response.text();
        if (res.destroyed) return;
        res.writeHead(response.ok ? 200 : 502, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(response.ok ? text : JSON.stringify({ message: `AgentX Data a répondu ${response.status}.` }));
      } catch (error) {
        if (!res.destroyed && !res.headersSent) json(res, 502, { message: abort.signal.aborted ? "AgentX Data ne répond pas." : `AgentX Data injoignable: ${error?.message ?? error}` });
      } finally {
        clearTimeout(timer);
      }
    })();
    return true;
  };
}

/**
 * DiskX data route: the dev server's and the built preview's bridge to AgentX Data.
 *
 * The gateway at agentx.specialblend.icu answers `/api/data-toolbox/storage/*` without CORS
 * headers (measured 2026-10-23), so a browser page on another origin cannot call it directly.
 * This route forwards a fixed, read-only subset of that API under `/diskx-api/` on the page's
 * own origin, the way `llmx-server.mjs` fronts the Household conversation. Nothing else is
 * reachable through it: five GET endpoints, five whitelisted query parameters, no body.
 * Volume capacity rides inside `summary` since the storage agent measures it (2026-10-25);
 * this server declares and measures nothing itself.
 *
 * Without `DISKX_DATA_URL` the route answers `enabled: false` and the app shows its recorded
 * fixture — the public static deploy has no server at all, and must still open to a city.
 */

export function createDiskxRoute({ dataUrl = process.env.DISKX_DATA_URL, fetchImpl = fetch, timeoutMs = 20000 } = {}) {
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
    ["janitor-strategy", { target: "../janitor/strategy/latest", params: [] }],
    ["janitor-groups", { target: "../janitor/strategy/latest/groups", params: ["offset", "limit", "sha256"] }],
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
      json(res, 200, { enabled: Boolean(base), source: base ? base.host : null, roots: ["/mnt/datalake", "/mnt/media"] });
      return true;
    }
    const endpoint = endpoints.get(name);
    if (!endpoint) { json(res, 404, { message: "Point d’accès DiskX inconnu." }); return true; }
    if (!base) { json(res, 503, { enabled: false, message: "AgentX Data n’est pas configuré sur ce serveur." }); return true; }
    const target = new URL(endpoint.target, base);
    for (const key of endpoint.params) {
      const value = url.searchParams.get(key);
      if (value === null) continue;
      if ((key === "limit" || key === "offset") && !/^\d{1,5}$/.test(value)) { json(res, 400, { message: "limit invalide." }); return true; }
      if (key === "sort" && !/^[a-z_-]{1,24}$/i.test(value)) { json(res, 400, { message: "sort invalide." }); return true; }
      if (key === "sha256" && !/^[0-9a-f]{64}$/.test(value)) { json(res, 400, { message: "sha256 invalide." }); return true; }
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

// Is this store actually usable by a browser?
//
//   node scripts/store-preflight.mjs --url https://graphysx.specialblend.ca/store
//   node scripts/store-preflight.mjs --url http://127.0.0.1:8788 --token "$GRAPHYSX_STORE_TOKEN"
//
// Run this before pointing a build at a store (VITE_GRAPHYSX_STORE_URL), and again after any
// nginx change. Every check here corresponds to a way the store can be reachable, return 200
// to a curl, and still be unusable for the thing it exists to do:
//
//   - Served over http:// while the app is https:// — every request blocked as mixed content.
//   - Running without GRAPHYSX_STORE_TOKEN — live sessions answer 503 by design, so
//     collaboration is silently off while scenes still load.
//   - Proxied without `proxy_buffering off` — the SSE stream returns 200 and then delivers
//     nothing until it closes. Status-code checks pass; collaboration does not work.
//
// That third one is why this script opens a real stream and times the first frame.
//
// What it CANNOT see: the bind address. Everything here arrives through the proxy, so a store
// listening on 0.0.0.0 looks exactly like one on 127.0.0.1. Check that on the host with
// `ss -tlnp | grep 8788`. The run warns about this rather than letting a green result be read
// as confirmation of something it never tested.

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const rawUrl = flag("url") ?? process.env.GRAPHYSX_STORE_URL;
const token = flag("token") ?? process.env.GRAPHYSX_STORE_TOKEN ?? null;
/** How long a correctly-unbuffered stream may take to deliver its hello frame. */
const STREAM_BUDGET_MS = Number(flag("stream-budget") ?? 5000);

if (!rawUrl) {
  console.error("usage: node scripts/store-preflight.mjs --url <store-url> [--token <token>]");
  process.exit(2);
}
const base = rawUrl.replace(/\/+$/, "");

const findings = [];
const record = (level, name, detail = "") => {
  findings.push({ level, name, detail });
  const mark = level === "pass" ? "PASS" : level === "warn" ? "WARN" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const get = async (path, init) => {
  const response = await fetch(`${base}${path}`, {
    cache: "no-store",
    ...init,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
  });
  return response;
};

try {
  // --- reachable, and over a scheme a browser will actually use ----------------------------

  if (base.startsWith("http://") && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(base)) {
    record("fail", "store is served over plain http",
      "an https:// page cannot fetch it — the browser blocks mixed content before any code runs");
  } else if (base.startsWith("/")) {
    record("pass", "same-origin path", `${base} inherits the site's TLS and needs no CORS allowlist`);
  } else {
    record("pass", "scheme is usable from a browser", base.split("://")[0]);
  }

  let health;
  try {
    const response = await get("/health");
    const body = await response.text();
    // The SPA shell, not JSON. nginx's `location /` has `try_files $uri $uri/ /index.html`, so
    // when the /store/ proxy block is missing every store path quietly returns the app's HTML
    // instead of 404 — and the app then behaves as though no store exists. It is the most
    // likely first state of this setup and deserves to be named rather than surfaced as a
    // JSON parse error.
    if (/^\s*<(!doctype|html)/i.test(body)) {
      // Name the path actually tested rather than assuming it is `/store`: this script is
      // pointed at local stores and alternate mounts too, and telling someone their /store
      // proxy is missing when they never asked for one wastes the trip.
      const mount = new URL(base, "http://placeholder").pathname.replace(/\/+$/, "") || "/";
      record("fail", `no store is proxied at ${mount}`,
        "this path returns an HTML page, not JSON — nginx is falling through to its SPA "
        + "try_files. Install the proxy block from ops/nginx/graphysx.specialblend.ca "
        + "(it mounts /store/) and reload nginx");
      throw new Error("proxy not installed");
    }
    try {
      health = JSON.parse(body);
    } catch {
      record("fail", "store returned something that is not JSON", `status ${response.status}, ${body.slice(0, 80)}`);
      throw new Error("non-JSON health");
    }
    record(response.ok ? "pass" : "fail", "store answers /health", `status ${response.status}`);
  } catch (error) {
    if (!/proxy not installed|non-JSON health/.test(String(error?.message))) {
      record("fail", "store is unreachable", error instanceof Error ? error.message : String(error));
    }
    throw error;
  }

  // --- configured for collaboration ----------------------------------------------------------

  record(health.authenticated ? "pass" : "fail", "a store token is configured",
    health.authenticated ? "" : "set GRAPHYSX_STORE_TOKEN — without it live sessions refuse to run");
  record(health.sessions?.enabled ? "pass" : "fail", "live sessions are enabled",
    health.sessions?.enabled ? `${health.sessions.open} open` : "sessions answer 503 in this configuration");
  record(health.results ? "pass" : "warn", "the results layer is present",
    health.results ? `${health.results.boards} board(s), ${health.results.trust}` : "no results section on /health");

  // --- writes are actually gated ---------------------------------------------------------------

  const unauthenticated = await fetch(`${base}/scenes/preflight-probe`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ definition: { schema: "graphysx.agent-world/v2", id: "x", label: "x", entities: [] } }),
  });
  record(unauthenticated.status === 401 ? "pass" : "fail", "an unauthenticated write is refused",
    `status ${unauthenticated.status}${unauthenticated.status === 201 ? " — this store is open to anyone who can reach it" : ""}`);

  // --- the check that catches a buffering proxy --------------------------------------------------
  //
  // Opens a real stream and times the first frame. Deliberately read-only: it streams a scene
  // that already exists rather than creating one, because a preflight should not leave litter
  // in a production store. With no scenes yet, it says so instead of quietly passing.

  const scenes = await (await get("/scenes")).json().catch(() => null);
  const sample = scenes?.scenes?.[0]?.name ?? null;
  if (!sample) {
    record("warn", "SSE delivery unverified", "no stored scene to stream; re-run once one exists");
  } else {
    const controller = new AbortController();
    const startedAt = Date.now();
    const timer = setTimeout(() => controller.abort(), STREAM_BUDGET_MS);
    try {
      const response = await fetch(`${base}/scenes/${encodeURIComponent(sample)}/stream`, {
        signal: controller.signal,
        headers: { accept: "text/event-stream" },
      });
      const buffering = response.headers.get("x-accel-buffering");
      const reader = response.body.getReader();
      const { value } = await reader.read();
      const elapsed = Date.now() - startedAt;
      const frame = new TextDecoder().decode(value ?? new Uint8Array());
      controller.abort();
      record(frame.includes("event: hello") ? "pass" : "fail", "the event stream delivers immediately",
        `first frame in ${elapsed}ms${buffering ? ` (x-accel-buffering: ${buffering})` : ""}`);
    } catch (error) {
      record("fail", "the event stream delivered nothing in time",
        `no frame within ${STREAM_BUDGET_MS}ms — a buffering proxy looks exactly like this; `
        + "set proxy_buffering off (see ops/nginx/graphysx.specialblend.ca)");
      void error;
    } finally {
      clearTimeout(timer);
    }
  }

  // --- token-holding client can actually write ---------------------------------------------------

  if (token) {
    const authorised = await get("/scenes", { method: "GET" });
    record(authorised.ok ? "pass" : "warn", "the supplied token is accepted", `status ${authorised.status}`);
  } else {
    record("warn", "no token supplied", "read-only preflight; pass --token to check the write path end to end");
  }
} catch {
  // Individual checks have already reported; this only stops the run.
}

// What this script structurally cannot see.
//
// Every check above reaches the store the way a browser does — through the proxy. That makes
// it blind to how the store is *bound*: a process listening on 0.0.0.0 and one listening on
// 127.0.0.1 are indistinguishable from the far side of nginx. A green run here was once read
// as confirmation that a loopback fix had landed, and it was not evidence of that at all.
if (!base.startsWith("http://127.0.0.1") && !base.startsWith("http://localhost")) {
  record("warn", "the bind address is not observable from here",
    "run `ss -tlnp | grep 8788` on the host — 127.0.0.1:8788 is contained, 0.0.0.0:8788 is "
    + "reachable on every interface with only the firewall in the way");
}

const failed = findings.filter((entry) => entry.level === "fail");
const warned = findings.filter((entry) => entry.level === "warn");
console.log(`\n${failed.length ? "FAIL" : "PASS"}  store-preflight: ${findings.length - failed.length - warned.length} passed, ${warned.length} warning(s), ${failed.length} failure(s)`);
if (failed.length) {
  console.log("\nThis store is not ready to be pointed at by a build. See docs/DEPLOYING_THE_STORE.md.");
  process.exitCode = 1;
}

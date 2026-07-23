// Store auth smoke: node-only, no browser. Proves the token gate, the CORS allowlist and
// the datalake 503 behave — and, just as deliberately, that a store started *without* a
// token behaves exactly as it always has, because every existing smoke and every LAN
// deployment runs in that mode.
//
// In-process on purpose, same as smoke-scene-store.mjs: `startSceneStore({ token })`
// exercises the identical guard the CLI builds from GRAPHYSX_STORE_TOKEN, without the
// smoke having to manage child processes.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startSceneStore } from "../server/scene-store.mjs";
import { putScene } from "../tools/graphysx-scene-agent.mjs";

const TOKEN = "smoke-token-3f9c";
const ORIGIN = "http://allowed.test";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}

const definition = {
  schema: "graphysx.agent-world/v2",
  id: "auth-smoke",
  label: "Auth smoke",
  entities: [],
};

/** PUT the smoke scene, with the token presented the way the test wants. */
function put(url, token, header = "authorization") {
  return fetch(`${url}/scenes/auth-smoke`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(token ? (header === "authorization" ? { authorization: `Bearer ${token}` } : { [header]: token }) : {}),
    },
    body: JSON.stringify({ definition }),
  });
}

// A long browser suite can leave Windows' loopback stack briefly unable to connect to a freshly
// assigned ephemeral port even though listen() has completed. Probe the read-only endpoint with
// bounded backoff so that transport churn cannot masquerade as an auth failure; every assertion
// below still uses its original request and status contract.
async function waitForStore(url) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(`${url}/scenes`, { headers: { connection: "close" } });
      if (response.status === 200) return;
      lastError = new Error(`Store readiness returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(400, 50 * 2 ** attempt)));
  }
  throw lastError ?? new Error("Store readiness failed");
}

let store = null;
let dir = null;
let datalake = null;

try {
  dir = await mkdtemp(path.join(tmpdir(), "graphysx-auth-"));
  datalake = await mkdtemp(path.join(tmpdir(), "graphysx-lake-"));
  await writeFile(path.join(datalake, "sample.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  // --- token mode, datalake configured -----------------------------------------
  store = await startSceneStore({ port: 0, dir, token: TOKEN, origins: ORIGIN, datalakeDir: datalake });
  await waitForStore(store.url);

  let r = await put(store.url, null);
  check("PUT without token -> 401", r.status === 401, `got ${r.status}`);
  r = await put(store.url, "wrong-token");
  check("PUT with wrong token -> 401", r.status === 401, `got ${r.status}`);
  r = await put(store.url, TOKEN);
  check("PUT with bearer token -> 201", r.status === 201, `got ${r.status}`);
  r = await put(store.url, TOKEN, "x-graphysx-token");
  check("PUT with x-graphysx-token -> 200", r.status === 200, `got ${r.status}`);

  r = await fetch(`${store.url}/scenes/auth-smoke`);
  check("GET scene without token -> 200 (reads stay open)", r.status === 200, `got ${r.status}`);
  r = await fetch(`${store.url}/scenes`);
  check("GET /scenes without token -> 200", r.status === 200, `got ${r.status}`);
  r = await fetch(`${store.url}/scenes/auth-smoke`, { method: "OPTIONS" });
  check("OPTIONS preflight without token -> 204", r.status === 204, `got ${r.status}`);

  r = await fetch(`${store.url}/datalake`);
  check("GET /datalake without token -> 401", r.status === 401, `got ${r.status}`);
  r = await fetch(`${store.url}/datalake`, { headers: { authorization: `Bearer ${TOKEN}` } });
  const listing = r.status === 200 ? await r.json() : null;
  check(
    "GET /datalake with token -> 200 + listing",
    r.status === 200 && Array.isArray(listing?.files) && listing.files.some((f) => f.name === "sample.png"),
    `got ${r.status}`,
  );
  r = await fetch(`${store.url}/datalake/file?path=sample.png`);
  check("GET /datalake/file without token -> 401", r.status === 401, `got ${r.status}`);
  r = await fetch(`${store.url}/datalake/file?path=sample.png`, { headers: { "x-graphysx-token": TOKEN } });
  await r.arrayBuffer().catch(() => undefined);
  check("GET /datalake/file with token -> 200", r.status === 200, `got ${r.status}`);

  r = await fetch(`${store.url}/assets/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "sample.png" }),
  });
  check("POST /assets/import without token -> 401", r.status === 401, `got ${r.status}`);
  r = await fetch(`${store.url}/assets/import`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ path: "sample.png" }),
  });
  check("POST /assets/import with token -> 201", r.status === 201, `got ${r.status}`);
  r = await fetch(`${store.url}/assets/upload?filename=x.png`, { method: "POST", body: "not-empty" });
  check("POST /assets/upload without token -> 401", r.status === 401, `got ${r.status}`);
  r = await fetch(`${store.url}/assets/sample`, { method: "DELETE" });
  check("DELETE /assets/:id without token -> 401", r.status === 401, `got ${r.status}`);

  // The agent tool reads the same env var the server does.
  process.env.GRAPHYSX_STORE_TOKEN = TOKEN;
  const seeded = await putScene(store.url, "tool-scene", definition).then(
    (result) => result,
    (error) => error,
  );
  delete process.env.GRAPHYSX_STORE_TOKEN;
  check(
    "tools/graphysx-scene-agent sends $GRAPHYSX_STORE_TOKEN",
    typeof seeded?.revision === "number",
    String(seeded?.message ?? seeded),
  );

  // CORS allowlist: echo the allowed origin, starve the rest, vary on both.
  r = await fetch(`${store.url}/scenes`, { headers: { origin: ORIGIN } });
  check(
    "allowlisted origin is echoed + vary: origin",
    r.headers.get("access-control-allow-origin") === ORIGIN &&
      (r.headers.get("vary") ?? "").toLowerCase().includes("origin"),
    `acao=${r.headers.get("access-control-allow-origin")}, vary=${r.headers.get("vary")}`,
  );
  r = await fetch(`${store.url}/scenes`, { headers: { origin: "http://evil.test" } });
  check(
    "disallowed origin gets no allow-origin header",
    r.headers.get("access-control-allow-origin") === null,
    `acao=${r.headers.get("access-control-allow-origin")}`,
  );

  await store.close();
  store = null;

  // --- token mode, datalake NOT configured -------------------------------------
  store = await startSceneStore({ port: 0, dir, token: TOKEN, datalakeDir: null });
  await waitForStore(store.url);
  r = await fetch(`${store.url}/datalake`, { headers: { authorization: `Bearer ${TOKEN}` } });
  check("unconfigured datalake -> 503 even with token", r.status === 503, `got ${r.status}`);
  r = await fetch(`${store.url}/assets/import`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ path: "sample.png" }),
  });
  check("import without datalake -> 503", r.status === 503, `got ${r.status}`);
  await store.close();
  store = null;

  // --- compat mode: no token, everything open as before ------------------------
  store = await startSceneStore({ port: 0, dir, token: null, origins: null, datalakeDir: null });
  await waitForStore(store.url);
  r = await put(store.url, null);
  check("compat mode: PUT without token -> 200", r.status === 200, `got ${r.status}`);
  r = await fetch(`${store.url}/scenes`, { headers: { origin: "http://anywhere.test" } });
  check(
    "compat mode: allow-origin stays *",
    r.headers.get("access-control-allow-origin") === "*",
    `acao=${r.headers.get("access-control-allow-origin")}`,
  );
} catch (error) {
  check("no fatal error", false, error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  if (store) await store.close().catch(() => undefined);
  if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  if (datalake) await rm(datalake, { recursive: true, force: true }).catch(() => undefined);
}

const failed = results.filter((result) => !result.ok);
console.log(
  failed.length === 0
    ? `\nPASS  smoke-store-auth: all ${results.length} checks passed`
    : `\nFAIL  smoke-store-auth: ${failed.length}/${results.length} checks failed`,
);
process.exit(failed.length === 0 ? 0 : 1);

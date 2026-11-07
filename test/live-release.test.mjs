import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyLiveRelease } from "../scripts/smoke-live-release.mjs";
import { createBallsyRoute } from "../server/ballsy-http.mjs";

const sha = "a".repeat(40);
const vrEntry = "assets/vr-lab-app-Bu1ld_42.js";
const xrAssets = ["assets/xr/profiles/profilesList.json", "assets/xr/profiles/generic-trigger/profile.json", "assets/xr/profiles/generic-trigger/controller.gltf"];
const statusPath = "store/api/ballsy/status";
const foreignOrigin = "https://ballsy-origin-check.invalid";
async function fixture(t, override = () => null, { prefix = "", mutateBuild = () => {}, statusHandler } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "graphysx-http-release-"));
  const files = new Map([
    ["index.html", ['<div id="app"></div><script type="module" src="./assets/main.js"></script><link rel="stylesheet" href="./assets/main.css"><link rel="modulepreload" href="./assets/shared.js">', "text/html"]],
    ["assets/main.js", ['import "./shared.js"; const openVr = () => import(`./vr-lab-app-Bu1ld_42.js`);', "text/javascript"]],
    ["assets/shared.js", ['export const loaded = true;', "application/javascript"]],
    ["assets/main.css", ['body { margin: 0; }', "text/css"]],
    ["ballsy.html", ['<div id="ballsy"></div><script type="module" src="./assets/ballsy.js"></script><link rel="stylesheet" href="./assets/ballsy.css"><link rel="modulepreload" href="./assets/shared.js">', "text/html"]],
    ["assets/ballsy.js", ['import "./shared.js"; export const game = "ballsy";', "text/javascript"]],
    ["assets/ballsy.css", ['#ballsy { margin: 0; }', "text/css"]],
    ["ballsy-giant.html", ['<div id="giant"></div><script type="module" src="./assets/giant.js"></script><link rel="stylesheet" href="./assets/giant.css"><link rel="modulepreload" href="./assets/shared.js">', "text/html"]],
    ["assets/giant.js", ['import "./shared.js"; export const game = "giant";', "application/javascript; charset=utf-8"]],
    ["assets/giant.css", ['#giant { margin: 0; }', "text/css; charset=utf-8"]],
    [vrEntry, ['export const mountVrLab = () => {};', "text/javascript"]],
    [xrAssets[0], [JSON.stringify({ "generic-trigger": { path: "generic-trigger/profile.json" } }), "application/json"]],
    [xrAssets[1], [JSON.stringify({ profileId: "generic-trigger", layouts: {} }), "application/json; charset=utf-8"]],
    [xrAssets[2], [JSON.stringify({ asset: { version: "2.0" }, buffers: [] }), "model/gltf+json"]],
    ["release.json", [JSON.stringify({ schema: "graphysx.release/v1", sha }), "application/json"]],
  ]);
  for (const [file, [content]] of files) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  }
  mutateBuild(dir, files);
  files.set(statusPath, [JSON.stringify({ schema: "ballsy-room/v1" }), "application/json; charset=utf-8"]);
  const requests = [];
  const requestDetails = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const file = url.pathname.slice(`/${prefix}`.length);
    requests.push(file);
    requestDetails.push({ method: req.method, url: url.pathname, sha: url.searchParams.get("sha"), cacheControl: req.headers["cache-control"],
      origin: req.headers.origin, forwardedProtocol: req.headers["x-forwarded-proto"], realAddress: req.headers["x-real-ip"] });
    if (file === statusPath && statusHandler) { statusHandler(req, res); return; }
    const modified = override(file, requests, req);
    const defaultStatus = file === statusPath && req.headers.origin !== `http://${req.headers.host}`
      ? [JSON.stringify({ error: "Origin refused" }), "application/json", 403] : null;
    const [content, mime, status = 200, headers = {}] = modified ?? defaultStatus ?? files.get(file) ?? ["missing", "text/plain", 404];
    res.writeHead(status, { "content-type": mime, ...headers });
    res.end(content);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    assert.match(path.basename(dir), /^graphysx-http-release-/);
    rmSync(dir, { recursive: true, force: true });
  });
  return { options: { base: `http://127.0.0.1:${server.address().port}/${prefix}`, expectedSha: sha, buildDir: dir, attempts: 1, retryMs: 0 }, requests, requestDetails, files };
}

test("HTTP release check verifies exact index/Ballsy entries, VR entry/controller assets and read-only relay status", async t => {
  const { options, requests, requestDetails, files } = await fixture(t);
  const receipt = await verifyLiveRelease(options);
  assert.equal(receipt.sha, sha);
  assert.equal(receipt.files.length, 14);
  assert.ok(receipt.files.every(file => file.bytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256)));
  assert.deepEqual(new Set(requests), new Set(files.keys()));
  assert.equal(requests.filter(file => file === "assets/shared.js").length, 1);
  assert.deepEqual(receipt.services, [{ path: statusPath, method: "GET", schema: "ballsy-room/v1",
    sameOrigin: { origin: new URL(options.base).origin, status: 200, allowOrigin: false },
    foreignOrigin: { origin: foreignOrigin, status: 403, allowOrigin: false },
  }]);
  assert.ok(requestDetails.every(request => request.method === "GET" && request.sha === sha && request.cacheControl === "no-cache"));
  assert.deepEqual(requestDetails.filter(request => request.url === `/${statusPath}`).map(request => request.origin), [new URL(options.base).origin, foreignOrigin]);
  assert.ok(requestDetails.every(request => request.forwardedProtocol === undefined && request.realAddress === undefined));
  assert.match(receipt.scope, /Not all assets, gameplay, browser or visual acceptance/);
});

test("a stale release has a bounded manifest retry and never reaches entry acceptance", async t => {
  const { options, requests } = await fixture(t, file => file === "release.json"
    ? [JSON.stringify({ schema: "graphysx.release/v1", sha: "b".repeat(40) }), "application/json"] : null);
  await assert.rejects(verifyLiveRelease({ ...options, attempts: 2 }), /never became authoritative/);
  assert.deepEqual(requests, ["release.json", "release.json"]);
});

for (const [label, file, replacement, error] of [
  ["old HTML despite a current release manifest", "index.html", ["old index", "text/html"], /differs from the release build/],
  ["a missing bundle", "assets/main.js", ["missing", "text/plain", 404], /HTTP 404/],
  ["SPA fallback masquerading as a bundle", "assets/main.js", ["<html>fallback</html>", "text/html"], /unexpected content type/],
  ["changed bundle bytes with a valid MIME type", "assets/main.js", ["old code", "text/javascript"], /differs from the release build/],
  ["CSS served with a browser-incompatible MIME type", "assets/main.css", ["body { margin: 0; }", "text/plain"], /unexpected content type/],
]) {
  test(`HTTP release check rejects ${label}`, async t => {
    const { options, requests } = await fixture(t, requested => requested === file ? replacement : null);
    await assert.rejects(verifyLiveRelease({ ...options, attempts: 3 }), error);
    assert.equal(requests.filter(requested => requested === file).length, 1, "entry failures must not retry");
    assert.equal(requests.filter(requested => requested === "release.json").length, 1);
  });
}

for (const file of ["ballsy.html", "ballsy-giant.html"]) {
  test(`${file} cannot silently fall back to the current index with HTTP 200`, async t => {
    const { options, files } = await fixture(t, requested => requested === file ? files.get("index.html") : null);
    await assert.rejects(verifyLiveRelease(options), new RegExp(`${file}: served content differs`));
  });
}

for (const [file, replacement, error] of [
  ["ballsy.html", ["missing", "text/plain", 404], /HTTP 404/],
  ["ballsy-giant.html", ["<html>old</html>", "text/plain"], /unexpected content type/],
  ["assets/ballsy.js", ["old game", "text/javascript"], /differs from the release build/],
  ["assets/giant.js", ["<html>fallback</html>", "text/html"], /unexpected content type/],
  ["assets/shared.js", ["old shared", "application/javascript"], /differs from the release build/],
  ["assets/ballsy.css", ["old styles", "text/css"], /differs from the release build/],
  ["assets/giant.css", ["old styles", "text/plain"], /unexpected content type/],
  [vrEntry, ["missing", "text/plain", 404], /HTTP 404/],
  [vrEntry, ["<html>fallback</html>", "text/html"], /unexpected content type/],
  [vrEntry, ["old VR code", "text/javascript"], /differs from the release build/],
  [xrAssets[0], ["<html>fallback</html>", "text/html"], /unexpected content type/],
  [xrAssets[1], ['{"profileId":"old"}', "application/json"], /differs from the release build/],
  [xrAssets[2], ["<html>fallback</html>", "application/octet-stream"], /differs from the release build/],
  [xrAssets[2], ["<html>fallback</html>", "text/html"], /unexpected content type/],
  [statusPath, ["missing", "text/plain", 404], /HTTP 404/],
  [statusPath, ["<html>fallback</html>", "text/html"], /unexpected content type/],
  [statusPath, ['{"schema":"ballsy-room/v1"}', "text/plain"], /unexpected content type/],
  [statusPath, ['{"schema":"ballsy-room/v0"}', "application/json"], /unexpected Ballsy relay schema/],
  [statusPath, ['{"error":"disabled"}', "application/json"], /unexpected Ballsy relay schema/],
  [statusPath, ["not JSON", "application/json"], /JSON/],
]) {
  test(`HTTP release check rejects ${file} with ${replacement[1]} and ${replacement[0]}`, async t => {
    const { options, requests } = await fixture(t, requested => requested === file ? replacement : null);
    await assert.rejects(verifyLiveRelease({ ...options, attempts: 3 }), error);
    assert.equal(requests.filter(requested => requested === file).length, 1);
    assert.equal(requests.filter(requested => requested === "release.json").length, 1);
  });
}

for (const mime of ["application/json", "application/octet-stream"]) {
  test(`the exact glTF bytes can use the compatible ${mime} content type`, async t => {
    const { options, files } = await fixture(t, file => file === xrAssets[2] ? [files.get(file)[0], mime] : null);
    assert.equal((await verifyLiveRelease(options)).files.length, 14);
  });
}

for (const [label, foreign, replacement, error] of [
  ["same-origin status must be exactly 200", false, ['{"schema":"ballsy-room/v1"}', "application/json", 201], /HTTP 201 \(expected 200\)/],
  ["same-origin rejection catches proxy misconfiguration", false, ['{"error":"Origin refused"}', "application/json", 403], /HTTP 403 \(expected 200\)/],
  ["foreign-origin acceptance is forbidden", true, ['{"schema":"ballsy-room/v1"}', "application/json"], /HTTP 200 \(expected 403\)/],
  ["foreign-origin refusal must be exactly 403", true, ['{"error":"No authorization"}', "application/json", 401], /HTTP 401 \(expected 403\)/],
  ["foreign-origin HTML refusal is not the JSON relay", true, ["<html>Forbidden</html>", "text/html", 403], /unexpected content type/],
  ["foreign-origin malformed JSON is rejected", true, ["not JSON", "application/json", 403], /JSON/],
  ["foreign-origin refusal needs the relay error shape", true, ['{"schema":"ballsy-room/v1"}', "application/json", 403], /unexpected Ballsy relay rejection/],
  ["foreign-origin error cannot be empty", true, ['{"error":" "}', "application/json", 403], /unexpected Ballsy relay rejection/],
  ["same-origin CORS wildcard is forbidden", false, ['{"schema":"ballsy-room/v1"}', "application/json", 200, { "access-control-allow-origin": "*" }], /unexpected Access-Control-Allow-Origin/],
  ["same-origin empty CORS header is also forbidden", false, ['{"schema":"ballsy-room/v1"}', "application/json", 200, { "access-control-allow-origin": "" }], /unexpected Access-Control-Allow-Origin/],
  ["foreign-origin CORS echo is forbidden", true, ['{"error":"Origin refused"}', "application/json", 403, { "access-control-allow-origin": foreignOrigin }], /unexpected Access-Control-Allow-Origin/],
]) {
  test(`Ballsy relay origin check: ${label}`, async t => {
    const { options, requests } = await fixture(t, (file, _requests, request) => file === statusPath
      && (request.headers.origin === foreignOrigin) === foreign ? replacement : null);
    await assert.rejects(verifyLiveRelease({ ...options, attempts: 3 }), error);
    assert.equal(requests.filter(file => file === statusPath).length, foreign ? 2 : 1);
    assert.equal(requests.filter(file => file === "release.json").length, 1);
  });
}

for (const foreign of [false, true]) {
  test(`the ${foreign ? "foreign" : "same"}-origin status request never follows a redirect`, async t => {
    const { options, requests } = await fixture(t, (file, _requests, request) => file === statusPath
      && (request.headers.origin === foreignOrigin) === foreign
      ? ["", "application/json", 302, { location: "/must-not-follow" }] : null);
    await assert.rejects(verifyLiveRelease(options), /fetch failed/);
    assert.ok(!requests.includes("must-not-follow"));
    assert.equal(requests.filter(file => file === statusPath).length, foreign ? 2 : 1);
  });
}

for (const [label, proxyHeaders, trustedLoopbackProxy, accepted] of [
  ["valid trusted HTTPS forwarding", { "x-forwarded-proto": "https", "x-real-ip": "192.0.2.44" }, true, true],
  ["missing forwarding headers", {}, true, false],
  ["incorrect forwarded protocol", { "x-forwarded-proto": "http", "x-real-ip": "192.0.2.44" }, true, false],
  ["a forwarded protocol chain", { "x-forwarded-proto": "https,http", "x-real-ip": "192.0.2.44" }, true, false],
  ["missing real client address", { "x-forwarded-proto": "https" }, true, false],
  ["invalid real client address", { "x-forwarded-proto": "https", "x-real-ip": "not-an-ip" }, true, false],
  ["forwarded headers without proxy trust", { "x-forwarded-proto": "https", "x-real-ip": "192.0.2.44" }, false, false],
]) {
  test(`HTTPS public-origin contract through a local proxy fixture: ${label}`, async t => {
    const publicOrigin = "https://graphysx-public.invalid";
    const relay = createBallsyRoute({ trustedLoopbackProxy });
    const { options, requestDetails } = await fixture(t, () => null, { statusHandler(request, response) {
      // Model the TLS-terminating proxy's loopback hop, using the real relay handler.
      request.headers = { ...request.headers, host: new URL(publicOrigin).host, ...proxyHeaders };
      request.url = request.url.replace(/^\/store\//, "/");
      assert.equal(relay(request, response), true);
    } });
    const originalFetch = globalThis.fetch;
    t.mock.method(globalThis, "fetch", (url, init) => {
      // No public or foreign host is contacted. Only this fixture's loopback server is used.
      assert.equal(url.origin, publicOrigin);
      return originalFetch(new URL(`${url.pathname}${url.search}`, options.base), init);
    });
    const verification = verifyLiveRelease({ ...options, base: `${publicOrigin}/` });
    if (accepted) {
      const receipt = await verification;
      assert.deepEqual(receipt.services[0].sameOrigin, { origin: publicOrigin, status: 200, allowOrigin: false });
      assert.deepEqual(receipt.services[0].foreignOrigin, { origin: foreignOrigin, status: 403, allowOrigin: false });
    } else await assert.rejects(verification, /HTTP 403 \(expected 200\)/);
    const statusRequests = requestDetails.filter(request => request.url === `/${statusPath}`);
    assert.deepEqual(statusRequests.map(request => request.origin), accepted ? [publicOrigin, foreignOrigin] : [publicOrigin]);
    assert.ok(statusRequests.every(request => request.forwardedProtocol === undefined && request.realAddress === undefined));
  });
}

test("relative HTML and dynamic entries resolve under a non-root release base", async t => {
  const { options, requestDetails } = await fixture(t, () => null, { prefix: "nested/release/" });
  assert.equal((await verifyLiveRelease(options)).files.length, 14);
  assert.ok(requestDetails.every(request => request.url.startsWith("/nested/release/")));
});

test("only the release manifest is retried until the expected SHA appears", async t => {
  const { options, requests } = await fixture(t, (file, seen) => file === "release.json" && seen.length === 1
    ? [JSON.stringify({ schema: "graphysx.release/v1", sha: "b".repeat(40) }), "application/json"] : null);
  await verifyLiveRelease({ ...options, attempts: 2 });
  assert.deepEqual(requests.slice(0, 2), ["release.json", "release.json"]);
  assert.equal(requests.length, 18);
});

for (const replacement of [
  [JSON.stringify({ schema: "wrong", sha }), "application/json"],
  [JSON.stringify({ schema: "graphysx.release/v1", sha }), "text/html"],
  ["not JSON", "application/json"],
]) {
  test(`invalid release manifest fails before entry requests: ${replacement.join(" ")}`, async t => {
    const { options, requests } = await fixture(t, file => file === "release.json" ? replacement : null);
    await assert.rejects(verifyLiveRelease({ ...options, attempts: 2 }), /never became authoritative/);
    assert.deepEqual(requests, ["release.json", "release.json"]);
  });
}

for (const html of ["index.html", "ballsy.html", "ballsy-giant.html"]) {
  test(`the local ${html} must contain a module entry`, async t => {
    const { options, requests } = await fixture(t, () => null, { mutateBuild(dir) {
      writeFileSync(path.join(dir, html), '<script src="./assets/main.js"></script>');
    } });
    await assert.rejects(verifyLiveRelease(options), /has no module entry/);
    assert.deepEqual(requests, ["release.json"]);
  });
}

for (const file of ["ballsy.html", "ballsy-giant.html", vrEntry, ...xrAssets]) {
  test(`a build missing required file ${file} fails rather than skipping acceptance`, async t => {
    const { options, requests } = await fixture(t, () => null, { mutateBuild(dir) { unlinkSync(path.join(dir, file)); } });
    await assert.rejects(verifyLiveRelease(options), /ENOENT/);
    assert.deepEqual(requests, ["release.json"]);
  });
}

test("an unreferenced VR file on disk does not substitute for the dynamic route entry", async t => {
  const { options, requests } = await fixture(t, () => null, { mutateBuild(dir) {
    writeFileSync(path.join(dir, "assets/main.js"), 'import "./shared.js";');
  } });
  await assert.rejects(verifyLiveRelease(options), /exactly one dynamic vr-lab-app entry/);
  assert.deepEqual(requests, ["release.json"]);
});

for (const quote of ['"', "'", "`"]) {
  test(`the emitted VR import supports ${quote} literals without following unrelated lazy imports`, async t => {
    const { options, requests } = await fixture(t, () => null, { mutateBuild(dir, files) {
      const source = `const openVr = () => import(${quote}./vr-lab-app-Bu1ld_42.js${quote}); const other = () => import("./other-lazy.js");`;
      writeFileSync(path.join(dir, "assets/main.js"), source);
      files.set("assets/main.js", [source, "text/javascript"]);
    } });
    assert.equal((await verifyLiveRelease(options)).files.length, 14);
    assert.ok(!requests.includes("assets/other-lazy.js"));
  });
}

test("ambiguous dynamic VR entries fail instead of choosing a stale chunk", async t => {
  const { options, requests } = await fixture(t, () => null, { mutateBuild(dir) {
    writeFileSync(path.join(dir, "assets/main.js"), 'import("./vr-lab-app-Bu1ld_42.js"); import("./vr-lab-app-older.js");');
    writeFileSync(path.join(dir, "assets/vr-lab-app-older.js"), "old code");
  } });
  await assert.rejects(verifyLiveRelease(options), /exactly one dynamic vr-lab-app entry/);
  assert.deepEqual(requests, ["release.json"]);
});

for (const failEntry of [false, true]) {
  test(`entry concurrency stays bounded at four and siblings settle${failEntry ? " after failure" : " on success"}`, async t => {
    const { options } = await fixture(t, file => failEntry && file === "assets/main.js" ? ["missing", "text/plain", 404] : null);
    const originalFetch = globalThis.fetch;
    let active = 0;
    let peak = 0;
    t.mock.method(globalThis, "fetch", async (...args) => {
      active++;
      peak = Math.max(peak, active);
      try {
        const response = await originalFetch(...args);
        // Keep successful siblings in flight after the failing entry responds.
        if (response.ok) await new Promise(resolve => setTimeout(resolve, 10));
        return response;
      } finally { active--; }
    });
    if (failEntry) await assert.rejects(verifyLiveRelease(options), /HTTP 404/);
    else await verifyLiveRelease(options);
    assert.equal(peak, 4);
    assert.equal(active, 0);
  });
}

for (const reference of ["https://example.invalid/vr-lab-app-other.js", "./%2e%2e%2f%2e%2e%2fvr-lab-app-other.js"]) {
  test(`dynamic VR entry cannot escape the release: ${reference}`, async t => {
    const { options, requests } = await fixture(t, () => null, { mutateBuild(dir) {
      writeFileSync(path.join(dir, "assets/main.js"), `const openVr = () => import("${reference}");`);
    } });
    await assert.rejects(verifyLiveRelease(options), /belong to the release base|escapes dist|exactly one dynamic/);
    assert.deepEqual(requests, ["release.json"]);
  });
}

for (const reference of ["https://example.invalid/main.js", "./%2e%2e%2foutside.js"]) {
  test(`HTML entry cannot escape the release: ${reference}`, async t => {
    const { options, requests } = await fixture(t, () => null, { mutateBuild(dir) {
      writeFileSync(path.join(dir, "ballsy.html"), `<script type="module" src="${reference}"></script>`);
    } });
    await assert.rejects(verifyLiveRelease(options), /belong to the release base|escapes dist/);
    assert.deepEqual(requests, ["release.json"]);
  });
}

for (const [change, error] of [
  [{ base: "file:///tmp/build/" }, /must use HTTP/],
  [{ expectedSha: "not-a-sha" }, /lowercase Git SHA/],
  [{ attempts: 0 }, /integer from 1 to 20/],
  [{ attempts: 21 }, /integer from 1 to 20/],
  [{ attempts: 1.5 }, /integer from 1 to 20/],
  [{ retryMs: -1 }, /between 0 and 60000/],
  [{ retryMs: 60001 }, /between 0 and 60000/],
]) {
  test(`invalid release options fail before requests: ${JSON.stringify(change)}`, async t => {
    const { options, requests } = await fixture(t);
    await assert.rejects(verifyLiveRelease({ ...options, ...change }), error);
    assert.deepEqual(requests, []);
  });
}

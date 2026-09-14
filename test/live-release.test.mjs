import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyLiveRelease } from "../scripts/smoke-live-release.mjs";

const sha = "a".repeat(40);
async function fixture(t, override = () => null) {
  const dir = mkdtempSync(path.join(tmpdir(), "graphysx-http-release-"));
  const files = new Map([
    ["index.html", ['<div id="app"></div><script type="module" src="/assets/main.js"></script><link rel="stylesheet" href="/assets/main.css"><link rel="modulepreload" href="/assets/shared.js">', "text/html"]],
    ["assets/main.js", ['import "./shared.js";', "text/javascript"]],
    ["assets/shared.js", ['export const loaded = true;', "application/javascript"]],
    ["assets/main.css", ['body { margin: 0; }', "text/css"]],
    ["release.json", [JSON.stringify({ schema: "graphysx.release/v1", sha }), "application/json"]],
  ]);
  mkdirSync(path.join(dir, "assets"));
  for (const [file, [content]] of files) writeFileSync(path.join(dir, file), content);
  const requests = [];
  const server = createServer((req, res) => {
    const file = new URL(req.url, "http://localhost").pathname.slice(1);
    requests.push(file);
    const modified = override(file, requests);
    const [content, mime, status = 200] = modified ?? files.get(file) ?? ["missing", "text/plain", 404];
    res.writeHead(status, { "content-type": mime });
    res.end(content);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    assert.match(path.basename(dir), /^graphysx-http-release-/);
    rmSync(dir, { recursive: true, force: true });
  });
  return { options: { base: `http://127.0.0.1:${server.address().port}/`, expectedSha: sha, buildDir: dir, attempts: 1, retryMs: 0 }, requests };
}

test("HTTP release check verifies the exact HTML, module entry, preload and CSS without a browser", async t => {
  const { options, requests } = await fixture(t);
  const receipt = await verifyLiveRelease(options);
  assert.equal(receipt.sha, sha);
  assert.equal(receipt.files.length, 4);
  assert.ok(receipt.files.every(file => file.bytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256)));
  assert.deepEqual(new Set(requests), new Set(["release.json", "index.html", "assets/main.js", "assets/shared.js", "assets/main.css"]));
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
    const { options } = await fixture(t, requested => requested === file ? replacement : null);
    await assert.rejects(verifyLiveRelease(options), error);
  });
}

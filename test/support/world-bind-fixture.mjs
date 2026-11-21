// A subprocess makes an uncaught listen error or leaked startup timer observable.
import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { startWorldServer } from "../../world-service/server.mjs";
import { startReplayServer } from "../../world-service/replay.mjs";
import { startImageSidecar } from "../../world-service/image-sidecar.mjs";
import { parseRecording } from "../../world-service/recording.mjs";

const [service, root] = process.argv.slice(2);
const snapshotPath = join(root, "colliding-world.json");
const recordDir = join(root, "colliding-recordings");
const viewerDir = join(root, "colliding-viewer");
const host = "127.0.0.1";

let start;
if (service === "world") {
  const module = await import(pathToFileURL(join(root, "bundle", "world.js")).href);
  start = (port) => startWorldServer({ module, host, port, snapshotPath, recordDir });
} else if (service === "images") {
  mkdirSync(viewerDir);
  writeFileSync(join(viewerDir, "index.html"), "<title>Sidecar fixture</title>");
  start = (port) => startImageSidecar({ host, port, viewerDir });
} else {
  const recording = parseRecording(JSON.stringify({ kind: "hello", format: "graphysx-world-stream/v1", tick: 0, document: { entities: [] } }));
  start = (port) => startReplayServer({ recording, host, port });
}

const occupied = createServer((_request, response) => response.end("original listener"));
await once(occupied.listen(0, host), "listening");
try {
  const port = occupied.address().port;
  await assert.rejects(start(port), { code: "EADDRINUSE" });
  assert.equal(await (await fetch(`http://${host}:${port}/`)).text(), "original listener");
  if (service === "world") {
    assert.equal(existsSync(snapshotPath), false, "failed startup leaves checkpoint data alone");
    assert.equal(existsSync(recordDir), false, "failed startup creates no recording");
  }
} finally { await new Promise(resolve => occupied.close(resolve)); }

const running = await start(0);
try {
  const health = await fetch(`${running.url}/healthz`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
} finally { await running.close(); }
console.log("EADDRINUSE rejected; restart healthy");

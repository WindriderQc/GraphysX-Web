#!/usr/bin/env node
// Bytes per simulated hour of a world recording, on a local world stepped by hand: no real time,
// no model calls, no live host. One agent walking between four spots keeps poses and the
// inspection moving; the living island adds its flock and growing trees.
//
//   npm run build:world-service
//   node scripts/measure-recording-rate.mjs [--world living-island] [--seconds 600]
//        [--frame-hz 10] [--swarm-hz 10] [--inspection-seconds 1]
//
// Prints one JSON line: uncompressed and on-disk (gzip) bytes, and their rate per hour. The first
// segment stays plain until it is full (32 MiB); its gzip size is computed the way the recorder
// writes later segments (one sync flush per line), so short runs report the steady on-disk rate.

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { constants, createGzip, gunzipSync } from "node:zlib";
import { startWorldServer } from "../world-service/server.mjs";

const { values } = parseArgs({ options: {
  world: { type: "string", default: "living-island" },
  seconds: { type: "string", default: "600" },
  "frame-hz": { type: "string" },
  "swarm-hz": { type: "string" },
  "inspection-seconds": { type: "string" },
  dist: { type: "string", default: new URL("../world-service/dist/world.js", import.meta.url).href },
} });
const module = await import(values.dist);

/** Gzip size of these lines, flushed one line at a time like SegmentedArchive. */
async function gzipLines(lines) {
  const gzip = createGzip();
  let bytes = 0;
  gzip.on("data", chunk => { bytes += chunk.length; });
  for (const line of lines) await new Promise(resolve => { gzip.write(`${line}\n`); gzip.flush(constants.Z_SYNC_FLUSH, resolve); });
  await new Promise(resolve => { gzip.once("end", resolve); gzip.end(); });
  return bytes;
}

const seconds = Number(values.seconds);
const root = await mkdtemp(join(tmpdir(), "record-rate-"));
const running = await startWorldServer({ module, apiMarkdown: "", world: values.world, realtime: false, recordDir: root,
  recordingLimits: { maxBytes: 256 * 1024 * 1024, compress: true },
  ...(values["frame-hz"] ? { recordFrameHz: Number(values["frame-hz"]) } : {}),
  ...(values["swarm-hz"] ? { recordSwarmHz: Number(values["swarm-hz"]) } : {}),
  ...(values["inspection-seconds"] ? { recordInspectionSeconds: Number(values["inspection-seconds"]) } : {}) });
const health = async () => (await fetch(`${running.url}/healthz`)).json();
const drain = async () => { while ((await health()).recording.pendingBytes > 1 << 20); };
try {
  const { session } = running.world.join("Walker");
  const spots = [[6, 2, 6], [-6, 2, 4], [0, 2, -8], [8, 2, -2]];
  const leg = module.TICK_HZ * 8;
  for (let tick = 0; tick < Math.round(seconds * module.TICK_HZ); tick += 1) {
    if (tick % leg === 0) running.world.apply(session, { type: "MoveTo", data: { position: spots[(tick / leg) % spots.length] } });
    running.tick();
    // Stepping by hand outruns the asynchronous writer: let it drain below its 8 MiB buffer.
    if (tick % module.TICK_HZ === 0) await drain();
  }
  const { recording } = await health();
  if (recording.error) throw new Error(`Recording stopped: ${recording.error}`);
  await running.close();
  const dir = join(root, "instances", running.world.instanceId);
  let text = 0, gzipped = 0;
  const lines = {};
  for (const name of await readdir(dir)) {
    const bytes = await readFile(join(dir, name));
    const plain = name.endsWith(".gz") ? gunzipSync(bytes, { finishFlush: constants.Z_SYNC_FLUSH }) : bytes;
    const entries = plain.toString("utf8").split("\n").filter(Boolean);
    text += plain.length;
    gzipped += name.endsWith(".gz") ? bytes.length : await gzipLines(entries);
    for (const line of entries) {
      const entry = JSON.parse(line);
      const key = entry.kind === "frame" ? (entry.inspection ? "frame+inspection" : "frame") : entry.kind;
      lines[key] = (lines[key] ?? 0) + 1;
    }
  }
  const perHour = 3600 / seconds / 2 ** 20;
  console.log(JSON.stringify({ world: values.world, simulatedSeconds: seconds,
    frameHz: values["frame-hz"] ?? "default", swarmHz: values["swarm-hz"] ?? "default", inspectionSeconds: values["inspection-seconds"] ?? "default",
    textBytes: text, gzipBytes: gzipped, textMiBPerHour: +(text * perHour).toFixed(3), gzipMiBPerHour: +(gzipped * perHour).toFixed(3), lines }));
} finally {
  await rm(root, { recursive: true, force: true });
}

#!/usr/bin/env node
// Read-only replay of a GraphysX world recording, answering like a replay source of the island
// viewer (`?app=island&source=<this server>`), the way `clawblox replay` does for Clawblox:
//
//   GET  /healthz          {ok, tick, replay: true}
//   GET  /spectate         SSE, same events as the live world: hello, frame, entities, action.
//                          Every seek sends a fresh hello (the document at that tick).
//   GET  /replay/info      {current_tick, total_ticks, first_tick, tick_rate, speed, paused}
//   GET  /replay/actions   {tick_rate, actions: [{tick, agent, input, result}]}
//   POST /replay/play | /replay/pause | /replay/seek?tick=N | /replay/speed?value=N
//        /replay/skip-idle?enabled=true|false
//
// Like Clawblox's replay server, the transport is shared by everyone watching. No agent
// endpoint exists here: nothing can join or act.
//
//   node world-service/replay.mjs <recording dir or .ndjson> --port 18131 [--host 127.0.0.1] [--play]

import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { frameAt, helloAt, lastAtOrBefore, nextActionAfter, parseRecording } from "./recording.mjs";

const MAX_SPECTATORS = 32;
const SPECTATOR_BUFFER_LIMIT = 1 << 20;
const HEARTBEAT_MS = 25_000;
const LOOP_MS = 50;
const MAX_SPEED = 16;
/** Skip-idle jumps when the next action is further than this, landing this long before it. */
const IDLE_GAP_SECONDS = 4;
const IDLE_LEAD_SECONDS = 1;

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...CORS });
  response.end(JSON.stringify(body));
}

export function loadRecording(path) {
  const file = existsSync(path) && statSync(path).isDirectory() ? join(path, "graphysx-recording.ndjson") : path;
  return parseRecording(readFileSync(file, "utf8"));
}

/**
 * @param {object} options
 * @param {ReturnType<typeof parseRecording>} options.recording
 * @param {boolean} [options.play]     start playing (default: paused at the first tick, like Clawblox)
 * @param {boolean} [options.realtime] false: the caller advances time with `advance(seconds)` (tests)
 */
export async function startReplayServer(options) {
  const recording = options.recording;
  const { firstTick, lastTick, tickHz } = recording;
  const spectators = new Set();
  const clock = { tick: firstTick, speed: 1, paused: !options.play, skipIdle: false };
  // Everything up to `emitted` (inclusive) has been sent to the current spectators.
  let emitted = firstTick;

  const write = (response, text) => {
    if (response.writableLength > SPECTATOR_BUFFER_LIMIT) { response.end(); spectators.delete(response); return; }
    response.write(text);
  };
  const event = (name, payload) => `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
  const broadcast = (text) => { for (const response of spectators) write(response, text); };
  const opening = (tick) => {
    const frame = frameAt(recording, tick);
    return event("hello", helloAt(recording, tick)) + (frame ? event("frame", frame) : "");
  };

  /** Jump: everyone gets the document at the new tick. */
  const seek = (tick) => {
    clock.tick = Math.min(lastTick, Math.max(firstTick, Math.round(tick)));
    emitted = Math.floor(clock.tick);
    if (spectators.size) broadcast(opening(emitted));
  };

  /** Send what the clock passed since the last call: changes, actions, and the newest frame. */
  const flush = () => {
    const now = Math.floor(clock.tick);
    if (now <= emitted) return;
    let text = "";
    const latestHello = recording.hellos[lastAtOrBefore(recording.hellos, now)];
    const resumed = latestHello && latestHello.tick > emitted;
    // A recorded resume is a new whole scene, including changes which need
    // not appear as deltas. Playing across it must reset existing viewers too.
    if (resumed) text = opening(now);
    else for (let i = lastAtOrBefore(recording.changes, emitted) + 1; i < recording.changes.length && recording.changes[i].tick <= now; i += 1) text += event("entities", recording.changes[i]);
    for (let i = lastAtOrBefore(recording.actions, emitted) + 1; i < recording.actions.length && recording.actions[i].tick <= now; i += 1) text += event("action", recording.actions[i]);
    const frame = frameAt(recording, now);
    if (!resumed && frame && frame.tick > emitted) text += event("frame", frame);
    emitted = now;
    if (text && spectators.size) broadcast(text);
  };

  const advance = (seconds) => {
    if (clock.paused) return;
    if (clock.skipIdle) {
      const next = nextActionAfter(recording, clock.tick);
      if (next && next.tick - clock.tick > IDLE_GAP_SECONDS * tickHz) { seek(next.tick - IDLE_LEAD_SECONDS * tickHz); return; }
    }
    clock.tick = Math.min(lastTick, clock.tick + seconds * tickHz * clock.speed);
    if (clock.tick >= lastTick) clock.paused = true;
    flush();
  };

  let timer = null;
  let heartbeat = null;
  if (options.realtime !== false) {
    let last = performance.now();
    timer = setInterval(() => {
      const now = performance.now();
      advance((now - last) / 1000);
      last = now;
    }, LOOP_MS);
    heartbeat = setInterval(() => broadcast(": ping\n\n"), HEARTBEAT_MS);
    heartbeat.unref?.();
  }

  const info = () => ({
    current_tick: Math.floor(clock.tick), total_ticks: lastTick, first_tick: firstTick, tick_rate: tickHz,
    speed: clock.speed, paused: clock.paused, skip_idle: clock.skipIdle,
  });

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://replay.local");
    const route = `${request.method} ${url.pathname}`;
    if (request.method === "OPTIONS") { response.writeHead(204, CORS); response.end(); return; }
    switch (route) {
      case "GET /healthz": return send(response, 200, { ok: true, tick: Math.floor(clock.tick), replay: true, ...(recording.hellos[0].instanceId ? { instanceId: recording.hellos[0].instanceId, ...(recording.hellos[0].identitySource ? { identitySource: recording.hellos[0].identitySource } : {}) } : {}) });
      case "GET /replay/info": return send(response, 200, info());
      case "GET /replay/actions": return send(response, 200, { tick_rate: tickHz, actions: recording.actions });
      case "POST /replay/play":
        if (clock.tick >= lastTick) seek(firstTick);
        clock.paused = false;
        return send(response, 200, info());
      case "POST /replay/pause":
        clock.paused = true;
        return send(response, 200, info());
      case "POST /replay/seek": {
        const tick = Number(url.searchParams.get("tick"));
        if (!Number.isFinite(tick)) return send(response, 400, { error: "seek needs ?tick=<number>" });
        seek(tick);
        return send(response, 200, info());
      }
      case "POST /replay/speed": {
        const value = Number(url.searchParams.get("value"));
        if (!(value > 0) || value > MAX_SPEED) return send(response, 400, { error: `speed needs ?value= in (0, ${MAX_SPEED}]` });
        clock.speed = value;
        return send(response, 200, info());
      }
      case "POST /replay/skip-idle":
        clock.skipIdle = url.searchParams.get("enabled") !== "false";
        return send(response, 200, info());
      case "GET /spectate": {
        if (spectators.size >= MAX_SPECTATORS) return send(response, 429, { error: "Spectator capacity reached; retry later" });
        response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no", ...CORS });
        // A newcomer gets the state at the shared clock; it then follows the same flushes.
        flush();
        response.write(opening(emitted));
        spectators.add(response);
        request.once("close", () => spectators.delete(response));
        return undefined;
      }
      default: return send(response, 404, { error: `No route ${route}` });
    }
  });

  await new Promise((done) => server.listen(options.port ?? 0, options.host ?? "127.0.0.1", done));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  return {
    url: `http://${options.host ?? "127.0.0.1"}:${port}`,
    info,
    server,
    get spectatorCount() { return spectators.size; },
    advance,
    close: async () => {
      if (timer) clearInterval(timer);
      if (heartbeat) clearInterval(heartbeat);
      for (const response of spectators) response.end();
      spectators.clear();
      await new Promise((done) => server.close(() => done()));
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { host: { type: "string" }, port: { type: "string" }, play: { type: "boolean" } },
  });
  if (!positionals[0]) {
    console.error("usage: node world-service/replay.mjs <recording dir or .ndjson> --port <p> [--host 127.0.0.1] [--play]");
    process.exit(2);
  }
  const recording = loadRecording(positionals[0]);
  const running = await startReplayServer({ recording, host: values.host ?? "127.0.0.1", port: Number(values.port ?? 18131), play: values.play });
  console.log(`graphysx world replay on ${running.url} (ticks ${recording.firstTick}–${recording.lastTick}, ${recording.frames.length} frames, ${recording.actions.length} actions${recording.skipped ? `, ${recording.skipped} unreadable lines skipped` : ""})`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await running.close(); process.exit(0); });
}

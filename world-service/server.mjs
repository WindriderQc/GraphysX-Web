// Clawblox world protocol over a headless GraphysX world.
//
//   POST /join?name=X -> {session, agent_id}      GET /observe            (X-Session)
//   POST /input {type, data} -> observation         POST /chat, GET /chat/messages
//   GET /api.md                                     GET /snapshot           (X-Operator-Token)
//   GET /observe/image?width&height -> PNG of the agent's first-person view (X-Session)
//   GET /spectate  SSE: hello (v2 document), frame (poses), entities (added/removed), action
//   GET /healthz
//
// /spectate and /healthz are read only and answer any origin (the island viewer runs on
// another one). First-person images come from a separate renderer (`options.renderImage`, the
// image sidecar in main.mjs), so this process never loads a browser.
//
// One fixed-tick loop owns the world. HTTP handlers queue input or read state between ticks.
// The world itself (TypeScript, bundled by Vite) is passed in, so tests can build it anywhere.

import { appendFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { parseImageSize } from "./image.mjs";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_SPECTATORS = 32;
const SPECTATOR_BUFFER_LIMIT = 1 << 20;
const HEARTBEAT_MS = 25_000;
const READ_ONLY_CORS = { "access-control-allow-origin": "*" };

function send(response, status, body, headers = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  response.writeHead(status, {
    "content-type": typeof body === "string" ? "text/markdown; charset=utf-8" : "application/json",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(text);
}

async function readJson(request, InputError) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new InputError("Body too large");
    chunks.push(chunk);
  }
  if (size === 0) return {};
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InputError("Body is not valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Body must be a JSON object");
  return value;
}

/**
 * @param {object} options
 * @param {object} options.module      the bundled world: { IslandWorld, InputError, validateInput, TICK_HZ }
 * @param {string} options.apiMarkdown agent-facing API.md
 * @param {object} [options.snapshot]  resume from this GET /snapshot body
 * @param {string} [options.world]     `mesa-island` (default) or `living-island`; a snapshot names its own
 * @param {boolean} [options.realtime] false: the caller drives `world.step()` (tests)
 * @param {(request: {position: number[], forward: number[], fovDeg: number, entityId: string, tick: number, width: number, height: number}) => Promise<Buffer>} [options.renderImage]
 *        renders one first-person PNG; without it GET /observe/image answers 503
 */
export async function startWorldServer(options) {
  const { IslandWorld, InputError, validateInput, TICK_HZ } = options.module;
  const world = new IslandWorld(options.snapshot, { world: options.world });
  const spectators = new Set();
  const spectateEvery = Math.max(1, Math.round(TICK_HZ / (options.spectateHz ?? 10)));
  const recordFile = options.recordDir ? join(options.recordDir, "graphysx-recording.ndjson") : null;
  const tickTimes = { count: 0, total: 0, max: 0 };
  let recordedActions = world.actions.length;
  let closing = false;
  let shutdown = null;

  const record = (line) => { if (recordFile) appendFileSync(recordFile, `${JSON.stringify(line)}\n`); };
  if (recordFile) {
    mkdirSync(options.recordDir, { recursive: true });
    record({ kind: "hello", ...world.sceneHello(), resumedFromTick: options.snapshot ? world.tick : null });
  }

  const write = (response, frame) => {
    // A slow viewer is dropped rather than buffered without bound.
    if (response.writableLength > SPECTATOR_BUFFER_LIMIT) { response.end(); spectators.delete(response); return; }
    response.write(frame);
  };
  const broadcast = (event, payload) => {
    if (spectators.size === 0) return;
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const response of spectators) write(response, frame);
  };

  const tickOnce = () => {
    const started = performance.now();
    world.step();
    const elapsed = performance.now() - started;
    tickTimes.count += 1;
    tickTimes.total += elapsed;
    tickTimes.max = Math.max(tickTimes.max, elapsed);
    for (const change of world.drainChanges()) {
      broadcast("entities", { tick: world.tick, ...change });
      record({ kind: "entities", tick: world.tick, ...change });
    }
    if (world.tick % spectateEvery === 0) {
      const frame = world.poseFrame();
      broadcast("frame", frame);
      record({ kind: "frame", ...frame });
    }
    if (world.actions.length > recordedActions) {
      for (const action of world.actions.slice(recordedActions)) {
        broadcast("action", action);
        record({ kind: "action", ...action });
      }
      recordedActions = world.actions.length;
    }
  };

  // Fixed tick against the wall clock; at most 4 catch-up ticks per wake.
  let timer = null;
  let heartbeat = null;
  if (options.realtime !== false) {
    let last = performance.now();
    let accumulator = 0;
    timer = setInterval(() => {
      const now = performance.now();
      accumulator = Math.min(accumulator + (now - last) / 1000, 4 / TICK_HZ);
      last = now;
      while (accumulator >= 1 / TICK_HZ) { tickOnce(); accumulator -= 1 / TICK_HZ; }
    }, 1000 / TICK_HZ / 2);
    heartbeat = setInterval(() => { for (const response of spectators) write(response, ": ping\n\n"); }, HEARTBEAT_MS);
    heartbeat.unref?.();
  }

  const server = createServer(async (request, response) => {
    response.once("finish", () => { if (closing) server.closeIdleConnections(); });
    try {
      if (closing) return send(response, 503, { error: "World is stopping" });
      const url = new URL(request.url ?? "/", "http://world.local");
      const session = request.headers["x-session"];
      const route = `${request.method} ${url.pathname}`;
      const needSession = () => {
        if (world.hasSession(session)) return true;
        send(response, 401, { error: "Missing or unknown X-Session" });
        return false;
      };
      switch (route) {
        case "GET /healthz": return send(response, 200, { ok: true, tick: world.tick }, READ_ONLY_CORS);
        case "GET /api.md": return send(response, 200, options.apiMarkdown);
        case "POST /join": {
          // An X-Session the world already knows rejoins it (Clawblox's /join contract).
          const joined = world.join(url.searchParams.get("name") ?? "Agent", typeof session === "string" ? session : null);
          return send(response, 200, joined);
        }
        case "GET /observe": return needSession() ? send(response, 200, world.observe(session)) : undefined;
        case "POST /input": {
          if (!needSession()) return undefined;
          const input = validateInput(await readJson(request, InputError));
          if (closing) return send(response, 503, { error: "World is stopping" });
          if (options.realtime === false) world.apply(session, input);
          else await world.enqueue(session, input);
          return send(response, 200, world.observe(session));
        }
        case "POST /chat": {
          if (!needSession()) return undefined;
          const body = await readJson(request, InputError);
          if (typeof body.content !== "string" || !body.content.trim()) throw new InputError("Body must be {\"content\": string}");
          return send(response, 200, world.postChat(session, body.content));
        }
        case "GET /chat/messages":
          return needSession() ? send(response, 200, world.chatMessages(url.searchParams.get("after"), Number(url.searchParams.get("limit") ?? 20))) : undefined;
        case "GET /observe/image": {
          if (!needSession()) return undefined;
          const size = parseImageSize(url.searchParams);
          if ("error" in size) throw new InputError(size.error);
          if (!options.renderImage) return send(response, 503, { error: "First-person images are turned off on this world (see world-service/README.md)" });
          // The pose between ticks: the renderer waits until its view has caught up with `tick`.
          const request = { ...world.camera(session), tick: world.tick, ...size };
          let png;
          try {
            png = await options.renderImage(request);
          } catch (error) {
            return send(response, 503, { error: `The image renderer is unavailable: ${String(error?.message ?? error)}` }, { "retry-after": "5" });
          }
          response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store", "content-length": png.length });
          response.end(png);
          return undefined;
        }
        case "GET /snapshot":
          if (!options.operatorToken || request.headers["x-operator-token"] !== options.operatorToken) return send(response, 403, { error: "Operator token required" });
          // Handlers run between ticks, so this is a whole-tick state.
          return send(response, 200, world.snapshot());
        case "GET /spectate": {
          if (spectators.size >= MAX_SPECTATORS) return send(response, 429, { error: "Spectator capacity reached; retry later" }, { "retry-after": "5" });
          response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no", ...READ_ONLY_CORS });
          response.write(`event: hello\ndata: ${JSON.stringify(world.sceneHello())}\n\n`);
          response.write(`event: frame\ndata: ${JSON.stringify(world.poseFrame())}\n\n`);
          spectators.add(response);
          request.once("close", () => spectators.delete(response));
          return undefined;
        }
        default: return send(response, 404, { error: `No route ${route}` });
      }
    } catch (error) {
      if (error instanceof InputError) return send(response, 400, { error: error.message });
      return send(response, 500, { error: String(error?.message ?? error) });
    }
  });

  await new Promise((resolve) => server.listen(options.port ?? 0, options.host ?? "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  return {
    world,
    server,
    url: `http://${options.host ?? "127.0.0.1"}:${port}`,
    stats: () => ({ ticks: tickTimes.count, meanTickMs: tickTimes.count ? tickTimes.total / tickTimes.count : 0, maxTickMs: tickTimes.max, spectators: spectators.size }),
    close: () => shutdown ??= (async () => {
      closing = true;
      // Stop admitting sockets before draining the queued inputs. Otherwise
      // disabling the tick loop strands their HTTP handlers forever.
      const closed = new Promise((resolve) => server.close(() => resolve()));
      if (timer) clearInterval(timer);
      if (heartbeat) clearInterval(heartbeat);
      if (options.realtime !== false) tickOnce();
      for (const response of spectators) response.end();
      spectators.clear();
      await closed;
    })(),
  };
}

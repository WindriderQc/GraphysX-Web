// Clawblox world protocol over a headless GraphysX world.
//
//   POST /join?name=X -> {session, agent_id}      GET /observe            (X-Session)
//   POST /input {type, data} -> observation         POST /chat, GET /chat/messages
//   GET /api.md                                     GET /snapshot           (X-Operator-Token)
//   GET /observe/image?width&height -> PNG of the agent's first-person view (X-Session)
//   GET /spectate  SSE: hello (v2 document), frame (poses), entities (added/removed), action
//   GET /healthz -> {ok, tick, world}                 POST /world {world, force?} (X-Operator-Token)
//
// POST /world is the world selector: it replaces the running island with a fresh one of the
// named world (`mesa-island`, `living-island`) in the same process. It refuses while agents are
// joined unless `force` is true (their sessions end), sends spectators a new hello and starts a
// new recording directory beside the first, so each recording stays one monotonic timeline.
//
// /spectate and /healthz are read only and answer any origin (the island viewer runs on
// another one). First-person images come from a separate renderer (`options.renderImage`, the
// image sidecar in main.mjs), so this process never loads a browser.
//
// One fixed-tick loop owns the world. HTTP handlers queue input or read state between ticks.
// The world itself (TypeScript, bundled by Vite) is passed in, so tests can build it anywhere.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Archive, atomicSnapshot, replayArchives, UUID, sealCheckpoint, verifyCheckpoint } from "./archive.mjs";
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
 * @param {string | ((worldId: string) => string)} options.apiMarkdown agent-facing API.md, or one per world
 * @param {object} [options.snapshot]  resume from this GET /snapshot body
 * @param {string} [options.world]     `mesa-island` (default) or `living-island`; a snapshot names its own
 * @param {boolean} [options.realtime] false: the caller drives `world.step()` (tests)
 * @param {(request: {position: number[], forward: number[], fovDeg: number, entityId: string, tick: number, width: number, height: number}) => Promise<Buffer>} [options.renderImage]
 *        renders one first-person PNG; without it GET /observe/image answers 503
 */
export async function startWorldServer(options) {
  const { IslandWorld, InputError, validateInput, TICK_HZ } = options.module;
  if (options.snapshot) verifyCheckpoint(options.snapshot);
  let world = new IslandWorld(options.snapshot, { world: options.world });
  const spectators = new Set();
  const expectedSpectators = new Map();
  const spectateEvery = Math.max(1, Math.round(TICK_HZ / (options.spectateHz ?? 10)));
  const recordDir = options.recordDir ?? null;
  const archive = new Archive(recordDir, options.recordingLimits);
  const replays = replayArchives(recordDir, options.recordingLimits);
  const seen = new Map(); // Entity id -> last agent request wall-clock time; not spectator traffic.
  let journal = options.snapshot?.journal?.actions?.slice(-200) ?? [];
  let sequence = options.snapshot?.journal?.sequence ?? 0;
  let generation = randomUUID();
  let runId = options.snapshot?.runId ?? null;
  let checkpointError = null;
  let checkpointReceipt = null;
  let checkpointTail = Promise.resolve();
  let checkpointPending = 0;
  let switchDone = Promise.resolve();
  let switching = false;
  const tickTimes = { count: 0, total: 0, max: 0 };
  let recordedActions = world.actions.length;
  let closing = false;
  let shutdown = null;
  const apiMarkdown = () => (typeof options.apiMarkdown === "function" ? options.apiMarkdown(world.worldId) : options.apiMarkdown);

  const record = line => archive.write(line);
  if (!UUID.test(world.instanceId)) throw new Error("Snapshot has an invalid instance identity");
  const identity = () => ({ runId, instanceId: world.instanceId, recordingId: recordDir ? world.instanceId : null });
  const inspection = () => {
    const value = { ...world.spectatorInspection(), instanceId: world.instanceId };
    for (const agent of value.agents) {
      const last = seen.get(agent.id);
      agent.attributes = { ...agent.attributes, Presence: last && Date.now() - last < (options.presenceMs ?? 120_000) ? "active" : "idle" };
    }
    return value;
  };
  const hello = () => ({ ...world.sceneHello(), ...identity(), inspection: inspection(),
    journal: { generation, oldest: journal[0]?.sequence ?? sequence + 1, latest: sequence, limit: 200 } });
  const frame = full => ({ ...world.poseFrame(false), ...identity(), ...(full ? { inspection: inspection() } : {}) });
  const snapshot = () => ({ ...world.snapshot(), runId, journal: { sequence, actions: journal } });
  const checkpoint = () => {
    if (!options.snapshotPath) return checkpointTail;
    // Capture synchronously between ticks; serialize writes to the one atomic target.
    const value = sealCheckpoint(snapshot());
    checkpointPending += 1;
    checkpointTail = checkpointTail.then(() => archive.flush()).then(() => atomicSnapshot(options.snapshotPath, value))
      .then(() => { checkpointError = null; checkpointReceipt = { sha256: value.recovery.sha256, tick: value.tick, instanceId: value.instanceId, savedAt: new Date().toISOString() }; }).catch(error => { checkpointError = error.code || error.message; })
      .finally(() => { checkpointPending -= 1; });
    return checkpointTail;
  };
  await archive.start(world.instanceId);
  await checkpoint();
  if (checkpointError) { await archive.close(); await replays.close(); throw new Error(`Initial checkpoint failed: ${checkpointError}`); }
  record({ kind: "hello", ...hello(), resumedFromTick: options.snapshot ? world.tick : null });

  const write = (response, frame) => {
    // A slow viewer is dropped rather than buffered without bound.
    if (response.writableLength > SPECTATOR_BUFFER_LIMIT) { response.end(); spectators.delete(response); return; }
    response.write(frame);
  };
  const broadcast = (event, payload) => {
    if (spectators.size === 0) return;
    const frame = `event: ${event}\n${event === "action" && payload.id ? `id: ${payload.id}\n` : ""}data: ${JSON.stringify(payload)}\n\n`;
    for (const response of spectators) write(response, frame);
  };

  const tickOnce = () => {
    const started = performance.now();
    if (switching) return;
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
      const poses = frame(world.tick % TICK_HZ === 0);
      broadcast("frame", poses);
      record({ kind: "frame", ...poses });
    }
    if (world.actions.length > recordedActions) {
      for (const action of world.actions.slice(recordedActions)) {
        sequence += 1;
        const entry = { ...action, ...identity(), sequence, id: `${world.instanceId}:${generation}:${sequence}` };
        journal.push(entry);
        while (journal.length > 200 || Buffer.byteLength(JSON.stringify(journal)) > 256 * 1024) journal.shift();
        broadcast("action", entry);
        record({ kind: "action", ...entry });
      }
      if (world.actions.length > 200) world.actions.splice(0, world.actions.length - 200);
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

  const checkpointTimer = options.snapshotPath ? setInterval(() => { if (!checkpointPending && !switching && !closing) checkpoint(); }, Math.max(10, options.snapshotEveryMs ?? 60_000)) : null;
  checkpointTimer?.unref();
  const server = createServer(async (request, response) => {
    response.once("finish", () => { if (closing) server.closeIdleConnections(); });
    try {
      if (closing) return send(response, 503, { error: "World is stopping" });
      const url = new URL(request.url ?? "/", "http://world.local");
      if (await replays.handle(request, response, url)) return;
      const expected = url.searchParams.get("instance");
      const pinned = request.headers["x-world-instance"];
      if ((expected && expected !== world.instanceId) || (pinned && pinned !== world.instanceId)) return send(response, 409, { error: "World instance changed", ...identity() }, READ_ONLY_CORS);
      if (switching) return send(response, 503, { error: "World is switching" });
      const session = request.headers["x-session"];
      const route = `${request.method} ${url.pathname}`;
      const needSession = () => {
        if (world.hasSession(session)) {
          // Entity identity is public; never send the session capability to spectators.
          seen.set(world.sessionEntity(session), Date.now());
          return true;
        }
        send(response, 401, { error: "Missing or unknown X-Session" });
        return false;
      };
      switch (route) {
        case "GET /healthz": return send(response, 200, { ok: !checkpointError && !archive.error, tick: world.tick, world: world.worldId, ...identity(), recording: archive.status(), checkpoint: { enabled: Boolean(options.snapshotPath), error: checkpointError, lastSaved: checkpointReceipt } }, READ_ONLY_CORS);
        case "GET /api.md": return send(response, 200, apiMarkdown());
        case "POST /world": {
          if (!options.operatorToken || request.headers["x-operator-token"] !== options.operatorToken) return send(response, 403, { error: "Operator token required" });
          const body = await readJson(request, InputError);
          if (closing || switching) return send(response, 503, { error: "World is switching or stopping" });
          const wanted = typeof body.world === "string" ? body.world : "";
          if (!options.module.WORLD_IDS.includes(wanted)) throw new InputError(`Body must be {"world": one of ${options.module.WORLD_IDS.join(", ")}, "force"?: boolean}`);
          if (world.agentCount > 0 && body.force !== true) return send(response, 409, { error: `${world.agentCount} agent(s) on this island; pass "force": true to end their sessions` });
          if (body.runId !== undefined && !UUID.test(body.runId)) throw new InputError("runId needs a UUID");
          if (body.runId && body.runId === runId) {
            if (wanted !== world.worldId) return send(response, 409, { error: "Run already bound to another world" });
            return send(response, 200, { world: world.worldId, previous: world.worldId, tick: world.tick, ...identity() });
          }
          const previous = world.worldId;
          // Handlers run between ticks, so the swap is whole-tick.
          // Resolve accepted old-world inputs before ending their sessions.
          tickOnce();
          switching = true;
          let releaseSwitch;
          switchDone = new Promise(resolve => { releaseSwitch = resolve; });
          try {
            await checkpointTail;
            await archive.close();
            world = new IslandWorld(undefined, { world: wanted });
            runId = body.runId ?? null;
            seen.clear(); journal = []; sequence = 0; generation = randomUUID(); recordedActions = 0;
            await archive.start(world.instanceId);
            record({ kind: "hello", ...hello(), runId: body.runId ?? null, resumedFromTick: null });
            await checkpoint();
            for (const response of spectators) if (expectedSpectators.get(response)) {
              response.end(); spectators.delete(response); expectedSpectators.delete(response);
            }
            broadcast("hello", hello());
            broadcast("frame", frame(true));
            return send(response, 200, { world: world.worldId, previous, tick: world.tick, ...identity(), runId: body.runId ?? null });
          } finally { switching = false; releaseSwitch(); }
        }
        case "POST /join": {
          // An X-Session the world already knows rejoins it (Clawblox's /join contract).
          const joined = world.join(url.searchParams.get("name") ?? "Agent", typeof session === "string" ? session : null);
          seen.set(world.sessionEntity(joined.session), Date.now());
          return send(response, 200, { ...joined, ...identity() });
        }
        case "POST /leave":
          if (!needSession()) return undefined;
          seen.delete(world.sessionEntity(session));
          return send(response, 200, { left: world.leave(session) });
        case "GET /observe": return needSession() ? send(response, 200, world.observe(session)) : undefined;
        case "POST /input": {
          if (!needSession()) return undefined;
          const input = validateInput(await readJson(request, InputError));
          if (closing) return send(response, 503, { error: "World is stopping" });
          const targetWorld = world;
          if (options.realtime === false) targetWorld.apply(session, input);
          else await targetWorld.enqueue(session, input);
          if (targetWorld !== world) return send(response, 409, { error: "World instance changed", ...identity() });
          return send(response, 200, targetWorld.observe(session));
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
          return send(response, 200, snapshot());
        case "GET /spectate": {
          if (spectators.size >= MAX_SPECTATORS) return send(response, 429, { error: "Spectator capacity reached; retry later" }, { "retry-after": "5" });
          response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no", ...READ_ONLY_CORS });
          const cursor = url.searchParams.get("after") || request.headers["last-event-id"] || "";
          const [cursorInstance, cursorGeneration, cursorSequence] = String(cursor).split(":");
          const validCursor = cursorInstance === world.instanceId && cursorGeneration === generation && /^\d+$/.test(cursorSequence)
            && Number.isSafeInteger(Number(cursorSequence)) && Number(cursorSequence) <= sequence;
          const after = validCursor ? Number(cursorSequence) : 0;
          const opening = hello();
          opening.journal.truncated = after < opening.journal.oldest - 1;
          opening.journal.reset = Boolean(cursor && !validCursor);
          response.write(`event: hello\ndata: ${JSON.stringify(opening)}\n\n`);
          for (const action of journal) if (action.sequence > after) response.write(`event: action\nid: ${action.id}\ndata: ${JSON.stringify(action)}\n\n`);
          response.write(`event: frame\ndata: ${JSON.stringify(frame(true))}\n\n`);
          spectators.add(response);
          expectedSpectators.set(response, expected || pinned);
          request.once("close", () => { spectators.delete(response); expectedSpectators.delete(response); });
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
    /** The running island (POST /world replaces it). */
    get world() { return world; },
    server,
    tick: tickOnce,
    checkpoint,
    url: `http://${options.host ?? "127.0.0.1"}:${port}`,
    stats: () => ({ ticks: tickTimes.count, meanTickMs: tickTimes.count ? tickTimes.total / tickTimes.count : 0, maxTickMs: tickTimes.max, spectators: spectators.size }),
    close: () => shutdown ??= (async () => {
      closing = true;
      // Stop admitting sockets before draining the queued inputs. Otherwise
      // disabling the tick loop strands their HTTP handlers forever.
      const closed = new Promise((resolve) => server.close(() => resolve()));
      if (timer) clearInterval(timer);
      if (heartbeat) clearInterval(heartbeat);
      if (checkpointTimer) clearInterval(checkpointTimer);
      await switchDone;
      if (options.realtime !== false) tickOnce();
      for (const response of spectators) response.end();
      spectators.clear();
      await replays.close();
      await closed;
      await checkpoint();
      await archive.close();
    })(),
  };
}

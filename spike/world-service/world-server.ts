/// <reference types="vite/client" />
// Clawblox world protocol over a headless GraphysX island.
//
//   POST /join?name=X -> {session, agent_id}      GET /observe   (X-Session)
//   POST /input {type, data} -> observation         POST /chat, GET /chat/messages
//   GET /api.md                                     GET /snapshot  (X-Operator-Token)
//   GET /spectate  (SSE: hello = v2 document, frame = poses at spectateHz)
//   GET /healthz
//
// One fixed-tick loop owns the world; HTTP handlers only queue input or read state.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { InputError, IslandWorld, TICK_HZ, validateInput } from "./island-world";
import API_MD from "./API.md?raw";

export interface WorldServerOptions {
  host?: string;
  port?: number;
  operatorToken?: string | null;
  recordDir?: string | null;
  spectateHz?: number;
  /** false: the caller drives `world.step()` (tests). */
  realtime?: boolean;
}

export interface WorldServer {
  world: IslandWorld;
  server: Server;
  url: string;
  stats(): { ticks: number; meanTickMs: number; maxTickMs: number; spectators: number };
  close(): Promise<void>;
}

const MAX_BODY_BYTES = 64 * 1024;

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  response.writeHead(status, {
    "content-type": typeof body === "string" ? "text/markdown; charset=utf-8" : "application/json",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(text);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new InputError("Body too large");
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InputError("Body is not valid JSON");
  }
}

export async function startWorldServer(options: WorldServerOptions = {}): Promise<WorldServer> {
  const world = new IslandWorld();
  const spectators = new Set<ServerResponse>();
  const spectateEvery = Math.max(1, Math.round(TICK_HZ / (options.spectateHz ?? 10)));
  const recordFile = options.recordDir ? join(options.recordDir, "graphysx-recording.ndjson") : null;
  const tickTimes = { count: 0, total: 0, max: 0 };
  let recordedActions = 0;

  if (recordFile) {
    mkdirSync(options.recordDir!, { recursive: true });
    appendFileSync(recordFile, `${JSON.stringify({ kind: "hello", ...world.sceneHello() })}\n`);
  }

  const broadcast = (event: string, payload: unknown) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const response of spectators) {
      // A slow viewer is dropped rather than buffered without bound.
      if (response.writableLength > 1 << 20) { response.end(); spectators.delete(response); continue; }
      response.write(frame);
    }
  };

  const tickOnce = () => {
    const started = performance.now();
    world.step();
    const elapsed = performance.now() - started;
    tickTimes.count += 1;
    tickTimes.total += elapsed;
    tickTimes.max = Math.max(tickTimes.max, elapsed);
    if (world.tick % spectateEvery === 0) {
      const frame = world.poseFrame();
      if (spectators.size > 0) broadcast("frame", frame);
      if (recordFile) appendFileSync(recordFile, `${JSON.stringify({ kind: "frame", ...frame })}\n`);
    }
    if (recordFile && world.actions.length > recordedActions) {
      for (const action of world.actions.slice(recordedActions)) appendFileSync(recordFile, `${JSON.stringify({ kind: "action", ...action })}\n`);
      recordedActions = world.actions.length;
    }
  };

  // Fixed tick against the wall clock; never more than 4 catch-up ticks per wake.
  let timer: NodeJS.Timeout | null = null;
  if (options.realtime !== false) {
    let last = performance.now();
    let accumulator = 0;
    timer = setInterval(() => {
      const now = performance.now();
      accumulator = Math.min(accumulator + (now - last) / 1000, 4 / TICK_HZ);
      last = now;
      while (accumulator >= 1 / TICK_HZ) { tickOnce(); accumulator -= 1 / TICK_HZ; }
    }, 1000 / TICK_HZ / 2);
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://world.local");
      const session = request.headers["x-session"] as string | undefined;
      const route = `${request.method} ${url.pathname}`;
      const needSession = () => {
        if (!world.hasSession(session)) { send(response, 401, { error: "Missing or unknown X-Session" }); return false; }
        return true;
      };
      switch (route) {
        case "GET /healthz": return send(response, 200, { ok: true, tick: world.tick });
        case "GET /api.md": return send(response, 200, API_MD);
        case "POST /join": return send(response, 200, world.join(url.searchParams.get("name") ?? "Agent"));
        case "GET /observe": return needSession() ? send(response, 200, world.observe(session!)) : undefined;
        case "POST /input": {
          if (!needSession()) return undefined;
          const input = validateInput(await readJson(request));
          if (options.realtime === false) { world.apply(session!, input); return send(response, 200, world.observe(session!)); }
          await world.enqueue(session!, input);
          return send(response, 200, world.observe(session!));
        }
        case "POST /chat": {
          if (!needSession()) return undefined;
          const body = (await readJson(request)) as { content?: unknown };
          if (typeof body.content !== "string" || !body.content.trim()) throw new InputError("Body must be {\"content\": string}");
          return send(response, 200, world.postChat(session!, body.content));
        }
        case "GET /chat/messages":
          return needSession() ? send(response, 200, world.chatMessages(url.searchParams.get("after"), Number(url.searchParams.get("limit") ?? 20))) : undefined;
        case "GET /observe/image":
          return send(response, 501, { error: "First-person images are not part of this spike (see design doc, phase 3)" });
        case "GET /snapshot":
          if (!options.operatorToken || request.headers["x-operator-token"] !== options.operatorToken) return send(response, 403, { error: "Operator token required" });
          return send(response, 200, world.snapshot());
        case "GET /spectate": {
          response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
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
      return send(response, 500, { error: String((error as Error)?.message ?? error) });
    }
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, options.host ?? "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  return {
    world,
    server,
    url: `http://${options.host ?? "127.0.0.1"}:${port}`,
    stats: () => ({ ticks: tickTimes.count, meanTickMs: tickTimes.count ? tickTimes.total / tickTimes.count : 0, maxTickMs: tickTimes.max, spectators: spectators.size }),
    close: async () => {
      if (timer) clearInterval(timer);
      for (const response of spectators) response.end();
      spectators.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

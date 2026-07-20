// The scene store: the server that holds saved scenes so something other than one
// browser tab can reach them. localStorage was fine while the editor was the only
// client; an agent on another machine cannot see it.
//
// Milestone A of the shared-scene ladder. Deliberately document-level: a scene is a
// whole `graphysx.agent-world/v2` definition plus a revision, and writers do
// read-modify-write guarded by `expectedRevision`. No runtime runs here — applying a
// change set needs three + cannon, which are browser-side — so this stays a dumb,
// dependency-free store and the concurrency check is the same optimistic one the
// runtime already does in-page (agent-world-runtime.ts:835).
//
// Zero dependencies on purpose: this has to be trivial to run on the AgentX box.

import { createServer } from "node:http";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCommands, describeCommands } from "./scene-commands.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

export const SCENE_STORE_SCHEMA = "graphysx.scene-store/v1";
const WORLD_SCHEMA = "graphysx.agent-world/v2";

/** Same shape the runtime enforces for stable ids, so store names and world ids agree. */
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;

const DEFAULT_PORT = Number(process.env.GRAPHYSX_STORE_PORT ?? 8788);
const DEFAULT_DIR = process.env.GRAPHYSX_STORE_DIR ?? join(REPO_ROOT, ".graphysx-store", "scenes");

/**
 * Writes are serialised per scene name. Two agents racing on the same scene would
 * otherwise interleave read-check-write and both believe they won.
 */
const writeChains = new Map();

function queueWrite(name, task) {
  const previous = writeChains.get(name) ?? Promise.resolve();
  const next = previous.then(task, task);
  // Keep the chain alive but never let a rejection poison the next writer.
  writeChains.set(name, next.then(() => undefined, () => undefined));
  return next;
}

function scenePath(dir, name) {
  return join(dir, `${name}.json`);
}

/**
 * Validates only what the store itself depends on. The runtime re-validates in full on
 * load (agent-world-runtime.ts:1888) and it owns the deeper entity rules — duplicating
 * them here would mean two schemas drifting apart.
 */
function assertDefinition(definition) {
  if (!definition || typeof definition !== "object") throw new Error("A scene definition object is required");
  if (definition.schema !== WORLD_SCHEMA) throw new Error(`Scene schema must be ${WORLD_SCHEMA}`);
  if (typeof definition.id !== "string" || !definition.id.trim()) throw new Error("Scene definition requires an id");
  if (typeof definition.label !== "string" || !definition.label.trim()) throw new Error("Scene definition requires a label");
  if (!Array.isArray(definition.entities)) throw new Error("Scene entities must be an array");
  // A stored scene is the document — what the scene *is*. Entities marked ephemeral are
  // session state, so a document containing them is a contradiction and almost always means
  // a client pushed `export()` where it meant `exportDocument()`.
  const ephemeral = definition.entities.filter((entity) => entity?.ephemeral).map((entity) => entity.id);
  if (ephemeral.length > 0) {
    throw new Error(`Scene documents cannot contain session-only entities: ${ephemeral.slice(0, 5).join(", ")}`);
  }
}

function assertName(name) {
  if (!NAME_PATTERN.test(name ?? "")) throw new Error(`Invalid scene name: ${name}`);
}

async function readRecord(dir, name) {
  try {
    return JSON.parse(await readFile(scenePath(dir, name), "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Write to a sibling temp file then rename, so a crash mid-write cannot truncate a scene.
 * On Windows, rename over an existing target throws EPERM whenever a scanner or indexer
 * momentarily holds the file, so the rename gets a bounded retry — the hold is measured
 * in milliseconds, and failing the write over it turned a passing smoke red for months.
 */
const RENAME_ATTEMPTS = 5;
const RENAME_RETRY_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

async function writeRecord(dir, name, record) {
  const target = scenePath(dir, name);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(temporary, target);
      return;
    } catch (error) {
      if (attempt >= RENAME_ATTEMPTS || !RENAME_RETRY_CODES.has(error?.code)) {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
      await delay(20 * attempt);
    }
  }
}

export function createSceneStore({ dir = DEFAULT_DIR } = {}) {
  const ready = mkdir(dir, { recursive: true });

  return {
    dir,

    async list() {
      await ready;
      const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
      const scenes = [];
      for (const file of files) {
        const record = await readRecord(dir, file.slice(0, -5));
        if (!record) continue;
        scenes.push({
          name: record.name,
          revision: record.revision,
          updatedAt: record.updatedAt,
          actor: record.actor ?? null,
          intent: record.intent ?? null,
          label: record.definition?.label ?? null,
          entityCount: Array.isArray(record.definition?.entities) ? record.definition.entities.length : 0,
        });
      }
      return scenes.sort((a, b) => a.name.localeCompare(b.name));
    },

    async get(name) {
      assertName(name);
      await ready;
      return readRecord(dir, name);
    },

    /**
     * Optimistic write. `expectedRevision` omitted means "I do not care what is there" —
     * fine for a first upload or a deliberate overwrite, wrong for an agent editing a
     * scene a human is also touching. Hermes should always send it.
     */
    async put(name, definition, expectedRevision, { actor = null, intent = null } = {}) {
      assertName(name);
      assertDefinition(definition);
      if (actor !== null && !NAME_PATTERN.test(actor)) throw new Error(`Invalid actor id: ${actor}`);
      await ready;
      return queueWrite(name, async () => {
        const current = await readRecord(dir, name);
        const currentRevision = current?.revision ?? 0;
        if (expectedRevision !== undefined) {
          if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
            throw Object.assign(new Error("expectedRevision must be a non-negative integer"), { status: 400 });
          }
          if (expectedRevision !== currentRevision) {
            throw Object.assign(
              new Error(`Revision conflict: expected ${expectedRevision}, current ${currentRevision}`),
              { status: 409, revision: currentRevision },
            );
          }
        }
        const record = {
          schema: SCENE_STORE_SCHEMA,
          name,
          revision: currentRevision + 1,
          updatedAt: new Date().toISOString(),
          // Who last touched this and why. With one human and one agent this is a nicety;
          // with Hermes, OpenClaw and AgentX sharing a scene it is how you tell them apart.
          actor,
          intent: typeof intent === "string" && intent.trim() ? intent.trim().slice(0, 240) : null,
          definition,
        };
        await writeRecord(dir, name, record);
        return {
          name,
          revision: record.revision,
          updatedAt: record.updatedAt,
          actor: record.actor,
          intent: record.intent,
          created: current === null,
        };
      });
    },
  };
}

function send(response, status, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    // The page is served by vite/nginx on a different origin than this store, so the
    // browser client is always cross-origin. This is a LAN tool with no auth — put it
    // behind the same boundary you'd put any other AgentX service, not on the internet.
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, PUT, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(body);
}

async function readJsonBody(request, limitBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limitBytes) throw Object.assign(new Error("Request body too large"), { status: 413 });
    chunks.push(chunk);
  }
  if (size === 0) throw Object.assign(new Error("A JSON body is required"), { status: 400 });
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON"), { status: 400 });
  }
}

/**
 * The relay: everyone watching a scene, and the recent deltas they may have missed.
 *
 * Milestone B. Until now a remote change was noticed by polling a revision and then
 * *reloading the whole document*, which discarded everything the person watching was doing
 * — a thrown ball died every time an agent moved a crate. That is turn-taking, not
 * collaboration. Broadcasting the commands instead lets each client apply the same change
 * to its live world and keep the rest.
 *
 * Server-Sent Events rather than WebSockets: it is a few lines on node:http with no
 * dependency, needs no upgrade block in nginx, and EventSource reconnects on its own with
 * Last-Event-ID — which is exactly the resume-from-a-sequence-number shape the runtime's
 * event stream already uses. The traffic is deltas down and commands up over ordinary POST,
 * so the half of WebSockets we would use is the half SSE already gives us.
 */
function createRelay() {
  /** scene name → set of open response streams. */
  const subscribers = new Map();
  /** scene name → recent deltas, so a reconnecting client can catch up rather than reload. */
  const backlog = new Map();
  const BACKLOG = 128;

  return {
    subscribe(name, response) {
      const set = subscribers.get(name) ?? new Set();
      set.add(response);
      subscribers.set(name, set);
      return () => {
        set.delete(response);
        if (set.size === 0) subscribers.delete(name);
      };
    },

    /** Deltas after `sinceRevision`, or null when the gap is too old to bridge. */
    catchUp(name, sinceRevision) {
      const entries = backlog.get(name) ?? [];
      if (entries.length === 0) return [];
      const oldest = entries[0].revision;
      // The client is further behind than we can prove; it must reload rather than be told
      // a partial story.
      if (sinceRevision + 1 < oldest) return null;
      return entries.filter((entry) => entry.revision > sinceRevision);
    },

    publish(name, delta) {
      const entries = backlog.get(name) ?? [];
      entries.push(delta);
      while (entries.length > BACKLOG) entries.shift();
      backlog.set(name, entries);

      const payload = `id: ${delta.revision}\ndata: ${JSON.stringify(delta)}\n\n`;
      for (const response of subscribers.get(name) ?? []) {
        // A dead socket must not take the write path down with it.
        try {
          response.write(payload);
        } catch {
          // The 'close' handler will unsubscribe it.
        }
      }
    },

    subscriberCount(name) {
      return subscribers.get(name)?.size ?? 0;
    },
  };
}

export function createSceneStoreServer({ dir } = {}) {
  const store = createSceneStore({ dir });
  const relay = createRelay();

  const server = createServer((request, response) => {
    void (async () => {
      try {
        const url = new URL(request.url ?? "/", "http://localhost");
        const path = url.pathname.replace(/\/+$/, "") || "/";

        if (request.method === "OPTIONS") return send(response, 204, {});

        if (path === "/health" && request.method === "GET") {
          const scenes = await store.list();
          return send(response, 200, { ok: true, schema: SCENE_STORE_SCHEMA, dir: store.dir, sceneCount: scenes.length });
        }

        if (path === "/scenes" && request.method === "GET") {
          return send(response, 200, { schema: SCENE_STORE_SCHEMA, scenes: await store.list() });
        }

        const sceneMatch = /^\/scenes\/([^/]+)$/.exec(path);
        const revisionMatch = /^\/scenes\/([^/]+)\/revision$/.exec(path);
        const streamMatch = /^\/scenes\/([^/]+)\/stream$/.exec(path);
        const changesMatch = /^\/scenes\/([^/]+)\/changes$/.exec(path);

        // --- the live feed --------------------------------------------------------
        if (streamMatch && request.method === "GET") {
          const name = decodeURIComponent(streamMatch[1]);
          assertName(name);
          const record = await store.get(name);
          if (!record) return send(response, 404, { error: `Unknown scene: ${name}` });

          // EventSource replays its last id on reconnect; honour it so a dropped
          // connection resumes rather than forcing a reload.
          const lastEventId = Number(request.headers["last-event-id"] ?? url.searchParams.get("since") ?? 0);
          const missed = Number.isFinite(lastEventId) && lastEventId > 0 ? relay.catchUp(name, lastEventId) : [];

          response.writeHead(200, {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
            connection: "keep-alive",
            // Proxies that buffer will hold events until the buffer fills, which turns a
            // live feed into a batch one. nginx honours this.
            "x-accel-buffering": "no",
            "access-control-allow-origin": "*",
          });

          // The client needs to know where it stands before any delta arrives, and whether
          // catching up was even possible.
          response.write(`event: hello\ndata: ${JSON.stringify({
            name,
            revision: record.revision,
            resumed: missed !== null && lastEventId > 0,
            mustReload: missed === null,
          })}\n\n`);
          for (const delta of missed ?? []) response.write(`id: ${delta.revision}\ndata: ${JSON.stringify(delta)}\n\n`);

          // Idle connections get closed by intermediaries; a comment line is a no-op that
          // keeps them open without being delivered as an event.
          const heartbeat = setInterval(() => {
            try {
              response.write(": ping\n\n");
            } catch {
              // Cleanup happens on close.
            }
          }, 25000);
          const unsubscribe = relay.subscribe(name, response);
          request.on("close", () => {
            clearInterval(heartbeat);
            unsubscribe();
          });
          return undefined;
        }

        // --- commands in, delta out ------------------------------------------------
        if (changesMatch && request.method === "POST") {
          const name = decodeURIComponent(changesMatch[1]);
          assertName(name);
          const body = await readJsonBody(request);
          const record = await store.get(name);
          if (!record) return send(response, 404, { error: `Unknown scene: ${name}` });
          if (body?.expectedRevision !== undefined && body.expectedRevision !== record.revision) {
            return send(response, 409, {
              error: `Revision conflict: expected ${body.expectedRevision}, current ${record.revision}`,
              revision: record.revision,
            });
          }

          const commands = Array.isArray(body?.commands) ? body.commands : [body?.commands];
          const { definition, outputs } = applyCommands(record.definition, commands);
          const actor = body?.actor ?? null;
          const intent = body?.intent ?? describeCommands(commands, outputs);
          const written = await store.put(name, definition, record.revision, { actor, intent });

          // The delta, not the document. This is the whole point of milestone B: a client
          // applies these commands to its live world and keeps everything else — the ball
          // it just threw, the physics mid-flight, where it was looking.
          relay.publish(name, {
            name,
            revision: written.revision,
            parentRevision: record.revision,
            actor,
            intent: written.intent,
            commands,
            outputs,
          });
          return send(response, 200, { ...written, outputs, subscribers: relay.subscriberCount(name) });
        }

        // A deliberately tiny endpoint: the browser polls this every couple of seconds
        // and only pulls the whole document when the number actually moves.
        if (revisionMatch && request.method === "GET") {
          const name = decodeURIComponent(revisionMatch[1]);
          assertName(name);
          const record = await store.get(name);
          if (!record) return send(response, 404, { error: `Unknown scene: ${name}` });
          return send(response, 200, {
            name,
            revision: record.revision,
            updatedAt: record.updatedAt,
            actor: record.actor ?? null,
            intent: record.intent ?? null,
          });
        }

        if (sceneMatch) {
          const name = decodeURIComponent(sceneMatch[1]);
          assertName(name);

          if (request.method === "GET") {
            const record = await store.get(name);
            if (!record) return send(response, 404, { error: `Unknown scene: ${name}` });
            return send(response, 200, record);
          }

          if (request.method === "PUT") {
            const body = await readJsonBody(request);
            // Accept either {definition, expectedRevision} or a bare definition, so
            // `curl -d @scene.json` works without ceremony.
            const definition = body?.definition ?? body;
            const expectedRevision = body?.expectedRevision;
            const result = await store.put(name, definition, expectedRevision, {
              actor: body?.actor ?? null,
              intent: body?.intent ?? null,
            });
            // A whole-document write cannot be expressed as commands, so subscribers are
            // told to reload rather than handed a delta they cannot apply. Honest, and rare
            // — this is the seed/import path, not the editing one.
            relay.publish(name, {
              name,
              revision: result.revision,
              parentRevision: expectedRevision ?? null,
              actor: result.actor,
              intent: result.intent,
              replaced: true,
            });
            return send(response, result.created ? 201 : 200, result);
          }
        }

        return send(response, 404, { error: `No route for ${request.method} ${path}` });
      } catch (error) {
        const status = error?.status ?? 400;
        const payload = { error: error instanceof Error ? error.message : String(error) };
        if (error?.revision !== undefined) payload.revision = error.revision;
        return send(response, status, payload);
      }
    })();
  });

  return { server, store };
}

export async function startSceneStore({ port = DEFAULT_PORT, dir } = {}) {
  const { server, store } = createSceneStoreServer({ dir });
  // Node closes idle keep-alive sockets after 5s by default, but `fetch` (undici) pools and
  // reuses them — so a client that pauses longer than that between calls picks a socket the
  // server has already closed and fails with a bare "fetch failed". That is what made the
  // scene-store smoke fail after its browser phase: seeding worked, the page loaded, and the
  // next agent call died on a stale socket. Outliving any realistic client pause fixes it.
  server.keepAliveTimeout = 72_000;
  server.headersTimeout = 75_000;

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, () => resolveListen(undefined));
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    port: actualPort,
    // 127.0.0.1 rather than localhost: on Windows, Node's fetch resolves localhost to ::1
    // first, and whether that reaches a listener bound to the IPv4 any-address is a coin
    // flip. It surfaced as an intermittent "scene store unreachable" against a store that
    // was demonstrably listening. The server still binds every interface, so a LAN client
    // reaching it by hostname is unaffected.
    url: `http://127.0.0.1:${actualPort}`,
    store,
    async close() {
      await new Promise((resolveClose) => server.close(() => resolveClose(undefined)));
    },
  };
}

// `node server/scene-store.mjs` runs it; importing it does not.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const dir = DEFAULT_DIR;
  const existed = existsSync(dir);
  startSceneStore({ port: DEFAULT_PORT, dir })
    .then(({ url }) => {
      console.log(`graphysx scene store listening on ${url}`);
      console.log(`  scenes: ${dir}${existed ? "" : " (created)"}`);
      console.log(`  try:    curl ${url}/scenes`);
    })
    .catch((error) => {
      console.error(`scene store failed to start: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}

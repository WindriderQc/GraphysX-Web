// The scene store: the server that holds saved scenes so something other than one
// browser tab can reach them. localStorage was fine while the editor was the only
// client; an agent on another machine cannot see it.
//
// Milestone A of the shared-scene ladder. Deliberately document-level: a scene is a
// whole `graphysx.agent-world/v2` definition plus a revision, and writers do
// read-modify-write guarded by `expectedRevision`. No runtime runs here — applying a
// change set needs Three.js + the physics runtime, which are browser-side — so this stays a dumb,
// dependency-free store and the concurrency check is the same optimistic one the
// runtime already does in-page (agent-world-runtime.ts:835).
//
// Zero dependencies on purpose: this has to be trivial to run on the AgentX box.

import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCommands, describeCommands } from "./scene-commands.mjs";
import { assertAuthoredWorldEntityNamespaces } from "./host-entity-id-policy.mjs";
import { decodeStoreName, encodeStoreName } from "./store-paths.mjs";
import { createAssetStore, handleAssetRequest } from "./asset-store.mjs";
import { CORS_ALLOW_HEADERS, CORS_ALLOW_METHODS, readJsonBody, sendJson as send } from "./http-util.mjs";
import { createLiveSessions } from "./live-sessions.mjs";
import { createResultsStore, handleResultsRequest } from "./results-store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

export const SCENE_STORE_SCHEMA = "graphysx.scene-store/v1";
const WORLD_SCHEMA = "graphysx.agent-world/v2";

/** Same shape the runtime enforces for stable ids, so store names and world ids agree. */
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;

const DEFAULT_PORT = Number(process.env.GRAPHYSX_STORE_PORT ?? 8788);
const DEFAULT_DIR = process.env.GRAPHYSX_STORE_DIR ?? join(REPO_ROOT, ".graphysx-store", "scenes");
/**
 * Loopback by default.
 *
 * `server.listen(port)` binds every interface, and this file used to print
 * `http://127.0.0.1:<port>` afterwards — a client-convenience URL that reads exactly like a
 * claim about the bind. Behind nginx that gap meant the store was reachable on the box's
 * public interface with only the firewall containing it, while the log said otherwise.
 *
 * Defaulting to loopback rather than preserving the old behaviour is a deliberate change of
 * mind: when this was a scene store, "LAN tool" was the honest framing. It now holds session
 * credentials, invitations and results, so the safe default moved. LAN use is one explicit
 * env var away, and the banner below names it when you are bound narrowly.
 */
const DEFAULT_HOST = process.env.GRAPHYSX_STORE_HOST ?? "127.0.0.1";

/**
 * Auth + CORS for both halves of the store — the asset routes receive this guard from the
 * router below rather than building their own, so the two halves cannot drift.
 *
 * Opt-in on purpose: with no GRAPHYSX_STORE_TOKEN set the store behaves exactly as it
 * always has — open on the LAN — and says so loudly at startup. With a token set, every
 * mutating route and everything under /datalake requires it; read-only scene GETs stay
 * open in both modes, because a stored scene is the shareable artifact and the datalake
 * is personal media.
 */
export function createStoreGuard({
  token = process.env.GRAPHYSX_STORE_TOKEN,
  origins = process.env.GRAPHYSX_STORE_ORIGIN,
} = {}) {
  const cleaned = typeof token === "string" && token.trim() ? token.trim() : null;
  // Compare sha256 digests, not the strings: timingSafeEqual demands equal lengths, and a
  // digest comparison cannot leak where the first wrong byte was.
  const expected = cleaned ? createHash("sha256").update(cleaned).digest() : null;
  const allowlist = (typeof origins === "string" ? origins.split(",") : Array.isArray(origins) ? origins : [])
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  return {
    enabled: expected !== null,

    /**
     * CORS headers for one response. No allowlist → today's `*` (compat). An allowlist
     * echoes the request's Origin only when it matches — a miss gets no allow-origin
     * header at all — and always varies on Origin so caches cannot cross-serve.
     */
    corsHeaders(request) {
      if (allowlist.length === 0) return { "access-control-allow-origin": "*" };
      const headers = { vary: "origin" };
      const origin = String(request.headers.origin ?? "").replace(/\/+$/, "");
      if (origin && allowlist.includes(origin)) headers["access-control-allow-origin"] = origin;
      return headers;
    },

    /**
     * Whether an Origin is on the allowlist. `corsHeaders` merely withholds a header on a
     * miss, which stops a browser and does nothing to a script; routes that need to
     * *reject* an origin (live sessions) ask this instead. No allowlist configured means
     * no origin policy to enforce, so everything is allowed — same compat rule as CORS.
     */
    originAllowed(origin) {
      if (allowlist.length === 0) return true;
      return allowlist.includes(String(origin ?? "").replace(/\/+$/, ""));
    },

    /** `Authorization: Bearer <token>` or `x-graphysx-token`. Always true in open mode. */
    authorized(request) {
      if (!expected) return true;
      const header = request.headers.authorization;
      let presented = null;
      if (typeof header === "string" && /^bearer\s/i.test(header)) presented = header.replace(/^bearer\s+/i, "").trim();
      else if (typeof request.headers["x-graphysx-token"] === "string") presented = request.headers["x-graphysx-token"].trim();
      if (!presented) return false;
      return timingSafeEqual(createHash("sha256").update(presented).digest(), expected);
    },
  };
}

/**
 * Writes are serialised per scene name. Two agents racing on the same scene would
 * otherwise interleave read-check-write and both believe they won.
 */
const writeChains = new Map();

function queueWrite(name, task) {
  const previous = writeChains.get(name) ?? Promise.resolve();
  const next = previous.then(task, task);
  // Keep the chain alive but never let a rejection poison the next writer.
  const settled = next.then(() => undefined, () => undefined);
  writeChains.set(name, settled);
  // Release the entry once this is both the tail and finished. Without this the map gained a
  // permanent entry per scene name ever written and lost none — small individually, unbounded
  // in aggregate, and keyed by a name a client chooses. Re-reading the map rather than
  // deleting unconditionally is what makes it safe: if another writer appended in the
  // meantime, the tail is theirs and dropping it would let a third writer race them.
  void settled.then(() => {
    if (writeChains.get(name) === settled) writeChains.delete(name);
  });
  return next;
}

/**
 * The store's ids are not filenames. `:` is legal in a scene name and illegal on NTFS, where
 * it opens an alternate data stream instead — see server/store-paths.mjs for the measurement
 * and for why this is not a migration.
 */
function scenePath(dir, name) {
  return join(dir, `${encodeStoreName(name)}.json`);
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
  assertAuthoredWorldEntityNamespaces(definition);
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
        // Decoded back to the public name before it goes near `readRecord`, which encodes
        // again on the way in. Passing the on-disk name straight through would double-encode
        // and make every escaped scene invisible to its own listing.
        const record = await readRecord(dir, decodeStoreName(file.slice(0, -5)));
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

// `send` and `readJsonBody` now live in http-util.mjs — there were two copies of each in
// this tree and one allow-headers list per copy. The page is served by vite/nginx on a
// different origin than this store, so the browser client is always cross-origin; `cors`
// comes from the guard (`*` unless GRAPHYSX_STORE_ORIGIN narrows it). Without a
// GRAPHYSX_STORE_TOKEN this is still a LAN tool with no auth for scene routes — keep it
// behind the same boundary as any other AgentX service, not on the internet. Live session
// routes refuse to run in that mode at all (live-sessions.mjs).

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
function createRelay({ now = () => Date.now() } = {}) {
  /** scene name → set of open response streams. */
  const subscribers = new Map();
  /** scene name → { entries, bytes, touchedAt }, so a reconnect catches up rather than reloads. */
  const backlog = new Map();
  const BACKLOG = 128;
  /**
   * Three bounds, because the count alone was none of them.
   *
   * A delta carries the whole submitted command list, so 128 of them is bounded only by the
   * body limit — and the map itself was keyed by scene name and never pruned, so a store
   * that had served a few thousand distinct scenes held a few thousand backlogs forever,
   * every one of them for a scene nobody was watching. The map is the leak; the bytes are
   * the size of it; the idle sweep is what makes both self-correcting.
   */
  const BACKLOG_BYTES = 4 * 1024 * 1024;
  const BACKLOG_IDLE_MS = 30 * 60 * 1000;

  /** Drops backlogs for scenes with no subscriber that nobody has published to in a while. */
  function sweepIdle() {
    const at = now();
    for (const [name, held] of backlog) {
      if (subscribers.has(name)) continue;
      if (at - held.touchedAt > BACKLOG_IDLE_MS) backlog.delete(name);
    }
  }

  return {
    subscribe(name, response) {
      const set = subscribers.get(name) ?? new Set();
      set.add(response);
      subscribers.set(name, set);
      return () => {
        set.delete(response);
        if (set.size === 0) {
          subscribers.delete(name);
          // Losing the last watcher is the moment a backlog stops being worth anything to
          // anyone but a client that reconnects shortly; the idle sweep collects it after.
          sweepIdle();
        }
      };
    },

    /**
     * Deltas after `sinceRevision`, or null when the gap is too old to bridge.
     *
     * Retained entries wrap the delta rather than extending it. A `bytes` field written onto
     * the delta itself would be serialized into replayed frames but not into the live ones —
     * the live frame is stringified before retention — so a reconnecting client would receive
     * a different object than everyone else saw.
     */
    catchUp(name, sinceRevision) {
      const entries = backlog.get(name)?.entries ?? [];
      if (entries.length === 0) return [];
      const oldest = entries[0].revision;
      // The client is further behind than we can prove; it must reload rather than be told
      // a partial story.
      if (sinceRevision + 1 < oldest) return null;
      return entries.filter((entry) => entry.revision > sinceRevision).map((entry) => entry.delta);
    },

    publish(name, delta) {
      const payload = JSON.stringify(delta);
      const bytes = Buffer.byteLength(payload);
      const held = backlog.get(name) ?? { entries: [], bytes: 0, touchedAt: now() };
      held.entries.push({ revision: delta.revision, bytes, delta });
      held.bytes += bytes;
      held.touchedAt = now();
      // Keep the newest even when it alone exceeds the budget: it is what a client
      // reconnecting right now needs, and dropping it would empty the backlog for everyone.
      while (held.entries.length > BACKLOG || (held.bytes > BACKLOG_BYTES && held.entries.length > 1)) {
        held.bytes = Math.max(0, held.bytes - (held.entries.shift()?.bytes ?? 0));
      }
      backlog.set(name, held);

      const frame = `id: ${delta.revision}\ndata: ${payload}\n\n`;
      // Snapshotted: ending a stalled stream removes it from this set mid-iteration.
      for (const response of [...(subscribers.get(name) ?? [])]) {
        // A subscriber further behind than the whole backlog cannot be caught up by it, so
        // every byte still queued for it is data it would discard on arrival. End the stream
        // instead; EventSource reconnects and takes the reload the hello frame will offer.
        // See the same reasoning, at length, in live-sessions.mjs.
        if ((response.writableLength ?? 0) > BACKLOG_BYTES) {
          try {
            response.end();
          } catch {
            // Already gone; the 'close' handler unsubscribes it either way.
          }
          continue;
        }
        // A dead socket must not take the write path down with it.
        try {
          response.write(frame);
        } catch {
          // The 'close' handler will unsubscribe it.
        }
      }
    },

    subscriberCount(name) {
      return subscribers.get(name)?.size ?? 0;
    },

    /** Diagnostic only: names held, and the bytes they hold. Never a delta body. */
    backlogStats() {
      let bytes = 0;
      for (const held of backlog.values()) bytes += held.bytes;
      return { names: backlog.size, bytes };
    },
  };
}

export function createSceneStoreServer({ dir, assetDir, datalakeDir, resultsDir, token, origins } = {}) {
  const store = createSceneStore({ dir });
  const assets = createAssetStore({
    ...(assetDir !== undefined ? { dir: assetDir } : {}),
    ...(datalakeDir !== undefined ? { datalakeDir } : {}),
  });
  const guard = createStoreGuard({
    ...(token !== undefined ? { token } : {}),
    ...(origins !== undefined ? { origins } : {}),
  });
  const relay = createRelay();
  // Identity on top of the store's shared secret. Disabled — 503, not silently open — when
  // the store itself is running tokenless.
  const sessions = createLiveSessions({ store, guard });
  // Best times, leaderboards and shared ghosts. Client-attested by design — see the header
  // of results-store.mjs. Reads are open like scene reads; recording needs the store token.
  // `.results` *inside* the scenes directory, not a sibling of it. A sibling resolves to
  // `.graphysx-store/results` for the default layout and to `/tmp/results` for a store
  // pointed at a temp directory — which meant every test run sharing one board directory and
  // inheriting the previous run's leaderboard. Nesting it makes isolation follow the store
  // dir automatically. `store.list()` filters on `.json`, so a directory here is invisible
  // to it.
  const results = createResultsStore({ dir: resultsDir ?? join(store.dir, ".results") });

  const server = createServer((request, response) => {
    void (async () => {
      const cors = guard.corsHeaders(request);
      const unauthorized = () =>
        send(response, 401, { error: "This store requires a token (Authorization: Bearer <GRAPHYSX_STORE_TOKEN>)" }, cors);
      try {
        const url = new URL(request.url ?? "/", "http://localhost");
        const path = url.pathname.replace(/\/+$/, "") || "/";

        // Preflight is always answered: the browser sends it credential-less by design,
        // and the 401 (if one is coming) belongs to the real request.
        if (request.method === "OPTIONS") return send(response, 204, {}, cors);

        if (path === "/health" && request.method === "GET") {
          const scenes = await store.list();
          return send(response, 200, {
            ok: true,
            schema: SCENE_STORE_SCHEMA,
            dir: store.dir,
            sceneCount: scenes.length,
            assetCount: await assets.count(),
            datalake: assets.datalakeDir ?? null,
            authenticated: guard.enabled,
            // Fail-closed status, visible without authenticating: an operator can see at a
            // glance whether live collaboration is available or disabled for lack of a token.
            sessions: { enabled: sessions.enabled, open: sessions.count() },
            results: { boards: await results.count(), trust: "client-attested" },
          }, cors);
        }

        // Media routes (/assets/*, /datalake/*) live in asset-store.mjs; everything the
        // asset handler does not claim falls through to the scene routes below. The guard
        // rides along so those routes enforce the same token.
        if (await handleAssetRequest(assets, request, response, url, path, guard)) return undefined;

        // Live sessions (/sessions/*): identity, roles, incremental operations, presence.
        // Mounted before the scene routes and namespaced so it can never shadow one.
        if (await sessions.handle(request, response, url, path, cors)) return undefined;

        // Results (/results/*): persistent bests, bounded leaderboards, shared ghosts.
        if (await handleResultsRequest(results, request, response, url, path, guard, cors)) return undefined;

        if (path === "/scenes" && request.method === "GET") {
          return send(response, 200, { schema: SCENE_STORE_SCHEMA, scenes: await store.list() }, cors);
        }

        const sceneMatch = /^\/scenes\/([^/]+)$/.exec(path);
        const revisionMatch = /^\/scenes\/([^/]+)\/revision$/.exec(path);
        const streamMatch = /^\/scenes\/([^/]+)\/stream$/.exec(path);
        const changesMatch = /^\/scenes\/([^/]+)\/changes$/.exec(path);

        // --- the live feed --------------------------------------------------------
        if (streamMatch && request.method === "GET") {
          const name = decodeURIComponent(streamMatch[1]);
          assertName(name);
          // The stream is a scene read and stays open even when writes are token-protected.
          const record = await store.get(name);
          if (!record) return send(response, 404, { error: `Unknown scene: ${name}` }, cors);

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
            ...cors,
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
          if (!guard.authorized(request)) return unauthorized();
          const name = decodeURIComponent(changesMatch[1]);
          assertName(name);
          const body = await readJsonBody(request);
          const record = await store.get(name);
          if (!record) return send(response, 404, { error: `Unknown scene: ${name}` }, cors);
          if (body?.expectedRevision !== undefined && body.expectedRevision !== record.revision) {
            return send(response, 409, {
              error: `Revision conflict: expected ${body.expectedRevision}, current ${record.revision}`,
              revision: record.revision,
            }, cors);
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
          await sessions.publishExternalCut(name, { revision: written.revision, definition });
          return send(response, 200, { ...written, outputs, subscribers: relay.subscriberCount(name) }, cors);
        }

        // A deliberately tiny endpoint: the browser polls this every couple of seconds
        // and only pulls the whole document when the number actually moves.
        if (revisionMatch && request.method === "GET") {
          const name = decodeURIComponent(revisionMatch[1]);
          assertName(name);
          const record = await store.get(name);
          if (!record) return send(response, 404, { error: `Unknown scene: ${name}` }, cors);
          return send(response, 200, {
            name,
            revision: record.revision,
            updatedAt: record.updatedAt,
            actor: record.actor ?? null,
            intent: record.intent ?? null,
          }, cors);
        }

        if (sceneMatch) {
          const name = decodeURIComponent(sceneMatch[1]);
          assertName(name);

          if (request.method === "GET") {
            const record = await store.get(name);
            if (!record) return send(response, 404, { error: `Unknown scene: ${name}` }, cors);
            return send(response, 200, record, cors);
          }

          if (request.method === "PUT") {
            if (!guard.authorized(request)) return unauthorized();
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
            await sessions.publishExternalCut(name, { revision: result.revision, definition });
            return send(response, result.created ? 201 : 200, result, cors);
          }
        }

        return send(response, 404, { error: `No route for ${request.method} ${path}` }, cors);
      } catch (error) {
        const status = error?.status ?? 400;
        const payload = { error: error instanceof Error ? error.message : String(error) };
        if (error?.revision !== undefined) payload.revision = error.revision;
        // Structured fields a client can branch on without parsing prose: `code` names the
        // failure, `resync` is the path back to a known-good state after a conflict, and
        // `blockedBy` says which actor's later work is preventing an undo.
        //
        // An explicit list, not a spread of the error object: a spread would eventually
        // carry a stack, an internal path or a captured credential out to a client, and the
        // day it does nobody will be looking at this line.
        for (const field of ["code", "resync", "blockedBy"]) {
          if (error?.[field] !== undefined) payload[field] = error[field];
        }
        // Headers are already sent on a stream; writing a JSON body would throw over the
        // top of the real error and lose it.
        if (response.headersSent) {
          try { response.end(); } catch { /* already destroyed */ }
          return undefined;
        }
        return send(response, status, payload, cors);
      }
    })();
  });

  return { server, store, assets, guard, sessions, results };
}

export async function startSceneStore({ port = DEFAULT_PORT, host = DEFAULT_HOST, dir, assetDir, datalakeDir, resultsDir, token, origins } = {}) {
  const { server, store, assets, guard, sessions, results } = createSceneStoreServer({ dir, assetDir, datalakeDir, resultsDir, token, origins });
  if (!guard.enabled) {
    // One line, every start, on purpose: the open mode is a deliberate LAN convenience
    // and the operator should never discover it by accident.
    console.warn("[scene-store] UNAUTHENTICATED MODE — no GRAPHYSX_STORE_TOKEN set; writes and the datalake are open to anyone who can reach this port. LAN boundary only.");
  }
  // Node closes idle keep-alive sockets after 5s by default, but `fetch` (undici) pools and
  // reuses them — so a client that pauses longer than that between calls picks a socket the
  // server has already closed and fails with a bare "fetch failed". That is what made the
  // scene-store smoke fail after its browser phase: seeding worked, the page loaded, and the
  // next agent call died on a stale socket. Outliving any realistic client pause fixes it.
  server.keepAliveTimeout = 72_000;
  server.headersTimeout = 75_000;
  // Keep total request lifetime explicit across Node releases. Overflowing JSON bodies have
  // their own much tighter five-second discard window in readJsonBody.
  server.requestTimeout = 300_000;

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => resolveListen(undefined));
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  // The address actually bound, not the one we asked for and not a convenience string.
  const actualHost = typeof address === "object" && address ? address.address : host;
  return {
    port: actualPort,
    host: actualHost,
    assets,
    guard,
    sessions,
    results,
    // 127.0.0.1 rather than localhost: on Windows, Node's fetch resolves localhost to ::1
    // first, and whether that reaches a listener bound to the IPv4 any-address is a coin
    // flip. It surfaced as an intermittent "scene store unreachable" against a store that
    // was demonstrably listening. The server still binds every interface, so a LAN client
    // reaching it by hostname is unaffected.
    url: `http://127.0.0.1:${actualPort}`,
    store,
    async close() {
      // A bare server.close() waits for every open connection to end on its own: the
      // caller's own undici keep-alive socket (idle for up to the 72s keepAliveTimeout
      // above — in-process smokes sat through it every run), and any SSE stream a wedged
      // tab never closed, which waits forever. That tail is part of how a verify hung for
      // 9.5 hours. Closing is a decision, not a negotiation: sever everything, then close.
      // Session streams first: each one is an open response holding a heartbeat. They are
      // unref'd so they cannot hold the process open, but ending them politely means a
      // client sees `closed` rather than a severed socket it will try to resume.
      await sessions.closeAll();
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      await new Promise((resolveClose) => server.close(() => resolveClose(undefined)));
    },
  };
}

// `node server/scene-store.mjs` runs it; importing it does not.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const dir = DEFAULT_DIR;
  const existed = existsSync(dir);
  startSceneStore({ port: DEFAULT_PORT, host: DEFAULT_HOST, dir })
    .then(({ url, assets, guard }) => {
      console.log(`graphysx scene store listening on ${url}`);
      console.log(`  scenes:   ${dir}${existed ? "" : " (created)"}`);
      console.log(`  assets:   ${assets.dir}`);
      console.log(`  datalake: ${assets.datalakeDir ?? "not configured (set GRAPHYSX_DATALAKE_DIR)"}`);
      console.log(`  auth:     ${guard.enabled ? "token required for writes and /datalake" : "OPEN (set GRAPHYSX_STORE_TOKEN to require a bearer token)"}`);
      console.log(`  sessions: ${guard.enabled ? "live sessions enabled at /sessions" : "DISABLED (live sessions refuse to run without a token)"}`);
      console.log(`  bound:    ${host}${host === "127.0.0.1" || host === "::1" ? " (loopback only — put a reverse proxy in front to expose it; set GRAPHYSX_STORE_HOST=0.0.0.0 for direct LAN access)" : " — REACHABLE ON EVERY INTERFACE; only your firewall is containing it"}`);
      console.log(`  try:      curl ${url}/scenes`);
    })
    .catch((error) => {
      console.error(`scene store failed to start: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}

// Browser-side client for the scene store (server/scene-store.mjs).
//
// This is the seam that lets something outside this tab change what you are looking at.
// The store holds whole `graphysx.agent-world/v2` documents with a revision; we pull one
// in through `api.load(definition)` and poll a two-field endpoint to notice when an agent
// has written a new one.
//
// Polling, not push, on purpose: milestone A has no relay and no socket, and the runtime's
// own notify path is not wired on the product route anyway. A 2s poll of a ~60 byte
// response is cheap and it means the whole feature is one server with no connection state.

import type { AgentWorldDefinition, GraphysXAgentWorldApi } from "./agent-world-runtime";
import { resolveSceneStoreToken } from "./scene-store-auth";

export const SCENE_STORE_SCHEMA = "graphysx.scene-store/v1";

/** Who last wrote a scene, and why. Null on scenes written before attribution existed. */
export type SceneStoreAttribution = {
  actor: string | null;
  intent: string | null;
};

export type SceneStoreRecord = SceneStoreAttribution & {
  schema: typeof SCENE_STORE_SCHEMA;
  name: string;
  revision: number;
  updatedAt: string;
  definition: AgentWorldDefinition;
};

export type SceneStoreSummary = SceneStoreAttribution & {
  name: string;
  revision: number;
  updatedAt: string;
  label: string | null;
  entityCount: number;
};

export type SceneStorePutResult = SceneStoreAttribution & {
  name: string;
  revision: number;
  updatedAt: string;
  created: boolean;
};

export type SceneStoreHead = SceneStoreAttribution & {
  name: string;
  revision: number;
  updatedAt: string;
};

/** Thrown for any non-2xx response; `revision` is present on a 409 so callers can rebase. */
export class SceneStoreError extends Error {
  readonly status: number;
  readonly revision: number | null;

  constructor(message: string, status: number, revision: number | null = null) {
    super(message);
    this.name = "SceneStoreError";
    this.status = status;
    this.revision = revision;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

export type SceneStoreClient = {
  readonly baseUrl: string;
  /** Sent as `x-graphysx-token` on every request; null when the store is open. */
  readonly token: string | null;
  list(): Promise<SceneStoreSummary[]>;
  get(name: string): Promise<SceneStoreRecord>;
  /** The cheap poll: revision plus attribution, without the document. Null when absent. */
  head(name: string): Promise<SceneStoreHead | null>;
  put(
    name: string,
    definition: AgentWorldDefinition,
    expectedRevision?: number,
    attribution?: Partial<SceneStoreAttribution>,
  ): Promise<SceneStorePutResult>;
};

async function request<T>(baseUrl: string, path: string, token: string | null, init?: RequestInit): Promise<T> {
  // `x-graphysx-token`, not `Authorization`: the latter upgrades every CORS preflight and
  // collides with anything else (a fronting proxy, basic auth) that owns that header in a
  // browser. The store accepts both.
  const headers = new Headers(init?.headers);
  if (token && !headers.has("x-graphysx-token")) headers.set("x-graphysx-token", token);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { cache: "no-store", ...init, headers });
  } catch (error) {
    // A dead store should read as "the store is unreachable", not as a mangled TypeError
    // surfacing from deep inside fetch.
    throw new SceneStoreError(
      `Scene store unreachable at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
      0,
    );
  }
  const payload = await response.json().catch(() => null) as (T & { error?: string; revision?: number }) | null;
  if (!response.ok) {
    throw new SceneStoreError(
      payload?.error ?? `Scene store responded ${response.status}`,
      response.status,
      typeof payload?.revision === "number" ? payload.revision : null,
    );
  }
  return payload as T;
}

export type SceneStoreClientOptions = {
  /**
   * Token for a store started with GRAPHYSX_STORE_TOKEN. Omitted, the client consumes a
   * one-time `#storeToken=` fragment and remembers it for this browser tab. Explicit null
   * disables the browser-state lookup.
   */
  token?: string | null;
};

export function createSceneStoreClient(baseUrl: string, options: SceneStoreClientOptions = {}): SceneStoreClient {
  const root = baseUrl.replace(/\/+$/, "");
  const token = options.token !== undefined ? options.token?.trim() || null : resolveSceneStoreToken(root);
  return {
    baseUrl: root,
    token,
    async list() {
      const payload = await request<{ scenes: SceneStoreSummary[] }>(root, "/scenes", token);
      return payload.scenes;
    },
    get(name) {
      return request<SceneStoreRecord>(root, `/scenes/${encodeURIComponent(name)}`, token);
    },
    async head(name) {
      try {
        return await request<SceneStoreHead>(root, `/scenes/${encodeURIComponent(name)}/revision`, token);
      } catch (error) {
        // Absent is a legitimate state — the scene has not been pushed yet.
        if (error instanceof SceneStoreError && error.status === 404) return null;
        throw error;
      }
    },
    put(name, definition, expectedRevision, attribution) {
      return request<SceneStorePutResult>(root, `/scenes/${encodeURIComponent(name)}`, token, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition,
          expectedRevision,
          actor: attribution?.actor ?? null,
          intent: attribution?.intent ?? null,
        }),
      });
    },
  };
}

export type SceneStoreSession = {
  readonly name: string;
  /** Revision this tab currently has loaded, or null before the first pull. */
  revision(): number | null;
  /** Who last wrote the revision this tab is showing. */
  attribution(): SceneStoreAttribution;
  /** Pull the store's copy into the runtime, replacing what is on screen. */
  pull(): Promise<number | null>;
  /** Push what is on screen back to the store, guarded by the revision we pulled. */
  push(intent?: string): Promise<SceneStorePutResult>;
  stop(): void;
};

export type SceneStoreSessionOptions = {
  api: GraphysXAgentWorldApi;
  client: SceneStoreClient;
  name: string;
  /** Identifies this tab's writes in the store's attribution. */
  actor?: string;
  /** Poll interval for remote changes. 0 disables watching entirely. */
  pollMs?: number;
  onPulled?: (record: SceneStoreRecord, remote: boolean) => void;
  onError?: (error: unknown) => void;
  /** Fired when the store's reachability changes, so UI can show it honestly. */
  onOnlineChange?: (online: boolean) => void;
};

/**
 * Binds one runtime to one stored scene: pull at start, then poll and re-pull whenever
 * someone else's revision lands.
 *
 * Reloading the whole document on every remote change is blunt — it drops physics state
 * and anything mid-flight. That is acceptable at milestone A precisely because the human
 * and the agent are not expected to be acting in the same second; the live channel is what
 * fixes it, and this is the thing that proves the loop is worth building.
 */
/** A change broadcast by the relay: commands to apply, or a flag saying reload instead. */
export type SceneStoreDelta = SceneStoreAttribution & {
  name: string;
  revision: number;
  parentRevision: number | null;
  commands?: unknown[];
  replaced?: boolean;
};

export function connectSceneStore(options: SceneStoreSessionOptions): SceneStoreSession {
  const { api, client, name, actor = "browser", pollMs = 2000, onPulled, onError, onOnlineChange } = options;
  let loadedRevision: number | null = null;
  let loadedAttribution: SceneStoreAttribution = { actor: null, intent: null };
  let timer: number | null = null;
  let source: EventSource | null = null;
  let stopped = false;
  let online: boolean | null = null;
  // Guards against a poll landing on top of an in-flight pull or push and re-loading a
  // document we are in the middle of replacing.
  let busy = false;

  const setOnline = (next: boolean): void => {
    if (online === next) return;
    online = next;
    onOnlineChange?.(next);
  };

  const pull = async (remote = false): Promise<number | null> => {
    const record = await client.get(name);
    const result = api.load(record.definition);
    if (!result.ok) throw new Error(result.error ?? `Failed to load scene ${name}`);
    loadedRevision = record.revision;
    loadedAttribution = { actor: record.actor ?? null, intent: record.intent ?? null };
    setOnline(true);
    onPulled?.(record, remote);
    return loadedRevision;
  };

  const push = async (intent = "saved from the browser"): Promise<SceneStorePutResult> => {
    // The document, not the runtime: pushing `export()` would persist every ball anyone
    // threw while the scene was open.
    const definition = api.exportDocument();
    if (!definition) throw new Error("There is no world to push");
    busy = true;
    try {
      const result = await client.put(name, definition, loadedRevision ?? undefined, { actor, intent });
      // Adopt the revision we just created, so the next poll does not treat our own write
      // as a remote change and reload the scene out from under the person who made it.
      loadedRevision = result.revision;
      loadedAttribution = { actor: result.actor ?? actor, intent: result.intent ?? intent };
      setOnline(true);
      return result;
    } finally {
      busy = false;
    }
  };

  const tick = async (): Promise<void> => {
    if (stopped || busy) return;
    busy = true;
    try {
      const head = await client.head(name);
      setOnline(true);
      if (head !== null && head.revision !== loadedRevision) await pull(true);
    } catch (error) {
      if (error instanceof SceneStoreError && error.status === 0) setOnline(false);
      onError?.(error);
    } finally {
      busy = false;
    }
  };

  /**
   * Apply a relay delta to the live world.
   *
   * The reason milestone B exists: `api.transaction(commands)` changes only what the
   * command names, so everything else survives — a ball mid-flight, physics state, the
   * entity you were dragging. Reloading the document, which is what polling did, threw all
   * of that away every time anyone else touched the scene.
   */
  const applyDelta = (delta: SceneStoreDelta): void => {
    // A whole-document write, or a delta that does not follow from what we have. Neither
    // can be applied as commands, so fall back to the blunt path rather than guessing.
    if (delta.replaced || !Array.isArray(delta.commands) || (loadedRevision !== null && delta.parentRevision !== loadedRevision)) {
      void pull(true).catch((error) => onError?.(error));
      return;
    }
    const result = api.transaction(delta.commands as Parameters<typeof api.transaction>[0]);
    if (!result.ok) {
      // Our world disagrees with the store's. Resync rather than drift silently.
      onError?.(new Error(`Could not apply delta ${delta.revision}: ${result.error ?? "rejected"}`));
      void pull(true).catch((error) => onError?.(error));
      return;
    }
    loadedRevision = delta.revision;
    loadedAttribution = { actor: delta.actor ?? null, intent: delta.intent ?? null };
    onPulled?.(
      { schema: SCENE_STORE_SCHEMA, name, revision: delta.revision, updatedAt: new Date().toISOString(), actor: delta.actor ?? null, intent: delta.intent ?? null, definition: api.exportDocument()! },
      true,
    );
  };

  const listen = (): void => {
    if (typeof EventSource === "undefined") return;
    // EventSource reconnects on its own and replays Last-Event-ID, so a dropped connection
    // resumes from the last delta rather than reloading the world. Scene reads, including
    // this stream, are deliberately public, so never put the write/datalake token in its URL.
    const streamUrl = new URL(`${client.baseUrl}/scenes/${encodeURIComponent(name)}/stream`, window.location.href);
    source = new EventSource(streamUrl.toString());
    source.addEventListener("hello", (event) => {
      const hello = JSON.parse((event as MessageEvent<string>).data) as { revision: number; mustReload?: boolean };
      setOnline(true);
      // Behind by more than the relay can bridge, or joining fresh: take the document.
      if (hello.mustReload || loadedRevision === null || hello.revision !== loadedRevision) {
        void pull(true).catch((error) => onError?.(error));
      }
    });
    source.onmessage = (event) => {
      try {
        applyDelta(JSON.parse(event.data) as SceneStoreDelta);
      } catch (error) {
        onError?.(error);
      }
    };
    source.onerror = () => {
      // EventSource retries by itself; the poll below is the safety net if it cannot.
      setOnline(false);
    };
  };

  listen();
  if (pollMs > 0) {
    // Kept as a backstop, not the primary path: if the stream is blocked by a proxy or the
    // browser has no EventSource, the session still converges — just bluntly.
    timer = window.setInterval(() => void tick(), pollMs);
  }

  return {
    name,
    revision: () => loadedRevision,
    attribution: () => ({ ...loadedAttribution }),
    pull: () => pull(false),
    push,
    stop() {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      source?.close();
      source = null;
    },
  };
}

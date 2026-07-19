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

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { cache: "no-store", ...init });
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

export function createSceneStoreClient(baseUrl: string): SceneStoreClient {
  const root = baseUrl.replace(/\/+$/, "");
  return {
    baseUrl: root,
    async list() {
      const payload = await request<{ scenes: SceneStoreSummary[] }>(root, "/scenes");
      return payload.scenes;
    },
    get(name) {
      return request<SceneStoreRecord>(root, `/scenes/${encodeURIComponent(name)}`);
    },
    async head(name) {
      try {
        return await request<SceneStoreHead>(root, `/scenes/${encodeURIComponent(name)}/revision`);
      } catch (error) {
        // Absent is a legitimate state — the scene has not been pushed yet.
        if (error instanceof SceneStoreError && error.status === 404) return null;
        throw error;
      }
    },
    put(name, definition, expectedRevision, attribution) {
      return request<SceneStorePutResult>(root, `/scenes/${encodeURIComponent(name)}`, {
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
export function connectSceneStore(options: SceneStoreSessionOptions): SceneStoreSession {
  const { api, client, name, actor = "browser", pollMs = 2000, onPulled, onError, onOnlineChange } = options;
  let loadedRevision: number | null = null;
  let loadedAttribution: SceneStoreAttribution = { actor: null, intent: null };
  let timer: number | null = null;
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

  if (pollMs > 0) {
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
    },
  };
}

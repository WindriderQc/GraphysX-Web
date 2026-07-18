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

export type SceneStoreRecord = {
  schema: typeof SCENE_STORE_SCHEMA;
  name: string;
  revision: number;
  updatedAt: string;
  definition: AgentWorldDefinition;
};

export type SceneStoreSummary = {
  name: string;
  revision: number;
  updatedAt: string;
  label: string | null;
  entityCount: number;
};

export type SceneStorePutResult = {
  name: string;
  revision: number;
  updatedAt: string;
  created: boolean;
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
  revision(name: string): Promise<number | null>;
  put(name: string, definition: AgentWorldDefinition, expectedRevision?: number): Promise<SceneStorePutResult>;
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
    async revision(name) {
      try {
        const payload = await request<{ revision: number }>(root, `/scenes/${encodeURIComponent(name)}/revision`);
        return payload.revision;
      } catch (error) {
        // Absent is a legitimate state — the scene has not been pushed yet.
        if (error instanceof SceneStoreError && error.status === 404) return null;
        throw error;
      }
    },
    put(name, definition, expectedRevision) {
      return request<SceneStorePutResult>(root, `/scenes/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ definition, expectedRevision }),
      });
    },
  };
}

export type SceneStoreSession = {
  /** Revision this tab currently has loaded, or null before the first pull. */
  revision(): number | null;
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
  /** Poll interval for remote changes. 0 disables watching entirely. */
  pollMs?: number;
  onPulled?: (record: SceneStoreRecord) => void;
  onError?: (error: unknown) => void;
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
  const { api, client, name, pollMs = 2000, onPulled, onError } = options;
  let loadedRevision: number | null = null;
  let timer: number | null = null;
  let stopped = false;
  // Guards against a poll landing on top of an in-flight pull or push and re-loading a
  // document we are in the middle of replacing.
  let busy = false;

  const pull = async (): Promise<number | null> => {
    const record = await client.get(name);
    const result = api.load(record.definition);
    if (!result.ok) throw new Error(result.error ?? `Failed to load scene ${name}`);
    loadedRevision = record.revision;
    onPulled?.(record);
    return loadedRevision;
  };

  const push = async (intent = "browser snapshot"): Promise<SceneStorePutResult> => {
    // The document, not the runtime: pushing `export()` would persist every ball anyone
    // threw while the scene was open.
    const definition = api.exportDocument();
    if (!definition) throw new Error("There is no world to push");
    busy = true;
    try {
      const result = await client.put(name, definition, loadedRevision ?? undefined);
      // Adopt the revision we just created, so the next poll does not treat our own write
      // as a remote change and reload the scene out from under the person who made it.
      loadedRevision = result.revision;
      void intent;
      return result;
    } finally {
      busy = false;
    }
  };

  const tick = async (): Promise<void> => {
    if (stopped || busy) return;
    busy = true;
    try {
      const remote = await client.revision(name);
      if (remote !== null && remote !== loadedRevision) await pull();
    } catch (error) {
      onError?.(error);
    } finally {
      busy = false;
    }
  };

  if (pollMs > 0) {
    timer = window.setInterval(() => void tick(), pollMs);
  }

  return {
    revision: () => loadedRevision,
    pull,
    push,
    stop() {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    },
  };
}

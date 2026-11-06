// Browser-side client for the scene store (server/scene-store.mjs).
//
// This is the seam that lets something outside this tab change what you are looking at.
// The store holds whole `graphysx.agent-world/v2` documents with a revision; we pull one
// in through the scene API. SSE delivers changes with a cheap revision poll as a fallback.

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
  /** A just-saved copy can become the base without replacing the scene on screen. */
  savedBase?: SceneStoreRecord;
  onConflict?: (revision: number) => void;
  onPulled?: (record: SceneStoreRecord, remote: boolean) => void;
  onError?: (error: unknown) => void;
  /** Fired when the store's reachability changes, so UI can show it honestly. */
  onOnlineChange?: (online: boolean) => void;
};

/** A change broadcast by the relay: commands to apply, or a flag saying reload instead. */
export type SceneStoreDelta = SceneStoreAttribution & {
  name: string;
  revision: number;
  parentRevision: number | null;
  commands?: unknown[];
  replaced?: boolean;
};

export function connectSceneStore(options: SceneStoreSessionOptions): SceneStoreSession {
  const { api, client, name, actor = "browser", pollMs = 2000, savedBase, onPulled, onConflict, onError, onOnlineChange } = options;
  const documentSignature = (): string => JSON.stringify(api.exportDocument());
  let loadedRevision = savedBase?.revision ?? null;
  let baseSignature = savedBase ? JSON.stringify(savedBase.definition) : documentSignature();
  let loadedAttribution: SceneStoreAttribution = { actor: savedBase?.actor ?? null, intent: savedBase?.intent ?? null };
  let conflictRevision = 0;
  let queuedRevision = 0;
  let timer: number | null = null;
  let source: EventSource | null = null;
  let stopped = false;
  let online: boolean | null = null;
  let busy = false;
  let checkingHead = false;

  const setOnline = (next: boolean): void => {
    if (online === next) return;
    online = next;
    onOnlineChange?.(next);
  };

  const adopt = (revision: number, signature: string, attribution: SceneStoreAttribution): void => {
    loadedRevision = revision;
    baseSignature = signature;
    loadedAttribution = attribution;
    conflictRevision = 0;
  };

  const canFollow = (revision: number): boolean => {
    if (revision <= (loadedRevision ?? 0)) return false;
    if (documentSignature() === baseSignature) return true;
    if (revision > conflictRevision) {
      conflictRevision = revision;
      onConflict?.(revision);
    }
    return false;
  };

  const finish = (): void => {
    busy = false;
    const revision = queuedRevision;
    queuedRevision = 0;
    if (revision) follow(revision);
  };

  const pull = async (remote = false): Promise<number | null> => {
    if (stopped) return loadedRevision;
    if (busy) throw new Error("Wait for the current scene load or save to finish.");
    const before = remote ? null : documentSignature();
    busy = true;
    try {
      const record = await client.get(name);
      if (stopped) return loadedRevision;
      setOnline(true);
      // Check again after the request: the user can edit while the document is in flight.
      if (remote && !canFollow(record.revision)) return loadedRevision;
      if (!remote && documentSignature() !== before) {
        throw new Error("The scene changed while loading. Your local changes are still on screen.");
      }
      const result = api.load(record.definition);
      if (!result.ok) throw new Error(result.error ?? "Failed to load scene " + name);
      adopt(record.revision, documentSignature(), { actor: record.actor ?? null, intent: record.intent ?? null });
      onPulled?.(record, remote);
      return loadedRevision;
    } finally {
      finish();
    }
  };

  const follow = (revision: number): void => {
    if (stopped || revision <= (loadedRevision ?? 0)) return;
    if (busy) {
      queuedRevision = Math.max(queuedRevision, revision);
    } else if (canFollow(revision)) {
      void pull(true).catch((error) => { if (!stopped) onError?.(error); });
    }
  };

  const push = async (intent = "saved from the browser"): Promise<SceneStorePutResult> => {
    if (stopped || loadedRevision === null) throw new Error("Open a stored revision before saving to it.");
    if (conflictRevision > loadedRevision) throw new SceneStoreError("The stored scene has changed.", 409, conflictRevision);
    if (busy) throw new Error("Wait for the current scene load or save to finish.");
    const definition = api.exportDocument();
    if (!definition) throw new Error("There is no world to push");
    const signature = JSON.stringify(definition);
    busy = true;
    try {
      const result = await client.put(name, definition, loadedRevision, { actor, intent });
      if (!stopped) {
        // Any edits made during the request remain dirty against the copy we actually sent.
        adopt(result.revision, signature, { actor: result.actor ?? actor, intent: result.intent ?? intent });
        setOnline(true);
      }
      return result;
    } finally {
      finish();
    }
  };

  const tick = async (): Promise<void> => {
    if (stopped || busy || checkingHead) return;
    checkingHead = true;
    try {
      const head = await client.head(name);
      if (stopped) return;
      setOnline(true);
      if (head) follow(head.revision);
    } catch (error) {
      if (stopped) return;
      if (error instanceof SceneStoreError && error.status === 0) setOnline(false);
      onError?.(error);
    } finally {
      checkingHead = false;
    }
  };

  const applyDelta = (delta: SceneStoreDelta): void => {
    // Incremental updates preserve the live physics. A gap or whole-document write
    // needs a snapshot, and neither path may advance the base under local edits.
    if (stopped) return;
    if (busy || loadedRevision === null || delta.replaced || !Array.isArray(delta.commands) || delta.parentRevision !== loadedRevision) {
      follow(delta.revision);
      return;
    }
    if (!canFollow(delta.revision)) return;
    const result = api.transaction(delta.commands as Parameters<typeof api.transaction>[0]);
    if (!result.ok) {
      onError?.(new Error("Could not apply delta " + delta.revision + ": " + (result.error ?? "rejected")));
      follow(delta.revision);
      return;
    }
    const definition = api.exportDocument()!;
    adopt(delta.revision, JSON.stringify(definition), { actor: delta.actor ?? null, intent: delta.intent ?? null });
    onPulled?.({
      schema: SCENE_STORE_SCHEMA, name, revision: delta.revision, updatedAt: new Date().toISOString(),
      ...loadedAttribution, definition,
    }, true);
  };

  if (typeof EventSource !== "undefined") {
    // Reads and the stream are public. Keep the write credential out of the URL.
    const streamUrl = new URL(client.baseUrl + "/scenes/" + encodeURIComponent(name) + "/stream", window.location.href);
    source = new EventSource(streamUrl.toString());
    source.addEventListener("hello", (event) => {
      if (stopped) return;
      const hello = JSON.parse((event as MessageEvent<string>).data) as { revision: number };
      setOnline(true);
      follow(hello.revision);
    });
    source.onmessage = (event) => {
      try {
        applyDelta(JSON.parse(event.data) as SceneStoreDelta);
      } catch (error) {
        if (!stopped) onError?.(error);
      }
    };
    source.onerror = () => { if (!stopped) setOnline(false); };
  }
  if (pollMs > 0) timer = window.setInterval(() => void tick(), pollMs);

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

import type { GraphysXAgentWorldApi } from "./agent-world-runtime";

export const GRAPHYSX_AGENT_TOOL_BRIDGE_SCHEMA = "graphysx.agent-tool-bridge/v1" as const;
export const GRAPHYSX_AGENT_TOOL_REQUEST_SCHEMA = "graphysx.agent-tool-request/v1" as const;
export const GRAPHYSX_AGENT_TOOL_RESPONSE_SCHEMA = "graphysx.agent-tool-response/v1" as const;
export const GRAPHYSX_AGENT_TOOL_EVENT_SCHEMA = "graphysx.agent-tool-event/v1" as const;

const TOOL_PATHS = [
  "schema", "worldSchema", "levelSchema", "version", "capabilities",
  "open", "demo", "state", "assets", "textures", "skies", "emitters", "heightmaps", "importLegacyXml", "create", "clear", "spawn", "update", "remove", "select",
  "sounds", "flocks", "crowds", "forceFields", "formulas", "dna",
  "attachBehavior", "detachBehavior", "interact", "prefabs", "spawnPrefab", "starters", "loadStarter",
  "transaction", "commit", "history", "events", "undo", "query", "observe", "pause", "step", "export", "exportDocument", "save", "load",
  "rules.get", "rules.set", "rules.status", "rules.reset",
  "media.schema", "media.status", "media.list", "media.refresh", "media.browse", "media.import", "media.importSky", "media.register", "media.remove", "media.terrainHeights",
  "levels.schema", "levels.levelSchema", "levels.version", "levels.capabilities",
  "levels.tiles", "levels.tileSemantics", "levels.active", "levels.list", "levels.get", "levels.create", "levels.remove",
  "levels.open", "levels.region", "levels.patch", "levels.fill", "levels.resize", "levels.transaction", "levels.undo",
  "levels.importAscii", "levels.exportAscii", "levels.play"
] as const;

const MUTATING_TOOLS = new Set<string>([
  "open", "demo", "importLegacyXml", "create", "clear", "spawn", "update", "remove", "select", "attachBehavior", "detachBehavior",
  "interact", "spawnPrefab", "loadStarter", "transaction", "commit", "undo", "pause", "step", "save", "load",
  "rules.set", "rules.reset",
  "media.refresh", "media.import", "media.importSky", "media.register", "media.remove",
  "levels.create", "levels.remove", "levels.open", "levels.patch", "levels.fill", "levels.resize", "levels.transaction",
  "levels.undo", "levels.importAscii", "levels.play"
]);

const TOOL_SUMMARIES: Record<string, string> = {
  state: "Read the complete serializable 3D world state.",
  export: "Export the full runtime snapshot, including session-only entities.",
  exportDocument: "Export the persistable scene document: authored content only, without session-only spawns.",
  textures: "Discover stable archive texture IDs and their intended visual uses.",
  skies: "List the per-scene skybox sets recovered from the archive.",
  emitters: "List the archive particle-emitter presets, with provenance, budgets and keyframe ramps, for spawning `emitter` entities.",
  heightmaps: "List the curated heightmaps, with archive provenance, for spawning `terrain` entities. Terrain carries a static heightfield collider, so objects land on it.",
  sounds: "List the archive sound samples plus media-library imports, for `sound` entities and `play-sound` interactions.",
  flocks: "List the curated boid-flock presets for spawning `flock` entities.",
  crowds: "List the curated crowd presets adapted from the race scene's NPC population.",
  forceFields: "List the force-field presets (attractor/flow/drag/vortex) for spawning `force-field` entities.",
  formulas: "List the recovered Math Game formula presets for `formula-field` entities.",
  dna: "List the recovered Living Forest genome presets.",
  importLegacyXml: "Convert an archived GraphysX XML scene into the validated v2 world contract.",
  create: "Replace the active world with a complete v2 definition.",
  spawn: "Create one typed 3D entity.",
  update: "Patch an entity by stable ID.",
  select: "Select stable entity IDs in the shared human/agent editor.",
  transaction: "Apply multiple world commands atomically.",
  commit: "Apply an actor-attributed, revision-guarded change set.",
  query: "Find entities by ID, type, tag, label, or world-space radius.",
  observe: "Read world state with optional query matches.",
  "rules.get": "Read the scene's rules block: spawn, ordered checkpoints, laps, timer, finish.",
  "rules.set": "Install or replace the scene's rules block; validates every id and arms a fresh run.",
  "rules.status": "Read the live run: phase, laps, checkpoint progress, collected pickups, simulation-time clock.",
  "rules.reset": "Re-arm the run and return the subject to its spawn.",
  "media.status": "Read the media library's store connectivity, datalake root, and import count.",
  "media.list": "List the imported assets known locally, optionally filtered by kind.",
  "media.refresh": "Re-pull the store manifest and re-register every import (async).",
  "media.browse": "List one directory level of the configured datalake (async).",
  "media.import": "Import one datalake file into the library: textures/sounds copy server-side, models convert in-browser (async).",
  "media.importSky": "Import a folder of six cube faces as a sky set usable via `environment.sky` (async).",
  "media.register": "Store raw data (drag-dropped file, generated payload) as a library asset (async).",
  "media.remove": "Remove an imported asset from the store and the registries (async).",
  "media.terrainHeights": "Decode an imported image into a normalized heights grid for `terrain.heights` (async).",
  "levels.region": "Read a bounded region of a named semantic level.",
  "levels.transaction": "Apply multiple named-level edits atomically."
};

export type GraphysXAgentToolDescriptor = {
  name: string;
  path: string;
  mutates: boolean;
  arguments: "positional-array";
  summary: string;
};

export type GraphysXAgentToolManifest = {
  schema: typeof GRAPHYSX_AGENT_TOOL_BRIDGE_SCHEMA;
  apiSchema: GraphysXAgentWorldApi["schema"];
  worldSchema: GraphysXAgentWorldApi["worldSchema"];
  version: "1.0";
  coordinateSystem: string;
  transports: Array<"direct" | "window.postMessage">;
  requestSchema: typeof GRAPHYSX_AGENT_TOOL_REQUEST_SCHEMA;
  responseSchema: typeof GRAPHYSX_AGENT_TOOL_RESPONSE_SCHEMA;
  tools: GraphysXAgentToolDescriptor[];
};

export type GraphysXAgentToolRequest = {
  schema: typeof GRAPHYSX_AGENT_TOOL_REQUEST_SCHEMA;
  id: string;
  method: string;
  args?: unknown[];
};

export type GraphysXAgentToolResponse = {
  schema: typeof GRAPHYSX_AGENT_TOOL_RESPONSE_SCHEMA;
  id: string;
  ok: boolean;
  value?: unknown;
  error?: string;
};

export type GraphysXAgentToolEvent = {
  schema: typeof GRAPHYSX_AGENT_TOOL_EVENT_SCHEMA;
  type: "world.state.changed";
  state: ReturnType<GraphysXAgentWorldApi["state"]>;
};

export type GraphysXAgentToolBridge = {
  readonly schema: typeof GRAPHYSX_AGENT_TOOL_BRIDGE_SCHEMA;
  manifest(): GraphysXAgentToolManifest;
  call(method: string, ...args: unknown[]): Promise<unknown>;
  request(request: GraphysXAgentToolRequest): Promise<GraphysXAgentToolResponse>;
  audit(): GraphysXAgentBridgeParityReport;
  subscribe(listener: (event: GraphysXAgentToolEvent) => void): () => void;
  notify(): void;
  dispose(): void;
};

export type GraphysXAgentBridgeParityReport = {
  /** Live API paths the manifest does not declare — each one is unreachable through the bridge. */
  missing: string[];
  /** Manifest paths the live API no longer has — each one dispatches into an error. */
  extra: string[];
};

/** An object whose own function properties make it a dotted-path namespace rather than a value leaf. */
const isToolNamespace = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  Object.values(value).some((entry) => typeof entry === "function");

/**
 * Compare the live `window.__GRAPHYSX__` surface against the static TOOL_PATHS manifest.
 * Walks functions and value leaves recursively, descending only into namespaces (objects
 * carrying functions, e.g. `rules`, `media`, `levels`) and skipping underscore-prefixed
 * internals. Reports rather than throws: a drift shows up as `missing`/`extra` entries,
 * never as a production crash.
 */
export function auditBridgeParity(api: GraphysXAgentWorldApi): GraphysXAgentBridgeParityReport {
  const discovered = new Set<string>();
  try {
    const seen = new WeakSet<object>();
    const walk = (node: Record<string, unknown>, prefix: string): void => {
      if (seen.has(node)) return;
      seen.add(node);
      for (const [key, value] of Object.entries(node)) {
        if (key.startsWith("_")) continue;
        const path = prefix ? `${prefix}.${key}` : key;
        if (isToolNamespace(value)) walk(value, path);
        else discovered.add(path);
      }
    };
    walk(api as unknown as Record<string, unknown>, "");
  } catch {
    // Best effort by design: report whatever was discovered before the walk failed.
  }
  const declared = new Set<string>(TOOL_PATHS);
  return {
    missing: [...discovered].filter((path) => !declared.has(path)).sort(),
    extra: [...declared].filter((path) => !discovered.has(path)).sort()
  };
}

export function createGraphysXAgentToolBridge(api: GraphysXAgentWorldApi): GraphysXAgentToolBridge {
  const listeners = new Set<(event: GraphysXAgentToolEvent) => void>();
  const toolSet = new Set<string>(TOOL_PATHS);
  const manifest: GraphysXAgentToolManifest = {
    schema: GRAPHYSX_AGENT_TOOL_BRIDGE_SCHEMA,
    apiSchema: api.schema,
    worldSchema: api.worldSchema,
    version: "1.0",
    coordinateSystem: "Three.js world coordinates: +x right/east, +y up, -z is the default forward direction.",
    transports: ["direct", "window.postMessage"],
    requestSchema: GRAPHYSX_AGENT_TOOL_REQUEST_SCHEMA,
    responseSchema: GRAPHYSX_AGENT_TOOL_RESPONSE_SCHEMA,
    tools: TOOL_PATHS.map((path) => ({
      name: path.replaceAll(".", "_"),
      path,
      mutates: MUTATING_TOOLS.has(path),
      arguments: "positional-array",
      summary: TOOL_SUMMARIES[path] ?? `${MUTATING_TOOLS.has(path) ? "Run" : "Read"} GraphysX ${path}.`
    }))
  };

  const call = async (method: string, ...args: unknown[]): Promise<unknown> => {
    if (!toolSet.has(method)) throw new Error(`Unknown GraphysX agent tool: ${method}`);
    const segments = method.split(".");
    let owner: unknown = api;
    let value: unknown = api;
    for (const segment of segments) {
      owner = value;
      if (!owner || (typeof owner !== "object" && typeof owner !== "function")) throw new Error(`Unavailable GraphysX agent tool: ${method}`);
      value = (owner as Record<string, unknown>)[segment];
    }
    if (typeof value === "function") return await value.apply(owner, args);
    if (args.length > 0) throw new Error(`${method} is a value and accepts no arguments`);
    return value;
  };

  const request = async (source: GraphysXAgentToolRequest): Promise<GraphysXAgentToolResponse> => {
    const id = typeof source?.id === "string" && source.id ? source.id : "anonymous";
    try {
      if (source?.schema !== GRAPHYSX_AGENT_TOOL_REQUEST_SCHEMA) throw new Error(`Expected ${GRAPHYSX_AGENT_TOOL_REQUEST_SCHEMA}`);
      if (!Array.isArray(source.args ?? [])) throw new Error("Agent tool args must be an array");
      return { schema: GRAPHYSX_AGENT_TOOL_RESPONSE_SCHEMA, id, ok: true, value: await call(source.method, ...(source.args ?? [])) };
    } catch (error) {
      return { schema: GRAPHYSX_AGENT_TOOL_RESPONSE_SCHEMA, id, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  const onMessage = (event: MessageEvent<unknown>): void => {
    const source = event.data as Partial<GraphysXAgentToolRequest> | null;
    if (!source || source.schema !== GRAPHYSX_AGENT_TOOL_REQUEST_SCHEMA) return;
    if (event.source !== window && event.origin !== window.location.origin) return;
    void request(source as GraphysXAgentToolRequest).then((response) => {
      const destination = event.source as WindowProxy | null;
      destination?.postMessage(response, event.origin || window.location.origin);
    });
  };
  window.addEventListener("message", onMessage);

  return {
    schema: GRAPHYSX_AGENT_TOOL_BRIDGE_SCHEMA,
    manifest: () => structuredClone(manifest),
    call,
    request,
    audit: () => auditBridgeParity(api),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify() {
      const event: GraphysXAgentToolEvent = { schema: GRAPHYSX_AGENT_TOOL_EVENT_SCHEMA, type: "world.state.changed", state: api.state() };
      listeners.forEach((listener) => listener(event));
      window.dispatchEvent(new CustomEvent("graphysx:agent-world-state", { detail: event }));
      window.postMessage(event, window.location.origin);
    },
    dispose() {
      window.removeEventListener("message", onMessage);
      listeners.clear();
    }
  };
}


import {
  GRAPHYSX_AGENT_CAPABILITIES,
  GRAPHYSX_AGENT_DEMO_WORLD,
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldRuntime,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import {
  AgentLevelLibrary,
  GRAPHYSX_AGENT_LEVEL_CAPABILITIES,
  GRAPHYSX_AGENT_LEVEL_SCHEMA,
  GRAPHYSX_AGENT_LEVEL_TILE_SEMANTICS,
  GRAPHYSX_AGENT_LEVEL_TILES,
  type AgentLevelDefinition,
  type GraphysXAgentLevelApi,
} from "./agent-level-library";
import type { MapEditorTile } from "./race-scene";
import { GRAPHYSX_AGENT_WORLD_ASSETS } from "./agent-world-assets";
import { GRAPHYSX_AGENT_WORLD_TEXTURES } from "./agent-world-textures";
import { convertLegacyGraphysXXml } from "./agent-world-legacy-xml";

/**
 * Build the full `window.__GRAPHYSX__` public API (`GraphysXAgentWorldApi`) directly
 * from an {@link AgentWorldRuntime}, with no dependency on the race-scene monolith or
 * the PrototypeApp UI. This is the same surface the legacy path assembled from
 * race-scene delegates — here it maps straight to runtime methods, so the standalone
 * PlatformHost gives agents identical parity.
 *
 * The `levels` sub-API is backed by a self-contained {@link AgentLevelLibrary}. Its data
 * operations (create/patch/fill/resize/ascii/…) are fully live; `play()` is honestly
 * deferred because playable game surfaces are rebuilt on the platform, not ported.
 */
export function createAgentWorldApi(runtime: AgentWorldRuntime): GraphysXAgentWorldApi {
  const library = new AgentLevelLibrary(createHostFallbackLevel());

  const levels = {
    schema: "graphysx.agent-level-api/v1" as const,
    levelSchema: GRAPHYSX_AGENT_LEVEL_SCHEMA,
    version: "1.0" as const,
    capabilities: GRAPHYSX_AGENT_LEVEL_CAPABILITIES,
    tiles: GRAPHYSX_AGENT_LEVEL_TILES,
    tileSemantics: GRAPHYSX_AGENT_LEVEL_TILE_SEMANTICS,
    active: () => library.active(),
    list: () => library.list(),
    get: (id) => library.get(id),
    create: (options) => library.create(options),
    remove: (id) => library.remove(id),
    open: (id) => {
      const value = library.get(id);
      return value
        ? { ok: true, revision: value.revision, value }
        : { ok: false, revision: 0, error: `Unknown level: ${id}` };
    },
    region: (id, rect) => library.region(id, rect),
    patch: (id, changes, options) => library.patch(id, changes, options),
    fill: (id, rect, tile, options) => library.fill(id, rect, tile, options),
    resize: (id, width, height, defaultTile, options) =>
      library.resize(id, width, height, defaultTile ?? "floor", options),
    transaction: (id, operations, options) => library.transaction(id, operations, options),
    undo: (id) => library.undo(id),
    importAscii: (source) => library.importAscii(source),
    exportAscii: (id) => library.exportAscii(id),
    play: (_id) => ({
      ok: false,
      revision: 0,
      error: "Playable levels are rebuilt on the platform; not available in the standalone host yet.",
    }),
  } satisfies GraphysXAgentLevelApi;

  const api = {
    schema: "graphysx.agent-api/v2" as const,
    worldSchema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    levelSchema: GRAPHYSX_AGENT_LEVEL_SCHEMA,
    version: "2.0" as const,
    capabilities: GRAPHYSX_AGENT_CAPABILITIES,
    levels,
    assets: () => GRAPHYSX_AGENT_WORLD_ASSETS,
    textures: () => GRAPHYSX_AGENT_WORLD_TEXTURES,
    skies: () => runtime.listSkies(),
    emitters: () => runtime.listEmitters(),
    importLegacyXml: (xml, options) => {
      try {
        const conversion = convertLegacyGraphysXXml(xml, options);
        const result = runtime.load(conversion.definition);
        if (!result.ok || !result.value) {
          return { ok: false, revision: result.revision, error: result.error ?? "Legacy import failed" };
        }
        return {
          ok: true,
          revision: result.revision,
          value: {
            state: result.value,
            sourceEntityCount: conversion.sourceEntityCount,
            convertedEntityCount: conversion.convertedEntityCount,
            warnings: conversion.warnings,
          },
        };
      } catch (error) {
        return {
          ok: false,
          revision: runtime.getState().revision,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    open: () => true,
    demo: () => runtime.create(GRAPHYSX_AGENT_DEMO_WORLD),
    state: () => runtime.getState(),
    create: (definition) => runtime.create(definition),
    clear: (id, label) => runtime.clear(id, label),
    spawn: (entity) => runtime.spawn(entity),
    update: (id, patch) => runtime.updateEntity(id, patch),
    remove: (id) => runtime.remove(id),
    attachBehavior: (id, behavior) => runtime.attachBehavior(id, behavior),
    detachBehavior: (id, behaviorId) => runtime.detachBehavior(id, behaviorId),
    interact: (id, interactionId) => runtime.interact(id, interactionId),
    prefabs: () => runtime.listPrefabs(),
    spawnPrefab: (prefabId, options) => runtime.spawnPrefab(prefabId, options),
    starters: () => runtime.listStarters(),
    loadStarter: (starterId, options) => runtime.loadStarter(starterId, options),
    transaction: (commands) => runtime.transaction(commands),
    commit: (changeSet) => runtime.commit(changeSet),
    history: (sinceRevision) => runtime.getCommitHistory(sinceRevision),
    undo: () => runtime.undo(),
    select: (ids) => runtime.select(ids),
    query: (query) => runtime.query(query),
    observe: (query) => runtime.observe(query),
    pause: (paused) => runtime.setPaused(paused),
    step: (seconds) => runtime.step(seconds),
    export: () => runtime.exportDefinition(),
    save: (name) => runtime.save(name),
    load: (nameOrDefinition) => runtime.load(nameOrDefinition),
  } satisfies GraphysXAgentWorldApi;

  return api;
}

/** A small self-contained starter level so the level library has a valid fallback. */
function createHostFallbackLevel(): AgentLevelDefinition {
  const width = 11;
  const height = 11;
  const tiles: MapEditorTile[] = Array.from({ length: width * height }, () => "floor" as MapEditorTile);
  for (let x = 0; x < width; x += 1) {
    tiles[x] = "wall";
    tiles[(height - 1) * width + x] = "wall";
  }
  for (let y = 0; y < height; y += 1) {
    tiles[y * width] = "wall";
    tiles[y * width + width - 1] = "wall";
  }
  const set = (x: number, y: number, tile: MapEditorTile) => {
    tiles[y * width + x] = tile;
  };
  set(5, 9, "start");
  set(5, 1, "half");
  set(5, 10, "finish");
  set(2, 7, "ring");
  set(8, 4, "ring");
  return {
    schema: GRAPHYSX_AGENT_LEVEL_SCHEMA,
    id: "starter-level",
    label: "Starter Level",
    width,
    height,
    cellSize: 2.6,
    tiles,
  };
}

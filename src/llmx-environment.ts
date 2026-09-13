import type { AgentWorldDefinition } from "./agent-world-runtime";
import { createForgeWorld, LLMX_FACE_ANCHOR_ID } from "./llmx-forge";

export const LLMX_FACE_ID = "llmx-face";
export const LLMX_SAVE_KEY = "graphysx.llmx.forge.v1";

/** Add the registered appearance without changing the visual author's Forge template. */
export function createLlmXForge() {
  const forge = createForgeWorld({ label: "Forge nocturne" });
  for (const entity of forge.document.entities) {
    entity.behaviors?.forEach((behavior, index) => { behavior.id ??= `${entity.id}-behavior-${index + 1}`; });
  }
  forge.document.entities.push({
    id: LLMX_FACE_ID, type: "agent", label: "Visage de la Forge", parentId: LLMX_FACE_ANCHOR_ID,
    appearance: { kind: "voxel-face", asset: "forge-mask", palette: "forge", seed: 1 },
    agent: { role: "guide", status: "offline" },
    castShadow: true, receiveShadow: false, tags: ["llmx-face"],
  });
  return forge;
}

type StoragePort = Pick<Storage, "getItem" | "setItem">;

/** Read failures keep the original value untouched so a corrupt save is never silently replaced. */
export function readLlmXEnvironment(storage: StoragePort): AgentWorldDefinition | null {
  const raw = storage.getItem(LLMX_SAVE_KEY);
  if (raw === null) return null;
  const record = JSON.parse(raw) as { version?: number; world?: AgentWorldDefinition };
  const world = record?.world;
  if (record?.version !== 1 || !world || world.schema !== "graphysx.agent-world/v2" || !Array.isArray(world.entities)) {
    throw new Error("Unsupported LLMx save");
  }
  const face = world.entities.find(entity => entity.id === LLMX_FACE_ID);
  const anchor = world.entities.find(entity => entity.id === LLMX_FACE_ANCHOR_ID);
  if (!anchor || face?.type !== "agent" || face.appearance?.kind !== "voxel-face" || face.parentId !== LLMX_FACE_ANCHOR_ID) {
    throw new Error("The saved Forge is missing its face or anchor");
  }
  return world;
}

/** Stores scene data only. Conversation transcripts and animation drivers have no field here. */
export function saveLlmXEnvironment(storage: StoragePort, world: AgentWorldDefinition): void {
  storage.setItem(LLMX_SAVE_KEY, JSON.stringify({ version: 1, world }));
}

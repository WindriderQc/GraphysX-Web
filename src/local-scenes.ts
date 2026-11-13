import type { AgentWorldDefinition } from "./agent-world-runtime";

export const LOCAL_SCENE_PREFIX = "graphysx.agent-world.v2.";
const FIRST_CREATION_RESUME_KEY = "graphysx.first-creation.resume.v1";
const DNA_CREATION_RESUME_KEY = "graphysx.dna-creation.resume.v1";

export type LocalSceneSlot = { name: string; raw: string; definition: AgentWorldDefinition };

export function readLocalSceneSlot(name: string): LocalSceneSlot | null {
  const raw = window.localStorage.getItem(LOCAL_SCENE_PREFIX + name);
  if (!raw) return null;
  const definition = JSON.parse(raw) as AgentWorldDefinition;
  if (definition?.schema !== "graphysx.agent-world/v2" || !Array.isArray(definition.entities)) return null;
  return { name, raw, definition };
}

export function readFirstCreationResume(): LocalSceneSlot | null {
  try {
    const name = window.localStorage.getItem(FIRST_CREATION_RESUME_KEY);
    return name ? readLocalSceneSlot(name) : null;
  } catch {
    return null;
  }
}

export function rememberFirstCreation(name: string): boolean {
  try {
    window.localStorage.setItem(FIRST_CREATION_RESUME_KEY, name);
    return true;
  } catch {
    return false;
  }
}

export function readDnaCreationResume(): LocalSceneSlot | null {
  try {
    const name = window.localStorage.getItem(DNA_CREATION_RESUME_KEY);
    const slot = name ? readLocalSceneSlot(name) : null;
    return slot?.definition.id === "dna-seed-studio" ? slot : null;
  } catch { return null; }
}

export function rememberDnaCreation(name: string): boolean {
  try { window.localStorage.setItem(DNA_CREATION_RESUME_KEY, name); return true; }
  catch { return false; }
}

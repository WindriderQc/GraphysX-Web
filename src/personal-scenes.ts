import type { AgentWorldDefinition, GraphysXAgentWorldApi } from "./agent-world-runtime";
import { LOCAL_SCENE_PREFIX } from "./local-scenes";

export const LEGACY_EDITOR_DRAFT_KEY = "graphysx.editor.draft.v1";
export const EDITOR_DRAFT_PREFIX = "graphysx.editor.draft.v2.";
export const EDITOR_SLOT_INDEX_KEY = "graphysx.editor.slots.v1";
const METADATA_KEY = "graphysx.personal-scenes.metadata.v1";

export type SceneStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem">;
export interface EditorDraft { savedAt: string; definition: AgentWorldDefinition }
export type PersonalSceneEntry = {
  key: string;
  kind: "scene" | "draft";
  name: string;
  raw: string;
  definition: AgentWorldDefinition | null;
  savedAt: string | null;
};
export type PersonalSceneResult =
  | { ok: true; entry: PersonalSceneEntry; dated: boolean }
  | { ok: false; reason: "name" | "conflict" | "storage" | "scene"; error: string };

/** Legacy recovery keeps its existing shape gate; the runtime validates on opening. */
export function readEditorDraft(raw: string | null): EditorDraft | null {
  try {
    const draft = JSON.parse(raw ?? "null") as EditorDraft | null;
    return draft?.definition?.id && Array.isArray(draft.definition.entities) && Number.isFinite(Date.parse(draft.savedAt)) ? draft : null;
  } catch { return null; }
}

export function browserSceneStorage(): SceneStorage | null {
  try { return window.localStorage; } catch { return null; }
}

function sceneDefinition(value: unknown): AgentWorldDefinition | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AgentWorldDefinition>;
  return candidate.schema === "graphysx.agent-world/v2" && typeof candidate.id === "string" && candidate.id.length > 0 && Array.isArray(candidate.entities)
    ? candidate as AgentWorldDefinition : null;
}

function metadata(storage: SceneStorage): Record<string, { savedAt: string }> {
  const result: Record<string, { savedAt: string }> = Object.create(null);
  try {
    const value: unknown = JSON.parse(storage.getItem(METADATA_KEY) ?? "null");
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [name, data] of Object.entries(value)) {
        const savedAt = data && typeof data === "object" ? (data as { savedAt?: unknown }).savedAt : null;
        if (typeof savedAt === "string" && Number.isFinite(Date.parse(savedAt))) result[name] = { savedAt };
      }
    }
  } catch { /* Dates are optional; scene bytes are the source of truth. */ }
  return result;
}

export function datePersonalScene(storage: SceneStorage, name: string, now = new Date().toISOString()): boolean {
  try {
    const values = metadata(storage);
    values[name] = { savedAt: now };
    storage.setItem(METADATA_KEY, JSON.stringify(values));
    return true;
  } catch { return false; }
}

export function readPersonalScene(storage: SceneStorage, key: string): PersonalSceneEntry | null {
  const isScene = key.startsWith(LOCAL_SCENE_PREFIX);
  const isDraft = key === LEGACY_EDITOR_DRAFT_KEY || key.startsWith(EDITOR_DRAFT_PREFIX);
  if (!isScene && !isDraft) return null;
  const raw = storage.getItem(key);
  if (raw === null) return null;
  let definition: AgentWorldDefinition | null = null;
  let savedAt: string | null = null;
  if (isDraft) {
    const draft = readEditorDraft(raw);
    definition = sceneDefinition(draft?.definition);
    savedAt = draft?.savedAt ?? null;
  } else {
    try { definition = sceneDefinition(JSON.parse(raw)); } catch { /* Keep unreadable data exportable. */ }
    savedAt = metadata(storage)[key.slice(LOCAL_SCENE_PREFIX.length)]?.savedAt ?? null;
  }
  return {
    key, kind: isScene ? "scene" : "draft", raw, definition, savedAt,
    name: isScene ? key.slice(LOCAL_SCENE_PREFIX.length) : definition?.label || definition?.id || "Brouillon illisible",
  };
}

/** Enumerate the real namespace, including pre-index saves from DNA and guided creation. */
export function personalScenes(storage: SceneStorage | null): { entries: PersonalSceneEntry[]; error: string | null } {
  const entries: PersonalSceneEntry[] = [];
  if (!storage) return { entries, error: "Le stockage de ce navigateur est indisponible. Garde ton travail ouvert et exporte-le." };
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) {
      if (!key) continue;
      const entry = readPersonalScene(storage, key);
      if (entry) entries.push(entry);
    }
    entries.sort((a, b) => (Date.parse(b.savedAt ?? "") || 0) - (Date.parse(a.savedAt ?? "") || 0) || a.name.localeCompare(b.name));
    return { entries, error: null };
  } catch {
    return { entries, error: "Certaines sauvegardes ne sont pas accessibles. Aucun fichier n’a été modifié." };
  }
}

const unavailable = (): PersonalSceneResult => ({ ok: false, reason: "storage", error: "L’enregistrement est indisponible. Garde cette scène ouverte et exporte une copie." });

/** A different name creates a copy; updating requires the exact previously observed bytes. */
export function savePersonalScene(
  api: Pick<GraphysXAgentWorldApi, "save" | "exportDocument">,
  storage: SceneStorage | null,
  input: string,
  expected: PersonalSceneEntry | null,
): PersonalSceneResult {
  const name = input.trim();
  if (!name) return { ok: false, reason: "name", error: "Donne un nom à ta scène." };
  if (!storage) return unavailable();
  const key = LOCAL_SCENE_PREFIX + name;
  try {
    const existing = storage.getItem(key);
    if (expected?.key === key ? existing !== expected.raw : existing !== null) {
      return { ok: false, reason: "conflict", error: expected?.key === key
        ? "Cette sauvegarde a changé dans une autre fenêtre. Choisis un autre nom pour conserver ta version."
        : "Ce nom existe déjà. Choisis un autre nom pour conserver les deux scènes." };
    }
    const definition = api.exportDocument();
    if (!definition) return { ok: false, reason: "scene", error: "Aucune scène n’est ouverte." };
    const raw = JSON.stringify(definition);
    const result = api.save(name);
    if (!result.ok) return { ok: false, reason: "storage", error: "La scène n’a pas pu être enregistrée. Garde-la ouverte et utilise Exporter." };
    if (storage.getItem(key) !== raw) return { ok: false, reason: "conflict", error: "La sauvegarde a changé pendant l’enregistrement. Garde cette scène ouverte et enregistre une copie." };
    const dated = datePersonalScene(storage, name);
    return { ok: true, dated, entry: { key, kind: "scene", name, raw, definition, savedAt: dated ? metadata(storage)[name]?.savedAt ?? null : null } };
  } catch { return unavailable(); }
}

/** Copy saved bytes without loading a scene or rewriting its source identity. */
export function copyPersonalScene(storage: SceneStorage | null, source: PersonalSceneEntry, input: string): PersonalSceneResult {
  const name = input.trim();
  if (!name) return { ok: false, reason: "name", error: "Donne un nom à cette copie." };
  if (!storage) return unavailable();
  try {
    if (!source.definition || storage.getItem(source.key) !== source.raw) return { ok: false, reason: "conflict", error: "Cette scène a changé. Actualise la liste avant de la copier." };
    const key = LOCAL_SCENE_PREFIX + name;
    if (storage.getItem(key) !== null) return { ok: false, reason: "conflict", error: "Ce nom existe déjà. Choisis un autre nom." };
    const raw = source.kind === "draft" ? JSON.stringify(source.definition) : source.raw;
    storage.setItem(key, raw);
    const dated = datePersonalScene(storage, name);
    return { ok: true, dated, entry: { ...source, key, name, raw, kind: "scene", savedAt: dated ? metadata(storage)[name]?.savedAt ?? null : null } };
  } catch { return unavailable(); }
}

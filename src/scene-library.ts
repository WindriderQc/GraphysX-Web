import type { GraphysXAgentWorldApi } from "./agent-world-runtime";
import { LOCAL_SCENE_PREFIX, DNA_CREATION_RESUME_KEY, FIRST_CREATION_RESUME_KEY } from "./local-scenes";
import { browserSceneStorage, personalScenes, personalSceneFromRaw, readPersonalScene, type PersonalSceneEntry, type PersonalSceneResult } from "./personal-scenes";

// Named documents and their small catalogue entries commit together. Draft recovery and
// the synchronous world API retain their existing localStorage format for compatibility.
export const SCENE_LIBRARY_DATABASE = "graphysx.personal-scenes.v1";
export const SCENE_LIBRARY_DOCUMENTS = "scenes";
export const SCENE_LIBRARY_SUMMARIES = "summaries";
const LEGACY_VERSION_PREFIX = "graphysx.legacy-scene.v1.";
const CHANGED = "Cette sauvegarde a changé dans une autre fenêtre. Actualise Mes créations ou choisis un autre nom pour conserver ta version.";
const UNAVAILABLE = "L’enregistrement est indisponible ou le disque est plein. Garde cette scène ouverte et exporte une copie.";

export type SceneLibraryReference = Pick<PersonalSceneEntry, "key" | "kind" | "name"> & {
  repository?: "database" | "legacy";
  revision?: string;
  raw?: string;
};
export type SceneLibraryItem = SceneLibraryReference & {
  repository: "database" | "legacy";
  revision: string;
  savedAt: string | null;
  readable: boolean;
  entityCount: number;
  label: string;
  previousVersion?: boolean;
};
type Summary = SceneLibraryItem & { legacyDigest: string | null; documentDigest: string | null };
type StoredScene = { key: string; raw: string; revision: string; savedAt: string; legacyDigest: string | null };
class Conflict extends Error {}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest, rejected = false;
    try { request = window.indexedDB.open(SCENE_LIBRARY_DATABASE, 1); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(SCENE_LIBRARY_DOCUMENTS, { keyPath: "key" });
      db.createObjectStore(SCENE_LIBRARY_SUMMARIES, { keyPath: "key" });
    };
    request.onblocked = () => { rejected = true; reject(new Error("Ferme les anciennes fenêtres de GraphysX, puis réessaie. Tes sauvegardes sont conservées.")); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (rejected) db.close(); else resolve(db);
    };
  });
}

/** Resolve at transaction completion, never at a request's provisional success. */
async function readStore<T>(store: string, key?: string): Promise<T> {
  const db = await openDatabase();
  try { return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const request = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key);
    tx.oncomplete = () => resolve(request.result as T);
    tx.onabort = () => reject(tx.error ?? new Error("Scene read aborted"));
    tx.onerror = () => { /* Abort reports the final transaction result. */ };
  }); } finally { db.close(); }
}

async function digest(raw: string): Promise<string | null> {
  try {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  } catch { return null; } // Retain an extra legacy version if fingerprints are unavailable.
}

function newRevision(): string {
  // getRandomValues also works on local HTTP origins where randomUUID/subtle may
  // be unavailable. Revisions are opaque compare-and-swap tokens, not scene IDs.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}

function legacyKey(key: string): string {
  if (!key.startsWith(LEGACY_VERSION_PREFIX)) return key;
  const source = key.slice(LEGACY_VERSION_PREFIX.length);
  if (!source.startsWith(LOCAL_SCENE_PREFIX)) throw new Error("Unknown legacy scene");
  return source;
}

function legacyEntry(key: string): PersonalSceneEntry | null {
  const storage = browserSceneStorage();
  if (!storage) return null;
  const entry = readPersonalScene(storage, legacyKey(key));
  if (!entry) return null;
  return { ...entry, key, sourceKey: entry.key, repository: "legacy" };
}

function item(entry: PersonalSceneEntry): SceneLibraryItem {
  return {
    key: entry.key, kind: entry.kind, name: entry.name, repository: entry.repository ?? "legacy",
    revision: entry.revision ?? entry.raw, savedAt: entry.savedAt, readable: !!entry.definition,
    entityCount: entry.definition?.entities.length ?? 0, label: entry.definition?.label ?? "",
  };
}

export async function listSceneLibrary(): Promise<{ entries: SceneLibraryItem[]; error: string | null }> {
  const legacy = personalScenes(browserSceneStorage());
  let stored: Summary[] = [], databaseError = false;
  try { stored = await readStore<Summary[]>(SCENE_LIBRARY_SUMMARIES); } catch { databaseError = true; }
  const entries: SceneLibraryItem[] = [...stored];
  const byKey = new Map(stored.map(summary => [summary.key, summary]));
  for (const entry of legacy.entries) {
    const current = byKey.get(entry.key);
    if (current) {
      const fingerprint = await digest(entry.raw);
      if (fingerprint && (current.legacyDigest === fingerprint || current.documentDigest === fingerprint)) continue;
      // An older tab may still write via the synchronous API. Expose that version;
      // never silently replace the newer database document or delete the old bytes.
      entries.push({ ...item(entry), key: LEGACY_VERSION_PREFIX + entry.key, name: entry.name + " · autre version", previousVersion: true });
    } else entries.push(item(entry));
  }
  entries.sort((a, b) => (Date.parse(b.savedAt ?? "") || 0) - (Date.parse(a.savedAt ?? "") || 0) || a.name.localeCompare(b.name));
  return { entries, error: databaseError
    ? "Le stockage des scènes est indisponible. Les anciennes sauvegardes accessibles restent proposées ; garde ton travail ouvert et exporte-le."
    : legacy.error ? "Les anciennes sauvegardes et les brouillons ne sont pas tous accessibles. Les scènes enregistrées ici restent disponibles." : null };
}

/** A reference pins the observed version; a URL string intentionally opens the latest. */
export async function readSceneLibrary(reference: SceneLibraryReference | string): Promise<PersonalSceneEntry | null> {
  const key = typeof reference === "string" ? reference : reference.key;
  let entry: PersonalSceneEntry | null = null;
  if (key.startsWith(LOCAL_SCENE_PREFIX) && (typeof reference === "string" || reference.repository === "database")) {
    let stored: StoredScene | undefined;
    try { stored = await readStore<StoredScene | undefined>(SCENE_LIBRARY_DOCUMENTS, key); }
    catch (error) { if (typeof reference !== "string" && reference.repository === "database") throw error; }
    if (stored) entry = { ...personalSceneFromRaw(key, stored.raw, stored.savedAt)!, repository: "database", revision: stored.revision };
  }
  if (!entry) entry = legacyEntry(key);
  if (entry && typeof reference !== "string") {
    const observed = reference.revision ?? reference.raw;
    if (observed !== (entry.repository === "database" ? entry.revision : entry.raw)) throw new Conflict(CHANGED);
  }
  return entry;
}

function failure(error: unknown): PersonalSceneResult {
  return { ok: false, reason: error instanceof Conflict ? "conflict" : "storage", error: error instanceof Conflict ? error.message : UNAVAILABLE };
}

async function writeScene(raw: string, input: string, expected: PersonalSceneEntry | null, source?: PersonalSceneEntry): Promise<PersonalSceneResult> {
  const name = input.trim(), key = LOCAL_SCENE_PREFIX + name;
  if (!name) return { ok: false, reason: "name", error: "Donne un nom à ta scène." };
  const entry = personalSceneFromRaw(key, raw);
  if (!entry?.definition) return { ok: false, reason: "scene", error: "Cette scène est illisible. Exporte ses données pour les conserver." };
  let db: IDBDatabase | null = null;
  try {
    const storage = browserSceneStorage();
    const oldRaw = storage?.getItem(key) ?? null;
    const updating = expected?.key === key ? expected : null;
    const legacyDigest = oldRaw === null ? null : await digest(oldRaw);
    const documentDigest = await digest(raw);
    db = await openDatabase();
    const savedAt = new Date().toISOString(), revision = newRevision();
    const result = await new Promise<PersonalSceneEntry>((resolve, reject) => {
      const tx = db!.transaction([SCENE_LIBRARY_DOCUMENTS, SCENE_LIBRARY_SUMMARIES], "readwrite", { durability: "strict" });
      const documents = tx.objectStore(SCENE_LIBRARY_DOCUMENTS), summaries = tx.objectStore(SCENE_LIBRARY_SUMMARIES);
      let error: unknown;
      const abort = (cause: unknown): void => { error = cause; tx.abort(); };
      const current = documents.get(key);
      const sourceRequest = source?.repository === "database" ? documents.get(source.key) : null;
      let sourceReady = !sourceRequest;
      const put = (): void => {
        if (!sourceReady || current.readyState !== "done") return;
        try {
          const stored = current.result as StoredScene | undefined;
          // Recheck legacy bytes after opening the database; never rewrite them.
          const legacyNow = storage?.getItem(key) ?? null;
          if (legacyNow !== oldRaw) throw new Conflict(CHANGED);
          if (updating?.repository === "database") {
            if (!stored || stored.revision !== updating.revision) throw new Conflict(CHANGED);
          } else if (stored || (updating ? oldRaw !== updating.raw : oldRaw !== null)) {
            throw new Conflict(updating ? CHANGED : "Ce nom existe déjà. Choisis un autre nom pour conserver les deux scènes.");
          }
          if (source) {
            if (sourceRequest ? sourceRequest.result?.revision !== source.revision : legacyEntry(source.key)?.raw !== source.raw) throw new Conflict(CHANGED);
          }
          const origin = stored ? stored.legacyDigest : legacyDigest;
          documents.put({ key, raw, revision, savedAt, legacyDigest: origin } satisfies StoredScene);
          summaries.put({ ...item({ ...entry, savedAt, repository: "database", revision }), legacyDigest: origin, documentDigest } satisfies Summary);
        } catch (cause) { abort(cause); }
      };
      current.onsuccess = put;
      if (sourceRequest) sourceRequest.onsuccess = () => { sourceReady = true; put(); };
      tx.oncomplete = () => resolve({ ...entry, savedAt, repository: "database", revision });
      tx.onabort = () => reject(error ?? tx.error ?? new Error("Scene write aborted"));
      tx.onerror = () => { /* Do not report success before the atomic commit. */ };
    });
    notifySceneLibrary();
    return { ok: true, entry: result, dated: true };
  } catch (error) { return failure(error); }
  finally { db?.close(); }
}

/** Capture the authored document before asynchronous IO so later edits stay dirty. */
export function saveLibraryScene(api: Pick<GraphysXAgentWorldApi, "exportDocument">, name: string, expected: PersonalSceneEntry | null): Promise<PersonalSceneResult> {
  try {
    const definition = api.exportDocument();
    return definition ? writeScene(JSON.stringify(definition), name, expected) : Promise.resolve({ ok: false, reason: "scene", error: "Aucune scène n’est ouverte." });
  } catch (error) { return Promise.resolve(failure(error)); }
}

export async function copyLibraryScene(reference: SceneLibraryReference, name: string): Promise<PersonalSceneResult> {
  try {
    const source = await readSceneLibrary(reference);
    if (!source?.definition) return { ok: false, reason: "scene", error: "Cette scène est illisible. Tu peux toujours exporter ses données." };
    return await writeScene(source.kind === "draft" ? JSON.stringify(source.definition) : source.raw, name, null, source);
  } catch (error) { return failure(error); }
}

export async function readLibraryResume(kind: "dna" | "creation"): Promise<PersonalSceneEntry | null> {
  try {
    const name = browserSceneStorage()?.getItem(kind === "dna" ? DNA_CREATION_RESUME_KEY : FIRST_CREATION_RESUME_KEY);
    const entry = name ? await readSceneLibrary(LOCAL_SCENE_PREFIX + name) : null;
    return entry?.definition && (kind !== "dna" || entry.definition.id === "dna-seed-studio") ? entry : null;
  } catch { return null; }
}

function notifySceneLibrary(): void {
  window.dispatchEvent(new Event("graphysx:scene-library"));
  try { const channel = new BroadcastChannel(SCENE_LIBRARY_DATABASE); channel.postMessage("changed"); channel.close(); } catch { /* Manual refresh remains available. */ }
}

export function subscribeSceneLibrary(listener: () => void): () => void {
  window.addEventListener("storage", listener); window.addEventListener("graphysx:scene-library", listener);
  let channel: BroadcastChannel | null = null;
  try { channel = new BroadcastChannel(SCENE_LIBRARY_DATABASE); channel.onmessage = listener; } catch { /* Optional cross-tab notification. */ }
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("graphysx:scene-library", listener); channel?.close(); };
}

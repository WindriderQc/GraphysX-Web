import type { AgentWorldDefinition } from "./agent-world-runtime";
import { LLMX_FACE_ID, LLMX_SAVE_KEY } from "./llmx-environment";
import { LLMX_FACE_ANCHOR_ID } from "./llmx-forge";
import { validateStoredSceneDefinition } from "../server/scene-commands.mjs";

export type LlmXLibraryNamespace = "personal" | "family";
export type LlmXLibraryEntry = { id: string; name: string; createdAt: string; updatedAt: string; revision: number };
export type LlmXLibraryRecord = LlmXLibraryEntry & { world: AgentWorldDefinition };
export type LlmXLibrarySnapshot = { activeId: string | null; entries: LlmXLibraryEntry[]; migrationWarning: string | null };
export type LlmXLibraryOptions = {
  storage: Pick<Storage, "getItem" | "setItem">;
  namespace?: LlmXLibraryNamespace;
  now?: () => number;
  createId?: () => string;
};
type StoredLibrary = { version: 1; namespace: LlmXLibraryNamespace; activeId: string | null; records: LlmXLibraryRecord[] };

export const LLMX_LIBRARY_NAME_MAX_LENGTH = 80;
export const LLMX_LIBRARY_MAX_RECORDS = 50;
const maximumBytes = 8 * 1024 * 1024;
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;
const worldKeys = ["schema", "id", "label", "environment", "entities", "joints", "rules"];
const entryKeys = ["id", "name", "createdAt", "updatedAt", "revision", "world"];
const copy = <T>(value: T): T => structuredClone(value);
const invalid = (message: string) => new Error(message);

export function llmxLibraryStorageKey(namespace: LlmXLibraryNamespace = "personal"): string {
  if (namespace !== "personal" && namespace !== "family") throw invalid("Espace de bibliothèque invalide.");
  return `graphysx.llmx.library.${namespace}.v1`;
}

function fields(value: unknown, allowed: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) throw invalid(`${label} contient des données non prises en charge.`);
}
function nameValue(value: unknown): string {
  if (typeof value !== "string") throw invalid("Donne un nom à cet environnement.");
  const name = value.normalize("NFC").trim();
  if (!name || name.length > LLMX_LIBRARY_NAME_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) {
    throw invalid(`Le nom doit contenir entre 1 et ${LLMX_LIBRARY_NAME_MAX_LENGTH} caractères, sur une ligne.`);
  }
  return name;
}
function idValue(value: unknown): string {
  if (typeof value !== "string" || !idPattern.test(value)) throw invalid("Identifiant d’environnement invalide.");
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw invalid("Date de sauvegarde invalide.");
  }
  return value;
}
function metadata(record: LlmXLibraryRecord): LlmXLibraryEntry {
  const { id, name, createdAt, updatedAt, revision } = record;
  return { id, name, createdAt, updatedAt, revision };
}
function nextRevision(record: LlmXLibraryRecord): number {
  if (record.revision === Number.MAX_SAFE_INTEGER) throw invalid("Cette sauvegarde ne peut plus recevoir de nouvelle révision. Enregistre une copie.");
  return record.revision + 1;
}

/** Shared authored-document validation also checks appearances, references and parent cycles. */
export function validateLlmXLibraryWorld(value: unknown): asserts value is AgentWorldDefinition {
  fields(value, worldKeys, "Le monde");
  validateStoredSceneDefinition(value);
  const world = value as unknown as AgentWorldDefinition;
  const face = world.entities.find(entity => entity.id === LLMX_FACE_ID);
  const anchor = world.entities.find(entity => entity.id === LLMX_FACE_ANCHOR_ID);
  if (anchor?.type !== "group" || face?.type !== "agent" || face.parentId !== LLMX_FACE_ANCHOR_ID ||
      face.appearance?.kind !== "voxel-face") throw invalid("Le monde doit conserver son visage LLMx et son ancrage.");
}

function decode(raw: string, namespace: LlmXLibraryNamespace): StoredLibrary {
  const value: unknown = JSON.parse(raw);
  fields(value, ["version", "namespace", "activeId", "records"], "La bibliothèque");
  if (value.version !== 1 || value.namespace !== namespace || !Array.isArray(value.records) || value.records.length > LLMX_LIBRARY_MAX_RECORDS) {
    throw invalid("Format de bibliothèque LLMx incompatible.");
  }
  const ids = new Set<string>(), names = new Set<string>();
  const records = value.records.map((entry: unknown): LlmXLibraryRecord => {
    fields(entry, entryKeys, "La sauvegarde");
    const id = idValue(entry.id), name = nameValue(entry.name);
    if (name !== entry.name || ids.has(id) || names.has(name.toLowerCase())) throw invalid("La bibliothèque contient un identifiant ou un nom en double.");
    ids.add(id); names.add(name.toLowerCase());
    const createdAt = timestamp(entry.createdAt), updatedAt = timestamp(entry.updatedAt);
    if (Date.parse(updatedAt) < Date.parse(createdAt) || typeof entry.revision !== "number" || !Number.isSafeInteger(entry.revision) || entry.revision < 1) {
      throw invalid("Métadonnées de sauvegarde invalides.");
    }
    validateLlmXLibraryWorld(entry.world);
    if (entry.world.id !== id || entry.world.label !== name) throw invalid("Le nom et l’identité du monde ne correspondent pas à sa sauvegarde.");
    return { id, name, createdAt, updatedAt, revision: entry.revision, world: entry.world };
  });
  if (value.activeId !== null && (typeof value.activeId !== "string" || !ids.has(value.activeId))) {
    throw invalid("L’environnement actif enregistré n’existe plus dans la bibliothèque.");
  }
  return { version: 1, namespace, activeId: value.activeId, records };
}

/** One atomic browser-storage value per audience. It never reads or writes conversation data. */
export class LlmXLibrary {
  readonly namespace: LlmXLibraryNamespace;
  readonly storageKey: string;
  migrationWarning: string | null = null;
  private readonly options: LlmXLibraryOptions;
  private state: StoredLibrary;
  private raw: string | null = null;
  private loaded = false;

  constructor(options: LlmXLibraryOptions) {
    this.options = options;
    this.namespace = options.namespace ?? "personal";
    this.storageKey = llmxLibraryStorageKey(this.namespace);
    this.state = { version: 1, namespace: this.namespace, activeId: null, records: [] };
  }

  get activeId(): string | null { return this.state.activeId; }

  /** A failed read preserves both the original bytes and the last confirmed in-memory snapshot. */
  load(): LlmXLibrarySnapshot {
    this.loaded = false;
    const raw = this.options.storage.getItem(this.storageKey);
    if (raw !== null) {
      const next = decode(raw, this.namespace);
      this.state = next; this.raw = raw; this.loaded = true;
      this.migrationWarning = null;
      return this.snapshot();
    }
    // Family must never inspect the historical private Forge key, even when it is empty.
    const legacy = this.namespace === "personal" ? this.options.storage.getItem(LLMX_SAVE_KEY) : null;
    this.state = { version: 1, namespace: this.namespace, activeId: null, records: [] };
    this.raw = null; this.loaded = true; this.migrationWarning = null;
    if (legacy !== null) {
      let world: AgentWorldDefinition, name: string;
      try {
        const record: unknown = JSON.parse(legacy);
        fields(record, ["version", "world"], "L’ancienne sauvegarde");
        if (record.version !== 1) throw invalid("Version de sauvegarde inconnue.");
        validateLlmXLibraryWorld(record.world);
        world = record.world;
        name = nameValue(world.label);
      } catch {
        this.migrationWarning = "L’ancienne sauvegarde est illisible. Ses données sont conservées; tu peux enregistrer un nouvel environnement.";
        return this.snapshot();
      }
      try { this.save(name, world); }
      catch (error) { this.loaded = false; throw error; }
    }
    return this.snapshot();
  }

  list(): LlmXLibraryEntry[] { this.ensureLoaded(); return this.snapshot().entries; }
  read(id: string): LlmXLibraryRecord { this.ensureLoaded(); return copy(this.require(id)); }

  activate(id: string): LlmXLibraryRecord {
    this.ensureLoaded(); const record = this.require(id);
    if (id !== this.state.activeId) this.commit({ ...this.state, activeId: id });
    return copy(record);
  }

  /** New named copy of the current world; updates always require an existing explicit ID. */
  save(name: string, world: AgentWorldDefinition): LlmXLibraryRecord {
    this.ensureLoaded();
    const record = this.create(name, world);
    this.commit({ ...this.state, activeId: record.id, records: [...this.state.records, record] });
    return copy(record);
  }

  saveAs(name: string, world: AgentWorldDefinition): LlmXLibraryRecord { return this.save(name, world); }

  update(id: string, world: AgentWorldDefinition): LlmXLibraryRecord {
    this.ensureLoaded();
    const current = this.require(id);
    const record = { ...current, world: this.world(world, current.id, current.name),
      updatedAt: this.time(current.updatedAt), revision: nextRevision(current) };
    this.replace(record); return copy(record);
  }

  /** Duplicating a saved item preserves the active environment until the caller opens the copy. */
  duplicate(id: string, name: string): LlmXLibraryRecord {
    this.ensureLoaded(); const record = this.create(name, this.require(id).world);
    this.commit({ ...this.state, records: [...this.state.records, record] });
    return copy(record);
  }

  rename(id: string, name: string): LlmXLibraryRecord {
    this.ensureLoaded(); const current = this.require(id), nextName = this.uniqueName(name, id);
    if (nextName === current.name) return copy(current);
    const record = { ...current, name: nextName, world: this.world(current.world, id, nextName),
      updatedAt: this.time(current.updatedAt), revision: nextRevision(current) };
    this.replace(record); return copy(record);
  }

  /** Only the supplied existing ID is removed; deleting the active entry selects no replacement. */
  remove(id: string): void {
    this.ensureLoaded(); this.require(id);
    this.commit({ ...this.state, activeId: this.state.activeId === id ? null : this.state.activeId,
      records: this.state.records.filter(record => record.id !== id) });
  }

  private snapshot(): LlmXLibrarySnapshot {
    return { activeId: this.state.activeId, migrationWarning: this.migrationWarning,
      entries: this.state.records.map(metadata).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.name.localeCompare(b.name, "fr")) };
  }
  private ensureLoaded(): void { if (!this.loaded) this.load(); }
  private require(id: string): LlmXLibraryRecord {
    idValue(id);
    const record = this.state.records.find(record => record.id === id);
    if (!record) throw invalid("Cet environnement n’existe pas dans cette bibliothèque.");
    return record;
  }
  private time(previous?: string): string {
    const now = (this.options.now ?? Date.now)();
    if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000) throw invalid("L’horloge ne permet pas de dater cette sauvegarde.");
    return new Date(Math.max(now, previous ? Date.parse(previous) : 0)).toISOString();
  }
  private uniqueName(name: string, excluding?: string): string {
    const normalized = nameValue(name);
    if (this.state.records.some(record => record.id !== excluding && record.name.toLowerCase() === normalized.toLowerCase())) {
      throw invalid("Un environnement porte déjà ce nom. Choisis un autre nom ou mets à jour cette sauvegarde.");
    }
    return normalized;
  }
  private world(value: AgentWorldDefinition, id: string, name: string): AgentWorldDefinition {
    validateLlmXLibraryWorld(value);
    const world = copy(value); world.id = id; world.label = name;
    return world;
  }
  private create(name: string, world: AgentWorldDefinition): LlmXLibraryRecord {
    if (this.state.records.length >= LLMX_LIBRARY_MAX_RECORDS) throw invalid(`Cette bibliothèque contient déjà ${LLMX_LIBRARY_MAX_RECORDS} environnements.`);
    const normalized = this.uniqueName(name);
    const id = idValue((this.options.createId ?? (() => "llmx-" + globalThis.crypto.randomUUID()))());
    if (this.state.records.some(record => record.id === id)) throw invalid("Cet identifiant d’environnement existe déjà.");
    const date = this.time();
    return { id, name: normalized, world: this.world(world, id, normalized), createdAt: date, updatedAt: date, revision: 1 };
  }
  private replace(record: LlmXLibraryRecord): void {
    this.commit({ ...this.state, records: this.state.records.map(previous => previous.id === record.id ? record : previous) });
  }
  private commit(next: StoredLibrary): void {
    const serialized = JSON.stringify(next);
    if (new TextEncoder().encode(serialized).byteLength > maximumBytes) throw invalid("La bibliothèque est trop volumineuse pour être enregistrée.");
    // localStorage setItem is atomic. A quota/security error must leave the visible
    // name, active ID, revision and world at their last successfully persisted values.
    if (this.options.storage.getItem(this.storageKey) !== this.raw) {
      throw invalid("La bibliothèque a changé dans un autre onglet. Recharge-la avant d’enregistrer.");
    }
    this.options.storage.setItem(this.storageKey, serialized);
    this.state = next; this.raw = serialized;
  }
}

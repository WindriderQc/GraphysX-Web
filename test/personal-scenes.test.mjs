import assert from "node:assert/strict";
import { test } from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { personalScenes, readPersonalScene, savePersonalScene, copyPersonalScene, datePersonalScene, browserSceneStorage } =
  await importBrowserModule(new URL("../src/personal-scenes.ts", import.meta.url));
const PREFIX = "graphysx.agent-world.v2.";
const document = { schema: "graphysx.agent-world/v2", id: "my-world", label: "Mon monde", entities: [{ id: "cube", type: "box", position: [1, 2, 3], tags: ["authored"] }] };
class MemoryStorage {
  data = new Map(); writes = [];
  constructor(values = {}) { for (const [key, value] of Object.entries(values)) this.data.set(key, value); }
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.writes.push(key); this.data.set(key, value); }
}
const apiFor = (storage, value = document) => ({
  exportDocument: () => structuredClone(value),
  save: name => { try { storage.setItem(PREFIX + name.trim(), JSON.stringify(value)); return { ok: true, value: name }; } catch { return { ok: false, error: "fixture quota" }; } },
});

test("personal scenes discovers old Studio, DNA, guided saves and both draft generations without migration", () => {
  const dna = { ...document, id: "dna-seed-studio" }, guided = { ...document, id: "first-creation" };
  const storage = new MemoryStorage({
    [PREFIX + "Ancienne scène"]: JSON.stringify(document, null, 2),
    [PREFIX + "ADN"]: JSON.stringify(dna), [PREFIX + "Création guidée"]: JSON.stringify(guided),
    [PREFIX + "À réparer"]: "{broken-json",
    "graphysx.editor.draft.v1": JSON.stringify({ savedAt: "2026-11-10T10:00:00Z", definition: document }),
    "graphysx.editor.draft.v2.workspace": JSON.stringify({ savedAt: "2026-11-19T10:00:00Z", definition: dna }),
    "graphysx.editor.slots.v1": JSON.stringify(["missing-old-index-entry"]),
    "graphysx.dna-creation.resume.v1": "ADN", "unrelated.private.data": "leave alone",
  });
  const before = [...storage.data];
  const result = personalScenes(storage);
  assert.equal(result.error, null); assert.equal(result.entries.length, 6);
  assert.equal(result.entries.filter(entry => entry.kind === "draft").length, 2);
  assert.equal(result.entries.find(entry => entry.name === "ADN").definition.id, "dna-seed-studio");
  assert.equal(result.entries.find(entry => entry.name === "À réparer").definition, null);
  assert.equal(result.entries[0].savedAt, "2026-11-19T10:00:00Z");
  assert.deepEqual([...storage.data], before); assert.deepEqual(storage.writes, []);
});

test("save refuses a name collision or a stale observed version before calling the authoring API", () => {
  const original = JSON.stringify(document), storage = new MemoryStorage({ [PREFIX + "Maison"]: original });
  let calls = 0; const api = { exportDocument: () => document, save: () => { calls += 1; return { ok: true }; } };
  assert.equal(savePersonalScene(api, storage, "Maison", null).reason, "conflict");
  const observed = readPersonalScene(storage, PREFIX + "Maison");
  storage.data.set(observed.key, JSON.stringify({ ...document, label: "From another tab" }));
  const before = [...storage.data];
  assert.equal(savePersonalScene(api, storage, "Maison", observed).reason, "conflict");
  assert.equal(calls, 0); assert.deepEqual([...storage.data], before);
  assert.equal(savePersonalScene(api, storage, "   ", null).reason, "name");
});

test("named save and update persist the complete document while a new name retains the old variant", () => {
  const storage = new MemoryStorage();
  const saved = savePersonalScene(apiFor(storage), storage, "  Ma scène  ", null);
  assert.equal(saved.ok, true); assert.equal(saved.entry.name, "Ma scène");
  const edited = { ...document, environment: { background: "#123456" }, entities: [...document.entities, { id: "added", type: "sphere" }] };
  const updated = savePersonalScene(apiFor(storage, edited), storage, "Ma scène", saved.entry);
  assert.equal(updated.ok, true); assert.deepEqual(JSON.parse(updated.entry.raw), edited);
  const fork = savePersonalScene(apiFor(storage, document), storage, "Autre variante", updated.entry);
  assert.equal(fork.ok, true); assert.deepEqual(JSON.parse(storage.getItem(PREFIX + "Ma scène")), edited);
  assert.deepEqual(JSON.parse(storage.getItem(PREFIX + "Autre variante")), document);
});

test("failed storage preserves prior scene bytes; failed optional dates do not misreport a successful save", () => {
  const original = JSON.stringify(document), storage = new MemoryStorage({ [PREFIX + "Original"]: original });
  const observed = readPersonalScene(storage, PREFIX + "Original");
  storage.setItem = () => { throw new Error("quota"); };
  assert.equal(savePersonalScene(apiFor(storage), storage, "Original", observed).ok, false);
  assert.equal(storage.getItem(observed.key), original);
  const metadataBlocked = new MemoryStorage();
  const write = metadataBlocked.setItem.bind(metadataBlocked);
  metadataBlocked.setItem = (key, value) => { if (!key.startsWith(PREFIX)) throw new Error("metadata quota"); write(key, value); };
  const saved = savePersonalScene(apiFor(metadataBlocked), metadataBlocked, "Sans date", null);
  assert.equal(saved.ok, true); assert.equal(saved.dated, false);
  assert.deepEqual(JSON.parse(metadataBlocked.getItem(PREFIX + "Sans date")), document);
});

test("copy retains exact source bytes, both originals and resume pointers, and rejects stale or unreadable data", () => {
  const raw = JSON.stringify(document, null, 2), storage = new MemoryStorage({ [PREFIX + "Source"]: raw, "graphysx.dna-creation.resume.v1": "Source" });
  const source = readPersonalScene(storage, PREFIX + "Source");
  const copied = copyPersonalScene(storage, source, "Copie");
  assert.equal(copied.ok, true); assert.equal(storage.getItem(PREFIX + "Copie"), raw);
  assert.equal(storage.getItem(source.key), raw); assert.equal(storage.getItem("graphysx.dna-creation.resume.v1"), "Source");
  assert.equal(copyPersonalScene(storage, source, "Copie").reason, "conflict");
  storage.data.set(source.key, "changed");
  assert.equal(copyPersonalScene(storage, source, "Stale copy").ok, false);
  assert.equal(storage.getItem(PREFIX + "Stale copy"), null);
  assert.equal(copyPersonalScene(storage, { ...source, raw: "changed", definition: null }, "Bad copy").ok, false);
});

test("unavailable storage is distinct from an empty library and arbitrary storage keys are never scenes", () => {
  assert.equal(browserSceneStorage(), null);
  assert.match(personalScenes(null).error, /indisponible/);
  assert.equal(personalScenes(new MemoryStorage()).error, null);
  assert.equal(readPersonalScene(new MemoryStorage({ private: JSON.stringify(document) }), "private"), null);
  const throwing = { get length() { throw new Error("blocked"); } };
  assert.match(personalScenes(throwing).error, /accessibles/);
});

test("copying a draft makes a normal portable scene while retaining the original recovery envelope", () => {
  const key = "graphysx.editor.draft.v2.retained", raw = JSON.stringify({ definition: document, savedAt: "2026-11-19T10:00:00Z" });
  const storage = new MemoryStorage({ [key]: raw });
  const result = copyPersonalScene(storage, readPersonalScene(storage, key), "Brouillon nommé");
  assert.equal(result.ok, true); assert.deepEqual(JSON.parse(result.entry.raw), document);
  assert.equal(readPersonalScene(storage, result.entry.key).definition.id, document.id);
  assert.equal(storage.getItem(key), raw);
});

test("dates are optional, tolerate malformed metadata and support names that match object prototype properties", () => {
  const storage = new MemoryStorage({ [PREFIX + "__proto__"]: JSON.stringify(document), "graphysx.personal-scenes.metadata.v1": "broken" });
  assert.equal(datePersonalScene(storage, "__proto__", "2026-11-19T12:00:00Z"), true);
  assert.equal(readPersonalScene(storage, PREFIX + "__proto__").savedAt, "2026-11-19T12:00:00Z");
  assert.equal({}.savedAt, undefined);
});

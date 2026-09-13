import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import { importBrowserModule } from "./support/import-browser-module.mjs";

// The browser module's real legacy adapter has one extensionless TS dependency.
// Resolve that existing module under Node without mocking either persistence path.
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(specifier === "./llmx-forge" && context.parentURL?.endsWith("/llmx-environment.ts") ? "./llmx-forge.ts" : specifier, context);
} });
let libraryModule, environmentModule;
try {
  libraryModule = await importBrowserModule(new URL("../src/llmx-library.ts", import.meta.url));
  environmentModule = await importBrowserModule(new URL("../src/llmx-environment.ts", import.meta.url));
} finally { hook.deregister(); }
const { LlmXLibrary, llmxLibraryStorageKey, validateLlmXLibraryWorld } = libraryModule;
const { createLlmXForge, LLMX_SAVE_KEY } = environmentModule;
const world = () => createLlmXForge().document;
function setup(namespace = "personal", initial = []) {
  const values = new Map(initial), reads = [], writes = [];
  let sequence = 0, time = 1000, failWrite = false;
  const storage = { getItem(key) { reads.push(key); return values.get(key) ?? null; },
    setItem(key, value) { if (failWrite) throw new Error("quota"); writes.push(key); values.set(key, value); } };
  const library = new LlmXLibrary({ storage, namespace, createId: () => "llmx-saved-" + (++sequence), now: () => time });
  return { library, storage, values, reads, writes, tick() { time += 1000; }, fail(value = true) { failWrite = value; } };
}

test("an empty library has no implicitly selected world and does not write before saving", () => {
  const h = setup();
  assert.deepEqual(h.library.load(), { activeId: null, entries: [], migrationWarning: null });
  assert.deepEqual(h.writes, []);
  assert.throws(() => h.library.read("absent"), /n’existe pas/);
  assert.throws(() => h.library.remove("absent"), /n’existe pas/);
  assert.equal(h.library.activeId, null);
});

test("save, update and save-as keep stable identities, named documents and defensive copies", () => {
  const h = setup(), original = world(), before = structuredClone(original);
  const first = h.library.save("  Ma Forge  ", original);
  assert.equal(first.name, "Ma Forge");
  assert.equal(first.world.id, first.id);
  assert.equal(first.world.label, first.name);
  assert.deepEqual(original, before);
  assert.equal(h.library.activeId, first.id);
  first.world.entities[0].label = "Caller mutation";
  assert.notEqual(h.library.read(first.id).world.entities[0].label, "Caller mutation");
  const changed = h.library.read(first.id).world;
  changed.entities.find(entity => entity.id === "llmx-face").appearance.seed = 17;
  h.tick();
  const updated = h.library.update(first.id, changed);
  assert.equal(updated.id, first.id);
  assert.equal(updated.revision, 2);
  assert.equal(updated.createdAt, first.createdAt);
  assert.ok(updated.updatedAt > updated.createdAt);
  assert.equal(updated.world.entities.find(entity => entity.id === "llmx-face").appearance.seed, 17);
  const second = h.library.saveAs("Copie", changed);
  assert.notEqual(second.id, first.id);
  assert.equal(h.library.activeId, second.id);
  assert.equal(h.library.list().length, 2);
  const summaries = h.library.list(); summaries[0].name = "External metadata mutation";
  assert.ok(h.library.list().every(entry => entry.name !== "External metadata mutation"));
  assert.ok(h.library.list().every(entry => !("world" in entry)));
  const reloaded = new LlmXLibrary({ storage: h.storage });
  assert.equal(reloaded.load().activeId, second.id);
  assert.deepEqual(reloaded.read(first.id), updated);
});

test("duplicate preserves the active selection; rename and explicit deletion affect only their exact ID", () => {
  const h = setup();
  const first = h.library.save("Original", world());
  const second = h.library.duplicate(first.id, "Copie");
  assert.equal(h.library.activeId, first.id);
  assert.equal(second.world.id, second.id);
  assert.equal(second.world.label, "Copie");
  h.tick(); const renamed = h.library.rename(second.id, "Autre Forge");
  assert.equal(renamed.id, second.id);
  assert.equal(renamed.world.label, "Autre Forge");
  assert.equal(renamed.revision, 2);
  assert.equal(h.library.read(first.id).name, "Original");
  h.library.activate(second.id);
  h.library.remove(first.id);
  assert.equal(h.library.activeId, second.id);
  h.library.remove(second.id);
  assert.equal(h.library.activeId, null);
  assert.deepEqual(h.library.list(), []);
  const reloaded = new LlmXLibrary({ storage: h.storage });
  assert.deepEqual(reloaded.load().entries, []);
});

test("names normalize NFC and case conflicts cannot overwrite another world", () => {
  const h = setup();
  const first = h.library.save("Cafe\u0301", world());
  assert.equal(first.name, "Café");
  const bytes = h.values.get(h.library.storageKey);
  assert.throws(() => h.library.save("  CAFÉ ", world()), /déjà ce nom/);
  assert.throws(() => h.library.duplicate(first.id, "café"), /déjà ce nom/);
  for (const name of ["", " ", "x".repeat(81), "two\nlines"]) assert.throws(() => h.library.save(name, world()));
  assert.equal(h.values.get(h.library.storageKey), bytes);
  assert.equal(h.library.list().length, 1);
});

test("personal migration copies the legacy Forge once and leaves its exact bytes forever", () => {
  const legacyWorld = world();
  const legacy = JSON.stringify({ version: 1, world: legacyWorld }, null, 2);
  const h = setup("personal", [[LLMX_SAVE_KEY, legacy]]);
  const migrated = h.library.load();
  assert.equal(migrated.entries.length, 1);
  assert.equal(migrated.activeId, migrated.entries[0].id);
  assert.equal(h.values.get(LLMX_SAVE_KEY), legacy);
  const saved = h.library.read(migrated.activeId);
  assert.deepEqual(saved.world.entities, legacyWorld.entities);
  assert.notEqual(saved.world.id, legacyWorld.id);
  assert.deepEqual(h.writes, [h.library.storageKey]);
  h.library.remove(saved.id);
  assert.deepEqual(new LlmXLibrary({ storage: h.storage }).load().entries, []);
  assert.equal(h.values.get(LLMX_SAVE_KEY), legacy, "deleting the migrated copy must neither delete nor remigrate the legacy bytes");
});

test("family never reads or migrates the private legacy save or personal library", () => {
  const h = setup("family", [[LLMX_SAVE_KEY, JSON.stringify({ version: 1, world: world() })],
    [llmxLibraryStorageKey("personal"), "private-corrupt-library"]]);
  assert.deepEqual(h.library.load().entries, []);
  const record = h.library.save("Famille", world());
  assert.deepEqual([...new Set(h.reads)], [llmxLibraryStorageKey("family")]);
  assert.deepEqual(h.writes, [llmxLibraryStorageKey("family")]);
  assert.equal(h.values.get(llmxLibraryStorageKey("personal")), "private-corrupt-library");
  assert.equal(record.name, "Famille");
});

test("a corrupt legacy record is preserved and reported while a separate new library remains usable", () => {
  for (const legacy of ['{ "version": 1, "world": broken', JSON.stringify({ version: 1, world: { ...world(), label: "x".repeat(81) } })]) {
    const h = setup("personal", [[LLMX_SAVE_KEY, legacy]]);
    assert.match(h.library.load().migrationWarning, /illisible/);
    assert.deepEqual(h.writes, []);
    h.library.save("Nouvelle Forge", world());
    assert.equal(h.values.get(LLMX_SAVE_KEY), legacy);
    assert.equal(h.library.list().length, 1);
  }
});

test("an exhausted revision cannot persist metadata that would fail on reload", () => {
  const h = setup(), first = h.library.save("Original", world());
  const stored = JSON.parse(h.values.get(h.library.storageKey));
  stored.records[0].revision = Number.MAX_SAFE_INTEGER;
  const bytes = JSON.stringify(stored);
  h.values.set(h.library.storageKey, bytes); h.library.load();
  assert.throws(() => h.library.update(first.id, world()), /nouvelle révision/);
  assert.throws(() => h.library.rename(first.id, "Renamed"), /nouvelle révision/);
  assert.equal(h.values.get(h.library.storageKey), bytes);
  const duplicate = h.library.duplicate(first.id, "Copie");
  assert.equal(duplicate.revision, 1);
  assert.equal(h.library.load().entries.length, 2);
});

test("corrupt library bytes and invalid records block all writes rather than being replaced", () => {
  const seed = setup(); seed.library.save("Valide", world());
  const valid = JSON.parse(seed.values.get(seed.library.storageKey));
  const variants = ["{broken", JSON.stringify({ ...valid, version: 9 }),
    JSON.stringify({ ...valid, namespace: "family" }), JSON.stringify({ ...valid, activeId: "missing" }),
    JSON.stringify({ ...valid, records: [...valid.records, valid.records[0]] }),
    JSON.stringify({ ...valid, records: [{ ...valid.records[0], world: { ...valid.records[0].world, entities: [] } }] }),
    JSON.stringify({ ...valid, history: [{ role: "user", content: "private" }] })];
  for (const raw of variants) {
    const h = setup("personal", [[llmxLibraryStorageKey(), raw]]);
    assert.throws(() => h.library.load());
    assert.throws(() => h.library.save("Replacement", world()));
    assert.equal(h.values.get(h.library.storageKey), raw);
    assert.deepEqual(h.writes, []);
  }
});

test("a quota failure keeps creation, update, rename, delete and active selection truthful", () => {
  const h = setup(), first = h.library.save("Original", world());
  const second = h.library.duplicate(first.id, "Copie");
  const bytes = h.values.get(h.library.storageKey), before = h.library.load();
  h.fail();
  for (const operation of [() => h.library.save("New", world()), () => h.library.update(first.id, world()),
    () => h.library.rename(first.id, "Renamed"), () => h.library.remove(first.id), () => h.library.activate(second.id)]) {
    assert.throws(operation, /quota/);
    assert.equal(h.values.get(h.library.storageKey), bytes);
    assert.deepEqual(h.library.list(), before.entries);
    assert.equal(h.library.activeId, before.activeId);
    assert.deepEqual(h.library.read(first.id), first);
  }
});

test("migration write failure is not presented as a saved copy and can be retried", () => {
  const legacy = JSON.stringify({ version: 1, world: world() });
  const h = setup("personal", [[LLMX_SAVE_KEY, legacy]]);
  h.fail(); assert.throws(() => h.library.load(), /quota/);
  assert.equal(h.library.activeId, null);
  assert.equal(h.values.has(h.library.storageKey), false);
  assert.equal(h.values.get(LLMX_SAVE_KEY), legacy);
  h.fail(false);
  assert.equal(h.library.load().entries.length, 1);
});

test("another tab cannot be silently overwritten; explicit reload recovers the exact active ID", () => {
  const h = setup(), first = h.library.save("First", world());
  const other = new LlmXLibrary({ storage: h.storage, createId: () => "other-tab-world" });
  other.load(); const newer = other.save("Other tab", world());
  const bytes = h.values.get(h.library.storageKey);
  assert.throws(() => h.library.rename(first.id, "Lost update"), /autre onglet/);
  assert.equal(h.values.get(h.library.storageKey), bytes);
  assert.equal(h.library.activeId, first.id);
  assert.equal(h.library.load().activeId, newer.id);
  assert.equal(h.library.list().length, 2);
});

test("full shared validation rejects invalid graphs, appearance, live state and a broken face anchor", () => {
  const h = setup();
  const variants = [
    value => { value.entities.push(structuredClone(value.entities[0])); },
    value => { value.entities[0].transform = { position: [Infinity, 0, 0] }; },
    value => { value.entities.find(entity => entity.id === "llmx-face").appearance.seed = -1; },
    value => { value.entities.find(entity => entity.id === "llmx-face").appearance.speak = 1; },
    value => { value.entities.find(entity => entity.id === "llmx-face").parentId = "missing"; },
    value => { value.entities.find(entity => entity.id === "llmx-face-anchor").type = "box"; },
    value => { value.entities.find(entity => entity.id === "llmx-face-anchor").parentId = "llmx-face"; },
    value => { value.sessionId = "private-session"; },
    value => { value.history = [{ role: "user", content: "private" }]; },
  ];
  for (const mutate of variants) {
    const value = world(); mutate(value);
    assert.throws(() => validateLlmXLibraryWorld(value));
    assert.throws(() => h.library.save("Invalid", value));
  }
  assert.deepEqual(h.writes, []);
});

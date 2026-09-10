import { test } from "node:test";
import assert from "node:assert/strict";
import { createEv3ProgramStore, EV3_PROGRAM_STORAGE_KEY, isEv3FirstProgram } from "../src/ev3-first-program.ts";

const fixture = () => {
  const values = new Map();
  let blocked = false;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      if (blocked) throw new Error("Quota exceeded");
      values.set(key, value);
    },
  };
  return { values, storage, block: () => { blocked = true; }, store: createEv3ProgramStore(() => storage, () => 100) };
};
const success = (result) => { assert.equal(result.ok, true, result.error); return result.value; };

test("named programs survive a new store instance and snapshots cannot mutate saved blocks", () => {
  const f = fixture();
  const blocks = ["left", "forward", "stop"];
  const saved = success(f.store.save("  My turn  ", blocks));
  blocks.push("right");
  saved.blocks.push("right");
  const loaded = success(createEv3ProgramStore(() => f.storage).read());
  assert.deepEqual(loaded, [{ name: "My turn", blocks: ["left", "forward", "stop"], updatedAt: 100 }]);
  loaded[0].blocks.pop();
  assert.equal(success(f.store.read())[0].blocks.length, 3);
});

test("only the bounded four-block language can be saved", () => {
  const f = fixture();
  for (const blocks of [[], Array(2), ["constructor"], ["__proto__"], ["jump"], [1], null, "forward", Array(7).fill("forward")]) {
    assert.equal(isEv3FirstProgram(blocks), false);
    assert.equal(f.store.save("Invalid", blocks).ok, false);
  }
  for (const name of ["", "   ", "a".repeat(41)]) assert.equal(f.store.save(name, ["stop"]).ok, false);
  assert.equal(f.values.size, 0);
  success(f.store.save("Six", Array(6).fill("forward")));
});

test("case and Unicode equivalent names require an explicit update of the opened record", () => {
  const f = fixture();
  const first = success(f.store.save("Café", ["forward"]));
  assert.equal(f.store.save(" CAFE\u0301 ", ["left"]).ok, false);
  const updated = success(f.store.save("CAFÉ", ["left"], first));
  assert.equal(updated.updatedAt, 101);
  assert.deepEqual(success(f.store.read()), [updated]);
  const copy = success(f.store.save("Another", updated.blocks));
  assert.equal(success(f.store.read()).length, 2);
  success(f.store.remove(copy));
  assert.deepEqual(success(f.store.read()), [updated]);
});

test("failed writes preserve the previous durable data and never report success", () => {
  const f = fixture();
  const saved = success(f.store.save("Home", ["forward"]));
  const raw = f.storage.getItem(EV3_PROGRAM_STORAGE_KEY);
  f.block();
  assert.equal(f.store.save("Home", ["right"], saved).ok, false);
  assert.equal(f.store.save("Copy", ["stop"]).ok, false);
  assert.equal(f.store.remove(saved).ok, false);
  assert.equal(f.storage.getItem(EV3_PROGRAM_STORAGE_KEY), raw);
  assert.deepEqual(success(f.store.read()), [saved]);
});

test("blocked storage access is reported without throwing", () => {
  const store = createEv3ProgramStore(() => { throw new Error("Storage disabled"); });
  assert.equal(store.read().ok, false);
  assert.equal(store.save("Home", ["forward"]).ok, false);
});

test("corrupt, future-version and invalid stored programs are kept untouched", () => {
  const f = fixture();
  const valid = success(f.store.save("Home", ["forward"]));
  const wrap = (programs) => JSON.stringify({ schema: "graphysx.kidx-first-drive-programs/v1", programs });
  for (const raw of ["{broken", "null", JSON.stringify({ schema: "v2", programs: [] }),
    wrap([{ ...valid, blocks: ["teleport"] }]), wrap([{ ...valid, blocks: [] }]),
    wrap([{ ...valid, updatedAt: -1 }]), wrap([valid, { ...valid, name: "HOME" }])]) {
    f.values.set(EV3_PROGRAM_STORAGE_KEY, raw);
    assert.equal(f.store.read().ok, false);
    assert.equal(f.store.save("New", ["stop"]).ok, false);
    assert.equal(f.store.remove(valid).ok, false);
    assert.equal(f.storage.getItem(EV3_PROGRAM_STORAGE_KEY), raw);
  }
});

test("fresh reads preserve other names and refuse stale updates and deletions", () => {
  const f = fixture();
  const other = createEv3ProgramStore(() => f.storage, () => 100);
  const old = success(f.store.save("Home", ["forward"]));
  success(other.save("Away", ["left"]));
  const updated = success(other.save("Home", ["right"], old));
  assert.equal(f.store.save("Home", ["stop"], old).ok, false);
  assert.equal(f.store.remove(old).ok, false);
  assert.equal(success(f.store.read()).length, 2);
  success(other.remove(updated));
  assert.equal(f.store.save("Home", ["stop"], updated).ok, false);
  assert.equal(success(f.store.read())[0].name, "Away");
});

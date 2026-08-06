import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeStoreName,
  encodeStoreName,
  isLegacyStoreNamePortable,
  legacyStoreNameCandidates,
} from "../server/store-paths.mjs";

const roundTrip = (name) => decodeStoreName(encodeStoreName(name));

describe("store name encoding", () => {
  it("round-trips the complete legal id alphabet through a marker that raw ids cannot use", () => {
    for (const name of ["my-scene", "aA0.z_9-Q:x", "CON", "level:my-course"]) {
      assert.match(encodeStoreName(name), /^~[0-9a-f]+$/);
      assert.equal(roundTrip(name), name);
    }
  });

  it("is distinct even after a case-insensitive filesystem folds the component", () => {
    const encoded = ["Foo", "foo", "FOO"].map((name) => encodeStoreName(name).toLowerCase());
    assert.equal(new Set(encoded).size, encoded.length);
  });

  it("keeps maximum-length ids comfortably below the component limit", () => {
    const maximum = `a${":".repeat(79)}`;
    const encoded = encodeStoreName(maximum);
    assert.equal(roundTrip(maximum), maximum);
    assert.ok(Buffer.byteLength(encoded) <= 161);
    assert.ok(Buffer.byteLength(`${encoded}__${"f".repeat(16)}.json.123456.tmp`) < 255);
  });

  it("retains historical candidates newest-first and skips impossible components", () => {
    assert.deepEqual(legacyStoreNameCandidates("legacy_scene", { platform: "win32" }), ["legacy%5Fscene", "legacy_scene"]);
    assert.deepEqual(legacyStoreNameCandidates("level:course", { platform: "win32" }), ["level%3Acourse"]);
    assert.deepEqual(legacyStoreNameCandidates("level:course", { platform: "linux" }), ["level%3Acourse", "level:course"]);
    const maximum = `a${":".repeat(79)}`;
    assert.deepEqual(legacyStoreNameCandidates(maximum, { platform: "linux", suffixBytes: 23 }), [maximum]);
    assert.equal(decodeStoreName("legacy%5Fscene"), "legacy_scene");
    assert.equal(decodeStoreName("plain-scene"), "plain-scene");
  });

  it("only offers raw legacy paths where that platform can address them safely", () => {
    for (const name of ["level:course", "CON", "nul.txt", "ends."]) {
      assert.equal(isLegacyStoreNamePortable(name, { platform: "win32" }), false, name);
      assert.equal(isLegacyStoreNamePortable(name, { platform: "linux" }), true, name);
    }
    assert.equal(isLegacyStoreNamePortable("ordinary_name", { platform: "win32" }), true);
    for (const name of ["../secrets", "a/b", "a\\b", ".", ".."]) {
      assert.equal(isLegacyStoreNamePortable(name, { platform: "linux" }), false, name);
    }
  });

  it("cannot produce a path separator, device name, dot path, or results separator", () => {
    for (const name of ["../secrets", "..", ".", "a/../../b", "a\\b", "/etc/passwd", "C:evil", "a__b"]) {
      const encoded = encodeStoreName(name);
      assert.ok(!encoded.includes("/"));
      assert.ok(!encoded.includes("\\"));
      assert.ok(!encoded.includes(":"));
      assert.ok(!encoded.startsWith("."));
      assert.ok(!encoded.includes("__"));
      assert.equal(roundTrip(name), name);
    }
  });
});

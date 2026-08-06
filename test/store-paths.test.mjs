import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeStoreName, encodeStoreName } from "../server/store-paths.mjs";

const roundTrip = (name) => decodeStoreName(encodeStoreName(name));

describe("store name encoding", () => {
  it("leaves an ordinary name completely alone", () => {
    // This is the property that makes the change a fix rather than a migration: every scene
    // already on disk keeps its exact path. If this test ever goes red, existing stores
    // silently lose every scene they hold.
    for (const name of ["my-scene", "level1", "a.b.c", "showroom-demo", "great-slide", "v2.1-draft"]) {
      assert.equal(encodeStoreName(name), name, `${name} should be its own filename`);
    }
  });

  it("escapes the colon that opens an NTFS alternate data stream", () => {
    assert.equal(encodeStoreName("level:my-course"), "level%3Amy-course");
    assert.equal(roundTrip("level:my-course"), "level:my-course");
  });

  it("escapes the Windows reserved device names, extension or not", () => {
    // `CON.json` opens the console, not a file, whatever extension follows. Escaping the
    // first character is enough, and the ordinary decoder reverses it with no special case.
    for (const name of ["con", "CON", "nul", "aux", "prn", "com1", "lpt9", "CON.thing", "con.a.b"]) {
      assert.notEqual(encodeStoreName(name).split(".")[0].toLowerCase(), name.split(".")[0].toLowerCase());
      assert.equal(roundTrip(name), name, `${name} should survive the round trip`);
    }
  });

  it("does not mistake a name that merely starts with a reserved word", () => {
    for (const name of ["console", "connection", "auxiliary", "com10", "controller"]) {
      assert.equal(encodeStoreName(name), name, `${name} is not a device name`);
    }
  });

  it("round-trips every character the id pattern allows", () => {
    // The full legal alphabet: `[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}`.
    const name = "aA0.z_9-Q:x";
    assert.equal(roundTrip(name), name);
  });

  it("never emits an underscore, so results-store's `__` separator stays unambiguous", () => {
    for (const name of ["a_b", "under_score_name", "_", "a__b"]) {
      assert.ok(!encodeStoreName(name).includes("_"), `${name} encoded to something with an underscore`);
      assert.equal(roundTrip(name), name);
    }
  });

  it("cannot produce a path segment that escapes its directory", () => {
    for (const name of ["../secrets", "..", ".", "a/../../b", "a\\b", "/etc/passwd", "C:evil"]) {
      const encoded = encodeStoreName(name);
      assert.ok(!encoded.includes("/"), `${name} kept a forward slash`);
      assert.ok(!encoded.includes("\\"), `${name} kept a backslash`);
      assert.ok(!encoded.includes(":"), `${name} kept a colon`);
      assert.ok(!encoded.startsWith("."), `${name} still begins with a dot`);
      assert.equal(roundTrip(name), name);
    }
  });

  it("cannot shadow the results directory the scene store keeps beside its scenes", () => {
    // `.results` lives *inside* the scenes directory (scene-store.mjs explains why), and
    // `store.list()` only ignores it because it does not end in `.json`. A scene that
    // encoded to a leading dot would be one name away from colliding with it.
    assert.ok(!encodeStoreName(".results").startsWith("."));
    assert.equal(roundTrip(".results"), ".results");
  });

  it("decodes a name that was never encoded to itself", () => {
    assert.equal(decodeStoreName("plain-scene"), "plain-scene");
  });
});

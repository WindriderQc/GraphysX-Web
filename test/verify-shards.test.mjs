import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VERIFY_SMOKES, resolveVerifyOptions } from "../scripts/verify-manifest.mjs";
import { planVerifyShards } from "../scripts/verify-shards.mjs";

describe("release shards", () => {
  it("executes the entire real inventory exactly once across every supported shard count", () => {
    for (let count = 1; count <= VERIFY_SMOKES.length; count += 1) {
      const shards = planVerifyShards(VERIFY_SMOKES, count);
      const selected = shards.flatMap((shard) => shard.smokes);
      assert.equal(selected.length, VERIFY_SMOKES.length);
      assert.equal(new Set(selected).size, VERIFY_SMOKES.length);
      assert.deepEqual(new Set(selected), new Set(VERIFY_SMOKES));
      for (const shard of shards) {
        assert.ok(shard.smokes.length > 0);
        assert.deepEqual(shard.smokes, VERIFY_SMOKES.filter((smoke) => shard.smokes.includes(smoke)));
      }
    }
  });

  it("keeps unknown and newly registered checks even when timing data is stale", () => {
    const smokes = [{ name: "known" }, { name: "new" }, { name: "new-long", longDeadline: true }];
    const shards = planVerifyShards(smokes, 2, { known: 20, removed: 99999 });
    assert.deepEqual(shards.map((shard) => shard.estimatedSeconds), [1800, 320]);
    assert.deepEqual(new Set(shards.flatMap((shard) => shard.smokes)), new Set(smokes));
  });

  it("balances measured costs instead of equal numbers of scripts without mutating the inventory", () => {
    const smokes = Object.freeze(["short1", "long", "medium", "short2"].map((name) => Object.freeze({ name })));
    const weights = { long: 100, medium: 60, short1: 20, short2: 20 };
    const plan = planVerifyShards(smokes, 2, weights);
    assert.deepEqual(plan.map((shard) => shard.estimatedSeconds), [100, 100]);
    assert.deepEqual(planVerifyShards(smokes, 2, weights), plan);
  });

  it("selects all twelve CI shards through the actual CLI parser and labels each as partial", () => {
    const options = Array.from({ length: 12 }, (_, index) => resolveVerifyOptions([`--shard=${index + 1}/12`], {}));
    assert.deepEqual(new Set(options.flatMap((option) => option.smokes)), new Set(VERIFY_SMOKES));
    assert.equal(options.reduce((sum, option) => sum + option.smokes.length, 0), VERIFY_SMOKES.length);
    for (const option of options) {
      assert.equal(option.fullRelease, false);
      assert.equal(option.noBuild, false);
    }
    assert.equal(resolveVerifyOptions([], {}).fullRelease, true);
  });

  it("rejects invalid and empty shards before any runner can report a misleading pass", () => {
    for (const value of ["", "1", "0/4", "1/0", "5/4", "1/999", "-1/4", "1.5/4", "01/4", "1/4junk", "1/Infinity"]) {
      assert.throws(() => resolveVerifyOptions([`--shard=${value}`], {}), /--shard/);
    }
    for (const count of [0, -1, 1.5, Infinity, VERIFY_SMOKES.length + 1]) {
      assert.throws(() => planVerifyShards(VERIFY_SMOKES, count), /Shard count/);
    }
  });

  it("refuses scope filters that could omit checks from an otherwise green shard matrix", () => {
    assert.throws(() => resolveVerifyOptions(["--shard=1/4", "--tier=core"], {}), /cannot be combined/);
    assert.throws(() => resolveVerifyOptions(["--shard=1/4", "--base=https://example.com"], {}), /cannot be combined/);
    assert.throws(() => resolveVerifyOptions(["--shard=1/4"], { SMOKE_BASE: "https://example.com" }), /cannot be combined/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VERIFY_SMOKES, resolveVerifyOptions } from "../scripts/verify-manifest.mjs";

describe("GPU receptions", () => {
  it("names exactly the live Ballsy relay journeys that software WebGL cannot keep faithful", () => {
    const names = VERIFY_SMOKES.filter((smoke) => smoke.gpuReception).map((smoke) => smoke.name).sort();
    assert.deepEqual(names, ["ballsy-contact-visual", "ballsy-giant", "ballsy-shared-vr"]);
  });

  it("stays selected but runs only on explicit request", () => {
    const plain = resolveVerifyOptions(["--checks=ballsy-giant"], {});
    assert.equal(plain.gpuReceptions, false);
    assert.deepEqual(plain.smokes.map((smoke) => smoke.name), ["ballsy-giant"]);
    assert.equal(resolveVerifyOptions(["--gpu-receptions", "--checks=ballsy-giant"], {}).gpuReceptions, true);
    assert.equal(resolveVerifyOptions([], {}).fullRelease, true);
  });
});

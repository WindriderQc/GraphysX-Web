import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeKidxGeometry } from "../scripts/kidx-mesh-geometry.mjs";

test("CAD cleanup removes collapsed faces and repairs zero normals without smoothing authored edges", () => {
  const result = serializeKidxGeometry({ attributes: {
    position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, .000001] },
    normal: { array: [0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0] },
  }, index: { array: [0, 1, 2, 0, 3, 1] } });
  assert.deepEqual(result.indices, [0, 1, 2]);
  assert.deepEqual(result.normals.slice(0, 9), [0, 0, 1, 0, 0, 1, 0, 0, 1]);
});

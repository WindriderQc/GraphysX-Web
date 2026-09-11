import { test } from "node:test";
import assert from "node:assert/strict";
import { KIDX_DOCUMENTS, KIDX_PROGRESS_KEY, findKidxDocuments, readKidxProgress } from "../src/kidx-library.ts";

test("KidX finds a model across kit families and keeps programs separate from builds", () => {
  assert.equal(findKidxDocuments("TRACK3R", "31313", "build")[0]?.filename, "31313_X_TRACK3R.pdf");
  assert.deepEqual(findKidxDocuments("TRACK3R", "Education Core", "build"), []);
  assert.equal(findKidxDocuments("Tank", "Education Expansion", "program").length, 1);
  assert.ok(findKidxDocuments("electronique", "", "reference").length > 0);
  assert.deepEqual(findKidxDocuments("no-such-robot", "", ""), []);
});

test("reading progress rejects corrupted, unknown and out-of-range pages without modifying storage", () => {
  const manual = KIDX_DOCUMENTS.find((item) => item.title === "TRACK3R");
  const read = (value) => readKidxProgress({ getItem(key) { assert.equal(key, KIDX_PROGRESS_KEY); return value; } });
  assert.deepEqual(read(JSON.stringify({ [manual.id]: 20, missing: 1 })), { [manual.id]: 20 });
  for (const page of [-1, 0, .5, manual.pages + 1, "20", null]) assert.deepEqual(read(JSON.stringify({ [manual.id]: page })), {});
  for (const value of ["broken", "null", "[]", "42"]) assert.deepEqual(read(value), {});
  assert.deepEqual(readKidxProgress({ getItem() { throw new Error("Storage blocked"); } }), {});
});

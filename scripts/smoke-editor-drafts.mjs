import assert from "node:assert/strict";
import { applySmokeTimeout, launchSmokeBrowser, useLightRender } from "./smoke-harness.mjs";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const entry = new URL("?host=editor", BASE).href;
const browser = await launchSmokeBrowser();
try {
  const page = await browser.newPage();
  applySmokeTimeout(page);
  await useLightRender(page);
  const toolbar = page.locator(".gx-ed-toolbar");
  const save = async (name) => {
    page.once("dialog", (dialog) => dialog.accept(name));
    await toolbar.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForFunction((slot) => localStorage.getItem("graphysx.agent-world.v2." + slot) !== null, name);
  };
  const findDraft = async (id) => {
    const handle = await page.waitForFunction((entityId) => Object.keys(localStorage).find((key) =>
      key.startsWith("graphysx.editor.draft.") &&
      JSON.parse(localStorage.getItem(key))?.definition?.entities.some((entity) => entity.id === entityId)), id);
    return handle.jsonValue();
  };
  const hasEntity = (id) => page.evaluate((entityId) => window.__GRAPHYSX__.query({ ids: [entityId] }).length === 1, id);

  await page.goto(entry, { waitUntil: "domcontentloaded" });
  await toolbar.waitFor();
  await save("draft-original");
  await toolbar.getByRole("button", { name: "+ Box", exact: true }).click();
  const firstId = "edit-box-1";
  assert.equal(await hasEntity(firstId), true);
  const firstKey = await findDraft(firstId);
  await toolbar.getByRole("combobox", { name: "Open a named local scene slot" }).selectOption("draft-original");
  assert.equal(await hasEntity(firstId), false, "opening the slot restores its saved copy");
  assert.equal(await page.evaluate((key) => localStorage.getItem(key) !== null, firstKey), true, "the previous draft survives switching");

  assert.equal(await page.evaluate(() => window.__GRAPHYSX__.spawn({ id: "second-draft-object", type: "box" }).ok), true);
  const secondKey = await findDraft("second-draft-object");
  assert.notEqual(firstKey, secondKey, "working copies of the same scene can have different drafts");
  await page.evaluate(() => localStorage.setItem("graphysx.editor.draft.v1", JSON.stringify({
    savedAt: new Date("2025-01-01T12:00:00Z").toISOString(),
    definition: {
      schema: "graphysx.agent-world/v2", id: "legacy-draft", label: "Legacy draft",
      entities: [{ id: "legacy-object", type: "box" }],
    },
  })));

  await page.reload({ waitUntil: "domcontentloaded" });
  const drafts = toolbar.getByRole("combobox", { name: "Draft to recover" });
  const recover = toolbar.getByRole("button", { name: "Recover draft", exact: true });
  await drafts.selectOption(firstKey);
  await recover.click();
  assert.equal(await hasEntity(firstId), true);
  assert.equal(await hasEntity("second-draft-object"), false);
  await save("draft-recovered");
  assert.deepEqual(await page.evaluate(({ first, second }) => ({
    first: localStorage.getItem(first) !== null,
    second: localStorage.getItem(second) !== null,
    legacy: localStorage.getItem("graphysx.editor.draft.v1") !== null,
  }), { first: firstKey, second: secondKey }), { first: false, second: true, legacy: true });

  await drafts.selectOption("graphysx.editor.draft.v1");
  await recover.click();
  assert.equal(await hasEntity("legacy-object"), true);
  console.log("PASS editor drafts: independent working copies survive loading and reload; saving retires only the recovered draft; v1 remains readable.");
} finally {
  await browser.close();
}

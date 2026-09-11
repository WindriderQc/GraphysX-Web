import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";
import { EV3_PROGRAM_STORAGE_KEY } from "../src/ev3-first-program.ts";

const ART = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(ART, { recursive: true });
let server;
let browser;
const errors = [];
try {
  if (!process.env.SMOKE_BASE) server = await startStaticServer({ root: path.resolve("dist"), port: Number(process.env.SMOKE_PORT || 4572) });
  const base = process.env.SMOKE_BASE ?? server.url;
  browser = await launchSmokeBrowser();
  // Run the storage/replay journey at a compact landscape size to avoid paying for a
  // desktop WebGL frame on every DOM action. The companion program-layout smoke
  // retains the four-viewport hit-target, keyboard and screenshot checks.
  const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
  applySmokeTimeout(page);
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(String(error)));
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
  const rawStore = () => page.evaluate((key) => localStorage.getItem(key), EV3_PROGRAM_STORAGE_KEY);
  const enter = async () => {
    await page.goto(`${base.replace(/\/$/, "")}/?app=ev3-lab`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-ev3-programs]").waitFor();
    await page.evaluate(() => window.advanceTime(0));
  };
  const add = async (...blocks) => { for (const id of blocks) await page.locator(`[data-ev3-block='${id}']`).click(); };
  const programs = () => page.locator("[data-ev3-programs]").click();
  const close = () => page.locator("[data-program-close]").click();
  const name = page.getByLabel("Program name", { exact: true });
  const save = page.locator("[data-program-save]");
  const message = page.locator("[data-program-message]");
  const run = async (ms) => {
    await page.locator("[data-ev3-run]").click();
    assert.equal(await page.locator("[data-ev3-programs]").isDisabled(), true);
    return page.evaluate((time) => window.advanceTime(time), ms);
  };
  await enter();
  await programs();
  await name.fill("Empty");
  assert.equal(await save.isDisabled(), true);
  await close();
  await add("left", "forward");
  await programs();
  await name.fill("Left turn");
  await save.click();
  assert.match(await message.innerText(), /Saved “Left turn”/);
  assert.equal((await state()).program.library.unsavedChanges, false);
  await close();
  const first = await run(1700);
  assert.ok(first.rover.position[0] < -0.5);
  await enter();
  assert.deepEqual((await state()).program.blocks, []);
  await programs();
  await page.getByRole("button", { name: "Open Left turn", exact: true }).click();
  assert.deepEqual((await state()).program.blocks, ["left", "forward"]);
  assert.equal((await state()).program.running, false);
  const second = await run(1700);
  assert.ok(Math.max(...first.rover.position.map((v, i) => Math.abs(v - second.rover.position[i]))) < 0.03);
  console.log("  ok  saved turn program survives reload and repeats the same physical route");

  await page.locator("[data-ev3-undo]").click();
  await programs();
  await page.getByRole("button", { name: "Open Left turn", exact: true }).click();
  assert.equal(await page.locator("[data-program-confirm]").isVisible(), true);
  await page.locator("[data-program-open-cancel]").click();
  assert.deepEqual((await state()).program.blocks, ["left"]);
  await save.click();
  assert.deepEqual(JSON.parse(await rawStore()).programs[0].blocks, ["left"]);
  await name.fill("<b>Turn</b>");
  assert.equal(await save.innerText(), "Save a copy");
  await save.click();
  assert.equal(JSON.parse(await rawStore()).programs.length, 2);
  assert.equal(await page.locator("[data-program-list] b").count(), 0);
  const deleteCopy = page.getByRole("button", { name: "Delete <b>Turn</b>", exact: true });
  await deleteCopy.click();
  await name.focus();
  assert.equal(JSON.parse(await rawStore()).programs.length, 2);
  await deleteCopy.click();
  await page.getByRole("button", { name: "Confirm delete <b>Turn</b>", exact: true }).click();
  assert.equal(JSON.parse(await rawStore()).programs.length, 1);
  assert.equal((await state()).program.library.savedName, null);
  assert.deepEqual((await state()).program.blocks, ["left"]);
  await close();
  await add("right");
  await programs();
  await page.getByRole("button", { name: "Open Left turn", exact: true }).click();
  await page.locator("[data-program-open-confirm]").click();
  assert.deepEqual((await state()).program.blocks, ["left"]);
  console.log("  ok  explicit update, copy, safe text, cancelled deletion and unsaved-block protection");

  await page.locator("[data-ev3-undo]").click();
  await add("forward", "forward", "forward");
  const success = await run(3000);
  assert.equal(success.mission.phase, "complete");
  assert.equal(await page.locator("[data-ev3-programs]").isEnabled(), true);
  await programs();
  await name.fill("Blue target");
  await save.click();
  assert.match(await message.innerText(), /Saved “Blue target”/);
  await name.fill("LEFT TURN");
  const beforeFailure = await rawStore();
  await save.click();
  assert.match(await message.innerText(), /already saved/);
  assert.equal(await rawStore(), beforeFailure);
  await name.fill("Blocked write");
  await page.evaluate((key) => {
    window.__restoreProgramStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, value) {
      if (k === key) throw new DOMException("Quota exceeded", "QuotaExceededError");
      return window.__restoreProgramStorage.call(this, k, value);
    };
  }, EV3_PROGRAM_STORAGE_KEY);
  try {
    await save.click();
    assert.match(await message.innerText(), /Could not save/);
    assert.equal(await rawStore(), beforeFailure);
    assert.equal((await state()).program.library.savedName, "Blue target");
    assert.deepEqual((await state()).program.blocks, ["forward", "forward", "forward"]);
  } finally {
    await page.evaluate(() => { Storage.prototype.setItem = window.__restoreProgramStorage; delete window.__restoreProgramStorage; });
  }
  console.log("  ok  winning programs can be saved; duplicate names and failed writes keep durable data");

  await name.fill("My very long program name for First Drive");
  await save.click();
  await close();


  const valid = await rawStore();
  const corrupt = '{"schema":"future-version","programs":[]}';
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: EV3_PROGRAM_STORAGE_KEY, raw: corrupt });
  await enter();
  await add("forward");
  await programs();
  assert.match(await message.innerText(), /stored data has been left untouched/);
  await name.fill("New program");
  await save.click();
  assert.match(await message.innerText(), /stored data has been left untouched/);
  assert.equal(await rawStore(), corrupt);
  assert.deepEqual((await state()).program.blocks, ["forward"]);
  await page.screenshot({ path: path.join(ART, "ev3-program-storage-unavailable.png") });
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: EV3_PROGRAM_STORAGE_KEY, raw: valid });
  assert.deepEqual(errors, []);
  console.log("  ok  invalid stored data stays untouched and current blocks remain usable; no browser errors");
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}
console.log("KidX saved programs smoke passed.");

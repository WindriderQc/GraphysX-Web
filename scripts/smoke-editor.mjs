import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Covers the human editing surface end to end: the curated library is reachable, a
// recovered mesh asset spawns, an archive texture applies, a behaviour attaches, and the
// editor is a place you can leave. Each of these was a real regression at some point.

const EXE = process.env.SMOKE_CHROMIUM || undefined;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const out = {};
try {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => !!window.__GRAPHYSX_HOST__, { timeout: 20000 });
  await page.waitForSelector(".gx-welcome", { timeout: 15000 });
  await page.click(".gx-welcome button");
  await page.waitForSelector(".gx-ed-toolbar", { timeout: 15000 });

  out.prefabCount = await page.$$eval(".gx-ed-chip", (els) => els.length);
  out.hasExitButton = await page.$$eval(".gx-ed-toolbar button", (els) =>
    els.some((e) => (e.textContent ?? "").includes("Showroom")));

  // Spawn a recovered mesh asset from the Models section.
  const before = await page.evaluate(() => window.__GRAPHYSX__.state().entities.length);
  await page.click('.gx-ed-chip:text-is("Zok Sword")');
  await page.waitForTimeout(700);
  const findSpawned = () => page.evaluate(() =>
    window.__GRAPHYSX__.state().entities.find((e) => e.id.startsWith("edit-model-")) ?? null);
  const spawned = await findSpawned();
  out.modelSpawned = (await page.evaluate(() => window.__GRAPHYSX__.state().entities.length)) > before;
  out.spawnedType = spawned?.type ?? null;

  // Apply an archive texture, then attach a living behaviour.
  await page.click('.gx-ed-chip:text-is("Checker")');
  await page.waitForTimeout(400);
  out.textureApplied = (await findSpawned())?.material?.texture?.id ?? null;

  await page.click('.gx-ed-chip:text-is("+ Spin")');
  await page.waitForTimeout(300);
  const withBehaviour = await findSpawned();
  out.behaviourCount = Array.isArray(withBehaviour?.behaviors) ? withBehaviour.behaviors.length : 0;

  await page.screenshot({ path: path.join(ART, "editor-library.png"), fullPage: false });

  // The editor must not be a one-way door.
  await page.click('.gx-ed-toolbar button:has-text("Showroom")');
  await page.waitForTimeout(600);
  out.welcomeBack = (await page.$(".gx-welcome")) !== null;
  out.editorHiddenAgain = await page.evaluate(() => {
    const t = document.querySelector(".gx-ed-toolbar");
    return !t || getComputedStyle(t).display === "none";
  });
  await page.screenshot({ path: path.join(ART, "editor-exit.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  out.prefabCount > 15 &&
  out.hasExitButton &&
  out.modelSpawned &&
  out.spawnedType === "model" &&
  out.textureApplied === "checker" &&
  out.behaviourCount === 1 &&
  out.welcomeBack &&
  out.editorHiddenAgain;
process.exit(out.fatal || pageErrors.length || !ok ? 1 : 0);

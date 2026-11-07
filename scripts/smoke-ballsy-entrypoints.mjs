import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { launchSmokeBrowser, applySmokeTimeout } from "./smoke-harness.mjs";
import { startBallsyServer } from "./serve-ballsy.mjs";

// Real user navigation from the product front door, not direct app URL acceptance.
const root = path.resolve(process.env.SMOKE_DIST_ROOT || "dist");
const directory = path.resolve(process.env.SMOKE_ARTIFACTS || "output/ballsy-entrypoints");
mkdirSync(directory, { recursive: true });
const app = process.env.SMOKE_BASE ? null : await startBallsyServer({ port: 0, root });
const base = process.env.SMOKE_BASE || app.url;
const homeUrl = new URL(base), ballsyUrl = new URL("ballsy.html", homeUrl);
const browser = await launchSmokeBrowser();
const page = applySmokeTimeout(await browser.newPage({ viewport: { width: 1280, height: 800 } }));
const report = { root: app ? root : null, base, remote: !app, startedAt: new Date().toISOString(), errors: [], checks: [], captures: [], navigations: [] };
page.on("pageerror", error => report.errors.push({ kind: "pageerror", url: page.url(), message: String(error), stack: error.stack }));
page.on("console", message => { if (message.type() === "error") report.errors.push({ kind: "console", url: page.url(), message: message.text(), location: message.location() }); });
const check = (name, condition) => { report.checks.push({ name, passed: Boolean(condition) }); assert.ok(condition, name); console.log(`PASS ${name}`); };
const capture = async name => { await page.screenshot({ path: path.join(directory, `${name}.png`) }); report.captures.push(`${name}.png`); report.navigations.push({ label: name, url: page.url() }); };
try {
  // No synthetic supported-headset claim. The dedicated VR smoke covers synthetic XR.
  await page.addInitScript(() => Object.defineProperty(navigator, "xr", { value: undefined, configurable: true }));
  await page.goto(base, { waitUntil: "load" });
  await page.waitForSelector(".gx-go-games", { state: "visible" });
  await page.locator(".gx-go-games").click();
  const row = page.locator('[data-course-id="ballsy-slime"]');
  await row.waitFor({ state: "visible" });
  check("Games shelf exposes one permanent Ballsy row", await row.count() === 1 && /Ballsy/.test(await row.textContent()));
  await page.waitForFunction(() => [...document.querySelectorAll("img.gx-shelf-thumb")].filter(image => {
    const box = image.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.top < innerHeight && box.bottom > 0;
  }).every(image => image.complete));
  report.thumbnails = await page.locator("img.gx-shelf-thumb").evaluateAll(images => images.filter(image => {
    const box = image.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.top < innerHeight && box.bottom > 0;
  }).map(image => ({ src: image.currentSrc, loaded: image.naturalWidth > 0 })));
  check("Visible Games thumbnails load from the current build", report.thumbnails.every(image => image.loaded));
  await capture("games-ballsy-row");
  // Dismissing the shelf must preserve an actionable front door before real launch.
  await page.locator(".gx-shelf-close").click();
  check("Closing Games restores the front door", await page.locator(".gx-go-games").isVisible());
  await page.locator(".gx-go-games").click();
  await page.locator('[data-course-id="ballsy-slime"]').click();
  await page.waitForFunction(() => Boolean(window.__BALLSY__));
  check("Clicking the public Ballsy row opens the actual race lobby", new URL(page.url()).pathname === ballsyUrl.pathname && new URL(page.url()).origin === homeUrl.origin && await page.evaluate(() => window.__BALLSY__.state().phase === "lobby"));
  await capture("ballsy-public-lobby");
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => window.__BALLSY__.state().phase === "racing");
  check("Race launched from Games is playable", await page.locator('[data-action="pause"]').isVisible());
  await capture("ballsy-public-racing");
  await page.locator('.ballsy-header a').click();
  await page.waitForSelector(".gx-center-apps summary", { state: "visible" });
  await page.locator(".gx-center-apps summary").click();
  check("Ateliers exposes the permanent VR entry", await page.locator(".gx-go-vr").isVisible());
  await capture("workshops-vr-entry");
  await page.keyboard.press("Escape");
  check("Escape dismisses workshops without navigating", await page.locator(".gx-go-vr").isHidden() && new URL(page.url()).pathname === homeUrl.pathname);
  await page.locator(".gx-center-apps summary").click();
  await page.locator(".gx-go-vr").click();
  await page.waitForFunction(() => Boolean(window.__GRAPHYSX_VR__));
  check("Atelier VR public entry boots the real workshop", new URL(page.url()).searchParams.get("app") === "vr-lab" && new URL(page.url()).origin === homeUrl.origin);
  check("A desktop without WebXR gets the honest disabled VR control", await page.locator(".gx-vr-enter").isDisabled());
  await page.locator(".gx-vr-preview").click();
  check("Desktop workshop preview button works", await page.evaluate(() => window.__GRAPHYSX_VR__.presses === 1));
  await page.locator(".gx-vr-reset").click();
  await capture("vr-public-workshop");
  await page.locator(".gx-vr-top a").click();
  await page.waitForSelector(".gx-go-games", { state: "visible" });
  check("Workshop return restores the product front door", new URL(page.url()).search === "" && new URL(page.url()).pathname === homeUrl.pathname);
  report.finalUrl = page.url();
  check("Public journeys produced no console or page errors", report.errors.length === 0);
  report.ok = true;
} catch (error) {
  report.ok = false; report.failure = String(error); report.url = page.url();
  await capture("failure").catch(() => {}); throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(path.join(directory, "entrypoints-report.json"), JSON.stringify(report, null, 2));
  await browser.close(); await app?.close();
}

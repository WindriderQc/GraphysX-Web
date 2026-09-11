import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

const artifacts = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(artifacts, { recursive: true });
const server = process.env.SMOKE_BASE ? null : await startStaticServer({ root: path.resolve("dist"), port: 4591 });
const base = process.env.SMOKE_BASE || server.url;
const browser = await launchSmokeBrowser();
try {
  // Faults are isolated from the normal showroom smoke, where every console error is fatal.
  for (const fault of ["webgl", "chunk", "application"]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    applySmokeTimeout(page);
    const unhandled = [];
    page.on("pageerror", (error) => unhandled.push(String(error)));
    if (fault === "webgl") {
      await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          if (String(type).startsWith("webgl")) return null;
          return getContext.call(this, type, ...args);
        };
      });
    } else {
      const chunk = fault === "application" ? /\/assets\/kidx-app-[^/]+\.js$/ : /\/assets\/platform-host-[^/]+\.js$/;
      await page.route(chunk, (route) => route.abort("failed"));
    }
    await page.goto(fault === "application" ? `${base}?app=ev3-lab` : base, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "The 3D scene could not start" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Try again" }).isVisible(), true);
    assert.equal(await page.locator('[role="alert"]').evaluate((panel) => panel === document.activeElement), true);
    assert.deepEqual(unhandled, [], `${fault} must be handled, not an unhandled startup rejection`);
    await page.screenshot({ path: path.join(artifacts, `startup-${fault}-390x844.png`) });
    if (fault !== "webgl") {
      await page.unrouteAll();
      await page.getByRole("button", { name: "Try again" }).click();
      await page.waitForFunction(() => Boolean(window.__GRAPHYSX__));
      if (fault === "application") await page.locator(".gx-ev3").waitFor();
      assert.equal(await page.locator('[role="alert"]').count(), 0);
      assert.deepEqual(unhandled, []);
    }
    await page.close();
    console.log(`ok: ${fault} failure has an accessible recovery page${fault !== "webgl" ? " and retry recovers" : ""}`);
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  applySmokeTimeout(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const launch = page.getByRole("button", { name: "KidX · First Drive" });
  await launch.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifacts, "kidx-launcher-390x844.png") });
  await launch.click();
  await page.locator(".gx-ev3").waitFor();
  await page.waitForTimeout(1_100);
  await page.screenshot({ path: path.join(artifacts, "kidx-ready-390x844.png") });
  await page.getByRole("button", { name: "← Atelier", exact: true }).click();
  await page.getByRole("button", { name: "Quitter le lab", exact: true }).click();
  await page.getByRole("button", { name: "KidX · First Drive" }).waitFor();
  assert.deepEqual(errors, [], "the welcome → KidX → welcome journey must have no browser errors");
  await page.close();
  console.log("ok: KidX is reachable from the welcome card and returns to it");
} finally {
  await browser.close();
  if (server) await server.close();
}

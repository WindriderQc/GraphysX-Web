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
  for (const fault of ["webgl", "chunk"]) {
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
      await page.route(/\/assets\/platform-host-[^/]+\.js$/, (route) => route.abort("failed"));
    }
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "The 3D scene could not start" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Try again" }).isVisible(), true);
    assert.equal(await page.locator('[role="alert"]').evaluate((panel) => panel === document.activeElement), true);
    assert.deepEqual(unhandled, [], `${fault} must be handled, not an unhandled startup rejection`);
    await page.screenshot({ path: path.join(artifacts, `startup-${fault}-390x844.png`) });
    if (fault === "chunk") {
      await page.unrouteAll();
      await page.getByRole("button", { name: "Try again" }).click();
      await page.waitForFunction(() => Boolean(window.__GRAPHYSX__));
      assert.equal(await page.locator('[role="alert"]').count(), 0);
      assert.deepEqual(unhandled, []);
    }
    await page.close();
    console.log(`ok: ${fault} failure has an accessible recovery page${fault === "chunk" ? " and retry recovers" : ""}`);
  }
} finally {
  await browser.close();
  if (server) await server.close();
}

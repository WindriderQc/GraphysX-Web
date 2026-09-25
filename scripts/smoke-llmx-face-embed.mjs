import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

// The built <llmx-face> module exactly as a host page loads it: one file, no app shell.
const artifacts = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(artifacts, { recursive: true });
const server = process.env.SMOKE_BASE ? null : await startStaticServer({ root: path.resolve("dist"), port: 0 });
const base = (process.env.SMOKE_BASE || server.url).replace(/\/$/, "");
const host = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0b1016">
<div style="width:420px;height:320px"><llmx-face id="face" style="width:100%;height:100%"></llmx-face></div>
<script type="module">
  window.faceReady = new Promise(resolve => document.getElementById("face").addEventListener("llmx-face-ready", resolve, { once: true }));
  import("/embed/llmx-face.js").then(() => { window.faceLoaded = true; });
</script>`;
const browser = await launchSmokeBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 }, reducedMotion: "reduce" });
  applySmokeTimeout(page);
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const requests = [];
  page.on("request", request => requests.push(new URL(request.url()).pathname));
  await page.route(`${base}/__embed-host.html`, route => route.fulfill({ contentType: "text/html", body: host }));
  await page.goto(`${base}/__embed-host.html`);
  await page.waitForFunction(() => window.faceLoaded === true);
  await page.evaluate(() => window.faceReady);
  assert.deepEqual(requests.filter(url => url !== "/__embed-host.html"), ["/embed/llmx-face.js"], "the embed is one self-contained file");

  // Pixels, read in the frame the element renders: the mask is actually drawn, not a blank canvas.
  const sampleLit = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
    const source = document.getElementById("face").shadowRoot.querySelector("canvas");
    const probe = document.createElement("canvas");
    probe.width = 84; probe.height = 64;
    const context = probe.getContext("2d");
    context.drawImage(source, 0, 0, probe.width, probe.height);
    const data = context.getImageData(0, 0, probe.width, probe.height).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) if (data[index + 3] > 0 && data[index] + data[index + 1] + data[index + 2] > 60) lit += 1;
    resolve(lit / (probe.width * probe.height));
  })));
  const idle = await sampleLit();
  assert.ok(idle > 0.08 && idle < 0.7, `the mask fills part of the dock (${idle.toFixed(3)})`);

  const presence = await page.evaluate(() => {
    const face = document.getElementById("face");
    face.presence = { phase: "speaking", level: 0.06, brightness: 0.1, toolPulses: 1, bogus: true };
    face.presence = { tokenRate: 12 };
    return face.presence;
  });
  assert.deepEqual(presence, { phase: "speaking", level: 0.06, brightness: 0.1, tokenRate: 12, toolPulses: 1 });
  await page.waitForTimeout(400);
  await page.locator("#face").screenshot({ path: path.join(artifacts, "llmx-face-embed-speaking.png") });

  await page.evaluate(() => { document.getElementById("face").presence = { phase: "sleeping" }; });
  await page.waitForTimeout(600);
  await page.locator("#face").screenshot({ path: path.join(artifacts, "llmx-face-embed-sleeping.png") });

  // Removal releases the renderer; a host may mount and unmount the dock freely.
  const released = await page.evaluate(() => { const face = document.getElementById("face"); face.remove(); return face.renderer === null; });
  assert.equal(released, true);
  assert.deepEqual(errors, []);
  console.log(`llmx face embed smoke passed (mask coverage ${idle.toFixed(3)})`);
} finally {
  await browser.close();
  await server?.close();
}

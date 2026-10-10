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

  const interrupted = await page.evaluate(() => {
    const face = document.getElementById("face");
    const wasSpeaking = face.face.describe().speaking;
    face.presence = { phase: "interrupted", level: 0 };
    return { wasSpeaking, stillSpeaking: face.face.describe().speaking };
  });
  assert.deepEqual(interrupted, { wasSpeaking: true, stillSpeaking: false }, "an interruption releases the mouth before another frame");

  await page.evaluate(() => { document.getElementById("face").presence = { phase: "sleeping" }; });
  await page.waitForTimeout(600);
  await page.locator("#face").screenshot({ path: path.join(artifacts, "llmx-face-embed-sleeping.png") });

  const cyan = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
    const canvas = document.getElementById("face").shadowRoot.querySelector("canvas");
    const probe = document.createElement("canvas");
    probe.width = 420; probe.height = 320;
    const context = probe.getContext("2d");
    context.drawImage(canvas, 0, 0, probe.width, probe.height);
    const { data } = context.getImageData(0, 0, probe.width, probe.height);
    let pixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 1] > 80 && data[index + 2] > 80 && data[index + 1] > data[index] * 1.4) pixels += 1;
    }
    resolve(pixels);
  })));
  assert.ok(cyan > 20, `the waiting face keeps visible cyan eyes (${cyan} pixels)`);

  // A math picture beside the mask: applied with a receipt, out-of-bounds refused whole.
  const receipts = await page.evaluate(() => {
    const face = document.getElementById("face");
    const seen = [];
    face.addEventListener("llmx-scene-applied", event => seen.push(["applied", event.detail.cubes]));
    face.addEventListener("llmx-scene-rejected", event => seen.push(["rejected", event.detail.reason]));
    face.presence = { phase: "idle", level: 0 };
    face.scene = { kind: "add", a: 15, b: 9 };
    face.scene = { schema: "agentx.math-scene.v1", kind: "add", a: 8, b: 5 };
    return { seen, scene: face.scene };
  });
  assert.deepEqual(receipts.seen, [["rejected", "out-of-bounds"], ["applied", 13]]);
  assert.deepEqual(receipts.scene, { kind: "add", a: 8, b: 5 });
  await page.waitForTimeout(4500);
  await page.locator("#face").screenshot({ path: path.join(artifacts, "llmx-face-embed-math.png") });
  const cleared = await page.evaluate(() => { const face = document.getElementById("face"); face.scene = null; return face.scene; });
  assert.equal(cleared, null);

  // Removal releases the renderer; a host may mount and unmount the dock freely.
  const released = await page.evaluate(() => { const face = document.getElementById("face"); face.remove(); return face.renderer === null; });
  assert.equal(released, true);

  // The same file defines <llmx-stage>: the picture alone, for a host's own pictures zone.
  const stage = await page.evaluate(() => new Promise(resolve => {
    const element = document.createElement("llmx-stage");
    element.id = "stage";
    element.style.cssText = "display:block;width:320px;height:240px";
    const seen = [];
    element.addEventListener("llmx-scene-applied", event => seen.push(["applied", event.detail.cubes]));
    element.addEventListener("llmx-scene-rejected", event => seen.push(["rejected", event.detail.reason]));
    element.addEventListener("llmx-scene-complete", () => seen.push(["complete"]));
    element.scene = { schema: "agentx.math-scene.v1", kind: "count", to: 12 };
    document.body.append(element);
    element.addEventListener("llmx-stage-ready", () => {
      element.scene = { kind: "count", to: 101 };
      requestAnimationFrame(() => requestAnimationFrame(() => resolve({ seen, scene: element.scene })));
    }, { once: true });
  }));
  assert.deepEqual(stage.seen.filter(([kind]) => kind !== "complete"), [["applied", 12], ["rejected", "out-of-bounds"]]);
  assert.deepEqual(stage.scene, { kind: "count", to: 12 }, "a refused picture leaves the current one");
  const stageLit = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
    const source = document.getElementById("stage").shadowRoot.querySelector("canvas");
    const probe = document.createElement("canvas");
    probe.width = 80; probe.height = 60;
    const context = probe.getContext("2d");
    context.drawImage(source, 0, 0, probe.width, probe.height);
    const data = context.getImageData(0, 0, probe.width, probe.height).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) if (data[index + 3] > 0 && data[index] + data[index + 1] + data[index + 2] > 60) lit += 1;
    resolve(lit / (probe.width * probe.height));
  })));
  assert.ok(stageLit > 0.02 && stageLit < 0.8, `the stage draws the cubes (${stageLit.toFixed(3)})`);
  await page.locator("#stage").screenshot({ path: path.join(artifacts, "llmx-stage-embed-count.png") });
  const stageReleased = await page.evaluate(() => { const element = document.getElementById("stage"); element.remove(); return element.renderer === null; });
  assert.equal(stageReleased, true);
  assert.deepEqual(errors, []);
  console.log(`llmx face embed smoke passed (mask coverage ${idle.toFixed(3)}, stage coverage ${stageLit.toFixed(3)})`);
} finally {
  await browser.close();
  await server?.close();
}

import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

// The Math Lab page as a visitor meets it (docs/MATH_LAB_PAGE.md): the Browse shelf row opens
// it (the retired Math Game row is gone), a typed block is drawn by <llmx-stage> with live sliders, an invalid block is refused whole
// while the last picture stays, the starter examples draw v2, v3 and v4 scenes, the block survives
// a reload through the address, and the page fits a phone. No model and no outside request.

const BASE = (process.env.SMOKE_BASE || "http://127.0.0.1:4173/").replace(/\/?$/, "/");
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });
const origin = new URL(BASE).origin;

const errors = [];
const outside = [];
const browser = await launchSmokeBrowser();
const watch = (page) => {
  applySmokeTimeout(page);
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["data:", "blob:"].includes(url.protocol) && url.origin !== origin) outside.push(request.url());
  });
};
const state = (page) => page.evaluate(() => {
  const main = document.querySelector("main.ml");
  const stage = document.getElementById("ml-stage");
  return {
    state: main.dataset.state, schema: main.dataset.schema ?? null, stale: main.classList.contains("ml-stale"),
    say: document.getElementById("ml-status-say").textContent, detail: document.getElementById("ml-status-detail").textContent,
    about: document.getElementById("ml-about").textContent, scene: stage.scene, parameters: stage.parameters,
    legend: [...document.querySelectorAll(".ml-legend-formula")].map((row) => row.textContent),
    sliders: [...document.querySelectorAll(".ml-slider input")].map((input) => input.dataset.name),
    readouts: [...document.querySelectorAll(".ml-readout")].map((row) => row.textContent),
  };
});
const drawn = (page, schema) => page.waitForFunction((wanted) => {
  const main = document.querySelector("main.ml");
  return main?.dataset.state === "drawn" && main.dataset.schema === wanted;
}, schema, { timeout: SMOKE_TIMEOUT });
// Share of the stage's pixels clearly brighter than its night background: something is drawn.
const lit = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
  const source = document.getElementById("ml-stage").shadowRoot.querySelector("canvas");
  const probe = document.createElement("canvas");
  probe.width = 160; probe.height = 120;
  const context = probe.getContext("2d");
  context.drawImage(source, 0, 0, probe.width, probe.height);
  const data = context.getImageData(0, 0, probe.width, probe.height).data;
  let bright = 0;
  for (let index = 0; index < data.length; index += 4) if (data[index] + data[index + 1] + data[index + 2] > 240) bright += 1;
  resolve(bright / (probe.width * probe.height));
})));
const type = async (page, text) => {
  await page.fill("#ml-body", text);
  // The page reads the block after a short quiet moment; wait for that read, not a fixed time.
  await page.waitForFunction((wanted) => decodeURIComponent(location.hash.replace(/^#bloc=/, "")) === wanted
    || document.getElementById("ml-status").dataset.kind === "refused", text, { timeout: SMOKE_TIMEOUT });
};

const out = {};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  watch(page);

  // ---- the Browse shelf row opens the page ----
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".gx-welcome .gx-go-browse");
  await page.click(".gx-welcome .gx-go-browse");
  const row = '.gx-browse-row[data-scene-id="math-lab"]';
  await page.waitForSelector(row);
  assert.equal(await page.$('.gx-browse-row[data-scene-id="archive-math-lab"]'), null, "one Math Lab: the old Math Game row is gone");
  out.row = await page.$eval(row, (element) => element.querySelector(".gx-browse-name")?.textContent);
  await Promise.all([page.waitForURL(/\/math-lab\.html/), page.click(row)]);

  // ---- the opening example: a line, v2, drawn ----
  await drawn(page, "agentx.math-scene.v2");
  const line = await state(page);
  assert.equal(line.scene.kind, "functions");
  assert.equal(line.scene.functions[0].expression, "m * x + b");
  assert.deepEqual(line.sliders, ["m", "b"]);
  out.lineLit = await lit(page);
  assert.ok(out.lineLit > 0.004, `the line is drawn on the stage (${out.lineLit.toFixed(4)} bright)`);
  await page.screenshot({ path: path.join(ART, "math-lab-line.png") });

  // ---- a slider moves the picture without rebuilding it ----
  const applied = page.evaluate(() => new Promise((resolve) => document.getElementById("ml-stage")
    .addEventListener("llmx-parameters-applied", (event) => resolve(event.detail.scene.parameters), { once: true })));
  await page.$eval('.ml-slider input[data-name="m"]', (input) => {
    input.value = "-2";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const moved = await applied;
  assert.equal(moved.find((row) => row.name === "m").value, -2, "the stage took the slider's value");
  assert.equal((await state(page)).parameters.m, -2);

  // ---- a typed block: two functions compared, v2 ----
  await type(page, "f(x) = x^2\ng(x) = a x + 1\na = 2 in [-3, 3]\nx in [-3, 3]");
  await drawn(page, "agentx.math-scene.v2");
  const compare = await state(page);
  assert.deepEqual(compare.scene.functions.map((fn) => fn.expression), ["x^2", "a * x + 1"]);
  assert.deepEqual(compare.scene.x, [-3, 3]);
  await page.screenshot({ path: path.join(ART, "math-lab-typed.png") });

  // ---- an invalid block is refused whole; the last picture stays, dimmed ----
  await type(page, "y = a*x\na = 9 in [0, 5]");
  const refused = await state(page);
  assert.equal(refused.state, "refused");
  assert.equal(refused.say, "Pas encore de dessin : La valeur de a sort de son intervalle. Choisis une valeur entre le minimum et le maximum.");
  assert.equal(refused.detail, "Formule non tracée : Parameter a must lie inside its range", "the reader's exact words stay visible");
  assert.ok(refused.stale, "the previous picture is marked as the last valid one");
  assert.deepEqual(refused.scene.functions.map((fn) => fn.expression), ["x^2", "a * x + 1"], "nothing was clamped and drawn");
  await page.screenshot({ path: path.join(ART, "math-lab-refused.png") });

  // ---- starter examples: a tangent (v3), a circle and a hill (v4) ----
  await page.click('.ml-chip[data-id="tangent"]');
  await drawn(page, "agentx.math-scene.v3");
  const tangent = await state(page);
  assert.deepEqual(tangent.scene.tangents, [{ of: "f", at: "p" }]);
  assert.deepEqual(tangent.scene.derivatives, ["f"]);
  assert.equal(tangent.readouts[0], "Tangente à f en x = 1 : pente 0", "the slope of x^3 - 3x at 1, from the formula");
  assert.ok(!tangent.stale && !tangent.say && !tangent.detail, "a valid block clears the refusal");
  assert.deepEqual(tangent.legend, ["x³ − 3 · x", "3 · x² − 3"], "formulas read with superscripts");
  assert.match(tangent.about, /^f'\(x\) est la pente de f/, "the chosen example says what to try");
  await page.screenshot({ path: path.join(ART, "math-lab-tangent.png") });

  await page.click('.ml-chip[data-id="area"]');
  await drawn(page, "agentx.math-scene.v3");
  assert.equal((await state(page)).readouts[0], "Aire sous f de 0 à 2 : 1,4161", "the integral of sin from 0 to 2");

  await page.click('.ml-chip[data-id="circle"]');
  await drawn(page, "agentx.math-scene.v4");
  const circle = await state(page);
  assert.equal(circle.scene.curves[0].label, "c(t)");
  assert.equal(circle.scene.x, null, "a curve alone is framed around itself");
  await page.screenshot({ path: path.join(ART, "math-lab-circle.png") });

  await page.click('.ml-chip[data-id="hill"]');
  await drawn(page, "agentx.math-scene.v4");
  const hill = await state(page);
  assert.equal(hill.scene.kind, "surfaces");
  assert.equal(hill.scene.surfaces[0].expression, "h * exp(-(x^2 + y^2) / s)");
  out.hillLit = await lit(page);
  assert.ok(out.hillLit > 0.004, `the hill is drawn (${out.hillLit.toFixed(4)} bright)`);
  await page.screenshot({ path: path.join(ART, "math-lab-hill.png") });

  // ---- the block survives a reload through the address ----
  assert.match(page.url(), /#bloc=/);
  const before = await page.inputValue("#ml-body");
  assert.match(before, /^z = h exp\(/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await drawn(page, "agentx.math-scene.v4");
  assert.equal(await page.inputValue("#ml-body"), before);
  assert.equal((await state(page)).scene.kind, "surfaces");
  await page.close();

  // ---- a phone: one column, nothing wider than the screen, sliders reachable by touch ----
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  watch(phone);
  await phone.goto(new URL("math-lab.html", BASE).href, { waitUntil: "domcontentloaded" });
  await drawn(phone, "agentx.math-scene.v2");
  await phone.click('.ml-chip[data-id="parabola"]');
  await drawn(phone, "agentx.math-scene.v2");
  out.phone = await phone.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const stage = box(".ml-stage-box"), slider = box(".ml-slider input"), editor = box("#ml-body");
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      stage: [Math.round(stage.left), Math.round(stage.right), Math.round(stage.height)],
      sliderHeight: Math.round(slider.height),
      editorFont: getComputedStyle(document.getElementById("ml-body")).fontSize,
      editorBelowStage: editor.top > stage.bottom,
    };
  });
  assert.ok(out.phone.overflow <= 0, `no sideways scroll on a phone (${out.phone.overflow}px)`);
  assert.ok(out.phone.stage[0] >= 12 && out.phone.stage[1] <= 378 && out.phone.stage[2] >= 240, `the stage fits the phone ${out.phone.stage}`);
  assert.ok(out.phone.sliderHeight >= 32, "sliders are big enough to touch");
  assert.equal(out.phone.editorFont, "16px", "the text box does not make a phone zoom in");
  out.phoneLit = await lit(phone);
  assert.ok(out.phoneLit > 0.004, `the parabola is drawn on the phone (${out.phoneLit.toFixed(4)} bright)`);
  await phone.screenshot({ path: path.join(ART, "math-lab-phone.png"), fullPage: true });
  await phone.close();

  assert.deepEqual(outside, [], "the page asks nothing of any other site");
  assert.deepEqual(errors, [], "no browser errors");
  console.log(JSON.stringify({ ok: true, ...out }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, ...out, errors, outside }));
  throw error;
} finally {
  await browser.close();
}

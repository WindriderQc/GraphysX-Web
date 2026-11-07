import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

// The Math Lab page as a visitor meets it (docs/MATH_LAB_PAGE.md): the Browse shelf row opens
// it (the retired Math Game row is gone) on the cubes for young children (v1: counting, additions
// to 20, buttons only, limits refused rather than clamped), with a path up to the formulas. A typed
// block is drawn by <llmx-stage> with live sliders, an invalid block is refused whole while the
// last picture stays, the starter examples draw v2, v3 and v4 scenes, the block survives a reload
// through the address, and both levels fit a phone. No model and no outside request.

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
    mode: main.dataset.mode, state: main.dataset.state, schema: main.dataset.schema ?? null, stale: main.classList.contains("ml-stale"),
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
// The cube panel as a child sees it: the numbers, the answer, which buttons can be pressed, the note.
const cubes = (page) => page.evaluate(() => {
  const text = (id) => document.getElementById(id).textContent;
  const enabled = (part, delta) => !document.querySelector(`.ml-kids .ml-step[data-part="${part}"][data-delta="${delta}"]`).disabled;
  return {
    to: text("ml-kids-to"), a: text("ml-kids-a"), b: text("ml-kids-b"), answer: text("ml-kids-answer"),
    note: text("ml-kids-note"), say: text("ml-kids-say"), hash: decodeURIComponent(location.hash),
    pressed: [...document.querySelectorAll(".ml-chip-kid[aria-pressed=true]")].map((chip) => chip.dataset.id),
    can: { toUp: enabled("to", "1"), toUp10: enabled("to", "10"), toDown: enabled("to", "-1"), aUp: enabled("a", "1"), bUp: enabled("b", "1"), bDown: enabled("b", "-1") },
  };
});
const cubesDrawn = (page, scene) => page.waitForFunction((wanted) => {
  const main = document.querySelector("main.ml");
  return main?.dataset.state === "drawn" && main.dataset.schema === "agentx.math-scene.v1"
    && JSON.stringify(document.getElementById("ml-stage").scene) === wanted;
}, JSON.stringify(scene), { timeout: SMOKE_TIMEOUT });
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

  // ---- a first visit opens on the cubes: count to 13 in a rod of ten and three ----
  await cubesDrawn(page, { kind: "count", to: 13 });
  const opening = await state(page);
  assert.equal(opening.mode, "kids");
  assert.deepEqual((await cubes(page)).pressed, ["count"]);
  assert.match(opening.about, /se rangent par dix/);
  out.countLit = await lit(page);
  assert.ok(out.countLit > 0.004, `the cubes are drawn on the stage (${out.countLit.toFixed(4)} bright)`);
  await page.waitForTimeout(3500); // let the count finish before the picture is kept
  await page.screenshot({ path: path.join(ART, "math-lab-kids-count.png") });

  // ---- the buttons apply exactly their step; a step past a limit is not offered ----
  await page.click('.ml-kids .ml-step[data-part="to"][data-delta="10"]');
  await cubesDrawn(page, { kind: "count", to: 23 });
  assert.equal((await cubes(page)).to, "23");
  assert.equal((await cubes(page)).hash, "#compter=23");
  await page.click('.ml-pick[data-hash="#compter=100"]');
  await cubesDrawn(page, { kind: "count", to: 100 });
  const hundred = await cubes(page);
  assert.ok(!hundred.can.toUp && !hundred.can.toUp10 && hundred.can.toDown, "at 100 only going down is offered");
  assert.equal(hundred.note, "100, c'est le plus grand nombre ici.");

  // ---- an addition with regrouping: the answer appears when the cubes have completed the ten ----
  await page.click('.ml-chip-kid[data-id="add"]');
  await cubesDrawn(page, { kind: "add", a: 8, b: 5 });
  const adding = await cubes(page);
  assert.deepEqual([adding.a, adding.b, adding.answer], ["8", "5", "?"], "the child can guess first");
  assert.deepEqual(adding.pressed, ["add"]);
  await page.waitForFunction(() => document.getElementById("ml-kids-answer").textContent === "13", null, { timeout: SMOKE_TIMEOUT });
  await page.waitForTimeout(400);
  out.addLit = await lit(page);
  assert.ok(out.addLit > 0.004, `the addition is drawn (${out.addLit.toFixed(4)} bright)`);
  await page.screenshot({ path: path.join(ART, "math-lab-kids-add.png") });
  await page.click('.ml-pick[data-hash="#additionner=10+10"]');
  await cubesDrawn(page, { kind: "add", a: 10, b: 10 });
  const twenty = await cubes(page);
  assert.ok(!twenty.can.aUp && !twenty.can.bUp && twenty.can.bDown, "at 20 in all, no number can grow");
  assert.match(twenty.note, /^20 en tout, c'est le maximum/);
  await page.click('.ml-kids .ml-step[data-part="b"][data-delta="-1"]');
  await cubesDrawn(page, { kind: "add", a: 10, b: 9 });
  assert.ok((await cubes(page)).can.aUp, "one cube fewer lets the other number grow");

  // ---- an address out of v1's bounds is refused, not drawn and not clamped ----
  await page.goto(new URL("math-lab.html#compter=150", BASE).href, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("main.ml")?.dataset.state === "refused", null, { timeout: SMOKE_TIMEOUT });
  const outOfBounds = await state(page);
  assert.equal(outOfBounds.mode, "kids");
  assert.equal(outOfBounds.scene, null, "nothing was drawn, not 100 cubes");
  assert.equal((await cubes(page)).say, "Pas de dessin : On compte de 1 à 100. Choisis un nombre dans cet intervalle.");
  await page.click('.ml-kids .ml-step[data-part="to"][data-delta="1"]');
  await cubesDrawn(page, { kind: "count", to: 14 });
  assert.equal((await cubes(page)).say, "", "a valid press clears the refusal");

  // ---- the path up: from the cubes to the first formula, a line, v2 ----
  await page.click("#ml-kids-next");
  await drawn(page, "agentx.math-scene.v2");
  assert.equal((await state(page)).mode, "formulas");
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
  await cubesDrawn(phone, { kind: "count", to: 13 });
  const kidsLayout = (selector) => phone.evaluate((rowSelector) => {
    const row = document.querySelector(rowSelector).getBoundingClientRect();
    const steps = [...document.querySelectorAll(".ml-kids .ml-step")].filter((button) => button.offsetParent).map((button) => button.getBoundingClientRect());
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      row: [Math.round(row.left), Math.round(row.right)],
      smallestStep: Math.round(Math.min(...steps.map((box) => Math.min(box.width, box.height)))),
      number: getComputedStyle(document.querySelector(".ml-kids-number")).fontSize,
    };
  }, selector);
  out.phoneCount = await kidsLayout(".ml-kids-count .ml-stepper");
  assert.ok(out.phoneCount.overflow <= 0 && out.phoneCount.row[0] >= 12 && out.phoneCount.row[1] <= 378, `the counter fits the phone ${JSON.stringify(out.phoneCount)}`);
  assert.ok(out.phoneCount.smallestStep >= 44, "every cube button is big enough for a small finger");
  assert.ok(parseFloat(out.phoneCount.number) >= 40, "the number reads from across the table");
  out.phoneCountLit = await lit(phone);
  assert.ok(out.phoneCountLit > 0.004, `the cubes are drawn on the phone (${out.phoneCountLit.toFixed(4)} bright)`);
  await phone.waitForTimeout(3500);
  await phone.screenshot({ path: path.join(ART, "math-lab-phone-kids.png"), fullPage: true });
  await phone.click('.ml-chip-kid[data-id="add"]');
  await cubesDrawn(phone, { kind: "add", a: 8, b: 5 });
  out.phoneAdd = await kidsLayout(".ml-sum");
  assert.ok(out.phoneAdd.overflow <= 0 && out.phoneAdd.row[0] >= 12 && out.phoneAdd.row[1] <= 378, `the addition fits the phone ${JSON.stringify(out.phoneAdd)}`);
  assert.ok(out.phoneAdd.smallestStep >= 44, "the + and − buttons are big enough");
  await phone.waitForFunction(() => document.getElementById("ml-kids-answer").textContent === "13", null, { timeout: SMOKE_TIMEOUT });
  await phone.screenshot({ path: path.join(ART, "math-lab-phone-add.png"), fullPage: true });
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

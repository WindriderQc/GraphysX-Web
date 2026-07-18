import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const url = process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4175/";
const outputDir = path.resolve("output/playwright/nature-code-gallery");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => errors.push({ type: "page", text: String(error) }));

const result = { url, assertions: [], states: {}, errors };
const assert = (condition, message) => {
  result.assertions.push({ pass: Boolean(condition), message });
  if (!condition) throw new Error(message);
};
const debug = (method, argument) =>
  page.evaluate(({ method, argument }) => window.__GRAPHYSX_DEBUG__[method](argument), { method, argument });
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).nature);
const screenshot = (name) => page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__ && window.render_game_to_text);
  assert(await debug("openNatureLab"), "Nature Lab opens");
  await page.waitForTimeout(500);

  let current = await state();
  assert(current.lesson.id === "flock-separation", "Flock opens on the isolated Separation lesson");
  assert(current.population === 60, "Flock starts with the source HTML's readable 60-boid population");
  assert(current.demonstration.effectiveRules.includes("alignment 0.00"), "Separation lesson disables alignment");
  assert(current.demonstration.effectiveRules.includes("cohesion 0.00"), "Separation lesson disables cohesion");
  await screenshot("00-flock-separation-lesson");

  await page.locator('[data-nature-action="experiment"]').click();
  current = await state();
  assert(current.actionCount === 1, "The visible Experiment button performs the lesson action");

  assert(await debug("selectNatureLesson", "flock-alignment"), "Alignment is independently selectable");
  current = await state();
  assert(current.demonstration.effectiveRules.includes("separation 0.00") && current.demonstration.effectiveRules.includes("cohesion 0.00"), "Alignment runs without the other flock rules");
  assert(await debug("selectNatureLesson", "flock-cohesion"), "Cohesion is independently selectable");
  current = await state();
  assert(current.demonstration.effectiveRules.includes("separation 0.00") && current.demonstration.effectiveRules.includes("alignment 0.00"), "Cohesion runs without the other flock rules");

  assert(await debug("selectNatureLesson", "flock-complete"), "Complete flock remains available after the isolated rules");
  const flockBeforeCanvas = (await state()).population;
  await page.locator(".viewport canvas").click({ position: { x: 410, y: 360 } });
  current = await state();
  assert(current.population === flockBeforeCanvas + 12, "Clicking the 3D view adds twelve boids like the HTML interaction");
  await screenshot("01-complete-flock-after-canvas-spawn");

  assert(await debug("pauseNatureLab", true), "The simulation pauses");
  const pausedElapsed = (await state()).elapsedSeconds;
  await page.evaluate(() => window.advanceTime(1000));
  assert(Math.abs((await state()).elapsedSeconds - pausedElapsed) < 0.001, "Global deterministic time respects pause");
  assert(await debug("stepNatureLab", 0.5), "A paused lesson can advance one explicit step");
  assert((await state()).elapsedSeconds >= pausedElapsed + 0.49, "Step advances the lesson by the requested duration");
  assert(await debug("pauseNatureLab", false), "The simulation resumes");

  assert(await debug("selectNatureStudy", "forces-garden"), "Forces & Flow opens");
  current = await state();
  assert(current.lesson.id === "forces-random-walk" && current.population === 2, "Session 1 is restored as two isolated random walkers");
  assert(current.visibleSystems.includes("persistent trails"), "Random walk exposes its path history");
  await page.evaluate(() => window.advanceTime(7000));
  await screenshot("02-session1-random-walk");

  assert(await debug("selectNatureLesson", "forces-attraction"), "Gravity & Mass is independently selectable");
  current = await state();
  assert(current.population === 176 && !current.visibleSystems.includes("animated vectors"), "Attraction is isolated from the flow field");
  assert(await debug("actInNatureLab"), "Attraction action releases particles");
  assert((await state()).population === 188, "Particle release increases the attraction population by twelve");

  assert(await debug("selectNatureLesson", "forces-flow-field"), "Flow Field is independently selectable");
  current = await state();
  assert(current.population === 18 && current.visibleSystems.includes("animated vectors"), "Flow Field shows only its eighteen vehicles and vectors");
  await page.evaluate(() => window.advanceTime(1400));
  await screenshot("03-flow-field-followers");

  assert(await debug("selectNatureLesson", "forces-combined"), "The combined garden remains an explicit synthesis lesson");
  current = await state();
  assert(current.population === 206, "Combined garden exposes particles and vehicles together");

  assert(await debug("selectNatureStudy", "living-forest"), "Living Forest opens");
  current = await state();
  assert(current.lesson.id === "forest-branching" && current.population === 13, "Recursive Growth isolates thirteen trees without leaf entities");
  await page.evaluate(() => window.advanceTime(2400));
  assert((await state()).demonstration.phase.includes("recursive growth"), "Branching reports its visible growth phase");
  await screenshot("04-recursive-branch-growth");

  assert(await debug("selectNatureLesson", "forest-leaf-fall"), "Leaf Fall is independently selectable");
  assert(await debug("actInNatureLab"), "Leaf Fall action triggers autumn immediately");
  await page.evaluate(() => window.advanceTime(1200));
  await screenshot("05-leaf-fall-autumn");

  assert(await debug("selectNatureLesson", "forest-evolution"), "DNA & Evolution is independently selectable");
  const generationBefore = (await state()).generation;
  assert(await debug("actInNatureLab"), "Evolution action advances a generation");
  assert((await state()).generation === generationBefore + 1, "Evolution action changes inherited DNA colors by generation");

  assert(await debug("selectNatureLesson", "forest-life-cycle"), "Complete Life Cycle remains available after the focused lessons");
  const lifePopulation = (await state()).population;
  assert(await debug("actInNatureLab"), "Complete Life Cycle can plant another tree");
  assert((await state()).population > lifePopulation, "Planting adds a real tree and leaf population");
  await page.evaluate(() => window.advanceTime(5000));
  await screenshot("06-complete-life-cycle-planted");

  assert(await debug("selectNatureStudy", "orbital-observatory"), "Orbital Observatory remains an independent non-Nature-of-Code world");
  current = await state();
  assert(current.lesson.id === "orbital-live" && current.observatory.earthquakes.count === 160, "Orbital telemetry remains intact after gallery expansion");

  assert(errors.length === 0, "Nature gallery browser console and page errors remain clean");
} finally {
  result.states.final = await state().catch(() => null);
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(result, null, 2));
  await browser.close();
}

console.log(JSON.stringify({ assertions: result.assertions.length, errors: errors.length, outputDir }, null, 2));

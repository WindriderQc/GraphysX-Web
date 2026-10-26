import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

// The connected house: the ecosystem stands as ordinary entities, Nestor's tour plays its
// stops without touching the document, a real 3D click opens a machine, a refused list is
// reported. No LAN, no AgentX: the map is data in the bundle.
const artifacts = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(artifacts, { recursive: true });
const server = process.env.SMOKE_BASE ? null : await startStaticServer({ root: path.resolve("dist"), port: 0 });
const base = process.env.SMOKE_BASE || server.url;
const browser = await launchSmokeBrowser();
const app = () => (typeof window.render_game_to_text === "function" ? JSON.parse(window.render_game_to_text()).application : null);
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  applySmokeTimeout(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", (route) => (new URL(route.request().url()).origin !== new URL(base).origin ? route.abort() : route.continue()));
  await page.goto(`${base}?app=ecosystem`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: /La maison/ }).waitFor();
  await page.waitForFunction(`(${app})()?.application === "ecosystem" && (${app})().nodes.length > 20`);

  const initial = await page.evaluate(() => {
    const text = JSON.parse(window.render_game_to_text());
    const api = window.__GRAPHYSX__;
    return { app: text.application, world: api.state().world, entityCount: api.state().entities.length,
      nodes: api.query({ tag: "eco-node" }).map((entity) => ({ id: entity.id, type: entity.type, tags: entity.tags })),
      bloom: api.state().environment?.post?.bloom ?? null };
  });
  assert.equal(initial.world.id, "agentx-ecosystem");
  assert.equal(initial.nodes.length, 25, "one entity per node of the map");
  assert.ok(initial.entityCount > 100, "lights, kerbs, shelves, nodes, rails, beacons, cages");
  assert.ok(initial.nodes.every((entity) => entity.tags.some((tag) => tag.startsWith("eco-node:"))), "nodes carry their id in tags");
  assert.equal(initial.nodes.filter((entity) => entity.tags.includes("eco-status:attention")).length, 3, "three open issues");
  assert.ok(initial.bloom && initial.bloom.strength > 0);
  // Default list, paused on the overview, Nestor speaking.
  assert.deepEqual([initial.app.tour.index, initial.app.tour.count, initial.app.tour.playing, initial.app.tour.kind], [0, 13, false, "overview"]);
  assert.match(initial.app.narration, /Bienvenue dans la maison/);
  assert.equal(initial.app.notice, "");
  await page.screenshot({ path: path.join(artifacts, "ecosystem-overview.png") });
  console.log(`ok: ${initial.entityCount} entities, ${initial.nodes.length} nodes`);

  // Every stop of the default tour: picture drawn, narration said, document untouched.
  const before = await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument()));
  const expectations = {
    frank: { focus: ["ugfrank", "nas"], arcs: 1, says: /HP Z440/ },
    services: { focus: ["core", "nestor", "dsh", "imagex", "rag", "media", "homeassistant", "monitoring"], arcs: 8, says: /Huit groupes/ },
    brutal: { focus: ["ugbrutal", "devx"], arcs: 0, says: /VM Hyper-V/ },
    voice: { focus: ["browser", "core", "ugfrank", "nestor"], arcs: 6, says: /Whisper/ },
    garage: { focus: ["babypi", "nas", "phone"], arcs: 2, says: /trente jours/ },
    watch: { focus: ["monitoring", "piusb", "pit", "babypi"], arcs: 4, says: /3 points ouverts/ },
    summary: { focus: [], arcs: 0, says: /Installé ne veut pas dire entièrement qualifié/ },
  };
  for (const [kind, expected] of Object.entries(expectations)) {
    const label = { frank: "UGFrank", services: "Les services", brutal: "UGBrutal · devX", voice: "Parler avec Nestor", garage: "Garage · BabyPi", watch: "Surveillance & points ouverts", summary: "Résumé" }[kind];
    await page.locator(".gx-eco-steps button", { hasText: label }).first().click();
    await page.waitForFunction(`(${app})().tour.kind === ${JSON.stringify(kind)} && (${app})().narrationComplete`);
    const state = await page.evaluate(`(${app})()`);
    assert.deepEqual(state.focus, expected.focus, `${kind} lights the right nodes`);
    assert.equal(state.arcs, expected.arcs, `${kind} draws ${expected.arcs} arcs`);
    assert.match(state.narration, expected.says, `${kind}: Nestor says the right thing`);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument())), before, `${kind} never edits the scene document`);
    await page.screenshot({ path: path.join(artifacts, `ecosystem-${kind}.png`) });
  }
  const watch = await page.evaluate(`(${app})()`);
  console.log(`ok: ${Object.keys(expectations).length} stops played; watch amber = ${watch.amber.join(",")}`);

  // Playing advances on the frame clock; the progress bar follows.
  await page.locator(".gx-eco-steps button", { hasText: "Vue d'ensemble" }).first().click();
  await page.waitForFunction(`(${app})().tour.kind === "overview"`);
  await page.locator('[data-action="toggle"]').click();
  await page.waitForFunction(`(${app})().tour.playing === true && (${app})().tour.index === 0`);
  await page.evaluate(() => window.advanceTime?.(7500));
  await page.waitForFunction(`(${app})().tour.index === 1 && (${app})().tour.kind === "frank"`);
  await page.locator('[data-action="toggle"]').click();
  await page.waitForFunction(`(${app})().tour.playing === false`);
  console.log("ok: play advances overview → UGFrank after 7 s");

  // A real 3D click on UGAlien opens it over the current stop; Escape returns to the stop.
  await page.locator(".gx-eco-steps button", { hasText: "Vue d'ensemble" }).first().click();
  await page.waitForFunction(`(${app})().tour.kind === "overview"`);
  const alien = (await page.evaluate(`(${app})()`)).nodes.find((node) => node.id === "ugalien");
  assert.ok(alien.screen, "UGAlien projects on screen from the overview");
  await page.mouse.move(alien.screen[0], alien.screen[1]);
  await page.waitForFunction(`(${app})().hovered === "ugalien"`);
  assert.match(await page.locator(".gx-eco-card h3").textContent(), /UGAlien/);
  await page.mouse.click(alien.screen[0], alien.screen[1]);
  await page.waitForFunction(`(${app})().tour.adhoc === "node-ugalien" && (${app})().narrationComplete`);
  const opened = await page.evaluate(`(${app})()`);
  assert.match(opened.narration, /2 × RTX 3090/);
  assert.ok(opened.focus.includes("ugalien") && opened.focus.includes("monitoring"), "the machine and what it is linked to");
  assert.equal(opened.tour.playing, false, "a click pauses the tour");
  await page.screenshot({ path: path.join(artifacts, "ecosystem-click-ugalien.png") });
  await page.keyboard.press("Escape");
  await page.waitForFunction(`(${app})().tour.adhoc === null && (${app})().tour.kind === "overview"`);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__GRAPHYSX__.exportDocument())), before, "clicking a machine never edits the document");
  console.log("ok: 3D click opens UGAlien, Escape returns");

  // Arrow keys step; the chips follow.
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(`(${app})().tour.index === 1`);
  assert.equal(await page.locator(".gx-eco-steps button[aria-current=step]").textContent(), "UGFrank");

  // A `play` list from the host plays at once; an unknown stop is refused, not skipped.
  await page.goto(`${base}?app=ecosystem&play=watch,node-babypi`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(`(${app})()?.application === "ecosystem" && (${app})().tour.count === 2`);
  const played = await page.evaluate(`(${app})()`);
  assert.deepEqual([played.tour.playing, played.tour.kind, played.tour.script], [true, "watch", "watch,node-babypi"]);
  await page.goto(`${base}?app=ecosystem&play=overview,dance`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(`(${app})()?.application === "ecosystem"`);
  const refused = await page.evaluate(`(${app})()`);
  assert.match(refused.notice, /unknown play stop: dance/);
  assert.equal(refused.tour.count, 13, "the full tour plays instead");
  assert.match(await page.locator("[data-notice]").textContent(), /Liste refusée/);
  console.log("ok: play list honoured, unknown stop refused");

  // Mobile: the tour bar and Nestor still fit.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  applySmokeTimeout(mobile);
  mobile.on("pageerror", (error) => errors.push(String(error)));
  await mobile.goto(`${base}?app=ecosystem&play=edge`, { waitUntil: "domcontentloaded" });
  await mobile.waitForFunction(`(${app})()?.application === "ecosystem" && (${app})().narrationComplete`);
  const bar = await mobile.locator(".gx-eco-tour").boundingBox();
  assert.ok(bar && bar.x >= 0 && bar.x + bar.width <= 390 && bar.y + bar.height <= 844, `tour bar fits the phone: ${JSON.stringify(bar)}`);
  await mobile.screenshot({ path: path.join(artifacts, "ecosystem-mobile-edge.png") });
  await mobile.close();

  // Quit returns to the front door.
  await page.locator('[data-action="exit"]').click();
  await page.waitForFunction(() => new URLSearchParams(window.location.search).get("app") === null);
  assert.deepEqual(errors, [], `no page errors: ${errors.join("\n")}`);
  console.log("ecosystem smoke: PASS");
} finally {
  await browser.close();
  await server?.close();
}

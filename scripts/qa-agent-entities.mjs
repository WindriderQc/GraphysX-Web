import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const url = process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4177/";
const outputDir = path.resolve("output/playwright/agent-entities");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push({ type: "console", text: message.text() }); });
page.on("pageerror", (error) => errors.push({ type: "page", text: String(error) }));

const result = { url, assertions: [], states: {}, errors };
const assert = (condition, message) => {
  result.assertions.push({ pass: Boolean(condition), message });
  if (!condition) throw new Error(message);
};
const api = (method, ...args) => page.evaluate(({ method, args }) => window.__GRAPHYSX__[method](...args), { method, args });
const queryOne = async (id) => (await api("query", { ids: [id] }))[0];

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX__ && window.render_game_to_text && window.advanceTime);

  const catalog = await api("assets");
  assert(catalog.length === 5 && catalog.every((asset) => asset.format === "graphysx-mesh-json"), "Agents discover five ready-to-use recovered complex models");
  assert(catalog.some((asset) => asset.id === "zoksword") && catalog.some((asset) => asset.id === "port-cottage"), "Asset catalog exposes stable semantic ids for a prop and a building");
  assert(await api("open"), "Agent World Studio opens through the public API");

  const created = await api("create", {
    schema: "graphysx.agent-world/v2",
    id: "qa-archive-entity-playground",
    label: "Archive Entity Playground",
    environment: {
      background: "#07111d",
      ground: { visible: true, size: 34, color: "#13272d", grid: true, gridColor: "#4ac6c1" },
      physics: { gravity: [0, -9.81, 0] }
    },
    entities: [
      { id: "ambient", type: "ambient-light", intensity: 0.9, material: { color: "#9bc7db" } },
      { id: "sun", type: "directional-light", intensity: 3.4, transform: { position: [-8, 14, 10] }, material: { color: "#ffe6b5" } },
      {
        id: "archive-path", label: "Recovered Spline", type: "spline",
        path: { points: [[-7, 1.3, 4], [-5, 3, -3], [0, 2, -6], [6, 3.8, -2], [7, 1.5, 4], [0, 2.6, 7]], closed: true, tension: 0.52 },
        material: { color: "#55e9ff", emissive: "#157b90", opacity: 0.85 }, tags: ["path", "archive-contract"]
      },
      {
        id: "spline-sword", label: "Spline-Controlled Zok Sword", type: "model",
        asset: { id: "zoksword", fitSize: 2.2 }, geometry: { width: 2.2, height: 0.45, depth: 0.65 },
        transform: { position: [-7, 1.3, 4], rotationDegrees: [0, 0, 15] },
        physics: { mode: "kinematic", material: "wall" }, tags: ["model", "kinematic", "archive-contract"],
        behaviors: [{ id: "ride-path", type: "follow-spline", splineId: "archive-path", speed: 3.2, loop: true, orientToPath: true }]
      },
      {
        id: "archive-cottage", label: "Static Archive Cottage", type: "model",
        asset: { id: "port-cottage", fitSize: 5.6 }, geometry: { width: 5.2, height: 4, depth: 4.4 },
        transform: { position: [-5.5, 2, -1.5], rotationDegrees: [0, 28, 0] },
        physics: { mode: "static", material: "wall" }, tags: ["model", "static", "archive-contract"]
      },
      {
        id: "dynamic-orb", label: "Dynamic Archive Orb", type: "sphere", geometry: { radius: 0.62 },
        transform: { position: [3.5, 8, 0] }, material: { color: "#ff794f", emissive: "#8d2412", emissiveIntensity: 0.8, metalness: 0.25 },
        physics: { mode: "dynamic", mass: 1.4, material: "ball", restitution: 0.72, linearVelocity: [-0.8, 0, 0] },
        tags: ["primitive", "dynamic", "archive-contract"]
      },
      {
        id: "dynamic-shield", label: "Dynamic Zok Shield", type: "model",
        asset: { id: "zokshield", fitSize: 1.8 }, geometry: { width: 1.3, height: 1.8, depth: 0.45 },
        transform: { position: [0.5, 6.5, 2.2], rotationDegrees: [8, 0, 18] },
        physics: { mode: "dynamic", mass: 0.8, material: "ball", restitution: 0.38, angularVelocity: [0, 1.2, 0.4] },
        tags: ["model", "dynamic", "archive-contract"]
      },
      {
        id: "static-plinth", label: "Static Physics Plinth", type: "box", geometry: { width: 4.2, height: 0.8, depth: 4.2 },
        transform: { position: [3.5, 0.4, 0] }, material: { color: "#31586a", metalness: 0.3 },
        physics: { mode: "static", material: "ground", friction: 0.55 }, tags: ["primitive", "static"]
      },
      { id: "orb-light", type: "point-light", intensity: 5, distance: 16, transform: { position: [3.5, 5, 0] }, material: { color: "#ff8b60", emissive: "#ff4b2f" } }
    ]
  });
  assert(created.ok && created.value.entityCount === 9, "One JSON world creates lights, a spline, three complex models, and static/dynamic primitives");
  assert(created.value.environment.physics.gravity[1] === -9.81, "World state preserves agent-selected gravity");

  await page.waitForFunction(() => {
    const models = window.__GRAPHYSX__.query({ type: "model" });
    return models.length === 3 && models.every((model) => model.asset?.status === "ready");
  });
  const models = await api("query", { type: "model" });
  assert(models.every((model) => model.asset.status === "ready"), "Recovered complex model payloads load into the authored world");
  assert(["static", "kinematic", "dynamic"].every((mode) => models.some((model) => model.physics.mode === mode)), "Complex models support static, dynamic, and mesh-controlled kinematic physics");

  const spline = await queryOne("archive-path");
  assert(spline.path.pointCount === 6 && spline.path.closed, "Spline state reports its exact control-point count and topology");
  const swordBefore = (await queryOne("spline-sword")).position;
  const ballBefore = await queryOne("dynamic-orb");
  assert(ballBefore.physics.mode === "dynamic" && ballBefore.physics.mass === 1.4, "Primitive state exposes dynamic mode, mass, material, and velocities");

  assert((await api("pause", true)).ok, "Agent pauses realtime simulation for deterministic editing");
  assert((await api("step", 0.75)).ok, "Agent explicitly advances physics and spline motion");
  const swordAfter = (await queryOne("spline-sword")).position;
  const ballAfter = await queryOne("dynamic-orb");
  const shieldAfter = await queryOne("dynamic-shield");
  assert(JSON.stringify(swordAfter) !== JSON.stringify(swordBefore), "Kinematic model travels along the referenced spline");
  assert(ballAfter.position[1] < ballBefore.position[1], "Dynamic sphere falls under the world gravity");
  assert(shieldAfter.position[1] < 6.5 && Math.abs(shieldAfter.physics.angularVelocity[1]) > 0.1, "Dynamic complex model falls and rotates as a live rigid body");

  await api("step", 1.5);
  const landedBall = await queryOne("dynamic-orb");
  assert(landedBall.position[1] > 0.6 && landedBall.position[1] < 4.5, "Dynamic sphere collides with and bounces above the static plinth");
  const launch = await api("update", "dynamic-orb", { physics: { linearVelocity: [0, 7.5, 0] } });
  assert(launch.ok && launch.value.physics.linearVelocity[1] === 7.5, "Agent edits a live rigid body's velocity through the ordinary entity update API");
  const launchY = launch.value.position[1];
  await api("step", 0.35);
  assert((await queryOne("dynamic-orb")).position[1] > launchY, "Updated rigid body launches upward on the next deterministic step");

  const badLightPhysics = await api("spawn", { id: "bad-light", type: "point-light", physics: { mode: "dynamic" } });
  assert(!badLightPhysics.ok && badLightPhysics.error.includes("cannot have physics"), "Invalid light physics fails clearly without mutating the world");
  const badDynamicFollower = await api("spawn", {
    id: "bad-follower", type: "box", physics: { mode: "dynamic" },
    behaviors: [{ type: "follow-spline", splineId: "archive-path" }]
  });
  assert(!badDynamicFollower.ok && badDynamicFollower.error.includes("kinematic"), "Dynamic/spline transform conflicts are rejected with a useful correction");

  const exported = await api("export");
  assert(exported.entities.find((entity) => entity.id === "archive-cottage").asset.id === "port-cottage", "Export preserves stable complex-model asset ids");
  assert(exported.entities.find((entity) => entity.id === "dynamic-orb").physics.mode === "dynamic", "Export preserves rigid-body intent for save/load and collaboration");
  assert((await api("save", "qa-archive-entities")).ok, "Mixed entity world saves through the existing snapshot API");
  assert((await api("clear", "qa-empty", "QA Empty")).ok, "Mixed world clears through the existing API");
  assert((await api("load", "qa-archive-entities")).ok, "Mixed entity world reloads from the same snapshot contract");
  await page.waitForFunction(() => window.__GRAPHYSX__.query({ type: "model" }).every((model) => model.asset?.status === "ready"));

  const textState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert(textState.agentWorld.entityCount === 9, "render_game_to_text exposes the same mixed entity world to agents");
  result.states.final = await api("state");
  await page.screenshot({ path: path.join(outputDir, "archive-entity-playground.png"), fullPage: true });
  assert(errors.length === 0, "Agent entity playground has no browser console or page errors");
} finally {
  result.states.final ??= await api("state").catch(() => null);
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(result, null, 2));
  await browser.close();
}

console.log(JSON.stringify({ assertions: result.assertions.length, errors: errors.length, outputDir }, null, 2));

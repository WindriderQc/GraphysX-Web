import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const url = process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4177/";
const outputDir = path.resolve("output/playwright/agent-world-api-v2");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"]
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
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
const api = (method, ...args) => page.evaluate(
  ({ method, args }) => window.__GRAPHYSX__[method](...args),
  { method, args }
);
const state = () => page.evaluate(() => window.__GRAPHYSX__.state());
const textState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const screenshot = (name, fullPage = true) => page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage });

const buildCommands = [
  { op: "spawn", entity: { id: "ambient", type: "ambient-light", intensity: 0.85, material: { color: "#8bcde4" }, tags: ["lighting"] } },
  { op: "spawn", entity: { id: "sun", type: "directional-light", intensity: 3.4, transform: { position: [-10, 16, 8] }, material: { color: "#fff0c2" }, tags: ["lighting"] } },
  { op: "spawn", entity: { id: "garden-root", label: "AI Garden", type: "group", tags: ["zone", "living"] } },
  { op: "spawn", entity: { id: "heart", label: "Garden Heart", type: "icosahedron", parentId: "garden-root", geometry: { radius: 1.25, radialSegments: 24 }, transform: { position: [0, 3.4, 0] }, material: { color: "#ff8ba7", emissive: "#8d173f", emissiveIntensity: 1.5, metalness: 0.28 }, tags: ["living", "focus"], behaviors: [{ id: "heart-spin", type: "spin", axis: "y", speedDegrees: 20 }, { id: "heart-pulse", type: "pulse", minimumScale: 0.9, maximumScale: 1.12, frequencyHz: 0.35 }] } },
  { op: "spawn", entity: { id: "heart-light", type: "point-light", parentId: "garden-root", intensity: 7, distance: 22, transform: { position: [0, 4.2, 0] }, material: { color: "#ff7196", emissive: "#ff376b", emissiveIntensity: 2 }, tags: ["lighting", "focus"] } },
  { op: "spawn", entity: { id: "heart-halo", label: "Heart Halo", type: "torus", parentId: "garden-root", geometry: { radius: 2.2, tube: 0.055, radialSegments: 64 }, transform: { position: [0, 3.4, 0], rotationDegrees: [90, 0, 0] }, material: { color: "#6bf3ff", emissive: "#157988", emissiveIntensity: 1.7, metalness: 0.62 }, tags: ["living", "signal"], behaviors: [{ id: "halo-spin", type: "spin", axis: "z", speedDegrees: -16 }] } },
  ...Array.from({ length: 8 }, (_, index) => ({
    op: "spawn",
    entity: {
      id: `petal-${index + 1}`,
      label: `Orbit Petal ${index + 1}`,
      type: index % 2 === 0 ? "sphere" : "icosahedron",
      parentId: "garden-root",
      geometry: { radius: 0.34 + (index % 3) * 0.06, radialSegments: 20 },
      transform: { position: [0, 2.2 + (index % 3) * 0.8, 0] },
      material: { color: index % 2 === 0 ? "#70ecff" : "#8ff7bc", emissive: index % 2 === 0 ? "#0d6679" : "#176c43", emissiveIntensity: 1.05, metalness: 0.22 },
      tags: ["living", "petal", index % 2 === 0 ? "sensor" : "builder"],
      behaviors: [{ id: `petal-orbit-${index + 1}`, type: "orbit", center: [0, 0, 0], radius: 4.7 + (index % 3) * 1.45, speedDegrees: 15 + index * 2.2, phaseDegrees: index * 45 }, { id: `petal-spin-${index + 1}`, type: "spin", axis: "y", speedDegrees: 38 }]
    }
  })),
  ...[-7, -3.5, 3.5, 7].flatMap((x, index) => {
    const treeId = `tree-${index + 1}`;
    return [
      { op: "spawn", entity: { id: treeId, label: `Signal Tree ${index + 1}`, type: "group", parentId: "garden-root", transform: { position: [x, 0, -5.8 + (index % 2) * 1.2] }, tags: ["living", "tree"] } },
      { op: "spawn", entity: { id: `${treeId}-trunk`, type: "cylinder", parentId: treeId, geometry: { radius: 0.32, height: 2.7 + index * 0.25, radialSegments: 10 }, transform: { position: [0, 1.35 + index * 0.125, 0] }, material: { color: "#76564a", roughness: 0.84 }, tags: ["tree-part"] } },
      { op: "spawn", entity: { id: `${treeId}-crown`, type: "cone", parentId: treeId, geometry: { radius: 1.25 + index * 0.08, height: 2.8, radialSegments: 12 }, transform: { position: [0, 3.6 + index * 0.25, 0] }, material: { color: index % 2 ? "#59e5a1" : "#67d7d0", emissive: "#145c4e", emissiveIntensity: 0.65 }, tags: ["tree-part", "living"], behaviors: [{ id: `${treeId}-bob`, type: "bob", axis: "y", amplitude: 0.12, frequencyHz: 0.2, phaseDegrees: index * 55 }] } }
    ];
  }),
  ...[-8, 8].map((x, index) => ({ op: "spawn", entity: { id: `beacon-${index + 1}`, type: "point-light", parentId: "garden-root", intensity: 4.5, distance: 14, transform: { position: [x, 2.3, 3.5] }, material: { color: index ? "#8174ff" : "#4de8ff", emissive: index ? "#4836d0" : "#16889a", emissiveIntensity: 1.8 }, tags: ["lighting", "beacon"] } }))
];

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX__ && window.render_game_to_text);

  const contract = await page.evaluate(() => ({
    schema: window.__GRAPHYSX__.schema,
    worldSchema: window.__GRAPHYSX__.worldSchema,
    version: window.__GRAPHYSX__.version,
    capabilities: window.__GRAPHYSX__.capabilities
  }));
  assert(contract.schema === "graphysx.agent-api/v2" && contract.worldSchema === "graphysx.agent-world/v2", "Public API and world schemas identify v2");
  assert(contract.version === "2.0" && contract.capabilities.includes("transaction.atomic") && contract.capabilities.includes("scene.observe"), "Public API advertises its agent capabilities");
  assert(contract.capabilities.includes("prefab.spawn") && contract.capabilities.includes("collaboration.commit"), "Public API advertises prefab composition and actor-aware collaboration");
  assert(contract.capabilities.includes("starter.list") && contract.capabilities.includes("starter.load"), "Public API advertises one-call starter worlds");
  assert(contract.capabilities.includes("interaction.trigger"), "Public API advertises shared human/agent interactions");
  const prefabCatalog = await api("prefabs");
  assert(prefabCatalog.length === 5 && prefabCatalog.map((prefab) => prefab.entityCount).join(",") === "6,8,7,12,8", "Prefab catalog is discoverable before opening a world and reports exact expansion counts");
  const starterCatalog = await api("starters");
  assert(starterCatalog.length === 5 && starterCatalog.map((starter) => starter.entityCount).join(",") === "43,45,41,45,16", "Starter catalog includes the three composition recipes, compact playable Signal Trail, and Physics Sketchbook");
  assert(await api("open"), "Agent World Studio opens through the public API");
  assert((await state()).entityCount === 16, "Studio begins with the API-created constellation demo");

  const starterResult = await api("loadStarter", "glow-garden", { id: "qa-glow-garden", label: "QA Glow Garden" });
  assert(starterResult.ok && starterResult.value.world.id === "qa-glow-garden" && starterResult.value.world.label === "QA Glow Garden", "Agent loads and names a complete starter world in one call");
  assert(starterResult.value.entityCount === 45 && (await api("query", { tag: "prefab-root" })).length === 6, "Glow Garden expands to six editable prefab roots and forty-five ordinary entities");
  assert((await api("query", { tag: "starter" })).length === 8, "Starter lights and prefab roots remain easy to find through one semantic tag");
  const interactiveCore = (await api("query", { ids: ["garden-heart:core"] }))[0];
  const sculptureTargets = ["garden-heart:axis-x", "garden-heart:axis-y", "garden-heart:axis-z", "garden-heart:light"];
  assert(interactiveCore.interactions.length === 1 && interactiveCore.interactions[0].label === "Toggle garden sculpture", "Structured entity state exposes a concise labeled interaction");

  const interactionRevision = (await state()).revision;
  const interactionResult = await api("interact", "garden-heart:core", "toggle-power");
  assert(interactionResult.ok && interactionResult.revision === interactionRevision + 1 && interactionResult.value.targets.every((target) => !target.visible), "Agent interaction atomically toggles every declared target and returns a useful receipt");
  assert((await api("query", { ids: sculptureTargets })).every((entity) => !entity.visible), "Interaction result matches queryable world visibility");
  assert((await api("interact", "garden-heart:core")).value.targets.every((target) => target.visible), "Omitting the action id uses the entity's first interaction and restores its targets");

  const beforeUnknownInteraction = await state();
  const unknownInteraction = await api("interact", "garden-heart:core", "missing-action");
  assert(!unknownInteraction.ok && unknownInteraction.error.includes("Unknown interaction") && (await state()).revision === beforeUnknownInteraction.revision, "Unknown action ids fail clearly without changing revision");
  const rejectedInteractionTransaction = await api("transaction", [
    { op: "interact", id: "garden-heart:core", interactionId: "toggle-power" },
    { op: "spawn", entity: { id: "garden-heart:core", type: "box" } }
  ]);
  assert(!rejectedInteractionTransaction.ok && (await api("query", { ids: sculptureTargets })).every((entity) => entity.visible), "An interact command rolls back with the rest of a rejected atomic transaction");

  await page.locator('[data-agent-world-interact="garden-heart:core"]').click();
  assert((await api("query", { ids: sculptureTargets })).every((entity) => !entity.visible), "Accessible Studio interaction control uses the same runtime action");
  await api("interact", "garden-heart:core");
  const canvas = page.locator("canvas").first();
  await canvas.click({ position: { x: 475, y: 515 } });
  assert((await api("query", { ids: sculptureTargets })).every((entity) => !entity.visible), "Clicking the actual 3D centerpiece triggers the same interaction path");
  assert((await api("state")).selectedIds[0] === "garden-heart:core", "Clicking a 3D entity selects it in the shared human/agent editor state");
  await screenshot("00-direct-3d-interaction");
  await api("interact", "garden-heart:core");
  await screenshot("00-one-call-glow-garden");

  const createResult = await api("create", {
    schema: "graphysx.agent-world/v2",
    id: "qa-ai-garden",
    label: "AI Garden — API Only",
    environment: { background: "#06121d", ground: { visible: true, size: 36, color: "#102b31", grid: true, gridColor: "#43d8cf" } },
    entities: []
  });
  assert(createResult.ok, "Agent replaces the demo with an empty authored world");
  const transactionResult = await api("transaction", buildCommands);
  assert(transactionResult.ok && transactionResult.value.length === buildCommands.length, "One atomic API transaction builds the complete AI Garden");
  let current = await state();
  result.states.built = current;
  assert(current.world.id === "qa-ai-garden" && current.entityCount === buildCommands.length, "World state reports every API-created entity");
  assert((await api("query", { tag: "petal" })).length === 8, "Semantic tag query finds all eight orbit petals");
  assert((await api("query", { type: "point-light" })).length === 3, "Type query finds all three point lights");
  const nearby = await api("query", { within: { center: [0, 3, 0], radius: 3 } });
  assert(nearby.some((entity) => entity.id === "heart"), "World-space query finds the garden heart");
  const observation = await api("observe", { tag: "tree" });
  assert(observation.schema === "graphysx.agent-world-state/v2" && observation.matches.length === 4, "Observation combines complete state with filtered matches");
  assert((await textState()).agentWorld.entityCount === buildCommands.length, "render_game_to_text exposes the same agent world state");
  await page.waitForTimeout(500);
  await screenshot("00-api-built-ai-garden");

  await api("pause", true);
  const petalBefore = (await api("query", { ids: ["petal-1"] }))[0].position;
  await page.evaluate(() => window.advanceTime(1000));
  const petalWhilePaused = (await api("query", { ids: ["petal-1"] }))[0].position;
  assert(JSON.stringify(petalWhilePaused) === JSON.stringify(petalBefore), "Paused world ignores global deterministic time");
  const stepResult = await api("step", 1.25);
  const petalAfterStep = (await api("query", { ids: ["petal-1"] }))[0].position;
  assert(stepResult.ok && JSON.stringify(petalAfterStep) !== JSON.stringify(petalBefore), "Explicit step deterministically advances orbit behavior");

  const updateResult = await api("update", "heart", { transform: { position: [0, 4.1, 0] }, tags: ["living", "focus", "edited-by-agent"] });
  assert(updateResult.ok && updateResult.value.tags.includes("edited-by-agent"), "Agent updates transform and semantic tags by stable id");
  const behaviorResult = await api("attachBehavior", "tree-1", { id: "tree-pulse", type: "pulse", minimumScale: 0.96, maximumScale: 1.05, frequencyHz: 0.18 });
  assert(behaviorResult.ok && behaviorResult.value.behaviorId === "tree-pulse", "Agent attaches a named behavior at runtime");
  const lookAtResult = await api("attachBehavior", "tree-2", { id: "face-heart", type: "look-at", targetId: "heart" });
  assert(lookAtResult.ok && lookAtResult.value.behaviorId === "face-heart", "Agent attaches a cross-entity look-at behavior by stable target id");

  const revisionBeforeReject = (await state()).revision;
  const countBeforeReject = (await state()).entityCount;
  const rejected = await api("transaction", [
    { op: "spawn", entity: { id: "should-roll-back", type: "box" } },
    { op: "spawn", entity: { id: "heart", type: "sphere" } }
  ]);
  current = await state();
  assert(!rejected.ok && rejected.error.includes("already exists"), "Invalid multi-command transaction returns a useful error");
  assert(current.revision === revisionBeforeReject && current.entityCount === countBeforeReject && !(await api("query", { ids: ["should-roll-back"] })).length, "Rejected transaction preserves revision and rolls back partial edits");

  const invalidCreate = await api("create", {
    schema: "graphysx.agent-world/v2", id: "broken-world", label: "Broken World",
    entities: [{ id: "orphan", parentId: "missing-parent", type: "box" }]
  });
  current = await state();
  assert(!invalidCreate.ok && current.world.id === "qa-ai-garden" && current.entityCount === countBeforeReject, "Rejected complete-world load also restores the prior world atomically");

  const beforeRemove = current.entityCount;
  const removeResult = await api("remove", "tree-1");
  assert(removeResult.ok && removeResult.value.length === 2 && (await state()).entityCount === beforeRemove - 3, "Removing a group removes its descendants as one edit");
  const undoResult = await api("undo");
  assert(undoResult.ok && (await state()).entityCount === beforeRemove, "Undo restores the removed hierarchy");

  assert((await api("save", "qa-ai-garden-snapshot")).ok, "Agent saves a named world snapshot");
  assert((await api("clear", "qa-empty", "QA Empty World")).ok && (await state()).entityCount === 0, "Agent clears the world through the same public API");
  assert((await api("load", "qa-ai-garden-snapshot")).ok && (await state()).entityCount === beforeRemove, "Agent reloads the saved world snapshot");
  await screenshot("01-restored-ai-garden", false);

  const collaborativeWorld = await api("create", {
    schema: "graphysx.agent-world/v2",
    id: "qa-collaborative-plaza",
    label: "QA Collaborative Prefab Plaza",
    environment: { background: "#050e1b", ground: { visible: true, size: 46, color: "#10282f", grid: true, gridColor: "#3ac4c2" } },
    entities: [
      { id: "plaza-ambient", type: "ambient-light", intensity: 0.8, material: { color: "#92cde2" } },
      { id: "plaza-sun", type: "directional-light", intensity: 3.2, transform: { position: [-12, 17, 9] }, material: { color: "#fff0c9" } }
    ]
  });
  assert(collaborativeWorld.ok, "Agent creates a clean host world for prefab composition");
  const baseRevision = collaborativeWorld.revision;
  const collaborativeCommit = await api("commit", {
    id: "qa-plaza-commit",
    actor: { id: "qa-architect", label: "QA Architect", kind: "agent" },
    intent: "Compose five reusable structures into a shared plaza",
    expectedRevision: baseRevision,
    commands: [
      { op: "spawn-prefab", prefabId: "luminous-tree", options: { idPrefix: "qa-tree", position: [-8.5, 0, -4.5] } },
      { op: "spawn-prefab", prefabId: "signal-beacon", options: { idPrefix: "qa-beacon", position: [-8.2, 0, 6] } },
      { op: "spawn-prefab", prefabId: "portal-arch", options: { idPrefix: "qa-portal", position: [0, 0, -7] } },
      { op: "spawn-prefab", prefabId: "orbital-sculpture", options: { idPrefix: "qa-orbital", position: [0, 0, 3.2] } },
      { op: "spawn-prefab", prefabId: "habitat-pod", options: { idPrefix: "qa-habitat", position: [8.2, 0, 1.5], rotationDegrees: [0, -28, 0] } }
    ]
  });
  assert(collaborativeCommit.ok && collaborativeCommit.value.commit.actor.id === "qa-architect" && collaborativeCommit.value.outputs.length === 5, "Actor-aware commit atomically expands five prefab commands");
  current = await state();
  assert(current.entityCount === 43 && (await api("query", { tag: "prefab-root" })).length === 5, "Five prefab roots expand into forty-one reusable entities plus two lights");
  assert(current.recentCommits.at(-1).intent.includes("shared plaza") && current.recentCommits.at(-1).commandCount === 5, "Serializable state exposes actor, intent, revision and command count");
  const commitHistory = await api("history", baseRevision);
  assert(commitHistory.length === 1 && commitHistory[0].worldId === "qa-collaborative-plaza", "Collaboration history can be queried incrementally by revision");

  const committedRevision = current.revision;
  const committedCount = current.entityCount;
  const staleCommit = await api("commit", {
    actor: { id: "stale-scout", label: "Stale Scout", kind: "agent" },
    intent: "Add a beacon from an obsolete observation",
    expectedRevision: baseRevision,
    commands: [{ op: "spawn-prefab", prefabId: "signal-beacon", options: { idPrefix: "stale-beacon", position: [12, 0, 0] } }]
  });
  current = await state();
  assert(!staleCommit.ok && staleCommit.error.includes("Revision conflict"), "Stale collaborative edit receives an explicit revision conflict");
  assert(current.revision === committedRevision && current.entityCount === committedCount && !(await api("query", { ids: ["stale-beacon"] })).length, "Revision conflict leaves the shared world and commit history unchanged");
  assert(current.recentEvents.at(-1).actorId === "stale-scout" && current.recentEvents.at(-1).type === "collaboration.conflict", "Conflict event identifies the stale actor for collaborators");

  const duplicateCommitId = await api("commit", {
    id: "qa-plaza-commit",
    actor: { id: "qa-architect", label: "QA Architect", kind: "agent" },
    intent: "Accidentally reuse an accepted commit id",
    expectedRevision: committedRevision,
    commands: [{ op: "spawn", entity: { id: "duplicate-commit-object", type: "box" } }]
  });
  assert(!duplicateCommitId.ok && duplicateCommitId.error.includes("Commit id already exists") && (await state()).entityCount === committedCount, "Duplicate commit id is rejected before commands mutate the world");

  const directPrefab = await api("spawnPrefab", "signal-beacon", {
    idPrefix: "custom-beacon", position: [11, 0, -5],
    palette: { primary: "#ff92bf", accent: "#ffd078", emissive: "#8b2352" }, tags: ["customized"]
  });
  assert(directPrefab.ok && directPrefab.value.entityIds.length === 8, "Direct spawnPrefab expands one customized prefab and returns every stable entity id");
  assert((await api("query", { ids: ["custom-beacon"] }))[0].tags.includes("customized"), "Prefab options preserve agent-supplied semantic tags");
  const countBeforeDuplicatePrefab = (await state()).entityCount;
  const duplicatePrefab = await api("spawnPrefab", "portal-arch", { idPrefix: "qa-tree", position: [0, 0, 10] });
  assert(!duplicatePrefab.ok && (await state()).entityCount === countBeforeDuplicatePrefab, "Prefab id collision rolls the complete expansion back atomically");
  await api("pause", false);
  await page.evaluate(() => window.advanceTime(800));
  result.states.collaborativePrefabWorld = await state();
  await screenshot("02-collaborative-prefab-world");

  await page.locator('[data-agent-world-action="prefab-plaza"]').click();
  await page.waitForFunction(() => window.__GRAPHYSX__.state()?.world.id === "graphysx-prefab-plaza");
  current = await state();
  assert(current.entityCount === 43 && current.recentCommits.at(-1).actor.id === "studio-composer", "Visible Compose Prefab Plaza control uses the same actor-aware commit path");
  result.states.final = current;
  await screenshot("03-visible-prefab-plaza");
  await page.locator(".agent-commit-list").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await screenshot("04-prefab-collaboration-inspector", false);

  await page.locator('[data-agent-world-starter="glow-garden"]').click();
  await page.waitForFunction(() => window.__GRAPHYSX__.state()?.world.id === "graphysx-glow-garden");
  current = await state();
  assert(current.entityCount === 45 && (await api("query", { tag: "prefab-root" })).length === 6, "Visible Glow Garden card loads the same complete starter recipe");
  await screenshot("05-visible-glow-garden");

  await page.locator('[data-agent-world-starter="signal-outpost"]').click();
  await page.waitForFunction(() => window.__GRAPHYSX__.state()?.world.id === "graphysx-signal-outpost");
  current = await state();
  assert(current.entityCount === 41 && (await api("query", { tag: "prefab-root" })).length === 5, "Visible Signal Outpost card loads five reusable structures in one click");
  const beforeUnknownStarter = current;
  const unknownStarter = await api("loadStarter", "not-a-starter");
  current = await state();
  assert(!unknownStarter.ok && unknownStarter.error.includes("Unknown starter world") && current.world.id === beforeUnknownStarter.world.id && current.entityCount === beforeUnknownStarter.entityCount, "Unknown starter ids fail clearly without replacing the active world");
  result.states.starterWorld = current;
  await screenshot("06-visible-signal-outpost");

  await page.locator('[data-agent-world-starter="signal-trail"]').first().click();
  await page.waitForFunction(() => window.__GRAPHYSX__.state()?.world.id === "graphysx-signal-trail");
  current = await state();
  const signalNodeIds = ["trail-beacon-west:lens", "trail-beacon-center:lens", "trail-beacon-east:lens"];
  assert(current.entityCount === 45 && (await api("query", { tag: "signal-node" })).length === 3, "Signal Trail loads as a compact forty-five-entity playable starter with three semantic controls");
  assert((await api("query", { tag: "signal-energy" })).length === 12 && (await api("query", { tag: "signal-energy" })).every((entity) => !entity.visible), "All twelve beacon energy targets begin dormant");
  assert(await page.locator('[data-agent-signal-progress="0"]').count() === 1, "Visible objective panel starts at zero of three signals");

  assert((await api("interact", signalNodeIds[0])).ok, "Agent awakens the west signal through the public interaction API");
  await page.waitForFunction(() => document.querySelector('[data-agent-signal-progress="1"]'));
  assert((await api("query", { ids: ["trail-beacon-west:ring-1", "trail-beacon-west:ring-2", "trail-beacon-west:ring-3", "trail-beacon-west:light"] })).every((entity) => entity.visible), "West beacon visibly powers all four declared energy targets");

  await page.locator(`[data-agent-world-interact="${signalNodeIds[1]}"]`).click();
  await page.waitForFunction(() => document.querySelector('[data-agent-signal-progress="2"]'));
  assert((await api("query", { ids: ["trail-beacon-center:ring-1", "trail-beacon-center:ring-2", "trail-beacon-center:ring-3", "trail-beacon-center:light"] })).every((entity) => entity.visible), "Accessible human control awakens the center beacon through the same runtime path");

  assert((await api("interact", signalNodeIds[2])).ok, "Agent awakens the final east signal");
  await page.waitForFunction(() => document.querySelector('.agent-signal-challenge.is-complete[data-agent-signal-progress="3"]'));
  assert((await api("query", { tag: "signal-energy" })).every((entity) => entity.visible), "All generic signal-energy entities report visible at completion");
  result.states.signalTrailComplete = await state();
  await screenshot("07-signal-trail-complete");

  await api("interact", signalNodeIds[0]);
  await page.waitForFunction(() => document.querySelector('[data-agent-signal-progress="2"]'));
  assert(await page.locator('.agent-signal-challenge.is-complete').count() === 0, "Powering a beacon back down reverses completion without hidden quest state");
  await page.locator('.agent-signal-challenge [data-agent-world-starter="signal-trail"]').click();
  await page.waitForFunction(() => document.querySelector('[data-agent-signal-progress="0"]'));
  assert((await api("query", { tag: "signal-energy" })).every((entity) => !entity.visible), "Restart reloads the same recipe with every signal dormant and ready to replay");

  assert(errors.length === 0, "Agent World Studio browser console and page errors remain clean");
} finally {
  result.states.final ??= await state().catch(() => null);
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(result, null, 2));
  await browser.close();
}

console.log(JSON.stringify({ assertions: result.assertions.length, errors: errors.length, outputDir }, null, 2));

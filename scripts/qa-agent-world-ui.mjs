import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const url = process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4177/";
const outputDir = path.resolve("output/playwright/agent-world-human-editor");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"]
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
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
const state = () => api("state");
const query = (filter) => api("query", filter);
const editorMessage = () => page.locator("[data-agent-editor-message]").textContent();
const setField = async (scope, name, value) => {
  const locator = page.locator(`[data-agent-${scope}-field="${name}"]`);
  const tag = await locator.evaluate((element) => element.tagName);
  if (tag === "SELECT") await locator.selectOption(String(value));
  else await locator.fill(String(value));
};
const setVector = async (scope, name, values) => {
  for (const [index, axis] of ["x", "y", "z"].entries()) {
    await setField(scope, `${name}-${axis}`, values[index]);
  }
};
const openJsonWorkbench = async () => {
  const workbench = page.locator(".agent-json-workbench");
  await workbench.evaluate((element) => { element.open = true; });
  return workbench;
};
const selectEntity = async (id) => {
  await page.locator(`[data-agent-authoring-action="select"][data-entity-id="${id}"]`).first().click();
  await page.locator(`[data-selected-entity="${id}"]`).waitFor();
};
const createEntity = async ({ type, id, label, tags, position, configure }) => {
  await setField("create", "type", type);
  await setField("create", "id", id);
  await setField("create", "label", label);
  await setField("create", "tags", tags);
  await setVector("create", "position", position);
  if (configure) await configure();
  await page.locator('[data-agent-authoring-action="create"]').click();
  await page.locator(`[data-selected-entity="${id}"]`).waitFor();
  assert((await editorMessage()) === `Created ${id}.`, `Friendly editor creates ${id}`);
};

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX__ && window.render_game_to_text);
  assert(await api("open"), "Public entry point opens Agent World Studio");
  await page.locator(".agent-authoring-studio").waitFor();
  assert(await page.getByText("Human + Agent Parity", { exact: true }).isVisible(), "Studio exposes the shared World Editor");

  const bridgeManifest = await page.evaluate(() => window.__GRAPHYSX_AGENT_BRIDGE__.manifest());
  assert(bridgeManifest.schema === "graphysx.agent-tool-bridge/v1", "External agents can discover the versioned tool bridge");
  assert(bridgeManifest.transports.includes("direct") && bridgeManifest.transports.includes("window.postMessage"), "Bridge advertises direct and same-origin message transports");
  assert(["state", "spawn", "select", "textures", "importLegacyXml", "levels.transaction"].every((path) => bridgeManifest.tools.some((tool) => tool.path === path)), "Bridge manifest covers world, texture, migration, selection, and multi-level tools");
  const bridgeState = await page.evaluate(() => window.__GRAPHYSX_AGENT_BRIDGE__.call("state"));
  assert(bridgeState.schema === "graphysx.agent-world-state/v2", "Direct bridge calls return the serializable world state");
  const rejectedBridgeCall = await page.evaluate(() => window.__GRAPHYSX_AGENT_BRIDGE__.request({
    schema: "graphysx.agent-tool-request/v1",
    id: "qa-unknown-tool",
    method: "not.a.tool",
    args: []
  }));
  assert(!rejectedBridgeCall.ok && rejectedBridgeCall.error.includes("Unknown GraphysX agent tool"), "Bridge reports unknown tools as structured errors");
  const messageResponse = await page.evaluate(() => new Promise((resolve, reject) => {
    const id = "qa-post-message-state";
    const timeout = window.setTimeout(() => reject(new Error("Timed out waiting for agent bridge response")), 2_000);
    const onMessage = (event) => {
      if (event.data?.schema !== "graphysx.agent-tool-response/v1" || event.data.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(event.data);
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ schema: "graphysx.agent-tool-request/v1", id, method: "state", args: [] }, window.location.origin);
  }));
  assert(messageResponse.ok && messageResponse.value.schema === "graphysx.agent-world-state/v2", "Same-origin postMessage agents can invoke the bridge");
  await page.evaluate(() => {
    window.__GRAPHYSX_QA_BRIDGE_EVENTS__ = 0;
    window.__GRAPHYSX_QA_UNSUBSCRIBE__ = window.__GRAPHYSX_AGENT_BRIDGE__.subscribe(() => {
      window.__GRAPHYSX_QA_BRIDGE_EVENTS__ += 1;
    });
  });

  const textureLibrary = await api("textures");
  assert(textureLibrary.length === 11 && textureLibrary.every((texture) => texture.id && texture.url && texture.description), "Agent discovers the complete compact semantic texture library with stable IDs and usage guidance");
  assert(textureLibrary.some((texture) => texture.id === "checker" && texture.defaultRepeat[0] === 2), "Texture discovery includes repeat defaults for physics-readable checker surfaces");

  const legacyXml = `<?xml version="1.0"?><World Name="QA Legacy World">
    <Object3D Type="8" Name="Legacy Ball" Enabled="true" masse="1" MeshControlled="false" NewtonMat="0"><Pos x="1" y="4" z="-2"/><Scale x="1.5" y="1.5" z="1.5"/><TextureName>TwoWay</TextureName></Object3D>
    <Object3D><Type>11</Type><Name>Archive Craft</Name><Enabled>true</Enabled><masse>3</masse><MeshControlled>false</MeshControlled><Pos><x>-2</x><y>2</y><z>0</z></Pos><Scale><x>3</x><y>1</y><z>2</z></Scale><PathToMesh>Media\\Vehicles\\craft.x</PathToMesh></Object3D>
  </World>`;
  const legacyImport = await api("importLegacyXml", legacyXml, { id: "qa-legacy-world", label: "QA Legacy Migration" });
  assert(legacyImport.ok && legacyImport.value.sourceEntityCount === 2 && legacyImport.value.convertedEntityCount === 2, "Agent converts both archived XML record layouts through one migration tool");
  const legacyBall = (await query({ ids: ["legacy-ball"] }))[0];
  assert(legacyBall.type === "sphere" && legacyBall.physics.mode === "dynamic" && legacyBall.material.texture.id === "two-way", "Legacy physical primitives preserve mass semantics and known archive textures");
  const archiveCraft = (await query({ ids: ["archive-craft"] }))[0];
  assert(archiveCraft.type === "box" && archiveCraft.tags.includes("legacy:unresolved-model") && legacyImport.value.warnings.length === 1, "Unavailable legacy custom meshes remain honest visible proxies with a migration warning");

  const sketchbook = await api("loadStarter", "physics-sketchbook");
  assert(sketchbook.ok && sketchbook.value.entityCount === 16, "One call creates the complete editable Physics Sketchbook");
  assert((await query({ tag: "physics:dynamic" })).length === 4, "Physics Sketchbook exposes four semantic dynamic bodies to agents");
  assert((await query({ ids: ["ramp"] }))[0].material.texture.id === "checker", "Agent state reports the ramp's stable texture ID and transform settings");
  assert((await query({ ids: ["earth-model"] }))[0].material.texture.id === "earth", "The same material contract illustrates a textured planetary concept");
  const labAgent = (await query({ ids: ["lab-agent"] }))[0];
  assert(labAgent.type === "agent" && labAgent.agent.role === "physics explainer" && labAgent.agent.capabilities.includes("interact"), "Visible agent entities expose role, status, perception, and semantic capabilities");
  const velocityBeforeImpulse = (await query({ ids: ["ramp-ball"] }))[0].physics.linearVelocity;
  const impulseReceipt = await api("interact", "impulse-pad");
  const velocityAfterImpulse = (await query({ ids: ["ramp-ball"] }))[0].physics.linearVelocity;
  assert(impulseReceipt.ok && impulseReceipt.value.type === "apply-impulse" && velocityAfterImpulse[0] > velocityBeforeImpulse[0] + 4, "Human/agent interaction can apply a real observable impulse to a dynamic body");
  await api("pause", true);
  const axesBefore = await query({ ids: ["concept-axis-x", "concept-axis-z"] });
  await api("interact", "coordinate-board");
  assert((await query({ ids: ["concept-axis-x", "concept-axis-z"] })).every((axis, index) => axis.visible !== axesBefore[index].visible), "Agent interaction toggles the same visible coordinate explanation a person can click");
  await api("interact", "coordinate-board");
  const sketchCanvas = await page.locator("canvas").first().boundingBox();
  if (sketchCanvas) await page.screenshot({ path: path.join(outputDir, "physics-sketchbook.png"), clip: sketchCanvas });

  const humanWorld = {
    schema: "graphysx.agent-world/v2",
    id: "human-agent-parity",
    label: "Human + Agent Workshop",
    environment: {
      background: "#071522",
      ground: { visible: true, size: 32, color: "#102d33", grid: true, gridColor: "#36bfc4" },
      physics: { gravity: [0, -9.81, 0] }
    },
    entities: [
      { id: "workshop-ambient", type: "ambient-light", intensity: 0.8, material: { color: "#b6ddff" }, tags: ["lighting", "human-authored"] }
    ]
  };
  await openJsonWorkbench();
  await setField("json", "world", JSON.stringify(humanWorld, null, 2));
  await page.locator('[data-agent-authoring-action="apply-world"]').click();
  let current = await state();
  assert(current.world.id === humanWorld.id && current.entityCount === 1, "Human applies a complete world through the same v2 definition accepted from agents");
  assert((await editorMessage()) === "Loaded world human-agent-parity.", "Complete-world UI reports a useful receipt");
  assert(await page.evaluate(() => window.__GRAPHYSX_QA_BRIDGE_EVENTS__ > 0), "Bridge subscribers receive state-change events after human edits");

  if (!current.paused) await page.locator('[data-agent-world-action="pause"]').click();
  assert((await state()).paused, "Human pause control reaches the deterministic runtime clock");

  await createEntity({
    type: "box",
    id: "human-crate",
    label: "Human Physics Crate",
    tags: "human-authored, gameplay, physics",
    position: [2, 5, -1],
    configure: async () => {
      await setField("create", "width", 1.8);
      await setField("create", "height", 1.2);
      await setField("create", "depth", 1.4);
      await setField("create", "color", "#ff9f66");
      await setField("create", "physics-mode", "dynamic");
      await setField("create", "mass", 2.5);
      await setField("create", "physics-material", "ball");
      await setVector("create", "velocity", [0.5, 1, -0.25]);
      await page.locator('[data-agent-texture-choice="checker"][data-agent-texture-scope="create"]').click();
      await setField("create", "texture-repeat-x", 3);
      await setField("create", "texture-repeat-y", 2);
    }
  });
  let entity = (await query({ ids: ["human-crate"] }))[0];
  assert(entity.type === "box" && entity.physics.mode === "dynamic" && entity.physics.mass === 2.5, "Agent query sees the UI-created dynamic primitive and physical mass");
  assert(JSON.stringify(entity.physics.linearVelocity) === JSON.stringify([0.5, 1, -0.25]), "Agent query sees the velocity authored in the UI");
  assert(entity.material.texture.id === "checker" && entity.material.texture.repeat[0] === 3, "Agent query sees the texture and repeat authored visually by a person");

  await setField("edit", "label", "Shared Physics Crate");
  await setField("edit", "tags", "human-authored, gameplay, physics, agent-visible");
  await setVector("edit", "position", [3, 6, -2]);
  await setField("edit", "color", "#56d9ff");
  await page.locator('[data-agent-texture-choice="eroded-metal"][data-agent-texture-scope="edit"]').click();
  await setField("edit", "roughness", 0.35);
  await setField("edit", "metalness", 0.7);
  await page.locator('[data-agent-authoring-action="update"]').click();
  entity = (await query({ ids: ["human-crate"] }))[0];
  assert(entity.label === "Shared Physics Crate" && entity.tags.includes("agent-visible"), "Agent query immediately sees friendly inspector edits");
  assert(JSON.stringify(entity.position) === JSON.stringify([3, 6, -2]), "Human transform edit and agent world coordinates are identical");
  assert(entity.material.texture.id === "eroded-metal" && entity.material.metalness === 0.7, "Visual material-browser edits reach the same textured API state");

  await createEntity({
    type: "model",
    id: "human-cottage",
    label: "Recovered Cottage",
    tags: "human-authored, archive-model",
    position: [-5, 0, -2],
    configure: async () => {
      await setField("create", "asset", "port-cottage");
      await setField("create", "fit-size", 5.5);
      await setField("create", "physics-mode", "static");
      await setField("create", "physics-material", "wall");
      await setField("create", "width", 5);
      await setField("create", "height", 4);
      await setField("create", "depth", 4);
    }
  });
  await page.waitForFunction(() => window.__GRAPHYSX__.query({ ids: ["human-cottage"] })[0]?.asset?.status === "ready");
  const exportedModel = (await api("export")).entities.find((candidate) => candidate.id === "human-cottage");
  assert(exportedModel.asset.id === "port-cottage" && exportedModel.physics.mode === "static", "Agent export preserves the recovered model asset and UI-authored collider");
  assert((await query({ ids: ["human-cottage"] }))[0].asset.status === "ready", "Human-created recovered model reaches an agent-observable ready state");

  await createEntity({
    type: "spline",
    id: "human-path",
    label: "Shared Flight Path",
    tags: "human-authored, navigation, spline",
    position: [0, 0, 0],
    configure: async () => {
      await setField("create", "color", "#78f2c5");
      await setField("create", "path", JSON.stringify([[-6, 1, 4], [-2, 4, -4], [3, 3, -5], [6, 1, 4]], null, 2));
    }
  });
  const exportedSpline = (await api("export")).entities.find((candidate) => candidate.id === "human-path");
  assert(exportedSpline.path.closed && exportedSpline.path.points.length === 4, "Agent export sees the complete UI-authored spline path");
  await setField("edit", "behavior", JSON.stringify({ id: "path-turn", type: "spin", axis: "y", speedDegrees: 8 }, null, 2));
  await page.locator('[data-agent-authoring-action="attach-behavior"]').click();
  entity = (await query({ ids: ["human-path"] }))[0];
  assert(entity.behaviors.some((behavior) => behavior.id === "path-turn"), "Agent query sees a behavior attached in the human inspector");
  await page.locator('[data-agent-authoring-action="detach-behavior"][data-behavior-id="path-turn"]').click();
  assert(!(await query({ ids: ["human-path"] }))[0].behaviors.length, "Human behavior removal uses the agent detach path");

  await createEntity({
    type: "point-light",
    id: "human-lamp",
    label: "Shared Cyan Lamp",
    tags: "human-authored, lighting, interactive-target",
    position: [3, 5, 2],
    configure: async () => {
      await setField("create", "color", "#42dcff");
      await setField("create", "intensity", 6.5);
      await setField("create", "distance", 18);
    }
  });
  entity = (await query({ ids: ["human-lamp"] }))[0];
  result.states.light = entity;
  assert(entity.type === "point-light", "Agent query sees the point light authored by a person");
  assert(entity.intensity === 6.5 && entity.distance === 18, "Agent query sees the light intensity and distance authored by a person");

  await createEntity({
    type: "agent",
    id: "human-guide",
    label: "Shared Spatial Guide",
    tags: "human-authored, agent-avatar, guide",
    position: [-1, 0, 4],
    configure: async () => {
      await setField("create", "height", 2.1);
      await setField("create", "radius", 0.5);
      await setField("create", "agent-role", "spatial interpreter");
      await setField("create", "agent-status", "ready to collaborate");
      await setField("create", "agent-perception", 9);
      await setField("create", "agent-capabilities", "observe, explain, interact");
      await page.locator('[data-agent-texture-choice="abstract-cubes"][data-agent-texture-scope="create"]').click();
    }
  });
  const guide = (await query({ ids: ["human-guide"] }))[0];
  assert(guide.type === "agent" && guide.agent.role === "spatial interpreter", "A person creates a visible semantic agent participant without JSON");
  assert(guide.agent.perceptionRadius === 9 && guide.agent.capabilities.includes("explain"), "Agent identity preserves perception and collaboration capabilities");

  await selectEntity("human-crate");
  await setField("edit", "interaction-type", "toggle-visibility");
  await setField("edit", "interaction-label", "Toggle shared lamp");
  await setField("edit", "interaction-targets", "human-lamp");
  await page.locator('[data-agent-authoring-action="add-interaction"]').click();
  assert((await query({ ids: ["human-crate"] }))[0].interactions[0].targetIds[0] === "human-lamp", "Agent discovers an interaction authored in the human inspector");
  await setField("edit", "interaction-type", "apply-impulse");
  await setField("edit", "interaction-label", "Nudge the shared crate");
  await setField("edit", "interaction-targets", "human-crate");
  await setVector("edit", "interaction-impulse", [2, 3, 0]);
  await page.locator('[data-agent-authoring-action="add-interaction"]').click();
  const impulseInteraction = (await query({ ids: ["human-crate"] }))[0].interactions.find((interaction) => interaction.type === "apply-impulse");
  assert(impulseInteraction && impulseInteraction.impulse[1] === 3, "Friendly interaction composer adds a typed physics impulse without hand-editing JSON");
  const crateVelocityBefore = (await query({ ids: ["human-crate"] }))[0].physics.linearVelocity;
  await api("interact", "human-crate", impulseInteraction.id);
  const crateVelocityAfter = (await query({ ids: ["human-crate"] }))[0].physics.linearVelocity;
  assert(crateVelocityAfter[1] > crateVelocityBefore[1], "Agent invokes the user-authored impulse and observes the physics result");
  await page.locator('[data-agent-world-interact="human-crate"]').first().click();
  assert(!(await query({ ids: ["human-lamp"] }))[0].visible, "Accessible human interaction and agent-observed visibility share one action path");
  await api("interact", "human-crate");
  assert((await query({ ids: ["human-lamp"] }))[0].visible, "Agent can operate the exact interaction created by the person");

  await openJsonWorkbench();
  const transaction = [{
    op: "spawn",
    entity: {
      id: "human-transaction-orb",
      label: "Transaction Orb",
      type: "sphere",
      geometry: { radius: 0.65 },
      transform: { position: [0, 4, 2] },
      material: { color: "#b08cff" },
      tags: ["human-authored", "json-transaction"]
    }
  }];
  await setField("json", "transaction", JSON.stringify(transaction, null, 2));
  await page.locator('[data-agent-authoring-action="run-transaction"]').click();
  assert((await query({ tag: "json-transaction" })).length === 1, "Human JSON transaction creates an entity visible to agent queries");

  current = await state();
  await openJsonWorkbench();
  const changeSet = {
    id: "human-reviewed-change",
    actor: { id: "studio-human", label: "Studio Human", kind: "human" },
    intent: "Mark the transaction orb as reviewed in the shared world",
    expectedRevision: current.revision,
    commands: [{ op: "update", id: "human-transaction-orb", patch: { tags: ["human-authored", "json-transaction", "human-reviewed"] } }]
  };
  await setField("json", "commit", JSON.stringify(changeSet, null, 2));
  await page.locator('[data-agent-authoring-action="run-commit"]').click();
  current = await state();
  assert(current.recentCommits.at(-1).actor.kind === "human" && current.recentCommits.at(-1).id === "human-reviewed-change", "Agent state attributes a UI commit to its human actor");
  assert((await query({ tag: "human-reviewed" })).length === 1, "Revision-guarded UI commit updates the shared query surface");

  const revisionBeforeInvalid = current.revision;
  await openJsonWorkbench();
  await setField("json", "transaction", JSON.stringify([{ op: "spawn", entity: { id: "human-crate", type: "box" } }], null, 2));
  await page.locator('[data-agent-authoring-action="run-transaction"]').click();
  assert(await page.locator("[data-agent-editor-message].is-error").isVisible(), "Invalid human JSON displays a clear editor error");
  assert((await state()).revision === revisionBeforeInvalid, "Rejected human transaction leaves the shared revision unchanged");

  await openJsonWorkbench();
  await setField("json", "snapshot", "qa-human-parity-snapshot");
  await page.locator('[data-agent-authoring-action="save-snapshot"]').click();
  assert((await state()).savedWorlds.includes("qa-human-parity-snapshot"), "Named UI snapshot appears in agent-visible state");
  const savedCount = (await state()).entityCount;
  await page.locator('[data-agent-world-action="clear"]').click();
  assert((await state()).entityCount === 0, "Human clear control empties the shared world");
  await openJsonWorkbench();
  await setField("json", "snapshot", "qa-human-parity-snapshot");
  await page.locator('[data-agent-authoring-action="load-snapshot"]').click();
  current = await state();
  assert(current.entityCount === savedCount && current.world.id === "human-agent-parity", "UI snapshot load restores the same world agents observe");

  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-agent-authoring-action="download-world"]').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  assert(download.suggestedFilename() === "human-agent-parity.graphysx.json", "Portable world download uses a recognizable GraphysX filename");
  assert(Boolean(downloadPath), "Portable world download produces a readable file");
  const downloadedText = fs.readFileSync(downloadPath, "utf8");
  const downloadedWorld = JSON.parse(downloadedText);
  assert(downloadedWorld.schema === "graphysx.agent-world/v2" && downloadedWorld.entities.length === savedCount, "Downloaded JSON contains the complete validated v2 world");
  await page.locator("[data-agent-world-file-input]").setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/json",
    buffer: Buffer.from(downloadedText)
  });
  await page.waitForFunction(() => document.querySelector("[data-agent-editor-message]")?.textContent?.startsWith("Imported "));
  current = await state();
  assert(current.world.id === "human-agent-parity" && current.entityCount === savedCount, "File import round-trips the complete world through the runtime validator");
  assert((await editorMessage()).includes("Imported human-agent-parity"), "File import reports a useful receipt");

  await page.locator("[data-agent-world-file-input]").setInputFiles({
    name: "qa-legacy-ui.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(`<?xml version="1.0"?><World><Object3D Type="8" Name="UI Legacy Orb" masse="2"><Pos x="0" y="5" z="0"/><Scale x="1" y="1" z="1"/><TextureName>TwoWay</TextureName></Object3D></World>`)
  });
  await page.waitForFunction(() => document.querySelector("[data-agent-editor-message]")?.textContent?.includes("qa-legacy-ui.xml"));
  assert((await state()).world.id === "qa-legacy-ui" && (await query({ ids: ["ui-legacy-orb"] }))[0].material.texture.id === "two-way", "Human XML file import uses the same migration path and produces an agent-observable v2 world");
  await page.locator("[data-agent-world-file-input]").setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/json",
    buffer: Buffer.from(downloadedText)
  });
  await page.waitForFunction(() => window.__GRAPHYSX__.state().world.id === "human-agent-parity");
  current = await state();

  const selected = await page.evaluate(() => window.__GRAPHYSX_AGENT_BRIDGE__.call("select", ["human-crate"]));
  assert(selected[0] === "human-crate" && (await state()).selectedIds[0] === "human-crate", "External agent selection is shared with the editor state");
  await page.locator('[data-selected-entity="human-crate"]').waitFor();
  assert(await page.locator(".agent-transform-toolbar").isVisible(), "A selected 3D entity exposes compact transform controls");
  await page.locator('[data-agent-transform-mode="rotate"]').click();
  assert(await page.locator('[data-agent-transform-mode="rotate"]').evaluate((element) => element.classList.contains("is-selected")), "Transform toolbar switches to rotate mode");
  await page.keyboard.press("w");
  assert(await page.locator('[data-agent-transform-mode="translate"]').evaluate((element) => element.classList.contains("is-selected")), "W shortcut returns the viewport gizmo to move mode");
  await page.locator("[data-agent-transform-space]").click();
  assert((await page.locator("[data-agent-transform-space] span").textContent()) === "local", "Transform toolbar switches between world and local space");

  const transformBefore = (await query({ ids: ["human-crate"] }))[0];
  const transformRevision = (await state()).revision;
  await page.mouse.move(700, 339);
  await page.mouse.down();
  await page.mouse.move(765, 339, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction((revision) => window.__GRAPHYSX__.state().revision > revision, transformRevision);
  const transformAfter = (await query({ ids: ["human-crate"] }))[0];
  assert(transformAfter.position[0] !== transformBefore.position[0], "Dragging a colored 3D gizmo handle commits a snapped entity transform");
  assert((await state()).selectedIds[0] === "human-crate", "Viewport transform keeps the entity selected for continued editing");

  const canvasBox = await page.locator("canvas").first().boundingBox();
  if (canvasBox) await page.screenshot({ path: path.join(outputDir, "human-authored-3d-world.png"), clip: canvasBox });
  await page.locator(".agent-authoring-heading").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, "friendly-entity-inspector.png") });
  await page.locator(".agent-entity-inspector .agent-material-editor").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, "material-texture-browser.png") });
  await page.locator(".agent-create-entity > summary").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, "friendly-add-entity.png") });
  const jsonWorkbench = await openJsonWorkbench();
  await jsonWorkbench.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, "advanced-json-workbench.png") });

  const textState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  result.states.final = current;
  result.states.text = textState.agentWorld;
  assert(textState.mode === "world-api-lab" && textState.agentWorld.world.id === current.world.id, "render_game_to_text names the exact UI-authored world");
  assert(textState.agentWorld.entityCount === current.entityCount, "Text accessibility state and public API report the same entity count");
  assert(errors.length === 0, "Human editor flow emits no browser errors");
} catch (error) {
  result.failure = error instanceof Error ? error.stack : String(error);
  try {
    await page.screenshot({ path: path.join(outputDir, "failure.png"), fullPage: true });
  } catch {
    // Keep the original failure when the page cannot be captured.
  }
} finally {
  result.summary = {
    passed: result.assertions.filter((entry) => entry.pass).length,
    failed: result.assertions.filter((entry) => !entry.pass).length,
    errors: errors.length
  };
  fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.summary));
  if (result.failure) console.error(result.failure);
  await browser.close();
}

if (result.failure || result.summary.failed || result.summary.errors) process.exitCode = 1;

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const url = process.env.GRAPHYSX_URL ?? "http://127.0.0.1:4176/";
const outputDir = path.resolve("output/playwright/r13-restoration-final");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => errors.push({ type: "page", text: String(error) }));
page.on("requestfailed", (request) => errors.push({
  type: "request",
  text: `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown request failure"}`
}));

const result = { url, assertions: [], states: {} };
const assert = (condition, message) => {
  result.assertions.push({ pass: Boolean(condition), message });
  if (!condition) throw new Error(message);
};
const debug = (expression, argument) =>
  page.evaluate(({ expression, argument }) => {
    const api = window.__GRAPHYSX_DEBUG__;
    if (!api) throw new Error("GraphysX debug API is unavailable");
    return api[expression](argument);
  }, { expression, argument });
const textState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const screenshot = (name) => page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__ && window.render_game_to_text);
  await screenshot("00-home-project-families");
  const homeState = await textState();
  assert(homeState.build === "revival-2026.07.18-r13", "Visible/text build identity reports the r13 complete-restoration wave");
  const worldFamilies = await debug("worldFamilyRaceIds");
  const worldRoster = Object.values(worldFamilies).flat();
  assert(worldRoster.length === 6 && new Set(worldRoster).size === 6 && worldRoster.includes("dominus-port"), "Every recovery-progress entry belongs to one visible family, including the labeled modern Dominus visit");
  assert(await debug("openSceneIndex"), "Complete Scene Index remains directly reachable");
  result.states.sceneIndex = await textState();
  assert(result.states.sceneIndex.sceneCensus.total === 54, "Scene census includes the restored Unity Arena without counting revision aliases or vendor samples");
  assert(
    result.states.sceneIndex.sceneCensus.byStatus.RESTORED === 7 &&
      result.states.sceneIndex.sceneCensus.byStatus.PARTIAL === 47 &&
      result.states.sceneIndex.sceneCensus.byStatus.PIPELINE === 0 &&
      result.states.sceneIndex.sceneCensus.byStatus.MISSING === 0,
    "Scene census has no queued or missing scenes after Playground, Blender Level 1, Maison, and Unity Arena completion"
  );

  assert(await debug("openThreejsPlayground"), "Three.js Playground opens as a distinct Archived World from its Home destination");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.threejsPlaygroundState()?.ready, undefined, { timeout: 30000 });
  result.states.threejsPlayground = await textState();
  const playground = result.states.threejsPlayground.threejsPlayground;
  assert(playground.source.assetCount === 9 && playground.source.totalBytes === 3712102, "Playground exposes all nine exact runtime assets and their byte total");
  assert(playground.sky.ready && playground.sky.faceCount === 6 && playground.sky.size === 10000, "Playground restores the six-face 10000-unit Asteroids sky");
  assert(playground.airplane.loaded && playground.airplane.scale === 10 && playground.airplane.orbitRadius === 5, "Playground restores the archived GLB airplane scale and orbit");
  assert(playground.morphSpheres.count === 3 && playground.morphSpheres.shaderActive, "Playground restores all three exact morph-shader spheres");
  assert(playground.earthSpheres.count === 3 && playground.earthSpheres.sharedEarthTexture, "Playground restores the Earth/Mars/Moon source-texture composition");
  assert(playground.terrain.vertexCount === 121 && playground.terrain.raycastEnabled, "Playground restores its 10x10 procedural terrain and raycast surface");
  const airplaneBefore = playground.airplane.position;
  await page.evaluate(() => window.advanceTime(1000));
  const playgroundAfter = (await textState()).threejsPlayground;
  assert(JSON.stringify(playgroundAfter.airplane.position) !== JSON.stringify(airplaneBefore), "Playground airplane and source frame animation advance in the integrated runtime");
  assert(playgroundAfter.animatedLight.active && playgroundAfter.animatedLight.intensity !== playground.animatedLight.intensity, "Playground archived spotlight oscillation advances with source timing");
  assert(await debug("orbitThreejsPlayground", 0.25), "Playground inspection orbit is controllable without changing the authored composition");
  assert(await debug("resetThreejsPlayground"), "Playground composition time and disclosed inspection camera reset deterministically");
  await screenshot("00a-threejs-playground");

  assert(await debug("openBallzBlenderLevel1"), "BallZ / Blender Level 1 opens from the complete main UI");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.ballzBlenderLevel1State()?.ready, undefined, { timeout: 30000 });
  result.states.ballzBlenderLevel1 = await textState();
  assert(result.states.ballzBlenderLevel1.ballzBlenderLevel1.restorationStatus === "RESTORED", "Blender Level 1 is complete at its honest authored-geometry scope");
  assert(result.states.ballzBlenderLevel1.ballzBlenderLevel1.source.authored.vertices === 356, "Blender Level 1 retains the best source revision");
  assert(result.states.ballzBlenderLevel1.player === undefined, "Blender Level 1 does not invent race gameplay");

  assert(await debug("openMaisonExplorer"), "Maison Explorer opens from the complete main UI");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.maisonExplorerState()?.ready, undefined, { timeout: 30000 });
  result.states.maisonExplorer = await textState();
  assert(result.states.maisonExplorer.maisonExplorer.restorationStatus === "RESTORED", "Maison is complete as one House/Kitchen explorer");
  assert(result.states.maisonExplorer.maisonExplorer.subspaces.length === 2, "Maison preserves both source-separated subspaces");

  assert(await debug("openArenaArchive"), "The newly found Unity Arena opens as its own archived environment");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.arenaArchiveState()?.loadStatus === "ready", undefined, { timeout: 30000 });
  result.states.arenaArchive = await textState();
  const arena = result.states.arenaArchive.arenaArchive;
  assert(arena.restorationStatus === "RESTORED" && arena.source.authored.vertices === 48 && arena.source.authored.faces === 44, "Unity Arena retains its complete authored geometry scope");
  assert(arena.runtime.material.atlasLoaded && arena.source.atlas.dimensions[0] === 1024, "Unity Arena binds its exact hand-painted atlas");
  assert(arena.camera.profile === "overview" && result.states.arenaArchive.player === undefined, "Unity Arena opens as an isolated readable visit");
  assert(await debug("setArenaArchiveCamera", "source"), "Unity Arena exposes its exact saved source camera");
  assert((await textState()).arenaArchive.camera.sourceTransformExact, "Unity Arena text state identifies the exact source transform");
  assert(await debug("resetArenaArchive"), "Unity Arena resets to its disclosed overview");
  await screenshot("00c-unity-arena-archive");

  assert(await debug("openInputDeviceLab"), "Input & Device Lab is a directly reachable canonical Lab");
  result.states.inputDevice = await textState();
  assert(result.states.inputDevice.inputDevice.transport === "simulation" && !result.states.inputDevice.inputDevice.armed, "Device lab opens simulation-first and disarmed");
  assert(result.states.inputDevice.inputDevice.io.length === 8 && result.states.inputDevice.inputDevice.schedules.length === 4, "Device lab exposes all eight Atmel channels and four schedules");
  assert((await debug("sweepDeviceSonar")) === 182, "Integrated device lab preserves the complete two-pass sonar sweep");
  assert(result.states.inputDevice.player === undefined && result.states.inputDevice.race === undefined, "Device diagnostics remain isolated from BallZ actors and progression");
  await screenshot("00b-input-device-lab");

  assert(await debug("openSkyboxSelector"), "Skybox Selector opens from the same navigation path as its Home card");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.skyboxSelectorState()?.loadStatus === "ready");
  assert(await debug("selectSkybox", "clearblue"), "ClearBlue cube starts the archived zoom transition");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.skyboxSelectorState()?.phase === "panorama");
  result.states.skybox = await textState();
  assert(result.states.skybox.selector.activeId === "clearblue", "Skybox Selector reaches the ClearBlue panorama");
  assert(result.states.skybox.selector.camera.fovDegrees === 90, "ClearBlue panorama uses the wider source-aware lens instead of magnifying 512 px faces at 45 degrees");
  await screenshot("01-skybox-clearblue-panorama");

  assert(await debug("openCarSelector"), "Car Selector opens from the same navigation path as its Home card");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.carSelectorState()?.loadStatus === "ready");
  await page.waitForFunction(
    () => (window.__GRAPHYSX_DEBUG__.carSelectorState()?.car.currentPosition[1] ?? 100) < 10,
    undefined,
    { timeout: 20000 }
  );
  result.states.car = await textState();
  assert(result.states.car.selector.terrain.ready, "Car Selector height terrain is ready");
  assert(result.states.car.selector.car.wheelCount === 4, "Car Selector exposes the four-wheel Impreza");
  assert(result.states.car.selector.car.currentPosition[1] < 10, "Car Selector Impreza settles from y=100 onto the recovered terrain");
  assert(
    result.states.car.selector.camera.lookAt[1] < result.states.car.selector.camera.position[1] - 0.2,
    "Car Selector retains its downward archive view instead of snapping above the car"
  );
  assert(result.states.car.selector.selectionImplementedInArchive === false, "Car Selector does not invent a commit action for the empty archive callback");
  await screenshot("02-car-selector-impreza");

  assert(await debug("openVehiclePackGallery"), "GT4 and Low Cobra open in a separate non-driving source gallery");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.vehiclePackState()?.loadStatus === "ready", undefined, { timeout: 60000 });
  result.states.vehicleGt4 = await textState();
  const gt4 = result.states.vehicleGt4.vehiclePack;
  assert(gt4.objectCount === 14 && gt4.vertexCount === 10740 && gt4.triangleCount === 8345, "GT4 preserves all exact 3DS object and geometry totals");
  assert(gt4.materialCount === 2 && gt4.textureReferences.join(",") === "GT4 WORK.JPG", "GT4 preserves its two materials and exact texture reference");
  assert(!gt4.selectorBinding && !gt4.physicsBinding && !gt4.playable && gt4.status === "PIPELINE", "GT4 gallery does not invent selector, physics, or driving restoration");
  await screenshot("02b-vehicle-pack-gt4-source");
  assert(await debug("selectVehiclePackAsset", "low-cobra"), "Low Cobra exact source can be selected independently");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.vehiclePackState()?.selectedVehicleId === "low-cobra" && window.__GRAPHYSX_DEBUG__.vehiclePackState()?.loadStatus === "ready", undefined, { timeout: 60000 });
  result.states.vehicleCobra = await textState();
  const cobra = result.states.vehicleCobra.vehiclePack;
  assert(cobra.objectCount === 10 && cobra.vertexCount === 6961 && cobra.triangleCount === 3266, "Low Cobra preserves all exact 3DS object and geometry totals");
  assert(cobra.materialCount === 7 && cobra.textureReferences.length === 7, "Low Cobra preserves all seven materials and texture references");
  assert(!cobra.selectorBinding && !cobra.physicsBinding && !cobra.playable, "Low Cobra remains an orphaned source asset instead of an archive-authored race");
  await screenshot("02c-vehicle-pack-low-cobra-source");

  assert(await debug("openNatureLab"), "Nature Lab opens as a standalone engine archive mode");
  await page.waitForTimeout(800);
  result.states.nature = await textState();
  assert(Boolean(result.states.nature.nature?.study), "Nature Lab reports its active study and simulation state");
  await screenshot("03-nature-lab");

  assert(await debug("selectNatureStudy", "orbital-observatory"), "Orbital Observatory is reachable as Nature Lab World 4");
  await page.evaluate(() => window.advanceTime(14500));
  result.states.observatory = await textState();
  assert(result.states.observatory.nature.recipe.schema === "graphysx.world/v1", "Observatory exports the versioned world recipe contract");
  assert(result.states.observatory.nature.observatory.earthquakes.count === 160, "Observatory exposes the deterministic 160-event SBQC quake subset");
  assert(result.states.observatory.nature.observatory.pass.entryInSeconds !== null, "Observatory predicts a Québec pass within its deterministic horizon");
  assert(
    await page.evaluate(() => window.__GRAPHYSX_WORLDS__.setLayer("quakes", false)),
    "World API can hide the quake telemetry layer"
  );
  assert((await textState()).nature.layers.quakes === false, "Quake layer visibility is reflected in text state");
  assert(await debug("loadNatureRecipe", "sbqc.orbital-observatory.v1"), "Canonical observatory recipe reloads through the agent API");
  const satellite = (await textState()).nature.observatory.satellite;
  assert(
    await debug("setNatureObserver", {
      label: "QA Ground Station",
      latitude: satellite.latitude,
      longitude: satellite.longitude
    }),
    "Agent can relocate the observatory ground station"
  );
  result.states.observatoryAligned = await textState();
  assert(result.states.observatoryAligned.nature.observatory.pass.insideDetectionRadius, "Relocated ground station enters the live pass radius");
  await screenshot("04-orbital-observatory-agent-pass");

  assert(await debug("openCommonRoom"), "Standalone Common archive opens outside BallZ progression");
  assert(await debug("selectCommonEnvironment", "room1"), "Common Room 1 is directly reachable");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.commonArchiveState()?.ready === true, undefined, { timeout: 60000 });
  result.states.commonRoom1 = await textState();
  assert(result.states.commonRoom1.environment.selection === "room1", "Common archive reports Room 1 as the active standalone environment");
  assert(
    result.states.commonRoom1.environment.archive.geometry.vertices === 180 &&
      result.states.commonRoom1.environment.archive.geometry.triangles === 250,
    "Common Room 1 preserves the exact 180-vertex / 250-triangle shell"
  );
  assert(
    result.states.commonRoom1.environment.archive.evidence.inference.length > 0,
    "Room 1 exposes its inferred host-camera and lighting boundary"
  );
  await screenshot("05-common-room1-shell");

  assert(await debug("selectCommonEnvironment", "sky-component"), "The recovered sky.tvm component is inspectable without claiming a scene");
  result.states.commonSkyComponent = await textState();
  assert(result.states.commonSkyComponent.environment.selection === "sky-component", "Common archive reports sky.tvm as the active component");
  assert(
    result.states.commonSkyComponent.environment.archive.geometry.vertices === 726 &&
      result.states.commonSkyComponent.environment.archive.geometry.triangles === 1200,
    "sky.tvm preserves the exact 726-vertex / 1,200-triangle skydome"
  );
  assert(
    result.states.commonSkyComponent.environment.archive.classification.includes("component"),
    "sky.tvm remains classified as an environment component rather than a standalone scene"
  );
  await screenshot("06-common-sky-component");

  assert(await debug("selectCommonEnvironment", "room2-shadow"), "Room 2's authored HLSL assembly remains reachable alongside Room 1");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.commonRoomState()?.ready === true);
  result.states.commonRoom2 = await textState();
  assert(result.states.commonRoom2.environment.selection === "room2-shadow", "Common archive reports Room 2 as the active shadow lab");
  assert(
    result.states.commonRoom2.environment.room2.source === "common/room2.tvm" &&
      result.states.commonRoom2.environment.room2.objects.includes("teapot"),
    "Room 2 retains the recovered mesh and authored HLSL teapot assembly"
  );
  await screenshot("07-common-room2-shadow-lab");

  assert(await debug("openBallz2011Level1"), "The distinct BallZ 2011 Level1 mesh opens as a concept visit");
  result.states.ballz2011Level1 = await textState();
  const level1Mesh = result.states.ballz2011Level1.ballz2011Level1;
  assert(level1Mesh.vertexCount === 828 && level1Mesh.triangleCount === 1648, "BallZ 2011 Level1 preserves all 828 vertices / 1,648 triangles");
  assert(level1Mesh.componentCount === 2 && level1Mesh.closedTwoManifold, "BallZ 2011 Level1 preserves its two closed mesh components");
  assert(level1Mesh.presentation.inferredMaterial, "BallZ 2011 Level1 explicitly reports its neutral material as inference");
  assert(await debug("setBallz2011Level1Bounds", true), "BallZ 2011 Level1 decoded bounds can be inspected");
  assert((await debug("ballz2011Level1State")).presentation.boundsVisible, "BallZ 2011 Level1 bounds toggle changes the live environment");
  await screenshot("08-ballz2011-level1-mesh-visit");

  assert(await debug("openBallzSlide1"), "The active Atmel Slide1 assembly opens under BallZ Concepts");
  result.states.ballzSlide1 = await textState();
  const slide1 = result.states.ballzSlide1.ballzSlide1;
  assert(slide1.mode === "source-backed-non-race-visit" && slide1.playable === false, "Slide1 remains an evidence-backed visit without invented gameplay");
  assert(slide1.slide.vertexCount === 566 && slide1.slide.triangleCount === 552, "Slide1 preserves the active 566-vertex / 552-triangle Atmel revision");
  assert(
    JSON.stringify(slide1.slide.sourceTransform.position) === JSON.stringify([0, -5000, 0]) &&
      JSON.stringify(slide1.ball.sourceTransform.position) === JSON.stringify([-50, -4750, -250]),
    "Slide1 preserves the exact slide and Ball.tvm source transforms"
  );
  assert(slide1.ball.mass === 5000 && slide1.sourceAssembly.camera.offset.join(",") === "0,350,300", "Slide1 preserves Ball mass and the archived chase offset");
  assert(slide1.sourceAssembly.rings.status.includes("placeholder"), "Slide1 exposes the source's temporary-ring fidelity boundary");
  assert(await debug("setBallzSlide1Bounds", true), "Slide1 decoded source-world bounds can be inspected");
  assert((await debug("ballzSlide1State")).diagnostics.boundsVisible, "Slide1 bounds toggle changes the live visit");
  await screenshot("09-ballz-slide1-source-assembly");

  assert(await debug("openBallzTrackGallery"), "The remaining six BallZ slide/track sources open as one archive gallery");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.ballzTrackGalleryState()?.assetsReady === true, undefined, { timeout: 30000 });
  result.states.ballzTrackGallery = await textState();
  const slide1aGallery = result.states.ballzTrackGallery.ballzTrackGallery;
  assert(slide1aGallery.mode === "evidence-bounded-non-gameplay-gallery" && slide1aGallery.playable === false, "Slide/track gallery never promotes its six evidence visits into races");
  assert(slide1aGallery.asset.vertexCount === 2271 && slide1aGallery.asset.triangleCount === 2849, "Slide1A preserves its exact 2,271-vertex / 2,849-triangle geometry");
  assert(slide1aGallery.hostEvidence.staticMeshBody === true && slide1aGallery.hostEvidence.position.join(",") === "0,-5000,0", "Slide1A preserves the older static host body and source position");
  const galleryCounts = {
    "slide1a-legacy-active": [2271, 2849],
    "level-slides": [792, 1524],
    "level-steps": [200, 120],
    "slide-bump": [699, 1456],
    "slide-bump-gridtex": [685, 1456],
    "ballz-track1": [385, 447]
  };
  for (const [id, [vertices, triangles]] of Object.entries(galleryCounts)) {
    assert(await debug("selectBallzTrackGalleryAsset", id), `${id} is selectable in the integrated archive gallery`);
    const selected = await debug("ballzTrackGalleryState");
    assert(selected.asset.vertexCount === vertices && selected.asset.triangleCount === triangles, `${id} preserves its exact geometry totals`);
  }
  assert(await debug("selectBallzTrackGalleryAsset", "level-steps"), "Level.Steps exact material study can be selected");
  const gallerySteps = await debug("ballzTrackGalleryState");
  assert(gallerySteps.material.resolvedTextures.map((binding) => binding.textureName).join(",") === "grass.jpg,concrete.png,wood.jpg", "Level.Steps preserves its exact grass/concrete/wood bindings");
  assert(gallerySteps.asset.sourceNormals === "all-zero" && gallerySteps.asset.displayNormalAdapter === "computed-for-inspection", "Level.Steps preserves zero source normals and discloses computed display normals");
  assert(await debug("selectBallzTrackGalleryAsset", "slide-bump"), "Slide Bump base revision can be selected");
  const bumpHash = (await debug("ballzTrackGalleryState")).asset.sha256;
  assert(await debug("selectBallzTrackGalleryAsset", "slide-bump-gridtex"), "Slide Bump GridTex revision can be selected independently");
  const gridBump = await debug("ballzTrackGalleryState");
  assert(gridBump.asset.sha256 !== bumpHash && gridBump.material.resolvedTextures[0].textureName === "EarthGri.bmp", "Bump revisions stay byte-distinct and GridTex retains EarthGri");
  assert(await debug("selectBallzTrackGalleryAsset", "ballz-track1"), "BallZTrack1 exact hosted visit can be selected");
  const track1 = await debug("ballzTrackGalleryState");
  assert(track1.hostEvidence.ballSpawn.join(",") === "-20,310,225" && track1.hostEvidence.chaseOffset.join(",") === "25,100,30", "BallZTrack1 preserves its exact Ball spawn and chase offset evidence");
  assert(await debug("setBallzTrackGalleryMaterial", "diagnostic-groups"), "Slide/track gallery exposes diagnostic material groups separately from source evidence");
  assert(await debug("setBallzTrackGalleryEdges", false) && await debug("setBallzTrackGalleryBounds", true), "Slide/track gallery diagnostics toggle independently");
  assert(await debug("setBallzTrackGalleryCamera", "top"), "Slide/track gallery exposes its labeled top inspection camera");
  assert(track1.exclusions.some((entry) => entry.id.includes("slide-long")) && track1.exclusions.some((entry) => entry.id.includes("pipe1")), "Known SlideLong1 and pipe1 aliases remain excluded from the gallery and census");
  await screenshot("09b-ballz-slide-track-six-source-gallery");

  assert(await debug("openXmlMyWorldCopy"), "MyWorld — Copy opens as a standalone archived XML scene");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.xmlSceneState()?.loadStatus === "ready");
  result.states.xmlMyWorldCopy = await textState();
  const xmlWorld = result.states.xmlMyWorldCopy.xmlScene;
  assert(xmlWorld.objectCount === 7 && xmlWorld.renderedObjectCount === 6, "MyWorld — Copy preserves six of seven serialized objects");
  assert(xmlWorld.unresolvedObjectNames.join(",") === "ArcheChinois", "MyWorld — Copy leaves the absent Chinese arch unresolved instead of substituting a proxy");
  assert(xmlWorld.primitiveCount === 4 && xmlWorld.exactTvmAssets.length === 2, "MyWorld — Copy renders four exact procedural definitions and two exact TVM assets");
  assert(
    xmlWorld.exactTvmAssets.some((asset) => asset.vertices === 5367 && asset.triangles === 9202) &&
      xmlWorld.exactTvmAssets.some((asset) => asset.vertices === 448 && asset.triangles === 692),
    "MyWorld — Copy preserves exact AirplaneLP and Level2 geometry counts"
  );
  assert(xmlWorld.physics.metadataPreserved && !xmlWorld.physics.simulated, "MyWorld — Copy retains physics metadata without inventing missing host simulation settings");
  const xmlOrbitBefore = xmlWorld.orbitAngleRadians;
  assert(await debug("orbitXmlScene", 0.75), "MyWorld — Copy inspection camera orbits through the integrated controls");
  assert(Math.abs((await debug("xmlSceneState")).orbitAngleRadians - xmlOrbitBefore - 0.75) < 0.0001, "MyWorld — Copy orbit state advances deterministically");
  assert(await debug("setXmlSceneObject", { name: "Airplane", visible: false }), "MyWorld — Copy recovered objects can be inspected independently");
  assert((await debug("xmlSceneState")).objects.find((object) => object.name === "Airplane").visible === false, "MyWorld — Copy object visibility is reflected in structured state");
  assert(await debug("resetXmlSceneObjects"), "MyWorld — Copy can restore all recovered objects");
  await screenshot("10-xml-myworld-copy-six-of-seven");

  assert(await debug("openBallzXmlWorlds"), "MyWorld and TestWorld open in their separate XML evidence visit");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.ballzXmlWorldsState()?.loadStatus === "ready", undefined, { timeout: 30000 });
  result.states.ballzXmlMyWorld = await textState();
  const myWorld = result.states.ballzXmlMyWorld.ballzXmlWorlds;
  assert(myWorld.sceneId === "myworld" && myWorld.objectCount === 4 && myWorld.renderedObjectCount === 2, "MyWorld preserves four serialized records and exactly two resolvable objects");
  assert(myWorld.unresolvedObjectCount === 2 && !myWorld.assembledDiscoverableWorld, "MyWorld keeps both malformed duplicate targets unresolved and makes no finished-world claim");
  assert(myWorld.exactTvmAssets.some((asset) => asset.vertices === 10261 && asset.triangles === 11168), "MyWorld renders the exact high-detail Airplane TVM");
  assert(myWorld.parserRule.includes("own Actions"), "MyWorld uses its own embedded serializer action table");
  await screenshot("10b-ballz-xml-myworld-evidence");
  assert(await debug("selectBallzXmlWorld", "testworld"), "TestWorld can be selected without conflating its serializer generation");
  result.states.ballzXmlTestWorld = await textState();
  const testWorld = result.states.ballzXmlTestWorld.ballzXmlWorlds;
  assert(testWorld.sceneId === "testworld" && testWorld.objectCount === 8 && testWorld.renderedObjectCount === 5, "TestWorld preserves eight records and its five exact loadable objects");
  assert(testWorld.unresolvedObjectCount === 3 && testWorld.exactTvmAssets.some((asset) => asset.vertices === 5367 && asset.triangles === 9202), "TestWorld keeps three source gaps and exact AirplaneLP geometry");
  const ballzXmlOrbitBefore = testWorld.orbitAngleRadians;
  assert(await debug("orbitBallzXmlWorlds", 0.55), "BallZ XML evidence visit orbits through integrated controls");
  assert(Math.abs((await debug("ballzXmlWorldsState")).orbitAngleRadians - ballzXmlOrbitBefore - 0.55) < 0.0001, "BallZ XML orbit advances deterministically");
  await screenshot("10c-ballz-xml-testworld-evidence");

  assert(await debug("openXmlSerializerArtifacts"), "Serializer artifacts remain inspectable outside the scene census");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.xmlSerializerArtifactState()?.ready === true, undefined, { timeout: 30000 });
  result.states.serializerBase = await textState();
  const baseArtifact = result.states.serializerBase.xmlSerializerArtifact;
  assert(!baseArtifact.distinctAssembledScene && baseArtifact.objectCount === 18 && baseArtifact.uniqueObjectSignatureCount === 1, "BaseScene is correctly classified as 18 identical serializer records, not a world");
  assert(baseArtifact.exactOverlapGroupSizes.join(",") === "18" && baseArtifact.distinctSerializedTransformCount === 1, "BaseScene preserves its exact 18-way overlap without spreading cubes apart");
  await screenshot("10d-serializer-base-scene-artifact");
  assert(await debug("selectXmlSerializerArtifact", "test1"), "test1 serializer smoke document can be selected");
  result.states.serializerTest1 = await textState();
  const testArtifact = result.states.serializerTest1.xmlSerializerArtifact;
  assert(!testArtifact.distinctAssembledScene && testArtifact.objectCount === 1 && testArtifact.uniqueObjectSignatureCount === 1, "test1 remains a one-cube serializer smoke artifact, not a census scene");
  await screenshot("10e-serializer-test1-artifact");

  assert(await debug("openMathGame"), "Math Game opens as a standalone visual formula workbench");
  result.states.mathGame = await textState();
  assert(result.states.mathGame.math.camera.controls.includes("Reset 3D View"), "Math Game text state exposes its local orbit, zoom, and reset controls");
  assert(result.states.mathGame.player === undefined && result.states.mathGame.race === undefined, "Math Game standalone state no longer leaks the hidden BallZ player or race");
  const mathCanvas = page.locator("canvas");
  const mathBox = await mathCanvas.boundingBox();
  if (!mathBox) throw new Error("Math Game canvas is unavailable");
  const mathYawBefore = (await debug("mathLabViewState")).yawRadians;
  await page.mouse.move(mathBox.x + mathBox.width * 0.52, mathBox.y + mathBox.height * 0.52);
  await page.mouse.down();
  await page.mouse.move(mathBox.x + mathBox.width * 0.62, mathBox.y + mathBox.height * 0.52, { steps: 4 });
  await page.mouse.up();
  assert(Math.abs((await debug("mathLabViewState")).yawRadians - mathYawBefore) > 0.1, "Math Game canvas drag changes the local 3D inspection camera");
  assert(await debug("resetMathLabView"), "Math Game exposes a deterministic 3D camera reset");
  const resetMathView = await debug("mathLabViewState");
  assert(Math.abs(resetMathView.yawRadians + 0.28) < 0.001 && Math.abs(resetMathView.pitchRadians - 0.46) < 0.001 && resetMathView.distance === 26, "Math Game reset restores the documented readable camera");
  await screenshot("10f-math-game-visible-controls-and-camera-reset");

  assert(await debug("openObjectLibraryCatalog"), "ObjectLibrary opens as an archived catalog grid, not a village");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.objectLibraryCatalogState()?.loadStatus === "ready", undefined, { timeout: 30000 });
  assert(!(await page.locator(".panel").innerText()).includes("Loading catalog"), "ObjectLibrary panel refreshes automatically when its lazy environment becomes ready");
  result.states.objectLibraryCatalog = await textState();
  const objectLibrary = result.states.objectLibraryCatalog.objectLibraryCatalog;
  assert(objectLibrary.objectCount === 61 && objectLibrary.recoveredCount === 47, "ObjectLibrary preserves all 61 records and 47 recovered objects");
  assert(objectLibrary.missingCount === 13 && objectLibrary.unsupportedCount === 1, "ObjectLibrary leaves all 14 source gaps explicit");
  assert(objectLibrary.classification.includes("grid") && objectLibrary.classification.includes("not a composed world"), "ObjectLibrary reports its authored catalog classification without a village claim");
  assert(objectLibrary.objects.filter((object) => object.inspectionMarkerOnly).length === 14, "ObjectLibrary uses inspection labels rather than proxy geometry for every source gap");
  assert(await debug("setObjectLibraryFamily", "port"), "ObjectLibrary exposes source-backed family filtering");
  assert((await debug("objectLibraryCatalogState")).familyFilter === "port", "ObjectLibrary family filter is reflected in structured state");
  assert(await debug("setObjectLibraryFamily", "all") && await debug("setObjectLibraryStatus", "missing"), "ObjectLibrary exposes source-status filtering");
  assert((await debug("objectLibraryCatalogState")).matchingCount === 13, "ObjectLibrary missing filter exposes the exact thirteen absent assets");
  assert(await debug("resetObjectLibraryCatalog"), "ObjectLibrary reset restores the complete catalog");
  const objectLibraryOrbitBefore = (await debug("objectLibraryCatalogState")).orbitAngleRadians;
  assert(await debug("orbitObjectLibraryCatalog", 0.5), "ObjectLibrary catalog camera orbits through the integrated controls");
  assert(Math.abs((await debug("objectLibraryCatalogState")).orbitAngleRadians - objectLibraryOrbitBefore - 0.5) < 0.0001, "ObjectLibrary orbit advances deterministically");
  await screenshot("11-object-library-exact-catalog-grid");

  assert(await debug("openDominusAssetGallery"), "Dominus source assets open as a gallery outside playable worlds");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.dominusAssetGalleryState()?.loadStatus === "ready", undefined, { timeout: 30000 });
  assert(!(await page.locator(".panel").innerText()).includes("Loading source asset"), "Dominus source panel refreshes automatically when its lazy environment becomes ready");
  result.states.dominusAssetGallery = await textState();
  const dominus = result.states.dominusAssetGallery.dominusAssetGallery;
  assert(dominus.assetCount === 65 && dominus.recoveredCount === 63 && dominus.unsupportedCount === 2, "Dominus gallery preserves all 65 audited assets and both binary-X boundaries");
  assert(dominus.classification.includes("source asset family only") && dominus.classification.includes("no authored composition"), "Dominus gallery never claims the absent village/port composition");
  assert(dominus.assets.filter((asset) => asset.family === "port").length === 28, "Dominus gallery preserves the exact 28-record port family");
  assert(dominus.renderedGeometry && dominus.sourceVertexCount === 20 && dominus.sourceTriangleCount === 10, "Dominus default bush renders exact decoded geometry");
  assert(await debug("setDominusAssetFamily", "port"), "Dominus gallery filters by proven filename family");
  assert((await debug("dominusAssetGalleryState")).matchingCount === 28, "Dominus port filter exposes exactly 28 audited assets");
  assert(await debug("setDominusAssetStatus", "unsupported"), "Dominus gallery can isolate unsupported source records");
  const dominusUnsupportedPort = await debug("dominusAssetGalleryState");
  assert(dominusUnsupportedPort.matchingCount === 1 && dominusUnsupportedPort.selectedId === "port_crateshed", "Dominus port/binary filter selects the exact port_crateshed boundary");
  assert(dominusUnsupportedPort.inspectionMarkerOnly && !dominusUnsupportedPort.renderedGeometry, "Dominus unsupported binary-X asset uses an evidence label and no proxy geometry");
  assert(await debug("setDominusAssetFamily", "all"), "Dominus family reset retains the unsupported status filter");
  assert((await debug("dominusAssetGalleryState")).matchingCount === 2, "Dominus unsupported filter exposes exactly the two surviving binary-X records");
  const dominusOrbitBefore = (await debug("dominusAssetGalleryState")).orbitAngleRadians;
  assert(await debug("orbitDominusAssetGallery", 0.4), "Dominus source inspection camera orbits through integrated controls");
  assert(Math.abs((await debug("dominusAssetGalleryState")).orbitAngleRadians - dominusOrbitBefore - 0.4) < 0.0001, "Dominus orbit advances deterministically");
  assert(await debug("resetDominusAssetGallery"), "Dominus gallery reset restores the complete source family");
  assert((await debug("dominusAssetGalleryState")).matchingCount === 65, "Dominus reset returns to all 65 source assets");
  await screenshot("12-dominus-source-assets-no-world-claim");

  assert(await debug("openDominusPortEvidence"), "Dominus exact port placement evidence opens as a standalone visit");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.dominusPortEvidenceState()?.loadStatus === "ready", undefined, { timeout: 60000 });
  result.states.dominusPortEvidence = await textState();
  const portEvidence = result.states.dominusPortEvidence.dominusPortEvidence;
  assert(portEvidence.recoveryStatus === "PARTIAL" && portEvidence.classification.includes("evidence view"), "Dominus port closes pipeline as an explicitly partial evidence view");
  assert(portEvidence.portPlacementCount === 28 && portEvidence.decodedPlacementCount === 27 && portEvidence.unsupportedPlacementCount === 1, "Dominus port preserves all 28 source rows, 27 decoded meshes, and the one binary-X boundary");
  assert(portEvidence.sourceVertexCount === 23594 && portEvidence.sourceTriangleCount === 13860 && portEvidence.sourceMaterialGroupCount === 126, "Dominus port reports its exact source geometry/material totals");
  assert(await debug("selectDominusPortEvidence", { id: "port_crateshed", focus: true }), "Dominus port can focus the unsupported crate-shed source row");
  const portBoundary = await debug("dominusPortEvidenceState");
  assert(!portBoundary.selectedDecoded && portBoundary.selectedId === "port_crateshed", "Dominus binary-X boundary remains explicit rather than receiving proxy geometry");
  assert(await debug("showDominusPortSourceGrid"), "Dominus port restores the exact source grid after focused inspection");
  assert((await debug("dominusPortEvidenceState")).viewMode === "source-grid", "Dominus overview returns to the serialized catalog placement");
  await screenshot("12b-dominus-exact-port-placement-evidence");

  assert(await debug("openEngineFxLab"), "Engine & FX opens with archived effects separated from worlds and races");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.archivedParticlePresetLibraryState()?.loadStatus === "ready");
  assert(!(await page.locator(".panel").innerText()).includes("Loading exact DDS assets"), "Engine & FX panel refreshes automatically when its archived preset environment becomes ready");
  await page.evaluate(() => window.advanceTime(700));
  result.states.archivedParticlePresetLibrary = await textState();
  const presetLibrary = result.states.archivedParticlePresetLibrary.particles.archivedPresetLibrary;
  assert(presetLibrary.classification === "engine-fx-feature-not-scene", "Particle library remains an engine feature rather than a census scene");
  assert(
    presetLibrary.library.counts.compiledFilenames === 19 &&
      presetLibrary.library.counts.uniqueCompiledBinaries === 17 &&
      presetLibrary.library.counts.readablePresets === 16 &&
      presetLibrary.library.counts.opaqueCompiledPresets === 3,
    "Particle library preserves the exact 19-name / 17-binary / 16-readable / three-opaque census"
  );
  assert(presetLibrary.library.counts.emitters === 29 && presetLibrary.library.counts.attractors === 1, "Particle library preserves all 29 readable emitters and the one attractor");
  assert(presetLibrary.selected.id === "explosion_01" && presetLibrary.selected.emitterConfigs.map((emitter) => emitter.maxParticles).join(",") === "10,64,8", "Explosion 01 preserves its exact 10 / 64 / 8 emitter capacities");
  assert(presetLibrary.counts.activeParticles > 0, "Explosion 01 visibly emits particles during exact-config playback");
  assert(presetLibrary.selected.emitterConfigs.map((emitter) => emitter.textureFile).join(",") === "Glow2.dds,Glow2.dds,smokey.dds", "Explosion 01 uses its exact archived DDS bindings");
  assert(presetLibrary.library.exactAliasGroups.some((group) => group.aliases.includes("explosion1.TVP") && group.aliases.includes("explosion_01.TVP")), "Particle library retains exact compiled alias evidence without duplicate simulation entries");
  assert(await debug("pauseArchivedParticlePreset", true), "Archived particle library inspection can pause");
  const particleTimeBeforePause = (await debug("archivedParticlePresetLibraryState")).totalElapsedSeconds;
  await page.evaluate(() => window.advanceTime(500));
  assert(Math.abs((await debug("archivedParticlePresetLibraryState")).totalElapsedSeconds - particleTimeBeforePause) < 0.0001, "Paused archived particle state remains deterministic");
  assert(await debug("pauseArchivedParticlePreset", false) && await debug("restartArchivedParticlePreset"), "Archived preset playback can resume and restart deterministically");
  assert(await debug("selectArchivedParticlePreset", "explosion_02"), "Particle library exposes the readable Explosion 02 preset");
  assert((await debug("archivedParticlePresetLibraryState")).selected.attractorConfigs.length === 1, "Explosion 02 exposes the archive's one exact attractor configuration");
  assert(await debug("selectArchivedParticlePreset", "expl1"), "Particle library exposes the source-only Expl1 preset");
  const missingTexturePreset = await debug("archivedParticlePresetLibraryState");
  assert(missingTexturePreset.selected.textureBindings[0].status === "missing" && missingTexturePreset.emitters[0].textureStatus === "missing-binding-diagnostic-fallback", "Expl1 keeps clumpy_blurry.dds missing and uses an explicit diagnostic fallback");
  assert(await debug("selectArchivedParticlePreset", "explosion3"), "Particle library exposes opaque Explosion3 as evidence");
  const opaquePreset = await debug("archivedParticlePresetLibraryState");
  assert(!opaquePreset.selected.readable && opaquePreset.counts.activeEmitters === 0 && opaquePreset.selected.reason, "Opaque compiled preset receives no invented emitter configuration");
  assert(await debug("selectArchivedParticlePreset", "explosion_01"), "Particle library returns to exact Explosion 01 playback");
  await screenshot("12-engine-fx-full-archived-preset-library");

  assert(await debug("openSuzanne2Archive"), "Suzanne 2 opens as a distinct authored-level archive visit");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.suzanne2State()?.loadStatus === "ready", undefined, { timeout: 30000 });
  result.states.suzanne2Archive = await textState();
  const suzanne2 = result.states.suzanne2Archive.suzanne2Archive;
  assert(suzanne2.grid.width === 40 && suzanne2.grid.height === 40, "Suzanne 2 preserves the exact 40×40 authored grid");
  assert(suzanne2.counts.totalAsciiCollisionCubes === 315 && suzanne2.counts.rings === 15, "Suzanne 2 preserves 315 collision cubes and 15 authored rings");
  assert(suzanne2.counts.chainAssemblies === 3 && suzanne2.counts.pistonAssemblies === 3 && suzanne2.counts.xmlObjects === 3, "Suzanne 2 preserves chains, pistons and XML attachments");
  assert(suzanne2.rules.authoredRingInventory === 15 && suzanne2.rules.implementedVictoryThreshold === 2, "Suzanne 2 exposes the shipped 15-ring versus two-pickup conflict");
  assert(suzanne2.rules.lapVictoryTarget === null && suzanne2.screenshotEvidence === false, "Suzanne 2 does not invent a lap target or borrow Suzanne 1 screenshot evidence");
  assert(await debug("setSuzanne2Cubx", true), "Suzanne 2 can reveal its two unresolved CubX actor anchors as evidence");
  assert((await debug("suzanne2State")).counts.cubxAnchorsVisible === 2, "Suzanne 2 reports both CubX anchors when enabled");
  assert(await debug("setSuzanne2Piston", { index: 0, activation: 1 }), "Suzanne 2 piston diagnostic reaches the exact source limit");
  assert((await debug("suzanne2State")).activePistons.includes(0), "Suzanne 2 piston activation is reflected in structured state");
  await screenshot("13-suzanne2-authored-source-visit");

  assert(await debug("openNotesManager"), "CubX 3D Notes opens outside BallZ progression");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.notesManagerState()?.loadStatus === "ready");
  assert((await debug("notesManagerState")).activeNotes === 0, "CubX Notes begins at its exact zero-note state");
  assert((await debug("addArchiveNote")) === 0 && (await debug("addArchiveNote")) === 1, "CubX Notes enables exact slots 0 and 1 in sequence");
  result.states.notesManager = await textState();
  assert(result.states.notesManager.notesManager.capacity === 50, "CubX Notes exposes the exact 50-slot capacity");
  assert(
    JSON.stringify(result.states.notesManager.notesManager.activeNotePositions) === JSON.stringify([[0, 50, 0], [0, 50, 20]]),
    "CubX Notes preserves the first two authored 3D positions"
  );
  await screenshot("09-cubx-notes-manager");

  assert(await debug("openMilkyWay"), "Voie Lactée opens as a planetary vignette rather than a star field");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.milkyWayState()?.loadStatus === "ready", undefined, { timeout: 60000 });
  result.states.milkyWay2017 = await textState();
  assert(result.states.milkyWay2017.milkyWay.planets.length === 5, "Voie Lactée exposes the five implemented archive bodies");
  assert(result.states.milkyWay2017.milkyWay.generatedStars === 0, "Voie Lactée correctly reports zero generated stars");
  assert(result.states.milkyWay2017.milkyWay.exactAssetBinding, "Voie Lactée later profile uses the exact recovered texture set");
  await screenshot("10-voie-lactee-2017");
  assert(await debug("setMilkyWayProfile", "ballz2015"), "Voie Lactée exposes the distinct older BallZ motion profile");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.milkyWayState()?.loadStatus === "ready", undefined, { timeout: 60000 });
  await page.evaluate(() => window.advanceTime(1000));
  result.states.milkyWay2015 = await textState();
  assert(result.states.milkyWay2015.milkyWay.profile === "ballz2015", "Voie Lactée retains the selected 2015 profile in live state");
  assert(result.states.milkyWay2015.milkyWay.moonOrbitDegrees < -2.9, "Voie Lactée 2015 Moon follows the recovered motion rate");
  await screenshot("11-voie-lactee-2015-motion");

  assert(await debug("openCubxActorLineage"), "The older CubXActor family opens in a separate archive inspector");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.cubxActorLineageState()?.clip?.filename === "CubXGet2.tva", undefined, { timeout: 30000 });
  result.states.cubxActorLineage = await textState();
  const lineage = result.states.cubxActorLineage.cubxActorLineage;
  assert(lineage.isolatedFromCubz && lineage.fidelity.separateFromCubz, "CubXActor evidence is explicitly isolated from the CubZ menu");
  assert(
    lineage.clip.filename === "CubXGet2.tva" && lineage.clip.framesPerSecond === 30 && lineage.clip.endFrame === 100,
    "CubXActor inspector starts with the exact Get2 0..100 / 30 fps clip"
  );
  assert(lineage.geometry.vertices === 2264 && lineage.geometry.triangles === 2750, "CubXActor Get2 preserves its exact 2,264-vertex / 2,750-triangle geometry");
  assert(lineage.geometry.buttonMeshes === 8, "CubXActor inspector includes all eight exact click meshes");
  assert(await debug("playCubxActorLineage", true), "CubXActor exact clip playback can start");
  const lineageAdvance = await page.evaluate(() => {
    // Reset the exact pair inside the same browser task as deterministic time
    // advancement so a slow full-matrix screenshot cannot contribute a live
    // render frame between the baseline and the 1.1 s probe.
    // Pair slot 1 maps to CubXGet2; the Get family is offset because Get1
    // does not exist in the surviving sequence.
    window.__GRAPHYSX_DEBUG__.setCubxActorLineageClip({ family: "get", pairIndex: 1 });
    window.__GRAPHYSX_DEBUG__.playCubxActorLineage(true);
    const before = window.__GRAPHYSX_DEBUG__.cubxActorLineageState().clip.sourceFrame;
    window.advanceTime(1100);
    const after = window.__GRAPHYSX_DEBUG__.cubxActorLineageState();
    return { before, after, delta: after.clip.sourceFrame - before };
  });
  result.states.cubxActorLineageAdvance = lineageAdvance;
  const lineageHold = lineageAdvance.after;
  assert(lineageAdvance.delta > 32 && lineageAdvance.delta < 34, "CubXActor playback advances at the exact 30 fps source rate");
  assert(lineageHold.clip.terminalHoldActive, "CubXActor exposes Get2's authored terminal hold after motion frame 30");
  assert(await debug("setCubxActorLineageClip", { family: "rot", pairIndex: 4 }), "CubXActor can inspect an exact Rot family pair");
  assert(await debug("stepCubxActorLineage", 15), "CubXActor can step exact source frames");
  const lineageRot = await debug("cubxActorLineageState");
  assert(lineageRot.clip.filename === "CubXRot4.tva" && lineageRot.clip.sourceFrame === 15, "CubXActor Rot4 frame stepping preserves the requested source frame");
  assert(await debug("selectCubxActorLineageClick", 8), "CubXActor exposes the archived eighth click path");
  const lineageBrokenClick = await debug("cubxActorLineageState");
  assert(
    lineageBrokenClick.clickInspection.actorSlotInitialized === false && lineageBrokenClick.clickInspection.renderedByHostLoop === false,
    "CubXActor click 8 remains the archived uninitialized, unrendered slot instead of gaining an invented actor"
  );
  assert(await debug("setCubxActorLineageButtons", false) && await debug("setCubxActorLineageColors", false), "CubXActor inspection aids can be disabled independently of source geometry");
  await screenshot("16-cubx-actor-lineage-separated");

  assert(await debug("openCubXMenu"), "CubZ Animated Menu opens as its own archive mode");
  // Let the recovered source camera fly settle before judging the disclosed
  // inspection framing used for the readable closed constellation.
  await page.evaluate(() => window.advanceTime(3000));
  result.states.cubzClosed = await textState();
  const cubzLayout = result.states.cubzClosed.cubx.sourceLayout;
  const expectedCubzCenters = [
    [0, 25, 0],
    [0, 25, 100],
    [-95, 25, 100],
    [-95, 25, 0],
    [0, -70, 0],
    [0, -70, 100],
    [-95, -70, 100],
    [-95, -70, 0]
  ];
  assert(cubzLayout.modelScale === 8 && cubzLayout.cubeSize === 58, "CubZ preserves fSize=8 and the authored 58-unit interaction boxes");
  assert(
    cubzLayout.exactHitLayout && JSON.stringify(cubzLayout.centers) === JSON.stringify(expectedCubzCenters),
    "CubZ preserves all eight source hit-box centers from CubZ.cpp"
  );
  assert(result.states.cubzClosed.cubx.sourceAnimation.decoded, "CubZ exposes decoded CubeRot and CubeOpen source animation data");
  assert(
    !("cubXOpen" in result.states.cubzClosed.cubx.sourceAnimation) &&
      result.states.cubzClosed.cubx.sourceAnimation.visualAdapter.status === "decoded-cubz-tva-tracks-on-procedural-cubz-geometry",
    "CubZ visible playback uses only its own CubeRot/CubeOpen tracks, never the older CubXActor CubXOpen clip"
  );
  assert(
    result.states.cubzClosed.cubx.sourceAnimation.rotationClips.length === 7 &&
      Math.abs(result.states.cubzClosed.cubx.sourceAnimation.openClip.durationSeconds - 5 / 3) < 0.0001,
    "CubZ exposes seven exact rotation ranges and the 50-frame / 30fps open clip"
  );
  assert(result.states.cubzClosed.cubx.sourceAnimation.reverseRepair.status.includes("source-defect-repair"), "CubZ reports the same-range reverse repair for the archived off-by-one ID defect");
  assert(result.states.cubzClosed.cubx.presentation.visibleCubeCount === 8 && result.states.cubzClosed.cubx.presentation.cameraDistance < 10, "CubZ closed layout shows all eight cubes at a readable inspection distance");
  await screenshot("14-cubz-exact-closed-layout");

  assert(await debug("openCubX", 2), "CubZ cube 3 starts the recovered RotateTo/Open interaction chain");
  // Cube 3 first snaps by roughly PI radians at the recovered 80deg/s rate,
  // then plays the 50-frame / 30fps open clip. Allow the complete chain.
  await page.evaluate(() => window.advanceTime(4500));
  result.states.cubzOpen = await textState();
  assert(result.states.cubzOpen.cubx.phase === "open", "CubZ reaches its unfolded open phase");
  assert(result.states.cubzOpen.cubx.selectedCube === 2 && result.states.cubzOpen.cubx.actions.length === 4, "CubZ opens four internal panels for the selected menu level");
  assert(result.states.cubzOpen.cubx.presentation.visibleCubeCount === 0 && result.states.cubzOpen.cubx.presentation.panelsVisible && !result.states.cubzOpen.cubx.presentation.satelliteShellVisible, "CubZ open view isolates the unfolded panels instead of piling all cubes and satellites together");
  await screenshot("15-cubz-unfolded-panels");
  assert(await debug("activateCubX", 1), "CubZ internal panel action is interactive");
  assert((await textState()).cubx.selectedAction === result.states.cubzOpen.cubx.actions[1], "CubZ reports the selected internal action");
  assert(await debug("closeCubX"), "CubZ close reverses the panel and cube sequence");
  // Closing mirrors the open clip and snap rotation before returning to idle.
  await page.evaluate(() => window.advanceTime(4500));
  result.states.cubzReturned = await textState();
  assert(result.states.cubzReturned.cubx.phase === "idle" && result.states.cubzReturned.cubx.selectedCube === null, "CubZ returns to the exact eight-cube idle layout");
  assert(result.states.cubzReturned.cubx.presentation.visibleCubeCount === 8 && result.states.cubzReturned.cubx.presentation.satelliteShellVisible, "CubZ close restores the complete cube and satellite constellation");
  assert(await debug("openCubX", 0), "CubZ cube 1 follows the source's special no-rotation path");
  assert((await textState()).cubx.phase === "opening", "CubZ selection zero opens immediately instead of inventing an eighth rotation clip");
  await page.evaluate(() => window.advanceTime(1800));
  assert((await textState()).cubx.phase === "open", "CubZ selection zero completes the exact-duration CubeOpen clip");
  assert(await debug("closeCubX"), "CubZ selection zero closes without BackRotate");
  await page.evaluate(() => window.advanceTime(1800));
  assert((await textState()).cubx.phase === "idle", "CubZ selection zero returns directly to idle after close");

  const classics = ["green-grid-run", "rotator-cube-works", "piston-gateworks"];
  for (const raceId of classics) {
    assert(await debug("selectRace", raceId), `${raceId} is reachable from the player-facing roster`);
    await page.waitForTimeout(250);
    assert(await debug("startRace"), `${raceId} starts`);
    await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.state() === "gameplay");
    const live = await debug("snapshot");
    assert(live.ringsTotal === 20, `${raceId} exposes all 20 authored checkpoints`);
    assert(live.lapsTotal === 3, `${raceId} uses the three-lap XML rule`);
    assert(live.playerRadius === 0.3, `${raceId} uses the archived 0.3 BallZ radius`);
    await screenshot(`classic-${raceId}`);
    await debug("completeObjective");
    const completed = await debug("snapshot");
    assert(completed.raceFinished && completed.lapsCompleted === 3, `${raceId} completes through the live three-lap callbacks`);
  }

  assert(await debug("selectRace", "suzanne1-classic"), "Suzanne 1 is reachable from the BallZ roster");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.snapshot().loadState.ready);
  assert(await debug("startRace"), "Suzanne 1 starts after its recovered textures are ready");
  await page.waitForFunction(() => window.__GRAPHYSX_DEBUG__.state() === "gameplay");
  await page.waitForTimeout(600);
  result.states.suzanneLive = await textState();
  const suzanne = result.states.suzanneLive.suzanne;
  assert(result.states.suzanneLive.player.radius === 0.3, "Suzanne uses its recovered 0.3 BallZ radius");
  assert(suzanne.grid.width === 40 && suzanne.grid.height === 40, "Suzanne uses the recovered 40×40 ASCII grid");
  assert(suzanne.counts.walls === 208 && suzanne.counts.chains === 45, "Suzanne exposes the authored wall and chain counts");
  assert(suzanne.counts.ringsTotal === 15 && suzanne.counts.pistons === 3 && suzanne.counts.effects === 2, "Suzanne exposes its authored checkpoints, pistons, and effects");
  await screenshot("04-suzanne-ascii-live");
  await debug("completeObjective");
  result.states.suzanneFinished = await textState();
  assert(result.states.suzanneFinished.raceFinished, "Suzanne completes through the live race callbacks");
  assert(result.states.suzanneFinished.laps.completed === 3, "Suzanne records all three laps at finish");
  assert(result.states.suzanneFinished.rings === "15/15", "Suzanne collects all 15 authored checkpoints");

  assert(errors.length === 0, "Browser console and page errors remain clean across the r13 restoration matrix");
} finally {
  // Snapshot verified runtime errors before browser shutdown; Chromium may abort
  // speculative/lazy requests while closing after the clean-state assertion.
  result.errors = [...errors];
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(result, null, 2));
  await browser.close();
}

console.log(JSON.stringify({ assertions: result.assertions.length, errors: result.errors.length, outputDir }, null, 2));

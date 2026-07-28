export type ArchiveModeId = "race" | "scene-index" | "scene-lab" | "nature-lab" | "world-api-lab" | "skybox-selector" | "car-selector" | "vehicle-pack-gallery" | "common-room-lab" | "threejs-playground" | "ballz-blender-level1" | "maison-explorer" | "arena-archive" | "ballz-2011-level1" | "ballz-slide1" | "ballz-track-gallery" | "suzanne2-archive" | "xml-myworld-copy" | "ballz-xml-worlds" | "object-library-catalog" | "dominus-asset-gallery" | "dominus-port-evidence" | "xml-serializer-artifacts" | "notes-manager-lab" | "milky-way-lab" | "game-lab" | "physics-lab" | "input-device-lab" | "map-editor" | "math-lab" | "editor-lab" | "cubx-lab" | "cubx-actor-lineage" | "asset-catalog";

export type ArchiveMode = {
  id: ArchiveModeId;
  label: string;
  summary: string;
  source: string;
};

export type ArchiveRecoveryItem = {
  label: string;
  source: string;
  status: "ported" | "preview" | "pipeline";
  detail: string;
};

export type ArchiveSceneStatus = "RESTORED" | "PARTIAL" | "REGRESSED" | "PIPELINE" | "MISSING" | "RESEARCH";

export type ArchiveSceneKind =
  | "Application screen"
  | "Runtime scene"
  | "Authored BallZ level"
  | "BallZ concept"
  | "3D environment"
  | "Vehicle scene"
  | "Gameplay experiment"
  | "Engine demonstration";

export type ArchiveSceneRecord = {
  family: string;
  name: string;
  kind: ArchiveSceneKind;
  source: string;
  status: ArchiveSceneStatus;
  revival: string;
};

export const ARCHIVE_MODES: ArchiveMode[] = [
  {
    id: "race",
    label: "BallZ Race",
    summary: "Playable shell/inner-ball race loop, rings, gates, moving hazards, and archive-textured arena maps.",
    source: "Scene3D/GamePlayScreen.cpp, GraphysX_1/ZombieKiller.cpp"
  },
  {
    id: "scene-index",
    label: "Scene Index",
    summary: "Evidence-based census of every distinct screen, runtime scene, authored level, environment, vehicle scene, and standalone demo found in the audited archives.",
    source: "ARCHIVE_SCENE_CENSUS.md"
  },
  {
    id: "scene-lab",
    label: "Scene Lab",
    summary: "Recovered sky, terrain, water, spline, sun/moon, and environment experiments as a navigable preview.",
    source: "GraphysX_1/Sky.cpp, Atmosphere.cpp, Spline.xml, Heightmaps"
  },
  {
    id: "milky-way-lab",
    label: "Voie Lactée Vignette",
    summary: "The archived five-body planetary component—Earth, clouds, Moon, Mars and Venus—correctly presented as a scene subsystem, not a generated star field.",
    source: "VoieLactee.cpp; GraphysX_1/Scene.cpp::CreateVoieLactee"
  },
  {
    id: "nature-lab",
    label: "Nature Lab",
    summary: "Agent-controllable living worlds: spherical flocking, forces and flow fields, and a generative forest with seasonal DNA.",
    source: "WindriderQc/SBQC/public/js, public/nature-of-code"
  },
  {
    id: "world-api-lab",
    label: "Agent World Studio",
    summary: "GraphysX World API v2: agents create and inspect entities, lights, materials, behaviors, transactions, and persistent world snapshots.",
    source: "GraphysX agent-world/v2 runtime"
  },
  {
    id: "skybox-selector",
    label: "Skybox Selector",
    summary: "The archived five-cube ring: click a rotating sky icon, chase into it, then orbit inside the selected panorama.",
    source: "Yanik C++ BCKUP/CubXSolution/3DScenes.cpp; CLSkybox.cpp"
  },
  {
    id: "car-selector",
    label: "Car Selector",
    summary: "The authentic one-Impreza terrain/water preview and free camera; the archived car-click callback was empty, so no selection commit is invented.",
    source: "Yanik C++ BCKUP/CubXSolution/3DScenes.cpp; Vehicule.cpp"
  },
  {
    id: "vehicle-pack-gallery",
    label: "GT4 / Low Cobra Source Gallery",
    summary: "Exact archived 3DS geometry and textures for the two orphaned car packs, explicitly separated from the one-Impreza selector and vehicle physics.",
    source: "Media/Models/cars/gt4.3DS; Low_Cobra.3DS; archived selector/CLVehicule audit"
  },
  {
    id: "common-room-lab",
    label: "Standalone 3D Environments",
    summary: "Separate visits to Common Room 1, the sky.tvm skydome component, and Room 2's evidenced shadow-mapping assembly.",
    source: "common/room.tvm; common/sky.tvm; common/room2.tvm; #23 HLSL_Shadow_Mapping/main.cpp"
  },
  {
    id: "threejs-playground",
    label: "Three.js Playground",
    summary: "The recovered SBQC browser composition: Asteroids sky, orbiting airplane, shader-morphing spheres, red procedural terrain, Earth spheres, animated light, and source-bounded inspection controls.",
    source: "SBQC/public/Projects/3D Playground"
  },
  {
    id: "ballz-blender-level1",
    label: "BallZ / Blender Level 1",
    summary: "The complete best 2017 Blender composition—exact 356-vertex level geometry, source camera, point light and material—as an authored visit with no invented race rules.",
    source: "blenderModel/Levels/Level1.blend; best-revision FBX export"
  },
  {
    id: "maison-explorer",
    label: "Maison Explorer",
    summary: "The best surviving house and 87-object kitchen compositions as one explorer with source cameras, lights, materials, hierarchy, and separate House/Kitchen subspaces.",
    source: "blenderModel/Maison/maison.blend; Cuisine.blend"
  },
  {
    id: "arena-archive",
    label: "Unity Arena Archive",
    summary: "The complete small 2017 Unity arena scene: exact authored octagonal mesh, hand-painted 1024² atlas, Standard material, object transform, source camera and directional light.",
    source: "bckup/Unity Projects/Arena/Assets/Arena.unity; Models/Arena.obj; Textures/arena.png"
  },
  {
    id: "ballz-2011-level1",
    label: "BallZ 2011 Level1 Mesh",
    summary: "Exact decoded Level1.TVM geometry as a non-race BallZ concept visit; neutral material and presentation are labeled inference because no gameplay or texture binding survives.",
    source: "BallZ 2011/Release/Media/Level1.TVM"
  },
  {
    id: "ballz-slide1",
    label: "BallZ Slide 1 Assembly",
    summary: "The source-loaded Atmel Slide1.TVM, Ball.tvm spawn, chase offset, material, gravity and contact constants as a source-backed non-race visit.",
    source: "AtmelCubx/Slide.cpp; Level.cpp; Media/Models/Slide1.tvm; Ball.tvm"
  },
  {
    id: "ballz-track-gallery",
    label: "BallZ Slide / Track Gallery",
    summary: "Six distinct remaining BallZ-era slide and track meshes as exact, evidence-bounded non-gameplay visits with source materials, topology, host boundaries and diagnostics.",
    source: "Slide1a.tvm; Level.Slides.TVM; Level.Steps.TVM; SlideBump*.TVM; BallZTrack1.tvm"
  },
  {
    id: "suzanne2-archive",
    label: "Suzanne 2 Authored Level",
    summary: "The distinct playable 40×40 Suzanne2.ASCII/XML composition with exact source actors, three faithfully vendored X meshes, and the active any-two-of-fifteen ring rule preserved.",
    source: "Scene3D/GamePlayScreen.cpp; GraphysX_1/Scene.cpp; Suzanne2.ASCII; Suzanne2.xml"
  },
  {
    id: "xml-myworld-copy",
    label: "MyWorld — Copy XML Scene",
    summary: "A source-authored seven-object XML test composition with four procedural physics shapes and two exact TVM assets; the absent Chinese arch remains visibly unresolved.",
    source: "BallZ2015.bckup/Media/MyWorld - Copie.xml; AirplaneLP.TVM; Level2.TVM"
  },
  {
    id: "ballz-xml-worlds",
    label: "MyWorld / TestWorld XML Evidence",
    summary: "Two distinct serialized BallZ scene documents rendered from their own action tables, with malformed duplicate records kept unresolved.",
    source: "BallZ2015.bckup/Media/MyWorld.xml; TestWorld.xml"
  },
  {
    id: "object-library-catalog",
    label: "ObjectLibrary Catalog Grid",
    summary: "The exact 61-entry editor/catalog grid with 47 recovered objects, 13 explicit missing records, one unsupported binary asset, family/status filters, and no invented village layout.",
    source: "Archive/bckup/BallZ2015.bckup/Media/ObjectLibrary.xml"
  },
  {
    id: "dominus-asset-gallery",
    label: "Dominus Source Asset Gallery",
    summary: "All 65 proven Dominus source assets as a one-model inspection gallery: 63 exact text-X recoveries and two explicit unsupported binary-X records, without inventing the absent village/port composition.",
    source: "Yanik C++ BCKUP/Media/Dominus/*.X; deterministic source/texture audit"
  },
  {
    id: "dominus-port-evidence",
    label: "Dominus Port Placement Evidence",
    summary: "The only surviving multi-asset Dominus placement: all 28 port rows from ObjectLibrary.xml in exact source order/transforms, explicitly identified as an editor catalog grid rather than an authored village.",
    source: "Archive/bckup/BallZ2015.bckup/Media/ObjectLibrary.xml; 28 port-prefixed rows"
  },
  {
    id: "game-lab",
    label: "Engine & FX",
    summary: "Live particles, flame/flare textures, actors, mouse-pick aim, projectiles, trigger zones, and impact staging.",
    source: "ParticleEffect.cpp, ParticleEngine.cpp, Effect.cpp, Zombie*.cpp, Agent.cpp"
  },
  {
    id: "physics-lab",
    label: "Physics Lab",
    summary: "Live Newton-style constraint playground: hinged seesaw, swinging pendulum chain, rigid box stack, and an auto-resetting wrecking ball.",
    source: "Newton joints (GraphysX_1), Scene3D physics callbacks"
  },
  {
    id: "input-device-lab",
    label: "Input & Device Lab",
    summary: "One simulation-first best-version lab for BallZ18 controller diagnostics, GraphysX robot/sonar protocols, AtmelCubx I/O schedules, and MeArm controls.",
    source: "BallZ18 SerialComm + ArduinoCtrl; GraphysX ArduinoGUI; AtmelCubx device-control lineage"
  },
  {
    id: "map-editor",
    label: "BallZ Map Editor",
    summary: "Shared human/agent library for named BallZ maps with region edits, ASCII adapters, live 3D preview, and playable compilation.",
    source: "GraphysX_1/Scene.cpp BuildASCIIScene, Scene3D/EditorScreen.cpp"
  },
  {
    id: "math-lab",
    label: "Math Game",
    summary: "The formula/molecule screen rebuilt as a visible workbench with presets, live A/B/C/M/X controls, and a 3D field.",
    source: "Scene3D/MathGameScreen.cpp, Formulas.cpp"
  },
  {
    id: "editor-lab",
    label: "Editor Lab",
    summary: "Map-editor flow for load/save/clear/add mesh, selected object telemetry, and primitive scene assembly.",
    source: "Scene3D/EditorScreen.cpp, GfxNet/SceneNET.h"
  },
  {
    id: "cubx-lab",
    label: "CubZ Menu",
    summary: "Interactive eight-cube menu: rotate selection, unfold four internal panels, choose an action, then close and rotate home.",
    source: "CubZ.cpp, CubeRot.tva, CubeOpen.tva, MenuManager.cpp"
  },
  {
    id: "cubx-actor-lineage",
    label: "CubX Actor Lineage Inspector",
    summary: "A separate source-evidence inspector for the older Closed/Get/Rot/Open CubXActor family, exact click meshes, terminal holds, and the broken eighth actor slot—without conflating its unstable BoxNN labels with CubZ.",
    source: "Media/CubXActor/*.tva; CubXBtn*.tvm; CubXActor.cpp; CubXMenu.cpp"
  },
  {
    id: "notes-manager-lab",
    label: "CubX 3D Notes",
    summary: "The exact implemented 50-slot marble add-note block, kept within CubX systems; the absent note text/edit/save GUI is not invented.",
    source: "AtmelCubx/NotesManager.cpp; BlocNote.cpp; Note.cpp; Area.cpp"
  },
  {
    id: "xml-serializer-artifacts",
    label: "XML Serializer Artifacts",
    summary: "Exact inspection of BaseScene.xml and test1.xml as schema/save fixtures—not composed worlds and not entries in the scene census.",
    source: "StockRoom/BaseScene.xml; StockRoom/test1.xml; exact duplicate/signature audit"
  },
  {
    id: "asset-catalog",
    label: "Asset Catalog",
    summary: "Texture, shader, model, and XML recovery board for TVM/X/OBJ assets that still need conversion.",
    source: "Archive/bckup/BallZ2015.bckup/Media"
  }
];

// Distinct scene implementations and authored scene resources only. Repeated
// backup copies and individual prop/model files are deliberately de-duplicated.
// The matching long-form evidence ledger lives at ../ARCHIVE_SCENE_CENSUS.md.
export const ARCHIVE_SCENES: ArchiveSceneRecord[] = [
  {
    family: "Scene3D application flow",
    name: "Main Menu",
    kind: "Application screen",
    source: "Scene3D/MainMenuScreen.cpp; ScreenIndices.h; BallZ18/Assets/!Scenes/MainMenu.unity",
    status: "RESTORED",
    revival: "Modern project-family home is visible, navigable, versioned, and verified."
  },
  {
    family: "Scene3D application flow",
    name: "Select Race",
    kind: "Application screen",
    source: "Scene3D/SelectRaceScreen.cpp; BallZ18/Assets/!Scenes/TrackSelect.unity",
    status: "RESTORED",
    revival: "BallZ Tour exposes every challenge, archive references, records, and load state."
  },
  {
    family: "Scene3D application flow",
    name: "Gameplay",
    kind: "Application screen",
    source: "Scene3D/GamePlayScreen.cpp",
    status: "PARTIAL",
    revival: "Playable shell/controller and vehicle loops work; legacy behavior and content fidelity remain."
  },
  {
    family: "Scene3D application flow",
    name: "After Race",
    kind: "Application screen",
    source: "Scene3D/AfterRaceScreen.cpp",
    status: "RESTORED",
    revival: "Completion, time, medal, record, replay, and next-scene flow are working."
  },
  {
    family: "Scene3D application flow",
    name: "Scene Editor Screen",
    kind: "Application screen",
    source: "Scene3D/EditorScreen.cpp; GfxNet/SceneNET.h",
    status: "PARTIAL",
    revival: "Tile editor and editor preview exist; full object authoring and legacy scene I/O do not."
  },
  {
    family: "Scene3D application flow",
    name: "Math Game Screen",
    kind: "Application screen",
    source: "Scene3D/MathGameScreen.cpp; Formulas.cpp; BallZ18/Assets/!Scenes/MathGames.unity",
    status: "PARTIAL",
    revival: "Formula UI, 10,000-point field, exact six-face 1024px NightSky, recovered CEGUI control vocabulary, and the BallZ18 Unity a=.01/b=0/c=100/m=5 preset work. The surviving implementations define no score/goal loop; Stargate composition and exact layout positioning remain."
  },
  {
    family: "ArduinoGUI screen flow",
    name: "Intro Physics Showcase",
    kind: "Application screen",
    source: "GraphysX/ArduinoGUI/.../IntroScreen.cs",
    status: "PARTIAL",
    revival: "Physics Lab covers constraint/stack ideas, but not the original alien-floor light-and-cylinder composition."
  },
  {
    family: "ArduinoGUI screen flow",
    name: "Arduino Math Screen",
    kind: "Application screen",
    source: "GraphysX/ArduinoGUI/.../MathScreen.cs",
    status: "PARTIAL",
    revival: "Covered by Math Game workbench, without exact screen composition."
  },
  {
    family: "ArduinoGUI screen flow",
    name: "Arduino BallZ Screen",
    kind: "Application screen",
    source: "GraphysX/ArduinoGUI/.../BallZScreen.cs",
    status: "PARTIAL",
    revival: "Covered by the modern BallZ loop; this specific screen version is not reconstructed."
  },
  {
    family: "Legacy scene classes",
    name: "Default Terrain / Atmosphere Scene",
    kind: "Runtime scene",
    source: "Yanik C++ BCKUP/3DScenes.h: CLDefaultScene",
    status: "PARTIAL",
    revival: "Scene Lab has terrain, sharp archive skies, animated distortion water, day/night lighting, and a haze pass; authored heightmaps and reflection/refraction remain."
  },
  {
    family: "Legacy scene classes",
    name: "BallZ Scene",
    kind: "Runtime scene",
    source: "Archive/bckup/3DScenes.h: CLBallZScene",
    status: "PARTIAL",
    revival: "Core shell/controller, race physics, rings, and gates are playable."
  },
  {
    family: "Legacy scene classes",
    name: "Car Scene",
    kind: "Vehicle scene",
    source: "AtmelCubx/AtmelCubx/CarScene.cpp",
    status: "PARTIAL",
    revival: "One Impreza/Piste trial works; terrain scene, opponents, and networking are absent."
  },
  {
    family: "Legacy scene classes",
    name: "Skybox Selector",
    kind: "Runtime scene",
    source: "Yanik C++ BCKUP/3DScenes.cpp: CLSkyboxSelectScene",
    status: "PARTIAL",
    revival: "Dedicated mode restores the five 50-unit cubes on a 125-unit ring, archived camera, 50°/s rotation, click/zoom transition, and panorama orbit; exact collision-timed chase remains approximated."
  },
  {
    family: "Legacy scene classes",
    name: "Car Selector",
    kind: "Vehicle scene",
    source: "CubXSolution/3DScenes.cpp: CLCarSelectScene",
    status: "PARTIAL",
    revival: "Dedicated mode restores the one-Impreza terrain, water, gravity drop, archived camera, and free-camera preview; the original MeshClickedAction was empty, so no false selection flow is added."
  },
  {
    family: "CubX / Atmel",
    name: "CubX Hub World",
    kind: "Runtime scene",
    source: "AtmelCubx/AtmelCubx/CubXScene.cpp",
    status: "PARTIAL",
    revival: "Earth/grid, clock and controls remain represented by a partial hub preview; a separate exact-geometry CubXActor lineage inspector now exposes Closed/Get/Rot/Open clips, click meshes, timing/holds and the broken eighth slot without conflating that older family with CubZ."
  },
  {
    family: "CubX / Atmel",
    name: "CubZ Animated Cube Menu",
    kind: "Runtime scene",
    source: "AtmelCubx/AtmelCubx/CubZ.cpp; MenuManager.cpp",
    status: "PARTIAL",
    revival: "Eight cubes use the exact CubZ.cpp 58-unit hit-box size and eight source centers. Cube 0 opens immediately; selections 1–7 use the decoded CubeRot ranges and CubeOpen frames 0–50 at 30 fps, while reverse playback explicitly repairs the archived off-by-one animation-ID defect. Original actor/button geometry and verified TV3D-to-web handedness remain."
  },
  {
    family: "CubX / Atmel",
    name: "FlightX Pipe Flight",
    kind: "Runtime scene",
    source: "AtmelCubx/AtmelCubx/FlightXScene.cpp; pipe1.tvm",
    status: "PARTIAL",
    revival: "Decoded pipe1 and archive airplane are playable with the source-derived roll/pitch/thrust/airbrake/reset controls, dedicated HUD, and a verified 14-gate recovery route; exact mission intent and final handling balance remain."
  },
  {
    family: "CubX / Atmel",
    name: "Notes Manager",
    kind: "Runtime scene",
    source: "AtmelCubx/AtmelCubx/Area.h: NOTEMGR_MODE; NotesManager.cpp",
    status: "PARTIAL",
    revival: "Dedicated CubX-system visit preserves the exact 50-slot marble note block, zero-note initial state, 30-unit add cube, source placement, sequential activation, and reset. The absent GUI layout and nonexistent text/edit/delete/save/load model remain explicit."
  },
  {
    family: "CubX / Atmel",
    name: "CubX Screensaver",
    kind: "Runtime scene",
    source: "AtmelCubx/AtmelCubx/Screensaver.cpp; CubXScreensaver.tva",
    status: "PARTIAL",
    revival: "The verified 10-second idle camera orbit and 5-degree/second behavior are ported; the original CubXScreensaver TVA animation, aim target, and settings UI remain."
  },
  {
    family: "Device and input diagnostics",
    name: "Input & Device Lab",
    kind: "Engine demonstration",
    source: "BallZ18 SerialComm + ArduinoCtrl; GraphysX ArduinoGUI; AtmelCubx device-control lineage",
    status: "PARTIAL",
    revival: "Best-version merger: live source-mapped gamepad axes/buttons, five simulated serial profiles, exact robot command frames, 182-point sonar radar, eight-channel I/O, four schedules, and repaired MeArm controls. Simulation is always the default; hardware transport remains opt-in and permission-gated, and no legacy scene auto-opens or scans ports."
  },
    {
      family: "SBQC browser worlds",
      name: "Three.js Playground",
      kind: "Engine demonstration",
      source: "SBQC/public/Projects/3D Playground",
      status: "RESTORED",
      revival: "The complete browser-native composition is reachable with its exact Asteroids faces, Airplane.glb, Earth and cube textures; the orbiting airplane, three source shaders, procedural raycastable terrain, Earth spheres, animated light and disclosed inspection camera are live. All 16 source dat.GUI controls and the original FPS value/progress/color bands are restored through native UI and the same public API. The hash-identical iGrow copy remains an alias."
  },
    {
      family: "BallZ authored geometry",
      name: "BallZ / Blender Level 1 Prototype",
      kind: "BallZ concept",
      source: "blenderModel/Levels/Level1.blend; Unity Projects/BallZ/Assets/Models/Level1.fbx",
      status: "RESTORED",
      revival: "The best 356-vertex / 354-polygon Blender revision is reachable with its exact authored mesh, source camera, point light and material. It remains correctly categorized as a complete geometry visit—not a race—because no host scene, spawn, physics, controls, checkpoints, rules or objective survives. The older .blend1 and earlier Unity FBX remain revisions/evidence rather than duplicate scenes."
    },
    {
      family: "Standalone authored interiors",
      name: "Maison Explorer",
      kind: "3D environment",
      source: "blenderModel/Maison/maison.blend; Cuisine.blend",
      status: "RESTORED",
      revival: "One canonical explorer exposes the complete best house (31 objects, 24 meshes, six lights) and kitchen (87 objects, 76 meshes, seven hierarchy empties, three lights) as source-camera/overview subspaces. The kitchen's one absent unpacked Desktop JPG remains an explicit saved-source dependency rather than receiving a fabricated substitute; older .blend1 files are not separate scenes."
  },
  {
    family: "Standalone Unity environments",
    name: "Unity Arena Archive",
    kind: "3D environment",
    source: "bckup/Unity Projects/Arena/Assets/Arena.unity; Models/Arena.obj; Textures/arena.png",
    status: "RESTORED",
    revival: "The complete surviving scene is reachable with its exact 48-vertex / 44-face OBJ, hand-painted 1024² atlas, Unity Standard material values, authored object transform, source 60° camera and directional-light orientation. A disclosed overview, neutral fill and double-sided rasterization are presentation adapters; no gameplay is invented because the project contains no scripts or rules."
  },
  {
    family: "BallZ authored arenas",
    name: "Archive Level 1 — ASCII",
    kind: "Authored BallZ level",
    source: "StockRoom/levelList.xml; Level1_base.ASCII; screenShotLevel1.png",
    status: "PARTIAL",
    revival: "Exact 20×20 layout, 20 checkpoints, four posts, @ spawn, three laps, 0.3-radius BallZ, ClearBlue sky, Alien01_B floor, screenshot-derived tile treatment, and archived best time are playable; camera/light and handling fidelity remain."
  },
  {
    family: "BallZ authored arenas",
    name: "Archive Level 2 — ASCII",
    kind: "Authored BallZ level",
    source: "StockRoom/levelList.xml; Level2_base.ASCII; screenShotLevel2.png",
    status: "PARTIAL",
    revival: "Exact 20×20 layout, 20 checkpoints, four posts, @ spawn, three laps, 0.3-radius BallZ, LostValley sky, checker floor, Wood03 diffuse/normal tiles, ten deterministic human proxies, and archived best time are playable; human/camera/light and handling fidelity remain."
  },
  {
    family: "BallZ authored arenas",
    name: "Archive Level 3 — ASCII",
    kind: "Authored BallZ level",
    source: "StockRoom/levelList.xml; Level3_base.ASCII; screenShotLevel3.png",
    status: "RESTORED",
    revival: "Exact 20×19 M/r/$ bytes now drive both the legacy race and a composed v2 game: 178 raised arrow/Alien02 platforms above the source bAddFloor Alien02 diffuse+normal catch floor, 20 checkpoints, four posts joined into the recorded LINE gates, authored spawn, 0.3-radius recovered BallZ appearance, NightSky, three laps and archived best time. The Metal03 family still has no proven Level 3 binding; PBR exposure, Rapier materials and shared steering remain disclosed adapters."
  },
  {
    family: "BallZ authored arenas",
    name: "BallZ18 Level 01 — AI Circuit",
    kind: "Authored BallZ level",
    source: "BallZ18/Assets/!Scenes/Level01.unity; Assets/Mesh/L1_floor.blend; CtrlerAI_Ball.cs; TargetLooper.cs",
    status: "PARTIAL",
    revival: "Exact eight-object blue/red Blender circuit, source starts, seven-point Raceline, 0.5-radius player, torque-driven BallAI with the scene's angular cap, local textured wood cube, repaired countdown lock, byte-identical 3/2/1 and GO audio, and exact half/lap trigger segments are playable. The source loops lap splits indefinitely, so the terminal three-lap challenge is explicitly a canonical revival adapter; mouse-hold steering and Unity cage option remain. Imported Standard Assets are intentionally excluded."
  },
  {
    family: "BallZ authored arenas",
    name: "Suzanne 1",
    kind: "Authored BallZ level",
    source: "Suzanne1.ASCII; Suzanne1.xml; Suzanne1.png",
    status: "PARTIAL",
    revival: "The correct 40×40 ASCII arena replaces the unrelated circular machinery study: 208 walls, 45 chains, 15 checkpoints, three pistons, two effects, exact 0.3-radius BallZ/start/gates and three-lap play are live. CubX actors, airplane integration, legacy HUD/camera and exact pre-2017 bindings remain."
  },
  {
    family: "BallZ authored arenas",
    name: "Suzanne 2",
    kind: "Authored BallZ level",
    source: "StockRoom/Suzanne2.ASCII; Suzanne2.xml",
    status: "PARTIAL",
    revival: "The visit is now also a v2 game: exact 40×40 layout, 315 dynamic collision cubes, 15 rings, chains, moving pistons, gates, effects, player cage, Airplane, BonedGate and XML billboard. The active source's any-two-pickup advance is faithfully executable through a threshold rule; no corrected 15-ring objective, missing CubX actor animation, Rotator placement, lap target, sky or screenshot-era presentation is invented."
  },
  {
    family: "BallZ world concepts",
    name: "World 1",
    kind: "BallZ concept",
    source: "StockRoom/World1*.TVM",
    status: "PARTIAL",
    revival: "Decoded assembled geometry is visitable with a prototype ring trial; original materials and intent remain."
  },
  {
    family: "BallZ world concepts",
    name: "Map 1 (2011)",
    kind: "BallZ concept",
    source: "Yanik C++ BCKUP/BallZ 2011/BallZ/Map1.TVM",
    status: "PARTIAL",
    revival: "Exact 699-vertex / 1,456-triangle decoded geometry now ships as a scene-native trimesh and an adapted one-gate gravity descent with controls, results, replay, and return. Original materials, controller, spawn, checkpoint intent, camera, timing, and authored play rules remain unrecovered."
  },
  {
    family: "BallZ world concepts",
    name: "BallZ 2011 Level 0",
    kind: "BallZ concept",
    source: "Yanik C++ BCKUP/BallZ 2011/Release/Media/Level0.TVM",
    status: "PARTIAL",
    revival: "Level0.TVM is byte-identical to SlideLarge.TVM; the decoded Great Slide is reachable and playable. Authored materials, original rules, checkpoint intent, and finish-loop fidelity remain."
  },
  {
    family: "BallZ world concepts",
    name: "BallZ 2011 Level 1",
    kind: "BallZ concept",
    source: "Yanik C++ BCKUP/BallZ 2011/Release/Media/Level1.TVM",
    status: "PARTIAL",
    revival: "Dedicated non-race concept visit preserves the exact 828-vertex / 1,648-triangle Level1.TVM mesh, two closed components, reversible display normalization, and diagnostics. No loader, texture binding, camera, spawn, rules, or objectives survive, so none are invented."
  },
  {
    family: "BallZ slide concepts",
    name: "Slide 1",
    kind: "BallZ concept",
    source: "AtmelCubx/Slide.cpp; Level.cpp; Media/Models/Slide1.tvm; Ball.tvm",
    status: "PARTIAL",
    revival: "Dedicated non-race visit preserves the active 566-vertex / 552-triangle Slide1 revision, exact slide and Ball.tvm transforms, 5,000 mass, chase offset, gravity, material and contact constants. Play remains withheld because only backward impulse survives and the 100 rings are explicitly temporary."
  },
  {
    family: "BallZ slide concepts",
    name: "Slide 1A",
    kind: "BallZ concept",
    source: "BallZ 2011/Release/Media/Slide1a.tvm",
    status: "PARTIAL",
    revival: "Exact 2,271-vertex / 2,849-triangle legacy slide is now visitable in the six-source gallery. Its older static CLBallZ loader, position and StdMat override survive; the later Ball assembly is not borrowed."
  },
  {
    family: "BallZ slide concepts",
    name: "Level.Slides",
    kind: "BallZ concept",
    source: "StockRoom/Level.Slides.TVM",
    status: "PARTIAL",
    revival: "Exact 792-vertex / 1,524-triangle, three-group geometry/material study is visitable. No host assembly or behavior survives, so no gameplay is invented."
  },
  {
    family: "BallZ slide concepts",
    name: "Level.Steps",
    kind: "BallZ concept",
    source: "StockRoom/Level.Steps.TVM",
    status: "PARTIAL",
    revival: "Exact 200-vertex / 120-triangle three-group study is visitable with hash-locked grass, concrete and wood bindings. No host behavior survives."
  },
  {
    family: "BallZ slide concepts",
    name: "Slide Bump",
    kind: "BallZ concept",
    source: "StockRoom/SlideBump.TVM",
    status: "PARTIAL",
    revival: "Exact 699-vertex / 1,456-triangle topology study is visitable with its zero material record disclosed and neutral inspection fallback; no host/gameplay survives."
  },
  {
    family: "BallZ slide concepts",
    name: "Slide Bump GridTex",
    kind: "BallZ concept",
    source: "StockRoom/SlideBumpGridTex.TVM",
    status: "PARTIAL",
    revival: "Distinct 685-vertex / 1,456-triangle textured revision is visitable with exact EarthGri binding and topology evidence; it is not merged with Slide Bump."
  },
  {
    family: "BallZ slide concepts",
    name: "BallZ Track 1",
    kind: "BallZ concept",
    source: "BallZ 2011/Release/Media/BallZTrack1.tvm",
    status: "PARTIAL",
    revival: "Exact 385-vertex / 447-triangle hosted track is visitable with source transform, Ball spawn and camera/chase evidence. Update/input are absent or commented and temporary rings are not promoted into gameplay."
  },
  {
    family: "Archived scene documents",
    name: "MyWorld",
    kind: "3D environment",
    source: "Archive/bckup/BallZ2015.bckup/Media/MyWorld.xml",
    status: "PARTIAL",
    revival: "Dedicated evidence visit renders the exact Airplane.TVM and physics-cylinder records, while both malformed DUPLICATE path targets stay unresolved. The document's own embedded action table is used and no finished-world claim is made."
  },
  {
    family: "Archived scene documents",
    name: "MyWorld — Copy",
    kind: "3D environment",
    source: "Archive/bckup/BallZ2015.bckup/Media/MyWorld - Copie.xml",
    status: "PARTIAL",
    revival: "Dedicated visit preserves all seven serialized transforms and physics metadata, renders four exact procedural definitions plus exact AirplaneLP.TVM and Level2.TVM, and leaves the absent ArcheChinois.TVM unresolved. Camera/lights are disclosed inspection choices and physics is not simulated without host configuration."
  },
  {
    family: "Archived scene documents",
    name: "TestWorld",
    kind: "3D environment",
    source: "Archive/bckup/BallZ2015.bckup/Media/TestWorld.xml",
    status: "PARTIAL",
    revival: "Dedicated evidence visit renders four exact serialized primitives plus AirplaneLP.TVM. The absent bush1.X and two invalid empty duplicate targets remain unresolved; this loader fixture is not presented as a finished world."
  },
  {
    family: "Archived scene documents",
    name: "ObjectLibrary Catalog Grid",
    kind: "3D environment",
    source: "Archive/bckup/BallZ2015.bckup/Media/ObjectLibrary.xml",
    status: "PARTIAL",
    revival: "Dedicated catalog browser preserves all 61 serialized records and transforms: 47 recovered objects, 13 explicit missing records, and one unsupported binary X asset. It exposes family/status filters, selection and orbit without inventing a village or substituting proxies."
  },
  {
    family: "Archived sub-scenes",
    name: "Spline Flight Path",
    kind: "Engine demonstration",
    source: "Archive/.../Media/Spline.xml; GraphysX_1/Spline3D.cpp",
    status: "PARTIAL",
    revival: "A spline and airplane proxy are visible in Scene Lab; original motion/mesh remain."
  },
  {
    family: "Archived sub-scenes",
    name: "Anneaux / Ring Field",
    kind: "Engine demonstration",
    source: "Archive/bckup/Anneaux.cpp; Media/Anneaux.xml",
    status: "PARTIAL",
    revival: "Ring/checkpoint systems work in races, but this distinct authored sub-scene is not reconstructed."
  },
  {
    family: "Archived sub-scenes",
    name: "Voie Lactée / Milky Way",
    kind: "Engine demonstration",
    source: "Archive/bckup/VoieLactee.cpp",
    status: "PARTIAL",
    revival: "Dedicated component visit corrects the classification: five textured planetary bodies, not a star field. Exact later assets/transforms and the partial older rotation/orbit profile are live; no authored standalone camera/host scene survives."
  },
  {
    family: "Standalone environments",
    name: "Common Room",
    kind: "3D environment",
    source: "common/room.tvm",
    status: "PARTIAL",
    revival: "Discoverable standalone visit preserves the exact 180-vertex / 250-triangle inward shell and archived logo diffuse/normal DDS maps. No authored host assembly survives, so camera and lighting are explicitly inferred."
  },
  {
    family: "Standalone environments",
    name: "Common Room 2 / Sky Space",
    kind: "3D environment",
    source: "common/room2.tvm; #23 HLSL_Shadow_Mapping/main.cpp; common/shaders/meshlight.shade; common/sky.tvm",
    status: "PARTIAL",
    revival: "Room 2 is a discoverable standalone shadow lab with decoded indexed geometry, archived transforms, logo diffuse/normal DDS maps, teapot, point light, A/D orbit, and the translated meshlight.shade normal-alpha parallax/Lyon specular math. Its missing source specular-map binding and Three point-shadow kernel are disclosed adaptations. The exact 726-vertex / 1,200-triangle sky.tvm skydome is separately inspectable as a component, not miscounted as its own scene."
  },
  {
    family: "Standalone environments",
    name: "Dominus Village / Port Environment",
    kind: "3D environment",
    source: "Dominus asset collection; ObjectLibrary.xml 28-row port subset; no surviving authored host composition",
    status: "PARTIAL",
    revival: "The exact 28-row port placement evidence is a dedicated visit with 27 decoded meshes and one explicit binary-X boundary. The source layout is disclosed as an editor catalog grid, while the separately playable village tour is labeled a modern curated visit rather than authored recovery."
  },
  {
    family: "Vehicle experiments",
    name: "Piste Ovale / Impreza",
    kind: "Vehicle scene",
    source: "Piste Ovale.TVM; Impreza 3DS/material set",
    status: "PARTIAL",
    revival: "Driveable trial has corrected nose, throttle wake-up, and undercarriage; handling/material groups and dedicated vehicle UI remain."
  },
  {
    family: "Gameplay experiments",
    name: "ZombieKiller",
    kind: "Gameplay experiment",
    source: "GraphysX_1/ZombieKiller.cpp; Zombie.cpp; Human.cpp",
    status: "PARTIAL",
    revival: "Playable squash loop works; shooting, infection depth, models, and broader AI remain."
  },
  {
    family: "Standalone demonstrations",
    name: "HLSL Shadow Mapping #23",
    kind: "Engine demonstration",
    source: "#23 HLSL_Shadow_Mapping",
    status: "PARTIAL",
    revival: "Room 2 Shadow Lab reconstructs the demo's exact room2 transform, teapot/light assembly, DDS bump maps, black background and A/D orbit, and now runs the archived HLSL normal-alpha parallax, Lyon specular and 0.15 diffuse-floor equations. Three point-shadow PCF replaces the old 25-offset cube sampler; the absent SpecMap binding uses a visibly disclosed diffuse-red mask."
  }
];

export const SCENE_RECOVERY_ITEMS: ArchiveRecoveryItem[] = [
  {
    label: "Skyboxes",
    source: "Media/Sky/ClearBlue, ClearNight, SkyX, Winter",
    status: "ported",
    detail: "Archive cube sets are registered scene vocabulary (`api.skies()` and the editor), retain their recovered face orientation, and bind per scene/level. Source limits remain: most faces are 512 px, Winter is 256 px, and LostValley is 1024 px."
  },
  {
    label: "Heightmaps",
    source: "Media/Heightmaps/Track.jpg, heightmap8.jpg",
    status: "ported",
    detail: "Three archived Windows heightmaps are decoded with SHA/provenance into the terrain registry; terrain entities render the recovered samples and build matching Rapier heightfield colliders."
  },
  {
    label: "Day/Night",
    source: "GraphysX_1/Sky.cpp, Archive Atmosphere.cpp",
    status: "ported",
    detail: "The source Sky.cpp/Atmosphere.cpp orbit, daylight and logistic-brightness curves now run both in the player-visible race worlds and as scene-native `environment.dayNight` vocabulary. The editable observatory binds ClearBlue HD/Lilienstein by day and NightSky/Vignaioli by night; those image endpoints are disclosed adaptations because the archived cycle did not record them."
  },
  {
    label: "Spline Flight",
    source: "Media/Spline.xml, Media/Airplane/Airplane.x",
    status: "ported",
    detail: "FlightX is a dedicated playable pipe trial using the recovered airplane asset and spline-follow vocabulary; the earlier Scene Lab proxy remains only as an overview."
  }
];

export const NATURE_RECOVERY_ITEMS: ArchiveRecoveryItem[] = [
  {
    label: "Flock Planet",
    source: "SBQC/public/js/Boid3D.js, Flock3D.js, threejs_setup.js",
    status: "ported",
    detail: "A deterministic spherical flock now combines separation, alignment, cohesion, orbital trails, a textured planet, atmosphere, and stars in one reusable runtime."
  },
  {
    label: "Forces & Flow Garden",
    source: "SBQC/public/nature-of-code/s2/*, sAll/flowfield*, sAll/path*",
    status: "ported",
    detail: "Mass-aware movers, inverse-square attraction, autonomous walkers, and a visible vector field form a tunable physics garden."
  },
  {
    label: "Living Forest",
    source: "SBQC/public/nature-of-code/s4/*, s5/forest*, s5/ecosystem*",
    status: "ported",
    detail: "Seeded recursive trees, instanced DNA leaves, seasonal growth and fall, and visible generations turn the sketches into a persistent 3D study."
  },
  {
    label: "Orbital Observatory",
    source: "SBQC/public/js/Globe.js, Trajectory.js, Starfield.js, earth3D.js, threeEarth.js; public/data/quakes.csv",
    status: "ported",
    detail: "Layered source Earth textures, independent clouds, a 51.6° ISS trajectory, observer pass prediction, the source ISS cutout, and 160 high-magnitude quake events now form a live telemetry world."
  },
  {
    label: "World Recipe API",
    source: "GraphysX graphysx.world/v1 contract",
    status: "ported",
    detail: "Every Nature Lab study can now export or load a versioned recipe containing its study, seed, parameters, visible layers, and optional observer; the same API is available to UI and AI agents."
  },
  {
    label: "Interactive 2D Surfaces",
    source: "SBQC/public p5, Leaflet, Chart.js, amCharts and canvas experiments",
    status: "ported",
    detail: "Canvas sketches are ordinary `surface` scene data with one shared, pause-aware loop. The player-visible Generative Surfaces showcase mounts waveform, grid-pulse and plasma on screens, billboards and curved displays."
  }
];

export const GAME_RECOVERY_ITEMS: ArchiveRecoveryItem[] = [
  {
    label: "Actor Loop",
    source: "GraphysX_1/Agent.cpp, Zombie.cpp, Human.cpp",
    status: "ported",
    detail: "The Game Lab runs the source-shaped player/human/zombie loop, while reusable `crowd` vocabulary carries seeking, wandering and contact conversion into v2 scenes."
  },
  {
    label: "Mouse Pick / Aim Line",
    source: "Scene3D/GamePlayScreen.cpp, ConsoleGraphysX.cpp",
    status: "ported",
    detail: "Mouse-to-world ray aiming drives the live Game Lab shot direction and BallZ hold-to-roll controller; the steering aim is observable scene state rather than a painted lane."
  },
  {
    label: "Projectile Basics",
    source: "CLScene::shotBullet, GamePlayScreen::checkInput",
    status: "ported",
    detail: "Game Lab bullets have the recovered one-second lifetime, dynamic physics trajectory, target hits and impact effects; BallZ and agent interactions reuse the same Rapier-backed runtime."
  },
  {
    label: "Fire / Particles",
    source: "ParticleEffect.cpp, ParticleEngine.cpp, Effect.cpp, createFire",
    status: "ported",
    detail: "Recovered particle presets are registered emitter vocabulary with source shape/rate/force parameters, and persistent fire, trails, impacts and race bursts run in player-visible worlds."
  }
];

export const MAP_EDITOR_RECOVERY_ITEMS: ArchiveRecoveryItem[] = [
  {
    label: "Tile Semantics",
    source: "GraphysX_1/Scene.cpp BuildASCIIScene",
    status: "ported",
    detail: "The level workbench owns paintable floor/wall/start/ring/halfway/finish/hazard semantics and round-trips the same tiles the BallZ materializer plays."
  },
  {
    label: "Live Preview",
    source: "Scene3D/EditorScreen.cpp, GfxNet/SceneNET.h",
    status: "ported",
    detail: "Clickable DOM grid updates a Three.js arena preview without storing editor data in renderer objects."
  },
  {
    label: "Export Shape",
    source: "STSceneParam, Level.cs",
    status: "ported",
    detail: "Levels round-trip as validated JSON and exact ASCII through the public API; authored scene documents export independently from session-only play state."
  },
  {
    label: "Race Conversion",
    source: "Scene3D/GamePlayScreen.cpp",
    status: "ported",
    detail: "`levels.play()` materializes the draft as a Rapier course with collision boxes, steerable ball, ring inventory, ordered gates, lap rules, HUD, replay and editor return."
  }
];

export const MATH_CONTROLS = [
  { key: "a", label: "A", min: -5, max: 5, step: 0.25 },
  { key: "b", label: "B", min: -5, max: 5, step: 0.25 },
  { key: "c", label: "C", min: -5, max: 5, step: 0.25 },
  { key: "m", label: "M", min: -5, max: 5, step: 0.25 },
  { key: "xOffset", label: "X", min: -5, max: 5, step: 0.25 }
] as const;

export const EDITOR_RECOVERY_ITEMS: ArchiveRecoveryItem[] = [
  {
    label: "Load XML",
    source: "EditorScreen::onButtonLoadClick",
    status: "ported",
    detail: "`importLegacyXml()` converts archived SceneNET XML into validated v2 scene documents, while the MyWorld/Suzanne/ObjectLibrary visits retain exact serialized evidence and malformed-record diagnostics."
  },
  {
    label: "Save XML",
    source: "GfxNet::SceneNET::Serialize",
    status: "preview",
    detail: "Exact BaseScene/test1 serializer artifacts and version differences are player-visible, and v2 authored documents export as validated JSON. Emitting new legacy SceneNET XML remains deliberately open because its lossy field mapping and duplicate semantics are not specified."
  },
  {
    label: "Add X Mesh",
    source: "EditorScreen::onButtonAddX",
    status: "ported",
    detail: "Recovered X/TVM/3DS geometry is decoded to the runtime's native mesh JSON and registered in the editor asset library; browser media import also converts supported OBJ/FBX/GLB sources without a GLB-only staging rule."
  },
  {
    label: "Object Picking",
    source: "m_graphysX->isClickOnMesh",
    status: "ported",
    detail: "The production editor raycasts the world, selects parent entities, drives the transform gizmo and inspector, and commits validated patches through the same public API agents use."
  }
];

export const CUBX_RECOVERY_ITEMS: ArchiveRecoveryItem[] = [
  {
    label: "CubZ Rotate / Open Menu",
    source: "CubZ.cpp: RotateTo, Open, Close, BackRotate; CubeRot.tva; CubeOpen.tva",
    status: "ported",
    detail: "Eight cubes use exact CubZ.cpp hit-box proportions/centers and source selection flow. Selections 1–7 visibly sample their decoded CubeRot ranges; opening visibly samples CubeOpen's exact Right08, Top08 and Left08 quaternion tracks across frames 0–50 at 30 fps, with close and BackRotate traversing the same ranges backward. Procedural geometry remains a disclosed adapter."
  },
  {
    label: "Clock Displays",
    source: "CLClockDisplay, LoadLettersAndNumbers",
    status: "ported",
    detail: "The complete recovered 0–9/A–Z TVM alphabet is vendored as 36 discoverable glyph assets; BallZ uses it for mesh countdown and lap displays instead of segment stand-ins."
  },
  {
    label: "Earth Grid",
    source: "Earth.tvm, EarthGridXL.bmp",
    status: "ported",
    detail: "The CubX/Scene Lab Earth anchor and transparent spinning GridXL shell are live, and Earth/cloud/grid textures are registered for reuse in scene vocabulary."
  },
  {
    label: "Domotic Controls",
    source: "MenuDomo, LightTimeOn/Off, FanTimeOn/Off",
    status: "ported",
    detail: "The CubX workbench exposes the recovered clock/light/fan control surface alongside the animated eight-cube menu; browser controls drive the same visible state instead of remaining static panel art."
  }
];

export const ASSET_RECOVERY_ITEMS: ArchiveRecoveryItem[] = [
  {
    label: "Ball Shell / Ctrl",
    source: "Media/Ball/BallShell.tvm, BallCtrl.tvm, FireArrow800.JPG",
    status: "ported",
    detail: "Gameplay uses the decoded 2011 shell/controller geometry with restored UVs and the archived FireArrow texture on the inner controller."
  },
  {
    label: "Suzanne Moving Parts",
    source: "Suzanne1.Piston.x, Suzanne1.Rotator.x, Suzanne1.RotatorCube.x",
    status: "ported",
    detail: "All eight decoded Suzanne machinery objects are now faithful vendored v2 assets. The piston, door gate and rotator cube are collision-bearing moving obstacles in the player-visible Suzanne Machinery Run; motion timing and game rules are disclosed adaptations."
  },
  {
    label: "Airplane",
    source: "Media/Airplane/Airplane.x, AirplaneLP.TVM",
    status: "ported",
    detail: "The converted archive airplane is used by the FlightX pipe trial. Scene Lab still uses its earlier lightweight spline proxy."
  },
  {
    label: "Shader Pack",
    source: "Media/shaders/ppl.shade, meshlight.shade, post_haze.shade, Projection.fx",
    status: "preview",
    detail: "`meshlight.shade` and `ppl.shade` are vendored and translated as selectable scene-material vocabulary. meshlight preserves its normal-alpha parallax, Lyon specular, independent red-channel mask, SpecMP, light colour/position and 0.15 floor; its visible lab and Room 2 use it. ppl preserves its parallax + tangent-Lambert math and exact ZRing/ball_Normal active binding in a visible ring lab. post_haze has a modern EffectComposer descendant. Projection.fx remains source-only: two independent archive searches found no loader/binding, so no use was invented."
  },
  {
    label: "Texture Set",
    source: "Damier, 90Right, GridXL, RotatorUV, Suzanne1UV, concrete, flames",
    status: "ported",
    detail: "Key PNG/JPG/BMP textures are available under public/assets/textures."
  },
  {
    label: "XML Scenes",
    source: "Suzanne1.xml, MyWorld.xml, TestWorld.xml, ObjectLibrary.xml",
    status: "ported",
    detail: "Suzanne, MyWorld, TestWorld and ObjectLibrary XML are decoded into exact player-visible visits with provenance and contradiction diagnostics, and SceneNET XML can be imported into the validated v2 document contract."
  }
];

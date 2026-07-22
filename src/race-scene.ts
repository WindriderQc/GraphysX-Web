import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Clock,
  Color,
  ConeGeometry,
  CubeTextureLoader,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Float32BufferAttribute,
  Matrix4,
  Line,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  PlaneGeometry,
  PointLight,
  PCFSoftShadowMap,
  Raycaster,
  RingGeometry,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  WireframeGeometry
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { TransformControls, type TransformControlsMode } from "three/examples/jsm/controls/TransformControls.js";
import { AudioCues } from "./engine/audio-cues";
import { loadArchiveCubeTexture } from "./archive-skybox";
import { getClassicLevelStyle } from "./classic-level-style";
import {
  CUBX_MENU_RULES,
  CUBX_SATELLITES,
  CUBX_SATELLITE_DISPLAY_SCALE,
  cubXSatelliteDisplayOffset,
  isCubXMenuTagVisible,
  type CubXSatelliteId,
  type CubXSatelliteSpec
} from "./cubx-satellite-shell";
import {
  CarSelectorEnvironment,
  SkyboxSelectorEnvironment,
  type CarSelectorState,
  type SkyboxSelectorId,
  type SkyboxSelectorState
} from "./archive-selector-environments";
import { InputController } from "./engine/input-controller";
import { ParticleEmitter } from "./engine/particle-emitter";
import {
  CommonRoomEnvironment,
  type CommonRoomEnvironmentState
} from "./common-room-environment";
import {
  CommonArchiveEnvironment,
  type CommonArchiveEnvironmentState,
  type CommonArchiveSpaceId
} from "./common-archive-environment";
import {
  Ballz2011Level1Environment,
  type Ballz2011Level1EnvironmentState
} from "./ballz2011-level1-environment";
import {
  BallzSlide1Environment,
  type BallzSlide1EnvironmentState
} from "./ballz-slide1-environment";
import type {
  BallzTrackGalleryAssetId,
  BallzTrackGalleryCameraProfile,
  BallzTrackGalleryEnvironment,
  BallzTrackGalleryEnvironmentState,
  BallzTrackGalleryMaterialMode
} from "./ballz-track-gallery-environment";
import {
  XmlSceneEnvironment,
  type XmlSceneEnvironmentState
} from "./xml-scene-environment";
import type {
  BallzXmlWorldsEnvironment,
  BallzXmlWorldsState
} from "./ballz-xml-worlds-environment";
import type {
  StockroomXmlArtifactEnvironment,
  StockroomXmlArtifactEnvironmentState,
  StockroomXmlArtifactId
} from "./stockroom-xml-artifact-environment";
import type {
  VehiclePackEnvironment,
  VehiclePackEnvironmentState,
  VehiclePackId
} from "./vehicle-pack-environment";
import type {
  ObjectLibraryCatalogEnvironment,
  ObjectLibraryCatalogState,
  ObjectLibraryFamily,
  ObjectLibraryStatusFilter
} from "./object-library-catalog-environment";
import type {
  DominusAssetFamily,
  DominusAssetGalleryEnvironment,
  DominusAssetGalleryState,
  DominusAssetStatusFilter
} from "./dominus-asset-gallery-environment";
import type {
  DominusPortEvidenceEnvironment,
  DominusPortEvidenceState
} from "./dominus-port-evidence-environment";
import type {
  ThreejsPlaygroundEnvironment,
  ThreejsPlaygroundParameter,
  ThreejsPlaygroundState
} from "./threejs-playground-environment";
import type {
  ArchiveBlenderCameraProfile,
  BallzBlenderLevel1Environment,
  BallzBlenderLevel1State,
  MaisonExplorerEnvironment,
  MaisonExplorerState,
  MaisonSubspaceId
} from "./archive-blender-environments";
import type {
  ArenaArchiveCameraProfile,
  ArenaArchiveEnvironment,
  ArenaArchiveState
} from "./arena-archive-environment";
import type {
  ParticlePresetLibraryEnvironment,
  ParticlePresetLibraryState
} from "./particle-preset-library-environment";
import type {
  CubxActorLineageEnvironment,
  CubxActorClickIndex,
  CubxActorClipFamily,
  CubxActorLineageState,
  CubxActorPairIndex,
  CubxActorPlaybackDirection
} from "./cubx-actor-lineage-environment";
import {
  NotesManagerEnvironment,
  type NotesManagerState
} from "./notes-manager-environment";
import {
  MilkyWayEnvironment,
  type MilkyWayProfile,
  type MilkyWayState
} from "./milky-way-environment";
import {
  SuzanneAsciiEnvironment,
  type SuzanneAsciiEnvironmentState
} from "./suzanne1-ascii-environment";
import type {
  Suzanne2AsciiEnvironment,
  Suzanne2AsciiEnvironmentState
} from "./suzanne2-ascii-environment";
import {
  NatureLab,
  type NatureLabLayer,
  type NatureLabLessonId,
  type NatureLabParameter,
  type NatureLabState,
  type NatureLabStudyId
} from "./nature-lab";
import type { GraphysXWorldObserver, GraphysXWorldRecipe } from "./world-recipes";
import {
  AgentWorldRuntime,
  GRAPHYSX_AGENT_DEMO_WORLD,
  type AgentWorldBehavior,
  type AgentWorldChangeSet,
  type AgentWorldCommand,
  type AgentWorldCommitReceipt,
  type AgentWorldCommitSummary,
  type AgentWorldEventPage,
  type AgentWorldRulesDefinition,
  type AgentWorldRunStatus,
  type AgentWorldDefinition,
  type AgentWorldEntityDefinition,
  type AgentWorldEntityPatch,
  type AgentWorldEntityState,
  type AgentWorldInteractionReceipt,
  type AgentWorldQuery,
  type AgentWorldResult,
  type AgentWorldState
} from "./agent-world-runtime";
import type {
  AgentWorldPrefabDescriptor,
  AgentWorldPrefabId,
  AgentWorldPrefabInstance,
  AgentWorldPrefabOptions
} from "./agent-world-prefabs";
import type {
  AgentWorldStarterDescriptor,
  AgentWorldStarterId,
  AgentWorldStarterOptions
} from "./agent-world-starters";
import {
  CUBZ_TVA_CLIPS,
  CUBZ_TVA_FIDELITY,
  sampleCubzOpenForward,
  sampleCubzOpenReverse,
  sampleCubzRotationForward,
  sampleCubzRotationReverse,
  type CubzOpenPanelName,
  type CubzRotationSelection
} from "./cubz-tva-animation";
import {
  type PhysicsBody,
  type PhysicsConstraint,
  type PhysicsVehicle,
  PhysicsWorld,
  syncBodyToMesh,
  setBodyTransform
} from "./engine/physics-world";
import {
  RACE_DEFINITIONS,
  type LegacyLevelRef,
  type MovingPart,
  type RaceBox,
  type RaceDefinition,
  type RaceForceZone,
  type RaceMarker,
  type RaceMaterialKey,
  type RaceRing
} from "./race-definitions";
// Legacy archive datasets are lazy-loaded so the initial bundle stays small.
// Each module variable fills in when its chunk arrives; ensureLegacyData()
// triggers loads and the scene rebuilds itself when data lands.
/* eslint-disable @typescript-eslint/no-explicit-any */
let suzanne1Level: any = null;
let assetCatalog: any = null;
let tvmCatalog: any = null;
let world1Level: any = null;
let carsCatalog: any = null;
let map1Level: any = null;
let slideLevel: any = null;
let villageCatalog: any = null;
let terrainCarx: any = null;
let level1World: any = null;
let ballz18Level01: any = null;

const LEGACY_LOADERS: Record<string, () => Promise<void>> = {
  suzanne1: async () => {
    suzanne1Level = (await import("./legacy/suzanne1-level.json")).default;
  },
  assets: async () => {
    assetCatalog = (await import("./legacy/asset-catalog.json")).default;
  },
  tvm: async () => {
    tvmCatalog = (await import("./legacy/tvm-catalog.json")).default;
  },
  world1: async () => {
    world1Level = (await import("./legacy/world1-level.json")).default;
  },
  cars: async () => {
    carsCatalog = (await import("./legacy/cars-catalog.json")).default;
  },
  map1: async () => {
    map1Level = (await import("./legacy/map1-level.json")).default;
  },
  slide2008: async () => {
    slideLevel = (await import("./legacy/slide-level.json")).default;
  },
  village: async () => {
    villageCatalog = (await import("./legacy/village-catalog.json")).default;
  },
  terrain: async () => {
    terrainCarx = (await import("./legacy/terrain-carx.json")).default;
  },
  level12011: async () => {
    level1World = (await import("./legacy/level1-2011-level.json")).default;
  },
  ballz18level01: async () => {
    ballz18Level01 = (await import("./legacy/ballz18-level01.json")).default;
  }
};

function legacyDataReady(key: string): boolean {
  switch (key) {
    case "suzanne1":
      return Boolean(suzanne1Level);
    case "assets":
      return Boolean(assetCatalog);
    case "tvm":
      return Boolean(tvmCatalog);
    case "world1":
      return Boolean(world1Level);
    case "cars":
      return Boolean(carsCatalog);
    case "map1":
      return Boolean(map1Level);
    case "slide2008":
      return Boolean(slideLevel);
    case "village":
      return Boolean(villageCatalog);
    case "terrain":
      return Boolean(terrainCarx);
    case "level12011":
      return Boolean(level1World);
    case "ballz18level01":
      return Boolean(ballz18Level01);
    default:
      return false;
  }
}
import type { ArchiveModeId } from "./archive-content";

export type RaceSnapshot = {
  raceId: string;
  raceName: string;
  elapsedMs: number;
  ringsCollected: number;
  ringsTotal: number;
  hasReachedHalfway: boolean;
  playerPosition: Vector3;
  archiveChampionMs: number;
  targetMs: number;
  zombiesRemaining: number;
  zombiesTotal: number;
  lapsCompleted: number;
  lapsTotal: number;
  nextObjective: string;
  objectiveDistance: number | null;
  rival: {
    label: string;
    position: Vector3;
    waypoint: number;
    waypointsTotal: number;
    circuitsCompleted: number;
  } | null;
};

export type RaceDebugSnapshot = RaceSnapshot & {
  raceActive: boolean;
  raceFinished: boolean;
  racePaused: boolean;
  countdownRemaining: number;
  countdownAudio: {
    source: "BallZ18/Assets/Audio" | null;
    cue: "idle" | "waiting" | "3" | "2" | "1" | "go";
    readyPlays: number;
    goPlays: number;
  };
  loadState: RaceLoadState;
  remainingRings: Array<{ x: number; y: number; z: number }>;
  activeZombies: Array<{ x: number; y: number; z: number }>;
  playerVelocity: { x: number; y: number; z: number };
  inputAxis: { forward: number; turn: number };
  controllerVector: { x: number; y: number; magnitude: number };
  shellWireRotation: { x: number; y: number; z: number };
  arrowHeading: number;
  cameraYaw: number;
  cameraPitch: number;
  cameraDistance: number;
  cameraCollision: {
    active: boolean;
    hitBodyId: number | null;
    desiredDistance: number;
    resolvedDistance: number;
  };
  canJump: boolean;
  ballPreset: BallPreset;
  ghost: {
    hasBest: boolean;
    bestTimeMs: number | null;
    recordingSamples: number;
    playbackVisible: boolean;
    lastLapVisible: boolean;
  };
  flight: {
    speed: number;
    thrust: -1 | 0 | 1;
    roll: -1 | 0 | 1;
    pitch: -1 | 0 | 1;
    airbrake: boolean;
    orientation: { x: number; y: number; z: number; w: number };
    forward: { x: number; y: number; z: number };
    controls: string;
    objective: string;
  } | null;
  forceZone: { name: string; kind: RaceForceZone["kind"] } | null;
  forceZonesTotal: number;
  suzanne: SuzanneAsciiEnvironmentState | null;
  playerRadius: number;
};

export type RaceLoadState = {
  ready: boolean;
  loading: boolean;
  requiredKeys: string[];
  error?: string;
};

export type ArchivePreviewMode = Exclude<ArchiveModeId, "race"> | "menu" | "race-preview";

export type MathFormulaParams = {
  a: number;
  b: number;
  c: number;
  m: number;
  xOffset: number;
  /** legacy Formulas.h FormulaType: PARABOLA or SLOPE */
  formula: "parabola" | "slope";
};

export type MapEditorTile = "floor" | "wall" | "start" | "ring" | "half" | "finish" | "hazard" | "fire" | "ice";

export type MapEditorDraft = {
  width: number;
  height: number;
  cellSize: number;
  tiles: MapEditorTile[];
};

type RaceSceneOptions = {
  onRaceFinished: (snapshot: RaceSnapshot) => void;
  onRaceAssetsChanged?: () => void;
  onCubXStateChanged?: () => void;
  onCubXLaunchRace?: (raceId: string) => void;
  onCubXOpenArchiveMode?: (mode: ArchivePreviewMode) => void;
  onCommonRoomStateChanged?: () => void;
  onArchiveSelectorStateChanged?: () => void;
  onNatureStateChanged?: () => void;
  onAgentWorldStateChanged?: () => void;
};

type CubXMenuPhase = "idle" | "rotating" | "opening" | "open" | "closing" | "returning";

type CubXMenuRuntime = {
  root: Group;
  animationRoot: Group;
  cubelets: Mesh[];
  closedPositions: Vector3[];
  openAnimatedNodes: Array<{
    nodeName: CubzOpenPanelName;
    cube: Mesh;
    basePosition: Vector3;
    baseQuaternion: Quaternion;
    baseScale: Vector3;
  }>;
  panelGroup: Group;
  panels: Mesh[];
  backButton: Mesh;
  sunButton: Mesh;
  satelliteGroup: Group;
  satelliteButtons: Mesh[];
  satelliteObjects: Map<CubXSatelliteId, Group>;
  activeMenuLevel: number;
  selectedSatellite: CubXSatelliteId | null;
  phase: CubXMenuPhase;
  progress: number;
  selectedCube: number | null;
  selectedAction: string | null;
  restQuaternion: Quaternion;
  startRotation: Vector3;
  targetRotation: Vector3;
  transitionDuration: number;
  cameraSourcePosition: Vector3;
  cameraFlyComplete: boolean;
};

const CUBX_SECTIONS = [
  { label: "Atmel Control", short: "ATML", actions: ["Digital I/O", "Light Timer", "Fan Timer", "Serial Link"] },
  { label: "System Info", short: "SYS", actions: ["Network", "Temperature", "Processes", "Storage"] },
  { label: "Notes", short: "NOTE", actions: ["New Note", "Browse Notes", "Pin Board", "Archive"] },
  { label: "3D Scenes", short: "3D", actions: ["Earth", "Sky & Water", "Flight", "Scene Browser"] },
  { label: "BallZ", short: "BALLZ", actions: ["Fire", "Classic", "Revival", "BallZ Tour"] },
  { label: "Vehicles", short: "CAR", actions: ["Impreza", "GT4", "Cobra", "Car Scene"] },
  { label: "Media", short: "MEDIA", actions: ["Music", "Images", "Models", "Animations"] },
  { label: "Tools", short: "TOOLS", actions: ["Editor", "Console", "Settings", "Screensaver"] }
] as const;

// CubZ.cpp source-space hit geometry. fSize is hard-coded to 8, each hit box
// is 58*fSize, and the eight centers use the offsets below. The live menu
// applies one uniform inspection scale and centers the set; the labels and
// procedural TVA replacement remain explicitly modern presentation.
const CUBZ_SOURCE_MODEL_SCALE = 8;
const CUBZ_SOURCE_BOX_SIZE = 58;
const CUBZ_SOURCE_CENTERS = [
  [0, 25, 0],
  [0, 25, 100],
  [-95, 25, 100],
  [-95, 25, 0],
  [0, -70, 0],
  [0, -70, 100],
  [-95, -70, 100],
  [-95, -70, 0]
] as const;
const CUBZ_SOURCE_CENTER = [-47.5, -22.5, 50] as const;
const CUBZ_DISPLAY_BOX_SIZE = 1.56;
const CUBZ_DISPLAY_SCALE = CUBZ_DISPLAY_BOX_SIZE / CUBZ_SOURCE_BOX_SIZE;
const CUBZ_ROTATION_DURATION_SECONDS = CUBZ_TVA_CLIPS.rotation[0].durationSeconds;
const CUBZ_OPEN_DURATION_SECONDS = CUBZ_TVA_CLIPS.open.durationSeconds;
const CUBX_IDLE_SPIN_RADIANS_PER_SECOND = MathUtils.degToRad(20);
const CUBX_SOURCE_POSITION = new Vector3(-400, 500, 0);
const CUBX_CAMERA_SOURCE_START = new Vector3(400, 250, -2000);
const CUBX_CAMERA_SOURCE_STEP_PER_FRAME = new Vector3(-10, 5, 10);
const CUBX_CAMERA_SOURCE_TARGET = new Vector3(-75, 725, -350);

function cubZDisplayCenter(source: readonly [number, number, number]): Vector3 {
  return new Vector3(
    (source[0] - CUBZ_SOURCE_CENTER[0]) * CUBZ_DISPLAY_SCALE,
    (source[1] - CUBZ_SOURCE_CENTER[1]) * CUBZ_DISPLAY_SCALE,
    -(source[2] - CUBZ_SOURCE_CENTER[2]) * CUBZ_DISPLAY_SCALE
  );
}

type MovingRuntimePart = {
  spec: MovingPart;
  mesh: Mesh;
  body: PhysicsBody;
  basePosition: Vector3;
  previousPosition: Vector3;
};

type NpcAgent = {
  group: Group;
  bodyMaterial: MeshStandardMaterial;
  body: PhysicsBody;
  kind: "zombie" | "human";
  direction: Vector3;
  turnTimer: number;
  alive: boolean;
};

type LegacyRuntimePart = {
  mesh: Mesh;
  body: PhysicsBody;
  kind: "rotator" | "piston";
  axis: "x" | "y";
  basePosition: Vector3;
  previousPosition: Vector3;
  speed: number;
  phase: number;
  amplitude: number;
};

const PLAYER_RADIUS = 0.88;
const INNER_RADIUS = PLAYER_RADIUS * 0.85;
const MATERIAL_TEXTURE_SIZE = 128;
const INNER_MAX_OFFSET = Math.max(0.025, PLAYER_RADIUS - INNER_RADIUS - 0.04);
const CONTROL_FORCE = 42;
const AIR_CONTROL_FORCE = 13;
const BALLZ_MAX_GROUND_SPEED = 13.5;
const BALLZ_GROUND_GRIP = 0.985;
const DEFAULT_RACE_CAMERA_PITCH = 0.66;
const DEFAULT_RACE_CAMERA_DISTANCE = 14;
const UP_AXIS = new Vector3(0, 1, 0);
const TERRAIN_WORLD_SIZE = 110;
const TERRAIN_HEIGHT_SCALE = 9;

/** Port Dominus layout — curated placement of the Dominus Art library.
 *  [assetId, x, z, rotationY, scaleOverride?, solid?] */
const DOMINUS_LAYOUT: Array<[string, number, number, number, number?, boolean?]> = [
  // the waterfront
  ["port_maindocks", 0, 26, 0, undefined, true],
  ["port_smalldocks", 15, 27, 0.2, undefined, true],
  ["port_minidock", -15, 26.5, -0.15, undefined, true],
  ["port_lighthouse", 31, 30, 0, undefined, true],
  ["port_sunkship", -27, 34, 0.9],
  ["port_shippiece", 23, 36, -0.4],
  ["port_shipyard", -8, 31, 0, undefined, true],
  // the town
  ["port_cottage1", -18, 10, 0.4, undefined, true],
  ["port_cottage2", -6, 12, 0, undefined, true],
  ["port_cottage4", 6, 12, -0.2, undefined, true],
  ["port_cottage5", 18, 10, -0.5, undefined, true],
  ["port_inn01", -13, -2, 0.7, undefined, true],
  ["port_pub1", 0, -5, 0, undefined, true],
  ["port_market", 13, -2, -0.7, undefined, true],
  ["port_fishhouse", -23, 3, 1.2, undefined, true],
  ["port_shed1", 23, 3, -1.2, undefined, true],
  ["port_const1", -28, -9, 0.5, undefined, true],
  ["port_const2", 28, -9, -0.5, undefined, true],
  ["port_windmill", -33, -17, 0.9, undefined, true],
  ["port_weathervain", 0, -13, 0],
  ["port_hut", -20, -21, 0.6, undefined, true],
  ["port_hut01", -10, -23, 0.2, undefined, true],
  ["port_hut02", 0, -24, 0, undefined, true],
  ["port_hut03", 10, -23, -0.2, undefined, true],
  ["port_hut04", 20, -21, -0.6, undefined, true],
  ["port_hut05", 27, -17, -1.0, undefined, true],
  // the camp
  ["camp1_tent1", -9, -32, 0.4],
  ["camp1_tent2", 0, -34, 0],
  ["camp1_tent3", 9, -32, -0.4],
  ["camp1_post", 0, -29, 0],
  // greenery
  ["tree_green01", -30, 16, 0], ["tree_green02", -24, 19, 1], ["tree_green03", 26, 17, 2],
  ["tree_green04", 32, 12, 3], ["tree_green05", -35, -2, 4], ["tree_green06", 35, -3, 5],
  ["tree_green07", -30, -26, 6], ["tree_green01", 30, -27, 1.5], ["tree_green03", -16, 18, 2.5],
  ["tree_dead01", 36, -22, 0], ["tree_dead02", -37, -12, 1], ["tree_dead03", 15, 18, 2],
  ["bush_01", -9, 6, 0], ["bush_02", 9, 6, 1], ["bush_03", -18, -8, 2], ["bush_04", 18, -8, 3],
  ["grass_reed01", -4, 20, 0], ["grass_reed02", 4, 20, 1], ["grass_reed03", 0, 17, 2],
  ["grass_flower01", -7, -17, 0], ["grass_flower02", 7, -17, 1],
  // life
  ["woman", 2.4, -7.5, 2.6],
  ["fish1", -6, 33, 0.6], ["fish2", 5, 34, -1.2], ["fish3", 12, 32, 2.2]
];

/** ring tour of the landmarks, dock to camp and back */
const DOMINUS_RING_TOUR = [
  { position: [0, 1.5, 18] as [number, number, number], yaw: 0, scale: 1.3 },
  { position: [-14, 1.5, 12] as [number, number, number], yaw: Math.PI / 2, scale: 1.2 },
  { position: [14, 1.5, 12] as [number, number, number], yaw: Math.PI / 2, scale: 1.2 },
  { position: [-20, 1.5, 1] as [number, number, number], yaw: 0, scale: 1.2 },
  { position: [20, 1.5, 1] as [number, number, number], yaw: 0, scale: 1.2 },
  { position: [0, 1.6, -9] as [number, number, number], yaw: Math.PI / 2, scale: 1.25 },
  { position: [-29, 1.6, -13] as [number, number, number], yaw: 0.9, scale: 1.2 },
  { position: [0, 1.5, -20] as [number, number, number], yaw: Math.PI / 2, scale: 1.2 },
  { position: [0, 1.6, -30] as [number, number, number], yaw: Math.PI / 2, scale: 1.3 },
  { position: [26, 1.6, 24] as [number, number, number], yaw: 0.4, scale: 1.25 }
];


/** archive texture files we have on hand, keyed by the name stored in the mesh */
// ---- Phase R1: classic 2015 ball preset + ghost persistence ----
export type BallPreset = "fire" | "revival" | "classic2015";
const BALL_PRESET_KEY = "graphysx-ball-preset-v1";
const GHOST_STORE_KEY = "graphysx-ghosts-v1";

function loadBallPreset(): BallPreset {
  try {
    const stored = window.localStorage.getItem(BALL_PRESET_KEY);
    return stored === "fire" || stored === "classic2015" || stored === "revival" ? stored : "revival";
  } catch {
    return "revival";
  }
}

function saveBallPreset(preset: BallPreset): void {
  try {
    window.localStorage.setItem(BALL_PRESET_KEY, preset);
  } catch {
    // optional
  }
}

type GhostRun = { timeMs: number; samples: number[] };

function loadGhostRun(raceId: string): GhostRun | null {
  try {
    const raw = window.localStorage.getItem(GHOST_STORE_KEY);
    if (!raw) {
      return null;
    }
    const all = JSON.parse(raw) as Record<string, GhostRun>;
    const run = all[raceId];
    return run && Array.isArray(run.samples) && run.samples.length >= 8 ? run : null;
  } catch {
    return null;
  }
}

function saveGhostRun(raceId: string, run: GhostRun): void {
  try {
    const raw = window.localStorage.getItem(GHOST_STORE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, GhostRun>) : {};
    all[raceId] = run;
    window.localStorage.setItem(GHOST_STORE_KEY, JSON.stringify(all));
  } catch {
    // optional
  }
}

const LEGACY_TEXTURES: Record<string, string> = {
  "suzanne1uv.png": "/assets/textures/Suzanne1UV.png",
  "twoway.jpg": "/assets/textures/archive/twoway.jpg",
  "cubeuv.png": "/assets/textures/CubeUV.png",
  "flooruv.png": "/assets/textures/FloorUV.png",
  "damier.jpg": "/assets/textures/Damier.jpg"
};

function rotateY(positions: number[], angle: number): number[] {
  if (Math.abs(angle) < 0.0001) {
    return positions;
  }
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotated = new Array<number>(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    rotated[i] = positions[i] * cos + positions[i + 2] * sin;
    rotated[i + 1] = positions[i + 1];
    rotated[i + 2] = -positions[i] * sin + positions[i + 2] * cos;
  }
  return rotated;
}

function randomNpcDirection(): Vector3 {
  // legacy Human::setRandomDirection
  const direction = new Vector3(Math.random() * 2 - 1, 0, Math.random() * 2 - 1);
  if (direction.lengthSq() === 0) {
    direction.set(1, 0, 0);
  }
  return direction.normalize();
}

export class RaceScene {
  private readonly container: HTMLDivElement;
  private readonly options: RaceSceneOptions;
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly clock = new Clock();
  private readonly input = new InputController();
  private readonly physics = new PhysicsWorld();
  private readonly particles: ParticleEmitter;
  private readonly resizeObserver: ResizeObserver;
  private readonly shell: Mesh;
  private readonly shellWire: LineSegments;
  private readonly fluidLayer: Mesh;
  private readonly innerBall: Mesh;
  private readonly innerArrow: Group;
  private readonly playerGroup = new Group();
  private readonly playerBody: PhysicsBody;
  private readonly worldGroup = new Group();
  private readonly menuCube = new Group();
  private readonly archivePreviewGroup = new Group();
  private readonly ringMeshes: Mesh[] = [];
  private readonly forceZoneVisuals: Array<{ group: Group; kind: RaceForceZone["kind"]; baseY: number; phase: number }> = [];
  private readonly movingParts: MovingRuntimePart[] = [];
  private readonly legacyParts: LegacyRuntimePart[] = [];
  private readonly audio = new AudioCues();
  private atmosphereRig: { key: DirectionalLight; rim: DirectionalLight; hemi: HemisphereLight } | null = null;
  private baseAmbientLight: AmbientLight | null = null;
  private commonRoomEnvironment: CommonRoomEnvironment | null = null;
  private commonArchiveEnvironment: CommonArchiveEnvironment | null = null;
  private commonEnvironmentSelection: CommonArchiveSpaceId | "room2-shadow" = "room2-shadow";
  private ballz2011Level1Environment: Ballz2011Level1Environment | null = null;
  private ballzSlide1Environment: BallzSlide1Environment | null = null;
  private ballzTrackGalleryEnvironment: BallzTrackGalleryEnvironment | null = null;
  private ballzTrackGalleryCameraProfile: BallzTrackGalleryCameraProfile = "overview";
  private xmlSceneEnvironment: XmlSceneEnvironment | null = null;
  private ballzXmlWorldsEnvironment: BallzXmlWorldsEnvironment | null = null;
  private stockroomXmlArtifactEnvironment: StockroomXmlArtifactEnvironment | null = null;
  private vehiclePackEnvironment: VehiclePackEnvironment | null = null;
  private objectLibraryCatalogEnvironment: ObjectLibraryCatalogEnvironment | null = null;
  private dominusAssetGalleryEnvironment: DominusAssetGalleryEnvironment | null = null;
  private dominusPortEvidenceEnvironment: DominusPortEvidenceEnvironment | null = null;
  private threejsPlaygroundEnvironment: ThreejsPlaygroundEnvironment | null = null;
  private ballzBlenderLevel1Environment: BallzBlenderLevel1Environment | null = null;
  private maisonExplorerEnvironment: MaisonExplorerEnvironment | null = null;
  private arenaArchiveEnvironment: ArenaArchiveEnvironment | null = null;
  private particlePresetLibraryEnvironment: ParticlePresetLibraryEnvironment | null = null;
  private cubxActorLineageEnvironment: CubxActorLineageEnvironment | null = null;
  private suzanne2Environment: Suzanne2AsciiEnvironment | null = null;
  private notesManagerEnvironment: NotesManagerEnvironment | null = null;
  private milkyWayEnvironment: MilkyWayEnvironment | null = null;
  private milkyWayProfile: MilkyWayProfile = "graphysx2017";
  private suzanneAsciiEnvironment: SuzanneAsciiEnvironment | null = null;
  private readonly suzannePistonBodies: PhysicsBody[] = [];
  private skyboxSelectorEnvironment: SkyboxSelectorEnvironment | null = null;
  private carSelectorEnvironment: CarSelectorEnvironment | null = null;
  private natureLab: NatureLab | null = null;
  private natureLabStudy: NatureLabStudyId = "flock-planet";
  private agentWorld: AgentWorldRuntime | null = null;
  private readonly agentTransformControls: TransformControls;
  private agentTransformEntityId: string | null = null;
  private agentTransformObject: Object3D | null = null;
  private agentTransformStart: { position: Vector3; rotation: Vector3; scale: Vector3 } | null = null;
  private sunSprite: Sprite | null = null;
  private airplaneFlyer: { mesh: Mesh; curve: CatmullRomCurve3 } | null = null;
  private physicsLab: {
    pairs: Array<{ mesh: Mesh; body: PhysicsBody }>;
    staticBodies: PhysicsBody[];
    constraints: PhysicsConstraint[];
    wreckingBall: { body: PhysicsBody; home: Vector3 } | null;
  } | null = null;
  private readonly npcs: NpcAgent[] = [];
  private zombiesTotal = 0;
  private vehicleRig: {
    vehicle: PhysicsVehicle;
    chassisBody: PhysicsBody;
    chassisGroup: Group;
    wheels: Array<{ mesh: Mesh; index: number; connection: Vector3; radius: number }>;
  } | null = null;
  private ballz18AiRival: {
    label: string;
    group: Group;
    body: PhysicsBody;
    start: Vector3;
    waypoints: Vector3[];
    waypointIndex: number;
    circuitsCompleted: number;
  } | null = null;
  private legacyRingGeometry: BufferGeometry | null = null;
  private readonly pendingLegacyLoads = new Set<string>();
  private readonly failedLegacyLoads = new Map<string, string>();
  private overlay: { group: Group; queue: string[]; timer: number; stepSeconds: number } | null = null;
  private ballPreset: BallPreset = loadBallPreset();
  private flightRig: { group: Group; speed: number } | null = null;
  private composer: EffectComposer | null = null;
  private hazePass: ShaderPass | null = null;
  private transitionPass: ShaderPass | null = null;
  private transitionAmount = 0;
  private waterMaterial: ShaderMaterial | null = null;
  private lastActivityMs = performance.now();
  private readonly bullets: Array<{ mesh: Mesh; body: PhysicsBody; bornMs: number }> = [];
  private lapsCompleted = 0;
  private debugWireframe = false;
  private debugOverrideMaterial: MeshBasicMaterial | null = null;
  private ballPresetApplied = false;
  private vehicleSteering = 0;
  private ghostRecording: number[] = [];
  private ghostSampleTimer = 0;
  private ghostBest: GhostRun | null = null;
  private ghostShell: Mesh | null = null;
  private ghostBestLine: Line | null = null;
  private ghostLastLapLine: Line | null = null;
  private readonly staticBodies: PhysicsBody[] = [];
  private readonly startGate = new Group();
  private readonly halfGate = new Group();
  private readonly finishGate = new Group();
  private readonly textureLoader = new TextureLoader();
  private readonly cubeTextureLoader = new CubeTextureLoader();
  private readonly textureCache = new Map<string, Texture>();
  private readonly skyboxCache = new Map<string, Texture>();
  private readonly raycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private cubxMenu: CubXMenuRuntime | null = null;
  private readonly pointer = {
    active: false,
    lastX: 0,
    lastY: 0,
    downX: 0,
    downY: 0
  };

  private race: RaceDefinition = RACE_DEFINITIONS[0];
  private raceActive = false;
  private raceFinished = false;
  private racePaused = false;
  private raceCountdownRemaining = 0;
  private ballz18CountdownCue: RaceDebugSnapshot["countdownAudio"]["cue"] = "idle";
  private ballz18CountdownReadyPlays = 0;
  private ballz18CountdownGoPlays = 0;
  private previewMode: ArchivePreviewMode = "menu";
  private mathParams: MathFormulaParams = { a: 1.5, b: -1, c: 0, m: 1.25, xOffset: 0, formula: "parabola" };
  private mapEditorDraft: MapEditorDraft = createDefaultEditorDraft();
  private elapsedMs = 0;
  private ringsCollected = 0;
  private hasReachedHalfway = false;
  private accent = new Color(this.race.palette.accent);
  private menuMode = true;
  private cameraYaw = 0;
  private cameraPitch = 0.72;
  private cameraDistance = 28;
  private raceCameraDistance = DEFAULT_RACE_CAMERA_DISTANCE;
  private cameraCollision = {
    active: false,
    hitBodyId: null as number | null,
    desiredDistance: DEFAULT_RACE_CAMERA_DISTANCE,
    resolvedDistance: DEFAULT_RACE_CAMERA_DISTANCE
  };
  private playerRadius = PLAYER_RADIUS;
  private canJump = true;
  private arrowHeading = Math.PI;
  private readonly controllerVector = new Vector2(0, 0);
  private readonly previousPlayerPosition = new Vector3();
  private particlePreviewAccumulator = 0;
  private activeForceZone: RaceForceZone | null = null;
  private forceEffectAccumulator = 0;

  constructor(container: HTMLDivElement, options: RaceSceneOptions) {
    this.container = container;
    this.options = options;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(55, 1, 0.1, 260);
    this.camera.position.set(0, 28, 30);

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.container.append(this.renderer.domElement);
    this.agentTransformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.agentTransformControls.setMode("translate");
    this.agentTransformControls.setSpace("world");
    this.agentTransformControls.setTranslationSnap(0.25);
    this.agentTransformControls.setRotationSnap(MathUtils.degToRad(15));
    this.agentTransformControls.setScaleSnap(0.1);
    this.agentTransformControls.setSize(0.82);
    this.agentTransformControls.setColors("#ff6f61", "#63e08e", "#5aa9ff", "#fff2a8");
    this.scene.add(this.agentTransformControls.getHelper());
    this.agentTransformControls.addEventListener("mouseDown", () => {
      const object = this.agentTransformObject;
      if (!object) return;
      this.pointer.active = false;
      this.agentTransformStart = {
        position: object.position.clone(),
        rotation: new Vector3(object.rotation.x, object.rotation.y, object.rotation.z),
        scale: object.scale.clone()
      };
    });
    this.agentTransformControls.addEventListener("mouseUp", () => this.commitAgentWorldTransform());
    this.setupPostProcessing();
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);

    this.playerGroup.name = "BallZShell";
    this.shell = new Mesh(
      this.createBallGeometry("shell", PLAYER_RADIUS) ?? new SphereGeometry(PLAYER_RADIUS, 48, 32),
      new MeshPhysicalMaterial({
        color: new Color("#d9f3f7"),
        roughness: 0.12,
        metalness: 0.08,
        transmission: 0.08,
        transparent: true,
        opacity: 0.42,
        clearcoat: 1,
        clearcoatRoughness: 0.12
      })
    );
    this.shellWire = new LineSegments(
      new WireframeGeometry(new SphereGeometry(PLAYER_RADIUS * 1.01, 18, 12)),
      new LineBasicMaterial({ color: new Color("#a7fff0"), transparent: true, opacity: 0.34 })
    );
    this.fluidLayer = new Mesh(
      new SphereGeometry((PLAYER_RADIUS + INNER_RADIUS) * 0.5, 48, 28),
      this.createFluidShader()
    );
    this.innerBall = new Mesh(
      this.createBallGeometry("fire", PLAYER_RADIUS * (6.601 / 8.5)) ?? new SphereGeometry(INNER_RADIUS, 32, 20),
      new MeshStandardMaterial({
        map: this.loadTexture("/assets/textures/ball/FireArrow800.jpg", 1, 1),
        color: new Color("#ffffff"),
        emissive: new Color("#3c2100"),
        emissiveIntensity: 0.32,
        roughness: 0.3,
        metalness: 0.12
      })
    );
    this.innerArrow = this.createControllerArrow();
    this.innerArrow.rotation.y = this.arrowHeading;
    this.innerArrow.position.set(0, INNER_RADIUS * 0.84, -INNER_RADIUS * 0.1);
    this.innerArrow.visible = true;
    this.playerGroup.add(this.shell, this.fluidLayer, this.shellWire, this.innerBall, this.innerArrow);
    this.scene.add(this.playerGroup);
    this.playerBody = this.physics.addDynamicSphere(this.raceStart, PLAYER_RADIUS, 1.35);

    this.particles = new ParticleEmitter(this.scene, 700);
    this.archivePreviewGroup.name = "ArchivePreview";
    this.scene.add(this.worldGroup, this.startGate, this.halfGate, this.finishGate, this.menuCube, this.archivePreviewGroup);
    this.scene.add(this.camera); // camera-attached overlays (countdown/banner)
    this.createLights();
    this.createMenuCube();
    this.ensureLegacyData(["tvm"]);
    this.setRace(this.race.id);
    this.setPreviewMode("menu");
    this.setMenuMode(true);
    this.attachEvents();
    requestAnimationFrame(() => this.onResize());
    this.animate();
  }

  getRace(): RaceDefinition {
    return this.race;
  }

  getPreviewMode(): ArchivePreviewMode {
    return this.previewMode;
  }

  getCommonRoomEnvironmentState(): CommonRoomEnvironmentState | null {
    return this.commonRoomEnvironment?.getState() ?? null;
  }

  getCommonArchiveEnvironmentState(): CommonArchiveEnvironmentState | null {
    return this.commonArchiveEnvironment?.getState() ?? null;
  }

  getCommonEnvironmentSelection(): CommonArchiveSpaceId | "room2-shadow" {
    return this.commonEnvironmentSelection;
  }

  selectCommonEnvironment(space: CommonArchiveSpaceId | "room2-shadow"): boolean {
    if (!this.commonRoomEnvironment || !this.commonArchiveEnvironment || this.previewMode !== "common-room-lab") {
      return false;
    }
    this.commonEnvironmentSelection = space;
    this.commonRoomEnvironment.group.visible = space === "room2-shadow";
    this.commonArchiveEnvironment.group.visible = space !== "room2-shadow";
    if (space === "room2-shadow") {
      this.commonRoomEnvironment.applyToCamera(this.camera);
    } else {
      this.commonArchiveEnvironment.setActiveSpace(space, this.camera);
    }
    this.options.onCommonRoomStateChanged?.();
    return true;
  }

  getSuzanneAsciiEnvironmentState(): SuzanneAsciiEnvironmentState | null {
    return this.suzanneAsciiEnvironment?.getState() ?? null;
  }

  orbitCommonRoomByRadians(delta: number): boolean {
    if (!this.commonRoomEnvironment || !this.commonArchiveEnvironment || this.previewMode !== "common-room-lab") {
      return false;
    }
    if (this.commonEnvironmentSelection === "room2-shadow") {
      this.commonRoomEnvironment.orbitByRadians(delta, this.camera);
    } else {
      this.commonArchiveEnvironment.orbitByRadians(delta, this.camera);
    }
    return true;
  }

  resetCommonRoomOrbit(): boolean {
    if (!this.commonRoomEnvironment || !this.commonArchiveEnvironment || this.previewMode !== "common-room-lab") {
      return false;
    }
    if (this.commonEnvironmentSelection === "room2-shadow") {
      this.commonRoomEnvironment.resetOrbit(this.camera);
    } else {
      this.commonArchiveEnvironment.resetOrbit(this.camera);
    }
    return true;
  }

  getBallz2011Level1State(): Ballz2011Level1EnvironmentState | null {
    return this.ballz2011Level1Environment?.getState() ?? null;
  }

  setBallz2011Level1Edges(visible: boolean): boolean {
    if (!this.ballz2011Level1Environment || this.previewMode !== "ballz-2011-level1") return false;
    this.ballz2011Level1Environment.setEdgesVisible(visible);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setBallz2011Level1Bounds(visible: boolean): boolean {
    if (!this.ballz2011Level1Environment || this.previewMode !== "ballz-2011-level1") return false;
    this.ballz2011Level1Environment.setBoundsVisible(visible);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getBallzSlide1State(): BallzSlide1EnvironmentState | null {
    return this.ballzSlide1Environment?.getState() ?? null;
  }

  setBallzSlide1BallVisible(visible: boolean): boolean {
    if (!this.ballzSlide1Environment || this.previewMode !== "ballz-slide1") return false;
    this.ballzSlide1Environment.setBallVisible(visible);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setBallzSlide1Edges(visible: boolean): boolean {
    if (!this.ballzSlide1Environment || this.previewMode !== "ballz-slide1") return false;
    this.ballzSlide1Environment.setEdgesVisible(visible);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setBallzSlide1Bounds(visible: boolean): boolean {
    if (!this.ballzSlide1Environment || this.previewMode !== "ballz-slide1") return false;
    this.ballzSlide1Environment.setBoundsVisible(visible);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getBallzTrackGalleryState(): BallzTrackGalleryEnvironmentState | null {
    return this.ballzTrackGalleryEnvironment?.getState() ?? null;
  }

  selectBallzTrackGalleryAsset(id: BallzTrackGalleryAssetId): boolean {
    if (!this.ballzTrackGalleryEnvironment || this.previewMode !== "ballz-track-gallery") return false;
    this.ballzTrackGalleryEnvironment.selectAsset(id);
    this.applyBallzTrackGalleryCamera(this.ballzTrackGalleryCameraProfile);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setBallzTrackGalleryMaterialMode(mode: BallzTrackGalleryMaterialMode): boolean {
    if (!this.ballzTrackGalleryEnvironment || this.previewMode !== "ballz-track-gallery") return false;
    this.ballzTrackGalleryEnvironment.setMaterialMode(mode);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setBallzTrackGalleryEdges(visible: boolean): boolean {
    if (!this.ballzTrackGalleryEnvironment || this.previewMode !== "ballz-track-gallery") return false;
    this.ballzTrackGalleryEnvironment.setEdgesVisible(visible);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setBallzTrackGalleryBounds(visible: boolean): boolean {
    if (!this.ballzTrackGalleryEnvironment || this.previewMode !== "ballz-track-gallery") return false;
    this.ballzTrackGalleryEnvironment.setBoundsVisible(visible);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setBallzTrackGalleryCamera(profile: BallzTrackGalleryCameraProfile): boolean {
    if (!this.ballzTrackGalleryEnvironment || this.previewMode !== "ballz-track-gallery") return false;
    this.applyBallzTrackGalleryCamera(profile);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getXmlSceneState(): XmlSceneEnvironmentState | null {
    return this.xmlSceneEnvironment?.getState() ?? null;
  }

  orbitXmlSceneByRadians(delta: number): boolean {
    if (!this.xmlSceneEnvironment || this.previewMode !== "xml-myworld-copy") return false;
    this.xmlSceneEnvironment.orbitByRadians(delta, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  resetXmlSceneOrbit(): boolean {
    if (!this.xmlSceneEnvironment || this.previewMode !== "xml-myworld-copy") return false;
    this.xmlSceneEnvironment.resetOrbit(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setXmlSceneObjectVisible(name: string, visible: boolean): boolean {
    if (!this.xmlSceneEnvironment || this.previewMode !== "xml-myworld-copy") return false;
    const changed = this.xmlSceneEnvironment.setObjectVisible(name, visible);
    if (changed) this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  resetXmlSceneObjects(): boolean {
    if (!this.xmlSceneEnvironment || this.previewMode !== "xml-myworld-copy") return false;
    this.xmlSceneEnvironment.resetObjectVisibility();
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getBallzXmlWorldsState(): BallzXmlWorldsState | null {
    return this.ballzXmlWorldsEnvironment?.getState() ?? null;
  }

  selectBallzXmlWorld(sceneId: BallzXmlWorldsState["sceneId"]): boolean {
    if (!this.ballzXmlWorldsEnvironment || this.previewMode !== "ballz-xml-worlds") return false;
    const changed = this.ballzXmlWorldsEnvironment.setScene(sceneId, this.camera);
    if (changed) this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  focusNextBallzXmlWorldObject(): number | null {
    if (!this.ballzXmlWorldsEnvironment || this.previewMode !== "ballz-xml-worlds") return null;
    const index = this.ballzXmlWorldsEnvironment.focusNext(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return index;
  }

  orbitBallzXmlWorldsByRadians(delta: number): boolean {
    if (!this.ballzXmlWorldsEnvironment || this.previewMode !== "ballz-xml-worlds") return false;
    this.ballzXmlWorldsEnvironment.orbitByRadians(delta, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  resetBallzXmlWorlds(): boolean {
    if (!this.ballzXmlWorldsEnvironment || this.previewMode !== "ballz-xml-worlds") return false;
    this.ballzXmlWorldsEnvironment.reset(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getStockroomXmlArtifactState(): StockroomXmlArtifactEnvironmentState | null {
    return this.stockroomXmlArtifactEnvironment?.getState() ?? null;
  }

  selectStockroomXmlArtifact(id: StockroomXmlArtifactId): boolean {
    if (!this.stockroomXmlArtifactEnvironment || this.previewMode !== "xml-serializer-artifacts") return false;
    this.stockroomXmlArtifactEnvironment.selectArtifact(id, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  orbitStockroomXmlArtifactByRadians(delta: number): boolean {
    if (!this.stockroomXmlArtifactEnvironment || this.previewMode !== "xml-serializer-artifacts") return false;
    this.stockroomXmlArtifactEnvironment.orbitByRadians(delta, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  resetStockroomXmlArtifact(): boolean {
    if (!this.stockroomXmlArtifactEnvironment || this.previewMode !== "xml-serializer-artifacts") return false;
    this.stockroomXmlArtifactEnvironment.resetOrbit(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getVehiclePackState(): VehiclePackEnvironmentState | null {
    return this.vehiclePackEnvironment?.getState() ?? null;
  }

  async selectVehiclePackAsset(id: VehiclePackId): Promise<boolean> {
    if (!this.vehiclePackEnvironment || this.previewMode !== "vehicle-pack-gallery") return false;
    const changed = await this.vehiclePackEnvironment.selectVehicle(id, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  orbitVehiclePackByRadians(delta: number): boolean {
    if (!this.vehiclePackEnvironment || this.previewMode !== "vehicle-pack-gallery") return false;
    this.vehiclePackEnvironment.orbitByRadians(delta, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  resetVehiclePackView(): boolean {
    if (!this.vehiclePackEnvironment || this.previewMode !== "vehicle-pack-gallery") return false;
    this.vehiclePackEnvironment.reset(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getObjectLibraryCatalogState(): ObjectLibraryCatalogState | null {
    return this.objectLibraryCatalogEnvironment?.getState() ?? null;
  }

  orbitObjectLibraryCatalogByRadians(delta: number): boolean {
    if (!this.objectLibraryCatalogEnvironment || this.previewMode !== "object-library-catalog") return false;
    this.objectLibraryCatalogEnvironment.orbitByRadians(delta, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  zoomObjectLibraryCatalog(factor: number): boolean {
    if (!this.objectLibraryCatalogEnvironment || this.previewMode !== "object-library-catalog") return false;
    this.objectLibraryCatalogEnvironment.zoomBy(factor, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setObjectLibraryFamilyFilter(filter: ObjectLibraryFamily): boolean {
    if (!this.objectLibraryCatalogEnvironment || this.previewMode !== "object-library-catalog") return false;
    const changed = this.objectLibraryCatalogEnvironment.setFamilyFilter(filter, this.camera);
    if (changed) this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  setObjectLibraryStatusFilter(filter: ObjectLibraryStatusFilter): boolean {
    if (!this.objectLibraryCatalogEnvironment || this.previewMode !== "object-library-catalog") return false;
    const changed = this.objectLibraryCatalogEnvironment.setStatusFilter(filter, this.camera);
    if (changed) this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  selectObjectLibraryIndex(index: number): boolean {
    if (!this.objectLibraryCatalogEnvironment || this.previewMode !== "object-library-catalog") return false;
    const changed = this.objectLibraryCatalogEnvironment.selectIndex(index);
    if (changed) this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  selectNextObjectLibraryObject(direction: number): boolean {
    if (!this.objectLibraryCatalogEnvironment || this.previewMode !== "object-library-catalog") return false;
    const changed = this.objectLibraryCatalogEnvironment.selectNext(direction);
    if (changed) this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  resetObjectLibraryCatalog(): boolean {
    if (!this.objectLibraryCatalogEnvironment || this.previewMode !== "object-library-catalog") return false;
    this.objectLibraryCatalogEnvironment.reset(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getDominusAssetGalleryState(): DominusAssetGalleryState | null {
    return this.dominusAssetGalleryEnvironment?.getState() ?? null;
  }

  orbitDominusAssetGalleryByRadians(delta: number): boolean {
    if (!this.dominusAssetGalleryEnvironment || this.previewMode !== "dominus-asset-gallery") return false;
    this.dominusAssetGalleryEnvironment.orbitByRadians(delta, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  zoomDominusAssetGallery(factor: number): boolean {
    if (!this.dominusAssetGalleryEnvironment || this.previewMode !== "dominus-asset-gallery") return false;
    this.dominusAssetGalleryEnvironment.zoomBy(factor, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  async setDominusAssetFamilyFilter(filter: DominusAssetFamily): Promise<boolean> {
    if (!this.dominusAssetGalleryEnvironment || this.previewMode !== "dominus-asset-gallery") return false;
    const changed = await this.dominusAssetGalleryEnvironment.setFamilyFilter(filter, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  async setDominusAssetStatusFilter(filter: DominusAssetStatusFilter): Promise<boolean> {
    if (!this.dominusAssetGalleryEnvironment || this.previewMode !== "dominus-asset-gallery") return false;
    const changed = await this.dominusAssetGalleryEnvironment.setStatusFilter(filter, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  async selectDominusAssetIndex(index: number): Promise<boolean> {
    if (!this.dominusAssetGalleryEnvironment || this.previewMode !== "dominus-asset-gallery") return false;
    const changed = await this.dominusAssetGalleryEnvironment.selectIndex(index);
    this.dominusAssetGalleryEnvironment.applyToCamera(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  async selectNextDominusAsset(direction: number): Promise<boolean> {
    if (!this.dominusAssetGalleryEnvironment || this.previewMode !== "dominus-asset-gallery") return false;
    const changed = await this.dominusAssetGalleryEnvironment.selectNext(direction);
    this.dominusAssetGalleryEnvironment.applyToCamera(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  async resetDominusAssetGallery(): Promise<boolean> {
    if (!this.dominusAssetGalleryEnvironment || this.previewMode !== "dominus-asset-gallery") return false;
    await this.dominusAssetGalleryEnvironment.reset(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getDominusPortEvidenceState(): DominusPortEvidenceState | null {
    return this.dominusPortEvidenceEnvironment?.getState() ?? null;
  }

  getThreejsPlaygroundState(): ThreejsPlaygroundState | null {
    return this.threejsPlaygroundEnvironment?.getState() ?? null;
  }

  orbitThreejsPlaygroundByRadians(delta: number): boolean {
    if (!this.threejsPlaygroundEnvironment || this.previewMode !== "threejs-playground") return false;
    this.threejsPlaygroundEnvironment.orbitByRadians(delta, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  zoomThreejsPlayground(factor: number): boolean {
    if (!this.threejsPlaygroundEnvironment || this.previewMode !== "threejs-playground") return false;
    this.threejsPlaygroundEnvironment.zoomBy(factor, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  resetThreejsPlayground(): boolean {
    if (!this.threejsPlaygroundEnvironment || this.previewMode !== "threejs-playground") return false;
    this.threejsPlaygroundEnvironment.reset(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setThreejsPlaygroundParameter(parameter: ThreejsPlaygroundParameter, value: number): boolean {
    if (!this.threejsPlaygroundEnvironment || this.previewMode !== "threejs-playground") return false;
    const changed = this.threejsPlaygroundEnvironment.setParameter(parameter, value, this.camera);
    if (changed) this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  getBallzBlenderLevel1State(): BallzBlenderLevel1State | null {
    return this.ballzBlenderLevel1Environment?.getState() ?? null;
  }

  setBallzBlenderLevel1Camera(profile: ArchiveBlenderCameraProfile): boolean {
    if (!this.ballzBlenderLevel1Environment || this.previewMode !== "ballz-blender-level1") return false;
    const changed = this.ballzBlenderLevel1Environment.setCameraProfile(profile, this.camera);
    if (changed) this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  orbitBallzBlenderLevel1(delta: number): boolean {
    if (!this.ballzBlenderLevel1Environment || this.previewMode !== "ballz-blender-level1") return false;
    this.ballzBlenderLevel1Environment.orbitByRadians(delta, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  resetBallzBlenderLevel1(): boolean {
    if (!this.ballzBlenderLevel1Environment || this.previewMode !== "ballz-blender-level1") return false;
    this.ballzBlenderLevel1Environment.reset(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getMaisonExplorerState(): MaisonExplorerState | null {
    return this.maisonExplorerEnvironment?.getState() ?? null;
  }

  selectMaisonSubspace(id: MaisonSubspaceId): boolean {
    if (!this.maisonExplorerEnvironment || this.previewMode !== "maison-explorer") return false;
    const changed = this.maisonExplorerEnvironment.selectSubspace(id, this.camera);
    if (changed) this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  setMaisonCamera(profile: ArchiveBlenderCameraProfile): boolean {
    if (!this.maisonExplorerEnvironment || this.previewMode !== "maison-explorer") return false;
    const changed = this.maisonExplorerEnvironment.setCameraProfile(profile, this.camera);
    if (changed) this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  orbitMaisonExplorer(delta: number): boolean {
    if (!this.maisonExplorerEnvironment || this.previewMode !== "maison-explorer") return false;
    this.maisonExplorerEnvironment.orbitByRadians(delta, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  resetMaisonExplorer(): boolean {
    if (!this.maisonExplorerEnvironment || this.previewMode !== "maison-explorer") return false;
    this.maisonExplorerEnvironment.reset(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getArenaArchiveState(): ArenaArchiveState | null {
    return this.arenaArchiveEnvironment?.getState() ?? null;
  }

  setArenaArchiveCamera(profile: ArenaArchiveCameraProfile): boolean {
    if (!this.arenaArchiveEnvironment || this.previewMode !== "arena-archive") return false;
    const changed = this.arenaArchiveEnvironment.setCameraProfile(profile, this.camera);
    if (changed) this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  orbitArenaArchive(delta: number): boolean {
    if (!this.arenaArchiveEnvironment || this.previewMode !== "arena-archive") return false;
    this.arenaArchiveEnvironment.orbitByRadians(delta, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  resetArenaArchive(): boolean {
    if (!this.arenaArchiveEnvironment || this.previewMode !== "arena-archive") return false;
    this.arenaArchiveEnvironment.reset(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  orbitDominusPortEvidenceByRadians(delta: number): boolean {
    if (!this.dominusPortEvidenceEnvironment || this.previewMode !== "dominus-port-evidence") return false;
    this.dominusPortEvidenceEnvironment.orbitByRadians(delta, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  zoomDominusPortEvidence(factor: number): boolean {
    if (!this.dominusPortEvidenceEnvironment || this.previewMode !== "dominus-port-evidence") return false;
    this.dominusPortEvidenceEnvironment.zoomBy(factor, this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  selectDominusPortEvidence(id: string, focus = true): boolean {
    if (!this.dominusPortEvidenceEnvironment || this.previewMode !== "dominus-port-evidence") return false;
    const changed = this.dominusPortEvidenceEnvironment.selectById(id, focus, this.camera);
    if (changed) this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  selectNextDominusPortEvidence(direction: number): boolean {
    if (!this.dominusPortEvidenceEnvironment || this.previewMode !== "dominus-port-evidence") return false;
    const changed = this.dominusPortEvidenceEnvironment.selectNext(direction, this.camera);
    if (changed) this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  showDominusPortSourceGrid(): boolean {
    if (!this.dominusPortEvidenceEnvironment || this.previewMode !== "dominus-port-evidence") return false;
    this.dominusPortEvidenceEnvironment.showSourceGrid(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  resetDominusPortEvidence(): boolean {
    if (!this.dominusPortEvidenceEnvironment || this.previewMode !== "dominus-port-evidence") return false;
    this.dominusPortEvidenceEnvironment.reset(this.camera);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getCubxActorLineageState(): CubxActorLineageState | null {
    return this.cubxActorLineageEnvironment?.getState() ?? null;
  }

  setCubxActorLineageClip(family: CubxActorClipFamily, pairIndex: CubxActorPairIndex = 1): boolean {
    if (!this.cubxActorLineageEnvironment || this.previewMode !== "cubx-actor-lineage") return false;
    this.cubxActorLineageEnvironment.setClip(family, pairIndex);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  selectCubxActorLineageClick(clickIndex: CubxActorClickIndex): boolean {
    if (!this.cubxActorLineageEnvironment || this.previewMode !== "cubx-actor-lineage") return false;
    this.cubxActorLineageEnvironment.selectClick(clickIndex);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  stepCubxActorLineageFrames(frames: number): boolean {
    if (!this.cubxActorLineageEnvironment || this.previewMode !== "cubx-actor-lineage") return false;
    this.cubxActorLineageEnvironment.stepFrames(frames);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setCubxActorLineagePlaying(playing: boolean): boolean {
    if (!this.cubxActorLineageEnvironment || this.previewMode !== "cubx-actor-lineage") return false;
    this.cubxActorLineageEnvironment.setPlaying(playing);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setCubxActorLineageDirection(direction: CubxActorPlaybackDirection): boolean {
    if (!this.cubxActorLineageEnvironment || this.previewMode !== "cubx-actor-lineage") return false;
    this.cubxActorLineageEnvironment.setDirection(direction);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setCubxActorLineageButtonsVisible(visible: boolean): boolean {
    if (!this.cubxActorLineageEnvironment || this.previewMode !== "cubx-actor-lineage") return false;
    this.cubxActorLineageEnvironment.setButtonsVisible(visible);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setCubxActorLineageDiagnosticColors(enabled: boolean): boolean {
    if (!this.cubxActorLineageEnvironment || this.previewMode !== "cubx-actor-lineage") return false;
    this.cubxActorLineageEnvironment.setDiagnosticColors(enabled);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getSuzanne2State(): Suzanne2AsciiEnvironmentState | null {
    return this.suzanne2Environment?.getState() ?? null;
  }

  setSuzanne2PlayerVisible(visible: boolean): boolean {
    if (!this.suzanne2Environment || this.previewMode !== "suzanne2-archive") return false;
    this.suzanne2Environment.setPlayerVisible(visible);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setSuzanne2XmlVisible(visible: boolean): boolean {
    if (!this.suzanne2Environment || this.previewMode !== "suzanne2-archive") return false;
    this.suzanne2Environment.setXmlAttachmentsVisible(visible);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setSuzanne2CubxVisible(visible: boolean): boolean {
    if (!this.suzanne2Environment || this.previewMode !== "suzanne2-archive") return false;
    this.suzanne2Environment.setCubxAnchorsVisible(visible);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setSuzanne2PistonActivation(index: number, activation: number): boolean {
    if (!this.suzanne2Environment || this.previewMode !== "suzanne2-archive") return false;
    this.suzanne2Environment.setPistonActivation(index, activation);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  resetSuzanne2Rings(): boolean {
    if (!this.suzanne2Environment || this.previewMode !== "suzanne2-archive") return false;
    this.suzanne2Environment.resetRings();
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getNotesManagerState(): NotesManagerState | null {
    return this.notesManagerEnvironment?.getState() ?? null;
  }

  addArchiveNote(): number | null {
    if (!this.notesManagerEnvironment || this.previewMode !== "notes-manager-lab") return null;
    const index = this.notesManagerEnvironment.addNote();
    this.options.onArchiveSelectorStateChanged?.();
    return index;
  }

  resetArchiveNotes(): boolean {
    if (!this.notesManagerEnvironment || this.previewMode !== "notes-manager-lab") return false;
    this.notesManagerEnvironment.reset();
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getMilkyWayState(): MilkyWayState | null {
    return this.milkyWayEnvironment?.getState() ?? null;
  }

  setMilkyWayProfile(profile: MilkyWayProfile): boolean {
    if (this.previewMode !== "milky-way-lab" || (profile !== "graphysx2017" && profile !== "ballz2015")) return false;
    this.milkyWayProfile = profile;
    this.mountMilkyWayEnvironment();
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  resetMilkyWay(): boolean {
    if (!this.milkyWayEnvironment || this.previewMode !== "milky-way-lab") return false;
    this.milkyWayEnvironment.reset();
    return true;
  }

  getNatureLabState(): NatureLabState | null {
    return this.natureLab?.getState() ?? null;
  }

  setNatureLabStudy(study: NatureLabStudyId): boolean {
    if (!this.natureLab || this.previewMode !== "nature-lab") {
      return false;
    }
    this.natureLabStudy = study;
    this.natureLab.setStudy(study);
    this.applyNatureLabPresentation(study);
    this.focusMenu();
    return true;
  }

  setNatureLabLesson(lesson: NatureLabLessonId): boolean {
    if (!this.natureLab || this.previewMode !== "nature-lab") {
      return false;
    }
    return this.natureLab.setLesson(lesson);
  }

  setNatureLabPaused(paused: boolean): boolean {
    if (!this.natureLab || this.previewMode !== "nature-lab") {
      return false;
    }
    this.natureLab.setPaused(paused);
    return true;
  }

  stepNatureLab(seconds = 0.5): boolean {
    if (!this.natureLab || this.previewMode !== "nature-lab") {
      return false;
    }
    return this.natureLab.step(seconds);
  }

  performNatureLabAction(): boolean {
    if (!this.natureLab || this.previewMode !== "nature-lab") {
      return false;
    }
    return this.natureLab.performLessonAction();
  }

  setNatureLabParameter(parameter: NatureLabParameter, value: number): boolean {
    if (!this.natureLab || this.previewMode !== "nature-lab") {
      return false;
    }
    this.natureLab.setParameter(parameter, value);
    return true;
  }

  getNatureLabRecipe(): GraphysXWorldRecipe | null {
    return this.natureLab?.getRecipe() ?? null;
  }

  loadNatureLabRecipe(recipe: GraphysXWorldRecipe): boolean {
    if (!this.natureLab || this.previewMode !== "nature-lab" || !this.natureLab.loadRecipe(recipe)) {
      return false;
    }
    this.natureLabStudy = recipe.study;
    this.applyNatureLabPresentation(recipe.study);
    this.focusMenu();
    return true;
  }

  setNatureLabLayer(layer: NatureLabLayer, visible: boolean): boolean {
    if (!this.natureLab || this.previewMode !== "nature-lab") {
      return false;
    }
    this.natureLab.setLayer(layer, visible);
    return true;
  }

  setNatureLabObserver(observer: GraphysXWorldObserver): boolean {
    if (!this.natureLab || this.previewMode !== "nature-lab") {
      return false;
    }
    return this.natureLab.setObserver(observer);
  }

  toggleNatureLabTrails(): boolean | null {
    if (!this.natureLab || this.previewMode !== "nature-lab") {
      return null;
    }
    return this.natureLab.toggleTrails();
  }

  resetNatureLab(): boolean {
    if (!this.natureLab || this.previewMode !== "nature-lab") {
      return false;
    }
    this.natureLab.reset();
    return true;
  }

  getAgentWorldState(): AgentWorldState | null {
    return this.agentWorld?.getState() ?? null;
  }

  getAgentWorldTransformToolState(): { mode: TransformControlsMode; space: "world" | "local"; selectedId: string | null } {
    return {
      mode: this.agentTransformControls.getMode(),
      space: this.agentTransformControls.space,
      selectedId: this.agentTransformEntityId
    };
  }

  selectAgentWorldEntities(ids: string[]): string[] {
    const selected = this.agentWorld?.select(ids) ?? [];
    this.syncAgentTransformControls();
    this.options.onAgentWorldStateChanged?.();
    return selected;
  }

  setAgentWorldTransformMode(mode: TransformControlsMode): TransformControlsMode {
    this.agentTransformControls.setMode(mode);
    return this.agentTransformControls.getMode();
  }

  setAgentWorldTransformSpace(space: "world" | "local"): "world" | "local" {
    this.agentTransformControls.setSpace(space);
    return this.agentTransformControls.space;
  }

  createAgentWorld(definition: AgentWorldDefinition): AgentWorldResult<AgentWorldState> {
    const result = this.agentWorld?.create(definition) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok, true);
    return result;
  }

  loadAgentWorldDemo(): AgentWorldResult<AgentWorldState> {
    return this.createAgentWorld(GRAPHYSX_AGENT_DEMO_WORLD);
  }

  clearAgentWorld(id?: string, label?: string): AgentWorldResult<AgentWorldState> {
    const result = this.agentWorld?.clear(id, label) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok, true);
    return result;
  }

  spawnAgentWorldEntity(entity: AgentWorldEntityDefinition): AgentWorldResult<AgentWorldEntityState> {
    const result = this.agentWorld?.spawn(entity) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok);
    return result;
  }

  updateAgentWorldEntity(id: string, patch: AgentWorldEntityPatch): AgentWorldResult<AgentWorldEntityState> {
    const result = this.agentWorld?.updateEntity(id, patch) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok);
    return result;
  }

  removeAgentWorldEntity(id: string): AgentWorldResult<string[]> {
    const result = this.agentWorld?.remove(id) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok);
    return result;
  }

  attachAgentWorldBehavior(id: string, behavior: AgentWorldBehavior): AgentWorldResult<{ entityId: string; behaviorId: string }> {
    const result = this.agentWorld?.attachBehavior(id, behavior) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok);
    return result;
  }

  detachAgentWorldBehavior(id: string, behaviorId: string): AgentWorldResult<string> {
    const result = this.agentWorld?.detachBehavior(id, behaviorId) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok);
    return result;
  }

  interactAgentWorld(id: string, interactionId?: string): AgentWorldResult<AgentWorldInteractionReceipt> {
    const result = this.agentWorld?.interact(id, interactionId) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok);
    if (!result.ok) this.options.onAgentWorldStateChanged?.();
    return result;
  }

  listAgentWorldPrefabs(): readonly AgentWorldPrefabDescriptor[] {
    return this.agentWorld?.listPrefabs() ?? [];
  }

  spawnAgentWorldPrefab(prefabId: AgentWorldPrefabId, options?: AgentWorldPrefabOptions): AgentWorldResult<AgentWorldPrefabInstance> {
    const result = this.agentWorld?.spawnPrefab(prefabId, options) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok);
    if (!result.ok) this.options.onAgentWorldStateChanged?.();
    return result;
  }

  listAgentWorldStarters(): readonly AgentWorldStarterDescriptor[] {
    return this.agentWorld?.listStarters() ?? [];
  }

  loadAgentWorldStarter(starterId: AgentWorldStarterId, options?: AgentWorldStarterOptions): AgentWorldResult<AgentWorldState> {
    const result = this.agentWorld?.loadStarter(starterId, options) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok, true);
    if (!result.ok) this.options.onAgentWorldStateChanged?.();
    return result;
  }

  transactAgentWorld(commands: AgentWorldCommand[]): AgentWorldResult<unknown[]> {
    const result = this.agentWorld?.transaction(commands) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok, commands.some((command) => command.op === "set-environment"));
    return result;
  }

  commitAgentWorld(changeSet: AgentWorldChangeSet): AgentWorldResult<AgentWorldCommitReceipt> {
    const result = this.agentWorld?.commit(changeSet) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    const environmentChanged = Array.isArray(changeSet?.commands) && changeSet.commands.some((command) => command.op === "set-environment");
    this.afterAgentWorldMutation(result.ok, environmentChanged);
    if (!result.ok) this.options.onAgentWorldStateChanged?.();
    return result;
  }

  getAgentWorldHistory(sinceRevision?: number): AgentWorldCommitSummary[] {
    return this.agentWorld?.getCommitHistory(sinceRevision) ?? [];
  }

  undoAgentWorld(): AgentWorldResult<AgentWorldState> {
    const result = this.agentWorld?.undo() ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok, true);
    return result;
  }

  pauseAgentWorld(paused: boolean): AgentWorldResult<boolean> {
    const result = this.agentWorld?.setPaused(paused) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok);
    return result;
  }

  stepAgentWorld(seconds = 1): AgentWorldResult<number> {
    const result = this.agentWorld?.step(seconds) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok);
    return result;
  }

  queryAgentWorld(query?: AgentWorldQuery): AgentWorldEntityState[] {
    return this.agentWorld?.query(query) ?? [];
  }

  observeAgentWorld(query?: AgentWorldQuery): ReturnType<AgentWorldRuntime["observe"]> | null {
    return this.agentWorld?.observe(query) ?? null;
  }

  readAgentWorldEvents(since?: number): AgentWorldEventPage {
    return this.agentWorld?.readEvents(since) ?? { events: [], sequence: 0, dropped: false };
  }

  // The rules layer reaches the legacy host the same way everything else does: this class
  // holds the identical `AgentWorldRuntime` the standalone host does, so parity here is four
  // delegates rather than a second evaluator. A rules block authored on either host is the
  // same document field, judged by the same reducer.
  getAgentWorldRules(): AgentWorldRulesDefinition | null {
    return this.agentWorld?.getRules() ?? null;
  }

  setAgentWorldRules(rules: AgentWorldRulesDefinition | null): AgentWorldResult<AgentWorldRunStatus | null> {
    const result = this.agentWorld?.setRules(rules) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok);
    return result;
  }

  agentWorldRunStatus(): AgentWorldRunStatus | null {
    return this.agentWorld?.runStatus() ?? null;
  }

  resetAgentWorldRun(): AgentWorldResult<AgentWorldRunStatus | null> {
    return this.agentWorld?.resetRun() ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
  }

  exportAgentWorld(): AgentWorldDefinition | null {
    return this.agentWorld?.exportDefinition() ?? null;
  }

  exportAgentWorldDocument(): AgentWorldDefinition | null {
    return this.agentWorld?.exportDocument() ?? null;
  }

  saveAgentWorld(name: string): AgentWorldResult<string> {
    const result = this.agentWorld?.save(name) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok);
    return result;
  }

  loadAgentWorld(nameOrDefinition: string | AgentWorldDefinition): AgentWorldResult<AgentWorldState> {
    const result = this.agentWorld?.load(nameOrDefinition) ?? { ok: false, revision: 0, error: "Agent World Studio is not open" };
    this.afterAgentWorldMutation(result.ok, true);
    return result;
  }

  getSkyboxSelectorState(): SkyboxSelectorState | null {
    return this.skyboxSelectorEnvironment?.getState() ?? null;
  }

  selectSkyboxFromArchive(id: SkyboxSelectorId): boolean {
    if (!this.skyboxSelectorEnvironment || this.previewMode !== "skybox-selector") {
      return false;
    }
    const selected = this.skyboxSelectorEnvironment.select(id);
    if (selected) {
      this.options.onArchiveSelectorStateChanged?.();
    }
    return selected;
  }

  resetSkyboxSelector(): boolean {
    if (!this.skyboxSelectorEnvironment || this.previewMode !== "skybox-selector") {
      return false;
    }
    this.skyboxSelectorEnvironment.resetToIcons();
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getCarSelectorState(): CarSelectorState | null {
    return this.carSelectorEnvironment?.getState() ?? null;
  }

  resetCarSelector(): boolean {
    if (!this.carSelectorEnvironment || this.previewMode !== "car-selector") {
      return false;
    }
    this.carSelectorEnvironment.reset();
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  getActiveParticleCount(): number {
    return this.particles.activeCount;
  }

  getArchivedParticlePresetLibraryState(): ParticlePresetLibraryState | null {
    return this.particlePresetLibraryEnvironment?.getState() ?? null;
  }

  selectArchivedParticlePreset(id: string): boolean {
    if (!this.particlePresetLibraryEnvironment || this.previewMode !== "game-lab") return false;
    const changed = this.particlePresetLibraryEnvironment.selectPreset(id);
    if (changed) this.options.onArchiveSelectorStateChanged?.();
    return changed;
  }

  selectNextArchivedParticlePreset(direction: number): boolean {
    if (!this.particlePresetLibraryEnvironment || this.previewMode !== "game-lab") return false;
    this.particlePresetLibraryEnvironment.selectNext(direction);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  restartArchivedParticlePreset(): boolean {
    if (!this.particlePresetLibraryEnvironment || this.previewMode !== "game-lab") return false;
    this.particlePresetLibraryEnvironment.restart();
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setArchivedParticlePresetPaused(paused: boolean): boolean {
    if (!this.particlePresetLibraryEnvironment || this.previewMode !== "game-lab") return false;
    this.particlePresetLibraryEnvironment.setPaused(paused);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  setArchivedParticlePresetAutoReplay(autoReplay: boolean): boolean {
    if (!this.particlePresetLibraryEnvironment || this.previewMode !== "game-lab") return false;
    this.particlePresetLibraryEnvironment.setAutoReplay(autoReplay);
    this.options.onArchiveSelectorStateChanged?.();
    return true;
  }

  debugExposeVehicleUnderside(): boolean {
    if (!this.vehicleRig) {
      return false;
    }
    const { chassisBody } = this.vehicleRig;
    const position = this.physics.readPosition(chassisBody, new Vector3());
    const rotation = new Quaternion().setFromEuler(new Euler(Math.PI, 0, 0));
    position.y += 2.8;
    this.physics.writeTransform(chassisBody, position, rotation);
    this.physics.writeLinearVelocity(chassisBody, new Vector3());
    this.physics.writeAngularVelocity(chassisBody, new Vector3());
    this.physics.wakeBody(chassisBody);
    return true;
  }

  getVehicleDebugState(): {
    chassisHandle: number;
    playerHandle: number;
    chassisDynamic: boolean;
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    wheels: Array<{ contact: boolean; suspensionLength: number | null; steering: number | null }>;
  } | null {
    if (!this.vehicleRig) return null;
    const position = this.physics.readPosition(this.vehicleRig.chassisBody, new Vector3());
    const velocity = this.physics.readLinearVelocity(this.vehicleRig.chassisBody, new Vector3());
    return {
      chassisHandle: this.vehicleRig.chassisBody.id,
      playerHandle: this.playerBody.id,
      chassisDynamic: this.vehicleRig.chassisBody.rigidBody.isDynamic(),
      position: { x: position.x, y: position.y, z: position.z },
      velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
      wheels: this.vehicleRig.wheels.map(({ index }) => ({
        contact: this.vehicleRig!.vehicle.wheelIsInContact(index),
        suspensionLength: this.vehicleRig!.vehicle.wheelSuspensionLength(index),
        steering: this.vehicleRig!.vehicle.wheelSteering(index)
      }))
    };
  }

  getRaceLoadState(): RaceLoadState {
    if (this.race.suzanneAscii) {
      const state = this.suzanneAsciiEnvironment?.getState();
      return {
        ready: state?.ready ?? false,
        loading: !state || state.loadStatus === "loading",
        requiredKeys: ["suzanne1-ascii-textures"],
        error: state?.loadError ?? undefined
      };
    }
    const requiredKeys = this.getRequiredLegacyKeys();
    const failedKey = requiredKeys.find((key) => this.failedLegacyLoads.has(key));
    return {
      ready: requiredKeys.every((key) => legacyDataReady(key)),
      loading: requiredKeys.some((key) => this.pendingLegacyLoads.has(key)),
      requiredKeys,
      error: failedKey ? this.failedLegacyLoads.get(failedKey) : undefined
    };
  }

  retryCurrentRaceAssets(): void {
    if (this.race.suzanneAscii) {
      this.rebuildRaceWorld();
      this.resetRace();
      this.options.onRaceAssetsChanged?.();
      return;
    }
    for (const key of this.getRequiredLegacyKeys()) {
      this.failedLegacyLoads.delete(key);
    }
    this.ensureLegacyData(this.getRequiredLegacyKeys());
    this.options.onRaceAssetsChanged?.();
  }

  setRace(raceId: string): void {
    const nextRace = RACE_DEFINITIONS.find((candidate) => candidate.id === raceId) ?? RACE_DEFINITIONS[0];
    this.race = nextRace;
    this.accent = new Color(nextRace.palette.accent);
    this.rebuildRaceWorld();
    this.resetRace();
  }

  /** play a definition that is not part of RACE_DEFINITIONS (e.g. an editor draft) */
  setCustomRace(definition: RaceDefinition): void {
    this.race = definition;
    this.accent = new Color(definition.palette.accent);
    this.rebuildRaceWorld();
    this.resetRace();
  }

  nextRace(): RaceDefinition {
    const currentIndex = RACE_DEFINITIONS.findIndex((candidate) => candidate.id === this.race.id);
    const next = RACE_DEFINITIONS[(currentIndex + 1) % RACE_DEFINITIONS.length];
    this.setRace(next.id);
    return next;
  }

  setPreviewMode(mode: ArchivePreviewMode): void {
    this.previewMode = mode;
    this.camera.far = mode === "threejs-playground" ? 30000 : mode === "ballz-blender-level1" || mode === "maison-explorer" || mode === "arena-archive" ? 500 : mode === "cubx-actor-lineage" ? 1000 : mode === "object-library-catalog" || mode === "dominus-port-evidence" ? 520 : mode === "dominus-asset-gallery" ? 100 : mode === "ballz-2011-level1" || mode === "ballz-slide1" || mode === "ballz-track-gallery" ? 500 : 260;
    this.camera.updateProjectionMatrix();
    this.particlePreviewAccumulator = 0;
    this.particles.clear();
    this.rebuildArchivePreview();
    this.applyPreviewSkybox();
    const useArchivedRoomLighting = mode === "common-room-lab" || mode === "threejs-playground" || mode === "ballz-blender-level1" || mode === "maison-explorer" || mode === "arena-archive" || mode === "ballz-slide1" || mode === "xml-myworld-copy" || mode === "ballz-xml-worlds" || mode === "xml-serializer-artifacts" || mode === "vehicle-pack-gallery" || mode === "object-library-catalog" || mode === "dominus-asset-gallery" || mode === "dominus-port-evidence" || mode === "suzanne2-archive";
    if (this.baseAmbientLight) {
      this.baseAmbientLight.visible = !useArchivedRoomLighting;
    }
    if (this.atmosphereRig) {
      this.atmosphereRig.key.visible = !useArchivedRoomLighting;
      this.atmosphereRig.rim.visible = !useArchivedRoomLighting;
      this.atmosphereRig.hemi.visible = !useArchivedRoomLighting;
    }
    if (this.hazePass) {
      this.hazePass.enabled = mode === "race-preview" && Boolean(this.race.atmosphere);
    }
    this.menuCube.visible = this.menuMode && mode === "menu";
    this.archivePreviewGroup.visible = this.menuMode && mode !== "menu" && mode !== "race-preview";
    this.setRaceWorldVisible(mode === "race-preview");
    if (this.menuMode) {
      this.focusMenu();
    }
    this.renderer.domElement.style.cursor = this.getPreviewCursor();
  }

  /** the race world should only render in menu/race context, never behind lab previews */
  private setRaceWorldVisible(visible: boolean): void {
    this.worldGroup.visible = visible;
    this.startGate.visible = visible;
    this.halfGate.visible = visible;
    this.finishGate.visible = visible;
    this.playerGroup.visible = visible && !this.race.vehicle && !this.race.flight;
    if (this.sunSprite && !visible) {
      this.sunSprite.visible = false;
    }
  }

  getCubXMenuState() {
    const selectedCube = this.cubxMenu?.selectedCube ?? null;
    const section = selectedCube === null ? null : CUBX_SECTIONS[selectedCube];
    const phase = this.cubxMenu?.phase ?? "idle";
    const progress = this.cubxMenu?.progress ?? 0;
    const rotationSelection = selectedCube !== null && selectedCube >= 1
      ? selectedCube as CubzRotationSelection
      : null;
    const activeTvaSample =
      phase === "rotating" && rotationSelection
        ? sampleCubzRotationForward(rotationSelection, progress * CUBZ_ROTATION_DURATION_SECONDS)
        : phase === "returning" && rotationSelection
          ? sampleCubzRotationReverse(rotationSelection, progress * CUBZ_ROTATION_DURATION_SECONDS)
          : phase === "opening"
            ? sampleCubzOpenForward(progress * CUBZ_OPEN_DURATION_SECONDS)
            : phase === "closing"
              ? sampleCubzOpenReverse(progress * CUBZ_OPEN_DURATION_SECONDS)
              : phase === "open"
                ? sampleCubzOpenForward(CUBZ_OPEN_DURATION_SECONDS)
                : null;
    return {
      phase,
      selectedCube,
      selectedLabel: section?.label ?? null,
      actions: section?.actions ?? [],
      selectedAction: this.cubxMenu?.selectedAction ?? null,
      ballSelector: {
        selected: this.ballPreset,
        options: ["fire", "classic2015", "revival"] as const,
        recoveredMeshesReady: Boolean(tvmCatalog?.ball?.fire && tvmCatalog?.ball?.shell),
        meshSource: "src/legacy/tvm-catalog.json#ball" as const,
        firePhysics: "revival" as const
      },
      sunLaunch: {
        raceId: "flightx-pipe" as const,
        source: "AtmelCubx/CubXScene.cpp red sun box" as const,
        interactive: Boolean(this.cubxMenu?.sunButton)
      },
      satellites: {
        activeMenuLevel: this.cubxMenu?.activeMenuLevel ?? 0,
        selected: this.cubxMenu?.selectedSatellite ?? null,
        menuRules: CUBX_MENU_RULES,
        displayScale: CUBX_SATELLITE_DISPLAY_SCALE,
        items: CUBX_SATELLITES.map((spec) => {
          const offset = cubXSatelliteDisplayOffset(spec.sourcePosition);
          const origin = this.cubxMenu?.root.position;
          return {
            ...spec,
            visible: isCubXMenuTagVisible(spec.menuTag, this.cubxMenu?.activeMenuLevel ?? 0),
            displayPosition: [
              Number(((origin?.x ?? -3.7) + offset[0]).toFixed(4)),
              Number(((origin?.y ?? 2.45) + offset[1]).toFixed(4)),
              Number(((origin?.z ?? -0.25) + offset[2]).toFixed(4))
            ] as const
          };
        }),
        visualAdapter: {
          sourceCoordinatesExact: true,
          recoveredArrowGeometryReady: Boolean(
            tvmCatalog?.assets?.some((asset: { id?: string }) => asset.id === "fleche")
          ),
          pending: "Box.tvm, Earth.tvm, Sphere.tvm and their original CubX textures are not yet present in the browser converter output",
          presentation: "Uniform constellation scale plus procedural box/earth shells; Earth-grid spin has no recovered source rate"
        }
      },
      sourceLayout: {
        modelScale: CUBZ_SOURCE_MODEL_SCALE,
        cubeSize: CUBZ_SOURCE_BOX_SIZE,
        centers: CUBZ_SOURCE_CENTERS,
        displayScale: CUBZ_DISPLAY_SCALE,
        displayCenters: CUBZ_SOURCE_CENTERS.map((position) => {
          const center = cubZDisplayCenter(position);
          return [Number(center.x.toFixed(4)), Number(center.y.toFixed(4)), Number(center.z.toFixed(4))];
        }),
        exactHitLayout: true
      },
      sourceAnimation: {
        decoded: true,
        activeSample: activeTvaSample,
        rotationClips: CUBZ_TVA_CLIPS.rotation,
        openClip: CUBZ_TVA_CLIPS.open,
        selectionZeroSkipsRotation: true,
        reverseRepair: CUBZ_TVA_FIDELITY.reverseRepair,
        choreography: {
          idleSpinDegreesPerSecond: [20, 20, 20] as const,
          rotationRangeDurationSeconds: CUBZ_ROTATION_DURATION_SECONDS,
          openRangeDurationSeconds: CUBZ_OPEN_DURATION_SECONDS,
          cameraFly: {
            sourceStart: CUBX_CAMERA_SOURCE_START.toArray(),
            stepPerFrame: CUBX_CAMERA_SOURCE_STEP_PER_FRAME.toArray(),
            sourceTarget: CUBX_CAMERA_SOURCE_TARGET.toArray(),
            current: this.cubxMenu?.cameraSourcePosition.toArray() ?? CUBX_CAMERA_SOURCE_START.toArray(),
            complete: this.cubxMenu?.cameraFlyComplete ?? false
          },
          screensaverOwnedByGlobalMenuCamera: true
        },
        visualAdapter: {
          status: "decoded-cubz-tva-tracks-on-procedural-cubz-geometry" as const,
          exact: "CubeRot GlobalCube and CubeOpen Right08/Top08/Left08 stored quaternion tracks, source ranges, 30 fps timing and same-range reverse playback",
          pending: "Original CubZ actor/button geometry/material conversion and a verified TV3D-to-Three handedness transform"
        }
      },
      presentation: {
        visibleCubeCount: this.cubxMenu?.cubelets.filter((cube) => cube.visible).length ?? 0,
        panelsVisible: Boolean(this.cubxMenu?.panelGroup.visible),
        satelliteShellVisible: Boolean(this.cubxMenu?.satelliteGroup.visible),
        cameraDistance: Number(this.cameraDistance.toFixed(3)),
        adapter: "exact TVA timing with selected-cube isolation, a source-disclosed panel inspection layout, and readable framing"
      },
      animationFidelity: "decoded-cuberot-and-cubeopen-visual-adapter" as const
    };
  }

  selectCubXCube(index: number): boolean {
    const menu = this.cubxMenu;
    if (!menu || menu.phase !== "idle" || index < 0 || index >= CUBX_SECTIONS.length) {
      return false;
    }
    menu.selectedCube = index;
    menu.selectedAction = null;
    menu.phase = index === 0 ? "opening" : "rotating";
    menu.progress = 0;
    menu.restQuaternion.copy(menu.root.quaternion);
    menu.startRotation.set(menu.root.rotation.x, menu.root.rotation.y, menu.root.rotation.z);
    menu.targetRotation.copy(menu.startRotation);
    menu.transitionDuration = CUBZ_ROTATION_DURATION_SECONDS;
    menu.cubelets.forEach((cube, cubeIndex) => {
      cube.visible = cubeIndex === index;
    });
    menu.satelliteGroup.visible = false;
    if (index === 0) {
      menu.cubelets.forEach((cube) => { cube.visible = false; });
      menu.panelGroup.visible = true;
    }
    if (index === 0) {
      menu.panelGroup.visible = true;
    }
    const section = CUBX_SECTIONS[index];
    menu.panels.forEach((panel, actionIndex) => {
      const material = panel.material;
      if (material instanceof MeshStandardMaterial) {
        material.map = this.createCubXLabelTexture(section.actions[actionIndex], section.label.toUpperCase(), "#ffbf69", "#17202d");
        material.emissiveIntensity = 0.42;
        material.needsUpdate = true;
      }
    });
    this.options.onCubXStateChanged?.();
    return true;
  }

  activateCubXAction(actionIndex: number): boolean {
    const menu = this.cubxMenu;
    if (!menu || menu.phase !== "open" || menu.selectedCube === null) {
      return false;
    }
    const action = CUBX_SECTIONS[menu.selectedCube].actions[actionIndex];
    if (!action) {
      return false;
    }
    if (menu.selectedCube === 4 && actionIndex < 3) {
      this.setBallPreset((["fire", "classic2015", "revival"] as const)[actionIndex]);
    }
    menu.selectedAction = action;
    menu.panels.forEach((panel, index) => {
      const material = panel.material;
      if (material instanceof MeshStandardMaterial) {
        material.emissiveIntensity = index === actionIndex ? 1.25 : 0.42;
      }
    });
    this.options.onCubXStateChanged?.();
    return true;
  }

  closeCubXMenu(): boolean {
    const menu = this.cubxMenu;
    if (!menu || menu.phase !== "open") {
      return false;
    }
    menu.phase = "closing";
    menu.progress = 0;
    this.options.onCubXStateChanged?.();
    return true;
  }

  launchCubXSun(): boolean {
    if (!this.cubxMenu || this.previewMode !== "cubx-lab" || !this.menuMode) return false;
    this.options.onCubXLaunchRace?.("flightx-pipe");
    return true;
  }

  activateCubXSatellite(id: CubXSatelliteId): boolean {
    const menu = this.cubxMenu;
    const spec = CUBX_SATELLITES.find((candidate) => candidate.id === id);
    if (!menu || !spec || !isCubXMenuTagVisible(spec.menuTag, menu.activeMenuLevel)) {
      return false;
    }
    menu.selectedSatellite = id;
    if (spec.action === "flightx-pipe") {
      return this.launchCubXSun();
    }
    if (spec.action === "return-main") {
      menu.activeMenuLevel = 0;
      this.syncCubXSatelliteVisibility(menu);
      if (menu.phase === "open") {
        this.closeCubXMenu();
        return true;
      }
    } else if (spec.action === "car-scene") {
      this.options.onCubXOpenArchiveMode?.("car-selector");
    }
    // System's recovered handler begins an unavailable explosion scene and
    // Earth's recovered click handler is empty. Selecting them is therefore
    // intentionally inspect-only instead of inventing a destination.
    this.options.onCubXStateChanged?.();
    return true;
  }

  setMathFormulaParams(params: MathFormulaParams): void {
    this.mathParams = params;
    if (this.previewMode === "math-lab") {
      this.rebuildArchivePreview();
    }
  }

  getMathLabViewState(): {
    yawRadians: number;
    pitchRadians: number;
    distance: number;
    position: [number, number, number];
    lookAt: [number, number, number];
    controls: string;
  } | null {
    if (this.previewMode !== "math-lab") return null;
    return {
      yawRadians: this.cameraYaw,
      pitchRadians: this.cameraPitch,
      distance: this.cameraDistance,
      position: this.camera.position.toArray() as [number, number, number],
      lookAt: [0, 2.8, 0],
      controls: "Drag to orbit; wheel to zoom; Reset 3D View restores the inspection camera."
    };
  }

  resetMathLabView(): boolean {
    if (this.previewMode !== "math-lab") return false;
    this.cameraYaw = -0.28;
    this.cameraPitch = 0.46;
    this.cameraDistance = 26;
    this.camera.fov = 55;
    this.camera.far = 260;
    this.camera.updateProjectionMatrix();
    this.updateVisitCamera(1, true);
    return true;
  }

  setMapEditorDraft(draft: MapEditorDraft): void {
    this.mapEditorDraft = {
      width: draft.width,
      height: draft.height,
      cellSize: draft.cellSize,
      tiles: [...draft.tiles]
    };
    if (this.previewMode === "map-editor") {
      this.rebuildArchivePreview();
    }
  }

  setMenuMode(enabled: boolean): void {
    this.menuMode = enabled;
    this.menuCube.visible = enabled && this.previewMode === "menu";
    this.archivePreviewGroup.visible = enabled && this.previewMode !== "menu" && this.previewMode !== "race-preview";
    if (enabled) {
      this.raceActive = false;
      this.raceFinished = false;
      this.racePaused = false;
      this.clearOverlay();
      this.setRaceWorldVisible(this.previewMode === "race-preview");
      this.applyPreviewSkybox();
      this.focusMenu();
    } else {
      this.menuCube.visible = false;
      this.archivePreviewGroup.visible = false;
      this.setRaceWorldVisible(true);
    }
  }

  setVirtualInput(code: string, down: boolean): boolean {
    this.input.setVirtualKey(code, down);
    return true;
  }

  setRacePaused(paused: boolean): boolean {
    if (paused && (!this.raceActive || this.raceFinished || this.menuMode)) return false;
    this.racePaused = paused;
    this.input.reset();
    return true;
  }

  isRacePaused(): boolean {
    return this.racePaused;
  }

  getInputState(): ReturnType<InputController["getInputState"]> {
    return this.input.getInputState();
  }

  getDeviceMonitorState(): ReturnType<InputController["getDeviceMonitorState"]> {
    return this.input.getDeviceMonitorState();
  }

  setAccent(color: Color): void {
    this.accent = color;
    this.applyGateAccent();
  }

  startRace(): boolean {
    const loadState = this.getRaceLoadState();
    if (!loadState.ready) {
      this.ensureLegacyData(loadState.requiredKeys);
      this.options.onRaceAssetsChanged?.();
      return false;
    }
    this.setMenuMode(false);
    this.resetRace();
    this.input.reset();
    this.raceActive = true;
    this.raceFinished = false;
    this.racePaused = false;
    this.playTransitionWipe();
    this.beginGhostRun();
    if (this.race.id === "ballz18-level01") {
      // Countdown.cs waits 0.5 s, then plays beepShort at 3/2/1 one second
      // apart and beep01 at GO. Keep the web control lock repaired and expose
      // the exact archived samples at their authored moments.
      this.raceCountdownRemaining = 3.5;
      this.ballz18CountdownCue = "waiting";
      this.ballz18CountdownReadyPlays = 0;
      this.ballz18CountdownGoPlays = 0;
    } else {
      this.audio.start();
      this.showOverlayWords(["3", "2", "1", "go"], 0.8);
      this.raceCountdownRemaining = 0;
      this.ballz18CountdownCue = "idle";
    }
    this.clock.start();
    return true;
  }

  resetRace(): void {
    this.clearOverlay();
    this.raceActive = false;
    this.raceFinished = false;
    this.racePaused = false;
    this.raceCountdownRemaining = 0;
    this.ballz18CountdownCue = "idle";
    this.ballz18CountdownReadyPlays = 0;
    this.ballz18CountdownGoPlays = 0;
    this.elapsedMs = 0;
    this.ringsCollected = 0;
    this.lapsCompleted = 0;
    this.clearBullets();
    this.hasReachedHalfway = false;
    this.canJump = true;
    this.arrowHeading = Math.PI;
    this.cameraYaw = this.getDefaultRaceCameraYaw();
    this.cameraPitch = this.getDefaultRaceCameraPitch();
    this.raceCameraDistance = this.getDefaultRaceCameraDistance();
    this.controllerVector.set(0, 0);
    this.activeForceZone = null;
    this.forceEffectAccumulator = 0;
    if (this.vehicleRig) {
      // rebuild the vehicle fresh at the start line (wheel constraints don't teleport well)
      this.teardownVehicle();
      this.buildVehicle();
    }
    if (this.flightRig) {
      this.flightRig.group.position.copy(this.raceStart);
      this.flightRig.group.quaternion.identity();
      this.flightRig.speed = 0;
    }
    setBodyTransform(this.playerBody, this.vehicleRig ? new Vector3(400, 2, 400) : this.raceStart);
    this.playerGroup.position.copy(this.raceStart);
    this.previousPlayerPosition.copy(this.raceStart);
    this.playerGroup.quaternion.identity();
    this.shell.position.set(0, 0, 0);
    this.shell.rotation.set(0, 0, 0);
    this.shellWire.rotation.set(0, 0, 0);
    this.innerBall.position.set(0, 0, 0);
    this.innerBall.rotation.set(-Math.PI / 2, this.arrowHeading, 0);
    this.innerArrow.rotation.set(0, this.arrowHeading, 0);
    this.innerArrow.position.set(0, INNER_RADIUS * 0.84, -INNER_RADIUS * 0.1);
    if (this.ballz18AiRival) {
      setBodyTransform(this.ballz18AiRival.body, this.ballz18AiRival.start);
      this.ballz18AiRival.group.position.copy(this.ballz18AiRival.start);
      this.ballz18AiRival.group.quaternion.identity();
      this.ballz18AiRival.waypointIndex = 0;
      this.ballz18AiRival.circuitsCompleted = 0;
    }
    for (const ring of this.ringMeshes) {
      ring.visible = true;
    }
    if (!this.menuMode) {
      this.focusTrack();
    }
  }

  focusTrack(): void {
    this.updateRaceFollowCamera(1, true);
  }

  focusMenu(): void {
    if (this.previewMode === "common-room-lab" && this.commonRoomEnvironment && this.commonArchiveEnvironment) {
      if (this.commonEnvironmentSelection === "room2-shadow") {
        this.commonRoomEnvironment.applyToCamera(this.camera);
      } else {
        this.commonArchiveEnvironment.applyToCamera(this.camera);
      }
      return;
    }
    if (this.previewMode === "ballz-2011-level1") {
      this.cameraYaw = Math.atan2(76, 104);
      this.cameraPitch = 0.61;
      this.cameraDistance = 158;
      this.camera.fov = 48;
      this.camera.far = 500;
      this.camera.updateProjectionMatrix();
      this.updateVisitCamera(1, true);
      return;
    }
    if (this.previewMode === "ballz-slide1") {
      this.cameraYaw = Math.atan2(32, 56);
      this.cameraPitch = Math.asin(32 / Math.sqrt(32 * 32 + 32 * 32 + 56 * 56));
      this.cameraDistance = Math.sqrt(32 * 32 + 32 * 32 + 56 * 56);
      this.camera.fov = 48;
      this.camera.far = 500;
      this.camera.updateProjectionMatrix();
      this.updateVisitCamera(1, true);
      return;
    }
    if (this.previewMode === "ballz-track-gallery" && this.ballzTrackGalleryEnvironment) {
      this.applyBallzTrackGalleryCamera(this.ballzTrackGalleryCameraProfile);
      return;
    }
    if (this.previewMode === "xml-myworld-copy" && this.xmlSceneEnvironment) {
      this.xmlSceneEnvironment.applyToCamera(this.camera);
      return;
    }
    if (this.previewMode === "ballz-xml-worlds" && this.ballzXmlWorldsEnvironment) {
      this.ballzXmlWorldsEnvironment.applyToCamera(this.camera);
      return;
    }
    if (this.previewMode === "xml-serializer-artifacts" && this.stockroomXmlArtifactEnvironment) {
      this.stockroomXmlArtifactEnvironment.applyToCamera(this.camera);
      return;
    }
    if (this.previewMode === "vehicle-pack-gallery" && this.vehiclePackEnvironment) {
      this.vehiclePackEnvironment.applyToCamera(this.camera);
      return;
    }
    if (this.previewMode === "object-library-catalog" && this.objectLibraryCatalogEnvironment) {
      this.objectLibraryCatalogEnvironment.applyToCamera(this.camera);
      return;
    }
    if (this.previewMode === "dominus-asset-gallery" && this.dominusAssetGalleryEnvironment) {
      this.dominusAssetGalleryEnvironment.applyToCamera(this.camera);
      return;
    }
    if (this.previewMode === "dominus-port-evidence" && this.dominusPortEvidenceEnvironment) {
      this.dominusPortEvidenceEnvironment.applyToCamera(this.camera);
      return;
    }
    if (this.previewMode === "threejs-playground" && this.threejsPlaygroundEnvironment) {
      this.threejsPlaygroundEnvironment.applyToCamera(this.camera);
      return;
    }
    if (this.previewMode === "ballz-blender-level1" && this.ballzBlenderLevel1Environment) {
      this.ballzBlenderLevel1Environment.applyToCamera(this.camera);
      return;
    }
    if (this.previewMode === "maison-explorer" && this.maisonExplorerEnvironment) {
      this.maisonExplorerEnvironment.applyToCamera(this.camera);
      return;
    }
    if (this.previewMode === "arena-archive" && this.arenaArchiveEnvironment) {
      this.arenaArchiveEnvironment.applyToCamera(this.camera);
      return;
    }
    if (this.previewMode === "suzanne2-archive") {
      this.cameraYaw = 0;
      this.cameraPitch = 0.92;
      this.cameraDistance = 57;
      this.camera.fov = 58;
      this.camera.far = 260;
      this.camera.updateProjectionMatrix();
      this.updateVisitCamera(1, true);
      return;
    }
    if (this.previewMode === "map-editor") {
      const largestDimension = Math.max(this.mapEditorDraft.width, this.mapEditorDraft.height);
      this.cameraYaw = -0.28;
      this.cameraPitch = 0.74;
      this.cameraDistance = MathUtils.clamp(largestDimension * 1.72, 22, 132);
      this.camera.fov = 55;
      this.camera.far = Math.max(260, largestDimension * 5);
      this.camera.updateProjectionMatrix();
      this.updateVisitCamera(1, true);
      return;
    }
    if (this.previewMode === "notes-manager-lab") {
      this.cameraYaw = 0.38;
      this.cameraPitch = 0.28;
      this.cameraDistance = 30;
      this.updateVisitCamera(1, true);
      return;
    }
    if (this.previewMode === "cubx-actor-lineage") {
      this.cameraYaw = 0.84;
      this.cameraPitch = 0.55;
      this.cameraDistance = 205;
      this.camera.fov = 42;
      this.camera.far = 1000;
      this.camera.updateProjectionMatrix();
      this.updateVisitCamera(1, true);
      return;
    }
    if (this.previewMode === "milky-way-lab") {
      this.cameraYaw = 0.22;
      this.cameraPitch = 0.32;
      this.cameraDistance = 66;
      this.updateVisitCamera(1, true);
      return;
    }
    if (
      (this.previewMode === "skybox-selector" && this.skyboxSelectorEnvironment) ||
      (this.previewMode === "car-selector" && this.carSelectorEnvironment)
    ) {
      return;
    }
    if (this.previewMode === "race-preview" && this.race.classicStyle) {
      const style = getClassicLevelStyle(this.race.classicStyle);
      this.cameraYaw = style.camera.previewYaw;
      this.cameraPitch = style.camera.previewPitch;
      this.cameraDistance = style.camera.previewDistance;
      this.updateVisitCamera(1, true);
      return;
    }
    if (this.previewMode === "race-preview" && this.race.id === "ballz18-level01") {
      this.cameraYaw = -0.72;
      this.cameraPitch = 0.66;
      this.cameraDistance = 100;
      this.camera.fov = 54;
      this.camera.far = 320;
      this.camera.updateProjectionMatrix();
      this.updateVisitCamera(1, true);
      return;
    }
    this.cameraYaw = this.previewMode === "race-preview" || this.previewMode === "menu" ? 0 : -0.28;
    this.cameraPitch =
      this.previewMode === "scene-lab"
        ? 0.4
        : this.previewMode === "world-api-lab"
          ? 0.46
        : this.previewMode === "nature-lab"
          ? this.natureLabStudy === "flock-planet" || this.natureLabStudy === "orbital-observatory" ? 0.34 : 0.48
        : this.previewMode === "math-lab"
          ? 0.46
          : this.previewMode === "race-preview"
            ? 0.72
            : 0.58;
    this.cameraDistance =
      this.previewMode === "race-preview"
        ? this.getRacePreviewDistance()
        : this.previewMode === "menu" || this.previewMode === "cubx-lab"
          ? 18
          : this.previewMode === "world-api-lab"
            ? 24
          : this.previewMode === "nature-lab"
            ? this.natureLabStudy === "flock-planet" || this.natureLabStudy === "orbital-observatory" ? 15.5 : 20.5
          : this.previewMode === "asset-catalog"
            ? 24
            : 26;
    this.updateVisitCamera(1, true);
  }

  getSnapshot(): RaceSnapshot {
    const objective = this.getObjectiveStatus();
    return {
      raceId: this.race.id,
      raceName: this.race.name,
      elapsedMs: this.elapsedMs,
      ringsCollected: this.ringsCollected,
      ringsTotal: this.ringMeshes.length,
      hasReachedHalfway: this.hasReachedHalfway,
      playerPosition: this.playerGroup.position.clone(),
      archiveChampionMs: this.race.champion.timeMs,
      targetMs: this.race.targetMs,
      zombiesRemaining: this.npcs.filter((npc) => npc.alive && npc.kind === "zombie").length,
      zombiesTotal: this.zombiesTotal,
      lapsCompleted: this.lapsCompleted,
      lapsTotal: this.race.laps?.count ?? 1,
      nextObjective: objective.label,
      objectiveDistance: objective.distance,
      rival: this.ballz18AiRival
        ? {
            label: this.ballz18AiRival.label,
            position: this.ballz18AiRival.group.position.clone(),
            waypoint: this.ballz18AiRival.waypointIndex + 1,
            waypointsTotal: this.ballz18AiRival.waypoints.length,
            circuitsCompleted: this.ballz18AiRival.circuitsCompleted
          }
        : null
    };
  }

  /**
   * Deterministic stepping hook used by the archive regression client. The
   * normal RAF loop stays active for humans; QA can additionally advance the
   * simulation in fixed 60 Hz slices instead of depending on wall-clock jitter.
   */
  advanceTime(milliseconds: number): void {
    const clampedMilliseconds = MathUtils.clamp(milliseconds, 0, 10_000);
    const stepSeconds = 1 / 60;
    const steps = Math.max(1, Math.round(clampedMilliseconds / (stepSeconds * 1000)));
    for (let step = 0; step < steps; step += 1) {
      this.update(stepSeconds);
    }
    this.renderFrame();
  }

  private getObjectiveStatus(): { label: string; distance: number | null } {
    if (this.race.npcs) {
      const zombies = this.npcs.filter((npc) => npc.alive && npc.kind === "zombie");
      if (zombies.length === 0) {
        return { label: "Arena clear", distance: null };
      }
      const distance = Math.min(
        ...zombies.map((npc) => Math.hypot(npc.group.position.x - this.playerGroup.position.x, npc.group.position.z - this.playerGroup.position.z))
      );
      return { label: "Squash nearest zombie", distance };
    }

    const remainingRings = this.ringMeshes.filter((ring) => ring.visible);
    if (remainingRings.length > 0) {
      const distance = Math.min(
        ...remainingRings.map((ring) => Math.hypot(ring.position.x - this.playerGroup.position.x, ring.position.z - this.playerGroup.position.z))
      );
      return { label: this.race.laps ? "Bonus checkpoint nearby" : "Collect nearest ring", distance };
    }

    const gateTarget = this.getGateTarget(this.hasReachedHalfway ? "finish" : "halfway");
    return {
      label: this.hasReachedHalfway ? "Return through finish" : "Cross halfway gate",
      distance: Math.hypot(this.playerGroup.position.x - gateTarget.x, this.playerGroup.position.z - gateTarget.z)
    };
  }

  getDebugSnapshot(): RaceDebugSnapshot {
    const flightForward = this.flightRig
      ? new Vector3(0, 0, -1).applyQuaternion(this.flightRig.group.quaternion)
      : null;
    const playerVelocity = this.vehicleRig
      ? this.readBodyVelocity(this.vehicleRig.chassisBody)
      : this.readBodyVelocity(this.playerBody);
    const flightThrust = (Number(this.input.isDown("KeyW")) - Number(this.input.isDown("KeyS"))) as -1 | 0 | 1;
    const flightRoll = (Number(this.input.isDown("ArrowLeft")) - Number(this.input.isDown("ArrowRight"))) as -1 | 0 | 1;
    const flightPitch = (Number(this.input.isDown("ArrowUp")) - Number(this.input.isDown("ArrowDown"))) as -1 | 0 | 1;
    return {
      ...this.getSnapshot(),
      raceActive: this.raceActive,
      raceFinished: this.raceFinished,
      racePaused: this.racePaused,
      countdownRemaining: this.raceCountdownRemaining,
      countdownAudio: {
        source: this.race.id === "ballz18-level01" ? "BallZ18/Assets/Audio" : null,
        cue: this.ballz18CountdownCue,
        readyPlays: this.ballz18CountdownReadyPlays,
        goPlays: this.ballz18CountdownGoPlays
      },
      loadState: this.getRaceLoadState(),
      remainingRings: this.ringMeshes
        .filter((ring) => ring.visible)
        .map((ring) => ({ x: ring.position.x, y: ring.position.y, z: ring.position.z })),
      activeZombies: this.npcs
        .filter((npc) => npc.alive && npc.kind === "zombie")
        .map((npc) => ({ x: npc.group.position.x, y: npc.group.position.y, z: npc.group.position.z })),
      playerVelocity: {
        x: playerVelocity.x,
        y: playerVelocity.y,
        z: playerVelocity.z
      },
      inputAxis: this.input.getMoveAxis(),
      controllerVector: {
        x: this.controllerVector.x,
        y: this.controllerVector.y,
        magnitude: this.controllerVector.length()
      },
      shellWireRotation: {
        x: this.shellWire.rotation.x,
        y: this.shellWire.rotation.y,
        z: this.shellWire.rotation.z
      },
      arrowHeading: this.arrowHeading,
      cameraYaw: this.cameraYaw,
      cameraPitch: this.cameraPitch,
      cameraDistance: this.raceCameraDistance,
      cameraCollision: { ...this.cameraCollision },
      canJump: this.canJump,
      ballPreset: this.ballPreset,
      ghost: {
        hasBest: Boolean(this.ghostBest),
        bestTimeMs: this.ghostBest?.timeMs ?? null,
        recordingSamples: Math.floor(this.ghostRecording.length / 4),
        playbackVisible: Boolean(this.ghostShell?.visible),
        lastLapVisible: Boolean(this.ghostLastLapLine?.visible)
      },
      flight:
        this.flightRig && flightForward
          ? {
              speed: this.flightRig.speed,
              thrust: flightThrust,
              roll: flightRoll,
              pitch: flightPitch,
              airbrake: this.input.isDown("Space") && this.input.isDown("ArrowDown"),
              orientation: {
                x: this.flightRig.group.quaternion.x,
                y: this.flightRig.group.quaternion.y,
                z: this.flightRig.group.quaternion.z,
                w: this.flightRig.group.quaternion.w
              },
              forward: { x: flightForward.x, y: flightForward.y, z: flightForward.z },
              controls: "Left/Right roll; Up/Down pitch; W/S forward/reverse thrust; Space strengthens pitch-down; R resets orientation.",
              objective: this.getObjectiveStatus().label
          }
          : null,
      forceZone: this.activeForceZone
        ? { name: this.activeForceZone.name, kind: this.activeForceZone.kind }
        : null,
      forceZonesTotal: this.race.forceZones?.length ?? 0,
      suzanne: this.suzanneAsciiEnvironment?.getState() ?? null,
      playerRadius: this.playerRadius
    };
  }

  /**
   * Deterministic QA path: satisfy the live objective through the same pickup,
   * gate, NPC, finish, and scoreboard callbacks used by real gameplay.
   */
  debugCompleteCurrentRace(): RaceSnapshot {
    if (!this.raceActive || this.raceFinished || !this.getRaceLoadState().ready) {
      return this.getSnapshot();
    }

    if (this.race.npcs) {
      for (const npc of this.npcs) {
        if (npc.alive && npc.kind === "zombie") {
          this.squashNpc(npc);
        }
      }
      this.checkLapProgress();
      return this.getSnapshot();
    }

    for (const ring of this.ringMeshes) {
      if (!ring.visible) {
        continue;
      }
      this.playerGroup.position.copy(ring.position);
      this.writeBodyPosition(this.playerBody, ring.position);
      this.collectRings();
    }

    // Multi-lap studies (currently Suzanne) must traverse their live
    // halfway/finish callbacks once per configured lap. The previous QA hook
    // stopped after lap one, leaving the deterministic race matrix stranded in
    // gameplay even though the real completion rule requires all laps.
    const lapPasses = this.race.laps?.count ?? 1;
    for (let pass = 0; pass < lapPasses && this.raceActive && !this.raceFinished; pass += 1) {
      const halfwayTarget = this.getGateTarget("halfway");
      this.playerGroup.position.set(halfwayTarget.x, this.raceStart.y, halfwayTarget.z);
      this.writeBodyPosition(this.playerBody, this.playerGroup.position);
      this.checkLapProgress();
      const finishTarget = this.getGateTarget("finish");
      this.playerGroup.position.set(finishTarget.x, this.raceStart.y, finishTarget.z);
      this.writeBodyPosition(this.playerBody, this.playerGroup.position);
      this.checkLapProgress();
    }
    return this.getSnapshot();
  }

  /** Deterministic camera setup for browser QA and archive comparisons. */
  debugSetRaceCamera(yaw: number, pitch: number, distance: number): RaceDebugSnapshot {
    this.cameraYaw = yaw;
    this.cameraPitch = MathUtils.clamp(pitch, 0.12, 1.42);
    this.raceCameraDistance = MathUtils.clamp(distance, 3, 40);
    if (this.raceActive && !this.flightRig) {
      this.updateRaceFollowCamera(1 / 60, true);
    }
    return this.getDebugSnapshot();
  }

  /** Deterministic placement for browser QA and agent-authored level inspection. */
  debugSetPlayerState(position: [number, number, number], velocity: [number, number, number] = [0, 0, 0]): RaceDebugSnapshot {
    setBodyTransform(this.playerBody, new Vector3(...position));
    this.physics.writeLinearVelocity(this.playerBody, new Vector3(...velocity));
    this.playerGroup.position.set(...position);
    this.previousPlayerPosition.set(...position);
    this.activeForceZone = this.findPlayerForceZone();
    if (this.raceActive && !this.flightRig) this.updateRaceFollowCamera(1 / 60, true);
    return this.getDebugSnapshot();
  }

  private get raceStart(): Vector3 {
    return new Vector3(...this.race.start);
  }

  private readBodyPosition(body: PhysicsBody): Vector3 {
    return this.physics.readPosition(body, new Vector3());
  }

  private readBodyRotation(body: PhysicsBody): Quaternion {
    return this.physics.readRotation(body, new Quaternion());
  }

  private readBodyVelocity(body: PhysicsBody): Vector3 {
    return this.physics.readLinearVelocity(body, new Vector3());
  }

  private readBodyAngularVelocity(body: PhysicsBody): Vector3 {
    return this.physics.readAngularVelocity(body, new Vector3());
  }

  private writeBodyPosition(body: PhysicsBody, position: Vector3, wakeUp = true): void {
    this.physics.writeTransform(body, position, this.readBodyRotation(body), wakeUp);
  }

  private attachEvents(): void {
    window.addEventListener("resize", () => this.onResize());
    const markActivity = () => {
      this.lastActivityMs = performance.now();
    };
    window.addEventListener("pointerdown", markActivity);
    window.addEventListener("pointermove", markActivity);
    window.addEventListener("keydown", markActivity);
    window.addEventListener("wheel", markActivity);
    window.addEventListener("keydown", (event) => {
      if (!this.menuMode || this.previewMode !== "world-api-lab" || !this.agentTransformEntityId) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      const mode = event.code === "KeyW" ? "translate" : event.code === "KeyE" ? "rotate" : event.code === "KeyR" ? "scale" : null;
      if (!mode) return;
      event.preventDefault();
      this.setAgentWorldTransformMode(mode);
      this.options.onAgentWorldStateChanged?.();
    });
    this.renderer.domElement.addEventListener("pointerdown", (event) => {
      this.pointer.active = true;
      this.pointer.lastX = event.clientX;
      this.pointer.lastY = event.clientY;
      this.pointer.downX = event.clientX;
      this.pointer.downY = event.clientY;
      this.renderer.domElement.style.cursor = "grabbing";
      this.renderer.domElement.setPointerCapture(event.pointerId);
    });
    this.renderer.domElement.addEventListener("pointermove", (event) => {
      if (this.menuMode && this.previewMode === "threejs-playground" && this.threejsPlaygroundEnvironment) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.threejsPlaygroundEnvironment.setPointerNdc(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
      }
      if (!this.pointer.active) {
        return;
      }
      const dx = event.clientX - this.pointer.lastX;
      const dy = event.clientY - this.pointer.lastY;
      this.pointer.lastX = event.clientX;
      this.pointer.lastY = event.clientY;
      if (this.agentTransformControls.dragging) {
        return;
      }
      if (this.menuMode && this.previewMode === "common-room-lab") {
        this.orbitCommonRoomByRadians(-dx * 0.006);
        return;
      }
      if (this.menuMode && this.previewMode === "xml-myworld-copy" && this.xmlSceneEnvironment) {
        this.xmlSceneEnvironment.orbitByRadians(-dx * 0.006, this.camera);
        return;
      }
      if (this.menuMode && this.previewMode === "ballz-xml-worlds" && this.ballzXmlWorldsEnvironment) {
        this.ballzXmlWorldsEnvironment.orbitByRadians(-dx * 0.006, this.camera);
        return;
      }
      if (this.menuMode && this.previewMode === "xml-serializer-artifacts" && this.stockroomXmlArtifactEnvironment) {
        this.stockroomXmlArtifactEnvironment.orbitByRadians(-dx * 0.006, this.camera);
        return;
      }
      if (this.menuMode && this.previewMode === "vehicle-pack-gallery" && this.vehiclePackEnvironment) {
        this.vehiclePackEnvironment.orbitByRadians(-dx * 0.006, this.camera);
        return;
      }
      if (this.menuMode && this.previewMode === "object-library-catalog" && this.objectLibraryCatalogEnvironment) {
        this.objectLibraryCatalogEnvironment.orbitByRadians(-dx * 0.006, this.camera);
        return;
      }
      if (this.menuMode && this.previewMode === "dominus-asset-gallery" && this.dominusAssetGalleryEnvironment) {
        this.dominusAssetGalleryEnvironment.orbitByRadians(-dx * 0.006, this.camera);
        return;
      }
      if (this.menuMode && this.previewMode === "dominus-port-evidence" && this.dominusPortEvidenceEnvironment) {
        this.dominusPortEvidenceEnvironment.orbitByRadians(-dx * 0.006, this.camera);
        return;
      }
      if (this.menuMode && this.previewMode === "threejs-playground" && this.threejsPlaygroundEnvironment) {
        this.threejsPlaygroundEnvironment.orbitByRadians(-dx * 0.006, this.camera);
        return;
      }
      if (this.menuMode && this.previewMode === "ballz-blender-level1" && this.ballzBlenderLevel1Environment) {
        this.ballzBlenderLevel1Environment.orbitByRadians(-dx * 0.006, this.camera);
        return;
      }
      if (this.menuMode && this.previewMode === "maison-explorer" && this.maisonExplorerEnvironment) {
        this.maisonExplorerEnvironment.orbitByRadians(-dx * 0.006, this.camera);
        return;
      }
      if (this.menuMode && this.previewMode === "arena-archive" && this.arenaArchiveEnvironment) {
        this.arenaArchiveEnvironment.orbitByRadians(-dx * 0.006, this.camera);
        return;
      }
      if (this.menuMode && this.previewMode === "car-selector" && this.carSelectorEnvironment) {
        this.carSelectorEnvironment.applyArchiveCameraControl(
          { walk: 0, strafe: 0, raise: 0, mouseDeltaX: dx, mouseDeltaY: dy },
          16
        );
        return;
      }
      if (this.menuMode && this.previewMode === "skybox-selector") {
        return;
      }
      this.cameraYaw -= dx * 0.006;
      this.cameraPitch = MathUtils.clamp(this.cameraPitch + dy * 0.004, this.menuMode ? 0.28 : 0.38, this.menuMode ? 1.22 : 1.08);
    });
    this.renderer.domElement.addEventListener("pointerup", (event) => {
      const wasClick = Math.hypot(event.clientX - this.pointer.downX, event.clientY - this.pointer.downY) < 7;
      this.pointer.active = false;
      if (wasClick && this.menuMode && this.previewMode === "cubx-lab") {
        this.handleCubXPick(event.clientX, event.clientY);
      }
      if (wasClick && this.menuMode && this.previewMode === "notes-manager-lab") {
        this.handleNotesManagerPick(event.clientX, event.clientY);
      }
      if (wasClick && this.menuMode && (this.previewMode === "skybox-selector" || this.previewMode === "car-selector")) {
        this.handleArchiveSelectorPick(event.clientX, event.clientY);
      }
      if (wasClick && this.menuMode && this.previewMode === "nature-lab" && this.performNatureLabAction()) {
        this.options.onNatureStateChanged?.();
      }
      if (wasClick && this.menuMode && this.previewMode === "world-api-lab") {
        this.handleAgentWorldPick(event.clientX, event.clientY);
      }
      if (wasClick && this.menuMode && this.previewMode === "dominus-port-evidence") {
        this.handleDominusPortEvidencePick(event.clientX, event.clientY);
      }
      if (wasClick && this.menuMode && this.previewMode === "threejs-playground" && this.threejsPlaygroundEnvironment) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointerNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        this.threejsPlaygroundEnvironment.raycastTerrain(this.pointerNdc, this.camera);
        this.options.onArchiveSelectorStateChanged?.();
      }
      this.renderer.domElement.style.cursor = this.getPreviewCursor();
      if (this.renderer.domElement.hasPointerCapture(event.pointerId)) {
        this.renderer.domElement.releasePointerCapture(event.pointerId);
      }
    });
    this.renderer.domElement.addEventListener("pointercancel", () => {
      this.pointer.active = false;
      this.renderer.domElement.style.cursor = this.getPreviewCursor();
    });
    this.renderer.domElement.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        if (!this.menuMode) {
          this.raceCameraDistance = MathUtils.clamp(this.raceCameraDistance + event.deltaY * 0.012, 9, 24);
          return;
        }
        if (this.previewMode === "xml-myworld-copy" || this.previewMode === "ballz-xml-worlds" || this.previewMode === "xml-serializer-artifacts" || this.previewMode === "vehicle-pack-gallery") return;
        if (this.previewMode === "object-library-catalog" && this.objectLibraryCatalogEnvironment) {
          this.objectLibraryCatalogEnvironment.zoomBy(event.deltaY > 0 ? 1.08 : 0.92, this.camera);
          this.options.onArchiveSelectorStateChanged?.();
          return;
        }
        if (this.previewMode === "dominus-asset-gallery" && this.dominusAssetGalleryEnvironment) {
          this.dominusAssetGalleryEnvironment.zoomBy(event.deltaY > 0 ? 1.08 : 0.92, this.camera);
          this.options.onArchiveSelectorStateChanged?.();
          return;
        }
        if (this.previewMode === "dominus-port-evidence" && this.dominusPortEvidenceEnvironment) {
          this.dominusPortEvidenceEnvironment.zoomBy(event.deltaY > 0 ? 1.08 : 0.92, this.camera);
          this.options.onArchiveSelectorStateChanged?.();
          return;
        }
        if (this.previewMode === "threejs-playground" && this.threejsPlaygroundEnvironment) {
          this.threejsPlaygroundEnvironment.zoomBy(event.deltaY > 0 ? 1.08 : 0.92, this.camera);
          this.options.onArchiveSelectorStateChanged?.();
          return;
        }
        if (this.previewMode === "ballz-blender-level1" && this.ballzBlenderLevel1Environment) {
          this.ballzBlenderLevel1Environment.zoomBy(event.deltaY > 0 ? 1.08 : 0.92, this.camera);
          this.options.onArchiveSelectorStateChanged?.();
          return;
        }
        if (this.previewMode === "maison-explorer" && this.maisonExplorerEnvironment) {
          this.maisonExplorerEnvironment.zoomBy(event.deltaY > 0 ? 1.08 : 0.92, this.camera);
          this.options.onArchiveSelectorStateChanged?.();
          return;
        }
        if (this.previewMode === "arena-archive" && this.arenaArchiveEnvironment) {
          this.arenaArchiveEnvironment.zoomBy(event.deltaY > 0 ? 1.08 : 0.92, this.camera);
          this.options.onArchiveSelectorStateChanged?.();
          return;
        }
        const maximumDistance = this.previewMode === "cubx-actor-lineage" ? 280 : this.previewMode === "ballz-2011-level1" ? 210 : this.previewMode === "ballz-slide1" ? 150 : this.previewMode === "suzanne2-archive" ? 95 : this.previewMode === "milky-way-lab" ? 90 : 46;
        this.cameraDistance = MathUtils.clamp(this.cameraDistance + event.deltaY * 0.018, 14, maximumDistance);
      },
      { passive: false }
    );
    this.renderer.domElement.style.cursor = this.getPreviewCursor();
  }

  private getPreviewCursor(): string {
    if (this.previewMode === "cubx-lab" || this.previewMode === "skybox-selector" || this.previewMode === "notes-manager-lab" || this.previewMode === "nature-lab" || this.previewMode === "world-api-lab") {
      return "pointer";
    }
    return this.previewMode === "common-room-lab" || this.previewMode === "threejs-playground" || this.previewMode === "ballz-blender-level1" || this.previewMode === "maison-explorer" || this.previewMode === "arena-archive" || this.previewMode === "xml-myworld-copy" || this.previewMode === "ballz-xml-worlds" || this.previewMode === "xml-serializer-artifacts" || this.previewMode === "vehicle-pack-gallery" || this.previewMode === "object-library-catalog" || this.previewMode === "dominus-asset-gallery" || this.previewMode === "dominus-port-evidence" ? "ew-resize" : "grab";
  }

  private handleDominusPortEvidencePick(clientX: number, clientY: number): void {
    const environment = this.dominusPortEvidenceEnvironment;
    if (!environment) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    for (const hit of this.raycaster.intersectObject(environment.group, true)) {
      if (environment.selectFromObject(hit.object as { parent: unknown; userData: Record<string, unknown> }, this.camera)) {
        this.options.onArchiveSelectorStateChanged?.();
        return;
      }
    }
  }

  private handleArchiveSelectorPick(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    if (this.previewMode === "skybox-selector" && this.skyboxSelectorEnvironment) {
      if (this.skyboxSelectorEnvironment.pickFromNdc(x, y)) {
        this.options.onArchiveSelectorStateChanged?.();
      }
      return;
    }
    if (this.previewMode === "car-selector" && this.carSelectorEnvironment) {
      this.carSelectorEnvironment.inspectFromNdc(x, y);
      this.options.onArchiveSelectorStateChanged?.();
    }
  }

  private handleCubXPick(clientX: number, clientY: number): void {
    const menu = this.cubxMenu;
    if (!menu) {
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const visibleSatellites = menu.satelliteButtons.filter((button) => button.visible);
    const targets = menu.phase === "open"
      ? [...menu.panels, menu.backButton, ...visibleSatellites]
      : menu.phase === "idle"
        ? [...menu.cubelets, ...visibleSatellites]
        : visibleSatellites;
    const hit = this.raycaster.intersectObjects(targets, false)[0]?.object;
    if (!hit) {
      return;
    }
    const satelliteId = hit.userData.cubxSatelliteId as CubXSatelliteId | undefined;
    if (satelliteId) {
      this.activateCubXSatellite(satelliteId);
      return;
    }
    const cubeIndex = hit.userData.cubxCubeIndex;
    if (typeof cubeIndex === "number") {
      this.selectCubXCube(cubeIndex);
      return;
    }
    const actionIndex = hit.userData.cubxActionIndex;
    if (typeof actionIndex === "number") {
      this.activateCubXAction(actionIndex);
      return;
    }
    if (hit.userData.cubxBack === true) {
      this.closeCubXMenu();
    }
  }

  private handleNotesManagerPick(clientX: number, clientY: number): void {
    const environment = this.notesManagerEnvironment;
    if (!environment) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = this.raycaster.intersectObject(environment.addNoteButton, false)[0]?.object ?? null;
    if (environment.isAddButton(hit)) this.addArchiveNote();
  }

  private handleAgentWorldPick(clientX: number, clientY: number): void {
    const world = this.agentWorld;
    if (!world) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    for (const hit of this.raycaster.intersectObject(world.group, true)) {
      const entityId = world.findEntityId(hit.object);
      if (entityId) {
        this.selectAgentWorldEntities([entityId]);
        if (world.findInteractiveEntityId(hit.object)) this.interactAgentWorld(entityId);
        return;
      }
    }
    this.selectAgentWorldEntities([]);
  }

  private onResize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
  }

  private createLights(): void {
    this.baseAmbientLight = new AmbientLight("#6f8fb8", 0.18);
    this.scene.add(this.baseAmbientLight);
    const hemi = new HemisphereLight("#dff4ff", "#0b1018", 0.92);
    this.scene.add(hemi);
    const key = new DirectionalLight("#ffffff", 2.2);
    key.position.set(-12, 24, 16);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 80;
    key.shadow.camera.left = -36;
    key.shadow.camera.right = 36;
    key.shadow.camera.top = 36;
    key.shadow.camera.bottom = -36;
    this.scene.add(key);
    const rim = new DirectionalLight("#78f0d0", 1.35);
    rim.position.set(18, 10, -22);
    this.scene.add(rim);
    const ballGlow = new PointLight("#78f0d0", 2.8, 18, 1.8);
    ballGlow.position.set(0, 3.4, 10);
    this.playerGroup.add(ballGlow);
    this.atmosphereRig = { key, rim, hemi };

    // legacy Sky.cpp sun billboard, using the recovered Media/Sky/sun.jpg
    const sunMaterial = new SpriteMaterial({
      map: this.loadTexture("/assets/textures/sun.jpg", 1, 1),
      blending: AdditiveBlending,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    this.sunSprite = new Sprite(sunMaterial);
    this.sunSprite.scale.setScalar(26);
    this.sunSprite.visible = false;
    this.scene.add(this.sunSprite);
  }

  private rebuildRaceWorld(): void {
    this.configurePlayerScale();
    for (const body of this.staticBodies) {
      this.physics.removeBody(body);
    }
    this.staticBodies.length = 0;
    this.teardownSuzanneAsciiArena();
    this.ringMeshes.length = 0;
    this.forceZoneVisuals.length = 0;
    this.movingParts.length = 0;
    this.legacyParts.length = 0;
    this.airplaneFlyer = null;
    this.clearBullets();
    if (this.flightRig) {
      this.physics.setBodyMode(this.playerBody, "dynamic", true);
    }
    this.flightRig = null;
    this.clearGhostVisuals();
    this.teardownVehicle();
    this.teardownBallz18AiRival();
    for (const npc of this.npcs) {
      if (npc.alive) {
        this.physics.removeBody(npc.body);
      }
    }
    this.npcs.length = 0;
    this.zombiesTotal = 0;
    this.worldGroup.clear();
    this.startGate.clear();
    this.halfGate.clear();
    this.finishGate.clear();
    this.activeForceZone = null;
    this.forceEffectAccumulator = 0;

    const skybox = this.loadSkybox(this.race.skybox);
    this.scene.background = skybox;
    this.scene.environment = skybox;
    this.applySkyboxPresentation(this.race.skybox);
    this.scene.fog = new Fog(this.race.palette.fog, 24, 105);

    // StockRoom levels already contain their exact bAddFloor surface. The old
    // generic 90×90 safety plane hid the sky around those authored arenas and
    // made every screenshot comparison look like a new ground world.
    if (!this.race.classicStyle && !this.race.suzanneAscii) {
      const floor = new Mesh(
        new PlaneGeometry(90, 90, 1, 1),
        new MeshStandardMaterial({ color: new Color(this.race.palette.floor), roughness: 0.96, metalness: 0.04 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = this.race.legacy ? (this.race.bounds.minY ?? this.race.legacy.scale * -0.95) : -0.015;
      floor.receiveShadow = true;
      this.worldGroup.add(floor);
    }

    for (const box of [...this.race.track, ...this.race.walls, ...this.race.scenery]) {
      this.addBox(box);
    }
    this.buildForceZoneVisuals();

    if (this.race.suzanneAscii) {
      this.buildSuzanneAsciiArena();
    } else if (this.race.legacy) {
      this.buildLegacyLevel(this.race.legacy);
    }

    if (this.race.aiBall && this.ensureLegacyData(["ballz18level01"])) {
      this.buildBallz18AiRival();
      const warmKey = new DirectionalLight(new Color("#fff0d3"), 1);
      warmKey.position.set(9.4, 19.5, 18.7);
      warmKey.target.position.set(-8, 0, 31);
      this.worldGroup.add(warmKey, warmKey.target);
      const sourcePoint = new PointLight(new Color("#fff0dc"), 2.63, 18.52, 2);
      sourcePoint.position.set(9.06, 0.34, 8.01);
      this.worldGroup.add(sourcePoint);
    }

    if (this.race.atmosphere) {
      this.buildAirplaneFlyer();
    }

    if (this.race.npcs) {
      this.buildNpcs(this.race.npcs);
    }

    if (this.race.vehicle && this.ensureLegacyData(["cars"])) {
      this.buildVehicleTrack();
      this.buildVehicle();
    }

    if (this.race.flight && this.ensureLegacyData(["assets", "tvm"])) {
      this.buildFlight();
    }

    if (this.race.id === "dominus-port" && this.ensureLegacyData(["village"])) {
      this.buildDominusVillage();
    }

    if (this.race.id === "carx-terrain" && this.ensureLegacyData(["terrain"])) {
      this.buildCarXTerrain();
    }

    for (const marker of this.race.markers ?? []) {
      this.addMarker(marker);
    }

    if (this.race.classicStyle) {
      const style = getClassicLevelStyle(this.race.classicStyle);
      if (style.source.humans > 0) {
        this.buildClassicHumanPopulation(style.source.humans);
      }
    }

    if (!this.race.classicStyle && !this.race.suzanneAscii) {
      if (this.race.id === "ballz18-level01") {
        this.buildGate(this.startGate, new Vector3(-1.84, 0, 1.35), new Color("#7f9cf5"), "START", 6);
      } else {
        this.buildGate(this.startGate, new Vector3(0, 0, this.race.finishZ), new Color("#7f9cf5"), "START");
      }
      this.buildRaceGate(this.halfGate, "halfway", new Color("#ffbf69"), "HALF");
      this.buildRaceGate(this.finishGate, "finish", this.accent, "FINISH");
      this.applyGateAccent();
    }

    this.waterMaterial = null;
    if (this.race.id === "skybox-spiral" || this.race.id === "dominus-port") {
      this.buildLegacyWater();
    }
    if (this.hazePass) {
      this.hazePass.enabled = Boolean(this.race.atmosphere);
    }

    for (const spec of this.race.movingParts) {
      const mesh = new Mesh(new BoxGeometry(...spec.size), this.createMovingPartMaterial(spec));
      mesh.position.set(...spec.position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.worldGroup.add(mesh);
      const body = this.physics.addKinematicBox(new Vector3(...spec.position), new Vector3(spec.size[0] / 2, spec.size[1] / 2, spec.size[2] / 2));
      this.staticBodies.push(body);
      this.movingParts.push({
        spec,
        mesh,
        body,
        basePosition: new Vector3(...spec.position),
        previousPosition: new Vector3(...spec.position)
      });
    }

    const ringSpecs = this.race.suzanneAscii
      ? []
      : this.race.id === "carx-terrain"
      ? this.createTerrainRingSpecs()
      : this.race.id === "dominus-port"
      ? DOMINUS_RING_TOUR
      : this.race.vehicle
      ? this.createVehicleRingSpecs()
      : this.race.legacy
        ? this.createLegacyRingSpecs(this.race.legacy)
        : this.race.rings;
    for (const ringSpec of ringSpecs) {
      const ring = this.createRaceRing(ringSpec);
      this.ringMeshes.push(ring);
      this.worldGroup.add(ring);
    }

    if (!this.race.suzanneAscii && !this.race.classicStyle && this.race.id !== "ballz18-level01") {
      const halo = new Mesh(
        new RingGeometry(14, 22, 64),
        new MeshBasicMaterial({ color: new Color(this.race.palette.accent), transparent: true, opacity: 0.08, side: DoubleSide })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.015;
      this.worldGroup.add(halo);
    }
    this.setRaceWorldVisible(!this.menuMode || this.previewMode === "race-preview");
  }

  private configurePlayerScale(): void {
    // ArduinoGUI/BallZScreen.cs creates the ASCII-level player at radius 0.3,
    // and the independently recovered Suzanne scene records the same visual
    // radius. The larger revival ball remains useful in newer concept races,
    // but it cannot fit the source-unit corridors of these authored boards.
    const radius = this.race.ballRadius ?? (this.race.classicStyle || this.race.suzanneAscii ? 0.3 : PLAYER_RADIUS);
    this.playerRadius = radius;
    this.playerGroup.scale.setScalar(radius / PLAYER_RADIUS);

    this.physics.setSphereRadius(this.playerBody, radius);
  }

  /** trigger lazy loads; returns true when all requested datasets are in memory */
  private ensureLegacyData(keys: string[]): boolean {
    let ready = true;
    for (const key of keys) {
      if (legacyDataReady(key)) {
        continue;
      }
      ready = false;
      if (this.failedLegacyLoads.has(key)) {
        continue;
      }
      if (!this.pendingLegacyLoads.has(key)) {
        this.pendingLegacyLoads.add(key);
        void LEGACY_LOADERS[key]()
          .then(() => {
            this.pendingLegacyLoads.delete(key);
            this.failedLegacyLoads.delete(key);
            this.onLegacyDataLoaded(key);
          })
          .catch((error: unknown) => {
            this.pendingLegacyLoads.delete(key);
            const message = error instanceof Error ? error.message : String(error);
            this.failedLegacyLoads.set(key, message);
            console.error("legacy dataset load failed for", key, error);
            this.options.onRaceAssetsChanged?.();
          });
      }
    }
    return ready;
  }

  private getRequiredLegacyKeys(): string[] {
    if (this.race.vehicle) {
      return ["cars"];
    }
    if (this.race.flight) {
      return ["assets", "tvm"];
    }
    if (this.race.id === "dominus-port") {
      return ["village"];
    }
    if (this.race.id === "carx-terrain") {
      return ["cars", "terrain"];
    }
    if (!this.race.legacy) {
      return [];
    }
    return this.race.legacy.level === "suzanne1" ? ["suzanne1", "assets"] : [this.race.legacy.level];
  }

  private onLegacyDataLoaded(key: string): void {
    try {
      if (key === "tvm") {
        this.applyLegacyBallSkin();
        this.legacyRingGeometry = null;
      }
      // rebuild only when it's safe (menu / preview); an active race keeps running
      if (!this.raceActive) {
        this.rebuildRaceWorld();
        this.rebuildArchivePreview();
        if (this.menuMode) {
          // A late archive chunk rebuilds the hidden race world, but it must
          // not replace the sky/lens belonging to Home or the active lab.
          this.applyPreviewSkybox();
        }
      }
      this.options.onRaceAssetsChanged?.();
    } catch (error) {
      console.error("legacy dataset rebuild failed for", key, error);
      this.options.onRaceAssetsChanged?.();
    }
  }

  /** swap the procedural spheres for the real 2011 ball meshes once decoded */
  private applyLegacyBallSkin(): void {
    this.applyBallPresetVisuals();
  }

  /** the original ring.tvm mesh, normalized to the prototype ring size */
  private getLegacyRingGeometry(): BufferGeometry | null {
    if (!tvmCatalog) {
      this.ensureLegacyData(["tvm"]);
      return null;
    }
    if (this.legacyRingGeometry) {
      return this.legacyRingGeometry;
    }
    const asset = (tvmCatalog.assets as Array<{ id: string; positions: number[]; indices: number[] }>).find(
      (candidate) => candidate.id === "ring-tvm"
    );
    if (!asset) {
      return null;
    }
    const targetRadius = 0.7;
    const sourceRadius = 16.73;
    const scale = targetRadius / sourceRadius;
    // ring.tvm was recentered with its base at y=0; drop it back to its own middle
    const centered = asset.positions.map((value, index) => (index % 3 === 1 ? (value - 16.73) * scale : value * scale));
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(centered, 3));
    geometry.setIndex(asset.indices);
    geometry.computeVertexNormals();
    this.legacyRingGeometry = geometry;
    return geometry;
  }

  /** original 2011 BallShell/BallFire meshes scaled to the prototype ball size */
  private createBallGeometry(kind: "shell" | "fire" | "ctrl", targetRadius: number): BufferGeometry | null {
    if (!tvmCatalog) {
      return null;
    }
    const trio = (
      tvmCatalog as unknown as {
        ball?: Record<string, { positions: number[]; indices: number[]; uvs?: number[] | null; radius: number }>;
      }
    ).ball;
    const part = trio?.[kind];
    if (!part || part.positions.length === 0 || !part.radius) {
      return null;
    }
    const scale = targetRadius / part.radius;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(part.positions.map((value) => value * scale), 3));
    geometry.setIndex(part.indices);
    if (part.uvs && part.uvs.length === (part.positions.length / 3) * 2) {
      geometry.setAttribute("uv", new Float32BufferAttribute(part.uvs, 2));
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  private createLegacyRingSpecs(legacy: LegacyLevelRef): RaceRing[] {
    if (legacy.level === "ballz18level01") {
      // The Unity circuit is a lap-timer/AI race and contains no checkpoint
      // collectibles. Keep its invisible half/lap triggers as gates instead.
      return [];
    }
    if (legacy.level === "world1" || legacy.level === "map1" || legacy.level === "slide2008" || legacy.level === "level12011") {
      // no authored ring paths exist for these worlds — sample spread-out
      // terrain vertices so every ring is guaranteed to sit on real geometry
      const dataset =
        legacy.level === "world1" ? world1Level : legacy.level === "map1" ? map1Level : legacy.level === "level12011" ? level1World : slideLevel;
      if (!dataset) {
        return [];
      }
      const cutBelow = legacy.level === "world1" ? -22 : -Infinity;
      const spacing = legacy.level === "world1" ? 12 : 11 / legacy.scale;
      const maxRings = legacy.level === "world1" ? 9 : legacy.level === "slide2008" ? 14 : 10;
      const parts = dataset.objects as Array<{ role: string; bounds: { min: number[]; max: number[] }; positions: number[] }>;
      const terrain = parts.find((part) => part.role === "terrain");
      if (!terrain) {
        return [];
      }
      const offsetX = (terrain.bounds.min[0] + terrain.bounds.max[0]) / 2;
      const offsetZ = (terrain.bounds.min[2] + terrain.bounds.max[2]) / 2;
      const picked: Array<[number, number, number]> = [];
      const positions = terrain.positions;
      for (let i = 0; i < positions.length && picked.length < maxRings; i += 3) {
        const rawX = positions[i] - offsetX;
        const y = positions[i + 1];
        const rawZ = positions[i + 2] - offsetZ;
        const x = legacy.level === "slide2008" ? rawZ : rawX;
        const z = legacy.level === "slide2008" ? -rawX : rawZ;
        if (y < cutBelow) {
          continue;
        }
        if (picked.every((point) => Math.hypot(point[0] - x, point[2] - z) > spacing)) {
          picked.push([x, y, z]);
        }
      }
      return picked.map((point, index) => ({
        position: [point[0] * legacy.scale, point[1] * legacy.scale + legacy.ringHeight, point[2] * legacy.scale] as [number, number, number],
        yaw: (index % 2) * (Math.PI / 2),
        scale: 1.35
      }));
    }

    if (!suzanne1Level) {
      return [];
    }
    return (suzanne1Level.ringPath as number[][]).map((point, index) => ({
      position: [point[0] * legacy.scale, legacy.ringHeight, point[2] * legacy.scale] as [number, number, number],
      yaw: (index % 2) * (Math.PI / 2),
      scale: 1.35
    }));
  }

  private buildSuzanneAsciiArena(): void {
    const profile = this.race.suzanneAscii?.profile ?? "reference2016";
    const environment = new SuzanneAsciiEnvironment({ profile });
    this.suzanneAsciiEnvironment = environment;
    this.worldGroup.add(environment.group);
    this.ringMeshes.push(...environment.ringMeshes);

    type SuzannePhysicsData = {
      sceneDefaults: { floor: { center: number[]; size: number[] } };
      presentationProfiles: Record<string, { chainScaleMultiplier: number }>;
      walls: Array<{ position: number[] }>;
      chains: Array<{ basePosition: number[]; linkPositions: [number[], number[]] }>;
      pistons: Array<{
        position: number[];
        rotationDegrees: number[];
        barScale: number[];
        plateScale: number[];
        linearLimits: [number, number];
      }>;
    };
    const data = SuzanneAsciiEnvironment.data as unknown as SuzannePhysicsData;
    const addStaticBox = (position: number[], size: number[]): PhysicsBody => {
      const body = this.physics.addStaticBox(
        new Vector3(position[0], position[1], position[2]),
        new Vector3(size[0] / 2, size[1] / 2, size[2] / 2)
      );
      this.staticBodies.push(body);
      return body;
    };

    addStaticBox(data.sceneDefaults.floor.center, data.sceneDefaults.floor.size);
    data.walls.forEach((wall) => addStaticBox(wall.position, [1, 1, 1]));

    const chainMultiplier = data.presentationProfiles[profile].chainScaleMultiplier;
    data.chains.forEach((chain) => {
      addStaticBox(
        [chain.basePosition[0], chain.basePosition[1] * chainMultiplier, chain.basePosition[2]],
        [0.25 * chainMultiplier, 0.25 * chainMultiplier, 0.25 * chainMultiplier]
      );
      chain.linkPositions.forEach((position) =>
        addStaticBox(
          [position[0], position[1] * chainMultiplier, position[2]],
          [0.3 * chainMultiplier, 0.25 * chainMultiplier, 0.3 * chainMultiplier]
        )
      );
    });

    data.pistons.forEach((piston) => {
      const rotation = new Quaternion().setFromEuler(
        new Euler(
          MathUtils.degToRad(piston.rotationDegrees[0]),
          MathUtils.degToRad(piston.rotationDegrees[1]),
          MathUtils.degToRad(piston.rotationDegrees[2])
        )
      );
      const bar = addStaticBox(piston.position, piston.barScale);
      this.physics.writeTransform(bar, new Vector3(...(piston.position as [number, number, number])), rotation);

      const localPlate = new Vector3(piston.linearLimits[0], 0, 0).applyQuaternion(rotation);
      const platePosition = new Vector3(...(piston.position as [number, number, number])).add(localPlate);
      const plate = this.physics.addKinematicBox(
        platePosition,
        new Vector3(piston.plateScale[0] / 2, piston.plateScale[1] / 2, piston.plateScale[2] / 2)
      );
      this.physics.writeTransform(plate, platePosition, rotation);
      this.staticBodies.push(plate);
      this.suzannePistonBodies.push(plate);
    });

    environment.ready
      .then(() => {
        if (this.suzanneAsciiEnvironment === environment && this.race.suzanneAscii) {
          this.options.onRaceAssetsChanged?.();
        }
      })
      .catch(() => {
        if (this.suzanneAsciiEnvironment === environment && this.race.suzanneAscii) {
          this.options.onRaceAssetsChanged?.();
        }
      });
  }

  private teardownSuzanneAsciiArena(): void {
    this.suzanneAsciiEnvironment?.dispose();
    this.suzanneAsciiEnvironment = null;
    this.suzannePistonBodies.length = 0;
  }

  private buildLegacyLevel(legacy: LegacyLevelRef): void {
    const needs = legacy.level === "suzanne1" ? ["suzanne1", "assets"] : [legacy.level];
    if (!this.ensureLegacyData(needs)) {
      return; // rebuilds automatically when the dataset chunk arrives
    }
    const { scale } = legacy;
    const fallbackColor = new Color("#9fb2c5");

    type LegacyMeshData = { name: string; positions: number[]; indices: number[]; normals?: number[] | null; color: number[] | null; texture: string | null; uvs?: number[] | null };
    type LegacyObject = { source: string; role: string; meshes: LegacyMeshData[] };

    let legacyObjects: LegacyObject[];
    const worldOffset = new Vector3(0, 0, 0);

    if (legacy.level === "ballz18level01") {
      const sourceMaterials = new Map(
        (ballz18Level01.materials as Array<{ name: string; diffuse: number[]; diffuseIntensity: number }>).map((material) => [
          material.name,
          material.diffuse
        ])
      );
      legacyObjects = (ballz18Level01.objects as Array<{
        source: string;
        role: string;
        meshes: Array<{ name: string; positions: number[]; indices: number[]; normals?: number[] | null; uvs?: number[] | null; material: string }>;
      }>).map((object) => ({
        source: object.source,
        role: object.role,
        meshes: object.meshes.map((mesh) => ({
          name: mesh.name,
          positions: mesh.positions,
          indices: mesh.indices,
          normals: mesh.normals ?? null,
          uvs: mesh.uvs ?? null,
          color: sourceMaterials.get(mesh.material) ?? null,
          texture: null
        }))
      }));
    } else if (legacy.level === "world1" || legacy.level === "map1" || legacy.level === "slide2008" || legacy.level === "level12011") {
      // recenter the shared legacy coordinate space on the terrain's XZ middle
      const dataset =
        legacy.level === "world1" ? world1Level : legacy.level === "map1" ? map1Level : legacy.level === "level12011" ? level1World : slideLevel;
      const parts = dataset.objects as Array<{ role: string; source: string; bounds: { min: number[]; max: number[] }; positions: number[]; indices: number[]; uvs?: number[] | null }>;
      const terrain = parts.find((part) => part.role === "terrain");
      if (terrain && legacy.level !== "slide2008") {
        worldOffset.set((terrain.bounds.min[0] + terrain.bounds.max[0]) / 2, 0, (terrain.bounds.min[2] + terrain.bounds.max[2]) / 2);
      }
      const rotateSlide = (positions: number[], bounds: { min: number[]; max: number[] }): number[] => {
        // the giant slide is authored along X; rotate 90° so the race runs along Z
        const ox = (bounds.min[0] + bounds.max[0]) / 2;
        const oz = (bounds.min[2] + bounds.max[2]) / 2;
        const rotated = new Array<number>(positions.length);
        for (let i = 0; i < positions.length; i += 3) {
          rotated[i] = positions[i + 2] - oz;
          rotated[i + 1] = positions[i + 1];
          rotated[i + 2] = -(positions[i] - ox);
        }
        return rotated;
      };
      legacyObjects = parts.map((part) => ({
        source: part.source,
        role: part.role,
        meshes: [{
          name: part.role,
          positions: legacy.level === "slide2008" ? rotateSlide(part.positions, part.bounds) : part.positions,
          indices: part.indices,
          color: null,
          texture: null,
          uvs: part.uvs ?? null
        }]
      }));
    } else {
      // Gate1.x rides along as static decor at its original archive placement
      const gateExtras = (assetCatalog.assets as Array<{ id: string; source: string; meshes: LegacyMeshData[] }>)
        .filter((asset) => asset.id === "gate1" && asset.meshes.length > 0)
        .map((asset) => ({ source: asset.source, role: "gate-decor", meshes: asset.meshes }));
      legacyObjects = [...(suzanne1Level.objects as unknown as LegacyObject[]), ...gateExtras];
    }

    for (const object of legacyObjects) {
      for (const meshData of object.meshes) {
        // scale positions and recenter on the mesh's own bounding-box middle so
        // rotators/pistons can animate around their own pivot
        const scaled = (meshData.positions as number[]).map((value, index) => {
          const axis = index % 3;
          const shift = axis === 0 ? worldOffset.x : axis === 2 ? worldOffset.z : 0;
          return (value - shift) * scale;
        });
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < scaled.length; i += 3) {
          for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], scaled[i + axis]);
            max[axis] = Math.max(max[axis], scaled[i + axis]);
          }
        }
        const center = new Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
        const local = new Array<number>(scaled.length);
        for (let i = 0; i < scaled.length; i += 3) {
          local[i] = scaled[i] - center.x;
          local[i + 1] = scaled[i + 1] - center.y;
          local[i + 2] = scaled[i + 2] - center.z;
        }

        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(local, 3));
        geometry.setIndex(meshData.indices as number[]);
        const uvs = meshData.uvs as number[] | null | undefined;
        if (uvs && uvs.length === (local.length / 3) * 2) {
          geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
        }
        const normals = meshData.normals as number[] | null | undefined;
        if (normals && normals.length === local.length && normals.some((value) => Math.abs(value) > 0.000001)) {
          geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
        } else {
          geometry.computeVertexNormals();
        }

        // original archive textures, when we have both the UVs and the file
        const texturePath = meshData.texture ? LEGACY_TEXTURES[meshData.texture.toLowerCase()] : undefined;
        const useTexture = Boolean(texturePath && geometry.getAttribute("uv"));

        const rgb = meshData.color as number[] | null;
        const baseColor = rgb ? new Color(rgb[0], rgb[1], rgb[2]) : fallbackColor.clone();
        const isFinish = object.role === "finish-line";
        const material = new MeshStandardMaterial({
          color: useTexture || isFinish ? new Color("#ffffff") : baseColor,
          map: useTexture ? this.loadTexture(texturePath as string, 1, 1) : isFinish ? this.loadTexture("/assets/textures/Damier.jpg", 3, 3) : null,
          emissive: isFinish
            ? this.accent.clone().multiplyScalar(0.18)
            : legacy.level === "ballz18level01"
              ? baseColor.clone().multiplyScalar(0.12)
              : new Color("#000000"),
          roughness: object.role === "level" || object.role === "terrain" ? 0.78 : 0.5,
          metalness: object.role === "level" || object.role === "terrain" ? 0.06 : 0.22,
          side: DoubleSide
        });

        const mesh = new Mesh(geometry, material);
        mesh.name = `Legacy.${object.role}.${meshData.name}`;
        mesh.position.copy(center);
        mesh.castShadow = object.role !== "level" && object.role !== "finish-line";
        mesh.receiveShadow = true;
        this.worldGroup.add(mesh);

        const indices = meshData.indices as number[];
        const staticRoles = ["level", "track-wall", "piston-stand", "piston-trigger", "rotator", "gate-decor", "terrain", "core", "finish", "hole-1", "hole-2"];
        if (staticRoles.includes(object.role)) {
          this.staticBodies.push(this.physics.addStaticTrimesh(center, local, indices));
        } else if (object.role === "elevator") {
          const body = this.physics.addKinematicTrimesh(center, local, indices);
          this.staticBodies.push(body);
          this.legacyParts.push({
            mesh,
            body,
            kind: "piston",
            axis: "y",
            basePosition: center.clone(),
            previousPosition: center.clone(),
            speed: 0.6,
            phase: 0,
            amplitude: 2.6
          });
        } else if (object.role === "rotator-cube") {
          const body = this.physics.addKinematicTrimesh(center, local, indices);
          this.staticBodies.push(body);
          this.legacyParts.push({
            mesh,
            body,
            kind: "rotator",
            axis: "y",
            basePosition: center.clone(),
            previousPosition: center.clone(),
            speed: 1.7,
            phase: 0,
            amplitude: 0
          });
        } else if (object.role === "piston") {
          const body = this.physics.addKinematicTrimesh(center, local, indices);
          this.staticBodies.push(body);
          this.legacyParts.push({
            mesh,
            body,
            kind: "piston",
            axis: "x",
            basePosition: center.clone(),
            previousPosition: center.clone(),
            speed: 1.4,
            phase: 0,
            amplitude: 0.25 * scale
          });
        } else if (object.role === "door-gate") {
          const body = this.physics.addKinematicTrimesh(center, local, indices);
          this.staticBodies.push(body);
          this.legacyParts.push({
            mesh,
            body,
            kind: "piston",
            axis: "y",
            basePosition: center.clone(),
            previousPosition: center.clone(),
            speed: 0.9,
            phase: Math.PI / 2,
            amplitude: 0.45 * scale
          });
        }
        // "finish-line" stays visual-only
      }
    }
  }

  private buildBallz18AiRival(): void {
    const spec = this.race.aiBall;
    if (!spec || !ballz18Level01) return;

    const waypoints = (ballz18Level01.aiWaypoints as Array<{ position: number[] }>).map(
      (waypoint) => new Vector3(waypoint.position[0], waypoint.position[1], waypoint.position[2])
    );
    if (waypoints.length === 0) return;

    const radius = 0.5;
    const group = new Group();
    group.name = "BallZ18.BallAI";
    const ball = new Mesh(
      new SphereGeometry(radius, 32, 22),
      new MeshStandardMaterial({
        color: new Color(0.132, 0.08326125, 0.08326125),
        roughness: 1 - 0.689,
        metalness: 0.208
      })
    );
    ball.castShadow = true;
    ball.receiveShadow = true;
    group.add(ball);

    const start = new Vector3(...spec.start);
    group.position.copy(start);
    this.worldGroup.add(group);
    const body = this.physics.addDynamicSphere(start, radius, 1, {
      linearDamping: 0,
      angularDamping: 0.05,
      allowSleep: false
    });
    this.physics.wakeBody(body);

    this.ballz18AiRival = {
      label: spec.label,
      group,
      body,
      start,
      waypoints,
      waypointIndex: 0,
      circuitsCompleted: 0
    };
  }

  private teardownBallz18AiRival(): void {
    if (!this.ballz18AiRival) return;
    this.physics.removeBody(this.ballz18AiRival.body);
    this.worldGroup.remove(this.ballz18AiRival.group);
    this.ballz18AiRival = null;
  }

  private updateBallz18AiRival(_deltaSeconds: number): void {
    const rival = this.ballz18AiRival;
    const spec = this.race.aiBall;
    if (!rival || !spec || rival.waypoints.length === 0) return;

    const target = rival.waypoints[rival.waypointIndex];
    const bodyPosition = this.readBodyPosition(rival.body);
    const ballDx = target.x - bodyPosition.x;
    const ballDz = target.z - bodyPosition.z;
    const ballDistance = Math.hypot(ballDx, ballDz);
    if (ballDistance > 0.001) {
      const directionX = ballDx / ballDistance;
      const directionZ = ballDz / ballDistance;
      this.physics.applyTorque(rival.body, new Vector3(directionZ * spec.torquePower, 0, -directionX * spec.torquePower));
      this.physics.wakeBody(rival.body);
    }

    const angularVelocity = this.readBodyAngularVelocity(rival.body);
    const angularSpeed = angularVelocity.length();
    if (angularSpeed > spec.maxAngularVelocity) {
      angularVelocity.multiplyScalar(spec.maxAngularVelocity / angularSpeed);
      this.physics.writeAngularVelocity(rival.body, angularVelocity);
    }

    if (ballDistance <= spec.waypointReach) {
      rival.waypointIndex += 1;
      if (rival.waypointIndex >= rival.waypoints.length) {
        rival.waypointIndex = 0;
        rival.circuitsCompleted += 1;
      }
    }

    if (bodyPosition.y < (this.race.bounds.minY ?? -9) - 3) {
      setBodyTransform(rival.body, rival.start);
      rival.waypointIndex = 0;
    }
  }

  private syncBallz18AiRival(): void {
    const rival = this.ballz18AiRival;
    if (!rival) return;
    this.physics.readPosition(rival.body, rival.group.position);
    this.physics.readRotation(rival.body, rival.group.quaternion);
  }

  private buildClassicHumanPopulation(count: number): void {
    // levelList.xml preserves the Level 2 population count but not spawn
    // coordinates. Keep these actors deterministic and visibly labeled as a
    // recovered population layer; their exact wandering/spawns remain partial.
    const anchors: Array<[number, number]> = [
      [0.12, 0.2], [0.32, 0.18], [0.55, 0.2], [0.78, 0.18], [0.88, 0.36],
      [0.84, 0.66], [0.66, 0.82], [0.42, 0.8], [0.18, 0.72], [0.12, 0.48]
    ];
    const { minX, maxX, minZ, maxZ } = this.race.bounds;
    for (let index = 0; index < count; index += 1) {
      const anchor = anchors[index % anchors.length];
      const actor = this.createHumanProxy(
        new Color(index % 2 === 0 ? "#7a2730" : "#273b72"),
        new Color("#c7a07e")
      );
      actor.name = `ArchiveLevelHuman.${index + 1}`;
      actor.scale.setScalar(0.48);
      actor.position.set(
        MathUtils.lerp(minX + 2.2, maxX - 2.2, anchor[0]),
        0.12,
        MathUtils.lerp(minZ + 2.2, maxZ - 2.2, anchor[1])
      );
      actor.rotation.y = index * 1.7;
      actor.userData.archiveEvidence = "levelList.xml iNumHuman; placement reconstructed";
      this.worldGroup.add(actor);
    }
  }

  private buildNpcs(config: { zombies: number; humans: number }): void {
    const bounds = this.race.bounds;
    const spawn = (kind: "zombie" | "human"): void => {
      // keep spawns away from the player start
      let x = 0;
      let z = 0;
      for (let attempt = 0; attempt < 40; attempt++) {
        x = MathUtils.lerp(bounds.minX + 2, bounds.maxX - 2, Math.random());
        z = MathUtils.lerp(bounds.minZ + 2, bounds.maxZ - 2, Math.random());
        const awayFromPlayer = Math.hypot(x - this.race.start[0], z - this.race.start[2]) > 6;
        const awayFromNpcs = this.npcs.every((npc) => Math.hypot(x - npc.group.position.x, z - npc.group.position.z) > 1.5);
        if (awayFromPlayer && awayFromNpcs) {
          break;
        }
      }

      const bodyMaterial = new MeshStandardMaterial({
        color: new Color(kind === "zombie" ? "#4e9b47" : "#d9b38c"),
        emissive: new Color(kind === "zombie" ? "#0d2c0a" : "#241605"),
        roughness: 0.62,
        metalness: 0.08
      });
      const torso = new Mesh(new CylinderGeometry(0.24, 0.3, 0.62, 12), bodyMaterial);
      torso.position.y = 0.05;
      const head = new Mesh(new SphereGeometry(0.2, 14, 10), bodyMaterial);
      head.position.y = 0.52;
      const group = new Group();
      group.add(torso, head);
      group.castShadow = true;
      torso.castShadow = true;
      head.castShadow = true;
      group.position.set(x, 0.6, z);
      this.worldGroup.add(group);

      const body = this.physics.addDynamicSphere(new Vector3(x, 0.8, z), 0.34, 0.55, {
        linearDamping: 0.82,
        angularDamping: 0.95
      });

      this.npcs.push({
        group,
        bodyMaterial,
        body,
        kind,
        direction: randomNpcDirection(),
        turnTimer: Math.random() * 0.4,
        alive: true
      });
    };

    for (let i = 0; i < config.humans; i++) {
      spawn("human");
    }
    for (let i = 0; i < config.zombies; i++) {
      spawn("zombie");
    }
    this.zombiesTotal = config.zombies;
  }

  private updateNpcs(deltaSeconds: number): void {
    const bounds = this.race.bounds;
    const playerPosition = this.readBodyPosition(this.playerBody);

    for (const npc of this.npcs) {
      if (!npc.alive) {
        continue;
      }

      npc.turnTimer -= deltaSeconds;
      if (npc.turnTimer <= 0) {
        if (npc.kind === "human") {
          // legacy Human::rotateDirection — random +/-40 degree turn every ~20 frames
          const turn = MathUtils.degToRad(MathUtils.lerp(-40, 40, Math.random()));
          npc.direction.applyAxisAngle(UP_AXIS, turn);
          npc.turnTimer = 0.33;
        } else {
          // zombies hunt: nearest living human, else the player
          let target = this.playerGroup.position;
          let best = target.distanceToSquared(npc.group.position);
          for (const other of this.npcs) {
            if (other.alive && other.kind === "human") {
              const distance = other.group.position.distanceToSquared(npc.group.position);
              if (distance < best) {
                best = distance;
                target = other.group.position;
              }
            }
          }
          const bodyPosition = this.readBodyPosition(npc.body);
          npc.direction.set(target.x - bodyPosition.x, 0, target.z - bodyPosition.z);
          if (npc.direction.lengthSq() < 0.001) {
            npc.direction.copy(randomNpcDirection());
          }
          npc.direction.normalize();
          npc.turnTimer = 0.5;
        }
      }

      // legacy Human::ForceNTorque — gravity handled by world, push along direction
      const force = npc.kind === "zombie" ? 4.6 : 3.4;
      this.physics.applyForce(npc.body, new Vector3(npc.direction.x * force, 0, npc.direction.z * force));

      // legacy human_wallContactProcess — new random direction at the walls
      const bodyPosition = this.readBodyPosition(npc.body);
      const nearWall =
        bodyPosition.x < bounds.minX + 0.9 ||
        bodyPosition.x > bounds.maxX - 0.9 ||
        bodyPosition.z < bounds.minZ + 0.9 ||
        bodyPosition.z > bounds.maxZ - 0.9;
      if (nearWall) {
        bodyPosition.x = MathUtils.clamp(bodyPosition.x, bounds.minX + 0.9, bounds.maxX - 0.9);
        bodyPosition.z = MathUtils.clamp(bodyPosition.z, bounds.minZ + 0.9, bounds.maxZ - 0.9);
        this.writeBodyPosition(npc.body, bodyPosition);
        if (npc.kind === "human") {
          npc.direction.copy(randomNpcDirection());
        }
      }

      npc.group.position.set(bodyPosition.x, bodyPosition.y - 0.28, bodyPosition.z);
      npc.group.rotation.y = Math.atan2(npc.direction.x, npc.direction.z);

      // ZombieKiller contact: roll over a zombie to squash it
      if (npc.kind === "zombie") {
        const distance = Math.hypot(
          bodyPosition.x - playerPosition.x,
          bodyPosition.z - playerPosition.z
        );
        if (distance < this.playerRadius + 0.42) {
          this.squashNpc(npc);
          continue;
        }

        // infection: zombie touches human — the horde grows
        if (this.elapsedMs >= 3000) {
          for (const other of this.npcs) {
            if (other.alive && other.kind === "human" && other.group.position.distanceTo(npc.group.position) < 0.85) {
              other.kind = "zombie";
              other.bodyMaterial.color.set("#4e9b47");
              other.bodyMaterial.emissive.set("#0d2c0a");
              this.zombiesTotal += 1;
              this.audio.infect();
              this.particles.burst(other.group.position, 20, 3.2, 0.5);
            }
          }
        }
      }
    }
  }

  private squashNpc(npc: NpcAgent): void {
    npc.alive = false;
    this.physics.removeBody(npc.body);
    npc.group.scale.set(1.35, 0.12, 1.35);
    npc.group.position.y = 0.08;
    this.particles.burst(npc.group.position, 46, 5.4, 0.8);
    this.audio.squash();
  }

  private buildLegacyGeometry(positions: number[], indices: number[], uvs: number[] | null): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    if (uvs && uvs.length === (positions.length / 3) * 2) {
      geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  private buildPlanarTiledGeometry(positions: number[], indices: number[], tileScale: number): BufferGeometry {
    const geometry = new BufferGeometry();
    const expandedPositions: number[] = [];
    const expandedUvs: number[] = [];
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const normal = new Vector3();

    for (let offset = 0; offset < indices.length; offset += 3) {
      const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]];
      const points = triangle.map((index) => new Vector3(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]));
      a.copy(points[0]);
      b.copy(points[1]);
      c.copy(points[2]);
      normal.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
      const absX = Math.abs(normal.x);
      const absY = Math.abs(normal.y);
      const absZ = Math.abs(normal.z);

      for (const point of points) {
        expandedPositions.push(point.x, point.y, point.z);
        if (absY >= absX && absY >= absZ) {
          expandedUvs.push(point.x * tileScale, point.z * tileScale);
        } else if (absX >= absZ) {
          expandedUvs.push(point.z * tileScale, point.y * tileScale);
        } else {
          expandedUvs.push(point.x * tileScale, point.y * tileScale);
        }
      }
    }

    geometry.setAttribute("position", new Float32BufferAttribute(expandedPositions, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(expandedUvs, 2));
    geometry.computeVertexNormals();
    return geometry;
  }

  private buildMaterialGroupedGeometry(
    positions: number[],
    indices: number[],
    uvs: number[] | null,
    faceMaterials: string[]
  ): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    if (uvs && uvs.length === (positions.length / 3) * 2) {
      geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    }

    const materialIndices = [[], [], []] as number[][];
    const faceCount = Math.floor(indices.length / 3);
    for (let face = 0; face < faceCount; face += 1) {
      const key = (faceMaterials[face] ?? "").toLowerCase().replace(/\s+/g, "");
      const materialIndex = key === "material#2" ? 1 : key === "material#3" ? 2 : 0;
      materialIndices[materialIndex].push(indices[face * 3], indices[face * 3 + 1], indices[face * 3 + 2]);
    }

    const groupedIndices = materialIndices.flat();
    geometry.setIndex(groupedIndices);
    let groupStart = 0;
    materialIndices.forEach((group, materialIndex) => {
      if (group.length > 0) {
        geometry.addGroup(groupStart, group.length, materialIndex);
        groupStart += group.length;
      }
    });
    geometry.computeVertexNormals();
    return geometry;
  }

  private buildVehicleTrack(): void {
    const TRACK_SCALE = 0.5;
    const track = carsCatalog.track as { positions: number[]; indices: number[]; uvs: number[] | null };
    const scaled = track.positions.map((value) => value * TRACK_SCALE);
    const geometry = this.buildPlanarTiledGeometry(scaled, track.indices, 0.12);
    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({
        // PisteOvale.tvm contains several material groups but the current TVM
        // decoder does not preserve their assignments yet. Project an archived
        // concrete texture per face instead of stretching one image across
        // unrelated authored UV islands.
         map: this.loadTexture("/assets/textures/archive/Concrete.jpg", 1, 1),
         color: new Color("#939da3"),
         // The archived mesh has no recovered light rig and its steep banks
         // frequently present back-facing triangles to the chase camera. Keep
         // the exact concrete map readable instead of letting those faces fall
         // to near-black in the neutral revival lighting.
         emissive: new Color("#20272b"),
         emissiveIntensity: 0.38,
         roughness: 0.92,
        metalness: 0.04,
        side: DoubleSide
      })
    );
    mesh.name = "PisteOvale";
    mesh.receiveShadow = true;
    this.worldGroup.add(mesh);
    this.staticBodies.push(this.physics.addStaticTrimesh(new Vector3(0, 0, 0), scaled, track.indices));

    // infield/ground so nothing falls through around the oval
    this.staticBodies.push(this.physics.addStaticBox(new Vector3(0, -0.55, 0), new Vector3(42, 0.5, 55)));
  }

  private buildVehicle(): void {
    if (!carsCatalog) {
      return;
    }
    const model = this.race.vehicle?.model ?? "impreza";
    const impreza = (model === "cobra" ? carsCatalog.cobra : carsCatalog.impreza) as {
      chassis: {
        positions: number[];
        indices: number[];
        uvs: number[] | null;
        faceMaterials: string[];
        bounds: { min: number[]; max: number[] };
      };
      wheels: Array<{ name: string; offset: number[]; positions: number[]; indices: number[]; uvs: number[] | null; bounds: { min: number[]; max: number[] } }>;
    };
    const liveryPath = model === "cobra" ? "/assets/textures/cars/cobra_blue.png" : "/assets/textures/cars/ChassisSTi.bmp";

    const start = this.raceStart;
    const chassisBody = this.physics.addDynamicBox(start, new Vector3(1, 0.5, 2.4), 14, {
      colliderOffset: new Vector3(0, 0.26, -0.42),
      angularDamping: 0.35,
      linearDamping: 0.02,
      allowSleep: false,
      massAtBodyOrigin: true
    });
    // legacy SetBodyCenterOfMass(0,-1,+10): CoM low and toward the nose —
    // achieved here by offsetting the collision shape up and behind the body origin
    const wheelDefinitions = impreza.wheels.map((wheel) => ({
      connection: new Vector3(wheel.offset[0], wheel.offset[1], wheel.offset[2]),
      radius: Math.max(0.2, (wheel.bounds.max[1] - wheel.bounds.min[1]) / 2)
    }));
    const vehicle = this.physics.createVehicle(chassisBody, {
      upAxis: 1,
      forwardAxis: 2,
      wheels: wheelDefinitions
    });

    const chassisGroup = new Group();
    const chassisGeometry = this.buildMaterialGroupedGeometry(
      impreza.chassis.positions,
      impreza.chassis.indices,
      impreza.chassis.uvs,
      impreza.chassis.faceMaterials
    );
    const chassisMesh = new Mesh(
      chassisGeometry,
      [
        new MeshStandardMaterial({
           map: impreza.chassis.uvs ? this.loadTexture(liveryPath, 1, 1) : null,
           color: impreza.chassis.uvs ? new Color("#ffffff") : new Color(model === "cobra" ? "#2b58c9" : "#2b4d9e"),
           emissive: new Color(model === "cobra" ? "#111c42" : "#101a35"),
           emissiveIntensity: 0.28,
           roughness: 0.3,
          metalness: 0.46,
          side: DoubleSide
        }),
        new MeshStandardMaterial({
          map: impreza.chassis.uvs ? this.loadTexture("/assets/textures/cars/Windows.bmp", 1, 1) : null,
           color: new Color("#b8d7e8"),
           emissive: new Color("#101a20"),
           emissiveIntensity: 0.22,
          roughness: 0.08,
          metalness: 0.32,
          transparent: true,
          opacity: 0.76,
          depthWrite: false,
          side: DoubleSide
        }),
        new MeshStandardMaterial({
          map: impreza.chassis.uvs ? this.loadTexture("/assets/textures/cars/Undercarriage.bmp", 1, 1) : null,
           color: new Color("#a6adb2"),
           emissive: new Color("#171a1c"),
           emissiveIntensity: 0.24,
          roughness: 0.74,
          metalness: 0.48,
          side: DoubleSide
        })
      ]
    );
    chassisMesh.castShadow = true;
    chassisMesh.position.set(0, 0.26, -0.42); // match the CoM shape offset
    chassisGroup.add(chassisMesh);
    this.worldGroup.add(chassisGroup);

    const wheelMaterial = new MeshStandardMaterial({
      map: this.loadTexture("/assets/textures/cars/Wheel.bmp", 1, 1),
      color: new Color("#d2d5d8"),
      roughness: 0.72,
      metalness: 0.18,
      side: DoubleSide
    });
    const wheels: Array<{ mesh: Mesh; index: number; connection: Vector3; radius: number }> = [];
    impreza.wheels.forEach((wheel, index) => {
      const definition = wheelDefinitions[index];
      const mesh = new Mesh(this.buildLegacyGeometry(wheel.positions, wheel.indices, wheel.uvs), wheelMaterial);
      mesh.castShadow = true;
      this.worldGroup.add(mesh);
      wheels.push({ mesh, index, connection: definition.connection, radius: definition.radius });
    });

    // Race objectives and cameras read playerGroup directly. Keep the disabled ball proxy far
    // away: Rapier's ray-cast vehicle query can otherwise see a translated kinematic collider
    // even after that collider is disabled, causing the suspension to lift the chassis forever.
    this.physics.setBodyMode(this.playerBody, "kinematic", false);
    setBodyTransform(this.playerBody, new Vector3(400, 2, 400));

    this.vehicleRig = { vehicle, chassisBody, chassisGroup, wheels };
  }

  private teardownVehicle(): void {
    if (!this.vehicleRig) {
      return;
    }
    this.physics.removeVehicle(this.vehicleRig.vehicle);
    this.physics.removeBody(this.vehicleRig.chassisBody);
    this.worldGroup.remove(this.vehicleRig.chassisGroup);
    for (const wheel of this.vehicleRig.wheels) {
      this.worldGroup.remove(wheel.mesh);
    }
    this.vehicleRig = null;
    this.physics.setBodyMode(this.playerBody, "dynamic", true);
  }

  private readVehicleInput(deltaSeconds = 1 / 60): void {
    if (!this.vehicleRig) {
      return;
    }
    const moveAxis = this.input.getMoveAxis();
    // wheel order from the catalog: [FR(+z), RR(-z), RL(-z), FL(+z)] — front pair has offset z > 0
    // Positive wheel torque propels the archive chassis toward its authored +Z nose.
    // Phase R1.2 — authentic AtmelCubx/Vehicule.cpp handling:
    //   rear-wheel drive, stepped steering (±10°/frame, clamp ±45°) that SNAPS to 0 on release.
    // CLVehicule::ManageInput assigns EngineCtrl.Power = 3000 before applying
    // it to the two rear wheels. The former 52-unit adapter barely overcame
    // the rebuilt rigid vehicle's rolling resistance and made the Impreza
    // appear immobile.
    const drive = moveAxis.forward * 3000;
    const { vehicle } = this.vehicleRig;
    if (moveAxis.forward !== 0 || moveAxis.turn !== 0) {
      this.physics.wakeBody(this.vehicleRig.chassisBody);
    }
    const STEER_STEP = MathUtils.degToRad(10) * deltaSeconds * 30; // legacy ±10°/frame at ~30fps
    const STEER_MAX = MathUtils.degToRad(45);
    if (moveAxis.turn !== 0) {
      this.vehicleSteering = MathUtils.clamp(this.vehicleSteering - moveAxis.turn * STEER_STEP, -STEER_MAX, STEER_MAX);
    } else {
      this.vehicleSteering = 0; // legacy snap-to-center
    }
    const inputModel = this.race.vehicle?.model ?? "impreza";
    const impreza = ((inputModel === "cobra" ? carsCatalog.cobra : carsCatalog.impreza) ?? carsCatalog.impreza) as { wheels: Array<{ offset: number[] }> };
    impreza.wheels.forEach((wheel, index) => {
      if (wheel.offset[2] > 0) {
        vehicle.setWheelSteering(index, this.vehicleSteering);
        vehicle.setWheelEngineForce(index, 0);
      } else {
        vehicle.setWheelSteering(index, 0);
        vehicle.setWheelEngineForce(index, drive); // RWD, comme dans le temps
      }
      vehicle.setWheelBrake(index, 0);
    });
  }

  private syncVehicle(): void {
    if (!this.vehicleRig) {
      return;
    }
    const { chassisBody, chassisGroup, wheels } = this.vehicleRig;
    const chassisPosition = this.physics.readPosition(chassisBody, chassisGroup.position);
    const chassisRotation = this.physics.readRotation(chassisBody, chassisGroup.quaternion);
    for (const wheel of wheels) {
      const hardPoint = this.vehicleRig.vehicle.wheelHardPoint(wheel.index);
      const suspensionLength = this.vehicleRig.vehicle.wheelSuspensionLength(wheel.index) ?? 0;
      if (hardPoint) {
        const suspensionDirection = new Vector3(0, -1, 0).applyQuaternion(chassisRotation);
        wheel.mesh.position.set(hardPoint.x, hardPoint.y, hardPoint.z).addScaledVector(suspensionDirection, suspensionLength);
      } else {
        wheel.mesh.position.copy(wheel.connection).applyQuaternion(chassisRotation).add(chassisPosition);
      }
      const steering = this.vehicleRig.vehicle.wheelSteering(wheel.index) ?? 0;
      const rolling = this.vehicleRig.vehicle.wheelRotation(wheel.index) ?? 0;
      wheel.mesh.quaternion
        .copy(chassisRotation)
        .multiply(new Quaternion().setFromAxisAngle(UP_AXIS, steering))
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), rolling));
    }

    // The visible/player-facing proxy is the Three group. The disabled Rapier ball stays parked
    // away from vehicle rays; mirroring its transform here makes the chassis self-suspend.
    this.playerGroup.position.copy(chassisPosition);

    // fell off the world — rebuild at the start line
    const minY = this.race.bounds.minY ?? -10;
    if (chassisPosition.y < minY) {
      this.teardownVehicle();
      this.buildVehicle();
    }
  }

  private createVehicleRingSpecs(): RaceRing[] {
    if (!carsCatalog) {
      return [];
    }
    // sample deck-height vertices of the oval so rings sit on the racing line
    const track = carsCatalog.track as { positions: number[] };
    const TRACK_SCALE = 0.5;
    const picked: Array<[number, number, number]> = [];
    for (let i = 0; i < track.positions.length && picked.length < 10; i += 3) {
      const x = track.positions[i] * TRACK_SCALE;
      const y = track.positions[i + 1] * TRACK_SCALE;
      const z = track.positions[i + 2] * TRACK_SCALE;
      if (y < 2.3 || y > 2.9) {
        continue;
      }
      if (picked.every((point) => Math.hypot(point[0] - x, point[2] - z) > 20)) {
        picked.push([x, y, z]);
      }
    }
    return picked.map((point, index) => ({
      position: [point[0], point[1] + 1.6, point[2]] as [number, number, number],
      yaw: (index % 2) * (Math.PI / 2),
      scale: 1.5
    }));
  }

  /** camera-attached word built from the recovered alphabet meshes */
  private buildGlyphWord(word: string, height: number): Group | null {
    if (!tvmCatalog) {
      return null;
    }
    const alphabet = tvmCatalog.alphabet as Record<string, { positions: number[]; indices: number[] }>;
    const group = new Group();
    const glyphMeshes: Mesh[] = [];
    let totalWidth = 0;
    for (const glyph of word.split("")) {
      const data = alphabet[glyph];
      if (!data) {
        continue;
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(data.positions, 3));
      geometry.setIndex(data.indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (!box) {
        continue;
      }
      const glyphDepth = Math.max(box.max.z - box.min.z, 0.001); // glyphs lie flat; z is their visual height
      const scale = height / glyphDepth;
      const width = (box.max.x - box.min.x) * scale;
      const mesh = new Mesh(
        geometry,
        new MeshStandardMaterial({ color: new Color("#ffe86b"), emissive: new Color("#5b4a08"), roughness: 0.3, metalness: 0.45, side: DoubleSide })
      );
      mesh.scale.setScalar(scale);
      mesh.rotation.x = -Math.PI / 2; // stand the flat glyph upright, facing the camera
      mesh.position.x = totalWidth + width / 2;
      totalWidth += width + height * 0.22;
      glyphMeshes.push(mesh);
    }
    if (glyphMeshes.length === 0) {
      return null;
    }
    for (const mesh of glyphMeshes) {
      mesh.position.x -= totalWidth / 2;
      group.add(mesh);
    }
    return group;
  }

  private showOverlayWords(queue: string[], stepSeconds: number): void {
    this.clearOverlay();
    if (!tvmCatalog || queue.length === 0) {
      return;
    }
    const group = new Group();
    group.position.set(0, 1.15, -7.5);
    this.camera.add(group);
    this.overlay = { group, queue: [...queue], timer: 0, stepSeconds };
    this.advanceOverlay();
  }

  private advanceOverlay(): void {
    if (!this.overlay) {
      return;
    }
    this.overlay.group.clear();
    const next = this.overlay.queue.shift();
    if (next === undefined) {
      this.clearOverlay();
      return;
    }
    const word = this.buildGlyphWord(next, 1.05);
    if (word) {
      this.overlay.group.add(word);
    }
    this.overlay.timer = this.overlay.stepSeconds;
  }

  private clearOverlay(): void {
    if (this.overlay) {
      this.camera.remove(this.overlay.group);
      this.overlay = null;
    }
  }

  private updateOverlay(deltaSeconds: number): void {
    if (!this.overlay) {
      return;
    }
    this.overlay.timer -= deltaSeconds;
    const pulse = 1 + Math.max(0, this.overlay.timer) * 0.12;
    this.overlay.group.scale.setScalar(pulse);
    if (this.overlay.timer <= 0) {
      this.advanceOverlay();
    }
  }

  private updateBallz18Countdown(): void {
    if (this.race.id !== "ballz18-level01") {
      return;
    }
    if (this.ballz18CountdownCue === "waiting" && this.raceCountdownRemaining <= 3) {
      this.ballz18CountdownCue = "3";
      this.ballz18CountdownReadyPlays += 1;
      this.audio.ballz18Ready();
      this.showOverlayWords(["3", "2", "1", "go"], 1);
      return;
    }
    if (this.ballz18CountdownCue === "3" && this.raceCountdownRemaining <= 2) {
      this.ballz18CountdownCue = "2";
      this.ballz18CountdownReadyPlays += 1;
      this.audio.ballz18Ready();
      return;
    }
    if (this.ballz18CountdownCue === "2" && this.raceCountdownRemaining <= 1) {
      this.ballz18CountdownCue = "1";
      this.ballz18CountdownReadyPlays += 1;
      this.audio.ballz18Ready();
      return;
    }
    if (this.ballz18CountdownCue === "1" && this.raceCountdownRemaining <= 0) {
      this.ballz18CountdownCue = "go";
      this.ballz18CountdownGoPlays += 1;
      this.audio.ballz18Go();
    }
  }

  // ---- Phase R1.1: classic 2015 ball preset (CLBallZ.cpp: g=-25, omega-brake x0.5) ----
  private applyBallPreset(): void {
    this.physics.setGravity(new Vector3(0, this.ballPreset === "classic2015" ? -25 : -18, 0));
    this.applyBallPresetVisuals();
  }

  private applyBallPresetVisuals(): void {
    const shellKind = this.ballPreset === "fire" ? "fire" : "shell";
    const innerKind = this.ballPreset === "revival" ? "fire" : "ctrl";
    const shellGeometry = this.createBallGeometry(shellKind, PLAYER_RADIUS);
    if (shellGeometry) {
      this.shell.geometry.dispose();
      this.shell.geometry = shellGeometry;
    }
    const innerGeometry = this.createBallGeometry(innerKind, INNER_RADIUS);
    if (innerGeometry) {
      this.innerBall.geometry.dispose();
      this.innerBall.geometry = innerGeometry;
    }

    const shellMaterial = this.shell.material;
    const innerMaterial = this.innerBall.material;
    const wireMaterial = this.shellWire.material;
    if (shellMaterial instanceof MeshPhysicalMaterial) {
      const fire = this.ballPreset === "fire";
      shellMaterial.color.set(fire ? "#ff8a36" : this.ballPreset === "classic2015" ? "#f4efe0" : "#d9f3f7");
      shellMaterial.emissive.set(fire ? "#7d1600" : "#000000");
      shellMaterial.emissiveIntensity = fire ? 0.72 : 0;
      shellMaterial.opacity = fire ? 0.92 : this.ballPreset === "classic2015" ? 0.3 : 0.42;
      shellMaterial.transmission = fire ? 0 : this.ballPreset === "classic2015" ? 0.18 : 0.08;
      shellMaterial.map = fire ? this.loadTexture("/assets/textures/ball/FireArrow800.jpg", 1, 1) : null;
      shellMaterial.needsUpdate = true;
    }
    if (innerMaterial instanceof MeshStandardMaterial) {
      innerMaterial.color.set(this.ballPreset === "classic2015" ? "#fff3ce" : "#ffffff");
      innerMaterial.emissive.set(this.ballPreset === "fire" ? "#7d1600" : this.ballPreset === "classic2015" ? "#20180a" : "#3c2100");
      innerMaterial.emissiveIntensity = this.ballPreset === "fire" ? 0.68 : this.ballPreset === "classic2015" ? 0.16 : 0.32;
    }
    if (wireMaterial instanceof LineBasicMaterial) {
      wireMaterial.color.set(this.ballPreset === "fire" ? "#ffce67" : this.ballPreset === "classic2015" ? "#fff6d6" : "#a7fff0");
      wireMaterial.opacity = this.ballPreset === "fire" ? 0.18 : this.ballPreset === "classic2015" ? 0.5 : 0.34;
    }
    this.fluidLayer.visible = this.ballPreset === "revival";
  }

  toggleBallPreset(): BallPreset {
    const order: BallPreset[] = ["revival", "classic2015", "fire"];
    const next = order[(order.indexOf(this.ballPreset) + 1) % order.length];
    return this.setBallPreset(next);
  }

  setBallPreset(preset: BallPreset): BallPreset {
    this.ballPreset = preset;
    saveBallPreset(preset);
    this.applyBallPreset();
    return preset;
  }

  getBallPreset(): BallPreset {
    return this.ballPreset;
  }

  // ---- Phase R1.4: ghost / last-lap spline (Scene3D/LapChecker.h port) ----
  private clearGhostVisuals(): void {
    if (this.ghostShell) {
      this.worldGroup.remove(this.ghostShell);
      this.ghostShell = null;
    }
    if (this.ghostBestLine) {
      this.worldGroup.remove(this.ghostBestLine);
      this.ghostBestLine = null;
    }
    if (this.ghostLastLapLine) {
      this.worldGroup.remove(this.ghostLastLapLine);
      this.ghostLastLapLine = null;
    }
  }

  private beginGhostRun(): void {
    this.clearGhostVisuals();
    this.ghostRecording = [];
    this.ghostSampleTimer = 0;
    this.ghostBest = loadGhostRun(this.race.id);

    if (this.ghostBest) {
      // best-run path: subtle accent spline through the world (clSplineLastLap heritage)
      const vertices: number[] = [];
      for (let i = 0; i < this.ghostBest.samples.length; i += 4) {
        vertices.push(this.ghostBest.samples[i + 1], this.ghostBest.samples[i + 2], this.ghostBest.samples[i + 3]);
      }
      this.ghostBestLine = this.createLine(vertices, this.race.palette.accent, 0.3);
      this.worldGroup.add(this.ghostBestLine);

      const shell = new Mesh(
        new SphereGeometry(this.playerRadius * 0.98, 20, 14),
        new MeshBasicMaterial({ color: new Color(this.race.palette.accent), transparent: true, opacity: 0.26, depthWrite: false })
      );
      shell.name = "GhostShell";
      const sx = this.ghostBest.samples[1];
      const sy = this.ghostBest.samples[2];
      const sz = this.ghostBest.samples[3];
      shell.position.set(sx, sy, sz);
      this.ghostShell = shell;
      this.worldGroup.add(shell);
    }
  }

  private updateGhost(deltaSeconds: number): void {
    // record (LapChecker sampled every N frames; we sample on a time threshold)
    this.ghostSampleTimer -= deltaSeconds;
    if (this.ghostSampleTimer <= 0 && this.ghostRecording.length < 4 * 1400) {
      this.ghostSampleTimer = 0.15;
      this.ghostRecording.push(
        Math.round(this.elapsedMs),
        Math.round(this.playerGroup.position.x * 100) / 100,
        Math.round(this.playerGroup.position.y * 100) / 100,
        Math.round(this.playerGroup.position.z * 100) / 100
      );
    }

    // playback: the translucent best-run shell races alongside
    if (this.ghostShell && this.ghostBest) {
      const samples = this.ghostBest.samples;
      const t = this.elapsedMs;
      let index = 0;
      while (index + 4 < samples.length && samples[index + 4] <= t) {
        index += 4;
      }
      if (index + 7 < samples.length) {
        const t0 = samples[index];
        const t1 = samples[index + 4];
        const mix = t1 > t0 ? MathUtils.clamp((t - t0) / (t1 - t0), 0, 1) : 0;
        this.ghostShell.position.set(
          MathUtils.lerp(samples[index + 1], samples[index + 5], mix),
          MathUtils.lerp(samples[index + 2], samples[index + 6], mix),
          MathUtils.lerp(samples[index + 3], samples[index + 7], mix)
        );
      } else if (samples.length >= 4) {
        this.ghostShell.visible = t <= this.ghostBest.timeMs + 1500;
      }
    }
  }

  private captureGhostFinish(): void {
    if (this.ghostRecording.length < 8) {
      return;
    }
    // legacy: clSplineLastLap becomes visible on lap completion
    const vertices: number[] = [];
    for (let i = 0; i < this.ghostRecording.length; i += 4) {
      vertices.push(this.ghostRecording[i + 1], this.ghostRecording[i + 2], this.ghostRecording[i + 3]);
    }
    if (this.ghostLastLapLine) {
      this.worldGroup.remove(this.ghostLastLapLine);
    }
    this.ghostLastLapLine = this.createLine(vertices, "#ffe86b", 0.55);
    this.worldGroup.add(this.ghostLastLapLine);

    if (!this.ghostBest || this.elapsedMs < this.ghostBest.timeMs) {
      // decimate to keep storage light
      let samples = this.ghostRecording;
      while (samples.length > 4 * 900) {
        const thinned: number[] = [];
        for (let i = 0; i < samples.length; i += 8) {
          thinned.push(samples[i], samples[i + 1], samples[i + 2], samples[i + 3]);
        }
        samples = thinned;
      }
      saveGhostRun(this.race.id, { timeMs: Math.round(this.elapsedMs), samples });
    }
  }

  // ---- Phase R2.2: FlightX (AtmelCubx/FlightXScene.cpp) ----
  private buildFlight(): void {
    if (!assetCatalog || !tvmCatalog) {
      return;
    }

    // the pipe1 loop, laid flat as the flight circuit
    const pipe = (tvmCatalog.assets as Array<{ id: string; positions: number[]; indices: number[] }>).find(
      (candidate) => candidate.id === "pipe1"
    );
    if (pipe) {
      const PIPE_SCALE = 0.15;
      const geometry = this.buildLegacyGeometry(pipe.positions.map((value) => value * PIPE_SCALE), pipe.indices, null);
      const mesh = new Mesh(
        geometry,
        new MeshStandardMaterial({ color: new Color("#7f96ab"), roughness: 0.5, metalness: 0.35, side: DoubleSide, transparent: true, opacity: 0.85 })
      );
      mesh.rotation.x = -Math.PI / 2; // authored upright loop -> horizontal circuit
      mesh.position.set(0, 14, 29);   // recenter the rotated loop on the origin
      mesh.name = "FlightX.Pipe1";
      this.worldGroup.add(mesh);
    }

    // the airplane, kinematic quaternion flight (no crash physics — arcade, like 2007)
    const plane = (assetCatalog.assets as Array<{ id: string; meshes: Array<{ positions: number[]; indices: number[]; color: number[] | null }> }>).find(
      (candidate) => candidate.id === "airplane"
    );
    const group = new Group();
    group.name = "FlightX.Player";
    if (plane && plane.meshes.length > 0) {
      const meshData = plane.meshes[0];
      const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (let i = 0; i < meshData.positions.length; i += 3) {
        for (let axis = 0; axis < 3; axis++) {
          bounds.min[axis] = Math.min(bounds.min[axis], meshData.positions[i + axis]);
          bounds.max[axis] = Math.max(bounds.max[axis], meshData.positions[i + axis]);
        }
      }
      const center = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2];
      const local = meshData.positions.map((value, index) => value - center[index % 3]);
      const mesh = new Mesh(
        this.buildLegacyGeometry(local, meshData.indices, null),
        new MeshStandardMaterial({ color: new Color("#dfe5ee"), roughness: 0.4, metalness: 0.3, side: DoubleSide })
      );
      mesh.castShadow = true;
      group.add(mesh);
    }
    group.position.copy(this.raceStart);
    this.worldGroup.add(group);

    // ghost-mirror the ball body so rings/gates/camera keep working
    this.physics.setBodyMode(this.playerBody, "kinematic", false);

    // FlightXScene.cpp only moves the airplane while W/S is pressed. Starting
    // stopped also prevents the countdown from silently crossing the half gate.
    this.flightRig = { group, speed: 0 };
  }

  private readFlightAndIntegrate(deltaSeconds: number): void {
    if (!this.flightRig) {
      return;
    }
    const { group } = this.flightRig;

    // Keep FlightX's input channels separate from BallZ's shared movement axis:
    // arrows rotate, while W/S move relative to the airplane's own forward axis.
    const rollInput = Number(this.input.isDown("ArrowLeft")) - Number(this.input.isDown("ArrowRight"));
    const pitchUp = this.input.isDown("ArrowUp");
    const pitchDown = this.input.isDown("ArrowDown");
    const thrustInput = Number(this.input.isDown("KeyW")) - Number(this.input.isDown("KeyS"));

    // FlightXScene.h factors, moderated from the original millisecond timestep
    // into a controllable radians/second web update.
    const roll = rollInput * 0.9 * deltaSeconds;
    let pitch = 0;
    if (pitchUp) {
      pitch = 0.4 * deltaSeconds;
    } else if (pitchDown) {
      pitch = -(0.5 + (this.input.isDown("Space") ? 0.1 : 0)) * deltaSeconds;
    }
    const qRoll = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), roll);
    const qPitch = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch);
    group.quaternion.multiply(qRoll).multiply(qPitch);

    // The archive called MoveRelative only while W/S was held. A short damping
    // curve preserves that forward/back semantic while avoiding an abrupt stop.
    const targetSpeed = thrustInput > 0 ? 20 : thrustInput < 0 ? -11 : 0;
    this.flightRig.speed = MathUtils.damp(this.flightRig.speed, targetSpeed, thrustInput === 0 ? 5 : 8, deltaSeconds);
    if (this.input.consumePress("KeyR")) {
      group.quaternion.identity(); // legacy R: reset orientation
    }

    const forward = new Vector3(0, 0, -1).applyQuaternion(group.quaternion);
    group.position.addScaledVector(forward, this.flightRig.speed * deltaSeconds);

    // keep the flight inside the arena shell
    const bounds = this.race.bounds;
    group.position.x = MathUtils.clamp(group.position.x, bounds.minX + 1, bounds.maxX - 1);
    group.position.z = MathUtils.clamp(group.position.z, bounds.minZ + 1, bounds.maxZ - 1);
    group.position.y = MathUtils.clamp(group.position.y, 2, 34);

    // mirror onto the ball body: rings, gates, HUD, ghost, camera all follow
    this.physics.writeTransform(this.playerBody, group.position, group.quaternion, false);
    this.physics.writeLinearVelocity(
      this.playerBody,
      new Vector3(forward.x * this.flightRig.speed, forward.y * this.flightRig.speed, forward.z * this.flightRig.speed),
      false
    );
    this.playerGroup.position.copy(group.position);
  }

  // ---- Phase R3.1: the original post_haze.shade — scene sampled through the
  // recovered haze.dds distortion (Scene(uv + (1-distort)·strength)) ----
  private setupPostProcessing(): void {
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));

    const hazeTexture = this.loadTexture("/assets/textures/archive/haze.png", 1, 1);
    hazeTexture.wrapS = RepeatWrapping;
    hazeTexture.wrapT = RepeatWrapping;

    const hazePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        tDistort: { value: hazeTexture },
        uStrength: { value: 0.0045 },
        uTime: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDistort;
        uniform float uStrength;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          // post_haze.shade: D = 1 - distort; Scene(uv + D) — here D scaled & drifting
          vec2 drift = vec2(uTime * 0.013, uTime * 0.021);
          float d = 1.0 - texture2D(tDistort, vUv * 3.0 + drift).r;
          vec2 offset = vec2(d, -d) * uStrength;
          gl_FragColor = vec4(texture2D(tDiffuse, vUv + offset).rgb, 1.0);
        }`
    });
    hazePass.enabled = false;
    composer.addPass(hazePass);

    // inoutpost.shade — the 2008 scene-change wipe: Scene(uv + (1-distort)·amount)
    const transitionPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        tDistort: { value: hazeTexture },
        uAmount: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDistort;
        uniform float uAmount;
        varying vec2 vUv;
        void main() {
          float d = 1.0 - texture2D(tDistort, vUv * 2.0).r;
          vec2 offset = vec2(d, -d) * uAmount * 0.22;
          vec3 scene = texture2D(tDiffuse, vUv + offset).rgb;
          gl_FragColor = vec4(scene * (1.0 - uAmount * 0.35), 1.0);
        }`
    });
    transitionPass.enabled = false;
    composer.addPass(transitionPass);

    this.composer = composer;
    this.hazePass = hazePass;
    this.transitionPass = transitionPass;
  }

  /** legacy inoutpost scene transition — flare the wipe, it decays in update() */
  playTransitionWipe(): void {
    this.transitionAmount = 1;
  }

  // ---- Phase R3.2: CLWater — animated water plane, legacy bump speed 0.5 ----
  private buildLegacyWater(): void {
    const distortTexture = this.loadTexture("/assets/textures/archive/distortion.png", 1, 1);
    distortTexture.wrapS = RepeatWrapping;
    distortTexture.wrapT = RepeatWrapping;

    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        tDistort: { value: distortTexture },
        uColor: { value: new Color("#183d55") },
        uSurface: { value: new Color("#4f89b0") }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform sampler2D tDistort;
        uniform vec3 uColor;
        uniform vec3 uSurface;
        varying vec2 vUv;
        void main() {
          // legacy CLWater: DUDV distortion, bump animation speed 0.5
          vec2 flow = vec2(uTime * 0.5 * 0.02, uTime * 0.5 * 0.017);
          float a = texture2D(tDistort, vUv * 9.0 + flow).r;
          float b = texture2D(tDistort, vUv * 6.5 - flow * 1.3).r;
          float ripple = (a + b) * 0.5;
          vec3 water = mix(uColor, uSurface, smoothstep(0.35, 0.75, ripple));
          gl_FragColor = vec4(water, 0.52); // thinner film — the mirror below shows through
        }`
    });

    // legacy CLWater reflection pass: a real planar mirror under the ripple film
    const reflector = new Reflector(new PlaneGeometry(120, 120), {
      textureWidth: 512,
      textureHeight: 512,
      color: new Color("#2c4a5e"),
      clipBias: 0.003
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = 0.11;
    reflector.name = "CLWater.Reflection";
    this.worldGroup.add(reflector);

    const water = new Mesh(new PlaneGeometry(120, 120, 1, 1), material);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.14; // WaterHeight, scaled to this arena
    water.name = "CLWater";
    this.worldGroup.add(water);
    this.waterMaterial = material;
  }

  // ---- Phase R4.1: ConsoleGraphysX shotBullet(radius 0.15, mass 1.0, life 1000) ----
  private fireBullet(): void {
    const heading = this.arrowHeading;
    const direction = new Vector3(Math.sin(heading), 0, Math.cos(heading));
    const origin = this.playerGroup.position.clone().addScaledVector(direction, this.playerRadius + 0.35);
    origin.y += 0.15;

    const body = this.physics.addDynamicSphere(origin, 0.15, 1.0);
    this.physics.writeLinearVelocity(body, new Vector3(direction.x * 26, 1.2, direction.z * 26));

    const mesh = new Mesh(
      new SphereGeometry(0.15, 10, 8),
      new MeshStandardMaterial({ color: new Color("#ffd25f"), emissive: new Color("#8a5200"), roughness: 0.3, metalness: 0.4 })
    );
    mesh.castShadow = true;
    mesh.position.copy(origin);
    this.worldGroup.add(mesh);

    this.bullets.push({ mesh, body, bornMs: performance.now() });
    this.audio.fire();
  }

  private updateBullets(): void {
    const now = performance.now();
    for (let index = this.bullets.length - 1; index >= 0; index--) {
      const bullet = this.bullets[index];
      this.physics.readPosition(bullet.body, bullet.mesh.position);

      let spent = now - bullet.bornMs > 1000; // legacy lifetime 1000
      if (!spent) {
        for (const npc of this.npcs) {
          if (npc.alive && npc.kind === "zombie" && npc.group.position.distanceTo(bullet.mesh.position) < 0.95) {
            this.squashNpc(npc);
            spent = true;
            break;
          }
        }
      }
      if (spent) {
        this.physics.removeBody(bullet.body);
        this.worldGroup.remove(bullet.mesh);
        this.bullets.splice(index, 1);
      }
    }
  }

  private clearBullets(): void {
    for (const bullet of this.bullets) {
      this.physics.removeBody(bullet.body);
      this.worldGroup.remove(bullet.mesh);
    }
    this.bullets.length = 0;
  }

  // ---- Port Dominus: the Dominus Art town, textured and walkable ----
  private buildDominusVillage(): void {
    if (!villageCatalog) {
      return;
    }
    const assets = new Map<string, { positions: number[]; indices: number[]; uvs: number[] | null; texture: string | null; size: number[] }>();
    for (const asset of villageCatalog.assets as Array<{ id: string; positions: number[]; indices: number[]; uvs: number[] | null; texture: string | null; size: number[] }>) {
      assets.set(asset.id, asset);
    }

    const VILLAGE_SCALE = 0.045;
    const materialCache = new Map<string, MeshStandardMaterial>();

    for (const [id, x, z, rotationY, scaleOverride, solid] of DOMINUS_LAYOUT) {
      const asset = assets.get(id);
      if (!asset) {
        continue;
      }
      const scale = scaleOverride ?? VILLAGE_SCALE;
      const scaled = asset.positions.map((value) => value * scale);
      const geometry = this.buildLegacyGeometry(scaled, asset.indices, asset.uvs);

      const materialKey = asset.texture ?? "plain-" + id;
      let material = materialCache.get(materialKey);
      if (!material) {
        const foliage = /tree|bush|grass|flower|reed/.test(id);
        material = new MeshStandardMaterial({
          map: asset.texture ? this.loadTexture(asset.texture, 1, 1) : null,
          color: asset.texture ? new Color("#ffffff") : new Color(id.startsWith("fish") ? "#7fb2d9" : "#b9a289"),
          roughness: 0.82,
          metalness: 0.04,
          side: DoubleSide,
          transparent: foliage,
          alphaTest: foliage ? 0.45 : 0
        });
        materialCache.set(materialKey, material);
      }

      const mesh = new Mesh(geometry, material);
      mesh.position.set(x, id.startsWith("fish") ? 0.35 : 0.12, z);
      mesh.rotation.y = rotationY;
      mesh.castShadow = !id.startsWith("grass");
      mesh.receiveShadow = true;
      if (id.startsWith("fish")) {
        mesh.userData.bob = 1.1;
        mesh.userData.baseY = mesh.position.y;
      }
      this.worldGroup.add(mesh);

      if (solid) {
        this.staticBodies.push(this.physics.addStaticTrimesh(mesh.position.clone(), rotateY(scaled, rotationY), asset.indices));
      }
    }
  }

  // ---- Terrain 2008: Heightmap.bmp under the Subaru (CarScene CLLand heritage) ----
  private terrainHeightAt(x: number, z: number): number {
    if (!terrainCarx) {
      return 0;
    }
    const size = terrainCarx.size as number;
    const heights = terrainCarx.heights as number[];
    const world = TERRAIN_WORLD_SIZE;
    const gx = MathUtils.clamp(((x + world / 2) / world) * (size - 1), 0, size - 1);
    const gz = MathUtils.clamp(((z + world / 2) / world) * (size - 1), 0, size - 1);
    const index = Math.round(gz) * size + Math.round(gx);
    return (heights[index] ?? 0) * TERRAIN_HEIGHT_SCALE;
  }

  private buildCarXTerrain(): void {
    if (!terrainCarx) {
      return;
    }
    const size = terrainCarx.size as number;
    const heights = terrainCarx.heights as number[];
    const world = TERRAIN_WORLD_SIZE;
    const step = world / (size - 1);

    // build the displaced grid once, shared by visual + trimesh physics
    const positions: number[] = [];
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        positions.push(
          -world / 2 + column * step,
          heights[row * size + column] * TERRAIN_HEIGHT_SCALE,
          -world / 2 + row * step
        );
      }
    }
    const indices: number[] = [];
    for (let row = 0; row < size - 1; row++) {
      for (let column = 0; column < size - 1; column++) {
        const a = row * size + column;
        const b = a + 1;
        const c = a + size;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const uvs: number[] = [];
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        uvs.push((column / (size - 1)) * 14, (row / (size - 1)) * 14);
      }
    }

    const geometry = this.buildLegacyGeometry(positions, indices, uvs);
    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({
        map: this.loadTexture("/assets/textures/archive/grass.jpg", 1, 1),
        color: new Color("#dfe8cf"),
        roughness: 0.94,
        metalness: 0.02
      })
    );
    mesh.name = "CarXTerrain";
    mesh.receiveShadow = true;
    this.worldGroup.add(mesh);
    this.staticBodies.push(this.physics.addStaticTrimesh(new Vector3(0, 0, 0), positions, indices));
  }

  private createTerrainRingSpecs(): RaceRing[] {
    if (!terrainCarx) {
      return [];
    }
    const picked: Array<[number, number, number]> = [];
    // ridgeline tour: spread rings on a coarse sweep, snapped to the surface
    for (let z = 40; z >= -40 && picked.length < 11; z -= 8) {
      const x = Math.sin(z * 0.35) * 34;
      picked.push([x, this.terrainHeightAt(x, z), z]);
    }
    return picked.map((point, index) => ({
      position: [point[0], point[1] + 1.7, point[2]] as [number, number, number],
      yaw: (index % 2) * (Math.PI / 2),
      scale: 1.4
    }));
  }

  private buildInputDeviceLabPreview(): void {
    const bench = new Mesh(
      new BoxGeometry(22, 0.45, 14),
      new MeshStandardMaterial({
        map: this.loadTexture("/assets/textures/archive/ElectronicBoard_fullsize.jpg", 2, 1),
        color: new Color("#6d8792"),
        roughness: 0.58,
        metalness: 0.28
      })
    );
    bench.position.y = -0.25;
    bench.receiveShadow = true;
    this.archivePreviewGroup.add(bench);

    const controllerRing = new Mesh(
      new PlaneGeometry(4.8, 4.8),
      new MeshStandardMaterial({
        map: this.loadTexture("/assets/device-lab/Circle-Thick-Purple-300x300.png", 1, 1),
        transparent: true,
        roughness: 0.5,
        side: DoubleSide
      })
    );
    controllerRing.rotation.x = -Math.PI / 2;
    controllerRing.position.set(-6.7, 0.05, -1.5);
    this.archivePreviewGroup.add(controllerRing);

    const controllerTarget = new Mesh(
      new PlaneGeometry(0.9, 0.9),
      new MeshStandardMaterial({
        map: this.loadTexture("/assets/device-lab/CenterTarget.png", 1, 1),
        transparent: true,
        emissive: new Color("#4d1b80"),
        emissiveIntensity: 0.35,
        side: DoubleSide
      })
    );
    controllerTarget.rotation.x = -Math.PI / 2;
    controllerTarget.position.set(-6.7, 0.1, -1.5);
    controllerTarget.userData.spin = 0.16;
    this.archivePreviewGroup.add(controllerTarget);

    const robot = new Group();
    robot.position.set(0, 0.35, 0.8);
    const chassis = new Mesh(
      new BoxGeometry(4.2, 0.8, 3.5),
      new MeshStandardMaterial({ color: new Color("#d8e2e9"), metalness: 0.55, roughness: 0.28 })
    );
    chassis.castShadow = true;
    robot.add(chassis);
    for (const x of [-1.75, 1.75]) {
      for (const z of [-1.15, 1.15]) {
        const wheel = new Mesh(
          new CylinderGeometry(0.55, 0.55, 0.34, 20),
          new MeshStandardMaterial({ color: new Color("#151b24"), roughness: 0.82 })
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, -0.15, z);
        robot.add(wheel);
      }
    }
    const sensor = new Mesh(
      new BoxGeometry(1.4, 0.42, 0.35),
      new MeshStandardMaterial({ color: new Color("#66f5dc"), emissive: new Color("#134b46"), emissiveIntensity: 0.65 })
    );
    sensor.position.set(0, 0.72, -1.65);
    robot.add(sensor);
    this.archivePreviewGroup.add(robot);

    const radarVertices: number[] = [];
    for (let angle = 0; angle <= 180; angle += 10) {
      const radians = MathUtils.degToRad(angle);
      radarVertices.push(0, 0, 0, Math.cos(radians) * 5.2, 0, -Math.sin(radians) * 5.2);
    }
    const radar = new LineSegments(
      new BufferGeometry().setAttribute("position", new Float32BufferAttribute(radarVertices, 3)),
      new LineBasicMaterial({ color: new Color("#6cf5ff"), transparent: true, opacity: 0.42 })
    );
    radar.position.set(0, 0.08, -1.1);
    this.archivePreviewGroup.add(radar);

    const ioMaterialOff = new MeshStandardMaterial({ color: new Color("#25313e"), emissive: new Color("#071019") });
    for (let index = 0; index < 8; index += 1) {
      const lamp = new Mesh(new SphereGeometry(0.34, 18, 12), ioMaterialOff.clone());
      lamp.position.set(4.8 + (index % 4) * 1.05, 0.42, -2.9 + Math.floor(index / 4) * 1.15);
      lamp.userData.bob = 1.2 + index * 0.08;
      lamp.userData.baseY = lamp.position.y;
      this.archivePreviewGroup.add(lamp);
    }

    const openIcon = new Mesh(
      new PlaneGeometry(2.2, 2.2),
      new MeshStandardMaterial({ map: this.loadTexture("/assets/device-lab/OpenedIcon.bmp", 1, 1), side: DoubleSide, roughness: 0.7 })
    );
    openIcon.rotation.x = -Math.PI / 2;
    openIcon.position.set(7.1, 0.04, 2.5);
    this.archivePreviewGroup.add(openIcon);

    const closedIcon = new Mesh(
      new PlaneGeometry(2.2, 2.2),
      new MeshStandardMaterial({ map: this.loadTexture("/assets/device-lab/ClosedIc.bmp", 1, 1), side: DoubleSide, roughness: 0.7 })
    );
    closedIcon.rotation.x = -Math.PI / 2;
    closedIcon.position.set(4.55, 0.04, 2.5);
    this.archivePreviewGroup.add(closedIcon);

    const keyLight = new PointLight("#7df5e4", 16, 28, 2);
    keyLight.position.set(-2, 8, 1);
    this.archivePreviewGroup.add(keyLight);
  }

  private teardownPhysicsLab(): void {
    if (!this.physicsLab) {
      return;
    }
    for (const constraint of this.physicsLab.constraints) {
      this.physics.removeConstraint(constraint);
    }
    for (const pair of this.physicsLab.pairs) {
      this.physics.removeBody(pair.body);
    }
    for (const body of this.physicsLab.staticBodies) {
      this.physics.removeBody(body);
    }
    this.physicsLab = null;
  }

  private buildPhysicsLabPreview(): void {
    // park the (invisible) player ball far away so it can't disturb the lab
    setBodyTransform(this.playerBody, new Vector3(400, 2, 400));

    const pairs: Array<{ mesh: Mesh; body: PhysicsBody }> = [];
    const staticBodies: PhysicsBody[] = [];
    const constraints: PhysicsConstraint[] = [];

    const addPair = (mesh: Mesh, body: PhysicsBody): void => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.archivePreviewGroup.add(mesh);
      pairs.push({ mesh, body });
    };

    // ground plate
    const plate = new Mesh(
      new BoxGeometry(22, 0.4, 16),
      new MeshStandardMaterial({ map: this.loadTexture("/assets/textures/Damier.jpg", 6, 4), roughness: 0.85, metalness: 0.05 })
    );
    plate.position.set(0, -0.2, 0);
    plate.receiveShadow = true;
    this.archivePreviewGroup.add(plate);
    staticBodies.push(this.physics.addStaticBox(new Vector3(0, -0.2, 0), new Vector3(11, 0.2, 8)));

    // pendulum chain — Newton distance joints
    const anchor = this.physics.addStaticBox(new Vector3(-6, 7.2, 0), new Vector3(0.2, 0.2, 0.2));
    staticBodies.push(anchor);
    const anchorMesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshStandardMaterial({ color: new Color("#8b96a5"), metalness: 0.5, roughness: 0.35 }));
    anchorMesh.position.set(-6, 7.2, 0);
    this.archivePreviewGroup.add(anchorMesh);

    let previous: PhysicsBody = anchor;
    for (let link = 0; link < 4; link++) {
      const y = 6.2 - link * 1.05;
      const body = this.physics.addDynamicSphere(new Vector3(-6, y, 0), 0.34, link === 3 ? 2.6 : 0.7);
      const mesh = new Mesh(
        new SphereGeometry(link === 3 ? 0.5 : 0.34, 20, 14),
        new MeshStandardMaterial({ color: new Color(link === 3 ? "#f95f4c" : "#c9d4df"), metalness: 0.45, roughness: 0.3 })
      );
      addPair(mesh, body);
      constraints.push(
        this.physics.addSphericalConstraint(
          previous,
          body,
          new Vector3(0, -0.525, 0),
          new Vector3(0, 0.525, 0)
        )
      );
      previous = body;
    }
    // give the chain a starting swing
    this.physics.writeLinearVelocity(previous, new Vector3(4.5, 0, 0));

    // seesaw — Newton hinge joint
    const post = new Mesh(new BoxGeometry(0.4, 1.2, 0.4), new MeshStandardMaterial({ color: new Color("#6b4a2f"), roughness: 0.7 }));
    post.position.set(3, 0.6, 0);
    post.castShadow = true;
    this.archivePreviewGroup.add(post);
    const postBody = this.physics.addStaticBox(new Vector3(3, 0.6, 0), new Vector3(0.2, 0.6, 0.2));
    staticBodies.push(postBody);

    const plankBody = this.physics.addDynamicBox(new Vector3(3, 1.35, 0), new Vector3(2.6, 0.09, 0.55), 1.6);
    const plankMesh = new Mesh(
      new BoxGeometry(5.2, 0.18, 1.1),
      new MeshStandardMaterial({ map: this.loadTexture("/assets/textures/Eroded scratch metal.jpg", 2, 1), roughness: 0.5, metalness: 0.3 })
    );
    addPair(plankMesh, plankBody);
    constraints.push(
      this.physics.addRevoluteConstraint(
        postBody,
        plankBody,
        new Vector3(0, 0.75, 0),
        new Vector3(0, 0, 0),
        new Vector3(0, 0, 1)
      )
    );

    // rigid box stack
    const stackMaterial = new MeshStandardMaterial({ map: this.loadTexture("/assets/textures/CubeUV.png", 1, 1), roughness: 0.6 });
    for (let level = 0; level < 4; level++) {
      const body = this.physics.addDynamicBox(new Vector3(7.6, 0.45 + level * 0.92, -2.2), new Vector3(0.44, 0.44, 0.44), 0.8);
      addPair(new Mesh(new BoxGeometry(0.88, 0.88, 0.88), stackMaterial), body);
    }

    // wrecking ball — drops onto the seesaw end, then respawns
    const ballBody = this.physics.addDynamicSphere(new Vector3(5.1, 8.5, 0), 0.55, 4.2);
    const ballMesh = new Mesh(
      new SphereGeometry(0.55, 24, 16),
      new MeshStandardMaterial({ color: new Color("#3d434c"), metalness: 0.75, roughness: 0.25 })
    );
    addPair(ballMesh, ballBody);

    this.physicsLab = { pairs, staticBodies, constraints, wreckingBall: { body: ballBody, home: new Vector3(5.1, 8.5, 0) } };
  }

  private updatePhysicsLab(deltaSeconds: number): void {
    if (!this.physicsLab) {
      return;
    }
    this.physics.step(deltaSeconds);
    for (const pair of this.physicsLab.pairs) {
      syncBodyToMesh(pair.body, pair.mesh);
    }
    const ball = this.physicsLab.wreckingBall;
    if (ball && this.readBodyPosition(ball.body).y < -6) {
      setBodyTransform(ball.body, ball.home);
    }
  }

  private buildAirplaneFlyer(): void {
    if (!this.ensureLegacyData(["assets"])) {
      return;
    }
    const asset = (assetCatalog.assets as Array<{ id: string; meshes: Array<{ positions: number[]; indices: number[]; color: number[] | null }> }>).find(
      (candidate) => candidate.id === "airplane"
    );
    if (!asset || asset.meshes.length === 0) {
      return;
    }

    const meshData = asset.meshes[0];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < meshData.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], meshData.positions[i + axis]);
        max[axis] = Math.max(max[axis], meshData.positions[i + axis]);
      }
    }
    const center = new Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const local = new Array<number>(meshData.positions.length);
    for (let i = 0; i < meshData.positions.length; i += 3) {
      local[i] = meshData.positions[i] - center.x;
      local[i + 1] = meshData.positions[i + 1] - center.y;
      local[i + 2] = meshData.positions[i + 2] - center.z;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(local, 3));
    geometry.setIndex(meshData.indices);
    geometry.computeVertexNormals();

    const rgb = meshData.color;
    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({
        color: rgb ? new Color(rgb[0], rgb[1], rgb[2]) : new Color("#d8dde4"),
        roughness: 0.42,
        metalness: 0.3,
        side: DoubleSide
      })
    );
    mesh.name = "Legacy.AirplaneFlyer";
    mesh.castShadow = true;
    this.worldGroup.add(mesh);

    // legacy Spline.xml flight path, recentered above the arena
    const rawPoints = (assetCatalog.airplaneSpline as number[][]).map((point) => new Vector3(point[0], point[1], point[2]));
    const splineCenter = rawPoints.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(Math.max(1, rawPoints.length));
    const arenaRadius = Math.max(18, (this.race.bounds.maxX - this.race.bounds.minX) * 0.62);
    let maxDistance = 0.001;
    for (const point of rawPoints) {
      maxDistance = Math.max(maxDistance, Math.hypot(point.x - splineCenter.x, point.z - splineCenter.z));
    }
    const splineScale = arenaRadius / maxDistance;
    const curvePoints = rawPoints.map((point) =>
      point.clone().sub(splineCenter).multiplyScalar(splineScale).add(new Vector3(0, 15, 0))
    );
    const curve = new CatmullRomCurve3(curvePoints, true, "catmullrom", 0.65);
    this.airplaneFlyer = { mesh, curve };
  }

  private updateAtmosphere(elapsedSeconds: number): void {
    const baseAmbient = this.baseAmbientLight;
    if (this.race.classicStyle && this.atmosphereRig && baseAmbient) {
      const style = getClassicLevelStyle(this.race.classicStyle);
      if (this.sunSprite) {
        this.sunSprite.visible = false;
      }
      baseAmbient.color.set(style.lighting.fillColor);
      baseAmbient.intensity = style.lighting.ambientIntensity;
      this.atmosphereRig.key.color.set(style.lighting.keyColor);
      this.atmosphereRig.key.intensity = style.lighting.keyIntensity;
      this.atmosphereRig.key.position.set(-14, 24, 18);
      this.atmosphereRig.hemi.color.set(style.lighting.keyColor);
      this.atmosphereRig.hemi.groundColor.set(style.lighting.fillColor);
      this.atmosphereRig.hemi.intensity = style.lighting.ambientIntensity;
      this.atmosphereRig.rim.color.set(style.lighting.fillColor);
      this.atmosphereRig.rim.intensity = Math.max(0.22, style.lighting.ambientIntensity * 0.72);
      return;
    }

    const config = this.race.atmosphere;
    if (!config || !this.atmosphereRig) {
      if (this.sunSprite) {
        this.sunSprite.visible = false;
      }
      if (baseAmbient) {
        baseAmbient.color.set("#6f8fb8");
        baseAmbient.intensity = 0.18;
      }
      if (this.atmosphereRig) {
        // restore the static lighting defaults for non-atmosphere races
        this.atmosphereRig.key.intensity = 2.2;
        this.atmosphereRig.key.color.set("#ffffff");
        this.atmosphereRig.key.position.set(-12, 24, 16);
        this.atmosphereRig.hemi.intensity = 0.92;
        this.atmosphereRig.rim.intensity = 1.35;
      }
      return;
    }

    // Phase R1.3 — the ORIGINAL AtmelCubx/Atmosphere.cpp curves:
    //   sunY = R·sin(2π·t/day − π/2) + offset; sky alpha = ((sunY+R−off)/2R)·2 capped;
    //   sun brightness = logistic 1/(1+e^(−(a−0.6)/0.05)); ambient = a·0.2
    const phase = ((elapsedSeconds % config.cycleSeconds) / config.cycleSeconds) * Math.PI * 2 - Math.PI / 2;
    const sunHeight = Math.sin(phase); // normalized sunY/R, offset 0.2 like iSunOrbitYOffset/R
    const day = MathUtils.clamp(((sunHeight + 1 - 0.2) / 2) * 2, 0, 1);
    const brightness = 1 / (1 + Math.exp(-(day - 0.6) / 0.05));
    const ambient = day * 0.2;
    const horizonWarmth = MathUtils.clamp(1 - Math.abs(sunHeight) * 1.7, 0, 1);

    const { key, rim, hemi } = this.atmosphereRig;
    key.intensity = 0.12 + brightness * 2.1;
    key.color.setRGB(1, 1 - horizonWarmth * 0.32, 1 - horizonWarmth * 0.55);
    hemi.intensity = 0.2 + ambient * 3.6;
    rim.intensity = 0.32 + brightness * 1.0;

    const sunDirection = new Vector3(Math.cos(phase) * 0.55, sunHeight, Math.sin(phase)).normalize();
    key.position.copy(sunDirection).multiplyScalar(30);

    if (this.sunSprite) {
      this.sunSprite.visible = sunHeight > -0.12;
      this.sunSprite.position.copy(this.camera.position).add(sunDirection.clone().multiplyScalar(140));
      const material = this.sunSprite.material as SpriteMaterial;
      material.opacity = MathUtils.clamp(0.15 + brightness * 0.85, 0, 1);
    }

    if (this.scene.fog instanceof Fog) {
      this.scene.fog.color.copy(new Color("#0b1018")).lerp(new Color(this.race.palette.fog), day);
    }
  }

  private addBox(spec: RaceBox): void {
    const geometry = new BoxGeometry(...spec.size);
    const mesh = new Mesh(geometry, this.createBoxMaterials(spec, geometry));
    mesh.name = spec.name;
    mesh.position.set(...spec.position);
    mesh.castShadow = spec.size[1] > 0.5;
    mesh.receiveShadow = true;
    this.worldGroup.add(mesh);

    if (spec.physics) {
      const halfExtents = new Vector3(spec.size[0] / 2, spec.size[1] / 2, spec.size[2] / 2);
      this.staticBodies.push(this.physics.addStaticBox(new Vector3(...spec.position), halfExtents));
    }
  }

  private addMarker(marker: RaceMarker): void {
    const isPost = marker.kind === "red-post" || marker.kind === "blue-post";
    const material = new MeshStandardMaterial({
      color: new Color(marker.kind === "red-post" ? "#e90000" : marker.kind === "blue-post" ? "#001dff" : "#3a1e18"),
      emissive: new Color(marker.kind === "red-post" ? "#3a0000" : marker.kind === "blue-post" ? "#00004f" : "#120704"),
      roughness: 0.42,
      metalness: marker.kind === "dark-cube" ? 0.18 : 0.34
    });
    const mesh = isPost
      ? new Mesh(new CylinderGeometry(marker.radius ?? 0.32, marker.radius ?? 0.32, marker.height ?? 1.8, 18), material)
      : new Mesh(new BoxGeometry(...(marker.size ?? [0.8, 0.8, 0.8])), material);
    mesh.name = marker.name;
    mesh.position.set(...marker.position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.worldGroup.add(mesh);

    if (marker.physics) {
      const halfExtents = isPost
        ? new Vector3(marker.radius ?? 0.32, (marker.height ?? 1.8) / 2, marker.radius ?? 0.32)
        : new Vector3((marker.size ?? [0.8, 0.8, 0.8])[0] / 2, (marker.size ?? [0.8, 0.8, 0.8])[1] / 2, (marker.size ?? [0.8, 0.8, 0.8])[2] / 2);
      this.staticBodies.push(this.physics.addStaticBox(new Vector3(...marker.position), halfExtents));
    }
  }

  private createBoxMaterials(
    spec: RaceBox,
    geometry: BoxGeometry
  ): MeshStandardMaterial | MeshPhysicalMaterial | Array<MeshStandardMaterial | MeshPhysicalMaterial> {
    const classicStyle = this.race.classicStyle ? getClassicLevelStyle(this.race.classicStyle) : null;
    if (classicStyle && spec.name.endsWith("-authored-floor")) {
      const top = new MeshStandardMaterial({
        map: this.loadTexture(
          classicStyle.floor.diffuse,
          classicStyle.floor.repeat[0],
          classicStyle.floor.repeat[1]
        ),
        normalMap: classicStyle.floor.normal
          ? this.loadTexture(
              classicStyle.floor.normal,
              classicStyle.floor.repeat[0],
              classicStyle.floor.repeat[1],
              false
            )
          : null,
        color: new Color("#ffffff"),
        roughness: 0.88,
        metalness: 0.02
      });
      const side = new MeshStandardMaterial({
        color: new Color(this.race.palette.floor).multiplyScalar(0.52),
        roughness: 0.94,
        metalness: 0.02
      });
      return [side, side, top, side, side, side];
    }

    if (classicStyle && spec.name.includes("-tile-")) {
      const tileRepeatX = Math.max(1, spec.size[0] / classicStyle.layout.tileSize);
      const tileRepeatZ = Math.max(1, spec.size[2] / classicStyle.layout.tileSize);
      const tileRepeatY = Math.max(1, spec.size[1] / classicStyle.layout.tileHeight);
      const material = (path: string, repeatX: number, repeatY: number) =>
        new MeshStandardMaterial({
          map: this.loadTexture(path, repeatX, repeatY),
          normalMap: classicStyle.tiles.normal
            ? this.loadTexture(classicStyle.tiles.normal, repeatX, repeatY, false)
            : null,
          color: new Color("#ffffff"),
          roughness: 0.72,
          metalness: 0.06
        });
      const rightLeft = material(classicStyle.tiles.sides, tileRepeatZ, tileRepeatY);
      const top = material(classicStyle.tiles.top, tileRepeatX, tileRepeatZ);
      const bottom = material(classicStyle.tiles.sides, tileRepeatX, tileRepeatZ);
      const frontBack = material(classicStyle.tiles.sides, tileRepeatX, tileRepeatY);
      return [rightLeft, rightLeft, top, bottom, frontBack, frontBack];
    }

    const tileSizeByKey: Partial<Record<RaceMaterialKey, number>> = {
      grid: 2.4,
      damier: 1.4,
      "abstract-cubes": 2.2,
      "arrow-gold": 2.25,
      "arrow-brown": 2.25,
      "checker-dark": 1.4,
      "purple-grid": 2.2,
      "gold-wall": 2.5,
      "dark-wall": 2.5,
      finish: 1.2,
      danger: 1.6
    };
    const base = this.createMaterial(spec.material);
    if (!base.map) {
      return base;
    }

    const shouldSlice =
      spec.size[1] >= 0.28 &&
      ["arrow-gold", "arrow-brown", "checker-dark", "purple-grid", "gold-wall", "dark-wall"].includes(spec.material);
    const sideKey = spec.material === "arrow-gold" || spec.material === "gold-wall" ? "gold-wall" : "dark-wall";
    const sideMaterialKey = shouldSlice ? sideKey : spec.material;
    const rightLeft = this.createMaterial(sideMaterialKey);
    const top = base;
    const bottom = this.createMaterial(sideMaterialKey);
    const frontBack = this.createMaterial(sideMaterialKey);
    const materials = [rightLeft, rightLeft, top, bottom, frontBack, frontBack];
    const faceLayout: Array<{ key: RaceMaterialKey; width: number; height: number }> = [
      { key: sideMaterialKey, width: spec.size[2], height: spec.size[1] },
      { key: sideMaterialKey, width: spec.size[2], height: spec.size[1] },
      { key: spec.material, width: spec.size[0], height: spec.size[2] },
      { key: sideMaterialKey, width: spec.size[0], height: spec.size[2] },
      { key: sideMaterialKey, width: spec.size[0], height: spec.size[1] },
      { key: sideMaterialKey, width: spec.size[0], height: spec.size[1] }
    ];
    const uvs = geometry.getAttribute("uv");
    const index = geometry.getIndex();

    // BoxGeometry gives every face its own UV vertices. Scale those UVs in
    // world units instead of cloning an image texture for every face. Texture
    // clones created while an image was still loading produced empty uploads
    // and intermittent missing surfaces during fast world changes.
    geometry.groups.forEach((group, faceIndex) => {
      const material = materials[faceIndex];
      const layout = faceLayout[faceIndex];
      if (!material?.map || !layout) {
        return;
      }
      const tileSize = tileSizeByKey[layout.key] ?? 2.2;
      const scaleU = Math.max(1, layout.width / tileSize) / material.map.repeat.x;
      const scaleV = Math.max(1, layout.height / tileSize) / material.map.repeat.y;
      for (let offset = group.start; offset < group.start + group.count; offset += 1) {
        const vertex = index ? index.getX(offset) : offset;
        uvs.setXY(vertex, uvs.getX(vertex) * scaleU, uvs.getY(vertex) * scaleV);
      }
    });
    uvs.needsUpdate = true;
    return materials;
  }

  private buildRaceGate(group: Group, kind: "halfway" | "finish", color: Color, label: string): void {
    const segment = this.race.gateSegments?.[kind];
    if (!segment) {
      this.buildGate(group, new Vector3(0, 0, kind === "halfway" ? this.race.halfwayZ : this.race.finishZ), color, label);
      return;
    }

    const dx = segment[1][0] - segment[0][0];
    const dz = segment[1][2] - segment[0][2];
    const width = Math.max(2, Math.hypot(dx, dz));
    const oriented = new Group();
    oriented.position.set(
      (segment[0][0] + segment[1][0]) / 2,
      0,
      (segment[0][2] + segment[1][2]) / 2
    );
    oriented.rotation.y = -Math.atan2(dz, dx);
    group.add(oriented);
    this.buildGate(oriented, new Vector3(), color, label, width);
  }

  private buildGate(group: Group, position: Vector3, color: Color, label: string, width = 8.4): void {
    const material = new MeshStandardMaterial({
      color,
      emissive: color.clone().multiplyScalar(0.28),
      roughness: 0.36,
      metalness: 0.3
    });

    for (const x of [-width / 2, width / 2]) {
      const post = new Mesh(new CylinderGeometry(0.22, 0.22, 3.1, 14), material);
      post.position.set(position.x + x, 1.55, position.z);
      group.add(post);
    }

    const beam = new Mesh(new BoxGeometry(width + 0.4, 0.24, 0.24), material);
    beam.position.set(position.x, 3.05, position.z);
    group.add(beam);

    if (label === "FINISH") {
      const strip = new Mesh(new BoxGeometry(Math.max(1.2, width - 1), 0.05, 0.8), this.createMaterial("finish"));
      strip.position.set(position.x, 0.16, position.z);
      group.add(strip);
    }
  }

  private createRaceRing(spec: RaceRing): Mesh {
    const baseYaw = spec.yaw ?? 0;
    const scale = spec.scale ?? 1;
    if (["green-grid-run", "rotator-cube-works", "piston-gateworks"].includes(this.race.id)) {
      const archiveBall = new Mesh(
        new SphereGeometry(0.5, 28, 18),
        new MeshStandardMaterial({
          color: new Color("#f4f2e8"),
          emissive: new Color("#302511"),
          emissiveIntensity: 0.18,
          roughness: 0.34,
          metalness: 0.12
        })
      );
      archiveBall.name = "ArchiveWhiteBallCheckpoint";
      archiveBall.position.set(...spec.position);
      archiveBall.rotation.set(0, baseYaw, 0);
      archiveBall.scale.setScalar(scale);
      archiveBall.castShadow = true;
      archiveBall.userData.baseYaw = baseYaw;
      archiveBall.userData.phase = spec.position[0] * 0.37 + spec.position[2] * 0.19;
      archiveBall.userData.spin = 0.72 + (Math.abs(spec.position[0]) % 3) * 0.06;
      const seam = new Mesh(
        new TorusGeometry(0.505, 0.026, 8, 48),
        new MeshBasicMaterial({ color: new Color("#d98b2b") })
      );
      seam.rotation.x = Math.PI / 2;
      seam.rotation.y = Math.PI / 5;
      const glint = new Mesh(
        new SphereGeometry(0.095, 12, 8),
        new MeshBasicMaterial({ color: new Color("#ffffff"), transparent: true, opacity: 0.82 })
      );
      glint.position.set(-0.19, 0.28, 0.39);
      archiveBall.add(seam, glint);
      return archiveBall;
    }
    const ringColor = new Color("#fff7d6");
    const accentColor = new Color(this.race.palette.accent);
    const ring = new Mesh(
      this.getLegacyRingGeometry() ?? new TorusGeometry(0.62, 0.07, 14, 56),
      new MeshStandardMaterial({
        color: ringColor,
        emissive: accentColor.clone().multiplyScalar(0.32),
        roughness: 0.18,
        metalness: 0.42
      })
    );
    ring.name = "RaceCheckpointRing";
    ring.position.set(...spec.position);
    ring.rotation.set(0, baseYaw, 0);
    ring.scale.setScalar(scale);
    ring.castShadow = true;
    ring.userData.baseYaw = baseYaw;
    ring.userData.phase = spec.position[0] * 0.37 + spec.position[2] * 0.19;
    ring.userData.spin = 1.15 + (Math.abs(spec.position[0]) % 3) * 0.08;

    const outerEdge = new Mesh(
      new TorusGeometry(0.75, 0.018, 8, 56),
      new MeshBasicMaterial({
        color: ringColor,
        transparent: true,
        opacity: 0.92
      })
    );
    const innerEdge = new Mesh(
      new TorusGeometry(0.48, 0.014, 8, 48),
      new MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.82
      })
    );
    const crossLoop = new Mesh(
      new TorusGeometry(0.62, 0.026, 8, 48),
      new MeshBasicMaterial({
        color: ringColor,
        transparent: true,
        opacity: 0.46
      })
    );
    crossLoop.rotation.y = Math.PI / 2;
    const aura = new Mesh(
      new RingGeometry(0.46, 0.86, 64),
      new MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.22,
        side: DoubleSide,
        blending: AdditiveBlending,
        depthWrite: false
      })
    );
    aura.position.z = -0.012;
    outerEdge.position.z = 0.018;
    innerEdge.position.z = 0.032;
    ring.add(aura, outerEdge, innerEdge, crossLoop);
    return ring;
  }

  private applyGateAccent(): void {
    for (const child of this.finishGate.children) {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        child.material.color.copy(this.accent);
        child.material.emissive.copy(this.accent).multiplyScalar(0.28);
      }
    }
  }

  private createMenuCube(): void {
    this.menuCube.name = "RotatingArchiveCubeMenu";
    const core = new Mesh(
      new BoxGeometry(4.4, 4.4, 4.4),
      new MeshPhysicalMaterial({
        color: new Color("#20344a"),
        roughness: 0.18,
        metalness: 0.24,
        transparent: true,
        opacity: 0.72,
        clearcoat: 0.8
      })
    );
    const wire = new LineSegments(
      new WireframeGeometry(new BoxGeometry(4.6, 4.6, 4.6)),
      new LineBasicMaterial({ color: new Color("#78f0d0"), transparent: true, opacity: 0.78 })
    );
    const orb = new Mesh(
      new IcosahedronGeometry(1.35, 1),
      new MeshStandardMaterial({ color: new Color("#f95f4c"), roughness: 0.4, metalness: 0.2 })
    );
    this.menuCube.add(core, wire, orb);
    this.menuCube.position.set(0, 4.2, 0);
  }

  private rebuildArchivePreview(): void {
    this.teardownCommonRoomEnvironment();
    this.teardownRecoveredArchiveEnvironments();
    this.teardownArchiveSelectors();
    this.teardownNatureLab();
    this.teardownAgentWorld();
    this.teardownParticlePresetLibraryEnvironment();
    this.teardownCubxActorLineage();
    this.archivePreviewGroup.clear();
    this.cubxMenu = null;
    this.archivePreviewGroup.position.set(0, 0, 0);
    this.archivePreviewGroup.rotation.set(0, 0, 0);
    this.teardownPhysicsLab();

    if (this.previewMode === "menu" || this.previewMode === "race-preview") {
      return;
    }

    if (this.previewMode === "common-room-lab") {
      this.buildCommonRoomEnvironmentPreview();
      return;
    }

    if (this.previewMode === "ballz-2011-level1") {
      this.buildBallz2011Level1Preview();
      return;
    }

    if (this.previewMode === "ballz-slide1") {
      this.buildBallzSlide1Preview();
      return;
    }
    if (this.previewMode === "ballz-track-gallery") {
      this.buildBallzTrackGalleryPreview();
      return;
    }

    if (this.previewMode === "xml-myworld-copy") {
      this.buildXmlScenePreview();
      return;
    }

    if (this.previewMode === "ballz-xml-worlds") {
      this.buildBallzXmlWorldsPreview();
      return;
    }

    if (this.previewMode === "xml-serializer-artifacts") {
      this.buildStockroomXmlArtifactPreview();
      return;
    }

    if (this.previewMode === "vehicle-pack-gallery") {
      this.buildVehiclePackPreview();
      return;
    }

    if (this.previewMode === "object-library-catalog") {
      this.buildObjectLibraryCatalogPreview();
      return;
    }
    if (this.previewMode === "dominus-asset-gallery") {
      this.buildDominusAssetGalleryPreview();
      return;
    }
    if (this.previewMode === "dominus-port-evidence") {
      this.buildDominusPortEvidencePreview();
      return;
    }
    if (this.previewMode === "threejs-playground") {
      this.buildThreejsPlaygroundPreview();
      return;
    }
    if (this.previewMode === "ballz-blender-level1") {
      this.buildBallzBlenderLevel1Preview();
      return;
    }
    if (this.previewMode === "maison-explorer") {
      this.buildMaisonExplorerPreview();
      return;
    }
    if (this.previewMode === "arena-archive") {
      this.buildArenaArchivePreview();
      return;
    }
    if (this.previewMode === "cubx-actor-lineage") {
      this.scene.background = new Color("#071019");
      this.scene.environment = null;
      this.scene.fog = new Fog("#071019", 210, 430);
      this.camera.fov = 42;
      this.camera.updateProjectionMatrix();
      this.buildCubxActorLineagePreview();
      return;
    }

    if (this.previewMode === "suzanne2-archive") {
      this.buildSuzanne2Preview();
      return;
    }

    if (this.previewMode === "notes-manager-lab") {
      this.buildNotesManagerPreview();
      return;
    }

    if (this.previewMode === "milky-way-lab") {
      this.buildMilkyWayPreview();
      return;
    }

    if (this.previewMode === "skybox-selector") {
      this.buildSkyboxSelectorPreview();
      return;
    }

    if (this.previewMode === "car-selector") {
      this.buildCarSelectorPreview();
      return;
    }

    if (this.previewMode === "physics-lab") {
      this.buildPhysicsLabPreview();
      return;
    }

    if (this.previewMode === "input-device-lab") {
      this.buildInputDeviceLabPreview();
      return;
    }

    if (this.previewMode === "nature-lab") {
      this.buildNatureLabPreview();
      return;
    }

    if (this.previewMode === "world-api-lab") {
      this.buildAgentWorldPreview();
      return;
    }

    if (this.previewMode === "scene-lab") {
      this.buildSceneLabPreview();
      return;
    }

    if (this.previewMode === "game-lab") {
      this.buildGameLabPreview();
      return;
    }

    if (this.previewMode === "map-editor") {
      this.buildMapEditorPreview();
      return;
    }

    if (this.previewMode === "math-lab") {
      this.buildMathLabPreview();
      return;
    }

    if (this.previewMode === "editor-lab") {
      this.buildEditorLabPreview();
      return;
    }

    if (this.previewMode === "cubx-lab") {
      this.buildCubXLabPreview();
      return;
    }

    this.buildAssetCatalogPreview();
  }

  private buildCommonRoomEnvironmentPreview(): void {
    const room2 = new CommonRoomEnvironment();
    const archive = new CommonArchiveEnvironment({
      initialSpace: this.commonEnvironmentSelection === "sky-component" ? "sky-component" : "room1"
    });
    this.commonRoomEnvironment = room2;
    this.commonArchiveEnvironment = archive;
    this.archivePreviewGroup.add(room2.group, archive.group);
    room2.group.visible = this.commonEnvironmentSelection === "room2-shadow";
    archive.group.visible = this.commonEnvironmentSelection !== "room2-shadow";
    if (this.commonEnvironmentSelection === "room2-shadow") {
      room2.applyToCamera(this.camera);
    } else {
      archive.setActiveSpace(this.commonEnvironmentSelection, this.camera);
    }
    const notify = () => {
      if (this.commonRoomEnvironment === room2 && this.commonArchiveEnvironment === archive && this.previewMode === "common-room-lab") {
        this.options.onCommonRoomStateChanged?.();
      }
    };
    room2.ready.then(notify).catch(notify);
    archive.ready.then(notify).catch(notify);
  }

  private teardownCommonRoomEnvironment(): void {
    this.commonRoomEnvironment?.dispose();
    this.commonRoomEnvironment = null;
    this.commonArchiveEnvironment?.dispose();
    this.commonArchiveEnvironment = null;
  }

  private buildBallz2011Level1Preview(): void {
    const environment = new Ballz2011Level1Environment({ showEdges: true, showBounds: false });
    this.ballz2011Level1Environment = environment;
    this.archivePreviewGroup.add(environment.group);
  }

  private buildBallzSlide1Preview(): void {
    const environment = new BallzSlide1Environment({ includeSourceLighting: true, showBall: true, showEdges: true, showBounds: false });
    this.ballzSlide1Environment = environment;
    this.archivePreviewGroup.add(environment.group);
  }

  private buildXmlScenePreview(): void {
    const environment = new XmlSceneEnvironment();
    this.xmlSceneEnvironment = environment;
    this.archivePreviewGroup.add(environment.group);
    environment.applyToCamera(this.camera);
    environment.ready
      .then(() => {
        if (this.xmlSceneEnvironment === environment && this.previewMode === "xml-myworld-copy") {
          this.options.onArchiveSelectorStateChanged?.();
        }
      })
      .catch(() => {
        if (this.xmlSceneEnvironment === environment && this.previewMode === "xml-myworld-copy") {
          this.options.onArchiveSelectorStateChanged?.();
        }
      });
  }

  private buildBallzXmlWorldsPreview(): void {
    void import("./ballz-xml-worlds-environment").then(({ BallzXmlWorldsEnvironment }) => {
      if (this.previewMode !== "ballz-xml-worlds" || this.ballzXmlWorldsEnvironment) return;
      const environment = new BallzXmlWorldsEnvironment({ initialScene: "myworld" });
      this.ballzXmlWorldsEnvironment = environment;
      this.archivePreviewGroup.add(environment.group);
      environment.applyToCamera(this.camera);
      environment.ready
        .then(() => {
          if (this.ballzXmlWorldsEnvironment === environment && this.previewMode === "ballz-xml-worlds") {
            environment.applyToCamera(this.camera);
            this.options.onArchiveSelectorStateChanged?.();
          }
        })
        .catch(() => {
          if (this.ballzXmlWorldsEnvironment === environment && this.previewMode === "ballz-xml-worlds") {
            this.options.onArchiveSelectorStateChanged?.();
          }
        });
    });
  }

  private buildStockroomXmlArtifactPreview(): void {
    void import("./stockroom-xml-artifact-environment").then(({ StockroomXmlArtifactEnvironment }) => {
      if (this.previewMode !== "xml-serializer-artifacts" || this.stockroomXmlArtifactEnvironment) return;
      const environment = new StockroomXmlArtifactEnvironment();
      this.stockroomXmlArtifactEnvironment = environment;
      this.archivePreviewGroup.add(environment.group);
      environment.applyToCamera(this.camera);
      environment.ready
        .then(() => {
          if (this.stockroomXmlArtifactEnvironment === environment && this.previewMode === "xml-serializer-artifacts") {
            environment.applyToCamera(this.camera);
            this.options.onArchiveSelectorStateChanged?.();
          }
        })
        .catch(() => {
          if (this.stockroomXmlArtifactEnvironment === environment && this.previewMode === "xml-serializer-artifacts") {
            this.options.onArchiveSelectorStateChanged?.();
          }
        });
    });
  }

  private buildVehiclePackPreview(): void {
    void import("./vehicle-pack-environment").then(({ VehiclePackEnvironment }) => {
      if (this.previewMode !== "vehicle-pack-gallery" || this.vehiclePackEnvironment) return;
      const environment = new VehiclePackEnvironment();
      this.vehiclePackEnvironment = environment;
      this.archivePreviewGroup.add(environment.group);
      environment.applyToCamera(this.camera);
      environment.ready
        .then(() => {
          if (this.vehiclePackEnvironment === environment && this.previewMode === "vehicle-pack-gallery") {
            environment.applyToCamera(this.camera);
            this.options.onArchiveSelectorStateChanged?.();
          }
        })
        .catch(() => {
          if (this.vehiclePackEnvironment === environment && this.previewMode === "vehicle-pack-gallery") {
            this.options.onArchiveSelectorStateChanged?.();
          }
        });
    });
  }

  private buildObjectLibraryCatalogPreview(): void {
    void import("./object-library-catalog-environment").then(({ ObjectLibraryCatalogEnvironment }) => {
      if (this.previewMode !== "object-library-catalog" || this.objectLibraryCatalogEnvironment) return;
      const environment = new ObjectLibraryCatalogEnvironment();
      this.objectLibraryCatalogEnvironment = environment;
      this.archivePreviewGroup.add(environment.group);
      environment.applyToCamera(this.camera);
      environment.ready
        .then(() => {
          if (this.objectLibraryCatalogEnvironment === environment && this.previewMode === "object-library-catalog") {
            environment.applyToCamera(this.camera);
            this.options.onArchiveSelectorStateChanged?.();
          }
        })
        .catch(() => {
          if (this.objectLibraryCatalogEnvironment === environment && this.previewMode === "object-library-catalog") {
            this.options.onArchiveSelectorStateChanged?.();
          }
        });
    });
  }

  private buildBallzTrackGalleryPreview(): void {
    void import("./ballz-track-gallery-environment").then(({ BallzTrackGalleryEnvironment }) => {
      if (this.previewMode !== "ballz-track-gallery" || this.ballzTrackGalleryEnvironment) return;
      const environment = new BallzTrackGalleryEnvironment();
      this.ballzTrackGalleryEnvironment = environment;
      this.ballzTrackGalleryCameraProfile = "overview";
      this.archivePreviewGroup.add(environment.group);
      this.applyBallzTrackGalleryCamera("overview");
      environment.ready
        .then(() => {
          if (this.ballzTrackGalleryEnvironment === environment && this.previewMode === "ballz-track-gallery") {
            this.options.onArchiveSelectorStateChanged?.();
          }
        })
        .catch(() => {
          if (this.ballzTrackGalleryEnvironment === environment && this.previewMode === "ballz-track-gallery") {
            this.options.onArchiveSelectorStateChanged?.();
          }
        });
    });
  }

  private applyBallzTrackGalleryCamera(profile: BallzTrackGalleryCameraProfile): void {
    if (!this.ballzTrackGalleryEnvironment) return;
    this.ballzTrackGalleryCameraProfile = profile;
    const next = this.ballzTrackGalleryEnvironment.getCameraProfile(profile);
    const position = new Vector3(...next.position);
    const target = new Vector3(...next.target);
    const offset = position.sub(target);
    this.cameraDistance = offset.length();
    this.cameraYaw = Math.atan2(offset.x, offset.z);
    this.cameraPitch = Math.asin(offset.y / Math.max(Number.EPSILON, this.cameraDistance));
    this.camera.fov = next.fovDegrees;
    this.camera.far = 500;
    this.camera.updateProjectionMatrix();
    this.updateVisitCamera(1, true);
  }

  private buildDominusAssetGalleryPreview(): void {
    void import("./dominus-asset-gallery-environment").then(({ DominusAssetGalleryEnvironment }) => {
      if (this.previewMode !== "dominus-asset-gallery" || this.dominusAssetGalleryEnvironment) return;
      const environment = new DominusAssetGalleryEnvironment();
      this.dominusAssetGalleryEnvironment = environment;
      this.archivePreviewGroup.add(environment.group);
      environment.applyToCamera(this.camera);
      environment.ready
        .then(() => {
          if (this.dominusAssetGalleryEnvironment === environment && this.previewMode === "dominus-asset-gallery") {
            environment.applyToCamera(this.camera);
            this.options.onArchiveSelectorStateChanged?.();
          }
        })
        .catch(() => {
          if (this.dominusAssetGalleryEnvironment === environment && this.previewMode === "dominus-asset-gallery") {
            this.options.onArchiveSelectorStateChanged?.();
          }
        });
    });
  }

  private buildDominusPortEvidencePreview(): void {
    void import("./dominus-port-evidence-environment").then(({ DominusPortEvidenceEnvironment }) => {
      if (this.previewMode !== "dominus-port-evidence" || this.dominusPortEvidenceEnvironment) return;
      const environment = new DominusPortEvidenceEnvironment();
      this.dominusPortEvidenceEnvironment = environment;
      this.archivePreviewGroup.add(environment.group);
      environment.applyToCamera(this.camera);
      environment.ready
        .then(() => {
          if (this.dominusPortEvidenceEnvironment === environment && this.previewMode === "dominus-port-evidence") {
            environment.applyToCamera(this.camera);
            this.options.onArchiveSelectorStateChanged?.();
          }
        })
        .catch(() => {
          if (this.dominusPortEvidenceEnvironment === environment && this.previewMode === "dominus-port-evidence") {
            this.options.onArchiveSelectorStateChanged?.();
          }
        });
    });
  }

  private buildThreejsPlaygroundPreview(): void {
    void import("./threejs-playground-environment").then(({ ThreejsPlaygroundEnvironment }) => {
      if (this.previewMode !== "threejs-playground" || this.threejsPlaygroundEnvironment) return;
      const environment = new ThreejsPlaygroundEnvironment();
      this.threejsPlaygroundEnvironment = environment;
      this.archivePreviewGroup.add(environment.group);
      environment.applyToCamera(this.camera);
      environment.ready
        .then(() => {
          if (this.threejsPlaygroundEnvironment === environment && this.previewMode === "threejs-playground") {
            environment.applyToCamera(this.camera);
            this.options.onArchiveSelectorStateChanged?.();
          }
        })
        .catch(() => {
          if (this.threejsPlaygroundEnvironment === environment && this.previewMode === "threejs-playground") {
            this.options.onArchiveSelectorStateChanged?.();
          }
        });
    });
  }

  private buildBallzBlenderLevel1Preview(): void {
    void import("./archive-blender-environments").then(({ BallzBlenderLevel1Environment }) => {
      if (this.previewMode !== "ballz-blender-level1" || this.ballzBlenderLevel1Environment) return;
      const environment = new BallzBlenderLevel1Environment();
      this.ballzBlenderLevel1Environment = environment;
      this.archivePreviewGroup.add(environment.group);
      environment.ready
        .then(() => {
          if (this.ballzBlenderLevel1Environment === environment && this.previewMode === "ballz-blender-level1") {
            environment.applyToCamera(this.camera);
            this.options.onArchiveSelectorStateChanged?.();
          }
        })
        .catch(() => this.options.onArchiveSelectorStateChanged?.());
    });
  }

  private buildMaisonExplorerPreview(): void {
    void import("./archive-blender-environments").then(({ MaisonExplorerEnvironment }) => {
      if (this.previewMode !== "maison-explorer" || this.maisonExplorerEnvironment) return;
      const environment = new MaisonExplorerEnvironment();
      this.maisonExplorerEnvironment = environment;
      this.archivePreviewGroup.add(environment.group);
      environment.ready
        .then(() => {
          if (this.maisonExplorerEnvironment === environment && this.previewMode === "maison-explorer") {
            environment.applyToCamera(this.camera);
            this.options.onArchiveSelectorStateChanged?.();
          }
        })
        .catch(() => this.options.onArchiveSelectorStateChanged?.());
    });
  }

  private buildArenaArchivePreview(): void {
    void import("./arena-archive-environment").then(({ ArenaArchiveEnvironment }) => {
      if (this.previewMode !== "arena-archive" || this.arenaArchiveEnvironment) return;
      const environment = new ArenaArchiveEnvironment();
      this.arenaArchiveEnvironment = environment;
      this.archivePreviewGroup.add(environment.group);
      environment.applyToCamera(this.camera);
      environment.ready
        .then(() => {
          if (this.arenaArchiveEnvironment === environment && this.previewMode === "arena-archive") {
            environment.applyToCamera(this.camera);
            this.options.onArchiveSelectorStateChanged?.();
          }
        })
        .catch(() => this.options.onArchiveSelectorStateChanged?.());
    });
  }

  private buildSuzanne2Preview(): void {
    void import("./suzanne2-ascii-environment").then(({ Suzanne2AsciiEnvironment }) => {
      if (this.previewMode !== "suzanne2-archive" || this.suzanne2Environment) return;
      const environment = new Suzanne2AsciiEnvironment({
        showCubxAnchors: false,
        showPlayer: true,
        showXmlAttachments: true
      });
      this.suzanne2Environment = environment;
      this.archivePreviewGroup.add(environment.group);
      environment.ready
        .then(() => {
          if (this.suzanne2Environment === environment && this.previewMode === "suzanne2-archive") {
            this.options.onArchiveSelectorStateChanged?.();
          }
        })
        .catch(() => {
          if (this.suzanne2Environment === environment && this.previewMode === "suzanne2-archive") {
            this.options.onArchiveSelectorStateChanged?.();
          }
        });
    });
  }

  private buildNotesManagerPreview(): void {
    const environment = new NotesManagerEnvironment();
    this.notesManagerEnvironment = environment;
    // Exact archive coordinates span y=-250..75. This reversible parent-only
    // presentation transform keeps both the add cube and note block visible.
    environment.group.scale.setScalar(0.04);
    environment.group.position.set(-6, 10, -3.6);
    this.archivePreviewGroup.add(environment.group);
    environment.ready.then(() => this.options.onArchiveSelectorStateChanged?.()).catch(() => this.options.onArchiveSelectorStateChanged?.());
  }

  private buildMilkyWayPreview(): void {
    this.mountMilkyWayEnvironment();
  }

  private mountMilkyWayEnvironment(): void {
    this.milkyWayEnvironment?.dispose();
    const environment = new MilkyWayEnvironment({ profile: this.milkyWayProfile });
    this.milkyWayEnvironment = environment;
    // Center the source-authored linear planet layout for an inspection visit;
    // planet transforms inside the group remain exact and are exposed in state.
    environment.group.position.set(40, -12, -10);
    this.archivePreviewGroup.add(environment.group);
    environment.ready.then(() => this.options.onArchiveSelectorStateChanged?.()).catch(() => this.options.onArchiveSelectorStateChanged?.());
  }

  private teardownRecoveredArchiveEnvironments(): void {
    this.ballz2011Level1Environment?.dispose();
    this.ballz2011Level1Environment = null;
    this.ballzSlide1Environment?.dispose();
    this.ballzSlide1Environment = null;
    this.ballzTrackGalleryEnvironment?.dispose();
    this.ballzTrackGalleryEnvironment = null;
    this.xmlSceneEnvironment?.dispose();
    this.xmlSceneEnvironment = null;
    this.ballzXmlWorldsEnvironment?.dispose();
    this.ballzXmlWorldsEnvironment = null;
    this.stockroomXmlArtifactEnvironment?.dispose();
    this.stockroomXmlArtifactEnvironment = null;
    this.vehiclePackEnvironment?.dispose();
    this.vehiclePackEnvironment = null;
    this.objectLibraryCatalogEnvironment?.dispose();
    this.objectLibraryCatalogEnvironment = null;
    this.dominusAssetGalleryEnvironment?.dispose();
    this.dominusAssetGalleryEnvironment = null;
    this.dominusPortEvidenceEnvironment?.dispose();
    this.dominusPortEvidenceEnvironment = null;
    this.threejsPlaygroundEnvironment?.dispose();
    this.threejsPlaygroundEnvironment = null;
    this.ballzBlenderLevel1Environment?.dispose();
    this.ballzBlenderLevel1Environment = null;
    this.maisonExplorerEnvironment?.dispose();
    this.maisonExplorerEnvironment = null;
    this.arenaArchiveEnvironment?.dispose();
    this.arenaArchiveEnvironment = null;
    this.suzanne2Environment?.dispose();
    this.suzanne2Environment = null;
    this.notesManagerEnvironment?.dispose();
    this.notesManagerEnvironment = null;
    this.milkyWayEnvironment?.dispose();
    this.milkyWayEnvironment = null;
  }

  private buildNatureLabPreview(): void {
    const lab = new NatureLab(this.natureLabStudy);
    this.natureLab = lab;
    this.archivePreviewGroup.add(lab.group);
  }

  private teardownNatureLab(): void {
    this.natureLab?.dispose();
    this.natureLab = null;
  }

  private buildAgentWorldPreview(): void {
    const world = new AgentWorldRuntime(GRAPHYSX_AGENT_DEMO_WORLD);
    this.agentWorld = world;
    this.archivePreviewGroup.add(world.group);
    this.syncAgentWorldPresentation();
  }

  private teardownAgentWorld(): void {
    this.agentTransformControls.detach();
    this.agentTransformEntityId = null;
    this.agentTransformObject = null;
    this.agentTransformStart = null;
    this.agentWorld?.dispose();
    this.agentWorld = null;
  }

  private afterAgentWorldMutation(changed: boolean, environmentMayHaveChanged = false): void {
    // Rejected atomic operations may rebuild the previous definition with fresh
    // Object3D instances. Always rebind (or detach) the gizmo before rendering.
    this.syncAgentTransformControls();
    if (!changed) return;
    if (environmentMayHaveChanged) this.syncAgentWorldPresentation();
    this.options.onAgentWorldStateChanged?.();
  }

  private syncAgentTransformControls(): void {
    const selectedId = this.agentWorld?.getState().selectedIds[0] ?? null;
    const object = selectedId ? this.agentWorld?.getEntityObject(selectedId) ?? null : null;
    if (!selectedId || !object || this.previewMode !== "world-api-lab") {
      this.agentTransformControls.detach();
      this.agentTransformEntityId = null;
      this.agentTransformObject = null;
      return;
    }
    this.agentTransformEntityId = selectedId;
    if (this.agentTransformObject !== object) {
      this.agentTransformObject = object;
      this.agentTransformControls.attach(object);
    }
  }

  private commitAgentWorldTransform(): void {
    const id = this.agentTransformEntityId;
    const object = this.agentTransformObject;
    const start = this.agentTransformStart;
    this.agentTransformStart = null;
    if (!id || !object || !start) return;
    const changed = !start.position.equals(object.position)
      || !start.rotation.equals(new Vector3(object.rotation.x, object.rotation.y, object.rotation.z))
      || !start.scale.equals(object.scale);
    if (!changed) return;
    this.updateAgentWorldEntity(id, {
      transform: {
        position: [roundEditorNumber(object.position.x), roundEditorNumber(object.position.y), roundEditorNumber(object.position.z)],
        rotationDegrees: [roundEditorNumber(MathUtils.radToDeg(object.rotation.x)), roundEditorNumber(MathUtils.radToDeg(object.rotation.y)), roundEditorNumber(MathUtils.radToDeg(object.rotation.z))],
        scale: [roundEditorNumber(object.scale.x), roundEditorNumber(object.scale.y), roundEditorNumber(object.scale.z)]
      }
    });
  }

  private syncAgentWorldPresentation(): void {
    if (this.previewMode !== "world-api-lab" || !this.agentWorld) return;
    const environment = this.agentWorld.getEnvironment();
    this.scene.background = new Color(environment.background);
    this.scene.environment = this.loadSkybox("clearnight");
    this.scene.backgroundBlurriness = 0;
    this.scene.backgroundIntensity = 1;
    this.scene.fog = new Fog(environment.background, 28, 105);
  }

  private applyNatureLabPresentation(study: NatureLabStudyId): void {
    if (this.previewMode !== "nature-lab") {
      return;
    }
    const isForest = study === "living-forest";
    const skyboxKey: RaceDefinition["skybox"] = isForest ? "lostvalley" : "clearnight";
    const skybox = this.loadSkybox(skyboxKey);
    this.scene.background = isForest ? new Color("#071b16") : skybox;
    this.scene.environment = skybox;
    if (isForest) {
      this.scene.backgroundBlurriness = 0;
      this.scene.backgroundIntensity = 1;
      this.camera.fov = 58;
      this.camera.updateProjectionMatrix();
    } else {
      this.applySkyboxPresentation(skyboxKey);
    }
    this.scene.fog = new Fog(isForest ? "#10251b" : "#07141d", 18, 82);
  }

  private buildSkyboxSelectorPreview(): void {
    this.scene.fog = null;
    this.scene.environment = null;
    const environment = new SkyboxSelectorEnvironment(this.scene, this.camera);
    this.skyboxSelectorEnvironment = environment;
    environment.activate();
    environment.ready
      .then(() => {
        if (this.skyboxSelectorEnvironment === environment && this.previewMode === "skybox-selector") {
          this.options.onArchiveSelectorStateChanged?.();
        }
      })
      .catch(() => {
        if (this.skyboxSelectorEnvironment === environment && this.previewMode === "skybox-selector") {
          this.options.onArchiveSelectorStateChanged?.();
        }
      });
  }

  private buildCarSelectorPreview(): void {
    this.scene.fog = null;
    this.scene.environment = null;
    const environment = new CarSelectorEnvironment(this.scene, this.camera);
    this.carSelectorEnvironment = environment;
    environment.activate();
    environment.ready
      .then(() => {
        if (this.carSelectorEnvironment === environment && this.previewMode === "car-selector") {
          this.options.onArchiveSelectorStateChanged?.();
        }
      })
      .catch(() => {
        if (this.carSelectorEnvironment === environment && this.previewMode === "car-selector") {
          this.options.onArchiveSelectorStateChanged?.();
        }
      });
  }

  private teardownArchiveSelectors(): void {
    this.skyboxSelectorEnvironment?.dispose();
    this.skyboxSelectorEnvironment = null;
    this.carSelectorEnvironment?.dispose();
    this.carSelectorEnvironment = null;
  }

  private applyPreviewSkybox(): void {
    if (this.previewMode === "skybox-selector" || this.previewMode === "car-selector") {
      return;
    }
    if (this.previewMode === "common-room-lab") {
      this.scene.background = new Color("#000000");
      this.scene.environment = null;
      this.scene.fog = null;
      this.camera.fov = 55;
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.previewMode === "xml-myworld-copy") {
      this.scene.background = new Color("#09111a");
      this.scene.environment = null;
      this.scene.fog = null;
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.previewMode === "ballz-xml-worlds" || this.previewMode === "xml-serializer-artifacts" || this.previewMode === "vehicle-pack-gallery") {
      this.scene.background = new Color(this.previewMode === "vehicle-pack-gallery" ? "#081521" : "#09111a");
      this.scene.environment = null;
      this.scene.fog = null;
      this.camera.fov = this.previewMode === "vehicle-pack-gallery" ? 42 : 50;
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.previewMode === "object-library-catalog" || this.previewMode === "dominus-port-evidence") {
      this.scene.background = new Color("#081018");
      this.scene.environment = null;
      this.scene.fog = null;
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.previewMode === "threejs-playground") {
      // The environment contains the exact six inward-facing Asteroids sky
      // faces as authored. Keep the host scene neutral so a second panorama is
      // never layered behind the recovered one.
      this.scene.background = new Color("#000000");
      this.scene.environment = null;
      this.scene.fog = null;
      this.camera.fov = 55;
      this.camera.far = 30000;
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.previewMode === "ballz-blender-level1" || this.previewMode === "maison-explorer" || this.previewMode === "arena-archive") {
      this.scene.background = new Color(this.previewMode === "maison-explorer" ? "#171513" : this.previewMode === "arena-archive" ? "#171a1d" : "#101820");
      this.scene.environment = null;
      this.scene.fog = null;
      this.camera.fov = 52;
      this.camera.far = 500;
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.previewMode === "ballz-track-gallery") {
      this.scene.background = new Color("#08131a");
      this.scene.environment = null;
      this.scene.fog = new Fog("#08131a", 145, 300);
      this.camera.fov = 46;
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.previewMode === "dominus-asset-gallery") {
      this.scene.background = new Color("#081018");
      this.scene.environment = null;
      this.scene.fog = null;
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.previewMode === "suzanne2-archive") {
      this.scene.background = new Color("#07111b");
      this.scene.environment = null;
      this.scene.fog = null;
      this.camera.fov = 58;
      this.camera.updateProjectionMatrix();
      return;
    }
    if (
      this.previewMode === "menu" ||
      this.previewMode === "notes-manager-lab" ||
      this.previewMode === "cubx-lab" ||
      this.previewMode === "input-device-lab" ||
      this.previewMode === "ballz-slide1"
    ) {
      // These are UI/inspection spaces without an authored panorama. Keep the
      // archive cube map for material lighting only; using its small faces as
      // a full-screen background visibly magnifies pixels and invents a sky.
      this.scene.background = new Color(this.previewMode === "menu" ? "#07111b" : this.previewMode === "ballz-slide1" ? "#050b12" : "#08131b");
      this.scene.environment = this.loadSkybox("clearnight");
      this.scene.backgroundBlurriness = 0;
      this.scene.backgroundIntensity = 1;
      this.scene.fog = null;
      this.camera.fov = 55;
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.previewMode === "nature-lab") {
      this.applyNatureLabPresentation(this.natureLabStudy);
      return;
    }
    if (this.previewMode === "world-api-lab") {
      this.syncAgentWorldPresentation();
      this.camera.fov = 55;
      this.camera.updateProjectionMatrix();
      return;
    }
    const skyboxByMode: Record<ArchivePreviewMode, RaceDefinition["skybox"]> = {
      // Home is a neutral project hub, not a preview of whichever race happens
      // to be selected in storage. Keep the race-specific sky for race-preview.
      menu: "clearnight",
      "race-preview": this.race.skybox,
      "scene-index": "clearnight",
      "scene-lab": "skyx",
      "nature-lab": "clearnight",
      "world-api-lab": "clearnight",
      "skybox-selector": "clearnight",
      "car-selector": "clearnight",
      "common-room-lab": "clearnight",
      "ballz-2011-level1": "clearblue",
      "ballz-slide1": "clearnight",
      "ballz-track-gallery": "clearnight",
      "xml-myworld-copy": "clearnight",
      "ballz-xml-worlds": "clearnight",
      "xml-serializer-artifacts": "clearnight",
      "vehicle-pack-gallery": "clearnight",
      "object-library-catalog": "clearnight",
      "dominus-asset-gallery": "clearnight",
      "dominus-port-evidence": "clearnight",
      "threejs-playground": "clearnight",
      "ballz-blender-level1": "clearnight",
      "maison-explorer": "clearnight",
      "arena-archive": "clearnight",
      "suzanne2-archive": "clearnight",
      "notes-manager-lab": "skyx",
      "milky-way-lab": "clearnight",
      "game-lab": "clearnight",
      "physics-lab": "lostvalley",
      "input-device-lab": "clearnight",
      "map-editor": "clearblue",
      "math-lab": "nightsky",
      "editor-lab": "clearblue",
      "cubx-lab": "skyx",
      "cubx-actor-lineage": "clearnight",
      "asset-catalog": "winter"
    };
    const fogByMode: Record<ArchivePreviewMode, string> = {
      menu: "#060817",
      "race-preview": this.race.palette.fog,
      "scene-index": "#0b1420",
      "scene-lab": "#102232",
      "nature-lab": "#07141d",
      "world-api-lab": "#111827",
      "skybox-selector": "#000000",
      "car-selector": "#05080c",
      "common-room-lab": "#000000",
      "ballz-2011-level1": "#17202a",
      "ballz-slide1": "#08131b",
      "ballz-track-gallery": "#08131a",
      "xml-myworld-copy": "#09111a",
      "ballz-xml-worlds": "#09111a",
      "xml-serializer-artifacts": "#09111a",
      "vehicle-pack-gallery": "#081521",
      "object-library-catalog": "#081018",
      "dominus-asset-gallery": "#081018",
      "dominus-port-evidence": "#081018",
      "threejs-playground": "#000000",
      "ballz-blender-level1": "#101820",
      "maison-explorer": "#171513",
      "arena-archive": "#171a1d",
      "suzanne2-archive": "#07111b",
      "notes-manager-lab": "#111722",
      "milky-way-lab": "#02040a",
      "game-lab": "#11121a",
      "physics-lab": "#141b17",
      "input-device-lab": "#07111b",
      "map-editor": "#17202c",
      "math-lab": "#060817",
      "editor-lab": "#152331",
      "cubx-lab": "#0d1b26",
      "cubx-actor-lineage": "#071019",
      "asset-catalog": "#191c24"
    };
    const skybox = this.loadSkybox(skyboxByMode[this.previewMode]);
    this.scene.background = skybox;
    this.scene.environment = skybox;
    const skyboxKey = skyboxByMode[this.previewMode];
    this.applySkyboxPresentation(skyboxKey);
    const isRacePreview = this.previewMode === "race-preview";
    this.scene.fog = this.previewMode === "ballz-2011-level1"
      ? new Fog(fogByMode[this.previewMode], 110, 240)
      : new Fog(fogByMode[this.previewMode], isRacePreview ? 24 : 18, isRacePreview ? 105 : 82);
  }

  private buildSceneLabPreview(): void {
    const terrainGeometry = new PlaneGeometry(34, 34, 36, 36);
    terrainGeometry.rotateX(-Math.PI / 2);
    const positions = terrainGeometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const ridge = Math.sin(x * 0.42) * 0.8 + Math.cos(z * 0.34) * 0.55 + Math.sin((x + z) * 0.18) * 0.65;
      positions.setY(index, Math.max(-0.45, ridge));
    }
    positions.needsUpdate = true;
    terrainGeometry.computeVertexNormals();
    const terrain = new Mesh(
      terrainGeometry,
      new MeshStandardMaterial({
        map: this.loadTexture("/assets/textures/archive/heightmap8.jpg", 3, 3),
        color: new Color("#b3c99f"),
        roughness: 0.92,
        metalness: 0.02
      })
    );
    terrain.receiveShadow = true;
    this.archivePreviewGroup.add(terrain);

    const water = new Mesh(
      new PlaneGeometry(18, 8),
      new MeshPhysicalMaterial({
        color: new Color("#5bb9d6"),
        transparent: true,
        opacity: 0.42,
        roughness: 0.04,
        metalness: 0.02,
        transmission: 0.08,
        clearcoat: 1
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(-4, 0.34, 5.4);
    water.userData.bob = 1.1;
    water.userData.baseY = water.position.y;
    this.archivePreviewGroup.add(water);

    const orbit = new Mesh(
      new TorusGeometry(11, 0.035, 10, 96),
      new MeshBasicMaterial({ color: new Color("#ffe39a"), transparent: true, opacity: 0.38 })
    );
    orbit.rotation.x = Math.PI / 2.8;
    orbit.userData.spin = 0.08;
    this.archivePreviewGroup.add(orbit);

    const sun = new Mesh(
      new SphereGeometry(0.82, 24, 16),
      new MeshStandardMaterial({ color: new Color("#ffd66e"), emissive: new Color("#6f3800"), roughness: 0.25 })
    );
    sun.position.set(-8.2, 7.2, -6.5);
    sun.userData.spin = 0.45;
    this.archivePreviewGroup.add(sun);

    const moon = new Mesh(
      new SphereGeometry(0.62, 20, 14),
      new MeshStandardMaterial({ map: this.loadTexture("/assets/textures/rock2.bmp", 1, 1), color: new Color("#d8e1ec"), roughness: 0.8 })
    );
    moon.position.set(8.6, 5.6, 7.4);
    moon.userData.spin = -0.28;
    this.archivePreviewGroup.add(moon);

    const splineVertices: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const z = -13.5 + index * 1.42;
      const x = Math.sin(index * 0.72) * 6.4;
      const y = 2.2 + Math.cos(index * 0.48) * 1.2;
      splineVertices.push(x, y, z);
    }
    const spline = this.createLine(splineVertices, "#aaf0ff", 0.78);
    spline.userData.spin = 0.02;
    this.archivePreviewGroup.add(spline);

    const airplane = this.createAirplaneProxy(new Color("#e9edf4"), new Color("#d64138"));
    airplane.position.set(3.7, 4.6, -3.4);
    airplane.rotation.set(0.15, -0.8, 0.08);
    airplane.userData.spin = 0.32;
    this.archivePreviewGroup.add(airplane);
  }

  private buildGameLabPreview(): void {
    const floor = new Mesh(
      new BoxGeometry(22, 0.12, 18),
      new MeshStandardMaterial({
        map: this.loadTexture("/assets/textures/metal13.jpg", 3, 3),
        color: new Color("#808996"),
        roughness: 0.72,
        metalness: 0.18
      })
    );
    floor.position.y = -0.06;
    floor.receiveShadow = true;
    this.archivePreviewGroup.add(floor);

    const grid = new Mesh(
      new PlaneGeometry(21.6, 17.6),
      new MeshBasicMaterial({
        map: this.loadTexture("/assets/textures/GreenGrid.png", 4, 4),
        color: new Color("#9affc5"),
        transparent: true,
        opacity: 0.26,
        side: DoubleSide
      })
    );
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.012;
    this.archivePreviewGroup.add(grid);

    const emitterSpecs = [
      { position: new Vector3(-3.8, 0.18, 5.6), color: "#ff7a35" },
      { position: new Vector3(0, 0.18, 5.9), color: "#6cf5ff" },
      { position: new Vector3(3.8, 0.18, 5.6), color: "#bd82ff" }
    ];
    for (const [index, spec] of emitterSpecs.entries()) {
      const pedestal = new Mesh(
        new CylinderGeometry(0.62, 0.78, 0.34, 24),
        new MeshStandardMaterial({
          color: new Color("#18242d"),
          emissive: new Color(spec.color).multiplyScalar(0.18),
          roughness: 0.34,
          metalness: 0.7
        })
      );
      pedestal.name = `ParticleEmitterPedestal${index + 1}`;
      pedestal.position.copy(spec.position);
      this.archivePreviewGroup.add(pedestal);

      const halo = new Mesh(
        new TorusGeometry(0.62, 0.055, 8, 40),
        new MeshBasicMaterial({ color: new Color(spec.color), transparent: true, opacity: 0.88, blending: AdditiveBlending })
      );
      halo.position.copy(spec.position);
      halo.position.y += 0.23;
      halo.rotation.x = Math.PI / 2;
      halo.userData.spin = index % 2 === 0 ? 0.9 : -0.9;
      this.archivePreviewGroup.add(halo);

      const light = new PointLight(new Color(spec.color), 5.5, 7.5, 2);
      light.position.copy(spec.position);
      light.position.y += 1;
      this.archivePreviewGroup.add(light);
    }

    const player = this.createHumanProxy(new Color("#78f0d0"), new Color("#dff8ff"));
    player.name = "GameBasicsPlayerProxy";
    player.position.set(-6.5, 0, 4.2);
    player.rotation.y = -0.4;
    player.userData.bob = 1.05;
    player.userData.baseY = player.position.y;
    this.archivePreviewGroup.add(player);

    const targetPositions = [
      new Vector3(2.5, 0, 2.4),
      new Vector3(5.9, 0, -0.8),
      new Vector3(8.1, 0, 3.4),
      new Vector3(4.2, 0, -4.4)
    ];
    targetPositions.forEach((position, index) => {
      const target = this.createHumanProxy(new Color(index % 2 === 0 ? "#f95f4c" : "#ffbf69"), new Color("#2a1110"));
      target.name = `ZombieBasicsTarget${index + 1}`;
      target.position.copy(position);
      target.rotation.y = Math.PI + index * 0.35;
      target.userData.bob = 0.82 + index * 0.16;
      target.userData.baseY = target.position.y;
      this.archivePreviewGroup.add(target);
    });

    const aimLine = this.createLine([-6.3, 1.35, 4.0, 6.9, 1.0, -0.3], "#78f0d0", 0.88);
    aimLine.name = "MousePickAimLine";
    this.archivePreviewGroup.add(aimLine);

    const bulletMaterial = new MeshStandardMaterial({
      map: this.loadTexture("/assets/textures/metal13.jpg", 1, 1),
      color: new Color("#f3f7ff"),
      emissive: new Color("#233a4a"),
      roughness: 0.32,
      metalness: 0.74
    });
    for (let index = 0; index < 7; index += 1) {
      const bullet = new Mesh(new SphereGeometry(0.16, 16, 10), bulletMaterial);
      bullet.position.set(-4.4 + index * 1.7, 1.26 - index * 0.04, 3.3 - index * 0.48);
      bullet.userData.spin = 1.6;
      this.archivePreviewGroup.add(bullet);
    }

    const impact = new Mesh(
      new TorusGeometry(0.72, 0.035, 8, 32),
      new MeshBasicMaterial({ color: new Color("#ffbf69"), transparent: true, opacity: 0.72 })
    );
    impact.position.set(7.2, 1.0, -0.45);
    impact.rotation.y = Math.PI / 2;
    impact.userData.spin = 0.9;
    this.archivePreviewGroup.add(impact);

    for (let index = 0; index < 5; index += 1) {
      const flame = this.createFlameBillboard(index % 2 === 0 ? "/assets/textures/archive/flame1.jpg" : "/assets/textures/archive/flame4.jpg");
      flame.position.set(-1.8 + index * 1.05, 0.82, -5.7 + Math.sin(index) * 0.7);
      flame.userData.bob = 1.4 + index * 0.12;
      flame.userData.baseY = flame.position.y;
      this.archivePreviewGroup.add(flame);
    }

    const triggerZone = new Mesh(
      new RingGeometry(2.2, 2.28, 48),
      new MeshBasicMaterial({ color: new Color("#aaf0ff"), transparent: true, opacity: 0.36, side: DoubleSide })
    );
    triggerZone.name = "PhysicsTriggerZone";
    triggerZone.rotation.x = -Math.PI / 2;
    triggerZone.position.set(0.5, 0.04, -2.8);
    this.archivePreviewGroup.add(triggerZone);
    this.mountArchivedParticlePresetLibrary();
  }

  private mountArchivedParticlePresetLibrary(): void {
    void import("./particle-preset-library-environment").then(({ ParticlePresetLibraryEnvironment }) => {
      if (this.previewMode !== "game-lab" || this.particlePresetLibraryEnvironment) return;
      const environment = new ParticlePresetLibraryEnvironment({ initialPresetId: "explosion_01", autoReplay: true });
      this.particlePresetLibraryEnvironment = environment;
      environment.group.position.set(0, 0.5, 0);
      this.archivePreviewGroup.add(environment.group);
      environment.ready
        .then(() => {
          if (this.particlePresetLibraryEnvironment === environment && this.previewMode === "game-lab") {
            environment.activate();
            environment.restart();
            this.options.onArchiveSelectorStateChanged?.();
          }
        })
        .catch(() => {
          if (this.particlePresetLibraryEnvironment === environment && this.previewMode === "game-lab") {
            this.options.onArchiveSelectorStateChanged?.();
          }
        });
    });
  }

  private teardownParticlePresetLibraryEnvironment(): void {
    this.particlePresetLibraryEnvironment?.dispose();
    this.particlePresetLibraryEnvironment = null;
  }

  private buildMapEditorPreview(): void {
    const { width, height, tiles } = this.mapEditorDraft;
    const tileSize = 1.28;
    const mapWidth = width * tileSize;
    const mapDepth = height * tileSize;
    const originX = -mapWidth / 2 + tileSize / 2;
    const originZ = -mapDepth / 2 + tileSize / 2;

    const base = new Mesh(
      new BoxGeometry(mapWidth + 1.4, 0.12, mapDepth + 1.4),
      new MeshStandardMaterial({
        map: this.loadTexture("/assets/textures/Damier.jpg", 4, 4),
        color: new Color("#bfc5c1"),
        roughness: 0.82,
        metalness: 0.05
      })
    );
    base.position.y = -0.08;
    base.receiveShadow = true;
    this.archivePreviewGroup.add(base);

    const gridMaterial = new LineBasicMaterial({ color: new Color("#78f0d0"), transparent: true, opacity: 0.32 });
    const gridVertices: number[] = [];
    for (let x = 0; x <= width; x += 1) {
      const worldX = -mapWidth / 2 + x * tileSize;
      gridVertices.push(worldX, 0.015, -mapDepth / 2, worldX, 0.015, mapDepth / 2);
    }
    for (let z = 0; z <= height; z += 1) {
      const worldZ = -mapDepth / 2 + z * tileSize;
      gridVertices.push(-mapWidth / 2, 0.015, worldZ, mapWidth / 2, 0.015, worldZ);
    }
    const gridGeometry = new BufferGeometry();
    gridGeometry.setAttribute("position", new Float32BufferAttribute(gridVertices, 3));
    this.archivePreviewGroup.add(new LineSegments(gridGeometry, gridMaterial));

    const floorMaterial = new MeshStandardMaterial({
      map: this.loadTexture("/assets/textures/archive/yellowtwoway.jpg", 1, 1),
      color: new Color("#d6b66b"),
      roughness: 0.58,
      metalness: 0.08
    });
    const wallMaterial = new MeshStandardMaterial({
      map: this.loadTexture("/assets/textures/archive/wood.jpg", 1, 1),
      color: new Color("#bd8b3d"),
      roughness: 0.48,
      metalness: 0.1
    });
    const hazardMaterial = new MeshStandardMaterial({
      map: this.loadTexture("/assets/textures/90Right.png", 1, 1),
      color: new Color("#f95f4c"),
      emissive: new Color("#461008"),
      roughness: 0.34,
      metalness: 0.22
    });
    const fireMaterial = new MeshStandardMaterial({
      color: new Color("#ff5a24"),
      emissive: new Color("#8c1800"),
      roughness: 0.28,
      metalness: 0.16
    });
    const iceMaterial = new MeshPhysicalMaterial({
      color: new Color("#75eaff"),
      emissive: new Color("#064963"),
      transparent: true,
      opacity: 0.82,
      roughness: 0.08,
      metalness: 0.08,
      clearcoat: 1
    });

    const floorInstances = new InstancedMesh(
      new BoxGeometry(tileSize * 0.92, 0.08, tileSize * 0.92),
      floorMaterial,
      width * height
    );
    floorInstances.name = "MapEditorFloorTiles";
    floorInstances.receiveShadow = true;
    const wallCount = tiles.filter((tile) => tile === "wall").length;
    const wallInstances = wallCount > 0
      ? new InstancedMesh(new BoxGeometry(tileSize * 0.9, 0.95, tileSize * 0.9), wallMaterial, wallCount)
      : null;
    if (wallInstances) {
      wallInstances.name = "MapEditorWalls";
      wallInstances.castShadow = true;
      wallInstances.receiveShadow = true;
    }
    const instanceMatrix = new Matrix4();
    let floorInstance = 0;
    let wallInstance = 0;

    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const tile = tiles[row * width + column] ?? "floor";
        const x = originX + column * tileSize;
        const z = originZ + row * tileSize;
        instanceMatrix.makeTranslation(x, 0.02, z);
        floorInstances.setMatrixAt(floorInstance, instanceMatrix);
        floorInstance += 1;

        if (tile === "wall") {
          instanceMatrix.makeTranslation(x, 0.52, z);
          wallInstances?.setMatrixAt(wallInstance, instanceMatrix);
          wallInstance += 1;
        } else if (tile === "start") {
          const start = new Group();
          start.name = "MapEditorStart";
          const shell = new Mesh(
            new SphereGeometry(0.38, 24, 16),
            new MeshPhysicalMaterial({ color: new Color("#dff8ff"), transparent: true, opacity: 0.34, roughness: 0.08, metalness: 0.04, clearcoat: 1 })
          );
          const wire = new LineSegments(
            new WireframeGeometry(new SphereGeometry(0.41, 12, 8)),
            new LineBasicMaterial({ color: new Color("#78f0d0"), transparent: true, opacity: 0.74 })
          );
          const arrow = new Mesh(
            new ConeGeometry(0.18, 0.48, 4),
            new MeshStandardMaterial({ color: new Color("#ffbf69"), emissive: new Color("#3a1800"), roughness: 0.3 })
          );
          arrow.rotation.x = Math.PI / 2;
          arrow.position.z = -0.18;
          start.add(shell, wire, arrow);
          start.position.set(x, 0.55, z);
          start.userData.spin = 0.42;
          this.archivePreviewGroup.add(start);
        } else if (tile === "ring") {
          const ring = new Mesh(
            new TorusGeometry(0.42, 0.045, 12, 32),
            new MeshBasicMaterial({ color: new Color("#fff2c2"), transparent: true, opacity: 0.9 })
          );
          ring.position.set(x, 0.78, z);
          ring.rotation.y = Math.PI / 2;
          ring.userData.spin = 1.1;
          this.archivePreviewGroup.add(ring);
        } else if (tile === "half" || tile === "finish") {
          const color = new Color(tile === "half" ? "#ffbf69" : "#78f0d0");
          const gate = new Group();
          const postMaterial = new MeshStandardMaterial({ color, emissive: color.clone().multiplyScalar(0.22), roughness: 0.35, metalness: 0.22 });
          const left = new Mesh(new BoxGeometry(0.14, 1.2, 0.14), postMaterial);
          const right = left.clone();
          const beam = new Mesh(new BoxGeometry(tileSize * 0.88, 0.12, 0.12), postMaterial);
          left.position.set(-tileSize * 0.38, 0.62, 0);
          right.position.set(tileSize * 0.38, 0.62, 0);
          beam.position.y = 1.18;
          gate.add(left, right, beam);
          gate.position.set(x, 0.02, z);
          this.archivePreviewGroup.add(gate);
        } else if (tile === "hazard") {
          const hazard = new Mesh(new BoxGeometry(tileSize * 0.76, 0.18, 0.18), hazardMaterial);
          hazard.position.set(x, 0.58, z);
          hazard.userData.spin = 1.25;
          this.archivePreviewGroup.add(hazard);
        } else if (tile === "fire") {
          const fire = new Group();
          const pad = new Mesh(new CylinderGeometry(tileSize * 0.36, tileSize * 0.43, 0.1, 12), fireMaterial);
          const flame = new Mesh(new ConeGeometry(tileSize * 0.18, 0.72, 7), fireMaterial);
          flame.position.y = 0.42;
          flame.rotation.z = 0.16;
          fire.add(pad, flame);
          fire.position.set(x, 0.09, z);
          fire.userData.spin = 0.72;
          this.archivePreviewGroup.add(fire);
        } else if (tile === "ice") {
          const ice = new Group();
          const pad = new Mesh(new CylinderGeometry(tileSize * 0.42, tileSize * 0.42, 0.08, 6), iceMaterial);
          const crystal = new Mesh(new IcosahedronGeometry(tileSize * 0.2, 0), iceMaterial);
          crystal.scale.y = 1.8;
          crystal.position.y = 0.38;
          ice.add(pad, crystal);
          ice.position.set(x, 0.08, z);
          ice.userData.spin = -0.5;
          this.archivePreviewGroup.add(ice);
        }
      }
    }
    floorInstances.instanceMatrix.needsUpdate = true;
    this.archivePreviewGroup.add(floorInstances);
    if (wallInstances) {
      wallInstances.instanceMatrix.needsUpdate = true;
      this.archivePreviewGroup.add(wallInstances);
    }
  }

  private buildMathLabPreview(): void {
    const board = new Mesh(
      new PlaneGeometry(15, 7),
      new MeshStandardMaterial({
        map: this.loadTexture("/assets/textures/archive/ElectronicBoard_fullsize.jpg", 1, 1),
        color: new Color("#9fd7ff"),
        roughness: 0.48,
        metalness: 0.24
      })
    );
    board.position.set(0, 3.7, -8.4);
    this.archivePreviewGroup.add(board);

    for (let line = -6; line <= 6; line += 2) {
      this.archivePreviewGroup.add(this.createLine([-6, 0.04, line, 6, 0.04, line], "#2bd67b", 0.32));
      this.archivePreviewGroup.add(this.createLine([line, 0.04, -6, line, 0.04, 6], "#2bd67b", 0.32));
    }
    this.archivePreviewGroup.add(this.createLine([-7, 0.12, 0, 7, 0.12, 0], "#f95f4c", 0.8));
    this.archivePreviewGroup.add(this.createLine([0, 0.12, -7, 0, 0.12, 7], "#78f0d0", 0.8));
    this.archivePreviewGroup.add(this.createLine([0, 0, 0, 0, 6.8, 0], "#ffe86b", 0.86));

    for (let z = -6; z <= 6; z += 1.5) {
      const vertices: number[] = [];
      for (let x = -6; x <= 6.001; x += 0.35) {
        vertices.push(x, this.getMathSurfaceY(x, z), z);
      }
      this.archivePreviewGroup.add(this.createLine(vertices, z === 0 ? "#ffe86b" : "#8be0ff", z === 0 ? 0.92 : 0.52));
    }

    // legacy Formulas::moleculesCreate — 10,000 box molecules in 100 z-lanes,
    // blue-to-red gradient along z, riding the selected formula
    const LANES = 100;
    const PER_LANE = 100;
    const field = new InstancedMesh(
      new BoxGeometry(0.1, 0.1, 0.1),
      new MeshStandardMaterial({ roughness: 0.4, metalness: 0.18 }),
      LANES * PER_LANE
    );
    const matrix = new Matrix4();
    const laneColor = new Color();
    let instance = 0;
    for (let lane = 0; lane < LANES; lane++) {
      const zRatio = lane / (LANES - 1);
      laneColor.setRGB(zRatio, 0, 1 - zRatio);
      const z = (lane - (LANES - 1) / 2) * 0.13;
      for (let column = 0; column < PER_LANE; column++) {
        const x = (column - (PER_LANE - 1) / 2) * 0.13;
        matrix.setPosition(x, this.getMathSurfaceY(x, z), z);
        field.setMatrixAt(instance, matrix);
        field.setColorAt(instance, laneColor);
        instance++;
      }
    }
    field.instanceMatrix.needsUpdate = true;
    if (field.instanceColor) {
      field.instanceColor.needsUpdate = true;
    }
    field.name = "MathMoleculeField";
    this.archivePreviewGroup.add(field);
  }

  private buildEditorLabPreview(): void {
    const floor = new Mesh(
      new BoxGeometry(18, 0.12, 18),
      this.createMaterial("checker-dark")
    );
    floor.position.y = -0.06;
    floor.receiveShadow = true;
    this.archivePreviewGroup.add(floor);

    const primitiveMaterial = new MeshStandardMaterial({ color: new Color("#d8e4ef"), roughness: 0.48, metalness: 0.16 });
    const accentMaterial = new MeshStandardMaterial({ color: new Color("#ffbf69"), emissive: new Color("#3f1d00"), roughness: 0.34, metalness: 0.28 });
    const primitiveMeshes = [
      new Mesh(new BoxGeometry(1.5, 1.5, 1.5), primitiveMaterial),
      new Mesh(new SphereGeometry(0.92, 24, 16), primitiveMaterial),
      new Mesh(new CylinderGeometry(0.72, 0.72, 1.8, 24), primitiveMaterial),
      new Mesh(new ConeGeometry(0.82, 1.9, 24), primitiveMaterial),
      new Mesh(new BoxGeometry(2.4, 0.15, 2.4), accentMaterial)
    ];
    primitiveMeshes.forEach((mesh, index) => {
      mesh.position.set(-6 + index * 3, mesh.geometry instanceof BoxGeometry ? 0.8 : 1, -3.4);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.spin = 0.28 + index * 0.08;
      this.archivePreviewGroup.add(mesh);
    });

    const selected = new Mesh(
      new BoxGeometry(2.2, 1.1, 2.2),
      new MeshStandardMaterial({
        map: this.loadTexture("/assets/textures/archive/yellowtwoway.jpg", 2, 2),
        color: new Color("#fff1a0"),
        roughness: 0.42,
        metalness: 0.22
      })
    );
    selected.position.set(0, 0.65, 2.2);
    selected.name = "SelectedMeshPreview";
    this.archivePreviewGroup.add(selected);

    const selectionFrame = new LineSegments(
      new WireframeGeometry(new BoxGeometry(2.34, 1.24, 2.34)),
      new LineBasicMaterial({ color: new Color("#78f0d0"), transparent: true, opacity: 0.92 })
    );
    selectionFrame.position.copy(selected.position);
    selectionFrame.userData.spin = 0.34;
    this.archivePreviewGroup.add(selectionFrame);

    const piston = this.createPistonProxy();
    piston.position.set(-4.6, 0.74, 4.5);
    piston.userData.spin = 0.18;
    this.archivePreviewGroup.add(piston);

    const rotator = new Mesh(
      new BoxGeometry(5.8, 0.24, 0.24),
      new MeshStandardMaterial({ color: new Color("#f95f4c"), emissive: new Color("#441006"), roughness: 0.3, metalness: 0.7 })
    );
    rotator.position.set(4.8, 1.05, 4.3);
    rotator.userData.spin = 1.15;
    this.archivePreviewGroup.add(rotator);
  }

  private buildCubxActorLineagePreview(): void {
    void import("./cubx-actor-lineage-environment").then(({ CubxActorLineageEnvironment }) => {
      if (this.previewMode !== "cubx-actor-lineage" || this.cubxActorLineageEnvironment) return;
      const environment = new CubxActorLineageEnvironment();
      this.cubxActorLineageEnvironment = environment;
      environment.setDiagnosticColors(true);
      environment.setClip("get", 1);
      this.archivePreviewGroup.add(environment.group);
      this.options.onArchiveSelectorStateChanged?.();
    });
  }

  private teardownCubxActorLineage(): void {
    this.cubxActorLineageEnvironment?.dispose();
    this.cubxActorLineageEnvironment = null;
  }

  private createCubXArrowAdapter(): Mesh {
    const asset = (tvmCatalog?.assets as Array<{ id: string; positions: number[]; indices: number[] }> | undefined)?.find(
      (candidate) => candidate.id === "fleche"
    );
    let geometry: BufferGeometry;
    let recoveredGeometry = false;
    if (asset) {
      geometry = this.buildLegacyGeometry(asset.positions, asset.indices, null);
      geometry.computeBoundingBox();
      geometry.center();
      recoveredGeometry = true;
    } else {
      geometry = new ConeGeometry(0.45, 1.6, 4);
    }
    const arrow = new Mesh(
      geometry,
      new MeshStandardMaterial({
        map: this.loadTexture("/assets/textures/90Right.png", 1, 1),
        color: new Color("#ffbf69"),
        emissive: new Color("#3b1c00"),
        roughness: 0.3,
        metalness: 0.32
      })
    );
    if (recoveredGeometry && geometry.boundingBox) {
      const size = geometry.boundingBox.getSize(new Vector3());
      arrow.scale.setScalar(0.9 / Math.max(size.x, size.y, size.z, 0.001));
    }
    arrow.userData.recoveredGeometry = recoveredGeometry;
    arrow.castShadow = true;
    return arrow;
  }

  private createCubXSatelliteObject(spec: CubXSatelliteSpec): { wrapper: Group; pickTarget: Mesh | null } {
    const wrapper = new Group();
    wrapper.name = `CubXSatellite.${spec.id}`;
    const offset = cubXSatelliteDisplayOffset(spec.sourcePosition);
    wrapper.position.set(offset[0], offset[1], offset[2]);
    wrapper.userData.cubxMenuTag = spec.menuTag;
    wrapper.userData.cubxSourcePosition = [...spec.sourcePosition];
    wrapper.userData.cubxSourceScale = spec.sourceScale;
    let pickTarget: Mesh | null = null;

    if (spec.id === "system" || spec.id === "tools") {
      pickTarget = new Mesh(
        new BoxGeometry(1.25, 1.25, 1.25),
        new MeshStandardMaterial({
          map: this.createCubXLabelTexture(spec.label, spec.id === "system" ? "SOURCE MENU" : "CAR SCENE", "#78f0d0", "#102230"),
          color: new Color("#dff8ff"),
          emissive: new Color("#123744"),
          emissiveIntensity: 0.44,
          roughness: 0.26,
          metalness: 0.48
        })
      );
    } else if (spec.id === "earth") {
      pickTarget = new Mesh(
        new SphereGeometry(0.8, 32, 20),
        new MeshStandardMaterial({
          map: this.loadTexture("/assets/textures/archive/heightmap8.jpg", 1, 1),
          color: new Color("#5da8ff"),
          roughness: 0.46,
          metalness: 0.1
        })
      );
      pickTarget.userData.spin = 0.2;
    } else if (spec.id === "earth-grid") {
      const grid = new LineSegments(
        new WireframeGeometry(new SphereGeometry(0.9, 18, 12)),
        new LineBasicMaterial({ color: new Color("#78f0d0"), transparent: true, opacity: 0.64 })
      );
      grid.userData.spin = -0.28;
      wrapper.add(grid);
    } else if (spec.id === "arrow") {
      pickTarget = this.createCubXArrowAdapter();
    } else if (spec.id === "sun") {
      pickTarget = new Mesh(
        new BoxGeometry(1.1, 1.1, 1.1),
        new MeshStandardMaterial({
          map: this.createCubXLabelTexture("SUN", "FLIGHTX", "#fff0b8", "#8b1207"),
          color: new Color("#ff3f22"),
          emissive: new Color("#a51308"),
          emissiveIntensity: 1.15,
          roughness: 0.26,
          metalness: 0.1
        })
      );
    }

    if (pickTarget) {
      pickTarget.name = `CubXSatelliteButton.${spec.id}`;
      pickTarget.userData.cubxSatelliteId = spec.id;
      pickTarget.userData.cubxMenuTag = spec.menuTag;
      pickTarget.castShadow = true;
      if (spec.sourceRotationDegrees) {
        pickTarget.rotation.set(
          MathUtils.degToRad(spec.sourceRotationDegrees[0]),
          MathUtils.degToRad(spec.sourceRotationDegrees[1]),
          MathUtils.degToRad(spec.sourceRotationDegrees[2])
        );
      }
      wrapper.add(pickTarget);
    }
    return { wrapper, pickTarget };
  }

  private buildCubXSatelliteShell(origin: Vector3): {
    group: Group;
    buttons: Mesh[];
    objects: Map<CubXSatelliteId, Group>;
    sunButton: Mesh;
  } {
    const group = new Group();
    group.name = "CubXRecoveredSatelliteShell";
    group.position.copy(origin);
    const buttons: Mesh[] = [];
    const objects = new Map<CubXSatelliteId, Group>();
    let sunButton: Mesh | null = null;
    for (const spec of CUBX_SATELLITES) {
      const satellite = this.createCubXSatelliteObject(spec);
      objects.set(spec.id, satellite.wrapper);
      group.add(satellite.wrapper);
      if (satellite.pickTarget) {
        buttons.push(satellite.pickTarget);
        if (spec.id === "sun") {
          sunButton = satellite.pickTarget;
        }
      }
    }
    this.archivePreviewGroup.add(group);
    if (!sunButton) {
      throw new Error("CubX satellite shell did not create the recovered sun action");
    }
    return { group, buttons, objects, sunButton };
  }

  private syncCubXSatelliteVisibility(menu: CubXMenuRuntime): void {
    for (const spec of CUBX_SATELLITES) {
      const object = menu.satelliteObjects.get(spec.id);
      if (object) {
        object.visible = isCubXMenuTagVisible(spec.menuTag, menu.activeMenuLevel);
      }
    }
  }

  private buildCubXLabPreview(): void {
    const floor = new Mesh(
      new BoxGeometry(24, 0.14, 18),
      new MeshStandardMaterial({
        map: this.loadTexture("/assets/textures/metal13.jpg", 3, 2),
        color: new Color("#263543"),
        roughness: 0.62,
        metalness: 0.28
      })
    );
    floor.position.y = -0.07;
    floor.receiveShadow = true;
    this.archivePreviewGroup.add(floor);

    // CubZ.cpp supplies the eight closed hit boxes and selection flow. The
    // CubeRot/CubeOpen TVA files supply exact ranges, keys and timing. These
    // browser boxes remain a disclosed visual adapter until the matching actor
    // geometry and TV3D handedness are validated.
    const root = new Group();
    root.name = "CubZAnimatedMenu";
    root.position.set(-3.7, 2.45, -0.25);
    const animationRoot = new Group();
    animationRoot.name = "CubXOpenTrackRoot";
    root.add(animationRoot);
    const closedPositions = CUBZ_SOURCE_CENTERS.map((position) => cubZDisplayCenter(position));
    const cubeGeometry = new BoxGeometry(CUBZ_DISPLAY_BOX_SIZE, CUBZ_DISPLAY_BOX_SIZE, CUBZ_DISPLAY_BOX_SIZE);
    const cubelets = CUBX_SECTIONS.map((section, index) => {
      const texture = this.createCubXLabelTexture(section.short, String(index + 1).padStart(2, "0"), "#78f0d0", "#102230");
      const material = new MeshStandardMaterial({
        map: texture,
        color: new Color("#dff8ff"),
        emissive: new Color("#123744"),
        emissiveIntensity: 0.38,
        roughness: 0.24,
        metalness: 0.5
      });
      const cube = new Mesh(cubeGeometry, material);
      cube.name = `CubXSelectableCube${index + 1}`;
      cube.position.copy(closedPositions[index]);
      cube.userData.cubxCubeIndex = index;
      cube.castShadow = true;
      animationRoot.add(cube);
      return cube;
    });
    this.archivePreviewGroup.add(root);

    const panelGroup = new Group();
    panelGroup.name = "CubXOpenedPanels";
    panelGroup.position.set(-3.7, 2.45, -0.25);
    panelGroup.visible = false;
    const panelPositions = [
      new Vector3(-1.34, 0.72, 0),
      new Vector3(1.34, 0.72, 0),
      new Vector3(-1.34, -0.72, 0),
      new Vector3(1.34, -0.72, 0)
    ];
    const panels = panelPositions.map((position, index) => {
      const material = new MeshStandardMaterial({
        map: this.createCubXLabelTexture(`PANEL ${index + 1}`, "SELECT A CUBE", "#ffbf69", "#17202d"),
        color: new Color("#ffffff"),
        emissive: new Color("#163848"),
        emissiveIntensity: 0.42,
        roughness: 0.3,
        metalness: 0.42
      });
      const panel = new Mesh(new BoxGeometry(2.42, 1.1, 0.16), material);
      panel.name = `CubXInsideButton${index + 1}`;
      panel.position.copy(position);
      panel.userData.cubxActionIndex = index;
      panel.castShadow = true;
      panelGroup.add(panel);
      return panel;
    });
    const backButton = new Mesh(
      new BoxGeometry(2.35, 0.52, 0.18),
      new MeshStandardMaterial({
        map: this.createCubXLabelTexture("CLOSE", "BACK ROTATE", "#f95f4c", "#24141a"),
        color: new Color("#ffffff"),
        emissive: new Color("#451015"),
        emissiveIntensity: 0.58,
        roughness: 0.3,
        metalness: 0.38
      })
    );
    backButton.name = "CubXInsideExitButton";
    backButton.position.set(0, -1.62, 0.02);
    backButton.userData.cubxBack = true;
    panelGroup.add(backButton);
    panelGroup.scale.setScalar(0.001);
    this.archivePreviewGroup.add(panelGroup);
    const openAnimatedNodes = CUBZ_TVA_CLIPS.open.panels.map((nodeName, index) => ({
      nodeName,
      cube: panels[index],
      basePosition: panels[index].position.clone(),
      baseQuaternion: panels[index].quaternion.clone(),
      baseScale: panels[index].scale.clone()
    }));

    const satelliteShell = this.buildCubXSatelliteShell(root.position);
    const sunButton = satelliteShell.sunButton;

    this.cubxMenu = {
      root,
      animationRoot,
      cubelets,
      closedPositions,
      openAnimatedNodes,
      panelGroup,
      panels,
      backButton,
      sunButton,
      satelliteGroup: satelliteShell.group,
      satelliteButtons: satelliteShell.buttons,
      satelliteObjects: satelliteShell.objects,
      activeMenuLevel: 0,
      selectedSatellite: null,
      phase: "idle",
      progress: 0,
      selectedCube: null,
      selectedAction: null,
      restQuaternion: new Quaternion(),
      startRotation: new Vector3(),
      targetRotation: new Vector3(),
      transitionDuration: CUBZ_ROTATION_DURATION_SECONDS,
      cameraSourcePosition: CUBX_CAMERA_SOURCE_START.clone(),
      cameraFlyComplete: false
    };
    this.syncCubXSatelliteVisibility(this.cubxMenu);

    const instruction = new Mesh(
      new PlaneGeometry(6.4, 1.15),
      new MeshBasicMaterial({
        map: this.createCubXLabelTexture("CLICK A CUBE", "ROTATE  →  OPEN  →  4 MENU PANELS", "#78f0d0", "#09131d"),
        transparent: true,
        side: DoubleSide
      })
    );
    instruction.position.set(-3.7, 0.52, 4.05);
    instruction.rotation.x = -0.56;
    this.archivePreviewGroup.add(instruction);

    const clockPanel = new Group();
    clockPanel.name = "ClockDisplayProxy";
    clockPanel.position.set(4.4, 1.2, 3.8);
    this.addClockDigits(clockPanel, "23:16");
    this.archivePreviewGroup.add(clockPanel);

    const controlPanelMaterial = new MeshStandardMaterial({ color: new Color("#202936"), roughness: 0.42, metalness: 0.42 });
    const labelMaterialOn = new MeshStandardMaterial({ color: new Color("#65d68f"), emissive: new Color("#10351d"), roughness: 0.24, metalness: 0.12 });
    const labelMaterialOff = new MeshStandardMaterial({ color: new Color("#f95f4c"), emissive: new Color("#3a0804"), roughness: 0.24, metalness: 0.12 });
    ["Light On", "Light Off", "Fan On", "Fan Off"].forEach((name, index) => {
      const panel = new Mesh(new BoxGeometry(2.2, 0.42, 0.95), controlPanelMaterial);
      panel.name = name.replace(/\s/g, "");
      panel.position.set(7.0, 0.5 + index * 0.58, -3.6 + index * 0.48);
      panel.rotation.y = -0.2;
      this.archivePreviewGroup.add(panel);
      const lamp = new Mesh(new SphereGeometry(0.16, 14, 10), index % 2 === 0 ? labelMaterialOn : labelMaterialOff);
      lamp.position.set(panel.position.x - 0.8, panel.position.y + 0.27, panel.position.z);
      this.archivePreviewGroup.add(lamp);
    });
  }

  private buildAssetCatalogPreview(): void {
    const panels = [
      "/assets/textures/Damier.jpg",
      "/assets/textures/90Right.png",
      "/assets/textures/ball/GridXL.bmp",
      "/assets/textures/RotatorUV.png",
      "/assets/textures/Suzanne1UV.png",
      "/assets/textures/archive/concrete.png",
      "/assets/textures/archive/flame1.jpg",
      "/assets/textures/archive/blue_flare.jpg"
    ];
    panels.forEach((path, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const panel = new Mesh(
        new PlaneGeometry(3.1, 3.1),
        new MeshStandardMaterial({
          map: this.loadTexture(path, 1, 1),
          color: new Color("#ffffff"),
          roughness: 0.58,
          metalness: 0.08,
          side: DoubleSide
        })
      );
      panel.position.set(-5.4 + column * 3.6, 4.2 - row * 3.6, -6.6);
      panel.userData.bob = 0.75 + index * 0.05;
      panel.userData.baseY = panel.position.y;
      this.archivePreviewGroup.add(panel);
    });

    const shell = new Mesh(
      new SphereGeometry(1.2, 32, 22),
      new MeshPhysicalMaterial({ color: new Color("#dff8ff"), transparent: true, opacity: 0.28, roughness: 0.08, metalness: 0.06, clearcoat: 1 })
    );
    shell.position.set(-6.2, 0.95, 3.8);
    shell.userData.spin = 0.36;
    this.archivePreviewGroup.add(shell);
    const shellWire = new LineSegments(
      new WireframeGeometry(new SphereGeometry(1.23, 16, 12)),
      new LineBasicMaterial({ color: new Color("#78f0d0"), transparent: true, opacity: 0.72 })
    );
    shellWire.position.copy(shell.position);
    shellWire.userData.spin = -0.42;
    this.archivePreviewGroup.add(shellWire);

    const ctrl = new Mesh(
      new SphereGeometry(0.72, 24, 16),
      new MeshStandardMaterial({ map: this.loadTexture("/assets/textures/ball/FireArrow800.jpg", 1, 1), color: new Color("#ffffff"), roughness: 0.3, metalness: 0.2 })
    );
    ctrl.position.copy(shell.position);
    ctrl.position.x += 0.12;
    this.archivePreviewGroup.add(ctrl);

    const piston = this.createPistonProxy();
    piston.position.set(-1.7, 0.85, 3.8);
    piston.userData.spin = 0.12;
    this.archivePreviewGroup.add(piston);

    const rotatorCube = new Mesh(
      new BoxGeometry(1.6, 1.6, 1.6),
      new MeshStandardMaterial({ map: this.loadTexture("/assets/textures/RotatorUV.png", 1, 1), color: new Color("#ffffff"), roughness: 0.35, metalness: 0.24 })
    );
    rotatorCube.position.set(2.6, 1.1, 3.8);
    rotatorCube.userData.spin = 0.7;
    this.archivePreviewGroup.add(rotatorCube);

    const airplane = this.createAirplaneProxy(new Color("#dfe5ee"), new Color("#d64138"));
    airplane.position.set(6.4, 1.7, 3.6);
    airplane.scale.setScalar(0.82);
    airplane.rotation.y = -0.5;
    airplane.userData.spin = 0.36;
    this.archivePreviewGroup.add(airplane);

    this.buildTvmShowcase();
  }

  /** real decoded TVM meshes: alphabet marquee, CubX, and the toy shelf */
  private buildTvmShowcase(): void {
    if (!this.ensureLegacyData(["tvm"])) {
      return;
    }
    const palette = ["#78f0d0", "#f0c46a", "#8fb4d6", "#f95f4c", "#c9a2f5", "#9fe08a"];
    let paletteIndex = 0;

    const buildTvmMesh = (
      positions: number[],
      indices: number[],
      targetSize: number,
      color: string
    ): Mesh => {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      const extent = box ? Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z, 0.001) : 1;
      const mesh = new Mesh(
        geometry,
        new MeshStandardMaterial({
          color: new Color(color),
          roughness: 0.42,
          metalness: 0.26,
          side: DoubleSide
        })
      );
      mesh.scale.setScalar(targetSize / extent);
      mesh.castShadow = true;
      return mesh;
    };

    // marquee: GRAPHYSX spelled with the real recovered alphabet meshes
    const word = "graphysx";
    const alphabet = tvmCatalog.alphabet as Record<string, { positions: number[]; indices: number[] }>;
    word.split("").forEach((glyph, index) => {
      const data = alphabet[glyph];
      if (!data) {
        return;
      }
      const mesh = buildTvmMesh(data.positions, data.indices, 1.55, "#ffe86b");
      mesh.position.set(-6.3 + index * 1.8, 6.9, -6.4);
      mesh.rotation.x = -Math.PI / 2;
      mesh.userData.bob = 0.9 + index * 0.07;
      mesh.userData.baseY = mesh.position.y;
      this.archivePreviewGroup.add(mesh);
    });

    // toy shelf: the decoded TVM assets on two rows
    const shelf = (tvmCatalog.assets as Array<{ id: string; positions: number[]; indices: number[] }>).filter(
      (asset) => asset.positions.length > 0
    );
    shelf.forEach((asset, index) => {
      const column = index % 7;
      const row = Math.floor(index / 7);
      const size = asset.id === "cubx" ? 2.3 : 1.5;
      const mesh = buildTvmMesh(asset.positions, asset.indices, size, palette[paletteIndex++ % palette.length]);
      mesh.position.set(-8.4 + column * 2.9, row === 0 ? 0.95 : 1.0, 7.6 + row * 3.1);
      mesh.userData.spin = 0.25 + (index % 5) * 0.09;
      this.archivePreviewGroup.add(mesh);

      const pedestal = new Mesh(
        new CylinderGeometry(0.85, 1.0, 0.24, 18),
        new MeshStandardMaterial({ color: new Color("#2a3542"), roughness: 0.8, metalness: 0.1 })
      );
      pedestal.position.set(mesh.position.x, 0.12, mesh.position.z);
      pedestal.receiveShadow = true;
      this.archivePreviewGroup.add(pedestal);
    });
  }

  private createLine(vertices: number[], color: string, opacity: number): Line {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    return new Line(
      geometry,
      new LineBasicMaterial({
        color: new Color(color),
        transparent: opacity < 1,
        opacity
      })
    );
  }

  private createAirplaneProxy(bodyColor: Color, accentColor: Color): Group {
    const airplane = new Group();
    airplane.name = "AirplaneAssetProxy";
    const bodyMaterial = new MeshStandardMaterial({ color: bodyColor, roughness: 0.4, metalness: 0.18 });
    const accentMaterial = new MeshStandardMaterial({ color: accentColor, emissive: accentColor.clone().multiplyScalar(0.18), roughness: 0.32, metalness: 0.2 });
    const fuselage = new Mesh(new CylinderGeometry(0.22, 0.34, 2.8, 16), bodyMaterial);
    fuselage.rotation.z = Math.PI / 2;
    const nose = new Mesh(new ConeGeometry(0.34, 0.7, 16), accentMaterial);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 1.75;
    const wing = new Mesh(new BoxGeometry(0.28, 0.08, 3.5), accentMaterial);
    const tail = new Mesh(new BoxGeometry(0.18, 0.86, 0.95), bodyMaterial);
    tail.position.x = -1.42;
    tail.position.y = 0.42;
    airplane.add(fuselage, nose, wing, tail);
    return airplane;
  }

  private createHumanProxy(primary: Color, secondary: Color): Group {
    const actor = new Group();
    const primaryMaterial = new MeshStandardMaterial({
      color: primary,
      emissive: primary.clone().multiplyScalar(0.12),
      roughness: 0.38,
      metalness: 0.12
    });
    const secondaryMaterial = new MeshStandardMaterial({
      color: secondary,
      roughness: 0.48,
      metalness: 0.18
    });
    const body = new Mesh(new CylinderGeometry(0.34, 0.42, 1.35, 16), primaryMaterial);
    body.position.y = 0.94;
    const head = new Mesh(new SphereGeometry(0.34, 18, 12), secondaryMaterial);
    head.position.y = 1.82;
    const leftArm = new Mesh(new BoxGeometry(0.18, 0.85, 0.18), secondaryMaterial);
    leftArm.position.set(-0.56, 1.08, 0.08);
    leftArm.rotation.z = -0.38;
    const rightArm = leftArm.clone();
    rightArm.position.x = 0.56;
    rightArm.rotation.z = 0.38;
    actor.add(body, head, leftArm, rightArm);
    return actor;
  }

  private createFlameBillboard(path: string): Mesh {
    const flame = new Mesh(
      new PlaneGeometry(1.1, 1.5),
      new MeshBasicMaterial({
        map: this.loadTexture(path, 1, 1),
        color: new Color("#ffffff"),
        transparent: true,
        opacity: 0.78,
        blending: AdditiveBlending,
        side: DoubleSide,
        depthWrite: false
      })
    );
    flame.rotation.y = -0.4;
    return flame;
  }

  private createCubXLabelTexture(title: string, subtitle: string, accent: string, background: string): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not create CubX label canvas");
    }

    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, background);
    gradient.addColorStop(1, "#05080d");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = accent;
    context.lineWidth = 14;
    context.strokeRect(13, 13, canvas.width - 26, canvas.height - 26);
    context.strokeStyle = "rgba(255,255,255,0.16)";
    context.lineWidth = 2;
    for (let x = 34; x < canvas.width; x += 38) {
      context.beginPath();
      context.moveTo(x, 18);
      context.lineTo(x - 64, canvas.height - 18);
      context.stroke();
    }
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#f4fbff";
    context.font = "700 58px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(title, canvas.width / 2, 105, canvas.width - 54);
    context.fillStyle = accent;
    context.font = "600 24px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(subtitle, canvas.width / 2, 177, canvas.width - 54);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  private addClockDigits(group: Group, value: string): void {
    const activeMaterial = new MeshStandardMaterial({ color: new Color("#78f0d0"), emissive: new Color("#06281f"), roughness: 0.28, metalness: 0.24 });
    const frameMaterial = new MeshStandardMaterial({ color: new Color("#131b24"), roughness: 0.46, metalness: 0.36 });
    const backing = new Mesh(new BoxGeometry(5.5, 1.55, 0.18), frameMaterial);
    backing.position.set(0, 0, -0.08);
    group.add(backing);

    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      const x = -2.05 + index * 1.02;
      if (char === ":") {
        const top = new Mesh(new SphereGeometry(0.09, 10, 8), activeMaterial);
        top.position.set(x, 0.26, 0.12);
        const bottom = top.clone();
        bottom.position.y = -0.26;
        group.add(top, bottom);
        continue;
      }
      const digit = Number(char);
      const segments = this.getDigitSegments(Number.isFinite(digit) ? digit : 0);
      const segmentSpecs: Array<[number, number, number, number]> = [
        [0, 0.42, 0.62, 0.1],
        [0.34, 0.2, 0.1, 0.42],
        [0.34, -0.25, 0.1, 0.42],
        [0, -0.48, 0.62, 0.1],
        [-0.34, -0.25, 0.1, 0.42],
        [-0.34, 0.2, 0.1, 0.42],
        [0, -0.03, 0.62, 0.1]
      ];
      segmentSpecs.forEach((spec, segmentIndex) => {
        if (!segments[segmentIndex]) {
          return;
        }
        const segment = new Mesh(new BoxGeometry(spec[2], spec[3], 0.12), activeMaterial);
        segment.position.set(x + spec[0], spec[1], 0.12);
        group.add(segment);
      });
    }
  }

  private getDigitSegments(digit: number): boolean[] {
    const patterns: Record<number, boolean[]> = {
      0: [true, true, true, true, true, true, false],
      1: [false, true, true, false, false, false, false],
      2: [true, true, false, true, true, false, true],
      3: [true, true, true, true, false, false, true],
      4: [false, true, true, false, false, true, true],
      5: [true, false, true, true, false, true, true],
      6: [true, false, true, true, true, true, true],
      7: [true, true, true, false, false, false, false],
      8: [true, true, true, true, true, true, true],
      9: [true, true, true, true, false, true, true]
    };
    return patterns[digit] ?? patterns[0];
  }

  private createPistonProxy(): Group {
    const piston = new Group();
    piston.name = "SuzannePistonProxy";
    const standMaterial = new MeshStandardMaterial({ color: new Color("#303640"), roughness: 0.38, metalness: 0.58 });
    const rodMaterial = new MeshStandardMaterial({ color: new Color("#f0b94a"), emissive: new Color("#321800"), roughness: 0.26, metalness: 0.72 });
    const base = new Mesh(new BoxGeometry(1.8, 0.28, 1.1), standMaterial);
    const rod = new Mesh(new CylinderGeometry(0.13, 0.13, 3.8, 18), rodMaterial);
    rod.rotation.z = Math.PI / 2;
    rod.position.y = 0.42;
    const head = new Mesh(new BoxGeometry(0.58, 0.58, 0.58), rodMaterial);
    head.position.x = 2.05;
    head.position.y = 0.42;
    piston.add(base, rod, head);
    return piston;
  }

  private getMathSurfaceY(x: number, _z: number): number {
    // legacy Formulas::moleculesUpdate — PARABOLA: y = ax^2 + bx + c, SLOPE: y = mx + b
    const { a, b, c, m, xOffset, formula } = this.mathParams;
    const xv = x + xOffset;
    const value = formula === "slope" ? m * xv + b : a * xv * xv + b * xv + c;
    return MathUtils.clamp(2.2 + value * 0.34, 0.1, 7.4);
  }

  private createControllerArrow(): Group {
    const arrow = new Group();
    arrow.name = "BallZInnerForceArrow";

    const material = new MeshStandardMaterial({
      color: new Color("#fff3a3"),
      emissive: new Color("#6d3200"),
      roughness: 0.28,
      metalness: 0.18,
      transparent: true,
      opacity: 0.92
    });
    const shaftLength = INNER_RADIUS * 0.58;
    const shaft = new Mesh(new BoxGeometry(INNER_RADIUS * 0.11, INNER_RADIUS * 0.035, shaftLength), material);
    shaft.position.z = shaftLength * 0.38;

    const head = new Mesh(new ConeGeometry(INNER_RADIUS * 0.16, INNER_RADIUS * 0.34, 4), material);
    head.rotation.x = Math.PI / 2;
    head.position.z = shaftLength * 0.78;

    arrow.add(shaft, head);
    return arrow;
  }

  private createFluidShader(): ShaderMaterial {
    return new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAccent: { value: new Color("#69d7ff") },
        uCore: { value: new Color("#0f4256") }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorld;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uAccent;
        uniform vec3 uCore;
        varying vec3 vNormal;
        varying vec3 vWorld;
        void main() {
          float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.0);
          float bands = sin((vWorld.x + vWorld.y * 0.7 + vWorld.z * 0.4) * 14.0 + uTime * 3.0) * 0.5 + 0.5;
          float pulse = smoothstep(0.25, 0.95, bands) * 0.28 + fresnel * 0.55;
          vec3 color = mix(uCore, uAccent, pulse);
          gl_FragColor = vec4(color, 0.18 + pulse * 0.28);
        }
      `
    });
  }

  private loadSkybox(key: RaceDefinition["skybox"]): Texture {
    const cached = this.skyboxCache.get(key);
    if (cached) {
      return cached;
    }

    const basePath = `/assets/sky/${key}`;
    const texture = loadArchiveCubeTexture(
      this.cubeTextureLoader,
      basePath,
      undefined,
      (error) => console.error(`Skybox failed to load: ${basePath}`, error),
      key === "nightsky" ? "bmp" : "jpg"
    );
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.skyboxCache.set(key, texture);
    return texture;
  }

  private applySkyboxPresentation(key: RaceDefinition["skybox"]): void {
    // Cube backgrounds are effectively infinitely far away, so camera distance
    // cannot make them smaller. A wider lens shows more of each cube face and
    // reduces texel magnification without smearing the source art.
    this.scene.backgroundBlurriness = 0;
    this.scene.backgroundIntensity = key === "clearnight" ? 0.84 : 1;
    this.camera.fov = key === "winter" ? 76 : key === "lostvalley" ? 64 : 70;
    this.camera.updateProjectionMatrix();
  }

  private loadTexture(path: string, repeatX = 1, repeatY = 1, colorData = true): Texture {
    const cacheKey = `${path}-${repeatX}-${repeatY}-${colorData ? "srgb" : "linear"}`;
    const cached = this.textureCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const texture = this.textureLoader.load(
      path,
      undefined,
      undefined,
      (error) => console.error(`Texture failed to load: ${path}`, error)
    );
    texture.colorSpace = colorData ? SRGBColorSpace : NoColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  private buildForceZoneVisuals(): void {
    const zones = this.race.forceZones ?? [];
    if (zones.length === 0) return;

    const fireMaterial = new MeshStandardMaterial({
      color: new Color("#ff6a2a"),
      emissive: new Color("#a61f00"),
      roughness: 0.25,
      metalness: 0.12
    });
    const iceMaterial = new MeshPhysicalMaterial({
      color: new Color("#87f0ff"),
      emissive: new Color("#075675"),
      transparent: true,
      opacity: 0.78,
      roughness: 0.08,
      clearcoat: 1
    });

    zones.forEach((zone, index) => {
      const group = new Group();
      group.name = `ForceZoneVisual-${zone.name}`;
      const radius = Math.min(zone.size[0], zone.size[2]) * 0.28;
      const halo = new Mesh(
        new RingGeometry(radius * 0.72, radius, 24),
        new MeshBasicMaterial({
          color: new Color(zone.kind === "fire" ? "#ffb33f" : "#9ff7ff"),
          transparent: true,
          opacity: 0.72,
          side: DoubleSide
        })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.02;
      group.add(halo);

      if (zone.kind === "fire") {
        for (let flameIndex = 0; flameIndex < 3; flameIndex += 1) {
          const flame = new Mesh(new ConeGeometry(radius * 0.23, radius * (0.62 + flameIndex * 0.12), 7), fireMaterial);
          flame.position.set((flameIndex - 1) * radius * 0.3, radius * 0.34, (flameIndex % 2 - 0.5) * radius * 0.22);
          flame.rotation.z = (flameIndex - 1) * 0.18;
          group.add(flame);
        }
      } else {
        const crystal = new Mesh(new IcosahedronGeometry(radius * 0.42, 0), iceMaterial);
        crystal.scale.y = 1.65;
        crystal.position.y = radius * 0.46;
        group.add(crystal);
      }

      const baseY = zone.position[1] + zone.size[1] / 2 + 0.03;
      group.position.set(zone.position[0], baseY, zone.position[2]);
      this.worldGroup.add(group);
      this.forceZoneVisuals.push({ group, kind: zone.kind, baseY, phase: index * 0.71 });
    });
  }

  private createMaterial(key: string): MeshStandardMaterial | MeshPhysicalMaterial {
    if (key === "glass") {
      return new MeshPhysicalMaterial({
        color: new Color("#97e7ff"),
        transparent: true,
        opacity: 0.24,
        roughness: 0.05,
        metalness: 0.08,
        transmission: 0.16,
        clearcoat: 1
      });
    }

    if (key === "ballz18-wood") {
      return new MeshStandardMaterial({
        map: this.loadTexture("/assets/textures/ballz18/WoodFloor05_col.jpg", 1, 1),
        roughnessMap: this.loadTexture("/assets/textures/ballz18/WoodFloor05_rgh.jpg", 1, 1, false),
        color: new Color("#ffffff"),
        roughness: 0.82,
        metalness: 0
      });
    }

    const colorByKey: Record<string, string> = {
      grid: "#1a655d",
      damier: "#e7e9e9",
      "abstract-cubes": "#30456d",
      marble: "#7a8a99",
      rust: "#74412f",
      rock: "#4d5662",
      mud: "#765b3c",
      grass: "#4f7b35",
      fire: "#ff5a24",
      ice: "#66e4ff",
      finish: this.race.palette.accent,
      danger: this.race.palette.danger,
      "arrow-gold": "#e9d65c",
      "arrow-brown": "#8a7647",
      "checker-dark": this.race.id === "zombie-hunt" ? "#526846" : "#0d0d12",
      "purple-grid": "#6b49ff",
      "gold-wall": "#b99738",
      "ballz18-wood": "#aa7447",
      "dark-wall": "#111017"
    };
    const textureByKey: Partial<Record<string, string>> = {
      grid: "/assets/textures/ball/GridXL.bmp",
      damier: "/assets/textures/FloorUV.png",
      "abstract-cubes": "/assets/textures/Level2.png",
      mud: "/assets/textures/archive/mud.bmp",
      grass: "/assets/textures/archive/grass.jpg",
      "arrow-gold": "/assets/textures/archive/yellowtwoway.jpg",
      "arrow-brown": "/assets/textures/archive/yellowtwoway.jpg",
      "checker-dark": "/assets/textures/Damier.jpg",
      "purple-grid": "/assets/textures/ball/GridXL.bmp",
      "gold-wall": "/assets/textures/archive/wood.jpg",
      "dark-wall": "/assets/textures/archive/xboxes03.jpg",
      finish: "/assets/textures/Damier.jpg",
      danger: "/assets/textures/90Right.png"
    };
    const repeatByKey: Partial<Record<string, [number, number]>> = {
      grid: [8, 8],
      damier: [3, 1],
      "abstract-cubes": [3, 3],
      marble: [2, 2],
      rust: [2, 6],
      rock: [2, 6],
      mud: [8, 8],
      grass: [8, 8],
      "arrow-gold": [6, 6],
      "arrow-brown": [7, 7],
      "checker-dark": [8, 8],
      "purple-grid": [5, 5],
      "gold-wall": [2, 8],
      "dark-wall": [2, 6],
      finish: [4, 1],
      danger: [2, 2]
    };
    const repeat = repeatByKey[key] ?? [2, 2];
    const texturePath = textureByKey[key];
    const designedSurface = [
      "abstract-cubes",
      "danger",
      "marble",
      "rust",
      "rock"
    ].includes(key);

    return new MeshStandardMaterial({
      map: designedSurface ? this.getDesignedSurfaceTexture(key) : texturePath ? this.loadTexture(texturePath, repeat[0], repeat[1]) : this.getPatternTexture(key, colorByKey[key] ?? "#516173"),
      color: new Color(
        key === "fire" || key === "ice" || key === "arrow-brown" || key === "purple-grid" || key === "gold-wall" || key === "dark-wall" || key === "checker-dark" || key === "mud" || key === "grass"
          ? colorByKey[key]
          : "#ffffff"
      ),
      roughness: key === "ice" ? 0.12 : key === "finish" || key === "danger" || key === "fire" || key === "arrow-gold" ? 0.34 : key === "rust" ? 0.48 : 0.76,
      metalness: key === "rust" || key === "finish" || key === "danger" || key === "arrow-gold" || key === "gold-wall" ? 0.34 : key === "marble" ? 0.16 : 0.08,
      emissive:
        key === "fire"
          ? new Color("#b62200").multiplyScalar(0.62)
          : key === "ice"
            ? new Color("#0b9fd2").multiplyScalar(0.46)
        : key === "danger"
          ? new Color(this.race.palette.danger).multiplyScalar(0.22)
          : key === "purple-grid"
            ? new Color("#12003a").multiplyScalar(0.5)
            : key === "checker-dark" && this.race.id === "zombie-hunt"
              ? new Color("#10230e").multiplyScalar(0.45)
            : new Color("#000000")
    });
  }

  private createMovingPartMaterial(spec: MovingPart): MeshStandardMaterial {
    const color = spec.kind === "rotator" ? new Color("#c9d1d9") : spec.kind === "piston" ? new Color("#f0b94a") : new Color("#8be0ff");
    const emissive = spec.kind === "piston" ? new Color("#4d1f00") : new Color("#0b2730");
    return new MeshStandardMaterial({
      color,
      emissive,
      roughness: spec.kind === "rotator" ? 0.26 : 0.38,
      metalness: 0.72
    });
  }

  private getDesignedSurfaceTexture(key: string): Texture {
    const cacheKey = `designed-${this.race.id}-${key}`;
    const cached = this.textureCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create designed surface canvas");
    }

    const paletteByRace: Record<string, { base: string; line: string; field: string; accent: string }> = {
      "green-grid-run": { base: "#101b18", line: "#38f26c", field: "#d8efe7", accent: "#76f0d0" },
      "rotator-cube-works": { base: "#16151b", line: "#d8dde5", field: "#26242f", accent: "#ffcf6b" },
      "piston-gateworks": { base: "#1b1410", line: "#e2a93c", field: "#2a211a", accent: "#ff6b35" },
      "skybox-spiral": { base: "#101827", line: "#9bdcff", field: "#17253a", accent: "#aaf0ff" }
    };
    const palette = paletteByRace[this.race.id] ?? paletteByRace["green-grid-run"];
    const drawArrowTile = (background: string, arrow: string, gridLine: string): void => {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const cell = 64;
      ctx.strokeStyle = gridLine;
      ctx.lineWidth = 2;
      for (let x = 0; x <= canvas.width; x += cell) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= canvas.height; y += cell) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += cell) {
        for (let x = 0; x < canvas.width; x += cell) {
          const flip = (x / cell + y / cell) % 2 === 0;
          ctx.save();
          ctx.translate(x + cell / 2, y + cell / 2);
          ctx.rotate(flip ? 0 : Math.PI);
          ctx.fillStyle = arrow;
          ctx.fillRect(-19, -5, 27, 10);
          ctx.beginPath();
          ctx.moveTo(21, 0);
          ctx.lineTo(4, -16);
          ctx.lineTo(4, -7);
          ctx.lineTo(-5, -7);
          ctx.lineTo(-5, 7);
          ctx.lineTo(4, 7);
          ctx.lineTo(4, 16);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    };

    ctx.fillStyle = palette.base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (key === "arrow-gold") {
      drawArrowTile("#f4e96f", "#080808", "rgba(35, 27, 0, 0.28)");
      const shine = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      shine.addColorStop(0, "rgba(255,255,255,0.26)");
      shine.addColorStop(0.45, "rgba(255,255,255,0.02)");
      shine.addColorStop(1, "rgba(0,0,0,0.24)");
      ctx.fillStyle = shine;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (key === "arrow-brown") {
      drawArrowTile("#5b4d32", "#090807", "rgba(255, 220, 130, 0.14)");
      ctx.fillStyle = "rgba(0,0,0,0.24)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (key === "checker-dark") {
      const size = 32;
      for (let y = 0; y < canvas.height; y += size) {
        for (let x = 0; x < canvas.width; x += size) {
          ctx.fillStyle = (x / size + y / size) % 2 === 0 ? "#06070b" : "#25262c";
          ctx.fillRect(x, y, size, size);
        }
      }
    } else if (key === "purple-grid") {
      ctx.fillStyle = "#13002f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(94, 34, 180, 0.55)";
      for (let y = 0; y < canvas.height; y += 32) {
        for (let x = 0; x < canvas.width; x += 32) {
          ctx.beginPath();
          ctx.arc(x + 16, y + 16, 9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = "rgba(146, 83, 255, 0.3)";
      ctx.lineWidth = 2;
      for (let x = 0; x <= canvas.width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= canvas.height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    } else if (key === "gold-wall") {
      drawArrowTile("#a37b23", "#1a1000", "rgba(255, 230, 130, 0.18)");
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      for (let y = 16; y < canvas.height; y += 48) {
        ctx.fillRect(0, y, canvas.width, 10);
      }
    } else if (key === "dark-wall") {
      ctx.fillStyle = "#09080e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(135, 110, 255, 0.22)";
      ctx.lineWidth = 4;
      for (let y = 18; y < canvas.height; y += 42) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y + 18);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (key === "grid") {
      ctx.fillStyle = palette.field;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(20, 230, 90, 0.52)";
      ctx.lineWidth = 2;
      for (let x = 0; x <= canvas.width; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= canvas.height; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(20, 230, 90, 0.18)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= canvas.width; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= canvas.height; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    } else if (key === "damier" || key === "finish") {
      ctx.fillStyle = "#f2f2eb";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const size = 64;
      for (let y = 0; y < canvas.height; y += size) {
        for (let x = 0; x < canvas.width; x += size) {
          ctx.fillStyle = (x / size + y / size) % 2 === 0 ? "#11131a" : "#f2f2eb";
          ctx.fillRect(x, y, size, size);
        }
      }
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 8;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    } else if (key === "abstract-cubes") {
      ctx.fillStyle = palette.field;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 3;
      for (let i = 0; i < 9; i += 1) {
        const inset = 32 + i * 22;
        ctx.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2);
      }
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(64, 70, 150, 110);
      ctx.fillRect(295, 275, 120, 150);
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(40, 405);
      ctx.lineTo(255, 255);
      ctx.lineTo(470, 120);
      ctx.stroke();
    } else if (key === "rust") {
      ctx.fillStyle = "#24242a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const bandGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      bandGradient.addColorStop(0, "rgba(255, 126, 77, 0.08)");
      bandGradient.addColorStop(0.5, "rgba(255, 190, 104, 0.2)");
      bandGradient.addColorStop(1, "rgba(255, 126, 77, 0.06)");
      for (let y = 38; y < canvas.height; y += 76) {
        ctx.fillStyle = bandGradient;
        ctx.fillRect(0, y, canvas.width, 20);
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(0,0,0,0.42)";
      ctx.lineWidth = 4;
      for (let x = 64; x < canvas.width; x += 96) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 24, canvas.height);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255, 210, 130, 0.28)";
      for (let x = 44; x < canvas.width; x += 132) {
        for (let y = 54; y < canvas.height; y += 152) {
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (key === "rock") {
      ctx.fillStyle = "#252a30";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(196, 216, 225, 0.18)";
      ctx.lineWidth = 3;
      for (let i = 0; i < 10; i += 1) {
        const x = 28 + i * 47;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (i % 2 === 0 ? 42 : -32), 170);
        ctx.lineTo(x + (i % 2 === 0 ? 12 : 56), 355);
        ctx.lineTo(x + 28, canvas.height);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(36, 44, 172, 88);
      ctx.fillRect(268, 188, 176, 120);
      ctx.fillRect(78, 350, 238, 74);
      ctx.strokeStyle = "rgba(0,0,0,0.32)";
      ctx.lineWidth = 8;
      ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
    } else if (key === "marble") {
      ctx.fillStyle = "#b9c2bd";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const highlight = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      highlight.addColorStop(0, "rgba(255,255,245,0.34)");
      highlight.addColorStop(0.55, "rgba(120,140,145,0.06)");
      highlight.addColorStop(1, "rgba(0,0,0,0.18)");
      ctx.fillStyle = highlight;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(38, 50, 55, 0.22)";
      ctx.lineWidth = 5;
      for (let y = 86; y < canvas.height; y += 118) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(130, y - 32, 250, y + 42, canvas.width, y - 10);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.38)";
      ctx.lineWidth = 4;
      ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
    } else if (key === "danger") {
      ctx.fillStyle = "#1f2024";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(256, 256);
      ctx.rotate(-Math.PI / 6);
      for (let x = -520; x < 520; x += 64) {
        ctx.fillStyle = (x / 64) % 2 === 0 ? "#efc94c" : "#202228";
        ctx.fillRect(x, -400, 34, 800);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(1, 1);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  private getPatternTexture(key: string, baseColor: string): Texture {
    const cacheKey = `${key}-${baseColor}`;
    const cached = this.textureCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const canvas = document.createElement("canvas");
    canvas.width = MATERIAL_TEXTURE_SIZE;
    canvas.height = MATERIAL_TEXTURE_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create texture canvas");
    }

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.55;

    if (key === "grid") {
      ctx.strokeStyle = "#a8ffe8";
      ctx.lineWidth = 2;
      for (let x = 0; x <= canvas.width; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= canvas.height; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    } else if (key === "damier" || key === "finish") {
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          ctx.fillStyle = (x + y) % 2 === 0 ? "#f5f5f5" : "#10151d";
          ctx.fillRect(x * 16, y * 16, 16, 16);
        }
      }
    } else if (key === "abstract-cubes") {
      for (let i = 0; i < 28; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? "#78f0d0" : "#567cff";
        ctx.fillRect(Math.random() * 110, Math.random() * 110, 12 + Math.random() * 22, 12 + Math.random() * 22);
      }
    } else {
      for (let i = 0; i < 44; i += 1) {
        ctx.strokeStyle = i % 2 === 0 ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.moveTo(Math.random() * 128, Math.random() * 128);
        ctx.lineTo(Math.random() * 128, Math.random() * 128);
        ctx.stroke();
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.repeat.set(2, 2);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());

    const deltaSeconds = Math.min(this.clock.getDelta(), 0.033);
    this.update(deltaSeconds);
    this.renderFrame();
  }

  private renderFrame(): void {
    if (this.composer && ((this.hazePass && this.hazePass.enabled) || this.transitionAmount > 0.01)) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private update(deltaSeconds: number): void {
    if (this.racePaused && !this.menuMode) {
      return;
    }
    const elapsedSeconds = performance.now() / 1000;
    this.particles.update(deltaSeconds);
    this.updateOverlay(deltaSeconds);
    if (this.waterMaterial) {
      this.waterMaterial.uniforms.uTime.value = elapsedSeconds;
    }
    if (this.hazePass) {
      this.hazePass.uniforms.uTime.value = elapsedSeconds;
    }
    if (this.transitionPass) {
      this.transitionAmount = Math.max(0, this.transitionAmount - deltaSeconds * 1.5);
      this.transitionPass.enabled = this.transitionAmount > 0.01;
      this.transitionPass.uniforms.uAmount.value = this.transitionAmount * this.transitionAmount;
    }
    if (this.menuMode && performance.now() - this.lastActivityMs > 10000) {
      // legacy Screensaver.cpp: after 10 s idle, orbit at 5°/s
      this.cameraYaw += MathUtils.degToRad(5) * deltaSeconds;
    }
    if (!this.ballPresetApplied) {
      this.ballPresetApplied = true;
      this.applyBallPreset();
    }
    if (this.input.consumePress("KeyB")) {
      const preset = this.toggleBallPreset();
      this.showOverlayWords([preset === "classic2015" ? "classic" : preset], 1.1);
      this.audio.start();
    }
    if (this.input.consumePress("KeyN")) {
      // tvScreen.cs 'd' — Newton physics debug view, reborn as a wireframe toggle
      this.debugWireframe = !this.debugWireframe;
      if (!this.debugOverrideMaterial) {
        this.debugOverrideMaterial = new MeshBasicMaterial({ wireframe: true, color: new Color("#65d68f") });
      }
      this.scene.overrideMaterial = this.debugWireframe ? this.debugOverrideMaterial : null;
    }
    this.updateAmbientMotion(deltaSeconds, elapsedSeconds);

    if (this.menuMode) {
      this.menuCube.rotation.x += deltaSeconds * 0.32;
      this.menuCube.rotation.y += deltaSeconds * 0.58;
      this.menuCube.children[2].rotation.y -= deltaSeconds * 1.4;
      if (this.previewMode === "common-room-lab" && this.commonRoomEnvironment && this.commonArchiveEnvironment) {
        const orbitInput = Number(this.input.isDown("KeyA")) - Number(this.input.isDown("KeyD"));
        if (this.commonEnvironmentSelection === "room2-shadow") {
          this.commonRoomEnvironment.update(deltaSeconds, orbitInput, this.camera);
        } else {
          this.commonArchiveEnvironment.update(deltaSeconds, orbitInput, this.camera);
        }
        return;
      }
      if (this.previewMode === "xml-myworld-copy" && this.xmlSceneEnvironment) {
        const orbitInput = Number(this.input.isDown("KeyA")) - Number(this.input.isDown("KeyD"));
        this.xmlSceneEnvironment.update(deltaSeconds, orbitInput, this.camera);
        return;
      }
      if (this.previewMode === "ballz-xml-worlds" && this.ballzXmlWorldsEnvironment) {
        const orbitInput = Number(this.input.isDown("KeyA")) - Number(this.input.isDown("KeyD"));
        this.ballzXmlWorldsEnvironment.update(deltaSeconds, orbitInput, this.camera);
        return;
      }
      if (this.previewMode === "xml-serializer-artifacts" && this.stockroomXmlArtifactEnvironment) {
        const orbitInput = Number(this.input.isDown("KeyA")) - Number(this.input.isDown("KeyD"));
        this.stockroomXmlArtifactEnvironment.update(deltaSeconds, orbitInput, this.camera);
        return;
      }
      if (this.previewMode === "vehicle-pack-gallery" && this.vehiclePackEnvironment) {
        const orbitInput = Number(this.input.isDown("KeyA")) - Number(this.input.isDown("KeyD"));
        this.vehiclePackEnvironment.update(deltaSeconds, orbitInput, this.camera);
        return;
      }
      if (this.previewMode === "object-library-catalog" && this.objectLibraryCatalogEnvironment) {
        const orbitInput = Number(this.input.isDown("KeyA")) - Number(this.input.isDown("KeyD"));
        this.objectLibraryCatalogEnvironment.update(deltaSeconds, orbitInput, this.camera);
        return;
      }
      if (this.previewMode === "dominus-asset-gallery" && this.dominusAssetGalleryEnvironment) {
        const orbitInput = Number(this.input.isDown("KeyA")) - Number(this.input.isDown("KeyD"));
        this.dominusAssetGalleryEnvironment.update(deltaSeconds, orbitInput, this.camera);
        return;
      }
      if (this.previewMode === "dominus-port-evidence" && this.dominusPortEvidenceEnvironment) {
        const orbitInput = Number(this.input.isDown("KeyA")) - Number(this.input.isDown("KeyD"));
        this.dominusPortEvidenceEnvironment.update(deltaSeconds, orbitInput, this.camera);
        return;
      }
      if (this.previewMode === "threejs-playground" && this.threejsPlaygroundEnvironment) {
        const orbitInput = Number(this.input.isDown("KeyA")) - Number(this.input.isDown("KeyD"));
        this.threejsPlaygroundEnvironment.update(deltaSeconds, orbitInput, this.camera);
        return;
      }
      if (this.previewMode === "ballz-blender-level1" && this.ballzBlenderLevel1Environment) {
        const orbitInput = Number(this.input.isDown("KeyA")) - Number(this.input.isDown("KeyD"));
        this.ballzBlenderLevel1Environment.update(deltaSeconds, orbitInput, this.camera);
        return;
      }
      if (this.previewMode === "maison-explorer" && this.maisonExplorerEnvironment) {
        const orbitInput = Number(this.input.isDown("KeyA")) - Number(this.input.isDown("KeyD"));
        this.maisonExplorerEnvironment.update(deltaSeconds, orbitInput, this.camera);
        return;
      }
      if (this.previewMode === "arena-archive" && this.arenaArchiveEnvironment) {
        const orbitInput = Number(this.input.isDown("KeyA")) - Number(this.input.isDown("KeyD"));
        this.arenaArchiveEnvironment.update(deltaSeconds, orbitInput, this.camera);
        return;
      }
      if (this.previewMode === "skybox-selector" && this.skyboxSelectorEnvironment) {
        const before = this.skyboxSelectorEnvironment.getState().phase;
        const after = this.skyboxSelectorEnvironment.update(deltaSeconds).phase;
        if (before !== after) {
          this.options.onArchiveSelectorStateChanged?.();
        }
        return;
      }
      if (this.previewMode === "car-selector" && this.carSelectorEnvironment) {
        const beforeFalling = this.carSelectorEnvironment.getState().car.fallingUnderArchiveGravity;
        const move = this.input.getMoveAxis();
        const raise = Number(this.input.isDown("KeyE")) - Number(this.input.isDown("KeyQ"));
        this.carSelectorEnvironment.applyArchiveCameraControl(
          {
            walk: move.forward * 0.003,
            strafe: move.turn * 0.003,
            raise: raise * 0.003,
            mouseDeltaX: 0,
            mouseDeltaY: 0
          },
          deltaSeconds * 1000
        );
        const after = this.carSelectorEnvironment.update(deltaSeconds);
        if (beforeFalling && !after.car.fallingUnderArchiveGravity) {
          this.options.onArchiveSelectorStateChanged?.();
        }
        return;
      }
      if (this.previewMode === "milky-way-lab" && this.milkyWayEnvironment) {
        this.milkyWayEnvironment.update(deltaSeconds);
      }
      if (this.previewMode === "suzanne2-archive" && this.suzanne2Environment) {
        this.suzanne2Environment.update(deltaSeconds);
      }
      if (this.previewMode === "cubx-actor-lineage" && this.cubxActorLineageEnvironment) {
        this.cubxActorLineageEnvironment.advance(deltaSeconds);
      }
      if (this.previewMode === "physics-lab") {
        this.updatePhysicsLab(deltaSeconds);
      }
      if (this.previewMode === "cubx-lab" && this.cubxMenu && !this.cubxMenu.cameraFlyComplete) {
        return;
      }
      this.updateVisitCamera(deltaSeconds);
      return;
    }

    if (!this.raceActive || this.raceFinished) {
      this.updateVisitCamera(deltaSeconds);
      return;
    }

    if (this.raceCountdownRemaining > 0) {
      this.raceCountdownRemaining = Math.max(0, this.raceCountdownRemaining - deltaSeconds);
      this.updateBallz18Countdown();
      this.input.reset();
      setBodyTransform(this.playerBody, this.raceStart);
      this.playerGroup.position.copy(this.raceStart);
      if (this.ballz18AiRival) {
        setBodyTransform(this.ballz18AiRival.body, this.ballz18AiRival.start);
        this.ballz18AiRival.group.position.copy(this.ballz18AiRival.start);
      }
      this.updateRaceFollowCamera(deltaSeconds);
      return;
    }

    this.elapsedMs += deltaSeconds * 1000;
    if (this.vehicleRig) {
      this.readVehicleInput(deltaSeconds);
    } else if (this.flightRig) {
      this.readFlightAndIntegrate(deltaSeconds);
    } else {
      this.activeForceZone = this.findPlayerForceZone();
      this.readInput(deltaSeconds);
      this.applyActiveForceZone(deltaSeconds);
    }
    this.updateBallz18AiRival(deltaSeconds);
    this.physics.step(deltaSeconds);
    if (this.vehicleRig) {
      this.syncVehicle();
    } else if (this.flightRig) {
      // flight already mirrored the ball body; nothing else to sync
    } else {
      this.applyBounds();
      this.syncPlayerVisuals();
      this.activeForceZone = this.findPlayerForceZone();
    }
    this.syncBallz18AiRival();
    this.updateRaceFollowCamera(deltaSeconds);
    this.updateNpcs(deltaSeconds);
    this.updateBullets();
    this.updateGhost(deltaSeconds);
    this.collectRings();
    this.checkLapProgress();
  }

  private updateCubXMenu(deltaSeconds: number): void {
    const menu = this.cubxMenu;
    if (!menu) {
      return;
    }
    this.updateCubXCameraFly(menu, deltaSeconds);

    if (menu.phase === "idle") {
      const idleStep = CUBX_IDLE_SPIN_RADIANS_PER_SECOND * deltaSeconds;
      menu.root.rotation.set(
        this.wrapCubXAngle(menu.root.rotation.x + idleStep),
        this.wrapCubXAngle(menu.root.rotation.y + idleStep),
        this.wrapCubXAngle(menu.root.rotation.z + idleStep)
      );
      return;
    }

    if (menu.phase === "rotating") {
      menu.progress = Math.min(1, menu.progress + deltaSeconds / menu.transitionDuration);
      this.applyCubzRotationAnimation(menu, menu.progress, "forward");
      menu.cubelets.forEach((cube, index) => {
        const selected = index === menu.selectedCube;
        cube.scale.setScalar(selected ? 1 + Math.sin(menu.progress * Math.PI) * 0.16 : 1);
      });
      if (menu.progress >= 1) {
        menu.cubelets.forEach((cube) => cube.scale.setScalar(1));
        menu.cubelets.forEach((cube) => { cube.visible = false; });
        menu.phase = "opening";
        menu.progress = 0;
        menu.panelGroup.visible = true;
        this.options.onCubXStateChanged?.();
      }
      return;
    }

    if (menu.phase === "opening" || menu.phase === "closing") {
      menu.progress = Math.min(1, menu.progress + deltaSeconds / CUBZ_OPEN_DURATION_SECONDS);
      const openAmount = menu.phase === "opening" ? menu.progress : 1 - menu.progress;
      this.applyCubzOpenAnimation(menu, openAmount);
      menu.panelGroup.scale.setScalar(Math.max(0.001, openAmount));
      if (menu.progress < 1) {
        return;
      }
      if (menu.phase === "opening") {
        menu.phase = "open";
        menu.progress = 0;
        // The decoded TV3D quaternions remain visible during the full opening
        // animation. Once it finishes, present the four actions as the menu
        // panels they are: a stable camera-facing 2×2 grid instead of leaving
        // the unverified handedness conversion edge-on and overlapping.
        const readablePanelPositions = [
          new Vector3(-1.34, 0.72, 0),
          new Vector3(1.34, 0.72, 0),
          new Vector3(-1.34, -0.72, 0),
          new Vector3(1.34, -0.72, 0)
        ];
        menu.panels.forEach((panel, index) => {
          panel.position.copy(readablePanelPositions[index]);
          panel.quaternion.identity();
          panel.scale.setScalar(1);
        });
        menu.backButton.quaternion.identity();
        this.cameraYaw = 0;
        this.cameraPitch = 0.32;
        this.cameraDistance = 8.4;
        this.options.onCubXStateChanged?.();
      } else {
        menu.panelGroup.visible = false;
        menu.cubelets.forEach((cube) => { cube.visible = true; });
        menu.satelliteGroup.visible = true;
        this.syncCubXSatelliteVisibility(menu);
        if (menu.selectedCube === 0) {
          menu.phase = "idle";
          menu.progress = 0;
          menu.selectedCube = null;
          menu.selectedAction = null;
          this.cameraYaw = 0.78;
          this.cameraPitch = 0.65;
          this.cameraDistance = 9.4;
        } else {
          menu.phase = "returning";
          menu.progress = 0;
          menu.transitionDuration = CUBZ_ROTATION_DURATION_SECONDS;
        }
        this.options.onCubXStateChanged?.();
      }
      return;
    }

    if (menu.phase === "returning") {
      menu.progress = Math.min(1, menu.progress + deltaSeconds / menu.transitionDuration);
      this.applyCubzRotationAnimation(menu, menu.progress, "reverse");
      if (menu.progress >= 1) {
        menu.phase = "idle";
        menu.progress = 0;
        menu.selectedCube = null;
        menu.selectedAction = null;
        this.cameraYaw = 0.78;
        this.cameraPitch = 0.65;
        this.cameraDistance = 9.4;
        this.options.onCubXStateChanged?.();
      }
    }
  }

  private wrapCubXAngle(angle: number): number {
    return MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
  }

  private updateCubXCameraFly(menu: CubXMenuRuntime, deltaSeconds: number): void {
    if (menu.cameraFlyComplete) return;
    const frameScale = deltaSeconds * 60;
    const source = menu.cameraSourcePosition;
    source.x = Math.max(CUBX_CAMERA_SOURCE_TARGET.x, source.x + CUBX_CAMERA_SOURCE_STEP_PER_FRAME.x * frameScale);
    source.y = Math.min(CUBX_CAMERA_SOURCE_TARGET.y, source.y + CUBX_CAMERA_SOURCE_STEP_PER_FRAME.y * frameScale);
    source.z = Math.min(CUBX_CAMERA_SOURCE_TARGET.z, source.z + CUBX_CAMERA_SOURCE_STEP_PER_FRAME.z * frameScale);

    this.camera.position.set(
      menu.root.position.x + (source.x - CUBX_SOURCE_POSITION.x) * CUBZ_DISPLAY_SCALE,
      menu.root.position.y + (source.y - CUBX_SOURCE_POSITION.y) * CUBZ_DISPLAY_SCALE,
      menu.root.position.z - (source.z - CUBX_SOURCE_POSITION.z) * CUBZ_DISPLAY_SCALE
    );
    this.camera.lookAt(menu.root.position);
    menu.cameraFlyComplete = source.distanceToSquared(CUBX_CAMERA_SOURCE_TARGET) < 0.0001;
    if (menu.cameraFlyComplete) {
      // Preserve the exact source fly telemetry above, then use a disclosed
      // inspection framing so the 8-cube menu occupies the canvas instead of
      // remaining a tiny cluster at the source camera's converted distance.
      this.cameraDistance = 9.4;
      this.cameraYaw = 0.78;
      this.cameraPitch = 0.65;
      this.options.onCubXStateChanged?.();
    }
  }

  private applyCubzRotationAnimation(menu: CubXMenuRuntime, progress: number, direction: "forward" | "reverse"): void {
    if (menu.selectedCube === null || menu.selectedCube < 1) return;
    const selection = menu.selectedCube as CubzRotationSelection;
    const elapsed = Math.min(1, Math.max(0, progress)) * CUBZ_ROTATION_DURATION_SECONDS;
    const bind = sampleCubzRotationForward(selection, 0).globalCube.quaternion;
    const sample = direction === "forward"
      ? sampleCubzRotationForward(selection, elapsed)
      : sampleCubzRotationReverse(selection, elapsed);
    const delta = new Quaternion(...bind).invert().multiply(new Quaternion(...sample.globalCube.quaternion));
    menu.root.quaternion.copy(menu.restQuaternion).multiply(delta).normalize();
  }

  private applyCubzOpenAnimation(menu: CubXMenuRuntime, progress: number): void {
    const elapsed = Math.min(1, Math.max(0, progress)) * CUBZ_OPEN_DURATION_SECONDS;
    const sample = sampleCubzOpenForward(elapsed);
    const bind = sampleCubzOpenForward(0);
    for (const animatedNode of menu.openAnimatedNodes) {
      const bindNode = bind.panels[animatedNode.nodeName];
      const sourceNode = sample.panels[animatedNode.nodeName];
      const deltaQuaternion = new Quaternion(...bindNode.quaternion)
        .invert()
        .multiply(new Quaternion(...sourceNode.quaternion));
      animatedNode.cube.position.copy(animatedNode.basePosition);
      animatedNode.cube.quaternion.copy(animatedNode.baseQuaternion).multiply(deltaQuaternion).normalize();
      animatedNode.cube.scale.copy(animatedNode.baseScale);
    }
  }

  private updateAmbientMotion(deltaSeconds: number, elapsedSeconds: number): void {
    if (this.menuMode && this.previewMode === "nature-lab") {
      this.natureLab?.update(deltaSeconds);
    }
    if (this.menuMode && this.previewMode === "world-api-lab") {
      if (!this.agentTransformControls.dragging) this.agentWorld?.update(deltaSeconds);
    }

    if (this.suzanneAsciiEnvironment) {
      this.suzanneAsciiEnvironment.update(deltaSeconds);
      this.suzanneAsciiEnvironment.pistonAssemblies.forEach((assembly, index) => {
        const activation = 0.5 + Math.sin(elapsedSeconds * (1.1 + index * 0.17) + index * 1.4) * 0.5;
        this.suzanneAsciiEnvironment?.setPistonActivation(index, activation);
        const body = this.suzannePistonBodies[index];
        if (!body) {
          return;
        }
        assembly.group.updateMatrixWorld(true);
        const position = assembly.plate.getWorldPosition(new Vector3());
        const orientation = assembly.plate.getWorldQuaternion(new Quaternion());
        this.physics.moveKinematicBody(body, position, orientation);
      });
    }

    for (const ring of this.ringMeshes) {
      const baseYaw = typeof ring.userData.baseYaw === "number" ? ring.userData.baseYaw : 0;
      const phase = typeof ring.userData.phase === "number" ? ring.userData.phase : 0;
      const spin = typeof ring.userData.spin === "number" ? ring.userData.spin : 1.15;
      ring.rotation.y = baseYaw + Math.sin(elapsedSeconds * 1.35 + phase) * 0.07;
      ring.rotation.z += deltaSeconds * spin;
    }

    for (const visual of this.forceZoneVisuals) {
      const speed = visual.kind === "fire" ? 1.8 : -0.75;
      visual.group.rotation.y += deltaSeconds * speed;
      visual.group.position.y = visual.baseY + Math.sin(elapsedSeconds * 2.4 + visual.phase) * 0.055;
      const pulse = 1 + Math.sin(elapsedSeconds * 3 + visual.phase) * (visual.kind === "fire" ? 0.09 : 0.045);
      visual.group.scale.setScalar(pulse);
    }

    for (const part of this.movingParts) {
      const { spec, mesh, basePosition } = part;
      const phase = spec.phase ?? 0;
      mesh.position.copy(basePosition);
      mesh.rotation.set(0, 0, 0);

      if (spec.kind === "rotator") {
        mesh.rotation.y = elapsedSeconds * spec.speed + phase;
      } else if (spec.kind === "piston") {
        const offset = Math.sin(elapsedSeconds * spec.speed + phase) * (spec.amplitude ?? 2);
        mesh.position[spec.axis] = basePosition[spec.axis] + offset;
      } else if (spec.kind === "elevator") {
        const offset = Math.sin(elapsedSeconds * spec.speed + phase) * (spec.amplitude ?? 1);
        mesh.position.y = basePosition.y + offset;
      }

      const rotation = new Quaternion().setFromEuler(mesh.rotation);
      this.physics.moveKinematicBody(part.body, mesh.position, rotation);
      part.previousPosition.copy(mesh.position);
    }

    for (const part of this.legacyParts) {
      if (part.kind === "rotator") {
        part.mesh.rotation.y = elapsedSeconds * part.speed + part.phase;
        this.physics.moveKinematicBody(part.body, part.mesh.position, part.mesh.quaternion);
        continue;
      }

      const offset = Math.sin(elapsedSeconds * part.speed + part.phase) * part.amplitude;
      part.mesh.position.copy(part.basePosition);
      part.mesh.position[part.axis] += offset;
      this.physics.moveKinematicBody(part.body, part.mesh.position, part.mesh.quaternion);
      part.previousPosition.copy(part.mesh.position);
    }

    if (this.airplaneFlyer) {
      const t = (elapsedSeconds / 48) % 1;
      const position = this.airplaneFlyer.curve.getPointAt(t);
      const ahead = this.airplaneFlyer.curve.getPointAt((t + 0.008) % 1);
      this.airplaneFlyer.mesh.position.copy(position);
      this.airplaneFlyer.mesh.lookAt(ahead);
    }

    this.updateAtmosphere(elapsedSeconds);

    if (this.menuMode && this.previewMode === "game-lab") {
      this.particlePresetLibraryEnvironment?.update(deltaSeconds);
      this.particlePreviewAccumulator += deltaSeconds;
      while (this.particlePreviewAccumulator >= 0.085) {
        this.particlePreviewAccumulator -= 0.085;
        this.particles.burst(new Vector3(-3.8, 0.55, 5.6), 7, 3.4, 1.3, "#ff7a35");
        this.particles.burst(new Vector3(0, 0.55, 5.9), 6, 2.7, 1.5, "#6cf5ff");
        this.particles.burst(new Vector3(3.8, 0.55, 5.6), 7, 3.1, 1.35, "#bd82ff");
      }
    }

    const fluidPulse = 1 + Math.sin(elapsedSeconds * 3.2) * 0.018;
    this.fluidLayer.scale.setScalar(fluidPulse);
    this.fluidLayer.rotation.y -= deltaSeconds * 0.42;
    this.fluidLayer.rotation.z += deltaSeconds * 0.18;
    if (this.fluidLayer.material instanceof ShaderMaterial) {
      this.fluidLayer.material.uniforms.uTime.value = elapsedSeconds;
      this.fluidLayer.material.uniforms.uAccent.value = this.accent;
    }

    if (this.archivePreviewGroup.visible) {
      if (this.previewMode === "cubx-lab") {
        this.updateCubXMenu(deltaSeconds);
      }
      this.archivePreviewGroup.traverse((child) => {
        const spin = child.userData.spin;
        if (typeof spin === "number") {
          child.rotation.y += deltaSeconds * spin;
        }

        const bob = child.userData.bob;
        const baseY = child.userData.baseY;
        if (typeof bob === "number" && typeof baseY === "number") {
          child.position.y = baseY + Math.sin(elapsedSeconds * bob) * 0.16;
        }
      });
    }
  }

  private readInput(deltaSeconds: number): void {
    const moveAxis = this.input.getMoveAxis();
    const cameraForwardX = -Math.sin(this.cameraYaw);
    const cameraForwardZ = -Math.cos(this.cameraYaw);
    const cameraRightX = Math.cos(this.cameraYaw);
    const cameraRightZ = -Math.sin(this.cameraYaw);
    const desired = new Vector2(
      cameraRightX * moveAxis.turn + cameraForwardX * moveAxis.forward,
      cameraRightZ * moveAxis.turn + cameraForwardZ * moveAxis.forward
    );
    if (desired.lengthSq() > 1) {
      desired.normalize();
    }
    this.controllerVector.copy(desired);

    const control = this.input.isDown("ShiftLeft") || this.input.isDown("ShiftRight") ? 1.25 : 1;
    const controlMagnitude = desired.length();
    const targetX = desired.x * INNER_MAX_OFFSET;
    const targetZ = desired.y * INNER_MAX_OFFSET;
    this.innerBall.position.x = MathUtils.damp(this.innerBall.position.x, targetX, 11, deltaSeconds);
    this.innerBall.position.z = MathUtils.damp(this.innerBall.position.z, targetZ, 11, deltaSeconds);
    if (controlMagnitude > 0.001) {
      this.arrowHeading = Math.atan2(desired.x, desired.y);
    } else {
      this.arrowHeading = Math.PI;
    }
    const displayMagnitude = Math.max(controlMagnitude, 0.45);
    this.innerArrow.position.x = this.innerBall.position.x + Math.sin(this.arrowHeading) * INNER_RADIUS * 0.1;
    this.innerArrow.position.y = this.innerBall.position.y + INNER_RADIUS * 0.84;
    this.innerArrow.position.z = this.innerBall.position.z + Math.cos(this.arrowHeading) * INNER_RADIUS * 0.1;
    this.innerArrow.scale.setScalar(0.78 + displayMagnitude * 0.22);
    this.innerArrow.rotation.set(0, this.arrowHeading, 0);

    if (this.race.npcs && this.input.consumePress("KeyF")) {
      this.fireBullet();
    }

    const grounded = this.isPlayerGrounded();
    const bodyPosition = this.readBodyPosition(this.playerBody);
    const bodyVelocity = this.readBodyVelocity(this.playerBody);
    const forceScale = grounded ? CONTROL_FORCE : AIR_CONTROL_FORCE;
    if (controlMagnitude > 0.001) {
      this.physics.applyForce(
        this.playerBody,
        new Vector3(desired.x * forceScale * control, 0, desired.y * forceScale * control),
        bodyPosition
      );
    }

    if (grounded && this.activeForceZone?.kind !== "ice") {
      const idleGrip = this.ballPreset === "classic2015" ? 0.87 : 0.94;
      const grip = controlMagnitude > 0.001 ? BALLZ_GROUND_GRIP : idleGrip;
      const gripStep = Math.pow(grip, deltaSeconds * 60);
      bodyVelocity.x *= gripStep;
      bodyVelocity.z *= gripStep;
    }

    // legacy CLBallZ: with no input and |omega| > 3, angular velocity halves each frame
    if (this.ballPreset === "classic2015" && controlMagnitude <= 0.001) {
      const omega = this.readBodyAngularVelocity(this.playerBody);
      if (omega.length() > 3) {
        const brake = Math.pow(0.5, deltaSeconds * 60);
        omega.multiplyScalar(brake);
        this.physics.writeAngularVelocity(this.playerBody, omega, false);
      }
    }

    const horizontalSpeed = Math.hypot(bodyVelocity.x, bodyVelocity.z);
    if (horizontalSpeed > BALLZ_MAX_GROUND_SPEED) {
      const limit = BALLZ_MAX_GROUND_SPEED / horizontalSpeed;
      bodyVelocity.x *= limit;
      bodyVelocity.z *= limit;
    }
    bodyVelocity.y = Math.max(bodyVelocity.y, -18);

    if (grounded) {
      this.canJump = true;
    }

    if (this.input.consumePress("KeyC")) {
      this.cameraYaw = this.getDefaultRaceCameraYaw();
      this.cameraPitch = this.getDefaultRaceCameraPitch();
      this.raceCameraDistance = this.getDefaultRaceCameraDistance();
    }

    const jumped = this.input.consumePress("Space") && this.canJump;
    if (jumped) {
      bodyVelocity.y = 9.2;
      this.canJump = false;
      this.particles.burst(this.playerGroup.position, 28, 3.8, 0.52);
    }
    this.physics.writeLinearVelocity(this.playerBody, bodyVelocity, controlMagnitude > 0.001 || jumped);
  }

  private findPlayerForceZone(): RaceForceZone | null {
    const position = this.readBodyPosition(this.playerBody);
    return this.race.forceZones?.find((zone) => {
      const halfX = zone.size[0] / 2;
      const halfY = zone.size[1] / 2;
      const halfZ = zone.size[2] / 2;
      return Math.abs(position.x - zone.position[0]) <= halfX
        && Math.abs(position.z - zone.position[2]) <= halfZ
        && position.y >= zone.position[1] - halfY - this.playerRadius
        && position.y <= zone.position[1] + halfY + this.playerRadius * 1.45;
    }) ?? null;
  }

  private applyActiveForceZone(deltaSeconds: number): void {
    const zone = this.activeForceZone;
    if (!zone) {
      this.forceEffectAccumulator = 0;
      return;
    }

    const playerPosition = this.readBodyPosition(this.playerBody);
    const offsetX = playerPosition.x - zone.position[0];
    const offsetZ = playerPosition.z - zone.position[2];
    const distance = Math.hypot(offsetX, offsetZ);
    const fallbackDirection = zone.position[0] >= 0 ? 1 : -1;
    const directionX = distance > 0.05 ? offsetX / distance : fallbackDirection;
    const directionZ = distance > 0.05 ? offsetZ / distance : 0;
    if (zone.kind === "fire") {
      this.physics.applyForce(this.playerBody, new Vector3(directionX * 58, 44, directionZ * 58), playerPosition);
    } else {
      this.physics.applyForce(this.playerBody, new Vector3(-directionX * 34, 0, -directionZ * 34), playerPosition);
    }

    this.forceEffectAccumulator += deltaSeconds;
    if (this.forceEffectAccumulator >= 0.08) {
      this.forceEffectAccumulator %= 0.08;
      const color = zone.kind === "fire" ? "#ff6a2a" : "#73eaff";
      const origin = new Vector3(
        playerPosition.x,
        Math.max(0.25, playerPosition.y - this.playerRadius * 0.65),
        playerPosition.z
      );
      this.particles.burst(origin, zone.kind === "fire" ? 7 : 4, zone.kind === "fire" ? 3.2 : 1.5, 0.42, color);
    }
  }

  private syncPlayerVisuals(): void {
    const currentPosition = this.readBodyPosition(this.playerBody);
    const deltaX = currentPosition.x - this.previousPlayerPosition.x;
    const deltaZ = currentPosition.z - this.previousPlayerPosition.z;
    const horizontalDistance = Math.hypot(deltaX, deltaZ);
    this.playerGroup.position.copy(currentPosition);
    this.playerGroup.quaternion.identity();
    if (horizontalDistance > 0.0005) {
      const rollX = deltaZ / this.playerRadius;
      const rollZ = -deltaX / this.playerRadius;
      this.shell.rotation.x += rollX;
      this.shell.rotation.z += rollZ;
      this.shellWire.rotation.x += rollX;
      this.shellWire.rotation.z += rollZ;
    }
    this.innerBall.rotation.set(-Math.PI / 2, this.arrowHeading, 0);
    this.previousPlayerPosition.copy(currentPosition);
  }

  /** contact-normal grounded check — works on elevated terrain, not just y≈0 floors */
  private isPlayerGrounded(): boolean {
    const fallbackFloorY = this.playerRadius + 0.05;
    const position = this.readBodyPosition(this.playerBody);
    const velocity = this.readBodyVelocity(this.playerBody);
    if (
      this.race.bounds.minY === undefined &&
      position.y <= fallbackFloorY + 0.08 &&
      velocity.y <= 0.2
    ) {
      return true;
    }

    return this.physics.isBodyGrounded(this.playerBody, 0.35);
  }

  private applyBounds(): void {
    const bounds = this.race.bounds;
    const position = this.readBodyPosition(this.playerBody);
    const velocity = this.readBodyVelocity(this.playerBody);
    position.x = MathUtils.clamp(position.x, bounds.minX + this.playerRadius, bounds.maxX - this.playerRadius);
    position.z = MathUtils.clamp(position.z, bounds.minZ + this.playerRadius, bounds.maxZ - this.playerRadius);
    if (bounds.minY !== undefined) {
      // terrain race: falling below the world respawns the ball at the start
      if (position.y < bounds.minY + this.playerRadius) {
        setBodyTransform(this.playerBody, this.raceStart);
        position.copy(this.raceStart);
        velocity.set(0, 0, 0);
      }
    } else {
      const fallbackFloorY = this.playerRadius + 0.05;
      if (position.y < fallbackFloorY) {
        position.y = fallbackFloorY;
        if (velocity.y < 0) {
          velocity.y = 0;
        }
      }
    }
    this.writeBodyPosition(this.playerBody, position, false);
    this.physics.writeLinearVelocity(this.playerBody, velocity, false);
    this.playerGroup.position.copy(position);
  }

  private updateVisitCamera(deltaSeconds: number, immediate = false): void {
    this.cameraCollision.active = false;
    this.cameraCollision.hitBodyId = null;
    this.cameraCollision.resolvedDistance = this.cameraCollision.desiredDistance;
    const target =
      this.previewMode === "race-preview"
        ? new Vector3(
            (this.race.bounds.minX + this.race.bounds.maxX) * 0.5,
            1.5,
            (this.race.bounds.minZ + this.race.bounds.maxZ) * 0.5
          )
        : this.previewMode === "menu"
          ? new Vector3(0, 4.2, 0)
          : this.previewMode === "cubx-lab"
            ? new Vector3(-3.7, 2.45, -0.25)
          : this.previewMode === "ballz-2011-level1"
            ? new Vector3(0, 22, 0)
          : this.previewMode === "ballz-slide1"
              ? new Vector3(0, 22, 0)
            : this.previewMode === "ballz-track-gallery" && this.ballzTrackGalleryEnvironment
              ? new Vector3(...this.ballzTrackGalleryEnvironment.getCameraProfile(this.ballzTrackGalleryCameraProfile).target)
            : this.previewMode === "suzanne2-archive"
              ? new Vector3(20, 0.8, 20)
            : this.previewMode === "notes-manager-lab"
              ? new Vector3(0, 6, 0)
            : this.previewMode === "milky-way-lab"
                ? new Vector3(0, 3, 0)
              : this.previewMode === "cubx-actor-lineage"
                ? new Vector3(0, 0, 0)
                : new Vector3(0, this.previewMode === "math-lab" ? 2.8 : 2.3, 0);
    const horizontalDistance = Math.cos(this.cameraPitch) * this.cameraDistance;
    const desired = new Vector3(
      target.x + Math.sin(this.cameraYaw) * horizontalDistance,
      target.y + Math.sin(this.cameraPitch) * this.cameraDistance,
      target.z + Math.cos(this.cameraYaw) * horizontalDistance
    );
    this.moveCameraToward(desired, target, immediate ? 1000 : 5.2, deltaSeconds);
  }

  private updateRaceFollowCamera(deltaSeconds: number, immediate = false): void {
    const target = this.playerGroup.position.clone();
    target.y += 1.05;
    const playerVelocity = this.readBodyVelocity(this.playerBody);
    const horizontalSpeed = Math.hypot(playerVelocity.x, playerVelocity.z);
    const chaseDistance = this.raceCameraDistance + Math.min(2.5, horizontalSpeed * 0.12);
    const horizontalDistance = Math.cos(this.cameraPitch) * chaseDistance;
    const desired = new Vector3(
      target.x + Math.sin(this.cameraYaw) * horizontalDistance,
      target.y + Math.sin(this.cameraPitch) * chaseDistance,
      target.z + Math.cos(this.cameraYaw) * horizontalDistance
    );
    const collisionSafeDesired = this.resolveRaceCameraCollision(target, desired);
    this.moveCameraToward(collisionSafeDesired, target, immediate ? 1000 : 7.2, deltaSeconds);
  }

  /**
   * Keep the chase camera on the player-facing side of physical level geometry.
   * The ray begins outside BallZ so its own body cannot occlude the camera.
   */
  private resolveRaceCameraCollision(target: Vector3, desired: Vector3): Vector3 {
    const direction = desired.clone().sub(target);
    const desiredDistance = direction.length();
    this.cameraCollision.desiredDistance = desiredDistance;
    this.cameraCollision.resolvedDistance = desiredDistance;
    this.cameraCollision.active = false;
    this.cameraCollision.hitBodyId = null;
    if (desiredDistance <= 0.001) {
      return desired;
    }
    // Vehicle tracks are large triangle meshes whose banked road surface can
    // sit between the chassis target and an otherwise valid high chase view.
    // Treating that driveable surface as a wall pushed the Piste camera inside
    // the black underside. Flight similarly has no authored solid chase-wall
    // problem, so both dedicated controllers keep their requested camera path.
    if (this.race.vehicle || this.race.flight) {
      return desired;
    }

    direction.multiplyScalar(1 / desiredDistance);
    const startOffset = Math.min(0.65, desiredDistance * 0.1);
    const start = target.clone().addScaledVector(direction, startOffset);
    const hit = this.physics.castSegmentClosest(start, desired, {
      skipBackfaces: true,
      excludeBody: this.playerBody
    });
    if (!hit) {
      return desired;
    }

    const point = hit.point;
    const hitDistance = Math.hypot(point.x - target.x, point.y - target.y, point.z - target.z);
    if (hitDistance >= desiredDistance - 0.05) {
      return desired;
    }

    const resolvedDistance = MathUtils.clamp(hitDistance - 0.35, 0.55, desiredDistance);
    this.cameraCollision.active = true;
    this.cameraCollision.hitBodyId = hit.body?.handle ?? null;
    this.cameraCollision.resolvedDistance = resolvedDistance;

    // A direct wall hit can otherwise collapse the camera almost into BallZ.
    // When there is too little shoulder room, prefer a short elevated view and
    // ray-test that route as well. This preserves wall avoidance while keeping
    // the player readable instead of accepting an extreme close-up.
    if (resolvedDistance < 2.4 && desiredDistance > 3.2) {
      const elevatedDirection = direction.clone();
      elevatedDirection.y = Math.max(elevatedDirection.y, 1.35);
      elevatedDirection.normalize();
      const elevatedDesiredDistance = Math.min(desiredDistance, 6);
      const elevatedDesired = target.clone().addScaledVector(elevatedDirection, elevatedDesiredDistance);
      const elevatedStart = target.clone().addScaledVector(elevatedDirection, 0.65);
      const elevatedHit = this.physics.castSegmentClosest(elevatedStart, elevatedDesired, {
        skipBackfaces: true,
        excludeBody: this.playerBody
      });
      let elevatedResolvedDistance = elevatedDesiredDistance;
      if (elevatedHit) {
        const elevatedPoint = elevatedHit.point;
        const elevatedHitDistance = Math.hypot(
          elevatedPoint.x - target.x,
          elevatedPoint.y - target.y,
          elevatedPoint.z - target.z
        );
        elevatedResolvedDistance = MathUtils.clamp(elevatedHitDistance - 0.35, 0.65, elevatedDesiredDistance);
      }
      if (elevatedResolvedDistance >= resolvedDistance + 1.1) {
        this.cameraCollision.resolvedDistance = elevatedResolvedDistance;
        return target.clone().addScaledVector(elevatedDirection, elevatedResolvedDistance);
      }
    }
    return target.clone().addScaledVector(direction, resolvedDistance);
  }

  private getRacePreviewDistance(): number {
    if (this.race.id === "ballz18-level01") {
      return 100;
    }
    const width = this.race.bounds.maxX - this.race.bounds.minX;
    const depth = this.race.bounds.maxZ - this.race.bounds.minZ;
    return MathUtils.clamp(Math.max(width, depth) * 0.82, 26, 58);
  }

  private getDefaultRaceCameraYaw(): number {
    return this.race.halfwayZ >= this.race.start[2] ? Math.PI : 0;
  }

  private getDefaultRaceCameraPitch(): number {
    if (this.race.vehicle) {
      return 0.7;
    }
    if (this.race.legacy?.level === "map1") {
      return 0.84;
    }
    if (this.race.legacy?.level === "world1") {
      return 0.78;
    }
    if (this.race.id === "ballz18-level01") {
      return 0.78;
    }
    return DEFAULT_RACE_CAMERA_PITCH;
  }

  private getDefaultRaceCameraDistance(): number {
    if (this.race.vehicle) {
      return 18;
    }
    if (this.race.id === "ballz18-level01") {
      return 16;
    }
    const width = this.race.bounds.maxX - this.race.bounds.minX;
    const depth = this.race.bounds.maxZ - this.race.bounds.minZ;
    return MathUtils.clamp(Math.max(width, depth) * 0.25, DEFAULT_RACE_CAMERA_DISTANCE, 24);
  }

  private moveCameraToward(desired: Vector3, target: Vector3, damping: number, deltaSeconds: number): void {
    this.camera.position.x = MathUtils.damp(this.camera.position.x, desired.x, damping, deltaSeconds);
    this.camera.position.y = MathUtils.damp(this.camera.position.y, desired.y, damping, deltaSeconds);
    this.camera.position.z = MathUtils.damp(this.camera.position.z, desired.z, damping, deltaSeconds);
    this.camera.lookAt(target);
  }

  private collectRings(): void {
    for (const ring of this.ringMeshes) {
      if (!ring.visible) {
        continue;
      }

      if (ring.position.distanceTo(this.playerGroup.position) < this.playerRadius + 0.77) {
        ring.visible = false;
        this.ringsCollected += 1;
        this.particles.burst(ring.position, 42, 5.8, 0.85);
        this.audio.coin();
      }
    }
  }

  private checkLapProgress(): void {
    // ZombieKiller mode: the race ends when every zombie is squashed
    if (this.race.npcs) {
      const remaining = this.npcs.some((npc) => npc.alive && npc.kind === "zombie");
      if (!remaining && this.zombiesTotal > 0) {
        this.raceActive = false;
        this.raceFinished = true;
        this.audio.finish();
        this.captureGhostFinish();
        this.showOverlayWords(["finish"], 2.6);
        this.options.onRaceFinished(this.getSnapshot());
      }
      return;
    }

    if (!this.hasReachedHalfway && this.isInsideGateZone(this.race.halfwayZ)) {
      this.hasReachedHalfway = true;
      this.particles.burst(this.playerGroup.position, 54, 5.2, 0.95);
      this.audio.halfway();
      return;
    }

    const lapsTotal = this.race.laps?.count ?? 1;
    const ringsRequired = this.race.laps ? true : this.ringsCollected === this.ringMeshes.length;

    if (this.hasReachedHalfway && this.isInsideGateZone(this.race.finishZ) && ringsRequired) {
      if (this.lapsCompleted + 1 < lapsTotal) {
        // GamePlayScreen.h mode 2: "5/10 Laps -> Best time + bonus for rings"
        this.lapsCompleted += 1;
        this.hasReachedHalfway = false;
        this.audio.halfway();
        this.showOverlayWords(["lap " + String(this.lapsCompleted + 1)], 1.3);
        this.particles.burst(this.playerGroup.position, 40, 5.0, 0.8);
        return;
      }

      // Store an actual completed-lap count. The old zero-based assignment
      // reported 2/3 after a finished three-lap race, which made the restored
      // levelList.xml lap contract look incomplete in QA/text state.
      this.lapsCompleted = lapsTotal;
      if (this.race.laps && this.ringsCollected > 0) {
        // each ring refunds ringBonusMs (-10 s in the design notes)
        const bonus = this.ringsCollected * this.race.laps.ringBonusMs;
        this.elapsedMs = Math.max(1000, this.elapsedMs - bonus);
      }
      this.raceActive = false;
      this.raceFinished = true;
      this.audio.finish();
      this.captureGhostFinish();
      this.showOverlayWords(this.race.laps && this.ringsCollected > 0 ? ["bonus", "finish"] : ["finish"], 1.6);
      this.options.onRaceFinished(this.getSnapshot());
    }
  }

  private isInsideGateZone(z: number): boolean {
    if (this.race.gateSegments) {
      const kind = Math.abs(z - this.race.halfwayZ) < Math.abs(z - this.race.finishZ) ? "halfway" : "finish";
      const [start, end] = this.race.gateSegments[kind];
      const ax = start[0];
      const az = start[2];
      const bx = end[0];
      const bz = end[2];
      const abX = bx - ax;
      const abZ = bz - az;
      const lengthSquared = abX * abX + abZ * abZ;
      const t = lengthSquared > 0
        ? MathUtils.clamp(((this.playerGroup.position.x - ax) * abX + (this.playerGroup.position.z - az) * abZ) / lengthSquared, 0, 1)
        : 0;
      const closestX = ax + abX * t;
      const closestZ = az + abZ * t;
      return Math.hypot(this.playerGroup.position.x - closestX, this.playerGroup.position.z - closestZ) < 1.35;
    }
    const gateHalfWidth = Math.max(5.8, (this.race.bounds.maxX - this.race.bounds.minX) * 0.46);
    return Math.abs(this.playerGroup.position.z - z) < 1.35 && Math.abs(this.playerGroup.position.x) < gateHalfWidth;
  }

  private getGateTarget(kind: "halfway" | "finish"): Vector3 {
    const segment = this.race.gateSegments?.[kind];
    if (!segment) {
      return new Vector3(0, this.raceStart.y, kind === "halfway" ? this.race.halfwayZ : this.race.finishZ);
    }
    return new Vector3(
      (segment[0][0] + segment[1][0]) / 2,
      this.raceStart.y,
      (segment[0][2] + segment[1][2]) / 2
    );
  }
}

function createDefaultEditorDraft(): MapEditorDraft {
  const width = 11;
  const height = 11;
  const tiles = Array.from<MapEditorTile>({ length: width * height }).fill("floor");

  for (let x = 0; x < width; x += 1) {
    tiles[x] = "wall";
    tiles[(height - 1) * width + x] = "wall";
  }
  for (let y = 0; y < height; y += 1) {
    tiles[y * width] = "wall";
    tiles[y * width + width - 1] = "wall";
  }

  const set = (x: number, y: number, tile: MapEditorTile) => {
    tiles[y * width + x] = tile;
  };

  set(5, 9, "start");
  set(5, 1, "half");
  set(5, 10, "finish");
  set(2, 7, "ring");
  set(4, 6, "ring");
  set(6, 4, "ring");
  set(8, 3, "ring");
  set(3, 3, "wall");
  set(4, 3, "wall");
  set(7, 6, "wall");
  set(7, 7, "wall");
  set(5, 5, "hazard");

  return { width, height, cellSize: 2.6, tiles };
}

function roundEditorNumber(value: number): number {
  return Number(value.toFixed(3));
}

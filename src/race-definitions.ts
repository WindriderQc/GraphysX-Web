import type { ClassicLevelStyleId } from "./classic-level-style";

export type Vec3Tuple = [number, number, number];

export type RaceMaterialKey =
  | "grid"
  | "damier"
  | "abstract-cubes"
  | "marble"
  | "rust"
  | "rock"
  | "mud"
  | "grass"
  | "glass"
  | "fire"
  | "ice"
  | "finish"
  | "danger"
  | "arrow-gold"
  | "arrow-brown"
  | "checker-dark"
  | "purple-grid"
  | "gold-wall"
  | "ballz18-wood"
  | "dark-wall";

export type RaceChampion = {
  name: string;
  timeMs: number;
  note: string;
};

export type RaceBox = {
  name: string;
  position: Vec3Tuple;
  size: Vec3Tuple;
  material: RaceMaterialKey;
  physics?: boolean;
};

export type RaceRing = {
  position: Vec3Tuple;
  yaw?: number;
  scale?: number;
};

export type RaceForceZone = {
  name: string;
  kind: "fire" | "ice";
  position: Vec3Tuple;
  size: Vec3Tuple;
};

export type RaceMarkerKind = "red-post" | "blue-post" | "dark-cube";

export type RaceMarker = {
  name: string;
  kind: RaceMarkerKind;
  position: Vec3Tuple;
  radius?: number;
  height?: number;
  size?: Vec3Tuple;
  physics?: boolean;
};

export type MovingPartKind = "rotator" | "piston" | "elevator";

export type MovingPart = {
  name: string;
  kind: MovingPartKind;
  position: Vec3Tuple;
  size: Vec3Tuple;
  material: RaceMaterialKey;
  axis: "x" | "y" | "z";
  amplitude?: number;
  speed: number;
  phase?: number;
};

export type LegacyLevelRef = {
  level: "suzanne1" | "world1" | "map1" | "slide2008" | "level12011" | "ballz18level01";
  scale: number;
  ringHeight: number;
};

export type RaceAiBall = {
  label: string;
  start: Vec3Tuple;
  torquePower: number;
  maxAngularVelocity: number;
  waypointReach: number;
};

export type RaceDefinition = {
  id: string;
  name: string;
  subtitle: string;
  /** supplied archive screenshot: a fidelity target, never presented as a current-build capture */
  referenceImage?: string;
  archiveInspiration: string[];
  /** exact StockRoom material/camera/light evidence for the three ASCII scenes */
  classicStyle?: ClassicLevelStyleId;
  /** recovered Suzanne1.ASCII arena; reference profile matches Suzanne1.png */
  suzanneAscii?: { profile: "reference2016" | "source2017" };
  legacy?: LegacyLevelRef;
  /** Exact source collision radius when an authored scene overrides the common BallZ shell. */
  ballRadius?: number;
  /** Source-backed rolling rival. Waypoints are supplied by the referenced legacy dataset. */
  aiBall?: RaceAiBall;
  skybox: "clearblue" | "clearnight" | "skyx" | "winter" | "lostvalley" | "nightsky";
  /** legacy Sky.cpp day/night blend: full sun cycle duration in seconds */
  atmosphere?: { cycleSeconds: number };
  /** legacy ZombieKiller/Human/Zombie actors: squash all zombies to win */
  npcs?: { zombies: number; humans: number };
  /** drive a car instead of the ball (cars pack + AtmelCubx oval) */
  vehicle?: { model: "impreza" | "cobra" };
  /** FlightX mode: fly the archive airplane instead of rolling the ball */
  flight?: { model: "airplane" };
  /** GamePlayScreen.h mode 2: N laps, each ring collected refunds ringBonusMs */
  laps?: { count: number; ringBonusMs: number };
  champion: RaceChampion;
  targetMs: number;
  start: Vec3Tuple;
  halfwayZ: number;
  finishZ: number;
  /** authored non-axis-aligned lap lines, when the archive stores endpoint pairs */
  gateSegments?: {
    halfway: [Vec3Tuple, Vec3Tuple];
    finish: [Vec3Tuple, Vec3Tuple];
  };
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    /** lowest world Y; below this the ball respawns (elevated/terrain races) */
    minY?: number;
  };
  palette: {
    skyTop: string;
    skyBottom: string;
    fog: string;
    floor: string;
    accent: string;
    danger: string;
  };
  track: RaceBox[];
  walls: RaceBox[];
  scenery: RaceBox[];
  markers?: RaceMarker[];
  movingParts: MovingPart[];
  rings: RaceRing[];
  /** Semantic floor forces authored by a human or agent level document. */
  forceZones?: RaceForceZone[];
};

type ArchiveAsciiLevel = {
  start: Vec3Tuple;
  halfwayZ: number;
  finishZ: number;
  bounds: RaceDefinition["bounds"];
  track: RaceBox[];
  walls: RaceBox[];
  scenery: RaceBox[];
  markers: RaceMarker[];
  rings: RaceRing[];
};

/**
 * Rebuilds the exact tile/ring/post placement authored in the recovered
 * StockRoom `*_base.ASCII` files. Upper/lowercase ring symbols are both
 * checkpoints; T/Z/M are the three level-specific solid-tile alphabets.
 */
const buildArchiveAsciiLevel = (options: {
  id: string;
  rows: string[];
  solidSymbol: "T" | "Z" | "M";
  solidMaterial: RaceMaterialKey;
  floorMaterial: RaceMaterialKey;
  tileScale?: number;
  solidHeight?: number;
  fallbackStart: Vec3Tuple;
}): ArchiveAsciiLevel => {
  // BuildASCIIScene authored each character on a one-unit grid with default
  // one-unit cubes. Keep the web reconstruction in those source units.
  const tileScale = options.tileScale ?? 1;
  const solidHeight = options.solidHeight ?? 1;
  const rowCount = options.rows.length;
  const columnCount = Math.max(...options.rows.map((row) => row.length));
  const xOffset = (columnCount - 1) / 2;
  const zOffset = (rowCount - 1) / 2;
  const walls: RaceBox[] = [];
  const scenery: RaceBox[] = [];
  const markers: RaceMarker[] = [];
  const rings: RaceRing[] = [];
  const finishZs: number[] = [];
  const halfwayZs: number[] = [];
  let start = options.fallbackStart;

  const worldPosition = (column: number, row: number): [number, number] => [
    (column - xOffset) * tileScale,
    (row - zOffset) * tileScale
  ];

  options.rows.forEach((row, rowIndex) => {
    [...row].forEach((symbol, columnIndex) => {
      const [x, z] = worldPosition(columnIndex, rowIndex);
      const isLevel3Solid = options.solidSymbol === "M" && (symbol === "r" || symbol === "$");
      if (symbol === options.solidSymbol || isLevel3Solid) {
        walls.push({
          name: `${options.id}-tile-${columnIndex}-${rowIndex}`,
          position: [x, solidHeight / 2, z],
          size: [tileScale, solidHeight, tileScale],
          material: options.solidMaterial,
          physics: true
        });
        // The recovered SceneEditor builder makes lowercase r a solid M-style
        // platform plus an elevated checkpoint, while $ is the solid spawn
        // tile. Neither is an empty-space prop.
        if (symbol === "r") {
          rings.push({ position: [x, solidHeight + 0.75, z], scale: 1 });
        } else if (symbol === "$") {
          start = [x, solidHeight + 0.35, z];
        }
      } else if (symbol === "R" || symbol === "r") {
        rings.push({ position: [x, symbol === "r" ? solidHeight + 0.75 : 0.8, z], scale: 1 });
      } else if (symbol === "@") {
        start = [x, 0.35, z];
      } else if (symbol === "F" || symbol === "f" || symbol === "H" || symbol === "h") {
        const isFinish = symbol === "F" || symbol === "f";
        markers.push({
          name: `${options.id}-${isFinish ? "finish" : "half"}-${columnIndex}-${rowIndex}`,
          kind: isFinish ? "red-post" : "blue-post",
          position: [x, 1, z],
          radius: 0.2,
          height: 2,
          physics: true
        });
        (isFinish ? finishZs : halfwayZs).push(z);
      }
    });
  });

  const average = (values: number[], fallback: number) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
  const halfWidth = (columnCount * tileScale) / 2;
  const halfDepth = (rowCount * tileScale) / 2;

  return {
    start,
    halfwayZ: average(halfwayZs, -halfDepth + tileScale),
    finishZ: average(finishZs, halfDepth - tileScale),
    bounds: {
      minX: -halfWidth - 0.5,
      maxX: halfWidth + 0.5,
      minZ: -halfDepth - 0.5,
      maxZ: halfDepth + 0.5
    },
    track: [
      {
        name: `${options.id}-authored-floor`,
        position: [0, -0.06, 0],
        size: [columnCount * tileScale, 0.12, rowCount * tileScale],
        material: options.floorMaterial,
        physics: true
      }
    ],
    walls,
    scenery,
    markers,
    rings
  };
};

const archiveLevel1 = buildArchiveAsciiLevel({
  id: "archive-level1",
  rows: [
    "........TTTTTTTTTTTT",
    "..................HT",
    "...................T",
    "............R......T",
    "........R..R...h...T",
    "T...TTT..RR..TTT...T",
    "T....TTT....TTT....T",
    "T...R.TTT..TTT.....T",
    "T....R.TTTTTT.R....T",
    "T.....R.TTTT.R.....T",
    "T.....R.TTTT.R.....T",
    "T....R.TTTTTT.R....T",
    "T.....TTT..TTT.R...T",
    "T....TTT....TTT....T",
    "T...TTT..RR..TTT....",
    "Tf..F...R..R........",
    "T......R............",
    "T..@................",
    "T...................",
    "TTTTTTTTTTT........."
  ],
  solidSymbol: "T",
  solidMaterial: "arrow-brown",
  floorMaterial: "mud",
  fallbackStart: [-6.5, 0.93, 7.5]
});

const archiveLevel2 = buildArchiveAsciiLevel({
  id: "archive-level2",
  rows: [
    "ZZZZZZZZZZZZZZZZZZZZ",
    "Z.................HZ",
    "Z.....R..ZZ..R.....Z",
    "Z....Z...ZZ...Zh...Z",
    "Z....Z.R.ZZ.R.Z....Z",
    "Z....Z...ZZ...Z....Z",
    "Z....Z.R.ZZ.R.Z....Z",
    "Z....Z........Z....Z",
    "Z....Z.R.RR.R.Z....Z",
    "Z....ZZZZZZZZZZ....Z",
    "Z....ZZZZZZZZZZ....Z",
    "Z....Z.R.RR.R.Z....Z",
    "Z....Z........Z....Z",
    "Z....Z.R.ZZ.R.Z....Z",
    "Z....Z...ZZ...Z....Z",
    "Zf..FZ.R.ZZ.R.Z....Z",
    "Z....Z...ZZ...Z....Z",
    "Z..@..R..ZZ..R.....Z",
    "Z..................Z",
    "ZZZZZZZZZZZZZZZZZZZZ"
  ],
  solidSymbol: "Z",
  solidMaterial: "gold-wall",
  floorMaterial: "checker-dark",
  fallbackStart: [-6.5, 0.93, 7.5]
});

const archiveLevel3 = buildArchiveAsciiLevel({
  id: "archive-level3",
  rows: [
    "....................",
    "..................H.",
    "..MMMMMMMM.MMMMMMM..",
    "..MMMrrMMM.MMMMMMM..",
    "..MMrrrrMM.MMMMMMM..",
    "..MMrrrrMM.MMMMMMM..",
    "..MMMrrMMMh.........",
    "..MMMMMMMM....MMMM..",
    "..............MMrM..",
    "..MMMM........MMrM..",
    "..MMMM........MrMM..",
    "..MMMM........MrMM..",
    ".fMMMMF.....MMMMrM..",
    "..MMMM.MMMMMMMMMrM..",
    "..MMMM.MMMMMMMrMMM..",
    "..MM$M.MMMMMrMMMMM..",
    "..MMMM.MMMMMMMMMMM..",
    "....................",
    "...................."
  ],
  solidSymbol: "M",
  solidMaterial: "arrow-gold",
  floorMaterial: "purple-grid",
  fallbackStart: [-0.5, 1.93, 6]
});

export const RACE_DEFINITIONS: RaceDefinition[] = [
  {
    id: "green-grid-run",
    name: "Archive Level 1 — ASCII Restoration",
    subtitle: "The exact 20×20 T-tile layout, 20 R checkpoints, four lap posts, one start, ClearBlue sky assignment, three laps, and archived best score are recovered from StockRoom.",
    referenceImage: "/assets/references/screenShotLevel1.png",
    archiveInspiration: ["StockRoom/levelList.xml", "StockRoom/Level1_base.ASCII", "screenShotLevel1.png", "GraphysX_1/Scene.cpp::BuildASCIIScene"],
    classicStyle: "stockroom-level1",
    skybox: "clearblue",
    laps: { count: 3, ringBonusMs: 10000 },
    champion: { name: "Archive best", timeMs: 29815.1465, note: "levelList.xml ScoreBest" },
    targetMs: 45000,
    start: archiveLevel1.start,
    halfwayZ: archiveLevel1.halfwayZ,
    finishZ: archiveLevel1.finishZ,
    bounds: archiveLevel1.bounds,
    palette: {
      skyTop: "#67503d",
      skyBottom: "#17110b",
      fog: "#261b12",
      floor: "#3a2d1d",
      accent: "#f0c46a",
      danger: "#ff2b19"
    },
    track: archiveLevel1.track,
    walls: archiveLevel1.walls,
    scenery: archiveLevel1.scenery,
    markers: archiveLevel1.markers,
    movingParts: [],
    rings: archiveLevel1.rings
  },
  {
    id: "rotator-cube-works",
    name: "Archive Level 2 — ASCII Restoration",
    subtitle: "The exact 20×20 Z-tile layout, 20 R checkpoints, four lap posts, one start, LostValley sky, three laps, ten archived humans, and best score are recovered from StockRoom.",
    referenceImage: "/assets/references/screenShotLevel2.png",
    archiveInspiration: ["StockRoom/levelList.xml", "StockRoom/Level2_base.ASCII", "screenShotLevel2.png", "GraphysX_1/Scene.cpp::BuildASCIIScene"],
    classicStyle: "stockroom-level2",
    skybox: "lostvalley",
    laps: { count: 3, ringBonusMs: 10000 },
    champion: { name: "Archive best", timeMs: 122428.984, note: "levelList.xml ScoreBest" },
    targetMs: 150000,
    start: archiveLevel2.start,
    halfwayZ: archiveLevel2.halfwayZ,
    finishZ: archiveLevel2.finishZ,
    bounds: archiveLevel2.bounds,
    palette: {
      skyTop: "#7a8f65",
      skyBottom: "#0b1112",
      fog: "#17201c",
      floor: "#10130f",
      accent: "#ffd35d",
      danger: "#ff3b22"
    },
    track: archiveLevel2.track,
    walls: archiveLevel2.walls,
    scenery: archiveLevel2.scenery,
    markers: archiveLevel2.markers,
    movingParts: [],
    rings: archiveLevel2.rings
  },
  {
    id: "piston-gateworks",
    name: "Archive Level 3 — ASCII Restoration",
    subtitle: "The exact 20×19 M-platform layout, 20 solid lowercase-r checkpoint tiles, four lap posts, $ spawn tile, NightSky assignment, three laps, and archived best score are recovered from StockRoom.",
    referenceImage: "/assets/references/screenShotLevel3.png",
    archiveInspiration: ["StockRoom/levelList.xml", "StockRoom/Level3_base.ASCII", "screenShotLevel3.png", "GraphysX_1/Scene.cpp::BuildASCIIScene"],
    classicStyle: "stockroom-level3",
    skybox: "clearnight",
    laps: { count: 3, ringBonusMs: 10000 },
    champion: { name: "Archive best", timeMs: 158507.313, note: "levelList.xml ScoreBest" },
    targetMs: 190000,
    start: archiveLevel3.start,
    halfwayZ: archiveLevel3.halfwayZ,
    finishZ: archiveLevel3.finishZ,
    bounds: archiveLevel3.bounds,
    palette: {
      skyTop: "#11182c",
      skyBottom: "#02040a",
      fog: "#050815",
      floor: "#050713",
      accent: "#ffe761",
      danger: "#ff1f19"
    },
    track: archiveLevel3.track,
    walls: archiveLevel3.walls,
    scenery: archiveLevel3.scenery,
    markers: archiveLevel3.markers,
    movingParts: [],
    rings: archiveLevel3.rings
  },
  {
    id: "ballz18-level01",
    name: "BallZ18 Level 01 — AI Circuit",
    subtitle: "The exact authored L1_floor.blend circuit, two BallZ starts, seven-point Raceline, rolling BallAI rival, invisible half/lap triggers, countdown heritage, and lap-timer loop recovered from the Unity project.",
    archiveInspiration: [
      "BallZ18/Assets/!Scenes/Level01.unity",
      "BallZ18/Assets/Mesh/L1_floor.blend",
      "BallZ18/Assets/Prefabs/BallZ/BallZ.prefab",
      "BallZ18/Assets/Prefabs/BallZ/BallAI.prefab",
      "BallZ18/Assets/Scripts/CtrlerAI_Ball.cs",
      "BallZ18/Assets/Scripts/TargetLooper.cs",
      "BallZ18/Assets/Scripts/LapTimeManager.cs"
    ],
    legacy: { level: "ballz18level01", scale: 1, ringHeight: 0 },
    ballRadius: 0.5,
    aiBall: {
      label: "BallAI",
      start: [0.16, 2, 2.71],
      torquePower: 5,
      maxAngularVelocity: 15,
      waypointReach: 2.25
    },
    skybox: "clearblue",
    laps: { count: 3, ringBonusMs: 0 },
    champion: {
      name: "Revival benchmark",
      timeMs: 100000,
      note: "The Unity source loops and times laps but preserves no best time or terminal lap count; the three-lap finish is the canonical revival adapter."
    },
    targetMs: 100000,
    start: [-3.84, 2, 0],
    halfwayZ: 51.9,
    finishZ: -0.62,
    gateSegments: {
      halfway: [[-12.17, 0, 51.9], [12.83, 0, 51.9]],
      finish: [[10.35, 0, -7.42], [10.35, 0, 6.18]]
    },
    bounds: { minX: -39, maxX: 12.5, minZ: -13, maxZ: 78, minY: -9 },
    palette: {
      skyTop: "#16bfc1",
      skyBottom: "#173650",
      fog: "#284859",
      floor: "#07152a",
      accent: "#40f3a0",
      danger: "#ff3038"
    },
    track: [],
    walls: [],
    scenery: [
      {
        name: "BallZ18 Level01 local wood cube",
        position: [-5.62, 1.64, -6.23],
        size: [2, 2, 2],
        material: "ballz18-wood",
        physics: true
      }
    ],
    markers: [],
    movingParts: [],
    rings: []
  },
  {
    id: "skybox-spiral",
    name: "Skybox Spiral",
    subtitle: "The real LostValley skybox recovered from BallZ 2011, heightmap leftovers, and flying-spline energy.",
    archiveInspiration: ["GraphysX_1/Sky.cpp", "Media/Sky/LostValley", "Media/Airplane/Airplane.x", "Media/Spline.xml", "VoieLactee.cpp"],
    skybox: "lostvalley",
    atmosphere: { cycleSeconds: 150 },
    champion: { name: "Voie Lactee", timeMs: 72000, note: "Old galaxy experiment becomes race dressing" },
    targetMs: 90000,
    start: [0, 1.2, 21],
    halfwayZ: -22,
    finishZ: 21,
    bounds: { minX: -13.5, maxX: 13.5, minZ: -26, maxZ: 26 },
    palette: {
      skyTop: "#0a5791",
      skyBottom: "#060b22",
      fog: "#081028",
      floor: "#0b1730",
      accent: "#aaf0ff",
      danger: "#f9c74f"
    },
    track: [
      { name: "spiral-start", position: [0, 0.05, 14], size: [12, 0.14, 18], material: "marble", physics: true },
      { name: "spiral-mid", position: [4.2, 0.08, 0], size: [12, 0.14, 18], material: "grid", physics: true },
      { name: "spiral-end", position: [-2.7, 0.11, -15], size: [13, 0.14, 19], material: "marble", physics: true }
    ],
    walls: [
      { name: "left-sky-rail", position: [-13.5, 0.9, 0], size: [0.5, 1.8, 52], material: "glass", physics: true },
      { name: "right-sky-rail", position: [13.5, 0.9, 0], size: [0.5, 1.8, 52], material: "glass", physics: true },
      { name: "north-sky-rail", position: [0, 0.9, -26], size: [27, 1.8, 0.5], material: "glass", physics: true },
      { name: "south-sky-rail", position: [0, 0.9, 26], size: [27, 1.8, 0.5], material: "glass", physics: true }
    ],
    scenery: [
      { name: "moon", position: [-9, 5.2, -14], size: [2.4, 2.4, 2.4], material: "rock" },
      { name: "mars", position: [10, 6.4, -5], size: [3.1, 3.1, 3.1], material: "rust" },
      { name: "abstract-cloud", position: [7, 2.2, 13], size: [3.6, 0.4, 3.6], material: "abstract-cubes" }
    ],
    markers: [],
    movingParts: [
      { name: "airplane-sweep", kind: "piston", position: [-5, 2.05, -3], size: [6.2, 0.28, 0.28], material: "finish", axis: "x", amplitude: 8.5, speed: 0.75 },
      { name: "sky-mid-crosswind", kind: "piston", position: [5.8, 1.62, 4.2], size: [4.6, 0.28, 0.28], material: "danger", axis: "z", amplitude: 3.7, speed: 1.0 },
      { name: "sky-rotator", kind: "rotator", position: [2.4, 1.35, -13], size: [9.4, 0.3, 0.3], material: "danger", axis: "y", speed: 1.12 }
    ],
    rings: [
      { position: [0.0, 1.52, 19.0], yaw: 0, scale: 1.16 },
      { position: [4.6, 1.58, 15.0], yaw: Math.PI / 2 },
      { position: [-4.8, 1.58, 9.2], yaw: Math.PI / 2 },
      { position: [-1.0, 1.62, 4.2], yaw: Math.PI / 2 },
      { position: [6.8, 1.66, -0.2], yaw: 0 },
      { position: [8.4, 1.72, -5.8], yaw: 0 },
      { position: [3.0, 1.78, -9.4], yaw: Math.PI / 2 },
      { position: [-2.8, 1.86, -12.8], yaw: Math.PI / 2 },
      { position: [-6.9, 1.96, -17.8], yaw: 0 },
      { position: [-2.6, 2.12, -22.6], yaw: Math.PI / 2, scale: 1.18 },
      { position: [3.8, 2.0, -18.6], yaw: Math.PI / 2 },
      { position: [6.2, 1.82, -10.6], yaw: 0 },
      { position: [1.6, 1.68, -4.2], yaw: Math.PI / 2 },
      { position: [-5.1, 1.58, 2.2], yaw: 0 },
      { position: [-5.6, 1.54, 10.5], yaw: 0 },
      { position: [-1.2, 1.52, 16.4], yaw: Math.PI / 2, scale: 1.1 }
    ]
  },
  {
    id: "suzanne1-classic",
    name: "Suzanne 1 — ASCII Arena",
    subtitle: "The recovered 40×40 Suzanne1.ASCII scene now owns its 208 walls, 45 chain assemblies, 15 sphere checkpoints, three pistons, particle cells, four lap posts, exact start, and screenshot-matching presentation profile.",
    referenceImage: "/assets/references/Suzanne1.png",
    archiveInspiration: [
      "StockRoom/Suzanne1.ASCII",
      "StockRoom/Suzanne1.xml",
      "StockRoom/Suzanne1.png",
      "GraphysX_1/Scene.cpp::BuildASCIIScene"
    ],
    suzanneAscii: { profile: "reference2016" },
    laps: { count: 3, ringBonusMs: 10000 },
    skybox: "clearnight",
    champion: { name: "Yanik TV3D", timeMs: 52000, note: "Original Suzanne1 archive pass" },
    targetMs: 78000,
    start: [5, 0.5, 36],
    halfwayZ: 21,
    finishZ: 34.5,
    gateSegments: {
      halfway: [[0.5, 0.5, 32.5], [14.5, 0.5, 9.5]],
      finish: [[10.5, 0.5, 34.5], [1.5, 0.5, 34.5]]
    },
    bounds: { minX: -0.5, maxX: 40.5, minZ: -0.5, maxZ: 40.5 },
    palette: {
      skyTop: "#090b0e",
      skyBottom: "#000000",
      fog: "#071008",
      floor: "#527b36",
      accent: "#ffd92f",
      danger: "#e42127"
    },
    track: [],
    walls: [],
    scenery: [],
    movingParts: [],
    rings: []
  },
  {
    id: "world1-recovered",
    name: "World 1 — Recovered",
    subtitle: "The lost World 1 assembly decoded straight from TVM binaries: Level3 terrain, the core, the elevator, level holes, and the original finish plate — all in their shared 2015 coordinate space.",
    archiveInspiration: [
      "Media/Level3.TVM",
      "Media/World1Core.TVM",
      "Media/World1Elevator1.TVM",
      "Media/World1Finish.TVM",
      "Media/World1LevelHole1.TVM"
    ],
    legacy: { level: "world1", scale: 1, ringHeight: 1.5 },
    skybox: "winter",
    atmosphere: { cycleSeconds: 160 },
    champion: { name: "Yanik TV3D", timeMs: 65000, note: "World 1 as it was left in 2015" },
    targetMs: 95000,
    start: [-19.9, 6, -36.7],
    halfwayZ: -21,
    finishZ: 18.8,
    bounds: { minX: -30, maxX: 30, minZ: -38.5, maxZ: 38.5, minY: -30 },
    palette: {
      skyTop: "#9db8d2",
      skyBottom: "#20303f",
      fog: "#8ea6bd",
      floor: "#4c5a66",
      accent: "#ffbf69",
      danger: "#ff3b23"
    },
    track: [],
    walls: [],
    scenery: [],
    movingParts: [],
    rings: []
  },
  {
    id: "map1-2011",
    name: "Map 1 \u2014 BallZ 2011",
    subtitle: "The 2011 flagship map decoded from Map1.TVM \u2014 a vertical descent world, 45 units tall, played with the original 2011 ball shell and controller meshes.",
    archiveInspiration: [
      "BallZ 2011/Release/Media/Map1.TVM",
      "BallZ 2011/Release/Media/Ball/BallShell.tvm",
      "BallZ 2011/Release/Media/Ball/BallCtrl.tvm",
      "BallZ 2011/Release/Media/Ball/BallFire.TVM"
    ],
    legacy: { level: "map1", scale: 0.6, ringHeight: 1.5 },
    skybox: "skyx",
    atmosphere: { cycleSeconds: 170 },
    champion: { name: "Yanik TV3D", timeMs: 58000, note: "The 2011 flagship descent" },
    targetMs: 88000,
    start: [22.2, 30, 35.9],
    halfwayZ: 0,
    finishZ: -32,
    bounds: { minX: -26, maxX: 26, minZ: -37.5, maxZ: 37.5, minY: -11 },
    palette: {
      skyTop: "#86a9cf",
      skyBottom: "#17222e",
      fog: "#7d95ac",
      floor: "#414d59",
      accent: "#69c6f0",
      danger: "#ff3b23"
    },
    track: [],
    walls: [],
    scenery: [],
    movingParts: [],
    rings: []
  },
  {
    id: "dominus-port",
    name: "Port Dominus — Modern Curated Visit",
    subtitle: "A new explorable composition built from the recovered Dominus Art sources. It is not presented as the missing authored village: cottages, inn, pub, market, lighthouse, windmill, docks, ship and camp are arranged for this revival tour.",
    archiveInspiration: [
      "Models/Dominus Art (55 meshes + 38 textures)",
      "Animals/Fish1-3.x",
      "Models/woman.3ds",
      "Modern curated layout; exact ObjectLibrary port grid is preserved separately"
    ],
    skybox: "clearblue",
    atmosphere: { cycleSeconds: 200 },
    champion: { name: "GraphysX Revival", timeMs: 90000, note: "Modern curated tour — no archived run record survives" },
    targetMs: 150000,
    start: [0, 1.25, 22],
    halfwayZ: -30,
    finishZ: 22,
    bounds: { minX: -42, maxX: 42, minZ: -40, maxZ: 42 },
    palette: {
      skyTop: "#8fc3e8",
      skyBottom: "#24384a",
      fog: "#a7c2d8",
      floor: "#4d6138",
      accent: "#8fe06a",
      danger: "#ff3b23"
    },
    track: [
      { name: "village-green", position: [0, 0.05, 0], size: [84, 0.22, 84], material: "grass", physics: true }
    ],
    walls: [],
    scenery: [],
    movingParts: [],
    rings: []
  },
  {
    id: "slide-2008",
    name: "The Great Slide \u2014 Level0",
    subtitle: "SlideLarge.TVM \u2014 the giant 2011 Level0 slide, 116 units long, 25 units of descent. Ride it down, thread the rings, survive to the runout.",
    archiveInspiration: [
      "Media/SlideLarge.TVM (= BallZ 2011 Level0)",
      "AtmelCubx/BallZ.cpp slide materials",
      "Level.cpp crooked ring spiral"
    ],
    legacy: { level: "slide2008", scale: 0.22, ringHeight: 1.4 },
    skybox: "winter",
    atmosphere: { cycleSeconds: 180 },
    champion: { name: "Yanik TV3D", timeMs: 42000, note: "Level0, the original descent" },
    targetMs: 70000,
    start: [15.7, 6, -58],
    halfwayZ: -5,
    finishZ: 41.5,
    bounds: { minX: -20, maxX: 20, minZ: -60, maxZ: 60, minY: -26 },
    palette: {
      skyTop: "#9db8d2",
      skyBottom: "#1a2634",
      fog: "#8ea6bd",
      floor: "#46525e",
      accent: "#8be0ff",
      danger: "#ff3b23"
    },
    track: [],
    walls: [],
    scenery: [],
    movingParts: [],
    rings: []
  },
  {
    id: "flightx-pipe",
    name: "FlightX \u2014 Pipe Loop",
    subtitle: "Fly the recovered airplane around pipe1: Left/Right roll, Up/Down pitch, W/S forward/reverse thrust, Space strengthens pitch-down, and R resets your wings.",
    archiveInspiration: [
      "AtmelCubx/FlightXScene.cpp",
      "Media/pipe1.tvm",
      "Media/Airplane/Airplane.x",
      "clicking the sun in the CubX menu"
    ],
    flight: { model: "airplane" },
    skybox: "clearblue",
    atmosphere: { cycleSeconds: 150 },
    champion: { name: "KamiGazz", timeMs: 60000, note: "DubCrew 2007 \u2014 the sun-click flight" },
    targetMs: 90000,
    start: [23.3, 14, 8],
    halfwayZ: -23.3,
    finishZ: 23.3,
    bounds: { minX: -36, maxX: 36, minZ: -36, maxZ: 36, minY: 0 },
    palette: {
      skyTop: "#7db9e8",
      skyBottom: "#20303f",
      fog: "#93b4d0",
      floor: "#3e4d42",
      accent: "#f0c46a",
      danger: "#ff3b23"
    },
    track: [],
    walls: [],
    scenery: [],
    movingParts: [],
    rings: [
      { position: [23.3, 14, 1], yaw: Math.PI, scale: 1.35 },
      { position: [23.3, 14, -10], yaw: Math.PI, scale: 1.35 },
      { position: [20, 14, -20], yaw: -2.7, scale: 1.35 },
      { position: [12, 14, -26], yaw: -2.1, scale: 1.35 },
      { position: [1, 14, -27], yaw: -Math.PI / 2, scale: 1.35 },
      { position: [-11, 14, -26], yaw: -1.05, scale: 1.35 },
      { position: [-20, 14, -20], yaw: -0.45, scale: 1.35 },
      { position: [-24, 14, -10], yaw: 0, scale: 1.35 },
      { position: [-24, 14, 2], yaw: 0, scale: 1.35 },
      { position: [-21, 14, 13], yaw: 0.4, scale: 1.35 },
      { position: [-14, 14, 22], yaw: 0.9, scale: 1.35 },
      { position: [-3, 14, 26], yaw: Math.PI / 2, scale: 1.35 },
      { position: [9, 14, 25], yaw: 1.85, scale: 1.35 },
      { position: [19, 14, 20], yaw: 2.25, scale: 1.35 }
    ]
  },
  {
    id: "level1-2011-race",
    name: "Level1 \u2014 The 2011 Gauntlet",
    subtitle: "The 1135-unit Level1.TVM mega-world, scaled into a narrow 100-unit canyon run \u2014 45 units of vertical, the biggest single mesh in the archives, raced for the first time ever.",
    archiveInspiration: [
      "BallZ 2011/Release/Media/Level1.TVM",
      "the level that never shipped"
    ],
    legacy: { level: "level12011", scale: 0.09, ringHeight: 1.5 },
    skybox: "clearnight",
    atmosphere: { cycleSeconds: 210 },
    champion: { name: "Yanik TV3D", timeMs: 80000, note: "Level1, first descent in history" },
    targetMs: 125000,
    start: [9.4, 15, 51],
    halfwayZ: 0,
    finishZ: -49,
    bounds: { minX: -12, maxX: 12, minZ: -53, maxZ: 53, minY: -36 },
    palette: {
      skyTop: "#39508c",
      skyBottom: "#0c1220",
      fog: "#2c3c5c",
      floor: "#2c3444",
      accent: "#9b8cff",
      danger: "#ff3b23"
    },
    track: [],
    walls: [],
    scenery: [],
    movingParts: [],
    rings: []
  },
  {
    id: "carx-terrain",
    name: "Terrain 2008 \u2014 Impreza",
    subtitle: "The sculpted Heightmap.bmp hills under the Subaru \u2014 open-country hillclimb with rings on the ridgelines. (Fun fact from the dig: CarHeightmap.bmp, the map CarScene actually loaded, is entirely black \u2014 the 2008 car drove on a flat plain.)",
    archiveInspiration: [
      "Heightmaps/Heightmap.bmp",
      "AtmelCubx/CarScene.cpp CLLand(...)",
      "Media/grass.jpg"
    ],
    vehicle: { model: "impreza" },
    skybox: "lostvalley",
    atmosphere: { cycleSeconds: 190 },
    champion: { name: "Yanik STi", timeMs: 75000, note: "Hillclimb over the old heightmap" },
    targetMs: 115000,
    start: [0, 12, 44],
    halfwayZ: -44,
    finishZ: 44,
    bounds: { minX: -56, maxX: 56, minZ: -56, maxZ: 56, minY: -6 },
    palette: {
      skyTop: "#9db8d2",
      skyBottom: "#1c2a1e",
      fog: "#93a88f",
      floor: "#3f5233",
      accent: "#b7e06a",
      danger: "#ff3b23"
    },
    track: [],
    walls: [],
    scenery: [],
    movingParts: [],
    rings: []
  },
  {
    id: "piste-ovale",
    name: "Piste Ovale — Impreza",
    subtitle: "The AtmelCubx banked oval with the Subaru Impreza from the old cars pack — real rigid-body vehicle physics, chassis and all four wheels decoded from impreza.3ds.",
    archiveInspiration: [
      "AtmelCubx/PisteOvale.tvm",
      "Models/cars/impreza.3ds",
      "Models/cars/ChassisSTi.bmp",
      "Models/cars (GT4, Cobra, Jeep...)"
    ],
    vehicle: { model: "impreza" },
    skybox: "clearblue",
    atmosphere: { cycleSeconds: 140 },
    champion: { name: "Yanik STi", timeMs: 55000, note: "The Subaru souvenirs lap" },
    targetMs: 85000,
    start: [29, 4.4, 5],
    halfwayZ: -5,
    finishZ: 5,
    bounds: { minX: -39, maxX: 39, minZ: -52, maxZ: 52, minY: -8 },
    palette: {
      skyTop: "#7db9e8",
      skyBottom: "#20303f",
      fog: "#93a8bd",
      floor: "#3d4a3a",
      accent: "#3f7bdf",
      danger: "#ff3b23"
    },
    track: [],
    walls: [],
    scenery: [],
    movingParts: [],
    rings: []
  },
  {
    id: "piste-ovale-cobra",
    name: "Piste Ovale — Low Cobra (Speculative Adapter)",
    subtitle: "Hidden modern handling experiment: the exact Low Cobra asset was never bound to the archived selector or CLVehicule physics, so this oval pairing is not an archive-authored vehicle restoration.",
    archiveInspiration: [
      "Models/cars/Low_Cobra.3DS",
      "Modern Cannon/Impreza-derived handling adapter",
      "No archived selector or CLVehicule binding"
    ],
    vehicle: { model: "cobra" },
    skybox: "clearblue",
    atmosphere: { cycleSeconds: 140 },
    champion: { name: "KamiGazz", timeMs: 53000, note: "DubCrew, top down, wind in the hair" },
    targetMs: 82000,
    start: [29, 4.4, 5],
    halfwayZ: -5,
    finishZ: 5,
    bounds: { minX: -39, maxX: 39, minZ: -52, maxZ: 52, minY: -8 },
    palette: {
      skyTop: "#7db9e8",
      skyBottom: "#20303f",
      fog: "#93a8bd",
      floor: "#3d4a3a",
      accent: "#5b8dff",
      danger: "#ff3b23"
    },
    track: [],
    walls: [],
    scenery: [],
    movingParts: [],
    rings: []
  },
  {
    id: "zombie-hunt",
    name: "ZombieKiller Arena",
    subtitle: "The mode the archives named the ball after: humans wander the arena on legacy Human.cpp AI, zombies hunt them and you — roll over every zombie before the infection spreads.",
    archiveInspiration: [
      "GraphysX_1/ZombieKiller.cpp",
      "GraphysX_1/Human.cpp",
      "GraphysX_1/Zombie.cpp",
      "GraphysX_1/Agent.h",
      "Scene3D/GamePlayScreen.cpp contact callbacks"
    ],
    skybox: "clearnight",
    npcs: { zombies: 10, humans: 14 },
    champion: { name: "ZombieKiller TV3D", timeMs: 48000, note: "The ball that earned its name" },
    targetMs: 75000,
    start: [0, 1.25, 12],
    halfwayZ: -12,
    finishZ: 12,
    bounds: { minX: -14.2, maxX: 14.2, minZ: -14.2, maxZ: 14.2 },
    palette: {
      skyTop: "#1c2f24",
      skyBottom: "#050a07",
      fog: "#0d1a12",
      accent: "#8fe06a",
      floor: "#22301f",
      danger: "#ff3b23"
    },
    track: [
      { name: "arena-floor", position: [0, 0.05, 0], size: [28, 0.22, 28], material: "checker-dark", physics: true }
    ],
    walls: [
      { name: "left-wall", position: [-14, 1.4, 0], size: [0.65, 2.8, 28.5], material: "dark-wall", physics: true },
      { name: "right-wall", position: [14, 1.4, 0], size: [0.65, 2.8, 28.5], material: "dark-wall", physics: true },
      { name: "north-wall", position: [0, 1.4, -14], size: [28.5, 2.8, 0.65], material: "dark-wall", physics: true },
      { name: "south-wall", position: [0, 1.4, 14], size: [28.5, 2.8, 0.65], material: "dark-wall", physics: true }
    ],
    scenery: [
      { name: "crypt-block-a", position: [-7.5, 0.9, -6], size: [2.2, 1.8, 2.2], material: "rock", physics: true },
      { name: "crypt-block-b", position: [6.5, 0.9, 5], size: [2.6, 1.8, 2.0], material: "rock", physics: true },
      { name: "crypt-block-c", position: [8, 0.9, -8], size: [1.8, 1.8, 1.8], material: "rock", physics: true }
    ],
    movingParts: [],
    rings: []
  }
];

export const REVIVAL_BACKLOG = [
  "Scene builder: ASCII maps, XML scene files, trigger zones, and object-library import.",
  "BallZ modifiers: shell grip, inner-ball weight, air control, friction, bounce, and chaos upgrades.",
  "Physics lab: Newton-style joints, hinges, sliders, push plates, chains, elevators, pistons, and dry rolling friction.",
  "Particle lab: ring bursts, flames, smoke, billboards, texture cycles, explosion presets, and emitter editor.",
  "Shader lab: per-pixel lighting, bump mapping, projection, haze, water refraction/reflection, and post effects.",
  "Sky and atmosphere: day/night skyboxes, LostValley, clear night, sun pass, galaxy objects, and heightmap terrain.",
  "3D toys: CubX actor, airplane spline follow, billboards, dynamic mesh tests, alphabet TVM meshes, and rotator assets.",
  "Game shells: main menu, race select, after-race, high scores, math-game screen, editor screen, and arcade HUD.",
  "Media recovery: convert TVM/X/3DS/OBJ assets to GLB, normalize textures, and tag source inspiration per scene."
];

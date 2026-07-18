/**
 * Rendering evidence for the three StockRoom ASCII levels.
 *
 * Layout stays in race-definitions.ts because it is playable race data. This
 * module keeps the scene-specific presentation facts separate so the renderer
 * does not have to infer them from generic material keys.
 */
export type ClassicLevelStyleId = "stockroom-level1" | "stockroom-level2" | "stockroom-level3";

export type ClassicLevelStyle = {
  id: ClassicLevelStyleId;
  source: {
    ascii: string;
    screenshot: string;
    sky: "clearblue" | "lostvalley" | "clearnight";
    scoreBestMs: number;
    laps: 3;
    humans: number;
  };
  layout: {
    columns: 20;
    rows: 19 | 20;
    solidSymbol: "T" | "Z" | "M";
    checkpointSymbol: "R" | "r";
    checkpointCount: 20;
    startCount: 0 | 1;
    startSymbol: "@" | "$";
    markerCounts: { F: 1; f: 1; H: 1; h: 1 };
    propSymbolCount: 0 | 1;
    tileSize: 1;
    tileHeight: 1;
  };
  floor: {
    diffuse: string;
    normal?: string;
    repeat: [number, number];
  };
  tiles: {
    top: string;
    sides: string;
    normal?: string;
    /** Which surviving evidence fixes the top/side split. */
    surfaceEvidence: string;
    /** T/M are screenshot-derived; Z is also named in BuildASCIIScene. */
    confidence: "screenshot" | "source-and-screenshot";
  };
  checkpoints: {
    /** BallZScreen.cs calls RingSys.setBillboardSize(0.5f). */
    billboardSize: 0.5;
    /** The following addRings argument survives, but its parameter name does not. */
    addRingsArgument: 0.45;
    appearance: "white-sphere-with-orange-seam";
  };
  markers: {
    visual: "individual-posts";
    radius: 0.2;
    height: 2;
    finishColor: "#e90000";
    halfwayColor: "#001dff";
    /** F/f/H/h are four posts; the screenshots contain no spanning arch. */
    spanningArch: false;
  };
  camera: {
    previewYaw: number;
    previewPitch: number;
    previewDistance: number;
    sourceInitialPosition: [0, 10, -10];
    sourceInitialLookAt: [10, 5, 10];
    sourceMapCenter: [number, 0, number];
    sourceUpdate: "Cam_alignWith(map-center, player)";
  };
  lighting: {
    sourcePointLights: Array<{
      position: [number, number, number];
      diffuseRgb255: [20, 20, 20];
      ambientRgb255: [10, 10, 10];
      specularRgb255: [1, 1, 1];
      range: 40;
    }>;
    /** Web-adapter exposure values tuned against the archived screenshots. */
    ambientIntensity: number;
    keyIntensity: number;
    keyColor: string;
    fillColor: string;
  };
  handling: {
    visualRadius: 0.3;
    authoredSpawnSymbol: "@" | "$";
    /** The C# screen overrides the ASCII marker with this constructor position. */
    runtimeSpawnOverride: [5, 2, 5];
    throttle: "mouse-down/mouse-up";
    jump: "space";
    fire: "b";
  };
};

const SOURCE_POINT_LIGHTS: ClassicLevelStyle["lighting"]["sourcePointLights"] = [
  {
    position: [8, 20, 8],
    diffuseRgb255: [20, 20, 20],
    ambientRgb255: [10, 10, 10],
    specularRgb255: [1, 1, 1],
    range: 40
  },
  {
    position: [32, 20, 32],
    diffuseRgb255: [20, 20, 20],
    ambientRgb255: [10, 10, 10],
    specularRgb255: [1, 1, 1],
    range: 40
  }
];

const SOURCE_CHECKPOINTS: ClassicLevelStyle["checkpoints"] = {
  billboardSize: 0.5,
  addRingsArgument: 0.45,
  appearance: "white-sphere-with-orange-seam"
};

export const CLASSIC_LEVEL_STYLES: Record<ClassicLevelStyleId, ClassicLevelStyle> = {
  "stockroom-level1": {
    id: "stockroom-level1",
    source: {
      ascii: "StockRoom/Level1_base.ASCII",
      screenshot: "StockRoom/screenShotLevel1.png",
      sky: "clearblue",
      scoreBestMs: 29815.1465,
      laps: 3,
      humans: 0
    },
    layout: {
      columns: 20,
      rows: 20,
      solidSymbol: "T",
      checkpointSymbol: "R",
      checkpointCount: 20,
      startCount: 1,
      startSymbol: "@",
      markerCounts: { F: 1, f: 1, H: 1, h: 1 },
      propSymbolCount: 0,
      tileSize: 1,
      tileHeight: 1
    },
    floor: {
      diffuse: "/assets/textures/classic/Alien01_B_diff.bmp",
      normal: "/assets/textures/classic/Alien01_B_normal.bmp",
      repeat: [10, 10]
    },
    tiles: {
      top: "/assets/textures/archive/twoway.jpg",
      sides: "/assets/textures/archive/twoway.jpg",
      surfaceEvidence: "screenShotLevel1.png shows the two-way-arrow skin continuing over the T cubes",
      confidence: "screenshot"
    },
    checkpoints: SOURCE_CHECKPOINTS,
    markers: {
      visual: "individual-posts",
      radius: 0.2,
      height: 2,
      finishColor: "#e90000",
      halfwayColor: "#001dff",
      spanningArch: false
    },
    camera: {
      previewYaw: -0.55,
      previewPitch: 0.78,
      previewDistance: 26,
      sourceInitialPosition: [0, 10, -10],
      sourceInitialLookAt: [10, 5, 10],
      sourceMapCenter: [10, 0, 10],
      sourceUpdate: "Cam_alignWith(map-center, player)"
    },
    lighting: {
      sourcePointLights: SOURCE_POINT_LIGHTS,
      ambientIntensity: 0.82,
      keyIntensity: 1.25,
      keyColor: "#ffe0a3",
      fillColor: "#9b9a88"
    },
    handling: {
      visualRadius: 0.3,
      authoredSpawnSymbol: "@",
      runtimeSpawnOverride: [5, 2, 5],
      throttle: "mouse-down/mouse-up",
      jump: "space",
      fire: "b"
    }
  },
  "stockroom-level2": {
    id: "stockroom-level2",
    source: {
      ascii: "StockRoom/Level2_base.ASCII",
      screenshot: "StockRoom/screenShotLevel2.png",
      sky: "lostvalley",
      scoreBestMs: 122428.984,
      laps: 3,
      humans: 10
    },
    layout: {
      columns: 20,
      rows: 20,
      solidSymbol: "Z",
      checkpointSymbol: "R",
      checkpointCount: 20,
      startCount: 1,
      startSymbol: "@",
      markerCounts: { F: 1, f: 1, H: 1, h: 1 },
      propSymbolCount: 0,
      tileSize: 1,
      tileHeight: 1
    },
    floor: {
      diffuse: "/assets/textures/classic/Checkerboard.png",
      repeat: [20, 20]
    },
    tiles: {
      top: "/assets/textures/classic/Wood03_diff.bmp",
      sides: "/assets/textures/classic/Wood03_diff.bmp",
      surfaceEvidence: "screenShotLevel2.png shows the same gold wood grain across the Z-cube tops and sides; no tile normal binding survives",
      confidence: "source-and-screenshot"
    },
    checkpoints: SOURCE_CHECKPOINTS,
    markers: {
      visual: "individual-posts",
      radius: 0.2,
      height: 2,
      finishColor: "#e90000",
      halfwayColor: "#001dff",
      spanningArch: false
    },
    camera: {
      previewYaw: -0.62,
      previewPitch: 0.75,
      previewDistance: 26,
      sourceInitialPosition: [0, 10, -10],
      sourceInitialLookAt: [10, 5, 10],
      sourceMapCenter: [10, 0, 10],
      sourceUpdate: "Cam_alignWith(map-center, player)"
    },
    lighting: {
      sourcePointLights: SOURCE_POINT_LIGHTS,
      ambientIntensity: 1.22,
      keyIntensity: 1.86,
      keyColor: "#fff0bd",
      fillColor: "#c8c3a3"
    },
    handling: {
      visualRadius: 0.3,
      authoredSpawnSymbol: "@",
      runtimeSpawnOverride: [5, 2, 5],
      throttle: "mouse-down/mouse-up",
      jump: "space",
      fire: "b"
    }
  },
  "stockroom-level3": {
    id: "stockroom-level3",
    source: {
      ascii: "StockRoom/Level3_base.ASCII",
      screenshot: "StockRoom/screenShotLevel3.png",
      sky: "clearnight",
      scoreBestMs: 158507.313,
      laps: 3,
      humans: 0
    },
    layout: {
      columns: 20,
      rows: 19,
      solidSymbol: "M",
      checkpointSymbol: "r",
      checkpointCount: 20,
      startCount: 1,
      startSymbol: "$",
      markerCounts: { F: 1, f: 1, H: 1, h: 1 },
      propSymbolCount: 0,
      tileSize: 1,
      tileHeight: 1
    },
    floor: {
      diffuse: "/assets/textures/classic/Alien02_diff.bmp",
      normal: "/assets/textures/classic/Alien02_normal.bmp",
      repeat: [10, 10]
    },
    tiles: {
      top: "/assets/textures/archive/twoway.jpg",
      sides: "/assets/textures/classic/Alien02_diff.bmp",
      surfaceEvidence: "screenShotLevel3.png fixes yellow arrow tops over purple Alien02 side/base faces",
      confidence: "source-and-screenshot"
    },
    checkpoints: SOURCE_CHECKPOINTS,
    markers: {
      visual: "individual-posts",
      radius: 0.2,
      height: 2,
      finishColor: "#e90000",
      halfwayColor: "#001dff",
      spanningArch: false
    },
    camera: {
      previewYaw: -0.58,
      previewPitch: 0.77,
      previewDistance: 26,
      sourceInitialPosition: [0, 10, -10],
      sourceInitialLookAt: [10, 5, 10],
      sourceMapCenter: [10, 0, 9.5],
      sourceUpdate: "Cam_alignWith(map-center, player)"
    },
    lighting: {
      sourcePointLights: SOURCE_POINT_LIGHTS,
      ambientIntensity: 1.12,
      keyIntensity: 2.08,
      keyColor: "#fff2c8",
      fillColor: "#7884cb"
    },
    handling: {
      visualRadius: 0.3,
      authoredSpawnSymbol: "$",
      runtimeSpawnOverride: [5, 2, 5],
      throttle: "mouse-down/mouse-up",
      jump: "space",
      fire: "b"
    }
  }
};

export function getClassicLevelStyle(id: ClassicLevelStyleId): ClassicLevelStyle {
  return CLASSIC_LEVEL_STYLES[id];
}

export type CubXMenuTag = number | "always";

export type CubXSatelliteId = "system" | "tools" | "earth" | "earth-grid" | "arrow" | "sun";

export type CubXSatelliteSpec = {
  id: CubXSatelliteId;
  label: string;
  sourceAsset: string;
  sourceTexture: string | null;
  sourcePosition: readonly [number, number, number];
  sourceScale: number;
  sourceRotationDegrees?: readonly [number, number, number];
  menuTag: CubXMenuTag;
  action: "system-reference" | "car-scene" | "none" | "return-main" | "flightx-pipe";
  evidence: "recovered-source" | "recovery-ledger";
};

/** Recovered MenuManager limits and the two source-level wildcard tags. */
export const CUBX_MENU_RULES = {
  maxButtons: 48,
  maxLevels: 16,
  allMenu: 666,
  allMenuExceptMain: 777
} as const;

/** CubX is the source-space anchor used to preserve the recovered constellation. */
export const CUBX_SATELLITE_SOURCE_ORIGIN = [-400, 500, 0] as const;

/**
 * Browser-only presentation scale. The source positions below stay untouched;
 * this smaller uniform scale keeps the full 2,100-unit constellation in view.
 */
export const CUBX_SATELLITE_DISPLAY_SCALE = 0.005;

export const CUBX_SATELLITES: readonly CubXSatelliteSpec[] = [
  {
    id: "system",
    label: "SYSTEM",
    sourceAsset: "Box.tvm",
    sourceTexture: "SystemIcon.jpg",
    sourcePosition: [-800, 300, -250],
    sourceScale: 10,
    menuTag: 0,
    action: "system-reference",
    evidence: "recovered-source"
  },
  {
    id: "tools",
    label: "TOOLS",
    sourceAsset: "Box.tvm",
    sourceTexture: "ToolsIcon.png",
    sourcePosition: [-1100, 300, -500],
    sourceScale: 10,
    menuTag: 0,
    action: "car-scene",
    evidence: "recovered-source"
  },
  {
    id: "earth",
    label: "EARTH",
    sourceAsset: "Earth.tvm",
    sourceTexture: "Earth.jpg",
    sourcePosition: [800, 500, 350],
    sourceScale: 10,
    menuTag: 0,
    action: "none",
    evidence: "recovered-source"
  },
  {
    id: "earth-grid",
    label: "EARTH GRID",
    sourceAsset: "Sphere.tvm",
    sourceTexture: "EarthGridXL.bmp",
    sourcePosition: [800, 500, 350],
    sourceScale: 1.2,
    menuTag: 0,
    action: "none",
    evidence: "recovered-source"
  },
  {
    id: "arrow",
    label: "MAIN MENU",
    sourceAsset: "Fleche.tvm",
    sourceTexture: "marble10.jpg",
    sourcePosition: [1000, 600, 300],
    sourceScale: 1,
    sourceRotationDegrees: [0, 180, 0],
    menuTag: CUBX_MENU_RULES.allMenu,
    action: "return-main",
    evidence: "recovered-source"
  },
  {
    id: "sun",
    label: "FLIGHTX",
    sourceAsset: "procedural box",
    sourceTexture: null,
    sourcePosition: [0, 500, 0],
    sourceScale: 20,
    menuTag: "always",
    action: "flightx-pipe",
    evidence: "recovery-ledger"
  }
] as const;

/** Recreates MenuManager::SetNiveau visibility without inventing new levels. */
export function isCubXMenuTagVisible(tag: CubXMenuTag, activeLevel: number): boolean {
  if (tag === "always" || tag === CUBX_MENU_RULES.allMenu) {
    return true;
  }
  if (tag === CUBX_MENU_RULES.allMenuExceptMain) {
    return activeLevel !== 0;
  }
  return tag === activeLevel;
}

/** Maps source coordinates into the browser scene while keeping handedness used by CubZ. */
export function cubXSatelliteDisplayOffset(
  sourcePosition: readonly [number, number, number]
): readonly [number, number, number] {
  return [
    (sourcePosition[0] - CUBX_SATELLITE_SOURCE_ORIGIN[0]) * CUBX_SATELLITE_DISPLAY_SCALE,
    (sourcePosition[1] - CUBX_SATELLITE_SOURCE_ORIGIN[1]) * CUBX_SATELLITE_DISPLAY_SCALE,
    -(sourcePosition[2] - CUBX_SATELLITE_SOURCE_ORIGIN[2]) * CUBX_SATELLITE_DISPLAY_SCALE
  ];
}

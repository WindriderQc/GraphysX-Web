/**
 * Phase R4.4 — the canonical GraphysX level contract, transcribed from the
 * C++/CLI bridge (`GfxNet/EntityNET.h`, `GfxNet/SceneNET.h`). These enums are
 * the vocabulary every legacy scene was authored in; new JSON level formats
 * should stay expressible in these terms so archive scenes round-trip.
 */

/** EntityNET enumType — 15 entity kinds the engine knew how to build */
export type LegacyEntityType =
  | "PRIMITIVE"
  | "BILLBOARD"
  | "FLOOR"
  | "CUSTOM"
  | "PHYSPRIMITIVE"
  | "PHYSICCUSTOM"
  | "XMESH"
  | "PHYSICXMESH"
  | "PHYSICXSTATIC" // static trimesh — the workhorse of every recovered level
  | "DUPLICATEMESH"
  | "TEXT"
  | "VERTEXSTRIP"
  | "ACTOR"
  | "NONE"
  | "V1_5";

/** EntityNET enumGeom — primitive geometry vocabulary */
export type LegacyGeometry =
  | "CUBE"
  | "SPHERE"
  | "CYLINDER"
  | "CONE"
  | "TEAPOT"
  | "PLANE"
  | "NON_PRIMITIVE"
  | "CUSTOM_MESH";

/** enumPHYSMAT — physics material lanes (design-time set) */
export type LegacyPhysicsMaterial = "DEF_PHYSMAT" | "WALL" | "FINISH" | "GROUND" | "BALL" | "HUMAN";

/** runtime physmat set seen in EntityNET.h:8 — kept for save-file compatibility */
export type LegacyRuntimePhysicsMaterial = "DEF_PHYSMAT" | "WOOD" | "FINISH" | "LEVEL" | "BALL" | "ELEVATOR";

/** eMaterial — render material classes */
export type LegacyRenderMaterial = "DEF_MATERIAL" | "TRANSLUCENT" | "GLASS" | "MATE" | "METAL_SHINE";

/** EntityNET — one object in a scene */
export type LegacyEntity = {
  name: string;
  type: LegacyEntityType;
  geometry?: LegacyGeometry;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  enabled: boolean;
  mass: number;
  /** animated by code (rotators, pistons, elevators) rather than physics */
  meshControlled: boolean;
  pathToMesh?: string;
  textureName?: string;
  physicsMaterial: LegacyPhysicsMaterial;
  renderMaterial?: LegacyRenderMaterial;
};

/** SceneNET — a whole scene, matching the XML the 2015 editor serialized */
export type LegacyScene = {
  actionsHeader?: string;
  asciiFilePath?: string;
  mapSize?: [number, number];
  entities: LegacyEntity[];
  /** ring checkpoint positions (Anneaux) */
  ringPositions: Array<[number, number, number]>;
  playerStart: [number, number, number];
  /** LapChecker gate corners: two points per gate, exactly like 2015 */
  finishGate: { a: [number, number, number]; b: [number, number, number] };
  halfLapGate: { a: [number, number, number]; b: [number, number, number] };
};

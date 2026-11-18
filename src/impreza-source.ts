export const IMPREZA_MANIFEST_URL = "/assets/ports/impreza/manifest.json";
export const IMPREZA_WORLDS = ["atmel", "racinx"] as const;
export type ImprezaWorldId = typeof IMPREZA_WORLDS[number];
export type ImprezaVector = [number, number, number];
export type ImprezaModelKey = "chassis" | "leftWheel" | "rightWheel" | "ring";
export type ImprezaSource = {
  schema: "graphysx.impreza-source/v1";
  originals: { source: string; sha256: string; bytes: number }[];
  models: Record<ImprezaModelKey, { id: string; url: string; source: string; sourceSha256: string; vertexCount: number; triangleCount: number; materialCount: number;
    sourceBounds: { min: ImprezaVector; max: ImprezaVector; size: ImprezaVector }; preserveOrigin: true }>;
  vehicle: { mass: number; wheelMass: number; enginePower: number; maximumSteerDegrees: number; steeringDegreesPerSourceFrame: number; rearHandbrakeForce: number; setPositionYOffset: number;
    wheels: { id: string; model: "leftWheel" | "rightWheel"; sourcePosition: ImprezaVector; steering: boolean; driven: boolean }[] };
  worlds: Record<ImprezaWorldId, {
    source: string;
    terrain: { source: string; nativeSize: [number, number]; heights: number[]; size: number; heightScale: number; sourceOrigin: ImprezaVector; note: string };
    player: { id: number; sourcePosition: ImprezaVector };
    opponents: { id: number; sourcePosition: ImprezaVector }[];
    rings?: { id: number; sourcePosition: ImprezaVector }[];
    ringScale?: number;
    experimentalWater?: { source: string; height: number; size: number; note: string };
    limitations: string[];
  }>;
};

/** Match every other native coordinate boundary in the product: +Y up, forward -Z. */
export const imprezaWebPosition = ([x, y, z]: ImprezaVector): ImprezaVector => [x, y, -z];

export async function loadImprezaSource(): Promise<ImprezaSource> {
  const response = await fetch(import.meta.env.BASE_URL + IMPREZA_MANIFEST_URL.slice(1));
  if (!response.ok) throw new Error(`Impreza source data: HTTP ${response.status}`);
  const source = await response.json() as ImprezaSource;
  if (source.schema !== "graphysx.impreza-source/v1" || source.vehicle?.wheels?.length !== 4 || source.worlds?.racinx?.rings?.length !== 100
    || ["chassis", "leftWheel", "rightWheel", "ring"].some(id => !source.models?.[id as ImprezaModelKey]?.preserveOrigin)) throw new Error("Invalid Impreza source manifest");
  return source;
}

import { GRAPHYSX_AGENT_WORLD_ASSET_CATALOG } from "./agent-world-asset-catalog";
import type { AgentWorldDefinition, AgentWorldEntityDefinition, AgentWorldVector3 } from "./agent-world-runtime";

export const DOMINUS_SOURCE_URL = "/assets/ports/archive-dominus.json";
export const DOMINUS_WORLD_ID = "archive-dominus";
export type DominusModel = { id: string; name: string; family: string; url: string; source: string; sourceSha256: string; recovery: string; colorKey: boolean; bounds: { min: number[]; max: number[]; size: number[] }; vertices: number; triangles: number };
export type DominusSource = { schema: string; models: DominusModel[]; textures: { url: string; runtimeColorKey: string | null }[]; portPlacements: { name: string; position: number[]; rotation: number[]; scale: number[] }[]; evidence: { faithful: string[]; adapted: string[]; unestablished: string[] } };
export type DominusView = "source" | "models";
export const dominusRoot = (view: DominusView) => `dominus-${view}`;
const tuple = (values: number[]) => values as AgentWorldVector3;

function modelEntity(model: DominusModel, parentId: string, id: string, fitSize: number, sourcePivot: boolean): AgentWorldEntityDefinition {
  const asset = GRAPHYSX_AGENT_WORLD_ASSET_CATALOG.find(a => a.url === model.url);
  if (!asset) throw new Error(`Dominus model is not registered: ${model.id}`);
  const center = model.bounds.min.map((n, axis) => (n + model.bounds.max[axis]) / 2), span = Math.max(...model.bounds.size);
  return { id, parentId, type: "model", label: model.name, asset: { id: asset.id, fitSize, ...(model.colorKey ? { colorKey: "#ff00ff", colorKeyTolerance: .04, alphaTest: .04 } : {}) },
    transform: { position: sourcePivot ? tuple([center[0], center[1], -center[2]]) : [0, fitSize * model.bounds.size[1] / span / 2, 0] },
    tags: ["archive", `source:${model.source}`, `dominus-model:${model.id}`, `dominus-family:${model.family}`, model.recovery] };
}

export function buildDominus(source: DominusSource, view: DominusView = "source"): AgentWorldDefinition {
  if (source.schema !== "graphysx.archive-dominus/v1" || source.models.length !== 65) throw new Error("Unknown Dominus source record");
  const entities: AgentWorldEntityDefinition[] = [
    { id: "dominus-fill", type: "ambient-light", label: "Lumière de visite", material: { color: "#ffffff" }, intensity: 1.35, tags: ["adapted-lighting"] },
    { id: "dominus-key", type: "directional-light", label: "Lumière d’inspection", material: { color: "#ffffff" }, intensity: 2.5, transform: { position: [20, 50, 30] }, tags: ["adapted-lighting"] },
    { id: "dominus-source", type: "group", label: "ObjectLibrary · 28 placements d’origine", visible: view === "source", tags: ["archive", "source:ObjectLibrary.xml"] },
    { id: "dominus-models", type: "group", label: "65 modèles · galerie d’inspection actuelle", visible: view === "models", tags: ["archive", "adapted:inspection-layout"] },
    { id: "dominus-gallery-floor", parentId: "dominus-models", type: "plane", label: "Fond de galerie adapté", geometry: { width: 65, height: 59 }, transform: { position: [0, -.05, 3.5], rotationDegrees: [-90, 0, 0] }, material: { color: "#d8d9c7", roughness: .95 }, tags: ["adapted:inspection-stage"] },
  ];
  for (const placement of source.portPlacements) {
    const model = source.models.find(m => m.id === placement.name.toLowerCase());
    if (!model) throw new Error(`Unknown source placement ${placement.name}`);
    const parentId = `dominus-source-${model.id}`;
    entities.push({ id: parentId, parentId: "dominus-source", type: "group", label: `${model.name} · placement source`, transform: { position: tuple([placement.position[0], placement.position[1], -placement.position[2]]), rotationDegrees: tuple([placement.rotation[0], -placement.rotation[1], -placement.rotation[2]]), scale: tuple(placement.scale) }, tags: ["archive", "source:ObjectLibrary.xml"] },
      modelEntity(model, parentId, parentId + "-model", Math.max(...model.bounds.size), true));
  }
  const sourceMin = [Infinity, Infinity, Infinity], sourceMax = [-Infinity, -Infinity, -Infinity];
  for (const p of source.portPlacements) {
    const model = source.models.find(m => m.id === p.name.toLowerCase())!;
    for (let axis = 0; axis < 3; axis++) {
      const sign = axis === 2 ? -1 : 1, values = [model.bounds.min[axis], model.bounds.max[axis]].map(n => (p.position[axis] + p.scale[axis] * n) * sign);
      sourceMin[axis] = Math.min(sourceMin[axis], ...values); sourceMax[axis] = Math.max(sourceMax[axis], ...values);
    }
  }
  entities.push({ id: "dominus-source-floor", parentId: "dominus-source", type: "plane", label: "Fond de visite adapté", geometry: { width: sourceMax[0] - sourceMin[0] + 3, height: sourceMax[2] - sourceMin[2] + 3 }, transform: { position: [(sourceMin[0] + sourceMax[0]) / 2, sourceMin[1] - .08, (sourceMin[2] + sourceMax[2]) / 2], rotationDegrees: [-90, 0, 0] }, material: { color: "#d8d9c7", roughness: .95 }, tags: ["adapted:inspection-stage"] });
  source.models.forEach((model, index) => {
    const parentId = `dominus-gallery-${model.id}`;
    entities.push({ id: parentId, parentId: "dominus-models", type: "group", label: model.name, transform: { position: [index % 9 * 7 - 28, 0, Math.floor(index / 9) * 7 - 21] }, tags: ["archive", "adapted:inspection-layout", `dominus-family:${model.family}`] },
      modelEntity(model, parentId, parentId + "-model", 4.5, false));
  });
  return { schema: "graphysx.agent-world/v2", id: DOMINUS_WORLD_ID, label: "Dominus · modèles et placements retrouvés", environment: { background: "#d4dee0", sky: "clearblue", envelope: { fogNear: 300, fogFar: 800, cameraFar: 1200 }, ground: { visible: false, size: 145, color: "#d8d9c7", grid: false, gridColor: "#a9b1a4" } }, entities };
}

export function dominusViewCommands(view: DominusView) {
  return (["source", "models"] as const).map(candidate => ({ op: "update" as const, id: dominusRoot(candidate), patch: { visible: candidate === view } }));
}

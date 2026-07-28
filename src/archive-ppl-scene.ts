/** Player-visible reconstruction of the active BallZ2015 ppl.shade ring binding. */
import { Vector3 } from "three";
import { ARCHIVE_PPL_PROVENANCE } from "./archive-ppl-material";
import {
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldEntityDefinition,
  type AgentWorldMaterial,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import type { PlatformHost } from "./platform-host";

const LIGHT_POSITION: [number, number, number] = [0, 9, 5];
const RING_MAPS: Partial<AgentWorldMaterial> = {
  color: "#ffffff",
  roughness: 0.5,
  metalness: 0,
  texture: { id: "z-ring" },
  normalTexture: { id: "archive-ball-normal" },
  normalScale: 1,
};

function sphere(id: string, label: string, x: number, shader: AgentWorldMaterial["shader"], tags: string[]): AgentWorldEntityDefinition {
  return {
    id, label, type: "sphere", transform: { position: [x, 3, 0] },
    geometry: { radius: 2.25, radialSegments: 64 },
    material: { ...RING_MAPS, shader },
    castShadow: true, receiveShadow: true,
    behaviors: [{ type: "spin", axis: "y", speedDegrees: 9 }],
    tags: ["ppl-shade", "ring-binding", ...tags],
  };
}

export const PPL_SCENE_PROVENANCE = {
  ...ARCHIVE_PPL_PROVENANCE,
  diffuseMap: "exact StockRoom/Suzanne1/ZRing.png alias, SHA-256 8EAD1697…FC8CA8",
  activeBinding: "Scene3D/Anneaux.cpp lines 34-37 and 80-90",
  specimens: "platform PBR reference; source 0.03 default; active Anneaux 0.025 tuning",
} as const;

export function composeArchivePpl(api: GraphysXAgentWorldApi) {
  const sourceDefault: AgentWorldMaterial["shader"] = {
    id: "archive-ppl", bumpAmount: 0.03, lightPosition: LIGHT_POSITION,
  };
  const activeRing: AgentWorldMaterial["shader"] = {
    id: "archive-ppl", bumpAmount: 0.025, lightPosition: LIGHT_POSITION,
  };
  const entities: AgentWorldEntityDefinition[] = [
    {
      id: "ppl-floor", label: "Inspection Floor", type: "box",
      transform: { position: [0, -0.3, 0] }, geometry: { width: 21, height: 0.6, depth: 10 },
      material: { color: "#161922", roughness: 0.82, metalness: 0.03 },
      physics: { mode: "static", material: "ground" }, receiveShadow: true,
      tags: ["ppl-shade", "gallery"],
    },
    sphere("ppl-pbr", "Platform PBR Reference", -6.2, null, ["reference"]),
    sphere("ppl-source", "ppl.shade Source Default · 0.03", 0, sourceDefault, ["translated", "source-default"]),
    sphere("ppl-ring", "Anneaux Active Binding · 0.025", 6.2, activeRing, ["translated", "recorded-binding"]),
    {
      id: "ppl-point", label: "Authored Active-Scene Light", type: "point-light",
      transform: { position: LIGHT_POSITION }, intensity: 26, distance: 42,
      material: { color: "#fff4dc", emissive: "#fff4dc", emissiveIntensity: 2 },
      castShadow: true, marker: true, tags: ["ppl-shade", "lighting", "adapted-position"],
    },
    {
      id: "ppl-fill", label: "Inspection Fill", type: "ambient-light", intensity: 0.1,
      material: { color: "#8094b3" }, tags: ["ppl-shade", "lighting", "adapted-showcase"],
    },
  ];
  return api.create({
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: "archive-ppl-lab",
    label: "Archive ppl.shade Ring Lab",
    environment: {
      background: "#05070b", sky: null,
      lighting: { source: "studio", intensity: 0.12, yawDegrees: 0, backgroundIntensity: 0.03, backgroundBlur: 0 },
      post: { bloom: { strength: 0.2, threshold: 0.88, radius: 0.16 } },
      envelope: { fogNear: 34, fogFar: 90, cameraFar: 180 },
      ground: { visible: false, size: 30, color: "#161922", grid: false, gridColor: "#364152" },
      physics: { gravity: [0, -9.81, 0] },
    },
    entities,
  });
}

export function frameArchivePpl(host: PlatformHost): void {
  host.camera.position.set(0, 6, 17.5);
  host.focusOn(new Vector3(0, 2.8, 0), 10, 1.05);
}

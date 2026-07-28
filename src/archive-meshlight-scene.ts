/**
 * Player-visible comparison for BallZ2015's meshlight.shade translation.
 * The shader math is selectable scene material data; this gallery only makes the differences
 * easy to inspect. Room 2's exact DDS diffuse/normal pair supplies the evidenced inputs.
 */
import { Vector3 } from "three";
import { ARCHIVE_MESHLIGHT_PROVENANCE } from "./archive-meshlight-material";
import {
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldEntityDefinition,
  type AgentWorldMaterial,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import type { PlatformHost } from "./platform-host";

const LIGHT_POSITION: [number, number, number] = [0, 9, 4];
const MAPS: Partial<AgentWorldMaterial> = {
  color: "#ffffff",
  roughness: 0.48,
  metalness: 0.04,
  texture: { id: "common-tv3dlogo-diffuse", repeat: [1.5, 1.5] },
  normalTexture: { id: "common-tv3dlogo-normal", repeat: [1.5, 1.5] },
  normalScale: 1,
};

function specimen(
  id: string,
  label: string,
  x: number,
  shader: AgentWorldMaterial["shader"],
  tags: string[],
): AgentWorldEntityDefinition {
  return {
    id, label, type: "sphere", transform: { position: [x, 3.25, 0] },
    geometry: { radius: 2.35, radialSegments: 64 },
    material: { ...MAPS, shader },
    castShadow: true, receiveShadow: true,
    behaviors: [{ type: "spin", axis: "y", speedDegrees: 7 }],
    tags: ["meshlight", "specimen", ...tags],
  };
}

export const MESHLIGHT_SCENE_PROVENANCE = {
  ...ARCHIVE_MESHLIGHT_PROVENANCE,
  textures: "exact room2.tvm tv3dlogo_d.dds + tv3dlogo_n.dds",
  specularInput: "adapted diffuse-red mask: room2.tvm and #23 demo contain no third/specular map binding",
  specimens: "platform PBR reference; source defaults; EditorScreen's recorded commented halogen tuning",
} as const;

export function composeArchiveMeshlight(api: GraphysXAgentWorldApi) {
  const sourceDefaults: AgentWorldMaterial["shader"] = {
    id: "archive-meshlight",
    parallaxStrength: 0.04,
    specularMultiplier: 5,
    specularTexture: { id: "common-tv3dlogo-diffuse", repeat: [1.5, 1.5] },
    lightPosition: LIGHT_POSITION,
    lightColor: "#ff0000",
  };
  const editorTuning: AgentWorldMaterial["shader"] = {
    ...sourceDefaults,
    parallaxStrength: 0.25,
    lightColor: "#fff1e0",
  };
  const entities: AgentWorldEntityDefinition[] = [
    {
      id: "meshlight-floor", label: "Shadow Receiver", type: "box",
      transform: { position: [0, -0.3, 0] }, geometry: { width: 21, height: 0.6, depth: 10 },
      material: { color: "#151922", roughness: 0.8, metalness: 0.05 },
      physics: { mode: "static", material: "ground" }, receiveShadow: true,
      tags: ["meshlight", "gallery"],
    },
    specimen("meshlight-pbr", "Platform PBR Reference", -6.2, null, ["reference"]),
    specimen("meshlight-source", "meshlight.shade Source Defaults", 0, sourceDefaults, ["translated", "source-defaults"]),
    specimen("meshlight-editor", "Recorded Halogen / 0.25 Parallax", 6.2, editorTuning, ["translated", "recorded-commented-tuning"]),
    {
      id: "meshlight-point", label: "Archived Shader Light Position", type: "point-light",
      transform: { position: LIGHT_POSITION }, intensity: 28, distance: 44,
      material: { color: "#fff1e0", emissive: "#fff1e0", emissiveIntensity: 2 },
      castShadow: true, marker: true, tags: ["meshlight", "lighting"],
    },
    {
      id: "meshlight-fill", label: "Inspection Fill", type: "ambient-light", intensity: 0.12,
      material: { color: "#8aa2c4" }, tags: ["meshlight", "lighting", "adapted-showcase"],
    },
  ];
  return api.create({
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: "archive-meshlight-lab",
    label: "Archive meshlight.shade Lab",
    environment: {
      background: "#05070b", sky: null,
      lighting: { source: "studio", intensity: 0.16, yawDegrees: 0, backgroundIntensity: 0.04, backgroundBlur: 0 },
      post: { bloom: { strength: 0.24, threshold: 0.86, radius: 0.18 } },
      envelope: { fogNear: 34, fogFar: 90, cameraFar: 180 },
      ground: { visible: false, size: 30, color: "#151922", grid: false, gridColor: "#364152" },
      physics: { gravity: [0, -9.81, 0] },
    },
    entities,
  });
}

export function frameArchiveMeshlight(host: PlatformHost): void {
  host.camera.position.set(0, 6.1, 17.5);
  host.focusOn(new Vector3(0, 2.7, 0), 10, 1.05);
}

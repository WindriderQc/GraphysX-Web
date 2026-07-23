/**
 * Map 1 — the recovered BallZ 2011 descent, composed as ordinary v2 vocabulary.
 *
 * The only archive-authored evidence in this scene is the decoded Map1.TVM mesh. Its
 * positions, UVs, indices and bounds are carried byte-for-value through
 * `public/assets/ports/archive-map1.json`; the runtime uses that same payload for the
 * rendered model and the exact static trimesh collider.
 *
 * Everything that turns the mesh into a game is deliberately an adaptation. The prior
 * restoration identified it as a vertical descent and used scale 0.6, halfway z=0 and
 * finish z=-32, but no original 2011 rules, spawn, checkpoint intent, controller tuning,
 * camera, material binding or timing record survives. This composition therefore chooses
 * a stable centre lane, one halfway gate, ordinary impulse controls and modern presentation
 * without presenting any of them as recovered design.
 */
import { Vector3 } from "three";
import {
  GRAPHYSX_AGENT_RULES_SCHEMA,
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldDefinition,
  type AgentWorldEntityDefinition,
  type AgentWorldVector3,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import type { PlatformHost } from "./platform-host";

export const MAP1_SCENE_ID = "graphysx-archive-map1";

const MAP1_ASSET_ID = "archive-map1";
const MAP1_NATIVE_LONGEST_SPAN = 119.717;
const MAP1_RESTORATION_SCALE = 0.6;
const MAP1_FIT_SIZE = MAP1_NATIVE_LONGEST_SPAN * MAP1_RESTORATION_SCALE;
const BALL_RADIUS = 0.42;
const SPAWN: AgentWorldVector3 = [0, 10, 30];

export const MAP1_PROVENANCE = {
  source: "BallZ 2011/Release/Media/Map1.TVM via src/legacy/map1-level.json",
  decodedCatalogSha256: "bbdfb9b3ac59d2c316084ed63141be6aa2b235a82c0b61a7380b53c13063e185",
  faithful:
    "699 decoded vertices, 1456 triangles, UVs and native bounds; rendered and collided from the same exact vendored payload",
  adapted:
    "0.6 restoration scale; loader recenter/handedness plus a 180-degree presentation turn; centre-lane spawn; halfway and finish trigger volumes; ball controls, safety floor, camera, lighting, sky and effects",
  absent:
    "original material and texture bindings, 2011 controller behavior, authored spawn/rules/checkpoint intent, camera, timer and finish-loop semantics",
} as const;

function buildDefinition(): AgentWorldDefinition {
  const entities: AgentWorldEntityDefinition[] = [
    {
      id: "map1-terrain",
      label: "Recovered Map1.TVM",
      type: "model",
      // The asset loader converts archive handedness. A proper 180-degree world rotation
      // points the centre descent toward -z, so ArrowUp moves away from the camera and the
      // restoration's halfway/finish z coordinates remain readable scene data.
      transform: { position: [0, 0, 0], rotationDegrees: [0, 180, 0] },
      asset: { id: MAP1_ASSET_ID, fitSize: MAP1_FIT_SIZE },
      physics: { mode: "static", material: "ground", collider: "trimesh" },
      castShadow: true,
      receiveShadow: true,
      tags: ["map1", "archive", "archive-mesh", "scene-native-collider", "collider:trimesh"],
    },
    {
      id: "map1-ball",
      label: "Descent Ball",
      type: "sphere",
      transform: { position: SPAWN },
      geometry: { radius: BALL_RADIUS, radialSegments: 32 },
      material: {
        color: "#ff9a67",
        emissive: "#7a2b12",
        emissiveIntensity: 0.42,
        roughness: 0.25,
        metalness: 0.12,
      },
      physics: { mode: "dynamic", material: "ball", mass: 1.6 },
      interactions: (
        [
          ["push-north", "Roll north", [0, 0, -1]],
          ["push-south", "Roll south", [0, 0, 1]],
          ["push-west", "Roll west", [-1, 0, 0]],
          ["push-east", "Roll east", [1, 0, 0]],
        ] as Array<[string, string, AgentWorldVector3]>
      ).map(([id, label, direction]) => ({
        id,
        label,
        type: "apply-impulse" as const,
        targetIds: ["map1-ball"],
        impulse: direction.map((axis) => axis * 2.6) as AgentWorldVector3,
      })),
      castShadow: true,
      tags: ["map1", "player", "agent-observable", "physics:dynamic", "adapted-gameplay"],
    },
    {
      id: "map1-checkpoint-halfway",
      label: "Halfway Gate",
      type: "box",
      transform: { position: [0, 0, 0] },
      geometry: { width: 18, height: 14, depth: 0.8 },
      material: {
        color: "#63d9ff",
        emissive: "#248eb5",
        emissiveIntensity: 0.76,
        opacity: 0.22,
        roughness: 0.16,
      },
      physics: { mode: "trigger" },
      castShadow: false,
      tags: ["map1", "checkpoint", "gate", "adapted-gameplay"],
    },
    {
      id: "map1-finish",
      label: "Lower Finish",
      type: "box",
      transform: { position: [0, -13, -32] },
      geometry: { width: 18, height: 12, depth: 0.8 },
      material: {
        color: "#78f0d0",
        emissive: "#2fae8b",
        emissiveIntensity: 0.9,
        opacity: 0.28,
        roughness: 0.14,
      },
      physics: { mode: "trigger" },
      castShadow: false,
      tags: ["map1", "finish", "gate", "adapted-gameplay"],
    },
    {
      id: "map1-finish-beacon",
      label: "Finish Beacon",
      type: "emitter",
      transform: { position: [0, -13, -32] },
      emitter: {
        preset: "firetrail",
        sizeScale: 2.2,
        speed: 2.1,
        spread: 1.5,
        maxParticles: 64,
        color: "#78f0d0",
      },
      tags: ["map1", "finish", "effect", "adapted-presentation"],
    },
    {
      id: "map1-catch-floor",
      label: "Descent Safety Floor",
      type: "box",
      transform: { position: [0, -21, 0] },
      geometry: { width: 56, height: 0.6, depth: 80 },
      material: { color: "#0b1b24", roughness: 0.95, metalness: 0.01 },
      physics: { mode: "static", material: "ground" },
      visible: false,
      castShadow: false,
      receiveShadow: true,
      tags: ["map1", "safety-floor", "collision", "adapted-gameplay"],
    },
    {
      id: "map1-playfield",
      label: "Map 1 Play Framing",
      type: "box",
      transform: { position: [0, 0, 0] },
      geometry: { width: 50, height: 40, depth: 74 },
      material: { color: "#071622", opacity: 0.01 },
      visible: false,
      castShadow: false,
      tags: ["map1", "playfield", "framing", "adapted-presentation"],
    },
    {
      id: "map1-ambient",
      label: "Map 1 Ambient",
      type: "ambient-light",
      intensity: 0.58,
      material: { color: "#a8c8df" },
      tags: ["map1", "light", "adapted-presentation"],
    },
    {
      id: "map1-sun",
      label: "Map 1 Sun",
      type: "directional-light",
      transform: { position: [-28, 38, 24] },
      intensity: 2.6,
      material: { color: "#ffe7bd" },
      castShadow: true,
      tags: ["map1", "light", "adapted-presentation"],
    },
    {
      id: "map1-depth-glow",
      label: "Lower Descent Glow",
      type: "point-light",
      transform: { position: [0, -8, -22] },
      intensity: 7,
      distance: 48,
      marker: false,
      material: { color: "#78f0d0", emissive: "#78f0d0" },
      tags: ["map1", "light", "adapted-presentation"],
    },
  ];

  return {
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: MAP1_SCENE_ID,
    label: "Map 1: Gravity Descent",
    environment: {
      background: "#07131f",
      // `skyx` is the stock set used by the restoration-era Map 1 visit. No archived
      // scene record binds it to Map1.TVM, so provenance lists it as presentation.
      sky: "skyx",
      lighting: { source: "hdri", hdri: "studio-small-08", intensity: 0.95, yawDegrees: 18, backgroundIntensity: 0.9, backgroundBlur: 0.08 },
      overlay: "vignette",
      ground: { visible: false, size: 90, color: "#0b1b24", grid: false, gridColor: "#24586a" },
      physics: { gravity: [0, -9.81, 0] },
      envelope: { fogNear: 82, fogFar: 230, cameraFar: 340 },
      post: { bloom: { strength: 0.52, threshold: 0.62, radius: 0.38 } },
    },
    entities,
    rules: {
      schema: GRAPHYSX_AGENT_RULES_SCHEMA,
      subjectId: "map1-ball",
      spawn: { entityId: "map1-ball", position: SPAWN },
      checkpoints: [{ triggerId: "map1-checkpoint-halfway", label: "Halfway" }],
      finish: { triggerId: "map1-finish" },
      laps: 1,
    },
  };
}

/** Compose Map 1 through the same public API an agent or stored scene uses. */
export function composeArchiveMap1(api: GraphysXAgentWorldApi) {
  return api.create(buildDefinition());
}

/** Give the long descent a high three-quarter introduction rather than a showroom close-up. */
export function frameArchiveMap1(host: PlatformHost): void {
  host.camera.position.set(44, 38, 50);
  host.focusOn(new Vector3(0, -2, 0), 40, 1.1, 78);
}

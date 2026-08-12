/**
 * Suzanne Machinery Run — the decoded 2015 moving-parts study as ordinary v2 scene data.
 *
 * Faithful source material:
 * - all eight decoded `.x` objects are vendored byte-for-value by
 *   `scripts/vendor-suzanne-machinery.mjs`;
 * - native scale and the objects' shared source-space placement are reconstructed from their
 *   recorded bounds (with the loader's documented Z-handedness conversion);
 * - the twelve recovered `ringPath` coordinates are preserved in order.
 *
 * Adapted game layer:
 * - the source roles identify piston/rotator motion but preserve no complete machine timing.
 *   The frequencies below retain the prior restoration's disclosed motion values;
 * - eleven path points are checkpoints and the twelfth is the finish;
 * - the classic GridXL ball, controls, trigger volumes, lighting, camera and safety floor are
 *   modern v2 composition. None is presented as an authored 2015 race rule.
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
import { instantiateAgentWorldPrefab } from "./agent-world-prefabs";
import type { PlatformHost } from "./platform-host";

export const SUZANNE_MACHINERY_SCENE_ID = "graphysx-archive-suzanne-machinery";

type SourcePart = {
  role: string;
  label: string;
  bounds: { min: AgentWorldVector3; max: AgentWorldVector3 };
  physics: "none" | "static" | "piston" | "door" | "rotator-cube";
};

const SOURCE_PARTS: readonly SourcePart[] = [
  { role: "level", label: "Recovered Suzanne Machinery Arena", bounds: { min: [-6.0968, -0.9042, -6.1541], max: [6.1471, 2.4087, 6.0965] }, physics: "static" },
  { role: "piston-stand", label: "Recovered Piston Stand", bounds: { min: [2.7261, 0.1481, 3.9371], max: [3.0439, 0.4659, 4.6573] }, physics: "static" },
  { role: "piston-trigger", label: "Recovered Piston Trigger", bounds: { min: [1.3942, -0.0964, 2.752], max: [3.9929, 0.0458, 4.0022] }, physics: "static" },
  { role: "finish-line", label: "Recovered Finish Line", bounds: { min: [-3.4006, -0.0057, -3.472], max: [-1.3032, 0.0131, -1.4425] }, physics: "none" },
  { role: "door-gate", label: "Recovered Door Gate", bounds: { min: [-3.1365, 0.0348, -3.0946], max: [-1.8244, 0.3895, -1.7816] }, physics: "door" },
  { role: "piston", label: "Recovered Piston", bounds: { min: [1.8851, 0.0729, 3.7892], max: [3.8851, 0.5509, 5.1215] }, physics: "piston" },
  { role: "rotator", label: "Recovered Rotator Stand", bounds: { min: [1.2423, 0.1482, -4.0091], max: [4.0058, 2.1342, -1.2457] }, physics: "static" },
  { role: "rotator-cube", label: "Recovered Rotator Cube", bounds: { min: [2.257, 0.1332, -3.0112], max: [3.0241, 0.9003, -2.2441] }, physics: "rotator-cube" },
] as const;

// Exact `ringPath` from src/content/suzanne1-level.json. The Z sign conversion happens below.
const SOURCE_RING_PATH: readonly AgentWorldVector3[] = [
  [-3, 0.1, 1.5],
  [-2.5399, 0.1, -1.3593],
  [-2.3986, 0.1, -2.7174],
  [-2.6173, 0.1, -3.2994],
  [-2.0089, 0.1, -3.5568],
  [0.4474, 0.1, -3.4028],
  [2.5719, 0.1, -2.9493],
  [3.0717, 0.1, -2.1331],
  [2.9707, 0.1, -0.8238],
  [2.6525, 0.1, 0.7013],
  [2.3459, 0.1, 2.3412],
  [-0.6319, 0.1, 2.9781],
] as const;

const BALL_ID = "suzanne-machinery-ball";
const SPAWN: AgentWorldVector3 = [-3.85, 0.58, -1.5];

export const SUZANNE_MACHINERY_PROVENANCE = {
  source: "Archive/bckup/BallZ2015.bckup/Media/Suzanne1.*.x via src/content/suzanne1-level.json",
  faithful:
    "eight decoded objects at native scale and source-relative placement; 38,646 vertices, 20,036 triangles; source colours, recorded textures and twelve ring-path coordinates",
  adapted:
    "v2 convex-hull/trimesh collision policy; restored piston/gate/rotator motion timings; 11 checkpoint triggers plus final ring; classic GridXL ball, controls, safety floor, lighting and camera",
  absent:
    "a complete archived 2015 gameplay loop or authoritative machine timing; no unrecorded RotatorUV binding is inferred",
} as const;

function sourceCenter(part: SourcePart): AgentWorldVector3 {
  return [
    (part.bounds.min[0] + part.bounds.max[0]) / 2,
    (part.bounds.min[1] + part.bounds.max[1]) / 2,
    -(part.bounds.min[2] + part.bounds.max[2]) / 2,
  ];
}

function nativeFit(part: SourcePart): number {
  return Math.max(
    part.bounds.max[0] - part.bounds.min[0],
    part.bounds.max[1] - part.bounds.min[1],
    part.bounds.max[2] - part.bounds.min[2],
  );
}

function modelEntity(part: SourcePart): AgentWorldEntityDefinition {
  const moving = part.physics === "piston" || part.physics === "door" || part.physics === "rotator-cube";
  const behaviors: AgentWorldEntityDefinition["behaviors"] = part.physics === "piston"
    ? [{ id: "source-piston-stroke", type: "bob", axis: "x", amplitude: 0.25, frequencyHz: 1.4 / (Math.PI * 2) }]
    : part.physics === "door"
      ? [{ id: "source-door-lift", type: "bob", axis: "y", amplitude: 0.45, frequencyHz: 0.9 / (Math.PI * 2), phaseDegrees: 90 }]
      : part.physics === "rotator-cube"
        ? [{ id: "source-rotator-spin", type: "spin", axis: "y", speedDegrees: 1.7 * 180 / Math.PI }]
        : [];
  return {
    id: `suzanne-machinery-${part.role}`,
    label: part.label,
    type: "model",
    transform: { position: sourceCenter(part) },
    asset: { id: `archive-suzanne-${part.role}`, fitSize: nativeFit(part) },
    ...(part.physics === "none" ? {} : {
      physics: moving
        ? { mode: "kinematic" as const, material: "wall" as const, collider: "convex-hull" as const }
        : { mode: "static" as const, material: part.role === "level" ? "ground" as const : "wall" as const, collider: "trimesh" as const },
    }),
    behaviors,
    castShadow: part.role !== "level" && part.role !== "finish-line",
    receiveShadow: true,
    tags: [
      "archive",
      "suzanne-machinery",
      "archive-mesh",
      `source-role:${part.role}`,
      ...(moving ? ["moving-obstacle", "scene-native-collider", "collider:convex-hull"] : []),
      ...(part.physics === "static" ? ["scene-native-collider", "collider:trimesh"] : []),
    ],
  };
}

function ringEntity(point: AgentWorldVector3, index: number): AgentWorldEntityDefinition {
  const finish = index === SOURCE_RING_PATH.length - 1;
  return {
    id: finish ? "suzanne-machinery-finish" : `suzanne-machinery-ring-${index + 1}`,
    label: finish ? "Machinery Finish Ring" : `Machinery Ring ${index + 1}`,
    type: "torus",
    transform: {
      // The recovered route is exact in X/Z; +0.62 Y is disclosed presentation so a 0.3 ball
      // passes through the opening rather than through the source floor.
      position: [point[0], point[1] + 0.62, -point[2]],
      rotationDegrees: [0, index % 2 === 0 ? 0 : 90, 0],
    },
    geometry: { radius: 0.52, tube: 0.075, radialSegments: 30 },
    material: finish
      ? { color: "#ffd35e", emissive: "#9b5c0b", emissiveIntensity: 1.15, roughness: 0.18, metalness: 0.34 }
      : { color: "#6fe8ff", emissive: "#147d9a", emissiveIntensity: 0.88, roughness: 0.2, metalness: 0.24 },
    physics: { mode: "trigger" },
    castShadow: false,
    tags: ["archive", "suzanne-machinery", finish ? "finish" : "checkpoint", "adapted-gameplay"],
  };
}

function buildDefinition(): AgentWorldDefinition {
  const ball = instantiateAgentWorldPrefab("ballz-ball-classic", {
    idPrefix: BALL_ID,
    position: SPAWN,
    scale: [0.3, 0.3, 0.3],
    tags: ["player", "suzanne-machinery", "adapted-gameplay"],
  });
  const rings = SOURCE_RING_PATH.map(ringEntity);
  const entities: AgentWorldEntityDefinition[] = [
    ...SOURCE_PARTS.map(modelEntity),
    ...ball,
    ...rings,
    {
      id: "suzanne-machinery-safety-floor", label: "Machinery Safety Floor", type: "box",
      transform: { position: [0, -1.25, 0] }, geometry: { width: 18, height: 0.35, depth: 18 },
      material: { color: "#08121b", opacity: 0.01 }, visible: false,
      physics: { mode: "static", material: "ground" }, receiveShadow: true,
      tags: ["suzanne-machinery", "safety-floor", "adapted-gameplay"],
    },
    {
      id: "suzanne-machinery-playfield", label: "Suzanne Machinery Framing", type: "box",
      transform: { position: [0, 0.7, 0] }, geometry: { width: 16, height: 6, depth: 16 },
      material: { color: "#07131d", opacity: 0.01 }, visible: false,
      tags: ["suzanne-machinery", "playfield", "framing"],
    },
    {
      id: "suzanne-machinery-ambient", label: "Machinery Ambient", type: "ambient-light",
      intensity: 0.7, material: { color: "#9fc2d5" }, tags: ["suzanne-machinery", "light"],
    },
    {
      id: "suzanne-machinery-sun", label: "Machinery Sun", type: "directional-light",
      transform: { position: [-9, 16, 11] }, intensity: 3.1,
      material: { color: "#ffe6b8" }, castShadow: true, tags: ["suzanne-machinery", "light"],
    },
    {
      id: "suzanne-machinery-rotator-light", label: "Rotator Hazard Light", type: "point-light",
      transform: { position: [2.62, 2.6, 2.63] }, intensity: 6.4, distance: 14, marker: false,
      material: { color: "#ff794f", emissive: "#ff794f" }, tags: ["suzanne-machinery", "light", "adapted-presentation"],
    },
  ];

  return {
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: SUZANNE_MACHINERY_SCENE_ID,
    label: "Suzanne Machinery Run",
    environment: {
      background: "#07131d",
      sky: "clearnight",
      lighting: { source: "hdri", hdri: "studio-small-08", intensity: 0.92, yawDegrees: -18, backgroundIntensity: 0.72, backgroundBlur: 0.16 },
      overlay: "vignette",
      ground: { visible: false, size: 20, color: "#0a1720", grid: false, gridColor: "#315766" },
      physics: { gravity: [0, -9.81, 0] },
      envelope: { fogNear: 24, fogFar: 58, cameraFar: 110 },
      post: { bloom: { strength: 0.48, threshold: 0.66, radius: 0.34 } },
    },
    entities,
    rules: {
      schema: GRAPHYSX_AGENT_RULES_SCHEMA,
      subjectId: BALL_ID,
      spawn: { entityId: BALL_ID, position: SPAWN },
      checkpoints: SOURCE_RING_PATH.slice(0, -1).map((_, index) => ({
        triggerId: `suzanne-machinery-ring-${index + 1}`,
        label: `Ring ${index + 1}`,
      })),
      finish: { triggerId: "suzanne-machinery-finish" },
      laps: 1,
    },
  };
}

export function composeArchiveSuzanneMachinery(api: GraphysXAgentWorldApi) {
  return api.create(buildDefinition());
}

export function frameArchiveSuzanneMachinery(host: PlatformHost): void {
  host.camera.position.set(12.5, 10.5, 14.5);
  host.focusOn(new Vector3(0, 0.65, 0), 11, 0.85, 24);
}

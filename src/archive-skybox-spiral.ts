/**
 * Skybox Spiral — the first of the §14.5 archive course ports, composed as pure v2 vocabulary.
 *
 * Source: the `skybox-spiral` RaceDefinition in `race-definitions.ts` (legacy `?host=legacy`
 * course; its own provenance names GraphysX_1/Sky.cpp, Media/Sky/LostValley, Spline.xml and
 * VoieLactee.cpp). It was chosen first among the five named ports because it is the only one
 * that needs no mesh collider: its track, rails and scenery are already primitive boxes, its
 * sky (`lostvalley`) already ships, and its start/halfway/finish/rings drop 1:1 into the
 * rules block that landed in rules-r1.
 *
 * FAITHFUL — geometry: every slab, rail, scenery block, moving part and ring position/size
 * comes verbatim from the race definition, as do the palette colours, the sky, and the
 * spawn/halfway/finish lines.
 *
 * ADAPTED — recorded, not hidden:
 * - Pistons → kinematic boxes on 2-point closed splines (`follow-spline`), the platform's
 *   native oscillation. The legacy motion was sinusoidal; a closed spline sweeps the same
 *   span at constant speed. The rotator maps to `spin` exactly.
 * - Ring heights: the legacy rings float on a flying line (y 1.5–2.1). The v2 ball rolls,
 *   so every ring is lowered to rolling height and stood upright — a hoop you roll through,
 *   the same adaptation the BallZ arenas made.
 * - The spawn steps 2.5 units north of the legacy start so the run does not begin standing
 *   inside its own finish trigger.
 * - Glass curbs along each slab's exposed edges: the legacy racer respawned a fallen ball;
 *   v2 has no respawn, so the course contains instead.
 *
 * ABSENT — the day/night `atmosphere` cycle and the champion ghost (Voie Lactee, 72s) have
 * no v2 vocabulary yet; neither is imitated.
 */
import {
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  GRAPHYSX_AGENT_RULES_SCHEMA,
  type AgentWorldDefinition,
  type AgentWorldEntityDefinition,
  type AgentWorldRulesDefinition,
  type AgentWorldVector3,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";

const BALL_RADIUS = 0.42;
/** Ring centres sit at the rolling ball's own centre: slab top (0.18) + radius. */
const RING_Y = 0.18 + BALL_RADIUS;

const PALETTE = {
  background: "#081028",
  floor: { color: "#0b1730", roughness: 0.55, metalness: 0.12 },
  marble: { color: "#22314f", roughness: 0.4, metalness: 0.18 },
  grid: { color: "#123049", emissive: "#1d6f8a", emissiveIntensity: 0.35, roughness: 0.5 },
  glass: { color: "#aaf0ff", opacity: 0.28, roughness: 0.12, metalness: 0.3 },
  ring: { color: "#aaf0ff", emissive: "#57c8e8", emissiveIntensity: 0.9, roughness: 0.3 },
  danger: { color: "#f9c74f", emissive: "#b97a1e", emissiveIntensity: 0.5, roughness: 0.4 },
  finish: { color: "#78f0d0", emissive: "#2fae8b", emissiveIntensity: 0.6, roughness: 0.35 },
  ball: { color: "#e8f4ff", roughness: 0.35, metalness: 0.1 },
} as const;

/** Verbatim from the race definition. */
const TRACK: Array<{ id: string; position: AgentWorldVector3; size: AgentWorldVector3; material: keyof typeof PALETTE }> = [
  { id: "spiral-start", position: [0, 0.05, 14], size: [12, 0.14, 18], material: "marble" },
  { id: "spiral-mid", position: [4.2, 0.08, 0], size: [12, 0.14, 18], material: "grid" },
  { id: "spiral-end", position: [-2.7, 0.11, -15], size: [13, 0.14, 19], material: "marble" },
];

const RINGS: Array<{ position: [number, number, number]; yawDegrees: number; scale?: number }> = [
  { position: [0.0, RING_Y, 19.0], yawDegrees: 0, scale: 1.16 },
  { position: [4.6, RING_Y, 15.0], yawDegrees: 90 },
  { position: [-4.8, RING_Y, 9.2], yawDegrees: 90 },
  { position: [-1.0, RING_Y, 4.2], yawDegrees: 90 },
  { position: [6.8, RING_Y, -0.2], yawDegrees: 0 },
  { position: [8.4, RING_Y, -5.8], yawDegrees: 0 },
  { position: [3.0, RING_Y, -9.4], yawDegrees: 90 },
  { position: [-2.8, RING_Y, -12.8], yawDegrees: 90 },
  { position: [-6.9, RING_Y, -17.8], yawDegrees: 0 },
  { position: [-2.6, RING_Y, -22.6], yawDegrees: 90, scale: 1.18 },
  { position: [3.8, RING_Y, -18.6], yawDegrees: 90 },
  { position: [6.2, RING_Y, -10.6], yawDegrees: 0 },
  { position: [1.6, RING_Y, -4.2], yawDegrees: 90 },
  { position: [-5.1, RING_Y, 2.2], yawDegrees: 0 },
  { position: [-5.6, RING_Y, 10.5], yawDegrees: 0 },
  { position: [-1.2, RING_Y, 16.4], yawDegrees: 90, scale: 1.1 },
];

const SPAWN: AgentWorldVector3 = [0, 1.2, 18.5];

export const SKYBOX_SPIRAL_SCENE_ID = "archive-skybox-spiral";

export const SKYBOX_SPIRAL_PROVENANCE = {
  source: "race-definitions.ts skybox-spiral (legacy authored course)",
  faithful: "slab/rail/scenery/mover/ring placement, palette, sky, start/halfway/finish lines",
  adapted: "pistons as closed-spline kinematics; rotator as spin; rings at rolling height; spawn 2.5 north of the finish line; containment curbs",
  absent: "atmosphere day/night cycle; champion ghost",
} as const;

function buildDefinition(): AgentWorldDefinition {
  const entities: AgentWorldEntityDefinition[] = [];

  for (const slab of TRACK) {
    entities.push({
      id: slab.id,
      type: "box",
      label: slab.id.replace(/-/g, " "),
      transform: { position: slab.position },
      geometry: { width: slab.size[0], height: slab.size[1], depth: slab.size[2] },
      material: { ...PALETTE[slab.material] },
      physics: { mode: "static", material: "ground" },
      tags: ["spiral", "track"],
    });
    // Containment curbs along both exposed x-edges of each slab (see ADAPTED above).
    for (const side of [-1, 1] as const) {
      entities.push({
        id: `${slab.id}-curb${side === -1 ? "-w" : "-e"}`,
        type: "box",
        label: "Curb",
        transform: { position: [slab.position[0] + side * (slab.size[0] / 2 + 0.15), 0.4, slab.position[2]] },
        geometry: { width: 0.3, height: 0.8, depth: slab.size[2] },
        material: { ...PALETTE.glass },
        physics: { mode: "static", material: "wall" },
        castShadow: false,
        tags: ["spiral", "curb"],
      });
    }
  }

  // The four sky rails, verbatim.
  const rails: Array<{ id: string; position: AgentWorldVector3; size: AgentWorldVector3 }> = [
    { id: "left-sky-rail", position: [-13.5, 0.9, 0], size: [0.5, 1.8, 52] },
    { id: "right-sky-rail", position: [13.5, 0.9, 0], size: [0.5, 1.8, 52] },
    { id: "north-sky-rail", position: [0, 0.9, -26], size: [27, 1.8, 0.5] },
    { id: "south-sky-rail", position: [0, 0.9, 26], size: [27, 1.8, 0.5] },
  ];
  for (const rail of rails) {
    entities.push({
      id: rail.id,
      type: "box",
      label: rail.id.replace(/-/g, " "),
      transform: { position: rail.position },
      geometry: { width: rail.size[0], height: rail.size[1], depth: rail.size[2] },
      material: { ...PALETTE.glass },
      physics: { mode: "static", material: "wall" },
      castShadow: false,
      tags: ["spiral", "rail"],
    });
  }

  // Scenery, verbatim boxes — the legacy course dressed with cubes, so this one does too.
  entities.push(
    { id: "spiral-moon", type: "box", label: "Moon", transform: { position: [-9, 5.2, -14] }, geometry: { width: 2.4, height: 2.4, depth: 2.4 }, material: { color: "#b9c4d8", roughness: 0.85 }, behaviors: [{ type: "spin", axis: "y", speedDegrees: 4 }], tags: ["spiral", "scenery"] },
    { id: "spiral-mars", type: "box", label: "Mars", transform: { position: [10, 6.4, -5] }, geometry: { width: 3.1, height: 3.1, depth: 3.1 }, material: { color: "#c96f4a", roughness: 0.9 }, behaviors: [{ type: "spin", axis: "y", speedDegrees: -3 }], tags: ["spiral", "scenery"] },
    { id: "spiral-cloud", type: "box", label: "Abstract Cloud", transform: { position: [7, 2.2, 13] }, geometry: { width: 3.6, height: 0.4, depth: 3.6 }, material: { color: "#aaf0ff", opacity: 0.5, roughness: 0.3 }, castShadow: false, tags: ["spiral", "scenery"] },
  );

  // Moving parts. Each piston is a kinematic box riding a 2-point closed spline spanning
  // the legacy amplitude; speed approximates the sinusoid's peak (amplitude × angular speed).
  const pistons = [
    { id: "airplane-sweep", position: [-5, 2.05, -3] as AgentWorldVector3, size: [6.2, 0.28, 0.28] as AgentWorldVector3, axis: "x" as const, amplitude: 8.5, speed: 0.75, material: "finish" as const },
    { id: "sky-mid-crosswind", position: [5.8, 1.62, 4.2] as AgentWorldVector3, size: [4.6, 0.28, 0.28] as AgentWorldVector3, axis: "z" as const, amplitude: 3.7, speed: 1.0, material: "danger" as const },
  ];
  for (const piston of pistons) {
    const [x, y, z] = piston.position;
    const a: AgentWorldVector3 = piston.axis === "x" ? [x - piston.amplitude, y, z] : [x, y, z - piston.amplitude];
    const b: AgentWorldVector3 = piston.axis === "x" ? [x + piston.amplitude, y, z] : [x, y, z + piston.amplitude];
    entities.push(
      {
        id: `${piston.id}-path`,
        type: "spline",
        label: `${piston.id} path`,
        path: { points: [a, b], closed: true, tension: 0 },
        visible: false,
        tags: ["spiral", "mover-path"],
      },
      {
        id: piston.id,
        type: "box",
        label: piston.id.replace(/-/g, " "),
        transform: { position: piston.position },
        geometry: { width: piston.size[0], height: piston.size[1], depth: piston.size[2] },
        material: { ...PALETTE[piston.material] },
        physics: { mode: "kinematic" },
        behaviors: [{ type: "follow-spline", splineId: `${piston.id}-path`, speed: piston.amplitude * piston.speed, loop: true }],
        tags: ["spiral", "mover"],
      },
    );
  }
  entities.push({
    id: "sky-rotator",
    type: "box",
    label: "sky rotator",
    transform: { position: [2.4, 1.35, -13] },
    geometry: { width: 9.4, height: 0.3, depth: 0.3 },
    material: { ...PALETTE.danger },
    physics: { mode: "kinematic" },
    behaviors: [{ type: "spin", axis: "y", speedDegrees: 64 }],
    tags: ["spiral", "mover"],
  });

  // Rings: torus triggers that hide themselves when collected — the arenas' mechanic verbatim.
  RINGS.forEach((ring, index) => {
    const id = `spiral-ring-${index + 1}`;
    entities.push({
      id,
      type: "torus",
      label: `Ring ${index + 1}`,
      transform: { position: ring.position, rotationDegrees: [90, ring.yawDegrees, 0] },
      geometry: { radius: 0.55 * (ring.scale ?? 1), tube: 0.12 },
      material: { ...PALETTE.ring },
      physics: { mode: "trigger" },
      behaviors: [{ type: "spin", axis: "z", speedDegrees: 63 }],
      interactions: [{ id: `${id}-collect`, label: "Collect ring", type: "toggle-visibility", targetIds: [id] }],
      tags: ["spiral", "ring", "collectible"],
    });
  });

  // Gates: halfway spans the end slab at the legacy halfwayZ; finish spans the start slab
  // at the legacy finishZ.
  entities.push(
    {
      id: "spiral-half-gate",
      type: "box",
      label: "Halfway Gate",
      transform: { position: [-2.7, 1.1, -22] },
      geometry: { width: 13, height: 2.2, depth: 0.5 },
      material: { color: "#ffbf69", emissive: "#c77b2a", emissiveIntensity: 0.5, opacity: 0.45, roughness: 0.2 },
      physics: { mode: "trigger" },
      castShadow: false,
      tags: ["spiral", "half", "gate"],
    },
    {
      id: "spiral-finish-gate",
      type: "box",
      label: "Finish Gate",
      transform: { position: [0, 1.1, 21] },
      geometry: { width: 12, height: 2.2, depth: 0.5 },
      material: { ...PALETTE.finish, opacity: 0.45 },
      physics: { mode: "trigger" },
      castShadow: false,
      tags: ["spiral", "finish", "gate"],
    },
    {
      id: "spiral-finish-beacon",
      type: "emitter",
      label: "Finish Beacon",
      transform: { position: [0, 0.6, 21] },
      emitter: { preset: "firetrail", sizeScale: 3.4, speed: 2.2, spread: 1.6, maxParticles: 90, color: "#78f0d0" },
      tags: ["spiral", "finish", "effect"],
    },
  );

  // The ball: dynamic sphere, steering as four ordinary apply-impulse interactions — the
  // control scheme is scene data, same as the arenas.
  entities.push({
    id: "spiral-ball",
    type: "sphere",
    label: "Ball",
    transform: { position: SPAWN },
    geometry: { radius: BALL_RADIUS },
    material: { ...PALETTE.ball, texture: { id: "checker" as const, repeat: [0.2, 0.2] as [number, number] } },
    physics: { mode: "dynamic", material: "ball", mass: 1.6 },
    interactions: (
      [
        ["push-north", "Push north", [0, 0, -1]],
        ["push-south", "Push south", [0, 0, 1]],
        ["push-west", "Push west", [-1, 0, 0]],
        ["push-east", "Push east", [1, 0, 0]],
      ] as Array<[string, string, AgentWorldVector3]>
    ).map(([id, label, vector]) => ({
      id,
      label,
      type: "apply-impulse" as const,
      targetIds: ["spiral-ball"],
      impulse: vector.map((axis) => axis * 2.6) as AgentWorldVector3,
    })),
    tags: ["spiral", "ball", "player"],
  });

  // Lights. The point light is the first shipped use of `marker:false` — the course wants
  // the accent glow over the mid slab, not a floating bulb sphere in the middle of a race.
  entities.push(
    { id: "spiral-ambient", type: "ambient-light", intensity: 0.55, material: { color: "#9ec4e8" } },
    { id: "spiral-sun", type: "directional-light", intensity: 2.2, transform: { position: [-14, 18, 10] }, material: { color: "#ffe9c2" }, castShadow: true },
    { id: "spiral-accent", type: "point-light", intensity: 5, distance: 30, marker: false, transform: { position: [4.2, 6, 0] }, material: { color: "#aaf0ff", emissive: "#aaf0ff" } },
  );

  const rules: AgentWorldRulesDefinition = {
    schema: GRAPHYSX_AGENT_RULES_SCHEMA,
    subjectId: "spiral-ball",
    spawn: { entityId: "spiral-ball", position: SPAWN },
    checkpoints: [{ triggerId: "spiral-half-gate", label: "Halfway" }],
    collectibles: { tag: "collectible", requiredToFinish: true },
    finish: { triggerId: "spiral-finish-gate" },
    laps: 1,
  };

  return {
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: SKYBOX_SPIRAL_SCENE_ID,
    label: "Skybox Spiral",
    rules,
    environment: {
      background: PALETTE.background,
      sky: "lostvalley",
      // 27×52 sits inside the host defaults; the course floats in its sky, so no ground.
      envelope: null,
      ground: { visible: false, size: 36, color: "#0b1730", grid: false, gridColor: "#1d6f8a" },
    },
    entities,
  };
}

/** Compose the course into the live world. One `api.create`, like every composed scene. */
export function composeSkyboxSpiral(api: GraphysXAgentWorldApi) {
  return api.create(buildDefinition());
}

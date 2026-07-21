/**
 * World 1 — the first true MESH world port (§14.5), composed as pure v2 vocabulary.
 *
 * Source: six decoded objects in one shared coordinate space
 * (`src/legacy/world1-level.json`, sha256 in the manifest): terrain (Level3.TVM), core,
 * elevator, finish, and two stacked hole rings. The bounds tell the design: the world
 * descends 30 units, and the two holes sit over the same footprint at y ≈ −0.75 and
 * −5.15 — you fall THROUGH them. That rules out a heightfield collider and is why the
 * vendor script derives per-cell, multi-level collision slabs from the walkable
 * triangles instead.
 *
 * FAITHFUL — all six meshes at native span; every anchor (elevator, finish, holes,
 * containment, spawn column) is computed from the decoded bounds, not eyeballed.
 *
 * ADAPTED — recorded, not hidden:
 * - The whole assembly is mirrored about the shared z-centre. The mesh loader flips Z
 *   (archive→three handedness) about each model's own centre; placing each entity at the
 *   globally mirrored centre turns six per-object mirrors into ONE coherent world mirror.
 *   Slabs, gates, elevator and spawn go through the same `flipZ`, so physics matches
 *   visuals exactly.
 * - Collision is the vendor script's inferred slab field (105 thin boxes), with slabs
 *   over each hole opening dropped so the descent stays open. Steep faces are not
 *   walls; perimeter rails and a catch floor contain the ball instead.
 * - The elevator bobs between its decoded level and the hole-2 level. No motion data
 *   was recorded; the two levels it connects are the least-invention reading of a mesh
 *   named World1Elevator1.
 * - The holes are the ordered checkpoints and the finish pad is the finish. No rings or
 *   timer were recorded, so there are none.
 */
import {
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  GRAPHYSX_AGENT_RULES_SCHEMA,
  type AgentWorldDefinition,
  type AgentWorldEntityDefinition,
  type AgentWorldVector3,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import { Vector3 } from "three";
import {
  ARCHIVE_WORLD1_MESHES,
  ARCHIVE_WORLD1_SHA256,
  ARCHIVE_WORLD1_SLABS,
  ARCHIVE_WORLD1_SLAB_SIZE,
  type ArchiveWorld1MeshRecord,
} from "./archive-world1-manifest";
import type { PlatformHost } from "./platform-host";

export const WORLD1_SCENE_ID = "archive-world1";

const BALL_RADIUS = 0.42;

const record = (role: string): ArchiveWorld1MeshRecord => {
  const found = ARCHIVE_WORLD1_MESHES.find((mesh) => mesh.role === role);
  if (!found) throw new Error(`World 1 manifest is missing role: ${role}`);
  return found;
};

const centre = (r: ArchiveWorld1MeshRecord): [number, number, number] => [
  (r.bounds.min[0] + r.bounds.max[0]) / 2,
  (r.bounds.min[1] + r.bounds.max[1]) / 2,
  (r.bounds.min[2] + r.bounds.max[2]) / 2,
];

// The one mirror plane: the terrain (and core) span the full assembly, so their shared
// z-centre is the assembly's.
const terrain = record("terrain");
const MIRROR_Z = (terrain.bounds.min[2] + terrain.bounds.max[2]) / 2;
const flipZ = (z: number): number => 2 * MIRROR_Z - z;

export const WORLD1_PROVENANCE = {
  source: "src/legacy/world1-level.json (Level3.TVM assembly)",
  sha256: ARCHIVE_WORLD1_SHA256,
  faithful: "all six decoded meshes at native span; anchors computed from decoded bounds",
  adapted:
    "one world mirror about the shared z-centre (loader handedness); inferred slab collision with hole openings kept clear; elevator motion between its two decoded levels; holes as ordered checkpoints",
  absent: "no recorded spawn, camera, timer or rings — spawn is the column above hole-1, and none of the rest is imitated",
} as const;

function buildDefinition(): AgentWorldDefinition {
  const entities: AgentWorldEntityDefinition[] = [];

  // ---- the six recovered meshes, assembled ------------------------------------------
  for (const mesh of ARCHIVE_WORLD1_MESHES) {
    const [cx, cy, cz] = centre(mesh);
    entities.push({
      id: mesh.id,
      type: "model",
      label: `${mesh.role} (${mesh.source})`,
      transform: { position: [cx, cy, flipZ(cz)] },
      asset: { id: mesh.id, url: mesh.url, format: "graphysx-mesh-json", fitSize: mesh.nativeFitSize },
      // Collision is the slab field below; the meshes are the faithful visual layer.
      tags: ["world1", "archive-mesh", mesh.role],
    });
  }

  // ---- inferred collision: the slab field, with hole openings kept clear ------------
  const holes = [record("hole-1"), record("hole-2")];
  const openings = holes.map((hole) => ({
    minX: hole.bounds.min[0] + 1.5,
    maxX: hole.bounds.max[0] - 1.5,
    minZ: hole.bounds.min[2] + 1.5,
    maxZ: hole.bounds.max[2] - 1.5,
    y: (hole.bounds.min[1] + hole.bounds.max[1]) / 2,
  }));
  let slabIndex = 0;
  for (const slab of ARCHIVE_WORLD1_SLABS) {
    const blocksOpening = openings.some(
      (o) => Math.abs(slab.y - o.y) < 2 && slab.x > o.minX && slab.x < o.maxX && slab.z > o.minZ && slab.z < o.maxZ,
    );
    if (blocksOpening) continue;
    slabIndex += 1;
    entities.push({
      id: `world1-slab-${slabIndex}`,
      type: "box",
      label: "Surface slab",
      transform: { position: [slab.x, slab.y - ARCHIVE_WORLD1_SLAB_SIZE.height / 2, flipZ(slab.z)] },
      geometry: { width: ARCHIVE_WORLD1_SLAB_SIZE.width, height: ARCHIVE_WORLD1_SLAB_SIZE.height, depth: ARCHIVE_WORLD1_SLAB_SIZE.depth },
      material: { color: "#20303c" },
      physics: { mode: "static", material: "ground" },
      visible: false,
      castShadow: false,
      tags: ["world1", "collision"],
    });
  }

  // ---- the elevator: kinematic, riding between its two decoded levels --------------
  const elevator = record("elevator");
  const [ex, ey, ez] = centre(elevator);
  const elevatorSpan = (holes[1].bounds.min[1] - ey) * 0.5;
  entities.push({
    id: "world1-elevator-body",
    type: "box",
    label: "Elevator platform (collider)",
    transform: { position: [ex, ey, flipZ(ez)] },
    geometry: { width: elevator.bounds.size[0], height: 0.4, depth: elevator.bounds.size[2] },
    material: { color: "#3b4f63", roughness: 0.4, metalness: 0.3 },
    physics: { mode: "kinematic" },
    behaviors: [{ type: "bob", axis: "y", amplitude: Math.abs(elevatorSpan), frequencyHz: 0.12 }],
    tags: ["world1", "elevator"],
  });

  // ---- descent gates: the two holes, in order, then the finish pad ------------------
  holes.forEach((hole, index) => {
    const [hx, hy, hz] = centre(hole);
    entities.push({
      id: `world1-hole-gate-${index + 1}`,
      type: "box",
      label: `Hole ${index + 1} gate`,
      transform: { position: [hx, hy, flipZ(hz)] },
      geometry: { width: hole.bounds.size[0], height: 1.6, depth: hole.bounds.size[2] },
      material: { color: "#78f0d0", emissive: "#2fae8b", emissiveIntensity: 0.7, opacity: 0.28, roughness: 0.3 },
      physics: { mode: "trigger" },
      castShadow: false,
      tags: ["world1", "gate", `hole-${index + 1}`],
    });
  });
  const finish = record("finish");
  const [fx, fy, fz] = centre(finish);
  entities.push(
    {
      id: "world1-finish-gate",
      type: "box",
      label: "Finish pad",
      transform: { position: [fx, fy + 1, flipZ(fz)] },
      geometry: { width: finish.bounds.size[0], height: 2.4, depth: finish.bounds.size[2] },
      material: { color: "#f9c74f", emissive: "#b97a1e", emissiveIntensity: 0.7, opacity: 0.32, roughness: 0.3 },
      physics: { mode: "trigger" },
      castShadow: false,
      tags: ["world1", "finish", "gate"],
    },
    {
      id: "world1-finish-beacon",
      type: "emitter",
      label: "Finish Beacon",
      transform: { position: [fx, fy + 0.4, flipZ(fz)] },
      emitter: { preset: "firetrail", sizeScale: 3.2, speed: 2.4, spread: 1.8, maxParticles: 90, color: "#f9c74f" },
      tags: ["world1", "finish", "effect"],
    },
  );

  // ---- containment: perimeter rails at the assembly bounds + a catch floor ---------
  const minX = terrain.bounds.min[0] - 1;
  const maxX = terrain.bounds.max[0] + 1;
  const minZ = flipZ(terrain.bounds.max[2]) - 1;
  const maxZ = flipZ(terrain.bounds.min[2]) + 1;
  const midY = (terrain.bounds.min[1] + terrain.bounds.max[1]) / 2;
  const railHeight = terrain.bounds.size[1] + 6;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const rails: Array<{ id: string; position: AgentWorldVector3; size: AgentWorldVector3 }> = [
    { id: "world1-rail-west", position: [minX, midY, (minZ + maxZ) / 2], size: [0.5, railHeight, spanZ] },
    { id: "world1-rail-east", position: [maxX, midY, (minZ + maxZ) / 2], size: [0.5, railHeight, spanZ] },
    { id: "world1-rail-north", position: [(minX + maxX) / 2, midY, minZ], size: [spanX, railHeight, 0.5] },
    { id: "world1-rail-south", position: [(minX + maxX) / 2, midY, maxZ], size: [spanX, railHeight, 0.5] },
  ];
  for (const rail of rails) {
    entities.push({
      id: rail.id,
      type: "box",
      label: rail.id.replace(/-/g, " "),
      transform: { position: rail.position },
      geometry: { width: rail.size[0], height: rail.size[1], depth: rail.size[2] },
      material: { color: "#aaf0ff", opacity: 0.12, roughness: 0.15 },
      physics: { mode: "static", material: "wall" },
      castShadow: false,
      tags: ["world1", "rail"],
    });
  }
  entities.push({
    id: "world1-catch-floor",
    type: "box",
    label: "Catch floor",
    transform: { position: [(minX + maxX) / 2, terrain.bounds.min[1] - 2.2, (minZ + maxZ) / 2] },
    geometry: { width: spanX, height: 0.5, depth: spanZ },
    material: { color: "#101c26" },
    physics: { mode: "static", material: "ground" },
    visible: false,
    castShadow: false,
    tags: ["world1", "collision"],
  });

  // ---- the ball: spawned in the column above hole-1, so the descent IS the intro ----
  // The column is the intersection of the hole opening and the elevator footprint: the
  // opening's own centre (x ≈ 5.25) sits 0.25 outside the decoded elevator's east edge
  // (x = 5.0), and a ball dropped there grazes past the platform to the catch floor —
  // measured, not guessed. Derived from both bounds so a re-vendor keeps it honest.
  const spawn: AgentWorldVector3 = [
    (Math.max(openings[0].minX, elevator.bounds.min[0]) + Math.min(openings[0].maxX, elevator.bounds.max[0])) / 2,
    terrain.bounds.max[1] + 2.5,
    flipZ((Math.max(openings[0].minZ, elevator.bounds.min[2]) + Math.min(openings[0].maxZ, elevator.bounds.max[2])) / 2),
  ];
  entities.push({
    id: "world1-ball",
    type: "sphere",
    label: "Ball",
    transform: { position: spawn },
    geometry: { radius: BALL_RADIUS },
    material: { color: "#e8f4ff", roughness: 0.35, metalness: 0.1, texture: { id: "checker" as const, repeat: [0.2, 0.2] as [number, number] } },
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
      targetIds: ["world1-ball"],
      impulse: vector.map((axis) => axis * 2.6) as AgentWorldVector3,
    })),
    tags: ["world1", "ball", "player"],
  });

  // ---- lights -----------------------------------------------------------------------
  entities.push(
    { id: "world1-ambient", type: "ambient-light", intensity: 0.6, material: { color: "#bcd4e8" } },
    { id: "world1-sun", type: "directional-light", intensity: 2.4, transform: { position: [-20, 26, -14] }, material: { color: "#fff0d0" }, castShadow: true },
    { id: "world1-depth-glow", type: "point-light", intensity: 6, distance: 40, marker: false, transform: { position: [ex, ey + 4, flipZ(ez)] }, material: { color: "#78f0d0", emissive: "#78f0d0" } },
  );

  return {
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: WORLD1_SCENE_ID,
    label: "World 1",
    rules: {
      schema: GRAPHYSX_AGENT_RULES_SCHEMA,
      subjectId: "world1-ball",
      spawn: { entityId: "world1-ball", position: spawn },
      checkpoints: [
        { triggerId: "world1-hole-gate-1", label: "Upper hole" },
        { triggerId: "world1-hole-gate-2", label: "Lower hole" },
      ],
      finish: { triggerId: "world1-finish-gate" },
      laps: 1,
    },
    environment: {
      background: "#0a1622",
      // No sky was recorded for this world; skyx is the era's stock set. Inferred, said so.
      sky: "skyx",
      // The assembly is 56 x 30 x 73 — the first scene that genuinely needs the envelope
      // this port programme built: host default fog (34–130) would eat the finish from
      // the spawn, and far=260 leaves no margin from elevated framings.
      envelope: { fogNear: 90, fogFar: 320, cameraFar: 420 },
      post: { bloom: { strength: 0.55, threshold: 0.6, radius: 0.4 } },
      ground: { visible: false, size: 36, color: "#0a1622", grid: false, gridColor: "#1d6f8a" },
    },
    entities,
  };
}

/** Compose World 1 into the live world. One `api.create`, like every composed scene. */
export function composeArchiveWorld1(api: GraphysXAgentWorldApi) {
  return api.create(buildDefinition());
}

/**
 * Frame the descent, garage-precedent style: high on the near corner, looking down the
 * length of the world at the spawn column. The host default framing was authored for the
 * ~36-unit showroom and puts the visitor inside this 73-unit assembly's wall.
 */
export function frameArchiveWorld1(host: PlatformHost): void {
  const [cx] = centre(terrain);
  const cz = flipZ((terrain.bounds.min[2] + terrain.bounds.max[2]) / 2);
  host.camera.position.set(cx - 46, terrain.bounds.max[1] + 30, cz - 52);
  host.focusOn(new Vector3(cx, (terrain.bounds.min[1] + terrain.bounds.max[1]) / 2, cz), 34, 1.2);
}

import {
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldEntityDefinition,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";

const CLUSTER = "showroom-cubx";
const CORNERS: ReadonlyArray<[number, number, number]> = [
  [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
];

/**
 * Compose the evolutive welcome showroom entirely from platform vocabulary — the same
 * starters, prefabs, primitives, and behaviors a user or agent builds with. A glowing
 * garden base, a slowly rotating eight-cube "CubX" assembly, and a few sculptures/trees.
 * This grows over time (terrain, water, richer CubX); it is deliberately a v2 scene, not
 * bespoke host code, so the showroom stays editable and on-model.
 */
export function composeShowroom(api: GraphysXAgentWorldApi): void {
  const cubes = CORNERS.map((corner, index): AgentWorldEntityDefinition => ({
    id: `${CLUSTER}-cube-${index}`,
    type: "box",
    parentId: CLUSTER,
    geometry: { width: 1, height: 1, depth: 1 },
    transform: { position: [corner[0] * 0.85, corner[1] * 0.85, corner[2] * 0.85] },
    material: { color: "#41d3e8", emissive: "#0b4f63", emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.55 },
    tags: ["showroom", "cubx"],
  }));

  // `emitter` is ordinary v2 vocabulary now, so these braziers are selectable, editable and
  // exported like any other entity. They are placed clear of the trees so they read from the wide
  // welcome framing. The `ember-smoke` preset is deliberately *not* used here: it is faithful
  // dark soot on alpha blending, which over bright terrain reads as a smudge rather than a
  // plume. It stays in the library for scenes with a sky behind it.
  const braziers: AgentWorldEntityDefinition[] = [-3.4, 3.4].flatMap((x, index) => [
    {
      id: `showroom-brazier-${index}`,
      type: "emitter",
      label: `Brazier ${index + 1}`,
      transform: { position: [x, 0.1, 8.5] },
      // The archive ramp burns blue at the base up through amber. Read literally at showroom
      // distance the blue dominates and scatters, so this *instance* carries a warm tint
      // override — the preset itself keeps the archive colours.
      emitter: { preset: "campfire", sizeScale: 5.5, volumeScale: 1.2, speed: 3.6, maxParticles: 180, color: "#ff9436" },
      tags: ["showroom", "effect"],
    },
    {
      id: `showroom-brazier-glow-${index}`,
      type: "emitter",
      label: `Brazier Glow ${index + 1}`,
      transform: { position: [x, 0.3, 8.5] },
      emitter: { preset: "firetrail", sizeScale: 3.6, speed: 2.4, spread: 1.6, color: "#ff8a2a", maxParticles: 70 },
      tags: ["showroom", "effect"],
    },
  ]);

  // The showroom is a v2 scene with the flat grid hidden — the host renders the sky/terrain/sun.
  api.create({
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: "showroom",
    label: "GraphysX Showroom",
    environment: {
      background: "#0a1c28",
      // A recovered TV3D skybox, selected per scene. It also lights the scene: the host
      // builds an IBL probe from the same cube map, so objects reflect the sky they sit under.
      sky: "lostvalley",
      ground: { visible: false, size: 60, color: "#123039", grid: false, gridColor: "#2a7d8f" },
    },
    entities: [
      { id: "fill-light", type: "ambient-light", intensity: 0.5, material: { color: "#cfe9ff" } },
      ...braziers,
      {
        id: "showroom-cubx-core",
        type: "emitter",
        label: "CubX Core",
        parentId: CLUSTER,
        // A cyan crown burning off the top of the rotating assembly. It sits above the cubes
        // rather than inside them — the cubes are opaque, so a centred emitter is simply hidden.
        transform: { position: [0, 1.5, 0] },
        emitter: { preset: "firetrail", sizeScale: 5, speed: 2.2, spread: 2.5, color: "#5fe0ff", maxParticles: 110 },
        tags: ["showroom", "effect"],
      },
      {
        id: "showroom-cubx-spark",
        type: "emitter",
        label: "CubX Halo",
        parentId: CLUSTER,
        // Co-located with the crown for the same reason: emitted from the centre, the stars
        // spend their first frames occluded by the cubes and read as a streak.
        transform: { position: [0, 1.5, 0] },
        emitter: { preset: "energy-orb", sizeScale: 4.5, speed: 3.4, spread: 3, maxParticles: 30, rate: 55 },
        tags: ["showroom", "effect"],
      },
      {
        id: CLUSTER,
        type: "group",
        label: "CubX Assembly",
        transform: { position: [0, 3.6, 0] },
        behaviors: [{ id: "cubx-spin", type: "spin", axis: "y", speedDegrees: 12 }],
        tags: ["showroom", "cubx"],
      },
      ...cubes,
    ],
  });

  api.spawnPrefab("orbital-sculpture", { position: [-9, 0, -5] });
  api.spawnPrefab("orbital-sculpture", { position: [11, 0, 4] });
  api.spawnPrefab("portal-arch", { position: [9, 0, -6] });
  api.spawnPrefab("luminous-tree", { position: [-6, 0, 6] });
  api.spawnPrefab("luminous-tree", { position: [7, 0, 5] });
  api.spawnPrefab("luminous-tree", { position: [-11, 0, 2] });
}

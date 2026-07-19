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

  // A kinetic centrepiece: a static plinth carrying a stack of dynamic blocks, flanked by two
  // heavy spheres. Every one of these carries its own `apply-impulse` interaction, so clicking
  // it is an ordinary `api.interact()` call rather than a special case in the host — a visitor
  // and an agent nudge this stack exactly the same way. This is the showroom earning the word
  // "physics" instead of asserting it.
  const STACK_Y = 0.62;
  const stack: AgentWorldEntityDefinition[] = [
    // rows of 3, then 2, then 1 — a pyramid that topples legibly.
    ...[-1.15, 0, 1.15].map((x, i) => ({ x, y: STACK_Y + 0.45, i })),
    ...[-0.58, 0.58].map((x, i) => ({ x, y: STACK_Y + 1.35, i: i + 3 })),
    { x: 0, y: STACK_Y + 2.25, i: 5 },
  ].map(({ x, y, i }): AgentWorldEntityDefinition => ({
    id: `showroom-block-${i}`,
    type: "box",
    label: `Kinetic Block ${i + 1}`,
    geometry: { width: 0.86, height: 0.86, depth: 0.86 },
    transform: { position: [x, y, 2.6] },
    material: { color: "#8ce8ff", emissive: "#0d4d61", emissiveIntensity: 0.55, roughness: 0.22, metalness: 0.6 },
    physics: { mode: "dynamic", mass: 0.9, material: "default" },
    interactions: [{ id: `nudge-${i}`, type: "apply-impulse", targetIds: [`showroom-block-${i}`], impulse: [0, 2.6, -3.4] }],
    tags: ["showroom", "kinetic"],
  }));

  const orbs: AgentWorldEntityDefinition[] = [-2.9, 2.9].map((x, i): AgentWorldEntityDefinition => ({
    id: `showroom-orb-${i}`,
    type: "sphere",
    label: `Kinetic Orb ${i + 1}`,
    geometry: { radius: 0.52 },
    transform: { position: [x, STACK_Y + 0.52, 3.4] },
    material: { color: i === 0 ? "#ffb457" : "#ff8f7a", emissive: "#3a1405", emissiveIntensity: 0.5, roughness: 0.24, metalness: 0.5 },
    physics: { mode: "dynamic", mass: 1.4, material: "ball", restitution: 0.55 },
    interactions: [{ id: `nudge-orb-${i}`, type: "apply-impulse", targetIds: [`showroom-orb-${i}`], impulse: [i === 0 ? 3.2 : -3.2, 3.4, -1.6] }],
    tags: ["showroom", "kinetic"],
  }));

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
      // The ground. This used to be sine-displaced host decoration with no collider, so
      // anything dropped on it fell through the world forever. It is now an ordinary
      // `terrain` entity on a recovered archive heightmap, carrying a static cannon-es
      // heightfield — selectable, editable, exportable, and something you land on.
      //
      // `highlands` is the pick: rolling upland ridges read at showroom framing, where the
      // canyon field fragments into noise and the basin puts its low ground off-camera.
      // The centre is levelled into a pad at y=0 so the plinth, block stack, braziers and
      // trees all sit on flat ground; past r=18 the landform returns over a 20-unit blend.
      // Scale/offset are chosen against the water level below: they put roughly a third of
      // the visible field under water, which opens a lake in the mid-distance instead of
      // either a puddle or a flood.
      {
        id: "showroom-terrain",
        type: "terrain",
        label: "Showroom Terrain",
        terrain: {
          heightmap: "highlands",
          size: 150,
          segments: 96,
          heightScale: 11,
          heightOffset: -7,
          flattenRadius: 16,
          flattenFalloff: 16,
          flattenHeight: 0,
        },
        transform: { position: [0, 0, 0] },
        material: { color: "#6f8052", roughness: 0.96, metalness: 0.02, emissive: "#0e1609", emissiveIntensity: 0.2 },
        castShadow: false,
        tags: ["showroom", "terrain"],
      },
      // A water *level*, not a pond: one plane over the whole terrain footprint, so every
      // low-lying part of the landform floods and the shoreline is wherever the terrain
      // crosses y=-1.6. That is why it reads as landscape rather than as a blue rectangle.
      //
      // Reflection is on here because mirrored sky over water is the showroom's whole point,
      // but it is an ordinary entity flag, not a host setting:
      // `api.update("showroom-water", { water: { reflection: false } })` drops the extra
      // scene pass at runtime. The target is 256², not the library's 512² — distortion hides
      // render-target resolution better than almost any other effect.
      {
        id: "showroom-water",
        type: "water",
        label: "Reflecting Lake",
        transform: { position: [0, -0.45, 0] },
        water: {
          size: 150,
          color: "#15455a",
          sunColor: "#ffeccd",
          sunDirection: [0.52, 0.66, 0.32],
          distortionScale: 6,
          rippleScale: 9,
          flowSpeed: 0.5,
          opacity: 0.95,
          reflection: true,
          reflectionResolution: 256,
        },
        tags: ["showroom", "water"],
      },
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
      {
        id: "showroom-plinth",
        type: "box",
        label: "Plinth",
        geometry: { width: 6.2, height: 0.62, depth: 3.4 },
        transform: { position: [0, 0.31, 2.8] },
        material: { color: "#20404a", roughness: 0.85, metalness: 0.12 },
        physics: { mode: "static", material: "default" },
        tags: ["showroom", "kinetic"],
      },
      ...stack,
      ...orbs,
    ],
  });

  api.spawnPrefab("orbital-sculpture", { position: [-9, 0, -5] });
  api.spawnPrefab("orbital-sculpture", { position: [11, 0, 4] });
  api.spawnPrefab("portal-arch", { position: [9, 0, -6] });
  api.spawnPrefab("luminous-tree", { position: [-6, 0, 6] });
  api.spawnPrefab("luminous-tree", { position: [7, 0, 5] });
  api.spawnPrefab("luminous-tree", { position: [-11, 0, 2] });
}

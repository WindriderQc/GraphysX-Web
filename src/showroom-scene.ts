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
  const braziers: AgentWorldEntityDefinition[] = [-4.2, 4.2].flatMap((x, index) => [
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

  /**
   * The living layer — PRODUCT_SPEC §3 pillar 3, finally earned.
   *
   * Two flocks, because they demonstrate different halves of the same graduated system. The
   * starlings use `box` bounds and cross the mid-distance above the lake, which is what a
   * visitor reads as "the world is alive". The swarm uses the recovered `sphere` constraint
   * verbatim, wrapping the CubX assembly in a shell that circulates around it — the
   * nature-lab lesson, in the front door, as an ordinary entity anyone can select and edit.
   *
   * 128 members between them, two instanced draw calls, ~9k neighbour tests per step.
   */
  const flocks: AgentWorldEntityDefinition[] = [
    {
      id: "showroom-starlings",
      type: "flock",
      label: "Starling Murmuration",
      // High and back, so it reads against the sky and the far ridges rather than tangling
      // with the props. Trails stay off here: at 88 members they are the expensive half.
      transform: { position: [-2, 10.5, -11] },
      flock: {
        preset: "starlings",
        count: 76,
        // Half-extents, so this is a 22 x 7 x 18 volume. It was twice that, and 88 birds
        // spread over 40 units of sky read as scattered dots rather than as a murmuration —
        // a flock is legible because it is *dense*.
        size: [11, 3.4, 9],
        speed: 5,
        // Cohesion and separation are balanced against each other rather than maximised. At
        // cohesion 1.7 the whole flock collapsed into a single dense blob within a few
        // seconds — legible as *a thing*, but not as a murmuration. Raising separation with it
        // keeps the group together while holding the members apart.
        cohesion: 1.15,
        separation: 1.5,
        separationDistance: 1.7,
        neighborDistance: 4.5,
        // Pale members vanished against a bright sky. Birds read as *silhouettes*; the
        // legible choice is the dark one, and it happens to be the truthful one too.
        memberSize: 0.62,
        color: "#2d3a46",
        emissive: "#0b1219",
        emissiveIntensity: 0.25,
        seed: 11,
      },
      tags: ["showroom", "life", "flock"],
    },
    {
      id: "showroom-cubx-swarm",
      type: "flock",
      label: "CubX Swarm",
      // Parented to the assembly, so it inherits the spin behaviour's frame and stays with
      // the centrepiece if a visitor drags it somewhere else in the editor.
      parentId: CLUSTER,
      flock: {
        preset: "orbital-swarm",
        count: 40,
        radius: 3.6,
        speed: 1.35,
        memberSize: 0.3,
        trails: true,
        trailLength: 22,
        color: "#bff3ff",
        emissive: "#1c86ad",
        trailColor: "#5fe0ff",
      },
      tags: ["showroom", "life", "flock"],
    },
  ];

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
          heightScale: 16,
          heightOffset: -9.5,
          // Was a 16-unit pad blending out to 32, which flattened everything the camera could
          // actually see and left the landform as a distant fogged band — the reason the
          // showroom read as a green plain. A 12-unit stage blending to 24 keeps the props on
          // level ground while bringing ridges and shoreline into the *middle* distance,
          // which is where depth comes from.
          flattenRadius: 12,
          flattenFalloff: 12,
          flattenHeight: 0,
        },
        transform: { position: [0, 0, 0] },
        material: { color: "#5f7148", roughness: 0.97, metalness: 0.02, emissive: "#0b1207", emissiveIntensity: 0.12 },
        castShadow: false,
        tags: ["showroom", "terrain"],
      },
      // A water *level*, not a pond: one plane over the whole terrain footprint, so every
      // low-lying part of the landform floods and the shoreline is wherever the terrain
      // crosses the water level. That is why it reads as landscape rather than as a blue rectangle.
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
        transform: { position: [0, -1.2, 0] },
        water: {
          size: 150,
          // Deep teal, not slate. Paired with the Fresnel correction in `agent-world-water.ts`
          // (F0 0.02 rather than the library's 0.3) this is what stops the surface reading as
          // wet rock from the showroom's low camera: the reflection no longer wins everywhere,
          // so the body colour is visible again.
          color: "#0f4a66",
          sunColor: "#ffd9a0",
          // Matched to the key light in `showroom-environment.ts`. The sun sits roughly
          // opposite the camera in azimuth on purpose — that is what lays the glitter path
          // *across* the lake toward the viewer, and a specular path is the single strongest
          // "this is a liquid" cue available.
          sunDirection: [-0.55, 0.52, -0.65],
          specularStrength: 8,
          reflectance: 0.02,
          tintStrength: 0.68,
          tintDistance: 70,
          // Chop this fine, distorted this hard, sampled from a 256² reflection target read as
          // grey-green *camouflage* rather than as water: the mirror sample is being scrambled
          // faster than the render target can resolve. Longer ripples and gentler distortion put
          // the reflection back inside what 256² can carry, and the distance tint above does the
          // work of hiding the rest.
          distortionScale: 2.4,
          rippleScale: 3.5,
          flowSpeed: 0.5,
          // Opaque on purpose. At 0.92 the terrain a few centimetres under a shallow lake
          // showed through in patches, which was half the camouflage effect.
          opacity: 1,
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
        // Lifted and set back behind the plinth so the two centrepieces stack in depth
        // instead of overlapping: physics you can knock over in front, the hero assembly and
        // its swarm floating above and behind it.
        transform: { position: [0, 5.8, -3.4], rotationDegrees: [24, 0, 16], scale: [1.55, 1.55, 1.55] },
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
      ...flocks,
    ],
  });

  // Props are staged in three depth bands rather than a single row across the frame. A row is
  // what made the old composition read flat: everything the same distance away, so nothing
  // gave the eye a sense of scale. Everything stays inside the terrain's 12-unit level stage
  // so nothing floats over or sinks into a slope.
  //
  // Foreground wings, close and at the frame edges — these are what create depth, by being
  // large and cropped while the centrepiece sits small and complete behind them.
  api.spawnPrefab("luminous-tree", { position: [-10.5, 0, 8.5], scale: [1.5, 1.6, 1.5] });
  api.spawnPrefab("luminous-tree", { position: [11, 0, 8], scale: [1.1, 1.15, 1.1] });
  // Midground, flanking the plinth.
  api.spawnPrefab("orbital-sculpture", { position: [-11, 0, 0.5] });
  api.spawnPrefab("orbital-sculpture", { position: [12.5, 0, -8.5] });
  // Background, framing the gap the camera looks through to the lake and the ridges.
  api.spawnPrefab("portal-arch", { position: [6.5, 0, -10] });
  api.spawnPrefab("luminous-tree", { position: [-10, 0, -8], scale: [0.85, 0.9, 0.85] });
}

import { GRAPHYSX_AGENT_WORLD_SCHEMA, type AgentWorldEntityDefinition, type GraphysXAgentWorldApi } from "./agent-world-runtime";
import { instantiateAgentWorldPrefab } from "./agent-world-prefabs";
import { buildNestorCenter } from "./showroom-nestor";

const CLUSTER = "showroom-cubx";

/** Open landscape, Forge finishes, one CubX focal point. All content is ordinary v2 data. */
export function composeShowroom(api: GraphysXAgentWorldApi): void {
  const cubes = instantiateAgentWorldPrefab("cubx-assembly", {
    idPrefix: "showroom-cubx-frame",
    palette: { primary: "#78cbd9", secondary: "#8a5a34", emissive: "#123b48" },
    tags: ["showroom", "cubx"],
  }).map((part, index) => ({ ...part, ...(index === 0 ? { parentId: CLUSTER } : {}),
    ...(part.material ? { material: { ...part.material, emissiveIntensity: 0.3, roughness: 0.25, metalness: 0.78 } } : {}) }));

  const stack: AgentWorldEntityDefinition[] = [
    ...[-1.15, 0, 1.15].map((x, i) => ({ x, y: 1.07, i })),
    ...[-0.58, 0.58].map((x, i) => ({ x, y: 1.97, i: i + 3 })),
    { x: 0, y: 2.87, i: 5 },
  ].map(({ x, y, i }) => ({
    id: `showroom-block-${i}`, type: "box", label: `Kinetic Block ${i + 1}`,
    geometry: { width: 0.86, height: 0.86, depth: 0.86 },
    transform: { position: [-6.2 + x, y, 2.4] },
    material: { color: i % 2 ? "#8a5a34" : "#4c7886", emissive: "#0b2935", emissiveIntensity: 0.2, roughness: 0.3, metalness: 0.65 },
    physics: { mode: "dynamic", mass: 0.9, material: "default" },
    interactions: [{ id: `nudge-${i}`, type: "apply-impulse", targetIds: [`showroom-block-${i}`], impulse: [0, 2.6, -3.4] }],
    tags: ["showroom", "kinetic"],
  }));
  const orbs: AgentWorldEntityDefinition[] = [-2.9, 2.9].map((x, i) => ({
    id: `showroom-orb-${i}`, type: "sphere", label: `Kinetic Orb ${i + 1}`,
    geometry: { radius: 0.52, radialSegments: 40 },
    transform: { position: [-6.2 + x * 0.78, 1.14, 3.2] },
    material: { color: i ? "#87cad8" : "#c49a6c", emissive: "#1b2830", emissiveIntensity: 0.2, roughness: 0.2, metalness: 0.65 },
    physics: { mode: "dynamic", mass: 1.4, material: "ball", restitution: 0.55 },
    interactions: [{ id: `nudge-orb-${i}`, type: "apply-impulse", targetIds: [`showroom-orb-${i}`], impulse: [i === 0 ? 3.2 : -3.2, 3.4, -1.6] }],
    tags: ["showroom", "kinetic"],
  }));
  const entities: AgentWorldEntityDefinition[] = [
    { id: "fill-light", type: "ambient-light", intensity: 0.3, material: { color: "#a8c7df" } },
    {
      id: "showroom-terrain", type: "terrain", label: "Twilight Shore",
      terrain: { heightmap: "highlands", size: 150, segments: 96, heightScale: 16, heightOffset: -12,
        flattenRadius: 12, flattenFalloff: 12, flattenHeight: 0 },
      material: { color: "#293e48", roughness: 0.94, metalness: 0.05, emissive: "#0a1822", emissiveIntensity: 0.12 },
      castShadow: false, tags: ["showroom", "terrain"],
    },
    {
      id: "showroom-water", type: "water", label: "Twilight Lake", transform: { position: [0, -0.25, 0] },
      water: { size: 150, color: "#083b50", sunColor: "#ffd1a0", sunDirection: [-0.55, 0.52, -0.65],
        specularStrength: 8, reflectance: 0.02, tintStrength: 0.68, tintDistance: 70,
        distortionScale: 1.8, rippleScale: 2.4, flowSpeed: 0.35, opacity: 1, reflection: true, reflectionResolution: 256 },
      tags: ["showroom", "water"],
    },
    {
      id: CLUSTER, type: "group", label: "CubX Assembly",
      transform: { position: [0, 5.2, -6.2], rotationDegrees: [18, 0, 12], scale: [1.9, 1.9, 1.9] },
      behaviors: [{ id: "cubx-spin", type: "spin", axis: "y", speedDegrees: 5 }], tags: ["showroom", "cubx"],
    },
    ...cubes,
    {
      id: "showroom-cubx-crown", type: "emitter", label: "CubX Energy", parentId: CLUSTER,
      transform: { position: [0, 0.2, 0] },
      emitter: { preset: "firetrail", sizeScale: 1.2, speed: 0.65, spread: 1.1, color: "#66dcff", maxParticles: 40 },
      tags: ["showroom", "effect"],
    },
    {
      id: "showroom-cubx-spark", type: "emitter", label: "CubX Sparks", parentId: CLUSTER,
      transform: { position: [0, 1.2, 0] },
      emitter: { preset: "energy-orb", sizeScale: 1.5, speed: 1.2, spread: 1.4, color: "#e8b778", maxParticles: 18, rate: 12 },
      tags: ["showroom", "effect"],
    },
    {
      id: "showroom-starlings", type: "flock", label: "Starling Murmuration", transform: { position: [-7, 11, -16] },
      flock: { preset: "starlings", count: 52, size: [10, 2.8, 7.5], speed: 4.2, cohesion: 1.15, separation: 1.5,
        separationDistance: 1.7, neighborDistance: 4.5, memberSize: 0.48, color: "#8eb8ca", emissive: "#32647a", emissiveIntensity: 0.6, seed: 11 },
      castShadow: false, tags: ["showroom", "life", "flock"],
    },
    {
      id: "showroom-cubx-swarm", type: "flock", label: "CubX Swarm", parentId: CLUSTER,
      flock: { preset: "orbital-swarm", count: 28, radius: 3.1, speed: 1.15, memberSize: 0.16, trails: true, trailLength: 14,
        color: "#bff3ff", emissive: "#1c86ad", trailColor: "#5fe0ff" },
      castShadow: false, tags: ["showroom", "life", "flock"],
    },
    {
      id: "showroom-plinth", type: "box", label: "Kinetic Stage", geometry: { width: 6.2, height: 0.62, depth: 3.4 },
      transform: { position: [-6.2, 0.31, 2.6] }, material: { color: "#1a252e", roughness: 0.6, metalness: 0.4 },
      physics: { mode: "static", material: "default" }, tags: ["showroom", "kinetic"],
    },
    ...stack, ...orbs,
    {
      id: "showroom-chime-ring", type: "torus", label: "Chime Ring", geometry: { radius: 1.05, tube: 0.045 },
      transform: { position: [-6.2, 1.45, 0.3] }, material: { color: "#d6b484", emissive: "#6b4a10", emissiveIntensity: 0.65, roughness: 0.3, metalness: 0.6 },
      physics: { mode: "trigger" }, interactions: [{ id: "ring-chime", type: "play-sound", sound: "coin", volume: 0.55 }],
      tags: ["showroom", "audio"],
    },
    ...buildNestorCenter(),
  ];
  // Small luminous waypoints retain portable camera travel; the large gate frames are gone.
  const places: Array<{ id: string; position: [number, number, number]; destination: string; color: string }> = [
    { id: "showroom-portal-overlook", position: [6.5, 2.4, -10], destination: "showroom-starlings", color: "#9cbcd5" },
    { id: "showroom-portal-lab", position: [12.4, 1.6, -4.5], destination: "showroom-nestor-console-build", color: "#89d4df" },
    { id: "showroom-portal-arena", position: [14, 1.6, 4.2], destination: "showroom-plinth", color: "#d9b184" },
  ];
  for (const place of places) entities.push(
    { id: place.id, type: "group", label: "Landscape Waypoint", transform: { position: place.position }, tags: ["showroom", "portal", `portal-to:${place.destination}`] },
    { id: `${place.id}:core`, parentId: place.id, type: "sphere", geometry: { radius: 0.65, radialSegments: 40 },
      material: { color: place.color, roughness: 0.16, metalness: 0.72, emissive: "#153747", emissiveIntensity: 0.35 }, tags: ["showroom", "waypoint"] },
    { id: `${place.id}:ring`, parentId: place.id, type: "torus", geometry: { radius: 0.95, tube: 0.018, radialSegments: 64 },
      transform: { rotationDegrees: [24, 0, 18] }, material: { color: place.color, emissive: "#3d788b", emissiveIntensity: 0.75, metalness: 0.6 }, tags: ["showroom", "waypoint"] },
  );
  const result = api.create({ schema: GRAPHYSX_AGENT_WORLD_SCHEMA, id: "showroom", label: "GraphysX Nocturnal Shore",
    environment: { background: "#24394b", sky: "lostvalley",
      lighting: { source: "hdri", hdri: "lilienstein", intensity: 0.65, yawDegrees: 24, backgroundIntensity: 0.42, backgroundBlur: 0.28 },
      envelope: { fogNear: 45, fogFar: 145, cameraFar: 240 }, post: { bloom: { strength: 0.28, radius: 0.3, threshold: 0.92 } },
      ground: { visible: false, size: 60, color: "#17242e", grid: false, gridColor: "#243b48" } }, entities });
  if (!result.ok) throw new Error(`Showroom composition failed: ${result.error}`);
}

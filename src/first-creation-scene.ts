import type { AgentWorldCommand, AgentWorldDefinition, AgentWorldEntityDefinition, AgentWorldVector3 } from "./agent-world-runtime";

export const FIRST_CREATION_ID = "lantern-garden";
export const FIRST_CREATION_TONES = [
  { id: "aurora", name: "Aurore", color: "#59ead5", core: "#baffeb", light: "#6cf3df" },
  { id: "ember", name: "Braise", color: "#ffa25c", core: "#ffdfa0", light: "#ffab66" },
  { id: "iris", name: "Iris", color: "#b39afa", core: "#e8d8ff", light: "#b69cff" },
] as const;
export type FirstCreationTone = typeof FIRST_CREATION_TONES[number];

const CORE = "garden-lantern";
const LIGHT = "garden-lantern-light";
const SPARKS = "garden-sparks";
const TRIM = ["garden-inlay", "garden-inner-ring", "garden-outer-ring"] as const;

export function firstCreationTone(definition: AgentWorldDefinition | null): FirstCreationTone | undefined {
  const color = definition?.entities.find((entity) => entity.id === CORE)?.material?.emissive;
  return FIRST_CREATION_TONES.find((tone) => tone.color === color);
}

export function firstCreationCanTune(definition: AgentWorldDefinition | null): boolean {
  if (definition?.id !== FIRST_CREATION_ID) return false;
  const types = new Map(definition.entities.map((entity) => [entity.id, entity.type]));
  return types.get(CORE) === "icosahedron" && types.get(LIGHT) === "point-light" &&
    types.get(SPARKS) === "emitter" && TRIM.every((id) => types.get(id) === "torus");
}

export function firstCreationToneCommands(tone: FirstCreationTone): AgentWorldCommand[] {
  return [
    { op: "update", id: CORE, patch: { material: { color: tone.core, emissive: tone.color } } },
    { op: "update", id: LIGHT, patch: { material: { color: tone.light } } },
    { op: "update", id: SPARKS, patch: { emitter: { preset: "energy-orb", color: tone.color } } },
    ...TRIM.map((id): AgentWorldCommand => ({ op: "update", id, patch: { material: { emissive: tone.color } } })),
  ];
}

/** A small, asset-light scene whose visible palette is ordinary editable world data. */
export function composeFirstCreation(): AgentWorldDefinition {
  const tone = FIRST_CREATION_TONES[0];
  const disk = (id: string, y: number, radius: number, height: number, color: string): AgentWorldEntityDefinition => ({
    id, type: "cylinder", geometry: { radius, height, radialSegments: 72 },
    transform: { position: [0, y, 0] }, material: { color, roughness: 0.4, metalness: 0.36 },
  });
  const ring = (id: string, radius: number, tube: number, position: AgentWorldVector3, rotationDegrees: AgentWorldVector3, parentId?: string): AgentWorldEntityDefinition => ({
    id, parentId, type: "torus", geometry: { radius, tube, radialSegments: 72 },
    transform: { position, rotationDegrees },
    material: { color: "#bea47d", emissive: tone.color, emissiveIntensity: 0.43, roughness: 0.24, metalness: 0.72 },
  });
  const stoneClusters: [number, number, number][] = [
    [-11, -12, 2.7], [-15, -17, 4.2], [-20, -27, 6.6], [-28, -31, 7],
    [-8, -23, 4.6], [-2, -30, 5.8], [6, -34, 7.4], [14, -30, 6], [19, -28, 4.7],
  ];
  const trees: AgentWorldEntityDefinition[] = stoneClusters.map(([x, z, height], index) => ({
    id: "garden-pine-" + index, type: "cone", geometry: { radius: height * 0.23, height, radialSegments: 7 },
    transform: { position: [x, height / 2 - 0.35, z], rotationDegrees: [0, 29 * index, 0] },
    material: { color: index % 2 ? "#152638" : "#1b3146", roughness: 0.94 },
  }));
  const markers: AgentWorldEntityDefinition[] = Array.from({ length: 7 }, (_, index) => {
    const angle = (index + 0.5) * Math.PI * 2 / 7;
    return {
      id: "garden-marker-" + index, type: "sphere", geometry: { radius: 0.077, radialSegments: 12 },
      transform: { position: [Math.cos(angle) * 3.65, 0.43, Math.sin(angle) * 3.65] },
      material: { color: "#ffc188", emissive: "#ff995c", emissiveIntensity: 1.35, roughness: 0.28 },
    };
  });
  return {
    schema: "graphysx.agent-world/v2", id: FIRST_CREATION_ID, label: "Jardin des lucioles",
    environment: {
      background: "#111b30", sky: "clearnight",
      lighting: { source: "studio", intensity: 0.38, yawDegrees: 0, backgroundIntensity: 0.68, backgroundBlur: 0.06 },
      ground: { visible: false, size: 80, color: "#102236", grid: false, gridColor: "#284455" },
    },
    entities: [
      { id: "garden-fill", type: "ambient-light", intensity: 0.68, material: { color: "#a9c5ff" } },
      {
        id: "garden-key", type: "directional-light", intensity: 2.15,
        transform: { position: [-8, 9, 5] }, material: { color: "#ffd4ab" },
      },
      {
        id: "garden-rim", type: "point-light", marker: false, intensity: 28, distance: 17,
        transform: { position: [4, 3.2, -4.8] }, material: { color: "#5677ff" },
      },
      {
        id: "garden-water", type: "water", label: "Miroir d’eau", transform: { position: [0, -0.51, 0] },
        water: {
          size: 150, color: "#0d2842", sunColor: "#efd0a6", sunDirection: [-0.52, 0.31, -0.58],
          rippleScale: 2.8, distortionScale: 0.74, flowSpeed: 0.42, reflectance: 0.048,
          tintStrength: 0.73, tintDistance: 56, reflection: true, reflectionResolution: 256,
        },
      },
      disk("garden-island", -0.11, 4.55, 0.82, "#27354a"),
      disk("garden-terrace", 0.28, 4.23, 0.2, "#263e50"),
      disk("garden-pedestal", 0.55, 1.3, 0.5, "#314555"),
      disk("garden-cap", 0.86, 0.99, 0.13, "#8e6e50"),
      ring(TRIM[0], 2.32, 0.026, [0, 0.396, 0], [90, 0, 0]),
      {
        id: "garden-armillary", type: "group", label: "Sphère armillaire",
        transform: { position: [0, 2.32, 0] },
        behaviors: [{ id: "garden-slow-orbit", type: "spin", axis: "y", speedDegrees: 12 }],
      },
      ring(TRIM[1], 1.18, 0.041, [0, 0, 0], [37, 0, -24], "garden-armillary"),
      ring(TRIM[2], 1.47, 0.051, [0, 0, 0], [61, 0, 69], "garden-armillary"),
      {
        id: CORE, type: "icosahedron", label: "Cœur lumineux", geometry: { radius: 0.57 },
        transform: { position: [0, 2.32, 0], rotationDegrees: [9, 24, 13] },
        material: { color: tone.core, emissive: tone.color, emissiveIntensity: 1.6, roughness: 0.24, metalness: 0.22 },
        behaviors: [{ id: "garden-core-turn", type: "spin", axis: "y", speedDegrees: -17 }],
      },
      {
        id: LIGHT, type: "point-light", marker: false, intensity: 16, distance: 9,
        transform: { position: [0, 2.12, 0.2] }, material: { color: tone.light },
      },
      {
        id: SPARKS, type: "emitter", label: "Lucioles", transform: { position: [0, 1.58, 0] },
        emitter: { preset: "energy-orb", sizeScale: 1.25, speed: 0.76, spread: 2.9, color: tone.color, rate: 15, maxParticles: 48 },
      },
      ...markers,
      ...trees,
    ],
  };
}

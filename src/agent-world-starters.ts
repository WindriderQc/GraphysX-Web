import {
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldDefinition,
  type AgentWorldEntityDefinition,
  type AgentWorldInteraction
} from "./agent-world-runtime";
import {
  instantiateAgentWorldPrefab,
  type AgentWorldPrefabId,
  type AgentWorldPrefabOptions
} from "./agent-world-prefabs";

export type AgentWorldStarterId = "prefab-plaza" | "glow-garden" | "signal-outpost" | "signal-trail" | "physics-sketchbook" | "living-systems" | "archive-great-slide";

export type AgentWorldStarterDescriptor = {
  id: AgentWorldStarterId;
  label: string;
  summary: string;
  prefabCount: number;
  entityCount: number;
};

export type AgentWorldStarterOptions = {
  id?: string;
  label?: string;
};

export const GRAPHYSX_AGENT_WORLD_STARTERS: readonly AgentWorldStarterDescriptor[] = [
  {
    id: "archive-great-slide",
    label: "Great Slide: Collider Proof",
    summary: "Faithful recovered BallZ SlideLarge geometry as a static trimesh; material, scale, lighting, ball, and catch basin are modern proof staging—not a recovered game ruleset.",
    prefabCount: 0,
    entityCount: 5
  },
  {
    id: "living-systems",
    label: "Living Systems",
    summary: "The graduated vocabulary in one scene: terrain and a reflecting lake under a sky, a starling flock, a whirlpool force field, particle braziers, and a 2D overlay.",
    prefabCount: 0,
    entityCount: 9
  },
  {
    id: "prefab-plaza",
    label: "Prefab Plaza",
    summary: "A balanced showcase with one of every reusable structure.",
    prefabCount: 5,
    entityCount: 43
  },
  {
    id: "glow-garden",
    label: "Glow Garden",
    summary: "Four luminous trees frame a portal and kinetic centerpiece.",
    prefabCount: 6,
    entityCount: 45
  },
  {
    id: "signal-outpost",
    label: "Signal Outpost",
    summary: "Two habitat pods, paired beacons and a welcoming portal.",
    prefabCount: 5,
    entityCount: 41
  },
  {
    id: "signal-trail",
    label: "Signal Trail",
    summary: "A tiny playable world: awaken three beacons to stabilize the portal.",
    prefabCount: 6,
    entityCount: 45
  },
  {
    id: "physics-sketchbook",
    label: "Physics Sketchbook",
    summary: "A readable agent laboratory for ramps, collisions, materials, mass, and planetary motion.",
    prefabCount: 0,
    entityCount: 16
  }
] as const;

export function instantiateAgentWorldStarter(
  starterId: AgentWorldStarterId,
  options: AgentWorldStarterOptions = {}
): AgentWorldDefinition {
  const descriptor = GRAPHYSX_AGENT_WORLD_STARTERS.find((candidate) => candidate.id === starterId);
  if (!descriptor) throw new Error(`Unknown starter world: ${String(starterId)}`);

  const base = starterBase(starterId);
  return {
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: options.id?.trim() || `graphysx-${starterId}`,
    label: options.label?.trim() || descriptor.label,
    environment: base.environment,
    entities: base.entities
  };
}

function starterBase(starterId: AgentWorldStarterId): Pick<AgentWorldDefinition, "environment" | "entities"> {
  if (starterId === "archive-great-slide") return archiveGreatSlide();
  if (starterId === "living-systems") return livingSystems();
  if (starterId === "physics-sketchbook") return physicsSketchbook();
  if (starterId === "prefab-plaza") {
    return {
      environment: {
        background: "#050e1b",
        ground: { visible: true, size: 46, color: "#10282f", grid: true, gridColor: "#3ac4c2" }
      },
      entities: [
        ...starterLights("plaza", "#92cde2", "#fff0c9", [-12, 17, 9]),
        ...prefab("luminous-tree", { idPrefix: "plaza-tree", position: [-8.5, 0, -4.5], scale: [1.1, 1.1, 1.1] }),
        ...prefab("signal-beacon", { idPrefix: "plaza-beacon", position: [-8.2, 0, 6] }),
        ...interactivePrefab("portal-arch", { idPrefix: "plaza-portal", position: [0, 0, -7] }, ":core", [":ring", ":light"], "Toggle plaza portal"),
        ...prefab("orbital-sculpture", { idPrefix: "plaza-orbital", position: [0, 0, 3.2] }),
        ...prefab("habitat-pod", { idPrefix: "plaza-habitat", position: [8.2, 0, 1.5], rotationDegrees: [0, -28, 0] })
      ]
    };
  }

  if (starterId === "glow-garden") {
    return {
      environment: {
        background: "#071021",
        ground: { visible: true, size: 44, color: "#132b2b", grid: true, gridColor: "#4cba9e" }
      },
      entities: [
        ...starterLights("garden", "#a7cfe1", "#ffe1af", [-10, 16, 7]),
        ...prefab("portal-arch", {
          idPrefix: "garden-portal", position: [0, 0, -8],
          palette: { primary: "#8f83ff", accent: "#73f4d4", emissive: "#4630a0" }
        }),
        ...interactivePrefab("orbital-sculpture", {
          idPrefix: "garden-heart", position: [0, 0, 1.2], scale: [0.9, 0.9, 0.9],
          palette: { primary: "#ff9c85", secondary: "#68e4ff", accent: "#b6f39d" }
        }, ":core", [":axis-x", ":axis-y", ":axis-z", ":light"], "Toggle garden sculpture"),
        ...[
          [-8, 0, -3], [8, 0, -3], [-7, 0, 7], [7, 0, 7]
        ].flatMap((position, index) => prefab("luminous-tree", {
          idPrefix: `garden-tree-${index + 1}`,
          position: position as [number, number, number],
          rotationDegrees: [0, index * 35, 0],
          scale: index < 2 ? [1.05, 1.05, 1.05] : [0.88, 0.88, 0.88],
          palette: index % 2
            ? { primary: "#72dbbe", secondary: "#a4edcf", accent: "#ffcf91" }
            : { primary: "#59e4a7", secondary: "#8cf1bd", accent: "#ffd8a8" }
        }))
      ]
    };
  }

  if (starterId === "signal-outpost") return {
    environment: {
      background: "#07131d",
      ground: { visible: true, size: 48, color: "#17252c", grid: true, gridColor: "#527f8f" }
    },
    entities: [
      ...starterLights("outpost", "#a8c9d8", "#ffd8aa", [-14, 18, 10]),
      ...interactivePrefab("portal-arch", {
        idPrefix: "outpost-gate", position: [0, 0, -9],
        palette: { primary: "#79dbe9", secondary: "#30485e", accent: "#ffb56e", emissive: "#2a7180" }
      }, ":core", [":ring", ":light"], "Toggle outpost gate"),
      ...prefab("habitat-pod", { idPrefix: "outpost-pod-west", position: [-7.5, 0, 2], rotationDegrees: [0, 24, 0] }),
      ...prefab("habitat-pod", { idPrefix: "outpost-pod-east", position: [7.5, 0, 2], rotationDegrees: [0, -24, 0] }),
      ...prefab("signal-beacon", {
        idPrefix: "outpost-beacon-west", position: [-8.5, 0, -7], scale: [0.82, 0.82, 0.82],
        palette: { primary: "#57dce8", accent: "#ffb56e", emissive: "#287786" }
      }),
      ...prefab("signal-beacon", {
        idPrefix: "outpost-beacon-east", position: [8.5, 0, -7], scale: [0.82, 0.82, 0.82],
        palette: { primary: "#8a9cff", accent: "#7af5d3", emissive: "#3b4b9b" }
      })
    ]
  };

  return {
    environment: {
      background: "#06101b",
      ground: { visible: true, size: 46, color: "#10272c", grid: true, gridColor: "#3d9c91" }
    },
    entities: [
      ...starterLights("trail", "#9bc6d6", "#ffe4bd", [-12, 17, 9]),
      ...prefab("portal-arch", {
        idPrefix: "trail-portal", position: [0, 0, -9],
        palette: { primary: "#8177ff", secondary: "#273957", accent: "#78f4d6", emissive: "#40319a" },
        tags: ["experience:signal-trail", "destination"]
      }),
      ...signalTrailBeacon("trail-beacon-west", "West Signal", [-8, 0, 2], {
        primary: "#56dff0", secondary: "#264f68", accent: "#86f3ff", emissive: "#186f80"
      }),
      ...signalTrailBeacon("trail-beacon-center", "Center Signal", [0, 0, 4.5], {
        primary: "#ffb45f", secondary: "#68452a", accent: "#ffe39a", emissive: "#8d4f18"
      }),
      ...signalTrailBeacon("trail-beacon-east", "East Signal", [8, 0, 2], {
        primary: "#a68bff", secondary: "#44356c", accent: "#d8b7ff", emissive: "#543c9b"
      }),
      ...prefab("luminous-tree", {
        idPrefix: "trail-tree-west", position: [-10, 0, -6], scale: [0.9, 0.9, 0.9],
        palette: { primary: "#55d7a1", secondary: "#8deabc", accent: "#ffd69a" }
      }),
      ...prefab("luminous-tree", {
        idPrefix: "trail-tree-east", position: [10, 0, -6], scale: [0.9, 0.9, 0.9],
        palette: { primary: "#64d6bd", secondary: "#9be8ce", accent: "#ffd69a" }
      })
    ]
  };
}

/**
 * The archive's BallZ 2011 Level0 terrain, graduated from a RaceScene-only decoded array
 * into ordinary v2 vocabulary. The recovered vertex/index/UV data is exact; the material,
 * lighting, scale, and staging are modern presentation. `fitSize` uses the source's longest span
 * at 1:10 scale, making the collider large enough to read while preserving every proportion.
 */
function archiveGreatSlide(): Pick<AgentWorldDefinition, "environment" | "entities"> {
  return {
    environment: {
      background: "#071622",
      sky: "lostvalley",
      ground: { visible: false, size: 80, color: "#0c2530", grid: false, gridColor: "#4fa9b5" },
      physics: { gravity: [0, -9.81, 0] },
      envelope: { fogNear: 70, fogFar: 180, cameraFar: 360 }
    },
    entities: [
      ...starterLights("great-slide", "#b8d9e8", "#fff0c7", [-24, 32, 18]),
      {
        id: "great-slide-terrain", label: "Recovered SlideLarge", type: "model",
        asset: { id: "archive-slide-large", fitSize: 52.7337 },
        transform: { position: [0, 0, 0] },
        physics: { mode: "static", material: "ground", collider: "trimesh" },
        castShadow: true,
        tags: ["archive", "ballz-2011", "scene-native-collider", "collider:trimesh"]
      },
      {
        id: "great-slide-ball", label: "Slide Test Ball", type: "sphere",
        transform: { position: [20, 8, 0] }, geometry: { radius: 0.72, radialSegments: 32 },
        material: { color: "#ff8b5c", emissive: "#6d1d0b", emissiveIntensity: 0.32, roughness: 0.24, metalness: 0.12 },
        physics: { mode: "dynamic", mass: 1.2, material: "ball", linearVelocity: [-3.5, 0, 0] },
        castShadow: true,
        tags: ["archive", "physics:dynamic", "agent-observable", "proof:trimesh"]
      },
      {
        id: "great-slide-catch", label: "Lower Catch Basin", type: "box",
        transform: { position: [-18, -9.1, 0] }, geometry: { width: 25, height: 0.6, depth: 22 },
        material: { color: "#102a35", roughness: 0.9, metalness: 0.02 },
        physics: { mode: "static", material: "ground" },
        receiveShadow: true,
        tags: ["staging", "safety-floor", "physics:static"]
      }
    ]
  };
}

/**
 * A single scene that shows what has graduated into the runtime: a heightmap `terrain` with its
 * collider, a reflecting `water` plane, a self-steering `flock`, a `force-field` the flock and
 * particles bend around, particle `emitter`s, a per-scene sky, and a 2D `overlay`. Everything
 * here is ordinary v2 vocabulary an agent can spawn — the point is that the headline systems
 * compose in one place, not that this scene is special.
 */
function livingSystems(): Pick<AgentWorldDefinition, "environment" | "entities"> {
  return {
    environment: {
      background: "#0b1c26",
      sky: "lostvalley",
      // The 2D layer, on a real scene: a soft cinematic frame over the 3D view.
      overlay: "vignette",
      // Terrain brings the ground and its collider, so the flat grid would only z-fight it.
      ground: { visible: false, size: 60, color: "#123039", grid: false, gridColor: "#2a7d8f" },
    },
    entities: [
      ...starterLights("living", "#bcd8e6", "#ffe6bd", [-24, 26, -20]),
      {
        id: "living-terrain", label: "Highland Terrain", type: "terrain",
        terrain: { heightmap: "highlands", size: 130, segments: 96, heightScale: 14, heightOffset: -8, flattenRadius: 10, flattenFalloff: 14, flattenHeight: 0 },
        transform: { position: [0, 0, 0] },
        material: { color: "#5f7148", roughness: 0.96, metalness: 0.02 },
        castShadow: false, tags: ["terrain", "living"],
      },
      {
        id: "living-water", label: "Reflecting Lake", type: "water",
        transform: { position: [0, -1.4, 0] },
        water: { size: 130, color: "#0f4a66", reflection: true, reflectionResolution: 256 },
        tags: ["water", "living"],
      },
      {
        // The steering half of the Nature-of-Code lesson: a population that flocks.
        id: "living-flock", label: "Starling Murmuration", type: "flock",
        transform: { position: [0, 11, -6] },
        flock: { preset: "starlings", count: 70 },
        tags: ["life", "flock", "living"],
      },
      {
        // The other half: the field the flock and the braziers bend around.
        id: "living-vortex", label: "Whirlpool Field", type: "force-field",
        transform: { position: [0, 5, 0] },
        forceField: { preset: "whirlpool" },
        tags: ["life", "force-field", "living"],
      },
      {
        id: "living-brazier-west", label: "West Brazier", type: "emitter",
        transform: { position: [-6.5, 1.4, 3] },
        emitter: { preset: "campfire" },
        tags: ["effect", "living"],
      },
      {
        id: "living-brazier-east", label: "East Brazier", type: "emitter",
        transform: { position: [6.5, 1.4, 3] },
        emitter: { preset: "campfire" },
        tags: ["effect", "living"],
      },
      {
        // A kinetic centrepiece so the vortex has something to read against, and the eye lands.
        id: "living-core", label: "Kinetic Core", type: "icosahedron",
        transform: { position: [0, 3.2, 0], scale: [1.5, 1.5, 1.5] },
        material: { color: "#ff9a6a", emissive: "#7a2410", emissiveIntensity: 1.2, metalness: 0.4, roughness: 0.3 },
        physics: { mode: "kinematic" },
        behaviors: [{ type: "spin", axis: "y", speedDegrees: 32 }, { type: "bob", amplitude: 0.5, frequencyHz: 0.28 }],
        castShadow: true, tags: ["focus", "living"],
      },
    ],
  };
}

function physicsSketchbook(): Pick<AgentWorldDefinition, "environment" | "entities"> {
  return {
    environment: {
      background: "#07131f",
      ground: { visible: false, size: 36, color: "#101d29", grid: false, gridColor: "#3f8395" },
      physics: { gravity: [0, -9.81, 0] }
    },
    entities: [
      ...starterLights("sketch", "#b8d8e7", "#fff0c8", [-10, 16, 9]),
      {
        id: "lab-floor", label: "Shared Experiment Floor", type: "box",
        transform: { position: [0, -0.3, 0] }, geometry: { width: 28, height: 0.6, depth: 18 },
        material: { color: "#ffffff", roughness: 0.78, texture: { id: "wood-floor", repeat: [6, 4] } },
        physics: { mode: "static", material: "ground" }, tags: ["lab", "surface", "physics:static"]
      },
      {
        id: "ramp", label: "Checker Ramp", type: "box",
        transform: { position: [-7, 1.65, -2.5], rotationDegrees: [0, 0, -18] }, geometry: { width: 7, height: 0.35, depth: 4 },
        material: { color: "#ffffff", roughness: 0.62, texture: { id: "checker", repeat: [4, 2] } },
        physics: { mode: "static", material: "wall" }, tags: ["lab", "experiment:ramp", "physics:static"]
      },
      {
        id: "ramp-ball", label: "Rolling Test Ball", type: "sphere",
        transform: { position: [-8.7, 5.4, -2.5] }, geometry: { radius: 0.72, radialSegments: 32 },
        material: { color: "#ffffff", roughness: 0.28, metalness: 0.06, texture: { id: "spheres" } },
        physics: { mode: "dynamic", mass: 1, material: "ball", restitution: 0.62 }, tags: ["lab", "experiment:ramp", "physics:dynamic", "agent-observable"]
      },
      {
        id: "impulse-pad", label: "Launch Test Ball", type: "box",
        transform: { position: [-10.5, 0.24, 1.5] }, geometry: { width: 2.3, height: 0.48, depth: 2.3 },
        material: { color: "#ff9b55", emissive: "#7a2d0a", emissiveIntensity: 0.85, roughness: 0.5, texture: { id: "abstract-cubes" } },
        physics: { mode: "static", material: "wall" }, tags: ["lab", "experiment:impulse", "physics:static", "interactive"],
        interactions: [{ id: "launch-ball", label: "Apply impulse to test ball", type: "apply-impulse", targetIds: ["ramp-ball"], impulse: [7, 5, 0] }]
      },
      {
        id: "collision-wall", label: "Collision Target", type: "box",
        transform: { position: [-2.1, 1.25, -2.5] }, geometry: { width: 0.7, height: 2.5, depth: 4 },
        material: { color: "#ffffff", roughness: 0.38, metalness: 0.65, texture: { id: "eroded-metal", repeat: [1, 2] } },
        physics: { mode: "static", material: "wall" }, tags: ["lab", "experiment:collision", "physics:static"]
      },
      {
        id: "mass-light", label: "Mass 0.5", type: "box",
        transform: { position: [1.5, 4.8, -3] }, geometry: { width: 1.25, height: 1.25, depth: 1.25 },
        material: { color: "#ffffff", roughness: 0.72, texture: { id: "worn-wood" } },
        physics: { mode: "dynamic", mass: 0.5, material: "default" }, tags: ["lab", "experiment:mass", "physics:dynamic", "mass:0.5"]
      },
      {
        id: "mass-heavy", label: "Mass 5", type: "box",
        transform: { position: [3.7, 4.8, -3] }, geometry: { width: 1.25, height: 1.25, depth: 1.25 },
        material: { color: "#ffffff", roughness: 0.34, metalness: 0.72, texture: { id: "rusted-metal" } },
        physics: { mode: "dynamic", mass: 5, material: "default" }, tags: ["lab", "experiment:mass", "physics:dynamic", "mass:5"]
      },
      {
        id: "bounce-ball", label: "High Restitution Ball", type: "sphere",
        transform: { position: [0, 6.5, 1.5] }, geometry: { radius: 0.62, radialSegments: 32 },
        material: { color: "#ffffff", roughness: 0.22, texture: { id: "marble" } },
        physics: { mode: "dynamic", mass: 1, material: "ball", restitution: 0.9 }, tags: ["lab", "experiment:restitution", "physics:dynamic", "agent-observable"]
      },
      {
        id: "coordinate-board", label: "Coordinate Board", type: "box",
        transform: { position: [5.8, 0.12, 4.3] }, geometry: { width: 9, height: 0.24, depth: 6 },
        material: { color: "#ffffff", roughness: 0.82, texture: { id: "green-grid", repeat: [4, 3] } },
        physics: { mode: "static", material: "ground" }, tags: ["lab", "concept:coordinates", "physics:static", "interactive"],
        interactions: [{ id: "toggle-axes", label: "Toggle coordinate axes", type: "toggle-visibility", targetIds: ["concept-axis-x", "concept-axis-z"] }]
      },
      {
        id: "earth-model", label: "Textured Earth Concept", type: "sphere",
        transform: { position: [5.8, 3, 4.3] }, geometry: { radius: 1.55, radialSegments: 48 },
        material: { color: "#ffffff", roughness: 0.68, metalness: 0.02, texture: { id: "earth" } },
        tags: ["lab", "concept:planet", "agent-illustration"], behaviors: [{ type: "spin", axis: "y", speedDegrees: 10 }]
      },
      {
        id: "lab-agent", label: "GraphysX Observer", type: "agent",
        transform: { position: [-2.6, 0, 4.3] }, geometry: { height: 2, radius: 0.5, radialSegments: 20 },
        material: { color: "#7ef2d1", emissive: "#155c55", emissiveIntensity: 0.75, roughness: 0.42, metalness: 0.18, texture: { id: "abstract-cubes" } },
        agent: { role: "physics explainer", status: "observing", perceptionRadius: 10, capabilities: ["observe", "edit", "explain", "interact"] },
        tags: ["lab", "agent-avatar", "observer", "agent-illustration"]
      },
      {
        id: "orbit-marker", label: "Orbiting Marker", type: "sphere",
        transform: { position: [8.4, 3, 4.3] }, geometry: { radius: 0.34, radialSegments: 24 },
        material: { color: "#d9e8ff", emissive: "#566b94", emissiveIntensity: 0.5, roughness: 0.5, texture: { id: "marble" } },
        tags: ["lab", "concept:orbit", "agent-illustration"], behaviors: [{ type: "orbit", center: [5.8, 3, 4.3], radius: 2.6, speedDegrees: 24, axis: "y" }]
      },
      {
        id: "concept-axis-x", label: "Positive X", type: "box", transform: { position: [2.2, 0.45, 4.3] },
        geometry: { width: 3, height: 0.16, depth: 0.16 }, material: { color: "#ff6f61", emissive: "#5b1210", emissiveIntensity: 0.7 }, tags: ["concept:coordinates", "axis:x"]
      },
      {
        id: "concept-axis-z", label: "Positive Z", type: "box", transform: { position: [0.7, 0.45, 5.8] },
        geometry: { width: 0.16, height: 0.16, depth: 3 }, material: { color: "#5aa9ff", emissive: "#102d61", emissiveIntensity: 0.7 }, tags: ["concept:coordinates", "axis:z"]
      }
    ]
  };
}

function starterLights(
  prefix: string,
  ambientColor: string,
  sunColor: string,
  sunPosition: [number, number, number]
): AgentWorldEntityDefinition[] {
  return [
    { id: `${prefix}-ambient`, label: "Ambient Light", type: "ambient-light", intensity: 0.82, material: { color: ambientColor }, tags: ["lighting", "starter"] },
    { id: `${prefix}-sun`, label: "Key Light", type: "directional-light", intensity: 3.2, transform: { position: sunPosition }, material: { color: sunColor }, tags: ["lighting", "starter"], castShadow: true }
  ];
}

function prefab(prefabId: AgentWorldPrefabId, options: AgentWorldPrefabOptions & { idPrefix: string }): AgentWorldEntityDefinition[] {
  return instantiateAgentWorldPrefab(prefabId, { ...options, tags: ["starter", ...(options.tags ?? [])] });
}

function interactivePrefab(
  prefabId: AgentWorldPrefabId,
  options: AgentWorldPrefabOptions & { idPrefix: string },
  sourceSuffix: string,
  targetSuffixes: string[],
  label: string
): AgentWorldEntityDefinition[] {
  const interaction: AgentWorldInteraction = {
    id: "toggle-power",
    label,
    type: "toggle-visibility",
    targetIds: targetSuffixes.map((suffix) => `${options.idPrefix}${suffix}`)
  };
  return prefab(prefabId, options).map((entity) => entity.id === `${options.idPrefix}${sourceSuffix}`
    ? { ...entity, interactions: [interaction] }
    : entity);
}

function signalTrailBeacon(
  idPrefix: string,
  label: string,
  position: [number, number, number],
  palette: NonNullable<AgentWorldPrefabOptions["palette"]>
): AgentWorldEntityDefinition[] {
  const targetIds = [":ring-1", ":ring-2", ":ring-3", ":light"].map((suffix) => `${idPrefix}${suffix}`);
  return prefab("signal-beacon", {
    idPrefix,
    position,
    scale: [0.92, 0.92, 0.92],
    palette,
    tags: ["experience:signal-trail"]
  }).map((entity) => {
    if (entity.id === `${idPrefix}:lens`) {
      return {
        ...entity,
        label,
        tags: [...(entity.tags ?? []), "signal-node", "experience:signal-trail"],
        interactions: [{
          id: "power-signal",
          label: `Awaken ${label}`,
          type: "toggle-visibility",
          targetIds
        }]
      };
    }
    if (targetIds.includes(String(entity.id))) {
      return {
        ...entity,
        visible: false,
        tags: [...(entity.tags ?? []), "signal-energy", "experience:signal-trail"]
      };
    }
    return entity;
  });
}

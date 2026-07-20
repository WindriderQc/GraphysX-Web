import type {
  AgentWorldEntityDefinition,
  AgentWorldVector3
} from "./agent-world-runtime";

export type AgentWorldPrefabId =
  | "cubx-assembly"
  | "luminous-tree"
  | "signal-beacon"
  | "portal-arch"
  | "orbital-sculpture"
  | "habitat-pod";

export type AgentWorldPrefabPalette = {
  primary: string;
  secondary: string;
  accent: string;
  emissive: string;
};

export type AgentWorldPrefabOptions = {
  idPrefix?: string;
  position?: AgentWorldVector3;
  rotationDegrees?: AgentWorldVector3;
  scale?: AgentWorldVector3;
  palette?: Partial<AgentWorldPrefabPalette>;
  tags?: string[];
};

export type AgentWorldPrefabDescriptor = {
  id: AgentWorldPrefabId;
  label: string;
  summary: string;
  entityCount: number;
  defaultPalette: AgentWorldPrefabPalette;
};

export const GRAPHYSX_AGENT_WORLD_PREFABS: readonly AgentWorldPrefabDescriptor[] = [
  {
    id: "cubx-assembly",
    label: "CubX Assembly",
    summary: "The recovered 2008 CubX frame: eight corner cubes joined by twelve edge struts.",
    entityCount: 21,
    // The recovered StdMat is untextured grey — diffuse 0.8, ambient 0.1, specular 0.2/power 20,
    // emissive 0. These defaults carry that; a scene that wants the showroom's cyan passes a
    // palette override, which is a departure it declares rather than one baked into the record.
    defaultPalette: { primary: "#cccccc", secondary: "#a8b0b5", accent: "#e8eef0", emissive: "#1a1f22" }
  },
  {
    id: "luminous-tree",
    label: "Luminous Tree",
    summary: "Layered low-poly canopy, warm trunk, halo and local glow.",
    entityCount: 6,
    defaultPalette: { primary: "#63e6b2", secondary: "#98f5c8", accent: "#ffd38a", emissive: "#17694c" }
  },
  {
    id: "signal-beacon",
    label: "Signal Beacon",
    summary: "Architectural mast with orbiting signal rings and a pulsing lens.",
    entityCount: 8,
    defaultPalette: { primary: "#3bcce8", secondary: "#315b7a", accent: "#8c7cff", emissive: "#166e82" }
  },
  {
    id: "portal-arch",
    label: "Portal Arch",
    summary: "Twin pillars, lintel, emissive portal ring and atmospheric light.",
    entityCount: 7,
    defaultPalette: { primary: "#6f79ff", secondary: "#293761", accent: "#7cf6e5", emissive: "#392fb0" }
  },
  {
    id: "orbital-sculpture",
    label: "Orbital Sculpture",
    summary: "Kinetic centerpiece with three axes and six orbiting satellites.",
    entityCount: 12,
    defaultPalette: { primary: "#ff8f74", secondary: "#64e6ff", accent: "#9af6bd", emissive: "#92351f" }
  },
  {
    id: "habitat-pod",
    label: "Habitat Pod",
    summary: "Compact sci-fi shelter with dome, base, antenna and entry lights.",
    entityCount: 8,
    defaultPalette: { primary: "#dceff2", secondary: "#34566a", accent: "#7df6d2", emissive: "#1d7f70" }
  }
] as const;

export type AgentWorldPrefabInstance = {
  prefabId: AgentWorldPrefabId;
  rootId: string;
  entityIds: string[];
};

export function instantiateAgentWorldPrefab(
  prefabId: AgentWorldPrefabId,
  options: AgentWorldPrefabOptions & { idPrefix: string }
): AgentWorldEntityDefinition[] {
  const descriptor = GRAPHYSX_AGENT_WORLD_PREFABS.find((candidate) => candidate.id === prefabId);
  if (!descriptor) throw new Error(`Unknown prefab: ${String(prefabId)}`);
  const prefix = options.idPrefix;
  const palette = { ...descriptor.defaultPalette, ...(options.palette ?? {}) };
  const rootTags = uniqueTags(["prefab", "prefab-root", `prefab:${prefabId}`, ...(options.tags ?? [])]);
  const partTags = ["prefab", "prefab-part", `prefab:${prefabId}`];
  const root: AgentWorldEntityDefinition = {
    id: prefix,
    label: descriptor.label,
    type: "group",
    transform: {
      position: options.position ?? [0, 0, 0],
      rotationDegrees: options.rotationDegrees ?? [0, 0, 0],
      scale: options.scale ?? [1, 1, 1]
    },
    tags: rootTags
  };

  switch (prefabId) {
    case "cubx-assembly": {
      // The recovered CubX assembly, re-authored as v2 primitives.
      //
      // Source: `src/legacy/cubx-actor-lineage.json` (decoded `CubXOpen.tva` hierarchy) and
      // `cubx-actor-inspection-geometry.json`. The record is in TV3D units where the cube module
      // is 25; dividing by 25 gives the clean 1-unit module used here, so corner cubes sit on
      // ±1 and every strut spans exactly the 1-unit gap between two neighbours.
      //
      // FAITHFUL: the part count and topology (8 corner cubes + 12 edge struts), the 25³ cube
      // module, the strut proportions (≈6-radius over a 25 length → 0.24 over 1), and the
      // untextured grey StdMat.
      // INFERRED: exact pivot offsets. The archive's boxes carry a local centre of [0, 12.5, 0]
      // and its struts sit on asymmetric world offsets; this places both symmetrically about the
      // assembly centre instead, which reads identically and keeps the prefab centred on its
      // own origin the way every other prefab is.
      // DELIBERATELY ABSENT: the eight `CubXBtn` click proxies and any click-index → BoxNN →
      // actor mapping. The audit's own `mappingAssessment` records that those three orderings
      // disagree in the source and warns against inventing one, so this ships the unambiguous
      // *shape* and leaves the semantics to whatever binds interactions later.
      const corners: AgentWorldVector3[] = [
        [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
        [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]
      ];
      // The twelve edges of the cube: one axis at the midpoint, the other two on a corner.
      const struts: Array<{ position: AgentWorldVector3; rotationDegrees: AgentWorldVector3 }> = [];
      for (const a of [-1, 1]) {
        for (const b of [-1, 1]) {
          // Cylinders stand on Y by default, so X- and Z-aligned edges are rotated onto their axis.
          struts.push({ position: [0, a, b], rotationDegrees: [0, 0, 90] });
          struts.push({ position: [a, 0, b], rotationDegrees: [0, 0, 0] });
          struts.push({ position: [a, b, 0], rotationDegrees: [90, 0, 0] });
        }
      }
      return [
        root,
        ...corners.map((corner, index): AgentWorldEntityDefinition => ({
          id: `${prefix}:cube-${index + 1}`, label: `Corner Cube ${index + 1}`, type: "box", parentId: prefix,
          geometry: { width: 1, height: 1, depth: 1 },
          transform: { position: corner },
          material: { color: palette.primary, emissive: palette.emissive, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.12 },
          tags: partTags
        })),
        ...struts.map((strut, index): AgentWorldEntityDefinition => ({
          id: `${prefix}:strut-${index + 1}`, label: `Edge Strut ${index + 1}`, type: "cylinder", parentId: prefix,
          geometry: { radius: 0.24, height: 1, radialSegments: 12 },
          transform: { position: strut.position, rotationDegrees: strut.rotationDegrees },
          material: { color: palette.secondary, emissive: palette.emissive, emissiveIntensity: 0.25, roughness: 0.42, metalness: 0.2 },
          tags: partTags
        }))
      ];
    }
    case "luminous-tree":
      return [
        root,
        {
          id: `${prefix}:trunk`, label: "Tree Trunk", type: "cylinder", parentId: prefix,
          geometry: { radius: 0.34, height: 3.2, radialSegments: 10 },
          transform: { position: [0, 1.6, 0] },
          material: { color: "#765347", roughness: 0.86 }, tags: partTags
        },
        {
          id: `${prefix}:crown-low`, label: "Lower Crown", type: "cone", parentId: prefix,
          geometry: { radius: 1.65, height: 2.8, radialSegments: 12 },
          transform: { position: [0, 3.45, 0] },
          material: { color: palette.primary, emissive: palette.emissive, emissiveIntensity: 0.65, roughness: 0.72 }, tags: partTags,
          behaviors: [{ type: "bob", axis: "y", amplitude: 0.08, frequencyHz: 0.18 }]
        },
        {
          id: `${prefix}:crown-high`, label: "Upper Crown", type: "cone", parentId: prefix,
          geometry: { radius: 1.15, height: 2.25, radialSegments: 12 },
          transform: { position: [0, 4.8, 0] },
          material: { color: palette.secondary, emissive: palette.emissive, emissiveIntensity: 0.85, roughness: 0.65 }, tags: partTags,
          behaviors: [{ type: "bob", axis: "y", amplitude: 0.06, frequencyHz: 0.22, phaseDegrees: 80 }]
        },
        {
          id: `${prefix}:halo`, label: "Tree Halo", type: "torus", parentId: prefix,
          geometry: { radius: 1.25, tube: 0.035, radialSegments: 48 },
          transform: { position: [0, 4.15, 0], rotationDegrees: [90, 0, 0] },
          material: { color: palette.accent, emissive: palette.emissive, emissiveIntensity: 1.4, metalness: 0.4 }, tags: partTags,
          behaviors: [{ type: "spin", axis: "z", speedDegrees: 14 }]
        },
        {
          id: `${prefix}:light`, label: "Tree Glow", type: "point-light", parentId: prefix,
          intensity: 3.2, distance: 11, transform: { position: [0, 4.1, 0] },
          material: { color: palette.accent, emissive: palette.emissive, emissiveIntensity: 1.8 }, tags: partTags
        }
      ];
    case "signal-beacon":
      return [
        root,
        {
          id: `${prefix}:base`, label: "Beacon Base", type: "cylinder", parentId: prefix,
          geometry: { radius: 1.05, height: 0.45, radialSegments: 16 }, transform: { position: [0, 0.225, 0] },
          material: { color: palette.secondary, metalness: 0.55, roughness: 0.38 }, tags: partTags
        },
        {
          id: `${prefix}:mast`, label: "Beacon Mast", type: "cylinder", parentId: prefix,
          geometry: { radius: 0.28, height: 4.8, radialSegments: 12 }, transform: { position: [0, 2.65, 0] },
          material: { color: palette.primary, emissive: palette.emissive, emissiveIntensity: 0.55, metalness: 0.62 }, tags: partTags
        },
        ...[1.5, 2.7, 3.9].map((height, index): AgentWorldEntityDefinition => ({
          id: `${prefix}:ring-${index + 1}`, label: `Signal Ring ${index + 1}`, type: "torus", parentId: prefix,
          geometry: { radius: 0.62 + index * 0.12, tube: 0.035, radialSegments: 48 },
          transform: { position: [0, height, 0], rotationDegrees: [90, 0, 0] },
          material: { color: index === 1 ? palette.accent : palette.primary, emissive: palette.emissive, emissiveIntensity: 1.25, metalness: 0.7 }, tags: partTags,
          behaviors: [{ type: "spin", axis: "z", speedDegrees: (index % 2 ? -1 : 1) * (18 + index * 5) }]
        })),
        {
          id: `${prefix}:lens`, label: "Beacon Lens", type: "icosahedron", parentId: prefix,
          geometry: { radius: 0.48, radialSegments: 24 }, transform: { position: [0, 5.2, 0] },
          material: { color: palette.accent, emissive: palette.emissive, emissiveIntensity: 1.8, metalness: 0.28 }, tags: partTags,
          behaviors: [{ type: "pulse", minimumScale: 0.86, maximumScale: 1.16, frequencyHz: 0.55 }]
        },
        {
          id: `${prefix}:light`, label: "Beacon Light", type: "point-light", parentId: prefix,
          intensity: 5.5, distance: 17, transform: { position: [0, 5.2, 0] },
          material: { color: palette.accent, emissive: palette.emissive, emissiveIntensity: 2 }, tags: partTags
        }
      ];
    case "portal-arch":
      return [
        root,
        ...[-1.75, 1.75].map((x, index): AgentWorldEntityDefinition => ({
          id: `${prefix}:pillar-${index + 1}`, label: `Portal Pillar ${index + 1}`, type: "box", parentId: prefix,
          geometry: { width: 0.7, height: 5.4, depth: 0.85 }, transform: { position: [x, 2.7, 0] },
          material: { color: palette.secondary, emissive: palette.emissive, emissiveIntensity: 0.42, metalness: 0.5, roughness: 0.44 }, tags: partTags
        })),
        {
          id: `${prefix}:lintel`, label: "Portal Lintel", type: "box", parentId: prefix,
          geometry: { width: 4.2, height: 0.72, depth: 0.9 }, transform: { position: [0, 5.2, 0] },
          material: { color: palette.secondary, emissive: palette.emissive, emissiveIntensity: 0.5, metalness: 0.52 }, tags: partTags
        },
        {
          id: `${prefix}:ring`, label: "Portal Ring", type: "torus", parentId: prefix,
          geometry: { radius: 1.62, tube: 0.11, radialSegments: 64 }, transform: { position: [0, 2.85, 0] },
          material: { color: palette.accent, emissive: palette.emissive, emissiveIntensity: 2, metalness: 0.68 }, tags: partTags,
          behaviors: [{ type: "spin", axis: "z", speedDegrees: 18 }, { type: "pulse", minimumScale: 0.96, maximumScale: 1.04, frequencyHz: 0.32 }]
        },
        {
          id: `${prefix}:core`, label: "Portal Core", type: "icosahedron", parentId: prefix,
          geometry: { radius: 0.32, radialSegments: 24 }, transform: { position: [0, 2.85, 0] },
          material: { color: palette.primary, emissive: palette.emissive, emissiveIntensity: 1.8 }, tags: partTags,
          behaviors: [{ type: "spin", axis: "y", speedDegrees: 42 }]
        },
        {
          id: `${prefix}:light`, label: "Portal Light", type: "point-light", parentId: prefix,
          intensity: 6, distance: 18, transform: { position: [0, 2.9, 0.4] },
          material: { color: palette.accent, emissive: palette.emissive, emissiveIntensity: 2 }, tags: partTags
        }
      ];
    case "orbital-sculpture":
      return [
        root,
        {
          id: `${prefix}:core`, label: "Orbital Core", type: "icosahedron", parentId: prefix,
          geometry: { radius: 1.05, radialSegments: 24 }, transform: { position: [0, 3.2, 0] },
          material: { color: palette.primary, emissive: palette.emissive, emissiveIntensity: 1.45, metalness: 0.34 }, tags: partTags,
          behaviors: [{ type: "spin", axis: "y", speedDegrees: 24 }, { type: "pulse", minimumScale: 0.9, maximumScale: 1.1, frequencyHz: 0.28 }]
        },
        ...(["x", "y", "z"] as const).map((axis, index): AgentWorldEntityDefinition => ({
          id: `${prefix}:axis-${axis}`, label: `Orbital Axis ${axis.toUpperCase()}`, type: "torus", parentId: prefix,
          geometry: { radius: 2.2 + index * 0.35, tube: 0.045, radialSegments: 64 },
          transform: { position: [0, 3.2, 0], rotationDegrees: axis === "x" ? [0, 90, 0] : axis === "y" ? [90, 0, 0] : [0, 0, 0] },
          material: { color: index === 0 ? palette.primary : index === 1 ? palette.secondary : palette.accent, emissive: palette.emissive, emissiveIntensity: 1.35, metalness: 0.72 }, tags: partTags,
          behaviors: [{ type: "spin", axis, speedDegrees: 10 + index * 4 }]
        })),
        ...Array.from({ length: 6 }, (_, index): AgentWorldEntityDefinition => ({
          id: `${prefix}:satellite-${index + 1}`, label: `Sculpture Satellite ${index + 1}`, type: index % 2 ? "sphere" : "icosahedron", parentId: prefix,
          geometry: { radius: 0.26 + (index % 3) * 0.055, radialSegments: 18 }, transform: { position: [0, 3.2, 0] },
          material: { color: index % 2 ? palette.accent : palette.secondary, emissive: palette.emissive, emissiveIntensity: 0.9, metalness: 0.24 }, tags: partTags,
          behaviors: [{ type: "orbit", axis: index % 3 === 0 ? "x" : index % 3 === 1 ? "y" : "z", center: [0, 3.2, 0], radius: 3.1 + (index % 2) * 0.75, speedDegrees: 13 + index * 3.2, phaseDegrees: index * 60 }]
        })),
        {
          id: `${prefix}:light`, label: "Sculpture Light", type: "point-light", parentId: prefix,
          intensity: 6.5, distance: 20, transform: { position: [0, 3.2, 0] },
          material: { color: palette.primary, emissive: palette.emissive, emissiveIntensity: 2 }, tags: partTags
        }
      ];
    case "habitat-pod":
      return [
        root,
        {
          id: `${prefix}:base`, label: "Habitat Base", type: "cylinder", parentId: prefix,
          geometry: { radius: 2.25, height: 0.65, radialSegments: 20 }, transform: { position: [0, 0.325, 0] },
          material: { color: palette.secondary, metalness: 0.48, roughness: 0.42 }, tags: partTags
        },
        {
          id: `${prefix}:dome`, label: "Habitat Dome", type: "sphere", parentId: prefix,
          geometry: { radius: 1.55, radialSegments: 28 }, transform: { position: [0, 1.65, 0], scale: [1.35, 0.82, 1.35] },
          material: { color: palette.primary, emissive: palette.emissive, emissiveIntensity: 0.32, metalness: 0.18, roughness: 0.38 }, tags: partTags
        },
        {
          id: `${prefix}:door`, label: "Habitat Door", type: "box", parentId: prefix,
          geometry: { width: 0.9, height: 1.5, depth: 0.18 }, transform: { position: [0, 1.15, 1.65] },
          material: { color: palette.accent, emissive: palette.emissive, emissiveIntensity: 1.1, metalness: 0.38 }, tags: partTags
        },
        {
          id: `${prefix}:antenna`, label: "Habitat Antenna", type: "cylinder", parentId: prefix,
          geometry: { radius: 0.08, height: 2.2, radialSegments: 8 }, transform: { position: [0.75, 3.15, -0.15] },
          material: { color: palette.secondary, metalness: 0.76, roughness: 0.3 }, tags: partTags
        },
        {
          id: `${prefix}:antenna-tip`, label: "Antenna Tip", type: "sphere", parentId: prefix,
          geometry: { radius: 0.18, radialSegments: 16 }, transform: { position: [0.75, 4.28, -0.15] },
          material: { color: palette.accent, emissive: palette.emissive, emissiveIntensity: 1.7 }, tags: partTags,
          behaviors: [{ type: "pulse", minimumScale: 0.78, maximumScale: 1.2, frequencyHz: 0.7 }]
        },
        {
          id: `${prefix}:door-light`, label: "Habitat Entry Light", type: "point-light", parentId: prefix,
          intensity: 3.8, distance: 11, transform: { position: [0, 1.7, 2] },
          material: { color: palette.accent, emissive: palette.emissive, emissiveIntensity: 2 }, tags: partTags
        },
        {
          id: `${prefix}:rim`, label: "Habitat Rim", type: "torus", parentId: prefix,
          geometry: { radius: 2.05, tube: 0.055, radialSegments: 64 }, transform: { position: [0, 0.72, 0], rotationDegrees: [90, 0, 0] },
          material: { color: palette.accent, emissive: palette.emissive, emissiveIntensity: 1.25, metalness: 0.5 }, tags: partTags
        }
      ];
  }
}

function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

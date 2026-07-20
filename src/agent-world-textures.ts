export type AgentWorldTextureCategory = "pattern" | "surface" | "nature" | "science";

export type AgentWorldTextureDescriptor = {
  id: string;
  label: string;
  url: string;
  category: AgentWorldTextureCategory;
  description: string;
  defaultRepeat: [number, number];
  source: "GraphysX archive" | "BallZ archive" | "SBQC archive";
};

/**
 * Small, curated vocabulary for agent-authored materials. Stable IDs keep world
 * documents readable while the browser-facing URLs remain an implementation detail.
 */
export const GRAPHYSX_AGENT_WORLD_TEXTURES = [
  {
    id: "checker",
    label: "Checker",
    url: "/assets/textures/Damier.jpg",
    category: "pattern",
    description: "High-contrast checker for scale, motion, contact, and orientation experiments.",
    defaultRepeat: [2, 2],
    source: "BallZ archive"
  },
  {
    id: "green-grid",
    label: "Green Grid",
    url: "/assets/textures/GreenGrid.png",
    category: "pattern",
    description: "GraphysX coordinate grid for spatial reasoning and measured surfaces.",
    defaultRepeat: [2, 2],
    source: "GraphysX archive"
  },
  {
    id: "abstract-cubes",
    label: "Abstract Cubes",
    url: "/assets/textures/AbstractCubes.jpg",
    category: "pattern",
    description: "Geometric cube field for topology, repetition, and visual grouping.",
    defaultRepeat: [1, 1],
    source: "GraphysX archive"
  },
  {
    id: "two-way",
    label: "Two Way",
    url: "/assets/threejs-playground/textures/twoway.jpg",
    category: "pattern",
    description: "Recovered directional tile referenced by historic GraphysX XML scene entities.",
    defaultRepeat: [1, 1],
    source: "SBQC archive"
  },
  {
    id: "eroded-metal",
    label: "Eroded Metal",
    url: "/assets/textures/Eroded%20scratch%20metal.jpg",
    category: "surface",
    description: "Scratched metal useful for machines, collision bodies, and industrial concepts.",
    defaultRepeat: [1, 1],
    source: "GraphysX archive"
  },
  {
    id: "rusted-metal",
    label: "Rusted Metal",
    url: "/assets/textures/Medrust3.png",
    category: "surface",
    description: "Weathered metal for contrasting material and friction experiments.",
    defaultRepeat: [1, 1],
    source: "GraphysX archive"
  },
  {
    id: "marble",
    label: "Marble",
    url: "/assets/textures/marble09.jpg",
    category: "surface",
    description: "Readable polished stone for architectural and mass-comparison scenes.",
    defaultRepeat: [1, 1],
    source: "GraphysX archive"
  },
  {
    id: "wood-floor",
    label: "Wood Floor",
    url: "/assets/textures/ballz18/WoodFloor05_col.jpg",
    category: "surface",
    description: "Recovered BallZ18 wood surface for floors, ramps, and rigid-body demonstrations.",
    defaultRepeat: [2, 2],
    source: "BallZ archive"
  },
  {
    id: "worn-wood",
    label: "Worn Wood",
    url: "/assets/textures/village/worn_wood.jpg",
    category: "surface",
    description: "Aged village wood for props, structures, and human-scale scene explanations.",
    defaultRepeat: [2, 2],
    source: "GraphysX archive"
  },
  {
    id: "earth",
    label: "Earth",
    url: "/assets/threejs-playground/textures/earth/earth_uv_with_topo.jpg",
    category: "nature",
    description: "Topographic Earth map for planetary, orbital, and coordinate-system illustrations.",
    defaultRepeat: [1, 1],
    source: "SBQC archive"
  },
  {
    // The recovered Voie Lactée bodies. They shipped in `public/` from the beginning and were
    // unreachable from v2 because nothing registered them — the same trap the vehicle meshes
    // were in, and the reason that archive scene could not be rebuilt: four of its five bodies
    // ARE their textures. Registering them makes them discoverable through `api.textures()` and
    // keeps them in the release manifest, which prunes anything the registries do not claim.
    id: "moon",
    label: "Moon",
    url: "/assets/archives/milky-way/moon.jpg",
    category: "nature",
    description: "Lunar surface map recovered from the Voie Lactée solar-system study.",
    defaultRepeat: [1, 1],
    source: "GraphysX archive"
  },
  {
    id: "mars",
    label: "Mars",
    url: "/assets/archives/milky-way/mars.jpg",
    category: "nature",
    description: "Martian surface map recovered from the Voie Lactée solar-system study.",
    defaultRepeat: [1, 1],
    source: "GraphysX archive"
  },
  {
    id: "venus",
    label: "Venus",
    url: "/assets/archives/milky-way/venus.jpg",
    category: "nature",
    description: "Venusian cloud-deck map recovered from the Voie Lactée solar-system study.",
    defaultRepeat: [1, 1],
    source: "GraphysX archive"
  },
  {
    id: "earth-clouds",
    label: "Earth Clouds",
    url: "/assets/archives/milky-way/earth-clouds.jpg",
    category: "nature",
    description: "Cloud layer for Earth, meant as a translucent shell over the surface map.",
    defaultRepeat: [1, 1],
    source: "GraphysX archive"
  },
  {
    id: "earth-surface",
    label: "Earth Surface",
    url: "/assets/archives/milky-way/earthgood.jpg",
    category: "nature",
    description: "The Voie Lactée study's own Earth map, paired with the cloud shell above.",
    defaultRepeat: [1, 1],
    source: "GraphysX archive"
  },
  {
    id: "spheres",
    label: "3D Spheres",
    url: "/assets/textures/suzanne1/3D_Spheres.jpg",
    category: "science",
    description: "Recovered sphere study for normals, curvature, and lighting explanations.",
    defaultRepeat: [1, 1],
    source: "BallZ archive"
  }
] as const satisfies readonly AgentWorldTextureDescriptor[];

export type AgentWorldTextureId = (typeof GRAPHYSX_AGENT_WORLD_TEXTURES)[number]["id"];

export function findAgentWorldTexture(id: string): AgentWorldTextureDescriptor | null {
  return GRAPHYSX_AGENT_WORLD_TEXTURES.find((texture) => texture.id === id) ?? null;
}

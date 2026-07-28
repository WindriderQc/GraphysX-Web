export type AgentWorldTextureCategory = "pattern" | "surface" | "nature" | "science" | "imported";

export type AgentWorldTextureDescriptor = {
  id: string;
  label: string;
  url: string;
  category: AgentWorldTextureCategory;
  description: string;
  defaultRepeat: [number, number];
  /** Provenance. Curated entries name their archive; runtime imports name their datalake path. */
  source: string;
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
    id: "classic-alien01",
    label: "Classic Alien 01",
    url: "/assets/textures/classic/Alien01_B_diff.bmp",
    category: "surface",
    description: "Level 1's recovered alien-panel floor diffuse map.",
    defaultRepeat: [10, 10],
    source: "StockRoom Level 1 / BallZ 2015 archive"
  },
  {
    id: "classic-alien01-normal",
    label: "Classic Alien 01 Normal",
    url: "/assets/textures/classic/Alien01_B_normal.bmp",
    category: "surface",
    description: "Level 1's recovered tangent-space alien-panel normal map.",
    defaultRepeat: [10, 10],
    source: "StockRoom Level 1 / BallZ 2015 archive"
  },
  {
    id: "classic-checkerboard",
    label: "Classic Checkerboard",
    url: "/assets/textures/classic/Checkerboard.png",
    category: "pattern",
    description: "Level 2's recovered checkerboard floor, repeated once per authored cell.",
    defaultRepeat: [20, 20],
    source: "StockRoom Level 2 / BallZ 2015 archive"
  },
  {
    id: "classic-wood03",
    label: "Classic Wood 03",
    url: "/assets/textures/classic/Wood03_diff.bmp",
    category: "surface",
    description: "Level 2's recovered gold wood wall surface.",
    defaultRepeat: [1, 1],
    source: "StockRoom Level 2 / BallZ 2015 archive"
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
    // The Math Game's own backdrop panel. On disk since the beginning and unregistered, which
    // means the release manifest would have pruned it and the board would have 404'd in
    // production while working in dev — the same trap the vehicle meshes were in.
    id: "electronic-board",
    label: "Electronic Board",
    url: "/assets/textures/archive/ElectronicBoard_fullsize.jpg",
    category: "science",
    description: "Instrument-panel backdrop recovered from the Math Game screen.",
    defaultRepeat: [1, 1],
    source: "GraphysX archive"
  },
  {
    id: "concrete",
    label: "Concrete",
    url: "/assets/textures/archive/concrete.png",
    category: "surface",
    description: "Recovered concrete slab — the source2017 Suzanne floor binding, and a plain hard ground anywhere.",
    defaultRepeat: [4, 4],
    source: "GraphysX archive; Scene3D/BallZLevel.h floor binding"
  },
  {
    id: "objet39",
    label: "Objet 39",
    url: "/assets/textures/suzanne1/objet39.jpg",
    category: "surface",
    description: "The recovered Suzanne wall texture — Scene.cpp binds every `#` wall cube to it.",
    defaultRepeat: [1, 1],
    source: "BallZ archive StockRoom/Suzanne1; Scene3D/BallZLevel.h"
  },
  {
    id: "podium",
    label: "Podium",
    url: "/assets/textures/suzanne1/Podium.JPG",
    category: "surface",
    description: "The recovered Suzanne `z` wall texture.",
    defaultRepeat: [1, 1],
    source: "BallZ archive StockRoom/Suzanne1/Podium.JPG"
  },
  {
    id: "grass-sample",
    label: "Grass Sample",
    url: "/assets/textures/suzanne1/GrassSample.jpg",
    category: "nature",
    description: "The recovered Suzanne grass sample — the `Z` wall binding, and the reference2016 floor.",
    defaultRepeat: [1, 1],
    source: "BallZ archive StockRoom/Suzanne1/GrassSample.jpg"
  },
  {
    id: "z-ring",
    label: "Z Ring",
    url: "/assets/textures/suzanne1/ZRing.png",
    category: "pattern",
    description: "The recovered Suzanne ring-pickup skin.",
    defaultRepeat: [1, 1],
    source: "BallZ archive StockRoom/Suzanne1/ZRing.png"
  },
  {
    id: "spheres",
    label: "3D Spheres",
    url: "/assets/textures/suzanne1/3D_Spheres.jpg",
    category: "science",
    description: "Recovered sphere study for normals, curvature, and lighting explanations.",
    defaultRepeat: [1, 1],
    source: "BallZ archive"
  },
  {
    id: "zack",
    label: "Zack Magician",
    url: "/assets/textures/suzanne1/Zack.jpg",
    category: "science",
    description: "Recovered Suzanne magician billboard used by the s cells and Suzanne 2 XML attachment.",
    defaultRepeat: [1, 1],
    source: "BallZ archive StockRoom/Suzanne1/Zack.jpg"
  }
] as const satisfies readonly AgentWorldTextureDescriptor[];

/**
 * Curated ids keep autocomplete; the `string & {}` arm admits runtime-imported ids
 * (media library textures registered while a store is running) without erasing the
 * literal union from tooling.
 */
export type AgentWorldTextureId = (typeof GRAPHYSX_AGENT_WORLD_TEXTURES)[number]["id"] | (string & {});

/**
 * Textures registered at runtime by the media library (agent-world-media.ts). Kept apart
 * from the curated array so the build-time asset manifest, which scrapes THAT array's
 * `url:` literals, never tries to ship a file that only exists in a local asset store.
 */
const DYNAMIC_TEXTURES: AgentWorldTextureDescriptor[] = [];

/** Replace the imported set (idempotent — a manifest refresh re-registers everything). */
export function registerAgentWorldTextures(descriptors: readonly AgentWorldTextureDescriptor[]): void {
  const curated = new Set<string>(GRAPHYSX_AGENT_WORLD_TEXTURES.map((texture) => texture.id));
  DYNAMIC_TEXTURES.length = 0;
  for (const descriptor of descriptors) {
    if (curated.has(descriptor.id)) continue; // a curated id always wins
    DYNAMIC_TEXTURES.push(descriptor);
  }
}

/** Everything usable right now: the curated vocabulary plus any store-backed imports. */
export function allAgentWorldTextures(): readonly AgentWorldTextureDescriptor[] {
  return DYNAMIC_TEXTURES.length ? [...GRAPHYSX_AGENT_WORLD_TEXTURES, ...DYNAMIC_TEXTURES] : GRAPHYSX_AGENT_WORLD_TEXTURES;
}

export function findAgentWorldTexture(id: string): AgentWorldTextureDescriptor | null {
  return (
    GRAPHYSX_AGENT_WORLD_TEXTURES.find((texture) => texture.id === id)
    ?? DYNAMIC_TEXTURES.find((texture) => texture.id === id)
    ?? null
  );
}

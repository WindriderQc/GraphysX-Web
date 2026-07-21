import { archiveSkyboxUrls, type ArchiveSkyboxUrls } from "./archive-skybox";

/**
 * Curated ids keep autocomplete; the `string & {}` arm admits runtime-imported ids
 * (media-library sky sets registered while a store is running) without erasing the
 * literal union from tooling. Same shape as `AgentWorldTextureId`.
 */
export type AgentWorldSkyId = "clearblue" | "clearnight" | "lostvalley" | "nightsky" | "skyx" | "winter" | (string & {});

type AgentWorldSkyCommon = {
  id: string;
  label: string;
  description: string;
  /** Longest cube-face edge in pixels, so scenes can avoid upscaling a low-res set. */
  resolution: number;
  /**
   * Approximate horizon colour of the set. Distance fog is tinted with this so terrain
   * fades into the sky it sits under instead of ending at a hard plane edge. Fog does not
   * fight a skybox — fog of the *wrong colour* does.
   */
  horizonColor: string;
  /** Provenance. Curated entries name the archive; imports name their datalake folder. */
  source: string;
};

/**
 * A sky set names its six faces one of two ways, and the split is load-bearing rather
 * than cosmetic.
 *
 * **Curated** sets are vendored folders under `public/assets/sky/<id>/` whose faces are
 * literally `left|right|up|down|front|back.<extension>`, so a `basePath` + `extension`
 * pair is enough — and `scripts/product-assets.mjs` scrapes exactly those `basePath:`
 * string literals out of THIS FILE to build the release manifest.
 *
 * **Imported** sets cannot use that form at all: the datalake names faces `Back.jpg` /
 * `up.bmp` / `Clouds_PosX.dds` with inconsistent case, extensions and conventions, and
 * the asset store re-slugs every filename under `/assets/files/{id}/{name}` anyway. They
 * therefore carry six explicit URLs, already in three's `+X,-X,+Y,-Y,+Z,-Z` order.
 *
 * The useful consequence: an imported sky has no `basePath` field to scrape, so it is
 * *structurally* incapable of leaking into the static release manifest — the guarantee
 * does not depend on anyone remembering to keep it out.
 */
export type AgentWorldSkyDescriptor = AgentWorldSkyCommon &
  (
    | { basePath: string; extension: string; faceUrls?: undefined }
    | { faceUrls: ArchiveSkyboxUrls; basePath?: undefined; extension?: undefined }
  );

/**
 * The recovered TV3D skybox sets, as scoped scene vocabulary.
 *
 * Per the "sky ownership is scoped" tenet these are selected *per scene* through
 * `environment.sky` — there is deliberately no global sky. Resolution is published so a
 * scene can avoid stretching a low-res set into a pixelated wall.
 */
export const GRAPHYSX_AGENT_WORLD_SKIES = [
  {
    id: "clearblue",
    label: "Clear Blue",
    basePath: "/assets/sky/clearblue",
    extension: "jpg",
    description: "Bright daylight sky with soft cloud banding. The default showroom sky.",
    resolution: 512,
    horizonColor: "#aec8dc",
    source: "GraphysX archive"
  },
  {
    id: "lostvalley",
    label: "Lost Valley",
    basePath: "/assets/sky/lostvalley",
    extension: "jpg",
    description: "Warm hazy valley horizon with distant terrain silhouettes.",
    resolution: 512,
    horizonColor: "#9dab92",
    source: "GraphysX archive"
  },
  {
    id: "skyx",
    label: "SkyX",
    basePath: "/assets/sky/skyx",
    extension: "jpg",
    description: "Stylised high-contrast cloudscape from the GraphysX demo sets.",
    resolution: 256,
    horizonColor: "#a3b8c6",
    source: "GraphysX archive"
  },
  {
    id: "winter",
    label: "Winter",
    basePath: "/assets/sky/winter",
    extension: "jpg",
    description: "Pale overcast winter dome, low contrast and cool in tone.",
    resolution: 256,
    horizonColor: "#c6d0d7",
    source: "GraphysX archive"
  },
  {
    id: "clearnight",
    label: "Clear Night",
    basePath: "/assets/sky/clearnight",
    extension: "jpg",
    description: "Deep night sky with a faint horizon glow.",
    resolution: 512,
    horizonColor: "#1d2a38",
    source: "GraphysX archive"
  },
  {
    id: "nightsky",
    label: "Night Sky (high-res)",
    basePath: "/assets/sky/nightsky",
    extension: "jpg",
    description: "Dense starfield at 1024². The highest-fidelity night set — pick this when the stars are the subject, Clear Night when they are only a backdrop.",
    resolution: 1024,
    horizonColor: "#0c1320",
    source: "GraphysX archive"
  }
] as const satisfies readonly AgentWorldSkyDescriptor[];

/**
 * Sky sets registered at runtime by the media library (agent-world-media.ts). Kept apart
 * from the curated array for the reason spelled out on `AgentWorldSkyDescriptor`: the
 * build-time asset manifest scrapes that array's `basePath:` literals, and an imported
 * set's faces live only in a local asset store.
 */
const DYNAMIC_SKIES: AgentWorldSkyDescriptor[] = [];

/** Replace the imported set (idempotent — a manifest refresh re-registers everything). */
export function registerAgentWorldSkies(descriptors: readonly AgentWorldSkyDescriptor[]): void {
  const curated = new Set<string>(GRAPHYSX_AGENT_WORLD_SKIES.map((sky) => sky.id));
  DYNAMIC_SKIES.length = 0;
  for (const descriptor of descriptors) {
    if (curated.has(descriptor.id)) continue; // a curated id always wins
    DYNAMIC_SKIES.push(descriptor);
  }
}

/** Everything selectable right now: the curated vocabulary plus any store-backed imports. */
export function allAgentWorldSkies(): readonly AgentWorldSkyDescriptor[] {
  return DYNAMIC_SKIES.length ? [...GRAPHYSX_AGENT_WORLD_SKIES, ...DYNAMIC_SKIES] : GRAPHYSX_AGENT_WORLD_SKIES;
}

export function resolveAgentWorldSky(id: string): AgentWorldSkyDescriptor | null {
  return (
    GRAPHYSX_AGENT_WORLD_SKIES.find((sky) => sky.id === id)
    ?? DYNAMIC_SKIES.find((sky) => sky.id === id)
    ?? null
  );
}

/**
 * The six face URLs for a set, in three's `+X,-X,+Y,-Y,+Z,-Z` order.
 *
 * Imports carry theirs explicitly; curated sets derive them through `archiveSkyboxUrls`,
 * which is where the TV3D left/right swap lives. Callers must not rebuild either form by
 * hand — re-deriving that order per call site is how the raw, discontinuous one creeps
 * back in, which is the drift `archive-skybox.ts` was written to stop.
 */
export function agentWorldSkyFaceUrls(descriptor: AgentWorldSkyDescriptor): ArchiveSkyboxUrls {
  return descriptor.faceUrls ?? archiveSkyboxUrls(descriptor.basePath, descriptor.extension);
}

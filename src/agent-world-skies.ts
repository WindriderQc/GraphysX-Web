export type AgentWorldSkyId = "clearblue" | "clearnight" | "lostvalley" | "nightsky" | "skyx" | "winter";

export type AgentWorldSkyDescriptor = {
  id: AgentWorldSkyId;
  label: string;
  basePath: string;
  extension: string;
  description: string;
  /** Longest cube-face edge in pixels, so scenes can avoid upscaling a low-res set. */
  resolution: number;
  /**
   * Approximate horizon colour of the set. Distance fog is tinted with this so terrain
   * fades into the sky it sits under instead of ending at a hard plane edge. Fog does not
   * fight a skybox — fog of the *wrong colour* does.
   */
  horizonColor: string;
  source: "GraphysX archive";
};

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
    extension: "bmp",
    description: "Dense starfield. Highest fidelity set, but 18 MB of uncompressed BMP — prefer Clear Night unless the stars are the subject.",
    resolution: 1024,
    horizonColor: "#0c1320",
    source: "GraphysX archive"
  }
] as const satisfies readonly AgentWorldSkyDescriptor[];

export function resolveAgentWorldSky(id: string): AgentWorldSkyDescriptor | null {
  return GRAPHYSX_AGENT_WORLD_SKIES.find((sky) => sky.id === id) ?? null;
}

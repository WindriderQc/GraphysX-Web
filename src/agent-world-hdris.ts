/** Stable ids for the small, curated HDRI vocabulary shipped with the editor. */
export type AgentWorldHdriId =
  | "studio-small-08"
  | "studio-garden"
  | "overcast-soil"
  | "lilienstein"
  | "vignaioli-night";

export type AgentWorldHdriDescriptor = {
  id: AgentWorldHdriId;
  label: string;
  url: string;
  resolution: "1K";
  description: string;
  author: string;
  sourceUrl: string;
  license: "CC0-1.0";
  licenseUrl: string;
};

/**
 * A deliberately tiny reflection-lighting library. Each entry is vendored, reviewable,
 * production-manifested, and carries its provenance beside the URL the runtime loads.
 */
export const GRAPHYSX_AGENT_WORLD_HDRIS: readonly AgentWorldHdriDescriptor[] = [
  {
    id: "studio-small-08",
    label: "Studio Small 08",
    url: "/assets/hdri/studio-small-08_1k.hdr",
    resolution: "1K",
    description: "Softbox studio reflections for product, vehicle, and material presentation.",
    author: "Sergej Majboroda / Poly Haven",
    sourceUrl: "https://polyhaven.com/a/studio_small_08",
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    id: "studio-garden",
    label: "Sunlit Courtyard",
    url: "/assets/hdri/studio-garden_1k.hdr",
    resolution: "1K",
    description: "Crisp midday sun, warm brick bounce, and leafy reflections for bright exterior presentation.",
    author: "Sergej Majboroda / Poly Haven",
    sourceUrl: "https://polyhaven.com/a/studio_garden",
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    id: "overcast-soil",
    label: "Diffuse Overcast",
    url: "/assets/hdri/overcast-soil_1k.hdr",
    resolution: "1K",
    description: "Soft low-contrast daylight for readable forms, restrained highlights, and neutral material checks.",
    author: "Sergej Majboroda / Poly Haven",
    sourceUrl: "https://polyhaven.com/a/overcast_soil",
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    id: "lilienstein",
    label: "Golden Meadow",
    url: "/assets/hdri/lilienstein_1k.hdr",
    resolution: "1K",
    description: "Warm sunset light with long natural highlights for cinematic paint and glass.",
    author: "Andreas Mischok / Poly Haven",
    sourceUrl: "https://polyhaven.com/a/lilienstein",
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    id: "vignaioli-night",
    label: "Rainy Night",
    url: "/assets/hdri/vignaioli-night_1k.hdr",
    resolution: "1K",
    description: "Warm street lamps and cool rainy ambience for high-contrast nocturnal reflections.",
    author: "Greg Zaal and Rico Cilliers / Poly Haven",
    sourceUrl: "https://polyhaven.com/a/vignaioli_night",
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
] as const;

export function resolveAgentWorldHdri(id: string): AgentWorldHdriDescriptor | null {
  return GRAPHYSX_AGENT_WORLD_HDRIS.find((candidate) => candidate.id === id) ?? null;
}

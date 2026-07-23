/** Stable ids for the small, curated HDRI vocabulary shipped with the editor. */
export type AgentWorldHdriId = "studio-small-08";

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
] as const;

export function resolveAgentWorldHdri(id: string): AgentWorldHdriDescriptor | null {
  return GRAPHYSX_AGENT_WORLD_HDRIS.find((candidate) => candidate.id === id) ?? null;
}

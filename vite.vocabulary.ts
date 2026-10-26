import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
// The runtime's own catalogue tables. They are what the browser ships, so the published
// vocabulary describes exactly the ids a built page accepts — nothing is retyped here.
import { GRAPHYSX_AGENT_WORLD_PREFABS } from "./src/agent-world-prefabs";
import { GRAPHYSX_AGENT_WORLD_SKIES } from "./src/agent-world-skies";
import { GRAPHYSX_AGENT_WORLD_HDRIS } from "./src/agent-world-hdris";
import { GRAPHYSX_AGENT_WORLD_OVERLAYS } from "./src/agent-world-overlay";
import { GRAPHYSX_AGENT_WORLD_SURFACES } from "./src/agent-world-surface";
import { GRAPHYSX_AGENT_WORLD_EMITTERS } from "./src/agent-world-particles";
import { GRAPHYSX_AGENT_WORLD_HEIGHTMAPS } from "./src/agent-world-terrain";
import { GRAPHYSX_AGENT_WORLD_FLOCKS } from "./src/agent-world-flock";
import { GRAPHYSX_AGENT_WORLD_CROWDS } from "./src/agent-world-crowd";
import { GRAPHYSX_AGENT_WORLD_FORMULAS } from "./src/agent-world-formula";
import { GRAPHYSX_AGENT_WORLD_DNA } from "./src/agent-world-dna";
import { GRAPHYSX_AGENT_WORLD_FORCE_FIELDS } from "./src/agent-world-force-field";
import { renderWorldVocabulary } from "./server/world-vocabulary.mjs";

/** Published beside the embeds: `dist/embed/world-vocabulary.json`, and `/embed/world-vocabulary.json` in dev. */
export const WORLD_VOCABULARY_PATH = "/embed/world-vocabulary.json";

/** The vocabulary JSON, rendered from the validator tables and the runtime catalogues. */
export function worldVocabularyJson(): string {
  return renderWorldVocabulary({
    descriptors: {
      prefabs: GRAPHYSX_AGENT_WORLD_PREFABS,
      skies: GRAPHYSX_AGENT_WORLD_SKIES,
      hdris: GRAPHYSX_AGENT_WORLD_HDRIS,
      overlays: GRAPHYSX_AGENT_WORLD_OVERLAYS,
      surfaces: GRAPHYSX_AGENT_WORLD_SURFACES,
      emitters: GRAPHYSX_AGENT_WORLD_EMITTERS,
      heightmaps: GRAPHYSX_AGENT_WORLD_HEIGHTMAPS,
      flocks: GRAPHYSX_AGENT_WORLD_FLOCKS,
      crowds: GRAPHYSX_AGENT_WORLD_CROWDS,
      formulas: GRAPHYSX_AGENT_WORLD_FORMULAS,
      dnas: GRAPHYSX_AGENT_WORLD_DNA,
      forceFields: GRAPHYSX_AGENT_WORLD_FORCE_FIELDS,
    },
  });
}

/**
 * Write the vocabulary with every release build (`vite build`), the way the `embed/` modules
 * ship, so AgentX Core can read `https://graphysx.specialblend.ca/embed/world-vocabulary.json`
 * and build its proposal prompt from the API as published rather than from a copy.
 */
export function worldVocabulary(): Plugin {
  return {
    name: "graphysx-world-vocabulary",
    apply: "build",
    async closeBundle() {
      const file = path.resolve(`dist${WORLD_VOCABULARY_PATH}`);
      await mkdir(path.dirname(file), { recursive: true });
      const json = worldVocabularyJson();
      await writeFile(file, json);
      this.info(`world vocabulary: ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB`);
    },
  };
}

/** The same file on the dev server, so a provider under development reads the current tables. */
export function worldVocabularyRoute(): (req: { url?: string }, res: { setHeader: (name: string, value: string) => void; end: (body: string) => void }) => boolean {
  return (req, res) => {
    if ((req.url ?? "").split("?")[0] !== WORLD_VOCABULARY_PATH) return false;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(worldVocabularyJson());
    return true;
  };
}

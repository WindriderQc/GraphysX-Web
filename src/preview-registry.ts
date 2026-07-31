// The inventory of workshop preview harnesses.
//
// Every `src/*-preview.ts` module appears here exactly once, with an honest `state`.
// `scripts/audit-previews.mjs` fails if a preview file exists that this registry does not
// list — which is how nineteen of them became unreachable and undocumented in the first
// place: nothing named them, so nothing noticed.
//
// These are restoration harnesses, not product. They are reachable at `?host=previews` in
// development only (see `main.ts`); the production bundle never includes them.

/**
 * - `mountable`  — converted to the shared bootstrap; the host can run it.
 * - `unconverted` — still a side-effect module that builds its own renderer and frame loop
 *   and queries a canvas id no HTML provides. It cannot run. Recorded here rather than
 *   quietly omitted, because "undocumented and unreachable" is the thing being fixed.
 */
export type PreviewState = "mountable" | "unconverted";

export type PreviewEntry = {
  id: string;
  label: string;
  summary: string;
  state: PreviewState;
  /** The canvas id the unconverted module still queries — what a converter needs to know. */
  legacyCanvasId?: string;
  load?: () => Promise<{ mount: (context: never) => never }>;
};

export const PREVIEWS: PreviewEntry[] = [
  {
    id: "milky-way",
    label: "Voie Lactée",
    summary: "Recovered planetary row: radii, rates and the retrograde Moon.",
    state: "mountable",
    load: () => import("./milky-way-preview") as never,
  },
  {
    id: "suzanne1-ascii",
    label: "Suzanne 1 — ASCII arena",
    summary: "Archive ASCII census rebuilt as geometry, for eyeballing the transcription.",
    state: "mountable",
    load: () => import("./suzanne1-ascii-preview") as never,
  },

  // --- not yet converted -------------------------------------------------------------
  // Each still owns a renderer and a frame loop, and queries the canvas id below. The
  // conversion recipe is in docs/PREVIEWS.md; milky-way-preview.ts is the worked example.
  { id: "ballz-slide1", label: "BallZ Slide 1", summary: "Recovered slide geometry inspection.", state: "unconverted", legacyCanvasId: "#ballz-slide1-canvas" },
  { id: "ballz-track-gallery", label: "BallZ track gallery", summary: "The recovered slide-track family, side by side.", state: "unconverted", legacyCanvasId: "#ballz-track-gallery-canvas" },
  { id: "ballz-xml-worlds", label: "BallZ XML worlds", summary: "Worlds parsed straight from recovered XML.", state: "unconverted", legacyCanvasId: "#ballz-xml-canvas" },
  { id: "ballz2011-level1", label: "BallZ 2011 Level 1", summary: "The 2011 level at recovered scale.", state: "unconverted", legacyCanvasId: "#ballz2011-level1-canvas" },
  { id: "common-archive", label: "Common room", summary: "Shared archive room inspection.", state: "unconverted", legacyCanvasId: "#common-archive-canvas" },
  { id: "cubx-actor-lineage", label: "CubX actor lineage", summary: "Actor lineage across recovered CubX generations.", state: "unconverted", legacyCanvasId: "#cubx-actor-lineage-canvas" },
  { id: "cubz-tva-animation", label: "CubZ TVA animation", summary: "Recovered TVA animation channels.", state: "unconverted", legacyCanvasId: "#cubz-tva-animation-canvas" },
  { id: "dominus-asset-gallery", label: "Dominus asset gallery", summary: "Dominus meshes and materials.", state: "unconverted" },
  { id: "dominus-port-evidence", label: "Dominus port evidence", summary: "Side-by-side port provenance.", state: "unconverted" },
  { id: "notes-manager", label: "Notes manager", summary: "Recovered notes tooling. Builds a renderer but never runs a loop.", state: "unconverted", legacyCanvasId: "#notes-manager-preview-canvas" },
  { id: "object-library-catalog", label: "Object library catalog", summary: "The recovered object library, browsable.", state: "unconverted" },
  { id: "particle-effect", label: "Particle effect", summary: "One recovered particle effect in isolation.", state: "unconverted", legacyCanvasId: "#particle-effect-canvas" },
  { id: "particle-preset-library", label: "Particle preset library", summary: "Every recovered particle preset.", state: "unconverted", legacyCanvasId: "#particle-library-canvas" },
  { id: "stockroom-xml-artifact", label: "StockRoom XML artifact", summary: "A StockRoom artifact rebuilt from XML.", state: "unconverted", legacyCanvasId: "#stockroom-xml-canvas" },
  { id: "suzanne2-ascii", label: "Suzanne 2 — ASCII arena", summary: "The second ASCII/XML arena transcription.", state: "unconverted", legacyCanvasId: "#suzanne2-preview-canvas" },
  { id: "threejs-playground", label: "Three.js playground", summary: "Scratch harness for renderer experiments.", state: "unconverted" },
  { id: "xml-scene", label: "XML scene", summary: "Generic recovered-XML scene loader.", state: "unconverted", legacyCanvasId: "#xml-scene-canvas" },
];

export const mountablePreviews = (): PreviewEntry[] => PREVIEWS.filter((entry) => entry.state === "mountable");

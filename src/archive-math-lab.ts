import type {
  AgentWorldDefinition,
  AgentWorldEntityDefinition,
  AgentWorldVector3,
  GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import type { ComposedSceneEntry } from "./browse-shelf";

/**
 * The recovered **Math Game** screen, rebuilt as a v2 scene around the `formula-field` entity.
 *
 * `agent-world-formula.ts` graduated the *system* — the molecule field and the two formulas from
 * `Scene3D/Formulas.cpp`. This module rebuilds the *screen* around it: the backdrop panel, the
 * ground grid, the three coloured axes and the sampled surface curves that
 * `race-scene.ts::buildMathLabPreview` drew, so the field is presented the way the archive
 * presented it rather than floating in a void.
 *
 * No `three` imports on purpose (type-only), which is also what lets a Node-side smoke import
 * this module directly and push the definition through the API.
 *
 * §11 governs the surface: **a playground is not a game.** This visualises a formula and lets
 * you reshape it. There is deliberately no score, no objective, no failure state.
 */

export type ArchiveMathFidelity = {
  faithful: string[];
  inferred: string[];
  deliberatelyAbsent: string[];
};

export type ArchiveMathDeviation = { code: string; note: string };

export type ArchiveMathScene = {
  id: string;
  label: string;
  summary: string;
  entityCount: number;
  provenance: {
    sourcePath: string;
    decodedVia: string;
    sourceLocation: string;
    note: string;
  };
  fidelity: ArchiveMathFidelity;
  deviations: ArchiveMathDeviation[];
};

/**
 * The recovered numbers, kept as data so the smoke asserts against the record rather than
 * against a literal retyped into the scene builder.
 */
export const ARCHIVE_MATH_CONSTANTS = {
  /** `PlaneGeometry(15, 7)` at `(0, 3.7, -8.4)`. */
  board: { width: 15, height: 7, position: [0, 3.7, -8.4] as AgentWorldVector3, tint: "#9fd7ff" },
  /** Grid lines every 2 units across ±6, drawn at y = 0.04. */
  grid: { from: -6, to: 6, step: 2, y: 0.04, color: "#2bd67b", opacity: 0.32 },
  /** The three axes, at the archive's own colours and extents. */
  axes: {
    x: { color: "#f95f4c", from: [-7, 0.12, 0] as AgentWorldVector3, to: [7, 0.12, 0] as AgentWorldVector3 },
    z: { color: "#78f0d0", from: [0, 0.12, -7] as AgentWorldVector3, to: [0, 0.12, 7] as AgentWorldVector3 },
    y: { color: "#ffe86b", from: [0, 0, 0] as AgentWorldVector3, to: [0, 6.8, 0] as AgentWorldVector3 },
  },
  /** Surface curves sampled every 1.5 in z across ±6; the z = 0 curve is highlighted. */
  curves: { from: -6, to: 6, step: 1.5, highlight: "#ffe86b", other: "#8be0ff" },
  /** The screen's own background colour and sky, from the archive preview tables. */
  background: "#060817",
  archiveSky: "nightsky",
} as const;

export const ARCHIVE_MATH_SCENES: readonly ArchiveMathScene[] = [
  {
    id: "archive-math-lab",
    label: "Math Game",
    summary: "The recovered formula screen: a molecule field riding y = ax² + bx + c, with its board, grid and axes.",
    entityCount: 30,
    provenance: {
      sourcePath: "Scene3D/MathGameScreen.cpp, Scene3D/Formulas.cpp",
      decodedVia: "src/race-scene.ts::buildMathLabPreview (legacy ?host=legacy preview)",
      sourceLocation: "GraphysX workshop; no SHA recorded in either ledger for these C++ sources",
      note: "The field itself is the `formula-field` entity type; this scene rebuilds the screen around it.",
    },
    fidelity: {
      faithful: [
        "Board geometry 15 x 7 at (0, 3.7, -8.4) with the recovered ElectronicBoard panel and #9fd7ff tint.",
        "Ground grid every 2 units across ±6 at y = 0.04, #2bd67b.",
        "Axis colours and extents: x #f95f4c ±7, z #78f0d0 ±7, y #ffe86b up to 6.8.",
        "Surface curves sampled every 1.5 in z, with the z = 0 curve highlighted in #ffe86b.",
        "Background #060817 and the archive's own sky selection.",
        "The formula, its coefficients and the molecule field, via the `formula-field` entity type.",
      ],
      inferred: [
        "Lighting. The archive preview inherited the legacy host's lights and defines none of its own.",
        "Camera framing. No camera is recorded for this screen.",
        "Line thickness — the recovered lines are GL lines; v2 draws splines, which have their own width.",
      ],
      deliberatelyAbsent: [
        "The A/B/C/M/X slider panel. That is DOM chrome, and the coefficients are already editable in the inspector and through api.update, which is the platform's answer to it.",
        "The 'Math Game' scoring loop. §11: the Math surface stays exploratory visualisation — no lives, scores, failure or fake progression.",
      ],
    },
    deviations: [
      { code: "curves-as-splines", note: "The sampled surface curves are `spline` entities; the archive drew raw GL line strips." },
      { code: "grid-subset", note: "Grid lines are drawn at the recovered 2-unit spacing but only across the recovered ±6 extent, not to the horizon." },
      { code: "sky-swapped-for-clearnight", note: "The archive selects `nightsky`, whose cube map carries a horizon silhouette and a near-black down face. Centred on the origin that reads as dark ground behind the board, so this ships `clearnight` — stars on all six faces. Set environment.sky back to `nightsky` to see the archive's own selection." },
      { code: "board-made-emissive", note: "The recovered board is a lit surface; with this scene's single key light that renders as a dark rectangle, so it carries a low emissive to read as the instrument panel it is." },
    { code: "field-size-reduced", note: "The molecule field defaults below the archive's 100 x 100 so dragging a coefficient stays responsive; the `archive-molecules` preset restores it." },
    ],
  },
];

/** Records considered for this surface and deliberately not revived, with reasons. */
export const ARCHIVE_MATH_NOT_REVIVED = [
  {
    id: "arduino-math-screen",
    source: "GraphysX/ArduinoGUI/.../MathScreen.cs",
    verdict: "not-revived",
    reason:
      "The archive's own revival note already says it is 'covered by the Math Game workbench, without exact screen composition'. Its distinguishing content is a hardware-input panel, not a 3D scene, and inventing a composition for it would be exactly the fabrication §11 forbids.",
  },
] as const;

const line = (
  id: string,
  label: string,
  points: AgentWorldVector3[],
  color: string,
  opacity: number,
): AgentWorldEntityDefinition => ({
  id,
  label,
  type: "spline",
  path: { points },
  material: { color, emissive: color, emissiveIntensity: 0.8, opacity },
  tags: ["math", "archive", "guide"],
});

/**
 * Evaluate the recovered surface for the curve sampling. Mirrors `Formulas::moleculesUpdate` and
 * the display clamp; kept local rather than imported so this module stays free of runtime imports.
 */
function surfaceY(x: number, a: number, b: number, c: number, xOffset: number): number {
  const xv = x + xOffset;
  const value = a * xv * xv + b * xv + c;
  return Math.min(7.4, Math.max(0.1, 2.2 + value * 0.34));
}

export function buildArchiveMathLab(): AgentWorldDefinition {
  const K = ARCHIVE_MATH_CONSTANTS;
  const entities: AgentWorldEntityDefinition[] = [
    { id: "math-ambient", label: "Ambient", type: "ambient-light", intensity: 0.85, material: { color: "#bcd8e6" }, tags: ["math", "lighting"] },
    {
      id: "math-key", label: "Key Light", type: "directional-light", intensity: 2.1,
      transform: { position: [-9, 15, 11] }, material: { color: "#ffe6bd" },
      // Off: the only geometry here is thin guide lines and a molecule field, and a ±38 ortho
      // shadow camera over them produces artefacts rather than depth.
      castShadow: false, tags: ["math", "lighting"],
    },
    {
      id: "math-board", label: "Instrument Board", type: "plane",
      geometry: { width: K.board.width, height: K.board.height },
      transform: { position: K.board.position },
      // Emissive because it is an instrument panel and the scene has one key light: lit only by
      // reflection it renders as a dark rectangle. Lighting is already declared inferred.
      material: {
        color: K.board.tint, roughness: 0.48, metalness: 0.24,
        emissive: "#9fd7ff", emissiveIntensity: 0.5,
        texture: { id: "electronic-board" },
      },
      tags: ["math", "archive", "board"],
    },
    {
      // The star: the recovered molecule field, as ordinary vocabulary.
      id: "math-field", label: "Molecule Field", type: "formula-field",
      transform: { position: [0, 0, 0] },
      formula: { preset: "parabola-bowl" },
      tags: ["math", "archive", "field"],
    },
  ];

  // Ground grid at the recovered spacing.
  for (let v = K.grid.from; v <= K.grid.to; v += K.grid.step) {
    entities.push(line(`math-grid-x-${v}`, "Grid Line", [[K.grid.from, K.grid.y, v], [K.grid.to, K.grid.y, v]], K.grid.color, K.grid.opacity));
    entities.push(line(`math-grid-z-${v}`, "Grid Line", [[v, K.grid.y, K.grid.from], [v, K.grid.y, K.grid.to]], K.grid.color, K.grid.opacity));
  }

  entities.push(line("math-axis-x", "X Axis", [K.axes.x.from, K.axes.x.to], K.axes.x.color, 0.8));
  entities.push(line("math-axis-z", "Z Axis", [K.axes.z.from, K.axes.z.to], K.axes.z.color, 0.8));
  entities.push(line("math-axis-y", "Y Axis", [K.axes.y.from, K.axes.y.to], K.axes.y.color, 0.86));

  // Sampled surface curves, at the field's own opening coefficients.
  const { a, b, c, xOffset } = { a: 1.5, b: -1, c: 0, xOffset: 0 };
  let curveIndex = 0;
  for (let z = K.curves.from; z <= K.curves.to + 1e-6; z += K.curves.step) {
    const points: AgentWorldVector3[] = [];
    for (let x = -6; x <= 6.001; x += 0.5) points.push([x, surfaceY(x, a, b, c, xOffset), z]);
    const highlighted = Math.abs(z) < 1e-6;
    entities.push(line(
      `math-curve-${curveIndex}`,
      highlighted ? "Surface Curve (z = 0)" : "Surface Curve",
      points,
      highlighted ? K.curves.highlight : K.curves.other,
      highlighted ? 0.92 : 0.52,
    ));
    curveIndex += 1;
  }

  return {
    schema: "graphysx.agent-world/v2",
    id: "archive-math-lab",
    label: "Math Game",
    environment: {
      background: ARCHIVE_MATH_CONSTANTS.background,
      // See the `sky-swapped-for-clearnight` deviation.
      sky: "clearnight",
      overlay: null,
      ground: { visible: false, size: 40, color: "#101d29", grid: false, gridColor: "#3f8395" },
    },
    entities,
  };
}

export function composeArchiveMathLab(api: GraphysXAgentWorldApi): void {
  api.create(buildArchiveMathLab());
}

export function listArchiveMathScenes(): readonly ArchiveMathScene[] {
  return ARCHIVE_MATH_SCENES;
}

/** Browse Scenes rows, matching the shape `archive-playgrounds.ts` and `archive-milkyway.ts` use. */
export function archiveMathBrowseRows(
  api: GraphysXAgentWorldApi,
  onOpen?: () => void,
): ComposedSceneEntry[] {
  return ARCHIVE_MATH_SCENES.map((scene) => ({
    id: scene.id,
    label: scene.label,
    summary: scene.summary,
    meta: `${scene.entityCount} entities  ·  recovered formula screen`,
    open: () => {
      composeArchiveMathLab(api);
      onOpen?.();
    },
  }));
}

import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  type Object3D,
} from "three";

/**
 * `formula-field` — the recovered GraphysX **Math Game**, graduated into v2 vocabulary.
 *
 * Source: `Scene3D/MathGameScreen.cpp` and `Scene3D/Formulas.cpp` in the GraphysX workshop,
 * reached here through the archive census entry `math-lab` ("The formula/molecule screen…
 * with presets, live A/B/C/M/X controls, and a 3D field"). The legacy web preview of it lives
 * in `race-scene.ts` (`buildMathLabPreview` / `getMathSurfaceY`) and is scene-graph code on the
 * `?host=legacy` route — reachable by neither the editor nor an agent. This module is the
 * rebuild, not a port: a field is an ordinary entity with a serialisable config, so a human
 * drags its parameters in the inspector and an agent sets them with `api.update`, both landing
 * in the same revision.
 *
 * ## What is faithful
 *
 * - **The formulas themselves**, verbatim from `Formulas::moleculesUpdate`:
 *   `PARABOLA: y = a·x² + b·x + c` and `SLOPE: y = m·x + b`, evaluated at `x + xOffset`.
 * - **The display mapping** `y = clamp(2.2 + value · 0.34, 0.1, 7.4)`, which is what keeps a
 *   steep parabola on the board instead of shooting off it.
 * - **The molecule field** from `Formulas::moleculesCreate`: a lane grid of small boxes at
 *   0.13 spacing carrying a blue→red gradient along z. The archive's field is 100×100 = 10,000
 *   molecules; that is the maximum here and the default is smaller (see the budget note).
 * - **The A/B/C/M/X parameter set and its −5..5 range**, from the recovered `MATH_CONTROLS`.
 *
 * ## What is inferred
 *
 * Materials and lighting response. The archive records a molecule as a coloured box; roughness
 * and metalness are chosen to read under this engine's PBR pipeline and are not from the source.
 *
 * ## Budget (PRODUCT_SPEC §5, "performant by intent")
 *
 * One `InstancedMesh`, so the whole field is a single draw call, and — unlike `flock` — there
 * is **no neighbour test**: every molecule's height is a pure function of its own x. That is
 * why this can afford the archive's full 10,000 where a flock caps at 240. The field only
 * rebuilds its matrices when the config actually changes, so a static field costs nothing per
 * frame; §11's "a playground is not a game" is respected — this visualises, it does not score.
 */

export type AgentWorldFormulaKind = "parabola" | "slope";

export type AgentWorldFormula = {
  preset?: AgentWorldFormulaPresetId | null;
  kind?: AgentWorldFormulaKind;
  /** Quadratic coefficient (PARABOLA only). */
  a?: number;
  /** Linear coefficient, shared by both formulas. */
  b?: number;
  /** Constant term (PARABOLA only). */
  c?: number;
  /** Slope coefficient (SLOPE only). */
  m?: number;
  /** Horizontal shift applied before evaluation, the recovered `xOffset`. */
  xOffset?: number;
  /** Molecule lanes along z. */
  lanes?: number;
  /** Molecules per lane along x. */
  perLane?: number;
  /** Spacing between molecules; the archive uses 0.13. */
  spacing?: number;
  /** Molecule cube edge; the archive uses 0.1. */
  moleculeSize?: number;
  /** Gradient ends, sampled along z. The archive runs blue → red. */
  nearColor?: string;
  farColor?: string;
};

/**
 * The fully-specified form. Written out rather than derived from {@link AgentWorldFormula} with
 * a mapped type, because `preset` legitimately stays nullable here — "no preset, just explicit
 * coefficients" is a valid resolved field — and a `Required<NonNullable<…>>` mapping cannot
 * express that one exception.
 */
export type ResolvedAgentWorldFormula = {
  preset: AgentWorldFormulaPresetId | null;
  kind: AgentWorldFormulaKind;
  a: number;
  b: number;
  c: number;
  m: number;
  xOffset: number;
  lanes: number;
  perLane: number;
  spacing: number;
  moleculeSize: number;
  nearColor: string;
  farColor: string;
};

/**
 * The archive's field is 100 lanes × 100 per lane. Allowed, but not the default: a 10,000-box
 * instanced buffer is rebuilt whenever a parameter moves, and the point of this surface is that
 * dragging A/B/C is responsive.
 */
export const AGENT_WORLD_FORMULA_MAX_MOLECULES = 10_000;

export type AgentWorldFormulaPresetId = "parabola-bowl" | "slope-ramp" | "archive-molecules";

export type AgentWorldFormulaDescriptor = {
  id: AgentWorldFormulaPresetId;
  label: string;
  description: string;
  defaults: ResolvedAgentWorldFormula;
  provenance: { sourcePath: string; note: string };
};

const BASE_FORMULA: ResolvedAgentWorldFormula = {
  preset: null,
  kind: "parabola",
  // The legacy default state of the Math Game screen, from `race-scene.ts`'s `mathParams`.
  a: 1.5,
  b: -1,
  c: 0,
  m: 1.25,
  xOffset: 0,
  lanes: 48,
  perLane: 48,
  spacing: 0.13,
  moleculeSize: 0.1,
  nearColor: "#2f6bff",
  farColor: "#ff3b2f",
};

export const GRAPHYSX_AGENT_WORLD_FORMULAS: readonly AgentWorldFormulaDescriptor[] = [
  {
    id: "parabola-bowl",
    label: "Parabola Bowl",
    description: "y = a·x² + b·x + c at the Math Game's own opening parameters — a bowl you can reshape live.",
    defaults: { ...BASE_FORMULA, preset: "parabola-bowl" },
    provenance: {
      sourcePath: "Scene3D/Formulas.cpp (FormulaType::PARABOLA)",
      note: "Formula and default coefficients faithful; field size reduced from the archive's 100×100 for responsiveness.",
    },
  },
  {
    id: "slope-ramp",
    label: "Slope Ramp",
    description: "y = m·x + b — the Math Game's second formula, a tilted plane of molecules.",
    defaults: { ...BASE_FORMULA, preset: "slope-ramp", kind: "slope", m: 1.25, b: -1 },
    provenance: {
      sourcePath: "Scene3D/Formulas.cpp (FormulaType::SLOPE)",
      note: "Formula faithful. Same reduced field size as the bowl.",
    },
  },
  {
    id: "archive-molecules",
    label: "Archive Molecules (10k)",
    description: "The field at the archive's full 100 × 100 molecules. Heavier to reshape; faithful to the source.",
    defaults: { ...BASE_FORMULA, preset: "archive-molecules", lanes: 100, perLane: 100 },
    provenance: {
      sourcePath: "Scene3D/Formulas.cpp (Formulas::moleculesCreate)",
      note: "Field size faithful: 100 lanes × 100 molecules at 0.13 spacing, blue→red along z.",
    },
  },
];

export function findAgentWorldFormulaPreset(id: AgentWorldFormulaPresetId): AgentWorldFormulaDescriptor {
  const descriptor = GRAPHYSX_AGENT_WORLD_FORMULAS.find((candidate) => candidate.id === id);
  if (!descriptor) {
    throw new Error(
      `Unknown GraphysX formula preset: ${String(id)}. Use one of ${GRAPHYSX_AGENT_WORLD_FORMULAS.map((f) => f.id).join(", ")}`,
    );
  }
  return descriptor;
}

/** Validate + clamp a `formula` field into the fully-specified form the runtime and export use. */
export function resolveAgentWorldFormula(input: AgentWorldFormula | undefined): ResolvedAgentWorldFormula {
  const source = input ?? {};
  if (source.preset !== undefined && source.preset !== null && !GRAPHYSX_AGENT_WORLD_FORMULAS.some((f) => f.id === source.preset)) {
    throw new Error(
      `Unknown formula.preset: ${String(source.preset)}. Use one of ${GRAPHYSX_AGENT_WORLD_FORMULAS.map((f) => f.id).join(", ")}`,
    );
  }
  // A preset supplies the defaults and any explicit field overrides it — the same rule flocks
  // and force fields use, so `{ preset: "slope-ramp", m: 3 }` means what it reads like.
  const base = source.preset ? findAgentWorldFormulaPreset(source.preset).defaults : BASE_FORMULA;
  if (source.kind !== undefined && source.kind !== "parabola" && source.kind !== "slope") {
    throw new Error(`Invalid formula.kind: ${String(source.kind)}. Use parabola or slope`);
  }
  const lanes = clampInt(source.lanes ?? base.lanes, 1, 200, "formula.lanes");
  const perLane = clampInt(source.perLane ?? base.perLane, 1, 200, "formula.perLane");
  if (lanes * perLane > AGENT_WORLD_FORMULA_MAX_MOLECULES) {
    throw new Error(
      `formula lanes × perLane exceeds the ${AGENT_WORLD_FORMULA_MAX_MOLECULES} molecule budget: ${lanes} × ${perLane}`,
    );
  }
  return {
    preset: source.preset ?? base.preset,
    kind: source.kind ?? base.kind,
    // The recovered controls run −5..5; clamping here means a bad agent call is corrected
    // rather than throwing, matching how the other simulation configs behave.
    a: clampNumber(source.a ?? base.a, -5, 5),
    b: clampNumber(source.b ?? base.b, -5, 5),
    c: clampNumber(source.c ?? base.c, -5, 5),
    m: clampNumber(source.m ?? base.m, -5, 5),
    xOffset: clampNumber(source.xOffset ?? base.xOffset, -5, 5),
    lanes,
    perLane,
    spacing: clampNumber(source.spacing ?? base.spacing, 0.02, 1),
    moleculeSize: clampNumber(source.moleculeSize ?? base.moleculeSize, 0.01, 1),
    nearColor: source.nearColor ?? base.nearColor,
    farColor: source.farColor ?? base.farColor,
  };
}

/**
 * Evaluate the recovered surface. Verbatim `Formulas::moleculesUpdate`, including the display
 * mapping that keeps a steep curve on the board.
 */
export function evaluateFormulaHeight(config: ResolvedAgentWorldFormula, x: number): number {
  const xv = x + config.xOffset;
  const value = config.kind === "slope" ? config.m * xv + config.b : config.a * xv * xv + config.b * xv + config.c;
  return clampNumber(2.2 + value * 0.34, 0.1, 7.4);
}

/**
 * The instanced molecule field. Mirrors `AgentWorldFlockSystem`'s shape — `object`, `configure`,
 * `dispose` — so the runtime treats it the same way, but it has no per-frame simulation: the
 * field is a pure function of its config, so it rebuilds on change and is free otherwise.
 */
export class AgentWorldFormulaField {
  readonly object = new Group();
  private config: ResolvedAgentWorldFormula;
  private mesh: InstancedMesh | null = null;
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private readonly near = new Color();
  private readonly far = new Color();

  constructor(config: ResolvedAgentWorldFormula) {
    this.config = config;
    this.object.name = "FormulaField";
    this.build();
  }

  configure(config: ResolvedAgentWorldFormula): void {
    const previous = this.config;
    this.config = config;
    // Only the counts and sizes need a new buffer; a coefficient change just rewrites matrices.
    const structural =
      previous.lanes !== config.lanes ||
      previous.perLane !== config.perLane ||
      previous.moleculeSize !== config.moleculeSize;
    if (structural || !this.mesh) this.build();
    else this.writeMatrices();
  }

  private build(): void {
    this.disposeMesh();
    const { lanes, perLane, moleculeSize } = this.config;
    const mesh = new InstancedMesh(
      new BoxGeometry(moleculeSize, moleculeSize, moleculeSize),
      new MeshStandardMaterial({ roughness: 0.4, metalness: 0.18 }),
      lanes * perLane,
    );
    mesh.name = "FormulaMolecules";
    // The field is display geometry, not scenery: it should not cast a forest of tiny shadows.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.mesh = mesh;
    this.object.add(mesh);
    this.writeMatrices();
  }

  private writeMatrices(): void {
    const mesh = this.mesh;
    if (!mesh) return;
    const { lanes, perLane, spacing, nearColor, farColor } = this.config;
    this.near.set(nearColor);
    this.far.set(farColor);
    let instance = 0;
    for (let lane = 0; lane < lanes; lane += 1) {
      // Gradient along z, exactly as `moleculesCreate` walks its lanes.
      const zRatio = lanes > 1 ? lane / (lanes - 1) : 0;
      this.color.copy(this.near).lerp(this.far, zRatio);
      const z = (lane - (lanes - 1) / 2) * spacing;
      for (let column = 0; column < perLane; column += 1) {
        const x = (column - (perLane - 1) / 2) * spacing;
        this.matrix.setPosition(x, evaluateFormulaHeight(this.config, x), z);
        mesh.setMatrixAt(instance, this.matrix);
        mesh.setColorAt(instance, this.color);
        instance += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  /** Live readout for `state()`, so an agent can see the field without re-deriving the maths. */
  describe(): { kind: AgentWorldFormulaKind; moleculeCount: number; minHeight: number; maxHeight: number } {
    const { lanes, perLane, spacing } = this.config;
    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;
    for (let column = 0; column < perLane; column += 1) {
      const x = (column - (perLane - 1) / 2) * spacing;
      const y = evaluateFormulaHeight(this.config, x);
      if (y < minHeight) minHeight = y;
      if (y > maxHeight) maxHeight = y;
    }
    return {
      kind: this.config.kind,
      moleculeCount: lanes * perLane,
      minHeight: round(minHeight),
      maxHeight: round(maxHeight),
    };
  }

  private disposeMesh(): void {
    if (!this.mesh) return;
    this.object.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
    this.mesh.dispose();
    this.mesh = null;
  }

  dispose(): void {
    this.disposeMesh();
  }
}

export function findFormulaField(object: Object3D): AgentWorldFormulaField | null {
  const field = object.userData.graphysxFormulaField;
  return field instanceof AgentWorldFormulaField ? field : null;
}

const round = (value: number): number => Number(value.toFixed(3));

const clampNumber = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

function clampInt(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`Invalid ${label}: ${String(value)}`);
  return Math.min(max, Math.max(min, Math.round(value)));
}

import {
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";

/**
 * `dna-tree` — the recovered GraphysX **Living Forest** (DNA / evolutionary entities),
 * graduated into `graphysx.agent-world/v2` vocabulary.
 *
 * This is PRODUCT_SPEC §14 phase 4's remaining item, and it closes the one line §8.1 still
 * had open: *"DNA/evolutionary entities are still legacy-only in `nature-lab.ts`."*
 *
 * ## Provenance — what the record actually contains
 *
 * The record is `src/nature-lab.ts` (`buildLivingForest` / `updateForest` /
 * `growTreeBranches` / `performForestAction`), which is itself the recovered 3D study of the
 * SBQC p5 sketches at `public/Projects/Nature of Code/s4` and `s5/forest*`, `s5/ecosystem*`
 * — cited by the census entry `living-forest` in `src/archive-content.ts` and by
 * `SBQC_INTEGRATION_CENSUS.md` in the workshop. The p5 sources themselves are **not** in
 * either repo; `nature-lab.ts` and the two census entries are the whole record reachable
 * here, and every constant below is read out of them rather than chosen.
 *
 * Four things are in that record, and it is important to be exact about which:
 *
 * 1. **A growth rule.** `growTreeBranches`: recursion to depth 6; child length ratio
 *    `0.69 + rng()·0.035`; a tilt of `±(0.36 + rng()·0.16)` about Z with alternating sign; a
 *    roll of `(i / n)·π·1.7 + (rng() − 0.5)·0.5` about +Y; and a branch count of 2 above
 *    depth 4, otherwise 3 when `rng() > 0.72` and 2 otherwise. Trunk direction
 *    `(±0.04, 0.78 + rng()·0.24, ±0.04)`.
 * 2. **A genome — and it is a *colour* genome only.** `updateForest` computes
 *    `mutation = mutationRate · (generation − 1)` and
 *    `baseHue = 0.29 + ((treeIndex·0.031 + mutation·sin(treeIndex·1.7)) mod 0.18)`.
 *    That is the entirety of "DNA" in the record: the *form* is seeded once from
 *    `seededRandom(seed + 2000)` and never mutates. The lesson text agrees — *"Leaf color
 *    mutates between generations."*
 * 3. **A mutation rate**, exposed as a slider over `0 … 0.35`, default `0.08`.
 * 4. **Selection — which does not exist.** There is no fitness function anywhere in the
 *    record. `performForestAction` for the `forest-evolution` lesson is literally
 *    `this.generation += 1`: a human presses "Next generation". The only automatic
 *    advance is a wall-clock timer in the `forest-life-cycle` lesson
 *    (`cycleSeconds`, default 17).
 *
 * ## The honest position on evolution
 *
 * Nothing here invents a fitness function, because the archive has none (PRODUCT_SPEC §11,
 * "honesty over theatre"). Selection in the record was **interactive**, and the platform's
 * answer to an interactive control is not a hidden timer — it is that `generation` is
 * ordinary scene data. A human bumps it in the inspector, an agent calls
 * `api.update(id, { dna: { generation: n + 1 } })`, and both land in the same revision. That
 * *is* the mechanism, exposed rather than simulated. See
 * {@link GRAPHYSX_AGENT_WORLD_DNA_RECORD} for the machine-readable fidelity labels.
 *
 * What this module does add — and labels `inferred` — is that mutation drives the **growth
 * genes** as well as the leaf hue. The record mutates colour only, so an "evolving tree"
 * whose silhouette never changed would be an evolutionary entity in name. The extension is
 * conservative: the same `mutationRate`, drifting the same recovered constants, and the
 * archive's colour rule is still computed verbatim on top.
 *
 * ## Determinism
 *
 * There is no `Math.random()` in this file. Every tree is a pure function of
 * `(seed, generation, mutationRate, genome, layout)` through the same `mulberry32` stream
 * `nature-lab.ts` used, so the same document always grows the same forest and export → load
 * reproduces it exactly, byte for byte in the instance buffers. Generational mutation is
 * *cumulative and deterministic*: generation 5 is derived by drifting generation 4, which was
 * derived from 3 — so lineage is real ("compare the inherited colour families") without any
 * hidden runtime state. `update(dt)` advances only growth reveal and the seasonal leaf-fall
 * cycle, both of which are periodic functions of elapsed time and neither of which mutates
 * the config.
 *
 * ## The budget (PRODUCT_SPEC §5, "performant by intent")
 *
 * This is the objection a previous agent raised when it declined to revive the Living Forest:
 * *"the recursion is the study"*, and depth 6 × 13 trees is thousands of things. It is —
 * about 192 segments and 108 leaves per tree, so ≈2500 segments and ≈1400 leaves for the
 * recovered grove. That is fatal as thousands of *entities* and unremarkable as **two
 * instanced draw calls**, which is what this is: one {@link InstancedMesh} of tapered
 * cylinders for every branch in the forest, one of icosahedra for every leaf.
 *
 * The caps are {@link AGENT_WORLD_DNA_MAX_SEGMENTS} and {@link AGENT_WORLD_DNA_MAX_LEAVES},
 * both 4000 — comfortably above the recovered grove so the archive's own composition fits
 * without truncation, and low enough that a depth-8 genome cannot allocate a 100k-instance
 * buffer. Growth is built **breadth-first**, which matters for the budget as much as for the
 * look: when the cap bites it drops the outermost twigs across the whole forest instead of
 * lopping off entire limbs, so the failure mode is a slightly sparser canopy rather than half
 * a tree. Truncation is reported in `state()` as `truncated`, never silent.
 *
 * A fully grown tree with `seasonSeconds: 0` costs **nothing** per frame: matrices are
 * rewritten only while growth or the season is actually moving.
 */

// ---------------------------------------------------------------------------------------
// Recovered constants. Every number in this block is read out of `src/nature-lab.ts`.
// ---------------------------------------------------------------------------------------

/** `growTreeBranches`: `nextDirection.multiplyScalar(0.69 + rng() * 0.035)`. */
const ARCHIVE_LENGTH_RATIO = 0.69;
/** The jitter added to that ratio per child. */
const ARCHIVE_LENGTH_JITTER = 0.035;
/** `applyAxisAngle(Z, sign * (0.36 + rng() * 0.16))`. */
const ARCHIVE_BRANCH_ANGLE = 0.36;
const ARCHIVE_BRANCH_ANGLE_JITTER = 0.16;
/** `applyAxisAngle(UP, (branchIndex / branchCount) * PI * 1.7 + (rng() - 0.5) * 0.5)`. */
const ARCHIVE_ROLL_TURNS = 1.7;
const ARCHIVE_ROLL_JITTER = 0.5;
/** `const branchCount = depth > 4 ? 2 : rng() > 0.72 ? 3 : 2` — so a 0.28 chance of a trifurcation. */
const ARCHIVE_SPLIT_CHANCE = 0.28;
/** The depth the recovered grove is grown to. */
const ARCHIVE_DEPTH = 6;
/** `const height = 0.78 + rng() * 0.24`. */
const ARCHIVE_TRUNK_LENGTH = 0.78;
const ARCHIVE_TRUNK_JITTER = 0.24;
/** `direction = ((rng() - 0.5) * 0.08, height, (rng() - 0.5) * 0.08)` — the trunk's lean. */
const ARCHIVE_TRUNK_LEAN = 0.08;
/** `13 + plantedTrees` trees, laid out `column = i % 5`, `row = floor(i / 5)`. */
const ARCHIVE_TREE_COUNT = 13;
const ARCHIVE_COLUMNS = 5;
/** `-9 + column * 4.5`, `-5 + row * 4.6`, each `+ (rng() - 0.5) * 1.2`. */
const ARCHIVE_SPACING_X = 4.5;
const ARCHIVE_SPACING_Z = 4.6;
const ARCHIVE_LAYOUT_JITTER = 1.2;
/** `baseHue = 0.29 + ((treeIndex * 0.031 + mutation * sin(treeIndex * 1.7)) % 0.18)`. */
const ARCHIVE_LEAF_HUE = 0.29;
const ARCHIVE_LEAF_HUE_SPREAD = 0.18;
const ARCHIVE_TREE_HUE_STEP = 0.031;
const ARCHIVE_HUE_TREE_FREQUENCY = 1.7;
/** `new IcosahedronGeometry(0.15, 1)`. */
const ARCHIVE_LEAF_SIZE = 0.15;
/** `LineBasicMaterial({ color: "#b8753f" })` — the branch colour. */
const ARCHIVE_BARK_COLOR = "#b8753f";
/** The `MeshStandardMaterial` on `DNALeaves`. */
const ARCHIVE_LEAF_EMISSIVE = "#12351d";
const ARCHIVE_LEAF_EMISSIVE_INTENSITY = 0.22;
/** `autumnHue = 0.03 + leaf.phase * 0.1`; saturation `0.72`; lightness `0.44 + phase * 0.16`. */
const ARCHIVE_AUTUMN_HUE = 0.03;
const ARCHIVE_AUTUMN_HUE_SPREAD = 0.1;
const ARCHIVE_LEAF_SATURATION = 0.72;
const ARCHIVE_LEAF_LIGHTNESS = 0.44;
const ARCHIVE_LEAF_LIGHTNESS_SPREAD = 0.16;
/** The `mutationRate` slider: `min 0, max 0.35, step 0.01`, default `0.08`. */
const ARCHIVE_MUTATION_DEFAULT = 0.08;
const ARCHIVE_MUTATION_MAX = 0.35;
/** The `cycleSeconds` slider: `min 8, max 28`, default `17`. */
const ARCHIVE_SEASON_SECONDS = 17;
/** `seededRandom(this.seed + 2000)` — the forest's stream offset. */
const ARCHIVE_SEED_OFFSET = 2000;

// ---------------------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------------------

/**
 * Hard cap on branch segments across the whole entity, in one `InstancedMesh`. The recovered
 * 13-tree depth-6 grove is ≈2500, so the archive's own composition fits with headroom; a
 * depth-8 genome would want ~20k and is truncated breadth-first instead.
 */
export const AGENT_WORLD_DNA_MAX_SEGMENTS = 4000;

/** Hard cap on leaves, in a second `InstancedMesh`. The recovered grove is ≈1400. */
export const AGENT_WORLD_DNA_MAX_LEAVES = 4000;

/** Generations are bounded because mutation is replayed from generation 1 on every rebuild. */
export const AGENT_WORLD_DNA_MAX_GENERATION = 64;

// ---------------------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------------------

/**
 * The heritable genes. The first eight are the recovered growth constants; the record
 * mutates none of them (see the module note), so promoting them into the genome is the one
 * substantive `inferred` step this module takes.
 */
export type AgentWorldDnaGenome = {
  /** Trunk segment length. Archive `0.78`. */
  trunkLength?: number;
  /** Child-to-parent length ratio. Archive `0.69`. */
  lengthRatio?: number;
  /** Branch tilt off the parent, radians. Archive `0.36`. */
  branchAngle?: number;
  /** Roll spread between siblings, in half-turns about +Y. Archive `1.7`. */
  rollTurns?: number;
  /** Recursion depth. Archive `6`. */
  depth?: number;
  /** Chance a node below depth 4 makes three children rather than two. Archive `0.28`. */
  splitChance?: number;
  /** Base leaf hue, 0..1. Archive `0.29` (a green). */
  leafHue?: number;
  /** Width of the per-tree hue family. Archive `0.18`. */
  leafHueSpread?: number;
  /** Leaf radius. Archive `0.15`. */
  leafSize?: number;
  /** Branch radius as a fraction of segment length. **Inferred** — the archive drew lines. */
  branchThickness?: number;
};

export type ResolvedAgentWorldDnaGenome = Required<AgentWorldDnaGenome>;

export type AgentWorldDna = {
  /** Curated preset to start from. Explicit fields win over the preset's. */
  preset?: AgentWorldDnaPresetId | null;
  /** Seed for the growth stream. The same seed + generation always grows the same forest. */
  seed?: number;
  /**
   * Which generation is expressed. **This is the selection mechanism**: the record advanced
   * it by a human pressing "Next generation", so here it is ordinary scene data that a human
   * or `api.update(id, { dna: { generation: n + 1 } })` moves. 1 is the unmutated founder.
   */
  generation?: number;
  /** Per-generation drift. Archive slider `0 … 0.35`, default `0.08`. */
  mutationRate?: number;
  /** Trees in the grove. Archive `13`. */
  trees?: number;
  /** Trees per row. Archive `5`. */
  columns?: number;
  /** Grid pitch `[x, z]`. Archive `[4.5, 4.6]`. */
  spacing?: [number, number];
  /** Random offset applied to each root. Archive `1.2`. */
  layoutJitter?: number;
  /** The genome itself. */
  genome?: AgentWorldDnaGenome;
  /** Seconds for the growth reveal to complete. `0` grows instantly. Not archive-derived. */
  growSeconds?: number;
  /** Seasonal leaf-fall period. Archive `17`. `0` disables the season (leaves stay on). */
  seasonSeconds?: number;
  /** Branch colour. Archive `#b8753f`. */
  barkColor?: string;
  /** Show leaves at all. `false` is the archive's `forest-branching` lesson. */
  leaves?: boolean;
};

export type ResolvedAgentWorldDna = {
  preset: AgentWorldDnaPresetId | null;
  seed: number;
  generation: number;
  mutationRate: number;
  trees: number;
  columns: number;
  spacing: [number, number];
  layoutJitter: number;
  genome: ResolvedAgentWorldDnaGenome;
  growSeconds: number;
  seasonSeconds: number;
  barkColor: string;
  leaves: boolean;
};

const ARCHIVE_GENOME: ResolvedAgentWorldDnaGenome = {
  trunkLength: ARCHIVE_TRUNK_LENGTH,
  lengthRatio: ARCHIVE_LENGTH_RATIO,
  branchAngle: ARCHIVE_BRANCH_ANGLE,
  rollTurns: ARCHIVE_ROLL_TURNS,
  depth: ARCHIVE_DEPTH,
  splitChance: ARCHIVE_SPLIT_CHANCE,
  leafHue: ARCHIVE_LEAF_HUE,
  leafHueSpread: ARCHIVE_LEAF_HUE_SPREAD,
  leafSize: ARCHIVE_LEAF_SIZE,
  // Inferred: the archive's branches were zero-width `LineSegments`. Expressed as a fraction
  // of segment length so it stays proportional at any trunk size.
  branchThickness: 0.06,
};

const BASE_DNA: ResolvedAgentWorldDna = {
  preset: null,
  seed: ARCHIVE_SEED_OFFSET,
  generation: 1,
  mutationRate: ARCHIVE_MUTATION_DEFAULT,
  trees: ARCHIVE_TREE_COUNT,
  columns: ARCHIVE_COLUMNS,
  spacing: [ARCHIVE_SPACING_X, ARCHIVE_SPACING_Z],
  layoutJitter: ARCHIVE_LAYOUT_JITTER,
  genome: ARCHIVE_GENOME,
  growSeconds: 6,
  seasonSeconds: ARCHIVE_SEASON_SECONDS,
  barkColor: ARCHIVE_BARK_COLOR,
  leaves: true,
};

/** Per-gene mutation bounds. Drift is `±mutationRate · (max − min) · 0.5` per generation. */
const GENE_RANGE: Record<keyof ResolvedAgentWorldDnaGenome, [number, number]> = {
  trunkLength: [0.35, 2.4],
  lengthRatio: [0.5, 0.82],
  branchAngle: [0.12, 1.1],
  rollTurns: [0.4, 3],
  // Depth is heritable but integral; it drifts far more slowly than the continuous genes
  // (see `mutateAgentWorldDnaGenome`) because one extra level roughly doubles the tree.
  depth: [2, 8],
  splitChance: [0, 1],
  leafHue: [0, 1],
  leafHueSpread: [0.01, 0.6],
  leafSize: [0.03, 0.6],
  branchThickness: [0.01, 0.2],
};

// ---------------------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------------------

export type AgentWorldDnaPresetId = "archive-grove" | "single-specimen" | "mutant-orchard";

export type AgentWorldDnaDescriptor = {
  id: AgentWorldDnaPresetId;
  label: string;
  description: string;
  defaults: ResolvedAgentWorldDna;
  provenance: { sourcePath: string; note: string };
};

export const GRAPHYSX_AGENT_WORLD_DNA: readonly AgentWorldDnaDescriptor[] = [
  {
    id: "archive-grove",
    label: "Archive Grove (13)",
    description:
      "The recovered Living Forest: thirteen depth-6 trees on the archive's 5-column grid, with the seasonal leaf fall and the generational hue drift.",
    defaults: { ...BASE_DNA, preset: "archive-grove" },
    provenance: {
      sourcePath: "src/nature-lab.ts buildLivingForest/growTreeBranches (SBQC Nature of Code s4 + s5)",
      note: "Growth rule, layout, leaf-fall motion, hue rule and mutation range faithful. Branch thickness inferred; growth genes made heritable (inferred).",
    },
  },
  {
    id: "single-specimen",
    label: "Single Specimen",
    description:
      "One tree at the origin, no season — the recursion on its own, which is what the growth lesson isolates. The genome to breed against.",
    defaults: {
      ...BASE_DNA,
      preset: "single-specimen",
      trees: 1,
      columns: 1,
      layoutJitter: 0,
      seasonSeconds: 0,
      genome: { ...ARCHIVE_GENOME, trunkLength: 1.6 },
    },
    provenance: {
      sourcePath: "src/nature-lab.ts lesson `forest-branching` (s4/{branch,tree,sketch}.js)",
      note: "Growth rule faithful; the single-tree framing and the larger trunk are composition, not record.",
    },
  },
  {
    id: "mutant-orchard",
    label: "Mutant Orchard",
    description:
      "Nine trees at the archive's maximum mutation rate — advance the generation and the canopy visibly diverges. The evolution lesson, made structural.",
    defaults: {
      ...BASE_DNA,
      preset: "mutant-orchard",
      trees: 9,
      columns: 3,
      mutationRate: ARCHIVE_MUTATION_MAX,
      genome: { ...ARCHIVE_GENOME, depth: 5, trunkLength: 1.1 },
    },
    provenance: {
      sourcePath: "src/nature-lab.ts lesson `forest-evolution` (s5/{dna,forest,tree,leaf}.js)",
      note: "Mutation rate is the archive slider's maximum (0.35). Depth 5 and the 3x3 layout are composition. Structural mutation is inferred — the record mutates leaf colour only.",
    },
  },
];

// ---------------------------------------------------------------------------------------
// The fidelity record (PRODUCT_SPEC §11)
// ---------------------------------------------------------------------------------------

export type AgentWorldDnaFidelity = "faithful" | "inferred" | "deliberatelyAbsent";

export type AgentWorldDnaDeviation = {
  code: string;
  fidelity: AgentWorldDnaFidelity;
  detail: string;
};

/**
 * Machine-readable provenance for the whole entity type. `faithful` entries are things read
 * out of the record; `inferred` entries are decisions this module made; `deliberatelyAbsent`
 * entries are things the record contains, or that a reader might expect, which are **not**
 * shipped and why.
 */
export const GRAPHYSX_AGENT_WORLD_DNA_RECORD: {
  sources: readonly string[];
  deviations: readonly AgentWorldDnaDeviation[];
} = {
  sources: [
    "src/nature-lab.ts (buildLivingForest, updateForest, growTreeBranches, performForestAction, seededRandom)",
    "src/archive-content.ts census entry `living-forest`",
    "GraphysX workshop SBQC_INTEGRATION_CENSUS.md (Living Forest row)",
    "cited upstream, not present in either repo: SBQC public/Projects/Nature of Code/s4, s5/forest*, s5/ecosystem*",
  ],
  deviations: [
    {
      code: "growth-rule",
      fidelity: "faithful",
      detail:
        "Depth 6, length ratio 0.69 + rng()*0.035, tilt +/-(0.36 + rng()*0.16) about Z with alternating sign, roll (i/n)*PI*1.7 + (rng()-0.5)*0.5 about +Y, 2 children above depth 4 else 3 at p=0.28 — verbatim from growTreeBranches.",
    },
    {
      code: "leaf-hue-rule",
      fidelity: "faithful",
      detail:
        "baseHue = leafHue + ((treeIndex*0.031 + mutationRate*(generation-1)*sin(treeIndex*1.7)) % leafHueSpread), autumn lerp to 0.03 + phase*0.1, saturation 0.72, lightness 0.44 + phase*0.16 — verbatim from updateForest, including the archive's signed modulo.",
    },
    {
      code: "leaf-fall-motion",
      fidelity: "faithful",
      detail:
        "localFall, the y drop of fallSpeed*5.4 with a floor at 0.16, the sin/cos drift, the 1 - localFall*0.48 shrink and the (localFall*3.2, phase*2PI, localFall*2.1) tumble — verbatim from updateForest.",
    },
    {
      code: "grove-layout",
      fidelity: "faithful",
      detail: "13 trees, 5 columns, 4.5 x 4.6 pitch, +/-0.6 jitter, centred on the entity origin.",
    },
    {
      code: "mutation-range",
      fidelity: "faithful",
      detail: "mutationRate 0 .. 0.35 default 0.08, and seasonSeconds default 17 — the two recovered sliders.",
    },
    {
      code: "prng",
      fidelity: "faithful",
      detail: "The mulberry32 stream from nature-lab's seededRandom, unchanged. No Math.random() anywhere in this module.",
    },
    {
      code: "structural-mutation",
      fidelity: "inferred",
      detail:
        "The record mutates LEAF COLOUR ONLY; the form is seeded once and never changes. Growth genes are made heritable here so an 'evolving tree' actually changes shape. Same mutationRate, same generation counter, and the archive colour rule still applies on top. Set mutationRate to 0 for record-exact behaviour.",
    },
    {
      code: "branch-thickness",
      fidelity: "inferred",
      detail:
        "The archive drew branches as zero-width LineSegments. Tapered cylinders at 0.06 of segment length are chosen to read under this engine's PBR lighting; nothing in the record specifies a radius.",
    },
    {
      code: "per-tree-rng-stream",
      fidelity: "inferred",
      detail:
        "The archive drew every tree from ONE shared stream, so tree N's shape depended on how many siblings preceded it. Each tree here gets seed + 2000 + treeIndex*9973, which is required because breadth-first construction and the segment budget both change consumption order — and it means a tree's form no longer depends on its neighbours.",
    },
    {
      code: "breadth-first-build",
      fidelity: "inferred",
      detail:
        "The archive recursed depth-first and revealed growth by setDrawRange over that order, so one whole limb reached its tips before the next started. Segments are built breadth-first here so growth reveals outward from the trunk and the budget truncates outermost twigs across the forest rather than removing entire limbs.",
    },
    {
      code: "leaf-geometry-detail",
      fidelity: "inferred",
      detail: "IcosahedronGeometry(leafSize, 1) reduced to detail 0 — 20 faces instead of 80 at up to 4000 instances. Invisible at a 0.15 radius.",
    },
    {
      code: "fitness-function",
      fidelity: "deliberatelyAbsent",
      detail:
        "There is no fitness function in the record. performForestAction for the forest-evolution lesson is `this.generation += 1` — a human pressed 'Next generation'. Selection is exposed as the mechanism (generation is scene data, moved by the inspector or api.update) rather than replaced by an invented automatic fitness nobody recorded.",
    },
    {
      code: "life-cycle-timer",
      fidelity: "deliberatelyAbsent",
      detail:
        "The forest-life-cycle lesson advanced the generation on a cycleSeconds timer. Not carried: a timer that mutates the generation makes it runtime state that does not survive export -> load, which is the test for scene data. The seasonal leaf fall IS carried, because it is a periodic function of elapsed time and mutates nothing.",
    },
    {
      code: "planting",
      fidelity: "deliberatelyAbsent",
      detail: "The `plantedTrees` action (up to 5 extra trees) is not a separate mechanism here: `trees` is an ordinary config field an agent or the inspector raises.",
    },
    {
      code: "ground-and-ring",
      fidelity: "deliberatelyAbsent",
      detail:
        "buildLivingForest also created a displaced ground plane and a turquoise grove ring. Both are scenery, not the entity: a scene composes them from `terrain` and `torus`, which is what makes this a reusable entity rather than a diorama.",
    },
  ],
};

// ---------------------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------------------

export function findAgentWorldDnaPreset(id: AgentWorldDnaPresetId): AgentWorldDnaDescriptor {
  const descriptor = GRAPHYSX_AGENT_WORLD_DNA.find((candidate) => candidate.id === id);
  if (!descriptor) {
    throw new Error(
      `Unknown GraphysX dna preset: ${String(id)}. Use one of ${GRAPHYSX_AGENT_WORLD_DNA.map((d) => d.id).join(", ")}`,
    );
  }
  return descriptor;
}

/**
 * Validate + clamp a `dna` field into the fully-specified form the runtime and export use.
 * Clamps rather than throws for out-of-range numbers — a bad agent call is corrected, matching
 * `resolveAgentWorldFormula` and `resolveAgentWorldFlock`. Only genuinely unresolvable input
 * (an unknown preset, a non-finite count) throws.
 *
 * `base` lets the patch path merge over the current configuration, so
 * `api.update(id, { dna: { generation: 4 } })` keeps the genome it was already expressing.
 */
export function resolveAgentWorldDna(
  source?: AgentWorldDna,
  base: ResolvedAgentWorldDna = BASE_DNA,
): ResolvedAgentWorldDna {
  const input = source ?? {};
  if (input.preset != null && !GRAPHYSX_AGENT_WORLD_DNA.some((preset) => preset.id === input.preset)) {
    throw new Error(
      `Unknown dna.preset: ${String(input.preset)}. Use one of ${GRAPHYSX_AGENT_WORLD_DNA.map((d) => d.id).join(", ")}`,
    );
  }
  // A preset replaces the base wholesale; explicit fields then win over the preset. Same rule
  // as flocks and formula fields, so `{ preset: "mutant-orchard", trees: 4 }` reads as it means.
  const start = input.preset != null ? findAgentWorldDnaPreset(input.preset).defaults : base;
  const genomeSource = input.genome ?? {};
  const genome: ResolvedAgentWorldDnaGenome = {
    trunkLength: clampGene(genomeSource.trunkLength ?? start.genome.trunkLength, "trunkLength"),
    lengthRatio: clampGene(genomeSource.lengthRatio ?? start.genome.lengthRatio, "lengthRatio"),
    branchAngle: clampGene(genomeSource.branchAngle ?? start.genome.branchAngle, "branchAngle"),
    rollTurns: clampGene(genomeSource.rollTurns ?? start.genome.rollTurns, "rollTurns"),
    depth: Math.round(clampGene(genomeSource.depth ?? start.genome.depth, "depth")),
    splitChance: clampGene(genomeSource.splitChance ?? start.genome.splitChance, "splitChance"),
    leafHue: clampGene(genomeSource.leafHue ?? start.genome.leafHue, "leafHue"),
    leafHueSpread: clampGene(genomeSource.leafHueSpread ?? start.genome.leafHueSpread, "leafHueSpread"),
    leafSize: clampGene(genomeSource.leafSize ?? start.genome.leafSize, "leafSize"),
    branchThickness: clampGene(genomeSource.branchThickness ?? start.genome.branchThickness, "branchThickness"),
  };
  const spacingSource = input.spacing ?? start.spacing;
  return {
    preset: input.preset !== undefined ? input.preset : start.preset,
    seed: clampInt(input.seed ?? start.seed, 0, 0xffffffff, "dna.seed"),
    generation: clampInt(input.generation ?? start.generation, 1, AGENT_WORLD_DNA_MAX_GENERATION, "dna.generation"),
    mutationRate: clampNumber(input.mutationRate ?? start.mutationRate, 0, ARCHIVE_MUTATION_MAX),
    trees: clampInt(input.trees ?? start.trees, 1, 64, "dna.trees"),
    columns: clampInt(input.columns ?? start.columns, 1, 16, "dna.columns"),
    spacing: [clampNumber(spacingSource[0], 0.1, 40), clampNumber(spacingSource[1], 0.1, 40)],
    layoutJitter: clampNumber(input.layoutJitter ?? start.layoutJitter, 0, 20),
    genome,
    growSeconds: clampNumber(input.growSeconds ?? start.growSeconds, 0, 120),
    seasonSeconds: clampNumber(input.seasonSeconds ?? start.seasonSeconds, 0, 240),
    barkColor: input.barkColor ?? start.barkColor,
    leaves: input.leaves ?? start.leaves,
  };
}

// ---------------------------------------------------------------------------------------
// Genetics
// ---------------------------------------------------------------------------------------

/**
 * The expressed genome at `generation`, derived by replaying mutation from the founder.
 *
 * Deterministic and cumulative: generation 5 is generation 4 drifted, so lineage is real —
 * two neighbouring generations resemble each other, which is exactly what the archive lesson
 * asked a viewer to compare. Generation 1 is the founder and is returned untouched, so
 * `mutationRate: 0` or `generation: 1` both reproduce the recovered form exactly.
 */
export function mutateAgentWorldDnaGenome(
  founder: ResolvedAgentWorldDnaGenome,
  seed: number,
  generation: number,
  mutationRate: number,
): ResolvedAgentWorldDnaGenome {
  let expressed: ResolvedAgentWorldDnaGenome = { ...founder };
  if (mutationRate <= 0) return expressed;
  for (let step = 2; step <= generation; step += 1) {
    // One stream per generation, seeded from the founder seed, so generation N is reproducible
    // without having to have observed generations 2..N-1 in this session.
    const random = seededRandom(seed + step * 7919);
    const next: ResolvedAgentWorldDnaGenome = { ...expressed };
    for (const key of GENE_KEYS) {
      const [min, max] = GENE_RANGE[key];
      const drift = (random() * 2 - 1) * mutationRate * (max - min) * 0.5;
      if (key === "depth") {
        // One extra level roughly doubles the segment count, so depth drifts on its own,
        // much slower clock: it moves by at most one level and only when the roll clears
        // the mutation rate. Without this a mutating orchard hits the budget in two steps.
        const roll = random();
        if (roll < mutationRate * 0.5) next.depth = clampGene(expressed.depth + (drift > 0 ? 1 : -1), "depth");
        continue;
      }
      next[key] = clampGene(expressed[key] + drift, key);
    }
    expressed = next;
  }
  return expressed;
}

/**
 * The archive's leaf hue for a tree, verbatim from `updateForest`. The signed modulo (the
 * `%` can return a negative when `mutation · sin(...)` dominates) is the record's own
 * behaviour and is preserved rather than corrected — `Color.setHSL` wraps it anyway.
 */
export function agentWorldDnaLeafHue(
  genome: ResolvedAgentWorldDnaGenome,
  mutationRate: number,
  generation: number,
  treeIndex: number,
): number {
  const mutation = mutationRate * (generation - 1);
  return (
    genome.leafHue +
    ((treeIndex * ARCHIVE_TREE_HUE_STEP + mutation * Math.sin(treeIndex * ARCHIVE_HUE_TREE_FREQUENCY)) %
      genome.leafHueSpread)
  );
}

// ---------------------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------------------

/** One branch segment, in entity-local space. */
export type AgentWorldDnaSegment = {
  start: Vector3;
  end: Vector3;
  /** 0 at the trunk. Used for taper and for the breadth-first growth reveal. */
  level: number;
};

/** One leaf, carrying the archive's per-leaf fall parameters. */
export type AgentWorldDnaLeaf = {
  base: Vector3;
  /** `rng()` — drives fall delay, tumble, size and lightness. */
  phase: number;
  /** `0.35 + rng() * 0.75`. */
  fallSpeed: number;
  /** `0.18 + rng() * 0.5`. */
  drift: number;
  treeIndex: number;
};

export type AgentWorldDnaForm = {
  segments: AgentWorldDnaSegment[];
  leaves: AgentWorldDnaLeaf[];
  /** True when either budget cap stopped growth short of the genome's full depth. */
  truncated: boolean;
};

const UP = new Vector3(0, 1, 0);
const AXIS_Z = new Vector3(0, 0, 1);

/**
 * Grow the whole forest from a resolved config. A pure function: same config in, identical
 * form out, always — which is what makes export → load reproduce the tree exactly.
 *
 * Built breadth-first over a queue rather than by recursion, for the two reasons in the
 * module note: the growth reveal then runs outward from the trunk, and the budget truncates
 * the outermost twigs across the whole forest instead of amputating limbs.
 */
export function growAgentWorldDnaForest(config: ResolvedAgentWorldDna): AgentWorldDnaForm {
  const expressed = mutateAgentWorldDnaGenome(config.genome, config.seed, config.generation, config.mutationRate);
  const segments: AgentWorldDnaSegment[] = [];
  const leaves: AgentWorldDnaLeaf[] = [];
  let truncated = false;

  type Node = { start: Vector3; direction: Vector3; depth: number; level: number; treeIndex: number };
  const rows = Math.ceil(config.trees / config.columns);
  const originX = ((config.columns - 1) * config.spacing[0]) / 2;
  const originZ = ((rows - 1) * config.spacing[1]) / 2;

  // Level-by-level: the queue holds every node at one depth, and is drained into the next.
  let frontier: Node[] = [];
  const streams: Array<() => number> = [];
  for (let treeIndex = 0; treeIndex < config.trees; treeIndex += 1) {
    // Deviation `per-tree-rng-stream`: one stream each, so a tree's form does not depend on
    // how many siblings were grown before it.
    const random = seededRandom(config.seed + ARCHIVE_SEED_OFFSET + treeIndex * 9973);
    streams.push(random);
    const column = treeIndex % config.columns;
    const row = Math.floor(treeIndex / config.columns);
    const start = new Vector3(
      column * config.spacing[0] - originX + (random() - 0.5) * config.layoutJitter,
      0,
      row * config.spacing[1] - originZ + (random() - 0.5) * config.layoutJitter,
    );
    // `const height = 0.78 + rng() * 0.24`, scaled by the trunkLength gene.
    const height = expressed.trunkLength * (1 + (random() * ARCHIVE_TRUNK_JITTER) / ARCHIVE_TRUNK_LENGTH);
    const direction = new Vector3(
      (random() - 0.5) * ARCHIVE_TRUNK_LEAN,
      height,
      (random() - 0.5) * ARCHIVE_TRUNK_LEAN,
    );
    frontier.push({ start, direction, depth: expressed.depth, level: 0, treeIndex });
  }

  while (frontier.length) {
    const next: Node[] = [];
    for (const node of frontier) {
      if (segments.length >= AGENT_WORLD_DNA_MAX_SEGMENTS) {
        truncated = true;
        break;
      }
      const end = node.start.clone().add(node.direction);
      segments.push({ start: node.start, end, level: node.level });
      const random = streams[node.treeIndex];
      if (node.depth <= 0) {
        if (!config.leaves) continue;
        if (leaves.length >= AGENT_WORLD_DNA_MAX_LEAVES) {
          truncated = true;
          continue;
        }
        // `leafData.push({ base: end, phase: rng(), fallSpeed: 0.35 + rng()*0.75, drift: 0.18 + rng()*0.5 })`
        leaves.push({
          base: end,
          phase: random(),
          fallSpeed: 0.35 + random() * 0.75,
          drift: 0.18 + random() * 0.5,
          treeIndex: node.treeIndex,
        });
        continue;
      }
      // `depth > 4 ? 2 : rng() > 0.72 ? 3 : 2`, with 0.72 generalised to the splitChance gene.
      const branchCount = node.depth > 4 ? 2 : random() < expressed.splitChance ? 3 : 2;
      for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
        const sign = branchIndex % 2 === 0 ? -1 : 1;
        const direction = node.direction
          .clone()
          .multiplyScalar(expressed.lengthRatio + random() * ARCHIVE_LENGTH_JITTER);
        direction.applyAxisAngle(
          AXIS_Z,
          sign * (expressed.branchAngle + random() * ARCHIVE_BRANCH_ANGLE_JITTER),
        );
        direction.applyAxisAngle(
          UP,
          (branchIndex / branchCount) * Math.PI * expressed.rollTurns + (random() - 0.5) * ARCHIVE_ROLL_JITTER,
        );
        next.push({
          start: end,
          direction,
          depth: node.depth - 1,
          level: node.level + 1,
          treeIndex: node.treeIndex,
        });
      }
    }
    if (segments.length >= AGENT_WORLD_DNA_MAX_SEGMENTS && next.length) truncated = true;
    frontier = segments.length >= AGENT_WORLD_DNA_MAX_SEGMENTS ? [] : next;
  }

  return { segments, leaves, truncated };
}

// ---------------------------------------------------------------------------------------
// The system
// ---------------------------------------------------------------------------------------

export type AgentWorldDnaReadout = {
  generation: number;
  treeCount: number;
  segmentCount: number;
  leafCount: number;
  /** True when a budget cap stopped growth short. Never silent. */
  truncated: boolean;
  /** 0..1 growth reveal — makes a frozen entity distinguishable from a growing one. */
  growth: number;
  /** 0..1 through the seasonal fall cycle, or 0 when the season is off. */
  season: number;
  /** The genome actually being expressed after `generation - 1` rounds of mutation. */
  expressedGenome: ResolvedAgentWorldDnaGenome;
  /** The archive hue rule evaluated per tree, so an agent can read the colour families. */
  leafHues: number[];
  budget: { maxSegments: number; maxLeaves: number };
};

/**
 * The instanced forest. Same shape as `AgentWorldFlockSystem` and `AgentWorldFormulaField` —
 * `object` / `configure` / `dispose` — plus `update(dt)`, which the runtime calls inside
 * `updateSimulation` so growth and the season inherit `pause` / `step` for free.
 */
export class AgentWorldDnaSystem {
  readonly object = new Group();
  private config: ResolvedAgentWorldDna;
  private form: AgentWorldDnaForm;
  private expressed: ResolvedAgentWorldDnaGenome;
  private branches: InstancedMesh | null = null;
  private leafMesh: InstancedMesh | null = null;
  private elapsed = 0;
  /** Last written reveal / season, so a settled tree writes nothing per frame. */
  private lastGrowth = -1;
  private lastSeason = -1;
  private readonly dummy = new Object3D();
  private readonly matrix = new Matrix4();
  private readonly quaternion = new Quaternion();
  private readonly scratch = { direction: new Vector3(), mid: new Vector3(), scale: new Vector3() };
  private readonly color = new Color();
  private hues: number[] = [];

  constructor(config: ResolvedAgentWorldDna) {
    this.config = config;
    this.form = growAgentWorldDnaForest(config);
    this.expressed = mutateAgentWorldDnaGenome(config.genome, config.seed, config.generation, config.mutationRate);
    this.object.name = "GraphysXDnaTree";
    this.build();
  }

  get segmentCount(): number {
    return this.form.segments.length;
  }

  get leafCount(): number {
    return this.form.leaves.length;
  }

  get truncated(): boolean {
    return this.form.truncated;
  }

  /**
   * Reconfigure in place. A genome/seed/generation change regrows the form — which is the
   * point of the entity, and is why `api.update(id, { dna: { generation: n + 1 } })` is the
   * evolution mechanism rather than a hidden fitness loop.
   */
  configure(config: ResolvedAgentWorldDna): void {
    this.config = config;
    this.form = growAgentWorldDnaForest(config);
    this.expressed = mutateAgentWorldDnaGenome(config.genome, config.seed, config.generation, config.mutationRate);
    this.build();
  }

  private build(): void {
    this.disposeParts();
    const { segments, leaves } = this.form;
    this.hues = [];
    for (let treeIndex = 0; treeIndex < this.config.trees; treeIndex += 1) {
      this.hues.push(agentWorldDnaLeafHue(this.expressed, this.config.mutationRate, this.config.generation, treeIndex));
    }

    // One draw call for every branch in the forest. A unit cylinder along +Y, scaled to each
    // segment's length and tapered by level — the archive's LineSegments given a radius.
    const branches = new InstancedMesh(
      new CylinderGeometry(1, 1, 1, 5, 1, true),
      new MeshStandardMaterial({ color: new Color(this.config.barkColor), roughness: 0.86, metalness: 0.02 }),
      Math.max(1, segments.length),
    );
    branches.name = "GraphysXDnaBranches";
    // Bark colour comes from the `dna` field, not the entity `material` field.
    branches.userData.graphysxMaterialLocked = true;
    branches.castShadow = true;
    branches.receiveShadow = true;
    branches.instanceMatrix.setUsage(DynamicDrawUsage);
    branches.frustumCulled = false;
    this.branches = branches;
    this.object.add(branches);
    this.writeBranchMatrices();

    if (this.config.leaves && leaves.length) {
      // Deviation `leaf-geometry-detail`: detail 0, not the archive's 1, at up to 4000 instances.
      const leafMesh = new InstancedMesh(
        new IcosahedronGeometry(this.expressed.leafSize, 0),
        new MeshStandardMaterial({
          emissive: new Color(ARCHIVE_LEAF_EMISSIVE),
          emissiveIntensity: ARCHIVE_LEAF_EMISSIVE_INTENSITY,
          roughness: 0.72,
          metalness: 0.02,
        }),
        leaves.length,
      );
      leafMesh.name = "GraphysXDnaLeaves";
      leafMesh.userData.graphysxMaterialLocked = true;
      leafMesh.castShadow = true;
      leafMesh.receiveShadow = false;
      leafMesh.instanceMatrix.setUsage(DynamicDrawUsage);
      leafMesh.frustumCulled = false;
      this.leafMesh = leafMesh;
      this.object.add(leafMesh);
    }

    this.elapsed = 0;
    this.lastGrowth = -1;
    this.lastSeason = -1;
    // Write frame zero immediately so a paused world still shows the tree it configured.
    this.apply();
  }

  /** Branch matrices are a pure function of the form, so they are written once per rebuild. */
  private writeBranchMatrices(): void {
    const mesh = this.branches;
    if (!mesh) return;
    const { segments } = this.form;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      this.scratch.direction.copy(segment.end).sub(segment.start);
      const length = this.scratch.direction.length() || 1e-6;
      this.scratch.mid.copy(segment.start).addScaledVector(this.scratch.direction, 0.5);
      this.quaternion.setFromUnitVectors(UP, this.scratch.direction.divideScalar(length));
      // Taper: each level is thinner in proportion to how much shorter it is.
      const radius = length * this.expressed.branchThickness * Math.pow(0.82, segment.level);
      this.scratch.scale.set(radius, length, radius);
      this.matrix.compose(this.scratch.mid, this.quaternion, this.scratch.scale);
      mesh.setMatrixAt(index, this.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  /**
   * Advance growth and the season. Both are periodic functions of `elapsed` and neither
   * touches the config, so pausing freezes them and `step(dt)` advances one deterministic
   * slice — and a fully-grown tree with `seasonSeconds: 0` writes nothing at all.
   */
  update(deltaSeconds: number): void {
    if (!(deltaSeconds > 0)) return;
    this.elapsed += deltaSeconds;
    this.apply();
  }

  private get growthProgress(): number {
    if (this.config.growSeconds <= 0) return 1;
    return smoothstep(0, 1, Math.min(1, this.elapsed / this.config.growSeconds));
  }

  private get seasonProgress(): number {
    const { seasonSeconds, growSeconds } = this.config;
    if (seasonSeconds <= 0) return 0;
    const since = this.elapsed - growSeconds;
    if (since <= 0) return 0;
    return (since % seasonSeconds) / seasonSeconds;
  }

  private apply(): void {
    const growth = this.growthProgress;
    const season = this.seasonProgress;
    if (growth === this.lastGrowth && season === this.lastSeason) return;
    this.lastGrowth = growth;
    this.lastSeason = season;
    // The instanced equivalent of the archive's `setDrawRange` reveal: shrinking `count`
    // costs nothing and, because segments are level-ordered, grows the forest outward.
    if (this.branches) this.branches.count = Math.max(1, Math.ceil(this.form.segments.length * growth));
    this.writeLeaves(growth, season);
  }

  private writeLeaves(growth: number, season: number): void {
    const mesh = this.leafMesh;
    if (!mesh) return;
    // The archive revealed leaves over the second half of growth.
    const visibility = smoothstep(0.55, 1, growth);
    for (let index = 0; index < this.form.leaves.length; index += 1) {
      const leaf = this.form.leaves[index];
      // Verbatim from `updateForest`.
      const localFall = clamp01((season - leaf.phase * 0.28) / Math.max(0.15, 1 - leaf.phase * 0.28));
      this.dummy.position.copy(leaf.base);
      this.dummy.position.y = Math.max(0.16, leaf.base.y - localFall * leaf.fallSpeed * 5.4);
      this.dummy.position.x += Math.sin(localFall * 9 + leaf.phase * 12) * leaf.drift * localFall;
      this.dummy.position.z += Math.cos(localFall * 7 + leaf.phase * 9) * leaf.drift * localFall;
      const scale = visibility * (1 - localFall * 0.48) * (0.82 + leaf.phase * 0.42);
      this.dummy.scale.setScalar(Math.max(0.001, scale));
      this.dummy.rotation.set(localFall * 3.2, leaf.phase * Math.PI * 2, localFall * 2.1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(index, this.dummy.matrix);
      const baseHue = this.hues[leaf.treeIndex] ?? this.expressed.leafHue;
      const autumnHue = ARCHIVE_AUTUMN_HUE + leaf.phase * ARCHIVE_AUTUMN_HUE_SPREAD;
      this.color.setHSL(
        baseHue + (autumnHue - baseHue) * season,
        ARCHIVE_LEAF_SATURATION,
        ARCHIVE_LEAF_LIGHTNESS + leaf.phase * ARCHIVE_LEAF_LIGHTNESS_SPREAD,
      );
      mesh.setColorAt(index, this.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  /**
   * Live readout for `state()`. Reports the *expressed* genome rather than the founder, so an
   * agent can see what evolution actually produced without replaying the mutation itself —
   * the same reason `flock` reports `averageSpeed` instead of only its config.
   */
  describe(): AgentWorldDnaReadout {
    return {
      generation: this.config.generation,
      treeCount: this.config.trees,
      segmentCount: this.form.segments.length,
      leafCount: this.form.leaves.length,
      truncated: this.form.truncated,
      growth: round(this.growthProgress),
      season: round(this.seasonProgress),
      expressedGenome: {
        trunkLength: round(this.expressed.trunkLength),
        lengthRatio: round(this.expressed.lengthRatio),
        branchAngle: round(this.expressed.branchAngle),
        rollTurns: round(this.expressed.rollTurns),
        depth: this.expressed.depth,
        splitChance: round(this.expressed.splitChance),
        leafHue: round(this.expressed.leafHue),
        leafHueSpread: round(this.expressed.leafHueSpread),
        leafSize: round(this.expressed.leafSize),
        branchThickness: round(this.expressed.branchThickness),
      },
      leafHues: this.hues.map(round),
      budget: { maxSegments: AGENT_WORLD_DNA_MAX_SEGMENTS, maxLeaves: AGENT_WORLD_DNA_MAX_LEAVES },
    };
  }

  private disposeParts(): void {
    if (this.branches) {
      this.branches.removeFromParent();
      this.branches.geometry.dispose();
      (this.branches.material as MeshStandardMaterial).dispose();
      this.branches.dispose();
      this.branches = null;
    }
    if (this.leafMesh) {
      this.leafMesh.removeFromParent();
      this.leafMesh.geometry.dispose();
      (this.leafMesh.material as MeshStandardMaterial).dispose();
      this.leafMesh.dispose();
      this.leafMesh = null;
    }
  }

  dispose(): void {
    this.disposeParts();
  }
}

/** Find the DNA system hanging off an entity object, if it is a `dna-tree` entity. */
export function findDnaSystem(object: Object3D): AgentWorldDnaSystem | null {
  const system = object.userData.graphysxDnaSystem;
  return system instanceof AgentWorldDnaSystem ? system : null;
}

// ---------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------

const GENE_KEYS = Object.keys(GENE_RANGE) as Array<keyof ResolvedAgentWorldDnaGenome>;

/** `nature-lab.ts`'s `seededRandom` (mulberry32), unchanged. No `Math.random()` in this file. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number): number => Number(value.toFixed(4));

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp01((value - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const clampNumber = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

function clampGene(value: number, key: keyof ResolvedAgentWorldDnaGenome): number {
  const [min, max] = GENE_RANGE[key];
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function clampInt(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`Invalid ${label}: ${String(value)}`);
  return Math.min(max, Math.max(min, Math.round(value)));
}

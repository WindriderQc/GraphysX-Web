// The living island: Mesa plus a small Living Forest, a flock of birds and a wind field, and
// the rules that let agents take part in them.
//
// Everything alive here is existing GraphysX vocabulary (`dna-tree`, `flock`, `force-field`);
// this module only adds what a host owns: who may gather, sow or advance a tree, the birds'
// shyness of agents and thrown blocks, the birds' lives, and what an agent observes. No fitness
// function exists anywhere: a tree's lineage continues only when an agent gathers its seed and
// sows it, so the agents' choices are the only selection pressure on trees. Birds need no agent:
// they eat, lay and die on their own, and whoever survives passes on its genes
// (docs/LIVING_ISLAND.md).
//
// Like island-world.ts, nothing here renders or touches Node APIs.

import type { Vector3 } from "three";
import {
  growAgentWorldDnaForest,
  mutateAgentWorldDnaGenome,
  resolveAgentWorldDna,
  type AgentWorldDnaGenome,
  type ResolvedAgentWorldDnaGenome,
} from "../src/agent-world-dna";
import { findFlockSystem, type AgentWorldFlockMembers, type AgentWorldFlockSystem } from "../src/agent-world-flock";
import type { AgentWorldEntityDefinition, AgentWorldRuntime } from "../src/agent-world-runtime";
import { buildMesaIsland, type MesaEntityMeta, type MesaIsland, type Vec3 } from "./mesa-island";
import type { EntityChange } from "./island-world";

export const LIVING_WORLD_ID = "living-island";
/** 2: the birds carry genes, eat at the trees, lay eggs and die (docs/LIVING_ISLAND.md). */
export const LIVING_RULES_VERSION = "living-rules/2";
/**
 * Older rules a saved island may still resume from. A `living-rules/1` island has birds without
 * genes: each gets founder genes on resume, and everything else continues as saved.
 */
export const LIVING_RULES_UPGRADES: readonly string[] = ["living-rules/1"];

// ---- the forest -----------------------------------------------------------------------------

/** A dna-tree grows about 2.3 units tall at scale 1; Mesa's avatar is 5 tall. */
const TREE_SCALE = 3.2;
/** Visible size while a sown tree grows, then full size (stage 2) once it is ready. */
const GROWTH_STAGES = [0.45, 0.75, 1] as const;
const STAGE_SECONDS = 15;
/** A sown tree, or one that just changed generation, rests this long before it can be used. */
export const READY_SECONDS = 30;
const MUTATION_RATE = 0.12;
const GATHER_RANGE = 6;
const SOW_RANGE = 7;
/** How close a target must be to a tree's root (horizontally) to name that tree. */
const TREE_SEARCH = 3;
const TREE_SPACING = 4;
const MESA_CLEARANCE = 1;
export const MAX_TREES = 24;
const MAX_GENERATION = 64;
/**
 * Each trunk is solid: an invisible static cylinder as tall as the tree's first segment (the
 * drawn trunk is about 0.17 wide at full size; the collider is a little fatter so agents stop
 * just short of the bark). Branches and leaves stay walk-through.
 */
const TRUNK_RADIUS = 0.35;
/** Sowing right under an agent would spawn a trunk inside its capsule (radius 1). */
const SOW_CLEARANCE = TRUNK_RADIUS + 1.3;

type Founder = { name: string; root: Vec3; seed: number; genome: AgentWorldDnaGenome };

/** Five founders in a grove north-west of the spawn point, each a different genome. */
const FOUNDERS: Founder[] = [
  { name: "Tree_1", root: [-14, 0, 10], seed: 11, genome: {} },
  { name: "Tree_2", root: [-8, 0, 15], seed: 23, genome: { branchAngle: 0.62, leafHue: 0.07, leafHueSpread: 0.08 } },
  { name: "Tree_3", root: [-17, 0, 17], seed: 37, genome: { lengthRatio: 0.74, trunkLength: 0.95, leafHue: 0.16 } },
  { name: "Tree_4", root: [-11, 0, 21], seed: 41, genome: { rollTurns: 2.6, splitChance: 0.5, leafHue: 0.55 } },
  { name: "Tree_5", root: [-20, 0, 9], seed: 53, genome: { trunkLength: 0.6, branchAngle: 0.9, depth: 5, leafHue: 0.86 } },
];

// ---- the flock and the wind -----------------------------------------------------------------

const FLOCK_ID = "flock_1";
/** The birds fly in a box from y 12 to 18 over most of the island (Peak's top is y 11). */
const FLOCK_POSITION: Vec3 = [-4, 15, 6];
const AGENT_FEAR_RADIUS = 14;
const AGENT_FEAR = 60;
const MOVER_FEAR_RADIUS = 8;
const MOVER_FEAR = 60;
const MOVER_MIN_SPEED = 5;
const STARTLE_SECONDS = 1;
/** Tree canopies pull the birds gently: where agents plant, birds gather. */
const PERCH_HEIGHT = 11;

const WIND_ID = "wind_1";

// ---- the birds' lives ---------------------------------------------------------------------------
//
// Every bird carries genes: its own cruise speed, its Reynolds weights (keep apart, fly along,
// stay together), its body size and its colour. Flying burns energy (more for big, fast birds);
// a bird over a grown tree eats its fruit, which grows back with the tree's leaves, so a busy
// tree runs out. A well-fed adult lays an egg: the chick inherits its genes, a little changed.
// Birds die of hunger or of old age. Nobody chooses who lives; the island does. When the flock
// runs low, a few newcomers fly in with genes of their own, so the island never falls silent.

/**
 * Gene ranges: speed and the three weights are factors of the flock's own; size scales the body;
 * appetite is how strongly hunger pulls a bird out of the flock towards a tree with fruit.
 */
export const BIRD_GENES = {
  speed: [0.7, 1.35],
  separation: [0.4, 1.8],
  alignment: [0.4, 1.8],
  cohesion: [0.4, 1.8],
  size: [0.7, 1.4],
  appetite: [0.3, 1.7],
} as const;
type BirdGeneName = keyof typeof BIRD_GENES;
const BIRD_GENE_NAMES = Object.keys(BIRD_GENES) as BirdGeneName[];
/** Each gene drifts by up to this share of its range at every birth; the hue by 0.04 turn. */
const BIRD_MUTATION = 0.08;
const HUE_MUTATION = 0.04;
/** Founders spread around the middle of each range, by this share of it. */
const FOUNDER_SPREAD = 0.3;
export const MAX_BIRDS = 64;
/** Below this many birds, a newcomer arrives every ARRIVAL_SECONDS. */
export const MIN_BIRDS = 8;
const ARRIVAL_SECONDS = 20;
/** Energy held per unit of size; a bird is born with part of it. */
const ENERGY_PER_SIZE = 100;
/** Energy burnt per second: resting cost plus flight, which grows with size and speed². */
const RESTING_COST = 0.3;
const FLIGHT_COST = 0.4;
/** A bird within this horizontal distance of a grown tree's trunk eats this much per second. */
const FEED_RADIUS = 6;
/**
 * A hungry bird (below FORAGE_WHEN of its energy) steers towards the nearest grown tree with
 * fruit, up to FORAGE_PULL × the flock's turning force × its appetite × how hungry it is.
 */
const FORAGE_WHEN = 0.8;
const FORAGE_PULL = 4;
const FORAGE_MIN_FRUIT = 1;
/** The flock's own cruise speed and turning force (flockDefinition), which genes scale. */
const FLOCK_SPEED = 6;
const FLOCK_MAX_FORCE = 1.1;
const BITE = 5;
/** A grown tree holds FRUIT_BASE + leaves × FRUIT_PER_LEAF, growing back leaves × FRUIT_GROWTH per s. */
const FRUIT_BASE = 20;
const FRUIT_PER_LEAF = 0.25;
const FRUIT_GROWTH = 0.05;
/** Adults (this old) lay when this full, at most once per EGG_SECONDS. */
const ADULT_SECONDS = 60;
const EGG_SECONDS = 40;
const EGG_WHEN_FULL = 0.7;
const EGG_COST = 0.35;
const CHICK_ENERGY = 0.3;
const FOUNDER_ENERGY = 0.6;
/** A bird lives LIFESPAN_SECONDS plus up to LIFESPAN_SPREAD more, unless hunger comes first. */
const LIFESPAN_SECONDS = 360;
const LIFESPAN_SPREAD = 240;
const BIRD_SATURATION = 0.5;
const BIRD_LIGHTNESS = 0.42;
const BIRD_SEED = 0x5eed_b1d5;

// ---- records ----------------------------------------------------------------------------------

export interface TreeRecord {
  id: string;
  name: string;
  root: Vec3;
  seed: number;
  generation: number;
  mutationRate: number;
  /** The founder genome of this tree's own lineage (a sown tree starts from its parent's). */
  genome: ResolvedAgentWorldDnaGenome;
  parent: string | null;
  parentGeneration: number | null;
  /** Ancestor names, oldest first; empty for a founder. */
  lineage: string[];
  sownBy: string | null;
  bornAt: number;
  changedAt: number;
  stage: number;
}

export interface SeedRecord {
  from: string;
  generation: number;
  seed: number;
  mutationRate: number;
  genome: ResolvedAgentWorldDnaGenome;
  lineage: string[];
}

export type BirdGenes = Record<BirdGeneName, number> & { hue: number };

/** One bird; its index in `BirdsSnapshot.members` is its index in the flock. */
export interface BirdRecord {
  id: number;
  genes: BirdGenes;
  energy: number;
  bornAt: number;
  /** When it last laid (its birth until then). */
  laidAt: number;
  lifespan: number;
  /** 1 for a founder or a newcomer, its parent's + 1 for a chick. */
  generation: number;
  parent: number | null;
}

export interface BirdsSnapshot {
  members: BirdRecord[];
  /** The birds' own random stream (mulberry32 state), so a resumed island continues exactly. */
  random: number;
  nextId: number;
  /** The simulated second of the last life step. */
  livedAt: number;
  nextArrivalAt: number;
  births: number;
  deaths: number;
  arrivals: number;
  /** Fruit left on each tree, by tree id. */
  fruit: [string, number][];
}

export interface LivingSnapshot {
  trees: TreeRecord[];
  seeds: [string, SeedRecord][];
  treeCounter: number;
  startledUntil: number;
  flock: AgentWorldFlockMembers | null;
  /** Absent in a `living-rules/1` island, whose birds then get founder genes. */
  birds?: BirdsSnapshot;
}

/** The agent taking part, as the rules see it (island-world.ts owns characters). */
export interface LivingActor { id: string; name: string; position: Vec3 }

type Box = { position: Vec3; size: Vec3 };

const round = (value: number, digits = 2): number => Math.round(value * 10 ** digits) / 10 ** digits;
const flatDistance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function finiteVector(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const [x, y, z] = value.slice(0, 3).map(Number);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : null;
}

/** A new lineage's seed: a pure mix of the parent's seed, generation and the tree's number. */
function childSeed(parentSeed: number, generation: number, counter: number): number {
  let h = (parentSeed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ generation, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ counter, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Leaf colour words an agent can reason with. */
export function leafColorName(hue: number): string {
  const h = ((hue % 1) + 1) % 1;
  if (h < 0.04 || h >= 0.95) return "Red";
  if (h < 0.11) return "Orange";
  if (h < 0.18) return "Yellow";
  if (h < 0.45) return "Green";
  if (h < 0.53) return "Teal";
  if (h < 0.7) return "Blue";
  if (h < 0.8) return "Purple";
  return "Pink";
}

function hslToRgb(h: number, s: number, l: number): Vec3 {
  const hue = ((h % 1) + 1) % 1;
  const k = (n: number) => (n + hue * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [round(f(0), 3), round(f(8), 3), round(f(4), 3)];
}

// ---- documents -------------------------------------------------------------------------------

function treeDefinition(tree: TreeRecord): AgentWorldEntityDefinition {
  const scale = TREE_SCALE * GROWTH_STAGES[tree.stage];
  return {
    id: tree.id,
    label: tree.name,
    type: "dna-tree",
    transform: { position: [...tree.root], scale: [scale, scale, scale] },
    // One tree per entity, grown instantly (the viewer never simulates, so a reveal would stall)
    // and without the seasonal leaf fall: a tree changes only when an agent changes it.
    dna: {
      seed: tree.seed, generation: tree.generation, mutationRate: tree.mutationRate,
      trees: 1, columns: 1, layoutJitter: 0, genome: { ...tree.genome }, growSeconds: 0, seasonSeconds: 0,
    },
    tags: ["living", "tree"],
  };
}

/** The tree's own form, at scale 1 (pure: same record, same form). */
function treeForm(tree: TreeRecord) {
  return growAgentWorldDnaForest(resolveAgentWorldDna(treeDefinition(tree).dna));
}

/** Height of the first (trunk) segment at scale 1. */
function trunkHeightOf(form: ReturnType<typeof growAgentWorldDnaForest>): number {
  let top = 0;
  for (const segment of form.segments) if (segment.level === 0) top = Math.max(top, segment.end.y);
  return top;
}

function trunkDefinition(tree: TreeRecord, trunkHeight: number): AgentWorldEntityDefinition {
  const height = round(Math.max(0.5, trunkHeight * TREE_SCALE * GROWTH_STAGES[tree.stage]), 3);
  return {
    id: `${tree.id}-trunk`,
    label: `${tree.name} trunk`,
    type: "cylinder",
    geometry: { radius: TRUNK_RADIUS, height, radialSegments: 8 },
    transform: { position: [tree.root[0], height / 2, tree.root[2]] },
    visible: false,
    physics: { mode: "static", friction: 0.8, restitution: 0 },
    tags: ["living", "trunk"],
  };
}

function perchDefinition(tree: TreeRecord): AgentWorldEntityDefinition {
  return {
    id: `${tree.id}-perch`,
    label: `${tree.name} perch`,
    type: "force-field",
    transform: { position: [tree.root[0], PERCH_HEIGHT, tree.root[2]] },
    forceField: {
      kind: "attractor", shape: "sphere", radius: 22, strength: 40, minimumDistance: 4, edgeSoftness: 0.6,
      affectsBodies: false, affectsFlocks: true, affectsParticles: false, affectsTags: ["bird"], visualize: false,
    },
    tags: ["living", "perch"],
  };
}

function founderRecord(founder: Founder): TreeRecord {
  const resolved = resolveAgentWorldDna({ genome: founder.genome });
  return {
    id: founder.name.toLowerCase(), name: founder.name, root: [...founder.root], seed: founder.seed,
    generation: 1, mutationRate: MUTATION_RATE, genome: resolved.genome,
    parent: null, parentGeneration: null, lineage: [], sownBy: null,
    // Founders are grown and ready from the first tick.
    bornAt: -READY_SECONDS, changedAt: -READY_SECONDS, stage: GROWTH_STAGES.length - 1,
  };
}

/** The flock as authored; with `birds`, as many members as birds, each with its own traits. */
function flockDefinition(birds?: readonly BirdRecord[]): AgentWorldEntityDefinition {
  return {
    id: FLOCK_ID,
    label: "Flock_1",
    type: "flock",
    transform: { position: [...FLOCK_POSITION] },
    flock: {
      preset: "starlings", count: 28, bounds: "box", size: [36, 3, 36], speed: 6, maxForce: 1.1,
      separation: 1.6, alignment: 3, cohesion: 1, separationDistance: 2.2, neighborDistance: 8,
      memberSize: 1.6, color: "#30343c", emissive: "#0d1a26", emissiveIntensity: 0.2, seed: 29,
      ...(birds ? { count: Math.max(1, birds.length), members: birds.map(birdTraits) } : {}),
    },
    tags: ["living", "bird"],
  };
}

/** What the flock draws and steers with: a bird's genes as member traits. */
function birdTraits(bird: BirdRecord) {
  const { genes } = bird;
  return {
    color: hexColor(hslToRgb(genes.hue, BIRD_SATURATION, BIRD_LIGHTNESS)),
    scale: round(genes.size, 3), speed: round(genes.speed, 3),
    separation: round(genes.separation, 3), alignment: round(genes.alignment, 3), cohesion: round(genes.cohesion, 3),
  };
}

const hexColor = (rgb: Vec3) => `#${rgb.map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0")).join("")}`;

/** One mulberry32 draw from a saved state: the next state and a number in [0, 1). */
function draw(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [next, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

const clampGene = (name: BirdGeneName, value: number) => Math.max(BIRD_GENES[name][0], Math.min(BIRD_GENES[name][1], value));
const wrapHue = (hue: number) => ((hue % 1) + 1) % 1;
const birdCapacity = (bird: BirdRecord) => ENERGY_PER_SIZE * bird.genes.size;
const flightCost = (genes: BirdGenes) => RESTING_COST + FLIGHT_COST * genes.size * genes.speed * genes.speed;

function windDefinition(): AgentWorldEntityDefinition {
  // Invisible and unlisted: an agent finds it by watching thrown blocks drift (or birds bend).
  return {
    id: WIND_ID,
    label: "Wind",
    type: "force-field",
    transform: { position: [22, 8, -22] },
    forceField: {
      kind: "flow", shape: "box", size: [20, 8, 20], strength: 7, scale: 0.6, speed: 1, edgeSoftness: 0.35,
      affectsBodies: true, affectsFlocks: true, affectsParticles: false, affectsTags: [], visualize: false,
    },
    tags: ["living", "wind"],
  };
}

export interface LivingIslandBase extends MesaIsland {
  trees: TreeRecord[];
}

/** Mesa, unchanged, plus the living entities. */
export function buildLivingIsland(): LivingIslandBase {
  const mesa = buildMesaIsland();
  const trees = FOUNDERS.map(founderRecord);
  const living: AgentWorldEntityDefinition[] = [
    ...trees.flatMap((tree) => [treeDefinition(tree), perchDefinition(tree), trunkDefinition(tree, trunkHeightOf(treeForm(tree)))]),
    flockDefinition(),
    windDefinition(),
  ];
  return {
    document: { ...mesa.document, id: LIVING_WORLD_ID, label: "Living island", entities: [...mesa.document.entities, ...living] },
    meta: mesa.meta,
    trees,
  };
}

/** Ids of the living entities in a fresh island, in document order (for numeric ids). */
export function livingEntityIds(base: LivingIslandBase): string[] {
  return [...base.trees.flatMap((tree) => [tree.id, `${tree.id}-perch`, `${tree.id}-trunk`]), FLOCK_ID, WIND_ID];
}

// ---- the rules -------------------------------------------------------------------------------

export interface LivingHost {
  readonly runtime: AgentWorldRuntime;
  simSeconds(): number;
  allocateNumericId(entityId: string): number;
  numericId(entityId: string): number | undefined;
  pushChange(change: EntityChange): void;
}

type TreeStats = { height: number; width: number; branches: number; leaves: number; hue: number; trunk: number; expressed: ResolvedAgentWorldDnaGenome };

export class LivingIsland {
  private readonly trees = new Map<string, TreeRecord>();
  private readonly seeds = new Map<string, SeedRecord>();
  private readonly stats = new Map<string, TreeStats>();
  private readonly ground: Box[];
  private readonly mesas: Box[];
  private treeCounter: number;
  private startledUntil = Number.NEGATIVE_INFINITY;
  private agents: Vec3[] = [];
  private movers: { position: Vec3; velocity: Vec3 }[] = [];
  /** The birds, in flock member order. */
  private birds: BirdRecord[] = [];
  private random = BIRD_SEED;
  private nextBirdId = 1;
  private livedAt = 0;
  private nextArrivalAt = 0;
  private births = 0;
  private deaths = 0;
  private arrivals = 0;
  private readonly fruit = new Map<string, number>();
  private food: Vec3[] = [];
  private foodAt = Number.NaN;

  constructor(private readonly host: LivingHost, meta: Map<string, MesaEntityMeta>, base: LivingIslandBase, saved?: LivingSnapshot) {
    const boxes = (role: string) => [...meta.values()]
      .filter((info) => info.static && info.attributes?.RenderRole === role)
      .map((info) => ({ position: this.staticPosition(info.name, base), size: info.size }));
    this.ground = boxes("Ground");
    this.mesas = boxes("Mesa");
    for (const tree of saved?.trees ?? base.trees) this.trees.set(tree.id, structuredClone(tree));
    for (const [id, seed] of saved?.seeds ?? []) this.seeds.set(id, structuredClone(seed));
    this.treeCounter = saved?.treeCounter ?? base.trees.length;
    if (saved) this.startledUntil = saved.startledUntil ?? Number.NEGATIVE_INFINITY;
    const flock = this.flock();
    if (flock) {
      if (saved?.flock && !flock.writeMembers(saved.flock)) throw new Error("Saved flock does not match the island's flock");
      flock.hostAcceleration = (position, velocity, out, index) => this.birdSteer(position, velocity, out, index);
      if (saved?.birds) this.restoreBirds(saved.birds, flock.memberCount);
      else this.foundBirds(flock.memberCount);
    }
  }

  // ---- the birds' lives -------------------------------------------------------------------------

  private restoreBirds(saved: BirdsSnapshot, members: number): void {
    if (saved.members.length !== members) throw new Error("Saved birds do not match the island's flock");
    this.birds = saved.members.map((bird) => structuredClone(bird));
    this.random = saved.random;
    this.nextBirdId = saved.nextId;
    this.livedAt = saved.livedAt;
    this.nextArrivalAt = saved.nextArrivalAt;
    this.births = saved.births;
    this.deaths = saved.deaths;
    this.arrivals = saved.arrivals;
    for (const [id, fruit] of saved.fruit) this.fruit.set(id, fruit);
  }

  /** A fresh island, or one saved before birds had genes: the birds there become founders. */
  private foundBirds(members: number): void {
    const now = this.host.simSeconds();
    this.livedAt = now;
    this.nextArrivalAt = now;
    this.birds = Array.from({ length: members }, () => {
      const bird = this.newBird(now, FOUNDER_SPREAD);
      // Founders are of all ages, so they do not all die of old age together.
      bird.bornAt = now - this.next() * LIFESPAN_SECONDS * 0.6;
      bird.laidAt = now - this.next() * EGG_SECONDS;
      return bird;
    });
    for (const tree of this.trees.values()) if (this.grown(tree)) this.fruit.set(tree.id, this.fruitCapacity(tree));
    this.reflock(null);
  }

  private next(): number {
    const [state, value] = draw(this.random);
    this.random = state;
    return value;
  }

  /** A founder or a newcomer: genes around the middle of each range, `spread` wide, any colour. */
  private newBird(now: number, spread: number): BirdRecord {
    const genes = { hue: this.next() } as BirdGenes;
    for (const name of BIRD_GENE_NAMES) {
      const [low, high] = BIRD_GENES[name];
      genes[name] = clampGene(name, (low + high) / 2 + (this.next() * 2 - 1) * (high - low) * spread);
    }
    const bird: BirdRecord = {
      id: this.nextBirdId++, genes, energy: 0, bornAt: now, laidAt: now,
      lifespan: LIFESPAN_SECONDS + this.next() * LIFESPAN_SPREAD, generation: 1, parent: null,
    };
    bird.energy = birdCapacity(bird) * FOUNDER_ENERGY;
    return bird;
  }

  /** A chick: its parent's genes, each drifting a little. */
  private chick(parent: BirdRecord, now: number): BirdRecord {
    const genes = { hue: wrapHue(parent.genes.hue + (this.next() * 2 - 1) * HUE_MUTATION) } as BirdGenes;
    for (const name of BIRD_GENE_NAMES) {
      const [low, high] = BIRD_GENES[name];
      genes[name] = clampGene(name, parent.genes[name] + (this.next() * 2 - 1) * (high - low) * BIRD_MUTATION);
    }
    const bird: BirdRecord = {
      id: this.nextBirdId++, genes, energy: 0, bornAt: now, laidAt: now,
      lifespan: LIFESPAN_SECONDS + this.next() * LIFESPAN_SPREAD, generation: parent.generation + 1, parent: parent.id,
    };
    bird.energy = birdCapacity(bird) * CHICK_ENERGY;
    return bird;
  }

  private grown(tree: TreeRecord): boolean {
    return tree.stage === GROWTH_STAGES.length - 1;
  }

  private fruitCapacity(tree: TreeRecord): number {
    return FRUIT_BASE + this.treeStats(tree).leaves * FRUIT_PER_LEAF;
  }

  /**
   * One step of every bird's life: fruit grows back, birds burn energy and eat, adults lay,
   * the hungry and the old die, newcomers arrive when the flock runs low. The flock's members
   * follow: a chick is appended beside its parent, a dead bird's slot takes the last member.
   */
  private live(): void {
    const flock = this.flock();
    if (!flock || !this.birds.length) return;
    const now = this.host.simSeconds();
    const dt = now - this.livedAt;
    this.livedAt = now;
    if (!(dt > 0)) return;
    const grown: TreeRecord[] = [];
    for (const tree of this.trees.values()) {
      if (!this.grown(tree)) continue;
      grown.push(tree);
      const left = this.fruit.get(tree.id) ?? 0;
      this.fruit.set(tree.id, Math.min(this.fruitCapacity(tree), left + this.treeStats(tree).leaves * FRUIT_GROWTH * dt));
    }
    const state = flock.readMembers();
    const lifeTurn = Math.floor(now) !== Math.floor(now - dt);
    const dead: number[] = [];
    const layers: number[] = [];
    for (let index = 0; index < this.birds.length; index += 1) {
      const bird = this.birds[index];
      const capacity = birdCapacity(bird);
      bird.energy -= flightCost(bird.genes) * dt;
      const at: Vec3 = [state.positions[index * 3] + FLOCK_POSITION[0], 0, state.positions[index * 3 + 2] + FLOCK_POSITION[2]];
      for (const tree of grown) {
        if (flatDistance(at, tree.root) > FEED_RADIUS) continue;
        const left = this.fruit.get(tree.id) ?? 0;
        const bite = Math.max(0, Math.min(left, BITE * dt, capacity - bird.energy));
        bird.energy += bite;
        this.fruit.set(tree.id, left - bite);
        break;
      }
      // Lives turn once a second (eggs, deaths, arrivals), so the flock and its viewers change
      // at most once a second however many birds there are.
      if (!lifeTurn) continue;
      if (bird.energy <= 0 || now - bird.bornAt >= bird.lifespan) { dead.push(index); continue; }
      if (now - bird.bornAt >= ADULT_SECONDS && now - bird.laidAt >= EGG_SECONDS && bird.energy >= capacity * EGG_WHEN_FULL) layers.push(index);
    }
    let changed = false;
    for (const index of layers) {
      if (this.birds.length - dead.length >= MAX_BIRDS) break;
      const parent = this.birds[index];
      parent.energy -= birdCapacity(parent) * EGG_COST;
      parent.laidAt = now;
      this.birds.push(this.chick(parent, now));
      for (let axis = 0; axis < 3; axis += 1) {
        state.positions.push(state.positions[index * 3 + axis] + (this.next() - 0.5) * 1.5);
        state.velocities.push(state.velocities[index * 3 + axis]);
      }
      this.births += 1;
      changed = true;
    }
    // Highest index first, so each swap moves a member that is still alive (or just born).
    for (const index of dead.sort((a, b) => b - a)) {
      const last = this.birds.length - 1;
      this.birds[index] = this.birds[last];
      this.birds.pop();
      for (const list of [state.positions, state.velocities]) {
        list.splice(index * 3, 3, list[last * 3], list[last * 3 + 1], list[last * 3 + 2]);
        list.length = last * 3;
      }
      this.deaths += 1;
      changed = true;
    }
    if (lifeTurn && (!this.birds.length || (this.birds.length < MIN_BIRDS && now >= this.nextArrivalAt))) {
      this.arrive(now, state);
      changed = true;
    }
    if (changed) this.reflock(state);
  }

  /** A newcomer flies in from an edge of the flock's sky, heading inland. */
  private arrive(now: number, state: AgentWorldFlockMembers): void {
    const size = (flockDefinition().flock?.size ?? [36, 3, 36]) as Vec3;
    const bird = this.newBird(now, 0.5);
    const side = Math.floor(this.next() * 4);
    const along = (this.next() * 2 - 1) * 0.7;
    const x = side < 2 ? (side === 0 ? -0.85 : 0.85) * size[0] : along * size[0];
    const z = side < 2 ? along * size[2] : (side === 2 ? -0.85 : 0.85) * size[2];
    const y = (this.next() * 2 - 1) * 0.5 * size[1];
    const reach = Math.hypot(x, z) || 1;
    this.birds.push(bird);
    state.positions.push(x, y, z);
    state.velocities.push((-x / reach) * 4, 0, (-z / reach) * 4);
    this.nextArrivalAt = now + ARRIVAL_SECONDS;
    this.arrivals += 1;
  }

  /** Give the flock one member per bird, with its traits, and tell the viewers. */
  private reflock(state: AgentWorldFlockMembers | null): void {
    const definition = flockDefinition(this.birds);
    const updated = this.host.runtime.updateEntity(FLOCK_ID, { flock: definition.flock });
    if (!updated.ok) throw new Error(`Could not update the flock: ${JSON.stringify(updated.error ?? "")}`);
    if (state && !this.flock()?.writeMembers(state)) throw new Error("The flock lost track of its birds");
    this.host.pushChange({ added: [{ entity: definition, numericId: this.host.numericId(FLOCK_ID)! }] });
  }

  /** The live bird population (the runtime owns it; this reads and steers it). */
  private flock(): AgentWorldFlockSystem | null {
    const object = this.host.runtime.getEntityObject(FLOCK_ID);
    return object ? findFlockSystem(object) : null;
  }

  private staticPosition(name: string, base: LivingIslandBase): Vec3 {
    const entity = base.document.entities.find((item) => item.label === name);
    return [...(entity?.transform?.position ?? [0, 0, 0])] as Vec3;
  }

  // ---- actions --------------------------------------------------------------------------------

  /** The living actions; `null` means "not one of mine". */
  apply(actor: LivingActor, type: string, data: Record<string, unknown>): string | null {
    switch (type) {
      case "GatherSeed": return this.gatherSeed(actor, data);
      case "Sow": return this.sow(actor, data);
      case "NextGeneration": return this.nextGeneration(actor, data);
      default: return null;
    }
  }

  /** Grown (stage 2 comes 30 s after sowing) and rested since its last generation. */
  private readyAt(tree: TreeRecord): number {
    return Math.max(tree.changedAt + READY_SECONDS, tree.bornAt + (GROWTH_STAGES.length - 1) * STAGE_SECONDS);
  }

  private ready(tree: TreeRecord): boolean {
    return tree.stage === GROWTH_STAGES.length - 1 && this.host.simSeconds() >= this.readyAt(tree);
  }

  private treeAt(target: Vec3): TreeRecord | null {
    let best: TreeRecord | null = null;
    let bestDistance = TREE_SEARCH;
    for (const tree of this.trees.values()) {
      const gap = flatDistance(target, tree.root);
      if (gap <= bestDistance) { best = tree; bestDistance = gap; }
    }
    return best;
  }

  private gatherSeed(actor: LivingActor, data: Record<string, unknown>): string {
    const target = finiteVector(data.position);
    if (!target) return "GatherSeedFailed:InvalidPosition";
    if (distance(actor.position, target) > GATHER_RANGE) return "GatherSeedFailed:OutOfRange";
    const tree = this.treeAt(target);
    if (!tree) return "GatherSeedFailed:NoTree";
    if (!this.ready(tree)) return "GatherSeedFailed:NotReady";
    // The pouch holds one seed: a new one replaces it.
    this.seeds.set(actor.id, {
      from: tree.name, generation: tree.generation, seed: tree.seed, mutationRate: tree.mutationRate,
      genome: this.treeStats(tree).expressed, lineage: [...tree.lineage, tree.name],
    });
    return "GatherSeedSuccess";
  }

  /** Open island ground: on a ground box (y = 0), off every mesa footprint. */
  private isGround(target: Vec3): boolean {
    if (target[1] < -1 || target[1] > 1.5) return false;
    const inside = (box: Box, margin: number) =>
      Math.abs(target[0] - box.position[0]) <= box.size[0] / 2 + margin && Math.abs(target[2] - box.position[2]) <= box.size[2] / 2 + margin;
    return this.ground.some((box) => inside(box, -1)) && !this.mesas.some((box) => inside(box, MESA_CLEARANCE));
  }

  private sow(actor: LivingActor, data: Record<string, unknown>): string {
    const seed = this.seeds.get(actor.id);
    if (!seed) return "SowFailed:NoSeed";
    const target = finiteVector(data.position);
    if (!target) return "SowFailed:InvalidPosition";
    if (distance(actor.position, target) > SOW_RANGE) return "SowFailed:OutOfRange";
    if (!this.isGround(target)) return "SowFailed:NotGround";
    for (const tree of this.trees.values()) if (flatDistance(target, tree.root) < TREE_SPACING) return "SowFailed:TooClose";
    if (this.agents.some((agent) => flatDistance(agent, target) < SOW_CLEARANCE)) return "SowFailed:Occupied";
    if (this.trees.size >= MAX_TREES) return "SowFailed:ForestFull";
    this.treeCounter += 1;
    const name = `Tree_${this.treeCounter}`;
    const now = this.host.simSeconds();
    const tree: TreeRecord = {
      id: name.toLowerCase(), name, root: [round(target[0], 3), 0, round(target[2], 3)],
      seed: childSeed(seed.seed, seed.generation, this.treeCounter), generation: 1, mutationRate: seed.mutationRate,
      genome: { ...seed.genome }, parent: seed.from, parentGeneration: seed.generation, lineage: [...seed.lineage],
      sownBy: actor.name, bornAt: now, changedAt: now, stage: 0,
    };
    const added: NonNullable<EntityChange["added"]> = [];
    for (const entity of [treeDefinition(tree), perchDefinition(tree), trunkDefinition(tree, this.treeStats(tree).trunk)]) {
      const spawned = this.host.runtime.spawn(entity);
      if (!spawned.ok) throw new Error(`Could not sow ${name}: ${JSON.stringify(spawned.error ?? "")}`);
      added.push({ entity, numericId: this.host.allocateNumericId(entity.id!) });
    }
    this.trees.set(tree.id, tree);
    this.seeds.delete(actor.id);
    this.host.pushChange({ added });
    return "SowSuccess";
  }

  private nextGeneration(actor: LivingActor, data: Record<string, unknown>): string {
    const target = finiteVector(data.position);
    if (!target) return "NextGenerationFailed:InvalidPosition";
    if (distance(actor.position, target) > GATHER_RANGE) return "NextGenerationFailed:OutOfRange";
    const tree = this.treeAt(target);
    if (!tree) return "NextGenerationFailed:NoTree";
    if (!this.ready(tree)) return "NextGenerationFailed:NotReady";
    if (tree.generation >= MAX_GENERATION) return "NextGenerationFailed:LastGeneration";
    tree.generation += 1;
    tree.changedAt = this.host.simSeconds();
    this.redefine(tree);
    return "NextGenerationSuccess";
  }

  /** Re-send a changed tree and its trunk: viewers replace an entity re-added under the same id. */
  private redefine(tree: TreeRecord): void {
    this.stats.delete(tree.id);
    const entity = treeDefinition(tree);
    const trunk = trunkDefinition(tree, this.treeStats(tree).trunk);
    const updated = this.host.runtime.updateEntity(tree.id, { dna: entity.dna, transform: entity.transform });
    if (!updated.ok) throw new Error(`Could not update ${tree.name}: ${JSON.stringify(updated.error ?? "")}`);
    // A cylinder's size is not patchable: the trunk collider is rebuilt at its new height.
    this.host.runtime.remove(trunk.id!);
    const spawned = this.host.runtime.spawn(trunk);
    if (!spawned.ok) throw new Error(`Could not rebuild ${trunk.id}: ${JSON.stringify(spawned.error ?? "")}`);
    this.host.pushChange({ added: [entity, trunk].map((definition) => ({ entity: definition, numericId: this.host.numericId(definition.id!)! })) });
  }

  // ---- simulation -------------------------------------------------------------------------------

  /** Before the scene steps: who the birds should avoid this tick. */
  beforeUpdate(agents: Vec3[], movers: { position: Vec3; velocity: Vec3 }[]): void {
    this.agents = agents;
    this.movers = movers.filter((mover) => Math.hypot(...mover.velocity) >= MOVER_MIN_SPEED);
  }

  /** After the scene steps: sown trees grow a stage every 15 s until they are ready; birds live. */
  afterUpdate(): void {
    const now = this.host.simSeconds();
    for (const tree of this.trees.values()) {
      if (tree.stage >= GROWTH_STAGES.length - 1) continue;
      const stage = Math.min(GROWTH_STAGES.length - 1, Math.floor((now - tree.bornAt) / STAGE_SECONDS + 1e-9));
      if (stage === tree.stage) continue;
      tree.stage = stage;
      this.redefine(tree);
    }
    this.live();
  }

  /** A bird's own steering: fear first, then hunger. */
  private birdSteer(position: Vector3, velocity: Vector3, out: Vector3, index: number): void {
    this.birdFear(position, velocity, out);
    this.forage(position, velocity, out, index);
  }

  /**
   * Trees a hungry bird may fly to: grown, with fruit left, and no agent within the birds' fear
   * radius (a bird would rather go hungry than feed beside one). Rebuilt once per tick.
   */
  private foodTrees(): Vec3[] {
    const now = this.host.simSeconds();
    if (this.foodAt === now) return this.food;
    this.foodAt = now;
    this.food = [];
    for (const tree of this.trees.values()) {
      if (!this.grown(tree) || (this.fruit.get(tree.id) ?? 0) < FORAGE_MIN_FRUIT) continue;
      if (this.agents.some((agent) => flatDistance(agent, tree.root) < AGENT_FEAR_RADIUS)) continue;
      this.food.push(tree.root);
    }
    return this.food;
  }

  /** Flock-local: a hungry bird turns towards the nearest tree with fruit, slowing as it arrives. */
  private forage(position: Vector3, velocity: Vector3, out: Vector3, index: number): void {
    const bird = this.birds[index];
    if (!bird) return;
    const hunger = 1 - bird.energy / (birdCapacity(bird) * FORAGE_WHEN);
    if (hunger <= 0) return;
    const x = position.x + FLOCK_POSITION[0];
    const z = position.z + FLOCK_POSITION[2];
    let best: Vec3 | null = null;
    let bestGap = Infinity;
    for (const root of this.foodTrees()) {
      const gap = Math.hypot(root[0] - x, root[2] - z);
      if (gap < bestGap) { best = root; bestGap = gap; }
    }
    if (!best || bestGap < 1e-6) return;
    // Reynolds' arrival: full speed far away, slower within a feeding circle and a half.
    const speed = FLOCK_SPEED * bird.genes.speed * Math.min(1, bestGap / (FEED_RADIUS * 1.5));
    let steerX = ((best[0] - x) / bestGap) * speed - velocity.x;
    let steerZ = ((best[2] - z) / bestGap) * speed - velocity.z;
    const limit = FORAGE_PULL * FLOCK_MAX_FORCE * bird.genes.appetite * Math.min(1, hunger);
    const length = Math.hypot(steerX, steerZ);
    if (length > limit) { steerX *= limit / length; steerZ *= limit / length; }
    out.x += steerX;
    out.z += steerZ;
  }

  /** Flock-local steering away from agents and fast blocks (the flock is unrotated, unscaled). */
  private birdFear(position: Vector3, _velocity: Vector3, out: Vector3): void {
    out.set(0, 0, 0);
    const x = position.x + FLOCK_POSITION[0];
    const y = position.y + FLOCK_POSITION[1];
    const z = position.z + FLOCK_POSITION[2];
    const flee = (from: Vec3, radius: number, strength: number) => {
      const dx = x - from[0];
      const dy = y - from[1];
      const dz = z - from[2];
      const gap = Math.hypot(dx, dy, dz);
      if (gap >= radius || gap < 1e-6) return;
      const push = (strength * (1 - gap / radius)) / gap;
      out.x += dx * push;
      out.y += dy * push;
      out.z += dz * push;
      this.startledUntil = this.host.simSeconds() + STARTLE_SECONDS;
    };
    for (const agent of this.agents) flee(agent, AGENT_FEAR_RADIUS, AGENT_FEAR);
    for (const mover of this.movers) flee(mover.position, MOVER_FEAR_RADIUS, MOVER_FEAR);
  }

  // ---- observation ------------------------------------------------------------------------------

  private treeStats(tree: TreeRecord): TreeStats {
    const cached = this.stats.get(tree.id);
    if (cached) return cached;
    const config = resolveAgentWorldDna(treeDefinition(tree).dna);
    const form = treeForm(tree);
    let top = 0;
    let reach = 0;
    for (const segment of form.segments) {
      top = Math.max(top, segment.end.y);
      reach = Math.max(reach, Math.hypot(segment.end.x, segment.end.z));
    }
    const expressed = mutateAgentWorldDnaGenome(config.genome, config.seed, config.generation, config.mutationRate);
    const scale = TREE_SCALE * GROWTH_STAGES[tree.stage];
    const stats: TreeStats = {
      height: round(top * scale), width: round(reach * 2 * scale), branches: form.segments.length, leaves: form.leaves.length,
      hue: expressed.leafHue, trunk: trunkHeightOf(form), expressed,
    };
    this.stats.set(tree.id, stats);
    return stats;
  }

  /** Clawblox-shaped entities: every tree and the flock. The wind is for agents to discover. */
  observations(): Record<string, unknown>[] {
    const now = this.host.simSeconds();
    const out: Record<string, unknown>[] = [];
    for (const tree of this.trees.values()) {
      const stats = this.treeStats(tree);
      const g = stats.expressed;
      const centre: Vec3 = [round(tree.root[0]), round(stats.height / 2), round(tree.root[2])];
      const half: Vec3 = [round(stats.width / 2), round(stats.height / 2), round(stats.width / 2)];
      out.push({
        id: this.host.numericId(tree.id), name: tree.name, entity_type: "part",
        position: centre, size: [stats.width, stats.height, stats.width],
        aabb: { min: [centre[0] - half[0], 0, centre[2] - half[2]], max: [centre[0] + half[0], round(stats.height), centre[2] + half[2]] },
        color: hslToRgb(stats.hue, 0.72, 0.44), material: "Leaf", shape: "Tree", anchored: true,
        attributes: {
          RenderRole: "Tree", IsLiving: true, Root: tree.root.map((value) => round(value)).join(","),
          Generation: tree.generation, Ready: this.ready(tree),
          ReadyIn: round(Math.max(0, this.readyAt(tree) - now), 1),
          Parent: tree.parent ?? "", ParentGeneration: tree.parentGeneration ?? 0, Lineage: [...tree.lineage, tree.name].join(">"),
          SownBy: tree.sownBy ?? "", LeafColor: leafColorName(stats.hue), LeafHue: round(stats.hue, 3),
          Height: stats.height, Branches: stats.branches, Leaves: stats.leaves,
          TrunkLength: round(g.trunkLength, 3), LengthRatio: round(g.lengthRatio, 3), BranchAngle: round(g.branchAngle, 3),
          RollTurns: round(g.rollTurns, 3), Depth: g.depth, SplitChance: round(g.splitChance, 3), LeafSize: round(g.leafSize, 3),
          LeafHueSpread: round(g.leafHueSpread, 3), BranchThickness: round(g.branchThickness, 3),
        },
      });
    }
    const flock = this.flock();
    if (flock) {
      const { positions, velocities } = flock.readMembers();
      const count = positions.length / 3;
      const centre: Vec3 = [0, 0, 0];
      for (let i = 0; i < count; i += 1) for (let axis = 0; axis < 3; axis += 1) centre[axis] += positions[i * 3 + axis] / count;
      let spread = 0;
      let speed = 0;
      for (let i = 0; i < count; i += 1) {
        spread = Math.max(spread, Math.hypot(positions[i * 3] - centre[0], positions[i * 3 + 1] - centre[1], positions[i * 3 + 2] - centre[2]));
        speed += Math.hypot(velocities[i * 3], velocities[i * 3 + 1], velocities[i * 3 + 2]) / count;
      }
      const world = centre.map((value, axis) => round(value + FLOCK_POSITION[axis])) as Vec3;
      out.push({
        id: this.host.numericId(FLOCK_ID), name: "Flock_1", entity_type: "part",
        position: world, size: [round(spread * 2), round(spread * 2), round(spread * 2)],
        color: [0.188, 0.204, 0.235], material: "Feather", shape: "Flock", anchored: false,
        attributes: {
          RenderRole: "Flock", IsLiving: true, Members: count, Spread: round(spread), MeanSpeed: round(speed), Startled: now < this.startledUntil,
          Births: this.births, Deaths: this.deaths, Arrivals: this.arrivals,
          Generation: this.birds.reduce((highest, bird) => Math.max(highest, bird.generation), 0),
          Colors: this.birdColors(),
        },
      });
    }
    return out;
  }

  /** The flock's colours in words, most common first: "Blue 12, Teal 8, Red 3". */
  private birdColors(): string {
    const counts = new Map<string, number>();
    for (const bird of this.birds) {
      const name = leafColorName(bird.genes.hue);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([name, n]) => `${name} ${n}`).join(", ");
  }

  /** What an agent carries: its seed, if any. */
  playerAttributes(actorId: string): Record<string, unknown> {
    const seed = this.seeds.get(actorId);
    return {
      HeldSeed: seed ? `${seed.from}@${seed.generation}` : "",
      HeldSeedColor: seed ? leafColorName(seed.genome.leafHue) : "",
    };
  }

  // ---- spectators and snapshots -----------------------------------------------------------------

  /** Flock members for the pose frame: `[numericId, x, y, z, …]` in flock-local space. */
  swarms(): number[][] {
    const flock = this.flock();
    if (!flock) return [];
    const { positions } = flock.readMembers();
    return [[this.host.numericId(FLOCK_ID)!, ...positions.map((value) => round(value, 2))]];
  }

  snapshot(): LivingSnapshot {
    return {
      trees: [...this.trees.values()].map((tree) => structuredClone(tree)),
      seeds: [...this.seeds].map(([id, seed]) => [id, structuredClone(seed)]),
      treeCounter: this.treeCounter,
      startledUntil: this.startledUntil,
      flock: this.flock()?.readMembers() ?? null,
      birds: {
        members: this.birds.map((bird) => structuredClone(bird)),
        random: this.random,
        nextId: this.nextBirdId,
        livedAt: this.livedAt,
        nextArrivalAt: this.nextArrivalAt,
        births: this.births,
        deaths: this.deaths,
        arrivals: this.arrivals,
        fruit: [...this.fruit],
      },
    };
  }

  /** The birds as a host or a test reads them (copies). */
  birdRecords(): BirdRecord[] {
    return this.birds.map((bird) => structuredClone(bird));
  }
}

/** The agent-facing additions to API.md for this world. */
export const LIVING_API_MARKDOWN = `
## Living Island

This island also has trees and birds.

| Input | Data |
|-------|------|
| GatherSeed | \`{"position": [x, y, z]}\` (a tree's root) |
| Sow | \`{"position": [x, 0, z]}\` (open ground) |
| NextGeneration | \`{"position": [x, y, z]}\` (a tree's root) |

- Tree trunks are solid; branches and leaves are not.
- Trees are entities with \`attributes.RenderRole = "Tree"\` (\`Tree_1\`, \`Tree_2\`, …). Each grows
  from its genes; its attributes show them (\`TrunkLength\`, \`BranchAngle\`, \`LeafColor\`, …), with
  its \`Generation\`, \`Parent\` and \`Lineage\`. \`Ready\` says whether it can be used now; \`ReadyIn\`
  says in how many seconds.
- \`GatherSeed\` takes a seed from a ready tree within ${GATHER_RANGE} studs. You carry one seed
  (\`player.attributes.HeldSeed\`); gathering another replaces it.
- \`Sow\` plants your seed on open ground within ${SOW_RANGE} studs, at least ${TREE_SPACING} studs from
  other trees and not where someone stands: a new tree with the genes of the tree the seed came from. It grows for
  ${READY_SECONDS} seconds before it is ready. At most ${MAX_TREES} trees.
- \`NextGeneration\` makes a ready tree within ${GATHER_RANGE} studs express its next generation:
  its genes drift a little, then it rests ${READY_SECONDS} seconds.
- Results: \`GatherSeedSuccess\`, \`SowSuccess\`, \`NextGenerationSuccess\`, or \`…Failed:<reason>\`
  (\`OutOfRange\`, \`NoTree\`, \`NotReady\`, \`NoSeed\`, \`NotGround\`, \`TooClose\`, \`Occupied\`, \`ForestFull\`,
  \`LastGeneration\`).
- Birds fly above the island (\`Flock_1\`, \`RenderRole = "Flock"\`, with \`Members\`, \`Spread\`,
  \`MeanSpeed\`, \`Startled\`). They live on their own: they eat the fruit of grown trees, lay
  eggs, grow old and die. Each bird has its own colour, size and way of flying, and its chicks
  inherit them with small changes. The flock's \`Births\`, \`Deaths\`, \`Arrivals\` (newcomers),
  \`Generation\` (the highest alive) and \`Colors\` tell how it changes.
`;

/** API.md as served by the living island: Mesa's actions, retitled, plus the living ones. */
export function livingApiMarkdown(mesaApi: string): string {
  return `${mesaApi.replace(/^# Mesa World/m, "# Living Mesa World").trimEnd()}\n${LIVING_API_MARKDOWN}`;
}

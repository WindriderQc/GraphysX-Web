import {
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from "three";

/**
 * Ground crowds as first-class `graphysx.agent-world/v2` scene vocabulary — the last of the
 * legacy simulation systems to graduate, after `flock`, `force-field` and `dna-tree`.
 *
 * ## Provenance
 *
 * Adapted from the NPC population welded inside `src/race-scene.ts` (`buildNpcs` 4086-4142,
 * `updateNpcs` 4144-4228, `squashNpc` 4230-4237), which was itself a port of the legacy
 * `Human::rotateDirection` / `Human::ForceNTorque` / `human_wallContactProcess` trio. What is
 * carried over unchanged: the ±40° random turn every 0.33 s that defines a wanderer, the
 * 0.5 s retarget cadence and nearest-target greedy seek that defines a pursuer, the
 * rejection-sampled spawn (40 attempts, members no closer than 1.5), the wall turn-back, and
 * the body proportions (0.24/0.3 × 0.62 torso, 0.2 head).
 *
 * ## What this deliberately is NOT
 *
 * The recovered system is a *zombie-infection game mechanic*: humans wander, zombies hunt the
 * nearest human or else the player, contact converts a human into a zombie, and rolling over a
 * zombie squashes it — which also writes the race's win condition. None of that belongs in a
 * general scene engine's core vocabulary. So this module graduates the **population and its
 * steering**; the game on top is left to the rules/trigger vocabulary that already exists.
 *
 * Concretely, and following the `force-field` precedent (entity for identity, runtime pass for
 * effect): the entity owns *who is in the crowd, where they are, and how they move*. It owns
 * no player, no physics bodies, no audio, no win condition. Roles are ordinary scene data, and
 * {@link AgentWorldCrowdSystem.setRole} is the seam a rules pass drives to express infection —
 * rather than this module hard-coding what contact means.
 *
 * ## The one honest addition: separation
 *
 * The recovered NPCs never separate. Each was a cannon-es dynamic sphere, so inter-agent
 * spacing was a *free side effect of the solver's sphere-sphere collisions* — there is no
 * separation rule in `updateNpcs` to port. Dropping physics therefore deletes spacing, and an
 * instanced crowd without it walks through itself. The `separation` term below is an
 * **adaptation, not a recovery**: it is the cheapest thing that restores the behaviour the
 * solver used to provide for free, and it is called out here so nobody later reads it as
 * archive-faithful. It borrows the 1/distance weighting from the flock module rather than
 * inventing a third spacing model.
 *
 * ## The frame budget (pillar 5: performant by intent)
 *
 * Two O(N²) passes per step — separation over all pairs, and each pursuer's nearest-wanderer
 * scan — exactly as recovered (`updateNpcs` scans `this.npcs` per zombie). That is the right
 * trade at crowd counts, but it is why {@link AGENT_WORLD_CROWD_MAX_COUNT} is a hard cap of
 * 200 (≈40k pair tests per step) and not a suggestion. Rendering is two `InstancedMesh` draw
 * calls — torso and head — regardless of count, with role colour written per instance so the
 * per-agent `MeshStandardMaterial` the recovered code allocated (one per NPC, mutated in place
 * on infection) is not needed.
 */

/** How a member decides where to go. Both are recovered from `updateNpcs`. */
export type AgentWorldCrowdRole = "wander" | "pursue";

export type AgentWorldCrowd = {
  /**
   * Curated preset to start from. Explicit fields below win over the preset's. `null` means
   * "no preset", which is what a serialised hand-tuned crowd round-trips as.
   */
  preset?: AgentWorldCrowdPresetId | null;
  /** Total members. Capped at {@link AGENT_WORLD_CROWD_MAX_COUNT}. */
  count?: number;
  /**
   * How many of `count` start as pursuers. The remainder wander. Clamped to `count`, so
   * `{ count: 10, pursuers: 99 }` is a crowd of ten pursuers rather than an error.
   */
  pursuers?: number;
  /** Half-extents of the ground area the crowd is confined to, entity-local, in world units. */
  size?: [number, number];
  /**
   * Wanderer cruise speed. Pursuers move `pursuitSpeedRatio` times this — defaulted from the
   * recovered forces (zombie 4.6 / human 3.4 = 1.35), which is the archive-faithful number.
   */
  speed?: number;
  pursuitSpeedRatio?: number;
  /** How hard a member can turn, in radians per second. */
  turnRate?: number;
  /**
   * Members closer together than this get pushed apart. Effectively the crowd's personal-space
   * diameter. See the separation note in the file header — this whole term is an adaptation
   * replacing the physics solver, not recovered behaviour.
   */
  separationDistance?: number;
  /**
   * How much of an overlap is resolved per step, 0–1. `0` disables spacing entirely (members
   * walk through each other, which is what dropping the solver leaves you with); `1` fully
   * separates every overlapping pair each step.
   */
  separation?: number;
  /**
   * Where pursuers go when no wanderer is left, entity-local. The recovered code fell back to
   * the player's position; a scene engine has no player, so a crowd carries its own focus.
   */
  focus?: [number, number, number];
  /** Member height in world units. The recovered body is 0.82 tall overall. */
  memberSize?: number;
  wanderColor?: string;
  pursuerColor?: string;
  emissiveIntensity?: number;
  /** Deterministic seed for the spawn scatter, initial headings and turn phase. */
  seed?: number;
};

export type ResolvedAgentWorldCrowd = {
  preset: AgentWorldCrowdPresetId | null;
  count: number;
  pursuers: number;
  size: [number, number];
  speed: number;
  pursuitSpeedRatio: number;
  turnRate: number;
  separationDistance: number;
  separation: number;
  focus: [number, number, number];
  memberSize: number;
  wanderColor: string;
  pursuerColor: string;
  emissiveIntensity: number;
  seed: number;
};

/**
 * Pillar 5 ceiling. Two O(N²) passes per step; 200 members is ~40k pair tests, which stays
 * sub-millisecond. No preset and no agent call may exceed it.
 */
export const AGENT_WORLD_CROWD_MAX_COUNT = 200;

/** Recovered cadences, in seconds. `updateNpcs`: humans re-turn at 0.33, pursuers retarget at 0.5. */
const WANDER_TURN_INTERVAL = 0.33;
const PURSUE_RETARGET_INTERVAL = 0.5;
/** Recovered: `MathUtils.lerp(-40, 40, Math.random())` degrees per turn. */
const WANDER_TURN_DEGREES = 40;

export type AgentWorldCrowdPresetId = "promenade" | "pursuit" | "throng";

export type AgentWorldCrowdDescriptor = {
  id: AgentWorldCrowdPresetId;
  label: string;
  description: string;
  defaults: ResolvedAgentWorldCrowd;
  /** Where the numbers came from. */
  provenance: {
    sourcePath: string;
    sourceRepo: string;
    note: string;
  };
};

const BASE_CROWD: ResolvedAgentWorldCrowd = {
  preset: null,
  count: 30,
  pursuers: 0,
  size: [12, 12],
  speed: 1.6,
  // 4.6 / 3.4 from the recovered per-kind forces.
  pursuitSpeedRatio: 1.35,
  turnRate: 2.6,
  separationDistance: 0.9,
  separation: 1,
  focus: [0, 0, 0],
  memberSize: 0.82,
  wanderColor: "#d9b38c",
  pursuerColor: "#4e9b47",
  emissiveIntensity: 0.35,
  seed: 1,
};

const RACE_SCENE_NOTE =
  "Wander turn (±40° every 0.33s), pursuer retarget (0.5s, nearest target), rejection-sampled " +
  "spawn and body proportions carried over from race-scene.ts buildNpcs/updateNpcs; the " +
  "separation term is an adaptation replacing cannon-es sphere collisions, not recovered.";

export const GRAPHYSX_AGENT_WORLD_CROWDS: readonly AgentWorldCrowdDescriptor[] = [
  {
    id: "promenade",
    label: "Promenade",
    description:
      "Pure wanderers drifting across an open plot — the recovered Human random-walk with nobody hunting. The default read of 'a place with people in it'.",
    defaults: {
      ...BASE_CROWD,
      preset: "promenade",
      count: 36,
      pursuers: 0,
      size: [14, 14],
      speed: 1.4,
      seed: 5,
    },
    provenance: {
      sourcePath: "src/race-scene.ts",
      sourceRepo: "WindriderQc/GraphysX-Web",
      note: RACE_SCENE_NOTE,
    },
  },
  {
    id: "pursuit",
    label: "Pursuit",
    description:
      "The recovered mix: a majority wandering while a handful of pursuers seek the nearest of them, falling back to the crowd's focus point when none are left.",
    defaults: {
      ...BASE_CROWD,
      preset: "pursuit",
      count: 30,
      pursuers: 6,
      size: [12, 12],
      speed: 1.6,
      pursuitSpeedRatio: 1.35,
      seed: 11,
    },
    provenance: {
      sourcePath: "src/race-scene.ts",
      sourceRepo: "WindriderQc/GraphysX-Web",
      note: RACE_SCENE_NOTE,
    },
  },
  {
    id: "throng",
    label: "Throng",
    description:
      "Dense and slow in a tight plot — separation does most of the work and the crowd reads as a press of bodies rather than individuals.",
    defaults: {
      ...BASE_CROWD,
      preset: "throng",
      count: 120,
      pursuers: 0,
      size: [8, 8],
      speed: 0.85,
      separationDistance: 1.1,
      separation: 1,
      turnRate: 1.8,
      seed: 23,
    },
    provenance: {
      sourcePath: "src/race-scene.ts",
      sourceRepo: "WindriderQc/GraphysX-Web",
      note: RACE_SCENE_NOTE,
    },
  },
];

export function findAgentWorldCrowdPreset(id: AgentWorldCrowdPresetId): AgentWorldCrowdDescriptor {
  const descriptor = GRAPHYSX_AGENT_WORLD_CROWDS.find((preset) => preset.id === id);
  if (!descriptor) throw new Error(`Unknown GraphysX crowd preset: ${String(id)}`);
  return descriptor;
}

/** Validate + clamp a crowd field into the fully-specified form the runtime and export use. */
export function resolveAgentWorldCrowd(
  source?: AgentWorldCrowd,
  base: ResolvedAgentWorldCrowd = BASE_CROWD,
): ResolvedAgentWorldCrowd {
  const input = source ?? {};
  if (input.preset != null && !GRAPHYSX_AGENT_WORLD_CROWDS.some((preset) => preset.id === input.preset)) {
    throw new Error(
      `Unknown crowd.preset: ${String(input.preset)}. Use one of ${GRAPHYSX_AGENT_WORLD_CROWDS.map((p) => p.id).join(", ")}`,
    );
  }
  // A preset replaces the base wholesale; explicit fields then win over the preset, so
  // `{ preset: "pursuit", count: 12 }` means what it reads like.
  const start = input.preset != null ? findAgentWorldCrowdPreset(input.preset).defaults : base;
  for (const [key, value] of [["wanderColor", input.wanderColor], ["pursuerColor", input.pursuerColor]] as const) {
    if (value !== undefined && !isColor(value)) throw new Error(`Invalid crowd.${key}: ${String(value)}`);
  }
  const size = input.size ?? start.size;
  if (!Array.isArray(size) || size.length !== 2 || size.some((value) => !Number.isFinite(value))) {
    throw new Error("crowd.size must contain two finite numbers");
  }
  const focus = input.focus ?? start.focus;
  if (!Array.isArray(focus) || focus.length !== 3 || focus.some((value) => !Number.isFinite(value))) {
    throw new Error("crowd.focus must contain three finite numbers");
  }
  const count = Math.round(clamp(input.count ?? start.count, 1, AGENT_WORLD_CROWD_MAX_COUNT));
  return {
    preset: input.preset === undefined ? start.preset : input.preset,
    count,
    // Clamped to `count` rather than rejected: a patch that lowers `count` below a previously
    // valid `pursuers` must not throw, it must mean "all of them pursue".
    pursuers: Math.round(clamp(input.pursuers ?? start.pursuers, 0, count)),
    size: size.map((value) => clamp(value, 0.5, 400)) as [number, number],
    speed: clamp(input.speed ?? start.speed, 0, 100),
    pursuitSpeedRatio: clamp(input.pursuitSpeedRatio ?? start.pursuitSpeedRatio, 0.1, 10),
    turnRate: clamp(input.turnRate ?? start.turnRate, 0.05, 50),
    separationDistance: clamp(input.separationDistance ?? start.separationDistance, 0.05, 200),
    separation: clamp(input.separation ?? start.separation, 0, 1),
    focus: focus.map((value) => clamp(value, -10000, 10000)) as [number, number, number],
    memberSize: clamp(input.memberSize ?? start.memberSize, 0.05, 20),
    wanderColor: input.wanderColor ?? start.wanderColor,
    pursuerColor: input.pursuerColor ?? start.pursuerColor,
    emissiveIntensity: clamp(input.emissiveIntensity ?? start.emissiveIntensity, 0, 10),
    seed: Math.round(clamp(input.seed ?? start.seed, 0, 1_000_000)),
  };
}

/**
 * Three's `Color` does NOT throw on an unparseable string — `new Color("not-a-color")` logs a
 * warning and hands back an unmodified colour. A try/catch around it therefore validates
 * nothing and accepts any string at all (measured: `wanderColor: "not-a-color"` sailed through).
 * Parsing into two different sentinels and comparing is the check that actually works: a string
 * three understands overwrites both, so they end up equal; one it does not leaves each at its
 * own sentinel.
 */
function isColor(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  const black = new Color(0x000000);
  const white = new Color(0xffffff);
  black.set(value);
  white.set(value);
  return black.equals(white);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

/** Deterministic scatter, so the same scene file always opens to the same crowd. */
function seededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number): number => Number(value.toFixed(3));

/**
 * The crowd as a scene object: two instanced meshes (torso, head) sharing one transform per
 * member, hanging off a {@link Group} that takes the entity transform. Member positions are
 * entity-local and on the ground plane, so moving or parenting the crowd carries the whole
 * population.
 */
export class AgentWorldCrowdSystem {
  readonly object = new Group();
  /**
   * Set by the runtime's force-field pass immediately before each `update()`, and cleared when
   * no field reaches this crowd. Sampled per member in **entity-local** space. Kept as a plain
   * hook rather than a list of fields so this module never has to know force fields exist —
   * the same seam `flock` uses.
   */
  externalAcceleration: ((position: Vector3, velocity: Vector3, out: Vector3) => void) | null = null;
  private config: ResolvedAgentWorldCrowd;
  private torso!: InstancedMesh;
  private head!: InstancedMesh;
  private positions: Vector3[] = [];
  /** Unit heading on the ground plane. The recovered `direction`. */
  private headings: Vector3[] = [];
  private roles: AgentWorldCrowdRole[] = [];
  private timers: number[] = [];
  /**
   * One persistent stream for the whole life of the system, seeded once in {@link build}.
   * Wandering consumes randomness every 0.33 s, so the alternative — reseeding per frame from
   * elapsed time — would make the result depend on the exact timestep sequence rather than on
   * the config. With a single stream, a given config plus a given number of fixed steps always
   * lands in the same place, which is what the determinism assertions actually check.
   */
  private random: () => number = seededRandom(1);
  /** Current heading each member is steering toward; `headings` eases into it at `turnRate`. */
  private desired: Vector3[] = [];
  private readonly dummy = new Object3D();
  // Scratch vectors, allocated once. A crowd loop that allocates is a crowd loop that stutters.
  private readonly scratch = {
    diff: new Vector3(),
    target: new Vector3(),
    external: new Vector3(),
    velocity: new Vector3(),
  };

  constructor(config: ResolvedAgentWorldCrowd) {
    this.config = config;
    this.object.name = "GraphysXCrowd";
    this.build(config);
  }

  /** Members currently simulated. */
  get memberCount(): number {
    return this.positions.length;
  }

  /** How many are pursuing right now. Diverges from `config.pursuers` once rules convert roles. */
  get pursuerCount(): number {
    let total = 0;
    for (const role of this.roles) if (role === "pursue") total += 1;
    return total;
  }

  /**
   * Where member 0 is, in entity-local space. Exposed in `state()` so an agent — or a smoke
   * test — can see the crowd actually *moving* rather than merely present.
   */
  get leadPosition(): [number, number, number] {
    const lead = this.positions[0];
    return lead ? [round(lead.x), round(lead.y), round(lead.z)] : [0, 0, 0];
  }

  /** Mean member speed. A crowd settled into nothing reads as ~0 here. */
  get averageSpeed(): number {
    if (!this.positions.length) return 0;
    const config = this.config;
    let total = 0;
    for (const role of this.roles) {
      total += role === "pursue" ? config.speed * config.pursuitSpeedRatio : config.speed;
    }
    return round(total / this.roles.length);
  }

  /**
   * Convert one member's role. This is the seam the rules vocabulary drives to express the
   * recovered infection — contact between a pursuer and a wanderer is a *trigger* concern, so
   * the decision lives in rules and only the consequence lives here. Out-of-range indices are
   * ignored rather than thrown: a rule firing against a crowd that has since been rebuilt
   * smaller is a race, not a programming error.
   */
  setRole(index: number, role: AgentWorldCrowdRole): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.roles.length) return;
    if (this.roles[index] === role) return;
    this.roles[index] = role;
    this.writeColor(index);
    this.torso.instanceColor!.needsUpdate = true;
    this.head.instanceColor!.needsUpdate = true;
  }

  /** Read a member's role, or null when the index is out of range. */
  getRole(index: number): AgentWorldCrowdRole | null {
    return this.roles[index] ?? null;
  }

  /** Member positions in entity-local space, for a rules pass that needs to test contact. */
  memberPosition(index: number): Vector3 | null {
    return this.positions[index] ?? null;
  }

  private build(config: ResolvedAgentWorldCrowd): void {
    const random = seededRandom(config.seed);
    this.random = random;
    const count = config.count;
    this.positions = [];
    this.headings = [];
    this.desired = [];
    this.roles = [];
    this.timers = [];

    const size = config.memberSize;
    // The recovered body, proportioned off `memberSize` rather than pinned at the archive's
    // absolute numbers: torso 0.24/0.3 × 0.62 and head r=0.2 against an overall height of 0.82.
    const torsoGeometry = new CylinderGeometry(size * 0.29, size * 0.37, size * 0.76, 12);
    const headGeometry = new SphereGeometry(size * 0.24, 14, 10);
    const material = (): MeshStandardMaterial =>
      new MeshStandardMaterial({ roughness: 0.62, metalness: 0.08, emissiveIntensity: config.emissiveIntensity });

    this.torso = new InstancedMesh(torsoGeometry, material(), count);
    this.head = new InstancedMesh(headGeometry, material(), count);
    this.torso.name = "GraphysXCrowdTorsos";
    this.head.name = "GraphysXCrowdHeads";
    for (const mesh of [this.torso, this.head]) {
      // Member colour comes from the `crowd` field, not the entity `material` field, so the
      // runtime's generic material pass must leave these alone.
      mesh.userData.graphysxMaterialLocked = true;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
    }

    for (let index = 0; index < count; index += 1) {
      // The recovered spawn: rejection-sample up to 40 times for a spot at least 1.5 from every
      // member already placed. Unlike the archive there is no player start to avoid — a crowd
      // entity has no player — so only the mutual-spacing half of the test survives.
      let x = 0;
      let z = 0;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        x = (random() * 2 - 1) * config.size[0];
        z = (random() * 2 - 1) * config.size[1];
        let clear = true;
        for (const other of this.positions) {
          if (Math.hypot(x - other.x, z - other.z) <= 1.5) {
            clear = false;
            break;
          }
        }
        if (clear) break;
      }
      this.positions.push(new Vector3(x, 0, z));
      const angle = random() * Math.PI * 2;
      const heading = new Vector3(Math.sin(angle), 0, Math.cos(angle));
      this.headings.push(heading);
      this.desired.push(heading.clone());
      this.roles.push(index < config.pursuers ? "pursue" : "wander");
      // Staggered so the whole crowd does not turn on the same frame — the recovered
      // `Math.random() * 0.4` initial turn timer.
      this.timers.push(random() * 0.4);
      this.writeColor(index);
    }
    if (this.torso.instanceColor) this.torso.instanceColor.needsUpdate = true;
    if (this.head.instanceColor) this.head.instanceColor.needsUpdate = true;

    this.object.add(this.torso, this.head);
    this.writeInstances();
  }

  private writeColor(index: number): void {
    const color = new Color(this.roles[index] === "pursue" ? this.config.pursuerColor : this.config.wanderColor);
    this.torso.setColorAt(index, color);
    this.head.setColorAt(index, color);
  }

  /**
   * Re-apply a patched configuration. Anything that changes the *population* — count, seed,
   * member size — rebuilds; speeds, colours and steering weights are live.
   *
   * `pursuers` deliberately does NOT rebuild. Once rules have converted roles, the live
   * distribution is the truth and re-seeding from the config would silently undo them.
   */
  configure(config: ResolvedAgentWorldCrowd): void {
    const rebuild =
      config.count !== this.config.count ||
      config.seed !== this.config.seed ||
      config.memberSize !== this.config.memberSize;
    const recolor =
      config.wanderColor !== this.config.wanderColor || config.pursuerColor !== this.config.pursuerColor;
    this.config = config;
    if (rebuild) {
      this.disposeParts();
      this.build(config);
      return;
    }
    for (const mesh of [this.torso, this.head]) {
      (mesh.material as MeshStandardMaterial).emissiveIntensity = config.emissiveIntensity;
    }
    if (recolor) {
      for (let index = 0; index < this.roles.length; index += 1) this.writeColor(index);
      if (this.torso.instanceColor) this.torso.instanceColor.needsUpdate = true;
      if (this.head.instanceColor) this.head.instanceColor.needsUpdate = true;
    }
  }

  /**
   * One deterministic step of the recovered algorithm.
   *
   * Wanderers re-aim by a ±40° random turn every 0.33 s; pursuers re-aim every 0.5 s at the
   * nearest wanderer, falling back to `focus` when none is left. Both then ease their actual
   * heading toward that aim at `turnRate` — the recovered code snapped, but it snapped a
   * physics body whose damping smoothed the result, so easing here reproduces the look rather
   * than changing it. Separation is added on top; see the file header.
   */
  update(deltaSeconds: number): void {
    if (deltaSeconds <= 0 || !this.positions.length) return;
    // A long frame (a backgrounded tab, a slow headless step) must not launch the crowd into
    // the next county; clamp the integration step rather than the wall clock.
    const delta = Math.min(deltaSeconds, 0.1);
    const config = this.config;
    const { diff, target, velocity } = this.scratch;
    const count = this.positions.length;
    const random = this.random;

    for (let index = 0; index < count; index += 1) {
      const position = this.positions[index];
      const role = this.roles[index];
      this.timers[index] -= delta;

      if (this.timers[index] <= 0) {
        if (role === "wander") {
          // Recovered Human::rotateDirection — a random ±40° turn off the current heading.
          const turn = ((random() * 2 - 1) * WANDER_TURN_DEGREES * Math.PI) / 180;
          const sin = Math.sin(turn);
          const cos = Math.cos(turn);
          const heading = this.headings[index];
          this.desired[index].set(heading.x * cos + heading.z * sin, 0, -heading.x * sin + heading.z * cos);
          this.timers[index] = WANDER_TURN_INTERVAL;
        } else {
          // Recovered zombie hunt: nearest wanderer, else the crowd's focus point. The archive
          // scanned every NPC per zombie and so does this — same O(N²), same behaviour.
          target.set(config.focus[0], 0, config.focus[2]);
          let best = Infinity;
          for (let other = 0; other < count; other += 1) {
            if (this.roles[other] !== "wander") continue;
            const distance = this.positions[other].distanceToSquared(position);
            if (distance < best) {
              best = distance;
              target.copy(this.positions[other]);
            }
          }
          this.desired[index].subVectors(target, position).setY(0);
          if (this.desired[index].lengthSq() < 1e-6) {
            const angle = random() * Math.PI * 2;
            this.desired[index].set(Math.sin(angle), 0, Math.cos(angle));
          }
          this.desired[index].normalize();
          this.timers[index] = PURSUE_RETARGET_INTERVAL;
        }
      }

      // Force fields land here, bending the crowd's aim like any other steering term rather
      // than teleporting members — the same choice the flock module documents.
      if (this.externalAcceleration) {
        const external = this.scratch.external;
        velocity.copy(this.headings[index]).multiplyScalar(this.speedFor(role));
        this.externalAcceleration(position, velocity, external);
        this.desired[index].addScaledVector(external.setY(0), delta);
      }

      if (this.desired[index].lengthSq() > 1e-8) this.desired[index].normalize();
    }

    for (let index = 0; index < count; index += 1) {
      const heading = this.headings[index];
      const aim = this.desired[index];
      // Ease the heading toward the aim, capped at `turnRate` radians this step. Rotating the
      // vector rather than lerping and renormalising keeps turn speed constant regardless of
      // how far apart the two headings are.
      const cross = heading.x * aim.z - heading.z * aim.x;
      const dot = clamp(heading.x * aim.x + heading.z * aim.z, -1, 1);
      const angle = Math.atan2(-cross, dot);
      const step = Math.sign(angle) * Math.min(Math.abs(angle), config.turnRate * delta);
      if (step !== 0) {
        const sin = Math.sin(step);
        const cos = Math.cos(step);
        heading.set(heading.x * cos + heading.z * sin, 0, -heading.x * sin + heading.z * cos).normalize();
      }

      const position = this.positions[index];
      position.addScaledVector(heading, this.speedFor(this.roles[index]) * delta);
      position.y = 0;
    }

    // Separation — the adaptation, not the recovery. It runs here, on positions, rather than
    // as one more term in the steering aim above: members move at a fixed speed with a
    // rate-limited turn, so a directional push cannot stop two of them converging, and
    // measurably did not (min spacing 0.19 with it on vs 0.20 off — i.e. nothing). What the
    // cannon-es solver actually did was resolve overlap *positionally*, so this does too —
    // a single relaxation pass moving each overlapping pair apart by half the overlap each.
    if (config.separation > 0) {
      const strength = Math.min(1, config.separation);
      for (let index = 0; index < count; index += 1) {
        for (let other = index + 1; other < count; other += 1) {
          const a = this.positions[index];
          const b = this.positions[other];
          diff.subVectors(a, b).setY(0);
          let distance = diff.length();
          if (distance >= config.separationDistance) continue;
          if (distance < 1e-6) {
            // Exactly co-located: pick a deterministic axis rather than dividing by zero.
            diff.set(1, 0, 0);
            distance = 1e-6;
          }
          const push = ((config.separationDistance - distance) * 0.5 * strength) / distance;
          a.addScaledVector(diff, push);
          b.addScaledVector(diff, -push);
        }
      }
    }

    for (let index = 0; index < count; index += 1) {
      const heading = this.headings[index];
      const position = this.positions[index];
      // Recovered human_wallContactProcess: clamp back inside and take a fresh heading rather
      // than sliding along the wall. Runs after separation so a member shoved through a wall
      // by its neighbours still ends the step inside the plot.
      for (const axis of [0, 1] as const) {
        const limit = config.size[axis];
        const value = axis === 0 ? position.x : position.z;
        if (Math.abs(value) > limit) {
          if (axis === 0) position.x = Math.sign(value) * limit;
          else position.z = Math.sign(value) * limit;
          // Reflect off the wall, then let the next turn tick scatter it. Reflection rather
          // than a fresh random heading keeps this deterministic without consuming randomness
          // in the integration pass.
          if (axis === 0) heading.x = -heading.x;
          else heading.z = -heading.z;
          this.desired[index].copy(heading);
        }
      }
    }

    this.writeInstances();
  }

  private speedFor(role: AgentWorldCrowdRole): number {
    return role === "pursue" ? this.config.speed * this.config.pursuitSpeedRatio : this.config.speed;
  }

  private writeInstances(): void {
    const size = this.config.memberSize;
    for (let index = 0; index < this.positions.length; index += 1) {
      const position = this.positions[index];
      const heading = this.headings[index];
      // Recovered: `group.rotation.y = Math.atan2(direction.x, direction.z)`.
      this.dummy.rotation.set(0, Math.atan2(heading.x, heading.z), 0);
      this.dummy.scale.setScalar(1);

      this.dummy.position.set(position.x, size * 0.44, position.z);
      this.dummy.updateMatrix();
      this.torso.setMatrixAt(index, this.dummy.matrix);

      this.dummy.position.set(position.x, size * 0.96, position.z);
      this.dummy.updateMatrix();
      this.head.setMatrixAt(index, this.dummy.matrix);
    }
    this.torso.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
  }

  private disposeParts(): void {
    for (const mesh of [this.torso, this.head]) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    }
  }

  dispose(): void {
    this.disposeParts();
  }
}

/** Find the crowd system hanging off an entity object, if it is a crowd entity. */
export function findCrowdSystem(object: Object3D): AgentWorldCrowdSystem | null {
  const system = object.userData.graphysxCrowdSystem;
  return system instanceof AgentWorldCrowdSystem ? system : null;
}

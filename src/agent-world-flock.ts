import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from "three";

/**
 * Flocking as first-class `graphysx.agent-world/v2` scene vocabulary — the missing proof of
 * PRODUCT_SPEC §3 pillar 3, "behavior is first-class vocabulary, not decoration".
 *
 * ## Provenance
 *
 * The steering is Reynolds separation/alignment/cohesion as written in the GraphysX
 * Nature-of-Code sketches at `SBQC-graphysx-public/public/Projects/Nature of Code/flock/`
 * (`boid.js`, `flock.js`): each member sums a separation push weighted by 1/distance, an
 * alignment pull toward the mean neighbour velocity, and a cohesion pull toward the mean
 * neighbour position; each term is normalised to `speed`, has the member's own velocity
 * subtracted (the classic "desired minus current" steering form), and is clamped to
 * `maxForce`. The p5 original weighted them 1 / 3 / 1, which is why alignment defaults
 * highest here.
 *
 * The 3D adaptation — the sphere-tangent projection, the `InstancedMesh` with per-instance
 * orientation from velocity, and the ring-buffer trail history — is lifted from
 * `src/nature-lab.ts` (`buildFlockPlanet` / `updateFlock`), which had it working and correct
 * but reachable only through `?host=legacy`. This module is that code graduated, not a
 * rewrite: the neighbour loop, the force clamps, the tangent projection and the trail packing
 * are the same algorithm.
 *
 * ## Why an entity type, not a behavior
 *
 * The six shipped behaviors move *the one object they are attached to*. Flocking is not a
 * property of an object, it is a population: N members that only exist relative to each
 * other, drawn in one instanced draw call. Modelling it as a behavior would mean either N
 * entities each carrying a behavior that has to find its own flockmates by tag (N draw calls,
 * O(N²) scene-graph lookups, and a "flock" that is really a naming convention), or a
 * behavior on a group that secretly owns children the scene model cannot see. An entity type
 * is the honest shape — the same call `emitter` made for particles.
 *
 * ## The frame budget (pillar 5: performant by intent)
 *
 * The neighbour search is the naive O(N²) pair loop, exactly as recovered. That is the right
 * trade at these counts — a spatial hash costs more to maintain than it saves below a few
 * hundred agents — but it is also why {@link AGENT_WORLD_FLOCK_MAX_COUNT} is a hard cap of
 * 240 (≈57k pair tests per step, sub-millisecond) rather than a suggestion. Rendering is one
 * `InstancedMesh` draw call regardless of count, plus one `LineSegments` call when trails are
 * on. Trails are **off by default**: they cost a full rewrite of a
 * `count × trailLength × 2 × 3` float array every step, so they are opt-in per entity.
 */

/** Container the flock is confined to. */
export type AgentWorldFlockBounds = "sphere" | "box";

export type AgentWorldFlock = {
  /**
   * Curated preset to start from. Explicit fields below win over the preset's. `null` means
   * "no preset", which is what a serialised hand-tuned flock round-trips as.
   */
  preset?: AgentWorldFlockPresetId | null;
  /** Number of members. Capped at {@link AGENT_WORLD_FLOCK_MAX_COUNT}. */
  count?: number;
  /**
   * `sphere` rides the members on a shell of `radius` (the recovered nature-lab constraint —
   * a murmuration around a planet). `box` confines them to a `size` volume with a soft
   * turn-back at the walls, which is what reads as birds over a landscape.
   */
  bounds?: AgentWorldFlockBounds;
  /** Shell radius for `sphere` bounds. */
  radius?: number;
  /** Half-extents of the `box` volume, entity-local. */
  size?: [number, number, number];
  /** Reynolds weights. The p5 original ran 1 / 3 / 1. */
  separation?: number;
  alignment?: number;
  cohesion?: number;
  /** Below this distance a member pushes away; above `neighborDistance` it ignores others. */
  separationDistance?: number;
  neighborDistance?: number;
  /** Cruise speed in world units per second. */
  speed?: number;
  /** Steering force ceiling. Higher turns tighter and reads more agitated. */
  maxForce?: number;
  /** Member body length in world units. */
  memberSize?: number;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  /** Motion trails. Off by default — see the frame-budget note in the file header. */
  trails?: boolean;
  /** Samples retained per member when trails are on. */
  trailLength?: number;
  trailColor?: string;
  /** Deterministic seed for the initial scatter and per-member colour jitter. */
  seed?: number;
};

export type ResolvedAgentWorldFlock = {
  preset: AgentWorldFlockPresetId | null;
  count: number;
  bounds: AgentWorldFlockBounds;
  radius: number;
  size: [number, number, number];
  separation: number;
  alignment: number;
  cohesion: number;
  separationDistance: number;
  neighborDistance: number;
  speed: number;
  maxForce: number;
  memberSize: number;
  color: string;
  emissive: string;
  emissiveIntensity: number;
  trails: boolean;
  trailLength: number;
  trailColor: string;
  seed: number;
};

/**
 * Pillar 5 ceiling. The neighbour search is O(N²) per step; 240 members is ~57k pair tests,
 * which stays sub-millisecond. No preset and no agent call may exceed it.
 */
export const AGENT_WORLD_FLOCK_MAX_COUNT = 240;

/** Trail memory is `count × trailLength × 6` floats, rewritten every step. */
export const AGENT_WORLD_FLOCK_MAX_TRAIL_LENGTH = 48;

export type AgentWorldFlockPresetId = "starlings" | "koi" | "orbital-swarm";

export type AgentWorldFlockDescriptor = {
  id: AgentWorldFlockPresetId;
  label: string;
  description: string;
  defaults: ResolvedAgentWorldFlock;
  /** Where the numbers came from. */
  provenance: {
    sourcePath: string;
    sourceRepo: string;
    note: string;
  };
};

const BASE_FLOCK: ResolvedAgentWorldFlock = {
  preset: null,
  count: 60,
  bounds: "box",
  radius: 5.25,
  size: [12, 5, 12],
  // p5 boid.js: sep.mult(1), ali.mult(3), coh.mult(1).
  separation: 1,
  alignment: 3,
  cohesion: 1,
  separationDistance: 1.5,
  neighborDistance: 4.5,
  speed: 3,
  maxForce: 0.6,
  memberSize: 0.42,
  color: "#d9fbff",
  emissive: "#167ca0",
  emissiveIntensity: 0.72,
  trails: false,
  trailLength: 24,
  trailColor: "#56dfff",
  seed: 1,
};

const NATURE_LAB_NOTE =
  "Reynolds steering from the p5 flock sketch (sep/ali/coh weighted 1/3/1); 3D adaptation, " +
  "instancing and trail ring-buffer graduated from src/nature-lab.ts buildFlockPlanet/updateFlock.";

export const GRAPHYSX_AGENT_WORLD_FLOCKS: readonly AgentWorldFlockDescriptor[] = [
  {
    id: "starlings",
    label: "Starlings",
    description:
      "A tight murmuration in a wide, shallow box — fast, high alignment, sharp turns at the walls. The default read of 'birds over a landscape'.",
    defaults: {
      ...BASE_FLOCK,
      preset: "starlings",
      count: 90,
      bounds: "box",
      size: [16, 5, 16],
      speed: 4.4,
      maxForce: 0.85,
      alignment: 3.2,
      separationDistance: 1.35,
      neighborDistance: 4.2,
      memberSize: 0.4,
      color: "#e8f6ff",
      emissive: "#1f6f96",
      emissiveIntensity: 0.5,
      seed: 7,
    },
    provenance: {
      sourcePath: "public/Projects/Nature of Code/flock/boid.js",
      sourceRepo: "WindriderQc/SBQC-graphysx-public",
      note: NATURE_LAB_NOTE,
    },
  },
  {
    id: "koi",
    label: "Koi",
    description:
      "Slow, heavy, loosely cohesive — a shoal drifting in a shallow volume. Reads well just above a water surface.",
    defaults: {
      ...BASE_FLOCK,
      preset: "koi",
      count: 48,
      bounds: "box",
      size: [10, 1.6, 10],
      speed: 1.5,
      maxForce: 0.32,
      separation: 1.4,
      alignment: 2,
      cohesion: 1.3,
      separationDistance: 1.7,
      neighborDistance: 5,
      memberSize: 0.55,
      color: "#ffd9a8",
      emissive: "#a3480d",
      emissiveIntensity: 0.55,
      seed: 3,
    },
    provenance: {
      sourcePath: "public/Projects/Nature of Code/flock/boid.js",
      sourceRepo: "WindriderQc/SBQC-graphysx-public",
      note: NATURE_LAB_NOTE,
    },
  },
  {
    id: "orbital-swarm",
    label: "Orbital Swarm",
    description:
      "The recovered nature-lab constraint verbatim: members ride the tangent plane of a sphere shell, so the flock wraps a planet instead of filling a box.",
    defaults: {
      ...BASE_FLOCK,
      preset: "orbital-swarm",
      count: 60,
      bounds: "sphere",
      radius: 5.25,
      speed: 1.12,
      maxForce: 0.58,
      separationDistance: 0.78,
      neighborDistance: 1.75,
      memberSize: 0.38,
      trails: true,
      trailLength: 32,
      seed: 1,
    },
    provenance: {
      sourcePath: "src/nature-lab.ts",
      sourceRepo: "WindriderQc/GraphysX-Web",
      note: "Sphere-tangent flock lesson, count 60 / radius 5.25 / maxForce 0.58 carried over unchanged.",
    },
  },
];

export function findAgentWorldFlockPreset(id: AgentWorldFlockPresetId): AgentWorldFlockDescriptor {
  const descriptor = GRAPHYSX_AGENT_WORLD_FLOCKS.find((preset) => preset.id === id);
  if (!descriptor) throw new Error(`Unknown GraphysX flock preset: ${String(id)}`);
  return descriptor;
}

/** Validate + clamp a flock field into the fully-specified form the runtime and export use. */
export function resolveAgentWorldFlock(
  source?: AgentWorldFlock,
  base: ResolvedAgentWorldFlock = BASE_FLOCK,
): ResolvedAgentWorldFlock {
  const input = source ?? {};
  if (input.preset != null && !GRAPHYSX_AGENT_WORLD_FLOCKS.some((preset) => preset.id === input.preset)) {
    throw new Error(
      `Unknown flock.preset: ${String(input.preset)}. Use one of ${GRAPHYSX_AGENT_WORLD_FLOCKS.map((p) => p.id).join(", ")}`,
    );
  }
  // A preset replaces the base wholesale; explicit fields then win over the preset. That way
  // `{ preset: "koi", count: 20 }` means what it reads like.
  const start = input.preset != null ? findAgentWorldFlockPreset(input.preset).defaults : base;
  if (input.bounds !== undefined && input.bounds !== "sphere" && input.bounds !== "box") {
    throw new Error(`Invalid flock.bounds: ${String(input.bounds)}. Use "sphere" or "box"`);
  }
  for (const [key, value] of [["color", input.color], ["emissive", input.emissive], ["trailColor", input.trailColor]] as const) {
    if (value !== undefined && !isColor(value)) throw new Error(`Invalid flock.${key}: ${String(value)}`);
  }
  const size = input.size ?? start.size;
  if (!Array.isArray(size) || size.length !== 3 || size.some((value) => !Number.isFinite(value))) {
    throw new Error("flock.size must contain three finite numbers");
  }
  return {
    preset: input.preset === undefined ? start.preset : input.preset,
    count: Math.round(clamp(input.count ?? start.count, 1, AGENT_WORLD_FLOCK_MAX_COUNT)),
    bounds: input.bounds ?? start.bounds,
    radius: clamp(input.radius ?? start.radius, 0.5, 400),
    size: size.map((value) => clamp(value, 0.5, 400)) as [number, number, number],
    separation: clamp(input.separation ?? start.separation, 0, 20),
    alignment: clamp(input.alignment ?? start.alignment, 0, 20),
    cohesion: clamp(input.cohesion ?? start.cohesion, 0, 20),
    separationDistance: clamp(input.separationDistance ?? start.separationDistance, 0.05, 200),
    neighborDistance: clamp(input.neighborDistance ?? start.neighborDistance, 0.05, 400),
    speed: clamp(input.speed ?? start.speed, 0, 100),
    maxForce: clamp(input.maxForce ?? start.maxForce, 0.001, 50),
    memberSize: clamp(input.memberSize ?? start.memberSize, 0.02, 20),
    color: input.color ?? start.color,
    emissive: input.emissive ?? start.emissive,
    emissiveIntensity: clamp(input.emissiveIntensity ?? start.emissiveIntensity, 0, 10),
    trails: input.trails ?? start.trails,
    trailLength: Math.round(clamp(input.trailLength ?? start.trailLength, 2, AGENT_WORLD_FLOCK_MAX_TRAIL_LENGTH)),
    trailColor: input.trailColor ?? start.trailColor,
    seed: Math.round(clamp(input.seed ?? start.seed, 0, 1_000_000)),
  };
}

function isColor(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    new Color(value);
    return true;
  } catch {
    return false;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

/** Deterministic scatter, so the same scene file always opens to the same flock. */
function seededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomUnitVector(random: () => number): Vector3 {
  const z = random() * 2 - 1;
  const angle = random() * Math.PI * 2;
  const radial = Math.sqrt(Math.max(0, 1 - z * z));
  return new Vector3(Math.cos(angle) * radial, Math.sin(angle) * radial, z);
}

const UP = new Vector3(0, 1, 0);

/**
 * The flock as a scene object: one instanced body mesh plus an optional trail line set,
 * both hanging off a {@link Group} that takes the entity transform. Member positions are
 * entity-local, so moving or parenting the flock entity carries the whole population.
 */
export class AgentWorldFlockSystem {
  readonly object = new Group();
  private config: ResolvedAgentWorldFlock;
  private mesh!: InstancedMesh;
  private trails: LineSegments | null = null;
  private positions: Vector3[] = [];
  private velocities: Vector3[] = [];
  private trailHistory: Vector3[][] = [];
  private elapsed = 0;
  private readonly dummy = new Object3D();
  // Scratch vectors, allocated once. The recovered code did the same — a boid loop that
  // allocates is a boid loop that stutters.
  private readonly scratch = {
    separation: new Vector3(),
    alignment: new Vector3(),
    cohesion: new Vector3(),
    diff: new Vector3(),
    normal: new Vector3(),
    desired: new Vector3(),
  };
  private accelerations: Vector3[] = [];

  constructor(config: ResolvedAgentWorldFlock) {
    this.config = config;
    this.object.name = "GraphysXFlock";
    this.build(config);
  }

  /** Members currently simulated. */
  get memberCount(): number {
    return this.positions.length;
  }

  /**
   * Where member 0 is, in entity-local space. Exposed in `state()` so an agent — or a smoke
   * test — can see that the flock is actually *moving* rather than merely present.
   */
  get leadPosition(): [number, number, number] {
    const lead = this.positions[0];
    return lead ? [round(lead.x), round(lead.y), round(lead.z)] : [0, 0, 0];
  }

  /** Mean member speed. A settled-into-nothing flock reads as ~0 here. */
  get averageSpeed(): number {
    if (!this.velocities.length) return 0;
    let total = 0;
    for (const velocity of this.velocities) total += velocity.length();
    return round(total / this.velocities.length);
  }

  private build(config: ResolvedAgentWorldFlock): void {
    const random = seededRandom(config.seed);
    const count = config.count;
    this.positions = [];
    this.velocities = [];
    this.accelerations = Array.from({ length: count }, () => new Vector3());

    const mesh = new InstancedMesh(
      // A cone pointing +Y, oriented per instance from its velocity — the recovered body.
      new ConeGeometry(config.memberSize * 0.29, config.memberSize, 5),
      new MeshStandardMaterial({
        color: new Color(config.color),
        emissive: new Color(config.emissive),
        emissiveIntensity: config.emissiveIntensity,
        roughness: 0.28,
        metalness: 0.18,
      }),
      count,
    );
    mesh.name = "GraphysXFlockMembers";
    // Member colour comes from the `flock` field, not the entity `material` field, so the
    // runtime's generic material pass must leave this alone.
    mesh.userData.graphysxMaterialLocked = true;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;

    for (let index = 0; index < count; index += 1) {
      if (config.bounds === "sphere") {
        // The recovered scatter: a Fibonacci sphere, jittered, with a tangent launch velocity.
        const y = 1 - (index / Math.max(1, count - 1)) * 2;
        const radial = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = Math.PI * (3 - Math.sqrt(5)) * index + (random() - 0.5) * 0.18;
        const position = new Vector3(Math.cos(theta) * radial, y, Math.sin(theta) * radial).multiplyScalar(config.radius);
        const tangent = randomUnitVector(random).cross(position).normalize().multiplyScalar(config.speed * (0.55 + random() * 0.3));
        this.positions.push(position);
        this.velocities.push(tangent);
      } else {
        const position = new Vector3(
          (random() * 2 - 1) * config.size[0] * 0.7,
          (random() * 2 - 1) * config.size[1] * 0.7,
          (random() * 2 - 1) * config.size[2] * 0.7,
        );
        this.positions.push(position);
        this.velocities.push(randomUnitVector(random).multiplyScalar(config.speed * (0.6 + random() * 0.4)));
      }
      mesh.setColorAt(index, new Color(config.color).offsetHSL(0, 0, (random() - 0.5) * 0.18));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.mesh = mesh;
    this.object.add(mesh);

    if (config.trails) {
      // Ring buffer per member, packed into one LineSegments — the nature-lab trail, budgeted.
      this.trailHistory = this.positions.map((position) =>
        Array.from({ length: config.trailLength }, () => position.clone()),
      );
      const array = new Float32Array(count * (config.trailLength - 1) * 2 * 3);
      const attribute = new Float32BufferAttribute(array, 3);
      attribute.setUsage(DynamicDrawUsage);
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", attribute);
      this.trails = new LineSegments(
        geometry,
        new LineBasicMaterial({
          color: new Color(config.trailColor),
          transparent: true,
          opacity: 0.34,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.trails.name = "GraphysXFlockTrails";
      this.trails.frustumCulled = false;
      this.object.add(this.trails);
    } else {
      this.trailHistory = [];
    }
    this.writeInstances();
  }

  /**
   * Re-apply a patched configuration. Anything that changes the *population* — count, bounds
   * geometry, trails, seed — rebuilds; weights, speeds and colours are live.
   */
  configure(config: ResolvedAgentWorldFlock): void {
    const rebuild =
      config.count !== this.config.count ||
      config.bounds !== this.config.bounds ||
      config.trails !== this.config.trails ||
      config.trailLength !== this.config.trailLength ||
      config.memberSize !== this.config.memberSize ||
      config.seed !== this.config.seed;
    this.config = config;
    if (rebuild) {
      this.disposeParts();
      this.build(config);
      return;
    }
    const material = this.mesh.material as MeshStandardMaterial;
    material.color.set(config.color);
    material.emissive.set(config.emissive);
    material.emissiveIntensity = config.emissiveIntensity;
    if (this.trails) (this.trails.material as LineBasicMaterial).color.set(config.trailColor);
  }

  /**
   * One deterministic step of the recovered algorithm.
   *
   * The neighbour loop is the p5 original transposed to 3D: for every ordered pair, a
   * separation push weighted by 1/distance inside `separationDistance`, and an alignment +
   * cohesion accumulation inside `neighborDistance`. Each term is then normalised to cruise
   * speed, has the member's current velocity subtracted, and is clamped to `maxForce` —
   * Reynolds' "steering = desired - velocity" in full.
   */
  update(deltaSeconds: number): void {
    if (deltaSeconds <= 0 || !this.positions.length) return;
    // A long frame (a backgrounded tab, a slow headless step) must not launch the flock into
    // the next county; clamp the integration step rather than the wall clock.
    const delta = Math.min(deltaSeconds, 0.1);
    this.elapsed += delta;

    const config = this.config;
    const { separation, alignment, cohesion, diff, normal, desired } = this.scratch;
    const maxSpeed = config.speed;
    const maxForce = config.maxForce;
    const separationDistance = config.separationDistance;
    const neighborDistance = config.neighborDistance;
    const onSphere = config.bounds === "sphere";
    const count = this.positions.length;

    for (let index = 0; index < count; index += 1) {
      const acceleration = this.accelerations[index].set(0, 0, 0);
      separation.set(0, 0, 0);
      alignment.set(0, 0, 0);
      cohesion.set(0, 0, 0);
      let separationCount = 0;
      let neighborCount = 0;
      const position = this.positions[index];
      for (let other = 0; other < count; other += 1) {
        if (index === other) continue;
        diff.subVectors(position, this.positions[other]);
        const distance = diff.length();
        if (distance > 0 && distance < separationDistance) {
          separation.addScaledVector(diff.normalize(), 1 / Math.max(distance, 0.08));
          separationCount += 1;
        }
        if (distance < neighborDistance) {
          alignment.add(this.velocities[other]);
          cohesion.add(this.positions[other]);
          neighborCount += 1;
        }
      }
      // On a sphere the whole simulation lives in the tangent plane at the member's own
      // position; in a box there is no such constraint and the projections are skipped.
      normal.copy(position).normalize();
      if (separationCount > 0) {
        separation.divideScalar(separationCount);
        if (onSphere) separation.projectOnPlane(normal);
        if (separation.lengthSq() > 1e-8) acceleration.add(separation.setLength(maxForce * config.separation));
      }
      if (neighborCount > 0) {
        alignment.divideScalar(neighborCount);
        if (onSphere) alignment.projectOnPlane(normal);
        if (alignment.lengthSq() > 1e-8) {
          acceleration.add(alignment.setLength(maxSpeed).sub(this.velocities[index]).clampLength(0, maxForce * config.alignment));
        }
        cohesion.divideScalar(neighborCount);
        desired.subVectors(cohesion, position);
        if (onSphere) desired.projectOnPlane(normal);
        if (desired.lengthSq() > 1e-8) {
          acceleration.add(desired.setLength(maxSpeed).sub(this.velocities[index]).clampLength(0, maxForce * config.cohesion));
        }
      }
      if (onSphere) {
        // The recovered swirl term: a slow curl around the shell so the murmuration keeps
        // circulating instead of settling into a static cap.
        const curl = diff.set(-normal.z, Math.sin(this.elapsed * 0.21 + index) * 0.15, normal.x).projectOnPlane(normal);
        if (curl.lengthSq() > 1e-8) acceleration.addScaledVector(curl.normalize(), 0.12);
      } else {
        // Soft box containment. A hard wrap teleports members through their own neighbours and
        // shreds the flock; a steering force proportional to overshoot makes the whole group
        // bank away from the wall, which is the thing that actually reads as flocking.
        for (let axis = 0; axis < 3; axis += 1) {
          const limit = config.size[axis];
          const value = position.getComponent(axis);
          const overshoot = Math.abs(value) - limit;
          if (overshoot > -limit * 0.25) {
            const push = Math.min(4, (overshoot + limit * 0.25) / Math.max(0.001, limit * 0.25));
            acceleration.setComponent(
              axis,
              acceleration.getComponent(axis) - Math.sign(value) * push * maxForce * 3,
            );
          }
        }
      }
    }

    for (let index = 0; index < count; index += 1) {
      const position = this.positions[index];
      const velocity = this.velocities[index];
      velocity.addScaledVector(this.accelerations[index], delta).clampLength(maxSpeed * 0.38, maxSpeed);
      position.addScaledVector(velocity, delta);
      if (onSphere) {
        // Snap back onto the shell and re-tangent the velocity, as recovered.
        normal.copy(position).normalize();
        position.copy(normal).multiplyScalar(config.radius);
        velocity.projectOnPlane(normal);
        if (velocity.lengthSq() < 0.001) {
          velocity.copy(randomUnitVector(seededRandom(config.seed + index))).cross(normal).normalize().multiplyScalar(maxSpeed * 0.6);
        }
      } else {
        // Containment is a force, not a wall, so a member can briefly overshoot. Hard-clamp
        // well outside the volume purely so a pathological config cannot lose the flock.
        for (let axis = 0; axis < 3; axis += 1) {
          const limit = config.size[axis] * 1.5;
          if (Math.abs(position.getComponent(axis)) > limit) {
            position.setComponent(axis, Math.sign(position.getComponent(axis)) * limit);
            velocity.setComponent(axis, -velocity.getComponent(axis) * 0.5);
          }
        }
      }
    }

    this.writeInstances();
    this.writeTrails();
  }

  private writeInstances(): void {
    for (let index = 0; index < this.positions.length; index += 1) {
      const velocity = this.velocities[index];
      this.dummy.position.copy(this.positions[index]);
      if (velocity.lengthSq() > 1e-8) {
        this.scratch.diff.copy(velocity).normalize();
        this.dummy.quaternion.setFromUnitVectors(UP, this.scratch.diff);
      }
      this.dummy.scale.setScalar(0.82 + (index % 7) * 0.035);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private writeTrails(): void {
    if (!this.trails) return;
    const attribute = this.trails.geometry.getAttribute("position");
    const array = attribute.array as Float32Array;
    let offset = 0;
    for (let index = 0; index < this.trailHistory.length; index += 1) {
      const history = this.trailHistory[index];
      history.push(this.positions[index].clone());
      if (history.length > this.config.trailLength) history.shift();
      for (let point = 1; point < history.length; point += 1) {
        const previous = history[point - 1];
        const current = history[point];
        array[offset++] = previous.x;
        array[offset++] = previous.y;
        array[offset++] = previous.z;
        array[offset++] = current.x;
        array[offset++] = current.y;
        array[offset++] = current.z;
      }
    }
    attribute.needsUpdate = true;
    this.trails.geometry.setDrawRange(0, offset / 3);
  }

  private disposeParts(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
    this.mesh.dispose();
    if (this.trails) {
      this.trails.removeFromParent();
      this.trails.geometry.dispose();
      (this.trails.material as LineBasicMaterial).dispose();
      this.trails = null;
    }
  }

  dispose(): void {
    this.disposeParts();
  }
}

/** Find the flock system hanging off an entity object, if it is a flock entity. */
export function findFlockSystem(object: Object3D): AgentWorldFlockSystem | null {
  const system = object.userData.graphysxFlockSystem;
  return system instanceof AgentWorldFlockSystem ? system : null;
}

const round = (value: number): number => Number(value.toFixed(3));

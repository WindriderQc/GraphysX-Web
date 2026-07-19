import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";

/**
 * Force fields as first-class `graphysx.agent-world/v2` scene vocabulary — the second
 * Nature-of-Code system to graduate, after flocking.
 *
 * ## Provenance
 *
 * Three of the four kinds are the p5 originals in
 * `SBQC-graphysx-public/public/Projects/Nature of Code/sAll/`, transposed to 3D:
 *
 * - `attractor` is `attractor.js` verbatim in shape — direction to the centre, distance
 *   clamped by an "artificial constraint" (the original's `constrain(distance, 5, 25)`,
 *   here {@link AgentWorldForceField.minimumDistance}), magnitude `G·m/d²`. The original
 *   computed a *force* and `Animal.applyForce` divided it by mass again, so the net effect
 *   on a mover was an *acceleration* proportional to `1/d²` and independent of its own mass.
 *   That is real gravity, and it is what this reproduces.
 * - `flow` is `flowfield.js` — "vehicles sample a spatial vector field and steer toward it".
 *   The p5 field was a Perlin lookup table baked at construction; the 3D adaptation in
 *   `src/nature-lab.ts` replaced it with the closed-form `flowAngle()` below so the field can
 *   animate and be sampled at any point without a grid. That function is carried over
 *   unchanged (see {@link flowAngle}) and only its coefficients are parameterised.
 * - `drag` is `liquid.js` — "magnitude is coefficient × speed squared, direction is the
 *   inverse of velocity", applied only to movers the volume `contains()`.
 *
 * `vortex` is the one kind with no p5 original: it is the swirl/curl term from
 * `nature-lab.ts`'s sphere-constrained flock, straightened out to spin around the field's
 * own Y axis. Recorded here as an extension, not as recovered code.
 *
 * `path.js` — the fourth file in the same folder — is deliberately **not** here. Path
 * following steers one mover along one curve; that is the existing `follow-spline`
 * behavior, and re-expressing it as a field would be a second way to say the same thing.
 *
 * ## Why an entity type, and not a behavior or a per-entity field
 *
 * Flocking graduated as an entity type because a flock is a *population* that only exists
 * relative to itself. A force field is the opposite: it exists only relative to *other*
 * things. So the decision is genuinely different, and it splits:
 *
 * - **Its identity is an entity.** A field has a position (an inverse-square attractor is
 *   *defined* by where it is), a radius, a lifetime, a label, a place in the scene tree, and
 *   it has to serialise, undo, re-parent and round-trip like anything else. Every one of
 *   those is what the entity model already provides. A behavior could not carry it: the six
 *   shipped behaviors move the single object they are attached to, and a field moves
 *   everything *except* itself. A per-entity property (`box.affectedByGravityWell`) would
 *   invert the relationship — N writes to add one field, N more to remove it, and no object
 *   in the scene that *is* the field.
 * - **Its effect is not an entity.** Unlike a flock, the field's own `Object3D` is a
 *   visualiser and nothing else; deleting the gizmo would change nothing about the physics.
 *   The simulation coupling therefore does not live in this module's `update()` the way the
 *   flock's does. It lives in the runtime, as a pass over other entities run immediately
 *   before the cannon step — which is the only place that can see rigid bodies, particle
 *   systems and flocks at once.
 *
 * The honest summary: **entity for identity, runtime pass for effect.** This module owns the
 * schema, the sampling maths and the visualiser; it deliberately owns no list of victims.
 *
 * ## What it composes with
 *
 * {@link sampleForceFieldAcceleration} returns an acceleration, not a force, so the same
 * number is meaningful to all three consumers:
 *
 * | consumer | how it is applied |
 * | --- | --- |
 * | dynamic rigid body | `body.applyForce(a · mass)` — Newton, so a heavy crate and a light ball fall into an attractor together |
 * | particle in an emitter | added to the particle velocity, next to `emitter.gravity` |
 * | flock member | added to the steering acceleration, next to separation/alignment/cohesion |
 *
 * Static, kinematic and trigger bodies are untouched by design: a field that shoved the
 * ground around would be a bug, not a feature.
 *
 * ## The frame budget (pillar 5: performant by intent)
 *
 * The cost is `fields × affected samples` per step, and every term in that product is
 * bounded. {@link AGENT_WORLD_FORCE_FIELD_MAX_VISUAL_VECTORS} caps the visualiser at 4096
 * line segments (rewritten only while `visualize` is on and the entity is visible), and the
 * sampling itself is branch-and-arithmetic with no allocation — the scratch vectors are
 * owned by the caller. The expensive consumer is particles, because an emitter can hold
 * thousands: `affectsParticles` is therefore **off by default** on every preset except
 * `flow-garden`, in the same spirit as flock trails.
 */

/** What the field does to whatever is inside it. */
export type AgentWorldForceFieldKind = "attractor" | "flow" | "drag" | "vortex";

/** The region of influence, entity-local. `infinite` ignores `radius`/`size` entirely. */
export type AgentWorldForceFieldShape = "sphere" | "box" | "infinite";

export type AgentWorldForceField = {
  /**
   * Curated preset to start from. Explicit fields below win over the preset's. `null` means
   * "no preset", which is what a serialised hand-tuned field round-trips as.
   */
  preset?: AgentWorldForceFieldPresetId | null;
  kind?: AgentWorldForceFieldKind;
  shape?: AgentWorldForceFieldShape;
  /** Radius of influence for `sphere` shapes, in world units. */
  radius?: number;
  /** Half-extents of the `box` region, entity-local. */
  size?: [number, number, number];
  /**
   * Signed magnitude, in world units per second squared at the reference distance. Negative
   * flips the sense of every kind: a repeller, a reversed flow, a counter-spinning vortex,
   * and — for `drag` — a medium that *adds* energy rather than removing it.
   */
  strength?: number;
  /**
   * `attractor` only: the p5 original's "artificial constraint". Without a floor, `1/d²`
   * diverges at the centre and launches anything that reaches it out of the world.
   */
  minimumDistance?: number;
  /**
   * `flow`/`vortex` only: spatial frequency of the recovered `flowAngle` field. 1 is the
   * nature-lab tuning; higher makes the cells tighter.
   */
  scale?: number;
  /** `flow`/`vortex` only: how fast the field itself animates. 0 freezes it. */
  speed?: number;
  /**
   * Soften the boundary. `0` is a hard edge — an object crossing the radius changes
   * acceleration discontinuously, which reads as a snap. `1` fades the whole way to the
   * centre. Ignored by `infinite`.
   */
  edgeSoftness?: number;
  /**
   * Restrict the field to entities carrying at least one of these tags. Empty (the default)
   * means "everything eligible", which is what a gravity well usually wants.
   */
  affectsTags?: string[];
  /** Push dynamic rigid bodies. */
  affectsBodies?: boolean;
  /** Push live particles inside emitters. Off by default — see the frame-budget note. */
  affectsParticles?: boolean;
  /** Push flock members. */
  affectsFlocks?: boolean;
  /** Draw the field. Purely a visualiser: turning it off changes nothing about the physics. */
  visualize?: boolean;
  /** Vectors per axis in the `flow`/`vortex` visualiser grid. */
  visualizeResolution?: number;
  color?: string;
  /** A disabled field stays in the scene, keeps its gizmo, and applies nothing. */
  enabled?: boolean;
};

export type ResolvedAgentWorldForceField = {
  preset: AgentWorldForceFieldPresetId | null;
  kind: AgentWorldForceFieldKind;
  shape: AgentWorldForceFieldShape;
  radius: number;
  size: [number, number, number];
  strength: number;
  minimumDistance: number;
  scale: number;
  speed: number;
  edgeSoftness: number;
  affectsTags: string[];
  affectsBodies: boolean;
  affectsParticles: boolean;
  affectsFlocks: boolean;
  visualize: boolean;
  visualizeResolution: number;
  color: string;
  enabled: boolean;
};

/**
 * Pillar 5 ceiling on the visualiser. 4096 segments is one `LineSegments` draw call and a
 * 24k-float rewrite per step; the grid resolution is clamped so no config can exceed it.
 */
export const AGENT_WORLD_FORCE_FIELD_MAX_VISUAL_VECTORS = 4096;

export type AgentWorldForceFieldPresetId =
  | "gravity-well"
  | "repulsor"
  | "flow-garden"
  | "liquid-pool"
  | "whirlpool";

export type AgentWorldForceFieldDescriptor = {
  id: AgentWorldForceFieldPresetId;
  label: string;
  description: string;
  defaults: ResolvedAgentWorldForceField;
  /** Where the numbers came from. */
  provenance: {
    sourcePath: string;
    sourceRepo: string;
    note: string;
  };
};

const BASE_FORCE_FIELD: ResolvedAgentWorldForceField = {
  preset: null,
  kind: "attractor",
  shape: "sphere",
  radius: 12,
  size: [8, 4, 8],
  strength: 40,
  // nature-lab clamped the *squared* distance at 1.4; 1.18 ≈ sqrt(1.4) is the same floor
  // expressed as a distance, which is the form attractor.js used.
  minimumDistance: 1.18,
  scale: 1,
  speed: 1,
  edgeSoftness: 0.25,
  affectsTags: [],
  affectsBodies: true,
  affectsParticles: false,
  affectsFlocks: true,
  visualize: true,
  visualizeResolution: 9,
  color: "#ffbf69",
  enabled: true,
};

const SALL = "public/Projects/Nature of Code/sAll";

export const GRAPHYSX_AGENT_WORLD_FORCE_FIELDS: readonly AgentWorldForceFieldDescriptor[] = [
  {
    id: "gravity-well",
    label: "Gravity Well",
    description:
      "An inverse-square attractor. Everything dynamic inside the radius falls toward it at a rate that ignores its own mass, which is what makes a heavy crate and a light ball arrive together.",
    defaults: { ...BASE_FORCE_FIELD, preset: "gravity-well" },
    provenance: {
      sourcePath: `${SALL}/attractor.js`,
      sourceRepo: "WindriderQc/SBQC-graphysx-public",
      note:
        "Attractor.calculateAttraction: direction to centre, distance clamped by the original's " +
        "artificial constraint, magnitude G·m/d². Distance floor 1.18 carried over from " +
        "src/nature-lab.ts (which clamped the squared distance at 1.4).",
    },
  },
  {
    id: "repulsor",
    label: "Repulsor",
    description:
      "The same inverse-square law with the sign flipped — a pressure bubble that clears the space around it. Reads well parented to a moving object.",
    defaults: {
      ...BASE_FORCE_FIELD,
      preset: "repulsor",
      strength: -34,
      radius: 9,
      minimumDistance: 1.4,
      color: "#ff6b81",
    },
    provenance: {
      sourcePath: `${SALL}/attractor.js`,
      sourceRepo: "WindriderQc/SBQC-graphysx-public",
      note: "Same law as gravity-well with a negative G; the original had no repelling case.",
    },
  },
  {
    id: "flow-garden",
    label: "Flow Garden",
    description:
      "The forces-garden field itself: a smooth animated vector field that pushes everything inside it along the same streamlines. The turquoise vectors are the field being sampled, not a decoration.",
    defaults: {
      ...BASE_FORCE_FIELD,
      preset: "flow-garden",
      kind: "flow",
      shape: "box",
      size: [11, 4, 7.5],
      // The forces-garden field is a gentle drift, not a shove; the recovered lesson ran it
      // at roughly this magnitude relative to its max speed.
      strength: 4.2,
      edgeSoftness: 0.35,
      // The one preset that pushes particles: a plume caught in a visible flow field is the
      // whole reason this composes with emitters, and a flow field is cheap per sample.
      affectsParticles: true,
      visualizeResolution: 11,
      color: "#4ce2c2",
    },
    provenance: {
      sourcePath: `${SALL}/flowfield.js`,
      sourceRepo: "WindriderQc/SBQC-graphysx-public",
      note:
        "FlowField lookup/display graduated from src/nature-lab.ts forces-garden, whose closed-form " +
        "flowAngle() replaced the p5 baked Perlin grid so the field animates and samples anywhere. " +
        "Grid extent ±10/±7 and vector length 0.52 carried over.",
    },
  },
  {
    id: "liquid-pool",
    label: "Liquid Pool",
    description:
      "Session 2's drag box. Inside the volume, everything is slowed by a force proportional to the square of its own speed — so a fast object is punished far harder than a slow one, and things sink rather than bounce.",
    defaults: {
      ...BASE_FORCE_FIELD,
      preset: "liquid-pool",
      kind: "drag",
      shape: "box",
      size: [10, 3, 10],
      strength: 1.1,
      edgeSoftness: 0.1,
      affectsFlocks: false,
      visualizeResolution: 1,
      color: "#3f7fb8",
    },
    provenance: {
      sourcePath: `${SALL}/liquid.js`,
      sourceRepo: "WindriderQc/SBQC-graphysx-public",
      note:
        "Liquid.calculateDrag: magnitude = coefficient × speed², direction = inverse of velocity, " +
        "applied only to movers the volume contains(). The rect display() becomes a translucent box.",
    },
  },
  {
    id: "whirlpool",
    label: "Whirlpool",
    description:
      "A tangential field spinning around the entity's own Y axis, strongest at the rim. The one kind with no p5 original — it is the sphere-flock swirl term straightened out.",
    defaults: {
      ...BASE_FORCE_FIELD,
      preset: "whirlpool",
      kind: "vortex",
      shape: "sphere",
      radius: 10,
      strength: 9,
      edgeSoftness: 0.4,
      visualizeResolution: 9,
      color: "#9d7bff",
    },
    provenance: {
      sourcePath: "src/nature-lab.ts",
      sourceRepo: "WindriderQc/GraphysX-Web",
      note:
        "Extension, not recovered code: the curl term the sphere-constrained flock uses to keep " +
        "circulating, applied around a world axis instead of a shell normal.",
    },
  },
];

export function findAgentWorldForceFieldPreset(id: AgentWorldForceFieldPresetId): AgentWorldForceFieldDescriptor {
  const descriptor = GRAPHYSX_AGENT_WORLD_FORCE_FIELDS.find((preset) => preset.id === id);
  if (!descriptor) throw new Error(`Unknown GraphysX force field preset: ${String(id)}`);
  return descriptor;
}

/** Validate + clamp a forceField field into the fully-specified form the runtime and export use. */
export function resolveAgentWorldForceField(
  source?: AgentWorldForceField,
  base: ResolvedAgentWorldForceField = BASE_FORCE_FIELD,
): ResolvedAgentWorldForceField {
  const input = source ?? {};
  if (input.preset != null && !GRAPHYSX_AGENT_WORLD_FORCE_FIELDS.some((preset) => preset.id === input.preset)) {
    throw new Error(
      `Unknown forceField.preset: ${String(input.preset)}. Use one of ${GRAPHYSX_AGENT_WORLD_FORCE_FIELDS.map((p) => p.id).join(", ")}`,
    );
  }
  // A preset replaces the base wholesale; explicit fields then win over the preset — the same
  // rule the flock uses, so `{ preset: "whirlpool", strength: 20 }` means what it reads like.
  const start = input.preset != null ? findAgentWorldForceFieldPreset(input.preset).defaults : base;
  if (input.kind !== undefined && !["attractor", "flow", "drag", "vortex"].includes(input.kind)) {
    throw new Error(`Invalid forceField.kind: ${String(input.kind)}. Use attractor, flow, drag or vortex`);
  }
  if (input.shape !== undefined && !["sphere", "box", "infinite"].includes(input.shape)) {
    throw new Error(`Invalid forceField.shape: ${String(input.shape)}. Use sphere, box or infinite`);
  }
  if (input.color !== undefined && !isColor(input.color)) throw new Error(`Invalid forceField.color: ${String(input.color)}`);
  const size = input.size ?? start.size;
  if (!Array.isArray(size) || size.length !== 3 || size.some((value) => !Number.isFinite(value))) {
    throw new Error("forceField.size must contain three finite numbers");
  }
  if (input.affectsTags !== undefined && (!Array.isArray(input.affectsTags) || input.affectsTags.some((tag) => typeof tag !== "string"))) {
    throw new Error("forceField.affectsTags must be an array of strings");
  }
  return {
    preset: input.preset === undefined ? start.preset : input.preset,
    kind: input.kind ?? start.kind,
    shape: input.shape ?? start.shape,
    radius: clamp(input.radius ?? start.radius, 0.1, 1000),
    size: size.map((value) => clamp(value, 0.1, 1000)) as [number, number, number],
    strength: clamp(input.strength ?? start.strength, -10000, 10000),
    minimumDistance: clamp(input.minimumDistance ?? start.minimumDistance, 0.01, 1000),
    scale: clamp(input.scale ?? start.scale, 0.01, 100),
    speed: clamp(input.speed ?? start.speed, -100, 100),
    edgeSoftness: clamp(input.edgeSoftness ?? start.edgeSoftness, 0, 1),
    affectsTags: input.affectsTags
      ? [...new Set(input.affectsTags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 32)
      : [...start.affectsTags],
    affectsBodies: input.affectsBodies ?? start.affectsBodies,
    affectsParticles: input.affectsParticles ?? start.affectsParticles,
    affectsFlocks: input.affectsFlocks ?? start.affectsFlocks,
    visualize: input.visualize ?? start.visualize,
    visualizeResolution: Math.round(clamp(input.visualizeResolution ?? start.visualizeResolution, 1, 24)),
    color: input.color ?? start.color,
    enabled: input.enabled ?? start.enabled,
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

/**
 * The forces-garden flow function, carried over from `src/nature-lab.ts` unchanged apart from
 * the `scale` multiplier on its three spatial coefficients. Three sinusoids at different
 * frequencies and phases, which is what makes it read as a field rather than as a spiral.
 */
export function flowAngle(x: number, z: number, time: number, scale = 1): number {
  return (
    Math.sin(x * 0.27 * scale + time) * 1.8 +
    Math.cos(z * 0.31 * scale - time * 0.7) * 1.3 +
    Math.sin((x + z) * 0.12 * scale) * 0.8
  );
}

/**
 * How strongly the field acts at `localPoint`, in 0..1. 0 means outside.
 *
 * The edge fade exists because a hard boundary is visibly wrong: an object crossing the rim
 * of an attractor at speed changes acceleration in one step, and the discontinuity reads as
 * a snap. `edgeSoftness` is the fraction of the extent over which the influence ramps in.
 */
export function forceFieldInfluence(config: ResolvedAgentWorldForceField, localPoint: Vector3): number {
  if (config.shape === "infinite") return 1;
  if (config.shape === "sphere") {
    const distance = localPoint.length();
    if (distance >= config.radius) return 0;
    const fadeStart = config.radius * (1 - config.edgeSoftness);
    if (distance <= fadeStart) return 1;
    return (config.radius - distance) / Math.max(1e-6, config.radius - fadeStart);
  }
  // Box: the weakest axis wins, so a corner fades like a corner rather than like a face.
  let influence = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const limit = config.size[axis];
    const value = Math.abs(localPoint.getComponent(axis));
    if (value >= limit) return 0;
    const fadeStart = limit * (1 - config.edgeSoftness);
    const axisInfluence = value <= fadeStart ? 1 : (limit - value) / Math.max(1e-6, limit - fadeStart);
    if (axisInfluence < influence) influence = axisInfluence;
  }
  return influence;
}

/**
 * The whole simulation contract of this module: given a point and a velocity **in the
 * field's local space**, write the acceleration the field applies there into `out`.
 *
 * Returns the influence actually used (0 when the sample was outside), so a caller can skip
 * work and so `state()` can report whether the field is doing anything at all.
 *
 * Allocation-free by construction — every consumer calls it once per body, per particle or
 * per flock member, per step.
 */
export function sampleForceFieldAcceleration(
  config: ResolvedAgentWorldForceField,
  localPoint: Vector3,
  localVelocity: Vector3,
  elapsedSeconds: number,
  out: Vector3,
): number {
  out.set(0, 0, 0);
  if (!config.enabled || config.strength === 0) return 0;
  const influence = forceFieldInfluence(config, localPoint);
  if (influence <= 0) return 0;

  if (config.kind === "attractor") {
    // attractor.js: direction to the centre, distance clamped, magnitude ∝ 1/d².
    const distance = Math.max(config.minimumDistance, localPoint.length());
    if (localPoint.lengthSq() < 1e-12) return 0;
    out.copy(localPoint).multiplyScalar(-1 / localPoint.length());
    out.multiplyScalar((config.strength * influence) / (distance * distance));
    return influence;
  }

  if (config.kind === "drag") {
    // liquid.js: magnitude = coefficient × speed², direction = inverse of velocity.
    const speed = localVelocity.length();
    if (speed < 1e-6) return influence;
    out.copy(localVelocity).multiplyScalar(-(config.strength * influence * speed));
    return influence;
  }

  if (config.kind === "vortex") {
    // Tangential around local +Y, strongest at the rim (the opposite of an attractor) so the
    // centre of a whirlpool is calm rather than infinitely fast.
    const radial = Math.hypot(localPoint.x, localPoint.z);
    if (radial < 1e-4) return influence;
    const rim = config.shape === "sphere" ? config.radius : Math.max(config.size[0], config.size[2]);
    const magnitude = config.strength * influence * Math.min(1, radial / Math.max(1e-6, rim));
    out.set((-localPoint.z / radial) * magnitude, 0, (localPoint.x / radial) * magnitude);
    return influence;
  }

  // flow: sample the recovered field and push along it. The 0.18 vertical factor is the
  // nature-lab forces-combined term — a flow field that is perfectly flat reads as a
  // conveyor belt, and a little lift is what made it read as air.
  const angle = flowAngle(localPoint.x, localPoint.z, elapsedSeconds * config.speed * 0.2, config.scale);
  const magnitude = config.strength * influence;
  out.set(Math.cos(angle) * magnitude, Math.sin(angle * 0.7) * 0.18 * magnitude, Math.sin(angle) * magnitude);
  return influence;
}

/**
 * The field's scene object — a **visualiser only**.
 *
 * This is the structural difference from {@link import("./agent-world-flock").AgentWorldFlockSystem}
 * and is worth being blunt about: the flock's object *is* the simulation, and deleting it
 * would delete the boids. Here, nothing in this class is read by the physics. Every method
 * below draws; none of them are called by the force pass. `visualize: false` produces an
 * empty group and an identical simulation.
 */
export class AgentWorldForceFieldVisual {
  readonly object = new Group();
  private config: ResolvedAgentWorldForceField;
  private vectors: LineSegments | null = null;
  private gizmo: Object3D | null = null;
  private volume: Mesh | null = null;
  private elapsed = 0;
  private readonly scratch = { point: new Vector3(), velocity: new Vector3(), out: new Vector3() };

  constructor(config: ResolvedAgentWorldForceField) {
    this.config = config;
    this.object.name = "GraphysXForceField";
    this.build(config);
  }

  /** Line segments currently drawn. 0 when the field is not visualised. */
  get visualVectorCount(): number {
    return this.vectors ? (this.vectors.geometry.getAttribute("position").count / 2) | 0 : 0;
  }

  private gridExtent(): [number, number] {
    if (this.config.shape === "sphere") return [this.config.radius, this.config.radius];
    if (this.config.shape === "box") return [this.config.size[0], this.config.size[2]];
    // An infinite field still has to draw *somewhere*; the recovered grid was ±10 by ±7.
    return [10, 7];
  }

  private build(config: ResolvedAgentWorldForceField): void {
    if (!config.visualize) return;
    const color = new Color(config.color);

    if (config.kind === "attractor") {
      // The forces-garden attractor body and ring, adapted: an emissive icosahedron with an
      // additive torus around it, sized to the field rather than to the recovered lesson.
      const scale = Math.max(0.2, Math.min(2.4, config.radius * 0.08));
      const body = new Mesh(
        new IcosahedronGeometry(0.92 * scale, 3),
        new MeshStandardMaterial({
          color,
          emissive: color.clone().multiplyScalar(0.36),
          emissiveIntensity: 1.05,
          roughness: 0.22,
          metalness: 0.28,
        }),
      );
      body.name = "GraphysXForceFieldCore";
      // The field's colour comes from `forceField.color`, not the entity `material` field, so
      // the runtime's generic material pass must leave it alone — the same opt-out the flock
      // members and the water surface take.
      body.userData.graphysxMaterialLocked = true;
      const ring = new Mesh(
        new TorusGeometry(1.36 * scale, 0.035 * scale, 8, 72),
        new MeshBasicMaterial({ color, transparent: true, opacity: 0.72, blending: AdditiveBlending }),
      );
      ring.rotation.x = Math.PI / 2;
      body.add(ring);
      this.gizmo = body;
      this.object.add(body);
    }

    if (config.kind === "drag") {
      // liquid.js drew the volume as a filled rect. In 3D that is a translucent box (or
      // sphere), depth-write off so things inside it stay visible.
      const geometry = config.shape === "sphere"
        ? new SphereGeometry(config.radius, 24, 16)
        : new BoxGeometry(config.size[0] * 2, config.size[1] * 2, config.size[2] * 2);
      const volume = new Mesh(
        geometry,
        new MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide }),
      );
      volume.name = "GraphysXForceFieldVolume";
      volume.userData.graphysxMaterialLocked = true;
      this.volume = volume;
      this.object.add(volume);
    }

    if (config.kind === "flow" || config.kind === "vortex") {
      const [extentX, extentZ] = this.gridExtent();
      const steps = Math.max(1, config.visualizeResolution);
      const count = Math.min(AGENT_WORLD_FORCE_FIELD_MAX_VISUAL_VECTORS, steps * steps);
      const array = new Float32Array(count * 2 * 3);
      const attribute = new Float32BufferAttribute(array, 3);
      attribute.setUsage(DynamicDrawUsage);
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", attribute);
      const vectors = new LineSegments(
        geometry,
        new LineBasicMaterial({ color, transparent: true, opacity: 0.34, blending: AdditiveBlending, depthWrite: false }),
      );
      vectors.name = "GraphysXForceFieldVectors";
      vectors.frustumCulled = false;
      this.vectors = vectors;
      this.object.add(vectors);
      this.writeVectors(extentX, extentZ, steps);
    }
  }

  /** Re-apply a patched configuration. Any geometry change rebuilds; colour is live. */
  configure(config: ResolvedAgentWorldForceField): void {
    const rebuild =
      config.kind !== this.config.kind ||
      config.shape !== this.config.shape ||
      config.visualize !== this.config.visualize ||
      config.visualizeResolution !== this.config.visualizeResolution ||
      config.radius !== this.config.radius ||
      config.size.some((value, axis) => value !== this.config.size[axis]);
    this.config = config;
    if (rebuild) {
      this.disposeParts();
      this.build(config);
      return;
    }
    const color = new Color(config.color);
    if (this.vectors) (this.vectors.material as LineBasicMaterial).color.copy(color);
    if (this.volume) (this.volume.material as MeshBasicMaterial).color.copy(color);
    if (this.gizmo instanceof Mesh) {
      const material = this.gizmo.material as MeshStandardMaterial;
      material.color.copy(color);
      material.emissive.copy(color.clone().multiplyScalar(0.36));
    }
  }

  /**
   * Advance the *drawing*. Called from the runtime's simulation pass so it inherits
   * pause/step, exactly like the flock — but unlike the flock, skipping it entirely would
   * leave the physics unchanged.
   */
  update(deltaSeconds: number): void {
    if (deltaSeconds <= 0) return;
    this.elapsed += Math.min(deltaSeconds, 0.1);
    if (this.gizmo) {
      this.gizmo.rotation.y += deltaSeconds * 0.8;
      const ring = this.gizmo.children[0];
      if (ring) ring.rotation.z += deltaSeconds * 0.7;
    }
    if (!this.vectors) return;
    const [extentX, extentZ] = this.gridExtent();
    this.writeVectors(extentX, extentZ, Math.max(1, this.config.visualizeResolution));
  }

  /**
   * Draw the field by *sampling the same function the physics samples*. Deliberately not a
   * separate visual approximation: the turquoise vectors in the recovered lesson animated
   * with the same `flowAngle` the vehicles followed, and a visualiser that drifts from the
   * thing it visualises is exactly the write-only-state defect this codebase keeps finding.
   */
  private writeVectors(extentX: number, extentZ: number, steps: number): void {
    if (!this.vectors) return;
    const attribute = this.vectors.geometry.getAttribute("position");
    const array = attribute.array as Float32Array;
    const capacity = array.length / 6;
    const { point, velocity, out } = this.scratch;
    // The recovered grid drew a fixed 0.52-unit arrow; scale it with the cell so a large
    // field does not turn into a solid sheet of overlapping lines.
    const arrow = Math.min(0.52 * Math.max(1, extentX / 10), (extentX * 2) / Math.max(1, steps) * 0.7);
    let offset = 0;
    let drawn = 0;
    for (let ix = 0; ix < steps && drawn < capacity; ix += 1) {
      const x = steps === 1 ? 0 : -extentX + (ix / (steps - 1)) * extentX * 2;
      for (let iz = 0; iz < steps && drawn < capacity; iz += 1) {
        const z = steps === 1 ? 0 : -extentZ + (iz / (steps - 1)) * extentZ * 2;
        point.set(x, 0, z);
        velocity.set(0, 0, 0);
        sampleForceFieldAcceleration(this.config, point, velocity, this.elapsed, out);
        const magnitude = out.length();
        if (magnitude > 1e-6) out.multiplyScalar(arrow / magnitude);
        array[offset++] = x;
        array[offset++] = 0.13;
        array[offset++] = z;
        array[offset++] = x + out.x;
        array[offset++] = 0.13 + out.y;
        array[offset++] = z + out.z;
        drawn += 1;
      }
    }
    attribute.needsUpdate = true;
    this.vectors.geometry.setDrawRange(0, drawn * 2);
  }

  private disposeParts(): void {
    for (const part of [this.vectors, this.gizmo, this.volume]) {
      if (!part) continue;
      part.removeFromParent();
      part.traverse((child) => {
        if (!(child instanceof Mesh) && !(child instanceof LineSegments)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      });
    }
    this.vectors = null;
    this.gizmo = null;
    this.volume = null;
  }

  dispose(): void {
    this.disposeParts();
  }
}

/** Find the force-field visual hanging off an entity object, if it is a force-field entity. */
export function findForceFieldVisual(object: Object3D): AgentWorldForceFieldVisual | null {
  const visual = object.userData.graphysxForceFieldVisual;
  return visual instanceof AgentWorldForceFieldVisual ? visual : null;
}

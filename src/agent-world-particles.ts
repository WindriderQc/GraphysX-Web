import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  Texture,
  Vector2,
  type WebGLRenderer
} from "three";

/**
 * Particle emitters as first-class `graphysx.agent-world/v2` scene vocabulary.
 *
 * Two pieces of recovered material meet here:
 *
 *  - `src/engine/particle-emitter.ts` — the working pooled `Points` emitter recovered from the
 *    race scene. Its pooling shape (flat `Float32Array` position/colour buffers + `setDrawRange`)
 *    and its soft radial-gradient `CanvasTexture` glow trick are the basis of this module. That
 *    emitter is burst-only and takes a `Scene` in its constructor, so it could not be reused
 *    verbatim; it is adapted, not replaced, and it still serves the legacy race scene.
 *  - `src/legacy/particle-preset-library.json` — the decoded TV3D `.TVPJ` archive library
 *    (16 readable presets / 29 emitters). Every preset below is derived from a *real* record in
 *    that file: spawn interval, lifetime, emission power, gravity, blend mode, spawn volume and
 *    the colour/size keyframe ramp are carried across, and each preset cites its source path,
 *    SHA-256 and emitter index. Where a value was changed, `deviations` says so — nothing here
 *    is invented and silently passed off as archive data.
 *
 * Textures: the archive's `.dds` sprites are vendored at `public/assets/particles/archive/`, but
 * DDS needs a loader plus the S3TC compressed-texture extension, which is not reliably present
 * under headless SwiftShader. Rather than add a DDS dependency for five sprites, each preset
 * records *which* archive sprite it bound and we synthesise a matching canvas texture (soft glow /
 * star flare / smoke puff / blurred ring). Fidelity of *binding* is preserved; the pixels are ours.
 */

export type ParticleVector3 = [number, number, number];

export type AgentWorldEmitterPresetId =
  | "campfire"
  | "fireball"
  | "ember-smoke"
  | "spark-burst"
  | "plasma-trail"
  | "energy-orb"
  | "firetrail"
  | "shockwave";

export type AgentWorldEmitterBlending = "additive" | "normal";
export type AgentWorldEmitterShape = "point" | "box" | "sphere";
export type AgentWorldEmitterSprite = "glow" | "star" | "smoke" | "ring";

/** One stop on the archive's colour/size keyframe ramp, normalised to 0..1 of the lifetime. */
export type AgentWorldEmitterKeyframe = {
  /** Normalised age, 0 at spawn to 1 at death. */
  t: number;
  /** Particle diameter in world units. */
  size: number;
  color: ParticleVector3;
  alpha: number;
};

/** The scene-vocabulary field. `preset` is required; every other field is an instance override. */
export type AgentWorldEmitter = {
  preset: AgentWorldEmitterPresetId;
  /** Emission rate in particles per second. */
  rate?: number;
  /** Hard cap on live particles for this emitter. */
  maxParticles?: number;
  lifetimeSeconds?: number;
  /** Initial speed in world units per second. */
  speed?: number;
  /** Multiplier over the preset's keyframe sizes. */
  sizeScale?: number;
  /** Multiplier over the preset's spawn volume. */
  volumeScale?: number;
  /** Optional tint multiplied into the ramp colour, or null to keep the archive colours. */
  color?: string | null;
  gravity?: ParticleVector3;
  /** Emission bias direction; combined with `spread` and the preset's random-direction factor. */
  direction?: ParticleVector3;
  /** 0 = perfectly directional, 1 = the preset's archive randomness, >1 = wider. */
  spread?: number;
  /** Seed for the deterministic PRNG, so pause/step and reloads reproduce the same plume. */
  seed?: number;
  enabled?: boolean;
};

export type ResolvedAgentWorldEmitter = {
  preset: AgentWorldEmitterPresetId;
  rate: number;
  maxParticles: number;
  lifetimeSeconds: number;
  speed: number;
  sizeScale: number;
  volumeScale: number;
  color: string | null;
  gravity: ParticleVector3;
  direction: ParticleVector3;
  spread: number;
  seed: number;
  enabled: boolean;
};

/** Verbatim copy of the fields we read out of `particle-preset-library.json`. */
export type AgentWorldEmitterProvenance = {
  /** `readable[].id` in the decoded library. */
  presetRecord: string;
  /** `readable[].emitters[].id`. */
  emitterIndex: number;
  sourcePath: string;
  sourceSha256: string;
  /** The `.dds` the archive emitter bound. Vendored, but rendered procedurally — see the file header. */
  textureFile: string;
  archive: {
    maxParticles: number;
    lifetimeSeconds: number;
    power: number;
    generationSpeedMilliseconds: number;
    gravity: ParticleVector3 | null;
    blending: number;
    randomDirectionFactor: ParticleVector3;
  };
  /** Every place this preset departs from the archive record, and why. Empty means verbatim. */
  deviations: string[];
};

export type AgentWorldEmitterDescriptor = {
  id: AgentWorldEmitterPresetId;
  label: string;
  category: string;
  description: string;
  sprite: AgentWorldEmitterSprite;
  blending: AgentWorldEmitterBlending;
  shape: AgentWorldEmitterShape;
  /** Half-extents for `box`, radius for `sphere`, ignored for `point`. */
  volume: ParticleVector3;
  keyframes: readonly AgentWorldEmitterKeyframe[];
  defaults: ResolvedAgentWorldEmitter;
  provenance: AgentWorldEmitterProvenance;
  source: "GraphysX archive";
};

/**
 * The archive worlds were authored at roughly ten TV3D units per metre — emission powers of
 * 40..200 and gravities of -50..-250 next to particle sizes of 8..512. v2 scenes are metric with
 * gravity -9.81, so speeds, gravities, spawn volumes and keyframe sizes are all divided by ten.
 * One documented constant, applied uniformly, rather than per-preset hand-tuning.
 */
const ARCHIVE_UNIT_SCALE = 0.1;

/**
 * Pillar 5 is "performant by intent": no single emitter may exceed this, whatever a preset or an
 * agent asks for. Several archive emitters declare 1000-1500 particles; those are budgeted down.
 */
export const AGENT_WORLD_EMITTER_PARTICLE_CAP = 600;

const scaleVector = (vector: ParticleVector3, factor: number): ParticleVector3 => [
  vector[0] * factor,
  vector[1] * factor,
  vector[2] * factor
];

/** Steady-state live count is rate x lifetime, so this is the rate that exactly fills the budget. */
const budgetedRate = (generationSpeedMilliseconds: number, maxParticles: number, lifetimeSeconds: number): number =>
  Math.min(1000 / Math.max(1, generationSpeedMilliseconds), maxParticles / Math.max(0.05, lifetimeSeconds));

export const GRAPHYSX_AGENT_WORLD_EMITTERS: readonly AgentWorldEmitterDescriptor[] = [
  {
    id: "campfire",
    label: "Campfire",
    category: "fire",
    description: "A tall column of slow embers with a blue base burning up through amber. Reads as a bonfire or brazier.",
    sprite: "smoke",
    blending: "additive",
    shape: "box",
    // archive boxSize [5,20,5] -> a 0.5 x 2.0 x 0.5 m emission column.
    volume: [0.25, 1, 0.25],
    // archive keyframes verbatim, times normalised by the 0.75 s lifetime, sizes x0.1.
    keyframes: [
      { t: 0, size: 0.1, color: [0, 0, 1], alpha: 1 },
      { t: 0.533, size: 0.05, color: [0.8, 0.6, 0.1], alpha: 1 },
      { t: 1, size: 0, color: [1, 1, 1], alpha: 1 }
    ],
    defaults: {
      preset: "campfire",
      rate: budgetedRate(1, 288, 0.75),
      maxParticles: 288,
      lifetimeSeconds: 0.75,
      speed: 2 * ARCHIVE_UNIT_SCALE,
      sizeScale: 1,
      volumeScale: 1,
      color: null,
      gravity: [0, 0, 0],
      direction: [0, 1, 0],
      spread: 1,
      seed: 1,
      enabled: true
    },
    provenance: {
      presetRecord: "fire1",
      emitterIndex: 0,
      sourcePath: "Yanik C++ BCKUP/Media/PartSys/resources/fire1.TVPJ",
      sourceSha256: "7781D0E69B06",
      textureFile: "smokey.dds",
      archive: {
        maxParticles: 1000,
        lifetimeSeconds: 0.75,
        power: 2,
        generationSpeedMilliseconds: 1,
        gravity: null,
        blending: 1,
        randomDirectionFactor: [1, 1, 1]
      },
      deviations: [
        "maxParticles 1000 -> 288 for the per-emitter budget",
        "archive direction is [0,0,0] (fully random); biased to +Y so the column reads upward",
        "archive blending 1 (alpha) rendered additive — embers are emissive"
      ]
    },
    source: "GraphysX archive"
  },
  {
    id: "fireball",
    label: "Fireball",
    category: "explosion",
    description: "The expanding core of the archive's Explosion 01: white flash growing into an amber ball that darkens as it falls.",
    sprite: "glow",
    blending: "additive",
    shape: "sphere",
    // archive sphereRadius 3 -> 0.3 m.
    volume: [0.3, 0.3, 0.3],
    // archive keyframes verbatim over a 3 s lifetime, sizes x0.1.
    keyframes: [
      { t: 0, size: 1.6, color: [1, 1, 1], alpha: 1 },
      { t: 0.667, size: 4.8, color: [0.7, 0.5, 0], alpha: 1 },
      { t: 1, size: 12.8, color: [0.1, 0.05, 0], alpha: 0 }
    ],
    defaults: {
      preset: "fireball",
      rate: budgetedRate(10, 64, 3),
      maxParticles: 64,
      lifetimeSeconds: 3,
      speed: 10 * ARCHIVE_UNIT_SCALE,
      sizeScale: 1,
      volumeScale: 1,
      color: null,
      gravity: scaleVector([0, -5, 0], ARCHIVE_UNIT_SCALE),
      direction: [0, 1, 0],
      spread: 1,
      seed: 2,
      enabled: true
    },
    provenance: {
      presetRecord: "explosion_01",
      emitterIndex: 1,
      sourcePath: "Yanik C++ BCKUP/Media/PartSys/resources/explosion_01.TVPJ",
      sourceSha256: "18267D7EECE0",
      textureFile: "Glow2.dds",
      archive: {
        maxParticles: 64,
        lifetimeSeconds: 3,
        power: 10,
        generationSpeedMilliseconds: 10,
        gravity: [0, -5, 0],
        blending: 3,
        randomDirectionFactor: [5, 5, 5]
      },
      deviations: [
        "archive emitter is looping:false (one-shot); the v2 emitter loops continuously"
      ]
    },
    source: "GraphysX archive"
  },
  {
    id: "ember-smoke",
    label: "Ember Smoke",
    category: "smoke",
    description: "Slow rising soot that starts dark brown and washes out to grey. Alpha-blended, so it reads as real smoke over a bright sky.",
    sprite: "smoke",
    blending: "normal",
    shape: "sphere",
    volume: [0.3, 0.3, 0.3],
    keyframes: [
      { t: 0, size: 1.6, color: [0.25, 0.125, 0], alpha: 0.1 },
      { t: 0.5, size: 1.6, color: [0.2, 0.2, 0.2], alpha: 0.4 },
      { t: 1, size: 0, color: [0.5, 0.5, 0.5], alpha: 0 }
    ],
    defaults: {
      preset: "ember-smoke",
      rate: budgetedRate(10, 48, 4),
      maxParticles: 48,
      lifetimeSeconds: 4,
      speed: 5 * ARCHIVE_UNIT_SCALE,
      sizeScale: 1,
      volumeScale: 1,
      color: null,
      // archive gravity is [0,10,0]: smoke that accelerates upward.
      gravity: scaleVector([0, 10, 0], ARCHIVE_UNIT_SCALE),
      direction: [0, -1, 0],
      spread: 1,
      seed: 3,
      enabled: true
    },
    provenance: {
      presetRecord: "explosion_01",
      emitterIndex: 2,
      sourcePath: "Yanik C++ BCKUP/Media/PartSys/resources/explosion_01.TVPJ",
      sourceSha256: "18267D7EECE0",
      textureFile: "smokey.dds",
      archive: {
        maxParticles: 8,
        lifetimeSeconds: 4,
        power: 5,
        generationSpeedMilliseconds: 10,
        gravity: [0, 10, 0],
        blending: 1,
        randomDirectionFactor: [2, 10, 2]
      },
      deviations: [
        "maxParticles 8 -> 48: the archive emitter was a one-shot puff; a looping v2 emitter needs more to read as a continuous plume",
        "archive emitter is looping:false"
      ]
    },
    source: "GraphysX archive"
  },
  {
    id: "spark-burst",
    label: "Spark Burst",
    category: "impact",
    description: "Hard, fast sparks thrown sideways and yanked down by heavy gravity. The archive's bullet-impact emitter.",
    sprite: "glow",
    blending: "additive",
    shape: "point",
    volume: [0, 0, 0],
    keyframes: [
      { t: 0, size: 0.1, color: [1, 1, 1], alpha: 1 },
      { t: 0.125, size: 0.2, color: [1, 1, 0], alpha: 0 },
      { t: 0.5, size: 0, color: [0, 0, 0], alpha: 1 },
      { t: 1, size: 0, color: [0, 0, 0], alpha: 0 }
    ],
    defaults: {
      preset: "spark-burst",
      rate: budgetedRate(10, 64, 1),
      maxParticles: 64,
      lifetimeSeconds: 1,
      speed: 50 * ARCHIVE_UNIT_SCALE,
      sizeScale: 1,
      volumeScale: 1,
      color: null,
      gravity: scaleVector([0, -250, 0], ARCHIVE_UNIT_SCALE),
      direction: [0, 1, 0],
      spread: 1,
      seed: 4,
      enabled: true
    },
    provenance: {
      presetRecord: "hit_01",
      emitterIndex: 0,
      sourcePath: "Yanik C++ BCKUP/Media/PartSys/resources/hit_01.TVPJ",
      sourceSha256: "4CA7C33A64C6",
      textureFile: "Glow2.dds",
      archive: {
        maxParticles: 3,
        lifetimeSeconds: 1,
        power: 50,
        generationSpeedMilliseconds: 10,
        gravity: [0, -250, 0],
        blending: 4,
        randomDirectionFactor: [5, 1, 5]
      },
      deviations: [
        "maxParticles 3 -> 64: the archive emitter fired three sparks per impact event; a standing v2 emitter needs a population",
        "a trailing all-zero keyframe was appended so the ramp is defined at t=1 (the archive's last stop is at 0.5 s of a 1 s life)"
      ]
    },
    source: "GraphysX archive"
  },
  {
    id: "plasma-trail",
    label: "Plasma Trail",
    category: "trail",
    description: "Dense, nearly motionless magenta-to-blue rings. Built to be dragged behind a moving entity — parent it to something that travels.",
    sprite: "ring",
    blending: "additive",
    shape: "point",
    volume: [0, 0, 0],
    keyframes: [
      { t: 0, size: 0.1, color: [1, 0.75, 1], alpha: 1 },
      { t: 0.125, size: 0.05, color: [0.1, 0, 1], alpha: 0.5 },
      { t: 1, size: 0, color: [0, 0, 0], alpha: 0 }
    ],
    defaults: {
      preset: "plasma-trail",
      rate: budgetedRate(5, 256, 2),
      maxParticles: 256,
      lifetimeSeconds: 2,
      speed: 0.02,
      sizeScale: 1,
      volumeScale: 1,
      color: null,
      gravity: [0, 0, 0],
      direction: [0, 1, 0],
      spread: 1,
      seed: 5,
      enabled: true
    },
    provenance: {
      presetRecord: "plasmatrail_01",
      emitterIndex: 0,
      sourcePath: "Yanik C++ BCKUP/Media/PartSys/resources/plasmatrail_01.TVPJ",
      sourceSha256: "67926650E647",
      textureFile: "ring_blur.dds",
      archive: {
        maxParticles: 1000,
        lifetimeSeconds: 2,
        power: 0,
        generationSpeedMilliseconds: 5,
        gravity: null,
        blending: 4,
        randomDirectionFactor: [0.0125, 0.0125, 0.0125]
      },
      deviations: [
        "maxParticles 1000 -> 256 for the per-emitter budget",
        "archive power is 0 (particles pinned to the emitter); 0.02 m/s of jitter is used so a stationary emitter is still visible"
      ]
    },
    source: "GraphysX archive"
  },
  {
    id: "energy-orb",
    label: "Energy Orb",
    category: "energy",
    description: "A sparse, sharp twinkle of star sprites around a point. The archive's lightning-ball halo.",
    sprite: "star",
    blending: "additive",
    shape: "point",
    volume: [0, 0, 0],
    keyframes: [
      { t: 0, size: 0.2, color: [1, 1, 1], alpha: 1 },
      { t: 1, size: 0, color: [0.5, 0.7, 1], alpha: 0 }
    ],
    defaults: {
      preset: "energy-orb",
      rate: budgetedRate(100, 24, 0.5),
      maxParticles: 24,
      lifetimeSeconds: 0.5,
      speed: 4 * ARCHIVE_UNIT_SCALE,
      sizeScale: 1,
      volumeScale: 1,
      color: null,
      gravity: scaleVector([0, -5, 0], ARCHIVE_UNIT_SCALE),
      direction: [0, 1, 0],
      spread: 1,
      seed: 6,
      enabled: true
    },
    provenance: {
      presetRecord: "lightningball_01",
      emitterIndex: 0,
      sourcePath: "Yanik C++ BCKUP/Media/PartSys/resources/lightningball_01.TVPJ",
      sourceSha256: "6522E27B8761",
      textureFile: "star1.dds",
      archive: {
        maxParticles: 10,
        lifetimeSeconds: 0.5,
        power: 4,
        generationSpeedMilliseconds: 100,
        gravity: [0, -5, 0],
        blending: 4,
        randomDirectionFactor: [1, 1, 1]
      },
      deviations: [
        "maxParticles 10 -> 24 so the halo reads at v2 scale",
        "the archive record carries NO keyframes for this emitter; the size/colour ramp here is synthesised from defaultSize 2 and defaultColor [1,1,1,1] with a cool fade-out — this ramp is ours, not the archive's"
      ]
    },
    source: "GraphysX archive"
  },
  {
    id: "firetrail",
    label: "Fire Trail",
    category: "fire",
    description: "A tight, warm ember wash. Small and cheap; good for torches, thrusters and hot edges.",
    sprite: "glow",
    blending: "additive",
    shape: "point",
    volume: [0, 0, 0],
    keyframes: [
      { t: 0, size: 0.15, color: [1, 0.75, 0.5], alpha: 0.75 },
      { t: 1, size: 0.05, color: [0.75, 0.25, 0], alpha: 0.1 }
    ],
    defaults: {
      preset: "firetrail",
      rate: budgetedRate(10, 192, 1),
      maxParticles: 192,
      lifetimeSeconds: 1,
      speed: 1 * ARCHIVE_UNIT_SCALE,
      sizeScale: 1,
      volumeScale: 1,
      color: null,
      gravity: [0, 0, 0],
      direction: [0, 1, 0],
      spread: 1,
      seed: 7,
      enabled: true
    },
    provenance: {
      presetRecord: "firetrail_02",
      emitterIndex: 0,
      sourcePath: "Yanik C++ BCKUP/Media/PartSys/resources/firetrail_02.TVPJ",
      sourceSha256: "C412A2CD8B4C",
      textureFile: "Glow2.dds",
      archive: {
        maxParticles: 1000,
        lifetimeSeconds: 1,
        power: 1,
        generationSpeedMilliseconds: 10,
        gravity: null,
        blending: 4,
        randomDirectionFactor: [1, 1, 1]
      },
      deviations: [
        "maxParticles 1000 -> 192 for the per-emitter budget",
        "archive direction is [0,0,0] (fully random); biased to +Y"
      ]
    },
    source: "GraphysX archive"
  },
  {
    id: "shockwave",
    label: "Shockwave",
    category: "area-effect",
    description: "A wide, fast-expanding shell of star sprites — the archive's screen-clearing smart bomb. Deliberately large: it sweeps tens of metres.",
    sprite: "star",
    blending: "normal",
    shape: "point",
    volume: [0, 0, 0],
    keyframes: [
      { t: 0, size: 0, color: [0, 0, 0], alpha: 0 },
      { t: 0.033, size: 0.8, color: [1, 1, 1], alpha: 1 },
      { t: 1, size: 0, color: [0, 0, 0], alpha: 0 }
    ],
    defaults: {
      preset: "shockwave",
      rate: budgetedRate(1, 64, 3),
      maxParticles: 64,
      lifetimeSeconds: 3,
      speed: 200 * ARCHIVE_UNIT_SCALE,
      sizeScale: 1,
      volumeScale: 1,
      color: null,
      gravity: [0, 0, 0],
      direction: [0, 1, 0],
      spread: 1,
      seed: 8,
      enabled: true
    },
    provenance: {
      presetRecord: "smartbomb_01",
      emitterIndex: 1,
      sourcePath: "Yanik C++ BCKUP/Media/PartSys/resources/smartbomb_01.TVPJ",
      sourceSha256: "3043C3C2CF89",
      textureFile: "star1.dds",
      archive: {
        maxParticles: 64,
        lifetimeSeconds: 3,
        power: 200,
        generationSpeedMilliseconds: 1,
        gravity: [0, 0, 0],
        blending: 1,
        randomDirectionFactor: [1, 1, 1]
      },
      deviations: []
    },
    source: "GraphysX archive"
  }
] as const;

const EMITTER_BY_ID = new Map<string, AgentWorldEmitterDescriptor>(
  GRAPHYSX_AGENT_WORLD_EMITTERS.map((descriptor) => [descriptor.id, descriptor])
);

export function isAgentWorldEmitterPreset(value: unknown): value is AgentWorldEmitterPresetId {
  return typeof value === "string" && EMITTER_BY_ID.has(value);
}

export function findAgentWorldEmitterPreset(id: AgentWorldEmitterPresetId): AgentWorldEmitterDescriptor {
  const descriptor = EMITTER_BY_ID.get(id);
  if (!descriptor) throw new Error(`Unknown particle emitter preset: ${id}`);
  return descriptor;
}

function clampNumber(value: number, minimum: number, maximum: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

function resolveVector(
  value: ParticleVector3 | undefined,
  fallback: ParticleVector3,
  limit: number,
  label: string
): ParticleVector3 {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || value.length !== 3 || value.some((component) => !Number.isFinite(component))) {
    throw new Error(`${label} must be three finite numbers`);
  }
  return value.map((component) => clampNumber(component, -limit, limit, 0)) as ParticleVector3;
}

/** Validate + clamp an emitter field into the fully-specified form the runtime and export use. */
export function resolveAgentWorldEmitter(
  source: AgentWorldEmitter | undefined,
  base?: ResolvedAgentWorldEmitter
): ResolvedAgentWorldEmitter {
  const presetId = source?.preset ?? base?.preset ?? "campfire";
  if (!isAgentWorldEmitterPreset(presetId)) throw new Error(`Unknown particle emitter preset: ${String(presetId)}`);
  const fallback: ResolvedAgentWorldEmitter =
    base && base.preset === presetId ? base : findAgentWorldEmitterPreset(presetId).defaults;
  const lifetimeSeconds = clampNumber(source?.lifetimeSeconds ?? fallback.lifetimeSeconds, 0.05, 60, fallback.lifetimeSeconds);
  const maxParticles = Math.floor(
    clampNumber(source?.maxParticles ?? fallback.maxParticles, 1, AGENT_WORLD_EMITTER_PARTICLE_CAP, fallback.maxParticles)
  );
  return {
    preset: presetId,
    // Never let an override outrun the budget: a rate above maxParticles/lifetime just churns.
    rate: Math.min(clampNumber(source?.rate ?? fallback.rate, 0, 2000, fallback.rate), maxParticles / lifetimeSeconds),
    maxParticles,
    lifetimeSeconds,
    speed: clampNumber(source?.speed ?? fallback.speed, 0, 500, fallback.speed),
    sizeScale: clampNumber(source?.sizeScale ?? fallback.sizeScale, 0.01, 50, fallback.sizeScale),
    volumeScale: clampNumber(source?.volumeScale ?? fallback.volumeScale, 0, 100, fallback.volumeScale),
    color: source?.color === undefined ? fallback.color : source.color === null ? null : String(source.color),
    gravity: resolveVector(source?.gravity, fallback.gravity, 1000, "emitter.gravity"),
    direction: resolveVector(source?.direction, fallback.direction, 1, "emitter.direction"),
    spread: clampNumber(source?.spread ?? fallback.spread, 0, 10, fallback.spread),
    seed: Math.floor(clampNumber(source?.seed ?? fallback.seed, 1, 2 ** 31 - 1, fallback.seed)),
    enabled: source?.enabled ?? fallback.enabled
  };
}

// --- procedural sprites -------------------------------------------------------------------
// Adapted from the soft radial-gradient CanvasTexture in src/engine/particle-emitter.ts, which is
// still the glow used by the legacy race scene. Extended to the four sprite families the archive
// emitters bind (see the file header for why the vendored .dds files are not loaded).

const spriteCache = new Map<AgentWorldEmitterSprite, Texture>();

function drawSoftGlow(context: CanvasRenderingContext2D, size: number): void {
  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 1, half, half, half - 1);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.2, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.38)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
}

function createSpriteTexture(sprite: AgentWorldEmitterSprite): Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const half = size / 2;
    if (sprite === "glow") {
      drawSoftGlow(context, size);
    } else if (sprite === "star") {
      // A tight core plus four diffraction spikes, standing in for star1.dds.
      drawSoftGlow(context, size);
      context.globalCompositeOperation = "lighter";
      for (const angle of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
        const long = angle % (Math.PI / 2) === 0 ? half - 2 : half * 0.55;
        const spike = context.createLinearGradient(half - Math.cos(angle) * long, half - Math.sin(angle) * long, half + Math.cos(angle) * long, half + Math.sin(angle) * long);
        spike.addColorStop(0, "rgba(255,255,255,0)");
        spike.addColorStop(0.5, "rgba(255,255,255,0.85)");
        spike.addColorStop(1, "rgba(255,255,255,0)");
        context.save();
        context.translate(half, half);
        context.rotate(angle);
        context.fillStyle = spike;
        context.fillRect(-long, -1.2, long * 2, 2.4);
        context.restore();
      }
    } else if (sprite === "smoke") {
      // A puff: one soft core plus a few offset lobes, standing in for smokey.dds.
      drawSoftGlow(context, size);
      context.globalCompositeOperation = "lighter";
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2;
        const radius = half * 0.36;
        const x = half + Math.cos(angle) * half * 0.24;
        const y = half + Math.sin(angle) * half * 0.24;
        const lobe = context.createRadialGradient(x, y, 1, x, y, radius);
        lobe.addColorStop(0, "rgba(255,255,255,0.5)");
        lobe.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = lobe;
        context.fillRect(0, 0, size, size);
      }
    } else {
      // A blurred annulus, standing in for ring_blur.dds.
      const ring = context.createRadialGradient(half, half, 1, half, half, half - 1);
      ring.addColorStop(0, "rgba(255,255,255,0)");
      ring.addColorStop(0.45, "rgba(255,255,255,0.1)");
      ring.addColorStop(0.72, "rgba(255,255,255,1)");
      ring.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = ring;
      context.fillRect(0, 0, size, size);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function getSpriteTexture(sprite: AgentWorldEmitterSprite): Texture {
  const cached = spriteCache.get(sprite);
  if (cached) return cached;
  const texture = createSpriteTexture(sprite);
  spriteCache.set(sprite, texture);
  return texture;
}

/** Deterministic PRNG so pause/step, reload and export→import all reproduce the same plume. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERTEX_SHADER = /* glsl */ `
  uniform float uPixelScale;
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float depth = max(0.0001, -viewPosition.z);
    // World-unit size with size attenuation: ndc = size * P[1][1] / depth, pixels = ndc * height/2.
    gl_PointSize = clamp(aSize * projectionMatrix[1][1] * uPixelScale / depth, 0.0, 2048.0);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 sprite = texture2D(uMap, gl_PointCoord);
    #ifdef GX_ADDITIVE
      // Additive: fold the ramp alpha into the colour so a fading particle simply adds less light.
      gl_FragColor = vec4(vColor * sprite.rgb * vAlpha, sprite.a);
    #else
      gl_FragColor = vec4(vColor * sprite.rgb, sprite.a * vAlpha);
    #endif
    if (gl_FragColor.a < 0.004) discard;
  }
`;

/**
 * A pooled, budgeted, deterministic particle system backing one `emitter` entity.
 *
 * Particles live in the emitter's *local* space and the `Points` object is the entity object
 * itself, so an emitter inherits its entity's position, rotation and scale for free (gravity and
 * emission direction are therefore local too — rotate the entity and the plume rotates with it).
 */
export class AgentWorldParticleSystem {
  readonly points: Points;

  private descriptor: AgentWorldEmitterDescriptor;
  private config: ResolvedAgentWorldEmitter;
  private readonly geometry: BufferGeometry;
  private readonly material: ShaderMaterial;
  private readonly viewport = new Vector2();
  private readonly tint = new Color();

  private positions!: Float32Array;
  private colors!: Float32Array;
  private sizes!: Float32Array;
  private alphas!: Float32Array;
  private velocities!: Float32Array;
  private ages!: Float32Array;

  private live = 0;
  private capacity = 0;
  private emissionCredit = 0;
  private random: () => number;

  constructor(config: ResolvedAgentWorldEmitter) {
    this.config = config;
    this.descriptor = findAgentWorldEmitterPreset(config.preset);
    this.random = mulberry32(config.seed);
    this.geometry = new BufferGeometry();
    this.material = new ShaderMaterial({
      uniforms: { uMap: { value: getSpriteTexture(this.descriptor.sprite) }, uPixelScale: { value: 400 } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: this.descriptor.blending === "additive" ? AdditiveBlending : NormalBlending,
      defines: this.descriptor.blending === "additive" ? { GX_ADDITIVE: "" } : {}
    });
    this.allocate(config.maxParticles);
    this.points = new Points(this.geometry, this.material);
    this.points.name = "AgentWorldEmitter";
    // Positions churn every frame and the plume can outgrow any cached bounds.
    this.points.frustumCulled = false;
    this.points.onBeforeRender = (renderer: WebGLRenderer) => {
      renderer.getDrawingBufferSize(this.viewport);
      this.material.uniforms.uPixelScale.value = this.viewport.y * 0.5;
    };
    this.prewarm();
  }

  get activeCount(): number {
    return this.live;
  }

  get preset(): AgentWorldEmitterPresetId {
    return this.config.preset;
  }

  getConfig(): ResolvedAgentWorldEmitter {
    return { ...this.config, gravity: [...this.config.gravity], direction: [...this.config.direction] };
  }

  /** Re-apply a resolved emitter field after an `update()` patch. Rebuilds only what changed. */
  configure(config: ResolvedAgentWorldEmitter): void {
    const presetChanged = config.preset !== this.config.preset;
    const seedChanged = config.seed !== this.config.seed;
    const capacityChanged = config.maxParticles !== this.capacity;
    this.config = config;
    if (presetChanged) {
      this.descriptor = findAgentWorldEmitterPreset(config.preset);
      this.material.uniforms.uMap.value = getSpriteTexture(this.descriptor.sprite);
      this.material.blending = this.descriptor.blending === "additive" ? AdditiveBlending : NormalBlending;
      this.material.defines = this.descriptor.blending === "additive" ? { GX_ADDITIVE: "" } : {};
      this.material.needsUpdate = true;
    }
    if (seedChanged || presetChanged) this.random = mulberry32(config.seed);
    if (capacityChanged) {
      this.allocate(config.maxParticles);
      this.live = 0;
      this.emissionCredit = 0;
    }
    if (presetChanged || capacityChanged) this.prewarm();
    else this.writeBuffers();
  }

  /**
   * Advance the simulation. Called from the runtime's `updateSimulation`, so an emitter honours
   * pause/step exactly like every other simulated thing in the scene.
   */
  update(deltaSeconds: number): void {
    if (deltaSeconds > 0) this.simulate(deltaSeconds);
    this.writeBuffers();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  /**
   * Run the emitter forward one lifetime at spawn so a freshly loaded scene shows a full plume
   * immediately rather than an empty point at frame zero. Fixed-step, so it stays deterministic.
   */
  private prewarm(): void {
    const step = 1 / 30;
    const steps = Math.min(240, Math.ceil(this.config.lifetimeSeconds / step));
    for (let i = 0; i < steps; i += 1) this.simulate(step);
    this.writeBuffers();
  }

  private allocate(capacity: number): void {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.ages = new Float32Array(capacity);
    this.geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("aColor", new BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("aSize", new BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute("aAlpha", new BufferAttribute(this.alphas, 1));
    this.geometry.setDrawRange(0, 0);
  }

  private simulate(deltaSeconds: number): void {
    const { gravity, lifetimeSeconds, rate, enabled } = this.config;

    for (let index = this.live - 1; index >= 0; index -= 1) {
      const age = this.ages[index] + deltaSeconds;
      if (age >= lifetimeSeconds) {
        this.recycle(index);
        continue;
      }
      this.ages[index] = age;
      const offset = index * 3;
      this.velocities[offset] += gravity[0] * deltaSeconds;
      this.velocities[offset + 1] += gravity[1] * deltaSeconds;
      this.velocities[offset + 2] += gravity[2] * deltaSeconds;
      this.positions[offset] += this.velocities[offset] * deltaSeconds;
      this.positions[offset + 1] += this.velocities[offset + 1] * deltaSeconds;
      this.positions[offset + 2] += this.velocities[offset + 2] * deltaSeconds;
    }

    if (!enabled || rate <= 0) return;
    this.emissionCredit = Math.min(this.emissionCredit + rate * deltaSeconds, this.capacity);
    while (this.emissionCredit >= 1 && this.live < this.capacity) {
      this.emissionCredit -= 1;
      this.spawn();
    }
    if (this.live >= this.capacity) this.emissionCredit = 0;
  }

  /** Swap-remove: the live prefix stays contiguous so one `setDrawRange` covers it. */
  private recycle(index: number): void {
    const last = this.live - 1;
    if (index !== last) {
      const to = index * 3;
      const from = last * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        this.positions[to + axis] = this.positions[from + axis];
        this.velocities[to + axis] = this.velocities[from + axis];
      }
      this.ages[index] = this.ages[last];
    }
    this.live = last;
  }

  private spawn(): void {
    const index = this.live;
    this.live += 1;
    const offset = index * 3;
    const { shape, volume } = this.descriptor;
    const { volumeScale, direction, spread, speed } = this.config;
    const random = this.random;

    let ox = 0;
    let oy = 0;
    let oz = 0;
    if (shape === "box") {
      ox = (random() * 2 - 1) * volume[0] * volumeScale;
      oy = (random() * 2 - 1) * volume[1] * volumeScale;
      oz = (random() * 2 - 1) * volume[2] * volumeScale;
    } else if (shape === "sphere") {
      // Rejection-free spherical sample, then a cube-root radius for a uniform interior.
      const theta = random() * Math.PI * 2;
      const cosPhi = random() * 2 - 1;
      const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
      const radius = Math.cbrt(random()) * volume[0] * volumeScale;
      ox = Math.cos(theta) * sinPhi * radius;
      oy = cosPhi * radius;
      oz = Math.sin(theta) * sinPhi * radius;
    }
    this.positions[offset] = ox;
    this.positions[offset + 1] = oy;
    this.positions[offset + 2] = oz;

    // The archive's randomDirectionFactor is a per-axis jitter around the bias direction.
    const jitter = this.descriptor.provenance.archive.randomDirectionFactor;
    const scale = spread / Math.max(1e-6, Math.max(jitter[0], jitter[1], jitter[2]));
    let dx = direction[0] + (random() * 2 - 1) * jitter[0] * scale;
    let dy = direction[1] + (random() * 2 - 1) * jitter[1] * scale;
    let dz = direction[2] + (random() * 2 - 1) * jitter[2] * scale;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) {
      dx = 0;
      dy = 1;
      dz = 0;
    } else {
      dx /= length;
      dy /= length;
      dz /= length;
    }
    // 0.45..1.2x speed variation, matching the spread the legacy race-scene emitter used.
    const magnitude = speed * (0.45 + random() * 0.75);
    this.velocities[offset] = dx * magnitude;
    this.velocities[offset + 1] = dy * magnitude;
    this.velocities[offset + 2] = dz * magnitude;
    this.ages[index] = 0;
  }

  /** Evaluate the archive keyframe ramp for every live particle and push it to the GPU. */
  private writeBuffers(): void {
    const keyframes = this.descriptor.keyframes;
    const { sizeScale, lifetimeSeconds, color } = this.config;
    const hasTint = typeof color === "string" && color.length > 0;
    if (hasTint) this.tint.set(color);

    for (let index = 0; index < this.live; index += 1) {
      const t = Math.min(1, this.ages[index] / lifetimeSeconds);
      let lower = keyframes[0];
      let upper = keyframes[keyframes.length - 1];
      for (let k = 0; k < keyframes.length - 1; k += 1) {
        if (t >= keyframes[k].t && t <= keyframes[k + 1].t) {
          lower = keyframes[k];
          upper = keyframes[k + 1];
          break;
        }
      }
      const span = upper.t - lower.t;
      const mix = span > 1e-6 ? (t - lower.t) / span : 0;
      const offset = index * 3;
      const r = lower.color[0] + (upper.color[0] - lower.color[0]) * mix;
      const g = lower.color[1] + (upper.color[1] - lower.color[1]) * mix;
      const b = lower.color[2] + (upper.color[2] - lower.color[2]) * mix;
      this.colors[offset] = hasTint ? r * this.tint.r : r;
      this.colors[offset + 1] = hasTint ? g * this.tint.g : g;
      this.colors[offset + 2] = hasTint ? b * this.tint.b : b;
      this.sizes[index] = (lower.size + (upper.size - lower.size) * mix) * sizeScale;
      this.alphas[index] = lower.alpha + (upper.alpha - lower.alpha) * mix;
    }

    this.geometry.setDrawRange(0, this.live);
    (this.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aColor as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aAlpha as BufferAttribute).needsUpdate = true;
  }
}

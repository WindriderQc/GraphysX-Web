import {
  AdditiveBlending,
  Blending,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MultiplyBlending,
  NoBlending,
  NormalBlending,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  Texture,
  Vector3
} from "three";
import { DDSLoader } from "three/examples/jsm/loaders/DDSLoader.js";

type Tuple3 = readonly [number, number, number];
type Tuple4 = readonly [number, number, number, number];
type LoadStatus = "loading" | "ready" | "error" | "disposed";

export type Tv3dBlendMode = 0 | 1 | 2 | 3 | 4 | 5;
export type Tv3dParticleChange = 1 | 2 | 3;
export type Tv3dEmitterShape = 0 | 1 | 2 | 3 | 4;

export type ArchivedParticleKeyframe = {
  timeSeconds: number;
  size: Tuple3;
  color: Tuple4;
};

export type ArchivedParticleEmitterConfig = {
  id: number;
  type: "billboard";
  maxParticles: number;
  defaultSize: number;
  location: Tuple3;
  direction: Tuple3;
  directional: boolean;
  randomDirectionFactor: Tuple3;
  power: number;
  lifetimeSeconds: number;
  shape: Tv3dEmitterShape;
  texture: "Glow2.dds" | "smokey.dds";
  defaultColor: Tuple4;
  generationSpeedMilliseconds: number;
  gravityEnabled: boolean;
  gravity: Tuple3;
  particleChange: Tv3dParticleChange;
  blending: Tv3dBlendMode;
  alphaTest: boolean;
  alphaReference: number;
  depthWrite: boolean;
  boxSize: Tuple3;
  sphereRadius: number;
  looping: boolean;
  keyframes: readonly ArchivedParticleKeyframe[];
};

/**
 * Exact fields from explosion_01.TVPJ. `Explosion1.tvp` and
 * `explosion_01.TVP` are byte-identical aliases of the compiled preset.
 */
export const EXPLOSION1_ARCHIVE_PRESET = Object.freeze({
  id: "graphysx-explosion1-tvp",
  title: "GraphysX Explosion1 — TV3D particle preset",
  classification: "reusable-effect-preset-not-a-scene",
  source: {
    binary: {
      path: "Yanik C++ BCKUP/Media/PartSys/resources/explosion1.TVP",
      sha256: "99F3AD87ED5D8BD691E21FDEF49DF455B1FD08D78236BC0E5B56CF8E4E460F5E",
      bytes: 1594,
      byteIdenticalAlias: "explosion_01.TVP"
    },
    readablePreset: {
      path: "Yanik C++ BCKUP/Media/PartSys/resources/explosion_01.TVPJ",
      sha256: "18267D7EECE0D6137C8FAE4811FDEC03DC99EB99899866B744388740F522BBE7",
      bytes: 2197
    },
    activeGraphysxHost: {
      path: "Archive/bckup/ParticleEngine.cpp",
      sha256: "D0859972CD02A997D5D7072AD9F096E1B744A8FB84F04EB6175A16AA8959FF55",
      behavior: "CLParticleEngine constructs CLExplosion, loads Explosion1.tvp at global position (-5,0,0), and starts it once."
    },
    textures: [
      { name: "Glow2.dds", sha256: "6DCF8614A1445EC2ABF851DC84BE7725FBD9790995E7313FF0DEDF8557E135B0", bytes: 65664 },
      { name: "smokey.dds", sha256: "C1B60429AF9232522439D623B249236CE8D41EC5D41725B61146309DB7129A75", bytes: 87508 }
    ]
  },
  tv3dEnums: {
    emitterType: { billboard: 1 },
    shape: { point: 0, sphereVolume: 1, boxVolume: 2, sphereSurface: 3, boxSurface: 4 },
    particleChange: { alpha: 1, color: 2, none: 3 },
    blending: { none: 0, alpha: 1, add: 2, color: 3, addAlpha: 4, multiply: 5 }
  },
  emitters: [
    {
      id: 0,
      type: "billboard",
      maxParticles: 10,
      defaultSize: 2,
      location: [0, 0, 0],
      direction: [0, 10, 0],
      directional: true,
      randomDirectionFactor: [20, 10, 20],
      power: 40,
      lifetimeSeconds: 2,
      shape: 0,
      texture: "Glow2.dds",
      defaultColor: [1, 1, 0.5, 1],
      generationSpeedMilliseconds: 10,
      gravityEnabled: true,
      gravity: [0, -50, 0],
      particleChange: 2,
      blending: 4,
      alphaTest: true,
      alphaReference: 0,
      depthWrite: false,
      boxSize: [0, 0, 0],
      sphereRadius: 0,
      looping: false,
      keyframes: [
        { timeSeconds: 0, size: [8, 8, 8], color: [0, 0, 0, 0] },
        { timeSeconds: 1, size: [4, 4, 4], color: [1, 0.75, 0, 1] },
        { timeSeconds: 2, size: [2, 2, 2], color: [1, 0, 0, 0] }
      ]
    },
    {
      id: 1,
      type: "billboard",
      maxParticles: 64,
      defaultSize: 2,
      location: [0, 0, 0],
      direction: [0, 5, 0],
      directional: true,
      randomDirectionFactor: [5, 5, 5],
      power: 10,
      lifetimeSeconds: 3,
      shape: 1,
      texture: "Glow2.dds",
      defaultColor: [1, 1, 1, 0.75],
      generationSpeedMilliseconds: 10,
      gravityEnabled: true,
      gravity: [0, -5, 0],
      particleChange: 1,
      blending: 3,
      alphaTest: true,
      alphaReference: 0,
      depthWrite: false,
      boxSize: [0, 0, 0],
      sphereRadius: 3,
      looping: false,
      keyframes: [
        { timeSeconds: 0, size: [16, 16, 16], color: [1, 1, 1, 1] },
        { timeSeconds: 2, size: [48, 48, 48], color: [0.7, 0.5, 0, 1] },
        { timeSeconds: 3, size: [128, 128, 128], color: [0.1, 0.05, 0, 0] }
      ]
    },
    {
      id: 2,
      type: "billboard",
      maxParticles: 8,
      defaultSize: 2,
      location: [0, 0, 0],
      direction: [0, -5, 0],
      directional: true,
      randomDirectionFactor: [2, 10, 2],
      power: 5,
      lifetimeSeconds: 4,
      shape: 1,
      texture: "smokey.dds",
      defaultColor: [1, 1, 1, 1],
      generationSpeedMilliseconds: 10,
      gravityEnabled: true,
      gravity: [0, 10, 0],
      particleChange: 1,
      blending: 1,
      alphaTest: false,
      alphaReference: 0,
      depthWrite: false,
      boxSize: [0, 0, 0],
      sphereRadius: 3,
      looping: false,
      keyframes: [
        { timeSeconds: 0, size: [16, 16, 16], color: [0.25, 0.125, 0, 0.1] },
        { timeSeconds: 2, size: [16, 16, 16], color: [0.2, 0.2, 0.2, 0.4] },
        { timeSeconds: 4, size: [0, 0, 0], color: [0.5, 0.5, 0.5, 0] }
      ]
    }
  ] as const satisfies readonly ArchivedParticleEmitterConfig[]
});

type ParticleRuntime = {
  ageSeconds: number;
  position: Vector3;
  velocity: Vector3;
  sprite: Sprite;
};

type EmitterRuntime = {
  config: ArchivedParticleEmitterConfig;
  group: Group;
  particles: ParticleRuntime[];
  spawned: number;
  nextSpawnSeconds: number;
};

export type ParticleEffectEnvironmentOptions = {
  assetBaseUrl?: string;
  autoReplay?: boolean;
  seed?: number;
  sourceWorldScale?: number;
};

export type ParticleEffectEnvironmentState = {
  id: "graphysx-explosion1-tvp";
  title: string;
  classification: "reusable-effect-preset-not-a-scene";
  status: "source-config-recovered-runtime-adapter-partial";
  loadStatus: LoadStatus;
  loadError: string | null;
  ready: boolean;
  visible: boolean;
  disposed: boolean;
  paused: boolean;
  autoReplay: boolean;
  seed: number;
  cycle: number;
  cycleElapsedSeconds: number;
  totalElapsedSeconds: number;
  finished: boolean;
  sourceWorldScale: number;
  sourceHostPosition: [-5, 0, 0];
  emitters: Array<{
    id: number;
    activeParticles: number;
    spawnedParticles: number;
    maxParticles: number;
    texture: string;
    lifetimeSeconds: number;
    generationSpeedMilliseconds: number;
    shape: string;
    blending: string;
    looping: false;
    sampleSourcePositions: Array<[number, number, number]>;
  }>;
  counts: {
    emitters: 3;
    maximumParticles: 82;
    activeParticles: number;
    spawnedParticles: number;
    textures: 2;
  };
  fidelity: {
    exact: string[];
    adapted: string[];
    excluded: string[];
  };
};

const FIXED_STEP_SECONDS = 1 / 120;
const REPLAY_AFTER_SECONDS = 4.5;
const SOURCE_HOST_POSITION = new Vector3(-5, 0, 0);
const SHAPE_NAMES = ["point", "sphere-volume", "box-volume", "sphere-surface", "box-surface"] as const;
const BLEND_NAMES = ["none", "alpha", "add", "color", "add-alpha", "multiply"] as const;

function blendingFor(mode: Tv3dBlendMode): Blending {
  if (mode === 0) return NoBlending;
  if (mode === 1 || mode === 3) return NormalBlending;
  if (mode === 2 || mode === 4) return AdditiveBlending;
  return MultiplyBlending;
}

function tuple3(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function interpolateKeyframes(keyframes: readonly ArchivedParticleKeyframe[], ageSeconds: number): { size: Tuple3; color: Tuple4 } {
  const first = keyframes[0];
  if (!first) return { size: [1, 1, 1], color: [1, 1, 1, 1] };
  if (ageSeconds <= first.timeSeconds) return { size: first.size, color: first.color };
  const last = keyframes[keyframes.length - 1];
  if (ageSeconds >= last.timeSeconds) return { size: last.size, color: last.color };

  for (let index = 1; index < keyframes.length; index += 1) {
    const right = keyframes[index];
    const left = keyframes[index - 1];
    if (ageSeconds <= right.timeSeconds) {
      const span = Math.max(1e-9, right.timeSeconds - left.timeSeconds);
      const t = (ageSeconds - left.timeSeconds) / span;
      return {
        size: [
          left.size[0] + (right.size[0] - left.size[0]) * t,
          left.size[1] + (right.size[1] - left.size[1]) * t,
          left.size[2] + (right.size[2] - left.size[2]) * t
        ],
        color: [
          left.color[0] + (right.color[0] - left.color[0]) * t,
          left.color[1] + (right.color[1] - left.color[1]) * t,
          left.color[2] + (right.color[2] - left.color[2]) * t,
          left.color[3] + (right.color[3] - left.color[3]) * t
        ]
      };
    }
  }
  return { size: last.size, color: last.color };
}

/** Isolated, deterministic runtime adapter for the exact GraphysX Explosion1 preset. */
export class ParticleEffectEnvironment {
  readonly group = new Group();
  readonly ready: Promise<void>;

  private readonly assetBaseUrl: string;
  private readonly initialSeed: number;
  private readonly sourceWorldScale: number;
  private readonly emitters: EmitterRuntime[];
  private readonly textures = new Map<string, Texture>();
  private randomState: number;
  private loadStatus: LoadStatus = "loading";
  private loadError: string | null = null;
  private visible = false;
  private disposed = false;
  private paused = false;
  private autoReplay: boolean;
  private accumulatorSeconds = 0;
  private cycleElapsedSeconds = 0;
  private totalElapsedSeconds = 0;
  private cycle = 1;

  constructor(options: ParticleEffectEnvironmentOptions = {}) {
    this.assetBaseUrl = (options.assetBaseUrl ?? "/assets/particles/archive").replace(/\/$/, "");
    this.initialSeed = (options.seed ?? 0x20140710) >>> 0;
    this.randomState = this.initialSeed || 1;
    this.autoReplay = options.autoReplay ?? false;
    this.sourceWorldScale = Math.max(0.001, options.sourceWorldScale ?? 0.08);

    this.group.name = "GraphysX Explosion1 — exact TVP configuration";
    this.group.scale.setScalar(this.sourceWorldScale);
    this.group.position.copy(SOURCE_HOST_POSITION).multiplyScalar(this.sourceWorldScale);
    this.group.visible = false;
    this.group.userData.archiveEnvironment = EXPLOSION1_ARCHIVE_PRESET;

    const floor = new Mesh(
      new PlaneGeometry(220, 220, 11, 11),
      new MeshBasicMaterial({ color: new Color("#172027"), wireframe: true, transparent: true, opacity: 0.38 })
    );
    floor.name = "Inferred inspection floor — not in ParticleEngine.cpp";
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.4;
    this.group.add(floor);

    this.emitters = EXPLOSION1_ARCHIVE_PRESET.emitters.map((config) => {
      const emitterGroup = new Group();
      emitterGroup.name = `Explosion1 emitter ${config.id}`;
      emitterGroup.position.set(...config.location);
      this.group.add(emitterGroup);
      return { config, group: emitterGroup, particles: [], spawned: 0, nextSpawnSeconds: 0 };
    });

    const loader = new DDSLoader();
    this.ready = Promise.all(
      EXPLOSION1_ARCHIVE_PRESET.source.textures.map(async ({ name }) => {
        const texture = await loader.loadAsync(`${this.assetBaseUrl}/${name}`);
        texture.name = name;
        this.textures.set(name, texture);
      })
    ).then(() => {
      if (!this.disposed) this.loadStatus = "ready";
    }).catch((error: unknown) => {
      this.loadStatus = "error";
      this.loadError = error instanceof Error ? error.message : String(error);
      throw error;
    });
  }

  activate(): void {
    if (this.disposed) return;
    this.visible = true;
    this.group.visible = true;
  }

  deactivate(): void {
    this.visible = false;
    this.group.visible = false;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  setAutoReplay(autoReplay: boolean): void {
    this.autoReplay = autoReplay;
  }

  restart(): void {
    if (this.disposed) return;
    this.totalElapsedSeconds = 0;
    this.cycle = 1;
    this.resetCycle();
  }

  update(deltaSeconds: number): ParticleEffectEnvironmentState {
    if (this.disposed || this.paused || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.getState();
    this.accumulatorSeconds += Math.min(deltaSeconds, 30);
    while (this.accumulatorSeconds + 1e-12 >= FIXED_STEP_SECONDS) {
      this.accumulatorSeconds -= FIXED_STEP_SECONDS;
      this.step(FIXED_STEP_SECONDS);
    }
    return this.getState();
  }

  getCameraProfile(): { position: [number, number, number]; target: [number, number, number]; fovDegrees: 48; status: "inferred-inspection" } {
    return {
      position: [-0.4, 4.8, 9.5],
      target: [-0.4, 1.2, 0],
      fovDegrees: 48,
      status: "inferred-inspection"
    };
  }

  getState(): ParticleEffectEnvironmentState {
    const emitterStates = this.emitters.map((runtime) => ({
      id: runtime.config.id,
      activeParticles: runtime.particles.length,
      spawnedParticles: runtime.spawned,
      maxParticles: runtime.config.maxParticles,
      texture: runtime.config.texture,
      lifetimeSeconds: runtime.config.lifetimeSeconds,
      generationSpeedMilliseconds: runtime.config.generationSpeedMilliseconds,
      shape: SHAPE_NAMES[runtime.config.shape],
      blending: BLEND_NAMES[runtime.config.blending],
      looping: false as const,
      sampleSourcePositions: runtime.particles.slice(0, 3).map((particle) => tuple3(particle.position))
    }));
    const activeParticles = emitterStates.reduce((sum, emitter) => sum + emitter.activeParticles, 0);
    const spawnedParticles = emitterStates.reduce((sum, emitter) => sum + emitter.spawnedParticles, 0);
    const finished = spawnedParticles === 82 && activeParticles === 0;

    return {
      id: "graphysx-explosion1-tvp",
      title: EXPLOSION1_ARCHIVE_PRESET.title,
      classification: "reusable-effect-preset-not-a-scene",
      status: "source-config-recovered-runtime-adapter-partial",
      loadStatus: this.loadStatus,
      loadError: this.loadError,
      ready: this.loadStatus === "ready",
      visible: this.visible,
      disposed: this.disposed,
      paused: this.paused,
      autoReplay: this.autoReplay,
      seed: this.initialSeed,
      cycle: this.cycle,
      cycleElapsedSeconds: this.cycleElapsedSeconds,
      totalElapsedSeconds: this.totalElapsedSeconds,
      finished,
      sourceWorldScale: this.sourceWorldScale,
      sourceHostPosition: [-5, 0, 0],
      emitters: emitterStates,
      counts: {
        emitters: 3,
        maximumParticles: 82,
        activeParticles,
        spawnedParticles,
        textures: 2
      },
      fidelity: {
        exact: [
          "compiled Explosion1 TVP hash and readable TVPJ fields",
          "three emitters, capacities, generation intervals, power, lifetime, shape, radius, gravity, blend enum, alpha/depth flags and keyframes",
          "byte-identical Glow2.dds and smokey.dds textures",
          "one-shot looping=false behavior and archived CLParticleEngine host position (-5,0,0)"
        ],
        adapted: [
          "seeded component-random direction sampling and fixed 120 Hz integration because TV3D's private RNG/integrator do not survive",
          "TV3D billboard COLOR and ADDALPHA modes mapped to Three.js alpha/additive blending because TV3D's internal blend-state recipe is unavailable",
          "uniform 0.08 display scale plus inspection floor/camera"
        ],
        excluded: [
          "the wider TVP library is inventoried but not presented as additional scenes",
          "Explosion.wav is not triggered because the surviving CLParticleEngine host does not bind it",
          "automatic replay is optional presentation behavior and defaults off"
        ]
      }
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.emitters.forEach((runtime) => this.clearEmitter(runtime));
    this.group.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      }
    });
    this.textures.forEach((texture) => texture.dispose());
    this.textures.clear();
    this.group.removeFromParent();
    this.visible = false;
    this.disposed = true;
    this.loadStatus = "disposed";
  }

  private random(): number {
    let value = this.randomState || 1;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0;
    return this.randomState / 0x1_0000_0000;
  }

  private randomSigned(): number {
    return this.random() * 2 - 1;
  }

  private resetCycle(): void {
    this.emitters.forEach((runtime) => {
      this.clearEmitter(runtime);
      runtime.spawned = 0;
      runtime.nextSpawnSeconds = 0;
    });
    this.randomState = this.initialSeed || 1;
    this.accumulatorSeconds = 0;
    this.cycleElapsedSeconds = 0;
  }

  private clearEmitter(runtime: EmitterRuntime): void {
    runtime.particles.forEach((particle) => {
      runtime.group.remove(particle.sprite);
      particle.sprite.material.dispose();
    });
    runtime.particles.length = 0;
  }

  private step(deltaSeconds: number): void {
    this.cycleElapsedSeconds += deltaSeconds;
    this.totalElapsedSeconds += deltaSeconds;

    for (const runtime of this.emitters) {
      const intervalSeconds = runtime.config.generationSpeedMilliseconds / 1000;
      while (
        runtime.spawned < runtime.config.maxParticles
        && runtime.nextSpawnSeconds <= this.cycleElapsedSeconds + 1e-9
      ) {
        this.spawn(runtime);
        runtime.spawned += 1;
        runtime.nextSpawnSeconds += intervalSeconds;
      }

      for (let index = runtime.particles.length - 1; index >= 0; index -= 1) {
        const particle = runtime.particles[index];
        particle.ageSeconds += deltaSeconds;
        if (runtime.config.gravityEnabled) {
          particle.velocity.x += runtime.config.gravity[0] * deltaSeconds;
          particle.velocity.y += runtime.config.gravity[1] * deltaSeconds;
          particle.velocity.z += runtime.config.gravity[2] * deltaSeconds;
        }
        particle.position.addScaledVector(particle.velocity, deltaSeconds);
        particle.sprite.position.copy(particle.position);

        const sample = interpolateKeyframes(runtime.config.keyframes, particle.ageSeconds);
        particle.sprite.scale.set(sample.size[0], sample.size[1], 1);
        particle.sprite.material.color.setRGB(sample.color[0], sample.color[1], sample.color[2]);
        particle.sprite.material.opacity = sample.color[3];

        if (particle.ageSeconds >= runtime.config.lifetimeSeconds) {
          runtime.group.remove(particle.sprite);
          particle.sprite.material.dispose();
          runtime.particles.splice(index, 1);
        }
      }
    }

    const active = this.emitters.reduce((sum, runtime) => sum + runtime.particles.length, 0);
    const fullySpawned = this.emitters.every((runtime) => runtime.spawned === runtime.config.maxParticles);
    if (this.autoReplay && fullySpawned && active === 0 && this.cycleElapsedSeconds >= REPLAY_AFTER_SECONDS) {
      this.cycle += 1;
      this.resetCycle();
    }
  }

  private spawn(runtime: EmitterRuntime): void {
    const config = runtime.config;
    const position = this.sampleEmitterPosition(config);
    const velocity = new Vector3(
      config.direction[0] + this.randomSigned() * config.randomDirectionFactor[0],
      config.direction[1] + this.randomSigned() * config.randomDirectionFactor[1],
      config.direction[2] + this.randomSigned() * config.randomDirectionFactor[2]
    );
    if (velocity.lengthSq() > 1e-12) velocity.normalize().multiplyScalar(config.power);
    else velocity.set(0, 0, 0);

    const initial = interpolateKeyframes(config.keyframes, 0);
    const material = new SpriteMaterial({
      map: this.textures.get(config.texture) ?? null,
      color: new Color().setRGB(initial.color[0], initial.color[1], initial.color[2]),
      opacity: initial.color[3],
      transparent: true,
      premultipliedAlpha: config.blending === 5,
      alphaTest: config.alphaReference / 255,
      depthWrite: config.depthWrite,
      blending: blendingFor(config.blending)
    });
    const sprite = new Sprite(material);
    sprite.name = `Emitter ${config.id} particle ${runtime.spawned}`;
    sprite.position.copy(position);
    sprite.scale.set(initial.size[0], initial.size[1], 1);
    runtime.group.add(sprite);
    runtime.particles.push({ ageSeconds: 0, position, velocity, sprite });
  }

  private sampleEmitterPosition(config: ArchivedParticleEmitterConfig): Vector3 {
    if (config.shape === 0) return new Vector3();
    const direction = new Vector3(this.randomSigned(), this.randomSigned(), this.randomSigned());
    if (direction.lengthSq() < 1e-12) direction.set(0, 1, 0);
    direction.normalize();

    if (config.shape === 1 || config.shape === 3) {
      const radius = config.shape === 1 ? Math.cbrt(this.random()) * config.sphereRadius : config.sphereRadius;
      return direction.multiplyScalar(radius);
    }

    const position = new Vector3(
      this.randomSigned() * config.boxSize[0] * 0.5,
      this.randomSigned() * config.boxSize[1] * 0.5,
      this.randomSigned() * config.boxSize[2] * 0.5
    );
    if (config.shape === 4) {
      const axis = Math.floor(this.random() * 3);
      position.setComponent(axis, Math.sign(position.getComponent(axis) || 1) * config.boxSize[axis] * 0.5);
    }
    return position;
  }
}

export function createParticleEffectEnvironment(options: ParticleEffectEnvironmentOptions = {}): ParticleEffectEnvironment {
  return new ParticleEffectEnvironment(options);
}

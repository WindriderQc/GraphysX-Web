import {
  AdditiveBlending,
  Blending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MultiplyBlending,
  NoBlending,
  NormalBlending,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Texture,
  Vector3
} from "three";
import { DDSLoader } from "three/examples/jsm/loaders/DDSLoader.js";
import libraryJson from "./legacy/particle-preset-library.json";

type Tuple3 = readonly [number, number, number];
type Tuple4 = readonly [number, number, number, number];
type LoadStatus = "loading" | "ready" | "error" | "disposed";
type Availability = "readable-compiled" | "readable-source-only" | "opaque-compiled-only";

export type ParticlePresetKeyframe = {
  id: number;
  timeSeconds: number;
  size: Tuple3;
  color: Tuple4;
};

export type ParticlePresetEmitter = {
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
  shape: 0 | 1 | 2 | 3 | 4;
  textureBinding: string;
  textureFile: string;
  defaultColor: Tuple4;
  generationSpeedMilliseconds: number;
  gravityEnabled: boolean;
  gravity: Tuple3;
  particleChange: 1 | 2 | 3;
  blending: 0 | 1 | 2 | 3 | 4 | 5;
  alphaTest: boolean;
  alphaReference: number;
  depthWrite: boolean;
  boxSize: Tuple3;
  sphereRadius: number;
  looping: boolean;
  keyframes: ParticlePresetKeyframe[];
};

export type ParticlePresetAttractor = {
  id: number;
  directional: boolean;
  location: Tuple3;
  attenuation: Tuple3;
  fieldDirection: Tuple3;
  repulsionConstant: number;
  velocityDependency: 0 | 1 | 2 | 3;
  radius: number;
};

type TextureEvidence = {
  name: string;
  status: "present" | "missing";
  bytes: number;
  sha256: string | null;
  source: string | null;
  publicUrl: string | null;
};

export type ReadableParticlePreset = {
  id: string;
  label: string;
  category: string;
  availability: "readable-compiled" | "readable-source-only";
  runtimeEvidence: "located-graphysx-callsite" | "no-graphysx-callsite-located";
  source: { path: string; sha256: string; bytes: number };
  compiled: { sha256: string; bytes: number; aliases: string[] } | null;
  textureBindings: TextureEvidence[];
  emitters: ParticlePresetEmitter[];
  attractors: ParticlePresetAttractor[];
};

export type OpaqueParticlePreset = {
  id: string;
  label: string;
  category: string;
  availability: "opaque-compiled-only";
  runtimeEvidence: "no-graphysx-callsite-located";
  compiled: { sha256: string; bytes: number; aliases: string[] };
  reason: string;
};

export type ParticlePresetLibraryData = {
  schema: "graphysx.particle-preset-library/v1";
  title: string;
  classification: "engine-fx-feature-not-scene";
  sourceDirectory: string;
  enumEvidence: string;
  counts: {
    compiledFilenames: number;
    uniqueCompiledBinaries: number;
    readablePresets: number;
    readableCompiledPresets: number;
    readableSourceOnlyPresets: number;
    opaqueCompiledPresets: number;
    emitters: number;
    attractors: number;
    uniqueTextureBindings: number;
    missingTextureBindings: number;
  };
  exactAliasGroups: Array<{ sha256: string; bytes: number; aliases: string[] }>;
  textures: TextureEvidence[];
  readable: ReadableParticlePreset[];
  opaque: OpaqueParticlePreset[];
  fidelityBoundary: { exact: string; adapted: string; unavailable: string };
};

export const PARTICLE_PRESET_LIBRARY = libraryJson as unknown as ParticlePresetLibraryData;
export const PARTICLE_PRESET_LIBRARY_ENTRIES = Object.freeze([
  ...PARTICLE_PRESET_LIBRARY.readable.map((preset) => ({
    id: preset.id,
    label: preset.label,
    category: preset.category,
    availability: preset.availability as Availability,
    playable: true
  })),
  ...PARTICLE_PRESET_LIBRARY.opaque.map((preset) => ({
    id: preset.id,
    label: preset.label,
    category: preset.category,
    availability: preset.availability as Availability,
    playable: false
  }))
]);

type ParticleRuntime = {
  ageSeconds: number;
  position: Vector3;
  velocity: Vector3;
};

type EmitterRuntime = {
  config: ParticlePresetEmitter;
  geometry: BufferGeometry;
  material: ShaderMaterial;
  points: Points<BufferGeometry, ShaderMaterial>;
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  particles: ParticleRuntime[];
  spawnedTotal: number;
  nextSpawnSeconds: number;
};

export type ParticlePresetLibraryOptions = {
  assetBaseUrl?: string;
  initialPresetId?: string;
  autoReplay?: boolean;
  seed?: number;
};

export type ParticlePresetLibraryState = {
  id: "archived-particle-preset-library";
  classification: "engine-fx-feature-not-scene";
  status: "readable-presets-recovered-opaque-presets-evidence-only";
  loadStatus: LoadStatus;
  loadError: string | null;
  ready: boolean;
  visible: boolean;
  disposed: boolean;
  paused: boolean;
  autoReplay: boolean;
  seed: number;
  selectionIndex: number;
  selected: {
    id: string;
    label: string;
    category: string;
    availability: Availability;
    readable: boolean;
    runtimeEvidence: string;
    source: ReadableParticlePreset["source"] | null;
    compiled: ReadableParticlePreset["compiled"] | OpaqueParticlePreset["compiled"];
    reason: string | null;
    textureBindings: TextureEvidence[];
    emitterConfigs: ParticlePresetEmitter[];
    attractorConfigs: ParticlePresetAttractor[];
  };
  cycle: number;
  cycleElapsedSeconds: number;
  totalElapsedSeconds: number;
  displayScale: number;
  oneShot: boolean;
  finished: boolean;
  counts: {
    activeEmitters: number;
    emitterCapacity: number;
    activeParticles: number;
    spawnedParticles: number;
    attractors: number;
  };
  emitters: Array<{
    id: number;
    activeParticles: number;
    spawnedParticles: number;
    capacity: number;
    textureBinding: string;
    textureFile: string;
    textureStatus: "exact-archive-texture" | "missing-binding-diagnostic-fallback";
    generationSpeedMilliseconds: number;
    lifetimeSeconds: number;
    looping: boolean;
    shape: string;
    blending: string;
    sampleSourcePositions: Array<[number, number, number]>;
  }>;
  library: {
    counts: ParticlePresetLibraryData["counts"];
    entries: typeof PARTICLE_PRESET_LIBRARY_ENTRIES;
    exactAliasGroups: ParticlePresetLibraryData["exactAliasGroups"];
    opaque: OpaqueParticlePreset[];
  };
  fidelity: ParticlePresetLibraryData["fidelityBoundary"] & { runtimeNotes: string[] };
};

const FIXED_STEP_SECONDS = 1 / 120;
const SHAPE_NAMES = ["point", "sphere-volume", "box-volume", "sphere-surface", "box-surface"] as const;
const BLEND_NAMES = ["none", "alpha", "add", "color", "add-alpha", "multiply"] as const;
const VERTEX_SHADER = `
  attribute vec4 aColor;
  attribute float aSize;
  uniform float uDisplayScale;
  uniform float uPointScale;
  uniform float uMinimumPointSize;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize <= 0.0 ? 0.0 : clamp(max(uMinimumPointSize, aSize * uDisplayScale * uPointScale / max(0.5, -mvPosition.z)), 0.0, 256.0);
  }
`;
const FRAGMENT_SHADER = `
  uniform sampler2D uMap;
  uniform bool uAlphaTest;
  uniform float uAlphaReference;
  uniform bool uMissingTexture;
  varying vec4 vColor;
  void main() {
    vec4 texel = texture2D(uMap, gl_PointCoord);
    if (uMissingTexture) {
      gl_FragColor = texel;
      return;
    }
    float alpha = texel.a * vColor.a;
    if (uAlphaTest && alpha <= uAlphaReference) discard;
    gl_FragColor = vec4(texel.rgb * vColor.rgb, alpha);
  }
`;

function blendMode(value: ParticlePresetEmitter["blending"]): Blending {
  if (value === 0) return NoBlending;
  if (value === 1 || value === 3) return NormalBlending;
  if (value === 2 || value === 4) return AdditiveBlending;
  return MultiplyBlending;
}

function interpolateParticle(config: ParticlePresetEmitter, ageSeconds: number): { size: Tuple3; color: Tuple4 } {
  const keyframes = config.keyframes;
  if (keyframes.length === 0) {
    return {
      size: [config.defaultSize, config.defaultSize, config.defaultSize],
      color: config.defaultColor
    };
  }
  const first = keyframes[0];
  if (ageSeconds <= first.timeSeconds) return first;
  const last = keyframes[keyframes.length - 1];
  if (ageSeconds >= last.timeSeconds) return last;
  for (let index = 1; index < keyframes.length; index += 1) {
    const right = keyframes[index];
    const left = keyframes[index - 1];
    if (ageSeconds <= right.timeSeconds) {
      const t = (ageSeconds - left.timeSeconds) / Math.max(1e-9, right.timeSeconds - left.timeSeconds);
      return {
        size: [
          MathUtils.lerp(left.size[0], right.size[0], t),
          MathUtils.lerp(left.size[1], right.size[1], t),
          MathUtils.lerp(left.size[2], right.size[2], t)
        ],
        color: [
          MathUtils.lerp(left.color[0], right.color[0], t),
          MathUtils.lerp(left.color[1], right.color[1], t),
          MathUtils.lerp(left.color[2], right.color[2], t),
          MathUtils.lerp(left.color[3], right.color[3], t)
        ]
      };
    }
  }
  return last;
}

function sourceTuple(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function createMissingTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#270b2e";
    context.fillRect(0, 0, 64, 64);
    context.strokeStyle = "#ff42c6";
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(8, 8);
    context.lineTo(56, 56);
    context.moveTo(56, 8);
    context.lineTo(8, 56);
    context.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.name = "Missing archive particle texture diagnostic";
  return texture;
}

function displayScaleFor(preset: ReadableParticlePreset): number {
  let extent = 4;
  for (const emitter of preset.emitters) {
    const maximumSize = Math.max(
      emitter.defaultSize,
      ...emitter.keyframes.flatMap((keyframe) => keyframe.size)
    );
    const locationExtent = Math.hypot(...emitter.location);
    const shapeExtent = Math.max(emitter.sphereRadius, ...emitter.boxSize.map((value) => Math.abs(value) * 0.5));
    const travel = Math.abs(emitter.power) * emitter.lifetimeSeconds;
    const gravityTravel = emitter.gravityEnabled
      ? 0.5 * Math.hypot(...emitter.gravity) * emitter.lifetimeSeconds * emitter.lifetimeSeconds
      : 0;
    extent = Math.max(extent, maximumSize * 0.5, locationExtent + shapeExtent + travel + gravityTravel);
  }
  return MathUtils.clamp(5.5 / extent, 0.004, 0.35);
}

export class ParticlePresetLibraryEnvironment {
  readonly group = new Group();
  readonly ready: Promise<void>;

  private readonly assetBaseUrl: string;
  private readonly initialSeed: number;
  private readonly particleRoot = new Group();
  private readonly opaqueMarker: Mesh<BoxGeometry, MeshBasicMaterial>;
  private readonly missingTexture = createMissingTexture();
  private readonly textures = new Map<string, Texture>();
  private emitterRuntimes: EmitterRuntime[] = [];
  private selectedPreset: ReadableParticlePreset | OpaqueParticlePreset;
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
  private displayScale = 0.08;

  constructor(options: ParticlePresetLibraryOptions = {}) {
    this.assetBaseUrl = (options.assetBaseUrl ?? "/assets/particles/archive").replace(/\/$/, "");
    this.initialSeed = (options.seed ?? 0x20140710) >>> 0;
    this.randomState = this.initialSeed || 1;
    this.autoReplay = options.autoReplay ?? false;
    this.selectedPreset = PARTICLE_PRESET_LIBRARY.readable[0];

    this.group.name = "GraphysX archived particle preset library";
    this.group.visible = false;
    this.group.userData.archiveEnvironment = {
      id: "archived-particle-preset-library",
      classification: PARTICLE_PRESET_LIBRARY.classification,
      counts: PARTICLE_PRESET_LIBRARY.counts
    };
    this.particleRoot.name = "Selected readable TVPJ preset";
    this.group.add(this.particleRoot);

    const floor = new Mesh(
      new PlaneGeometry(15, 15, 15, 15),
      new MeshBasicMaterial({ color: new Color("#315263"), wireframe: true, transparent: true, opacity: 0.25 })
    );
    floor.name = "Inspection grid — not part of any preset";
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.5;
    this.group.add(floor);

    this.opaqueMarker = new Mesh(
      new BoxGeometry(2.4, 2.4, 2.4),
      new MeshBasicMaterial({ color: new Color("#ff426c"), wireframe: true, transparent: true, opacity: 0.85 })
    );
    this.opaqueMarker.name = "Opaque binary — no inferred emitter geometry";
    this.opaqueMarker.position.y = 0.4;
    this.opaqueMarker.visible = false;
    this.group.add(this.opaqueMarker);

    const requested = options.initialPresetId ?? "explosion_01";
    this.selectPreset(requested);

    const loader = new DDSLoader();
    this.ready = Promise.all(PARTICLE_PRESET_LIBRARY.textures.filter((texture) => texture.status === "present").map(async (evidence) => {
      const texture = await loader.loadAsync(`${this.assetBaseUrl}/${evidence.name}`);
      texture.name = evidence.name;
      this.textures.set(evidence.name.toLowerCase(), texture);
    })).then(() => {
      if (this.disposed) return;
      this.loadStatus = "ready";
      this.rebuildSelectedPreset();
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

  listPresets(): typeof PARTICLE_PRESET_LIBRARY_ENTRIES {
    return PARTICLE_PRESET_LIBRARY_ENTRIES;
  }

  getSelectedConfig(): ReadableParticlePreset | OpaqueParticlePreset {
    return this.selectedPreset;
  }

  selectPreset(id: string): boolean {
    if (this.disposed) return false;
    const readable = PARTICLE_PRESET_LIBRARY.readable.find((preset) => preset.id === id);
    const opaque = PARTICLE_PRESET_LIBRARY.opaque.find((preset) => preset.id === id);
    const next = readable ?? opaque;
    if (!next) return false;
    this.selectedPreset = next;
    this.cycle = 1;
    this.totalElapsedSeconds = 0;
    this.rebuildSelectedPreset();
    return true;
  }

  selectNext(offset = 1): string {
    const current = PARTICLE_PRESET_LIBRARY_ENTRIES.findIndex((entry) => entry.id === this.selectedPreset.id);
    const index = (current + offset + PARTICLE_PRESET_LIBRARY_ENTRIES.length) % PARTICLE_PRESET_LIBRARY_ENTRIES.length;
    const id = PARTICLE_PRESET_LIBRARY_ENTRIES[index].id;
    this.selectPreset(id);
    return id;
  }

  selectPrevious(): string {
    return this.selectNext(-1);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  setAutoReplay(autoReplay: boolean): void {
    this.autoReplay = autoReplay;
  }

  restart(): void {
    if (this.disposed) return;
    this.cycle = 1;
    this.totalElapsedSeconds = 0;
    this.resetRuntime();
  }

  update(deltaSeconds: number): ParticlePresetLibraryState {
    if (this.disposed || this.paused || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.getState();
    this.accumulatorSeconds += Math.min(deltaSeconds, 30);
    while (this.accumulatorSeconds + 1e-12 >= FIXED_STEP_SECONDS) {
      this.accumulatorSeconds -= FIXED_STEP_SECONDS;
      this.step(FIXED_STEP_SECONDS);
    }
    return this.getState();
  }

  getCameraProfile(): { position: [number, number, number]; target: [number, number, number]; fovDegrees: 48; status: "inferred-library-inspection" } {
    return { position: [0, 4.6, 10.8], target: [0, 1, 0], fovDegrees: 48, status: "inferred-library-inspection" };
  }

  getState(): ParticlePresetLibraryState {
    const readable = this.selectedPreset.availability !== "opaque-compiled-only" ? this.selectedPreset : null;
    const emitterStates = this.emitterRuntimes.map((runtime) => ({
      id: runtime.config.id,
      activeParticles: runtime.particles.length,
      spawnedParticles: runtime.spawnedTotal,
      capacity: runtime.config.maxParticles,
      textureBinding: runtime.config.textureBinding,
      textureFile: runtime.config.textureFile,
      textureStatus: (this.textureEvidence(runtime.config.textureFile)?.status === "present"
        ? "exact-archive-texture"
        : "missing-binding-diagnostic-fallback") as "exact-archive-texture" | "missing-binding-diagnostic-fallback",
      generationSpeedMilliseconds: runtime.config.generationSpeedMilliseconds,
      lifetimeSeconds: runtime.config.lifetimeSeconds,
      looping: runtime.config.looping,
      shape: SHAPE_NAMES[runtime.config.shape],
      blending: BLEND_NAMES[runtime.config.blending],
      sampleSourcePositions: runtime.particles.slice(0, 3).map((particle) => sourceTuple(particle.position))
    }));
    const emitterCapacity = emitterStates.reduce((sum, emitter) => sum + emitter.capacity, 0);
    const activeParticles = emitterStates.reduce((sum, emitter) => sum + emitter.activeParticles, 0);
    const spawnedParticles = emitterStates.reduce((sum, emitter) => sum + emitter.spawnedParticles, 0);
    const oneShot = Boolean(readable && readable.emitters.length > 0 && readable.emitters.every((emitter) => !emitter.looping));
    const finished = Boolean(oneShot && emitterStates.every((emitter) => emitter.spawnedParticles >= emitter.capacity) && activeParticles === 0);
    const compiled = this.selectedPreset.compiled;

    return {
      id: "archived-particle-preset-library",
      classification: "engine-fx-feature-not-scene",
      status: "readable-presets-recovered-opaque-presets-evidence-only",
      loadStatus: this.loadStatus,
      loadError: this.loadError,
      ready: this.loadStatus === "ready",
      visible: this.visible,
      disposed: this.disposed,
      paused: this.paused,
      autoReplay: this.autoReplay,
      seed: this.initialSeed,
      selectionIndex: PARTICLE_PRESET_LIBRARY_ENTRIES.findIndex((entry) => entry.id === this.selectedPreset.id),
      selected: {
        id: this.selectedPreset.id,
        label: this.selectedPreset.label,
        category: this.selectedPreset.category,
        availability: this.selectedPreset.availability,
        readable: Boolean(readable),
        runtimeEvidence: this.selectedPreset.runtimeEvidence,
        source: readable?.source ?? null,
        compiled,
        reason: this.selectedPreset.availability === "opaque-compiled-only" ? this.selectedPreset.reason : null,
        textureBindings: readable?.textureBindings ?? [],
        emitterConfigs: readable?.emitters ?? [],
        attractorConfigs: readable?.attractors ?? []
      },
      cycle: this.cycle,
      cycleElapsedSeconds: this.cycleElapsedSeconds,
      totalElapsedSeconds: this.totalElapsedSeconds,
      displayScale: this.displayScale,
      oneShot,
      finished,
      counts: {
        activeEmitters: emitterStates.length,
        emitterCapacity,
        activeParticles,
        spawnedParticles,
        attractors: readable?.attractors.length ?? 0
      },
      emitters: emitterStates,
      library: {
        counts: PARTICLE_PRESET_LIBRARY.counts,
        entries: PARTICLE_PRESET_LIBRARY_ENTRIES,
        exactAliasGroups: PARTICLE_PRESET_LIBRARY.exactAliasGroups,
        opaque: PARTICLE_PRESET_LIBRARY.opaque
      },
      fidelity: {
        ...PARTICLE_PRESET_LIBRARY.fidelityBoundary,
        runtimeNotes: [
          "All readable TVPJ values and surviving texture bindings are preserved in selected.emitterConfigs/attractorConfigs.",
          "Looping emitters honor archived capacity, generation interval and lifetime; the batch renderer uses one draw call per emitter.",
          "COLOR and ADDALPHA map to alpha and additive blending because TV3D's internal blend-state recipes are unavailable.",
          "The one archived attractor uses a disclosed radial/directional force adapter with its exact serialized values.",
          "A missing texture binding uses a conspicuous magenta-X diagnostic sprite; it is not a replacement archive texture.",
          "Opaque compiled-only presets remain selectable evidence with zero invented emitters."
        ]
      }
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.clearEmitterRuntimes();
    this.group.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      }
    });
    this.textures.forEach((texture) => texture.dispose());
    this.textures.clear();
    this.missingTexture.dispose();
    this.group.removeFromParent();
    this.visible = false;
    this.disposed = true;
    this.loadStatus = "disposed";
  }

  private textureEvidence(name: string): TextureEvidence | undefined {
    return PARTICLE_PRESET_LIBRARY.textures.find((texture) => texture.name.toLowerCase() === name.toLowerCase());
  }

  private rebuildSelectedPreset(): void {
    this.clearEmitterRuntimes();
    this.opaqueMarker.visible = this.selectedPreset.availability === "opaque-compiled-only";
    if (this.selectedPreset.availability === "opaque-compiled-only") {
      this.displayScale = 1;
      this.particleRoot.scale.setScalar(1);
      this.resetRuntime();
      return;
    }

    this.displayScale = displayScaleFor(this.selectedPreset);
    this.particleRoot.scale.setScalar(this.displayScale);
    for (const config of this.selectedPreset.emitters) {
      const positions = new Float32Array(config.maxParticles * 3);
      const colors = new Float32Array(config.maxParticles * 4);
      const sizes = new Float32Array(config.maxParticles);
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setAttribute("aColor", new BufferAttribute(colors, 4));
      geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
      geometry.setDrawRange(0, 0);

      const texture = this.textures.get(config.textureFile.toLowerCase()) ?? this.missingTexture;
      const missingTexture = texture === this.missingTexture;
      const material = new ShaderMaterial({
        uniforms: {
          uMap: { value: texture },
          uAlphaTest: { value: config.alphaTest },
          uAlphaReference: { value: config.alphaReference / 255 },
          uMissingTexture: { value: missingTexture },
          uDisplayScale: { value: this.displayScale },
          uPointScale: { value: 720 },
          uMinimumPointSize: { value: missingTexture ? 20 : 6 }
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        blending: blendMode(config.blending),
        premultipliedAlpha: config.blending === 5,
        depthWrite: config.depthWrite,
        depthTest: true,
        toneMapped: false
      });
      const points = new Points(geometry, material);
      points.name = `Preset ${this.selectedPreset.id} emitter ${config.id}`;
      points.frustumCulled = false;
      points.renderOrder = config.id;
      this.particleRoot.add(points);
      this.emitterRuntimes.push({
        config,
        geometry,
        material,
        points,
        positions,
        colors,
        sizes,
        particles: [],
        spawnedTotal: 0,
        nextSpawnSeconds: 0
      });
    }
    this.resetRuntime();
  }

  private clearEmitterRuntimes(): void {
    for (const runtime of this.emitterRuntimes) {
      this.particleRoot.remove(runtime.points);
      runtime.geometry.dispose();
      runtime.material.dispose();
    }
    this.emitterRuntimes = [];
  }

  private resetRuntime(): void {
    this.randomState = this.initialSeed || 1;
    this.accumulatorSeconds = 0;
    this.cycleElapsedSeconds = 0;
    for (const runtime of this.emitterRuntimes) {
      runtime.particles.length = 0;
      runtime.spawnedTotal = 0;
      runtime.nextSpawnSeconds = 0;
      runtime.geometry.setDrawRange(0, 0);
    }
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

  private step(deltaSeconds: number): void {
    if (this.selectedPreset.availability === "opaque-compiled-only") return;
    this.cycleElapsedSeconds += deltaSeconds;
    this.totalElapsedSeconds += deltaSeconds;

    for (const runtime of this.emitterRuntimes) {
      const config = runtime.config;
      const intervalSeconds = Math.max(0.001, config.generationSpeedMilliseconds / 1000);
      while (runtime.nextSpawnSeconds <= this.cycleElapsedSeconds + 1e-9) {
        const maySpawn = config.looping
          ? runtime.particles.length < config.maxParticles
          : runtime.spawnedTotal < config.maxParticles;
        if (maySpawn) {
          runtime.particles.push(this.spawnParticle(config));
          runtime.spawnedTotal += 1;
        }
        runtime.nextSpawnSeconds += intervalSeconds;
        if (!config.looping && runtime.spawnedTotal >= config.maxParticles) break;
      }

      for (let index = runtime.particles.length - 1; index >= 0; index -= 1) {
        const particle = runtime.particles[index];
        particle.ageSeconds += deltaSeconds;
        if (config.gravityEnabled) {
          particle.velocity.x += config.gravity[0] * deltaSeconds;
          particle.velocity.y += config.gravity[1] * deltaSeconds;
          particle.velocity.z += config.gravity[2] * deltaSeconds;
        }
        this.applyAttractors(particle, deltaSeconds);
        particle.position.addScaledVector(particle.velocity, deltaSeconds);
        if (particle.ageSeconds >= config.lifetimeSeconds) runtime.particles.splice(index, 1);
      }
      this.refreshGeometry(runtime);
    }

    const active = this.emitterRuntimes.reduce((sum, runtime) => sum + runtime.particles.length, 0);
    const oneShot = this.emitterRuntimes.length > 0 && this.emitterRuntimes.every((runtime) => !runtime.config.looping);
    const fullySpawned = this.emitterRuntimes.every((runtime) => runtime.spawnedTotal >= runtime.config.maxParticles);
    if (this.autoReplay && oneShot && fullySpawned && active === 0) {
      this.cycle += 1;
      this.resetRuntime();
    }
  }

  private spawnParticle(config: ParticlePresetEmitter): ParticleRuntime {
    const position = this.sampleEmitterPosition(config);
    const velocity = config.directional
      ? new Vector3(
        config.direction[0] + this.randomSigned() * config.randomDirectionFactor[0],
        config.direction[1] + this.randomSigned() * config.randomDirectionFactor[1],
        config.direction[2] + this.randomSigned() * config.randomDirectionFactor[2]
      )
      : new Vector3(this.randomSigned(), this.randomSigned(), this.randomSigned());
    if (velocity.lengthSq() > 1e-12) velocity.normalize().multiplyScalar(config.power);
    else velocity.set(0, 0, 0);
    return { ageSeconds: 0, position, velocity };
  }

  private sampleEmitterPosition(config: ParticlePresetEmitter): Vector3 {
    const position = new Vector3(...config.location);
    if (config.shape === 0) return position;
    const direction = new Vector3(this.randomSigned(), this.randomSigned(), this.randomSigned());
    if (direction.lengthSq() < 1e-12) direction.set(0, 1, 0);
    direction.normalize();
    if (config.shape === 1 || config.shape === 3) {
      const radius = config.shape === 1 ? Math.cbrt(this.random()) * config.sphereRadius : config.sphereRadius;
      return position.addScaledVector(direction, radius);
    }
    position.add(new Vector3(
      this.randomSigned() * config.boxSize[0] * 0.5,
      this.randomSigned() * config.boxSize[1] * 0.5,
      this.randomSigned() * config.boxSize[2] * 0.5
    ));
    if (config.shape === 4) {
      const axis = Math.floor(this.random() * 3);
      position.setComponent(axis, config.location[axis] + Math.sign(position.getComponent(axis) - config.location[axis] || 1) * config.boxSize[axis] * 0.5);
    }
    return position;
  }

  private applyAttractors(particle: ParticleRuntime, deltaSeconds: number): void {
    if (this.selectedPreset.availability === "opaque-compiled-only") return;
    for (const attractor of this.selectedPreset.attractors) {
      const origin = new Vector3(...attractor.location);
      const radial = particle.position.clone().sub(origin);
      const distance = radial.length();
      if (distance > attractor.radius || attractor.radius <= 0) continue;
      const direction = attractor.directional ? new Vector3(...attractor.fieldDirection) : radial;
      if (direction.lengthSq() < 1e-12) continue;
      direction.normalize();
      const attenuation = Math.max(1e-6,
        1
        + attractor.attenuation[0] * distance
        + attractor.attenuation[1] * distance * distance
        + attractor.attenuation[2] * distance * distance * distance
      );
      const speed = Math.max(1, particle.velocity.length());
      const velocityFactor = attractor.velocityDependency === 0 ? 1 : speed ** attractor.velocityDependency;
      particle.velocity.addScaledVector(direction, attractor.repulsionConstant * velocityFactor * deltaSeconds / attenuation);
    }
  }

  private refreshGeometry(runtime: EmitterRuntime): void {
    for (let index = 0; index < runtime.particles.length; index += 1) {
      const particle = runtime.particles[index];
      const sample = interpolateParticle(runtime.config, particle.ageSeconds);
      const positionOffset = index * 3;
      const colorOffset = index * 4;
      runtime.positions[positionOffset] = particle.position.x;
      runtime.positions[positionOffset + 1] = particle.position.y;
      runtime.positions[positionOffset + 2] = particle.position.z;
      runtime.colors[colorOffset] = sample.color[0];
      runtime.colors[colorOffset + 1] = sample.color[1];
      runtime.colors[colorOffset + 2] = sample.color[2];
      runtime.colors[colorOffset + 3] = sample.color[3];
      runtime.sizes[index] = Math.max(sample.size[0], sample.size[1]);
    }
    runtime.geometry.setDrawRange(0, runtime.particles.length);
    runtime.geometry.attributes.position.needsUpdate = true;
    runtime.geometry.attributes.aColor.needsUpdate = true;
    runtime.geometry.attributes.aSize.needsUpdate = true;
  }
}

export function createParticlePresetLibraryEnvironment(options: ParticlePresetLibraryOptions = {}): ParticlePresetLibraryEnvironment {
  return new ParticlePresetLibraryEnvironment(options);
}

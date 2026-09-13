import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Sphere,
  Vector3,
} from "three";

import faceAsset from "./llmx-face-forge.json";
import {
  type FaceAsset,
  type FaceDrivers,
  type FaceWeights,
  type ResolvedAgentWorldAppearance,
  type AgentWorldFaceLevel,
  type ResolvedAgentWorldFace,
  NEUTRAL_DRIVERS,
  POSE_LIMITS,
  clampDrivers,
  deriveWeights,
  effectiveFaceLevel,
  eyeTransform,
  hash01,
  poseInto,
} from "./llmx-face-pose";

/**
 * `voxel-face` — the Forge mask as a rig the world can hold and a conversation can drive.
 *
 * Shaped like {@link AgentWorldFormulaField} on purpose — `object`, `configure`, `dispose` — so
 * the runtime treats it the same way as every other simulated appearance. What is different is
 * where its motion comes from: a formula field is a pure function of its own config, while this
 * is a pure function of *conversation state*, pushed in from outside by
 * {@link AgentWorldVoxelFace.setDrivers} and advanced by {@link AgentWorldVoxelFace.update}
 * from the host's one frame loop. There is no second `requestAnimationFrame` here and no call
 * to any service: the rig is told what to express, it does not go and find out.
 *
 * ## Why three meshes and not one
 *
 * Cubes are split by what they need rather than by where they are:
 *
 * - **static metal** — cranium and temple fins. Nothing an expression does moves them, so their
 *   matrices are written once at assembly and never touched again. That is the majority of the
 *   mask, and it is what makes a denser, better-looking sculpt affordable.
 * - **animated metal** — brow, sockets, cheeks, nose, jaw, lips. Rewritten per frame.
 * - **eyes** — the mask's only emissive material, and the only feature a viewer reads presence
 *   from. Its own mesh so its emissive can rise and fall without touching the metal.
 *
 * Three draw calls for the whole face, and roughly 3,200 of 5,500 cubes rewritten per frame
 * instead of all of them.
 *
 * The expression maths itself is not here — it is in `llmx-face-pose.ts`, shared with the unit
 * tests and the offline preview tool, so a wrong mouth is reproducible without a browser.
 */

/**
 * The configuration and appearance API lives in `llmx-face-pose.ts` — it is plain data, and
 * keeping it there is what lets `node --test` reach it (this module takes Three.js at runtime,
 * which the fast test tier cannot). Re-exported here so that "the face module" remains one
 * import for callers; moving an export is not a reason to break them.
 */
export {
  type AgentWorldAppearance,
  type AgentWorldFace,
  type AgentWorldFaceLevel,
  type ResolvedAgentWorldAppearance,
  type ResolvedAgentWorldFace,
  AGENT_WORLD_APPEARANCE_KINDS,
  resolveAgentWorldAppearance,
  resolveAgentWorldFace,
  serializeAgentWorldAppearance,
} from "./llmx-face-pose";

/** Per-region tint, applied through `instanceColor` so one material serves the whole mask. */
const REGION_TINT: Record<string, keyof Pick<ResolvedAgentWorldFace, "metalColor" | "copperColor" | "lipColor">> = {
  plate: "copperColor",
  lip: "lipColor",
};

/** Regions darker than the base metal, so the orbits stay deep under a strong key light. */
const REGION_SHADE: Record<string, number> = { socket: 0.55, brow: 0.84, jaw: 0.94, lid: 1.12, cheek: 1.1 };

/** Cube edge as a multiple of the grid step. See the note where it is used. */
const CUBE_OVERLAP = 1.022;

/**
 * Maximum forge jitter, in radians. Small on purpose: this is the difference between "stacked
 * by hand" and "exploded". Every degree here also widens the seams the overlap has to close.
 */
const JITTER_RADIANS = 0.03;

const asset = faceAsset as unknown as FaceAsset;

/**
 * How fast each driver chases the value it was given, as a time constant in seconds.
 *
 * The mouth is the one that matters: it has to be fast enough to look attached to the voice and
 * slow enough not to chatter on every sample. Attack is much faster than release because a
 * mouth snaps open and closes more gently — symmetric smoothing reads as chewing.
 */
const RESPONSE = {
  speakAttack: 0.03,
  speakRelease: 0.1,
  speakTone: 0.12,
  blink: 0.035,
  gaze: 0.16,
  attention: 0.45,
  think: 0.7,
  warmth: 0.9,
  build: 0.05,
};

/** Frame-rate independent exponential approach. `tau` is the time to close ~63% of the gap. */
const approach = (current: number, target: number, tau: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-dt / Math.max(tau, 1e-4)));

export class AgentWorldVoxelFace {
  readonly object = new Group();

  private config: ResolvedAgentWorldFace;
  /** Device cap on density. Never written back to `config` — see {@link setQualityCeiling}. */
  private ceiling: AgentWorldFaceLevel | null = null;
  private weights: FaceWeights;

  /** Cube indices belonging to each mesh, resolved once at build. */
  private metalAnimated: Uint32Array = new Uint32Array(0);
  private metalStatic: Uint32Array = new Uint32Array(0);
  private eyeCubes: Uint32Array = new Uint32Array(0);
  private lidCubes: Uint32Array = new Uint32Array(0);

  private animatedMesh: InstancedMesh | null = null;
  private staticMesh: InstancedMesh | null = null;
  private eyeMesh: InstancedMesh | null = null;

  /** Pose scratch, sized once. `poseInto` writes here; the meshes read from it. */
  private position = new Float32Array(0);
  private scale = new Float32Array(0);
  /** Per-cube forge jitter as a quaternion, precomputed: xyzw per cube. */
  private jitter = new Float32Array(0);

  private readonly current: FaceDrivers = { ...NEUTRAL_DRIVERS, build: 0, attention: 0 };
  private readonly target: FaceDrivers = { ...NEUTRAL_DRIVERS, build: 0, attention: 0 };

  private blinkTimer = 1.8;
  private blinkPhase = 0;
  private autoBlinkValue = 0;

  // Reused across every cube of every frame. The update loop allocates nothing.
  private readonly matrix = new Matrix4();
  private readonly vector = new Vector3();
  private readonly scaleVector = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly spin = new Quaternion();
  private readonly axis = new Vector3();
  private readonly color = new Color();

  constructor(config: ResolvedAgentWorldFace) {
    this.config = config;
    this.object.name = "VoxelFace";
    this.object.userData.graphysxVoxelFace = this;
    this.weights = deriveWeights(asset, this.effectiveLevel());
    this.build();
  }

  /**
   * Cap the rendered density to what this device can afford.
   *
   * Deliberately separate from {@link configure}: the ceiling is a property of the machine
   * looking at the mask, the authored `level` is a property of the world. Folding the cap into
   * the configuration would mean that opening a world on a phone and letting it autosave writes
   * the phone's limit back into the document — and the mask is then permanently coarse for
   * everyone, including the author, with nothing recording why.
   *
   * Pass `null` to lift the cap.
   */
  setQualityCeiling(profile: AgentWorldFaceLevel | null): void {
    if (this.ceiling === profile) return;
    this.ceiling = profile;
    const level = this.effectiveLevel();
    if (level === this.weights.level.name) return;
    this.weights = deriveWeights(asset, level);
    this.build();
  }

  private effectiveLevel(): AgentWorldFaceLevel {
    return effectiveFaceLevel(this.config.level, this.ceiling);
  }

  /**
   * Apply a new configuration. A change of level or seed rebuilds the buffers; a change of
   * palette only rewrites colours, so recolouring the mask does not restart its assembly.
   */
  configure(config: ResolvedAgentWorldFace): void {
    const previous = this.config;
    this.config = config;
    const structural = previous.level !== config.level || previous.seed !== config.seed || previous.asset !== config.asset;
    if (structural) {
      this.weights = deriveWeights(asset, this.effectiveLevel());
      this.build();
      return;
    }
    this.writeColors();
  }

  /**
   * Set what the face should be expressing. These are targets, not positions: {@link update}
   * eases toward them, so a caller may push a value every frame or once a second and get the
   * same motion. Omitted fields keep their current target.
   */
  setDrivers(drivers: Partial<FaceDrivers>): void {
    const clamped = clampDrivers({ ...this.target, ...drivers });
    for (const key of Object.keys(this.target) as (keyof FaceDrivers)[]) {
      if (key === "breath") continue; // the rig owns its own clock
      this.target[key] = clamped[key];
    }
  }

  /** Immediate authored pose for load/skip/reduced motion; normal speech still uses smoothing. */
  snapDrivers(drivers: Partial<FaceDrivers>): void {
    this.setDrivers(drivers);
    for (const key of Object.keys(drivers) as (keyof FaceDrivers)[]) {
      if (key !== "breath") this.current[key] = this.target[key];
    }
    this.staticDirty = true;
    this.update(0);
  }

  /** Detail follows the host device, not the saved environment. */
  setLevel(level: AgentWorldFaceLevel): void {
    if (level !== this.config.level) this.configure({ ...this.config, level });
  }

  /**
   * Advance the face by one frame. Called from `host.subscribeFrame`, never from its own loop.
   *
   * The blink is the one driver the rig generates itself, and it composes rather than competes:
   * the lid is closed if *either* the scheduler or the caller says so. That is what lets an
   * entry choreography hold the eyes shut through the build and then hand them back without a
   * mode flag or a hand-off frame where both are fighting.
   */
  update(deltaSeconds: number): void {
    const dt = Number.isFinite(deltaSeconds) ? Math.min(Math.max(deltaSeconds, 0), 0.1) : 0;
    const current = this.current;
    const target = this.target;

    current.build = approach(current.build, target.build, RESPONSE.build, dt);
    // Exponential convergence otherwise stays infinitesimally below 1 forever, uploading the
    // entire static mask every frame even after assembly has visibly finished.
    if (Math.abs(current.build - target.build) < 1e-5) current.build = target.build;
    current.speak = approach(
      current.speak,
      target.speak,
      target.speak > current.speak ? RESPONSE.speakAttack : RESPONSE.speakRelease,
      dt,
    );
    current.speakTone = approach(current.speakTone, target.speakTone, RESPONSE.speakTone, dt);
    current.gazeX = approach(current.gazeX, target.gazeX, RESPONSE.gaze, dt);
    current.gazeY = approach(current.gazeY, target.gazeY, RESPONSE.gaze, dt);
    current.attention = approach(current.attention, target.attention, RESPONSE.attention, dt);
    current.think = approach(current.think, target.think, RESPONSE.think, dt);
    current.warmth = approach(current.warmth, target.warmth, RESPONSE.warmth, dt);
    current.breath += dt * 0.9;

    this.advanceBlink(dt);
    current.blink = approach(current.blink, Math.max(this.autoBlinkValue, target.blink), RESPONSE.blink, dt);

    // While the mask is still assembling, every cube's scale is moving, so every cube is posed.
    // Once it is whole, only the animated slice needs rewriting and the static mesh is left
    // exactly as it was written.
    const assembling = current.build < 1 || this.staticDirty;
    const limit = assembling ? this.weights.count : this.weights.animatedCount;
    poseInto(this.weights, current, this.position, this.scale, limit);

    this.writeMesh(this.animatedMesh, this.metalAnimated);
    this.writeEyes();
    if (assembling) {
      this.writeMesh(this.staticMesh, this.metalStatic);
      this.staticDirty = current.build < 1;
    }
  }

  /** Live readout, so a host can show what the face is doing without re-deriving it. */
  describe(): {
    level: AgentWorldFaceLevel;
    renderedLevel: AgentWorldFaceLevel;
    cubes: number;
    animatedCubes: number;
    build: number;
    speaking: boolean;
  } {
    return {
      // Both, because "why does it look coarse here" is otherwise unanswerable from the outside.
      level: this.config.level,
      renderedLevel: this.weights.level.name as AgentWorldFaceLevel,
      cubes: this.weights.count,
      animatedCubes: this.weights.animatedCount,
      build: Number(this.current.build.toFixed(3)),
      // A threshold, not a state: the mouth is visibly moving. The conversation owns whether a
      // turn is in progress; this only reports what the geometry is doing.
      speaking: this.current.speak > 0.04,
    };
  }

  dispose(): void {
    for (const mesh of [this.animatedMesh, this.staticMesh, this.eyeMesh]) {
      if (!mesh) continue;
      this.object.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    }
    this.animatedMesh = null;
    this.staticMesh = null;
    this.eyeMesh = null;
    delete this.object.userData.graphysxVoxelFace;
  }

  // -------------------------------------------------------------------------

  private staticDirty = true;

  private build(): void {
    this.disposeMeshes();
    const { weights } = this;
    const { count } = weights;
    const regionNames = asset.regions;

    this.position = new Float32Array(count * 3);
    this.scale = new Float32Array(count);
    this.jitter = new Float32Array(count * 4);

    // A small deterministic rotation per cube. Perfectly aligned cubes read as CAD output; a
    // couple of degrees of scatter reads as something forged and stacked by hand. Derived from
    // the index and the seed, so the same mask is the same mask on every machine.
    const spin = new Quaternion();
    const axis = new Vector3();
    for (let i = 0; i < count; i += 1) {
      const a = hash01(i * 3 + this.config.seed * 7919);
      const b = hash01(i * 3 + 1 + this.config.seed * 7919);
      const c = hash01(i * 3 + 2 + this.config.seed * 7919);
      axis.set(a - 0.5, b - 0.5, c - 0.5);
      if (axis.lengthSq() < 1e-8) axis.set(0, 1, 0);
      axis.normalize();
      spin.setFromAxisAngle(axis, (c - 0.5) * 2 * JITTER_RADIANS);
      this.jitter[i * 4] = spin.x;
      this.jitter[i * 4 + 1] = spin.y;
      this.jitter[i * 4 + 2] = spin.z;
      this.jitter[i * 4 + 3] = spin.w;
    }

    const metalAnimated: number[] = [];
    const metalStatic: number[] = [];
    const eyeCubes: number[] = [];
    const lidCubes: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const name = regionNames[weights.region[i]];
      if (name === "eye") {
        eyeCubes.push(i);
        continue;
      }
      if (name === "lid") lidCubes.push(i);
      if (i < weights.animatedCount) metalAnimated.push(i);
      else metalStatic.push(i);
    }
    this.metalAnimated = Uint32Array.from(metalAnimated);
    this.metalStatic = Uint32Array.from(metalStatic);
    this.eyeCubes = Uint32Array.from(eyeCubes);
    this.lidCubes = Uint32Array.from(lidCubes);

    // Cubes are drawn slightly larger than the grid step so neighbours interpenetrate. At
    // exactly one step they only *touch*, and the forge jitter below then rotates them apart:
    // a rotated cube no longer tiles — its faces pull away while its corners overlap — which
    // opened a lattice of lit seams across the cranium under a grazing key light. Overlap is
    // free (the cubes are opaque) and it is what makes the mask read as one solid mass.
    const edge = weights.level.cube * CUBE_OVERLAP;
    this.animatedMesh = this.createMesh("VoxelFaceAnimated", edge, this.metalAnimated.length, false);
    this.staticMesh = this.createMesh("VoxelFaceStatic", edge, this.metalStatic.length, false);
    this.eyeMesh = this.createMesh("VoxelFaceEyes", edge, this.eyeCubes.length, true);

    this.writeColors();
    this.staticDirty = true;
    // Pose once immediately, so a face added to a scene is never a frame of cubes at the origin.
    poseInto(weights, this.current, this.position, this.scale, weights.count);
    this.writeMesh(this.animatedMesh, this.metalAnimated);
    this.writeMesh(this.staticMesh, this.metalStatic);
    this.writeEyes();
  }

  private createMesh(name: string, edge: number, count: number, emissive: boolean): InstancedMesh {
    const material = new MeshStandardMaterial(
      emissive
        ? { color: "#0b1418", emissive: this.config.eyeColor, emissiveIntensity: 0.8, roughness: 0.25, metalness: 0 }
        : // Deliberately not a mirror-finish metal. At metalness 0.82 the mask had almost no
          // diffuse response left, so in a dark room lit by one cold key it went to a flat
          // silhouette with two glowing eyes — impressive in a still, unreadable in a
          // conversation, which is exactly the failure the plan warns about. Half-metal keeps
          // the copper and the specular while letting the volumes carry the light.
          { roughness: 0.54, metalness: 0.5 },
    );
    const mesh = new InstancedMesh(new BoxGeometry(edge, edge, edge), material, Math.max(count, 1));
    mesh.name = name;
    mesh.count = count;
    // The mask casts one silhouette into the Forge; it must not receive its own cubes' shadows,
    // which at this density turns the whole face into noise under a strong key light.
    mesh.castShadow = !emissive;
    mesh.userData.graphysxFaceCastShadow = !emissive;
    mesh.receiveShadow = false;

    // A fixed, generous bounding sphere. Recomputing it per frame over thousands of moving
    // instances costs more than the culling saves, and letting it go stale clips the face off
    // screen the moment the jaw opens.
    const b = this.weights.bounds;
    const reach = POSE_LIMITS.jawRadians * 2 + edge;
    mesh.boundingSphere = new Sphere(
      new Vector3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2),
      Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2 + reach,
    );
    this.object.add(mesh);
    return mesh;
  }

  private writeColors(): void {
    const regionNames = asset.regions;
    const base = new Color(this.config.metalColor);
    for (const [mesh, list] of [
      [this.animatedMesh, this.metalAnimated],
      [this.staticMesh, this.metalStatic],
    ] as const) {
      if (!mesh) continue;
      for (let j = 0; j < list.length; j += 1) {
        const i = list[j];
        const name = regionNames[this.weights.region[i]];
        const tint = REGION_TINT[name];
        this.color.set(tint ? this.config[tint] : base);
        const shade = REGION_SHADE[name];
        if (shade !== undefined) this.color.multiplyScalar(shade);
        // A touch of per-cube variation, so a large flat plane of metal is not one flat colour.
        this.color.multiplyScalar(0.93 + hash01(i + 977) * 0.14);
        mesh.setColorAt(j, this.color);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (this.eyeMesh) {
      (this.eyeMesh.material as MeshStandardMaterial).emissive.set(this.config.eyeColor);
    }
  }

  /** Advance the blink scheduler. Intervals are irregular; a metronome blink reads as a machine. */
  private advanceBlink(dt: number): void {
    if (!this.config.autoBlink) {
      this.autoBlinkValue = 0;
      return;
    }
    if (this.blinkPhase > 0) {
      this.blinkPhase = Math.max(0, this.blinkPhase - dt / 0.13);
      // Down and back up over one blink, rather than a step.
      this.autoBlinkValue = Math.sin(this.blinkPhase * Math.PI);
      if (this.blinkPhase === 0) this.blinkTimer = 2.2 + hash01(Math.floor(this.current.breath * 97)) * 4.5;
      return;
    }
    this.autoBlinkValue = 0;
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) this.blinkPhase = 1;
  }

  private writeMesh(mesh: InstancedMesh | null, list: Uint32Array): void {
    if (!mesh) return;
    for (let j = 0; j < list.length; j += 1) {
      const i = list[j];
      this.vector.set(this.position[i * 3], this.position[i * 3 + 1], this.position[i * 3 + 2]);
      this.quaternion.set(this.jitter[i * 4], this.jitter[i * 4 + 1], this.jitter[i * 4 + 2], this.jitter[i * 4 + 3]);
      const s = this.scale[i];
      this.scaleVector.set(s, s, s);
      this.matrix.compose(this.vector, this.quaternion, this.scaleVector);
      mesh.setMatrixAt(j, this.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Eyes and lids, which the pose model deliberately leaves at rest: both are rigid bodies
   * turning about the eye centre, so one rotation per side is cheaper and more correct than a
   * per-cube weight. The lid rotates further than the eye, and closes downward.
   */
  private writeEyes(): void {
    const eye = eyeTransform(this.weights.anchors, this.current);
    const mesh = this.eyeMesh;
    if (mesh) {
      (mesh.material as MeshStandardMaterial).emissiveIntensity = eye.glow;
      this.writeRotatedAbout(mesh, this.eyeCubes, eye.pivot, eye.yaw, eye.pitch, null);
    }
    // Lids live in the metal mesh, so they are re-posed on top of what writeMesh just wrote.
    this.writeRotatedAbout(this.animatedMesh, this.lidCubes, eye.pivot, 0, eye.lidRadians, this.metalAnimated);
  }

  private writeRotatedAbout(
    mesh: InstancedMesh | null,
    cubes: Uint32Array,
    pivot: { x: number; y: number; z: number },
    yaw: number,
    pitch: number,
    slotLookup: Uint32Array | null,
  ): void {
    if (!mesh || cubes.length === 0) return;
    for (let k = 0; k < cubes.length; k += 1) {
      const i = cubes[k];
      const x = this.position[i * 3];
      const mirror = x < 0 ? -1 : 1;

      // Rotate about the eye centre of this side. Yaw is mirrored so both eyes look the same
      // way in world space rather than converging or diverging.
      this.vector.set(x - pivot.x * mirror, this.position[i * 3 + 1] - pivot.y, this.position[i * 3 + 2] - pivot.z);
      this.axis.set(0, 1, 0);
      this.spin.setFromAxisAngle(this.axis, yaw);
      this.vector.applyQuaternion(this.spin);
      this.quaternion.copy(this.spin);
      this.axis.set(1, 0, 0);
      this.spin.setFromAxisAngle(this.axis, pitch);
      this.vector.applyQuaternion(this.spin);
      this.quaternion.premultiply(this.spin);
      this.vector.set(this.vector.x + pivot.x * mirror, this.vector.y + pivot.y, this.vector.z + pivot.z);

      this.spin.set(this.jitter[i * 4], this.jitter[i * 4 + 1], this.jitter[i * 4 + 2], this.jitter[i * 4 + 3]);
      this.quaternion.multiply(this.spin);

      const s = this.scale[i];
      this.scaleVector.set(s, s, s);
      this.matrix.compose(this.vector, this.quaternion, this.scaleVector);
      mesh.setMatrixAt(slotLookup ? indexOfSlot(slotLookup, i) : k, this.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private disposeMeshes(): void {
    for (const mesh of [this.animatedMesh, this.staticMesh, this.eyeMesh]) {
      if (!mesh) continue;
      this.object.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    }
    this.animatedMesh = null;
    this.staticMesh = null;
    this.eyeMesh = null;
  }
}

/**
 * Instance slot for a cube index. The metal lists are built in ascending cube order, so this is
 * a binary search rather than a scan — it runs once per lid cube per frame, which is a hundred
 * or so, but a linear scan of three thousand entries for each of them would not be free.
 */
function indexOfSlot(list: Uint32Array, cube: number): number {
  let low = 0;
  let high = list.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (list[mid] === cube) return mid;
    if (list[mid] < cube) low = mid + 1;
    else high = mid - 1;
  }
  return 0;
}

/** Reach the rig from its scene object, the way `findFormulaField` reaches a formula field. */
export function findVoxelFace(object: Object3D): AgentWorldVoxelFace | null {
  const visual = object.userData.graphysxAgentVisual;
  const face = object.userData.graphysxVoxelFace ??
    (visual instanceof Object3D ? visual.userData.graphysxVoxelFace : undefined);
  return face instanceof AgentWorldVoxelFace ? face : null;
}

/** Build the scene object for an appearance. The caller owns adding it and disposing it. */
export function createAppearanceObject(appearance: ResolvedAgentWorldAppearance): Group {
  return new AgentWorldVoxelFace(appearance).object;
}

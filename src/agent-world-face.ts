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
  buildScale,
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

/**
 * Regions darker than the base metal, so the orbits stay deep under a strong key light.
 *
 * `pupil` and `maw` are near-black on purpose. They are the two places where the mask has to
 * read as a *hole* — something the viewer looks into — and a hole that catches a highlight
 * stops being one.
 */
const REGION_SHADE: Record<string, number> = {
  socket: 0.55,
  brow: 0.84,
  jaw: 0.94,
  lid: 1.12,
  cheek: 1.1,
  eye: 0.42,
  pupil: 0.06,
  maw: 0.05,
};

/** Cube edge as a multiple of the grid step. See the note where it is used. */
const CUBE_OVERLAP = 1.05;

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

/** Life at rest: amplitudes are in gaze units (-1..1) and radians; all deliberately small. */
const IDLE = {
  /** Largest saccade, as a fraction of the gaze range. Fixations wander, they do not dart. */
  saccade: 0.16,
  fixationMin: 1.1,
  fixationSpread: 2.6,
  /** Slow drift under the fixations. */
  drift: 0.02,
  /** Peak yaw/pitch of the head's own sway, radians. About a degree. */
  headSway: 0.014,
  /** How much of the gaze angle the head takes over — the eyes lead. */
  headFollowsGaze: 0.18,
  /** A nod with each breath, radians. */
  breathNod: 0.004,
  doubleBlinkChance: 0.2,
};

const clamp = (value: number, min: number, max: number): number => (value < min ? min : value > max ? max : value);

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
  private ballCubes: Uint32Array = new Uint32Array(0);
  private irisCubes: Uint32Array = new Uint32Array(0);
  private lidCubes: Uint32Array = new Uint32Array(0);
  private lowerLidCubes: Uint32Array = new Uint32Array(0);
  private pupilCubes: Set<number> = new Set();
  /** The liner's cubes and their shrunk rest positions, so it can assemble with the shell. */
  private linerCubes: Uint32Array = new Uint32Array(0);
  private linerRest: Float32Array = new Float32Array(0);
  private mawCubes: Uint32Array = new Uint32Array(0);

  private animatedMesh: InstancedMesh | null = null;
  private staticMesh: InstancedMesh | null = null;
  private eyeMesh: InstancedMesh | null = null;
  private ballMesh: InstancedMesh | null = null;
  private mawMesh: InstancedMesh | null = null;
  /** A static, darker copy of the shell a few cubes inside it. See {@link buildLiner}. */
  private linerMesh: InstancedMesh | null = null;

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
  /** A second blink right after the first, occasionally — one blink in five reads as mechanical. */
  private doubleBlinkPending = false;
  /**
   * Life at rest. A face that only moves when driven reads as an object; eyes make small
   * involuntary jumps between fixations, and a head is never perfectly still. These are the
   * rig's own, added on top of whatever the host drives, and they shrink while the face is
   * busy speaking or thinking so they never fight an expression.
   */
  private idleClock = 0;
  private saccadeTimer = 1.4;
  private saccadeX = 0;
  private saccadeY = 0;
  private idleGazeX = 0;
  private idleGazeY = 0;

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
    this.advanceIdle(dt);
    current.gazeX = approach(current.gazeX, clamp(target.gazeX + this.idleGazeX, -1, 1), RESPONSE.gaze, dt);
    current.gazeY = approach(current.gazeY, clamp(target.gazeY + this.idleGazeY, -1, 1), RESPONSE.gaze, dt);
    current.attention = approach(current.attention, target.attention, RESPONSE.attention, dt);
    current.think = approach(current.think, target.think, RESPONSE.think, dt);
    current.warmth = approach(current.warmth, target.warmth, RESPONSE.warmth, dt);
    current.breath += dt * 0.9;

    // A head that listens leans. Applied to the rig's own group, so the host's anchor is
    // untouched: this is the mask's posture, not its placement. The yaw and pitch underneath
    // are the idle sway plus a fraction of the gaze — eyes lead, the head follows a little.
    const t = this.idleClock;
    const busy = Math.max(current.speak, current.think * 0.6);
    const sway = IDLE.headSway * (1 - 0.5 * busy);
    this.object.rotation.z = POSE_LIMITS.attentionTilt * current.attention + sway * 0.35 * Math.sin(t * 0.37 + 1.3);
    this.object.rotation.y = IDLE.headFollowsGaze * current.gazeX * POSE_LIMITS.gazeRadians + sway * (Math.sin(t * 0.23) * 0.6 + Math.sin(t * 0.71 + 0.8) * 0.4);
    this.object.rotation.x = -IDLE.headFollowsGaze * current.gazeY * POSE_LIMITS.gazeRadians * 0.6 + sway * 0.5 * Math.sin(t * 0.29 + 2.1) + IDLE.breathNod * Math.sin(current.breath);

    this.advanceBlink(dt);
    current.blink = approach(current.blink, Math.max(this.autoBlinkValue, target.blink), RESPONSE.blink, dt);

    // While the mask is still assembling, every cube's scale is moving, so every cube is posed.
    // Once it is whole, only the animated slice needs rewriting and the static mesh is left
    // exactly as it was written.
    const assembling = current.build < 1 || this.staticDirty;
    // Nothing inside the mask until the mask is whole: the liner appears only once the shell has
    // closed over it, so the entry shows cubes arriving on nothing, not on a ghost of the face
    // (owner: "l'inside peut apparaître après le visage construit au lieu d'avant").
    if (this.linerMesh) this.linerMesh.visible = current.build >= 1;
    const limit = assembling ? this.weights.count : this.weights.animatedCount;
    poseInto(this.weights, current, this.position, this.scale, limit);

    this.writeMesh(this.animatedMesh, this.metalAnimated);
    this.writeMesh(this.mawMesh, this.mawCubes);
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
    for (const mesh of [this.animatedMesh, this.staticMesh, this.eyeMesh, this.ballMesh, this.mawMesh, this.linerMesh]) {
      if (!mesh) continue;
      this.object.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    }
    this.animatedMesh = null;
    this.staticMesh = null;
    this.linerMesh = null;
    this.eyeMesh = null;
    this.ballMesh = null;
    this.mawMesh = null;
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
    // The eyeball is two meshes, not one. A single emissive material cannot hold a dark pupil:
    // `instanceColor` multiplies the diffuse colour and leaves emissive alone, so a pupil on the
    // iris material would still glow — which is exactly the lit disc this pass exists to fix.
    const ballCubes: number[] = [];
    const irisCubes: number[] = [];
    const lidCubes: number[] = [];
    const lowerLidCubes: number[] = [];
    const pupilCubes = new Set<number>();
    const mawCubes: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const name = regionNames[weights.region[i]];
      if (name === "iris") {
        irisCubes.push(i);
        continue;
      }
      if (name === "eye" || name === "pupil") {
        if (name === "pupil") pupilCubes.add(i);
        ballCubes.push(i);
        continue;
      }
      if (name === "maw" || name === "throat") {
        mawCubes.push(i);
        continue;
      }
      if (name === "lid") lidCubes.push(i);
      if (name === "lowerlid") lowerLidCubes.push(i);
      if (i < weights.animatedCount) metalAnimated.push(i);
      else metalStatic.push(i);
    }
    this.metalAnimated = Uint32Array.from(metalAnimated);
    this.metalStatic = Uint32Array.from(metalStatic);
    this.ballCubes = Uint32Array.from(ballCubes);
    this.irisCubes = Uint32Array.from(irisCubes);
    this.lidCubes = Uint32Array.from(lidCubes);
    this.lowerLidCubes = Uint32Array.from(lowerLidCubes);
    this.pupilCubes = pupilCubes;
    this.mawCubes = Uint32Array.from(mawCubes);

    // Cubes are drawn slightly larger than the grid step so neighbours interpenetrate. At
    // exactly one step they only *touch*, and the forge jitter below then rotates them apart:
    // a rotated cube no longer tiles — its faces pull away while its corners overlap — which
    // opened a lattice of lit seams across the cranium under a grazing key light. Overlap is
    // free (the cubes are opaque) and it is what makes the mask read as one solid mass.
    const edge = weights.level.cube * CUBE_OVERLAP;
    this.animatedMesh = this.createMesh("VoxelFaceAnimated", edge, this.metalAnimated.length, false);
    this.staticMesh = this.createMesh("VoxelFaceStatic", edge, this.metalStatic.length, false);
    this.ballMesh = this.createMesh("VoxelFaceEyeball", edge, this.ballCubes.length, false);
    // The mouth cavity gets its own matte black material rather than a dark tint on the metal.
    // A near-black albedo does not make a metal stop reflecting: at metalness 0.5 the cavity
    // still caught the copper rim light behind the mask and read as a bright bar across the
    // open mouth — the very artefact this cavity was added to remove. A hole has to be matte.
    this.mawMesh = this.createMaw("VoxelFaceMaw", edge, this.mawCubes.length);
    this.eyeMesh = this.createMesh("VoxelFaceIris", edge, this.irisCubes.length, true);
    this.linerMesh = this.buildLiner("VoxelFaceLiner", edge);

    this.writeColors();
    this.staticDirty = true;
    // Pose once immediately, so a face added to a scene is never a frame of cubes at the origin.
    poseInto(weights, this.current, this.position, this.scale, weights.count);
    this.writeMesh(this.animatedMesh, this.metalAnimated);
    this.writeMesh(this.staticMesh, this.metalStatic);
    this.writeMesh(this.mawMesh, this.mawCubes);
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

  /**
   * The liner: the metal shell copied once, shrunk toward the mask's centre, never animated.
   *
   * The mask is one cube thick, so any seam an expression opens — or a sampling gap the sculpt
   * left at a coarser level — showed the black inside of the head (owner review, 2026-09-13:
   * "on peut juste ajouter une couche derrière qui ne bouge pas et qui bloquera le trou au
   * pire"). Rather than proving every future pose seam-free, put a second, darker surface a
   * few cubes behind the first: a gap now shows the same grey metal, which is what a crease in
   * a solid mask looks like. One draw call, matrices written once per build, no shadow cast.
   */
  private buildLiner(name: string, edge: number): InstancedMesh {
    const { weights } = this;
    const cubes: number[] = [];
    const regionNames = asset.regions;
    const { mouth } = weights.anchors;
    for (let i = 0; i < weights.count; i += 1) {
      const region = regionNames[weights.region[i]];
      if (region === "iris" || region === "eye" || region === "pupil" || region === "maw" || region === "throat") continue;
      // Nothing behind the mouth: shrunk toward the centre, the lips and chin would land inside
      // the tunnel and plug the open mouth with grey (owner review, 2026-09-13).
      const sx = weights.rest[i * 3] * 0.9;
      const sy = weights.rest[i * 3 + 1] * 0.9;
      const sz = weights.rest[i * 3 + 2] * 0.9;
      if (Math.abs(sx) < mouth.halfWidth + 0.14 && Math.abs(sy - mouth.y) < 0.2 && sz > 0.05) continue;
      cubes.push(i);
    }
    const mesh = new InstancedMesh(
      new BoxGeometry(edge * 1.15, edge * 1.15, edge * 1.15),
      // The shell's own grey and finish (owner: a darker liner "fait louche"): a crease then reads
      // as more of the same metal, not as a different material showing through.
      new MeshStandardMaterial({ color: this.config.metalColor, roughness: 0.54, metalness: 0.5 }),
      Math.max(cubes.length, 1),
    );
    mesh.name = name;
    mesh.count = cubes.length;
    mesh.castShadow = false;
    mesh.userData.graphysxFaceCastShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    // Shrunk about the mask's origin: about three cubes inside the shell at the high level, and
    // proportionally at the coarser ones. Deep enough that the rows above a dropped brow still
    // cover it; shallow enough that the eyes' sockets stay hollow.
    const shrink = 0.9;
    this.linerCubes = Uint32Array.from(cubes);
    this.linerRest = new Float32Array(cubes.length * 3);
    for (let k = 0; k < cubes.length; k += 1) {
      const i = cubes[k];
      this.linerRest[k * 3] = weights.rest[i * 3] * shrink;
      this.linerRest[k * 3 + 1] = weights.rest[i * 3 + 1] * shrink;
      this.linerRest[k * 3 + 2] = weights.rest[i * 3 + 2] * shrink;
    }
    this.object.add(mesh);
    this.linerMesh = mesh;
    this.writeLiner(1);
    mesh.visible = this.current.build >= 1;
    return mesh;
  }

  /** The liner's matrices, written once. Its visibility is gated on assembly in update(). */
  private writeLiner(build: number): void {
    const mesh = this.linerMesh;
    if (!mesh) return;
    const { rise } = this.weights;
    for (let k = 0; k < this.linerCubes.length; k += 1) {
      const i = this.linerCubes[k];
      const s = buildScale(rise[i], build, i);
      this.vector.set(this.linerRest[k * 3], this.linerRest[k * 3 + 1], this.linerRest[k * 3 + 2]);
      this.quaternion.identity();
      this.scaleVector.set(s, s, s);
      this.matrix.compose(this.vector, this.quaternion, this.scaleVector);
      mesh.setMatrixAt(k, this.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private createMaw(name: string, edge: number, count: number): InstancedMesh {
    const mesh = new InstancedMesh(
      new BoxGeometry(edge, edge, edge),
      new MeshStandardMaterial({ color: "#07090c", roughness: 1, metalness: 0 }),
      Math.max(count, 1),
    );
    mesh.name = name;
    mesh.count = count;
    mesh.castShadow = false;
    mesh.userData.graphysxFaceCastShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    this.object.add(mesh);
    return mesh;
  }

  private writeColors(): void {
    const regionNames = asset.regions;
    const base = new Color(this.config.metalColor);
    for (const [mesh, list] of [
      [this.animatedMesh, this.metalAnimated],
      [this.staticMesh, this.metalStatic],
      [this.ballMesh, this.ballCubes],
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
  /**
   * Saccades and drift. Every second or three the eyes jump to a new small fixation and hold
   * it; between jumps they drift very slowly. Deterministic in the breath clock, so the same
   * face at the same moment looks the same on every machine.
   */
  private advanceIdle(dt: number): void {
    this.idleClock += dt;
    const busy = Math.max(this.current.speak, this.current.think * 0.6, this.target.build < 1 ? 1 : 0);
    const amplitude = IDLE.saccade * (1 - 0.7 * busy);
    this.saccadeTimer -= dt;
    if (this.saccadeTimer <= 0) {
      const seed = Math.floor(this.idleClock * 53);
      this.saccadeX = (hash01(seed) - 0.5) * 2 * amplitude;
      this.saccadeY = (hash01(seed + 1) - 0.5) * 2 * amplitude * 0.55;
      this.saccadeTimer = IDLE.fixationMin + hash01(seed + 2) * IDLE.fixationSpread;
    }
    // Snap to the fixation (eyes jump, they do not glide), then a slow drift on top.
    this.idleGazeX = approach(this.idleGazeX, this.saccadeX, 0.035, dt) + IDLE.drift * Math.sin(this.idleClock * 0.31);
    this.idleGazeY = approach(this.idleGazeY, this.saccadeY, 0.035, dt) + IDLE.drift * 0.6 * Math.sin(this.idleClock * 0.19 + 0.7);
  }

  private advanceBlink(dt: number): void {
    if (!this.config.autoBlink) {
      this.autoBlinkValue = 0;
      return;
    }
    if (this.blinkPhase > 0) {
      this.blinkPhase = Math.max(0, this.blinkPhase - dt / 0.13);
      // Down and back up over one blink, rather than a step.
      this.autoBlinkValue = Math.sin(this.blinkPhase * Math.PI);
      if (this.blinkPhase === 0) {
        const roll = hash01(Math.floor(this.current.breath * 97));
        if (this.doubleBlinkPending) {
          this.doubleBlinkPending = false;
          this.blinkTimer = 2.2 + roll * 4.5;
        } else if (roll < IDLE.doubleBlinkChance) {
          this.doubleBlinkPending = true;
          this.blinkTimer = 0.22;
        } else {
          this.blinkTimer = 2.2 + roll * 4.5;
        }
      }
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
      this.writeRotatedAbout(mesh, this.irisCubes, eye.pivot, eye.yaw, eye.pitch, null);
    }
    this.writeRotatedAbout(this.ballMesh, this.ballCubes, eye.pivot, eye.yaw, eye.pitch, null, eye.pupilScale);
    // Lids live in the metal mesh, so they are re-posed on top of what writeMesh just wrote.
    this.writeRotatedAbout(this.animatedMesh, this.lidCubes, eye.pivot, 0, eye.lidRadians, this.metalAnimated);
    this.writeRotatedAbout(this.animatedMesh, this.lowerLidCubes, eye.pivot, 0, eye.lowerLidRadians, this.metalAnimated);
  }

  private writeRotatedAbout(
    mesh: InstancedMesh | null,
    cubes: Uint32Array,
    pivot: { x: number; y: number; z: number },
    yaw: number,
    pitch: number,
    slotLookup: Uint32Array | null,
    pupilScale = 1,
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

      const s = this.scale[i] * (pupilScale !== 1 && this.pupilCubes.has(i) ? pupilScale : 1);
      this.scaleVector.set(s, s, s);
      this.matrix.compose(this.vector, this.quaternion, this.scaleVector);
      mesh.setMatrixAt(slotLookup ? indexOfSlot(slotLookup, i) : k, this.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private disposeMeshes(): void {
    for (const mesh of [this.animatedMesh, this.staticMesh, this.eyeMesh, this.ballMesh, this.mawMesh, this.linerMesh]) {
      if (!mesh) continue;
      this.object.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    }
    this.animatedMesh = null;
    this.staticMesh = null;
    this.linerMesh = null;
    this.eyeMesh = null;
    this.ballMesh = null;
    this.mawMesh = null;
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

/**
 * The Forge mask's expression model — pure maths, no Three.js, no DOM.
 *
 * This is the single source of truth for how conversation state becomes a moving face, and it
 * is deliberately separated from the renderer so that three consumers share exactly one
 * implementation: the runtime rig (`agent-world-face.ts`), the offline preview tool, and the
 * unit tests. A pose bug is then reproducible without a browser.
 *
 * ## The contract with the sculptor
 *
 * `tools/llmx-face-sculptor.mjs` writes positions and region tags; the anchors it used travel in
 * the same file. {@link deriveWeights} reads those anchors, so a re-sculpt that moves the mouth
 * moves the mouth's animation with it. Nothing here re-derives the sculpt.
 *
 * ## Two honest limits, stated once
 *
 * - **`speak` is amplitude, not phonemes.** It is driven by the energy of the audio actually
 *   playing on this device. It produces a mouth that opens and closes with the voice; it does
 *   not claim to form the sounds. Visemes are a later enrichment, not a rename of this field.
 * - **`think` is a transport signal, not an emotion.** It moves when the conversation reports
 *   waiting or generating. It must never be fed from GPU load: another job on a shared host is
 *   not this conversation thinking, and a face that frowns at someone else's batch is lying.
 */

/** What the face is being asked to express. Every field is bounded; see {@link clampDrivers}. */
export type FaceDrivers = {
  /** Assembly progress, 0 (nothing) to 1 (whole mask present). Drives the entry choreography. */
  build: number;
  /** Mouth opening from the amplitude of the audio being played, 0 to 1. */
  speak: number;
  /**
   * Spectral tilt of that same audio, 0 (dark, rounded lips) to 1 (bright, spread lips). A
   * stylisation that tracks the voice's brightness, not a phoneme classifier.
   */
  speakTone: number;
  /** Lid closure, 0 (open) to 1 (shut). The blink scheduler lives in the rig, not here. */
  blink: number;
  /** Gaze, -1 to 1 on each axis, in the mask's own frame. */
  gazeX: number;
  gazeY: number;
  /** Alertness: brow lift and lid raise. Rises when the human is speaking or has just spoken. */
  attention: number;
  /** Waiting on the engine, 0 to 1. See the note above about what this may not be fed from. */
  think: number;
  /** Warmth, -1 (severe) to 1 (a discreet smile). */
  warmth: number;
  /** Idle breathing phase in radians, advanced by the rig's clock. */
  breath: number;
};

export const NEUTRAL_DRIVERS: Readonly<FaceDrivers> = Object.freeze({
  build: 1,
  speak: 0,
  speakTone: 0.5,
  blink: 0,
  gazeX: 0,
  gazeY: 0,
  attention: 0.25,
  think: 0,
  warmth: 0,
  breath: 0,
});

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? (value < min ? min : value > max ? max : value) : min;

const clamp01 = (value: number): number => clamp(value, 0, 1);

/** Smoothstep; the ramp used everywhere a weight fades in over a band. */
const smoothstep = (edge0: number, edge1: number, x: number): number => {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Bound every driver before it can reach the geometry. Non-finite input becomes the minimum. */
export function clampDrivers(drivers: Partial<FaceDrivers>): FaceDrivers {
  return {
    build: clamp01(drivers.build ?? NEUTRAL_DRIVERS.build),
    speak: clamp01(drivers.speak ?? NEUTRAL_DRIVERS.speak),
    speakTone: clamp01(drivers.speakTone ?? NEUTRAL_DRIVERS.speakTone),
    blink: clamp01(drivers.blink ?? NEUTRAL_DRIVERS.blink),
    gazeX: clamp(drivers.gazeX ?? 0, -1, 1),
    gazeY: clamp(drivers.gazeY ?? 0, -1, 1),
    attention: clamp01(drivers.attention ?? NEUTRAL_DRIVERS.attention),
    think: clamp01(drivers.think ?? NEUTRAL_DRIVERS.think),
    warmth: clamp(drivers.warmth ?? 0, -1, 1),
    breath: Number.isFinite(drivers.breath) ? (drivers.breath as number) : 0,
  };
}

// ---------------------------------------------------------------------------
// Asset shape. Structurally typed so the JSON import and a test fixture both fit.
// ---------------------------------------------------------------------------

export type FaceAnchors = {
  height: number;
  eye: { x: number; y: number; z: number; radius: number };
  brow: { x: number; y: number; z: number };
  cheek: { x: number; y: number; z: number };
  mouth: { y: number; z: number; halfWidth: number };
  jawHinge: { y: number; z: number };
  chin: { y: number };
};

export type FaceLevel = {
  name: string;
  cube: number;
  grid: [number, number, number] | number[];
  /**
   * Grid origin, per level rather than per asset: the X axis is centred on the mask's symmetry
   * plane at `-(nx * cube) / 2`, and `nx` differs between levels.
   */
  origin: [number, number, number] | number[];
  count: number;
  animatedCount: number;
  indices: number[];
  regions: number[];
};

export type FaceAsset = {
  format: string;
  version: number;
  regions: string[];
  anchors: FaceAnchors;
  levels: FaceLevel[];
};

export const SUPPORTED_FACE_VERSION = 1;
export const FACE_FORMAT = "graphysx.llmx-voxel-face";

/**
 * Rest positions and per-cube influence weights for one level of detail.
 *
 * Flat typed arrays rather than an array of objects: this is walked once per frame for a few
 * thousand cubes, and the object-per-cube version allocates a cache miss per lookup.
 */
export type FaceWeights = {
  level: FaceLevel;
  anchors: FaceAnchors;
  count: number;
  animatedCount: number;
  /** Rest position, 3 floats per cube. */
  rest: Float32Array;
  /** Region id per cube, indexing {@link FaceAsset.regions}. */
  region: Uint8Array;
  /** Which side of the mask a cube is on: -1 left, +1 right, 0 centre. Used for travelling waves. */
  side: Int8Array;
  jaw: Float32Array;
  lip: Float32Array;
  brow: Float32Array;
  cheek: Float32Array;
  /** Height normalised over the mask's own extent, 0 at the chin and 1 at the crown. */
  rise: Float32Array;
  /** Bounding box of the rest pose: [minX, minY, minZ, maxX, maxY, maxZ]. */
  bounds: Float32Array;
};

export class FaceAssetError extends Error {}

/** Reject an asset this build cannot animate, rather than rendering a silently wrong face. */
export function assertSupportedFace(asset: FaceAsset): void {
  if (asset?.format !== FACE_FORMAT) {
    throw new FaceAssetError(`Unsupported face format: ${String(asset?.format)}`);
  }
  if (asset.version !== SUPPORTED_FACE_VERSION) {
    throw new FaceAssetError(
      `Face data version ${String(asset.version)} is not supported by this build (expects ${SUPPORTED_FACE_VERSION})`,
    );
  }
  if (!Array.isArray(asset.levels) || asset.levels.length === 0) {
    throw new FaceAssetError("Face data carries no levels of detail");
  }
}

/**
 * Unpack one level and derive its animation weights.
 *
 * This is the "at load" half of the split documented in the sculptor: a few thousand cheap
 * operations, no surface evaluation. Deriving rather than storing the weights keeps the asset
 * small and — more importantly — keeps them consistent with the anchors by construction.
 */
export function deriveWeights(asset: FaceAsset, levelName: string): FaceWeights {
  assertSupportedFace(asset);
  const level = asset.levels.find((entry) => entry.name === levelName);
  if (!level) {
    throw new FaceAssetError(`Unknown face level: ${levelName}. Have ${asset.levels.map((l) => l.name).join(", ")}`);
  }

  const { anchors, regions } = asset;
  const [nx, ny] = level.grid;
  const [ox, oy, oz] = level.origin;
  const { cube } = level;
  const count = level.indices.length;

  const rest = new Float32Array(count * 3);
  const region = new Uint8Array(count);
  const side = new Int8Array(count);
  const jaw = new Float32Array(count);
  const lip = new Float32Array(count);
  const brow = new Float32Array(count);
  const cheek = new Float32Array(count);
  const rise = new Float32Array(count);

  const jawIndex = regions.indexOf("jaw");
  const lipIndex = regions.indexOf("lip");
  const browIndex = regions.indexOf("brow");
  const cheekIndex = regions.indexOf("cheek");

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < count; i += 1) {
    const index = level.indices[i];
    const ix = index % nx;
    const iy = Math.floor(index / nx) % ny;
    const iz = Math.floor(index / (nx * ny));
    const x = ox + (ix + 0.5) * cube;
    const y = oy + (iy + 0.5) * cube;
    const z = oz + (iz + 0.5) * cube;

    rest[i * 3] = x;
    rest[i * 3 + 1] = y;
    rest[i * 3 + 2] = z;
    region[i] = level.regions[i];
    side[i] = x > cube * 0.5 ? 1 : x < -cube * 0.5 ? -1 : 0;

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;

    // The jaw swings as a mass about its hinge, so its weight is a height ramp, not a blob:
    // nothing above the hinge moves, and the chin moves fully.
    jaw[i] =
      region[i] === jawIndex || region[i] === lipIndex
        ? smoothstep(anchors.jawHinge.y, anchors.chin.y * 0.62, y)
        : 0;

    // Lips are shaped by proximity to the mouth centre, so the corners trail the middle.
    const lipFall = Math.hypot((y - anchors.mouth.y) / 0.16, x / (anchors.mouth.halfWidth + 0.12));
    lip[i] = region[i] === lipIndex ? clamp01(1 - lipFall) : 0;

    const browFall = Math.hypot((y - anchors.brow.y) / 0.2, (Math.abs(x) - anchors.brow.x) / 0.34);
    brow[i] = region[i] === browIndex ? clamp01(1 - browFall * 0.72) : 0;

    const cheekFall = Math.hypot(
      (Math.abs(x) - anchors.cheek.x) / 0.26,
      (y - anchors.cheek.y) / 0.24,
      (z - anchors.cheek.z) / 0.3,
    );
    cheek[i] = region[i] === cheekIndex ? clamp01(1 - cheekFall) : 0;
  }

  const span = maxY - minY || 1;
  for (let i = 0; i < count; i += 1) rise[i] = (rest[i * 3 + 1] - minY) / span;

  return {
    level,
    anchors,
    count,
    animatedCount: Math.min(level.animatedCount ?? count, count),
    rest,
    region,
    side,
    jaw,
    lip,
    brow,
    cheek,
    rise,
    bounds: new Float32Array([minX, minY, minZ, maxX, maxY, maxZ]),
  };
}

// ---------------------------------------------------------------------------
// Posing.
// ---------------------------------------------------------------------------

/** Bounds on every authored movement, in metres or radians. Nothing here is a free parameter. */
export const POSE_LIMITS = Object.freeze({
  /** Jaw opening at speak = 1. Beyond roughly this the mask dislocates rather than speaks. */
  jawRadians: 0.26,
  lipSpread: 0.035,
  lipPurse: 0.03,
  browLift: 0.045,
  browThinkWave: 0.014,
  cheekLift: 0.022,
  gazeRadians: 0.34,
  breathAmplitude: 0.006,
});


/**
 * Write the posed transform of the first `limit` cubes in `weights` into the output arrays.
 *
 * `outPosition` takes 3 floats per cube and `outScale` one. The caller owns the arrays and their
 * lifetime — this function allocates nothing, which is the point: it runs inside the host's
 * frame loop over a few thousand cubes.
 *
 * `limit` is how the animated/static split is spent. During assembly the rig poses all
 * `weights.count` cubes, because `build` scales every one of them; once the mask is whole it
 * poses only `weights.animatedCount`, and the static remainder keeps the matrices it was
 * written once. Emissive is not per-cube — see {@link eyeTransform}.
 *
 * Returns the number of cubes written.
 */
export function poseInto(
  weights: FaceWeights,
  input: Partial<FaceDrivers>,
  outPosition: Float32Array,
  outScale: Float32Array,
  limit = weights.count,
): number {
  const d = clampDrivers(input);
  const { anchors, rest, side, jaw, lip, brow, cheek, rise } = weights;
  const count = Math.min(limit, weights.count);

  // Eyes and lids are deliberately absent from this loop: both are rigid bodies turning about
  // the eye centre, so the rig applies one {@link eyeTransform} per side instead of paying for
  // a per-cube branch here.
  // Positive opens. The hinge sits behind and above the chin, so this rotation drops the lips
  // and swings the chin down and *back* — which is what a jaw does. An earlier negative angle
  // lifted the chin into the mouth instead; the lip-separation test below is what caught it.
  const jawAngle = POSE_LIMITS.jawRadians * d.speak;
  const cosJaw = Math.cos(jawAngle);
  const sinJaw = Math.sin(jawAngle);
  const hingeY = anchors.jawHinge.y;
  const hingeZ = anchors.jawHinge.z;

  // A rounded mouth pulls the lips in and forward; a bright one spreads them. speakTone 0.5 is
  // neutral, so silence never biases the shape.
  const tone = (d.speakTone - 0.5) * 2;
  const spread = POSE_LIMITS.lipSpread * tone * d.speak;
  const purse = POSE_LIMITS.lipPurse * -tone * d.speak;

  const browTarget = POSE_LIMITS.browLift * (d.attention * 0.7 + Math.max(0, d.warmth) * 0.3);
  const cheekTarget = POSE_LIMITS.cheekLift * Math.max(0, d.warmth);
  const breathOffset = POSE_LIMITS.breathAmplitude * Math.sin(d.breath);

  for (let i = 0; i < count; i += 1) {
    const x = rest[i * 3];
    const y = rest[i * 3 + 1];
    const z = rest[i * 3 + 2];
    let px = x;
    let py = y;
    let pz = z;

    // Jaw: a rigid rotation about the hinge, weighted so the hinge itself does not move.
    const jw = jaw[i];
    if (jw > 0) {
      const dy = y - hingeY;
      const dz = z - hingeZ;
      const ry = hingeY + dy * cosJaw - dz * sinJaw;
      const rz = hingeZ + dy * sinJaw + dz * cosJaw;
      py += (ry - y) * jw;
      pz += (rz - z) * jw;
    }

    const lw = lip[i];
    if (lw > 0) {
      px += spread * lw * (x >= 0 ? 1 : -1);
      pz += purse * lw;
    }

    const bw = brow[i];
    if (bw > 0) {
      py += browTarget * bw;
      // A slow wave crossing the brow while the engine is busy. Travelling rather than
      // pulsing, so it reads as activity instead of a heartbeat.
      py += POSE_LIMITS.browThinkWave * d.think * Math.sin(d.breath * 1.7 + side[i] * 1.2 + x * 4.5) * bw;
    }

    const cw = cheek[i];
    if (cw > 0) {
      py += cheekTarget * cw;
      pz += cheekTarget * 0.45 * cw;
    }

    // The whole mask breathes, very slightly, so a listening face is never frozen.
    py += breathOffset * (0.35 + 0.65 * rise[i]);

    outPosition[i * 3] = px;
    outPosition[i * 3 + 1] = py;
    outPosition[i * 3 + 2] = pz;
    outScale[i] = buildScale(rise[i], d.build, i);
  }
  return count;
}

/**
 * Assembly: a cube is absent until the build front reaches its height, then eases in.
 *
 * The front is widened past 1 so the last row still has a ramp to travel, and the per-cube
 * offset is a hash of the index rather than a random number — the same mask assembles the same
 * way every entry, which is what makes the choreography rehearsable and testable.
 */
export function buildScale(rise: number, build: number, index: number): number {
  if (build >= 1) return 1;
  if (build <= 0) return 0;
  const jitter = hash01(index) * 0.12;
  const front = build * 1.35 - 0.18;
  const t = smoothstep(rise + jitter - 0.1, rise + jitter + 0.06, front);
  // A small overshoot on arrival, so cubes land rather than fade in.
  return t < 1 ? t * (1 + 0.25 * Math.sin(t * Math.PI)) : 1;
}

/** Deterministic per-index value in [0, 1). A cheap integer hash, not a PRNG. */
export function hash01(index: number): number {
  let h = (index + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Eye and lid transform, computed once per frame rather than per cube: both are rigid bodies
 * turning about the eye centre, so the rig applies one rotation to each side's cubes.
 */
export function eyeTransform(anchors: FaceAnchors, input: Partial<FaceDrivers>): {
  /** Rotation centre for the right eye; mirror x for the left. The rig needs it with the angles. */
  pivot: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  lidRadians: number;
  glow: number;
} {
  const d = clampDrivers(input);
  return {
    pivot: { x: anchors.eye.x, y: anchors.eye.y, z: anchors.eye.z },
    yaw: d.gazeX * POSE_LIMITS.gazeRadians,
    pitch: d.gazeY * POSE_LIMITS.gazeRadians * 0.6,
    // Attention holds the lid a little higher; a blink always reaches full closure.
    lidRadians: (d.blink - 0.12 * d.attention) * 1.55,
    // The eyes carry the only emissive on the mask, so this is where presence is read from.
    glow: clamp(0.45 + 0.4 * d.attention + 0.3 * d.speak - 0.5 * d.blink, 0, 1.4),
  };
}

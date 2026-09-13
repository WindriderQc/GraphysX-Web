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
   * Grid origin, per level rather than per asset. X is 0: the X axis is centred on the mask's
   * symmetry plane and cube centres are `(ix - (nx - 1) / 2) * cube`, which is exactly
   * antisymmetric in floating point. Y and Z are ordinary `origin + (i + 0.5) * cube` bounds.
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
  /** Which regions an expression can move. Authoritative; consumers must not restate it. */
  animatedRegions: string[];
  anchors: FaceAnchors;
  levels: FaceLevel[];
};

export const SUPPORTED_FACE_VERSION = 2;
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
  const mawIndex = regions.indexOf("maw");
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
    // Exactly antisymmetric about the mask's centre plane — see the note in the sculptor. This
    // expression must stay bit-identical to the one that authored the grid.
    const x = ox + (ix - (nx - 1) / 2) * cube;
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
    //
    // The upper lip is the exception, and it was a real modelling error: it belongs to the
    // skull, not the mandible. Ramping it from the hinge like everything else meant the jaw
    // dragged *both* lips down together — so the mouth stayed shut no matter how far the jaw
    // opened, while the chin swung visibly. Lip cubes above the mouth line are held still; below
    // it they ramp from the mouth line rather than the hinge, so the lower lip leads.
    //
    // The same holds for the jaw region itself. Its ramp used to start at the hinge, a quarter
    // of a metre *above* the mouth — which put the upper-lip area and the roof of the mouth
    // tunnel on the mandible. Anatomically the mandible's body starts at the teeth; everything
    // in front and above that line is skull. So the ramp starts just above the mouth line.
    if (region[i] === jawIndex) {
      jaw[i] = smoothstep(anchors.mouth.y + 0.04, anchors.chin.y * 0.62, y);
    } else if (region[i] === lipIndex) {
      jaw[i] = y >= anchors.mouth.y ? 0 : smoothstep(anchors.mouth.y, anchors.chin.y * 0.62, y);
    } else {
      jaw[i] = 0;
    }

    /*
     * Lip influence is a smooth field around the mouth, not a region flag.
     *
     * Keying it to `region === lip` made the lip band translate as a rigid plate while its
     * neighbours stayed put, and at a 0.17 m opening that tore a gap around the whole mouth —
     * you could see the lit inside of the shell through the seam. Faces deform; they do not
     * separate into plates. Taking the weight from distance instead lets the motion fall off
     * into the jaw, cheeks and nose over a few cubes, so the mouth area stretches.
     *
     * The cavity behind the mouth is excluded: it has to stay where it is while the lips part
     * around it, or the hole travels with the lips and there is nothing to see into.
     */
    const lipFall = Math.hypot(
      (y - anchors.mouth.y) / 0.22,
      x / (anchors.mouth.halfWidth + 0.2),
      (z - anchors.mouth.z) / 0.34,
    );
    lip[i] = region[i] === mawIndex ? 0 : clamp01(1 - lipFall);

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
  // Clamped: the lowest cube can land a few parts in 10^8 below minY through float rounding,
  // and `rise` is a documented 0..1 that `buildScale` reads as a height fraction.
  for (let i = 0; i < count; i += 1) rise[i] = clamp01((rest[i * 3 + 1] - minY) / span);

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
  /**
   * Jaw opening at speak = 1, in radians.
   *
   * This number has been wrong in both directions. At 0.26 the whole lower mask swung and read
   * as a hinged puppet jaw; dropping it to 0.17 then made speech almost invisible at
   * conversation distance. Amplitude was never the real variable — **distribution** was. The
   * lips now lead the opening through {@link POSE_LIMITS.lipPart}, and the jaw only carries the
   * mass behind them, so the mouth can open visibly without the face dislocating.
   */
  jawRadians: 0.14,
  /**
   * Lower-lip drop at speak = 1, in metres, before the per-cube lip weight.
   *
   * **A jaw rotation alone cannot open this mouth**, and the arithmetic says why. The lower lip
   * sits 0.34 m below the hinge, so even a generous 0.26 rad moves it 0.34 · sin(0.26) = 0.088 m
   * — under two cubes at the high density, and at a normal speech level less than one. The
   * mouth stayed shut while the chin swung, which is exactly what it looked like: a face that
   * moves all over while its mouth does nothing.
   *
   * So the opening is a translation of the lips, and the jaw merely follows. This value is
   * comparable to the aperture's own height on purpose: a mouth reads as open when you can see
   * into it. The per-cube lip weight falls off toward the corners, so the centre opens and the
   * corners stay — which is what makes it a mouth rather than a hatch.
   */
  lipPart: 0.26,
  /** The upper lip barely moves; a mouth opens downward. */
  lipPartUpperShare: 0.26,
  /**
   * How much a cube grows where the mouth is stretching, as a fraction of its edge.
   *
   * The mask is a shell one cube thick, and a shell cannot stretch: moving the lips 0.17 m apart
   * pulls neighbouring cubes further apart than they overlap, and the gaps show the lit inside
   * as a speckle across the lower face. Growing the cubes in proportion to how hard that part of
   * the face is being pulled closes the gaps exactly where they open, for the cost of one
   * multiply. It is invisible — a cube 40% larger among cubes of the same colour reads as the
   * same surface, where a hole through it does not.
   */
  stretchFill: 0.42,
  /** Exponent on `speak` before it drives the mouth. Below one; see the note where it is used. */
  mouthResponse: 0.6,
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
  /*
   * The mouth's own response curve.
   *
   * `speak` is the energy of played audio, and a real voice spends almost all of its time
   * between 0.2 and 0.7 — it reaches 1 on a shout, not on a sentence. Driving the opening
   * linearly therefore wastes most of the authored range on amplitudes that never occur, and the
   * mouth reads as barely moving while the meter says it is working. Raising to a power below
   * one puts the visible travel where speech actually lives: 0.3 opens to 49%, 0.5 to 66%.
   */
  const mouth = Math.pow(d.speak, POSE_LIMITS.mouthResponse);

  // Positive opens. The hinge sits behind and above the chin, so this rotation drops the lips
  // and swings the chin down and *back* — which is what a jaw does. An earlier negative angle
  // lifted the chin into the mouth instead; the lip-separation test below is what caught it.
  const jawAngle = POSE_LIMITS.jawRadians * mouth;
  const cosJaw = Math.cos(jawAngle);
  const sinJaw = Math.sin(jawAngle);
  const hingeY = anchors.jawHinge.y;
  const hingeZ = anchors.jawHinge.z;

  // A rounded mouth pulls the lips in and forward; a bright one spreads them. speakTone 0.5 is
  // neutral, so silence never biases the shape.
  const tone = (d.speakTone - 0.5) * 2;
  const spread = POSE_LIMITS.lipSpread * tone * mouth;
  const purse = POSE_LIMITS.lipPurse * -tone * mouth;

  const browTarget = POSE_LIMITS.browLift * (d.attention * 0.7 + Math.max(0, d.warmth) * 0.3);
  const cheekTarget = POSE_LIMITS.cheekLift * Math.max(0, d.warmth);
  const breathOffset = POSE_LIMITS.breathAmplitude * Math.sin(d.breath);
  // Where the lips stop parting: just past the authored half-width, so the corners hold.
  const cornerReach = anchors.mouth.halfWidth * 1.08;

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
      // Part the lips directly, on top of whatever the jaw is doing. Signed by which side of
      // the mouth line the cube rests on, and asymmetric because a mouth opens downward.
      //
      // The parting fades to nothing at the commissures. A mouth opens in the middle and stays
      // joined at its corners; the general lip field is still 40% strong out there, and letting
      // it flip sign across the mouth line at the corners tore them apart vertically — isolated
      // cubes floating beside the aperture, and a lower lip that dropped as one wide block like
      // a nutcracker's jaw. Closing the corners is what turns that block into a mouth.
      const upper = y >= anchors.mouth.y;
      const corner = clamp01(1 - (x * x) / (cornerReach * cornerReach));
      py += (upper ? POSE_LIMITS.lipPart * POSE_LIMITS.lipPartUpperShare : -POSE_LIMITS.lipPart) * lw * mouth * corner;
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
    // Grow the cube where the surface is being pulled apart. See POSE_LIMITS.stretchFill.
    const stretch = lw > 0 ? 1 + POSE_LIMITS.stretchFill * mouth * clamp01(lw * 2.5) : 1;
    outScale[i] = buildScale(rise[i], d.build, i) * stretch;
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
    // Both angles are rotations the rig applies about +Y and +X respectively. About +X, a
    // positive angle sends the front of the eye *down* — (0, 0, z) goes to (0, −z·sinθ, z·cosθ)
    // — so an upward gaze (gazeY > 0) is a negative pitch. This shipped without the sign and
    // the eyes tracked the camera upside down; the test below pins the convention.
    pitch: -d.gazeY * POSE_LIMITS.gazeRadians * 0.6,
    // Attention holds the lid a little higher; a blink always reaches full closure.
    lidRadians: (d.blink - 0.12 * d.attention) * 1.55,
    /*
     * The eyes carry the only emissive on the mask, which makes them the brightest thing in a
     * dark room — and therefore the signal a viewer reads first. An earlier `+ 0.3 * speak` made
     * them pulse on every syllable, and at conversation distance that read as "the whole face is
     * speaking" while the mouth itself looked static. Speech must not drive the eyes: it belongs
     * to the mouth. What is left is a trace, so the eyes are not frozen while the agent talks.
     */
    glow: clamp(0.45 + 0.4 * d.attention + 0.05 * d.speak - 0.5 * d.blink, 0, 1.4),
  };
}

// ---------------------------------------------------------------------------
// Appearance — the face's serialisable identity, kept here rather than with the
// renderer so that `node --test` can reach it. GraphysX's convention is that a
// module the fast test tier imports may only take *type* imports from other
// `.ts` files; the renderer takes Three.js at runtime and therefore cannot be
// one. Config is data, so it belongs on this side of that line anyway.
// ---------------------------------------------------------------------------

export type AgentWorldFaceLevel = "high" | "balanced" | "mobile";

export type AgentWorldFace = {
  /** Which sculpted mask. One is shipped; the field exists so a second cannot be a silent swap. */
  asset?: string;
  level?: AgentWorldFaceLevel;
  /** Base metal of the mask. */
  metalColor?: string;
  /** Accent on the temple fins. Copper is an accent — see the palette note in the renderer. */
  copperColor?: string;
  /** Emissive of the eyes. */
  eyeColor?: string;
  /** Warm tint on the lips, so the mouth reads without becoming a bright bar. */
  lipColor?: string;
  /** Seed for the per-cube forge jitter. Deterministic: the same seed is the same mask. */
  seed?: number;
  /** Blink on its own schedule. A host that drives blink explicitly still wins. */
  autoBlink?: boolean;
};

export type ResolvedAgentWorldFace = Required<AgentWorldFace>;

/**
 * The Nocturnal Forge palette. Charcoal metal, patinated copper on the fins only, cold cyan in
 * the eyes. The one rule worth writing down: copper is an accent. Giving the lips the same
 * copper as the fins grew a bright horizontal bar across the mask that read as a grille rather
 * than a mouth — the mouth has to read by its shadow and its aperture, which is what makes it
 * look like it can open.
 */
const BASE_FACE: ResolvedAgentWorldFace = {
  asset: "forge-mask",
  level: "high",
  metalColor: "#4c525e",
  copperColor: "#a06a3e",
  eyeColor: "#60d6e8",
  lipColor: "#423c3a",
  seed: 1,
  autoBlink: true,
};

export function resolveAgentWorldFace(source: AgentWorldFace | undefined): ResolvedAgentWorldFace {
  const base = BASE_FACE;
  if (!source) return { ...base };
  const level = source.level;
  return {
    asset: source.asset ?? base.asset,
    level: level === "balanced" || level === "mobile" || level === "high" ? level : base.level,
    metalColor: source.metalColor ?? base.metalColor,
    copperColor: source.copperColor ?? base.copperColor,
    eyeColor: source.eyeColor ?? base.eyeColor,
    lipColor: source.lipColor ?? base.lipColor,
    seed: Number.isFinite(source.seed) ? (source.seed as number) : base.seed,
    autoBlink: source.autoBlink ?? base.autoBlink,
  };
}

/**
 * How an `agent` entity chooses to look.
 *
 * A discriminated union with one member today. It is a union rather than a bare face config
 * because the alternative — "an agent with a `face` block is a voxel face" — makes the second
 * appearance a breaking change to the first. `kind` costs one string in the document and keeps
 * that door open.
 *
 * Changing an agent's appearance changes nothing about the agent: not its role, not its
 * capabilities, not what it is allowed to do. This is presentation.
 */
export type AgentWorldAppearance = { kind: "voxel-face" } & AgentWorldFace;

export type ResolvedAgentWorldAppearance = { kind: "voxel-face" } & ResolvedAgentWorldFace;

/** Appearance kinds this build can render. */
export const AGENT_WORLD_APPEARANCE_KINDS = ["voxel-face"] as const;

/**
 * Resolve an appearance from a document.
 *
 * An unknown `kind` throws rather than falling back to the default avatar. A scene written by a
 * newer build has to report an explicit incompatibility: silently replacing someone's mask with
 * a capsule and then *saving that back* is how a world loses its face permanently.
 */
export function resolveAgentWorldAppearance(source: AgentWorldAppearance): ResolvedAgentWorldAppearance {
  const kind = source?.kind;
  if (kind !== "voxel-face") {
    throw new Error(
      `Unsupported agent appearance: ${String(kind)}. This build renders ${AGENT_WORLD_APPEARANCE_KINDS.join(", ")}.`,
    );
  }
  return { kind, ...resolveAgentWorldFace(source) };
}

/**
 * Serialise a resolved appearance back into the document.
 *
 * Fully specified rather than diffed against the defaults, exactly as `formula` does it: a
 * default that later changes value must not silently restyle every mask already saved.
 */
export function serializeAgentWorldAppearance(appearance: ResolvedAgentWorldAppearance): AgentWorldAppearance {
  return { ...appearance };
}

/**
 * The coarser of what the world asked for and what the device allows.
 *
 * Pure and here rather than in the renderer because the direction of this comparison is exactly
 * the kind of thing that silently inverts: getting it backwards would render a phone's world at
 * desktop density and look like a performance problem rather than a logic error. `null` means
 * no cap.
 */
export function effectiveFaceLevel(
  authored: AgentWorldFaceLevel,
  ceiling: AgentWorldFaceLevel | null,
): AgentWorldFaceLevel {
  const order: AgentWorldFaceLevel[] = ["mobile", "balanced", "high"];
  const wanted = order.indexOf(authored);
  if (wanted < 0) return ceiling ?? "high";
  const capped = ceiling ? order.indexOf(ceiling) : order.length - 1;
  return order[Math.min(wanted, capped < 0 ? order.length - 1 : capped)];
}

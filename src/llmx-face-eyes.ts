/**
 * What makes the mask's eyes read as eyes rather than as two lit slots.
 *
 * Until now the iris was one flat emissive cyan: bright, uniform, and cut off by the upper lid,
 * so at conversation distance it read as a glowing band. Three things that a real eye always has
 * and the mask did not:
 *
 * - a **limbal ring**: the iris is darkest at its outer edge and brightest around the pupil. That
 *   gradient is what gives an iris its depth and makes the eye look round instead of painted on;
 * - the **upper lid's shadow**: the lid overhangs the eye and darkens the top of the iris, which
 *   seats the eyeball *under* the lid instead of in front of it;
 * - a **catchlight**: one bright cube where the light reflects off the cornea. It stays put
 *   relative to the light while the eye turns, and that is what makes an eye look wet and alive.
 *
 * All three are per-instance multipliers on the iris's emissive (see the material patch in the
 * rig), computed here as pure functions over the eye's local frame so they are unit tested
 * without a GPU. Nothing here moves a cube: shape, gaze and blink are unchanged.
 */

/** A point in one eye's local frame: origin at the eye centre, +z out of the face, metres. */
export type EyeLocal = Readonly<{ x: number; y: number; z: number }>;

export const EYE_LOOK = Object.freeze({
  /** Iris brightness next to the pupil, and at its outer edge before the limbal ring. */
  innerTone: 1.35,
  outerTone: 0.8,
  /** Fraction of the iris width (from the pupil out) where the limbal ring starts darkening. */
  limbalStart: 0.68,
  /** How dark the ring gets at the very edge, as a fraction of the outer tone. */
  limbalDepth: 0.62,
  /** Radial streaks: brightness spread between sectors of the iris. */
  streakSpread: 0.22,
  streakSectors: 14,
  /** Darkening of the iris right under the upper lid's edge, and how far down it reaches (cubes). */
  lidShadow: 0.7,
  lidShadowReach: 2.6,
  /** Direction toward the light the catchlight reflects, in the mask's frame (screen upper left). */
  catchlightFrom: Object.freeze([-0.42, 0.52, 1] as const),
  /**
   * Catchlight colour multiplier on the iris's cyan emissive: drives it to white, and bright
   * enough to read at dock size — it is scaled by the iris's glow, which sits near 0.5 at rest,
   * and a glint only a little whiter than the cyan around it was invisible there.
   */
  catchlight: Object.freeze([6.4, 2.8, 2.5] as const),
  /** Below this many iris cubes per eye the iris is too coarse for a gradient or a glint. */
  minIrisCubes: 20,
});

/** The iris's inner and outer radius as fractions of the eyeball radius (sculptor `eyePart`). */
const PUPIL_EDGE = 0.3;
const IRIS_EDGE = 0.66;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hash01 = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Static tone of one iris cube: the radial gradient, the limbal ring and the streaks.
 *
 * @param contrast 0..1 — how much of the look a level can carry. A coarse iris of a handful of
 *   cubes has no inside or edge to shade, so it keeps its flat tone.
 */
export function irisTone(local: EyeLocal, radius: number, contrast = 1): number {
  const off = Math.hypot(local.x, local.y) / radius;
  const t = clamp01((off - PUPIL_EDGE) / (IRIS_EDGE - PUPIL_EDGE));
  let tone = EYE_LOOK.innerTone + (EYE_LOOK.outerTone - EYE_LOOK.innerTone) * t;
  tone *= 1 - EYE_LOOK.limbalDepth * smoothstep(EYE_LOOK.limbalStart, 1, t);
  const sector = Math.floor(((Math.atan2(local.y, local.x) / (Math.PI * 2)) + 0.5) * EYE_LOOK.streakSectors);
  tone *= 1 + EYE_LOOK.streakSpread * (hash01(sector + 17) - 0.5);
  return 1 + (tone - 1) * clamp01(contrast);
}

/**
 * Height of the upper lid's edge in the eye's frame, metres above the eye centre.
 *
 * The sculpt cuts the lid at `0.38 × radius` above the centre on the eyeball's front; the rig
 * turns the lid about the eye centre by `lidRadians`, positive closing it downward. So the edge
 * sits at an elevation of `asin(0.38) − lidRadians` on the front of the eyeball.
 */
export function lidEdgeY(radius: number, lidRadians: number): number {
  const elevation = Math.asin(0.38) - lidRadians;
  return radius * Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, elevation)));
}

/** Multiplier for the lid's shadow on an iris cube whose posed height in the eye frame is `y`. */
export function lidShade(y: number, edgeY: number, cube: number): number {
  return 1 - EYE_LOOK.lidShadow * smoothstep(edgeY - EYE_LOOK.lidShadowReach * cube, edgeY - 0.25 * cube, y);
}

/**
 * Rotate eye-local points by the rig's gaze — yaw about +Y, then pitch about +X, as the rig turns
 * the eyeball — writing into `out`. Flat arrays, three floats per point: this runs every frame.
 */
export function gazeRotateInto(rest: Float32Array, yaw: number, pitch: number, out: Float32Array): void {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  for (let k = 0; k < rest.length; k += 3) {
    const x = rest[k];
    const y = rest[k + 1];
    const z = rest[k + 2];
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    out[k] = x1;
    out[k + 1] = y * cp - z1 * sp;
    out[k + 2] = y * sp + z1 * cp;
  }
}

/**
 * Which iris cube carries the catchlight: an index into `members`, or -1 for none.
 *
 * The cube whose posed direction from the eye centre is closest to the light's: as the eye turns,
 * the glint slides across the iris and stays where the light is, which is what a cornea does.
 * Cubes under the lid, or not on the visible front of the eye, are not eligible — a glint on a
 * closed eye would read as a hole in the lid — and neither are cubes inside the eyeball: it is
 * solid, so the cube pointing most nearly at the light can be one buried behind the surface,
 * and a glint there is never seen (it was, the first time: 2.6 cm behind the iris).
 *
 * @param posed Posed eye-local positions, three floats per iris cube (see {@link gazeRotateInto}).
 * @param members Which iris cubes belong to this eye, as cube indices into `posed`.
 */
export function pickCatchlight(
  posed: Float32Array,
  members: ArrayLike<number>,
  radius: number,
  edgeY: number,
  cube: number,
): number {
  if (members.length < EYE_LOOK.minIrisCubes) return -1;
  const [lx, ly, lz] = EYE_LOOK.catchlightFrom;
  const ll = Math.hypot(lx, ly, lz);
  let best = -1;
  let bestDot = -Infinity;
  for (let m = 0; m < members.length; m += 1) {
    const k = members[m] * 3;
    const x = posed[k];
    const y = posed[k + 1];
    const z = posed[k + 2];
    const length = Math.hypot(x, y, z);
    if (y > edgeY - cube || z < radius * 0.7 || length < radius - 1.2 * cube) continue;
    const dot = (x * lx + y * ly + z * lz) / ((length || 1) * ll);
    if (dot > bestDot) {
      bestDot = dot;
      best = m;
    }
  }
  return best;
}

/** How much of the look a level can carry, from its iris cube count per eye. */
export function irisContrast(irisCubesPerEye: number): number {
  return smoothstep(EYE_LOOK.minIrisCubes * 0.5, EYE_LOOK.minIrisCubes * 2, irisCubesPerEye);
}

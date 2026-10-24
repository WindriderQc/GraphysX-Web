/**
 * The inside of the mouth.
 *
 * The mouth is a tunnel cut through the lips, its walls moving with the lips and its far end a
 * fixed wall 28 cm behind them (sculptor `maskDistance`, `mawDistance`). All of it was one matte
 * near-black, so an open mouth read as a black rectangle pasted on the face. Measured from the
 * front at mid-speech, what the opening shows is the tunnel's front rim right behind the lips,
 * its walls receding, and the far wall. This module gives each of those a part to play:
 *
 * - the **front rim** of the tunnel's roof and floor becomes two rows of teeth, pale steel with
 *   a gap every few columns. The upper row stays with the skull and the lower follows the jaw
 *   only part of the way, so parting lips uncover them; riding fully with the lips, as the
 *   tunnel walls do, they stayed hidden behind them and only the corners showed, like fangs.
 *   They also fade in with the opening: at rest the slit would otherwise show a pale line on
 *   the mouth — the bright "craque" the owner already caught twice;
 * - the **walls** darken from the lips toward the back, so the opening has depth;
 * - the **far wall and the deep throat** hold an ember: the Forge inside the head, glowing
 *   with the voice and breathing slowly while the agent thinks. Speech then reads in the mouth
 *   and nowhere else, which is what the owner asked of it from the start.
 *
 * Pure over rest positions and drivers, so it is unit tested without a GPU; the rig turns these
 * into instance colours and a per-instance glow weight on the cavity's material.
 */

export const MOUTH_ROLE = Object.freeze({ wall: 0, upperTooth: 1, lowerTooth: 2, back: 3 });
export type MouthRole = (typeof MOUTH_ROLE)[keyof typeof MOUTH_ROLE];

export const MOUTH_LOOK = Object.freeze({
  /** The tunnel's depth range in the mask's frame: its front rim and its far wall (metres). */
  frontZ: 0.44,
  backZ: 0.16,
  /** Teeth: the front rim, from this far behind it, and across this share of the mouth's width. */
  toothDepth: 0.075,
  toothSpan: 0.86,
  /** Tooth width in metres; a column on a tooth boundary is the gap between two teeth. */
  toothWidth: 0.075,
  /** Below this many cubes per tooth the gaps would be noise: the row is plain. */
  minCubesPerTooth: 1.6,
  /**
   * How far each row of teeth follows its lip's travel: the upper row stays with the skull, the
   * lower one rides the jaw a little over half way. The difference is how much tooth shows.
   */
  upperToothFollow: 0,
  lowerToothFollow: 0.55,
  /**
   * The upper row hangs this many cubes below the tunnel's roof once the mouth is open: the
   * upper lip only lifts about a cube, and the roof row sat just behind its lower edge.
   */
  upperToothDrop: 1,
  /** Diffuse tones (linear, on a white base): teeth, gap, the wall at the lips and at the back. */
  // Warm, not stark: the same mask docks for the Famille profile, and bright white teeth around
  // a red glow read as menacing there.
  tooth: Object.freeze([0.5, 0.47, 0.41] as const),
  toothGap: 0.22,
  wallFront: Object.freeze([0.11, 0.07, 0.06] as const),
  wallBack: Object.freeze([0.012, 0.01, 0.01] as const),
  /** Mouth opening (0..1, after the pose's response curve) over which the teeth come in. */
  revealFrom: 0.08,
  revealTo: 0.35,
  /** Ember: its colour, how strong with the voice, and the slow breath while thinking. */
  // Dim and deep: at 2.4 the far wall's visible strip read as a lit orange slab in the mouth.
  // The Forge's own amber (llmx-forge.ts PALETTE.amber), the colour of its round particles,
  // rather than a red that looked like a hot mouth.
  ember: "#ff9a4a",
  emberSpeak: 0.62,
  emberThink: 0.4,
  emberThinkRate: 1.3,
  /** Glow weight by depth: the far wall full, the deep throat fading out toward the lips. */
  glowFrom: 0.3,
});

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 0 at the lips, 1 at the far wall. */
export function mouthDepth(z: number): number {
  return clamp01((MOUTH_LOOK.frontZ - z) / (MOUTH_LOOK.frontZ - MOUTH_LOOK.backZ));
}

export type MouthInterior = {
  role: Uint8Array;
  depth: Float32Array;
  /** 1 for a tooth column that is the gap between two teeth. */
  gap: Uint8Array;
};

/**
 * Classify the cavity's cubes, in the order given.
 *
 * @param positions rest positions, three floats per cube, of the cubes the cavity mesh draws
 * @param isBackWall per cube, true for the fixed far wall (region `maw`), false for the tunnel
 * @param mouth the mouth anchor (its height and half-width)
 * @param cube the level's grid step
 */
export function classifyMouth(
  positions: Float32Array,
  isBackWall: ArrayLike<boolean | number>,
  mouth: Readonly<{ y: number; halfWidth: number }>,
  cube: number,
): MouthInterior {
  const count = positions.length / 3;
  const role = new Uint8Array(count);
  const depth = new Float32Array(count);
  const gap = new Uint8Array(count);
  const teethFit = MOUTH_LOOK.toothWidth / cube >= MOUTH_LOOK.minCubesPerTooth;
  const reach = mouth.halfWidth * MOUTH_LOOK.toothSpan;
  for (let k = 0; k < count; k += 1) {
    const x = positions[k * 3];
    const y = positions[k * 3 + 1];
    const z = positions[k * 3 + 2];
    depth[k] = mouthDepth(z);
    if (isBackWall[k]) {
      role[k] = MOUTH_ROLE.back;
      continue;
    }
    const front = z >= MOUTH_LOOK.frontZ - MOUTH_LOOK.toothDepth;
    // The roof and the floor only: the side walls cross the mouth line, and teeth there sat in
    // the corners of the opening. Asymmetric, because the roof's lowest row can sit almost on the
    // mouth line (0.18 of a cube above it at the balanced level) while the side walls' lower
    // cubes sit a third of a cube below it.
    const roofOrFloor = y >= mouth.y ? y - mouth.y >= cube * 0.1 : mouth.y - y >= cube * 0.5;
    if (front && roofOrFloor && Math.abs(x) < reach) {
      role[k] = y >= mouth.y ? MOUTH_ROLE.upperTooth : MOUTH_ROLE.lowerTooth;
      if (teethFit) {
        // Teeth are centred on the mouth's axis, so the two front teeth meet in the middle.
        const along = Math.abs(x) / MOUTH_LOOK.toothWidth;
        gap[k] = Math.abs(along - Math.round(along)) * MOUTH_LOOK.toothWidth < cube * 0.5 && Math.round(along) > 0 ? 1 : 0;
      }
    }
  }
  return { role, depth, gap };
}

/** A wall cube's diffuse tone at a depth, written into `out` as linear RGB. */
export function wallTone(depth: number, out: number[] = [0, 0, 0]): number[] {
  const t = smoothstep(0, 0.8, depth);
  for (let c = 0; c < 3; c += 1) out[c] = MOUTH_LOOK.wallFront[c] + (MOUTH_LOOK.wallBack[c] - MOUTH_LOOK.wallFront[c]) * t;
  return out;
}

/** How much a cube carries the ember: the far wall fully, the deep throat fading toward the lips. */
export function glowWeight(role: MouthRole, depth: number): number {
  if (role === MOUTH_ROLE.back) return 1;
  if (role === MOUTH_ROLE.upperTooth || role === MOUTH_ROLE.lowerTooth) return 0;
  return smoothstep(MOUTH_LOOK.glowFrom, 1, depth) * 0.7;
}

/** How far the teeth have come in, from the mouth's opening after the response curve. */
export function toothReveal(mouthOpen: number): number {
  return smoothstep(MOUTH_LOOK.revealFrom, MOUTH_LOOK.revealTo, mouthOpen);
}

/**
 * The ember's intensity. With the voice, it follows the mouth's opening (already smoothed by the
 * rig, so it does not flicker per sample); while thinking, a slow breath. Never below zero, and
 * nothing at rest: a closed, idle mouth shows no light.
 */
export function emberLevel(mouthOpen: number, think: number, clock: number): number {
  const voice = MOUTH_LOOK.emberSpeak * clamp01(mouthOpen);
  const breath = MOUTH_LOOK.emberThink * clamp01(think) * (0.55 + 0.45 * Math.sin(clock * MOUTH_LOOK.emberThinkRate));
  return Math.max(0, voice + breath);
}

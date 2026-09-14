/**
 * The mask's reactions: short answers to events in the conversation, layered over the
 * presentation drivers. The presentation maps observable state to expression and nothing
 * else; a reaction is the same idea over an *event* — something that just happened — and it
 * fades on its own.
 *
 * Two events, both observable, neither inferred:
 * - a creation was accepted: the mask glances at what it just made, and the brow and the
 *   corners of the mouth lift for a moment — a maker looking at their work;
 * - the agent's voice starts: a small nod on the first syllable, the way a person marks the
 *   start of an answer. The nod itself is a rig gesture ({@link AgentWorldVoxelFace.nod});
 *   this module only decides *when*, from the audio's playing flag, with a silence threshold
 *   so the gap between two words is not a new reply.
 *
 * Pure over a clock in seconds, so the harness and the application share it and `node --test`
 * reaches it.
 */

export type ReactionOverlay = Readonly<{
  /** Extra warmth (0..1) to take the max of with the presentation's. */
  warmth: number;
  /** Extra attention (0..1), the raised brow. */
  attention: number;
  /** World point to glance at, or null once the glance is over. */
  focus: readonly [number, number, number] | null;
}>;

export const REACTION = Object.freeze({
  /** Creation: seconds to rise, to hold, to fade. Quick to appear, slow to leave. */
  creationAttack: 0.18,
  creationHold: 0.7,
  creationRelease: 1.1,
  creationWarmth: 0.8,
  creationAttention: 0.75,
  /** How long the eyes stay on the creation before returning to the visitor. */
  creationGlance: 1.4,
  /** Silence needed before a resumed voice counts as a new reply, and earns a nod. */
  speechSilence: 0.6,
});

const smooth = (k: number): number => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

/** The creation reaction's strength, 0..1, at `age` seconds after the creation. */
export function creationEnvelope(age: number): number {
  if (!(age >= 0)) return 0;
  const { creationAttack: attack, creationHold: hold, creationRelease: release } = REACTION;
  if (age < attack) return smooth(age / attack);
  if (age < attack + hold) return 1;
  return 1 - smooth((age - attack - hold) / release);
}

export type FaceReactions = Readonly<{
  /** A creation was accepted at `point` (world), at `now` seconds. */
  creation: (point: readonly [number, number, number], now: number) => void;
  /**
   * Feed the voice's playing flag every frame. Returns true on the one frame a reply starts —
   * the moment to nod.
   */
  speech: (playing: boolean, now: number) => boolean;
  /** The reaction's contribution this frame. */
  overlay: (now: number) => ReactionOverlay;
}>;

export function createFaceReactions(): FaceReactions {
  let creation: { at: number; point: readonly [number, number, number] } | null = null;
  let wasPlaying = false;
  let stoppedAt = Number.NEGATIVE_INFINITY;
  return {
    creation: (point, now) => {
      creation = { at: now, point: [point[0], point[1], point[2]] };
    },
    speech: (playing, now) => {
      let onset = false;
      if (playing && !wasPlaying) onset = now - stoppedAt >= REACTION.speechSilence;
      if (!playing && wasPlaying) stoppedAt = now;
      wasPlaying = playing;
      return onset;
    },
    overlay: (now) => {
      if (!creation) return { warmth: 0, attention: 0, focus: null };
      const age = now - creation.at;
      const gain = creationEnvelope(age);
      const focus = age >= 0 && age < REACTION.creationGlance ? creation.point : null;
      if (gain === 0 && focus === null && age > 0) creation = null;
      return { warmth: REACTION.creationWarmth * gain, attention: REACTION.creationAttention * gain, focus };
    },
  };
}

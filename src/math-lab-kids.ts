/**
 * The Math Lab's first level, for young children: counting cubes and additions to 20, drawn by
 * `<llmx-stage>` as `agentx.math-scene.v1` (the same cube pictures Famille shows). No typing: the
 * page offers buttons, and this module says which choices are allowed and why the others are not.
 *
 * The bounds are v1's, read through `readMathScene` so there is one rule: count 1 to 100, an
 * addition of two whole numbers whose sum is 1 to 20. A value outside them is refused whole,
 * never clamped: a button that would leave the bounds is disabled, and an address that asks for
 * one is refused with a sentence a child (or a parent) can read.
 */
import { MATH_LIMITS, mathTimeline, readMathScene, type MathScene } from "./llmx-math-scene";

export const KIDS_SCHEMA = "agentx.math-scene.v1";
export type KidsKind = MathScene["kind"];
export type KidsPart = "to" | "a" | "b";
export type KidsRead = Readonly<{ ok: true; scene: MathScene }> | Readonly<{ ok: false; say: string }>;

/** What a first-time visitor sees: one rod of ten and three more. */
export const KIDS_FIRST: MathScene = Object.freeze({ kind: "count", to: 13 });
/** Where each mode starts when chosen from its button. */
export const KIDS_START: Readonly<Record<KidsKind, MathScene>> = Object.freeze({
  count: KIDS_FIRST,
  add: Object.freeze({ kind: "add", a: 8, b: 5 }),
});
export const KIDS_COUNT_PICKS: readonly number[] = Object.freeze([5, 10, 13, 20, 47, 100]);
export const KIDS_ADD_PICKS: readonly (readonly [number, number])[] = Object.freeze([[3, 4], [5, 5], [8, 5], [7, 6], [9, 9], [10, 10]]);

/** One sentence per mode, shown when it is chosen. */
export const KIDS_ABOUT: Readonly<Record<KidsKind, string>> = Object.freeze({
  count: "Choisis un nombre : les cubes se rangent par dix, comme quand on apprend à compter.",
  add: "Les cubes orange viennent compléter la dizaine : c'est comme ça qu'on additionne avec une retenue.",
});

const COUNT_SAY = `On compte de 1 à ${MATH_LIMITS.countMax}. Choisis un nombre dans cet intervalle.`;
const SUM_SAY = `Une addition va jusqu'à ${MATH_LIMITS.sumMax} en tout. Choisis deux nombres plus petits.`;
const EMPTY_SAY = "Il faut au moins un cube : choisis un nombre plus grand que 0.";
const WHOLE_SAY = "Les cubes se comptent en nombres entiers : 0, 1, 2, 3…";

/** The scene value the stage takes. */
export const kidsSceneValue = (scene: MathScene): Record<string, unknown> => ({ schema: KIDS_SCHEMA, ...scene });

/** Accept a candidate picture, or say in plain French why it cannot be drawn. */
export function kidsRead(candidate: Readonly<Record<string, unknown>>): KidsRead {
  const scene = readMathScene(candidate);
  if (scene) return { ok: true, scene };
  const whole = (value: unknown): boolean => typeof value === "number" && Number.isInteger(value);
  if (candidate.kind === "count") return { ok: false, say: whole(candidate.to) ? COUNT_SAY : WHOLE_SAY };
  if (candidate.kind === "add") {
    const { a, b } = candidate;
    if (!whole(a) || !whole(b) || (a as number) < 0 || (b as number) < 0) return { ok: false, say: WHOLE_SAY };
    return { ok: false, say: (a as number) + (b as number) === 0 ? EMPTY_SAY : SUM_SAY };
  }
  return { ok: false, say: "Choisis « Compter » ou « Additionner »." };
}

/** The picture after one button press, or why that press is not allowed. */
export function kidsStep(scene: MathScene, part: KidsPart, delta: number): KidsRead {
  if (scene.kind === "count") return part === "to" ? kidsRead({ kind: "count", to: scene.to + delta }) : { ok: false, say: COUNT_SAY };
  if (part === "to") return { ok: false, say: SUM_SAY };
  return kidsRead({ kind: "add", a: scene.a + (part === "a" ? delta : 0), b: scene.b + (part === "b" ? delta : 0) });
}

/** A short note once a limit is reached, so a disabled button is never a mystery. */
export function kidsLimitNote(scene: MathScene): string {
  if (scene.kind === "count") return scene.to === MATH_LIMITS.countMax ? `${MATH_LIMITS.countMax}, c'est le plus grand nombre ici.` : "";
  return scene.a + scene.b === MATH_LIMITS.sumMax
    ? `${MATH_LIMITS.sumMax} en tout, c'est le maximum : enlève un cube à l'autre nombre pour en ajouter.`
    : "";
}

/** Seconds until the stage has finished its picture (the answer is shown then). */
export const kidsDuration = (scene: MathScene): number => mathTimeline(scene).duration;

export const kidsAnswer = (scene: MathScene): number => (scene.kind === "count" ? scene.to : scene.a + scene.b);

/** The address keeps the picture in plain words: `#compter=13`, `#additionner=8+5`. */
export function kidsHash(scene: MathScene): string {
  return scene.kind === "count" ? `#compter=${scene.to}` : `#additionner=${scene.a}+${scene.b}`;
}

/** Read the address: null when it is not a cube picture, a refusal when it asks for one out of bounds. */
export function kidsFromHash(hash: string): KidsRead | null {
  const count = /^#compter=(.*)$/s.exec(hash);
  const number = (text: string): number => (/^\d{1,4}$/.test(text) ? Number(text) : Number.NaN);
  if (count) return kidsRead({ kind: "count", to: number(decodeURIComponentSafe(count[1])) });
  const add = /^#additionner=(.*)$/s.exec(hash);
  if (!add) return null;
  const parts = /^(\d{1,4})\+(\d{1,4})$/.exec(decodeURIComponentSafe(add[1]).replace(/ /g, "+"));
  return parts ? kidsRead({ kind: "add", a: Number(parts[1]), b: Number(parts[2]) }) : { ok: false, say: WHOLE_SAY };
}

function decodeURIComponentSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return "";
  }
}

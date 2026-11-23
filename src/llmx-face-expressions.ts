import { NEUTRAL_DRIVERS, type FaceDrivers } from "./llmx-face-pose";

/** Deliberately authored poses for inspection. These do not claim to detect human emotions. */
export const FACE_EXPRESSIONS = {
  neutral: { ...NEUTRAL_DRIVERS },
  smile: { ...NEUTRAL_DRIVERS, warmth: 1, attention: 0.4 },
  curious: { ...NEUTRAL_DRIVERS, curiosity: 1, gazeX: 0.35, gazeY: 0.12, attention: 0.55, warmth: 0.18 },
  surprised: { ...NEUTRAL_DRIVERS, surprise: 1, attention: 1 },
} satisfies Record<string, FaceDrivers>;

export type FaceExpression = keyof typeof FACE_EXPRESSIONS;

export function faceExpression(value: string | null): FaceDrivers | null {
  return value && Object.hasOwn(FACE_EXPRESSIONS, value) ? { ...FACE_EXPRESSIONS[value as FaceExpression] } : null;
}

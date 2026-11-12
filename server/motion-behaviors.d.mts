export const MOTION_FIELDS: Readonly<{ keyframes: readonly string[]; flight: readonly string[] }>;
export function validateMotionBehavior(behavior: { type: string; [field: string]: unknown }): void;

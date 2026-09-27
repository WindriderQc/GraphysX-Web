/**
 * Framing for `<llmx-stage>`: where the camera looks and how far back it stands so the whole
 * math picture, label included, fits the element at any aspect with a margin. Pure, no three.js.
 */
export type StageBounds = Readonly<{ min: readonly [number, number]; max: readonly [number, number] }>;
export type StageView = Readonly<{ x: number; y: number; distance: number }>;

/** Room above the cubes for the label, and the margin kept around the whole picture. */
export const STAGE_LABEL_ROOM = 0.6;
export const STAGE_MARGIN = 1.12;
/** Depth of a cube's front face, so the nearest cube never touches the near edge of the view. */
const FRONT = 0.1;
/** An empty stage still frames a small area rather than a zero-size one. */
const MIN_HALF = 0.5;

export function stageView(bounds: StageBounds | null, aspect: number, fovDegrees: number): StageView {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const vertical = (fovDegrees * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(vertical) * ratio);
  const minX = bounds ? bounds.min[0] : -MIN_HALF, maxX = bounds ? bounds.max[0] : MIN_HALF;
  const minY = bounds ? bounds.min[1] : -MIN_HALF, maxY = bounds ? bounds.max[1] + STAGE_LABEL_ROOM : MIN_HALF;
  const halfX = Math.max(MIN_HALF, (maxX - minX) / 2) * STAGE_MARGIN;
  const halfY = Math.max(MIN_HALF, (maxY - minY) / 2) * STAGE_MARGIN;
  const distance = FRONT + Math.max(halfY / Math.tan(vertical), halfX / Math.tan(horizontal));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, distance };
}

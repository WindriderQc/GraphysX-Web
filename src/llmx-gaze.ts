import { type Camera, Vector3 } from "three";

/**
 * Where the mask looks.
 *
 * Three things can hold its gaze, in this order of precedence: something that was just created
 * (the application holds the point for a moment), the visitor's pointer while it is moving over
 * the scene, and otherwise the camera — the visitor themself. The pointer case is what makes the
 * face feel present: move the mouse and the eyes follow, hover the mask and it pays attention.
 *
 * Pure geometry over Three's camera, no DOM: the DOM half ({@link createPointerFocus}) only
 * records pointer positions, so the maths is unit-testable and shared by the harness and the
 * application.
 */

export type GazeFocus = Readonly<{
  /** World point the eyes aim at. */
  point: [number, number, number];
  /** True when the pointer is over the mask itself, for an attention bump. */
  overFace: boolean;
  /** "pointer" while the pointer is live, otherwise "camera". */
  source: "pointer" | "camera";
}>;

const ray = new Vector3();
const origin = new Vector3();
const toFace = new Vector3();
const closest = new Vector3();

/**
 * Turn a pointer position (normalised device coordinates, -1..1) into a world point at the
 * mask's depth: the point on the pointer's ray closest to the mask centre, pushed out to the
 * plane through the mask. Looking there is what a person does when you point at something
 * beside their head — they look at the thing, not at your hand.
 */
export function pointerGazePoint(
  camera: Camera,
  ndcX: number,
  ndcY: number,
  faceCenter: readonly [number, number, number],
  faceRadius: number,
): GazeFocus {
  origin.setFromMatrixPosition(camera.matrixWorld);
  ray.set(ndcX, ndcY, 0.5).unproject(camera).sub(origin).normalize();
  toFace.set(faceCenter[0], faceCenter[1], faceCenter[2]).sub(origin);
  // Distance along the ray to the plane through the face centre facing the camera.
  const depth = Math.max(0.5, toFace.dot(ray));
  closest.copy(origin).addScaledVector(ray, depth);
  const miss = closest.distanceTo(toFace.add(origin));
  // The eyes aim at a point halfway between the visitor and the mask, not at the mask's own
  // plane: a point in that plane sits at zero depth in the mask's frame, where a few
  // centimetres to either side become a ninety-degree glance. Halfway keeps the angles those
  // of a person looking at something held up in front of them.
  closest.copy(origin).addScaledVector(ray, depth * 0.5);
  return {
    point: [closest.x, closest.y, closest.z],
    overFace: miss <= faceRadius,
    source: "pointer",
  };
}

export function cameraGazePoint(camera: Camera): GazeFocus {
  origin.setFromMatrixPosition(camera.matrixWorld);
  return { point: [origin.x, origin.y, origin.z], overFace: false, source: "camera" };
}

/**
 * The DOM half: remember the last pointer position over an element, and for how long it counts.
 * A pointer that stopped moving a few seconds ago is no longer where the visitor's attention is;
 * the gaze then returns to the camera on its own.
 */
export function createPointerFocus(element: HTMLElement, options: { holdSeconds?: number } = {}) {
  const hold = options.holdSeconds ?? 4;
  let ndcX = 0;
  let ndcY = 0;
  let movedAt = Number.NEGATIVE_INFINITY;
  let inside = false;
  const onMove = (event: PointerEvent): void => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    movedAt = performance.now() / 1000;
    inside = true;
  };
  const onLeave = (): void => { inside = false; };
  element.addEventListener("pointermove", onMove);
  element.addEventListener("pointerleave", onLeave);
  return {
    /** The focus for this frame, or null when the pointer is not live. */
    resolve(camera: Camera, faceCenter: readonly [number, number, number], faceRadius: number, now = performance.now() / 1000): GazeFocus | null {
      if (!inside || now - movedAt > hold) return null;
      return pointerGazePoint(camera, ndcX, ndcY, faceCenter, faceRadius);
    },
    dispose(): void {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
    },
  };
}

/** Gaze drivers (-1..1) for a world point, in the mask's local frame. */
export function gazeDriversToward(
  localPoint: { x: number; y: number; z: number },
  eyeHeight: number,
  gazeRadians: number,
): { gazeX: number; gazeY: number } {
  const clamp = (value: number): number => (value < -1 ? -1 : value > 1 ? 1 : value);
  return {
    gazeX: clamp(Math.atan2(localPoint.x, localPoint.z) / gazeRadians),
    gazeY: clamp(Math.atan2(localPoint.y - eyeHeight, Math.hypot(localPoint.x, localPoint.z)) / gazeRadians),
  };
}

/** A stable screen-aligned race view. Only the framing changes, never the driving axes. */
export type BallsyCameraPoint = readonly [number, number, number];
export type BallsyCameraFrame = {
  center: [number, number, number];
  distance: number;
  position: [number, number, number];
  target: [number, number, number];
};
export type BallsyCameraViewport = {
  width: number;
  height: number;
  fov: number;
  inset?: { top: number; right: number; bottom: number; left: number };
};
const elevation = 64 * Math.PI / 180;
const up = Math.sin(elevation), back = Math.cos(elevation);

/** Fit actual 3D points, including elevation/perspective, into the unobstructed HUD area.
 * Context points provide room to anticipate bends; safety points prevent clipping even
 * while the focus is catching up. There is no world, physics or wall-clock state here. */
export function frameBallsyCamera(
  points: readonly BallsyCameraPoint[],
  safety: readonly BallsyCameraPoint[],
  viewport: BallsyCameraViewport,
  previous: BallsyCameraFrame | null = null,
  seconds = 0,
): BallsyCameraFrame {
  const width = Math.max(1, viewport.width), height = Math.max(1, viewport.height);
  const inset = viewport.inset ?? { top: 24, right: 24, bottom: 24, left: 24 };
  const x0 = -1 + 2 * Math.min(inset.left, width * .38) / width;
  const x1 = 1 - 2 * Math.min(inset.right, width * .38) / width;
  const y0 = -1 + 2 * Math.min(inset.bottom, height * .48) / height;
  const y1 = 1 - 2 * Math.min(inset.top, height * .38) / height;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const tanY = Math.tan(viewport.fov * Math.PI / 360), tanX = tanY * width / height;
  const desired = [0, 1, 2].map(axis =>
    (Math.min(...points.map(p => p[axis])) + Math.max(...points.map(p => p[axis]))) / 2,
  ) as [number, number, number];
  const dt = Math.max(0, Math.min(.1, seconds));
  const blend = previous ? 1 - Math.exp(-3.5 * dt) : 1;
  const center = desired.map((v, i) => previous ? previous.center[i] + (v - previous.center[i]) * blend : v) as [number, number, number];
  const requiredDistance = (subjects: readonly BallsyCameraPoint[]): number => {
    let distance = 26;
    for (const p of subjects) {
      const x = p[0] - center[0], y = p[1] - center[1], z = p[2] - center[2];
      const vertical = y * back - z * up, depth = y * up + z * back;
      distance = Math.max(distance,
        (x / tanX + x1 * depth) / (x1 - cx),
        (-x / tanX - x0 * depth) / (cx - x0),
        (vertical / tanY + y1 * depth) / (y1 - cy),
        (-vertical / tanY - y0 * depth) / (cy - y0),
        depth + 2,
      );
    }
    return distance;
  };
  const wanted = requiredDistance(points);
  const zoomBlend = previous ? 1 - Math.exp(-(wanted > previous.distance ? 5 : 1.6) * dt) : 1;
  // Only a teleport/resize should consume the extra context margin. Ordinary driving
  // uses the damped view; containment remains mandatory rather than a delayed promise.
  const distance = Math.max(requiredDistance(safety), previous ? previous.distance + (wanted - previous.distance) * zoomBlend : wanted);
  const shiftX = -cx * distance * tanX, shiftUp = -cy * distance * tanY;
  const target: [number, number, number] = [center[0] + shiftX, center[1] + shiftUp * back, center[2] - shiftUp * up];
  return { center, distance, target, position: [target[0], target[1] + distance * up, target[2] + distance * back] };
}

/** Include a whole ball and its small arrival halo, rather than only its centre. */
export function ballsyCameraEnvelope(position: BallsyCameraPoint, radius = 1.5): BallsyCameraPoint[] {
  return [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z =>
    [position[0] + x * radius, position[1] + y * radius, position[2] + z * radius] as const,
  )));
}

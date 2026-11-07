import { Ray, Vector3 } from "three";
import { COURSE_SHORTCUT, courseEdge } from "./ballsy-course";

/** Pointer occlusion uses the same banked ribbon and 0.62 m deck thickness as
 * ballsy-road-bridge. Coordinates are course-local, including in the giant's model.
 * It clips only pointer rays: the physical hand/shovel interaction is unchanged. */
const bridgeTriangles: readonly (readonly [Vector3, Vector3, Vector3])[] = (() => {
  const triangles: [Vector3, Vector3, Vector3][] = [];
  const quad = (a: Vector3, b: Vector3, c: Vector3, d: Vector3): void => {
    triangles.push([a, b, c], [a, c, d]);
  };
  for (let i = 1; i < COURSE_SHORTCUT.length; i++) {
    const a = COURSE_SHORTCUT[i - 1], b = COURSE_SHORTCUT[i];
    const a0 = new Vector3(...courseEdge(a, -a.width / 2)), a1 = new Vector3(...courseEdge(a, a.width / 2));
    const b0 = new Vector3(...courseEdge(b, -b.width / 2)), b1 = new Vector3(...courseEdge(b, b.width / 2));
    const aa = a0.clone().add(new Vector3(0, -0.62, 0)), ab = a1.clone().add(new Vector3(0, -0.62, 0));
    const ba = b0.clone().add(new Vector3(0, -0.62, 0)), bb = b1.clone().add(new Vector3(0, -0.62, 0));
    quad(a1, b1, b0, a0);
    quad(ab, bb, b1, a1);
    quad(ba, aa, a0, b0);
    quad(aa, ba, bb, ab);
  }
  return triangles;
})();

/** Distance to the first actual deck triangle, not a footprint or screen rectangle.
 * A ray starting beneath the bridge remains free to reach visible earth below it. */
export function bridgeOcclusionDistance(ray: Ray): number {
  const hit = new Vector3();
  let distance = Infinity;
  for (const [a, b, c] of bridgeTriangles) {
    if (ray.intersectTriangle(a, b, c, false, hit)) distance = Math.min(distance, ray.origin.distanceTo(hit));
  }
  return distance;
}

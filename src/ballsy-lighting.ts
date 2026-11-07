import { DirectionalLight, Vector3, type Object3D } from "three";

const configuredScale = new WeakMap<DirectionalLight, number>();

/** Keep the native sun aimed at the miniature, rather than the room's origin.
 * Shadow-camera dimensions and normal bias are world-space lengths, unlike the
 * parent's inherited model scale. Called on setup/resize only, never per frame. */
export function fitBallsyTableShadows(root: Object3D, sun: Object3D | null | undefined): boolean {
  if (!(sun instanceof DirectionalLight)) return false;
  const size = root.getWorldScale(new Vector3());
  const scale = Math.max(Math.abs(size.x), Math.abs(size.y), Math.abs(size.z));
  if (!Number.isFinite(scale) || scale <= 0) return false;
  if (sun.target.parent !== root) {
    root.add(sun.target);
    sun.target.position.set(0, 0, 0);
    sun.target.updateWorldMatrix(true, false);
  }
  if (configuredScale.get(sun) === scale) return false;
  const camera = sun.shadow.camera;
  camera.left = camera.bottom = -38 * scale;
  camera.right = camera.top = 38 * scale;
  camera.near = .5 * scale; camera.far = 110 * scale;
  sun.shadow.normalBias = .03 * scale;
  // Retain enough depth bias for broad banked ribbons. The tabletop uses the same
  // filtered shadow mode as the PC, rather than BasicShadowMap's visible acne.
  sun.shadow.bias = -.0004;
  camera.updateProjectionMatrix();
  sun.shadow.needsUpdate = true;
  configuredScale.set(sun, scale);
  return true;
}

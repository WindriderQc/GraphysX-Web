import { Box3, type BufferGeometry, type Object3D } from "three";

/** Bounds of rendered geometry only, respecting hidden ancestors and native origins. */
export function visibleSceneBounds(root: Object3D): Box3 {
  root.updateWorldMatrix(true, true);
  const result = new Box3(), transformed = new Box3();
  root.traverseVisible(child => {
    const object = child as Object3D & { geometry?: BufferGeometry; boundingBox?: Box3 | null; computeBoundingBox?: () => void };
    if (!object.geometry) return;
    // Instanced/skinned meshes own bounds beyond their base geometry.
    let local: Box3 | null | undefined;
    if ("boundingBox" in object) { object.computeBoundingBox?.(); local = object.boundingBox; }
    else { if (!object.geometry.boundingBox) object.geometry.computeBoundingBox(); local = object.geometry.boundingBox; }
    if (local && !local.isEmpty()) result.union(transformed.copy(local).applyMatrix4(object.matrixWorld));
  });
  return result;
}

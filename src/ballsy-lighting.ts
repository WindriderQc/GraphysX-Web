import { DirectionalLight, Vector3, type BufferAttribute, type InstancedMesh, type InterleavedBufferAttribute, type Light, type Material, type Mesh, type Object3D, type SkinnedMesh } from "three";

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

/** Tell when a scene's shadow maps must be redrawn: a visible shadow caster moved, appeared,
 * disappeared or changed shape or material, or a shadow-casting light moved. Otherwise the
 * existing map is still exact, so reusing it changes nothing on screen. Measured 2026-11-07
 * under software WebGL: redrawing the giant's 2048 map every frame was ~140 of its 244 ms. */
export function createBallsyShadowRefresh(scene: Object3D): () => boolean {
  let previous: number[] = [];
  const materialIds = new WeakMap<Material, number>();
  let nextMaterialId = 0;
  const materialId = (material: Material): number => {
    const known = materialIds.get(material);
    if (known !== undefined) return known;
    materialIds.set(material, ++nextMaterialId);
    return nextMaterialId;
  };
  const version = (attribute: BufferAttribute | InterleavedBufferAttribute | null | undefined): number =>
    !attribute ? -1 : "isInterleavedBufferAttribute" in attribute ? attribute.data.version : attribute.version;
  return () => {
    scene.updateMatrixWorld();
    const next: number[] = [];
    let animated = false;
    scene.traverseVisible((object) => {
      const mesh = object as Mesh, light = object as Light;
      if (!object.castShadow || !(mesh.isMesh || light.isLight)) return;
      next.push(object.id, ...object.matrixWorld.elements);
      if (mesh.isMesh) {
        const geometry = mesh.geometry;
        next.push(geometry.id, version(geometry.attributes.position), version(geometry.index), geometry.drawRange.start, geometry.drawRange.count);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) next.push(materialId(material), material.version, material.visible ? 1 : 0);
        // Bones and instance matrices move without the mesh's own matrix: always redraw.
        if ((mesh as SkinnedMesh).isSkinnedMesh || (mesh as InstancedMesh).isInstancedMesh) animated = true;
      } else if (light instanceof DirectionalLight) {
        const { camera, mapSize } = light.shadow;
        next.push(...light.target.matrixWorld.elements, mapSize.x, mapSize.y, camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far, light.shadow.bias, light.shadow.normalBias);
      }
    });
    const changed = animated || next.length !== previous.length || next.some((value, index) => value !== previous[index]);
    previous = next;
    return changed;
  };
}

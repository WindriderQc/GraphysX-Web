import {
  Box3, Euler, Group, InstancedMesh, LOD, Material, Matrix4, Mesh, MeshStandardMaterial,
  Quaternion, SRGBColorSpace, Texture, TextureLoader, Vector3, type Object3D, type WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { ResolvedAgentWorldModelAsset } from "./agent-world-assets";
import {
  registerAgentWorldModelMaterialSlots, modelMaterialSlotId, modelMaterialSlotLabel,
  type AgentWorldModelMaterialRegistration,
} from "./agent-world-model-materials";

// These same-origin codec files and their license are part of the release manifest.
export const NATIVE_MODEL_CODECS = [
  "/assets/codecs/basis/basis_transcoder.js", "/assets/codecs/basis/basis_transcoder.wasm",
  "/assets/codecs/basis/LICENSE.txt",
];

/** Pending loads own resources until attachment, including rejected/late completions. */
export function disposeNativeTree(root: Object3D): void {
  const resources = new Set<{ dispose(): void }>();
  const textures = new Set<Texture>();
  root.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    resources.add(mesh.geometry);
    if ((mesh as InstancedMesh).isInstancedMesh) resources.add(mesh as InstancedMesh);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
    const skeleton = (mesh as Mesh & { skeleton?: { dispose(): void } }).skeleton;
    if (skeleton) resources.add(skeleton);
  });
  for (const texture of textures) {
    texture.dispose();
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap) texture.image.close();
  }
  resources.forEach(resource => resource.dispose());
}

/** Batch any static glTF mesh hierarchy into one draw per source mesh/material group. */
export function instanceGltf(root: Group, instances: NonNullable<ResolvedAgentWorldModelAsset["instances"]>): Group {
  const batch = new Group(); batch.name = "Instanced model batch";
  root.updateWorldMatrix(true, true);
  const sourceMeshes: Mesh[] = [];
  root.traverse(object => { if ((object as Mesh).isMesh) sourceMeshes.push(object as Mesh); });
  for (const source of sourceMeshes) {
    if ((source as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh || source.morphTargetInfluences?.length || (source as InstancedMesh).isInstancedMesh) {
      throw new Error("Model batches require static meshes without skinning, morph targets or nested instancing");
    }
    const mesh = new InstancedMesh(source.geometry, source.material, instances.length);
    mesh.name = source.name;
    const matrix = new Matrix4(); const rotation = new Quaternion(); const position = new Vector3(); const scale = new Vector3();
    instances.forEach((instance, index) => {
      position.fromArray(instance.position ?? [0,0,0]); scale.fromArray(instance.scale ?? [1,1,1]);
      const degrees = instance.rotationDegrees ?? [0,0,0];
      rotation.setFromEuler(new Euler(...degrees.map(value => value * Math.PI / 180) as [number,number,number]));
      matrix.compose(position, rotation, scale).multiply(source.matrixWorld);
      if (matrix.determinant() <= 0) throw new Error("Model batches require positive-determinant transforms");
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    batch.add(mesh);
  }
  return batch;
}

export async function loadNativeGltf(target: Group, asset: ResolvedAgentWorldModelAsset, renderer?: WebGLRenderer): Promise<void> {
  if (target.userData.graphysxDisposed) return;
  const ktx = renderer ? new KTX2Loader().setTranscoderPath(`${import.meta.env?.BASE_URL ?? "/"}assets/codecs/basis/`).setWorkerLimit(2).detectSupport(renderer) : null;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (ktx) loader.setKTX2Loader(ktx);
  const owned = new Group();
  let lightmap: Texture | null = null;
  try {
    const sources = [{ url: asset.url, distance: 0 }, ...(asset.lods ?? [])];
    // Sequential levels keep failed-load ownership simple and avoid unbounded parallel decodes.
    const loaded: { root: Group; distance: number }[] = [];
    for (const source of sources) {
      const gltf = await loader.loadAsync(source.url);
      owned.add(gltf.scene);
      if (target.userData.graphysxDisposed) { disposeNativeTree(owned); return; }
      if (asset.instances && gltf.animations.length) throw new Error("Animated glTF models cannot be static instance batches");
      loaded.push({ root: gltf.scene, distance: source.distance });
    }
    if (asset.lightmap) {
      if (/\.ktx2(?:\?|$)/i.test(asset.lightmap.url)) {
        if (!ktx) throw new Error("A WebGL renderer is required to decode KTX2 lightmaps");
        lightmap = await ktx.loadAsync(asset.lightmap.url);
      } else lightmap = await new TextureLoader().loadAsync(asset.lightmap.url);
      lightmap.colorSpace = SRGBColorSpace; lightmap.flipY = false; lightmap.channel = 1;
    }
    if (target.userData.graphysxDisposed) { disposeNativeTree(owned); lightmap?.dispose(); return; }
    const bounds = new Box3().setFromObject(loaded[0]!.root);
    const dimensions = bounds.getSize(new Vector3());
    const extent = Math.max(dimensions.x, dimensions.y, dimensions.z);
    if (!Number.isFinite(extent) || extent <= 0) throw new Error("glTF model has no finite nonempty bounds");
    const fitScale = asset.fitSize / extent;
    const centre = bounds.getCenter(new Vector3());
    const presentation = new LOD(); presentation.name = "Model LOD";
    owned.add(presentation);
    for (const { root, distance } of loaded) {
      const fitted = new Group(); fitted.add(root); fitted.scale.setScalar(fitScale); fitted.position.copy(centre).multiplyScalar(-fitScale);
      owned.add(fitted);
      // Bake fit into batch matrices; unbatched models preserve the native scene graph.
      fitted.updateWorldMatrix(true, true);
      let level: Group = fitted;
      if (asset.instances) level = instanceGltf(fitted, asset.instances);
      presentation.addLevel(level, distance, .12);
    }
    presentation.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.userData.graphysxMaterialLocked = true;
      if (!lightmap) return;
      if (!mesh.geometry.getAttribute("uv1")) throw new Error("Baked lightmaps require glTF TEXCOORD_1 (uv1) on every mesh");
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!(material instanceof MeshStandardMaterial)) throw new Error("Baked lightmaps require PBR materials");
        material.lightMap = lightmap; material.lightMapIntensity = asset.lightmap!.intensity ?? 1; material.needsUpdate = true;
      }
    });
    // Everything now belongs to presentation. Avoid double ownership on a rejected attachment.
    owned.clear(); owned.add(presentation);
    if (target.userData.graphysxDisposed) { disposeNativeTree(owned); return; }
    target.add(presentation);
    const slots: AgentWorldModelMaterialRegistration[] = [];
    let meshIndex = 0;
    presentation.traverse(object => {
      const mesh = object as Mesh; if (!mesh.isMesh) return;
      const index = meshIndex++;
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material: Material, materialIndex) => {
        const role = "material" as const;
        slots.push({ id: modelMaterialSlotId(mesh.name, index, material.name, materialIndex), label: modelMaterialSlotLabel(role, mesh.name, material.name), role,
          mesh, meshName: mesh.name, meshIndex: index, materialName: material.name, materialIndex, sourceMaterial: material,
          sourceMapName: "map" in material && material.map instanceof Texture ? material.map.name || "glTF texture" : null });
      });
    });
    registerAgentWorldModelMaterialSlots(target, slots);
    owned.clear();
  } catch (error) {
    disposeNativeTree(owned); lightmap?.dispose(); throw error;
  } finally { ktx?.dispose(); }
}

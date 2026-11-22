import {
  Box3, Euler, Group, InstancedMesh, LOD, Material, Matrix4, Mesh, MeshStandardMaterial,
  Quaternion, SRGBColorSpace, Texture, TextureLoader, Vector3, type Line, type Object3D, type Points, type WebGLRenderer,
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
    if (!(object as Mesh).isMesh && !(object as Line).isLine && !(object as Points).isPoints) return;
    const mesh = object as Mesh;
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
  try {
    for (const source of sourceMeshes) {
      if ((source as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh || source.morphTargetInfluences?.length || (source as InstancedMesh).isInstancedMesh) {
        throw new Error("Model batches require static meshes without skinning, morph targets or nested instancing");
      }
      const mesh = new InstancedMesh(source.geometry, source.material, instances.length);
      mesh.name = source.name;
      batch.add(mesh);
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
    }
  } catch (error) {
    // The original level still owns its geometry and materials.
    for (const mesh of batch.children) (mesh as InstancedMesh).dispose();
    throw error;
  }
  return batch;
}

export async function loadNativeGltf(target: Group, asset: ResolvedAgentWorldModelAsset, renderer?: WebGLRenderer): Promise<void | { lodWarning: string }> {
  if (target.userData.graphysxDisposed) return;
  const ktx = renderer ? new KTX2Loader().setTranscoderPath(`${import.meta.env?.BASE_URL ?? "/"}assets/codecs/basis/`).setWorkerLimit(2).detectSupport(renderer) : null;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (ktx) loader.setKTX2Loader(ktx);
  const presentation = new LOD(); presentation.name = "Model LOD";
  const centre = new Vector3();
  let fitScale = 1;
  let pending: Group | null = null;
  let lightmap: Texture | null = null;
  let attached = false;
  let lodWarning: string | null = null;
  try {
    const sources = [{ url: asset.url, distance: 0 }, ...(asset.lods ?? [])];
    for (const [index, source] of sources.entries()) {
      try {
        const gltf = await loader.loadAsync(source.url);
        pending = gltf.scene;
        if (target.userData.graphysxDisposed) return;
        if (asset.instances && gltf.animations.length) throw new Error("Animated glTF models cannot be static instance batches");
        const bounds = new Box3().setFromObject(pending);
        const dimensions = bounds.getSize(new Vector3());
        const extent = Math.max(dimensions.x, dimensions.y, dimensions.z);
        if (!Number.isFinite(extent) || extent <= 0) throw new Error("glTF model has no finite nonempty bounds");
        if (index === 0) {
          fitScale = asset.fitSize / extent;
          bounds.getCenter(centre);
        }
        if (asset.lightmap) pending.traverse(object => {
          const mesh = object as Mesh;
          if (!mesh.isMesh) return;
          if (!mesh.geometry.getAttribute("uv1")) throw new Error("Baked lightmaps require glTF TEXCOORD_1 (uv1) on every mesh");
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          if (materials.some(material => !(material instanceof MeshStandardMaterial))) throw new Error("Baked lightmaps require PBR materials");
        });
        const fitted = new Group();
        fitted.add(pending);
        fitted.scale.setScalar(fitScale);
        fitted.position.copy(centre).multiplyScalar(-fitScale);
        const level = asset.instances ? instanceGltf(fitted, asset.instances) : fitted;
        presentation.addLevel(level, source.distance, .12);
        pending = null;
      } catch (error) {
        if (index === 0) throw error;
        if (pending) disposeNativeTree(pending);
        pending = null;
        if (target.userData.graphysxDisposed) return;
        // Keep a prefix so the saved, traversal-based slot IDs never shift onto later levels.
        lodWarning = `Optional LOD unavailable (${source.url}, distance ${source.distance}): ${error instanceof Error ? error.message : String(error)}`;
        break;
      }
    }
    if (asset.lightmap) {
      if (/\.ktx2(?:\?|$)/i.test(asset.lightmap.url)) {
        if (!ktx) throw new Error("A WebGL renderer is required to decode KTX2 lightmaps");
        lightmap = await ktx.loadAsync(asset.lightmap.url);
      } else lightmap = await new TextureLoader().loadAsync(asset.lightmap.url);
      lightmap.colorSpace = SRGBColorSpace; lightmap.flipY = false; lightmap.channel = 1;
    }
    if (target.userData.graphysxDisposed) return;
    let lightmapApplied = false;
    presentation.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.userData.graphysxMaterialLocked = true;
      if (!lightmap) return;
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as MeshStandardMaterial[];
      for (const material of materials) {
        material.lightMap = lightmap; material.lightMapIntensity = asset.lightmap!.intensity ?? 1; material.needsUpdate = true;
        lightmapApplied = true;
      }
    });
    if (!lightmapApplied) lightmap?.dispose();
    lightmap = null; // The meshes now own the shared lightmap.
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
    target.add(presentation);
    attached = true;
    if (lodWarning) return { lodWarning };
  } finally {
    if (!attached) {
      if (pending) disposeNativeTree(pending);
      disposeNativeTree(presentation);
      lightmap?.dispose();
    }
    ktx?.dispose();
  }
}

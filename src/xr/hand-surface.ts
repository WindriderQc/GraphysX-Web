import { MeshStandardMaterial, type Mesh, type Object3D } from "three";

/** Shared visual treatment for native tracked hands and controller-driven avatars. */
export function styleHandSurface(root: Object3D): void {
  root.traverse(child => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.color.set("#4b8bbf"); material.emissive.set("#1c527c");
      material.emissiveIntensity = .35; material.roughness = .3; material.metalness = .05;
      material.transparent = true; material.opacity = .76; material.depthWrite = false;
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
          float handRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.2);
          outgoingLight += vec3(0.22, 0.64, 1.0) * handRim * 0.85;
          diffuseColor.a = min(1.0, opacity + 0.20 * handRim);
          #include <opaque_fragment>
        `);
      };
      material.customProgramCacheKey = () => "graphysx-tracked-hand-v1";
    }
  });
}

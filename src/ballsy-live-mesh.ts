import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, type Object3D } from "three";
import type { AgentWorldInlineMesh } from "./agent-world-runtime";

/** Project a transient visual surface without taking an editor undo snapshot.
 * The authoritative earth model is transmitted separately. Never use this for
 * diggable earth: its mesh AND collision shape must still change through the API. */
export function projectLiveLava(object: Object3D | null | undefined, source: AgentWorldInlineMesh): boolean {
  if (!(object instanceof Mesh)) return false;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(source.positions, 3));
  geometry.setIndex(source.indices);
  geometry.computeVertexNormals();
  for (const group of source.groups ?? [{ start: 0, count: source.indices.length, materialIndex: 0 }]) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const previousGeometry = object.geometry;
  object.geometry = geometry;
  previousGeometry.dispose();

  const definitions = source.materials ?? [{ color: "#f58124", emissive: "#ee4b09", emissiveIntensity: 0.35, roughness: 0.6 }];
  let materials = Array.isArray(object.material) ? object.material : [object.material];
  if (materials.length !== definitions.length || materials.some(material => !(material instanceof MeshStandardMaterial))) {
    const previousMaterials = materials;
    const template = materials.find(material => material instanceof MeshStandardMaterial) as MeshStandardMaterial | undefined;
    materials = definitions.map(() => template?.clone() ?? new MeshStandardMaterial());
    for (const material of previousMaterials) material.dispose();
    object.material = materials;
  }
  definitions.forEach((definition, i) => {
    const material = materials[i] as MeshStandardMaterial;
    material.color.set(definition.color ?? "#f58124");
    material.emissive.set(definition.emissive ?? "#ee4b09");
    material.emissiveIntensity = definition.emissiveIntensity ?? 0.35;
    material.roughness = definition.roughness ?? 0.6;
    material.metalness = definition.metalness ?? 0;
  });
  return true;
}

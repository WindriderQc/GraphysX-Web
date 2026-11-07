import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry } from "three";

/** Physical-sized props, independent from the miniature race's coordinate system. */
export const BALLOON_GRIP_OFFSET = [0, 0, -0.085] as const;

export function makeGiantBalloon(): Group {
  const balloon = new Group();
  const latex = new MeshStandardMaterial({ color: "#adf245", roughness: 0.26, metalness: 0.08, emissive: "#3a6207", emissiveIntensity: 0.14 });
  const body = new Mesh(new SphereGeometry(0.0315, 20, 14), latex);
  body.scale.y = 1.13;
  const knot = new Mesh(new CylinderGeometry(0.004, 0.009, 0.018, 8), latex);
  knot.position.y = -0.042;
  balloon.add(body, knot);
  balloon.traverse((object) => { if (object instanceof Mesh) object.castShadow = true; });
  return balloon;
}

export function makeGiantGlove(): Group {
  const hand = new Group();
  const material = new MeshStandardMaterial({ color: "#388b82", roughness: 0.65 });
  const palm = new Mesh(new SphereGeometry(0.035, 12, 8), material);
  palm.scale.set(0.85, 0.6, 1.25); palm.position.set(0, -0.025, -0.025);
  hand.add(palm);
  for (let i = 0; i < 4; i++) {
    const finger = new Mesh(new SphereGeometry(0.011, 8, 6), material);
    finger.position.set(-0.025 + i * 0.016, -0.023, -0.07); finger.scale.z = 1.65;
    hand.add(finger);
  }
  const cuff = new Mesh(new TorusGeometry(0.026, 0.006, 6, 12), new MeshStandardMaterial({ color: "#e7f6d3", roughness: 0.8 }));
  cuff.position.z = 0.025; hand.add(cuff);
  hand.visible = false;
  return hand;
}

export function disposeGiantProp(prop: Group): void {
  const materials = new Set<MeshStandardMaterial>();
  prop.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material as MeshStandardMaterial);
    }
  });
  for (const material of materials) material.dispose();
}

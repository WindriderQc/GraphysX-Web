import * as THREE from "three";
import { cyberjobeSkinTexture, goldCircuitTexture } from "./textures";

/**
 * Cyberjobe as he appears in the finale (02:08-02:10): gold circuit suit, skin face with
 * gold streaks, glowing blue eyes, screaming mouth, arms spread. Faces +z; about 9 m tall.
 */
export class Cyberjobe {
  readonly root = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly mouth: THREE.Mesh;
  private readonly eyes: THREE.Mesh[] = [];
  private readonly arms: THREE.Group[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor() {
    const skin = this.keep(cyberjobeSkinTexture());
    const circuit = this.keep(goldCircuitTexture());
    circuit.repeat.set(2, 2);
    const suit = this.keep(new THREE.MeshStandardMaterial({ map: circuit, metalness: 0.55, roughness: 0.28, emissive: 0x5a3608, emissiveIntensity: 0.8 }));
    const face = this.keep(new THREE.MeshStandardMaterial({ map: skin, roughness: 0.55, metalness: 0.15 }));
    const dark = this.keep(new THREE.MeshStandardMaterial({ color: 0x2a0a08, roughness: 0.8 }));
    const eyeMat = this.keep(new THREE.MeshBasicMaterial({ color: 0x9fe4ff }));
    const teeth = this.keep(new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.4 }));

    const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh => {
      const mesh = new THREE.Mesh(this.keep(geometry), material);
      parent.add(mesh);
      return mesh;
    };

    // Torso and shoulders.
    const chest = add(this.root, new THREE.SphereGeometry(1, 24, 16), suit);
    chest.scale.set(3.4, 2.8, 1.8);
    chest.position.y = -1.6;
    const belly = add(this.root, new THREE.CylinderGeometry(2.2, 1.7, 3, 18), suit);
    belly.position.y = -4.6;
    const neck = add(this.root, new THREE.CylinderGeometry(0.8, 1.1, 1.4, 14), suit);
    neck.position.y = 1.2;

    // Arms spread wide, as he does when he takes the network.
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 3.1, -0.6, 0);
      const upper = add(arm, new THREE.CapsuleGeometry(0.62, 2.6, 6, 12), suit);
      upper.rotation.z = side * -Math.PI / 2;
      upper.position.x = side * 1.7;
      const fore = add(arm, new THREE.CapsuleGeometry(0.5, 2.2, 6, 12), suit);
      fore.position.set(side * 3.9, 1.1, 0.3);
      fore.rotation.z = side * -0.5;
      const hand = add(arm, new THREE.SphereGeometry(0.7, 12, 10), suit);
      hand.position.set(side * 4.6, 2.5, 0.4);
      hand.scale.set(0.8, 1.2, 0.5);
      this.root.add(arm);
      this.arms.push(arm);
    }

    // Head.
    this.head.position.y = 3.6;
    this.root.add(this.head);
    const skull = add(this.head, new THREE.SphereGeometry(2.2, 32, 24), face);
    skull.scale.set(0.86, 1.05, 0.95);
    const nose = add(this.head, new THREE.ConeGeometry(0.32, 0.9, 10), face);
    nose.position.set(0, -0.1, 2.05);
    nose.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const socket = add(this.head, new THREE.SphereGeometry(0.42, 14, 10), dark);
      socket.position.set(side * 0.72, 0.55, 1.78);
      socket.scale.set(1.1, 0.7, 0.5);
      const eye = add(this.head, new THREE.SphereGeometry(0.3, 14, 10), eyeMat);
      eye.position.set(side * 0.72, 0.55, 1.92);
      eye.scale.set(1.1, 0.6, 0.5);
      this.eyes.push(eye);
      const brow = add(this.head, new THREE.BoxGeometry(0.9, 0.18, 0.3), dark);
      brow.position.set(side * 0.72, 0.98, 1.86);
      brow.rotation.z = side * -0.25;
    }
    this.mouth = add(this.head, new THREE.SphereGeometry(0.62, 18, 12), dark);
    this.mouth.position.set(0, -0.95, 1.72);
    this.mouth.scale.set(1.15, 0.7, 0.5);
    const upperTeeth = add(this.head, new THREE.BoxGeometry(1.0, 0.16, 0.2), teeth);
    upperTeeth.position.set(0, -0.62, 1.95);
    this.mouth.userData.teeth = upperTeeth;
  }

  private keep<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  /** Scream and sway; `rage` 0..1 grows as the countdown runs out. */
  update(time: number, rage: number): void {
    const scream = 0.55 + 0.45 * Math.abs(Math.sin(time * (2 + rage * 4)));
    this.mouth.scale.y = 0.35 + scream * (0.6 + rage * 0.5);
    const teeth = this.mouth.userData.teeth as THREE.Mesh;
    teeth.position.y = -0.62 + (this.mouth.scale.y - 0.7) * 0.25;
    this.head.rotation.y = Math.sin(time * 0.7) * 0.25;
    this.head.rotation.z = Math.sin(time * 1.3) * 0.06 * (1 + rage);
    this.head.rotation.x = -0.1 + Math.sin(time * 0.9) * 0.08;
    const glow = 0.75 + 0.25 * Math.sin(time * 9) + rage * 0.4;
    for (const eye of this.eyes) {
      (eye.material as THREE.MeshBasicMaterial).color.setRGB(0.6 * glow, 0.9 * glow, 1.0);
    }
    this.arms.forEach((arm, i) => {
      arm.rotation.z = (i === 0 ? 1 : -1) * Math.sin(time * 1.1 + i) * 0.12;
    });
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}

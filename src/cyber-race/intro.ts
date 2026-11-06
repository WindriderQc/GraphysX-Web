import * as THREE from "three";
import { Cyberjobe } from "./cyberjobe";
import { makeHalo } from "./remaster";
import { hexTexture } from "./textures";
import { OPEN_RADIUS, type Track } from "./track";

/*
 * Race intro (between the menu and "3, 2, 1"): an energy curtain closes the line, Cyberjobe
 * appears behind it as a giant hologram, raises his hands and parts the curtain like two doors,
 * then fades into gold sparks while the countdown runs. A press skips it.
 *
 * Timeline (seconds): curtain lights 0-0.3, Cyberjobe appears 0.3-1.2, raises his hands
 * 1.2-2.0, opens the curtain 2.2-3.6, fades 3.9-4.8. The countdown numbers start at 3.8.
 */

/** Seconds of intro before the countdown numbers. */
export const INTRO_LENGTH = 3.8;
const END = 5;
/** Where Cyberjobe stands, metres down the line. */
const STAND = 45;

export type IntroCue = "appear" | "open" | "vanish";

const smooth = (a: number, b: number, t: number): number => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
/** Ease with a small overshoot, for the hologram popping in. */
const backOut = (x: number): number => {
  const c = 1.7;
  return x <= 0 ? 0 : x >= 1 ? 1 : 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

export class RaceIntro {
  readonly group = new THREE.Group();
  private readonly jobe = new Cyberjobe();
  private readonly holder = new THREE.Group();
  private readonly halves: THREE.Mesh[] = [];
  private readonly curtainMats: THREE.MeshBasicMaterial[] = [];
  private readonly halo: THREE.Sprite;
  private readonly radius: number;
  private readonly size: number;
  private readonly base = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private t = 0;
  private cues = new Set<IntroCue>();

  constructor(track: Track) {
    const tube = track.tubeAt(STAND);
    const bound = track.boundAt(STAND);
    // Fit him to the board: his arm span (about 16 m at size 1) stays inside the tube.
    this.size = Math.min(2, (2 * bound + 2) / 16);
    this.radius = tube > 0 ? tube + 0.5 : OPEN_RADIUS + 8;

    track.toWorld(STAND, 0, tube > 0 ? 0 : 2, this.base);
    track.upAt(STAND, this.up);
    this.jobe.root.position.copy(this.base);
    track.basis(STAND, this.jobe.root.quaternion);
    // He faces +z; turn him round to face the pilots.
    this.jobe.root.rotateY(Math.PI);
    this.jobe.root.scale.setScalar(0.001);
    this.group.add(this.jobe.root);

    this.halo = makeHalo(0xffc060, 34 * this.size, 1.2);
    this.keep(this.halo.material);
    this.keep(this.halo.material.map as THREE.Texture);
    track.toWorld(STAND + 4, 0, 0, this.halo.position);
    this.halo.material.opacity = 0;
    this.group.add(this.halo);

    // The curtain: two half discs of glowing hexes meeting on a bright seam.
    track.position(STAND - 2, this.holder.position);
    const t = track.tangent(STAND - 2, new THREE.Vector3());
    const u = track.upAt(STAND - 2, new THREE.Vector3());
    const r = track.rightAt(STAND - 2, new THREE.Vector3());
    this.holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, t.negate()));
    const hex = this.keep(hexTexture());
    hex.repeat.set(this.radius / 6, this.radius / 6);
    const seamMat = this.keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8f4ff).multiplyScalar(4), transparent: true, depthWrite: false }));
    this.curtainMats.push(seamMat);
    for (const side of [-1, 1]) {
      const mat = this.keep(
        new THREE.MeshBasicMaterial({
          map: hex,
          color: new THREE.Color(1.8, 1.25, 0.45),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      this.curtainMats.push(mat);
      const start = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      const half = new THREE.Mesh(this.keep(new THREE.CircleGeometry(this.radius, 48, start, Math.PI)), mat);
      const seam = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(0.25, this.radius * 2)), seamMat);
      seam.position.x = side * 0.12;
      half.add(seam);
      this.holder.add(half);
      this.halves.push(half);
    }
    this.group.add(this.holder);
  }

  private keep<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  /** Seconds since the intro began. */
  get time(): number {
    return this.t;
  }

  /** How far the curtain has opened (0..1). */
  get opened(): number {
    return smooth(2.2, 3.6, this.t);
  }

  get finished(): boolean {
    return this.t >= END;
  }

  /** Where sparks should burst for a cue. */
  get centre(): THREE.Vector3 {
    return this.jobe.root.position;
  }

  /** The player skipped: the curtain is open and he starts to fade. */
  skip(): void {
    if (this.t < INTRO_LENGTH) this.t = INTRO_LENGTH;
    this.cues.add("appear").add("open");
  }

  /** Advances the intro; returns the cues passed this step, for sound, voice and sparks. */
  update(dt: number, time: number): IntroCue[] {
    this.t += dt;
    const t = this.t;
    const passed: IntroCue[] = [];
    const cue = (name: IntroCue, at: number): void => {
      if (t >= at && !this.cues.has(name)) {
        this.cues.add(name);
        passed.push(name);
      }
    };
    cue("appear", 0.3);
    cue("open", 2.2);
    cue("vanish", 4.7);

    const appear = backOut(Math.min(1, Math.max(0, (t - 0.3) / 0.9)));
    const vanish = smooth(3.9, 4.8, t);
    const scale = Math.max(0.001, this.size * appear * (1 - vanish));
    this.jobe.root.scale.setScalar(scale);
    this.jobe.root.position.copy(this.base).addScaledVector(this.up, vanish * 10 * this.size);
    this.jobe.update(time, 0.2);
    this.jobe.pose(smooth(1.2, 2.0, t), smooth(2.2, 3.5, t));
    this.halo.material.opacity = Math.min(1, appear) * (1 - vanish) * (0.75 + 0.25 * Math.sin(time * 5));

    const open = this.opened;
    const glow = smooth(0, 0.3, t) * (1 - smooth(4, 4.8, t));
    this.halves.forEach((half, i) => {
      const side = i === 0 ? -1 : 1;
      half.position.x = side * open * this.radius * 1.15;
    });
    for (const [k, mat] of this.curtainMats.entries()) {
      // The hexes shimmer; the seam flares as the hands push through.
      mat.opacity = k === 0 ? glow * (1 - open) : glow * (0.55 + 0.15 * Math.sin(time * 7 + k)) * (1 - 0.5 * open);
    }
    return passed;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.jobe.dispose();
    for (const item of this.disposables) item.dispose();
  }
}

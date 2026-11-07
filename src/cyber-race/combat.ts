import * as THREE from "three";
import { makeHalo } from "./remaster";
import type { Track } from "./track";
import type { Obstacle, RaceWorld } from "./world";

/*
 * Light combat for "notre version" (docs/CYBER_RACE_NOTRE_VERSION.md). Rings fill pulse charges;
 * a pulse flies down the line, homes on the rival when it sits in the lock cone (the film's red
 * marks), slows it on impact, and breaks plates and mines on the way.
 */

export const MAX_CHARGES = 3;
/** Lock cone: the rival between these distances ahead, within this angle of the line. */
const LOCK_NEAR = 6;
const LOCK_FAR = 170;
const LOCK_ANGLE = 0.32;
const SHOT_SPEED = 95;
const SHOT_LIFE = 2.6;

/** What combat needs to know about a pilot. */
export interface Fighter {
  index: 0 | 1;
  s: number;
  ox: number;
  oy: number;
  speed: number;
  active: boolean;
  /** False once finished or destroyed. */
  flying: boolean;
}

interface Shot {
  owner: 0 | 1;
  target: 0 | 1 | null;
  s: number;
  ox: number;
  oy: number;
  speed: number;
  life: number;
  mesh: THREE.Group;
}

export type CombatEvent =
  | { type: "hit"; owner: 0 | 1; target: 0 | 1 }
  | { type: "break"; owner: 0 | 1; obstacle: Obstacle }
  | { type: "fire"; owner: 0 | 1; homing: boolean };

export class Combat {
  readonly group = new THREE.Group();
  enabled = false;
  readonly charges: [number, number] = [1, 1];
  /** Seconds each pilot has held the rival in its lock cone. */
  readonly lockTime: [number, number] = [0, 0];
  private readonly shots: Shot[] = [];
  private readonly cooldown: [number, number] = [0, 0];
  private readonly coreGeo = new THREE.SphereGeometry(0.32, 12, 8);
  private readonly streakGeo = new THREE.BoxGeometry(0.12, 0.12, 4);
  private readonly colors: [number, number];
  private readonly q = new THREE.Quaternion();

  constructor(colors: [number, number]) {
    this.colors = colors;
    this.streakGeo.translate(0, 0, 2);
  }

  reset(enabled: boolean): void {
    this.enabled = enabled;
    this.charges[0] = this.charges[1] = 1;
    this.lockTime[0] = this.lockTime[1] = 0;
    this.cooldown[0] = this.cooldown[1] = 0;
    for (const shot of this.shots) this.disposeShot(shot);
    this.shots.length = 0;
  }

  /** True when `other` sits in `me`'s lock cone. */
  locked(me: Fighter, other: Fighter): boolean {
    if (!this.enabled || !other.active || !other.flying) return false;
    const ahead = other.s - me.s;
    if (ahead < LOCK_NEAR || ahead > LOCK_FAR) return false;
    return Math.atan2(Math.hypot(other.ox - me.ox, other.oy - me.oy), ahead) < LOCK_ANGLE;
  }

  addCharge(index: 0 | 1): void {
    this.charges[index] = Math.min(MAX_CHARGES, this.charges[index] + 1);
  }

  /** Fires a pulse if a charge is ready; homes on the rival when locked. */
  fire(me: Fighter, other: Fighter): CombatEvent | null {
    if (!this.enabled || this.charges[me.index] <= 0 || this.cooldown[me.index] > 0 || !me.flying) return null;
    this.charges[me.index] -= 1;
    this.cooldown[me.index] = 0.35;
    const homing = this.locked(me, other);
    const mesh = new THREE.Group();
    const color = this.colors[me.index];
    const hot = new THREE.Color(color).multiplyScalar(4);
    const coreMat = new THREE.MeshBasicMaterial({ color: hot });
    const streakMat = new THREE.MeshBasicMaterial({ color: hot.clone().multiplyScalar(0.6), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    mesh.add(new THREE.Mesh(this.coreGeo, coreMat), new THREE.Mesh(this.streakGeo, streakMat), makeHalo(color, 3.2, 1.2));
    this.group.add(mesh);
    this.shots.push({ owner: me.index, target: homing ? other.index : null, s: me.s + 2.5, ox: me.ox, oy: me.oy - 0.2, speed: me.speed + SHOT_SPEED, life: SHOT_LIFE, mesh });
    return { type: "fire", owner: me.index, homing };
  }

  update(dt: number, track: Track, world: RaceWorld, fighters: [Fighter, Fighter]): CombatEvent[] {
    const events: CombatEvent[] = [];
    for (const i of [0, 1] as const) {
      this.cooldown[i] = Math.max(0, this.cooldown[i] - dt);
      this.lockTime[i] = this.locked(fighters[i], fighters[1 - i]) ? this.lockTime[i] + dt : 0;
    }
    for (let k = this.shots.length - 1; k >= 0; k -= 1) {
      const shot = this.shots[k];
      shot.life -= dt;
      const prevS = shot.s;
      shot.s += shot.speed * dt;
      let done = shot.life <= 0 || shot.s > track.raceLength + 40;
      if (shot.target !== null) {
        const t = fighters[shot.target];
        if (!t.flying) {
          shot.target = null;
        } else {
          // Steer across the line towards the target; the pulse always out-runs it.
          const k2 = 1 - Math.exp(-6 * dt);
          shot.ox += (t.ox - shot.ox) * k2;
          shot.oy += (t.oy - shot.oy) * k2;
          if (shot.s >= t.s - 0.5 && prevS < t.s + 2.5 && Math.hypot(t.ox - shot.ox, t.oy - shot.oy) < 2.2) {
            events.push({ type: "hit", owner: shot.owner, target: shot.target });
            done = true;
          }
        }
      }
      if (!done) {
        for (let i = world.firstObstacleFrom(prevS - 1); i < world.obstacles.length; i += 1) {
          const o = world.obstacles[i];
          if (o.s > shot.s + 1) break;
          if (!o.breakable || o.destroyed) continue;
          const hitIt =
            o.kind === "plate"
              ? prevS < o.s && shot.s >= o.s && (Math.hypot(shot.ox, shot.oy) < 0.9 || world.plateBlocks(o, shot.ox, shot.oy, world.time))
              : Math.hypot(shot.ox - o.ox, shot.oy - o.oy) < o.r + 0.9;
          if (hitIt) {
            world.breakObstacle(o);
            events.push({ type: "break", owner: shot.owner, obstacle: o });
            // A pulse that breaks a plate is spent; one that pops a mine flies on.
            if (o.kind === "plate") {
              done = true;
              break;
            }
          }
        }
      }
      if (done) {
        this.disposeShot(shot);
        this.shots.splice(k, 1);
        continue;
      }
      track.toWorld(shot.s, shot.ox, shot.oy, shot.mesh.position);
      track.basis(shot.s, this.q);
      // The streak trails behind: local +z of the line basis points forward.
      shot.mesh.quaternion.copy(this.q);
      shot.mesh.rotateY(Math.PI);
    }
    return events;
  }

  private disposeShot(shot: Shot): void {
    shot.mesh.removeFromParent();
    shot.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) (child.material as THREE.Material).dispose();
    });
  }
}

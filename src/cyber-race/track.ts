import * as THREE from "three";
import type { Rng } from "./textures";

export const OPEN_RADIUS = 14;

export type SectorKind = "tunnel" | "mines" | "shards" | "thorns" | "vortex";

export interface SectorInfo {
  name: string;
  /** Tube radius for enclosed sectors; 0 for open space. */
  tube: number;
  /** Course wiggle amplitude while laying out the line. */
  amp: number;
  /** Relative share of the course length. */
  weight: number;
  fog: number;
  fogColor: number;
  sky: "circuit" | "sunset";
}

export const SECTOR_INFO: Record<SectorKind, SectorInfo> = {
  tunnel: { name: "TUNNEL", tube: 9, amp: 16, weight: 1.1, fog: 0.0075, fogColor: 0x061416, sky: "circuit" },
  mines: { name: "CHAMP DE MINES", tube: 0, amp: 34, weight: 1, fog: 0.0055, fogColor: 0x061416, sky: "circuit" },
  shards: { name: "CRISTAUX", tube: 0, amp: 34, weight: 1, fog: 0.0042, fogColor: 0x061416, sky: "circuit" },
  thorns: { name: "TERRES HOSTILES", tube: 0, amp: 24, weight: 1, fog: 0.0032, fogColor: 0x5a2410, sky: "sunset" },
  vortex: { name: "VORTEX", tube: 11, amp: 14, weight: 1, fog: 0.0065, fogColor: 0x120626, sky: "circuit" }
};

/** The race the two boys play in the film, then the extended run. */
export const PLANS: Record<"film" | "extended", SectorKind[]> = {
  film: ["tunnel", "mines", "shards"],
  extended: ["tunnel", "mines", "shards", "thorns", "vortex"]
};

export interface Sector {
  index: number;
  kind: SectorKind;
  info: SectorInfo;
  start: number;
  /** End of the racing part; the last sector also covers the run-out after the line. */
  end: number;
}

/** Distance flown after the finish line before the course stops. */
export const RUN_OUT = 700;

/**
 * Race line: a smooth curve sampled every metre with parallel-transport frames,
 * so "up" never flips inside a tube. Lateral offsets (ox, oy) are measured
 * along `right` and `up` of the frame at distance s.
 */
export class Track {
  readonly raceLength: number;
  readonly totalLength: number;
  readonly sectors: Sector[];
  private readonly pos: Float32Array;
  private readonly tan: Float32Array;
  private readonly up: Float32Array;
  private readonly right: Float32Array;
  private readonly count: number;

  constructor(plan: SectorKind[], raceLength: number, rng: Rng) {
    this.raceLength = raceLength;
    const totalWeight = plan.reduce((sum, kind) => sum + SECTOR_INFO[kind].weight, 0);
    let start = 0;
    this.sectors = plan.map((kind, index) => {
      const info = SECTOR_INFO[kind];
      const end = index === plan.length - 1 ? raceLength : Math.round(start + (raceLength * info.weight) / totalWeight);
      const sector: Sector = { index, kind, info, start, end };
      start = end;
      return sector;
    });

    const spacing = 120;
    const n = Math.ceil((raceLength + RUN_OUT + 200) / spacing) + 3;
    const points: THREE.Vector3[] = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i += 1) {
      points.push(new THREE.Vector3(x, y, -i * spacing));
      if (i < 2) {
        continue;
      }
      // Use the sector of the next stretch so tube sectors stay gently curved.
      const info = this.sectorAt((i + 1) * spacing).info;
      const yScale = info.sky === "sunset" ? 0.25 : 0.6;
      x = x * 0.85 + (rng() * 2 - 1) * info.amp;
      y = y * 0.85 + (rng() * 2 - 1) * info.amp * yScale;
    }
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    curve.arcLengthDivisions = n * 40;
    const length = curve.getLength();
    this.totalLength = Math.floor(length) - 2;
    this.count = this.totalLength + 1;
    this.pos = new Float32Array(this.count * 3);
    this.tan = new Float32Array(this.count * 3);
    this.up = new Float32Array(this.count * 3);
    this.right = new Float32Array(this.count * 3);

    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    const u = new THREE.Vector3(0, 1, 0);
    const r = new THREE.Vector3();
    for (let i = 0; i < this.count; i += 1) {
      const k = Math.min(1, i / length);
      curve.getPointAt(k, p);
      curve.getTangentAt(k, t).normalize();
      u.addScaledVector(t, -t.dot(u)).normalize();
      r.crossVectors(t, u).normalize();
      p.toArray(this.pos, i * 3);
      t.toArray(this.tan, i * 3);
      u.toArray(this.up, i * 3);
      r.toArray(this.right, i * 3);
    }
  }

  sectorAt(s: number): Sector {
    for (const sector of this.sectors) {
      if (s < sector.end) {
        return sector;
      }
    }
    return this.sectors[this.sectors.length - 1];
  }

  /** End of a sector including the run-out for the last one. */
  sectorTail(sector: Sector): number {
    return sector.index === this.sectors.length - 1 ? this.totalLength : sector.end;
  }

  /** Tube radius at s (0 in open space). Tubes reach 2 m past their end for the exit. */
  tubeAt(s: number): number {
    const here = this.sectorAt(s);
    if (here.info.tube > 0) {
      return here.info.tube;
    }
    const before = this.sectorAt(s - 2);
    return before.info.tube;
  }

  /** How far from the line a pilot may fly at s. */
  boundAt(s: number): number {
    const tube = this.tubeAt(s);
    return tube > 0 ? tube - 1.4 : OPEN_RADIUS;
  }

  private sample(arr: Float32Array, s: number, out: THREE.Vector3): THREE.Vector3 {
    const c = Math.min(Math.max(s, 0), this.count - 1.001);
    const i = Math.floor(c);
    const f = c - i;
    const a = i * 3;
    const b = a + 3;
    out.set(
      arr[a] + (arr[b] - arr[a]) * f,
      arr[a + 1] + (arr[b + 1] - arr[a + 1]) * f,
      arr[a + 2] + (arr[b + 2] - arr[a + 2]) * f
    );
    return out;
  }

  /** Point on the line; extrapolated straight before the start. */
  position(s: number, out: THREE.Vector3): THREE.Vector3 {
    this.sample(this.pos, s, out);
    if (s < 0) {
      const t = this.sample(this.tan, 0, _tmp);
      out.addScaledVector(t, s);
    }
    return out;
  }

  tangent(s: number, out: THREE.Vector3): THREE.Vector3 {
    return this.sample(this.tan, s, out).normalize();
  }

  upAt(s: number, out: THREE.Vector3): THREE.Vector3 {
    return this.sample(this.up, s, out).normalize();
  }

  rightAt(s: number, out: THREE.Vector3): THREE.Vector3 {
    return this.sample(this.right, s, out).normalize();
  }

  toWorld(s: number, ox: number, oy: number, out: THREE.Vector3): THREE.Vector3 {
    this.position(s, out);
    out.addScaledVector(this.rightAt(s, _tmpR), ox);
    out.addScaledVector(this.upAt(s, _tmpU), oy);
    return out;
  }

  /** Orientation whose +z follows the line, +y its up vector. */
  basis(s: number, out: THREE.Quaternion): THREE.Quaternion {
    const t = this.tangent(s, _tmpT);
    const u = this.upAt(s, _tmpU);
    const x = _tmpR.crossVectors(u, t).normalize();
    _mat.makeBasis(x, u, t);
    return out.setFromRotationMatrix(_mat);
  }
}

const _tmp = new THREE.Vector3();
const _tmpR = new THREE.Vector3();
const _tmpU = new THREE.Vector3();
const _tmpT = new THREE.Vector3();
const _mat = new THREE.Matrix4();

/** Curve view of a section of the track, for TubeGeometry. */
export class TrackSlice extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly track: Track,
    private readonly s0: number,
    private readonly s1: number
  ) {
    super();
  }

  override getPoint(u: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.track.position(this.s0 + (this.s1 - this.s0) * u, target);
  }
}

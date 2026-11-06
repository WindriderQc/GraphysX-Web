import * as THREE from "three";
import type { Rng } from "./textures";

export const OPEN_RADIUS = 14;

export type SectorKind = "tunnel" | "mines" | "shards" | "thorns" | "kaleido" | "wave" | "network" | "furnace" | "vortex" | "hypertube";

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
  sky: "circuit" | "sunset" | "hexdots" | "furnace" | "nebula" | "none";
  /** Keep the line nearly level (boards with a floor). */
  flat: boolean;
  /** Board invented in the film's style rather than taken from a scene. */
  inspired?: boolean;
  /** "Notre version" board: remastered look and light combat. */
  remaster?: boolean;
  /** The board places its own rings and finish gate (the Hypertube). */
  ownRings?: boolean;
  /** Live obstacle density along the board (u = 0..1), around 1 on average. Unset: even. */
  rhythm?: (u: number) => number;
  /** Designed length in metres at the NORMAL course (scaled by the course setting). */
  length?: number;
  /** Tube radius multiplier along the board (u = 0 at its start, 1 at its end). */
  profile?: (u: number) => number;
  /** Phases announced on the HUD as a pilot reaches each share of the board. */
  phases?: Array<{ u: number; name: string; alert?: boolean; voice?: string; rumble?: boolean }>;
}

const smooth = (a: number, b: number, u: number): number => {
  const x = Math.min(1, Math.max(0, (u - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/**
 * Hypertube radius (base 10 m): a wide launch bay narrowing into the tube, widening for the
 * split, tightening through the collapse, then flaring at the exit.
 */
export function hypertubeProfile(u: number): number {
  let r = 2.4 - 1.4 * smooth(0.02, 0.08, u);
  r += 0.4 * smooth(0.4, 0.43, u);
  r -= 0.6 * smooth(0.66, 0.8, u);
  r += 1.0 * smooth(0.93, 1, u);
  return r;
}

export const SECTOR_INFO: Record<SectorKind, SectorInfo> = {
  tunnel: { name: "TUNNEL", tube: 9, amp: 16, weight: 1.1, fog: 0.0075, fogColor: 0x061416, sky: "circuit", flat: false },
  mines: { name: "CHAMP DE MINES", tube: 0, amp: 34, weight: 1, fog: 0.0055, fogColor: 0x061416, sky: "circuit", flat: false },
  shards: { name: "CRISTAUX", tube: 0, amp: 34, weight: 1, fog: 0.0042, fogColor: 0x061416, sky: "circuit", flat: false },
  thorns: { name: "TERRES HOSTILES", tube: 0, amp: 24, weight: 1, fog: 0.0032, fogColor: 0x5a2410, sky: "sunset", flat: true },
  // Jobe's acceleration (01:00:20-01:02:40): a spiral of ornate tiles, no solid wall.
  kaleido: { name: "KALÉIDOSCOPE", tube: 11, amp: 14, weight: 1, fog: 0.006, fogColor: 0x10061c, sky: "none", flat: false },
  // Jobe reaching into the network (01:14): golden waves over the electric globe.
  wave: { name: "VAGUE D'OR", tube: 0, amp: 22, weight: 1, fog: 0.0026, fogColor: 0x1a0830, sky: "hexdots", flat: true },
  // Inspired by "NETWORK ACCESS GRANTED" (01:57:40): a square data corridor with firewalls.
  network: { name: "RÉSEAU", tube: 9.8, amp: 12, weight: 1, fog: 0.007, fogColor: 0x02121c, sky: "none", flat: false, inspired: true },
  // Inspired by Jobe's fire (01:35:20): eruptions over a distant lava sea.
  furnace: { name: "FOURNAISE", tube: 0, amp: 22, weight: 1, fog: 0.004, fogColor: 0x5a1a04, sky: "furnace", flat: true, inspired: true },
  vortex: { name: "VORTEX", tube: 11, amp: 14, weight: 1, fog: 0.0065, fogColor: 0x120626, sky: "circuit", flat: false },
  // Notre version: the film's green tunnel reimagined (docs/CYBER_RACE_NOTRE_VERSION.md).
  hypertube: {
    name: "HYPERTUBE",
    tube: 10,
    amp: 12,
    weight: 1,
    fog: 0.0042,
    fogColor: 0x02100c,
    sky: "none",
    flat: false,
    remaster: true,
    ownRings: true,
    length: 2800,
    profile: hypertubeProfile,
    phases: [
      { u: 0.4, name: "BIFURCATION" },
      { u: 0.66, name: "EFFONDREMENT", alert: true, voice: "Warning. Structure collapse.", rumble: true },
      { u: 0.92, name: "SORTIE" }
    ]
  }
};

/** Highest value a rhythm curve reaches (placement samples against it). */
export const RHYTHM_MAX = 2;

/**
 * Density along a lengthened notre version board: a calm entry, a build, a short breather,
 * the peak, then a clear exit into the next board.
 */
export function boardRhythm(u: number): number {
  let d = 0.35 + 0.65 * smooth(0.1, 0.3, u);
  d -= 0.55 * (smooth(0.5, 0.53, u) - smooth(0.57, 0.6, u));
  d += 0.6 * smooth(0.58, 0.66, u);
  d -= 1.4 * smooth(0.9, 0.97, u);
  return Math.max(0.15, d);
}

/** The 90-second finale: two waves, each ending in a breather, then the last sprint. */
export function finaleRhythm(u: number): number {
  let d = 0.35 + 0.65 * smooth(0.05, 0.2, u);
  d -= 0.5 * (smooth(0.4, 0.43, u) - smooth(0.47, 0.5, u));
  d += 0.4 * smooth(0.5, 0.6, u);
  d -= 0.6 * (smooth(0.68, 0.7, u) - smooth(0.72, 0.74, u));
  d += 0.5 * smooth(0.74, 0.85, u);
  d -= 1.6 * smooth(0.95, 0.99, u);
  return Math.max(0.15, d);
}

/**
 * Notre version of the film's boards: 30-45 s each at NORMAL (90 s for the finale), with
 * announced phases and a rhythm. The film plans keep the boards exactly as they were.
 * Lengths are metres at the NORMAL course, measured against the autopilot's pace.
 */
const NOTRE_VERSION: Partial<Record<SectorKind, Partial<SectorInfo>>> = {
  // Magnetic field: the mine field under a nebula, mines drifting towards the pilots.
  mines: {
    length: 3000,
    sky: "nebula",
    // Violet fog matching the nebula, so far mines fade into it instead of standing out black.
    fog: 0.0036,
    fogColor: 0x24164a,
    phases: [
      { u: 0.3, name: "ESSAIM" },
      { u: 0.6, name: "TEMPÊTE DE MINES", alert: true, voice: "Warning. Mine storm." }
    ]
  },
  shards: { length: 2600, phases: [{ u: 0.3, name: "AVERSE" }, { u: 0.6, name: "TEMPÊTE DE CRISTAUX" }] },
  thorns: { length: 2900, phases: [{ u: 0.3, name: "CANYON" }, { u: 0.6, name: "FORÊT D'ÉPINES" }] },
  kaleido: { length: 2650, phases: [{ u: 0.3, name: "ACCÉLÉRATION" }, { u: 0.6, name: "HYPNOSE" }] },
  wave: { length: 2300, phases: [{ u: 0.3, name: "HOULE" }, { u: 0.6, name: "DÉFERLANTE" }] },
  network: {
    length: 2500,
    phases: [
      { u: 0.3, name: "INTRUSION" },
      { u: 0.6, name: "PARE-FEU", alert: true, voice: "Warning. Firewall." }
    ]
  },
  furnace: {
    length: 3000,
    phases: [
      { u: 0.3, name: "ÉRUPTION" },
      { u: 0.6, name: "MER DE FEU", alert: true, voice: "Warning. Heat critical." }
    ]
  },
  vortex: {
    length: 5500,
    rhythm: finaleRhythm,
    phases: [
      { u: 0.2, name: "TOURBILLON" },
      { u: 0.5, name: "ŒIL DU VORTEX" },
      { u: 0.74, name: "EFFONDREMENT", alert: true, voice: "Warning. Vortex collapse." },
      { u: 0.92, name: "DERNIER SPRINT" }
    ]
  }
};

/** A board as raced: the film's version, or notre version when `notre` is set. */
export function boardInfo(kind: SectorKind, notre: boolean): SectorInfo {
  const base = SECTOR_INFO[kind];
  const ours = NOTRE_VERSION[kind];
  if (!notre || !ours) return base;
  return { ...base, remaster: true, rhythm: boardRhythm, ...ours };
}

/** The race the two boys play in the film, then the extended run. */
export const PLANS: Record<"film" | "extended" | "ultimate" | "remaster", SectorKind[]> = {
  film: ["tunnel", "mines", "shards"],
  extended: ["tunnel", "mines", "shards", "thorns", "kaleido", "wave", "vortex"],
  // The film's boards stay intact; inspired boards continue the theme before the finale.
  ultimate: ["tunnel", "mines", "shards", "thorns", "kaleido", "wave", "network", "furnace", "vortex"],
  // Notre version: the Hypertube opens, every board runs 30-45 s, the vortex closes in 90 s.
  remaster: ["hypertube", "mines", "shards", "thorns", "kaleido", "wave", "network", "furnace", "vortex"]
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

  /**
   * `lengths`, when given, sets each board's length; otherwise boards share `raceLength` by weight.
   * `notre` races notre version of each board (see boardInfo).
   */
  constructor(plan: SectorKind[], raceLength: number, rng: Rng, lengths?: number[], notre = false) {
    this.raceLength = raceLength;
    const totalWeight = plan.reduce((sum, kind) => sum + SECTOR_INFO[kind].weight, 0);
    let start = 0;
    this.sectors = plan.map((kind, index) => {
      const info = boardInfo(kind, notre);
      const share = lengths ? lengths[index] : (raceLength * info.weight) / totalWeight;
      const end = index === plan.length - 1 ? raceLength : Math.round(start + share);
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
      const yScale = info.flat ? 0.25 : 0.6;
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
      return here.info.tube * this.profileAt(here, s);
    }
    const before = this.sectorAt(s - 2);
    return before.info.tube * this.profileAt(before, s);
  }

  /** Radius multiplier of a board's tube at s (1 for constant tubes). */
  profileAt(sector: Sector, s: number): number {
    if (!sector.info.profile) return 1;
    return sector.info.profile(Math.min(1, Math.max(0, (s - sector.start) / Math.max(1, sector.end - sector.start))));
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

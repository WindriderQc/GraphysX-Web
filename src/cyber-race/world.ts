import * as THREE from "three";
import {
  createHexGeometry,
  createLogGeometry,
  createMineGeometry,
  createShardGeometry,
  createUrchinGeometry
} from "./models";
import { Cyberjobe } from "./cyberjobe";
import { OPEN_RADIUS, Track, TrackSlice, type Sector } from "./track";
import {
  bandTexture,
  checkerTexture,
  circuitTexture,
  furnaceSkyTexture,
  goldGridTexture,
  hexDotsTexture,
  lavaTexture,
  networkTexture,
  hexTexture,
  lightningTexture,
  ornateTileTexture,
  rivetedMetalTexture,
  sunsetTexture,
  swirlTexture,
  tunnelTexture,
  type Rng
} from "./textures";

export type ObstacleKind =
  | "plate"
  | "mine"
  | "shard"
  | "urchin"
  | "log"
  | "hex"
  | "beam"
  | "orb"
  | "porthole"
  | "blades"
  | "slot"
  | "firewall"
  | "geyser"
  | "rock";

/** Half-size of a pilot measured across a direction at `angle`, given its roll (wings along roll). */
export function pilotExtent(roll: number, angle: number): number {
  return 0.5 + 1.9 * Math.abs(Math.cos(roll - angle));
}

/** One ring of the kaleidoscope spiral, re-posed every frame near the pilots. */
interface TileRing {
  s: number;
  first: number;
  centre: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  direction: number;
}

/** A hex tile thrown by Cyberjobe, flying back down the tube towards the pilots. */
export interface Projectile {
  s: number;
  ox: number;
  oy: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startS: number;
  r: number;
  mesh: THREE.Mesh;
}

/** The golden sheet: rows of vertices re-heighted every frame near the pilots. */
interface WaveSheet {
  sector: Sector;
  geometry: THREE.BufferGeometry;
  rows: Array<{ s: number; centre: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 }>;
  columns: number[];
}

export interface Obstacle {
  kind: ObstacleKind;
  s: number;
  /** Lateral centre (spheres) or the point of the log line closest to the axis. */
  ox: number;
  oy: number;
  /** Collision radius (spheres). */
  r: number;
  /** Plates: sector start angle. Logs: direction of the log in the cross-section. */
  angle: number;
  /** Plates: opening of the blocking sector. */
  span: number;
  /** Plates: angular speed. */
  spin: number;
  /** Portholes: hole radius. Blades: widest half-gap. Slots: half-gap. */
  gap?: number;
  /** Blades: phase of the closing cycle. */
  phase?: number;
  mesh?: THREE.Object3D;
  /** Blades: the two moving slabs. */
  parts?: THREE.Object3D[];
}

export interface Ring {
  s: number;
  ox: number;
  oy: number;
  r: number;
  mesh: THREE.Mesh;
  flash: number;
  taken: [boolean, boolean];
}

export interface Difficulty {
  /** Obstacles per 100 m. */
  density: number;
  plateSpan: number;
  plateSpin: number;
}

interface Spinner {
  mesh: THREE.InstancedMesh;
  index: number;
  position: THREE.Vector3;
  base: THREE.Quaternion;
  axis: THREE.Vector3;
  speed: number;
  scale: number;
}

const TAU = Math.PI * 2;
const wrapAngle = (a: number): number => ((a % TAU) + TAU) % TAU;
const countBits = (mask: number): number => {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n += 1;
  return n;
};
const PILOT_RADIUS = 0.9;
const LOG_RADIUS = 0.85;
/** Distance past the finish line where Cyberjobe stands. */
export const CYBERJOBE_AHEAD = 46;

/** Points for clearing a set piece, read off the film's score counter (00:41:12-00:41:24). */
export const GATE_BONUS: Partial<Record<ObstacleKind, number>> = {
  porthole: 400,
  slot: 500,
  firewall: 450,
  blades: 450,
  log: 250,
  beam: 300,
  plate: 200
};

/** Everything that makes up one course; disposed between races. */
export class RaceWorld {
  readonly group = new THREE.Group();
  readonly obstacles: Obstacle[] = [];
  readonly rings: Ring[] = [];
  private readonly spinners: Spinner[] = [];
  private readonly plates: Obstacle[] = [];
  private readonly swirls: THREE.Mesh[] = [];
  private readonly scrolling: THREE.Texture[] = [];
  private readonly beams: Obstacle[] = [];
  private readonly orbs: THREE.Mesh[] = [];
  private readonly sigils: THREE.Object3D[] = [];
  private tileMesh: THREE.InstancedMesh | null = null;
  private readonly tileRings: TileRing[] = [];
  private wave: WaveSheet | null = null;
  /** Finale boss standing past the line when the run ends in the vortex. */
  cyberjobe: Cyberjobe | null = null;
  /** How strongly Cyberjobe rages (0..1), driven by the countdown. */
  rage = 0;
  /** Live projectiles thrown by Cyberjobe. */
  readonly projectiles: Projectile[] = [];
  private projectileGeo: THREE.BufferGeometry | null = null;
  private projectileMat: THREE.Material | null = null;
  private throwTimer = 0;
  private bossS = 0;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpQ2 = new THREE.Quaternion();
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpS = new THREE.Vector3();

  constructor(
    readonly track: Track,
    private readonly difficulty: Difficulty,
    private readonly rng: Rng
  ) {
    for (const sector of track.sectors) {
      switch (sector.kind) {
        case "tunnel":
          this.buildTunnel(sector);
          break;
        case "mines":
          this.buildMines(sector);
          break;
        case "shards":
          this.buildShards(sector);
          break;
        case "thorns":
          this.buildThorns(sector);
          break;
        case "kaleido":
          this.buildKaleido(sector);
          break;
        case "wave":
          this.buildWave(sector);
          break;
        case "network":
          this.buildNetwork(sector);
          break;
        case "furnace":
          this.buildFurnace(sector);
          break;
        case "vortex":
          this.buildVortex(sector);
          break;
      }
    }
    this.buildRings();
    this.buildFinish();
    this.obstacles.sort((a, b) => a.s - b.s);
    this.rings.sort((a, b) => a.s - b.s);
  }

  // ------------------------------------------------------------ helpers
  private keep<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private placeOnTrack(object: THREE.Object3D, s: number, ox: number, oy: number): void {
    this.track.toWorld(s, ox, oy, object.position);
    this.track.basis(s, object.quaternion);
  }

  /** Live obstacle count for a stretch, scaled by difficulty. */
  private liveCount(length: number, factor = 2.2): number {
    return Math.max(1, Math.round((length / 100) * this.difficulty.density * factor));
  }

  private randomLateral(maxR: number, centerBias: number): [number, number] {
    const a = this.rng() * TAU;
    const r = maxR * Math.pow(this.rng(), centerBias);
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  private makeInstanced(
    geometry: THREE.BufferGeometry,
    materials: THREE.Material | THREE.Material[],
    count: number
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, materials, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  private addSpinner(
    mesh: THREE.InstancedMesh,
    index: number,
    s: number,
    ox: number,
    oy: number,
    scale: number,
    speed: number
  ): void {
    const position = this.track.toWorld(s, ox, oy, new THREE.Vector3());
    const base = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.rng() * TAU, this.rng() * TAU, this.rng() * TAU));
    const axis = new THREE.Vector3(this.rng() - 0.5, this.rng() - 0.5, this.rng() - 0.5).normalize();
    const spinner: Spinner = { mesh, index, position, base, axis, speed, scale };
    this.spinners.push(spinner);
    this.applySpinner(spinner, 0);
  }

  private applySpinner(sp: Spinner, time: number): void {
    this.tmpQ2.setFromAxisAngle(sp.axis, time * sp.speed);
    this.tmpQ.copy(sp.base).premultiply(this.tmpQ2);
    this.tmpS.setScalar(sp.scale);
    this.tmpM.compose(sp.position, this.tmpQ, this.tmpS);
    sp.mesh.setMatrixAt(sp.index, this.tmpM);
  }

  /** Tube along a sector, seen from inside. */
  private buildTube(sector: Sector, radius: number, radial: number, texture: THREE.Texture, emissive: number, glow: number): void {
    const s0 = sector.index === 0 ? -60 : sector.start;
    const s1 = this.track.sectorTail(sector) + 4;
    const geometry = this.keep(new THREE.TubeGeometry(new TrackSlice(this.track, s0, s1), Math.ceil((s1 - s0) / 2.5), radius, radial, false));
    const material = this.keep(
      new THREE.MeshStandardMaterial({
        map: texture,
        side: THREE.BackSide,
        flatShading: true,
        roughness: 0.65,
        metalness: 0.1,
        emissive,
        emissiveMap: texture,
        emissiveIntensity: glow
      })
    );
    this.group.add(new THREE.Mesh(geometry, material));
  }

  private addBand(s: number, radius: number, width: number): void {
    const geo = this.keep(new THREE.CylinderGeometry(radius, radius, width, 12, 1, true));
    geo.rotateX(Math.PI / 2);
    const mat = this.keep(new THREE.MeshBasicMaterial({ map: this.keep(checkerTexture(12, 1)), side: THREE.DoubleSide }));
    const band = new THREE.Mesh(geo, mat);
    this.placeOnTrack(band, s, 0, 0);
    this.group.add(band);
  }

  // ------------------------------------------------------------ sector 1: green tunnel
  private buildTunnel(sector: Sector): void {
    const radius = sector.info.tube;
    const texture = this.keep(tunnelTexture());
    const s0 = sector.index === 0 ? -60 : sector.start;
    texture.repeat.set((this.track.sectorTail(sector) + 4 - s0) / 16, 3);
    this.buildTube(sector, radius, 12, texture, 0x0f3a16, 0.55);
    if (sector.index === 0) {
      this.addBand(0, radius - 0.05, 3);
    }

    const next = this.track.sectors[sector.index + 1];
    if (next && next.info.tube === 0) {
      // Exit funnel (00:40:58): the tube ends inside a cone of tan panels that flares
      // forward into the mine field, rimmed with red segments.
      const twoTone = (geo: THREE.BufferGeometry, a: number, b: number): THREE.BufferGeometry => {
        const colors: number[] = [];
        const ca = new THREE.Color(a);
        const cb = new THREE.Color(b);
        const count = geo.getAttribute("position").count;
        for (let i = 0; i < count; i += 1) {
          const c = Math.floor(i / 6) % 2 === 0 ? ca : cb;
          colors.push(c.r, c.g, c.b);
        }
        geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        return geo;
      };
      const flare = radius * 3.6;
      const funnelGeo = this.keep(twoTone(new THREE.CylinderGeometry(flare, radius, 16, 12, 1, true).toNonIndexed(), 0xd8b98a, 0xb8946a));
      funnelGeo.rotateX(Math.PI / 2);
      const rimGeo = this.keep(twoTone(new THREE.CylinderGeometry(flare + 0.4, flare + 0.4, 2.6, 12, 1, true).toNonIndexed(), 0xc8283c, 0x6a1420));
      rimGeo.rotateX(Math.PI / 2);
      rimGeo.translate(0, 0, 8);
      const funnelMat = this.keep(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true, roughness: 0.5 }));
      const funnel = new THREE.Mesh(funnelGeo, funnelMat);
      funnel.add(new THREE.Mesh(rimGeo, funnelMat));
      this.placeOnTrack(funnel, sector.end + 8, 0, 0);
      this.group.add(funnel);
    }

    // Rotating riveted sector plates.
    const metal = this.keep(rivetedMetalTexture());
    const plateMat = this.keep(
      new THREE.MeshStandardMaterial({
        map: metal,
        color: 0xffb0e0,
        emissive: 0x6a0848,
        emissiveIntensity: 0.6,
        side: THREE.DoubleSide,
        metalness: 0.5,
        roughness: 0.35
      })
    );
    const edgeMat = this.keep(new THREE.MeshBasicMaterial({ color: 0xff4fd0 }));
    const step = 100 / this.difficulty.density;
    let s = sector.start + 160;
    while (s < sector.end - 80) {
      const span = Math.PI * this.difficulty.plateSpan * (0.75 + this.rng() * 0.5);
      const spin = (this.rng() * 2 - 1) * this.difficulty.plateSpin;
      const plate: Obstacle = { kind: "plate", s, ox: 0, oy: 0, r: 0, angle: this.rng() * TAU, span, spin };
      const holder = new THREE.Group();
      this.track.position(s, holder.position);
      const t = this.track.tangent(s, new THREE.Vector3());
      const u = this.track.upAt(s, new THREE.Vector3());
      const r = this.track.rightAt(s, new THREE.Vector3());
      holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, t.clone().negate()));
      const spinner = new THREE.Group();
      const disc = new THREE.Mesh(this.keep(new THREE.CircleGeometry(radius - 0.1, 24, 0, span)), plateMat);
      const edge = new THREE.Mesh(this.keep(new THREE.RingGeometry(radius - 0.6, radius - 0.1, 24, 1, 0, span)), edgeMat);
      edge.position.z = 0.05;
      const hub = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.7, 0.7, 0.6, 12)), edgeMat);
      hub.rotation.x = Math.PI / 2;
      spinner.add(disc, edge, hub);
      holder.add(spinner);
      plate.mesh = spinner;
      this.group.add(holder);
      this.obstacles.push(plate);
      this.plates.push(plate);
      s += step * (1.4 + this.rng() * 1.2);
    }
  }

  // ------------------------------------------------------------ sector 2: spiked mines
  private buildMines(sector: Sector): void {
    const s0 = sector.start + 30;
    const s1 = sector.end;
    const metal = this.keep(rivetedMetalTexture());
    const body = this.keep(
      new THREE.MeshStandardMaterial({ map: metal, metalness: 0.25, roughness: 0.45, flatShading: true, emissive: 0x1c2a30 })
    );
    const spikes = this.keep(
      new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0x6a4a00, metalness: 0.4, roughness: 0.3, flatShading: true })
    );
    const geometry = this.keep(createMineGeometry());
    const live = this.liveCount(s1 - s0);
    const decor = 260;
    const mesh = this.makeInstanced(geometry, [body, spikes], live + decor + 1);
    // A big mine waits just outside the tunnel mouth (00:40:58).
    this.obstacles.push({ kind: "mine", s: sector.start + 26, ox: 6.5, oy: 2.5, r: 3.6, angle: 0, span: 0, spin: 0 });
    this.addSpinner(mesh, live + decor, sector.start + 26, 6.5, 2.5, 3.6, 0.35);
    let index = 0;
    for (let i = 0; i < live; i += 1) {
      const s = s0 + this.rng() * (s1 - s0);
      const [ox, oy] = this.randomLateral(OPEN_RADIUS - 1, 0.8);
      const r = 1.3 + this.rng() * 1.6;
      this.obstacles.push({ kind: "mine", s, ox, oy, r, angle: 0, span: 0, spin: 0 });
      this.addSpinner(mesh, index, s, ox, oy, r, 0.4 + this.rng() * 0.9);
      index += 1;
    }
    for (let i = 0; i < decor; i += 1) {
      const s = s0 - 60 + this.rng() * (s1 - s0 + 160);
      const a = this.rng() * TAU;
      const rr = 22 + this.rng() * 110;
      this.addSpinner(mesh, index, s, Math.cos(a) * rr, Math.sin(a) * rr, 2 + this.rng() * 8, 0.1 + this.rng() * 0.4);
      index += 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ sector 3: triangle shards
  private buildShards(sector: Sector): void {
    const s0 = sector.start + 20;
    const tail = this.track.sectorTail(sector);
    const liveEnd = Math.min(sector.end, this.track.raceLength - 40);
    const decorEnd = Math.min(tail, sector.end + 120);
    const metal = this.keep(rivetedMetalTexture());
    const mat = this.keep(
      new THREE.MeshStandardMaterial({ map: metal, color: 0xeafcff, metalness: 0.2, roughness: 0.4, flatShading: true, emissive: 0x2a4448 })
    );
    const geometry = this.keep(createShardGeometry());
    const live = this.liveCount(liveEnd - s0);
    const decor = 520;
    const mesh = this.makeInstanced(geometry, mat, live + decor);
    let index = 0;
    for (let i = 0; i < live; i += 1) {
      const s = s0 + this.rng() * (liveEnd - s0);
      const [ox, oy] = this.randomLateral(OPEN_RADIUS - 1, 0.8);
      const r = 1.2 + this.rng() * 1.4;
      this.obstacles.push({ kind: "shard", s, ox, oy, r, angle: 0, span: 0, spin: 0 });
      this.addSpinner(mesh, index, s, ox, oy, r, 0.3 + this.rng() * 0.6);
      index += 1;
    }
    for (let i = 0; i < decor; i += 1) {
      const s = s0 - 40 + this.rng() * (decorEnd - s0 + 40);
      const a = this.rng() * TAU;
      const rr = 18 + this.rng() * 130;
      this.addSpinner(mesh, index, s, Math.cos(a) * rr, Math.sin(a) * rr * 0.7, 3 + this.rng() * 14, 0.02 + this.rng() * 0.1);
      index += 1;
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Floating red / tan strips.
    const bands = this.keep(bandTexture());
    const stripMat = this.keep(new THREE.MeshStandardMaterial({ map: bands, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }));
    const stripGeo = this.keep(new THREE.BoxGeometry(7, 0.5, 90));
    for (let i = 0; i < 26; i += 1) {
      const s = s0 + this.rng() * (decorEnd - s0);
      const side = this.rng() < 0.5 ? -1 : 1;
      const strip = new THREE.Mesh(stripGeo, stripMat);
      this.placeOnTrack(strip, s, side * (20 + this.rng() * 30), (this.rng() * 2 - 1) * 25);
      strip.rotateZ((this.rng() * 2 - 1) * 0.9);
      strip.rotateY((this.rng() * 2 - 1) * 0.35);
      this.group.add(strip);
    }

    // Red / tan bars sweeping across the line as the shards begin (00:41:07-00:41:12),
    // and one long riveted beam later on (00:41:19): pass above or below.
    const span = OPEN_RADIUS * 2 + 16;
    const barGeo = this.keep(new THREE.BoxGeometry(span, 1.5, 2.6));
    const beamGeo = this.keep(new THREE.BoxGeometry(span, 2.2, 2.2));
    const beamMat = this.keep(new THREE.MeshStandardMaterial({ map: metal, color: 0xdcecf0, metalness: 0.35, roughness: 0.4, emissive: 0x1c3034 }));
    const crossBar = (s: number, angle: number, offset: number, geo: THREE.BufferGeometry, material: THREE.Material): void => {
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const bar = new THREE.Mesh(geo, material);
      this.placeOnTrack(bar, s, nx * offset, ny * offset);
      bar.rotateZ(-angle);
      this.group.add(bar);
      this.obstacles.push({ kind: "log", s, ox: nx * offset, oy: ny * offset, r: LOG_RADIUS, angle, span: 0, spin: 0, mesh: bar });
    };
    crossBar(sector.start + 30, 0.45, 3, barGeo, stripMat);
    crossBar(sector.start + 52, -0.35, -2, barGeo, stripMat);
    crossBar(sector.start + 74, 0.2, 5, barGeo, stripMat);
    crossBar(sector.start + (sector.end - sector.start) * 0.62, 0.55, -1, beamGeo, beamMat);

    // Dark rippled floor and the glittering "highway" of triangles (00:41:13-00:41:24).
    const floorTex = this.keep(circuitTexture(13, 6, 60));
    this.scrolling.push(floorTex);
    const floorMat = this.keep(
      new THREE.MeshStandardMaterial({ map: floorTex, color: 0x3a6a72, metalness: 0.85, roughness: 0.28, side: THREE.DoubleSide })
    );
    const floorRows: THREE.Vector3[][] = [];
    for (let s = sector.start - 20; s <= decorEnd; s += 8) {
      floorRows.push([-150, 150].map((x) => this.track.toWorld(s, x, -19, new THREE.Vector3())));
    }
    const fp: number[] = [];
    const fuv: number[] = [];
    floorRows.forEach((row, i) => {
      fp.push(row[0].x, row[0].y, row[0].z, row[1].x, row[1].y, row[1].z);
      fuv.push(0, i / floorRows.length, 1, i / floorRows.length);
    });
    const fi: number[] = [];
    for (let i = 0; i < floorRows.length - 1; i += 1) {
      const a = i * 2;
      fi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const floorGeo = this.keep(new THREE.BufferGeometry());
    floorGeo.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3));
    floorGeo.setAttribute("uv", new THREE.Float32BufferAttribute(fuv, 2));
    floorGeo.setIndex(fi);
    floorGeo.computeVertexNormals();
    this.group.add(new THREE.Mesh(floorGeo, floorMat));

    const glitter = this.keep(
      new THREE.MeshStandardMaterial({ map: metal, color: 0xf4ffff, metalness: 0.4, roughness: 0.3, emissive: 0x6a9aa0, emissiveIntensity: 0.5, flatShading: true })
    );
    const hwCount = Math.floor((decorEnd - sector.start) / 1.4);
    const highway = this.makeInstanced(geometry, glitter, hwCount);
    for (let i = 0; i < hwCount; i += 1) {
      const s = sector.start + i * 1.4 + this.rng();
      const p = this.track.toWorld(s, (this.rng() * 2 - 1) * 4, -9 + this.rng() * 1.5, new THREE.Vector3());
      this.track.basis(s, this.tmpQ);
      this.tmpQ2.setFromEuler(new THREE.Euler(this.rng() * 6.28, this.rng() * 6.28, this.rng() * 6.28));
      this.tmpQ.multiply(this.tmpQ2);
      this.tmpS.setScalar(0.5 + this.rng() * 0.9);
      this.tmpM.compose(p, this.tmpQ, this.tmpS);
      highway.setMatrixAt(i, this.tmpM);
    }
    highway.instanceMatrix.needsUpdate = true;

    this.buildCrystalGates(sector, metal);
  }

  // ------------------------------------------------------------ sector 4: thorn lands (opening VR game)
  private buildThorns(sector: Sector): void {
    const tail = this.track.sectorTail(sector);
    const s0 = sector.start - 40;
    const s1 = Math.min(tail, sector.end + 160);
    const liveEnd = Math.min(sector.end - 20, this.track.raceLength - 40);

    // Low-poly canyon: a terrain ribbon that follows the line below the pilots.
    const columns = 22;
    const halfWidth = 120;
    const stepS = 7;
    const rows = Math.ceil((s1 - s0) / stepS);
    const height = (x: number, s: number): number => {
      const wall = Math.max(0, Math.abs(x) - 24) * 0.6;
      const n = Math.sin(x * 0.21 + s * 0.05) * 1.6 + Math.sin(x * 0.07 - s * 0.031) * 2.2 + Math.sin(s * 0.013) * 1.2;
      return -19 + wall + n * (0.4 + Math.min(1, Math.abs(x) / 30));
    };
    const grid: THREE.Vector3[][] = [];
    for (let r = 0; r <= rows; r += 1) {
      const s = s0 + r * stepS;
      const row: THREE.Vector3[] = [];
      for (let c = 0; c <= columns; c += 1) {
        const x = -halfWidth + (c / columns) * halfWidth * 2;
        row.push(this.track.toWorld(s, x, height(x, s), new THREE.Vector3()));
      }
      grid.push(row);
    }
    const positions: number[] = [];
    const colors: number[] = [];
    const palette = [0x5f6e22, 0x6f7f2a, 0x4a5a1c, 0xb8902a, 0xd6a832, 0x8a6a1e].map((c) => new THREE.Color(c));
    const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      const color = palette[Math.floor(this.rng() * (this.rng() < 0.7 ? 3 : palette.length))];
      for (let k = 0; k < 3; k += 1) colors.push(color.r, color.g, color.b);
    };
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        const a = grid[r][c];
        const b = grid[r][c + 1];
        const d = grid[r + 1][c];
        const e = grid[r + 1][c + 1];
        pushTri(a, d, b);
        pushTri(b, d, e);
      }
    }
    const terrainGeo = this.keep(new THREE.BufferGeometry());
    terrainGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    terrainGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();
    const terrainMat = this.keep(
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, side: THREE.DoubleSide, emissive: 0x1a1004 })
    );
    this.group.add(new THREE.Mesh(terrainGeo, terrainMat));

    // Thorn urchins: live ones on the line, decor ones on the canyon floor.
    const core = this.keep(new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.7, flatShading: true }));
    const thorn = this.keep(new THREE.MeshStandardMaterial({ color: 0xc8963c, emissive: 0x3a2008, roughness: 0.5, flatShading: true }));
    const urchinGeo = this.keep(createUrchinGeometry());
    const live = this.liveCount(liveEnd - sector.start - 30, 1.6);
    const decor = 160;
    const urchins = this.makeInstanced(urchinGeo, [core, thorn], live + decor);
    let index = 0;
    for (let i = 0; i < live; i += 1) {
      const s = sector.start + 30 + this.rng() * (liveEnd - sector.start - 30);
      const [ox, oy] = this.randomLateral(OPEN_RADIUS - 1, 0.8);
      const r = 1.4 + this.rng() * 1.4;
      this.obstacles.push({ kind: "urchin", s, ox, oy, r, angle: 0, span: 0, spin: 0 });
      this.addSpinner(urchins, index, s, ox, oy, r, 0.2 + this.rng() * 0.5);
      index += 1;
    }
    for (let i = 0; i < decor; i += 1) {
      const s = s0 + this.rng() * (s1 - s0);
      const x = (this.rng() < 0.5 ? -1 : 1) * (18 + this.rng() * 80);
      const size = 3 + this.rng() * 6;
      this.addSpinner(urchins, index, s, x, height(x, s) + size * 0.4, size, 0.02);
      index += 1;
    }
    urchins.instanceMatrix.needsUpdate = true;

    // Spiked logs across the flight zone: pass above or below.
    const logGeo = this.keep(createLogGeometry(OPEN_RADIUS * 2 + 14));
    const bark = this.keep(new THREE.MeshStandardMaterial({ color: 0x1f6a5a, emissive: 0x06221c, roughness: 0.5, flatShading: true }));
    const bandMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x8a3ac8, emissive: 0x2a0a40, roughness: 0.4, flatShading: true }));
    const step = 260 / this.difficulty.density;
    for (let s = sector.start + 120; s < liveEnd - 40; s += step * (0.7 + this.rng() * 0.6)) {
      const angle = (this.rng() * 2 - 1) * 0.7;
      const offset = (this.rng() * 2 - 1) * 6;
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const log = new THREE.Mesh(logGeo, [bark, thorn, bandMat]);
      this.placeOnTrack(log, s, nx * offset, ny * offset);
      // placeOnTrack puts local +x on the left; mirror so the mesh matches the collision line.
      log.rotateZ(-angle);
      this.group.add(log);
      this.obstacles.push({ kind: "log", s, ox: nx * offset, oy: ny * offset, r: LOG_RADIUS, angle, span: 0, spin: 0, mesh: log });
    }
  }

  // ------------------------------------------------------------ sector 5: vortex and hex world (finale)
  private buildVortex(sector: Sector): void {
    const radius = sector.info.tube;
    const texture = this.keep(hexTexture());
    const length = this.track.sectorTail(sector) + 4 - sector.start;
    // Keep hexes round: 512 px span 14 m along, 222 px span ~6 m around.
    texture.repeat.set(length / 14, Math.round((radius * 6) / 6.1));
    this.scrolling.push(texture);
    this.buildTube(sector, radius, 6, texture, 0x2a2aa0, 0.8);

    // Swirl funnel that swallows the pilots.
    const swirl = this.keep(swirlTexture());
    swirl.repeat.set(3, 1);
    const swirlMat = this.keep(
      new THREE.MeshBasicMaterial({ map: swirl, side: THREE.DoubleSide, fog: false, transparent: true, opacity: 0.95 })
    );
    const funnelGeo = this.keep(new THREE.CylinderGeometry(radius, 70, 46, 48, 1, true));
    funnelGeo.rotateX(Math.PI / 2);
    const holder = new THREE.Group();
    this.placeOnTrack(holder, sector.start - 23, 0, 0);
    const funnel = new THREE.Mesh(funnelGeo, swirlMat);
    holder.add(funnel);
    this.group.add(holder);
    this.swirls.push(funnel);

    // Flying hexagon tiles.
    const hexGeo = this.keep(createHexGeometry());
    const hexMat = this.keep(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.2, flatShading: true, emissive: 0x3a3ac0, emissiveIntensity: 0.6 }));
    const liveEnd = Math.min(sector.end - 20, this.track.raceLength - 40);
    const live = this.liveCount(liveEnd - sector.start - 40, 2.4);
    const hexes = this.makeInstanced(hexGeo, hexMat, live);
    const tints = [0x5a62ff, 0x7a5cff, 0x3a40e0, 0xff4a9a, 0x9aa4ff].map((c) => new THREE.Color(c));
    for (let i = 0; i < live; i += 1) {
      const s = sector.start + 40 + this.rng() * (liveEnd - sector.start - 40);
      const [ox, oy] = this.randomLateral(radius - 2.4, 0.7);
      const r = 1.1 + this.rng() * 1.3;
      this.obstacles.push({ kind: "hex", s, ox, oy, r, angle: 0, span: 0, spin: 0 });
      this.addSpinner(hexes, i, s, ox, oy, r, 0.6 + this.rng() * 1.4);
      hexes.setColorAt(i, tints[Math.floor(this.rng() * tints.length)]);
    }
    hexes.instanceMatrix.needsUpdate = true;
    if (hexes.instanceColor) hexes.instanceColor.needsUpdate = true;

    // Red ACCESS DENIED doors (02:09:40) that open and close across the tube.
    if (sector.index === this.track.sectors.length - 1) {
      const tag = document.createElement("canvas");
      tag.width = 512;
      tag.height = 96;
      const tctx = tag.getContext("2d") as CanvasRenderingContext2D;
      tctx.fillStyle = "#ffe8a0";
      tctx.fillRect(0, 0, 512, 96);
      tctx.strokeStyle = "#7a0010";
      tctx.lineWidth = 8;
      tctx.strokeRect(4, 4, 504, 88);
      tctx.font = "900 58px Arial Black, sans-serif";
      tctx.textAlign = "center";
      tctx.fillStyle = "#c0001a";
      tctx.fillText("ACCESS DENIED", 256, 70);
      const tagTex = this.keep(new THREE.CanvasTexture(tag));
      tagTex.colorSpace = THREE.SRGBColorSpace;
      const tagMat = this.keep(new THREE.MeshBasicMaterial({ map: tagTex, side: THREE.DoubleSide }));
      const doorTex = this.keep(hexTexture());
      doorTex.repeat.set(3, 1.5);
      const tagGeo = this.keep(new THREE.PlaneGeometry(9, 1.7));
      const doorMat = this.keep(
        new THREE.MeshStandardMaterial({ map: doorTex, color: 0xff3a5a, emissive: 0x8a0020, emissiveIntensity: 0.8, roughness: 0.4, side: THREE.DoubleSide })
      );
      const size = radius * 2 + 6;
      const doorGeo = this.keep(new THREE.BoxGeometry(size, size / 2, 0.6));
      const edgeMat = this.keep(new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
      const edgeGeo = this.keep(new THREE.BoxGeometry(size, 0.3, 0.7));
      const span = sector.end - sector.start;
      for (const k of [0.3, 0.55, 0.8]) {
        const s = sector.start + span * k;
        const holder = this.lateralHolder(s);
        const spinner = new THREE.Group();
        spinner.userData.offset = 0;
        const parts: THREE.Object3D[] = [];
        for (const side of [1, -1]) {
          const door = new THREE.Mesh(doorGeo, doorMat);
          const edge = new THREE.Mesh(edgeGeo, edgeMat);
          edge.position.y = (-side * size) / 4;
          door.add(edge);
          if (side === 1) {
            const label = new THREE.Mesh(tagGeo, tagMat);
            label.position.set(0, -size / 4 + 1.4, 0.4);
            door.add(label);
          }
          door.userData.side = side;
          spinner.add(door);
          parts.push(door);
        }
        holder.add(spinner);
        this.group.add(holder);
        const gate: Obstacle = {
          kind: "blades",
          s,
          ox: 0,
          oy: 0,
          r: 0,
          angle: 0,
          span: 0,
          spin: 1.5 + this.difficulty.plateSpin * 0.6,
          gap: 4.5,
          phase: k * 7,
          parts
        };
        this.obstacles.push(gate);
        this.bladeSets.push(gate);
        this.applyBlades(gate, 0);
      }
      this.projectileGeo = this.keep(createHexGeometry());
      this.projectileMat = this.keep(
        new THREE.MeshStandardMaterial({ color: 0xffc04a, emissive: 0xff3a8a, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3, flatShading: true })
      );
    }

    // Cyberjobe waits past the line when the run ends here (02:08-02:10).
    if (sector.index === this.track.sectors.length - 1) {
      const boss = new Cyberjobe();
      this.placeOnTrack(boss.root, this.track.raceLength + CYBERJOBE_AHEAD, 0, -1.5);
      boss.root.rotateY(Math.PI);
      boss.root.scale.setScalar(1.5);
      this.group.add(boss.root);
      this.cyberjobe = boss;
    }
  }

  // ------------------------------------------------------------ crystal gates (00:41:11-00:41:22)
  /**
   * The film's crystal run has set pieces between the shards: a riveted wall with a chrome
   * porthole, slabs that close like blades, and narrow slots the pilots pass on their side.
   */
  private buildCrystalGates(sector: Sector, metal: THREE.Texture): void {
    const wallMat = this.keep(
      new THREE.MeshStandardMaterial({ map: metal, color: 0xdcecf0, metalness: 0.35, roughness: 0.4, emissive: 0x1c3034, side: THREE.DoubleSide })
    );
    const chrome = this.keep(new THREE.MeshStandardMaterial({ color: 0xf4f8fa, metalness: 1, roughness: 0.12, emissive: 0x204048 }));
    const warn = this.keep(new THREE.MeshBasicMaterial({ color: 0xff4fd0 }));
    const size = OPEN_RADIUS * 2 + 10;
    const liveEnd = Math.min(sector.end, this.track.raceLength) - 90;
    const kinds: Array<"porthole" | "blades" | "slot"> = ["porthole", "blades", "slot"];
    let s = sector.start + 110;
    let n = 0;
    while (s < liveEnd) {
      const kind = kinds[n % kinds.length];
      n += 1;
      if (kind === "porthole") {
        const [hx, hy] = this.randomLateral(OPEN_RADIUS - 5, 0.6);
        const hole = 3.6;
        const shape = new THREE.Shape();
        shape.moveTo(-size / 2, -size / 2);
        shape.lineTo(size / 2, -size / 2);
        shape.lineTo(size / 2, size / 2);
        shape.lineTo(-size / 2, size / 2);
        shape.closePath();
        const path = new THREE.Path();
        path.absarc(hx, hy, hole, 0, TAU, true);
        shape.holes.push(path);
        const geo = this.keep(new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false, curveSegments: 32 }));
        geo.translate(0, 0, -0.3);
        // Shape x/y are lateral right/up; the holder's basis (right, up, -tangent) matches.
        const holder = this.lateralHolder(s);
        holder.add(new THREE.Mesh(geo, wallMat));
        const rim = new THREE.Mesh(this.keep(new THREE.TorusGeometry(hole, 0.35, 12, 40)), chrome);
        rim.position.set(hx, hy, 0);
        holder.add(rim);
        this.group.add(holder);
        this.obstacles.push({ kind: "porthole", s, ox: hx, oy: hy, r: 0, angle: 0, span: 0, spin: 0, gap: hole });
      } else if (kind === "blades") {
        // Slot direction: mostly horizontal (blades close up/down), sometimes tilted.
        const angle = this.rng() < 0.7 ? 0 : (this.rng() * 2 - 1) * 0.6;
        const offset = (this.rng() * 2 - 1) * 4;
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        const holder = this.lateralHolder(s);
        const spinner = new THREE.Group();
        spinner.rotation.z = angle;
        const slabGeo = this.keep(new THREE.BoxGeometry(size, size / 2, 0.7));
        const parts: THREE.Object3D[] = [];
        for (const side of [1, -1]) {
          const slab = new THREE.Mesh(slabGeo, wallMat);
          const edge = new THREE.Mesh(this.keep(new THREE.BoxGeometry(size, 0.25, 0.8)), warn);
          edge.position.y = (-side * size) / 4;
          slab.add(edge);
          slab.userData.side = side;
          spinner.add(slab);
          parts.push(slab);
        }
        holder.add(spinner);
        this.group.add(holder);
        const blade: Obstacle = {
          kind: "blades",
          s,
          ox: nx * offset,
          oy: ny * offset,
          r: 0,
          angle,
          span: 0,
          spin: 1.3 + this.rng() * 0.9 * this.difficulty.plateSpin,
          gap: 4.2,
          phase: this.rng() * TAU,
          parts
        };
        spinner.userData.offset = offset;
        this.obstacles.push(blade);
        this.bladeSets.push(blade);
        this.applyBlades(blade, 0);
      } else {
        // A narrow vertical slot through a wall of shards: pass on your side.
        const angle = Math.PI / 2 + (this.rng() * 2 - 1) * 0.25;
        const offset = (this.rng() * 2 - 1) * 5;
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        const gap = 1.6;
        const holder = this.lateralHolder(s);
        const spinner = new THREE.Group();
        spinner.rotation.z = angle;
        const slabGeo = this.keep(new THREE.BoxGeometry(size, size / 2, 0.7));
        for (const side of [1, -1]) {
          const slab = new THREE.Mesh(slabGeo, wallMat);
          slab.position.y = side * (gap + size / 4) + offset;
          const edge = new THREE.Mesh(this.keep(new THREE.BoxGeometry(size, 0.22, 0.8)), warn);
          edge.position.y = (-side * size) / 4;
          slab.add(edge);
          spinner.add(slab);
        }
        holder.add(spinner);
        this.group.add(holder);
        this.obstacles.push({ kind: "slot", s, ox: nx * offset, oy: ny * offset, r: 0, angle, span: 0, spin: 0, gap });
      }
      s += (260 / this.difficulty.density) * (0.75 + this.rng() * 0.5);
    }
  }

  private readonly bladeSets: Obstacle[] = [];

  /** Group at s whose local x, y are the lateral right / up axes (z points back along the line). */
  private lateralHolder(s: number): THREE.Group {
    const holder = new THREE.Group();
    this.track.position(s, holder.position);
    const t = this.track.tangent(s, new THREE.Vector3());
    const u = this.track.upAt(s, new THREE.Vector3());
    const r = this.track.rightAt(s, new THREE.Vector3());
    holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, t.negate()));
    return holder;
  }

  /** Current half-gap of a blade pair. */
  bladeGap(o: Obstacle, time: number): number {
    return 0.25 + (o.gap ?? 4) * (0.5 + 0.5 * Math.sin(time * o.spin + (o.phase ?? 0)));
  }

  private applyBlades(o: Obstacle, time: number): void {
    const g = this.bladeGap(o, time);
    const size = OPEN_RADIUS * 2 + 10;
    for (const slab of o.parts ?? []) {
      const side = slab.userData.side as number;
      const offset = (slab.parent?.userData.offset as number) ?? 0;
      slab.position.y = offset + side * (g + size / 4);
    }
  }

  // ------------------------------------------------------------ board: kaleidoscope (01:00:20-01:02:40)
  private buildKaleido(sector: Sector): void {
    const radius = 12.6;
    const perRing = 20;
    const step = 3.0;
    const tail = this.track.sectorTail(sector);
    const s0 = sector.start;
    const s1 = Math.min(tail, sector.end + 40);
    const rings = Math.ceil((s1 - s0) / step);
    const tex = this.keep(ornateTileTexture());
    const tileMat = this.keep(
      new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.14, roughness: 0.6, side: THREE.DoubleSide })
    );
    const tileGeo = this.keep(new THREE.BoxGeometry(4.0, 4.0, 0.2));
    const mesh = this.makeInstanced(tileGeo, tileMat, rings * perRing);
    const tints = [0xfff4e0, 0xfff4e0, 0x5ac84a, 0xd8384a, 0x8a4aff, 0x4a6aff, 0xb02a3a, 0x3a9a5a].map((c) => new THREE.Color(c));
    for (let i = 0; i < rings; i += 1) {
      const s = s0 + i * step;
      const ring: TileRing = {
        s,
        first: i * perRing,
        centre: this.track.position(s, new THREE.Vector3()),
        tangent: this.track.tangent(s, new THREE.Vector3()),
        right: this.track.rightAt(s, new THREE.Vector3()),
        up: this.track.upAt(s, new THREE.Vector3()),
        direction: Math.floor(i / 40) % 2 === 0 ? 1 : -1
      };
      this.tileRings.push(ring);
      for (let k = 0; k < perRing; k += 1) {
        // Patches of colour follow the spiral, as in the film.
        const band = Math.floor((k + i * 0.35) / 3) % tints.length;
        mesh.setColorAt(ring.first + k, tints[(band * 3 + Math.floor(i / 25)) % tints.length]);
      }
    }
    this.tileMesh = mesh;
    this.kaleidoRadius = radius;
    this.kaleidoPerRing = perRing;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.poseTiles(0, [s0], Infinity);

    // Electric sigils: thin glowing rings with a triangle, turning near the wall (decor).
    const sigilMat = this.keep(
      new THREE.MeshBasicMaterial({ color: 0x8ab8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const ringGeo = this.keep(new THREE.TorusGeometry(10.4, 0.07, 6, 64));
    const triShape = new THREE.Shape();
    for (let k = 0; k < 3; k += 1) {
      const a = Math.PI / 2 + (k * TAU) / 3;
      if (k === 0) triShape.moveTo(Math.cos(a) * 10.2, Math.sin(a) * 10.2);
      else triShape.lineTo(Math.cos(a) * 10.2, Math.sin(a) * 10.2);
    }
    triShape.closePath();
    const triGeo = this.keep(new THREE.BufferGeometry().setFromPoints(triShape.getPoints().map((p) => new THREE.Vector3(p.x, p.y, 0))));
    for (let s = s0 + 30; s < sector.end; s += 48) {
      const holder = this.lateralHolder(s);
      const spinner = new THREE.Group();
      spinner.add(new THREE.Mesh(ringGeo, sigilMat), new THREE.LineLoop(triGeo, sigilMat));
      holder.add(spinner);
      this.group.add(holder);
      this.sigils.push(spinner);
    }

    // Rotating lightning beams through the centre: time the crossing.
    const beamMat = this.keep(new THREE.MeshBasicMaterial({ color: 0xe8f6ff }));
    const glowMat = this.keep(
      new THREE.MeshBasicMaterial({ color: 0x4a8aff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const coreGeo = this.keep(new THREE.CylinderGeometry(0.18, 0.18, 24, 6));
    coreGeo.rotateZ(Math.PI / 2);
    const haloGeo = this.keep(new THREE.CylinderGeometry(0.75, 0.75, 24, 10, 1, true));
    haloGeo.rotateZ(Math.PI / 2);
    const liveEnd = Math.min(sector.end, this.track.raceLength) - 40;
    for (let s = s0 + 90; s < liveEnd; s += (150 / this.difficulty.density) * (0.7 + this.rng() * 0.6)) {
      const holder = this.lateralHolder(s);
      const spinner = new THREE.Group();
      spinner.add(new THREE.Mesh(coreGeo, beamMat), new THREE.Mesh(haloGeo, glowMat));
      holder.add(spinner);
      this.group.add(holder);
      const beam: Obstacle = {
        kind: "beam",
        s,
        ox: 0,
        oy: 0,
        r: 0,
        angle: this.rng() * TAU,
        span: 0,
        spin: (this.rng() < 0.5 ? -1 : 1) * (0.5 + this.rng() * 0.7) * (0.6 + this.difficulty.plateSpin),
        mesh: spinner
      };
      this.obstacles.push(beam);
      this.beams.push(beam);
    }

    // Electric orbs drifting in the spiral.
    const orbGeo = this.keep(new THREE.IcosahedronGeometry(1, 2));
    const orbMat = this.keep(new THREE.MeshBasicMaterial({ color: 0xbfe8ff }));
    const orbGlowMat = this.keep(
      new THREE.MeshBasicMaterial({ color: 0x3a6aff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const orbs = this.liveCount(liveEnd - s0 - 60, 1.2);
    for (let i = 0; i < orbs; i += 1) {
      const s = s0 + 60 + this.rng() * (liveEnd - s0 - 60);
      const [ox, oy] = this.randomLateral(8.5, 0.7);
      const r = 0.9 + this.rng() * 0.7;
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.scale.setScalar(r * 0.6);
      const glow = new THREE.Mesh(orbGeo, orbGlowMat);
      glow.scale.setScalar(1.7);
      orb.add(glow);
      this.track.toWorld(s, ox, oy, orb.position);
      this.group.add(orb);
      this.orbs.push(orb);
      this.obstacles.push({ kind: "orb", s, ox, oy, r, angle: 0, span: 0, spin: 0, mesh: orb });
    }
  }

  private kaleidoRadius = 12.6;
  private kaleidoPerRing = 20;
  private readonly tmpM2 = new THREE.Matrix4();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();

  /** Re-pose kaleidoscope rings within `reach` of any focus distance: a turning spiral. */
  private poseTiles(time: number, focus: number[], reach: number): void {
    const mesh = this.tileMesh;
    if (!mesh) return;
    const R = this.kaleidoRadius;
    const per = this.kaleidoPerRing;
    let touched = false;
    for (const ring of this.tileRings) {
      if (!focus.some((f) => ring.s > f - 40 && ring.s < f + reach)) continue;
      touched = true;
      const twist = ring.s * 0.045 + time * 0.6 * ring.direction;
      for (let k = 0; k < per; k += 1) {
        const a = (k / per) * TAU + twist;
        const radial = this.tmpA.copy(ring.right).multiplyScalar(Math.cos(a)).addScaledVector(ring.up, Math.sin(a));
        const around = this.tmpB.crossVectors(ring.tangent, radial);
        this.tmpM2.makeBasis(around, ring.tangent, radial);
        // Lean each tile to face the incoming pilots: the rings read as a funnel of scales.
        this.tmpQ.setFromRotationMatrix(this.tmpM2);
        this.tmpQ2.setFromAxisAngle(this.tmpC.set(1, 0, 0), 1.1);
        this.tmpQ.multiply(this.tmpQ2);
        const pos = this.tmpC.copy(ring.centre).addScaledVector(radial, R);
        this.tmpS.setScalar(1);
        this.tmpM.compose(pos, this.tmpQ, this.tmpS);
        mesh.setMatrixAt(ring.first + k, this.tmpM);
      }
    }
    if (touched) mesh.instanceMatrix.needsUpdate = true;
  }

  beamAngle(o: Obstacle, time: number): number {
    return o.angle + o.spin * time;
  }

  // ------------------------------------------------------------ board: golden wave (01:14)
  /** Height of the golden sheet under lateral x at s (lateral up axis), or -Infinity outside. */
  waveHeight(s: number, x: number, time: number): number {
    const w = this.wave;
    if (!w || s < w.sector.start - 20 || s > w.sector.end + 30) return -Infinity;
    const fadeIn = THREE.MathUtils.smoothstep(s, w.sector.start, w.sector.start + 80);
    const fadeOut = 1 - THREE.MathUtils.smoothstep(s, w.sector.end - 80, w.sector.end);
    const amp = fadeIn * fadeOut * (0.6 + 0.4 * this.difficulty.density);
    const along = Math.sin(s * 0.045 - time * 1.6);
    const across = Math.cos(x * 0.09 + s * 0.01 + time * 0.5);
    const swell = Math.max(0, Math.sin(s * 0.012 + time * 0.35));
    // Sharp ridges racing across the sheet, like the film's saw-tooth crests.
    const ridge = Math.pow(Math.max(0, Math.sin(s * 0.08 + x * 0.11 - time * 2.1)), 6);
    return -13 + amp * (4.5 * along * across + 11 * swell * swell * (0.55 + 0.45 * along) + 6 * ridge * (0.4 + swell));
  }

  private buildWave(sector: Sector): void {
    const tail = this.track.sectorTail(sector);
    const s0 = sector.start - 20;
    const s1 = Math.min(tail, sector.end + 30);
    const columns: number[] = [];
    for (let x = -64; x <= 64; x += 2.5) columns.push(x);
    const rows: WaveSheet["rows"] = [];
    for (let s = s0; s <= s1; s += 2) {
      rows.push({
        s,
        centre: this.track.position(s, new THREE.Vector3()),
        right: this.track.rightAt(s, new THREE.Vector3()),
        up: this.track.upAt(s, new THREE.Vector3())
      });
    }
    const geometry = this.keep(new THREE.BufferGeometry());
    const positions = new Float32Array(rows.length * columns.length * 3);
    const uvs = new Float32Array(rows.length * columns.length * 2);
    const index: number[] = [];
    for (let r = 0; r < rows.length; r += 1) {
      for (let c = 0; c < columns.length; c += 1) {
        const i = r * columns.length + c;
        uvs[i * 2] = c;
        uvs[i * 2 + 1] = r * 0.75;
        if (r < rows.length - 1 && c < columns.length - 1) {
          const a = i;
          const b = i + 1;
          const d = i + columns.length;
          const e = d + 1;
          index.push(a, d, b, b, d, e);
        }
      }
    }
    geometry.setIndex(index);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    const grid = this.keep(goldGridTexture());
    const mat = this.keep(
      new THREE.MeshStandardMaterial({ map: grid, metalness: 0.55, roughness: 0.35, emissive: 0x6a4000, emissiveIntensity: 0.6, side: THREE.DoubleSide })
    );
    const sheet = new THREE.Mesh(geometry, mat);
    sheet.frustumCulled = false;
    this.group.add(sheet);
    this.wave = { sector, geometry, rows, columns };
    this.poseWave(0, [s0], Infinity);

    // The electric brain-globe far below.
    const mid = (sector.start + sector.end) / 2;
    const globe = new THREE.Mesh(
      this.keep(new THREE.SphereGeometry(320, 48, 32)),
      this.keep(new THREE.MeshBasicMaterial({ map: this.keep(lightningTexture()), fog: false }))
    );
    this.track.toWorld(mid, 0, -370, globe.position);
    this.group.add(globe);
    this.globe = globe;

    // Neon-framed panels of Jobe's interface, floating beside the line.
    const panelTex = this.keep(lightningTexture());
    const panelMat = this.keep(new THREE.MeshBasicMaterial({ map: panelTex, side: THREE.DoubleSide, color: 0xb0a0ff }));
    const panelGeo = this.keep(new THREE.PlaneGeometry(12, 8));
    const edgeGeo = this.keep(new THREE.EdgesGeometry(panelGeo));
    const neon = this.keep(new THREE.LineBasicMaterial({ color: 0xff5ae0 }));
    for (let i = 0; i < 16; i += 1) {
      const s = sector.start + this.rng() * (sector.end - sector.start);
      const side = this.rng() < 0.5 ? -1 : 1;
      const panel = new THREE.Mesh(panelGeo, panelMat);
      panel.add(new THREE.LineSegments(edgeGeo, neon));
      this.placeOnTrack(panel, s, side * (24 + this.rng() * 20), 2 + this.rng() * 14);
      panel.rotateY(side * 1.1);
      this.group.add(panel);
    }
    // Red wire icosahedra hovering high above, as the one over Jobe's desk.
    const icoGeo = this.keep(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(3, 0)));
    const icoMat = this.keep(new THREE.LineBasicMaterial({ color: 0xff3a3a }));
    for (let i = 0; i < 6; i += 1) {
      const ico = new THREE.LineSegments(icoGeo, icoMat);
      this.track.toWorld(sector.start + ((i + 0.5) / 6) * (sector.end - sector.start), (this.rng() * 2 - 1) * 10, 22, ico.position);
      this.group.add(ico);
      this.sigils.push(ico);
    }
  }

  private globe: THREE.Mesh | null = null;

  private poseWave(time: number, focus: number[], reach: number): void {
    const w = this.wave;
    if (!w) return;
    const pos = w.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    let touched = false;
    w.rows.forEach((row, r) => {
      if (!focus.some((f) => row.s > f - 60 && row.s < f + reach)) return;
      touched = true;
      for (let c = 0; c < w.columns.length; c += 1) {
        const x = w.columns[c];
        const h = this.waveHeight(row.s, x, time);
        const y = Number.isFinite(h) ? h : -12;
        const i = (r * w.columns.length + c) * 3;
        arr[i] = row.centre.x + row.right.x * x + row.up.x * y;
        arr[i + 1] = row.centre.y + row.right.y * x + row.up.y * y;
        arr[i + 2] = row.centre.z + row.right.z * x + row.up.z * y;
      }
    });
    if (touched) {
      pos.needsUpdate = true;
      w.geometry.computeVertexNormals();
    }
  }

  // ------------------------------------------------------------ inspired board: network (after 01:57:40)
  private readonly geysers: Obstacle[] = [];

  /** Firewall half-size: the square cross-section is 3 x 3 cells. */
  static readonly NET_HALF = 9;

  /** Which firewall cell (0..8) a lateral point falls in, plus its position inside the cell. */
  firewallCell(ox: number, oy: number): { index: number; u: number; v: number } {
    const half = RaceWorld.NET_HALF;
    const cell = (half * 2) / 3;
    const cx = Math.min(2, Math.max(0, Math.floor((ox + half) / cell)));
    const cy = Math.min(2, Math.max(0, Math.floor((oy + half) / cell)));
    return { index: cy * 3 + cx, u: ox + half - cx * cell, v: oy + half - cy * cell };
  }

  /** A flat ribbon between two lateral points, following the line from s0 to s1. */
  private ribbon(s0: number, s1: number, a: [number, number], b: [number, number], step: number): THREE.BufferGeometry {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let row = 0;
    for (let s = s0; s <= s1; s += step, row += 1) {
      const pa = this.track.toWorld(s, a[0], a[1], new THREE.Vector3());
      const pb = this.track.toWorld(s, b[0], b[1], new THREE.Vector3());
      pos.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
      const v = (s - s0) / (s1 - s0);
      uv.push(0, v, 1, v);
      if (row > 0) {
        const i = (row - 1) * 2;
        idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
      }
    }
    const geo = this.keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  private buildNetwork(sector: Sector): void {
    const half = RaceWorld.NET_HALF;
    const cell = (half * 2) / 3;
    const s0 = sector.start - 2;
    const s1 = this.track.sectorTail(sector) + 4;
    const tex = this.keep(networkTexture());
    tex.repeat.set(1.5, (s1 - s0) / 18);
    this.scrolling.push(tex);
    const wallMat = this.keep(
      new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.6, side: THREE.DoubleSide })
    );
    // Four walls built in the line's own frame, so they stay square to the firewalls.
    const e = half + 0.5;
    const corners: Array<[number, number]> = [
      [-e, -e],
      [e, -e],
      [e, e],
      [-e, e]
    ];
    for (let side = 0; side < 4; side += 1) {
      this.group.add(new THREE.Mesh(this.ribbon(s0, s1, corners[side], corners[(side + 1) % 4], 4), wallMat));
    }

    // Firewalls: 3 x 3 grids with a few open cells; aim for an open one.
    const red = this.keep(networkTexture());
    const blockMat = this.keep(
      new THREE.MeshStandardMaterial({ map: red, color: 0xff6a8a, emissive: 0xc0103a, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 })
    );
    const frameMat = this.keep(new THREE.LineBasicMaterial({ color: 0x5af0ff }));
    const blockGeo = this.keep(new THREE.BoxGeometry(cell - 0.15, cell - 0.15, 0.4));
    const frameGeo = this.keep(new THREE.EdgesGeometry(new THREE.BoxGeometry(cell - 0.3, cell - 0.3, 0.2)));
    const liveEnd = Math.min(sector.end, this.track.raceLength) - 40;
    for (let s = sector.start + 70; s < liveEnd; s += (120 / this.difficulty.density) * (0.8 + this.rng() * 0.4)) {
      const opens = Math.max(1, 4 - Math.round(this.difficulty.density));
      let mask = 0;
      while (countBits(mask) < opens) mask |= 1 << Math.floor(this.rng() * 9);
      const holder = this.lateralHolder(s);
      for (let i = 0; i < 9; i += 1) {
        const x = -half + cell * (i % 3) + cell / 2;
        const y = -half + cell * Math.floor(i / 3) + cell / 2;
        const open = (mask & (1 << i)) !== 0;
        const part = open ? new THREE.LineSegments(frameGeo, frameMat) : new THREE.Mesh(blockGeo, blockMat);
        part.position.set(x, y, 0);
        holder.add(part);
      }
      this.group.add(holder);
      this.obstacles.push({ kind: "firewall", s, ox: 0, oy: 0, r: 0, angle: 0, span: mask, spin: 0, gap: cell });
    }

    // Cyan scan beams sweeping through the corridor between firewalls.
    const beamMat = this.keep(new THREE.MeshBasicMaterial({ color: 0xe0fbff }));
    const glowMat = this.keep(
      new THREE.MeshBasicMaterial({ color: 0x1ad8ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const coreGeo = this.keep(new THREE.CylinderGeometry(0.16, 0.16, half * 3, 6));
    coreGeo.rotateZ(Math.PI / 2);
    const haloGeo = this.keep(new THREE.CylinderGeometry(0.7, 0.7, half * 3, 10, 1, true));
    haloGeo.rotateZ(Math.PI / 2);
    for (let s = sector.start + 130; s < liveEnd; s += (220 / this.difficulty.density) * (0.8 + this.rng() * 0.4)) {
      const holder = this.lateralHolder(s);
      const spinner = new THREE.Group();
      spinner.add(new THREE.Mesh(coreGeo, beamMat), new THREE.Mesh(haloGeo, glowMat));
      holder.add(spinner);
      this.group.add(holder);
      const beam: Obstacle = {
        kind: "beam",
        s,
        ox: 0,
        oy: 0,
        r: 0,
        angle: this.rng() * TAU,
        span: 0,
        spin: (this.rng() < 0.5 ? -1 : 1) * (0.7 + this.rng() * 0.6),
        mesh: spinner
      };
      this.obstacles.push(beam);
      this.beams.push(beam);
    }
  }

  // ------------------------------------------------------------ inspired board: furnace (after 01:35:20)
  /** Is a fire column erupting at `time`? */
  geyserActive(o: Obstacle, time: number): boolean {
    return Math.sin(time * o.spin + (o.phase ?? 0)) > 0.15;
  }

  private buildFurnace(sector: Sector): void {
    const tail = this.track.sectorTail(sector);
    const s0 = sector.start - 30;
    const s1 = Math.min(tail, sector.end + 120);
    // Lava sea far below.
    const lava = this.keep(lavaTexture());
    lava.repeat.set(8, (s1 - s0) / 40);
    this.scrolling.push(lava);
    const lavaMat = this.keep(new THREE.MeshBasicMaterial({ map: lava, side: THREE.DoubleSide }));
    this.group.add(new THREE.Mesh(this.ribbon(s0, s1, [-220, -46], [220, -46], 8), lavaMat));

    // Fire columns erupting from the lava through the flight zone.
    const fireMat = this.keep(
      new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const coreMat = this.keep(
      new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const fireGeo = this.keep(new THREE.CylinderGeometry(2.4, 3.6, 70, 14, 1, true));
    fireGeo.translate(0, 35, 0);
    const coreGeo = this.keep(new THREE.CylinderGeometry(1.1, 1.8, 70, 10, 1, true));
    coreGeo.translate(0, 35, 0);
    const liveEnd = Math.min(sector.end, this.track.raceLength) - 40;
    for (let s = sector.start + 60; s < liveEnd; s += (90 / this.difficulty.density) * (0.7 + this.rng() * 0.6)) {
      const x = (this.rng() * 2 - 1) * (OPEN_RADIUS - 3);
      const holder = this.lateralHolder(s);
      const column = new THREE.Group();
      column.position.set(x, -46, 0);
      column.add(new THREE.Mesh(fireGeo, fireMat), new THREE.Mesh(coreGeo, coreMat));
      holder.add(column);
      this.group.add(holder);
      const geyser: Obstacle = {
        kind: "geyser",
        s,
        ox: x,
        oy: 0,
        r: 2.6,
        angle: 0,
        span: 0,
        spin: 1.2 + this.rng() * 0.9,
        phase: this.rng() * TAU,
        mesh: column
      };
      this.obstacles.push(geyser);
      this.geysers.push(geyser);
    }

    // Charred rocks with glowing cracks drifting in the heat.
    const rockMat = this.keep(
      new THREE.MeshStandardMaterial({
        color: 0x2a1a14,
        emissive: 0xff5a10,
        emissiveMap: this.keep(lavaTexture()),
        emissiveIntensity: 0.6,
        roughness: 0.9,
        flatShading: true
      })
    );
    const rockGeo = this.keep(new THREE.IcosahedronGeometry(1, 0));
    const live = this.liveCount(liveEnd - sector.start - 40, 1.4);
    const decor = 140;
    const rocks = this.makeInstanced(rockGeo, rockMat, live + decor);
    let index = 0;
    for (let i = 0; i < live; i += 1) {
      const s = sector.start + 40 + this.rng() * (liveEnd - sector.start - 40);
      const [ox, oy] = this.randomLateral(OPEN_RADIUS - 1, 0.8);
      const r = 1.4 + this.rng() * 1.6;
      this.obstacles.push({ kind: "rock", s, ox, oy, r, angle: 0, span: 0, spin: 0 });
      this.addSpinner(rocks, index, s, ox, oy, r, 0.2 + this.rng() * 0.5);
      index += 1;
    }
    for (let i = 0; i < decor; i += 1) {
      const s = s0 + this.rng() * (s1 - s0);
      const a = this.rng() * TAU;
      const rr = 22 + this.rng() * 100;
      this.addSpinner(rocks, index, s, Math.cos(a) * rr, Math.sin(a) * rr * 0.6, 3 + this.rng() * 9, 0.05 + this.rng() * 0.2);
      index += 1;
    }
    rocks.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ rings and finish
  private buildRings(): void {
    const geometry = this.keep(new THREE.TorusGeometry(3.1, 0.32, 12, 32));
    const material = this.keep(
      new THREE.MeshStandardMaterial({ color: 0xe8f2f6, metalness: 0.9, roughness: 0.15, emissive: 0x1a6a70, emissiveIntensity: 0.5 })
    );
    let s = 120;
    while (s < this.track.raceLength - 60) {
      const bound = Math.min(this.track.boundAt(s - 20), this.track.boundAt(s + 20));
      const [ox, oy] = this.randomLateral(Math.max(2, bound - 3.6), 0.7);
      const ringMat = this.keep(material.clone());
      const mesh = new THREE.Mesh(geometry, ringMat);
      this.placeOnTrack(mesh, s, ox, oy);
      this.group.add(mesh);
      this.rings.push({ s, ox, oy, r: 3.1, mesh, flash: 0, taken: [false, false] });
      s += 85 + this.rng() * 70;
    }
  }

  private buildFinish(): void {
    const L = this.track.raceLength;
    const tube = this.track.tubeAt(L);
    if (tube > 0) {
      // Stay inside the tube's flat walls (a hexagon's inner radius is r·cos 30°).
      const sides = this.track.sectorAt(L).kind === "vortex" ? 6 : 12;
      this.addBand(L, tube * Math.cos(Math.PI / sides) - 0.2, 4);
      return;
    }
    const checker = this.keep(checkerTexture(30, 1));
    const gateGeo = this.keep(new THREE.TorusGeometry(OPEN_RADIUS + 3, 1.1, 10, 48));
    const gateMat = this.keep(new THREE.MeshStandardMaterial({ map: checker, roughness: 0.4, emissive: 0x222222 }));
    const gate = new THREE.Mesh(gateGeo, gateMat);
    this.placeOnTrack(gate, L, 0, 0);
    this.group.add(gate);

    const stripTex = this.keep(checkerTexture(1, 12));
    const stripMat = this.keep(new THREE.MeshBasicMaterial({ map: stripTex, side: THREE.DoubleSide }));
    const stripGeo = this.keep(new THREE.PlaneGeometry(3, 1.6, 1, 1));
    stripGeo.rotateX(-Math.PI / 2);
    for (let s = L - 120; s <= L + 20; s += 1.6) {
      const tile = new THREE.Mesh(stripGeo, stripMat);
      this.placeOnTrack(tile, s, 0, -OPEN_RADIUS * 0.6);
      this.group.add(tile);
    }
  }

  // ------------------------------------------------------------ queries
  plateAngle(plate: Obstacle, time: number): number {
    return plate.angle + plate.spin * time;
  }

  /** Angle in the middle of a plate's opening at `time`. */
  plateGap(plate: Obstacle, time: number): number {
    return this.plateAngle(plate, time) + plate.span + (TAU - plate.span) / 2;
  }

  plateBlocks(plate: Obstacle, ox: number, oy: number, time: number): boolean {
    const local = wrapAngle(Math.atan2(oy, ox) - this.plateAngle(plate, time));
    return local < plate.span;
  }

  /** Signed distance from a lateral point to a log's line. */
  logDistance(log: Obstacle, ox: number, oy: number): number {
    const nx = -Math.sin(log.angle);
    const ny = Math.cos(log.angle);
    return (ox - log.ox) * nx + (oy - log.oy) * ny;
  }

  /**
   * Collision of a pilot moving from prevS to s at lateral (ox, oy).
   * Returns the lateral push direction, or null.
   */
  collision(o: Obstacle, prevS: number, s: number, ox: number, oy: number, time: number, roll = 0): [number, number] | null {
    const crossedPlane = prevS < o.s && s >= o.s;
    if (o.kind === "porthole") {
      if (!crossedPlane) return null;
      const dx = ox - o.ox;
      const dy = oy - o.oy;
      const d = Math.hypot(dx, dy);
      const reach = 1.1 + 0.8 * Math.abs(Math.cos(roll - Math.atan2(dy, dx)));
      if (d + reach > (o.gap ?? 3.6)) {
        return d > 0.01 ? [-dx, -dy] : [0, 1];
      }
      return null;
    }
    if (o.kind === "blades" || o.kind === "slot") {
      if (!crossedPlane) return null;
      const nx = -Math.sin(o.angle);
      const ny = Math.cos(o.angle);
      const across = (ox - o.ox) * nx + (oy - o.oy) * ny;
      const half = o.kind === "blades" ? this.bladeGap(o, time) : (o.gap ?? 1.3);
      if (Math.abs(across) + pilotExtent(roll, o.angle + Math.PI / 2) > half) {
        const sign = across >= 0 ? -1 : 1;
        return [nx * sign, ny * sign];
      }
      return null;
    }
    if (o.kind === "firewall") {
      if (!crossedPlane) return null;
      const cell = o.gap ?? 6;
      const { index, u, v } = this.firewallCell(ox, oy);
      const open = (o.span & (1 << index)) !== 0;
      // Wings and body must clear the open cell's edges (a little forgiveness).
      const ex = pilotExtent(roll, 0) * 0.55;
      const ey = pilotExtent(roll, Math.PI / 2) * 0.55;
      const inside = u > ex && u < cell - ex && v > ey && v < cell - ey;
      if (!open || !inside) {
        const cu = u - cell / 2;
        const cv = v - cell / 2;
        return open ? [-cu, -cv] : [cu || 1, cv];
      }
      return null;
    }
    if (o.kind === "geyser") {
      if (!(prevS < o.s + 2.6 && s > o.s - 2.6) || !this.geyserActive(o, time)) return null;
      const dx = ox - o.ox;
      if (Math.abs(dx) < o.r + pilotExtent(roll, 0) * 0.5) return [dx >= 0 ? 1 : -1, 0.3];
      return null;
    }
    if (o.kind === "beam") {
      if (!(prevS < o.s + 0.8 && s > o.s - 0.8)) return null;
      const a = this.beamAngle(o, time);
      const across = -ox * Math.sin(a) + oy * Math.cos(a);
      if (Math.abs(across) < 0.75 + pilotExtent(roll, a + Math.PI / 2) * 0.6) {
        const sign = across >= 0 ? 1 : -1;
        return [-Math.sin(a) * sign, Math.cos(a) * sign];
      }
      return null;
    }
    if (o.kind === "plate") {
      if (prevS < o.s && s >= o.s && (Math.hypot(ox, oy) < 0.9 || this.plateBlocks(o, ox, oy, time))) {
        const gap = this.plateGap(o, time);
        return [Math.cos(gap), Math.sin(gap)];
      }
      return null;
    }
    if (o.kind === "log") {
      const crossed = prevS < o.s + 1.2 && s > o.s - 1.2;
      const d = this.logDistance(o, ox, oy);
      if (crossed && Math.abs(d) < LOG_RADIUS + 0.3 + pilotExtent(roll, o.angle + Math.PI / 2)) {
        const sign = d >= 0 ? 1 : -1;
        return [-Math.sin(o.angle) * sign, Math.cos(o.angle) * sign];
      }
      return null;
    }
    const ds = s - o.s;
    const dx = ox - o.ox;
    const dy = oy - o.oy;
    const rr = o.r * 0.92 + PILOT_RADIUS;
    if (ds * ds + dx * dx + dy * dy < rr * rr) {
      return [dx, dy];
    }
    return null;
  }

  /** Index of the first obstacle at or after s. */
  firstObstacleFrom(s: number): number {
    let lo = 0;
    let hi = this.obstacles.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.obstacles[mid].s < s) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /**
   * The finale fight: Cyberjobe flies ahead of the leader inside the vortex and throws hex
   * tiles at the pilots' lines; three at a time in the second half. At the line he stops.
   */
  updateBoss(time: number, dt: number, leaderS: number, targets: Array<[number, number]>, rearS: number): void {
    const boss = this.cyberjobe;
    if (!boss) return;
    const last = this.track.sectors[this.track.sectors.length - 1];
    const finalS = this.track.raceLength + CYBERJOBE_AHEAD;
    const fighting = leaderS >= last.start && leaderS < this.track.raceLength - 40;
    this.bossS = fighting ? Math.min(leaderS + 78, finalS) : finalS;
    const sway = fighting ? Math.sin(time * 0.9) * 3 : 0;
    this.placeOnTrack(boss.root, this.bossS, sway, -1.5 + (fighting ? Math.sin(time * 1.4) * 1.2 : 0));
    boss.root.rotateY(Math.PI);

    if (fighting && this.projectileGeo && this.projectileMat && targets.length > 0) {
      this.throwTimer -= dt;
      if (this.throwTimer <= 0) {
        const progress = (leaderS - last.start) / Math.max(1, last.end - last.start);
        this.throwTimer = 1.9 / (0.6 + 0.4 * this.difficulty.density) * (progress > 0.5 ? 1.15 : 1);
        const [tx, ty] = targets[Math.floor(this.rng() * targets.length)];
        const spread = progress > 0.5 ? [-4, 0, 4] : [0];
        for (const offset of spread) {
          const mesh = new THREE.Mesh(this.projectileGeo, this.projectileMat);
          mesh.scale.setScalar(1.3);
          this.group.add(mesh);
          this.projectiles.push({
            s: this.bossS - 4,
            ox: sway,
            oy: 2,
            fromX: sway,
            fromY: 2,
            toX: tx + offset,
            toY: ty,
            startS: this.bossS - 4,
            r: 1.3,
            mesh
          });
        }
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i];
      p.s -= 46 * dt;
      // Reach the aimed lateral point about 60 m down the tube.
      const k = Math.min(1, (p.startS - p.s) / 60);
      p.ox = p.fromX + (p.toX - p.fromX) * k;
      p.oy = p.fromY + (p.toY - p.fromY) * k;
      this.track.toWorld(p.s, p.ox, p.oy, p.mesh.position);
      p.mesh.rotation.set(time * 4 + i, time * 3, 0);
      if (p.s < rearS - 25 || !fighting) {
        this.removeProjectile(i);
      }
    }
  }

  removeProjectile(index: number): void {
    const [p] = this.projectiles.splice(index, 1);
    if (p) p.mesh.removeFromParent();
  }

  /** Animate the course; `focus` lists the pilots' distances so per-vertex work stays near them. */
  update(time: number, dt: number, focus: number[] = []): void {
    for (const plate of this.plates) {
      if (plate.mesh) {
        plate.mesh.rotation.z = this.plateAngle(plate, time);
      }
    }
    for (const beam of this.beams) {
      if (beam.mesh) beam.mesh.rotation.z = this.beamAngle(beam, time);
    }
    for (const blade of this.bladeSets) {
      this.applyBlades(blade, time);
    }
    for (const g of this.geysers) {
      if (!g.mesh) continue;
      const strength = Math.max(0, Math.sin(time * g.spin + (g.phase ?? 0)));
      const active = this.geyserActive(g, time);
      g.mesh.scale.set(active ? 1 + 0.15 * Math.sin(time * 20) : 0.6, active ? 1 : 0.05 + strength * 0.2, active ? 1 : 0.6);
    }
    this.orbs.forEach((orb, i) => {
      orb.rotation.set(time * 1.3 + i, time * 0.9, 0);
      const glow = orb.children[0];
      if (glow) glow.scale.setScalar(1.5 + 0.35 * Math.abs(Math.sin(time * 11 + i * 1.7)));
    });
    this.sigils.forEach((sigil, i) => {
      sigil.rotation.z = time * (i % 2 === 0 ? 0.5 : -0.4);
    });
    if (focus.length > 0) {
      this.poseTiles(time, focus, 260);
      this.poseWave(time, focus, 320);
    }
    if (this.globe) this.globe.rotation.y = time * 0.02;
    this.cyberjobe?.update(time, this.rage);
    const touched = new Set<THREE.InstancedMesh>();
    for (const sp of this.spinners) {
      this.applySpinner(sp, time);
      touched.add(sp.mesh);
    }
    for (const mesh of touched) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const swirl of this.swirls) {
      swirl.rotation.z = time * 1.4;
    }
    for (const texture of this.scrolling) {
      texture.offset.y = time * 0.03;
    }
    for (const ring of this.rings) {
      ring.mesh.rotateZ(dt * 0.6);
      if (ring.flash > 0) {
        ring.flash = Math.max(0, ring.flash - dt * 1.8);
      }
      const mat = ring.mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.setRGB(0.1 + ring.flash * 0.9, 0.42 + ring.flash * 0.5, 0.44 + ring.flash * 0.2);
      ring.mesh.scale.setScalar(1 + ring.flash * 0.35);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.cyberjobe?.dispose();
    for (const item of this.disposables) {
      item.dispose();
    }
    this.group.traverse((child) => {
      if (child instanceof THREE.InstancedMesh) {
        child.dispose();
      }
    });
  }
}

export interface Skies {
  circuit: THREE.Mesh;
  sunset: THREE.Mesh;
  hexdots: THREE.Mesh;
  furnace: THREE.Mesh;
}

export function createSkies(): Skies {
  const circuit = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.MeshBasicMaterial({ map: circuitTexture(3, 10, 5), color: 0x4f7c80, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  const sunset = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.MeshBasicMaterial({ map: sunsetTexture(), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  const hexdots = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.MeshBasicMaterial({ map: hexDotsTexture(), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  (hexdots.material as THREE.MeshBasicMaterial).map?.repeat.set(8, 4);
  const furnace = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.MeshBasicMaterial({ map: furnaceSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  for (const sky of [circuit, sunset, hexdots, furnace]) {
    sky.renderOrder = -1;
  }
  return { circuit, sunset, hexdots, furnace };
}

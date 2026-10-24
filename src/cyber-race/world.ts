import * as THREE from "three";
import {
  createHexGeometry,
  createLogGeometry,
  createMineGeometry,
  createShardGeometry,
  createUrchinGeometry
} from "./models";
import { OPEN_RADIUS, Track, TrackSlice, type Sector } from "./track";
import {
  bandTexture,
  checkerTexture,
  circuitTexture,
  hexTexture,
  rivetedMetalTexture,
  sunsetTexture,
  swirlTexture,
  tunnelTexture,
  type Rng
} from "./textures";

export type ObstacleKind = "plate" | "mine" | "shard" | "urchin" | "log" | "hex";

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
  mesh?: THREE.Object3D;
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
const PILOT_RADIUS = 0.9;
const LOG_RADIUS = 0.85;

/** Everything that makes up one course; disposed between races. */
export class RaceWorld {
  readonly group = new THREE.Group();
  readonly obstacles: Obstacle[] = [];
  readonly rings: Ring[] = [];
  private readonly spinners: Spinner[] = [];
  private readonly plates: Obstacle[] = [];
  private readonly swirls: THREE.Mesh[] = [];
  private readonly scrolling: THREE.Texture[] = [];
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
      // Exit funnel: red and tan panels, as the film's tunnel mouth.
      const funnelGeo = this.keep(new THREE.CylinderGeometry(radius, radius * 3.4, 16, 12, 1, true).toNonIndexed());
      funnelGeo.rotateX(Math.PI / 2);
      const colors: number[] = [];
      const red = new THREE.Color(0xc8283c);
      const tan = new THREE.Color(0xd8b98a);
      const count = funnelGeo.getAttribute("position").count;
      for (let i = 0; i < count; i += 1) {
        const c = Math.floor(i / 6) % 2 === 0 ? red : tan;
        colors.push(c.r, c.g, c.b);
      }
      funnelGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      funnelGeo.computeVertexNormals();
      const funnelMat = this.keep(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true, roughness: 0.5 }));
      const funnel = new THREE.Mesh(funnelGeo, funnelMat);
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
    const mesh = this.makeInstanced(geometry, [body, spikes], live + decor);
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
      log.rotateZ(angle);
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
      this.addBand(L, tube - 0.05, 4);
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
  collision(o: Obstacle, prevS: number, s: number, ox: number, oy: number, time: number): [number, number] | null {
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
      if (crossed && Math.abs(d) < LOG_RADIUS + 0.5 + PILOT_RADIUS) {
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

  update(time: number, dt: number): void {
    for (const plate of this.plates) {
      if (plate.mesh) {
        plate.mesh.rotation.z = this.plateAngle(plate, time);
      }
    }
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
  for (const sky of [circuit, sunset]) {
    sky.renderOrder = -1;
  }
  return { circuit, sunset };
}

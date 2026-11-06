import * as THREE from "three";
import { createMineGeometry, createShardGeometry } from "./models";
import { chevronTexture, hyperPanelTextures, makeHalo, profiledTube, pulseTubeMaterial } from "./remaster";
import type { Sector } from "./track";
import type { BoardKit, Obstacle } from "./world";

/*
 * HYPERTUBE, the "notre version" showcase board (docs/CYBER_RACE_NOTRE_VERSION.md): the film's
 * green tunnel reimagined in five phases. Shares of the board:
 *   0-8 % launch bay, 8-40 % hypertube, 40-66 % split, 66-92 % collapse, 92-100 % exit.
 */

const TAU = Math.PI * 2;
const GREEN = 0x2cff7a;
const ALERT = 0xff2a3a;

/** Board phases announced on the HUD (shares of the board). */
export const HYPERTUBE_PHASES = [
  { u: 0.4, name: "BIFURCATION", alert: false },
  { u: 0.66, name: "EFFONDREMENT", alert: true },
  { u: 0.92, name: "SORTIE", alert: false }
];

/** Bright unlit colour: values above 1 survive ACES tone mapping as a hot glow. */
function glow(color: number, strength: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength) });
}

export function buildHypertube(kit: BoardKit, sector: Sector): void {
  const { track, rng } = kit;
  const S = sector.start;
  const L = sector.end - sector.start;
  const at = (u: number): number => S + u * L;
  const radius = (s: number): number => track.tubeAt(s);
  const density = kit.difficulty.density;

  // ---------------------------------------------------------------- the tube
  const s0 = sector.index === 0 ? -80 : S;
  const s1 = track.sectorTail(sector) + 4;
  const panels = hyperPanelTextures();
  kit.keep(panels.map);
  kit.keep(panels.emissive);
  for (const t of [panels.map, panels.emissive]) t.repeat.set(1 / 14, 6);
  const { material: tubeMat, uniforms } = pulseTubeMaterial(panels.map, panels.emissive, {
    pulse: GREEN,
    alert: ALERT,
    alertFrom: at(0.64),
    alertTo: at(0.7),
    gap: 42,
    speed: 36,
    gain: 2.6
  });
  tubeMat.emissiveIntensity = 1.3;
  kit.keep(tubeMat);
  kit.group.add(new THREE.Mesh(kit.keep(profiledTube(track, s0, s1, radius, 28, 2)), tubeMat));
  kit.onUpdate((time) => {
    uniforms.uTime.value = time;
  });

  // ---------------------------------------------------------------- launch bay
  const ringMat = kit.keep(glow(GREEN, 3.2));
  for (const s of [S - 50, S + 70, S + 150, S + 230]) {
    const r = radius(s) - 1.2;
    const ring = new THREE.Mesh(kit.keep(new THREE.TorusGeometry(r, 0.35, 8, 64)), ringMat);
    kit.place(ring, s, 0, 0);
    kit.group.add(ring);
    for (let k = 0; k < 10; k += 1) {
      const a = (k / 10) * TAU;
      const halo = makeHalo(GREEN, 4.5, 0.7);
      kit.keep(halo.material);
      track.toWorld(s, Math.cos(a) * r, Math.sin(a) * r, halo.position);
      kit.group.add(halo);
    }
  }
  // Racks of small lights along the hangar walls.
  {
    const count = 260;
    const geo = kit.keep(new THREE.BoxGeometry(0.5, 0.18, 1.6));
    const mat = kit.keep(glow(0xb8ffe0, 2.2));
    const racks = kit.instanced(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < count; i += 1) {
      const s = S - 70 + rng() * (at(0.08) - S + 60);
      const a = Math.floor(rng() * 16) * (TAU / 16);
      const r = radius(s) - 0.25;
      track.toWorld(s, Math.cos(a) * r, Math.sin(a) * r, p);
      track.basis(s, q);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a + Math.PI / 2));
      m.compose(p, q, one);
      racks.setMatrixAt(i, m);
    }
    racks.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- boost pads
  const chevrons = kit.keep(chevronTexture());
  const padGeo = kit.keep(new THREE.PlaneGeometry(3.2, 8));
  padGeo.rotateX(-Math.PI / 2);
  const padMat = kit.keep(
    new THREE.MeshBasicMaterial({
      map: chevrons,
      color: new THREE.Color(1.8, 1.5, 0.6),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  const addPad = (s: number, a: number): void => {
    const r = radius(s);
    const holder = kit.crossSection(s);
    const pivot = new THREE.Group();
    pivot.rotation.z = a + Math.PI / 2;
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = -(r - 0.15);
    pivot.add(pad);
    holder.add(pivot);
    kit.group.add(holder);
    // Collected by flying within reach of a point just off the wall.
    kit.addBoost({ s, ox: Math.cos(a) * (r - 1.6), oy: Math.sin(a) * (r - 1.6), mesh: pad, taken: [false, false], flash: 0 });
  };

  // ---------------------------------------------------------------- destructible plates
  const plateMat = kit.keep(
    new THREE.MeshStandardMaterial({ color: 0xd8c0ff, metalness: 0.85, roughness: 0.22, emissive: 0x5a0848, emissiveIntensity: 0.9, side: THREE.DoubleSide })
  );
  const edgeMat = kit.keep(glow(0xff4fd0, 3));
  const addPlate = (s: number): void => {
    const r = radius(s) - 0.1;
    const span = Math.PI * kit.difficulty.plateSpan * (0.7 + rng() * 0.45);
    const spin = (rng() * 2 - 1) * kit.difficulty.plateSpin * 1.2;
    const holder = kit.crossSection(s);
    const spinner = new THREE.Group();
    const disc = new THREE.Mesh(kit.keep(new THREE.CircleGeometry(r, 32, 0, span)), plateMat);
    const edge = new THREE.Mesh(kit.keep(new THREE.RingGeometry(r - 0.5, r, 32, 1, 0, span)), edgeMat);
    edge.position.z = 0.05;
    const rimA = new THREE.Mesh(kit.keep(new THREE.PlaneGeometry(r, 0.25)), edgeMat);
    rimA.position.set(r / 2, 0, 0.06);
    const rimB = rimA.clone();
    rimB.rotation.z = span;
    rimB.position.set((Math.cos(span) * r) / 2, (Math.sin(span) * r) / 2, 0.06);
    const hub = makeHalo(0xff4fd0, 3, 0.9);
    kit.keep(hub.material);
    spinner.add(disc, edge, rimA, rimB, hub);
    holder.add(spinner);
    kit.group.add(holder);
    const plate: Obstacle = {
      kind: "plate",
      s,
      ox: 0,
      oy: 0,
      r: 0,
      angle: rng() * TAU,
      span,
      spin,
      mesh: spinner,
      breakable: true
    };
    kit.addPlate(plate);
  };

  // ---------------------------------------------------------------- phase 2: hypertube
  {
    let s = at(0.12);
    const step = 110 / density;
    while (s < at(0.38)) {
      addPlate(s);
      s += step * (1.2 + rng() * 0.9);
    }
    for (let s2 = at(0.1); s2 < at(0.39); s2 += 120 + rng() * 60) addPad(s2, rng() * TAU);
    for (let k = 0; k < 4; k += 1) {
      const s3 = at(0.13 + k * 0.07 + rng() * 0.03);
      const a = rng() * TAU;
      const rr = (radius(s3) - 4) * Math.sqrt(rng());
      kit.addRing(s3, Math.cos(a) * rr, Math.sin(a) * rr);
    }
  }

  // ---------------------------------------------------------------- phase 3: split
  {
    const gapLen = 22;
    const a0 = at(0.435);
    const g1 = at(0.5);
    const g2 = at(0.565);
    const a1 = at(0.64);
    const half = 0.55;
    const segments: Array<[number, number]> = [
      [a0, g1],
      [g1 + gapLen, g2],
      [g2 + gapLen, a1]
    ];
    // Hologram glass: a cyan grid you can see the other lane (and the rival) through.
    const gridCanvas = document.createElement("canvas");
    gridCanvas.width = gridCanvas.height = 128;
    const g = gridCanvas.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "rgba(40,160,200,0.22)";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "rgba(160,250,255,1)";
    g.fillRect(0, 0, 128, 3);
    g.fillRect(0, 0, 3, 128);
    g.fillStyle = "rgba(160,250,255,0.45)";
    g.fillRect(0, 63, 128, 2);
    g.fillRect(63, 0, 2, 128);
    const gridTex = kit.keep(new THREE.CanvasTexture(gridCanvas));
    gridTex.colorSpace = THREE.SRGBColorSpace;
    gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
    gridTex.anisotropy = 8;
    const wallMat = kit.keep(
      new THREE.MeshBasicMaterial({
        map: gridTex,
        color: new THREE.Color(1.6, 1.9, 2.0),
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    const lineMat = kit.keep(glow(0x60f0ff, 3));
    const frameMat = kit.keep(glow(0xffffff, 4));
    const strip = (sa: number, sb: number, y0: number, y1: number, material: THREE.Material): void => {
      const pts: number[] = [];
      const uvs: number[] = [];
      const idx: number[] = [];
      const p = new THREE.Vector3();
      let row = 0;
      for (let s = sa; s <= sb + 0.01; s += 4, row += 1) {
        const ss = Math.min(s, sb);
        track.toWorld(ss, 0, y0, p);
        pts.push(p.x, p.y, p.z);
        track.toWorld(ss, 0, y1, p);
        pts.push(p.x, p.y, p.z);
        // Two-metre grid cells.
        uvs.push(ss / 2, y0 / 2, ss / 2, y1 / 2);
        if (row > 0) {
          const k = row * 2;
          idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
        }
      }
      const geo = kit.keep(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      kit.group.add(new THREE.Mesh(geo, material));
    };
    for (const [sa, sb] of segments) {
      kit.addDivider(sa, sb, half);
      strip(sa, sb, -16, 16, wallMat);
      for (const y of [-7, 0, 7]) strip(sa, sb, y - 0.08, y + 0.08, lineMat);
      // Bright frames mark each end, so the gaps to switch lanes read from afar.
      for (const s of [sa, sb]) {
        strip(s - 0.3, s + 0.3, -16, 16, frameMat);
        for (const y of [-6, 0, 6]) {
          const halo = makeHalo(0xffffff, 3.5, 0.8);
          kit.keep(halo.material);
          track.toWorld(s, 0, y, halo.position);
          kit.group.add(halo);
        }
      }
    }
    // Left lane: mines worth breaking, rings and boosts (risky, rewarding).
    const metal = kit.keep(
      new THREE.MeshStandardMaterial({ color: 0x3a4650, metalness: 0.8, roughness: 0.3, flatShading: true, emissive: 0x200810 })
    );
    const spikes = kit.keep(
      new THREE.MeshStandardMaterial({ color: 0xff5a40, emissive: 0xc0200a, emissiveIntensity: 1.2, metalness: 0.4, roughness: 0.3, flatShading: true })
    );
    const mineCount = Math.max(6, Math.round(((a1 - a0) / 100) * density * 1.6));
    const mines = kit.instanced(kit.keep(createMineGeometry()), [metal, spikes], mineCount);
    const placed: Array<[number, number, number, number]> = [];
    for (let i = 0; i < mineCount; i += 1) {
      const s = a0 + 30 + rng() * (a1 - a0 - 40);
      const r = radius(s) - 2.2;
      const a = Math.PI / 2 + 0.25 + rng() * (Math.PI - 0.5);
      const rr = 2.2 + rng() * (r - 2.2);
      const ox = Math.min(-1.9, Math.cos(a) * rr);
      const oy = Math.sin(a) * rr;
      const size = 0.9 + rng() * 0.7;
      placed.push([s, ox, oy, size]);
      const handle = kit.spinner(mines, i, s, ox, oy, size, 0.5 + rng());
      kit.addObstacle({ kind: "mine", s, ox, oy, r: size, angle: 0, span: 0, spin: 0, breakable: true, onDestroy: () => handle.hide() });
    }
    mines.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < 4; k += 1) {
      const s = a0 + ((k + 0.5) / 4) * (a1 - a0);
      // Keep each lane ring clear of the lane's mines, so it can always be taken.
      const ox = -(radius(s) * 0.5);
      let oy = (rng() * 2 - 1) * 3;
      const blocked = (y: number): boolean =>
        placed.some(([ms, mx, my, mr]) => Math.abs(ms - s) < mr + 1.5 && Math.hypot(mx - ox, my - y) < mr + 1.2);
      for (const y of [oy, 0, 3, -3, 5, -5]) {
        if (!blocked(y)) {
          oy = y;
          break;
        }
      }
      kit.addRing(s, ox, oy);
      addPad(s + 40, Math.PI + (rng() * 2 - 1) * 0.6);
    }
    // Right lane: clear, one boost.
    addPad(at(0.53), (rng() * 2 - 1) * 0.6);
  }

  // ---------------------------------------------------------------- phase 4: collapse
  {
    const bladeBody = kit.keep(
      new THREE.MeshStandardMaterial({ color: 0x8a6a70, metalness: 0.85, roughness: 0.25, emissive: 0x6a0a14, emissiveIntensity: 0.8 })
    );
    const bladeEdge = kit.keep(glow(ALERT, 3.5));
    const count = Math.max(4, Math.round(5 * Math.sqrt(density)));
    for (let k = 0; k < count; k += 1) {
      const s = at(0.7 + (k / count) * 0.2);
      const r = radius(s);
      const blades = 10;
      const len = r;
      const iris: Obstacle = {
        kind: "iris",
        s,
        ox: 0,
        oy: 0,
        r: 2.4,
        angle: 0,
        span: 0,
        spin: 1.3 + rng() * 0.9,
        gap: r - 1.4,
        phase: rng() * TAU
      };
      const holder = kit.crossSection(s);
      const parts: THREE.Object3D[] = [];
      const width = ((TAU * (r - 1)) / blades) * 1.15;
      const bodyGeo = kit.keep(new THREE.BoxGeometry(width, len, 0.25));
      const edgeGeo = kit.keep(new THREE.BoxGeometry(width, 0.22, 0.3));
      for (let b = 0; b < blades; b += 1) {
        const pivot = new THREE.Group();
        pivot.rotation.z = (b / blades) * TAU;
        const blade = new THREE.Group();
        const body = new THREE.Mesh(bodyGeo, bladeBody);
        body.position.y = len / 2;
        const edge = new THREE.Mesh(edgeGeo, bladeEdge);
        edge.position.y = 0.1;
        blade.add(body, edge);
        pivot.add(blade);
        holder.add(pivot);
        parts.push(blade);
      }
      const frame = new THREE.Mesh(kit.keep(new THREE.TorusGeometry(r - 0.3, 0.2, 6, 48)), bladeEdge);
      holder.add(frame);
      kit.group.add(holder);
      iris.parts = parts;
      iris.mesh = holder;
      kit.addObstacle(iris);
      kit.onUpdate((time) => {
        const gap = 2.4 + ((iris.gap ?? 6) - 2.4) * (0.5 + 0.5 * Math.sin(time * iris.spin + (iris.phase ?? 0)));
        for (const part of parts) part.position.y = gap;
      });
    }
    // Debris torn from the walls, tumbling in the red light.
    const debrisMat = kit.keep(new THREE.MeshStandardMaterial({ color: 0x2a1a1c, metalness: 0.7, roughness: 0.4, emissive: 0x3a0408, flatShading: true }));
    const debrisCount = 140;
    const debris = kit.instanced(kit.keep(createShardGeometry()), debrisMat, debrisCount);
    for (let i = 0; i < debrisCount; i += 1) {
      const s = at(0.67) + rng() * (at(0.92) - at(0.67));
      const a = rng() * TAU;
      const rr = radius(s) - 0.8 - rng() * 1.6;
      kit.spinner(debris, i, s, Math.cos(a) * rr, Math.sin(a) * rr, 0.4 + rng() * 0.9, 0.6 + rng() * 1.6);
    }
    debris.instanceMatrix.needsUpdate = true;
    for (let s = at(0.68); s < at(0.9); s += 160) addPad(s, rng() * TAU);
    kit.addRing(at(0.8), 0, 0);
  }

  // ---------------------------------------------------------------- phase 5: exit gate
  {
    const s = sector.end;
    const r = radius(s) - 1.5;
    const gateMat = kit.keep(glow(0xffffff, 6));
    const gate = new THREE.Mesh(kit.keep(new THREE.TorusGeometry(r, 0.6, 10, 72)), gateMat);
    kit.place(gate, s, 0, 0);
    kit.group.add(gate);
    for (let k = 0; k < 16; k += 1) {
      const a = (k / 16) * TAU;
      const halo = makeHalo(k % 2 ? GREEN : 0xffffff, 7, 0.8);
      kit.keep(halo.material);
      track.toWorld(s, Math.cos(a) * r, Math.sin(a) * r, halo.position);
      kit.group.add(halo);
    }
    // The light beyond: a glowing disc far down the run-out.
    const beyond = track.sectorTail(sector) - 20;
    const disc = new THREE.Mesh(kit.keep(new THREE.CircleGeometry(radius(beyond) - 0.2, 48)), kit.keep(glow(0xeafff2, 3)));
    const holder = kit.crossSection(beyond);
    holder.add(disc);
    kit.group.add(holder);
  }
}

import * as THREE from "three";
import { createMineGeometry } from "./models";
import { makeHalo } from "./remaster";
import { OPEN_RADIUS, RHYTHM_MAX, type Sector } from "./track";
import type { BoardKit, Obstacle } from "./world";

/*
 * CHAMP MAGNÉTIQUE, notre version of the mine field (docs/CYBER_RACE_NOTRE_VERSION.md, B-02).
 * One colour code, readable at a glance:
 *   gold mines hold still (the film's mines),
 *   red mines drift towards the nearest pilot coming at them,
 *   cyan mines are linked by electric arcs: one pulse sets off the whole cluster.
 * Shares of the board: 0-8 % entry gates, 8-30 % field, 30-50 % ESSAIM (rotating necklaces),
 * 50-58 % breather with boost gates, 60-92 % TEMPÊTE (more drifting mines, big clusters), exit.
 */

const TAU = Math.PI * 2;
const GOLD = 0xf2c230;
const RED = 0xff3040;
const CYAN = 0x40f0ff;
const VIOLET = 0xb060ff;
/** Cluster mines closer than this (metres) are linked: one going off lights the other. */
const LINK = 7.5;
/** A red mine wakes when a pilot is this close behind it... */
const DRIFT_REACH = 95;
/** ...and stops steering in the last metres, so a late dodge always works. */
const DRIFT_HOLD = 12;
const MAX_LATERAL = OPEN_RADIUS - 1.2;

type MineKind = "still" | "drift" | "linked";

interface Spec {
  kind: MineKind;
  s: number;
  ox: number;
  oy: number;
  size: number;
  orbit?: { cx: number; cy: number; r: number; a: number; w: number };
}

interface Mine extends Spec {
  o: Obstacle;
  mesh: THREE.InstancedMesh;
  index: number;
  base: THREE.Quaternion;
  axis: THREE.Vector3;
  spin: number;
  vx: number;
  vy: number;
  awake: number;
  halo?: THREE.Sprite;
  gone: boolean;
}

/** Bright unlit colour: values above 1 survive ACES tone mapping as a hot glow. */
function glow(color: number, strength: number, fog = true): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), fog });
}

export function buildMagneticField(kit: BoardKit, sector: Sector): void {
  const { track, rng } = kit;
  const S = sector.start;
  const L = sector.end - sector.start;
  const at = (u: number): number => S + u * L;
  const density = kit.difficulty.density;
  const rhythm = sector.info.rhythm;

  /** A place in [ua, ub] drawn along the board's rhythm: peaks crowd, calm stretches thin out. */
  const spread = (ua: number, ub: number): number => {
    let u = ua;
    for (let k = 0; k < 24; k += 1) {
      u = ua + rng() * (ub - ua);
      if (!rhythm || rng() * RHYTHM_MAX <= rhythm(u)) break;
    }
    return at(u);
  };
  const lateral = (maxR: number, bias: number): [number, number] => {
    const a = rng() * TAU;
    const r = maxR * Math.pow(rng(), bias);
    return [Math.cos(a) * r, Math.sin(a) * r];
  };

  // ---------------------------------------------------------------- layout
  const specs: Spec[] = [];
  const groups: number[][] = [];
  /** Stretches kept clear around each necklace, so its middle stays a way through. */
  const clear: Array<[number, number]> = [];
  const blocked = (s: number): boolean => clear.some(([a, b]) => s > a && s < b);

  // Necklaces: helices of linked mines turning around the line. Fly through the middle, or
  // pulse one and the whole necklace goes up.
  const necklaceAt = [0.33, 0.39, 0.45, 0.66, 0.78];
  if (density > 1.2) necklaceAt.push(0.86);
  for (const u of necklaceAt) {
    const s0 = at(u + (rng() - 0.5) * 0.02);
    const [cx, cy] = lateral(3, 1);
    const r = 7.2 + rng() * 1.4;
    const n = 10 + Math.floor(rng() * 3);
    const w = (rng() < 0.5 ? -1 : 1) * (0.45 + 0.2 * Math.min(density, 2.2));
    const a0 = rng() * TAU;
    const group: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const a = a0 + (i / n) * TAU;
      group.push(specs.length);
      specs.push({ kind: "linked", s: s0 + i * 1.4, ox: cx + Math.cos(a) * r, oy: cy + Math.sin(a) * r, size: 0.95, orbit: { cx, cy, r, a, w } });
    }
    groups.push(group);
    clear.push([s0 - 22, s0 + n * 1.4 + 18]);
  }

  // Clusters: still balls of linked mines.
  const clusters = Math.round((L / 260) * (0.6 + 0.4 * density));
  for (let c = 0; c < clusters; c += 1) {
    let s0 = spread(0.12, 0.9);
    for (let k = 0; k < 8 && blocked(s0); k += 1) s0 = spread(0.12, 0.9);
    if (blocked(s0)) continue;
    const [cx, cy] = lateral(OPEN_RADIUS - 6, 1);
    const n = 5 + Math.floor(rng() * 3) + (density > 1.2 ? 2 : 0);
    const group: number[] = [];
    for (let i = 0, tries = 0; i < n && tries < 60; tries += 1) {
      const s = s0 + (rng() * 2 - 1) * 5;
      const ox = cx + (rng() * 2 - 1) * 5;
      const oy = cy + (rng() * 2 - 1) * 5;
      if (Math.hypot(ox, oy) > MAX_LATERAL) continue;
      const near = group.some((j) => Math.hypot(specs[j].s - s, specs[j].ox - ox, specs[j].oy - oy) < 2.9);
      if (near) continue;
      group.push(specs.length);
      specs.push({ kind: "linked", s, ox, oy, size: 0.9 + rng() * 0.5 });
      i += 1;
    }
    groups.push(group);
  }

  // Single mines: gold ones hold still, red ones drift; more red as the storm builds.
  const singles = Math.round((L / 100) * density * 1.6);
  for (let i = 0; i < singles; i += 1) {
    const s = spread(0.07, 0.95);
    if (blocked(s)) continue;
    const u = (s - S) / L;
    const driftShare = u < 0.3 ? 0.25 : u < 0.6 ? 0.35 : u < 0.92 ? 0.55 : 0.2;
    const drift = rng() < driftShare;
    const [ox, oy] = lateral(OPEN_RADIUS - 1.5, 0.8);
    specs.push({ kind: drift ? "drift" : "still", s, ox, oy, size: drift ? 1 + rng() * 0.6 : 1.1 + rng() * 1.3 });
  }

  // ---------------------------------------------------------------- mines
  const geometry = kit.keep(createMineGeometry());
  // Each kind gets a body tinted with its colour and hot spikes, so the code reads from afar.
  const body = (tint: number): THREE.MeshStandardMaterial =>
    kit.keep(new THREE.MeshStandardMaterial({ color: 0x30343c, metalness: 0.55, roughness: 0.4, flatShading: true, emissive: tint }));
  const spikes = (color: number, k: number): THREE.MeshStandardMaterial =>
    kit.keep(
      new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(k), metalness: 0.3, roughness: 0.3, flatShading: true })
    );
  const looks: Record<MineKind, [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]> = {
    still: [body(0x2a1c00), spikes(GOLD, 1.1)],
    drift: [body(0x4a0610), spikes(RED, 1.5)],
    linked: [body(0x00303a), spikes(CYAN, 1.1)]
  };
  const meshes = {} as Record<MineKind, THREE.InstancedMesh>;
  const counters: Record<MineKind, number> = { still: 0, drift: 0, linked: 0 };
  for (const kind of ["still", "drift", "linked"] as const) {
    const count = specs.filter((sp) => sp.kind === kind).length;
    meshes[kind] = kit.instanced(geometry, looks[kind], Math.max(1, count));
    meshes[kind].count = count;
  }

  const redHalo = makeHalo(RED, 4, 1.8);
  kit.keep(redHalo.material);
  kit.keep(redHalo.material.map as THREE.Texture);
  const cyanHalo = kit.keep(redHalo.material.clone());
  cyanHalo.color.setHex(CYAN).multiplyScalar(0.9);
  const mines: Mine[] = [];
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const spec of specs) {
    const mesh = meshes[spec.kind];
    const index = counters[spec.kind];
    counters[spec.kind] += 1;
    const o: Obstacle = { kind: "mine", s: spec.s, ox: spec.ox, oy: spec.oy, r: spec.size, angle: 0, span: 0, spin: 0, breakable: true };
    if (spec.orbit) {
      o.aim = [spec.orbit.cx, spec.orbit.cy];
      // The necklace's clear middle, for rings placed through it.
      o.gap = spec.orbit.r - spec.size;
    }
    const mine: Mine = {
      ...spec,
      o,
      mesh,
      index,
      base: new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * TAU, rng() * TAU, rng() * TAU)),
      axis: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(),
      spin: 0.4 + rng() * 0.8,
      vx: 0,
      vy: 0,
      awake: 0,
      gone: false
    };
    if (spec.kind === "drift") {
      const halo = new THREE.Sprite(kit.keep(redHalo.material.clone()));
      halo.scale.setScalar(spec.size * 4);
      track.toWorld(spec.s, spec.ox, spec.oy, halo.position);
      kit.group.add(halo);
      mine.halo = halo;
    } else if (spec.kind === "linked") {
      // Linked mines share one soft cyan glow material.
      const halo = new THREE.Sprite(cyanHalo);
      halo.scale.setScalar(spec.size * 3);
      track.toWorld(spec.s, spec.ox, spec.oy, halo.position);
      kit.group.add(halo);
      mine.halo = halo;
    }
    o.onDestroy = () => {
      mine.gone = true;
      mesh.setMatrixAt(index, zero);
      mesh.instanceMatrix.needsUpdate = true;
      if (mine.halo) mine.halo.visible = false;
      shock(o, mine.kind === "drift" ? RED : mine.kind === "linked" ? CYAN : GOLD);
    };
    kit.addObstacle(o);
    mines.push(mine);
  }

  // Links: every pair of mines of a group within reach, drawn as an arc.
  const arcs: Array<{ a: Mine; b: Mine }> = [];
  for (const group of groups) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = mines[group[i]];
        const b = mines[group[j]];
        if (Math.hypot(a.s - b.s, a.ox - b.ox, a.oy - b.oy) > LINK) continue;
        (a.o.chain ??= []).push(b.o);
        (b.o.chain ??= []).push(a.o);
        arcs.push({ a, b });
      }
    }
  }
  const arcGeo = kit.keep(new THREE.BoxGeometry(1, 1, 1));
  const arcMat = kit.keep(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(CYAN).multiplyScalar(1.8),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  const arcMesh = kit.instanced(arcGeo, arcMat, Math.max(1, arcs.length));
  arcMesh.count = arcs.length;

  // ---------------------------------------------------------------- posing
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const spinQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);

  const pose = (m: Mine, time: number): void => {
    track.toWorld(m.o.s, m.o.ox, m.o.oy, pa);
    spinQ.setFromAxisAngle(m.axis, time * m.spin);
    tmpQ.copy(m.base).premultiply(spinQ);
    tmpM.compose(pa, tmpQ, tmpS.setScalar(m.size));
    m.mesh.setMatrixAt(m.index, tmpM);
    if (m.halo) {
      m.halo.position.copy(pa);
      if (m.kind === "drift") {
        const beat = 0.5 + 0.5 * Math.sin(time * 9 + m.index);
        m.halo.scale.setScalar(m.size * (3.5 + m.awake * (3 + 2 * beat)));
      }
    }
  };
  const poseArc = (k: number, time: number): void => {
    const { a, b } = arcs[k];
    if (a.gone || b.gone) {
      arcMesh.setMatrixAt(k, zero);
      return;
    }
    track.toWorld(a.o.s, a.o.ox, a.o.oy, pa);
    track.toWorld(b.o.s, b.o.ox, b.o.oy, pb);
    const len = pa.distanceTo(pb);
    pb.sub(pa);
    tmpQ.setFromUnitVectors(zAxis, pb.normalize());
    pa.addScaledVector(pb, len / 2);
    // Electric flicker: the arc's thickness jitters every frame.
    const th = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(time * 41 + k * 7.3) * Math.sin(time * 23 + k));
    tmpM.compose(pa, tmpQ, tmpS.set(th, th, Math.max(0.1, len - (a.size + b.size) * 0.9)));
    arcMesh.setMatrixAt(k, tmpM);
  };
  for (const m of mines) pose(m, 0);
  for (let k = 0; k < arcs.length; k += 1) poseArc(k, 0);

  // ---------------------------------------------------------------- shock waves
  const shocks: Array<{ mesh: THREE.Mesh; flare: THREE.Sprite; t: number }> = [];
  const shockGeo = kit.keep(new THREE.SphereGeometry(1, 20, 12));
  for (let i = 0; i < 10; i += 1) {
    const mat = kit.keep(
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const mesh = new THREE.Mesh(shockGeo, mat);
    mesh.visible = false;
    const flare = new THREE.Sprite(kit.keep(redHalo.material.clone()));
    flare.visible = false;
    kit.group.add(mesh, flare);
    shocks.push({ mesh, flare, t: 1 });
  }
  let nextShock = 0;
  function shock(o: Obstacle, color: number): void {
    const sh = shocks[nextShock];
    nextShock = (nextShock + 1) % shocks.length;
    track.toWorld(o.s, o.ox, o.oy, sh.mesh.position);
    sh.flare.position.copy(sh.mesh.position);
    (sh.mesh.material as THREE.MeshBasicMaterial).color.setHex(color).multiplyScalar(2.5);
    (sh.flare.material as THREE.SpriteMaterial).color.setHex(color).multiplyScalar(3);
    sh.t = 0;
    sh.mesh.visible = sh.flare.visible = true;
  }

  // ---------------------------------------------------------------- entry gates
  for (const [k, u] of [0.012, 0.035, 0.06].entries()) {
    const s = at(u);
    const r = OPEN_RADIUS + 1.5;
    const color = k % 2 ? CYAN : VIOLET;
    const ring = new THREE.Mesh(kit.keep(new THREE.TorusGeometry(r, 0.35, 8, 72)), kit.keep(glow(color, 3.2)));
    kit.place(ring, s, 0, 0);
    kit.group.add(ring);
    const haloBase = makeHalo(color, 4.5, 1);
    kit.keep(haloBase.material);
    kit.keep(haloBase.material.map as THREE.Texture);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU;
      const halo = new THREE.Sprite(haloBase.material);
      halo.scale.setScalar(4.5);
      track.toWorld(s, Math.cos(a) * r, Math.sin(a) * r, halo.position);
      kit.group.add(halo);
    }
  }

  // ---------------------------------------------------------------- field lines
  // Loops rising off the corridor's sides like the lines of a magnet's field; red in the storm.
  const lineMats = [kit.keep(glow(CYAN, 2.2)), kit.keep(glow(VIOLET, 2.4)), kit.keep(glow(RED, 2.6))];
  const loopBasis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
  for (let s = at(0.03); s < at(0.97); ) {
    const u = (s - S) / L;
    const storm = u > 0.6 && u < 0.92;
    const R = 20 + rng() * 26;
    const holder = kit.crossSection(s);
    const turn = new THREE.Group();
    turn.rotation.z = rng() * TAU;
    const loop = new THREE.Mesh(kit.keep(new THREE.TorusGeometry(R, 0.28, 6, 64, Math.PI)), lineMats[storm ? 2 : Math.floor(rng() * 2)]);
    loop.quaternion.setFromRotationMatrix(loopBasis);
    loop.position.x = OPEN_RADIUS + 4 + rng() * 10;
    turn.add(loop);
    holder.add(turn);
    kit.group.add(holder);
    s += storm ? 70 + rng() * 50 : 120 + rng() * 90;
  }

  // ---------------------------------------------------------------- the core
  // A star-sized magnet far off to the side, its field rings turning slowly. Drawn through the fog.
  const core = new THREE.Group();
  track.toWorld(at(0.5), -260, 80, core.position);
  track.basis(at(0.5), core.quaternion);
  core.add(new THREE.Mesh(kit.keep(new THREE.SphereGeometry(48, 32, 20)), kit.keep(glow(0xffd8f4, 2.4, false))));
  const coreHalo = makeHalo(0xff80e0, 340, 1.4);
  kit.keep(coreHalo.material);
  kit.keep(coreHalo.material.map as THREE.Texture);
  coreHalo.material.fog = false;
  core.add(coreHalo);
  const coreRings: THREE.Mesh[] = [];
  for (const [k, r] of [86, 118, 152].entries()) {
    const ring = new THREE.Mesh(kit.keep(new THREE.TorusGeometry(r, 1.4, 8, 120)), kit.keep(glow(k === 1 ? CYAN : VIOLET, 2.6, false)));
    ring.rotation.set(1.1 + k * 0.35, k * 0.8, 0);
    core.add(ring);
    coreRings.push(ring);
  }
  kit.group.add(core);

  // ---------------------------------------------------------------- boost gates
  const gateGeo = kit.keep(new THREE.TorusGeometry(3, 0.22, 6, 6));
  const gateMat = kit.keep(glow(GOLD, 3.6));
  const gates: Array<{ mesh: THREE.Mesh; pad: { flash: number } }> = [];
  for (const u of [0.1, 0.52, 0.545, 0.57, 0.94]) {
    const s = at(u);
    const [ox, oy] = lateral(6, 1);
    const holder = new THREE.Group();
    kit.place(holder, s, ox, oy);
    const mesh = new THREE.Mesh(gateGeo, gateMat);
    holder.add(mesh);
    const flare = makeHalo(GOLD, 9, 1.2);
    kit.keep(flare.material);
    kit.keep(flare.material.map as THREE.Texture);
    flare.position.copy(holder.position);
    kit.group.add(holder, flare);
    const pad = { s, ox, oy, mesh, taken: [false, false] as [boolean, boolean], flash: 0 };
    kit.addBoost(pad);
    gates.push({ mesh, pad });
  }

  // ---------------------------------------------------------------- exit gate
  {
    const s = sector.end;
    const r = OPEN_RADIUS + 2;
    const gate = new THREE.Mesh(kit.keep(new THREE.TorusGeometry(r, 0.5, 10, 96)), kit.keep(glow(0xffffff, 5)));
    kit.place(gate, s, 0, 0);
    kit.group.add(gate);
    const haloBase = makeHalo(VIOLET, 6, 1);
    kit.keep(haloBase.material);
    kit.keep(haloBase.material.map as THREE.Texture);
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * TAU;
      const halo = new THREE.Sprite(haloBase.material);
      halo.scale.setScalar(6);
      track.toWorld(s, Math.cos(a) * r, Math.sin(a) * r, halo.position);
      kit.group.add(halo);
    }
  }

  // ---------------------------------------------------------------- distant mines
  {
    // Dull and dark, so they never read as live mines.
    const decorCount = Math.round(160 * Math.max(1, L / 1000));
    const decorBody = kit.keep(new THREE.MeshStandardMaterial({ color: 0x1a1c26, metalness: 0.3, roughness: 0.7, flatShading: true }));
    const decorSpikes = kit.keep(new THREE.MeshStandardMaterial({ color: 0x4a3a6a, emissive: 0x1a1030, metalness: 0.3, roughness: 0.6, flatShading: true }));
    const decor = kit.instanced(geometry, [decorBody, decorSpikes], decorCount);
    for (let i = 0; i < decorCount; i += 1) {
      const s = S - 60 + rng() * (L + 160);
      const a = rng() * TAU;
      const rr = 32 + rng() * 110;
      kit.spinner(decor, i, s, Math.cos(a) * rr, Math.sin(a) * rr, 2 + rng() * 5, 0.1 + rng() * 0.4);
    }
    decor.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- every frame
  const vmax = 1.6 + density;
  kit.onUpdate((time, dt, focus) => {
    const lo = focus.length ? Math.min(...focus) - 30 : S;
    const hi = focus.length ? Math.max(...focus) + 420 : S + 600;
    if (hi < S - 60 || lo > sector.end + 60) {
      for (const sh of shocks) if (sh.t < 1) sh.t = 1;
    } else {
      const pilots = kit.pilots();
      for (const m of mines) {
        if (m.gone || m.o.s < lo || m.o.s > hi) continue;
        if (m.orbit) {
          const a = m.orbit.a + m.orbit.w * time;
          m.o.ox = m.orbit.cx + Math.cos(a) * m.orbit.r;
          m.o.oy = m.orbit.cy + Math.sin(a) * m.orbit.r;
        } else if (m.kind === "drift") {
          let target: { ox: number; oy: number } | null = null;
          let best = DRIFT_REACH;
          for (const p of pilots) {
            const ahead = m.o.s - p.s;
            if (ahead > DRIFT_HOLD && ahead < best) {
              best = ahead;
              target = p;
            }
          }
          if (target) {
            const dx = target.ox - m.o.ox;
            const dy = target.oy - m.o.oy;
            const d = Math.hypot(dx, dy) || 1;
            const want = Math.min(vmax, d * 1.5);
            const k = 1 - Math.exp(-3 * dt);
            m.vx += ((dx / d) * want - m.vx) * k;
            m.vy += ((dy / d) * want - m.vy) * k;
            m.awake = Math.min(1, m.awake + dt * 3);
          } else {
            const k = Math.exp(-2 * dt);
            m.vx *= k;
            m.vy *= k;
            m.awake = Math.max(0, m.awake - dt * 2);
          }
          m.o.ox += m.vx * dt;
          m.o.oy += m.vy * dt;
          const r = Math.hypot(m.o.ox, m.o.oy);
          if (r > MAX_LATERAL) {
            m.o.ox *= MAX_LATERAL / r;
            m.o.oy *= MAX_LATERAL / r;
          }
        }
        pose(m, time);
      }
      for (const kind of ["still", "drift", "linked"] as const) meshes[kind].instanceMatrix.needsUpdate = true;
      for (let k = 0; k < arcs.length; k += 1) {
        const s = arcs[k].a.o.s;
        if (s >= lo && s <= hi) poseArc(k, time);
      }
      arcMesh.instanceMatrix.needsUpdate = true;
      arcMat.opacity = 0.65 + 0.35 * Math.abs(Math.sin(time * 17));
    }
    for (const sh of shocks) {
      if (sh.t >= 1) {
        sh.mesh.visible = sh.flare.visible = false;
        continue;
      }
      sh.t = Math.min(1, sh.t + dt / 0.5);
      sh.mesh.scale.setScalar(1 + 9 * sh.t);
      (sh.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - sh.t) * (1 - sh.t) * 0.8;
      sh.flare.scale.setScalar(22 * (1 - sh.t) + 2);
    }
    // Storm light: the field lines pulse, faster and harder in the red ones.
    const beat = 0.5 + 0.5 * Math.sin(time * 2.4);
    lineMats[0].color.setHex(CYAN).multiplyScalar(0.9 + 0.6 * beat);
    lineMats[1].color.setHex(VIOLET).multiplyScalar(1.1 + 0.6 * beat);
    lineMats[2].color.setHex(RED).multiplyScalar(1.2 + 1.2 * Math.abs(Math.sin(time * 5)));
    coreRings.forEach((ring, k) => {
      ring.rotation.z = time * (0.05 + k * 0.03) * (k % 2 ? -1 : 1);
    });
    for (const g of gates) {
      g.mesh.rotation.z = time * 1.5;
      g.mesh.scale.setScalar(1 + g.pad.flash * 0.6);
    }
  });
}

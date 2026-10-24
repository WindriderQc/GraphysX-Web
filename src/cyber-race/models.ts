import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Colours of one pilot. Models face +z with +y up. */
export interface FlyerLook {
  suit: number;
  limbs: number;
  shorts: number;
  wing: number;
  wingEdge: number;
  jet: number;
  flame: number;
  mask: number;
  trail: number;
}

export const JOBE_LOOK: FlyerLook = {
  suit: 0x4a1c4e,
  limbs: 0x5a2260,
  shorts: 0x2b2f9e,
  wing: 0xd8263f,
  wingEdge: 0xf2f2f6,
  jet: 0xd02238,
  flame: 0xb84dff,
  mask: 0x2848c8,
  trail: 0xb040ff
};

export const PETER_LOOK: FlyerLook = {
  suit: 0xdcc8b8,
  limbs: 0xe6d3c4,
  shorts: 0x2236a8,
  wing: 0xf0f2f8,
  wingEdge: 0x2f5ae0,
  jet: 0x3a5ee8,
  flame: 0x6fa8ff,
  mask: 0x1f2f8a,
  trail: 0x3f8cff
};

export interface FlyerModel {
  root: THREE.Group;
  /** Exhaust cones, scaled with thrust. */
  flames: THREE.Mesh[];
}

function std(color: number, roughness = 0.4, metalness = 0.15): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function alongZ(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function wingGeometry(points: Array<[number, number]>, depth: number): THREE.BufferGeometry {
  // Shape is drawn in (x, -z); rotateX(-90deg) maps shape y to -z.
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** A prone jet-winged pilot, after the two racers of the 1992 film. */
export function createFlyer(look: FlyerLook): FlyerModel {
  const root = new THREE.Group();
  const suit = std(look.suit, 0.3, 0.25);
  const limbs = std(look.limbs, 0.45, 0.1);
  const shorts = std(look.shorts, 0.35, 0.2);
  const wing = std(look.wing, 0.3, 0.35);
  const wingEdge = std(look.wingEdge, 0.3, 0.35);
  wing.side = THREE.DoubleSide;
  wingEdge.side = THREE.DoubleSide;
  const jet = std(look.jet, 0.25, 0.5);

  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };

  add(alongZ(new THREE.CapsuleGeometry(0.38, 0.9, 6, 14)), suit, 0, 0, 0.2);
  const hips = add(new THREE.SphereGeometry(0.4, 14, 10), shorts, 0, -0.02, -0.45);
  hips.scale.set(1, 0.75, 1.05);
  for (const side of [-1, 1]) {
    const leg = add(alongZ(new THREE.CapsuleGeometry(0.16, 1.15, 5, 10)), limbs, side * 0.21, -0.05, -1.3);
    leg.rotation.y = side * 0.05;
    add(new THREE.BoxGeometry(0.2, 0.32, 0.18), limbs, side * 0.25, -0.12, -2.05);
    const arm = add(alongZ(new THREE.CapsuleGeometry(0.12, 0.85, 5, 10)), limbs, side * 0.46, -0.12, 0.3);
    arm.rotation.y = -side * 0.08;
  }

  add(new THREE.SphereGeometry(0.3, 16, 12), wingEdge, 0, 0.08, 1.02);
  const mask = add(
    new THREE.SphereGeometry(0.26, 16, 12),
    new THREE.MeshStandardMaterial({ color: look.mask, roughness: 0.15, metalness: 0.6 }),
    0,
    0.06,
    1.16
  );
  mask.scale.set(1, 0.85, 0.75);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffe14a });
  for (const side of [-1, 1]) {
    add(new THREE.SphereGeometry(0.045, 8, 6), eyeMaterial, side * 0.09, 0.1, 1.34);
  }

  // Back pack and swept wings.
  add(new THREE.BoxGeometry(0.72, 0.24, 1.15), wingEdge, 0, 0.34, 0.05);
  const mainWing = wingGeometry(
    [
      [0.25, 0.55],
      [2.45, -0.75],
      [2.55, -1.05],
      [0.25, -0.45]
    ],
    0.07
  );
  const edgeWing = wingGeometry(
    [
      [0.25, 0.55],
      [2.45, -0.75],
      [2.35, -0.55],
      [0.25, 0.3]
    ],
    0.08
  );
  for (const side of [-1, 1]) {
    const w = add(mainWing, wing, 0, 0.36, 0);
    const e = add(edgeWing, wingEdge, 0, 0.375, 0);
    for (const m of [w, e]) {
      m.scale.x = side;
      m.rotation.z = side * 0.08;
    }
  }
  const fin = add(
    wingGeometry(
      [
        [0, 0.1],
        [0, -0.9],
        [0.05, -1.0],
        [0.05, 0.1]
      ],
      0.6
    ),
    wing,
    -0.03,
    0.45,
    -0.1
  );
  fin.rotation.z = Math.PI / 2;

  const flames: THREE.Mesh[] = [];
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: look.flame,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  for (const side of [-1, 1]) {
    const x = side * 1.05;
    add(alongZ(new THREE.CylinderGeometry(0.15, 0.2, 1.35, 14)), jet, x, 0.32, -0.35);
    const nose = add(new THREE.SphereGeometry(0.15, 12, 8), jet, x, 0.32, 0.32);
    nose.scale.z = 1.8;
    const ringMesh = add(alongZ(new THREE.TorusGeometry(0.19, 0.04, 6, 14)), wingEdge, x, 0.32, -1.02);
    ringMesh.rotation.x = 0;
    const flameGeo = new THREE.ConeGeometry(0.17, 1.5, 12, 1, true);
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.75);
    const flame = add(flameGeo, flameMaterial, x, 0.32, -1.03);
    const coreGeo = new THREE.ConeGeometry(0.08, 0.8, 8, 1, true);
    coreGeo.rotateX(-Math.PI / 2);
    coreGeo.translate(0, 0, -0.4);
    const core = add(coreGeo, coreMaterial, x, 0.32, -1.03);
    flames.push(flame, core);
  }

  return { root, flames };
}

/** Unique directions of the dodecahedron face centres (= icosahedron vertices). */
function faceDirections(): THREE.Vector3[] {
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const pos = ico.getAttribute("position");
  const seen = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i += 1) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    seen.set(key, v);
  }
  ico.dispose();
  return [...seen.values()];
}

/** Spiked riveted dodecahedron (group 0 = metal, group 1 = spikes), unit radius. */
export function createMineGeometry(): THREE.BufferGeometry {
  const body = new THREE.DodecahedronGeometry(1, 0);
  body.computeVertexNormals();
  const spikes: THREE.BufferGeometry[] = [];
  const upY = new THREE.Vector3(0, 1, 0);
  for (const dir of faceDirections()) {
    const cone = new THREE.ConeGeometry(0.11, 0.75, 6);
    cone.translate(0, 0.78 + 0.37, 0);
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(upY, dir));
    spikes.push(cone.toNonIndexed());
    cone.dispose();
  }
  const spikeGeo = mergeGeometries(spikes, false);
  const merged = mergeGeometries([body, spikeGeo], true);
  body.dispose();
  spikeGeo.dispose();
  for (const s of spikes) {
    s.dispose();
  }
  return merged;
}

/** Sharp triangular shard (pyramid with three sides). */
export function createShardGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(1, 1.7, 3, 1).toNonIndexed();
  geometry.computeVertexNormals();
  return geometry;
}

/** Thorn urchin: dark core with long brown and gold thorns (group 0 core, 1 thorns), unit radius. */
export function createUrchinGeometry(): THREE.BufferGeometry {
  const core = new THREE.IcosahedronGeometry(0.32, 0);
  core.computeVertexNormals();
  const thorns: THREE.BufferGeometry[] = [];
  const upY = new THREE.Vector3(0, 1, 0);
  const dirs = new THREE.IcosahedronGeometry(1, 1);
  const pos = dirs.getAttribute("position");
  const seen = new Set<string>();
  for (let i = 0; i < pos.count; i += 1) {
    const dir = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
    const key = `${dir.x.toFixed(2)},${dir.y.toFixed(2)},${dir.z.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const len = 0.75 + ((i * 37) % 10) / 40;
    const cone = new THREE.ConeGeometry(0.045, len, 4);
    cone.translate(0, 0.25 + len / 2, 0);
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(upY, dir));
    thorns.push(cone.toNonIndexed());
    cone.dispose();
  }
  dirs.dispose();
  const thornGeo = mergeGeometries(thorns, false);
  const merged = mergeGeometries([core, thornGeo], true);
  core.dispose();
  thornGeo.dispose();
  thorns.forEach((t) => t.dispose());
  return merged;
}

/** Long spiked log lying along x (group 0 bark, 1 thorns, 2 bands). */
export function createLogGeometry(length: number): THREE.BufferGeometry {
  const bark = new THREE.CylinderGeometry(0.85, 0.85, length, 10, 1).toNonIndexed();
  bark.rotateZ(Math.PI / 2);
  bark.computeVertexNormals();
  const thorns: THREE.BufferGeometry[] = [];
  const bands: THREE.BufferGeometry[] = [];
  const upY = new THREE.Vector3(0, 1, 0);
  for (let x = -length / 2 + 1; x < length / 2; x += 1.3) {
    for (let k = 0; k < 4; k += 1) {
      const a = (k / 4) * Math.PI * 2 + x * 0.9;
      const dir = new THREE.Vector3(0.25 * Math.sin(x * 3), Math.cos(a), Math.sin(a)).normalize();
      const cone = new THREE.ConeGeometry(0.06, 1.1, 4);
      cone.translate(0, 0.85 + 0.5, 0);
      cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(upY, dir));
      cone.translate(x, 0, 0);
      thorns.push(cone.toNonIndexed());
      cone.dispose();
    }
  }
  for (let x = -length / 2 + 3; x < length / 2; x += 6) {
    const band = new THREE.CylinderGeometry(0.9, 0.9, 0.7, 10, 1).toNonIndexed();
    band.rotateZ(Math.PI / 2);
    band.translate(x, 0, 0);
    band.computeVertexNormals();
    bands.push(band);
  }
  const thornGeo = mergeGeometries(thorns, false);
  const bandGeo = mergeGeometries(bands, false);
  const merged = mergeGeometries([bark, thornGeo, bandGeo], true);
  [bark, thornGeo, bandGeo, ...thorns, ...bands].forEach((g) => g.dispose());
  return merged;
}

/** Flat hexagonal tile, unit radius. */
export function createHexGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(1, 1, 0.35, 6, 1).toNonIndexed();
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

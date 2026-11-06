import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Colours of one pilot. Models face +z with +y up.
 *
 * In the film (00:40:36-00:40:51) each racer is a pilot lying prone in a winged harness: a
 * faceted shell over the back (white top, coloured flanks, a thin trim line) that ends in a
 * point over the hips, a glass bubble over the masked head, two swept wings from the shoulders
 * with a slim jet pod near each tip and a blade beyond it, and the legs trailing behind.
 */
export interface FlyerLook {
  /** Torso and arms under the shell. */
  suit: number;
  /** Legs (Jobe: glossy purple suit; Peter: bare skin). */
  legs: number;
  /** How glossy the legs are (0 matte skin, 1 wet suit). */
  legGloss: number;
  shorts: number;
  /** Shell top and the white parts of the wings. */
  shellTop: number;
  /** Shell flanks and the main wing panel. */
  shellSide: number;
  /** Thin line between top and flank, and the wing's trailing stripe. */
  trim: number;
  wing: number;
  wingEdge: number;
  /** Outer wing blade beyond the pod. */
  blade: number;
  /** Jet pod body and its pointed nose. */
  jet: number;
  jetNose: number;
  flame: number;
  mask: number;
  /** Small fins on the shell's shoulders (Peter's red canards), or null. */
  canards: number | null;
  trail: number;
}

export const JOBE_LOOK: FlyerLook = {
  suit: 0x3a1640,
  legs: 0x5c2468,
  legGloss: 0.85,
  shorts: 0x2b2f9e,
  shellTop: 0xe8e4e0,
  shellSide: 0xc8232f,
  trim: 0x2438a8,
  wing: 0xc8232f,
  wingEdge: 0xe8e4e0,
  blade: 0xe8e4e0,
  jet: 0xc8232f,
  jetNose: 0xe8e4e0,
  flame: 0xb84dff,
  mask: 0x2848c8,
  canards: null,
  trail: 0xb040ff
};

export const PETER_LOOK: FlyerLook = {
  suit: 0x26308c,
  legs: 0xe3c8b4,
  legGloss: 0.15,
  shorts: 0x2236a8,
  shellTop: 0xe6dccb,
  shellSide: 0xd2c0a4,
  trim: 0x2f46c0,
  wing: 0xd8c8ae,
  wingEdge: 0xf0ece6,
  blade: 0xe6dccb,
  jet: 0x2a3aa8,
  jetNose: 0xe6dccb,
  flame: 0x6fa8ff,
  mask: 0x1f2f8a,
  canards: 0xc8232f,
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

/** Faceted, two-sided: the film's flat-shaded CG look, whatever the winding. */
function facet(color: number, roughness = 0.35, metalness = 0.2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true, side: THREE.DoubleSide });
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
  geometry.translate(0, -depth / 2, 0);
  geometry.computeVertexNormals();
  return geometry;
}

/** One cross-section of the shell: half width, and heights of its flank foot, flank top and ridge. */
interface Station {
  z: number;
  w: number;
  foot: number;
  flank: number;
  ridge: number;
}

/**
 * The back shell, lofted through stations from front to back. Material groups: 0 top, 1 trim,
 * 2 flank, 3 front cap. Open underneath, where the body is.
 */
function shellGeometry(stations: Station[]): THREE.BufferGeometry {
  // Profile from the right foot over the ridge to the left foot, with the band of each segment.
  const profile = (s: Station): Array<[number, number]> => {
    const trim = s.flank + 0.22 * (s.ridge - s.flank);
    const right: Array<[number, number]> = [
      [s.w, s.foot],
      [s.w, s.flank],
      [s.w * 0.9, trim],
      [s.w * 0.62, s.ridge]
    ];
    const left = right.map(([x, y]) => [-x, y] as [number, number]).reverse();
    return [...right, ...left];
  };
  const bands = [2, 1, 0, 0, 0, 1, 2];
  const positions: number[] = [];
  const groups: number[][] = [[], [], [], []];
  const rings = stations.map((s) => profile(s).map(([x, y]) => new THREE.Vector3(x, y, s.z)));
  const quad = (band: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): void => {
    groups[band].push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray());
  };
  for (let i = 0; i + 1 < rings.length; i += 1) {
    for (let k = 0; k + 1 < rings[i].length; k += 1) {
      quad(bands[k], rings[i][k], rings[i + 1][k], rings[i + 1][k + 1], rings[i][k + 1]);
    }
  }
  // Front cap: a fan over the first ring.
  const front = rings[0];
  const centre = new THREE.Vector3(0, (stations[0].foot + stations[0].ridge) / 2, stations[0].z);
  for (let k = 0; k + 1 < front.length; k += 1) {
    groups[3].push(...centre.toArray(), ...front[k].toArray(), ...front[k + 1].toArray());
  }
  const geometry = new THREE.BufferGeometry();
  let start = 0;
  groups.forEach((list, band) => {
    positions.push(...list);
    geometry.addGroup(start, list.length / 3, band);
    start += list.length / 3;
  });
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** A limb along -z from its root: a lathe through (radius, distance) pairs. */
function limbGeometry(profile: Array<[number, number]>): THREE.BufferGeometry {
  const geometry = new THREE.LatheGeometry(
    profile.map(([r, d]) => new THREE.Vector2(r, -d)),
    14
  );
  // Lathe axis +y; turning +90deg about x sends -y to -z.
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** A prone pilot in a jet-winged harness, after the two racers of the 1992 film. */
export function createFlyer(look: FlyerLook): FlyerModel {
  const root = new THREE.Group();
  const suit = std(look.suit, 0.35, 0.2);
  const legs = std(look.legs, 0.6 - 0.5 * look.legGloss, 0.1 + 0.3 * look.legGloss);
  const shorts = std(look.shorts, 0.35, 0.2);
  const top = facet(look.shellTop, 0.3, 0.25);
  const trim = facet(look.trim, 0.3, 0.3);
  const flank = facet(look.shellSide, 0.28, 0.3);
  const wing = facet(look.wing, 0.3, 0.3);
  const wingEdge = facet(look.wingEdge, 0.3, 0.25);
  const blade = facet(look.blade, 0.3, 0.25);
  const jet = std(look.jet, 0.25, 0.45);
  const jetNose = facet(look.jetNose, 0.3, 0.3);

  const add = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], x: number, y: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };

  // The pilot: torso under the shell, arms along the sides, legs trailing behind.
  add(alongZ(new THREE.CapsuleGeometry(0.3, 0.8, 6, 14)), suit, 0, -0.02, 0.2);
  const hips = add(new THREE.SphereGeometry(0.33, 14, 10), shorts, 0, -0.06, -0.5);
  hips.scale.set(1.25, 0.8, 1.15);
  // Thigh from the hip to the knee, shin from the knee to the ankle (metres along the limb).
  const thighGeo = limbGeometry([[0, 0], [0.15, 0.02], [0.19, 0.18], [0.17, 0.45], [0.12, 0.7], [0, 0.74]]);
  const shinGeo = limbGeometry([[0, -0.04], [0.12, 0], [0.15, 0.18], [0.12, 0.45], [0.075, 0.68], [0, 0.72]]);
  for (const side of [-1, 1]) {
    const arm = add(alongZ(new THREE.CapsuleGeometry(0.1, 0.75, 5, 10)), suit, side * 0.36, -0.12, 0.15);
    arm.rotation.y = -side * 0.06;
    const thigh = add(thighGeo, legs, side * 0.19, -0.06, -0.62);
    thigh.rotation.set(0.04, -side * 0.06, 0);
    const shin = add(shinGeo, legs, side * 0.23, -0.1, -1.32);
    shin.rotation.set(0.12, -side * 0.03, 0);
    const foot = add(new THREE.ConeGeometry(0.075, 0.3, 8), legs, side * 0.25, -0.2, -2.1);
    foot.rotation.x = -Math.PI / 2 - 0.45;
  }

  // Masked head under a glass bubble (00:40:36).
  const mask = add(new THREE.SphereGeometry(0.24, 16, 12), new THREE.MeshStandardMaterial({ color: look.mask, roughness: 0.15, metalness: 0.6 }), 0, 0.04, 1.08);
  mask.scale.set(0.95, 0.85, 1);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffe14a });
  for (const side of [-1, 1]) {
    const eye = add(new THREE.SphereGeometry(0.05, 8, 6), eyeMaterial, side * 0.09, 0.02, 1.29);
    eye.scale.set(1.3, 0.6, 0.6);
  }
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fe8e0,
    transparent: true,
    opacity: 0.3,
    roughness: 0.05,
    metalness: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const canopy = add(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, -0.08, 1.02);
  canopy.scale.set(0.82, 0.78, 1.15);

  // The back shell: from the collar behind the bubble, wide at the shoulders, to a point over the hips.
  const shell = shellGeometry([
    { z: 0.78, w: 0.36, foot: -0.02, flank: 0.12, ridge: 0.34 },
    { z: 0.45, w: 0.5, foot: -0.12, flank: 0.12, ridge: 0.46 },
    { z: 0.0, w: 0.48, foot: -0.12, flank: 0.1, ridge: 0.44 },
    { z: -0.5, w: 0.34, foot: -0.06, flank: 0.06, ridge: 0.3 },
    { z: -1.05, w: 0.03, foot: 0.04, flank: 0.06, ridge: 0.1 }
  ]);
  add(shell, [top, trim, flank, top], 0, 0, 0);

  // Swept wings from the shoulders, a pod near each tip, a blade beyond.
  const wingY = 0.16;
  const panel = wingGeometry(
    [
      [0.4, 0.5],
      [1.5, 0.02],
      [1.5, -0.5],
      [0.4, -0.55]
    ],
    0.06
  );
  const leading = wingGeometry(
    [
      [0.4, 0.5],
      [1.5, 0.02],
      [1.5, -0.12],
      [0.4, 0.32]
    ],
    0.075
  );
  const trailing = wingGeometry(
    [
      [0.4, -0.42],
      [1.5, -0.4],
      [1.5, -0.5],
      [0.4, -0.55]
    ],
    0.075
  );
  const tip = wingGeometry(
    [
      [1.5, -0.02],
      [2.72, -0.92],
      [2.66, -1.08],
      [1.5, -0.38]
    ],
    0.05
  );
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
    // Each wing hangs from a side group, mirrored and tilted up a little (dihedral).
    const holder = new THREE.Group();
    holder.position.set(0, wingY, 0);
    holder.scale.x = side;
    holder.rotation.z = side * 0.1;
    root.add(holder);
    const put = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      holder.add(mesh);
      return mesh;
    };
    put(panel, wing, 0, 0, 0);
    put(leading, wingEdge, 0, 0.004, 0);
    put(trailing, trim, 0, 0.004, 0);
    put(tip, blade, 0, 0, 0);

    // Pod: red body, pointed white nose, dark ring and the exhaust.
    const podX = 1.52;
    put(alongZ(new THREE.CylinderGeometry(0.12, 0.13, 0.95, 12)), jet, podX, 0.03, -0.25);
    const noseGeo = new THREE.ConeGeometry(0.12, 0.42, 8);
    noseGeo.rotateX(Math.PI / 2);
    put(noseGeo, jetNose, podX, 0.03, 0.43);
    put(new THREE.TorusGeometry(0.12, 0.03, 6, 12), std(0x1a1a22, 0.5, 0.6), podX, 0.03, -0.73);
    const flameGeo = new THREE.ConeGeometry(0.11, 1.5, 12, 1, true);
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.75);
    flames.push(put(flameGeo, flameMaterial, podX, 0.03, -0.74));
    const coreGeo = new THREE.ConeGeometry(0.05, 0.8, 8, 1, true);
    coreGeo.rotateX(-Math.PI / 2);
    coreGeo.translate(0, 0, -0.4);
    flames.push(put(coreGeo, coreMaterial, podX, 0.03, -0.74));

    // Peter's red canards on the shell shoulders (00:40:51).
    if (look.canards !== null) {
      const canard = wingGeometry(
        [
          [0, 0.2],
          [0.42, -0.05],
          [0.38, -0.14],
          [0, 0.02]
        ],
        0.04
      );
      const red = facet(look.canards, 0.3, 0.3);
      for (const [i, z] of [0.55, 0.32, 0.09].entries()) {
        const fin = put(canard, red, 0.42, 0.12 + i * 0.03, z);
        fin.rotation.z = 0.35;
      }
    }
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

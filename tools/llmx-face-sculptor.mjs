/**
 * LLMx voxel face sculptor — offline authoring of the Nocturnal Forge mask.
 *
 * Why a script and not a Blender file: the mask has to be **original**, **reproducible**, and
 * **iterable in seconds**. Composing it from signed distance fields gives all three — the sculpt
 * is source code, so a silhouette change is an edit and a re-run, the output is byte-identical
 * for a given revision (no export settings to drift), and provenance is "created here" with no
 * licence question. No new dependency, and nothing in this file runs in the browser.
 *
 * What is offline (this file) and what is at load time (src/llmx-face-pose.ts):
 *
 * - Offline: marching a 3D grid over the composed SDF (10^5 to 10^6 evaluations), shell
 *   extraction, region tagging, deduplication and LOD generation.
 * - At load: unpacking small integer arrays and deriving per-cube animation weights from the
 *   documented anchors. That is a few thousand cheap operations, not a re-sculpt.
 *
 * Run: npm run assets:llmx-face
 *
 * Units are metres. The mask is authored facing +Z, up +Y, origin at the mask's own centre.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "src", "llmx-face-forge.json");

/** Data format version. A runtime that does not know this number refuses the asset. */
/**
 * Data format version. A runtime that does not know this number refuses the asset rather than
 * animating it wrongly. Raised to 2 when the eye gained an iris and a pupil and the mouth gained
 * a cavity: a v1 renderer has no mesh for those regions and would draw them as metal.
 */
export const FACE_DATA_VERSION = 3;

// ---------------------------------------------------------------------------
// SDF toolkit. Standard analytic primitives; the smooth operators are what keep
// the sculpt readable as anatomy instead of a pile of booleans.
// ---------------------------------------------------------------------------

const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;

/** Polynomial smooth minimum (union). k is the blend width in metres. */
function smin(a, b, k) {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return mix(b, a, h) - k * h * (1 - h);
}

/** Smooth maximum. Smooth subtraction is smax(d, -cut, k). */
function smax(a, b, k) {
  const h = clamp01(0.5 - (0.5 * (b - a)) / k);
  return mix(b, a, h) + k * h * (1 - h);
}

/**
 * Ellipsoid bound. Not an exact distance — it under-estimates near high curvature — but the
 * shell band below is chosen wide enough to absorb that, and no ray marching happens here.
 */
function sdEllipsoid(px, py, pz, rx, ry, rz) {
  const k0 = len(px / rx, py / ry, pz / rz);
  if (k0 === 0) return -Math.min(rx, ry, rz);
  const k1 = len(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return (k0 * (k0 - 1)) / k1;
}

function sdRoundBox(px, py, pz, bx, by, bz, r) {
  const qx = Math.abs(px) - bx;
  const qy = Math.abs(py) - by;
  const qz = Math.abs(pz) - bz;
  const outside = len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  return outside + inside - r;
}

/** Capsule between two points — the workhorse for brow ridges and fins. */
function sdCapsule(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax;
  const pay = py - ay;
  const paz = pz - az;
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const baLen2 = bax * bax + bay * bay + baz * baz;
  const h = baLen2 === 0 ? 0 : clamp01((pax * bax + pay * bay + paz * baz) / baLen2);
  return len(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}

/**
 * Tapered capsule (round cone) — the nose blade widens as it descends. Iterative-free closed
 * form; ra is the radius at a, rb the radius at b.
 */
function sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, ra, rb) {
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const pax = px - ax;
  const pay = py - ay;
  const paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const xx = (pax * l2 - bax * y) ** 2 + (pay * l2 - bay * y) ** 2 + (paz * l2 - baz * y) ** 2;
  const k = Math.sign(rr) * rr * rr * xx;
  if (Math.sign(z) * a2 * z * z > k) return Math.sqrt(Math.max(xx + z * z, 0)) / l2 - rb;
  if (Math.sign(y) * a2 * y * y < k) return Math.sqrt(Math.max(xx + y * y, 0)) / l2 - ra;
  return (Math.sqrt(Math.max((xx * a2) / l2, 0)) + y * rr) / l2 - ra;
}

// ---------------------------------------------------------------------------
// Anatomy anchors. These are the sculpt AND the animation contract: the runtime
// derives its per-cube weights from the same numbers, exported with the voxels
// so a future re-sculpt cannot silently desynchronise the expressions.
// ---------------------------------------------------------------------------

export const ANCHORS = {
  /** Authored extents, for the environment builder's socket and for framing. */
  height: 2.3,
  /**
   * The eyes sit forward in shallower orbits than anatomy would suggest. Buried eyes vanish in
   * a dark room, and the eyes are the single feature carrying presence — this is a deliberate
   * stylisation, not a proportion error.
   */
  eye: { x: 0.29, y: 0.1, z: 0.35, radius: 0.152 },
  brow: { x: 0.31, y: 0.3, z: 0.37 },
  cheek: { x: 0.43, y: -0.08, z: 0.28 },
  mouth: { y: -0.52, z: 0.42, halfWidth: 0.27 },
  /** Jaw hinge, behind and above the chin. Jaw voxels rotate about this X axis. */
  jawHinge: { y: -0.26, z: -0.24 },
  chin: { y: -1.0 },
};

/** Region ids. Array order is the wire format — never reorder, only append. */
export const REGIONS = [
  "cranium", "brow", "socket", "eye", "lid", "cheek", "nose", "jaw", "lip", "plate",
  // Appended in v2. `eye` now means the sclera; the iris and pupil are the parts that make it
  // read as an eye rather than a lit disc, and `maw` is the cavity that stops the mouth showing
  // the inside of the shell.
  "iris", "pupil", "maw",
  // Appended in v3: the walls of the mouth tunnel. Dark like the cavity, but they move with the
  // lips they belong to — the floor with the lower lip, the roof with the upper.
  "throat",
];

const R = Object.fromEntries(REGIONS.map((name, index) => [name, index]));

/**
 * Regions that an expression can move. The runtime keeps these in a separate instanced mesh
 * whose matrices are rewritten per frame, and leaves the rest written once — which is what
 * makes a denser, better-looking mask affordable.
 */
export const ANIMATED_REGIONS = [
  "brow", "socket", "eye", "lid", "cheek", "nose", "jaw", "lip", "iris", "pupil", "maw", "throat",
];

/**
 * Rear cut plane. Deep enough that the profile still reads as a head — an earlier -0.42 turned
 * the side view into a flat wall — while still removing the rear voxels nobody looks at.
 */
const BACK_CAP = -0.56;

/** The temple fin, as a segment. Shared by the sculpt and by region tagging. */
const FIN = { ax: 0.5, ay: 0.06, az: 0.14, bx: 0.66, by: 0.62, bz: -0.3, radius: 0.055 };

// ---------------------------------------------------------------------------
// The mask. Read it top to bottom as a face being built, because that is how it
// gets qualified: silhouette first, then the features that carry expression.
// ---------------------------------------------------------------------------

/** The solid head, without eyeballs and lids — those are separate regions. */
function maskDistance(x, y, z) {
  const ax = Math.abs(x);

  // Cranium and mid-face, blended into one volume. Narrow and tall rather than round: the
  // proportion is what carries "gothic" before any material does.
  let d = sdEllipsoid(x, y - 0.34, z + 0.04, 0.6, 0.8, 0.58);
  d = smin(d, sdEllipsoid(x, y + 0.04, z - 0.12, 0.55, 0.62, 0.5), 0.2);

  // Jaw and chin. A tapered mass, not a sphere: the silhouette is what reads at distance.
  d = smin(d, sdEllipsoid(x, y + 0.66, z - 0.04, 0.45, 0.38, 0.42), 0.17);
  d = smin(d, sdEllipsoid(x, y + 0.93, z - 0.17, 0.19, 0.17, 0.21), 0.13);

  // Cheekbones — a tight blend, so the ridge survives voxelisation instead of melting.
  d = smin(d, sdEllipsoid(ax - 0.43, y + 0.08, z - 0.28, 0.22, 0.14, 0.24), 0.06);

  // Brow ridge, dipping toward the nose and pushed forward so it actually overhangs the eyes.
  // This single angle is most of the mask's character.
  d = smin(d, sdCapsule(ax, y, z, 0.05, 0.22, 0.4, 0.52, 0.33, 0.24, 0.105), 0.055);

  // Nose: a blade widening downward, with wings.
  d = smin(d, sdRoundCone(x, y, z, 0, 0.25, 0.36, 0, -0.17, 0.45, 0.05, 0.11), 0.05);
  d = smin(d, sdEllipsoid(ax - 0.125, y + 0.2, z - 0.39, 0.085, 0.065, 0.08), 0.05);

  // Lips, before the mouth is cut through them. The upper lip is deliberately thinner than the
  // lower one — an even pair reads as a letterbox slot rather than a mouth.
  //
  // Both are shallow in Z on purpose. The lower lip used to reach 0.13 m deep, so it was a slab
  // whose top face was the floor of the mouth: when it dropped, that brown top face appeared in
  // the aperture — "c'est une langue ?" — and from below it stuck out of the profile like an
  // open drawer. A lip is a rim, one or two cubes deep; the mouth reads by its aperture.
  d = smin(d, sdEllipsoid(x, y + 0.45, z - 0.4, 0.26, 0.042, 0.085), 0.04);
  d = smin(d, sdEllipsoid(x, y + 0.615, z - 0.4, 0.255, 0.062, 0.085), 0.04);

  // Swept-back temple fins and a crown fin — where the mask stops being a face and becomes
  // machinery. Capsules sweeping up and back, not slabs: a flat panel reads as a billboard from
  // three-quarters and dominated the whole silhouette.
  d = smin(d, sdCapsule(ax, y, z, FIN.ax, FIN.ay, FIN.az, FIN.bx, FIN.by, FIN.bz, FIN.radius), 0.07);
  d = smin(d, sdRoundBox(x, y - 0.95, z - 0.04, 0.03, 0.15, 0.34, 0.03), 0.07);

  // Deep orbits, subtracted last so the brow overhangs them. Shallower than anatomy: see the
  // note on ANCHORS.eye.
  d = smax(d, -sdEllipsoid(ax - 0.29, y - 0.1, z - 0.42, 0.235, 0.185, 0.22), 0.065);

  // The mouth, cut through the lips — and cut *deep*. A shallow ellipsoid is a closed pocket:
  // the shell wraps its inside, and where that inner wall pinches shut at the back it leaves a
  // horizontal ring of cubes on the mouth line. Closed, it is hidden; open, it hangs in the
  // aperture at mid-height like a palate with a square hole in it. Reaching the pocket's waist
  // back behind the cavity wall (z ≈ 0.02, plate at 0.16) turns the pocket into a tunnel whose
  // roof and floor belong to the lips above and below them, and whose end is the matte wall.
  d = smax(d, -sdEllipsoid(x, y + 0.52, z - 0.44, 0.255, 0.095, 0.42), 0.035);

  return d;
}

/** Eyeballs, kept out of maskDistance so they can glow and track independently. */
function eyeDistance(x, y, z) {
  const { x: ex, y: ey, z: ez, radius } = ANCHORS.eye;
  return len(Math.abs(x) - ex, y - ey, z - ez) - radius;
}

/**
 * Which part of the eyeball a cube belongs to.
 *
 * A uniformly emissive ball reads as a lit disc, not as an eye — it has no iris to aim and no
 * pupil to fix on you, so at conversation distance it looks wrong without being able to say why.
 * The front cap carries a dark pupil inside a bright iris inside a dim sclera; everything facing
 * away stays sclera. This only becomes possible at a fine enough grid: at 46 mm the whole eye is
 * five cubes across and an iris cannot exist.
 */
function eyePart(x, y, z) {
  const { x: ex, y: ey, z: ez, radius } = ANCHORS.eye;
  const ax = Math.abs(x);
  const forward = (z - ez) / radius;
  if (forward < 0.3) return R.eye;
  const offAxis = len(ax - ex, y - ey, 0);
  if (offAxis < radius * 0.3) return R.pupil;
  if (offAxis < radius * 0.66) return R.iris;
  return R.eye;
}

/**
 * The inside of the mouth.
 *
 * The mask is a one-cube shell, so cutting a mouth through it opens a hole onto the *inside* of
 * that shell — and the copper rim light behind the mask lit those interior rows as bright bars
 * that read as teeth. A dark cavity wall behind the aperture closes the view. It is not
 * decoration: it is what makes an open mouth read as depth rather than as damage.
 */
/** Inside the (slightly dilated) mouth cut. */
function isInsideMouthCut(x, y, z) {
  const { y: my } = ANCHORS.mouth;
  return sdEllipsoid(x, y - my, z - 0.44, 0.28, 0.12, 0.44) < 0;
}

/**
 * Shell inside the mouth tunnel that sits behind the cavity wall. Invisible from anywhere the
 * viewer can be — the matte wall is in front of it — so it is not kept at all.
 */
function isBehindMouthWall(x, y, z) {
  return z < 0.2 && isInsideMouthCut(x, y, z);
}

function mawDistance(x, y, z) {
  const { y: my, halfWidth } = ANCHORS.mouth;
  const shell = Math.abs(z - 0.16) - 0.02;
  // Cover the opened aperture as well as the resting slit. A shorter wall exposes its lower
  // edge as a dark floating bar, with the lit inside of the head visible underneath it.
  const within = sdEllipsoid(x, y - (my - 0.06), 0, halfWidth + 0.09, 0.25, 1);
  return smax(shell, within, 0.02);
}

/** The lid is a cap over the top of the eyeball; it rotates down to blink. */
function lidDistance(x, y, z) {
  const { x: ex, y: ey, z: ez, radius } = ANCHORS.eye;
  const shell = Math.abs(len(Math.abs(x) - ex, y - ey, z - ez) - (radius + 0.034)) - 0.026;
  // The lid caps the top third of the eyeball, not its top half. A half-covered eyeball leaves
  // only a crescent of cyan along the bottom rim, and a bottom crescent reads as a gaze aimed
  // at the floor no matter where the eye is actually pointed. Soft edge so the lid line is not
  // a hard staircase.
  return smax(shell, ey + radius * 0.38 - y, 0.03);
}

// ---------------------------------------------------------------------------
// Region tagging. Each surviving voxel gets exactly one region; the tests run in
// priority order, most specific first.
// ---------------------------------------------------------------------------

function regionOf(x, y, z, fromEye, fromLid) {
  if (fromEye) return R.eye;
  if (fromLid) return R.lid;
  const ax = Math.abs(x);
  const { eye, mouth, cheek, jawHinge } = ANCHORS;

  // Tagged against the fin's own segment, so the sculpt and the regions cannot drift apart.
  if (sdCapsule(ax, y, z, FIN.ax, FIN.ay, FIN.az, FIN.bx, FIN.by, FIN.bz, FIN.radius) < 0.05) return R.plate;
  if (len(ax - eye.x, y - eye.y, z - eye.z) < 0.32 && z > 0.05) return R.socket;
  if (y > 0.19 && y < 0.46 && z > 0.15) return R.brow;
  if (ax < 0.2 && y > -0.3 && y < 0.3 && z > 0.3) return R.nose;
  // Only the outer rim of the lips carries the lip tint; everything deeper is throat.
  if (Math.abs(y - mouth.y) < 0.135 && ax < mouth.halfWidth + 0.03 && z > 0.44) return R.lip;
  if (len(ax - cheek.x, y - cheek.y, z - cheek.z) < 0.28) return R.cheek;
  if (y < jawHinge.y) return R.jaw;
  return R.cranium;
}

// ---------------------------------------------------------------------------
// Voxelisation. One pass per level of detail, each a self-consistent shell of
// the same sculpt — which is why changing LOD does not change the identity.
// ---------------------------------------------------------------------------

const BOUNDS = { minX: -0.82, maxX: 0.82, minY: -1.14, maxY: 1.16, minZ: BACK_CAP, maxZ: 0.62 };

/**
 * Distance to the surface, normalised by the local gradient.
 *
 * The composed field is not a true distance function: `sdEllipsoid` is a bound, and `smin` /
 * `smax` distort magnitude wherever they blend. So `|d|` is not metres — it is metres times
 * some local factor — and a fixed shell band therefore keeps a *thicker* shell where the
 * gradient is steep and a thinner one where it is shallow. Those thick patches protrude by a
 * row, and a rim light grazing the mask from behind lights their risers as bright vertical
 * streaks down the shadowed side of the cranium.
 *
 * Dividing by |∇d| recovers an approximate true distance (the standard correction for a
 * non-metric SDF), which is what makes the shell one cube thick everywhere. Six extra
 * evaluations per cell, offline, on a grid of a few tens of thousands: free.
 */
function normalisedDistance(field, x, y, z, h) {
  const d = field(x, y, z);
  const gx = (field(x + h, y, z) - field(x - h, y, z)) / (2 * h);
  const gy = (field(x, y + h, z) - field(x, y - h, z)) / (2 * h);
  const gz = (field(x, y, z + h) - field(x, y, z - h)) / (2 * h);
  const gradient = len(gx, gy, gz);
  return gradient > 1e-6 ? d / gradient : d;
}

/**
 * A shell cell must contain an actual boundary of the solid.
 *
 * Gradient normalisation alone is unsafe inside a flattened ellipsoid: its bound has a steep
 * interior gradient, so dividing by that gradient can turn a point deep inside the mouth cut
 * into an apparent zero. That authored a detached horizontal shelf through the empty mouth.
 * The normalised band remains a cheap candidate filter; opposite signs around the cell are
 * the evidence that a surface really passes here. The band is the same as the shell's existing
 * sampling margin, so this removes false interior cells without thickening the whole mask.
 */
function isSurfaceCell(field, x, y, z, band, step) {
  if (Math.abs(normalisedDistance(field, x, y, z, step)) > band) return false;
  const inside = field(x, y, z) <= 0;
  for (const dx of [-band, 0, band]) {
    for (const dy of [-band, 0, band]) {
      for (const dz of [-band, 0, band]) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        if ((field(x + dx, y + dy, z + dz) <= 0) !== inside) return true;
      }
    }
  }
  return false;
}

function voxelise(cube) {
  // A shell band slightly wider than half a cube: thin enough to stay one cube deep, wide
  // enough that a surface grazing the grid does not open holes. Meaningful in metres only
  // because the distances below are gradient-normalised.
  const band = cube * 0.62;
  const step = cube * 0.25;
  const nx = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / cube);
  const ny = Math.ceil((BOUNDS.maxY - BOUNDS.minY) / cube);
  const nz = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / cube);

  // The X grid is centred on the mask's symmetry plane rather than on the authored bounds:
  // with an arbitrary origin the two halves sample the surface at different sub-cube offsets
  // and the mask comes out lopsided.
  //
  // Centring is not enough on its own, though. `-(nx * cube) / 2 + (ix + 0.5) * cube` is
  // symmetric in exact arithmetic but not in floating point — a mirrored pair's coordinates can
  // differ in the last unit in the last place, and a region test evaluated exactly on its
  // boundary then classifies them differently. That is not cosmetic: one cube of a mirrored pair
  // landed in `lip` and the other in `jaw`, so the two halves of the mouth moved differently.
  //
  // `(ix - (nx - 1) / 2) * cube` is exactly antisymmetric in IEEE 754, because `a - b` and
  // `b - a` are exact negations and both are then scaled by the same factor. Both the sculptor
  // and `deriveWeights` use this form, so the symmetry survives into the runtime.
  const originX = 0;
  const cells = [];

  for (let iy = 0; iy < ny; iy += 1) {
    const y = BOUNDS.minY + (iy + 0.5) * cube;
    for (let ix = 0; ix < nx; ix += 1) {
      const x = originX + (ix - (nx - 1) / 2) * cube;
      for (let iz = 0; iz < nz; iz += 1) {
        const z = BOUNDS.minZ + (iz + 0.5) * cube;
        if (z < BACK_CAP) continue;

        // Eyes are solid, not a shell: a hollow eyeball reads as a hole. `eyeDistance` is an
        // exact sphere distance, so it needs no normalisation.
        const inEye = eyeDistance(x, y, z) <= 0;
        const onLid = !inEye && isSurfaceCell(lidDistance, x, y, z, band, step);
        const onMask = !inEye && !onLid && isSurfaceCell(maskDistance, x, y, z, band, step);
        // The backing wall also fills intersections with the tunnel shell. Removing a hidden
        // tunnel voxel must not punch a matching hole through the wall in front of it.
        const onMaw = !inEye && !onLid && Math.abs(mawDistance(x, y, z)) <= band;
        if (!inEye && !onLid && !onMask && !onMaw) continue;

        // The far end of the mouth tunnel lies behind the cavity wall; nothing there can be seen.
        if (onMask && !onMaw && isBehindMouthWall(x, y, z)) continue;
        let region = inEye ? eyePart(x, y, z) : onMaw ? R.maw : regionOf(x, y, z, false, onLid);
        // The tunnel's walls, floor and roof: dark, and moving with their lips.
        if (onMask && !onMaw && region !== R.lip && z <= 0.44 && isInsideMouthCut(x, y, z)) region = R.throat;
        cells.push({ ix, iy, iz, region });
      }
    }
  }

  return { cube, nx, ny, nz, cells, origin: [originX, BOUNDS.minY, BOUNDS.minZ] };
}

const ANIMATED_IDS = new Set(ANIMATED_REGIONS.map((name) => R[name]));

/**
 * Pack a level into two flat integer arrays — grid index and region — plus its header.
 *
 * Cells are emitted **animated first**, so the runtime slices rather than partitions: cubes
 * `[0, animatedCount)` go to the mesh whose matrices are rewritten per frame, the rest to the
 * one written once at assembly. Within each half the original scan order (bottom-up by row) is
 * preserved, which is also the assembly order the choreography plays.
 */
function packLevel(name, level) {
  const { cube, nx, ny, nz, cells } = level;
  const seen = new Set();
  const kept = [];
  for (const cell of cells) {
    const index = cell.ix + cell.iy * nx + cell.iz * nx * ny;
    if (seen.has(index)) continue;
    seen.add(index);
    kept.push({ index, region: cell.region });
  }
  const animated = kept.filter((cell) => ANIMATED_IDS.has(cell.region));
  const stationary = kept.filter((cell) => !ANIMATED_IDS.has(cell.region));
  const ordered = [...animated, ...stationary];

  const regionCounts = {};
  for (const cell of ordered) regionCounts[REGIONS[cell.region]] = (regionCounts[REGIONS[cell.region]] ?? 0) + 1;
  return {
    name,
    cube: Number(cube.toFixed(4)),
    grid: [nx, ny, nz],
    // Per level, not global: the symmetric X origin is -(nx * cube) / 2 and nx differs per level.
    origin: level.origin.map((value) => Number(value.toFixed(5))),
    count: ordered.length,
    animatedCount: animated.length,
    regionCounts,
    indices: ordered.map((cell) => cell.index),
    regions: ordered.map((cell) => cell.region),
  };
}

/**
 * Three densities of the same sculpt. `high` was raised from 46 mm after Yanik judged the mask
 * in the Forge: the features that carry a face — an iris, a lip, the corner of a mouth — are
 * smaller than a cube at that size, so no amount of shading could have fixed them. `mobile`
 * deliberately did not move; a phone's budget has not changed.
 */
const LEVELS = [
  { name: "high", cube: 0.024 },
  { name: "balanced", cube: 0.038 },
  { name: "mobile", cube: 0.072 },
];

function sculpt() {
  const levels = LEVELS.map(({ name, cube }) => packLevel(name, voxelise(cube)));
  return {
    format: "graphysx.llmx-voxel-face",
    version: FACE_DATA_VERSION,
    id: "forge-mask",
    label: "Forge mask",
    provenance: {
      origin: "original",
      note: "Composed from analytic signed distance fields in tools/llmx-face-sculptor.mjs. No external model, texture or scan is involved; re-running the script reproduces this file exactly.",
    },
    regions: REGIONS,
    // Travels with the asset rather than being restated by each consumer. Appending a region
    // and forgetting to update a duplicated copy of this list is a drift that already happened
    // once, and it is invisible until a cube animates that should not have.
    animatedRegions: ANIMATED_REGIONS,
    anchors: ANCHORS,
    levels,
  };
}

const data = sculpt();
writeFileSync(OUT, `${JSON.stringify(data)}\n`);

for (const level of data.levels) {
  const zones = Object.entries(level.regionCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}:${count}`)
    .join(" ");
  console.log(
    `${level.name.padEnd(9)} cube=${level.cube}m grid=${level.grid.join("x")} cubes=${String(level.count).padStart(5)}` +
      ` (animated ${String(level.animatedCount).padStart(4)})  ${zones}`,
  );
}
console.log(`\nwrote ${OUT}`);

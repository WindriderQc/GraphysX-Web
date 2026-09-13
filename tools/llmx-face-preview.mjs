/**
 * Offline preview of the sculpted voxel face — the iteration loop for the silhouette.
 *
 * GraphysX's rule is that anything visual gets looked at before it ships, and the mask's
 * silhouette has to be settled *before* it is worth wiring a renderer, a socket and a light rig
 * around it. Booting the browser host for that is a 40-minute gate and a machine-global lock.
 * So this renders the packed voxel data directly: orthographic projection, painter's algorithm,
 * and Lambert shading from a normal recovered from voxel occupancy. No dependency — PNG is
 * written with node:zlib.
 *
 * It is a diagnostic, not a preview of the product: no bloom, no HDRI, no post, flat materials.
 * A mask that reads here will read in the engine; one that does not, will not be saved by bloom.
 *
 * Run: npm run assets:llmx-face-preview
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import face from "../src/llmx-face-forge.json" with { type: "json" };

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "output", "llmx-face");

// ---------------------------------------------------------------------------
// Minimal PNG writer (truecolour, 8-bit, no interlace).
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  const tag = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, body])), 0);
  return Buffer.concat([head, tag, body, crc]);
}

function writePng(path, width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  // Filter type 0 byte in front of every scanline.
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    raw[y * (1 + width * 3)] = 0;
    rgb.copy(raw, y * (1 + width * 3) + 1, y * width * 3, (y + 1) * width * 3);
  }
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

// ---------------------------------------------------------------------------
// Unpack a level and recover a shading normal from occupancy.
// ---------------------------------------------------------------------------

function unpack(level) {
  const [nx, ny] = level.grid;
  const { cube } = level;
  const [ox, oy, oz] = level.origin;
  const occupied = new Set(level.indices);
  const cubes = [];

  for (let i = 0; i < level.indices.length; i += 1) {
    const index = level.indices[i];
    const ix = index % nx;
    const iy = Math.floor(index / nx) % ny;
    const iz = Math.floor(index / (nx * ny));

    // Outward normal = the summed direction of the empty neighbours. A voxel shell has no
    // authored normals, and this recovers a usable one in one pass over 26 offsets.
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          if (occupied.has(index + dx + dy * nx + dz * nx * ny)) continue;
          const inv = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
          gx += dx * inv;
          gy += dy * inv;
          gz += dz * inv;
        }
      }
    }
    const glen = Math.hypot(gx, gy, gz) || 1;

    cubes.push({
      x: ox + (ix + 0.5) * cube,
      y: oy + (iy + 0.5) * cube,
      z: oz + (iz + 0.5) * cube,
      nx: gx / glen,
      ny: gy / glen,
      nz: gz / glen,
      region: level.regions[i],
      animated: i < level.animatedCount,
    });
  }
  return cubes;
}

// ---------------------------------------------------------------------------
// Views and palettes.
// ---------------------------------------------------------------------------

/** Yaw in degrees around +Y; 0 is dead ahead. */
const VIEWS = [
  { label: "front", yaw: 0, pitch: 4 },
  { label: "three-quarter", yaw: 34, pitch: 6 },
  { label: "profile", yaw: 78, pitch: 2 },
];

/**
 * The Nocturnal Forge palette, per region — charcoal metal, patinated copper, cold cyan. This
 * is the art direction, not a preview convenience: the runtime materials are derived from these
 * same region colours.
 *
 * Copper is an **accent**. An earlier pass gave the lips the same copper as the fins and the
 * mask grew a bright horizontal bar across its mouth that read as a grille. The mouth now reads
 * by its shadow and its aperture, which is what makes it look like it can open.
 */
const FORGE_PALETTE = {
  cranium: [52, 57, 64],
  brow: [43, 47, 54],
  socket: [24, 26, 31],
  eye: [96, 214, 232],
  lid: [62, 67, 75],
  cheek: [60, 65, 72],
  nose: [56, 61, 68],
  jaw: [49, 54, 61],
  lip: [66, 60, 58],
  plate: [141, 92, 54],
};

/** Diagnostic palette: every region a distinct hue, so mis-tagging is visible at a glance. */
const REGION_PALETTE = {
  cranium: [90, 96, 104],
  brow: [226, 96, 72],
  socket: [58, 62, 132],
  eye: [96, 226, 232],
  lid: [232, 196, 84],
  cheek: [104, 196, 110],
  nose: [226, 130, 210],
  jaw: [212, 132, 60],
  lip: [236, 84, 140],
  plate: [140, 116, 210],
};

const WIDTH = 420;
const HEIGHT = 560;
const BACKGROUND = [11, 12, 15];

function render(cubes, level, view, palette, { lit }) {
  const yaw = (view.yaw * Math.PI) / 180;
  const pitch = (view.pitch * Math.PI) / 180;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  // Rotate world into view space: yaw about Y, then pitch about X.
  const toView = (x, y, z) => {
    const rx = x * cy - z * sy;
    const rz = x * sy + z * cy;
    return { x: rx, y: y * cp - rz * sp, z: y * sp + rz * cp };
  };

  // A cold key from the upper left and front, matching the art direction's oblique source.
  const key = (() => {
    const l = { x: -0.55, y: 0.68, z: 0.48 };
    const n = Math.hypot(l.x, l.y, l.z);
    return { x: l.x / n, y: l.y / n, z: l.z / n };
  })();

  const projected = cubes.map((c) => {
    const p = toView(c.x, c.y, c.z);
    const n = toView(c.nx, c.ny, c.nz);
    return { p, n, region: c.region };
  });

  // Fit the mask in frame with a margin, from the authored bounds of this view.
  const xs = projected.map((c) => c.p.x);
  const ys = projected.map((c) => c.p.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const scale = Math.min((WIDTH * 0.86) / spanX, (HEIGHT * 0.9) / spanY);
  const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
  const zs = projected.map((c) => c.p.z);
  const nearZ = Math.max(...zs);
  const farZ = Math.min(...zs);

  const rgb = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
    rgb[i * 3] = BACKGROUND[0];
    rgb[i * 3 + 1] = BACKGROUND[1];
    rgb[i * 3 + 2] = BACKGROUND[2];
  }

  // Painter's algorithm, far to near. Cheaper than a z-buffer and exact for opaque cubes of
  // equal size on an orthographic camera.
  projected.sort((a, b) => a.p.z - b.p.z);

  const half = Math.max(1, Math.round((level.cube * scale) / 2));
  for (const c of projected) {
    const sx = Math.round(WIDTH / 2 + (c.p.x - midX) * scale);
    const sy2 = Math.round(HEIGHT / 2 - (c.p.y - midY) * scale);
    const base = palette[face.regions[c.region]] ?? [128, 128, 128];

    let r = base[0];
    let g = base[1];
    let b = base[2];
    if (lit) {
      const lambert = Math.max(0, c.n.x * key.x + c.n.y * key.y + c.n.z * key.z);
      // A weak fill from the viewer, standing in for the Forge's copper bounce and IBL: the
      // palette is charcoal on purpose, and with the key alone the unlit half was unreadable.
      const fill = Math.max(0, c.n.z);
      // Depth keeps the far side of the mask from competing with the lit front planes.
      const depth = farZ === nearZ ? 1 : 0.45 + 0.55 * ((c.p.z - farZ) / (nearZ - farZ));
      const gain = (0.42 + 1.1 * lambert + 0.5 * fill) * depth;
      const rim = face.regions[c.region] === "eye" ? 1.35 : 1;
      r = Math.min(255, Math.round(r * gain * rim + 10 * lambert));
      g = Math.min(255, Math.round(g * gain * rim + 13 * lambert));
      b = Math.min(255, Math.round(b * gain * rim + 18 * lambert));
    }

    for (let py = sy2 - half; py <= sy2 + half; py += 1) {
      if (py < 0 || py >= HEIGHT) continue;
      for (let px = sx - half; px <= sx + half; px += 1) {
        if (px < 0 || px >= WIDTH) continue;
        // A one-pixel darker edge is what turns a blob of squares back into cubes.
        const edge = py === sy2 - half || py === sy2 + half || px === sx - half || px === sx + half;
        const k = edge ? 0.52 : 1;
        const o = (py * WIDTH + px) * 3;
        rgb[o] = Math.round(r * k);
        rgb[o + 1] = Math.round(g * k);
        rgb[o + 2] = Math.round(b * k);
      }
    }
  }
  return rgb;
}

/** Lay rendered views side by side into one sheet, so a silhouette is judged as a set. */
function sheet(panels) {
  const width = WIDTH * panels.length;
  const out = Buffer.alloc(width * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let i = 0; i < panels.length; i += 1) {
      panels[i].copy(out, (y * width + i * WIDTH) * 3, y * WIDTH * 3, (y + 1) * WIDTH * 3);
    }
  }
  return { width, height: HEIGHT, rgb: out };
}

mkdirSync(OUT_DIR, { recursive: true });

const levelName = process.argv[2] ?? "high";
const level = face.levels.find((entry) => entry.name === levelName);
if (!level) throw new Error(`Unknown level: ${levelName}. Have ${face.levels.map((l) => l.name).join(", ")}`);

const cubes = unpack(level);

for (const [suffix, palette, options] of [
  ["lit", FORGE_PALETTE, { lit: true }],
  ["regions", REGION_PALETTE, { lit: false }],
]) {
  const panels = VIEWS.map((view) => render(cubes, level, view, palette, options));
  const { width, height, rgb } = sheet(panels);
  const path = join(OUT_DIR, `forge-mask-${levelName}-${suffix}.png`);
  writePng(path, width, height, rgb);
  console.log(`${path}  ${width}x${height}  views=${VIEWS.map((v) => v.label).join("/")}`);
}

console.log(`\n${levelName}: ${level.count} cubes, ${level.animatedCount} animated, cube=${level.cube}m`);

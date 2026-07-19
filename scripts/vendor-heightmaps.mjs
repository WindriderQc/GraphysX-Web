/**
 * Vendor archive heightmaps into the product as decoded height data.
 *
 * The GraphysX workshop holds the originals as Windows BMPs under
 * `Media/textures n else/Heightmaps`. We deliberately do NOT copy the bitmaps into the
 * product: a runtime image decode costs a loader plus a canvas readback, and
 * `getImageData` on a large bitmap is exactly the kind of work that stalls a first frame.
 * Instead this script decodes each source once, at authoring time, downsamples it to a
 * modest grid, and writes a plain JSON heights array — the same shape as the already
 * recovered `src/legacy/terrain-carx.json`.
 *
 * Provenance is carried across verbatim: source path, SHA-256 of the original file, native
 * dimensions, bit depth, and the sample grid we reduced to. Nothing is invented.
 *
 * Run manually when adding a heightmap; the output is committed, so a normal build never
 * needs the workshop checkout to be present.
 *
 *   node scripts/vendor-heightmaps.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE = "C:/Users/Yanik/codes/GraphysX/Yanik C++ BCKUP/Media/textures n else/Heightmaps";

/** Each entry becomes one curated heightmap id in `agent-world-terrain.ts`. */
const SOURCES = [
  { id: "canyon", file: "Canyon.bmp", samples: 129, label: "Canyon" },
  { id: "highlands", file: "Heightmap.bmp", samples: 129, label: "Highlands" },
  { id: "basin", file: "map.bmp", samples: 129, label: "Basin" },
];

/**
 * Minimal uncompressed-BMP reader. The archive files are all `BI_RGB` (compression 0) at
 * 8 bpp (paletted) or 24 bpp, which is the whole of what this needs to handle — a general
 * BMP library would be a dependency for four files we control.
 */
function decodeBmp(buffer) {
  if (buffer.toString("ascii", 0, 2) !== "BM") throw new Error("Not a BMP");
  const dataOffset = buffer.readUInt32LE(10);
  const headerSize = buffer.readUInt32LE(14);
  const width = buffer.readInt32LE(18);
  const rawHeight = buffer.readInt32LE(22);
  const bitsPerPixel = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);
  if (compression !== 0) throw new Error(`Unsupported BMP compression: ${compression}`);
  const height = Math.abs(rawHeight);
  // A positive height means the rows are stored bottom-up.
  const bottomUp = rawHeight > 0;
  const rowSize = Math.floor((bitsPerPixel * width + 31) / 32) * 4;

  // 8-bpp bitmaps carry a BGRA palette between the header and the pixel data.
  let palette = null;
  if (bitsPerPixel === 8) {
    const paletteStart = 14 + headerSize;
    const count = Math.floor((dataOffset - paletteStart) / 4);
    palette = new Float64Array(count);
    for (let i = 0; i < count; i += 1) {
      const o = paletteStart + i * 4;
      palette[i] = (buffer[o] + buffer[o + 1] + buffer[o + 2]) / 3;
    }
  } else if (bitsPerPixel !== 24) {
    throw new Error(`Unsupported BMP bit depth: ${bitsPerPixel}`);
  }

  /** Luminance 0..255 at a pixel, with y measured from the top. */
  const luminanceAt = (x, y) => {
    const row = bottomUp ? height - 1 - y : y;
    const base = dataOffset + row * rowSize;
    if (bitsPerPixel === 8) return palette[buffer[base + x]] ?? 0;
    const o = base + x * 3;
    return (buffer[o] + buffer[o + 1] + buffer[o + 2]) / 3;
  };

  return { width, height, bitsPerPixel, luminanceAt };
}

/**
 * Downsample to `samples`×`samples` by box-averaging the source cells that map onto each
 * output cell. Point sampling a 960px bitmap down to 129 would alias ridges into noise;
 * averaging keeps the landform legible, which is the whole point of the data.
 */
function resample(image, samples) {
  const heights = new Array(samples * samples);
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let sy = 0; sy < samples; sy += 1) {
    const y0 = Math.floor((sy * image.height) / samples);
    const y1 = Math.max(y0 + 1, Math.floor(((sy + 1) * image.height) / samples));
    for (let sx = 0; sx < samples; sx += 1) {
      const x0 = Math.floor((sx * image.width) / samples);
      const x1 = Math.max(x0 + 1, Math.floor(((sx + 1) * image.width) / samples));
      let total = 0;
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          total += image.luminanceAt(x, y);
          count += 1;
        }
      }
      const value = total / count / 255;
      heights[sy * samples + sx] = value;
      if (value < minimum) minimum = value;
      if (value > maximum) maximum = value;
    }
  }
  // Normalise to 0..1 so `heightScale` means the same thing across every heightmap. The
  // raw range is reported in the provenance so the stretch is never silent.
  const span = maximum - minimum || 1;
  // Quantise to one byte per sample and ship base64. Every source is 8-bit luminance
  // (24-bpp greyscale or a paletted grey ramp), so a byte per sample is the source's own
  // precision, not a lossy compromise — and it turns 590 KB of JSON numbers into 22 KB
  // per map, which matters because this lands in the JS bundle.
  const bytes = Buffer.alloc(heights.length);
  for (let i = 0; i < heights.length; i += 1) {
    bytes[i] = Math.round(((heights[i] - minimum) / span) * 255);
  }
  return {
    encodedHeights: bytes.toString("base64"),
    rawRange: [Number(minimum.toFixed(4)), Number(maximum.toFixed(4))],
  };
}

const records = [];
for (const source of SOURCES) {
  const file = path.join(ARCHIVE, source.file);
  if (!existsSync(file)) {
    console.error(`SKIP ${source.id}: missing ${file}`);
    continue;
  }
  const buffer = readFileSync(file);
  const image = decodeBmp(buffer);
  const { encodedHeights, rawRange } = resample(image, source.samples);
  records.push({
    id: source.id,
    label: source.label,
    samples: source.samples,
    /** `samples`^2 bytes, row-major from the north-west corner, 0..255 mapped to 0..1. */
    encoding: "base64-uint8",
    encodedHeights,
    provenance: {
      sourcePath: `Media/textures n else/Heightmaps/${source.file}`,
      sourceRepo: "WindriderQc/GraphysX",
      sourceSha256: createHash("sha256").update(buffer).digest("hex"),
      sourceBytes: buffer.length,
      nativeSize: [image.width, image.height],
      bitsPerPixel: image.bitsPerPixel,
      rawLuminanceRange: rawRange,
      note: "Box-averaged from the native bitmap, then normalised to 0..1.",
    },
  });
  console.log(`${source.id}: ${image.width}x${image.height} @${image.bitsPerPixel}bpp -> ${source.samples}^2`);
}

const out = path.join(ROOT, "src", "legacy", "heightmaps-archive.json");
writeFileSync(
  out,
  `${JSON.stringify({ generated: new Date().toISOString(), decoder: "scripts/vendor-heightmaps.mjs", maps: records }, null, 1)}\n`,
);
console.log(`wrote ${out}`);

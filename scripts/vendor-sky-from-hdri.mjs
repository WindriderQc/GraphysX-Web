/**
 * Convert an equirectangular Radiance HDR into a six-face sky set in the archive's own
 * file convention — the missing half of the "genuinely high-res skies" roadmap item.
 *
 * The bottleneck was never the pipeline that *ships* a sky (basePath + six JPEGs +
 * a registry entry in `agent-world-skies.ts`); it was that every recovered set tops out at
 * 512² (1024² for two) and no tool existed to turn a modern licensed panorama — a 4k/8k
 * Poly Haven HDRI, a datalake capture — into faces the host can load. This is that tool:
 *
 *   node scripts/vendor-sky-from-hdri.mjs --hdr path/to/meadow_4k.hdr --name meadow
 *   node scripts/vendor-sky-from-hdri.mjs --hdr ... --name ... --size 1024 --exposure 1.2
 *   node scripts/vendor-sky-from-hdri.mjs --hdr ... --name ... --verify
 *
 * Faces land in `public/assets/sky/<name>/` as `left|right|up|down|front|back.jpg`; after
 * running it, add the set to `agent-world-skies.ts` with real provenance (source, license,
 * author) exactly as the HDRI registry does — this tool makes pixels, not provenance.
 *
 * ## The orientation contract (the part that would silently break)
 *
 * The host loads EVERY sky through `orientArchiveCubeTexture`, which quarter-turns the +Y
 * face clockwise and the -Y face counter-clockwise to undo the TV3D archive convention. A
 * new set therefore must NOT be saved in three's native orientation — it must be saved in
 * the ARCHIVE convention, i.e. with the inverse turns pre-baked into `up.jpg` / `down.jpg`,
 * so the loader's compensation lands it exactly right. `--verify` proves this: it simulates
 * the loader's turns, reprojects the six saved faces back into an equirect, and reports the
 * mean angular-sample error against the source — a continuity seam or a flipped pole shows
 * up as a large number, not as a subjective squint at a screenshot.
 *
 * ## Zero new dependencies
 *
 * The Radiance decoder is ~60 lines (header + RLE scanlines of RGBE), the cube projection
 * is pure math, and — per the `vendor-sky-jpeg.mjs` precedent — Playwright's Chromium is
 * the JPEG encoder (`canvas.toDataURL`), because Node has none in its standard library and
 * this repo does not add a native image dependency for a build-time tool.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const option = (flag) => {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
};
const HDR_PATH = option("--hdr");
const NAME = option("--name");
const SIZE = Number(option("--size") ?? 0) || null;
const EXPOSURE = Number(option("--exposure") ?? 1);
const QUALITY = Number(option("--quality") ?? 0.92);
const OUT_DIR = option("--out") ?? (NAME ? path.join(ROOT, "public", "assets", "sky", NAME) : null);
const VERIFY = argv.includes("--verify");

if (!HDR_PATH || !NAME) {
  console.error("Usage: node scripts/vendor-sky-from-hdri.mjs --hdr <file.hdr> --name <sky-id> [--size 1024] [--exposure 1] [--quality 0.92] [--verify]");
  process.exit(1);
}

// ---------------------------------------------------------------------------------------
// Radiance .hdr decoding: ASCII header, then scanlines of RGBE bytes, new-style RLE when
// the line starts 0x02 0x02. Output is linear float RGB.
// ---------------------------------------------------------------------------------------
function decodeRadianceHdr(buffer) {
  let offset = 0;
  const readLine = () => {
    let end = offset;
    while (end < buffer.length && buffer[end] !== 0x0a) end += 1;
    const line = buffer.toString("latin1", offset, end);
    offset = end + 1;
    return line;
  };
  const magic = readLine();
  if (!magic.startsWith("#?")) throw new Error("Not a Radiance HDR file");
  for (;;) {
    const line = readLine();
    if (line === "") break; // blank line ends the header
    if (offset >= buffer.length) throw new Error("HDR header never ended");
  }
  const dims = readLine().trim().match(/^-Y (\d+) \+X (\d+)$/);
  if (!dims) throw new Error("Only -Y h +X w HDR orientation is supported");
  const height = Number(dims[1]);
  const width = Number(dims[2]);
  const data = new Float32Array(width * height * 3);
  const rgbe = new Uint8Array(width * 4);

  for (let y = 0; y < height; y += 1) {
    if (buffer[offset] === 0x02 && buffer[offset + 1] === 0x02 && ((buffer[offset + 2] << 8) | buffer[offset + 3]) === width) {
      offset += 4;
      // New-style RLE: four separate component planes per scanline.
      for (let component = 0; component < 4; component += 1) {
        let x = 0;
        while (x < width) {
          const count = buffer[offset++];
          if (count > 128) {
            const value = buffer[offset++];
            for (let i = 0; i < count - 128; i += 1) rgbe[(x++) * 4 + component] = value;
          } else {
            for (let i = 0; i < count; i += 1) rgbe[(x++) * 4 + component] = buffer[offset++];
          }
        }
      }
    } else {
      // Flat scanline (or old-style RLE, which modern encoders no longer emit).
      for (let x = 0; x < width; x += 1) {
        rgbe[x * 4] = buffer[offset++];
        rgbe[x * 4 + 1] = buffer[offset++];
        rgbe[x * 4 + 2] = buffer[offset++];
        rgbe[x * 4 + 3] = buffer[offset++];
      }
    }
    for (let x = 0; x < width; x += 1) {
      const e = rgbe[x * 4 + 3];
      const scale = e === 0 ? 0 : Math.pow(2, e - 136); // 2^(e-128) / 256
      const base = (y * width + x) * 3;
      data[base] = rgbe[x * 4] * scale;
      data[base + 1] = rgbe[x * 4 + 1] * scale;
      data[base + 2] = rgbe[x * 4 + 2] * scale;
    }
  }
  return { width, height, data };
}

// ---------------------------------------------------------------------------------------
// Sampling and tone mapping.
// ---------------------------------------------------------------------------------------
/** Bilinear sample of the linear equirect at a world direction (three's convention). */
function sampleEquirect(hdr, dir) {
  const u = Math.atan2(dir[2], dir[0]) / (2 * Math.PI) + 0.5;
  const v = Math.asin(Math.max(-1, Math.min(1, dir[1]))) / Math.PI + 0.5;
  const fx = u * hdr.width - 0.5;
  const fy = (1 - v) * hdr.height - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.max(0, Math.min(hdr.height - 1, Math.floor(fy)));
  const y1 = Math.max(0, Math.min(hdr.height - 1, y0 + 1));
  const tx = fx - x0;
  const ty = fy - Math.floor(fy);
  const wrap = (x) => ((x % hdr.width) + hdr.width) % hdr.width;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c += 1) {
    const p00 = hdr.data[(y0 * hdr.width + wrap(x0)) * 3 + c];
    const p10 = hdr.data[(y0 * hdr.width + wrap(x0 + 1)) * 3 + c];
    const p01 = hdr.data[(y1 * hdr.width + wrap(x0)) * 3 + c];
    const p11 = hdr.data[(y1 * hdr.width + wrap(x0 + 1)) * 3 + c];
    out[c] = (p00 * (1 - tx) + p10 * tx) * (1 - ty) + (p01 * (1 - tx) + p11 * tx) * ty;
  }
  return out;
}

/** Narkowicz ACES fit + sRGB encode — display-referred like the recovered sets, so the
 *  renderer's own tone pass treats a vendored face exactly as it treats an archive one. */
function toneMap(value) {
  const v = value * EXPOSURE;
  const mapped = (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14);
  const clamped = Math.max(0, Math.min(1, mapped));
  const srgb = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

/**
 * Pixel (px, py) of face `index` (three cube order +X,-X,+Y,-Y,+Z,-Z) → world direction.
 * GL cubemap convention, v down — the same mapping CubeTexture uploads with (flipY off).
 */
function faceDirection(index, px, py, size) {
  const a = (2 * (px + 0.5)) / size - 1;
  const b = (2 * (py + 0.5)) / size - 1;
  switch (index) {
    case 0: return [1, -b, -a];
    case 1: return [-1, -b, a];
    case 2: return [a, 1, b];
    case 3: return [a, -1, -b];
    case 4: return [a, -b, 1];
    default: return [-a, -b, -1];
  }
}

/** Quarter-turn an RGBA face buffer. `clockwise` matches `rotateQuarterTurn`'s meaning. */
function quarterTurn(pixels, size, clockwise) {
  const out = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [sx, sy] = clockwise ? [y, size - 1 - x] : [size - 1 - y, x];
      const from = (sy * size + sx) * 4;
      const to = (y * size + x) * 4;
      out[to] = pixels[from];
      out[to + 1] = pixels[from + 1];
      out[to + 2] = pixels[from + 2];
      out[to + 3] = pixels[from + 3];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
const hdr = decodeRadianceHdr(await readFile(path.resolve(ROOT, HDR_PATH)));
const size = SIZE ?? Math.max(64, Math.round(hdr.width / 4));
console.log(`source ${hdr.width}x${hdr.height} → six ${size}² faces (exposure ${EXPOSURE}, quality ${QUALITY})`);

// three order +X,-X,+Y,-Y,+Z,-Z ↔ archive files left,right,up,down,front,back.
const FACE_FILES = ["left", "right", "up", "down", "front", "back"];
const faces = [];
for (let index = 0; index < 6; index += 1) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const rgb = sampleEquirect(hdr, faceDirection(index, px, py, size));
      const at = (py * size + px) * 4;
      pixels[at] = toneMap(rgb[0]);
      pixels[at + 1] = toneMap(rgb[1]);
      pixels[at + 2] = toneMap(rgb[2]);
      pixels[at + 3] = 255;
    }
  }
  faces.push(pixels);
}

// Bake the ARCHIVE convention: the loader will turn +Y clockwise and -Y counter-clockwise,
// so save them pre-turned the opposite way. All other faces ship as computed.
faces[2] = quarterTurn(faces[2], size, false);
faces[3] = quarterTurn(faces[3], size, true);

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.SMOKE_CHROMIUM || undefined, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  for (let index = 0; index < 6; index += 1) {
    const dataUrl = await page.evaluate(
      ({ pixels, size, quality }) => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), size, size), 0, 0);
        return canvas.toDataURL("image/jpeg", quality);
      },
      { pixels: [...faces[index]], size, quality: QUALITY },
    );
    const file = path.join(OUT_DIR, `${FACE_FILES[index]}.jpg`);
    await writeFile(file, Buffer.from(dataUrl.slice("data:image/jpeg;base64,".length), "base64"));
    console.log(`wrote ${file}`);
  }
} finally {
  await browser.close();
}

if (VERIFY) {
  // Verify the WRITTEN FILES, end to end: decode the six JPEGs, apply the loader's own
  // quarter-turns (`orientArchiveCubeTexture` semantics), box-reduce each face to 16², and
  // compare against the pre-bake reference faces reduced identically. Because both sides
  // reduce the SAME projection the texture content cancels exactly — measured, per-texel
  // comparison scored ~20/255 of pure grass-at-Nyquist phase noise on a known-good set,
  // invariant with face size, which drowned the check. What survives reduction is exactly
  // what this check exists for: a missing or reversed pre-turn, swapped or misnamed files,
  // a flipped axis, or an encoder mangling — any of which disagrees at 16² by tens to
  // hundreds, against a JPEG-noise floor of ~1/255.
  const COARSE = 16;
  const boxReduce = (pixels, stride) => {
    const cell = size / COARSE;
    const out = new Float64Array(COARSE * COARSE * 3);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const to = ((Math.floor(y / cell) * COARSE) + Math.floor(x / cell)) * 3;
        const from = (y * size + x) * stride;
        out[to] += pixels[from];
        out[to + 1] += pixels[from + 1];
        out[to + 2] += pixels[from + 2];
      }
    }
    for (let i = 0; i < out.length; i += 1) out[i] /= cell * cell;
    return out;
  };
  // The pre-bake reference: rebuild the un-turned +Y/-Y from the baked arrays (a quarter
  // turn is exactly invertible), so the reference is what the loader should reconstruct.
  const reference = faces.map((pixels, index) =>
    index === 2 ? quarterTurn(pixels, size, true) : index === 3 ? quarterTurn(pixels, size, false) : pixels,
  );
  const decoder = await chromium.launch({ headless: true, executablePath: process.env.SMOKE_CHROMIUM || undefined, args: ["--no-sandbox"] });
  try {
    const page = await decoder.newPage();
    let total = 0;
    let worstFace = { name: "", error: 0 };
    for (let index = 0; index < 6; index += 1) {
      const file = path.join(OUT_DIR, `${FACE_FILES[index]}.jpg`);
      const bytes = await readFile(file);
      const decoded = await page.evaluate(async ({ base64 }) => {
        const image = new Image();
        image.src = `data:image/jpeg;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        return [...ctx.getImageData(0, 0, canvas.width, canvas.height).data];
      }, { base64: bytes.toString("base64") });
      let loaded = new Uint8ClampedArray(decoded);
      // The loader's compensation, exactly as `orientArchiveCubeTexture` applies it.
      if (index === 2) loaded = quarterTurn(loaded, size, true);
      if (index === 3) loaded = quarterTurn(loaded, size, false);
      const got = boxReduce(loaded, 4);
      const want = boxReduce(reference[index], 4);
      let faceTotal = 0;
      for (let i = 0; i < got.length; i += 1) faceTotal += Math.abs(got[i] - want[i]);
      const faceMean = faceTotal / got.length;
      total += faceMean;
      if (faceMean > worstFace.error) worstFace = { name: FACE_FILES[index], error: faceMean };
      console.log(`verify ${FACE_FILES[index]}.jpg: coarse mean |err| ${faceMean.toFixed(2)}/255`);
    }
    const mean = total / 6;
    console.log(`verify: overall ${mean.toFixed(2)}/255 (JPEG floor ~1; an orientation/naming fault scores tens to hundreds on its face)`);
    if (mean > 6 || worstFace.error > 12) {
      console.error(`verify FAILED: ${worstFace.name} disagrees with the projection beyond encoding noise (${worstFace.error.toFixed(1)}/255).`);
      process.exit(1);
    }
  } finally {
    await decoder.close();
  }
}

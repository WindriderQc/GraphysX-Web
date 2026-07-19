/**
 * Re-encode a recovered skybox set from uncompressed BMP to JPEG, in place.
 *
 * The `nightsky` set arrived from the archive as six 1024² 24-bit Windows BMPs: 3.0 MB per
 * face, 18 MB for the set, which was ~43% of the entire product asset payload for one sky
 * out of six. A cube face is opaque, never tiled, and sampled by the GPU as a background —
 * there is no alpha to preserve and no repeated edge to bleed, so lossy encoding costs
 * nothing structural. What it can cost is *ringing*: a starfield is thousands of small
 * high-contrast points on near-black, which is the worst case for DCT quantisation, so this
 * script measures the error it introduces rather than trusting a quality number.
 *
 * WHY CHROMIUM AND NOT THE `vendor-heightmaps.mjs` DECODER
 * `scripts/vendor-heightmaps.mjs` already contains a working uncompressed-BMP reader, and
 * reusing it for the decode half would be easy. The decode half is not the problem: Node has
 * no JPEG *encoder* in its standard library, and adding one is a dependency this repo does
 * not want. Playwright's Chromium is already installed for the smokes and carries a
 * production-grade encoder behind `canvas.toDataURL("image/jpeg", q)` — and the same canvas
 * decodes BMP natively, so one tool does both halves with nothing new in package.json.
 *
 * The BMPs are deleted once the JPEGs are written, because `scripts/product-assets.mjs`
 * ships *every file* under a sky's `basePath` rather than filtering on the descriptor's
 * `extension` — leaving the bitmaps in place would ship both copies and save nothing.
 *
 * After running this, update the set's `extension` (and its description) in
 * `src/agent-world-skies.ts`.
 *
 *   node scripts/vendor-sky-jpeg.mjs                 convert nightsky at the chosen quality
 *   node scripts/vendor-sky-jpeg.mjs --measure       report the quality/size curve, write nothing
 *   node scripts/vendor-sky-jpeg.mjs --set winter --quality 0.9
 */
import { readdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");

const argv = process.argv.slice(2);
const measureOnly = argv.includes("--measure");
const setArg = argv.indexOf("--set");
const SET = setArg >= 0 ? argv[setArg + 1] : "nightsky";
const qualityArg = argv.indexOf("--quality");

/**
 * 1.0, and the measured curve is why — run `--measure` and it prints this table:
 *
 *     quality  set size   mean err   max err   worst-face PSNR
 *     0.85     0.10 MB    0.481      75/255    48.1 dB
 *     0.92     0.16 MB    0.437      65/255    49.1 dB
 *     0.95     0.25 MB    0.417      59/255    49.8 dB
 *     0.98     0.39 MB    0.393      44/255    50.6 dB
 *     1.00     1.18 MB    0.340       5/255    52.1 dB
 *
 * The mean error barely moves; the *max* error falls off a cliff between 0.98 and 1.0. That
 * cliff is chroma subsampling, not ringing — Chromium's encoder only drops to 4:4:4 at
 * quality 1.0, and below it the 4:2:0 chroma planes average each 2×2 block. A starfield is
 * exactly the content that destroys: most stars are one or two pixels wide and many are
 * distinctly coloured, so a blue star and its black neighbours share one chroma sample and
 * the star comes back grey and smeared. A 44/255 excursion on a near-black field is visible
 * as a wrong-coloured smudge where a crisp point should be.
 *
 * So this pays 0.79 MB — out of the ~17 MB the conversion recovers either way — to keep the
 * stars the colour and size they were. Choosing 0.98 would bank 4.5% more of a saving that
 * is already 93% banked, in exchange for the one artefact this set cannot afford.
 */
const DEFAULT_QUALITY = 1.0;
const QUALITY = qualityArg >= 0 ? Number(argv[qualityArg + 1]) : DEFAULT_QUALITY;
const MEASURE_QUALITIES = [0.85, 0.92, 0.95, 0.97, 0.98, 1.0];

const setDir = path.join(PUBLIC, "assets", "sky", SET);
const entries = await readdir(setDir, { withFileTypes: true });
const sources = entries
  .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".bmp"))
  .map((e) => e.name)
  .sort();

if (!sources.length) {
  console.log(`No .bmp faces under public/assets/sky/${SET} — nothing to convert.`);
  process.exit(0);
}

let bytesBefore = 0;
for (const name of sources) bytesBefore += (await stat(path.join(setDir, name))).size;

let browser = null;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto("about:blank");

  console.log(`=== ${SET}: ${sources.length} BMP faces, ${(bytesBefore / 1048576).toFixed(2)} MB ===`);

  const qualities = measureOnly ? MEASURE_QUALITIES : [QUALITY];

  // Per quality, encode every face and compare the decoded result against the original
  // pixels. `maxError` is the single worst channel deviation anywhere in the set — the
  // number that catches ringing, which is local and would vanish into a mean.
  const report = [];
  for (const quality of qualities) {
    const faces = [];
    for (const name of sources) {
      // Handed in as a data: URL rather than served over HTTP — the smokes' static server
      // has no image/bmp MIME entry, and a one-off authoring script has no business
      // widening the shared harness to get itself running.
      const bmp = await readFile(path.join(setDir, name));
      const result = await page.evaluate(
        async ({ url, quality }) => {
          const load = (src) =>
            new Promise((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = () => reject(new Error(`failed to load ${src}`));
              img.src = src;
            });

          const source = await load(url);
          const canvas = document.createElement("canvas");
          canvas.width = source.naturalWidth;
          canvas.height = source.naturalHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(source, 0, 0);
          const original = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

          const dataUrl = canvas.toDataURL("image/jpeg", quality);

          // Decode what we just encoded and diff it, so the measurement is of the bytes
          // that will actually ship rather than of the encoder's intent.
          const encoded = await load(dataUrl);
          const check = document.createElement("canvas");
          check.width = canvas.width;
          check.height = canvas.height;
          const cctx = check.getContext("2d", { willReadFrequently: true });
          cctx.drawImage(encoded, 0, 0);
          const round = cctx.getImageData(0, 0, check.width, check.height).data;

          let sum = 0;
          let max = 0;
          let squared = 0;
          let count = 0;
          for (let i = 0; i < original.length; i += 4) {
            for (let c = 0; c < 3; c += 1) {
              const d = Math.abs(original[i + c] - round[i + c]);
              sum += d;
              squared += d * d;
              if (d > max) max = d;
              count += 1;
            }
          }
          const mse = squared / count;
          return {
            width: canvas.width,
            height: canvas.height,
            dataUrl,
            meanError: sum / count,
            maxError: max,
            psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse),
          };
        },
        { url: `data:image/bmp;base64,${bmp.toString("base64")}`, quality },
      );

      const base64 = result.dataUrl.slice(result.dataUrl.indexOf(",") + 1);
      const buffer = Buffer.from(base64, "base64");
      faces.push({ name, buffer, ...result });
    }

    const bytes = faces.reduce((n, f) => n + f.buffer.length, 0);
    const summary = {
      quality,
      bytes,
      meanError: faces.reduce((n, f) => n + f.meanError, 0) / faces.length,
      maxError: Math.max(...faces.map((f) => f.maxError)),
      psnr: Math.min(...faces.map((f) => f.psnr)),
      faces,
    };
    report.push(summary);
    console.log(
      `quality ${quality.toFixed(2)}  ${(bytes / 1048576).toFixed(2)} MB  ` +
        `(${(bytes / bytesBefore * 100).toFixed(1)}% of BMP)  ` +
        `meanErr ${summary.meanError.toFixed(3)}/255  maxErr ${summary.maxError}/255  ` +
        `worst-face PSNR ${summary.psnr.toFixed(1)} dB`,
    );
  }

  if (measureOnly) {
    console.log("\n--measure: nothing written.");
  } else {
    const chosen = report[0];
    for (const face of chosen.faces) {
      const target = path.join(setDir, face.name.replace(/\.bmp$/i, ".jpg"));
      await writeFile(target, face.buffer);
      console.log(
        `wrote ${path.relative(ROOT, target).replace(/\\/g, "/")}  ` +
          `${face.width}x${face.height}  ${(face.buffer.length / 1024).toFixed(0)} KB`,
      );
    }
    for (const name of sources) {
      await unlink(path.join(setDir, name));
      console.log(`removed ${path.posix.join("public/assets/sky", SET, name)}`);
    }
    console.log(
      `\n${SET}: ${(bytesBefore / 1048576).toFixed(2)} MB -> ${(chosen.bytes / 1048576).toFixed(2)} MB ` +
        `(saved ${((bytesBefore - chosen.bytes) / 1048576).toFixed(2)} MB)`,
    );
    console.log(`Now set extension: "jpg" for "${SET}" in src/agent-world-skies.ts.`);
  }
} finally {
  if (browser) await browser.close();
}

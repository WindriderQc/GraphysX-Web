// The ClearBlue clarity pass — the archived Level 1 sky, made bindable.
//
// `levelList.xml` binds classic Level 1 to ClearBlue, but the surviving set is six 512 px
// faces that read muddy brown at play angles — the recorded reason the binding was deviated
// away instead of honoured. This tool produces `public/assets/sky/clearblue-hd/`: the same
// six faces, 2× upscaled with a mild clarity pass (unsharp mask + a small saturation/contrast
// lift), leaving the recovered originals in `sky/clearblue/` untouched.
//
// This EDITS RECOVERED PIXELS, so the output set is registered as ADAPTED — the binding is
// the archive's, the pixels are a disclosed derivation. Chromium is the decoder/encoder per
// the `vendor-sky-jpeg.mjs` precedent (quality 1.0 keeps 4:4:4 chroma), driven through the
// same Playwright the smokes already use — zero new dependencies.
//
//   node scripts/vendor-sky-clearblue-hd.mjs
//
// Faces keep the archive file convention (left|right|up|down|front|back.jpg), byte-for-byte
// the same names, so `orientArchiveCubeTexture` applies the identical TV3D quarter-turns.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "public", "assets", "sky", "clearblue");
const OUT = path.join(ROOT, "public", "assets", "sky", "clearblue-hd");
const FACES = ["left", "right", "up", "down", "front", "back"];
const SCALE = 2; // 512 -> 1024
// Gentle on purpose: enough to cut the mud, small enough that the set is recognisably the
// recovered ClearBlue. Checked by side-by-side screenshot before shipping.
const SHARPEN_AMOUNT = 0.4; // unsharp mask strength
const SATURATE = 1.1;
const CONTRAST = 1.04;
const BRIGHTNESS = 1.02;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.SMOKE_CHROMIUM || undefined,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();

for (const face of FACES) {
  const source = await readFile(path.join(SRC, `${face}.jpg`));
  const dataUrl = `data:image/jpeg;base64,${source.toString("base64")}`;
  const result = await page.evaluate(async ({ dataUrl, SCALE, SHARPEN_AMOUNT, SATURATE, CONTRAST, BRIGHTNESS }) => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("decode failed"));
      image.src = dataUrl;
    });
    const size = image.naturalWidth * SCALE;
    // Pass 1: high-quality upscale with the tone lift applied at draw time.
    const base = document.createElement("canvas");
    base.width = size;
    base.height = size;
    const baseCtx = base.getContext("2d");
    baseCtx.imageSmoothingEnabled = true;
    baseCtx.imageSmoothingQuality = "high";
    baseCtx.filter = `saturate(${SATURATE}) contrast(${CONTRAST}) brightness(${BRIGHTNESS})`;
    baseCtx.drawImage(image, 0, 0, size, size);
    // Pass 2: unsharp mask — sharpened = base + amount * (base - blurred).
    const blurred = document.createElement("canvas");
    blurred.width = size;
    blurred.height = size;
    const blurCtx = blurred.getContext("2d");
    blurCtx.filter = "blur(1.2px)";
    blurCtx.drawImage(base, 0, 0);
    const basePixels = baseCtx.getImageData(0, 0, size, size);
    const blurPixels = blurCtx.getImageData(0, 0, size, size);
    const data = basePixels.data;
    const soft = blurPixels.data;
    for (let i = 0; i < data.length; i += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        const value = data[i + channel] + SHARPEN_AMOUNT * (data[i + channel] - soft[i + channel]);
        data[i + channel] = value < 0 ? 0 : value > 255 ? 255 : value;
      }
    }
    baseCtx.putImageData(basePixels, 0, 0);
    // Quality 0.9, NOT the nightsky's 1.0 — deliberately. The 1.0 rule exists because 4:2:0
    // chroma averaging greys one- and two-pixel coloured stars; this set is smooth sky and
    // terrain with no pixel-scale chroma detail, and 0.9 keeps the six faces at ~1.5 MB
    // instead of ~4 MB (checked by side-by-side screenshot before shipping).
    return { dataUrl: base.toDataURL("image/jpeg", 0.9), size };
  }, { dataUrl, SCALE, SHARPEN_AMOUNT, SATURATE, CONTRAST, BRIGHTNESS });

  const encoded = Buffer.from(result.dataUrl.slice("data:image/jpeg;base64,".length), "base64");
  await writeFile(path.join(OUT, `${face}.jpg`), encoded);
  console.log(`${face}: ${(source.length / 1024).toFixed(0)} KB @512 -> ${(encoded.length / 1024).toFixed(0)} KB @${result.size}`);
}

await browser.close();
console.log(`wrote 6 faces to ${OUT}`);

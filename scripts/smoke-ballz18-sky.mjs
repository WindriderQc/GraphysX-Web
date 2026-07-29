import { mkdirSync } from "node:fs";
import path from "node:path";
import { productAssetManifest } from "./product-assets.mjs";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

const expected = {
  "back.png": "6fe36375a765b977aef5eb4d533ba7c28a6edbe9d5e4789e182649d5d379a2f3",
  "down.png": "7b399fbe2a4bb670afa3b7ce5353513ea061bf0e850d4dda50ffd150305ee551",
  "front.png": "ab9fcdd347782b72eb1e4d64af61f4a7ebaf11c37e243693b014916e465f95d3",
  "left.png": "63af16f2b9e7bf063edff0d888382ae2fe56e7b6e2839ee0ad878b676daee21c",
  "right.png": "bbc085db7c22940ec6364f65ced7cd00112e09f948fdcdf7861222295caff8d6",
  "up.png": "dd880ec6d416c478d03671b82c9b9f308b2ddfcb6e985e42f9489a411e8d9914",
};

const manifest = await productAssetManifest();
const expectedUrls = Object.keys(expected).map((face) => `/assets/sky/ballz18-clear-sky/${face}`);
const release = {
  allFaces: expectedUrls.every((url) => manifest.files.includes(url)),
  provenance: manifest.files.includes("/assets/sky/ballz18-clear-sky/PROVENANCE.json"),
  noGeneratedUpscale: manifest.files.every((url) => !url.includes("/clearblue-hd/")),
};

const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(String(error)));
const out = { release };

try {
  await page.goto(`${BASE}?host=standalone&intro=0`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__GRAPHYSX__ && !!window.__GRAPHYSX_HOST__, null, { timeout: SMOKE_TIMEOUT });
  out.registry = await page.evaluate(() => window.__GRAPHYSX__.skies().find((sky) => sky.id === "ballz18-clear-sky") ?? null);
  out.faces = await page.evaluate(async (expectedHashes) => {
    const rows = [];
    for (const [name, expectedHash] of Object.entries(expectedHashes)) {
      const response = await fetch(`/assets/sky/ballz18-clear-sky/${name}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      const sha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
      rows.push({ name, ok: response.ok, width: bitmap.width, height: bitmap.height, sha256, exact: sha256 === expectedHash });
      bitmap.close();
    }
    return rows;
  }, expected);

  out.created = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const result = api.create({
      schema: api.worldSchema,
      id: "ballz18-clear-sky-proof",
      label: "BallZ18 Clear Sky — exact archive proof",
      environment: {
        sky: "ballz18-clear-sky",
        background: "#b8d5e4",
        lighting: { source: "sky", intensity: 1.05, yawDegrees: -92, backgroundIntensity: 1, backgroundBlur: 0 },
        ground: { visible: true, size: 36, color: "#51676c", grid: true, gridColor: "#b8d5e4" },
      },
      entities: [
        { id: "sun", type: "directional-light", intensity: 2.4, transform: { position: [-8, 12, 8] }, material: { color: "#fff1d4" }, castShadow: true },
        { id: "ambient", type: "ambient-light", intensity: 0.48, material: { color: "#c9e8f5" } },
        { id: "left-marker", type: "box", label: "Archive blue", transform: { position: [-3, 1.2, 0] }, geometry: { width: 1.6, height: 2.4, depth: 1.6 }, material: { color: "#44a9dc", metalness: 0.18, roughness: 0.34 }, castShadow: true },
        { id: "center-marker", type: "icosahedron", label: "Archive gold", transform: { position: [0, 1.6, -1] }, geometry: { radius: 1.6 }, material: { color: "#f0b15d", metalness: 0.4, roughness: 0.28 }, castShadow: true },
        { id: "right-marker", type: "sphere", label: "Archive coral", transform: { position: [3.2, 1.1, 0.4] }, geometry: { radius: 1.1, radialSegments: 32 }, material: { color: "#e86f62", metalness: 0.12, roughness: 0.38 }, castShadow: true },
      ],
    });
    window.__GRAPHYSX_HOST__.applyEnvironment();
    window.__GRAPHYSX_HOST__.camera.position.set(9, 5.8, 13);
    window.__GRAPHYSX_HOST__.controls.target.set(0, 1.2, -1);
    window.__GRAPHYSX_HOST__.controls.update();
    window.__GRAPHYSX_HOST__.exitEditor();
    return { ok: result.ok, sky: api.exportDocument().environment.sky };
  });
  await page.waitForFunction(() => window.__GRAPHYSX_HOST__.scene.background?.isCubeTexture === true, null, { timeout: SMOKE_TIMEOUT });
  await page.waitForTimeout(1200);
  out.applied = await page.evaluate(() => {
    const texture = window.__GRAPHYSX_HOST__.scene.background;
    return {
      cubeTexture: texture?.isCubeTexture === true,
      orientation: texture?.userData?.graphysxSkyboxOrientation ?? null,
      faceCount: texture?.images?.length ?? 0,
      dimensions: (texture?.images ?? []).map((image) => [image.width ?? image.naturalWidth, image.height ?? image.naturalHeight]),
    };
  });
  await page.screenshot({ path: path.join(ART, "ballz18-clear-sky.png") });
} catch (error) {
  out.fatal = String(error);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
await browser.close();

const pass = !out.fatal && release.allFaces && release.provenance && release.noGeneratedUpscale
  && out.registry?.resolution === 2048 && out.registry?.source?.includes("unity-ballz18")
  && out.faces?.length === 6 && out.faces.every((face) => face.ok && face.exact && face.width === 2048 && face.height === 2048)
  && out.created?.ok === true && out.created?.sky === "ballz18-clear-sky"
  && out.applied?.cubeTexture && out.applied?.orientation === "native-cubemap" && out.applied?.faceCount === 6
  && out.applied?.dimensions.every(([width, height]) => width === 2048 && height === 2048)
  && consoleErrors.length === 0 && pageErrors.length === 0;

console.log(JSON.stringify(out, null, 2));
console.log(pass ? "SMOKE PASS" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

// meshlight.shade translation: source text is shipped, exact Room 2 maps load, translated
// GLSL compiles, archive settings are live/patchable, and the material document round-trips.
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || "output/smoke";
mkdirSync(ART, { recursive: true });
const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(String(error)));
const out = {};
out.vendoredSha256 = createHash("sha256").update(readFileSync("public/assets/shaders/archive-meshlight.shade")).digest("hex").toUpperCase();

try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__GRAPHYSX__ && !!window.__GRAPHYSX_HOST__ && !!window.__GRAPHYSX_CONTENT__, null, { timeout: SMOKE_TIMEOUT });
  out.composed = await page.evaluate(async () => {
    const result = await window.__GRAPHYSX_CONTENT__.composeArchiveMeshlight();
    return { ok: result.ok, error: result.error ?? null, provenance: result.provenance ?? null };
  });
  await page.waitForFunction(() => {
    let compiled = 0;
    window.__GRAPHYSX_HOST__.world.group.traverse((object) => {
      const material = object.material;
      if (material?.userData?.graphysxArchiveMeshlightShader) compiled += 1;
    });
    return compiled === 2;
  }, null, { timeout: SMOKE_TIMEOUT * 2 });
  await page.waitForTimeout(1000);

  out.materials = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const inspect = (id) => {
      let mesh = null;
      window.__GRAPHYSX_HOST__.world.group.traverse((object) => {
        if (!mesh && object.userData?.graphysxEntityId === id) mesh = object;
      });
      const material = mesh?.material;
      const shader = material?.userData?.graphysxArchiveMeshlightShader;
      const record = material?.userData?.graphysxArchiveMeshlight;
      return {
        state: api.query({ ids: [id] })[0]?.material?.shader ?? null,
        compiled: !!shader,
        diffuseReady: !!material?.map,
        normalReady: !!material?.normalMap,
        specularReady: !!material?.userData?.graphysxAgentSpecularTexture,
        sourceSha256: record?.sourceSha256 ?? null,
        hasParallaxEquation: shader?.fragmentShader?.includes("gxHeight * gxMeshlightParallax - gxMeshlightParallax * 0.5") ?? false,
        hasLyonEquation: shader?.fragmentShader?.includes("dot( gxDifference, gxDifference ) * 60.0") ?? false,
        hasDiffuseFloor: shader?.fragmentShader?.includes("+ 0.15") ?? false,
        shadowKernel: record?.shadowKernel ?? null,
      };
    };
    return {
      reference: inspect("meshlight-pbr"),
      source: inspect("meshlight-source"),
      editor: inspect("meshlight-editor"),
      textures: ["common-tv3dlogo-diffuse", "common-tv3dlogo-normal"].every((id) => api.textures().some((texture) => texture.id === id)),
      capability: api.capabilities.includes("material.shader.archive-meshlight"),
    };
  });
  await page.screenshot({ path: path.join(ART, "meshlight-lab.png") });

  out.patch = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const entity = api.query({ ids: ["meshlight-source"] })[0];
    const updated = api.update("meshlight-source", {
      material: { shader: { ...entity.material.shader, parallaxStrength: 0.11, specularMultiplier: 7 } },
    });
    let mesh = null;
    window.__GRAPHYSX_HOST__.world.group.traverse((object) => {
      if (!mesh && object.userData?.graphysxEntityId === "meshlight-source") mesh = object;
    });
    const uniforms = mesh.material.userData.graphysxArchiveMeshlightUniforms;
    return {
      ok: updated.ok,
      state: api.query({ ids: ["meshlight-source"] })[0].material.shader,
      parallaxUniform: uniforms.gxMeshlightParallax.value,
      specularUniform: uniforms.gxMeshlightSpecularMultiplier.value,
    };
  });

  out.sourceText = await page.evaluate(async () => {
    const response = await fetch("/assets/shaders/archive-meshlight.shade");
    const text = await response.text();
    return {
      ok: response.ok,
      bytes: new TextEncoder().encode(text).length,
      samples8: text.includes("#define NUM_SAMPLES 8"),
      bias088: text.includes("#define BIAS        0.88"),
      lyon: text.includes("float CalculateLyon"),
    };
  });

  out.roundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const document_ = api.exportDocument();
    const before = document_.entities.find((entity) => entity.id === "meshlight-source").material.shader;
    const loaded = api.load(document_);
    const after = api.query({ ids: ["meshlight-source"] })[0].material.shader;
    return { ok: loaded.ok, before, after };
  });
  await page.waitForTimeout(1000);
} catch (error) {
  out.fatal = String(error);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
await browser.close();

const translated = [out.materials?.source, out.materials?.editor];
const pass =
  !out.fatal && out.composed?.ok === true &&
  out.composed?.provenance?.sourceSha256 === "AE1ECFC0887F46712FFE43796D684BFCB6268F3B74E284B5FE5CBEC4A54BFF05" &&
  out.vendoredSha256 === "0EE6F3C954BAD315B365EA66239F970E0476D7CD212E85F8EDE9307839DC5A1C" &&
  out.materials?.reference?.state === null && out.materials?.reference?.compiled === false &&
  translated.every((entry) => entry?.compiled && entry.diffuseReady && entry.normalReady && entry.specularReady && entry.hasParallaxEquation && entry.hasLyonEquation && entry.hasDiffuseFloor && entry.shadowKernel === "three-point-pcf-adapted") &&
  out.materials?.textures === true && out.materials?.capability === true &&
  out.patch?.ok === true && out.patch?.state?.parallaxStrength === 0.11 && out.patch?.state?.specularMultiplier === 7 &&
  out.patch?.parallaxUniform === 0.11 && out.patch?.specularUniform === 7 &&
  out.sourceText?.ok === true && out.sourceText?.bytes === 9036 && out.sourceText?.samples8 && out.sourceText?.bias088 && out.sourceText?.lyon &&
  out.roundTrip?.ok === true && JSON.stringify(out.roundTrip?.before) === JSON.stringify(out.roundTrip?.after) &&
  out.pageErrors.length === 0 && out.consoleErrors.length === 0;

console.log(JSON.stringify(out, null, 2));
console.log(pass ? "SMOKE PASS" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);

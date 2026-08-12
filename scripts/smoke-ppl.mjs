import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

// ppl.shade revival: exact source and normal inputs ship, the active ZRing sphere binding
// compiles, source/active bump values remain distinct, patches hit uniforms, and documents
// round-trip the discriminated shader settings.
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
const out = {
  vendoredShaderSha256: createHash("sha256").update(readFileSync("public/assets/shaders/archive-ppl.shade")).digest("hex").toUpperCase(),
  vendoredNormalSha256: createHash("sha256").update(readFileSync("public/assets/textures/archive/ball_Normal.png")).digest("hex").toUpperCase(),
};

try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__GRAPHYSX__ && !!window.__GRAPHYSX_HOST__ && !!window.__GRAPHYSX_CONTENT__, null, { timeout: SMOKE_TIMEOUT });
  out.composed = await page.evaluate(async () => {
    const result = await window.__GRAPHYSX_CONTENT__.composeArchivePpl();
    return { ok: result.ok, error: result.error ?? null, provenance: result.provenance ?? null };
  });
  await page.waitForFunction(() => {
    let compiled = 0;
    window.__GRAPHYSX_HOST__.world.group.traverse((object) => {
      if (object.material?.userData?.graphysxArchivePplShader) compiled += 1;
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
      const shader = material?.userData?.graphysxArchivePplShader;
      const record = material?.userData?.graphysxArchivePpl;
      return {
        state: api.query({ ids: [id] })[0]?.material?.shader ?? null,
        compiled: !!shader,
        diffuseReady: !!material?.map,
        normalReady: !!material?.normalMap,
        sourceSha256: record?.sourceSha256 ?? null,
        hasParallaxEquation: shader?.fragmentShader?.includes("gxPplHeight * gxPplBumpAmount - gxPplBumpAmount * 0.5") ?? false,
        hasNormalDecode: shader?.fragmentShader?.includes("texture2D( normalMap, gxPplNormalUv ).xyz * 2.0 - 1.0") ?? false,
        hasLambertEquation: shader?.fragmentShader?.includes("saturate( dot( gxPplLightDirection, normal ) )") ?? false,
        lightingEquation: record?.lightingEquation ?? null,
      };
    };
    return {
      reference: inspect("ppl-pbr"),
      source: inspect("ppl-source"),
      ring: inspect("ppl-ring"),
      textures: ["z-ring", "archive-ball-normal"].every((id) => api.textures().some((texture) => texture.id === id)),
      capability: api.capabilities.includes("material.shader.archive-ppl"),
    };
  });
  await page.screenshot({ path: path.join(ART, "ppl-lab.png") });

  out.patch = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const entity = api.query({ ids: ["ppl-ring"] })[0];
    const updated = api.update("ppl-ring", {
      material: { shader: { ...entity.material.shader, bumpAmount: 0.041 } },
    });
    let mesh = null;
    window.__GRAPHYSX_HOST__.world.group.traverse((object) => {
      if (!mesh && object.userData?.graphysxEntityId === "ppl-ring") mesh = object;
    });
    return {
      ok: updated.ok,
      state: api.query({ ids: ["ppl-ring"] })[0].material.shader,
      bumpUniform: mesh.material.userData.graphysxArchivePplUniforms.gxPplBumpAmount.value,
    };
  });

  out.sourceText = await page.evaluate(async () => {
    const response = await fetch("/assets/shaders/archive-ppl.shade");
    const text = await response.text();
    return {
      ok: response.ok,
      bytes: new TextEncoder().encode(text).length,
      sourceDefault: text.includes("float    BumpAmount = 0.03"),
      parallax: text.includes("BumpAmount * 0.5"),
      lambert: text.includes("saturate(dot(L, N))"),
    };
  });

  out.roundTrip = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const document_ = api.exportDocument();
    const before = document_.entities.find((entity) => entity.id === "ppl-ring").material.shader;
    const loaded = api.load(document_);
    const after = api.query({ ids: ["ppl-ring"] })[0].material.shader;
    return { ok: loaded.ok, before, after };
  });
  await page.waitForTimeout(1000);
} catch (error) {
  out.fatal = String(error);
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
await browser.close();

const translated = [out.materials?.source, out.materials?.ring];
const pass =
  !out.fatal && out.composed?.ok === true &&
  out.composed?.provenance?.sourceSha256 === "D6CE1C90555EF1599921B0000ED3FD68CBD86D004E0F074B1693553BE0D8A4C1" &&
  out.vendoredShaderSha256 === "56946EACC92DCC9288863317423BF81C21205128EEE0FB0BDD2CC315B3ECF3CF" &&
  out.vendoredNormalSha256 === "F4198F4535F4FEBEB0B7DEABEF6F2F8C2BFD0A6EA94A14C0A952FEBD4354C02B" &&
  out.materials?.reference?.state === null && out.materials?.reference?.compiled === false &&
  translated.every((entry) => entry?.compiled && entry.diffuseReady && entry.normalReady && entry.hasParallaxEquation && entry.hasNormalDecode && entry.hasLambertEquation && entry.lightingEquation === "source-tangent-lambert") &&
  out.materials?.source?.state?.bumpAmount === 0.03 && out.materials?.ring?.state?.bumpAmount === 0.025 &&
  out.materials?.textures === true && out.materials?.capability === true &&
  out.patch?.ok === true && out.patch?.state?.bumpAmount === 0.041 && out.patch?.bumpUniform === 0.041 &&
  out.sourceText?.ok === true && out.sourceText?.bytes === 2784 && out.sourceText?.sourceDefault && out.sourceText?.parallax && out.sourceText?.lambert &&
  out.roundTrip?.ok === true && JSON.stringify(out.roundTrip?.before) === JSON.stringify(out.roundTrip?.after) &&
  out.pageErrors.length === 0 && out.consoleErrors.length === 0;

console.log(JSON.stringify(out, null, 2));
console.log(pass ? "SMOKE PASS" : "SMOKE FAIL");
process.exit(pass ? 0 : 1);

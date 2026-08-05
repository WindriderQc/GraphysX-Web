/**
 * Deterministic browser proof for the adaptive renderer budget.
 *
 * The scene document keeps its authored reflective water in both viewports. Runtime profiles
 * alone cap DPR and schedule reflection/shadow refreshes, so export fidelity and frame cost do
 * not fight each other.
 */
import { startStaticServer } from "./static-server.mjs";
import { applySmokeTimeout, launchSmokeBrowser, SMOKE_TIMEOUT } from "./smoke-harness.mjs";

const root = new URL("../dist/", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1");
const server = await startStaticServer({ root, port: 0 });
const browser = await launchSmokeBrowser({
  args: ["--no-sandbox", "--use-gl=swiftshader", "--disable-dev-shm-usage"],
});

async function sample(label, viewport, deviceScaleFactor) {
  const page = applySmokeTimeout(await browser.newPage({ viewport, deviceScaleFactor }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => 16 });
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => 8 });
  });
  try {
    await page.goto(`${server.url}?intro=0`, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
    await page.waitForFunction(() => Boolean(window.__GRAPHYSX_HOST__ && window.__GRAPHYSX__), null, {
      timeout: SMOKE_TIMEOUT,
    });
    await page.waitForTimeout(1600);
    return await page.evaluate(async (sampleLabel) => {
      const host = window.__GRAPHYSX_HOST__;
      const renderer = host.renderer;
      window.__GRAPHYSX__.pause(true);
      const previousAutoReset = renderer.info.autoReset;
      renderer.info.autoReset = false;
      renderer.info.reset();
      const startedAt = performance.now();
      const startFrame = host.frameCount;
      await new Promise((resolve) => {
        const poll = () => {
          if (host.frameCount - startFrame >= 24 || performance.now() - startedAt >= 8000) resolve();
          else requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      });
      const elapsedMs = performance.now() - startedAt;
      const frames = host.frameCount - startFrame;
      const render = { ...renderer.info.render };
      renderer.info.reset();
      renderer.info.autoReset = previousAutoReset;
      const canvas = renderer.domElement;
      const overlay = document.querySelector(".gx-overlay-canvas");
      const showroomRig = host.scene.getObjectByName("ShowroomEnvironment");
      const sun = showroomRig?.children.find((object) => object.isDirectionalLight);
      const water = window.__GRAPHYSX__.query({ ids: ["showroom-water"] })[0];
      return {
        label: sampleLabel,
        profile: host.qualityProfile,
        rootProfile: document.documentElement.dataset.gxRenderProfile ?? null,
        pixelRatio: renderer.getPixelRatio(),
        cssBuffer: [canvas.clientWidth, canvas.clientHeight],
        drawingBuffer: [canvas.width, canvas.height],
        overlayBuffer: [overlay?.width ?? 0, overlay?.height ?? 0],
        shadowMapSize: sun?.shadow?.mapSize?.x ?? null,
        authoredReflection: water?.water?.reflection ?? null,
        elapsedMs: Number(elapsedMs.toFixed(1)),
        frames,
        fps: Number((frames * 1000 / elapsedMs).toFixed(1)),
        callsPerFrame: frames ? Number((render.calls / frames).toFixed(1)) : null,
        trianglesPerFrame: frames ? Math.round(render.triangles / frames) : null,
      };
    }, label);
  } finally {
    await page.close();
  }
}

try {
  const desktop = await sample("desktop", { width: 1280, height: 720 }, 1);
  const mobile = await sample("mobile", { width: 390, height: 844 }, 2);
  const failures = [];
  const expect = (condition, message) => { if (!condition) failures.push(message); };

  expect(desktop.profile?.name === "high", `desktop profile was ${desktop.profile?.name}`);
  expect(desktop.profile?.shadowHz === 30 && desktop.profile?.reflectionHz === 30, "desktop cadence changed");
  expect(desktop.shadowMapSize === 2048, `desktop shadow map was ${desktop.shadowMapSize}`);
  expect(JSON.stringify(desktop.cssBuffer) === JSON.stringify([1280, 720]),
    `desktop canvas client size was ${JSON.stringify(desktop.cssBuffer)}`);
  expect(desktop.callsPerFrame > 0 && desktop.callsPerFrame < 260,
    `desktop auxiliary passes stacked (${desktop.callsPerFrame} calls/frame)`);

  expect(mobile.profile?.name === "mobile", `mobile profile was ${mobile.profile?.name}`);
  expect(mobile.pixelRatio === 1.5, `mobile DPR was ${mobile.pixelRatio}`);
  expect(mobile.profile?.shadowHz === 20 && mobile.profile?.reflectionHz === 0, "mobile cadence changed");
  expect(mobile.shadowMapSize === 1024, `mobile shadow map was ${mobile.shadowMapSize}`);
  expect(JSON.stringify(mobile.cssBuffer) === JSON.stringify([390, 844]),
    `mobile canvas client size was ${JSON.stringify(mobile.cssBuffer)}`);
  expect(JSON.stringify(mobile.drawingBuffer) === JSON.stringify([585, 1266]),
    `mobile drawing buffer was ${JSON.stringify(mobile.drawingBuffer)}`);
  expect(mobile.callsPerFrame > 0 && mobile.callsPerFrame < 170,
    `mobile render exceeded its non-reflective ceiling (${mobile.callsPerFrame} calls/frame)`);

  expect(desktop.authoredReflection === true && mobile.authoredReflection === true,
    "runtime quality mutated the authored water entity");
  expect(JSON.stringify(desktop.overlayBuffer) === "[1,1]" && JSON.stringify(mobile.overlayBuffer) === "[1,1]",
    "inactive overlay allocated a viewport-sized backing store");
  expect(desktop.rootProfile === desktop.profile?.name && mobile.rootProfile === mobile.profile?.name,
    "published profile did not match the host profile");

  console.log(JSON.stringify({ ok: failures.length === 0, desktop, mobile, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}

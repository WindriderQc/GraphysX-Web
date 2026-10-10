import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";

// A `model` entity must render centred on its own origin — at every `fitSize`.
//
// This exists because that was silently false for the entire life of the loader, and nothing in
// the gate noticed. `loadAgentWorldModel` recentred with `position = -center` while setting
// `scale` on the SAME Object3D; three composes a local matrix as T·R·S, so the geometry was
// scaled and the recentring translation was not. Every model whose `fitSize` differed from its
// native span landed displaced from its anchor by `center * (1 - scale)` — and the mirrored Z
// (`scale.z = -s`) flipped that error's sign on one axis. The default `fitSize` is 4, so this
// was most of them. It shipped, and the Archive Garage worked around it by loading every car at
// `fitSize = native span`, the one value where the defect is identically zero.
//
// The assertion that would have caught it is the one this smoke makes, and it is deliberately a
// WORLD-space measurement of the rendered vertices rather than a read of the loader's own
// numbers: the bug lived entirely in the composition of transforms the loader set correctly one
// at a time. Reading back `position` and `scale` would have agreed with the buggy code.
//
// The Piste Ovale is the probe because its bounds centre sits 9.6955 units above its own base,
// so the defect is loud there. This smoke was falsified against the defect rather than assumed
// to catch it: reverting `agent-world-assets.ts` to `position.set(-center)` and rebuilding
// produces, from this exact script,
//
//   fitSize   4  ->  offset y = -9.5016   (predicted center*(1-scale) = 9.6955 * 0.98)
//   fitSize  40  ->  offset y = -7.7564   (predicted             9.6955 * 0.8)
//   fitSize 200  ->  offset y =  0.0000   (native span: the defect is identically zero)
//
// and the script exits 1. Note the third line: that is why the native-span case is here as a
// control. It is the value the Archive Garage pinned every car to, and a suite that only ever
// loaded models at their native span would have measured zero forever and called it green.
//
// The span check is the other half, and is not decoration: "centre the model on its origin" is
// trivially satisfiable by dropping the scale altogether. Asserting the rendered longest span
// still equals `fitSize` keeps the fit and the centring honest at the same time.

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const TRACK = "/assets/vehicles/archive-piste-ovale.json";
// From src/archive-vehicles-manifest.ts: 150 x 19.391 x 200, min.y = 0. Native span 200.
const NATIVE_SPAN = 200;

// fitSize 4 is the default and the loudest case; 40 is an ordinary authored value; 200 is the
// native span, where the old buggy code was accidentally correct — it is the control that proves
// the probe measures placement rather than always reporting zero.
const CASES = [
  { fitSize: 4, at: [12, 3, -7] },
  { fitSize: 40, at: [-5, 11, 2] },
  { fitSize: NATIVE_SPAN, at: [0, 120, 0] },
];

const consoleErrors = [];
const pageErrors = [];
const badResponses = [];
const browser = await launchSmokeBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("response", (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });

const out = {};
try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX__ && !!window.__GRAPHYSX_HOST__, { timeout: SMOKE_TIMEOUT });

  out.cases = [];
  for (const probe of CASES) {
    const id = `recentre-${probe.fitSize}`;
    await page.evaluate(([id, url, fitSize, at]) => {
      window.__GRAPHYSX__.spawn({
        id, type: "model", label: `recentring probe @ fitSize ${fitSize}`,
        // `transform.position`, NOT a top-level `position` — spawn ignores unknown keys
        // silently, and an entity left at the origin makes this whole smoke measure zero
        // against zero and pass. `placedAt` below is the guard against exactly that.
        transform: { position: at },
        asset: { url, format: "graphysx-mesh-json", fitSize },
      });
    }, [id, TRACK, probe.fitSize, probe.at]);

    await page.waitForFunction(
      (id) => (window.__GRAPHYSX__.query({ ids: [id] })[0] || {}).asset?.status === "ready",
      id,
      { timeout: SMOKE_TIMEOUT },
    ).catch(() => {});

    out.cases.push(await page.evaluate(([id, fitSize, at]) => {
      const api = window.__GRAPHYSX__;
      const host = window.__GRAPHYSX_HOST__;
      const state = api.query({ ids: [id] })[0];
      if (!state || state.asset?.status !== "ready") return { id, fitSize, status: state?.asset?.status ?? null };

      let root = null;
      host.world.group.traverse((o) => { if (!root && o.userData && o.userData.graphysxEntityId === id) root = o; });
      if (!root) return { id, fitSize, noObject: true };

      // Measure what is actually on screen. The matrices have to be current: nothing forces an
      // update between the async asset resolving and this read.
      host.scene.updateMatrixWorld(true);

      // Three's Box3/Vector3 are not exposed on window, but every Object3D carries a Vector3 to
      // clone and `localToWorld`. With only scale and translation in the chain (no rotation),
      // the eight transformed corners of each mesh's local bounds give the exact world AABB.
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      const scratch = root.position.clone();
      let meshes = 0;
      root.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        meshes += 1;
        for (const cx of [b.min.x, b.max.x]) for (const cy of [b.min.y, b.max.y]) for (const cz of [b.min.z, b.max.z]) {
          scratch.set(cx, cy, cz);
          o.localToWorld(scratch);
          const corner = [scratch.x, scratch.y, scratch.z];
          for (let axis = 0; axis < 3; axis += 1) {
            if (corner[axis] < min[axis]) min[axis] = corner[axis];
            if (corner[axis] > max[axis]) max[axis] = corner[axis];
          }
        }
      });
      if (!meshes) return { id, fitSize, noMeshes: true };

      const centre = [0, 1, 2].map((axis) => (min[axis] + max[axis]) / 2);
      const size = [0, 1, 2].map((axis) => max[axis] - min[axis]);
      return {
        id,
        fitSize,
        meshes,
        entityOrigin: at,
        // Where the entity actually ended up, read back off state. If this drifts from the
        // requested origin the probe is measuring the wrong thing and must not be believed.
        placedAt: (state.transform?.position ?? state.position ?? []).map((v) => Number(v.toFixed(4))),
        renderedCentre: centre.map((v) => Number(v.toFixed(4))),
        // The displacement the defect produced. This is THE number.
        offset: centre.map((v, axis) => Number((v - at[axis]).toFixed(4))),
        renderedSpan: Number(Math.max(...size).toFixed(4)),
      };
    }, [id, probe.fitSize, probe.at]));
  }
} catch (error) {
  out.fatal = String(error);
}

out.badResponses = badResponses;
// Known pre-existing: routes with no scene store probe localhost:8788 and get refused.
out.consoleErrors = consoleErrors.filter((t) => !/localhost:8788|ERR_CONNECTION_REFUSED/.test(t));
out.pageErrors = pageErrors;

// A model is centred on its origin, and still fits the size it was asked to fit. Hundredths of a
// unit against a defect that moved this by ~9.5 at fitSize 4.
const CENTRE_TOLERANCE = 0.01;
const SPAN_TOLERANCE = 0.01;
const verdicts = (out.cases || []).map((c) => ({
  fitSize: c.fitSize,
  // The probe is only meaningful if the entity is where we asked. A model sitting at the origin
  // would report a zero offset no matter how broken the loader is.
  placed: Array.isArray(c.placedAt) && Array.isArray(c.entityOrigin)
    && c.placedAt.length === 3
    && c.entityOrigin.some((v) => v !== 0)
    && c.entityOrigin.every((v, axis) => Math.abs(c.placedAt[axis] - v) <= CENTRE_TOLERANCE),
  centred: Array.isArray(c.offset) && c.offset.every((d) => Math.abs(d) <= CENTRE_TOLERANCE),
  fitted: typeof c.renderedSpan === "number" && Math.abs(c.renderedSpan - c.fitSize) <= SPAN_TOLERANCE * c.fitSize,
}));
out.verdicts = verdicts;

console.log(JSON.stringify(out, null, 2));
await browser.close();

const ok =
  verdicts.length === CASES.length &&
  verdicts.every((v) => v.placed && v.centred && v.fitted) &&
  out.badResponses.length === 0;

process.exit(out.fatal || out.pageErrors.length || out.consoleErrors.length || !ok ? 1 : 0);

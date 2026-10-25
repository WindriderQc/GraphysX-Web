import { SMOKE_TIMEOUT, applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// ISS Live — the Family Earth3D adapter. Driven, not derived: a FIXTURE TLE and an
// injected clock make every claim deterministic and keep the gate off the network.
// What must hold: the marker rides the station shell (never inside the planet), the
// orbit and ground-track splines carry a full propagated revolution at their own radii,
// advancing the clock moves the marker by a real orbital arc, a stale TLE says STALE,
// garbage input degrades to an honest error panel, and the panel always carries the
// epoch, the timezone-labelled computation time and the no-visibility-claims sentence.

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4188/";
const ART = process.env.SMOKE_ARTIFACTS || path.resolve("output/smoke");
mkdirSync(ART, { recursive: true });

// The real TLE served by specialblend.ca/api/tle on 2026-10-25 (epoch 2026-10-24).
const FIXTURE_TLE = `ISS (ZARYA)
1 25544U 98067A   26297.20915682  .00007800  00000+0  14938-3 0  9991
2 25544  51.6335  21.6229 0006884 302.9098  57.1228 15.49030149591752`;
// Epoch day 297.20915682 of 2026 = 2026-10-24T05:01:11Z; start the clock 6 h later.
const EPOCH_MS = Date.UTC(2026, 0, 1) + (297.20915682 - 1) * 86_400_000;
const NOW_MS = EPOCH_MS + 6 * 3_600_000;

const consoleErrors = [];
const pageErrors = [];
const out = {};

const browser = await launchSmokeBrowser();
const page = await browser.newPage();
applySmokeTimeout(page);
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

try {
  await page.goto(`${BASE}?host=standalone`, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT });
  await page.waitForFunction(() => !!window.__GRAPHYSX__ && !!window.__GRAPHYSX_CONTENT__, { timeout: SMOKE_TIMEOUT });

  out.run = await page.evaluate(async ({ tle, nowMs }) => {
    const api = window.__GRAPHYSX__;
    const composed = await window.__GRAPHYSX_CONTENT__.composeIssLive({ tleText: tle, nowMs });
    if (!composed.ok) return { composeError: composed.error };
    await composed.live.ready;
    const live = composed.live;

    const radius = (p) => Math.hypot(p[0], p[1], p[2]);
    const marker = () => api.query({ ids: ["iss-marker"] })[0].position;
    const splinePoints = (id) => api.export().entities.find((e) => e.id === id)?.path?.points ?? [];

    const first = live.state();
    const markerShell = radius(marker()) / 5; // scene Earth radius is 5
    const orbit = splinePoints("iss-orbit");
    const ground = splinePoints("iss-ground-track");
    const orbitRadii = orbit.map(radius);
    const groundRadii = ground.map(radius);
    const panelText = () => document.querySelector(".gx-iss-panel")?.textContent ?? "";
    const panelFresh = panelText();

    // Advance the injected clock 10 minutes: a real orbital arc, measured as chord.
    const before = marker();
    live.setNow(nowMs + 10 * 60_000);
    const after = marker();
    const moved = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);

    // Push the clock past the staleness bar.
    live.setNow(nowMs + 80 * 3_600_000);
    const staleState = live.state();
    const panelStale = panelText();

    // Degraded path: a second mount with garbage must say so, not invent a position.
    live.dispose();
    const broken = await window.__GRAPHYSX_CONTENT__.composeIssLive({ tleText: "not a tle", nowMs });
    await broken.live.ready;
    const errorState = broken.live.state();
    const panelError = panelText();
    broken.live.dispose();
    const panelGone = document.querySelector(".gx-iss-panel") === null;

    return {
      entities: api.state().entities.length,
      first,
      markerShell,
      orbitCount: orbit.length,
      orbitShellMin: Math.min(...orbitRadii) / 5,
      orbitShellMax: Math.max(...orbitRadii) / 5,
      groundShellMin: Math.min(...groundRadii) / 5,
      groundShellMax: Math.max(...groundRadii) / 5,
      moved,
      staleFlag: staleState.stale,
      panelHasToronto: panelFresh.includes("America/Toronto"),
      panelHasDisclaimer: panelFresh.includes("says nothing about visibility"),
      panelFreshBadge: panelFresh.includes("FRESH TLE"),
      panelStaleBadge: panelStale.includes("STALE"),
      errorOk: errorState.ok === false && typeof errorState.error === "string",
      panelErrorBadge: panelError.includes("TLE UNAVAILABLE"),
      panelGone,
    };
  }, { tle: FIXTURE_TLE, nowMs: NOW_MS });

  await page.screenshot({ path: path.join(ART, "iss-live.png"), fullPage: false });
} catch (e) {
  out.fatal = String(e);
} finally {
  await browser.close();
}

out.consoleErrors = consoleErrors;
out.pageErrors = pageErrors;
console.log(JSON.stringify(out, null, 2));

const r = out.run ?? {};
const ok =
  !out.fatal &&
  r.first?.ok === true &&
  r.first?.error === null &&
  typeof r.first?.ageHours === "number" && Math.abs(r.first.ageHours - 6) < 0.5 &&
  r.first?.stale === false &&
  typeof r.first?.altKm === "number" && r.first.altKm > 350 && r.first.altKm < 500 &&
  r.markerShell > 1.04 && r.markerShell < 1.09 &&
  r.orbitCount === 64 &&
  r.orbitShellMin > 1.04 && r.orbitShellMax < 1.09 &&
  r.groundShellMin > 0.99 && r.groundShellMax < 1.01 &&
  r.moved > 2.5 && r.moved < 4.5 &&
  r.staleFlag === true &&
  r.panelHasToronto === true &&
  r.panelHasDisclaimer === true &&
  r.panelFreshBadge === true &&
  r.panelStaleBadge === true &&
  r.errorOk === true &&
  r.panelErrorBadge === true &&
  r.panelGone === true &&
  pageErrors.length === 0;
process.exit(ok ? 0 : 1);

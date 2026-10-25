/**
 * ISS Live — the first Family Earth3D scene: the real station over the real Earth,
 * driven by the real TLE.
 *
 * Source lineage (see `output/sbqc-iss-recovery-20261024/RECOVERY.md`): the original
 * SBQC ISS detector read `/api/tle` (Celestrak via the SBQC proxy, server-cached) and
 * propagated with satellite.js. This scene is the recovery map's "bounded read-only
 * adapter": same TLE endpoint, same propagation library, geometry only.
 *
 * FAITHFUL — the orbit IS the propagated TLE: the marker, the orbit ring and the ground
 * track all come from SGP4 at real wall-clock time, and the panel states the TLE's own
 * epoch, its age, and when the propagation was computed (with timezone, always).
 *
 * ADAPTED — recorded, not hidden:
 * - The cloud sphere is the vendored static `earth-clouds` texture (decoration with a
 *   slow drift), NOT the live EUMETSAT-derived cloud map; a live layer must disclose
 *   image timestamp/coverage first (recovery doc) and is deliberately not in v1.
 * - Earth is a 48-segment textured sphere, not the recovered Globe.js shader pipeline.
 *
 * ABSENT — on purpose:
 * - No pass prediction and no observer location: a pass needs precise coordinates, which
 *   stay local unless separately authorized. The panel says exactly what the geometry is.
 * - No visibility claims. A geometric track says nothing about horizon, illumination,
 *   darkness or weather — the panel carries that sentence verbatim.
 * - No history trail: `/api/iss` is down server-side (missing DataAPI key) and honesty
 *   beats interpolation.
 */
import { Vector3 } from "three";
import type { AgentWorldVector3, GraphysXAgentWorldApi } from "./agent-world-runtime";
import type { PlatformHost } from "./platform-host";

export const ISS_SCENE_ID = "family-iss-live";
/** Scene units per Earth radius: Earth renders at radius 5. */
const EARTH_SCENE_RADIUS = 5;
const EARTH_RADIUS_KM = 6371;
/** A TLE older than this is flagged stale — the recovered predictor's own posture. */
const STALE_AFTER_HOURS = 48;
const DEFAULT_TLE_URL = "https://specialblend.ca/api/tle";
/** Marker refresh cadence. A timer, not a second frame loop — the host tick stays alone. */
const POSITION_INTERVAL_MS = 5_000;
const TRACK_INTERVAL_MS = 5 * 60_000;
/** One ISS orbit is ~92.9 min; the drawn track covers one full revolution. */
const TRACK_MINUTES = 93;
const TRACK_POINTS = 64;

export const ISS_PROVENANCE = {
  source: `${DEFAULT_TLE_URL} (SBQC proxy of Celestrak stations; see output/sbqc-iss-recovery-20261024)`,
  faithful: "SGP4-propagated TLE drives marker, orbit ring and ground track at wall-clock time; epoch/age/computed-at disclosed",
  adapted: "static vendored cloud texture as decoration; plain textured sphere instead of the recovered shader globe",
  absent: "pass prediction and observer location (privacy-gated), visibility claims, history trail (/api/iss down server-side)",
} as const;

export function composeIssLive(api: GraphysXAgentWorldApi) {
  return api.create({
    schema: "graphysx.agent-world/v2",
    id: ISS_SCENE_ID,
    label: "ISS Live",
    environment: {
      background: "#020a14",
      sky: "nightsky",
      envelope: null,
      post: { bloom: { strength: 0.5, threshold: 0.6, radius: 0.35 } },
      ground: { visible: false, size: 36, color: "#020a14", grid: false, gridColor: "#1d6f8a" },
    },
    entities: [
      {
        id: "iss-earth",
        type: "sphere",
        label: "Earth",
        transform: { position: [0, 0, 0] },
        geometry: { radius: EARTH_SCENE_RADIUS, radialSegments: 48 },
        // The registered `earth` texture; repeat [1,1] so the equirectangular map wraps once.
        material: { color: "#ffffff", roughness: 0.85, metalness: 0.02, texture: { id: "earth" as const, repeat: [1, 1] as [number, number] } },
        tags: ["iss-live", "earth"],
      },
      {
        id: "iss-clouds",
        type: "sphere",
        label: "Cloud layer (static texture)",
        transform: { position: [0, 0, 0] },
        geometry: { radius: EARTH_SCENE_RADIUS * 1.012, radialSegments: 48 },
        material: { color: "#ffffff", roughness: 1, opacity: 0.38, texture: { id: "earth-clouds" as const, repeat: [1, 1] as [number, number] } },
        castShadow: false,
        // Decorative drift (ADAPTED above): the real cloud field does not rotate with a timer.
        behaviors: [{ type: "spin", axis: "y", speedDegrees: 0.35 }],
        tags: ["iss-live", "clouds"],
      },
      {
        id: "iss-marker",
        type: "sphere",
        label: "ISS",
        // Placeholder until the live layer's first propagation lands; parked on the +x axis
        // at the station's typical shell so the scene never shows it inside the planet.
        transform: { position: [EARTH_SCENE_RADIUS * 1.066, 0, 0] },
        geometry: { radius: 0.09, radialSegments: 16 },
        material: { color: "#eafaff", emissive: "#aaf0ff", emissiveIntensity: 2.2, roughness: 0.3 },
        tags: ["iss-live", "iss", "marker"],
      },
      {
        id: "iss-orbit",
        type: "spline",
        label: "Orbit (propagated)",
        path: { points: [[EARTH_SCENE_RADIUS * 1.066, 0, 0], [0, EARTH_SCENE_RADIUS * 1.066, 0]], closed: false, tension: 0.5 },
        tags: ["iss-live", "orbit"],
      },
      {
        id: "iss-ground-track",
        type: "spline",
        label: "Ground track (propagated)",
        path: { points: [[EARTH_SCENE_RADIUS, 0, 0], [0, EARTH_SCENE_RADIUS, 0]], closed: false, tension: 0.5 },
        tags: ["iss-live", "ground-track"],
      },
      { id: "iss-sun", type: "directional-light", intensity: 2.6, transform: { position: [18, 6, 10] }, material: { color: "#fff4e0" }, castShadow: false },
      { id: "iss-ambient", type: "ambient-light", intensity: 0.35, material: { color: "#8fb3d8" } },
      { id: "iss-fill", type: "point-light", intensity: 3, distance: 40, marker: false, transform: { position: [-10, -4, -8] }, material: { color: "#2fb6d0", emissive: "#2fb6d0" } },
    ],
  });
}

export type IssLiveOptions = {
  /** Override the TLE endpoint (tests inject `tleText` instead and never fetch). */
  tleUrl?: string;
  /** Inject a TLE body directly — the smoke's path; no network is touched. */
  tleText?: string;
  /** Inject the starting wall-clock ms — the smoke's deterministic clock. */
  nowMs?: number;
};

export type IssLiveHandle = {
  /** Deterministic drive for tests: set the clock and recompute everything now. */
  setNow(ms: number): void;
  refresh(): void;
  readonly state: () => {
    ok: boolean;
    error: string | null;
    epochMs: number | null;
    ageHours: number | null;
    stale: boolean;
    latDeg: number | null;
    lonDeg: number | null;
    altKm: number | null;
  };
  dispose(): void;
};

/**
 * lat/lon/alt → scene coordinates. Right-handed, +y up. The sign convention is chosen to
 * line up with three.js's equirectangular sphere mapping and was verified VISUALLY against
 * a live propagation (the marker must sit over the ocean off Baja California when the TLE
 * says 21.7°N 117.5°W — see the visual receipt).
 */
function toScene(latDeg: number, lonDeg: number, altKm: number): AgentWorldVector3 {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const r = EARTH_SCENE_RADIUS * ((EARTH_RADIUS_KM + altKm) / EARTH_RADIUS_KM);
  return [
    -r * Math.cos(lat) * Math.cos(lon),
    r * Math.sin(lat),
    r * Math.cos(lat) * Math.sin(lon),
  ];
}

export function mountIssLive(host: PlatformHost, options: IssLiveOptions = {}): IssLiveHandle {
  const api = host.api;
  let disposed = false;
  let offsetMs = options.nowMs !== undefined ? options.nowMs - Date.now() : 0;
  const now = (): Date => new Date(Date.now() + offsetMs);

  const panel = document.createElement("div");
  panel.className = "gx-iss-panel";
  const style = document.createElement("style");
  style.textContent = `
    .gx-iss-panel{position:fixed;left:12px;bottom:12px;z-index:40;max-width:340px;display:flex;flex-direction:column;gap:6px;
      padding:12px 14px;border:1px solid var(--gx-accent-ring);border-radius:10px;background:var(--gx-panel);
      font:12px/1.45 var(--gx-font);color:var(--gx-ink-soft)}
    .gx-iss-panel h2{margin:0;font-size:13px;letter-spacing:.06em;color:var(--gx-ink)}
    .gx-iss-row{display:flex;justify-content:space-between;gap:12px}
    .gx-iss-row b{color:var(--gx-ink);font-weight:600;text-align:right}
    .gx-iss-badge{align-self:flex-start;padding:2px 8px;border-radius:6px;font-weight:600}
    .gx-iss-badge--fresh{background:var(--gx-accent-soft);color:var(--gx-accent)}
    .gx-iss-badge--stale{background:rgba(249,199,79,.16);color:#f9c74f}
    .gx-iss-badge--error{background:rgba(249,95,76,.16);color:#f95f4c}
    .gx-iss-note{color:var(--gx-ink-faint);font-size:11px;line-height:1.4}
  `;
  document.head.append(style);
  document.body.append(panel);

  const state = {
    ok: false,
    error: null as string | null,
    epochMs: null as number | null,
    ageHours: null as number | null,
    stale: false,
    latDeg: null as number | null,
    lonDeg: null as number | null,
    altKm: null as number | null,
  };

  // Set-once after load; typed loosely because satellite.js ships its own namespace.
  let sat: typeof import("satellite.js") | null = null;
  let satrec: import("satellite.js").SatRec | null = null;

  const torontoTime = (date: Date): string =>
    `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", dateStyle: "short", timeStyle: "medium" }).format(date)} America/Toronto`;

  const renderPanel = (): void => {
    const badge = state.error
      ? `<span class="gx-iss-badge gx-iss-badge--error">TLE UNAVAILABLE</span>`
      : state.stale
        ? `<span class="gx-iss-badge gx-iss-badge--stale">STALE TLE (&gt;${STALE_AFTER_HOURS} h)</span>`
        : `<span class="gx-iss-badge gx-iss-badge--fresh">FRESH TLE</span>`;
    const rows = state.error
      ? `<div class="gx-iss-note">${state.error} — the scene shows no invented position.</div>`
      : `
        <div class="gx-iss-row"><span>TLE epoch</span><b>${state.epochMs ? new Date(state.epochMs).toISOString() : "—"} (${state.ageHours?.toFixed(1) ?? "—"} h old)</b></div>
        <div class="gx-iss-row"><span>Computed at</span><b>${torontoTime(now())}</b></div>
        <div class="gx-iss-row"><span>Subsatellite point</span><b>${state.latDeg?.toFixed(2) ?? "—"}°, ${state.lonDeg?.toFixed(2) ?? "—"}°</b></div>
        <div class="gx-iss-row"><span>Altitude</span><b>${state.altKm?.toFixed(0) ?? "—"} km</b></div>`;
    panel.innerHTML = `
      <h2>ISS LIVE — GEOMETRIC TRACK</h2>
      ${badge}
      ${rows}
      <div class="gx-iss-note">Source: ${options.tleText ? "injected TLE (test)" : (options.tleUrl ?? DEFAULT_TLE_URL)} — SGP4 via satellite.js.</div>
      <div class="gx-iss-note">A geometric track says nothing about visibility from any location: horizon, illumination, darkness and weather are not modelled here.</div>`;
  };

  const propagateAt = (date: Date): { latDeg: number; lonDeg: number; altKm: number } | null => {
    if (!sat || !satrec) return null;
    const pv = sat.propagate(satrec, date);
    if (!pv || typeof pv.position === "boolean" || !pv.position) return null;
    const geo = sat.eciToGeodetic(pv.position, sat.gstime(date));
    return { latDeg: (geo.latitude * 180) / Math.PI, lonDeg: (geo.longitude * 180) / Math.PI, altKm: geo.height };
  };

  const refreshPosition = (): void => {
    if (disposed) return;
    const here = propagateAt(now());
    if (!here) return;
    state.latDeg = here.latDeg;
    state.lonDeg = here.lonDeg;
    state.altKm = here.altKm;
    api.update("iss-marker", { transform: { position: toScene(here.latDeg, here.lonDeg, here.altKm) } });
    renderPanel();
  };

  const refreshTracks = (): void => {
    if (disposed || !satrec) return;
    const start = now().getTime();
    const orbit: AgentWorldVector3[] = [];
    const ground: AgentWorldVector3[] = [];
    for (let i = 0; i < TRACK_POINTS; i++) {
      const at = propagateAt(new Date(start + (i / (TRACK_POINTS - 1)) * TRACK_MINUTES * 60_000));
      if (!at) continue;
      orbit.push(toScene(at.latDeg, at.lonDeg, at.altKm));
      ground.push(toScene(at.latDeg, at.lonDeg, 0));
    }
    if (orbit.length < 2) return;
    api.update("iss-orbit", { path: { points: orbit, closed: false, tension: 0.5 } });
    api.update("iss-ground-track", { path: { points: ground, closed: false, tension: 0.5 } });
  };

  const refresh = (): void => {
    refreshPosition();
    refreshTracks();
  };

  const timers: ReturnType<typeof setInterval>[] = [];

  const begin = async (): Promise<void> => {
    try {
      sat = await import("satellite.js");
      let tle = options.tleText;
      if (!tle) {
        const response = await fetch(options.tleUrl ?? DEFAULT_TLE_URL);
        if (!response.ok) throw new Error(`TLE endpoint returned ${response.status}`);
        tle = await response.text();
      }
      const lines = tle.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
      const [line1, line2] = lines.length >= 3 ? [lines[1], lines[2]] : [lines[0], lines[1]];
      if (!line1?.startsWith("1 ") || !line2?.startsWith("2 ")) throw new Error("TLE body did not contain two element lines");
      satrec = sat.twoline2satrec(line1, line2);
      // satrec epoch is a Julian date; 2440587.5 is the Unix epoch in JD.
      state.epochMs = (satrec.jdsatepoch - 2440587.5) * 86_400_000;
      state.ageHours = (now().getTime() - state.epochMs) / 3_600_000;
      state.stale = state.ageHours > STALE_AFTER_HOURS;
      state.ok = true;
      refresh();
      if (disposed) return;
      timers.push(setInterval(refreshPosition, POSITION_INTERVAL_MS));
      timers.push(setInterval(refreshTracks, TRACK_INTERVAL_MS));
    } catch (error) {
      state.ok = false;
      state.error = error instanceof Error ? error.message : String(error);
      renderPanel();
    }
  };
  const ready = begin();

  const handle: IssLiveHandle = {
    setNow(ms: number): void {
      offsetMs = ms - Date.now();
      if (state.epochMs !== null) {
        state.ageHours = (ms - state.epochMs) / 3_600_000;
        state.stale = state.ageHours > STALE_AFTER_HOURS;
      }
      refresh();
    },
    refresh,
    state: () => ({ ...state }),
    dispose(): void {
      disposed = true;
      for (const timer of timers) clearInterval(timer);
      panel.remove();
      style.remove();
    },
  };
  // Deterministic smokes await the first load through this marker.
  (handle as IssLiveHandle & { ready?: Promise<void> }).ready = ready;
  return handle;
}

/** Frame the globe with the marker shell in view; garage-precedent host helper. */
export function frameIssLive(host: PlatformHost): void {
  host.camera.position.set(0, 4.5, 14.5);
  host.focusOn(new Vector3(0, 0, 0), 6.4, 1.1);
}

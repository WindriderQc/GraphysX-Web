const ROUTES = ["concentrate", "split", "divert"];
const PHASES = ["lobby", "countdown", "racing", "paused", "results"];
const bounded = (n, low, high) => typeof n === "number" && Number.isFinite(n) && n >= low && n <= high;
const integer = (n, low, high) => Number.isInteger(n) && bounded(n, low, high);
const record = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** The entire remote command vocabulary. It cannot edit a scene, drive a ball or set time. */
export function parseGiantCommand(v) {
  if (!record(v)) return null;
  if (v.type === "shovel" && Object.keys(v).length === 3 && typeof v.held === "boolean" && Array.isArray(v.tip) && v.tip.length === 3 && bounded(v.tip[0], 4, 14) && bounded(v.tip[1], -0.8, 8) && bounded(v.tip[2], -7, 7)) return { type: "shovel", tip: [...v.tip], held: v.held };
  if (v.type === "route" && Object.keys(v).length === 2 && ROUTES.includes(v.route)) return { type: "route", route: v.route };
  if (v.type === "dig" && Object.keys(v).length === 2 && integer(v.point, 0, 2)) return { type: "dig", point: v.point };
  if (v.type === "release" && Object.keys(v).length === 1) return { type: "release" };
  return null;
}

export function isBallsySnapshot(s) {
  if (!record(s) || !/^[A-Za-z0-9-]{16,80}$/.test(s.roundId) || !PHASES.includes(s.phase) || ![null, 0, 1].includes(s.ally)) return false;
  if (!Array.isArray(s.players) || s.players.length !== 2 || !s.players.every((p, i) => record(p) && p.id === `ballsy-p${i + 1}` && Array.isArray(p.position) && p.position.length === 3 && p.position.every((n) => bounded(n, -200, 200)) && integer(p.lap, 0, 2) && typeof p.finished === "boolean")) return false;
  const v = s.volcano;
  if (!record(v) || !["help", "challenge"].includes(v.mode) || !ROUTES.includes(v.route) || !["east", "basin"].includes(v.station)) return false;
  if (!bounded(v.time, 0, 3600) || !bounded(v.routeUntil, 0, 3607) || !integer(v.charges, 0, 4) || !integer(v.interventions, 0, 4) || !bounded(v.source, 0, 2) || !bounded(v.diverted, 0, 2) || !bounded(v.inputVolume, 0, 7200) || !bounded(v.drainedVolume, 0, 7200)) return false;
  if (!Array.isArray(v.streams) || v.streams.length !== 2 || !v.streams.every((r) => record(r) && bounded(r.flow, 0, 2) && bounded(r.stored, 0, 0.60001) && bounded(r.lake, 0, 7200))) return false;
  if (Math.abs(v.streams[0].flow + v.streams[1].flow + v.diverted - v.source) > 1e-5 || Math.abs(v.inputVolume - v.drainedVolume - v.streams.reduce((sum, r) => sum + r.stored + r.lake, 0)) > 1e-5) return false;
  const earth = v.earth;
  if (!record(earth) || !Array.isArray(earth.height) || earth.height.length !== 609 || !earth.height.every(h => bounded(h, 0.079999, 1.5)) || !Array.isArray(earth.lava) || earth.lava.length !== 609 || !earth.lava.every(l => bounded(l, 0, 7200))) return false;
  if (!integer(earth.revision, 0, 216000) || !bounded(earth.excavated, 0, 230) || ![earth.inputVolume, earth.drainedVolume, earth.basinVolume, earth.crossingVolume].every(n => bounded(n, 0, 7200))) return false;
  if (Math.abs(earth.inputVolume - earth.drainedVolume - earth.lava.reduce((a,b) => a+b, 0)) > 1e-5 || Math.abs(earth.drainedVolume - earth.basinVolume - earth.crossingVolume) > 1e-5) return false;
  if (earth.stroke !== null && (!record(earth.stroke) || !Array.isArray(earth.stroke.tip) || earth.stroke.tip.length !== 3 || !bounded(earth.stroke.tip[0],4,14) || !bounded(earth.stroke.tip[1],-0.8,8) || !bounded(earth.stroke.tip[2],-7,7) || !bounded(earth.stroke.time,0,v.time))) return false;
  const p = v.pending;
  if (p !== null && (!record(p) || !ROUTES.includes(p.route) || !["travel", "dig", "warning"].includes(p.phase) || !["east", "basin"].includes(p.fromStation) || !bounded(p.remaining, 0, 3) || !bounded(p.travelSeconds, 0.8, 2.5) || !integer(p.strokes, 0, 3) || !(p.heldPoint === null || integer(p.heldPoint, 0, 2)) || !bounded(p.strokeSeconds, 0, 0.80001))) return false;
  return v.charges + v.interventions + (p ? 1 : 0) === 4;
}

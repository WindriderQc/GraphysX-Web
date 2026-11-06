import { createEarth, advanceEarth, sampleEarthShovel, cancelEarthStroke, earthLavaDepthAt, EARTH_LAVA_VISIBLE_DEPTH, type EarthState } from "./ballsy-earth";
/** Bounded toy hydraulics for one world, independent of rendering and network transport. */
export type VolcanoRoute = "concentrate" | "split" | "divert";
export type VolcanoMode = "challenge" | "help";
export type VolcanoCommand = { type: "shovel"; tip: [number, number, number]; held: boolean } | { type: "route"; route: VolcanoRoute } | { type: "dig"; point: number } | { type: "release" };
export type VolcanoStream = { flow: number; stored: number; lake: number };
export type VolcanoPreparation = {
  route: VolcanoRoute; phase: "travel" | "dig" | "warning"; remaining: number;
  fromStation: "east" | "basin"; travelSeconds: number;
  strokes: number; heldPoint: number | null; strokeSeconds: number;
};
export type VolcanoState = {
  earth: EarthState; mode: VolcanoMode; time: number; route: VolcanoRoute; routeUntil: number;
  station: "east" | "basin"; charges: number; pending: VolcanoPreparation | null;
  source: number; streams: [VolcanoStream, VolcanoStream]; diverted: number;
  inputVolume: number; drainedVolume: number; interventions: number;
};
export const VOLCANO_LIMITS = { charges: 4, digSeconds: 0.8, warningSeconds: 1.2, effectSeconds: 7,
  capacity: 0.55, channelStorage: 0.6, lakeDrain: 0.12, maxSource: 2, minimumSpeed: 1.8 } as const;
export const VOLCANO_CROSSINGS = [-3, 3] as const;

export function createVolcano(mode: VolcanoMode = "challenge"): VolcanoState {
  return { earth: createEarth(), mode, time: 0, route: "split", routeUntil: 0, station: "east", charges: VOLCANO_LIMITS.charges,
    pending: null, source: 1, streams: [{ flow: 0.5, stored: 0, lake: 0 }, { flow: 0.5, stored: 0, lake: 0 }],
    diverted: 0, inputVolume: 0, drainedVolume: 0, interventions: 0 };
}

export function volcanoWave(state: Pick<VolcanoState, "mode" | "time">): { active: boolean; inSeconds: number } {
  if (state.mode !== "help") return { active: false, inSeconds: Infinity };
  const cycle = (state.time + 1e-8) % 12;
  const active = state.time >= 12 - 1e-8 && cycle < 4;
  return { active, inSeconds: active ? 0 : 12 - cycle };
}

/** All commands are checked again by the authoritative race; no client supplies durations. */
export function commandVolcano(state: VolcanoState, raw: unknown): { ok: boolean; reason?: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "Commande inconnue." };
  const command = raw as Record<string, unknown>;
  if (command.type === "shovel" && Object.keys(command).length === 3 && typeof command.held === "boolean" && Array.isArray(command.tip) && command.tip.length === 3 && command.tip.every(n => typeof n === "number" && Number.isFinite(n))) {
    return sampleEarthShovel(state.earth, command.tip as [number, number, number], command.held, state.time) ? { ok: true } : { ok: false, reason: "Mouvement de pelle trop rapide ou hors du terrain." };
  }
  if (command.type === "route" && Object.keys(command).length === 2 && ["concentrate", "split", "divert"].includes(String(command.route))) {
    if (state.pending) return { ok: false, reason: "Terminez le canal en prÃ©paration." };
    if (state.charges === 0) return { ok: false, reason: "La pelle a utilisÃ© ses quatre charges." };
    const route = command.route as VolcanoRoute;
    const station = route === "divert" ? "basin" : "east";
    const travelSeconds = station === state.station ? 0.8 : 2.5;
    state.pending = { route, phase: "travel", remaining: travelSeconds, fromStation: state.station, travelSeconds,
      strokes: 0, heldPoint: null, strokeSeconds: 0 };
    state.station = station;
    state.charges--;
    return { ok: true };
  }
  if (command.type === "release" && Object.keys(command).length === 1) {
    cancelEarthStroke(state.earth);
    if (state.pending) { state.pending.heldPoint = null; state.pending.strokeSeconds = 0; }
    return { ok: true };
  }
  if (command.type === "dig" && Object.keys(command).length === 2 && Number.isInteger(command.point)) {
    const pending = state.pending;
    if (!pending || pending.phase !== "dig" || command.point !== pending.strokes || pending.strokes >= 3) return { ok: false, reason: "Creusez les trois repÃ¨res dans l'ordre." };
    if (pending.heldPoint !== command.point) pending.strokeSeconds = 0;
    pending.heldPoint = command.point as number;
    return { ok: true };
  }
  return { ok: false, reason: "Commande inconnue." };
}

function advanceSlice(state: VolcanoState, dt: number): void {
  const source = volcanoWave(state).active ? VOLCANO_LIMITS.maxSource : 1;
  state.time += dt;
  advanceEarth(state.earth, dt, source);
  if (state.earth.stroke && state.time - state.earth.stroke.time > 0.3) cancelEarthStroke(state.earth);
  if (state.routeUntil > 0 && state.time >= state.routeUntil) { state.route = "split"; state.routeUntil = 0; }
  const pending = state.pending;
  if (pending?.phase === "travel") {
    pending.remaining = Math.max(0, pending.remaining - dt);
    if (pending.remaining < 1e-8) { pending.phase = "dig"; pending.remaining = 0; }
  } else if (pending?.phase === "dig" && pending.heldPoint === pending.strokes) {
    pending.strokeSeconds += dt;
    if (pending.strokeSeconds >= VOLCANO_LIMITS.digSeconds - 1e-8) {
      pending.strokes++; pending.strokeSeconds = 0; pending.heldPoint = null;
      if (pending.strokes === 3) { pending.phase = "warning"; pending.remaining = VOLCANO_LIMITS.warningSeconds; }
    }
  } else if (pending?.phase === "warning") {
    pending.remaining = Math.max(0, pending.remaining - dt);
    if (pending.remaining < 1e-8) {
      state.route = pending.route;
      state.routeUntil = state.time + VOLCANO_LIMITS.effectSeconds;
      state.pending = null;
      state.interventions++;
    }
  }
  state.source = source;
  state.diverted = state.route === "divert" ? source : 0;
  state.streams[0].flow = state.route === "concentrate" ? source : state.route === "split" ? source / 2 : 0;
  state.streams[1].flow = state.route === "split" ? source / 2 : 0;
  state.inputVolume += source * dt;
  state.drainedVolume += state.diverted * dt;
  for (const stream of state.streams) {
    stream.stored += stream.flow * dt;
    const drained = Math.min(stream.stored, VOLCANO_LIMITS.capacity * dt);
    stream.stored -= drained;
    state.drainedVolume += drained;
    const overflow = Math.max(0, stream.stored - VOLCANO_LIMITS.channelStorage);
    stream.stored -= overflow;
    stream.lake += overflow;
    const lakeDrained = Math.min(stream.lake, VOLCANO_LIMITS.lakeDrain * dt);
    stream.lake -= lakeDrained;
    state.drainedVolume += lakeDrained;
  }
}

/** Mutates only this serializable model. The caller freezes it when the race is paused. */
export function advanceVolcano(state: VolcanoState, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60) throw new RangeError("Volcano step expects 0..60 seconds");
  if (seconds === 0) return;
  const steps = Math.ceil(seconds / 0.05);
  for (let i = 0; i < steps; i++) advanceSlice(state, seconds / steps);
}

export function volcanoWidth(flow: number): number { return flow > 0 ? 0.65 + 1.8 * Math.min(2, Math.max(0, flow)) : 0; }

/** A permanent dry outer lane remains: neither a river nor an overflow can seal the track. */
export function volcanoSlowAt(state: VolcanoState, position: readonly number[]): { intensity: number; speedCap: number } {
  const intensity = position[0] >= 10.1 && position[0] <= 14.35 && position[1] < 2
    ? Math.min(3, Math.max(0, earthLavaDepthAt(state.earth, Math.min(14, position[0]), position[2]) - EARTH_LAVA_VISIBLE_DEPTH) * 6) : 0;
  return { intensity, speedCap: Math.max(VOLCANO_LIMITS.minimumSpeed, 8 / (1 + 2.6 * intensity)) };
}

export function volcanoMassError(state: VolcanoState): number {
  return state.inputVolume - state.drainedVolume - state.streams.reduce((sum, stream) => sum + stream.stored + stream.lake, 0);
}

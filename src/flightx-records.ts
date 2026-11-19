import { FLIGHTX_COURSE_VERSION, type FlightxMode } from "./flightx-courses";

const KEY = "graphysx.flightx.best.v" + FLIGHTX_COURSE_VERSION;
export type FlightxBest = Partial<Record<FlightxMode, number>>;
type RecordStorage = Pick<Storage, "getItem" | "setItem">;
export function readFlightxBest(storage?: RecordStorage): { best: FlightxBest; available: boolean } {
  try {
    const raw: unknown = JSON.parse((storage ?? globalThis.localStorage).getItem(KEY) ?? "{}");
    const best: FlightxBest = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) for (const mode of ["gates", "time", "laps"] as const) {
      const value = (raw as Record<string, unknown>)[mode];
      if (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 86400) best[mode] = value;
    }
    return { best, available: true };
  } catch { return { best: {}, available: false }; }
}
export function saveFlightxBest(mode: FlightxMode, seconds: number, current: FlightxBest, storage?: RecordStorage) {
  const best = { ...current };
  if (mode === "free" || !Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) return { best, improved: false, stored: false };
  const latest = readFlightxBest(storage).best;
  for (const id of ["gates", "time", "laps"] as const) if (latest[id] !== undefined) best[id] = Math.min(best[id] ?? Infinity, latest[id]!);
  const improved = best[mode] === undefined || seconds < best[mode]!;
  if (improved) best[mode] = seconds;
  try {
    (storage ?? globalThis.localStorage).setItem(KEY, JSON.stringify(best));
    return { best, improved, stored: true };
  } catch { return { best, improved, stored: false }; }
}

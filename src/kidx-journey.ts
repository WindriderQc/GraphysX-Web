const KEY = "graphysx:kidx:journey:v1";
type Journey = { version: 1; missions: Record<string, number>; builds: Record<string, number> };
export function readKidxJourney(storage: Pick<Storage, "getItem">): Journey {
  const raw = storage.getItem(KEY);
  if (raw === null) return { version: 1, missions: {}, builds: {} };
  const value = JSON.parse(raw);
  if (value.version !== 1 || ![value.missions, value.builds].every(map => map && typeof map === "object" && !Array.isArray(map)
    && Object.entries(map).every(([id, time]) => /^[a-z0-9-]+$/.test(id) && typeof time === "number" && Number.isFinite(time) && time >= 0))) throw new Error("Unknown progress");
  return value;
}
export function markKidxJourney(storage: Pick<Storage, "getItem" | "setItem">, kind: "missions" | "builds", id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) return false;
  try { const data = readKidxJourney(storage); data[kind][id] = Date.now(); storage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
}

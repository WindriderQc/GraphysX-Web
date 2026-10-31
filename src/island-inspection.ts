/** Read-only spectator metadata. Never includes a session, operator token or memory. */
export type InspectionEntity = {
  id: string;
  name?: string;
  position?: number[];
  size?: number[];
  shape?: string;
  material?: string;
  mass?: number;
  anchored?: boolean;
  attributes?: Record<string, unknown>;
};
export type IslandInspection = { worldId: string; entities: InspectionEntity[]; agents: InspectionEntity[] };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const scalar = (value: unknown): boolean => typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.length <= 4096);

/** Old recordings have no metadata; malformed additions never prevent the scene rendering. */
export function parseIslandInspection(raw: unknown): IslandInspection | undefined {
  if (!record(raw) || typeof raw.worldId !== "string" || raw.worldId.length > 100 || !Array.isArray(raw.entities) || !Array.isArray(raw.agents)) return;
  const rows = (values: unknown[]): InspectionEntity[] => values.slice(0, 2048).flatMap((value) => {
    if (!record(value) || typeof value.id !== "string" || !value.id || value.id.length > 200) return [];
    const out: InspectionEntity = { id: value.id };
    for (const key of ["name", "shape", "material"] as const) if (typeof value[key] === "string") out[key] = value[key].slice(0, 200);
    for (const key of ["position", "size"] as const) {
      const vec = value[key];
      if (Array.isArray(vec) && vec.length === 3 && vec.every((n) => typeof n === "number" && Number.isFinite(n))) out[key] = [...vec];
    }
    if (typeof value.mass === "number" && Number.isFinite(value.mass)) out.mass = value.mass;
    if (typeof value.anchored === "boolean") out.anchored = value.anchored;
    if (record(value.attributes)) out.attributes = Object.fromEntries(Object.entries(value.attributes).slice(0, 128).filter(([key, v]) => key.length <= 100 && scalar(v)));
    return [out];
  });
  return { worldId: raw.worldId, entities: rows(raw.entities), agents: rows(raw.agents) };
}

/** Appearance only. No rules, physics, URLs, or private provenance in theme files. */
export type MathTheme = {
  schema: "graphysx.theme/v1";
  id: string;
  label: string;
  season: "summer" | "winter";
  palette: { ground: string; foliage: string; primary: string; secondary: string; table: string; sky: string };
  roughness: number;
  light: number;
};
export const MATH_THEMES: readonly MathTheme[] = [
  { schema: "graphysx.theme/v1", id: "summer", label: "Été au jardin", season: "summer", palette: { ground: "#86b989", foliage: "#257550", primary: "#217baf", secondary: "#f3ad43", table: "#d8ad7b", sky: "#c8e8ee" }, roughness: 0.72, light: 2.1 },
  { schema: "graphysx.theme/v1", id: "winter", label: "Hiver sous la neige", season: "winter", palette: { ground: "#e7f0f4", foliage: "#335e63", primary: "#286eb0", secondary: "#d58a2c", table: "#cbb7a4", sky: "#ccdce9" }, roughness: 0.83, light: 1.65 },
];
export function readMathTheme(value: unknown): MathTheme | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.schema !== "graphysx.theme/v1" || typeof v.id !== "string" || !/^[a-z0-9-]{1,48}$/.test(v.id) || typeof v.label !== "string" || !v.label.trim() || v.label.length > 64 || (v.season !== "summer" && v.season !== "winter")) return null;
  if (typeof v.roughness !== "number" || !Number.isFinite(v.roughness) || v.roughness < 0.2 || v.roughness > 1 || typeof v.light !== "number" || !Number.isFinite(v.light) || v.light < 0.5 || v.light > 3) return null;
  const p = v.palette as Record<string, unknown> | undefined;
  if (!p || ["ground", "foliage", "primary", "secondary", "table", "sky"].some(key => typeof p[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(p[key] as string))) return null;
  return { schema: "graphysx.theme/v1", id: v.id, label: v.label.trim(), season: v.season as MathTheme["season"], palette: { ground: p.ground as string, foliage: p.foliage as string, primary: p.primary as string, secondary: p.secondary as string, table: p.table as string, sky: p.sky as string }, roughness: v.roughness, light: v.light };
}

// Shared by scene-store validation and the browser. Live expression never enters a document.
export function resolveAgentAppearance(value, entityType = "agent") {
  if (value === undefined || value === null) return null;
  if (entityType !== "agent") throw new Error("Only agent entities accept an appearance");
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Appearance must be an object");
  for (const key of Object.keys(value)) {
    if (!["kind", "asset", "palette", "seed"].includes(key)) throw new Error(`Unknown appearance field: ${key}`);
  }
  if (value.kind !== "voxel-face" || value.asset !== "forge-mask" || value.palette !== "forge") {
    throw new Error("Unsupported agent appearance");
  }
  const seed = value.seed ?? 1;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647) throw new Error("Appearance seed must be an integer between 0 and 2147483647");
  return { kind: "voxel-face", asset: "forge-mask", palette: "forge", seed };
}

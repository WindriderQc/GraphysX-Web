/** Report dates are the version available from both Janitor read endpoints. */
export function requireJanitorVersion(actual: string | null, expected: string | null): void {
  const at = Date.parse(actual || ""), wanted = Date.parse(expected || "");
  if (!Number.isFinite(at) || !Number.isFinite(wanted) || at !== wanted) {
    throw new Error("Le rapport a changé ou sa version est inconnue. Relire le rapport.");
  }
}

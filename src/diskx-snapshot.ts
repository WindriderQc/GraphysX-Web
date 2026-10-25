import type { DiskxDirectoryRow } from './diskx-data';

/** A scoped observation, never a filesystem identity or an execution receipt. */
export type DiskxObservation = {
  id: string; observedAt: string; roots: string[]; rows: DiskxDirectoryRow[];
  incomplete: string[]; consistency: 'synthetic' | 'unversioned';
};

export function replaceScope(rows: readonly DiskxDirectoryRow[], root: string, incoming: readonly DiskxDirectoryRow[]): DiskxDirectoryRow[] {
  const inside = (path: string) => path === root || path.startsWith(`${root}/`);
  const result = new Map(rows.filter(row => !inside(row.path)).map(row => [row.path, row]));
  for (const row of incoming) {
    if (!inside(row.path) || !Number.isFinite(row.totalSize) || row.totalSize < 0 || !Number.isSafeInteger(row.fileCount) || row.fileCount < 0)
      throw new Error('Invalid inventory row');
    result.set(row.path, { ...row });
  }
  return [...result.values()];
}

/**
 * Scene key for a folder: a 64-bit hash of its UTF-8 path, 16 hex characters. Stable when the
 * ranking changes, deliberately different after a rename, and short enough for the runtime's
 * 80-character entity ids whatever the depth of the folder (a hex copy of the path was not).
 * It also keeps the folder name out of entity ids.
 */
export function diskxEntityKey(path: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x9e3779b9;
  for (const byte of new TextEncoder().encode(path)) {
    a = Math.imul(a ^ byte, 0x01000193);
    b = Math.imul(b ^ byte, 0x5bd1e995);
    b ^= b >>> 15;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** Export aggregates only: no paths, filenames, scene tags or proposed actions. */
export function redactedInventory(observation: DiskxObservation) {
  return {
    schema: 'graphysx.redacted-inventory/v1', observedAt: observation.observedAt,
    consistency: observation.consistency, incomplete: observation.incomplete.length > 0,
    directories: observation.rows.map((row, index) => ({ label: `Dossier ${index + 1}`, bytes: row.totalSize, files: row.fileCount })),
  };
}

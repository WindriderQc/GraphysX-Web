/**
 * DiskX data source: AgentX Data through the page's own `/diskx-api/` route, or the recorded
 * fixture when no route is configured, the LAN is out of reach, or `?source=fixture` asks.
 *
 * Synthetic data is replaced atomically by the app. The legacy API has no immutable
 * snapshot or tree cursor: consistency remains explicitly unverified.
 */

import fixtureJson from "./diskx-fixture.json" with { type: "json" };
import type { DiskxDirectoryRow, DiskxFileRow, DiskxVolume } from "./diskx-data";

export type DiskxFixture = {
  schema: string;
  synthetic?: boolean;
  complete?: boolean;
  capturedAt: string;
  source: string;
  roots: string[];
  summary: { totalFiles: number; totalSize: number; directories: number; lastScanAt: string | null };
  directories: DiskxDirectoryRow[];
  files: Record<string, DiskxFileRow[]>;
  /** Capacity and free space per volume, measured outside AgentX Data (which has none). */
  volumes?: DiskxVolume[];
};

export const DISKX_FIXTURE: DiskxFixture = fixtureJson as DiskxFixture;

export type DiskxSourceKind = "live" | "fixture";

export type DiskxSummary = {
  totalFiles: number;
  totalSize: number;
  directories: number | null;
  lastScanAt: string | null;
  /** Human label of where the numbers come from. */
  origin: string;
};

export type DiskxTreePage = {
  rows: DiskxDirectoryRow[];
  /** True when AgentX cut the page at its limit; totals under this root are then a lower bound. */
  truncated: boolean;
};

export type DiskxSource = {
  kind: DiskxSourceKind;
  roots: string[];
  summary: () => Promise<DiskxSummary>;
  /** Directory rows under `root` (the root itself included when it holds files). */
  tree: (root: string) => Promise<DiskxTreePage>;
  /** Largest files directly in or under `root`. */
  files: (root: string, limit?: number) => Promise<DiskxFileRow[]>;
  /** Volumes with capacity and free space; empty when nothing measured or declared them. */
  volumes: () => Promise<DiskxVolume[]>;
};

const sanitiseVolumes = (value: unknown): DiskxVolume[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = entry as Partial<DiskxVolume> | null;
    if (!record || typeof record.id !== "string" || !Array.isArray(record.roots)) return [];
    if (record.source !== 'measured' && record.source !== 'declared') return [];
    const capacityBytes = Number(record.capacityBytes);
    const freeBytes = Number(record.freeBytes);
    if (!Number.isFinite(capacityBytes) || !Number.isFinite(freeBytes) || capacityBytes <= 0) return [];
    return [{
      id: record.id,
      label: typeof record.label === "string" && record.label ? record.label : record.id,
      roots: record.roots.filter((root): root is string => typeof root === "string"),
      capacityBytes,
      freeBytes: Math.max(0, Math.min(freeBytes, capacityBytes)),
      source: record.source === "declared" ? "declared" : "measured",
      measuredAt: typeof record.measuredAt === "string" ? record.measuredAt : null,
      note: typeof record.note === "string" ? record.note : null,
    }];
  });
};

type AgentXEnvelope<T> = { status?: string; ok?: boolean; data?: T; message?: string };

const PAGE = 2000;

const unwrap = async <T>(response: Response): Promise<T> => {
  if (!response.ok) throw new Error(`DiskX: ${response.status}`);
  const payload = (await response.json()) as AgentXEnvelope<T>;
  if (!payload || payload.data === undefined) throw new Error(payload?.message ?? "DiskX: réponse vide");
  return payload.data;
};

export function createFixtureSource(fixture: DiskxFixture = DISKX_FIXTURE): DiskxSource {
  return {
    kind: "fixture",
    roots: [...fixture.roots],
    summary: async () => ({
      totalFiles: fixture.summary.totalFiles,
      totalSize: fixture.summary.totalSize,
      directories: fixture.summary.directories,
      lastScanAt: fixture.summary.lastScanAt,
      origin: `Capture ${fixture.capturedAt.slice(0, 10)} · ${fixture.source}`,
    }),
    tree: async (root) => ({
      rows: fixture.directories.filter((row) => row.path === root || row.path.startsWith(`${root}/`)),
      truncated: fixture.complete !== true,
    }),
    files: async (root, limit = 8) => (fixture.files[root] ?? []).slice(0, limit),
    volumes: async () => sanitiseVolumes(fixture.volumes),
  };
}

export function createLiveSource(fetchImpl: typeof fetch, roots: string[], origin: string): DiskxSource {
  type TreeData = { tree: { path: string; fileCount: number; totalSize: number; largestFile?: string | null }[]; truncated?: boolean; limit?: number };
  type SummaryData = { totalFiles: number; totalSize: number; lastScan?: { finished_at?: string | null } | null };
  type FilesData = { files: { path: string; size: number; category?: string; mtime?: number }[] };
  return {
    kind: "live",
    roots,
    summary: async () => {
      const data = await unwrap<SummaryData>(await fetchImpl("/diskx-api/summary", { cache: "no-store" }));
      return {
        totalFiles: data.totalFiles,
        totalSize: data.totalSize,
        directories: null,
        lastScanAt: data.lastScan?.finished_at ?? null,
        origin: `AgentX Data · ${origin}`,
      };
    },
    tree: async (root) => {
      const params = new URLSearchParams({ root, limit: String(PAGE) });
      const data = await unwrap<TreeData>(await fetchImpl(`/diskx-api/tree?${params}`, { cache: "no-store" }));
      return {
        rows: data.tree.filter(row => row.path === root || row.path.startsWith(`${root}/`)).map((row) => ({ path: row.path, fileCount: row.fileCount, totalSize: row.totalSize, largestFile: row.largestFile ?? null })),
        truncated: data.truncated !== false || data.tree.length >= PAGE,
      };
    },
    files: async (root, limit = 8) => {
      const params = new URLSearchParams({ root, limit: String(limit), sort: "size" });
      const data = await unwrap<FilesData>(await fetchImpl(`/diskx-api/files?${params}`, { cache: "no-store" }));
      return data.files.map((file) => ({ path: file.path, size: file.size, category: file.category, mtime: file.mtime }));
    },
    volumes: async () => {
      // Absent or unconfigured is "unknown", never the fixture's dated numbers.
      const response = await fetchImpl("/diskx-api/volumes", { cache: "no-store" });
      if (!response.ok) return [];
      const payload = (await response.json()) as { volumes?: unknown };
      return sanitiseVolumes(payload.volumes);
    },
  };
}

/**
 * Pick the source for this page. Live needs the route to say it is configured; anything else —
 * a static deploy with no route, a 503, a network error — is the fixture, announced as such.
 */
export async function resolveDiskxSource(options: { fetchImpl?: typeof fetch; forceFixture?: boolean; fixture?: DiskxFixture; requireLive?: boolean } = {}): Promise<DiskxSource> {
  const fixture = options.fixture ?? DISKX_FIXTURE;
  if (options.forceFixture) return createFixtureSource(fixture);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  try {
    const response = await fetchImpl("/diskx-api/config", { cache: "no-store" });
    if (!response.ok) { if (options.requireLive) throw new Error('Configuration indisponible'); return createFixtureSource(fixture); }
    const config = (await response.json()) as { enabled?: boolean; source?: string | null; roots?: string[] };
    if (config.enabled !== true) { if (options.requireLive) throw new Error('Source désactivée'); return createFixtureSource(fixture); }
    const roots = config.roots;
    if (!Array.isArray(roots) || !roots.length || roots.some(root => typeof root !== 'string' || !root.startsWith('/') || root.endsWith('/'))) throw new Error('Racines non configurées');
    return createLiveSource(fetchImpl, [...new Set(roots)], config.source ?? "LAN");
  } catch (error) {
    if (options.requireLive) throw error;
    return createFixtureSource(fixture);
  }
}

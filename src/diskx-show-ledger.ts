/**
 * The duplicate ledger behind the Janitor show: the verified groups read so far, folded per
 * folder so the city can say where duplicate bytes sit at any level. Pure: no three.js, no DOM.
 *
 * The report lists groups largest file first, so a bounded read of the first pages covers most
 * of the logical bytes. The ledger never guesses the rest: `coverage()` says how much of the
 * report it holds, and every number it gives is about the groups it holds.
 *
 * Roles come from the report's survivor rule: "keep" is the copy the rule names, "extra" the
 * others. The rule is not an authorization, and the bytes are logical: hardlinks, snapshots and
 * compression decide the physical space, which nothing here measures.
 */
import type { JanitorGroup } from "./diskx-janitor-source";
import { folderOf } from "./diskx-duplicates";

/** One group as the ledger keeps it: no proof, no review, just what the city draws. */
export type LedgerGroup = {
  sha256: string;
  size: number;
  /** The copy the report's survivor rule names, when it is one of the listed paths. */
  keep: string | null;
  paths: string[];
  /** Copies the report left out of its page (file limit). Announced, never placed. */
  omitted: number;
};
export type LedgerFilter = {
  /** Only copies under one of these roots count; null for every root. */
  roots: readonly string[] | null;
  /** Only groups whose file is at least this many bytes. */
  minSize: number;
  /** Which copies the duplicate columns count. Pairs and target always use the rule's roles. */
  role: "all" | "extra" | "keep";
};
export type FolderTally = {
  /** Logical bytes of the copies the rule would not keep, under this folder. */
  extraBytes: number;
  /** Logical bytes of the kept copies under this folder. */
  keepBytes: number;
  /** Logical bytes of copies in groups whose report names no survivor. */
  unresolvedBytes: number;
  /** Groups with at least one counted copy under this folder. */
  groups: number;
};
export type LedgerPair = { from: string; to: string; bytes: number; groups: number };
export type LedgerCoverage = {
  groupsRead: number;
  groupsTotal: number;
  /** Logical bytes the groups read would free by the rule, and the report's own total. */
  bytesCovered: number;
  bytesTotal: number;
  complete: boolean;
};

export const LEDGER_ALL = "diskx://all";
export const DEFAULT_LEDGER_FILTER: LedgerFilter = { roots: null, minSize: 0, role: "all" };
const EMPTY: FolderTally = Object.freeze({ extraBytes: 0, keepBytes: 0, unresolvedBytes: 0, groups: 0 });

const isInside = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);

export function ledgerGroup(group: JanitorGroup): LedgerGroup {
  const paths = [...new Set(group.files.map((file) => file.path))];
  const keep = group.policySurvivorPath && paths.includes(group.policySurvivorPath) ? group.policySurvivorPath : null;
  return { sha256: group.sha256, size: group.size, keep, paths, omitted: group.filesOmitted };
}

export const roleOf = (group: LedgerGroup, path: string): "keep" | "extra" | "unresolved" =>
  group.keep === null ? "unresolved" : path === group.keep ? "keep" : "extra";

/** Logical bytes the listed extra copies of a group would free by the rule. */
export const extraBytesOf = (group: LedgerGroup): number => (group.keep === null ? 0 : group.size * (group.paths.length - 1));

export type LedgerView = {
  filter: LedgerFilter;
  /** Counted copies under a folder (recursive). `LEDGER_ALL` is every root. */
  under(path: string): FolderTally;
  /** Extra bytes under a folder by the rule, ignoring the role filter: what the target removes. */
  extraUnder(path: string): number;
  /** Extra bytes whose file sits directly in this folder, by the rule. */
  extraDirect(path: string): number;
  /** Groups touching a folder, largest saving first. */
  groupsUnder(path: string, limit: number): LedgerGroup[];
  /** The groups the filter keeps, largest saving first. */
  top(limit: number): LedgerGroup[];
  /**
   * Where extra copies sit against the kept one, folded onto the given districts: one pair per
   * (extra district → kept district), largest first. Copies in the same district are `inside`,
   * copies outside every district are counted, never placed.
   */
  pairs(districts: readonly string[], limit: number): { pairs: LedgerPair[]; inside: number; outside: number; total: number };
};

export function createLedger() {
  const groups = new Map<string, LedgerGroup>();
  let reportId: string | null = null;
  let groupsTotal = 0;
  let bytesTotal = 0;
  let complete = false;
  let cached: LedgerView | null = null;
  let cachedKey = "";

  function view(filter: LedgerFilter = DEFAULT_LEDGER_FILTER): LedgerView {
    const key = JSON.stringify([filter.roots, filter.minSize, filter.role, groups.size]);
    if (cached && key === cachedKey) return cached;
    const counted = new Map<string, FolderTally>();
    const extras = new Map<string, number>();
    const direct = new Map<string, number>();
    const kept: LedgerGroup[] = [];
    const inRoots = (path: string): boolean => filter.roots === null || filter.roots.some((root) => isInside(path, root));
    const climb = (folder: string, visit: (path: string) => void): void => {
      visit(LEDGER_ALL);
      for (let path = folder; path && path !== "/"; path = folderOf(path)) visit(path);
    };
    for (const group of groups.values()) {
      if (group.size < filter.minSize) continue;
      const paths = group.paths.filter(inRoots);
      if (!paths.length) continue;
      kept.push(group);
      const touched = new Set<string>();
      for (const path of paths) {
        const role = roleOf(group, path);
        const folder = folderOf(path);
        if (role === "extra") {
          direct.set(folder, (direct.get(folder) ?? 0) + group.size);
          climb(folder, (at) => extras.set(at, (extras.get(at) ?? 0) + group.size));
        }
        if (filter.role === "extra" && role !== "extra") continue;
        if (filter.role === "keep" && role !== "keep") continue;
        climb(folder, (at) => {
          const tally = counted.get(at) ?? { extraBytes: 0, keepBytes: 0, unresolvedBytes: 0, groups: 0 };
          if (role === "extra") tally.extraBytes += group.size;
          else if (role === "keep") tally.keepBytes += group.size;
          else tally.unresolvedBytes += group.size;
          if (!touched.has(at)) { touched.add(at); tally.groups += 1; }
          counted.set(at, tally);
        });
      }
    }
    kept.sort((a, b) => extraBytesOf(b) - extraBytesOf(a) || b.size - a.size || a.sha256.localeCompare(b.sha256));
    cachedKey = key;
    cached = {
      filter,
      under: (path) => counted.get(path) ?? EMPTY,
      extraUnder: (path) => extras.get(path) ?? 0,
      extraDirect: (path) => direct.get(path) ?? 0,
      top: (limit) => kept.slice(0, Math.max(0, limit)),
      groupsUnder(path, limit) {
        const found: LedgerGroup[] = [];
        for (const group of kept) {
          if (found.length >= limit) break;
          if (path === LEDGER_ALL || group.paths.some((candidate) => isInside(candidate, path))) found.push(group);
        }
        return found;
      },
      pairs(districts, limit) {
        const districtOf = (path: string): string | null => districts.find((district) => isInside(folderOf(path), district)) ?? null;
        const folded = new Map<string, LedgerPair>();
        let inside = 0, outside = 0;
        for (const group of kept) {
          if (group.keep === null) continue;
          const to = districtOf(group.keep);
          for (const path of group.paths) {
            if (path === group.keep) continue;
            const from = districtOf(path);
            if (!from || !to) { outside += group.size; continue; }
            if (from === to) { inside += group.size; continue; }
            const pairKey = `${from}\u0000${to}`;
            const pair = folded.get(pairKey) ?? { from, to, bytes: 0, groups: 0 };
            pair.bytes += group.size;
            pair.groups += 1;
            folded.set(pairKey, pair);
          }
        }
        const sorted = [...folded.values()].sort((a, b) => b.bytes - a.bytes || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
        return { pairs: sorted.slice(0, Math.max(0, limit)), inside, outside, total: sorted.length };
      },
    };
    return cached;
  }

  return {
    /** Start over for a report. Groups of another report are never mixed in. */
    reset(id: string, totals: { groups: number; bytes: number }): void {
      groups.clear(); cached = null; reportId = id; groupsTotal = totals.groups; bytesTotal = totals.bytes; complete = false;
    },
    add(id: string, page: readonly JanitorGroup[], last: boolean): void {
      if (reportId !== null && id !== reportId) throw new Error("Le rapport a changé pendant la lecture des groupes.");
      reportId = id;
      for (const group of page) groups.set(group.sha256, ledgerGroup(group));
      if (last) complete = true;
      cached = null;
    },
    get: (sha256: string): LedgerGroup | null => groups.get(sha256) ?? null,
    reportId: () => reportId,
    size: () => groups.size,
    view,
    coverage(): LedgerCoverage {
      let bytesCovered = 0;
      // Same measure as the report's provenSavingsBytes: size × (copies − 1), survivor or not.
      for (const group of groups.values()) bytesCovered += group.size * Math.max(0, group.paths.length + group.omitted - 1);
      return { groupsRead: groups.size, groupsTotal, bytesCovered, bytesTotal, complete };
    },
  };
}
export type DiskxLedger = ReturnType<typeof createLedger>;

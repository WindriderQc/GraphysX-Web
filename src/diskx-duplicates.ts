/**
 * How one verified duplicate group from Data Janitor is shown in the city. Pure: no three.js,
 * no DOM, so the rules are tested in Node.
 *
 * What the picture claims, and what it does not:
 * - "keep" is the copy the report's survivor rule names. It is the rule's choice, not an
 *   authorization: nothing is moved or deleted here.
 * - "extra" copies are the others. Each one would free its size *logically*; hardlinks,
 *   snapshots and compression decide the physical space, which the report does not measure.
 * - With no survivor named, every copy stays "unresolved" and no saving is drawn.
 */
import type { JanitorGroup } from "./diskx-janitor-source";

export const DUPLICATE_ALL_SCOPE = "diskx://all";

export type DuplicateRole = "keep" | "extra" | "unresolved";
export type DuplicateCopy = { path: string; folder: string; role: DuplicateRole };
/** One district of the visible level, holding one or more copies of the group. */
export type DuplicateAnchor = {
  district: string;
  role: DuplicateRole;
  copies: DuplicateCopy[];
  /** Logical bytes the extra copies in this district would free. Zero for keep/unresolved-only. */
  freedBytes: number;
};
export type DuplicateView = {
  sha256: string;
  size: number;
  /** Folder to show as the city level; the copies' folders appear as its districts. */
  scope: string;
  copies: DuplicateCopy[];
  keepPath: string | null;
  freedBytes: number;
  /** Copies the report left out of this page (file limit). Announced, never guessed. */
  omitted: number;
};

export function folderOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut > 0 ? path.slice(0, cut) : "/";
}

const isInside = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);

function commonFolder(folders: readonly string[]): string {
  const parts = folders.map((folder) => folder.split("/").filter(Boolean));
  const shared: string[] = [];
  for (let index = 0; parts.every((segments) => index < segments.length); index += 1) {
    const segment = parts[0][index];
    if (!parts.every((segments) => segments[index] === segment)) break;
    shared.push(segment);
  }
  return `/${shared.join("/")}`;
}

/**
 * Plan the view of a group. `roots` are the scanned disks; `exists` says whether the city's
 * tree knows a folder (the index may be truncated, so the scope climbs until it does).
 */
export function planDuplicateView(group: JanitorGroup, roots: readonly string[], exists: (path: string) => boolean): DuplicateView {
  const keepPath = group.policySurvivorPath && group.files.some((file) => file.path === group.policySurvivorPath)
    ? group.policySurvivorPath
    : null;
  const copies: DuplicateCopy[] = group.files.map((file) => ({
    path: file.path,
    folder: folderOf(file.path),
    role: keepPath === null ? "unresolved" : file.path === keepPath ? "keep" : "extra",
  }));
  const folders = [...new Set(copies.map((copy) => copy.folder))];
  let scope = folders.length ? commonFolder(folders) : DUPLICATE_ALL_SCOPE;
  // A copy sitting in the level folder itself would belong to no district: climb one level so
  // every copy's folder is (inside) a district. This also covers "all copies in one folder".
  if (folders.includes(scope)) scope = folderOf(scope);
  // Above or beside the scanned disks, the disks themselves are the districts.
  if (!roots.some((root) => isInside(scope, root))) scope = DUPLICATE_ALL_SCOPE;
  while (scope !== DUPLICATE_ALL_SCOPE && !exists(scope)) {
    const parent = folderOf(scope);
    scope = roots.some((root) => isInside(parent, root)) ? parent : DUPLICATE_ALL_SCOPE;
  }
  const extras = copies.filter((copy) => copy.role === "extra").length;
  return { sha256: group.sha256, size: group.size, scope, copies, keepPath, freedBytes: extras * group.size, omitted: group.filesOmitted };
}

/**
 * Anchor the copies on the districts of the level being shown. A district holding the kept
 * copy is "keep" even if extras sit beside it; a copy outside every district is returned in
 * `outside` so the HUD can say so instead of drawing it somewhere wrong.
 */
export function anchorDuplicates(view: DuplicateView, districts: readonly string[]): { anchors: DuplicateAnchor[]; outside: DuplicateCopy[] } {
  const byDistrict = new Map<string, DuplicateAnchor>();
  const outside: DuplicateCopy[] = [];
  for (const copy of view.copies) {
    const district = districts.find((path) => isInside(copy.folder, path));
    if (!district) { outside.push(copy); continue; }
    const anchor = byDistrict.get(district) ?? { district, role: copy.role, copies: [], freedBytes: 0 };
    anchor.copies.push(copy);
    if (copy.role === "keep") anchor.role = "keep";
    else if (copy.role === "extra" && anchor.role !== "keep") anchor.role = "extra";
    if (copy.role === "extra") anchor.freedBytes += view.size;
    byDistrict.set(district, anchor);
  }
  return { anchors: [...byDistrict.values()], outside };
}

/** Links to draw: from each district holding only extra copies to the district that keeps one. */
export function duplicateLinks(anchors: readonly DuplicateAnchor[]): { from: string; to: string }[] {
  const keep = anchors.find((anchor) => anchor.role === "keep");
  if (!keep) return [];
  return anchors.filter((anchor) => anchor.role === "extra").map((anchor) => ({ from: anchor.district, to: keep.district }));
}

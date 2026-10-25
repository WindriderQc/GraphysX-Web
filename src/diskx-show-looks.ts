/**
 * What each district looks like in each scene of the Janitor show. Pure: the three.js layer
 * (`diskx-show-layer.ts`) only eases from one look to the next.
 *
 * - world: the city as it stands, so the show can take over without a jump.
 * - duplicates: the folder becomes a ghost; a column rises with the duplicate bytes under it.
 *   Its footprint is the duplicate share of the folder (area stays the honest channel), its
 *   height the share of the level's duplicates on the city's log scale. Cyan = copies the rule
 *   keeps, amber = copies it would not keep, grey = groups whose report names no survivor.
 * - target: the level laid out again without the extra copies (logical bytes). Free-space
 *   tiles do not grow: physical space freed is not measured.
 */
import { layoutDiskxCity, DISKX_REST_PATH, type DiskxNode, type DiskxRect } from "./diskx-data";
import type { FolderTally, LedgerView } from "./diskx-show-ledger";

export type ShowBlock = { id: string; node: DiskxNode; rect: DiskxRect; height: number; kind: "folder" | "rest" };
export type ShowLook = {
  x: number; z: number; width: number; depth: number; height: number;
  shellOpacity: number;
  /** Footprint of the duplicate column as a fraction of the block, per axis. */
  column: number;
  keepHeight: number; unresolvedHeight: number; extraHeight: number;
};

const MAX_HEIGHT = 7;
const SHELL_WORLD = 0.9;
const SHELL_GHOST = 0.07;
const SHELL_GHOST_DUP = 0.16;
const SHELL_TARGET = 0.5;

/** A rest tile stands for many folders: its tally is theirs, summed. */
export function tallyOf(block: ShowBlock, view: LedgerView): FolderTally {
  if (block.node.path !== DISKX_REST_PATH) return view.under(block.node.path);
  const sum = { extraBytes: 0, keepBytes: 0, unresolvedBytes: 0, groups: 0 };
  for (const child of block.node.children) {
    const tally = view.under(child.path);
    sum.extraBytes += tally.extraBytes; sum.keepBytes += tally.keepBytes; sum.unresolvedBytes += tally.unresolvedBytes; sum.groups += tally.groups;
  }
  return sum;
}
const dupBytes = (tally: FolderTally): number => tally.extraBytes + tally.keepBytes + tally.unresolvedBytes;
const extraUnder = (block: ShowBlock, view: LedgerView): number => block.node.path === DISKX_REST_PATH
  ? block.node.children.reduce((sum, child) => sum + view.extraUnder(child.path), 0)
  : view.extraUnder(block.node.path);

export function worldLook(block: ShowBlock): ShowLook {
  return { x: block.rect.x + block.rect.width / 2, z: block.rect.z + block.rect.depth / 2, width: block.rect.width, depth: block.rect.depth,
    height: block.height, shellOpacity: SHELL_WORLD, column: 0.3, keepHeight: 0, unresolvedHeight: 0, extraHeight: 0 };
}

/** Same log scale as the city's skyline: 1 at the whole level, 0.25 floor, ~0 at a millionth. */
function logHeight(share: number): number {
  if (share <= 0) return 0;
  const t = 1 + Math.log10(Math.max(1e-6, share)) / 6;
  return Math.max(0.25, Math.min(1, t)) * MAX_HEIGHT;
}

export function duplicateLooks(blocks: readonly ShowBlock[], view: LedgerView): Map<string, ShowLook> {
  const tallies = blocks.map((block) => tallyOf(block, view));
  const levelDup = tallies.reduce((sum, tally) => sum + dupBytes(tally), 0);
  const looks = new Map<string, ShowLook>();
  blocks.forEach((block, index) => {
    const tally = tallies[index];
    const bytes = dupBytes(tally);
    const look = worldLook(block);
    look.shellOpacity = bytes > 0 ? SHELL_GHOST_DUP : SHELL_GHOST;
    if (bytes > 0) {
      const columnHeight = logHeight(bytes / Math.max(1, levelDup));
      look.column = Math.max(0.3, Math.min(1, Math.sqrt(bytes / Math.max(bytes, block.node.totalSize))));
      look.keepHeight = columnHeight * tally.keepBytes / bytes;
      look.unresolvedHeight = columnHeight * tally.unresolvedBytes / bytes;
      look.extraHeight = columnHeight * tally.extraBytes / bytes;
    }
    looks.set(block.id, look);
  });
  return looks;
}

/** The level after the rule, laid out again: each folder loses its extra copies' logical bytes. */
export function targetLooks(focus: DiskxNode, blocks: readonly ShowBlock[], view: LedgerView, citySize: number): Map<string, ShowLook> {
  const shrink = (node: DiskxNode): DiskxNode => ({ ...node, totalSize: Math.max(0, node.totalSize - view.extraUnder(node.path)) });
  const children = focus.children.map(shrink).sort((a, b) => b.totalSize - a.totalSize);
  const after = layoutDiskxCity({ ...focus, children, ownSize: Math.max(0, focus.ownSize - view.extraDirect(focus.path)) }, { size: citySize });
  const rects = new Map(after.blocks.filter((block) => block.level === 0).map((block) => [block.node.path, block]));
  const duplicates = duplicateLooks(blocks, view);
  const looks = new Map<string, ShowLook>();
  for (const block of blocks) {
    const look = { ...duplicates.get(block.id)! };
    const placed = rects.get(block.node.path);
    if (placed) {
      look.x = placed.rect.x + placed.rect.width / 2; look.z = placed.rect.z + placed.rect.depth / 2;
      look.width = placed.rect.width; look.depth = placed.rect.depth; look.height = placed.height;
    } else {
      // Folded into the remainder, or emptied: it shrinks where it stood.
      look.width = 0.05; look.depth = 0.05; look.height = 0.05;
    }
    look.shellOpacity = SHELL_TARGET;
    look.extraHeight = 0;
    const kept = look.keepHeight + look.unresolvedHeight;
    if (kept > look.height) { const scale = look.height / kept; look.keepHeight *= scale; look.unresolvedHeight *= scale; }
    looks.set(block.id, look);
  }
  return looks;
}

/** Bytes a block would lose by the rule, for its tag. */
export const blockExtraBytes = extraUnder;

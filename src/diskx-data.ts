/**
 * DiskX — the pure half: what AgentX Data says about the disks, and how that becomes a city.
 *
 * AgentX Data (`/api/data-toolbox/storage/tree`) returns one row per directory that *directly*
 * holds files: its own byte total, its own file count and its largest file. It does not return
 * recursive totals, parents that only hold other directories, or more than a page at a time.
 * Everything a TreeSize-style view needs on top of that — the hierarchy, the roll-up, the
 * footprint of each folder and the colour it should carry — is derived here, with no DOM, no
 * three.js and no fetch, so `test/diskx-layout.test.mjs` can check it in Node in milliseconds.
 *
 * The scene itself is ordinary v2 vocabulary (`diskx-scene.ts`): boxes with materials, lights
 * and an emitter. Nothing in this module knows how it will be drawn.
 */

export type DiskxDirectoryRow = {
  path: string;
  fileCount: number;
  totalSize: number;
  largestFile?: string | null;
};

export type DiskxFileRow = {
  path: string;
  size: number;
  category?: string;
  mtime?: number;
};

export type DiskxCategory =
  | "video"
  | "image"
  | "audio"
  | "document"
  | "archive"
  | "code"
  | "model"
  | "system"
  | "other";

export type DiskxNode = {
  path: string;
  name: string;
  depth: number;
  /** Bytes and files held directly in this directory. */
  ownSize: number;
  ownFiles: number;
  /** Bytes and files of this directory and everything under it. */
  totalSize: number;
  totalFiles: number;
  largestFile: string | null;
  category: DiskxCategory;
  children: DiskxNode[];
  /** True when AgentX reported this directory itself, false when it was inferred from a child's path. */
  reported: boolean;
};

export type DiskxTree = {
  roots: DiskxNode[];
  byPath: Map<string, DiskxNode>;
};

/** Neon palette: one hue per category, tuned so bloom lifts the caps without washing the body. */
export const DISKX_PALETTE: Record<DiskxCategory, { color: string; label: string }> = {
  video: { color: "#ff4fd8", label: "Vidéo" },
  image: { color: "#ffb13b", label: "Images" },
  audio: { color: "#b76bff", label: "Audio" },
  document: { color: "#4ff2ff", label: "Documents" },
  archive: { color: "#9dff57", label: "Archives & ISO" },
  code: { color: "#3dffb0", label: "Code & config" },
  model: { color: "#6a7bff", label: "Modèles IA" },
  system: { color: "#ff7a59", label: "Système & VM" },
  other: { color: "#7e9bb8", label: "Autre" },
};

const EXTENSIONS: Record<string, DiskxCategory> = Object.fromEntries(
  (
    [
      ["video", "mp4 mkv avi vob mov m4v wmv mpg mpeg ts m2ts webm flv iso-video"],
      ["image", "jpg jpeg png gif heic heif cr2 nef arw dng raw tif tiff bmp webp psd svg"],
      ["audio", "mp3 flac wav aac ogg m4a wma aiff opus"],
      ["document", "pdf doc docx xls xlsx ppt pptx txt md rtf odt ods csv epub pages numbers key"],
      ["archive", "zip rar 7z tar gz bz2 xz iso img dmg cab"],
      ["code", "js ts mjs cjs jsx tsx py rb go rs java c cpp h hpp cs php html css scss json yaml yml toml xml sh ps1 bat lock"],
      ["model", "gguf safetensors bin pt pth onnx ckpt npz"],
      ["system", "vdi vmdk vhd vhdx qcow2 ova ovf exe msi dll sys log db sqlite bak"],
    ] as const
  ).flatMap(([category, list]) => list.split(" ").map((ext) => [ext, category] as const)),
);

/** Category of one file path. Ollama blobs are content-addressed and carry no extension. */
export function categoryForPath(filePath: string | null | undefined): DiskxCategory {
  if (!filePath) return "other";
  const name = filePath.slice(filePath.lastIndexOf("/") + 1);
  if (/^sha256-[0-9a-f]{64}$/i.test(name) || /\/(LLMs|models|ollama)\//i.test(filePath)) return "model";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "other";
  return EXTENSIONS[name.slice(dot + 1).toLowerCase()] ?? "other";
}

const UNITS = ["o", "Ko", "Mo", "Go", "To", "Po"];

/** French short units, one decimal above kilobytes, as a label can afford. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 o";
  const exponent = Math.min(UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? Math.round(value) : value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${UNITS[exponent]}`;
}

export function formatCount(count: number): string {
  return new Intl.NumberFormat("fr-CA").format(Math.max(0, Math.round(count)));
}

const normalisePath = (value: string): string => {
  const trimmed = value.replace(/\\/g, "/").replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
};

const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1) || path;

/**
 * Build the directory hierarchy under the given roots from AgentX's flat per-directory rows.
 *
 * Rows outside every root are dropped. Directories that hold only other directories are not
 * in the rows at all, so they are created on the way down (`reported: false`) — a folder with
 * no files of its own still has a size, it is the sum of its children. Totals roll up
 * bottom-up; a parent's category is that of its largest child by bytes, so a `Photos` folder
 * glows amber even when its own files are a handful of sidecars.
 */
export function buildDiskxTree(roots: readonly string[], rows: readonly DiskxDirectoryRow[]): DiskxTree {
  const byPath = new Map<string, DiskxNode>();
  const rootPaths = roots.map(normalisePath);
  const make = (path: string, depth: number, reported: boolean): DiskxNode => {
    const node: DiskxNode = {
      path, name: nameOf(path), depth, ownSize: 0, ownFiles: 0, totalSize: 0, totalFiles: 0,
      largestFile: null, category: "other", children: [], reported,
    };
    byPath.set(path, node);
    return node;
  };
  const rootNodes = rootPaths.map((root) => make(root, 0, false));

  const ensure = (path: string): DiskxNode | null => {
    const existing = byPath.get(path);
    if (existing) return existing;
    const root = rootPaths.find((candidate) => path.startsWith(`${candidate}/`));
    if (!root) return null;
    const relative = path.slice(root.length + 1).split("/");
    let parent = byPath.get(root)!;
    let current = root;
    for (const segment of relative) {
      current = `${current}/${segment}`;
      let node = byPath.get(current);
      if (!node) {
        node = make(current, parent.depth + 1, false);
        parent.children.push(node);
      }
      parent = node;
    }
    return parent;
  };

  for (const row of rows) {
    const path = normalisePath(row.path);
    const node = rootPaths.includes(path) ? byPath.get(path)! : ensure(path);
    if (!node) continue;
    node.reported = true;
    node.ownSize += Math.max(0, Number(row.totalSize) || 0);
    node.ownFiles += Math.max(0, Number(row.fileCount) || 0);
    if (row.largestFile) node.largestFile = row.largestFile;
  }

  const rollUp = (node: DiskxNode): void => {
    let totalSize = node.ownSize;
    let totalFiles = node.ownFiles;
    let dominant: { size: number; category: DiskxCategory } = { size: node.ownSize, category: categoryForPath(node.largestFile) };
    for (const child of node.children) {
      rollUp(child);
      totalSize += child.totalSize;
      totalFiles += child.totalFiles;
      if (child.totalSize > dominant.size) dominant = { size: child.totalSize, category: child.category };
    }
    node.totalSize = totalSize;
    node.totalFiles = totalFiles;
    node.category = dominant.category;
    node.children.sort((a, b) => b.totalSize - a.totalSize || a.name.localeCompare(b.name, "fr"));
  };
  rootNodes.forEach(rollUp);
  return { roots: rootNodes, byPath };
}

/**
 * A volume is what the folders sit on: a disk, a pool, a share. AgentX Data indexes files and
 * says nothing about capacity (measured 2026-10-24), so volumes come from a separate source —
 * measured on the host that mounts them, or declared — and may be absent, in which case the
 * city shows what is used and says the capacity is unknown rather than inventing one.
 */
export type DiskxVolume = {
  id: string;
  label: string;
  /** Scanned roots that live on this volume. Free space is shared between them. */
  roots: string[];
  capacityBytes: number;
  freeBytes: number;
  /** "measured" from statfs/zpool on the host, "declared" by a person or a config file. */
  source: "measured" | "declared";
  measuredAt?: string | null;
  note?: string | null;
};

export type DiskxRect = { x: number; z: number; width: number; depth: number };

export type DiskxTile<T> = { item: T; rect: DiskxRect };

/**
 * Squarified treemap (Bruls, Huizing & van Wijk 2000) over the XZ plane.
 *
 * Items are laid in rows along the shorter side of the remaining rectangle; a row is closed
 * when adding the next item would make its tiles less square. Zero-weight items get no tile.
 * Areas are exactly proportional to weights, and tiles never overlap or leave the bounds —
 * both are asserted by the unit test, because a treemap that lies about area is worse than
 * a bar chart.
 */
export function squarify<T>(items: readonly T[], weightOf: (item: T) => number, bounds: DiskxRect): DiskxTile<T>[] {
  const entries = items
    .map((item) => ({ item, weight: Math.max(0, weightOf(item)) }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const area = bounds.width * bounds.depth;
  if (total <= 0 || area <= 0) return [];
  const scale = area / total;
  const tiles: DiskxTile<T>[] = [];
  let remaining: DiskxRect = { ...bounds };
  let row: { item: T; area: number }[] = [];

  const worst = (candidates: { area: number }[], side: number): number => {
    const sum = candidates.reduce((acc, entry) => acc + entry.area, 0);
    if (sum <= 0) return Number.POSITIVE_INFINITY;
    let max = 0;
    let min = Number.POSITIVE_INFINITY;
    for (const entry of candidates) {
      max = Math.max(max, entry.area);
      min = Math.min(min, entry.area);
    }
    const sideSquared = side * side;
    const sumSquared = sum * sum;
    return Math.max((sideSquared * max) / sumSquared, sumSquared / (sideSquared * min));
  };

  const layoutRow = (current: { item: T; area: number }[]): void => {
    const sum = current.reduce((acc, entry) => acc + entry.area, 0);
    // A row lies along the *shorter* side of what is left, which is what keeps tiles square:
    // in a rectangle wider than it is deep the row is a vertical strip (items stacked along z)
    // whose width is the slice it takes; otherwise a horizontal strip across the width.
    const horizontalStrip = remaining.width < remaining.depth;
    if (horizontalStrip) {
      const stripDepth = sum / remaining.width;
      let cursor = remaining.x;
      for (const entry of current) {
        const width = entry.area / stripDepth;
        tiles.push({ item: entry.item, rect: { x: cursor, z: remaining.z, width, depth: stripDepth } });
        cursor += width;
      }
      remaining = { x: remaining.x, z: remaining.z + stripDepth, width: remaining.width, depth: remaining.depth - stripDepth };
    } else {
      const stripWidth = sum / remaining.depth;
      let cursor = remaining.z;
      for (const entry of current) {
        const depth = entry.area / stripWidth;
        tiles.push({ item: entry.item, rect: { x: remaining.x, z: cursor, width: stripWidth, depth } });
        cursor += depth;
      }
      remaining = { x: remaining.x + stripWidth, z: remaining.z, width: remaining.width - stripWidth, depth: remaining.depth };
    }
  };

  for (const entry of entries) {
    const candidate = { item: entry.item, area: entry.weight * scale };
    const side = Math.min(remaining.width, remaining.depth);
    if (row.length && worst([...row, candidate], side) > worst(row, side)) {
      layoutRow(row);
      row = [];
    }
    row.push(candidate);
  }
  if (row.length) layoutRow(row);
  return tiles;
}

export type DiskxBlock = {
  node: DiskxNode;
  /** A folder district, the folded long tail, or a volume's free space. */
  kind: "folder" | "rest" | "free";
  /** Footprint in world XZ, already inset by the street gap. */
  rect: DiskxRect;
  /** Block height in world units. */
  height: number;
  /** 0 for the folders of the current level, 1 for their children drawn on the roof. */
  level: 0 | 1;
  parent: DiskxNode | null;
  /** Height of the district a level-1 building stands on; filled in when the scene is composed. */
  parentHeight?: number;
};

export type DiskxCityLayout = {
  focus: DiskxNode;
  /** Side of the square plaza the city sits on. */
  size: number;
  blocks: DiskxBlock[];
  /** The current folder's own files, as one low plaza tile, when it has any. */
  plaza: { rect: DiskxRect; size: number; files: number } | null;
};

export type DiskxCityOptions = {
  /** Plaza side in world units. */
  size?: number;
  /** Gap between blocks, as a fraction of the plaza side. */
  street?: number;
  /** How many of a folder's children are previewed on its roof. */
  roofChildren?: number;
  /** Tallest block, in world units. */
  maxHeight?: number;
  /** Most districts drawn at once; the rest fold into one "autres" tile. */
  maxDistricts?: number;
  /**
   * Volumes whose free space is laid out beside the folders of this level, each as one low
   * tile with the same bytes-to-area scale. Pass them at the level where the volumes' roots
   * are the districts (the "all disks" view), never inside a folder: free space belongs to
   * the volume, not to any folder on it, and drawing it twice would lie about the plaza.
   */
  freeVolumes?: DiskxVolume[];
};

/** The folded remainder of a level: many small siblings shown as one tile, still clickable as a list. */
export const DISKX_REST_PATH = "diskx://rest";
/** Prefix of the synthetic path a free-space tile carries: `diskx://free/<volume id>`. */
export const DISKX_FREE_PATH_PREFIX = "diskx://free/";

export const freePathOf = (volume: DiskxVolume): string => `${DISKX_FREE_PATH_PREFIX}${volume.id}`;

const inset = (rect: DiskxRect, gap: number): DiskxRect => {
  const g = Math.min(gap, rect.width * 0.3, rect.depth * 0.3);
  return { x: rect.x + g, z: rect.z + g, width: Math.max(0.05, rect.width - 2 * g), depth: Math.max(0.05, rect.depth - 2 * g) };
};

/**
 * Lay the children of `focus` out as districts on a square plaza, each district carrying its
 * own largest children as buildings on its roof.
 *
 * Area is the honest channel (bytes), so height carries a second reading: a district's height
 * is its share of the level on a logarithmic scale, which keeps a 400 GB movie library and a
 * 4 MB notes folder both visible on one plaza — the skyline reads as "where the bytes are"
 * at a glance, while the footprint stays exact for comparison.
 */
export function layoutDiskxCity(focus: DiskxNode, options: DiskxCityOptions = {}): DiskxCityLayout {
  const size = options.size ?? 40;
  const street = (options.street ?? 0.012) * size;
  const roofChildren = options.roofChildren ?? 7;
  const maxHeight = options.maxHeight ?? 7;
  const maxDistricts = options.maxDistricts ?? 48;

  const plazaWeight = focus.ownSize;
  const children = focus.children.filter((child) => child.totalSize > 0);
  const shown = children.slice(0, maxDistricts);
  const rest = children.slice(maxDistricts);
  const restSize = rest.reduce((sum, child) => sum + child.totalSize, 0);
  type Item = { kind: "child"; node: DiskxNode } | { kind: "rest"; size: number } | { kind: "plaza"; size: number } | { kind: "free"; volume: DiskxVolume; size: number };
  const items: Item[] = shown.map((node) => ({ kind: "child", node }) as Item);
  if (restSize > 0) items.push({ kind: "rest", size: restSize });
  if (plazaWeight > 0) items.push({ kind: "plaza", size: plazaWeight });
  for (const volume of options.freeVolumes ?? []) {
    if (volume.freeBytes > 0) items.push({ kind: "free", volume, size: volume.freeBytes });
  }

  const weightOf = (item: Item): number => (item.kind === "child" ? item.node.totalSize : item.size);
  const bounds: DiskxRect = { x: -size / 2, z: -size / 2, width: size, depth: size };
  const tiles = squarify(items, weightOf, bounds);
  const levelTotal = items.reduce((sum, item) => sum + weightOf(item), 0);
  const heightFor = (bytes: number, ceiling: number): number => {
    if (bytes <= 0 || levelTotal <= 0) return 0.15;
    // log share: 1 at 100% of the level, ~0 at one millionth of it.
    const share = Math.max(1e-6, bytes / levelTotal);
    const t = 1 + Math.log10(share) / 6;
    return Math.max(0.25, Math.min(1, t)) * ceiling;
  };

  const blocks: DiskxBlock[] = [];
  let plaza: DiskxCityLayout["plaza"] = null;
  for (const tile of tiles) {
    const rect = inset(tile.rect, street);
    if (tile.item.kind === "plaza") {
      plaza = { rect, size: tile.item.size, files: focus.ownFiles };
      continue;
    }
    if (tile.item.kind === "free") {
      const { volume } = tile.item;
      const node: DiskxNode = {
        path: freePathOf(volume), name: `libre · ${volume.label}`, depth: focus.depth + 1,
        ownSize: 0, ownFiles: 0, totalSize: volume.freeBytes, totalFiles: 0,
        largestFile: null, category: "other", children: [], reported: false,
      };
      // Emptiness is flat: the tile keeps its honest footprint and no skyline.
      blocks.push({ node, kind: "free", rect, height: 0.22, level: 0, parent: focus });
      continue;
    }
    if (tile.item.kind === "rest") {
      const node: DiskxNode = {
        path: DISKX_REST_PATH, name: `${rest.length} autres dossiers`, depth: focus.depth + 1,
        ownSize: 0, ownFiles: 0, totalSize: tile.item.size, totalFiles: rest.reduce((sum, child) => sum + child.totalFiles, 0),
        largestFile: null, category: "other", children: rest, reported: false,
      };
      blocks.push({ node, kind: "rest", rect, height: heightFor(tile.item.size, maxHeight), level: 0, parent: focus });
      continue;
    }
    const node = tile.item.node;
    const height = heightFor(node.totalSize, maxHeight);
    blocks.push({ node, kind: "folder", rect, height, level: 0, parent: focus });
    // Roof preview: the district's largest children as small buildings, inset again so the
    // district reads as a plinth. Skipped on slivers where nothing would be legible.
    if (rect.width < size * 0.06 || rect.depth < size * 0.06 || node.children.length === 0) continue;
    const roofBounds = inset(rect, Math.max(street * 1.5, Math.min(rect.width, rect.depth) * 0.13));
    const roofItems = node.children.slice(0, roofChildren);
    const roofTotal = node.totalSize;
    for (const roofTile of squarify(roofItems, (child) => child.totalSize, roofBounds)) {
      const share = roofTile.item.totalSize / Math.max(1, roofTotal);
      const roofHeight = Math.max(0.12, Math.min(maxHeight * 0.4, (0.35 + Math.log10(Math.max(1e-6, share)) / 6 + 1) * maxHeight * 0.26));
      blocks.push({ node: roofTile.item, kind: "folder", rect: inset(roofTile.rect, street * 0.5), height: roofHeight, level: 1, parent: node });
    }
  }
  return { focus, size, blocks, plaza };
}

/** Share of each category in a node's subtree, by bytes, largest first. Used by the HUD legend. */
export function categoryShares(node: DiskxNode): { category: DiskxCategory; bytes: number; share: number }[] {
  const totals = new Map<DiskxCategory, number>();
  const visit = (current: DiskxNode): void => {
    // Leaves carry their own bytes; an inferred parent has none of its own.
    if (current.ownSize > 0) {
      const category = categoryForPath(current.largestFile);
      totals.set(category, (totals.get(category) ?? 0) + current.ownSize);
    }
    current.children.forEach(visit);
  };
  visit(node);
  const sum = [...totals.values()].reduce((acc, value) => acc + value, 0) || 1;
  return [...totals.entries()]
    .map(([category, bytes]) => ({ category, bytes, share: bytes / sum }))
    .sort((a, b) => b.bytes - a.bytes);
}

/** Breadcrumb from a root down to `node`, using the tree's own parents. */
export function pathCrumbs(tree: DiskxTree, node: DiskxNode): DiskxNode[] {
  const crumbs: DiskxNode[] = [];
  let current: DiskxNode | undefined = node;
  while (current) {
    crumbs.unshift(current);
    const parentPath = current.path.slice(0, current.path.lastIndexOf("/"));
    current = current.depth > 0 ? tree.byPath.get(parentPath) : undefined;
  }
  return crumbs;
}

/** The volume a root (or any path under it) lives on, or null when none is known. */
export function volumeForPath(volumes: readonly DiskxVolume[], path: string): DiskxVolume | null {
  return volumes.find((volume) => volume.roots.some((root) => path === root || path.startsWith(`${root}/`))) ?? null;
}

/** Used/free/capacity of one volume as the HUD shows it; capacity wins over used + free when they disagree. */
export function volumeOccupancy(volume: DiskxVolume, tree: DiskxTree): { used: number; free: number; capacity: number; indexed: number; usedShare: number } {
  const indexed = volume.roots.reduce((sum, root) => sum + (tree.byPath.get(root)?.totalSize ?? 0), 0);
  const capacity = Math.max(volume.capacityBytes, 0);
  const free = Math.min(Math.max(volume.freeBytes, 0), capacity || volume.freeBytes);
  const used = capacity > 0 ? Math.max(0, capacity - free) : indexed;
  return { used, free, capacity, indexed, usedShare: capacity > 0 ? used / capacity : 0 };
}

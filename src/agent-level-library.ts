import type { MapEditorDraft, MapEditorTile } from "./race-scene";

export const GRAPHYSX_AGENT_LEVEL_SCHEMA = "graphysx.agent-level/v1" as const;
export const GRAPHYSX_AGENT_LEVEL_ASCII_SCHEMA = "graphysx.agent-level-ascii/v1" as const;

const LIBRARY_STORAGE_KEY = "graphysx-agent-level-library-v1";
const LIBRARY_SCHEMA = "graphysx.agent-level-library/v1" as const;
const MAX_LEVELS = 64;
const MAX_DIMENSION = 64;
const MAX_CELLS = 4096;
const HISTORY_LIMIT = 32;

export const GRAPHYSX_AGENT_LEVEL_CAPABILITIES = [
  "level.tiles",
  "level.list",
  "level.create",
  "level.remove",
  "level.open",
  "level.query-region",
  "level.patch",
  "level.fill",
  "level.resize",
  "level.transaction",
  "level.undo",
  "level.ascii.import",
  "level.ascii.export",
  "level.play"
] as const;

export const GRAPHYSX_AGENT_LEVEL_TILES: readonly MapEditorTile[] = [
  "floor", "wall", "start", "ring", "half", "finish", "hazard", "fire", "ice"
] as const;

export const GRAPHYSX_AGENT_LEVEL_TILE_SEMANTICS: Readonly<Record<MapEditorTile, string>> = {
  floor: "Driveable floor",
  wall: "Solid wall",
  start: "Single player spawn",
  ring: "Collectible checkpoint",
  half: "Single halfway gate",
  finish: "Single finish gate",
  hazard: "Solid obstacle",
  fire: "Repulsive force that launches upward",
  ice: "Attractive force that preserves ground momentum"
};

export type AgentLevelDefinition = MapEditorDraft & {
  schema: typeof GRAPHYSX_AGENT_LEVEL_SCHEMA;
  id: string;
  label: string;
  cellSize: number;
};

export type AgentLevelState = AgentLevelDefinition & {
  revision: number;
};

export type AgentLevelSummary = {
  id: string;
  label: string;
  width: number;
  height: number;
  cellSize: number;
  revision: number;
  counts: Record<MapEditorTile, number>;
};

export type AgentLevelCreateOptions = {
  id: string;
  label?: string;
  width: number;
  height: number;
  cellSize?: number;
  defaultTile?: MapEditorTile;
  tiles?: MapEditorTile[];
};

export type AgentLevelCellPatch = {
  x: number;
  y: number;
  tile: MapEditorTile;
};

export type AgentLevelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AgentLevelOperation =
  | { op: "patch"; changes: AgentLevelCellPatch[] }
  | { op: "fill"; rect: AgentLevelRect; tile: MapEditorTile }
  | { op: "resize"; width: number; height: number; defaultTile?: MapEditorTile };

export type AgentLevelTransactionOptions = {
  expectedRevision?: number;
};

export type AgentLevelRegion = AgentLevelRect & {
  id: string;
  revision: number;
  rows: MapEditorTile[][];
};

export type AgentLevelAsciiDocument = {
  schema: typeof GRAPHYSX_AGENT_LEVEL_ASCII_SCHEMA;
  id: string;
  label: string;
  width: number;
  height: number;
  cellSize: number;
  legend: Readonly<Record<MapEditorTile, string>>;
  rows: string[];
};

export type AgentLevelAsciiImport = {
  id: string;
  label?: string;
  cellSize?: number;
  rows: string[];
};

export type AgentLevelResult<T> = {
  ok: boolean;
  revision: number;
  value?: T;
  error?: string;
};

export type GraphysXAgentLevelApi = {
  readonly schema: "graphysx.agent-level-api/v1";
  readonly levelSchema: typeof GRAPHYSX_AGENT_LEVEL_SCHEMA;
  readonly version: "1.0";
  readonly capabilities: typeof GRAPHYSX_AGENT_LEVEL_CAPABILITIES;
  readonly tiles: typeof GRAPHYSX_AGENT_LEVEL_TILES;
  readonly tileSemantics: typeof GRAPHYSX_AGENT_LEVEL_TILE_SEMANTICS;
  active(): AgentLevelState | null;
  list(): AgentLevelSummary[];
  get(id: string): AgentLevelState | null;
  create(options: AgentLevelCreateOptions): AgentLevelResult<AgentLevelState>;
  remove(id: string): AgentLevelResult<string>;
  open(id: string): AgentLevelResult<AgentLevelState>;
  region(id: string, rect: AgentLevelRect): AgentLevelResult<AgentLevelRegion>;
  patch(id: string, changes: AgentLevelCellPatch[], options?: AgentLevelTransactionOptions): AgentLevelResult<AgentLevelState>;
  fill(id: string, rect: AgentLevelRect, tile: MapEditorTile, options?: AgentLevelTransactionOptions): AgentLevelResult<AgentLevelState>;
  resize(id: string, width: number, height: number, defaultTile?: MapEditorTile, options?: AgentLevelTransactionOptions): AgentLevelResult<AgentLevelState>;
  transaction(id: string, operations: AgentLevelOperation[], options?: AgentLevelTransactionOptions): AgentLevelResult<AgentLevelState>;
  undo(id: string): AgentLevelResult<AgentLevelState>;
  importAscii(source: AgentLevelAsciiImport): AgentLevelResult<AgentLevelState>;
  exportAscii(id: string): AgentLevelResult<AgentLevelAsciiDocument>;
  play(id: string): AgentLevelResult<AgentLevelState>;
};

type StoredLibrary = {
  schema: typeof LIBRARY_SCHEMA;
  activeId: string;
  levels: AgentLevelState[];
};

const SINGLETON_TILES: readonly MapEditorTile[] = ["start", "half", "finish"];
const ASCII_LEGEND: Readonly<Record<MapEditorTile, string>> = {
  floor: ".",
  wall: "#",
  start: "S",
  ring: "o",
  half: "H",
  finish: "F",
  hazard: "!",
  fire: "^",
  ice: "~"
};
const ASCII_TILES = new Map(Object.entries(ASCII_LEGEND).map(([tile, symbol]) => [symbol, tile as MapEditorTile]));

export class AgentLevelLibrary {
  private readonly levels = new Map<string, AgentLevelState>();
  private readonly histories = new Map<string, AgentLevelState[]>();
  private activeId = "";

  constructor(fallback: AgentLevelDefinition) {
    const restored = this.restore();
    if (!restored) {
      const initial = resolveDefinition(fallback, 0);
      this.levels.set(initial.id, initial);
      this.activeId = initial.id;
      this.persist();
    }
  }

  active(): AgentLevelState | null {
    return this.get(this.activeId);
  }

  list(): AgentLevelSummary[] {
    return [...this.levels.values()].map((level) => summarize(level));
  }

  get(id: string): AgentLevelState | null {
    const level = this.levels.get(id);
    return level ? cloneLevel(level) : null;
  }

  create(options: AgentLevelCreateOptions): AgentLevelResult<AgentLevelState> {
    try {
      if (this.levels.size >= MAX_LEVELS) throw new Error(`A level library can contain at most ${MAX_LEVELS} levels`);
      validateId(options.id);
      if (this.levels.has(options.id)) throw new Error(`Level already exists: ${options.id}`);
      validateDimensions(options.width, options.height);
      const defaultTile = options.defaultTile ?? "floor";
      validateTile(defaultTile);
      const tiles = options.tiles ? [...options.tiles] : Array.from<MapEditorTile>({ length: options.width * options.height }).fill(defaultTile);
      const level = resolveDefinition({
        schema: GRAPHYSX_AGENT_LEVEL_SCHEMA,
        id: options.id,
        label: options.label?.trim() || humanizeId(options.id),
        width: options.width,
        height: options.height,
        cellSize: options.cellSize ?? 2.6,
        tiles
      }, 0);
      this.levels.set(level.id, level);
      this.histories.set(level.id, []);
      this.activeId = level.id;
      this.persist();
      return success(level);
    } catch (error) {
      return failure(error);
    }
  }

  remove(id: string): AgentLevelResult<string> {
    try {
      const level = this.requireLevel(id);
      if (this.levels.size === 1) throw new Error("The last level cannot be removed");
      this.levels.delete(level.id);
      this.histories.delete(level.id);
      if (this.activeId === level.id) this.activeId = this.levels.keys().next().value as string;
      this.persist();
      return { ok: true, revision: level.revision, value: level.id };
    } catch (error) {
      return failure(error);
    }
  }

  activate(id: string): AgentLevelResult<AgentLevelState> {
    try {
      const level = this.requireLevel(id);
      this.activeId = id;
      this.persist();
      return success(level);
    } catch (error) {
      return failure(error);
    }
  }

  region(id: string, rect: AgentLevelRect): AgentLevelResult<AgentLevelRegion> {
    try {
      const level = this.requireLevel(id);
      validateRect(rect, level);
      const rows = Array.from({ length: rect.height }, (_, row) => {
        const start = (rect.y + row) * level.width + rect.x;
        return level.tiles.slice(start, start + rect.width);
      });
      return {
        ok: true,
        revision: level.revision,
        value: { id, revision: level.revision, ...rect, rows }
      };
    } catch (error) {
      return failure(error);
    }
  }

  patch(id: string, changes: AgentLevelCellPatch[], options?: AgentLevelTransactionOptions): AgentLevelResult<AgentLevelState> {
    return this.transaction(id, [{ op: "patch", changes }], options);
  }

  fill(id: string, rect: AgentLevelRect, tile: MapEditorTile, options?: AgentLevelTransactionOptions): AgentLevelResult<AgentLevelState> {
    return this.transaction(id, [{ op: "fill", rect, tile }], options);
  }

  resize(id: string, width: number, height: number, defaultTile: MapEditorTile = "floor", options?: AgentLevelTransactionOptions): AgentLevelResult<AgentLevelState> {
    return this.transaction(id, [{ op: "resize", width, height, defaultTile }], options);
  }

  transaction(id: string, operations: AgentLevelOperation[], options: AgentLevelTransactionOptions = {}): AgentLevelResult<AgentLevelState> {
    try {
      const current = this.requireLevel(id);
      if (options.expectedRevision !== undefined && options.expectedRevision !== current.revision) {
        throw new Error(`Revision conflict for ${id}: expected ${options.expectedRevision}, current ${current.revision}`);
      }
      if (!Array.isArray(operations) || operations.length === 0) throw new Error("A level transaction requires at least one operation");
      const next = cloneLevel(current);
      for (const operation of operations) applyOperation(next, operation);
      validateLevel(next);
      if (sameContent(current, next)) return success(current);
      this.pushHistory(id, current);
      next.revision = current.revision + 1;
      this.levels.set(id, next);
      this.persist();
      return success(next);
    } catch (error) {
      return failure(error, this.levels.get(id)?.revision ?? 0);
    }
  }

  undo(id: string): AgentLevelResult<AgentLevelState> {
    try {
      const current = this.requireLevel(id);
      const history = this.histories.get(id) ?? [];
      const previous = history.pop();
      if (!previous) throw new Error(`No level edit to undo for ${id}`);
      const restored = cloneLevel(previous);
      restored.revision = current.revision + 1;
      this.histories.set(id, history);
      this.levels.set(id, restored);
      this.persist();
      return success(restored);
    } catch (error) {
      return failure(error, this.levels.get(id)?.revision ?? 0);
    }
  }

  importAscii(source: AgentLevelAsciiImport): AgentLevelResult<AgentLevelState> {
    try {
      if (!Array.isArray(source.rows) || source.rows.length === 0) throw new Error("ASCII import requires at least one row");
      const width = source.rows[0]?.length ?? 0;
      if (width === 0 || source.rows.some((row) => typeof row !== "string" || row.length !== width)) throw new Error("ASCII rows must be non-empty and equal width");
      const tiles = source.rows.flatMap((row, y) => [...row].map((symbol, x) => {
        const tile = ASCII_TILES.get(symbol);
        if (!tile) throw new Error(`Unknown ASCII tile '${symbol}' at ${x},${y}`);
        return tile;
      }));
      validateSingletons(tiles);
      return this.create({
        id: source.id,
        label: source.label,
        width,
        height: source.rows.length,
        cellSize: source.cellSize,
        tiles
      });
    } catch (error) {
      return failure(error);
    }
  }

  exportAscii(id: string): AgentLevelResult<AgentLevelAsciiDocument> {
    try {
      const level = this.requireLevel(id);
      const rows = Array.from({ length: level.height }, (_, y) => level.tiles
        .slice(y * level.width, (y + 1) * level.width)
        .map((tile) => ASCII_LEGEND[tile])
        .join(""));
      return {
        ok: true,
        revision: level.revision,
        value: {
          schema: GRAPHYSX_AGENT_LEVEL_ASCII_SCHEMA,
          id: level.id,
          label: level.label,
          width: level.width,
          height: level.height,
          cellSize: level.cellSize,
          legend: ASCII_LEGEND,
          rows
        }
      };
    } catch (error) {
      return failure(error);
    }
  }

  replace(id: string, definition: AgentLevelDefinition): AgentLevelResult<AgentLevelState> {
    try {
      const current = this.requireLevel(id);
      const next = resolveDefinition({ ...definition, id }, current.revision + 1);
      this.pushHistory(id, current);
      this.levels.set(id, next);
      this.persist();
      return success(next);
    } catch (error) {
      return failure(error, this.levels.get(id)?.revision ?? 0);
    }
  }

  private requireLevel(id: string): AgentLevelState {
    const level = this.levels.get(id);
    if (!level) throw new Error(`Unknown level: ${id}`);
    return level;
  }

  private pushHistory(id: string, level: AgentLevelState): void {
    const history = this.histories.get(id) ?? [];
    history.push(cloneLevel(level));
    if (history.length > HISTORY_LIMIT) history.shift();
    this.histories.set(id, history);
  }

  private restore(): boolean {
    try {
      const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
      if (!raw) return false;
      const stored = JSON.parse(raw) as StoredLibrary;
      if (stored.schema !== LIBRARY_SCHEMA || !Array.isArray(stored.levels) || stored.levels.length === 0 || stored.levels.length > MAX_LEVELS) return false;
      for (const candidate of stored.levels) {
        const level = resolveDefinition(candidate, candidate.revision);
        if (this.levels.has(level.id)) return false;
        this.levels.set(level.id, level);
      }
      this.activeId = this.levels.has(stored.activeId) ? stored.activeId : this.levels.keys().next().value as string;
      return true;
    } catch {
      this.levels.clear();
      return false;
    }
  }

  private persist(): void {
    try {
      const stored: StoredLibrary = {
        schema: LIBRARY_SCHEMA,
        activeId: this.activeId,
        levels: [...this.levels.values()].map(cloneLevel)
      };
      window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Persistence is optional; the live library remains fully usable.
    }
  }
}

function applyOperation(level: AgentLevelState, operation: AgentLevelOperation): void {
  if (!operation || typeof operation !== "object") throw new Error("Invalid level operation");
  if (operation.op === "patch") {
    if (!Array.isArray(operation.changes) || operation.changes.length === 0) throw new Error("patch requires at least one cell change");
    for (const change of operation.changes) {
      validateTile(change.tile);
      validateCell(change.x, change.y, level);
      if (SINGLETON_TILES.includes(change.tile)) {
        level.tiles = level.tiles.map((tile) => tile === change.tile ? "floor" : tile);
      }
      level.tiles[change.y * level.width + change.x] = change.tile;
    }
    return;
  }
  if (operation.op === "fill") {
    validateTile(operation.tile);
    if (SINGLETON_TILES.includes(operation.tile)) throw new Error("fill supports floor, wall, ring, hazard, fire, and ice; place singleton gates with patch");
    validateRect(operation.rect, level);
    for (let y = operation.rect.y; y < operation.rect.y + operation.rect.height; y += 1) {
      for (let x = operation.rect.x; x < operation.rect.x + operation.rect.width; x += 1) {
        level.tiles[y * level.width + x] = operation.tile;
      }
    }
    return;
  }
  if (operation.op === "resize") {
    validateDimensions(operation.width, operation.height);
    const defaultTile = operation.defaultTile ?? "floor";
    validateTile(defaultTile);
    if (SINGLETON_TILES.includes(defaultTile)) throw new Error("A resize default tile cannot be a singleton gate");
    const resized = Array.from<MapEditorTile>({ length: operation.width * operation.height }).fill(defaultTile);
    const copyWidth = Math.min(level.width, operation.width);
    const copyHeight = Math.min(level.height, operation.height);
    for (let y = 0; y < copyHeight; y += 1) {
      for (let x = 0; x < copyWidth; x += 1) resized[y * operation.width + x] = level.tiles[y * level.width + x];
    }
    level.width = operation.width;
    level.height = operation.height;
    level.tiles = resized;
    return;
  }
  throw new Error(`Unsupported level operation: ${String((operation as { op?: unknown }).op)}`);
}

function resolveDefinition(definition: AgentLevelDefinition, revision: number): AgentLevelState {
  const level: AgentLevelState = {
    schema: GRAPHYSX_AGENT_LEVEL_SCHEMA,
    id: definition.id,
    label: definition.label,
    width: definition.width,
    height: definition.height,
    cellSize: definition.cellSize,
    tiles: [...definition.tiles],
    revision
  };
  validateLevel(level);
  return level;
}

function validateLevel(level: AgentLevelState): void {
  if (level.schema !== GRAPHYSX_AGENT_LEVEL_SCHEMA) throw new Error(`Level schema must be ${GRAPHYSX_AGENT_LEVEL_SCHEMA}`);
  validateId(level.id);
  if (!level.label?.trim() || level.label.trim().length > 80) throw new Error("Level label must contain 1 to 80 characters");
  validateDimensions(level.width, level.height);
  if (!Number.isFinite(level.cellSize) || level.cellSize < 0.25 || level.cellSize > 20) throw new Error("Level cellSize must be between 0.25 and 20");
  if (!Array.isArray(level.tiles) || level.tiles.length !== level.width * level.height) throw new Error(`Level requires exactly ${level.width * level.height} tiles`);
  for (const tile of level.tiles) validateTile(tile);
  validateSingletons(level.tiles);
  if (!Number.isInteger(level.revision) || level.revision < 0) throw new Error("Level revision must be a non-negative integer");
}

function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error("Level width and height must be positive integers");
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_CELLS) {
    throw new Error(`Level dimensions exceed the current ${MAX_DIMENSION}×${MAX_DIMENSION} / ${MAX_CELLS}-cell editor limit`);
  }
}

function validateId(id: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(id)) throw new Error(`Invalid level id: ${id}`);
}

function validateTile(tile: unknown): asserts tile is MapEditorTile {
  if (!GRAPHYSX_AGENT_LEVEL_TILES.includes(tile as MapEditorTile)) throw new Error(`Unsupported level tile: ${String(tile)}`);
}

function validateSingletons(tiles: MapEditorTile[]): void {
  for (const tile of SINGLETON_TILES) {
    if (tiles.filter((candidate) => candidate === tile).length > 1) throw new Error(`Level can contain at most one ${tile} tile`);
  }
}

function validateCell(x: number, y: number, level: AgentLevelState): void {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= level.width || y >= level.height) {
    throw new Error(`Cell ${x},${y} is outside level ${level.id} (${level.width}×${level.height})`);
  }
}

function validateRect(rect: AgentLevelRect, level: AgentLevelState): void {
  if (!rect || !Number.isInteger(rect.x) || !Number.isInteger(rect.y) || !Number.isInteger(rect.width) || !Number.isInteger(rect.height) || rect.width < 1 || rect.height < 1) {
    throw new Error("A level region requires integer x, y, width, and height");
  }
  validateCell(rect.x, rect.y, level);
  validateCell(rect.x + rect.width - 1, rect.y + rect.height - 1, level);
}

function summarize(level: AgentLevelState): AgentLevelSummary {
  const counts = level.tiles.reduce<Record<MapEditorTile, number>>((result, tile) => {
    result[tile] += 1;
    return result;
  }, { floor: 0, wall: 0, start: 0, ring: 0, half: 0, finish: 0, hazard: 0, fire: 0, ice: 0 });
  return {
    id: level.id,
    label: level.label,
    width: level.width,
    height: level.height,
    cellSize: level.cellSize,
    revision: level.revision,
    counts
  };
}

function success<T>(value: T): AgentLevelResult<T> {
  const revision = typeof value === "object" && value !== null && "revision" in value ? Number((value as { revision: number }).revision) : 0;
  return { ok: true, revision, value: cloneValue(value) };
}

function failure<T = never>(error: unknown, revision = 0): AgentLevelResult<T> {
  return { ok: false, revision, error: error instanceof Error ? error.message : String(error) };
}

function cloneLevel(level: AgentLevelState): AgentLevelState {
  return { ...level, tiles: [...level.tiles] };
}

function cloneValue<T>(value: T): T {
  if (value && typeof value === "object" && "tiles" in value) return cloneLevel(value as unknown as AgentLevelState) as unknown as T;
  return value;
}

function sameContent(left: AgentLevelState, right: AgentLevelState): boolean {
  return left.width === right.width && left.height === right.height && left.cellSize === right.cellSize && left.label === right.label && left.tiles.every((tile, index) => right.tiles[index] === tile);
}

function humanizeId(id: string): string {
  return id.split(/[-_.:]+/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ") || id;
}

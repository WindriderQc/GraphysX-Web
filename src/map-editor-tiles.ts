// The grid-level tile vocabulary.
//
// This is a type, three constants and no behaviour — deliberately. It exists because
// `MapEditorTile` was declared inside `race-scene.ts`, the 9,900-line legacy archive player,
// and three files on the clean platform path imported it from there:
// `agent-level-library.ts`, `agent-world-api.ts` and `platform-editor.ts`.
//
// A `import type` costs nothing at runtime, so this was never a bundle problem. It was a
// dependency-direction problem: the clean default host is supposed to be independent of the
// legacy monolith, and "independent except for one type" is the shape every coupling starts
// out as. `scripts/audit-clean-host.mjs` now walks the import graph from `main.ts` and fails
// if any module reachable on the default route reaches `race-scene.ts` at all.
//
// `race-scene.ts` re-exports both types from here rather than redeclaring them, so there is
// exactly one definition and the legacy player is unchanged.

/**
 * One cell of a grid level.
 *
 * The vocabulary is the recovered BallZ map editor's, not an invention: floor and wall are
 * the structure, `start`/`finish` bound the run, `ring` and `half` are the collectible and
 * halfway markers, and `hazard`/`fire`/`ice` are the surface modifiers.
 */
export type MapEditorTile = "floor" | "wall" | "start" | "ring" | "half" | "finish" | "hazard" | "fire" | "ice";

/** An in-progress grid level: dimensions, cell size, and `width * height` tiles in row order. */
export type MapEditorDraft = {
  width: number;
  height: number;
  cellSize: number;
  tiles: MapEditorTile[];
};

/**
 * Every tile, in the editor's palette order. Typed as a readonly tuple of `MapEditorTile` so
 * adding a member to the union without adding it here is a compile error rather than a tile
 * that silently cannot be painted.
 */
export const MAP_EDITOR_TILES: readonly MapEditorTile[] = [
  "floor", "wall", "start", "ring", "half", "finish", "hazard", "fire", "ice",
] as const;

export const isMapEditorTile = (value: unknown): value is MapEditorTile =>
  typeof value === "string" && (MAP_EDITOR_TILES as readonly string[]).includes(value);

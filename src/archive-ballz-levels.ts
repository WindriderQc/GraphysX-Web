import type { GraphysXAgentWorldApi } from "./agent-world-runtime";

/**
 * The recovered BallZ arenas, rebuilt as ordinary platform levels.
 *
 * ## What this is, and what it is deliberately not
 *
 * This module contains **no geometry and no three.js**. It carries two authored *tile grids*
 * recovered from the archive, a declared symbol translation from the 2015 `BuildASCIIScene`
 * alphabet into this platform's nine-tile vocabulary, and one function that pushes the result
 * through `api.levels.importAscii`. From that point on there is nothing archive-shaped left:
 * the levels sit in the ordinary level library, appear in the Games & Playgrounds shelf and
 * the level workbench, are editable cell by cell, and are materialised by `composeBallzLevel`
 * exactly like a level someone painted this afternoon. That is the whole point — §10's
 * pipeline ends at *vocabulary*, not at a special archive surface.
 *
 * The legacy viewers in this repo (`ballz2011-level1-environment.ts` and its siblings) are the
 * counter-example and were consulted rather than ported: they mutate the scene graph directly
 * and produce inspection geometry with no physics. Nothing from them is reachable from here.
 *
 * ## Where the layouts come from
 *
 * The authoritative bytes are three StockRoom files — `Level1_base.ASCII`, `Level2_base.ASCII`,
 * `Level3_base.ASCII` — plus `levelList.xml`, which live on the external Datalake
 * (`E:/Media/Datalake/Tech/StockRoom`) and are in **neither repository**. What both repos hold
 * is the workshop's verified transcription (`GraphysX/web-prototype/src/race-definitions.ts`,
 * `classic-level-style.ts`) and, crucially, an exact **symbol census** asserted by
 * `GraphysX/web-prototype/tools/verify-classic-suzanne-fidelity.mjs`. So the honest provenance
 * claim is not "these are the archive bytes" — it is "these are the archive layouts, and their
 * symbol census is independently recorded and re-asserted here". `scripts/smoke-archive-levels.mjs`
 * checks every grid below against that census before it will pass, so a typo in a transcription
 * is a red build rather than a silent corruption of the record.
 *
 * ## The 2015 alphabet, and what each symbol becomes
 *
 * | archive | meaning (per `Scene.cpp::BuildASCIIScene`)            | platform tile |
 * |---------|------------------------------------------------------|---------------|
 * | `T`/`Z` | level-specific solid one-unit cube                    | `#` wall      |
 * | `.`     | empty floor                                           | `.` floor     |
 * | `R`     | checkpoint ring                                       | `o` ring      |
 * | `@`     | player spawn                                          | `S` start     |
 * | `F`/`f` | the two posts of the finish line                      | `F` / dropped |
 * | `H`/`h` | the two posts of the halfway line                     | `H` / dropped |
 *
 * `M`/`r`/`$` (Level 3's alphabet) are **not** in this table on purpose; see
 * `ARCHIVE_BALLZ_NOT_REVIVED` below.
 */

/** How an archive symbol grid is translated. Declared as data so the smoke can re-derive it. */
export type ArchiveSymbolMapping = {
  /** The archive symbol. */
  symbol: string;
  /** The platform tile character it becomes, or `null` when it is dropped to floor. */
  tile: string | null;
  note: string;
};

export type ArchiveProvenance = {
  /** Human name of the archived scene. */
  scene: string;
  /** Authoritative source files, by their archive-relative path. */
  sourcePaths: readonly string[];
  /**
   * Where the bytes actually are. Recorded rather than implied: they are on the external
   * Datalake, so no SHA is quoted here — quoting one we cannot recompute would be theatre.
   */
  sourceLocation: string;
  /** The transcription this module was built from, in the read-only workshop. */
  transcribedFrom: readonly string[];
  /** The independent census that pins the transcription, re-asserted by the smoke. */
  census: Readonly<Record<string, number>>;
  /** Native authored units: the 2015 builder placed one symbol per one-unit cube. */
  nativeUnits: string;
  /** Native grid extent in archive units. */
  nativeBounds: { width: number; height: number; unit: string };
  /** The conversion applied to reach the shipped level. */
  conversion: string;
  /** Facts from `levelList.xml` that the platform does or does not honour. */
  levelListFacts: Readonly<Record<string, string | number>>;
};

export type ArchiveFidelity = {
  /** Carried across exactly, and machine-checked where possible. */
  faithful: readonly string[];
  /** Authored connective tissue — real design decisions made here, not recovered. */
  inferred: readonly string[];
  /** Present in the record, knowingly not reproduced, with the reason. */
  deliberatelyAbsent: readonly string[];
};

export type ArchiveBallzLevel = {
  /** Level library id. Namespaced so it can never collide with a hand-painted level. */
  id: string;
  label: string;
  /** World units per cell. */
  cellSize: number;
  /** The archive symbol grid, verbatim. This is the record; everything else is derived. */
  archiveRows: readonly string[];
  /** The level-specific solid symbol (`T`, `Z`, …). */
  solidSymbol: string;
  /** Symbol translation, applied by `toPlatformRows`. */
  mapping: readonly ArchiveSymbolMapping[];
  /**
   * Whether a one-cell containment wall is added around the authored grid. The archive floor
   * was a finite slab you could roll off; a platform grid level has a continuous floor and no
   * void, so an unwalled edge is not "fall out and die", it is "the ball leaves the world and
   * never comes back". See each level's `inferred` notes.
   */
  frame: boolean;
  provenance: ArchiveProvenance;
  fidelity: ArchiveFidelity;
  /** Machine-readable departures, in the style of the particle presets. */
  deviations: readonly { code: string; detail: string }[];
};

/**
 * Shared between both levels: the finish and halfway *lines* of the 2015 courses are each
 * defined by a pair of posts (`F`+`f`, `H`+`h`), and `race-definitions.ts` averages the pair's
 * z to get a lap line spanning the whole arena. A platform grid expresses a gate as one cell,
 * so the uppercase post's archived cell becomes the gate and the lowercase companion is
 * dropped to floor. That is a genuine change to how the course plays — an unmissable line
 * becomes a place you must aim at — and it is recorded on every level rather than smoothed
 * over.
 */
const GATE_DEVIATIONS = [
  {
    code: "gate-line-collapsed-to-cell",
    detail:
      "The archive finish and halfway gates are lines across the arena defined by two posts each. " +
      "The platform grid has one `F` and one `H` cell, so each gate sits on its uppercase post's " +
      "archived cell and the crossing is local instead of arena-wide.",
  },
  {
    code: "companion-posts-dropped",
    detail:
      "The lowercase companion posts (`f`, `h`) become plain floor. In the archive they are solid " +
      "0.2-radius pillars; the grid's only solid-obstacle tile is `!` hazard, whose red glow would " +
      "misrepresent a lap post as a danger, so they are dropped rather than mislabelled.",
  },
  {
    code: "laps-reduced-to-one",
    detail:
      "`levelList.xml` sets `nbrTour` = 3 for every classic level. `composeBallzLevel` emits " +
      "`laps: 1`, and this module may not edit it, so the shipped course is one lap of a three-lap race.",
  },
  {
    code: "sky-not-per-level",
    detail:
      "`levelList.xml` binds Level 1 to ClearBlue and Level 2 to LostValley. `composeBallzLevel` pins " +
      "`sky: \"lostvalley\"` for every materialised level, so Level 2 matches its record by coincidence " +
      "and Level 1 does not. PRODUCT_SPEC §14.5 separately records that the surviving ClearBlue set is " +
      "512 px and reads muddy at play angles, so this is not a loss worth forcing.",
  },
  {
    code: "floor-texture-not-per-level",
    detail:
      "Archived floor bindings (Level 1 `Alien01_B_diff.bmp` + normal map, Level 2 `Checkerboard.png`) " +
      "are not applied: the materialiser gives every level the archive `Damier.jpg` checker. Level 2's " +
      "archived floor *is* a checkerboard, so it lands right; Level 1's alien plate does not.",
  },
  {
    code: "ball-feel-not-recovered",
    detail:
      "The 2015 ball is mass 1250 under gravity -25 with torque steering and a per-frame angular brake " +
      "(RECUPERATION_LEDGER §2). The platform ball is mass 1.6 under -9.81 with impulse steering. The " +
      "layout is recovered; the handling is the platform's own and is not claimed as archive feel.",
  },
  {
    code: "best-time-not-shown",
    detail:
      "`levelList.xml` carries a real `ScoreBest` per level. There is no scoreboard in the rules " +
      "vocabulary, so the archived time is recorded here as provenance and shown nowhere.",
  },
] as const;

const CLASSIC_MAPPING = (solid: string): ArchiveSymbolMapping[] => [
  { symbol: solid, tile: "#", note: `Level-specific solid one-unit cube (\`${solid}\`) becomes a wall tile.` },
  { symbol: ".", tile: ".", note: "Empty floor stays floor." },
  { symbol: "R", tile: "o", note: "Uppercase checkpoint ring becomes a collectible ring." },
  { symbol: "@", tile: "S", note: "Player spawn becomes the single start tile." },
  { symbol: "F", tile: "F", note: "Uppercase finish post becomes the finish gate." },
  { symbol: "f", tile: null, note: "Lowercase finish post dropped to floor; the grid has one finish cell." },
  { symbol: "H", tile: "H", note: "Uppercase halfway post becomes the halfway gate." },
  { symbol: "h", tile: null, note: "Lowercase halfway post dropped to floor; the grid has one halfway cell." },
];

/**
 * Archive Level 1 — the "T" course.
 *
 * A 20x20 open arena built around a central diamond of `T` blocks, with the twenty checkpoints
 * threaded down both flanks of it. The route this produces on the platform is a genuine lap:
 * you start at the bottom-left, work the ring chain up through the diamond's shoulders, take
 * the halfway gate in the far top-right corner, and come back down to a finish two cells from
 * where you started. That shape is the archive's, not ours — it is a three-lap course and the
 * finish sits beside the start because that is what a lap line is.
 */
const ARCHIVE_LEVEL_1: ArchiveBallzLevel = {
  id: "archive-ballz-level1",
  label: "Archive Level 1 — T Course",
  // Smaller than the 2.6 default. Gravity is fixed at -9.81 while the steering impulse scales
  // with `cellSize`, so a smaller cell is relatively heavier gravity: the ball settles and
  // corners crisply instead of floating across a 52-unit board. Checked by eye at 2.6 and 2.4.
  cellSize: 2.4,
  archiveRows: [
    "........TTTTTTTTTTTT",
    "..................HT",
    "...................T",
    "............R......T",
    "........R..R...h...T",
    "T...TTT..RR..TTT...T",
    "T....TTT....TTT....T",
    "T...R.TTT..TTT.....T",
    "T....R.TTTTTT.R....T",
    "T.....R.TTTT.R.....T",
    "T.....R.TTTT.R.....T",
    "T....R.TTTTTT.R....T",
    "T.....TTT..TTT.R...T",
    "T....TTT....TTT....T",
    "T...TTT..RR..TTT....",
    "Tf..F...R..R........",
    "T......R............",
    "T..@................",
    "T...................",
    "TTTTTTTTTTT........."
  ],
  solidSymbol: "T",
  mapping: CLASSIC_MAPPING("T"),
  // 26 of Level 1's 76 perimeter cells are authored floor — the arena's own wall run is
  // incomplete on three sides. This is not damage: the archive floor is a finite slab and the
  // 2015 course simply let you leave it. A grid level has a continuous slab and no void to fall
  // into, so an open edge means the ball rolls off the collider and is gone. Framed rather than
  // overwritten, so all 400 authored cells survive verbatim.
  frame: true,
  provenance: {
    scene: "Archive Level 1 — ASCII (GraphysX 2015 classic set)",
    sourcePaths: ["StockRoom/Level1_base.ASCII", "StockRoom/levelList.xml", "StockRoom/screenShotLevel1.png"],
    sourceLocation:
      "E:/Media/Datalake/Tech/StockRoom — external Datalake, present in neither repository. No SHA is quoted because none can be recomputed from here.",
    transcribedFrom: [
      "GraphysX/web-prototype/src/race-definitions.ts::archiveLevel1",
      "GraphysX/web-prototype/src/classic-level-style.ts::stockroom-level1",
      "GraphysX/web-prototype/tools/verify-classic-suzanne-fidelity.mjs (symbol census)",
    ],
    census: { T: 106, R: 20, "@": 1, F: 1, f: 1, H: 1, h: 1 },
    nativeUnits: "One symbol = one 1x1x1 unit cube; ball radius 0.3 units (Scene.cpp::BuildASCIIScene).",
    nativeBounds: { width: 20, height: 20, unit: "archive units (1 per cell)" },
    conversion:
      "Symbol translation only, then a one-cell containment frame; grid scaled from 1 to 2.4 world units per cell (x2.4 uniform). No cell of the authored 20x20 is altered.",
    levelListFacts: {
      sky: "ClearBlue",
      floorTexture: "\\Texture\\Alien\\Alien01_B_diff.bmp",
      floorNormals: "\\Texture\\Alien\\Alien01_B_normal.bmp",
      laps: 3,
      humans: 0,
      scoreBestMs: 29815.1465,
    },
  },
  fidelity: {
    faithful: [
      "All 400 authored cells, verbatim and in place: 106 `T` solids, 20 `R` checkpoints, one `@` spawn, one each of `F`/`f`/`H`/`h`.",
      "Ring count and ring positions — every one of the twenty archived checkpoints is a collectible ring at its archived cell.",
      "The spawn cell, and the finish/halfway gates at the archived cells of their uppercase posts.",
      "The course's topology: a central solid diamond with ring chains down both flanks, a far-corner halfway gate, and a finish beside the start.",
      "Square, 1:1 cell aspect — the grid is scaled uniformly, never stretched.",
    ],
    inferred: [
      "The one-cell containment frame around the authored grid (22x22 shipped, 20x20 authored). Authored purely so the ball cannot leave the collider; nothing inside it is invented.",
      "cellSize 2.4. The archive's 1-unit cell has no meaning against this platform's fixed gravity, so it is chosen for feel and checked by eye.",
      "The rings being *required* to open the finish. `levelList.xml` records a 10-second ring bonus, i.e. rings were optional time in the archive; the platform's rules block makes collectibles a gate. A recovered layout, a platform rule.",
    ],
    deliberatelyAbsent: [
      "The archived ClearBlue sky and the Alien01_B floor/normal binding — the materialiser owns both and this module may not edit it.",
      "Three laps, the archived best time, and the 10-second ring bonus — no lap-count or scoreboard field is reachable from a grid level.",
      "The 2015 ball tuning (mass 1250, gravity -25, torque steering, angular brake).",
      "The four lap posts as physical pillars.",
    ],
  },
  deviations: [
    ...GATE_DEVIATIONS,
    {
      code: "containment-frame-added",
      detail:
        "26 of the authored perimeter cells are open floor, so the archive arena has no closed boundary. " +
        "A one-cell wall frame is added around the outside, growing the shipped grid to 22x22. The 400 " +
        "authored cells are unchanged; nothing was overwritten to achieve containment.",
    },
    {
      code: "checker-alignment-drifts",
      detail:
        "`composeBallzLevel` aligns the floor checker as `width / 20`, which is exactly one square per cell " +
        "at 20 wide. The added frame makes this level 22 wide, so its checker runs 1.1 squares per cell and " +
        "no longer pins to the grid. Cosmetic, and the price of not overwriting authored cells.",
    },
    {
      code: "rings-required-not-bonus",
      detail:
        "Archive rings were a 10-second time bonus; here all twenty must be collected before the finish counts.",
    },
  ],
};

/**
 * Archive Level 2 — the "Z" course.
 *
 * A 20x20 concentric box maze: an outer ring corridor, a heavy `Z` inner shell, and a twin
 * chamber inside that, with the twenty checkpoints laid out symmetrically in the inner cells.
 * It is the better-shaped of the two as a platform level for one specific reason — **its
 * perimeter is already closed**, all 76 border cells are `Z`, so it ships at exactly its
 * authored 20x20 with no frame, no overwrite and no invented cell at all. Its archived sky
 * (LostValley) and archived floor (a checkerboard) also happen to be what the materialiser
 * gives every level, so this is the closest the platform gets to the record.
 */
const ARCHIVE_LEVEL_2: ArchiveBallzLevel = {
  id: "archive-ballz-level2",
  label: "Archive Level 2 — Z Maze",
  cellSize: 2.4,
  archiveRows: [
    "ZZZZZZZZZZZZZZZZZZZZ",
    "Z.................HZ",
    "Z.....R..ZZ..R.....Z",
    "Z....Z...ZZ...Zh...Z",
    "Z....Z.R.ZZ.R.Z....Z",
    "Z....Z...ZZ...Z....Z",
    "Z....Z.R.ZZ.R.Z....Z",
    "Z....Z........Z....Z",
    "Z....Z.R.RR.R.Z....Z",
    "Z....ZZZZZZZZZZ....Z",
    "Z....ZZZZZZZZZZ....Z",
    "Z....Z.R.RR.R.Z....Z",
    "Z....Z........Z....Z",
    "Z....Z.R.ZZ.R.Z....Z",
    "Z....Z...ZZ...Z....Z",
    "Zf..FZ.R.ZZ.R.Z....Z",
    "Z....Z...ZZ...Z....Z",
    "Z..@..R..ZZ..R.....Z",
    "Z..................Z",
    "ZZZZZZZZZZZZZZZZZZZZ"
  ],
  solidSymbol: "Z",
  mapping: CLASSIC_MAPPING("Z"),
  // No frame: every one of the 76 perimeter cells is already `Z`. Asserted by the smoke, so if
  // a future edit opens the boundary the build says so instead of losing the ball.
  frame: false,
  provenance: {
    scene: "Archive Level 2 — ASCII (GraphysX 2015 classic set)",
    sourcePaths: ["StockRoom/Level2_base.ASCII", "StockRoom/levelList.xml", "StockRoom/screenShotLevel2.png"],
    sourceLocation:
      "E:/Media/Datalake/Tech/StockRoom — external Datalake, present in neither repository. No SHA is quoted because none can be recomputed from here.",
    transcribedFrom: [
      "GraphysX/web-prototype/src/race-definitions.ts::archiveLevel2",
      "GraphysX/web-prototype/src/classic-level-style.ts::stockroom-level2",
      "GraphysX/web-prototype/tools/verify-classic-suzanne-fidelity.mjs (symbol census)",
    ],
    census: { Z: 140, R: 20, "@": 1, F: 1, f: 1, H: 1, h: 1 },
    nativeUnits: "One symbol = one 1x1x1 unit cube; ball radius 0.3 units (Scene.cpp::BuildASCIIScene).",
    nativeBounds: { width: 20, height: 20, unit: "archive units (1 per cell)" },
    conversion:
      "Symbol translation only. No frame, no overwrite, no added cell; grid scaled from 1 to 2.4 world units per cell (x2.4 uniform).",
    levelListFacts: {
      sky: "LostValley",
      floorTexture: "Checkerboard.png",
      floorNormals: "(none)",
      laps: 3,
      humans: 10,
      scoreBestMs: 122428.984,
    },
  },
  fidelity: {
    faithful: [
      "The entire 20x20 grid, cell for cell, with no addition and no removal: 140 `Z` solids, 20 `R` checkpoints, one `@` spawn, one each of `F`/`f`/`H`/`h`.",
      "The closed perimeter, which is the archive's own — asserted rather than assumed.",
      "The concentric-shell topology and the symmetric checkpoint layout inside it.",
      "The archived LostValley sky, matched (by the materialiser's fixed choice rather than by selection).",
      "A checkerboard floor, which is what `levelList.xml` binds this level to.",
      "Square, 1:1 cell aspect — the grid is scaled uniformly, never stretched.",
    ],
    inferred: [
      "cellSize 2.4, chosen for feel; the archive's 1-unit cell has no meaning against this platform's fixed gravity.",
      "The rings being *required* to open the finish rather than a 10-second time bonus.",
    ],
    deliberatelyAbsent: [
      "The ten `iNumHuman` proxies the archive requests for this level — there is no crowd entity in the v2 vocabulary, and standing boxes in for people would be theatre.",
      "Three laps, the archived best time, and the ring bonus.",
      "The 2015 ball tuning, and the lap posts as physical pillars.",
    ],
  },
  deviations: [
    ...GATE_DEVIATIONS,
    {
      code: "humans-absent",
      detail: "`levelList.xml` requests 10 human proxies for this level. No crowd/agent entity exists in the v2 vocabulary, so none are placed.",
    },
    {
      code: "rings-required-not-bonus",
      detail: "Archive rings were a 10-second time bonus; here all twenty must be collected before the finish counts.",
    },
  ],
};

export const ARCHIVE_BALLZ_LEVELS: readonly ArchiveBallzLevel[] = [ARCHIVE_LEVEL_1, ARCHIVE_LEVEL_2];

/**
 * Recovered BallZ material that was examined and **not** turned into a level.
 *
 * §11: unfinished things are simply not headline destinations, and a record that cannot honestly
 * become a level should say so rather than be forced into one. Exported as data so the reasoning
 * ships with the code instead of living in a commit message.
 */
export const ARCHIVE_BALLZ_NOT_REVIVED = [
  {
    record: "Archive Level 3 — ASCII (`StockRoom/Level3_base.ASCII`)",
    what: "A 20x19 authored grid in a different alphabet: `M` is a solid *platform you drive on*, `r` is a platform carrying an elevated checkpoint, `$` is the solid spawn tile, and `.` is empty space.",
    verdict: "not revivable as a grid level",
    why:
      "Its semantics are inverted relative to this platform's grid. Here `.` is the floor and `#` is an obstacle; there `M` is the floor and `.` is a void you fall through. A grid level has one continuous floor slab and no void, so the level's actual mechanic — a raised catwalk you can fall off — cannot exist. Mapping `M`->floor and `.`->wall would preserve the route drawing while deleting the game, and shipping that as 'recovered Level 3' would be exactly the theatre §11 forbids. It is a real candidate for a composed v2 scene later, where raised platforms over a drop are expressible.",
  },
  {
    record: "`src/legacy/ballz2011-level1.json` (also `slide-long1`, byte-identical)",
    what: "One TVM object `Line01`: 828 vertices, 1,648 triangles, two adjacent closed 414-vertex solids with an 0.018-unit X seam. Archive bounds 210.16 x 498.73 x 1135.44 units; `displayScale` 0.1, `normalization.status: \"inferred-display-only\"`.",
    verdict: "not revivable as gameplay",
    why:
      "The record's own `interpretation` block says it: 'No archived runtime source was found loading Level1.TVM, so spawn, rules, camera, collision settings, and finish semantics remain unknown.' It also has one material slot, no usable UV map and no embedded texture name — `materialEvidence.assessment` states any coloured or textured presentation is necessarily inferred. It is a long two-lane ramp mesh with no gameplay recorded anywhere. It is honest inspection geometry and nothing more; it is emphatically not a tile grid.",
  },
  {
    record: "`src/legacy/ballz-slide-track-family.json` and `slide-level.json`",
    what: "An audit of nine hashed slide/track meshes plus the decoded 'Great Slide' (Level0/SlideLarge, 527 x 113 x 164 archive units).",
    verdict: "composed v2 scene, if anything — not a grid level",
    why:
      "A slide is a single long curved ramp whose whole content is elevation change. A 2D tile grid has no height axis at all, so putting a slide through `importAscii` would flatten away the only thing it is. The audit's own `remainingGallery.purpose` is 'Exact-geometry archive visits only. No gameplay, spawn, physics or objectives are inferred.' The route to reviving this is a composed v2 scene of ramps carrying a `rules` block — real work, out of scope here, and named rather than faked.",
  },
  {
    record: "`src/legacy/ballz-xml-worlds.json`",
    what: "Two serialized CScene3D compositions, `MyWorld` (4 objects) and `MyWorld - Copie`.",
    verdict: "not revivable as gameplay",
    why:
      "The record classifies them itself: `assembledDiscoverableWorldCount: 0`, 'editor/loader tests rather than finished exploration worlds', and `MyWorld` contains two malformed DUPLICATE records with `invalid-duplicate-target` resolution. A four-object editor save with a floating airplane is not a level.",
  },
  {
    record: "`src/legacy/ballz-blender-level1-export.json`",
    what: "A 743-byte FBX export *manifest* — Blender 2.79, axis forward -Z / up Y, source and output SHAs. No geometry at all.",
    verdict: "not revivable as gameplay",
    why:
      "It is provenance metadata for a mesh file, not a scene. The census independently records the Blender Level 1 prototype as a geometry visit that 'is not turned into a race because no host, spawn, physics, controls, checkpoints, rules or objective survives'.",
  },
  {
    record: "`src/legacy/suzanne1-ascii-scene.json` / `suzanne2-ascii-scene.json`",
    what: "Genuine 40x40 authored ASCII arenas, decoded *into this repository* with source SHAs (Suzanne1.ASCII `64ec6746…`) — 208 walls, 45 chain assemblies, 15 rings, 3 pistons, gates and a spawn.",
    verdict: "revivable as a grid level, deliberately not shipped in this pass",
    why:
      "This is the one skipped record that is not a 'cannot'. It is within the 64x64 / 4096-cell limits and its provenance is the strongest of anything here — the bytes are in-repo. It is held back because 1,319 of its 1,600 cells are empty floor with only 15 rings scattered across them: at any playable cell size it is a very large, very sparse plain, and its chains and pistons (the things that make it *that* arena) have no tile in this vocabulary, so a grid conversion would ship the emptiness without the content. Shipping it would break the brief's own bar — playable is not the same as worth playing. It is the strongest candidate for the next pass, most likely as a composed v2 scene where the chains and pistons can exist.",
  },
] as const;

/**
 * Translates one archive symbol grid into platform ASCII rows.
 *
 * Deliberately derived rather than hand-written twice: the archive grid above is the record and
 * this is the only thing that produces the level the player rolls around in, so a transcription
 * checked against the census is a level checked against the census.
 */
export function toPlatformRows(level: ArchiveBallzLevel): string[] {
  const table = new Map(level.mapping.map((entry) => [entry.symbol, entry.tile ?? "."]));
  const rows = level.archiveRows.map((row, y) =>
    [...row]
      .map((symbol, x) => {
        const tile = table.get(symbol);
        if (tile === undefined) throw new Error(`${level.id}: no mapping for archive symbol '${symbol}' at ${x},${y}`);
        return tile;
      })
      .join("")
  );
  if (!level.frame) return rows;
  const width = (rows[0]?.length ?? 0) + 2;
  const bar = "#".repeat(width);
  return [bar, ...rows.map((row) => `#${row}#`), bar];
}

export type SeedArchiveResult = {
  seeded: string[];
  /** Already present — a visitor who edited one keeps their version. */
  skipped: string[];
  errors: { id: string; error: string }[];
};

/**
 * Puts the recovered levels into the level library.
 *
 * One call, and everything downstream is automatic: `games-shelf.ts` lists the library rather
 * than a curated manifest, so both levels appear on the Games & Playgrounds shelf, and the level
 * workbench can open and edit them. Idempotent, and it never overwrites — a visitor who has
 * edited a recovered level keeps their edit, exactly as the shelf's own seed behaves.
 */
export function seedArchiveBallzLevels(api: GraphysXAgentWorldApi): SeedArchiveResult {
  const result: SeedArchiveResult = { seeded: [], skipped: [], errors: [] };
  for (const level of ARCHIVE_BALLZ_LEVELS) {
    if (api.levels.get(level.id)) {
      result.skipped.push(level.id);
      continue;
    }
    try {
      const imported = api.levels.importAscii({
        id: level.id,
        label: level.label,
        cellSize: level.cellSize,
        rows: toPlatformRows(level),
      });
      if (imported.ok) result.seeded.push(level.id);
      else result.errors.push({ id: level.id, error: imported.error ?? "import failed" });
    } catch (error) {
      result.errors.push({ id: level.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

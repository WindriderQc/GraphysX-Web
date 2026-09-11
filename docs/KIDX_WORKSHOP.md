# KidX LEGO workshop

Open `?app=ev3-lab` for **Premier trajet**, then **Atelier** for the three sections.
`?app=ev3-lab&view=atelier` opens the workshop directly. The missions and guide controls
are French; the source PDFs keep their original text and illustrations.

## What is available

| Section | Current coverage |
| --- | --- |
| Missions | Five original KidX movement exercises: Premier trajet, Un quart de tour, À gauche toute, La livraison, Retour à la base. The last two require a yellow checkpoint before the blue finish. |
| Notices LEGO | 138 indexed PDFs, including the owner's original kit references and the 120 distinct PDF links found in the official Education catalog. Covers, search, family/type filters, PDF canvas, previous/next page, direct page entry, zoom and saved reading position. |
| Construire en 3D | TRACK3R: 28 assembly stages, 170 logical parts. SPIK3R: 56 stages, 349 logical parts. Native geometry, current-stage highlighting, parts inventory, rotation, zoom, assembly separation, full-model preview and saved stage. |

The movement exercises are adaptations of
[LEGO Robot Trainer: Moves and Turns](https://education.lego.com/en-us/lessons/ev3-robot-trainer/1-moves-and-turns/).
They use the existing four blocks and six-block limit. They do not reproduce all seven
Robot Trainer lessons, sensor programs, or the five hardware missions of each 31313 robot.
The existing full seven-station EV3 scene remains in Browse Scenes.

The simulator has a wheeled teaching chassis built from detailed LDraw EV3 parts; see
[KIDX_VISUALS.md](KIDX_VISUALS.md). The construction views use separate source assemblies
with no floor, desk or wall geometry, so the underside stays visible when orbiting.
Their assembly ordering comes from LDraw and can differ from the LEGO PDF pages.
They show groups of pieces per stage, not a PDF-derived, validated instruction for every
individual connector. Motors, sensors and generated cables are indivisible parts; their
internal CAD geometry is not an instruction to dismantle them. Stickers and conditional
edge lines are omitted. Use **Notice LEGO** to check small connections and cable routing.
Other models have the original PDF reader; they do not yet have 3D assembly data.

## Local documents

Original PDFs stay under ignored `docs/Lego/`. They are not copied into the release or
committed to Git. `src/kidx-document-catalog.json` records filenames, page counts, size,
SHA-256 and source links; `docs/kidx-education-sources.json` records the official download
catalog. Small cover previews ship in `public/assets/kidx/library/`.

```sh
# Python with pypdf and Pillow, plus pdftoppm (Poppler) on PATH.
python scripts/import-kidx-documents.py --download
# Re-index only the existing local cache:
python scripts/import-kidx-documents.py

npm run dev
# Or, after a production build when no other verification owns the machine:
npm run build
npm run serve:kidx
```

The dev server mounts the cache automatically. `serve:kidx` serves `dist` and the cache
on loopback port 4177; pass another release directory as its first argument and use
`PORT` to select another port. `/kidx-document-status` reports actual local availability.
`/kidx-documents/<catalog-id>.pdf` accepts GET/HEAD only, with catalog-selected filenames.

On static hosting without that route, an official source URL is tried where known.
If absent or unavailable, the reader offers a local file picker with the expected PDF
filename. Selected bytes stay in the browser. Local files are not retained after leaving
the reader, so static-only hosting may need the file selected again. Remote availability
is not required when the local cache is mounted.

Reading positions use `graphysx:kidx:reading:v1`; model positions use
`graphysx:kidx:build:<model>:v1`. Named programs retain their existing versioned library.
These stores are per browser and do not sync across devices. Clearing browser data clears
progress. A storage failure does not prevent reading or stepping through a model.

## Rebuilding the CAD assets

Source models are by [Philippe Hurbain (Philo)](https://forums.ldraw.org/thread-23742.html):
[TRACK3R MPD](https://www.brickshelf.com/gallery/Philo/SetModels/Set31313/31313_-_mindstorms_ev3_-_track3r.mpd)
and [SPIK3R MPD](https://www.brickshelf.com/gallery/Philo/SetModels/Set31313/31313_-_mindstorms_ev3_-_spike3r.mpd).
Use the [official LDraw parts library](https://library.ldraw.org/library/updates/complete.zip)
with `LDConfig.ldr`, `parts/` and `p/` under its extracted root.

```sh
node scripts/import-kidx-ldraw.mjs output/kidx/ldraw output/kidx/31313_-_mindstorms_ev3_-_track3r.mpd track3r
node scripts/import-kidx-ldraw.mjs output/kidx/ldraw output/kidx/31313_-_mindstorms_ev3_-_spike3r.mpd spike3r
```

The converter resolves dependencies locally, retains their authors/license declarations,
uses Three's LDraw loader, groups geometry by assembly stage and color, and exports native
mesh JSON. It normalizes +Y up, the ground at zero and maximum horizontal span to 5.4 world
units. Authored vertex normals preserve CAD edges without expensive reconstruction in the
browser. Shared CAD cleanup repairs cancelled normals and removes collapsed faces before
export. The loader validates optional normals; older meshes retain their creased-normal
fallback. Only requested stages load. A model's existing material-slot API owns highlights;
the ordinary scene API owns all placement and visibility. The shared host frame loop is
the only frame loop. Opaque menus/readers unload the previous 3D scene.

Per-model `public/assets/kidx/builds/<model>/credits.json` retains source URLs, changes and
every dependent part's attribution. The model declares CCAL 2.0 (CC BY 2.0); current parts
declare their individual licenses, including CC BY 4.0. The small PDF covers and originals
remain LEGO source material; this project does not claim authorship of them.

To add another 3D guide, obtain licensed assembly data, preserve its provenance, map real
kit components and validate stage order/connections against the matching PDF. A PDF's
illustrations alone do not supply 3D part coordinates or a machine-readable assembly graph.

## Verification

`npm test` covers catalog search/progress and the restricted document route. The existing
EV3 lab and named-program smokes retain their behavior assertions with French copy.
`npm run smoke:kidx-missions` covers real movement solutions/checkpoints.
`npm run smoke:kidx-workshop` covers PDF rendering,
navigation/zoom/persistence, both complete CAD models, step reversal/highlighting, assembly
separation, source normals and 800x480/390x844 controls. Without a local cache, its PDF input
test uses a clearly self-authored two-page fixture, not counterfeit LEGO instructions.

Inspect screenshots in the configured `SMOKE_ARTIFACTS` directory. Follow the machine-wide
verification lock in `CLAUDE.md`; an isolated preview does not establish deployment or
physical EV3/Mint acceptance.

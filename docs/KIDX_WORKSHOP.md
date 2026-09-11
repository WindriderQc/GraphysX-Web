# KidX LEGO workshop

Open `?app=ev3-lab` for **Premier trajet**, then **Atelier** for the three sections.
`?app=ev3-lab&view=atelier` opens the workshop directly. The missions and guide controls
are French; the source PDFs keep their original text and illustrations.

## What is available

| Section | Current coverage |
| --- | --- |
| Missions | Eleven exercises: the five original routes plus reverse parking, pushing cargo, distance-triggered retreat, a physical ramp, color detection and contact-triggered retreat. The cargo is the delivery subject; sensor return routes require an outbound checkpoint. Completed missions are saved locally. |
| Notices LEGO | 138 indexed PDFs, including the owner's original kit references and the 120 distinct PDF links found in the official Education catalog. Covers, search, family/type filters, PDF canvas, previous/next page, direct page entry, zoom and saved reading position. |
| Construire en 3D | TRACK3R: 28 stages/170 parts. SPIK3R: 56 stages/349 parts. Individual CAD pieces animate toward translucent destinations, with pause, slow replay and part selection. Smooth separation, clear underside, saved stage, French Nestor requests, shared build rooms and model-related challenges. |
| Blocs avancés | Regulated left/right motor speed, duration, wait, repeat, conditionals and drive-until-sensor blocks; nested editor, save/open, active block, physical pause/step and live EV3 sensor readout. Optional locally synthesized motor sound. |
| Comprendre en 3D | A 12-second native CAD demonstration of 8:24 gears, opposing rotation, a 3:1 speed ratio, pause, slow motion, reverse and replay. |

The movement exercises are adaptations of
[LEGO Robot Trainer: Moves and Turns](https://education.lego.com/en-us/lessons/ev3-robot-trainer/1-moves-and-turns/).
The simple program retains a six-block limit and adds Backward as its fifth block type.
The richer laboratory is bounded at 64 instructions, four nesting levels and three minutes
per execution, with explicit timeouts for sensor waits. These are original learning
exercises, not a reproduction of every official hardware lesson.
The existing full seven-station EV3 scene remains in Browse Scenes.

## Arriving in a mission

All eleven missions open with a French Nestor guide. It explains the next action and
outlines its actual button in gold. Simple missions count the child's blocks and follow
the suggested sequence; choosing a different program keeps that program intact and offers
an experiment. Advanced missions lead into **Blocs avancés**, then **Utiliser l’exemple**
and **Démarrer**. The instruction continues inside the laboratory.

**Comprendre le parcours** explains each scene's colored zones, required checkpoints, robot-relative
turns or sensor values. The initial programming view remains paused while the child reads.
The guide collapses when execution starts; **Comment jouer** reopens it, with advice based
on the real attempt or verdict. Closing the guide returns keyboard focus to that button.
Manual driving explains holding and releasing the controls. Compact layouts keep the help
scrollable and the movement controls reachable.

**Blocs avancés** describes its contents directly on the entry button: motors, sensors and
loops. **Arrêter le robot** is an immediate brake that preserves both editors' blocks; it
is disabled with **Déjà à l’arrêt** before any command or after stopping. It stays available
for a running or paused program and after releasing a manual direction, when the chassis
can still coast. A fresh direction resumes manual driving after braking. The separate
**Arrêt** block only queues an instruction in the simple program; **Comprendre le parcours** explains
the distinction. Inside the advanced editor, **Arrêter ce programme** cancels its execution.
Entering **Piloter** brakes residual program momentum before handing control to the child.

## Understanding an attempt

The six simple movement missions offer **Comprendre mon trajet** after a simple program
finishes, reaches the goal or is stopped. Its top-down drawing records the actual rover
positions and headings from the shared physics/control loop. Select a numbered block to
highlight its measured path and scrub from its start to its observed end. Distances use the
same scale as the EV3 readout. The body outline uses the mission's collision footprint, so
touching the edge of blue or red remains visible even when the robot's center is outside it.
Turn-only and interrupted instructions retain their observed
rotation; unexecuted instructions are marked **Pas encore joué**.

The report is read-only: browsing, scrubbing and requesting hints do not steer the robot,
spend mission time or change the program. Three optional Nestor hints move from a question
to an observation and an experiment. They use the actual outcome, observed red-zone events
and the recorded movement; success always comes from the mission rules.

Editing preserves the last attempt and its original blocks. Starting another program,
resetting, opening a saved program or switching to manual driving clears the old report;
leaving the mission disposes it. The report is session-only. Advanced sensor/cargo programs
are outside its current coverage. See [KIDX_FAMILY_TRYOUT.md](KIDX_FAMILY_TRYOUT.md) for the
short family test proposed to the owner; it is not evidence of completed child testing.

## French labels for children

Use a concrete verb and name the affected object when context does not make it obvious.
Keep labels consistent in buttons, accessible names, Nestor instructions and spoken build
requests. Introduce useful robotics words through short explanations (a block is an order;
a loop repeats actions). These are editorial choices, not a claim of testing with children.

| Action | Child-facing wording |
| --- | --- |
| Run the whole program | **Démarrer**; accessible name **Démarrer le programme**. Avoid **Lancer**. |
| Execute the next instruction | **Exécuter un bloc**, explained as one order followed by a pause. |
| Resume after a pause | **Continuer** in programs and demonstrations. |
| Remove the last simple block | **Enlever**; accessible name **Enlever le dernier bloc**. |
| Load the mission's sample blocks | **Utiliser l’exemple**. This prepares blocks; **Démarrer** starts movement. |
| Update an existing saved program | **Enregistrer les changements**. |
| Inspect assembly separation | **Écarter les pièces** / **Rassembler les pièces**. Groups move together; this is a viewing aid. Nestor accepts **Écarte les pièces** and the earlier technical terms. |
| Move through construction | **Étape précédente** / **Étape suivante**; **Tourner le modèle** changes the view. |
| Inspect a model or page | **Rapprocher** / **Éloigner** in 3D; **Agrandir** / **Page entière** in a notice. |
| Return from a notice | **Construction 3D** or **Notices LEGO**, matching the actual destination. |

The simulator has a wheeled teaching chassis built from detailed LDraw EV3 parts; see
[KIDX_VISUALS.md](KIDX_VISUALS.md). The construction views use separate source assemblies
with no floor, desk or wall geometry, so the underside stays visible when orbiting.
Their assembly ordering comes from LDraw and can differ from the LEGO PDF pages.
Stages can now be demonstrated one logical piece at a time, with a gold insertion arrow. The illustrated approach path
is a teaching animation, not a connector-aware collision plan derived from the PDF.
Motors, sensors and generated cables are indivisible parts; their
internal CAD geometry is not an instruction to dismantle them. Stickers and conditional
edge lines are omitted. Use **Notice LEGO** to check small connections and cable routing.
Other models have the original PDF reader; they do not yet have 3D assembly data.

## Interactive learning and teamwork

**Nestor, montre-moi** replays the current stage. Select a piece or ask in French for
`montre le moteur`, `étape 8`, `dessous`, `vue normale`, `tourne`, `vue éclatée`,
`rassemble`, `pause`, `reprendre` or `ralenti`. The guide interprets these commands locally;
it does not require or claim a connected language model. Unrecognized requests get a
specific fallback. Camera, visibility, materials and part movement use the ordinary scene API.

**Construire ensemble** alternates who prepares and who assembles. Names and local progress
are saved in the browser. **Partager avec un autre écran** creates an eight-character room
code on `serve:kidx` or the Vite development server. Open the same model on another browser
or device and join with the code. Step and handoff state synchronize through the local server;
stale writes recover the latest revision, and interrupted handoffs retry after reconnect.
Rooms are in memory, expire after twelve hours
without requests and disappear when the server restarts. Leaving/reopening a model requires
joining its shared room again. Static hosting retains same-screen teamwork.

The server defaults to loopback. For two devices, set `KIDX_HOST` to this computer's private
LAN IPv4 address before running `npm run serve:kidx`; both devices use that address and port.
Only loopback/private IPv4 bindings are accepted. No public deployment or device configuration
is required by the feature; actual tablet connectivity is a separate household check.

Sensor distance uses oriented obstacle footprints at sensor height; contact is a forward
bumper threshold, color samples authored floor patches, and angle reports steering heading.
The 56 mm wheel sets the displayed distance scale. Motor percentages regulate target speed
while retaining rolling force; this is a teaching simulator with a chassis box collider,
not a calibrated EV3 torque, tyre or electrical model. The ray and readouts are driven by
the same measurements the program interpreter consumes. Physical tilt and measured travel
drive the rendered chassis, wheel rotation and B/C activity meters on the brick LCD.
A pause freezes both instructions and physics.

Browser state keys: `graphysx:kidx:code:v1` for the advanced program,
`graphysx:kidx:journey:v1` for achievements, and `graphysx:kidx:team:<model>:v1`
for same-screen roles. Existing simple named programs keep their original key/schema.

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
`npm run smoke:kidx-guidance` covers arrival, reading time, actual block edits and attempts,
retry/verdict, drive and laboratory guidance, and reachable controls at 320/390/800 pixels.
`npm run smoke:kidx-debrief` covers measured block paths, short/turned/interrupted/successful
attempts, unused instructions, progressive hints, read-only scrubbing, 320/390/800/1280px
layouts, focus restoration and reset/disposal. `test/kidx-mission-trace.test.mjs` covers
recording boundaries, bounded drawing samples, immutable reports and evidence-based coaching.
The mission and challenge smokes also verify the first guided action for all eleven missions.
`npm run smoke:kidx-workshop` covers PDF rendering,
navigation/zoom/persistence, both complete CAD models, step reversal/highlighting, assembly
separation, source normals and 800x480/390x844 controls. Without a local cache, its PDF input
test uses a clearly self-authored two-page fixture, not counterfeit LEGO instructions.

`npm run smoke:kidx-challenges` verifies all six new physical routes, live sensor decisions,
stationary stops, cargo/ramp behavior, resets and achievements. `npm run smoke:kidx-interactive`
verifies nested programs, real step/pause, low-power keyboard reverse, LCD/sound, individual
CAD insertion, Nestor requests, two-browser handoffs and the 3:1 gear demonstration.
The debrief validation covers all 64 checks across the full run and a corrected library
follow-up. `output/kidx/verify-debrief.log` records 63 passes, including 315 unit passes and
one intentional Windows skip; its sole failure was a library test that assumed only one
dialog existed. The corrected test targets the library explicitly and passed separately on
the same product build: `output/kidx/debrief-library-accepted.log`. Its 9m40s runtime uses 97%
of the unchanged ten-minute deadline, so timing headroom remains limited. The full-run log
retains its failure; it is not a single green-gate receipt.

Ten final source/test/config fingerprints match `output/kidx/debrief-accepted-source-hashes.json`.
The debrief passed measured-path, stationary, turn, interruption and success scenarios, with
inspected captures at desktop and 320/390/800px sizes. Final focused captures are in
`output/kidx/debrief-stop-final`; the full-run debrief and corrected library captures were
also inspected. The required game-client capture/state is in `output/kidx/debrief-client-accepted`.

Inspect screenshots in the configured `SMOKE_ARTIFACTS` directory. Follow the machine-wide
verification lock in `CLAUDE.md`; an isolated preview does not establish deployment or
physical EV3/Mint acceptance.

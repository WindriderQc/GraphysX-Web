# Revival custody, product collections and discovery

Audit date: 2026-11-11 (America/Toronto). Product base: `b61fe2a`.
Historical archive: `../GraphysX`, revision `f4cf357`.

## What the comparison establishes

The historical repository must be retained. It contains native source, project files,
animation evidence, recovery ledgers and an earlier browser application. The product is
not a complete source backup, and a Git worktree is not an independent backup.

The reproducible scan covers all non-generated C++/C# source and Visual Studio project
descriptors in the supplied repository, including GraphysX 2016, GraphysX_1, Scene3D,
Atmel/CubX, ArduinoGUI, GfxNet/GNet and the earlier BallZ/RacinX branches. Newton/SDK code,
build output and dependencies are explicitly excluded. Literal asset references and screen
declarations are discovery candidates; dynamic paths and runtime composition require manual
tracing. A filename match never proves a playable or faithful revival.

| Evidence | Result |
| --- | ---: |
| Native C++/C# files | 1,188 |
| Distinct native contents by SHA-256 | 701 |
| Byte-identical native copies across revisions | 487 |
| Solution/project descriptors | 30 |
| Original converted JSON records | 39 |
| Records retained byte-for-byte | 30 |
| Records with the same parsed data | **39 / 39** |
| Original public files | 433 |
| Public files retained byte-for-byte | 424 |
| Public files retained including insignificant text whitespace changes | 427 |

The three text differences are Arena OBJ/MTL/material newline/trailing-space changes. The other six
files are original NightSky BMP faces: the product uses JPEG faces instead. This is an
adaptation, not an exact original-image backup. Keep the original BMPs in the archive.

The earlier census contains **54 distinct historical screens/scenes**, originally labelled
7 restored and 47 partial. That is its historical assessment, not a current product completion
score. Preserved JSON, a dev-only preview, a model in the asset shelf, a selectable scene and a
fully playable experience are separate states. The Kitchen is a concrete example: its data
survived, while its full scene was no longer a product destination.

The machine-readable [audit](legacy-revival-audit.json) preserves the file groups, aliases,
project paths, hashes, model-reference candidates and conversion matches. Reproduce it with:

```powershell
npm run audit:legacy -- C:\Users\Yanik\codes\GraphysX
```

## Product decisions implemented in this pass

| Destination | Visitor's intent | Behaviour |
| --- | --- | --- |
| Créations | Discover something worth exploring | Curated worlds and named experiences first; scenes open in the Studio, standalone applications keep their own page |
| Jouer | Start a game | BallZ, Ballsy and Cyber Race first; old courses in Archives |
| Studio | Build or inspect freely | Existing complete editor and canonical world API |
| Ateliers | Open a named tool | KidX, Math Lab, LLMx, island and data/network presentations |
| Archives & labo | Explore the earlier work | Opens historical collection directly; experiments have their own tab |

Both catalogues expose Créations / Archives / Laboratoire / Tout. Search is scoped to the
selected collection; favorites and recency can reorder it without promoting a prototype.
Unknown scene/game IDs default to the lab. Editorial promotion is explicit in
`src/content-collections.ts`. This is an editorial distinction, not a claim that current
games have received headset/controller acceptance.

The front door says what a visitor can do before introducing demonstrations. A disabled
free-text field is omitted when there is no provider. Connected Nestor requests retain
the proposal/acceptance flow. LLMx remains a named workshop rather than a second front door.

The discovery ride visits actual CubX, DNA, rigid-body and flock systems on curved rails,
using the existing host focus path and shared frame loop. Dragging or scrolling the viewport
cancels the tour and future camera cues. Reduced motion cuts to each view. The ride never
changes exported scene data. The separate DNA button advances one real generation through
`api.update`; mutated rendered branch geometry is checked in the browser.

## Newly exposed recovery

**Cuisine / Blender.** The complete source-hash-locked FBX is converted offline to the
ordinary v2 model payload: all **76 named mesh parts**, source world transforms, normals,
UVs and material groups. Exact duplicate vertices are welded within `1e-7` world units;
numeric output is rounded to seven decimals. The original centimetre conversion is `0.01`.
The mesh remains available to agents through `api.assets()` and editable through ordinary
model material slots. Source hierarchy is baked into one named-mesh model; Blender lighting
and field of view are adapted. The unpacked Desktop photograph was already absent and has
not been fabricated. This remains a partial revival, with complete recovered geometry.

**Maison / Blender.** The complete 24-part house is recovered by the same converter.
Maison, Cuisine and the earlier massing study share one catalogue destination. Switching
views is a normal visibility transaction, so it preserves edits rather than recreating
the world. Each composition retains its own source camera; overview views are explicit
inspection adapters. This adds 100 source mesh parts across the two Blender compositions.

```powershell
npm run assets:cuisine
```

The converter accepts the archive path directly as well:

```powershell
node scripts/vendor-archive-cuisine.mjs C:\Users\Yanik\codes\GraphysX
node scripts/vendor-archive-cuisine.mjs C:\Users\Yanik\codes\GraphysX maison
node scripts/vendor-archive-arena.mjs C:\Users\Yanik\codes\GraphysX
node scripts/build-asset-catalog.mjs
```

**Intro Physics / ArduinoGUI.** `GraphysX/ArduinoGUI/ArduinoGUI/ScreenSys/IntroScreen.cs`
provides two ten-cylinder families. Positions, radii/heights, 0.1/0.05 masses, the 40-unit
Alien floor, two point-light positions and source camera are recovered. The C++
`MeshPrimitive.cpp` confirms that cylinder X/Y mean radius/height; scale Z is not an
eight-unit cylinder height. Rapier, copper shading, light intensity, sky and click impulses
are explicit adapters. The empty-texture vertex strip, Coke.jpg binding and native level
picker remain absent. Real falling bodies are checked, not just entity counts.
The native coordinates and camera are reused numerically; exact TV3D screen handedness
and historical rendered appearance have not been certified.

**Unity Arena.** All 92 triangles from the original OBJ, its UVs/normals and painted
atlas load through the ordinary model API. Its source camera placement is available;
lighting, handedness/presentation and material translation remain adapters. The original
scene provides no gameplay scripts: this destination is an environment, not a new game.

**Common Room.** The decoded `room.tvm` shell (180 vertices, 250 triangles) uses an inline
`mesh` entity with the original DDS diffuse and normal textures. The visit camera and
lighting are adapted because the mesh record supplies no authored scene composition.

**CubX notes.** Fifty source-positioned plates, their source `marble10.jpg` and the add
button form a normal editable world. Adding one plate is a v2 visibility interaction,
including undo/redo. Sequential buttons are a modern adapter; the native text editor,
disk persistence and device integration are not claimed restored.

**CubZ animation study.** Seven `GlobalCube` rotation ranges and the three `CubeOpen`
quaternion tracks now animate actual 3D hierarchy through a reusable `keyframes` behavior.
Source key times/values and 30 fps ranges are retained; interpolation is normalized slerp,
Z reflection is explicit and return playback reverses the same range. Geometry, inspection
scale and hinge pivots are disclosed adapters. Assembly rotation and opening are separate
studies: a complete actor-based selectable menu remains incomplete. Playback restarts the
selected range; keyframes use the authored world's timeline and restart with that timeline
when a document is reopened, rather than pretending to save a running animation cursor.

**FlightX inspection flight.** An ordinary `flight` behavior and transient `pilotLive`
API connect native W/S local-X movement, Z roll, reflected X pitch and orientation reset.
Space increases the downward pitch channel as the C++ source does; it is not invented drag.
Keyboard, hold buttons, blur/exit cancellation and optional chase camera use the shared
host clock. Flight inputs create no authored revisions, history or persisted held keys.
Web speed/rates, ground, pipe placement and guide rings are adapters. The visible StockRoom
airplane is a source mesh substitute, not a certified conversion of the native FlightX
actor. There is no aerodynamic simulation, source race layout or collision-course claim.

Motion behavior configuration and key buffers pass the same bounded validator in the
runtime and the storage service; agents discover them in the published vocabulary. These
destinations extend the single v2 product and do not reactivate the old browser renderer.

## Remaining archaeology with concrete owners

| Historical evidence | Current limitation / next recovery |
| --- | --- |
| CubX/CubZ actors and native MenuManager | TVA studies are now reachable in Archives. Full actor/button geometry, coupled selection/opening choreography and exact historical pivots still need proof. |
| `FlightXScene.cpp`, pipe1, Airplane | Controllable v2 inspection flight is now reachable. Native actor/material identity, historical timestep equivalence and source gate/lap layouts remain unproven. |
| Maison, Kitchen, Unity Arena and Common Room | Complete recovered mesh geometry is reachable. Exact historical lighting/rendering and the absent external Kitchen photograph remain outside parity. |
| `CarScene.cpp`, `Vehicule.cpp`, heightmaps and orphan car packs | Separate the authored Impreza world and source handling from model turntables and modern courses. Multiple completed historical cars are not established. |
| Serial/Arduino, TCP, NotesManager | Retain protocol/UI evidence. Simulated controls do not certify physical devices, networking or persistence. No hardware transport was opened in this pass. |
| Native shaders, sky and animated menus | Keep source contracts and exact assets. Distinguish modern PBR/JPEG/curve adapters from source parity; avoid promoting every shader study to a game. |

This scan does not exhaustively certify every historical scene or authorize deleting any
archive. It identifies custody, closes concrete exposure/interaction gaps and keeps the
remaining source-linked limitations visible.

## Verification

`test/revival.test.mjs` checks editorial defaults, native placement/mass families and the
complete converted kitchen payload. `smoke-revival.mjs` exercises the real front door,
scoped search, mutations in rendered instance buffers, camera interruption, reduced motion,
both recovered scenes and mobile navigation. Its screenshots live under the chosen smoke
artifact directory and must be inspected. Existing showroom, games, course and editor checks
remain part of qualification; selecting Archives is now a deliberate navigation step.

`test/agent-world-bridge-live.test.mjs` checks actual keyframe/flight simulation, storage
validation, bridge parity, input rejection, namespace protection and document round-trips.
`smoke-archive-worlds.mjs` checks all six explorer worlds: 24+76 loaded Maison/Cuisine
parts without losing edits, Arena atlas, both Room DDS maps and triangle count, undoable
notes, 3D TVA open/reverse, FlightX keyboard/hold/blur controls, mobile layout and teardown.

The first local reception below found four Windows directory `fsync` failures after a
successful checkpoint rename. Follow-up commit `cd7f449` fixes the platform boundary:
file flush/rename errors still propagate, POSIX still syncs the parent directory, and
Windows skips the unsupported directory-handle flush. The unchanged reliability suite
then passes 12/12. Windows namespace/power-loss durability remains narrower and is documented
in `world-service/README.md`. Physical headset/controller and live Nestor/homelab acceptance
are outside this local browser qualification.

### First local reception (historical, superseded by the continuation)

Implementation commit: `22ccd9a`. Typecheck, lint and production build pass. The final
static run reports 1,294 passing tests, four parent-directory `fsync` failures and one skip;
the complete release gate is therefore not green. Both standalone Rapier heightfield and
material-parity probes pass.

Eleven distinct browser journeys were qualified: revival, showroom, showroom-camera,
nestor-request, games, archive-cup, great-slide, map1, level1-2011, suzanne-machinery and
top20. The final discovery/DNA status and lineage boundary changes were checked again
against the final production build, together with the updated Nestor request contract.
The Nestor provider is a loopback fixture; no live model or household service was used.

Local receipts are retained in `output/revival-final-static.log`,
`output/revival-regressions-built.log`, `output/revival-final-journeys.log` and
`output/playwright/revival-regressions/`. Inspected captures include desktop/mobile welcome,
archive collections, the source-camera kitchen, native physics intro and the existing games.
These are local artifacts, not a production deployment or headset acceptance.

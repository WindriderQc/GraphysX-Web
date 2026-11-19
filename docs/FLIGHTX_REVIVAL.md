# FlightX: original models and source poses

Open `?app=flightx&view=source` for the original source inspection scene. It uses the
ordinary Studio, with keyboard/touch controls, Save, Export, undo and the shared world API.
**Archives → FlightX · l’avion retrouvé**, or `?app=flightx`, now opens the
[four modern training forms](FLIGHTX_MODES.md), with a separate source comparison link.

## Recovered

The read-only importer records **28 source hashes**: all twelve surviving
`FlightXScene.cpp/.h` copies, the 2011 scale constructor, SDK mesh header, original
textures and byte-identical release model copies.

| TVM | Vertices | Triangles | Surface groups |
| --- | ---: | ---: | ---: |
| Airplane | 10,261 | 11,168 | 48 |
| Pipe | 1,432 | 2,160 | 3 |

The earlier airplane was a StockRoom `.x` substitute with 9,766 triangles. The older
compact pipe conversion had lost its export origin and material groups. Those assets
remain available to their other scene owners; FlightX now references its own source TVMs.

Counted TVM decoding retains positions, normals, UVs, indices, all MGR4 groups and surface
channels, the 0.25 canopy alpha and thirteen one-based texture references. Six original
BMPs are copied byte-for-byte: FUS, WHEEL, WING, RED, HTAIL and VTAIL.
Z reflection and normal-consistent winding are explicit. Neither model is recentered.

Model SHA-256:

- Airplane: `22ad7811b6d39b8bd503c159c424877db8940965e64545aeb61f2bbc23638738`
- Pipe: `36c0b46c8daa424a252b7de0d46a74e65b8807122a7dcb21f44b8ec25de7284a`

## Source poses

Atmel/RacinX place the plane at `(0,0,0)`, scale 1, and the pipe at `(0,-500,0)`, scale 5.
BallZ 2011 uses a plane scale of `(0.1,0.1,0.1)` with the same pipe. Its constructor
explicitly forwards that vector to `SetScale`; its release TVMs match the recovered files.

Web presentation applies a disclosed 0.01 scale and +16Y lift to the composition. The
pipe keeps its large exported X offset: root `(0,11,0)`, scale 0.05, measured world X
bounds approximately 36.495–55.854. Centering it would change the source composition.

**Pose C++ · Atmel** hides modern guide rings. **Pose C++ · 2011** also applies the smaller
plane scale and a close inspection camera. **Pose de vol · piloter** restores the larger
plane, shows modern visit markers, unpauses and follows the aircraft.
These undoable API transactions change named transforms/visibility while retaining labels,
material edits and extra objects. Save/Export retain authored starts, without held inputs.

On compact layouts, pose and flight controls reveal the 3D view even if Inspect was open.
The Atmel overview frames both native objects; the 2011 view inspects the smaller plane.
The ordinary scene envelope extends the camera/fog distances for that composition.
The shelf uses a versioned native-model preview URL so returning browsers do not retain
the previous substitute airplane under an immutable asset URL.

## Forward motion and compatibility

The SDK declares `MoveRelative(float fForward, float fUp, float fRight)`. The first Web
port incorrectly inferred X/Y/Z arguments. Source TVM VTAIL geometry occupies negative Z,
behind the fuselage, so model-forward positive Z becomes **−Z** after reflection.
The Web binding follows that evidence and retains native model yaw. The closed SDK
runtime has not been executed to certify its matrix multiplication or timestep behavior.

Shared `flight.forwardAxis` accepts `"x"` or `"-z"`; omitted values preserve existing +X
worlds. Runtime and storage share validation. W/S moves forward/back; arrows operate
the source Z/X rotation channels. Space adds down-pitch, rather than drag. R resets
attitude in place and **Retour au départ** resets position separately; the source calls
`SetMatrix(identity)` for R, so this separation is a disclosed adapter.

## Boundaries and qualification

Camera, speed/rates, ground, visit markers and PBR are adapters. Recovered MGR4 colors
and alpha do not certify historical appearance: the C++ scene overrides them with
`StdMat`. Native collision response, aerodynamics, SDK timing and authored race/lap
layouts remain unverified. The four intended flight forms are playable as explicitly
modern training layouts; their implementation is documented in [FLIGHTX_MODES.md](FLIGHTX_MODES.md).
The older prototype 14-gate recovery route is not presented as an original layout.

```powershell
node scripts/vendor-flightx.mjs --archive=C:/Users/Yanik/codes/GraphysX --check
node --test test/flightx-source.test.mjs
npm run verify -- --checks=flightx,archive-worlds,editor,roundtrip,startup --wait
```

Shared motion changes require the complete `npm run verify -- --wait` before publication.
GitHub Node/build checks do not substitute for local WebGL verification. Tests cover
counted table corruption, exact assets, both axes, rejected input, pose undo and document
preservation. Browser checks measure geometry/maps/canopy and world bounds, edit materials,
fly, save/export/reload and exercise 390/320px simultaneous touch. Inspect the captures
in the selected artifact directory. Touch emulation is not physical-device acceptance.
The native archive is retained and never rewritten by the importer.

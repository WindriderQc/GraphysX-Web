# CubZ: 32 internal keys and the shared exit

Open `?app=cubx`. Eight source-numbered menus now contain four individually
identified, bevelled 3D keys each. Their face markings 1–4 match the accessible
buttons in the control card. The light key beneath them closes the petals and
returns along the same rotation. It is hidden in menu 0, during movement and in
the waiting animation; only the active menu's four keys can be picked.

## Evidence and limits

The read-only input is `GraphysX/Yanik C++ BCKUP/CubZ (2).cpp`, SHA-256
`1337ae604176b7b31e664f74b9eb02f926dc1da9f018e9a6d6bc618288ca28f6`:

- Lines 65–74 load `Media/CubXBtn/Btn1.tvm` through `Btn32.tvm`, plus `BtnExit.tvm`.
- Lines 241–254 register button `j*4+i+1` in menu `j+1`, then the exit as
  `ALLMENU_EXCEPT_MAIN`.
- The matching later `MenuManager.cpp` variant is SHA-256
  `cdd3817a9a7ede9ebf40a2bacf8e4c4e4f20c78a22439d8eefa70e2b026d0d5c`.
  Its `CreateBouton` assigns mesh, level and position, but not the `Action` field.
  No direct `stBtn3D[...].Action = ...` assignment was found in the 2,118 unpacked
  C++/C#/header files inspected. This is evidence about retained code, not proof
  that no other historical version ever implemented the destinations.

The 2026-11-21 audit enumerated 14,423 non-Git files, 134 compressed containers
and five nested containers. It found no exact `Btn1..32`/`BtnExit` model names.
Two third-party model ZIPs (`tkb003ds.zip`, `tog003ds.zip`) have header errors;
their partial listings are retained. Nested model-pack ZIPs have CRC warnings,
which remain recorded rather than being treated as verified originals.
`CubXScene.rar` contains eight **outer** `CubXBtn` models and the distinct
Get/Open actor family already restored in [CubX/Atmel](CUBX_ATMEL.md).
They are not the missing 32 internal models. Negative search results do not
establish permanent loss. Keep the original archive.
The Git history's tracked path inventory also contains no exact internal-model
names; older versions of compressed payloads are not replayed by this audit.

Reproduce without changing or running anything in the archive:

```powershell
node scripts/audit-cubz-buttons.mjs --archive=C:/Users/Yanik/codes/GraphysX --output=output/cubz-buttons/source-audit.json
```

Requires 7-Zip (`--sevenzip=<path>` overrides it). Only nested containers are
extracted, into the audit output directory under content-hash filenames. The
report retains container hashes, listing errors, native controller/manager hashes
and search scope. Original files are never repaired, overwritten or extracted over.

## Current, deliberately reconstructed actions

The topology and numbering below follow the C++; the themes, artwork, placements
and destinations do **not** claim to be recovered historical meanings.

| Menu | Native button numbers | Current actions, in slot order 1–4 |
| --- | --- | --- |
| 1 · Mécanique | 1–4 | Select the complete actor; diagnostic colors; reframe; editable pose in Studio |
| 2 · Mondes retrouvés | 5–8 | Atmel; Maison/Cuisine; Impreza; FlightX |
| 3 · Créer | 9–12 | This pose in Studio; My Creations; DNA; creation workshop |
| 4 · Jouer et apprendre | 13–16 | Make Ten; KidX/EV3 workshop; DNA/physics; FlightX |
| 5 · Applications | 17–20 | LLMx; DiskX; ecosystem; NetX |
| 6 · Points de vue | 21–24 | Front; back; top; overall view |
| 7 · Dans le mécanisme | 25–28 | Select eight cores; twelve cylinders; twenty-four petals; whole actor |
| 8 · Conserver et comprendre | 29–32 | Open provenance; download current pose JSON; diagnostic colors; save through Studio |

Navigation uses existing product routes. It forwards only an explicitly selected
store, never session/invitation credentials, stale scene parameters or URL fragments.
Local actions are ordinary API selections/material commands or the shared camera.
The 32 keys and common exit are ordinary v2 entities; all retain explicit
`reconstructed-button-model` provenance. Existing native actor payloads are unchanged.

Studio handoff and JSON export freeze the visible pose through the existing helper,
including all keys, hidden menus, user edits and foreign behaviors. Only this
player's exact playback tracks are removed. These keys have application actions
inside CubZ; in a saved Studio copy they are editable scene objects. No external
navigation callback is serialized into a user's document.

## Validation

`test/cubz-buttons.test.mjs` checks disjoint numbering/groups, model bounds and
indices, shared-exit visibility, frozen-pose persistence and safe destination URLs.
The existing mechanics tests still compare all rotation frames with the native
bind matrices, rigid connectors and outward opening petals.

`scripts/smoke-cubz-buttons.mjs` clicks all 32 keys in the real renderer, waits for
the actual destination applications, checks selections and downloads, and closes
all eight menus with the common 3D exit. `scripts/smoke-cubz-menu.mjs` additionally
covers keyboard/touch, reduced motion, 320/390-pixel layouts, hidden-ancestor
picking and ordinary Studio save/export/reload. Inspect screenshots as well as
receipts. Browser viewport emulation does not certify physical phones or hardware.

# FlightX: four playable training forms

Open **Archives → FlightX · l’avion retrouvé**, or `?app=flightx`.
The menu previews the recovered TVM biplane and offers four forms:

| Mode | Objective | Rules |
| --- | --- | --- |
| `free` | Explore without a timer | No scoring or finish |
| `gates` | Cross three straight gates in order | All three passages required |
| `time` | Complete one vertical looping | Three checkpoints and the return line, within 35 simulation seconds |
| `laps` | Complete three vertical loopings | Ordered checkpoints on every lap; no expiry |

`?app=flightx&mode=time` preselects a form without starting it. The corresponding
values are `free`, `gates`, `time` and `laps`.

## Recovered assets, current courses

The airplane, pipe, six BMP textures, native origins and source-scale evidence are
documented in [FLIGHTX_REVIVAL.md](FLIGHTX_REVIVAL.md). Their vendored bytes and
28 archive source pins are unchanged. The archive is read-only.

The tracker records these four forms as intended FlightX features. No surviving
authored gate/lap layout or aerodynamic solver establishes their original implementation.
These are **modern training layouts**, with adapted lighting, ground extent, camera,
controls, speed and rules. The menu discloses that distinction before launch.

The previous source workbench remains at `?app=flightx&view=source`. Its Atmel/2011
poses and original-control interpretation are preserved. The comparison link opens it
in a separate tab, keeping the current training document intact.

## Play

- W or Space: advance; S: reverse.
- Up/Down: raise/lower the nose; Left/Right: bank.
- P or Escape: pause; R or **Au départ**: restart the course.
- Hold **Avancer + Monter**, or W/Space + Up, to learn the vertical looping.
- Touch controls accept simultaneous pointers. Release, pointer cancellation, blur
  and hidden-page transitions clear held inputs. Blur also pauses the flight.

These simplified controls differ from the source workbench, where Space adds
down-pitch and R resets attitude in place. Reduced-motion preference keeps the chase
camera aligned with the world instead of rolling with the plane.

The ordinary world API owns all movement, checkpoints, lap counts, simulation time
and results. A transparent kinematic sphere is the plane's passage reference; explicit
box sensors sit inside separate visible rings. Neither shape reproduces airplane
collisions, wingspan contacts or native aerodynamics. There is no private scoring loop,
renderer or animation-frame loop in the application.

## Records and Studio

Completed, synchronized courses save their best time in seconds under
`graphysx.flightx.best.v1` in browser local storage. Free flight has no record. Invalid
stored values are ignored, and newer stored minima are retained when another result
is written. Storage refusal keeps the result for the current session and reports that
it could not be saved. There is no remote leaderboard or server write.

Changing form caches each current document during the visit. **Ouvrir dans le Studio**
passes the complete authored document to the ordinary editor and returns to its saved
departure, with live inputs cleared. Model material overrides, labels and added objects
survive the handoff, Save, Export and local-scene reload. Save or export in the Studio
to retain edits beyond this visit; the menu cache itself is not persistent.

## Qualification

```powershell
node --test --test-name-pattern="FlightX" test/agent-world-bridge-live.test.mjs
npm run verify -- --checks=flightx-modes,flightx,archive-worlds --wait
npm run verify -- --wait
```

Contracts use the real world API, Rapier triggers and shared rules: all four forms,
three laps, skipped gates, timeout, a short throttle lead before pitch, rotated authored
departures, edit preservation and storage failures. Browser reception uses real keyboard
input and simultaneous touch at 390px and 320px, checks pause/replay/blur, expiry,
records, material edits, Studio Save/Export/reload, visible native geometry and errors.
Inspect the screenshots as well as the receipt. Touch emulation does not establish
physical-device acceptance or closed-SDK physics parity.

# Cyber Race 1992

A standalone recreation of the two-player virtual race Jobe and Peter play in
*The Lawnmower Man* (1992, director's cut, about 00:40:18–00:41:25), with two extra boards
taken from the film's other VR scenes.

It is a **separate page**, not part of the GraphysX runtime: `cyber-race.html` with its code in
`src/cyber-race/`, its own three.js renderer and its own frame loop. The product build
(`vite.config.ts`) builds `index.html` only, so the page is **not deployed** with the site;
`scripts/verify-impact.mjs` classifies its files as selecting no product smoke and no
deployment. Porting it onto the shared runtime (Games shelf, `api.steer`, AgentX ghost) would be
a separate piece of work.

## Run

```bash
npm run dev
# then open http://127.0.0.1:4173/cyber-race.html
```

## What is in it

| Board | From the film | Content |
| --- | --- | --- |
| 1 Tunnel | 00:40:37 | Polygon tube of bright green rings and circuit relief, rotating riveted plates, red/tan exit funnel |
| 2 Mine field | 00:41:00 | Spiked riveted dodecahedra, circuit sky |
| 3 Crystals | 00:41:11 | Riveted triangle shards, floating red/tan strips, checker finish |
| 4 Thorn lands | 00:01:36 (opening VR shooter) | Low-poly gold canyon, sunset sky, thorn urchins, spiked logs to pass over or under |
| 5 Vortex | 02:05 (finale) | Swirl funnel into a blue/pink hexagon tube with spinning hex tiles |

The menu reproduces the film's blue icon panel (00:40:18): course length, difficulty, the
3-board film run or the 5-board run, two players or one against the computer, sound,
fullscreen, VR and quit. The HUD follows the film's game: green five-digit score, yellow
chevron turbo gauge, crosshair, blue gloves, and the red **GAME OVER** on brushed silver.

Everything is procedural (canvas textures, primitive geometry, Web Audio synthesis); no film
frames or sounds are in the repository.

## Controls

| | Jobe (left) | Peter (right) |
| --- | --- | --- |
| Fly | W A S D (Z Q S D on AZERTY) | arrows |
| Turbo | Space or Left Shift | Right Shift, Enter or Numpad 0 |
| Xbox pad | pad 1: stick or d-pad, turbo A / RB / RT | pad 2: same |

Menus: d-pad or stick, **A** confirm, **B** back, **Start** starts a race from the menu and
pauses during one. B never pauses mid-race (Escape, P, Start or View do). The game pauses
itself when the window loses focus or a pad is unplugged.

## Playnite and other launchers

```bash
node scripts/package-cyber-race.mjs [outDir]
```

writes `output/cyber-race/package/` (or `outDir`): a single self-contained `cyber-race.html`
that opens from disk, and `Cyber Race 1992.cmd`, which starts Edge as a fullscreen app window
with its own profile (so the launched process lives until the window closes and Playnite can
track it). In Playnite, either point the play action at the `.cmd`, or at `msedge.exe` with the
same arguments to avoid the console window. The **Quit** button closes the app window.

## VR (Quest on Link)

The lunettes button starts an `immersive-vr` WebXR session: one player against the computer,
seat just behind Jobe with the horizon locked to the line, and an in-headset panel for score,
turbo, messages, pause and game over. Touch controllers: thumbstick to fly, trigger turbo, A
confirm, B back/pause; an Xbox pad also works.

Requirements: Meta Quest Link installed and Link active (it provides the OpenXR runtime Edge
uses). Browsers only open a VR session from a click or key press, not a pad button. The
in-tube camera follows the line, which can cause motion sickness.

Status: written against WebXR and three.js `WebXRManager`, **not yet tried in a headset**.

## Testing hooks

`window.cyberRace` exposes `advance(seconds)` (fixed 60 Hz steps, then one render), `ui([...])`
to feed menu actions as a pad would, `start()`, `settings`, `pilots` and `world`. Set
`pilots[i].cpu = true` to let the computer fly either pilot.

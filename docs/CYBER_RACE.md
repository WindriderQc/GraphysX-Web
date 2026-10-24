# Cyber Race 1992

A standalone recreation of the two-player virtual race Jobe and Peter play in
*The Lawnmower Man* (1992, director's cut, 00:40:17–00:41:25), extended with boards taken from
the film's other VR scenes.

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

## Boards

The menu offers the **3-board film run**, the **7-board run** (the film's race, then the other VR
scenes in film order, ending in the finale) and the **9-board run**, which keeps the film's
boards intact and adds two boards *inspired* by the film before the finale (marked
"INSPIRÉ" on screen). Each course has a fixed track, so records and ghosts stay comparable.

| Board | From the film | Content |
| --- | --- | --- |
| 1 Tunnel | 00:40:36–00:40:58 | Polygon tube of green rings and circuit relief, rotating riveted plates; exits through a tan cone that flares forward, rimmed in red, a big mine waiting outside |
| 2 Mine field | 00:40:58–00:41:07 | Spiked riveted dodecahedra over a circuit sky |
| 3 Crystals | 00:41:07–00:41:25 | Red/tan bars sweeping across, triangle shards over a dark rippled floor with a glittering "highway", a riveted wall with a chrome **porthole**, slabs closing like **blades**, narrow **slots** passed on the side, a long diagonal beam, checker finish |
| 4 Thorn lands | 00:01:36 (opening VR shooter) | Low-poly gold canyon, sunset sky, thorn urchins, spiked logs to pass over or under |
| 5 Kaleidoscope | 01:00:20–01:02:40 (Jobe's acceleration) | A turning funnel of ornate lace tiles, electric sigils, rotating lightning beams to time, crackling orbs |
| 6 Golden wave | 01:14:15–01:14:40 (into the network) | Red **WARNING**; a golden grid sheet whose saw-tooth crests rise into the flight zone, the electric brain-globe below, neon interface frames, red wire icosahedra, hex-dot sky |
| Network (inspired) | after 01:57:40 "NETWORK ACCESS GRANTED" | Square cyan data corridor; red 3 x 3 **firewalls** with a few open cells to aim for; cyan scan beams |
| Furnace (inspired) | after 01:35:20 | Furnace sky over a lava sea; **fire columns** erupting on and off through the flight zone; charred rocks with glowing cracks |
| Vortex (finale) | 02:04:58–02:10:20 | Swirl funnel into a blue/pink hex tube; **Cyberjobe flies ahead and throws hex tiles** (three at a time in the second half); three red **ACCESS DENIED** doors (02:09:40) open and close; **Cyberjobe's countdown** on the bomb's LCD timer; at the line he stops and screams |

**Finale.** Entering the vortex starts Cyberjobe's LCD countdown (the film's bomb timer, 02:08:30),
sized from the board's length and the difficulty. Seconds left at the line become points; a
pilot still flying at zero is *destroyed by Cyberjobe*. Finished pilots coast to a halt in front
of him, then GAME OVER.

**Set pieces and points** follow the film's score counter (00:41:12–00:41:24): porthole +400,
knife-edge slot +500, blades +450, bars/logs +250, lightning beam +300, tunnel plate +200,
chrome ring +1000.

The HUD follows the film's game: green five-digit score, yellow chevron turbo gauge, blue gloves,
red lock-on marks around the rival, white-pink flares on turbo (00:40:54), and a white flash into
the red **GAME OVER** on brushed silver (00:41:25). The film's thin sighting lines are an option
in the menu (fourth row), **off by default**.

Everything in the repository is procedural (canvas textures, primitive geometry, Web Audio);
no film frames or sounds are committed.

## Story mode

The book button (fourth row) opens **L'histoire de Jobe**: seven chapters in film order, then
the inspired boards, each with a story card and an objective. A film clip plays before each
chapter when present. Each first success makes Jobe faster (cruise, turbo, agility), as his mind
grows in the film; progress is saved in the browser.

| # | Chapter | Board | Objective |
| --- | --- | --- | --- |
| 1 | Le jeu de guerre | thorn lands | finish in under 18 s (solo) |
| 2 | La course avec Peter | the film's 3 boards | beat Peter |
| 3 | Accélération | kaleidoscope | take 4 rings and finish |
| 4 | Le réseau | golden wave | finish in under 19 s |
| 5 | Pare-feu (inspired) | network | finish with 2 hits at most |
| 6 | La colère (inspired) | furnace | beat Peter |
| 7 | Cyberjobe | vortex | finish before the countdown ends |

## Records, ghosts and sound

The best time per course (board set, length, difficulty) is kept in the browser with the
winning flight sampled ten times a second; the next race replays it as a cyan **RECORD** ghost.
The soundtrack is generated live (Web Audio): one synth theme per board, a calm menu theme,
urgency rising with Cyberjobe's countdown. English call-outs ("Three, two, one, go", "Warning",
"Game over", "New record") use the system's speech voices.

## Controls

| | Jobe (left) | Peter (right) |
| --- | --- | --- |
| Fly | W A S D (Z Q S D on AZERTY) | arrows |
| Turbo | Space or Left Shift | Right Shift, Enter or Numpad 0 |
| Knife-edge | Q / E | comma / period (or Numpad 1 / 3) |
| Xbox pad | pad 1: stick or d-pad, turbo A / RT, knife-edge LB / RB | pad 2: same |

Fly flat through horizontal gaps (blades) and on your side through vertical slots: the pilot's
extent across a gap depends on its roll. Menus: d-pad or stick, **A** confirm, **B** back,
**Start** starts a race from the menu and pauses during one; B never pauses mid-race. The game
pauses itself when the window loses focus or a pad is unplugged.

## Film clips (local only)

```bash
node scripts/extract-cyber-race-film.mjs --movie <your copy of the film> --out <package dir> [--ffmpeg <ffmpeg>]
```

cuts clips from **your own copy** of the director's cut into `<package dir>/film/` (the three
below plus one `story-N.mp4` per story chapter):
`intro.mp4` (00:40:17.6, the boys pick the game and jack in), `attract.mp4` (a montage of the VR
scenes, looped after 30 s idle in the menu) and `outro.mp4` (00:41:23.4, the checker line, the
film's GAME OVER, Jobe pulling the headset off). The game plays them when present and skips them
otherwise; A, Enter or Escape skips a clip. **Never commit the clips or publish them with the
site.**

## Playnite and other launchers

```bash
node scripts/package-cyber-race.mjs [outDir]
```

writes `output/cyber-race/package/` (or `outDir`): a single self-contained `cyber-race.html`
that opens from disk, and `Cyber Race 1992.cmd`, which starts Edge as a fullscreen app window
with its own profile (so the launched process lives until the window closes and Playnite can
track it). Point Playnite's play action at the `.cmd`, or at `msedge.exe` with the same arguments
to avoid the console window. The **Quit** button closes the app window.

## VR (Quest on Link)

The goggles button starts an `immersive-vr` WebXR session: one player against the computer,
seat just behind Jobe with the horizon locked to the line, and an in-headset panel for score,
turbo, timer, messages, pause and game over. Touch controllers: thumbstick to fly, trigger turbo,
grip knife-edge, A confirm, B back/pause; an Xbox pad also works.

Requirements: Meta Quest Link installed and Link active (it provides the OpenXR runtime Edge
uses). Browsers only open a VR session from a click or key press, not a pad button. The
in-tube camera follows the line, which can cause motion sickness.

Status: written against WebXR and three.js `WebXRManager`, **not yet tried in a headset**.

## Shot-by-shot reference (race, 00:40:17–00:41:26)

Checked at 8 frames per second.

| Time | Shot |
| --- | --- |
| 00:40:17–00:40:36 | Jobe at the controller, Peter beside him; the blue icon panel: maze glyphs, dot/shape glyphs, `?`, black ball |
| 00:40:36–00:40:38 | Close on Jobe's flyer: glass canopy over the blue mask with yellow eyes, red/white hull |
| 00:40:39–00:40:41 | Both pilots spiral down the green tunnel, purple and blue trails |
| 00:40:41–00:40:45 | Room: the boys prone on the rigs |
| 00:40:45–00:40:51 | Tunnel: Peter (pale, blue shorts, white/blue wings) overtakes; camera rolls around the tube |
| 00:40:51–00:40:54 | Room: Jobe on the gyro rig |
| 00:40:54–00:40:56 | Pilot view with HUD (score, chevrons, gloves); white-pink flares |
| 00:40:56–00:40:58 | Room, then Peter close behind; tunnel narrows to a tan cone |
| 00:40:58–00:41:00 | Outside: the tube exits through a tan cone with a red rim; big mine at the mouth |
| 00:41:00–00:41:05 | Mine field, side views; close passes and a collision |
| 00:41:05–00:41:07 | Pilot view chasing through the mines |
| 00:41:07–00:41:11 | Red/silver bar, then room cutaway |
| 00:41:11–00:41:13 | Red/tan bars sweep across, shards begin |
| 00:41:13–00:41:16 | Shard "highway" over a dark rippled floor; red lock-on marks on the rival |
| 00:41:16–00:41:17 | Riveted wall with a chrome porthole, flown through |
| 00:41:17–00:41:19 | Knife-edge between shard walls |
| 00:41:19–00:41:22 | Long diagonal riveted beam; shards |
| 00:41:22–00:41:23 | Narrow gap between big riveted plates |
| 00:41:23–00:41:25 | Checker line along the highway, white flash |
| 00:41:25–00:41:26 | GAME OVER on brushed silver, then the room |

## Testing hooks

`window.cyberRace` exposes `advance(seconds)` (fixed 60 Hz steps, then one render), `freeze(true)`
to stop the live loop for an exact capture, `ui([...])` to feed menu actions as a pad would,
`start()`, `settings`, `pilots`, `world` and `finale`. Set `pilots[i].cpu = true` to let the
computer fly either pilot.

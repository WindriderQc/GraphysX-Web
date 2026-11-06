# Cyber Race: "Notre version"

Owner direction, 2026-11-05 (after a working Quest 2 test over Link): take Cyber Race to the
next level. **Keep one stunt that is really faithful to the film**, then build *our* version:
better graphics, more beautiful and functional boards, longer and more interactive, a
"kick all world" immersive look.

## Decisions

| Topic | Decision |
| --- | --- |
| Faithful stunt | The **3-board film run stays exactly as it is** (≈ 48 s at NORMAL, the length of the film's race, 00:40:36–00:41:25). No combat, no remastered look. |
| Board length | Our boards last **30–45 s**, with **peak or ending boards up to 90 s**. |
| Interactivity | **Race plus light combat**: shortcuts and lane splits, boosts, destructible obstacles, and the film's red lock-on marks become a pulse shot that slows the rival. |
| Platform | **Quest first.** Every effect must work in the headset: three.js post-processing does not run in WebXR, so glow comes from materials (tone-mapped emissive, halos, fresnel), not a bloom pass. A screen-only "full graphics" mode (bloom, grain, aberration) comes later. |
| Order | **One complete showcase board first**, pushed all the way (look, length, interactivity, sound, haptics), to validate the direction before extending to the other boards. |
| Full run (2026-11-06) | The owner asked to bring every board to the target length. Notre version now races **all nine boards at about 40 s each**, the Hypertube first and the **Vortex as a 90 s finale**. The film plans keep their short boards. |

## Showcase board: HYPERTUBE

The film's green tunnel reimagined, about 42 s at NORMAL (2 800 m, scaled by the course
setting). It opens the notre version run. Phases along the board:

| Share | Phase | Content |
| --- | --- | --- |
| 0–8 % | Launch bay | Wide hangar (radius 24) narrowing into the tube; giant launch rings with halos |
| 8–40 % | Hypertube | Glossy circuit tube with light pulses rushing past; rotating plates (now **destructible**), **boost pads**, rings |
| 40–66 % | Split | Tube widens; a glass **divider** splits it into two lanes with **gaps to switch lanes**. Left lane: mines, more rings and boosts (risky, rewarding). Right lane: clear but slower to take |
| 66–92 % | Collapse | Red alert; the tube tightens; **iris rings** open and close; debris; rumble |
| 92–100 % | Exit | The tube flares into a blinding ring of light; finish gate |

## The full run

The menu's **NOTRE VERSION** button (fourth row) races the nine boards below. Each board other
than the Hypertube reuses the film board's builder, given its own length, announced phases and
a **rhythm**: a density curve that decides where live obstacles gather (`boardRhythm` and
`finaleRhythm` in `track.ts`, applied through `spread`, `pace` and `decor` in `world.ts`).
Scenery grows with the board so it never thins out. Film boards have no rhythm and build exactly
as before (same random draws).

Durations measured with the autopilot at NORMAL on 2026-11-06 (hits slow it, so a clean run is
a little shorter). The course setting scales every length (COURT ×0.6, LONG ×1.5).

| Board | Length | Time | Phases |
| --- | --- | --- | --- |
| HYPERTUBE | 2 800 m | 42 s | BIFURCATION · EFFONDREMENT (alert, rumble) · SORTIE |
| CHAMP DE MINES | 3 000 m | 40 s | ESSAIM · TEMPÊTE DE MINES (alert) |
| CRISTAUX | 2 600 m | 41 s | AVERSE · TEMPÊTE DE CRISTAUX |
| TERRES HOSTILES | 2 900 m | 41 s | CANYON · FORÊT D'ÉPINES |
| KALÉIDOSCOPE | 2 650 m | 40 s | ACCÉLÉRATION · HYPNOSE |
| VAGUE D'OR | 2 300 m | 39 s | HOULE · DÉFERLANTE |
| RÉSEAU | 2 500 m | 39 s | INTRUSION · PARE-FEU (alert) |
| FOURNAISE | 3 000 m | 42 s | ÉRUPTION · MER DE FEU (alert) |
| VORTEX (finale) | 5 500 m | 93 s | TOURBILLON · ŒIL DU VORTEX · EFFONDREMENT (alert) · DERNIER SPRINT |

The whole run lasts about 7 minutes at NORMAL, about 4 at COURT.

**Rhythm.** A 40 s board: calm entry (0–10 %), build to full density (30 %), a short breather
(50–60 %), the peak at 1.6× density (66–90 %), a clear exit. The finale has two waves, each
with a breather, then a last sprint at almost 2×. An alert phase flashes red with a voice line
and one strong pulse on the controllers; only the Hypertube collapse rumbles throughout.

**Next.** These boards have the length and the rhythm; their own remastered set pieces (the
proposals in the board bible) come board by board.

## Systems

- **Look (remaster pipeline).** ACES tone mapping and a neon environment map (chrome flyers,
  glossy panels) for our boards only; additive halos on light sources; speed streaks around
  the pilots; light pulses computed in the tube's shader.
- **Light combat.** Rings fill up to 3 **pulse charges**. Fire sends a pulse forward; when the
  rival is in the lock cone (the film's red marks), the pulse homes on it and slows it down.
  Pulses also break plates and mines. The computer fires too. Our version only.
- **Haptics.** Xbox pads (`vibrationActuator`) and Quest controllers (`hapticActuators`): hits,
  boosts, pulses, collapse rumble.
- **Sound in space.** The rival's engine pans with its position relative to the listener.

## Controls added

| | Jobe | Peter |
| --- | --- | --- |
| Pulse shot | R | Numpad 2 or L |
| Xbox pad | X or LT | X or LT |
| Quest | A / X | — |

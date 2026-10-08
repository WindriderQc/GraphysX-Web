# `<llmx-face>` — the docked mask

The LLMx voxel mask without the Forge: one custom element that another LAN page docks beside
its own conversation. AgentX Household uses it for the Super Dad and Famille avatar dock.

## Build and delivery

- Source: `src/llmx-embed.ts` (the bundle entry), `src/llmx-face-element.ts` (element, renderer, lights, halo),
  `src/llmx-stage-element.ts` (the stand-alone picture, below) and
  `src/llmx-face-embed-presence.ts` (pure presence → face drivers, unit tested).
- Every `vite build` (gate, CI, deploy) also builds `vite.face.config.ts` through a plugin in
  `vite.config.ts`; `npm run build:face` builds it alone. It writes one self-contained
  ES module, `dist/embed/llmx-face.js` (three.js and the sculpt inlined, ~230 KB gzip). It ships
  with every production deploy at `/embed/llmx-face.js`.
- A host relays that file from its own origin (Household does, like the VoiX player) so its CSP
  stays `script-src 'self'`; nothing here needs CORS.
- Dev harness: `llmx-face-embed.html` on the dev server (phase buttons, simulated voice).
- Smoke: `scripts/smoke-llmx-face-embed.mjs` (tier `apps`) loads the built file alone.

## Contract

```html
<llmx-face level="high" tint="#60d6e8"></llmx-face>
<script type="module" src="/relayed/llmx-face.js"></script>
```

- Attributes: `level` (`high` | `balanced` | `mobile`; the device ceiling still applies),
  `tint` (aura and rim colour), `intro="off"` (arrive already built).
- `element.presence = { phase, level, brightness, tokenRate, toolPulses }` — `agentx.presence.v1`,
  partial updates merge. Phases: `idle`, `listening`, `waiting`, `generating`, `speaking`,
  `interrupted`, `error`, `sleeping`. `level` is raw RMS (mic while listening, reply while
  speaking), `brightness` the reply's raw spectral brightness, `tokenRate` tokens/s while
  generating, `toolPulses` a monotonic counter (each increment flares the halo once).

- `element.scene = { schema: "agentx.math-scene.v1", kind: "count", to }` (1–100) or
  `{ kind: "add", a, b }` (sum 1–20) shows a look-only math picture beside the mask; `null`
  clears it. Counting fills rods of ten (a gap after five, alternating shades per ten); an
  addition shows both numbers apart, then slides the second up to complete the ten, with the
  label `a + b = sum`. The mask looks at each new cube and nods when the picture is complete;
  reduced motion shows the finished picture at once. Out-of-bounds pictures are refused whole,
  never clamped. Layout and bounds: `src/llmx-math-scene.ts` (pure, unit tested); rendering:
  `src/llmx-math-stage.ts`. The picture sits beside the mask in a wide dock, below it in a tall
  one, and the camera eases to the new framing.
- `element.rebuild()` replays the assembly.
- Events: `llmx-face-ready` after the intro, `llmx-face-error` when WebGL is unavailable (the
  host shows its own fallback), `llmx-scene-applied` / `llmx-scene-rejected` (a receipt for each
  `scene`).

### Presence behavior

Presence drives the existing gaze, brow, blink, head and mouth rig. The host must send the
phase it actually observes; a silent audio sample is not a new thinking phase. The eye and lid
sculpt keeps the iris visible at `high`, `balanced` and `mobile` density.

| Observed phase | Face response |
| --- | --- |
| `idle` | Relaxed, open eyes and ordinary blinks. |
| `listening` | Raised brow, open eyes and slight attentive tilt; microphone level adds warmth. |
| `waiting` | Patient, open gaze; no fake thinking motion while a host is queued. |
| `generating` | Focused brow and glance; token rate changes intensity. |
| `speaking` | Mouth follows played audio level; a quiet gap keeps the speaking pose without opening the mouth or switching to thinking. The first audible onset gets one small nod, not one nod per word. |
| `interrupted` | Mouth closes on the presence update, before the next animation frame; gaze returns to attention. |
| `error` | Subdued expression; the host supplies the readable explanation. |
| `sleeping` | Calm open eyes. Older Household docks also use this phase while an inference host is busy, so closed eyes would falsely show Nestor asleep. |

On 2026-10-08, a read-only check of the Household dock found that its `host-busy` path sends
`sleeping`. Its relayed face module was byte-identical to the then-current GraphysX-Web build.
The dock sends phase, audio level, brightness, token rate and tool pulses; it does not send the
tool name, confirmation requests, or whether `sleeping` means inactivity versus GPU queueing.
Those distinctions and a click-to-open activity/commands panel belong to a future host contract
and Household integration. The face does not invent activity or success from a pulse.

## `<llmx-stage>` — the math picture on its own

The same bundle defines `<llmx-stage>` for a host that shows pictures in its own zone rather than
beside the mask (AgentX Household's Images zone):

```html
<llmx-stage style="width:320px;height:240px"></llmx-stage>
```

- `element.scene` takes the same `agentx.math-scene.v1` values as `<llmx-face>`, with the same
  refusal of out-of-bounds pictures and the same `llmx-scene-applied` / `llmx-scene-rejected`
  receipts. A scene set before the element is connected applies on connection.
- `llmx-scene-complete` fires once the picture has finished building; `llmx-stage-ready` after the
  first frame; `llmx-stage-error` when WebGL is unavailable (the host shows its own fallback).
- No mask, presence or pointer gaze. The camera frames the whole picture and its label at any
  aspect (`src/llmx-stage-frame.ts`, pure, unit tested) and eases to a new picture's size; reduced
  motion shows the finished picture at once. Rendering pauses off screen.

The mapping reuses `llmxFacePresentation`, so the docked mask and the Forge mask read the same;
the embed adds listening level, token-rate thinking intensity and a compatibility pose for the
older dock's `sleeping` signal. The gaze follows the pointer anywhere on the host page and
returns to the viewer after four seconds.

Visual review: compare the exact previously relayed bundle with a new local build at a quarter
dock (420 × 320), a portrait view, a three-quarter view, and a 96 × 96 mobile bubble. Check
`speaking` and `sleeping` at minimum, plus the listening, waiting, generating and interrupted
transitions. Run `node --test test/llmx-face-eyes-open.test.mjs
test/llmx-face-embed-presence.test.mjs test/llmx-face-pose.test.mjs` and
`scripts/smoke-llmx-face-embed.mjs` against `npm run build:face`. The smoke asserts that
interruption closes the mouth immediately and that cyan eyes remain visible during the legacy
busy signal.

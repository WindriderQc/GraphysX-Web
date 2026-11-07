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

### `agentx.math-scene.v2`: functions (AgentX #1270, phase 2)

`<llmx-stage>` also takes `agentx.math-scene.v2`: the v1 cube kinds unchanged, or one to four
functions y = f(x) drawn in the recovered Math Game style (backdrop board, green grid, three axes,
a molecule field riding every curve) and overlaid for comparison. `LlmXStageElement.schemas`
lists the contracts the loaded element understands, so a host can keep its own fallback.

```js
stage.scene = {
  schema: "agentx.math-scene.v2", kind: "functions",
  functions: [{ name: "f", expression: "x^2" }, { name: "g", expression: "a*x + 1", label: "droite", color: "#60d6e8" }],
  parameters: [{ name: "a", value: 2, min: -3, max: 3 }],
  x: [-3, 3],            // y: [min, max] optional; otherwise fitted to all curves, as the host's 2D card does
};
stage.parameters = { a: -1.5 }; // the host's sliders: no rebuild
```

- Formulas follow the Math Lab grammar (`src/math-expression.ts`, a port of AgentX's
  `core/public/js/math-expression.js`; both repositories run the same vector file,
  `test/fixtures/math-expression-vectors.json`). Names are x and the declared one-letter
  parameters (at most six). Function names are one letter other than x, t or e; labels at most
  48 characters; colours `#rrggbb` (default palette `#ffe86b`, `#60d6e8`, `#ff7a6b`, `#9dff8a`).
- Anything outside the contract is refused whole with `llmx-scene-rejected` and a reason
  (`schema`, `functions`, `formula`, `parameters`, `window`, `out-of-bounds`); a parameter value
  outside its range answers `llmx-parameters-rejected`. Nothing is clamped: a point outside the
  window, or where the function is undefined, is not drawn, and curves break at asymptotes.
- `llmx-scene-applied` and `llmx-parameters-applied` carry the shown scene with its current values,
  the fitted y window and a one-line description.
- Dragging turns the scene (touch: sideways only, so the page keeps scrolling); a double click
  returns to the opening view. Layout, sampling and framing are pure and unit tested
  (`src/llmx-math-functions.ts`); rendering is `src/llmx-math-function-stage.ts`.
- The docked `<llmx-face>` keeps v1 cubes only.

### `agentx.math-scene.v3`: calculus and functions using functions (AgentX #1270, phase 3)

v3 is v2 plus three optional lists, and functions may use one another. `LlmXStageElement.schemas`
includes it when the loaded element draws them; a host that needs v3 keeps its 2D fallback otherwise.

```js
stage.scene = {
  schema: "agentx.math-scene.v3", kind: "functions",
  functions: [{ name: "f", expression: "x^3 - 3*x" }, { name: "g", expression: "f(x - 1) + 1" }],
  parameters: [{ name: "p", value: 1, min: -2, max: 2 }, { name: "b", value: 1.5, min: 0, max: 2 }],
  x: [-2.5, 2.5],
  derivatives: ["f"],                      // f'(x), a dashed curve in f's colour
  tangents: [{ of: "f", at: "p" }],        // white tangent at x = p, moving with the slider
  areas: [{ of: "f", from: 0, to: "b" }],  // light blue area down to the x axis
};
```

- A formula may name another function of the scene, `f(…)` or its derivative `f'(…)`. The stage
  substitutes them (`parseMathFunctions` in `src/math-expression.ts`); a circle, an unknown name or
  a formula that grows too large is refused with reason `formula`. v2 keeps functions standalone.
- Derivatives are symbolic (`deriveMath`), slopes come from them, and areas use Simpson's rule
  (`integrateMath`), all from the validated formulas: nothing is taken from the host. AgentX's
  grammar does the same; the shared vector file now also covers derivatives and function systems.
- A tangent point or area bound is a declared parameter's name or a number. It must lie inside the
  x window, and a parameter's whole range must too. A tangent where the function or its derivative
  is undefined, and an area across an undefined stretch, are not drawn as numbers (`null`).
- Refusal reasons add `derivatives`, `tangents` and `areas`. The applied and parameter receipts add
  `tangents: [{ of, x, y, slope }]` and `areas: [{ of, from, to, value }]`, for the host to compare
  with its own computation.

### `agentx.math-scene.v4`: parametric curves and surfaces (AgentX #1270, phase 3)

v4 is v3 plus parametric curves beside the functions, and a second kind, `surfaces`.

```js
stage.scene = {
  schema: "agentx.math-scene.v4", kind: "functions",
  functions: [],                                       // curves may also sit beside functions
  curves: [{ name: "c", x: "r*cos(t)", y: "r*sin(t)" }],
  parameters: [{ name: "r", value: 2, min: 0.5, max: 3 }],
  x: null,                                             // curves alone: framed around themselves
  t: [0, 6.283185307],
};
stage.scene = {
  schema: "agentx.math-scene.v4", kind: "surfaces",
  surfaces: [{ name: "z", expression: "a*(x^2 - y^2)" }],   // one or two
  parameters: [{ name: "a", value: 0.5, min: -1, max: 1 }],
  x: [-2, 2], y: [-2, 2],                              // z: [min, max] optional, else fitted
};
```

- A curve is written in `t` and the parameters, and may use the scene's functions (`f(t)`,
  `f'(t)`). Names are one letter other than x, y, t or e; functions and curves together are one to
  four, and curves continue the palette after the functions. `t` is required with curves.
- `x` is required with functions. With curves alone the host sends `x: null` explicitly; the stage
  then fits both windows around the curves (all their points, unless a few run far away) and
  widens one so a unit is as long across as up on the board: a circle stays round.
- A surface is `z` or `f(x, y)` in x, y and the parameters, and uses no other formula. `x` and `y`
  are required, `z` is optional (fitted to the heights otherwise), and a parameter cannot be named z.
  The box keeps equal ground units: a window twice as wide as deep gives a floor twice as wide.
- The surface is computed on a 40 × 40 grid from the formula, shaded with its wire lines, with a
  20 × 20 molecule field on it. A height outside the z window, or where the formula is undefined,
  leaves a hole: never a flattened plateau. The opening view is higher (`MATH_SURFACE_ORBIT`).
- Refusal reasons add `curves` and `surfaces`. The functions receipts add `curves` (the count) and
  the drawn `x` window; surface receipts carry `kind: "surfaces"`, `surfaces`, `molecules` and the
  drawn `z` window. AgentX's grammar fits the same windows (`fitMathRange`, in the shared vectors).

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

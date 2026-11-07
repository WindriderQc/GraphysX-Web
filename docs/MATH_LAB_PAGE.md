# Math Lab page

`/math-lab.html` is the Math Lab without an assistant. A person types the same block
lines Nestor writes inside `<show kind="math">` in AgentX's Super Dad and Famille
(AgentX #1270), and `<llmx-stage>` draws the Math Game picture with live sliders. The
page calls no model and makes no request outside the site. The Browse shelf lists it as
"Math Lab".

## What it is made of

| Part | File | Role |
| --- | --- | --- |
| Block reader | `src/math-block.ts` | Port of AgentX's `parsePlot`/`plotText` (`core/public/js/math-expression.js`), built on the grammar in `src/math-expression.ts`. It also builds the stage scene the way AgentX's card does (`sceneOf`). |
| Starter blocks | `src/math-lab-examples.ts` | Line, parabola, two curves, wave, tangent, area, circle `c(t)`, hill and saddle surfaces, from simple to advanced. |
| Page | `math-lab.html`, `src/math-lab-page.ts`, `src/math-lab.css` | Text box, examples, stage, legend, sliders, tangent and area readouts. |
| Parity vectors | `test/fixtures/math-block-vectors.json` | AgentX's answer for each of 94 blocks (accepted and refused), checked by `test/math-block.test.mjs`. |
| Journey | `scripts/smoke-math-lab.mjs` (`math-lab` in the verify manifest) | Browse row, typed v2 block, slider, refusal, v3 and v4 examples, address round trip, phone layout. |

## Rules it keeps

- **One grammar.** The formula grammar is `math-expression.ts`, already shared with
  AgentX by `test/fixtures/math-expression-vectors.json`. The block reader only adds the
  line syntax around it.
- **Refused whole, never clamped.** A block AgentX refuses is refused here with the same
  message, prefixed "Formule non tracée". The last valid picture stays, dimmed and marked
  "Dernier dessin valide", until the text is valid again. Slider values always lie inside
  their declared range.
- **Same picture as AgentX.** The scene uses the oldest contract that draws the block:
  v2 for plain functions, v3 for derivatives, tangents, areas and functions using one
  another, v4 for parametric curves and surfaces. Colours follow the shared palette.
- **Sliders do not rebuild.** When only parameter values change (slider, or a value typed
  in the text for the same block), the page sets `stage.parameters`, so the view and the
  build animation are kept.
- **Shareable.** The current block is kept in the address (`#bloc=…`). "Copier le bloc"
  copies the canonical block with the sliders' current values, ready to paste to Nestor.

## Changing the block language

Change AgentX first, then regenerate the vectors from its file and mirror the change in
`src/math-block.ts` until `node --test test/math-block.test.mjs` passes:

```bash
node scripts/math-block-vectors.mjs /path/to/AgentX/core/public/js/math-expression.js
```

The page state is mirrored on `main.ml[data-state]` (`loading`, `drawn`, `refused`,
`rejected`, `no-webgl`) and `[data-schema]` for tests.

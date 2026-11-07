# Math Lab page

`/math-lab.html` is the Math Lab without an assistant. A person types the same block
lines Nestor writes inside `<show kind="math">` in AgentX's Super Dad and Famille
(AgentX #1270), and `<llmx-stage>` draws the Math Game picture with live sliders. The
page calls no model and makes no request outside the site. The Browse shelf lists it as
"Math Lab".

It is the only Math Lab in GraphysX-Web. The recovered Math Game screen
(`archive-math-lab`, its Browse row and thumbnail) was retired on 2026-11-07. The
`formula-field` entity, `api.formulas()`, its editor chips and its place in the world
vocabulary stay: agents still place formula fields in worlds, and saved scenes holding
them keep loading. Only the screen built from it went away.

## What it is made of

| Part | File | Role |
| --- | --- | --- |
| Block reader | `src/math-block.ts` | Port of AgentX's `parsePlot`/`plotText` (`core/public/js/math-expression.js`), built on the grammar in `src/math-expression.ts`. It also builds the stage scene the way AgentX's card does (`sceneOf`). |
| Starter blocks | `src/math-lab-examples.ts` | Two levels. "Pour commencer": line, parabola, two curves, wave. "Pour aller plus loin": tangent, area, circle `c(t)`, hill and saddle surfaces. Each says in one sentence what to try. |
| Plain words | `src/math-lab-messages.ts` | Each refusal said in plain French (with an example of what to write), and formulas shown with superscripts (`x²`, `3 · x`). |
| Page | `math-lab.html`, `src/math-lab-page.ts`, `src/math-lab.css` | Text box, examples, stage, legend, sliders, tangent and area readouts. |
| Parity vectors | `test/fixtures/math-block-vectors.json` | AgentX's answer for each of 94 blocks (accepted and refused), checked by `test/math-block.test.mjs`. |
| Journey | `scripts/smoke-math-lab.mjs` (`math-lab` in the verify manifest) | Browse row, typed v2 block, slider, refusal, v3 and v4 examples, address round trip, phone layout. |

## Rules it keeps

- **One grammar.** The formula grammar is `math-expression.ts`, already shared with
  AgentX by `test/fixtures/math-expression-vectors.json`. The block reader only adds the
  line syntax around it.
- **Refused whole, never clamped.** A block AgentX refuses is refused here: a plain French
  sentence first, then AgentX's exact message, prefixed "Formule non tracée". The last valid picture stays, dimmed and marked
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

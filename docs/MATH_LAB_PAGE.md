# Math Lab page

`/math-lab.html` is the Math Lab without an assistant, in three levels on one stage:

1. **Avec des cubes · pour les petits** (what a first visit opens on). A young child counts
   cubes (1 to 100) or adds two numbers up to 20, with big buttons and no typing. The stage
   draws the `agentx.math-scene.v1` picture Famille shows: rods of ten, and for an addition
   the orange cubes sliding up to complete the ten. The answer appears once they have.
2. **Pour commencer · des formules** and 3. **Pour aller plus loin.** A person types the
   same block lines Nestor writes inside `<show kind="math">` in AgentX's Super Dad and
   Famille (AgentX #1270), and `<llmx-stage>` draws the Math Game picture with live sliders.

"Essaie une formule" leads from the cubes to the first formula. The page calls no model and
makes no request outside the site. The Browse shelf lists it as "Math Lab".

It is the only Math Lab in GraphysX-Web. The recovered Math Game screen
(`archive-math-lab`, its Browse row and thumbnail) was retired on 2026-11-07. The
`formula-field` entity, `api.formulas()`, its editor chips and its place in the world
vocabulary stay: agents still place formula fields in worlds, and saved scenes holding
them keep loading. Only the screen built from it went away.

## What it is made of

| Part | File | Role |
| --- | --- | --- |
| Cube level | `src/math-lab-kids.ts` | The v1 choices offered (counting, additions), each button's step, why a press or an address is refused, the `#compter=` / `#additionner=` address. Bounds come from `readMathScene` (`src/llmx-math-scene.ts`), so there is one rule. |
| Block reader | `src/math-block.ts` | Port of AgentX's `parsePlot`/`plotText` (`core/public/js/math-expression.js`), built on the grammar in `src/math-expression.ts`. It also builds the stage scene the way AgentX's card does (`sceneOf`). |
| Starter blocks | `src/math-lab-examples.ts` | Two levels. "Pour commencer": line, parabola, two curves, wave. "Pour aller plus loin": tangent, area, circle `c(t)`, hill and saddle surfaces. Each says in one sentence what to try. |
| Plain words | `src/math-lab-messages.ts` | Each refusal said in plain French (with an example of what to write), and formulas shown with superscripts (`x²`, `3 · x`). |
| Page | `math-lab.html`, `src/math-lab-page.ts`, `src/math-lab.css` | Levels, cube buttons, text box, stage, legend, sliders, tangent and area readouts. |
| Parity vectors | `test/fixtures/math-block-vectors.json` | AgentX's answer for each of 94 blocks (accepted and refused), checked by `test/math-block.test.mjs`. |
| Journey | `scripts/smoke-math-lab.mjs` (`math-lab` in the verify manifest) | Browse row, cubes on arrival (count, steps, limits, addition with its answer, refused address), the path up, typed v2 block, slider, refusal, v3 and v4 examples, address round trip, phone layout. |

## Rules it keeps

- **One grammar.** The formula grammar is `math-expression.ts`, already shared with
  AgentX by `test/fixtures/math-expression-vectors.json`. The block reader only adds the
  line syntax around it.
- **Cubes stay inside v1.** Counting goes from 1 to 100 and an addition to 20 in all, the
  bounds Famille uses. A button whose step would leave them is disabled, never moved to the
  nearest allowed value (95 with +10 does not become 100), and a note says why once a limit
  is reached. An address such as `#compter=150` is refused in plain French and nothing is
  drawn. Subtraction and other operations are not offered: v1 draws counting and additions only.
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
- **Shareable.** The current picture is kept in the address (`#compter=13`, `#additionner=8+5` or `#bloc=…`). "Copier le bloc"
  copies the canonical block with the sliders' current values, ready to paste to Nestor.

## Changing the block language

Change AgentX first, then regenerate the vectors from its file and mirror the change in
`src/math-block.ts` until `node --test test/math-block.test.mjs` passes:

```bash
node scripts/math-block-vectors.mjs /path/to/AgentX/core/public/js/math-expression.js
```

The page state is mirrored on `main.ml[data-mode]` (`kids`, `formulas`), `[data-state]` (`loading`, `drawn`, `refused`,
`rejected`, `no-webgl`) and `[data-schema]` for tests.

# Workshop previews

Restoration harnesses for inspecting recovered archive material. **Not product.** Reachable
in development only, at `?host=previews`.

- Index: `src/preview-host.ts`
- Shared renderer and frame loop: `src/preview-bootstrap.ts`
- Inventory: `src/preview-registry.ts`
- Guards: `npm run audit:previews`, `npm run smoke:previews`

## What was wrong

All 19 `*-preview.ts` modules were **orphaned**: nothing imported them, no route reached
them, and each queried a canvas id (`#milky-way-preview-canvas`, `#suzanne-preview-canvas`, …)
that **no HTML file in this repo provides**. They could not run, and nothing said so.

They also each built their own `WebGLRenderer` and their own `requestAnimationFrame` loop —
18 of 19 — against `CLAUDE.md`'s "One shared frame loop. Never a second
`requestAnimationFrame`." Dormant violations, but violations the moment anything imported
them. Renderer setup had drifted too: 11 set `outputColorSpace = "srgb"` as a string, 7 used
`SRGBColorSpace`, and only 3 touched tone mapping at all, with three different exposures
(1.05, 1.12, 1.15).

## What it is now

The host owns the canvas, the renderer and the loop. A preview supplies scene content:

```ts
export function mount({ scene, camera, renderer, controls }: PreviewContext): PreviewHandle {
  // add to `scene`, frame `camera`
  return {
    ready: environment.ready,            // optional: awaited before the first frame
    step: (deltaSeconds) => …,           // optional: called by THE loop
    describe: () => ({ … }),             // optional: feeds render_game_to_text()
    dispose: () => { … },                // required: remove what you added
  };
}
```

Shared renderer defaults match the product host — `SRGBColorSpace`, `ACESFilmicToneMapping`,
exposure 1.1 — so a recovered material looks the same in a preview as in the app. A preview
needing something else sets it in `mount` and restores it in `dispose`
(`suzanne1-ascii-preview.ts` does this for `shadowMap.enabled`).

**Archive data is never changed to make previews look alike.** Consistent *renderer* setup is
the goal. A recovered scene that looks different because the archive authored it that way
stays different.

The host installs `render_game_to_text()` and `advanceTime(ms)` once and delegates to whatever
is mounted, replacing the copy each harness used to install on `window`. `advanceTime` returns
the number of frames it stepped.

## Converting one

`src/milky-way-preview.ts` is the worked example; `src/suzanne1-ascii-preview.ts` is the one
with a renderer override. The recipe:

1. Delete `requireCanvas()`, the `new WebGLRenderer`, the `new Scene`, the `new PerspectiveCamera`,
   `resize()`, `frame()` and every `requestAnimationFrame`.
2. Wrap the setup in `export function mount(context): PreviewHandle`.
3. Move `step(delta)` to the returned `step`; drop its `renderer.render(...)` — the host renders.
4. Move the `render_game_to_text` body to `describe()`.
5. Turn keyboard-only affordances into buttons appended to `context.controls`. The old
   harnesses each bound `r` and `f` globally, which collided the moment two shared a page.
6. Return a `dispose()` that removes what you added to the scene and restores any renderer
   setting you changed.
7. Flip `state` to `"mountable"` in `src/preview-registry.ts` and add its `load`.
8. Run `npm run audit:previews` and `npm run smoke:previews`.

## Status

Converted and runnable: **milky-way**, **suzanne1-ascii**.

The other **17 are listed in the index, disabled, showing the canvas id they still query** —
recorded rather than hidden, because unreachable-and-undocumented is the thing being fixed.
Converting them is mechanical follow-on work with the recipe above and a proven pattern.

## Why dev-only

`main.ts` guards the route with `import.meta.env.DEV`, so the whole subtree is dead code in a
production build. Two reasons: these are workshop material under the stewardship model
(`GraphysX-Web` is the clean product; `GraphysX` is the restoration workshop), and making them
product-reachable would pull archive assets into the release manifest that
`scripts/product-assets.mjs` deliberately prunes — ~80 MB no production visitor requests.
`smoke-previews.mjs` asserts the host is absent from `dist/`.

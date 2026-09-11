# GraphysX Web

GraphysX Web is a browser-native **3D + physics world studio that humans and AI agents
author through one shared runtime**. A person builds and plays in a visual World Editor;
an agent builds and inspects the same world through `window.__GRAPHYSX__` and a
discoverable tool bridge.

Live application: <https://graphysx.specialblend.ca>

> **Status: v1 met, deployed.** The site opens into the platform showroom; a human and
> an agent edit the same live scene through one runtime; a game rebuilt on-platform plays
> to a win. The archive host has retired; converted scenes and assets remain in the shared
> runtime. What the product is: **[PRODUCT_SPEC.md](PRODUCT_SPEC.md)**. Where it stands
> and what's next: **[HANDOFF.md](HANDOFF.md)**. **[ROADMAP.md](ROADMAP.md)** preserves
> the historical plan; its old unchecked items are not the current backlog.
>
> **Live Sessions, leaderboards and shared ghosts are deployed** — but a visitor can only
> use them when a scene store is reachable from the browser. The build probes one only when
> `VITE_GRAPHYSX_STORE_URL` is set (or `?store=` is passed), so the default deploy stays
> storeless and silent. To turn them on:
> **[docs/DEPLOYING_THE_STORE.md](docs/DEPLOYING_THE_STORE.md)**, then
> `npm run store:preflight -- --url <store>`.
>
> **Current product direction: a lean platform and KidX First Drive.** Open KidX from the
> welcome card or `?app=ev3-lab` to build and run a six-block program through the same steering
> API used by a human or agent. Real EV3 execution and qualification on the Linux Mint
> touchscreen PC remain to be completed on the target hardware. That PC replaces the earlier
> Raspberry Pi target. See **[HANDOFF.md](HANDOFF.md)** and the
> **[Linux Mint touchscreen guide](docs/LINUX_MINT_TOUCH.md)**.
>
> **In the current source:** First Drive's **Programs** button saves named block sequences in
> this browser. Build a program, open Programs, enter a name and save. After reloading, open
> Programs and select a saved name; **Run** uses the same simulator. Editing an opened program
> enables **Update saved program**; entering another name saves a copy. Browser data clearing
> removes this library. Programs are not synced to a scene store or another device.
>
> First Drive now uses an EV3-inspired Technic robot on a dedicated work mat, with a
> stable camera and touch controls styled around the brick's LCD and programming blocks.
> The original model is generated locally; see **[KidX visuals](docs/KIDX_VISUALS.md)**.
>
> The retained AgentX showroom is a 3D hub where Nestor
> demonstrates Build, Play, and Explore through attributed scene commands whose results remain
> editable. Shipped so far: live sessions with a server-authoritative mission director; a
> co-authoring queue where Nestor **proposes** and a human accepts, discards, or takes
> individual lines out before anything touches the scene; guided tours that move the camera and
> highlight entities without changing the document by a byte; and an agent that drives a BallZ
> course through the same `api.steer` calls a keyboard produces, then hands its trajectory over
> as the ghost you race. A model provider can compose those proposals instead of Nestor — the
> adapter ships, no provider is configured by default, and **none is required**: with nothing
> set the page makes no request at all. Free-text requests remain a future capability;
> Center expansion is deferred. Capability history and remaining limitations:
> **[docs/AGENTX_ROADMAP.md](docs/AGENTX_ROADMAP.md)**.

The complete historical source and restoration record lives in the workshop repo,
[WindriderQc/GraphysX](https://github.com/WindriderQc/GraphysX). That repo is local-dev
only; this one is the deployable product.

## Run it

Use Node.js 22 (the CI version). The browser product needs no database, model provider,
hardware or scene-store service to start:

```bash
npm ci
npm run dev
```

Vite serves the app at `http://localhost:4173`; read its printed URL if the port is busy.
KidX is on the welcome card and at `?app=ev3-lab`. The preview workshop is dev-only at
`?host=previews`. The editor, games and advanced controls use the same product runtime.

| Need | Command | Scope |
| --- | --- | --- |
| Fast development check | `npm run check` | Typecheck and Node unit tests; no browser or service. |
| Lint | `npm run lint` | Type-aware product lint and syntax checks for server/tooling. |
| Production build | `npm run build` | Writes this checkout's `dist/`; does not publish it. |
| Inspect that build | `npm run preview` | Serves `dist/` locally; read the printed URL. |
| Platform / application tests | `npm run verify:core` / `npm run verify:apps` | Selected tiers; useful during development, not a full release gate. |
| Complete release gate | `npm run verify -- --wait` | Unit tests, typecheck, lint, build, physics probes and all registered smokes. Waits for the machine lock. |
| Optional scene store | `npm run serve:scenes` | Listens on loopback port 8788; stores scenes and related data under `.graphysx-store/` by default. |
| Current API/test counts | `npm run counts` | Reads the bridge and verification manifest. |

`npm run verify -- --help` explains tier selection, checking an existing build and checking
an external URL. Partial checks report their scope. Browser checks need Chromium installed
once with `npx playwright install chromium`. See [test/README.md](test/README.md) for the
fast-test boundary and [CLAUDE.md](CLAUDE.md) before running expensive checks alongside
another session.

The store is optional. A browser can explicitly select it with `?store=http://localhost:8788`;
production configuration and write credentials belong in
[docs/DEPLOYING_THE_STORE.md](docs/DEPLOYING_THE_STORE.md), not the client bundle.
Preserve `.graphysx-store/`: it is user content, not disposable build output.

## Where to change things

| Area | Entry point |
| --- | --- |
| Routes and application composition | `src/main.ts` |
| Renderer and shared frame loop | `src/platform-host.ts` |
| Scene vocabulary, simulation and agent API | `src/agent-world-runtime.ts`, `src/agent-world-api.ts` |
| Human editor and shared styling | `src/platform-editor.ts`, `src/platform-theme.ts` |
| KidX programs and controls | `src/ev3-first-program.ts`, `src/ev3-program-library.ts`, `src/ev3-mission-strip.ts` |
| Persistence, media and collaboration | `server/scene-store.mjs` and its imported `server/` modules |
| Verification coverage | `scripts/verify-manifest.mjs`; `scripts/verify.mjs` executes it |

Read [PRODUCT_SPEC.md](PRODUCT_SPEC.md) for the product contract and
[HANDOFF.md](HANDOFF.md) for current priorities and constraints. Search `progress.md` only
when you need the evidence behind a specific decision. [CLAUDE.md](CLAUDE.md) covers
concurrent work, validation, delivery and cleanup.

## Agent interaction

The running application exposes `window.__GRAPHYSX_AGENT_BRIDGE__`. See
[AGENT_WORLD_API.md](AGENT_WORLD_API.md) for the protocol, and use the Playwright stdio
adapter for an external agent:

```bash
npm run agent:manifest -- --url https://graphysx.specialblend.ca/
npm run agent:stdio -- --url https://graphysx.specialblend.ca/
```

## Stewardship model

- **`GraphysX`** is the provenance archive and restoration workshop (local dev only).
- **`GraphysX-Web`** is the clean browser product and deployment source.
- **SBQC** catalogs and launches GraphysX Web as an external app; it does not rebuild or
  vendor it.
- Pushes to `main` run the full CI gate before deployment. The production workflow ships
  static assets and the separate scene-store payload, verifies the activated release and
  rolls back failed activation. A local commit or green local gate is not a deployment.
- LAN staging is optional and manually triggered, with its own self-hosted runner and
  persistent release server. It is not part of `npm run dev` or automatic on branch pushes.
  Setup: [ops/README-staging.md](ops/README-staging.md).

See [PRODUCT_SPEC.md](PRODUCT_SPEC.md) for the product definition, the in/out surface,
the archive→app pipeline, and open decisions.

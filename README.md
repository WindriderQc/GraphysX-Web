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
> and what's next: **[ROADMAP.md](ROADMAP.md)**.
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

```bash
npm ci
npm run dev
```

Production build (static release written to `dist/`):

```bash
npm run build
```

The release gate — typecheck, build, and every headless smoke against the built `dist/`
(the same gate CI runs before deploying):

```bash
npm run verify
```

Current sizes — bridge tools, gate checks — are generated rather than written down, because
a number in prose is wrong the next time it grows:

```bash
npm run counts
```

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
- Every push to `main` builds a static release and atomically switches production.

See [PRODUCT_SPEC.md](PRODUCT_SPEC.md) for the product definition, the in/out surface,
the archive→app pipeline, and open decisions.

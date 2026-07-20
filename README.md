# GraphysX Web

GraphysX Web is a browser-native **3D + physics world studio that humans and AI agents
author through one shared runtime**. A person builds and plays in a visual World Editor;
an agent builds and inspects the same world through `window.__GRAPHYSX__` and a
discoverable tool bridge.

Live application: <https://graphysx.specialblend.ca>

> **Status: v1 met, deployed.** The site opens into the platform showroom; a human and
> an agent edit the same live scene through one runtime; a game rebuilt on-platform plays
> to a win. The legacy archive player survives behind `?host=legacy` as a reference
> fallback. What the product is: **[PRODUCT_SPEC.md](PRODUCT_SPEC.md)**. Where it stands
> and what's next: **[ROADMAP.md](ROADMAP.md)**.

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

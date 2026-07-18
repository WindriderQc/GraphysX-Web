# GraphysX Web

GraphysX Web is a browser-native **3D + physics world studio that humans and AI agents
author through one shared runtime**. A person builds and plays in a visual World Editor;
an agent builds and inspects the same world through `window.__GRAPHYSX__` and a
discoverable tool bridge.

Live application: <https://graphysx.specialblend.ca>

> **Status: in transition.** This repository currently still bundles the full
> archive-revival player it was branched from. The product direction — reducing the
> deployed app to the creation platform plus a few showcase worlds — is defined in
> **[PRODUCT_SPEC.md](PRODUCT_SPEC.md)**. Read that first.

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

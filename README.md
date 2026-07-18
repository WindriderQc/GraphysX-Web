# GraphysX Web

GraphysX Web is the browser-native, deployable edition of GraphysX: twenty years of interactive 3D experiments, recovered as a modern Three.js application with a discoverable agent bridge.

Live application: <https://graphysx.specialblend.ca>

The complete historical source and restoration record remains in [WindriderQc/GraphysX](https://github.com/WindriderQc/GraphysX). This repository intentionally contains only the maintained web runtime, curated browser assets, operational tests, and deployment code.

## Run it

```bash
npm ci
npm run dev
```

Production build:

```bash
npm run build
```

The static release is written to `dist/`.

## Agent interaction

The running application exposes `window.__GRAPHYSX_AGENT_BRIDGE__`. See [AGENT_WORLD_API.md](AGENT_WORLD_API.md) for the protocol and use the Playwright stdio adapter for an external agent:

```bash
npm run agent:manifest -- --url https://graphysx.specialblend.ca/
npm run agent:stdio -- --url https://graphysx.specialblend.ca/
```

## Stewardship model

- `GraphysX` is the provenance archive and restoration workshop.
- `GraphysX-Web` is the clean browser product and deployment source.
- SBQC catalogs and launches GraphysX; it does not rebuild or vendor it.
- Every push to `main` builds a static release and atomically switches production.

# `<llmx-face>` — the docked mask

The LLMx voxel mask without the Forge: one custom element that another LAN page docks beside
its own conversation. AgentX Household uses it for the Super Dad and Famille avatar dock.

## Build and delivery

- Source: `src/llmx-face-element.ts` (element, renderer, lights, halo) and
  `src/llmx-face-embed-presence.ts` (pure presence → face drivers, unit tested).
- `npm run build` also runs `vite build -c vite.face.config.ts`, which writes one self-contained
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
- `element.rebuild()` replays the assembly.
- Events: `llmx-face-ready` after the intro, `llmx-face-error` when WebGL is unavailable (the
  host shows its own fallback).

The mapping reuses `llmxFacePresentation`, so the docked mask and the Forge mask read the same;
the embed adds listening level, token-rate thinking intensity and sleep. The gaze follows the
pointer anywhere on the host page and returns to the viewer after four seconds.

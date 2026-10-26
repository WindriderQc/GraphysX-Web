# Nestor proposals: a sentence becomes world commands, a person decides

Owner decision, 2026-10-25 (America/Toronto): AgentX Core composes every proposal for the
AgentX Center; GraphysX keeps no model and no second vocabulary. The three scripted
demonstrations (`Build`, `Play`, `Explore`) stay as the fallback when no provider is
configured, because the public front door must never require a model, an account or a key.

## The pieces

| Piece | Where | What it does |
|---|---|---|
| World vocabulary | `server/world-vocabulary.mjs`, built to `dist/embed/world-vocabulary.json` by `vite.vocabulary.ts` on every `vite build`; `/embed/world-vocabulary.json` on the dev server; MCP resource `graphysx://world-vocabulary` | Machine-readable API: the thirteen operations, the entity types, every field with the bounds the validator enforces, curated ids (skies, HDRIs, textures, models, presets), prefabs, behaviors, interactions, joints, the reserved id namespaces, the review limits, rules and one example list per family. Derived from the tables `server/scene-commands.mjs` validates with and from the runtime's catalogue tables; nothing is retyped. `test/world-vocabulary.test.mjs` proves it matches `AgentWorldCommand`, `AgentWorldEntityType`, `AgentWorldPrefabId`, `PROPOSABLE_OPS` and `PROVIDER_LIMITS`, and that every example applies. |
| Request field | `src/showroom-welcome.ts` (`[data-nestor-ask]`), `src/main.ts` (`requestNestor`) | One row under the topic pills. The sentence goes verbatim as `ProposalRequest.request`; the reply becomes an ordinary `CoauthorProposal` through `proposeExternal("request", …)`: same card, same per-line narrowing, same accept at the same revision, same undo. A refusal is shown as the provider's sentence (`Not proposed — …`) and the scene does not move. Without a provider the field is disabled, its placeholder is the one true sentence about why, and the page makes no request. |
| Provider seam | `src/coauthor-provider.ts` | Unchanged contract (`{ intent, commands }`), plus `readProviderRefusal`: an explicit `{ ok: false, reason }` reaches the card as a sentence whatever the status was. |
| Core route | AgentX `core/surfaces/graphysx/index.js`: `POST /api/graphysx/propose`, `GET /api/graphysx/vocabulary` | Reads the vocabulary from `GRAPHYSX_VOCABULARY_URL`, renders the system prompt from it, runs one admitted `analysis` inference with JSON output, validates the answer (known ops and types, scene ids for changes, new ids for creations, no `live-*:` namespace, 40 commands, 200-character intent), retries once with the refusal, answers `{ intent, commands }` or `{ ok: false, reason }`. Full profile only, refused on a family-pinned device. |
| Dev relay | `scripts/propose-relay.mjs`, mounted by the dev server when `GRAPHYSX_PROPOSE_URL` is set | `POST /propose` on the page's origin forwarded to that one Core URL: one method, one path, a body that must be a `ProposalRequest`, a reply bounded to `PROVIDER_LIMITS.replyBytes`. Without the variable it answers 503 with a sentence. |
| Host bridge (phase 2) | `src/center-bridge-protocol.ts` (the messages, shared by both ends), `src/coauthor-host-bridge.ts` (the Center's end, wired in `src/main.ts` when the page is framed), `src/center-host-embed.ts` → `dist/embed/center-host.js` (`<graphysx-center>`, the host's end, built by `vite.center-host.config.ts` with every `vite build`) | A framed Center waits for a host page to say hello from an allowed origin (same-origin, loopback, or the build-time `VITE_GRAPHYSX_HOST_ORIGINS`), then takes it as its provider: a typed request goes up as a message, the host asks Core on its own origin, the reply comes down and is read by `readProviderReply` like any other. A pushed proposal comes down the same way, is read by `readPushedProposal` (same rules plus an agent actor and an integer revision) and becomes a card through `proposeExternal` with that actor and that `expectedRevision`; a receipt goes back up. The Center never names its scene to a page that is not on the list. |
| Core page and push | AgentX `core/surfaces/graphysx/center.js`: `GET /graphysx`, `GET /api/graphysx/center-host.js`, `GET /api/graphysx/center/events`, `POST /api/graphysx/center/state`, `POST /api/graphysx/center/receipts`, MCP tool `propose_world_change` | The page frames the Center from `GRAPHYSX_CENTER_URL` and relays that build's `center-host.js` from Core's origin (CSP `script-src 'self'`; `frame-src` widened to that one origin on this page only). Each open page holds one event stream; the host element reports the Center's revision and bounded scene summary and the receipts. Nestor's tool composes for the most recently active page through the same prompt and validation as `/propose`, pushes the proposal as `Nestor · Core` at the page's reported revision, waits up to five seconds for the receipt and answers `proposed`, `refused` (the Center's reason), `declined` or `no-page`. Core applies nothing and keeps no scene. |
| Proof | `scripts/smoke-nestor-request.mjs` (tier `core`), `test/coauthor-provider.test.mjs`, `test/propose-relay.test.mjs`, AgentX `core/surfaces/graphysx/test/propose.test.js` | See "Verification". |

## Transport: how the page reaches Core without a key

The brief's preferred shape was the DiskX model: Core serves a page of the Center under its own
origin and `/propose` is same-origin. The Center cannot be relayed the way `<diskx-city>` is,
and the measurement (2026-10-26, a release build of `main`) says why: `dist/` is 234 MB in 1203
files, the product asset manifest alone is 1097 files and 220 MB, and the JavaScript is 74 hashed
chunks (8.5 MB) fetching `/assets/…` by absolute path and compiling WebAssembly. The three ways
were weighed:

- *A bounded static relay of `dist/` by Core.* Every asset through Core's process, path
  rewriting of the chunk graph, a cache that cannot hold the tree: that is the universal proxy
  the ecosystem seams forbid, with a different name. Rejected.
- *A sub-build of the Center as one module (`vite.*.config.ts` like `vite.diskx.config.ts`).* The
  Center is the whole front door — showroom, Nestor, editor, physics, models, skies — not a
  presentation element; a single-file build would still fetch the asset tree from somewhere.
  Rejected.
- *The Center in an iframe, with the host page as the provider.* **Chosen.** Core serves a small
  page under its own origin; that page frames the public Center from a configured origin and
  loads `<graphysx-center>`, a 6 KB module GraphysX publishes with every build at
  `/embed/center-host.js`, relayed by Core exactly like `diskx.js`. The Center keeps its own
  origin, assets and CSP; nothing is proxied. The two pages talk through `postMessage`, and
  both ends of that protocol ship from one GraphysX build, so Core carries no copy of it. Cost:
  one more embed in the build, one Core page with a `frame-src` for one origin, a build-time
  allow-list on the Center (`VITE_GRAPHYSX_HOST_ORIGINS`) so an arbitrary framing page is
  answered nothing, and the Center's `/propose` is now the host page's same-origin call to
  `/api/graphysx/propose` — no key, no relay, no cross-site POST.

What exists now, by environment:

- **Development and the built preview.** The dev server mounts `/propose` → `GRAPHYSX_PROPOSE_URL`
  (same sources as `DISKX_DATA_URL`: the shell or an ignored `.env.local`). The page opens with
  `?propose=/propose`. No key in the browser; the relay runs where the dev server runs, on the
  LAN, and Core's cross-site POST guard is never involved because the request to Core comes
  from a server, not a browser. This is the transport the proof below used.
- **The Core-served page, `/graphysx`** (AgentX, `GRAPHYSX_CENTER_URL`). The Center framed under
  Core's origin, with the host element composing on Core's origin: no `?propose=`, no relay. The
  GraphysX build the page frames must list Core's origin in `VITE_GRAPHYSX_HOST_ORIGINS`
  (loopback and same-origin are always allowed, which is how development and the smoke work);
  the public production build does not list it yet, so until the deploy workflow sets it, the
  page frames a Center that answers nothing — by design, not by accident.
- **The public deploy (`graphysx.specialblend.ca`).** No provider is configured and none is
  wired: the static host has no server, and exposing Core's composition to anonymous visitors
  is an owner decision, not a default. The field is disabled and says so. Setting
  `VITE_GRAPHYSX_PROPOSAL_URL` at build time to a same-origin `/propose` would enable it once
  a bounded relay exists on that origin (the scene store's nginx is the natural place, with a
  LAN-only or authenticated gate — see `ops/README-staging.md`).

Not done, on purpose: no generic proxy, no fourth data path, no key in the bundle, no
provider required for the front door.

## Nestor's own words

**Phase 1, delivered: pull.** The person types (or dictates) in GraphysX; Core composes;
the person decides. Core also exports `proposeWorldChange(request, { vocabulary, execute })`
from the surface module, so a Nestor tool in a Core conversation can compose through the same
prompt, the same validation and the same reply shape when it announces an intention on the
world. What it cannot do is reach the page.

**Phase 2, delivered: push.** When Nestor, in a Core conversation, announces an intention on the
world, it calls `propose_world_change` with the request. Core composes for the most recently
active `/graphysx` page — against the revision and the scene summary that page's host element
last reported — through the same prompt and validation as a typed request, and sends the
proposal on that page's event stream. The host element hands it down to the framed Center; the
Center reads it (`readPushedProposal`: the provider rules, plus an agent actor and an integer
revision), refuses it if a card is already waiting for a decision, if a live session owns the
scene, or if Nestor is not on screen, and otherwise shows it as a card attributed to
`Nestor · Core` at the revision Core composed against — stale, with Apply disabled, if the scene
moved meanwhile. Every push ends in a receipt the host posts back to Core, and the tool relays
it: `shown`, `shown` but `stale`, `refused` with the Center's sentence, or `unconfirmed` after
five seconds. Nestor can say "proposed" and never "done".

The channels weighed and why: *live sessions* (`docs/LIVE_SESSIONS.md`) are SSE too, but their
operations are scene writes by design and the store would have become a relay for Core —
rejected, as recorded before; *embedded element ownership* (`docs/LLMX_FACE_EMBED.md`) is the
shape taken, turned inside out: the host page owns a small element, the element frames the
Center, and the push lands as a message, never as a call. Core's stream per page is a fourth
route on Core, not a fourth data path: it carries proposals down and summaries and receipts up,
nothing of the scene document, and a Core restart forgets every page without losing anything.

## Verification

Local, this session (2026-10-25, America/Toronto), worktree build of `claude/objective-gagarin-3858ed`:

- `node --test test/world-vocabulary.test.mjs test/coauthor-provider.test.mjs test/propose-relay.test.mjs`
  and the validator suites: green. `npx tsc --noEmit` and `npx eslint . --max-warnings 0`: green.
- AgentX: `node --test core/surfaces/graphysx/test/propose.test.js`: green (prompt rendered from
  the vocabulary, request checks, cache, refusal catalogue, retry, profile and family-device boundary).
- `scripts/smoke-nestor-request.mjs` against the built `dist/`: no provider → field disabled,
  zero `/propose` requests; loopback provider → card with water, flock and `set-environment`,
  Apply → one `nestor` commit, entities present and exported, Undo reverses, refusal shown with
  the scene byte-identical, forged namespace refused, kinetic blocks and consoles not covered by
  the taller card.
- Browser demonstration with the real Core route composing on the live Core instance's
  inference router: recorded in `HANDOFF.md` with its captures.

Phase 2, local, 2026-10-26 (America/Toronto), worktree build of `claude/jolly-agnesi-744e4a`:

- `node --test test/coauthor-host-bridge.test.mjs`: which origins get an answer, hello/ready,
  a request through the host and its reply, pushes valid, forged, refused by the Center, and a
  receipt for each. AgentX `core/surfaces/graphysx/test/center.test.js`: page and CSP, relay,
  page streams, state and receipts, the tool's push and its delivery statuses, the cap of eight
  pages, profile and family-device boundaries. Typecheck and scoped lint green.
- `scripts/smoke-nestor-push.mjs` (tier `core`) against the built `dist/`, the host page played
  by the smoke on the same origin: handshake enables the field; a typed request is asked by the
  host frame only, never by the Center; a push lands as `Nestor · Core proposes`, inert; Apply
  is one commit by that actor; a second push while the card waits is refused; a push against an
  older revision is shown stale with Apply disabled; a forged namespace never becomes a card; a
  refusal reaches the card as Core's sentence. Captures in `output/smoke/nestor-push-*.png`.
- Seen on screen, the Core surface of the AgentX branch mounted in a loopback harness with
  inference on the live Core router (Qwen3.8 27B, 16.7 s and 4.3 s per composition), the Center
  served from this worktree's `dist/` and framed by the harness's `/graphysx`: the typed request
  "ajoute un lac avec un vol d'oiseaux au coucher du soleil" became a card with no `?propose=`
  and no relay; the tool called while that card waited answered `refused` and the page showed
  "Proposition refusée par la page : A proposal is already waiting for a decision."; after a
  discard, "remplace le ciel par une nuit étoilée avec une pleine lune" through the tool became a
  `NESTOR · CORE PROPOSES` card the scene did not follow until Apply, then revision 2 with the
  night sky and the moon, and the host reported revision 2 back to Core. Captures in
  `output/visual-receipts-20261026/center-on-core-*.jpg` (ignored, local). Not seen: a real Nestor
  conversation calling the tool — the live Core carries neither this route nor the tool until
  the AgentX pull request deploys; the tool was called on the MCP transport the way the Nestor
  harness calls every secretary tool.

GitHub CI runs the Node suites and the build; it never runs the WebGL journeys. A green run is
not visual acceptance.

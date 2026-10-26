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
| Proof | `scripts/smoke-nestor-request.mjs` (tier `core`), `test/coauthor-provider.test.mjs`, `test/propose-relay.test.mjs`, AgentX `core/surfaces/graphysx/test/propose.test.js` | See "Verification". |

## Transport: how the page reaches Core without a key

The brief's preferred shape is the DiskX model: Core serves a page of the Center under its own
origin and `/propose` is same-origin. That is **not** what ships from this session, and here is
precisely why. `<diskx-city>` is one self-contained module (4 MiB) with no asset tree, so Core
relays one file. The Center is not: its build is a graph of hashed chunks plus a 44 MB asset
tree (models, textures, HDRIs, sounds, fonts) fetched by absolute `/assets/…` paths, and its
physics compiles WebAssembly. Relaying that tree is the universal proxy the ecosystem seams
forbid, and Core's CSP (`connect-src 'self'`) would have to widen for every asset host. Making
the Center relay-able needs a GraphysX build with a configurable asset base and a Core page
that mounts it; that is a design of its own and is recorded below as the next step.

What exists now, by environment:

- **Development and the built preview.** The dev server mounts `/propose` → `GRAPHYSX_PROPOSE_URL`
  (same sources as `DISKX_DATA_URL`: the shell or an ignored `.env.local`). The page opens with
  `?propose=/propose`. No key in the browser; the relay runs where the dev server runs, on the
  LAN, and Core's cross-site POST guard is never involved because the request to Core comes
  from a server, not a browser. This is the transport the proof below used.
- **A Core-served page.** Any page Core serves can POST to `/api/graphysx/propose` same-origin
  today; the route exists and is tested. The page is what is missing.
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

**Phase 2, designed, not implemented: push.** Core submits a proposal to an open page without a
click. Constraints: the page receives an inert proposal that goes through `proposeExternal` and
the human gate, never a commit; the page must know which Core, and Core which page. Two
channels already exist and were weighed:

1. *Live sessions* (`docs/LIVE_SESSIONS.md`): SSE with tickets, members and an operation log.
   Operations there are scene writes by design — the wrong vocabulary for an inert proposal, and
   the store would become a relay for Core. Rejected.
2. *Embedded element ownership* (`docs/LLMX_FACE_EMBED.md`): the host page owns the element and
   pushes state into it. This is the right shape: a Core-served Center page (the DiskX model
   above) owns the page and can call a `proposeExternal`-equivalent on it, or post a message to
   an iframe of the Center with a build-time allow-list of host origins. Either way the push
   lands as a card. This is why the Core-served page is the next step for both the transport
   and the push.

Until then, phase 2 is a `SendMessage`-shaped idea, not a route. Nothing in this session adds a
channel.

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

GitHub CI runs the Node suites and the build; it never runs the WebGL journeys. A green run is
not visual acceptance.

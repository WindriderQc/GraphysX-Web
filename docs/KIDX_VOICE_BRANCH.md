# KidX voice: state of the unmerged branch and the decisions it waits on

Written 2026-10-25 during the branch cleanup, with main at `16b74f8`. This file exists so that
the KidX voice work is neither lost nor merged blindly while the AgentX access strategy is being
corrected. Re-read it before touching the branch, and rewrite it when a decision below lands.

## Where the work is

| | |
|---|---|
| Branch | `codex/kidx-voice-integration`, local only, never pushed, no PR |
| Tip | `57d4677` (2026-10-10), one squash commit on `origin/main` at `61580c7` |
| Behind main | 58 commits on 2026-10-25 |
| Worktree | `C:/Users/Yanik/.codex/worktrees/kidx-voice-review/GraphysX-Web` (Codex), clean, holds the `output/verify` captures of its gate |
| Product doc on the branch | `docs/KIDX_VOICE.md`: activation, commands, privacy, server configuration, acceptance boundaries |

**Superseded branch.** `codex/kidx-nestor-voice` (six commits, 2026-09-11/12) was deleted on
2026-10-25, tip `e9cbbd5`. Its code was byte-identical to the integration branch except one
smoke line; it also carried six dated LAN deployment and evidence notes that the integration
deliberately left out. Those notes were hash-verified into a local Codex archive on 2026-10-10
(the gate receipt lives at `C:/Users/Yanik/.codex/archives/graphysx-cleanup-20261008/kidx-voice-full-gate.log`).
The commit is now unreachable and a future `git gc` will prune it; nothing on GitHub ever had it.

## What it adds

A **Nestor · voix** panel on the KidX workshop screens: French speech and text conversation,
the wake phrase « Eille Nestor », a bounded follow-up window, interruption, and at most one
visual workshop action per utterance (turn the model, show a part or step, move in the PDF,
mission hint, edit the block program). KidX stays fully usable with the panel disabled or the
service down. No model, audio engine or microphone pipeline is implemented in GraphysX; all of
that is reused from AgentX Household.

Files: `src/kidx-voice.ts` (adapter), `src/kidx-voice-context.ts` (what the current screen
sends), `src/kidx-wake.ts`, `src/kidx-voice.css`, hooks in `src/kidx-app.ts`,
`src/ev3-mission-strip.ts` and `src/kidx-pdf-reader.ts`; `scripts/kidx-voice-server.mjs` (relay);
`scripts/smoke-kidx-voice.mjs` (18 fixture turns) plus two Node test files; a `kidx-voice` entry
in `scripts/verify-manifest.mjs` and an npm script.

## How it reaches AgentX today (the part that may change)

Browser → KidX's own server → Household. The browser never holds a credential and never talks
to AgentX directly.

- **Relay** (`scripts/kidx-voice-server.mjs`), mounted in the Vite dev middleware and in
  `scripts/serve-kidx.mjs`. Enabled only when the server has `KIDX_HOUSEHOLD_URL` (the Household
  origin, no path, no credentials) and `AGENTX_EXTERNAL_CONSUMER_TOKEN`. Without them
  `/kidx-voice/config` reports voice disabled and KidX runs without the panel.
- **Fixed route map, nothing else proxied.** `/kidx-voice/contract`, `/kidx-voice/session` and
  `/kidx-voice/sessions/:id/turn` go to `/api/consumers/nestor/v1/household-family/` →
  `workshop-contract`, `sessions`, `sessions/:id/turns/text`, with the bearer token added only
  on that namespace. `/kidx-voice/catalog`, `/transcribe`, `/synthesize` and
  `/synthesize/stream` go to `/api/voix/*` without the token. Four Household browser transport
  scripts (`browser-conversation.js`, `speech-language.js`, `voice-capture-worklet.js`,
  `voice-audio.js`) are fetched through `/assets/household/`; the last maps to
  `/api/voix/player.js`. Upstream redirects are refused, bodies are capped at 32 MB, turns time
  out at 125 s.
- **Session shape** the relay pins: `packId: kidx_nestor`, `modeId: family`, `scopeId: family`,
  `label: KidX LEGO`; turns are sent with `channel: voice`; synthesis is forced to
  `language: fr`, `response_format: wav`.
- **Contract assumed:** the Family workshop contract at `schemaVersion: 1`, the VoiX routes
  above, and those four Household asset names. Captured phrases can reach Household
  transcription before KidX checks the wake word; the branch documents this rather than hiding it.

## Why it is parked

Main now reaches AgentX three different ways, and `HANDOFF.md` records that the access
boundaries are being clarified on the AgentX side:

1. **DiskX**: Core relays the published module on its own origin and makes the bounded Data
   Toolbox GETs itself. GraphysX hosts nothing credentialed.
2. **LLMx public**: the browser calls the consumer routes directly; the current Core cross-site
   POST guard is a known blocker.
3. **KidX voice (this branch)**: GraphysX's own server relays with a server-held Family credential.

Pattern 3 was right for a LAN-only KidX server in September. Whether it survives depends on
decisions that belong to the AgentX work, not to this repository.

## Decisions to make before merging, and what each one costs

- **Who relays?** Keep the KidX server relay (merge as is); move it behind Core like DiskX
  (drop `scripts/kidx-voice-server.mjs`, keep the browser adapter, change its base path); or go
  direct like LLMx public (needs the Core guard resolved first, and moves a credential decision
  into the browser, which the branch deliberately avoided). Only the first option merges without
  new code.
- **Which credential?** A server-held Family consumer token in `AGENTX_EXTERNAL_CONSUMER_TOKEN`
  is the branch's assumption. If Core changes consumer identity or scoping, the relay's single
  `Authorization` line and the pinned session shape are the only places to update.
- **Do the Household transport scripts stay where they are?** The adapter loads four scripts by
  name from `/assets/household/`. LLMx on main loads the same transport; keep the two in step.
- **Does the Family workshop contract stay at version 1?** `kidx-voice-context.ts` is the whole
  payload; a contract bump is a one-file change plus the smoke fixtures.
- **Is `kidx_nestor` still the pack?** Pack, mode and scope are pinned in the relay.

## Merging when the time comes

Expect conflicts in exactly three files against today's main: `HANDOFF.md`, `progress.md` and
`vite.config.ts`. The Vite conflict is real work, not noise: main's config has since gained the
DiskX route (`createDiskxRoute` and `DISKX_*` env loading), the Cyber Race build input and an
`fs.allow` entry for worktree junctions. The voice middleware must be added **beside**
`diskxRoute` in the middleware chain; do not let the merge restore the October 10 file.
Everything else merges clean. Then: typecheck, lint, the `kidx-voice`, `kidx-workshop-reader`,
`kidx-interactive-construction` and `kidx-missions-start` checks, and a look at the captures.
The branch's own HANDOFF and progress hunks describe the October 10 state and should be merged
as history, not dropped.

## What the evidence does and does not say

On 2026-10-10 the integrated source passed the full local gate: 93 checks, 599 Node tests with
one existing skip, the 18-turn `kidx-voice` fixture smoke and `live-sessions-browser` at
131/131. That is source verification against fixtures. No real microphone capture, wake-word
accuracy, audible playback, echo behaviour, child-device or live-model session has ever been
observed. The acceptance gate for the feature remains the supervised device trial described in
`docs/KIDX_VOICE.md` on the branch, and nothing decided about transport changes that.

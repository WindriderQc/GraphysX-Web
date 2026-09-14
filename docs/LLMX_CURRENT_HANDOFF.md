# LLMx — current delivery and restart

2026-09-14. **Public release `0b906d080c32bd6b6ee563ac374ef5ef6e7e6945` is deployed.** [Run34863918465](https://github.com/WindriderQc/GraphysX-Web/actions/runs/34863918465) passed all 84 journeys and the activated-site smoke. Public `release.json` identifies that SHA and the normal browser shows the LLMx home-page entry. The delivery checkout is `codex/llmx-public-release` at `C:\Users\Yanik\codes\GraphysX-Web-llmx-verified`; subsequent documentation commits do not change the published product SHA.

## What is integrated

- Codex's whole-world commands and shared AgentX voice path, plus Claude's six-mesh voxel face, reactions (`acb1d5e`) and lighter liner (`fafb13a`). The face uses the existing renderer; its upper-right portrait is another camera over the same face.
- The agent can edit the entire authored environment: existing entities and face anchor, transforms, native materials/textures, lights, sky, gravity, particles, spline paths, behaviors, joints and physical interactions. The construction circle is a suggestion. Native validation, resource limits and the reloadable room identities remain required.
- Observations include the authored ID index, up to 32 relevant details, actual catalogs, environment settings and live positions/velocities. Proposals commit once against their dispatch revision through the native API. Undo, named saves and reload use that same runtime; audio replay cannot repeat an edit.
- Maths appear only for an explicit lesson. The native agent opens with Hello after the environment is ready. Personal and Family sessions and libraries remain separate. Audio activation follows the browser's gesture requirement.
- Household Conversation, its microphone worklet, echo reference, interruption monitor and VoiX are reused. OpenClaw Main remains the authoritative agent loop. No duplicate microphone engine, model router or conversation service was added.

## Public frontend, private agent

The production bundle uses `VITE_LLMX_AGENTX_ORIGIN=https://agentx.specialblend.icu`. This existing trusted HTTPS hostname resolves to `192.168.2.99` on the home network. The browser calls that private service directly; no private service is exposed through the public VM. See [LLMX_PUBLIC_CONNECTION.md](LLMX_PUBLIC_CONNECTION.md).

Open **https://graphysx.specialblend.ca/?app=llmx**, also reachable from the home page. Away from the home network the room remains usable and the private agent is unavailable. Connection expiry displays a reconnect action. Browser local-network and microphone permission prompts remain browser-owned.

Saved environments and remembered sessions belong to their browser origin. Localhost saves are preserved and are not automatically copied into the public site's storage. Merely changing `.ca` to another `.icu` subdomain would not create the same browser origin.

**Household 1.58.6 is deployed:** [PR620](https://github.com/WindriderQc/aiOPs/pull/620), merge `73f4e3db919138f82673f2e2c9ee6f448de042f0`, [deployment34869067634](https://github.com/WindriderQc/aiOPs/actions/runs/34869067634). Live status confirms it; all 277 Household/corpus tests and both PR/main CI checks pass. It retains PR617's cross-origin worklet fix: the worklet resolves beside the loaded Household script and GraphysX loads those scripts in CORS mode.

One actual public opening returned native `NO_REPLY` after a failed `sessions_yield` call (session `e92db22f-b6fb-4868-b7f6-c174f9467f0a`). The event's current message now includes the existing instruction to greet immediately, rather than only a passive readiness payload. Application origin and empty human audit input remain intact. There is no canned fallback, second agent loop, automatic inference retry or native-tool policy change. Two subsequent fresh public openings, including the normal in-app browser, said Hello. This is observed recovery, not a universal model-reliability guarantee.

## Verification and remaining acceptance

- Current Node checks: 550 passed with one existing Windows skip locally; 551 passed without skips on Linux CI. Typecheck, lint and normal/public-configured builds pass. All 84 registered journeys passed exactly once in the production gate. Focused world/conversation/face checks and the unchanged installed game skill client pass on the RTX 5070 Ti; captures were inspected.
- Real private-origin session `b99133c4-a8b8-4f48-80be-99fc7af80253` opened with Hello, played actual VoiX audio with changing speech samples, loaded the actual remote microphone worklet and reached listening using a synthetic microphone. No browser errors. Evidence: `output/playwright/llmx-private-origin-live/receipt.json` and `output/llmx-private-origin-live-v5.log`. Earlier failed helper runs are retained separately and are not passes.
- The offline fixture proves the actual 15-second connection deadline leaves the room usable with a French error and Reconnect. Evidence: `output/playwright/llmx-public-offline/` and `output/llmx-public-offline.log`. This is an explicit held-request fixture, not a physical network-outage test.
- Actual public Qwen turns created three red boxes in 15,798 ms, then moved the complete pyramid near x=12/z=2 and added a blue native light in 47,008 ms. The visible Save stored that world. A fresh browser loaded its actual saved storage and recovered identical entity content by ID, the light and the five-message native conversation. VoiX replay produced a real nonzero speech sample (0.156 amplitude), with no browser errors and no new inference or scene action. Evidence: `output/playwright/llmx-public-world-live-v4/` and the successful continuation `output/playwright/llmx-public-world-restored-v2/receipt.json`; world/replay captures were inspected.
- Early acceptance-helper errors (wrong transform field, polling before mount, order-sensitive array equality and a hard-coded blue shade) remain as failed helper receipts. The correction compares exact entity content by stable ID and actual saved values. The successful continuation reused saved browser storage, without rerunning model creations. Keep the separate real native NO_REPLY incident distinct from those helper mistakes.
- The normal in-app browser opened LLMx from the public home page and received a fresh Hello on 1.58.6. Screenshot inspected; public tab retained, sound enabled, microphone off. Public identity and current Household version are recorded in `output/llmx-public-final-acceptance.json`. Ephemeral automated contexts explicitly granted local-network access; normal browser acceptance is separate.
- Existing real Qwen evidence on Household 1.58.3 applied world edits and a native spline follower, restored the exact conversation/world, then replayed audio and answered an ordinary thank-you without another scene edit. Replies commonly took 18–49 seconds; this latency and occasional malformed model proposals remain limits. Existing AgentX microphone/speaker qualification is reused, not replaced by a claim of new physical acoustic acceptance.

## Delivery speed

[PR22](https://github.com/WindriderQc/GraphysX-Web/pull/22) is merged. LLMx-only changes now select their actual journeys: voice/session changes select 10 checks, room/face changes select 15, including the short integration baseline. This accumulated release changes shared runtime/dependencies and selected all 84 journeys. Twelve independent runners replace four. The successful full verification took 27m53s; the whole workflow took 34m22s including initial queueing and the 4m49s deployment job. The 551 unit tests took about six seconds; the browser collaboration journey alone took 26m07s. Future LLMx-only duration remains to be measured.

The 84 smokes are full journeys, not small unit tests. Prefer unit/contract coverage for deterministic rules and browser checks for visible integration. More runners reduce elapsed time but do not simplify the suite. See [CI_PERFORMANCE.md](CI_PERFORMANCE.md). Do not restore an unconditional full gate for small changes or add new heavy checks that repeat existing coverage.

## Local restart and external agents

```powershell
Set-Location C:\Users\Yanik\codes\GraphysX-Web-llmx-verified
$env:LLMX_HOUSEHOLD_URL='http://192.168.2.99:3080'
$env:PORT='4207'
npm run serve:llmx
```

The compiled public-configured preview is present at **http://127.0.0.1:4207/?app=llmx**. Keep this origin/port and the browser profile to recover local saves. Add `&profile=family` for Family or `&agentBridge=1` for the installed local GraphysX tools. Source edits require a fresh build; coordinate before touching the shared `dist/`.

Codex and Claude can use the existing local MCP tools for an open connected world or a separate scene. Ordinary public-site visits do not automatically attach the loopback MCP bridge. See [GRAPHYSX_MCP.md](GRAPHYSX_MCP.md) and [LLMX_CREATION.md](LLMX_CREATION.md).

Preserve the other GraphysX/Claude worktrees. In particular, concurrent MCP edits in `GraphysX-Web-llmx-integration` are not included here. This preview uses a dependency junction into that checkout. AIOps evidence is archived under `C:\Users\Yanik\codes\aiOPs\output\llmx-public-voice-20260914` and `output\llmx-opening-greeting-20260914`. Both completed AIOps worktrees and their branches were removed normally after integration/archive checks; the Lead is released. Historical attempts and receipts belong in `progress.md`.

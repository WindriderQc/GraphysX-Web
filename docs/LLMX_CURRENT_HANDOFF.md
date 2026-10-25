# LLMx — current delivery and restart

2026-09-14. **Public release `a46726440d82ccf388a381ed05e266985994fd74` is deployed.** [Run34887332538](https://github.com/WindriderQc/GraphysX-Web/actions/runs/34887332538) passed all 574 Node tests, build checks and exact HTTP acceptance (21 entry files). Public `release.json` was verified after completion. Verification took 57s and deployment 1m00s, with no hosted 3D browser. The delivery checkout is `codex/llmx-immediate-transcript` at `C:\Users\Yanik\codes\GraphysX-Web-llmx-verified`; subsequent documentation commits do not change the published product SHA.

PR25 displays the exact submitted user text at dispatch, before response headers or deltas, for typed and voice messages. A waiting label becomes a terminal label on failure or confirmed interruption, and completion never duplicates the user row. The existing text browser journey passes locally with delayed response headers and inspected pending/interrupted captures in `output/playwright/llmx-immediate-transcript/`; the installed skill client also passes. All 50 scoped conversation client tests pass. No backend or voice-pipeline change. Public identity and workflow evidence live in `output/llmx-immediate-transcript-public-release.json` and `output/llmx-immediate-transcript-deploy.log`.

The portrait now excludes the ephemeral thinking particles during its close-up pass, removing their blue/white halo. The main view retains the particles; the shared face, lights and render loop are unchanged. Local before/after captures and a completed dialogue fixture were inspected (`output/playwright/portrait-after-final`); 571 Node tests pass with one existing Windows skip. The installed skill client also passes. Publication evidence: `output/portrait-public-release.json` and `output/portrait-publish-ci.log`. Claude's sculpted lighting (`30bcb5a`), liner shadow and MCP reconnection remain integrated; their older full-journey evidence stays historical.

## What is integrated

- Codex's whole-world commands and shared AgentX voice path, plus Claude's six-mesh voxel face, reactions (`acb1d5e`), lighter liner (`fafb13a`), liner-only shadow (`e6c1e70`) and sculpted normals with camera-side fill (`30bcb5a`). The finish retains `smoothNormals: 0.7` and `fill: 0.35`. The face uses the existing renderer; its upper-right portrait is another camera over the same face.
- The agent can edit the entire authored environment: existing entities and face anchor, transforms, native materials/textures, lights, sky, gravity, particles, spline paths, behaviors, joints and physical interactions. The construction circle is a suggestion. Native validation, resource limits and the reloadable room identities remain required.
- Observations include the authored ID index, up to 32 relevant details, actual catalogs, environment settings and live positions/velocities. Proposals commit once against their dispatch revision through the native API. Undo, named saves and reload use that same runtime; audio replay cannot repeat an edit.
- Maths appear only for an explicit lesson. The native agent opens with Hello after the environment is ready. Personal and Family sessions and libraries remain separate. Audio activation follows the browser's gesture requirement.
- Household Conversation, its microphone worklet, echo reference, interruption monitor and VoiX are reused. OpenClaw Main remains the authoritative agent loop. No duplicate microphone engine, model router or conversation service was added.

## Public frontend, private agent

The production bundle uses `VITE_LLMX_AGENTX_ORIGIN=https://agentx.specialblend.icu`. This existing trusted HTTPS hostname resolves to `192.168.2.99` on the home network. The browser calls that private service directly; no private service is exposed through the public VM. See [LLMX_PUBLIC_CONNECTION.md](LLMX_PUBLIC_CONNECTION.md).

Open **https://graphysx.specialblend.ca/?app=llmx**, also reachable from the home page. Away from the home network the room remains usable and the private agent is unavailable. Connection expiry displays a reconnect action. Browser local-network and microphone permission prompts remain browser-owned.

Saved environments and remembered sessions belong to their browser origin. Localhost saves are preserved and are not automatically copied into the public site's storage. Merely changing `.ca` to another `.icu` subdomain would not create the same browser origin.

**Household 1.58.11 is deployed:** [PR627](https://github.com/WindriderQc/aiOPs/pull/627), merge `c5d769543d32eb5d9b457d08ed5fcd4d9ba3a42a`, [deployment34885837981](https://github.com/WindriderQc/aiOPs/actions/runs/34885837981). Live status confirms it; all294 Household tests and48 existing GraphysX client tests pass. A failed native reply no longer means its execution is still active. Matching terminal events acknowledge termination; a delayed receipt may reconcile the exact recorded run without repeating inference. Legacy failed audits without run identity retain the existing New conversation escape. PR626's automatic tool choice and the earlier greeting, worklet and shared voice fixes remain integrated.

One actual public opening returned native `NO_REPLY` after a failed `sessions_yield` call (session `e92db22f-b6fb-4868-b7f6-c174f9467f0a`). The event's current message now includes the existing instruction to greet immediately, rather than only a passive readiness payload. Application origin and empty human audit input remain intact. There is no canned fallback, second agent loop, automatic inference retry or native-tool policy change. Two subsequent fresh public openings, including the normal in-app browser, said Hello. This is observed recovery, not a universal model-reliability guarantee.

## Verification and remaining acceptance

- Current recovery acceptance restored this task's actual interrupted session, used the visible New conversation button and received a real Qwen reply in24.3s. Exact authored world content and the old interrupted audit were unchanged; the rendered answer was inspected with no page errors. The user's separate blocked tab was not exposed through the connected browser, so recovery of that particular tab is not claimed. Evidence: `output/playwright/llmx-turn-recovery-live/receipt.json` and `output/llmx-turn-recovery-deploy.json`. The temporary AIOps recovery source worktree is removed after integration; this GraphysX preview remains active.

- Current public regression acceptance: the exact capabilities question received a natural answer from `qwen3.8:27b-mtp-q8_0` in27.3s. The same native session then applied a small blue cube and returned its browser receipt in6.4s. The restored answer and clear portrait during real thinking were inspected, with no page errors. The immediate cube capture precedes camera framing completion; its command/receipt is verified, not final visual placement. Evidence: `output/llmx-portrait-dialogue-release.json` and `output/playwright/llmx-natural-reply-public-restored/receipt.json`.
- Two probe mistakes remain recorded separately: changing views interrupted an unfinished greeting; Chromium then refused a finished response body read in a later attempt. Native history confirmed that question completed. The continuation restored the exact session without generating the answer again. These were acceptance-script failures, not another forced-tool failure. The temporary AIOps source worktree and branch are removed; the delivery preview and its dependency junction remain active.

- Visual/source baseline `0a13e75`: 563 Node passes and one existing Windows skip locally, 564 without skips on its Linux CI, typecheck, lint, build, both Rapier probes and the local LLMx smoke (1m15s). All 84 journeys have passing coverage across that first attempt and its group retry. Family passed locally in 6m12s with no browser errors; its mobile capture was inspected. The unchanged installed game skill client's inspected ready-face capture has 23,091 cubes and an actual native opening/voice sample. Receipts: `output/llmx-sculpted-face-merge-verify.log`, `output/playwright/llmx-sculpted-face-ready/` and `output/playwright/llmx-sculpted-face-family/`. Current delivery-tooling tests add the HTTP fixtures: 570 local unit passes plus one Windows skip, 571 Linux passes.
- Real private-origin session `b99133c4-a8b8-4f48-80be-99fc7af80253` opened with Hello, played actual VoiX audio with changing speech samples, loaded the actual remote microphone worklet and reached listening using a synthetic microphone. No browser errors. Evidence: `output/playwright/llmx-private-origin-live/receipt.json` and `output/llmx-private-origin-live-v5.log`. Earlier failed helper runs are retained separately and are not passes.
- The offline fixture proves the actual 15-second connection deadline leaves the room usable with a French error and Reconnect. Evidence: `output/playwright/llmx-public-offline/` and `output/llmx-public-offline.log`. This is an explicit held-request fixture, not a physical network-outage test.
- Actual public Qwen turns created three red boxes in 15,798 ms, then moved the complete pyramid near x=12/z=2 and added a blue native light in 47,008 ms. The visible Save stored that world. A fresh browser loaded its actual saved storage and recovered identical entity content by ID, the light and the five-message native conversation. VoiX replay produced a real nonzero speech sample (0.156 amplitude), with no browser errors and no new inference or scene action. Evidence: `output/playwright/llmx-public-world-live-v4/` and the successful continuation `output/playwright/llmx-public-world-restored-v2/receipt.json`; world/replay captures were inspected.
- Early acceptance-helper errors (wrong transform field, polling before mount, order-sensitive array equality and a hard-coded blue shade) remain as failed helper receipts. The correction compares exact entity content by stable ID and actual saved values. The successful continuation reused saved browser storage, without rerunning model creations. Keep the separate real native NO_REPLY incident distinct from those helper mistakes.
- The normal in-app browser opened LLMx from the public home page and received a fresh Hello on 1.58.6. Screenshot inspected; public tab retained, sound enabled, microphone off. Public identity and current Household version are recorded in `output/llmx-public-final-acceptance.json`. Ephemeral automated contexts explicitly granted local-network access; normal browser acceptance is separate.
- Existing real Qwen evidence on Household 1.58.3 applied world edits and a native spline follower, restored the exact conversation/world, then replayed audio and answered an ordinary thank-you without another scene edit. Replies commonly took 18–49 seconds; this latency and occasional malformed model proposals remain limits. Existing AgentX microphone/speaker qualification is reused, not replaced by a claim of new physical acoustic acceptance.

## Delivery speed

Current policy: GitHub executes no 3D browser. One hosted job runs static checks and selected
Node contracts; visual checks stay local with inspected captures on the changed revision.
After activation, HTTP verifies the SHA and exact built HTML/JavaScript/CSS, retaining rollback
on mismatch. No self-hosted runner or new approval service is required. The first real delivery
took **2m31s**, including verification 58s and deployment 1m25s. The measurements below
are historical receipts from the preceding hosted-rendering policy.

[PR22](https://github.com/WindriderQc/GraphysX-Web/pull/22) is merged. LLMx-only changes now select their actual journeys: voice/session changes select 10 checks, room/face changes select 15, including the short integration baseline. The first accumulated release selected all 84 journeys: verification 27m53s and workflow 34m22s on twelve runners. The liner-only release selected 15 journeys on five runners: verification 12m49s, deployment 4m27s, workflow 17m22s, with 551 Linux unit tests per runner. The current broader MCP/face release selected the full inventory and took 53m02s including one failed group and its unchanged retry; deployment took 4m42s. The Family rerun's 8m18s is effectively the preceding version's 8m19s, but its deadline-headroom warning remains. These are measured receipts, not an expectation that every release takes the same time.

The 84 smokes are full journeys, not small unit tests. Prefer unit/contract coverage for deterministic rules and browser checks for visible integration. More runners reduce elapsed time but do not simplify the suite. See [CI_PERFORMANCE.md](CI_PERFORMANCE.md). Do not restore an unconditional full gate for small changes or add new heavy checks that repeat existing coverage.

## Local restart and external agents

```powershell
Set-Location C:\Users\Yanik\codes\GraphysX-Web-llmx-verified
$env:LLMX_HOUSEHOLD_URL='http://192.168.2.99:3080'
$env:PORT='4207'
npm run serve:llmx
```

The compiled preview is present at **http://127.0.0.1:4207/?app=llmx**, using the local Household relay. The owning task restarted it after the combined build: PID38400 replaced PID8596, with the same loopback address and Household origin. The MCP task confirmed its saved 104-entity scene reconnected under a new connection ID without reloading, retaining revision 1 and `loaded: true`. Keep this origin/port and the browser profile to recover local saves. Add `&profile=family` for Family or `&agentBridge=1` for the installed local GraphysX tools. Source edits require a fresh build; coordinate before touching the shared `dist/`.

Codex and Claude can use the existing local MCP tools for an open connected world or a separate scene. Ordinary public-site visits do not automatically attach the loopback MCP bridge. See [GRAPHYSX_MCP.md](GRAPHYSX_MCP.md) and [LLMX_CREATION.md](LLMX_CREATION.md).

Preserve the other GraphysX/Claude worktrees. The committed MCP integration `2a4f7be` is included in the published release; its code/tests match that commit exactly. Its owning task independently verified the public standalone editor and final release identity. Other uncommitted integration-checkout files still belong to their owners. This preview uses a dependency junction into that checkout. AIOps evidence is archived under `C:\Users\Yanik\codes\aiOPs\output\llmx-public-voice-20260914` and `output\llmx-opening-greeting-20260914`. Both completed AIOps worktrees and their branches were removed normally after integration/archive checks; the Lead is released. Historical attempts and receipts belong in `progress.md`.

## Local MCP repair and Nestor Family inventory (2026-10-24 UTC)

This local check does not supersede the historical release receipts above.
Only the GraphysX script argument in `C:\Users\Yanik\.codex\config.toml` changed:
`GraphysX-Web-llmx-integration\tools\graphysx-mcp.mjs` became
`GraphysX-Web\tools\graphysx-mcp.mjs`. Claude's user registration already targets
that file; its configuration was preserved. Both global skill junctions resolve to
`.agentx\runtime\skills\graphysx-20261023`, with identical SKILL.md hashes.
No security settings, credentials, model/persona configuration or network exposure changed.

Validation levels remain separate:

- The bundled Codex CLI reread the repaired registration. An older CLI rejects the
  existing `service_tier = "default"`; it was not changed for this repair.
- Standard MCP initialization exposes eight tools and the World API resource.
  Two protocol clients exercised a real isolated browser against the existing dist:
  create a cube, sphere and connecting bar, read, frame, capture, inspect, then
  remove all four entities (including light), leaving entityCount zero. No save,
  audio or user browser profile was used; the temporary browser and preview closed.
  These clients are protocol harnesses, not Codex and Claude models.
- A fresh ephemeral Codex model session read its skill and exposed all eight tools.
  The initial observe lost the test tab during cleanup. A bounded follow-up kept
  the browser open until client completion: model calls worlds, observe, read/query
  and final observe succeeded on isolated `codex-client-proof`, revision 1.
  The single edit/spawn of `codex-client-marker` was rejected before execution:
  `MCP tool call requires approval, but approval policy is never`. No retry or
  permission-policy change was made. Query confirmed the marker absent and both
  model and independent harness confirmed entityCount 0, revision 1. The temporary
  browser and owned loopback preview then closed. Real client reading is validated;
  model-driven mutation remains blocked by the client's approval policy.
- Claude skill/config files are readable, but no fresh Claude model session was
  validated. No Claude CLI was found in the inspected normal installation paths;
  Get-AppxPackage discovery returned Access denied and was not retried.
- This dot task exposes no GraphysX tool. Local MCP registration does not install
  tools into dot, its parent or voice. The existing Household/LLMx browser proposal
  path is a separate integration and was not exercised here.

Evidence and rollback copies are under
`C:\Users\Yanik\AppData\Local\Temp\graphysx-mcp-repair-e733b38c-dd16-4d35-83d5-e3a47a020305`:
`protocol-browser-receipt.json`, `world.png`, `browser.png`, `codex-fresh.txt`,
`codex-client-receipt.json`, `codex-client-events.jsonl`, `codex-client-final.txt`,
`codex-config.before.toml`, `claude-config.before.json`, and this document's before copy.
For rollback, reverse only the MCP script-path replacement after checking for
concurrent edits; restoring the entire config is safe only if it is otherwise unchanged.
The prior `.claude/launch.json` modification belongs to another task and is preserved.

### Product inventory and next scope (proposal, not implementation)

Priority: Nestor's expressive avatar and reusable 3D explanations, with **Family
Earth3D/ISS first**, then sky guidance/stars; weather with dated cloud imagery is
part of the proposed visual package. No recurring notification or subscription is authorized.

- **Avatar, source verified:** `src/agent-world-face.ts`, `llmx-face-pose.ts`,
  `llmx-face-reactions.ts` and `llmx-face-forge.json`. Reactions follow observable
  creation/voice events (glance, warmth, attention, nod). Context-driven expression
  is not reliable detection of a person's emotions. No new audio test was run.
- **Prefabs, source verified:** `src/agent-world-prefabs.ts` provides composable
  entity templates with position, scale, palette and tags (including CubX assembly,
  signal beacon and orbital sculpture). The simple MCP relation diagram was rendered
  and inspected in this task; these prefab families were not newly smoke-tested.
- **Earth/ISS, source verified:** `src/orbital-observatory.ts` preserves SBQC Earth3D,
  Globe, Trajectory and Starfield provenance, observer radius and pass estimates.
  It uses a fixed inclination/phase/altitude and accelerated simulated period;
  its cloud map is `/assets/sbqc/orbital/earth-clouds.png`. This is a simulation and
  local image, not demonstrated live orbital predictions or refreshed weather.
- **Family route, documented:** `docs/LLMX_CREATION.md` describes `profile=family`,
  separate browser library/session identity, bounded observations and the existing
  Household `graphysx_reply` proposal/receipt path. This task did not validate the
  current AgentX deployment or its available Family tools.
- **External inventory limit:** reading `C:\Users\Yanik\codes\AgentX-Ecosystem`
  with Git returned Permission denied. No retry or alternate access was attempted.
  DataAPI and the current ISS detector remain unverified; do not infer absence.

The next scoped design should identify the existing authorized orbital/weather
sources and Family tools before proposing adapters or new prefabs. Separate a
geometric pass from actual viewing conditions: observer horizon, illumination,
local darkness and weather; show data source, epoch, update time/timezone and stale
status. Keep precise observer location local unless separately authorized.
A sky background is not a calibrated sky map. Any later cloud layer must disclose
image timestamp/coverage and distinguish observations from forecasts. Integrating
these data and Nestor guidance is still to be specified; no product code, paid source,
scheduler, deployment or automatic implementation was added by this inventory.
### Original SBQC ISS view recovered (2026-10-24 UTC)

The historical + TLE forecast view was found in SBQC-public and its identical
SBQC-graphysx-public copy: `views/issDetector.ejs`, `/iss-detector`, with
`iss-main.js`, `issDetector.js`, `issOrbitPredictor.js` and `Trajectory.js`.
https://specialblend.ca/iss-detector returned HTTP 200; its `/api/tle` and `/api/iss`
returned HTTP 500, while `/api/live-cloud-map` returned PNG/200. This is a different,
more relevant source than the GraphysX simulated orbit inventoried above.
32 files were recovered unchanged into `output/sbqc-iss-recovery-20261024/source`;
all match the 2026-10-23 consolidation manifest. That folder's `RECOVERY.md`,
`manifest.json` and `http-receipt.json` contain the dependency map, useful SBQC
project triage, provenance limits and minimal Family/Nestor proposal. The copy is
source recovery, not a runnable installation or accepted live forecast. No service,
location transmission, runtime implementation, commit or deployment was performed.
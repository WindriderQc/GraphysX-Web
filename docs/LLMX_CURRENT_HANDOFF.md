# LLMx — current integration and restart

2026-09-14. GraphysX is a local preview. The private AgentX conversation is deployed on the LAN. No public GraphysX deployment is included in this handoff.

## Frozen merge candidate

Use **codex/llmx-verified-merge**, candidate **5106d29**, in `C:\Users\Yanik\codes\GraphysX-Web-llmx-verified`.

This candidate contains Codex's full-world/voice work `59b7430` and Claude's face `bc6d403`, merged without conflict as `1f6204b`. Later integration fixes make pointer gaze follow the actual transformed face, avoid unrelated detailed scene context, restore the npm 10 optional peer lock entry, and verify all six named face meshes. Native scene, renderer and voice implementations remain shared.

The separate checkout is deliberate: concurrent MCP edits appeared in `GraphysX-Web-llmx-integration`. They were preserved and are not part of this candidate. Claude's subsequent face-reaction commit on `claude/llmx-polish` is also outside this frozen verification scope.

Full verification of 5106d29 finished at [run 34804919818](https://github.com/WindriderQc/GraphysX-Web/actions/runs/34804919818): 83 distinct checks passed and three reached the unchanged ten-minute deadline (`llmx-creation-actions`, `llmx-creation-library`, `llmx-conversation`). There were no other failed checks. Logs and all four artifact bundles are archived in this checkout under `output/llmx-ci-shard-*.log` and `output/llmx-final-ci/`. The superseded bb5471d run was cancelled when that final test revision was dispatched.

The follow-up branch `codex/llmx-verification-journeys` splits those three long journeys into seven independently registered checks. It preserves all 142 existing assertion calls, proven by an AST comparison (`output/llmx-split-assertion-coverage.json`), while isolating receipt actions, math steps, named worlds, Family/mobile persistence, session recovery, conversation turns and voice replay. Every fixture still drives the product controls. No deadline, renderer quality or product implementation was changed. All seven checks, Node tests and Rapier probes pass locally on hardware; scoped software-rendered CI is pending. This test-only follow-up does not turn the old full run green retroactively.

Claude's second gate on `bc6d403` completed naturally: 80 checks passed and four failed. Its exact log remains in `C:\Users\Yanik\.claude\worktrees\llmx-gate\output\verify-gate-merge-bc6d403.log`. Failures: an MCP fixture missing its world label; a hidden math lesson; the creation-library ten-minute deadline; and the obsolete five-mesh assertion after Claude added a sixth mesh. The first, second and fourth fixes are in this candidate. The final library journey passes locally on hardware; the full runner result remains distinct evidence. Claude's worktree was not changed or interrupted.

## Running after a reboot

```powershell
Set-Location C:\Users\Yanik\codes\GraphysX-Web-llmx-verified
$env:LLMX_HOUSEHOLD_URL='http://192.168.2.99:3080'
$env:PORT='4207'
npm run serve:llmx
```

Open **http://127.0.0.1:4207/?app=llmx**. Add `&profile=family` for the existing Household Family agent, or `&agentBridge=1` to attach the visible world to the installed GraphysX agent tools. The home page also offers LLMx. Preserve the browser profile and origin/port to recover named environments and the exact conversation. The compiled build and dependencies are present locally. A future source edit requires a new build; coordinate with any active verification before building.

## Current behavior

- The agent edits the entire authored world through native commands: existing scenery and movable face anchor, transforms, materials/textures, lights, sky/gravity, particles, spline paths, behaviors, joints and physical interactions. The former construction circle is only a suggested workshop. Schema/resource limits still apply; the face and anchor identities remain required for a reloadable room.
- GraphysX sends the authored entity index, up to 32 relevant details, read-only live positions/velocities, environment settings and actual asset catalogs. It validates each proposal against the dispatch revision and commits it once through the native API. Undo, redo and named saves use that same runtime. Audio/history replay never repeats an edit.
- The face is rendered once. The upper-right portrait is a second camera pass over that same face while the main camera explores a creation. Maths are visible only while explicitly teaching maths; quantities and lesson steps are deterministic and survive undo/reload.
- Voice reuses AgentX's existing Household Conversation, microphone worklet, echo reference, interruption monitor and VoiX player. LLMx supplies the validated result and actual selected voice. Text/replay prepares one phrase ahead through the same player. No second microphone engine or agent loop was introduced. Existing microphone/speaker qualification was reused, as Yanik requested.
- The application announces environment readiness and the selected native agent opens with Hello. Audio activation remains subject to the browser's user-gesture requirement. Family and personal sessions/libraries stay separate.

## AgentX release and observed limits

**Household 1.58.3** is deployed: [PR616](https://github.com/WindriderQc/aiOPs/pull/616), merge `8c686169665edaf57df1f699ffbdd954b7c35849`, [successful deployment 34806092679](https://github.com/WindriderQc/aiOPs/actions/runs/34806092679). All 270 Household tests and both PR checks pass. The live status endpoint confirms 1.58.3. This includes the behavior/audit corrections from [PR615](https://github.com/WindriderQc/aiOPs/pull/615).

The native OpenClaw session receives the existing `graphysx_reply` Responses client tool. It returns one spoken reply with an optional native proposal. Ordinary replies may also use the existing verified same-run final-answer projection, without a tool or an additional inference. Raw output_text preambles, wrong-run answers and text-only scene proposals are never used as browser actions. The browser's exact applied/rejected receipt is retained on that turn and reaches the next human turn in the same session; submitting a receipt does not start another inference. Native tools, memory, permissions, GPU routing, model files and context limits remain unchanged.

Real Qwen exposed two malformed motion cases: nested `follow-spline` settings with `type:"behavior"`, and `steering:{}` on a kinematic object. The guide/tool schema now describes flat native behaviors and explicitly omits steering for spline following. Mongoose had removed the empty steering block from the audit, making a rejected request look valid in history; audit minimization is now disabled. An actual Mongoose probe reproduces the old loss and verifies exact preservation. The original OpenClaw transcript establishes that the browser correctly rejected the invalid command; no speculative physics fix was made.

Model reliability and latency remain limitations. Earlier full real-model runs applied both world edits and a native follower and played actual VoiX audio. After the face merge, one run completed those actions but exposed missing assets in the temporary test build; the test assets were corrected and the error is retained. Subsequent probes found the malformed commands above. A 1.58.2 turn returned plain text instead of the required tool; another completed both requested edits but then rejected an ordinary thank-you for the same missing-tool reason. Version 1.58.3 reuses the verified native conversation path for replies with no scene mutation. Do not present this as universal model reliability. Measured scene/dialogue replies have commonly taken 18–49 seconds. No physical microphone capture was used for these playback probes.

Final real session `ee79e608-da65-4da4-acb0-b1a80bfe8c2c`: Qwen applied the existing light/texture changes and distant platform in 22,952 ms, then a native spline/kinematic follower in 21,272 ms. After 1.58.3, the same conversation and actual authored world were restored in a fresh test browser. Actual VoiX replay began in 1,046 ms; the subsequent ordinary reply was “Avec plaisir.” in 17,776 ms, with no scene receipt, unchanged native revision and no browser errors. The new build is served on4207 and its index matches the 5106d29 build receipt. The normal in-app browser restored Yanik's saved personal Forge and conversation with microphone and sound off. That tab is left open as the deliverable.

## Verification receipts

On the merged product: 538 Node tests pass with one existing skip; typecheck, lint and build pass. The test-only follow-up adds one passing verification-selection test. Local browser checks pass for face replacement/appearance/materials/save/reload/mobile, native world edits and moving followers, maths visibility/quantities/undo, named environments and Family isolation, and two MCP clients sharing edits, revision conflicts, save/load, camera and a real PNG capture. The unchanged installed develop-web-game action client also passes. The renderer is the verified RTX 5070 Ti. Keep these receipts distinct from the completed full software-rendered run and its three timeout failures described above.

Current local receipts in this checkout: `output/llmx-world-5106.log`, `output/llmx-verified-agent-mcp.log`, `output/llmx-verified-creation-actions.log`, `output/llmx-verified-creation-library.log`, and screenshots under `output/playwright/`.

Earlier merged/static/live receipts remain under `C:\Users\Yanik\codes\GraphysX-Web-llmx-integration\output`: `llmx-merged-final-check.log`, `llmx-merged-lint.log`, `llmx-merged-lifecycle-fixed.log`, `playwright/llmx-merged-*`, `playwright/llmx-final-live/failure.json` (successful real edits followed by the old dialogue failure) and `playwright/llmx-live-continuation/receipt.json` (successful continuation on1.58.3). Screenshots/state from the face lifecycle, native world, final conversation and unchanged skill client were inspected. The alternate-output build initially lacked the product assets because the existing asset plugin targets dist; the normal manifest's 1096 files were copied into the test build. The preserved failed run is not counted as a pass. The final 5106d29 build was generated normally in the isolated verified checkout and includes the complete manifest.

AIOps evidence is archived in `C:\Users\Yanik\codes\aiOPs\output\llmx-world-voice-20260913` and `output\llmx-behavior-contract-20260914`. Both completed AIOps worktrees/branches were removed normally after ancestry and archive checks, and the Lead was released. GraphysX checkouts containing concurrent work, saved data or evidence are retained. See [LLMX_CREATION.md](LLMX_CREATION.md) for the authored-world contract and [GRAPHYSX_MCP.md](GRAPHYSX_MCP.md) for the existing agent tools. Historical milestones remain in `progress.md`.

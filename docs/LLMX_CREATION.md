# LLMx creation, named worlds and early arithmetic

The product entry remains `?app=llmx`. `?app=llmx&profile=family` selects the existing Household Family agent and a separate browser library/session identity. Household 1.55.0 introduced this integration through AIOps PR602. The continuation correction is Household 1.56.2 through PR604, merge `054cb0442be9e5c812e75cef5d0925fc73fd3b1c`; PR603 first corrected the malformed-output problem witnessed with Qwen. These releases preserve the sound-library integration. Deployment and live acceptance are recorded in the current handoff.

## One native scene path

The conversation sends a bounded current observation: environment identity, generation plus native runtime revision, build zone, created objects, current arithmetic configuration/result and the last applied/rejected receipt. Descriptive scene content remains observation data. Household binds the proposal to the immutable environment and revision captured for this request; the model does not supply concurrency tokens. The browser still compares that dispatch revision with its current world before any commit.

A complete human-turn response can carry `sceneProposal` with native `spawn`, `update` or `remove` commands, or a mutually exclusive `math` configuration. `llmx-actions.ts` preflights with the same canonical document validator used by the scene service, then commits once through `api.commit`. The face and Forge stay outside this editing scope. Replayed history/audio does not execute commands. A changed world or native revision rejects the old proposal before touching the scene or undo history.

Created primitives belong to `llmx-created-*`. Composed transforms and geometry are bounded within the Forge build area; parent scaling cannot hide an oversized object. Arithmetic IDs and their parent group are reserved for the deterministic lesson builder. A creation accent and camera movement follow accepted native commits only. Undo and redo use the existing runtime history.

The browser reports its actual outcome to the exact completed Household turn. Household retains the proposal and receipt in its existing audit, without another agent loop. A repeated receipt is idempotent; a conflicting receipt is rejected. Math and rejected-action messages replace the transcript/replay text with the observed result. A receipt failure never retries the creation and is visible in conversation status. Openings cannot create objects. Incomplete structured output is never treated as a partial action or spoken as JSON.

## Environments

`LlmXLibrary` holds named scene documents in one atomic browser value per profile. It supports exact selection, save/update, copy, duplicate, rename and deletion. Opening a copy never renames or replaces its source. Scene data and conversation identity remain separate; transcripts are not stored in worlds.

The first personal load migrates `graphysx.llmx.forge.v1` while preserving its original bytes. Family never reads that personal value. Invalid libraries and quota/concurrent-tab failures do not silently overwrite saved data. Unsaved work is saved through the same named library before changing worlds, changing profile or leaving; a new unnamed world receives a free name. Explicit navigation stays in the current world if that preservation fails. Browser page closure is best effort, so clearing browser data still removes local worlds.

## An arithmetic table, one cube at a time

Counting, addition and non-negative subtraction use integer quantities from 0 to 20. Equal cubes occupy single-layer groups in rows of five. Each step moves exactly one cube between groups. Zero has a visible numeric marker and no pretend counting cube. Numbers and the equation are ordinary box segments in the shared renderer.

One validated configuration drives units, numbers, labels, result and explanatory text. The LLM can choose a new exercise or request `scene.math: {action:"next"}`. Household resolves that model-only intent to the current request observation plus exactly one step, returning the existing full math configuration. Historical proposals never supply that step. A finished or absent lesson rejects `next`; the model cannot supply numeric truth. The configuration is authored in the root entity's tags. Restore verifies the visible cubes and glyphs against that configuration, and refuses a tampered lesson. Each action is one native commit, so undo/redo and named save/reload preserve the exact step. There is no per-frame history or separate animation loop.

The recovered formula visualizer is still a future lesson source; its decorative height transform must be separated from mathematical coordinates before presenting it as a rigorous graph. This milestone does not reinterpret the old formula geometry as numerical truth.

## Verification and limits

The registered browser journeys are `llmx-creation-actions` and `llmx-creation-library`; they use intercepted Household responses to check actual UI creation, exact receipts, stale edits, undo/redo, quantities, named worlds, reload and Family isolation. The direct `smoke-llmx-creation.mjs` entry still runs the complete original journey. The two fresh-browser scenarios preserve its 71 assertion calls while keeping each process within the existing ten-minute deadline. Existing `llmx` and `llmx-conversation` cover the face lifecycle, arrival, voice controls and interruption. Real local-model/browser acceptance is recorded separately in the current handoff.

No production dependency, second renderer, public endpoint, model file or context-limit change is introduced. Household reuses the existing OpenClaw/AgentX route and VoiX transport. Family isolation is a scoped household experience, not a newly invented login system. Microphone/speaker quality and children's physical use still need operator acceptance.

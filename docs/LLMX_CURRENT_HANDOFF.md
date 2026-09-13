# LLMx — integrated application and restart

2026-09-13. Private LAN conversation is deployed; GraphysX runs from the local integration branch. No public GraphysX deployment.

## Restart after reboot

```powershell
Set-Location C:\Users\Yanik\codes\GraphysX-Web-llmx-integration
$env:LLMX_HOUSEHOLD_URL='http://192.168.2.99:3080'
npm run serve:llmx
```

Open **http://127.0.0.1:4207/?app=llmx**, or choose **LLMx · Forge nocturne** on the home page. Branch: `codex/llmx-integration`, base d7c9937. Dependencies and the compiled build are already present; no production dependency was added. Keep the same browser profile and origin/port to recover the saved environment and exact conversation. Restart this process after a PC reboot. After changing source code, run `npm run build` again. For live development, replace the last command with `npm run dev -- --host 127.0.0.1 --port 4207 --strictPort`.

The backend is Household **1.54.0**, installed through [AIOps PR 600](https://github.com/WindriderQc/aiOPs/pull/600), merge 71968ac5199543987cff2358ebce8d6c12b17950. Deployment run 34782936932 succeeded; the live container was healthy and reported version 1.54.0. Product pins, VoiX deployment, GPU routing, model files and context limits were preserved.

If AgentX is unavailable, the Forge remains usable. Restore the service and choose **Reconnecter**. A missing saved session can be replaced with **Nouvelle conversation**. An interrupted or uncertain opening is never replayed automatically. **Réécouter** uses the stored completed reply's exact provider and voice.

## Delivered behavior

- Minimal tiled floor and altar, sky/fog, copper and cyan lighting, bloom and particles. The removed towers, rings and peripheral cylinders are absent from the new default. A pre-existing saved room is preserved; use **Environnements → Revenir au décor d’origine**, then **Sauvegarder**, to replace it.
- A dense voxel face assembles from below during the 7.5-second approach. Skip, reduced motion and camera interaction settle assembly immediately. Gaze and expressions share the host's existing loop.
- The face is a saved agent child of the original group anchor. Appearance survives patch/state/export/load. Child entities and face material ownership survive replacement; device quality changes density without changing the saved identity.
- One private Household session serves text and voice through the local relay and existing Personal/OpenClaw conversation. No generic private recent session is silently adopted.
- AgentX originates a real **Hello** application turn after visual, session and audio readiness, or explicit text choice. No fake human greeting or canned assistant response. Autoplay restrictions produce an audio/text choice; microphone capture starts from **Parler**.
- The existing VoiX player feeds an analyser; the face follows played speech amplitude and brightness. Waiting/generation animations reflect transport state, not model reasoning or GPU load. Text-only mode produces no pretend lip sync.
- Stop, visibility changes, world reload, exit and new conversation invalidate stale callbacks and stop playback/capture. A new session can recover from unconfirmed cleanup while retaining a warning and requiring the human to start.
- One environment is saved locally. Session identity is stored separately. **Quitter LLMx** returns to the AgentX Center.

## Architecture seams

`src/llmx-app.ts` mounts the Forge and conversation. The conversation controller owns browser interaction and shared voice I/O; the typed client owns exact-session transport, opening deduplication and NDJSON. The audio adapter loads the existing Household/VoiX modules and observes playback. The local relay maps supported routes to the existing private consumer.

The shared persistent appearance contract is `{kind:"voxel-face", asset:"forge-mask", palette:"forge", seed:1}`; null restores the ordinary avatar. Broader renderer configuration remains internal. Invalid appearance is rejected before rollback can rebuild the room. Driver snapping avoids indefinite static-buffer uploads; the rig owns its materials and disposal.

Thinking particles are transient runtime entities outside the authored document and undo/save history. Creation camera and visual accents exist, but scene creation awaits an accepted, validated scene-command path. The diagnostic /llmx-preview.html contains simulated speech controls; the product route uses actual conversation audio.

## Visual integration and ownership

Claude's two finished lanes are claude/llmx-forge (pushed through 69fe2a5) and claude/llmx-face-forge (handoff 1118377, later front-door documentation). Visual commits were integrated through Forge 70541b2 and face 894e623, followed by Codex runtime and mouth corrections. Untracked preview copies in those worktrees remain theirs.

Yanik's floating mouth blocks had two causes: ellipsoid-distance approximation accepted interior voxels as surface, and lip movement inverted lower rows. The correction uses actual surface sign crossings and continuous jaw/lip influence. Tests check an empty mouth interior, non-inverting rows and connected lips at amplitudes 0/.3/.6/1 for all three quality levels. Colors alone could not fix these geometry defects.

The Center entry remains in its existing application row. Commit 20537a6 fixes the welcome overlay regression without weakening physical-click assertions. Immediate camera framing clears damping; eased movement is preserved for positive durations.

## Evidence and remaining acceptance

Backend tests: **239 passed**, including exact replay voice and early interruption admission. Final GraphysX results belong in the validation section below.

Live REST evidence is in:
`C:\Users\Yanik\.codex\visualizations\2026\09\13\01a09bca-9310-7013-b443-b6b546d8b1f5\llmx-live`

- Real opening: “Hello ! Bienvenue dans la Forge nocturne. De quoi aurais-tu envie de parler ce soir ?”
- Four turns through OpenClaw, all reporting effective local model qwen3.8:27b-mtp-q8_0. Same-session recall returned the supplied word “cuivre”.
- Duplicate opening returned the existing reply without another inference.
- Real French Kokoro stream, voice am_michael:0.50+ff_siwis:0.50, 28 events and 617,770 bytes, with audio and terminal completion.
- Inference latency varied from about **32 to 215 seconds** in this run. This is not a low-latency voice qualification.

The actual browser separately displayed a newly generated Hello with sound enabled and microphone off. HTTP, waveform, browser UI and physical acoustic acceptance are distinct: microphone quality, echo cancellation, speaker audibility and interruption in Yanik's room still require his physical test.

The historical full GraphysX gate on 20537a6 was stopped when scope changed; it is not a full-pass receipt. Use final focused results for this integrated revision.

## Next bounded milestone

1. Connect validated scene commands, accepted-action receipts and undo to co-creation; then trigger creation accents.
2. Add named environments beyond the first local save.
3. Bring in visual arithmetic for ages 4 and 7: groups, counting, addition and subtraction with numerical truth independent of decorative geometry. Recovered formula visualizer analysis and needed fixes are in the planning worktree's math document.
4. Qualify microphone/speaker interaction physically and measure latency before changing inference infrastructure.

Qwen contributed a useful bounded opening-contract review (Pipeline 0691, 8,780 ms). An earlier rambling review was rejected; Codex took over. This does not establish autonomous development. Claude/Codex coordination used files and user handoff; the attempted direct CLI messaging relay failed authentication.

The original plan is in C:\Users\Yanik\codes\GraphysX-Web-llmx-plan. Its older branch stays local because its historical workflow can trigger expensive feature-push CI.

## Final validation

The final combined verification built application commit **8738e54**. **461 unit tests passed, one existing test was skipped**; typecheck, lint, build and both Rapier probes passed. Selected browser checks passed for LLMx room/persistence/mobile, startup recovery, Center, editor, scene-command validation and document round-trip. No full release matrix or public deployment is claimed.

The conversation journey passed its first seven scenarios and all four correlated interruption requests. Its final assertion incorrectly read a discarded window after the intentional Center navigation. Test-only commit **935dd25** retains the synchronous playback-stop receipt across that navigation. Only that replay/lifecycle scenario is rerun; the application build is unchanged. See the final replay and live-audio results appended below.

The mouth correction is **c25d913**: 53 dedicated tests pass; the high/balanced/mobile masks contain 21,825 / 8,256 / 2,203 cubes. Four final front/profile/underside/close-up screenshots were inspected with no page errors. Evidence: `output/playwright/llmx-mouth/final-*.png`.

Combined log: `C:\Users\Yanik\.codex\visualizations\2026\09\13\01a09bca-9310-7013-b443-b6b546d8b1f5\llmx-integrated-final-verify.log`. The initial conversation assertion failure is retained there rather than relabelled as a clean combined pass.

The targeted replay rerun passed, including a later failed audit, exact stored voice, world change, visibility, mute and exit. Report: `output/playwright/llmx-replay-final/llmx-conversation-report.json`; log: `llmx-replay-final.log` in the external evidence directory above. Together with the first seven successful scenarios, this qualifies the eight conversation journeys without another full run.

Actual browser playback also passed against the deployed consumer: one real TTS request, **no new inference**, 9 measured samples, peak normalized amplitude **0.6816**, and visible-geometry speaking state followed by silence/rest. Microphone remained off; no browser errors. This proves the real VoiX-to-analyser-to-face path, not physical speaker audibility or microphone quality. Receipt and desktop/mobile screenshots: `output/playwright/llmx-real-audio/`.

The existing develop-web-game client passed with no console-error artifact; its inspected screenshot and state show a fully built 21,825-cube face at rest. Evidence: `output/playwright/llmx-skill/`.

Final display adjustments **c229bf3** and **2a09e03** keep narrow-screen voice from automatically covering the face with history, open messages at the latest reply, and leave room for the Display button. Typecheck/lint and the final build passed; the rebuilt application was inspected in the actual browser. Transport, geometry and persistence were unchanged by these display adjustments. The served final build includes **2a09e03**.

The finished Claude preview on4199 is stopped. The compiled integration server on4207 remains running. The merged AIOps backend worktree was removed after hash-verified receipt preservation under `C:\Users\Yanik\codes\aiOPs\output\llmx-0690-backend-handoff`; other worktrees and their untracked copies were preserved.

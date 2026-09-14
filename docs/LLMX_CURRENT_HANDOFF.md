# LLMx — integrated application and restart

2026-09-13. Private LAN conversation is deployed; GraphysX runs from the local integration branch. No public GraphysX deployment. The continued creation milestone is described in [LLMX_CREATION.md](LLMX_CREATION.md): native scene edits and receipts, named environments, deterministic arithmetic and isolated Family conversations.

## Restart after reboot

```powershell
Set-Location C:\Users\Yanik\codes\GraphysX-Web-llmx-integration
$env:LLMX_HOUSEHOLD_URL='http://192.168.2.99:3080'
npm run serve:llmx
```

Open **http://127.0.0.1:4207/?app=llmx**, or choose **LLMx · Forge nocturne** on the home page. Branch: `codex/llmx-integration`, base d7c9937. Dependencies and the compiled build are already present; no production dependency was added. Keep the same browser profile and origin/port to recover the saved environment and exact conversation. Restart this process after a PC reboot. After changing source code, run `npm run build` again. For live development, replace the last command with `npm run dev -- --host 127.0.0.1 --port 4207 --strictPort`.

The creation backend was introduced in Household **1.55.0** through [AIOps PR 602](https://github.com/WindriderQc/aiOPs/pull/602), merge 38267aeb409995cf104513f329852928ffccc6c1, deployment 34787274026. The sound-library release **1.56.0** preserves that integration. The verified live service is **1.56.2**, [AIOps PR 604](https://github.com/WindriderQc/aiOPs/pull/604), merge 054cb0442be9e5c812e75cef5d0925fc73fd3b1c, deployment 34790527096. PR603 corrected the response-format problem discovered with real Qwen; malformed scene arrays cannot be displayed, spoken or extracted as commands. PR604 binds each proposal to its request observation and advances the displayed math lesson by one step, including after undo and reload. Product pins, GPU routing, model files and context limits were preserved.

If AgentX is unavailable, the Forge remains usable. Restore the service and choose **Reconnecter**. A missing saved session can be replaced with **Nouvelle conversation**. An interrupted or uncertain opening is never replayed automatically. **Réécouter** uses the stored completed reply's exact provider and voice.

## Delivered behavior

- Minimal tiled floor and altar, sky/fog, copper and cyan lighting, bloom and particles. The removed towers, rings and peripheral cylinders are absent from the new default. A pre-existing saved room is preserved; use **Environnements → Revenir au décor d’origine**, then **Sauvegarder**, to replace it.
- A dense voxel face assembles from below during the 7.5-second approach. Skip, reduced motion and camera interaction settle assembly immediately. Gaze and expressions share the host's existing loop.
- The face is a saved agent child of the original group anchor. Appearance survives patch/state/export/load. Child entities and face material ownership survive replacement; device quality changes density without changing the saved identity.
- One private Household session serves text and voice through the local relay and existing Personal/OpenClaw conversation. No generic private recent session is silently adopted.
- AgentX originates a real **Hello** application turn after visual, session and audio readiness, or explicit text choice. No fake human greeting or canned assistant response. Autoplay restrictions produce an audio/text choice; microphone capture starts from **Parler**.
- The existing VoiX player feeds an analyser; the face follows played speech amplitude and brightness. Waiting/generation animations reflect transport state, not model reasoning or GPU load. Text-only mode produces no pretend lip sync.
- Stop, visibility changes, world reload, exit and new conversation invalidate stale callbacks and stop playback/capture. A new session can recover from unconfirmed cleanup while retaining a warning and requiring the human to start.
- Named environments are saved locally, with copy/rename/load and migration of the old Forge save. Session identity is separate. **Passer en famille** selects isolated Family worlds and its Family agent; **Quitter LLMx** returns to the AgentX Center.
- Human text/voice requests can produce validated native scene edits, followed by an exact outcome receipt, creation accent and native undo/redo. **Atelier maths** provides counting, addition and subtraction from 0 to 20 with one real cube per unit and one move per step.

## Architecture seams

`src/llmx-app.ts` mounts the Forge and conversation. The conversation controller owns browser interaction and shared voice I/O; the typed client owns exact-session transport, opening deduplication and NDJSON. The audio adapter loads the existing Household/VoiX modules and observes playback. The local relay maps supported routes to the existing private consumer.

The shared persistent appearance contract is `{kind:"voxel-face", asset:"forge-mask", palette:"forge", seed:1}`; null restores the ordinary avatar. Broader renderer configuration remains internal. Invalid appearance is rejected before rollback can rebuild the room. Driver snapping avoids indefinite static-buffer uploads; the rig owns its materials and disposal.

Thinking particles are transient runtime entities outside the authored document and undo/save history. Creation camera and visual accents follow validated native commits. The diagnostic /llmx-preview.html contains simulated speech controls; the product route uses actual conversation audio.

## Visual integration and ownership

Claude's two finished lanes are claude/llmx-forge (pushed through 69fe2a5) and claude/llmx-face-forge (handoff 1118377, later front-door documentation). Visual commits were integrated through Forge 70541b2 and face 894e623, followed by Codex runtime and mouth corrections. Untracked preview copies in those worktrees remain theirs.

Yanik's floating mouth blocks had two causes: ellipsoid-distance approximation accepted interior voxels as surface, and lip movement inverted lower rows. The correction uses actual surface sign crossings and continuous jaw/lip influence. Tests check an empty mouth interior, non-inverting rows and connected lips at amplitudes 0/.3/.6/1 for all three quality levels. Colors alone could not fix these geometry defects.

The Center entry remains in its existing application row. Commit 20537a6 fixes the welcome overlay regression without weakening physical-click assertions. Immediate camera framing clears damping; eased movement is preserved for positive durations.

## Evidence and remaining acceptance

Backend tests: **262 passed** for Household and its corpus after the final continuation correction. PR604 CI 34790454562 passed (sanity 1m15s; data tests 19s); deployment 34790527096 succeeded and the live status returned 1.56.2. GraphysX results and real-model acceptance remain separate receipts below.

Earlier personal-conversation REST evidence is in:
`C:\Users\Yanik\.codex\visualizations\2026\09\13\01a09bca-9310-7013-b443-b6b546d8b1f5\llmx-live`

- Real opening: “Hello ! Bienvenue dans la Forge nocturne. De quoi aurais-tu envie de parler ce soir ?”
- Four turns through OpenClaw, all reporting effective local model qwen3.8:27b-mtp-q8_0. Same-session recall returned the supplied word “cuivre”.
- Duplicate opening returned the existing reply without another inference.
- Real French Kokoro stream, voice am_michael:0.50+ff_siwis:0.50, 28 events and 617,770 bytes, with audio and terminal completion.
- Inference latency varied from about **32 to 215 seconds** in this run. This is not a low-latency voice qualification.

The actual browser separately displayed a newly generated Hello with sound enabled and microphone off. HTTP, waveform, browser UI and physical acoustic acceptance are distinct: microphone quality, echo cancellation, speaker audibility and interruption in Yanik's room still require his physical test.

The historical full GraphysX gate on 20537a6 was stopped when scope changed; it is not a full-pass receipt. Use final focused results for this integrated revision.

## Final creation qualification

The compiled local build contains product change cd7deaa and verification split 63eb604. **506 Node tests passed, one existing test skipped**; typecheck, lint, build and both Rapier checks passed. The final creation actions journey passed in 3m36s and named environments/Family/mobile in 6m46s. All 71 original assertion calls remain in the two bounded scenarios. Earlier room, startup, scene validation, document round-trip, conversation replay and showroom checks also passed on the integrated creation build. This is focused feature verification, not the full public-release matrix.

The final desktop and 390px mobile math captures were inspected: all five counting cubes and the equation are visible, with conversation history collapsed. The unchanged develop-web-game client passed and its screenshot/state show the fully assembled 21,825-cube face without a console-error artifact. Logs and screenshots are under `output/llmx-creation/` and `output/verify/`.

Actual browser and deployed Qwen acceptance used Family session `d0697403-989f-4b9c-b740-d987beab6a4f`:

| Request | Actual result | Completed turn | Duration |
| --- | --- | --- | --- |
| Application opening | Real Hello, no scene action | e54dbc21-9051-4162-bb40-dd3167ee1997 | 6,265 ms |
| Blue cube | Native cube, applied receipt | 0cd770c5-2604-473b-afc5-152fd801cf80 | 8,760 ms |
| Demonstrate 2 + 3 | Five native units, step 0, applied receipt | 2ba72258-cd01-45ec-9037-7d17a58b8d83 | 8,097 ms |
| Next step after manual undo, save, rename and reload | Exactly one cube moved: step 1 to 2 | 99abc878-3cf4-4060-b3ac-cfdc43303dc8 | 11,071 ms |
| “Encore une étape, s’il te plaît.” | Step 3, all five cubes together, applied receipt | 8c2edf16-abce-4937-8d53-1146e849902b | 9,843 ms |

All runs report `qwen3.8:27b-mtp-q8_0` through the existing OpenClaw Family route. Actual UI and exact-turn backend receipts agree. The final French transcript and stored French Kokoro voice describe the observed step. The saved world **Atelier de la Forge** contains this completed lesson and the blue cube in the Codex browser's Family library; other browser profiles have their own storage. Family entry: **http://127.0.0.1:4207/?app=llmx&profile=family**. The original Hello was recovered on reload without another opening turn.

Initial real-model failures remain in `output/llmx-creation/live/`: malformed arrays before PR603 and a historical revision/step before PR604. They were rejected without scene changes. The final successful continuation used the same conversation despite that history. No additional model retry or second inference loop was introduced.

## Next bounded milestone

1. Qualify microphone/speaker interaction physically and measure latency before changing inference infrastructure.
2. Try the concrete arithmetic workshop with the children and adjust teaching pace from observed use.
3. Extend into rigorous formula lessons after fixing the recovered visualizer's coordinate/display separation; its analysis remains in the planning worktree's math document.

Qwen contributed a useful bounded opening-contract review (Pipeline 0691, 8,780 ms). An earlier rambling review was rejected; Codex took over. This does not establish autonomous development. Claude/Codex coordination used files and user handoff; the attempted direct CLI messaging relay failed authentication.

The original plan is in C:\Users\Yanik\codes\GraphysX-Web-llmx-plan. Its older branch stays local because its historical workflow can trigger expensive feature-push CI.

## Previous conversation and face validation

The final combined verification built application commit **8738e54**. **461 unit tests passed, one existing test was skipped**; typecheck, lint, build and both Rapier probes passed. Selected browser checks passed for LLMx room/persistence/mobile, startup recovery, Center, editor, scene-command validation and document round-trip. No full release matrix or public deployment is claimed.

The conversation journey passed its first seven scenarios and all four correlated interruption requests. Its final assertion incorrectly read a discarded window after the intentional Center navigation. Test-only commit **935dd25** retains the synchronous playback-stop receipt across that navigation. Only that replay/lifecycle scenario is rerun; the application build is unchanged. See the final replay and live-audio results appended below.

The mouth correction is **c25d913**: 53 dedicated tests pass; the high/balanced/mobile masks contain 21,825 / 8,256 / 2,203 cubes. Four final front/profile/underside/close-up screenshots were inspected with no page errors. Evidence: `output/playwright/llmx-mouth/final-*.png`.

Combined log: `C:\Users\Yanik\.codex\visualizations\2026\09\13\01a09bca-9310-7013-b443-b6b546d8b1f5\llmx-integrated-final-verify.log`. The initial conversation assertion failure is retained there rather than relabelled as a clean combined pass.

The targeted replay rerun passed, including a later failed audit, exact stored voice, world change, visibility, mute and exit. Report: `output/playwright/llmx-replay-final/llmx-conversation-report.json`; log: `llmx-replay-final.log` in the external evidence directory above. Together with the first seven successful scenarios, this qualifies the eight conversation journeys without another full run.

Actual browser playback also passed against the deployed consumer: one real TTS request, **no new inference**, 9 measured samples, peak normalized amplitude **0.6816**, and visible-geometry speaking state followed by silence/rest. Microphone remained off; no browser errors. This proves the real VoiX-to-analyser-to-face path, not physical speaker audibility or microphone quality. Receipt and desktop/mobile screenshots: `output/playwright/llmx-real-audio/`.

The existing develop-web-game client passed with no console-error artifact; its inspected screenshot and state show a fully built 21,825-cube face at rest. Evidence: `output/playwright/llmx-skill/`.

Final display adjustments **c229bf3** and **2a09e03** keep narrow-screen voice from automatically covering the face with history, open messages at the latest reply, and leave room for the Display button. Typecheck/lint and the final build passed; the rebuilt application was inspected in the actual browser. Transport, geometry and persistence were unchanged by these display adjustments. The served final build includes **2a09e03**.

The finished Claude preview on4199 is stopped. The compiled integration server on4207 remains running. The merged AIOps backend worktree was removed after hash-verified receipt preservation under `C:\Users\Yanik\codes\aiOPs\output\llmx-0690-backend-handoff`; other worktrees and their untracked copies were preserved.

Creation delivery cleanup: the temporary backend worktree `aiops-llmx-scene-format` was clean and removed normally after PR604 was merged and live-qualified. Both backend correction branches are pushed; source and receipts remain available. The AIOps Lead was released for the separate sound correction. Only the compiled preview on4207 is retained for this feature; the temporary 4208 development server is stopped. Final evidence is also copied to `C:\Users\Yanik\.codex\visualizations\2026\09\13\01a09bca-9310-7013-b443-b6b546d8b1f5\llmx-creation`.

## Mouth rest and speech correction

Yanik's physical tryout exposed two independent defects: the authored neutral mouth was already open, and the voice conversation route sent raw output RMS while text/replay sent RMS multiplied by 8. The Forge mask now has a narrow resting seam and opens from that pose. Both playback paths share the same animation amplitude and spectral-brightness conversion. The audio played to the speakers is unchanged.

The rebuilt mask has 21,939 / 8,294 / 2,180 cubes at high/balanced/mobile detail. Front, quiet speech, strong speech, close-up and profile captures were inspected. The 56 geometry/renderer tests include a relaxed seam, visible ordinary-speech opening, clear central channel, ordered lower rows and attached lips across all detail levels. The mounted conversation regression clicks Parler and compares its output against text/replay at identical RMS and a nonzero spectrum; removing the conversion makes it fail.

Final focused verification passes 511 Node tests with one existing skip, typecheck, lint, production build, Rapier probes and the LLMx appearance/save/reload/mobile journey (1m13s). The compiled server on4207 serves this correction after page reload. Evidence: output/llmx-mouth-final-verify.log and output/playwright/llmx-mouth-rest/.

Real playback acceptance passed on the compiled application: one actual VoiX replay request, no inference or microphone capture, 50 sampled rendered frames and no browser errors. The measured mouth gap moved from 0.02405 m at rest to 0.12643 m during speech, then settled to 0.02444 m. Inspected speaking and settled screenshots. The initial fixed one-second assertion sampled the still-decaying pose under the software renderer; its failure is retained in output/llmx-mouth-live-first.log. The final test waits for observed pose convergence within a bounded deadline before comparing the resting aperture. This does not claim phoneme-level lip sync or physical microphone quality.

The unchanged develop-web-game client also passed; its inspected state reports 21,939 cubes fully assembled at rest. Final live evidence is under output/playwright/llmx-mouth-rest-live/. The user's open personal Forge was saved and reloaded to use this build; no conversation was regenerated. The temporary geometry preview on4208 is stopped.

## Pyramid placement and workshop visibility

The compiled local Forge now hides the entire 3D math workshop outside arithmetic. Opening it restores the saved lesson; closing it, focusing the face, or applying an ordinary creation hides it without changing native quantities, commits or saves. The scene observation omits hidden maths and summarizes visible maths through its root and semantic lesson so reserved glyph/cube IDs cannot crowd out editable objects.

The reported pyramid rejection came from unit cubes placed through the floor. Household1.56.5 (PR607, main0a367c28) supplies actual floor/bounds, explicit dimensions and grounded stack examples. Household1.56.7 (PR609, maine089a30e) also demonstrates the exact native update/remove shapes after a real recoloring request exposed an update.entity mistake. Both are deployed; the final API version is1.56.7. The intervening sound corrections are preserved. Both completed AIOps worktrees were cleaned, and the Lead was released.

Real Qwen browser acceptance passed: three .65m boxes created in10,158ms (turn57db5343-f68c-40f3-ba4e-c2678f467bf2), then those same three boxes recolored in9,752ms (turn991373cd-5169-46a6-8f2a-ea8b44561cb7). Both exact receipts are applied. The saved 4-3 lesson, step3, was hidden, reloaded hidden, reopened unchanged, and stayed hidden through ordinary creation undo/redo. Screenshots were inspected in the normal in-app browser. Audio and microphone remained off. An older demo cube occupies the same area as the new pyramid; automatic spacing between independent creations is not implemented.

Static checks pass:512 Node tests, one existing skip, typecheck, lint, build and Rapier probes. The first new unit assertion used exact floating equality; its failure is retained, the assertion uses tolerance, and the complete unit suite passed again. Household/corpus tests:266 pass after the final rebase.

At this handoff, the two updated automated creation browser journeys and the unchanged develop-web-game client are queued behind Claude's full78-check gate on c403519, per Yanik's explicit choice to let it finish. They are not yet claimed as passed. Queue exec session46010; logs output/llmx-workshop-browser-verify.log and output/llmx-workshop-skill.log. Inspect the generated reports/screenshots and address failures before closing verification. The normal-browser proof and exact model audits are in this conversation and output/llmx-workshop-*.json. No new public GraphysX deployment is claimed.

## Face picture-in-picture while exploring

Queue update: the later GraphysX MCP integration replaces only Codex's idle waiting process with session19766. It waits for the same uninterrupted Claude PID10036, then runs llmx, standalone, both creation checks and agent-mcp, followed by the unchanged skill client. Current logs are output/graphysx-agent-browser-verify.log and output/graphysx-agent-skill.log. The older queue/log references below are historical. See docs/GRAPHYSX_MCP.md for the shared tools and installed client registrations.

The compiled preview on4207 now shows the existing animated face through a second camera in the upper-right corner while the main camera frames creations, maths or manual orbit/zoom. Clicking the portrait returns to the face and hides the inset. Entry/replay/load starts without it; environment dialogs temporarily hide it. The inset follows the current native rig after undo/load and directs its gaze toward the portrait camera. There is still one conversation, audio path, animated face, WebGL canvas and frame loop, with no new dependency or backend change.

PlatformHost exposes a disposable after-render subscription. The portrait renders a scissored pass after the main view's compositor, restores renderer target/viewport/scissor/clear/shadow state even after failure, and reuses the main shadow budget. It uses the existing scene lighting; it does not duplicate the full-screen bloom pipeline. Mobile maths framing leaves the counted cubes to the left of the portrait, including at320px. The transcript remains clear of the portrait.

Validation so far:514 Node tests pass, one existing skip; typecheck/build and lint pass. Two new unit regressions exercise renderer state restoration, scaled CSS bounds, face replacement and disposal. Normal IAB screenshots were inspected at1280x720,390x844 and320x844; workshop, portrait return, free orbit, reload and transcript layout were exercised without browser errors. Saved4-3 quantities and conversation remain unchanged; sound and microphone stayed off.

The creation browser journeys now also assert the inset transitions, shared canvas and mobile bounds. They remain queued in the existing session46010 after Claude's full gate (PID10036), which was not interrupted. The unchanged skill client is queued after them with UI actions that open the maths portrait. Read output/llmx-workshop-browser-verify.log, output/llmx-workshop-skill.log and generated screenshots before claiming that automated verification complete. This is a local feature preview, not a public deployment. Animal-sound work has no dependency on this change and requires no coordination.

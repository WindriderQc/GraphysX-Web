import type { NestorPresentation, NestorTopic } from "./showroom-nestor";
import { summarizeProposal } from "./coauthor-proposal";
import type { CoauthorOutcome, CoauthorProposal } from "./coauthor-proposal";
import type { LiveAgentActivity } from "./live-agent-presence";
import type { LiveMissionRuntimeState } from "./live-mission-runtime";

/**
 * The welcome overlay for the showroom front door.
 *
 * Deliberately anchored to the lower-left rather than centred: the showroom exists to show
 * the engine at a glance, and a centred block sits exactly where the composed scene's
 * content is. The copy reads over a bottom scrim so the middle of the frame — the part
 * worth looking at — stays clear while the idle orbit moves through it.
 *
 * This is DOM chrome, not scene vocabulary, so it lives apart from `showroom-scene.ts`.
 * Class names are load-bearing: the headless smokes select `.gx-welcome` and its button.
 */
export type ShowroomWelcomeVariant = "agentx" | "scene-resume" | "live-observer";

export interface ShowroomWelcomeHandle {
  present: (presentation: NestorPresentation) => void;
  observeLiveActivity: (activity: LiveAgentActivity | null) => void;
  observeMission: (state: LiveMissionRuntimeState | null) => void;
  /** Show a change awaiting a human decision, or pass null to clear it. */
  showProposal: (proposal: CoauthorProposal | null, stale?: boolean) => void;
  /** Report what happened to the last decided proposal, including a discard. */
  showOutcome: (outcome: CoauthorOutcome | null) => void;
  reset: () => void;
  dispose: () => void;
}

export function mountWelcome(
  container: HTMLElement,
  onEnter?: () => void,
  onGames?: () => void,
  onBrowse?: () => void,
  onNestorTopic?: (topic: NestorTopic) => void,
  variant: ShowroomWelcomeVariant = onNestorTopic ? "agentx" : "scene-resume",
  coauthor?: { onAccept?: () => void; onDiscard?: () => void; onToggleCommand?: (index: number) => void },
): ShowroomWelcomeHandle {
  const nestorEnabled = variant === "agentx" && typeof onNestorTopic === "function";
  const style = document.createElement("style");
  style.textContent = `
    .gx-welcome{position:fixed;inset:0;z-index:30;box-sizing:border-box;pointer-events:none;font-family:var(--gx-font);display:flex;align-items:flex-end;justify-content:flex-start;padding:clamp(20px,4vw,54px)}
    .gx-welcome::before{content:"";position:absolute;inset:auto 0 0 0;height:46%;background:linear-gradient(180deg,rgba(3,12,20,0),rgba(3,12,20,.7));pointer-events:none}
    /*
     * The card is bounded and scrolls. It used to grow freely, which was fine while its
     * contents were fixed; expanding a nine-command proposal pushed the eyebrow and half the
     * title off the top of a 1280x800 viewport. Content that can vary in length needs a
     * ceiling, and one scroll region here is what lets the command list have none.
     */
    .gx-welcome-card{position:relative;box-sizing:border-box;width:min(500px,calc(100vw - 40px));max-height:calc(100dvh - 2*clamp(20px,4vw,54px));overflow-y:auto;display:flex;flex-direction:column;align-items:flex-start;gap:13px;text-align:left;padding:22px 24px 20px;border:1px solid rgba(111,233,255,.28);border-radius:20px;background:linear-gradient(145deg,rgba(6,23,34,.86),rgba(8,19,31,.62));box-shadow:0 24px 70px rgba(0,8,16,.48),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(16px)}
    .gx-welcome .gx-eyebrow{display:flex;align-items:center;gap:8px;color:#91efff;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
    .gx-welcome .gx-online-dot{width:7px;height:7px;border-radius:50%;background:#76f0ae;box-shadow:0 0 0 4px rgba(118,240,174,.1),0 0 18px #76f0ae}
    .gx-welcome h1{margin:0;font-size:clamp(28px,4.2vw,46px);letter-spacing:.035em;font-weight:850;color:var(--gx-ink);line-height:.98;text-shadow:0 4px 38px rgba(70,220,235,.38)}
    .gx-welcome p{margin:0;color:var(--gx-ink-soft);font-size:14.5px;line-height:1.55;text-shadow:0 1px 12px rgba(3,12,20,.7)}
    .gx-welcome .gx-nestor-topics{display:flex;gap:8px;flex-wrap:wrap;pointer-events:auto}
    .gx-welcome .gx-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:100%;pointer-events:auto}
    .gx-welcome button{background:linear-gradient(180deg,var(--gx-accent-deep),#1d7f96);color:#fff;border:1px solid var(--gx-accent-edge);border-radius:12px;padding:12px 24px;font:600 15px var(--gx-font);cursor:pointer;box-shadow:0 8px 30px rgba(30,127,150,.42)}
    .gx-welcome button:hover{filter:brightness(1.08)}
    .gx-welcome button:focus-visible{outline:2px solid #fff;outline-offset:3px;filter:brightness(1.1)}
    .gx-welcome .gx-actions button{width:100%;min-height:44px;padding-inline:16px}
    .gx-welcome .gx-actions .gx-go-editor{grid-column:1 / -1}
    .gx-welcome .gx-nestor-topics button{padding:8px 13px;border-radius:999px;background:rgba(14,45,58,.8);border-color:rgba(116,223,241,.28);box-shadow:none;color:#bceef7;font-size:12px;letter-spacing:.04em}
    .gx-welcome .gx-nestor-topics button:hover,.gx-welcome .gx-nestor-topics button[aria-pressed="true"]{color:#fff;border-color:#77e9ff;background:rgba(35,117,139,.68);box-shadow:0 0 24px rgba(65,211,232,.22)}
    .gx-welcome .gx-go-games{background:linear-gradient(180deg,#2f9e7f,#1d6f5a);border-color:var(--gx-life);box-shadow:0 8px 30px rgba(29,111,90,.42)}
    .gx-welcome .gx-go-browse{background:linear-gradient(180deg,#5a6fb0,#3a4a80);border-color:var(--gx-violet);box-shadow:0 8px 30px rgba(58,74,128,.42)}
    .gx-welcome .gx-commit{min-height:15px;color:#69ddec;font:600 10px/1.4 var(--gx-font);letter-spacing:.08em;text-transform:uppercase}
    /*
     * The co-author card: what an agent is about to do, before it does it.
     *
     * Deliberately inside the welcome card rather than a floating dialog. This is not an
     * interruption to dismiss — it is the answer to the button the person just pressed, and it
     * belongs where they are already looking. A modal would also fight the 3D scene for
     * attention, which §5 says stays visually dominant.
     */
    .gx-welcome .gx-proposal{display:none;width:100%;box-sizing:border-box;flex-direction:column;gap:9px;padding:13px 14px;border:1px solid rgba(120,233,255,.34);border-left:3px solid #77e9ff;border-radius:13px;background:rgba(8,32,44,.72);pointer-events:auto}
    .gx-welcome--proposing .gx-proposal{display:flex}
    .gx-welcome--proposing .gx-nestor-topics{opacity:.42;pointer-events:none}
    .gx-welcome .gx-proposal-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .gx-welcome .gx-proposal-actor{color:#9df3ff;font:800 10.5px var(--gx-font);letter-spacing:.15em;text-transform:uppercase}
    .gx-welcome .gx-proposal-meta{color:var(--gx-ink-soft);font:600 10.5px var(--gx-font);letter-spacing:.06em}
    .gx-welcome .gx-proposal-intent{margin:0;color:var(--gx-ink);font-size:14px;line-height:1.45}
    .gx-welcome .gx-proposal-stale{display:none;margin:0;color:#ffce7a;font-size:12.5px;line-height:1.45}
    .gx-welcome--proposal-stale .gx-proposal-stale{display:block}
    .gx-welcome--proposal-stale .gx-proposal{border-left-color:#ffce7a}
    .gx-welcome--proposal-stale [data-proposal-accept]{opacity:.5;pointer-events:none}
    .gx-welcome .gx-proposal-detail summary{color:#8fe6f6;font-size:12px;cursor:pointer;list-style:none;padding:2px 0}
    .gx-welcome .gx-proposal-detail summary::-webkit-details-marker{display:none}
    .gx-welcome .gx-proposal-detail summary::before{content:"▸ ";opacity:.8}
    .gx-welcome .gx-proposal-detail[open] summary::before{content:"▾ "}
    .gx-welcome .gx-proposal-detail summary:focus-visible{outline:2px solid #fff;outline-offset:2px;border-radius:4px}
    /*
     * No max-height here on purpose. Capping the list made it a scroller nested inside the
     * card's own scroller, and the first thing that produced was a command clipped through
     * the middle of its text — which reads as a rendering fault rather than as "there is
     * more below". One scroll region, on the card.
     */
    .gx-welcome .gx-proposal-lines{margin:6px 0 0;padding-left:2px;list-style:none;color:var(--gx-ink-soft);font-size:12.5px;line-height:1.5}
    .gx-welcome .gx-proposal-lines li{margin:0 0 2px}
    .gx-welcome .gx-proposal-lines label{display:flex;align-items:flex-start;gap:8px;padding:3px 4px;border-radius:6px;cursor:pointer}
    .gx-welcome .gx-proposal-lines label:hover{background:rgba(120,233,255,.08)}
    .gx-welcome .gx-proposal-lines input{accent-color:#4fd6ee;margin:2px 0 0;flex:none;width:14px;height:14px;cursor:pointer}
    .gx-welcome .gx-proposal-lines input:focus-visible{outline:2px solid #fff;outline-offset:2px}
    /* Struck through and dimmed, not removed: seeing what you took out is part of deciding. */
    .gx-welcome .gx-proposal-lines li.is-excluded span{text-decoration:line-through;opacity:.5}
    .gx-welcome [data-proposal-accept]:disabled{opacity:.45;cursor:not-allowed;filter:grayscale(.5)}
    .gx-welcome .gx-proposal-actions{display:flex;gap:8px;flex-wrap:wrap}
    .gx-welcome .gx-proposal-actions button{padding:9px 16px;border-radius:10px;font-size:13px;min-height:40px;box-shadow:none}
    .gx-welcome [data-proposal-discard]{background:rgba(14,38,50,.9);border-color:rgba(140,170,185,.4);color:#cfe6ee}
    /* The outcome line: what happened, including when the answer was "nothing". */
    .gx-welcome .gx-proposal-outcome{min-height:0;color:#9fe9c4;font-size:12.5px;line-height:1.45;margin:0}
    .gx-welcome .gx-proposal-outcome:empty{display:none}
    /*
     * While a proposal is open, the announcement stays in the accessibility tree and out of
     * the picture. Sighted readers already have the card — printing "Nestor proposes 9
     * changes" directly beneath a panel that says exactly that is noise, and on a phone it
     * was noise that cost two lines of a viewport the 3D scene is supposed to dominate.
     */
    .gx-welcome .gx-proposal-outcome[data-outcome="pending"]{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    .gx-welcome .gx-proposal-outcome[data-outcome="discarded"]{color:var(--gx-ink-soft)}
    .gx-welcome .gx-proposal-outcome[data-outcome="stale"],.gx-welcome .gx-proposal-outcome[data-outcome="rejected"]{color:#ffce7a}
    .gx-welcome .gx-hint{color:var(--gx-ink-soft);font-size:12px;line-height:1.45;text-shadow:0 1px 10px rgba(3,12,20,.8)}
    /*
     * The title treatment, staged against the host's 2.6s entry move: each line rises and
     * fades in slightly after the one above it, so the card assembles while the camera is
     * still settling rather than being fully present over a moving shot.
     *
     * Staggered with a delay per child rather than one animation on the card, because the
     * point is the cascade -- a card that fades in as a block reads as a loading state.
     * The last line lands at 1.5s, comfortably before the camera stops at 2.6s, so the
     * visitor is never waiting on chrome.
     */
    @keyframes gx-welcome-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
    .gx-welcome-card > *{animation:gx-welcome-rise .72s cubic-bezier(.22,.68,.32,1) both}
    .gx-welcome-card > .gx-eyebrow{animation-delay:.18s}
    .gx-welcome-card > h1{animation-delay:.32s}
    .gx-welcome-card > p{animation-delay:.48s}
    .gx-welcome-card > .gx-nestor-topics{animation-delay:.65s}
    .gx-welcome-card > .gx-actions{animation-delay:.82s}
    .gx-welcome-card > .gx-hint{animation-delay:1.05s}
    /*
     * Anyone who has asked the OS for less motion gets the card immediately and unanimated.
     * A decorative entrance is exactly the kind of thing this setting exists to suppress.
     */
    @media (prefers-reduced-motion:reduce){
      .gx-welcome-card > *{animation:none}
    }
    @media (max-width:640px){
      .gx-welcome{justify-content:center;align-items:flex-end;padding:14px 14px calc(58px + env(safe-area-inset-bottom))}
      .gx-welcome-card{align-items:center;text-align:center;max-height:calc(100dvh - 86px);overflow-y:auto;padding:19px 18px 18px}
      .gx-welcome .gx-actions{gap:8px}
      .gx-welcome .gx-actions button{padding-inline:10px;font-size:13px}
      .gx-welcome--presenting{align-items:flex-start;justify-content:flex-start;padding:8px}
      .gx-welcome--presenting .gx-welcome-card{width:min(310px,calc(100vw - 72px));max-height:min(46vh,380px);align-items:flex-start;text-align:left;gap:7px;padding:13px 14px;border-radius:14px}
      .gx-welcome--presenting h1{font-size:clamp(22px,7vw,27px);line-height:1.02}
      .gx-welcome--presenting p{font-size:12.5px;line-height:1.38}
      .gx-welcome--presenting .gx-nestor-topics{gap:5px}
      .gx-welcome--presenting .gx-nestor-topics button{padding:6px 9px;font-size:10px}
      .gx-welcome--presenting .gx-actions{gap:6px}
      .gx-welcome--presenting .gx-actions button{min-height:36px;padding:7px 6px;font-size:11px}
      .gx-welcome--presenting .gx-hint{display:none}
      /*
       * A phone deciding on a proposal: the proposal IS the subject, so the standing briefing
       * and the interaction hint stand down for it. Without this the card grew to fill a
       * 390px viewport and left the scene as a sliver at the edges — and §5 says the 3D scene
       * stays dominant, which is not a rule that bends for my own new panel.
       */
      .gx-welcome--proposing .gx-nestor-briefing{display:none}
      .gx-welcome--proposing .gx-hint{display:none}
      .gx-welcome--proposing .gx-welcome-card{gap:9px}
      .gx-welcome--proposing .gx-proposal{padding:11px 12px}
      .gx-welcome--proposing .gx-proposal-intent{font-size:13px}
      .gx-welcome--live-observer{align-items:flex-start;justify-content:flex-start;padding:8px}
      .gx-welcome--live-observer .gx-welcome-card{width:min(300px,calc(100vw - 72px));max-height:min(38vh,260px);align-items:flex-start;text-align:left;gap:7px;padding:13px 14px;border-radius:14px}
      .gx-welcome--live-observer h1{font-size:clamp(20px,7vw,27px);line-height:1.05}
      .gx-welcome--live-observer p{font-size:12.5px;line-height:1.4}
      .gx-welcome--live-observer .gx-hint{display:none}
    }
    @media (max-height:600px) and (min-width:641px){
      .gx-welcome{align-items:flex-start;padding:12px}
      .gx-welcome-card{max-height:calc(100dvh - 24px);overflow-y:auto;padding:18px 20px}
    }
  `;
  const overlay = document.createElement("div");
  overlay.className = "gx-welcome";
  overlay.innerHTML = `
    <div class="gx-welcome-card">
      <div class="gx-eyebrow"><span class="gx-online-dot"></span><span data-nestor-eyebrow>AgentX Center · Nestor online</span></div>
      <h1 data-nestor-title>MAKE THE WORLD MOVE.</h1>
      <p class="gx-nestor-briefing" data-nestor-briefing aria-live="polite">Pick a live demo. Nestor will change this scene with the same inspectable commands available to every AgentX collaborator.</p>
      <div class="gx-nestor-topics" aria-label="Ask Nestor to show a capability">
        <button type="button" data-nestor-topic="build" aria-pressed="false">Build something</button>
        <button type="button" data-nestor-topic="play" aria-pressed="false">Wake the physics</button>
        <button type="button" data-nestor-topic="explore" aria-pressed="false">Reveal living systems</button>
      </div>
      <div class="gx-proposal" data-nestor-proposal role="group" aria-labelledby="gx-proposal-actor">
        <div class="gx-proposal-head">
          <span class="gx-proposal-actor" id="gx-proposal-actor" data-proposal-actor>Nestor proposes</span>
          <span class="gx-proposal-meta" data-proposal-meta></span>
        </div>
        <p class="gx-proposal-intent" data-proposal-intent></p>
        <p class="gx-proposal-stale" data-proposal-stale>The scene changed while this was waiting, so these commands no longer apply. Ask again to compose a fresh proposal.</p>
        <details class="gx-proposal-detail">
          <summary data-proposal-toggle>Show the exact commands</summary>
          <ol class="gx-proposal-lines" data-proposal-lines></ol>
        </details>
        <div class="gx-proposal-actions">
          <button type="button" data-proposal-accept>Apply change</button>
          <button type="button" data-proposal-discard>Discard</button>
        </div>
      </div>
      <p class="gx-proposal-outcome" data-proposal-outcome aria-live="polite"></p>
      <div class="gx-commit" data-nestor-commit>Scene-native guide · ready</div>
      <div class="gx-actions"><button type="button" class="gx-go-editor">Enter Scene Editor</button></div>
      <div class="gx-hint">click Nestor or a glowing console in 3D · click the ground to drop a ball · drag to look around</div>
    </div>
  `;
  if (!nestorEnabled) {
    const liveObserver = variant === "live-observer";
    overlay.classList.add(liveObserver ? "gx-welcome--live-observer" : "gx-welcome--scene-resume");
    overlay.querySelector(".gx-online-dot")?.remove();
    const eyebrow = overlay.querySelector<HTMLElement>("[data-nestor-eyebrow]");
    const title = overlay.querySelector<HTMLElement>("[data-nestor-title]");
    const briefing = overlay.querySelector<HTMLElement>("[data-nestor-briefing]");
    const commit = overlay.querySelector<HTMLElement>("[data-nestor-commit]");
    const hint = overlay.querySelector<HTMLElement>(".gx-hint");
    if (eyebrow) eyebrow.textContent = liveObserver ? "AgentX Center · live session attached" : "Scene workspace · draft preserved";
    if (title) title.textContent = liveObserver ? "NESTOR IS OBSERVING." : "YOUR WORLD IS STILL HERE.";
    if (briefing) {
      briefing.textContent = liveObserver
        ? "This live session owns scene operations. Nestor's local demonstrations are paused so every collaborator sees the same history."
        : "Your in-memory scene is preserved. Re-enter the editor to keep building; the AgentX Center stays separate from this world.";
      // The mission panel owns the live announcement channel in observer mode; this visual
      // copy mirrors it without creating a second, conflicting screen-reader announcement.
      if (liveObserver) briefing.setAttribute("aria-live", "off");
    }
    if (commit) commit.textContent = liveObserver ? "Live operation path active" : "No scene was replaced";
    if (hint) hint.textContent = liveObserver
      ? "use the live session panel for shared activity"
      : "your scene remains loaded · re-enter when you are ready";
    overlay.querySelector(".gx-nestor-topics")?.remove();
  }
  const dispose = () => { overlay.remove(); style.remove(); };
  /** The topic button that asked for the pending proposal, for focus restoration. */
  let proposalOrigin: HTMLButtonElement | null = null;
  let liveMissionState: LiveMissionRuntimeState | null = null;
  let liveActivityState: LiveAgentActivity | null = null;
  const observeLiveActivity = (activity: LiveAgentActivity | null): void => {
    if (variant !== "live-observer") return;
    liveActivityState = activity;
    if (liveMissionState && liveMissionState.director.mode !== "neutral") return;
    const eyebrow = overlay.querySelector<HTMLElement>("[data-nestor-eyebrow]");
    const title = overlay.querySelector<HTMLElement>("[data-nestor-title]");
    const briefing = overlay.querySelector<HTMLElement>("[data-nestor-briefing]");
    const commit = overlay.querySelector<HTMLElement>("[data-nestor-commit]");
    if (!activity) {
      delete overlay.dataset.liveAgentActor;
      delete overlay.dataset.liveAgentRevision;
      if (eyebrow) eyebrow.textContent = "AgentX Center · live session attached";
      if (title) title.textContent = "NESTOR IS OBSERVING.";
      if (briefing) briefing.textContent = "This live session owns scene operations. Nestor's local demonstrations are paused so every collaborator sees the same history.";
      if (commit) commit.textContent = "Live operation path active";
      return;
    }
    overlay.dataset.liveAgentActor = activity.actorId;
    if (activity.revision === null) delete overlay.dataset.liveAgentRevision;
    else overlay.dataset.liveAgentRevision = String(activity.revision);
    if (eyebrow) eyebrow.textContent = activity.kind === "joined"
      ? `AgentX Center · ${activity.actorLabel} online`
      : `AgentX Center · accepted ${activity.actorLabel}`;
    if (title) title.textContent = activity.kind === "joined"
      ? `${activity.actorLabel.toUpperCase()} IS HERE.`
      : "NESTOR ACKNOWLEDGED IT.";
    if (briefing) briefing.textContent = activity.intent;
    if (commit) commit.textContent = activity.revision === null
      ? `${activity.actorKind} presence · online`
      : `${activity.actorKind} operation · revision ${activity.revision}`;
  };
  const observeMission = (state: LiveMissionRuntimeState | null): void => {
    if (variant !== "live-observer") return;
    liveMissionState = state;
    const mission = state?.mission ?? null;
    const director = state?.director ?? null;
    if (!mission || !director || director.mode === "neutral") {
      delete overlay.dataset.mission;
      delete overlay.dataset.missionAction;
      delete overlay.dataset.missionStage;
      delete overlay.dataset.missionState;
      liveMissionState = null;
      const terminal = mission?.status === "completed" || mission?.status === "cancelled";
      if (terminal) liveActivityState = null;
      observeLiveActivity(state?.connection !== "live" || terminal ? null : liveActivityState);
      return;
    }
    const stage = director.stageId
      ? mission.stages.find((entry) => entry.stageId === director.stageId) ?? null
      : null;
    const participants = [...new Set(mission.stages.map((entry) => entry.assignment?.actorLabel).filter((label): label is string => Boolean(label)))];
    const eyebrow = overlay.querySelector<HTMLElement>("[data-nestor-eyebrow]");
    const title = overlay.querySelector<HTMLElement>("[data-nestor-title]");
    const briefing = overlay.querySelector<HTMLElement>("[data-nestor-briefing]");
    const commit = overlay.querySelector<HTMLElement>("[data-nestor-commit]");
    overlay.dataset.mission = mission.missionId;
    overlay.dataset.missionState = mission.status;
    if (director.action) overlay.dataset.missionAction = director.action;
    else delete overlay.dataset.missionAction;
    if (director.stageId) overlay.dataset.missionStage = director.stageId;
    else delete overlay.dataset.missionStage;
    if (director.actorId) overlay.dataset.liveAgentActor = director.actorId;
    else delete overlay.dataset.liveAgentActor;
    if (director.revision >= 0) overlay.dataset.liveAgentRevision = String(director.revision);
    if (eyebrow) eyebrow.textContent = `Nestor · ${director.mode} · sequence ${director.seq}`;
    if (title) title.textContent = director.mode === "briefing" ? "MISSION BRIEFED."
      : director.mode === "blocked" ? "MISSION NEEDS DIRECTION."
        : director.mode === "paused" ? "MISSION PAUSED."
          : director.mode === "completed" ? "MISSION COMPLETE."
            : director.mode === "failed" ? "MISSION NEEDS REVIEW."
              : `${(director.actorLabel ?? "AgentX").toUpperCase()} ${director.stageStatus === "completed" ? "DELIVERED." : "AT WORK."}`;
    if (briefing) briefing.textContent = director.mode === "briefing"
      ? participants.length > 0
        ? `${mission.title}. ${participants.join(" and ")} ${participants.length === 1 ? "is" : "are"} assigned across Analyze, Build, and Validate.`
        : `${mission.title}. Awaiting two eligible AgentX actors across Analyze, Build, and Validate.`
      : director.message;
    if (commit) commit.textContent = `${stage?.title ?? mission.title} · ${mission.status} · seq ${director.seq} · revision ${director.revision}`;
  };
  const reset = (): void => {
    if (!nestorEnabled) {
      observeMission(null);
      return;
    }
    overlay.classList.remove("gx-welcome--presenting");
    const eyebrow = overlay.querySelector<HTMLElement>("[data-nestor-eyebrow]");
    const title = overlay.querySelector<HTMLElement>("[data-nestor-title]");
    const briefing = overlay.querySelector<HTMLElement>("[data-nestor-briefing]");
    const commit = overlay.querySelector<HTMLElement>("[data-nestor-commit]");
    if (eyebrow) eyebrow.textContent = "AgentX Center · Nestor online";
    if (title) title.textContent = "MAKE THE WORLD MOVE.";
    if (briefing) briefing.textContent = "Pick a live demo. Nestor will change this scene with the same inspectable commands available to every AgentX collaborator.";
    if (commit) commit.textContent = "Scene-native guide · ready";
    overlay.querySelectorAll<HTMLButtonElement>("[data-nestor-topic]").forEach((button) => button.setAttribute("aria-pressed", "false"));
  };
  const present = (presentation: NestorPresentation): void => {
    if (!nestorEnabled) return;
    overlay.classList.toggle("gx-welcome--presenting", presentation.topic !== null && !presentation.error);
    const eyebrow = overlay.querySelector<HTMLElement>("[data-nestor-eyebrow]");
    const title = overlay.querySelector<HTMLElement>("[data-nestor-title]");
    const briefing = overlay.querySelector<HTMLElement>("[data-nestor-briefing]");
    const commit = overlay.querySelector<HTMLElement>("[data-nestor-commit]");
    if (eyebrow) eyebrow.textContent = presentation.eyebrow;
    if (title) title.textContent = presentation.title;
    if (briefing) briefing.textContent = presentation.message;
    if (commit) commit.textContent = presentation.commit
      ? `Agent commit ${presentation.commit.id} · revision ${presentation.commit.revision}`
      : presentation.error ? "Agent commit rejected" : "Scene-native guide · ready";
    overlay.querySelectorAll<HTMLButtonElement>("[data-nestor-topic]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.nestorTopic === presentation.topic));
    });
  };
  /**
   * Renders the pending change, or clears it.
   *
   * `textContent` throughout, never `innerHTML`: every string here — intent, entity ids,
   * command descriptions — originates in a command set that an agent composed, and an agent
   * is not a trusted author of markup.
   */
  const showProposal = (proposal: CoauthorProposal | null, stale = false): void => {
    if (!nestorEnabled) return;
    const card = overlay.querySelector<HTMLElement>("[data-nestor-proposal]");
    // Closing the card removes whatever the keyboard was on. Without this the focus ring is
    // simply gone and the next Tab restarts from the top of the document — which is a long
    // way back for someone who just pressed Discard.
    const hadFocus = card !== null && card.contains(document.activeElement);
    overlay.classList.toggle("gx-welcome--proposing", proposal !== null);
    overlay.classList.toggle("gx-welcome--proposal-stale", proposal !== null && stale);
    if (!proposal) {
      delete overlay.dataset.proposalId;
      if (hadFocus) {
        const back = proposalOrigin ?? overlay.querySelector<HTMLButtonElement>("[data-nestor-topic]");
        back?.focus();
      }
      proposalOrigin = null;
      return;
    }
    overlay.dataset.proposalId = proposal.id;
    const actor = overlay.querySelector<HTMLElement>("[data-proposal-actor]");
    const meta = overlay.querySelector<HTMLElement>("[data-proposal-meta]");
    const intent = overlay.querySelector<HTMLElement>("[data-proposal-intent]");
    const toggle = overlay.querySelector<HTMLElement>("[data-proposal-toggle]");
    const lines = overlay.querySelector<HTMLOListElement>("[data-proposal-lines]");
    if (actor) actor.textContent = `${proposal.actor.label} proposes`;
    if (meta) meta.textContent = summarizeProposal(proposal);
    // The intent is the sentence the agent wrote about its own change; it is the headline.
    if (intent) intent.textContent = proposal.intent;
    if (toggle) {
      toggle.textContent = proposal.commandCount === 1
        ? "Show the exact command"
        : `Show all ${proposal.commandCount} commands`;
    }
    if (lines) {
      // A real checkbox per command, not a styled div: it is a genuine choice, and the
      // keyboard, the screen reader and the label-click target all come free from the element
      // that already means this. The list carries the checked state, so nothing here needs to
      // know how the dependency cascade decided it.
      lines.replaceChildren(...proposal.lines.map((line, index) => {
        const item = document.createElement("li");
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = !proposal.excluded.includes(index);
        box.dataset.proposalCommand = String(index);
        const text = document.createElement("span");
        text.textContent = line;
        label.append(box, text);
        item.append(label);
        item.classList.toggle("is-excluded", !box.checked);
        return item;
      }));
    }
    const accept = overlay.querySelector<HTMLButtonElement>("[data-proposal-accept]");
    if (accept) {
      const empty = proposal.excluded.length >= proposal.commandCount;
      // Nothing left to apply is not an error to explain after the fact; the button says so.
      accept.disabled = empty || stale;
      accept.textContent = empty ? "Nothing selected" : "Apply change";
    }
    // Announced on arrival rather than only on decision: the proposal *is* the notification,
    // and a screen-reader user should not have to go looking for it.
    const outcome = overlay.querySelector<HTMLElement>("[data-proposal-outcome]");
    if (outcome) {
      outcome.textContent = stale
        ? `${proposal.actor.label}'s proposal is out of date — the scene moved.`
        : `${proposal.actor.label} proposes ${proposal.commandCount} change${proposal.commandCount === 1 ? "" : "s"}. Review and apply or discard.`;
      outcome.dataset.outcome = stale ? "stale" : "pending";
    }
  };

  /** What actually happened — including "nothing", which is a real and reportable answer. */
  const showOutcome = (result: CoauthorOutcome | null): void => {
    if (!nestorEnabled) return;
    const outcome = overlay.querySelector<HTMLElement>("[data-proposal-outcome]");
    if (!outcome) return;
    if (!result) {
      outcome.textContent = "";
      delete outcome.dataset.outcome;
      return;
    }
    outcome.dataset.outcome = result.status;
    if (result.status === "accepted") {
      outcome.textContent = result.commit
        ? `Applied as revision ${result.commit.revision}. Undo in the editor reverses it.`
        : "Applied.";
    } else if (result.status === "discarded") {
      // Said plainly, because "nothing happened" is the property the person was promised.
      outcome.textContent = "Discarded. The scene was not changed.";
    } else if (result.status === "stale") {
      outcome.textContent = `Not applied — the scene moved to revision ${result.currentRevision} while this was waiting.`;
    } else {
      outcome.textContent = `Not applied — ${result.error}`;
    }
  };

  overlay.querySelectorAll<HTMLButtonElement>("[data-nestor-topic]").forEach((button) => {
    button.disabled = !onNestorTopic;
    button.addEventListener("click", () => {
      const topic = button.dataset.nestorTopic;
      if (topic !== "build" && topic !== "play" && topic !== "explore") return;
      // Remembered so answering the proposal returns the keyboard to the button that asked
      // for it, rather than to wherever the DOM happens to start.
      proposalOrigin = button;
      onNestorTopic?.(topic);
    });
  });
  // Delegated: the rows are rebuilt on every render, so per-row listeners would have to be
  // re-attached each time and would leak the ones they replaced.
  overlay.querySelector<HTMLElement>("[data-proposal-lines]")?.addEventListener("change", (event) => {
    const box = event.target as HTMLInputElement | null;
    const index = Number(box?.dataset.proposalCommand);
    if (!Number.isInteger(index)) return;
    coauthor?.onToggleCommand?.(index);
  });
  overlay.querySelector<HTMLButtonElement>("[data-proposal-accept]")?.addEventListener("click", () => {
    coauthor?.onAccept?.();
  });
  overlay.querySelector<HTMLButtonElement>("[data-proposal-discard]")?.addEventListener("click", () => {
    coauthor?.onDiscard?.();
  });
  // Escape discards, matching every other dismissible surface in the product. Bound on the
  // card rather than the document so it cannot swallow Escape from the editor or a dialog.
  overlay.querySelector<HTMLElement>("[data-nestor-proposal]")?.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Escape") return;
    event.stopPropagation();
    coauthor?.onDiscard?.();
  });
  const editor = overlay.querySelector(".gx-go-editor");
  if (onEnter) {
    editor?.addEventListener("click", () => { onEnter(); dispose(); });
  } else {
    editor?.remove();
  }
  // The second destination from §5. Added only when a caller supplies it, so the button can
  // never be a dead control — the front door should not advertise a room that is not there.
  if (onGames) {
    const games = document.createElement("button");
    games.type = "button";
    games.className = "gx-go-games";
    games.textContent = "Games & Playgrounds";
    games.addEventListener("click", () => { onGames(); dispose(); });
    overlay.querySelector(".gx-actions")?.append(games);
  }
  // §5's third destination. Same rule: added only when wired, so it is never a dead button.
  if (onBrowse) {
    const browse = document.createElement("button");
    browse.type = "button";
    browse.className = "gx-go-browse";
    browse.textContent = "Browse Scenes";
    browse.addEventListener("click", () => { onBrowse(); dispose(); });
    overlay.querySelector(".gx-actions")?.append(browse);
  }
  if (!overlay.querySelector(".gx-actions")?.children.length) overlay.querySelector(".gx-actions")?.remove();
  container.append(style, overlay);
  return { present, observeLiveActivity, observeMission, showProposal, showOutcome, reset, dispose };
}

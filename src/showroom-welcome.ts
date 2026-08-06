import type { NestorPresentation, NestorTopic } from "./showroom-nestor";
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
): ShowroomWelcomeHandle {
  const nestorEnabled = variant === "agentx" && typeof onNestorTopic === "function";
  const style = document.createElement("style");
  style.textContent = `
    .gx-welcome{position:fixed;inset:0;z-index:30;box-sizing:border-box;pointer-events:none;font-family:var(--gx-font);display:flex;align-items:flex-end;justify-content:flex-start;padding:clamp(20px,4vw,54px)}
    .gx-welcome::before{content:"";position:absolute;inset:auto 0 0 0;height:46%;background:linear-gradient(180deg,rgba(3,12,20,0),rgba(3,12,20,.7));pointer-events:none}
    .gx-welcome-card{position:relative;box-sizing:border-box;width:min(500px,calc(100vw - 40px));display:flex;flex-direction:column;align-items:flex-start;gap:13px;text-align:left;padding:22px 24px 20px;border:1px solid rgba(111,233,255,.28);border-radius:20px;background:linear-gradient(145deg,rgba(6,23,34,.86),rgba(8,19,31,.62));box-shadow:0 24px 70px rgba(0,8,16,.48),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(16px)}
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
  overlay.querySelectorAll<HTMLButtonElement>("[data-nestor-topic]").forEach((button) => {
    button.disabled = !onNestorTopic;
    button.addEventListener("click", () => {
      const topic = button.dataset.nestorTopic;
      if (topic === "build" || topic === "play" || topic === "explore") onNestorTopic?.(topic);
    });
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
  return { present, observeLiveActivity, observeMission, reset, dispose };
}

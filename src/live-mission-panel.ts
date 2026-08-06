import type {
  LiveMissionStage,
  LiveMissionView,
  LiveSessionClient,
  LiveSessionMemberView,
  LiveSessionStatus,
} from "./live-session-client";

const TEMPLATE_ID = "agentx-center-artifact-v1" as const;
const TEMPLATE_STAGES = [
  { stageId: "analyze", title: "Analyze", capability: "mission:explore" },
  { stageId: "build", title: "Build", capability: "mission:build" },
  { stageId: "validate", title: "Validate", capability: "mission:validate" },
] as const;
const TERMINAL = new Set(["completed", "failed", "cancelled"]);

const CSS = `
.gx-ms{border-top:1px solid rgba(111,233,255,.18);padding-top:7px}
.gx-ms-head{display:flex;align-items:center;gap:7px;width:100%;padding:3px 1px;color:#e9fbff;background:transparent;border:0;font:600 11px/1.4 "Space Grotesk",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;text-align:left}
.gx-ms-head::after{content:"⌄";margin-left:auto;color:#6fe9ff;transition:transform .16s ease}
.gx-ms-head[aria-expanded="false"]::after{transform:rotate(-90deg)}
.gx-ms-head:focus-visible,.gx-ms button:focus-visible,.gx-ms select:focus-visible{outline:2px solid #7dd3fc;outline-offset:2px}
.gx-ms-count{min-width:18px;padding:1px 5px;border-radius:999px;color:#07141d;background:#6fe9ff;font-size:9px;text-align:center}
.gx-ms-body{display:flex;flex-direction:column;gap:7px;padding-top:7px}
.gx-ms-kicker,.gx-ms-meta,.gx-ms-note{margin:0;color:#9fb0c4;font-size:10px;line-height:1.4}
.gx-ms-title{margin:0;color:#f1fbff;font-size:13px;line-height:1.25}
.gx-ms-state{display:inline-flex;align-items:center;width:max-content;gap:5px;padding:2px 6px;border-radius:999px;border:1px solid rgba(111,233,255,.25);color:#9cefff;font-size:9px;text-transform:uppercase;letter-spacing:.06em}
.gx-ms-state[data-state="blocked"],.gx-ms-state[data-state="failed"]{color:#ffd09a;border-color:rgba(255,196,122,.38)}
.gx-ms-state[data-state="completed"]{color:#95f3bf;border-color:rgba(118,240,174,.38)}
.gx-ms-stages,.gx-ms-evidence{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}
.gx-ms-stage{display:grid;grid-template-columns:18px minmax(0,1fr);gap:1px 6px;padding:6px;border-radius:7px;background:rgba(80,183,220,.07);border:1px solid rgba(111,233,255,.11)}
.gx-ms-index{grid-row:1/4;display:grid;place-items:center;width:18px;height:18px;border-radius:50%;color:#07141d;background:#6fe9ff;font-weight:700;font-size:9px}
.gx-ms-stage[data-state="completed"] .gx-ms-index{background:#76f0ae}
.gx-ms-stage[data-state="blocked"] .gx-ms-index,.gx-ms-stage[data-state="interrupted"] .gx-ms-index,.gx-ms-stage[data-state="failed"] .gx-ms-index{background:#ffc47a}
.gx-ms-stage-line{display:flex;align-items:baseline;gap:5px;min-width:0}
.gx-ms-stage-line strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px}
.gx-ms-stage-line span{margin-left:auto;color:#8faabd;font-size:9px;text-transform:uppercase}
.gx-ms-progress{height:3px;overflow:hidden;border-radius:99px;background:rgba(255,255,255,.08)}
.gx-ms-progress i{display:block;height:100%;background:linear-gradient(90deg,#3bc9e7,#83f1b8)}
.gx-ms-stage small{color:#9fb0c4;font-size:9.5px;line-height:1.35}
.gx-ms-form{display:flex;flex-direction:column;gap:6px}
.gx-ms-form label{display:grid;grid-template-columns:58px minmax(0,1fr);align-items:center;gap:6px;color:#aebdca;font-size:10px}
.gx-ms select{min-width:0;color:#eefaff;background:#111a26;border:1px solid rgba(111,233,255,.22);border-radius:5px;padding:4px;font:inherit}
.gx-ms-actions{display:flex;flex-wrap:wrap;gap:5px}
.gx-ms-actions button{color:#eafaff;background:rgba(111,233,255,.08);border:1px solid rgba(111,233,255,.2);border-radius:6px;padding:4px 7px;font:600 10px/1.3 "Space Grotesk",system-ui,sans-serif;cursor:pointer}
.gx-ms-actions button[data-primary="true"]{color:#07141d;background:#6fe9ff;border-color:#9df3ff}
.gx-ms-actions button:disabled,.gx-ms select:disabled{opacity:.42;cursor:not-allowed}
.gx-ms-evidence button,.gx-ms-evidence span{display:block;box-sizing:border-box;width:100%;text-align:left;color:#b9d1df;background:rgba(111,233,255,.08);border:1px solid rgba(111,233,255,.2);border-radius:6px;padding:4px 7px;font:400 10px/1.3 "Space Grotesk",system-ui,sans-serif}
.gx-ms-evidence button{cursor:pointer}
.gx-ms-evidence span{opacity:.78}
.gx-ms-evidence small{color:#8faabd;font-size:9px}
.gx-ms-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media(max-width:720px){.gx-ms-body{padding-bottom:2px}.gx-ms-stage{padding:5px}.gx-ms-actions button{min-height:32px}}
@media(prefers-reduced-motion:reduce){.gx-ms-head::after{transition:none}}
`;

export type LiveMissionPanel = {
  setStatus(status: LiveSessionStatus): void;
  announce(message: string): void;
  dispose(): void;
};

export function mountLiveMissionPanel(
  container: HTMLElement,
  client: LiveSessionClient,
  options: {
    focusMission?: (missionId: string) => void;
    inspectEvidence?: (missionId: string, evidenceId: string) => void;
  } = {},
): LiveMissionPanel {
  const host = container.querySelector<HTMLElement>(".gx-ls");
  if (!host) throw new Error("The live mission panel requires the live session panel");
  const style = document.createElement("style");
  style.textContent = CSS;
  const section = document.createElement("section");
  section.className = "gx-ms";
  section.setAttribute("aria-label", "AgentX mission director");
  const header = document.createElement("button");
  header.type = "button";
  header.className = "gx-ms-head";
  header.dataset.action = "toggle";
  header.setAttribute("aria-expanded", String(!window.matchMedia?.("(max-width: 720px)").matches));
  header.innerHTML = `<span>Mission director</span><span class="gx-ms-count" data-role="count">0</span>`;
  const body = document.createElement("div");
  body.className = "gx-ms-body";
  body.dataset.role = "body";
  body.id = "gx-live-mission-body";
  header.setAttribute("aria-controls", body.id);
  body.hidden = header.getAttribute("aria-expanded") !== "true";
  const live = document.createElement("p");
  live.className = "gx-ms-sr";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  section.append(header, body, live);
  host.querySelector(".gx-ls-note")?.before(section);
  document.head.append(style);

  let current: LiveSessionStatus = client.status;
  let signature = "";
  let pending = false;
  let creating = false;
  let notice = "";
  let renderProfile = document.documentElement.dataset.gxRenderProfile ?? "balanced";

  const announce = (message: string): void => {
    live.textContent = "";
    window.setTimeout(() => { live.textContent = message; }, 30);
  };

  const freshestAgents = (): LiveSessionMemberView[] => [...current.members.reduce((byActor, member) => {
    if (member.kind !== "agent" || member.role !== "agent") return byActor;
    const previous = byActor.get(member.actorId);
    if (!previous || (member.online && !previous.online)
      || (member.online === previous.online && member.joinedAt.localeCompare(previous.joinedAt) > 0)) {
      byActor.set(member.actorId, member);
    }
    return byActor;
  }, new Map<string, LiveSessionMemberView>()).values()]
    .filter((member) => member.online)
    .sort((left, right) => left.actorId.localeCompare(right.actorId));

  const visibleMission = (): LiveMissionView | null => {
    const active = current.missions.filter((mission) => !TERMINAL.has(mission.status)).at(-1);
    return active ?? current.missions.at(-1) ?? null;
  };

  const optionMarkup = (capability: string, selectedMemberId = ""): string => {
    const eligible = freshestAgents().filter((member) => member.capabilities?.includes(capability));
    const selected = current.members.find((member) => member.memberId === selectedMemberId);
    const selectedOffline = selected && !eligible.some((member) => member.memberId === selectedMemberId);
    return [
      ...(selectedMemberId ? [] : ["<option value=\"\">Unassigned</option>"]),
      ...(selectedOffline ? [`<option value="${escapeHtml(selected.memberId)}" selected disabled>${escapeHtml(selected.label)} (offline)</option>`] : []),
      ...eligible.map((member) => `<option value="${escapeHtml(member.memberId)}"${member.memberId === selectedMemberId ? " selected" : ""}>${escapeHtml(member.label)}</option>`),
    ].join("");
  };

  const stageMarkup = (stage: LiveMissionStage): string => {
    const evidence = stage.latestEvidence?.summary ?? (stage.status === "interrupted" ? "Agent unavailable — reassignment required" : "Awaiting evidence");
    return `<li class="gx-ms-stage" data-stage="${escapeHtml(stage.stageId)}" data-state="${stage.status}">
      <span class="gx-ms-index">${stage.order}</span>
      <div class="gx-ms-stage-line"><strong>${escapeHtml(stage.title)}</strong><span>${escapeHtml(stage.status)}</span></div>
      <div class="gx-ms-progress" role="progressbar" aria-label="${stage.title} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(stage.progress * 100)}"><i style="width:${Math.round(stage.progress * 100)}%"></i></div>
      <small>${escapeHtml(stage.assignment?.actorLabel ?? "Unassigned")} · ${escapeHtml(evidence)}</small>
    </li>`;
  };

  const render = (): void => {
    const mission = visibleMission();
    const agents = freshestAgents();
    const nextSignature = JSON.stringify({
      role: current.role,
      sessionId: current.sessionId,
      agents: agents.map((member) => [member.memberId, member.actorId, member.label, member.capabilities]),
      missions: current.missions,
      renderProfile,
      pending,
      creating,
      notice,
    });
    if (nextSignature === signature) return;
    signature = nextSignature;
    const focusedKey = section.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.focusKey ?? null
      : null;
    const count = section.querySelector<HTMLElement>('[data-role="count"]');
    if (count) count.textContent = mission && !TERMINAL.has(mission.status) ? "1" : "0";

    if (!mission || creating) {
      if (current.role !== "owner") {
        body.innerHTML = `<p class="gx-ms-note">No active mission. The session owner can brief the curated AgentX mission when two eligible agents are online.</p>`;
      } else {
        const defaults = new Map<string, string>();
        for (const [index, stage] of TEMPLATE_STAGES.entries()) {
          const eligible = agents.filter((member) => member.capabilities?.includes(stage.capability));
          defaults.set(stage.stageId, eligible[index === 2 && eligible.length > 1 ? 1 : 0]?.memberId ?? "");
        }
        body.innerHTML = `
          <p class="gx-ms-kicker">Curated mission template</p>
          <h3 class="gx-ms-title">Signal Forge Calibration</h3>
          <p class="gx-ms-meta">Analyze a signal, build a real scene artifact, then validate the accepted result.</p>
          <div class="gx-ms-form">${TEMPLATE_STAGES.map((stage) => `<label>${stage.title}<select data-start-stage="${stage.stageId}" data-capability="${stage.capability}" data-focus-key="start-${stage.stageId}"${pending ? " disabled" : ""}>${optionMarkup(stage.capability, defaults.get(stage.stageId))}</select></label>`).join("")}</div>
          <div class="gx-ms-actions"><button type="button" data-action="start" data-primary="true" data-focus-key="start"${pending ? " disabled" : ""}>Brief mission</button>${mission ? `<button type="button" data-action="return" data-focus-key="return">Return to evidence</button>` : ""}</div>
          <p class="gx-ms-note" data-role="note">${escapeHtml(notice || "Two distinct AgentX actors are required.")}</p>`;
      }
    } else {
      const owner = current.role === "owner";
      const canActivate = owner && mission.status === "briefing";
      const canPause = owner && (mission.status === "active" || mission.status === "blocked");
      const canResume = owner && (mission.status === "paused" || mission.status === "blocked");
      const canCancel = owner && !TERMINAL.has(mission.status);
      const projected = mission.status !== "completed" && mission.status !== "cancelled";
      const artifactLimit = renderProfile === "mobile" ? 2 : 4;
      const projectedEvidenceIds = new Set(projected
        ? mission.stages.flatMap((stage) => stage.evidence)
          .sort((left, right) => left.seq - right.seq
            || left.revision - right.revision
            || left.evidenceId.localeCompare(right.evidenceId))
          .slice(-artifactLimit)
          .map((evidence) => evidence.evidenceId)
        : []);
      const evidenceMarkup = mission.stages.flatMap((stage) => stage.evidence.slice(-2).map((evidence) => {
        const operationDetail = evidence.operation
          ? `${evidence.operation.path} · ${evidence.operation.intent}`
          : null;
        const validationDetail = evidence.kind === "validation"
          ? `${evidence.outcome ?? "reported"}${evidence.inspectedRevision === undefined ? "" : ` at inspected revision ${evidence.inspectedRevision}`}`
          : null;
        const description = [
          `${stage.title} ${evidence.kind} evidence`,
          evidence.actorLabel,
          evidence.summary,
          operationDetail,
          validationDetail,
          `server sequence ${evidence.seq}`,
          `scene revision ${evidence.revision}`,
        ].filter((value): value is string => Boolean(value)).join(". ");
        const detail = [operationDetail, validationDetail].filter(Boolean).join(" · ");
        const label = `<strong>${escapeHtml(stage.title)} · ${escapeHtml(evidence.kind)}</strong> · ${escapeHtml(evidence.actorLabel)}<br>${escapeHtml(evidence.summary)}${detail ? `<br><small>${escapeHtml(detail)}</small>` : ""}`;
        return projectedEvidenceIds.has(evidence.evidenceId)
          ? `<li><button type="button" data-action="evidence" data-evidence="${escapeHtml(evidence.evidenceId)}" data-focus-key="evidence-${escapeHtml(evidence.evidenceId)}" aria-label="Focus projected ${escapeHtml(description)}">${label}</button></li>`
          : `<li><span data-evidence-record="${escapeHtml(evidence.evidenceId)}" aria-label="Retained ${escapeHtml(description)}">${label}</span></li>`;
      })).join("");
            body.innerHTML = `
        <span class="gx-ms-state" data-state="${mission.status}">${escapeHtml(mission.status)}</span>
        <h3 class="gx-ms-title">${escapeHtml(mission.title)}</h3>
        <p class="gx-ms-meta">server seq ${mission.updatedSeq} · scene revision ${mission.revision}</p>
        <ol class="gx-ms-stages">${mission.stages.map(stageMarkup).join("")}</ol>
        ${owner && !TERMINAL.has(mission.status) ? `<div class="gx-ms-form">${mission.stages.filter((stage) => stage.status !== "completed").map((stage) => `<label>${escapeHtml(stage.title)}<select data-assign-stage="${stage.stageId}" data-focus-key="assign-${stage.stageId}"${pending ? " disabled" : ""}>${optionMarkup(stage.capability, stage.assignment?.memberId)}</select></label>`).join("")}</div>` : ""}
        <div class="gx-ms-actions">
          ${projected ? `<button type="button" data-action="focus" data-focus-key="focus">Focus board</button>` : ""}
          ${owner && TERMINAL.has(mission.status) && current.missions.length < 4 ? `<button type="button" data-action="new" data-primary="true" data-focus-key="new">New mission</button>` : ""}
          ${canActivate ? `<button type="button" data-action="activate" data-primary="true" data-focus-key="activate"${pending ? " disabled" : ""}>Begin</button>` : ""}
          ${canPause ? `<button type="button" data-action="pause" data-focus-key="pause"${pending ? " disabled" : ""}>Pause</button>` : ""}
          ${canResume ? `<button type="button" data-action="resume" data-primary="true" data-focus-key="resume"${pending ? " disabled" : ""}>Resume</button>` : ""}
          ${canCancel ? `<button type="button" data-action="cancel" data-focus-key="cancel"${pending ? " disabled" : ""}>Cancel</button>` : ""}
        </div>
        ${evidenceMarkup ? `<ul class="gx-ms-evidence" aria-label="Mission evidence">${evidenceMarkup}</ul>` : ""}
        <p class="gx-ms-note" data-role="note">${escapeHtml(notice)}</p>`;
    }
    if (focusedKey) {
      (section.querySelector<HTMLElement>(`[data-focus-key="${globalThis.CSS.escape(focusedKey)}"]`) ?? header).focus();
    }
  };

  const run = async (work: () => Promise<unknown>, working: string): Promise<void> => {
    if (pending) return;
    const focusKey = section.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.focusKey ?? null
      : null;
    pending = true;
    notice = "";
    signature = "";
    render();
    const note = section.querySelector<HTMLElement>('[data-role="note"]');
    if (note) note.textContent = working;
    try {
      await work();
      notice = "";
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error);
      announce(notice);
    } finally {
      pending = false;
      signature = "";
      render();
      const target = focusKey ? section.querySelector<HTMLElement>(`[data-focus-key="${globalThis.CSS.escape(focusKey)}"]`) : null;
      (target ?? header).focus();
    }
  };

  section.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "toggle") {
      const expanded = header.getAttribute("aria-expanded") !== "true";
      header.setAttribute("aria-expanded", String(expanded));
      body.hidden = !expanded;
      return;
    }
    const mission = visibleMission();
    if (action === "focus" && mission) {
      options.focusMission?.(mission.missionId);
      return;
    }
    if (action === "evidence" && mission && button.dataset.evidence) {
      options.inspectEvidence?.(mission.missionId, button.dataset.evidence);
      return;
    }
    if (action === "new") {
      creating = true;
      notice = "";
      signature = "";
      render();
      section.querySelector<HTMLElement>('[data-focus-key="start"]')?.focus();
      return;
    }
    if (action === "return") {
      creating = false;
      notice = "";
      signature = "";
      render();
      section.querySelector<HTMLElement>('[data-focus-key="new"]')?.focus();
      return;
    }
    if (action === "start") {
      const assignments = TEMPLATE_STAGES.map((stage) => ({
        stageId: stage.stageId,
        memberId: section.querySelector<HTMLSelectElement>(`[data-start-stage="${stage.stageId}"]`)?.value ?? "",
      }));
      const actors = new Set(assignments.map((assignment) => current.members.find((member) => member.memberId === assignment.memberId)?.actorId).filter(Boolean));
      const note = section.querySelector<HTMLElement>('[data-role="note"]');
      if (assignments.some((assignment) => !assignment.memberId) || actors.size < 2) {
        notice = "Assign every stage across at least two distinct online AgentX actors.";
        if (note) note.textContent = notice;
        announce("The mission requires two distinct eligible AgentX actors");
        return;
      }
      const ordinal = current.missions.length + 1;
      const token = stableHash(`${current.sessionId ?? "session"}:${ordinal}`).toString(36);
      void run(() => client.startMission({
        eventId: `me-${token}-start`,
        missionId: `mission-${token}`,
        templateId: TEMPLATE_ID,
        assignments,
      }), "Briefing mission…");
      return;
    }
    if (mission && new Set(["activate", "pause", "resume", "cancel"]).has(action ?? "")) {
      const token = stableHash(`${mission.missionId}:${action}:${mission.updatedSeq}`).toString(36);
      void run(
        () => client.controlMission(mission.missionId, action as "activate" | "pause" | "resume" | "cancel", `me-${token}`),
        `${action} mission…`,
      );
    }
  });

  section.addEventListener("change", (event) => {
    const select = (event.target as Element).closest<HTMLSelectElement>("select[data-assign-stage]");
    const mission = visibleMission();
    if (!select || !mission || !select.value || current.role !== "owner") return;
    const stageId = select.dataset.assignStage ?? "";
    const token = stableHash(`${mission.missionId}:assign:${stageId}:${mission.updatedSeq}`).toString(36);
    void run(
      () => client.assignMissionStage(mission.missionId, stageId, select.value, `me-${token}`),
      `Assigning ${stageId}…`,
    );
  });

  section.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || body.hidden) return;
    body.hidden = true;
    header.setAttribute("aria-expanded", "false");
    header.focus();
    event.stopPropagation();
  });

  const setStatus = (status: LiveSessionStatus): void => {
    current = status;
    if (status.missions.some((entry) => !TERMINAL.has(entry.status))) creating = false;
    render();
  };
  const profileObserver = new MutationObserver(() => {
    const nextProfile = document.documentElement.dataset.gxRenderProfile ?? "balanced";
    if (nextProfile === renderProfile) return;
    renderProfile = nextProfile;
    signature = "";
    render();
  });
  profileObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-gx-render-profile"] });
  render();
  return {
    setStatus,
    announce,
    dispose() {
      profileObserver.disconnect();
      section.remove();
      style.remove();
    },
  };
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// The live-session panel: who is here, what they are doing, and whether this tab is
// actually connected.
//
// Three requirements are in tension: a collaborator needs to see remote presence and
// activity, the viewport is the product and must not be covered, and none of it may be
// mouse-only. So this is a narrow docked column with its own scroll, an ARIA live region
// for the things that matter (a join, a resync, going offline) and ordinary buttons
// throughout — no drag-only affordances, no hover-only information.
//
// It renders from `LiveSessionStatus` and nothing else. It holds no scene state, issues no
// mutations of its own, and every action it offers is a call into the client.

import type { LiveSessionClient, LiveSessionMemberView, LiveSessionOperation, LiveSessionStatus } from "./live-session-client";

const PANEL_CSS = `
.gx-ls {
  /* \`top\` is set from script — see stackBelowSceneBrowser. The scene browser docks to this
     same corner, and a fixed offset here would either overlap it or leave a gap when it is
     absent. Measuring is the only thing that stays correct in both cases. */
  position: fixed; top: 12px; right: 12px; width: 264px; max-height: calc(100vh - 24px);
  z-index: 24;
  display: flex; flex-direction: column; gap: 8px;
  font: 12px/1.45 "Space Grotesk", system-ui, sans-serif; color: #e9eef5;
  background: rgba(12, 16, 24, 0.82); border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px; padding: 10px; backdrop-filter: blur(6px);
}
.gx-ls[hidden] { display: none; }
/* Docked into the editor's own right column: it becomes part of that scrolling panel rather
   than a sheet floating over it. Position, width and backdrop all come from the host. */
.gx-ls--docked {
  position: static !important; width: auto !important; max-height: none !important;
  inset: auto !important; background: transparent; border: 0; padding: 0;
  backdrop-filter: none; z-index: auto;
}
.gx-ls--docked .gx-ls-activity { max-height: 132px; }
.gx-ls-head { display: flex; align-items: center; gap: 8px; }
.gx-ls-head strong { font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; }
.gx-ls-dot { width: 8px; height: 8px; border-radius: 50%; background: #6b7280; flex: none; }
.gx-ls-dot[data-state="live"] { background: #34d399; }
.gx-ls-dot[data-state="connecting"], .gx-ls-dot[data-state="reconnecting"] { background: #fbbf24; }
.gx-ls-dot[data-state="offline"] { background: #f87171; }
.gx-ls-health { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11px; color: #9fb0c4; }
.gx-ls-health b { color: #e9eef5; font-weight: 600; }
.gx-ls-members { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.gx-ls-member { display: flex; align-items: baseline; gap: 6px; padding: 4px 6px; border-radius: 6px; background: rgba(255,255,255,0.04); }
.gx-ls-member[data-online="false"] { opacity: 0.5; }
.gx-ls-swatch { width: 8px; height: 8px; border-radius: 2px; flex: none; background: #7dd3fc; }
.gx-ls-name { font-weight: 600; }
.gx-ls-role { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #9fb0c4; }
.gx-ls-sel { font-size: 10px; color: #7dd3fc; margin-left: auto; }
.gx-ls-activity { list-style: none; margin: 0; padding: 0; max-height: 168px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 2px; font-size: 11px; }
.gx-ls-activity li { color: #b9c6d6; padding: 2px 4px; border-left: 2px solid rgba(255,255,255,0.14); }
.gx-ls-activity li[data-kind="agent"] { border-left-color: #a78bfa; }
.gx-ls-activity li[data-kind="human"] { border-left-color: #34d399; }
.gx-ls-actor { color: #e9eef5; font-weight: 600; }
.gx-ls-foot { display: flex; gap: 6px; }
.gx-ls-foot button { flex: 1; font: inherit; color: inherit; background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.14); border-radius: 6px; padding: 4px 6px; cursor: pointer; }
.gx-ls-foot button:hover { background: rgba(255,255,255,0.14); }
.gx-ls-foot button:focus-visible { outline: 2px solid #7dd3fc; outline-offset: 1px; }
.gx-ls-note { margin: 0; font-size: 11px; color: #9fb0c4; min-height: 1.4em; }
.gx-ls-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 720px) {
  /* Phone: the viewport is the product, so the panel becomes a short bottom sheet rather
     than a column eating a third of the screen. \`top\` from the script is overridden. */
  .gx-ls { inset: auto 8px 8px 8px !important; width: auto; max-height: 45vh; }
}
@media (prefers-reduced-motion: reduce) { .gx-ls { backdrop-filter: none; } }
`;

const ROLE_LABEL: Record<string, string> = { owner: "Owner", editor: "Editor", viewer: "Viewer", agent: "Agent" };

/** Stable per-actor colour, so the same person is the same colour in every tab. */
function actorColor(actorId: string): string {
  let hash = 0;
  for (let index = 0; index < actorId.length; index += 1) hash = (Math.imul(31, hash) + actorId.charCodeAt(index)) | 0;
  return `hsl(${Math.abs(hash) % 360} 70% 62%)`;
}

/**
 * A one-line, human-readable summary of an operation.
 *
 * Deliberately derived from the command vocabulary rather than echoed from the payload: an
 * activity feed that prints whatever the server sent is one malformed intent away from
 * rendering a wall of JSON, and one bug away from rendering a credential.
 */
export function describeOperation(operation: LiveSessionOperation): string {
  const commands = Array.isArray(operation.commands) ? operation.commands : [];
  if (commands.length === 1) {
    const [command] = commands as Array<{ op?: string; id?: string; entity?: { label?: string; type?: string; id?: string } }>;
    if (command?.op === "spawn") return `added ${command.entity?.label ?? command.entity?.type ?? "an entity"}`;
    if (command?.op === "update") return `changed ${command.id ?? "an entity"}`;
    if (command?.op === "remove") return `removed ${command.id ?? "an entity"}`;
    if (command?.op === "set-environment") return "changed the environment";
  }
  return `applied ${commands.length} change${commands.length === 1 ? "" : "s"}`;
}

export type LiveSessionPanel = {
  setStatus(status: LiveSessionStatus): void;
  recordOperation(operation: LiveSessionOperation): void;
  announce(message: string): void;
  setVisible(visible: boolean): void;
  dispose(): void;
};

export function mountLiveSessionPanel(container: HTMLElement, client: LiveSessionClient): LiveSessionPanel {
  const style = document.createElement("style");
  style.textContent = PANEL_CSS;

  const panel = document.createElement("aside");
  panel.className = "gx-ls";
  panel.setAttribute("aria-label", "Live session");
  panel.innerHTML = `
    <div class="gx-ls-head">
      <span class="gx-ls-dot" data-role="dot" data-state="offline"></span>
      <strong>Live session</strong>
    </div>
    <p class="gx-ls-health" data-role="health"></p>
    <ul class="gx-ls-members" data-role="members" aria-label="Session members"></ul>
    <ul class="gx-ls-activity" data-role="activity" aria-label="Session activity"></ul>
    <p class="gx-ls-note" data-role="note"></p>
    <div class="gx-ls-foot">
      <button type="button" data-action="resync" title="Reload the shared scene from the server">Resync</button>
      <button type="button" data-action="leave" title="Leave this live session">Leave</button>
    </div>
    <p class="gx-ls-sr" data-role="live" role="status" aria-live="polite"></p>
  `;

  const find = <T extends HTMLElement>(role: string): T => panel.querySelector<T>(`[data-role="${role}"]`)!;
  const dot = find("dot");
  const health = find("health");
  const memberList = find<HTMLUListElement>("members");
  const activityList = find<HTMLUListElement>("activity");
  const note = find("note");
  const live = find("live");

  let lastConnection: string | null = null;
  let lastMemberIds = "";

  const announce = (message: string): void => {
    // Cleared first: assistive technology does not re-announce identical text, and "went
    // offline" twice in a row is exactly the case where the second one matters.
    live.textContent = "";
    window.setTimeout(() => {
      live.textContent = message;
    }, 30);
  };

  const setStatus = (status: LiveSessionStatus): void => {
    dot.dataset.state = status.connection;
    const latency = status.latencyMs === null ? "—" : `${status.latencyMs} ms`;
    health.innerHTML = [
      `<span>${status.connection}</span>`,
      `<span>rev <b>${status.revision}</b></span>`,
      `<span>seq <b>${status.seq}</b></span>`,
      `<span>rtt <b>${latency}</b></span>`,
      status.resynced ? "<span><b>resynced</b></span>" : "",
    ].filter(Boolean).join("");
    panel.setAttribute("aria-label", `Live session — ${status.connection}, revision ${status.revision}`);

    memberList.replaceChildren(...status.members.map((member: LiveSessionMemberView) => {
      const item = document.createElement("li");
      item.className = "gx-ls-member";
      item.dataset.online = String(member.online);
      item.dataset.actor = member.actorId;
      const swatch = document.createElement("span");
      swatch.className = "gx-ls-swatch";
      swatch.style.background = member.presence?.color ?? actorColor(member.actorId);
      const name = document.createElement("span");
      name.className = "gx-ls-name";
      name.textContent = member.label;
      const role = document.createElement("span");
      role.className = "gx-ls-role";
      role.textContent = ROLE_LABEL[member.role] ?? member.role;
      item.append(swatch, name, role);
      const selection = member.presence?.selection ?? [];
      if (selection.length > 0) {
        const sel = document.createElement("span");
        sel.className = "gx-ls-sel";
        sel.dataset.role = "selection";
        sel.textContent = selection.length === 1 ? selection[0] : `${selection.length} selected`;
        item.append(sel);
      }
      // Screen readers get the whole state in one string; sighted users get the layout.
      item.setAttribute("aria-label",
        `${member.label}, ${ROLE_LABEL[member.role] ?? member.role}, ${member.online ? "connected" : "disconnected"}` +
        `${selection.length ? `, ${selection.length} selected` : ""}`);
      return item;
    }));

    if (status.error) note.textContent = status.error;
    else if (status.connection === "reconnecting") note.textContent = "Reconnecting…";
    else note.textContent = "";

    if (status.connection !== lastConnection) {
      lastConnection = status.connection;
      announce(`Live session ${status.connection}`);
    }
    const memberIds = status.members.map((member) => `${member.actorId}:${member.online}`).join(",");
    if (memberIds !== lastMemberIds && lastMemberIds !== "") announce("Session members changed");
    lastMemberIds = memberIds;
  };

  const recordOperation = (operation: LiveSessionOperation): void => {
    const item = document.createElement("li");
    item.dataset.kind = operation.actorKind;
    item.dataset.actor = operation.actorId;
    const actor = document.createElement("span");
    actor.className = "gx-ls-actor";
    actor.textContent = operation.actorLabel;
    item.append(actor, document.createTextNode(` ${describeOperation(operation)} · r${operation.revision}`));
    activityList.prepend(item);
    // Bounded: an unbounded feed is a memory leak with a scrollbar.
    while (activityList.childElementCount > 60) activityList.lastElementChild?.remove();
    if (operation.actorKind === "agent") announce(`${operation.actorLabel} ${describeOperation(operation)}`);
  };

  panel.querySelector('[data-action="resync"]')?.addEventListener("click", () => {
    note.textContent = "Resyncing…";
    void client.resync().then(
      (revision) => announce(`Resynced to revision ${revision}`),
      (error: unknown) => {
        note.textContent = error instanceof Error ? error.message : String(error);
      },
    );
  });

  panel.querySelector('[data-action="leave"]')?.addEventListener("click", () => {
    void client.leave().then(() => announce("Left the live session"));
  });

  container.append(style, panel);
  document.documentElement.dataset.gxLiveSession = "visible";

  /**
   * Keeps this panel below the scene browser instead of underneath it.
   *
   * Both dock to the top-right corner. Rendered evidence caught them stacked: 29 green
   * assertions and a screenshot showing one panel occluding the other, which is exactly the
   * class of bug this project keeps screenshots for. `.gx-sb` is `position: fixed`, so its
   * bottom edge in viewport coordinates is the offset this one needs.
   */
  /** The editor's right column, when the editor is open and showing. */
  const editorColumn = (): HTMLElement | null => {
    const column = document.querySelector<HTMLElement>(".gx-ed-panel--right");
    if (!column) return null;
    return column.style.display === "none" ? null : column;
  };

  /**
   * Puts the panel where it belongs for the current layout.
   *
   * Two placements, because the two modes have different real estate:
   *
   *   - **Editor open** → docked *inside* the editor's right column, scrolling with it. The
   *     floating placement overlapped that column exactly, which is the same class of bug as
   *     the scene-browser collision: a panel that covers the thing it is meant to annotate.
   *   - **Otherwise** → a floating sheet under the scene browser.
   *
   * Measured by rect, not `offsetParent`: that property is null for every `position: fixed`
   * element, which the scene browser is — so the "is it there?" test said no while the panel
   * was plainly on screen, and an earlier version stacked on top of it anyway.
   */
  const reposition = (): void => {
    const column = editorColumn();
    if (column) {
      if (panel.parentElement !== column) column.append(panel);
      panel.classList.add("gx-ls--docked");
      panel.style.top = "";
      panel.style.maxHeight = "";
      return;
    }
    if (panel.parentElement !== container) container.append(panel);
    panel.classList.remove("gx-ls--docked");
    const sibling = document.querySelector<HTMLElement>(".gx-sb");
    const rect = sibling?.getBoundingClientRect() ?? null;
    const top = rect && rect.height > 0 ? Math.round(rect.bottom) + 8 : 12;
    panel.style.top = `${top}px`;
    panel.style.maxHeight = `calc(100vh - ${top + 12}px)`;
  };

  reposition();
  window.addEventListener("resize", reposition);
  // The scene browser grows and shrinks as scenes are listed and its save form opens, so a
  // one-shot measurement goes stale within seconds of the first interaction.
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reposition);
  const sceneBrowser = document.querySelector(".gx-sb");
  if (sceneBrowser && observer) observer.observe(sceneBrowser);

  // The editor is lazily imported and toggled by display, so there is no event to listen for.
  // Watching the container for structural and style changes catches both its arrival and each
  // show/hide, and the work is one querySelector plus a comparison.
  const layoutObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => reposition());
  layoutObserver?.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });

  return {
    setStatus,
    recordOperation,
    announce,
    setVisible: (visible: boolean) => {
      panel.hidden = !visible;
      document.documentElement.dataset.gxLiveSession = visible ? "visible" : "hidden";
    },
    dispose: () => {
      observer?.disconnect();
      layoutObserver?.disconnect();
      window.removeEventListener("resize", reposition);
      panel.remove();
      style.remove();
      delete document.documentElement.dataset.gxLiveSession;
    },
  };
}

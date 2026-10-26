/** Shared progressive disclosure for the two presentation HUDs. No scene state. */
import "./presentation-mobile.css";

export function foldPresentationPanel(panel: HTMLElement, label: string): void {
  const details = document.createElement("details");
  details.className = "gx-presentation-details";
  details.open = !window.matchMedia("(max-width: 820px)").matches;
  const summary = document.createElement("summary"); summary.textContent = label;
  const body = document.createElement("div"); body.className = "gx-presentation-detail-body";
  body.append(...panel.childNodes); details.append(summary, body); panel.append(details);
}

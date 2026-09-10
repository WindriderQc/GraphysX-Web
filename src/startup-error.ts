/** A failed renderer or lazy import still leaves the user a useful, keyboard-accessible page. */
export function showStartupError(root: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const panel = document.createElement("section");
  panel.setAttribute("role", "alert");
  panel.setAttribute("aria-labelledby", "gx-startup-error-title");
  panel.tabIndex = -1;
  Object.assign(root.style, {
    position: "fixed", inset: "0", display: "grid", placeItems: "center",
    overflow: "auto", background: "#081923", color: "#eaf7ff", fontFamily: "system-ui, sans-serif",
  });
  Object.assign(panel.style, { width: "min(30rem, calc(100vw - 48px))", padding: "24px 0", lineHeight: "1.5" });
  const title = document.createElement("h1");
  title.id = "gx-startup-error-title";
  title.textContent = "The 3D scene could not start";
  const explanation = document.createElement("p");
  explanation.textContent = /webgl|gl context/i.test(message)
    ? "Your browser could not create a 3D display. Check that hardware acceleration is available, then try again."
    : "A required scene file could not load. Check your connection, then try again.";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Try again";
  Object.assign(retry.style, {
    minHeight: "48px", padding: "10px 20px", background: "#78f0d0", color: "#08202b",
    border: "0", borderRadius: "10px", font: "700 16px system-ui", cursor: "pointer",
  });
  retry.addEventListener("click", () => window.location.reload());
  const details = document.createElement("details");
  details.style.marginTop = "24px";
  const summary = document.createElement("summary");
  summary.textContent = "Technical details";
  const diagnostic = document.createElement("p");
  diagnostic.style.overflowWrap = "anywhere";
  diagnostic.textContent = message;
  details.append(summary, diagnostic);
  panel.append(title, explanation, retry, details);
  root.replaceChildren(panel);
  panel.focus();
}

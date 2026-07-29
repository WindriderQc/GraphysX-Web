/**
 * The one product theme: design tokens and the brand font, installed once by the host.
 *
 * Before this there was no shared product stylesheet at all — `styles.css` is entirely
 * legacy-route selectors, and every front-door module injected its own <style> with its
 * own hardcoded palette, so three different cyans all claimed to be the accent. Worse,
 * the legacy sheet declared "Space Grotesk" without ever loading it, so the product has
 * been silently rendering in system fonts since the beginning.
 *
 * Modules keep injecting their own component styles — that locality is fine. What lives
 * here is what they must agree on: the font (vendored through @fontsource, so the no-CDN
 * posture holds) and the tokens. New chrome should reach for `var(--gx-*)` first and
 * invent a literal only for something genuinely local.
 */
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
// 600 is the workhorse weight of the chrome (`font:600 …` on names, tabs, badges); without
// this file the browser silently substitutes 700 for every one of those.
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";

export function installPlatformTheme(): void {
  if (!document.getElementById("gx-theme")) {
    const style = document.createElement("style");
    style.id = "gx-theme";
    style.textContent = `
    :root{
      --gx-font:"Space Grotesk",system-ui,sans-serif;
      /* The brand accent is the editor's teal-mint; the cool cyan pair exists for
         gradients and edges, not as a competing identity. */
      --gx-accent:#78f0d0;
      --gx-accent-deep:#2fb6d0;
      --gx-accent-edge:#4fd0e6;
      /* The accent at panel duties: a dark fill that carries ink-coloured text (active rows,
         tabs, chips), and three alpha washes so panels never re-derive their own rgba()s. */
      --gx-accent-fill:#1d6f5a;
      --gx-accent-soft:rgba(120,240,208,.13);
      --gx-accent-ring:rgba(120,240,208,.26);
      --gx-accent-glow:rgba(120,240,208,.42);
      --gx-life:#5fe0b4;
      --gx-violet:#8fa0e0;
      --gx-ink:#eafaff;
      --gx-ink-soft:#b3dae5;
      --gx-ink-faint:#7fc2d3;
      --gx-bg:#06111c;
      --gx-scrim:rgba(3,12,20,.7);
      --gx-panel:rgba(7,20,29,.82);
    }
    body{font-family:var(--gx-font)}
    :root[data-gx-contrast="high"]{
      --gx-accent:#96ffe3;--gx-accent-deep:#62e4ff;--gx-accent-edge:#8fefff;
      --gx-accent-fill:#176d5b;--gx-ink:#fff;--gx-ink-soft:#ddf7ff;--gx-ink-faint:#b8eaf5;
      --gx-bg:#000914;--gx-scrim:rgba(0,0,0,.84);--gx-panel:rgba(0,10,17,.96)
    }
    :root[data-gx-contrast="high"] button:focus-visible,
    :root[data-gx-contrast="high"] input:focus-visible,
    :root[data-gx-contrast="high"] select:focus-visible{outline:3px solid #ffe45e !important;outline-offset:2px !important}
    :root[data-gx-motion="reduce"] *,:root[data-gx-motion="reduce"] *::before,:root[data-gx-motion="reduce"] *::after{
      scroll-behavior:auto !important;animation-duration:.001ms !important;animation-iteration-count:1 !important;transition-duration:.001ms !important
    }
    .gx-display-settings{position:fixed;right:12px;bottom:12px;z-index:120;font:11px/1.35 var(--gx-font);color:var(--gx-ink)}
    .gx-display-settings>summary{list-style:none;cursor:pointer;padding:7px 10px;border:1px solid rgba(120,240,208,.34);border-radius:8px;background:rgba(5,18,26,.9);box-shadow:0 6px 22px rgba(0,0,0,.35)}
    .gx-display-settings>summary::-webkit-details-marker{display:none}
    .gx-display-settings[open]>summary{border-radius:0 0 8px 8px;border-top-color:transparent}
    .gx-display-panel{position:absolute;right:0;bottom:100%;width:220px;display:flex;flex-direction:column;gap:9px;padding:12px;border:1px solid rgba(120,240,208,.34);border-radius:10px 10px 0 10px;background:rgba(5,18,26,.97);box-shadow:0 14px 38px rgba(0,0,0,.5)}
    .gx-display-panel strong{font-size:12px}.gx-display-panel label{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--gx-ink-soft)}
    .gx-display-panel select{padding:5px 7px;border:1px solid rgba(120,240,208,.3);border-radius:6px;background:#081e28;color:var(--gx-ink);font:inherit}
  `;
    document.head.append(style);
  }
  if (document.querySelector(".gx-display-settings")) return;
  const root = document.documentElement;
  const storageKey = "graphysx.display.preferences.v1";
  type Preferences = { contrast: "standard" | "high"; motion: "auto" | "full" | "reduce" };
  let preferences: Preferences = { contrast: "standard", motion: "auto" };
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Partial<Preferences> | null;
    if (stored?.contrast === "high") preferences.contrast = "high";
    if (stored?.motion === "full" || stored?.motion === "reduce") preferences.motion = stored.motion;
  } catch { /* local preferences are optional */ }
  const apply = (): void => {
    root.dataset.gxContrast = preferences.contrast;
    const reduce = preferences.motion === "reduce"
      || (preferences.motion === "auto" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    root.dataset.gxMotion = reduce ? "reduce" : "full";
    try { window.localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { /* optional */ }
  };
  const details = document.createElement("details");
  details.className = "gx-display-settings";
  const summary = document.createElement("summary");
  summary.textContent = "Display";
  summary.setAttribute("aria-label", "Open display accessibility settings");
  const panel = document.createElement("div");
  panel.className = "gx-display-panel";
  const title = document.createElement("strong");
  title.textContent = "Display accessibility";
  const contrastLabel = document.createElement("label");
  contrastLabel.append("Contrast");
  const contrast = document.createElement("select");
  contrast.setAttribute("aria-label", "Contrast preference");
  contrast.innerHTML = '<option value="standard">Standard</option><option value="high">High contrast</option>';
  contrast.value = preferences.contrast;
  contrast.addEventListener("change", () => { preferences.contrast = contrast.value as Preferences["contrast"]; apply(); });
  contrastLabel.append(contrast);
  const motionLabel = document.createElement("label");
  motionLabel.append("Motion");
  const motion = document.createElement("select");
  motion.setAttribute("aria-label", "Motion preference");
  motion.innerHTML = '<option value="auto">System setting</option><option value="full">Full motion</option><option value="reduce">Reduced motion</option>';
  motion.value = preferences.motion;
  motion.addEventListener("change", () => { preferences.motion = motion.value as Preferences["motion"]; apply(); });
  motionLabel.append(motion);
  panel.append(title, contrastLabel, motionLabel);
  details.append(summary, panel);
  document.body.append(details);
  apply();
}

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
  if (document.getElementById("gx-theme")) return;
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
  `;
  document.head.append(style);
}

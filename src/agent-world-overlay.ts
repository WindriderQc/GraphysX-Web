/**
 * Generative 2D overlay sketches — the scene model's 2D layer (PRODUCT_SPEC §4).
 *
 * The spec's layered-rendering pillar draws a line: UI chrome (HUD, menus) is DOM over the
 * canvas and near-free — that already exists, it is how the welcome card and the play HUD are
 * built. What did *not* exist "in any form" (§8.1) was a **generative** 2D layer declared by the
 * scene and drawn over the 3D view. This module is that layer.
 *
 * Two hard rules from §5 shape it:
 *
 *  1. **One shared frame loop.** There is never a second `requestAnimationFrame`. These sketches
 *     do not run themselves — the host calls `draw(dt)` from its single `tick()`, in the same
 *     frame that renders the 3D scene, so the 2D and 3D layers advance together by construction.
 *  2. **It must earn its frame budget.** So the default is *no* overlay, every sketch is plain
 *     Canvas2D (not p5 — that is 900 KB and §4 keeps it opt-in behind this), and each is written
 *     to clear-and-draw in a few milliseconds with alpha so the 3D scene reads straight through.
 *
 * These are new hand-written sketches inspired by the archive's Nature-of-Code p5 work, not
 * ports — the p5 originals live in the workshop, not this repo — so they are labelled as such.
 * `id` is the scene-serialisable handle (`environment.overlay`); it round-trips like `sky`.
 */

export type AgentWorldOverlayId = "vignette" | "starfield" | "scanlines";

export type AgentWorldOverlayDescriptor = {
  id: AgentWorldOverlayId;
  label: string;
  description: string;
  /** Where the look comes from, honestly. None of these are ports. */
  provenance: string;
};

export const GRAPHYSX_AGENT_WORLD_OVERLAYS: readonly AgentWorldOverlayDescriptor[] = [
  {
    id: "vignette",
    label: "Vignette",
    description: "A soft darkened frame with a faint film grain. Cinematic, cheap, always safe.",
    provenance: "New Canvas2D sketch. No archive source.",
  },
  {
    id: "starfield",
    label: "Starfield",
    description: "Slow parallax star drift across the frame. Reads as depth beyond the scene.",
    provenance: "New Canvas2D sketch, inspired by the Nature-of-Code particle drifts.",
  },
  {
    id: "scanlines",
    label: "Scanlines",
    description: "Faint CRT scanlines with a slow vertical sweep. A retro instrument feel.",
    provenance: "New Canvas2D sketch. No archive source.",
  },
];

export function isOverlayId(value: unknown): value is AgentWorldOverlayId {
  return typeof value === "string" && GRAPHYSX_AGENT_WORLD_OVERLAYS.some((overlay) => overlay.id === value);
}

/**
 * A mounted sketch. `draw` is called once per host frame; `elapsed` is total seconds so a
 * sketch can be time-based without keeping its own clock, and `dt` is the frame delta.
 */
export interface OverlaySketch {
  draw(ctx: CanvasRenderingContext2D, dt: number, elapsed: number, width: number, height: number): void;
}

/** Build a fresh, stateful sketch instance. State (star positions, phase) lives in the closure. */
export function createOverlaySketch(id: AgentWorldOverlayId): OverlaySketch {
  switch (id) {
    case "vignette":
      return createVignette();
    case "starfield":
      return createStarfield();
    case "scanlines":
      return createScanlines();
  }
}

function createVignette(): OverlaySketch {
  return {
    draw(ctx, _dt, elapsed, width, height) {
      ctx.clearRect(0, 0, width, height);
      // Radial darkening: transparent at the centre, up to ~55% black at the corners. A large
      // inner radius keeps the middle — where the scene is — untouched.
      const cx = width / 2;
      const cy = height / 2;
      const inner = Math.min(width, height) * 0.34;
      const outer = Math.hypot(cx, cy);
      const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      // A breathing sheen on the top edge, so a static scene still feels alive under the frame.
      const pulse = 0.04 + 0.03 * Math.sin(elapsed * 0.6);
      const sheen = ctx.createLinearGradient(0, 0, 0, height * 0.5);
      sheen.addColorStop(0, `rgba(150,200,230,${pulse})`);
      sheen.addColorStop(1, "rgba(150,200,230,0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, width, height * 0.5);
    },
  };
}

function createStarfield(): OverlaySketch {
  type Star = { x: number; y: number; z: number; r: number };
  let stars: Star[] = [];
  let sizedFor = "";

  const seed = (width: number, height: number): void => {
    // No Math.random dependency on a fixed seed here is fine — visual drift, not determinism.
    // Positions are derived from an index hash so a given size always seeds the same field,
    // which keeps the look stable across a resize rather than reshuffling on every frame.
    const count = Math.round((width * height) / 9000);
    stars = Array.from({ length: count }, (_unused, index) => {
      const h1 = Math.sin(index * 12.9898) * 43758.5453;
      const h2 = Math.sin(index * 78.233) * 12345.6789;
      const h3 = Math.sin(index * 39.425) * 24634.6345;
      return {
        x: (h1 - Math.floor(h1)) * width,
        y: (h2 - Math.floor(h2)) * height,
        z: 0.35 + (h3 - Math.floor(h3)) * 0.65,
        r: 0.4 + (h1 - Math.floor(h1)) * 1.3,
      };
    });
    sizedFor = `${width}x${height}`;
  };

  return {
    draw(ctx, dt, elapsed, width, height) {
      if (sizedFor !== `${width}x${height}`) seed(width, height);
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        // Parallax: nearer stars (higher z) drift faster and shine brighter.
        star.x -= dt * 8 * star.z;
        if (star.x < 0) star.x += width;
        const twinkle = 0.55 + 0.45 * Math.sin(elapsed * 1.5 + star.y);
        ctx.globalAlpha = star.z * twinkle * 0.7;
        ctx.fillStyle = "#dff2ff";
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r * star.z, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };
}

function createScanlines(): OverlaySketch {
  return {
    draw(ctx, _dt, elapsed, width, height) {
      ctx.clearRect(0, 0, width, height);
      // Horizontal lines every 3px at low alpha — present but never legible as stripes.
      ctx.fillStyle = "rgba(180,220,240,0.05)";
      for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1);
      // A single soft sweep band travelling down the frame on a slow loop.
      const sweepY = ((elapsed * 0.12) % 1) * height;
      const band = ctx.createLinearGradient(0, sweepY - 60, 0, sweepY + 60);
      band.addColorStop(0, "rgba(120,240,208,0)");
      band.addColorStop(0.5, "rgba(120,240,208,0.06)");
      band.addColorStop(1, "rgba(120,240,208,0)");
      ctx.fillStyle = band;
      ctx.fillRect(0, sweepY - 60, width, 120);
    },
  };
}

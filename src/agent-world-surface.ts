/**
 * Generative surface sketches — the scene model's *in-world* 2D layer (Generative Surfaces / Wave
 * 15). Where `agent-world-overlay.ts` draws a Canvas2D sketch over the whole frame (screen-space),
 * this draws the same kind of sketch onto a bounded canvas that becomes a live `CanvasTexture` on
 * an entity's material — a screen, billboard or panel *in* the 3D world.
 *
 * Two rules carry over from §5, identical to the overlay's:
 *
 *  1. **One shared frame loop.** A surface never runs itself. The runtime calls `draw()` from its
 *     single per-frame pass (`updateSimulation`), in the same frame the scene simulates, so a
 *     surface advances with everything else and inherits pause/step for free.
 *  2. **It must earn its budget.** Off by default; each sketch is plain Canvas2D (not p5); each is
 *     written to clear-and-draw in a couple of milliseconds at 256², and the runtime throttles
 *     redraws to the surface's `fps` so a slow sign costs almost nothing.
 *
 * These are new hand-written sketches, not archive ports — labelled as such in the descriptors.
 * `id` is the scene-serialisable handle (`entity.surface.sketch`); it round-trips like `sky`.
 */

export type AgentWorldSurfaceSketchId = "waveform" | "grid-pulse" | "plasma";

export type AgentWorldSurfaceDescriptor = {
  id: AgentWorldSurfaceSketchId;
  label: string;
  description: string;
  /** Where the look comes from, honestly. None of these are ports. */
  provenance: string;
};

export const GRAPHYSX_AGENT_WORLD_SURFACES: readonly AgentWorldSurfaceDescriptor[] = [
  {
    id: "waveform",
    label: "Waveform",
    description: "A scrolling neon oscilloscope trace. Reads as a live signal on a monitor.",
    provenance: "New Canvas2D sketch. No archive source.",
  },
  {
    id: "grid-pulse",
    label: "Grid Pulse",
    description: "A perspective grid with a travelling pulse of light. Synthwave panel.",
    provenance: "New Canvas2D sketch. No archive source.",
  },
  {
    id: "plasma",
    label: "Plasma",
    description: "A classic sine-interference plasma field. Cheap, hypnotic, good for a portal.",
    provenance: "New Canvas2D sketch, inspired by the demoscene plasma effect.",
  },
];

export function isSurfaceSketchId(value: unknown): value is AgentWorldSurfaceSketchId {
  return typeof value === "string" && GRAPHYSX_AGENT_WORLD_SURFACES.some((surface) => surface.id === value);
}

/**
 * A mounted surface sketch. `draw` is called by the runtime's per-frame pass onto the surface's
 * own canvas context; `w`/`h` are the canvas pixel size, `elapsed` total seconds, `dt` the delta.
 * State (phase, scroll offset) lives in the closure — one instance per surface entity.
 */
export interface SurfaceSketch {
  draw(ctx: CanvasRenderingContext2D, dt: number, elapsed: number, w: number, h: number): void;
}

export function createSurfaceSketch(id: AgentWorldSurfaceSketchId): SurfaceSketch {
  switch (id) {
    case "waveform":
      return createWaveform();
    case "grid-pulse":
      return createGridPulse();
    case "plasma":
      return createPlasma();
  }
}

/** A scrolling oscilloscope: a bright trace over a dark panel, with a faint grid and trails. */
function createWaveform(): SurfaceSketch {
  return {
    draw(ctx, _dt, elapsed, w, h) {
      // Low-alpha wipe leaves a short motion trail rather than a hard clear.
      ctx.fillStyle = "rgba(4, 10, 16, 0.32)";
      ctx.fillRect(0, 0, w, h);

      // Faint reference grid.
      ctx.strokeStyle = "rgba(60, 120, 140, 0.18)";
      ctx.lineWidth = 1;
      const step = w / 8;
      ctx.beginPath();
      for (let x = 0; x <= w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = 0; y <= h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();

      // The trace: two summed sines scrolling in time, with a soft glow.
      ctx.strokeStyle = "#4fe3c8";
      ctx.shadowColor = "#4fe3c8";
      ctx.shadowBlur = 12;
      ctx.lineWidth = Math.max(2, w / 128);
      ctx.beginPath();
      const mid = h / 2;
      const amp = h * 0.3;
      for (let x = 0; x <= w; x += 2) {
        const t = x / w;
        const y = mid
          + Math.sin(t * Math.PI * 6 - elapsed * 3) * amp * 0.6
          + Math.sin(t * Math.PI * 13 + elapsed * 1.7) * amp * 0.4;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    },
  };
}

/** A perspective floor grid receding to a horizon, with a bright pulse travelling toward the viewer. */
function createGridPulse(): SurfaceSketch {
  return {
    draw(ctx, _dt, elapsed, w, h) {
      ctx.fillStyle = "#0a0618";
      ctx.fillRect(0, 0, w, h);
      const horizon = h * 0.42;
      // Sky glow.
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#160a2e");
      sky.addColorStop(1, "#3a1c5e");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, horizon);

      ctx.strokeStyle = "#ff4fd8";
      ctx.lineWidth = Math.max(1, w / 256);
      // Vanishing-point verticals.
      const vpx = w / 2;
      ctx.beginPath();
      for (let i = -6; i <= 6; i += 1) {
        ctx.moveTo(vpx + i * (w / 12), horizon);
        ctx.lineTo(vpx + i * (w / 2.2), h);
      }
      ctx.stroke();
      // Receding horizontals, scrolling toward the viewer; one line pulses bright.
      const scroll = (elapsed * 0.35) % 1;
      for (let i = 0; i < 12; i += 1) {
        const f = (i + scroll) / 12;
        const y = horizon + (h - horizon) * f * f;
        const pulse = Math.abs(((elapsed * 0.5) % 1) - f) < 0.04;
        ctx.strokeStyle = pulse ? "#ffffff" : "rgba(255, 79, 216, 0.7)";
        ctx.lineWidth = pulse ? Math.max(2, w / 128) : Math.max(1, w / 256);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    },
  };
}

/** A sine-interference plasma field. Coarse cell size keeps it a couple of ms even at 256². */
function createPlasma(): SurfaceSketch {
  return {
    draw(ctx, _dt, elapsed, w, h) {
      const cell = Math.max(4, Math.floor(w / 48));
      for (let y = 0; y < h; y += cell) {
        for (let x = 0; x < w; x += cell) {
          const v =
            Math.sin(x / 32 + elapsed) +
            Math.sin(y / 24 - elapsed * 0.8) +
            Math.sin((x + y) / 40 + elapsed * 1.3) +
            Math.sin(Math.hypot(x - w / 2, y - h / 2) / 30 - elapsed * 1.6);
          const hue = ((v + 4) / 8) * 360;
          ctx.fillStyle = `hsl(${hue.toFixed(0)}, 80%, 55%)`;
          ctx.fillRect(x, y, cell, cell);
        }
      }
    },
  };
}

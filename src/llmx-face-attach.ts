/**
 * Dev-only bridge: put the real voxel face into the Forge harness, replacing its stand-in.
 *
 * The harness (`llmx-preview.ts`) is owned by the session building the Forge and exposes
 * `window.__LLMX_PREVIEW__.attachFace(rig)` precisely so the face can be developed against it
 * without either side editing the other's files. This module is the whole of my side of that
 * seam, and like the harness it is never a build input.
 *
 * Everything the harness drives is a SIMULATION — no conversation, no audio, no agent.
 */

import { AgentWorldVoxelFace } from "./agent-world-face";
import { resolveAgentWorldFace } from "./llmx-face-pose";

type Harness = { attachFace: (rig: unknown) => void };

const rig = new AgentWorldVoxelFace(resolveAgentWorldFace({ level: "high" }));

// `?face=mobile|balanced|high` caps the rendered density the way the host's render profile
// will, so the reduced profile can be looked at without re-authoring the world.
const ceiling = new URLSearchParams(window.location.search).get("face");
if (ceiling === "mobile" || ceiling === "balanced" || ceiling === "high") rig.setQualityCeiling(ceiling);

const attach = (): void => {
  const harness = (window as unknown as { __LLMX_PREVIEW__?: Harness }).__LLMX_PREVIEW__;
  if (!harness) {
    // The harness module may not have run yet; retry on the next task rather than racing it.
    setTimeout(attach, 30);
    return;
  }
  harness.attachFace(rig);
  // Dev-only handle, so a live level swap and a dispose can be exercised from the console.
  // The real application reaches the rig through `findVoxelFace(entityObject)`.
  (window as unknown as { __LLMX_FACE__?: unknown }).__LLMX_FACE__ = rig;
  console.info("[llmx] real voxel face attached:", rig.describe());
};

attach();

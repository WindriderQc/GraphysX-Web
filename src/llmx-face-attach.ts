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

const attach = (): void => {
  const harness = (window as unknown as { __LLMX_PREVIEW__?: Harness }).__LLMX_PREVIEW__;
  if (!harness) {
    // The harness module may not have run yet; retry on the next task rather than racing it.
    setTimeout(attach, 30);
    return;
  }
  harness.attachFace(rig);
  console.info("[llmx] real voxel face attached:", rig.describe());
};

attach();

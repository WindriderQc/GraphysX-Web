---
name: graphysx
description: Use GraphysX to create, inspect, edit, simulate and visually verify interactive 3D scenes, mathematical demonstrations, lighting, particles and reusable objects. Connect to an existing local world or prepare a separate scene using its MCP tools. Use the repository workflow instead for changes to GraphysX source code itself.
---

# GraphysX

The `graphysx` MCP server connects to the actual browser world. Codex and Claude Code use the same tools, native API, stable entity IDs and revision line. No AgentX inference is required to author a scene.

- Call `worlds` and match the user's tab by URL and world label. Do not guess a tab ID or replace a world when the user requested a new one. A world id is the tab's relay connection: if a tab reconnects (preview restarted, tab was asleep) it reappears under a new id, so on `World unavailable` call `worlds` again rather than giving up.
- For an existing local tab, preserve any pending work, add `agentBridge=1` to its URL and reload. For a separate scene, call `new_world`, open its returned URL using the available browser tool or the client's normal OS URL launcher, then call `worlds`. The returned URL alone is not a connected scene. The local preview starts on demand if absent; a public URL does not grant access to its tab.
- Start with `observe` for a compact summary; `loaded: false` means the tab has no scene yet, so load or create one before editing. Fetch matching entities with `read` / `query`; use `catalog` with a narrow search to discover capabilities. Fetch full JSON through `read` / `exportDocument` when needed for persistence or complete structure, not on every turn.
- Call `edit` with the observed revision and exact positional native API arguments. Prefer an actor-attributed native `commit` for related edits; `transaction` is atomic too. Re-observe conflicts and reconsider the change. After a timeout, inspect history/state before retrying: an edit may already have applied.
- Coordinates are right-handed, +y up. A box position is its centre: bottom = centreY - height/2. Set explicit dimensions/scale for stacks. Reuse existing IDs for updates and existing catalogue IDs for assets.
- Use `camera` to frame the subject (no revision needed; framing does not change the scene), then `capture` and inspect the returned image. It is the actual 3D canvas, including the face inset; use the browser's screenshot for surrounding UI. A success receipt alone does not prove a good visual result.
- Save requested work with the native `save` method or export a portable document. Named saves live in this browser's local storage. The MCP relay does not persist scenes independently.

All callable native methods are discoverable. Read the MCP resource `graphysx://world-api` from server `graphysx` for concrete argument shapes and examples, or search `AGENT_WORLD_API.md` when working inside the repository. Never pass JavaScript source as a tool request. Keep unrelated scenes and the LLMx face/decor intact unless the user asks to change them.

If the tools are missing after installation, reload the MCP servers in the client or start a new client session. Existing work need not be interrupted. A saved configuration, a successful MCP protocol test, and a real model using the tools are distinct results.

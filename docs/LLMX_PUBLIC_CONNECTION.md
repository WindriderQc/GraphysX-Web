# Public GraphysX and private AgentX

The static GraphysX release uses `VITE_LLMX_AGENTX_ORIGIN=https://agentx.specialblend.icu` at build time. This existing DNS-only hostname resolves to the owner's LAN service with trusted HTTPS. GraphysX does not publish AgentX, relay private traffic through the public VM, or add another conversation service.

The browser sends LLMx personal/Family session requests and VoiX transcription/synthesis directly to their existing routes. `server/llmx-target.mjs` defines the same destinations for the development relay and the public client. Streaming bodies and cancellation signals pass through unchanged. The browser loads Household's existing voice scripts; Household 1.58.4 resolves its microphone worklet beside the loaded script, including when the page has a different origin.

Without the build setting, development retains `/llmx-api` and `LLMX_HOUSEHOLD_URL`. The public workflow supplies the setting explicitly. No runtime URL query parameter selects an agent destination.

Open `https://graphysx.specialblend.ca/?app=llmx` while connected to the home network. Away from that network the 3D room still opens, but its private agent is unavailable. Browser local-network and microphone permission prompts remain browser-owned. Environments and the remembered session are stored per browser origin: localhost saves are preserved, and are not automatically copied to the public domain.

Release acceptance must distinguish the normal isolated CI fixtures, the configured production build, and a real browser on the LAN using the public hostname. A successful public HTTP response alone does not prove voice, inference or scene manipulation.

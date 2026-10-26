# Public GraphysX and private AgentX

The static GraphysX release uses `VITE_LLMX_AGENTX_ORIGIN` to link to the owner's existing HTTPS Core origin. Its Forge works locally, and **Ouvrir Nestor sur le réseau de la maison** opens `/llmx` there (`?profile=family` for Family). The public page makes no private conversation request. Browser local-network permissions, CORS and cross-site POST guards cannot be qualified by a successful command-line GET.

Core hosts the existing Forge through the self-contained `/embed/llmx-room.js` module, published beside `/embed/llmx-face.js`. Core derives that sibling from its existing `HOUSEHOLD_AVATAR_MODULE_URL`, relays the module and bounded graphical assets, and keeps its private gateway, CSP and Family-device restriction. No credential, CORS exception, general proxy or additional service is introduced. The Core build maps `server/llmx-target.mjs` directly to the existing same-origin personal/Family consumer and VoiX routes. Streaming and cancellation keep their existing implementation.

Without the build setting, development retains `/llmx-api` and `LLMX_HOUSEHOLD_URL`. The public workflow supplies the setting explicitly. No runtime URL query parameter selects an agent destination.

The Core page runs on the LAN. A Family-pinned browser can open only `/llmx?profile=family` and the Family consumer; switching the UI to personal does not bypass the server restriction. Microphone permissions remain browser-owned. Environments and remembered sessions stay per origin: the public, localhost and Core libraries are distinct. Moving the conversation does not silently copy or delete a public scene or session.

Run `scripts/smoke-llmx-core-embed.mjs` after the release build for the packaged personal/Family module, text, scoped native URLs, retained pin cookie, graphics and mobile. AgentX verifies its actual page, module/asset relays and Family-device middleware separately. The public build must show the Core entry without private requests. Installed source/module hashes, a native turn on the LAN and microphone/device acceptance remain separate checks.

// The bundled world (world-service/dist/world.js): rules and simulation, no I/O.
export { IslandWorld, InputError, validateInput, TICK_HZ, SNAPSHOT_FORMAT, MESA_WORLD_ID, WORLD_IDS } from "./island-world";
export type { WorldSnapshot, ActionInput, ActionRecord, EntityChange } from "./island-world";
export { LIVING_WORLD_ID, livingApiMarkdown } from "./living-island";
export { setAgentWorldAssetFetch } from "../src/agent-world-assets";
// Exposed for hosts and tests that drive the scene runtime directly.
export { AgentWorldRuntime, AGENT_WORLD_HOST_GROUND_ID } from "../src/agent-world-runtime";
export { GRAPHYSX_AGENT_WORLD_STARTERS } from "../src/agent-world-starters";
export { RapierPhysicsEngine } from "../src/physics/rapier-physics-engine";

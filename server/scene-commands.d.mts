import type { AgentWorldCommand, AgentWorldDefinition } from "../src/agent-world-runtime";

export function validateStoredSceneDefinition(definition: unknown): void;
export function applyCommands(definition: AgentWorldDefinition, commands: AgentWorldCommand[]): {
  definition: AgentWorldDefinition;
  outputs: unknown[];
};

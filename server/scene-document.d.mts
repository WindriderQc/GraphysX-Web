export const WORLD_SCHEMA: "graphysx.agent-world/v2";
export const WORLD_ENTITY_TYPES: readonly string[];
export function assertWorldDefinition(definition: unknown): void;
export function assertRulesDefinition(rules: unknown, knownIds: ReadonlySet<string>): void;

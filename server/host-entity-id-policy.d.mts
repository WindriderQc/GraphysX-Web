export const HOST_ONLY_ENTITY_ID_PREFIXES: readonly string[];

export type HostOnlyEntityIdViolation = {
  id: string;
  path: string;
  prefix: string;
};

export function hostOnlyEntityIdPrefix(value: unknown): string | null;
export function findHostOnlyEntityIdInWorld(definition: unknown): HostOnlyEntityIdViolation | null;
export function findHostOnlyEntityIdInCommand(command: unknown): HostOnlyEntityIdViolation | null;
export function assertAuthoredWorldEntityNamespaces(definition: unknown): void;
export function assertAuthoredSceneCommandNamespaces(command: unknown): void;

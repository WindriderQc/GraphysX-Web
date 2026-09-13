export type AgentAppearance = {
  kind: "voxel-face";
  asset: "forge-mask";
  palette: "forge";
  seed?: number;
};
export function resolveAgentAppearance(value: unknown, entityType?: string): Required<AgentAppearance> | null;

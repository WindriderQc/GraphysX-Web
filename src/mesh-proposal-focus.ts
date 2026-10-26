import type { AgentWorldEntityDefinition, AgentWorldInlineMesh, AgentWorldMaterial } from './agent-world-runtime';

/** Details of one explicitly shared mesh, never the scene or behavior/private metadata. */
export const MESH_FOCUS_BYTES = 16 * 1024;
export type MeshProposalFocus = {
  id: string; type: 'mesh'; label: string; vertexCount: number; triangleCount: number; complete: boolean;
  transform?: AgentWorldEntityDefinition['transform'];
  mesh?: AgentWorldInlineMesh;
  material?: Partial<AgentWorldMaterial>;
};
export function meshProposalFocus(entity: AgentWorldEntityDefinition): MeshProposalFocus | undefined {
  if(entity.type !== 'mesh' || !entity.mesh || !entity.id) return undefined;
  const summary: MeshProposalFocus = { id: entity.id, type: 'mesh', label: entity.label ?? entity.id,
    vertexCount: entity.mesh.positions.length / 3, triangleCount: entity.mesh.indices.length / 3,
    complete: false, ...(entity.transform ? { transform: structuredClone(entity.transform) } : {}) };
  const full: MeshProposalFocus = { ...summary, complete: true, mesh: structuredClone(entity.mesh),
    ...(entity.material ? { material: structuredClone(entity.material) } : {}) };
  return new TextEncoder().encode(JSON.stringify(full)).byteLength <= MESH_FOCUS_BYTES ? full : summary;
}

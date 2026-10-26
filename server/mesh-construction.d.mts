import type { AgentWorldInlineMesh } from '../src/agent-world-runtime';
export type MeshConstruction =
  | { kind: 'extrude'; profile: number[][]; depth: number }
  | { kind: 'revolve'; profile: number[][]; segments?: number; angleDegrees?: number }
  | { kind: 'sweep'; profile: number[][]; path: number[][] };
export const CONSTRUCTION_LIMITS: Readonly<{ profilePoints: number; pathPoints: number; segments: number }>;
export const CONSTRUCTION_FIELDS: Readonly<Record<string, readonly string[]>>;
export function buildInlineMesh(recipe: MeshConstruction): AgentWorldInlineMesh;

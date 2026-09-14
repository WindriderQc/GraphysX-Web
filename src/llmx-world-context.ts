import type { GraphysXAgentWorldApi } from './agent-world-runtime';

/** Current world data only. Keep the full ID index, then spend detail on requested/selected objects. */
export function llmxWorldContext(api: GraphysXAgentWorldApi, request = '', mathVisible = false) {
  const world = api.exportDocument();
  if (!world) return {};
  const state = api.state();
  const selected = state?.selectedIds ?? [];
  const liveEntities = new Map(state?.entities.map(entity => [entity.id, entity]) ?? []);
  const words = request.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9-]+/).filter(word => word.length > 3);
  const score = (entity: typeof world.entities[number]) => {
    const name = `${entity.id} ${entity.label ?? ''} ${(entity.tags ?? []).join(' ')}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return (selected.includes(entity.id!) ? 100 : 0) + words.filter(word => name.includes(word)).length * 20
      + (entity.tags?.includes('llmx-creation') ? 5 : 0) + (entity.type.includes('light') ? 2 : 0);
  };
  const observed = world.entities.filter(entity => !entity.id?.startsWith('llmx-created-math-') && (entity.id !== 'llmx-created-math' || mathVisible));
  const details = [...observed].sort((a, b) => score(b) - score(a)).slice(0, 32).map(entity => {
    // Large geometry/height fields are scene assets, not useful conversational context.
    const { appearance: _appearance, ...detail } = entity;
    if (detail.terrain?.heights) detail.terrain = { ...detail.terrain, heights: undefined };
    const live = liveEntities.get(entity.id!);
    return { ...detail, ...(live ? { runtime: { position: live.position, visible: live.visible,
      ...(live.physics ? { linearVelocity: live.physics.linearVelocity, angularVelocity: live.physics.angularVelocity, sleeping: live.physics.sleeping } : {}),
      ...(live.occupants ? { occupants: live.occupants } : {}) } } : {}) };
  }).filter(detail => JSON.stringify(detail).length < 5000);
  const catalogs = Object.fromEntries((['assets', 'sounds', 'textures', 'skies', 'hdris', 'emitters', 'heightmaps', 'flocks', 'crowds', 'forceFields', 'formulas', 'dna', 'surfaces'] as const)
    .map(key => [key, api[key]().map(entry => entry.id)]));
  return {
    selectedEntityIds: selected.slice(0, 8),
    entities: observed.map(entity => ({
      id: entity.id!, type: entity.type, ...(entity.label ? { name: entity.label.slice(0, 120) } : {}),
      ...(entity.transform?.position ? { position: entity.transform.position } : {}),
    })),
    world: { settings: world.environment ?? {}, details, catalogs, joints: world.joints ?? [],
      coordinates: 'Authored transform positions are local to parentId when parented; +Y up; rotations in degrees. detail.runtime is read-only live simulation data: its position is in WORLD coordinates and velocities are current. Never copy runtime into commands. buildZone is a suggested workshop only. All authored scene entities are editable.' },
  };
}

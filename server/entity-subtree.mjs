/** Returns the root followed by its descendants in command removal order. */
export function entitySubtreeIds(entities, rootId) {
  const ids = new Set([rootId]);
  let previousSize;
  do {
    previousSize = ids.size;
    for (const { id, parentId } of entities) {
      if (ids.has(parentId)) ids.add(id);
    }
  } while (ids.size > previousSize);
  return ids;
}
